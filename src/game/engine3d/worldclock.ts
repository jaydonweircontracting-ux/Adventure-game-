/**
 * BUILD 1056 — world clock + wait system for the 3D view (pure part).
 *
 * AUDIT (2026-11-15, traced before any code):
 *
 * 1. TIME SOURCE — the 3D day clock already exists (BUILD 993): `DayClock
 *    { minutes, day }` in townsfolk3d.ts, persisted under 'ag-3d-clock-v1'
 *    (`loadClock` / `saveClock`), default 08:00 day 1. The view ticks it
 *    1 game minute per real second and persists every tick. Sky, night
 *    factor, dawn/dusk grading, stars, house light schedules, hearth
 *    glow, lanterns, rain (every 3rd day 14:00-16:00) and farm growth are
 *    ALL pure functions of (day, minutes) — so advancing the clock
 *    advances the world by construction. This module never keeps its own
 *    clock: every function here takes a DayClock and returns one.
 *
 * 2. 2D WAIT EXISTS — the parent's earlier "no wait system exists" was
 *    wrong for 2D: App.tsx `startWait` (~8825) offers Wait 1/2/4/8 hours,
 *    until morning (6 AM), until evening (6 PM); a 110ms interval advances
 *    1 tick (10 game-minutes) per step, with a progress bar, cancel, and
 *    the living sim advancing per tick. The 3D wait mirrors those options
 *    and that 10-minutes-per-110ms step exactly (8 hours = 48 steps ≈
 *    5.3 real seconds). The 2D clock format is `formatClockDisplay`
 *    ("8:00 AM · Day 1 · Y1", worldCore.ts); the 3D DayClock has no year,
 *    so the 3D readout is "8:00 AM · Day 1".
 *
 * 3. WHAT A WAIT ADVANCES — the clock, and through it the sky/lights/
 *    rain/farm growth. Animals keep their own 900ms real-time tick (a
 *    ~5s wait is ~5 animal ticks — the world does not freeze, same as
 *    2D). NPC schedules do NOT advance: the 900ms NPC tick is gated off
 *    by WILDERNESS_ONLY (BUILD 1054) and there are no actors. Transients
 *    and the car are gated off too.
 *
 * 4. INTERRUPTION IS REAL, NOT INVENTED — wolves hunt the player in 3D
 *    (animals.ts: stalk/approach/attack, bite 6 damage on their 900ms
 *    tick; the view applies biteDamage to healthRef). So a wait stops
 *    the moment the player's HP changes (any damage, or the 0 → 100
 *    exhaustion restore) — `waitInterrupted` is that check.
 *
 * 5. WHERE — anywhere on foot. The car is gated off; interiors are fine
 *    (the clock still advances, interior FX follows it). No safe-place
 *    rule is invented.
 */
import type { DayClock } from './townsfolk3d';

/** Minutes in a full game day. */
export const MINUTES_PER_DAY = 1440;

/** Wait fast-forward: game minutes advanced per timer step (2D parity). */
export const WAIT_STEP_MINUTES = 10;
/** Wait fast-forward: real milliseconds between steps (2D parity). */
export const WAIT_STEP_MS = 110;

/** Clock readout in the 2D game's format, minus the year (3D has none). */
export function formatDayClock(c: DayClock): string {
  const minutes = ((Math.floor(c.minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(minutes / 60);
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minute = String(minutes % 60).padStart(2, '0');
  return hour12 + ':' + minute + ' ' + suffix + ' · Day ' + Math.max(1, Math.floor(c.day));
}

/** Advance a clock by `minutes` game minutes, rolling the day over midnight. */
export function advanceClock(c: DayClock, minutes: number): DayClock {
  const total = Math.floor(c.minutes) + Math.floor(minutes);
  const day = Math.max(1, Math.floor(c.day) + Math.floor(total / MINUTES_PER_DAY));
  const m = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { minutes: m, day };
}

/**
 * Game minutes until the next occurrence of `targetHour` (0-23). If the
 * clock is exactly on the hour, returns a full day (the *next*
 * occurrence) — the same rule as worldCore.ticksUntilHour in 2D.
 */
export function minutesUntilHour(c: DayClock, targetHour: number): number {
  const target = ((Math.floor(targetHour) % 24) + 24) % 24;
  const current = ((Math.floor(c.minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let delta = target * 60 - current;
  if (delta <= 0) delta += MINUTES_PER_DAY;
  return delta;
}

/** One wait option: a label and the game minutes it advances. */
export type WaitOption = { id: string; label: string; minutes: number };

/** The wait menu — the 2D options, in the 2D order, on the 3D clock. */
export function waitOptionsFor(c: DayClock): WaitOption[] {
  return [
    { id: '1h', label: 'Wait 1 hour', minutes: 60 },
    { id: '2h', label: 'Wait 2 hours', minutes: 120 },
    { id: '4h', label: 'Wait 4 hours', minutes: 240 },
    { id: '8h', label: 'Wait 8 hours', minutes: 480 },
    { id: 'morning', label: 'Wait until morning (6 AM)', minutes: minutesUntilHour(c, 6) },
    { id: 'evening', label: 'Wait until evening (6 PM)', minutes: minutesUntilHour(c, 18) },
  ];
}

/** Timer steps (10 game-minutes each) needed to wait `totalMinutes`. */
export function waitStepsFor(totalMinutes: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalMinutes) / WAIT_STEP_MINUTES));
}

/** Real milliseconds a wait of `totalMinutes` game minutes takes. */
export function waitRealMsFor(totalMinutes: number): number {
  return waitStepsFor(totalMinutes) * WAIT_STEP_MS;
}

/** True when the player's HP changed since the wait started — any damage
 *  (a wolf bite) or the 0 → 100 exhaustion restore ends the wait. HP only
 *  ever moves by damage or that restore in 3D, so any change is an attack. */
export function waitInterrupted(startHp: number, currentHp: number): boolean {
  return currentHp !== startHp;
}

/** Human "2h 10m left" label for `remainingMinutes` of a wait. */
export function waitRemainingLabel(remainingMinutes: number): string {
  const r = Math.max(0, Math.ceil(remainingMinutes));
  const h = Math.floor(r / 60);
  const m = r % 60;
  if (h <= 0) return m + 'm left';
  return h + 'h' + (m > 0 ? ' ' + m + 'm' : '') + ' left';
}
