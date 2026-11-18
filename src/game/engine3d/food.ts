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
 * - MILLING + BAKING (BUILD 1094, foodChain.ts) turn grain into
 *   meals through the real chain: the mill grinds 2 grain -> 2
 *   flour (a founder's milling job), the bakery bakes 2 flour ->
 *   1 meal (a founder's baking job), and grain + flour + 2xfood
 *   is constant across every step (no fake food, no lost grain).
 *   The old direct grain -> meals path (millGrainToMeals) is
 *   removed — the bakery is the only way grain becomes meals.
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

import { GRANARY_STORE_ID, storeQty, type ResourceRegistry } from './resourceRegistry';

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
