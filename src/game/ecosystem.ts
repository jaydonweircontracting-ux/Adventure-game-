// Ecosystem manager (BUILD 506 — A-life Phase 12).
//
// Unified interface tying all A-life systems together:
// populations + resources + food web + migration + events + history +
// player impact + seasons + NPC knowledge + quests.
//
// This is the "world glue" — one entry point for regional simulation.

import {
  RegionalPopulation, PopulationParams,
  initPopulation, simulatePopulationDay, paramsForSpecies,
} from './populations';
import {
  ResourcePopulation, initResource, simulateResourceDay,
  ResourceKind,
} from './resources';
import { predatorPressureFor } from './foodWeb';
import { migrationPressure, simulateMigration } from './migration';
import {
  RegionalHistory, createRegionalHistory,
  recordEcoEvent, detectEcoEvents,
} from './ecoHistory';
import {
  RegionalImpact, createRegionalImpact, calculateEcologicalModifiers,
} from './playerImpact';
import { Season, modifiersForSeason, seasonForDay } from './seasons';
import { EcoQuest, questFromEcoEvent } from './ecoQuests';
import { ProceduralLandmark } from './landmarkGrid';

export interface EcosystemRegion {
  regionX: number;
  regionY: number;
  populations: Map<string, RegionalPopulation>;
  resources: Map<ResourceKind, ResourcePopulation>;
  history: RegionalHistory;
  impact: RegionalImpact;
  lastSimDay: number;
}

/**
 * Initialize a region's ecosystem.
 */
export function initEcosystemRegion(
  regionX: number,
  regionY: number,
  worldSeed: number,
  speciesIds: string[],
  resourceKinds: ResourceKind[],
): EcosystemRegion {
  const populations = new Map<string, RegionalPopulation>();
  for (const speciesId of speciesIds) {
    const pop = initPopulation(speciesId, regionX, regionY, worldSeed);
    if (pop) populations.set(speciesId, pop);
  }

  const resources = new Map<ResourceKind, ResourcePopulation>();
  for (const kind of resourceKinds) {
    resources.set(kind, initResource(kind, regionX, regionY, worldSeed));
  }

  return {
    regionX,
    regionY,
    populations,
    resources,
    history: createRegionalHistory(regionX, regionY),
    impact: createRegionalImpact(regionX, regionY),
    lastSimDay: 0,
  };
}

/**
 * Simulate one day for a region.
 * Returns updated region and any generated quests.
 */
export function simulateEcosystemDay(
  region: EcosystemRegion,
  worldSeed: number,
  day: number,
  landmarks: ProceduralLandmark[],
): { region: EcosystemRegion; quests: EcoQuest[] } {
  const season = seasonForDay(day % 365);
  const seasonal = modifiersForSeason(season);
  const ecoMods = calculateEcologicalModifiers(region.impact);

  const quests: EcoQuest[] = [];
  const newPopulations = new Map<string, RegionalPopulation>();
  let history = region.history;

  // Build predator population map for pressure calculation.
  const predatorPops: Record<string, number> = {};
  for (const [speciesId, pop] of region.populations) {
    predatorPops[speciesId] = pop.population;
  }

  for (const [speciesId, pop] of region.populations) {
    const params = paramsForSpecies(speciesId);
    if (!params) {
      newPopulations.set(speciesId, pop);
      continue;
    }

    // Apply seasonal and player modifiers.
    const modifiedParams: PopulationParams = {
      ...params,
      birthRate: params.birthRate * seasonal.birthMultiplier,
    };

    const prevPop = pop.population;

    // Update predator pressure from food web.
    const pressure = predatorPressureFor(speciesId, predatorPops);

    // Simulate day.
    let newPop = {
      ...pop,
      predatorPressure: pressure,
      foodAvailability: Math.min(1, pop.foodAvailability * seasonal.foodMultiplier),
    };
    newPop = simulatePopulationDay(newPop, modifiedParams);

    // Apply player impact modifier.
    const speciesMod = speciesId === 'deer' ? ecoMods.deerModifier :
                       speciesId === 'wolf' ? ecoMods.wolfModifier :
                       speciesId === 'rabbit' ? ecoMods.rabbitModifier : 1;
    newPop.population = Math.floor(newPop.population * speciesMod);

    // Detect events.
    const events = detectEcoEvents(
      speciesId, region.regionX, region.regionY,
      prevPop, newPop.population, region.lastSimDay, day
    );
    for (const eventKind of events) {
      history = recordEcoEvent(history, eventKind, speciesId, day);

      // Generate quest from event.
      const landmark = landmarks[0] || null;
      const quest = questFromEcoEvent(
        eventKind, speciesId,
        region.regionX, region.regionY,
        landmark, worldSeed, day
      );
      if (quest) quests.push(quest);
    }

    // Migration.
    const migration = simulateMigration(newPop, modifiedParams, [
      { dx: 1, dy: 0, suitability: 0.7 },
      { dx: -1, dy: 0, suitability: 0.6 },
      { dx: 0, dy: 1, suitability: 0.8 },
      { dx: 0, dy: -1, suitability: 0.5 },
    ]);
    if (migration) {
      newPop = migration.source;
      history = recordEcoEvent(history, 'migration_out', speciesId, day);
    }

    newPopulations.set(speciesId, { ...newPop, lastSimDay: day });
  }

  // Simulate resources.
  const newResources = new Map<ResourceKind, ResourcePopulation>();
  for (const [kind, res] of region.resources) {
    let newRes = simulateResourceDay(res);
    // Apply seasonal growth.
    newRes = {
      ...newRes,
      density: Math.min(newRes.maxDensity, newRes.density * seasonal.growthMultiplier),
      lastSimDay: day,
    };
    // Apply player impact.
    newRes.density *= ecoMods.vegetationModifier;
    newResources.set(kind, newRes);
  }

  return {
    region: {
      ...region,
      populations: newPopulations,
      resources: newResources,
      history,
      lastSimDay: day,
    },
    quests,
  };
}
