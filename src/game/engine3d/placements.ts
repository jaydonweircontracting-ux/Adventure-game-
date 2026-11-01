// BUILD 984 — player placement rules for the 3D mode Build tool.
// Pure module: no React, no WebGL. The 3D view owns the UI; this file
// owns the rules so they can be asserted standalone.
//
// Placed items live in IsoWorld.placements (see isoWorld.ts). They are
// deliberately NOT folded into world.huts/stalls/trees: the 3D adapter
// rebuilds generated lots near town on every load and would delete
// near-center placed work if it shared those arrays.
// Cost: FREE in V1. No Wood/Stone gate — the player's counters read 0,
// so a gate would let him place nothing (future economy decision).

import { hutAt, isWalkableWorld, terrainAt, terrainKey, type HutRect, type IsoWorld, type PlacedItem } from '../iso/isoWorld';

export type PaletteKind = 'path' | 'house' | 'tree' | 'stall' | 'grass';
export type PlaceResult = { ok: true; item: PlacedItem } | { ok: false; reason: string };

export function placementsOf(w: IsoWorld): PlacedItem[] {
  return w.placements ?? [];
}

export function addPlacement(w: IsoWorld, item: PlacedItem): void {
  if (!w.placements) w.placements = [];
  w.placements.push(item);
}

/** Remove the placed item covering (x, y), if any. Returns it, else null. */
export function removePlacementAt(w: IsoWorld, x: number, y: number): PlacedItem | null {
  const list = w.placements;
  if (!list) return null;
  const idx = list.findIndex((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
  if (idx < 0) return null;
  const [removed] = list.splice(idx, 1);
  return removed;
}

/** BUILD 987: remove a GENERATED thing at (x, y) — a whole hut rect or
 *  one dirt path tile. Placed items are NOT handled here (the caller
 *  tries removePlacementAt first); precedence is placed > house > path,
 *  matching the existing first-match pattern. Generated town content is
 *  rebuilt by the 3D adapter on every load, so removals are ALSO
 *  recorded in removedHuts / removedPaths, which the adapter consults
 *  — plain deletion alone would resurrect them on reload. Collision,
 *  grass-tuft blocking and rendering all derive from huts/terrain, so
 *  they update from this one mutation. Returns what was removed. */
export type GeneratedRemoval =
  | { kind: 'house'; rect: HutRect }
  | { kind: 'path'; x: number; y: number };

export function removeGeneratedAt(w: IsoWorld, x: number, y: number): GeneratedRemoval | null {
  const hut = hutAt(w, x, y);
  if (hut) {
    w.huts = w.huts.filter((h) => h !== hut);
    if (!w.removedHuts) w.removedHuts = [];
    if (!w.removedHuts.some((r) => r.x0 === hut.x0 && r.y0 === hut.y0 && r.x1 === hut.x1 && r.y1 === hut.y1)) {
      w.removedHuts.push({ x0: hut.x0, y0: hut.y0, x1: hut.x1, y1: hut.y1 });
    }
    return { kind: 'house', rect: hut };
  }
  if (terrainAt(w, x, y) === 'dirt') {
    const key = terrainKey(x, y);
    delete w.terrain[key];
    if (!w.removedPaths) w.removedPaths = [];
    if (!w.removedPaths.includes(key)) w.removedPaths.push(key);
    return { kind: 'path', x, y };
  }
  return null;
}

/** Non-terrain generated block on a tile (walls, buildings, stalls, trees, rocks, crates). */
function generatedBlock(w: IsoWorld, x: number, y: number): string | null {
  if (w.walls.some((wl) => wl.x === x && wl.y === y)) return 'a wall';
  if (w.huts.some((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1)) return 'a building';
  if (w.stalls.some((s) => y === s.y0 && x >= s.x0 && x <= s.x1)) return 'a market stall';
  if (w.trees.some((t) => t.tx === x && t.ty === y)) return 'a tree';
  if (w.rocks.some((r) => r.tx === x && r.ty === y)) return 'a rock';
  if (w.crates.some((c) => c.tx === x && c.ty === y)) return 'a crate';
  return null;
}

function placedBlock(w: IsoWorld, x: number, y: number): string | null {
  for (const p of placementsOf(w)) {
    if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return 'something you already placed';
  }
  return null;
}

function isWaypointTile(w: IsoWorld, x: number, y: number): boolean {
  return w.npcSpawns.some((s) => s.waypoints.some((wp) => wp.tx === x && wp.ty === y));
}

/**
 * Validate a placement whose tap landed on tile (tx, ty).
 * Houses are 3x3 centred on the tap; stalls are 2x1 (tap + east);
 * paths/trees/grass are single tiles. Standing rule: houses NEVER on
 * paths (dirt) or the square (sand); blocking items never on the
 * player, an NPC, or an NPC waypoint tile (an NPC that can never reach
 * its waypoint stalls forever). Paths are walkable ground, so they may
 * be placed under the player or an NPC. Grass (BUILD 985) is
 * walk-through decor: it may be placed on paths, the square and lawns
 * alike, under the player or an NPC, and on top of a placed path, but
 * never on water, walls, buildings, stalls, trees, rocks or crates,
 * and never twice on one tile. It never blocks movement.
 */
export function validatePlacement(
  w: IsoWorld,
  kind: PaletteKind,
  tx: number,
  ty: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): PlaceResult {
  const tiles: Array<{ x: number; y: number }> = [];
  if (kind === 'house') {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push({ x: tx + dx, y: ty + dy });
  } else if (kind === 'stall') {
    tiles.push({ x: tx, y: ty }, { x: tx + 1, y: ty });
  } else {
    tiles.push({ x: tx, y: ty });
  }
  for (const t of tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= w.w || t.y >= w.h) return { ok: false, reason: 'outside the map' };
  }
  for (const t of tiles) {
    const terrain = terrainAt(w, t.x, t.y);
    if (terrain === 'water') return { ok: false, reason: 'water' };
    if (kind === 'path') {
      if (terrain === 'dirt') return { ok: false, reason: 'already a path or road' };
    } else if (kind === 'grass') {
      // No terrain rejection: grass grows on paths, squares and lawns.
    } else {
      if (terrain === 'dirt') return { ok: false, reason: 'a path or road' };
      if (terrain === 'sand') return { ok: false, reason: 'the town square' };
    }
    const gen = generatedBlock(w, t.x, t.y);
    if (gen) return { ok: false, reason: gen };
    if (kind === 'grass') {
      // Placed paths do not conflict (grass on a path is allowed);
      // anything else covering the tile does.
      for (const p of placementsOf(w)) {
        if (t.x >= p.x0 && t.x <= p.x1 && t.y >= p.y0 && t.y <= p.y1) {
          if (p.kind === 'path') continue;
          if (p.kind === 'grass') return { ok: false, reason: 'grass already here' };
          return { ok: false, reason: 'something you already placed' };
        }
      }
    } else {
      const pl = placedBlock(w, t.x, t.y);
      if (pl) return { ok: false, reason: pl };
    }
  }
  if (kind !== 'path' && kind !== 'grass') {
    for (const t of tiles) {
      if (t.x === playerTile.x && t.y === playerTile.y) return { ok: false, reason: 'where you are standing' };
      if (npcTiles.some((n) => n.x === t.x && n.y === t.y)) return { ok: false, reason: 'where someone is standing' };
      if (isWaypointTile(w, t.x, t.y)) return { ok: false, reason: 'an NPC walking route' };
    }
  }
  const item: PlacedItem =
    kind === 'house'
      ? { kind, x0: tx - 1, y0: ty - 1, x1: tx + 1, y1: ty + 1 }
      : kind === 'stall'
        ? { kind, x0: tx, y0: ty, x1: tx + 1, y1: ty }
        : { kind, x0: tx, y0: ty, x1: tx, y1: ty };
  return { ok: true, item };
}

/** True when a placed house/stall/tree blocks the tile. Placed paths
 *  and grass never block. */
export function isPlacedBlocking(w: IsoWorld, x: number, y: number): boolean {
  for (const p of placementsOf(w)) {
    if (p.kind === 'path' || p.kind === 'grass') continue;
    if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return true;
  }
  return false;
}

/** Generated walkability plus placed blocks. This is the only walkability
 *  check the 3D view's movement, NPC steps, and spawn restore may use. */
export function walkableWithPlacements(w: IsoWorld, crates: IsoWorld['crates'], x: number, y: number): boolean {
  if (!isWalkableWorld(w, crates, x, y)) return false;
  return !isPlacedBlocking(w, x, y);
}

// ---- Render lists (shapes match the generated arrays so the 3D view's
// existing house/tree/stall loops can iterate the union unchanged). ----

/** Placed houses as hut rects; door derived at render time (south edge centre). */
export function placedHutRects(w: IsoWorld): Array<{ x0: number; y0: number; x1: number; y1: number; doorX: number; doorY: number }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'house')
    .map((p) => ({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, doorX: Math.round((p.x0 + p.x1) / 2), doorY: p.y1 }));
}

export function placedTreeTiles(w: IsoWorld): Array<{ tx: number; ty: number }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'tree')
    .map((p) => ({ tx: p.x0, ty: p.y0 }));
}

export function placedStallRects(w: IsoWorld): Array<{ x0: number; y0: number; x1: number }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'stall')
    .map((p) => ({ x0: p.x0, y0: p.y0, x1: p.x1 }));
}

/** Placed grass tiles (BUILD 985). Single tiles, like placed paths. */
export function placedGrassTiles(w: IsoWorld): Array<{ tx: number; ty: number }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'grass')
    .map((p) => ({ tx: p.x0, ty: p.y0 }));
}

/** Terrain keys of placed path tiles, for the terrain loop's effective terrain. */
export function placedPathKeys(w: IsoWorld): Set<string> {
  const keys = new Set<string>();
  for (const p of placementsOf(w)) {
    if (p.kind === 'path') keys.add(terrainKey(p.x0, p.y0));
  }
  return keys;
}
