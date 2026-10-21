/**
 * BUILD 935: two-stage mitigation + continuous element percents +
 * immunities + ranged falloff (Tibia portable item 2 of 5).
 *
 * Adapted from the Forgotten Server combat grammar
 * (~/workspace/rea-targets/tibia/ANALYSIS.md §2) — the RULES only, never
 * Tibia content, names, or code. The game's element chart
 * (elements.ts, 2.0/0.5) is NOT rebuilt; these four parts plug into
 * src/game/combat.ts's callers without touching the chart:
 *
 * 1. Two-stage mitigation (Tibia blockHit): a DEFENSE roll, then an
 *    ARMOR roll, in that order, never reversed. Defense subtracts
 *    uniform(defense/2, defense); if that zeroes the hit, the armor
 *    roll is SKIPPED (full block). Armor subtracts
 *    uniform(armor/2, armor - (armor % 2 + 1)) when armor > 3, else 1
 *    when armor > 0, else 0. Tibia gates the defense roll on a
 *    "defense charge"; this game has no charges, so the roll is
 *    always available when defense > 0 (stated simplification).
 * 2. Continuous per-creature element percents (Tibia monsters/*.xml
 *    earthPercent etc.): positive = resist, NEGATIVE = vulnerability
 *    (damage amplified). Applies to the attacker's element only;
 *    physical ('none') attacks skip the percent step.
 * 3. Immunity flags, checked BEFORE percents: an immune defender
 *    takes 0 from that element no matter what percent it also has.
 * 4. Ranged hit-chance falloff by distance band (Tibia
 *    WeaponDistance::useWeapon): close band uses the range-1 formula
 *    min(skill,74)+1, the mid band uses the range-2 formula
 *    min(skill,28)*2.40+8, the far band uses the range-5 formula
 *    (same as range 1), all capped at 75% — the one-handed cap, since
 *    this game has no one-handed/two-handed distance-weapon
 *    distinction. Bands are in field units, anchored to the game's own
 *    archer volley band (7..30u): close <= 8, mid 8..18 (archers hold
 *    ~14u, the sweet spot), far > 18. Skill is normalized to Tibia's
 *    0..100 scale: player dex * 5 (dex 4..20 -> 20..100); creature
 *    archers use 40 + level * 5 (base competence 40, so a level-1
 *    archer is not harmless). Ranges 3/4/6+ have no formula in the
 *    analysis — the far band covers everything beyond mid, stated.
 *
 * Game-scale conversions (stated, not hidden):
 * - Creature defense/armor come from LEVEL (no per-creature defense
 *   or armor stat exists): defense = level, armor = level.
 * - Player defense: 0. The player has NO defense stat (shields
 *   contribute armor, not defense) — the defense roll simply does
 *   not fire for the player.
 * - Player armor: the game's equipment armor totals run ~4x Tibia's
 *   (a full set is ~47 vs Tibia's ~15), so the roll uses
 *   floor(totalArmor / 4). Without the conversion a geared player
 *   would block nearly every creature hit (avg armor roll ~34 vs
 *   ~15 damage). The divisor is a scale conversion, measured in
 *   the standalone sweep — it is NOT a rebalance of any stat.
 * - Player element resists come from the EXISTING ItemStats resist
 *   fractions (fireResist/iceResist/lightningResist, 0..1), summed
 *   across equipment and clamped to [0, 90] percent. poisonResist
 *   has no element in elements.ts (poison is not an Element), so it
 *   is ignored — stated, not silently mapped.
 * - Overworld player attacks are physical ('none'): no overworld
 *   player attack carries an element (elemental affix stats exist
 *   but are not applied to damage today, and activating them is out
 *   of scope). So per-kind percents bite live on the
 *   creature->player direction (dragon fire vs player resists) and
 *   stand ready for elemental attackers; the two-stage rolls bite
 *   in both directions. NPC defenders carry no combat armor stat
 *   (their gear armor feeds the economy score, not combat), so
 *   creature->NPC damage routes through the pipeline with identity
 *   values (0/0, no percents) and is unchanged by construction.
 *   Player->NPC and NPC->player (fight-back) damage are NOT routed
 *   (not in the ported set) and are unchanged.
 *
 * Rolls: runtime uses Math.random (same as the existing crit rolls).
 * Every function takes an injectable roll so standalone asserts can
 * stage exact values and prove order (defense before armor).
 */

import type { Element } from './elements';

/** Per-kind mitigation data: element percents, immunities, attack element. */
export type CreatureMitigation = {
  /** Continuous percent per attacking element. +resist, -vulnerability. */
  elementPercents: Partial<Record<Element, number>>;
  /** Full immunities — checked before percents. */
  immunities: Element[];
  /** Element this kind's attacks deal ('none' = physical). */
  attackElement: Element;
};

const DEFAULT_MITIGATION: CreatureMitigation = {
  elementPercents: {},
  immunities: [],
  attackElement: 'none',
};

/**
 * Per-kind mitigation table. Same keying as the 934 behavior table
 * (kind keys, case-insensitive lookup, default for unknown kinds) —
 * the standalone sweep asserts every behavior kind has an entry
 * here, so the two tables cannot drift apart silently. Values are
 * original flavor, not Tibia's: sparse on purpose — most kinds are
 * neutral and the rolls carry the differentiation.
 */
const MITIGATION_TABLE: Record<string, CreatureMitigation> = {
  slime: { elementPercents: { fire: -25 }, immunities: [], attackElement: 'none' },
  spider: { elementPercents: { fire: -15 }, immunities: [], attackElement: 'none' },
  skeleton: { elementPercents: { ice: 25 }, immunities: [], attackElement: 'none' },
  dragon: { elementPercents: { ice: -20 }, immunities: ['fire'], attackElement: 'fire' },
  troll: { elementPercents: { fire: -25 }, immunities: [], attackElement: 'none' },
  dwarf: { elementPercents: { fire: 25 }, immunities: [], attackElement: 'none' },
  snake: { elementPercents: { ice: -15 }, immunities: [], attackElement: 'none' },
  wolf: { ...DEFAULT_MITIGATION },
  direwolf: { ...DEFAULT_MITIGATION },
  rat: { ...DEFAULT_MITIGATION },
  bat: { ...DEFAULT_MITIGATION },
  goblin: { ...DEFAULT_MITIGATION },
  bandit: { ...DEFAULT_MITIGATION },
  orc: { ...DEFAULT_MITIGATION },
  ogre: { ...DEFAULT_MITIGATION },
  elf: { ...DEFAULT_MITIGATION },
  soldier: { ...DEFAULT_MITIGATION },
  goat: { ...DEFAULT_MITIGATION },
  deer: { ...DEFAULT_MITIGATION },
  boar: { ...DEFAULT_MITIGATION },
  badger: { ...DEFAULT_MITIGATION },
};

/** Mitigation data for a creature kind (case-insensitive). Unknown kinds get the default. */
export function mitigationForCreature(kind: string | undefined): CreatureMitigation {
  if (!kind) return DEFAULT_MITIGATION;
  return MITIGATION_TABLE[kind.toLowerCase()] ?? DEFAULT_MITIGATION;
}

/** All shipped kind keys (for sweeps asserting table invariants). */
export function mitigationKindKeys(): string[] {
  return Object.keys(MITIGATION_TABLE);
}

/** Creature defense value: level (no per-creature defense stat exists). */
export function creatureDefenseForLevel(level: number): number {
  return Math.max(0, Math.floor(level));
}

/** Creature armor value: level (no per-creature armor stat exists). */
export function creatureArmorForLevel(level: number): number {
  return Math.max(0, Math.floor(level));
}

/** Player armor value for the roll: equipment total converted to Tibia scale (see header). */
export function playerArmorForRoll(totalEquipmentArmor: number): number {
  return Math.max(0, Math.floor((totalEquipmentArmor ?? 0) / 4));
}

/**
 * Player element resist percents from equipment resist fractions
 * (ItemStats fireResist/iceResist/lightningResist, 0..1 each, summed
 * across equipment). Clamped to [0, 90] — no gear combination may
 * reach full immunity through resists.
 */
export function playerResistPercents(resists: {
  fireResist?: number;
  iceResist?: number;
  lightningResist?: number;
}): Partial<Record<Element, number>> {
  const clamp = (v: number | undefined): number =>
    Math.max(0, Math.min(90, Math.round((v ?? 0) * 100)));
  const out: Partial<Record<Element, number>> = {};
  const fire = clamp(resists.fireResist);
  const ice = clamp(resists.iceResist);
  const lightning = clamp(resists.lightningResist);
  if (fire > 0) out.fire = fire;
  if (ice > 0) out.ice = ice;
  if (lightning > 0) out.lightning = lightning;
  return out;
}

export type MitigateInput = {
  /** Pre-mitigation damage (>= 0). */
  raw: number;
  /** Attacker's element ('none' = physical, skips the percent step). */
  attackerElement?: Element;
  /** Defender's element percents (positive = resist, negative = vulnerability). */
  percents?: Partial<Record<Element, number>>;
  /** Defender's immunities (checked before percents). */
  immunities?: readonly Element[];
  /** Defender's defense value (0 = no defense roll). */
  defense?: number;
  /** Defender's armor value (0 = no armor roll). */
  armor?: number;
  /** Roll source returning [0, 1). Defaults to Math.random. */
  roll?: () => number;
};

export type MitigateResult = {
  /** Final damage (>= 0). */
  damage: number;
  /** True when the hit was fully blocked (defense or armor zeroed it). */
  blocked: boolean;
  /** True when immunity zeroed the hit (before percents). */
  immune: boolean;
};

/**
 * The one mitigation pipeline. Order is contractual and asserted:
 * immunity -> element percent -> defense roll -> armor roll.
 * With defense 0, armor 0, no percents, and a 'none' attack, this is
 * the identity function — that is how NPC defenders (no combat armor
 * stat) route through unchanged.
 */
export function mitigateDamage(input: MitigateInput): MitigateResult {
  const {
    raw,
    attackerElement = 'none',
    percents,
    immunities = [],
    defense = 0,
    armor = 0,
    roll = Math.random,
  } = input;
  if (raw <= 0) return { damage: 0, blocked: true, immune: false };
  if (attackerElement !== 'none' && immunities.includes(attackerElement)) {
    return { damage: 0, blocked: true, immune: true };
  }
  let damage = raw;
  if (attackerElement !== 'none') {
    const pct = percents?.[attackerElement] ?? 0;
    if (pct !== 0) damage = damage * (1 - pct / 100);
    if (damage <= 0) return { damage: 0, blocked: true, immune: false };
  }
  if (defense > 0) {
    // uniform(defense/2, defense)
    damage -= defense / 2 + roll() * (defense / 2);
    if (damage <= 0) return { damage: 0, blocked: true, immune: false };
  }
  if (armor > 3) {
    const lo = armor / 2;
    const hi = armor - ((armor % 2) + 1);
    damage -= lo + roll() * Math.max(0, hi - lo);
  } else if (armor > 0) {
    damage -= 1;
  }
  if (damage <= 0) return { damage: 0, blocked: true, immune: false };
  return { damage, blocked: false, immune: false };
}

/** Ranged falloff band for a distance in field units. */
export type RangedBand = 'close' | 'mid' | 'far';

export function rangedBandFor(distance: number): RangedBand {
  if (distance <= 8) return 'close';
  if (distance <= 18) return 'mid';
  return 'far';
}

/** One-handed cap: the game has no two-handed distance weapons. */
export const RANGED_HIT_CHANCE_CAP = 75;

/**
 * Normalize a raw skill stat to Tibia's 0..100 scale.
 * Player: dex * 5 (dex 4..20 -> 20..100). Creature archers pass
 * 40 + level * 5 directly (base competence 40).
 */
export function normalizeRangedSkill(rawSkill: number): number {
  return Math.max(0, Math.min(100, rawSkill * 5));
}

export type RangedHitResult = {
  hit: boolean;
  /** 0..75 percent chance (before the roll). */
  chance: number;
  band: RangedBand;
};

/**
 * Distance-banded ranged hit chance (Tibia WeaponDistance::useWeapon,
 * adapted — see header). Close/far use min(skill,74)+1; mid uses
 * min(skill,28)*2.40+8; everything caps at 75%.
 */
export function rangedHitChance(
  distance: number,
  skillNorm: number,
  roll: () => number = Math.random,
): RangedHitResult {
  const band = rangedBandFor(distance);
  const s = Math.max(0, Math.min(100, skillNorm));
  const rawChance = band === 'mid' ? Math.min(s, 28) * 2.4 + 8 : Math.min(s, 74) + 1;
  const chance = Math.min(RANGED_HIT_CHANCE_CAP, rawChance);
  return { hit: roll() * 100 < chance, chance, band };
}

/** Creature archer skill on the 0..100 scale (base competence 40 + level). */
export function creatureArcherSkill(level: number): number {
  return Math.max(0, Math.min(100, 40 + Math.max(0, Math.floor(level)) * 5));
}
