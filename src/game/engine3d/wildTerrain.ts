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
//   - Lakes: groundNoise(x, y, 32) > 0.90. Measured on a 400x400
//     out-of-map sample: 1.76% water — occasional coherent lake blobs
//     (the field is smooth at 32-tile scale), not speckles, and never
//     near town (lakes are out-of-map only by construction).
//   - Everything else is grass (the terrainAt fallback, kept).
// Obstacle rule: the stored wilderness scatter in defaultWorld uses
// hash2(x, y, 7) with tree < 0.006 and rock in [0.006, 0.008), skipping
// inTown/onRoad/inPond — and every one of those exclusions is false
// outside the map, so the SAME hash with the SAME salt and thresholds
// continues the scatter exactly past the edge. Verified in the 1024
// asserts: every stored scatter tree/rock satisfies its rule. A tile
// cannot be both a lake and a tree/rock: lake wins, so no tree stands
// in a lake and no rock sits in one.
// Walkability: wild grass is walkable; lakes, wild trees and wild
// rocks block, exactly like their in-map counterparts (water, tree,
// rock). Chopped/mined wild items stay gone via the world's
// removedWildTrees / removedWildRocks sets (same rule as 987/989).
// NPCs, animals and transients never consult this module: their
// targets and spawn bands are all in-town, and their walkability
// (walkableWithPlacements -> isWalkableWorld) stays in-bounds. The
// wilderness is player-only by construction — "empty chunks", as
// ordered: landscape, no town, no NPCs, no quests.
import { hash2 as scatterHash } from '../iso/isoWorld';
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
 *  (and the tile is not a lake — lake wins). */
export function wildTreeAt(x: number, y: number): boolean {
  return !wildLakeAt(x, y) && wildScatter(x, y) < WILD_TREE_MAX;
}

/** True when the scatter hash puts a wild rock on this tile
 *  (and the tile is not a lake — lake wins). */
export function wildRockAt(x: number, y: number): boolean {
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

/** Terrain of an out-of-map tile: 'water' for a lake, 'grass' else.
 *  Never call for in-map tiles (terrainAt governs there). */
export function wildTerrainAt(x: number, y: number): 'grass' | 'water' {
  return wildLakeAt(x, y) ? 'water' : 'grass';
}

/** True when an out-of-map tile is walkable for the player: wild
 *  grass that holds no tree or rock, minus anything the player
 *  already chopped or mined (those stay gone, like 987/989). */
export function isWildWalkable(w: IsoWorld, x: number, y: number): boolean {
  if (wildLakeAt(x, y)) return false;
  const key = x + ',' + y;
  if (wildTreeAt(x, y) && !(w.removedWildTrees ?? []).includes(key)) return false;
  if (wildRockAt(x, y) && !(w.removedWildRocks ?? []).includes(key)) return false;
  return true;
}
