// RPG character sprite system — replaces the LPC paper-doll system (BUILD 702).
//
// Asset pack: ~48,800 PNGs in 100 folders (user-supplied 7z). Each folder is
// one item/base with 488 files: {seq}_{Anim}_CAM{dir}_{frame}.png
//   - 148x130 RGBA PNGs, feet anchor ~row 105
//   - CAM0-7 = 8 camera directions (verified visually against BaseHumanMale)
//   - 7 animations: Idle(4f), Attack(10f), Bow(9f), Cast(9f), Walk(11f),
//     Run(10f), Death(8f). NOTE: no pain/hurt animation in the pack.
//   - 7 base bodies: BaseHumanMale, BaseHumanBlank, BaseElf, BaseDwarf,
//     BaseAhoul, BaseShaman, BaseSkeleton. NOTE: no female base in the pack.
//   - 93 equipment items catalogued in rpgManifest.json (not yet copied to
//     public/ — indexed for future customization).
//
// Only the 7 base folders are in public/rpg/ (~25MB). Equipment layers are
// registered in the manifest for future use.

import { artUrl } from '../artCache';
import type { Face8 } from './isoSprites';

// ---------------------------------------------------------------------------
// Animation metadata (verified against actual files, not documentation)
// ---------------------------------------------------------------------------

export type RpgAnim = 'Idle' | 'Attack' | 'Bow' | 'Cast' | 'Walk' | 'Run' | 'Death';

/** Sequence number prefix in filenames: {seq}_{Anim}_CAM{dir}_{frame}.png */
export const RPG_ANIM_SEQ: Record<RpgAnim, number> = {
  Idle: 1, Attack: 2, Bow: 3, Cast: 4, Walk: 5, Run: 6, Death: 7,
};

/** Actual frame numbers per animation (consistent across all CAMs and bases,
 *  verified). Frame INDEX i plays the i-th entry in these arrays. */
export const RPG_ANIM_FRAME_NUMS: Record<RpgAnim, number[]> = {
  Idle: [20, 25, 35, 40],
  Attack: [60, 62, 63, 65, 67, 70, 72, 74, 76, 78],
  Bow: [100, 104, 106, 108, 110, 112, 114, 116, 118],
  Cast: [140, 143, 146, 148, 151, 153, 155, 157, 158],
  Walk: [180, 182, 184, 186, 188, 190, 192, 194, 196, 198, 200],
  Run: [220, 222, 224, 226, 228, 230, 232, 234, 236, 238],
  Death: [261, 262, 264, 265, 270, 273, 276, 280],
};

export const RPG_ANIM_FRAMES: Record<RpgAnim, number> = {
  Idle: 4, Attack: 10, Bow: 9, Cast: 9, Walk: 11, Run: 10, Death: 8,
};

// Sprite dimensions and anchor (verified: bottom-most opaque pixel ~row 105).
export const RPG_W = 148;
export const RPG_H = 130;
export const RPG_FEET_ROW = 105;

// ---------------------------------------------------------------------------
// Per-frame anchor normalization (BUILD 706)
// ---------------------------------------------------------------------------
// The artist's frames do NOT keep the character at a fixed position inside
// the 148x130 canvas: measured ground-point jitter is up to 8px horizontal /
// 12px vertical between frames of one animation (Run CAM1). Anchoring by
// fixed image center + fixed row 105 made characters visibly jump every
// frame ("flashy/glitchy" walking). Instead we anchor each frame by its own
// content: bottom-center of the opaque pixels = the ground contact point.
//
// Anchors are computed once per unique frame, in the browser, from the
// loaded image (pure helper anchorFromAlpha is sim-testable). Until an
// image's anchor is computed, the default (old behavior) is used.

/** Per-frame ground anchor, in source-pixel coordinates (148x130 space). */
export interface RpgAnchor {
  /** Content horizontal center (opaque bbox). */
  cx: number;
  /** One past the lowest opaque row = ground contact row. */
  cb: number;
}

/** Fallback anchor = the old fixed assumption (image center, row 105). */
export const RPG_DEFAULT_ANCHOR: RpgAnchor = { cx: RPG_W / 2, cb: RPG_FEET_ROW };

/**
 * Pure: compute the ground anchor from an alpha channel.
 * `alpha` is row-major, length w*h, values 0-255. Threshold ignores
 * near-invisible fringe. Returns the default anchor when fully transparent.
 */
export function anchorFromAlpha(
  alpha: ArrayLike<number>, w: number, h: number, threshold = 8,
): RpgAnchor {
  let minx = w, maxx = -1, maxy = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > threshold) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
      }
    }
  }
  if (maxx < 0) return { ...RPG_DEFAULT_ANCHOR };
  return { cx: (minx + maxx + 1) / 2, cb: maxy + 1 };
}

const rpgAnchorCache: Record<string, RpgAnchor> = {};
let rpgScanCanvas: HTMLCanvasElement | null = null;

/** Compute and cache the anchor for a loaded image (browser only). */
function computeAnchorForImage(url: string, im: HTMLImageElement): RpgAnchor {
  const cached = rpgAnchorCache[url];
  if (cached) return cached;
  let anchor: RpgAnchor = { ...RPG_DEFAULT_ANCHOR };
  try {
    if (!rpgScanCanvas) {
      rpgScanCanvas = document.createElement('canvas');
      rpgScanCanvas.width = RPG_W;
      rpgScanCanvas.height = RPG_H;
    }
    const g = rpgScanCanvas.getContext('2d', { willReadFrequently: true });
    if (g && im.naturalWidth > 0) {
      g.clearRect(0, 0, RPG_W, RPG_H);
      g.drawImage(im, 0, 0);
      const data = g.getImageData(0, 0, RPG_W, RPG_H).data;
      const alpha = new Uint8Array(RPG_W * RPG_H);
      for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = data[j];
      anchor = anchorFromAlpha(alpha, RPG_W, RPG_H);
    }
  } catch {
    // Canvas tainted or unavailable — keep the default anchor.
  }
  rpgAnchorCache[url] = anchor;
  return anchor;
}

/**
 * Ground anchor for (base, anim, face, frameIndex). Returns the cached
 * per-frame anchor once the image is loaded; the default anchor otherwise
 * (including non-browser environments like the sim).
 */
export function rpgAnchorFor(base: string, anim: RpgAnim, face: Face8, frameIndex: number): RpgAnchor {
  const url = rpgSpriteUrl(base, anim, face, frameIndex);
  const cached = rpgAnchorCache[url];
  if (cached) return cached;
  if (typeof document === 'undefined') return { ...RPG_DEFAULT_ANCHOR };
  const im = rpgCache[url];
  if (im && im.complete && im.naturalWidth > 0) {
    return computeAnchorForImage(url, im);
  }
  return { ...RPG_DEFAULT_ANCHOR };
}

/** Anchor cache stats for the debug tool. */
export function rpgAnchorStats(): { computed: number } {
  return { computed: Object.keys(rpgAnchorCache).length };
}

// ---------------------------------------------------------------------------
// Base bodies (verified: these 7 exist in public/rpg/, no female base)
// ---------------------------------------------------------------------------

export type RpgBase =
  | 'BaseHumanMale' | 'BaseHumanBlank' | 'BaseElf' | 'BaseDwarf'
  | 'BaseAhoul' | 'BaseShaman' | 'BaseSkeleton';

export const RPG_BASES: RpgBase[] = [
  'BaseHumanMale', 'BaseHumanBlank', 'BaseElf', 'BaseDwarf',
  'BaseAhoul', 'BaseShaman', 'BaseSkeleton',
];

/** Default base for player and NPCs (user directive: bald, naked default). */
export const RPG_DEFAULT_BASE: RpgBase = 'BaseHumanMale';

// ---------------------------------------------------------------------------
// Direction mapping: game Face8 -> the actual camera view in the RPG pack.
// Verified against the real BaseHumanMale Idle CAM0-7 PNGs and matched to the
// old barbarian's named views. CAM3 is the straight back; CAM7 is the straight
// front. CAM1/CAM5 are the two side profiles. The diagonal views sit between
// those cardinal views; don't infer compass directions from CAM number alone.
//
// Game-facing key -> actual art:
//   N/back CAM3, NE/back-right CAM4, E/right profile CAM5,
//   SE/front-right CAM6, S/front CAM7, SW/front-left CAM0,
//   W/left profile CAM1, NW/back-left CAM2.

export const RPG_CAM_FOR_FACE: Record<Face8, number> = {
  up: 3,        // N/back
  down: 7,      // S/front
  left: 1,      // W/left profile
  right: 5,     // E/right profile
  upleft: 2,     // NW/back-left
  upright: 4,    // NE/back-right
  downleft: 0,   // SW/front-left
  downright: 6,  // SE/front-right
};

// ---------------------------------------------------------------------------
// Character appearance config (modular, data-driven for future customization)
// ---------------------------------------------------------------------------

export interface RpgLook {
  /** Base body sprite set. */
  base: RpgBase;
  /** Equipment layer folder names, in draw order (base drawn first).
   *  Empty for the default bald/naked look. Equipment sprites must be
   *  copied to public/rpg/ before they can be used. */
  equipment: string[];
}

/** Default look: bald, naked BaseHumanMale, no equipment. */
export const RPG_DEFAULT_LOOK: RpgLook = { base: 'BaseHumanMale', equipment: [] };

// ---------------------------------------------------------------------------
// URL + loading cache
// ---------------------------------------------------------------------------

/** Build the sprite URL for (base, anim, facing, frameIndex). */
export function rpgSpriteUrl(base: string, anim: RpgAnim, face: Face8, frameIndex: number): string {
  const seq = RPG_ANIM_SEQ[anim];
  const cam = RPG_CAM_FOR_FACE[face];
  const frames = RPG_ANIM_FRAME_NUMS[anim];
  const f = frames[Math.max(0, Math.min(frameIndex, frames.length - 1))];
  return artUrl(`rpg/${base}/${seq}_${anim}_CAM${cam}_${f}.png`);
}

// Module-level sprite cache (read by canvas loops; filled on demand).
const rpgCache: Record<string, HTMLImageElement> = {};
const rpgWarned = new Set<string>();

function warnMissingRpg(url: string): void {
  if (rpgWarned.has(url)) return;
  rpgWarned.add(url);
  console.warn(`[rpgSprites] sprite failed to load: ${url}`);
}

/** Get (or start loading) a sprite. Returns undefined while loading/failed. */
export function rpgSprite(base: string, anim: RpgAnim, face: Face8, frameIndex: number): HTMLImageElement | undefined {
  const url = rpgSpriteUrl(base, anim, face, frameIndex);
  let im = rpgCache[url];
  if (!im) {
    im = new Image();
    im.onerror = () => warnMissingRpg(url);
    im.src = url;
    rpgCache[url] = im;
    return undefined;
  }
  return im.complete && im.naturalWidth > 0 ? im : undefined;
}

/** Preload the full animation set for a base (all anims, all directions,
 *  all frames). Call once for bases actually used in the scene. */
export function preloadRpgBase(base: RpgBase): void {
  const anims: RpgAnim[] = ['Idle', 'Attack', 'Bow', 'Cast', 'Walk', 'Run', 'Death'];
  const faces: Face8[] = ['up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright'];
  for (const anim of anims) {
    const n = RPG_ANIM_FRAMES[anim];
    for (const face of faces) {
      for (let i = 0; i < n; i++) {
        rpgSprite(base, anim, face, i); // starts load, cached
      }
    }
  }
}

/**
 * Preload equipment layer folders (BUILD 911). Layers use the same frame
 * contract as bases; only the locomotion/idle sets are preloaded — combat
 * frames stream in on demand behind the renderer's last-good-layer cache.
 */
export function preloadRpgLayers(folders: readonly string[]): void {
  const anims: RpgAnim[] = ['Idle', 'Walk', 'Run'];
  const faces: Face8[] = ['up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright'];
  for (const folder of folders) {
    for (const anim of anims) {
      const n = RPG_ANIM_FRAMES[anim];
      for (const face of faces) {
        for (let i = 0; i < n; i++) {
          rpgSprite(folder, anim, face, i); // starts load, cached
        }
      }
    }
  }
}

/** True when all frames for (base, anim) are loaded in every direction. */
export function rpgAnimReady(base: string, anim: RpgAnim): boolean {
  const faces: Face8[] = ['up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright'];
  const n = RPG_ANIM_FRAMES[anim];
  for (const face of faces) {
    for (let i = 0; i < n; i++) {
      const url = rpgSpriteUrl(base, anim, face, i);
      const im = rpgCache[url];
      if (!im || !im.complete || im.naturalWidth === 0) return false;
    }
  }
  return true;
}

/** Cache stats for the debug tool. */
export function rpgCacheStats(): { cached: number; warned: number } {
  return { cached: Object.keys(rpgCache).length, warned: rpgWarned.size };
}
