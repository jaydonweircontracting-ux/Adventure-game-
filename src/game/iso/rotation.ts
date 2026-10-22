/**
 * BUILD 944: camera rotation — pure, view-only rotation math for the iso
 * field view. The world never changes: tile coordinates, collision, NPC
 * navigation, combat, loot, quests, and saves are all untouched. Only the
 * rendering transform changes, in 90° steps, 4 orientations.
 *
 * Orientation k = number of clockwise IMAGE rotations applied (right-arrow
 * presses). Left arrow = counterclockwise = k - 1; right arrow = clockwise
 * = k + 1 (mod 4). Four rotations return to the starting view; left +
 * right cancel.
 *
 * Screen map M_k, where (sx, sy) is the default-view (k = 0) screen point
 * of a tile (from isoToScreen, TILE_W = 64, TILE_H = 32, 2:1 dimetric):
 *   k = 0: identity
 *   k = 1: (-2*sy, sx/2)     (one right-arrow press, image clockwise)
 *   k = 2: (-sx, -sy)
 *   k = 3: (2*sy, -sx/2)
 * The 2x / 0.5x factors come from the 2:1 tile aspect: rotating a dimetric
 * image 90° swaps the wide and tall axes. Tile remaps follow the same map:
 * rendering tile (tx, ty) uses the screen position of the remapped tile
 * (k = 1: (-ty, tx); k = 2: (-tx, -ty); k = 3: (ty, -tx)).
 *
 * Rotated depth is linear in tile coords, so midpoint depth equals the
 * rotated depth of the midpoint, and the painter sort stays correct:
 *   k = 0: tx + ty   k = 1: tx - ty   k = 2: -(tx + ty)   k = 3: ty - tx
 *
 * Facings are SCREEN directions in the default view, so a facing rotates
 * with the image: shift by 2 steps per k in the clockwise 8-cycle
 * [up, upright, right, downright, down, downleft, left, upleft]. This is
 * exact for Face8 (player, horse). Face4 rows (NPCs, monsters, goats)
 * cannot express diagonals, so their remap is the rigid rotation of the
 * depiction (e.g. 'down' -> 'left' at k = 1) rather than a geometric
 * diagonal — the character keeps its appearance relative to the world.
 *
 * Sprite IMAGES are never rotated: re-projection moves anchors only, and
 * sprites draw upright at rotated anchors with only the zoom scale. A
 * canvas-transform rotation would shear sprites (90° + 2x wide / 0.5x tall)
 * and is deliberately not used.
 */
import { isoToScreen, screenToTile, TILE_W, TILE_H } from './projection';
import type { Face8 } from './isoSprites';

export type IsoRotation = 0 | 1 | 2 | 3;

/** Save-load sanitize: integers 0..3 pass, anything else restores to 0. */
export function sanitizeIsoRotation(v: unknown): IsoRotation {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  const k = Math.floor(v);
  return (k >= 0 && k <= 3 ? k : 0) as IsoRotation;
}

/** Default-view screen point -> rotated-view screen point. */
export function rotateIsoScreen(sx: number, sy: number, k: IsoRotation): { x: number; y: number } {
  switch (k) {
    case 0: return { x: sx, y: sy };
    case 1: return { x: -2 * sy, y: sx / 2 };
    case 2: return { x: -sx, y: -sy };
    case 3: return { x: 2 * sy, y: -sx / 2 };
  }
}

/** Rotated-view screen point -> default-view screen point (inverse of M_k). */
export function unrotateIsoScreen(sx: number, sy: number, k: IsoRotation): { x: number; y: number } {
  return rotateIsoScreen(sx, sy, ((4 - k) % 4) as IsoRotation);
}

/** Painter depth of tile (tx, ty) as seen from orientation k. */
export function rotatedDepth(tx: number, ty: number, k: IsoRotation): number {
  switch (k) {
    case 0: return tx + ty;
    case 1: return tx - ty;
    case 2: return -(tx + ty);
    case 3: return ty - tx;
  }
}

const FACE8_CW: readonly Face8[] = [
  'up', 'upright', 'right', 'downright', 'down', 'downleft', 'left', 'upleft',
];

/** Rotate a screen-space facing by k x 90° clockwise. Face4 values included. */
export function rotateFace8(face: Face8, k: IsoRotation): Face8 {
  const i = (FACE8_CW as readonly string[]).indexOf(face);
  if (i < 0) return face;
  return FACE8_CW[(i + 2 * k) % 8];
}

/** Ambient-critter pack directions (critters.ts): screen diagonals, clockwise. */
export type CritterDir4 = 'NE' | 'SE' | 'SW' | 'NW';

const CRITTER_CW: readonly CritterDir4[] = ['NE', 'SE', 'SW', 'NW'];

/** Rotate a critter pack direction by k x 90° clockwise. */
export function rotateCritterDir(dir: CritterDir4, k: IsoRotation): CritterDir4 {
  const i = (CRITTER_CW as readonly string[]).indexOf(dir);
  if (i < 0) return dir;
  return CRITTER_CW[(i + k) % 4];
}

/**
 * Screen-space bounds (world px, before zoom) of the rendered chunk grid
 * as seen from orientation k — the rotated diamond's own bounds, not the
 * rotated bounding box. At k = 0 this is byte-identical to
 * isoChunkGridBounds(radius, n, margin).
 */
export function rotatedGridBounds(
  radius: number, n: number, margin: number, k: IsoRotation,
): { minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number } {
  const minT = -radius * n;
  const maxT = (radius + 1) * n - 1;
  const verts = [
    isoToScreen(minT, minT),
    isoToScreen(maxT, minT),
    isoToScreen(minT, maxT),
    isoToScreen(maxT, maxT),
  ].map((p) => rotateIsoScreen(p.x, p.y, k));
  const xs = verts.map((v) => v.x);
  const ys = verts.map((v) => v.y);
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/**
 * Visible tile range as seen from orientation k: unrotate the four
 * viewport corners (given in rotated space, where the camera lives) back
 * to default-view screen space, then run the standard corner range. Same
 * TILE_W/TILE_H padding and ±1 as isoVisibleTileRange; at k = 0 the output
 * is identical to isoVisibleTileRange.
 */
export function rotatedVisibleTileRange(
  camX: number, camY: number, viewW: number, viewH: number, zoom: number, k: IsoRotation,
): { x0: number; x1: number; y0: number; y1: number } {
  const hw = viewW / (2 * zoom) + TILE_W;
  const hh = viewH / (2 * zoom) + TILE_H;
  const corners = [
    unrotateIsoScreen(camX - hw, camY - hh, k),
    unrotateIsoScreen(camX + hw, camY - hh, k),
    unrotateIsoScreen(camX - hw, camY + hh, k),
    unrotateIsoScreen(camX + hw, camY + hh, k),
  ].map((p) => screenToTile(p.x, p.y));
  const txs = corners.map((c) => c.tx);
  const tys = corners.map((c) => c.ty);
  return {
    x0: Math.floor(Math.min(...txs)) - 1,
    x1: Math.ceil(Math.max(...txs)) + 1,
    y0: Math.floor(Math.min(...tys)) - 1,
    y1: Math.ceil(Math.max(...tys)) + 1,
  };
}

/**
 * BUILD 953: camera hold-to-spin — TRUE continuous-angle rotation. The 944
 * step maps are exactly this map at multiples of 90°: rotating the WORLD
 * by θ and then applying the standard 2:1 dimetric projection gives
 *   sx' = sx·cosθ − 2·sy·sinθ
 *   sy' = sx·sinθ/2 + sy·cosθ
 * (verify: θ=90° gives (−2·sy, sx/2) = M_1; θ=180° gives (−sx, −sy) = M_2;
 * θ=270° gives (2·sy, −sx/2) = M_3). So the continuous map is a genuine
 * camera orbit, not interpolated steps — and at every multiple of 90° it
 * is byte-identical to the 944 behavior. R is a group homomorphism:
 * R(a)·R(b) = R(a+b), so a ground cache painted at angle θq can be drawn
 * at angle θ with the exact affine correction R(θ−θq) (see
 * cacheCoversViewport). Angles are degrees, clockwise positive in screen
 * space (y down), matching the 944 convention (right arrow = clockwise).
 */
const DEG = Math.PI / 180;

/** Normalize any angle to [0, 360). */
export function normalizeAngleDeg(a: number): number {
  if (!Number.isFinite(a)) return 0;
  return ((a % 360) + 360) % 360;
}

/** Wrapped difference a − b into (−180, 180]. */
export function angleDeltaDeg(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Default-view screen point -> continuous-angle screen point. */
export function rotateIsoScreenAngle(sx: number, sy: number, deg: number): { x: number; y: number } {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return { x: sx * c - 2 * sy * s, y: (sx * s) / 2 + sy * c };
}

/** Continuous-angle screen point -> default-view screen point. */
export function unrotateIsoScreenAngle(sx: number, sy: number, deg: number): { x: number; y: number } {
  return rotateIsoScreenAngle(sx, sy, -deg);
}

/**
 * Painter depth at a continuous angle. Linear in tile coords (so midpoint
 * depth still equals the depth of the midpoint, and the painter sort stays
 * correct). At multiples of 90° it is a positive scalar multiple of the
 * 944 rotatedDepth, hence the same ordering.
 */
export function rotatedDepthAngle(tx: number, ty: number, deg: number): number {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return tx * (s + c) + ty * (c - s);
}

/** Screen-space facing angles (degrees, clockwise, y down). */
const FACE8_ANGLE: Record<string, number> = {
  up: 270, upright: 315, right: 0, downright: 45,
  down: 90, downleft: 135, left: 180, upleft: 225,
};
const ANGLE_FACE8: readonly Face8[] = [
  'right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright',
];

/**
 * Rotate a screen-space facing by an arbitrary angle: add the angle, snap
 * to the nearest 45° Face8 row (sprites have only 8 rows — they cannot
 * show in-between angles). Exact ties resolve to the clockwise-side row
 * (JS Math.round rounds halves up). At multiples of 90° this is exactly
 * the 944 shift-by-2k.
 */
export function rotateFace8Angle(face: Face8, deg: number): Face8 {
  const base = FACE8_ANGLE[face];
  if (base === undefined) return face;
  const snapped = Math.round(normalizeAngleDeg(base + deg) / 45) % 8;
  return ANGLE_FACE8[snapped];
}

/** Screen-space critter-pack diagonal angles (degrees, clockwise, y down). */
const CRITTER_ANGLE: Record<string, number> = { NE: 315, SE: 45, SW: 135, NW: 225 };
const ANGLE_CRITTER: readonly CritterDir4[] = ['SE', 'SW', 'NW', 'NE'];

/**
 * Rotate a critter pack direction by an arbitrary angle: add the angle,
 * snap to the nearest 90° diagonal. Exact ties resolve to the
 * clockwise-side diagonal. At multiples of 90° this is exactly the 944
 * shift-by-k.
 */
export function rotateCritterDirAngle(dir: CritterDir4, deg: number): CritterDir4 {
  const base = CRITTER_ANGLE[dir];
  if (base === undefined) return dir;
  const snapped = Math.round((normalizeAngleDeg(base + deg) - 45) / 90) % 4;
  return ANGLE_CRITTER[(snapped + 4) % 4];
}

/** Screen-space bounds of the rendered chunk grid at a continuous angle. */
export function rotatedGridBoundsAngle(
  radius: number, n: number, margin: number, deg: number,
): { minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number } {
  const minT = -radius * n;
  const maxT = (radius + 1) * n - 1;
  const verts = [
    isoToScreen(minT, minT),
    isoToScreen(maxT, minT),
    isoToScreen(minT, maxT),
    isoToScreen(maxT, maxT),
  ].map((p) => rotateIsoScreenAngle(p.x, p.y, deg));
  const xs = verts.map((v) => v.x);
  const ys = verts.map((v) => v.y);
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** Visible tile range at a continuous angle (same padding as 944). */
export function rotatedVisibleTileRangeAngle(
  camX: number, camY: number, viewW: number, viewH: number, zoom: number, deg: number,
): { x0: number; x1: number; y0: number; y1: number } {
  const hw = viewW / (2 * zoom) + TILE_W;
  const hh = viewH / (2 * zoom) + TILE_H;
  const corners = [
    unrotateIsoScreenAngle(camX - hw, camY - hh, deg),
    unrotateIsoScreenAngle(camX + hw, camY - hh, deg),
    unrotateIsoScreenAngle(camX - hw, camY + hh, deg),
    unrotateIsoScreenAngle(camX + hw, camY + hh, deg),
  ].map((p) => screenToTile(p.x, p.y));
  const txs = corners.map((c) => c.tx);
  const tys = corners.map((c) => c.ty);
  return {
    x0: Math.floor(Math.min(...txs)) - 1,
    x1: Math.ceil(Math.max(...txs)) + 1,
    y0: Math.floor(Math.min(...tys)) - 1,
    y1: Math.ceil(Math.max(...tys)) + 1,
  };
}

/**
 * Angle-aware ground-cache coverage test. The cache was painted at angle
 * θq into the rect [originX, originX+worldW] × [originY, originY+worldH]
 * (θq-space). At angle θ the painted rect maps to a parallelogram via
 * R(θ−θq); the current viewport (θ-space, centered at cam) is covered
 * exactly when all four viewport corners, mapped back by R(θq−θ),
 * land inside the painted rect (both sets are convex, so corner
 * containment is exact). At Δθ = 0 this reduces to the old rect test.
 */
export function cacheCoversViewport(
  camX: number, camY: number, viewHalfW: number, viewHalfH: number,
  originX: number, originY: number, worldW: number, worldH: number,
  deltaDeg: number,
): boolean {
  const eps = 1;
  const corners = [
    { x: camX - viewHalfW, y: camY - viewHalfH },
    { x: camX + viewHalfW, y: camY - viewHalfH },
    { x: camX - viewHalfW, y: camY + viewHalfH },
    { x: camX + viewHalfW, y: camY + viewHalfH },
  ].map((p) => unrotateIsoScreenAngle(p.x, p.y, deltaDeg));
  return corners.every((p) =>
    p.x >= originX - eps && p.x <= originX + worldW + eps &&
    p.y >= originY - eps && p.y <= originY + worldH + eps);
}
