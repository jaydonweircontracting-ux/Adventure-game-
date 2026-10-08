// Wave Function Collapse core engine (BUILD 463 — Phase 1 of the WFC master prompt).
//
// A reusable constraint-based generation framework for the entire game world.
// This is the "procedural construction language" — dungeons, overworld,
// towns, roads, rivers, elevation, buildings and caves all speak the same
// language: tiles with sockets, compatibility rules, weighted collapse.
//
// Design principles (from the master prompt):
// - Do NOT rewrite the game. This is a new module; integration points are
//   explicit and incremental.
// - Deterministic: seeded RNG, same seed = same output.
// - Hierarchical: this engine solves one grid at a time; the caller decides
//   the scale (world macro, region, chunk, structure).
// - Chunk continuity: callers pass boundary constraints from neighbors.
//
// Usage:
//   const solver = new WfcSolver({ width, height, tiles, rng });
//   solver.setBoundary(x, y, tileId); // lock edges to neighbor chunks
//   const result = solver.collapse(); // 2D array of tile ids, or null on contradiction
//
// Sockets: each tile defines what it presents on each of its 4 sides.
// Two adjacent tiles are compatible when their shared edge sockets match
// (via the `compatible` predicate, default: exact socket equality).

export type WfcDirection = 'north' | 'south' | 'east' | 'west';

export const WFC_DIRECTIONS: WfcDirection[] = ['north', 'south', 'east', 'west'];

const OPPOSITE: Record<WfcDirection, WfcDirection> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
};

const DELTA: Record<WfcDirection, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

export interface WfcTile {
  /** Unique id within the tile set. */
  id: string;
  /** Selection weight (higher = more common). */
  weight: number;
  /** Socket presented on each side. Semantics are defined by the tile set. */
  sockets: Record<WfcDirection, string>;
}

export interface WfcTileSet {
  tiles: WfcTile[];
  /**
   * Returns true when socket `a` (on one tile's side) is compatible with
   * socket `b` (on the neighbor's opposing side). Default: strict equality.
   * Override for transition-tolerant matching (e.g. GRASS accepts DIRT_PATH).
   */
  compatible?: (a: string, b: string) => boolean;
}

export interface WfcRng {
  next(): number; // [0, 1)
}

/** Mulberry-ish seeded RNG (matches the style used in worldMap.ts). */
export class WfcSeededRng implements WfcRng {
  private state: number;
  constructor(seed: number) {
    this.state = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

/**
 * Derive a deterministic seed from world seed + coordinates + layer name.
 * Changing one region never alters unrelated regions (master prompt §21).
 */
export function wfcSeedFor(worldSeed: number, x: number, y: number, layer: string): number {
  let h = (worldSeed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  for (let i = 0; i < layer.length; i++) {
    h = Math.imul(h ^ layer.charCodeAt(i), 0x27d4eb2f);
  }
  h ^= h >>> 15;
  return h >>> 0;
}

interface Cell {
  /** Possible tile indices (into tileSet.tiles). Empty = contradiction. */
  possible: boolean[];
  collapsed: boolean;
}

export class WfcSolver {
  private width: number;
  private height: number;
  private tileSet: WfcTileSet;
  private rng: WfcRng;
  private cells: Cell[];
  private compatible: (a: string, b: string) => boolean;
  /** adjacency[tileIdx][dir] = set of tile indices allowed as neighbor in dir */
  private adjacency: Array<Record<WfcDirection, Set<number>>>;

  constructor(opts: { width: number; height: number; tiles: WfcTileSet; rng: WfcRng }) {
    this.width = opts.width;
    this.height = opts.height;
    this.tileSet = opts.tiles;
    this.rng = opts.rng;
    this.compatible = opts.tiles.compatible ?? ((a, b) => a === b);
    const n = opts.tiles.tiles.length;
    this.cells = Array.from({ length: opts.width * opts.height }, () => ({
      possible: new Array(n).fill(true),
      collapsed: false,
    }));
    // Precompute adjacency: for each tile and direction, which tiles may neighbor it.
    this.adjacency = opts.tiles.tiles.map((tile) => {
      const per: Record<WfcDirection, Set<number>> = {
        north: new Set(), south: new Set(), east: new Set(), west: new Set(),
      };
      for (const dir of WFC_DIRECTIONS) {
        const opp = OPPOSITE[dir];
        opts.tiles.tiles.forEach((other, oi) => {
          if (this.compatible(tile.sockets[dir], other.sockets[opp])) per[dir].add(oi);
        });
      }
      return per;
    });
  }

  private idx(x: number, y: number): number {
    return y * this.width + x;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Lock a cell to a single tile (boundary constraints from neighbor chunks, fixed features). */
  setTile(x: number, y: number, tileId: string): boolean {
    if (!this.inBounds(x, y)) return false;
    const ti = this.tileSet.tiles.findIndex((t) => t.id === tileId);
    if (ti < 0) return false;
    const cell = this.cells[this.idx(x, y)];
    cell.possible = cell.possible.map((_, i) => i === ti);
    cell.collapsed = true;
    return this.propagate(x, y);
  }

  /** Ban a tile from a cell (e.g. "no water here"). */
  banTile(x: number, y: number, tileId: string): boolean {
    if (!this.inBounds(x, y)) return false;
    const ti = this.tileSet.tiles.findIndex((t) => t.id === tileId);
    if (ti < 0) return true;
    const cell = this.cells[this.idx(x, y)];
    if (!cell.possible[ti]) return true;
    cell.possible[ti] = false;
    return this.propagate(x, y);
  }

  /** Count of still-possible tiles for a cell. */
  possibilities(x: number, y: number): number {
    const cell = this.cells[this.idx(x, y)];
    return cell.possible.filter(Boolean).length;
  }

  /** True when every cell is collapsed and none is contradictory. */
  get done(): boolean {
    return this.cells.every((c) => c.collapsed && c.possible.some(Boolean));
  }

  /** Propagate constraints from (x, y) outward. Returns false on contradiction. */
  private propagate(sx: number, sy: number): boolean {
    const stack: Array<[number, number]> = [[sx, sy]];
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const cell = this.cells[this.idx(x, y)];
      for (const dir of WFC_DIRECTIONS) {
        const { dx, dy } = DELTA[dir];
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const ncell = this.cells[this.idx(nx, ny)];
        if (ncell.collapsed) continue;
        // Allowed neighbor tiles = union of adjacency over this cell's possibilities.
        const allowed = new Set<number>();
        cell.possible.forEach((p, ti) => {
          if (p) this.adjacency[ti][dir].forEach((o) => allowed.add(o));
        });
        let changed = false;
        ncell.possible.forEach((p, oi) => {
          if (p && !allowed.has(oi)) { ncell.possible[oi] = false; changed = true; }
        });
        const remaining = ncell.possible.filter(Boolean).length;
        if (remaining === 0) return false; // contradiction
        if (changed) stack.push([nx, ny]);
      }
    }
    return true;
  }

  /** Shannon entropy of a cell (for minimum-entropy selection). */
  private entropy(cell: Cell): number {
    let totalW = 0, e = 0;
    this.tileSet.tiles.forEach((t, i) => {
      if (cell.possible[i]) totalW += t.weight;
    });
    if (totalW <= 0) return Infinity;
    this.tileSet.tiles.forEach((t, i) => {
      if (cell.possible[i]) {
        const p = t.weight / totalW;
        e -= p * Math.log(p);
      }
    });
    return e;
  }

  /** Pick the uncollapsed cell with lowest entropy (ties broken by RNG). */
  private pickCell(): [number, number] | null {
    let best: [number, number] | null = null;
    let bestE = Infinity;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[this.idx(x, y)];
        if (cell.collapsed) continue;
        // Slight noise so ties don't always resolve in scan order.
        const e = this.entropy(cell) + this.rng.next() * 1e-6;
        if (e < bestE) { bestE = e; best = [x, y]; }
      }
    }
    return best;
  }

  /** Weighted random pick among a cell's possible tiles. */
  private pickTile(x: number, y: number): number {
    const cell = this.cells[this.idx(x, y)];
    let total = 0;
    this.tileSet.tiles.forEach((t, i) => { if (cell.possible[i]) total += t.weight; });
    let r = this.rng.next() * total;
    for (let i = 0; i < this.tileSet.tiles.length; i++) {
      if (!cell.possible[i]) continue;
      r -= this.tileSet.tiles[i].weight;
      if (r <= 0) return i;
    }
    // Fallback: first possible (should not happen with total > 0).
    return cell.possible.findIndex(Boolean);
  }

  /**
   * Run the collapse. Returns a height x width grid of tile ids,
   * or null if the constraints are contradictory.
   */
  collapse(): string[][] | null {
    // Propagate any pre-locked boundary cells first.
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[this.idx(x, y)];
        if (cell.collapsed && !this.propagate(x, y)) return null;
      }
    }
    for (;;) {
      const pick = this.pickCell();
      if (!pick) {
        // All collapsed — verify no contradictions.
        for (const c of this.cells) if (!c.possible.some(Boolean)) return null;
        break;
      }
      const [x, y] = pick;
      const ti = this.pickTile(x, y);
      if (ti < 0) return null;
      const cell = this.cells[this.idx(x, y)];
      cell.possible = cell.possible.map((_, i) => i === ti);
      cell.collapsed = true;
      if (!this.propagate(x, y)) return null;
    }
    const out: string[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: string[] = [];
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[this.idx(x, y)];
        const ti = cell.possible.findIndex(Boolean);
        row.push(ti >= 0 ? this.tileSet.tiles[ti].id : '');
      }
      out.push(row);
    }
    return out;
  }
}
