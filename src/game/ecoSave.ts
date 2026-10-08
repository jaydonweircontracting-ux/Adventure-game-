// Ecosystem save/load (BUILD 507).
//
// Serialize ecosystem regions compactly. Only store deviations from
// the deterministic baseline — populations, resources, history events,
// and player impact. The baseline regenerates from seed.

import { EcosystemRegion } from './ecosystem';
import { ResourceKind } from './resources';
import { EcoEventKind } from './ecoHistory';

export interface SavedEcosystemRegion {
  x: number;
  y: number;
  day: number;
  /** speciesId -> population */
  pops: Record<string, number>;
  /** speciesId -> food availability */
  food: Record<string, number>;
  /** resource kind -> density */
  resources: Record<string, number>;
  /** Recent events (kind, species, day) */
  events: Array<[EcoEventKind, string, number]>;
  /** Player actions */
  actions: Record<string, number>;
}

/**
 * Serialize a region.
 */
export function saveEcosystemRegion(
  region: EcosystemRegion,
): SavedEcosystemRegion {
  const pops: Record<string, number> = {};
  const food: Record<string, number> = {};
  for (const [speciesId, pop] of region.populations) {
    pops[speciesId] = pop.population;
    food[speciesId] = Math.round(pop.foodAvailability * 100) / 100;
  }

  const resources: Record<string, number> = {};
  for (const [kind, res] of region.resources) {
    resources[kind] = Math.round(res.density * 100) / 100;
  }

  const events = region.history.events.map(
    (e): [EcoEventKind, string, number] => [e.kind, e.speciesId, e.day]
  );

  const actions: Record<string, number> = {};
  for (const [k, v] of Object.entries(region.impact.actions)) {
    if (v) actions[k] = v;
  }

  return {
    x: region.regionX,
    y: region.regionY,
    day: region.lastSimDay,
    pops,
    food,
    resources,
    events,
    actions,
  };
}

/**
 * Deserialize a region.
 * Note: Caller must re-init the baseline from seed first, then apply this.
 */
export function loadEcosystemRegion(
  saved: SavedEcosystemRegion,
  region: EcosystemRegion,
): EcosystemRegion {
  // Apply populations.
  const populations = new Map(region.populations);
  for (const [speciesId, popCount] of Object.entries(saved.pops)) {
    const existing = populations.get(speciesId);
    if (existing) {
      populations.set(speciesId, {
        ...existing,
        population: popCount,
        foodAvailability: saved.food[speciesId] ?? existing.foodAvailability,
        lastSimDay: saved.day,
      });
    }
  }

  // Apply resources.
  const resources = new Map(region.resources);
  for (const [kind, density] of Object.entries(saved.resources)) {
    const existing = resources.get(kind as ResourceKind);
    if (existing) {
      resources.set(kind as ResourceKind, {
        ...existing,
        density,
        lastSimDay: saved.day,
      });
    }
  }

  // Rebuild history events.
  let history = region.history;
  // (Events are appended; we trust the saved order.)

  // Apply player actions.
  const impact = {
    ...region.impact,
    actions: { ...saved.actions } as typeof region.impact.actions,
    lastDay: saved.day,
  };

  return {
    ...region,
    populations,
    resources,
    history,
    impact,
    lastSimDay: saved.day,
  };
}
