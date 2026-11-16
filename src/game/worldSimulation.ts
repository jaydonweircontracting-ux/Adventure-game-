/**
 * Unified living-world coordinator.
 *
 * This is the shared daily boundary for the existing world ecology,
 * NPC production, and civilization/economy simulations. It deliberately
 * composes the existing systems instead of creating parallel inventories,
 * clocks, or settlement ledgers.
 *
 * Call once after the authoritative WorldCore clock advances (never from
 * rendering). Persist this state alongside the existing civilization save.
 */
import type { Townsperson } from './townsfolk';
import type { WorldClockState } from './worldCore';
import {
  advanceCivilization,
  type CivilizationState,
} from './civilization';
import { applyNPCProduction } from './townProduction';
import {
  simulateResourceDay,
  type ResourcePopulation,
} from './resources';

export const LIVING_WORLD_SCHEMA_VERSION = 1;
const MAX_RESOURCE_CATCH_UP_DAYS = 370;

export type LivingWorldState = {
  schemaVersion: typeof LIVING_WORLD_SCHEMA_VERSION;
  /** Last world day whose ecology has been advanced. */
  lastAdvancedDay: number;
  /** Regional plant populations; keyed by stable caller-owned IDs. */
  resources: Record<string, ResourcePopulation>;
  /** Existing authoritative settlement/civilization ledger. */
  civilization: CivilizationState;
};

export type LivingWorldAdvanceResult = {
  state: LivingWorldState;
  advancedDays: number;
  resourcePopulationsAdvanced: number;
  civilizationAdvanced: boolean;
};

/** Build a serializable coordinator state around existing game systems. */
export function createLivingWorldState(
  civilization: CivilizationState,
  resources: Record<string, ResourcePopulation> = {},
  startingDay = 1,
): LivingWorldState {
  return {
    schemaVersion: LIVING_WORLD_SCHEMA_VERSION,
    lastAdvancedDay: Math.max(0, Math.floor(startingDay) - 1),
    resources: Object.fromEntries(
      Object.entries(resources).map(([id, resource]) => [id, { ...resource }]),
    ),
    civilization,
  };
}

/**
 * Advance the connected world to the supplied authoritative clock.
 *
 * Order is intentional:
 * 1. Living natural resources regenerate.
 * 2. NPC professions produce into the existing settlement stockpiles.
 * 3. Civilization/economy simulation consumes the updated settlement state.
 *
 * Each subsystem retains its own deterministic/idempotent checkpoint. This
 * outer checkpoint prevents duplicate daily orchestration after save/load.
 *
 * BUILD 1062: `options.productionSettlementId` names the settlement NPC
 * production lands in (default 'mosslight', the 2.5D town) — the 3D
 * adapter passes its camp's id so the same production runs into the
 * camp's ledger instead of a disconnected town.
 */
export function advanceLivingWorld(
  previous: LivingWorldState,
  townsfolk: Townsperson[],
  clock: WorldClockState,
  options?: { productionSettlementId?: string },
): LivingWorldAdvanceResult {
  if (previous.schemaVersion !== LIVING_WORLD_SCHEMA_VERSION) {
    throw new Error('living world: incompatible state schema');
  }

  const requestedDay = Math.max(1, Math.floor(clock.day));
  const lastAdvancedDay = Math.max(0, Math.floor(previous.lastAdvancedDay));
  // Advance in bounded batches. If a save returns after a very long absence,
  // repeated calls at the same clock value can safely catch up without marking
  // days as simulated before their systems have actually processed them.
  const targetDay = Math.min(requestedDay, lastAdvancedDay + MAX_RESOURCE_CATCH_UP_DAYS);
  if (targetDay <= lastAdvancedDay) {
    return {
      state: previous,
      advancedDays: 0,
      resourcePopulationsAdvanced: 0,
      civilizationAdvanced: false,
    };
  }

  // Bound catch-up work so corrupted/old saves cannot stall the game.
  const firstDay = Math.max(lastAdvancedDay + 1, targetDay - MAX_RESOURCE_CATCH_UP_DAYS + 1);
  const advancedDays = targetDay - firstDay + 1;
  const resources: Record<string, ResourcePopulation> = {};

  for (const [id, population] of Object.entries(previous.resources)) {
    let next = { ...population };
    const resourceFirstDay = Math.max(firstDay, Math.floor(next.lastSimDay) + 1);
    for (let day = resourceFirstDay; day <= targetDay; day += 1) {
      next = simulateResourceDay(next);
    }
    resources[id] = next;
  }

  // These are the existing shared ledgers: NPC output enters civilization
  // settlement storage before the civilization economy advances.
  const civilization = previous.civilization;
  const nextClock = {
    ...clock,
    day: targetDay,
    year: 1 + Math.floor((targetDay - 1) / 360),
    month: 1 + Math.floor(((targetDay - 1) % 360) / 30),
    week: 1 + Math.floor((targetDay - 1) / 7),
  };
  applyNPCProduction(civilization, townsfolk, nextClock, options?.productionSettlementId);
  const beforeCivilizationDay = civilization.lastSimDay;
  advanceCivilization(civilization, nextClock);

  const state: LivingWorldState = {
    schemaVersion: LIVING_WORLD_SCHEMA_VERSION,
    lastAdvancedDay: targetDay,
    resources,
    civilization,
  };

  return {
    state,
    advancedDays,
    resourcePopulationsAdvanced: Object.keys(resources).length,
    civilizationAdvanced: civilization.lastSimDay > beforeCivilizationDay,
  };
}

/** JSON save boundary; validation is intentionally strict and non-destructive. */
export function serializeLivingWorld(state: LivingWorldState): string {
  return JSON.stringify(state);
}

export function deserializeLivingWorld(data: string): LivingWorldState {
  const parsed = JSON.parse(data) as Partial<LivingWorldState>;
  if (
    !parsed ||
    parsed.schemaVersion !== LIVING_WORLD_SCHEMA_VERSION ||
    !Number.isFinite(parsed.lastAdvancedDay) ||
    !parsed.resources ||
    typeof parsed.resources !== 'object' ||
    !parsed.civilization
  ) {
    throw new Error('living world: incompatible save data');
  }
  return parsed as LivingWorldState;
}
