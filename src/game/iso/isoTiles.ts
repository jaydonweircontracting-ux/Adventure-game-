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
const GRASS_GROUND_TILES = [24, 27, 28, 29, 30, 36, 37, 38, 39, 40];

export const GROUND_TILES: Record<string, number[]> = {
  // One continuous grass tileset under all grassy land. Forests are made
  // visually distinct by tree/decor layers rather than a mismatched floor.
  grass: GRASS_GROUND_TILES,
  meadow: GRASS_GROUND_TILES,
  forest: GRASS_GROUND_TILES,
  desert: [0, 1, 2, 3, 4, 5],
  shore: [6, 7, 8, 9, 10, 11],
  rock: [13, 14, 15, 16, 17, 18, 19, 20, 21],
  tundra: [104, 105, 106, 107, 108, 109, 110, 111, 112, 113],
  ocean: [86, 87, 88, 89, 90, 91, 92, 93, 94, 95],
  road: [12, 1],
  cobble: [13, 14, 15, 16], // BUILD 604: cobblestone plaza (stone tiles)
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
export function hashTile(lx: number, ly: number, salt: number, ox: number, oy: number): number {
  let h = (Math.imul(lx | 0, 73856093) ^ Math.imul(ly | 0, 19349663) ^ Math.imul(salt | 0, 83492791) ^ Math.imul(((ox * 31 + oy * 57) | 0), 2654435761)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h;
}

/** Which ground tile number to draw for a terrain at a tile. Unknown terrain falls back to meadow. */
export function groundTileFor(terrain: string, lx: number, ly: number, ox: number, oy: number): number {
  const list = GROUND_TILES[terrain] ?? GROUND_TILES.grass;
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
// BUILD 695: storybook sandy ground inside Mosslight (chunk 4,7).
// Seeded radial mask around the town center (world 1264,2104 = chunk-local
// 144,144): sandy tan inside, blending to green at the town edge. Pure and
// deterministic — the same (wx,wy) always gives the same answer.
// ---------------------------------------------------------------------------

/** Mosslight town center in world tile coords (chunk 4,7 local 144,144). */
export const MOSSLIGHT_SAND_CX = 4 * 280 + 144;
export const MOSSLIGHT_SAND_CY = 7 * 280 + 144;

/**
 * Sandy-ground mask at world tile coords: 1 = full sand, 0 = normal terrain.
 * The blend edge wobbles deterministically with angle so the sand/green
 * boundary isn't a perfect circle.
 */
export function mosslightSandAt(wx: number, wy: number): number {
  const dx = wx - MOSSLIGHT_SAND_CX, dy = wy - MOSSLIGHT_SAND_CY;
  const d = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const wob = Math.abs(Math.sin(ang * 3.7 + 1.3) * 0.5 + Math.sin(ang * 7.9 + 4.1) * 0.5);
  const rIn = 135, rOut = 165 + wob * 14;
  if (d <= rIn) return 1;
  if (d >= rOut) return 0;
  return (rOut - d) / (rOut - rIn);
}

// ---------------------------------------------------------------------------
// BUILD 698: farmland ring around Mosslight (town chunks absCx 3..5, absCy 6..8).
// Large seeded field parcels outside the 695 sandy mask, matching the
// reference's outskirts: alternating plots in pale ochre #E8D8A0, muted
// green #A8C090, brown soil #B8A890, separated by dirt tracks, with
// hedgerow/fence boundaries and farmstead plots (farmhouse + barn).
// Pure and deterministic in world tile coords. Visual only — no collision,
// no doors, no gameplay state.
// ---------------------------------------------------------------------------

/** Farmland plot codes returned by farmlandPlotAt (world tile coords). */
export const FARM_NONE = 0;
export const FARM_OCHRE = 1; // pale ochre #E8D8A0
export const FARM_GREEN = 2; // muted green #A8C090
export const FARM_SOIL = 3; // brown soil   #B8A890
export const FARM_TRACK = 4; // dirt track   #BFA878

/** Base colors for the FARM_* codes above (index = code - 1).
 * BUILD 916: retuned so plots read as what they are — wheat ochre, crop
 * green, tilled soil brown, dirt track — instead of three pale beiges. */
export const FARM_BASE_COLORS = ['#dec98e', '#7cab58', '#8f6d4b', '#b39a67'];

/** Farmland detail codes returned by farmlandDetailAt: 0 none, 1 hedge, 2 fence, 3 farmhouse, 4 barn. */
export const FARM_DET_NONE = 0;
export const FARM_DET_HEDGE = 1;
export const FARM_DET_FENCE = 2;
export const FARM_DET_HOUSE = 3;
export const FARM_DET_BARN = 4;

/** Tiles per plot cell (2-tile dirt track + 16-tile plot). */
export const FARM_CELL = 18;

/** Farmstead anchors (world tile coords, comfortably inside plots, not on tracks). */
export const FARMSTEADS: Array<readonly [number, number]> = [
  [1058, 1988], // west of town
  [1482, 1958], // north-east of town
  [1248, 2332], // south of town
];

/** Outer radius of the farmland ring from the Mosslight center (world tiles). */
export const FARM_RING_R = 330;

/**
 * Farmland plot code at world tile coords, or FARM_NONE.
 * `sandy` is the caller's 695 mask result (mosslightSandAt > 0.5) — sand
 * always wins over farmland so the town mask is never broken.
 */
export function farmlandPlotAt(wx: number, wy: number, sandy: boolean): number {
  if (sandy) return FARM_NONE;
  const acx = Math.floor(wx / 280), acy = Math.floor(wy / 280);
  if (acx < 3 || acx > 5 || acy < 6 || acy > 8) return FARM_NONE;
  const dx = wx - MOSSLIGHT_SAND_CX, dy = wy - MOSSLIGHT_SAND_CY;
  if (dx * dx + dy * dy > FARM_RING_R * FARM_RING_R) return FARM_NONE;
  const px = Math.floor(wx / FARM_CELL), py = Math.floor(wy / FARM_CELL);
  const lx = wx - px * FARM_CELL, ly = wy - py * FARM_CELL;
  if (lx < 2 || ly < 2) return FARM_TRACK;
  // Farmstead plots render as tilled soil.
  for (const [fx, fy] of FARMSTEADS) {
    if (Math.floor(fx / FARM_CELL) === px && Math.floor(fy / FARM_CELL) === py) return FARM_SOIL;
  }
  return 1 + (hashTile(px, py, 698, 0, 0) % 3);
}

/**
 * Farmland boundary/sprite detail at world tile coords. Only meaningful when
 * farmlandPlotAt returns a plot (not a track). Deterministic per tile.
 */
export function farmlandDetailAt(wx: number, wy: number): number {
  const px = Math.floor(wx / FARM_CELL), py = Math.floor(wy / FARM_CELL);
  const lx = wx - px * FARM_CELL, ly = wy - py * FARM_CELL;
  // Farmstead sprites: farmhouse at the anchor tile, barn offset within the plot.
  for (const [fx, fy] of FARMSTEADS) {
    if (Math.floor(fx / FARM_CELL) === px && Math.floor(fy / FARM_CELL) === py) {
      const cx = Math.floor(fx) - px * FARM_CELL, cy = Math.floor(fy) - py * FARM_CELL;
      if (lx === cx && ly === cy) return FARM_DET_HOUSE;
      const bh = hashTile(px, py, 700, 0, 0);
      const bx = Math.min(14, Math.max(3, cx + (bh % 2 === 0 ? 4 : -4)));
      const by = Math.min(14, Math.max(3, cy + 4));
      if (lx === bx && ly === by) return FARM_DET_BARN;
      return FARM_DET_NONE;
    }
  }
  // Plot boundaries (outer ring, adjacent to the track) get hedges or fences.
  const edge = lx === 2 || ly === 2 || lx === FARM_CELL - 1 || ly === FARM_CELL - 1;
  if (!edge) return FARM_DET_NONE;
  return hashTile(px, py, 699, 0, 0) % 2 === 0 ? FARM_DET_HEDGE : FARM_DET_FENCE;
}

// ---------------------------------------------------------------------------
// BUILD 916: continuous ground tones (the checkerboard fix).
//
// Every ground surface used to pick a discrete shade bucket per tile from
// hashTile (sand: %8 shades, farm: %4 shades, tileset art: %10 blocks). The
// XOR hash's low bits correlate with tile parity, so the buckets landed in
// near-perfect alternating light/dark diamonds — the whole world read as a
// two-tone checkerboard quilt (town sand, farm plots, meadow, river alike).
//
// Ground tone is now a smooth value-noise field over world coordinates:
// neighboring tiles always get neighboring tones, so no surface can checker.
// Three brightness octaves (broad/medium/fine) plus a large-scale "patch"
// channel for mixing between two tones of the same surface. Pure functions
// of world coords — identical every load, no shimmer, no per-frame state.
// ---------------------------------------------------------------------------

function toneLattice(ix: number, iy: number, seed: number): number {
  const s = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smoothstep-interpolated value noise over a global lattice. Returns 0..1. */
export function groundValueNoise(u: number, v: number, seed: number): number {
  const ix = Math.floor(u), iy = Math.floor(v);
  const fx = u - ix, fy = v - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = toneLattice(ix, iy, seed), b = toneLattice(ix + 1, iy, seed);
  const c = toneLattice(ix, iy + 1, seed), d = toneLattice(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export interface GroundTone {
  /** Brightness multiplier, ~[0.89, 1.11], spatially smooth. */
  shade: number;
  /** Large-scale patch channel 0..1 for mixing two tones of one surface. */
  patch: number;
}

const TONE_CACHE_MAX = 65536;
const toneCache = new Map<number, GroundTone>();

/** Continuous ground tone at world tile coords. Deterministic forever.
 * Memoized (bounded) — the ground renderer repaints the same tiles on
 * every cache rebuild as the camera moves, and the tone never changes. */
export function groundToneAt(wx: number, wy: number): GroundTone {
  const key = (wx + 8192) * 16384 + (wy + 8192);
  let t = toneCache.get(key);
  if (!t) {
    const coarse = groundValueNoise(wx / 120, wy / 120, 9161);
    const mid = groundValueNoise(wx / 41, wy / 41, 9162);
    const fine = groundValueNoise(wx / 11, wy / 11, 9163);
    const shade = 1 + (coarse - 0.5) * 0.09 + (mid - 0.5) * 0.08 + (fine - 0.5) * 0.05;
    const patch = groundValueNoise(wx / 170, wy / 170, 9164);
    t = { shade, patch };
    while (toneCache.size >= TONE_CACHE_MAX) {
      const oldest = toneCache.keys().next();
      if (oldest.done) break;
      toneCache.delete(oldest.value);
    }
    toneCache.set(key, t);
  }
  return t;
}

function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rgbHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
}

/** Lerp between two hex colors, t in 0..1. */
export function mixHexColor(a: string, b: string, t: number): string {
  const ca = hexRgb(a), cb = hexRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbHex(ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k);
}

/** Multiply a hex color by a brightness factor. */
export function shadeHexColor(hex: string, f: number): string {
  const c = hexRgb(hex);
  return rgbHex(c[0] * f, c[1] * f, c[2] * f);
}

// ---------------------------------------------------------------------------
// BUILD 701: chunk-LOD ground classification cache (zoomed-out perf fix).
//
// The chunk-LOD path (zm < 0.35) classifies 576 subtiles per frame. The sand
// mask (BUILD 695), farmland layout (BUILD 698) and the deterministic
// brightness hash are all STATIC per world subtile — recomputing the trig
// (hypot/atan2/2x sin in mosslightSandAt) 576x per frame was the hotspot.
// Subtile origins are integer world tile coords, so the classification is
// memoized per origin and computed at most once ever. The visual output is
// unchanged: same kind mapping and the same hash formula as the old loop.
//
// A cheap squared-distance reject runs before the trig-heavy mask on the
// first computation: the sand blend edge can never exceed 165 + 14 = 179
// tiles from the Mosslight center, so distant subtiles skip mosslightSandAt
// entirely.
// ---------------------------------------------------------------------------

/** Per-subtile LOD classification: 0 = normal, 1 = sand, 2..5 = FARM_OCHRE..FARM_TRACK (code+1). */
export interface LodGroundClass {
  kind: number;
  /** Deterministic brightness hash in [0,1) — same formula the LOD loop used. */
  h: number;
}

/** Max possible sand-blend radius: rOut = 165 + wob*14, wob in [0,1]. */
const LOD_SAND_R_MAX = 179;
const LOD_CLASS_CACHE_MAX = 65536;

const lodClassCache = new Map<string, LodGroundClass>();

/**
 * Classify one chunk-LOD subtile. tx0/ty0 = integer subtile origin in world
 * tile coords, subN = subtile size in tiles. Pure in its inputs; results are
 * memoized (the underlying data is procedural and never changes).
 */
export function lodGroundClassAt(tx0: number, ty0: number, subN: number, skipFarm: boolean): LodGroundClass {
  const key = tx0 + ',' + ty0 + ',' + (skipFarm ? '1' : '0');
  let c = lodClassCache.get(key);
  if (!c) {
    const cx = tx0 + subN / 2, cy = ty0 + subN / 2;
    const dx = cx - MOSSLIGHT_SAND_CX, dy = cy - MOSSLIGHT_SAND_CY;
    // Fast reject: outside the max sand radius the mask is always 0.
    const sandy = dx * dx + dy * dy <= LOD_SAND_R_MAX * LOD_SAND_R_MAX
      && mosslightSandAt(cx, cy) > 0.5;
    let kind = 0;
    if (sandy) kind = 1;
    else if (!skipFarm) {
      // farmlandPlotAt returns FARM_NONE when sandy; we only reach here when
      // !sandy, so passing false is identical to the old call's `isSand`.
      const f = farmlandPlotAt(cx, cy, false);
      if (f > 0) kind = 1 + f;
    }
    const h = Math.abs(Math.sin((tx0 * 12.9898 + ty0 * 78.233) * 43758.5453) % 1);
    c = { kind, h };
    // Keep the cache bounded without throwing away every warm classification.
    while (lodClassCache.size >= LOD_CLASS_CACHE_MAX) {
      const oldest = lodClassCache.keys().next();
      if (oldest.done) break;
      lodClassCache.delete(oldest.value);
    }
    lodClassCache.set(key, c);
  }
  return c;
}

/** Current number of memoized LOD subtile classifications (debug/introspection). */
export function lodClassCacheSize(): number {
  return lodClassCache.size;
}

// ---------------------------------------------------------------------------
// Loading + canvas draw
// ---------------------------------------------------------------------------

const groundImgs = new Map<number, HTMLImageElement>();
const decorImgs = new Map<number, HTMLImageElement>();
// Optional source materials supplied in game sprites/world tiles.
const WORLD_TEXTURE_FILES = {
  grass: 'grassland.png',
  path: 'path.png',
  rock: 'rock_diffuse.png',
  water: 'water.png',
} as const;
type WorldTextureKey = keyof typeof WORLD_TEXTURE_FILES;
const worldTextureImgs = new Map<WorldTextureKey, HTMLImageElement>();
const warnedUrls = new Set<string>();
const failedImgs = new Set<HTMLImageElement>();
let preloadStarted = false;
let pendingImages = 0;

function loadImg(url: string, onDone: () => void): HTMLImageElement {
  const im = new Image();
  // Decode large batches of pixel-art assets off the critical rendering path.
  im.decoding = 'async';
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    pendingImages = Math.max(0, pendingImages - 1);
    onDone();
  };
  im.onload = done;
  im.onerror = () => { if (!warnedUrls.has(url)) { warnedUrls.add(url); console.warn(`[isoTiles] missing: ${url}`); } failedImgs.add(im); done(); };
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
  const dseen = new Set<number>();
  for (const list of Object.values(DECOR_TILES)) for (const n of list) dseen.add(n);
  // Count first so cached images cannot complete before the total is known.
  pendingImages = seen.size + dseen.size;
  // These material maps are optional overlays; a missing image never blocks
  // the existing tileset or the game's first render.
  for (const [key, file] of Object.entries(WORLD_TEXTURE_FILES) as Array<[WorldTextureKey, string]>) {
    const texture = new Image();
    texture.decoding = 'async';
    texture.src = `${base}game%20sprites/world%20tiles/${file}`;
    worldTextureImgs.set(key, texture);
  }
  for (const n of seen) {
    const url = `${base}${ISO_TILES_BASE}/ground/tile_${String(n).padStart(3, '0')}.png`;
    groundImgs.set(n, loadImg(url, () => {}));
  }
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
  // O(1) per frame: load/error handlers maintain this counter instead of
  // rescanning every ground and decor image on every animation frame.
  return preloadStarted && pendingImages === 0;
}

function withCrisp(g: CanvasRenderingContext2D, fn: () => void): void {
  // The iso renderer keeps smoothing disabled for its whole frame. Avoid two
  // canvas state writes for every tiny tile draw in that hot path.
  if (!g.imageSmoothingEnabled) { fn(); return; }
  const s = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  try { fn(); } finally { g.imageSmoothingEnabled = s; }
}

/**
 * Draw a ground tile centered on (x, y) at 2x. Returns false when the image
 * isn't ready (caller falls back to the procedural fill).
 */
function worldTextureForGroundTile(n: number): WorldTextureKey | null {
  if (n >= 24 && n <= 40) return 'grass';
  if (n === 12) return 'path';
  if (n >= 13 && n <= 21) return 'rock';
  if (n >= 86 && n <= 95) return 'water';
  return null;
}

/** Draw the existing tile and blend in a subtle user-supplied material. */
export function drawGroundTile(g: CanvasRenderingContext2D, n: number, x: number, y: number): boolean {
  const im = groundImgs.get(n);
  if (!imgReady(im)) return false;
  withCrisp(g, () => {
    const left = Math.round(x - 32);
    g.drawImage(im, left, Math.round(y - 32), 64, 64);
    const key = worldTextureForGroundTile(n);
    const texture = key ? worldTextureImgs.get(key) : undefined;
    if (!imgReady(texture)) return;
    // Keep the texture within the visible diamond; preserve existing tile art.
    g.save();
    g.beginPath();
    g.moveTo(x, y - 16);
    g.lineTo(x + 32, y);
    g.lineTo(x, y + 16);
    g.lineTo(x - 32, y);
    g.closePath();
    g.clip();
    g.globalAlpha = 0.18;
    g.globalCompositeOperation = 'soft-light';
    g.drawImage(texture, left, Math.round(y - 16), 64, 32);
    g.restore();
  });
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
