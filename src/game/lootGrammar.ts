/**
 * Unified loot grammar (BUILD 969 — extras 1/6).
 *
 * One mechanism for authored loot, combining two REA-mined grammars
 * (rules/formats only, original TypeScript — no source-game names,
 * items, or content):
 *
 * - Tibia authored tables: each entry is an independent roll with a
 *   per-item `chance` on a 0–100000 scale and a `countmax` cap on
 *   stacked drops. Entries are independent — a kill can drop several
 *   entries at once, or none of the rares. There is no "one drop per
 *   kill" slot.
 * - EQEmu three-tier structure + cash model: loottable → lootdrop →
 *   item. Each lootdrop entry rolls independently against its own
 *   probability, subject to a per-table drop limit and a minimum
 *   drop count. Cash is modeled, not flat: min/max/average coin with
 *   an interpolation roll.
 *
 * Tiers, stated exactly:
 *   Tier 1 — LootTable (per source, e.g. per monster kind): a set of
 *     lootdrops, with optional minDrops / maxDrops limits.
 *   Tier 2 — LootDrop: a group of entries behind one probability gate
 *     (0–100). When the gate passes, every entry inside rolls.
 *   Tier 3 — LootEntry (item): one independent roll. A `count` entry
 *     grants a stackable inventory count in [countMin, countMax];
 *     a `cash` entry grants coins in [min, max] (uniform mode) or
 *     via the min/avg/max interpolation roll; a `gear` entry grants
 *     an equipment base id (count is always exactly 1).
 *
 * What this build does and does not do, stated plainly:
 * - The monster counts loot that was a hardcoded switch in App.tsx
 *   (`monsterLootForKind`, inline Math.random calls) is now authored
 *   data: MONSTER_LOOT_TABLES, one table per kind. Every rate is an
 *   EXACT translation of the legacy roll — same chance, same range,
 *   same distribution — verified by deterministic spot checks. No
 *   rate was retuned, no drop added, none removed.
 * - The gear channel is NOT grammar-rolled: BUILD 962 class loot
 *   (knight → sword + plate, always) is deterministic by contract,
 *   and a grammar roll would make class gear random. Gear entries
 *   exist in the grammar and are tested, but monster tables carry
 *   no gear entries today; class gear still rides the drop via
 *   classGearBaseIds, untouched.
 * - Quest/task payouts (BUILD 968 questRewards) are NOT grammar
 *   tables: they are name-mapped payouts, not kill drops.
 * - Wildlife counts loot (goat kills: a random GOAT_LOOT_TYPES pick)
 *   is NOT a per-kind authored table and stays on its own roll.
 * - There is no global-drops table: a server-wide drop on top of
 *   every kill would ADD drops to every kind, which needs its own
 *   order, not a side effect here.
 * - Zero-count keys are omitted from rolled counts (the legacy
 *   switch returned e.g. fabric: 0 on a failed roll). This is
 *   behavior-identical: describeLoot skips zero counts, onLoot adds
 *   zero as a no-op, and the `drop.loot.silk` quest hook treats
 *   undefined exactly like 0 (both falsy).
 */
import { ITEM_BASES } from './items';

/** RNG: returns a float in [0, 1). Defaults to Math.random at call sites. */
export type LootRng = () => number;

/** Stackable inventory count (coins, fabric, bone, pelt, fang, silk, lockpicks, …). */
export interface LootCountEntry {
  kind: 'count';
  key: string;
  /** Independent roll: granted when rng() * 100000 < chance. */
  chance: number;
  countMin: number;
  countMax: number;
}

/** Coins. `chance` gates the entry like any other; `avg` documents the mean. */
export interface LootCashEntry {
  kind: 'cash';
  chance: number;
  min: number;
  max: number;
  avg: number;
  /** 'uniform': integer uniform in [min, max]. 'interpolated': the EQEmu
   *  min/avg/max interpolation — with p = (avg - min) / (max - min),
   *  roll uniform in [ceil(avg), max] with probability p, else uniform
   *  in [min, floor(avg)]. Expected value is avg in both branches' mean. */
  mode: 'uniform' | 'interpolated';
}

/** Equipment base id, granted exactly once when its chance roll passes. */
export interface LootGearEntry {
  kind: 'gear';
  baseId: string;
  chance: number;
}

export type LootEntry = LootCountEntry | LootCashEntry | LootGearEntry;

/** Tier 2: a group of entries behind one probability gate (0–100). */
export interface LootDrop {
  probability: number;
  entries: LootEntry[];
}

/** Tier 1: a set of drops, with optional drop-count limits. */
export interface LootTable {
  drops: LootDrop[];
  /** Minimum drops granted: if fewer drops pass their gates, drops are
   *  added in table order (entries rolled, gate skipped) until this
   *  many are granted or the table is exhausted. */
  minDrops?: number;
  /** Maximum drops granted: only the first this-many passing drops count. */
  maxDrops?: number;
}

export interface RolledLoot {
  counts: Record<string, number>;
  gearBaseIds: string[];
}

/** Empty result, shared by unknown kinds (the legacy switch's default). */
export const EMPTY_ROLLED_LOOT: RolledLoot = { counts: {}, gearBaseIds: [] };

/** Integer uniform in [min, max] from one rng draw. */
export function lootIntIn(min: number, max: number, rng: LootRng): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/** One entry's roll, or null when its chance gate fails. */
export function rollLootEntry(entry: LootEntry, rng: LootRng): { counts: Record<string, number>; gearBaseIds: string[] } | null {
  if (rng() * 100000 >= entry.chance) return null;
  if (entry.kind === 'count') {
    return { counts: { [entry.key]: lootIntIn(entry.countMin, entry.countMax, rng) }, gearBaseIds: [] };
  }
  if (entry.kind === 'cash') {
    let coins: number;
    if (entry.mode === 'uniform' || entry.max <= entry.min) {
      coins = lootIntIn(entry.min, entry.max, rng);
    } else {
      const p = (entry.avg - entry.min) / (entry.max - entry.min);
      coins = rng() < p
        ? lootIntIn(Math.ceil(entry.avg), entry.max, rng)
        : lootIntIn(entry.min, Math.floor(entry.avg), rng);
    }
    return { counts: { coins }, gearBaseIds: [] };
  }
  return { counts: {}, gearBaseIds: [entry.baseId] };
}

/** One drop's roll: null when its probability gate fails. */
export function rollLootDrop(drop: LootDrop, rng: LootRng): RolledLoot | null {
  if (rng() * 100 > drop.probability) return null;
  const out: RolledLoot = { counts: {}, gearBaseIds: [] };
  for (const entry of drop.entries) {
    const hit = rollLootEntry(entry, rng);
    if (!hit) continue;
    for (const [key, amount] of Object.entries(hit.counts)) {
      out.counts[key] = (out.counts[key] ?? 0) + amount;
    }
    out.gearBaseIds.push(...hit.gearBaseIds);
  }
  return out;
}

/** A whole table: every drop rolls independently, then limits apply. */
export function rollLootTable(table: LootTable, rng: LootRng): RolledLoot {
  const out: RolledLoot = { counts: {}, gearBaseIds: [] };
  const passed: boolean[] = [];
  const rolled: (RolledLoot | null)[] = [];
  for (const drop of table.drops) {
    const hit = rollLootDrop(drop, rng);
    passed.push(hit !== null);
    rolled.push(hit);
  }
  const kept: RolledLoot[] = [];
  for (let i = 0; i < table.drops.length; i++) {
    if (rolled[i]) kept.push(rolled[i] as RolledLoot);
    if (table.maxDrops !== undefined && kept.length >= table.maxDrops) break;
  }
  if (table.minDrops !== undefined && kept.length < table.minDrops) {
    // Fill in table order with drops that did not pass their gate.
    // The gate is skipped for filled drops (the table promises a
    // minimum); their entries still roll independently. (Validation
    // guarantees minDrops <= maxDrops, so filling to minDrops can
    // never exceed maxDrops, and a maxDrops cut implies kept already
    // holds maxDrops >= minDrops, so fill never runs after a cut.)
    for (let i = 0; i < table.drops.length; i++) {
      if (kept.length >= table.minDrops) break;
      if (passed[i]) continue;
      const hit = rollLootDrop({ probability: 100, entries: table.drops[i].entries }, rng);
      if (hit) kept.push(hit);
    }
  }
  for (const hit of kept) {
    for (const [key, amount] of Object.entries(hit.counts)) {
      out.counts[key] = (out.counts[key] ?? 0) + amount;
    }
    out.gearBaseIds.push(...hit.gearBaseIds);
  }
  return out;
}

/**
 * Structural validation: returns error strings, [] when valid. Gear
 * entries must point at real catalog bases; chance/probability/count
 * ranges must hold; cash needs min <= avg <= max.
 */
export function validateLootTable(table: LootTable): string[] {
  const errors: string[] = [];
  const known = new Set(ITEM_BASES.map((b) => b.id));
  if (table.minDrops !== undefined && table.minDrops < 0) errors.push('minDrops < 0');
  if (table.maxDrops !== undefined && table.maxDrops < 0) errors.push('maxDrops < 0');
  if (table.minDrops !== undefined && table.maxDrops !== undefined && table.maxDrops < table.minDrops) {
    errors.push('maxDrops < minDrops');
  }
  for (const drop of table.drops) {
    if (!(drop.probability >= 0 && drop.probability <= 100)) errors.push(`drop probability out of 0..100: ${drop.probability}`);
    for (const entry of drop.entries) {
      if (!(entry.chance >= 0 && entry.chance <= 100000)) errors.push(`entry chance out of 0..100000: ${entry.chance}`);
      if (entry.kind === 'count') {
        if (entry.countMin < 1) errors.push(`countMin < 1 for '${entry.key}'`);
        if (entry.countMax < entry.countMin) errors.push(`countMax < countMin for '${entry.key}'`);
      }
      if (entry.kind === 'cash') {
        if (entry.min > entry.max) errors.push('cash min > max');
        if (entry.avg < entry.min || entry.avg > entry.max) errors.push('cash avg outside [min, max]');
        if (entry.mode !== 'uniform' && entry.mode !== 'interpolated') errors.push(`unknown cash mode: ${String(entry.mode)}`);
      }
      if (entry.kind === 'gear' && !known.has(entry.baseId)) errors.push(`unknown gear base: ${entry.baseId}`);
    }
  }
  return errors;
}

/** True when the table is structurally valid. */
export function isValidLootTable(table: LootTable): boolean {
  return validateLootTable(table).length === 0;
}

// ---------------------------------------------------------------------------
// Monster tables: exact translations of the legacy monsterLootForKind
// switch (App.tsx, pre-969). One drop per kind at probability 100 —
// the legacy rolls were all independent, so the drop tier carries no
// extra gating here; it exists for future grouped tables and is fully
// tested below the table definitions. Chance/range mapping, verified:
//   coins: a + floor(rand * n)        -> cash chance 100000 uniform a..a+n-1
//   coins: rand < p ? 1 : 0           -> cash chance p*100000, min = max = 1
//   key: rand < p ? 1 : 0             -> count chance p*100000, 1..1
//   key: always 1 (or 1 + floor)      -> count chance 100000, that range
// Cash avg documents the uniform mean (min + max) / 2; uniform mode
// ignores it, so non-integer means (e.g. 3.5) are exact, not rounded.
// ---------------------------------------------------------------------------

const CASH = (min: number, max: number): LootCashEntry => ({
  kind: 'cash',
  chance: 100000,
  min,
  max,
  avg: (min + max) / 2,
  mode: 'uniform',
});
const CASH_CHANCE = (chance: number): LootCashEntry => ({
  kind: 'cash',
  chance,
  min: 1,
  max: 1,
  avg: 1,
  mode: 'uniform',
});
const COUNT = (key: string, chance: number, countMin = 1, countMax = 1): LootCountEntry => ({
  kind: 'count',
  key,
  chance,
  countMin,
  countMax,
});
const ALWAYS = (key: string, countMin = 1, countMax = 1): LootCountEntry => COUNT(key, 100000, countMin, countMax);
const TABLE = (entries: LootEntry[]): LootTable => ({ drops: [{ probability: 100, entries }] });

export const MONSTER_LOOT_TABLES: Record<string, LootTable> = {
  goblin: TABLE([CASH(1, 3), COUNT('fabric', 30000)]),
  bandit: TABLE([CASH(3, 7), COUNT('fabric', 50000), ALWAYS('bone'), COUNT('lockpicks', 35000)]),
  skeleton: TABLE([ALWAYS('bone', 1, 2), CASH_CHANCE(50000)]),
  troll: TABLE([ALWAYS('pelt'), CASH(2, 5)]),
  snake: TABLE([ALWAYS('fang'), CASH_CHANCE(30000)]),
  spider: TABLE([ALWAYS('silk', 2, 3), COUNT('fang', 50000)]),
  dragon: TABLE([ALWAYS('pelt', 2, 2), ALWAYS('fang', 2, 2), CASH(10, 19)]),
  orc: TABLE([ALWAYS('pelt'), CASH(2, 5)]),
  soldier: TABLE([CASH(3, 6), COUNT('fabric', 50000)]),
  knight: TABLE([CASH(4, 9), COUNT('fabric', 50000)]),
  wolf: TABLE([ALWAYS('pelt'), COUNT('fang', 50000)]),
  slime: TABLE([CASH_CHANCE(40000)]),
  bat: TABLE([ALWAYS('fang'), CASH_CHANCE(20000)]),
  rat: TABLE([CASH_CHANCE(30000)]),
};

/** Kinds with an authored monster table (ogre/elf/dwarf/unknown → empty). */
export function monsterLootKindKeys(): string[] {
  return Object.keys(MONSTER_LOOT_TABLES);
}

/**
 * Roll a monster kind's counts loot. Unknown kinds (ogre, elf, dwarf,
 * anything unlisted) roll the empty table — the legacy default {}.
 * The gear channel is deliberately NOT here: class gear still rides
 * the drop via classGearBaseIds (BUILD 962), untouched.
 */
export function rollMonsterLoot(kind: string | undefined, rng: LootRng = Math.random): RolledLoot {
  if (!kind) return { counts: {}, gearBaseIds: [] };
  const table = MONSTER_LOOT_TABLES[kind.toLowerCase()];
  if (!table) return { counts: {}, gearBaseIds: [] };
  return rollLootTable(table, rng);
}
