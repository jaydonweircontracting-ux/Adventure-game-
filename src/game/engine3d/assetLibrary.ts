// BUILD 1045 — Import Hub Stage 3: preview + library. Pure module:
// no React, no WebGL, no DOM. The view owns the UI; this file owns
// the library rules and the preview renderer so both can be asserted
// standalone.
//
// What lives here, stated plainly:
// - Library metadata: every asset carries a source filename, a
//   category and tags. The category is one of a fixed list (the
//   player picks it; new uploads start 'Unsorted' — categories are
//   never invented from a filename). Tags are free-form words the
//   player types, capped at 5 tags of 20 characters. Dimensions come
//   from the geometry itself: footprint tiles (already on the asset)
//   plus model height (max Y of the vertex positions, in tiles).
// - The preview: a small software rasterizer that draws the model's
//   OWN triangles — the same positions + per-vertex colours the game
//   renderer draws — into a pixel buffer, in an isometric projection
//   with painter's depth sorting. It is the same geometry, not a
//   placeholder image: a red-roof model previews red, a different
//   shape previews differently, and a model with no triangles cannot
//   be previewed at all (renderAssetPreview returns null, and the
//   view says so instead of showing a fake picture). The view copies
//   the pixel buffer into a <canvas> with putImageData — no second
//   3D renderer exists.
// - Import progress: pure percent/label math over real work — files
//   read and bytes read out of the totals. The view updates the
//   numbers between awaited file reads/parses (see handleImportFiles),
//   so the bar moves because work happened, never on a timer.
// - The Add/Cancel flow, pure part: planLibraryCommit uniquifies
//   names and checks the library budgets BEFORE anything is written,
//   so Add either commits the whole asset or reports why it cannot;
//   Cancel is just dropping the pending asset — nothing was ever
//   written, so there is nothing to undo.
// - Search/filter/sort: by name, tag, or source filename (substring,
//   case-insensitive), grouped/filtered by category or format, sorted
//   by name, format, category, or triangle count.
//
// What is NOT here: the parsers (customAssets.ts), the store
// (assetStore.ts), the ZIP reader/writer (zipImport.ts), the pack
// assembly + manifest (assetPack.ts), FBX, audio, textures —
// those are other stages (packs landed in BUILD 1046).

import { uniquifyAssetName, type CustomAsset } from './customAssets';
import { checkLibraryBudgets } from './assetStore';

/** Categories the player can assign. 'Unsorted' is the default for
 *  a new upload — it is the absence of a choice, not a guess about
 *  what the model is. */
export const ASSET_CATEGORIES = ['Unsorted', 'House', 'Furniture', 'Nature', 'Vehicle', 'Decoration', 'Structure'] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const DEFAULT_ASSET_CATEGORY: AssetCategory = 'Unsorted';

/** At most 5 tags per asset, each at most 20 characters. */
export const MAX_TAGS_PER_ASSET = 5;
export const MAX_TAG_LENGTH = 20;
export const MAX_CATEGORY_LENGTH = 24;

/** Dimensions read off the asset's own geometry: footprint in
 *  tiles (already stored on the asset) and model height in tiles
 *  (the highest vertex, base y=0). */
export interface AssetDimensions {
  /** Footprint width in tiles (X extent). */
  width: number;
  /** Footprint depth in tiles (Z extent). */
  depth: number;
  /** Model height in tiles (max Y), to two decimals. */
  height: number;
}

export function assetDimensions(a: CustomAsset): AssetDimensions {
  let maxY = 0;
  for (let i = 1; i < a.positions.length; i += 3) {
    if (a.positions[i] > maxY) maxY = a.positions[i];
  }
  return { width: a.width, depth: a.height, height: Math.round(maxY * 100) / 100 };
}

/** Triangle count of one asset. */
export function assetTriangles(a: CustomAsset): number {
  return Math.floor(a.indices.length / 3);
}

/** One library row: everything the hub shows for an asset, in one
 *  place, so the hub and the asserts can never disagree about what
 *  a row carries. Source filename is the file the model came from
 *  (or 'unknown file' when the upload predates the field); category
 *  and tags are the player's own, never invented. */
export interface AssetRow {
  id: string;
  name: string;
  category: string;
  tags: string[];
  width: number;
  depth: number;
  height: number;
  triangles: number;
  sourceFile: string;
  format: 'glb' | 'gltf' | 'obj';
  avgColor: [number, number, number];
}

export function assetRow(a: CustomAsset): AssetRow {
  const d = assetDimensions(a);
  return {
    id: a.id,
    name: a.name,
    category: a.category ?? DEFAULT_ASSET_CATEGORY,
    tags: [...(a.tags ?? [])],
    width: d.width,
    depth: d.depth,
    height: d.height,
    triangles: assetTriangles(a),
    sourceFile: a.sourceFile ?? 'unknown file',
    format: a.format ?? 'glb',
    avgColor: a.avgColor,
  };
}

/** Rename an asset, uniquified against the library so a rename can
 *  never silently collide with another asset's name. */
export function renameAsset(a: CustomAsset, newName: string, existingNames: string[]): CustomAsset {
  const others = existingNames.filter((n) => n !== a.name);
  return { ...a, name: uniquifyAssetName(others, newName) };
}

/** Assign a category. Only the fixed list is accepted — anything
 *  else falls back to 'Unsorted' rather than storing a typo as a
 *  new category that would splinter the grouping. */
export function setAssetCategory(a: CustomAsset, category: string): CustomAsset {
  const found = (ASSET_CATEGORIES as readonly string[]).find((c) => c.toLowerCase() === category.trim().toLowerCase());
  return { ...a, category: (found ?? DEFAULT_ASSET_CATEGORY) as AssetCategory };
}

/** Split a typed tag string ("red, roof,  house") into clean tags:
 *  trimmed, lower-cased, de-duplicated, at most 5, each at most 20
 *  characters. Empty input is no tags. */
export function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const t = raw.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (t.length === 0) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS_PER_ASSET) break;
  }
  return out;
}

/** Assign tags (already parsed — the view parses the typed string
 *  with parseTags first). Defensive caps apply again here. */
export function setAssetTags(a: CustomAsset, tags: string[]): CustomAsset {
  const clean: string[] = [];
  for (const raw of tags) {
    const t = String(raw).trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (t.length === 0 || clean.includes(t)) continue;
    clean.push(t);
    if (clean.length >= MAX_TAGS_PER_ASSET) break;
  }
  return { ...a, tags: clean };
}

// ---- Search / filter / sort ----

export interface LibraryFilter {
  /** Substring matched against name, tags, and source filename. */
  query: string;
  /** 'all' or one of ASSET_CATEGORIES. */
  category: string;
  /** 'all' or 'glb' | 'gltf' | 'obj'. */
  format: string;
}

export const EMPTY_LIBRARY_FILTER: LibraryFilter = { query: '', category: 'all', format: 'all' };

export function filterAssets(assets: CustomAsset[], f: LibraryFilter): CustomAsset[] {
  const q = f.query.trim().toLowerCase();
  return assets.filter((a) => {
    if (f.category !== 'all' && (a.category ?? DEFAULT_ASSET_CATEGORY) !== f.category) return false;
    if (f.format !== 'all' && (a.format ?? 'glb') !== f.format) return false;
    if (q.length === 0) return true;
    if (a.name.toLowerCase().includes(q)) return true;
    if ((a.sourceFile ?? '').toLowerCase().includes(q)) return true;
    if ((a.tags ?? []).some((t) => t.toLowerCase().includes(q))) return true;
    return false;
  });
}

export type LibrarySort = 'name' | 'format' | 'category' | 'triangles';

export function sortAssets(assets: CustomAsset[], sort: LibrarySort): CustomAsset[] {
  const copy = [...assets];
  switch (sort) {
    case 'name':
      copy.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'format':
      copy.sort((a, b) => (a.format ?? 'glb').localeCompare(b.format ?? 'glb') || a.name.localeCompare(b.name));
      break;
    case 'category':
      copy.sort((a, b) => (a.category ?? DEFAULT_ASSET_CATEGORY).localeCompare(b.category ?? DEFAULT_ASSET_CATEGORY) || a.name.localeCompare(b.name));
      break;
    case 'triangles':
      copy.sort((a, b) => assetTriangles(b) - assetTriangles(a));
      break;
  }
  return copy;
}

// ---- Import progress (real work, never a timer) ----

/** The import's real progress: how many files have been read and
 *  parsed, and how many bytes have been read, out of the totals.
 *  The view advances these numbers after each awaited read/parse. */
export interface ImportProgress {
  /** 'reading' while file bytes are being read, 'parsing' while a
   *  file's bytes are being turned into a model. */
  phase: 'reading' | 'parsing';
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
  /** The file currently being read or parsed. */
  current: string;
}

/** Whole percent from real work: bytes when there are any (a ZIP's
 *  bytes are read before its models are parsed, so bytes are the
 *  honest denominator), files when the total is 0 bytes. */
export function importProgressPercent(p: ImportProgress): number {
  if (p.bytesTotal > 0) return Math.min(100, Math.floor((p.bytesDone / p.bytesTotal) * 100));
  if (p.filesTotal > 0) return Math.min(100, Math.floor((p.filesDone / p.filesTotal) * 100));
  return 0;
}

export function importProgressLabel(p: ImportProgress): string {
  const verb = p.phase === 'reading' ? 'Reading' : 'Parsing';
  return verb + ' ' + p.current + ' — file ' + Math.min(p.filesDone + 1, p.filesTotal) + ' of ' + p.filesTotal + ' (' + importProgressPercent(p) + '%)';
}

// ---- Add / Cancel (pure part) ----

/** BUILD 1046: what the player chose for one name collision —
 *  keep both (the new model is renamed, as before), replace (the
 *  old asset and its placed copies go away, the new model takes
 *  the name), or skip (the new model is dropped). */
export type OverwriteChoice = 'keep' | 'replace' | 'skip';

export interface NameCollision {
  /** The pending asset that would collide. */
  pending: CustomAsset;
  /** The library asset it would collide with (same exact name). */
  existing: CustomAsset;
}

/** BUILD 1046: every pending asset whose name already exists in
 *  the library (exact match — the same notion uniquifyAssetName
 *  uses, so a name it would rename is exactly a name that
 *  collides). The view asks the player about these BEFORE
 *  committing anything — a name is never silently overwritten. */
export function findNameCollisions(library: CustomAsset[], pending: CustomAsset[]): NameCollision[] {
  const byName = new Map(library.map((a) => [a.name, a]));
  const out: NameCollision[] = [];
  for (const p of pending) {
    const existing = byName.get(p.name);
    if (existing) out.push({ pending: p, existing });
  }
  return out;
}

/** Plan an Add: uniquify every pending name against the live
 *  library (and against each other, in order) and check the library
 *  budgets. Returns the assets ready to write plus any reason the
 *  commit cannot happen — the view writes only what is returned
 *  here, so a failed budget never half-commits a batch.
 *
 *  BUILD 1046: `resolutions` carries the player's answer for each
 *  colliding pending asset (keyed by pending id, from
 *  findNameCollisions). 'keep' is the old behaviour (rename the
 *  newcomer); 'replace' keeps the name and lists the old asset in
 *  `replaced` for the view to delete (with its placed copies);
 *  'skip' drops the newcomer. A collision with no resolution is
 *  treated as 'keep' — never as a silent replace. The budget check
 *  counts the library MINUS the replaced assets, since those go
 *  away in the same commit. */
export function planLibraryCommit(
  library: CustomAsset[],
  pending: CustomAsset[],
  resolutions?: Map<string, OverwriteChoice>,
): { toAdd: CustomAsset[]; replaced: CustomAsset[]; failed: string[] } {
  const taken = new Set(library.map((a) => a.name));
  const byName = new Map(library.map((a) => [a.name, a]));
  const toAdd: CustomAsset[] = [];
  const replaced: CustomAsset[] = [];
  for (const raw of pending) {
    const existing = byName.get(raw.name);
    const choice = resolutions?.get(raw.id);
    if (existing && choice === 'skip') continue;
    if (existing && choice === 'replace') {
      replaced.push(existing);
      taken.delete(raw.name);
      toAdd.push({ ...raw });
      taken.add(raw.name);
      continue;
    }
    const name = uniquifyAssetName([...taken], raw.name);
    taken.add(name);
    toAdd.push({ ...raw, name });
  }
  const replacedIds = new Set(replaced.map((a) => a.id));
  const remaining = library.filter((a) => !replacedIds.has(a.id));
  const budget = checkLibraryBudgets(remaining, toAdd);
  if (!budget.ok) return { toAdd: [], replaced: [], failed: ['Upload failed: ' + budget.reason] };
  return { toAdd, replaced, failed: [] };
}

/** Cancel: drop one pending asset. Pure list removal — nothing was
 *  ever written for a pending asset, so discarding it leaves the
 *  library exactly as it was. */
export function discardPending(pending: CustomAsset[], id: string): CustomAsset[] {
  return pending.filter((a) => a.id !== id);
}

// ---- Preview: a software rasterizer over the model's own geometry ----

/** A rendered preview: RGBA pixels (row-major, top-left origin),
 *  drawn from the asset's positions + per-vertex colours. Alpha 0
 *  where nothing was drawn. */
export interface AssetPreview {
  size: number;
  pixels: Uint8ClampedArray;
  /** How many pixels the model actually covers. */
  drawnPixels: number;
}

/** True when the asset has geometry a preview can be drawn from.
 *  A model with no triangles returns null from renderAssetPreview
 *  instead of a fake picture — the view says "cannot preview" then. */
export function canPreviewAsset(a: CustomAsset): boolean {
  return a.indices.length >= 3;
}

const ISO_COS = 0.8660254037844386; // cos(30°)

/** Draw the model's triangles into a square pixel buffer, in an
 *  isometric projection (the same view angle the game uses), far
 *  triangles first (painter's order by depth), each triangle filled
 *  with the mean of its three vertex colours. Deterministic: the
 *  same asset always previews the same pixels. */
export function renderAssetPreview(a: CustomAsset, size = 96): AssetPreview | null {
  if (!canPreviewAsset(a)) return null;
  const n = a.positions.length / 3;
  // Project every vertex once: sx = (x - z) * cos30, sy = (x + z)/2 - y.
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = a.positions[i * 3], y = a.positions[i * 3 + 1], z = a.positions[i * 3 + 2];
    const sx = (x - z) * ISO_COS;
    const sy = (x + z) * 0.5 - y;
    px[i] = sx; py[i] = sy;
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }
  const pad = 4;
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = (size - pad * 2) / Math.max(spanX, spanY);
  const offX = pad + (size - pad * 2 - spanX * scale) / 2 - minX * scale;
  const offY = pad + (size - pad * 2 - spanY * scale) / 2 - minY * scale;
  const pixels = new Uint8ClampedArray(size * size * 4);
  // Triangle order: far (small x+z) first, so near faces paint over far ones.
  const tris: Array<{ i0: number; i1: number; i2: number; depth: number }> = [];
  for (let t = 0; t + 2 < a.indices.length; t += 3) {
    const i0 = a.indices[t], i1 = a.indices[t + 1], i2 = a.indices[t + 2];
    const depth =
      (a.positions[i0 * 3] + a.positions[i0 * 3 + 2] + a.positions[i1 * 3] + a.positions[i1 * 3 + 2] + a.positions[i2 * 3] + a.positions[i2 * 3 + 2]) / 3;
    tris.push({ i0, i1, i2, depth });
  }
  tris.sort((p, q) => p.depth - q.depth);
  let drawn = 0;
  for (const tri of tris) {
    const x0 = px[tri.i0] * scale + offX, y0 = py[tri.i0] * scale + offY;
    const x1 = px[tri.i1] * scale + offX, y1 = py[tri.i1] * scale + offY;
    const x2 = px[tri.i2] * scale + offX, y2 = py[tri.i2] * scale + offY;
    const r = Math.round(((a.colors[tri.i0 * 3] + a.colors[tri.i1 * 3] + a.colors[tri.i2 * 3]) / 3) * 255);
    const g = Math.round(((a.colors[tri.i0 * 3 + 1] + a.colors[tri.i1 * 3 + 1] + a.colors[tri.i2 * 3 + 1]) / 3) * 255);
    const b = Math.round(((a.colors[tri.i0 * 3 + 2] + a.colors[tri.i1 * 3 + 2] + a.colors[tri.i2 * 3 + 2]) / 3) * 255);
    // Barycentric fill over the triangle's pixel bounding box.
    const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxPx = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxPy = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)));
    const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (denom === 0) continue;
    for (let y = minPy; y <= maxPy; y++) {
      for (let x = minPx; x <= maxPx; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        const w0 = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / denom;
        const w1 = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const idx = (y * size + x) * 4;
        if (pixels[idx + 3] === 0) drawn++;
        pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = 255;
      }
    }
  }
  return { size, pixels, drawnPixels: drawn };
}

/** Count preview pixels near an RGB colour (each channel within
 *  `tol`). The asserts use this to prove the preview really shows
 *  the model's colours: a red model previews red pixels. */
export function previewPixelsNear(preview: AssetPreview, rgb: [number, number, number], tol = 40): number {
  let count = 0;
  const p = preview.pixels;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    if (Math.abs(p[i] - rgb[0]) <= tol && Math.abs(p[i + 1] - rgb[1]) <= tol && Math.abs(p[i + 2] - rgb[2]) <= tol) count++;
  }
  return count;
}
