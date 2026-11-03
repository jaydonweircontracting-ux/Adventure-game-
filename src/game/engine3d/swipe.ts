// BUILD 1004: Build-panel swipe gestures — pure direction math, so the
// gesture rules are assertable without React.
//
// A swipe counts only when one axis both clears its minimum AND dominates
// the other axis by SWIPE_DOMINANCE. That dominance rule is the whole
// disambiguation story:
//  - a vertical drag on the Build panel keeps scrolling it (1001:
//    panel touchAction pan-y + touchmove exemption) — vertical wins,
//    so no minimize fires;
//  - a canvas orbit drag is usually diagonal or vertical, so it never
//    qualifies as a horizontal swipe and never opens the panel;
//  - a drag-to-place / drag-to-move / drag-to-remove-paint stroke on
//    the ground is a canvas gesture, never a panel gesture, so it is
//    untouched by these handlers entirely.
//
// Thresholds are CSS pixels. The panel minimizes on either horizontal
// direction (a sideways swipe, no direction to remember); the
// right-edge strip reopens only on a LEFTWARD swipe (into the screen),
// and the minimized handle reopens on either horizontal direction.

export const SWIPE_MIN_PX = 48;
export const SWIPE_HANDLE_MIN_PX = 40;
export const SWIPE_DOMINANCE = 1.5;
export const EDGE_STRIP_PX = 28;

export type SwipeDir = 'left' | 'right' | 'up' | 'down' | 'none';

export function classifySwipe(dx: number, dy: number, minPx: number = SWIPE_MIN_PX): SwipeDir {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax >= minPx && ax >= SWIPE_DOMINANCE * ay) return dx < 0 ? 'left' : 'right';
  if (ay >= minPx && ay >= SWIPE_DOMINANCE * ax) return dy < 0 ? 'up' : 'down';
  return 'none';
}
