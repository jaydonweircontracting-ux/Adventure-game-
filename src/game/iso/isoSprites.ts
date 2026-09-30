// Shared isometric character/food sprite loading for the 2.5D renderer.
// Used by the iso demo (IsoRoom) and the live-game field view (IsoFieldView).
// Mana Seed Character Base demo by Seliel the Shaper — paper-doll layers
// (body + outfit + hair + hat), free for commercial/non-commercial use.
// See the in-demo Info page for full credits.

export type Face4 = 'up' | 'left' | 'down' | 'right';

export interface MsLook {
  body: string;
  outfit: string;
  hair: string;
  hat?: string;
  // Future armor layer: drawn over the outfit, under hair/hat. Armor sprites
  // drop in here with no renderer changes.
  armor?: string;
}

// Character looks built from Mana Seed paper-doll layers (pONE3 set — the
// complete wardrobe: 11 skin tones, underwear/boxers, clothes, hair, hats).
// Index 0 is the player. Base state is underwear/shorts; the outfit slot
// takes clothes or armor later.
// Body variants are skin tones: v00 light, v01/v02 fair, v03/v04 tan,
// v05/v06 brown, v07/v08 deep, v09/v10 dark.
export const NPC_LOOKS: MsLook[] = [
  { body: 'char_a_pONE3_0bas_humn_v00', outfit: 'char_a_pONE3_1out_undi_v01', hair: 'char_a_pONE3_4har_bob1_v00' },
  { body: 'char_a_pONE3_0bas_humn_v03', outfit: 'char_a_pONE3_1out_boxr_v01', hair: 'char_a_pONE3_4har_dap1_v03' },
  { body: 'char_a_pONE3_0bas_humn_v06', outfit: 'char_a_pONE3_1out_fstr_v02', hair: 'char_a_pONE3_4har_bob1_v05' },
  { body: 'char_a_pONE3_0bas_humn_v09', outfit: 'char_a_pONE3_1out_pfpn_v02', hair: 'char_a_pONE3_4har_dap1_v09', hat: 'char_a_pONE3_5hat_pfht_v02' },
  { body: 'char_a_pONE3_0bas_humn_v01', outfit: 'char_a_pONE3_1out_undi_v01', hair: 'char_a_pONE3_4har_bob1_v08' },
  { body: 'char_a_pONE3_0bas_humn_v07', outfit: 'char_a_pONE3_1out_fstr_v04', hair: 'char_a_pONE3_4har_dap1_v12', hat: 'char_a_pONE3_5hat_pnty_v03' },
];

/**
 * Mana Seed base sheet: 8x8 grid of 64x64 cells.
 * Stand (col 0): row 0 = down, 1 = up, 2 = left, 3 = right.
 * Walk (6 frames, cols 0-5): row 4 = down, 5 = up, 6 = left, 7 = right.
 */
export const MS_CELL = 64;
export const MS_WALK_FRAMES = 6;
// Measured foot baseline across all body variants: stand rows end at source
// row 43, walk rows at 44 (64px cells). Anchor sprites here so feet land on
// the tile point instead of floating above it.
export const MS_FEET_ROW = 43.5;
export const MS_ROW: Record<Face4, { stand: number; walk: number }> = {
  down: { stand: 0, walk: 4 },
  up: { stand: 1, walk: 5 },
  left: { stand: 2, walk: 6 },
  right: { stand: 3, walk: 7 },
};

/** Paper-doll draw order: body -> outfit -> armor -> hair -> hat. */
export function msLookKeys(look: MsLook): string[] {
  const keys = [look.body, look.outfit];
  if (look.armor) keys.push(look.armor);
  keys.push(look.hair);
  if (look.hat) keys.push(look.hat);
  return keys;
}

const MS_FILES = [
  'char_a_pONE3_0bas_humn_v00', 'char_a_pONE3_0bas_humn_v01',
  'char_a_pONE3_0bas_humn_v03', 'char_a_pONE3_0bas_humn_v06',
  'char_a_pONE3_0bas_humn_v07', 'char_a_pONE3_0bas_humn_v09',
  'char_a_pONE3_1out_undi_v01', 'char_a_pONE3_1out_boxr_v01',
  'char_a_pONE3_1out_fstr_v02', 'char_a_pONE3_1out_fstr_v04',
  'char_a_pONE3_1out_pfpn_v02',
  'char_a_pONE3_4har_bob1_v00', 'char_a_pONE3_4har_bob1_v05',
  'char_a_pONE3_4har_bob1_v08', 'char_a_pONE3_4har_dap1_v03',
  'char_a_pONE3_4har_dap1_v09', 'char_a_pONE3_4har_dap1_v12',
  'char_a_pONE3_5hat_pfht_v02', 'char_a_pONE3_5hat_pnty_v03',
];

// module-level Mana Seed sprite cache (read by canvas loops; filled once)
const sprCache: Record<string, HTMLImageElement> = {};
let sprPreloaded = false;
export function preloadMsSprites() {
  if (sprPreloaded) return;
  sprPreloaded = true;
  for (const f of MS_FILES) {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}manaseed/${f}.png`;
    sprCache[f] = img;
  }
}
export function msReady(keys: string[]): boolean {
  return keys.every(k => {
    const im = sprCache[k];
    return im !== undefined && im.complete && im.naturalWidth > 0;
  });
}
export function msSprite(key: string): HTMLImageElement | undefined {
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
