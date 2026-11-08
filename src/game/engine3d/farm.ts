// BUILD 1041: farm land for the windmill — tilled soil that auto-grows
// wheat, harvestable by the player (E key, +2 wheat) and by farmer
// villagers (they walk to a ready tile and harvest it; the wheat goes
// to the village, no counter). Growth is tied to the game clock
// (993: 1 game-min per real sec, default 08:00 day 1): planted ->
// growing after 1 in-game hour, growing -> ready (wheat) after 3
// in-game hours total (3 real minutes of play). After harvest the
// tile resets to planted and regrows on its own — no re-planting
// needed. Time is ABSOLUTE game minutes (day*1440 + minutes), stored
// on the placement as farmPlantedAt (isoWorld.ts PlacedItem), so the
// growth state survives save/load in iso-world-v2. A tile whose stamp
// is missing (pasted/duplicated before the view stamps it) reads as
// planted — it can never get stuck ready or never-growing.
// Farm tiles are walk-through ground cover (like grass/bush): they
// never block movement and never reject the player/NPC/waypoint
// standing checks (see validatePlacement in placements.ts).

import { hash2 } from './townLook';
import type { Vec3 } from './houseFx';
import { placedFarmTiles } from './placements';
import type { IsoWorld, PlacedItem } from '../iso/isoWorld';

/** Planted -> growing: 1 in-game hour (1 real minute of play). */
export const FARM_GROW_MIN = 60;
/** Growing -> ready wheat: 3 in-game hours total (3 real minutes). */
export const FARM_READY_MIN = 180;
/** Wheat the player collects per harvest (E key). */
export const FARM_HARVEST_WHEAT = 2;
/** Farmers detour to a ready wheat tile within this many tiles. */
export const FARM_VILLAGER_RADIUS = 25;

export type FarmStage = 'planted' | 'growing' | 'ready';

/** Absolute game minutes: the clock's (day, minutes) as one number,
 *  so a growth stamp survives midnight and day rollovers. */
export function absMinutes(day: number, minutes: number): number {
  return day * 1440 + minutes;
}

/** Growth stage for a tile planted at `plantedAt` (absolute game
 *  minutes), observed at `nowAbs`. A missing stamp is a fresh
 *  planting (stage 'planted'); a stamp in the future (clock moved
 *  backwards) is also planted, never ready. */
export function farmStageAt(plantedAt: number | undefined, nowAbs: number): FarmStage {
  if (plantedAt === undefined) return 'planted';
  const age = nowAbs - plantedAt;
  if (age < FARM_GROW_MIN) return 'planted';
  if (age < FARM_READY_MIN) return 'growing';
  return 'ready';
}

/** Stage of one placed farm item, observed at `nowAbs`. */
export function farmStageOf(item: PlacedItem, nowAbs: number): FarmStage {
  return farmStageAt(item.farmPlantedAt, nowAbs);
}

/** Harvest the farm tile at (tx, ty) if it is ready wheat: the tile
 *  resets to planted at `nowAbs` (it regrows on its own) and the
 *  caller collects FARM_HARVEST_WHEAT wheat. Not ready / no farm
 *  here fails without touching the world. */
export function harvestFarmTile(
  w: IsoWorld,
  tx: number,
  ty: number,
  nowAbs: number,
): { ok: true; wheat: number } | { ok: false; reason: string } {
  const list = w.placements;
  if (!list) return { ok: false, reason: 'no farm here' };
  const item = list.find(
    (p) => p.kind === 'farm' && tx >= p.x0 && tx <= p.x1 && ty >= p.y0 && ty <= p.y1,
  );
  if (!item) return { ok: false, reason: 'no farm here' };
  if (farmStageAt(item.farmPlantedAt, nowAbs) !== 'ready') {
    return { ok: false, reason: 'still growing' };
  }
  item.farmPlantedAt = nowAbs;
  return { ok: true, wheat: FARM_HARVEST_WHEAT };
}

/** Nearest ready wheat tile within `maxDist` (Manhattan) of (x, y),
 *  or null. Farmers call this every 900ms tick; it scans only placed
 *  farm tiles (a handful), never the whole map. Ties go to the
 *  earliest-placed tile (strict < keeps the first minimum). */
export function nearestReadyFarmTile(
  w: IsoWorld,
  x: number,
  y: number,
  nowAbs: number,
  maxDist: number = FARM_VILLAGER_RADIUS,
): { tx: number; ty: number } | null {
  let best: { tx: number; ty: number } | null = null;
  let bestD = Infinity;
  for (const t of placedFarmTiles(w)) {
    if (farmStageAt(t.plantedAt, nowAbs) !== 'ready') continue;
    const d = Math.abs(t.tx - x) + Math.abs(t.ty - y);
    if (d <= maxDist && d < bestD) {
      bestD = d;
      best = { tx: t.tx, ty: t.ty };
    }
  }
  return best;
}

// ---- Rendering colours (the view's soil slab + these stalks) ----

/** Tilled soil brown (the whole-map overlay slab in the view). */
export const FARM_SOIL: Vec3 = [0.35, 0.24, 0.14];
/** Darker furrow strips on the soil slab. */
export const FARM_FURROW: Vec3 = [0.22, 0.14, 0.08];
/** Young wheat: short green shoots. */
export const WHEAT_GREEN: Vec3 = [0.28, 0.52, 0.22];
/** Ready wheat: tall golden stalks (the head shade is darker). */
export const WHEAT_GOLD: Vec3 = [0.85, 0.68, 0.25];
export const WHEAT_GOLD_DARK: Vec3 = [0.68, 0.52, 0.18];

/** One wheat stalk as a 4-triangle pyramid (a closed solid, so it
 *  reads from every camera angle — a flat ribbon would vanish
 *  edge-on). Planted: no stalks (bare soil shows). Growing: 3 short
 *  green shoots. Ready: 5 tall golden stalks, seeded per tile so a
 *  field does not look stamped. Faces alternate light/dark for
 *  shading, the house-loop precedent. */
export interface WheatTri {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  col: Vec3;
}

/** One farm tile's wheat input for the fx emitter (houseFx.ts) —
 *  the tile plus the heightfield base y (the view computes it) and
 *  the live growth stage. */
export interface FarmWheatInput {
  tx: number;
  ty: number;
  baseY: number;
  stage: FarmStage;
}

function pushStalk(
  out: WheatTri[],
  cx: number,
  cz: number,
  baseY: number,
  height: number,
  col: Vec3,
  dark: Vec3,
): void {
  const h = 0.07;
  const apex: Vec3 = [cx, baseY + height, cz];
  const c0: Vec3 = [cx - h, baseY, cz - h];
  const c1: Vec3 = [cx + h, baseY, cz - h];
  const c2: Vec3 = [cx + h, baseY, cz + h];
  const c3: Vec3 = [cx - h, baseY, cz + h];
  out.push({ a: c0, b: c1, c: apex, col });
  out.push({ a: c1, b: c2, c: apex, col: dark });
  out.push({ a: c2, b: c3, c: apex, col });
  out.push({ a: c3, b: c0, c: apex, col: dark });
}

/** Wheat stalk triangles for one farm tile, for the per-frame fx
 *  emitter (houseFx.ts) — the stalks are time-varying (they appear
 *  and grow as the clock advances), so they ride the fx buffer like
 *  the windmill blades, not the static world buffer. */
export function wheatStalksFor(
  tx: number,
  ty: number,
  baseY: number,
  stage: FarmStage,
): WheatTri[] {
  if (stage === 'planted') return [];
  const count = stage === 'growing' ? 3 : 5;
  const height = stage === 'growing' ? 0.45 : 0.95;
  const col = stage === 'growing' ? WHEAT_GREEN : WHEAT_GOLD;
  const dark: Vec3 =
    stage === 'growing' ? [0.2, 0.4, 0.16] : WHEAT_GOLD_DARK;
  const out: WheatTri[] = [];
  for (let i = 0; i < count; i++) {
    // Seeded jitter inside the tile (0.2..0.8) + height jitter
    // (±0.15), so neighbouring tiles do not match.
    const u = hash2(tx * 3 + i * 17, ty * 5 + i * 11);
    const v = hash2(tx * 7 + i * 13, ty * 11 + i * 5);
    const cx = tx + 0.2 + u * 0.6;
    const cz = ty + 0.2 + v * 0.6;
    const h = height * (0.85 + 0.3 * hash2(tx + i * 29, ty + i * 23));
    pushStalk(out, cx, cz, baseY, h, col, dark);
  }
  return out;
}
