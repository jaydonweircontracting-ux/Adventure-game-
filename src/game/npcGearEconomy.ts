// NPC gear economy (BUILD 922).
//
// An aspiration layer on top of the existing systems — NOT a new economy:
//   - Value comes from the existing item catalog (ITEM_BASES baseStats) and
//     the existing stall catalog (SHOP_CATALOG buy/sell prices). No new
//     currency, no new shop system, no parallel inventory.
//   - What an NPC "wears" is still the variantLook outfit (BUILD 921). What
//     an NPC OWNS beyond that is a small persisted stash of item-base ids
//     (`ownedGear` on Townsperson). Bought gear and spares live there; worn
//     gear is never sold (its render is deterministic from the NPC id, so
//     selling it would desync the corpse/body logic from BUILD 921).
//   - Wealth is still npcGold (villageLife.ts): seed savings + wages −
//     spend + goldDelta. Gear transactions move goldDelta exactly like the
//     BUILD 700 NPC purchases do; buys also move merchantGold through the
//     same buyFromStall ledger, and sales mirror player stall sales (stalls
//     buy catalog goods at unlimited demand, so no merchantGold deduction —
//     the same rule the player sells under).
//   - Aspiration is two small fields: `ownedGear` (the stash) and
//     `wealthGoal` (a gold target). Both are optional on Townsperson with
//     deterministic lazy defaults, so old saves and fresh rosters work with
//     zero migration: undefined means "derive from the NPC id".
//
// Guardrails (enforced by canSellGear itself, never just by UI):
//   (a) No downgrade — selling must not lower the best equipped score in
//       that slot (spares and worse duplicates may go; the unique best
//       may not).
//   (b) No income loss — an NPC never sells its LAST trade tool (the work
//       implement its archetype earns with: a smith's hammer, a farmer's
//       hand axe, a priest's staff). A spare tool may go; the last one
//       may not. Price is irrelevant: refusal is absolute, not an offer.
//   (c) Never defenseless — after the sale the NPC must still have a
//       weapon AND at least one armor piece. Selling its only weapon or
//       its last armor piece is refused at any price.

import { ITEM_BASES } from './items';
import { isKnownBaseId, wornGearBaseIds } from './npcGear';
import {
  SHOP_CATALOG,
  buyFromStall,
  type ShopItemKey,
  type StallShopDef,
  type StallStockState,
} from './shops';

// ---------------------------------------------------------------------------
// Value score: one comparable number per gear base, derived ONLY from
// existing ITEM_BASES baseStats (no new stat fields).
// ---------------------------------------------------------------------------

/** Weights turn a stat block into a single power number. Documented, fixed. */
const SCORE_WEIGHTS: Record<string, number> = {
  damage: 1.0,
  fireDamage: 0.8, iceDamage: 0.8, lightningDamage: 0.8, poisonDamage: 0.8,
  armor: 1.0,
  fireResist: 20, iceResist: 20, lightningResist: 20, poisonResist: 20,
  maxHealth: 0.15, maxMana: 0.1,
  strength: 1.5, dexterity: 1.5, intelligence: 1.5, vitality: 1.5,
  attackSpeed: 20, critChance: 30, critDamage: 10, moveSpeed: 20,
  lifeSteal: 50, manaRegen: 2,
};

/** Power score of a gear base id; 0 for unknown ids (never crashes). */
export function gearScore(baseId: string): number {
  const base = ITEM_BASES.find((b) => b.id === baseId);
  if (!base) return 0;
  let score = 0;
  for (const [key, value] of Object.entries(base.baseStats)) {
    if (value === undefined) continue;
    score += (SCORE_WEIGHTS[key] ?? 0) * (value as number);
  }
  return Math.round(score * 10) / 10;
}

/** Equipment slot of a base id, or null when unknown. */
export function gearSlot(baseId: string): string | null {
  return ITEM_BASES.find((b) => b.id === baseId)?.slot ?? null;
}

/** Display name of a base id (falls back to a prettified id). */
export function gearBaseName(baseId: string): string {
  return ITEM_BASES.find((b) => b.id === baseId)?.name ?? baseId.replace(/[-_]/g, ' ');
}

export type WeaponKind = 'melee' | 'ranged' | 'magic';

/** Combat style of a weapon base, from its affix tags (null = not a weapon). */
export function weaponKind(baseId: string): WeaponKind | null {
  const base = ITEM_BASES.find((b) => b.id === baseId);
  if (!base || base.slot !== 'weapon') return null;
  if (base.affixTags.includes('melee')) return 'melee';
  if (base.affixTags.includes('ranged')) return 'ranged';
  if (base.affixTags.includes('magic')) return 'magic';
  return null;
}

// ---------------------------------------------------------------------------
// Bridge between the two item systems: stall goods <-> RPG bases.
// Stalls sell three weapon goods; shirts are clothing, not gear (BUILD 921),
// and stalls buy no armor — so armor has no shop source (stated, not faked).
// ---------------------------------------------------------------------------

/** Stall weapon good -> the RPG base an NPC owns when it buys one. */
export const SHOP_GEAR_GOODS: Partial<Record<ShopItemKey, string>> = {
  swords: 'steel_blade',
  daggers: 'dagger',
  bow: 'hunting_bow',
};

/** RPG base -> the stall good it sells back as, or null (no stall buyer). */
export function stallGoodForBase(baseId: string): ShopItemKey | null {
  for (const [good, base] of Object.entries(SHOP_GEAR_GOODS)) {
    if (base === baseId) return good as ShopItemKey;
  }
  return null;
}

/** Work implements: the gear an archetype earns its living with. */
export const TRADE_TOOLS: Record<string, string[]> = {
  smith: ['war_hammer'],
  farmer: ['hand_axe'],
  priest: ['apprentice_staff', 'oak_staff', 'elder_staff'],
  guard: [],
  merchant: [],
  commoner: [],
  child: [],
};

/** Slots that count as "armor" for the defenseless rule. */
const ARMOR_SLOTS = new Set(['helmet', 'armor', 'gloves', 'boots', 'offhand']);

// ---------------------------------------------------------------------------
// Held gear: worn (variantLook, fixed) + owned stash (persisted, mutable).
// ---------------------------------------------------------------------------

/** Minimal structural type so tests need no full Townsperson object. */
export type GearHolder = {
  id: string;
  archetype: string;
  ownedGear?: string[];
  wealthGoal?: number;
};

/**
 * Local deterministic 0..1 hash of a string (FNV-1a + murmur-style finalizer,
 * no imports). The finalizer matters: raw FNV over sequential ids like
 * 'townsfolk-0'..'townsfolk-37' clusters hard (0–9 all ~0.3, 10–19 all ~0.63,
 * 20–37 all ~0.11), which would hand stashes out by id range instead of
 * randomly. The mix avalanches the low-bit differences across the range.
 */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const STARTING_WEAPONS: Record<string, string[]> = {
  guard: ['dagger', 'iron_sword'],
  smith: ['hand_axe', 'war_hammer'],
  farmer: ['hand_axe', 'dagger'],
  priest: ['apprentice_staff'],
  merchant: ['dagger'],
  commoner: ['dagger', 'rusty_sword'],
  child: [],
};

const STARTING_ARMOR = ['cloth_hood', 'leather_cap', 'leather_gloves', 'worn_boots', 'wooden_shield'];

/**
 * Deterministic starting stash, like seedSavings in npcGold: ~30% of adults
 * start with one spare weapon, ~20% with one spare armor piece, the rest
 * with nothing. Children start with nothing (they never trade gear).
 */
export function startingOwnedGear(npcId: string, archetype: string): string[] {
  if (archetype === 'child') return [];
  const r = hash01(npcId);
  const weapons = STARTING_WEAPONS[archetype] ?? STARTING_WEAPONS['commoner'];
  if (r < 0.3 && weapons.length > 0) {
    return [weapons[Math.floor(hash01(npcId + ':w') * weapons.length) % weapons.length]];
  }
  if (r < 0.5) {
    return [STARTING_ARMOR[Math.floor(hash01(npcId + ':a') * STARTING_ARMOR.length) % STARTING_ARMOR.length]];
  }
  return [];
}

/** Effective stash: explicit stored list (filtered to known bases), else the starting stash. */
export function effectiveOwnedGear(holder: GearHolder): string[] {
  if (holder.ownedGear !== undefined) return holder.ownedGear.filter(isKnownBaseId);
  return startingOwnedGear(holder.id, holder.archetype);
}

/** Initial wealth goal in gold (seed-derived, 80–200). */
export function wealthGoalFor(npcId: string): number {
  return 80 + Math.floor(hash01(npcId + ':goal') * 120);
}

/** Effective wealth goal: stored value, else the seed-derived default. */
export function effectiveWealthGoal(holder: GearHolder): number {
  const g = holder.wealthGoal;
  return typeof g === 'number' && Number.isFinite(g) && g >= 0 ? Math.floor(g) : wealthGoalFor(holder.id);
}

/** Ratchet: once the goal is met, set a higher one (×1.3 + 25). */
export function ratchetWealthGoal(goal: number, gold: number): number {
  if (gold < goal) return goal;
  return Math.floor(goal * 1.3) + 25;
}

/** Lifestyle tier from progress toward the wealth goal: 0 struggling .. 3 thriving. */
export function lifestyleTier(gold: number, goal: number): number {
  const ratio = gold / Math.max(1, goal);
  if (ratio >= 2) return 3;
  if (ratio >= 1) return 2;
  if (ratio >= 0.5) return 1;
  return 0;
}

/** Best equipped base per slot across worn + owned (max score wins). */
export function equippedBestBySlot(
  wornBaseIds: readonly string[],
  ownedBaseIds: readonly string[],
): Map<string, { baseId: string; score: number }> {
  const best = new Map<string, { baseId: string; score: number }>();
  for (const baseId of [...wornBaseIds, ...ownedBaseIds]) {
    const slot = gearSlot(baseId);
    if (!slot) continue;
    const score = gearScore(baseId);
    const cur = best.get(slot);
    if (!cur || score > cur.score) best.set(slot, { baseId, score });
  }
  return best;
}

/** Best equipped weapon (any kind), or null when unarmed. */
function bestWeapon(
  wornBaseIds: readonly string[],
  ownedBaseIds: readonly string[],
): { baseId: string; score: number; kind: WeaponKind | null } | null {
  const best = equippedBestBySlot(wornBaseIds, ownedBaseIds).get('weapon');
  if (!best) return null;
  return { ...best, kind: weaponKind(best.baseId) };
}

// ---------------------------------------------------------------------------
// Want / need classification.
// ---------------------------------------------------------------------------

export type GearWant = {
  kind: 'need' | 'want';
  slot: 'weapon' | 'armor';
  /** Currently equipped base in that slot (null when the slot is empty). */
  currentBaseId: string | null;
  currentScore: number;
  /** Shop good that would fill it (null when no shop source exists). */
  targetGood: ShopItemKey | null;
  targetBaseId: string | null;
  targetScore: number;
};

/**
 * The single most pressing gear desire, in priority order: an unfilled
 * weapon slot (defenseless) > an unfilled armor slot > a strictly better
 * weapon sold at market. Weapon upgrades stay within the NPC's combat
 * style (a sword-fighter doesn't "want" a bow); an unarmed NPC wants any
 * weapon. Children never want gear. Armor has no shop source — that need
 * is reported with a null target rather than invented.
 */
export function gearWant(
  archetype: string,
  wornBaseIds: readonly string[],
  ownedBaseIds: readonly string[],
  candidateGoods: readonly ShopItemKey[],
): GearWant | null {
  if (archetype === 'child') return null;
  const weapon = bestWeapon(wornBaseIds, ownedBaseIds);
  const candidates = candidateGoods
    .map((good) => ({ good, baseId: SHOP_GEAR_GOODS[good] }))
    .filter((c): c is { good: ShopItemKey; baseId: string } => !!c.baseId);
  if (!weapon) {
    // Unarmed: any shop weapon fills the need; take the strongest offered.
    let best: { good: ShopItemKey; baseId: string } | null = null;
    for (const c of candidates) {
      if (!best || gearScore(c.baseId) > gearScore(best.baseId)) best = c;
    }
    return {
      kind: 'need', slot: 'weapon', currentBaseId: null, currentScore: 0,
      targetGood: best?.good ?? null, targetBaseId: best?.baseId ?? null,
      targetScore: best ? gearScore(best.baseId) : 0,
    };
  }
  // Armor need outranks a weapon upgrade (protection before polish).
  const best = equippedBestBySlot(wornBaseIds, ownedBaseIds);
  const hasArmor = [...best.keys()].some((slot) => ARMOR_SLOTS.has(slot));
  if (!hasArmor) {
    return {
      kind: 'need', slot: 'armor', currentBaseId: null, currentScore: 0,
      targetGood: null, targetBaseId: null, targetScore: 0,
    };
  }
  // Strictly better weapon, same combat style, sold at market.
  let upgrade: { good: ShopItemKey; baseId: string } | null = null;
  for (const c of candidates) {
    if (weapon.kind !== null && weaponKind(c.baseId) !== weapon.kind) continue;
    if (gearScore(c.baseId) <= weapon.score) continue;
    if (!upgrade || gearScore(c.baseId) > gearScore(upgrade.baseId)) upgrade = c;
  }
  if (!upgrade) return null;
  return {
    kind: 'want', slot: 'weapon', currentBaseId: weapon.baseId, currentScore: weapon.score,
    targetGood: upgrade.good, targetBaseId: upgrade.baseId, targetScore: gearScore(upgrade.baseId),
  };
}

// ---------------------------------------------------------------------------
// Guarded selling: the three hard rules, enforced in the decision code.
// ---------------------------------------------------------------------------

export type SellRefusal =
  | 'child' | 'not-owned' | 'defenseless' | 'trade-tool' | 'downgrade';

/**
 * May this NPC sell one copy of baseId from its stash? Returns ok:true or
 * the refusal reason. Price is deliberately NOT an input: a refused sale is
 * refused at any price. Worn gear is never sellable (not-owned) — its
 * render is deterministic from the NPC id.
 */
export function canSellGear(
  archetype: string,
  wornBaseIds: readonly string[],
  ownedBaseIds: readonly string[],
  baseId: string,
): { ok: true } | { ok: false; reason: SellRefusal } {
  if (archetype === 'child') return { ok: false, reason: 'child' };
  const owned = ownedBaseIds.filter((b) => b === baseId);
  if (owned.length === 0) return { ok: false, reason: 'not-owned' };
  // Hypothetical post-sale state: one copy removed from the stash; worn stays.
  const remaining = [...ownedBaseIds];
  remaining.splice(remaining.indexOf(baseId), 1);
  const before = equippedBestBySlot(wornBaseIds, ownedBaseIds);
  const after = equippedBestBySlot(wornBaseIds, remaining);
  // (c) Never defenseless: a weapon AND at least one armor piece must remain.
  const weaponAfter = after.get('weapon');
  const armorAfter = [...after.keys()].some((slot) => ARMOR_SLOTS.has(slot));
  if (!weaponAfter || !armorAfter) return { ok: false, reason: 'defenseless' };
  // (b) No income loss: the last trade tool of the archetype never goes.
  const tools = TRADE_TOOLS[archetype] ?? [];
  if (tools.length > 0) {
    const hadTool = [...wornBaseIds, ...ownedBaseIds].some((b) => tools.includes(b));
    const keepsTool = [...wornBaseIds, ...remaining].some((b) => tools.includes(b));
    if (hadTool && !keepsTool) return { ok: false, reason: 'trade-tool' };
  }
  // (a) No downgrade: the slot's best score must not drop.
  const slot = gearSlot(baseId);
  if (slot) {
    const beforeScore = before.get(slot)?.score ?? 0;
    const afterScore = after.get(slot)?.score ?? 0;
    if (afterScore < beforeScore) return { ok: false, reason: 'downgrade' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// One market-visit decision: buy an upgrade, else sell a spare, else ratchet.
// Pure: the caller applies ownedGear/goldDelta/wealthGoal/stock atomically
// from the single returned result, so one side can never survive without
// the other (mirrors the BUILD 700 purchase flow).
// ---------------------------------------------------------------------------

export type NpcGearVisitResult = {
  action: 'buy' | 'sell' | 'ratchet' | 'none';
  ownedGear: string[];
  /** Gold change for the NPC (applied via goldDelta, like BUILD 700). */
  goldDelta: number;
  wealthGoal: number;
  stock: StallStockState;
  bark: string | null;
  boughtGood?: ShopItemKey;
  boughtBaseId?: string;
  soldBaseId?: string;
  soldGood?: ShopItemKey;
  price?: number;
};

const BUY_BARKS: Partial<Record<ShopItemKey, string>> = {
  swords: 'A real blade at last!',
  daggers: 'A sharp little friend.',
  bow: 'Now I can hunt properly.',
};

export function resolveNpcGearVisit(input: {
  holder: GearHolder;
  wornBaseIds: readonly string[];
  gold: number;
  stall: StallShopDef;
  stock: StallStockState;
}): NpcGearVisitResult {
  const { holder, wornBaseIds, gold, stall, stock } = input;
  const owned = effectiveOwnedGear(holder);
  const goal = ratchetWealthGoal(effectiveWealthGoal(holder), gold);
  const base: Omit<NpcGearVisitResult, 'action' | 'bark'> = {
    ownedGear: owned, goldDelta: 0, wealthGoal: goal, stock,
  };
  if (holder.archetype === 'child') {
    return { ...base, action: goal !== effectiveWealthGoal(holder) ? 'ratchet' : 'none', bark: null };
  }
  // 1. Buy: an unmet want whose good this stall sells and the NPC affords.
  const stallGearGoods = stall.goods.map((g) => g.key).filter((k) => k in SHOP_GEAR_GOODS);
  const want = gearWant(holder.archetype, wornBaseIds, owned, stallGearGoods);
  if (want?.targetGood && want.targetBaseId) {
    const result = buyFromStall(stall, stock, want.targetGood, gold);
    if (result.ok) {
      return {
        ...base,
        action: 'buy',
        ownedGear: [...owned, want.targetBaseId],
        goldDelta: -result.coinsSpent,
        stock: result.state,
        bark: BUY_BARKS[want.targetGood] ?? 'A fine upgrade!',
        boughtGood: want.targetGood,
        boughtBaseId: want.targetBaseId,
        price: result.price,
      };
    }
  }
  // 2. Sell: the first stash piece the stall buys that passes all guardrails.
  for (const baseId of owned) {
    const good = stallGoodForBase(baseId);
    if (!good) continue;
    if (!canSellGear(holder.archetype, wornBaseIds, owned, baseId).ok) continue;
    const price = SHOP_CATALOG[good].sellPrice;
    if (price <= 0) continue;
    const remaining = [...owned];
    remaining.splice(remaining.indexOf(baseId), 1);
    return {
      ...base,
      action: 'sell',
      ownedGear: remaining,
      goldDelta: price,
      bark: 'Sold a spare — good price.',
      soldBaseId: baseId,
      soldGood: good,
      price,
    };
  }
  // 3. Otherwise only the goal may have moved.
  return {
    ...base,
    action: goal !== effectiveWealthGoal(holder) ? 'ratchet' : 'none',
    bark: null,
  };
}

// ---------------------------------------------------------------------------
// Examine line: what this NPC wants, what it's saving toward, how it's doing.
// ---------------------------------------------------------------------------

/** One player-readable sentence set for Examine (stall-independent wants). */
export function gearExamineLine(
  holder: GearHolder,
  wornBaseIds: readonly string[],
  gold: number,
): string {
  const owned = effectiveOwnedGear(holder);
  const goal = effectiveWealthGoal(holder);
  const want = gearWant(holder.archetype, wornBaseIds, owned,
    Object.keys(SHOP_GEAR_GOODS) as ShopItemKey[]);
  const parts: string[] = [];
  if (want?.kind === 'need' && want.slot === 'weapon') {
    parts.push(want.targetBaseId
      ? `They carry no weapon — a ${gearBaseName(want.targetBaseId)} from the market would do.`
      : 'They carry no weapon and could use one.');
  } else if (want?.kind === 'need' && want.slot === 'armor') {
    parts.push('They wear no armor — even a sturdy cap would help.');
  } else if (want?.kind === 'want' && want.currentBaseId && want.targetBaseId) {
    parts.push(`They'd love a better weapon — their ${gearBaseName(want.currentBaseId)} is no match for the ${gearBaseName(want.targetBaseId)} sold at market.`);
  } else {
    parts.push("They're content with their gear.");
  }
  if (gold >= goal) parts.push(`They've already passed their savings goal of ${goal} gold.`);
  else parts.push(`They're saving toward ${goal} gold.`);
  if (lifestyleTier(gold, goal) >= 2) parts.push('Success suits them — they enjoy the finer things these days.');
  return parts.join(' ');
}

/** Convenience: worn gear for an NPC id (BUILD 921 bridge, re-exported). */
export function npcWornGear(npcId: string): string[] {
  return wornGearBaseIds(npcId);
}
