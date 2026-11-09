// BUILD 1043 — Import Hub Stage 1: ZIP upload. A small hand-written
// ZIP reader (no new dependency — package.json has no ZIP library,
// and adding one for this alone would be heavy). It reads the central
// directory, extracts entries, and hands each model file to the same
// parsers the single-file upload uses (customAssets.ts), so a model
// from a ZIP is identical to the same model uploaded on its own.
//
// Supported, stated plainly:
// - Stored (method 0) and Deflate (method 8) entries. Deflate uses
//   the platform DecompressionStream ('deflate-raw'); on a browser
//   too old to have it, deflated entries fail with a clear message
//   while stored entries still work.
// - .glb, .gltf, and .obj entries; a .gltf with an external .bin
//   works when the .bin is in the same ZIP (matched by file name,
//   then basename).
// - CRC32 is verified per entry; a mismatch fails that entry only.
//
// Caps (same spirit as the 997 library caps): the ZIP itself at most
// 5 MB, at most 50 entries, each extracted file at most 1 MB. A bad
// entry never fails the whole ZIP — it is reported and the rest
// still import. A structurally broken ZIP (no central directory)
// throws, and the caller shows that as one message.

import { MAX_FILE_BYTES, parseGlbUpload, parseGltfUpload, parseObjUpload, type GlbUploadResult } from './customAssets';

/** One ZIP file, at most 5 MB. */
export const MAX_ZIP_BYTES = 5_000_000;
/** At most 50 entries per ZIP (a pack, not an archive dump). */
export const MAX_ZIP_ENTRIES = 50;

export interface ZipModelResult {
  /** Entry path inside the ZIP. */
  name: string;
  /** The parser's verdict for this model (ok or a reason). */
  result: GlbUploadResult;
}

export interface ZipImportResult {
  /** Every model entry found, parsed or failed, in ZIP order. */
  models: ZipModelResult[];
  /** Entries that were not models (or were over a cap): name + why. */
  skipped: Array<{ name: string; reason: string }>;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Copy a view's bytes into a fresh ArrayBuffer (`.buffer.slice`
 *  types as ArrayBuffer | SharedArrayBuffer under the current lib). */
function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.slice().buffer as ArrayBuffer;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new Error('deflate is not supported in this browser');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS('deflate-raw'));
  const out = await new Response(stream).arrayBuffer();
  return new Uint8Array(out);
}

interface CentralEntry {
  name: string;
  method: number;
  crc: number;
  compSize: number;
  size: number;
  localOff: number;
}

export async function parseZipUpload(buf: ArrayBuffer): Promise<ZipImportResult> {
  if (buf.byteLength > MAX_ZIP_BYTES) {
    throw new Error('ZIP is over 5 MB');
  }
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  // Find the End Of Central Directory record (last 64 KB + 22).
  let eocd = -1;
  const scanStart = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= scanStart; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP file (no central directory found)');
  const totalEntries = view.getUint16(eocd + 10, true);
  const cdOff = view.getUint32(eocd + 16, true);
  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new Error('ZIP has too many entries (' + totalEntries + ' > ' + MAX_ZIP_ENTRIES + ')');
  }
  const entries: CentralEntry[] = [];
  let p = cdOff;
  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CENTRAL_SIG) {
      throw new Error('ZIP central directory is damaged');
    }
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, crc, compSize, size, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const result: ZipImportResult = { models: [], skipped: [] };
  const binFiles = new Map<string, ArrayBuffer>();
  // First pass: extract every entry's raw bytes (needed so a .bin
  // later in the ZIP still serves a .gltf earlier in it).
  const extracted = new Map<string, Uint8Array>();
  for (const e of entries) {
    const base = e.name.split('/').pop() || e.name;
    if (e.name.endsWith('/') || e.name.startsWith('__MACOSX/') || base.startsWith('.')) {
      result.skipped.push({ name: e.name, reason: 'not a file' });
      continue;
    }
    if (e.size > MAX_FILE_BYTES) {
      result.skipped.push({ name: e.name, reason: 'over 1 MB' });
      continue;
    }
    if (e.localOff + 30 > bytes.length || view.getUint32(e.localOff, true) !== LOCAL_SIG) {
      result.skipped.push({ name: e.name, reason: 'local header is damaged' });
      continue;
    }
    const nameLen = view.getUint16(e.localOff + 26, true);
    const extraLen = view.getUint16(e.localOff + 28, true);
    const dataStart = e.localOff + 30 + nameLen + extraLen;
    if (dataStart + e.compSize > bytes.length) {
      result.skipped.push({ name: e.name, reason: 'entry runs past the end of the ZIP' });
      continue;
    }
    const comp = bytes.subarray(dataStart, dataStart + e.compSize);
    let raw: Uint8Array;
    try {
      if (e.method === 0) raw = comp.slice();
      else if (e.method === 8) raw = await inflateRaw(comp);
      else {
        result.skipped.push({ name: e.name, reason: 'compression method ' + e.method + ' is not supported' });
        continue;
      }
    } catch (err) {
      result.skipped.push({ name: e.name, reason: 'could not decompress (' + (err instanceof Error ? err.message : 'unknown error') + ')' });
      continue;
    }
    if (raw.length !== e.size) {
      result.skipped.push({ name: e.name, reason: 'size mismatch after extraction' });
      continue;
    }
    if (crc32(raw) !== e.crc) {
      result.skipped.push({ name: e.name, reason: 'CRC check failed (file may be damaged)' });
      continue;
    }
    extracted.set(e.name, raw);
    if (/\.bin$/i.test(e.name)) {
      binFiles.set(e.name, toArrayBuffer(raw));
      binFiles.set(base, toArrayBuffer(raw));
    }
  }
  // Second pass: parse the models, in ZIP order.
  for (const e of entries) {
    const raw = extracted.get(e.name);
    if (!raw) continue;
    const lower = e.name.toLowerCase();
    const base = e.name.split('/').pop() || e.name;
    if (lower.endsWith('.glb')) {
      result.models.push({ name: e.name, result: parseGlbUpload(toArrayBuffer(raw), base) });
    } else if (lower.endsWith('.gltf')) {
      const text = new TextDecoder().decode(raw);
      result.models.push({ name: e.name, result: parseGltfUpload(text, base, binFiles) });
    } else if (lower.endsWith('.obj')) {
      const text = new TextDecoder().decode(raw);
      result.models.push({ name: e.name, result: parseObjUpload(text, base) });
    } else if (!lower.endsWith('.bin')) {
      result.skipped.push({ name: e.name, reason: 'not a model file (.glb, .gltf, or .obj)' });
    }
  }
  return result;
}
