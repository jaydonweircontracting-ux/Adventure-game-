// BUILD 1014: chimney smoke + per-house window lights for the 3D world.
//
// AUDIT (before coding):
// - Chimneys: houseDesignFor (townLook.ts) gives chimney = h(7) < 0.5 —
//   ~half the houses; 1012 measured 7 of the 26 town lots (re-measured
//   in the 1014 asserts). A placed variant house keeps the same seed
//   hash (houseDesignForVariant), so it has a chimney ~50% of the time
//   by placement spot. Chimney geometry (Engine3DWorldView house loop):
//   box .35 x 1.1 x .35 from ridgeY-.3, cap quad at ridgeY+.8 — smoke
//   starts at the cap (chX, ridgeY+.8, chZ). No smoke without a chimney.
// - Windows today: the house loop's win() emits a timber frame + a glass
//   pane per slot (5 per upper floor: 2 door face, 2 side, 1 back),
//   pane colour from design.lit[slot%8] — STATIC, seeded ~35% lit.
//   design.lit is used nowhere else; this build removes it. The frames
//   stay in the world buffer (static); the panes move here.
// - Clock: 993 (1 game-min per real sec, ag-3d-clock-v1). Night factor:
//   1011 reuses 976's curve exactly (full day 07:00-18:00, dawn
//   05:00-07:00, dusk 18:00-20:00, full night 20:00-05:00, cap 0.55,
//   navy (8,12,40)). Lights key off the SAME clock; the on/off times
//   are per-house seeds, so nothing extra is persisted and a reload
//   can never change a house's times.
// - MECHANISM (decided, stated): per-frame emission in a dedicated fx
//   buffer, exactly the 1011 sky-buffer pattern (one allocation at
//   FX_MAX_VERTS, bufferSubData per frame, never bufferData). Lit state
//   is a pure function of (house seed, clock minutes) — no world
//   rebuild when a light flips (a rebuild costs ~61ms; ~26 houses
//   flipping across dusk would stutter every few seconds). Smoke
//   animates on the same real-second drift clock as the 1011 clouds
//   (skyDriftRef), so it moves every frame for free.
// - Wind: smoke drifts +x at exactly CLOUD_DRIFT_TILES_PER_SEC (0.3),
//   the same speed and direction as the 1011 clouds — the sky agrees
//   with itself.
// - BUILD 1015 smoke rework (the 1014 column read as a stack of pale
//   cubes, and the user said so flatly): the 1014 form rose only 3
//   tiles, started nearly white, and vanished at full size (0.9) at
//   the top — a hard pop. The rework rises 7 tiles over 10s, starts
//   DARK at the cap (fresh smoke is dark against the sky), thins by
//   colour toward the sky AND shrinks to a 0.06 wisp at end of life,
//   so it dissolves instead of popping; puffs vary in size by seed
//   and the column wanders (growing with height) instead of stacking
//   on a rigid line. A puff lives 10s, rises 7 tiles, drifts ~3
//   tiles east.
// - Lit panes are SELF-LUMINOUS (drawn with uNight=0, the sun/moon
//   precedent): a lit window emits light, so at night it stays full
//   warm yellow against the navy-dimmed town. Smoke and dark panes
//   draw with uNight (they darken like clouds and glass).
// - Interiors (990) are out of scope: the entered hut's shell —
//   frames, panes, chimney, smoke — is skipped whole, like the world
//   builder does. Smoke runs day AND night.

import { houseDesignFor, houseDesignForVariant, HOUSE_VARIANTS, hash2, roofRise, GROUND_FLOOR_H, UPPER_FLOOR_H, GLASS_DARK, GLASS_LIT, SKY_HORIZON, type DoorFace, type HouseDesign, type HouseVariantId } from './townLook';
import { CLOUD_DRIFT_TILES_PER_SEC } from './sky';
import { placedHutRects, movedRecordForHut } from './placements';
import { sameHut } from './interiors';
import { effTerrainFor, surfaceElevation } from './wildTerrain';
import type { HutRect, IsoWorld } from '../iso/isoWorld';

export type Vec3 = [number, number, number];

/** Puffs per chimney column. Nine over a 7-tile rise, ~0.78 apart,
 *  so the taller column still reads as continuous smoke (six over 7
 *  would leave sky gaps between puffs). */
export const SMOKE_PUFFS_PER_CHIMNEY = 9;
/** One puff's full life, real seconds (rise + drift + thin, then recycle). */
export const SMOKE_RISE_PERIOD_SEC = 10;
/** How far a puff rises above the chimney cap over its life, tiles.
 *  BUILD 1015: 3 -> 7 (the 1014 column was a stubby stack). */
export const SMOKE_RISE_H = 7;
/** Puff size at the cap, tiles (small at birth). */
export const SMOKE_BASE_SIZE = 0.28;
/** Puff size at mid-life (p = 0.45), tiles — the column's widest. */
export const SMOKE_PEAK_SIZE = 1.0;
/** Puff size at end of life, tiles — a wisp, so the column dissolves
 *  instead of popping out at full size (the 1014 failure). */
export const SMOKE_END_SIZE = 0.06;
/** Life fraction where the size peaks (grow before, shrink after). */
export const SMOKE_PEAK_P = 0.45;
/** Per-puff size jitter, seeded: puffs vary 0.85x-1.15x so the column
 *  is not a uniform stack. */
export const SMOKE_SIZE_JITTER = 0.3;
/** Smoke colour at the cap: DARK grey-blue (fresh smoke is dark
 *  against the sky — the 1014 nearly-white base is what read as
 *  solid cubes). */
export const SMOKE_BASE: Vec3 = [0.38, 0.38, 0.42];
/** Smoke colour at mid-life: dispersed mid grey. */
export const SMOKE_MID: Vec3 = [0.62, 0.64, 0.68];
/** One-time fx-buffer allocation, vertices. Town needs ~4,500 (10
 *  chimneys x 324 + 205 panes x 6); 40 extra placed chimney houses
 *  need ~19,000 (50 chimneys x 324 + ~490 panes x 6) — still under
 *  the cap, and emission never pushes past it (see emitHouseFx).
 *  Raised from 16384 in BUILD 1015: the reworked smoke costs 324
 *  verts per chimney (was 216), and at 16384 the 40-extra-houses
 *  scenario overflowed — the fits() guard would silently skip the
 *  smoke on later placed houses. The buffer is allocated once
 *  (32768 verts x 6 floats x 4 bytes ≈ 786 KB); per-frame cost is
 *  unchanged (bufferSubData of the used prefix). */
export const FX_MAX_VERTS = 32768;

/** Light-on time, minutes after midnight: 17:30. */
export const LIGHT_ON_MIN = 1050;
/** Light-on times spread this far past 17:30 (to 19:30). */
export const LIGHT_ON_SPREAD = 120;
/** Early lights-out: 21:30-22:30, 25% of houses. */
export const LIGHT_OFF_EARLY_MIN = 1290;
export const LIGHT_OFF_EARLY_SPREAD = 60;
export const LIGHT_OFF_EARLY_SHARE = 0.25;
/** Mid lights-out: 23:00-00:30 (wraps midnight), 40% of houses. */
export const LIGHT_OFF_MID_MIN = 1380;
export const LIGHT_OFF_MID_SPREAD = 90;
export const LIGHT_OFF_MID_SHARE = 0.65;
/** All-night houses: lights out 04:30-05:30, 35% of houses. */
export const LIGHT_OFF_LATE_MIN = 270;
export const LIGHT_OFF_LATE_SPREAD = 60;

export interface LightSchedule { onMin: number; offMin: number; }

/**
 * A house's light schedule, seeded by its (original) hut origin — the
 * same seed the design hash uses, so the times are stable across
 * rebuilds, moves (1006 keeps the original seed), and reloads, and
 * nothing is persisted. onMin in [17:30, 19:30); offMin in one of
 * three buckets: 21:30-22:30 (25%), 23:00-00:30 (40%), 04:30-05:30
 * (35% — lit all night). Salts 31-33 are outside houseDesignFor's
 * range (1-7, 10-17), so schedules do not correlate with chimneys
 * or colours.
 */
export function lightScheduleFor(seedX0: number, seedY0: number): LightSchedule {
  const h = (salt: number): number => hash2(seedX0 * 3.1 + salt, seedY0 * 7.7 + salt * 1.3);
  const onMin = LIGHT_ON_MIN + Math.floor(h(31) * LIGHT_ON_SPREAD);
  const bucket = h(32);
  let offMin: number;
  if (bucket < LIGHT_OFF_EARLY_SHARE) offMin = LIGHT_OFF_EARLY_MIN + Math.floor(h(33) * LIGHT_OFF_EARLY_SPREAD);
  else if (bucket < LIGHT_OFF_MID_SHARE) offMin = (LIGHT_OFF_MID_MIN + Math.floor(h(33) * LIGHT_OFF_MID_SPREAD)) % 1440;
  else offMin = LIGHT_OFF_LATE_MIN + Math.floor(h(33) * LIGHT_OFF_LATE_SPREAD);
  return { onMin, offMin };
}

/** True when the house's lights are on at this minute-of-day. Handles
 *  the wrap: a schedule whose off time is past midnight (off < on) is
 *  lit from onMin through midnight to offMin. */
export function houseLitAt(minutes: number, sched: LightSchedule): boolean {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  if (sched.onMin <= sched.offMin) return m >= sched.onMin && m < sched.offMin;
  return m >= sched.onMin || m < sched.offMin;
}

export interface WindowSlot { face: DoorFace; a: number; y: number; }

/**
 * Window slots for a house, single-sourced: the world builder's frames
 * and this module's panes both iterate this list, so they can never
 * disagree on position. 5 per upper floor (2 door face, 1 each side,
 * 1 back), in the exact order the old win() closure emitted them.
 * cx/cz are the hut centre, w/d the footprint, face the door face.
 */
export function windowSlotsFor(cx: number, cz: number, w: number, d: number, face: DoorFace, stories: number, baseY = 0): WindowSlot[] {
  const aC = face === 'south' || face === 'north' ? cx : cz;
  const spanA = face === 'south' || face === 'north' ? w : d;
  const sideA = face === 'south' || face === 'north' ? cz : cx;
  const sideL: DoorFace = face === 'south' ? 'west' : face === 'north' ? 'east' : face === 'west' ? 'north' : 'south';
  const sideR: DoorFace = face === 'south' ? 'east' : face === 'north' ? 'west' : face === 'west' ? 'south' : 'north';
  const back: DoorFace = face === 'south' ? 'north' : face === 'north' ? 'south' : face === 'west' ? 'east' : 'west';
  const slots: WindowSlot[] = [];
  for (let s = 1; s < stories; s++) {
    // BUILD 1034: baseY lifts the slots onto the heightfield with the
    // hut, so the world builder's frames and this module's panes agree.
    const yC = baseY + GROUND_FLOOR_H + (s - 1) * UPPER_FLOOR_H + UPPER_FLOOR_H / 2;
    slots.push(
      { face, a: aC - spanA * 0.22, y: yC },
      { face, a: aC + spanA * 0.22, y: yC },
      { face: sideL, a: sideA, y: yC },
      { face: sideR, a: sideA, y: yC },
      { face: back, a: aC, y: yC },
    );
  }
  return slots;
}

/** The glass-pane plane for a slot: the wall face, 0.03 proud — the
 *  exact offset the world builder's win() used (frame at +0.015). */
export function panePlaneFor(face: DoorFace, cx: number, cz: number, w: number, d: number): number {
  return face === 'south' ? cz + d / 2 + 0.03 : face === 'north' ? cz - d / 2 - 0.03 : face === 'west' ? cx - w / 2 - 0.03 : cx + w / 2 + 0.03;
}

/**
 * The chimney cap position for a house, or null when it has no
 * chimney. Single-sourced with the house loop: the chimney box runs
 * ridgeY-.3 to ridgeY+.8 and the cap quad sits at ridgeY+.8.
 */
export function chimneyTopFor(cx: number, cz: number, w: number, d: number, design: HouseDesign, baseY = 0): Vec3 | null {
  if (!design.chimney) return null;
  const topY = baseY + GROUND_FLOOR_H + (design.stories - 1) * UPPER_FLOOR_H;
  const span = design.roofAxis === 'x' ? d : w;
  const ridgeY = topY + roofRise(span);
  return [design.roofAxis === 'x' ? cx + w * 0.28 : cx, ridgeY + 0.8, design.roofAxis === 'x' ? cz : cz + d * 0.28];
}

export interface SmokePuff {
  x: number; y: number; z: number; size: number; color: Vec3;
  /** Yaw rotation of the puff box, radians — each puff is turned a
   *  third of a turn from the last, so the column reads as soft
   *  billowing blobs instead of axis-aligned cubes. */
  rot: number;
}

const frac = (v: number): number => v - Math.floor(v);

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * A chimney's smoke puffs at driftSec real seconds. Puff i rides
 * phase (driftSec / period + i/9) mod 1. BUILD 1015 rework — the 1014
 * column was a rigid stack of pale cubes that popped out at the top:
 * - Taller: rises SMOKE_RISE_H (7) over SMOKE_RISE_PERIOD_SEC (10).
 * - Real fade, two ways at once: colour dark base -> mid grey -> sky
 *   at the top, AND size grows to a peak at p=0.45 then shrinks to a
 *   0.06 wisp at p=1 — the puff dissolves instead of vanishing at
 *   full size. No alpha exists, so sky-colour + shrink IS the fade.
 * - Varied: each puff's size jitters by seed (0.85x-1.15x).
 * - Wandering: the column bends as it rises — x wander and two
 *   z harmonics, both scaled by p so a newborn puff starts exactly
 *   at the cap and the wind catches it as it climbs. Drift +x stays
 *   exactly the cloud wind speed.
 * Pure: same inputs give the same puffs, so the browser hook can read
 * the live state.
 */
export function smokePuffsFor(top: Vec3, seedX0: number, seedY0: number, driftSec: number): SmokePuff[] {
  const sway = hash2(seedX0 * 1.7 + 5, seedY0 * 3.3 + 5) * Math.PI * 2;
  const sway2 = hash2(seedX0 * 2.9 + 11, seedY0 * 1.3 + 7) * Math.PI * 2;
  const puffs: SmokePuff[] = [];
  for (let i = 0; i < SMOKE_PUFFS_PER_CHIMNEY; i++) {
    const p = frac(driftSec / SMOKE_RISE_PERIOD_SEC + i / SMOKE_PUFFS_PER_CHIMNEY);
    const sizeJitter = 1 - SMOKE_SIZE_JITTER / 2 + SMOKE_SIZE_JITTER * hash2(seedX0 + i * 3.7, seedY0 + i * 1.9);
    const size = (p < SMOKE_PEAK_P
      ? SMOKE_BASE_SIZE + (SMOKE_PEAK_SIZE - SMOKE_BASE_SIZE) * smooth(p / SMOKE_PEAK_P)
      : SMOKE_PEAK_SIZE - (SMOKE_PEAK_SIZE - SMOKE_END_SIZE) * smooth((p - SMOKE_PEAK_P) / (1 - SMOKE_PEAK_P))) * sizeJitter;
    const color = p < SMOKE_PEAK_P
      ? lerp3(SMOKE_BASE, SMOKE_MID, smooth(p / SMOKE_PEAK_P))
      : lerp3(SMOKE_MID, SKY_HORIZON, smooth((p - SMOKE_PEAK_P) / (1 - SMOKE_PEAK_P)));
    puffs.push({
      x: top[0] + p * SMOKE_RISE_PERIOD_SEC * CLOUD_DRIFT_TILES_PER_SEC + Math.sin(p * Math.PI * 3 + sway2) * 0.35 * p,
      y: top[1] + 0.15 + p * SMOKE_RISE_H,
      z: top[2] + (Math.sin(p * Math.PI * 2 + sway) * 0.3 + Math.sin(p * Math.PI * 4 + sway2) * 0.12) * p,
      size,
      color,
      rot: sway + i * (Math.PI / 3),
    });
  }
  return puffs;
}

export interface HouseFxInput {
  x0: number; y0: number; x1: number; y1: number;
  doorX: number; doorY: number;
  seedX0: number; seedY0: number;
  variant?: HouseVariantId;
  entered: boolean;
  /** BUILD 1034: the hut's base y on the heightfield (the shared
   *  surface at its centre), so the smoke and lit panes lift with the
   *  house instead of starting inside it. Absent = 0 (flat). */
  baseY?: number;
}

/**
 * The fx inputs for a world: generated huts + placed huts, in the
 * same order the house loop iterates them (town first, then placed).
 * Seeds follow the 1006 rule (a moved hut keeps its ORIGINAL rect's
 * origin, so its look — and its light times — travel with it).
 * doorX/doorY default exactly as the house loop does.
 */
export function houseFxInputsFor(world: IsoWorld, enteredHut: HutRect | null): HouseFxInput[] {
  const out: HouseFxInput[] = [];
  // BUILD 1034: one effTerrain for the whole input list (the placement
  // Sets are built once), then each hut's base y from the shared surface.
  const effTerrain = effTerrainFor(world);
  for (const hut of [...world.huts, ...placedHutRects(world)]) {
    const seedHut = movedRecordForHut(world, hut)?.from ?? hut;
    const variant = (hut as { variant?: string }).variant;
    out.push({
      x0: hut.x0, y0: hut.y0, x1: hut.x1, y1: hut.y1,
      doorX: (hut as { doorX?: number }).doorX ?? Math.round((hut.x0 + hut.x1 + 1) / 2),
      doorY: (hut as { doorY?: number }).doorY ?? hut.y1,
      seedX0: seedHut.x0, seedY0: seedHut.y0,
      variant: variant && HOUSE_VARIANTS[variant as keyof typeof HOUSE_VARIANTS] ? (variant as HouseVariantId) : undefined,
      entered: !!enteredHut && sameHut(hut, enteredHut),
      baseY: surfaceElevation(effTerrain, (hut.x0 + hut.x1 + 1) / 2, (hut.y0 + hut.y1 + 1) / 2),
    });
  }
  return out;
}

export interface HouseFxDetail {
  cx: number; cz: number; w: number; d: number;
  seedX0: number; seedY0: number;
  doorFace: DoorFace; stories: number;
  top: Vec3 | null;
  lit: boolean;
  slots: WindowSlot[];
  schedule: LightSchedule;
  hut: { x0: number; y0: number; x1: number; y1: number };
}

/** Resolve every input to its design-derived fx state at this minute.
 *  The emitter and the test hook share this, so probes see exactly
 *  what the renderer draws. */
export function resolveHouseFx(inputs: HouseFxInput[], minutes: number): HouseFxDetail[] {
  const out: HouseFxDetail[] = [];
  for (const inp of inputs) {
    if (inp.entered) continue;
    const cx = (inp.x0 + inp.x1 + 1) / 2, cz = (inp.y0 + inp.y1 + 1) / 2;
    const w = Math.max(2, inp.x1 - inp.x0 + 1), d = Math.max(2, inp.y1 - inp.y0 + 1);
    const design = inp.variant
      ? houseDesignForVariant(HOUSE_VARIANTS[inp.variant], inp.x0, inp.y0, inp.x1, inp.y1, inp.doorX, inp.doorY, inp.seedX0, inp.seedY0)
      : houseDesignFor(inp.x0, inp.y0, inp.x1, inp.y1, inp.doorX, inp.doorY, inp.seedX0, inp.seedY0);
    out.push({
      cx, cz, w, d, seedX0: inp.seedX0, seedY0: inp.seedY0,
      doorFace: design.doorFace, stories: design.stories,
      top: chimneyTopFor(cx, cz, w, d, design, inp.baseY ?? 0),
      lit: houseLitAt(minutes, lightScheduleFor(inp.seedX0, inp.seedY0)),
      slots: windowSlotsFor(cx, cz, w, d, design.doorFace, design.stories, inp.baseY ?? 0),
      schedule: lightScheduleFor(inp.seedX0, inp.seedY0),
      hut: { x0: inp.x0, y0: inp.y0, x1: inp.x1, y1: inp.y1 },
    });
  }
  return out;
}

function pushTri(out: number[], a: Vec3, b: Vec3, c: Vec3, col: Vec3): void {
  out.push(a[0], a[1], a[2], col[0], col[1], col[2]);
  out.push(b[0], b[1], b[2], col[0], col[1], col[2]);
  out.push(c[0], c[1], c[2], col[0], col[1], col[2]);
}

function pushQuad(out: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3, col: Vec3): void {
  pushTri(out, a, b, c, col);
  pushTri(out, a, c, d, col);
}

/** One smoke puff as a small box (12 tris, 36 verts) — the same box
 *  language as the 1011 cloud slabs — turned by p.rot around Y, so
 *  its silhouette is a diamond, not an axis-aligned cube. Top face
 *  full colour, sides slightly shaded, bottom darkest, so the puff
 *  reads as a volume. Rotation preserves the centre exactly. */
function pushPuffBox(out: number[], p: SmokePuff): void {
  const h = p.size / 2;
  const co = Math.cos(p.rot), si = Math.sin(p.rot);
  const corner = (sx: number, sy: number, sz: number): Vec3 => [
    p.x + sx * co + sz * si,
    p.y + sy,
    p.z - sx * si + sz * co,
  ];
  const v000 = corner(-h, -h, -h), v100 = corner(h, -h, -h), v110 = corner(h, -h, h), v010 = corner(-h, -h, h);
  const v001 = corner(-h, h, -h), v101 = corner(h, h, -h), v111 = corner(h, h, h), v011 = corner(-h, h, h);
  const c = p.color;
  const side: Vec3 = [c[0] * 0.93, c[1] * 0.93, c[2] * 0.93];
  const bot: Vec3 = [c[0] * 0.82, c[1] * 0.82, c[2] * 0.82];
  pushQuad(out, v001, v101, v111, v011, c);
  pushQuad(out, v000, v100, v110, v010, bot);
  pushQuad(out, v000, v100, v101, v001, side);
  pushQuad(out, v010, v110, v111, v011, side);
  pushQuad(out, v000, v010, v011, v001, side);
  pushQuad(out, v100, v110, v111, v101, side);
}

/**
 * One glass pane (0.34 x 0.44) at the slot's plane — the exact vertex
 * math of the world builder's faceRect, so a pane emitted here lands
 * precisely inside the frame the world buffer drew. Winding matches
 * faceRect; CULL_FACE is disabled, so it is irrelevant anyway.
 */
function pushPane(out: number[], face: DoorFace, a: number, y: number, plane: number, col: Vec3): void {
  const a0 = a - 0.17, a1 = a + 0.17, y0 = y - 0.22, y1 = y + 0.22;
  if (face === 'south') pushQuad(out, [a0, y0, plane], [a1, y0, plane], [a1, y1, plane], [a0, y1, plane], col);
  else if (face === 'north') pushQuad(out, [a1, y0, plane], [a0, y0, plane], [a0, y1, plane], [a1, y1, plane], col);
  else if (face === 'west') pushQuad(out, [plane, y0, a1], [plane, y0, a0], [plane, y1, a0], [plane, y1, a1], col);
  else pushQuad(out, [plane, y0, a0], [plane, y0, a1], [plane, y1, a1], [plane, y1, a0], col);
}

export interface HouseFxCounts {
  /** Verts drawn with the night factor: smoke + dark panes. */
  nightVerts: number;
  /** All verts in the buffer (night segment + lit panes). */
  totalVerts: number;
  houses: number;
  chimneys: number;
  litHouses: number;
  smokeVerts: number;
}

/**
 * Emit the house fx for one frame into `out` (6 floats per vertex:
 * pos + rgb, the sky.ts convention). `out` must start empty; emission
 * never pushes past FX_MAX_VERTS total — a house whose smoke or panes
 * do not fit is skipped whole, deterministically (town first).
 * Layout: [smoke + dark panes][lit panes], so the caller draws the
 * first nightVerts with uNight and the rest with uNight=0.
 */
export function emitHouseFx(out: number[], inputs: HouseFxInput[], minutes: number, driftSec: number): HouseFxCounts {
  const base = out.length;
  const fits = (verts: number): boolean => (out.length - base) / 6 + verts <= FX_MAX_VERTS;
  const details = resolveHouseFx(inputs, minutes);
  let chimneys = 0, litHouses = 0, smokeVerts = 0;
  // Pass 1 — smoke + dark panes (drawn with the night factor).
  for (const r of details) {
    if (r.lit) litHouses++;
    if (r.top) {
      const cost = SMOKE_PUFFS_PER_CHIMNEY * 36;
      if (fits(cost)) {
        chimneys++;
        smokeVerts += cost;
        for (const p of smokePuffsFor(r.top, r.seedX0, r.seedY0, driftSec)) pushPuffBox(out, p);
      }
    }
    if (!r.lit) {
      for (const s of r.slots) {
        if (!fits(6)) break;
        pushPane(out, s.face, s.a, s.y, panePlaneFor(s.face, r.cx, r.cz, r.w, r.d), GLASS_DARK);
      }
    }
  }
  const nightVerts = (out.length - base) / 6;
  // Pass 2 — lit panes (drawn with uNight=0: self-luminous).
  for (const r of details) {
    if (!r.lit) continue;
    for (const s of r.slots) {
      if (!fits(6)) break;
      pushPane(out, s.face, s.a, s.y, panePlaneFor(s.face, r.cx, r.cz, r.w, r.d), GLASS_LIT);
    }
  }
  return { nightVerts, totalVerts: (out.length - base) / 6, houses: details.length, chimneys, litHouses, smokeVerts };
}
