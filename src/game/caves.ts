// Procedural cave generation (BUILD 488 — World Systems Phase 6).
//
// Caves are separate world spaces with deterministic generation.
// Seed: MASTER_SEED + CAVE_COORDS + GENERATION_VERSION.
// Uses noise + cellular automata for organic layouts.
// Validated: entrance → connected → explorable (no sealed sections).
//
// Depth tiers:
// - SURFACE (0-10): common creatures, stone, coal
// - MID (11-25): stronger creatures, iron, rare resources
// - DEEP (26+): dangerous creatures, gold, ancient ruins, bosses

import { wfcSeedFor } from './wfc';

export type CaveDepthTier = 'surface' | 'mid' | 'deep';

export interface CaveCell {
  /** 0 = wall, 1 = floor */
  solid: boolean;
  /** Depth tier for this cell */
  tier: CaveDepthTier;
}

export interface GeneratedCave {
  width: number;
  height: number;
  grid: CaveCell[][];
  entrance: { x: number; y: number };
  /** Deepest explorable point (for boss/treasure) */
  deepPoint: { x: number; y: number };
  /** Cave seed */
  seed: number;
}

/**
 * Deterministic RNG.
 */
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
 * Generate a cave.
 * @param worldSeed master world seed
 * @param caveX cave coordinate X, caveY cave coordinate Y
 * @param width/height size in cells
 */
export function generateCave(
  worldSeed: number,
  caveX: number,
  caveY: number,
  width: number = 40,
  height: number = 40,
): GeneratedCave | null {
  const seed = wfcSeedFor(worldSeed, caveX, caveY, 'cave-v1');
  const rng = mulberry32(seed);

  // Step 1: Random noise (45% floor).
  let grid: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      // Borders are walls.
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        grid[y][x] = true; // solid
      } else {
        grid[y][x] = rng() < 0.45 ? false : true; // false = floor
      }
    }
  }

  // Step 2: Cellular automata smoothing (5 iterations).
  // A cell becomes floor if 5+ neighbors are floor; wall if 3- neighbors.
  for (let iter = 0; iter < 5; iter++) {
    const next: boolean[][] = [];
    for (let y = 0; y < height; y++) {
      next[y] = [];
      for (let x = 0; x < width; x++) {
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          next[y][x] = true;
          continue;
        }
        let floorNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (!grid[y + dy][x + dx]) floorNeighbors++;
          }
        }
        if (floorNeighbors >= 5) next[y][x] = false;
        else if (floorNeighbors <= 3) next[y][x] = true;
        else next[y][x] = grid[y][x];
      }
    }
    grid = next;
  }

  // Step 3: Find largest connected floor region (flood fill).
  const visited: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    visited[y] = new Array(width).fill(false);
  }

  let bestRegion: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!grid[y][x] && !visited[y][x]) {
        // Flood fill.
        const region: Array<{ x: number; y: number }> = [];
        const stack = [{ x, y }];
        visited[y][x] = true;
        while (stack.length > 0) {
          const { x: cx, y: cy } = stack.pop()!;
          region.push({ x: cx, y: cy });
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
            if (visited[ny][nx] || grid[ny][nx]) continue;
            visited[ny][nx] = true;
            stack.push({ x: nx, y: ny });
          }
        }
        if (region.length > bestRegion.length) {
          bestRegion = region;
        }
      }
    }
  }

  // Must have a reasonable-sized region.
  if (bestRegion.length < 50) return null;

  // Step 4: Seal off smaller regions (make them walls).
  const inBest = new Set(bestRegion.map((c) => `${c.x},${c.y}`));
  const cells: CaveCell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const isFloor = !grid[y][x] && inBest.has(`${x},${y}`);
      // Depth tier based on Y (deeper = lower Y = higher tier).
      // Actually, use distance from entrance for tier.
      cells[y][x] = {
        solid: !isFloor,
        tier: 'surface', // assigned below
      };
    }
  }

  // Step 5: Entrance = northernmost floor cell in best region.
  // Deep point = southernmost floor cell.
  let entrance = bestRegion[0];
  let deepPoint = bestRegion[0];
  for (const c of bestRegion) {
    if (c.y < entrance.y) entrance = c;
    if (c.y > deepPoint.y) deepPoint = c;
  }

  // Step 6: Assign depth tiers by distance from entrance.
  // BFS distance.
  const dist: Map<string, number> = new Map();
  const queue = [{ ...entrance, d: 0 }];
  dist.set(`${entrance.x},${entrance.y}`, 0);
  while (queue.length > 0) {
    const { x, y, d } = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      if (dist.has(key)) continue;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (cells[ny][nx].solid) continue;
      dist.set(key, d + 1);
      queue.push({ x: nx, y: ny, d: d + 1 });
    }
  }

  // Tier by distance: 0-15 surface, 16-30 mid, 31+ deep.
  for (const c of bestRegion) {
    const d = dist.get(`${c.x},${c.y}`) ?? 0;
    const tier: CaveDepthTier = d <= 15 ? 'surface' : d <= 30 ? 'mid' : 'deep';
    cells[c.y][c.x].tier = tier;
  }

  return {
    width,
    height,
    grid: cells,
    entrance,
    deepPoint,
    seed,
  };
}

/**
 * Get resources for a depth tier.
 */
export function resourcesForTier(tier: CaveDepthTier): string[] {
  if (tier === 'surface') return ['stone', 'coal'];
  if (tier === 'mid') return ['stone', 'iron', 'coal'];
  return ['iron', 'gold', 'crystal', 'ancient_ruin'];
}

/**
 * Get creature difficulty for a depth tier (1-10).
 */
export function dangerForTier(tier: CaveDepthTier): number {
  if (tier === 'surface') return 2;
  if (tier === 'mid') return 5;
  return 8;
}
