// BUILD 976: Day/night cycle — visual darkness driven by the EXISTING world
// clock (src/game/worldCore.ts). No second clock: callers pass
// clock.minuteOfDay (0..1439, authoritative — clock.hour is derived from it)
// and get back a darkness alpha for the field overlay.
//
// Curve (in-game hours, linear ramps, single navy veil):
//   Full day   07:00–18:00  alpha 0.00
//   Dawn ramp  05:00–07:00  alpha 0.55 -> 0.00 (linear, 12 world ticks)
//   Dusk ramp  18:00–20:00  alpha 0.00 -> 0.55 (linear, 12 world ticks)
//   Full night 20:00–05:00  alpha 0.55 (the cap — see below)
// Maximum night darkness is 0.55, not 1.0: at full night 45% of the scene's
// light still comes through, so the player, NPCs, doors and path endpoints
// stay visible without any extra light source. Gameplay-critical markers
// get a second guarantee: the overlay is drawn in the iso field canvas
// BEFORE the floating combat text pass, so damage numbers sit above the
// veil, and all DOM prompts (Enter door, HUD, dialogue, minimap) live above
// the canvas entirely and are never veiled at all.
// Scope: field view (iso) only. Interiors are EXEMPT — they have their own
// lighting and the field canvas is hidden behind the interior view, so the
// iso renderer forces alpha to 0 while inInterior. The atlas/minimap are
// EXEMPT — the atlas is a parchment map UI, not the live world, and a veil
// over it would only hide navigation info; the minimap is a navigation aid
// for the same reason. Visual cycle ONLY: darkness changes no spawn, shop,
// quest, sneak, XP, or combat rule anywhere (audit: the only pre-existing
// night-aware gameplay is animal sleep via behaviors.ts isNight and the
// one-direction traveler rule in travelers.ts — both untouched).

import type { WorldClockState } from './worldCore';

/** Dawn starts (night ends) at 05:00, in minutes after midnight. */
export const DAY_NIGHT_DAWN_START_MIN = 5 * 60;
/** Full daylight begins at 07:00. */
export const DAY_NIGHT_DAY_START_MIN = 7 * 60;
/** Full daylight ends at 18:00. */
export const DAY_NIGHT_DAY_END_MIN = 18 * 60;
/** Full night begins at 20:00. */
export const DAY_NIGHT_NIGHT_START_MIN = 20 * 60;
/** Maximum night darkness alpha — the readability cap (0.55). */
export const DAY_NIGHT_MAX_ALPHA = 0.55;
/** Veil colour (deep night blue); alpha comes from the curve. */
export const DAY_NIGHT_VEIL_RGB = '8,12,40';

export type DayNightPhase = 'day' | 'dawn' | 'dusk' | 'night';

function normalizeMinutes(minuteOfDay: number): number {
  if (!Number.isFinite(minuteOfDay)) return 12 * 60;
  return ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
}

/** Phase of the cycle for a minute-of-day value. Boundaries belong to the
 *  phase they start: 05:00 is dawn, 07:00 is day, 18:00 is dusk, 20:00 night. */
export function dayNightPhaseForMinutes(minuteOfDay: number): DayNightPhase {
  const m = normalizeMinutes(minuteOfDay);
  if (m >= DAY_NIGHT_NIGHT_START_MIN || m < DAY_NIGHT_DAWN_START_MIN) return 'night';
  if (m < DAY_NIGHT_DAY_START_MIN) return 'dawn';
  if (m < DAY_NIGHT_DAY_END_MIN) return 'day';
  return 'dusk';
}

/**
 * Darkness alpha for a minute-of-day value: 0 at full day, 0.55 at full
 * night, linear across the two 2-hour ramps. Continuous at every boundary
 * (dawn start = night cap, dawn end = 0, dusk start = 0, dusk end = cap).
 */
export function darknessAlphaForMinutes(minuteOfDay: number): number {
  const m = normalizeMinutes(minuteOfDay);
  if (m >= DAY_NIGHT_NIGHT_START_MIN || m < DAY_NIGHT_DAWN_START_MIN) return DAY_NIGHT_MAX_ALPHA;
  if (m >= DAY_NIGHT_DAY_START_MIN && m < DAY_NIGHT_DAY_END_MIN) return 0;
  if (m < DAY_NIGHT_DAY_START_MIN) {
    // Dawn: 05:00 -> 0.55, 07:00 -> 0.
    return DAY_NIGHT_MAX_ALPHA * (1 - (m - DAY_NIGHT_DAWN_START_MIN) / (DAY_NIGHT_DAY_START_MIN - DAY_NIGHT_DAWN_START_MIN));
  }
  // Dusk: 18:00 -> 0, 20:00 -> 0.55.
  return DAY_NIGHT_MAX_ALPHA * ((m - DAY_NIGHT_DAY_END_MIN) / (DAY_NIGHT_NIGHT_START_MIN - DAY_NIGHT_DAY_END_MIN));
}

/** Darkness alpha driven by the existing world clock (uses minuteOfDay). */
export function darknessAlphaForClock(clock: WorldClockState): number {
  return darknessAlphaForMinutes(clock.minuteOfDay);
}

/** Phase driven by the existing world clock. */
export function dayNightPhaseForClock(clock: WorldClockState): DayNightPhase {
  return dayNightPhaseForMinutes(clock.minuteOfDay);
}

/** Canvas fill style for a darkness alpha (alpha 0 => fully transparent). */
export function darknessOverlayFill(alpha: number): string {
  const a = Math.max(0, Math.min(DAY_NIGHT_MAX_ALPHA, alpha));
  return `rgba(${DAY_NIGHT_VEIL_RGB},${a})`;
}

/** HUD glyph for a phase: sun / sunrise / sunset / moon. */
export function dayNightGlyphForPhase(phase: DayNightPhase): string {
  switch (phase) {
    case 'day': return '☀';
    case 'dawn': return '🌅';
    case 'dusk': return '🌇';
    case 'night': return '🌙';
  }
}
