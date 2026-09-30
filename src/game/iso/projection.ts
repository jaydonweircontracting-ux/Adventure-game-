/**
 * BUILD 356: Isometric 2.5D vertical slice — projection + navigation layer.
 *
 * The WORLD stays tile/grid based (integer tile coords, tile collision).
 * This module is a pure presentation/navigation layer:
 *   world tile (tx, ty, z) <-> screen pixels
 * Nothing in the simulation depends on screen pixels.
 *
 * Tile convention: diamond tiles, TILE_W x TILE_H (2:1 dimetric).
 *   screenX = (tx - ty) * TILE_W / 2
 *   screenY = (tx + ty) * TILE_H / 2 - z
 * Higher z renders higher on screen (elevation / object height).
 */

export const TILE_W = 64;
export const TILE_H = 32;
/** Wall height in pixels for the demo room. */
export const WALL_H = 56;

export interface ScreenPoint { x: number; y: number; }
export interface TilePoint { tx: number; ty: number; }

/** World tile (feet position, z = height above the floor plane) -> screen. */
export function isoToScreen(tx: number, ty: number, z = 0): ScreenPoint {
  return {
    x: (tx - ty) * (TILE_W / 2),
    y: (tx + ty) * (TILE_H / 2) - z,
  };
}

/** Screen -> fractional tile coords on the z=0 plane. */
export function screenToTile(sx: number, sy: number): { tx: number; ty: number } {
  const tx = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
  const ty = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  return { tx, ty };
}

/** Screen point -> integer tile (floor of fractional coords). */
export function screenToTileInt(sx: number, sy: number): TilePoint {
  const f = screenToTile(sx, sy);
  return { tx: Math.floor(f.tx), ty: Math.floor(f.ty) };
}

/**
 * Painter's-algorithm depth key. Larger = drawn later (in front).
 * Feet tile dominates; z only breaks ties for stacked objects.
 */
export function depthKey(tx: number, ty: number, z = 0): number {
  return (tx + ty) * 1000 + z;
}

/** The four corners of a tile diamond in screen space (z=0). */
export function tileDiamond(tx: number, ty: number): ScreenPoint[] {
  const c = isoToScreen(tx, ty);
  return [
    { x: c.x, y: c.y - TILE_H / 2 }, // north
    { x: c.x + TILE_W / 2, y: c.y }, // east
    { x: c.x, y: c.y + TILE_H / 2 }, // south
    { x: c.x - TILE_W / 2, y: c.y }, // west
  ];
}

/**
 * Breadth-first pathfinding on the tile grid. Returns the tile path from
 * start to goal (excluding start, including goal), or null if unreachable.
 */
export function findPath(
  start: TilePoint,
  goal: TilePoint,
  isWalkable: (tx: number, ty: number) => boolean,
  maxSteps = 400,
): TilePoint[] | null {
  const key = (x: number, y: number) => x + ',' + y;
  if (start.tx === goal.tx && start.ty === goal.ty) return [];
  if (!isWalkable(goal.tx, goal.ty)) return null;
  const prev = new Map<string, string>();
  const visited = new Set<string>([key(start.tx, start.ty)]);
  const queue: TilePoint[] = [start];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = false;
  while (queue.length > 0 && visited.size < maxSteps) {
    const cur = queue.shift()!;
    if (cur.tx === goal.tx && cur.ty === goal.ty) { found = true; break; }
    for (const [dx, dy] of DIRS) {
      const nx = cur.tx + dx, ny = cur.ty + dy;
      const k = key(nx, ny);
      if (!visited.has(k) && isWalkable(nx, ny)) {
        visited.add(k);
        prev.set(k, key(cur.tx, cur.ty));
        queue.push({ tx: nx, ty: ny });
      }
    }
  }
  if (!found) return null;
  const path: TilePoint[] = [];
  let k = key(goal.tx, goal.ty);
  const startK = key(start.tx, start.ty);
  while (k !== startK) {
    const [x, y] = k.split(',').map(Number);
    path.unshift({ tx: x, ty: y });
    k = prev.get(k)!;
  }
  return path;
}
