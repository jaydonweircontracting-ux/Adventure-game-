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
};

/**
 * Decide who a hostile creature should be attacking right now.
 * Returns null when no victim is in acquire range and no valid lock exists.
 */
export function chooseCreatureTarget(args: ChooseCreatureTargetArgs): CreatureTargetChoice | null {
  const { creaturePos, current, playerPos, npcs } = args;

  // Distance to the current lock, or null when the lock is broken
  // (target gone, or beyond the leash).
  let currentDist: number | null = null;
  if (current?.kind === 'player' && playerPos) {
    const d = dist(creaturePos, playerPos);
    if (d <= CREATURE_LEASH_RANGE) currentDist = d;
  } else if (current?.kind === 'npc') {
    const locked = npcs.find((c) => c.npcId === current.npcId);
    if (locked) {
      const d = dist(creaturePos, locked.position);
      if (d <= CREATURE_LEASH_RANGE) currentDist = d;
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
    // Lock holds unless a challenger is dramatically closer.
    if (best && best.d <= CREATURE_ACQUIRE_RANGE && best.d < currentDist * CREATURE_SWITCH_RATIO) {
      return best.choice;
    }
    return current;
  }
  // No valid lock: acquire the nearest victim inside acquire range.
  // `best` already holds the nearest non-lock victim; when the broken lock
  // was the player, the player was excluded from `best`, so re-include the
  // player as a fresh candidate.
  let nearest: { choice: CreatureTargetChoice; d: number } | null = best;
  if (current?.kind === 'player' && playerPos) {
    const d = dist(creaturePos, playerPos);
    if (!nearest || d < nearest.d) nearest = { choice: { kind: 'player' }, d };
  }
  if (nearest && nearest.d <= CREATURE_ACQUIRE_RANGE) return nearest.choice;
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
