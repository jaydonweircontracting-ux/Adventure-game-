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

// BUILD 1018: tap-to-toggle sprint. The Sprint control is BOTH hold-to-
// sprint AND tap-to-toggle: a quick tap latches sprint ON until tapped
// again or until exhaustion. Pure rules — the view owns the pointer
// events, this module owns the classification + the latch state
// machine, so the asserts can prove them without a DOM.
// (Why: the 1017 button was hold-only. A tap did nothing persistent —
// the user pressed it, saw the press highlight, and the character never
// went faster. His words were literally "doesn't toggle sprint mode".)
//
// BUILD 1026: the 1018 tap window (250ms/12px) was calibrated on fast
// synthetic harness taps, not real thumbs — repro2 measured a realistic
// 300ms/15px finger tap and a heavy 400ms/20px tap BOTH failing to
// latch, while a fast touchscreen.tap latched. The 2.5D toggle has NO
// classifier at all (any click toggles). Widened to 500ms/24px: still
// distinguishes a deliberate hold (>500ms, finger stays down) from a
// tap, but a real thumb press now latches. The 2s idle-clear is also
// GONE — repro2 measured the latch dying 3s after a tap-then-wait, so
// tapping sprint and then moving with the other hand gave walk speed.
// The 2.5D toggle persists until tapped again or exhaustion; the latch
// now does the same. A stale latch cannot run the player into a wall
// forever: the latch only sprints while there is input, and a pinned
// tap-target clears with 'Path blocked' (1018) / slides around it
// (1020/1021), so the idle-clear was redundant.
export const TAP_MAX_MS = 500;
export const TAP_MAX_PX = 24;

/** A press is a tap when it is short AND the finger barely moved. */
export function isSprintTap(downMs: number, upMs: number, downX: number, downY: number, upX: number, upY: number): boolean {
  return upMs - downMs < TAP_MAX_MS && Math.hypot(upX - downX, upY - downY) <= TAP_MAX_PX;
}

/** Effective sprint input: physical hold, latched toggle, or Shift key. */
export function sprintInput(held: boolean, latched: boolean, shiftKey: boolean): boolean {
  return held || latched || shiftKey;
}

// BUILD 1020: no auto-resume after exhaustion. Holding sprint drains
// 100→0 in 5s, then exhaustion forces walk until 25 recovers — and while
// the same hold continues, sprint re-engages the instant 25 is reached,
// so a sustained hold surges sprint→walk→sprint every ~7s (measured:
// two full cycles in a 25s sustained sprint on both 1017 and 1019).
// That speed sawtooth reads as glitchy. The rearm rule: once exhaustion
// hits, sprint stays off until ALL sprint input is released and pressed
// again (or tapped again — the latch already clears on exhaustion, so
// the toggle path needs a re-tap by construction). The numbers do not
// change (20/s, 12/s, 0, 25). Pure rules — the view owns one boolean
// ref (rearmed) and calls this once per frame after the stamina step.
//
// BUILD 1021: the 1020 gate armed only on the RISING EDGE of
// exhaustion (justExhausted). A sprint press that starts AFTER that
// frame — pressing Shift while already tired, or tapping the button
// while tired — never armed the gate, so sprint auto-engaged at 25
// while the input was still held, drained to 0, and re-exhausted:
// the same sawtooth, now triggered by a press-while-tired instead of
// a continuous hold. Measured on 1020: press Shift at stamina 9.6
// (tired), keep holding — sprint engages ~100ms after recovery at
// 25.2 with NO release, drains to 0, re-exhausts (two bursts in 9s);
// mashing the button while tired gives 8 bursts in 13s. A continuous
// hold was already proven safe (1020 SUSTAINED25, re-proven: zero
// bursts in 10s). The fix: the gate is a LEVEL, not an edge — any
// sprint input while exhausted arms it, and a release only disarms it
// once recovery has happened. A deliberate fresh press AFTER recovery
// still sprints (a ~1.25s burst from 25 stamina is the 1003 numbers,
// unchanged); sprint never re-engages WITHOUT one.
export function nextSprintRearm(prevRearmed: boolean, justExhausted: boolean, rawHeld: boolean, exhausted: boolean): boolean {
  if (justExhausted && rawHeld) return true;
  if (exhausted) return prevRearmed || rawHeld;
  if (prevRearmed && rawHeld) return true;
  return false;
}

/** A tap flips the latch — unless exhausted, which always unlatches. */
export function latchAfterTap(latched: boolean, exhausted: boolean): boolean {
  return exhausted ? false : !latched;
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
