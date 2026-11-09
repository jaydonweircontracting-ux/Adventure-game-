// BUILD 997 — custom GLB uploads for the 3D mode Build tool. Pure
// module: no React, no WebGL. The 3D view owns the UI; this file owns
// the upload rules so they can be asserted standalone.
//
// What an upload IS here, stated plainly: the 3D renderer draws
// vertex-colour triangles only (positions + RGB — no textures, no
// normals, no materials, no skeletal animation; see the 983 town-look
// comment in Engine3DWorldView). A GLB upload therefore becomes a
// static triangle mesh in that format, nothing more:
// - Geometry: every mesh primitive in the file (scene graph TRS
//   applied, like the 985 grass bake — but client-side, in the
//   browser, with no three.js dependency, reusing the bake script's
//   direct-GLB approach: header + JSON chunk + BIN chunk).
// - Colour: per-vertex COLOR_0 wins; else the primitive material's
//   baseColorFactor; else a flat stone-grey default. Textures are
//   IGNORED (the renderer cannot show them) and animations are
//   IGNORED (static base positions only) — uploading a textured or
//   animated model never fails for that reason, it just renders flat
//   and still. A PNG upload is NOT viable in this renderer: the 994
//   build deleted the billboard sprite program, so a picture has no
//   geometry to place and no rendering path — the picker accepts
//   .glb only, and anything else fails magic validation with a
//   message. Nothing is faked with a placeholder.
// - Scale: 1 GLB unit = 1 tile, centred XZ on the origin, base at
//   y=0 (no rescaling — author intent is preserved; a 2.4-unit house
//   fills 3 tiles, a 0.5-unit chair fills 1). Footprint = the
//   bounding-box tiles, min 1x1, max 8x8 (bigger files are rejected,
//   not silently shrunk). Height is kept as authored, uncapped.
// - Placement: a custom item is a BLOCKING placed item whose min
//   corner lands on the tapped tile, validated with the same blocking
//   rules as houses (never on paths/square/water, never on generated
//   or placed content, never on the player, an NPC, or an NPC
//   waypoint). Placing is ONE undo entry (the existing `place`
//   entry — the item carries its assetId, so undo/redo restore
//   exactly). Uploading itself is NOT a world change and NOT an
//   undo entry. Custom items are DECORATIVE blocks: no doors, no
//   interiors, no Enter prompt (they are not houses).
// - Persistence: assets live in IndexedDB (assetStore.ts, BUILD
//   1044) under a versioned database + object store, keyed by stable
//   asset id; placements reference assets by id (PlacedItem.assetId).
//   The old localStorage key (CUSTOM_ASSETS_KEY) is read-only after
//   1044 — it is the one-time migration source and the session
//   fallback when IndexedDB is unavailable. No vertex array is ever
//   written to localStorage again: the only localStorage write is the
//   compact versioned manifest (id, name, format, triangles, bytes).
//   Old worlds load with no custom assets, never corrupted. DELETE
//   RULE (one rule): deleting an asset removes every placed copy of
//   it at once, immediately, and is NOT undoable (same as deleting a
//   996 template). A placement whose asset is gone renders nothing
//   (defensive only — delete removes copies first, so orphans should
//   not occur).
// - Caps (IndexedDB reality, measured in assetStore.ts): one file at
//   most 5 MB, the whole library at most 50 MB decoded / 100,000
//   triangles. Over-cap uploads are rejected with a message and
//   never corrupt the store.
// - Chunks (996) do NOT capture custom items in V1: pasteChunk
//   validates through the built-in kinds only, so a custom item
//   captured into a chunk would paste as a shape mismatch. Excluding
//   them keeps the save preview count (which reads captureChunk)
//   honest. Asset-aware paste is the follow-up, not a silent partial
//   capture — same reasoning as 995's generated-move scope.

import type { IsoWorld, PlacedItem } from '../iso/isoWorld';
import { validateBlockingRect } from './placements';

/** localStorage key for uploaded custom assets. Versioned (v1);
 *  separate from world saves so a world reset never wipes uploads.
 *  BUILD 1044: READ-ONLY after the IndexedDB migration — the
 *  migration source and the session fallback when IndexedDB is
 *  unavailable. Nothing writes this key any more. */
export const CUSTOM_ASSETS_KEY = 'ag-3d-custom-assets-v1';

/** One uploaded file, at most 5 MB (BUILD 1044: was 1 MB under
 *  localStorage). Measured in assetStore.ts: a max-size asset
 *  (20,000 tris) decodes to ~5 MB, so the triangle cap binds first. */
export const MAX_FILE_BYTES = 5_000_000;
/** One mesh, at most 20,000 triangles (renderer + storage sanity). */
export const MAX_TRIANGLES = 20_000;
/** One mesh's footprint, at most 8x8 tiles. */
export const MAX_FOOTPRINT = 8;

/** Flat default colour when a mesh carries neither COLOR_0 nor a
 *  material base colour: warm stone grey. */
export const DEFAULT_COLOR: [number, number, number] = [0.65, 0.63, 0.58];

/** An uploaded asset, ready for the vertex-colour renderer.
 *  positions: local XYZ, centred XZ, base y=0, 1 unit = 1 tile.
 *  colors: RGB per vertex, each in [0,1]. indices: triangle triplets
 *  into positions/colors. width/height: footprint tiles. avgColor:
 *  mean vertex colour, for the catalog swatch. */
export interface CustomAsset {
  id: string;
  name: string;
  positions: number[];
  colors: number[];
  indices: number[];
  width: number;
  height: number;
  avgColor: [number, number, number];
  /** Which importer produced this asset ('glb' for 997-era uploads,
   *  which predate the field and load as 'glb'). Shown in the Import
   *  Hub so the player can tell what came from where. */
  format?: 'glb' | 'gltf' | 'obj';
  /** BUILD 1045: library metadata. sourceFile is the file the model
   *  came from (the name as picked, or the ZIP entry path); category
   *  is one of ASSET_CATEGORIES in assetLibrary.ts (the player's own
   *  choice, 'Unsorted' by default — never guessed from the name);
   *  tags are the player's own words. All three are optional so
   *  997–1044 uploads load with honest defaults. */
  sourceFile?: string;
  category?: string;
  tags?: string[];
}

export type GlbUploadResult =
  | { ok: true; asset: CustomAsset; dependencies?: GltfDependency[] }
  | { ok: false; reason: string };

/** One external file a .gltf/.glb names. `found` says whether a
 *  file with that name was actually present alongside the model
 *  (in the same pick, or in the same ZIP); `resolvedPath` is the
 *  container-relative path that matched, or null for an embedded
 *  `data:` URI or a file that was not found. A missing texture is
 *  a note, never a failure — the renderer draws vertex colours
 *  only, so no texture is ever applied; a missing .bin still fails
 *  the import, as before. */
export interface GltfDependency {
  uri: string;
  kind: 'buffer' | 'image';
  found: boolean;
  resolvedPath: string | null;
}

/** Resolve one glTF URI against the files that came with the
 *  model. `basePath` is the model's own directory inside its
 *  container ('' for a flat pick); `files` is keyed by
 *  container-relative path (ZIP entries) and/or plain file name
 *  (a flat pick) — exact match first, then basename. A URI that
 *  escapes the container (`../` past the root), an absolute path,
 *  or a URL is never resolved to a file: it simply is not found. */
export function resolveGltfUri(
  uri: string,
  basePath: string,
  files?: Map<string, ArrayBuffer>,
): { found: boolean; resolvedPath: string | null } {
  if (!uri) return { found: false, resolvedPath: null };
  if (uri.startsWith('data:')) return { found: true, resolvedPath: null };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) || uri.startsWith('/') || uri.startsWith('\\')) {
    return { found: false, resolvedPath: null };
  }
  const parts: string[] = [];
  for (const seg of (basePath ? basePath + '/' + uri : uri).split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return { found: false, resolvedPath: null };
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const resolved = parts.join('/');
  if (!files) return { found: false, resolvedPath: null };
  if (files.has(resolved)) return { found: true, resolvedPath: resolved };
  const base = resolved.split('/').pop() || resolved;
  if (files.has(base)) return { found: true, resolvedPath: base };
  return { found: false, resolvedPath: null };
}

/** Every external file a glTF JSON names: its buffer (kind
 *  'buffer') and every image it references (kind 'image'), each
 *  resolved against the files that came with the model. */
export function collectGltfDependencies(
  json: GltfJson,
  basePath: string,
  files?: Map<string, ArrayBuffer>,
): GltfDependency[] {
  const out: GltfDependency[] = [];
  for (const b of json.buffers || []) {
    if (b.uri === undefined || b.uri === '' || b.uri.startsWith('data:')) continue;
    const r = resolveGltfUri(b.uri, basePath, files);
    out.push({ uri: b.uri, kind: 'buffer', found: r.found, resolvedPath: r.resolvedPath });
  }
  for (const img of json.images || []) {
    if (!img.uri || img.uri.startsWith('data:')) continue;
    const r = resolveGltfUri(img.uri, basePath, files);
    out.push({ uri: img.uri, kind: 'image', found: r.found, resolvedPath: r.resolvedPath });
  }
  return out;
}

/** Model formats the Import Hub (BUILD 1043) accepts as single
 *  files. ZIP is handled separately (zipImport.ts) and may contain
 *  any of these. Audio and textures are NOT here on purpose: there
 *  is no audio playback system to attach audio to, and the renderer
 *  draws vertex-colour triangles only, so a texture has nowhere to
 *  go — importing either would be a fake feature. */
export const SUPPORTED_MODEL_EXTENSIONS = ['.glb', '.gltf', '.obj'] as const;
export type ImportModelFormat = 'glb' | 'gltf' | 'obj';

// ---- GLB parsing (direct, no three.js — same approach as the 985
// bake script, adapted to run in the browser on an ArrayBuffer). ----

const GLTF_MAGIC = 0x46546c67; // 'glTF' little-endian
const JSON_CHUNK = 0x4e4f534a; // 'JSON'
const BIN_CHUNK = 0x004e4942; // 'BIN\0'
const COMP_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMP_COUNT: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

type GltfJson = {
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{ mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }>;
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; material?: number; mode?: number }> }>;
  materials?: Array<{ pbrMetallicRoughness?: { baseColorFactor?: number[] } }>;
  accessors?: Array<{ bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean; sparse?: unknown }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>;
  buffers?: Array<{ byteLength: number; uri?: string }>;
  /** BUILD 1046: image references. The renderer cannot show
   *  textures, so these are only ever reported (found / missing),
   *  never applied — see collectGltfDependencies. */
  images?: Array<{ uri?: string }>;
};

function ascii4(view: DataView, off: number): string {
  return String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));
}

function readAccessor(
  json: GltfJson,
  bin: Uint8Array,
  idx: number,
): { values: number[]; count: number; compCount: number } | string {
  const acc = (json.accessors || [])[idx];
  if (!acc) return 'accessor ' + idx + ' missing';
  if (acc.sparse) return 'sparse accessors are not supported';
  const view = (json.bufferViews || [])[acc.bufferView ?? -1];
  if (!view) return 'bufferView missing for accessor ' + idx;
  if (view.buffer !== 0) return 'only the GLB BIN chunk (buffer 0) is supported';
  const compSize = COMP_SIZE[acc.componentType];
  const compCount = COMP_COUNT[acc.type];
  if (!compSize || !compCount) return 'unsupported accessor type ' + acc.componentType + '/' + acc.type;
  const stride = view.byteStride || compSize * compCount;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const values: number[] = [];
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < compCount; k++) {
      const o = base + i * stride + k * compSize;
      if (o + compSize > bin.length) return 'accessor ' + idx + ' runs past the BIN chunk';
      let v: number;
      if (acc.componentType === 5126) v = dv.getFloat32(o, true);
      else if (acc.componentType === 5123) v = dv.getUint16(o, true);
      else if (acc.componentType === 5125) v = dv.getUint32(o, true);
      else if (acc.componentType === 5122) v = dv.getInt16(o, true);
      else if (acc.componentType === 5121) v = dv.getUint8(o);
      else if (acc.componentType === 5120) v = dv.getInt8(o);
      else return 'unsupported componentType ' + acc.componentType;
      if (acc.normalized) {
        if (acc.componentType === 5121) v = v / 255;
        else if (acc.componentType === 5123) v = v / 65535;
        else if (acc.componentType === 5120) v = Math.max(v / 127, -1);
        else if (acc.componentType === 5122) v = Math.max(v / 32767, -1);
      }
      values.push(v);
    }
  }
  return { values, count: acc.count, compCount };
}

type Mat4 = number[]; // column-major, 16 entries

function composeTRS(n: NonNullable<GltfJson['nodes']>[number]): Mat4 {
  if (n.matrix && n.matrix.length === 16) return n.matrix.slice();
  const t = n.translation || [0, 0, 0];
  const r = n.rotation || [0, 0, 0, 1];
  const s = n.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  // Rotation matrix (row-major) times per-axis scale, then transposed
  // into column-major for the multiply below.
  const rm = [
    [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
    [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
    [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
  ];
  return [
    rm[0][0] * s[0], rm[1][0] * s[1], rm[2][0] * s[2], 0,
    rm[0][1] * s[0], rm[1][1] * s[1], rm[2][1] * s[2], 0,
    rm[0][2] * s[0], rm[1][2] * s[1], rm[2][2] * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function mulMat(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function xform(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// ---- Shared finish (BUILD 1043): every model importer ends here,
// so GLB, glTF and OBJ agree on centring, footprint, caps and the
// asset record. Raw positions are Y-up, uncentred; the asset is
// centred XZ on the origin with its base at y=0, 1 unit = 1 tile. ----
function finishAsset(
  positions: number[],
  colors: number[],
  indices: number[],
  fileName: string,
  format: ImportModelFormat,
): GlbUploadResult {
  if (indices.length === 0 || indices.length % 3 !== 0) return { ok: false, reason: 'no triangle geometry found' };
  const triCount = indices.length / 3;
  if (triCount > MAX_TRIANGLES) return { ok: false, reason: 'too many triangles (' + triCount + ' > ' + MAX_TRIANGLES + ')' };
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const out: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    out.push(positions[i] - cx, positions[i + 1] - minY, positions[i + 2] - cz);
  }
  // Epsilon-tolerant ceil: a rotated box's extent lands a hair
  // above an integer in floating point (2.0000000000000004), and a
  // naive ceil would inflate its footprint by a whole tile.
  const width = Math.max(1, Math.ceil(maxX - minX - 1e-9));
  const height = Math.max(1, Math.ceil(maxZ - minZ - 1e-9));
  if (width > MAX_FOOTPRINT || height > MAX_FOOTPRINT) {
    return { ok: false, reason: 'footprint too large (' + width + 'x' + height + ' tiles, max ' + MAX_FOOTPRINT + 'x' + MAX_FOOTPRINT + ')' };
  }
  let ar = 0, ag = 0, ab = 0;
  const nv = colors.length / 3;
  for (let i = 0; i < colors.length; i += 3) { ar += colors[i]; ag += colors[i + 1]; ab += colors[i + 2]; }
  const avg: [number, number, number] = nv > 0 ? [ar / nv, ag / nv, ab / nv] : [...DEFAULT_COLOR];
  const stem = fileName.replace(/\.[^.]*$/, '').trim().slice(0, 40) || 'Custom model';
  return {
    ok: true,
    asset: {
      id: 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      name: stem,
      positions: out,
      colors,
      indices,
      width,
      height,
      avgColor: avg,
      format,
      // BUILD 1045: the file this model came from, so the library
      // row can say where it came from. Category/tags start as the
      // player's defaults (Unsorted / none) — never guessed.
      sourceFile: fileName,
      category: 'Unsorted',
      tags: [],
    },
  };
}

// ---- Shared glTF mesh extraction (BUILD 1043): the scene-graph
// walk and per-primitive colour rules from 997, factored out so the
// GLB parser and the new .gltf parser share one implementation and
// can never drift apart. `bin` is buffer 0's bytes. ----
function buildAssetFromGltf(
  json: GltfJson,
  bin: Uint8Array,
  fileName: string,
  format: ImportModelFormat,
): GlbUploadResult {
  const nodes = json.nodes || [];
  const parent = new Map<number, number>();
  nodes.forEach((n, i) => { for (const c of n.children || []) parent.set(c, i); });
  const worldMat = new Map<number, Mat4>();
  const matOf = (i: number): Mat4 => {
    const cached = worldMat.get(i);
    if (cached) return cached;
    const local = composeTRS(nodes[i] || {});
    const p = parent.get(i);
    const world = p === undefined ? local : mulMat(matOf(p), local);
    worldMat.set(i, world);
    return world;
  };
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    if (node.mesh === undefined) continue;
    const mesh = (json.meshes || [])[node.mesh];
    if (!mesh) continue;
    const m = matOf(ni);
    for (const prim of mesh.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) return { ok: false, reason: 'only triangle meshes are supported' };
      const posIdx = prim.attributes.POSITION;
      if (posIdx === undefined) return { ok: false, reason: 'a primitive is missing POSITION' };
      const pos = readAccessor(json, bin, posIdx);
      if (typeof pos === 'string') return { ok: false, reason: pos };
      if (pos.compCount !== 3) return { ok: false, reason: 'POSITION is not VEC3' };
      // Colour: COLOR_0 per vertex wins, else the material's base
      // colour, else the flat default. Alpha (VEC4) is ignored —
      // the renderer is opaque.
      let colVals: number[] | null = null;
      let colCount = 0;
      const colIdx = prim.attributes.COLOR_0;
      if (colIdx !== undefined) {
        const col = readAccessor(json, bin, colIdx);
        if (typeof col === 'string') return { ok: false, reason: col };
        if (col.compCount !== 3 && col.compCount !== 4) return { ok: false, reason: 'COLOR_0 is not VEC3/VEC4' };
        colVals = col.values;
        colCount = col.compCount;
      }
      let matColor: [number, number, number] | null = null;
      if (prim.material !== undefined) {
        const mat = (json.materials || [])[prim.material];
        const f = mat?.pbrMetallicRoughness?.baseColorFactor;
        if (f && f.length >= 3) matColor = [f[0], f[1], f[2]];
      }
      const base = positions.length / 3;
      for (let i = 0; i < pos.count; i++) {
        const [x, y, z] = xform(m, pos.values[i * 3], pos.values[i * 3 + 1], pos.values[i * 3 + 2]);
        positions.push(x, y, z);
        let r: number, g: number, b: number;
        if (colVals) {
          r = colVals[i * colCount];
          g = colVals[i * colCount + 1];
          b = colVals[i * colCount + 2];
        } else if (matColor) {
          [r, g, b] = matColor;
        } else {
          [r, g, b] = DEFAULT_COLOR;
        }
        colors.push(Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b)));
      }
      if (prim.indices !== undefined) {
        const idx = readAccessor(json, bin, prim.indices);
        if (typeof idx === 'string') return { ok: false, reason: idx };
        if (idx.compCount !== 1) return { ok: false, reason: 'indices are not SCALAR' };
        for (const v of idx.values) {
          if (v < 0 || v >= pos.count) return { ok: false, reason: 'index out of range' };
          indices.push(base + v);
        }
      } else {
        for (let i = 0; i < pos.count; i++) indices.push(base + i);
      }
    }
  }
  return finishAsset(positions, colors, indices, fileName, format);
}

function decodeBase64DataUri(uri: string): Uint8Array | string {
  const m = /^data:.*;base64,(.*)$/.exec(uri);
  if (!m) return 'buffer data URI is not base64';
  const b64 = m[1].replace(/\s/g, '');
  try {
    const binStr = atob(b64);
    const out = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) out[i] = binStr.charCodeAt(i);
    return out;
  } catch {
    return 'buffer data URI is not valid base64';
  }
}

/** Parse a GLB file buffer into a render-ready CustomAsset. Never
 *  throws for bad input: every failure is a { ok: false, reason } so
 *  the panel can show it and the game keeps running. BUILD 1046:
 *  `files` + `basePath` let a GLB that names external images report
 *  whether those files came with it (same pick / same ZIP) — the
 *  images are never applied, only reported on the ok result. */
export function parseGlbUpload(buf: ArrayBuffer, fileName: string, files?: Map<string, ArrayBuffer>, basePath = ''): GlbUploadResult {
  try {
    if (buf.byteLength < 20) return { ok: false, reason: 'file too small to be a GLB' };
    const view = new DataView(buf);
    if (ascii4(view, 0) !== 'glTF') return { ok: false, reason: 'not a GLB file (bad magic — PNGs and other files are not supported)' };
    const version = view.getUint32(4, true);
    if (version !== 2) return { ok: false, reason: 'unsupported glTF version ' + version + ' (need version 2)' };
    const jsonLen = view.getUint32(12, true);
    const jsonType = view.getUint32(16, true);
    if (jsonType !== JSON_CHUNK) return { ok: false, reason: 'first chunk is not JSON' };
    if (20 + jsonLen > buf.byteLength) return { ok: false, reason: 'JSON chunk runs past the file' };
    // The spec pads the JSON chunk with spaces, but some tools emit
    // NULs instead — strip trailing NULs only, so a real-world file
    // still parses while trailing garbage still fails.
    const jsonText = new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)).replace(/\u0000+$/, '');
    const json = JSON.parse(jsonText) as GltfJson;
    let bin = new Uint8Array(0);
    let off = 20 + jsonLen;
    if (off + 8 <= buf.byteLength) {
      const binLen = view.getUint32(off, true);
      const binType = view.getUint32(off + 4, true);
      if (binType === BIN_CHUNK) {
        if (off + 8 + binLen > buf.byteLength) return { ok: false, reason: 'BIN chunk runs past the file' };
        bin = new Uint8Array(buf, off + 8, binLen);
      }
    }
    for (const b of json.buffers || []) {
      if (b.uri !== undefined && b.uri !== '') return { ok: false, reason: 'external buffer references are not supported (GLB must be self-contained)' };
    }
    // BUILD 1043: mesh extraction is shared with the .gltf importer
    // (buildAssetFromGltf above) so the two formats can never drift.
    const res = buildAssetFromGltf(json, bin, fileName, 'glb');
    if (!res.ok) return res;
    return { ...res, dependencies: collectGltfDependencies(json, basePath, files) };
  } catch (e) {
    return { ok: false, reason: 'could not parse this file (' + (e instanceof Error ? e.message : 'unknown error') + ')' };
  }
}

/** Parse a .gltf file (JSON) into a render-ready CustomAsset — the
 *  JSON sibling of GLB, sharing buildAssetFromGltf. Buffer rules,
 *  stated plainly: embedded `data:` base64 buffers work on their
 *  own; an external `.bin` file only works when it is selected
 *  TOGETHER with the .gltf (same file pick / same ZIP), passed in as
 *  `binFiles` keyed by file name (exact name first, then basename).
 *  BUILD 1046: `basePath` is the .gltf's own directory inside its
 *  container, so a `.bin` in a subfolder (`models/mesh.bin`) or a
 *  `../shared/mesh.bin` resolves relative to the .gltf, not the
 *  container root; a URI that escapes the container is reported
 *  missing, never followed. A .gltf whose .bin was not included
 *  fails with a message naming the missing file — it never silently
 *  renders empty. Textures referenced by the JSON are reported on
 *  the ok result (found / missing) and ignored by the renderer,
 *  like GLB — the renderer cannot show them. Never throws for bad
 *  input. */
export function parseGltfUpload(
  jsonText: string,
  fileName: string,
  binFiles?: Map<string, ArrayBuffer>,
  basePath = '',
): GlbUploadResult {
  try {
    let json: GltfJson;
    try {
      json = JSON.parse(jsonText) as GltfJson;
    } catch {
      return { ok: false, reason: 'not a valid .gltf JSON file' };
    }
    if (!json || typeof json !== 'object' || !Array.isArray(json.meshes)) {
      return { ok: false, reason: 'no meshes in this .gltf file' };
    }
    const buffers = json.buffers || [];
    if (buffers.length === 0) return { ok: false, reason: 'this .gltf has no buffer (no geometry to read)' };
    if (buffers.length > 1) return { ok: false, reason: 'only single-buffer .gltf files are supported' };
    const uri = buffers[0].uri;
    let bin: Uint8Array;
    if (uri === undefined) {
      return { ok: false, reason: 'this .gltf has no buffer data — a .gltf needs its .bin file selected with it' };
    }
    if (uri.startsWith('data:')) {
      const decoded = decodeBase64DataUri(uri);
      if (typeof decoded === 'string') return { ok: false, reason: decoded };
      bin = decoded;
    } else {
      if (!binFiles) {
        return { ok: false, reason: 'missing buffer file "' + uri + '" — select the .bin file together with the .gltf' };
      }
      const resolved = resolveGltfUri(uri, basePath, binFiles);
      const found = resolved.found && resolved.resolvedPath !== null ? binFiles.get(resolved.resolvedPath) : undefined;
      if (!found) {
        return { ok: false, reason: 'missing buffer file "' + uri + '" — select the .bin file together with the .gltf' };
      }
      bin = new Uint8Array(found);
    }
    const res = buildAssetFromGltf(json, bin, fileName, 'gltf');
    if (!res.ok) return res;
    return { ...res, dependencies: collectGltfDependencies(json, basePath, binFiles) };
  } catch (e) {
    return { ok: false, reason: 'could not parse this file (' + (e instanceof Error ? e.message : 'unknown error') + ')' };
  }
}

/** Parse a Wavefront .obj file (plain text) into a render-ready
 *  CustomAsset. Supported, stated plainly: `v` positions (with
 *  optional per-vertex `r g b` colours — the common extension),
 *  `f` faces as triangles, quads, or n-gons (fan-triangulated),
 *  1-based and negative (relative) indices, and `v/vt/vn` face
 *  tokens (only the vertex index is read). Ignored, honestly:
 *  `vt`/`vn`/`mtllib`/`usemtl` — the renderer has no UVs, normals,
 *  or materials, so an OBJ renders in its vertex colours or the
 *  flat stone-grey default. `o`/`g` names the asset when present.
 *  Never throws for bad input. */
export function parseObjUpload(text: string, fileName: string): GlbUploadResult {
  try {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let objName = '';
    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) continue;
      const parts = line.split(/\s+/);
      const tag = parts[0];
      if (tag === 'o' || tag === 'g') {
        if (!objName && parts.length > 1) objName = parts.slice(1).join(' ').trim().slice(0, 40);
        continue;
      }
      if (tag === 'v') {
        if (parts.length < 4) return { ok: false, reason: 'a vertex line has too few numbers' };
        const x = Number(parts[1]), y = Number(parts[2]), z = Number(parts[3]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          return { ok: false, reason: 'a vertex has a number that is not a number' };
        }
        positions.push(x, y, z);
        if (parts.length >= 7) {
          const r = Number(parts[4]), g = Number(parts[5]), b = Number(parts[6]);
          if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
            return { ok: false, reason: 'a vertex colour has a number that is not a number' };
          }
          colors.push(Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b)));
        } else {
          colors.push(...DEFAULT_COLOR);
        }
        continue;
      }
      if (tag === 'f') {
        if (parts.length < 4) return { ok: false, reason: 'a face has fewer than 3 corners' };
        const face: number[] = [];
        for (let i = 1; i < parts.length; i++) {
          const vTok = parts[i].split('/')[0];
          const n = Number(vTok);
          if (!Number.isInteger(n) || n === 0) return { ok: false, reason: 'a face has a bad vertex index' };
          const idx = n > 0 ? n - 1 : positions.length / 3 + n;
          if (idx < 0 || idx >= positions.length / 3) return { ok: false, reason: 'a face index is out of range' };
          face.push(idx);
        }
        for (let i = 1; i + 1 < face.length; i++) {
          indices.push(face[0], face[i], face[i + 1]);
        }
        continue;
      }
      // vt, vn, mtllib, usemtl, s, l, p and anything else: ignored —
      // the renderer cannot use UVs, normals, or materials.
    }
    if (positions.length === 0) return { ok: false, reason: 'no vertices in this .obj file' };
    if (indices.length === 0) return { ok: false, reason: 'no faces in this .obj file' };
    // No vertex colours anywhere: every vertex already carries the
    // flat default (pushed per vertex above).
    const res = finishAsset(positions, colors, indices, fileName, 'obj');
    if (res.ok && objName) res.asset.name = objName;
    return res;
  } catch (e) {
    return { ok: false, reason: 'could not parse this file (' + (e instanceof Error ? e.message : 'unknown error') + ')' };
  }
}

// ---- Encoders (BUILD 1046: export/backup). The inverse of the
// parsers above: an asset's own positions + colours + indices,
// written back out in its ORIGINAL format so a pack re-imports
// exactly what was exported — a .glb comes back as a .glb, a .gltf
// as a .gltf plus its .bin, an .obj as an .obj. No textures are
// written (there were never any to keep: the renderer only ever
// held vertex colours), and no original file bytes are kept — the
// export is a re-encode of the geometry the game holds, which is
// why it round-trips through the same parsers. ----

/** The binary payload shared by the GLB and .gltf encoders:
 *  positions (float32) + colours (float32) + indices (uint32),
 *  laid out in that order. */
function assetBinBytes(asset: CustomAsset): { bin: Uint8Array; posBytes: number; colBytes: number; idxBytes: number } {
  const nv = asset.positions.length / 3;
  const posBytes = nv * 12;
  const colBytes = nv * 12;
  const idxBytes = asset.indices.length * 4;
  const bin = new Uint8Array(posBytes + colBytes + idxBytes);
  const dv = new DataView(bin.buffer);
  for (let i = 0; i < asset.positions.length; i++) dv.setFloat32(i * 4, asset.positions[i], true);
  for (let i = 0; i < asset.colors.length; i++) dv.setFloat32(posBytes + i * 4, asset.colors[i], true);
  for (let i = 0; i < asset.indices.length; i++) dv.setUint32(posBytes + colBytes + i * 4, asset.indices[i], true);
  return { bin, posBytes, colBytes, idxBytes };
}

/** The glTF JSON shared by the GLB and .gltf encoders: one scene,
 *  one node, one mesh, one triangle primitive with POSITION +
 *  COLOR_0 + indices. `binUri` is undefined for GLB (self-contained)
 *  and the `.bin` file name for .gltf. */
function assetGltfJson(asset: CustomAsset, binUri?: string): Record<string, unknown> {
  const nv = asset.positions.length / 3;
  const { posBytes, colBytes, idxBytes } = assetBinBytes(asset);
  const buffers: Array<Record<string, unknown>> = [{ byteLength: posBytes + colBytes + idxBytes }];
  if (binUri !== undefined) buffers[0].uri = binUri;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < asset.positions.length; i += 3) {
    minX = Math.min(minX, asset.positions[i]); maxX = Math.max(maxX, asset.positions[i]);
    minY = Math.min(minY, asset.positions[i + 1]); maxY = Math.max(maxY, asset.positions[i + 1]);
    minZ = Math.min(minZ, asset.positions[i + 2]); maxZ = Math.max(maxZ, asset.positions[i + 2]);
  }
  return {
    asset: { version: '2.0', generator: 'Ashfall Import Hub' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: asset.name }],
    meshes: [{ name: asset.name, primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, mode: 4 }] }],
    buffers,
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes },
      { buffer: 0, byteOffset: posBytes, byteLength: colBytes },
      { buffer: 0, byteOffset: posBytes + colBytes, byteLength: idxBytes },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: asset.indices.length, type: 'SCALAR' },
    ],
  };
}

function pad4(n: number): number {
  return (4 - (n % 4)) % 4;
}

/** Encode an asset as a GLB file (JSON chunk + BIN chunk, both
 *  4-byte padded). Parses back through parseGlbUpload. */
export function encodeGlbAsset(asset: CustomAsset): Uint8Array {
  const { bin } = assetBinBytes(asset);
  const json = JSON.stringify(assetGltfJson(asset));
  const jsonBytes = new TextEncoder().encode(json);
  const jsonPad = pad4(jsonBytes.length);
  const binPad = pad4(bin.length);
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jsonPad, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.length + i] = 0x20; // space padding
  const binOff = 20 + 8 + jsonBytes.length + jsonPad;
  dv.setUint32(binOff - 8, bin.length + binPad, true);
  dv.setUint32(binOff - 4, 0x004e4942, true); // 'BIN\0'
  out.set(bin, binOff);
  return out;
}

/** Encode an asset as a .gltf (JSON text) plus its separate .bin
 *  payload. `binFileName` is the file name the JSON references. */
export function encodeGltfAsset(asset: CustomAsset, binFileName: string): { json: string; bin: Uint8Array } {
  const { bin } = assetBinBytes(asset);
  return { json: JSON.stringify(assetGltfJson(asset, binFileName), null, 2), bin };
}

/** Encode an asset as a Wavefront .obj (text): `v x y z r g b`
 *  lines plus `f` triangles, with an `o` name line. Colours are
 *  written with full double precision, so the text round-trips
 *  exactly through parseObjUpload. */
export function encodeObjAsset(asset: CustomAsset): string {
  const lines: string[] = ['o ' + asset.name.replace(/[\r\n]/g, ' ')];
  const nv = asset.positions.length / 3;
  for (let i = 0; i < nv; i++) {
    lines.push(
      'v ' + asset.positions[i * 3] + ' ' + asset.positions[i * 3 + 1] + ' ' + asset.positions[i * 3 + 2] +
      ' ' + asset.colors[i * 3] + ' ' + asset.colors[i * 3 + 1] + ' ' + asset.colors[i * 3 + 2],
    );
  }
  for (let i = 0; i < asset.indices.length; i += 3) {
    lines.push('f ' + (asset.indices[i] + 1) + ' ' + (asset.indices[i + 1] + 1) + ' ' + (asset.indices[i + 2] + 1));
  }
  return lines.join('\n') + '\n';
}

// ---- Storage (same pattern as 996 templates: validated loads,
// swallowed save failures, never fatal). ----

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function validAsset(raw: unknown): CustomAsset | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  if (!Array.isArray(r.positions) || !Array.isArray(r.colors) || !Array.isArray(r.indices)) return null;
  if (!r.positions.every(isFiniteNum) || !r.colors.every(isFiniteNum) || !r.indices.every(isFiniteNum)) return null;
  if (r.positions.length % 3 !== 0 || r.colors.length !== r.positions.length || r.indices.length % 3 !== 0) return null;
  if (r.indices.some((v) => (v as number) < 0 || (v as number) * 3 >= (r.positions as number[]).length)) return null;
  if (!isFiniteNum(r.width) || !isFiniteNum(r.height)) return null;
  const w = r.width as number, h = r.height as number;
  if (w < 1 || h < 1 || w > MAX_FOOTPRINT || h > MAX_FOOTPRINT) return null;
  if (r.indices.length / 3 > MAX_TRIANGLES) return null;
  if (!Array.isArray(r.avgColor) || r.avgColor.length !== 3 || !r.avgColor.every(isFiniteNum)) return null;
  // BUILD 1043: format is optional — 997-era uploads predate it and
  // load as 'glb'; an unknown value is dropped, never fatal.
  const fmt = r.format === 'glb' || r.format === 'gltf' || r.format === 'obj' ? r.format : 'glb';
  // BUILD 1045: library metadata is optional — pre-1045 uploads
  // predate it. A bad value is dropped to the honest default, never
  // fatal: unknown source file, 'Unsorted', no tags.
  const sourceFile = typeof r.sourceFile === 'string' && r.sourceFile.length > 0 ? r.sourceFile.slice(0, 128) : undefined;
  const category = typeof r.category === 'string' && r.category.length > 0 ? r.category.slice(0, 24) : 'Unsorted';
  const tags = Array.isArray(r.tags)
    ? (r.tags as unknown[]).filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 20)).slice(0, 5)
    : [];
  return {
    id: r.id,
    name: r.name.slice(0, 40),
    positions: r.positions as number[],
    colors: r.colors as number[],
    indices: r.indices as number[],
    width: w,
    height: h,
    avgColor: r.avgColor as [number, number, number],
    format: fmt,
    sourceFile,
    category,
    tags,
  };
}

/** Load uploaded assets from the LEGACY localStorage key. BUILD
 *  1044: read-only — the one-time IndexedDB migration source, and
 *  the session fallback when IndexedDB cannot be opened. Malformed
 *  entries are dropped, never fatal: a corrupt asset store degrades
 *  to an empty library, never a broken Build panel. */
export function loadCustomAssets(): CustomAsset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ASSETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: CustomAsset[] = [];
    for (const entry of parsed) {
      const v = validAsset(entry);
      if (v) out.push(v);
    }
    return out;
  } catch {
    return [];
  }
}

// BUILD 1044: there is no saveCustomAssets any more. Vertex arrays
// are never written to localStorage — the IndexedDB store in
// assetStore.ts owns persistence, and the view persists each upload
// and delete through it (persist first, then update state, so a
// failed write is never shown as a success).

/** A name that does not collide with any existing asset name.
 *  Blank input becomes 'Custom N'; a taken name gains ' 2', ' 3',
 *  ... — uploading never silently overwrites an asset. */
export function uniquifyAssetName(existing: string[], base: string): string {
  const trimmed = base.trim();
  const stem = trimmed.length > 0 ? trimmed.slice(0, 40) : 'Custom ' + (existing.length + 1);
  if (!existing.includes(stem)) return stem;
  let n = 2;
  while (existing.includes(stem + ' ' + n)) n++;
  return stem + ' ' + n;
}

// ---- Placement rules (blocking item, min corner on the tap tile).
// The shared blocking checks live in placements.ts so the built-in
// kinds and custom items can never drift apart. ----

/** Validate a custom placement whose min corner is the tap tile
 *  (tx, ty). The rect is width x height tiles from the asset's
 *  footprint. Returns the placed item (kind 'custom', carrying the
 *  assetId) on success. */
export function validateCustomPlacement(
  w: IsoWorld,
  asset: CustomAsset,
  tx: number,
  ty: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): { ok: true; item: PlacedItem } | { ok: false; reason: string } {
  const res = validateBlockingRect(w, tx, ty, tx + asset.width - 1, ty + asset.height - 1, playerTile, npcTiles);
  if (!res.ok) return res;
  return { ok: true, item: { kind: 'custom', assetId: asset.id, x0: tx, y0: ty, x1: tx + asset.width - 1, y1: ty + asset.height - 1 } };
}

/** Remove every placed copy of one asset (the 997 delete rule).
 *  BUILD 1039: returns the removed copies with their list indices,
 *  so deleting an upload is undoable — the caller stores them as one
 *  `stroke` of `unplace` entries and one Undo restores all of them.
 *  The library deletion itself is not undone: restored copies
 *  reference the deleted asset and render nothing until it is
 *  re-uploaded (the renderer already skips missing assets), but they
 *  exist and block exactly as before. */
export function removeCustomAssetPlacements(w: IsoWorld, assetId: string): Array<{ item: PlacedItem; index: number }> {
  const list = w.placements;
  if (!list) return [];
  const removed: Array<{ item: PlacedItem; index: number }> = [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].kind === 'custom' && list[i].assetId === assetId) {
      removed.push({ item: list[i], index: i });
      list.splice(i, 1);
    }
  }
  return removed;
}
