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

/** Remove the placed item covering (x, y), if any. Returns it plus its
 *  list index (BUILD 989: undo restores a removed placed item at its
 *  exact index, because first-match removal is order-sensitive for
 *  path+grass stacks), else null. */
export function takePlacementAt(w: IsoWorld, x: number, y: number): { item: PlacedItem; index: number } | null {
  const list = w.placements;
  if (!list) return null;
  const idx = list.findIndex((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
  if (idx < 0) return null;
  const [item] = list.splice(idx, 1);
  return { item, index: idx };
}

/** Remove the placed item covering (x, y), if any. Returns it, else null. */
export function removePlacementAt(w: IsoWorld, x: number, y: number): PlacedItem | null {
  const taken = takePlacementAt(w, x, y);
  return taken ? taken.item : null;
}

/** Remove the placed item exactly equal to `item` (kind + rect), if
 *  present. BUILD 989: undo of a placement. Returns true when removed. */
export function removeExactPlacement(w: IsoWorld, item: PlacedItem): boolean {
  const list = w.placements;
  if (!list) return false;
  const idx = list.findIndex((p) => p.kind === item.kind && p.x0 === item.x0 && p.y0 === item.y0 && p.x1 === item.x1 && p.y1 === item.y1);
  if (idx < 0) return false;
  list.splice(idx, 1);
  return true;
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
  | { kind: 'house'; rect: HutRect; index: number }
  | { kind: 'path'; x: number; y: number };

export function removeGeneratedAt(w: IsoWorld, x: number, y: number): GeneratedRemoval | null {
  const hut = hutAt(w, x, y);
  if (hut) {
    const index = w.huts.indexOf(hut);
    w.huts = w.huts.filter((h) => h !== hut);
    if (!w.removedHuts) w.removedHuts = [];
    if (!w.removedHuts.some((r) => r.x0 === hut.x0 && r.y0 === hut.y0 && r.x1 === hut.x1 && r.y1 === hut.y1)) {
      w.removedHuts.push({ x0: hut.x0, y0: hut.y0, x1: hut.x1, y1: hut.y1 });
    }
    return { kind: 'house', rect: hut, index };
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

/** BUILD 989: remove a GENERATED visible tree at (x, y). Since 986 every
 *  crate renders as a tree, so a visible tree may secretly be a crate
 *  entry — and a tile may hold both a real tree and a crate. Visually
 *  indistinguishable trees must behave identically, so ONE tap removes
 *  BOTH entries on the tile (the visible tree is fully gone, not
 *  secretly replaced by the stacked entry). This is deletion, NOT
 *  harvest: no wood is granted here — E-key remains the harvest path.
 *  Real trees are recorded in removedTrees (belt-and-braces; the adapter
 *  copies trees verbatim, so plain deletion would already persist).
 *  Crates are recorded in removedCrates (MANDATORY: the adapter's prop
 *  loop re-pushes layout props as crates on every load). Returns what
 *  was removed, or null when the tile holds no tree and no crate. */
export type GeneratedTreeRemoval = {
  tree: { tx: number; ty: number } | null; treeIndex: number;
  crate: { tx: number; ty: number } | null; crateIndex: number;
};

export function removeGeneratedTreeAt(w: IsoWorld, x: number, y: number): GeneratedTreeRemoval | null {
  const treeIndex = w.trees.findIndex((t) => t.tx === x && t.ty === y);
  const crateIndex = w.crates.findIndex((c) => c.tx === x && c.ty === y);
  if (treeIndex < 0 && crateIndex < 0) return null;
  let tree: { tx: number; ty: number } | null = null;
  let crate: { tx: number; ty: number } | null = null;
  if (treeIndex >= 0) {
    [tree] = w.trees.splice(treeIndex, 1);
    const key = terrainKey(x, y);
    if (!w.removedTrees) w.removedTrees = [];
    if (!w.removedTrees.includes(key)) w.removedTrees.push(key);
  }
  if (crateIndex >= 0) {
    [crate] = w.crates.splice(crateIndex, 1);
    const key = terrainKey(x, y);
    if (!w.removedCrates) w.removedCrates = [];
    if (!w.removedCrates.includes(key)) w.removedCrates.push(key);
  }
  return { tree, treeIndex, crate, crateIndex };
}

/** BUILD 989 refinement: what removeAt WOULD remove at (x, y), without
 *  mutating anything — the snap/paint/preview probe. Returns the kind
 *  only; the view calls removeAt on the snapped tile to do the work,
 *  so probe and action can never disagree about precedence. */
export type RemovableKind = 'placed' | 'house' | 'tree' | 'path';

export function peekRemovableAt(w: IsoWorld, x: number, y: number): RemovableKind | null {
  if (w.placements && w.placements.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1)) return 'placed';
  if (hutAt(w, x, y)) return 'house';
  if (w.trees.some((t) => t.tx === x && t.ty === y) || w.crates.some((c) => c.tx === x && c.ty === y)) return 'tree';
  if (terrainAt(w, x, y) === 'dirt') return 'path';
  return null;
}

/** BUILD 989 refinement: Remove tap tolerance, in world tiles. Phone
 *  orbit tiles are small, so exact-tile hits are fiddly: a Remove tap
 *  (or drag point) snaps to the NEAREST removable tile whose centre is
 *  within this distance of the picked continuous point. 1.5 tiles
 *  covers the tapped tile (max centre distance 0.71) plus its
 *  neighbours, without reaching two tiles away. Nearest wins; the
 *  tapped tile wins exact ties (so a tap squarely on a removable tile
 *  never jumps to a neighbour). Within one tile, precedence is the
 *  removeAt order (placed > house > tree > path), via peekRemovableAt.
 *  Nothing removable within tolerance => null => the view keeps the
 *  "Nothing to remove here" message. */
export const REMOVE_TAP_TOLERANCE = 1.5;

export function findRemovableNear(w: IsoWorld, fx: number, fy: number, tolerance: number = REMOVE_TAP_TOLERANCE): { tx: number; ty: number; kind: RemovableKind; dist: number } | null {
  const baseX = Math.floor(fx), baseY = Math.floor(fy);
  const radius = Math.ceil(tolerance) + 1;
  let best: { tx: number; ty: number; kind: RemovableKind; dist: number } | null = null;
  for (let ty = baseY - radius; ty <= baseY + radius; ty++) {
    for (let tx = baseX - radius; tx <= baseX + radius; tx++) {
      if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) continue;
      const kind = peekRemovableAt(w, tx, ty);
      if (!kind) continue;
      const dist = Math.hypot(tx + 0.5 - fx, ty + 0.5 - fy);
      if (dist > tolerance) continue;
      const isExact = tx === baseX && ty === baseY;
      if (!best || dist < best.dist - 1e-9 || (Math.abs(dist - best.dist) <= 1e-9 && isExact && !(best.tx === baseX && best.ty === baseY))) {
        best = { tx, ty, kind, dist };
      }
    }
  }
  return best;
}

/** BUILD 989: the full Remove-mode chain in one pure function, so the
 *  precedence is asserted standalone instead of living only in the
 *  view's tap handler. Order: placed item > generated house (whole
 *  rect) > generated tree (real tree and/or crate on the tile) >
 *  generated path (dirt tile). A tree standing on dirt therefore takes
 *  two taps (tree, then path), mirroring 987's hut-over-dirt two-tap.
 *  Generated stalls are NOT removed here (not asked): a stall tile
 *  with no tree/crate/house falls through to the path step, which
 *  preserves 987's edge (dirt under a stall is removed, the stall
 *  stands on grass). */
export type RemoveAtResult =
  | { kind: 'placed'; item: PlacedItem; index: number }
  | { kind: 'house'; rect: HutRect; index: number }
  | { kind: 'tree'; tree: { tx: number; ty: number } | null; treeIndex: number; crate: { tx: number; ty: number } | null; crateIndex: number }
  | { kind: 'path'; x: number; y: number };

export function removeAt(w: IsoWorld, x: number, y: number): RemoveAtResult | null {
  const placed = takePlacementAt(w, x, y);
  if (placed) return { kind: 'placed', item: placed.item, index: placed.index };
  if (hutAt(w, x, y)) {
    const gen = removeGeneratedAt(w, x, y);
    if (gen && gen.kind === 'house') return { kind: 'house', rect: gen.rect, index: gen.index };
  }
  const tr = removeGeneratedTreeAt(w, x, y);
  if (tr) return { kind: 'tree', tree: tr.tree, treeIndex: tr.treeIndex, crate: tr.crate, crateIndex: tr.crateIndex };
  const gen = removeGeneratedAt(w, x, y);
  if (gen && gen.kind === 'path') return { kind: 'path', x, y };
  return null;
}

/** BUILD 989: single-step undo. One slot only — the last Build-panel
 *  change. `place` = a placement to delete; `unplace` = a placed item
 *  to restore at its exact index; `unhouse`/`unpath`/`untree` = a
 *  generated removal to reverse (removed-set entry dropped, content
 *  restored). Movement, E-key harvest, and tool selection changes are
 *  NOT changes and never occupy the slot. */
export type UndoEntry =
  | { kind: 'place'; item: PlacedItem }
  | { kind: 'unplace'; item: PlacedItem; index: number }
  | { kind: 'unhouse'; rect: HutRect; index: number }
  | { kind: 'unpath'; x: number; y: number }
  | { kind: 'untree'; tree: { tx: number; ty: number } | null; treeIndex: number; crate: { tx: number; ty: number } | null; crateIndex: number }
  | { kind: 'stroke'; entries: UndoEntry[] };

/** BUILD 989 refinement: drag-to-remove (paint). Applies removeAt to
 *  each tile of a stroke, in order, with the SAME precedence,
 *  removed-set persistence, and no-wood rule as tap-remove (it IS
 *  removeAt, per tile). Rules: a tile already visited by this stroke
 *  is skipped (a tree standing on dirt still takes a SECOND stroke
 *  for the path underneath, exactly like the two-tap rule — one stroke
 *  never silently strips two layers); a tile inside a house/placed
 *  rect already removed by this stroke is skipped (house rect removed
 *  ONCE, however many of its tiles the stroke crosses). Returns null
 *  when the stroke removed nothing, so an empty drag never occupies
 *  the undo slot. The caller stores the whole stroke as ONE undo
 *  entry, so one Undo restores everything the stroke removed. */
export function removeAlongStroke(w: IsoWorld, tiles: Array<{ x: number; y: number }>): { entries: UndoEntry[]; removed: number } | null {
  const visited = new Set<string>();
  const removedRects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  const entries: UndoEntry[] = [];
  for (const t of tiles) {
    const key = terrainKey(t.x, t.y);
    if (visited.has(key)) continue;
    visited.add(key);
    if (removedRects.some((r) => t.x >= r.x0 && t.x <= r.x1 && t.y >= r.y0 && t.y <= r.y1)) continue;
    const res = removeAt(w, t.x, t.y);
    if (!res) continue;
    if (res.kind === 'placed') {
      entries.push({ kind: 'unplace', item: res.item, index: res.index });
      removedRects.push({ x0: res.item.x0, y0: res.item.y0, x1: res.item.x1, y1: res.item.y1 });
    } else if (res.kind === 'house') {
      entries.push({ kind: 'unhouse', rect: res.rect, index: res.index });
      removedRects.push({ x0: res.rect.x0, y0: res.rect.y0, x1: res.rect.x1, y1: res.rect.y1 });
    } else if (res.kind === 'tree') {
      entries.push({ kind: 'untree', tree: res.tree, treeIndex: res.treeIndex, crate: res.crate, crateIndex: res.crateIndex });
    } else {
      entries.push({ kind: 'unpath', x: res.x, y: res.y });
    }
  }
  if (entries.length === 0) return null;
  return { entries, removed: entries.length };
}

/** Reverse exactly one UndoEntry. Restores are exact (original indices,
 *  removed-set cleanup, terrain restore) and idempotent: re-adding
 *  content that is already present is skipped, so a stale entry cannot
 *  duplicate anything. Returns the user-facing message. */
export function applyUndo(w: IsoWorld, entry: UndoEntry): string {
  switch (entry.kind) {
    case 'stroke': {
      // Reverse order: restores exact indices best (later removals
      // restored first), and every sub-restore is already idempotent,
      // so a stale stroke entry cannot duplicate anything.
      for (let i = entry.entries.length - 1; i >= 0; i--) applyUndo(w, entry.entries[i]);
      const n = entry.entries.length;
      return 'Undid ' + n + (n === 1 ? ' removal' : ' removals');
    }
    case 'place': {
      removeExactPlacement(w, entry.item);
      return 'Undid placed ' + entry.item.kind;
    }
    case 'unplace': {
      if (!w.placements) w.placements = [];
      const item = entry.item;
      const exists = w.placements.some((p) => p.kind === item.kind && p.x0 === item.x0 && p.y0 === item.y0 && p.x1 === item.x1 && p.y1 === item.y1);
      if (!exists) w.placements.splice(Math.min(entry.index, w.placements.length), 0, item);
      return 'Restored ' + item.kind;
    }
    case 'unhouse': {
      const rect = entry.rect;
      if (w.removedHuts) w.removedHuts = w.removedHuts.filter((r) => !(r.x0 === rect.x0 && r.y0 === rect.y0 && r.x1 === rect.x1 && r.y1 === rect.y1));
      if (!w.huts.some((h) => h.x0 === rect.x0 && h.y0 === rect.y0 && h.x1 === rect.x1 && h.y1 === rect.y1)) {
        w.huts.splice(Math.min(entry.index, w.huts.length), 0, rect);
      }
      return 'Restored house';
    }
    case 'unpath': {
      const key = terrainKey(entry.x, entry.y);
      if (w.removedPaths) w.removedPaths = w.removedPaths.filter((k) => k !== key);
      w.terrain[key] = 'dirt';
      return 'Restored path';
    }
    case 'untree': {
      const tree = entry.tree;
      if (tree) {
        const key = terrainKey(tree.tx, tree.ty);
        if (w.removedTrees) w.removedTrees = w.removedTrees.filter((k) => k !== key);
        if (!w.trees.some((t) => t.tx === tree.tx && t.ty === tree.ty)) {
          w.trees.splice(Math.min(entry.treeIndex, w.trees.length), 0, tree);
        }
      }
      const crate = entry.crate;
      if (crate) {
        const key = terrainKey(crate.tx, crate.ty);
        if (w.removedCrates) w.removedCrates = w.removedCrates.filter((k) => k !== key);
        if (!w.crates.some((c) => c.tx === crate.tx && c.ty === crate.ty)) {
          w.crates.splice(Math.min(entry.crateIndex, w.crates.length), 0, crate);
        }
      }
      return 'Restored tree';
    }
  }
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
