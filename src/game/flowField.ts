// Flow field navigation (BUILD 470 — Terrain Phase 1).
//
// For large groups sharing a destination: instead of N independent A*
// searches, compute ONE flow field from the goal outward, then have all
// entities sample it. Essential for 100s of enemies chasing the player.
//
// Design (from the terrain master prompt §11-20):
// - Operates on the game's logical grid coordinates (not screen space).
// - Local windows (not whole-world) — rebuilt as player moves.
// - Cached: rebuild only when goal moves far, terrain changes, or expires.
// - Movement costs per cell type (road cheap, forest expensive, water blocked).
// - Smoothed velocity (no robotic 90-degree snaps).
// - Integrates with spatial hash (separation) — flow field says WHERE,
//   spatial hash says WHO is nearby.

export interface FlowFieldOptions {
  /** Grid width/height in cells. */
  width: number;
  height: number;
  /** Movement cost per cell. 1 = normal, <1 = fast, Infinity = blocked. */
  costAt: (x: number, y: number) => number;
}

export interface FlowVector {
  dx: number; // -1, 0, or 1 (or 0,0 if unreachable/blocked)
  dy: number;
}

// 8-directional movement.
const DIRS = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: Math.SQRT2 },
  { dx: 1, dy: -1, cost: Math.SQRT2 },
  { dx: -1, dy: 1, cost: Math.SQRT2 },
  { dx: -1, dy: -1, cost: Math.SQRT2 },
];

/**
 * Flow field: for each cell, the direction toward the goal.
 * Built via Dijkstra from the goal outward (integration field).
 */
export class FlowField {
  readonly width: number;
  readonly height: number;
  /** Goal cell. */
  goalX: number;
  goalY: number;
  /** Per-cell flow vector. */
  private vectors: FlowVector[];
  /** Per-cell integration cost (distance from goal). Infinity = unreachable. */
  private costs: number[];
  /** Tick when built (for expiry). */
  builtTick: number = 0;
  /** Generation counter (for cache invalidation). */
  generation: number = 0;

  constructor(opts: FlowFieldOptions, goalX: number, goalY: number, tick: number = 0) {
    this.width = opts.width;
    this.height = opts.height;
    this.goalX = goalX;
    this.goalY = goalY;
    this.builtTick = tick;
    const n = opts.width * opts.height;
    this.vectors = new Array(n).fill(null).map(() => ({ dx: 0, dy: 0 }));
    this.costs = new Array(n).fill(Infinity);
    this.build(opts.costAt);
  }

  private idx(x: number, y: number): number {
    return y * this.width + x;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Dijkstra from goal outward. */
  private build(costAt: (x: number, y: number) => number): void {
    // Simple priority queue via sorted array (fine for local windows).
    // For larger fields, use a binary heap.
    const open: Array<{ x: number; y: number; cost: number }> = [];
    const goalIdx = this.idx(this.goalX, this.goalY);
    this.costs[goalIdx] = 0;
    open.push({ x: this.goalX, y: this.goalY, cost: 0 });

    while (open.length > 0) {
      // Extract min (linear scan — ok for small windows; use heap if large).
      let minIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].cost < open[minIdx].cost) minIdx = i;
      }
      const current = open.splice(minIdx, 1)[0];
      const currentIdx = this.idx(current.x, current.y);
      if (current.cost > this.costs[currentIdx]) continue;

      for (const dir of DIRS) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        if (!this.inBounds(nx, ny)) continue;
        const moveCost = costAt(nx, ny);
        if (!Number.isFinite(moveCost)) continue; // blocked
        const newCost = current.cost + dir.cost * moveCost;
        const nIdx = this.idx(nx, ny);
        if (newCost < this.costs[nIdx]) {
          this.costs[nIdx] = newCost;
          open.push({ x: nx, y: ny, cost: newCost });
        }
      }
    }

    // Compute flow vectors: for each cell, point to neighbor with lowest cost.
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.idx(x, y);
        if (!Number.isFinite(this.costs[i])) {
          this.vectors[i] = { dx: 0, dy: 0 }; // unreachable
          continue;
        }
        if (x === this.goalX && y === this.goalY) {
          this.vectors[i] = { dx: 0, dy: 0 }; // at goal
          continue;
        }
        let bestCost = this.costs[i];
        let bestDx = 0, bestDy = 0;
        for (const dir of DIRS) {
          const nx = x + dir.dx, ny = y + dir.dy;
          if (!this.inBounds(nx, ny)) continue;
          const c = this.costs[this.idx(nx, ny)];
          if (c < bestCost) {
            bestCost = c;
            bestDx = dir.dx;
            bestDy = dir.dy;
          }
        }
        this.vectors[i] = { dx: bestDx, dy: bestDy };
      }
    }
    this.generation++;
  }

  /** Get flow vector at cell (x, y). Returns {0,0} if out of bounds/unreachable. */
  sample(x: number, y: number): FlowVector {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (!this.inBounds(ix, iy)) return { dx: 0, dy: 0 };
    return this.vectors[this.idx(ix, iy)];
  }

  /** Get integration cost at cell (Infinity if unreachable). */
  costAt(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (!this.inBounds(ix, iy)) return Infinity;
    return this.costs[this.idx(ix, iy)];
  }

  /** True if cell is reachable from the goal. */
  isReachable(x: number, y: number): boolean {
    return Number.isFinite(this.costAt(x, y));
  }
}

// ---------------------------------------------------------------------------
// Flow field cache (§17) — reuse fields, rebuild only when necessary.
// ---------------------------------------------------------------------------

export interface FlowFieldCacheOptions {
  /** Rebuild if goal moves more than this (cells). */
  goalMoveThreshold?: number;
  /** Expire after this many ticks. */
  ttlTicks?: number;
  /** Cost function (must be stable for caching to be valid). */
  costAt: (x: number, y: number) => number;
  width: number;
  height: number;
}

export class FlowFieldCache {
  private field: FlowField | null = null;
  private opts: Required<Omit<FlowFieldCacheOptions, 'costAt' | 'width' | 'height'>> & Pick<FlowFieldCacheOptions, 'costAt' | 'width' | 'height'>;
  /** Number of times the field was rebuilt (metric). */
  rebuilds = 0;
  /** Number of times the cached field was reused (metric). */
  hits = 0;

  constructor(opts: FlowFieldCacheOptions) {
    this.opts = {
      goalMoveThreshold: opts.goalMoveThreshold ?? 3,
      ttlTicks: opts.ttlTicks ?? 300,
      costAt: opts.costAt,
      width: opts.width,
      height: opts.height,
    };
  }

  /**
   * Get the flow field for a goal. Reuses cached field if:
   * - goal hasn't moved beyond threshold
   * - field hasn't expired
   * Otherwise rebuilds.
   */
  get(goalX: number, goalY: number, tick: number): FlowField {
    const f = this.field;
    if (f) {
      const goalMoved = Math.hypot(f.goalX - goalX, f.goalY - goalY);
      const expired = tick - f.builtTick > this.opts.ttlTicks;
      if (goalMoved <= this.opts.goalMoveThreshold && !expired) {
        this.hits++;
        return f;
      }
    }
    // Rebuild.
    this.field = new FlowField(
      { width: this.opts.width, height: this.opts.height, costAt: this.opts.costAt },
      Math.floor(goalX), Math.floor(goalY), tick,
    );
    this.rebuilds++;
    return this.field;
  }

  /** Invalidate (e.g. terrain changed). */
  invalidate(): void {
    this.field = null;
  }
}

// ---------------------------------------------------------------------------
// Smoothed sampling (§20) — avoid robotic 90-degree snaps.
// ---------------------------------------------------------------------------

export interface SmoothedMover {
  vx: number;
  vy: number;
}

/**
 * Sample the flow field and smooth the velocity toward it.
 * @param speed  desired movement speed
 * @param smoothing  0-1, higher = snappier (0.2 is smooth, 0.5 is responsive)
 */
export function sampleFlowSmoothed(
  field: FlowField,
  mover: SmoothedMover,
  x: number, y: number,
  speed: number,
  smoothing: number = 0.25,
): { vx: number; vy: number } {
  const v = field.sample(x, y);
  // Normalize diagonal.
  const len = Math.hypot(v.dx, v.dy);
  const desiredVx = len > 0 ? (v.dx / len) * speed : 0;
  const desiredVy = len > 0 ? (v.dy / len) * speed : 0;
  // Lerp toward desired (§20).
  mover.vx += (desiredVx - mover.vx) * smoothing;
  mover.vy += (desiredVy - mover.vy) * smoothing;
  return { vx: mover.vx, vy: mover.vy };
}
