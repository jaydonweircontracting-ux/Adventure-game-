// BUILD 941: Alternate Advancement (EQEmu item 3) — rules only, no EQ
// content. A SEPARATE AA XP pool that accrues alongside normal XP, never
// instead of it: normal XP, levels, and level-up rewards are untouched.
// The game has NO level cap (level = floor(xp/100)+1, uncapped), so AA is
// a PARALLEL track available alongside levels, not post-cap progression —
// no cap was invented to justify it. The game also has NO consider-color
// system, so the EQEmu color scale is adapted honestly to a victim-level
// vs player-level delta scale (named by delta, never presented as EQEmu
// colors): trivial kills pay 0, weaker kills pay less, stronger pay more.
// Unit: 20 even-match kills per AA point (100 credits, 5 per even kill).

export type AaState = {
  /** Weighted kill credits toward the next point; always 0..99. */
  credits: number;
  /** Unspent AA points. */
  points: number;
  /** Total AA points ever spent (drives titles; no refunds exist). */
  spent: number;
  /** Purchased ranks by ability id. */
  ranks: Record<string, number>;
};

export const AA_CREDITS_PER_POINT = 100;

/** Even-match kills per AA point (100 credits / 5 per even kill). */
export const AA_EVEN_KILLS_PER_POINT = 20;

/**
 * Credits for one player kill, by victim level minus player level.
 * Delta <= -6 is trivial (EQEmu gray-con equivalent): 0 credits.
 * Weaker kills pay less, even kills pay the base rate, stronger pay more.
 */
export function aaCreditsForKill(victimLevel: number, playerLevel: number): number {
  const d = Math.floor(victimLevel) - Math.floor(playerLevel);
  if (d <= -6) return 0;
  if (d <= -3) return 2;
  if (d <= -1) return 4;
  if (d === 0) return 5;
  if (d <= 2) return 7;
  return 10;
}

/** Pure: accrue one player kill into the AA pool. */
export function accrueAaKill(
  state: AaState,
  victimLevel: number,
  playerLevel: number,
): { state: AaState; pointsGained: number } {
  const credits = aaCreditsForKill(victimLevel, playerLevel);
  if (credits === 0) return { state, pointsGained: 0 };
  let total = state.credits + credits;
  let points = state.points;
  let gained = 0;
  while (total >= AA_CREDITS_PER_POINT) {
    total -= AA_CREDITS_PER_POINT;
    points += 1;
    gained += 1;
  }
  return { state: { ...state, credits: total, points }, pointsGained: gained };
}

export type AaAbility = {
  id: string;
  name: string;
  /** Player-facing per-rank effect text. */
  effect: string;
  maxRank: number;
  /** Per-rank bonus. Every field is an EXISTING player value. */
  perRank: { maxHp: number; damage: number; crit: number; carry: number };
};

/**
 * The full ability list. Every ability modifies an existing player value
 * only: max HP (playerMaxHpForStats), damage (playerDamageForStats),
 * crit chance (playerCriticalChanceForStats), carry capacity
 * (carryCapacity). No new stats, no new combat mechanics. No INT-based
 * ability exists on purpose: INT feeds the normal-XP bonus, and AA must
 * never change normal XP. No DEX ability either: DEX feeds 935 ranged
 * falloff, and AA stays out of the mitigation pipeline.
 */
export const AA_ABILITIES: AaAbility[] = [
  { id: 'toughness', name: 'Toughness', effect: '+10 max health per rank', maxRank: 5, perRank: { maxHp: 10, damage: 0, crit: 0, carry: 0 } },
  { id: 'power', name: 'Heavy Blows', effect: '+1 damage per rank', maxRank: 5, perRank: { maxHp: 0, damage: 1, crit: 0, carry: 0 } },
  { id: 'precision', name: 'Deadeye', effect: '+1% critical chance per rank', maxRank: 5, perRank: { maxHp: 0, damage: 0, crit: 0.01, carry: 0 } },
  { id: 'burden', name: 'Strong Back', effect: '+8 carry capacity per rank', maxRank: 5, perRank: { maxHp: 0, damage: 0, crit: 0, carry: 8 } },
];

export function aaAbilityById(id: string): AaAbility | undefined {
  return AA_ABILITIES.find((a) => a.id === id);
}

/** Cost of buying the given 1-based rank: rank 1 costs 1, rank 2 costs 2, ... */
export function aaCostForRank(rank: number): number {
  return Math.max(1, Math.floor(rank));
}

export type AaBonuses = { maxHp: number; damage: number; crit: number; carry: number };

export function aaBonusesForRanks(ranks: Record<string, number>): AaBonuses {
  const out: AaBonuses = { maxHp: 0, damage: 0, crit: 0, carry: 0 };
  for (const ability of AA_ABILITIES) {
    const rank = Math.max(0, Math.min(ability.maxRank, Math.floor(ranks[ability.id] ?? 0)));
    out.maxHp += ability.perRank.maxHp * rank;
    out.damage += ability.perRank.damage * rank;
    out.crit += ability.perRank.crit * rank;
    out.carry += ability.perRank.carry * rank;
  }
  return out;
}

/** Pure: buy the next rank of an ability. Cost deducted from points. */
export function aaBuyRank(
  state: AaState,
  abilityId: string,
): { state: AaState; ok: boolean; reason?: string } {
  const ability = aaAbilityById(abilityId);
  if (!ability) return { state, ok: false, reason: 'Unknown ability.' };
  const current = Math.floor(state.ranks[abilityId] ?? 0);
  if (current >= ability.maxRank) return { state, ok: false, reason: `${ability.name} is already at max rank.` };
  const cost = aaCostForRank(current + 1);
  if (state.points < cost) return { state, ok: false, reason: `Needs ${cost} AA points.` };
  return {
    state: {
      ...state,
      points: state.points - cost,
      spent: state.spent + cost,
      ranks: { ...state.ranks, [abilityId]: current + 1 },
    },
    ok: true,
  };
}

/**
 * Titles follow TOTAL SPEND (EQEmu's aapoints_spent rule), not owned
 * ranks — with no refunds the two agree, but spend is the stated key.
 * Names are original to this game's world (Mosslight, the Far Meadow);
 * no EQ titles are used. Display-only: titles change no numbers.
 */
export const AA_TITLES: { spent: number; title: string }[] = [
  { spent: 0, title: 'Wanderer' },
  { spent: 5, title: 'Wayfarer' },
  { spent: 15, title: 'Veteran of the Far Meadow' },
  { spent: 30, title: 'Champion of Mosslight' },
  { spent: 50, title: 'Legend of the Wilds' },
];

/** Highest title whose spend threshold is met. */
export function aaTitleForSpent(spent: number): string {
  let title = AA_TITLES[0].title;
  for (const entry of AA_TITLES) {
    if (spent >= entry.spent) title = entry.title;
  }
  return title;
}

export function createEmptyAa(): AaState {
  return { credits: 0, points: 0, spent: 0, ranks: {} };
}

/**
 * Sanitize a loaded AA state. Unknown ability ids are dropped, ranks are
 * clamped to their max, and credits overflow converts to points; spent is
 * recomputed from kept ranks (no refunds exist, so spend always equals
 * the cost of owned ranks). Malformed input yields an empty state.
 */
export function sanitizeAa(value: unknown): AaState {
  if (!value || typeof value !== 'object') return createEmptyAa();
  const raw = value as Partial<AaState>;
  let credits = typeof raw.credits === 'number' && Number.isFinite(raw.credits) ? Math.max(0, Math.floor(raw.credits)) : 0;
  let points = typeof raw.points === 'number' && Number.isFinite(raw.points) ? Math.max(0, Math.floor(raw.points)) : 0;
  points += Math.floor(credits / AA_CREDITS_PER_POINT);
  credits = credits % AA_CREDITS_PER_POINT;
  const ranks: Record<string, number> = {};
  if (raw.ranks && typeof raw.ranks === 'object') {
    for (const [id, rank] of Object.entries(raw.ranks)) {
      const ability = aaAbilityById(id);
      if (!ability || typeof rank !== 'number' || !Number.isFinite(rank)) continue;
      const clamped = Math.max(0, Math.min(ability.maxRank, Math.floor(rank)));
      if (clamped > 0) ranks[id] = clamped;
    }
  }
  let spent = 0;
  for (const [id, rank] of Object.entries(ranks)) {
    const ability = aaAbilityById(id);
    if (!ability) continue;
    for (let r = 1; r <= rank; r++) spent += aaCostForRank(r);
  }
  return { credits, points, spent, ranks };
}
