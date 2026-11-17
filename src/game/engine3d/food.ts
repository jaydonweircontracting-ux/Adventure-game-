/**
 * BUILD 1067 — Food and survival (0x07): the food chain.
 *
 * The loop the 1057 camp never closed: the camp starts with 30
 * meals and nothing replenishes them. Now:
 * - FARMING produces grain: a founder claims a harvest job (J-1,
 *   jobs.ts) for a ready farm tile, walks there, harvests 2 wheat
 *   into their carrier, and delivers it to the camp store
 *   (founders.ts harvestFarmTileToCarrier /
 *   deliverFounderCarryToRegistry). The camp's field is seeded at
 *   load (farm.ts seedCampFarmPlot) so a fresh world can feed
 *   itself; the player can expand it in Build mode.
 * - MILLING turns grain into meals: 2 grain → 1 meal, a production
 *   step through the registry (millGrainToMeals below) — the grain
 *   is consumed, the meal is produced, and grain + 2×food is
 *   constant across the conversion (no fake food, no lost grain).
 *   The mill runs in the founder tick while the camp is short of
 *   food (below MILL_FOOD_THRESHOLD), up to MILL_MEALS_PER_TICK
 *   meals per tick. It is the camp's oven, not a founder's job —
 *   the founders' job is the harvest.
 * - EATING consumes meals (eatFounderMealFromRegistry, unchanged):
 *   hunger to 100, food −1. The stock now replenishes, so the camp
 *   can sustain itself on its fields.
 * - SHORTAGE has consequences: a founder whose hunger is 0 is
 *   STARVING — their health decays (HEALTH_STARVE_DECAY_PER_MIN),
 *   and a weak founder (health < HEALTH_WEAK_BELOW) works at half
 *   strength (utility.ts healthWorkFactor), and at health 0 cannot
 *   work at all. Health recovers while fed
 *   (HEALTH_RECOVER_PER_MIN). The arrival gate
 *   (settlementGrowth.ts, food ≥ 10) is the population consequence:
 *   a starving camp does not grow.
 *
 * Pure module (no React, no WebGL, no localStorage) so the sim and
 * the standalone asserts can import it directly.
 */

import { GRANARY_STORE_ID, depositInto, storeQty, withdrawFrom, type ResourceRegistry } from './resourceRegistry';

/** Grain milled into one meal (the recipe: 2 wheat → 1 meal). */
export const MILL_GRAIN_PER_MEAL = 2;
/** The mill runs while the camp holds fewer meals than this. */
export const MILL_FOOD_THRESHOLD = 15;
/** Most meals the mill makes in one 900ms tick. */
export const MILL_MEALS_PER_TICK = 2;
/** The camp farms while it holds fewer meals than this — the
 *  farming threshold sits above the mill's, so the founders
 *  harvest into a grain buffer the mill draws down (food 15..20:
 *  farming runs, milling waits; below 15 both run). */
export const FARM_FOOD_THRESHOLD = 20;

/** Grain in the granary store (BUILD 1090 — the mill's input lives
 *  in the granary now, not the camp store; the name stays, it means
 *  "the camp's grain"). Pure. */
export function campGrainInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, GRANARY_STORE_ID, 'grain');
}

/**
 * Mill granary grain into meals: 2 grain → 1 meal, a production step
 * (source 'production', settlement 'camp' — the camp settlement id
 * in livingWorld.ts). Runs only while the camp is short of food
 * (below MILL_FOOD_THRESHOLD) and holds grain; makes at most
 * MILL_MEALS_PER_TICK meals, and never mills past the threshold.
 * BUILD 1090: the grain + the meals both live in the granary store
 * now, not the camp store. Conservative: if a meal cannot be
 * deposited (the granary is capped, so this never happens today),
 * the grain for the un-made meals goes back to the granary — grain
 * + 2×food is constant across the call. Pure.
 */
export function millGrainToMeals(registry: ResourceRegistry): { registry: ResourceRegistry; milled: number; grainUsed: number } {
  const food = storeQty(registry, GRANARY_STORE_ID, 'food');
  const grain = storeQty(registry, GRANARY_STORE_ID, 'grain');
  if (food >= MILL_FOOD_THRESHOLD || grain < MILL_GRAIN_PER_MEAL) return { registry, milled: 0, grainUsed: 0 };
  const meals = Math.max(0, Math.min(MILL_MEALS_PER_TICK, MILL_FOOD_THRESHOLD - food, Math.floor(grain / MILL_GRAIN_PER_MEAL)));
  if (meals <= 0) return { registry, milled: 0, grainUsed: 0 };
  const want = meals * MILL_GRAIN_PER_MEAL;
  const withdrawn = withdrawFrom(registry, GRANARY_STORE_ID, 'grain', want);
  const make = Math.floor(withdrawn.taken / MILL_GRAIN_PER_MEAL);
  const deposited = depositInto(withdrawn.registry, GRANARY_STORE_ID, 'food', make, { type: 'production', settlementId: 'camp' });
  const made = Math.floor(deposited.added);
  const leftoverGrain = withdrawn.taken - made * MILL_GRAIN_PER_MEAL;
  let next = deposited.registry;
  if (leftoverGrain > 0) {
    next = depositInto(next, GRANARY_STORE_ID, 'grain', leftoverGrain, { type: 'loaded' }).registry;
  }
  return { registry: next, milled: made, grainUsed: withdrawn.taken - leftoverGrain };
}

// --- Health: the shortage consequence ---

/** Health decay per game minute while starving (hunger 0):
 *  100 → 0 in ~55 game-hours of continuous starvation
 *  (~2.3 days). */
export const HEALTH_STARVE_DECAY_PER_MIN = 0.03;
/** Health recovery per game minute while fed (hunger > 0):
 *  0 → 100 in ~83 game-hours (~3.5 days). */
export const HEALTH_RECOVER_PER_MIN = 0.02;
/** Below this health a founder is weak (works at half strength). */
export const HEALTH_WEAK_BELOW = 30;

/**
 * Decay/recover one founder's health by `elapsedMin` game minutes:
 * starving (hunger 0) decays, fed recovers. Clamped 0..100. Pure.
 * The hunger used is the founder's CURRENT hunger (after this
 * tick's decay) — a founder who hit 0 this tick is starving now.
 */
export function decayFounderHealth(health: number, hunger: number, elapsedMin: number): number {
  const e = Math.max(0, elapsedMin);
  // A caller without health data (an old sim literal) is treated as
  // full health — never NaN, never a penalty for missing data.
  const h = Number.isFinite(health) ? Math.max(0, Math.min(100, health)) : 100;
  if (hunger <= 0) return Math.max(0, h - HEALTH_STARVE_DECAY_PER_MIN * e);
  return Math.min(100, h + HEALTH_RECOVER_PER_MIN * e);
}

/** True when a founder is too weak to work at full strength. */
export function isWeakFounder(health: number): boolean {
  return Number.isFinite(health) && health < HEALTH_WEAK_BELOW;
}

/**
 * Work strength for a founder's health: 0 when collapsed (health
 * 0 — they cannot work at all), half when weak (health < 30),
 * full otherwise. A caller without health data is full strength.
 * The scorer multiplies work/build by this. Pure.
 */
export function healthWorkFactor(health: number): number {
  if (!Number.isFinite(health)) return 1;
  if (health <= 0) return 0;
  if (health < HEALTH_WEAK_BELOW) return 0.5;
  return 1;
}
