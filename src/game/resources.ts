// Resource populations (BUILD 497 — A-life Phase 3).
//
// Plants as living resources: growth, maturity, harvest, regrowth.
// When the player harvests, density drops. Over time, it recovers.
// If harvesting exceeds regeneration, depletion affects nearby animals.

import { wfcSeedFor } from './wfc';

export type ResourceKind =
  | 'grass' | 'berries' | 'mushrooms' | 'herbs' | 'trees' | 'flowers';

export interface ResourcePopulation {
  kind: ResourceKind;
  regionX: number;
  regionY: number;
  /** Density 0-1 (1 = pristine, 0 = depleted) */
  density: number;
  /** Growth rate per day */
  growthRate: number;
  /** Max density */
  maxDensity: number;
  lastSimDay: number;
}

const RESOURCE_PARAMS: Record<ResourceKind, { growthRate: number; maxDensity: number }> = {
  grass: { growthRate: 0.15, maxDensity: 1.0 },
  berries: { growthRate: 0.08, maxDensity: 0.8 },
  mushrooms: { growthRate: 0.10, maxDensity: 0.6 },
  herbs: { growthRate: 0.06, maxDensity: 0.5 },
  trees: { growthRate: 0.02, maxDensity: 1.0 },
  flowers: { growthRate: 0.12, maxDensity: 0.7 },
};

export function paramsForResource(kind: ResourceKind) {
  return RESOURCE_PARAMS[kind];
}

/**
 * Initialize a resource population (deterministic).
 */
export function initResource(
  kind: ResourceKind,
  regionX: number,
  regionY: number,
  worldSeed: number,
): ResourcePopulation {
  const params = paramsForResource(kind);
  const seed = wfcSeedFor(worldSeed, regionX, regionY, `res-${kind}`);

  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Start at 60-100% of max.
  const density = params.maxDensity * (0.6 + rng() * 0.4);

  return {
    kind,
    regionX,
    regionY,
    density,
    growthRate: params.growthRate,
    maxDensity: params.maxDensity,
    lastSimDay: 0,
  };
}

/**
 * Harvest from a resource. Returns amount harvested, updates density.
 */
export function harvestResource(
  res: ResourcePopulation,
  amount: number, // 0-1, how much to take
): { resource: ResourcePopulation; harvested: number } {
  const actual = Math.min(res.density, amount);
  const next = {
    ...res,
    density: Math.max(0, res.density - actual),
  };
  return { resource: next, harvested: actual };
}

/**
 * Simulate one day of regrowth.
 */
export function simulateResourceDay(
  res: ResourcePopulation,
): ResourcePopulation {
  const next = { ...res };
  // Logistic growth: faster when depleted, slower near max.
  const growth = res.growthRate * (1 - res.density / res.maxDensity);
  next.density = Math.min(res.maxDensity, res.density + growth);
  next.lastSimDay += 1;
  return next;
}

/**
 * Simulate multiple days.
 */
export function simulateResourceDays(
  res: ResourcePopulation,
  days: number,
): ResourcePopulation {
  let current = res;
  for (let i = 0; i < days; i++) {
    current = simulateResourceDay(current);
  }
  return current;
}
