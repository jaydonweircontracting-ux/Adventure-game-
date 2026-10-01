// Shared isometric character/food sprite loading for the 2.5D renderer.
// Used by the iso demo (IsoRoom) and the live-game field view (IsoFieldView).
//
// Character art: chibi paper-doll layers from the Universal LPC Spritesheet
// Character Generator asset library (CC-BY-SA / GPL / OGA-BY — see the
// in-demo Info page for full credits), packed offline by
// work/build-lpc-pack.py into public/lpc/:
//   body  — child base, 5 skin tones x 4 animations (idle/walk/slash/hurt)
//   head  — child head + face, 5 skin tones x 4 animations (the child body
//           sheet is headless; the head is a separate generator layer)
//   legs  — child pants, 9 colors (walk cycle only)
//   torso — child shirt, 8 colors (walk cycle only)
//   hair  — child messy/braid, 5 colors each (walk cycle only)
//   hat   — child headbands, 2 styles (walk cycle only)
// Layers that only drew a walk cycle hold walk frame 0 for other states.

export type Face4 = 'up' | 'left' | 'down' | 'right';

export interface LpcLook {
  /** Skin tone key, e.g. 'ivory'. */
  body: string;
  /** Pants color key, e.g. 'darkblue'. */
  legs: string;
  /** Shirt color key, e.g. 'blue'. */
  torso: string;
  /** 'none' or 'style-color', e.g. 'messy-brown'. */
  hair: string;
  /** Headband key, e.g. 'hairtie'. Optional. */
  hat?: string;
}

// The player character's fixed look.
export const PLAYER_LOOK: LpcLook = {
  body: 'ivory',
  legs: 'darkblue',
  torso: 'blue',
  hair: 'messy-brown',
};

/** Paper-doll layers, in draw order: body -> head -> legs -> torso -> hair -> hat. */
export type LpcLayer = 'body' | 'head' | 'legs' | 'torso' | 'hair' | 'hat';

/** Per-animation sprite files. Only the body and head drew every animation; the
 *  other layers only drew the walk cycle (verified against the packed PNGs:
 *  child hair sheets are 768x1344 canvases with only rows 8-11 painted). */
export type LpcAnim = 'idle' | 'walk' | 'slash' | 'hurt';

export const LPC_CELL = 64;
// Measured foot baseline on the chibi frames: the bottom-most opaque pixel
// lands on source row 60-62 across every direction, frame, and animation.
// Anchor sprites here so feet land on the tile point instead of floating.
export const LPC_FEET_ROW = 62;
// LPC direction row order inside per-animation sheets: up, left, down, right
// (verified: the packed walk.png matches the reference sheet row-for-row).
export const LPC_DIR_ROW: Record<Face4, number> = { up: 0, left: 1, down: 2, right: 3 };

/**
 * Tile-space facing from a tile-space movement delta — matches the main 2D
 * game's convention (D-pad up walks away from the camera). BUILD 384: the iso
 * field view used to project the delta into screen space first, which mapped
 * every axis-aligned move to left/right, so walking "forward" (tile north)
 * rendered the right-facing side sprite instead of the back-of-character
 * sprite (LPC row 0). Tile-space mapping restores the distinct up/down rows.
 */
export function tileFaceForDelta(dx: number, dy: number): Face4 {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
export const LPC_FRAMES: Record<LpcAnim, number> = { idle: 2, walk: 9, slash: 6, hurt: 6 };

// ---------------------------------------------------------------------------
// BUILD 389: "brute" player sprite pack (user-supplied sheet, chroma-keyed).
// Single 1170x195 strip: six 195px cells = front stand, front walk, side
// stand, side walk, back stand, back walk. Right reuses the side cells
// flipped. Feet anchor = bottom of the cell.
// ---------------------------------------------------------------------------
export const BRUTE_SHEET_FILE = 'brute/brute_sheet.png';
export const BRUTE_CELL = 195;
/** [standCol, walkCol] per facing into the brute strip. */
export const BRUTE_COLS: Record<Face4, [number, number]> = {
  down: [0, 1],
  left: [2, 3],
  up: [4, 5],
  right: [2, 3],
};
/** The right facing reuses the side cells mirrored. */
export function bruteFlip(face: Face4): boolean {
  return face === 'right';
}
/** Frames per animation for the brute pack (idle/walk art only). */
export const BRUTE_FRAMES: Record<LpcAnim, number> = { idle: 1, walk: 2, slash: 1, hurt: 1 };

let bruteImg: HTMLImageElement | null = null;
let brutePreloaded = false;
export function preloadBruteSprite(): void {
  if (brutePreloaded || typeof window === 'undefined') return;
  brutePreloaded = true;
  const img = new Image();
  img.onerror = () => console.warn(`[isoSprites] brute sheet failed to load: ${BRUTE_SHEET_FILE}`);
  img.src = `${import.meta.env.BASE_URL}${BRUTE_SHEET_FILE}`;
  bruteImg = img;
}
export function bruteReady(): boolean {
  return !!bruteImg && bruteImg.complete && bruteImg.naturalWidth > 0;
}
export function bruteSprite(): HTMLImageElement | undefined {
  return bruteReady() ? bruteImg! : undefined;
}
// Hair uses classic full-layout sheets: walk cycle lives on rows 8-11.
export const LPC_CLASSIC_WALK_ROW = 8;

// Deterministic NPC-variant pools.
export const LPC_BODY_TONES = ['ivory', 'tan', 'tawny', 'bronze', 'brown'];
export const LPC_SHIRTS = ['black', 'blue', 'brown', 'gray', 'green', 'lavender', 'lightblue', 'pink'];
export const LPC_PANTS = ['black', 'blue', 'brown', 'darkblue', 'green', 'lightblue', 'maroon', 'red', 'white'];
export const LPC_HAIR_STYLES = ['messy', 'braid'];
export const LPC_HAIR_COLORS = ['black', 'brown', 'blonde', 'red', 'whiteblonde'];
export const LPC_HATS = ['hairtie', 'thick'];

/** Hair pool entries ('none' = bald, matching the bare reference sheet). */
export const LPC_HAIR_POOL: string[] = [
  'none',
  ...LPC_HAIR_STYLES.flatMap((s) => LPC_HAIR_COLORS.map((c) => `${s}-${c}`)),
];

/** Paper-doll layers with their file keys (used for per-layer fallbacks). */
export function lpcLayerKeys(look: LpcLook): { key: string; layer: LpcLayer }[] {
  const layers: { key: string; layer: LpcLayer }[] = [
    { key: `body-${look.body}`, layer: 'body' },
    { key: `head-${look.body}`, layer: 'head' },
    { key: `pants-${look.legs}`, layer: 'legs' },
    { key: `shirt-${look.torso}`, layer: 'torso' },
  ];
  if (look.hair && look.hair !== 'none') layers.push({ key: `hair-${look.hair}`, layer: 'hair' });
  if (look.hat) layers.push({ key: `hat-${look.hat}`, layer: 'hat' });
  return layers;
}

/** One drawable frame source: file id + row + usable frame count. */
export interface LpcClip {
  file: string;
  row: number;
  frames: number;
}

/**
 * Resolve (layer, animation, facing) to a concrete sprite region.
 * Clothes/hair/hat only drew walk cycles, so non-walk states reuse walk
 * frame 0 for those layers (static while the body plays its real clip).
 * The body and head hurt sheets are single direction-agnostic rows.
 */
export function lpcClip(layer: LpcLayer, key: string, anim: LpcAnim, face: Face4): LpcClip {
  const d = LPC_DIR_ROW[face];
  if (layer === 'body' || layer === 'head') {
    return { file: `${key}-${anim}`, row: anim === 'hurt' ? 0 : d, frames: LPC_FRAMES[anim] };
  }
  if (layer === 'hair') {
    return { file: key, row: LPC_CLASSIC_WALK_ROW + d, frames: anim === 'walk' ? 9 : 1 };
  }
  return { file: `${key}-walk`, row: d, frames: anim === 'walk' ? 9 : 1 };
}

// Every packed file, for the preload list.
const LPC_FILES: string[] = [
  ...LPC_BODY_TONES.flatMap((t) => (Object.keys(LPC_FRAMES) as LpcAnim[]).map((a) => `body-${t}-${a}`)),
  ...LPC_BODY_TONES.flatMap((t) => (Object.keys(LPC_FRAMES) as LpcAnim[]).map((a) => `head-${t}-${a}`)),
  ...LPC_SHIRTS.map((c) => `shirt-${c}-walk`),
  ...LPC_PANTS.map((c) => `pants-${c}-walk`),
  ...LPC_HAIR_STYLES.flatMap((s) => LPC_HAIR_COLORS.map((c) => `hair-${s}-${c}`)),
  ...LPC_HATS.map((h) => `hat-${h}-walk`),
];

// module-level LPC sprite cache (read by canvas loops; filled once)
const sprCache: Record<string, HTMLImageElement> = {};
let sprPreloaded = false;
export function preloadLpcSprites() {
  if (sprPreloaded) return;
  sprPreloaded = true;
  for (const f of LPC_FILES) {
    const img = new Image();
    // Warn once per sheet if it fails — the renderer falls back gracefully.
    img.onerror = () => console.warn(`[isoSprites] character sheet failed to load: ${f}`);
    img.src = `${import.meta.env.BASE_URL}lpc/${f}.png`;
    sprCache[f] = img;
  }
}
export function lpcReady(files: string[]): boolean {
  return files.every((f) => {
    const im = sprCache[f];
    return im !== undefined && im.complete && im.naturalWidth > 0;
  });
}
export function lpcSprite(file: string): HTMLImageElement | undefined {
  const im = sprCache[file];
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
  return FOOD_FILES.every((f) => {
    const im = foodCache[f];
    return im !== undefined && im.complete && im.naturalWidth > 0;
  });
}
export function foodSprite(key: string): HTMLImageElement | undefined {
  const im = foodCache[key];
  return im && im.complete && im.naturalWidth > 0 ? im : undefined;
}
export const FOOD_KEYS = FOOD_FILES;
