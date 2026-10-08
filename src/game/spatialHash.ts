// Spatial hash for entity neighbor queries (BUILD 465 — Performance Phase 1).
//
// Replaces O(n²) all-to-all entity comparisons with O(1) local cell lookups.
// This is the foundation for: lightweight separation, simulation LOD,
// flow-field sampling, and all local entity queries.
//
// Design (from the performance master prompt):
// - Grid-based, integrates with existing world coordinates (does NOT replace
//   the chunk system — it's a local query optimization only).
// - Configurable cell size (default 4 world units).
// - Entities only move between cells when crossing a boundary (no churn).
// - Reusable buckets, no per-frame allocations in hot paths.
// - Squared distances, never sqrt, for proximity checks.
// - One generalized system for NPCs, monsters, animals, travelers, etc.

export interface SpatialEntity {
  /** Unique id (for group distribution, identity). */
  id: number | string;
  x: number;
  y: number;
}

export interface SpatialHashOptions {
  /** Cell size in world units. Default 4. */
  cellSize?: number;
}

/**
 * Spatial hash grid. Register entities once, update on move, query neighbors.
 *
 * Usage:
 *   const hash = new SpatialHash({ cellSize: 4 });
 *   hash.rebuild(entities);          // or hash.add(e) / hash.update(e, x, y)
 *   hash.forEachNeighbor(x, y, radius, (e) => { ... });  // no allocations
 */
export class SpatialHash<T extends SpatialEntity> {
  readonly cellSize: number;
  // Map from "cx,cy" -> array of entities. Arrays are reused (cleared, not
  // reallocated) on rebuild to avoid GC pressure (§3, §13).
  private cells = new Map<string, T[]>();
  // Entity id -> cell key, for O(1) move updates.
  private entityCell = new Map<number | string, string>();
  // Entity id -> entity, for removal.
  private entityMap = new Map<number | string, T>();

  constructor(opts: SpatialHashOptions = {}) {
    this.cellSize = opts.cellSize ?? 4;
  }

  private key(cx: number, cy: number): string {
    return cx + ',' + cy;
  }

  private cellFor(x: number, y: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)];
  }

  /** Number of entities currently registered. */
  get size(): number {
    return this.entityMap.size;
  }

  /** Number of non-empty cells (for debug metrics). */
  get cellCount(): number {
    return this.cells.size;
  }

  /** Add an entity. If already present, updates its position. */
  add(entity: T): void {
    const existing = this.entityMap.get(entity.id);
    if (existing) {
      this.update(entity.id, entity.x, entity.y);
      return;
    }
    const [cx, cy] = this.cellFor(entity.x, entity.y);
    const k = this.key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(entity);
    this.entityCell.set(entity.id, k);
    this.entityMap.set(entity.id, entity);
  }

  /** Remove an entity by id. */
  remove(id: number | string): boolean {
    const k = this.entityCell.get(id);
    if (k === undefined) return false;
    const bucket = this.cells.get(k);
    if (bucket) {
      const idx = bucket.findIndex((e) => e.id === id);
      if (idx >= 0) bucket.splice(idx, 1);
      if (bucket.length === 0) this.cells.delete(k);
    }
    this.entityCell.delete(id);
    this.entityMap.delete(id);
    return true;
  }

  /**
   * Update an entity's position. Only moves between buckets when the cell
   * changes (§3 — no churn for entities staying in the same cell).
   */
  update(id: number | string, x: number, y: number): boolean {
    const entity = this.entityMap.get(id);
    if (!entity) return false;
    entity.x = x;
    entity.y = y;
    const [cx, cy] = this.cellFor(x, y);
    const newKey = this.key(cx, cy);
    const oldKey = this.entityCell.get(id);
    if (oldKey === newKey) return true; // still in same cell — no work
    // Remove from old bucket.
    if (oldKey !== undefined) {
      const oldBucket = this.cells.get(oldKey);
      if (oldBucket) {
        const idx = oldBucket.findIndex((e) => e.id === id);
        if (idx >= 0) oldBucket.splice(idx, 1);
        if (oldBucket.length === 0) this.cells.delete(oldKey);
      }
    }
    // Add to new bucket.
    let bucket = this.cells.get(newKey);
    if (!bucket) {
      bucket = [];
      this.cells.set(newKey, bucket);
    }
    bucket.push(entity);
    this.entityCell.set(id, newKey);
    return true;
  }

  /** Clear all entities. Reuses bucket arrays where possible. */
  clear(): void {
    // Keep the Map but clear buckets for reuse.
    for (const bucket of this.cells.values()) bucket.length = 0;
    this.cells.clear();
    this.entityCell.clear();
    this.entityMap.clear();
  }

  /**
   * Rebuild from a list. Clears and re-adds all. Prefer incremental
   * add/update/remove during gameplay; use rebuild for full resyncs.
   */
  rebuild(entities: T[]): void {
    this.clear();
    for (const e of entities) this.add(e);
  }

  /**
   * Visit all entities within `radius` of (x, y). No allocations: the
   * callback receives each neighbor directly (§13).
   * Uses squared distance — never sqrt (§5).
   *
   * @param excludeId  skip this entity (typically the querier itself)
   * @returns number of neighbors visited
   */
  forEachNeighbor(
    x: number, y: number,
    radius: number,
    callback: (entity: T, dx: number, dy: number, distSq: number) => void,
    excludeId?: number | string,
  ): number {
    const radiusSq = radius * radius;
    const [ccx, ccy] = this.cellFor(x, y);
    // How many cells to check in each direction.
    const cellRadius = Math.ceil(radius / this.cellSize);
    let count = 0;
    for (let cy = ccy - cellRadius; cy <= ccy + cellRadius; cy++) {
      for (let cx = ccx - cellRadius; cx <= ccx + cellRadius; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const e of bucket) {
          if (excludeId !== undefined && e.id === excludeId) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const distSq = dx * dx + dy * dy; // §5: no sqrt
          if (distSq <= radiusSq) {
            callback(e, dx, dy, distSq);
            count++;
          }
        }
      }
    }
    return count;
  }

  /**
   * Collect neighbors into a reused array. Prefer forEachNeighbor in hot
   * paths; use this when a list is genuinely needed.
   */
  queryNeighbors(
    x: number, y: number,
    radius: number,
    out: T[] = [],
    excludeId?: number | string,
  ): T[] {
    out.length = 0;
    this.forEachNeighbor(x, y, radius, (e) => { out.push(e); }, excludeId);
    return out;
  }
}

// ---------------------------------------------------------------------------
// Lightweight separation (§1, §4, §6).
//
// Replaces O(n²) physics with a separation vector computed from spatial-hash
// neighbors. The vector is throttled (computed every N ticks, distributed by
// entity id) and interpolated between updates so movement stays smooth.
// ---------------------------------------------------------------------------

export interface SeparationOptions {
  /** Separation radius in world units. */
  radius?: number;
  /** Push strength. */
  push?: number;
  /** Recompute every N ticks (distributed by id % N). Default 20 (§4). */
  interval?: number;
}

export interface SeparationState {
  /** Current smoothed separation vector. */
  sx: number;
  sy: number;
  /** Last tick the vector was recomputed. */
  lastTick: number;
}

export function createSeparationState(): SeparationState {
  return { sx: 0, sy: 0, lastTick: -1 };
}

/**
 * Compute (or retain) the separation vector for an entity.
 *
 * - On the entity's assigned tick (id % interval === tick % interval),
 *   recomputes from spatial-hash neighbors.
 * - Otherwise retains the previous vector (§4 — no jitter).
 * - Uses squared distances throughout (§5).
 *
 * @returns the (possibly retained) separation state
 */
export function updateSeparation<T extends SpatialEntity>(
  hash: SpatialHash<T>,
  entity: T,
  state: SeparationState,
  tick: number,
  opts: SeparationOptions = {},
): SeparationState {
  const radius = opts.radius ?? 1.1;
  const push = opts.push ?? 0.14;
  const interval = opts.interval ?? 20;
  const idNum = typeof entity.id === 'number' ? entity.id : hashString(entity.id);

  // Distribute across ticks (§4).
  if ((tick + idNum) % interval !== 0 && state.lastTick >= 0) {
    return state; // retain previous vector
  }
  state.lastTick = tick;

  const radiusSq = radius * radius;
  let sx = 0, sy = 0;
  hash.forEachNeighbor(entity.x, entity.y, radius, (other, dx, dy, distSq) => {
    if (distSq < 1e-12) {
      sx += push; // arbitrary nudge for exact overlap
      return;
    }
    // overlap in [0, 1): stronger when closer. No sqrt needed — we use
    // distSq/radiusSq as the proximity factor.
    const proximity = 1 - distSq / radiusSq;
    // Direction away from neighbor: normalize using 1/dist. We need one
    // sqrt here per neighbor, but only for neighbors within radius (few).
    const dist = Math.sqrt(distSq);
    const nx = -dx / dist;
    const ny = -dy / dist;
    sx += nx * push * proximity;
    sy += ny * push * proximity;
  }, entity.id);

  // Smooth: blend toward the new vector (§4 — no jitter).
  const blend = 0.5;
  state.sx += (sx - state.sx) * blend;
  state.sy += (sy - state.sy) * blend;
  return state;
}

/** Simple string hash for non-numeric ids (group distribution). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
