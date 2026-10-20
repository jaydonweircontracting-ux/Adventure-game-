// Stamina/energy system for sprinting (BUILD 704).
//
// Pure and deterministic — no React, no DOM. The player owns one StaminaState
// (in App.tsx, persisted in saves); NPCs use bounded run durations from their
// AI state (flee ticks) instead of a stamina pool.
//
// Hysteresis: once stamina hits zero the runner is "exhausted" and cannot run
// again until it regenerates past STAMINA_RUN_RELOCK. This prevents flickering
// between run and walk at the boundary.

/** Full stamina pool. */
export const STAMINA_MAX = 100;
/** Drained per second while actually running (~7s of sprint from full). */
export const STAMINA_DRAIN_RUN = 14;
/** Regenerated per second while walking. */
export const STAMINA_REGEN_WALK = 10;
/** Regenerated per second while standing still. */
export const STAMINA_REGEN_IDLE = 18;
/** Must regenerate to this value before running again after exhaustion. */
export const STAMINA_RUN_RELOCK = 30;

export interface StaminaState {
  /** 0..STAMINA_MAX */
  value: number;
  /** True after hitting zero; cleared once value >= STAMINA_RUN_RELOCK. */
  exhausted: boolean;
}

/** Fresh full stamina pool. */
export function createStamina(value: number = STAMINA_MAX): StaminaState {
  const v = Math.min(STAMINA_MAX, Math.max(0, value));
  return { value: v, exhausted: false };
}

/**
 * Advance stamina by dtSec. `running` should be true only while the entity is
 * actually sprinting (moving + run intent + allowed); `moving` while walking.
 * Drain beats regen — a frame never does both.
 * BUILD 884: `extraDrainPerSec` (e.g. hauling over carry capacity) adds to
 * sprint drain and cancels walk regen while moving.
 */
export function tickStamina(
  s: StaminaState,
  running: boolean,
  moving: boolean,
  dtSec: number,
  extraDrainPerSec = 0,
): StaminaState {
  if (!(dtSec > 0)) return s;
  let value = s.value;
  let exhausted = s.exhausted;
  if (running) {
    value = Math.max(0, value - (STAMINA_DRAIN_RUN + extraDrainPerSec) * dtSec);
    if (value <= 0) exhausted = true;
  } else if (moving) {
    if (extraDrainPerSec > 0) {
      value = Math.max(0, value - extraDrainPerSec * dtSec);
      if (value <= 0) exhausted = true;
    } else {
      value = Math.min(STAMINA_MAX, value + STAMINA_REGEN_WALK * dtSec);
    }
  } else {
    value = Math.min(STAMINA_MAX, value + STAMINA_REGEN_IDLE * dtSec);
  }
  if (exhausted && value >= STAMINA_RUN_RELOCK) exhausted = false;
  // No-op guard: keep object identity when nothing changed (cheap renders).
  if (value === s.value && exhausted === s.exhausted) return s;
  return { value, exhausted };
}

/** Whether the entity is currently allowed to run. */
export function canRun(s: StaminaState): boolean {
  return !s.exhausted && s.value > 0;
}

/** Fraction 0..1 for HUD bars. */
export function staminaFrac(s: StaminaState): number {
  return Math.min(1, Math.max(0, s.value / STAMINA_MAX));
}
