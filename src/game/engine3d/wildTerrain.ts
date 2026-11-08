// BUILD 1024 — infinite wilderness beyond the 200x200 authored map.
//
// The wall the user reported was not a rendered wall: the ground rings
// already render grass to the horizon (1007) and terrainAt already
// falls back to grass outside the map. The wall was WALKABILITY:
// isWalkableWorld (isoWorld.ts) returns false outside the map bounds,
// walkableWithPlacements inherits it, the view's walkableAt inherits
// that, pickGround refuses out-of-map taps, and savedPosition rescues
// an out-of-map save to the spawn. This module is the wilderness side
// of removing that wall: pure, deterministic functions of tile
// coordinates for everything that exists past the edge. No React, no
// DOM, no I/O — safe for the sim/test import graphs (it imports only
// the scatter hash and the smooth noise field).
//
// Terrain rule (out-of-map tiles only; in-map tiles are governed by
// the stored world and never consult this module):
//   - Ocean: west of the BUILD 1027 coastline (oceanAt) — the sea
//     extends infinitely west, so out-of-map west is water, not grass.
//     Ocean wins over lakes (a lake west of the coast is sea anyway).
//   - Lakes: groundNoise(x, y, 32) > 0.90. Measured on a 400x400
//     out-of-map sample: 1.76% water — occasional coherent lake blobs
//     (the field is smooth at 32-tile scale), not speckles, and never
//     near town (lakes are out-of-map only by construction).
//     BUILD 1031 correction: measured on an 801x801 out-of-map sample
//     the lakes are LARGE, not "a few tiles across" — 23 blobs, the
//     biggest 987 tiles with a 48-tile diameter (0.98% water overall).
//     That size is why a centre-sampled far cell mis-renders so
//     visibly: one 16-tile cell can sit entirely inside a lake, or
//     straddle its edge, and the old scan never looked.
//   - Everything else is grass (the terrainAt fallback, kept).
// Obstacle rule: the stored wilderness scatter in defaultWorld uses
// hash2(x, y, 7) with tree < 0.006 and rock in [0.006, 0.008), skipping
// inTown/onRoad/inPond — and every one of those exclusions is false
// outside the map, so the SAME hash with the SAME salt and thresholds
// continues the scatter exactly past the edge. Verified in the 1024
// asserts: every stored scatter tree/rock satisfies its rule. A tile
// cannot be both a lake and a tree/rock: lake wins, so no tree stands
// in a lake and no rock sits in one.
// Walkability: wild grass is walkable; ocean, lakes, wild trees and
// wild rocks block, exactly like their in-map counterparts (water,
// tree, rock). Chopped/mined wild items stay gone via the world's
// removedWildTrees / removedWildRocks sets (same rule as 987/989).
// NPCs, animals and transients never consult this module: their
// targets and spawn bands are all in-town, and their walkability
// (walkableWithPlacements -> isWalkableWorld) stays in-bounds. The
// wilderness is player-only by construction — "empty chunks", as
// ordered: landscape, no town, no NPCs, no quests.
import { hash2 as scatterHash, oceanAt, oceanCoastX, terrainAt, terrainKey, inBounds, type Terrain } from '../iso/isoWorld';
import { groundNoise, groundElevation } from './townLook';
import { placedPathKeyInts, placedWaterKeyInts, tileKeyInt } from './placements';
import type { IsoWorld } from '../iso/isoWorld';

/** Salt of the stored wilderness scatter (defaultWorld). */
export const WILD_SCATTER_SALT = 7;
/** Scatter thresholds, identical to defaultWorld. */
export const WILD_TREE_MAX = 0.006;
export const WILD_ROCK_MAX = 0.008;
/** Lake field: smooth noise at 32-tile scale, thresholded. */
export const WILD_LAKE_SPACING = 32;
export const WILD_LAKE_THRESHOLD = 0.9;

/** The scatter hash for one tile (0..1), exactly defaultWorld's. */
export function wildScatter(x: number, y: number): number {
  return scatterHash(x, y, WILD_SCATTER_SALT);
}

/** True when the smooth lake field puts water on this tile. */
export function wildLakeAt(x: number, y: number): boolean {
  return lakeNoiseAt(x, y) > WILD_LAKE_THRESHOLD;
}

/** True when the scatter hash puts a wild tree on this tile
 *  (and the tile is not a lake or ocean — water wins). */
export function wildTreeAt(x: number, y: number): boolean {
  return !oceanAt(x, y) && !wildLakeAt(x, y) && wildScatter(x, y) < WILD_TREE_MAX;
}

/** True when the scatter hash puts a wild rock on this tile
 *  (and the tile is not a lake or ocean — water wins). */
export function wildRockAt(x: number, y: number): boolean {
  if (oceanAt(x, y)) return false;
  if (wildLakeAt(x, y)) return false;
  const h = wildScatter(x, y);
  return h >= WILD_TREE_MAX && h < WILD_ROCK_MAX;
}

/** The wild obstacle on a tile, if any ('tree' | 'rock' | null). */
export function wildObstacleAt(x: number, y: number): 'tree' | 'rock' | null {
  if (wildTreeAt(x, y)) return 'tree';
  if (wildRockAt(x, y)) return 'rock';
  return null;
}

/** Max cell area (tiles) that gets a full per-tile mix scan: band
 *  cells are 4x4 (16), far cells 16x16 (256). Horizon cells are
 *  64x64 (4096) and keep the clipped scan — a full scan there is
 *  ~1.2M noise calls per rebuild, and the horizon ring starts at 240
 *  tiles while visible ground ends at ~150 even at max zoom-out, so
 *  a centre-sampled horizon quad is never on screen. */
export const FAR_CELL_FULL_SCAN_MAX_TILES = 256;

/** BUILD 1031 — does the far cell [x0..x1]x[y0..y1] hold 2+ distinct
 *  terrains, so the renderer must subdivide it into per-row runs
 *  instead of one centre-sampled quad? `terrain` is the view's
 *  effTerrain (placed water/paths > in-map terrain > wild terrain);
 *  mapW/mapH are the authored-map bounds the clipped scan uses.
 *  Small cells (<=256 tiles: band + far, and any small sliver) scan
 *  the WHOLE cell, so a wild lake renders as its actual tiles and
 *  stays put as the player-centred grid shifts. Before this, the
 *  scan was clipped to cell ∩ map (the 1024 accepted limit: "wild
 *  lakes stay centre-sampled at distance"), so an out-of-map cell
 *  never scanned at all: a lake whose centre tile was water rendered
 *  as one solid blue quad, one whose centre was grass rendered as no
 *  water at all, and both flipped as the player walked — the
 *  user-reported "blue squares randomly appear and disappear in the
 *  distance". Large cells keep the clipped scan plus the analytic
 *  coast test, unchanged (a cell fully west of the coast is uniform
 *  ocean and correctly renders as one water quad). Cost, measured in
 *  ~/workspace/verify1031/measure2: +189k terrain calls / +7.7ms per
 *  rebuild near town, +214k / +30.9ms in deep wilderness, +1207 run
 *  quads (+7242 verts) near town, against a 165-211ms rebuild and a
 *  237k-vert buffer. A cheaper exact alternative exists (the lake
 *  field is bilinear per 32-tile lattice cell, so its max over a cell
 *  is at a lattice corner — a corner probe could prove "no lake" in
 *  ~9 calls); not taken now — the full scan is obviously correct and
 *  the saving is ~25ms on a ~200ms rebuild. */
export function cellIsMixed(
  x0: number, x1: number, y0: number, y1: number,
  terrain: (x: number, y: number) => string, mapW: number, mapH: number,
): boolean {
  const fullScan = (x1 - x0 + 1) * (y1 - y0 + 1) <= FAR_CELL_FULL_SCAN_MAX_TILES;
  const sx0 = fullScan ? x0 : Math.max(x0, 0);
  const sx1 = fullScan ? x1 : Math.min(x1, mapW - 1);
  const sy0 = fullScan ? y0 : Math.max(y0, 0);
  const sy1 = fullScan ? y1 : Math.min(y1, mapH - 1);
  let firstT: string | null = null;
  let mixed = false;
  for (let yy = sy0; yy <= sy1 && !mixed; yy++) for (let xx = sx0; xx <= sx1; xx++) {
    const t = terrain(xx, yy);
    if (firstT === null) firstT = t; else if (t !== firstT) { mixed = true; break; }
  }
  if (!mixed) {
    // Coast test: the cell straddles the coastline when the coast's
    // min/max over the cell's y-range overlaps the cell's x-range.
    // Conservative — a wavy coast may over-trigger by a cell;
    // subdivision is correct there, just a few extra quads.
    let cMin = Infinity, cMax = -Infinity;
    for (let yy = y0; yy <= y1 + 1; yy += 4) { const c = oceanCoastX(yy); if (c < cMin) cMin = c; if (c > cMax) cMax = c; }
    const cEnd = oceanCoastX(y1 + 1); if (cEnd < cMin) cMin = cEnd; if (cEnd > cMax) cMax = cEnd;
    mixed = cMin <= x1 + 1 && cMax >= x0;
  }
  return mixed;
}

/** Terrain of an out-of-map tile: 'water' for ocean or a lake,
 *  'grass' else. Never call for in-map tiles (terrainAt governs there). */
export function wildTerrainAt(x: number, y: number): 'grass' | 'water' {
  if (oceanAt(x, y)) return 'water';
  return wildLakeAt(x, y) ? 'water' : 'grass';
}

/** True when an out-of-map tile is walkable for the player: wild
 *  grass that holds no tree or rock, minus anything the player
 *  already chopped or mined (those stay gone, like 987/989). */
export function isWildWalkable(w: IsoWorld, x: number, y: number): boolean {
  if (oceanAt(x, y)) return false;
  if (wildLakeAt(x, y)) return false;
  const key = x + ',' + y;
  if (wildTreeAt(x, y) && !(w.removedWildTrees ?? []).includes(key)) return false;
  if (wildRockAt(x, y) && !(w.removedWildRocks ?? []).includes(key)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// BUILD 1034 — Stage 2 terrain: the heightfield surface, shores, stone,
// and the picker ray-march. All pure, all sampling ONE surface function
// (surfaceElevation) so the ground, every object, the picker and the
// camera agree by construction. Walkability is NOT here: the field is
// visual only, the tile step model stays flat (see the Stage 1 audit).
// ---------------------------------------------------------------------------

/** The effective terrain at a tile — hoisted from buildWorldVertices'
 *  effTerrain closure (identical rule) so the ground, the surface, the
 *  picker and the camera share ONE definition: placed water wins, then
 *  placed paths read as dirt, then the stored map terrain, then wild
 *  terrain past the edge. The placement key Sets are built once per call.
 *  BUILD 1035: integer keys (tileKeyInt — no "x,y" string allocation
 *  per call; the CPU profile put the old string-key closure at 20.4%
 *  of rebuild time) and a per-closure cache for the IN-MAP terrain
 *  (terrainAt builds a string key and scans removedWater per call, and
 *  the overlay loop, landBlendAt and the window all query the same
 *  tiles repeatedly — the cache makes repeats a Map hit). Wild tiles
 *  are NOT cached here (the far ring queries each once; the lake field
 *  below is the wild cache). The cache is per closure — a fresh
 *  effTerrainFor call (a new rebuild, a new frame, a new tap) starts
 *  empty, so a world edit can never read a stale entry from an older
 *  closure; an edit DURING a time-sliced rebuild is corrected by the
 *  rebuild the edit itself queues. */
export function effTerrainFor(world: IsoWorld): (x: number, y: number) => Terrain {
  const placedWater = placedWaterKeyInts(world);
  const placedPaths = placedPathKeyInts(world);
  const cache = new Map<number, Terrain>();
  return (x, y) => {
    const k = tileKeyInt(x, y);
    if (placedWater.has(k)) return 'water';
    if (placedPaths.has(k)) return 'dirt';
    if (inBounds(world, x, y)) {
      let t = cache.get(k);
      if (t === undefined) { t = terrainAt(world, x, y); cache.set(k, t); }
      return t;
    }
    return wildTerrainAt(x, y);
  };
}

// ---------------------------------------------------------------------------
// BUILD 1035 — the lake noise field, cached per 16x16 chunk.
//
// The far ring scans ~214k wild tiles per rebuild through wildLakeAt,
// and each call ran groundNoise (4 sin-hash calls). The field is pure
// position — it never changes — so the values are cached in 16x16
// chunks (Float64Array, one per chunk) and reused across rebuilds.
// A chunk is computed once (256 groundNoise calls) and then serves
// every later rebuild that touches it; driving only computes the new
// chunks at the ring's leading edge. Values are EXACTLY groundNoise
// (same function, same args) — the world looks identical, only faster.
// Float64Array, not Float32Array: a float32 round-trip shifts a value
// by ~2.5e-8, which could flip a tile whose noise sits exactly on the
// 0.90 lake threshold; float64 keeps the cached value bit-identical.
// Cap: 8192 chunks (~2M tiles, ~16MB); when exceeded the whole cache
// clears and repopulates (one slower, still time-sliced, rebuild).
// Callers pass INTEGER tile coords only (wildLakeAt, isShoreSand,
// isFoam all do); a fractional coord would index the chunk wrong.
// ---------------------------------------------------------------------------
/** Lake-field chunk side (tiles). */
export const LAKE_CHUNK = 16;
/** Max cached lake chunks before a full clear. */
export const LAKE_CHUNK_CACHE_MAX = 8192;
const lakeChunks = new Map<number, Float64Array>();

/** Raw lake-field noise at an integer tile — exactly groundNoise(x, y,
 *  WILD_LAKE_SPACING), served from the chunk cache. */
export function lakeNoiseAt(x: number, y: number): number {
  const cx = Math.floor(x / LAKE_CHUNK), cy = Math.floor(y / LAKE_CHUNK);
  const key = (cx + 2048) * 4096 + (cy + 2048);
  let chunk = lakeChunks.get(key);
  if (!chunk) {
    if (lakeChunks.size >= LAKE_CHUNK_CACHE_MAX) lakeChunks.clear();
    chunk = new Float64Array(LAKE_CHUNK * LAKE_CHUNK);
    const x0 = cx * LAKE_CHUNK, y0 = cy * LAKE_CHUNK;
    for (let yy = 0; yy < LAKE_CHUNK; yy++) for (let xx = 0; xx < LAKE_CHUNK; xx++) {
      chunk[yy * LAKE_CHUNK + xx] = groundNoise(x0 + xx, y0 + yy, WILD_LAKE_SPACING);
    }
    lakeChunks.set(key, chunk);
  }
  return chunk[(y - cy * LAKE_CHUNK) * LAKE_CHUNK + (x - cx * LAKE_CHUNK)];
}

/** Cached lake chunks (test/observability only). */
export function lakeChunkCacheSize(): number {
  return lakeChunks.size;
}

/** Land-ness at a continuous point: bilinear interpolation of the
 *  per-tile land values (1 = land, 0 = water) over the tile grid.
 *  Exactly 1 deep on land, exactly 0 deep in water, ramping over the
 *  one tile either side of a shoreline — so the surface slopes down
 *  into the water and the water stays flat at 0. */
export function landBlendAt(effTerrain: (x: number, y: number) => Terrain, x: number, z: number): number {
  const fx = Math.floor(x), fz = Math.floor(z);
  const ux = x - fx, uz = z - fz;
  const land = (tx: number, ty: number): number => effTerrain(tx, ty) === 'water' ? 0 : 1;
  const l00 = land(fx, fz), l10 = land(fx + 1, fz), l01 = land(fx, fz + 1), l11 = land(fx + 1, fz + 1);
  const top = l00 + (l10 - l00) * ux;
  const bot = l01 + (l11 - l01) * ux;
  return top + (bot - top) * uz;
}

/** THE surface: the heightfield at a continuous point, blended to 0 in
 *  water. The ground corners, every object's base y, the camera and the
 *  picker all sample this one function — agreement is by construction,
 *  not by four separate copies of the math. */
export function surfaceElevation(effTerrain: (x: number, y: number) => Terrain, x: number, z: number): number {
  return groundElevation(x, z) * landBlendAt(effTerrain, x, z);
}

/** The authored 5x5 pond (1027): tiles (119-123, 81-85). A documented
 *  constant (isoWorld.ts stores it as water terrain); the shore rules
 *  below use it so the pond gets a sand band + foam edge like the ocean. */
export const POND_RECT = { x0: 119, y0: 81, x1: 123, y1: 85 };
/** Ocean sand band: grass within this many tiles east of the coast. */
export const SHORE_SAND_DIST = 3;
/** Wild-lake shore bands in the lake field (threshold 0.90): grass in
 *  (0.86, 0.90] is sand, water in (0.90, 0.94] is foam. */
export const LAKE_SHORE_LO = 0.86;
export const LAKE_FOAM_HI = 0.94;
/** Stone outcrops: grass whose raw field at the tile centre exceeds
 *  this. Tuned by the 1034 harness: the smoothed field's map max is
 *  0.793 (p99 0.747), so 0.75 puts stone on the top ~1% — the high
 *  ground only, as coherent outcrops, not a stone desert (0.5 would
 *  be 4380 tiles; 0.7 is 1066). The raw field, not the blended
 *  surface — the blend is a shoreline effect, and the shore check
 *  runs first anyway. */
export const STONE_ELEV = 0.75;

/** True when a grass tile is shore sand: within 3 tiles east of the
 *  ocean coast, within 2 of the pond rect, or on the grass side of a
 *  wild lake's edge. The lake band needs a REAL lake next door, not
 *  just the lake field in range: the field is a global noise function
 *  and also reads in-band on in-map grass, where it is not the terrain
 *  — so the band is only a cheap pre-filter, and a direct neighbour
 *  must actually be lake water (water via effTerrain, and the lake
 *  field over the threshold there). `t` is the tile's effTerrain. */
export function isShoreSand(effTerrain: (x: number, y: number) => Terrain, t: Terrain, x: number, y: number): boolean {
  if (t !== 'grass') return false;
  const coast = oceanCoastX(y);
  if (x >= coast && x < coast + SHORE_SAND_DIST) return true;
  if (x >= POND_RECT.x0 - 2 && x <= POND_RECT.x1 + 2 && y >= POND_RECT.y0 - 2 && y <= POND_RECT.y1 + 2) return true;
  const n = lakeNoiseAt(x, y);
  if (n <= LAKE_SHORE_LO || n > WILD_LAKE_THRESHOLD) return false;
  // Lake edge: a direct neighbour is lake water.
  return (effTerrain(x - 1, y) === 'water' && wildLakeAt(x - 1, y))
    || (effTerrain(x + 1, y) === 'water' && wildLakeAt(x + 1, y))
    || (effTerrain(x, y - 1) === 'water' && wildLakeAt(x, y - 1))
    || (effTerrain(x, y + 1) === 'water' && wildLakeAt(x, y + 1));
}

/** True when a water tile is foam (the water edge): the ocean tile just
 *  west of the coast, a pond tile on the pond rect's boundary, or lake
 *  water just inside the lake edge. The lake band is gated on the tile
 *  actually being lake water (the field over the threshold) and not
 *  ocean or pond water, so it never speckles the deep ocean. */
export function isFoam(t: Terrain, x: number, y: number): boolean {
  if (t !== 'water') return false;
  const coast = oceanCoastX(y);
  if (x >= coast - 1 && x < coast) return true;
  if (x >= POND_RECT.x0 && x <= POND_RECT.x1 && y >= POND_RECT.y0 && y <= POND_RECT.y1
    && (x === POND_RECT.x0 || x === POND_RECT.x1 || y === POND_RECT.y0 || y === POND_RECT.y1)) return true;
  if (x < coast) return false;
  if (x >= POND_RECT.x0 && x <= POND_RECT.x1 && y >= POND_RECT.y0 && y <= POND_RECT.y1) return false;
  const n = lakeNoiseAt(x, y);
  return n > WILD_LAKE_THRESHOLD && n <= LAKE_FOAM_HI;
}

/** Display terrain: the colour the ground renders as. 'foam' is display
 *  only — never a walkability terrain (foam tiles are water and still
 *  block; walkability reads effTerrain, never this). 'stone' is the
 *  1031-dead type, revived: grass on high ground renders as rock. */
export type RenderTerrain = Terrain | 'foam';
export function renderTerrain(effTerrain: (x: number, y: number) => Terrain, x: number, y: number): RenderTerrain {
  const t = effTerrain(x, y);
  if (t === 'grass') {
    if (isShoreSand(effTerrain, t, x, y)) return 'sand';
    if (groundElevation(x + 0.5, y + 0.5) > STONE_ELEV) return 'stone';
    return 'grass';
  }
  if (t === 'water' && isFoam(t, x, y)) return 'foam';
  return t;
}

/** Ray-march a ray against the surface: sphere-tracing with a step of
 *  half the height above the surface (the surface slope is <= ~0.07/tile,
 *  so half the clearance never overshoots it). Returns the hit point, or
 *  null when the ray never meets the ground within maxDist. The picker
 *  uses this instead of the flat y=0 plane intersection. */
export function rayHitSurface(
  effTerrain: (x: number, y: number) => Terrain,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
): { x: number; y: number; z: number } | null {
  // Sphere-tracing ray-march against the heightfield. The step is
  // clearance x 0.5 (conservative: the surface slope is <= ~0.07/tile,
  // so the surface cannot rise into the ray within half the clearance).
  // BUILD 1034 fix: the first version returned as soon as the clearance
  // dropped to 0.01 — for a shallow ray (dy ~ -0.05) 0.01 of vertical
  // clearance is ~0.2 tiles of horizontal travel, so the hit landed up
  // to 0.3 tiles early, and shallow rays ran out of the 200-step cap
  // before converging at all. Now the march runs to 400 steps and, on
  // a sign change, BISECTS between the last clear point and the hit to
  // find the actual surface crossing (the picker must resolve the
  // right tile, not the tile 0.3 away).
  let t = 0;
  let prevT = 0;
  let prevClearance = oy - surfaceElevation(effTerrain, ox, oz);
  if (prevClearance <= 0) return { x: ox, y: surfaceElevation(effTerrain, ox, oz), z: oz };
  for (let i = 0; i < 400; i++) {
    if (t > maxDist) return null;
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    const surf = surfaceElevation(effTerrain, x, z);
    const clearance = y - surf;
    if (clearance <= 0) {
      let lo = prevT, hi = t;
      for (let j = 0; j < 24; j++) {
        const mid = (lo + hi) / 2;
        const mx = ox + dx * mid, my = oy + dy * mid, mz = oz + dz * mid;
        if (my - surfaceElevation(effTerrain, mx, mz) <= 0) hi = mid; else lo = mid;
      }
      const tHit = (lo + hi) / 2;
      const hx = ox + dx * tHit, hz = oz + dz * tHit;
      return { x: hx, y: surfaceElevation(effTerrain, hx, hz), z: hz };
    }
    prevT = t;
    prevClearance = clearance;
    t += Math.max(0.05, clearance * 0.5);
  }
  return null;
}
