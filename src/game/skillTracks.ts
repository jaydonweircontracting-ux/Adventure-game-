// BUILD 971: Skill tracks (extras 3/6) — tries-based skill multipliers per
// archetype + a separate magic-level track fed by casting.
//
// RULES ONLY, adapted from the Tibia analysis (tries counters, per-vocation
// effort multipliers, magic level fed by mana spent). No source-game names,
// items, or content; all numbers below are original to this game.
//
// WHAT THIS IS NOT:
// - NOT Alternate Advancement (BUILD 941). AA is a kill-credit parallel
//   track: credits come from player kills, points buy fixed abilities
//   (Toughness / Heavy Blows / Deadeye / Strong Back). Skill tracks share
//   no state with AA: tries come from gathering actions, magic level comes
//   from mana spent casting. Different sources, different effects.
// - NOT a second skill-level system. The game stores skill XP and derives
//   skill levels from XP (BUILD 595); that stays authoritative. A "try" is
//   one real successful skill action that already grants XP through the
//   awardSkillXp funnel (an ore mined, a tree felled). Tries are recorded
//   inside that funnel and nowhere else, so no code path can mint them:
//   never for clicks, menu opens, dialogue, or shop buys.
// - NOT a crafting/fishing/mining invention. Only mining and woodcutting
//   accumulate tries today, because they are the only awardSkillXp call
//   sites. Fishing, smithing, crafting, and cooking multipliers are
//   defined below but DORMANT: they take effect automatically the moment a
//   real XP-granting action for that skill lands. The smith-crafting UI
//   exists but grants no skill XP today, and this build deliberately does
//   NOT wire it — changing the smith flow's observable behavior belongs
//   to its own decision, not to a tracks build.
//
// TRIES MULTIPLIERS (Tibia shape: higher = more tries required = slower):
// The game stores XP with a fixed XP-per-level curve, so the multiplier
// lands on XP per try: effective = round(base x apprenticeBonus / mult).
// Dividing XP-per-try by m is exactly equivalent to requiring m x tries
// per level. Beginner is 1.0 everywhere, so pre-level-10 progression is
// byte-identical to BUILD 970 — the multiplier only bites after a class
// choice at level 10. Rationale per row: physical classes work physical
// skills at full rate; Mages are slowest at manual labor; Rogues and
// Archers, who live outdoors, work wood at full rate.
//
// MAGIC LEVEL (separate track, fed by mana spent — never by XP):
// Level derives from TOTAL mana spent casting, like skill levels derive
// from XP: required(L) = floor(40 x (1.6^(L-1) - 1) / 0.6), so L1 = 0,
// L2 = 40, L3 = 104, L4 = 206, L5 = 370, L6 = 632 spent mana. Each level
// above 1 grants +2 max mana — the same unit as INT's +2, landing in the
// existing mana slot. Magic level NEVER changes spell numbers, mitigation,
// or normal XP. It is fed ONLY by overworld Mage casting, where mana is
// actually spent (fizzles spend nothing, so they feed nothing: spendMana
// runs only after target/destination validation). Dungeon casting does
// NOT feed it: the Stone Soup engine is a separate transient engine with
// its own mp pool and fizzle refunds, and no reporting channel to the
// overworld save exists — threading one would change shared dungeon
// behavior inside a skill build, so it is stated, not silently built.

import { maxManaForInt } from './classes';

export type SkillArchetype = 'Beginner' | 'Warrior' | 'Mage' | 'Rogue' | 'Archer';

/** Skills with a defined multiplier row (mirrors SKILLS in skills.ts). */
export const TRACKED_SKILL_IDS = ['woodcutting', 'mining', 'fishing', 'smithing', 'crafting', 'cooking'] as const;
export type TrackedSkillId = (typeof TRACKED_SKILL_IDS)[number];

/** Skills that accumulate tries today (the only awardSkillXp call sites). */
export const LIVE_TRY_SKILLS: readonly TrackedSkillId[] = ['mining', 'woodcutting'];

/**
 * Effort multipliers per class per skill. 1.0 = full XP per try.
 * Higher = slower (more tries per level). Beginner is 1.0 everywhere.
 */
export const TRY_MULTIPLIERS: Record<SkillArchetype, Record<TrackedSkillId, number>> = {
  Beginner: { woodcutting: 1.0, mining: 1.0, fishing: 1.0, smithing: 1.0, crafting: 1.0, cooking: 1.0 },
  Warrior: { woodcutting: 1.0, mining: 1.0, fishing: 1.5, smithing: 1.0, crafting: 1.25, cooking: 1.5 },
  Mage: { woodcutting: 2.0, mining: 2.0, fishing: 1.5, smithing: 2.0, crafting: 1.5, cooking: 1.5 },
  Rogue: { woodcutting: 1.0, mining: 1.25, fishing: 1.25, smithing: 1.5, crafting: 1.0, cooking: 1.25 },
  Archer: { woodcutting: 1.0, mining: 1.5, fishing: 1.0, smithing: 1.5, crafting: 1.25, cooking: 1.25 },
};

/** Effort multiplier for a class/skill pair; unknown pairs default to 1.0. */
export function tryMultiplierFor(playerClass: string, skillId: string): number {
  const row = TRY_MULTIPLIERS[playerClass as SkillArchetype];
  if (!row) return 1.0;
  const mult = row[skillId as TrackedSkillId];
  return typeof mult === 'number' && Number.isFinite(mult) && mult > 0 ? mult : 1.0;
}

/**
 * Effective XP for one successful skill action: base x apprentice bonus,
 * divided by the class effort multiplier. Never negative, always an int.
 */
export function effectiveSkillXp(baseXp: number, playerClass: string, skillId: string, apprenticeBonus: number): number {
  const base = Math.max(0, Math.floor(baseXp));
  const bonus = typeof apprenticeBonus === 'number' && Number.isFinite(apprenticeBonus) && apprenticeBonus > 0 ? apprenticeBonus : 1;
  return Math.max(0, Math.round((base * bonus) / tryMultiplierFor(playerClass, skillId)));
}

/** Pure: record one try for a skill. Unknown skill ids are ignored. */
export function recordSkillTry(tries: Record<string, number>, skillId: string): Record<string, number> {
  if (!(TRACKED_SKILL_IDS as readonly string[]).includes(skillId)) return tries;
  return { ...tries, [skillId]: Math.max(0, Math.floor(tries[skillId] ?? 0)) + 1 };
}

/** Sanitize a loaded tries record: known skills only, non-negative ints. */
export function sanitizeSkillTries(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [id, n] of Object.entries(value as Record<string, unknown>)) {
    if (!(TRACKED_SKILL_IDS as readonly string[]).includes(id)) continue;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) continue;
    const count = Math.floor(n);
    if (count > 0) out[id] = count;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Magic level: derived from total mana spent casting (overworld only).
// ---------------------------------------------------------------------------

/** Mana that must have been spent, in total, to REACH the given level. */
export function magicManaRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor((40 * (Math.pow(1.6, level - 1) - 1)) / 0.6);
}

/** Magic level for a total-mana-spent figure. Level 1 at 0 spent. */
export function magicLevelForManaSpent(spent: number): number {
  const total = Math.max(0, Math.floor(spent));
  let level = 1;
  while (magicManaRequiredForLevel(level + 1) <= total) level += 1;
  return level;
}

/** Progress toward the next magic level, 0..1 (derived, never stored). */
export function magicLevelProgress(spent: number): { level: number; spent: number; needed: number; progress: number } {
  const level = magicLevelForManaSpent(spent);
  const current = magicManaRequiredForLevel(level);
  const next = magicManaRequiredForLevel(level + 1);
  const total = Math.max(0, Math.floor(spent));
  return {
    level,
    spent: total,
    needed: next - total,
    progress: Math.max(0, Math.min(1, (total - current) / (next - current))),
  };
}

/** Max-mana bonus from magic level: +2 per level above 1. */
export function magicManaBonus(level: number): number {
  return Math.max(0, Math.floor(level) - 1) * 2;
}

/** Full overworld max mana: INT-derived base + magic-level bonus. */
export function maxManaForPlayer(intelligence: number, magicLevel: number): number {
  return maxManaForInt(intelligence) + magicManaBonus(magicLevel);
}

/** Sanitize a loaded total-mana-spent figure. Old saves carry no field. */
export function sanitizeMagicManaSpent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(10000000, Math.floor(value));
}
