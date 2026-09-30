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
  // --- Stuck detection / recovery (BUILD 318). Managed by the sim via trackStep. ---
  /** Consecutive ticks with negligible movement toward the destination. */
  stuckTicks?: number;
  /** Times this destination has been replanned after getting stuck. */
  replans?: number;
  /** True when the NPC gave up on this destination and waits for a new one. */
  gaveUp?: boolean;
  /** Ticks remaining before the destination may be replanned again (anti-oscillation). */
  replanCooldown?: number;
};

/** After this many ticks without progress, the NPC is considered stuck. */
export const STUCK_TICK_LIMIT = 60;
/** How many times a stuck destination is replanned before the NPC waits. */
export const MAX_REPLANS = 1;
/** Ticks after a (re)plan during which a nearby destination change is ignored. */
export const REPLAN_COOLDOWN_TICKS = 10;
/** Destination changes within this distance don't trigger a replan during cooldown. */
export const REPLAN_HYSTERESIS = 3;

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
/**
 * Field road corridors (BUILD 321): the visual road renders at --road-x/--road-y
 * 47% with 9% width/height on the 140-unit field → 65.8..78.4 units. Slightly
 * widened so the 4-unit A* cells register as road. Pure.
 */
const ROAD_MIN = 64;
const ROAD_MAX = 80;
const ROAD_MID = 72;
/** Cost multiplier for A* steps through non-road cells (road cells cost 1).
 * BUILD 328: raised from 1.45 so cross-town trips visibly divert onto roads
 * instead of cutting straight across the grass — NPCs walk like they live
 * here. Detours stay bounded: a road route up to 2x the direct walk wins. */
const OFFROAD_COST = 2.0;

/**
 * Is a field-unit point on a road arm? `roadPiece` is the chunk's road string
 * ('n'/'s'/'e'/'w' combos, 'none'). The center intersection belongs to every arm.
 */
export function isOnFieldRoad(x: number, y: number, roadPiece?: string): boolean {
  if (!roadPiece || roadPiece === 'none') return false;
  const onH = y >= ROAD_MIN && y <= ROAD_MAX;
  const onV = x >= ROAD_MIN && x <= ROAD_MAX;
  if (onH && onV) return true;
  if (onH && roadPiece.includes('e') && x >= ROAD_MID) return true;
  if (onH && roadPiece.includes('w') && x < ROAD_MID) return true;
  if (onV && roadPiece.includes('s') && y >= ROAD_MID) return true;
  if (onV && roadPiece.includes('n') && y < ROAD_MID) return true;
  return false;
}

function cellCenter(c: GridCell): NavPoint {
  return { x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL / 2 };
}

export function findPath(
  from: NavPoint,
  to: NavPoint,
  obstacles: ObstacleRect[],
  viaDoor?: DoorwayLink,
  /** Chunk road piece — when set, A* prefers road cells over open ground. */
  roadPiece?: string,
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
      const stepBase = nb.x !== current.x && nb.y !== current.y ? 1.414 : 1;
      // Road preference: road cells cost 1, open ground costs more, so NPCs
      // drift toward roads when they're roughly along the way — but won't
      // take absurd detours (the 2.0x factor bounds the tradeoff).
      const cc = cellCenter(nb);
      const roadFactor = !roadPiece || isOnFieldRoad(cc.x, cc.y, roadPiece) ? 1 : OFFROAD_COST;
      const tentative = (gScore.get(ck) ?? Infinity) + stepBase * roadFactor;
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
  return smoothPath(raw, obstacles, roadPiece);
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

function smoothPath(points: NavPoint[], obstacles: ObstacleRect[], roadPiece?: string): NavPoint[] {
  if (points.length <= 2) return points;
  const out: NavPoint[] = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    const shortcutClear = lineClear(points[anchor], points[i], obstacles);
    let keep = !shortcutClear;
    // Road preference: don't smooth away a deliberate road detour. If the raw
    // stretch from the anchor to i hugs the road much more than the straight
    // shortcut, the NPC keeps walking the road instead of cutting the grass.
    // Without a road piece this is a pure no-op.
    if (roadPiece && shortcutClear) {
      const rawFrac = roadFractionOfPolyline(points, anchor, i, roadPiece);
      const cutFrac = roadFractionOfSegment(points[anchor], points[i], roadPiece);
      if (rawFrac > cutFrac + 0.25) keep = true;
    }
    if (keep) {
      out.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Fraction of segment a-b lying on a road arm (sampled every ~4u). Pure. */
function roadFractionOfSegment(a: NavPoint, b: NavPoint, roadPiece: string): number {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / 4));
  let on = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (isOnFieldRoad(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, roadPiece)) on++;
  }
  return on / (steps + 1);
}

/** Fraction of the polyline points[lo..hi] lying on a road arm. Pure. */
function roadFractionOfPolyline(points: NavPoint[], lo: number, hi: number, roadPiece: string): number {
  let on = 0;
  let total = 0;
  for (let k = lo; k < hi; k++) {
    const a = points[k];
    const b = points[k + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      total++;
      if (isOnFieldRoad(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, roadPiece)) on++;
    }
  }
  return total === 0 ? 0 : on / total;
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

export type TrackStepResult = {
  position: NavPoint;
  path: NavPath | undefined;
  moving: boolean;
  facing: 'up' | 'down' | 'left' | 'right';
  /** True when the NPC gave up on this destination and is waiting for a new one. */
  waiting: boolean;
};

/**
 * Stuck detection + recovery wrapper around a stepAlongPath result.
 * Call only when `res.arrived` is false (arrival is handled by the caller).
 * Pure: returns the fields the caller merges into the NPC.
 *
 * - Tracks consecutive ticks with negligible movement.
 * - Past STUCK_TICK_LIMIT: replans once from the current position, then
 *   gives up — the NPC waits (moving=false, path.gaveUp) instead of pacing
 *   forever. A new schedule destination clears the wait.
 * - Decrements the anti-oscillation replan cooldown each tick.
 */
export function trackStep(
  path: NavPath,
  prevPosition: NavPoint,
  res: StepResult,
  replan: (from: NavPoint) => NavPath | null,
): TrackStepResult {
  const moved = Math.hypot(res.position.x - prevPosition.x, res.position.y - prevPosition.y);
  const stuckTicks = moved < 0.05 ? (path.stuckTicks ?? 0) + 1 : 0;
  const ticked: NavPath = {
    ...res.path,
    stuckTicks,
    replanCooldown: Math.max(0, (res.path.replanCooldown ?? 0) - 1),
  };
  if (stuckTicks <= STUCK_TICK_LIMIT) {
    return { position: res.position, path: ticked, moving: true, facing: res.facing, waiting: false };
  }
  const replans = path.replans ?? 0;
  if (replans < MAX_REPLANS) {
    const fresh = replan(res.position);
    if (fresh) {
      return {
        position: res.position,
        path: { ...fresh, stuckTicks: 0, replans: replans + 1 },
        moving: true,
        facing: res.facing,
        waiting: false,
      };
    }
  }
  return {
    position: res.position,
    path: { ...ticked, gaveUp: true },
    moving: false,
    facing: res.facing,
    waiting: true,
  };
}

/**
 * Validate a destination before pathing: clamp to field bounds and nudge
 * points that land inside a building rect to the nearest outside edge.
 * Destinations are never left inside walls — the old straight-line fallback
 * walked NPCs through buildings.
 */
export function validateDestination(
  p: NavPoint,
  obstacles: ObstacleRect[],
): { point: NavPoint; corrected: boolean } {
  let x = Math.max(2, Math.min(138, p.x));
  let y = Math.max(2, Math.min(138, p.y));
  let corrected = x !== p.x || y !== p.y;
  // Nudge margin: larger than the A* cell (4 units) so the corrected point's
  // cell never still overlaps the rect. Repeat until stable (a nudge out of
  // one rect can land inside another).
  const MARGIN = 5;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const o of obstacles) {
      if (x > o.left && x < o.right && y > o.top && y < o.bottom) {
        const dl = x - o.left;
        const dr = o.right - x;
        const dt = y - o.top;
        const db = o.bottom - y;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) x = o.left - MARGIN;
        else if (m === dr) x = o.right + MARGIN;
        else if (m === dt) y = o.top - MARGIN;
        else y = o.bottom + MARGIN;
        moved = true;
        corrected = true;
      }
    }
    if (!moved) break;
  }
  x = Math.max(2, Math.min(138, x));
  y = Math.max(2, Math.min(138, y));
  return { point: { x, y }, corrected };
}

/**
 * Build a path to a doorway's exterior point (for entering), or from a
 * doorway's interior point (for exiting). Returns null if unreachable.
 */
export function pathToDoor(
  from: NavPoint,
  door: DoorwayLink,
  obstacles: ObstacleRect[],
  roadPiece?: string,
): NavPath | null {
  const target = validateDestination(door.exterior, obstacles).point;
  const waypoints = findPath(from, target, obstacles, door, roadPiece);
  if (!waypoints) return null;
  // Waypoints end at the door exterior. The caller transitions ENTERING ->
  // INTERIOR on arrival and then walks the interior leg (through the doorway
  // to the bed) as a separate physical path — no position snaps.
  return { waypoints, index: 0, destination: { ...door.exterior }, viaDoor: door, replanCooldown: REPLAN_COOLDOWN_TICKS };
}

/** Build a plain outdoor path (no doors). The destination is validated first. */
export function pathTo(from: NavPoint, to: NavPoint, obstacles: ObstacleRect[], roadPiece?: string): NavPath | null {
  const target = validateDestination(to, obstacles).point;
  const waypoints = findPath(from, target, obstacles, undefined, roadPiece);
  if (!waypoints) return null;
  return { waypoints, index: 0, destination: { ...to }, replanCooldown: REPLAN_COOLDOWN_TICKS };
}

/**
 * A validated straight-line fallback for when A* finds no route: walks
 * directly at the (validated) target instead of into a wall. Last resort —
 * callers should prefer waiting over this when the target is far.
 */
export function straightFallbackPath(to: NavPoint, obstacles: ObstacleRect[]): NavPath {
  const target = validateDestination(to, obstacles).point;
  return { waypoints: [target], index: 0, destination: { ...to }, replanCooldown: REPLAN_COOLDOWN_TICKS };
}
