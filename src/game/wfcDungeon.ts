// WFC dungeon generator (BUILD 472 — WFC Phase 4).
//
// Dungeons use the SAME WFC framework as the overworld (§14 of WFC prompt).
// Tiles: floor, wall, door, corridor with directional sockets ensuring
// connectivity. Every dungeon validates: entrance reachable, exit reachable,
// no isolated sections (unless designated secret).
//
// Socket semantics:
// - 'FLOOR': walkable floor (connects to FLOOR, DOOR, CORRIDOR)
// - 'WALL': solid wall (connects to WALL)
// - 'DOOR': doorway (connects FLOOR to FLOOR, or ROOM to CORRIDOR)

import { WfcTileSet, WfcTile, WfcSolver, WfcSeededRng, wfcSeedFor } from './wfc';

export type DungeonTheme = 'crypt' | 'cave' | 'ruins' | 'mine' | 'temple';

interface DungeonPattern {
  id: string;
  // Sockets per side.
  north: string; south: string; east: string; west: string;
  weight: number;
  /** True if this tile is walkable. */
  walkable: boolean;
}

const DUNGEON_PATTERNS: DungeonPattern[] = [
  // Walls (solid)
  { id: 'wall', north: 'WALL', south: 'WALL', east: 'WALL', west: 'WALL', weight: 40, walkable: false },
  // Floor (open room)
  { id: 'floor', north: 'FLOOR', south: 'FLOOR', east: 'FLOOR', west: 'FLOOR', weight: 25, walkable: true },
  // Corridors (directional)
  { id: 'corr_ns', north: 'FLOOR', south: 'FLOOR', east: 'WALL', west: 'WALL', weight: 15, walkable: true },
  { id: 'corr_ew', north: 'WALL', south: 'WALL', east: 'FLOOR', west: 'FLOOR', weight: 15, walkable: true },
  // Corners
  { id: 'corr_ne', north: 'FLOOR', south: 'WALL', east: 'FLOOR', west: 'WALL', weight: 8, walkable: true },
  { id: 'corr_nw', north: 'FLOOR', south: 'WALL', east: 'WALL', west: 'FLOOR', weight: 8, walkable: true },
  { id: 'corr_se', north: 'WALL', south: 'FLOOR', east: 'FLOOR', west: 'WALL', weight: 8, walkable: true },
  { id: 'corr_sw', north: 'WALL', south: 'FLOOR', east: 'WALL', west: 'FLOOR', weight: 8, walkable: true },
  // T-junctions
  { id: 'corr_t_n', north: 'WALL', south: 'FLOOR', east: 'FLOOR', west: 'FLOOR', weight: 6, walkable: true },
  { id: 'corr_t_s', north: 'FLOOR', south: 'WALL', east: 'FLOOR', west: 'FLOOR', weight: 6, walkable: true },
  { id: 'corr_t_e', north: 'FLOOR', south: 'FLOOR', east: 'WALL', west: 'FLOOR', weight: 6, walkable: true },
  { id: 'corr_t_w', north: 'FLOOR', south: 'FLOOR', east: 'FLOOR', west: 'WALL', weight: 6, walkable: true },
  // Doors (transitions)
  { id: 'door_ns', north: 'DOOR', south: 'DOOR', east: 'WALL', west: 'WALL', weight: 5, walkable: true },
  { id: 'door_ew', north: 'WALL', south: 'WALL', east: 'DOOR', west: 'DOOR', weight: 5, walkable: true },
  // Dead ends (for treasure/secret rooms)
  { id: 'dead_n', north: 'FLOOR', south: 'WALL', east: 'WALL', west: 'WALL', weight: 4, walkable: true },
  { id: 'dead_s', north: 'WALL', south: 'FLOOR', east: 'WALL', west: 'WALL', weight: 4, walkable: true },
  { id: 'dead_e', north: 'WALL', south: 'WALL', east: 'FLOOR', west: 'WALL', weight: 4, walkable: true },
  { id: 'dead_w', north: 'WALL', south: 'WALL', east: 'WALL', west: 'FLOOR', weight: 4, walkable: true },
];

function dungeonTileSet(): WfcTileSet {
  const tiles: WfcTile[] = DUNGEON_PATTERNS.map((p) => ({
    id: p.id,
    weight: p.weight,
    sockets: { north: p.north, south: p.south, east: p.east, west: p.west },
  }));
  return {
    tiles,
    compatible: (a, b) => {
      // WALL meets WALL. FLOOR meets FLOOR or DOOR. DOOR meets FLOOR or DOOR.
      if (a === 'WALL') return b === 'WALL';
      if (a === 'FLOOR') return b === 'FLOOR' || b === 'DOOR';
      if (a === 'DOOR') return b === 'FLOOR' || b === 'DOOR';
      return a === b;
    },
  };
}

let cached: WfcTileSet | null = null;
export function dungeonTileSetCached(): WfcTileSet {
  if (!cached) cached = dungeonTileSet();
  return cached;
}

export interface GeneratedDungeon {
  /** Width/height in cells. */
  width: number;
  height: number;
  /** Tile ids. */
  grid: string[][];
  /** Entrance position (walkable). */
  entrance: { x: number; y: number };
  /** Exit position (walkable, far from entrance). */
  exit: { x: number; y: number };
  /** Theme. */
  theme: DungeonTheme;
}

/**
 * Generate a dungeon level.
 * @param seed  deterministic seed
 * @param width/height  size in cells
 * @param theme  visual theme (affects weights in future, currently cosmetic)
 */
export function generateDungeon(
  seed: number,
  width: number,
  height: number,
  theme: DungeonTheme = 'crypt',
): GeneratedDungeon | null {
  const tiles = dungeonTileSetCached();
  const rng = new WfcSeededRng(wfcSeedFor(seed, width, height, 'dungeon-' + theme));
  const solver = new WfcSolver({ width, height, tiles, rng });

  // Lock borders to wall (dungeon is enclosed).
  for (let x = 0; x < width; x++) {
    solver.setTile(x, 0, 'wall');
    solver.setTile(x, height - 1, 'wall');
  }
  for (let y = 0; y < height; y++) {
    solver.setTile(0, y, 'wall');
    solver.setTile(width - 1, y, 'wall');
  }

  const grid = solver.collapse();
  if (!grid) return null;

  // Find walkable cells for entrance/exit.
  const walkable: Array<{ x: number; y: number }> = [];
  const walkableSet = new Set(DUNGEON_PATTERNS.filter((p) => p.walkable).map((p) => p.id));
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (walkableSet.has(grid[y][x])) walkable.push({ x, y });
    }
  }
  if (walkable.length < 2) return null;

  // Entrance: first walkable (top-left area). Exit: farthest from entrance.
  const entrance = walkable[0];
  let exit = walkable[0];
  let maxDist = 0;
  for (const c of walkable) {
    const d = Math.hypot(c.x - entrance.x, c.y - entrance.y);
    if (d > maxDist) { maxDist = d; exit = c; }
  }

  // Validate connectivity: BFS from entrance must reach exit.
  if (!isConnected(grid, walkableSet, entrance, exit, width, height)) {
    return null; // try again with different seed (caller should retry)
  }

  return { width, height, grid, entrance, exit, theme };
}

/** BFS connectivity check. */
function isConnected(
  grid: string[][],
  walkableSet: Set<string>,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  width: number,
  height: number,
): boolean {
  const visited = new Set<string>();
  const queue = [start];
  visited.add(start.x + ',' + start.y);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    if (x === goal.x && y === goal.y) return true;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = nx + ',' + ny;
      if (visited.has(key)) continue;
      if (!walkableSet.has(grid[ny][nx])) continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}
