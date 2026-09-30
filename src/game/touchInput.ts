// BUILD 325: D-pad touch-hold tracking with touch-identifier matching.
//
// Root cause of the attack freeze: on iOS Safari, tapping the Attack button
// with a second finger while holding the D-pad can make WebKit's gesture
// recognizer claim the touch sequence and fire touchcancel on the in-flight
// D-pad touch (Apple documents that a recognized gesture cancels previously
// delivered touches, and iOS gesture events fire independently of the viewport
// meta). The old handlers cleared the held direction unconditionally on any
// touchend/touchcancel, so a spurious end from a *different* touch left the
// game thinking the thumb had lifted — a permanent freeze until the user
// lifted and re-pressed, while the rest of the world kept simulating.
//
// Tracking each hold by touch.identifier means only the touch that pressed a
// direction can release it. Pure + deterministic so the sim can cover it.

export type TouchDirection = 'up' | 'down' | 'left' | 'right';

export interface TouchHoldState {
  /** Active hold per direction, keyed by the touch.identifier that pressed it. */
  holds: Partial<Record<TouchDirection, number>>;
}

export function createTouchHoldState(): TouchHoldState {
  return { holds: {} };
}

/**
 * Record a press. If a second touch lands on the same direction it takes over
 * (latest wins) — the first touch's later touchend must not release the hold
 * out from under the still-down second touch.
 */
export function pressTouchHold(state: TouchHoldState, direction: TouchDirection, touchId: number): void {
  state.holds[direction] = touchId;
}

/**
 * Record a release. Only the touch that currently holds the direction can
 * release it; a stray touchend/touchcancel from another touch (the attack-tap
 * scenario) is ignored. Returns true when a hold was actually released.
 */
export function releaseTouchHold(state: TouchHoldState, direction: TouchDirection, touchId: number): boolean {
  if (state.holds[direction] === touchId) {
    delete state.holds[direction];
    return true;
  }
  return false;
}

/** Force-clear one direction regardless of which touch holds it. */
export function clearTouchHoldDirection(state: TouchHoldState, direction: TouchDirection): void {
  delete state.holds[direction];
}

/** Force-clear every hold (input reset paths: blur, load, menus, waiting). */
export function clearTouchHolds(state: TouchHoldState): void {
  state.holds = {};
}

export function isTouchHeld(state: TouchHoldState, direction: TouchDirection): boolean {
  return state.holds[direction] !== undefined;
}

export function heldTouchDirections(state: TouchHoldState): TouchDirection[] {
  return (Object.keys(state.holds) as TouchDirection[]).filter(
    (direction) => state.holds[direction] !== undefined,
  );
}
