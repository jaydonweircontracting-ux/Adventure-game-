// BUILD 1033 — red sports car (pure module, no React, no I/O).
//
// The car is a summoned vehicle, not progress: it is SESSION-ONLY
// (never written to localStorage). A reload starts without a car —
// the player summons it again with one tap, like the session-only
// animals (1013) and chickens (1016). That keeps it out of both the
// versioned world save (iso-world-v2) and the unversioned ag-3d-*
// keys (the G16 gap: no migration), so no save format changes.
//
// Position convention: tile-corner coords, the same as the player
// position (a tile (tx,ty) spans [tx,tx+1]; rendering adds +0.5 for
// the centre). Yaw convention: atan2(dx, dz), the same as the
// figures (npcMotion turnYawToward) — 0 faces south (+z), PI/2
// faces east (+x). The car is ~1.9 tiles long, so it overhangs its
// tile slightly, like a real car overhangs a parking space.
//
// Wiring (the view owns the rest):
//  - Speed: the view drives with CAR_SPEED inside the same movement
//    pipeline (resolvePlayerStep + walkableAt), so the car respects
//    houses, walls, water, rocks, trees, and figures exactly like
//    the player on foot — it cannot drive through them.
//  - Blocking: carBlocksTile() is the rule the view's walkableAt
//    calls — the parked car's tile is solid on foot (like a rock);
//    while driving the car IS the player, so the block is skipped.
//  - Enter/Exit: like the houses (interiors.ts) — the player enters
//    when the car is within one tile (isCarNear, Chebyshev, the
//    nearestDoorHut rule) and exits onto the best adjacent tile
//    (carExitTile); the car stays where it is.
//  - Rendering: emitCar() pushes vertex-colour triangles (the
//    renderer is triangles-only, no textures) into a small per-frame
//    buffer, the sky/fx pattern — never the static world buffer,
//    because the car moves every frame while driving.
import { WALK_SPEED } from './sprint';
import { SUN_SHADE, shadeRgb, type Rgb } from './townLook';

/** 10x walking speed: 3.15 * 10 = 31.5 u/s. */
export const CAR_MULT = 10;
export const CAR_SPEED = WALK_SPEED * CAR_MULT;

/** Per-frame car buffer capacity (the car is ~250 verts; 1024 is headroom). */
export const CAR_MAX_VERTS = 1024;

/** The car's live position (tile-corner coords) + heading. */
export interface CarState {
  x: number;
  y: number;
  yaw: number;
}

// Sports-car red body, dark glass cabin, near-black tyres, pale
// headlights, dark shadow blob under the car.
export const CAR_BODY_RED: Rgb = [0.85, 0.08, 0.1];
export const CAR_GLASS: Rgb = [0.1, 0.12, 0.18];
export const CAR_TYRE: Rgb = [0.07, 0.07, 0.08];
export const CAR_HEADLIGHT: Rgb = [0.95, 0.88, 0.55];
export const CAR_TAILLIGHT: Rgb = [0.95, 0.15, 0.15];
export const CAR_SHADOW: Rgb = [0.1, 0.1, 0.1];

/** The tile the car sits on (rounded, like every other tile test). */
export function carTile(car: CarState): { x: number; y: number } {
  return { x: Math.round(car.x), y: Math.round(car.y) };
}

/** True when the parked car is within one tile (Chebyshev, the door rule). */
export function isCarNear(car: CarState, px: number, py: number): boolean {
  const t = carTile(car);
  return Math.max(Math.abs(t.x - Math.round(px)), Math.abs(t.y - Math.round(py))) <= 1;
}

/**
 * The parked-car blocking rule, for the view's walkableAt: while on
 * foot the car's tile is solid (like a rock); while driving the car
 * IS the player, so its tile never blocks. Returns true when the
 * tile (gx,gy) is blocked BY the car.
 */
export function carBlocksTile(car: CarState | null, driving: boolean, gx: number, gy: number): boolean {
  if (!car || driving) return false;
  const t = carTile(car);
  return gx === t.x && gy === t.y;
}

/**
 * Find a tile to summon the car on, next to the player tile (px,py).
 * Tries the 4 cardinal neighbours, then the 4 diagonals, then the
 * 12 tiles of the 2-tile ring — the first tile isFree() accepts.
 * Never the player's own tile (the car spawns NEXT to the player).
 * Returns null when fully boxed in (the view reports "No room").
 */
export function carSpawnTile(
  px: number,
  py: number,
  isFree: (tx: number, ty: number) => boolean,
): { x: number; y: number } | null {
  const ring1: Array<[number, number]> = [
    [1, 0], [0, 1], [-1, 0], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (const [dx, dy] of ring1) {
    if (isFree(px + dx, py + dy)) return { x: px + dx, y: py + dy };
  }
  const ring2: Array<[number, number]> = [
    [2, 0], [0, 2], [-2, 0], [0, -2],
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2],
  ];
  for (const [dx, dy] of ring2) {
    if (isFree(px + dx, py + dy)) return { x: px + dx, y: py + dy };
  }
  return null;
}

/**
 * Find the tile for the player to step onto when exiting the car.
 * Tries the neighbours of the car's tile in the order [behind, left,
 * right, front] relative to the car's heading (stepping out behind
 * the car first), then the diagonals. Falls back to the car's own
 * tile — the car drove there, so it is walkable, and the player can
 * always re-enter from it. Always returns a tile.
 */
export function carExitTile(
  car: CarState,
  isFree: (tx: number, ty: number) => boolean,
): { x: number; y: number } {
  const t = carTile(car);
  // Forward unit, snapped to the nearest cardinal (the heading is
  // continuous; the exit tiles are cardinal neighbours).
  const fx = Math.abs(Math.sin(car.yaw)) > Math.abs(Math.cos(car.yaw)) ? Math.sign(Math.sin(car.yaw)) : 0;
  const fz = fx === 0 ? Math.sign(Math.cos(car.yaw)) : 0;
  const behind: [number, number] = [-fx, -fz];
  const left: [number, number] = [-fz, fx];
  const right: [number, number] = [fz, -fx];
  const front: [number, number] = [fx, fz];
  const ring: Array<[number, number]> = [
    behind, left, right, front,
    [behind[0] + left[0], behind[1] + left[1]],
    [behind[0] + right[0], behind[1] + right[1]],
    [front[0] + left[0], front[1] + left[1]],
    [front[0] + right[0], front[1] + right[1]],
  ];
  for (const [dx, dy] of ring) {
    if (dx === 0 && dy === 0) continue;
    if (isFree(t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy };
  }
  return { x: t.x, y: t.y };
}

// ---- Mesh (vertex-colour triangles, the renderer's only format). ----

type Vec3 = [number, number, number];

/**
 * Shade a face by its world normal, the unified SUN_SHADE table
 * (sun northwest-high, townLook.ts): north/west faces catch the sun,
 * south/east lie in shade, tops are brightest. A rotated box's side
 * faces take the dominant world axis of their normal.
 */
function shadeForNormal(n: Vec3): number {
  if (n[1] > 0.5) return SUN_SHADE.top;
  if (n[2] > 0.5) return SUN_SHADE.south;
  if (n[2] < -0.5) return SUN_SHADE.north;
  if (n[0] < -0.5) return SUN_SHADE.west;
  return SUN_SHADE.east;
}

/**
 * Emit the car centred at (cx, cz), facing `yaw` (atan2(dx, dz):
 * 0 = nose south/+z, PI/2 = nose east/+x). Local axes: forward =
 * +Z local (the nose), left = +X local. Appends [x,y,z,r,g,b] verts
 * to `out` and returns the vertex count. The car is ~1.9 long x
 * 0.95 wide x 0.72 tall — a low, sleek body, a dark glass cabin set
 * toward the rear, four black wheels, pale headlights, a rear
 * spoiler, and a dark shadow blob under it.
 */
export function emitCar(out: number[], cx: number, cz: number, yaw: number): number {
  const start = out.length;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // Local (forward f, left r) -> world offset. Forward (sin, cos) is
  // the heading; left is (-cos, sin) — symmetric, so either handedness
  // reads the same on a symmetric car.
  const toWorld = (f: number, r: number): [number, number] => [
    cx + f * sin - r * cos,
    cz + f * cos + r * sin,
  ];
  const tri = (a: Vec3, b: Vec3, c: Vec3, color: Rgb) => {
    for (const p of [a, b, c]) out.push(p[0], p[1], p[2], color[0], color[1], color[2]);
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Rgb) => {
    tri(a, b, c, color);
    tri(a, c, d, color);
  };
  // A box by its 8 corners: centre (lf, lr) in local coords, half
  // extents (hf along forward, hr along left), y range [y0, y1].
  // Five faces (no bottom — never visible). Each face is shaded by
  // its world normal via shadeForNormal.
  const boxR = (
    lf: number,
    lr: number,
    hf: number,
    hr: number,
    y0: number,
    y1: number,
    color: Rgb,
  ) => {
    const corner = (f: number, r: number, y: number): Vec3 => {
      const [wx, wz] = toWorld(f, r);
      return [wx, y, wz];
    };
    // Local corners: f = forward, r = left (r+ is the car's left).
    const b0 = corner(lf - hf, lr - hr, y0); // back-right-bottom
    const b1 = corner(lf + hf, lr - hr, y0); // front-right-bottom
    const b2 = corner(lf + hf, lr + hr, y0); // front-left-bottom
    const b3 = corner(lf - hf, lr + hr, y0); // back-left-bottom
    const t0 = corner(lf - hf, lr - hr, y1);
    const t1 = corner(lf + hf, lr - hr, y1);
    const t2 = corner(lf + hf, lr + hr, y1);
    const t3 = corner(lf - hf, lr + hr, y1);
    // Face normals in world space (forward/right unit vectors).
    const fwd: Vec3 = [sin, 0, cos];
    const lft: Vec3 = [-cos, 0, sin];
    const face = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3) =>
      quad(a, b, c, d, shadeRgb(color, shadeForNormal(n)));
    face(b1, b2, t2, t1, fwd); // front (nose)
    face(b3, b0, t0, t3, [-fwd[0], 0, -fwd[2]]); // back
    face(b0, b1, t1, t0, [-lft[0], 0, -lft[2]]); // right side
    face(b2, b3, t3, t2, lft); // left side
    face(t0, t1, t2, t3, [0, 1, 0]); // top
  };
  // Shadow blob under the car (a flat dark quad, the animal-blob
  // pattern — no alpha in this renderer, so it is a dark quad).
  {
    const y = 0.015;
    const [a0, a1] = [toWorld(-1.02, -0.55), toWorld(1.02, -0.55)];
    const [b0, b1] = [toWorld(1.02, 0.55), toWorld(-1.02, 0.55)];
    quad([a0[0], y, a0[1]], [a1[0], y, a1[1]], [b0[0], y, b0[1]], [b1[0], y, b1[1]], CAR_SHADOW);
  }
  // Main body: low slab, full length.
  boxR(0, 0, 0.95, 0.475, 0.1, 0.44, CAR_BODY_RED);
  // Nose: a lower front box, so the nose slopes down from the orbit view.
  boxR(0.72, 0, 0.25, 0.45, 0.1, 0.3, CAR_BODY_RED);
  // Cabin: dark glass, set toward the rear.
  boxR(-0.28, 0, 0.425, 0.39, 0.44, 0.72, CAR_GLASS);
  // Rear spoiler.
  boxR(-0.88, 0, 0.06, 0.45, 0.44, 0.56, CAR_BODY_RED);
  // Wheels: four black boxes at the corners.
  boxR(0.62, -0.44, 0.18, 0.1, 0.02, 0.24, CAR_TYRE);
  boxR(0.62, 0.44, 0.18, 0.1, 0.02, 0.24, CAR_TYRE);
  boxR(-0.62, -0.44, 0.18, 0.1, 0.02, 0.24, CAR_TYRE);
  boxR(-0.62, 0.44, 0.18, 0.1, 0.02, 0.24, CAR_TYRE);
  // Headlights (pale) on the nose, taillights (bright red) on the back.
  boxR(0.96, -0.28, 0.01, 0.1, 0.28, 0.36, CAR_HEADLIGHT);
  boxR(0.96, 0.28, 0.01, 0.1, 0.28, 0.36, CAR_HEADLIGHT);
  boxR(-0.96, -0.28, 0.01, 0.1, 0.3, 0.38, CAR_TAILLIGHT);
  boxR(-0.96, 0.28, 0.01, 0.1, 0.3, 0.38, CAR_TAILLIGHT);
  return (out.length - start) / 6;
}
