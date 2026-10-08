// WFC world-generation profiles (BUILD 464 — Phase 2).
//
// The "world-generation grammar": tile/socket libraries and rules for each
// environment, all speaking the same constraint language (see wfc.ts).
//
// Phase 1 (BUILD 463): biome tile set from worldMap.ts ALLOWED_NEIGHBORS.
// Phase 2 (this change):
// - Elevation sockets (§3, §9): every tile carries an elevation band.
//   Adjacent tiles may differ by at most 1 elevation level — no more
//   "flat grass suddenly becoming a vertical mountain wall" (§4).
// - Transition tiles (§11): hills, highlands, crag bridge the gaps so
//   elevation changes flow PLAINS → HILLS → FOOTHILLS → MOUNTAIN.
// - The biome compatibility rules from Phase 1 are preserved.
//
// Later phases (not in this change):
// - River/road infrastructure sockets, settlement profiles, dungeon
//   profiles, multi-scale hierarchy, live chunk-pipeline wiring.

import { WfcTileSet, WfcTile, WfcSeededRng, WfcSolver, wfcSeedFor } from './wfc';

// Elevation bands (§3): 0=water, 1=low, 2=flat, 3=hill, 4=high, 5=mountain.
// Mirrors worldMap.ts elevationLevelFor (0=ocean … 5=peak).
export type WfcElevation = 0 | 1 | 2 | 3 | 4 | 5;

// Mirror of worldMap.ts biomes + neighbor rules, expressed as WFC tiles.
// Weights: common terrain is heavy, rare terrain is light (§18).
// elevation: the band this tile sits in. Transition tiles (§11) sit between.
const BIOME_TILES: Array<{
  id: string; weight: number; neighbors: string[]; elevation: WfcElevation;
}> = [
  { id: 'ocean',  weight: 14, neighbors: ['ocean', 'shore'], elevation: 0 },
  { id: 'shore',  weight: 6,  neighbors: ['ocean', 'shore', 'meadow'], elevation: 1 },
  { id: 'meadow', weight: 30, neighbors: ['shore', 'meadow', 'forest', 'desert', 'tundra', 'hills'], elevation: 1 },
  // Transition tiles (§11): bridge elevation gaps so terrain flows.
  { id: 'hills',     weight: 12, neighbors: ['meadow', 'forest', 'hills', 'highlands', 'desert'], elevation: 2 },
  { id: 'highlands', weight: 8,  neighbors: ['hills', 'forest', 'tundra', 'highlands', 'crag'], elevation: 3 },
  { id: 'crag',      weight: 5,  neighbors: ['highlands', 'rock', 'crag', 'tundra'], elevation: 4 },
  { id: 'forest', weight: 20, neighbors: ['meadow', 'forest', 'tundra', 'hills', 'highlands', 'desert'], elevation: 2 },
  { id: 'desert', weight: 8,  neighbors: ['meadow', 'forest', 'desert', 'shore', 'hills', 'rock'], elevation: 1 },
  { id: 'tundra', weight: 8,  neighbors: ['meadow', 'forest', 'tundra', 'highlands', 'crag'], elevation: 3 },
  { id: 'rock',   weight: 10, neighbors: ['crag', 'highlands', 'tundra', 'rock', 'desert'], elevation: 5 },
];

/** Max allowed elevation step between adjacent tiles (§4, §9). */
export const WFC_MAX_ELEVATION_STEP = 1;

function biomeTileSet(): WfcTileSet {
  const ids = new Set(BIOME_TILES.map((t) => t.id));
  const byId = new Map(BIOME_TILES.map((t) => [t.id, t]));
  const tiles: WfcTile[] = BIOME_TILES.map((t) => ({
    id: t.id,
    weight: t.weight,
    // Socket encodes biome + elevation: "meadow:1". The compatible()
    // predicate parses both (§3 — terrain + elevation sockets).
    sockets: {
      north: `${t.id}:${t.elevation}`, south: `${t.id}:${t.elevation}`,
      east: `${t.id}:${t.elevation}`, west: `${t.id}:${t.elevation}`,
    },
  }));
  return {
    tiles,
    compatible: (a, b) => {
      const [biomeA, elevAStr] = a.split(':');
      const [biomeB, elevBStr] = b.split(':');
      const ruleA = byId.get(biomeA);
      const ruleB = byId.get(biomeB);
      if (!ruleA || !ruleB || !ids.has(biomeB)) return a === b;
      // Biome adjacency (Phase 1 rules, extended with transition tiles).
      // Must be SYMMETRIC for WFC: if A accepts B then B must accept A.
      if (!ruleA.neighbors.includes(biomeB)) return false;
      if (!ruleB.neighbors.includes(biomeA)) return false;
      // Elevation step (§9): at most 1 level. This is what prevents
      // PLAINS → MOUNTAIN cliffs without a transition tile between.
      const elevA = parseInt(elevAStr, 10);
      const elevB = parseInt(elevBStr, 10);
      return Math.abs(elevA - elevB) <= WFC_MAX_ELEVATION_STEP;
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
  // Map tile id -> socket string (sockets now encode biome:elevation).
  const socketFor = new Map(tiles.tiles.map((t) => [t.id, t.sockets.north]));
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
        const sa = socketFor.get(a) ?? a, sb = socketFor.get(b) ?? b;
        if (!compat(sa, sb)) violations.push({ x, y, dir, a, b });
      }
    }
  }
  return violations;
}
