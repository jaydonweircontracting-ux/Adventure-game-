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
// 5 MB, at most 50 entries, each extracted file at most 5 MB (the
// BUILD 1044 per-file cap). A bad entry never fails the whole ZIP —
// it is reported and the rest still import. A structurally broken
// ZIP (no central directory) throws, and the caller shows that as
// one message.

import { MAX_FILE_BYTES, parseGlbUpload, parseGltfUpload, parseObjUpload, type GlbUploadResult } from './customAssets';

/** One ZIP file, at most 5 MB. */
export const MAX_ZIP_BYTES = 5_000_000;
/** At most 50 entries per ZIP (a pack, not an archive dump). */
export const MAX_ZIP_ENTRIES = 50;
/** BUILD 1046: a single entry may expand to at most 100× its
 *  compressed size. A real model compresses a few times at most;
 *  a 10,000× entry is a ZIP bomb, not a model. Checked on the
 *  central-directory sizes BEFORE inflating, so the expansion
 *  never even gets allocated. */
export const MAX_EXPANSION_RATIO = 100;
/** BUILD 1046: the whole ZIP may expand to at most 50 MB in
 *  total (the 1044 library cap) — 50 entries × 5 MB each would
 *  otherwise be 250 MB of allocations from a 5 MB file. */
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 50_000_000;
/** BUILD 1046: the manifest file an exported asset pack carries
 *  (assetPack.ts). It is not a model; the reader reports it in the
 *  result so the hub can say the ZIP is a pack, instead of
 *  counting it as a skipped file. */
export const PACK_MANIFEST_NAME = 'ashfall-asset-pack.json';

/** BUILD 1046: why an entry path is unsafe, or null when it is
 *  safe. Rejected: empty names, NUL bytes, absolute paths
 *  (`/x`, `\x`), Windows drive letters (`C:\x`, `C:/x`), and any
 *  `..` segment — a path that escapes the ZIP's own folder. The
 *  reader never writes to disk, but an entry name still becomes a
 *  file name in messages and in a re-exported pack, so a traversal
 *  name is skipped with its reason instead of being trusted. */
export function zipPathProblem(name: string): string | null {
  if (name.length === 0) return 'empty file name';
  if (name.includes('\0')) return 'unsafe path (contains a NUL byte)';
  if (name.startsWith('/') || name.startsWith('\\')) return 'unsafe path (absolute path)';
  if (/^[A-Za-z]:/.test(name)) return 'unsafe path (drive letter)';
  for (const seg of name.split(/[\\/]/)) {
    if (seg === '..') return 'unsafe path (escapes the folder with "..")';
  }
  return null;
}

export interface ZipModelResult {
  /** Entry path inside the ZIP. */
  name: string;
  /** The parser's verdict for this model (ok or a reason). */
  result: GlbUploadResult;
}

export interface ZipPackManifest {
  /** The manifest entry's path (always ashfall-asset-pack.json). */
  name: string;
  /** How many models the manifest lists. */
  assetCount: number;
  /** The manifest's exportedAt stamp, or '' when it has none. */
  exportedAt: string;
}

export interface ZipImportResult {
  /** Every model entry found, parsed or failed, in ZIP order. */
  models: ZipModelResult[];
  /** Entries that were not models (or were over a cap): name + why. */
  skipped: Array<{ name: string; reason: string }>;
  /** BUILD 1046: the pack manifest, when this ZIP is an exported
   *  asset pack — so the hub can say so instead of treating the
   *  manifest as a skipped file. */
  packManifest?: ZipPackManifest | null;
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
  const result: ZipImportResult = { models: [], skipped: [], packManifest: null };
  // BUILD 1046: every extracted file, by its full entry path — a
  // .gltf's .bin (or a texture it names) may sit in a subfolder,
  // so the parsers resolve dependencies against the whole ZIP,
  // relative to the .gltf's own directory.
  const allFiles = new Map<string, ArrayBuffer>();
  // First pass: extract every entry's raw bytes (needed so a .bin
  // later in the ZIP still serves a .gltf earlier in it).
  const extracted = new Map<string, Uint8Array>();
  // BUILD 1046: which central-directory entries actually
  // extracted, by index — the second pass must only parse those.
  // (Names alone cannot tell them apart: two entries may share a
  // name, and the second one is skipped while the first imports.)
  const extractedIdx = new Set<number>();
  // BUILD 1046: the whole ZIP's declared uncompressed size, before
  // any entry is inflated — a 5 MB ZIP must never expand into
  // hundreds of megabytes of allocations.
  let totalUncompressed = 0;
  for (const e of entries) totalUncompressed += e.size;
  if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new Error('ZIP would expand to over 50 MB (' + (totalUncompressed / 1_000_000).toFixed(1) + ' MB) — rejected');
  }
  for (let ei = 0; ei < entries.length; ei++) {
    const e = entries[ei];
    const base = e.name.split('/').pop() || e.name;
    if (e.name.endsWith('/') || e.name.startsWith('__MACOSX/') || base.startsWith('.')) {
      result.skipped.push({ name: e.name, reason: 'not a file' });
      continue;
    }
    // BUILD 1046: traversal / absolute / drive-letter paths are
    // skipped with their reason — a bad entry never aborts the
    // whole import, and the name is never trusted downstream.
    const pathProblem = zipPathProblem(e.name);
    if (pathProblem) {
      result.skipped.push({ name: e.name, reason: pathProblem });
      continue;
    }
    // BUILD 1046: two entries with the same path — the second one
    // is skipped, so a later entry can never silently replace an
    // earlier one.
    if (extracted.has(e.name)) {
      result.skipped.push({ name: e.name, reason: 'duplicate entry (an earlier entry has the same name)' });
      continue;
    }
    if (e.size > MAX_FILE_BYTES) {
      result.skipped.push({ name: e.name, reason: 'over 5 MB' });
      continue;
    }
    // BUILD 1046: expansion ratio, on declared sizes before
    // inflating — a tiny compressed entry claiming megabytes of
    // output is a ZIP bomb, not a model.
    if (e.size > MAX_EXPANSION_RATIO * Math.max(e.compSize, 1)) {
      result.skipped.push({ name: e.name, reason: 'expands ' + Math.round(e.size / Math.max(e.compSize, 1)) + '× its compressed size — rejected as a possible ZIP bomb' });
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
    extractedIdx.add(ei);
    allFiles.set(e.name, toArrayBuffer(raw));
    // Basename key too (first wins): a .gltf that names just
    // `mesh.bin` still finds it when it sits in a subfolder, and a
    // flat file pick is keyed by name alone. Exact paths always
    // win — the resolver tries the full path first.
    if (!allFiles.has(base)) allFiles.set(base, toArrayBuffer(raw));
  }
  // Second pass: parse the models, in ZIP order. Dependencies
  // resolve against the whole ZIP, relative to each model's own
  // directory (BUILD 1046) — a .gltf in `models/` finds its .bin
  // in `models/` or `models/data/`, not just at the ZIP root.
  // BUILD 1046: when the ZIP is an exported pack, the manifest
  // (parsed below, wherever it sits in the ZIP) restores each
  // model's display name, category, and tags — the pack file names
  // are sanitized (spaces become dashes), so without the manifest
  // a round-trip would silently rename every model.
  let manifestRows: Array<{ file: string; name: string; category: string; tags: string[] }> | null = null;
  for (let ei = 0; ei < entries.length; ei++) {
    if (!extractedIdx.has(ei)) continue;
    const e = entries[ei];
    const raw = extracted.get(e.name);
    if (!raw) continue;
    const lower = e.name.toLowerCase();
    const base = e.name.split('/').pop() || e.name;
    const dir = e.name.includes('/') ? e.name.slice(0, e.name.lastIndexOf('/')) : '';
    if (lower.endsWith('.glb')) {
      result.models.push({ name: e.name, result: parseGlbUpload(toArrayBuffer(raw), base, allFiles, dir) });
    } else if (lower.endsWith('.gltf')) {
      const text = new TextDecoder().decode(raw);
      result.models.push({ name: e.name, result: parseGltfUpload(text, base, allFiles, dir) });
    } else if (lower.endsWith('.obj')) {
      const text = new TextDecoder().decode(raw);
      result.models.push({ name: e.name, result: parseObjUpload(text, base) });
    } else if (base === PACK_MANIFEST_NAME) {
      // BUILD 1046: an exported pack's manifest — parsed for its
      // model count so the hub can name the pack, and for its rows
      // so the models get their real names back (see below); a
      // damaged manifest never fails the models around it.
      try {
        const m = JSON.parse(new TextDecoder().decode(raw)) as { assets?: Array<Record<string, unknown>>; exportedAt?: unknown };
        if (m && Array.isArray(m.assets)) {
          result.packManifest = {
            name: e.name,
            assetCount: m.assets.length,
            exportedAt: typeof m.exportedAt === 'string' ? m.exportedAt : '',
          };
          manifestRows = m.assets
            .filter((a) => typeof a.file === 'string' && typeof a.name === 'string')
            .map((a) => ({
              file: a.file as string,
              name: a.name as string,
              category: typeof a.category === 'string' ? a.category : 'Unsorted',
              tags: Array.isArray(a.tags) ? (a.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
            }));
        }
      } catch { /* the manifest is informational only */ }
    } else if (!lower.endsWith('.bin')) {
      result.skipped.push({ name: e.name, reason: 'not a model file (.glb, .gltf, or .obj)' });
    }
  }
  if (manifestRows) {
    const byFile = new Map(manifestRows.map((r) => [r.file, r]));
    for (const m of result.models) {
      const row = byFile.get(m.name);
      if (row && m.result.ok) {
        m.result.asset.name = row.name;
        m.result.asset.category = row.category;
        m.result.asset.tags = row.tags;
      }
    }
  }
  return result;
}

// ---- ZIP writing (BUILD 1046: export/backup). A hand-written
// Stored (method 0, no compression) writer — the mirror of the
// reader above, same CRC32, no new dependency. Only used for the
// asset-pack export: the models are already small, and Stored
// keeps the writer trivially correct. Throws on an unsafe or
// duplicate entry name, so a bad pack name fails loudly at build
// time instead of writing a ZIP that cannot be read back. ----

export interface ZipArchiveEntry {
  name: string;
  data: Uint8Array;
}

export function writeZipArchive(entries: ZipArchiveEntry[]): Uint8Array {
  const seen = new Set<string>();
  for (const e of entries) {
    const problem = zipPathProblem(e.name);
    if (problem) throw new Error('cannot write "' + e.name + '" into a ZIP: ' + problem);
    if (seen.has(e.name)) throw new Error('duplicate entry name in ZIP: "' + e.name + '"');
    seen.add(e.name);
  }
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((Math.floor(now.getSeconds() / 2)) & 0x1f);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0xf) << 5) | (now.getDate() & 0x1f);
  const nameBytes = entries.map((e) => new TextEncoder().encode(e.name));
  let total = 0;
  for (let i = 0; i < entries.length; i++) total += 30 + nameBytes[i].length + entries[i].data.length;
  for (let i = 0; i < entries.length; i++) total += 46 + nameBytes[i].length;
  total += 22;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  const offsets: number[] = [];
  let p = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const nb = nameBytes[i];
    offsets.push(p);
    dv.setUint32(p, LOCAL_SIG, true);
    dv.setUint16(p + 4, 20, true); // version needed
    dv.setUint16(p + 6, 0x0800, true); // UTF-8 file names
    dv.setUint16(p + 8, 0, true); // Stored
    dv.setUint16(p + 10, dosTime, true);
    dv.setUint16(p + 12, dosDate, true);
    dv.setUint32(p + 14, crc32(e.data), true);
    dv.setUint32(p + 18, e.data.length, true);
    dv.setUint32(p + 22, e.data.length, true);
    dv.setUint16(p + 26, nb.length, true);
    dv.setUint16(p + 28, 0, true);
    out.set(nb, p + 30);
    out.set(e.data, p + 30 + nb.length);
    p += 30 + nb.length + e.data.length;
  }
  const cdStart = p;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const nb = nameBytes[i];
    dv.setUint32(p, CENTRAL_SIG, true);
    dv.setUint16(p + 4, 20, true); // version made by
    dv.setUint16(p + 6, 20, true); // version needed
    dv.setUint16(p + 8, 0x0800, true); // UTF-8 file names
    dv.setUint16(p + 10, 0, true); // Stored
    dv.setUint16(p + 12, dosTime, true);
    dv.setUint16(p + 14, dosDate, true);
    dv.setUint32(p + 16, crc32(e.data), true);
    dv.setUint32(p + 20, e.data.length, true);
    dv.setUint32(p + 24, e.data.length, true);
    dv.setUint16(p + 28, nb.length, true);
    dv.setUint16(p + 30, 0, true);
    dv.setUint16(p + 32, 0, true);
    dv.setUint16(p + 34, 0, true);
    dv.setUint16(p + 36, 0, true);
    dv.setUint32(p + 38, 0, true);
    dv.setUint32(p + 42, offsets[i], true);
    out.set(nb, p + 46);
    p += 46 + nb.length;
  }
  const cdSize = p - cdStart;
  dv.setUint32(p, EOCD_SIG, true);
  dv.setUint16(p + 4, 0, true);
  dv.setUint16(p + 6, 0, true);
  dv.setUint16(p + 8, entries.length, true);
  dv.setUint16(p + 10, entries.length, true);
  dv.setUint32(p + 12, cdSize, true);
  dv.setUint32(p + 16, cdStart, true);
  dv.setUint16(p + 20, 0, true);
  return out;
}
