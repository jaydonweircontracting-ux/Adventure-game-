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

/** Touch-event kinds the document-level revalidator distinguishes. */
export type TouchEventKind = 'start' | 'end' | 'cancel';

/**
 * BUILD 336: reconcile held directions against the live touch list, so every
 * class of touch desync heals itself instead of freezing or wedging movement.
 *
 * The attack-freeze root cause: on iOS Safari, tapping the Attack button with
 * a second finger while the D-pad is held can make the browser cancel the
 * in-flight D-pad touch (touchcancel) *while the thumb is still physically
 * down* — and no further events are ever delivered for a cancelled touch.
 * Releasing the hold on cancel therefore desynced input permanently: the
 * game thought the thumb had lifted, while the world kept simulating.
 *
 * Rules (id = the touch.identifier that pressed the direction):
 * - 'end': an id in changedTouches definitely lifted -> release it. An id
 *   missing from touches is also gone -> release (heals missed releases).
 * - 'cancel': an id in changedTouches was just cancelled but its finger may
 *   STILL be down -> KEEP it. This is the freeze fix. Ids in neither list
 *   are long-dead -> release.
 * - 'start': ids in neither list are long-dead -> release; live ids stay.
 *
 * Returns the directions that were released.
 */
export function revalidateTouchHolds(
  state: TouchHoldState,
  kind: TouchEventKind,
  touches: ArrayLike<number>,
  changedTouches: ArrayLike<number>,
): TouchDirection[] {
  const live = new Set<number>();
  for (let index = 0; index < touches.length; index += 1) live.add(touches[index]);
  const changed = new Set<number>();
  for (let index = 0; index < changedTouches.length; index += 1) changed.add(changedTouches[index]);
  const released: TouchDirection[] = [];
  (Object.keys(state.holds) as TouchDirection[]).forEach((direction) => {
    const id = state.holds[direction];
    if (id === undefined) return;
    const shouldRelease = kind === 'end'
      ? changed.has(id) || !live.has(id)
      : !live.has(id) && !changed.has(id);
    if (shouldRelease) {
      delete state.holds[direction];
      released.push(direction);
    }
  });
  return released;
}

export function heldTouchDirections(state: TouchHoldState): TouchDirection[] {
  return (Object.keys(state.holds) as TouchDirection[]).filter(
    (direction) => state.holds[direction] !== undefined,
  );
}
