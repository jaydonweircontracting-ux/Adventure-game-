// Bounty and wanted system (BUILD 524 — Advanced World Reactivity).
//
// When severe crimes are witnessed, the player gains bounty.
// Bounty affects NPC reactions and can lead to pursuit (future).
// Pure module — tested in scripts/simulate.ts.
//
// BUILD 926: bounty is witness-driven AND per-town/district.
// - A crime posts NO bounty until a surviving witness reaches a guard.
//   Witnesses who die (or are jailed) before reporting cannot post it;
//   if every witness dies first, the crime leaves no bounty at all.
// - A posted bounty lives in ONE town: the town of the guard who received
//   the report. Guards in other towns do not act on it. Towns are the
//   existing settlement landmarks (landmarks.ts) — no new region system.
// - Amounts are unchanged from BUILD 524: same base by severity, same
//   witness-count multiplier. Only the timing (report-gated) and the
//   scoping (per-town buckets) changed.

import { landmarkAt } from './landmarks';

export interface TownBounty {
  /** Total bounty amount (gold) in this town. */
  amount: number;
  /** Crime IDs contributing to this town's bounty. */
  crimeIds: string[];
  /** Game day of last crime posted in this town. */
  lastCrimeDay: number;
}

export interface BountyState {
  /** One bucket per town that has posted a bounty. No entry = clean there. */
  towns: Record<string, TownBounty>;
}

/** Base bounty by crime severity (1-5). */
export const BOUNTY_BY_SEVERITY: Record<number, number> = {
  1: 10,
  2: 25,
  3: 50,
  4: 100,
  5: 250,
};

/** Minimum witnesses needed for bounty (unwitnessed crimes don't create bounty). */
export const MIN_WITNESSES_FOR_BOUNTY = 1;

/**
 * Calculate bounty for a crime. Pure.
 * More witnesses = higher bounty (up to 2x).
 */
export function bountyForCrime(severity: number, witnessCount: number): number {
  if (witnessCount < MIN_WITNESSES_FOR_BOUNTY) return 0;
  const base = BOUNTY_BY_SEVERITY[severity] || 10;
  const multiplier = Math.min(2, 1 + witnessCount * 0.25);
  return Math.round(base * multiplier);
}

/**
 * Add a crime to one town's bounty bucket. Pure — returns new state.
 * Amount math is identical to BUILD 524; only the bucket is new.
 */
export function addCrimeToBounty(
  state: BountyState,
  crimeId: string,
  severity: number,
  witnessCount: number,
  day: number,
  townId: string,
): BountyState {
  const bounty = bountyForCrime(severity, witnessCount);
  if (bounty === 0 || !townId) return state;
  const prev = state.towns[townId] ?? { amount: 0, crimeIds: [], lastCrimeDay: 0 };
  return {
    towns: {
      ...state.towns,
      [townId]: {
        amount: prev.amount + bounty,
        crimeIds: [...prev.crimeIds, crimeId],
        lastCrimeDay: day,
      },
    },
  };
}

/** Bounty amount in one town (0 when clean there). Pure. */
export function bountyForTown(state: BountyState, townId: string): number {
  return state.towns[townId]?.amount ?? 0;
}

/** Total bounty across all towns. Pure. */
export function totalBounty(state: BountyState): number {
  let total = 0;
  for (const town of Object.values(state.towns)) total += town.amount;
  return total;
}

/** Clear one town's bounty bucket (paying the fine / serving jail there). Pure. */
export function clearTownBounty(state: BountyState, townId: string): BountyState {
  if (!state.towns[townId]) return state;
  const towns = { ...state.towns };
  delete towns[townId];
  return { towns };
}

/**
 * Wanted level based on bounty amount.
 * 0 = clean, 1 = suspicious, 2 = wanted, 3 = dangerous.
 */
export function wantedLevel(bounty: number): 0 | 1 | 2 | 3 {
  if (bounty >= 500) return 3;
  if (bounty >= 200) return 2;
  if (bounty >= 50) return 1;
  return 0;
}

/** Create empty bounty state. */
export function emptyBounty(): BountyState {
  return { towns: {} };
}

/**
 * Town id for a chunk: the settlement landmark's name when the chunk IS a
 * settlement (town or village), null otherwise (wilderness, dungeons,
 * ruins, caves — places with no town guard to receive a report).
 * Pure. Uses the authoritative landmark table, nothing invented.
 */
export function townIdForChunk(chunk: { x: number; y: number }): string | null {
  const landmark = landmarkAt(chunk);
  if (!landmark) return null;
  if (landmark.kind !== 'town' && landmark.kind !== 'village') return null;
  return landmark.name;
}

/**
 * Migrate a saved bounty to the BUILD 926 shape. Pure.
 * Pre-926 saves stored one global bucket; guards only ever acted on it in
 * Mosslight Crossing, so the global amount migrates there intact.
 * New-shape saves pass through; garbage becomes empty.
 */
export function migrateBounty(saved: unknown): BountyState {
  if (!saved || typeof saved !== 'object') return emptyBounty();
  const record = saved as Record<string, unknown>;
  if (record.towns && typeof record.towns === 'object') {
    const towns: Record<string, TownBounty> = {};
    for (const [townId, bucket] of Object.entries(record.towns as Record<string, unknown>)) {
      if (!bucket || typeof bucket !== 'object') continue;
      const b = bucket as Record<string, unknown>;
      if (typeof b.amount !== 'number') continue;
      towns[townId] = {
        amount: b.amount,
        crimeIds: Array.isArray(b.crimeIds) ? (b.crimeIds as string[]) : [],
        lastCrimeDay: typeof b.lastCrimeDay === 'number' ? b.lastCrimeDay : 0,
      };
    }
    return { towns };
  }
  if (typeof record.amount === 'number' && record.amount > 0) {
    return {
      towns: {
        'Mosslight Crossing': {
          amount: record.amount,
          crimeIds: Array.isArray(record.crimeIds) ? (record.crimeIds as string[]) : [],
          lastCrimeDay: typeof record.lastCrimeDay === 'number' ? record.lastCrimeDay : 0,
        },
      },
    };
  }
  return emptyBounty();
}

// ---------------------------------------------------------------------------
// Pending witness reports (BUILD 926).
//
// A witnessed player crime does NOT post a bounty at crime time. It creates
// one pending report per crime, listing every living witness. The report
// completes when any listed witness reaches a guard (or IS a guard — a guard
// witness already knows). Completion posts the bounty in the report's town:
// the town of the guard who receives it. If every witness dies first, the
// report is dropped and the crime leaves no bounty. "Surviving" therefore
// means: alive at report time. Jailed witnesses cannot report while jailed
// (they are off the field), but a jailed witness does not kill the report
// while another witness still lives — jail ends after 2 days (BUILD 885).
// Reports are transient: they live in GameField state, never serialize, so
// a save/load drops them (same rule as tap-move travel, BUILD 920).
// ---------------------------------------------------------------------------

export interface PendingReport {
  crimeId: string;
  severity: number;
  /** Witness count at crime time (drives the amount, unchanged from 524). */
  witnessCount: number;
  day: number;
  /** NPC ids that witnessed the crime and could still report it. */
  witnessIds: string[];
  /** Town whose guard receives the report (guard's town). */
  townId: string;
}

/** Create a pending report. Pure. Caller guarantees witnessIds is non-empty. */
export function createPendingReport(
  crimeId: string,
  severity: number,
  witnessCount: number,
  day: number,
  witnessIds: string[],
  townId: string,
): PendingReport {
  return { crimeId, severity, witnessCount, day, witnessIds: [...witnessIds], townId };
}

/**
 * Advance pending reports one step. Pure.
 * - isAlive(id): the witness still lives (not dead).
 * - canReachGuard(id): the witness can reach a guard right now — i.e. the
 *   witness is a guard, or a living outdoor guard is within witness radius.
 * A report completes when ANY witness can reach a guard; it is dropped only
 * when NO witness is alive anymore. Completed reports appear at most once.
 */
export function advancePendingReports(
  reports: PendingReport[],
  isAlive: (npcId: string) => boolean,
  canReachGuard: (npcId: string) => boolean,
): { completed: PendingReport[]; remaining: PendingReport[] } {
  const completed: PendingReport[] = [];
  const remaining: PendingReport[] = [];
  for (const report of reports) {
    const living = report.witnessIds.filter(isAlive);
    if (living.length === 0) continue; // every witness died: no bounty, ever
    if (living.some(canReachGuard)) {
      completed.push(report);
    } else {
      remaining.push(report);
    }
  }
  return { completed, remaining };
}
