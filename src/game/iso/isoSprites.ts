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
 * Mana Seed pONE3 layout (verified against the shipped sheets): each
 * direction interleaves its stand and walk rows —
 * row 0 = stand down, 1 = walk down, 2 = stand up, 3 = walk up,
 * row 4 = stand left, 5 = walk left, 6 = stand right, 7 = walk right.
 * (NOT the LPC layout of stands 0-3 then walks 4-7; that mis-mapping made
 * left/right face backwards and idles show mid-stride fist-out frames.)
 */
export const MS_CELL = 64;
export const MS_WALK_FRAMES = 6;
// Measured foot baseline across all body variants: stand rows end at source
// row 43, walk rows at 44 (64px cells). Anchor sprites here so feet land on
// the tile point instead of floating above it.
export const MS_FEET_ROW = 43.5;
export const MS_ROW: Record<Face4, { stand: number; walk: number }> = {
  down: { stand: 0, walk: 1 },
  up: { stand: 2, walk: 3 },
  left: { stand: 4, walk: 5 },
  right: { stand: 6, walk: 7 },
};

/** Paper-doll draw order: body -> outfit -> armor -> hair -> hat. */
export type MsLayer = 'body' | 'outfit' | 'armor' | 'hair' | 'hat';

export function msLookKeys(look: MsLook): string[] {
  return msLayerKeys(look).map(l => l.key);
}

/** Paper-doll layers with their slot names (used for per-layer fallbacks). */
export function msLayerKeys(look: MsLook): { key: string; layer: MsLayer }[] {
  const layers: { key: string; layer: MsLayer }[] = [
    { key: look.body, layer: 'body' },
    { key: look.outfit, layer: 'outfit' },
  ];
  if (look.armor) layers.push({ key: look.armor, layer: 'armor' });
  layers.push({ key: look.hair, layer: 'hair' });
  if (look.hat) layers.push({ key: look.hat, layer: 'hat' });
  return layers;
}

// Full Mana Seed pONE3 wardrobe (61 sheets, ~1.3MB total). Bodies are skin
// tones v00 (light) -> v10 (dark); outfits: undi/boxr are underwear, fstr and
// pfpn are full clothes; hairs bob1/dap1 x14 colors; hats pfht/pnty x5 colors.
const MS_BODIES = [
  'char_a_pONE3_0bas_humn_v00', 'char_a_pONE3_0bas_humn_v01',
  'char_a_pONE3_0bas_humn_v02', 'char_a_pONE3_0bas_humn_v03',
  'char_a_pONE3_0bas_humn_v04', 'char_a_pONE3_0bas_humn_v05',
  'char_a_pONE3_0bas_humn_v06', 'char_a_pONE3_0bas_humn_v07',
  'char_a_pONE3_0bas_humn_v08', 'char_a_pONE3_0bas_humn_v09',
  'char_a_pONE3_0bas_humn_v10',
];
const MS_OUTFITS = [
  'char_a_pONE3_1out_undi_v01', 'char_a_pONE3_1out_boxr_v01',
  'char_a_pONE3_1out_fstr_v01', 'char_a_pONE3_1out_fstr_v02',
  'char_a_pONE3_1out_fstr_v03', 'char_a_pONE3_1out_fstr_v04',
  'char_a_pONE3_1out_fstr_v05', 'char_a_pONE3_1out_pfpn_v01',
  'char_a_pONE3_1out_pfpn_v02', 'char_a_pONE3_1out_pfpn_v03',
  'char_a_pONE3_1out_pfpn_v04', 'char_a_pONE3_1out_pfpn_v05',
];
const MS_HAIRS = [
  'char_a_pONE3_4har_bob1_v00', 'char_a_pONE3_4har_bob1_v01',
  'char_a_pONE3_4har_bob1_v02', 'char_a_pONE3_4har_bob1_v03',
  'char_a_pONE3_4har_bob1_v04', 'char_a_pONE3_4har_bob1_v05',
  'char_a_pONE3_4har_bob1_v06', 'char_a_pONE3_4har_bob1_v07',
  'char_a_pONE3_4har_bob1_v08', 'char_a_pONE3_4har_bob1_v09',
  'char_a_pONE3_4har_bob1_v10', 'char_a_pONE3_4har_bob1_v11',
  'char_a_pONE3_4har_bob1_v12', 'char_a_pONE3_4har_bob1_v13',
  'char_a_pONE3_4har_dap1_v00', 'char_a_pONE3_4har_dap1_v01',
  'char_a_pONE3_4har_dap1_v02', 'char_a_pONE3_4har_dap1_v03',
  'char_a_pONE3_4har_dap1_v04', 'char_a_pONE3_4har_dap1_v05',
  'char_a_pONE3_4har_dap1_v06', 'char_a_pONE3_4har_dap1_v07',
  'char_a_pONE3_4har_dap1_v08', 'char_a_pONE3_4har_dap1_v09',
  'char_a_pONE3_4har_dap1_v10', 'char_a_pONE3_4har_dap1_v11',
  'char_a_pONE3_4har_dap1_v12', 'char_a_pONE3_4har_dap1_v13',
];
const MS_HATS = [
  'char_a_pONE3_5hat_pfht_v01', 'char_a_pONE3_5hat_pfht_v02',
  'char_a_pONE3_5hat_pfht_v03', 'char_a_pONE3_5hat_pfht_v04',
  'char_a_pONE3_5hat_pfht_v05', 'char_a_pONE3_5hat_pnty_v01',
  'char_a_pONE3_5hat_pnty_v02', 'char_a_pONE3_5hat_pnty_v03',
  'char_a_pONE3_5hat_pnty_v04', 'char_a_pONE3_5hat_pnty_v05',
];

const MS_FILES = [...MS_BODIES, ...MS_OUTFITS, ...MS_HAIRS, ...MS_HATS];

// Deterministic NPC-variant pools. Outfits exclude underwear (undi/boxr) so
// generated villagers wear clothes; hats are optional (see variantLook).
export const VARIANT_BODIES = MS_BODIES;
export const VARIANT_OUTFITS = MS_OUTFITS.filter(f => f.includes('_fstr_') || f.includes('_pfpn_'));
export const VARIANT_HAIRS = MS_HAIRS;
export const VARIANT_HATS = MS_HATS;

// module-level Mana Seed sprite cache (read by canvas loops; filled once)
const sprCache: Record<string, HTMLImageElement> = {};
let sprPreloaded = false;
export function preloadMsSprites() {
  if (sprPreloaded) return;
  sprPreloaded = true;
  for (const f of MS_FILES) {
    const img = new Image();
    // Warn once per sheet if it fails — the renderer falls back gracefully.
    img.onerror = () => console.warn(`[isoSprites] character sheet failed to load: ${f}`);
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
