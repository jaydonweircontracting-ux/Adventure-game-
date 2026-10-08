// Ecosystem history (BUILD 501 — A-life Phase 7).
//
// The simulation produces history. Regional ecological events are
// summarized (not stored individually) and feed into lore, examine
// text, NPC dialogue, and quests.
//
// Example:
// Year 4: large wolf population near northern forest
// Year 5: wolf population increased
// Year 6: deer population declined
// Year 7: wolves migrated east
// Year 8: deer recovered

export type EcoEventKind =
  | 'population_boom'
  | 'population_crash'
  | 'migration_in'
  | 'migration_out'
  | 'predator_increase'
  | 'prey_decline'
  | 'resource_depletion'
  | 'resource_recovery'
  | 'species_extinct_local'
  | 'species_returned';

export interface EcoEvent {
  kind: EcoEventKind;
  speciesId: string;
  regionX: number;
  regionY: number;
  /** Game day when it happened */
  day: number;
  /** Human-readable summary */
  summary: string;
}

export interface RegionalHistory {
  regionX: number;
  regionY: number;
  /** Recent events (capped at 20) */
  events: EcoEvent[];
  /** Last day history was updated */
  lastUpdateDay: number;
}

/**
 * Create empty history for a region.
 */
export function createRegionalHistory(
  regionX: number,
  regionY: number,
): RegionalHistory {
  return {
    regionX,
    regionY,
    events: [],
    lastUpdateDay: 0,
  };
}

/**
 * Record an ecological event.
 * Keeps only the 20 most recent.
 */
export function recordEcoEvent(
  history: RegionalHistory,
  kind: EcoEventKind,
  speciesId: string,
  day: number,
): RegionalHistory {
  const summaries: Record<EcoEventKind, string> = {
    population_boom: `${speciesId} population surged`,
    population_crash: `${speciesId} population crashed`,
    migration_in: `${speciesId} migrated into the area`,
    migration_out: `${speciesId} migrated away`,
    predator_increase: `More predators threaten ${speciesId}`,
    prey_decline: `${speciesId} declining from predation`,
    resource_depletion: `${speciesId} food sources depleted`,
    resource_recovery: `${speciesId} food sources recovering`,
    species_extinct_local: `${speciesId} disappeared locally`,
    species_returned: `${speciesId} returned to the area`,
  };

  const event: EcoEvent = {
    kind,
    speciesId,
    regionX: history.regionX,
    regionY: history.regionY,
    day,
    summary: summaries[kind],
  };

  const events = [...history.events, event];
  // Keep only 20 most recent.
  if (events.length > 20) {
    events.splice(0, events.length - 20);
  }

  return {
    ...history,
    events,
    lastUpdateDay: day,
  };
}

/**
 * Detect events by comparing population snapshots.
 * Returns events that should be recorded.
 */
export function detectEcoEvents(
  speciesId: string,
  regionX: number,
  regionY: number,
  prevPopulation: number,
  currPopulation: number,
  prevDay: number,
  currDay: number,
): EcoEventKind[] {
  const events: EcoEventKind[] = [];

  if (prevPopulation === 0 && currPopulation > 0) {
    events.push('species_returned');
  } else if (prevPopulation > 0 && currPopulation === 0) {
    events.push('species_extinct_local');
  } else if (prevPopulation > 0) {
    const change = (currPopulation - prevPopulation) / prevPopulation;
    if (change > 0.5) events.push('population_boom');
    else if (change < -0.5) events.push('population_crash');
  }

  return events;
}

/**
 * Generate a narrative summary for NPC dialogue or lore.
 */
export function historyNarrative(history: RegionalHistory): string {
  if (history.events.length === 0) {
    return 'Nothing unusual has happened here recently.';
  }

  // Take the 3 most recent.
  const recent = history.events.slice(-3);
  const parts = recent.map(e => e.summary);
  return parts.join('. ') + '.';
}
