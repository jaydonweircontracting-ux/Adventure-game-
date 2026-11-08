// BUILD 1038 — the placeable windmill's rotating blades (pure geometry).
//
// The windmill is a house variant (townLook.ts HOUSE_VARIANTS.windmill,
// 3x3, 2 stories, no chimney), so it rides the whole building system:
// validatePlacement, the 1036 green/red preview + persistent placement
// + rotation, save/load, undo/redo, move, chunk capture/paste, and the
// 1037 AREA SELECT. The tower itself is static — the house loop in
// Engine3DWorldView.tsx emits it into the world buffer (stone tower +
// pyramid cap + door + window frames at the shared windowSlotsFor
// positions, so the per-frame fx panes land inside them). The BLADES
// are the only moving part, and they live here as pure geometry so
// they can be asserted standalone: millBladesFor returns the triangles
// for one frame, and the per-frame fx emitter (houseFx.ts) calls it
// with angle = driftSec * MILL_ROT_SPEED, so the blades turn without
// a world rebuild — the same drift clock the smoke rides.
//
// Blade layout: four arms at 90° apart, turning in the plane parallel
// to the door face (the front of the mill). Each arm is a thin timber
// quad from the hub to the tip, with a wider pale-canvas sail on one
// side. The hub sits on the door face at mid-cap height, offset out
// from the wall so the blades clear the tower, the cap, and the door
// (lowest sweep y = hub - LEN = 2.25, above the 1.78 door top).
// The three layers sit on three planes 0.01 apart (arm 0, hub cap
// +0.01, sail +0.02 — the same frame/pane offset convention the
// windows use), so nothing coplanar z-fights.

import type { DoorFace } from './townLook';

export type Vec3 = [number, number, number];
export interface MillTri { a: Vec3; b: Vec3; c: Vec3; col: Vec3; }

/** Tower height above the base y: two stories (2.1 + 1.6). The cap sits on top of it. */
export const WINDMILL_TOWER_H = 3.7;
/** Pyramid cap height above the tower top. */
export const WINDMILL_CAP_H = 1.2;
/** Blade length from the hub to the tip, tiles. */
export const MILL_BLADE_LEN = 2.0;
/** Blade arm width, tiles. */
export const MILL_BLADE_ARM_W = 0.16;
/** Sail (lattice panel) width beside each arm, tiles. */
export const MILL_SAIL_W = 0.55;
/** Sail starts this far from the hub along the arm (the hub + lower arm stay bare). */
export const MILL_SAIL_FROM = 0.55;
/** Blade rotation speed, radians per real second — a full turn in ~12.6s, slow and stately. */
export const MILL_ROT_SPEED = 0.5;
/** Hub offset out from the door face, tiles — the blades clear the wall and the door. */
export const MILL_HUB_OUT = 0.38;
/** Hub height above the tower top (mid-cap). */
export const MILL_HUB_ABOVE_TOWER = 0.55;
/** Hub cap size (a square facing the viewer), tiles. */
export const MILL_HUB_SIZE = 0.34;
/** Dark timber (arms + hub cap). */
export const MILL_TIMBER: Vec3 = [0.23, 0.16, 0.1];
/** Pale canvas (sails). */
export const MILL_SAIL: Vec3 = [0.85, 0.78, 0.6];
/** Triangles per windmill per frame: 4 blades x (arm 2 + sail 2) + hub cap 2 = 18. */
export const MILL_TRIS_PER_MILL = 18;

/** Hub position: on the door face, mid-cap height, offset out from the wall. */
export function millHubFor(cx: number, cz: number, w: number, d: number, doorFace: DoorFace, baseY = 0): Vec3 {
  const y = baseY + WINDMILL_TOWER_H + MILL_HUB_ABOVE_TOWER;
  if (doorFace === 'south') return [cx, y, cz + d / 2 + MILL_HUB_OUT];
  if (doorFace === 'north') return [cx, y, cz - d / 2 - MILL_HUB_OUT];
  if (doorFace === 'west') return [cx - w / 2 - MILL_HUB_OUT, y, cz];
  return [cx + w / 2 + MILL_HUB_OUT, y, cz];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

/**
 * The blade triangles for one frame at rotation `angle` (radians).
 * Four arms at 90° apart, turning in the plane parallel to the door
 * face: south/north faces turn in the XY plane, west/east in the ZY
 * plane. Each arm is a thin timber quad from the hub to the tip, with
 * a wider pale sail on its +perp side. A hub cap square covers the
 * centre where the arms meet. Returns MILL_TRIS_PER_MILL triangles.
 */
export function millBladesFor(hub: Vec3, doorFace: DoorFace, angle: number): MillTri[] {
  // u = the horizontal in-plane axis, v = up, n = the outward face normal.
  const u: Vec3 = (doorFace === 'south' || doorFace === 'north') ? [1, 0, 0] : [0, 0, 1];
  const v: Vec3 = [0, 1, 0];
  const n: Vec3 = doorFace === 'south' ? [0, 0, 1] : doorFace === 'north' ? [0, 0, -1] : doorFace === 'west' ? [-1, 0, 0] : [1, 0, 0];
  const tris: MillTri[] = [];
  for (let i = 0; i < 4; i++) {
    const a = angle + (i * Math.PI) / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const dir: Vec3 = [u[0] * ca + v[0] * sa, u[1] * ca + v[1] * sa, u[2] * ca + v[2] * sa];
    const perp: Vec3 = [u[0] * (-sa) + v[0] * ca, u[1] * (-sa) + v[1] * ca, u[2] * (-sa) + v[2] * ca];
    const hw = MILL_BLADE_ARM_W / 2;
    // Arm: thin quad from 0.15 to the tip, centred on the arm line.
    const p0 = add(hub, scale(dir, 0.15)), p1 = add(hub, scale(dir, MILL_BLADE_LEN));
    const a0 = add(p0, scale(perp, -hw)), a1 = add(p0, scale(perp, hw));
    const b0 = add(p1, scale(perp, -hw)), b1 = add(p1, scale(perp, hw));
    tris.push({ a: a0, b: a1, c: b1, col: MILL_TIMBER }, { a: a0, b: b1, c: b0, col: MILL_TIMBER });
    // Sail: wider panel on the +perp side, from MILL_SAIL_FROM to the
    // tip, 0.02 proud of the arm so the overlap cannot z-fight.
    const off = scale(n, 0.02);
    const s0 = add(add(hub, scale(dir, MILL_SAIL_FROM)), off);
    const s1 = add(add(hub, scale(dir, MILL_BLADE_LEN)), off);
    const c0 = s0, c1 = add(s0, scale(perp, MILL_SAIL_W));
    const d0 = s1, d1 = add(s1, scale(perp, MILL_SAIL_W));
    tris.push({ a: c0, b: c1, c: d1, col: MILL_SAIL }, { a: c0, b: d1, c: d0, col: MILL_SAIL });
  }
  // Hub cap: a square facing the viewer over the centre, 0.01 proud
  // of the arms (the arms start at 0.15, the cap is 0.34 across).
  const h = MILL_HUB_SIZE / 2;
  const hc = add(hub, scale(n, 0.01));
  const hu = scale(u, h), hv = scale(v, h);
  const q0 = add(add(hc, scale(hu, -1)), scale(hv, -1));
  const q1 = add(add(hc, scale(hu, 1)), scale(hv, -1));
  const q2 = add(add(hc, scale(hu, 1)), scale(hv, 1));
  const q3 = add(add(hc, scale(hu, -1)), scale(hv, 1));
  tris.push({ a: q0, b: q1, c: q2, col: MILL_TIMBER }, { a: q0, b: q2, c: q3, col: MILL_TIMBER });
  return tris;
}
