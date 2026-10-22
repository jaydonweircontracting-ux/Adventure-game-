import type { CombatPoint } from './combat';

/**
 * BUILD 914: creature target acquisition (NPC-vs-monster combat).
 *
 * Until now hostile creatures only ever targeted the player: updateGoat's
 * "player" parameter WAS the target, hard-wired by the App loops. This
 * module is the ServUO-style acquire/reacquire decision, kept pure so the
 * App loops stay thin and the rules are sim-testable:
 *
 * - A hostile creature acquires the NEAREST valid victim (player or
 *   townsfolk) inside CREATURE_ACQUIRE_RANGE.
 * - Targeting is STABLE: a locked target is kept while it stays valid
 *   (alive, present, inside the wider CREATURE_LEASH_RANGE). A challenger
 *   steals the lock only by being dramatically closer
 *   (CREATURE_SWITCH_RATIO × the current target's distance) — no
 *   per-tick thrash between two nearby victims.
 * - When the lock breaks (target died, fled indoors, left the leash),
 *   the creature reacquires the nearest victim in acquire range, or
 *   gives up (null) and falls back to its old player-only behavior.
 *
 * Peaceful critters never reach this code: the App loops only consult it
 * for creatures whose disposition is 'aggressive'.
 */

/** Who a hostile creature is currently trying to kill. */
export type CreatureTargetChoice =
  | { kind: 'player' }
  | { kind: 'npc'; npcId: string };

/** A townsfolk victim candidate, pre-filtered by the caller (alive,
 *  outdoors, not jailed, in the creature's area). */
export type CreatureTargetCandidate = {
  npcId: string;
  position: CombatPoint;
};

/** Matches GOAT_CHASE_RANGE in ai.ts: beyond this, creatures never engage. */
export const CREATURE_ACQUIRE_RANGE = 24;
/**
 * BUILD 933: a sneaking player is acquired at a REDUCED range — mirrors
 * SNEAK_WITNESS_RADIUS in sneak.ts (12u vs the normal 24u). Only fresh
 * acquisition of the player is gated: a creature that already holds the
 * player as its lock keeps the lock until the leash/flee rules release it
 * (never silently dropped because sneak was toggled), and creature-vs-NPC
 * acquisition is unchanged.
 */
export const SNEAK_CREATURE_ACQUIRE_RANGE = 12;

/**
 * BUILD 933: the player-engagement range for a creature that is not
 * already fighting the player. Used by the App loops for the melee chase
 * gate (updateGoat) and the archer volley gate, so a sneaking player
 * outside 12 units is not engaged by any path — not just the acquisition
 * pick. An already-engaged creature keeps its normal range.
 */
export function sneakEngagementRange(sneaking: boolean, engaged: boolean, normalRange: number): number {
  return sneaking && !engaged ? SNEAK_CREATURE_ACQUIRE_RANGE : normalRange;
}
/** A locked target is held until it gets this far away (hysteresis so a
 *  victim hovering at the acquire edge doesn't flicker the lock). */
export const CREATURE_LEASH_RANGE = 36;
/** A challenger must be closer than this fraction of the current target's
 *  distance to steal an existing lock. */
export const CREATURE_SWITCH_RATIO = 0.6;
/** How far a guard can see a creature threat. Matches WITNESS_RADIUS in
 *  crime.ts: guards respond to exactly what a witness could have seen. */
export const GUARD_CREATURE_SIGHT_RANGE = 25;

/** Stable map key for one creature population entry. */
export function creatureTargetKey(entityKind: 'goat' | 'monster', id: number): string {
  return entityKind + ':' + id;
}

function dist(a: CombatPoint, b: CombatPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export type ChooseCreatureTargetArgs = {
  creaturePos: CombatPoint;
  /** The creature's current lock, if any. */
  current: CreatureTargetChoice | null;
  /** Player position, or null when the player is unavailable as a victim
   *  (indoors, in prison, game over). */
  playerPos: CombatPoint | null;
  /** Townsfolk candidates (already filtered by the caller). */
  npcs: CreatureTargetCandidate[];
  /** BUILD 933: true while the player is sneaking. Gates FRESH player
   *  acquisition to SNEAK_CREATURE_ACQUIRE_RANGE; a held player lock is
   *  never dropped by this flag (the lock-hold branch below ignores it). */
  playerSneaking?: boolean;
  /**
   * BUILD 943: per-kind range overrides (EQEmu leash/chase-distance
   * abilities, resolved by the caller from the kind's behavior block).
   * Default to the globals when omitted, so every pre-943 caller is
   * unchanged. Callers must pass leashRange >= acquireRange (the
   * ability sweep asserts it) — a creature must never acquire a
   * victim it instantly drops for being past its leash.
   */
  acquireRange?: number;
  leashRange?: number;
  /**
   * BUILD 973: hate rank from the creature's hate ledger (hateList.ts):
   * lower rank = more hate. Consulted ONLY in the no-lock branch below,
   * so lock-hold and lock-steal rules are untouched — hate decides who
   * a targetless creature goes for next, never who it drops. Omitted
   * callers get exactly the old nearest-victim behavior.
   * Attacker keys: 'player' for the player, townsfolk id for NPCs.
   */
  hateRank?: (attacker: string) => number;
};

/**
 * Decide who a hostile creature should be attacking right now.
 * Returns null when no victim is in acquire range and no valid lock exists.
 */
export function chooseCreatureTarget(args: ChooseCreatureTargetArgs): CreatureTargetChoice | null {
  const {
    creaturePos, current, playerPos, npcs, playerSneaking = false,
    acquireRange = CREATURE_ACQUIRE_RANGE, leashRange = CREATURE_LEASH_RANGE,
    hateRank,
  } = args;

  // Distance to the current lock, or null when the lock is broken
  // (target gone, or beyond the leash).
  let currentDist: number | null = null;
  if (current?.kind === 'player' && playerPos) {
    const d = dist(creaturePos, playerPos);
    if (d <= leashRange) currentDist = d;
  } else if (current?.kind === 'npc') {
    const locked = npcs.find((c) => c.npcId === current.npcId);
    if (locked) {
      const d = dist(creaturePos, locked.position);
      if (d <= leashRange) currentDist = d;
    }
  }

  // Nearest challenger (any victim that is not the current lock).
  let best: { choice: CreatureTargetChoice; d: number } | null = null;
  if (playerPos && current?.kind !== 'player') {
    best = { choice: { kind: 'player' }, d: dist(creaturePos, playerPos) };
  }
  for (const c of npcs) {
    if (current?.kind === 'npc' && current.npcId === c.npcId) continue;
    const d = dist(creaturePos, c.position);
    if (!best || d < best.d) best = { choice: { kind: 'npc', npcId: c.npcId }, d };
  }

  if (current && currentDist !== null) {
    // Lock holds unless a challenger is dramatically closer. BUILD 933: a
    // sneaking player challenger must ALSO be inside the reduced sneak
    // range to steal a lock; a held player lock itself is never dropped
    // by sneak (this branch returns `current` untouched otherwise).
    const bestRange = best?.choice.kind === 'player' && playerSneaking
      ? SNEAK_CREATURE_ACQUIRE_RANGE
      : acquireRange;
    if (best && best.d <= bestRange && best.d < currentDist * CREATURE_SWITCH_RATIO) {
      return best.choice;
    }
    return current;
  }
  // No valid lock: acquire the nearest victim inside ITS acquire range.
  // BUILD 933: the player candidate uses the reduced sneak range while
  // sneaking; NPC candidates always use the normal range. Per-candidate
  // ranges replace the old single-nearest check, because a sneaking player
  // nearer than an in-range NPC must not shadow that NPC (creature-vs-NPC
  // acquisition is unchanged). Tie behavior matches the pre-933
  // construction exactly: the player was added to `best` first, so ties
  // go to the player — except when the broken lock was the player, where
  // re-inclusion required strictly closer.
  const playerD = playerPos ? dist(creaturePos, playerPos) : null;
  const playerInRange = playerD !== null
    && playerD <= (playerSneaking ? SNEAK_CREATURE_ACQUIRE_RANGE : acquireRange);
  let npcBest: { npcId: string; d: number } | null = null;
  for (const c of npcs) {
    if (current?.kind === 'npc' && current.npcId === c.npcId) continue;
    const d = dist(creaturePos, c.position);
    if (!npcBest || d < npcBest.d) npcBest = { npcId: c.npcId, d };
  }
  const npcInRange = npcBest !== null && npcBest.d <= acquireRange;
  // BUILD 973: hate-ordered fresh acquisition. When a hate rank is
  // supplied and the creature holds no lock, the most-hated in-range
  // victim wins over the nearest one (rank, then distance, then the
  // player on a full tie — mirroring the tie rule below). Sneak ranges
  // still gate the player candidate exactly as before.
  if (hateRank) {
    let bestChoice: CreatureTargetChoice | null = null;
    let bestRank = Infinity;
    let bestD = Infinity;
    const consider = (choice: CreatureTargetChoice, r: number, d: number) => {
      if (bestChoice === null || r < bestRank || (r === bestRank && d < bestD)) {
        bestChoice = choice;
        bestRank = r;
        bestD = d;
      }
    };
    if (playerInRange) consider({ kind: 'player' }, hateRank('player'), playerD!);
    for (const c of npcs) {
      if (current?.kind === 'npc' && current.npcId === c.npcId) continue;
      const d = dist(creaturePos, c.position);
      if (d <= acquireRange) consider({ kind: 'npc', npcId: c.npcId }, hateRank(c.npcId), d);
    }
    if (bestChoice) return bestChoice;
    return null;
  }
  if (playerInRange && npcInRange) {
    const playerWins = current?.kind === 'player' ? playerD! < npcBest!.d : playerD! <= npcBest!.d;
    return playerWins ? { kind: 'player' } : { kind: 'npc', npcId: npcBest!.npcId };
  }
  if (playerInRange) return { kind: 'player' };
  if (npcInRange) return { kind: 'npc', npcId: npcBest!.npcId };
  return null;
}

/** One creature a guard might engage. */
export type GuardThreatCandidate = {
  entityKind: 'goat' | 'monster';
  id: number;
  position: CombatPoint;
  /** True when the creature is already attacking a townsfolk (or is an
   *  idle hostile loose in town). Creatures mid-fight with the player are
   *  left to the player. */
  menacing: boolean;
};

/**
 * BUILD 914: guard intervention. A guard engages the NEAREST menacing
 * creature inside sight range. Pure nearest-pick; the caller supplies the
 * threat list from the live creature populations.
 */
export function pickGuardCreatureTarget(
  guardPos: CombatPoint,
  threats: GuardThreatCandidate[],
  sightRange: number = GUARD_CREATURE_SIGHT_RANGE,
): GuardThreatCandidate | null {
  let best: GuardThreatCandidate | null = null;
  let bestDist = Infinity;
  for (const t of threats) {
    if (!t.menacing) continue;
    const d = dist(guardPos, t.position);
    if (d <= sightRange && d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}
