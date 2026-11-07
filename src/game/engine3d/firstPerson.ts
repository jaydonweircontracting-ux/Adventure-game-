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
 *
 * BUILD 1023 — zoom out further: the orbit max is 64 (was 32, the
 * ZOOM_MAX in townLook.ts — that constant is the OLD cap and lives in
 * a file owned by the parallel cobble build, so the new cap lives
 * here). Far-plane coverings at 64, re-checked against the 1007
 * analysis: worst camera-to-farthest-real-object 282 + 64 = 346 < 700;
 * clip edge 700 - 64 - 8 = 628 > FOG_FAR 600, so the clipped edge
 * stays fully fogged; apron 1000 - 64 = 936 > 700. At 96 the clip
 * edge would be 596 < 600, so 64 is the largest clean doubling.
 */
import { ZOOM_MIN, ZOOM_HYST } from './townLook';

/** BUILD 1023: orbit max distance, 64 tiles (was 32). */
export const ZOOM_MAX_FAR = 64;

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
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX_FAR, state.zoom + delta));
    if (z > ZOOM_MIN + ZOOM_HYST) return { zoom: ZOOM_MIN, firstPerson: false };
    return { zoom: z, firstPerson: true };
  }
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX_FAR, state.zoom + delta));
  if (z <= ZOOM_MIN && auto) return { zoom: ZOOM_MIN, firstPerson: true };
  return { zoom: z, firstPerson: false };
}
