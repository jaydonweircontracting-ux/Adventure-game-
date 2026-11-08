// BUILD 1024 — infinite wilderness beyond the 200x200 authored map.
//
// The wall the user reported was not a rendered wall: the ground rings
// already render grass to the horizon (1007) and terrainAt already
// falls back to grass outside the map. The wall was WALKABILITY:
// isWalkableWorld (isoWorld.ts) returns false outside the map bounds,
// walkableWithPlacements inherits it, the view's walkableAt inherits
// that, pickGround refuses out-of-map taps, and savedPosition rescues
// an out-of-map save to the spawn. This module is the wilderness side
// of removing that wall: pure, deterministic functions of tile
// coordinates for everything that exists past the edge. No React, no
// DOM, no I/O — safe for the sim/test import graphs (it imports only
// the scatter hash and the smooth noise field).
//
// Terrain rule (out-of-map tiles only; in-map tiles are governed by
// the stored world and never consult this module):
//   - Ocean: west of the BUILD 1027 coastline (oceanAt) — the sea
//     extends infinitely west, so out-of-map west is water, not grass.
//     Ocean wins over lakes (a lake west of the coast is sea anyway).
//   - Lakes: groundNoise(x, y, 32) > 0.90. Measured on a 400x400
//     out-of-map sample: 1.76% water — occasional coherent lake blobs
//     (the field is smooth at 32-tile scale), not speckles, and never
//     near town (lakes are out-of-map only by construction).
//     BUILD 1031 correction: measured on an 801x801 out-of-map sample
//     the lakes are LARGE, not "a few tiles across" — 23 blobs, the
//     biggest 987 tiles with a 48-tile diameter (0.98% water overall).
//     That size is why a centre-sampled far cell mis-renders so
//     visibly: one 16-tile cell can sit entirely inside a lake, or
//     straddle its edge, and the old scan never looked.
//   - Everything else is grass (the terrainAt fallback, kept).
// Obstacle rule: the stored wilderness scatter in defaultWorld uses
// hash2(x, y, 7) with tree < 0.006 and rock in [0.006, 0.008), skipping
// inTown/onRoad/inPond — and every one of those exclusions is false
// outside the map, so the SAME hash with the SAME salt and thresholds
// continues the scatter exactly past the edge. Verified in the 1024
// asserts: every stored scatter tree/rock satisfies its rule. A tile
// cannot be both a lake and a tree/rock: lake wins, so no tree stands
// in a lake and no rock sits in one.
// Walkability: wild grass is walkable; ocean, lakes, wild trees and
// wild rocks block, exactly like their in-map counterparts (water,
// tree, rock). Chopped/mined wild items stay gone via the world's
// removedWildTrees / removedWildRocks sets (same rule as 987/989).
// NPCs, animals and transients never consult this module: their
// targets and spawn bands are all in-town, and their walkability
// (walkableWithPlacements -> isWalkableWorld) stays in-bounds. The
// wilderness is player-only by construction — "empty chunks", as
// ordered: landscape, no town, no NPCs, no quests.
import { hash2 as scatterHash, oceanAt, oceanCoastX } from '../iso/isoWorld';
import { groundNoise } from './townLook';
import type { IsoWorld } from '../iso/isoWorld';

/** Salt of the stored wilderness scatter (defaultWorld). */
export const WILD_SCATTER_SALT = 7;
/** Scatter thresholds, identical to defaultWorld. */
export const WILD_TREE_MAX = 0.006;
export const WILD_ROCK_MAX = 0.008;
/** Lake field: smooth noise at 32-tile scale, thresholded. */
export const WILD_LAKE_SPACING = 32;
export const WILD_LAKE_THRESHOLD = 0.9;

/** The scatter hash for one tile (0..1), exactly defaultWorld's. */
export function wildScatter(x: number, y: number): number {
  return scatterHash(x, y, WILD_SCATTER_SALT);
}

/** True when the smooth lake field puts water on this tile. */
export function wildLakeAt(x: number, y: number): boolean {
  return groundNoise(x, y, WILD_LAKE_SPACING) > WILD_LAKE_THRESHOLD;
}

/** True when the scatter hash puts a wild tree on this tile
 *  (and the tile is not a lake or ocean — water wins). */
export function wildTreeAt(x: number, y: number): boolean {
  return !oceanAt(x, y) && !wildLakeAt(x, y) && wildScatter(x, y) < WILD_TREE_MAX;
}

/** True when the scatter hash puts a wild rock on this tile
 *  (and the tile is not a lake or ocean — water wins). */
export function wildRockAt(x: number, y: number): boolean {
  if (oceanAt(x, y)) return false;
  if (wildLakeAt(x, y)) return false;
  const h = wildScatter(x, y);
  return h >= WILD_TREE_MAX && h < WILD_ROCK_MAX;
}

/** The wild obstacle on a tile, if any ('tree' | 'rock' | null). */
export function wildObstacleAt(x: number, y: number): 'tree' | 'rock' | null {
  if (wildTreeAt(x, y)) return 'tree';
  if (wildRockAt(x, y)) return 'rock';
  return null;
}

/** Max cell area (tiles) that gets a full per-tile mix scan: band
 *  cells are 4x4 (16), far cells 16x16 (256). Horizon cells are
 *  64x64 (4096) and keep the clipped scan — a full scan there is
 *  ~1.2M noise calls per rebuild, and the horizon ring starts at 240
 *  tiles while visible ground ends at ~150 even at max zoom-out, so
 *  a centre-sampled horizon quad is never on screen. */
export const FAR_CELL_FULL_SCAN_MAX_TILES = 256;

/** BUILD 1031 — does the far cell [x0..x1]x[y0..y1] hold 2+ distinct
 *  terrains, so the renderer must subdivide it into per-row runs
 *  instead of one centre-sampled quad? `terrain` is the view's
 *  effTerrain (placed water/paths > in-map terrain > wild terrain);
 *  mapW/mapH are the authored-map bounds the clipped scan uses.
 *  Small cells (<=256 tiles: band + far, and any small sliver) scan
 *  the WHOLE cell, so a wild lake renders as its actual tiles and
 *  stays put as the player-centred grid shifts. Before this, the
 *  scan was clipped to cell ∩ map (the 1024 accepted limit: "wild
 *  lakes stay centre-sampled at distance"), so an out-of-map cell
 *  never scanned at all: a lake whose centre tile was water rendered
 *  as one solid blue quad, one whose centre was grass rendered as no
 *  water at all, and both flipped as the player walked — the
 *  user-reported "blue squares randomly appear and disappear in the
 *  distance". Large cells keep the clipped scan plus the analytic
 *  coast test, unchanged (a cell fully west of the coast is uniform
 *  ocean and correctly renders as one water quad). Cost, measured in
 *  ~/workspace/verify1031/measure2: +189k terrain calls / +7.7ms per
 *  rebuild near town, +214k / +30.9ms in deep wilderness, +1207 run
 *  quads (+7242 verts) near town, against a 165-211ms rebuild and a
 *  237k-vert buffer. A cheaper exact alternative exists (the lake
 *  field is bilinear per 32-tile lattice cell, so its max over a cell
 *  is at a lattice corner — a corner probe could prove "no lake" in
 *  ~9 calls); not taken now — the full scan is obviously correct and
 *  the saving is ~25ms on a ~200ms rebuild. */
export function cellIsMixed(
  x0: number, x1: number, y0: number, y1: number,
  terrain: (x: number, y: number) => string, mapW: number, mapH: number,
): boolean {
  const fullScan = (x1 - x0 + 1) * (y1 - y0 + 1) <= FAR_CELL_FULL_SCAN_MAX_TILES;
  const sx0 = fullScan ? x0 : Math.max(x0, 0);
  const sx1 = fullScan ? x1 : Math.min(x1, mapW - 1);
  const sy0 = fullScan ? y0 : Math.max(y0, 0);
  const sy1 = fullScan ? y1 : Math.min(y1, mapH - 1);
  let firstT: string | null = null;
  let mixed = false;
  for (let yy = sy0; yy <= sy1 && !mixed; yy++) for (let xx = sx0; xx <= sx1; xx++) {
    const t = terrain(xx, yy);
    if (firstT === null) firstT = t; else if (t !== firstT) { mixed = true; break; }
  }
  if (!mixed) {
    // Coast test: the cell straddles the coastline when the coast's
    // min/max over the cell's y-range overlaps the cell's x-range.
    // Conservative — a wavy coast may over-trigger by a cell;
    // subdivision is correct there, just a few extra quads.
    let cMin = Infinity, cMax = -Infinity;
    for (let yy = y0; yy <= y1 + 1; yy += 4) { const c = oceanCoastX(yy); if (c < cMin) cMin = c; if (c > cMax) cMax = c; }
    const cEnd = oceanCoastX(y1 + 1); if (cEnd < cMin) cMin = cEnd; if (cEnd > cMax) cMax = cEnd;
    mixed = cMin <= x1 + 1 && cMax >= x0;
  }
  return mixed;
}

/** Terrain of an out-of-map tile: 'water' for ocean or a lake,
 *  'grass' else. Never call for in-map tiles (terrainAt governs there). */
export function wildTerrainAt(x: number, y: number): 'grass' | 'water' {
  if (oceanAt(x, y)) return 'water';
  return wildLakeAt(x, y) ? 'water' : 'grass';
}

/** True when an out-of-map tile is walkable for the player: wild
 *  grass that holds no tree or rock, minus anything the player
 *  already chopped or mined (those stay gone, like 987/989). */
export function isWildWalkable(w: IsoWorld, x: number, y: number): boolean {
  if (oceanAt(x, y)) return false;
  if (wildLakeAt(x, y)) return false;
  const key = x + ',' + y;
  if (wildTreeAt(x, y) && !(w.removedWildTrees ?? []).includes(key)) return false;
  if (wildRockAt(x, y) && !(w.removedWildRocks ?? []).includes(key)) return false;
  return true;
}
