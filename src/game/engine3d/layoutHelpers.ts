// BUILD 1042 — Town Builder Stage 5: LAYOUT HELPERS. Pure module: no
// React, no WebGL. The 3D view owns the UI (the Layout section of the
// AREA SELECT actions menu); this file owns the helper rules so they
// can be asserted standalone.
//
// Every helper is an OPTIONAL tool: nothing runs until the player taps
// its button in the actions menu, and each one acts only on the current
// AREA SELECT selection. Nothing rearranges the town on its own, and
// nothing here runs automatically. Every helper that changes the world
// returns ONE undo entry (a `group`), so one Undo tap undoes the whole
// helper.
//
// Helpers:
// - Doors face paths: each selected house (placed or generated) rotates
//   in place (90° steps, the 1036 rule — the door face turns with the
//   house) so its door faces the side whose door tile is nearest a
//   pathway (generated dirt or a placed path). The house never moves.
// - Trees off paths: each selected generated tree standing on a path
//   tile moves to the nearest clear tile beside the path (BFS, at most
//   8 tiles). Trees are never deleted. (A placed tree can never be on
//   a path — placement refuses it — so only generated trees move.)
// - Lanterns along roads: a lantern (the 1040 kind, which glows at
//   night) on the edge of the road, at least 6 tiles apart along the
//   selected paths, where a free edge tile exists.
// - Fences around property: a low wooden fence (the new 'fence' kind)
//   around the 1-tile halo of each selected house, with a gate gap on
//   the door face so the door stays reachable. Fences block movement
//   like walls.
// - Align row / Align column: every alignable selected item moves so
//   its top edge (row) or left edge (column) matches the smallest edge
//   in the selection. Generated rocks and walls have no move machinery
//   and are skipped, with a reason.
// - ENHANCE: fills EMPTY ground in the selection with grass, bushes,
//   and the odd tree (deterministic per tile, so a second tap adds
//   nothing new). It never moves or removes anything already there.
// - ADJUST spacing (spread out / pack together): every alignable
//   selected item moves one tile away from / toward the selection
//   centre. That is the whole of ADJUST in this build:
//   - scale, elevation, tree rotation, and vegetation size are NOT
//     here, because there is no per-item scale or elevation to change
//     (the renderer has no per-item scale — only generated
//     wildflower/grass scale — and the heightfield is global; trees
//     are 1x1 with no rotation). Those stay pending on a real
//     size/rotation feature, and are not faked.

import { terrainAt, type HutRect, type IsoWorld, type PlacedItem } from '../iso/isoWorld';
import { areaCentreTile, rotateArea, type AreaSelection, type Face } from './areaSelect';
import {
  addPlacement, applyUndo, doorForRect, edgeConnectedTiles, hutFace,
  isHouseKind, moveGeneratedHut, moveGeneratedPath, moveGeneratedTree,
  movePlacement, newlyTrapped, rotateFace, validatePlacement,
  type PaletteKind, type UndoEntry,
} from './placements';

export type LayoutSkip = { label: string; reason: string };

/** A helper's outcome. `changed` counts what actually changed;
 *  `entry` is the ONE undo entry (null when nothing changed);
 *  `message` is the player-facing result line (the view appends the
 *  first skip reason, if any). A failed helper changes nothing. */
export type LayoutResult =
  | { ok: true; changed: number; skipped: LayoutSkip[]; entry: UndoEntry | null; message: string }
  | { ok: false; reason: string; skipped: LayoutSkip[] };

/** How far a door may look for its nearest path (tiles). Beyond
 *  this the rotation would be arbitrary — the house is not really
 *  "by" a path — so the house is skipped, with a reason. */
export const NEAR_PATH_MAX = 20;
/** Lanterns along a road sit at least this many tiles apart
 *  (Manhattan, from the last lantern's anchor tile). */
export const LANTERN_MIN_GAP = 6;
/** Most lanterns one tap of the helper may place (a huge selection
 *  must not flood the world). */
export const LANTERN_MAX_PER_TAP = 12;
/** Most fence tiles one tap of the helper may place. */
export const FENCE_MAX_PER_TAP = 60;
/** Most new plants one tap of ENHANCE may place. */
export const ENHANCE_MAX_PER_TAP = 40;
/** How far a tree on a path may travel to get off it (BFS tiles). */
export const TREE_MOVE_RADIUS = 8;

const key = (x: number, y: number) => x + ',' + y;

/** The four faces in rotateFace order (north -> east -> south ->
 *  west is one quarter-turn clockwise). */
const FACE_ORDER: Face[] = ['north', 'east', 'south', 'west'];

/** Quarter-turns clockwise (the rotateFace direction) from `from`
 *  to `to`. */
function stepsBetween(from: Face, to: Face): number {
  return (FACE_ORDER.indexOf(to) - FACE_ORDER.indexOf(from) + 4) % 4;
}

/** A one-item selection around a placed item, so the 1037 group
 *  machinery (rotateArea) can act on that item alone. The rect is
 *  the item's own rect, so the rotation centre is the item's centre. */
function singlePlaced(item: PlacedItem): AreaSelection {
  return { rect: { x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1 }, placed: [item], huts: [], trees: [], rocks: [], walls: [], paths: [], notes: [] };
}

function singleHut(hut: HutRect): AreaSelection {
  return { rect: { x0: hut.x0, y0: hut.y0, x1: hut.x1, y1: hut.y1 }, placed: [], huts: [hut], trees: [], rocks: [], walls: [], paths: [], notes: [] };
}

/** Every path tile near a rect: generated dirt inside the rect
 *  expanded by `pad`, plus every placed path tile in that box. A
 *  placed path is a PlacedItem, not terrain — terrainAt never sees
 *  it — so both sources are needed. */
function pathTileKeysNear(w: IsoWorld, rect: { x0: number; y0: number; x1: number; y1: number }, pad: number): Set<string> {
  const out = new Set<string>();
  const x0 = Math.max(0, rect.x0 - pad), y0 = Math.max(0, rect.y0 - pad);
  const x1 = Math.min(w.w - 1, rect.x1 + pad), y1 = Math.min(w.h - 1, rect.y1 + pad);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (terrainAt(w, x, y) === 'dirt') out.add(key(x, y));
    }
  }
  for (const p of w.placements ?? []) {
    if (p.kind !== 'path') continue;
    for (let y = p.y0; y <= p.y1; y++) {
      for (let x = p.x0; x <= p.x1; x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out.add(key(x, y));
      }
    }
  }
  return out;
}

/** Path tiles inside a selection: the generated dirt tiles the
 *  selection holds, plus its placed path items. */
function pathTilesInSelection(w: IsoWorld, sel: AreaSelection): Array<{ x: number; y: number }> {
  const out = [...sel.paths];
  for (const p of sel.placed) {
    if (p.kind === 'path') out.push({ x: p.x0, y: p.y0 });
  }
  return out;
}

/** Manhattan distance from (x, y) to the nearest key in `keys`
 *  (Infinity when the set is empty). The set is small (a road), so a
 *  linear scan is the honest implementation. */
function nearestPathDist(keys: Set<string>, x: number, y: number): number {
  let best = Infinity;
  for (const k of keys) {
    const comma = k.indexOf(',');
    const px = Number(k.slice(0, comma)), py = Number(k.slice(comma + 1));
    const d = Math.abs(px - x) + Math.abs(py - y);
    if (d < best) best = d;
  }
  return best;
}

/** Every selected house (placed or generated) with its rect, its
 *  current door face, and a label. */
function housesInSelection(sel: AreaSelection): Array<{ rect: { x0: number; y0: number; x1: number; y1: number }; face: Face; label: string; single: AreaSelection }> {
  const out: Array<{ rect: { x0: number; y0: number; x1: number; y1: number }; face: Face; label: string; single: AreaSelection }> = [];
  for (const item of sel.placed) {
    if (item.kind === 'custom' || !isHouseKind(item.kind)) continue;
    out.push({ rect: { x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1 }, face: rotateFace('south', item.rot ?? 0), label: 'House at (' + item.x0 + ',' + item.y0 + ')', single: singlePlaced(item) });
  }
  for (const hut of sel.huts) {
    out.push({ rect: { x0: hut.x0, y0: hut.y0, x1: hut.x1, y1: hut.y1 }, face: hutFace(hut), label: 'House at (' + hut.x0 + ',' + hut.y0 + ')', single: singleHut(hut) });
  }
  return out;
}

/** Finish a helper that built `entries`: one group undo entry, or
 *  null when nothing changed. A group that would newly trap the
 *  player or a villager rolls back entirely (the same applyUndo path
 *  as a real undo) and fails without changing the world. */
function finishGroup(
  w: IsoWorld,
  entries: UndoEntry[],
  label: string,
  message: string,
  changed: number,
  skipped: LayoutSkip[],
  preFree: Set<string>,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): LayoutResult {
  if (entries.length === 0) return { ok: true, changed: 0, skipped, entry: null, message: 'Nothing changed' };
  const entry: UndoEntry = { kind: 'group', entries, label };
  const trapped = newlyTrapped(preFree, w, playerTile, npcTiles);
  if (trapped.player || trapped.npcs) {
    applyUndo(w, entry);
    return { ok: false, reason: trapped.player ? 'would trap you' : 'would trap a villager', skipped };
  }
  return { ok: true, changed, skipped, entry, message };
}

// ---- Doors face paths ----

/** DOORS FACE PATHS — rotate each selected house in place so its
 *  door faces the side whose door tile is nearest a pathway. The
 *  house never moves (its centre tile is the rotation centre, the
 *  1037 rotateArea machinery, one house at a time). A house with no
 *  path within NEAR_PATH_MAX tiles is skipped; a house already
 *  facing its nearest path is left alone. The per-house group
 *  entries are flattened into the one outer group entry, so the
 *  whole helper is one undo step and the two-phase move handling
 *  covers cycles across houses. */
export function doorsFacePaths(
  w: IsoWorld,
  sel: AreaSelection,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): LayoutResult {
  const pathKeys = pathTileKeysNear(w, sel.rect, NEAR_PATH_MAX);
  const entries: UndoEntry[] = [];
  const skipped: LayoutSkip[] = [];
  let changed = 0;
  for (const h of housesInSelection(sel)) {
    const dists = new Map<Face, number>();
    for (const f of FACE_ORDER) {
      const d = doorForRect(h.rect.x0, h.rect.y0, h.rect.x1, h.rect.y1, f);
      dists.set(f, nearestPathDist(pathKeys, d.x, d.y));
    }
    const min = Math.min(...dists.values());
    if (!Number.isFinite(min) || min > NEAR_PATH_MAX) {
      skipped.push({ label: h.label, reason: 'no path nearby' });
      continue;
    }
    // A tie keeps the current face — no churn for a house that
    // already faces a path as near as any other side.
    if (dists.get(h.face) === min) continue;
    const bestFace = FACE_ORDER.find((f) => dists.get(f) === min)!;
    const res = rotateArea(w, h.single, stepsBetween(h.face, bestFace), playerTile, npcTiles);
    if (!res.ok) {
      skipped.push({ label: h.label, reason: res.reason });
      continue;
    }
    for (const s of res.skipped) skipped.push(s);
    if (res.entry && res.entry.kind === 'group') {
      entries.push(...res.entry.entries);
      changed++;
    }
  }
  if (entries.length === 0) {
    return { ok: true, changed: 0, skipped, entry: null, message: 'Doors already face the nearest path' };
  }
  return finishGroup(w, entries, 'Doors face paths', 'Doors now face the nearest path (' + changed + ' house' + (changed === 1 ? '' : 's') + ')', changed, skipped, edgeConnectedTiles(w), playerTile, npcTiles);
}

// ---- Trees off paths ----

/** The nearest tile to (x, y) where a tree validates, by BFS over
 *  4-neighbours in a fixed order (north, east, south, west), out to
 *  TREE_MOVE_RADIUS tiles. The destination is never on a path —
 *  validatePlacement refuses dirt — so the tree lands beside the
 *  path, not on it. Null when no clear tile is near enough. */
function findClearTreeTile(
  w: IsoWorld,
  x: number,
  y: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): { x: number; y: number } | null {
  const seen = new Set<string>([key(x, y)]);
  const queue: Array<{ x: number; y: number; d: number }> = [{ x, y, d: 0 }];
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (c.d > 0 && validatePlacement(w, 'tree', c.x, c.y, playerTile, npcTiles).ok) return { x: c.x, y: c.y };
    if (c.d >= TREE_MOVE_RADIUS) continue;
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny, d: c.d + 1 });
    }
  }
  return null;
}

/** TREES OFF PATHS — move each selected generated tree standing on
 *  a path tile to the nearest clear tile beside the path. The tree
 *  (and a crate sharing its tile — the 989 coherence rule) travels
 *  together; the source tile is left completely empty. Nothing is
 *  deleted. A tree with no clear tile nearby is skipped. */
export function treesOffPaths(
  w: IsoWorld,
  sel: AreaSelection,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): LayoutResult {
  const preFree = edgeConnectedTiles(w);
  const pathKeys = new Set<string>(pathTilesInSelection(w, sel).map((t) => key(t.x, t.y)));
  const entries: UndoEntry[] = [];
  const skipped: LayoutSkip[] = [];
  let changed = 0;
  for (const t of sel.trees) {
    if (!pathKeys.has(key(t.x, t.y))) continue;
    const label = 'Tree at (' + t.x + ',' + t.y + ')';
    const dest = findClearTreeTile(w, t.x, t.y, playerTile, npcTiles);
    if (!dest) {
      skipped.push({ label, reason: 'no clear tile nearby' });
      continue;
    }
    const res = moveGeneratedTree(w, t.x, t.y, dest.x, dest.y, playerTile, npcTiles);
    if (!res.ok) {
      skipped.push({ label, reason: res.reason });
      continue;
    }
    if (res.same) continue;
    entries.push(res.entry);
    changed++;
  }
  if (entries.length === 0) {
    return { ok: true, changed: 0, skipped, entry: null, message: 'No trees standing on paths here' };
  }
  return finishGroup(w, entries, 'Trees off paths', 'Moved ' + changed + ' tree' + (changed === 1 ? '' : 's') + ' off the path', changed, skipped, preFree, playerTile, npcTiles);
}

// ---- Lanterns along roads ----

/** LANTERNS ALONG ROADS — a lantern on the edge of each selected
 *  road, at least LANTERN_MIN_GAP tiles apart (Manhattan, from the
 *  last lantern's anchor tile), where a free edge tile exists. The
 *  four neighbours are tried in a fixed order (north, east, south,
 *  west); a road tile whose edges are all blocked is skipped, with
 *  a reason. At most LANTERN_MAX_PER_TAP lanterns per tap. */
export function lanternsAlongRoads(
  w: IsoWorld,
  sel: AreaSelection,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): LayoutResult {
  const preFree = edgeConnectedTiles(w);
  const paths = pathTilesInSelection(w, sel).sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const entries: UndoEntry[] = [];
  const skipped: LayoutSkip[] = [];
  let placed = 0;
  let lastAnchor: { x: number; y: number } | null = null;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  for (const t of paths) {
    if (placed >= LANTERN_MAX_PER_TAP) break;
    if (lastAnchor && Math.abs(t.x - lastAnchor.x) + Math.abs(t.y - lastAnchor.y) < LANTERN_MIN_GAP) continue;
    let done = false;
    for (const [dx, dy] of DIRS) {
      const res = validatePlacement(w, 'lantern', t.x + dx, t.y + dy, playerTile, npcTiles);
      if (!res.ok) continue;
      addPlacement(w, res.item);
      entries.push({ kind: 'place', item: res.item });
      placed++;
      lastAnchor = t;
      done = true;
      break;
    }
    if (!done) skipped.push({ label: 'Path at (' + t.x + ',' + t.y + ')', reason: 'no free edge tile' });
  }
  if (entries.length === 0) {
    return { ok: true, changed: 0, skipped, entry: null, message: 'No lanterns fit along these roads' };
  }
  return finishGroup(w, entries, 'Lanterns along roads', 'Placed ' + placed + ' lantern' + (placed === 1 ? '' : 's') + ' along the road', placed, skipped, preFree, playerTile, npcTiles);
}

// ---- Fences around property ----

/** The 1-tile halo of a rect (every tile at Chebyshev distance
 *  exactly 1), in a fixed order (top row first, left to right). */
function haloTiles(rect: { x0: number; y0: number; x1: number; y1: number }): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = rect.y0 - 1; y <= rect.y1 + 1; y++) {
    for (let x = rect.x0 - 1; x <= rect.x1 + 1; x++) {
      if (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** The gate gap: on the door face, the halo tiles within one tile
 *  (along the face) of the door's outside tile stay open, so the
 *  door stays reachable. A fence with no gap would wall the house
 *  in — the gap is the gate. */
function isGateGap(rect: { x0: number; y0: number; x1: number; y1: number }, face: Face, tx: number, ty: number): boolean {
  const door = doorForRect(rect.x0, rect.y0, rect.x1, rect.y1, face);
  if (face === 'south') return ty === rect.y1 + 1 && Math.abs(tx - door.x) <= 1;
  if (face === 'north') return ty === rect.y0 - 1 && Math.abs(tx - door.x) <= 1;
  if (face === 'west') return tx === rect.x0 - 1 && Math.abs(ty - door.y) <= 1;
  return tx === rect.x1 + 1 && Math.abs(ty - door.y) <= 1;
}

/** FENCES AROUND PROPERTY — a low wooden fence around the 1-tile
 *  halo of each selected house, with a gate gap on the door face.
 *  Halo tiles that cannot hold a fence (a path, a tree, another
 *  house, the player) are skipped — the fence follows the lot where
 *  it fits — and reported per house, not per tile. At most
 *  FENCE_MAX_PER_TAP fence tiles per tap. */
export function fencesAroundProperty(
  w: IsoWorld,
  sel: AreaSelection,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): LayoutResult {
  const preFree = edgeConnectedTiles(w);
  const entries: UndoEntry[] = [];
  const skipped: LayoutSkip[] = [];
  let placed = 0;
  for (const h of housesInSelection(sel)) {
    if (placed >= FENCE_MAX_PER_TAP) break;
    let blocked = 0;
    for (const t of haloTiles(h.rect)) {
      if (placed >= FENCE_MAX_PER_TAP) break;
      if (isGateGap(h.rect, h.face, t.x, t.y)) continue;
      const res = validatePlacement(w, 'fence', t.x, t.y, playerTile, npcTiles);
      if (!res.ok) {
        blocked++;
        continue;
      }
      addPlacement(w, res.item);
      entries.push({ kind: 'place', item: res.item });
      placed++;
    }
    if (blocked > 0) skipped.push({ label: h.label, reason: blocked + ' fence tile' + (blocked === 1 ? '' : 's') + ' blocked' });
  }
  if (entries.length === 0) {
    return { ok: true, changed: 0, skipped, entry: null, message: 'No fence fits around these houses' };
  }
  return finishGroup(w, entries, 'Fences around property', 'Fenced ' + placed + ' tile' + (placed === 1 ? '' : 's') + ' around the houses', placed, skipped, preFree, playerTile, npcTiles);
}

// ---- Align / adjust: the shared move machinery ----

type Alignable =
  | { kind: 'placed'; item: PlacedItem; x0: number; y0: number; x1: number; y1: number; label: string }
  | { kind: 'hut'; rect: HutRect; x0: number; y0: number; x1: number; y1: number; label: string }
  | { kind: 'tree'; x: number; y: number; x0: number; y0: number; x1: number; y1: number; hasTree: boolean; hasCrate: boolean; label: string }
  | { kind: 'path'; x: number; y: number; x0: number; y0: number; x1: number; y1: number; label: string };

/** What align and adjust-spacing can move. Placed items (any kind),
 *  generated houses, generated trees, and generated paths. Generated
 *  rocks and walls have no move machinery — they are reported as
 *  skipped, not silently dropped. */
function alignableItems(w: IsoWorld, sel: AreaSelection): { items: Alignable[]; skipped: LayoutSkip[] } {
  const items: Alignable[] = [];
  const skipped: LayoutSkip[] = [];
  for (const item of sel.placed) {
    items.push({ kind: 'placed', item, x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1, label: 'Placed ' + item.kind + ' at (' + item.x0 + ',' + item.y0 + ')' });
  }
  for (const hut of sel.huts) {
    items.push({ kind: 'hut', rect: hut, x0: hut.x0, y0: hut.y0, x1: hut.x1, y1: hut.y1, label: 'House at (' + hut.x0 + ',' + hut.y0 + ')' });
  }
  for (const t of sel.trees) {
    items.push({ kind: 'tree', x: t.x, y: t.y, x0: t.x, y0: t.y, x1: t.x, y1: t.y, hasTree: t.hasTree, hasCrate: t.hasCrate, label: 'Tree at (' + t.x + ',' + t.y + ')' });
  }
  for (const p of sel.paths) {
    items.push({ kind: 'path', x: p.x, y: p.y, x0: p.x, y0: p.y, x1: p.x, y1: p.y, label: 'Path at (' + p.x + ',' + p.y + ')' });
  }
  for (const rk of sel.rocks) skipped.push({ label: 'Rock at (' + rk.x + ',' + rk.y + ')', reason: 'rocks are not aligned' });
  for (const wl of sel.walls) skipped.push({ label: 'Wall at (' + wl.x + ',' + wl.y + ')', reason: 'walls are not aligned' });
  return { items, skipped };
}

/** The placement tap tile for an item moved to a new rect: house =
 *  rect centre, stall = its min tile (west at rot 0, north at rot
 *  1 — both are the rect's min tile), everything else = the rect's
 *  min tile. The pasteTapTile anchor math, mirrored here. */
function destTapForMove(item: PlacedItem, rect: { x0: number; y0: number; x1: number; y1: number }): { x: number; y: number } {
  if (item.kind !== 'custom' && isHouseKind(item.kind)) return { x: Math.round((rect.x0 + rect.x1) / 2), y: Math.round((rect.y0 + rect.y1) / 2) };
  return { x: rect.x0, y: rect.y0 };
}

type MoveOutcome =
  | { ok: true; entry: UndoEntry | null }
  | { ok: false; reason: string };

/** Move one alignable item by (dx, dy), under the normal rules.
 *  A placed item moves through movePlacement (rotation preserved);
 *  a generated house/tree/path through its own move function. The
 *  item is lifted first by the move itself, so a destination
 *  overlapping its own old rect validates against freed tiles. */
function moveAlignable(
  w: IsoWorld,
  it: Alignable,
  dx: number,
  dy: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): MoveOutcome {
  if (it.kind === 'placed') {
    const rect = { x0: it.x0 + dx, y0: it.y0 + dy, x1: it.x1 + dx, y1: it.y1 + dy };
    const tap = destTapForMove(it.item, rect);
    const res = movePlacement(w, it.item, tap.x, tap.y, playerTile, npcTiles);
    if (!res.ok) return { ok: false, reason: res.reason };
    return { ok: true, entry: { kind: 'move', oldItem: it.item, newItem: res.item, index: res.index } };
  }
  if (it.kind === 'hut') {
    const cx = Math.round((it.x0 + it.x1) / 2) + dx;
    const cy = Math.round((it.y0 + it.y1) / 2) + dy;
    const res = moveGeneratedHut(w, it.rect, cx, cy, playerTile, npcTiles);
    if (!res.ok) return { ok: false, reason: res.reason };
    return { ok: true, entry: res.same ? null : res.entry };
  }
  if (it.kind === 'tree') {
    const res = moveGeneratedTree(w, it.x, it.y, it.x + dx, it.y + dy, playerTile, npcTiles);
    if (!res.ok) return { ok: false, reason: res.reason };
    return { ok: true, entry: res.same ? null : res.entry };
  }
  const res = moveGeneratedPath(w, it.x, it.y, it.x + dx, it.y + dy);
  if (!res.ok) return { ok: false, reason: res.reason };
  return { ok: true, entry: res.same ? null : res.entry };
}

/** Run a list of per-item (dx, dy) moves as ONE group undo entry,
 *  in the given order, with one trap check at the end. A move that
 *  cannot land is skipped, with a reason — the rest still move. */
function runMoves(
  w: IsoWorld,
  moves: Array<{ it: Alignable; dx: number; dy: number }>,
  label: string,
  message: string,
  changedNoun: string,
  preFree: Set<string>,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
  baseSkipped: LayoutSkip[],
): LayoutResult {
  const entries: UndoEntry[] = [];
  const skipped: LayoutSkip[] = [...baseSkipped];
  let changed = 0;
  for (const m of moves) {
    const res = moveAlignable(w, m.it, m.dx, m.dy, playerTile, npcTiles);
    if (!res.ok) {
      skipped.push({ label: m.it.label, reason: res.reason });
      continue;
    }
    if (res.entry) {
      entries.push(res.entry);
      changed++;
    }
  }
  if (entries.length === 0) {
    return { ok: true, changed: 0, skipped, entry: null, message: 'Nothing moved' };
  }
  return finishGroup(w, entries, label, message + ' (' + changed + ' ' + changedNoun + (changed === 1 ? '' : 's') + ')', changed, skipped, preFree, playerTile, npcTiles);
}

// ---- Align ----

/** ALIGN — line the selected items up: every alignable item moves
 *  so its top edge (row) or left edge (column) matches the smallest
 *  edge in the selection. Items already on the line do not move.
 *  Moves run topmost/leftmost first, so a move up/left never lands
 *  on an item that is about to move away. */
export function alignArea(
  w: IsoWorld,
  sel: AreaSelection,
  axis: 'row' | 'col',
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): LayoutResult {
  const preFree = edgeConnectedTiles(w);
  const { items, skipped } = alignableItems(w, sel);
  if (items.length === 0) {
    return { ok: true, changed: 0, skipped, entry: null, message: 'Nothing here can be aligned' };
  }
  const target = axis === 'row' ? Math.min(...items.map((i) => i.y0)) : Math.min(...items.map((i) => i.x0));
  const ordered = [...items].sort((a, b) => (axis === 'row' ? (a.y0 - b.y0 || a.x0 - b.x0) : (a.x0 - b.x0 || a.y0 - b.y0)));
  const moves = ordered
    .map((it) => ({ it, dx: axis === 'col' ? target - it.x0 : 0, dy: axis === 'row' ? target - it.y0 : 0 }))
    .filter((m) => m.dx !== 0 || m.dy !== 0);
  return runMoves(w, moves, axis === 'row' ? 'Aligned row' : 'Aligned column', axis === 'row' ? 'Aligned to a row' : 'Aligned to a column', 'item', preFree, playerTile, npcTiles, skipped);
}

// ---- ENHANCE ----

/** Deterministic per-tile hash (the tile's own coords are the seed),
 *  so the same area enhances the same way every time — and a second
 *  tap adds nothing new, because the picked tiles are no longer
 *  empty. */
function tileHash(x: number, y: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
}

/** True when a tile holds nothing at all: no hut, stall, tree,
 *  crate, rock, or wall, and no placed item of any kind. (Terrain
 *  is checked by the caller — ENHANCE only plants on grass.) */
function isEmptyTile(w: IsoWorld, x: number, y: number): boolean {
  if (w.huts.some((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1)) return false;
  if (w.stalls.some((s) => y === s.y0 && x >= s.x0 && x <= s.x1)) return false;
  if (w.trees.some((t) => t.tx === x && t.ty === y)) return false;
  if (w.crates.some((c) => c.tx === x && c.ty === y)) return false;
  if (w.rocks.some((r) => r.tx === x && r.ty === y)) return false;
  if (w.walls.some((wl) => wl.x === x && wl.y === y)) return false;
  for (const p of w.placements ?? []) {
    if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return false;
  }
  return true;
}

/** ENHANCE — fill EMPTY ground in the selection with grass, bushes,
 *  and the odd tree (about 30% grass, 8% bush, 1% tree, by the
 *  tile hash). It never moves or removes anything already there:
 *  only tiles that are bare grass with nothing on them are planted.
 *  At most ENHANCE_MAX_PER_TAP new plants per tap. */
export function enhanceArea(
  w: IsoWorld,
  sel: AreaSelection,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): LayoutResult {
  const preFree = edgeConnectedTiles(w);
  const entries: UndoEntry[] = [];
  const skipped: LayoutSkip[] = [];
  let changed = 0;
  for (let y = sel.rect.y0; y <= sel.rect.y1; y++) {
    for (let x = sel.rect.x0; x <= sel.rect.x1; x++) {
      if (changed >= ENHANCE_MAX_PER_TAP) break;
      if (x === playerTile.x && y === playerTile.y) continue;
      if (npcTiles.some((n) => n.x === x && n.y === y)) continue;
      if (terrainAt(w, x, y) !== 'grass') continue;
      if (!isEmptyTile(w, x, y)) continue;
      const r = tileHash(x, y) % 100;
      const kind: PaletteKind | null = r < 30 ? 'grass' : r < 38 ? 'bush' : r === 38 ? 'tree' : null;
      if (!kind) continue;
      const res = validatePlacement(w, kind, x, y, playerTile, npcTiles);
      if (!res.ok) continue;
      addPlacement(w, res.item);
      entries.push({ kind: 'place', item: res.item });
      changed++;
    }
    if (changed >= ENHANCE_MAX_PER_TAP) break;
  }
  if (entries.length === 0) {
    return { ok: true, changed: 0, skipped, entry: null, message: 'Nothing to enhance here — the ground is already full' };
  }
  return finishGroup(w, entries, 'Enhanced area', 'Enhanced the area (' + changed + ' new plant' + (changed === 1 ? '' : 's') + ')', changed, skipped, preFree, playerTile, npcTiles);
}

// ---- ADJUST spacing ----

/** ADJUST SPACING — move every alignable selected item one tile
 *  away from the selection centre (spread out) or one tile toward
 *  it (pack together). Items already on the centre do not move.
 *  Spread runs outermost first, pack innermost first, so a move
 *  never lands on an item that is about to move away. Scale,
 *  elevation, tree rotation, and vegetation size are NOT adjustable
 *  (see the file header) — spacing and alignment are the ADJUST
 *  actions that exist. */
export function adjustSpacing(
  w: IsoWorld,
  sel: AreaSelection,
  dir: 'spread' | 'pack',
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): LayoutResult {
  const preFree = edgeConnectedTiles(w);
  const { items, skipped } = alignableItems(w, sel);
  if (items.length === 0) {
    return { ok: true, changed: 0, skipped, entry: null, message: 'Nothing here can be spaced' };
  }
  const c = areaCentreTile(sel.rect);
  const moves = items
    .map((it) => {
      const cx = Math.round((it.x0 + it.x1) / 2);
      const cy = Math.round((it.y0 + it.y1) / 2);
      const sx = Math.sign(cx - c.x);
      const sy = Math.sign(cy - c.y);
      return { it, dx: dir === 'spread' ? sx : -sx, dy: dir === 'spread' ? sy : -sy, dist: Math.abs(cx - c.x) + Math.abs(cy - c.y) };
    })
    .filter((m) => m.dx !== 0 || m.dy !== 0)
    .sort((a, b) => (dir === 'spread' ? b.dist - a.dist : a.dist - b.dist))
    .map(({ it, dx, dy }) => ({ it, dx, dy }));
  return runMoves(w, moves, dir === 'spread' ? 'Spread out' : 'Packed together', dir === 'spread' ? 'Spread the area out' : 'Packed the area together', 'item', preFree, playerTile, npcTiles, skipped);
}
