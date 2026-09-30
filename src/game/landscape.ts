// Hierarchical landscape substrate — WORLD -> REGION -> CHUNK -> fields.
//
// This module is the deterministic foundation for the world-generation
// overhaul. It does NOT replace the authoritative world map
// (src/game/worldMap.ts) or move towns/roads/chunks. Instead it derives
// region metadata, world-anchored density fields, canonical road corridors,
// settlement influence, and NPC activity sites from the existing world seed
// and absolute world coordinates.
//
// Rules:
// - Every function is pure: same (worldSeed, coords) => same output.
// - All spatial fields sample ABSOLUTE world coordinates (field units), so
//   chunk borders always agree — never chunk-local random for placement.
// - No Math.random / Date anywhere. Subsystem RNG comes from
//   landscapeSeed(worldSeed, cx, cy, subsystem) — separate deterministic
//   streams for region / terrain / water / vegetation / rocks / resources /
//   pois / detail, per the generation spec.
// - App-free: no DOM, no React, no imports from App.tsx (App imports this).

import { PerlinNoise } from './noise';
import { DEFAULT_WORLD_SEED } from './worldCore';
import { LANDMARK_LIST } from './landmarks';
import { hillValueAt } from './elevation';

/** Field units per chunk side (matches App FIELD_SIZE). */
export const LANDSCAPE_FIELD_SIZE = 280;

/** Subsystem streams — one deterministic RNG per subsystem per chunk. */
export type LandscapeSubsystem =
  | 'region'
  | 'terrain'
  | 'water'
  | 'vegetation'
  | 'rocks'
  | 'resources'
  | 'pois'
  | 'detail';

/** mulberry32 — small, fast, seekable per-chunk stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUBSYSTEM_SALT: Record<LandscapeSubsystem, number> = {
  region: 0x11ab11ab,
  terrain: 0x22cd22cd,
  water: 0x33ef33ef,
  vegetation: 0x44114411,
  rocks: 0x55225522,
  resources: 0x66336633,
  pois: 0x77447744,
  detail: 0x88558855,
};

/**
 * Canonical per-(chunk, subsystem) RNG stream.
 * Same worldSeed + chunk + subsystem always yields the same sequence.
 */
export function landscapeSeed(
  worldSeed: number,
  cx: number,
  cy: number,
  subsystem: LandscapeSubsystem,
): () => number {
  let h = (worldSeed ^ SUBSYSTEM_SALT[subsystem]) >>> 0;
  h = Math.imul(h ^ (cx >>> 0), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (cy >>> 0), 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  return mulberry32(h >>> 0);
}

// ---------------------------------------------------------------------------
// Macro noise fields (world-anchored fBm)
// ---------------------------------------------------------------------------

const macroNoise = new PerlinNoise(0x1a2b3c4d);
const mesoNoise = new PerlinNoise(0x5e6f7a8b);
const microNoise = new PerlinNoise(0x9c8d7e6f);
const riverNoise = new PerlinNoise(0x3f2a1b0c);
const riverWidthNoise = new PerlinNoise(0x0d1e2f3a);

function fbm(noise: PerlinNoise, x: number, y: number, octaves = 3): number {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    total += amp * (noise.noise2D(x * freq, y * freq) * 0.5 + 0.5);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return total / norm;
}

/** Macro landform signal, 0..1, spanning many chunks (~8-chunk wavelength). */
export function macroLandformAt(wx: number, wy: number): number {
  return fbm(macroNoise, wx / 2240, wy / 2240, 3);
}

/** Meso moisture signal, 0..1 (~2-chunk wavelength). */
export function moistureAt(wx: number, wy: number): number {
  const m = fbm(mesoNoise, wx / 560, wy / 560, 3);
  const d = fbm(microNoise, wx / 140, wy / 140, 2);
  return Math.min(1, Math.max(0, m * 0.72 + d * 0.28));
}

/** Forest density field, 0..1 — clustered by construction (meso fBm). */
export function forestDensityAt(wx: number, wy: number): number {
  const c = fbm(mesoNoise, wx / 420 + 13.7, wy / 420 - 7.3, 3);
  const e = fbm(microNoise, wx / 90, wy / 90, 2);
  return Math.min(1, Math.max(0, c * 0.8 + e * 0.2));
}

/** Rock/barren density field, 0..1. */
export function rockDensityAt(wx: number, wy: number): number {
  const r = fbm(mesoNoise, wx / 480 - 31.2, wy / 480 + 17.9, 3);
  const e = fbm(microNoise, wx / 110 + 5.1, wy / 110, 2);
  return Math.min(1, Math.max(0, r * 0.78 + e * 0.22));
}

// ---------------------------------------------------------------------------
// Region layer
// ---------------------------------------------------------------------------

export type Landform =
  | 'plains'
  | 'rolling'
  | 'forest'
  | 'hills'
  | 'highlands'
  | 'wetlands'
  | 'coast';

export interface ChunkRegion {
  /** Coarse region id — 4x4 chunks per region, e.g. "1,-2". */
  regionId: string;
  /** Macro landform for this chunk (world-anchored, border-continuous). */
  landform: Landform;
  /** Raw macro signal 0..1 (for blending / debugging). */
  macro: number;
  /** Moisture at chunk center 0..1. */
  moisture: number;
}

const REGION_CHUNKS = 4;

export function regionForChunk(cx: number, cy: number): ChunkRegion {
  const rx = Math.floor(cx / REGION_CHUNKS);
  const ry = Math.floor(cy / REGION_CHUNKS);
  const wx = (cx + 0.5) * LANDSCAPE_FIELD_SIZE;
  const wy = (cy + 0.5) * LANDSCAPE_FIELD_SIZE;
  const macro = macroLandformAt(wx, wy);
  const moisture = moistureAt(wx, wy);
  let landform: Landform;
  if (moisture > 0.72 && macro < 0.55) landform = 'wetlands';
  else if (macro > 0.78) landform = 'highlands';
  else if (macro > 0.64) landform = 'hills';
  else if (forestDensityAt(wx, wy) > 0.62) landform = 'forest';
  else if (macro > 0.42) landform = 'rolling';
  else landform = 'plains';
  return { regionId: `${rx},${ry}`, landform, macro, moisture };
}

// ---------------------------------------------------------------------------
// Canonical road corridors (single source of truth)
// ---------------------------------------------------------------------------

export interface CorridorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Canonical road corridor rects in field units for a chunk's road piece.
 * The visual road renders at 47% with 9% width (131.6..156.8 field units);
 * the starting-chunk junction uses 45% / 11%. `margin` expands each rect
 * (e.g. tree canopies need clearance beyond the dirt).
 *
 * This replaces the three stale definitions (App 44-59, npcNavigation
 * 64-80); every consumer — tree exclusion, NPC A* road bonus, elevation
 * flattening — must use this.
 */
export function roadCorridorsFor(
  road: string,
  opts?: { margin?: number; tutorialJunction?: boolean },
): CorridorRect[] {
  if (!road || road === 'none') return [];
  const margin = opts?.margin ?? 0;
  const rc = opts?.tutorialJunction
    ? { x: 0.45, y: 0.45, w: 0.11, h: 0.11 }
    : { x: 0.47, y: 0.47, w: 0.09, h: 0.09 };
  const S = LANDSCAPE_FIELD_SIZE;
  const rx = rc.x * S;
  const ry = rc.y * S;
  const rw = rc.w * S;
  const rh = rc.h * S;
  const rects: CorridorRect[] = [];
  if (road.includes('n')) rects.push({ x: rx, y: 0, w: rw, h: ry + rh });
  if (road.includes('s')) rects.push({ x: rx, y: ry, w: rw, h: S - ry });
  if (road.includes('w')) rects.push({ x: 0, y: ry, w: rx + rw, h: rh });
  if (road.includes('e')) rects.push({ x: rx, y: ry, w: S - rx, h: rh });
  rects.push({ x: rx, y: ry, w: rw, h: rh }); // center intersection
  if (margin === 0) return rects;
  return rects.map((r) => ({
    x: r.x - margin,
    y: r.y - margin,
    w: r.w + margin * 2,
    h: r.h + margin * 2,
  }));
}

/** True when a field-unit point sits inside any road corridor rect. */
export function pointInCorridors(
  x: number,
  y: number,
  corridors: CorridorRect[],
): boolean {
  for (const r of corridors) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Settlement influence: town -> farms -> pasture -> woodland -> wilderness
// ---------------------------------------------------------------------------

export interface SettlementInfluence {
  /** 0 (deep wilderness) .. 1 (town center). */
  influence: number;
  /** Nearest settlement chunk + distance in field units. */
  nearestChunk: { x: number; y: number } | null;
  distance: number;
}

const SETTLEMENT_KINDS = new Set(['town', 'village', 'hamlet', 'city']);

/** Influence radius in field units (~2.5 chunks). */
export const SETTLEMENT_INFLUENCE_RADIUS = 700;

export function townInfluenceAt(wx: number, wy: number): SettlementInfluence {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const lm of LANDMARK_LIST) {
    if (!SETTLEMENT_KINDS.has(lm.kind)) continue;
    const lx = (lm.chunk.x + 0.5) * LANDSCAPE_FIELD_SIZE;
    const ly = (lm.chunk.y + 0.5) * LANDSCAPE_FIELD_SIZE;
    const d = Math.hypot(wx - lx, wy - ly);
    if (d < bestDist) {
      bestDist = d;
      best = { x: lm.chunk.x, y: lm.chunk.y };
    }
  }
  if (!best) return { influence: 0, nearestChunk: null, distance: Infinity };
  const influence = Math.max(
    0,
    1 - bestDist / SETTLEMENT_INFLUENCE_RADIUS,
  );
  // Smoothstep for a gentle gradient instead of a linear cone.
  const s = influence * influence * (3 - 2 * influence);
  return { influence: s, nearestChunk: best, distance: bestDist };
}

/** Land-use band derived from settlement influence (for farms/pasture/etc). */
export type LandUse = 'town' | 'farms' | 'pasture' | 'woodland' | 'wilderness';

export function landUseAt(wx: number, wy: number): LandUse {
  const { influence } = townInfluenceAt(wx, wy);
  if (influence > 0.75) return 'town';
  if (influence > 0.5) return 'farms';
  if (influence > 0.3) return 'pasture';
  if (influence > 0.12) return 'woodland';
  return 'wilderness';
}

// ---------------------------------------------------------------------------
// NPC activity sites — metadata the sim can query (no behavior here)
// ---------------------------------------------------------------------------

export type SiteKind = 'farm' | 'grove' | 'quarry' | 'fishing' | 'meadow';

export interface LandscapeSite {
  kind: SiteKind;
  /** Field-unit rect within the chunk. */
  rect: { x: number; y: number; w: number; h: number };
  /** 0..1 quality (density field value at the site center). */
  quality: number;
}

const SITE_FIELD = LANDSCAPE_FIELD_SIZE;

/**
 * Deterministic per-chunk activity sites: places NPC professions could work.
 * Positions come from the chunk's 'vegetation'/'rocks'/'resources' streams so
 * they never collide with the world seed's other uses.
 */
export function landscapeSitesFor(
  chunk: { x: number; y: number },
  worldSeed: number = DEFAULT_WORLD_SEED,
): LandscapeSite[] {
  const sites: LandscapeSite[] = [];
  const vegRng = landscapeSeed(worldSeed, chunk.x, chunk.y, 'vegetation');
  const rockRng = landscapeSeed(worldSeed, chunk.x, chunk.y, 'rocks');
  const resRng = landscapeSeed(worldSeed, chunk.x, chunk.y, 'resources');

  const cx = (chunk.x + 0.5) * SITE_FIELD;
  const cy = (chunk.y + 0.5) * SITE_FIELD;
  const use = landUseAt(cx, cy);

  // Farmsteads favor the farms/pasture band around settlements.
  if ((use === 'farms' || use === 'pasture') && resRng() < 0.7) {
    const w = 40 + resRng() * 30;
    const h = 30 + resRng() * 25;
    sites.push({
      kind: 'farm',
      rect: {
        x: 20 + resRng() * (SITE_FIELD - 40 - w),
        y: 20 + resRng() * (SITE_FIELD - 40 - h),
        w,
        h,
      },
      quality: 0.5 + resRng() * 0.5,
    });
  }
  // Groves where the forest field runs hot.
  if (forestDensityAt(cx, cy) > 0.55 && vegRng() < 0.8) {
    const w = 50 + vegRng() * 40;
    const h = 50 + vegRng() * 40;
    sites.push({
      kind: 'grove',
      rect: {
        x: 14 + vegRng() * (SITE_FIELD - 28 - w),
        y: 14 + vegRng() * (SITE_FIELD - 28 - h),
        w,
        h,
      },
      quality: forestDensityAt(cx, cy),
    });
  }
  // Quarries where rock runs hot.
  if (rockDensityAt(cx, cy) > 0.58 && rockRng() < 0.6) {
    const w = 30 + rockRng() * 25;
    const h = 30 + rockRng() * 25;
    sites.push({
      kind: 'quarry',
      rect: {
        x: 14 + rockRng() * (SITE_FIELD - 28 - w),
        y: 14 + rockRng() * (SITE_FIELD - 28 - h),
        w,
        h,
      },
      quality: rockDensityAt(cx, cy),
    });
  }
  return sites;
}

// ---------------------------------------------------------------------------
// Water: rivers (carved channel networks) + lakes (basin ellipses)
// ---------------------------------------------------------------------------

export type WaterKind = 'none' | 'river' | 'lake';

export interface WaterSample {
  kind: WaterKind;
  /** 0 = dry .. 1 = deep center. Depth > 0.5 blocks movement. */
  depth: number;
}

const DRY: WaterSample = { kind: 'none', depth: 0 };

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * River channel signal, 0..1 — 1 at the channel centerline.
 * Built from ridged fBm at world coordinates, so channels form continuous
 * networks that cross chunk borders seamlessly (no per-chunk RNG).
 */
export function riverChannelAt(wx: number, wy: number): number {
  const n = fbm(riverNoise, wx / 900, wy / 900, 3);
  return 1 - Math.abs(2 * n - 1);
}

/**
 * River water sample at a world point. Rivers fade out on peaks, in
 * sea-level flats, and near towns (they divert around settlements).
 */
export function riverAt(wx: number, wy: number): WaterSample {
  const channel = riverChannelAt(wx, wy);
  // Width varies along the channel: threshold 0.90..0.94.
  const wobble = fbm(riverWidthNoise, wx / 500 + 3.1, wy / 500 - 1.7, 2);
  const threshold = 0.9 + wobble * 0.04;
  if (channel <= threshold) return DRY;
  const hill = hillValueAt(wx, wy);
  // No rivers on high peaks or in the lowest flats (sea handles those).
  const hillMask = smoothstep(0.92, 0.72, hill) * smoothstep(0.06, 0.18, hill);
  if (hillMask <= 0) return DRY;
  // Rivers divert around towns.
  const { influence } = townInfluenceAt(wx, wy);
  const townMask = 1 - smoothstep(0.45, 0.7, influence);
  if (townMask <= 0) return DRY;
  const depth = smoothstep(threshold, 0.995, channel) * hillMask * townMask;
  return depth <= 0.01 ? DRY : { kind: 'river', depth };
}

export interface Lake {
  /** World-coordinate center. */
  x: number;
  y: number;
  /** Radius in field units. */
  r: number;
}

/**
 * Deterministic lakes for a chunk. Lakes form in damp basins
 * (moisture > 0.78, macro < 0.38) away from towns and off river channels.
 * Positions come from the chunk's 'water' stream; geometry is world-anchored.
 */
export function lakesForChunk(
  cx: number,
  cy: number,
  worldSeed: number = DEFAULT_WORLD_SEED,
): Lake[] {
  const wx = (cx + 0.5) * LANDSCAPE_FIELD_SIZE;
  const wy = (cy + 0.5) * LANDSCAPE_FIELD_SIZE;
  if (moistureAt(wx, wy) < 0.78) return [];
  if (macroLandformAt(wx, wy) > 0.38) return [];
  if (townInfluenceAt(wx, wy).influence > 0.35) return [];
  const rng = landscapeSeed(worldSeed, cx, cy, 'water');
  const lakes: Lake[] = [];
  const count = rng() < 0.35 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const lx = 40 + rng() * (LANDSCAPE_FIELD_SIZE - 80);
    const ly = 40 + rng() * (LANDSCAPE_FIELD_SIZE - 80);
    const gx = cx * LANDSCAPE_FIELD_SIZE + lx;
    const gy = cy * LANDSCAPE_FIELD_SIZE + ly;
    if (riverChannelAt(gx, gy) > 0.8) continue; // not on a river channel
    const r = 20 + rng() * 40;
    lakes.push({ x: gx, y: gy, r });
  }
  return lakes;
}

function lakeDepthAt(wx: number, wy: number, lake: Lake): number {
  const d = Math.hypot(wx - lake.x, wy - lake.y) / lake.r;
  if (d >= 1) return 0;
  // Deep center, shallow rim.
  return Math.cos((d * Math.PI) / 2) ** 1.5;
}

/**
 * Combined water sample: deepest of river channel and nearby lakes wins.
 * Checks the containing chunk plus its 8 neighbors so border lakes work.
 * Pure and world-anchored — identical from either side of a chunk border.
 */
export function waterAt(
  wx: number,
  wy: number,
  worldSeed: number = DEFAULT_WORLD_SEED,
): WaterSample {
  let best: WaterSample = riverAt(wx, wy);
  const cx = Math.floor(wx / LANDSCAPE_FIELD_SIZE);
  const cy = Math.floor(wy / LANDSCAPE_FIELD_SIZE);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const lakes = lakesForChunk(cx + ox, cy + oy, worldSeed);
      for (const lake of lakes) {
        const depth = lakeDepthAt(wx, wy, lake);
        if (depth > best.depth) best = { kind: 'lake', depth };
      }
    }
  }
  return best;
}

/**
 * True when a road crosses water here — the road segment is a bridge
 * (walkable, rendered as planks). `lx, ly` are chunk-local field units.
 */
export function bridgeAt(
  wx: number,
  wy: number,
  corridors: CorridorRect[],
  worldSeed: number = DEFAULT_WORLD_SEED,
): boolean {
  if (corridors.length === 0) return false;
  const cx = Math.floor(wx / LANDSCAPE_FIELD_SIZE);
  const cy = Math.floor(wy / LANDSCAPE_FIELD_SIZE);
  const lx = wx - cx * LANDSCAPE_FIELD_SIZE;
  const ly = wy - cy * LANDSCAPE_FIELD_SIZE;
  if (!pointInCorridors(lx, ly, corridors)) return false;
  return waterAt(wx, wy, worldSeed).depth > 0.25;
}

// ---------------------------------------------------------------------------
// Continuity self-check (developer-only, no player-facing score)
// ---------------------------------------------------------------------------

export interface ContinuitySample {
  chunk: { x: number; y: number };
  edge: 'n' | 's' | 'e' | 'w';
  /** Max |delta| of a field across the shared edge (0 = seamless). */
  maxDelta: number;
}

function sampleField(
  field: (wx: number, wy: number) => number,
  cx: number,
  cy: number,
  edge: 'n' | 's' | 'e' | 'w',
): number {
  const S = LANDSCAPE_FIELD_SIZE;
  let max = 0;
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * S;
    let ax: number;
    let ay: number;
    let bx: number;
    let by: number;
    if (edge === 'n') {
      ax = cx * S + t; ay = cy * S; bx = ax; by = ay + 0.001;
    } else if (edge === 's') {
      ax = cx * S + t; ay = (cy + 1) * S; bx = ax; by = ay - 0.001;
    } else if (edge === 'w') {
      ax = cx * S; ay = cy * S + t; bx = ax + 0.001; by = ay;
    } else {
      ax = (cx + 1) * S; ay = cy * S + t; bx = ax - 0.001; by = ay;
    }
    max = Math.max(max, Math.abs(field(ax, ay) - field(bx, by)));
  }
  return max;
}

/**
 * Developer-only continuity check: every world-anchored field must be
 * (near-)seamless across chunk edges. Returns per-edge max deltas; all
 * should be ~0 for pure world-coordinate functions.
 */
export function checkFieldContinuity(
  chunks: Array<{ x: number; y: number }>,
): ContinuitySample[] {
  const fields: Array<[string, (wx: number, wy: number) => number]> = [
    ['moisture', moistureAt],
    ['forest', forestDensityAt],
    ['rock', rockDensityAt],
    ['macro', macroLandformAt],
  ];
  const out: ContinuitySample[] = [];
  const edges: Array<'n' | 's' | 'e' | 'w'> = ['n', 's', 'e', 'w'];
  for (const c of chunks) {
    for (const e of edges) {
      let max = 0;
      for (const [, f] of fields) max = Math.max(max, sampleField(f, c.x, c.y, e));
      out.push({ chunk: c, edge: e, maxDelta: max });
    }
  }
  return out;
}
