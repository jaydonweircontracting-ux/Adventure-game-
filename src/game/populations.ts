// A-life population system (BUILD 493 — A-life Phase 1).
//
// Every creature group has a population model that simulates:
// births, deaths, food pressure, predator pressure, migration.
// Populations are regional (per chunk region), deterministic, and
// update over time. This is the foundation for emergent ecosystems.

import { wfcSeedFor } from './wfc';

export interface PopulationParams {
  speciesId: string;
  /** Base birth rate per day (0-1) */
  birthRate: number;
  /** Base death rate per day (0-1) */
  deathRate: number;
  /** Food units consumed per individual per day */
  foodDemand: number;
  /** Preferred biome types */
  preferredBiomes: string[];
  /** Carrying capacity for a region */
  carryingCapacity: number;
}

export interface RegionalPopulation {
  speciesId: string;
  regionX: number;
  regionY: number;
  /** Current population count */
  population: number;
  /** Food availability 0-1 */
  foodAvailability: number;
  /** Predator pressure 0-1 */
  predatorPressure: number;
  /** Last simulation day */
  lastSimDay: number;
}

// Species parameters (data-driven).
const SPECIES_PARAMS: Record<string, PopulationParams> = {
  deer: {
    speciesId: 'deer',
    birthRate: 0.05,
    deathRate: 0.02,
    foodDemand: 2,
    preferredBiomes: ['forest', 'grassland'],
    carryingCapacity: 50,
  },
  rabbit: {
    speciesId: 'rabbit',
    birthRate: 0.15,
    deathRate: 0.05,
    foodDemand: 0.5,
    preferredBiomes: ['grassland', 'forest'],
    carryingCapacity: 100,
  },
  wolf: {
    speciesId: 'wolf',
    birthRate: 0.03,
    deathRate: 0.03,
    foodDemand: 5,
    preferredBiomes: ['forest', 'hills'],
    carryingCapacity: 15,
  },
  boar: {
    speciesId: 'boar',
    birthRate: 0.08,
    deathRate: 0.03,
    foodDemand: 3,
    preferredBiomes: ['forest', 'grassland'],
    carryingCapacity: 30,
  },
};

export function paramsForSpecies(speciesId: string): PopulationParams | null {
  return SPECIES_PARAMS[speciesId] ?? null;
}

/**
 * Initialize a regional population (deterministic).
 */
export function initPopulation(
  speciesId: string,
  regionX: number,
  regionY: number,
  worldSeed: number,
): RegionalPopulation | null {
  const params = paramsForSpecies(speciesId);
  if (!params) return null;

  const seed = wfcSeedFor(worldSeed, regionX, regionY, `pop-${speciesId}`);
  // Simple deterministic RNG.
  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Initial population: 30-70% of carrying capacity.
  const population = Math.floor(
    params.carryingCapacity * (0.3 + rng() * 0.4)
  );

  return {
    speciesId,
    regionX,
    regionY,
    population,
    foodAvailability: 0.7 + rng() * 0.3,
    predatorPressure: rng() * 0.3,
    lastSimDay: 0,
  };
}

/**
 * Simulate one day for a population.
 * Returns updated population.
 *
 * Rules:
 * - Births increase with food, decrease with overpopulation.
 * - Deaths increase with predator pressure, starvation.
 * - Population capped at carrying capacity.
 * - Population cannot go negative.
 */
export function simulatePopulationDay(
  pop: RegionalPopulation,
  params: PopulationParams,
): RegionalPopulation {
  const next = { ...pop };

  // Food-limited birth rate.
  // If overpopulated, births decrease.
  const density = pop.population / params.carryingCapacity;
  const densityFactor = Math.max(0, 1 - density); // 1 at 0, 0 at capacity

  const births = Math.floor(
    pop.population * params.birthRate * pop.foodAvailability * densityFactor
  );

  // Deaths from base rate + predator pressure + starvation.
  const starvation = pop.foodAvailability < 0.3 ? 0.05 : 0;
  const deaths = Math.floor(
    pop.population * (params.deathRate + pop.predatorPressure * 0.1 + starvation)
  );

  next.population = Math.max(0, Math.min(
    params.carryingCapacity,
    pop.population + births - deaths
  ));

  // Food availability drifts (simplified).
  // In a full sim, this would be affected by vegetation, season, etc.
  next.foodAvailability = Math.max(0.1, Math.min(1,
    pop.foodAvailability + (0.5 - density) * 0.05
  ));

  next.lastSimDay += 1;
  return next;
}

/**
 * Simulate multiple days.
 */
export function simulatePopulationDays(
  pop: RegionalPopulation,
  params: PopulationParams,
  days: number,
): RegionalPopulation {
  let current = pop;
  for (let i = 0; i < days; i++) {
    current = simulatePopulationDay(current, params);
    // Early exit if extinct.
    if (current.population === 0) break;
  }
  return current;
}
