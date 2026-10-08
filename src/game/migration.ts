// Population migration (BUILD 498 — A-life Phase 4).
//
// When local conditions become unfavorable (food shortage, predator
// pressure, overcrowding), populations gradually move to neighboring
// regions. Population is conserved — animals move, they don't teleport.

import { RegionalPopulation, PopulationParams } from './populations';

export interface MigrationResult {
  /** Updated source population */
  source: RegionalPopulation;
  /** Amount that migrated */
  migrated: number;
  /** Direction: dx, dy to neighbor */
  direction: { dx: number; dy: number };
}

/**
 * Calculate migration pressure 0-1.
 * High when: low food, high predators, overcrowded.
 */
export function migrationPressure(
  pop: RegionalPopulation,
  params: PopulationParams,
): number {
  const foodStress = 1 - pop.foodAvailability; // 0-1
  const predatorStress = pop.predatorPressure; // 0-1
  const density = pop.population / params.carryingCapacity;
  const crowdingStress = Math.max(0, density - 0.8) * 2; // 0-1 when >80%

  // Weighted average.
  const pressure = (foodStress * 0.4 + predatorStress * 0.3 + crowdingStress * 0.3);
  return Math.max(0, Math.min(1, pressure));
}

/**
 * Simulate migration for one day.
 * Returns source (reduced) and migration info.
 * The destination region would receive the migrants (handled by caller).
 */
export function simulateMigration(
  pop: RegionalPopulation,
  params: PopulationParams,
  // Neighbor suitability 0-1 for each direction
  neighborSuitability: { dx: number; dy: number; suitability: number }[],
): MigrationResult | null {
  const pressure = migrationPressure(pop, params);

  // No migration if pressure low or population tiny.
  if (pressure < 0.3 || pop.population < 5) return null;

  // Find best neighbor.
  let best = neighborSuitability[0];
  for (const n of neighborSuitability) {
    if (n.suitability > best.suitability) best = n;
  }

  // Only migrate if destination is better.
  // (Simplified: assume current suitability is 0.5)
  if (best.suitability <= 0.5) return null;

  // Migrate 10-30% of population based on pressure.
  const migrateFraction = 0.1 + pressure * 0.2;
  const migrated = Math.floor(pop.population * migrateFraction);

  if (migrated < 1) return null;

  const source: RegionalPopulation = {
    ...pop,
    population: pop.population - migrated,
  };

  return {
    source,
    migrated,
    direction: { dx: best.dx, dy: best.dy },
  };
}
