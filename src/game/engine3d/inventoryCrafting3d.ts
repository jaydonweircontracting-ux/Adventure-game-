// inventoryCrafting3d.ts — NEURON HEX 0x0D area 5 (BUILD 1075).
// The player's inventory store, extracted verbatim from Engine3DWorldView.tsx.
//
// HONEST SCOPE: the 3D game has NO crafting system — no recipes, no
// crafting stations, no grid inventory, no hotbar, no tool durability.
// (That is the user's separate crafting/inventory program, still awaiting
// his go-ahead on sequencing — it is NOT built here.) What exists is the
// player's resource record (wood/stone/gold/wheat + keepsakes), mirrored
// from the R-1 resource registry (resourceRegistry.ts, the authority).
// This module owns the inventory's save/load and the registry -> React
// mirror. The Build mode / placement flow is NOT here — that is area 6
// (building interactions). The HUD readout of the inventory is area 7.
import { keepsakesOf, playerInventoryToRegistry, registryToPlayerInventory, type ResourceRegistry } from './resourceRegistry';

export const INVENTORY_KEY = 'ag-3d-inventory-v1';
export type Inventory3D = Record<string, number>;

export function readSaved<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? { ...fallback, ...JSON.parse(value) } : fallback; } catch { return fallback; }
}

export function initialInventory(): Inventory3D {
  return readSaved<Inventory3D>(INVENTORY_KEY, {});
}

export interface InventoryContext {
  registry: () => ResourceRegistry;
  inventoryRef: { current: Inventory3D };
  setInventory: (next: Inventory3D) => void;
}

// Mirror the registry's player store into the React inventory state and
// persist it to INVENTORY_KEY. Verbatim from refreshResourceUi's inventory
// part (BUILD 1064). The state is set only when the player record actually
// changed (a founder delivery must not re-render the HUD).
export function refreshPlayerInventory(ctx: InventoryContext): void {
  const reg = ctx.registry();
  const nextInv = registryToPlayerInventory(reg, keepsakesOf(ctx.inventoryRef.current));
  if (JSON.stringify(nextInv) !== JSON.stringify(ctx.inventoryRef.current)) {
    ctx.inventoryRef.current = nextInv;
    ctx.setInventory(nextInv);
  }
  try { localStorage.setItem(INVENTORY_KEY, JSON.stringify(nextInv)); } catch {}
}

// Load the saved player inventory into a fresh registry (init effect).
// The player store rides in from INVENTORY_KEY; keepsakes stay out of
// the registry. Verbatim from the init effect (BUILD 1064).
export function loadPlayerInventoryIntoRegistry(reg: ResourceRegistry): ResourceRegistry {
  return playerInventoryToRegistry(reg, readSaved<Inventory3D>(INVENTORY_KEY, {}));
}
