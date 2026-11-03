/**
 * BUILD 994 — procedural low-poly 3D villagers (pure module, no React).
 *
 * PACK AUDIT RESULT (2026-11-01, re-verified by the standalone asserts):
 * no uploaded pack yields 3D villager geometry for this renderer. The
 * RPG sprite pack is 48,803 2D PNGs; characters.zip is 16 2D PNGs; the
 * Tiny RPG soldier/orc pack is 2D PNGs + .aseprite sources; the 2D HD
 * Character Knight pack is 2D PNG spritesheets; FreeEnvironment_2 is 2
 * PNGs; the Kenney fantasy town kit has 167 FBX/GLB/OBJ models but zero
 * character/person/villager files — buildings only. The renderer draws
 * vertex-colour triangles only (positions + RGB, no textures, no
 * normals), so a 2D sprite cannot become a villager here. These figures
 * are therefore GENERATED from the game's own geometry vocabulary, in
 * the blocky low-poly style of the town reference (a style target only
 * — no reference assets are copied, and no pack model is faked).
 *
 * A figure is a blocky humanoid: two legs, torso, two arms, head, and a
 * hat or hair cap, plus two eye dots on the front of the head. Every
 * variation is seeded from the figure's id string, so the same NPC
 * renders the same figure on every rebuild and from every camera.
 * Emission format matches the 3D actor buffer exactly: 6 floats per
 * vertex (x, y, z, r, g, b), drawn with the main vertex-colour program.
 *
 * Proportions follow the 992 scale: adult height anchors at
 * CHARACTER_H (1.48) — doors 1.78 read as 1.20x, trees 4.44 as 3.00x.
 * Height varies only ±4% around the anchor (build variation, never
 * tree-sized); children render at exactly 0.7x their adult height
 * (the 979 rule). Figures are visual only: they never change
 * collision, schedules, movement, or roster logic.
 */

import { CHARACTER_H, SUN_SHADE, shadeRgb, type Rgb } from './townLook';

export type Rgb3 = Rgb;

/** Deterministic 32-bit hash of a string (djb2 family, stable across sessions). */
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

const SKINS: Rgb[] = [
  [0.96, 0.8, 0.64], [0.85, 0.62, 0.45], [0.66, 0.45, 0.3],
  [0.48, 0.32, 0.2], [0.92, 0.72, 0.55], [0.78, 0.55, 0.38],
];
/** NPC shirt palette. The player's emerald is deliberately NOT in here. */
const SHIRTS: Rgb[] = [
  [0.55, 0.25, 0.15], [0.2, 0.35, 0.6], [0.25, 0.5, 0.3], [0.75, 0.6, 0.2],
  [0.45, 0.45, 0.45], [0.45, 0.3, 0.55], [0.15, 0.5, 0.5], [0.4, 0.3, 0.2],
  [0.85, 0.78, 0.62], [0.6, 0.15, 0.15],
];
const PANTS: Rgb[] = [
  [0.25, 0.17, 0.1], [0.35, 0.35, 0.38], [0.15, 0.2, 0.35],
  [0.2, 0.18, 0.15], [0.4, 0.38, 0.25], [0.55, 0.48, 0.35],
];
const HAIRS: Rgb[] = [
  [0.1, 0.08, 0.06], [0.3, 0.2, 0.1], [0.45, 0.3, 0.15],
  [0.6, 0.6, 0.6], [0.75, 0.65, 0.4], [0.5, 0.25, 0.12],
];
const HATS: Rgb[] = [
  [0.35, 0.24, 0.12], [0.25, 0.25, 0.25], [0.15, 0.2, 0.35], [0.45, 0.35, 0.2],
];
const HEIGHT_SCALES = [0.96, 0.98, 1.0, 1.02, 1.04];
const WIDTH_SCALES = [0.92, 1.0, 1.08];

export type HatKind = 'brim' | 'cap' | 'hood' | 'none';

export interface VillagerSpec {
  skin: Rgb;
  shirt: Rgb;
  pants: Rgb;
  hair: Rgb;
  hat: HatKind;
  hatColor: Rgb;
  heightScale: number;
  widthScale: number;
  /** Gold band on the hat — player only, never rolled for NPCs. */
  goldBand: boolean;
}

/**
 * The player's outfit, DISTINCT from every roster figure by
 * construction: the emerald tunic is absent from the NPC shirt palette
 * and the gold hat band is never rolled for NPCs.
 */
export const PLAYER_SPEC: VillagerSpec = {
  skin: [0.92, 0.72, 0.55],
  shirt: [0.08, 0.55, 0.35],
  pants: [0.25, 0.17, 0.1],
  hair: [0.3, 0.2, 0.1],
  hat: 'brim',
  hatColor: [0.35, 0.24, 0.12],
  heightScale: 1.0,
  widthScale: 1.0,
  goldBand: true,
};

/** Seeded spec for one figure id (NPC name). Same id → same spec, always. */
export function villagerSpecFor(id: string): VillagerSpec {
  const h = hashStr(id);
  const pick = <T>(arr: readonly T[], n: number): T => arr[(h >>> n) % arr.length];
  const hatRoll = (h >>> 12) % 4;
  return {
    skin: pick(SKINS, 0),
    shirt: pick(SHIRTS, 3),
    pants: pick(PANTS, 6),
    hair: pick(HAIRS, 9),
    hat: (['brim', 'cap', 'hood', 'none'] as HatKind[])[hatRoll],
    hatColor: pick(HATS, 15),
    heightScale: HEIGHT_SCALES[(h >>> 18) % HEIGHT_SCALES.length],
    widthScale: WIDTH_SCALES[(h >>> 21) % WIDTH_SCALES.length],
    goldBand: false,
  };
}

/** Design height of a figure: 1.48 anchor × build variation × 0.7 for children. */
export function villagerHeight(spec: VillagerSpec, child: boolean): number {
  return CHARACTER_H * spec.heightScale * (child ? 0.7 : 1);
}

/** A spec as one comparable tuple (player-distinctness asserts use this). */
export function specTuple(spec: VillagerSpec): string {
  const c = (v: Rgb) => v.map((n) => n.toFixed(2)).join(',');
  return [c(spec.skin), c(spec.shirt), c(spec.pants), c(spec.hair), spec.hat, c(spec.hatColor), String(spec.goldBand)].join('|');
}

// ------------------------------------------------------------ box emission

type V3 = [number, number, number];

const pushTri = (out: number[], a: V3, b: V3, c: V3, color: Rgb) => {
  out.push(a[0], a[1], a[2], color[0], color[1], color[2]);
  out.push(b[0], b[1], b[2], color[0], color[1], color[2]);
  out.push(c[0], c[1], c[2], color[0], color[1], color[2]);
};

const quad = (out: number[], a: V3, b: V3, c: V3, d: V3, color: Rgb) => {
  pushTri(out, a, b, c, color);
  pushTri(out, a, c, d, color);
};

/** Shade for a world-space face normal, using the 988 unified sun table. */
function shadeForNormal(nx: number, ny: number, nz: number): number {
  if (ny >= Math.abs(nx) && ny >= Math.abs(nz)) return SUN_SHADE.top;
  if (Math.abs(nx) >= Math.abs(nz)) return nx > 0 ? SUN_SHADE.east : SUN_SHADE.west;
  return nz > 0 ? SUN_SHADE.south : SUN_SHADE.north;
}

/**
 * One yaw-rotated box, with an optional forward/back swing around the
 * lateral axis (legs and arms pivot at their top). Local axes: lateral
 * r = (cos yaw, 0, -sin yaw), forward f = (sin yaw, 0, cos yaw), up.
 * The box spans lateral ±w/2, vertical [b0, b1] relative to the pivot
 * height, forward ±d/2. The bottom face is skipped (never seen, same as
 * the world's cube helper). Corners rotate in the (up, forward) plane:
 * b' = b·cos(s) + c·sin(s), c' = −b·sin(s) + c·cos(s), so a positive
 * swing moves the bottom of the box forward.
 */
export function emitBox(
  out: number[],
  px: number, py: number, pz: number,
  yaw: number, swing: number,
  w: number, b0: number, b1: number, d: number,
  color: Rgb,
): void {
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const cs = Math.cos(swing), sn = Math.sin(swing);
  // Local corner (a, b, c) -> world. Precompute the 8 corners.
  const pt = (a: number, b: number, c: number): V3 => {
    const bb = b * cs + c * sn;
    const cc = -b * sn + c * cs;
    return [px + rx * a + fx * cc, py + bb, pz + rz * a + fz * cc];
  };
  const hw = w / 2, hd = d / 2;
  // Face normals in world space, for the sun-shade lookup.
  const nTop: V3 = [0, 1, 0];
  const nFront: V3 = [fx, 0, fz];
  const nBack: V3 = [-fx, 0, -fz];
  const nRight: V3 = [rx, 0, rz];
  const nLeft: V3 = [-rx, 0, -rz];
  const sh = (n: V3) => shadeRgb(color, shadeForNormal(n[0], n[1], n[2]));
  // Top (b1), front (+d/2), back (−d/2), right (+w/2), left (−w/2).
  quad(out, pt(-hw, b1, -hd), pt(hw, b1, -hd), pt(hw, b1, hd), pt(-hw, b1, hd), sh(nTop));
  quad(out, pt(-hw, b0, hd), pt(hw, b0, hd), pt(hw, b1, hd), pt(-hw, b1, hd), sh(nFront));
  quad(out, pt(hw, b0, -hd), pt(-hw, b0, -hd), pt(-hw, b1, -hd), pt(hw, b1, -hd), sh(nBack));
  quad(out, pt(hw, b0, -hd), pt(hw, b0, hd), pt(hw, b1, hd), pt(hw, b1, -hd), sh(nRight));
  quad(out, pt(-hw, b0, hd), pt(-hw, b0, -hd), pt(-hw, b1, -hd), pt(-hw, b1, hd), sh(nLeft));
}

// ------------------------------------------------------------ figure layout

/** Walk-cycle constants, shared by the view and the asserts. */
export const LEG_SWING = 0.5;
export const ARM_SWING = 0.35;
export const WALK_BOB = 0.025;
/** Stride length in world units: one full leg cycle per 0.75 units walked. */
export const STRIDE_LENGTH = 0.75;
/** Phase advance per unit walked (radians). */
export const PHASE_PER_UNIT = (2 * Math.PI) / STRIDE_LENGTH;
/** Nominal NPC travel speed (1 tile per 900ms tick, the 993 demo speed). */
export const NPC_SPEED = 1 / 0.9;

/**
 * BUILD 999 — arm + detail geometry, derived from one place so the
 * asserts can check attachment and proportions exactly.
 *
 * ARM FIX (the user's "spaced out and weird" complaint, verified
 * against the shipped 994 code): the old arms sat 0.01 clear of the
 * torso edge (a floating gap, visible at close range), were thin
 * 0.13-wide sticks in a single sleeve colour, and spanned 0.74x width
 * against a 0.46x torso. The new arms OVERLAP the torso by 0.02 (no
 * gap, ever), are wider (0.16), and read as limbs: a shirt-coloured
 * sleeve on the upper 55% and a skin-coloured forearm below, both
 * pivoting at the same shoulder point with the same swing so the arm
 * stays one piece in motion. Total arm extent is unchanged (bottom
 * still 0.06 below hip level), so the 992 silhouette anchors do not
 * move. Detailing that reads at game scale: a leather belt at the
 * waist, a lightened-shirt collar at the neck, and darker boot bands
 * at the bottom of each leg (same leg pivot + swing, so boots move
 * with the legs). All detail bands sit inside existing spans, so
 * figure tops — and the 992 anchors — are unchanged.
 */
export const ARM_W = 0.16;
export const ARM_OVERLAP = 0.02;
export const SLEEVE_FRAC = 0.55;
/** Belt, collar, and boot detail bands (fractions of figure height). */
export const BELT_H_FRAC = 0.045;
export const COLLAR_H_FRAC = 0.04;
export const BOOT_H_FRAC = 0.09;
export const BELT_COL: Rgb = [0.22, 0.15, 0.09];
export const BOOT_COL: Rgb = [0.25, 0.18, 0.12];

export interface FigureLayout {
  H: number; ws: number; s: number; bob: number;
  legH: number; torsoH: number; headH: number;
  hipY: number; torsoY0: number; torsoY1: number; headY0: number; headY1: number;
  torsoW: number; torsoD: number;
  legW: number; legD: number; legX: number;
  armW: number; armD: number; armX: number; armLen: number; sleeveLen: number; shoulderY: number;
  headW: number; headD: number;
  beltH: number; collarH: number; bootH: number;
}

/** Pure figure geometry for one spec. Same spec + child + bob → same layout. */
export function figureLayout(spec: VillagerSpec, child: boolean, bob: number): FigureLayout {
  const s = child ? 0.7 : 1;
  const H = CHARACTER_H * spec.heightScale * s;
  const ws = spec.widthScale * s;
  const legH = 0.36 * H;
  const torsoH = 0.36 * H;
  const headH = 0.2 * H;
  const hipY = legH + bob;
  const torsoY0 = hipY;
  const torsoY1 = hipY + torsoH;
  const headY0 = torsoY1;
  const headY1 = headY0 + headH;
  const torsoW = 0.46 * ws;
  const torsoD = 0.26 * ws;
  const legW = 0.17 * ws;
  const legD = 0.2 * ws;
  const armW = ARM_W * ws;
  const armD = 0.15 * ws;
  const headW = 0.3 * ws;
  const headD = 0.28 * ws;
  const legX = 0.1 * ws;
  // Attached: the arm's inner edge sits ARM_OVERLAP INSIDE the torso
  // edge (old code added a 0.01 gap instead). Outer span is unchanged
  // in spirit (wider arms cancel the overlap), but nothing floats.
  const armX = torsoW / 2 + armW / 2 - ARM_OVERLAP * ws;
  const armLen = torsoH + 0.03 * s;
  const shoulderY = torsoY1 - 0.03 * s;
  return {
    H, ws, s, bob, legH, torsoH, headH, hipY, torsoY0, torsoY1, headY0, headY1,
    torsoW, torsoD, legW, legD, legX, armW, armD, armX, armLen,
    sleeveLen: SLEEVE_FRAC * armLen, shoulderY, headW, headD,
    beltH: BELT_H_FRAC * H, collarH: COLLAR_H_FRAC * H, bootH: BOOT_H_FRAC * H,
  };
}

/** Lighten a colour toward white (collar trim from the shirt colour). */
export function lightenRgb(color: Rgb, amt: number): Rgb {
  return [
    Math.min(1, color[0] + (1 - color[0]) * amt),
    Math.min(1, color[1] + (1 - color[1]) * amt),
    Math.min(1, color[2] + (1 - color[2]) * amt),
  ];
}

/**
 * Emit one villager figure centered at (cx, cz), feet at y = bob.
 * phase: walk-cycle phase in radians — legs swing ±LEG_SWING, arms
 * opposite at ±ARM_SWING, whole figure bobs |sin(phase)| × WALK_BOB.
 * At a multiple of 2π the figure stands neutral (legs together, no bob).
 * Facing: yaw with forward = (sin yaw, cos yaw) in (x, z).
 */
export function emitVillager(
  out: number[],
  cx: number, cz: number,
  yaw: number, phase: number,
  spec: VillagerSpec,
  child: boolean,
): void {
  const bob = Math.abs(Math.sin(phase)) * WALK_BOB;
  const L = figureLayout(spec, child, bob);
  const legSwing = Math.sin(phase) * LEG_SWING;
  const armSwing = Math.sin(phase) * ARM_SWING;
  // Legs pivot at the hips (top of each leg box); boots share the leg
  // pivot + swing so they move with the legs, sitting proud of the
  // leg faces (no coplanar flicker) at the bottom of each leg.
  emitBox(out, cx - L.legX, L.hipY, cz, yaw, legSwing, L.legW, -L.legH, 0, L.legD, spec.pants);
  emitBox(out, cx + L.legX, L.hipY, cz, yaw, -legSwing, L.legW, -L.legH, 0, L.legD, spec.pants);
  emitBox(out, cx - L.legX, L.hipY, cz, yaw, legSwing, L.legW + 0.02 * L.ws, -L.legH, -L.legH + L.bootH, L.legD + 0.02 * L.ws, BOOT_COL);
  emitBox(out, cx + L.legX, L.hipY, cz, yaw, -legSwing, L.legW + 0.02 * L.ws, -L.legH, -L.legH + L.bootH, L.legD + 0.02 * L.ws, BOOT_COL);
  // Torso (centered, no swing) + belt at the waist + collar at the neck.
  emitBox(out, cx, (L.torsoY0 + L.torsoY1) / 2, cz, yaw, 0, L.torsoW, -L.torsoH / 2, L.torsoH / 2, L.torsoD, spec.shirt);
  emitBox(out, cx, L.hipY + L.beltH / 2, cz, yaw, 0, L.torsoW + 0.02 * L.ws, -L.beltH / 2, L.beltH / 2, L.torsoD + 0.02 * L.ws, BELT_COL);
  emitBox(out, cx, L.torsoY1 - L.collarH / 2, cz, yaw, 0, L.torsoW + 0.02 * L.ws, -L.collarH / 2, L.collarH / 2, L.torsoD + 0.02 * L.ws, lightenRgb(spec.shirt, 0.25));
  // Arms pivot at the shoulders, swinging opposite their side's leg.
  // Sleeve (shirt) + forearm (skin) share one pivot and one swing, so
  // each arm stays a single piece in motion; the forearm is the arm's
  // lower 45%, ending at the same bottom as before (0.06 below hip).
  emitBox(out, cx - L.armX, L.shoulderY, cz, yaw, -armSwing, L.armW, -L.sleeveLen, 0, L.armD, spec.shirt);
  emitBox(out, cx + L.armX, L.shoulderY, cz, yaw, armSwing, L.armW, -L.sleeveLen, 0, L.armD, spec.shirt);
  emitBox(out, cx - L.armX, L.shoulderY, cz, yaw, -armSwing, L.armW, -L.armLen, -L.sleeveLen, L.armD, spec.skin);
  emitBox(out, cx + L.armX, L.shoulderY, cz, yaw, armSwing, L.armW, -L.armLen, -L.sleeveLen, L.armD, spec.skin);
  // Head (centered, no swing).
  emitBox(out, cx, (L.headY0 + L.headY1) / 2, cz, yaw, 0, L.headW, -L.headH / 2, L.headH / 2, L.headD, spec.skin);
  // Eyes: two dark dots on the front face of the head.
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const eyeY = (L.headY0 + L.headY1) / 2 + 0.02 * L.s;
  const eyeOff = L.headD / 2 + 0.006;
  const eyeLat = 0.07 * L.ws;
  const eyeCol: Rgb = [0.08, 0.08, 0.1];
  emitBox(out, cx + rx * -eyeLat + fx * eyeOff, eyeY, cz + rz * -eyeLat + fz * eyeOff, yaw, 0, 0.045 * L.ws, -0.025 * L.s, 0.025 * L.s, 0.008, eyeCol);
  emitBox(out, cx + rx * eyeLat + fx * eyeOff, eyeY, cz + rz * eyeLat + fz * eyeOff, yaw, 0, 0.045 * L.ws, -0.025 * L.s, 0.025 * L.s, 0.008, eyeCol);
  // Hat or hair cap on top of the head.
  const topY = L.headY1;
  if (spec.hat === 'brim') {
    emitBox(out, cx, topY + 0.015 * L.s, cz, yaw, 0, 0.46 * L.ws, -0.015 * L.s, 0.015 * L.s, 0.46 * L.ws, spec.hatColor);
    emitBox(out, cx, topY + 0.03 * L.s + 0.05 * L.s, cz, yaw, 0, 0.3 * L.ws, -0.05 * L.s, 0.05 * L.s, 0.3 * L.ws, spec.hatColor);
    if (spec.goldBand) {
      emitBox(out, cx, topY + 0.03 * L.s + 0.015 * L.s, cz, yaw, 0, 0.31 * L.ws, -0.015 * L.s, 0.015 * L.s, 0.31 * L.ws, [0.85, 0.65, 0.15]);
    }
  } else if (spec.hat === 'cap') {
    emitBox(out, cx, topY + 0.05 * L.s, cz, yaw, 0, 0.32 * L.ws, -0.05 * L.s, 0.05 * L.s, 0.32 * L.ws, spec.hatColor);
  } else if (spec.hat === 'hood') {
    const dark: Rgb = [spec.shirt[0] * 0.7, spec.shirt[1] * 0.7, spec.shirt[2] * 0.7];
    emitBox(out, cx, topY + 0.06 * L.s, cz, yaw, 0, 0.36 * L.ws, -0.06 * L.s, 0.06 * L.s, 0.34 * L.ws, dark);
  } else {
    // Hair caps the head at the same height as hats (0.12), so every
    // figure tops out near the 1.48 anchor regardless of headwear.
    emitBox(out, cx, topY + 0.06 * L.s, cz, yaw, 0, 0.31 * L.ws, -0.06 * L.s, 0.06 * L.s, 0.3 * L.ws, spec.hair);
  }
}
