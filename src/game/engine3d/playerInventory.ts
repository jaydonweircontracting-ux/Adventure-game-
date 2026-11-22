// playerInventory.ts — NEURON HEX 0x2B (BUILD 1108). The slot inventory engine.
//
// The Minecraft-style main inventory, built ON the R-1 resource registry
// (resourceRegistry.ts) — never a second inventory. The registry stays
// the ONE authority for totals: how many units of a kind the player holds
// is the registry player store (mirrored into the inventory record by
// inventoryCrafting3d.ts, BUILD 1075). This module owns only the SLOT
// DISTRIBUTION: which slot holds which kind and how many, the equip
// slots, and the item metadata (name, icon, description, stack size).
//
// That split is what makes the slot layer honest:
// - E-key pickups, loot and test grants change TOTALS in the registry.
//   reconcileSlots() re-derives the slots from the new totals, preserving
//   the player's existing layout wherever possible (a kind stays in its
//   slot, quantities adjust; split stacks stay split).
// - Drag/drop, split, swap, equip and unequip change only DISTRIBUTION.
//   They never touch the registry, and the totals never move —
//   reconcileSlots() is a no-op for them.
// - The layout persists under its own key (INVENTORY_SLOTS_KEY). A
//   corrupt layout falls back to deriving from the record, so the
//   player can never lose items to a bad save.
//
// Pure module (no React, no WebGL); the localStorage helpers at the
// bottom follow the readSaved try/catch style of inventoryCrafting3d.ts.
// The view owns the React state and calls reconcileSlots() beside
// refreshPlayerInventory() in refreshResourceUi().

export type EquipSlotId = 'weapon' | 'tool' | 'armor';

export interface InventorySlot {
  kind: string | null;
  qty: number;
}

export interface EquippedSlots {
  weapon: string | null;
  tool: string | null;
  armor: string | null;
}

export interface PlayerInventoryLayout {
  slots: InventorySlot[];
  equipped: EquippedSlots;
}

/** The main inventory grid: 3 rows of 9, Minecraft-style. */
export const INVENTORY_SLOT_COUNT = 27;
export const INVENTORY_SLOTS_PER_ROW = 9;
/** A stackable kind caps at 64 per slot (Minecraft's number). */
export const INVENTORY_STACK_MAX = 64;
/** The slot layout's save key (new in 1108 — no version move; a fresh
 *  layout derives from the inventory record on first load). */
export const INVENTORY_SLOTS_KEY = 'ag-3d-inventory-slots-v1';

export interface ItemMeta {
  name: string;
  icon: string;
  description: string;
  stackMax: number;
  equipSlot: EquipSlotId | null;
}

/** Item metadata, keyed by registry kind (grain displays as Wheat, the
 *  existing HUD convention). Descriptions state what the thing IS, never
 *  an effect that does not exist yet: equipping a tool has no gameplay
 *  effect in 1108 — tools gain their use in 0x2D, stations in 0x2E. */
export const ITEM_META: Record<string, ItemMeta> = {
  wood: { name: 'Wood', icon: '🪵', description: 'Timber from trees and crates. The settlement builds with it.', stackMax: 64, equipSlot: null },
  stone: { name: 'Stone', icon: '🪨', description: 'Stone from rocks and the quarry. The settlement builds with it.', stackMax: 64, equipSlot: null },
  gold: { name: 'Gold', icon: '🪙', description: 'Coin looted from the fallen. For trade, when merchants come.', stackMax: 64, equipSlot: null },
  grain: { name: 'Wheat', icon: '🌾', description: 'Grain harvested from the farm. The mill grinds it into flour.', stackMax: 64, equipSlot: null },
  food: { name: 'Meal', icon: '🍞', description: 'A cooked meal. The founders eat meals at the campfire.', stackMax: 64, equipSlot: null },
  iron: { name: 'Iron', icon: '⛓️', description: 'Iron ore from the mine. The smelter turns it into ingots.', stackMax: 64, equipSlot: null },
  coal: { name: 'Coal', icon: '⬛', description: 'Coal from the mine. The smelter burns it to make ingots.', stackMax: 64, equipSlot: null },
  leather: { name: 'Leather', icon: '🟫', description: 'Leather from hunted animals. The settlement stores it.', stackMax: 64, equipSlot: null },
  wool: { name: 'Wool', icon: '🐑', description: 'Wool from the shepherd\u2019s flock. The settlement stores it.', stackMax: 64, equipSlot: null },
  livestock: { name: 'Livestock', icon: '🐄', description: 'Livestock. The settlement raises it.', stackMax: 64, equipSlot: null },
  weapons: { name: 'Weapons', icon: '⚔️', description: 'Weapons. Equip one in the weapon slot.', stackMax: 1, equipSlot: 'weapon' },
  armor: { name: 'Armor', icon: '🛡️', description: 'Armor. Equip it in the armor slot.', stackMax: 1, equipSlot: 'armor' },
  tools: { name: 'Tools', icon: '🔨', description: 'A tool from the blacksmith. Equip it in the tool slot.', stackMax: 1, equipSlot: 'tool' },
  clothing: { name: 'Clothing', icon: '👕', description: 'Clothing. The settlement trades it.', stackMax: 64, equipSlot: null },
  medicine: { name: 'Medicine', icon: '💊', description: 'Medicine. The settlement stores it.', stackMax: 64, equipSlot: null },
  luxury: { name: 'Luxury', icon: '💎', description: 'Luxury goods. The settlement trades them.', stackMax: 64, equipSlot: null },
  magicMaterials: { name: 'Magic Materials', icon: '✨', description: 'Strange materials. The settlement stores them.', stackMax: 64, equipSlot: null },
  ore: { name: 'Ore', icon: '⛏️', description: 'Raw ore. The smelter refines it.', stackMax: 64, equipSlot: null },
  fish: { name: 'Fish', icon: '🐟', description: 'Fish from the river. The granary stores it.', stackMax: 64, equipSlot: null },
  timber: { name: 'Timber', icon: '🌲', description: 'Sawn timber from the sawmill. The carpenter builds with it.', stackMax: 64, equipSlot: null },
  copper: { name: 'Copper', icon: '🟠', description: 'Copper ore from the mine. The smelter refines it.', stackMax: 64, equipSlot: null },
  silver: { name: 'Silver', icon: '⚪', description: 'Silver ore from the mine. The smelter refines it.', stackMax: 64, equipSlot: null },
  flour: { name: 'Flour', icon: '🥣', description: 'Flour ground at the mill. The bakery bakes it into meals.', stackMax: 64, equipSlot: null },
  ingot: { name: 'Ingot', icon: '🔶', description: 'A smelted ingot. The blacksmith forges tools from it.', stackMax: 64, equipSlot: null },
  furniture: { name: 'Furniture', icon: '🪑', description: 'Furniture from the carpenter. The settlement furnishes its homes.', stackMax: 64, equipSlot: null },
  meat: { name: 'Meat', icon: '🍖', description: 'Meat from the hunt. The granary stores it.', stackMax: 64, equipSlot: null },
};

const KEEPSAKE_META: ItemMeta = { name: '', icon: '🎁', description: 'A keepsake from a fallen traveller. Memorabilia, not a resource.', stackMax: 64, equipSlot: null };

/** Metadata for a slot kind. A '<name> loot' keepsake (not a registry
 *  kind) gets the keepsake fallback, named after itself. */
export function itemMetaFor(kind: string): ItemMeta {
  const meta = ITEM_META[kind];
  if (meta) return meta;
  return { ...KEEPSAKE_META, name: kind };
}

export function stackMaxFor(kind: string): number {
  return itemMetaFor(kind).stackMax;
}

export function equipSlotFor(kind: string): EquipSlotId | null {
  return itemMetaFor(kind).equipSlot;
}

export function emptyLayout(): PlayerInventoryLayout {
  return {
    slots: Array.from({ length: INVENTORY_SLOT_COUNT }, () => ({ kind: null, qty: 0 })),
    equipped: { weapon: null, tool: null, armor: null },
  };
}

function cloneLayout(layout: PlayerInventoryLayout): PlayerInventoryLayout {
  return {
    slots: layout.slots.map((s) => ({ kind: s.kind, qty: s.qty })),
    equipped: { ...layout.equipped },
  };
}

function layoutEquals(a: PlayerInventoryLayout, b: PlayerInventoryLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Total units of each kind the layout holds — slots plus the one unit
 *  in each occupied equip slot. Must always equal the inventory record
 *  for the same moment (the registry is the authority; this is the
 *  check the asserts and the probe use). */
export function layoutTotals(layout: PlayerInventoryLayout): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const slot of layout.slots) {
    if (slot.kind && slot.qty > 0) totals[slot.kind] = (totals[slot.kind] || 0) + slot.qty;
  }
  for (const kind of [layout.equipped.weapon, layout.equipped.tool, layout.equipped.armor]) {
    if (kind) totals[kind] = (totals[kind] || 0) + 1;
  }
  return totals;
}

function cleanRecord(record: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [kind, qty] of Object.entries(record)) {
    const n = Math.floor(Number(qty));
    if (kind && Number.isFinite(n) && n > 0) out[kind] = n;
  }
  return out;
}

/** Re-derive the slots from the inventory record (the registry's
 *  totals), preserving the player's existing layout wherever possible:
 *  a kind stays in its slot, quantities adjust to the new total, split
 *  stacks stay split, and new kinds take the first empty slot. Growth
 *  tops up the first non-full stack first, then spills to empty slots,
 *  then grows the grid by whole rows when no empty slot is left (the
 *  player store is uncapped, so the grid must never lose units).
 *  Shrinkage trims from the LAST stacks of the kind. An equipped unit
 *  counts toward its kind's total and is never silently unequipped —
 *  except when the record no longer holds that kind at all, in which
 *  case the equip slot clears (the item is gone). Returns the previous
 *  layout object unchanged when nothing moved. */
export function reconcileSlots(record: Record<string, number>, prev: PlayerInventoryLayout): PlayerInventoryLayout {
  const want = cleanRecord(record);
  const next = cloneLayout(prev);
  // The grid never shrinks below its base size; it grows by whole rows.
  while (next.slots.length < INVENTORY_SLOT_COUNT) next.slots.push({ kind: null, qty: 0 });
  const equipped = next.equipped;
  // An equipped kind the record no longer holds is gone — clear it.
  for (const slotId of ['weapon', 'tool', 'armor'] as EquipSlotId[]) {
    const kind = equipped[slotId];
    if (kind && !want[kind]) equipped[slotId] = null;
  }
  // Empty slots for kinds the record no longer holds.
  for (const slot of next.slots) {
    if (slot.kind && !want[slot.kind]) { slot.kind = null; slot.qty = 0; }
  }
  // Adjust each wanted kind to its total (equipped unit counts).
  for (const [kind, total] of Object.entries(want)) {
    const equippedCount = (equipped.weapon === kind ? 1 : 0) + (equipped.tool === kind ? 1 : 0) + (equipped.armor === kind ? 1 : 0);
    let need = total - equippedCount;
    if (need < 0) need = 0;
    const max = stackMaxFor(kind);
    let have = 0;
    for (const slot of next.slots) if (slot.kind === kind) have += slot.qty;
    if (have < need) {
      let add = need - have;
      // Top up existing non-full stacks first (keeps splits intact).
      for (const slot of next.slots) {
        if (add <= 0) break;
        if (slot.kind === kind && slot.qty < max) {
          const room = max - slot.qty;
          const put = Math.min(room, add);
          slot.qty += put;
          add -= put;
        }
      }
      // Then empty slots, then grow the grid by whole rows.
      while (add > 0) {
        let slot = next.slots.find((s) => s.kind === null);
        if (!slot) {
          for (let i = 0; i < INVENTORY_SLOTS_PER_ROW; i++) next.slots.push({ kind: null, qty: 0 });
          slot = next.slots.find((s) => s.kind === null);
        }
        if (!slot) break;
        const put = Math.min(max, add);
        slot.kind = kind;
        slot.qty = put;
        add -= put;
      }
    } else if (have > need) {
      let cut = have - need;
      // Trim from the LAST stacks of the kind first.
      for (let i = next.slots.length - 1; i >= 0 && cut > 0; i--) {
        const slot = next.slots[i];
        if (slot.kind !== kind) continue;
        const take = Math.min(slot.qty, cut);
        slot.qty -= take;
        cut -= take;
        if (slot.qty <= 0) { slot.kind = null; slot.qty = 0; }
      }
    }
  }
  // Trim trailing empty rows past the base size (keeps the grid stable).
  while (next.slots.length > INVENTORY_SLOT_COUNT) {
    const lastRow = next.slots.slice(next.slots.length - INVENTORY_SLOTS_PER_ROW);
    if (lastRow.some((s) => s.kind !== null)) break;
    next.slots.length -= INVENTORY_SLOTS_PER_ROW;
  }
  return layoutEquals(next, prev) ? prev : next;
}

/** Drag/drop a slot onto another: same kind merges up to the stack max
 *  (the leftover stays behind); different kinds swap; an empty target
 *  just takes the stack. Out-of-range or same-slot drags are no-ops. */
export function moveSlot(layout: PlayerInventoryLayout, from: number, to: number): PlayerInventoryLayout {
  if (from === to || from < 0 || to < 0 || from >= layout.slots.length || to >= layout.slots.length) return layout;
  const src = layout.slots[from];
  if (!src.kind || src.qty <= 0) return layout;
  const dst = layout.slots[to];
  const next = cloneLayout(layout);
  const nSrc = next.slots[from];
  const nDst = next.slots[to];
  if (!dst.kind) {
    nDst.kind = nSrc.kind;
    nDst.qty = nSrc.qty;
    nSrc.kind = null;
    nSrc.qty = 0;
    return next;
  }
  if (dst.kind === src.kind) {
    const max = stackMaxFor(src.kind);
    const room = max - dst.qty;
    if (room <= 0) return layout;
    const put = Math.min(room, src.qty);
    nDst.qty += put;
    nSrc.qty -= put;
    if (nSrc.qty <= 0) { nSrc.kind = null; nSrc.qty = 0; }
    return next;
  }
  nDst.kind = nSrc.kind;
  nDst.qty = nSrc.qty;
  nSrc.kind = dst.kind;
  nSrc.qty = dst.qty;
  return next;
}

/** Split a stack: half (rounded down, at least 1) moves into the first
 *  empty slot. A single unit cannot split, and a full grid cannot split
 *  (the player makes room first) — both are no-ops. */
export function splitSlot(layout: PlayerInventoryLayout, index: number): PlayerInventoryLayout {
  if (index < 0 || index >= layout.slots.length) return layout;
  const src = layout.slots[index];
  if (!src.kind || src.qty < 2) return layout;
  const empty = layout.slots.findIndex((s) => s.kind === null);
  if (empty < 0) return layout;
  const amount = Math.max(1, Math.floor(src.qty / 2));
  const next = cloneLayout(layout);
  next.slots[index].qty -= amount;
  next.slots[empty].kind = src.kind;
  next.slots[empty].qty = amount;
  return next;
}

/** Equip one unit from a slot into its equip slot (tools -> tool,
 *  weapons -> weapon, armor -> armor). A kind with no equip slot, an
 *  empty slot, or an already-equipped kind are no-ops. The unit leaves
 *  the stack but still counts toward the kind's total. */
export function equipItem(layout: PlayerInventoryLayout, index: number): PlayerInventoryLayout {
  if (index < 0 || index >= layout.slots.length) return layout;
  const src = layout.slots[index];
  if (!src.kind || src.qty <= 0) return layout;
  const slotId = equipSlotFor(src.kind);
  if (!slotId) return layout;
  if (layout.equipped[slotId] === src.kind) return layout;
  const next = cloneLayout(layout);
  next.equipped[slotId] = src.kind;
  next.slots[index].qty -= 1;
  if (next.slots[index].qty <= 0) { next.slots[index].kind = null; next.slots[index].qty = 0; }
  return next;
}

/** Unequip an equip slot back into the inventory: the first stack of
 *  the same kind with room, else the first empty slot, else the grid
 *  grows by a row (the unit must land somewhere — it is never lost). */
export function unequipItem(layout: PlayerInventoryLayout, slotId: EquipSlotId): PlayerInventoryLayout {
  const kind = layout.equipped[slotId];
  if (!kind) return layout;
  const next = cloneLayout(layout);
  next.equipped[slotId] = null;
  const max = stackMaxFor(kind);
  let dst = next.slots.find((s) => s.kind === kind && s.qty < max);
  if (!dst) dst = next.slots.find((s) => s.kind === null);
  if (!dst) {
    for (let i = 0; i < INVENTORY_SLOTS_PER_ROW; i++) next.slots.push({ kind: null, qty: 0 });
    dst = next.slots.find((s) => s.kind === null);
  }
  if (!dst) return layout;
  dst.kind = kind;
  dst.qty += 1;
  return next;
}

/** Read the saved slot layout (corrupt or wrong-shaped saves fall back
 *  to an empty layout — the record re-derives it on the next sync). */
export function readSlotLayout(): PlayerInventoryLayout {
  try {
    const raw = localStorage.getItem(INVENTORY_SLOTS_KEY);
    if (!raw) return emptyLayout();
    const parsed = JSON.parse(raw) as Partial<PlayerInventoryLayout>;
    if (!parsed || !Array.isArray(parsed.slots)) return emptyLayout();
    const layout = emptyLayout();
    parsed.slots.slice(0, 512).forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const kind = (s as InventorySlot).kind;
      const qty = Math.floor(Number((s as InventorySlot).qty));
      if (i < layout.slots.length) {
        layout.slots[i] = { kind: typeof kind === 'string' || kind === null ? kind : null, qty: Number.isFinite(qty) && qty > 0 ? qty : 0 };
        if (layout.slots[i].qty <= 0) layout.slots[i].kind = null;
      } else if (kind && qty > 0) {
        layout.slots.push({ kind, qty });
      }
    });
    const eq = parsed.equipped;
    if (eq && typeof eq === 'object') {
      for (const slotId of ['weapon', 'tool', 'armor'] as EquipSlotId[]) {
        const k = (eq as EquippedSlots)[slotId];
        layout.equipped[slotId] = typeof k === 'string' ? k : null;
      }
    }
    return layout;
  } catch {
    return emptyLayout();
  }
}

export function writeSlotLayout(layout: PlayerInventoryLayout): void {
  try {
    localStorage.setItem(INVENTORY_SLOTS_KEY, JSON.stringify(layout));
  } catch {}
}

/** Reconcile the saved layout against the current record and persist
 *  the result — the view's one call beside refreshPlayerInventory(). */
export function syncSlots(record: Record<string, number>): PlayerInventoryLayout {
  const next = reconcileSlots(record, readSlotLayout());
  writeSlotLayout(next);
  return next;
}
