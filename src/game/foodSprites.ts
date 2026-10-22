// BUILD 951: Kenney Food Kit 2.0 sprites (CC0) for the game's food items.
//
// The game has exactly three food/drink consumables shared by the player
// inventory (GameInventory) and the stall catalog (SHOP_CATALOG): beer,
// corn, and healthPotion. Only two have a Kenney match:
//   beer         -> mug.png   (a beer mug)
//   corn         -> corn.png  (an ear of corn)
// healthPotion has NO match — the kit contains no potion or flask art —
// so it keeps its existing flask mark (stated fallback, never a silent
// icon-less item).
//
// Market-stall counter decoration (IsoRoom) previously used six
// Ghostpixxells pixel sprites from public/iso-food. Those counters now
// draw Kenney equivalents (same 6 slots, same draw code, only the loader
// table changes):
//   bread  -> bread.png, burger -> burger.png, apple_pie -> pie.png
//   steak  -> meat-cooked.png, sushi -> sushi-salmon.png, taco -> taco.png
// pie.png is a generic pie (the kit has no apple pie); meat-cooked is a
// cooked steak; sushi-salmon is the salmon sushi. Approximations are
// stated here, not hidden.
//
// Nothing else is remapped: every non-food item (wood, cloths, lockpicks,
// weapons, armor, silk, bow, monster drops) keeps its existing mark. No
// food item is invented to match unused sprites — the other 192 Kenney
// pictures sit unused in public/sprites/food-sprites/.
// The 600 FBX/OBJ/GLB 3D models from the kit are NOT shipped: this is a
// 2D game and they would only bloat the build.
//
// This module is pure and Node-safe (artUrl handles a missing
// import.meta.env), so sim/standalone scripts can import it.

import { artUrl } from './artCache';

export const FOOD_SPRITE_DIR = 'sprites/food-sprites';

/** Inventory + shop icon per consumable key. Only keys listed here change. */
export const FOOD_ICON_FILES = {
  beer: 'mug.png',
  corn: 'corn.png',
} as const;

export type FoodIconKey = keyof typeof FOOD_ICON_FILES;

/** Cache-busted URL for a consumable's icon, or undefined (keep the mark). */
export function foodIconUrl(key: string): string | undefined {
  const file = (FOOD_ICON_FILES as Record<string, string>)[key];
  return file ? artUrl(`${FOOD_SPRITE_DIR}/${file}`) : undefined;
}

/** Stall-counter decoration files, in counter-slot order. */
export const STALL_COUNTER_FILES = [
  'bread.png',
  'burger.png',
  'pie.png',
  'meat-cooked.png',
  'sushi-salmon.png',
  'taco.png',
] as const;
