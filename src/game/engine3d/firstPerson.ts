/**
 * BUILD 992 — first-person-on-full-zoom state machine (pure, no React,
 * no DOM, so standalone asserts can drive it directly).
 *
 * One zoom parameter is shared by pinch (touch) and wheel (desktop);
 * smaller zoom = closer orbit. Zooming IN to ZOOM_MIN engages first
 * person (only when auto is ON — the Options "First person: auto on
 * full zoom" setting, default ON). Zooming OUT from first person must
 * pass ZOOM_MIN + ZOOM_HYST before it returns to orbit, and it returns
 * AT the minimum distance first, then continues outward normally; the
 * 1.5-unit hysteresis margin (about one deliberate gesture) stops the
 * view flickering at the boundary. While in first person, inward
 * deltas just ease back toward the minimum and stay first person;
 * outward deltas accumulate toward the exit threshold.
 */
import { ZOOM_MIN, ZOOM_MAX, ZOOM_HYST } from './townLook';

export interface FpZoomState {
  zoom: number;
  firstPerson: boolean;
}

export function applyZoomDelta(
  state: FpZoomState,
  delta: number,
  auto: boolean,
): FpZoomState {
  if (state.firstPerson) {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom + delta));
    if (z > ZOOM_MIN + ZOOM_HYST) return { zoom: ZOOM_MIN, firstPerson: false };
    return { zoom: z, firstPerson: true };
  }
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom + delta));
  if (z <= ZOOM_MIN && auto) return { zoom: ZOOM_MIN, firstPerson: true };
  return { zoom: z, firstPerson: false };
}
