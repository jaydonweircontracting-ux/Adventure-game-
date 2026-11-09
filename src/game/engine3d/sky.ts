// BUILD 1011: sun, moon, drifting clouds + day/night factor for the 3D sky.
//
// AUDIT (before coding):
// - Day/night curve is 976's dayNight.ts, reused EXACTLY (not copied):
//   full day 07:00-18:00 alpha 0, dawn 05:00-07:00 0.55->0, dusk 18:00-20:00
//   0->0.55, full night 20:00-05:00 alpha 0.55 cap, navy veil rgb(8,12,40).
//   The curve is a pure function of minute-of-day, so it applies unchanged
//   to the 3D clock. Rate comparison: the 2.5D clock advances 10 game
//   minutes per world tick (worldCore MINUTES_PER_TICK); the 3D clock
//   (993) advances 1 game minute per real second — a full 3D day lasts
//   24 real minutes, dawn/dusk ramps last 120 real seconds each. Slow
//   and gradual, like the 2.5D game; the 3D rate is unchanged (no clock
//   changes in this build).
// - Renderer (Engine3DWorldView): vertex-colour triangles ONLY, one
//   program, one matrix uniform; NO blending is enabled and the fragment
//   shader outputs vec4(v,1.0). So the night veil is NOT a transparent
//   quad (that would need blending): it is a `uNight` uniform mixed into
//   the fragment shader — mix(v, navy, uNight) is EXACTLY the 976 veil
//   composite (scene*(1-a) + navy*a), evaluated per frame from the clock
//   at zero geometry cost and no rebuilds. Sun/moon are drawn with
//   uNight=0 (self-luminous); clouds are drawn with uNight (they darken
//   like the sky). Fog is baked per-vertex elsewhere; sky objects are
//   emitted with raw colours and are never fogged (1007's figure rule).
// - Sun-path vs 988 baked shading: SUN_SHADE says the sun stands
//   northwest-high (north 1.00, west 0.90 brightest; south 0.75,
//   east 0.68 in shade). A Minecraft east-rise/west-set arc through the
//   SOUTH would contradict that shading. This module's arc therefore
//   runs east (rise) -> NORTH-high at noon -> west (set): at noon the
//   sun is in the northern sky, and in the afternoon it is northwest-
//   high — the same region the baked shading describes. Rise/set times
//   follow Minecraft's clock (06:00 / 18:00), which sits inside 976's
//   ramps (sunrise mid-dawn, sunset at dusk start). The moon runs the
//   opposite arc (18:00 rise east -> 00:00 north-high -> 06:00 set west).
// - Sky bodies sit 620 tiles from the camera eye: inside far plane 700,
//   beyond fog-full 600, far beyond any real object (max ~314). They are
//   camera-centred (like a skybox) so walking never leaves them behind.
// - Clouds: 7 distinct seeded slab shapes (flat blocky rectangles, the
//   Minecraft manner), fixed heights 64-90, drifting +x at 0.3 tiles/s,
//   wrapping at +-380 around the player. Shapes are defined by their
//   slab lists and never change while drifting; only the x offset moves.
// - Interiors (990): the entered hut renders floor + furniture with no
//   walls/roof/ceiling, so the sky background is visible from inside
//   today (pre-existing). The NEW sky objects are suppressed while
//   inside a house (emitSkyObjects returns empty when insideHut) — the
//   pre-existing gradient background is untouched. The night factor
//   still applies to the interior (it shares the world buffer and has
//   no separate lighting; a room dimming at night is the consistent
//   behaviour for an open-top room). Stated difference from 976, whose
//   interiors are a separate view and stay lit.

import { darknessAlphaForMinutes } from '../dayNight';
import { STARS, STAR_COUNT, STAR_VERTS_PER_STAR, STAR_COLOR, starAlphaForMinutes } from './atmosphere';

export type Vec3 = [number, number, number];

/** Sun rises at 06:00 (Minecraft clock), in minutes after midnight. */
export const SUN_RISE_MIN = 6 * 60;
/** Sun sets at 18:00. */
export const SUN_SET_MIN = 18 * 60;
/** Moon rises at 18:00, sets at 06:00. */
export const MOON_RISE_MIN = 18 * 60;
export const MOON_SET_MIN = 6 * 60;
/** Peak sun/moon elevation at noon/midnight, degrees. */
export const SKY_MAX_ELEV_DEG = 60;
/** Distance from the camera eye to sun/moon/clouds (far plane 700). */
export const SKY_BODY_DIST = 620;
/** Sun disc radius in tiles (subtends ~4.8 deg at 620). */
export const SUN_RADIUS = 26;
/** Moon disc radius in tiles. */
export const MOON_RADIUS = 20;
/** Triangle-fan segments per disc. */
export const SKY_DISC_SEGMENTS = 16;
/** Cloud drift speed, tiles per real second (+x only). */
export const CLOUD_DRIFT_TILES_PER_SEC = 0.3;
/** Cloud x wraps at +-this offset from the player. */
export const CLOUD_WRAP_HALF = 380;
/** Cloud slab thickness in tiles (flat slabs, Minecraft manner). */
export const CLOUD_SLAB_H = 2;
/** Night veil colour, 976's rgb(8,12,40) as 0..1 (for the uNight mix). */
export const NIGHT_NAVY: Vec3 = [8 / 255, 12 / 255, 40 / 255];
/** Sun disc colour (warm bright yellow). */
export const SUN_COLOR: Vec3 = [1.0, 0.88, 0.5];
/** Moon disc colour (pale blue-white). */
export const MOON_COLOR: Vec3 = [0.92, 0.94, 1.0];
/** Cloud face colours: top / sides / bottom. */
export const CLOUD_TOP: Vec3 = [0.98, 0.98, 1.0];
export const CLOUD_SIDE: Vec3 = [0.82, 0.84, 0.88];
export const CLOUD_BOTTOM: Vec3 = [0.62, 0.64, 0.68];

/** Night darkness factor for a minute-of-day value: exactly 976's curve. */
export function nightFactorForMinutes(minuteOfDay: number): number {
  return darknessAlphaForMinutes(minuteOfDay);
}

function normalizeMinutes(minuteOfDay: number): number {
  if (!Number.isFinite(minuteOfDay)) return 12 * 60;
  return ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
}

/**
 * Unit direction to a sky body on its rise->noon->set arc, for a day
 * fraction f in [0,1]: f=0 is the east horizon, f=0.5 is north-high at
 * SKY_MAX_ELEV_DEG, f=1 is the west horizon. North is -z, east is +x
 * (the 988 convention: north (-z) and west (-x) faces catch the sun).
 */
export function arcDirForFraction(f: number): Vec3 {
  const theta = Math.PI * Math.max(0, Math.min(1, f));
  const el = Math.sin(Math.PI * Math.max(0, Math.min(1, f))) * (SKY_MAX_ELEV_DEG * Math.PI / 180);
  const ce = Math.cos(el);
  return [ce * Math.cos(theta), Math.sin(el), -ce * Math.sin(theta)];
}

/** Unit direction to the sun, or null while it is below the horizon. */
export function sunDirForMinutes(minuteOfDay: number): Vec3 | null {
  const m = normalizeMinutes(minuteOfDay);
  if (m < SUN_RISE_MIN || m >= SUN_SET_MIN) return null;
  return arcDirForFraction((m - SUN_RISE_MIN) / (SUN_SET_MIN - SUN_RISE_MIN));
}

/** Unit direction to the moon, or null while it is below the horizon. */
export function moonDirForMinutes(minuteOfDay: number): Vec3 | null {
  const m = normalizeMinutes(minuteOfDay);
  if (m >= MOON_SET_MIN && m < MOON_RISE_MIN) return null;
  const g = (((m - MOON_RISE_MIN + 1440) % 1440) / (MOON_SET_MIN + 1440 - MOON_RISE_MIN));
  return arcDirForFraction(g);
}

// ---------------------------------------------------------------------------
// Clouds: 7 distinct seeded shapes. A cloud is 1-3 flat rectangular slabs
// at a fixed height; bx/bz is the base offset from the player, slabs are
// (dx,dz,w,d) rectangles relative to the cloud centre. Shapes never change
// while drifting — only the x offset moves (see cloudCentreX).
// ---------------------------------------------------------------------------

export interface CloudSlab { dx: number; dz: number; w: number; d: number }
export interface CloudDef { bx: number; bz: number; y: number; slabs: CloudSlab[] }

export const CLOUDS: CloudDef[] = [
  { bx: 180, bz: -120, y: 72, slabs: [{ dx: 0, dz: 0, w: 48, d: 14 }] },
  { bx: -220, bz: 80, y: 84, slabs: [{ dx: 0, dz: 0, w: 30, d: 12 }, { dx: 10, dz: 8, w: 20, d: 10 }] },
  { bx: 60, bz: 260, y: 64, slabs: [{ dx: 0, dz: 0, w: 30, d: 22 }] },
  { bx: -140, bz: -260, y: 78, slabs: [{ dx: 0, dz: 0, w: 24, d: 10 }, { dx: 12, dz: 6, w: 24, d: 10 }] },
  { bx: 300, bz: 40, y: 90, slabs: [{ dx: 0, dz: 0, w: 60, d: 8 }] },
  { bx: -320, bz: -60, y: 68, slabs: [{ dx: 0, dz: 0, w: 26, d: 26 }] },
  { bx: 120, bz: -300, y: 80, slabs: [{ dx: 0, dz: 0, w: 36, d: 10 }, { dx: 0, dz: 0, w: 10, d: 30 }] },
];

export const SKY_CLOUD_COUNT = CLOUDS.length;

/**
 * Maximum sky-object vertices in one frame: all cloud slabs (12 tris each)
 * + sun fan + moon fan + stars (one quad each). The view allocates the sky
 * buffer once at this size and re-uploads with bufferSubData (never
 * bufferData per frame — a per-frame reallocation stalls SwiftShader's
 * software pipeline).
 */
export const SKY_MAX_VERTS =
  CLOUDS.reduce((a, c) => a + c.slabs.length, 0) * 12 * 3 +
  2 * SKY_DISC_SEGMENTS * 3 +
  STAR_COUNT * STAR_VERTS_PER_STAR;

/** Wrap a value into [-CLOUD_WRAP_HALF, +CLOUD_WRAP_HALF). */
export function wrapCloudOffset(v: number): number {
  const span = CLOUD_WRAP_HALF * 2;
  return ((((v + CLOUD_WRAP_HALF) % span) + span) % span) - CLOUD_WRAP_HALF;
}

/** A cloud's x offset from the player after drifting for driftSec seconds. */
export function cloudCentreX(baseX: number, driftSec: number): number {
  return wrapCloudOffset(baseX + driftSec * CLOUD_DRIFT_TILES_PER_SEC);
}

// ---------------------------------------------------------------------------
// Emission: pushes 6-float vertices (pos + rgb) into `out`. Clouds first,
// then sun, then moon, so the caller can draw clouds with the night factor
// and sun/moon with uNight=0 (self-luminous) in two draw calls.
// Returns vertex counts {cloudVerts, totalVerts}.
// ---------------------------------------------------------------------------

function pushTri(out: number[], a: Vec3, b: Vec3, c: Vec3, col: Vec3): void {
  out.push(a[0], a[1], a[2], col[0], col[1], col[2]);
  out.push(b[0], b[1], b[2], col[0], col[1], col[2]);
  out.push(c[0], c[1], c[2], col[0], col[1], col[2]);
}

function pushSlab(out: number[], cx: number, y: number, cz: number, w: number, d: number): void {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y + CLOUD_SLAB_H;
  // Top (+y), bottom (-y), then the four sides (north -z, south +z, west -x, east +x).
  pushTri(out, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], CLOUD_TOP);
  pushTri(out, [x0, y1, z1], [x1, y1, z0], [x0, y1, z0], CLOUD_TOP);
  pushTri(out, [x0, y, z0], [x1, y, z0], [x1, y, z1], CLOUD_BOTTOM);
  pushTri(out, [x0, y, z0], [x1, y, z1], [x0, y, z1], CLOUD_BOTTOM);
  pushTri(out, [x0, y, z0], [x1, y, z0], [x1, y1, z0], CLOUD_SIDE);
  pushTri(out, [x0, y, z0], [x1, y1, z0], [x0, y1, z0], CLOUD_SIDE);
  pushTri(out, [x1, y, z1], [x0, y, z1], [x0, y1, z1], CLOUD_SIDE);
  pushTri(out, [x1, y, z1], [x0, y1, z1], [x1, y1, z1], CLOUD_SIDE);
  pushTri(out, [x0, y, z1], [x0, y, z0], [x0, y1, z0], CLOUD_SIDE);
  pushTri(out, [x0, y, z1], [x0, y1, z0], [x0, y1, z1], CLOUD_SIDE);
  pushTri(out, [x1, y, z0], [x1, y, z1], [x1, y1, z1], CLOUD_SIDE);
  pushTri(out, [x1, y, z0], [x1, y1, z1], [x1, y1, z0], CLOUD_SIDE);
}

/**
 * Billboard basis for a sky body facing `fwd`: right = normalize(cross
 * (up, fwd)) = (fwd.z, 0, -fwd.x); up = cross(right, fwd). (CULL_FACE
 * is disabled in the view, so fan/quad winding is irrelevant.)
 */
function billboardBasis(fwd: Vec3): { right: Vec3; up: Vec3 } {
  const right: Vec3 = [fwd[2], 0, -fwd[0]];
  const rl = Math.hypot(right[0], right[1], right[2]) || 1;
  right[0] /= rl; right[1] /= rl; right[2] /= rl;
  const up: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  return { right, up };
}

function pushDisc(out: number[], eye: Vec3, dir: Vec3, radius: number, col: Vec3): void {
  const c: Vec3 = [eye[0] + dir[0] * SKY_BODY_DIST, eye[1] + dir[1] * SKY_BODY_DIST, eye[2] + dir[2] * SKY_BODY_DIST];
  // Billboard basis: the fan plane is perpendicular to the view direction.
  const { right, up } = billboardBasis(dir);
  const pts: Vec3[] = [];
  for (let i = 0; i < SKY_DISC_SEGMENTS; i++) {
    const a = (i / SKY_DISC_SEGMENTS) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    pts.push([
      c[0] + (right[0] * ca + up[0] * sa) * radius,
      c[1] + (right[1] * ca + up[1] * sa) * radius,
      c[2] + (right[2] * ca + up[2] * sa) * radius,
    ]);
  }
  for (let i = 0; i < SKY_DISC_SEGMENTS; i++) {
    pushTri(out, c, pts[i], pts[(i + 1) % SKY_DISC_SEGMENTS], col);
  }
}

export interface SkyEmitCounts { cloudVerts: number; totalVerts: number; starVerts: number; }

/**
 * Emit the 3D sky objects for one frame. `eye` is the camera eye position
 * (orbit eye or first-person eye); px/pz is the player tile centre.
 * Returns vertex counts so the caller can draw clouds (night factor) and
 * sun/moon/stars (uNight=0) in two calls. While inside a house, emits
 * nothing. BUILD 1052: stars ride the uNight=0 segment (self-luminous,
 * the sun/moon precedent) and are emitted only while starAlpha is
 * above ~0, so daylight has no dark specks.
 */
export function emitSkyObjects(
  out: number[], eye: Vec3, px: number, pz: number,
  minutes: number, driftSec: number, insideHut: boolean,
): SkyEmitCounts {
  if (insideHut) return { cloudVerts: 0, totalVerts: 0, starVerts: 0 };
  const start = out.length;
  for (const cl of CLOUDS) {
    const cx = px + cloudCentreX(cl.bx, driftSec);
    const cz = pz + cl.bz;
    for (const s of cl.slabs) pushSlab(out, cx + s.dx, cl.y, cz + s.dz, s.w, s.d);
  }
  const cloudVerts = (out.length - start) / 6;
  const sun = sunDirForMinutes(minutes);
  if (sun) pushDisc(out, eye, sun, SUN_RADIUS, SUN_COLOR);
  const moon = moonDirForMinutes(minutes);
  if (moon) pushDisc(out, eye, moon, MOON_RADIUS, MOON_COLOR);
  // BUILD 1052: stars — small billboard quads on the celestial sphere,
  // camera-centred like the sun/moon. Colour scales with starAlpha, so
  // they fade in as night deepens and out by dawn; below the threshold
  // nothing is emitted at all.
  const starStart = out.length;
  const alpha = starAlphaForMinutes(minutes);
  if (alpha > 0.03) {
    for (const st of STARS) {
      const { right, up } = billboardBasis(st.dir);
      const c: Vec3 = [eye[0] + st.dir[0] * SKY_BODY_DIST, eye[1] + st.dir[1] * SKY_BODY_DIST, eye[2] + st.dir[2] * SKY_BODY_DIST];
      const h = st.size / 2;
      const col: Vec3 = [STAR_COLOR[0] * st.bright * alpha, STAR_COLOR[1] * st.bright * alpha, STAR_COLOR[2] * st.bright * alpha];
      const p00: Vec3 = [c[0] - right[0] * h - up[0] * h, c[1] - right[1] * h - up[1] * h, c[2] - right[2] * h - up[2] * h];
      const p10: Vec3 = [c[0] + right[0] * h - up[0] * h, c[1] + right[1] * h - up[1] * h, c[2] + right[2] * h - up[2] * h];
      const p11: Vec3 = [c[0] + right[0] * h + up[0] * h, c[1] + right[1] * h + up[1] * h, c[2] + right[2] * h + up[2] * h];
      const p01: Vec3 = [c[0] - right[0] * h + up[0] * h, c[1] - right[1] * h + up[1] * h, c[2] - right[2] * h + up[2] * h];
      pushTri(out, p00, p10, p11, col);
      pushTri(out, p00, p11, p01, col);
    }
  }
  return { cloudVerts, totalVerts: (out.length - start) / 6, starVerts: (out.length - starStart) / 6 };
}
