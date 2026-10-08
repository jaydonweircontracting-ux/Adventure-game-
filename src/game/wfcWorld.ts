// WFC world-generation profiles (BUILD 463 — Phase 1).
//
// The "world-generation grammar": tile/socket libraries and rules for each
// environment, all speaking the same constraint language (see wfc.ts).
//
// Phase 1 scope (per the master prompt's incremental directive):
// - Biome tile set derived from the EXISTING worldMap.ts ALLOWED_NEIGHBORS,
//   so behavior stays compatible with the current generator.
// - Socket semantics: terrain socket per side (biome id). A tile's north
//   socket must be compatible with the neighbor's south socket, etc.
// - The solver is exposed for chunk-level generation; wiring into the live
//   chunk pipeline is Phase 2 (after validation).
//
// Later phases (not in this change):
// - Elevation sockets, river/road infrastructure sockets, transition tiles,
//   settlement profiles, dungeon profiles, multi-scale hierarchy.

import { WfcTileSet, WfcTile, WfcSeededRng, WfcSolver, wfcSeedFor } from './wfc';

// Mirror of worldMap.ts biomes + neighbor rules, expressed as WFC tiles.
// Weights: common terrain is heavy, rare terrain is light (§18).
const BIOME_TILES: Array<{ id: string; weight: number; neighbors: string[] }> = [
  { id: 'ocean',  weight: 14, neighbors: ['ocean', 'shore'] },
  { id: 'shore',  weight: 6,  neighbors: ['ocean', 'shore', 'meadow'] },
  { id: 'meadow', weight: 30, neighbors: ['shore', 'meadow', 'forest', 'desert', 'tundra', 'rock'] },
  { id: 'forest', weight: 20, neighbors: ['meadow', 'forest', 'tundra', 'rock'] },
  { id: 'desert', weight: 8,  neighbors: ['meadow', 'forest', 'desert', 'shore', 'rock'] },
  { id: 'tundra', weight: 8,  neighbors: ['meadow', 'forest', 'tundra', 'rock'] },
  { id: 'rock',   weight: 10, neighbors: ['meadow', 'forest', 'desert', 'tundra', 'rock'] },
];

function biomeTileSet(): WfcTileSet {
  const ids = new Set(BIOME_TILES.map((t) => t.id));
  const tiles: WfcTile[] = BIOME_TILES.map((t) => ({
    id: t.id,
    weight: t.weight,
    sockets: { north: t.id, south: t.id, east: t.id, west: t.id },
  }));
  return {
    tiles,
    // Socket `a` (this tile's biome) is compatible with socket `b`
    // (neighbor's biome) when `b` is in `a`'s allowed-neighbor list.
    // Falls back to exact match for unknown ids.
    compatible: (a, b) => {
      const rule = BIOME_TILES.find((t) => t.id === a);
      if (!rule) return a === b;
      return rule.neighbors.includes(b) && ids.has(b);
    },
  };
}

/** Cached singleton — the tile set is static. */
let cachedTileSet: WfcTileSet | null = null;
export function worldBiomeTileSet(): WfcTileSet {
  if (!cachedTileSet) cachedTileSet = biomeTileSet();
  return cachedTileSet;
}

export interface WfcChunkBoundary {
  north?: string[];
  south?: string[];
  east?: string[];
  west?: string[];
}

/**
 * Generate a chunk-sized biome grid with WFC, honoring boundary constraints
 * from neighboring chunks (§6 — no seams).
 *
 * @param worldSeed  deterministic world seed (§21)
 * @param chunkX, chunkY  chunk coordinates (region isolation per §21)
 * @param size  grid size in cells (chunk resolution for this layer)
 * @param boundary  locked edge tiles from already-generated neighbors
 * @returns size x size grid of biome ids, or null on contradiction
 */
export function generateChunkBiomes(
  worldSeed: number,
  chunkX: number,
  chunkY: number,
  size: number,
  boundary: WfcChunkBoundary = {},
): string[][] | null {
  const tiles = worldBiomeTileSet();
  const rng = new WfcSeededRng(wfcSeedFor(worldSeed, chunkX, chunkY, 'wfc-biome'));
  const solver = new WfcSolver({ width: size, height: size, tiles, rng });

  const applyEdge = (edge: string[] | undefined, set: (i: number, id: string) => boolean): boolean => {
    if (!edge) return true;
    for (let i = 0; i < Math.min(edge.length, size); i++) {
      if (edge[i] && !set(i, edge[i])) return false;
    }
    return true;
  };
  if (!applyEdge(boundary.north, (i, id) => solver.setTile(i, 0, id))) return null;
  if (!applyEdge(boundary.south, (i, id) => solver.setTile(i, size - 1, id))) return null;
  if (!applyEdge(boundary.west, (i, id) => solver.setTile(0, i, id))) return null;
  if (!applyEdge(boundary.east, (i, id) => solver.setTile(size - 1, i, id))) return null;

  return solver.collapse();
}

/**
 * Validate a generated grid: every adjacent pair must satisfy the
 * compatibility rules (§26 — validation). Returns a list of violations.
 */
export function validateBiomeGrid(grid: string[][]): Array<{ x: number; y: number; dir: string; a: string; b: string }> {
  const tiles = worldBiomeTileSet();
  const compat = tiles.compatible!;
  const violations: Array<{ x: number; y: number; dir: string; a: string; b: string }> = [];
  const h = grid.length;
  if (h === 0) return violations;
  const w = grid[0].length;
  const dirs = [
    { dx: 1, dy: 0, dir: 'east' },
    { dx: 0, dy: 1, dir: 'south' },
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (const { dx, dy, dir } of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx >= w || ny >= h) continue;
        const a = grid[y][x], b = grid[ny][nx];
        if (!compat(a, b)) violations.push({ x, y, dir, a, b });
      }
    }
  }
  return violations;
}
