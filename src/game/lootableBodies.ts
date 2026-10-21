// Lootable bodies (BUILD 522 — Advanced World Reactivity).
//
// When an NPC dies, their body remains in the world as a lootable entity.
// Player interacts to open loot, takes items, body is marked looted.
// Pure loot-generation module — tested in scripts/simulate.ts.

export interface BodyLoot {
  gold: number;
  potions: number;
  /** Item IDs (for future ARPG integration). */
  items: string[];
}

export interface LootableBody {
  /** Unique ID. */
  id: string;
  /** NPC ID who died. */
  npcId: string;
  /** NPC name for display. */
  npcName: string;
  /** Chunk. */
  chunk: { x: number; y: number };
  /** Position within chunk. */
  position: { x: number; y: number };
  /** Game day of death. */
  day: number;
  /** Loot contents. */
  loot: BodyLoot;
  /** Whether fully looted. */
  looted: boolean;
}

/**
 * Generate loot for a dead NPC. Pure, deterministic given seed.
 * Merchants/guards carry more gold; generic NPCs carry less.
 */
export function generateBodyLoot(
  npcRole: string,
  seed: number,
): BodyLoot {
  // Simple deterministic PRNG.
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const isMerchant = npcRole.toLowerCase().includes('merchant') || npcRole.toLowerCase().includes('shop');
  const isGuard = npcRole.toLowerCase().includes('guard');
  const baseGold = isMerchant ? 30 : isGuard ? 20 : 10;
  const gold = baseGold + Math.floor(rand() * 20);
  const potions = rand() < 0.3 ? 1 : 0;
  return { gold, potions, items: [] };
}

/**
 * Create a lootable body. Pure.
 * BUILD 921: `gearItemIds` are the dead NPC's worn-gear item-base ids
 * (see npcGear.wornGearBaseIds) — they join the rolled gold/potions as
 * the body's item loot, so the corpse drops what it was wearing. Bodies
 * created without gear (old callers, old saves) simply have no gear loot.
 */
export function createBody(
  id: string,
  npcId: string,
  npcName: string,
  npcRole: string,
  chunk: { x: number; y: number },
  position: { x: number; y: number },
  day: number,
  seed: number,
  gearItemIds: string[] = [],
): LootableBody {
  return {
    id,
    npcId,
    npcName,
    chunk: { ...chunk },
    position: { ...position },
    day,
    loot: { ...generateBodyLoot(npcRole, seed), items: [...gearItemIds] },
    looted: false,
  };
}

/**
 * Take all loot from a body. Returns { loot, updatedBody }.
 * Pure.
 */
export function lootBody(body: LootableBody): { loot: BodyLoot; updatedBody: LootableBody } {
  return {
    loot: { ...body.loot },
    updatedBody: { ...body, looted: true, loot: { gold: 0, potions: 0, items: [] } },
  };
}

/** A single selection from the body-loot panel. */
export type BodyLootSelection =
  | { kind: 'gold' }
  | { kind: 'potion' }
  | { kind: 'item'; itemId: string };

/**
 * Take only the selected loot entry, leaving every other entry on the body.
 * Returns null for stale/invalid selections. The caller transfers the returned
 * loot to the player's inventory and persists updatedBody.
 */
export function takeBodyLootSelection(
  body: LootableBody,
  selection: BodyLootSelection,
): { taken: BodyLoot; updatedBody: LootableBody } | null {
  if (body.looted) return null;
  const remaining: BodyLoot = { ...body.loot, items: [...body.loot.items] };
  const taken: BodyLoot = { gold: 0, potions: 0, items: [] };
  if (selection.kind === 'gold') {
    if (remaining.gold <= 0) return null;
    taken.gold = remaining.gold;
    remaining.gold = 0;
  } else if (selection.kind === 'potion') {
    if (remaining.potions <= 0) return null;
    taken.potions = 1;
    remaining.potions -= 1;
  } else {
    const index = remaining.items.indexOf(selection.itemId);
    if (index < 0) return null;
    taken.items.push(remaining.items.splice(index, 1)[0]);
  }
  const empty = remaining.gold <= 0 && remaining.potions <= 0 && remaining.items.length === 0;
  return {
    taken,
    updatedBody: { ...body, loot: remaining, looted: empty },
  };
}
