// BUILD 963: visible, lootable house chests — one chest per house.
//
// USER ORDER (2026-10-21): "make sure we can see and loot house chests,
// and there's a chest in every house."
//
// RELATIONSHIP TO BUILD 949 (stated, not blurred): the 949 family chests
// are DATA records per household (coins -> bank ledger, items -> chest
// record, deposit-only, inspector-visible, no physical object). These 963
// chests are DIFFERENT containers: visible world objects beside each
// house's door, holding generated household goods the player can loot.
// The 949 system is untouched — NPC delve hauls still drain to the bank
// ledger and family-chest records exactly as before, and nothing here
// reads or writes those records. A house therefore has both a family
// chest record (NPC storage) and a visible chest (player loot), and the
// two never share contents, so no loot is ever double-counted.
//
// WHAT "EVERY HOUSE" MEANS: one chest per doorway from
// buildingDoorwaysFor — settlement houses in every settlement chunk plus
// farmhouses in meadow/grassland/greenvale chunks. Doorways are computed
// fresh per chunk (never persisted), so chests are derived the same way:
// deterministic from chunk + doorway id. Saves persist ONLY what the
// player took (HouseChestTakes), never positions or contents — an old
// save gains every chest at full contents on first load.
//
// PLACEMENT (one rule, no interior assumption): interiors are unreachable
// in current builds (BUILD 957 gap — all entry paths dead, houses are
// exterior-only), so chests sit in the exterior world, south of the
// house beside the exit spawn: door.x +/- 5.5, rect.bottom + 2.0. The
// lateral offset keeps the chest off the door's serving lane (lanes run
// on the door axis) and off the exit spawn point (door.x, bottom + 0.7);
// the first candidate that lands outside every house rect in the chunk
// (1-unit padding) wins, so a chest never hides inside a neighboring
// row house. Chests do NOT block movement — they are loot markers like
// ground drops and corpses, not collision. Moved houses (debug mover)
// move their chest with them, because App applies the same houseOffsets
// to the doorway before placing the chest; the iso view applies no
// offsets to its buildings either, so chest and building agree there too.
//
// CONTENTS (existing items only): seeded by chest id, stable across
// loads — coins 5-20 plus one household item from HOUSEHOLD_CHEST_POOL,
// with a 30% chance of a second, distinct item. Every pool id is an
// existing catalog base (asserted by houseChestPoolIsKnown); no item is
// invented. Contents are generated household goods, NOT the household's
// 949 stored loot.
//
// OWNERSHIP / THEFT (decided, wired in App, not left ambiguous):
// - The tutorial house (doorway id 'tutorial-house-door') is the
//   player's own starting house: its chest is FREE, never a crime.
// - Every other house chest belongs to someone else. TAKING from it is
//   theft (crime type 'theft', severity 2, the existing 521/926 crime
//   machinery): witnesses are townsfolk within radius 25 (12 while
//   sneaking, the 932 rule), a witnessed theft posts a pending report
//   via registerPlayerCrime (no instant bounty — the 926 rule), breaks
//   sneak, and files PLAYER_STOLE_FROM_ME memories on witnesses; an
//   unwitnessed theft posts nothing and leaves sneak on. ONE report per
//   chest, on the first take — later takes from the same chest do not
//   re-report. Witnesses exist only where townsfolk live (Mosslight,
//   chunk 4,7): in any other chunk there is nobody to see the theft, so
//   no report can form — the same outcome as unwitnessed crime anywhere.
//   OPENING a chest is never a crime; only taking is.
// - Looted chests stay empty: no restock. A fully looted chest stays
//   drawn (it is furniture) but dimmed, with no pulse and no label.
//
// CARRY GATE (BUILD 950, mirrored from body loot): coins are never
// gated (coins weigh 0). An item take runs the already-over gate BEFORE
// the take is recorded, so a refused item stays in the chest with the
// "Too heavy" message — never silently eaten, never deleted to fit.
//
// Purity: every function here is pure (no Math.random, no Date) — the
// App owns RNG for generated equipment (same generateItem pattern as
// the 921/962 Take paths) and owns all crime/bounty state.

import { ITEM_BASES } from './items';
import { FIELD_SIZE } from './fieldCamera';
import { BANK_DOORWAY_ID } from './mosslightLayout';

// BUILD 982: the Mosslight Bank is not a house, so no 963 chest derives
// from its doorway — stored items are reached only through the 970 bank
// service, never by looting a room. (The converted filler's old generic
// chest id stops deriving; any recorded takes against it remain as
// orphaned entries in houseChestTakes, harmless and never displayed.)
export function isHouseChestExcluded(doorwayId: string): boolean {
  return doorwayId === BANK_DOORWAY_ID;
}

export type HouseChestRect = { left: number; top: number; right: number; bottom: number };
export type HouseChestPoint = { x: number; y: number };

/** A house chest, derived for one doorway. Contents are pre-take. */
export type HouseChest = {
  /** Deterministic id: `house-chest:<cx>,<cy>:<doorwayId>`. */
  id: string;
  chunk: { x: number; y: number };
  /** Doorway id this chest belongs to (the house's stable id). */
  houseId: string;
  /** House display name (doorway area name). */
  houseName: string;
  /** Field-unit position inside the chunk (0..FIELD_SIZE space, clamped 2..FIELD_SIZE-2). */
  position: HouseChestPoint;
  /** True only for the player's own starting house — free, never theft. */
  ownHouse: boolean;
  /** Generated contents, before takes. */
  coins: number;
  /** Generated item base ids, before takes (distinct within a chest). */
  baseIds: string[];
};

/** Doorway id of the player's own starting house. */
export const OWN_HOUSE_DOORWAY_ID = 'tutorial-house-door';

/** Lateral offset from the door axis for the chest (clears lane + exit). */
export const HOUSE_CHEST_SIDE_OFFSET = 5.5;
/** How far south of the house rect the chest sits. */
export const HOUSE_CHEST_SOUTH_OFFSET = 2.0;
/** Padding a chest candidate must keep from every house rect. */
export const HOUSE_CHEST_RECT_PADDING = 1;

/** Household goods pool — every id is an existing catalog base. */
export const HOUSEHOLD_CHEST_POOL: string[] = [
  'dagger',
  'cloth_hood',
  'cloth_gloves',
  'worn_boots',
  'copper_ring',
  'leather_cap',
];

export function houseChestIdFor(chunk: { x: number; y: number }, doorwayId: string): string {
  return `house-chest:${chunk.x},${chunk.y}:${doorwayId}`;
}

export function isOwnHouseChest(doorwayId: string): boolean {
  return doorwayId === OWN_HOUSE_DOORWAY_ID;
}

/** FNV-1a hash over the chest id — the single seed for its contents. */
export function houseChestSeed(chestId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < chestId.length; i++) {
    h ^= chestId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Small LCG step over the seed (deterministic, no Math.random). */
function nextRand(seed: number): { value: number; seed: number } {
  const next = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return { value: (next >>> 0) / 0x100000000, seed: next };
}

/**
 * Generated contents for a chest id: coins 5-20, one pool item, and a
 * 30% chance of a second, distinct pool item. Pure and stable: the same
 * id always yields the same contents, so loads never re-roll a chest.
 */
export function houseChestContents(chestId: string): { coins: number; baseIds: string[] } {
  let seed = houseChestSeed(chestId);
  const r1 = nextRand(seed); seed = r1.seed;
  const coins = 5 + Math.floor(r1.value * 16);
  const r2 = nextRand(seed); seed = r2.seed;
  const first = HOUSEHOLD_CHEST_POOL[Math.floor(r2.value * HOUSEHOLD_CHEST_POOL.length)];
  const baseIds = [first];
  const r3 = nextRand(seed); seed = r3.seed;
  if (r3.value < 0.3) {
    const r4 = nextRand(seed);
    let second = HOUSEHOLD_CHEST_POOL[Math.floor(r4.value * HOUSEHOLD_CHEST_POOL.length)];
    if (second === first) second = HOUSEHOLD_CHEST_POOL[(HOUSEHOLD_CHEST_POOL.indexOf(first) + 1) % HOUSEHOLD_CHEST_POOL.length];
    baseIds.push(second);
  }
  return { coins, baseIds };
}

/** True when every pool id exists in the item catalog. */
export function houseChestPoolIsKnown(): boolean {
  const known = new Set(ITEM_BASES.map((b) => b.id));
  return HOUSEHOLD_CHEST_POOL.every((id) => known.has(id));
}

function clampField(v: number): number {
  // Field space is FIELD_SIZE (280, fieldCamera.ts) — not the stale 140
  // some older comments cite. Clamping to 138 would strand every chest
  // east of mid-field at x=138, far from its door (caught live in 963).
  return Math.min(FIELD_SIZE - 2, Math.max(2, v));
}

function insideRect(p: HouseChestPoint, r: HouseChestRect, padding: number): boolean {
  return p.x >= r.left - padding && p.x <= r.right + padding && p.y >= r.top - padding && p.y <= r.bottom + padding;
}

/**
 * Chest position for one doorway. Candidates south of the house beside
 * the exit spawn, in priority order: right of the door axis, left of it,
 * then centered. The first candidate outside every rect in `allRects`
 * (1-unit padding) wins; if all three collide, the right-side candidate
 * is returned clamped (a chest never vanishes because the town is dense).
 * `allRects` must include this house's own rect (the south offset puts
 * every candidate outside it, but the check is uniform).
 */
export function houseChestPosition(
  rect: HouseChestRect,
  door: HouseChestPoint,
  allRects: readonly HouseChestRect[],
): HouseChestPoint {
  const y = clampField(rect.bottom + HOUSE_CHEST_SOUTH_OFFSET);
  const candidates: HouseChestPoint[] = [
    { x: clampField(door.x + HOUSE_CHEST_SIDE_OFFSET), y },
    { x: clampField(door.x - HOUSE_CHEST_SIDE_OFFSET), y },
    { x: clampField(door.x), y },
  ];
  for (const candidate of candidates) {
    if (!allRects.some((r) => insideRect(candidate, r, HOUSE_CHEST_RECT_PADDING))) return candidate;
  }
  return candidates[0];
}

/**
 * Derive the chest for one doorway. `rect` and `door` must already carry
 * the house's mover offset (App applies houseOffsets first); `allRects`
 * is every (offset) house rect in the chunk, for collision avoidance.
 */
export function houseChestForDoorway(
  chunk: { x: number; y: number },
  doorway: { id: string; rect: HouseChestRect; position: HouseChestPoint; areaName: string },
  allRects: readonly HouseChestRect[],
): HouseChest {
  const id = houseChestIdFor(chunk, doorway.id);
  const contents = houseChestContents(id);
  return {
    id,
    chunk: { ...chunk },
    houseId: doorway.id,
    houseName: doorway.areaName,
    position: houseChestPosition(doorway.rect, doorway.position, allRects),
    ownHouse: isOwnHouseChest(doorway.id),
    coins: contents.coins,
    baseIds: contents.baseIds,
  };
}

/** What the player has taken from one chest (the only persisted part). */
export type HouseChestTake = {
  coinsTaken: boolean;
  itemsTaken: string[];
  /** The theft consequence was resolved (reported, or unwitnessed). */
  theftReported: boolean;
};

export type HouseChestTakes = Record<string, HouseChestTake>;

export const EMPTY_HOUSE_CHEST_TAKES: HouseChestTakes = {};

function cleanTake(value: unknown): HouseChestTake | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.coinsTaken !== 'boolean' || typeof r.theftReported !== 'boolean') return null;
  if (!Array.isArray(r.itemsTaken)) return null;
  const items = r.itemsTaken.filter((i): i is string => typeof i === 'string' && i.length > 0);
  return { coinsTaken: r.coinsTaken, theftReported: r.theftReported, itemsTaken: items };
}

/** Remaining contents of a chest after takes (what the panel shows). */
export function remainingChestContents(
  chest: HouseChest,
  takes: HouseChestTakes,
): { coins: number; baseIds: string[] } {
  const take = takes[chest.id];
  if (!take) return { coins: chest.coins, baseIds: [...chest.baseIds] };
  return {
    coins: take.coinsTaken ? 0 : chest.coins,
    baseIds: chest.baseIds.filter((id) => !take.itemsTaken.includes(id)),
  };
}

/** True when nothing remains to take. */
export function chestFullyLooted(chest: HouseChest, takes: HouseChestTakes): boolean {
  const remaining = remainingChestContents(chest, takes);
  return remaining.coins <= 0 && remaining.baseIds.length === 0;
}

/** True when the chest still has something the player has not taken. */
export function chestHasLoot(chest: HouseChest, takes: HouseChestTakes): boolean {
  return !chestFullyLooted(chest, takes);
}

/**
 * Record a take. Pure and immutable; returns the same record object when
 * the take is a no-op (already taken, or unknown item), so callers can
 * skip state churn. Theft reporting is the caller's job (App owns crime
 * state); this only records that the take happened.
 */
export function recordHouseChestTake(
  takes: HouseChestTakes,
  chest: HouseChest,
  kind: 'coins' | 'item',
  baseId?: string,
): { takes: HouseChestTakes; ok: boolean } {
  const remaining = remainingChestContents(chest, takes);
  if (kind === 'coins') {
    if (remaining.coins <= 0) return { takes, ok: false };
  } else {
    if (!baseId || !remaining.baseIds.includes(baseId)) return { takes, ok: false };
  }
  const prev = takes[chest.id] ?? { coinsTaken: false, itemsTaken: [], theftReported: false };
  const next: HouseChestTake = {
    coinsTaken: kind === 'coins' ? true : prev.coinsTaken,
    itemsTaken: kind === 'item' && baseId ? [...prev.itemsTaken, baseId] : [...prev.itemsTaken],
    theftReported: prev.theftReported,
  };
  return { takes: { ...takes, [chest.id]: next }, ok: true };
}

/** Mark a chest's theft consequence resolved (reported or unwitnessed). */
export function markChestTheftReported(takes: HouseChestTakes, chestId: string): HouseChestTakes {
  const prev = takes[chestId] ?? { coinsTaken: false, itemsTaken: [], theftReported: false };
  if (prev.theftReported) return takes;
  return { ...takes, [chestId]: { ...prev, theftReported: true } };
}

/** Serialize takes for the save payload (JSON string, like openedChests). */
export function serializeHouseChestTakes(takes: HouseChestTakes): string {
  return JSON.stringify(takes);
}

/** Parse takes from a save. Tolerant: malformed entries are dropped. */
export function parseHouseChestTakes(data: string | undefined | null): HouseChestTakes {
  if (!data) return {};
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: HouseChestTakes = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const clean = cleanTake(value);
      if (clean) out[key] = clean;
    }
    return out;
  } catch {
    return {};
  }
}
