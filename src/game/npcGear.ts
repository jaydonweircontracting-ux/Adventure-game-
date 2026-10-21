// NPC worn gear (BUILD 921).
//
// Townsfolk carry NO equipment data: what an NPC "wears" is purely the
// cosmetic paper-doll produced by variantLook(npc.id) in
// iso/characterSystem.ts (deterministic from the NPC id — same id, same
// outfit, across chunks and save/load). This module is the bridge between
// that rendered outfit and the game's real item system, so a dead NPC can
// drop the weapons/armor it was visibly wearing:
//
//   wornGearBaseIds(npcId)  -> the item-base ids of the NPC's worn gear.
//                             Stored on the lootable body as loot.items.
//   lookWithoutLootedGear   -> the corpse's render look with looted layers
//                             removed, so looting visibly unequips the body.
//
// Gear = weapon, headwear, arms, shield, boots, plus torso layers whose
// item base is armor. Plain clothing (shirts, pants, kilts) and body parts
// (hair, beard) are NOT gear: the corpse keeps its clothes, and looting
// strips it of weapons/armor only. A worn folder with no item base cannot
// become a loot entry and stays on the corpse (BUILD 921 added the 7
// missing bases so every variantLook armor/headwear/arms folder has one;
// the sim asserts that coverage so future outfit drift is caught).
//
// Body loot stores BASE ids (e.g. 'rusty_sword'), not sprite-folder names:
// the base id is the real item identity — the paperdoll equips it, the
// panel names it, and the take path generates that exact base. The folder
// is recovered through ITEM_BASE_ART when the render needs it.

import { variantLook } from './iso/characterSystem';
import { ITEM_BASE_ART, RPG_FOLDER_VISUAL_SLOT } from './iso/equipmentArt';
import type { RpgLook } from './iso/rpgSprites';
import { ITEM_BASES } from './items';

/** Visual slots that count as gear regardless of item slot. */
const GEAR_VISUAL_SLOTS = new Set(['weapon', 'headwear', 'arms', 'shield', 'boots']);

/**
 * First item base whose art includes this sprite folder, or null when the
 * folder has no item form. Iteration order is ITEM_BASE_ART insertion
 * order, so shared folders resolve deterministically (BroadSword ->
 * rusty_sword, the first base that wears it).
 */
export function baseIdForFolder(folder: string): string | null {
  for (const [baseId, folders] of Object.entries(ITEM_BASE_ART)) {
    if (folders.includes(folder)) return baseId;
  }
  return null;
}

/** First worn sprite folder for an item base, or null. */
export function folderForBaseId(baseId: string): string | null {
  return ITEM_BASE_ART[baseId]?.[0] ?? null;
}

/** True when this rendered folder is lootable gear (not plain clothing). */
export function isGearFolder(folder: string): boolean {
  const slot = RPG_FOLDER_VISUAL_SLOT[folder];
  if (!slot) return false;
  if (GEAR_VISUAL_SLOTS.has(slot)) return true;
  if (slot !== 'torso') return false;
  // Torso counts only when its item is armor; shirts have no base at all,
  // so they fall out here either way.
  const baseId = baseIdForFolder(folder);
  if (!baseId) return false;
  return ITEM_BASES.find((b) => b.id === baseId)?.slot === 'armor';
}

/**
 * The item-base ids of the gear this NPC visibly wears, in render order.
 * Pure and deterministic: same npcId always yields the same list.
 */
export function wornGearBaseIds(npcId: string): string[] {
  const out: string[] = [];
  for (const folder of variantLook(npcId).equipment) {
    if (!isGearFolder(folder)) continue;
    const baseId = baseIdForFolder(folder);
    if (baseId && !out.includes(baseId)) out.push(baseId);
  }
  return out;
}

/**
 * The gear from this NPC's outfit that is no longer on its body: worn gear
 * minus whatever the body still holds. The caller passes the body's
 * remaining loot.items (base ids).
 */
export function lootedGearBaseIds(npcId: string, remainingItemIds: readonly string[]): string[] {
  return wornGearBaseIds(npcId).filter((baseId) => !remainingItemIds.includes(baseId));
}

/**
 * A character look with looted gear layers removed. Non-gear layers
 * (base body, clothing, hair, beard) pass through untouched, and gear
 * whose base is not in `lootedBaseIds` stays. Pure.
 */
export function lookWithoutLootedGear(look: RpgLook, lootedBaseIds: readonly string[]): RpgLook {
  if (lootedBaseIds.length === 0) return look;
  const looted = new Set(lootedBaseIds);
  return {
    ...look,
    equipment: look.equipment.filter((folder) => {
      if (!isGearFolder(folder)) return true;
      const baseId = baseIdForFolder(folder);
      return !baseId || !looted.has(baseId);
    }),
  };
}

/** Display name for a loot base id; falls back to a prettified id. */
export function gearNameForBaseId(baseId: string): string {
  return ITEM_BASES.find((b) => b.id === baseId)?.name ?? baseId.replace(/[-_]/g, ' ');
}

/** True when this base id exists in the item catalog. */
export function isKnownBaseId(baseId: string): boolean {
  return ITEM_BASES.some((b) => b.id === baseId);
}
