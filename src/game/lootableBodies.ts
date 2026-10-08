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
): LootableBody {
  return {
    id,
    npcId,
    npcName,
    chunk: { ...chunk },
    position: { ...position },
    day,
    loot: generateBodyLoot(npcRole, seed),
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
