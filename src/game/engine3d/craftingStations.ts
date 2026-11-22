// craftingStations.ts — NEURON HEX 0x2E (BUILD 1111). Crafting stations + recipes.
//
// The user's spec sections 3–4: workbench, blacksmith, furnace, advanced
// forge, apothecary; example recipes; unlocks via discovery; material tiers
// basic/copper/iron/advanced/rare/magical.
//
// This is the PLAYER's crafting system, on the shared R-1 registry — never
// a second inventory, never a second crafting system. It builds on 0x2B
// (slots), 0x2C (hotbar), 0x2D (gathering + hand-crafting): the hand recipes
// in gathering.ts stay exactly where they are (sticks, torches, wooden/stone
// axe/pickaxe), and the stations offer NEW recipes only — nothing here
// duplicates a hand recipe.
//
// It is NOT the NPC production chain (1095 metalChain.ts smelter/blacksmith,
// 1097 production interiors): that chain is the founders' timed production
// with its own stores and states. The player stations share only the
// conservation numbers where they overlap (the furnace smelts 1 iron + 1 coal
// → 1 ingot, the NPC smelt rule) — different system, no shared state.
//
// DESIGN (decided, stated):
// - Stations are Build-mode placements (the windmill precedent, 1106): one
//   PlacedItem kind 'station' carrying a `station` field, five palette kinds
//   'station-workbench' etc., 1x1, blocked/collidable/removable/movable via
//   the generic placement paths. They cost nothing to place (Build-mode
//   placements are free today; placement costs are a deferred item).
// - Smelting/forging is instant (button → product), like hand-crafting. The
//   NPC chain's timed smelting is a different system; there is no furnace
//   state machine here.
// - Unlocks are DISCOVERY: a recipe unlocks when the player has ever held its
//   key material. The discovered set persists under its own key and is
//   unioned on every inventory sync, so a material found once stays found.
//   'known' recipes need no discovery. Books/NPC trainers are future —
//   discovery covers the unlocks for this step.
// - Tiers are display metadata on each recipe. Rare/magical tiers have NO
//   recipes yet — no mithril or gems exist in the world, and none are
//   invented here.
// - No skill XP is awarded by crafting in this build: skills.ts exists as
//   data only (nothing imports it, no award funnel exists anywhere in src/,
//   no XP storage, no XP UI), so there is nothing honest to wire to. XP
//   only from real successful actions — and with no skills system live,
//   crafting grants none rather than a faked one.
//
// Pure module (no React, no WebGL); the localStorage helpers at the bottom
// follow the readSaved try/catch style of inventoryCrafting3d.ts. The only
// world touch is stationPlacements/nearestStation, which read placements
// off the world (the type is imported type-only — no runtime cycle).

import type { IsoWorld } from '../iso/isoWorld';

/** The five player crafting stations (spec section 3). */
export type StationId = 'workbench' | 'blacksmith' | 'furnace' | 'advanced-forge' | 'apothecary';

/** The Build-palette kind that places a station (the PaletteKind
 *  spelling of a StationId — 'station-' + the id). */
export type StationPaletteKind = 'station-workbench' | 'station-blacksmith' | 'station-furnace' | 'station-advanced-forge' | 'station-apothecary';

export interface StationDef {
  id: StationId;
  name: string;
  icon: string;
  /** The render colour of the placed station's cube (worldRender3d). */
  color: [number, number, number];
  blurb: string;
}

export const STATION_DEFS: Record<StationId, StationDef> = {
  workbench: { id: 'workbench', name: 'Workbench', icon: '🪵', color: [0.62, 0.45, 0.25], blurb: 'Handles, bows, shields and furniture — woodwork, by hand.' },
  blacksmith: { id: 'blacksmith', name: 'Blacksmith', icon: '⚒️', color: [0.35, 0.35, 0.38], blurb: 'Axes, swords and pickaxes — forged from ingots and steel.' },
  furnace: { id: 'furnace', name: 'Furnace', icon: '🔥', color: [0.55, 0.25, 0.15], blurb: 'Smelts ore into ingots. One ore, one coal, one ingot.' },
  'advanced-forge': { id: 'advanced-forge', name: 'Advanced Forge', icon: '🏭', color: [0.45, 0.3, 0.55], blurb: 'Burns an ingot with coal into steel — the advanced tier.' },
  apothecary: { id: 'apothecary', name: 'Apothecary', icon: '🌿', color: [0.3, 0.5, 0.3], blurb: 'Potions and remedies from herbs, berries and fibre.' },
};

export const STATION_IDS: StationId[] = ['workbench', 'blacksmith', 'furnace', 'advanced-forge', 'apothecary'];

export function stationDefFor(id: StationId): StationDef {
  return STATION_DEFS[id];
}

// --- Palette kinds (placements.ts) ---

/** The Build palette kind for a station ('station-workbench' etc.). */
export function paletteKindForStation(id: StationId): StationPaletteKind {
  return ('station-' + id) as StationPaletteKind;
}

/** True when a palette kind is one of the five station kinds. A
 *  type guard, so validatePlacement's else branch narrows the station
 *  kinds out (they are PaletteKinds, not PlacedItem kinds). */
export function isStationPaletteKind(kind: string): kind is StationPaletteKind {
  return kind.startsWith('station-') && (STATION_IDS as string[]).includes(kind.slice('station-'.length));
}

/** The station a palette kind places, or null for any other kind. */
export function stationOfPaletteKind(kind: string): StationId | null {
  if (!isStationPaletteKind(kind)) return null;
  return kind.slice('station-'.length) as StationId;
}

// --- Recipes ---

/** Material tier, per the spec section 4 (display metadata on a recipe). */
export type MaterialTier = 'basic' | 'copper' | 'iron' | 'advanced' | 'rare' | 'magical';

/** How a recipe unlocks: known from the start, or discovered when the
 *  player has ever held the key material. */
export type RecipeUnlock = { kind: 'known' } | { kind: 'discover'; material: string };

/** A station recipe: materials in, product out. All materials are
 *  registry player-store kinds, so the view crafts with withdrawFrom
 *  per material and depositInto (stackables) or the record channel
 *  (gear) — the exact path hand-crafting uses. */
export interface StationRecipe {
  id: string;
  station: StationId;
  name: string;
  product: string;
  productQty: number;
  materials: Array<{ kind: string; qty: number }>;
  tier: MaterialTier;
  unlock: RecipeUnlock;
}

export const STATION_RECIPES: StationRecipe[] = [
  // Workbench — woodwork.
  { id: 'handle', name: 'Handle', station: 'workbench', product: 'handle', productQty: 1, materials: [{ kind: 'wood', qty: 1 }], tier: 'basic', unlock: { kind: 'known' } },
  { id: 'bow', name: 'Bow', station: 'workbench', product: 'bow', productQty: 1, materials: [{ kind: 'wood', qty: 2 }, { kind: 'fibre', qty: 2 }], tier: 'basic', unlock: { kind: 'discover', material: 'fibre' } },
  { id: 'shield', name: 'Shield', station: 'workbench', product: 'shield', productQty: 1, materials: [{ kind: 'wood', qty: 4 }, { kind: 'fibre', qty: 1 }], tier: 'basic', unlock: { kind: 'discover', material: 'fibre' } },
  { id: 'furniture', name: 'Furniture', station: 'workbench', product: 'furniture', productQty: 1, materials: [{ kind: 'wood', qty: 4 }], tier: 'basic', unlock: { kind: 'known' } },
  // Furnace — smelting.
  { id: 'smelt-iron', name: 'Smelt Iron Ingot', station: 'furnace', product: 'ingot', productQty: 1, materials: [{ kind: 'iron', qty: 1 }, { kind: 'coal', qty: 1 }], tier: 'iron', unlock: { kind: 'known' } },
  { id: 'smelt-copper', name: 'Smelt Copper Ingot', station: 'furnace', product: 'copper-ingot', productQty: 1, materials: [{ kind: 'copper', qty: 1 }, { kind: 'coal', qty: 1 }], tier: 'copper', unlock: { kind: 'discover', material: 'copper' } },
  // Blacksmith — forged gear.
  { id: 'copper-axe', name: 'Copper Axe', station: 'blacksmith', product: 'copper-axe', productQty: 1, materials: [{ kind: 'copper-ingot', qty: 2 }, { kind: 'handle', qty: 1 }], tier: 'copper', unlock: { kind: 'discover', material: 'copper-ingot' } },
  { id: 'copper-pickaxe', name: 'Copper Pickaxe', station: 'blacksmith', product: 'copper-pickaxe', productQty: 1, materials: [{ kind: 'copper-ingot', qty: 2 }, { kind: 'handle', qty: 1 }], tier: 'copper', unlock: { kind: 'discover', material: 'copper-ingot' } },
  { id: 'iron-axe', name: 'Iron Axe', station: 'blacksmith', product: 'iron-axe', productQty: 1, materials: [{ kind: 'ingot', qty: 2 }, { kind: 'handle', qty: 1 }], tier: 'iron', unlock: { kind: 'discover', material: 'ingot' } },
  { id: 'iron-sword', name: 'Iron Sword', station: 'blacksmith', product: 'iron-sword', productQty: 1, materials: [{ kind: 'ingot', qty: 2 }, { kind: 'handle', qty: 1 }], tier: 'iron', unlock: { kind: 'discover', material: 'ingot' } },
  { id: 'iron-pickaxe', name: 'Iron Pickaxe', station: 'blacksmith', product: 'iron-pickaxe', productQty: 1, materials: [{ kind: 'ingot', qty: 2 }, { kind: 'handle', qty: 1 }], tier: 'iron', unlock: { kind: 'discover', material: 'ingot' } },
  { id: 'steel-axe', name: 'Steel Axe', station: 'blacksmith', product: 'steel-axe', productQty: 1, materials: [{ kind: 'steel', qty: 2 }, { kind: 'handle', qty: 1 }], tier: 'advanced', unlock: { kind: 'discover', material: 'steel' } },
  { id: 'steel-sword', name: 'Steel Sword', station: 'blacksmith', product: 'steel-sword', productQty: 1, materials: [{ kind: 'steel', qty: 2 }, { kind: 'handle', qty: 1 }], tier: 'advanced', unlock: { kind: 'discover', material: 'steel' } },
  { id: 'steel-pickaxe', name: 'Steel Pickaxe', station: 'blacksmith', product: 'steel-pickaxe', productQty: 1, materials: [{ kind: 'steel', qty: 2 }, { kind: 'handle', qty: 1 }], tier: 'advanced', unlock: { kind: 'discover', material: 'steel' } },
  // Advanced forge — steel.
  { id: 'steel', name: 'Smelt Steel', station: 'advanced-forge', product: 'steel', productQty: 1, materials: [{ kind: 'ingot', qty: 1 }, { kind: 'coal', qty: 1 }], tier: 'advanced', unlock: { kind: 'discover', material: 'ingot' } },
  // Apothecary — potions and remedies.
  { id: 'potion-heal', name: 'Healing Potion', station: 'apothecary', product: 'potion-heal', productQty: 1, materials: [{ kind: 'herb', qty: 2 }, { kind: 'berry', qty: 1 }], tier: 'basic', unlock: { kind: 'discover', material: 'herb' } },
  { id: 'medicine', name: 'Medicine', station: 'apothecary', product: 'medicine', productQty: 1, materials: [{ kind: 'herb', qty: 2 }, { kind: 'fibre', qty: 1 }], tier: 'basic', unlock: { kind: 'discover', material: 'herb' } },
];

export function stationRecipeFor(id: string): StationRecipe | null {
  return STATION_RECIPES.find((r) => r.id === id) ?? null;
}

export function stationRecipesFor(station: StationId): StationRecipe[] {
  return STATION_RECIPES.filter((r) => r.station === station);
}

/** True when the player's carried store holds every material
 *  (the caller passes the player-store quantities). */
export function canCraftStation(recipe: StationRecipe, held: Record<string, number>): boolean {
  return recipe.materials.every((m) => Math.max(0, Math.floor(held[m.kind] ?? 0)) >= m.qty);
}

// --- Discovery unlocks ---

/** The discovered-materials save key (kinds the player has ever held). */
export const DISCOVERED_MATERIALS_KEY = 'ag-3d-materials-discovered-v1';

/** Read the discovered set (corrupt or missing saves fall back to an
 *  empty set — nothing is ever unlocked by a bad save). */
export function readDiscoveredMaterials(): Set<string> {
  try {
    const raw = localStorage.getItem(DISCOVERED_MATERIALS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k): k is string => typeof k === 'string'));
  } catch {
    return new Set();
  }
}

export function writeDiscoveredMaterials(discovered: Set<string>): void {
  try {
    localStorage.setItem(DISCOVERED_MATERIALS_KEY, JSON.stringify([...discovered].sort()));
  } catch {}
}

/** Union the kinds the player currently holds into the discovered set
 *  and persist when anything is new. Returns the new set (the caller's
 *  previous set object when nothing changed). */
export function recordDiscoveredMaterials(prev: Set<string>, heldKinds: Iterable<string>): Set<string> {
  let changed = false;
  const next = new Set(prev);
  for (const kind of heldKinds) {
    if (kind && !next.has(kind)) { next.add(kind); changed = true; }
  }
  if (!changed) return prev;
  writeDiscoveredMaterials(next);
  return next;
}

/** True when a recipe is unlocked for this discovered set (known
 *  recipes always; discovery recipes when their material was found). */
export function isRecipeUnlocked(recipe: StationRecipe, discovered: Set<string>): boolean {
  if (recipe.unlock.kind === 'known') return true;
  return discovered.has(recipe.unlock.material);
}

// --- Placed stations in a world ---

/** Every placed station in a world: its station id + rect. */
export function stationPlacements(world: IsoWorld): Array<{ station: StationId; x0: number; y0: number; x1: number; y1: number }> {
  const out: Array<{ station: StationId; x0: number; y0: number; x1: number; y1: number }> = [];
  for (const p of world.placements ?? []) {
    if (p.kind !== 'station' || !p.station) continue;
    out.push({ station: p.station, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 });
  }
  return out;
}

/** The station nearest to a tile, within the shared 1-tile E-key reach
 *  (the player stands beside it) — or null when none is in reach. */
export function nearestStation(world: IsoWorld, x: number, y: number): { station: StationId; x0: number; y0: number; x1: number; y1: number } | null {
  let best: { station: StationId; x0: number; y0: number; x1: number; y1: number } | null = null;
  let bestDist = Infinity;
  for (const s of stationPlacements(world)) {
    const cx = (s.x0 + s.x1) / 2;
    const cy = (s.y0 + s.y1) / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d <= 1.5 && d < bestDist) { best = s; bestDist = d; }
  }
  return best;
}
