// BUILD 389: isometric landscape tileset (user-supplied Kenney-style pack).
//
// The pack's tiles are chunky 32x32 blocks / flat diamonds drawn 2x with
// nearest-neighbor so pixels stay square; each block is self-contained, so
// they tile as a blocky relief over the 2:1 game grid (painter-ordered,
// back rows first). Ground tiles draw centered on the tile; decor sprites
// were pre-cropped to their alpha bbox and draw bottom-anchored.
//
// Pure selectors (groundTileFor / decorTileFor) are deterministic in
// (tile, chunk offset) so the terrain never shimmers between frames.
// Collision, terrain data and game logic are untouched — visual only.

export const ISO_TILES_BASE = 'iso-tiles';

/** Ground tile numbers per terrain (files: iso-tiles/ground/tile_NNN.png). */
export const GROUND_TILES: Record<string, number[]> = {
  meadow: [24, 27, 28, 29, 30, 36, 37, 38, 39, 40],
  forest: [25, 26, 31, 32, 33, 34, 35],
  desert: [0, 1, 2, 3, 4, 5],
  shore: [6, 7, 8, 9, 10, 11],
  rock: [13, 14, 15, 16, 17, 18, 19, 20, 21],
  tundra: [104, 105, 106, 107, 108, 109, 110, 111, 112, 113],
  ocean: [86, 87, 88, 89, 90, 91, 92, 93, 94, 95],
  road: [12, 1],
};

/** Decor tile numbers per terrain (files: iso-tiles/decor/decor_NNN.png). */
export const DECOR_TILES: Record<string, number[]> = {
  meadow: [41, 42, 43, 44, 45, 46, 47],
  forest: [41, 42, 43, 44, 45, 46, 47, 48, 51, 52, 53],
  desert: [54, 55, 56, 57, 58, 59, 60],
  shore: [54, 55, 61, 62],
  rock: [54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71],
  tundra: [72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83],
  ocean: [],
  road: [],
};

/** Deterministic 32-bit hash of tile + chunk offset + salt. */
function hashTile(lx: number, ly: number, salt: number, ox: number, oy: number): number {
  let h = (Math.imul(lx | 0, 73856093) ^ Math.imul(ly | 0, 19349663) ^ Math.imul(salt | 0, 83492791) ^ Math.imul(((ox * 31 + oy * 57) | 0), 2654435761)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h;
}

/** Which ground tile number to draw for a terrain at a tile. Unknown terrain falls back to meadow. */
export function groundTileFor(terrain: string, lx: number, ly: number, ox: number, oy: number): number {
  const list = GROUND_TILES[terrain] ?? GROUND_TILES.meadow;
  return list[hashTile(lx, ly, terrain.length + 7, ox, oy) % list.length];
}

/**
 * Which decor tile to draw on a tile, or -1 for none. Sparse (~14%) so the
 * field reads as terrain with accents, not clutter.
 */
export function decorTileFor(terrain: string, lx: number, ly: number, ox: number, oy: number): number {
  const list = DECOR_TILES[terrain];
  if (!list || list.length === 0) return -1;
  const h = hashTile(lx, ly, 99, ox, oy);
  if (h % 100 >= 14) return -1;
  return list[(h >>> 8) % list.length];
}

// ---------------------------------------------------------------------------
// Loading + canvas draw
// ---------------------------------------------------------------------------

const groundImgs = new Map<number, HTMLImageElement>();
const decorImgs = new Map<number, HTMLImageElement>();
const warnedUrls = new Set<string>();
const failedImgs = new Set<HTMLImageElement>();
let preloadStarted = false;

function loadImg(url: string, onDone: () => void): HTMLImageElement {
  const im = new Image();
  im.onload = onDone;
  im.onerror = () => { if (!warnedUrls.has(url)) { warnedUrls.add(url); console.warn(`[isoTiles] missing: ${url}`); } failedImgs.add(im); onDone(); };
  im.src = url;
  return im;
}

/** Start loading every tile/decor image. Safe to call repeatedly. */
export function preloadIsoTiles(): void {
  if (preloadStarted || typeof window === 'undefined') return;
  preloadStarted = true;
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const seen = new Set<number>();
  for (const list of Object.values(GROUND_TILES)) for (const n of list) seen.add(n);
  for (const n of seen) {
    const url = `${base}${ISO_TILES_BASE}/ground/tile_${String(n).padStart(3, '0')}.png`;
    groundImgs.set(n, loadImg(url, () => {}));
  }
  const dseen = new Set<number>();
  for (const list of Object.values(DECOR_TILES)) for (const n of list) dseen.add(n);
  for (const n of dseen) {
    const url = `${base}${ISO_TILES_BASE}/decor/decor_${String(n).padStart(3, '0')}.png`;
    decorImgs.set(n, loadImg(url, () => {}));
  }
}

function imgReady(im: HTMLImageElement | undefined): im is HTMLImageElement {
  return !!im && im.complete && im.naturalWidth > 0;
}

/** True once every tile image has pixels (or failed). */
export function isoTilesReady(): boolean {
  if (!preloadStarted) return false;
  for (const im of groundImgs.values()) {
    if (!imgReady(im) && !failedImgs.has(im)) return false;
  }
  for (const im of decorImgs.values()) {
    if (!imgReady(im) && !failedImgs.has(im)) return false;
  }
  return true;
}

function withCrisp(g: CanvasRenderingContext2D, fn: () => void): void {
  const s = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  try { fn(); } finally { g.imageSmoothingEnabled = s; }
}

/**
 * Draw a ground tile centered on (x, y) at 2x. Returns false when the image
 * isn't ready (caller falls back to the procedural fill).
 */
export function drawGroundTile(g: CanvasRenderingContext2D, n: number, x: number, y: number): boolean {
  const im = groundImgs.get(n);
  if (!imgReady(im)) return false;
  withCrisp(g, () => { g.drawImage(im, Math.round(x - 32), Math.round(y - 32), 64, 64); });
  return true;
}

/** Draw a decor sprite bottom-anchored at (x, y) at 2x. Returns false when not ready. */
export function drawDecor(g: CanvasRenderingContext2D, n: number, x: number, y: number): boolean {
  const im = decorImgs.get(n);
  if (!imgReady(im)) return false;
  const w = im.naturalWidth * 2, h = im.naturalHeight * 2;
  withCrisp(g, () => { g.drawImage(im, Math.round(x - w / 2), Math.round(y - h), w, h); });
  return true;
}
