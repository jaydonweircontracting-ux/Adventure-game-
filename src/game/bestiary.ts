/**
 * BUILD 938: creature codex / bestiary (Tibia portable item 5 of 5).
 *
 * Adapted from the Forgotten Server bestiary grammar
 * (~/workspace/rea-targets/tibia/ANALYSIS.md §5 + §10 survey) — the RULES
 * only, never Tibia content, names, or code. Each creature type carries
 * tier thresholds (prowess / expertise / mastery kill counts), a
 * charm-point value, a difficulty label, and an occurrence label.
 *
 * What the analysis documents, exactly: one worked example — dragon:
 * prowess 50, expertise 500, mastery 1000, charm points 50, difficulty
 * medium, occurrence common. It documents NO other per-type thresholds.
 * This module therefore applies that one documented scale UNIFORMLY to
 * every type (stated adaptation, not Tibia per-type data): every kind
 * needs 50 / 500 / 1000 kills, and mastery awards 50 charm points once.
 * The analysis gives a per-type charm value with no per-tier split, so
 * the award lands at entry completion (mastery), not per tier.
 *
 * Difficulty and occurrence are NOT Tibia's labels copied over (Tibia's
 * own dragon-medium datum is not a rule). They are derived from THIS
 * game's spawn data by stated rules:
 * - difficulty from combat weight (field hpMult in monstersForChunk /
 *   MONSTER_SPAWN_TABLE; goat and wildlife kinds use the base 1.0):
 *   hpMult >= 2.5 (or a boss kind) -> hard; >= 1.1 -> medium;
 *   >= 0.7 -> easy; below -> trivial. Direwolf is hard as the boss
 *   kind (10x HP, BUILD 477), not by hpMult.
 * - occurrence from spawn gates: danger-3 gated or boss -> rare;
 *   danger-2 gated, or an extra gate (road + coin flip for soldiers)
 *   -> uncommon; danger-1 or ambient-pool kinds -> common.
 *
 * Codex universe: every kind in the 934 behavior table and the 935
 * mitigation table (21 kinds — the two tables share keys, asserted in
 * the sim), PLUS the three wildlife-only kinds that flow through the
 * wired wildlife kill branch (fox, bear, crab). Rabbit is omitted on
 * purpose: its spawns are commented out (sprites glitched), so it
 * cannot currently be killed and a rabbit entry would be fake.
 * Dungeon creatures are NOT in the codex: the dungeon is a separate
 * engine and its kills never reach the counting call sites.
 *
 * Tier rewards are DISPLAY ONLY. There are no combat bonuses, drop-rate
 * boosts, or damage modifiers tied to tiers, and charm points are a
 * TRACKED TOTAL ONLY — no charm effects, purchases, or shop exist.
 * The codex panel says both things in plain text so no player reads a
 * bonus into a tier name.
 *
 * Counting rule: PLAYER kills only. The counting hook is called from
 * the player-attack kill branches alone (monster, goat, cellar rat,
 * wildlife). NPC-vs-creature kills (BUILD 915) never touch those
 * branches, so they cannot count — by construction, not by filter.
 * Counts start at 0 for this build: no retroactive data exists and
 * none is faked. Tiers and charm totals are DERIVED from counts, so
 * only counts are persisted; a corrupted or unknown key can never
 * desync a tier from its count.
 *
 * Undiscovered presentation: a kind with 0 kills renders as "???" with
 * "Undiscovered — defeat one to reveal it." and no stats. The first
 * kill reveals the full entry (name, count, tier progress, difficulty,
 * occurrence). Variants share their kind's entry: a monster wolf with
 * the 'dire' variant counts as wolf; only goat-kind direwolf kills
 * count toward the direwolf entry.
 */

export type BestiaryDifficulty = 'trivial' | 'easy' | 'medium' | 'hard';
export type BestiaryOccurrence = 'common' | 'uncommon' | 'rare';

export type BestiaryEntry = {
  kind: string;
  difficulty: BestiaryDifficulty;
  occurrence: BestiaryOccurrence;
};

/** Tier thresholds: the analysis's documented dragon scale, applied uniformly. */
export const BESTIARY_TIERS = [
  { name: 'Prowess', kills: 50 },
  { name: 'Expertise', kills: 500 },
  { name: 'Mastery', kills: 1000 },
] as const;

/** Charm points awarded once, at mastery (entry completion). */
export const BESTIARY_CHARM_POINTS = 50;

/**
 * The 24 codex kinds: 21 behavior/mitigation table kinds + 3
 * wildlife-only kinds (fox, bear, crab). Order is display order.
 */
export const BESTIARY_ENTRIES: BestiaryEntry[] = [
  // Behavior/mitigation table kinds (934/935).
  { kind: 'rat', difficulty: 'trivial', occurrence: 'common' },
  { kind: 'bat', difficulty: 'trivial', occurrence: 'common' },
  { kind: 'snake', difficulty: 'trivial', occurrence: 'common' },
  { kind: 'slime', difficulty: 'trivial', occurrence: 'common' },
  { kind: 'spider', difficulty: 'easy', occurrence: 'uncommon' },
  { kind: 'goblin', difficulty: 'easy', occurrence: 'uncommon' },
  { kind: 'wolf', difficulty: 'easy', occurrence: 'common' },
  { kind: 'skeleton', difficulty: 'easy', occurrence: 'uncommon' },
  { kind: 'elf', difficulty: 'easy', occurrence: 'uncommon' },
  { kind: 'goat', difficulty: 'easy', occurrence: 'common' },
  { kind: 'deer', difficulty: 'easy', occurrence: 'common' },
  { kind: 'boar', difficulty: 'easy', occurrence: 'common' },
  { kind: 'badger', difficulty: 'easy', occurrence: 'common' },
  { kind: 'soldier', difficulty: 'medium', occurrence: 'uncommon' },
  { kind: 'bandit', difficulty: 'medium', occurrence: 'common' },
  { kind: 'dwarf', difficulty: 'medium', occurrence: 'uncommon' },
  { kind: 'orc', difficulty: 'medium', occurrence: 'uncommon' },
  { kind: 'direwolf', difficulty: 'hard', occurrence: 'rare' },
  { kind: 'troll', difficulty: 'hard', occurrence: 'rare' },
  { kind: 'ogre', difficulty: 'hard', occurrence: 'rare' },
  { kind: 'dragon', difficulty: 'hard', occurrence: 'rare' },
  // Wildlife-only kinds (no behavior/mitigation entry, but killable
  // through the wired wildlife branch; base weight 1.0 -> easy).
  { kind: 'fox', difficulty: 'easy', occurrence: 'common' },
  { kind: 'bear', difficulty: 'easy', occurrence: 'uncommon' },
  { kind: 'crab', difficulty: 'easy', occurrence: 'common' },
];

const BESTIARY_BY_KIND = new Map<string, BestiaryEntry>(
  BESTIARY_ENTRIES.map((e) => [e.kind, e]),
);

/** Display label for a kind ('direwolf' -> 'Direwolf'). */
export function bestiaryLabelForKind(kind: string): string {
  const k = (kind || '').toLowerCase();
  return k ? k[0].toUpperCase() + k.slice(1) : 'Creature';
}

/** True when the kind has a codex entry. Unknown kinds never count. */
export function isBestiaryKind(kind: string | undefined | null): boolean {
  if (!kind) return false;
  return BESTIARY_BY_KIND.has(kind.toLowerCase());
}

export function bestiaryEntryForKind(kind: string): BestiaryEntry | undefined {
  return BESTIARY_BY_KIND.get(kind.toLowerCase());
}

export type BestiaryTierProgress = {
  /** Reached tier name, or null before the first threshold. */
  tier: string | null;
  /** Index into BESTIARY_TIERS of the reached tier, or -1. */
  tierIndex: number;
  /** Next tier to reach, or null at mastery. */
  nextTier: { name: string; kills: number } | null;
};

/** Tier progress for a kill count. Thresholds are inclusive: 50 kills IS prowess. */
export function bestiaryTierForKills(kills: number): BestiaryTierProgress {
  const k = Math.max(0, Math.floor(kills) || 0);
  let tierIndex = -1;
  for (let i = 0; i < BESTIARY_TIERS.length; i++) {
    if (k >= BESTIARY_TIERS[i].kills) tierIndex = i;
  }
  return {
    tier: tierIndex >= 0 ? BESTIARY_TIERS[tierIndex].name : null,
    tierIndex,
    nextTier: tierIndex + 1 < BESTIARY_TIERS.length
      ? { name: BESTIARY_TIERS[tierIndex + 1].name, kills: BESTIARY_TIERS[tierIndex + 1].kills }
      : null,
  };
}

/** Charm total: 50 per mastered entry (mastery = 1000 kills), nothing else. */
export function bestiaryCharmTotal(counts: Record<string, number>): number {
  let mastered = 0;
  for (const entry of BESTIARY_ENTRIES) {
    if ((counts[entry.kind] || 0) >= BESTIARY_TIERS[2].kills) mastered++;
  }
  return mastered * BESTIARY_CHARM_POINTS;
}

export type BestiaryKillResult = {
  counts: Record<string, number>;
  /** True when this kill discovered the kind (0 -> 1). */
  discovered: boolean;
  /** Tier name just reached, or null when no threshold was crossed. */
  tierReached: string | null;
};

/**
 * Pure kill recording: increments one kind's count. Unknown kinds are
 * ignored (returned unchanged) so a stray species string can never
 * invent an entry. The caller owns logging and persistence.
 */
export function recordBestiaryKill(
  counts: Record<string, number>,
  kind: string | undefined | null,
): BestiaryKillResult {
  const key = (kind || '').toLowerCase();
  if (!isBestiaryKind(key)) return { counts, discovered: false, tierReached: null };
  const prev = Math.max(0, Math.floor(counts[key] || 0));
  const next = prev + 1;
  const prevTier = bestiaryTierForKills(prev).tier;
  const nextTier = bestiaryTierForKills(next).tier;
  return {
    counts: { ...counts, [key]: next },
    discovered: prev === 0,
    tierReached: nextTier !== prevTier ? nextTier : null,
  };
}

/**
 * Load sanitizer: keeps only known kinds, finite integers >= 0.
 * Unknown keys (typos, removed kinds, tampered saves) are dropped.
 */
export function sanitizeBestiaryCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = key.toLowerCase();
    if (!isBestiaryKind(k)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[k] = Math.max(0, Math.floor(value));
  }
  return out;
}
