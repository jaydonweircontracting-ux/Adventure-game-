/**
 * BUILD 1090 — The granary + farm planting (0x19, Phase 2.5).
 *
 * The food loop closes: the camp's food no longer lives in the
 * camp store (the wood/stone pile) — it lives in the GRANARY, a
 * registry store like the storehouse (R-1 registry, capacity, every
 * transfer conserves). Harvested grain goes to the granary, the
 * mill draws grain from the granary, meals are eaten from the
 * granary. An empty granary means the founders go hungry — no
 * more magic 30 (FOUNDER_START_FOOD is 0; fresh worlds start with
 * an empty granary and their first meal comes from their first
 * harvest). v11 saves migrate with the granary seeded from their
 * foodStock/grainStock (founders.ts), so old saves do not start
 * starving on load.
 *
 * The founders also PLANT farms now (not just harvest the one
 * authored 4-tile field): when the camp's field is below
 * FARM_TARGET_TILES and the camp is short of food, a founder
 * claims a plant job, walks to the best plantable tile (best soil
 * first — rich 1.5, then neutral 1.0, poor 0.6 last; walkable,
 * not already farm, not a path, not blocked), and tills it in
 * FOUNDER_PLANT_TICKS ticks. The tile grows at the soil x season
 * rate (farm.ts) and is harvested like any other farm tile.
 *
 * Pure module (no React, no WebGL, no localStorage) so the sim and
 * the standalone asserts can import it directly.
 */

import { GRANARY_STORE_ID, setStoreQty, storeQty, type ResourceRegistry } from './resourceRegistry';
import { FARM_VILLAGER_RADIUS } from './farm';
import { addPlacement, placedFarmTiles, placementsOf, validatePlacement } from './placements';
import type { IsoWorld } from '../iso/isoWorld';

/** Grain the granary holds (generous like the storehouse's wood 100 /
 *  stone 60 — the mill draws it down every tick, so it never binds
 *  in practice). */
export const GRANARY_CAPACITY_GRAIN = 200;
/** Meals the granary holds (the mill never mills past 15, so this
 *  never binds either — the cap is the honest bound, not the driver). */
export const GRANARY_CAPACITY_FOOD = 60;
/** The granary's grain sits at the stockpile tile (the camp's food
 *  store lives at camp, not in a separate building — the plan calls
 *  for a store, not a building). */
export const GRANARY_GRAIN_TILE = { x: 125, y: 120 };
/** The granary's meals sit at the eat tile (where the founders eat). */
export const GRANARY_FOOD_TILE = { x: 123, y: 120 };

/** Grain in the granary store (the registry's answer to the food
 *  read — the mill's input). Pure. */
export function granaryGrainInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, GRANARY_STORE_ID, 'grain');
}

/** Meals in the granary store (the registry's answer to the food
 *  read — what the founders eat). Pure. */
export function granaryFoodInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, GRANARY_STORE_ID, 'food');
}

/**
 * Seed the granary store from the founders save numbers (load path):
 * grain at the stockpile tile, food at the eat tile, source 'loaded'
 * (the save does not record where a unit came from), capped
 * (grain 200, food 60 — the storehouse's pattern). Only set when
 * > 0, like seedStorehouseStore (a store that never held a kind
 * has no entry — qty 0). Pure.
 */
export function seedGranaryStore(registry: ResourceRegistry, grain: number, food: number): ResourceRegistry {
  let next = registry;
  if (grain > 0) {
    next = setStoreQty(
      next,
      GRANARY_STORE_ID,
      'grain',
      grain,
      { type: 'loaded' },
      { capacity: GRANARY_CAPACITY_GRAIN, location: { ...GRANARY_GRAIN_TILE } },
    );
  }
  if (food > 0) {
    next = setStoreQty(
      next,
      GRANARY_STORE_ID,
      'food',
      food,
      { type: 'loaded' },
      { capacity: GRANARY_CAPACITY_FOOD, location: { ...GRANARY_FOOD_TILE } },
    );
  }
  return next;
}

/** The granary count for the HUD / E-report / Control Center:
 *  'Granary 12 meals · 8 grain'. Pure. */
export function granaryLabel(grain: number, food: number): string {
  return 'Granary ' + food + ' meals · ' + grain + ' grain';
}

// --- Farm planting ---

/** The camp's field target: the seeded 4 tiles + 4 planted (the
 *  founders plant up to this many farm tiles near camp). */
export const FARM_TARGET_TILES = 8;
/** Ticks spent planting at a farm tile before it is tilled
 *  (BUILD 1090 — planting is quicker than a harvest: the tile is
 *  already clear ground). */
export const FOUNDER_PLANT_TICKS = 2;

/**
 * Plantable tiles near the camp, best soil first: every walkable tile
 * within FARM_VILLAGER_RADIUS of the camp that is not already farm,
 * not a dirt path, and not blocked by a placed item (a hut, a well, a
 * bridge — the validatePlacement 'farm' overlap rule, minus paths,
 * which the founders never till over). Sorted by soil factor
 * (rich 1.5 first, then neutral 1.0, poor 0.6 last — the 1.4 soil
 * map through the adapter's soilFactorAt, never landforms.ts
 * directly) and then by distance (nearest first within a soil
 * class), capped at the tiles still needed to reach `targetTiles`
 * (the seeded plot + what is planted already). Returns [] when the
 * field is already at target — discovery calls this every tick, so
 * the count check keeps the scan out of the steady state. Pure read
 * (never mutates the world).
 */
export function plantableFarmTiles(
  world: IsoWorld,
  campX: number,
  campY: number,
  soilFactorAt: (tx: number, ty: number) => number,
  walkable: (x: number, y: number) => boolean,
  targetTiles: number = FARM_TARGET_TILES,
): { tx: number; ty: number }[] {
  const farmTiles = placedFarmTiles(world);
  const nearFarm = farmTiles.filter((t) => Math.abs(t.tx - campX) + Math.abs(t.ty - campY) <= FARM_VILLAGER_RADIUS).length;
  const needed = targetTiles - nearFarm;
  if (needed <= 0) return [];
  const farmSet = new Set(farmTiles.map((t) => t.tx + ',' + t.ty));
  const pathSet = new Set<string>();
  const blockedSet = new Set<string>();
  for (const p of placementsOf(world)) {
    for (let y = p.y0; y <= p.y1; y++) {
      for (let x = p.x0; x <= p.x1; x++) {
        const key = x + ',' + y;
        if (p.kind === 'path') pathSet.add(key);
        else if (p.kind !== 'grass' && p.kind !== 'bush' && p.kind !== 'farm') blockedSet.add(key);
      }
    }
  }
  const candidates: { tx: number; ty: number; soil: number; dist: number }[] = [];
  const r = FARM_VILLAGER_RADIUS;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -(r - Math.abs(dy)); dx <= r - Math.abs(dy); dx++) {
      const tx = campX + dx;
      const ty = campY + dy;
      const key = tx + ',' + ty;
      if (farmSet.has(key) || pathSet.has(key) || blockedSet.has(key)) continue;
      if (!walkable(tx, ty)) continue;
      candidates.push({ tx, ty, soil: soilFactorAt(tx, ty), dist: Math.abs(dx) + Math.abs(dy) });
    }
  }
  candidates.sort((a, b) => b.soil - a.soil || a.dist - b.dist);
  return candidates.slice(0, needed).map((c) => ({ tx: c.tx, ty: c.ty }));
}

/**
 * Plant (till) a farm tile at (tx, ty): the tile becomes farm land,
 * planted at `nowAbs` (it grows at the soil x season rate and is
 * harvested like any other farm tile). Validates through the same
 * placement path the player uses (validatePlacement 'farm' — water,
 * generated trees/rocks, and placed items refuse it; a path or grass
 * under it is fine, but plantableFarmTiles never offers a path tile).
 * A tile that is no longer plantable (another founder planted it, or
 * the player built there) fails without touching the world. Pure
 * apart from the world mutation addPlacement performs.
 */
export function plantFarmTile(
  world: IsoWorld,
  tx: number,
  ty: number,
  nowAbs: number,
): { ok: true } | { ok: false; reason: string } {
  const placed = validatePlacement(world, 'farm', tx, ty, { x: 0, y: 0 }, [], 0);
  if (!placed.ok) return { ok: false, reason: placed.reason };
  addPlacement(world, {
    kind: 'farm',
    x0: tx,
    y0: ty,
    x1: tx,
    y1: ty,
    farmPlantedAt: nowAbs,
  });
  return { ok: true };
}
