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
// Direction mapping: game Face8 -> sprite CAM number (verified visually)
// ---------------------------------------------------------------------------
// CAM0 = front/S, CAM4 = back/N, CAM1 = W, CAM5 = E,
// CAM2 = SW, CAM3 = NW, CAM6 = NE, CAM7 = SE.

export const RPG_CAM_FOR_FACE: Record<Face8, number> = {
  up: 4,        // N/back
  down: 0,      // S/front
  left: 1,      // W
  right: 5,     // E
  upleft: 3,    // NW
  upright: 6,   // NE
  downleft: 2,  // SW
  downright: 7, // SE
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
