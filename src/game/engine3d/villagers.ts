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
  const s = child ? 0.7 : 1;
  const H = CHARACTER_H * spec.heightScale * s;
  const ws = spec.widthScale * s;
  const bob = Math.abs(Math.sin(phase)) * WALK_BOB;
  const legH = 0.36 * H;
  const torsoH = 0.36 * H;
  const headH = 0.2 * H;
  const hipY = legH + bob;
  const torsoY0 = hipY;
  const torsoY1 = hipY + torsoH;
  const headY0 = torsoY1;
  const headY1 = headY0 + headH;
  const legSwing = Math.sin(phase) * LEG_SWING;
  const armSwing = Math.sin(phase) * ARM_SWING;
  const torsoW = 0.46 * ws;
  const torsoD = 0.26 * ws;
  const legW = 0.17 * ws;
  const legD = 0.2 * ws;
  const armW = 0.13 * ws;
  const armD = 0.15 * ws;
  const headW = 0.3 * ws;
  const headD = 0.28 * ws;
  const legX = 0.1 * ws;
  const armX = torsoW / 2 + armW / 2 + 0.01 * ws;
  const armLen = torsoH + 0.03 * s;
  // Legs pivot at the hips (top of each leg box).
  emitBox(out, cx - legX, hipY, cz, yaw, legSwing, legW, -legH, 0, legD, spec.pants);
  emitBox(out, cx + legX, hipY, cz, yaw, -legSwing, legW, -legH, 0, legD, spec.pants);
  // Torso (centered, no swing).
  emitBox(out, cx, (torsoY0 + torsoY1) / 2, cz, yaw, 0, torsoW, -torsoH / 2, torsoH / 2, torsoD, spec.shirt);
  // Arms pivot at the shoulders, swinging opposite their side's leg.
  const shoulderY = torsoY1 - 0.03 * s;
  emitBox(out, cx - armX, shoulderY, cz, yaw, -armSwing, armW, -armLen, 0, armD, spec.shirt);
  emitBox(out, cx + armX, shoulderY, cz, yaw, armSwing, armW, -armLen, 0, armD, spec.shirt);
  // Head (centered, no swing).
  emitBox(out, cx, (headY0 + headY1) / 2, cz, yaw, 0, headW, -headH / 2, headH / 2, headD, spec.skin);
  // Eyes: two dark dots on the front face of the head.
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const eyeY = (headY0 + headY1) / 2 + 0.02 * s;
  const eyeOff = headD / 2 + 0.006;
  const eyeLat = 0.07 * ws;
  const eyeCol: Rgb = [0.08, 0.08, 0.1];
  emitBox(out, cx + rx * -eyeLat + fx * eyeOff, eyeY, cz + rz * -eyeLat + fz * eyeOff, yaw, 0, 0.045 * ws, -0.025 * s, 0.025 * s, 0.008, eyeCol);
  emitBox(out, cx + rx * eyeLat + fx * eyeOff, eyeY, cz + rz * eyeLat + fz * eyeOff, yaw, 0, 0.045 * ws, -0.025 * s, 0.025 * s, 0.008, eyeCol);
  // Hat or hair cap on top of the head.
  const topY = headY1;
  if (spec.hat === 'brim') {
    emitBox(out, cx, topY + 0.015 * s, cz, yaw, 0, 0.46 * ws, -0.015 * s, 0.015 * s, 0.46 * ws, spec.hatColor);
    emitBox(out, cx, topY + 0.03 * s + 0.05 * s, cz, yaw, 0, 0.3 * ws, -0.05 * s, 0.05 * s, 0.3 * ws, spec.hatColor);
    if (spec.goldBand) {
      emitBox(out, cx, topY + 0.03 * s + 0.015 * s, cz, yaw, 0, 0.31 * ws, -0.015 * s, 0.015 * s, 0.31 * ws, [0.85, 0.65, 0.15]);
    }
  } else if (spec.hat === 'cap') {
    emitBox(out, cx, topY + 0.05 * s, cz, yaw, 0, 0.32 * ws, -0.05 * s, 0.05 * s, 0.32 * ws, spec.hatColor);
  } else if (spec.hat === 'hood') {
    const dark: Rgb = [spec.shirt[0] * 0.7, spec.shirt[1] * 0.7, spec.shirt[2] * 0.7];
    emitBox(out, cx, topY + 0.06 * s, cz, yaw, 0, 0.36 * ws, -0.06 * s, 0.06 * s, 0.34 * ws, dark);
  } else {
    // Hair caps the head at the same height as hats (0.12), so every
    // figure tops out near the 1.48 anchor regardless of headwear.
    emitBox(out, cx, topY + 0.06 * s, cz, yaw, 0, 0.31 * ws, -0.06 * s, 0.06 * s, 0.3 * ws, spec.hair);
  }
}
