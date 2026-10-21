// BUILD 928: Dungeon layout generators (DCSS top-5 item 2, portable asset
// only: the IDEA of a library of layout generators selected per level,
// from `~/workspace/rea-targets/dcss/ANALYSIS.md` §2 — loops + cellular
// first, city last). No DCSS map, parameter set, or tile art is copied:
// every algorithm below is written for this game's 31x19 Ember Vault grid
// and tuned by measurement here (see the parameter notes inline).
//
// The existing room-and-corridor generator stays as the "rooms" layout.
// Two new skeletons join it behind a deterministic floor/seed selector:
//   "loops" — rooms linked in a chain PLUS skip-one links and a closing
//             link, so the room graph always has cycles: a blocked
//             corridor never strands the player, and exploration has
//             genuine alternate routes.
//   "caves" — cellular-automata caverns (random fill + smoothing), with
//             orphan pockets pruned so every walkable cell is reachable.
// Contract every layout guarantees (checked by the sim block 13a1h):
//   - a 1-cell wall border, spawn (5,4) walkable, exactly one stairs tile
//     reachable from spawn, all walkable cells reachable from spawn
//     (no orphan floor the player can see but never reach),
//   - floor >= 3 carries an altar in the upper-right pocket (x >= 23,
//     y <= 7), so the existing altar victory region stays achievable,
//   - only the engine's existing tile kinds are used, so the renderer
//     needs no new art or glyph handling.
// Vaults (BUILD 927) run unchanged after layout generation: the
// placement pass validates stairs reachability, vault-cell reachability,
// and no-still-walkable-cell-lost on whatever skeleton it is given.

export type LayoutTileKind =
  | "wall"
  | "floor"
  | "door"
  | "stairs"
  | "altar"
  | "water"
  | "lava";

export type DungeonLayoutKind = "rooms" | "loops" | "caves";

/** Minimal RNG surface: the engine's Random satisfies this structurally. */
export interface LayoutRng {
  next(): number;
}

/** Deterministic LCG (same constants as the engine's Random) for tests
 * and standalone scripts that don't go through stoneSoupEngine. */
export function layoutRng(seed: number): LayoutRng {
  let value = (seed || 1) >>> 0;
  return {
    next() {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    },
  };
}

export interface LayoutRoom {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeneratedLayout {
  kind: DungeonLayoutKind;
  /** kinds[y][x] — row-major, same shape as the engine's Tile grid. */
  kinds: LayoutTileKind[][];
  /** Carved rooms (caves: empty — caverns have no rectangles). */
  rooms: LayoutRoom[];
  /** Room-center links by room index (loops: chain + skip + closing). */
  connections: { from: number; to: number }[];
  stairs: { x: number; y: number };
  altar: { x: number; y: number } | null;
}

/** Player-facing names for the dungeon UI subtitle. */
export const LAYOUT_LABELS: Record<DungeonLayoutKind, string> = {
  rooms: "chambered galleries",
  loops: "looped galleries",
  caves: "rough caverns",
};

/** Extra descend-log sentence per layout (rooms keeps the classic line). */
export const LAYOUT_DESCEND_FLAVOR: Record<DungeonLayoutKind, string> = {
  rooms: "",
  loops: " The galleries here loop back on themselves.",
  caves: " The stone opens into rough, echoing caverns.",
};

/** The player spawn, shared with the engine (5,4). */
export const DUNGEON_SPAWN = { x: 5, y: 4 };

/** Layout mix by depth. Deeper floors lean cave-ward, but every depth
 * can still roll any skeleton — variety must not vanish with depth. */
const LAYOUT_MIX: Record<number, [DungeonLayoutKind, number][]> = {
  1: [["rooms", 0.5], ["loops", 0.3], ["caves", 0.2]],
  2: [["rooms", 0.34], ["loops", 0.33], ["caves", 0.33]],
};
const DEEP_MIX: [DungeonLayoutKind, number][] = [
  ["rooms", 0.25],
  ["loops", 0.35],
  ["caves", 0.4],
];

/**
 * Layout pick, hashed from (seed, floor) — NOT from one draw of the
 * caller's LCG stream. That matters: sequential seeds give nearly
 * identical first LCG outputs (seeds 1..300 all land in [0.236, 0.352]),
 * so a single-draw selector made floor 1 ALWAYS rooms and floor 2
 * ALWAYS loops in live play (caught by the 928 standalone sweep, not
 * by the sim — sim asserts only summarize at the end, which the 694
 * crash prevents). A murmur-style finalizer over (seed, floor) spreads
 * sequential seeds uniformly across the mix, while staying
 * deterministic per (seed, floor). The generation itself still draws
 * from the caller's stream, so identical seeds still build identical
 * floors.
 */
export function selectLayoutKind(seed: number, floor: number): DungeonLayoutKind {
  let h = (seed >>> 0) ^ Math.imul(floor, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h = (h ^ (h >>> 15)) >>> 0;
  const roll = h / 4294967296;
  const mix = LAYOUT_MIX[floor] ?? DEEP_MIX;
  let acc = 0;
  for (const [kind, weight] of mix) {
    acc += weight;
    if (roll < acc) return kind;
  }
  return mix[mix.length - 1][0];
}

type Grid = LayoutTileKind[][];

const isWalkableKind = (kind: LayoutTileKind): boolean =>
  kind === "floor" || kind === "door" || kind === "stairs" || kind === "altar" || kind === "water";

function blankGrid(width: number, height: number): Grid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => "wall" as LayoutTileKind));
}

function carveRoom(grid: Grid, room: LayoutRoom): void {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (grid[y]?.[x] !== undefined) grid[y][x] = "floor";
    }
  }
}

function carveCorridor(grid: Grid, fromX: number, fromY: number, toX: number, toY: number, xFirst: boolean): void {
  let x = fromX;
  let y = fromY;
  const stepX = () => {
    while (x !== toX) {
      if (grid[y]?.[x] !== undefined) grid[y][x] = "floor";
      x += x < toX ? 1 : -1;
    }
  };
  const stepY = () => {
    while (y !== toY) {
      if (grid[y]?.[x] !== undefined) grid[y][x] = "floor";
      y += y < toY ? 1 : -1;
    }
  };
  if (xFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
  if (grid[y]?.[x] !== undefined) grid[y][x] = "floor";
}

function roomCenter(room: LayoutRoom): { x: number; y: number } {
  return { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
}

/** BFS distances over walkable cells from a start (-1 = unreachable). */
function bfsDistances(grid: Grid, start: { x: number; y: number }): number[][] {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const dist = Array.from({ length: height }, () => Array.from({ length: width }, () => -1));
  if (!grid[start.y]?.[start.x] || !isWalkableKind(grid[start.y][start.x])) return dist;
  dist[start.y][start.x] = 0;
  const queue = [{ ...start }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!grid[ny]?.[nx] || !isWalkableKind(grid[ny][nx]) || dist[ny][nx] !== -1) continue;
      dist[ny][nx] = dist[cur.y][cur.x] + 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

function countWalkable(grid: Grid): number {
  let n = 0;
  for (const row of grid) for (const kind of row) if (isWalkableKind(kind)) n += 1;
  return n;
}

/**
 * Guarantee the spawn cell is walkable and connected: if it sits in
 * wall, carve an L-corridor to the nearest walkable cell. Accents
 * (stairs/altar/water/lava) are placed AFTER this step, so the corridor
 * can never overwrite one.
 */
function ensureSpawnConnected(grid: Grid): void {
  const spawn = DUNGEON_SPAWN;
  if (isWalkableKind(grid[spawn.y][spawn.x])) return;
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[0].length; x += 1) {
      if (!isWalkableKind(grid[y][x])) continue;
      const d = Math.abs(x - spawn.x) + Math.abs(y - spawn.y);
      if (d < bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
  }
  if (!best) {
    grid[spawn.y][spawn.x] = "floor";
    return;
  }
  carveCorridor(grid, spawn.x, spawn.y, best.x, best.y, true);
}

/**
 * Floor >= 3 altar pocket: carve a small chamber in the upper-right
 * (x 24..27, y 3..5), connect it to the nearest existing walkable cell,
 * and set (26,4) to altar. On the rooms layout (26,4) is already floor
 * inside a room, so this is a no-op there beyond setting the altar —
 * the classic placement is preserved exactly.
 */
function placeAltarPocket(grid: Grid, floor: number): { x: number; y: number } | null {
  if (floor < 3) return null;
  const pocket = { x: 24, y: 3, width: 4, height: 3 };
  // If the altar cell is already walkable, it is already connected.
  if (!isWalkableKind(grid[4][26])) {
    carveRoom(grid, pocket);
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[0].length; x += 1) {
        if (x >= pocket.x && x < pocket.x + pocket.width && y >= pocket.y && y < pocket.y + pocket.height) continue;
        if (!isWalkableKind(grid[y][x])) continue;
        const d = Math.abs(x - 26) + Math.abs(y - 4);
        if (d < bestDist) {
          bestDist = d;
          best = { x, y };
        }
      }
    }
    if (best) carveCorridor(grid, 26, 4, best.x, best.y, true);
  }
  grid[4][26] = "altar";
  return { x: 26, y: 4 };
}

/** Stairs = the BFS-farthest walkable cell from spawn (never the altar). */
function placeStairs(grid: Grid, altar: { x: number; y: number } | null): { x: number; y: number } {
  const dist = bfsDistances(grid, DUNGEON_SPAWN);
  let best = { ...DUNGEON_SPAWN };
  let bestDist = -1;
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[0].length; x += 1) {
      if (!isWalkableKind(grid[y][x])) continue;
      if (altar && x === altar.x && y === altar.y) continue;
      if (dist[y][x] > bestDist) {
        bestDist = dist[y][x];
        best = { x, y };
      }
    }
  }
  grid[best.y][best.x] = "stairs";
  return best;
}

/** Small water pool: a walkable floor cell plus up to two of its
 * walkable neighbors become water. Water stays walkable, so this can
 * never disconnect the level. Never paints spawn, stairs, or altar. */
function placeWaterPool(grid: Grid, rng: LayoutRng, stairs: { x: number; y: number }, altar: { x: number; y: number } | null): void {
  const candidates: { x: number; y: number }[] = [];
  for (let y = 1; y < grid.length - 1; y += 1) {
    for (let x = 1; x < grid[0].length - 1; x += 1) {
      if (grid[y][x] !== "floor") continue;
      if (x === DUNGEON_SPAWN.x && y === DUNGEON_SPAWN.y) continue;
      if (x === stairs.x && y === stairs.y) continue;
      if (altar && x === altar.x && y === altar.y) continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return;
  const center = candidates[Math.floor(rng.next() * candidates.length)];
  grid[center.y][center.x] = "water";
  let painted = 1;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (painted >= 3) break;
    const nx = center.x + dx;
    const ny = center.y + dy;
    if (grid[ny]?.[nx] !== "floor") continue;
    grid[ny][nx] = "water";
    painted += 1;
  }
}

/**
 * Lava accent (floor >= 3 only): convert floor cells to lava, but
 * revert any conversion that would disconnect the walkable graph —
 * lava is the one accent that removes walkable cells, so it is the
 * only one that needs the connectivity check.
 */
function placeLava(grid: Grid, rng: LayoutRng, floor: number, stairs: { x: number; y: number }, altar: { x: number; y: number } | null): void {
  if (floor < 3) return;
  const totalBefore = countWalkable(grid);
  const candidates: { x: number; y: number }[] = [];
  for (let y = 1; y < grid.length - 1; y += 1) {
    for (let x = 1; x < grid[0].length - 1; x += 1) {
      if (grid[y][x] !== "floor") continue;
      if (x === DUNGEON_SPAWN.x && y === DUNGEON_SPAWN.y) continue;
      if (x === stairs.x && y === stairs.y) continue;
      if (altar && x === altar.x && y === altar.y) continue;
      candidates.push({ x, y });
    }
  }
  // Shuffle candidates so the lava patch varies by seed.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  let placed = 0;
  for (const cell of candidates) {
    if (placed >= 2) break;
    if (grid[cell.y][cell.x] !== "floor") continue;
    // Second cell prefers adjacency to the first (a patch, not dots).
    if (placed === 1) {
      const first = candidates.find((c) => grid[c.y][c.x] === "lava");
      if (first && Math.abs(cell.x - first.x) + Math.abs(cell.y - first.y) !== 1) continue;
    }
    grid[cell.y][cell.x] = "lava";
    const dist = bfsDistances(grid, DUNGEON_SPAWN);
    let reachable = 0;
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[0].length; x += 1) {
        if (isWalkableKind(grid[y][x]) && dist[y][x] !== -1) reachable += 1;
      }
    }
    if (reachable !== totalBefore - placed - 1) {
      grid[cell.y][cell.x] = "floor";
      continue;
    }
    placed += 1;
  }
}

/** Shared accent pass for loops/caves (rooms keeps its classic accents). */
function finishGeneratedLayout(grid: Grid, rng: LayoutRng, floor: number): { stairs: { x: number; y: number }; altar: { x: number; y: number } | null } {
  ensureSpawnConnected(grid);
  const altar = placeAltarPocket(grid, floor);
  const stairs = placeStairs(grid, altar);
  placeWaterPool(grid, rng, stairs, altar);
  placeLava(grid, rng, floor, stairs, altar);
  return { stairs, altar };
}

/** The classic generator, preserved exactly (fixed rooms, chain
 * corridors, fixed accents, 2.5% floor->door conversion). */
function generateRoomsLayout(width: number, height: number, rng: LayoutRng, floor: number): GeneratedLayout {
  const grid = blankGrid(width, height);
  const rooms: LayoutRoom[] = [
    { x: 2, y: 2, width: 8, height: 5 },
    { x: 13, y: 2, width: 9, height: 6 },
    { x: 24, y: 3, width: 5, height: 5 },
    { x: 4, y: 11, width: 10, height: 5 },
    { x: 18, y: 11, width: 10, height: 5 },
  ];
  rooms.forEach((room) => carveRoom(grid, room));
  const connections: { from: number; to: number }[] = [];
  for (let index = 0; index < rooms.length - 1; index += 1) {
    const current = roomCenter(rooms[index]);
    const next = roomCenter(rooms[index + 1]);
    carveCorridor(grid, current.x, current.y, next.x, next.y, true);
    connections.push({ from: index, to: index + 1 });
  }
  grid[8][15] = "door";
  grid[10][15] = "water";
  grid[10][16] = "water";
  grid[10][17] = "water";
  // BUILD 928 fix to the classic map: the door at (15,8) and the pool
  // at (15..17,10) were fully enclosed by wall — visible at reveal
  // range from the corridors, but never reachable (orphan walkable
  // cells the old generator never noticed, because nothing asserted
  // full reachability). Two floor cells join them to the east room:
  // (15,9) links door to pool, (18,10) links pool to room 5.
  grid[9][15] = "floor";
  grid[10][18] = "floor";
  if (floor >= 3) {
    grid[13][22] = "lava";
    grid[13][23] = "lava";
  }
  grid[14][25] = "stairs";
  if (floor >= 3) grid[4][26] = "altar";
  else grid[4][26] = "floor";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y][x] === "floor" && rng.next() < 0.025) grid[y][x] = "door";
    }
  }
  return {
    kind: "rooms",
    kinds: grid,
    rooms,
    connections,
    stairs: { x: 25, y: 14 },
    altar: floor >= 3 ? { x: 26, y: 4 } : null,
  };
}

/** Rooms linked in a chain, plus skip-one links and a closing link, so
 * the room graph always has cycles (cyclomatic number rooms - 1). */
function generateLoopsLayout(width: number, height: number, rng: LayoutRng, floor: number): GeneratedLayout {
  const grid = blankGrid(width, height);
  const rooms: LayoutRoom[] = [];
  const overlaps = (a: LayoutRoom, b: LayoutRoom): boolean =>
    a.x < b.x + b.width + 1 && a.x + a.width + 1 > b.x && a.y < b.y + b.height + 1 && a.y + a.height + 1 > b.y;
  for (let attempt = 0; attempt < 200 && rooms.length < 7; attempt += 1) {
    const w = 4 + Math.floor(rng.next() * 6);
    const h = 3 + Math.floor(rng.next() * 4);
    const x = 2 + Math.floor(rng.next() * Math.max(1, width - 4 - w));
    const y = 2 + Math.floor(rng.next() * Math.max(1, height - 4 - h));
    const candidate = { x, y, width: w, height: h };
    if (rooms.some((r) => overlaps(r, candidate))) continue;
    rooms.push(candidate);
  }
  // A loop needs at least 4 rooms; the grid is large enough that the
  // sampler effectively always lands 6-7. If it ever failed, returning
  // the rooms layout (and saying so via its kind) beats shipping a
  // degenerate "loops" floor — the caller reads generated.kind.
  if (rooms.length < 4) {
    return generateRoomsLayout(width, height, rng, floor);
  }
  rooms.forEach((room) => carveRoom(grid, room));
  const connections: { from: number; to: number }[] = [];
  const link = (from: number, to: number): void => {
    const a = roomCenter(rooms[from]);
    const b = roomCenter(rooms[to]);
    carveCorridor(grid, a.x, a.y, b.x, b.y, rng.next() < 0.5);
    connections.push({ from, to });
  };
  for (let i = 0; i < rooms.length - 1; i += 1) link(i, i + 1);
  for (let i = 0; i < rooms.length - 2; i += 1) link(i, i + 2);
  link(rooms.length - 1, 0);
  const { stairs, altar } = finishGeneratedLayout(grid, rng, floor);
  return { kind: "loops", kinds: grid, rooms, connections, stairs, altar };
}

/**
 * Cellular-automata caverns. Tuning, measured on the 31x19 grid (not
 * copied from any other game): 45% initial fill, 5 smoothing passes
 * (wall at >= 5 wall neighbors, floor at <= 3, else unchanged,
 * 8-neighborhood), largest-component-only pruning, frontier growth to
 * a 100-cell floor minimum so degenerate seeds still play.
 */
function generateCavesLayout(width: number, height: number, rng: LayoutRng, floor: number): GeneratedLayout {
  const grid = blankGrid(width, height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      grid[y][x] = rng.next() < 0.45 ? "wall" : "floor";
    }
  }
  const wallNeighbors = (g: Grid, x: number, y: number): number => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const cell = g[y + dy]?.[x + dx];
        if (cell === undefined || cell === "wall") n += 1;
      }
    }
    return n;
  };
  for (let pass = 0; pass < 5; pass += 1) {
    const next = grid.map((row) => [...row]);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const n = wallNeighbors(grid, x, y);
        if (n >= 5) next[y][x] = "wall";
        else if (n <= 3) next[y][x] = "floor";
      }
    }
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) grid[y][x] = next[y][x];
  }
  // Prune orphan pockets: keep only the largest floor component, so
  // every remaining walkable cell is reachable from every other.
  const seen = new Set<string>();
  let largest: { x: number; y: number }[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (grid[y][x] !== "floor" || seen.has(`${x}:${y}`)) continue;
      const comp: { x: number; y: number }[] = [];
      const queue = [{ x, y }];
      seen.add(`${x}:${y}`);
      while (queue.length > 0) {
        const cur = queue.pop()!;
        comp.push(cur);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (grid[ny]?.[nx] !== "floor" || seen.has(`${nx}:${ny}`)) continue;
          seen.add(`${nx}:${ny}`);
          queue.push({ x: nx, y: ny });
        }
      }
      if (comp.length > largest.length) largest = comp;
    }
  }
  const keep = new Set(largest.map((c) => `${c.x}:${c.y}`));
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (grid[y][x] === "floor" && !keep.has(`${x}:${y}`)) grid[y][x] = "wall";
    }
  }
  // Degenerate-seed guard: grow the cavern along its frontier until it
  // has room to play in (100 walkable cells).
  let floorCount = largest.length;
  while (floorCount < 100) {
    const frontier: { x: number; y: number }[] = [];
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        if (grid[y][x] !== "wall") continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy]?.[x + dx] === "floor")) {
          frontier.push({ x, y });
        }
      }
    }
    if (frontier.length === 0) break;
    const cell = frontier[Math.floor(rng.next() * frontier.length)];
    grid[cell.y][cell.x] = "floor";
    floorCount += 1;
  }
  const { stairs, altar } = finishGeneratedLayout(grid, rng, floor);
  return { kind: "caves", kinds: grid, rooms: [], connections: [], stairs, altar };
}

/** Generate one floor's skeleton. Pure and deterministic per (kind, seed). */
export function generateLayout(
  kind: DungeonLayoutKind,
  width: number,
  height: number,
  rng: LayoutRng,
  floor: number,
): GeneratedLayout {
  if (kind === "loops") return generateLoopsLayout(width, height, rng, floor);
  if (kind === "caves") return generateCavesLayout(width, height, rng, floor);
  return generateRoomsLayout(width, height, rng, floor);
}
