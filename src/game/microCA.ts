// Micro cellular-automata (BUILD 508 — A-life Phase 13).
//
// Local neighbor rules for environmental simulation:
// - Vegetation spread
// - Fire spread
// - Fungus/moss growth
//
// Uses local grid rules: neighbor cells → local conditions → next state.
// Deterministic under world seed. Does NOT replace world generation.

export type CellState =
  | 'empty'
  | 'grass'
  | 'bush'
  | 'tree'
  | 'burning'
  | 'burned'
  | 'fungus'
  | 'water';

export interface MicroGrid {
  width: number;
  height: number;
  cells: CellState[][];
  seed: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a micro grid with initial vegetation.
 */
export function createMicroGrid(
  width: number,
  height: number,
  seed: number,
  initialDensity: number = 0.3,
): MicroGrid {
  const rng = mulberry32(seed);
  const cells: CellState[][] = [];

  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const r = rng();
      if (r < initialDensity * 0.5) cells[y][x] = 'grass';
      else if (r < initialDensity * 0.7) cells[y][x] = 'bush';
      else if (r < initialDensity * 0.8) cells[y][x] = 'tree';
      else cells[y][x] = 'empty';
    }
  }

  return { width, height, cells, seed };
}

/**
 * Count neighbors of a given state.
 */
function countNeighbors(
  grid: MicroGrid,
  x: number,
  y: number,
  state: CellState,
): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      if (grid.cells[ny][nx] === state) count++;
    }
  }
  return count;
}

/**
 * Simulate one step.
 * Rules:
 * - Grass spreads to empty if 2+ grass neighbors
 * - Bush grows from grass if 3+ bush neighbors
 * - Burning spreads to grass/bush/tree neighbors, then becomes burned
 * - Burned becomes empty after 1 step
 * - Fungus spreads in damp areas (near water)
 */
export function simulateMicroStep(grid: MicroGrid): MicroGrid {
  const rng = mulberry32(grid.seed + 1); // deterministic progression
  const next: CellState[][] = [];

  for (let y = 0; y < grid.height; y++) {
    next[y] = [];
    for (let x = 0; x < grid.width; x++) {
      const current = grid.cells[y][x];
      let newState = current;

      switch (current) {
        case 'empty':
          // Grass spreads.
          if (countNeighbors(grid, x, y, 'grass') >= 3) {
            newState = rng() < 0.3 ? 'grass' : 'empty';
          }
          // Fungus near water.
          else if (countNeighbors(grid, x, y, 'water') >= 2 && rng() < 0.1) {
            newState = 'fungus';
          }
          break;

        case 'grass':
          // Can become bush.
          if (countNeighbors(grid, x, y, 'bush') >= 2 && rng() < 0.1) {
            newState = 'bush';
          }
          // Fire spreads.
          if (countNeighbors(grid, x, y, 'burning') >= 1 && rng() < 0.5) {
            newState = 'burning';
          }
          break;

        case 'bush':
        case 'tree':
          // Fire spreads.
          if (countNeighbors(grid, x, y, 'burning') >= 1 && rng() < 0.5) {
            newState = 'burning';
          }
          // Bush can grow from grass neighbors (succession).
          if (current === 'bush' && countNeighbors(grid, x, y, 'grass') >= 4 && rng() < 0.05) {
            newState = 'tree';
          }
          break;

        case 'burning':
          // Burns out.
          newState = 'burned';
          break;

        case 'burned':
          // Clears.
          newState = 'empty';
          break;
      }

      next[y][x] = newState;
    }
  }

  return {
    ...grid,
    cells: next,
    seed: grid.seed + 1,
  };
}

/**
 * Ignite a cell (start a fire).
 */
export function igniteCell(grid: MicroGrid, x: number, y: number): MicroGrid {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return grid;
  const cells = grid.cells.map(row => [...row]);
  const current = cells[y][x];
  if (current === 'grass' || current === 'bush' || current === 'tree') {
    cells[y][x] = 'burning';
  }
  return { ...grid, cells };
}

/**
 * Count cells of each state.
 */
export function countStates(grid: MicroGrid): Record<CellState, number> {
  const counts: Record<CellState, number> = {
    empty: 0, grass: 0, bush: 0, tree: 0,
    burning: 0, burned: 0, fungus: 0, water: 0,
  };
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      counts[grid.cells[y][x]]++;
    }
  }
  return counts;
}
