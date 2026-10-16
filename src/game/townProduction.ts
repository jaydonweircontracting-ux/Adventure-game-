// Town production: NPC work -> real resources (BUILD 661; idempotent daily simulation).
//
// Connects individual NPC schedules to settlement storage. Farmers produce
// grain deterministically. The simulation is safe to call every clock update:
// it catches up missed days once, and never produces the same day twice.
//
// Pure with respect to random state: all output derives from NPC seeds + day.
// The existing CivilizationState owns the production ledger so JSON saves keep
// the checkpoint and old saves remain compatible (missing field defaults to 0).

import type { CivilizationState } from './civilization';
import type { Townsperson } from './townsfolk';
import type { WorldClockState } from './worldCore';
import { townsfolkHash } from './townsfolk';

type ProductionLedger = CivilizationState & { lastNPCProductionDay?: number };

/**
 * Apply all outstanding days of NPC-driven production to settlement storage.
 * Safe to call every tick and after save/load; repeated calls for a day are no-ops.
 * Deterministic: same NPC roster and day range yields the same total.
 */
export function applyNPCProduction(
  civ: CivilizationState,
  townsfolk: Townsperson[],
  clock: WorldClockState,
): CivilizationState {
  const day = Math.max(1, Math.floor(clock.day));
  const ledger = civ as ProductionLedger;
  const mosslight = civ.settlements.find((s) => s.id === 'mosslight');
  if (!mosslight) return civ;

  const lastDay = Math.max(0, Math.floor(ledger.lastNPCProductionDay ?? 0));
  if (day <= lastDay) return civ;

  let totalGrain = 0;
  // Catch up missed days deterministically (e.g. fast-forward or loading an
  // older save). Bound work by the existing civilization catch-up limit.
  const firstDay = Math.max(1, lastDay + 1, day - 369);
  for (let productionDay = firstDay; productionDay <= day; productionDay += 1) {
    for (const npc of townsfolk) {
      if (npc.archetype !== 'farmer') continue;
      // 90% work rate; deterministic sick/rest day.
      if (townsfolkHash(npc.seed, productionDay * 7919 + 6601) <= 0.1) continue;
      totalGrain += 2 + Math.floor(townsfolkHash(npc.seed, productionDay * 131 + 6602) * 2.99);
    }
  }

  // Respect the settlement storage cap. Even a zero-farmer day is marked
  // processed so this function remains idempotent.
  const cap = 50 + mosslight.population;
  const current = mosslight.storage.grain ?? 0;
  mosslight.storage.grain = Math.round(Math.min(cap, current + totalGrain) * 10) / 10;
  ledger.lastNPCProductionDay = day;
  return civ;
}

/** Deterministic production summary for diagnostics and tests. */
export function npcProductionSummary(
  townsfolk: Townsperson[],
  day: number,
): { farmers: number; workingFarmers: number; estimatedGrain: number } {
  const normalizedDay = Math.max(1, Math.floor(day));
  let farmers = 0;
  let workingFarmers = 0;
  let estimatedGrain = 0;

  for (const npc of townsfolk) {
    if (npc.archetype !== 'farmer') continue;
    farmers++;
    if (townsfolkHash(npc.seed, normalizedDay * 7919 + 6601) <= 0.1) continue;
    workingFarmers++;
    estimatedGrain += 2 + Math.floor(townsfolkHash(npc.seed, normalizedDay * 131 + 6602) * 2.99);
  }

  return { farmers, workingFarmers, estimatedGrain };
}
