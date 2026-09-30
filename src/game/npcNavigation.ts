// NPC navigation layer — physical movement for townsfolk, adventurers, and
// other simulated NPCs. This is the "how they get there" layer; schedules
// decide WHAT an NPC wants to do, this module decides HOW they walk there.
//
// Design principles (from the master prompt):
// - NEVER teleport an NPC between schedule states. Every position change is
//   the result of walking along a path, crossing a doorway, or a legitimate
//   simulation event (login, death, chunk LOD reconstruct).
// - The simulation owns the position. The renderer only displays it.
// - Buildings are obstacles. Doors are the only way in/out.
// - Chunk boundaries are crossed by walking, not by respawning.

export type NPCWorldLocation =
  | 'OUTDOOR'
  | 'ENTERING'
  | 'INTERIOR'
  | 'EXITING'
  | 'SLEEPING'
  | 'WORKING';

export type NavPoint = { x: number; y: number };

/** A doorway as a navigation link between exterior and interior. */
export type DoorwayLink = {
  id: string;
  /** Field point just outside the door where the NPC lines up to enter. */
  exterior: NavPoint;
  /** Interior point just inside the door where the NPC appears. */
  interior: NavPoint;
  /** Building rect (field units) — treated as an obstacle except at the door. */
  buildingRect?: { left: number; top: number; right: number; bottom: number };
};

export type NavPath = {
  waypoints: NavPoint[];
  /** Index of the next waypoint to walk toward. */
  index: number;
  destination: NavPoint;
  /** If set, the path goes through this doorway (enter or exit). */
  viaDoor?: DoorwayLink;
};

/** Minimal location state any NPC family can embed in its sim type. */
export type NPCLocationState = {
  location: NPCWorldLocation;
  /** Active path, if the NPC is walking somewhere. */
  path?: NavPath;
  /** Building id when INTERIOR / ENTERING / EXITING / SLEEPING. */
  buildingId?: string;
  /** Bed id when SLEEPING. */
  bedId?: string;
};

// ---------------------------------------------------------------------------
// Coarse grid A* for building avoidance.
// ---------------------------------------------------------------------------

const CELL = 4; // field units per cell; 140/4 = 35x35 grid
const GRID = 35;

type GridCell = { x: number; y: number };

function toCell(p: NavPoint): GridCell {
  return {
    x: Math.max(0, Math.min(GRID - 1, Math.floor(p.x / CELL))),
    y: Math.max(0, Math.min(GRID - 1, Math.floor(p.y / CELL))),
  };
}

function toPoint(c: GridCell): NavPoint {
  return { x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL / 2 };
}

export type ObstacleRect = { left: number; top: number; right: number; bottom: number };

function cellBlocked(
  cx: number,
  cy: number,
  obstacles: ObstacleRect[],
  exceptDoor?: DoorwayLink,
): boolean {
  const x0 = cx * CELL;
  const y0 = cy * CELL;
  const x1 = x0 + CELL;
  const y1 = y0 + CELL;
  for (const o of obstacles) {
    // A cell overlapping a building rect is blocked, unless it's the cell
    // containing the door's exterior point (so NPCs can reach the door).
    if (x1 > o.left && x0 < o.right && y1 > o.top && y0 < o.bottom) {
      if (exceptDoor) {
        const dc = toCell(exceptDoor.exterior);
        if (dc.x === cx && dc.y === cy) return false;
      }
      return true;
    }
  }
  return false;
}

function heuristic(a: GridCell, b: GridCell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Find a walkable path from `from` to `to`, avoiding building rects.
 * Returns waypoints in field units, or null if no path exists (caller should
 * use a fallback destination).
 */
export function findPath(
  from: NavPoint,
  to: NavPoint,
  obstacles: ObstacleRect[],
  viaDoor?: DoorwayLink,
): NavPoint[] | null {
  const start = toCell(from);
  const goal = toCell(to);
  if (start.x === goal.x && start.y === goal.y) return [to];

  const key = (c: GridCell) => c.y * GRID + c.x;
  const open: GridCell[] = [start];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[key(start), 0]]);
  const fScore = new Map<number, number>([[key(start), heuristic(start, goal)]]);
  const closed = new Set<number>();

  const neighbors = (c: GridCell): GridCell[] => {
    const out: GridCell[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        // No corner-cutting through blocked cells on diagonals.
        if (dx !== 0 && dy !== 0) {
          if (cellBlocked(c.x + dx, c.y, obstacles, viaDoor)) continue;
          if (cellBlocked(c.x, c.y + dy, obstacles, viaDoor)) continue;
        }
        if (cellBlocked(nx, ny, obstacles, viaDoor)) continue;
        out.push({ x: nx, y: ny });
      }
    }
    return out;
  };

  let found = false;
  let guard = 0;
  while (open.length > 0 && guard++ < 4000) {
    // Pick lowest fScore (linear scan is fine at 35x35).
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      if ((fScore.get(key(open[i])) ?? Infinity) < (fScore.get(key(open[best])) ?? Infinity)) best = i;
    }
    const current = open.splice(best, 1)[0];
    const ck = key(current);
    if (current.x === goal.x && current.y === goal.y) {
      found = true;
      break;
    }
    closed.add(ck);
    for (const nb of neighbors(current)) {
      const nk = key(nb);
      if (closed.has(nk)) continue;
      const tentative = (gScore.get(ck) ?? Infinity) + (nb.x !== current.x && nb.y !== current.y ? 1.414 : 1);
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, ck);
        gScore.set(nk, tentative);
        fScore.set(nk, tentative + heuristic(nb, goal));
        if (!open.some((c) => key(c) === nk)) open.push(nb);
      }
    }
  }

  if (!found) return null;

  // Reconstruct.
  const cells: GridCell[] = [];
  let ck = key(goal);
  cells.push(goal);
  while (cameFrom.has(ck)) {
    ck = cameFrom.get(ck)!;
    cells.push({ x: ck % GRID, y: Math.floor(ck / GRID) });
  }
  cells.reverse();

  // Convert to waypoints, then smooth: drop intermediate cells that have
  // clear line-of-sight (reduces zigzag).
  const raw = cells.map(toPoint);
  raw[0] = { ...from };
  raw[raw.length - 1] = { ...to };
  return smoothPath(raw, obstacles);
}

function lineClear(a: NavPoint, b: NavPoint, obstacles: ObstacleRect[]): boolean {
  // Sample along the segment; if any sample lands inside a building, blocked.
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    for (const o of obstacles) {
      if (x > o.left && x < o.right && y > o.top && y < o.bottom) return false;
    }
  }
  return true;
}

function smoothPath(points: NavPoint[], obstacles: ObstacleRect[]): NavPoint[] {
  if (points.length <= 2) return points;
  const out: NavPoint[] = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    if (!lineClear(points[anchor], points[i], obstacles)) {
      out.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------
// Path following.
// ---------------------------------------------------------------------------

export type StepResult = {
  position: NavPoint;
  /** The path with the waypoint index advanced past reached waypoints. */
  path: NavPath;
  /** True when the final destination was reached this step. */
  arrived: boolean;
  facing: 'up' | 'down' | 'left' | 'right';
  moving: boolean;
};

/**
 * Advance along a NavPath by `step` units. Pure function — returns the new
 * position, the path with its waypoint index advanced, and whether the final
 * destination was reached. Doorway transitions are handled by the caller on
 * `arrived` (position never snaps — the NPC walks through the doorway as the
 * first leg of the next path).
 */
export function stepAlongPath(path: NavPath, position: NavPoint, step: number): StepResult {
  const wp = path.waypoints[path.index];
  if (!wp) {
    return { position, path, arrived: true, facing: 'down', moving: false };
  }
  const dx = wp.x - position.x;
  const dy = wp.y - position.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 0.6) {
    // Reached this waypoint; advance to the next.
    const nextIndex = path.index + 1;
    if (nextIndex >= path.waypoints.length) {
      return { position: { ...wp }, path: { ...path, index: nextIndex }, arrived: true, facing: 'down', moving: false };
    }
    const next = { ...path, index: nextIndex };
    return stepAlongPath(next, { ...wp }, step);
  }

  const s = Math.min(step, dist);
  const facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
  return {
    position: { x: position.x + (dx / dist) * s, y: position.y + (dy / dist) * s },
    path,
    arrived: false,
    facing,
    moving: true,
  };
}

/**
 * Build a path to a doorway's exterior point (for entering), or from a
 * doorway's interior point (for exiting). Returns null if unreachable.
 */
export function pathToDoor(
  from: NavPoint,
  door: DoorwayLink,
  obstacles: ObstacleRect[],
): NavPath | null {
  const waypoints = findPath(from, door.exterior, obstacles, door);
  if (!waypoints) return null;
  // Waypoints end at the door exterior. The caller transitions ENTERING ->
  // INTERIOR on arrival and then walks the interior leg (through the doorway
  // to the bed) as a separate physical path — no position snaps.
  return { waypoints, index: 0, destination: { ...door.exterior }, viaDoor: door };
}

/** Build a plain outdoor path (no doors). */
export function pathTo(from: NavPoint, to: NavPoint, obstacles: ObstacleRect[]): NavPath | null {
  const waypoints = findPath(from, to, obstacles);
  if (!waypoints) return null;
  return { waypoints, index: 0, destination: { ...to } };
}
