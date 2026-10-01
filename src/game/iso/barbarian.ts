/**
 * BUILD 390: barbarian player sprite system.
 *
 * The player (look === 0) renders from the user-supplied barbarian model
 * sheets (bald barbarian in brown shorts, one model for every direction):
 *  - bare (brown shorts) and blue (crafted shirt) body variants
 *  - sword and bow weapon variants (weapon art baked into the sheets)
 *  - 17 hairstyles x 3 views, composited as overlays ('bald' = none)
 * Every view (down/side/up) has idle + walk + attack frames. Every variant
 * has dedicated right-facing AND left-facing idle/walk sets from the user's
 * 3/4 model sheets (BUILD 398/400/404); attacks use dedicated per-variant
 * left/right attack art (copies of the idle frame). NPCs keep the LPC
 * paper-doll path — this is player-only.
 */
import type { Face4, Face6 } from './isoSprites';

export type BarbarianOutfit = 'bare' | 'blue';
export type BarbarianWeapon = 'none' | 'sword' | 'bow';
export type BarbarianView = 'down' | 'side' | 'up' | 'upright' | 'upleft';
export type BarbarianAnim = 'idle' | 'walk' | 'attack';

/** Milliseconds an attack swing takes to play once. */
export const BARBARIAN_ATTACK_MS = 480;

export interface BarbHairInfo { file: string; rel: [number, number]; baseH: number }

/** All registered hairstyle ids. 'bald' (no overlay) is the default. */
export const BARBARIAN_HAIRSTYLES = [
  'bald',
  'p1_bedhead', 'p1_ponytail', 'p1_shavedsides', 'p1_slicked', 'p1_topknot',
  'p1_undercut', 'p1_viking', 'p1_wizard',
  'p2_afro', 'p2_blonde', 'p2_braids', 'p2_buzz', 'p2_dreadlocks',
  'p2_mohawk', 'p2_ponytail', 'p2_redtopknot', 'p2_spiky',
] as const;
export type BarbarianHair = (typeof BARBARIAN_HAIRSTYLES)[number];

/** Resolve the body variant from equipment state. */
export function barbarianVariant(
  outfit: BarbarianOutfit, weapon: BarbarianWeapon,
): 'bare' | 'blue' | 'sword' | 'bow' {
  if (weapon === 'sword') return 'sword';
  if (weapon === 'bow') return 'bow';
  return outfit;
}

// --- manifest data (generated) ---
// AUTO-GENERATED from public/barbarian/manifest.json — do not hand-edit.
export const BARB_FRAMES: Record<string, Record<string, Record<string, string[]>>> = {
  bare: {
    down: { idle: ['barbarian/bare_down_idle_0.png'], walk: ['barbarian/bare_down_walk_0.png', 'barbarian/bare_down_walk_1.png'], attack: ['barbarian/bare_down_attack_0.png', 'barbarian/bare_down_attack_1.png'] },
    side: { idle: ['barbarian/bare_side_idle_0.png'], walk: ['barbarian/bare_side_walk_0.png', 'barbarian/bare_side_walk_1.png'], attack: ['barbarian/bare_side_attack_0.png', 'barbarian/bare_side_attack_1.png'] },
    right: { idle: ['barbarian/bare_right_idle_0.png'], walk: ['barbarian/bare_right_walk_0.png', 'barbarian/bare_right_walk_1.png'], attack: ['barbarian/bare_side_attack_0.png', 'barbarian/bare_side_attack_1.png'] },
    left: { idle: ['barbarian/bare_left_idle_0.png'], walk: ['barbarian/bare_left_walk_0.png', 'barbarian/bare_left_walk_1.png'], attack: ['barbarian/bare_side_attack_0.png', 'barbarian/bare_side_attack_1.png'] },
    up: { idle: ['barbarian/bare_up_idle_0.png'], walk: ['barbarian/bare_up_walk_0.png', 'barbarian/bare_up_walk_1.png', 'barbarian/bare_up_walk_2.png', 'barbarian/bare_up_walk_3.png', 'barbarian/bare_up_walk_4.png', 'barbarian/bare_up_walk_5.png', 'barbarian/bare_up_walk_6.png', 'barbarian/bare_up_walk_7.png', 'barbarian/bare_up_walk_8.png'], attack: ['barbarian/bare_up_attack_0.png', 'barbarian/bare_up_attack_1.png'] },
    upright: { idle: ['barbarian/bare_upright_idle_0.png'], walk: ['barbarian/bare_upright_walk_0.png', 'barbarian/bare_upright_walk_1.png', 'barbarian/bare_upright_walk_2.png', 'barbarian/bare_upright_walk_3.png', 'barbarian/bare_upright_walk_4.png', 'barbarian/bare_upright_walk_5.png', 'barbarian/bare_upright_walk_6.png', 'barbarian/bare_upright_walk_7.png', 'barbarian/bare_upright_walk_8.png'], attack: ['barbarian/bare_up_attack_0.png', 'barbarian/bare_up_attack_1.png'] },
    upleft: { idle: ['barbarian/bare_upleft_idle_0.png'], walk: ['barbarian/bare_upleft_walk_0.png', 'barbarian/bare_upleft_walk_1.png', 'barbarian/bare_upleft_walk_2.png', 'barbarian/bare_upleft_walk_3.png', 'barbarian/bare_upleft_walk_4.png', 'barbarian/bare_upleft_walk_5.png', 'barbarian/bare_upleft_walk_6.png', 'barbarian/bare_upleft_walk_7.png', 'barbarian/bare_upleft_walk_8.png'], attack: ['barbarian/bare_up_attack_0.png', 'barbarian/bare_up_attack_1.png'] },
  },
  blue: {
    down: { idle: ['barbarian/blue_down_idle_0.png'], walk: ['barbarian/blue_down_walk_0.png', 'barbarian/blue_down_walk_1.png'], attack: ['barbarian/blue_down_attack_0.png', 'barbarian/blue_down_attack_1.png'] },
    side: { idle: ['barbarian/blue_side_idle_0.png'], walk: ['barbarian/blue_side_walk_0.png', 'barbarian/blue_side_walk_1.png'], attack: ['barbarian/blue_side_attack_0.png', 'barbarian/blue_side_attack_1.png'] },
    right: { idle: ['barbarian/blue_right_idle_0.png'], walk: ['barbarian/blue_right_walk_0.png', 'barbarian/blue_right_walk_1.png'], attack: ['barbarian/blue_right_attack_0.png', 'barbarian/blue_right_attack_1.png'] },
    left: { idle: ['barbarian/blue_left_idle_0.png'], walk: ['barbarian/blue_left_walk_0.png', 'barbarian/blue_left_walk_1.png'], attack: ['barbarian/blue_left_attack_0.png', 'barbarian/blue_left_attack_1.png'] },
    up: { idle: ['barbarian/blue_up_idle_0.png'], walk: ['barbarian/blue_up_walk_0.png', 'barbarian/blue_up_walk_1.png', 'barbarian/blue_up_walk_2.png', 'barbarian/blue_up_walk_3.png', 'barbarian/blue_up_walk_4.png', 'barbarian/blue_up_walk_5.png', 'barbarian/blue_up_walk_6.png', 'barbarian/blue_up_walk_7.png', 'barbarian/blue_up_walk_8.png'], attack: ['barbarian/blue_up_attack_0.png', 'barbarian/blue_up_attack_1.png'] },
    upright: { idle: ['barbarian/blue_upright_idle_0.png'], walk: ['barbarian/blue_upright_walk_0.png', 'barbarian/blue_upright_walk_1.png', 'barbarian/blue_upright_walk_2.png', 'barbarian/blue_upright_walk_3.png', 'barbarian/blue_upright_walk_4.png', 'barbarian/blue_upright_walk_5.png', 'barbarian/blue_upright_walk_6.png', 'barbarian/blue_upright_walk_7.png', 'barbarian/blue_upright_walk_8.png'], attack: ['barbarian/blue_up_attack_0.png', 'barbarian/blue_up_attack_1.png'] },
    upleft: { idle: ['barbarian/blue_upleft_idle_0.png'], walk: ['barbarian/blue_upleft_walk_0.png', 'barbarian/blue_upleft_walk_1.png', 'barbarian/blue_upleft_walk_2.png', 'barbarian/blue_upleft_walk_3.png', 'barbarian/blue_upleft_walk_4.png', 'barbarian/blue_upleft_walk_5.png', 'barbarian/blue_upleft_walk_6.png', 'barbarian/blue_upleft_walk_7.png', 'barbarian/blue_upleft_walk_8.png'], attack: ['barbarian/blue_up_attack_0.png', 'barbarian/blue_up_attack_1.png'] },
  },
  sword: {
    down: { idle: ['barbarian/sword_down_idle_0.png'], walk: ['barbarian/sword_down_walk_0.png', 'barbarian/sword_down_walk_1.png'], attack: ['barbarian/sword_down_attack_0.png', 'barbarian/sword_down_attack_1.png', 'barbarian/sword_down_attack_2.png'] },
    side: { idle: ['barbarian/sword_side_idle_0.png'], walk: ['barbarian/sword_side_walk_0.png', 'barbarian/sword_side_walk_1.png'], attack: ['barbarian/sword_side_attack_0.png', 'barbarian/sword_side_attack_1.png', 'barbarian/sword_side_attack_2.png'] },
    right: { idle: ['barbarian/sword_right_idle_0.png'], walk: ['barbarian/sword_right_walk_0.png', 'barbarian/sword_right_walk_1.png', 'barbarian/sword_right_walk_2.png', 'barbarian/sword_right_walk_3.png', 'barbarian/sword_right_walk_4.png', 'barbarian/sword_right_walk_5.png', 'barbarian/sword_right_walk_6.png', 'barbarian/sword_right_walk_7.png', 'barbarian/sword_right_walk_8.png'], attack: ['barbarian/sword_right_attack_0.png', 'barbarian/sword_right_attack_1.png', 'barbarian/sword_right_attack_2.png'] },
    left: { idle: ['barbarian/sword_left_idle_0.png'], walk: ['barbarian/sword_left_walk_0.png', 'barbarian/sword_left_walk_1.png', 'barbarian/sword_left_walk_2.png', 'barbarian/sword_left_walk_3.png', 'barbarian/sword_left_walk_4.png', 'barbarian/sword_left_walk_5.png', 'barbarian/sword_left_walk_6.png', 'barbarian/sword_left_walk_7.png', 'barbarian/sword_left_walk_8.png'], attack: ['barbarian/sword_left_attack_0.png', 'barbarian/sword_left_attack_1.png', 'barbarian/sword_left_attack_2.png'] },
    up: { idle: ['barbarian/sword_up_idle_0.png'], walk: ['barbarian/sword_up_walk_0.png', 'barbarian/sword_up_walk_1.png', 'barbarian/sword_up_walk_2.png', 'barbarian/sword_up_walk_3.png', 'barbarian/sword_up_walk_4.png', 'barbarian/sword_up_walk_5.png', 'barbarian/sword_up_walk_6.png', 'barbarian/sword_up_walk_7.png', 'barbarian/sword_up_walk_8.png'], attack: ['barbarian/sword_up_attack_0.png', 'barbarian/sword_up_attack_1.png', 'barbarian/sword_up_attack_2.png'] },
  },
  bow: {
    down: { idle: ['barbarian/bow_down_idle_0.png'], walk: ['barbarian/bow_down_walk_0.png', 'barbarian/bow_down_walk_1.png'], attack: ['barbarian/bow_down_attack_0.png', 'barbarian/bow_down_attack_1.png', 'barbarian/bow_down_attack_2.png'] },
    side: { idle: ['barbarian/bow_side_idle_0.png'], walk: ['barbarian/bow_side_walk_0.png'], attack: ['barbarian/bow_side_attack_0.png', 'barbarian/bow_side_attack_1.png', 'barbarian/bow_side_attack_2.png'] },
    right: { idle: ['barbarian/bow_right_idle_0.png'], walk: ['barbarian/bow_right_walk_0.png', 'barbarian/bow_right_walk_1.png'], attack: ['barbarian/bow_right_attack_0.png', 'barbarian/bow_right_attack_1.png', 'barbarian/bow_right_attack_2.png'] },
    left: { idle: ['barbarian/bow_left_idle_0.png'], walk: ['barbarian/bow_left_walk_0.png', 'barbarian/bow_left_walk_1.png'], attack: ['barbarian/bow_left_attack_0.png', 'barbarian/bow_left_attack_1.png', 'barbarian/bow_left_attack_2.png'] },
    up: { idle: ['barbarian/bow_up_idle_0.png'], walk: ['barbarian/bow_up_walk_0.png', 'barbarian/bow_up_walk_1.png', 'barbarian/bow_up_walk_2.png', 'barbarian/bow_up_walk_3.png', 'barbarian/bow_up_walk_4.png', 'barbarian/bow_up_walk_5.png', 'barbarian/bow_up_walk_6.png', 'barbarian/bow_up_walk_7.png', 'barbarian/bow_up_walk_8.png'], attack: ['barbarian/bow_up_attack_0.png', 'barbarian/bow_up_attack_1.png', 'barbarian/bow_up_attack_2.png'] },
    upright: { idle: ['barbarian/bow_upright_idle_0.png'], walk: ['barbarian/bow_upright_walk_0.png', 'barbarian/bow_upright_walk_1.png', 'barbarian/bow_upright_walk_2.png', 'barbarian/bow_upright_walk_3.png', 'barbarian/bow_upright_walk_4.png', 'barbarian/bow_upright_walk_5.png', 'barbarian/bow_upright_walk_6.png', 'barbarian/bow_upright_walk_7.png', 'barbarian/bow_upright_walk_8.png'], attack: ['barbarian/bow_up_attack_0.png', 'barbarian/bow_up_attack_1.png', 'barbarian/bow_up_attack_2.png'] },
    upleft: { idle: ['barbarian/bow_upleft_idle_0.png'], walk: ['barbarian/bow_upleft_walk_0.png', 'barbarian/bow_upleft_walk_1.png', 'barbarian/bow_upleft_walk_2.png', 'barbarian/bow_upleft_walk_3.png', 'barbarian/bow_upleft_walk_4.png', 'barbarian/bow_upleft_walk_5.png', 'barbarian/bow_upleft_walk_6.png', 'barbarian/bow_upleft_walk_7.png', 'barbarian/bow_upleft_walk_8.png'], attack: ['barbarian/bow_up_attack_0.png', 'barbarian/bow_up_attack_1.png', 'barbarian/bow_up_attack_2.png'] },
  },
};
export const BARB_BOX: Record<string, Record<string, {w:number;h:number;head:[number,number];idleH:number}>> = {
  bare: {
    down: { w: 195, h: 195, head: [97, 7], idleH: 188 },
    side: { w: 195, h: 195, head: [104, 9], idleH: 186 },
    right: { w: 195, h: 195, head: [95, 9], idleH: 186 },
    left: { w: 195, h: 195, head: [94, 9], idleH: 186 },
    up: { w: 195, h: 195, head: [98, 2], idleH: 193 },
    upright: { w: 195, h: 195, head: [93, 2], idleH: 193 },  // BUILD 418: NE mirrors NW art
    upleft: { w: 195, h: 195, head: [101, 2], idleH: 193 },  // BUILD 416: true NW art
  },
  blue: {
    down: { w: 195, h: 195, head: [97, 7], idleH: 188 },
    side: { w: 195, h: 195, head: [104, 9], idleH: 186 },
    right: { w: 195, h: 195, head: [95, 9], idleH: 186 },
    left: { w: 195, h: 195, head: [94, 9], idleH: 186 },
    up: { w: 195, h: 195, head: [98, 2], idleH: 193 },
    upright: { w: 195, h: 195, head: [93, 2], idleH: 193 },  // BUILD 418: NE mirrors NW art
    upleft: { w: 195, h: 195, head: [101, 2], idleH: 193 },  // BUILD 416: true NW art
  },
  sword: {
    down: { w: 195, h: 195, head: [97, 7], idleH: 188 },
    side: { w: 195, h: 195, head: [104, 9], idleH: 186 },
    right: { w: 118, h: 215, head: [59, 19], idleH: 99 },
    left: { w: 116, h: 214, head: [58, 25], idleH: 99 },
    up: { w: 118, h: 212, head: [59, 21], idleH: 103 },
  },
  bow: {
    down: { w: 195, h: 195, head: [97, 7], idleH: 188 },
    side: { w: 195, h: 195, head: [104, 9], idleH: 186 },
    right: { w: 195, h: 195, head: [95, 9], idleH: 186 },
    left: { w: 195, h: 195, head: [94, 9], idleH: 186 },
    up: { w: 195, h: 195, head: [98, 2], idleH: 193 },
    upright: { w: 195, h: 195, head: [93, 2], idleH: 193 },  // BUILD 418: NE mirrors NW art
    upleft: { w: 195, h: 195, head: [101, 2], idleH: 193 },  // BUILD 416: true NW art
  },
};
export interface BarbHairInfo { file: string; rel: [number, number]; baseH: number }
export const BARB_HAIR: Record<string, Record<string, BarbHairInfo | null>> = {
  p1_bedhead: {
    down: { file: 'barbarian/hair/hair_p1_bedhead_down.png', rel: [-44, -4], baseH: 131 },
    side: { file: 'barbarian/hair/hair_p1_bedhead_side.png', rel: [-36, -3], baseH: 132 },
    up: { file: 'barbarian/hair/hair_p1_bedhead_up.png', rel: [-41, -1], baseH: 134 },
  },
  p1_ponytail: {
    down: { file: 'barbarian/hair/hair_p1_ponytail_down.png', rel: [-42, -4], baseH: 131 },
    side: { file: 'barbarian/hair/hair_p1_ponytail_side.png', rel: [-39, -3], baseH: 132 },
    up: { file: 'barbarian/hair/hair_p1_ponytail_up.png', rel: [-40, -1], baseH: 134 },
  },
  p1_shavedsides: {
    down: { file: 'barbarian/hair/hair_p1_shavedsides_down.png', rel: [-40, -4], baseH: 131 },
    side: { file: 'barbarian/hair/hair_p1_shavedsides_side.png', rel: [-22, -3], baseH: 132 },
    up: { file: 'barbarian/hair/hair_p1_shavedsides_up.png', rel: [-41, -1], baseH: 134 },
  },
  p1_slicked: {
    down: { file: 'barbarian/hair/hair_p1_slicked_down.png', rel: [-43, 0], baseH: 131 },
    side: { file: 'barbarian/hair/hair_p1_slicked_side.png', rel: [-43, 1], baseH: 132 },
    up: { file: 'barbarian/hair/hair_p1_slicked_up.png', rel: [-41, 1], baseH: 134 },
  },
  p1_topknot: {
    down: { file: 'barbarian/hair/hair_p1_topknot_down.png', rel: [-43, -4], baseH: 131 },
    side: { file: 'barbarian/hair/hair_p1_topknot_side.png', rel: [-25, -3], baseH: 132 },
    up: { file: 'barbarian/hair/hair_p1_topknot_up.png', rel: [-42, 0], baseH: 134 },
  },
  p1_undercut: {
    down: { file: 'barbarian/hair/hair_p1_undercut_down.png', rel: [-44, -1], baseH: 131 },
    side: { file: 'barbarian/hair/hair_p1_undercut_side.png', rel: [-39, -1], baseH: 132 },
    up: { file: 'barbarian/hair/hair_p1_undercut_up.png', rel: [-41, 1], baseH: 134 },
  },
  p1_viking: {
    down: { file: 'barbarian/hair/hair_p1_viking_down.png', rel: [-43, -1], baseH: 131 },
    side: { file: 'barbarian/hair/hair_p1_viking_side.png', rel: [-43, 0], baseH: 132 },
    up: { file: 'barbarian/hair/hair_p1_viking_up.png', rel: [-41, 2], baseH: 134 },
  },
  p1_wizard: {
    down: { file: 'barbarian/hair/hair_p1_wizard_down.png', rel: [-42, -2], baseH: 131 },
    side: { file: 'barbarian/hair/hair_p1_wizard_side.png', rel: [-24, -2], baseH: 132 },
    up: { file: 'barbarian/hair/hair_p1_wizard_up.png', rel: [-41, 0], baseH: 134 },
  },
  p2_afro: {
    down: { file: 'barbarian/hair/hair_p2_afro_down.png', rel: [-45, 1], baseH: 121 },
    side: { file: 'barbarian/hair/hair_p2_afro_side.png', rel: [-56, 1], baseH: 121 },
    up: { file: 'barbarian/hair/hair_p2_afro_up.png', rel: [-44, 1], baseH: 121 },
  },
  p2_blonde: {
    down: { file: 'barbarian/hair/hair_p2_blonde_down.png', rel: [-44, 1], baseH: 121 },
    side: { file: 'barbarian/hair/hair_p2_blonde_side.png', rel: [-18, 1], baseH: 121 },
    up: { file: 'barbarian/hair/hair_p2_blonde_up.png', rel: [-41, 1], baseH: 121 },
  },
  p2_braids: {
    down: { file: 'barbarian/hair/hair_p2_braids_down.png', rel: [-48, 1], baseH: 121 },
    side: { file: 'barbarian/hair/hair_p2_braids_side.png', rel: [-44, 1], baseH: 121 },
    up: { file: 'barbarian/hair/hair_p2_braids_up.png', rel: [-41, 1], baseH: 121 },
  },
  p2_buzz: {
    down: null,
    side: null,
    up: null,
  },
  p2_dreadlocks: {
    down: { file: 'barbarian/hair/hair_p2_dreadlocks_down.png', rel: [-47, 1], baseH: 121 },
    side: { file: 'barbarian/hair/hair_p2_dreadlocks_side.png', rel: [-42, 17], baseH: 121 },
    up: { file: 'barbarian/hair/hair_p2_dreadlocks_up.png', rel: [-40, 1], baseH: 121 },
  },
  p2_mohawk: {
    down: { file: 'barbarian/hair/hair_p2_mohawk_down.png', rel: [-46, 1], baseH: 121 },
    side: { file: 'barbarian/hair/hair_p2_mohawk_side.png', rel: [-30, 4], baseH: 121 },
    up: { file: 'barbarian/hair/hair_p2_mohawk_up.png', rel: [-36, 3], baseH: 121 },
  },
  p2_ponytail: {
    down: { file: 'barbarian/hair/hair_p2_ponytail_down.png', rel: [-45, 1], baseH: 121 },
    side: { file: 'barbarian/hair/hair_p2_ponytail_side.png', rel: [-18, 1], baseH: 121 },
    up: { file: 'barbarian/hair/hair_p2_ponytail_up.png', rel: [-43, 1], baseH: 121 },
  },
  p2_redtopknot: {
    down: { file: 'barbarian/hair/hair_p2_redtopknot_down.png', rel: [-45, 1], baseH: 121 },
    side: { file: 'barbarian/hair/hair_p2_redtopknot_side.png', rel: [-18, 1], baseH: 121 },
    up: { file: 'barbarian/hair/hair_p2_redtopknot_up.png', rel: [-41, 1], baseH: 121 },
  },
  p2_spiky: {
    down: { file: 'barbarian/hair/hair_p2_spiky_down.png', rel: [-48, 1], baseH: 121 },
    side: { file: 'barbarian/hair/hair_p2_spiky_side.png', rel: [-55, 1], baseH: 121 },
    up: { file: 'barbarian/hair/hair_p2_spiky_up.png', rel: [-44, 1], baseH: 121 },
  },
};

export interface BarbarianDrawOptions {
  g: CanvasRenderingContext2D;
  /** Screen px of the character's FEET anchor. */
  x: number;
  y: number;
  size?: number;
  facing: Face6;
  moving: boolean;
  /** ms since the attack swing started; plays attack anim while < ATTACK_MS. */
  attackT?: number;
  outfit?: BarbarianOutfit;
  weapon?: BarbarianWeapon;
  hair?: string;
  /** Walk phase in frames (float). */
  phase: number;
  nowMs: number;
  shadow?: boolean;
}

const imgs = new Map<string, HTMLImageElement>();
let preloadStarted = false;

function assetUrl(path: string): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}${path}`;
}

/** Preload every barbarian body + hair PNG. Safe to call in node (no-op). */
export function preloadBarbarian(): void {
  if (preloadStarted || typeof window === 'undefined') return;
  preloadStarted = true;
  const files = new Set<string>();
  for (const v of Object.values(BARB_FRAMES))
    for (const vw of Object.values(v))
      for (const frames of Object.values(vw))
        for (const f of frames) files.add(f);
  for (const styles of Object.values(BARB_HAIR))
    for (const info of Object.values(styles))
      if (info) files.add(info.file);
  for (const f of files) {
    const img = new Image();
    img.onerror = () => console.warn(`[barbarian] failed to load ${f}`);
    img.src = assetUrl(f);
    imgs.set(f, img);
  }
}

function imgReady(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

/** True when every body frame (idle/walk/attack, all views/variants) is loaded. */
export function barbarianReady(): boolean {
  if (typeof window === 'undefined') return false;
  for (const v of Object.values(BARB_FRAMES))
    for (const vw of Object.values(v))
      for (const frames of Object.values(vw))
        for (const f of frames) if (!imgReady(imgs.get(f))) return false;
  return true;
}

function viewOf(facing: Face6): BarbarianView {
  if (facing === 'up') return 'up';
  if (facing === 'down') return 'down';
  if (facing === 'upright') return 'upright';
  if (facing === 'upleft') return 'upleft';
  return 'side';
}

/**
 * Draw the barbarian player, feet-anchored at (x, y). Returns false while
 * the art is still loading so the caller can fall back to LPC rendering.
 */
export function drawBarbarian(o: BarbarianDrawOptions): boolean {
  const g = o.g;
  const variant = barbarianVariant(o.outfit ?? 'bare', o.weapon ?? 'none');
  const view = viewOf(o.facing);
  // BUILD 404: every variant has dedicated left- AND right-facing idle/walk/
  // attack art from the user's 3/4 model sheets. Use the dedicated set when
  // facing that way, falling back per-anim to the shared side set as a safety
  // net for any anim lacking dedicated frames.
  const anim: BarbarianAnim =
    o.attackT !== undefined && o.attackT >= 0 && o.attackT < BARBARIAN_ATTACK_MS
      ? 'attack'
      : o.moving ? 'walk' : 'idle';
  let fview: string = view;
  if (o.facing === 'right') {
    const rf = BARB_FRAMES[variant]?.['right']?.[anim];
    if (rf && rf.length > 0) fview = 'right';
  } else if (o.facing === 'left') {
    const lf = BARB_FRAMES[variant]?.['left']?.[anim];
    if (lf && lf.length > 0) fview = 'left';
  } else if (o.facing === 'upright') {
    // BUILD 414: dedicated up-right diagonal art (the user's walk sheet);
    // variants without it (sword) fall back per-anim to the up view.
    const uf = BARB_FRAMES[variant]?.['upright']?.[anim];
    fview = (uf && uf.length > 0) ? 'upright' : 'up';
  } else if (o.facing === 'upleft') {
    // BUILD 414: dedicated up-left diagonal art (mirrored walk sheet);
    // variants without it (sword) fall back per-anim to the up view.
    const uf = BARB_FRAMES[variant]?.['upleft']?.[anim];
    fview = (uf && uf.length > 0) ? 'upleft' : 'up';
  }
  // Shared side art natively faces screen-right; mirror it when facing left.
  // Dedicated left/right sets natively face their direction and are never
  // mirrored.
  const flip = o.facing === 'left' && fview !== 'left';
  const size = o.size ?? 60;
  const box = BARB_BOX[variant]?.[fview];
  if (!box) return false;
  const frames = BARB_FRAMES[variant]?.[fview]?.[anim];
  if (!frames || frames.length === 0) return false;
  let idx = 0;
  if (anim === 'attack' && o.attackT !== undefined) {
    idx = Math.min(frames.length - 1,
      Math.floor((o.attackT / BARBARIAN_ATTACK_MS) * frames.length));
  } else if (anim === 'walk') {
    idx = Math.floor(o.phase) % frames.length;
  }
  const body = imgs.get(frames[idx]);
  if (!imgReady(body)) return false;

  if (o.shadow !== false) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(o.x, o.y + 3, 13, 5, 0, 0, 7); g.fill();
  }
  const lift = o.moving ? Math.abs(Math.sin(o.nowMs / 130)) * 2 : 0;
  const breathe = o.moving || anim === 'attack' ? 0 : Math.sin(o.nowMs / 1100);
  // Cell space is 195px; frame boxes keep their own aspect.
  const k = size / 195;
  const dw = box.w * k;
  const dh = box.h * k;
  const dx = o.x - dw / 2;
  const dy = o.y - dh - lift + breathe;
  const s = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  try {
    // Hair overlays only exist for down/side/up. The dedicated right set reuses
    // the side hair art with the right set's head anchor; the dedicated left
    // set reuses the side hair art mirrored, with the left set's head anchor.
    // The dedicated up-right/up-left sets (BUILD 414) reuse the up hair art —
    // the up-left frames are pre-mirrored, so the hair is never flipped.
    const hairView: BarbarianView = (fview === 'right' || fview === 'left') ? 'side'
      : (fview === 'upright' || fview === 'upleft') ? 'up' : view;
    // Side hair art natively faces right; mirror it whenever the body faces left.
    const hairFlip = o.facing === 'left';
    if (flip) {
      g.save();
      g.translate(o.x, 0);
      g.scale(-1, 1);
      g.drawImage(body, -dw / 2, dy, dw, dh);
      drawHair(g, o, hairView, box, k, -dw / 2, dy);
      g.restore();
    } else if (hairFlip) {
      g.drawImage(body, dx, dy, dw, dh);
      g.save();
      g.translate(o.x, 0);
      g.scale(-1, 1);
      drawHair(g, o, hairView, box, k, -dw / 2, dy);
      g.restore();
    } else {
      g.drawImage(body, dx, dy, dw, dh);
      drawHair(g, o, hairView, box, k, dx, dy);
    }
  } finally {
    g.imageSmoothingEnabled = s;
  }
  return true;
}

function drawHair(
  g: CanvasRenderingContext2D, o: BarbarianDrawOptions,
  view: BarbarianView,
  box: { w: number; h: number; head: [number, number]; idleH: number },
  k: number, dx: number, dy: number,
): void {
  const hairId = o.hair ?? 'bald';
  if (hairId === 'bald') return;
  const info = BARB_HAIR[hairId]?.[view];
  if (!info) return;
  const himg = imgs.get(info.file);
  if (!imgReady(himg)) return;
  // Source-space scale: hair-pack body px -> game body px.
  const sb = box.idleH / info.baseH;
  const hw = himg.naturalWidth * sb * k;
  const hh = himg.naturalHeight * sb * k;
  const hx = dx + (box.head[0] + info.rel[0] * sb) * k;
  const hy = dy + (box.head[1] + info.rel[1] * sb) * k;
  // NOTE: when the body is flipped (left facing), the caller already applied
  // the mirror transform; the hair uses the same anchor math and mirrors along.
  g.drawImage(himg, hx, hy, hw, hh);
}

/** Friendly display names for the barbarian hairstyle ids. */
export function barbarianHairLabel(id: string): string {
  const names: Record<string, string> = {
    bald: 'Bald', p1_bedhead: 'Bedhead', p1_ponytail: 'Ponytail', p1_shavedsides: 'Shaved sides',
    p1_slicked: 'Slicked back', p1_topknot: 'Samurai topknot', p1_undercut: 'Undercut', p1_viking: 'Viking braids',
    p1_wizard: 'Long white', p2_afro: 'Afro', p2_blonde: 'Long blonde', p2_braids: 'Long braids',
    p2_buzz: 'Buzz cut', p2_dreadlocks: 'Dreadlocks', p2_mohawk: 'Mohawk', p2_ponytail: 'Dark ponytail',
    p2_redtopknot: 'Red topknot', p2_spiky: 'Spiky red',
  };
  return names[id] ?? 'Bald';
}

/** Registry completeness check for tests (no DOM needed). */
export function barbarianRegistryStats(): {
  variants: string[]; views: string[]; anims: string[];
  missingFrames: string[]; hairstyles: string[];
} {
  const variants = Object.keys(BARB_FRAMES);
  const views: string[] = ['down', 'side', 'up'];
  const anims: string[] = ['idle', 'walk', 'attack'];
  const missing: string[] = [];
  for (const v of variants)
    for (const vw of views)
      for (const a of anims)
        if (!BARB_FRAMES[v]?.[vw]?.[a]?.length) missing.push(`${v}/${vw}/${a}`);
  return {
    variants, views, anims, missingFrames: missing,
    hairstyles: [...BARBARIAN_HAIRSTYLES],
  };
}
