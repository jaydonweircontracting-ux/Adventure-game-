/**
 * BUILD 1084 (1.5): climate + seasons — the world gains real
 * seasons, temperature, and rainfall that change how fast things
 * grow.
 *
 * The season is a pure function of the day: the 2.5D
 * `WorldClockState` season model (worldCore.ts seasonForDay — a
 * 360-day year, four 90-day seasons, Day 1 = spring) is PORTED by
 * reference, not duplicated — this module re-exports seasonForDay
 * and builds on it. There is no second clock: the 3D DayClock
 * { minutes, day } already persists (ag-3d-clock-v1), so the season
 * persists with it — a save in autumn reloads in autumn because
 * the day persists.
 *
 * What the season changes (all pure functions of (season, tile)):
 * - farm growth: the season factor multiplies the soil factor
 *   (1.4) — the farm's effective growth factor is soil × season,
 *   exposed through the 1.1 adapter (livingWorld.growthFactorAt).
 *   Spring is 1.0, so the camp farm on Day 1 grows exactly as
 *   before and the M1069 24h numbers do not move.
 * - tree regrowth: the forest's daily logistic gain is scaled by
 *   the same seasonal rate (livingWorld.advanceLivingWorldDay).
 * - animal activity: animals step less often in winter (the
 *   900ms animal tick skips steps by a deterministic phase).
 * - rain: rainfall is a real amount (mm/day), and the visual
 *   rain's streak count scales with it — wet seasons rain harder.
 *
 * This module is pure (no I/O, no imports from the view or the
 * simulation tick) — the adapter (livingWorld.ts) exposes it, and
 * the farm/animal/render callers read it through the adapter.
 */
import { seasonForDay, type WorldSeason } from '../worldCore';
import { hash2 } from '../iso/isoWorld';

/** A season of the 360-day year (worldCore). */
export type Season = WorldSeason;
export { seasonForDay };

/** A year is 360 days (worldCore), four seasons of 90 days. */
export const SEASON_DAYS = 90;
/** The four seasons, in year order. */
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
/** HUD emoji per season. */
export const SEASON_EMOJI: Record<Season, string> = { spring: '🌱', summer: '☀️', autumn: '🍂', winter: '❄️' };

/** Capitalised season name for the HUD ("Spring"). */
export function seasonLabel(season: Season): string {
  return season.charAt(0).toUpperCase() + season.slice(1);
}

/** HUD readout for a day ("🌱 Spring"). */
export function seasonLabelFor(day: number): string {
  const s = seasonForDay(day);
  return SEASON_EMOJI[s] + ' ' + seasonLabel(s);
}

/** Day of the season, 1..90 — the season's progress. */
export function dayInSeason(day: number): number {
  const d = (((Math.floor(day) - 1) % 360) + 360) % 360;
  return (d % SEASON_DAYS) + 1;
}

/**
 * Farm growth + tree regrowth multiplier by season. Spring is
 * 1.0 — the M1069 24h test runs Day 1 (spring), so the settlement
 * numbers do not move. Summer speeds growth, winter slows it to
 * half speed. At neutral soil (factor 1.0) a farm is ready in
 * 180 game-minutes in spring, 144 in summer, 360 in winter.
 */
export const SEASON_GROWTH: Record<Season, number> = { spring: 1, summer: 1.25, autumn: 0.8, winter: 0.5 };

/** Farm growth multiplier for a season. */
export function seasonGrowthFactor(season: Season): number {
  return SEASON_GROWTH[season];
}

/** Tree regrowth multiplier for a season — the same seasonal
 *  rate as farm growth (the forest regrows at the season's pace). */
export function seasonRegrowthFactor(season: Season): number {
  return SEASON_GROWTH[season];
}

/**
 * Animal activity multiplier by season — how often animals step.
 * Winter animals move about half as often; summer animals are
 * slightly livelier. Spring is 1.0 (unchanged).
 */
export const SEASON_ACTIVITY: Record<Season, number> = { spring: 1, summer: 1.1, autumn: 0.9, winter: 0.6 };

/** Animal activity multiplier for a season. */
export function animalActivityFactor(season: Season): number {
  return SEASON_ACTIVITY[season];
}

/**
 * Ticks between animal steps for an activity factor: 1 = every
 * 900ms tick, 2 = every other tick. Deterministic per (tick,
 * animal seed) — an animal with an even seed moves on even ticks
 * in winter, so the forest does not freeze in lockstep.
 */
export function animalStepPeriod(activityFactor: number): number {
  if (!Number.isFinite(activityFactor) || activityFactor <= 0) return 2;
  return Math.max(1, Math.round(1 / activityFactor));
}

/** Mean temperature by season (°C) at the camp's latitude/height. */
export const SEASON_BASE_TEMP_C: Record<Season, number> = { spring: 12, summer: 22, autumn: 10, winter: -2 };
/** North (low y) is colder: ±3°C across the 200-tile map. */
export const TEMP_LATITUDE_C_PER_TILE = 0.03;
/** Height cools the air: -2°C per unit of ground elevation. */
export const TEMP_ELEVATION_C_PER_UNIT = 2.0;

/**
 * Temperature at a tile (°C): the season's base, colder toward
 * the north (low y) and colder with height. Pure — the same
 * (season, tile, elevation) always gives the same temperature.
 */
export function temperatureFor(season: Season, x: number, y: number, elevation: number): number {
  const base = SEASON_BASE_TEMP_C[season];
  const lat = (y - 100) * TEMP_LATITUDE_C_PER_TILE;
  const elev = -Math.max(0, elevation) * TEMP_ELEVATION_C_PER_UNIT;
  return base + lat + elev;
}

/** Mean rainfall by season (mm/day) at the camp. Autumn is the
 *  wettest, summer the driest. */
export const SEASON_BASE_RAIN_MM: Record<Season, number> = { spring: 3.0, summer: 2.0, autumn: 4.0, winter: 2.5 };

/**
 * Rainfall at a tile (mm/day): the season's base, varying
 * deterministically per tile (±20% by hash) and rising with
 * height (orographic — mountains catch more rain). Pure — the
 * same (season, tile, elevation) always gives the same amount.
 */
export function rainfallFor(season: Season, x: number, y: number, elevation: number): number {
  const seasonIndex = SEASONS.indexOf(season);
  const variation = 0.8 + 0.4 * hash2(x, y, 100 + seasonIndex);
  const orographic = Math.max(0, elevation) * 0.3;
  return Math.max(0.5, SEASON_BASE_RAIN_MM[season] * variation + orographic);
}

/**
 * Rain streak multiplier for the visual rain (atmosphere.ts):
 * rainfall/4 clamped to [0.25, 1] — autumn rains at full
 * strength (120 streaks), summer at about half. Never above 1:
 * the rain buffer holds 120 streaks (1440 verts) and must not
 * overflow.
 */
export function rainIntensityFor(season: Season, x: number, y: number, elevation: number): number {
  return Math.max(0.25, Math.min(1, rainfallFor(season, x, y, elevation) / 4));
}

/** Season-change arrival message (the HUD message line). */
export function seasonArrivalMessage(season: Season): string {
  switch (season) {
    case 'spring': return '🌱 Spring has arrived — the fields quicken.';
    case 'summer': return '☀️ Summer has arrived — wheat grows fast now.';
    case 'autumn': return '🍂 Autumn has arrived — wheat grows slower now.';
    case 'winter': return '❄️ Winter has arrived — growth slows to a crawl.';
  }
}
