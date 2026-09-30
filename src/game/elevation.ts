// Field elevation: hills and cliff faces for the gameplay field view.
//
// The world map already carries a per-chunk elevationLevel (0-5, see
// worldMap.ts elevationLevelFor). This module adds SUB-CHUNK relief: a
// deterministic elevation field sampled on a coarse cell grid, so hill
// chunks grow plateaus with cliff faces like the CraftPix island kit.
//
// All functions are pure functions of absolute world coordinates (field
// units), so chunk borders always agree and rendering matches collision.
// No Math.random / Date anywhere.
//
// Art: cliff faces are sliced at runtime from public/kit/tileset.png
// (Free Island Adventure Pixel Top-Down Minigame Kit by CraftPix).

import { PerlinNoise } from './noise';

/** Field units per elevation cell (280-unit chunk -> 14x14 cells). */
export const ELEV_CELL = 20;
/** Cells per chunk side. */
export const ELEV_CELLS_PER_CHUNK = 14;
/** Cliff faces only render/block where the HIGH side reaches hill country. */
export const CLIFF_MIN_HIGH_LEVEL = 3;
/** Max quantized level (matches worldMap elevationLevel 0-5). */
export const ELEV_MAX_LEVEL = 5;

// Broad rolling wavelength: a hill spans several cells (~100+ field units),
// so plateaus read as landforms, not noise speckle.
const hillNoise = new PerlinNoise(0xE1E7A710);
const detailNoise = new PerlinNoise(0x0E177A1);

function fbm(noise: PerlinNoise, x: number, y: number): number {
  // 3 octaves, normalized to 0..1.
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    total += amp * (noise.noise2D(x * freq, y * freq) * 0.5 + 0.5);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return total / norm;
}

/**
 * Smooth hill signal at absolute world coords, 0..1. Low frequency dominates
 * so hills are broad; a touch of detail keeps edges organic.
 */
export function hillValueAt(wx: number, wy: number): number {
  const broad = fbm(hillNoise, wx / 140, wy / 140);
  const detail = fbm(detailNoise, wx / 46, wy / 46);
  return broad * 0.78 + detail * 0.22;
}

/** Game-aware hooks supplied by the caller (App). Keeps this module DOM- and App-free. */
export interface ElevContext {
  /** Rounded world elevationLevel (0-5) of the chunk containing the point. */
  baseLevelAt(chunkX: number, chunkY: number): number;
  /** True for chunks that must stay perfectly flat (towns, starting area). */
  isFlatChunk(chunkX: number, chunkY: number): boolean;
  /** True when the point sits on/near a road corridor (roads stay walkable). */
  isRoadAt(chunkX: number, chunkY: number, lx: number, ly: number): boolean;
}

export const CHUNK_FIELD_SIZE = 280;

function chunkOf(wx: number, wy: number): { cx: number; cy: number; lx: number; ly: number } {
  const cx = Math.floor(wx / CHUNK_FIELD_SIZE);
  const cy = Math.floor(wy / CHUNK_FIELD_SIZE);
  return { cx, cy, lx: wx - cx * CHUNK_FIELD_SIZE, ly: wy - cy * CHUNK_FIELD_SIZE };
}

/**
 * Quantized elevation level (0-5) of the CELL containing the world point.
 * Sampled at the cell center so the level is constant across the cell.
 * Road corridors and flat chunks collapse to the chunk base level.
 */
export function cellLevelAt(ctx: ElevContext, wx: number, wy: number): number {
  const { cx, cy, lx, ly } = chunkOf(wx, wy);
  const base = ctx.baseLevelAt(cx, cy);
  if (ctx.isFlatChunk(cx, cy)) return base;
  // Sample at the cell center for stability.
  const ccx = Math.floor(lx / ELEV_CELL);
  const ccy = Math.floor(ly / ELEV_CELL);
  const sx = cx * CHUNK_FIELD_SIZE + ccx * ELEV_CELL + ELEV_CELL / 2;
  const sy = cy * CHUNK_FIELD_SIZE + ccy * ELEV_CELL + ELEV_CELL / 2;
  if (ctx.isRoadAt(cx, cy, sx - cx * CHUNK_FIELD_SIZE, sy - cy * CHUNK_FIELD_SIZE)) return base;
  const n = hillValueAt(sx, sy);
  // Local relief scales with the chunk's character: gentle rolling in the
  // lowlands (never cliffs), pronounced plateaus in hill country.
  const amp = base >= 3 ? 1.65 : 0.55;
  const v = base + (n - 0.5) * 2 * amp;
  return Math.max(0, Math.min(ELEV_MAX_LEVEL, Math.round(v)));
}

/** True when the step between two levels should render (and block) as a cliff. */
export function isCliffStep(l0: number, l1: number): boolean {
  if (l0 === l1) return false;
  return Math.max(l0, l1) >= CLIFF_MIN_HIGH_LEVEL;
}

/**
 * Movement rule: walking UP a cliff step is blocked; walking down or level
 * is always allowed (so the player can never get trapped on a plateau).
 * Road corridors are never blocked.
 */
export function cliffBlocksMove(ctx: ElevContext, wx0: number, wy0: number, wx1: number, wy1: number): boolean {
  const l0 = cellLevelAt(ctx, wx0, wy0);
  const l1 = cellLevelAt(ctx, wx1, wy1);
  if (l1 <= l0) return false;
  if (!isCliffStep(l0, l1)) return false;
  const a = chunkOf(wx0, wy0);
  const b = chunkOf(wx1, wy1);
  if (ctx.isRoadAt(a.cx, a.cy, a.lx, a.ly) || ctx.isRoadAt(b.cx, b.cy, b.lx, b.ly)) return false;
  return true;
}
