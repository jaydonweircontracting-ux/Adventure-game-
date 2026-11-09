// BUILD 1052: Ashfall Stage 6 — atmosphere.
//
// AUDIT (Stage 1, §1.5 + §Stage 6): night reads as overcast day at full
// uNight (0.55 cap); all 29 houses lit 19:30-21:30 every evening; no
// stars, weather, or dawn/dusk grading. The sky gradient is a fixed
// background; dawn/dusk do not warm the horizon. SUN_SHADE is baked
// northwest-high while the sky sun travels east -> north -> west.
//
// MECHANISM (decided, stated):
// - Night depth: the 976 curve (dayNight.ts) is SHARED with the 2.5D
//   game and is NOT touched. The 3D view gets its own factor here with
//   the SAME phase boundaries and linear ramps (dawn 05:00-07:00, dusk
//   18:00-20:00, night 20:00-05:00) but a deeper cap, 0.82 instead of
//   0.55. At 0.82, mixed ground luminance at midnight is ~25% of noon
//   (the Stage 6 acceptance is <=50%); at the old 0.55 it was ~50%,
//   which is why night read as overcast day. The sky gradient quad and
//   the clear colour are ALSO functions of the clock now (they were a
//   fixed light-blue background — the other half of "overcast day").
//   Figures, the car, and corpses keep the OLD 0.55 cap (FIGURE_NIGHT_
//   CAP): people are gameplay-critical markers and must stay readable
//   at night, the 976 rationale, applied per draw segment — the view
//   sets uNight to the figure cap after the world/sky/fx passes.
// - Stars: 120 deterministic quads on the celestial sphere (camera-
//   centred at SKY_BODY_DIST, the sun/moon precedent), emitted by
//   sky.ts into the uNight=0 segment. Their brightness follows
//   starAlpha (0 at day, 1 at deep night) and they are not emitted at
//   all while alpha is ~0, so no dark specks in daylight. No alpha
//   blending exists, so "fade" is colour scale + emission gating.
// - Dawn/dusk grading: the gradient's horizon warms (gold-pink at
//   dawn, deep orange-red at dusk — distinguishable by colour) on a
//   C1 envelope (smoothstep-squared: value AND slope are 0 at both
//   ramp ends, so no pops). A uWarm uniform warms the WORLD the same
//   way (the fragment shader multiplies v toward (1.0,0.72,0.45));
//   it is set to 0 for the self-luminous segments, the uNight=0
//   precedent. Sun-follow shading (SUN_SHADE following the sun's arc)
//   is NOT built: the world buffer carries no normal attribute, so
//   the fragment shader cannot tell which face a fragment belongs to
//   — a true sun-follow would need a buffer-format change. The uWarm
//   tint is the honest substitute: the light warms/cools with the
//   clock even though the baked direction stays put.
// - Evening stagger: NOT in this module — it lives in houseFx.ts's
//   lightScheduleFor (a 4th, earlier off bucket). Lanterns and the
//   1050 hearth use the same function, so they inherit the stagger.
// - Rain (stretch, built): deterministic by (day, minutes) — days
//   where day % 3 === 1, 14:00-16:00 — 120 crossed-quad streaks in a
//   44-tile box around the player, falling 12 tiles/s, drawn with the
//   night factor. Visual only: it changes no spawn, shop, quest, or
//   combat rule. Pure functions of (day, minutes, driftSec), so the
//   probe can setClock to a rain afternoon and see it.
// - Cost: gradient upload is 6 verts/frame (bufferSubData, the 1011
//   pattern); stars are <=720 verts in the pre-allocated sky buffer;
//   rain is <=1440 verts in its own pre-allocated buffer, drawn only
//   while raining. No per-frame scan of any record (the 1050 lesson:
//   worldGardenKey re-scanned the 1,328-key terrain record per call).

import { hash2, SKY_TOP, SKY_HORIZON } from './townLook';

export type Vec3 = [number, number, number];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** Smoothstep 0->1 (C1: value and slope are 0 at both ends). */
const smooth = (t: number): number => { const x = clamp01(t); return x * x * (3 - 2 * x); };
/** C1 bump envelope: 0 at both ends (value AND slope), 1 at the middle. */
const bump = (p: number): number => { const s = smooth(p); return 4 * s * (1 - s); };

function normalizeMinutes(minuteOfDay: number): number {
  if (!Number.isFinite(minuteOfDay)) return 12 * 60;
  return ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
}

// ---------------------------------------------------------------------------
// Night depth — 976's phases and ramps, deeper cap (3D only).
// ---------------------------------------------------------------------------

/** Dawn starts (night ends) at 05:00. */
export const ATM_DAWN_START_MIN = 5 * 60;
/** Full daylight begins at 07:00. */
export const ATM_DAY_START_MIN = 7 * 60;
/** Full daylight ends at 18:00. */
export const ATM_DAY_END_MIN = 18 * 60;
/** Full night begins at 20:00. */
export const ATM_NIGHT_START_MIN = 20 * 60;
/** Maximum 3D night darkness — 0.82 (976's shared cap stays 0.55). */
export const NIGHT_3D_MAX_ALPHA = 0.82;
/** Figures, the car, and corpses keep the old 0.55 cap so people stay
 *  readable at night (the 976 rationale, per draw segment). */
export const FIGURE_NIGHT_CAP = 0.55;

/**
 * 3D darkness factor for a minute-of-day value: 0 at full day, 0.82 at
 * full night, linear across the two 2-hour ramps. Continuous at every
 * boundary (dawn start = night cap, dawn end = 0, dusk start = 0,
 * dusk end = cap) — the same curve shape as 976, deeper.
 */
export function nightFactor3dForMinutes(minuteOfDay: number): number {
  const m = normalizeMinutes(minuteOfDay);
  if (m >= ATM_NIGHT_START_MIN || m < ATM_DAWN_START_MIN) return NIGHT_3D_MAX_ALPHA;
  if (m >= ATM_DAY_START_MIN && m < ATM_DAY_END_MIN) return 0;
  if (m < ATM_DAY_START_MIN) {
    return NIGHT_3D_MAX_ALPHA * (1 - (m - ATM_DAWN_START_MIN) / (ATM_DAY_START_MIN - ATM_DAWN_START_MIN));
  }
  return NIGHT_3D_MAX_ALPHA * ((m - ATM_DAY_END_MIN) / (ATM_NIGHT_START_MIN - ATM_DAY_END_MIN));
}

/** Night depth 0..1 (0 = full day, 1 = full night). */
export function nightDepthForMinutes(minuteOfDay: number): number {
  return nightFactor3dForMinutes(minuteOfDay) / NIGHT_3D_MAX_ALPHA;
}

// ---------------------------------------------------------------------------
// Sky gradient — a function of the clock (was a fixed background).
// ---------------------------------------------------------------------------

/** Night sky top: deep navy, darker than the 976 veil colour. */
export const NIGHT_SKY_TOP: Vec3 = [0.02, 0.03, 0.10];
/** Night horizon: dark navy, lighter than the top so the horizon
 *  still reads against the stars. */
export const NIGHT_SKY_HORIZON: Vec3 = [0.05, 0.07, 0.18];
/** Dawn horizon warmth: soft gold-pink. */
export const DAWN_WARM: Vec3 = [1.0, 0.65, 0.42];
/** Dusk horizon warmth: deeper orange-red (dusk is warmer than dawn,
 *  so the two are distinguishable by colour alone). */
export const DUSK_WARM: Vec3 = [0.98, 0.48, 0.26];
/** Warm tint applied to the world at dawn/dusk (uWarm). */
export const WARM_TINT: Vec3 = [1.0, 0.72, 0.45];
/** How far the world warms at peak dawn/dusk (multiplied by warm). */
export const WARM_STRENGTH = 0.45;

export interface SkyGradient { top: Vec3; horizon: Vec3; warm: number; }

/**
 * The sky gradient for a minute-of-day value. Top lerps day<->night
 * by night depth; the horizon does the same, then warms toward the
 * dawn/dusk colour on a C1 envelope that peaks mid-ramp (0 at both
 * ramp ends, so the colour is exactly the day/night colour at every
 * boundary — no pops). `warm` (0..1) is the same envelope, for the
 * uWarm world tint.
 */
export function skyGradientForMinutes(minuteOfDay: number): SkyGradient {
  const m = normalizeMinutes(minuteOfDay);
  const depth = nightDepthForMinutes(m);
  const top = lerp3(SKY_TOP, NIGHT_SKY_TOP, depth);
  let horizon = lerp3(SKY_HORIZON, NIGHT_SKY_HORIZON, depth);
  let warm = 0;
  if (m >= ATM_DAWN_START_MIN && m < ATM_DAY_START_MIN) {
    const p = (m - ATM_DAWN_START_MIN) / (ATM_DAY_START_MIN - ATM_DAWN_START_MIN);
    warm = bump(p);
    horizon = lerp3(horizon, DAWN_WARM, warm * 0.9);
  } else if (m >= ATM_DAY_END_MIN && m < ATM_NIGHT_START_MIN) {
    const p = (m - ATM_DAY_END_MIN) / (ATM_NIGHT_START_MIN - ATM_DAY_END_MIN);
    warm = bump(p);
    horizon = lerp3(horizon, DUSK_WARM, warm * 0.9);
  }
  return { top, horizon, warm };
}

// ---------------------------------------------------------------------------
// Stars — 120 deterministic quads on the celestial sphere.
// ---------------------------------------------------------------------------

/** Stars in the field. */
export const STAR_COUNT = 120;
/** Verts per star (one quad). */
export const STAR_VERTS_PER_STAR = 6;
/** Star base colour: blue-white. */
export const STAR_COLOR: Vec3 = [0.9, 0.93, 1.0];

export interface StarDef {
  /** Unit direction from the eye (upper hemisphere only). */
  dir: Vec3;
  /** Quad size in tiles at SKY_BODY_DIST. */
  size: number;
  /** Brightness tier 0.55 / 0.8 / 1.0. */
  bright: number;
}

/**
 * The star field, generated once from fixed seeds (hash2 of the index
 * — no Math.random, so the same night shows the same sky on every
 * load). Uniform over the upper hemisphere, elevation >= ~8.6 deg so
 * no star sits behind the terrain.
 */
function buildStars(): StarDef[] {
  const out: StarDef[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const u = hash2(i * 1.37 + 3.1, 7.7);
    const v = hash2(i * 2.91 + 11.3, 3.1);
    const az = u * Math.PI * 2;
    const sinEl = 0.15 + 0.85 * v;
    const cosEl = Math.sqrt(Math.max(0, 1 - sinEl * sinEl));
    const h = hash2(i * 4.73 + 5.9, 9.4);
    out.push({
      dir: [cosEl * Math.cos(az), sinEl, -cosEl * Math.sin(az)],
      size: 2.5 + 2.5 * hash2(i * 1.19 + 2.7, 6.3),
      bright: h < 0.6 ? 0.55 : h < 0.9 ? 0.8 : 1.0,
    });
  }
  return out;
}

export const STARS: StarDef[] = buildStars();

/**
 * Star brightness 0..1: 0 at full day, 1 at deep night, smooth across
 * the ramps (smoothstep on night depth — stars are subtle at dusk and
 * full at midnight, and fade out by dawn). Stars are not emitted at
 * all while this is ~0 (see sky.ts), so daylight has no dark specks.
 */
export function starAlphaForMinutes(minuteOfDay: number): number {
  return smooth((nightDepthForMinutes(minuteOfDay) - 0.15) / 0.6);
}

// ---------------------------------------------------------------------------
// Rain — deterministic afternoons (visual only).
// ---------------------------------------------------------------------------

/** Rain falls on days where day % RAIN_DAY_MOD === RAIN_DAY_REM. */
export const RAIN_DAY_MOD = 3;
export const RAIN_DAY_REM = 1;
/** Rain window, minutes after midnight: 14:00-16:00. */
export const RAIN_START_MIN = 14 * 60;
export const RAIN_END_MIN = 16 * 60;
/** Streaks in the rain box. */
export const RAIN_STREAKS = 120;
/** Verts per streak (two crossed quads). */
export const RAIN_VERTS_PER_STREAK = 12;
/** Rain streak colour: pale slate (drawn with uNight, so it darkens
 *  at night like everything else in the night segment). */
export const RAIN_COLOR: Vec3 = [0.62, 0.68, 0.78];
/** Streak fall speed, tiles per real second. */
export const RAIN_FALL_TILES_PER_SEC = 12;
/** Streak length, tiles. */
export const RAIN_STREAK_LEN = 1.5;
/** Half-width of the rain box around the player, tiles. */
export const RAIN_BOX_HALF = 22;
/** Streaks fall through this band above the ground under the player. */
export const RAIN_FALL_H = 8;

export interface RainState { raining: boolean; }

/** True when it rains on this (day, minute-of-day). Pure: the same
 *  day and time always give the same answer. */
export function rainForMinutes(day: number, minuteOfDay: number): boolean {
  const d = Number.isFinite(day) ? Math.floor(day) : 1;
  const m = normalizeMinutes(minuteOfDay);
  return d % RAIN_DAY_MOD === RAIN_DAY_REM && m >= RAIN_START_MIN && m < RAIN_END_MIN;
}

/**
 * Emit the rain streaks for one frame into `out` (6 floats per vertex:
 * pos + rgb, the sky.ts convention). Streaks live in a 44-tile box
 * around (px, pz) at heights baseY+1..baseY+9, falling 12 tiles/s on
 * the drift clock (each streak recycles at a seeded phase, the smoke
 * precedent — individual wraps are invisible among 120 streaks).
 * Two crossed quads per streak so it reads from any orbit yaw; a
 * slight +x slant at the top for the wind. Pure: same inputs give
 * the same streaks.
 */
export function emitRainStreaks(out: number[], px: number, pz: number, baseY: number, driftSec: number): number {
  const start = out.length;
  const frac = (v: number): number => v - Math.floor(v);
  for (let i = 0; i < RAIN_STREAKS; i++) {
    const sx = hash2(i * 1.71 + 4.2, 8.8);
    const sz = hash2(i * 2.33 + 9.6, 1.4);
    const sPhase = hash2(i * 3.57 + 2.2, 5.5);
    const cx = px + (frac(sx + driftSec * 0.3 / (RAIN_BOX_HALF * 2)) * (RAIN_BOX_HALF * 2) - RAIN_BOX_HALF);
    const cz = pz + (sz * (RAIN_BOX_HALF * 2) - RAIN_BOX_HALF);
    const top = baseY + 1 + frac(sPhase + (driftSec * RAIN_FALL_TILES_PER_SEC) / RAIN_FALL_H) * RAIN_FALL_H;
    const y0 = top - RAIN_STREAK_LEN, y1 = top;
    const w = 0.04, slant = 0.2;
    // Quad 1 (X-Y plane), quad 2 (Z-Y plane) — a crossed pair.
    const q = (ax: number, az: number, bx: number, bz: number): void => {
      out.push(ax, y0, az, RAIN_COLOR[0], RAIN_COLOR[1], RAIN_COLOR[2]);
      out.push(bx, y0, bz, RAIN_COLOR[0], RAIN_COLOR[1], RAIN_COLOR[2]);
      out.push(bx + slant, y1, bz, RAIN_COLOR[0], RAIN_COLOR[1], RAIN_COLOR[2]);
      out.push(ax, y0, az, RAIN_COLOR[0], RAIN_COLOR[1], RAIN_COLOR[2]);
      out.push(bx + slant, y1, bz, RAIN_COLOR[0], RAIN_COLOR[1], RAIN_COLOR[2]);
      out.push(ax + slant, y1, az, RAIN_COLOR[0], RAIN_COLOR[1], RAIN_COLOR[2]);
    };
    q(cx - w, cz, cx + w, cz);
    q(cx, cz - w, cx, cz + w);
  }
  return (out.length - start) / 6;
}
