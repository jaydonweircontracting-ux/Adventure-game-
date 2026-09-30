// Field camera math (BUILD 375 — extracted from App.tsx).
//
// Pure functions for the 2D field's centered-zoom camera. No React, no game
// state: safe to unit-test and reuse from any view.
//
// BUILD 327: default gameplay zoom is 225%. When zoomed, the world layer is
// scaled around the top-left corner and translated so the player's field
// position lands at the viewport center:
//   screen = zoom * layer + (0.5 - zoom * playerFrac) * size
// The player sprite keeps its own scale(gameZoom) so it matches NPC size.

/** Field edge length in field units (BUILD 343: 140 -> 280). */
export const FIELD_SIZE = 280;

export const DEFAULT_GAME_ZOOM = 2.25;

export function zoomTranslatePct(playerFrac: number, zoom: number): number {
  return (0.5 - zoom * playerFrac) * 100;
}

// BUILD 350: camera fraction clamped so the viewport never shows out-of-bounds
// void past the chunk edge when zoomed in (>=100%). Below 100% the viewport is
// wider than the chunk, so no clamp applies — neighbor chunks render there
// instead (BUILD 346).
export function cameraFrac(playerFrac: number, zoom: number): number {
  if (zoom < 1) return playerFrac;
  const halfView = 0.5 / zoom;
  return Math.min(Math.max(playerFrac, halfView), 1 - halfView);
}

// BUILD 350: on-screen position (%) of the player sprite when zoomed. The
// sprite stays pinned at 50% while the camera centers the player; when the
// camera clamps at a chunk edge, the sprite slides toward that edge instead,
// so walking near the edge stays visible.
export function playerScreenPct(fieldFrac: number, zoom: number): number {
  const cf = cameraFrac(fieldFrac, zoom);
  return (0.5 + zoom * (fieldFrac - cf)) * 100;
}

export function screenPxToFieldUnits(screenPx: number, sizePx: number, playerFrac: number, zoom: number): number {
  const t = (zoomTranslatePct(cameraFrac(playerFrac, zoom), zoom) / 100) * sizePx;
  return (((screenPx - t) / zoom) / sizePx) * FIELD_SIZE;
}

/** Convert field units (0..FIELD_SIZE) to CSS percentage for positioning. */
export function fieldPct(v: number): string { return (v / FIELD_SIZE * 100) + '%'; }
