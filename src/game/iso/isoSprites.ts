// Shared isometric character/food sprite loading for the 2.5D renderer.
// Used by the iso demo (IsoRoom) and the live-game field view (IsoFieldView).
// Universal LPC Spritesheet Character Generator layers — see the in-demo Info
// page for full artist credits.

export type Face4 = 'up' | 'left' | 'down' | 'right';

// Character looks built from LPC layers. Index 0 is the player.
export const NPC_LOOKS = [
  { body: 'body-m', head: 'head-m', shirt: 'shirt-scoop-m', hair: 'hair-pixie' },
  { body: 'body-f', head: 'head-f', shirt: 'shirt-scoop-f', hair: 'hair-bob' },
  { body: 'body-m', head: 'head-m', shirt: 'shirt-cuffed-m', hair: 'hair-messy1' },
  { body: 'body-f', head: 'head-f', shirt: 'shirt-scoop-f', hair: 'hair-pixie' },
  { body: 'body-m', head: 'head-m', shirt: 'shirt-formal-m', hair: 'hair-messy1' },
];

const LPC_FILES = ['body-m', 'body-f', 'head-m', 'head-f', 'pants-m', 'shirt-scoop-m', 'shirt-scoop-f',
  'shirt-cuffed-m', 'shirt-formal-m', 'hair-pixie', 'hair-bob', 'hair-messy1'];
export const LPC_ROW: Record<Face4, number> = { up: 0, left: 1, down: 2, right: 3 };

// module-level LPC sprite cache (read by canvas loops; filled once)
const sprCache: Record<string, HTMLImageElement> = {};
let sprPreloaded = false;
export function preloadLpcSprites() {
  if (sprPreloaded) return;
  sprPreloaded = true;
  for (const f of LPC_FILES) {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}iso-chars/${f}.png`;
    sprCache[f] = img;
  }
}
export function lpcReady(keys: string[]): boolean {
  return keys.every(k => {
    const im = sprCache[k];
    return im !== undefined && im.complete && im.naturalWidth > 0;
  });
}
export function lpcSprite(key: string): HTMLImageElement | undefined {
  const im = sprCache[key];
  return im && im.complete && im.naturalWidth > 0 ? im : undefined;
}

// Ghostpixxells pixel food for market stall counters
const FOOD_FILES = ['07_bread', '15_burger', '05_apple_pie', '95_steak', '97_sushi', '99_taco'];
const foodCache: Record<string, HTMLImageElement> = {};
let foodPreloaded = false;
export function preloadFoodSprites() {
  if (foodPreloaded) return;
  foodPreloaded = true;
  for (const f of FOOD_FILES) {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}iso-food/${f}.png`;
    foodCache[f] = img;
  }
}
export function foodReady(): boolean {
  return FOOD_FILES.every(f => {
    const im = foodCache[f];
    return im !== undefined && im.complete && im.naturalWidth > 0;
  });
}
export function foodSprite(key: string): HTMLImageElement | undefined {
  const im = foodCache[key];
  return im && im.complete && im.naturalWidth > 0 ? im : undefined;
}
export const FOOD_KEYS = FOOD_FILES;
