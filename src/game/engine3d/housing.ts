/**
 * BUILD 1096 (0x1F, Phase 3.5): housing as capacity + the inn +
 * the market-stall seed.
 *
 * HOUSES AS CAPACITY: the third hut site (worker housing, 4 beds)
 * lives in construction.ts (HUT_SITES[2]) — a house built through
 * the staged path adds its beds to housingCapacity when finished;
 * a half-built house adds nothing. The arrival check in
 * settlementGrowth.ts already gates on that capacity (a newcomer
 * needs a free bed), so no arrival happens while every bed is full.
 *
 * THE INN: the settlement's first hospitality — a 6x5 'house-inn'
 * (the measured town variant; the catalogue's 5x4 was wrong vs the
 * variant and is corrected to 6x5 in this build). Centre (122,107),
 * rect 119..124 x 105..109, door south (122,109), approach
 * (122,110) — surveyed clear on the fresh world (validatePlacement
 * passes; the (119,112) candidate died on a generated garden
 * fence, the eastern candidates sit inside the lumber rect).
 * Built through the STAGED path (6 steps x 1 wood, like the
 * mill/bakery/chain buildings), gated on worker-housing done +
 * day >= INN_START_DAY (5). It draws its wood pile-first +
 * storehouse-second (withdrawChainWood — the pile sits at 0 once
 * the storehouse exists, the 1095 lesson). A half-built inn rests
 * nobody.
 *
 * INN REST: an arriving founder who has not rested at the inn
 * detours to the inn approach when the inn is done, rests inside
 * (activity 'rest', restTile = a free INN_REST_TILE, energy to
 * full) and eats one meal from the inn store, then walks on to
 * camp. The rest is a timed stay (INN_REST_TICKS) — 'rest' does
 * not recover energy in the needs decay (only 'sleep' does), so
 * the inn grants the energy directly on arrival (a real rest,
 * not a decay change). The scorer is skipped while 'arriving', so
 * the forced 'rest' holds until the stay ends. No new workState,
 * no save change (innRested / innRestTicks are session-only on
 * FounderState).
 *
 * INN STORE: the inn's food store (meals for resting travelers),
 * a registry store (INN_STORE_ID, cap INN_CAPACITY_FOOD = 20).
 * Topped up from the granary at the day boundary when the inn is
 * finished — a conserved transfer (food moves, the total never
 * changes), no new job. A traveler eats one meal from it while
 * resting; with an empty inn store they rest hungry (energy still
 * recovers — the rest is real, the meal is the bonus).
 *
 * MARKET STALL: the trade UI seed for Phase 5 — a read-only
 * listing of what the settlement has to trade (the storehouse +
 * granary stores, from the registry). No transactions; trade
 * itself is Phase 5, NOT built here. The listing is wired to the
 * existing town stall at (114,116) via a test hook + the Control
 * Center display.
 *
 * NIGHT SLEEPERS: nightSleepers maps every bed in every finished
 * house to the founder who sleeps in it — the acceptance test's
 * proof that every bed holds exactly one sleeper and every
 * sleeper is in a bed.
 *
 * SAVE: the inn state rides in the versioned founders save
 * (ag-3d-founders-v1, v12 — NO version move; a compatible field
 * defaulted when absent, the 1093 'stages' precedent). The inn
 * placement rides in the world save (w.placements, via saveWorld),
 * like the hut. If the player removes the inn with Build Remove,
 * reconcileHousing resets it to 'none' and the founders rebuild
 * from the pile when the gate allows — no free inn.
 *
 * Pure module (no React, no WebGL, no localStorage in the pure
 * functions) so the sim and the standalone asserts can import it
 * directly.
 */

import {
  stagePlanFor,
  stageProgressOf,
  currentStageFor,
  HUT_SITES,
  sitesOf,
  type ConstructionState,
  type HutSite,
  type StageSteps,
  type StagePlan,
} from './construction';
import {
  CAMP_STORE_ID,
  GRANARY_STORE_ID,
  INN_STORE_ID,
  depositInto,
  setStoreQty,
  storeQty,
  withdrawFrom,
  type ResourceRegistry,
} from './resourceRegistry';
import { STOREHOUSE_STORE_ID } from './storehouse';
import { withdrawChainWood } from './metalChain';
import type { IsoWorld } from '../iso/isoWorld';
import type { FounderState } from './founders';

/** The inn's stable site id — the build job's target. */
export const INN_SITE_ID = 'inn-site';

/** The inn's centre tile (surveyed). */
export const INN_CENTRE = { x: 122, y: 107 } as const;
/** The inn's footprint rect (surveyed, 6x5 — the measured
 *  house-inn variant). */
export const INN_RECT = { x0: 119, y0: 105, x1: 124, y1: 109 } as const;
/** The inn's door tile (south edge). */
export const INN_DOOR = { x: 122, y: 109 } as const;
/** The inn's approach tile (one south of the door). */
export const INN_APPROACH = { x: 122, y: 110 } as const;

/** The inn's rest tiles — inside the inn, the north row either
 *  side of the door lane (x=122): a resting traveler stands here,
 *  through the door from the approach. Two spots; arrivals are one
 *  at a time, so two is plenty. */
export const INN_REST_TILES = [
  { x: 120, y: 105 },
  { x: 123, y: 105 },
] as const;

/** The inn as a HutSite — the renderer's build-site fx draws the
 *  half-built stage geometry from this (the storehouse's
 *  STOREHOUSE_HUT_SITE pattern). No sleep tiles: nobody sleeps in
 *  the inn (travelers rest, residents sleep in their own beds). */
export const INN_HUT_SITE: HutSite = {
  id: INN_SITE_ID,
  centre: { ...INN_CENTRE },
  rect: { ...INN_RECT },
  door: { ...INN_DOOR },
  approach: { ...INN_APPROACH },
  sleepTiles: [],
};

/** Work steps to build the inn (6 steps x 1 wood = 6 wood). */
export const INN_WORK_STEPS = 6;
/** Wood spent per inn work step. */
export const INN_WOOD_PER_STEP = 1;
/** Total wood to build the inn. */
export const INN_COST_WOOD = INN_WORK_STEPS * INN_WOOD_PER_STEP;

/** The earliest day the inn may start (worker housing opens day 3
 *  and takes ~a day to finish, so the inn opens day 5 — housing
 *  first, hospitality second). */
export const INN_START_DAY = 5;

/** The inn store's food cap (meals for resting travelers). */
export const INN_CAPACITY_FOOD = 20;
/** Ticks a traveler rests at the inn (~30 game-minutes — a real
 *  waystation pause, not a blink). */
export const INN_REST_TICKS = 30;
/** Hunger a traveler has after one inn meal (a full meal, the
 *  eatFounderMeal value). */
export const INN_MEAL_HUNGER = 100;

/** The town market stall's tile (the existing stall the listing is
 *  wired to — no new building). */
export const MARKET_STALL_TILE = { x: 114, y: 116 } as const;

// --- State ---

export type HousingSiteKind = 'none' | 'building' | 'done';

/** One housing building's construction progress (saved in the
 *  founders save, v12 — the same shape as one hut SiteState /
 *  the food-chain site, wood-only). */
export type HousingSiteState = {
  state: HousingSiteKind;
  /** Completed work steps, 0..6. */
  progress: number;
  /** Wood actually spent on this building (1 per step). */
  spentWood: number;
  /** Per-stage steps completed (BUILD 1093). Optional: an old
   *  save without it derives the stages from the total progress. */
  stages?: StageSteps;
};

/** The housing state — the inn (worker housing rides in
 *  ConstructionState.sites as hut-site-2). Saved in the founders
 *  save, v12. */
export type HousingState = {
  inn: HousingSiteState;
};

function freshSite(totalSteps: number): HousingSiteState {
  return { state: 'none', progress: 0, spentWood: 0, stages: stageProgressOf({ progress: 0 }, totalSteps) };
}

/** A fresh housing state — no inn. Pure. */
export function freshHousing(): HousingState {
  return { inn: freshSite(INN_WORK_STEPS) };
}

// --- Stage plan (0x1C: foundation -> frame -> finished) ---

/** The inn's stage plan: 6 steps / 6 wood -> 3x (2 steps, 2 wood). Pure. */
export function innStagePlan(): StagePlan {
  return stagePlanFor(INN_WORK_STEPS, [{ resource: 'wood', qty: INN_WOOD_PER_STEP * INN_WORK_STEPS }]);
}

// --- Gates ---

/** True when the inn is ready for its placement (progress 6,
 *  still 'building' — the caller flips it to 'done' only when
 *  the placement actually lands, the same ready/done split as
 *  the hut and the storehouse). Pure. */
export function innReadyForPlacement(housing: HousingState): boolean {
  return housing.inn.state === 'building' && housing.inn.progress >= INN_WORK_STEPS;
}

/** True when worker housing (hut-site-2) is finished — the inn's
 *  prerequisite (hospitality comes after housing). Pure. */
export function isWorkerHousingDone(construction: ConstructionState): boolean {
  const sites = sitesOf(construction);
  return sites.length > 2 && sites[2].state === 'done';
}

/** True when a founder may start (or continue) building the inn:
 *  it is unfinished, worker housing is DONE, the settlement is
 *  old enough (day >= INN_START_DAY), and the pile + storehouse
 *  hold a step's wood. The day + housing gates live here (the
 *  claim site); the per-step gate is canBuildInn. Pure. */
export function canStartInn(
  housing: HousingState,
  construction: ConstructionState,
  campWood: number,
  storehouseWood: number,
  day: number,
): boolean {
  return (
    innReadyForPlacement(housing) ||
    (housing.inn.state !== 'done' &&
      housing.inn.progress < INN_WORK_STEPS &&
      isWorkerHousingDone(construction) &&
      day >= INN_START_DAY &&
      campWood + storehouseWood >= INN_WOOD_PER_STEP)
  );
}

/** True when a founder may do an inn work step: it is unfinished
 *  and the pile + storehouse hold a step's wood. The housing /
 *  day gates live in canStartInn (the claim site); this is the
 *  per-step gate (the hut's canBuild shape). Pure. */
export function canBuildInn(housing: HousingState, campWood: number, storehouseWood: number): boolean {
  return (
    innReadyForPlacement(housing) ||
    (housing.inn.state !== 'done' &&
      housing.inn.progress < INN_WORK_STEPS &&
      campWood + storehouseWood >= INN_WOOD_PER_STEP)
  );
}

/** True when the inn is finished and usable (all stages done).
 *  A half-built inn rests nobody. Pure. */
export function isInnUsable(housing: HousingState): boolean {
  return housing.inn.state === 'done' && housing.inn.progress >= INN_WORK_STEPS;
}

// --- Construction steps (spend pile-first + storehouse-second) ---

/**
 * Complete one work step on the inn: 1 wood leaves the pile (or
 * the storehouse when the pile is short — withdrawChainWood, the
 * 1095 lesson: the pile sits at 0 once the storehouse exists),
 * the progress rises by 1. The total is checked first, so a short
 * total spends nothing (no partial step). Pure.
 */
export function buildInnStep(
  registry: ResourceRegistry,
  housing: HousingState,
): { registry: ResourceRegistry; housing: HousingState; completed: boolean; spent: boolean } {
  const site = housing.inn;
  if (site.state === 'done' || site.progress >= INN_WORK_STEPS) {
    return { registry, housing, completed: site.progress >= INN_WORK_STEPS, spent: false };
  }
  const w = withdrawChainWood(registry, INN_WOOD_PER_STEP);
  if (w.taken < INN_WOOD_PER_STEP) {
    return { registry, housing, completed: false, spent: false };
  }
  const progress = site.progress + 1;
  const completed = progress >= INN_WORK_STEPS;
  const cur = currentStageFor(site, INN_WORK_STEPS);
  const stages = stageProgressOf(site, INN_WORK_STEPS);
  const nextStages: StageSteps = cur ? { ...stages, [cur.id]: stages[cur.id] + 1 } : stages;
  const next: HousingState = {
    ...housing,
    inn: {
      state: 'building' as HousingSiteKind,
      progress,
      spentWood: site.spentWood + INN_WOOD_PER_STEP,
      stages: nextStages,
    },
  };
  return { registry: w.registry, housing: next, completed, spent: true };
}

/** The inn finished — the placement landed (the caller flips the
 *  state only when the placement actually lands). Pure. */
export function finishInn(housing: HousingState): HousingState {
  return {
    ...housing,
    inn: { ...housing.inn, state: 'done', progress: INN_WORK_STEPS },
  };
}

/** The inn placement exists in the world (a 'house' item with the
 *  'inn' variant on the site's exact rect). Pure read. */
export function innPlacementExists(world: IsoWorld): boolean {
  return (world.placements ?? []).some(
    (p) =>
      p.kind === 'house' &&
      (p as { variant?: string }).variant === 'inn' &&
      p.x0 === INN_RECT.x0 &&
      p.y0 === INN_RECT.y0 &&
      p.x1 === INN_RECT.x1 &&
      p.y1 === INN_RECT.y1,
  );
}

/** Reconcile the inn against the world (the food-chain pattern):
 *  a 'done' inn whose placement is gone resets to 'none' (the
 *  founders rebuild from the pile); a 'building' inn with a
 *  placement present is done. Pure. */
export function reconcileHousing(housing: HousingState, world: IsoWorld): HousingState {
  const placed = innPlacementExists(world);
  if (housing.inn.state === 'done' && !placed) {
    return { ...housing, inn: freshSite(INN_WORK_STEPS) };
  }
  if (housing.inn.state !== 'done' && placed) {
    return finishInn(housing);
  }
  return housing;
}

/** Validate a loaded housing state (the founders save, v12 — the
 *  food-chain validate shape): a corrupt or missing state migrates
 *  to fresh (nothing started). Pure. */
export function validateHousingState(value: unknown): HousingState {
  if (!value || typeof value !== 'object') return freshHousing();
  const v = value as Record<string, unknown>;
  const raw = v.inn;
  if (!raw || typeof raw !== 'object') return freshHousing();
  const s = raw as Record<string, unknown>;
  const state = s.state === 'building' || s.state === 'done' ? (s.state as HousingSiteKind) : 'none';
  let progress = Math.max(0, Math.min(INN_WORK_STEPS, Math.round(Number(s.progress) || 0)));
  let spentWood = Math.max(0, Math.round(Number(s.spentWood) || 0));
  if (state === 'done') {
    progress = INN_WORK_STEPS;
    spentWood = INN_COST_WOOD;
  }
  if (state === 'none') {
    progress = 0;
    spentWood = 0;
  }
  const stages = stageProgressOf({ progress, stages: (s as { stages?: StageSteps }).stages }, INN_WORK_STEPS);
  return { inn: { state, progress, spentWood, stages } };
}

/** Seed the inn store from the founders save (the granary /
 *  storehouse seed shape): the inn's food, capped at
 *  INN_CAPACITY_FOOD. Pure. */
export function seedInnStore(registry: ResourceRegistry, food: number): ResourceRegistry {
  if (food <= 0) return registry;
  return setStoreQty(
    registry,
    INN_STORE_ID,
    'food',
    food,
    { type: 'loaded' },
    { capacity: INN_CAPACITY_FOOD, location: { ...INN_DOOR } },
  );
}

// --- Inn rest ---

/** True when the tile is inside the inn rect. Pure. */
export function insideInnRect(x: number, y: number): boolean {
  return x >= INN_RECT.x0 && x <= INN_RECT.x1 && y >= INN_RECT.y0 && y <= INN_RECT.y1;
}

/** The first free inn rest tile (not taken by another founder's
 *  restTile), or null when both spots are taken. Pure. */
export function innRestTileFor(taken: ReadonlySet<string>): { x: number; y: number } | null {
  for (const t of INN_REST_TILES) {
    if (!taken.has(t.x + ',' + t.y)) return { x: t.x, y: t.y };
  }
  return null;
}

/** Meals in the inn store (the registry read). Pure. */
export function innFoodInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, INN_STORE_ID, 'food');
}

/**
 * A traveler eats one meal from the inn store: hunger to full,
 * one meal leaves the store. With an empty inn store, nothing
 * happens (they rest hungry — the rest is real, the meal is the
 * bonus). Pure — mirrors eatFounderMeal (camp stock), but the
 * meal comes from the inn store, not the camp.
 */
export function eatInnMeal(
  needs: { hunger: number; energy: number; social: number; health: number },
  innFood: number,
): { needs: { hunger: number; energy: number; social: number; health: number }; innFood: number; ate: boolean } {
  if (innFood < 1) return { needs, innFood, ate: false };
  return { needs: { ...needs, hunger: INN_MEAL_HUNGER }, innFood: innFood - 1, ate: true };
}

/**
 * Top up the inn store from the granary at the day boundary: move
 * up to the inn's free space (cap - current) from the granary's
 * food. A conserved transfer (food moves, the total never
 * changes) — no new job, no free meals. Pure.
 */
export function topUpInnStore(registry: ResourceRegistry): { registry: ResourceRegistry; moved: number } {
  const innFood = storeQty(registry, INN_STORE_ID, 'food');
  const free = INN_CAPACITY_FOOD - innFood;
  if (free <= 0) return { registry, moved: 0 };
  const granaryFood = storeQty(registry, GRANARY_STORE_ID, 'food');
  const moved = Math.min(free, granaryFood);
  if (moved <= 0) return { registry, moved: 0 };
  const taken = withdrawFrom(registry, GRANARY_STORE_ID, 'food', moved);
  if (taken.taken <= 0) return { registry, moved: 0 };
  // The deposit carries the cap (the entry is created with it on
  // the first top-up; the move is already capped at the free space,
  // so the deposit never overflows — the capacity is the record).
  const put = depositInto(taken.registry, INN_STORE_ID, 'food', taken.taken, { type: 'loaded' }, { capacity: INN_CAPACITY_FOOD, location: { ...INN_DOOR } });
  return { registry: put.registry, moved: put.added };
}

// --- Market stall (the trade UI seed for Phase 5) ---

/** One tradable line: what the settlement has to trade. */
export type MarketStallLine = {
  /** The resource kind (registry kind). */
  resource: string;
  /** How many the settlement holds (storehouse + granary). */
  qty: number;
  /** Which store holds it ('storehouse' | 'granary'). */
  store: 'storehouse' | 'granary';
};

/**
 * The settlement's tradable store — a READ-ONLY listing from the
 * registry (the storehouse store + the granary store). No
 * transactions: trade itself is Phase 5, NOT built here. Pure.
 */
export function marketStallListing(registry: ResourceRegistry): MarketStallLine[] {
  const lines: MarketStallLine[] = [];
  const storehouseKinds = ['wood', 'stone', 'iron', 'coal', 'ingot', 'tools', 'timber', 'furniture'] as const;
  for (const k of storehouseKinds) {
    const qty = storeQty(registry, STOREHOUSE_STORE_ID, k);
    if (qty > 0) lines.push({ resource: k, qty, store: 'storehouse' });
  }
  const granaryKinds = ['grain', 'flour', 'food'] as const;
  for (const k of granaryKinds) {
    const qty = storeQty(registry, GRANARY_STORE_ID, k);
    if (qty > 0) lines.push({ resource: k, qty, store: 'granary' });
  }
  // The camp pile's wood is the settlement's wood too (before the
  // storehouse exists the pile IS the store).
  const pileWood = storeQty(registry, CAMP_STORE_ID, 'wood');
  if (pileWood > 0) lines.push({ resource: 'wood', qty: pileWood, store: 'storehouse' });
  return lines;
}

// --- Night sleepers (the acceptance test's proof) ---

/** One bed's night occupant: the bed + the founder sleeping in
 *  it (null when the bed is empty). */
export type NightBed = {
  /** Which hut site the bed belongs to (HUT_SITES index). */
  hut: number;
  /** The bed tile. */
  x: number;
  y: number;
  /** The founder sleeping in it, or null when empty. */
  sleeper: string | null;
};

/**
 * Every bed in every finished house + who sleeps in it — the
 * acceptance test's proof: every bed maps to exactly one sleeper
 * (or is empty, when the house has more beds than residents) and
 * every sleeper is in a bed. A half-built house contributes no
 * beds. Pure.
 */
export function nightSleepers(
  founders: readonly FounderState[],
  construction: ConstructionState,
): { beds: NightBed[]; everyBedOneSleeper: boolean; everySleeperInBed: boolean } {
  const sites = sitesOf(construction);
  const beds: NightBed[] = [];
  // BUILD 1096: count the claimants per bed — founders.find (first
  // match) made a duplicate bed assignment invisible (the second
  // sleeper simply vanished, their original bed reading empty, and
  // everyBedOneSleeper stayed true). A bed with more than one
  // claimant breaks the one-sleeper-per-bed rule.
  let everyBedOneSleeper = true;
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].state !== 'done') continue;
    for (const t of HUT_SITES[i].sleepTiles) {
      const claimants = founders.filter((f) => f.bed.hut === i && f.bed.x === t.x && f.bed.y === t.y);
      if (claimants.length > 1) everyBedOneSleeper = false;
      beds.push({ hut: i, x: t.x, y: t.y, sleeper: claimants.length > 0 ? claimants[0].name : null });
    }
  }
  const everySleeperInBed = founders.every((f) => beds.some((b) => b.sleeper === f.name));
  return { beds, everyBedOneSleeper, everySleeperInBed };
}
