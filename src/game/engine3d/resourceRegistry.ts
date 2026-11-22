/**
 * BUILD 1064 — R-1 unified resource registry: ONE authoritative
 * resource system replacing the four disconnected inventories.
 *
 * AUDIT (traced before any code — what each inventory was):
 * - PLAYER INVENTORY (3D): Engine3DWorldView's inventoryRef, a loose
 *   Record<string, number> persisted to 'ag-3d-inventory-v1' with keys
 *   wood/stone/gold/wheat plus '<name> loot' keepsakes. E-key gather
 *   wrote straight into it (crate +1 wood, rock +1 stone, tree +2
 *   wood, farm +2 wheat, loot +5 gold). No capacity, no location,
 *   no quality, no record of where a unit came from — a unit of
 *   wood from a crate and a unit from a tree were indistinguishable.
 * - FOUNDER STOCKPILE: two plain number refs (founderStockpileRef /
 *   founderFoodRef), saved in ag-3d-founders-v1 v4 as stockpileWood
 *   + foodStock. Deliveries raised them, construction spent them.
 *   No capacity, no per-source tracking, no location beyond the
 *   pile tile the fx drew.
 * - 2.5D RESOURCES: resources.ts ResourcePopulation (plant
 *   populations: grass/berries/mushrooms/herbs/trees/flowers with a
 *   density 0..1, growth, regrowth) — the ecological source, but
 *   disconnected from every store: a density is not a count, and no
 *   store ever read it.
 * - TOWN STORAGE: civilization.ts Settlement.storage, a
 *   Record<Resource, number> (19 kinds) per settlement, capped at
 *   50 + population per resource. The 2.5D ledger — the 27 Aldoria
 *   settlements are not loaded in 3D at all, so the 3D camp's real
 *   wood/food and the coordinator's camp ledger were two numbers
 *   that never met (BUILD 1062: "Unifying the two ledgers is R-1").
 *
 * THE REGISTRY: one record of what exists, where it is, how much
 * there is, what quality it is, how much its holder can hold, and
 * how it is obtained. A registry entry is one (holder, kind) pair:
 *   - STORES hold resources: 'player' (carried, uncapped), 'camp'
 *     (the founders' stockpile, uncapped — the same as today; a
 *     capacity is a later build, not a silent behaviour change),
 *     'carrier:<founderId>' (a founder carrying wood — capacity 2,
 *     the real carry limit), 'settlement:<id>' (a 2.5D settlement's
 *     storage, capped 50 + population per resource — the existing
 *     civilization rule).
 *   - DEPOSITS are world sources, not stores: a tree (2 wood, chop),
 *     a rock (1 stone, mine), a crate (1 wood, collect). A deposit's
 *     id IS its entity id (entityIds.ts — tree:122,122), its
 *     location is its tile, its capacity is its yield. Extracting
 *     a deposit removes it (a chopped tree holds no more wood) and
 *     the yield moves into a store with the deposit as its source.
 *     Wild trees/rocks are SOURCES, not deposits: they are a hash
 *     rule, not a stored list (the F-1 treatment), so the E-key
 *     wild handler deposits with the wild id as its source instead
 *     of extracting a deposit that was never listed.
 *   - FARM TILES are not deposits yet: their wheat is time-based
 *     (growth stage), not a stored object — a live growth tracker
 *     is scheduler work. A harvest still deposits grain into the
 *     player store with the farm tile as its source, so the grain
 *     is tracked even though its source is not a deposit entry.
 * - NO FAKE RESOURCES: every deposit names its source (an entity
 *   id, starting supplies, a production settlement, a trade route,
 *   an event, or a load restore). A deposit with no valid source
 *   adds nothing — the registry never creates a unit from nowhere.
 * - TRANSFERS conserve: a transfer withdraws from the source and
 *   deposits into the destination; what does not fit stays in the
 *   source. The founder chain is a real transfer (tree deposit →
 *   carrier store → camp store), and the total is constant across it.
 * - QUALITY is 0..1 and is 1 (standard) for everything today — no
 *   quality model exists yet (a tree is a tree, a rock is a rock,
 *   wheat has a growth stage, not a quality). The field is real and
 *   carried, so a later build can vary it without reshaping the
 *   registry; depositInto accepts a quality override for that day.
 * - The registry is the RUNTIME authority. The saves are its
 *   serialization in their existing shapes (founders v4, the
 *   INVENTORY_KEY record, the living-world save) — no save version
 *   moves in this build, so the parked Tamsin stash's v4 claim is
 *   untouched and still rebases to v5 on its own resume. The
 *   registry is rebuilt from the world + the saves on load, and the
 *   saves are written back from the registry. A loaded entry's
 *   source is 'loaded' (the save does not record where a unit came
 *   from — honest, not invented).
 * - The coordinator's camp settlement storage is a MIRROR of the
 *   registry's camp store, not a second store: the view syncs the
 *   camp store into settlement.storage before advancing (so the
 *   coordinator sees the real numbers) and back after (so any
 *   coordinator change lands in the registry). The 2.5D settlement
 *   stores exist for the coordinator/sim, not for the live 3D game.
 *
 * Pure module (no React, no WebGL, no localStorage) so the sim and
 * the standalone asserts can import it directly. The view owns the
 * ref and calls the load/save bridges; founders.ts / construction.ts
 * own the registry-aware eat/deliver/chop/spend helpers.
 */

import { RESOURCES, type Resource, type Settlement } from '../civilization';
import type { ResourcePopulation } from '../resources';
import { crateId, rockId, treeId } from './entityIds';
import type { IsoWorld } from '../iso/isoWorld';

/** A resource kind the registry can hold: the 19 civilization
 *  kinds, plus gold — the player's carried currency (civilization
 *  keeps gold as a kingdom treasury number, not a Resource, but the
 *  player loots and carries real gold, so the registry names it).
 *  BUILD 1102: meat joins them — the hunter's yield, a food the
 *  granary holds beside fish (fish, wool and leather are already
 *  civilization Resources). */
// BUILD 1081: copper and silver join gold as registry kinds — the
// 1.2 deposits are the first copper/silver in the game (gold's only
// 3D source before this was looting dead NPCs).
export type RegistryKind = Resource | 'gold' | 'copper' | 'silver' | 'flour' | 'ingot' | 'furniture' | 'meat' | 'stick' | 'berry' | 'fibre' | 'herb' | 'torch' | 'handle' | 'bow' | 'shield' | 'copper-ingot' | 'steel' | 'copper-axe' | 'copper-pickaxe' | 'iron-axe' | 'iron-pickaxe' | 'iron-sword' | 'steel-axe' | 'steel-pickaxe' | 'steel-sword' | 'potion-heal';
// BUILD 1110 (0x2D): stick/berry/fibre/herb/torch join the registry —
// the gathering engine's goods (bushes, herbs, hand-crafting) are
// real conserved resources, not record-only keepsakes, so they ride
// the one shared database the spec's section 7 demands.
export const REGISTRY_KINDS: RegistryKind[] = [...RESOURCES, 'gold', 'copper', 'silver', 'flour', 'ingot', 'furniture', 'meat', 'stick', 'berry', 'fibre', 'herb', 'torch', 'handle', 'bow', 'shield', 'copper-ingot', 'steel', 'copper-axe', 'copper-pickaxe', 'iron-axe', 'iron-pickaxe', 'iron-sword', 'steel-axe', 'steel-pickaxe', 'steel-sword', 'potion-heal'];

/** The player's inventory key for a registry kind: wheat is grain
 *  (the 3D farm crop is the civilization grain kind — the HUD keeps
 *  showing "Wheat", the display name, not the kind). Every other
 *  kind keeps its own name. Null when the kind has no player key
 *  (the 2.5D kinds the player never carries). */
export function playerKeyFor(kind: RegistryKind): string | null {
  if (kind === 'grain') return 'wheat';
  if (kind === 'wood' || kind === 'stone' || kind === 'gold' || kind === 'food') return kind;
  // BUILD 1110 (0x2D): mined ore + gathering goods are carried kinds
  // now (the player mines iron/copper/coal/silver and gathers
  // sticks/berries/fibre/herbs; torches are carried too).
  if (kind === 'iron' || kind === 'copper' || kind === 'coal' || kind === 'silver' || kind === 'stick' || kind === 'berry' || kind === 'fibre' || kind === 'herb' || kind === 'torch') return kind;
  // BUILD 1111 (0x2E): station products + smelted goods are carried kinds
  // now (the player smelts ingots, forges gear, brews potions — all of it
  // lands in the player store, so all of it must map to a player key).
  if (kind === 'ingot' || kind === 'furniture' || kind === 'medicine' || kind === 'handle' || kind === 'bow' || kind === 'shield' || kind === 'copper-ingot' || kind === 'steel' || kind === 'copper-axe' || kind === 'copper-pickaxe' || kind === 'iron-axe' || kind === 'iron-pickaxe' || kind === 'iron-sword' || kind === 'steel-axe' || kind === 'steel-pickaxe' || kind === 'steel-sword' || kind === 'potion-heal') return kind;
  return null;
}

/** The registry kind for a player inventory key, or null for a
 *  non-resource key (a '<name> loot' keepsake is memorabilia, not
 *  a resource — the adapter leaves it out of the registry). */
export function kindForPlayerKey(key: string): RegistryKind | null {
  if (key === 'wheat') return 'grain';
  if (key === 'wood' || key === 'stone' || key === 'gold' || key === 'food') return key;
  // BUILD 1110 (0x2D): mined ore + gathering goods (see playerKeyFor).
  if (key === 'iron' || key === 'copper' || key === 'coal' || key === 'silver' || key === 'stick' || key === 'berry' || key === 'fibre' || key === 'herb' || key === 'torch') return key as RegistryKind;
  // BUILD 1111 (0x2E): station products + smelted goods (see playerKeyFor).
  if (key === 'ingot' || key === 'furniture' || key === 'medicine' || key === 'handle' || key === 'bow' || key === 'shield' || key === 'copper-ingot' || key === 'steel' || key === 'copper-axe' || key === 'copper-pickaxe' || key === 'iron-axe' || key === 'iron-pickaxe' || key === 'iron-sword' || key === 'steel-axe' || key === 'steel-pickaxe' || key === 'steel-sword' || key === 'potion-heal') return key as RegistryKind;
  return null;
}

/** The player inventory's resource keys (the ones the registry
 *  owns; keepsakes are the other keys in the same record). */
// BUILD 1109 (0x2C): 'food' joined the player bridge. kindForPlayerKey
// already mapped food->food, but the bridge never mirrored it and
// keepsakesOf dropped it — so a meal granted to the player (the 1108
// givePlayerItem hook) was deposited into the registry and then
// invisible: never in the record, never in the slots. Meals are now
// registry-tracked for the player like the other carried kinds, so
// the hotbar can use one. The settlement sim never touches the
// player store's food (founders eat from the granary store).
// BUILD 1110 (0x2D): mined ore + gathering goods join the bridge
// (the 1109 food precedent — kindForPlayerKey already mapped them
// once this build, but the mirror never copied them, so a mined
// iron ore would have been deposited and then invisible, the exact
// bug 1108/1109 fixed for tools/food).
export const PLAYER_RESOURCE_KEYS = ['wood', 'stone', 'gold', 'wheat', 'food', 'iron', 'copper', 'coal', 'silver', 'stick', 'berry', 'fibre', 'herb', 'torch', 'ingot', 'furniture', 'medicine', 'handle', 'bow', 'shield', 'copper-ingot', 'steel', 'copper-axe', 'copper-pickaxe', 'iron-axe', 'iron-pickaxe', 'iron-sword', 'steel-axe', 'steel-pickaxe', 'steel-sword', 'potion-heal'];

/** How more of a resource is obtained (null = cannot be extracted
 *  — gold is looted/earned, never mined). */
export type ExtractionMethod = 'chop' | 'mine' | 'collect' | 'harvest' | 'produce' | 'trade';

/** Where a deposited unit came from. A deposit without a valid
 *  source adds nothing — the registry never creates a unit from
 *  nowhere. 'loaded' is a restore (the save does not record where
 *  a unit came from); 'starting' is the founders' starting food. */
export type ResourceSource =
  | { type: 'entity'; id: string }
  | { type: 'starting' }
  | { type: 'loaded' }
  | { type: 'production'; settlementId: string }
  | { type: 'trade'; routeId: string }
  | { type: 'event'; eventId: string };

/** True when a value is a usable source (non-empty ids only). */
export function isValidSource(value: unknown): value is ResourceSource {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  switch (s.type) {
    case 'entity':
      return typeof s.id === 'string' && s.id.length > 0;
    case 'starting':
    case 'loaded':
      return true;
    case 'production':
      return typeof s.settlementId === 'string' && s.settlementId.length > 0;
    case 'trade':
      return typeof s.routeId === 'string' && s.routeId.length > 0;
    case 'event':
      return typeof s.eventId === 'string' && s.eventId.length > 0;
    default:
      return false;
  }
}

// --- Stores ---

/** A store's kind: what holds the resource. */
export type StoreKind = 'player' | 'camp' | 'settlement' | 'carrier' | 'storehouse' | 'granary' | 'inn';

/** The player's carried store (uncapped, owner 'player'). */
export const PLAYER_STORE_ID = 'player';
/** The founders' camp stockpile store (uncapped, the pile tile). */
export const CAMP_STORE_ID = 'camp';
/** BUILD 1090 (2.5): the granary store — the camp's food store
 *  (grain + meals), capped per resource (granary.ts). The camp
 *  store keeps wood + stone; food + grain live here now. */
export const GRANARY_STORE_ID = 'granary';
/** BUILD 1096 (0x1F): the inn store — the inn's food store (meals
 *  for resting travelers), capped at INN_CAPACITY_FOOD (housing.ts).
 *  Topped up from the granary at the day boundary; a traveler eats
 *  one meal from it while resting. */
export const INN_STORE_ID = 'inn';

/** A 2.5D settlement's storage as a registry store. */
export function settlementStoreId(id: string): string {
  return 'settlement:' + id;
}

/** A founder's carried wood as a registry store (capacity 2 — the
 *  real carry limit, FOUNDER_WOOD_PER_TREE). */
export function carrierStoreId(founderId: string): string {
  return 'carrier:' + founderId;
}

/** The kind a store id names, or null for a string that is not a
 *  store id this module produces. */
export function storeKindOf(storeId: string): StoreKind | null {
  if (typeof storeId !== 'string' || storeId.length === 0) return null;
  if (storeId === PLAYER_STORE_ID) return 'player';
  if (storeId === CAMP_STORE_ID) return 'camp';
  // BUILD 1087 (2.2): the storehouse store — the settlement's
  // materials store, capped per resource (storehouse.ts).
  if (storeId === 'storehouse') return 'storehouse';
  // BUILD 1090 (2.5): the granary store — the camp's food store,
  // capped per resource (granary.ts).
  if (storeId === GRANARY_STORE_ID) return 'granary';
  // BUILD 1096 (0x1F): the inn store (housing.ts).
  if (storeId === INN_STORE_ID) return 'inn';
  if (storeId.startsWith('settlement:')) return 'settlement';
  if (storeId.startsWith('carrier:')) return 'carrier';
  return null;
}

// --- Entries ---

/** One (holder, kind) pair: every resource the registry knows has
 *  a quantity, a quality, a capacity, a location, an extraction
 *  method, a source, and an owner. A store entry's storeId names
 *  its store; a world deposit's storeId is null (it is in the
 *  world, not in a store) and its id is its entity id. */
export type RegistryEntry = {
  id: string;
  storeId: string | null;
  kind: RegistryKind;
  qty: number;
  /** 0..1 (1 = standard — everything today is 1). */
  quality: number;
  /** Max units this entry can hold (Infinity = uncapped). */
  capacity: number;
  /** The physical tile the resource sits on (the carrier's tile
   *  for carried goods, the store's tile for a stockpile, the
   *  entity tile for a deposit) — null when unknown (a load from
   *  an old save, which records no location). */
  location: { x: number; y: number } | null;
  /** How more of this is obtained (null = cannot be extracted). */
  extraction: ExtractionMethod | null;
  /** The entity id this entry derives from, or null. */
  sourceId: string | null;
  /** The entity id holding it, or null. */
  ownerId: string | null;
};

/** The registry: versioned, entries keyed by id. A store entry's
 *  id is '<storeId>:<kind>'; a deposit's id is its entity id. */
export type ResourceRegistry = {
  version: number;
  entries: Record<string, RegistryEntry>;
};

/** Current registry format version (G16-style: the version rides
 *  in the serialized form; a future version migrates, never guesses). */
export const REGISTRY_SCHEMA_VERSION = 1;

/** An empty registry (no stores, no deposits — the view seeds it
 *  from the world + the saves on load). */
export function createRegistry(): ResourceRegistry {
  return { version: REGISTRY_SCHEMA_VERSION, entries: {} };
}

/** The id of a store entry: '<storeId>:<kind>'. */
export function storeEntryId(storeId: string, kind: RegistryKind): string {
  return storeId + ':' + kind;
}

/** The entry with an id, or undefined when the registry holds no
 *  such entry (a store that never held that kind, a chopped tree). */
export function entryFor(registry: ResourceRegistry, id: string): RegistryEntry | undefined {
  return registry.entries[id];
}

/** The entry for a (store, kind) pair, or undefined when the store
 *  never held that kind. */
export function storeEntry(registry: ResourceRegistry, storeId: string, kind: RegistryKind): RegistryEntry | undefined {
  return registry.entries[storeEntryId(storeId, kind)];
}

/** Units of a kind in a store (0 when the store never held it). */
export function storeQty(registry: ResourceRegistry, storeId: string, kind: RegistryKind): number {
  const e = storeEntry(registry, storeId, kind);
  return e ? Math.max(0, Math.floor(e.qty)) : 0;
}

/** The capacity of a store entry: the existing entry's capacity,
 *  or the caller's default for a new entry. A carrier holds 2 (the
 *  real carry limit); a settlement holds 50 + population (the
 *  civilization rule, supplied by the adapter); anything else is
 *  uncapped unless the caller says otherwise. */
function capacityFor(storeId: string, opts?: { capacity?: number }): number {
  if (opts?.capacity !== undefined && Number.isFinite(opts.capacity)) return Math.max(0, opts.capacity);
  if (storeId.startsWith('carrier:')) return 2;
  return Infinity;
}

function clampQuality(q: number | undefined): number {
  if (q === undefined || !Number.isFinite(q)) return 1;
  return Math.max(0, Math.min(1, q));
}

function copyRegistry(registry: ResourceRegistry): ResourceRegistry {
  return { version: registry.version, entries: { ...registry.entries } };
}

/**
 * Deposit units into a store. Returns the new registry, how many
 * units actually landed, and how many did not fit (the overflow —
 * never silently created, never silently dropped into another
 * store). A deposit with no valid source adds nothing (the
 * registry never creates a unit from nowhere); a non-positive qty
 * adds nothing. A new entry takes the caller's capacity/quality/
 * location/owner/extraction; an existing entry keeps its own
 * (a deposit never re-capacitys a store). Pure.
 */
export function depositInto(
  registry: ResourceRegistry,
  storeId: string,
  kind: RegistryKind,
  qty: number,
  source: ResourceSource,
  opts?: {
    quality?: number;
    capacity?: number;
    location?: { x: number; y: number } | null;
    ownerId?: string | null;
    extraction?: ExtractionMethod | null;
  },
): { registry: ResourceRegistry; added: number; overflow: number } {
  if (!isValidSource(source)) return { registry, added: 0, overflow: 0 };
  const want = Math.max(0, Math.floor(qty));
  if (want <= 0) return { registry, added: 0, overflow: 0 };
  if (storeKindOf(storeId) === null) return { registry, added: 0, overflow: 0 };
  const next = copyRegistry(registry);
  const id = storeEntryId(storeId, kind);
  const existing = next.entries[id];
  const capacity = existing ? existing.capacity : capacityFor(storeId, opts);
  const current = existing ? Math.max(0, Math.floor(existing.qty)) : 0;
  const room = Number.isFinite(capacity) ? Math.max(0, capacity - current) : want;
  const added = Math.min(want, room);
  const overflow = want - added;
  if (added <= 0) return { registry, added: 0, overflow };
  next.entries[id] = {
    id,
    storeId,
    kind,
    qty: current + added,
    quality: existing ? existing.quality : clampQuality(opts?.quality),
    capacity,
    location: existing ? existing.location : (opts?.location ?? null),
    extraction: existing ? existing.extraction : (opts?.extraction ?? null),
    sourceId: source.type === 'entity' ? source.id : null,
    ownerId: existing ? existing.ownerId : (opts?.ownerId ?? null),
  };
  return { registry: next, added, overflow };
}

/**
 * Withdraw units from a store. Returns the new registry and how
 * many units actually left (never more than the store holds, never
 * negative — a withdrawal of more than the store holds takes what
 * is there and leaves 0). Pure.
 */
export function withdrawFrom(
  registry: ResourceRegistry,
  storeId: string,
  kind: RegistryKind,
  qty: number,
): { registry: ResourceRegistry; taken: number } {
  const want = Math.max(0, Math.floor(qty));
  if (want <= 0) return { registry, taken: 0 };
  const e = storeEntry(registry, storeId, kind);
  if (!e || e.qty <= 0) return { registry, taken: 0 };
  const taken = Math.min(want, Math.floor(e.qty));
  const next = copyRegistry(registry);
  next.entries[e.id] = { ...e, qty: e.qty - taken };
  return { registry: next, taken };
}

/**
 * Set a store entry to an exact quantity — the restore primitive
 * (load from a save, probe setup). Clamped to the entry's capacity
 * (or the caller's, for a new entry); a non-positive qty clears
 * the entry to 0. A restore without a valid source changes
 * nothing. Pure.
 */
export function setStoreQty(
  registry: ResourceRegistry,
  storeId: string,
  kind: RegistryKind,
  qty: number,
  source: ResourceSource,
  opts?: {
    quality?: number;
    capacity?: number;
    location?: { x: number; y: number } | null;
    ownerId?: string | null;
    extraction?: ExtractionMethod | null;
  },
): ResourceRegistry {
  if (!isValidSource(source)) return registry;
  if (storeKindOf(storeId) === null) return registry;
  const next = copyRegistry(registry);
  const id = storeEntryId(storeId, kind);
  const existing = next.entries[id];
  const capacity = existing ? existing.capacity : capacityFor(storeId, opts);
  const want = Math.max(0, Math.floor(qty));
  const value = Number.isFinite(capacity) ? Math.min(want, capacity) : want;
  next.entries[id] = {
    id,
    storeId,
    kind,
    qty: value,
    quality: existing ? existing.quality : clampQuality(opts?.quality),
    capacity,
    location: existing ? existing.location : (opts?.location ?? null),
    extraction: existing ? existing.extraction : (opts?.extraction ?? null),
    sourceId: source.type === 'entity' ? source.id : null,
    ownerId: existing ? existing.ownerId : (opts?.ownerId ?? null),
  };
  return next;
}

/**
 * Move units between two stores. Withdraws from the source and
 * deposits into the destination; what does not fit in the
 * destination stays in the source (the move is conservative, never
 * duplicating and never destroying). Returns the new registry and
 * how many units actually moved. A move without a valid source
 * moves nothing. Pure.
 */
export function transfer(
  registry: ResourceRegistry,
  fromStore: string,
  toStore: string,
  kind: RegistryKind,
  qty: number,
  source: ResourceSource,
  opts?: {
    quality?: number;
    capacity?: number;
    location?: { x: number; y: number } | null;
    ownerId?: string | null;
    extraction?: ExtractionMethod | null;
  },
): { registry: ResourceRegistry; moved: number } {
  if (!isValidSource(source)) return { registry, moved: 0 };
  const want = Math.max(0, Math.floor(qty));
  if (want <= 0 || fromStore === toStore) return { registry, moved: 0 };
  const available = storeQty(registry, fromStore, kind);
  if (available <= 0) return { registry, moved: 0 };
  const toMove = Math.min(want, available);
  const withdrawn = withdrawFrom(registry, fromStore, kind, toMove);
  const deposited = depositInto(withdrawn.registry, toStore, kind, toMove, source, opts);
  // What did not fit goes back to the source (conservative: the
  // move never destroys units the destination could not hold).
  if (deposited.overflow > 0) {
    const back = depositInto(deposited.registry, fromStore, kind, deposited.overflow, source);
    return { registry: back.registry, moved: deposited.added };
  }
  return { registry: deposited.registry, moved: deposited.added };
}

/** Units of a kind across stores (deposits excluded — this is
 *  what is HELD, not what is still standing in the world). */
export function totalStored(registry: ResourceRegistry, kind: RegistryKind, storeIds?: readonly string[]): number {
  let total = 0;
  for (const e of Object.values(registry.entries)) {
    if (e.kind !== kind || e.storeId === null) continue;
    if (storeIds && !storeIds.includes(e.storeId)) continue;
    total += Math.max(0, Math.floor(e.qty));
  }
  return total;
}

/** Units of a kind across stores AND deposits (what is held plus
 *  what is still standing in the world, unharvested). */
export function totalAvailable(registry: ResourceRegistry, kind: RegistryKind): number {
  let total = 0;
  for (const e of Object.values(registry.entries)) {
    if (e.kind === kind) total += Math.max(0, Math.floor(e.qty));
  }
  return total;
}

/** Every deposit entry of a kind (world sources, not stores). */
export function depositsOfKind(registry: ResourceRegistry, kind: RegistryKind): RegistryEntry[] {
  return Object.values(registry.entries).filter((e) => e.kind === kind && e.storeId === null);
}

/**
 * The nearest deposit of a kind to (x, y) within maxDist
 * (Manhattan), or null when none is in range. Ties go to the
 * first in registry order (insertion order — deterministic for a
 * given build). The scheduler (J-1) asks this; the founders'
 * nearestTreeTile still scans the world (the physical truth).
 */
export function nearestDeposit(registry: ResourceRegistry, kind: RegistryKind, x: number, y: number, maxDist: number): RegistryEntry | null {
  let best: RegistryEntry | null = null;
  let bestD = Infinity;
  for (const e of depositsOfKind(registry, kind)) {
    if (!e.location || e.qty <= 0) continue;
    const d = Math.abs(e.location.x - x) + Math.abs(e.location.y - y);
    if (d > maxDist || d >= bestD) continue;
    bestD = d;
    best = e;
  }
  return best;
}

// --- Deposits: the world as a registry ---

/** A stored tree's deposit: 2 wood, chopped, at its tile. */
export function treeDeposit(tx: number, ty: number): RegistryEntry {
  const id = treeId(tx, ty);
  return {
    id,
    storeId: null,
    kind: 'wood',
    qty: 2,
    quality: 1,
    capacity: 2,
    location: { x: Math.floor(tx), y: Math.floor(ty) },
    extraction: 'chop',
    sourceId: id,
    ownerId: null,
  };
}

/** A stored rock's deposit: 1 stone, mined, at its tile. */
export function rockDeposit(tx: number, ty: number): RegistryEntry {
  const id = rockId(tx, ty);
  return {
    id,
    storeId: null,
    kind: 'stone',
    qty: 1,
    quality: 1,
    capacity: 1,
    location: { x: Math.floor(tx), y: Math.floor(ty) },
    extraction: 'mine',
    sourceId: id,
    ownerId: null,
  };
}

/** A crate's deposit: 1 wood, collected, at its tile. */
export function crateDeposit(tx: number, ty: number): RegistryEntry {
  const id = crateId(tx, ty);
  return {
    id,
    storeId: null,
    kind: 'wood',
    qty: 1,
    quality: 1,
    capacity: 1,
    location: { x: Math.floor(tx), y: Math.floor(ty) },
    extraction: 'collect',
    sourceId: id,
    ownerId: null,
  };
}

/**
 * Add (or replace) a world deposit entry. A deposit's id is its
 * entity id and its storeId must be null — a store entry passed
 * here is ignored (deposits and stores are different things).
 * Pure.
 */
export function addDeposit(registry: ResourceRegistry, entry: RegistryEntry): ResourceRegistry {
  if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) return registry;
  if (entry.storeId !== null) return registry;
  const next = copyRegistry(registry);
  next.entries[entry.id] = { ...entry, location: entry.location ? { ...entry.location } : null };
  return next;
}

/**
 * Take part of a world deposit: `qty` units leave the deposit and
 * the entry's qty drops by that much (a mineral hit takes `damage`
 * ore — the entry stays until it hits 0, when the caller removes
 * it with extractDeposit). Returns the new registry and how many
 * units actually came out (never more than the deposit holds).
 * Pure.
 */
export function reduceDeposit(registry: ResourceRegistry, depositId: string, qty: number): { registry: ResourceRegistry; taken: number } {
  const want = Math.max(0, Math.floor(qty));
  if (want <= 0) return { registry, taken: 0 };
  const e = registry.entries[depositId];
  if (!e || e.storeId !== null || e.qty <= 0) return { registry, taken: 0 };
  const taken = Math.min(want, Math.floor(e.qty));
  const next = copyRegistry(registry);
  next.entries[depositId] = { ...e, qty: e.qty - taken };
  return { registry: next, taken };
}

/**
 * Extract a world deposit: the yield (its qty) leaves the world
 * and the entry is REMOVED (a chopped tree holds no more wood —
 * the entry does not linger at 0). Returns the new registry, the
 * kind, and the yield (0 when the deposit does not exist or is
 * already empty). Pure.
 */
export function extractDeposit(registry: ResourceRegistry, depositId: string): { registry: ResourceRegistry; kind: RegistryKind | null; qty: number } {
  const e = registry.entries[depositId];
  if (!e || e.storeId !== null || e.qty <= 0) return { registry, kind: null, qty: 0 };
  const next = copyRegistry(registry);
  delete next.entries[depositId];
  return { registry: next, kind: e.kind, qty: Math.floor(e.qty) };
}

/**
 * Build the world's deposits into a registry: every stored tree
 * (2 wood), rock (1 stone), and crate (1 wood) in the world lists.
 * Wild trees/rocks are NOT deposits (a hash rule, not a list —
 * their E-key handler deposits with the wild id as its source).
 * Pure.
 */
export function depositsFromWorld(registry: ResourceRegistry, world: IsoWorld): ResourceRegistry {
  let next = registry;
  for (const t of world.trees ?? []) next = addDeposit(next, treeDeposit(t.tx, t.ty));
  for (const r of world.rocks ?? []) next = addDeposit(next, rockDeposit(r.tx, r.ty));
  for (const c of world.crates ?? []) next = addDeposit(next, crateDeposit(c.tx, c.ty));
  return next;
}

// --- Adapters: the other inventories through the registry ---

/** The civilization storage cap for a settlement (the existing
 *  rule, deliverCaravanCargo/advanceCivilization): 50 + population
 *  per resource. */
export function settlementStorageCap(settlement: Settlement): number {
  return 50 + Math.max(0, Math.floor(settlement.population || 0));
}

/**
 * Seed a 2.5D settlement's storage into the registry as a store
 * (source 'loaded' — the settlement save does not record where a
 * unit came from; capacity 50 + population per resource, location
 * the settlement's position, extraction 'produce'). The store id
 * defaults to 'settlement:<id>' — pass 'camp' to seed the live 3D
 * camp's mirror store instead. Pure.
 */
export function settlementStorageToRegistry(
  registry: ResourceRegistry,
  settlement: Settlement,
  storeId?: string,
): ResourceRegistry {
  const sid = storeId ?? settlementStoreId(settlement.id);
  if (storeKindOf(sid) === null) return registry;
  let next = registry;
  const cap = settlementStorageCap(settlement);
  const loc = settlement.position ? { x: Math.floor(settlement.position.x), y: Math.floor(settlement.position.y) } : null;
  for (const kind of RESOURCES) {
    const qty = Math.max(0, Math.floor(settlement.storage[kind] ?? 0));
    if (qty <= 0) continue;
    next = setStoreQty(next, sid, kind, qty, { type: 'loaded' }, { capacity: cap, location: loc, extraction: 'produce' });
  }
  return next;
}

/**
 * Write a registry store back into a 2.5D settlement's storage
 * (the reverse sync — the coordinator's storage changes land in
 * the registry, and the registry writes them back so the two
 * ledgers never disagree). Mutates the settlement (the coordinator
 * already mutates its civilization object); clamps each resource
 * to the settlement cap. The store id defaults to
 * 'settlement:<id>' — pass 'camp' to write the live 3D camp
 * store into the camp settlement's storage.
 */
export function registryToSettlementStorage(
  registry: ResourceRegistry,
  settlement: Settlement,
  storeId?: string,
): void {
  const sid = storeId ?? settlementStoreId(settlement.id);
  const cap = settlementStorageCap(settlement);
  for (const kind of RESOURCES) {
    const qty = storeQty(registry, sid, kind);
    settlement.storage[kind] = Math.max(0, Math.min(cap, Math.floor(qty)));
  }
}

/**
 * BUILD 1090 (2.5): the live 3D camp's storage is TWO stores now
 * — wood + stone in the camp store, food + grain in the granary —
 * so the coordinator mirror writes both: wood/stone from the camp
 * store (clamped to the settlement cap, the old mirror's rule),
 * food/grain from the granary (UNclamped — the granary's caps
 * 200/60 exceed the settlement cap 50+pop, so clamping grain would
 * lose it on the reverse sync below). The single-store mirror above
 * cannot do this (one store per call, and a second call would zero
 * the first store's kinds). Pure apart from the settlement mutation
 * (the coordinator's object).
 */
export function mirrorCampStoresToSettlement(
  registry: ResourceRegistry,
  settlement: Settlement,
): void {
  const cap = settlementStorageCap(settlement);
  settlement.storage.wood = Math.max(0, Math.min(cap, Math.floor(storeQty(registry, CAMP_STORE_ID, 'wood'))));
  settlement.storage.stone = Math.max(0, Math.min(cap, Math.floor(storeQty(registry, CAMP_STORE_ID, 'stone'))));
  settlement.storage.food = Math.max(0, Math.floor(storeQty(registry, GRANARY_STORE_ID, 'food')));
  settlement.storage.grain = Math.max(0, Math.floor(storeQty(registry, GRANARY_STORE_ID, 'grain')));
}

/**
 * The reverse sync for the live 3D camp: write a settlement's
 * storage back into the registry's stores (the coordinator's
 * production/consumption for the camp is zero today, so this is a
 * no-op until it is not — but when J-1 gives the founders jobs
 * and production flows into settlement.storage, the change lands
 * in the one authoritative record instead of a second ledger).
 * Wood goes to the camp store, food + grain to the GRANARY store
 * (BUILD 1090 — the camp's food lives there now). Writes each kind
 * exactly, including 0 (a coordinator change that empties the pile
 * must empty the store). Source 'production' (the settlement's own
 * production/consumption). Pure.
 */
export function syncCampStoreFromSettlement(
  registry: ResourceRegistry,
  settlement: Settlement,
): ResourceRegistry {
  // No location opts: the stores are seeded at load with the
  // stockpile/eat tiles, and setStoreQty keeps an existing entry's
  // location — the sync only moves the numbers.
  let next = setStoreQty(
    registry,
    CAMP_STORE_ID,
    'wood',
    Math.max(0, Math.floor(settlement.storage.wood ?? 0)),
    { type: 'production', settlementId: settlement.id },
  );
  next = setStoreQty(
    next,
    GRANARY_STORE_ID,
    'food',
    Math.max(0, Math.floor(settlement.storage.food ?? 0)),
    { type: 'production', settlementId: settlement.id },
  );
  next = setStoreQty(
    next,
    GRANARY_STORE_ID,
    'grain',
    Math.max(0, Math.floor(settlement.storage.grain ?? 0)),
    { type: 'production', settlementId: settlement.id },
  );
  return next;
}

/**
 * A 2.5D resource population as a registry deposit — the ecological
 * source as a count. Only trees map today: a forest population
 * holds round(density × baseline) wood, chopped, at the region's
 * origin tile. The other populations (grass, berries, mushrooms,
 * herbs, flowers) have no 3D extraction yet — no invented deposit,
 * null. Pure.
 */
export function resourcePopulationToDeposit(pop: ResourcePopulation, baseline: number): RegistryEntry | null {
  if (pop.kind !== 'trees') return null;
  const count = Math.max(0, Math.round(pop.density * Math.max(1, Math.floor(baseline))));
  const id = 'forest:' + pop.regionX + ',' + pop.regionY;
  return {
    id,
    storeId: null,
    kind: 'wood',
    qty: count,
    quality: 1,
    capacity: Math.max(1, Math.floor(baseline)),
    location: { x: Math.floor(pop.regionX), y: Math.floor(pop.regionY) },
    extraction: 'chop',
    sourceId: id,
    ownerId: null,
  };
}

// --- Player inventory bridge (the INVENTORY_KEY shape) ---

/** The player's carried resources as a plain record (the shape
 *  INVENTORY_KEY persists — resource keys only, keepsakes handled
 *  by the caller). */
export type PlayerInventoryRecord = Record<string, number>;

/**
 * Seed the player store from a saved inventory record (wood /
 * stone / gold / wheat→grain; every other key is a keepsake and is
 * ignored — memorabilia is not a resource). Source 'loaded',
 * uncapped, location unknown (an old save records no location),
 * owner 'player'. Pure.
 */
export function playerInventoryToRegistry(registry: ResourceRegistry, inventory: PlayerInventoryRecord): ResourceRegistry {
  let next = registry;
  for (const key of PLAYER_RESOURCE_KEYS) {
    const kind = kindForPlayerKey(key);
    if (!kind) continue;
    const qty = Math.max(0, Math.floor(inventory[key] ?? 0));
    if (qty <= 0) continue;
    next = setStoreQty(next, PLAYER_STORE_ID, kind, qty, { type: 'loaded' }, { ownerId: 'player' });
  }
  return next;
}

/**
 * The player's inventory record from the registry's player store
 * (wood / stone / gold / wheat keys, present only when the store
 * holds some — the old shape starts empty and adds keys as goods
 * arrive). The caller's keepsakes record is merged through
 * unchanged (keepsakes live in the same persisted record, but
 * they are not resources and never pass through the registry).
 * Pure.
 */
export function registryToPlayerInventory(registry: ResourceRegistry, keepsakes: PlayerInventoryRecord = {}): PlayerInventoryRecord {
  const out: PlayerInventoryRecord = { ...keepsakes };
  for (const key of PLAYER_RESOURCE_KEYS) {
    const kind = kindForPlayerKey(key);
    if (!kind) continue;
    const qty = storeQty(registry, PLAYER_STORE_ID, kind);
    if (qty > 0) out[key] = qty;
    else delete out[key];
  }
  return out;
}

/** The non-resource keys in a player inventory record (keepsakes
 *  — '<name> loot' — passed through the save, never the registry). */
export function keepsakesOf(inventory: PlayerInventoryRecord): PlayerInventoryRecord {
  const out: PlayerInventoryRecord = {};
  for (const [k, v] of Object.entries(inventory)) {
    if (kindForPlayerKey(k) === null) out[k] = v;
  }
  return out;
}

// --- Save: versioned registry (the snapshot boundary) ---

/** Serialize a registry (the versioned format, for round-trip
 *  asserts and the Control Center snapshot — the live game rebuilds
 *  the registry from the world + the saves on load, so no new save
 *  key is introduced in this build). Pure. */
export function serializeRegistry(registry: ResourceRegistry): string {
  return JSON.stringify(registry);
}

/**
 * Validate an unknown registry. Anything malformed, any wrong
 * version, any entry with a non-finite qty/quality/capacity, an
 * unknown kind, or a store id that is not a store id returns null
 * (fresh defaults — never guess at an unknown format). A deposit
 * entry (storeId null) must have a non-empty id. Pure.
 */
export function migrateRegistry(value: unknown): ResourceRegistry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.version !== REGISTRY_SCHEMA_VERSION) return null;
  if (!v.entries || typeof v.entries !== 'object') return null;
  const entries: Record<string, RegistryEntry> = {};
  for (const [id, raw] of Object.entries(v.entries as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') return null;
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id.length === 0 || e.id !== id) return null;
    if (e.storeId !== null && (typeof e.storeId !== 'string' || storeKindOf(e.storeId) === null)) return null;
    if (typeof e.kind !== 'string' || !(REGISTRY_KINDS as readonly string[]).includes(e.kind)) return null;
    const qty = Number(e.qty);
    const quality = Number(e.quality);
    const capacity = e.capacity === null ? Infinity : Number(e.capacity);
    if (!Number.isFinite(qty) || !Number.isFinite(quality)) return null;
    if (e.capacity !== null && !Number.isFinite(capacity)) return null;
    const loc = e.location as { x: unknown; y: unknown } | null;
    if (loc !== null && (!loc || !Number.isFinite(Number(loc.x)) || !Number.isFinite(Number(loc.y)))) return null;
    const extraction = e.extraction as string | null;
    if (extraction !== null && extraction !== 'chop' && extraction !== 'mine' && extraction !== 'collect' && extraction !== 'harvest' && extraction !== 'produce' && extraction !== 'trade') return null;
    entries[id] = {
      id: e.id,
      storeId: e.storeId as string | null,
      kind: e.kind as RegistryKind,
      qty: Math.max(0, Math.floor(qty)),
      quality: Math.max(0, Math.min(1, quality)),
      capacity: e.capacity === null ? Infinity : Math.max(0, capacity),
      location: loc === null ? null : { x: Math.floor(Number(loc.x)), y: Math.floor(Number(loc.y)) },
      extraction: extraction as ExtractionMethod | null,
      sourceId: typeof e.sourceId === 'string' ? e.sourceId : null,
      ownerId: typeof e.ownerId === 'string' ? e.ownerId : null,
    };
  }
  return { version: REGISTRY_SCHEMA_VERSION, entries };
}
