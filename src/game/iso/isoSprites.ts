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
/**
 * BUILD 414: extended player facing. The barbarian pack has dedicated
 * up-right and up-left diagonal walk art (the user's walk sheet, original
 * and mirrored), so the player's screen-space facing gains four values beyond
 * Face4. NPCs, the LPC paper-doll fallback, and tile-space facing stay on
 * Face4; only the player-facing pipeline (screen-delta facing, animator,
 * barbarian renderer, field + interior views) uses Face8.
 */
export type Face8 = Face4 | 'upright' | 'upleft' | 'downright' | 'downleft';

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

/**
 * BUILD 402: omni-directional iso PLAYER facing. tileFaceForDelta picks the
 * dominant TILE axis, which is right for axis-aligned D-pad moves (D-pad up
 * = tile north = back sprite). But in the 2:1 dimetric projection a
 * world-diagonal step (e.g. north-east = (1,-1)) travels as a pure
 * SCREEN-cardinal move (straight right across the screen) while the sprite
 * would show the back (up) art — the character visibly doesn't face where
 * it's going. Near-diagonal deltas are therefore projected to screen space
 * (sx = dx - dy, sy = dx + dy) and the screen-dominant axis picks the art:
 * the 4 angle sheets cover all 8 movement directions (diagonal up-left/right
 * use the back sprite, diagonal down-left/right use the front sprite).
 * Axis-aligned and mostly-axis moves keep the tile-axis convention.
 */
export function isoPlayerFaceForDelta(dx: number, dy: number): Face4 {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax > 1e-9 && ay > 1e-9 && Math.max(ax, ay) / Math.min(ax, ay) < 1.5) {
    const sx = dx - dy, sy = dx + dy; // 2:1 dimetric projection of the delta
    if (Math.abs(sx) > Math.abs(sy)) return sx > 0 ? 'right' : 'left';
    return sy > 0 ? 'down' : 'up';
  }
  return tileFaceForDelta(dx, dy);
}

/**
 * BUILD 405: sticky player facing. isoPlayerFaceForDelta flips to the side
 * asset on minor drift while walking up/down: per-frame actual deltas pick up
 * collision-slide and touch jitter, and the 1.5 diagonal band projects those
 * near-axial deltas to screen space (e.g. (0.8,-1) -> 'right'), so the sprite
 * flickers between assets mid-stride. The candidate only replaces the current
 * facing when it is clearly indicated — the candidate's tile axis must
 * dominate (or tie). A marginal diagonal keeps the current facing, so walking
 * up keeps the back sprite and never flips to the side asset on drift.
 */
export function isoPlayerFaceForDeltaSticky(dx: number, dy: number, current: Face4): Face4 {
  const next = isoPlayerFaceForDelta(dx, dy);
  if (next === current) return next;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  switch (next) {
    case 'up': return dy < 0 && ay >= ax ? next : current;
    case 'down': return dy > 0 && ay >= ax ? next : current;
    case 'left': return dx < 0 && ax >= ay ? next : current;
    case 'right': return dx > 0 && ax >= ay ? next : current;
  }
}

/**
 * BUILD 406: uniform on-screen speed for the 2:1 dimetric projection. The
 * game loop drives movement with a tile-space unit vector, but the iso
 * projection stretches directions unevenly on screen: screen-left/right
 * (tile diagonals (1,-1)/(-1,1)) cover ~2x the pixels of screen-up/down
 * (tile diagonals (1,1)/(-1,-1)) per tile step, so left/right felt twice as
 * fast as up/down. Given a tile-space unit direction (ux, uy), this returns
 * the speed multiplier that makes on-screen speed uniform, anchored so
 * screen-up/down keeps its current speed (scale 1 there, 0.5 for
 * screen-left/right).
 */
export function isoScreenSpeedScale(ux: number, uy: number): number {
  const projected = Math.hypot(ux - uy, (ux + uy) / 2); // 2:1 dimetric
  if (projected < 1e-9) return 1;
  return Math.SQRT1_2 / projected; // SQRT1_2 = projected length of up/down
}

/**
 * BUILD 408/410/411/414: screen-space player facing with a northward preference.
 * The tile delta is projected into true screen space (2:1 dimetric) and the
 * dominant screen axis picks the art — except northward travel is split into
 * three bands (BUILD 414): within 22.5deg of straight screen-up shows the
 * back/up sprite; the 22.5-67.5deg diagonal bands show the dedicated
 * up-right / up-left diagonal art (the user's walk sheet, original and
 * mirrored); beyond 67.5deg the side sprite for the travel direction.
 * BUILD 423: southward mirrors northward — within 22.5deg of straight
 * screen-down shows the front/down sprite; the 22.5-67.5deg diagonal bands
 * resolve to the dedicated down-right / down-left art (user's sheets, coming;
 * the renderer falls back to the side views until they land); beyond 67.5deg
 * the side sprite for the travel direction. `current` is only the
 * zero-movement fallback.
 */
export function isoPlayerFaceForScreenDelta(dx: number, dy: number, current: Face8): Face8 {
  if (Math.abs(dx) + Math.abs(dy) < 1e-9) return current; // no movement: keep facing
  const sx = dx - dy; // screen x of the tile delta (2:1 dimetric)
  const sy = (dx + dy) / 2; // screen y of the tile delta
  const ax = Math.abs(sx), ay = Math.abs(sy);
  if (sy < 0) {
    // northward: back sprite within 22.5deg of straight-up; the diagonal
    // bands (22.5-67.5deg) use the dedicated up-right/up-left art; beyond
    // that the side sprite for the travel direction.
    if (ax <= ay * 0.4142) return 'up';
    if (ax <= ay * 2.4142) return sx > 0 ? 'upright' : 'upleft';
    return sx > 0 ? 'right' : 'left';
  }
  // southward: front sprite within 22.5deg of straight-down; the diagonal
  // bands (22.5-67.5deg) use the dedicated down-right/down-left art; beyond
  // that the side sprite for the travel direction.
  if (ax <= ay * 0.4142) return 'down';
  if (ax <= ay * 2.4142) return sx > 0 ? 'downright' : 'downleft';
  return sx > 0 ? 'right' : 'left';
}

/**
 * BUILD 420: sticky screen-space facing. isoPlayerFaceForScreenDelta flips
 * between 'upright' and 'upleft' on tiny sx noise: when the player stops,
 * the final deceleration frames have small deltas, and a slight negative sx
 * in one of those frames flips NE to NW — so the character idles facing the
 * wrong diagonal. The candidate only replaces the current facing when it is
 * clearly indicated: switching between the two diagonals requires a
 * significant screen-x (|sx| > 0.03) pointing the new way; other transitions
 * use the base mapping. Stopping keeps the last facing.
 * BUILD 423: the same stickiness applies to the southward diagonal pair
 * ('downright' <-> 'downleft').
 */
export function isoPlayerFaceForScreenDeltaSticky(dx: number, dy: number, current: Face8): Face8 {
  const next = isoPlayerFaceForScreenDelta(dx, dy, current);
  if (next === current) return next;
  const isDiagPair =
    (current === 'upright' && next === 'upleft') || (current === 'upleft' && next === 'upright') ||
    (current === 'downright' && next === 'downleft') || (current === 'downleft' && next === 'downright');
  if (isDiagPair) {
    const sx = dx - dy;
    if (Math.abs(sx) <= 0.03) return current;
    if ((next === 'upright' || next === 'downright') && sx <= 0) return current;
    if ((next === 'upleft' || next === 'downleft') && sx >= 0) return current;
  }
  return next;
}

// ---------------------------------------------------------------------------
// BUILD 422: debug direction-test table. BUILD 423: extended to 8 directions.
// The user's numbering: 1=NW, 2=N, 3=NE, 4=E, 5=S, 6=W, 7=SE, 8=SW (1-6 kept
// stable; the two new southward diagonals appended). Each entry maps to the
// Face8 art key, the screen-space arrow drawn on the red debug button, and
// the sprite file key ({variant}_{fileKey}_walk_N.png / {variant}_{fileKey}_idle_0.png).
// ---------------------------------------------------------------------------
export interface DirTestEntry { num: number; label: string; face: Face8; arrow: string; fileKey: string }
export const DIR_TEST_TABLE: DirTestEntry[] = [
  { num: 1, label: 'NW', face: 'upleft',    arrow: '↖', fileKey: 'upleft' },
  { num: 2, label: 'N',  face: 'up',        arrow: '↑', fileKey: 'up' },
  { num: 3, label: 'NE', face: 'upright',   arrow: '↗', fileKey: 'upright' },
  { num: 4, label: 'E',  face: 'right',     arrow: '→', fileKey: 'right' },
  { num: 5, label: 'S',  face: 'down',      arrow: '↓', fileKey: 'down' },
  { num: 6, label: 'W',  face: 'left',      arrow: '←', fileKey: 'left' },
  { num: 7, label: 'SE', face: 'downright', arrow: '↘', fileKey: 'downright' },
  { num: 8, label: 'SW', face: 'downleft',  arrow: '↙', fileKey: 'downleft' },
];
export const LPC_FRAMES: Record<LpcAnim, number> = { idle: 2, walk: 9, slash: 6, hurt: 6 };

// ---------------------------------------------------------------------------
// BUILD 390: the BUILD 389 "brute" single-sheet player sprite was replaced by
// the barbarian pack (src/game/iso/barbarian.ts). Its exports were removed;
// the old public/brute/ sheet is deleted.
// ---------------------------------------------------------------------------
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
