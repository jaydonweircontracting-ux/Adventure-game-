/**
 * BUILD 1087 (0x16, Phase 2.2): storage + transport — the storehouse
 * and hauling.
 *
 * The settlement gains a real storehouse building and hauling:
 * founders carry wood/stone from gather sites to the storehouse,
 * and from the storehouse to construction sites. The player
 * inventory stays as-is. Caravans / inter-settlement transport are
 * Phase 5, not here.
 *
 * THE STOREHOUSE IS REAL (no fake resources):
 * - It is a registry store ('storehouse', R-1), like the camp pile
 *   — wood/stone gathered anywhere ends up counted in it, and a
 *   construction site draws from it, not from thin air. Every
 *   transfer conserves (transfer() — what does not fit stays in
 *   the source).
 * - It has a CAPACITY, a real per-resource count: 100 wood, 60
 *   stone. A delivery that does not fit overflows to the camp
 *   pile (the fallback store), never vanishes and never duplicates.
 * - It is built through the CONSTRUCTION path, like the hut — 6
 *   work steps, one builder, a real site (surveyed below), 2 wood
 *   + 1 stone per step (12 wood + 6 stone total — a Phase-2
 *   building: the stone has to come from the 2.1 quarry loop).
 *   The storehouse is the FIRST catalogue building built through
 *   the construction path (the catalogue-as-data is Phase 3.1 —
 *   this build adds ONE building, not the full catalogue).
 * - It is placed through the same placement path the player uses
 *   ('house-store', 5x4, variant 'store'), so the finished
 *   storehouse is a REAL building — collision, door, rendered
 *   like any placed General Store — not set-dressing.
 *
 * HAULING — two physical legs, no teleporting:
 * - Gather → storehouse: once the storehouse exists, a founder
 *   carrying wood/stone walks to the storehouse approach tile and
 *   deposits into the storehouse store. Grain still goes to the
 *   camp store (the mill's buffer lives at camp — the granary is
 *   2.5, not this build).
 * - Storehouse → construction site: a builder assigned to a hut
 *   site fetches 2 wood from the storehouse first (walks to the
 *   approach, withdraws into their carrier), walks to the site,
 *   and the step spends the CARRIED wood. A builder who leaves
 *   the site returns the carried wood to the storehouse (workState
 *   'toStockpile'), so materials never strand on a founder.
 *
 * SETTLEMENT PRIORITY (why the 24h numbers do not move):
 * Housing comes first, storage second. The storehouse is only
 * started once BOTH huts are done AND the settlement day is >= 3
 * (STOREHOUSE_START_DAY) — the 24-simulated-hour test runs day 1
 * 08:00 -> day 2 08:00, so the storehouse is outside its window
 * by design, and the M1069 numbers are unaffected (the sim's
 * storehouse stays 'none' for the whole run). In live play the
 * probe at 100x reaches day 3 in under a minute, and the build +
 * hauling + draw are proven there. The storehouse's own
 * construction draws from the CAMP pile (it does not exist yet to
 * draw from); hut construction after it exists draws from the
 * storehouse first, the camp pile as fallback.
 *
 * SITE (surveyed on the real fresh world, verify1087 survey):
 * south of camp, clear of the farm (120-121, 122-123), clear of
 * hut 0's approach tile (128,122) — the storehouse rect starts at
 * y=123 so the hut's exit stays open — clear of the camp tiles
 * (centre, pile, eat tile, sleep row) and of every tree/rock/
 * river. Centre (124,125), rect 122..126 x 123..126, door south
 * (124,126), approach (124,127). Camp -> approach is 7 steps,
 * approach -> player spawn 47 steps.
 *
 * SAVE: the storehouse state + its counts ride in the versioned
 * founders save (ag-3d-founders-v1, v9 — see founders.ts). A v8
 * save migrates with no storehouse and empty counts (the camp
 * pile keeps everything, the same as before). The storehouse
 * placement itself rides in the world save (w.placements, via
 * saveWorld), like the hut. If the player removes the storehouse
 * with Build Remove, reconcileStorehouse resets it to 'none' and
 * the founders rebuild from the pile when the day/materials
 * allow — no free storehouse. The carried build wood rides in
 * the founder's save (carryingBuild, v9) and in their carrier
 * store, so a reload mid-haul keeps the wood.
 *
 * Pure module (no React, no WebGL, no localStorage in the pure
 * functions) so the sim and the standalone asserts can import it
 * directly.
 */

import { FOUNDER_CAMP, FOUNDER_CAMP_CENTRE, type FounderState } from './founders';
import { QUARRY_STONE_TARGET, QUARRY_CLAIM_RADIUS } from './quarry';
import {
  HUT_WOOD_PER_STEP,
  HUT_WORK_STEPS,
  sitesOf,
  constructionFromSites,
  activeSiteIndex,
  nearestUnfinishedSite,
  type ConstructionState,
  type HutSite,
} from './construction';
import {
  CAMP_STORE_ID,
  carrierStoreId,
  setStoreQty,
  storeQty,
  transfer,
  withdrawFrom,
  type ResourceRegistry,
} from './resourceRegistry';
import { doorForRect } from './placements';
import { planPathNpc } from './townsfolk3d';
import { terrainAt, type IsoWorld } from '../iso/isoWorld';

/** The storehouse's stable site id — the build job's target. */
export const STOREHOUSE_SITE_ID = 'storehouse-site';
/** The placement kind for the storehouse ('house-store' — the
 *  General Store variant, 5x4, 2 stories, open front). */
export const STOREHOUSE_KIND = 'house-store' as const;
/** The storehouse centre (surveyed — see the module doc). */
export const STOREHOUSE_CENTRE = { x: 124, y: 125 };
/** The storehouse rect: 5x4 centred on STOREHOUSE_CENTRE. */
export const STOREHOUSE_RECT = { x0: 122, y0: 123, x1: 126, y1: 126 };
/** Door tile: south edge centre (doorForRect, rot 0). */
export const STOREHOUSE_DOOR = { x: 124, y: 126 };
/** Approach tile: one tile south of the door — the fetch tile,
 *  the build work tile, and the delivery tile. */
export const STOREHOUSE_APPROACH = { x: 124, y: 127 };

/** The storehouse as a HutSite-shaped object — the build-site
 *  visual (constructionSiteTrisFor) reads only centre/rect, so
 *  the storehouse's foundation + frame render through the same
 *  path as a hut's. It has no sleep tiles (nobody sleeps in a
 *  storehouse); the empty list is the honest value. */
export const STOREHOUSE_HUT_SITE: HutSite = {
  id: STOREHOUSE_SITE_ID,
  centre: { ...STOREHOUSE_CENTRE },
  rect: { ...STOREHOUSE_RECT },
  door: { ...STOREHOUSE_DOOR },
  approach: { ...STOREHOUSE_APPROACH },
  sleepTiles: [],
};

/** The first day the settlement starts the storehouse (housing
 *  first, storage second — see the module doc). */
export const STOREHOUSE_START_DAY = 3;
/** Wood the storehouse costs in total. */
export const STOREHOUSE_COST_WOOD = 12;
/** Stone the storehouse costs in total. */
export const STOREHOUSE_COST_STONE = 6;
/** Work steps to finish the storehouse (each spends 2 wood + 1
 *  stone). */
export const STOREHOUSE_WORK_STEPS = 6;
/** Wood spent per completed work step. */
export const STOREHOUSE_WOOD_PER_STEP = 2;
/** Stone spent per completed work step. */
export const STOREHOUSE_STONE_PER_STEP = 1;
/** Ticks a founder works at the site per step (mirrors the hut). */
export const STOREHOUSE_TICKS_PER_STEP = 3;
/** Wood the storehouse can hold (a real per-resource count — a
 *  delivery that does not fit overflows to the camp pile). */
export const STOREHOUSE_CAPACITY_WOOD = 100;
/** Stone the storehouse can hold. */
export const STOREHOUSE_CAPACITY_STONE = 60;
/** Ore capacity of the storehouse store (BUILD 1089 — the mine's
 *  iron; the stone cap's sibling, same size). */
export const STOREHOUSE_CAPACITY_ORE = 60;

/** The storehouse's registry store id (R-1). */
export const STOREHOUSE_STORE_ID = 'storehouse';

export type StorehouseStateKind = 'none' | 'building' | 'done';

/** The storehouse's construction progress (saved in the founders
 *  save, v9 — the same shape as one hut SiteState, plus the stone
 *  the hut never spent). */
export type StorehouseState = {
  state: StorehouseStateKind;
  /** Completed work steps, 0..STOREHOUSE_WORK_STEPS. */
  progress: number;
  /** Wood actually spent on the storehouse (2 per step). */
  spentWood: number;
  /** Stone actually spent on the storehouse (1 per step). */
  spentStone: number;
};

/** Fresh storehouse: nothing started. */
export function freshStorehouse(): StorehouseState {
  return { state: 'none', progress: 0, spentWood: 0, spentStone: 0 };
}

/** Validate a saved storehouse state (v9 migration): unknown
 *  states / out-of-range numbers fall back to fresh (never guess
 *  at a corrupt save — the founders rebuild it). Pure. */
export function validateStorehouseState(value: unknown): StorehouseState {
  if (!value || typeof value !== 'object') return freshStorehouse();
  const v = value as Record<string, unknown>;
  const state = v.state === 'building' || v.state === 'done' ? (v.state as StorehouseStateKind) : 'none';
  let progress = Math.max(0, Math.min(STOREHOUSE_WORK_STEPS, Math.round(Number(v.progress) || 0)));
  let spentWood = Math.max(0, Math.round(Number(v.spentWood) || 0));
  let spentStone = Math.max(0, Math.round(Number(v.spentStone) || 0));
  if (state === 'done') {
    progress = STOREHOUSE_WORK_STEPS;
    spentWood = STOREHOUSE_COST_WOOD;
    spentStone = STOREHOUSE_COST_STONE;
  }
  if (state === 'none') {
    progress = 0;
    spentWood = 0;
    spentStone = 0;
  }
  return { state, progress, spentWood, spentStone };
}

/** True when every hut site is done (the construction mirror's
 *  state is 'done' exactly when no site is unfinished). Pure. */
export function hutsAllDone(construction: ConstructionState): boolean {
  return construction.state === 'done';
}

/** True when the storehouse may be STARTED: both huts done, the
 *  settlement old enough, and a step's materials on hand in the
 *  camp pile. The day gate is the settlement-priority rule —
 *  housing first, storage second — and it is what keeps the
 *  storehouse out of the 24h sim's day 1-2 window. Pure. */
/** A storehouse at full progress whose placement has not landed yet
 *  (the rect was occupied when the last step completed). The step
 *  spend on such a storehouse returns completed without spending
 *  wood or stone, so the placement retry is free — the project still
 *  needs a builder. BUILD 1087: without this, a ready storehouse
 *  whose placement failed strands — the builder releases the job
 *  when the camp stone runs out, the build score needs stone to
 *  fire, nobody re-claims the job, and the job sits open forever
 *  (diag F: buildOpen=1, buildClaimed=0 for 120s+ while the rect
 *  stood empty). Pure. */
export function storehouseReadyForPlacement(storehouse: StorehouseState): boolean {
  return storehouse.state === 'building' && storehouse.progress >= STOREHOUSE_WORK_STEPS;
}

export function canStartStorehouse(
  storehouse: StorehouseState,
  day: number,
  hutsDone: boolean,
  campWood: number,
  campStone: number,
): boolean {
  return (
    storehouseReadyForPlacement(storehouse) ||
    (storehouse.state !== 'done' &&
      storehouse.progress < STOREHOUSE_WORK_STEPS &&
      day >= STOREHOUSE_START_DAY &&
      hutsDone &&
      campWood >= STOREHOUSE_WOOD_PER_STEP &&
      campStone >= STOREHOUSE_STONE_PER_STEP)
  );
}

/** True when a founder may start (or continue) building the
 *  storehouse: it is unfinished and the camp pile holds a step's
 *  wood + stone. The day/housing gates live in canStartStorehouse
 *  (the claim site); this is the per-step gate (the hut's canBuild
 *  shape). Pure. */
export function canBuildStorehouse(storehouse: StorehouseState, campWood: number, campStone: number): boolean {
  return (
    storehouseReadyForPlacement(storehouse) ||
    (storehouse.state !== 'done' &&
      storehouse.progress < STOREHOUSE_WORK_STEPS &&
      campWood >= STOREHOUSE_WOOD_PER_STEP &&
      campStone >= STOREHOUSE_STONE_PER_STEP)
  );
}

/**
 * Complete one work step on the storehouse from the registry's
 * camp store: 2 wood + 1 stone leave the pile, the progress rises
 * by 1. The storehouse draws from the CAMP pile — it does not
 * exist yet to draw from. At the last step the storehouse is
 * READY (progress 6) but the state stays 'building' — the caller
 * flips it to 'done' only when the placement actually lands
 * (finishStorehouse), the same ready/done split as the hut. With
 * too little wood or stone, or when the storehouse is already
 * ready, nothing happens and nothing is withdrawn. Pure.
 */
export function spendStorehouseStepFromRegistry(
  registry: ResourceRegistry,
  storehouse: StorehouseState,
): { registry: ResourceRegistry; storehouse: StorehouseState; completed: boolean; spent: boolean } {
  if (storehouse.state === 'done' || storehouse.progress >= STOREHOUSE_WORK_STEPS) {
    return { registry, storehouse, completed: storehouse.progress >= STOREHOUSE_WORK_STEPS, spent: false };
  }
  if (
    storeQty(registry, CAMP_STORE_ID, 'wood') < STOREHOUSE_WOOD_PER_STEP ||
    storeQty(registry, CAMP_STORE_ID, 'stone') < STOREHOUSE_STONE_PER_STEP
  ) {
    return { registry, storehouse, completed: false, spent: false };
  }
  const w = withdrawFrom(registry, CAMP_STORE_ID, 'wood', STOREHOUSE_WOOD_PER_STEP);
  const s = withdrawFrom(w.registry, CAMP_STORE_ID, 'stone', STOREHOUSE_STONE_PER_STEP);
  if (w.taken < STOREHOUSE_WOOD_PER_STEP || s.taken < STOREHOUSE_STONE_PER_STEP) {
    // Cannot happen (the guard above read the same store), but a
    // partial withdrawal must never become a partial step — return
    // the pre-withdraw registry, so nothing is spent at all.
    return { registry, storehouse, completed: false, spent: false };
  }
  const progress = storehouse.progress + 1;
  const completed = progress >= STOREHOUSE_WORK_STEPS;
  return {
    registry: s.registry,
    storehouse: {
      state: 'building' as StorehouseStateKind,
      progress,
      spentWood: storehouse.spentWood + STOREHOUSE_WOOD_PER_STEP,
      spentStone: storehouse.spentStone + STOREHOUSE_STONE_PER_STEP,
    },
    completed,
    spent: true,
  };
}

/** Flip a ready storehouse (progress 6) to 'done' once its
 *  placement has actually landed. Pure. */
/**
 * The widened quarry radius while the storehouse needs stone. 60 is
 * NOT enough: only 5 rocks sit within 60 of camp, and the 2 left
 * after the near 3 are mined — (112,84) and (119,75) — sit across
 * the north river with no path from camp (the claim loop fails them
 * 'no-path' 200 times and the storehouse stalls at 5/6). The next
 * REACHABLE rocks — (150,77) at 69, (157,81) at 72, (188,104) at
 * 80 — sit to the east, past the river heads. 100 reaches them.
 * Pure.
 */

/**
 * BUILD 1087: the quarry claim radius widens while the settlement
 * still needs stone for (or in) the storehouse. The 1086 claim
 * radius (30) can only supply the 3 rocks near camp — the storehouse
 * needs 6 stone to complete, and the nearest stone deposit sits 59
 * out. The widening is gated on a real stone need, so the 24h window
 * (the storehouse cannot start before day 3) never sees it:
 *  - building + camp stone short of the remaining cost -> widen;
 *  - none + huts done + day >= 3 + no camp stone (cannot start) -> widen;
 *  - done + camp + storehouse stone below the quarry target -> widen
 *    (the storehouse is the settlement's stone reserve — fill it);
 *  - otherwise the 1086 radius (30) stands. Pure.
 */
export const STOREHOUSE_QUARRY_RADIUS = 100;
export function quarryClaimRadiusForStorehouse(
  storehouse: StorehouseState,
  hutsDone: boolean,
  day: number,
  campStone: number,
  storehouseStone: number,
): number {
  if (storehouse.state === 'done') {
    return campStone + storehouseStone < QUARRY_STONE_TARGET ? STOREHOUSE_QUARRY_RADIUS : QUARRY_CLAIM_RADIUS;
  }
  if (storehouse.state === 'building') {
    return campStone < STOREHOUSE_COST_STONE - storehouse.spentStone ? STOREHOUSE_QUARRY_RADIUS : QUARRY_CLAIM_RADIUS;
  }
  // 'none': the storehouse cannot start without a single stone.
  return hutsDone && day >= STOREHOUSE_START_DAY && campStone < 1 ? STOREHOUSE_QUARRY_RADIUS : QUARRY_CLAIM_RADIUS;
}

export function finishStorehouse(storehouse: StorehouseState): StorehouseState {
  if (storehouse.state === 'done') return storehouse;
  return {
    state: 'done',
    progress: STOREHOUSE_WORK_STEPS,
    spentWood: STOREHOUSE_COST_WOOD,
    spentStone: STOREHOUSE_COST_STONE,
  };
}

/** The storehouse placement exists in the world (a 'house' item
 *  with the 'store' variant on the site's exact rect). Pure read. */
export function storehousePlacementExists(world: IsoWorld): boolean {
  return (world.placements ?? []).some(
    (p) =>
      p.kind === 'house' &&
      (p as { variant?: string }).variant === 'store' &&
      p.x0 === STOREHOUSE_RECT.x0 &&
      p.y0 === STOREHOUSE_RECT.y0 &&
      p.x1 === STOREHOUSE_RECT.x1 &&
      p.y1 === STOREHOUSE_RECT.y1,
  );
}

/** The storehouse placement's stable id, or null when no
 *  storehouse placement exists yet. Pure read. */
export function storehousePlacementId(world: IsoWorld): string | null {
  const p = (world.placements ?? []).find(
    (q) =>
      q.kind === 'house' &&
      (q as { variant?: string }).variant === 'store' &&
      q.x0 === STOREHOUSE_RECT.x0 &&
      q.y0 === STOREHOUSE_RECT.y0 &&
      q.x1 === STOREHOUSE_RECT.x1 &&
      q.y1 === STOREHOUSE_RECT.y1,
  );
  return p && typeof p.id === 'string' && p.id.length > 0 ? p.id : null;
}

/**
 * Reconcile the two saves: a 'done' storehouse whose placement is
 * gone (the player removed it with Build Remove) resets to
 * 'none' — the founders rebuild from the pile when the day and
 * the materials allow, and no free storehouse ever appears. A
 * 'building' storehouse with a placement present is treated as
 * done. A ready storehouse (progress 6, placement blocked) is NOT
 * reset — it is waiting for a clear rect, not removed. Returns
 * the SAME object when nothing changes. Pure.
 */
export function reconcileStorehouse(storehouse: StorehouseState, world: IsoWorld): StorehouseState {
  const placed = storehousePlacementExists(world);
  if (storehouse.state === 'done' && !placed) return freshStorehouse();
  if (storehouse.state !== 'done' && placed) return finishStorehouse(storehouse);
  return storehouse;
}

/**
 * Survey the site against the live world: every rect tile must be
 * walkable grass (no water, no tree, no rock) and none of the
 * camp's own tiles may fall inside the rect. Returns the problems
 * (empty = clear). Pure read.
 */
export function storehouseSiteProblems(world: IsoWorld): string[] {
  const problems: string[] = [];
  const door = doorForRect(STOREHOUSE_RECT.x0, STOREHOUSE_RECT.y0, STOREHOUSE_RECT.x1, STOREHOUSE_RECT.y1, 'south');
  if (door.x !== STOREHOUSE_DOOR.x || door.y !== STOREHOUSE_DOOR.y) problems.push('door is not where the constants say');
  for (let y = STOREHOUSE_RECT.y0; y <= STOREHOUSE_RECT.y1; y++) {
    for (let x = STOREHOUSE_RECT.x0; x <= STOREHOUSE_RECT.x1; x++) {
      if (terrainAt(world, x, y) === 'water') problems.push(`water@${x},${y}`);
      if ((world.trees ?? []).some((t) => t.tx === x && t.ty === y)) problems.push(`tree@${x},${y}`);
      if ((world.rocks ?? []).some((r) => r.tx === x && r.ty === y)) problems.push(`rock@${x},${y}`);
      if (x === FOUNDER_CAMP.x && y === FOUNDER_CAMP.y) problems.push('on camp centre');
      if ((world.placements ?? []).some((p) => p.kind === 'farm' && x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1)) problems.push(`farm@${x},${y}`);
    }
  }
  return problems;
}

/** The door must be reachable — planPathNpc must succeed from the
 *  camp to the approach tile, and from the approach tile to the
 *  player spawn. Returns the step counts, or nulls when a route
 *  does not exist. Pure read. */
export function storehouseDoorReachable(world: IsoWorld): { campToApproach: number | null; approachToSpawn: number | null } {
  const toApproach = planPathNpc(world, { x: FOUNDER_CAMP.x, y: FOUNDER_CAMP.y }, STOREHOUSE_APPROACH);
  const toSpawn = planPathNpc(world, STOREHOUSE_APPROACH, { x: 99, y: 105 });
  return { campToApproach: toApproach ? toApproach.length : null, approachToSpawn: toSpawn ? toSpawn.length : null };
}

/** True when the site is clear AND the door is reachable. */
export function verifyStorehouseSite(world: IsoWorld): { ok: boolean; problems: string[]; campToApproach: number | null; approachToSpawn: number | null } {
  const problems = storehouseSiteProblems(world);
  const reach = storehouseDoorReachable(world);
  if (reach.campToApproach === null) problems.push('no path camp -> door approach');
  if (reach.approachToSpawn === null) problems.push('no path door approach -> player spawn');
  return { ok: problems.length === 0, problems, ...reach };
}

/** The storehouse's progress as a label for the HUD / E reports:
 *  "3/6", "done", or "—". Pure. */
export function storehouseLabel(storehouse: StorehouseState): string {
  if (storehouse.state === 'done') return 'done';
  if (storehouse.state === 'building') return `${storehouse.progress}/${STOREHOUSE_WORK_STEPS}`;
  return '—';
}

// --- The registry store: wood + stone, capped, at the site. ---

/** Wood in the storehouse store (0 when it never held any). Pure. */
export function storehouseWoodInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, STOREHOUSE_STORE_ID, 'wood');
}

/** Stone in the storehouse store (0 when it never held any). Pure. */
export function storehouseStoneInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, STOREHOUSE_STORE_ID, 'stone');
}

/** Ore of a kind in the storehouse store (0 when it never held any).
 *  BUILD 1089: the mine's iron lives here (mines.ts). Pure. */
export function storehouseOreInRegistry(registry: ResourceRegistry, kind: string): number {
  return storeQty(registry, STOREHOUSE_STORE_ID, kind as 'iron' | 'copper' | 'coal' | 'gold' | 'silver' | 'stone');
}

/**
 * Seed the storehouse store from the founders save numbers (load
 * path): wood + stone at the storehouse approach tile, capacity
 * the storehouse's real cap, source 'loaded'. A storehouse that
 * never held a kind has no entry (qty 0) — the cap is set on the
 * first deposit, so a fresh storehouse's first delivery creates
 * the capped entry. Pure.
 */
export function seedStorehouseStore(registry: ResourceRegistry, wood: number, stone: number, ore = 0): ResourceRegistry {
  let next = registry;
  if (wood > 0) {
    next = setStoreQty(
      next,
      STOREHOUSE_STORE_ID,
      'wood',
      wood,
      { type: 'loaded' },
      { capacity: STOREHOUSE_CAPACITY_WOOD, location: { ...STOREHOUSE_APPROACH } },
    );
  }
  if (stone > 0) {
    next = setStoreQty(
      next,
      STOREHOUSE_STORE_ID,
      'stone',
      stone,
      { type: 'loaded' },
      { capacity: STOREHOUSE_CAPACITY_STONE, location: { ...STOREHOUSE_APPROACH } },
    );
  }
  // BUILD 1089: the storehouse's stored iron (the mine's ore) —
  // seeded from the founders save (v11), like wood and stone.
  if (ore > 0) {
    next = setStoreQty(
      next,
      STOREHOUSE_STORE_ID,
      'iron',
      ore,
      { type: 'loaded' },
      { capacity: STOREHOUSE_CAPACITY_ORE, location: { ...STOREHOUSE_APPROACH } },
    );
  }
  return next;
}

/** The store a delivery goes to: the storehouse once it exists,
 *  the camp pile before that (and while it is still being built).
 *  Pure. */
export function deliveryStoreId(storehouse: StorehouseState | null | undefined): string {
  return storehouse && storehouse.state === 'done' ? STOREHOUSE_STORE_ID : CAMP_STORE_ID;
}

/**
 * Deliver the founder's carried wood, grain, stone, and carried
 * build wood to their stores (BUILD 1087 — the hauling leg):
 * wood + stone + build wood go to the delivery store (the
 * storehouse when it exists, the camp pile before that); grain
 * always goes to the camp store (the mill's buffer lives at
 * camp). When the storehouse is full for a kind, the remainder
 * overflows to the camp pile — a real transfer each way, so the
 * total is conserved across the chain (transfer() puts what does
 * not fit back in the source, and the second leg moves it to
 * camp). When no storehouse exists the transfers are exactly the
 * camp delivery the founders always did. Returns the new registry
 * and how many units of each moved. The caller sets f.carrying -=
 * movedWood, f.carryingGrain -= movedGrain, f.carryingStone -=
 * movedStone, f.carryingBuild -= movedBuildWood. Pure.
 */
export function deliverFounderCarryToStore(
  registry: ResourceRegistry,
  f: FounderState,
  storehouse: StorehouseState | null | undefined,
): { registry: ResourceRegistry; movedWood: number; movedGrain: number; movedStone: number; movedBuildWood: number; movedOre: number; dest: string } {
  const dest = deliveryStoreId(storehouse);
  const loc = dest === STOREHOUSE_STORE_ID ? { ...STOREHOUSE_APPROACH } : { ...FOUNDER_CAMP_CENTRE };
  const src = { type: 'entity', id: f.id } as const;
  let reg = registry;
  let movedWood = 0;
  let movedStone = 0;
  let movedBuildWood = 0;
  const carrying = Math.max(0, Math.floor(f.carrying));
  const carryingStone = Math.max(0, Math.floor(f.carryingStone));
  const carryingBuild = Math.max(0, Math.floor(f.carryingBuild ?? 0));
  // BUILD 1089: the mine's ore (iron) rides the same delivery — a
  // real transfer to the delivery store, capacity-capped, with the
  // same overflow-to-camp when the storehouse is full for the kind.
  const carryingOre = Math.max(0, Math.floor(f.carryingOre ?? 0));
  const moveToDest = (kind: 'wood' | 'stone' | 'iron', qty: number, capacity: number): number => {
    if (qty <= 0) return 0;
    const first = transfer(reg, carrierStoreId(f.id), dest, kind, qty, src, { location: loc, capacity });
    reg = first.registry;
    let moved = first.moved;
    if (moved < qty && dest !== CAMP_STORE_ID) {
      const rest = transfer(reg, carrierStoreId(f.id), CAMP_STORE_ID, kind, qty - moved, src, { location: { ...FOUNDER_CAMP_CENTRE } });
      reg = rest.registry;
      moved += rest.moved;
    }
    return moved;
  };
  movedWood = moveToDest('wood', carrying, STOREHOUSE_CAPACITY_WOOD);
  const grain = Math.max(0, Math.floor(f.carryingGrain));
  let movedGrain = 0;
  if (grain > 0) {
    const res = transfer(reg, carrierStoreId(f.id), CAMP_STORE_ID, 'grain', grain, src, { location: { ...FOUNDER_CAMP_CENTRE } });
    reg = res.registry;
    movedGrain = res.moved;
  }
  movedStone = moveToDest('stone', carryingStone, STOREHOUSE_CAPACITY_STONE);
  movedBuildWood = moveToDest('wood', carryingBuild, STOREHOUSE_CAPACITY_WOOD);
  const movedOre = moveToDest('iron', carryingOre, STOREHOUSE_CAPACITY_ORE);
  return { registry: reg, movedWood, movedGrain, movedStone, movedBuildWood, movedOre, dest };
}

/**
 * Fetch 2 wood from the storehouse into the founder's carrier
 * (BUILD 1087 — the storehouse -> construction-site leg): a real
 * transfer (storehouse store -> carrier store, capacity 2 — the
 * real carry limit), so the wood the storehouse held is the wood
 * the builder carries. Returns the new registry and how many units
 * actually moved (0..2 — the storehouse may hold less than a full
 * step when two builders fetch at once; the caller falls back to
 * the camp-pile step when the fetch is short). The caller sets
 * f.carryingBuild = moved. Pure.
 */
export function fetchBuildWood(
  registry: ResourceRegistry,
  f: FounderState,
): { registry: ResourceRegistry; moved: number } {
  if (storeQty(registry, STOREHOUSE_STORE_ID, 'wood') < HUT_WOOD_PER_STEP) return { registry, moved: 0 };
  const res = transfer(
    registry,
    STOREHOUSE_STORE_ID,
    carrierStoreId(f.id),
    'wood',
    HUT_WOOD_PER_STEP,
    { type: 'entity', id: f.id },
    { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
  );
  return res;
}

/**
 * Complete one hut work step with CARRIED wood (BUILD 1087 — the
 * builder fetched the step's wood from the storehouse and walked
 * it to the site): 2 wood leave the founder's carrier store, the
 * progress rises by 1. At the last step the hut is READY (progress
 * 6) but the state stays 'building' — the caller flips it to
 * 'done' only when the placement actually lands. With too little
 * carried wood, nothing happens and nothing is withdrawn (the
 * caller falls back to the camp-pile step). The caller sets
 * f.carryingBuild -= 2 when spent. Pure.
 */
export function spendBuildStepFromCarried(
  registry: ResourceRegistry,
  construction: ConstructionState,
  f: FounderState,
  siteIndex: number | null = null,
): { registry: ResourceRegistry; construction: ConstructionState; completed: boolean; spent: boolean } {
  const sites = sitesOf(construction);
  const i = siteIndex ?? activeSiteIndex(construction) ?? 0;
  const site = sites[i] ?? sites[0];
  if (site.state === 'done' || site.progress >= HUT_WORK_STEPS) {
    return { registry, construction, completed: site.progress >= HUT_WORK_STEPS, spent: false };
  }
  if (Math.max(0, Math.floor(f.carryingBuild ?? 0)) < HUT_WOOD_PER_STEP) {
    return { registry, construction, completed: false, spent: false };
  }
  if (storeQty(registry, carrierStoreId(f.id), 'wood') < HUT_WOOD_PER_STEP) {
    return { registry, construction, completed: false, spent: false };
  }
  const w = withdrawFrom(registry, carrierStoreId(f.id), 'wood', HUT_WOOD_PER_STEP);
  if (w.taken < HUT_WOOD_PER_STEP) {
    return { registry, construction, completed: false, spent: false };
  }
  const progress = site.progress + 1;
  const spentWood = site.spentWood + HUT_WOOD_PER_STEP;
  const completed = progress >= HUT_WORK_STEPS;
  const next = sites.map((s, j) => (j === i ? { state: 'building' as const, progress, spentWood } : { ...s }));
  return {
    registry: w.registry,
    construction: constructionFromSites(next),
    completed,
    spent: true,
  };
}

/**
 * Distance from a position to the ACTIVE build site — the nearest
 * unfinished hut's approach tile, or the storehouse's approach
 * tile when the huts are all done and the storehouse is the
 * project (started or startable), else 999 (nothing to build, so
 * the build score is 0 then anyway). The scorer's distToSite —
 * the tick, the sim driver, and the wait step all read this one
 * helper, so the three never disagree. Pure.
 */
export function distToActiveBuildSite(
  pos: { x: number; y: number },
  construction: ConstructionState,
  storehouse: StorehouseState | null | undefined,
  day: number,
): number {
  const site = nearestUnfinishedSite(construction, pos);
  if (site) return Math.abs(site.approach.x - pos.x) + Math.abs(site.approach.y - pos.y);
  if (storehouse && storehouse.state !== 'done' && day >= STOREHOUSE_START_DAY) {
    return Math.abs(STOREHOUSE_APPROACH.x - pos.x) + Math.abs(STOREHOUSE_APPROACH.y - pos.y);
  }
  return 999;
}
