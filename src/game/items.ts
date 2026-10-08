// ARPG item system (BUILD 466 — Diablo-inspired Phase 1).
//
// Data-driven equipment with stats, quality tiers, and random affixes.
// This is the foundation for the loot → power → deeper dungeon loop.
//
// Design (from the master prompt):
// - Original items only (no copied Diablo assets/names).
// - Item = Base + Prefix + Suffix. Quality determines modifier count.
// - Stats are purposeful (§15): damage, armor, health, mana, crit, etc.
// - Weights control rarity (§18 of WFC prompt applies here too).
// - Deterministic generation from seed (for loot drops).

// ---------------------------------------------------------------------------
// Stats (§15)
// ---------------------------------------------------------------------------

export interface ItemStats {
  damage?: number;
  armor?: number;
  maxHealth?: number;
  maxMana?: number;
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  vitality?: number;
  attackSpeed?: number;    // multiplier, e.g. 0.1 = +10%
  critChance?: number;     // 0-1, e.g. 0.05 = +5%
  critDamage?: number;     // multiplier, e.g. 0.5 = +50%
  moveSpeed?: number;      // multiplier
  lifeSteal?: number;      // 0-1
  manaRegen?: number;      // per second
  fireDamage?: number;
  iceDamage?: number;
  lightningDamage?: number;
  fireResist?: number;     // 0-1
  iceResist?: number;
  lightningResist?: number;
  poisonResist?: number;
}

export type StatKey = keyof ItemStats;

// ---------------------------------------------------------------------------
// Quality tiers (§16)
// ---------------------------------------------------------------------------

export type ItemQuality = 'common' | 'uncommon' | 'rare' | 'epic' | 'unique';

export const ITEM_QUALITY_ORDER: ItemQuality[] = ['common', 'uncommon', 'rare', 'epic', 'unique'];

export interface QualityDef {
  quality: ItemQuality;
  /** Display color. */
  color: string;
  /** Max affixes (prefixes + suffixes combined). */
  maxAffixes: number;
  /** Stat multiplier. */
  statMult: number;
  /** Weight for random drops (lower = rarer). */
  weight: number;
}

export const ITEM_QUALITIES: Record<ItemQuality, QualityDef> = {
  common:   { quality: 'common',   color: '#9a9a9a', maxAffixes: 0, statMult: 1.0, weight: 60 },
  uncommon: { quality: 'uncommon', color: '#4a9e4a', maxAffixes: 1, statMult: 1.15, weight: 25 },
  rare:     { quality: 'rare',     color: '#4a7ec9', maxAffixes: 2, statMult: 1.35, weight: 10 },
  epic:     { quality: 'epic',     color: '#9a4ac9', maxAffixes: 3, statMult: 1.6, weight: 4 },
  unique:   { quality: 'unique',   color: '#c9a24a', maxAffixes: 4, statMult: 2.0, weight: 1 },
};

// ---------------------------------------------------------------------------
// Item bases (§13, §14)
// ---------------------------------------------------------------------------

export type EquipmentSlot =
  | 'weapon' | 'offhand' | 'helmet' | 'armor' | 'gloves' | 'boots'
  | 'ring' | 'amulet';

export interface ItemBase {
  id: string;
  name: string;
  slot: EquipmentSlot;
  /** Base stats before quality/affixes. */
  baseStats: ItemStats;
  /** Which affix categories can roll on this. */
  affixTags: Array<'melee' | 'ranged' | 'magic' | 'defense' | 'utility'>;
  weight: number;
}

// Original weapon/armor names (not copied from Diablo).
export const ITEM_BASES: ItemBase[] = [
  // Weapons
  { id: 'rusty_sword', name: 'Rusty Sword', slot: 'weapon', baseStats: { damage: 8 }, affixTags: ['melee'], weight: 20 },
  { id: 'iron_sword', name: 'Iron Sword', slot: 'weapon', baseStats: { damage: 14 }, affixTags: ['melee'], weight: 15 },
  { id: 'steel_blade', name: 'Steel Blade', slot: 'weapon', baseStats: { damage: 22 }, affixTags: ['melee'], weight: 10 },
  { id: 'oak_bow', name: 'Oak Bow', slot: 'weapon', baseStats: { damage: 10 }, affixTags: ['ranged'], weight: 15 },
  { id: 'hunting_bow', name: 'Hunting Bow', slot: 'weapon', baseStats: { damage: 18 }, affixTags: ['ranged'], weight: 10 },
  { id: 'apprentice_staff', name: "Apprentice's Staff", slot: 'weapon', baseStats: { damage: 12, maxMana: 20 }, affixTags: ['magic'], weight: 12 },
  { id: 'oak_staff', name: 'Oak Staff', slot: 'weapon', baseStats: { damage: 20, maxMana: 35 }, affixTags: ['magic'], weight: 8 },
  { id: 'hand_axe', name: 'Hand Axe', slot: 'weapon', baseStats: { damage: 16 }, affixTags: ['melee'], weight: 12 },
  { id: 'mace', name: 'Mace', slot: 'weapon', baseStats: { damage: 18 }, affixTags: ['melee'], weight: 10 },
  { id: 'dagger', name: 'Dagger', slot: 'weapon', baseStats: { damage: 6, attackSpeed: 0.2 }, affixTags: ['melee'], weight: 18 },
  // Offhand
  { id: 'wooden_shield', name: 'Wooden Shield', slot: 'offhand', baseStats: { armor: 8 }, affixTags: ['defense'], weight: 15 },
  { id: 'iron_shield', name: 'Iron Shield', slot: 'offhand', baseStats: { armor: 15 }, affixTags: ['defense'], weight: 10 },
  // Armor
  { id: 'cloth_hood', name: 'Cloth Hood', slot: 'helmet', baseStats: { armor: 4 }, affixTags: ['defense', 'magic'], weight: 15 },
  { id: 'leather_cap', name: 'Leather Cap', slot: 'helmet', baseStats: { armor: 7 }, affixTags: ['defense'], weight: 12 },
  { id: 'iron_helm', name: 'Iron Helm', slot: 'helmet', baseStats: { armor: 12 }, affixTags: ['defense'], weight: 8 },
  { id: 'cloth_robe', name: 'Cloth Robe', slot: 'armor', baseStats: { armor: 6, maxMana: 15 }, affixTags: ['defense', 'magic'], weight: 14 },
  { id: 'leather_armor', name: 'Leather Armor', slot: 'armor', baseStats: { armor: 12 }, affixTags: ['defense'], weight: 12 },
  { id: 'chainmail', name: 'Chainmail', slot: 'armor', baseStats: { armor: 20 }, affixTags: ['defense'], weight: 8 },
  { id: 'cloth_gloves', name: 'Cloth Gloves', slot: 'gloves', baseStats: { armor: 3 }, affixTags: ['defense', 'utility'], weight: 15 },
  { id: 'leather_gloves', name: 'Leather Gloves', slot: 'gloves', baseStats: { armor: 6, attackSpeed: 0.05 }, affixTags: ['defense'], weight: 10 },
  { id: 'worn_boots', name: 'Worn Boots', slot: 'boots', baseStats: { armor: 4, moveSpeed: 0.05 }, affixTags: ['defense', 'utility'], weight: 15 },
  { id: 'leather_boots', name: 'Leather Boots', slot: 'boots', baseStats: { armor: 8, moveSpeed: 0.08 }, affixTags: ['defense'], weight: 10 },
  // Jewelry
  { id: 'copper_ring', name: 'Copper Ring', slot: 'ring', baseStats: {}, affixTags: ['utility', 'magic'], weight: 12 },
  { id: 'silver_ring', name: 'Silver Ring', slot: 'ring', baseStats: {}, affixTags: ['utility', 'magic'], weight: 8 },
  { id: 'bone_amulet', name: 'Bone Amulet', slot: 'amulet', baseStats: {}, affixTags: ['utility', 'magic'], weight: 10 },
  { id: 'stone_amulet', name: 'Stone Amulet', slot: 'amulet', baseStats: {}, affixTags: ['defense', 'utility'], weight: 8 },
  // BUILD 481: expanded bases (50 total)
  { id: 'bronze_sword', name: 'Bronze Sword', slot: 'weapon', baseStats: { damage: 11 }, affixTags: ['melee'], weight: 16 },
  { id: 'soldier_blade', name: "Soldier's Blade", slot: 'weapon', baseStats: { damage: 26 }, affixTags: ['melee'], weight: 8 },
  { id: 'war_axe', name: 'War Axe', slot: 'weapon', baseStats: { damage: 24 }, affixTags: ['melee'], weight: 8 },
  { id: 'yew_bow', name: 'Yew Bow', slot: 'weapon', baseStats: { damage: 24 }, affixTags: ['ranged'], weight: 8 },
  { id: 'longbow', name: 'Longbow', slot: 'weapon', baseStats: { damage: 28 }, affixTags: ['ranged'], weight: 6 },
  { id: 'elder_staff', name: 'Elder Staff', slot: 'weapon', baseStats: { damage: 26, maxMana: 50 }, affixTags: ['magic'], weight: 6 },
  { id: 'war_hammer', name: 'War Hammer', slot: 'weapon', baseStats: { damage: 30 }, affixTags: ['melee'], weight: 6 },
  { id: 'rune_dagger', name: 'Rune Dagger', slot: 'weapon', baseStats: { damage: 10, attackSpeed: 0.25 }, affixTags: ['melee', 'magic'], weight: 10 },
  { id: 'kite_shield', name: 'Kite Shield', slot: 'offhand', baseStats: { armor: 22 }, affixTags: ['defense'], weight: 6 },
  { id: 'tower_shield', name: 'Tower Shield', slot: 'offhand', baseStats: { armor: 30 }, affixTags: ['defense'], weight: 4 },
  { id: 'spellbook', name: 'Spellbook', slot: 'offhand', baseStats: { maxMana: 40 }, affixTags: ['magic'], weight: 8 },
  { id: 'steel_helm', name: 'Steel Helm', slot: 'helmet', baseStats: { armor: 18 }, affixTags: ['defense'], weight: 6 },
  { id: 'mage_hood', name: 'Mage Hood', slot: 'helmet', baseStats: { armor: 8, maxMana: 25 }, affixTags: ['defense', 'magic'], weight: 8 },
  { id: 'plate_armor', name: 'Plate Armor', slot: 'armor', baseStats: { armor: 32 }, affixTags: ['defense'], weight: 5 },
  { id: 'mage_robe', name: 'Mage Robe', slot: 'armor', baseStats: { armor: 10, maxMana: 40 }, affixTags: ['defense', 'magic'], weight: 8 },
  { id: 'gauntlets', name: 'Gauntlets', slot: 'gloves', baseStats: { armor: 10 }, affixTags: ['defense'], weight: 8 },
  { id: 'silk_gloves', name: 'Silk Gloves', slot: 'gloves', baseStats: { armor: 5, attackSpeed: 0.1 }, affixTags: ['defense', 'magic'], weight: 8 },
  { id: 'swift_boots', name: 'Swift Boots', slot: 'boots', baseStats: { armor: 6, moveSpeed: 0.12 }, affixTags: ['defense', 'utility'], weight: 8 },
  { id: 'iron_boots', name: 'Iron Boots', slot: 'boots', baseStats: { armor: 14 }, affixTags: ['defense'], weight: 6 },
  { id: 'gold_ring', name: 'Gold Ring', slot: 'ring', baseStats: {}, affixTags: ['utility', 'magic'], weight: 6 },
  { id: 'jade_ring', name: 'Jade Ring', slot: 'ring', baseStats: {}, affixTags: ['utility'], weight: 5 },
  { id: 'silver_amulet', name: 'Silver Amulet', slot: 'amulet', baseStats: {}, affixTags: ['utility', 'magic'], weight: 7 },
  { id: 'wolf_pendant', name: 'Wolf Pendant', slot: 'amulet', baseStats: { damage: 5 }, affixTags: ['utility'], weight: 5 },
  { id: 'traveler_cloak', name: "Traveler's Cloak", slot: 'armor', baseStats: { armor: 8, moveSpeed: 0.05 }, affixTags: ['defense', 'utility'], weight: 10 },
];

// ---------------------------------------------------------------------------
// Affixes (§17) — prefixes and suffixes, data-driven
// ---------------------------------------------------------------------------

export interface AffixDef {
  id: string;
  /** Display name fragment. Prefixes go before, suffixes after. */
  name: string;
  isPrefix: boolean;
  stats: ItemStats;
  /** Which item tags this can roll on. */
  tags: Array<'melee' | 'ranged' | 'magic' | 'defense' | 'utility'>;
  weight: number;
  minLevel: number;
}

// Original affix names (not copied from Diablo).
export const AFFIXES: AffixDef[] = [
  // Prefixes — melee
  { id: 'sharp', name: 'Sharp', isPrefix: true, stats: { damage: 5 }, tags: ['melee'], weight: 20, minLevel: 1 },
  { id: 'keen', name: 'Keen', isPrefix: true, stats: { damage: 10, critChance: 0.03 }, tags: ['melee'], weight: 12, minLevel: 5 },
  { id: 'brutal', name: 'Brutal', isPrefix: true, stats: { damage: 18, critDamage: 0.2 }, tags: ['melee'], weight: 8, minLevel: 10 },
  { id: 'flameforged', name: 'Flameforged', isPrefix: true, stats: { fireDamage: 8 }, tags: ['melee'], weight: 10, minLevel: 8 },
  { id: 'frostbound', name: 'Frostbound', isPrefix: true, stats: { iceDamage: 8 }, tags: ['melee', 'ranged'], weight: 10, minLevel: 8 },
  { id: 'stormtouched', name: 'Stormtouched', isPrefix: true, stats: { lightningDamage: 8 }, tags: ['melee', 'ranged', 'magic'], weight: 10, minLevel: 8 },
  // Prefixes — ranged
  { id: 'swift', name: 'Swift', isPrefix: true, stats: { attackSpeed: 0.12 }, tags: ['ranged', 'melee'], weight: 15, minLevel: 3 },
  { id: 'deadeye', name: 'Deadeye', isPrefix: true, stats: { critChance: 0.06 }, tags: ['ranged'], weight: 10, minLevel: 6 },
  // Prefixes — magic
  { id: 'arcane', name: 'Arcane', isPrefix: true, stats: { maxMana: 25, intelligence: 3 }, tags: ['magic'], weight: 15, minLevel: 1 },
  { id: 'mystic', name: 'Mystic', isPrefix: true, stats: { maxMana: 50, intelligence: 6 }, tags: ['magic'], weight: 8, minLevel: 8 },
  // Prefixes — defense
  { id: 'sturdy', name: 'Sturdy', isPrefix: true, stats: { armor: 8 }, tags: ['defense'], weight: 20, minLevel: 1 },
  { id: 'reinforced', name: 'Reinforced', isPrefix: true, stats: { armor: 16 }, tags: ['defense'], weight: 12, minLevel: 6 },
  { id: 'warded', name: 'Warded', isPrefix: true, stats: { fireResist: 0.1, iceResist: 0.1 }, tags: ['defense', 'utility'], weight: 10, minLevel: 5 },
  // Suffixes
  { id: 'of_the_bear', name: 'of the Bear', isPrefix: false, stats: { maxHealth: 30, vitality: 4 }, tags: ['defense', 'utility', 'melee'], weight: 18, minLevel: 1 },
  { id: 'of_the_fox', name: 'of the Fox', isPrefix: false, stats: { dexterity: 5, moveSpeed: 0.05 }, tags: ['ranged', 'utility'], weight: 15, minLevel: 3 },
  { id: 'of_the_owl', name: 'of the Owl', isPrefix: false, stats: { intelligence: 5, manaRegen: 1 }, tags: ['magic', 'utility'], weight: 15, minLevel: 3 },
  { id: 'of_the_bull', name: 'of the Bull', isPrefix: false, stats: { strength: 6, maxHealth: 20 }, tags: ['melee', 'defense'], weight: 14, minLevel: 4 },
  { id: 'of_leeching', name: 'of Leeching', isPrefix: false, stats: { lifeSteal: 0.05 }, tags: ['melee', 'ranged'], weight: 8, minLevel: 10 },
  { id: 'of_swiftness', name: 'of Swiftness', isPrefix: false, stats: { moveSpeed: 0.1, attackSpeed: 0.08 }, tags: ['utility', 'ranged'], weight: 10, minLevel: 7 },
  { id: 'of_the_turtle', name: 'of the Turtle', isPrefix: false, stats: { armor: 12, maxHealth: 25 }, tags: ['defense'], weight: 12, minLevel: 5 },
  { id: 'of_resistance', name: 'of Resistance', isPrefix: false, stats: { poisonResist: 0.15, lightningResist: 0.1 }, tags: ['defense', 'utility'], weight: 10, minLevel: 6 },
];

// ---------------------------------------------------------------------------
// Generated item
// ---------------------------------------------------------------------------

export interface GeneratedItem {
  /** Unique instance id. */
  instanceId: string;
  baseId: string;
  name: string; // e.g. "Sharp Iron Sword of the Bear"
  slot: EquipmentSlot;
  quality: ItemQuality;
  /** Combined stats (base * quality mult + affixes). */
  stats: ItemStats;
  affixIds: string[];
  /** Item level (for requirements, scaling). */
  level: number;
  /** Sell value in gold. */
  value: number;
}

let itemInstanceCounter = 0;

/** Seeded RNG (same style as wfc.ts). */
export class ItemRng {
  private state: number;
  constructor(seed: number) {
    this.state = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  /** Weighted pick from a list. */
  pickWeighted<T extends { weight: number }>(items: T[]): T {
    let total = 0;
    for (const i of items) total += i.weight;
    let r = this.next() * total;
    for (const i of items) {
      r -= i.weight;
      if (r <= 0) return i;
    }
    return items[items.length - 1];
  }
}

/** Merge stat objects (adds values). */
export function mergeStats(...statSets: ItemStats[]): ItemStats {
  const out: ItemStats = {};
  for (const s of statSets) {
    for (const k of Object.keys(s) as StatKey[]) {
      const v = s[k];
      if (v !== undefined) (out[k] as number) = ((out[k] as number) ?? 0) + (v as number);
    }
  }
  return out;
}

/** Scale stats by a multiplier (for quality). */
export function scaleStats(stats: ItemStats, mult: number): ItemStats {
  const out: ItemStats = {};
  for (const k of Object.keys(stats) as StatKey[]) {
    const v = stats[k];
    if (v !== undefined) (out[k] as number) = Math.round((v as number) * mult * 10) / 10;
  }
  return out;
}

/**
 * Generate a random item.
 * @param level  item level (filters affixes, scales value)
 * @param forceQuality  override random quality (for testing/bosses)
 * @param forceBaseId  override random base (for testing)
 */
export function generateItem(
  rng: ItemRng,
  level: number,
  forceQuality?: ItemQuality,
  forceBaseId?: string,
): GeneratedItem {
  // Pick base.
  const base = forceBaseId
    ? ITEM_BASES.find((b) => b.id === forceBaseId)!
    : rng.pickWeighted(ITEM_BASES);
  // Pick quality.
  const quality = forceQuality ?? rng.pickWeighted(
    ITEM_QUALITY_ORDER.map((q) => ({ quality: q, weight: ITEM_QUALITIES[q].weight })),
  ).quality;
  const qdef = ITEM_QUALITIES[quality];

  // Pick affixes (compatible tags, level-gated, no duplicate prefixes/suffixes).
  const eligible = AFFIXES.filter(
    (a) => a.minLevel <= level && a.tags.some((t) => base.affixTags.includes(t)),
  );
  const prefixes = eligible.filter((a) => a.isPrefix);
  const suffixes = eligible.filter((a) => !a.isPrefix);
  const affixIds: string[] = [];
  const usedNames = new Set<string>();
  // Distribute maxAffixes between prefixes and suffixes.
  let prefixBudget = Math.ceil(qdef.maxAffixes / 2);
  let suffixBudget = qdef.maxAffixes - prefixBudget;
  for (let i = 0; i < prefixBudget && prefixes.length > 0; i++) {
    const avail = prefixes.filter((a) => !usedNames.has(a.id));
    if (avail.length === 0) break;
    const picked = rng.pickWeighted(avail);
    affixIds.push(picked.id);
    usedNames.add(picked.id);
  }
  for (let i = 0; i < suffixBudget && suffixes.length > 0; i++) {
    const avail = suffixes.filter((a) => !usedNames.has(a.id));
    if (avail.length === 0) break;
    const picked = rng.pickWeighted(avail);
    affixIds.push(picked.id);
    usedNames.add(picked.id);
  }

  // Build name: "Prefix Base Suffix".
  const affixes = affixIds.map((id) => AFFIXES.find((a) => a.id === id)!);
  const prefixNames = affixes.filter((a) => a.isPrefix).map((a) => a.name);
  const suffixNames = affixes.filter((a) => !a.isPrefix).map((a) => a.name);
  const name = [...prefixNames, base.name, ...suffixNames].join(' ');

  // Combine stats: (base * quality mult) + affixes.
  const stats = mergeStats(
    scaleStats(base.baseStats, qdef.statMult),
    ...affixes.map((a) => a.stats),
  );

  // Value scales with level, quality, and affix count.
  const value = Math.round(
    (10 + level * 5) * qdef.statMult * (1 + affixIds.length * 0.5),
  );

  return {
    instanceId: `item_${++itemInstanceCounter}_${Date.now()}`,
    baseId: base.id,
    name,
    slot: base.slot,
    quality,
    stats,
    affixIds,
    level,
    value,
  };
}

/** Total stats from a set of equipped items. */
export function totalEquipmentStats(items: GeneratedItem[]): ItemStats {
  return mergeStats(...items.map((i) => i.stats));
}
