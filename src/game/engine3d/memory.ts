/**
 * BUILD 1060 — NPC memory + relationships (G26): the founders
 * remember each other. The audit's dependency order puts
 * memory/relationships after needs/schedule-choice (1057–1059) and
 * before population growth; the vision brief's Sims + Songs of Syx
 * sections call for NPCs who remember interactions and form
 * relationships. The port source is villageLife.ts — but that
 * module's relationships are a SEEDED graph (pure functions of
 * npc + clock: housemates are family, friendships come from the
 * seed-pair hash, affinity matures with days known) and its
 * memories are the one piece of genuine mutable state (bounded at
 * 12, oldest low-importance forgotten first). The 3D port keeps
 * the shape and changes the engine:
 *
 * - AFFINITY IS EARNED, NOT SEEDED. The three founders start
 *   neutral (50) toward each other — strangers who arrived
 *   together — and affinity moves ONLY through shared events they
 *   actually live through: building the hut together, eating at
 *   the same camp meal, resting together at camp, sleeping in the
 *   same hut. No seed hash decides who likes whom; the history
 *   does.
 * - AFFINITY SCALE 0..100, neutral 50 (villageLife uses -100..100;
 *   the 3D scale matches the needs convention 0..100, higher =
 *   closer). Bumps: build +4 (the hard shared project), rest +3
 *   (company at camp), eat +2 (a shared meal), sleep +1 (a night
 *   under the same roof). Clamped 0..100.
 * - DECAY IS LAZY, toward neutral: 1 point per game day without a
 *   shared event with that founder. The stored affinity carries
 *   the day it was last touched (affinityDay); the EFFECTIVE
 *   affinity at any day is the stored value pulled toward 50 by
 *   the elapsed days, and recording an event decays first, then
 *   bumps. Nothing ticks daily — the decay is computed, never
 *   stored, so a wait or a reload cannot double-decay it.
 * - MEMORIES ARE BOUNDED AT 12 per founder (villageLife parity),
 *   oldest first out, and pruned when older than 30 days
 *   (villageLife's gossip staleness). A memory is {type, other,
 *   day, abs} — the counts the E report shows ("built together
 *   3 times") come straight from these, so the player never sees
 *   a count the founders do not actually remember.
 * - THE SCORER USES RELATIONSHIPS (utility.ts, BUILD 1060): the
 *   rest score gets a companionship premium when the founder's
 *   closest founder is at camp, and the rest DESTINATION is a
 *   tile beside that founder — so founders rest together, not
 *   scattered. The rest destination is computed here
 *   (restTileFor) from a walkability callback, so this module
 *   stays pure and testable.
 *
 * What this module does NOT do: no rumors/gossip propagation to
 * the player (villageLife's propagateRumors is a later build), no
 * factions, no conflict, no player relationship (the player is
 * not in the founders' social graph yet), no personality system.
 * Events are recorded by the view's founder tick at discrete
 * moments (a meal consumed, a build step completed, an activity
 * transition into rest/sleep) — this module only does the math.
 *
 * Pure module (no React, no WebGL, no localStorage) so the sim
 * and the standalone asserts can import it directly. Social state
 * IS saved — in the founders save (v3, see founders.ts).
 */

/** The four shared events that grow a relationship. */
export type SharedEventType = 'build' | 'eat' | 'rest' | 'sleep';

/** One remembered shared event. */
export type FounderMemory = {
  type: SharedEventType;
  /** The other founder involved. */
  other: string;
  /** Game day the event happened. */
  day: number;
  /** Absolute game minutes (day*1440 + minutes) — orders memories. */
  abs: number;
};

/** One founder's social state: pairwise affinity + memories. */
export type FounderSocial = {
  /** Other founder name → affinity 0..100 (neutral 50). */
  affinity: Record<string, number>;
  /** Other founder name → game day the affinity was last touched
   *  (an event recorded, or the day it was created). Decay is
   *  computed from this, never stored as a tick. */
  affinityDay: Record<string, number>;
  /** Remembered shared events, oldest first, capped at MEMORY_CAP. */
  memories: FounderMemory[];
};

/** Memories kept per founder (villageLife parity: 12). */
export const MEMORY_CAP = 12;
/** Memories older than this many days are forgotten (villageLife's
 *  gossip staleness: 30 days). */
export const MEMORY_MAX_AGE_DAYS = 30;
/** Neutral affinity — strangers who arrived together. */
export const AFFINITY_NEUTRAL = 50;
/** Affinity at first meeting (everyone starts neutral). */
export const AFFINITY_START = 50;
/** Affinity drift toward neutral per game day without a shared
 *  event with that founder. */
export const AFFINITY_DECAY_PER_DAY = 1;
/** Affinity gained per shared event, by type. Building the hut
 *  together is the hard shared project (+4); resting together is
 *  real company (+3); a shared meal is a small bond (+2); a night
 *  under the same roof is the weakest (+1 — it happens every
 *  night, so it must not swamp the rest). */
export const AFFINITY_BUMP: Record<SharedEventType, number> = {
  build: 4,
  eat: 2,
  rest: 3,
  sleep: 1,
};

/** Fresh social state: neutral toward every other founder, no
 *  memories. `names` are the OTHER founders' names (never self). */
export function freshFounderSocial(names: string[]): FounderSocial {
  const affinity: Record<string, number> = {};
  const affinityDay: Record<string, number> = {};
  for (const n of names) {
    affinity[n] = AFFINITY_START;
    affinityDay[n] = 0;
  }
  return { affinity, affinityDay, memories: [] };
}

/** Pull an affinity toward neutral by `days` days of drift (1/day,
 *  never crossing 50). Pure. */
export function pullTowardNeutral(affinity: number, days: number): number {
  const d = Math.max(0, Math.floor(days));
  if (affinity > AFFINITY_NEUTRAL) return Math.max(AFFINITY_NEUTRAL, affinity - AFFINITY_DECAY_PER_DAY * d);
  if (affinity < AFFINITY_NEUTRAL) return Math.min(AFFINITY_NEUTRAL, affinity + AFFINITY_DECAY_PER_DAY * d);
  return AFFINITY_NEUTRAL;
}

/** The affinity a founder effectively holds toward `other` on
 *  `day` — the stored value decayed by the days since it was last
 *  touched. Pure; the stored value is never rewritten by a read. */
export function effectiveAffinity(social: FounderSocial, other: string, day: number): number {
  const stored = social.affinity[other];
  if (stored === undefined) return AFFINITY_NEUTRAL;
  const lastDay = social.affinityDay[other] ?? 0;
  return pullTowardNeutral(stored, Math.max(0, Math.floor(day) - lastDay));
}

/**
 * Record a shared event: decay the stored affinity first (lazy
 * decay by the days since it was last touched), then apply the
 * type's bump, clamp 0..100, stamp the day; append the memory,
 * prune memories older than 30 days, cap at 12 (oldest first out).
 * Returns a NEW social state (the caller's is untouched). Pure.
 */
export function recordSharedEvent(
  social: FounderSocial,
  other: string,
  type: SharedEventType,
  day: number,
  abs: number,
): FounderSocial {
  const d = Math.max(0, Math.floor(day));
  const decayed = pullTowardNeutral(social.affinity[other] ?? AFFINITY_NEUTRAL, d - (social.affinityDay[other] ?? 0));
  const bumped = Math.max(0, Math.min(100, decayed + AFFINITY_BUMP[type]));
  const memories = [
    ...social.memories.filter((m) => d - m.day <= MEMORY_MAX_AGE_DAYS),
    { type, other, day: d, abs },
  ];
  while (memories.length > MEMORY_CAP) memories.shift();
  return {
    affinity: { ...social.affinity, [other]: bumped },
    affinityDay: { ...social.affinityDay, [other]: d },
    memories,
  };
}

/** The founder this founder is closest to (highest effective
 *  affinity on `day`), or null when there is nobody to compare.
 *  Ties go to the first name in insertion order — deterministic
 *  (the affinity map is built in FOUNDER_NAMES order minus self). */
export function closestFounder(
  social: FounderSocial,
  day: number,
): { name: string; affinity: number } | null {
  let best: { name: string; affinity: number } | null = null;
  for (const name of Object.keys(social.affinity)) {
    const a = effectiveAffinity(social, name, day);
    if (!best || a > best.affinity) best = { name, affinity: a };
  }
  return best;
}

/** How many times this founder shared each event type with
 *  `other` — the counts the E report shows. Pure. */
export function memoryCountsFor(
  social: FounderSocial,
  other: string,
): Record<SharedEventType, number> {
  const counts: Record<SharedEventType, number> = { build: 0, eat: 0, rest: 0, sleep: 0 };
  for (const m of social.memories) {
    if (m.other === other) counts[m.type]++;
  }
  return counts;
}

/**
 * A tile beside the companion to rest on: the first walkable
 * orthogonal tile adjacent to `companionPos` that is not already
 * taken by another resting founder, in the fixed order north,
 * west, east, south — deterministic. Falls back to `fallback`
 * (the camp centre) when no adjacent tile is free. `walkable` is
 * a callback so this stays pure and testable (the view passes
 * npcWalkable).
 */
export function restTileFor(
  companionPos: { x: number; y: number },
  taken: ReadonlySet<string>,
  walkable: (x: number, y: number) => boolean,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  const candidates = [
    { x: companionPos.x, y: companionPos.y - 1 },
    { x: companionPos.x - 1, y: companionPos.y },
    { x: companionPos.x + 1, y: companionPos.y },
    { x: companionPos.x, y: companionPos.y + 1 },
  ];
  for (const c of candidates) {
    if (taken.has(c.x + ',' + c.y)) continue;
    if (walkable(c.x, c.y)) return c;
  }
  return fallback;
}
