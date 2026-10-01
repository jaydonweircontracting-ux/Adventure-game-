/**
 * BUILD 376: pure multi-chunk helpers for the isometric field renderer.
 *
 * The iso field view renders a grid of chunks (radius 1 = 3x3) around the
 * player's chunk so the generated world fills the whole screen at every zoom
 * level — no blue void where terrain was never generated. Everything here is
 * pure and deterministic so it can be covered by the simulation suite.
 *
 * Coordinate convention: tiles are addressed RELATIVE to the current chunk's
 * origin, so the current chunk occupies [0, N) x [0, N) exactly as before and
 * neighbor chunk (ox, oy) occupies [ox*N, (ox+1)*N) x [oy*N, (oy+1)*N).
 * The iso projection is linear, so neighbor diamonds tile seamlessly.
 */
import { TILE_W, TILE_H } from './projection';

/** Chunk render radius around the player's chunk (1 -> 3x3 grid). */
export const ISO_CHUNK_RENDER_RADIUS = 1;

/**
 * Map a current-chunk-relative tile coordinate to its chunk offset and the
 * tile's local coordinates inside that chunk. Local coords are always in
 * [0, n), even for negative tile coordinates.
 */
export function isoTileChunkOffset(tx: number, ty: number, n: number): {
  ox: number; oy: number; lx: number; ly: number;
} {
  const ox = Math.floor(tx / n);
  const oy = Math.floor(ty / n);
  return { ox, oy, lx: tx - ox * n, ly: ty - oy * n };
}

/**
 * Screen-space bounds (world px, before zoom) of the rendered chunk grid,
 * plus its center. Tiles span [-radius*n, (radius+1)*n - 1] relative to the
 * current chunk origin. `margin` pads the bounds in world px.
 */
export function isoChunkGridBounds(radius: number, n: number, margin: number): {
  minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number;
} {
  const minT = -radius * n;
  const maxT = (radius + 1) * n - 1;
  // screenX = (tx - ty) * TILE_W/2 -> extremes at (minT, maxT) / (maxT, minT)
  // screenY = (tx + ty) * TILE_H/2 -> extremes at (minT, minT) / (maxT, maxT)
  const minX = (minT - maxT) * (TILE_W / 2) - margin;
  const maxX = (maxT - minT) * (TILE_W / 2) + margin;
  const minY = (minT + minT) * (TILE_H / 2) - margin;
  const maxY = (maxT + maxT) * (TILE_H / 2) + margin;
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/**
 * Clamp a chunk offset into the rendered grid (used as a safety net when the
 * visible tile range overshoots the grid by a tile or two).
 */
export function clampChunkOffset(ox: number, oy: number, radius: number): {
  ox: number; oy: number;
} {
  return {
    ox: Math.max(-radius, Math.min(radius, ox)),
    oy: Math.max(-radius, Math.min(radius, oy)),
  };
}

/**
 * True when the whole viewport is guaranteed to be covered by generated
 * terrain at the given zoom. The drawn region is a DIAMOND (not the bounding
 * box): tiles [t0, t1]^2 with t0 = -radius*n, t1 = (radius+1)*n - 1 project to
 * a diamond whose four edges are the lines
 *   x + 2y = 64*t0,  x - 2y = -64*t0,  x - 2y = -64*t1,  x + 2y = 64*t1.
 * The camera sits on the player, who is always inside the home chunk, so it
 * suffices to check the four viewport corners for the four home-chunk corner
 * player positions (the containment inequalities are linear in the camera
 * position and the home chunk is convex).
 */
export function isoViewportCovered(
  viewW: number, viewH: number, zoom: number, radius: number, n: number,
): boolean {
  const t0 = -radius * n;
  const t1 = (radius + 1) * n - 1;
  const hw = viewW / (2 * zoom);
  const hh = viewH / (2 * zoom);
  const insideDiamond = (sx: number, sy: number): boolean =>
    sx + 2 * sy >= 64 * t0 &&
    sx - 2 * sy <= -64 * t0 &&
    sx - 2 * sy >= -64 * t1 &&
    sx + 2 * sy <= 64 * t1;
  // home-chunk corner tiles -> screen anchors (camera y is 24px above feet)
  const anchors: Array<[number, number]> = [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]];
  const offsets: Array<[number, number]> = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]];
  for (const [px, py] of anchors) {
    const ax = (px - py) * (TILE_W / 2);
    const ay = (px + py) * (TILE_H / 2) - 24;
    for (const [dx, dy] of offsets) {
      if (!insideDiamond(ax + dx, ay + dy)) return false;
    }
  }
  return true;
}
