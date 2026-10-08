// Bounty and wanted system (BUILD 524 — Advanced World Reactivity).
//
// When severe crimes are witnessed, the player gains bounty.
// Bounty affects NPC reactions and can lead to pursuit (future).
// Pure module — tested in scripts/simulate.ts.

export interface BountyState {
  /** Total bounty amount (gold). */
  amount: number;
  /** Crime IDs contributing to bounty. */
  crimeIds: string[];
  /** Game day of last crime. */
  lastCrimeDay: number;
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
 * Add a crime to bounty state. Pure — returns new state.
 */
export function addCrimeToBounty(
  state: BountyState,
  crimeId: string,
  severity: number,
  witnessCount: number,
  day: number,
): BountyState {
  const bounty = bountyForCrime(severity, witnessCount);
  if (bounty === 0) return state;
  return {
    amount: state.amount + bounty,
    crimeIds: [...state.crimeIds, crimeId],
    lastCrimeDay: day,
  };
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
  return { amount: 0, crimeIds: [], lastCrimeDay: 0 };
}
