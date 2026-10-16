// Town production: NPC work -> real resources (BUILD 711; idempotent daily simulation).
//
// Connects town jobs to settlement storage. Farmers produce grain, smiths
// produce tools and occasional weapons, and priests produce medicine. The
// simulation catches up missed days and never produces a day twice.
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

  const totals = { grain: 0, tools: 0, weapons: 0, medicine: 0 };
  // Catch up missed days deterministically (e.g. fast-forward or loading an
  // older save). Bound work by the existing civilization catch-up limit.
  const firstDay = Math.max(1, lastDay + 1, day - 369);
  for (let productionDay = firstDay; productionDay <= day; productionDay += 1) {
    for (const npc of townsfolk) {
      if (npc.archetype === 'farmer') {
        // 90% work rate; deterministic rest days.
        if (townsfolkHash(npc.seed, productionDay * 7919 + 6601) <= 0.1) continue;
        totals.grain += 2 + Math.floor(townsfolkHash(npc.seed, productionDay * 131 + 6602) * 2.99);
      } else if (npc.archetype === 'smith') {
        // Smiths maintain tools regularly and forge weapons less often.
        if (townsfolkHash(npc.seed, productionDay * 7919 + 7111) > 0.18) {
          totals.tools += 1 + Math.floor(townsfolkHash(npc.seed, productionDay * 137 + 7112) * 2);
        }
        if (townsfolkHash(npc.seed, productionDay * 7919 + 7113) > 0.72) totals.weapons += 1;
      } else if (npc.archetype === 'priest') {
        // Medicine represents prepared remedies and basic healing supplies.
        if (townsfolkHash(npc.seed, productionDay * 7919 + 7121) > 0.3) totals.medicine += 1;
      }
    }
  }

  // Respect per-resource storage caps. Missing keys in legacy/test saves are 0.
  const cap = 50 + mosslight.population;
  for (const [resource, amount] of Object.entries(totals) as [keyof typeof totals, number][]) {
    const current = mosslight.storage[resource] ?? 0;
    mosslight.storage[resource] = Math.round(Math.min(cap, current + amount) * 10) / 10;
  }
  // Even a zero-output day is checkpointed so repeated calls are idempotent.
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

/** Summary of the deterministic work output for one day, useful for UI and tests. */
export function npcWorkOutputSummary(
  townsfolk: Townsperson[],
  day: number,
): { farmers: number; smiths: number; priests: number; grain: number; tools: number; weapons: number; medicine: number } {
  const normalizedDay = Math.max(1, Math.floor(day));
  const totals = { farmers: 0, smiths: 0, priests: 0, grain: 0, tools: 0, weapons: 0, medicine: 0 };
  for (const npc of townsfolk) {
    if (npc.archetype === 'farmer') {
      totals.farmers++;
      if (townsfolkHash(npc.seed, normalizedDay * 7919 + 6601) <= 0.1) continue;
      totals.grain += 2 + Math.floor(townsfolkHash(npc.seed, normalizedDay * 131 + 6602) * 2.99);
    } else if (npc.archetype === 'smith') {
      totals.smiths++;
      if (townsfolkHash(npc.seed, normalizedDay * 7919 + 7111) > 0.18) {
        totals.tools += 1 + Math.floor(townsfolkHash(npc.seed, normalizedDay * 137 + 7112) * 2);
      }
      if (townsfolkHash(npc.seed, normalizedDay * 7919 + 7113) > 0.72) totals.weapons++;
    } else if (npc.archetype === 'priest') {
      totals.priests++;
      if (townsfolkHash(npc.seed, normalizedDay * 7919 + 7121) > 0.3) totals.medicine++;
    }
  }
  return totals;
}
