/**
 * BUILD 1019 — Minecraft-style blocky characters (pure module, no React).
 *
 * USER DIRECTION (2026-11-06 20:18 MST, literal): "No change the shitty
 * body and the look we like Minecraft characters with stupid faces and
 * hat". So the 994/999 realistic-polish direction is DEAD — this file
 * no longer tapers limbs, adds necks/shoulders/age cues, or refines
 * proportions toward realism. The target is MINECRAFT: cubic and blocky
 * ON PURPOSE — big square head, box torso, straight box arms and legs,
 * flat square faces — with STUPID/GOOFY faces and a HAT. Minecraft is
 * a style reference only: every vertex here is the game's own geometry
 * and colours, built from its triangle vocabulary. No Minecraft assets,
 * textures, or copied models exist anywhere in this file.
 *
 * PACK AUDIT (re-confirmed 2026-11-06, same result as 994): no uploaded
 * pack yields 3D character geometry for this renderer. The RPG sprite
 * pack is 48,803 2D PNGs; characters.zip is 16 2D PNGs; the Tiny RPG
 * soldier/orc pack is 2D PNGs + .aseprite; the 2D HD Character Knight
 * pack is 2D PNG spritesheets; FreeEnvironment_2 is 2 PNGs; the Kenney
 * fantasy town kit has 167 FBX/GLB/OBJ models but zero character files.
 * The renderer draws vertex-colour triangles only (positions + RGB, no
 * textures, no normals), so a 2D sprite cannot become a character here.
 *
 * AUDIT DEFECTS of the shipped 994/999 figure (before numbers, H=1.48):
 *   head 0.20H (20% of the body) on a 0.30-wide head vs a 0.46-wide
 *     torso — a small head on a wide chest, the opposite of Minecraft
 *     (Steve's head IS as wide as his torso and 25% of his height);
 *   legs 0.36H = torso 0.36H — stubby legs, long torso (Minecraft:
 *     legs and torso are each 37.5% of the height);
 *   no neck is FINE for Minecraft — but the old figure ALSO had no
 *     neck and still read as a polished mannequin, not a cube;
 *   face = two eye dots only — no expression at all, and at 3-5 tiles
 *     the figure read as a blank doll;
 *   hair = one cap box for everyone; hats on only ~50% of figures
 *     (brim/cap/hood/none each 25%) — half the town was bare-headed;
 *   arms/legs were single-colour sticks with a sleeve split — the
 *     whole figure read as "shitty" because nothing about it was
 *     bold, square, or funny.
 *
 * MINECRAFT PROPORTIONS (fractions of the 0.92H body, H = 1.48 anchor):
 *   adult: legs 0.345H, torso 0.345H, head 0.23H (head = 25% of the
 *     body, legs = torso = 37.5% — Steve's exact ratios);
 *   child: legs 0.30H, torso 0.30H, head 0.32H (head = 35% of the body
 *     — a big baby-villager head, still exactly 0.7x overall, the
 *     979 rule);
 *   head is a CUBE: headW = headD = 0.44 (as wide as the torso, as
 *     deep as it is wide); torso is 0.44 wide but only 0.22 deep
 *     (Steve's torso is half as deep as his head); legs 0.20 wide,
 *     touching at the centre; arms 0.19 wide at the torso edge.
 *   Figure tops (hat included) stay in the 992 range: brim tops at
 *     headY1 + 0.13, pointed hats at +0.16 — adult tops 1.41-1.58.
 *
 * STUPID FACES (seeded per NPC, so the town doesn't pull one face):
 *   eyes: googly (pupils looking different ways), crossed (both
 *     pupils toward the nose), derp (one big eye, one small eye,
 *     pupils at different heights), sleepy (half-lidded, pupils low),
 *     wide (big white eyes, tiny pupils — surprised);
 *   mouths: grin (wide dark grin + white tooth strip), toothy (two
 *     square teeth hanging from the top lip), open (dark open mouth +
 *     pink tongue), buck (one big front tooth), smirk (one-sided grin);
 *   brows: wonky (one high, one low), raised, slant (angry-funny),
 *     none. White sclera + dark pupils + white teeth read as a silly
 *     face at the 3-5 tile framing the player actually sees.
 *
 * HATS ARE THE DEFAULT (old: 25% bare heads; new: 5%): brim 30%,
 * cap 25%, pointed 20% (stepped cone — brim + 3 shrinking tiers),
 * flat 15% (wide brim + flat top), hood 5%, bare head 5%.
 *
 * WALK: stiff straight box swings ARE the Minecraft walk — legs
 * ±LEG_SWING, arms ±ARM_SWING opposite, bob |sin| x WALK_BOB, phase
 * by distance (the 998 rule). No lean, no elbow/knee articulation:
 * Minecraft characters do not bend. Animation is UNCHANGED in 1019.
 *
 * INVARIANTS (kept): player distinct by construction (emerald tunic,
 * dark brown pants, wide-brim hat with gold band — now in blocky
 * form, with a fixed googly/grin/wonky face); children exactly 0.7x;
 * facing coherence (1001 — limb boxes offset along the lateral axis
 * r = (cos yaw, -sin yaw)); figure-slot counts depend only on
 * (spec, child), never on phase/yaw (the 998 slot cache); NPC
 * schedules, movement, collision, barks untouched — looks only.
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
  [0.7, 0.15, 0.15], [0.85, 0.7, 0.15],
];
const HEIGHT_SCALES = [0.96, 0.98, 1.0, 1.02, 1.04];
const WIDTH_SCALES = [0.92, 1.0, 1.08];

export type HatKind = 'brim' | 'cap' | 'hood' | 'pointed' | 'flat' | 'none';
export type FaceKind = 'googly' | 'crossed' | 'derp' | 'sleepy' | 'wide';
export type MouthKind = 'grin' | 'toothy' | 'open' | 'buck' | 'smirk';
export type BrowKind = 'wonky' | 'raised' | 'slant' | 'none';

const FACES: FaceKind[] = ['googly', 'crossed', 'derp', 'sleepy', 'wide'];
const MOUTHS: MouthKind[] = ['grin', 'toothy', 'open', 'buck', 'smirk'];
const BROWS: BrowKind[] = ['wonky', 'raised', 'slant', 'none'];

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
  /** Stupid-face combo, seeded per figure id. */
  face: FaceKind;
  mouth: MouthKind;
  brow: BrowKind;
}

/**
 * The player's outfit, DISTINCT from every roster figure by
 * construction: the emerald tunic is absent from the NPC shirt palette
 * and the gold hat band is never rolled for NPCs. Now in blocky form,
 * with a fixed goofy face (googly eyes, big grin, wonky brows).
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
  face: 'googly',
  mouth: 'grin',
  brow: 'wonky',
};

/** Seeded spec for one figure id (NPC name). Same id → same spec, always. */
export function villagerSpecFor(id: string): VillagerSpec {
  const h = hashStr(id);
  const pick = <T>(arr: readonly T[], n: number): T => arr[(h >>> n) % arr.length];
  // Hats are the default now: brim 30%, cap 25%, pointed 20%,
  // flat 15%, hood 5%, bare head 5% (was 25% each incl. bare).
  const hatRoll = (h >>> 12) % 20;
  const hat: HatKind =
    hatRoll < 6 ? 'brim' : hatRoll < 11 ? 'cap' : hatRoll < 15 ? 'pointed'
    : hatRoll < 18 ? 'flat' : hatRoll < 19 ? 'hood' : 'none';
  // Face/mouth/brow roll from SEPARATELY salted hashes: the top bits
  // of the single djb2 hash are badly skewed over this 47-name roster
  // (the first cut had 26 'wide' faces, zero 'smirk' mouths and zero
  // 'none' brows), so each goofy feature gets its own decorrelated
  // roll. Colours/hat/height/width keep the original bit picks.
  return {
    skin: pick(SKINS, 0),
    shirt: pick(SHIRTS, 3),
    pants: pick(PANTS, 6),
    hair: pick(HAIRS, 9),
    hat,
    hatColor: pick(HATS, 15),
    heightScale: HEIGHT_SCALES[(h >>> 18) % HEIGHT_SCALES.length],
    widthScale: WIDTH_SCALES[(h >>> 21) % WIDTH_SCALES.length],
    goldBand: false,
    face: FACES[hashStr(id + ':face') % FACES.length],
    mouth: MOUTHS[hashStr(id + ':mouth') % MOUTHS.length],
    brow: BROWS[hashStr(id + ':brow') % BROWS.length],
  };
}

/** Design height of a figure: 1.48 anchor × build variation × 0.7 for children. */
export function villagerHeight(spec: VillagerSpec, child: boolean): number {
  return CHARACTER_H * spec.heightScale * (child ? 0.7 : 1);
}

/** A spec as one comparable tuple (player-distinctness asserts use this). */
export function specTuple(spec: VillagerSpec): string {
  const c = (v: Rgb) => v.map((n) => n.toFixed(2)).join(',');
  return [c(spec.skin), c(spec.shirt), c(spec.pants), c(spec.hair), spec.hat, c(spec.hatColor), String(spec.goldBand), spec.face, spec.mouth, spec.brow].join('|');
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
 * NOTE: animals.ts imports this exact signature — do not change it.
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
 * BUILD 1019 — Minecraft proportions, derived from one place so the
 * asserts can check attachment and proportions exactly.
 *
 * Adult body (fractions of H, sum 0.92H — the hat brings the top to
 * the 1.48 anchor): legs 0.345, torso 0.345, head 0.23 (head = 25%
 * of the body, Steve's ratio; old: head 0.20 on a 0.30-wide head vs
 * a 0.46 torso). Child body: legs 0.30, torso 0.30, head 0.32
 * (head = 35% — a big baby-villager head, still exactly 0.7x overall).
 * Head is a CUBE (headW = headD = 0.44); torso is as wide as the head
 * but half as deep (0.22). Legs touch at the centre (legX 0.11, legW
 * 0.20). Arms overlap the torso by 0.02 (the 999 attachment fix,
 * kept). Belt at the waist and boot bands at the ankles stay; the
 * 999 collar is GONE — Minecraft torsos have no collar.
 */
export const ARM_W = 0.19;
export const ARM_OVERLAP = 0.02;
export const SLEEVE_FRAC = 0.55;
/** Belt and boot detail bands (fractions of figure height). */
export const BELT_H_FRAC = 0.045;
export const BOOT_H_FRAC = 0.09;
export const BELT_COL: Rgb = [0.22, 0.15, 0.09];
export const BOOT_COL: Rgb = [0.25, 0.18, 0.12];
/** Face palette: white sclera, dark pupils, white teeth, pink tongue. */
export const EYE_WHITE: Rgb = [0.95, 0.95, 0.93];
export const PUPIL_COL: Rgb = [0.08, 0.08, 0.1];
export const TOOTH_COL: Rgb = [0.95, 0.95, 0.9];
export const MOUTH_COL: Rgb = [0.2, 0.1, 0.1];
export const TONGUE_COL: Rgb = [0.85, 0.4, 0.45];

export interface FigureLayout {
  H: number; ws: number; s: number; bob: number;
  legH: number; torsoH: number; headH: number;
  hipY: number; torsoY0: number; torsoY1: number; headY0: number; headY1: number;
  torsoW: number; torsoD: number;
  legW: number; legD: number; legX: number;
  armW: number; armD: number; armX: number; armLen: number; sleeveLen: number; shoulderY: number;
  headW: number; headD: number;
  beltH: number; bootH: number;
  eyeY: number; eyeLat: number; mouthY: number; browY: number;
}

/** Pure figure geometry for one spec. Same spec + child + bob → same layout. */
export function figureLayout(spec: VillagerSpec, child: boolean, bob: number): FigureLayout {
  const s = child ? 0.7 : 1;
  const H = CHARACTER_H * spec.heightScale * s;
  const ws = spec.widthScale * s;
  // Minecraft ratios: adult legs = torso = 37.5% of the body, head 25%;
  // children get a bigger head (35%) and shorter legs/torso (30% each).
  const legFrac = child ? 0.30 : 0.345;
  const torsoFrac = child ? 0.30 : 0.345;
  const headFrac = child ? 0.32 : 0.23;
  const legH = legFrac * H;
  const torsoH = torsoFrac * H;
  const headH = headFrac * H;
  const hipY = legH + bob;
  const torsoY0 = hipY;
  const torsoY1 = hipY + torsoH;
  const headY0 = torsoY1;
  const headY1 = headY0 + headH;
  const torsoW = 0.44 * ws;
  const torsoD = 0.22 * ws;
  const legW = 0.20 * ws;
  const legD = 0.22 * ws;
  const armW = ARM_W * ws;
  const armD = 0.19 * ws;
  const headW = 0.44 * ws;
  const headD = 0.44 * ws;
  const legX = 0.11 * ws;
  // Attached: the arm's inner edge sits ARM_OVERLAP INSIDE the torso
  // edge (the 999 fix). Outer span is unchanged in spirit.
  const armX = torsoW / 2 + armW / 2 - ARM_OVERLAP * ws;
  const armLen = torsoH + 0.03 * s;
  const shoulderY = torsoY1 - 0.03 * s;
  return {
    H, ws, s, bob, legH, torsoH, headH, hipY, torsoY0, torsoY1, headY0, headY1,
    torsoW, torsoD, legW, legD, legX, armW, armD, armX, armLen,
    sleeveLen: SLEEVE_FRAC * armLen, shoulderY, headW, headD,
    beltH: BELT_H_FRAC * H, bootH: BOOT_H_FRAC * H,
    // Face anchors: eyes just above the head's middle, mouth in the
    // lower third, brows just above the eyes.
    eyeY: headY0 + 0.58 * headH,
    eyeLat: 0.09 * ws,
    mouthY: headY0 + 0.22 * headH,
    browY: headY0 + 0.58 * headH + 0.18 * headH,
  };
}

// ------------------------------------------------------------ face helpers

/** One face feature box, centred on the head's front face. */
function faceBox(
  out: number[],
  cx: number, cz: number, yaw: number,
  lat: number, y: number, fwd: number,
  w: number, h: number, d: number,
  color: Rgb,
): void {
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  emitBox(out, cx + rx * lat + fx * fwd, y, cz + rz * lat + fz * fwd, yaw, 0, w, -h / 2, h / 2, d, color);
}

/**
 * Emit one villager figure centered at (cx, cz), feet at y = bob.
 * phase: walk-cycle phase in radians — legs swing ±LEG_SWING, arms
 * opposite at ±ARM_SWING, whole figure bobs |sin(phase)| × WALK_BOB.
 * At a multiple of 2π the figure stands neutral (legs together, no bob).
 * Facing: yaw with forward = (sin yaw, cos yaw) in (x, z).
 *
 * BUILD 1001 (kept) — limb placement rotates WITH the facing: every
 * limb is offset along the lateral axis r = (cos yaw, −sin yaw); at
 * yaw 0 this is byte-identical to world-X placement, so the old
 * south-facing look is preserved exactly. The face features use the
 * same lateral/forward axes, so the goofy face always stays on the
 * front of the head at every yaw.
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
  // Lateral axis for limb placement (BUILD 1001 — see doc above).
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  // Legs pivot at the hips (top of each leg box); boots share the leg
  // pivot + swing so they move with the legs, sitting proud of the
  // leg faces (no coplanar flicker) at the bottom of each leg.
  emitBox(out, cx - rx * L.legX, L.hipY, cz - rz * L.legX, yaw, legSwing, L.legW, -L.legH, 0, L.legD, spec.pants);
  emitBox(out, cx + rx * L.legX, L.hipY, cz + rz * L.legX, yaw, -legSwing, L.legW, -L.legH, 0, L.legD, spec.pants);
  emitBox(out, cx - rx * L.legX, L.hipY, cz - rz * L.legX, yaw, legSwing, L.legW + 0.02 * L.ws, -L.legH, -L.legH + L.bootH, L.legD + 0.02 * L.ws, BOOT_COL);
  emitBox(out, cx + rx * L.legX, L.hipY, cz + rz * L.legX, yaw, -legSwing, L.legW + 0.02 * L.ws, -L.legH, -L.legH + L.bootH, L.legD + 0.02 * L.ws, BOOT_COL);
  // Torso (centered, no swing) + belt at the waist. No collar — a
  // Minecraft torso is a plain box with a belt.
  emitBox(out, cx, (L.torsoY0 + L.torsoY1) / 2, cz, yaw, 0, L.torsoW, -L.torsoH / 2, L.torsoH / 2, L.torsoD, spec.shirt);
  emitBox(out, cx, L.hipY + L.beltH / 2, cz, yaw, 0, L.torsoW + 0.02 * L.ws, -L.beltH / 2, L.beltH / 2, L.torsoD + 0.02 * L.ws, BELT_COL);
  // Arms pivot at the shoulders, swinging opposite their side's leg.
  // Sleeve (shirt) + forearm (skin) share one pivot and one swing, so
  // each arm stays a single piece in motion; the forearm is the arm's
  // lower 45%, ending at the same bottom as before (0.06 below hip).
  emitBox(out, cx - rx * L.armX, L.shoulderY, cz - rz * L.armX, yaw, -armSwing, L.armW, -L.sleeveLen, 0, L.armD, spec.shirt);
  emitBox(out, cx + rx * L.armX, L.shoulderY, cz + rz * L.armX, yaw, armSwing, L.armW, -L.sleeveLen, 0, L.armD, spec.shirt);
  emitBox(out, cx - rx * L.armX, L.shoulderY, cz - rz * L.armX, yaw, -armSwing, L.armW, -L.armLen, -L.sleeveLen, L.armD, spec.skin);
  emitBox(out, cx + rx * L.armX, L.shoulderY, cz + rz * L.armX, yaw, armSwing, L.armW, -L.armLen, -L.sleeveLen, L.armD, spec.skin);
  // Head: a CUBE, as wide as the torso and as deep as it is wide.
  emitBox(out, cx, (L.headY0 + L.headY1) / 2, cz, yaw, 0, L.headW, -L.headH / 2, L.headH / 2, L.headD, spec.skin);
  // ---- STUPID FACE (front of the head, always on the facing side) ----
  const fwd = L.headD / 2;
  const hw = L.headW, hh = L.headH;
  // Eyes: white sclera + dark pupil. Size/placement per face kind.
  let sclW = 0.17 * hw, sclH = 0.18 * hh;
  let pupW = 0.09 * hw, pupH = 0.11 * hh;
  let pupL: [number, number] = [-0.02 * L.ws, 0.015 * L.s];
  let pupR: [number, number] = [0.02 * L.ws, -0.015 * L.s];
  let sclHLeft = sclH, sclHRight = sclH;
  let sclWLeft = sclW, sclWRight = sclW;
  if (spec.face === 'crossed') {
    pupL = [0.02 * L.ws, -0.01 * L.s];
    pupR = [-0.02 * L.ws, -0.01 * L.s];
  } else if (spec.face === 'derp') {
    sclWLeft = 0.20 * hw; sclHLeft = 0.22 * hh;
    sclWRight = 0.13 * hw; sclHRight = 0.13 * hh;
    pupL = [0, 0.015 * L.s];
    pupR = [0, -0.015 * L.s];
  } else if (spec.face === 'sleepy') {
    sclHLeft = 0.09 * hh; sclHRight = 0.09 * hh;
    pupL = [0, -0.012 * L.s];
    pupR = [0, -0.012 * L.s];
  } else if (spec.face === 'wide') {
    sclWLeft = 0.20 * hw; sclHLeft = 0.24 * hh;
    sclWRight = 0.20 * hw; sclHRight = 0.24 * hh;
    pupW = 0.06 * hw; pupH = 0.07 * hh;
    pupL = [0, 0];
    pupR = [0, 0];
  }
  // Left eye (sclera, then pupil proud of it).
  faceBox(out, cx, cz, yaw, -L.eyeLat, L.eyeY, fwd + 0.006, sclWLeft, sclHLeft, 0.008, EYE_WHITE);
  faceBox(out, cx, cz, yaw, -L.eyeLat + pupL[0], L.eyeY + pupL[1], fwd + 0.012, pupW, pupH, 0.006, PUPIL_COL);
  // Right eye.
  faceBox(out, cx, cz, yaw, L.eyeLat, L.eyeY, fwd + 0.006, sclWRight, sclHRight, 0.008, EYE_WHITE);
  faceBox(out, cx, cz, yaw, L.eyeLat + pupR[0], L.eyeY + pupR[1], fwd + 0.012, pupW, pupH, 0.006, PUPIL_COL);
  // Brows: hair-coloured bars above the eyes (wonky = one high, one low).
  if (spec.brow !== 'none') {
    let browL = 0, browR = 0;
    if (spec.brow === 'wonky') { browL = 0.02 * L.s; browR = -0.015 * L.s; }
    else if (spec.brow === 'raised') { browL = 0.02 * L.s; browR = 0.02 * L.s; }
    else if (spec.brow === 'slant') { browL = 0.025 * L.s; browR = -0.02 * L.s; }
    faceBox(out, cx, cz, yaw, -L.eyeLat, L.browY + browL, fwd + 0.006, 0.16 * hw, 0.045 * hh, 0.008, spec.hair);
    faceBox(out, cx, cz, yaw, L.eyeLat, L.browY + browR, fwd + 0.006, 0.16 * hw, 0.045 * hh, 0.008, spec.hair);
  }
  // Mouth: dark grin + teeth/tongue per kind.
  const mY = L.mouthY;
  if (spec.mouth === 'grin') {
    faceBox(out, cx, cz, yaw, 0, mY, fwd + 0.006, 0.40 * hw, 0.09 * hh, 0.008, MOUTH_COL);
    faceBox(out, cx, cz, yaw, 0, mY + 0.012 * L.s, fwd + 0.010, 0.36 * hw, 0.05 * hh, 0.006, TOOTH_COL);
  } else if (spec.mouth === 'toothy') {
    faceBox(out, cx, cz, yaw, 0, mY, fwd + 0.006, 0.32 * hw, 0.15 * hh, 0.008, MOUTH_COL);
    faceBox(out, cx, cz, yaw, -0.06 * L.ws, mY + 0.015 * L.s, fwd + 0.010, 0.09 * hw, 0.12 * hh, 0.006, TOOTH_COL);
    faceBox(out, cx, cz, yaw, 0.06 * L.ws, mY + 0.015 * L.s, fwd + 0.010, 0.09 * hw, 0.12 * hh, 0.006, TOOTH_COL);
  } else if (spec.mouth === 'open') {
    faceBox(out, cx, cz, yaw, 0, mY, fwd + 0.006, 0.22 * hw, 0.20 * hh, 0.008, MOUTH_COL);
    faceBox(out, cx, cz, yaw, 0, mY - 0.015 * L.s, fwd + 0.010, 0.16 * hw, 0.08 * hh, 0.006, TONGUE_COL);
  } else if (spec.mouth === 'buck') {
    faceBox(out, cx, cz, yaw, 0, mY, fwd + 0.006, 0.22 * hw, 0.09 * hh, 0.008, MOUTH_COL);
    faceBox(out, cx, cz, yaw, 0, mY + 0.005 * L.s, fwd + 0.010, 0.11 * hw, 0.14 * hh, 0.006, TOOTH_COL);
  } else {
    // smirk: one-sided grin.
    faceBox(out, cx, cz, yaw, 0.05 * L.ws, mY, fwd + 0.006, 0.28 * hw, 0.08 * hh, 0.008, MOUTH_COL);
  }
  // ---- HAT (or hair, for the rare bare head) ----
  const topY = L.headY1;
  if (spec.hat === 'brim') {
    emitBox(out, cx, topY + 0.015 * L.s, cz, yaw, 0, 0.56 * L.ws, -0.015 * L.s, 0.015 * L.s, 0.56 * L.ws, spec.hatColor);
    emitBox(out, cx, topY + 0.03 * L.s + 0.05 * L.s, cz, yaw, 0, 0.32 * L.ws, -0.05 * L.s, 0.05 * L.s, 0.32 * L.ws, spec.hatColor);
    if (spec.goldBand) {
      emitBox(out, cx, topY + 0.03 * L.s + 0.015 * L.s, cz, yaw, 0, 0.33 * L.ws, -0.015 * L.s, 0.015 * L.s, 0.33 * L.ws, [0.85, 0.65, 0.15]);
    }
  } else if (spec.hat === 'cap') {
    emitBox(out, cx, topY + 0.05 * L.s, cz, yaw, 0, 0.46 * L.ws, -0.05 * L.s, 0.05 * L.s, 0.46 * L.ws, spec.hatColor);
  } else if (spec.hat === 'pointed') {
    // Stepped cone: wide brim + three shrinking tiers.
    emitBox(out, cx, topY + 0.01 * L.s, cz, yaw, 0, 0.56 * L.ws, -0.01 * L.s, 0.01 * L.s, 0.56 * L.ws, spec.hatColor);
    emitBox(out, cx, topY + 0.05 * L.s, cz, yaw, 0, 0.30 * L.ws, -0.03 * L.s, 0.03 * L.s, 0.30 * L.ws, spec.hatColor);
    emitBox(out, cx, topY + 0.10 * L.s, cz, yaw, 0, 0.20 * L.ws, -0.025 * L.s, 0.025 * L.s, 0.20 * L.ws, spec.hatColor);
    emitBox(out, cx, topY + 0.14 * L.s, cz, yaw, 0, 0.10 * L.ws, -0.02 * L.s, 0.02 * L.s, 0.10 * L.ws, spec.hatColor);
  } else if (spec.hat === 'flat') {
    emitBox(out, cx, topY + 0.015 * L.s, cz, yaw, 0, 0.56 * L.ws, -0.015 * L.s, 0.015 * L.s, 0.56 * L.ws, spec.hatColor);
    emitBox(out, cx, topY + 0.055 * L.s, cz, yaw, 0, 0.36 * L.ws, -0.025 * L.s, 0.025 * L.s, 0.36 * L.ws, spec.hatColor);
  } else if (spec.hat === 'hood') {
    const dark: Rgb = [spec.shirt[0] * 0.7, spec.shirt[1] * 0.7, spec.shirt[2] * 0.7];
    emitBox(out, cx, topY + 0.06 * L.s, cz, yaw, 0, 0.38 * L.ws, -0.06 * L.s, 0.06 * L.s, 0.36 * L.ws, dark);
    // Hood falls down the back of the head (centred on the back face,
    // i.e. offset along -f, the full back direction at any yaw).
    const backOff = L.headD / 2 + 0.004;
    emitBox(out, cx - fx * backOff, (L.headY0 + L.headY1) / 2, cz - fz * backOff, yaw, 0, 0.38 * L.ws, -L.headH / 2, L.headH / 2, 0.008, dark);
  } else {
    // Bare head (rare now, 5%): hair cap on top + hair down the back,
    // so the back of the head is not bald skin.
    emitBox(out, cx, topY + 0.05 * L.s, cz, yaw, 0, 0.45 * L.ws, -0.05 * L.s, 0.05 * L.s, 0.44 * L.ws, spec.hair);
    const backOff = L.headD / 2 + 0.004;
    emitBox(out, cx - fx * backOff, (L.headY0 + L.headY1) / 2, cz - fz * backOff, yaw, 0, 0.44 * L.ws, -L.headH / 2, L.headH / 2, 0.008, spec.hair);
  }
}
