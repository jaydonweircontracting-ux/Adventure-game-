// BUILD 1003 (queue item 1004): sprint + stamina, 3D mode only.
//
// Pure rules, no React, no I/O — the view calls these from inside its
// existing movement pipeline (draw()), so sprinting multiplies speed
// INSIDE that pipeline: same step, same walkableAt checks, same wall
// sliding, never a parallel mover, never a teleport, never through
// walls or figures. NPCs never sprint (their 998 glide is untouched).
//
// Exact numbers (all asserted in ~/workspace/verify1004/asserts1004.ts):
//   WALK_SPEED  3.15 u/s — the pre-1003 player speed, unchanged.
//   SPRINT_MULT 1.6x   — sprint speed 5.04 u/s, a clear ~60% boost.
//   STAMINA_MAX 100, drain 20/s while sprint-moving (5s of full
//     sprint), regen 12/s whenever NOT sprint-moving (8.33s to refill
//     from 0). Regen runs while walking normally and while idle —
//     only sprint-moving pauses it.
//   Exhaustion: hitting 0 stamina sets exhausted=true. While
//     exhausted, sprint input is ignored (forced walk) until stamina
//     regenerates to EXHAUSTED_RECOVER_AT (25, ~2.08s of regen), then
//     sprint re-enables. No drain below 0, no regen above 100.
//   Drain requires actual movement: holding sprint while standing
//     still or blocked against a wall costs nothing (no benefit
//     taken, so regen applies instead).
// Save treatment: SESSION-ONLY. Stamina is never written to
// localStorage — every mount starts at 100, and a reload restores
// full stamina. There is no stamina save key by design (a
// "loaded exhausted" state would punish reloading, and stamina is a
// moment-to-moment resource, not progress).

export const WALK_SPEED = 3.15;
export const SPRINT_MULT = 1.6;
export const SPRINT_SPEED = WALK_SPEED * SPRINT_MULT; // 5.04 u/s
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN_PER_S = 20;
export const STAMINA_REGEN_PER_S = 12;
export const EXHAUSTED_RECOVER_AT = 25;

export interface StaminaState {
  stamina: number;
  exhausted: boolean;
}

export const FULL_STAMINA: StaminaState = { stamina: STAMINA_MAX, exhausted: false };

/** Speed for this frame: sprint only when held, not exhausted, and input exists. */
export function sprintSpeed(sprintHeld: boolean, exhausted: boolean, hasInput: boolean): number {
  return sprintHeld && !exhausted && hasInput ? SPRINT_SPEED : WALK_SPEED;
}

/**
 * One frame of stamina. `moving` means the player ACTUALLY changed
 * position this frame — the view passes real displacement, NOT the
 * walkingNow flag, because a straight-line push against a wall or a
 * slower figure takes the no-op slide branch (same tile, flag still
 * true). Holding sprint against a wall, behind a traveler, or while
 * standing still drains nothing.
 */
export function stepStamina(prev: StaminaState, dt: number, sprintHeld: boolean, moving: boolean): StaminaState {
  let stamina = prev.stamina;
  let exhausted = prev.exhausted;
  if (sprintHeld && !exhausted && moving) {
    stamina = Math.max(0, stamina - STAMINA_DRAIN_PER_S * dt);
    if (stamina === 0) exhausted = true;
  } else {
    stamina = Math.min(STAMINA_MAX, stamina + STAMINA_REGEN_PER_S * dt);
    if (exhausted && stamina >= EXHAUSTED_RECOVER_AT) exhausted = false;
  }
  return { stamina, exhausted };
}
