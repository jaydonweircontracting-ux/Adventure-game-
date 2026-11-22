/**
 * BUILD 1094 (0x1D, Phase 3.3): the food chain — mill -> flour ->
 * bakery -> meals.
 *
 * The settlement already has a food loop, but it is a shortcut:
 * the 1067 mill turns grain directly into meals (2 grain -> 1
 * meal, max 2 meals/tick, while food < 15), and the 1090 granary
 * stores grain (200 cap) and food (60 cap). This build replaces
 * the shortcut with the REAL chain:
 *
 *   farm (wheat) -> harvest -> grain (granary)
 *     -> MILL (a founder grinds) -> flour (granary, 100 cap)
 *     -> BAKERY (a founder bakes) -> meals (granary, 60 cap)
 *     -> eaten from the granary.
 *
 * THE CHAIN IS ONLY AS STRONG AS ITS WEAKEST LINK:
 * - A mill with NO worker produces nothing (grindGrainToFlour
 *   takes workerPresent — false means no flour, ever).
 * - A mill with a worker but NO grain produces nothing (grain < 2
 *   means no grind).
 * - A bakery with NO worker produces nothing; with a worker but
 *   NO flour produces nothing (same shape, bakeFlourToMeals).
 * - The old direct grain -> meals path (food.ts millGrainToMeals)
 *   is REMOVED — the bakery is the only way grain becomes meals.
 *   There is no fallback; the chain is the one that feeds the
 *   settlement, and the acceptance test proves it end to end.
 *
 * MATERIALS CONSERVE (R-1): grain + flour + 2xfood is constant
 * across every grind and every bake. Grind: 2 grain -> 2 flour
 * (1:1). Bake: 2 flour -> 1 meal. No free flour, no free meals.
 * The flour store has a cap (GRANARY_CAPACITY_FLOUR = 100, in
 * granary.ts — the granary is the settlement's food store, so the
 * flour lives there beside the grain and the meals); the grind
 * stops at the cap, and the bake stops when food reaches
 * BAKE_FOOD_THRESHOLD (15 — the old MILL_FOOD_THRESHOLD, moved
 * here with the mill it gated).
 *
 * CONSTRUCTION — the mill and the bakery are catalogue entries
 * (C food/agriculture: Windmills, Bakeries — see
 * buildingCatalogue.ts) and they are built through the STAGED
 * construction path (0x1C) — foundation -> frame -> finished,
 * materials delivered per stage, half-built unusable. There is
 * no second construction path. Each costs 6 wood (6 steps x 1
 * wood, stages 2/2/2, per-stage 2 wood) — wood-only, so no stone
 * bottleneck blocks day-1/2 construction. The mill opens when
 * the first grain lands (~11:30 day 1); the bakery opens when
 * the mill is done. Both are founder-built (a build job per site,
 * one builder per site, the same builderTaken guard as the hut /
 * storehouse / bridge), and each stamps a real placement when it
 * finishes (the mill stamps a 'house-windmill' placement, the
 * bakery stamps a 'house' placement — there is no 'house-bakery'
 * palette kind, and this build does not invent one). A
 * player-placed windmill does NOT mill — milling is tied to the
 * founder-built mill site (this module's state), out of scope
 * for this build.
 *
 * SITES (surveyed on the real fresh world, verify1094 survey):
 * - Mill: south of the storehouse, clear of the farm, clear of
 *   hut 0's approach (128,122), clear of the storehouse approach
 *   (124,127) — the mill rect starts at y=128 so the storehouse
 *   exit stays open — clear of every tree/rock/river. Centre
 *   (124,129), rect 123..125 x 128..130, door south (124,130),
 *   approach (124,131). Camp -> approach is 11 steps.
 * - Bakery: east of the storehouse, clear of hut 0 (126..129 x
 *   119..121) and of the storehouse rect (122..126 x 123..126) —
 *   the bakery rect starts at x=128 so the storehouse's east wall
 *   stays clear — clear of every tree/rock/river. Centre (129,125),
 *   rect 128..130 x 124..126, door south (129,126), approach
 *   (129,127). Camp -> approach is 12 steps.
 *
 * WORK: milling/baking are J-1 jobs ('mill' | 'bake', see
 * jobs.ts) — one miller at a time (the millTaken guard), and since
 * BUILD 1104 TWO bakers at a time (BAKE_SLOTS; the bakeTaken guard
 * is true only when both bake slots are taken, mirroring
 * mineTaken). The founder walks to the
 * building (workStates 'toMill'/'milling', 'toBakery'/'baking',
 * see founders.ts), works a 3-tick shift (MILL_TICKS_PER_SHIFT /
 * BAKE_TICKS_PER_SHIFT, mirroring FOUNDER_MINE_TICKS), produces
 * per tick, the job completes, and the founder returns to
 * 'toTree'. The scorer (utility.ts) claims a mill/bake job when
 * the building is finished and there is grain/flour to process.
 *
 * SAVE: the mill/bakery state + the flour count ride in the
 * versioned founders save (ag-3d-founders-v1, v12 — NO version
 * move; the foodChain state + flourStock are compatible fields
 * defaulted when absent, the 1093 'stages' precedent). The
 * mill/bakery placements ride in the world save (w.placements,
 * via saveWorld), like the hut. If the player removes the mill
 * or the bakery with Build Remove, reconcileFoodChain resets it
 * to 'none' and the founders rebuild from the pile when the
 * grain/materials allow — no free mill, no free bakery.
 *
 * Pure module (no React, no WebGL, no localStorage in the pure
 * functions) so the sim and the standalone asserts can import it
 * directly.
 */

import {
  stagePlanFor,
  stageStepSplit,
  stageProgressOf,
  currentStageFor,
  type HutSite,
  type StageSteps,
  type StagePlan,
} from './construction';
import {
  CAMP_STORE_ID,
  GRANARY_STORE_ID,
  depositInto,
  storeQty,
  withdrawFrom,
  type ResourceRegistry,
} from './resourceRegistry';
import { GRANARY_CAPACITY_FLOUR, GRANARY_FLOUR_TILE } from './granary';
import type { IsoWorld } from '../iso/isoWorld';

/** The mill's stable site id — the build job's target. */
export const MILL_SITE_ID = 'mill-site';
/** The bakery's stable site id — the build job's target. */
export const BAKERY_SITE_ID = 'bakery-site';

/** The mill's centre tile (surveyed). */
export const MILL_CENTRE = { x: 124, y: 129 } as const;
/** The mill's footprint rect (surveyed, 3x3). */
export const MILL_RECT = { x0: 123, y0: 128, x1: 125, y1: 130 } as const;
/** The mill's door tile (south edge). */
export const MILL_DOOR = { x: 124, y: 130 } as const;
/** The mill's approach tile (one south of the door). */
export const MILL_APPROACH = { x: 124, y: 131 } as const;

/** The bakery's centre tile (surveyed). */
export const BAKERY_CENTRE = { x: 129, y: 125 } as const;
/** The bakery's footprint rect (surveyed, 3x3). */
export const BAKERY_RECT = { x0: 128, y0: 124, x1: 130, y1: 126 } as const;
/** The bakery's door tile (south edge). */
export const BAKERY_DOOR = { x: 129, y: 126 } as const;
/** The bakery's approach tile (one south of the door). */
export const BAKERY_APPROACH = { x: 129, y: 127 } as const;
/** The bakery's second approach tile (one west of the approach).
 *  BUILD 1104: two bakers cannot share one tile — the second walks
 *  to the occupied approach and waits behind the first forever
 *  (the debug sim: Marlow stuck at (128,127) for 21 ticks while
 *  Greta baked shift after shift). The second slot stands here. */
export const BAKERY_SECOND_APPROACH = { x: 128, y: 127 } as const;

/** The mill as a HutSite — the renderer's build-site fx draws the
 *  half-built stage geometry from this (the storehouse's
 *  STOREHOUSE_HUT_SITE pattern). No sleep tiles: nobody sleeps in
 *  the mill. */
export const MILL_HUT_SITE: HutSite = {
  id: MILL_SITE_ID,
  centre: { ...MILL_CENTRE },
  rect: { ...MILL_RECT },
  door: { ...MILL_DOOR },
  approach: { ...MILL_APPROACH },
  sleepTiles: [],
};

/** The bakery as a HutSite — same pattern as the mill. */
export const BAKERY_HUT_SITE: HutSite = {
  id: BAKERY_SITE_ID,
  centre: { ...BAKERY_CENTRE },
  rect: { ...BAKERY_RECT },
  door: { ...BAKERY_DOOR },
  approach: { ...BAKERY_APPROACH },
  sleepTiles: [],
};

/** Work steps to build the mill (6 steps x 1 wood = 6 wood). */
export const MILL_WORK_STEPS = 6;
/** Wood spent per mill work step. */
export const MILL_WOOD_PER_STEP = 1;
/** Total wood to build the mill. */
export const MILL_COST_WOOD = MILL_WORK_STEPS * MILL_WOOD_PER_STEP;

/** Work steps to build the bakery (6 steps x 1 wood = 6 wood). */
export const BAKERY_WORK_STEPS = 6;
/** Wood spent per bakery work step. */
export const BAKERY_WOOD_PER_STEP = 1;
/** Total wood to build the bakery. */
export const BAKERY_COST_WOOD = BAKERY_WORK_STEPS * BAKERY_WOOD_PER_STEP;

/** Grain ground per mill tick (one batch). */
export const GRIND_GRAIN_PER_BATCH = 2;
/** Flour made per mill tick (2 grain -> 2 flour, 1:1). */
export const GRIND_FLOUR_PER_BATCH = 2;
/** Flour baked per meal. */
export const BAKE_FLOUR_PER_MEAL = 2;
/** Ticks in one milling shift (mirrors FOUNDER_MINE_TICKS). */
export const MILL_TICKS_PER_SHIFT = 3;
/** Ticks in one baking shift. */
export const BAKE_TICKS_PER_SHIFT = 3;
/** The bakery bakes while camp food is below this (the old
 *  MILL_FOOD_THRESHOLD, moved here with the mill it gated). */
export const BAKE_FOOD_THRESHOLD = 15;
/** How many founders may bake at once (BUILD 1104: the second
 *  baker — the bakery has two slots, so two bake jobs sit on the
 *  board and two founders can work a shift side by side, doubling
 *  the meal throughput the single-baker ceiling capped). */
export const BAKE_SLOTS = 2;
/** The mill site opens once this much grain has landed. */
export const MILL_START_GRAIN = 1;

// --- State ---

export type FoodChainSiteKind = 'none' | 'building' | 'done';

/** One food-chain building's construction progress (saved in
 *  the founders save, v12 — the same shape as one hut SiteState
 *  / the storehouse, wood-only). */
export type FoodChainSiteState = {
  state: FoodChainSiteKind;
  /** Completed work steps, 0..6. */
  progress: number;
  /** Wood actually spent on this building (1 per step). */
  spentWood: number;
  /** Per-stage steps completed (BUILD 1093). Optional: an old
   *  save without it derives the stages from the total progress. */
  stages?: StageSteps;
};

/** The mill + the bakery (saved in the founders save, v12). */
export type FoodChainState = {
  mill: FoodChainSiteState;
  bakery: FoodChainSiteState;
};

function freshSite(totalSteps: number): FoodChainSiteState {
  return { state: 'none', progress: 0, spentWood: 0, stages: stageProgressOf({ progress: 0 }, totalSteps) };
}

/** A fresh food chain — no mill, no bakery. Pure. */
export function freshFoodChain(): FoodChainState {
  return { mill: freshSite(MILL_WORK_STEPS), bakery: freshSite(BAKERY_WORK_STEPS) };
}

// --- Stage plans (0x1C: foundation -> frame -> finished) ---

/** The mill's stage plan: 6 steps / 6 wood -> 3x (2 steps, 2 wood). Pure. */
export function millStagePlan(): StagePlan {
  return stagePlanFor(MILL_WORK_STEPS, [{ resource: 'wood', qty: MILL_WOOD_PER_STEP * MILL_WORK_STEPS }]);
}

/** The bakery's stage plan: 6 steps / 6 wood -> 3x (2 steps, 2 wood). Pure. */
export function bakeryStagePlan(): StagePlan {
  return stagePlanFor(BAKERY_WORK_STEPS, [{ resource: 'wood', qty: BAKERY_WOOD_PER_STEP * BAKERY_WORK_STEPS }]);
}

// --- Gates ---

/** True when the mill is ready for its placement (progress 6,
 *  still 'building' — the caller flips it to 'done' only when
 *  the placement actually lands, the same ready/done split as
 *  the hut and the storehouse). Pure. */
export function millReadyForPlacement(foodChain: FoodChainState): boolean {
  return foodChain.mill.state === 'building' && foodChain.mill.progress >= MILL_WORK_STEPS;
}

/** True when the bakery is ready for its placement. Pure. */
export function bakeryReadyForPlacement(foodChain: FoodChainState): boolean {
  return foodChain.bakery.state === 'building' && foodChain.bakery.progress >= BAKERY_WORK_STEPS;
}

/** True when a founder may start (or continue) building the
 *  mill: it is unfinished and the first grain has landed (there
 *  is something to mill — a mill with no grain is a shed) and
 *  the camp pile holds a step's wood. The grain gate lives here
 *  (the claim site); the per-step gate is canBuildMill. Pure. */
export function canStartMill(foodChain: FoodChainState, campGrain: number, campWood: number): boolean {
  return (
    millReadyForPlacement(foodChain) ||
    (foodChain.mill.state !== 'done' &&
      foodChain.mill.progress < MILL_WORK_STEPS &&
      campGrain >= MILL_START_GRAIN &&
      campWood >= MILL_WOOD_PER_STEP)
  );
}

/** True when a founder may start (or continue) building the
 *  bakery: it is unfinished, the mill is DONE (the bakery needs
 *  flour, and flour only comes from the mill), and the camp pile
 *  holds a step's wood. Pure. */
export function canStartBakery(foodChain: FoodChainState, campWood: number): boolean {
  return (
    bakeryReadyForPlacement(foodChain) ||
    (foodChain.bakery.state !== 'done' &&
      foodChain.bakery.progress < BAKERY_WORK_STEPS &&
      foodChain.mill.state === 'done' &&
      campWood >= BAKERY_WOOD_PER_STEP)
  );
}

/** True when a founder may do a mill work step: it is unfinished
 *  and the camp pile holds a step's wood. The grain / mill-done
 *  gates live in canStartMill (the claim site); this is the
 *  per-step gate (the hut's canBuild shape). Pure. */
export function canBuildMill(foodChain: FoodChainState, campWood: number): boolean {
  return (
    millReadyForPlacement(foodChain) ||
    (foodChain.mill.state !== 'done' &&
      foodChain.mill.progress < MILL_WORK_STEPS &&
      campWood >= MILL_WOOD_PER_STEP)
  );
}

/** True when a founder may do a bakery work step. Pure. */
export function canBuildBakery(foodChain: FoodChainState, campWood: number): boolean {
  return (
    bakeryReadyForPlacement(foodChain) ||
    (foodChain.bakery.state !== 'done' &&
      foodChain.bakery.progress < BAKERY_WORK_STEPS &&
      campWood >= BAKERY_WOOD_PER_STEP)
  );
}

/** True when the mill is finished and usable (all stages done).
 *  A half-built mill grinds nothing. Pure. */
export function isMillUsable(foodChain: FoodChainState): boolean {
  return foodChain.mill.state === 'done' && foodChain.mill.progress >= MILL_WORK_STEPS;
}

/** True when the bakery is finished and usable. Pure. */
export function isBakeryUsable(foodChain: FoodChainState): boolean {
  return foodChain.bakery.state === 'done' && foodChain.bakery.progress >= BAKERY_WORK_STEPS;
}

// --- Construction steps (spend from the camp pile) ---

/**
 * Complete one work step on the mill from the registry's camp
 * store: 1 wood leaves the pile, the progress rises by 1. The
 * mill draws from the CAMP pile — it does not exist yet to draw
 * from. At the last step the mill is READY (progress 6) but the
 * state stays 'building' — the caller flips it to 'done' only
 * when the placement actually lands (finishMill), the same
 * ready/done split as the hut and the storehouse. With too
 * little wood, or when the mill is already ready, nothing
 * happens and nothing is withdrawn. Pure.
 */
export function spendMillStepFromRegistry(
  registry: ResourceRegistry,
  foodChain: FoodChainState,
): { registry: ResourceRegistry; foodChain: FoodChainState; completed: boolean; spent: boolean } {
  const mill = foodChain.mill;
  if (mill.state === 'done' || mill.progress >= MILL_WORK_STEPS) {
    return { registry, foodChain, completed: mill.progress >= MILL_WORK_STEPS, spent: false };
  }
  if (storeQty(registry, CAMP_STORE_ID, 'wood') < MILL_WOOD_PER_STEP) {
    return { registry, foodChain, completed: false, spent: false };
  }
  const w = withdrawFrom(registry, CAMP_STORE_ID, 'wood', MILL_WOOD_PER_STEP);
  if (w.taken < MILL_WOOD_PER_STEP) {
    // Cannot happen (the guard above read the same store), but a
    // partial withdrawal must never become a partial step.
    return { registry, foodChain, completed: false, spent: false };
  }
  const progress = mill.progress + 1;
  const completed = progress >= MILL_WORK_STEPS;
  // BUILD 1093: the step lands on the first incomplete stage
  // (foundation -> frame -> finished), so the stage progress is
  // tracked alongside the total.
  const cur = currentStageFor(mill, MILL_WORK_STEPS);
  const stages = stageProgressOf(mill, MILL_WORK_STEPS);
  const nextStages: StageSteps = cur ? { ...stages, [cur.id]: stages[cur.id] + 1 } : stages;
  return {
    registry: w.registry,
    foodChain: {
      ...foodChain,
      mill: {
        state: 'building' as FoodChainSiteKind,
        progress,
        spentWood: mill.spentWood + MILL_WOOD_PER_STEP,
        stages: nextStages,
      },
    },
    completed,
    spent: true,
  };
}

/**
 * Complete one work step on the bakery from the registry's camp
 * store: 1 wood leaves the pile, the progress rises by 1. Same
 * ready/done split as the mill (finishBakery flips it to 'done'
 * only when the placement lands). Pure.
 */
export function spendBakeryStepFromRegistry(
  registry: ResourceRegistry,
  foodChain: FoodChainState,
): { registry: ResourceRegistry; foodChain: FoodChainState; completed: boolean; spent: boolean } {
  const bakery = foodChain.bakery;
  if (bakery.state === 'done' || bakery.progress >= BAKERY_WORK_STEPS) {
    return { registry, foodChain, completed: bakery.progress >= BAKERY_WORK_STEPS, spent: false };
  }
  if (storeQty(registry, CAMP_STORE_ID, 'wood') < BAKERY_WOOD_PER_STEP) {
    return { registry, foodChain, completed: false, spent: false };
  }
  const w = withdrawFrom(registry, CAMP_STORE_ID, 'wood', BAKERY_WOOD_PER_STEP);
  if (w.taken < BAKERY_WOOD_PER_STEP) {
    return { registry, foodChain, completed: false, spent: false };
  }
  const progress = bakery.progress + 1;
  const completed = progress >= BAKERY_WORK_STEPS;
  const cur = currentStageFor(bakery, BAKERY_WORK_STEPS);
  const stages = stageProgressOf(bakery, BAKERY_WORK_STEPS);
  const nextStages: StageSteps = cur ? { ...stages, [cur.id]: stages[cur.id] + 1 } : stages;
  return {
    registry: w.registry,
    foodChain: {
      ...foodChain,
      bakery: {
        state: 'building' as FoodChainSiteKind,
        progress,
        spentWood: bakery.spentWood + BAKERY_WOOD_PER_STEP,
        stages: nextStages,
      },
    },
    completed,
    spent: true,
  };
}

/** Flip a ready mill (progress 6) to 'done' once its placement
 *  has actually landed. Pure. */
export function finishMill(foodChain: FoodChainState): FoodChainState {
  if (foodChain.mill.state === 'done') return foodChain;
  return {
    ...foodChain,
    mill: {
      state: 'done',
      progress: MILL_WORK_STEPS,
      spentWood: MILL_COST_WOOD,
      stages: { ...stageStepSplit(MILL_WORK_STEPS) },
    },
  };
}

/** Flip a ready bakery (progress 6) to 'done' once its placement
 *  has actually landed. Pure. */
export function finishBakery(foodChain: FoodChainState): FoodChainState {
  if (foodChain.bakery.state === 'done') return foodChain;
  return {
    ...foodChain,
    bakery: {
      state: 'done',
      progress: BAKERY_WORK_STEPS,
      spentWood: BAKERY_COST_WOOD,
      stages: { ...stageStepSplit(BAKERY_WORK_STEPS) },
    },
  };
}

// --- Grind / bake (the chain itself) ---

/** The flour in the granary store (0 when the store never held
 *  any). Pure. */
export function foodChainFlourInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, GRANARY_STORE_ID, 'flour');
}

/**
 * Grind granary grain into flour: 2 grain -> 2 flour, one batch
 * per call (one mill tick). Runs ONLY when a founder is working
 * the mill (workerPresent) — a mill with no worker produces
 * nothing — and only while there is grain to grind and room in
 * the flour store (the cap binds: flour never exceeds
 * GRANARY_CAPACITY_FLOUR). Conservative: if flour cannot be
 * deposited (the granary is capped, so this never happens today),
 * the grain for the un-ground flour goes back to the granary —
 * grain + flour + 2xfood is constant across the call. Pure.
 */
export function grindGrainToFlour(
  registry: ResourceRegistry,
  workerPresent: boolean,
): { registry: ResourceRegistry; ground: number; grainUsed: number } {
  if (!workerPresent) return { registry, ground: 0, grainUsed: 0 };
  const grain = storeQty(registry, GRANARY_STORE_ID, 'grain');
  const flour = storeQty(registry, GRANARY_STORE_ID, 'flour');
  if (grain < GRIND_GRAIN_PER_BATCH || flour >= GRANARY_CAPACITY_FLOUR) {
    return { registry, ground: 0, grainUsed: 0 };
  }
  const room = GRANARY_CAPACITY_FLOUR - flour;
  const flourToMake = Math.min(GRIND_FLOUR_PER_BATCH, room, grain);
  if (flourToMake <= 0) return { registry, ground: 0, grainUsed: 0 };
  const grainToUse = flourToMake; // 1:1 — 2 grain -> 2 flour.
  const withdrawn = withdrawFrom(registry, GRANARY_STORE_ID, 'grain', grainToUse);
  const deposited = depositInto(withdrawn.registry, GRANARY_STORE_ID, 'flour', flourToMake, { type: 'production', settlementId: 'camp' }, { capacity: GRANARY_CAPACITY_FLOUR, location: { ...GRANARY_FLOUR_TILE } });
  const made = Math.floor(deposited.added);
  const leftoverGrain = withdrawn.taken - made;
  let next = deposited.registry;
  if (leftoverGrain > 0) {
    next = depositInto(next, GRANARY_STORE_ID, 'grain', leftoverGrain, { type: 'loaded' }).registry;
  }
  return { registry: next, ground: made, grainUsed: withdrawn.taken - leftoverGrain };
}

/**
 * Bake granary flour into meals: 2 flour -> 1 meal, one batch
 * per call (one bake tick). Runs ONLY when a founder is working
 * the bakery (workerPresent) — a bakery with no worker produces
 * nothing — and only while there is flour to bake and the camp
 * is short of food (below BAKE_FOOD_THRESHOLD). Conservative:
 * if a meal cannot be deposited (the granary food cap is 60 and
 * the bake gate is 15, so this never happens today), the flour
 * for the un-baked meals goes back to the granary — grain +
 * flour + 2xfood is constant across the call. Pure.
 */
export function bakeFlourToMeals(
  registry: ResourceRegistry,
  workerPresent: boolean,
): { registry: ResourceRegistry; baked: number; flourUsed: number } {
  if (!workerPresent) return { registry, baked: 0, flourUsed: 0 };
  const food = storeQty(registry, GRANARY_STORE_ID, 'food');
  const flour = storeQty(registry, GRANARY_STORE_ID, 'flour');
  if (food >= BAKE_FOOD_THRESHOLD || flour < BAKE_FLOUR_PER_MEAL) {
    return { registry, baked: 0, flourUsed: 0 };
  }
  const meals = Math.max(0, Math.min(1, BAKE_FOOD_THRESHOLD - food, Math.floor(flour / BAKE_FLOUR_PER_MEAL)));
  if (meals <= 0) return { registry, baked: 0, flourUsed: 0 };
  const want = meals * BAKE_FLOUR_PER_MEAL;
  const withdrawn = withdrawFrom(registry, GRANARY_STORE_ID, 'flour', want);
  const make = Math.floor(withdrawn.taken / BAKE_FLOUR_PER_MEAL);
  const deposited = depositInto(withdrawn.registry, GRANARY_STORE_ID, 'food', make, { type: 'production', settlementId: 'camp' });
  const made = Math.floor(deposited.added);
  const leftoverFlour = withdrawn.taken - made * BAKE_FLOUR_PER_MEAL;
  let next = deposited.registry;
  if (leftoverFlour > 0) {
    next = depositInto(next, GRANARY_STORE_ID, 'flour', leftoverFlour, { type: 'loaded' }).registry;
  }
  return { registry: next, baked: made, flourUsed: withdrawn.taken - leftoverFlour };
}

/**
 * Validate a saved food-chain state (the founders-save load path):
 * a corrupt / missing / partial value falls back to a fresh chain
 * (nothing started). A 'done' building is pinned to full progress
 * and full cost; a 'none' building is pinned to 0. The per-stage
 * progress is kept when valid (it sums to the total); an old save
 * without it derives the stages from the total (the sequential
 * split, the 1093 storehouse pattern). Pure.
 */
export function validateFoodChainState(value: unknown): FoodChainState {
  if (!value || typeof value !== 'object') return freshFoodChain();
  const v = value as Record<string, unknown>;
  const validateSite = (raw: unknown, totalSteps: number, totalWood: number): FoodChainSiteState => {
    if (!raw || typeof raw !== 'object') return freshSite(totalSteps);
    const s = raw as Record<string, unknown>;
    const state = s.state === 'building' || s.state === 'done' ? (s.state as FoodChainSiteKind) : 'none';
    let progress = Math.max(0, Math.min(totalSteps, Math.round(Number(s.progress) || 0)));
    let spentWood = Math.max(0, Math.round(Number(s.spentWood) || 0));
    if (state === 'done') {
      progress = totalSteps;
      spentWood = totalWood;
    }
    if (state === 'none') {
      progress = 0;
      spentWood = 0;
    }
    const stages = stageProgressOf({ progress, stages: (s as { stages?: StageSteps }).stages }, totalSteps);
    return { state, progress, spentWood, stages };
  };
  return {
    mill: validateSite(v.mill, MILL_WORK_STEPS, MILL_COST_WOOD),
    bakery: validateSite(v.bakery, BAKERY_WORK_STEPS, BAKERY_COST_WOOD),
  };
}

// --- Placements (the mill / bakery in the world) ---

/** The mill placement exists in the world (a 'house' item with
 *  the 'windmill' variant — validatePlacement('house-windmill')
 *  stamps kind 'house' + variant 'windmill', the same shape as
 *  the storehouse's 'house' + 'store' — on the site's exact
 *  rect). Pure read. */
export function millPlacementExists(world: IsoWorld): boolean {
  return (world.placements ?? []).some(
    (p) =>
      p.kind === 'house' &&
      (p as { variant?: string }).variant === 'windmill' &&
      p.x0 === MILL_RECT.x0 &&
      p.y0 === MILL_RECT.y0 &&
      p.x1 === MILL_RECT.x1 &&
      p.y1 === MILL_RECT.y1,
  );
}

/** The bakery placement exists in the world (a 'house' item on
 *  the site's exact rect — the rect is unique, no hut stands
 *  there). Pure read. */
export function bakeryPlacementExists(world: IsoWorld): boolean {
  return (world.placements ?? []).some(
    (p) =>
      p.kind === 'house' &&
      p.x0 === BAKERY_RECT.x0 &&
      p.y0 === BAKERY_RECT.y0 &&
      p.x1 === BAKERY_RECT.x1 &&
      p.y1 === BAKERY_RECT.y1,
  );
}

/**
 * Reconcile the two saves: a 'done' mill/bakery whose placement
 * is gone (the player removed it with Build Remove) resets to
 * 'none' — the founders rebuild from the pile when the grain
 * and the materials allow, and no free mill/bakery ever appears.
 * A 'building' mill/bakery with a placement present is treated
 * as done. A ready mill/bakery (progress 6, placement blocked)
 * is NOT reset — it is waiting for a clear rect, not removed.
 * Returns the SAME object when nothing changes. Pure.
 */
export function reconcileFoodChain(foodChain: FoodChainState, world: IsoWorld): FoodChainState {
  const millPlaced = millPlacementExists(world);
  const bakeryPlaced = bakeryPlacementExists(world);
  let next = foodChain;
  if (foodChain.mill.state === 'done' && !millPlaced) {
    next = { ...next, mill: freshSite(MILL_WORK_STEPS) };
  } else if (foodChain.mill.state !== 'done' && millPlaced) {
    next = finishMill(next);
  }
  if (foodChain.bakery.state === 'done' && !bakeryPlaced) {
    next = { ...next, bakery: freshSite(BAKERY_WORK_STEPS) };
  } else if (foodChain.bakery.state !== 'done' && bakeryPlaced) {
    next = finishBakery(next);
  }
  return next;
}

// --- Labels ---

/** The mill's short label for the HUD / Control Center. Pure. */
export function millLabel(foodChain: FoodChainState): string {
  if (foodChain.mill.state === 'done') return 'done';
  if (foodChain.mill.state === 'building') return `${foodChain.mill.progress}/6`;
  return '—';
}

/** The bakery's short label for the HUD / Control Center. Pure. */
export function bakeryLabel(foodChain: FoodChainState): string {
  if (foodChain.bakery.state === 'done') return 'done';
  if (foodChain.bakery.state === 'building') return `${foodChain.bakery.progress}/6`;
  return '—';
}

/** The food-chain count for the HUD / E-report / Control
 *  Center: 'Chain mill done · bakery 2/6 · 8 flour'. Pure. */
export function foodChainLabel(foodChain: FoodChainState, flour: number): string {
  return `Chain mill ${millLabel(foodChain)} · bakery ${bakeryLabel(foodChain)} · ${flour} flour`;
}
