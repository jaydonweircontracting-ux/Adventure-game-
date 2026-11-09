// BUILD 1037 — AREA SELECT (Town Builder Stage 2). Pure module: no
// React, no WebGL. The 3D view owns the UI (the yellow drag
// rectangle, the actions menu); this file owns the selection rules
// and the group operations so they can be asserted standalone.
//
// A selection is a tile rect plus everything compatible inside it:
//  - PLACED items whose WHOLE rect lies inside (the captureChunk
//    rule — a house straddling the edge is left out, never clipped,
//    because a clipped house is not a house). Custom uploads move
//    by rect and rotate their `rot` (BUILD 1048); they duplicate
//    through pasteChunk, which validates them against the live
//    library (a copy whose model is gone is skipped with a reason).
//  - GENERATED huts whose whole rect lies inside.
//  - GENERATED trees/crates, rocks, walls, and dirt path tiles
//    whose tile lies inside.
//  - NOT generated water (terrain, not an object — the ocean cannot
//    move), NOT generated stalls (there is no removedStalls set, so
//    a moved stall would resurrect on reload — the Move tool's 1006
//    rule, kept here). Placed water IS selectable (it is an object
//    the user placed, like a placed tree).
//
// Group operations (all ONE undo step):
//  - MOVE / ROTATE: lift every selected item out first, then place
//    each at its destination under the normal placement rules, so a
//    destination overlapping another selected item's old spot
//    validates against freed tiles (the movePlacement lift rule,
//    applied to the whole group at once — a per-item move in a
//    leading-edge order cannot rotate, and a rotation has no safe
//    order). One trap check for the whole group at the end; a
//    trapping group rolls back entirely via the same applyUndo path
//    as a real undo. Generated rocks/walls have no move machinery,
//    so they convert to placed items at the destination (the
//    moveGenPath pattern: generated → placed), recorded as an
//    unrock/unwall + place pair. A rotated generated hut carries its
//    pre/post faces (the 1037 face/toFace fields), so undo/redo of
//    a rotation restores the right door.
//  - DELETE: exactly the selected items (never everything in the
//    rect — a straddling house is NOT deleted), as one `stroke`
//    entry, the Remove-drag undo shape.
//  - DUPLICATE: convert the selection to chunk items and stamp it
//    at an anchor via pasteChunk (per-item validation, individual
//    skips, one `paste` entry). A custom upload duplicates as itself
//    (BUILD 1048 — assetId + rot ride into the chunk, and paste
//    validates it against the live library). A generated hut
//    duplicates as a placed house of the variant whose footprint
//    matches (4x3 cottage, 3x3 tall, 6x4 shop, 6x5 grand, 5x4
//    smith); 4x4 and 5x5 huts have no variant and are skipped with
//    a reason. The rect is always preserved exactly; the door face
//    is preserved for south/north huts (rot 0/2 keep the footprint),
//    but a west/east hut's door resets to south — the placed-house
//    model ties the door to the rotation, and a 90° rotation would
//    swap the footprint, so the rect wins over the door. A duplicated
//    generated house gets a fresh design from its variant (the
//    generated hut's seed-hash look is not preserved).
//
// Rotation is 90° steps only (the 1036 rule — a 45° house has no
// rect, no door tile, no interior). It rotates around the centre
// tile of the selection rect, so tiles map to tiles exactly.

import { hutAt, terrainAt, terrainKey, type HutRect, type IsoWorld, type PlacedItem } from '../iso/isoWorld';
import { HOUSE_VARIANTS, type HouseVariantId } from './townLook';
import {
  addPlacement, applyUndo, doorForRect, edgeConnectedTiles, hutFace, kindOfVariant,
  moveCrateKind, newlyTrapped, placementsOf, rectEqual, removeGeneratedAt, removeGeneratedRockAt,
  removeGeneratedTreeAt, removeGeneratedWallAt, rotateFace, samePlacement,
  validateBlockingRect, validatePlacement,
  type PaletteKind, type Rotation, type UndoEntry,
} from './placements';
import { pasteChunk, type ChunkItem } from './templates';

export type AreaRect = { x0: number; y0: number; x1: number; y1: number };
export type Face = 'north' | 'south' | 'west' | 'east';

/** Everything an AREA SELECT rectangle holds. Plain data, so the
 *  view can keep it in state and the probe hooks can read it. */
export type AreaSelection = {
  rect: AreaRect;
  placed: PlacedItem[];
  huts: HutRect[];
  trees: Array<{ x: number; y: number; hasTree: boolean; hasCrate: boolean }>;
  rocks: Array<{ x: number; y: number }>;
  walls: Array<{ x: number; y: number; h: boolean }>;
  paths: Array<{ x: number; y: number }>;
  /** Human-readable notes for things inside the rect that were NOT
   *  selected (straddlers, water, stalls). */
  notes: string[];
};

export function normalizeAreaRect(rect: AreaRect): AreaRect {
  return { x0: Math.min(rect.x0, rect.x1), y0: Math.min(rect.y0, rect.y1), x1: Math.max(rect.x0, rect.x1), y1: Math.max(rect.y0, rect.y1) };
}

export function selectionCount(sel: AreaSelection): number {
  return sel.placed.length + sel.huts.length + sel.trees.length + sel.rocks.length + sel.walls.length + sel.paths.length;
}

/** The tile the group rotates around: the centre tile of the
 *  selection rect. An integer point, so a 90° rotation maps tiles
 *  to tiles exactly (no half-tile drift). */
export function areaCentreTile(rect: AreaRect): { x: number; y: number } {
  return { x: Math.round((rect.x0 + rect.x1) / 2), y: Math.round((rect.y0 + rect.y1) / 2) };
}

/** One 90° clockwise tile step around the centre tile (cx, cy):
 *  (x,y) -> (cx - (y - cy), cy + (x - cx)). Applied `steps` times
 *  (negative steps rotate counter-clockwise). */
export function rotateTile(cx: number, cy: number, x: number, y: number, steps: number): { x: number; y: number } {
  let tx = x, ty = y;
  const n = ((steps % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    const nx = cx - (ty - cy);
    const ny = cy + (tx - cx);
    tx = nx; ty = ny;
  }
  return { x: tx, y: ty };
}

/** One 90° clockwise rect step around the centre tile: rotate the
 *  rect's tile set and take its bounding box. w/d swap on odd steps,
 *  exactly like a placed house's footprint. */
export function rotateRect(cx: number, cy: number, rect: AreaRect, steps: number): AreaRect {
  let r = { ...rect };
  const n = ((steps % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    r = { x0: cx + cy - r.y1, y0: cy + r.x0 - cx, x1: cx + cy - r.y0, y1: cy + r.x1 - cx };
  }
  return r;
}

/** Identify every compatible object inside a rect. Multi-tile
 *  items (placed, huts) only when their WHOLE rect is inside;
 *  single-tile items (trees, rocks, walls, paths) when their tile
 *  is inside. Water and stalls are excluded (see the header) and
 *  reported in `notes` when present. */
export function selectArea(w: IsoWorld, rect: AreaRect): AreaSelection {
  const r = normalizeAreaRect(rect);
  const inside = (x0: number, y0: number, x1: number, y1: number) => x0 >= r.x0 && y0 >= r.y0 && x1 <= r.x1 && y1 <= r.y1;
  const placed: PlacedItem[] = [];
  let placedStraddle = 0;
  for (const p of placementsOf(w)) {
    if (inside(p.x0, p.y0, p.x1, p.y1)) placed.push(p);
    else if (p.x1 >= r.x0 && p.x0 <= r.x1 && p.y1 >= r.y0 && p.y0 <= r.y1) placedStraddle++;
  }
  const huts: HutRect[] = [];
  let hutStraddle = 0;
  for (const h of w.huts) {
    if (inside(h.x0, h.y0, h.x1, h.y1)) huts.push(h);
    else if (h.x1 >= r.x0 && h.x0 <= r.x1 && h.y1 >= r.y0 && h.y0 <= r.y1) hutStraddle++;
  }
  const trees: Array<{ x: number; y: number; hasTree: boolean; hasCrate: boolean }> = [];
  const rocks: Array<{ x: number; y: number }> = [];
  const walls: Array<{ x: number; y: number; h: boolean }> = [];
  const paths: Array<{ x: number; y: number }> = [];
  let waterTiles = 0;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const hasTree = w.trees.some((t) => t.tx === x && t.ty === y);
      const hasCrate = w.crates.some((c) => c.tx === x && c.ty === y);
      if (hasTree || hasCrate) trees.push({ x, y, hasTree, hasCrate });
      if (w.rocks.some((rk) => rk.tx === x && rk.ty === y)) rocks.push({ x, y });
      const wl = w.walls.find((v) => v.x === x && v.y === y);
      if (wl) walls.push({ x, y, h: wl.h });
      if (terrainAt(w, x, y) === 'dirt') paths.push({ x, y });
      else if (terrainAt(w, x, y) === 'water') waterTiles++;
    }
  }
  const notes: string[] = [];
  if (placedStraddle > 0) notes.push(placedStraddle + ' placed item' + (placedStraddle === 1 ? '' : 's') + ' straddle' + (placedStraddle === 1 ? 's' : '') + ' the edge — drag a bigger rectangle to include ' + (placedStraddle === 1 ? 'it' : 'them'));
  if (hutStraddle > 0) notes.push(hutStraddle + ' house' + (hutStraddle === 1 ? '' : 's') + ' straddle' + (hutStraddle === 1 ? 's' : '') + ' the edge — drag a bigger rectangle to include ' + (hutStraddle === 1 ? 'it' : 'them'));
  const stallCount = w.stalls.filter((s) => s.x1 >= r.x0 && s.x0 <= r.x1 && s.y0 >= r.y0 && s.y0 <= r.y1).length;
  if (stallCount > 0) notes.push(stallCount + ' market stall' + (stallCount === 1 ? '' : 's') + ' inside — stalls are fixed and cannot be selected');
  if (waterTiles > 0) notes.push('Water cannot be selected (' + waterTiles + ' tile' + (waterTiles === 1 ? '' : 's') + ')');
  return { rect: r, placed, huts, trees, rocks, walls, paths, notes };
}

/** Counts by category, for the actions menu. */
export function selectionCounts(sel: AreaSelection): { houses: number; trees: number; paths: number; rocks: number; walls: number; placed: number } {
  const placedHouses = sel.placed.filter((p) => p.kind === 'house').length;
  const placedOther = sel.placed.length - placedHouses;
  return {
    houses: sel.huts.length + placedHouses,
    trees: sel.trees.length,
    paths: sel.paths.length + sel.placed.filter((p) => p.kind === 'path').length,
    rocks: sel.rocks.length + sel.placed.filter((p) => p.kind === 'rock').length,
    walls: sel.walls.length + sel.placed.filter((p) => p.kind === 'wall').length,
    placed: placedOther,
  };
}

// ---- Individual-object controls (the panel's per-item × buttons
// and the tap-to-toggle) ----

export type SelectionItemRef =
  | { type: 'placed'; item: PlacedItem }
  | { type: 'hut'; rect: HutRect }
  | { type: 'tree'; x: number; y: number }
  | { type: 'rock'; x: number; y: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'path'; x: number; y: number };

/** A short label for one selected item, for the panel list. */
export function selectionItemLabel(ref: SelectionItemRef): string {
  switch (ref.type) {
    case 'placed': {
      const p = ref.item;
      const name = p.kind === 'house'
        ? (p.variant ? (HOUSE_VARIANTS[p.variant]?.label ?? 'House') : 'House')
        : p.kind === 'custom' ? 'Custom model'
        : ({ path: 'Pathway', tree: 'Tree', stall: 'Market Stall', grass: 'Grass', rock: 'Rock', water: 'Water', wall: 'Wall', lantern: 'Lantern', bush: 'Bush', ore: 'Ore Deposit', bridge: 'Wooden Bridge', farm: 'Farm Land', fence: 'Fence' } as Record<string, string>)[p.kind] ?? p.kind;
      return name + ' at (' + p.x0 + ',' + p.y0 + ')';
    }
    case 'hut': return 'House at (' + ref.rect.x0 + ',' + ref.rect.y0 + ')';
    case 'tree': return 'Tree at (' + ref.x + ',' + ref.y + ')';
    case 'rock': return 'Rock at (' + ref.x + ',' + ref.y + ')';
    case 'wall': return 'Wall at (' + ref.x + ',' + ref.y + ')';
    case 'path': return 'Path at (' + ref.x + ',' + ref.y + ')';
  }
}

/** Every selected item as a ref, in a stable order (placed, huts,
 *  trees, rocks, walls, paths) — the panel list iterates this. */
export function selectionItems(sel: AreaSelection): SelectionItemRef[] {
  const out: SelectionItemRef[] = [];
  for (const item of sel.placed) out.push({ type: 'placed', item });
  for (const rect of sel.huts) out.push({ type: 'hut', rect });
  for (const t of sel.trees) out.push({ type: 'tree', x: t.x, y: t.y });
  for (const rk of sel.rocks) out.push({ type: 'rock', x: rk.x, y: rk.y });
  for (const wl of sel.walls) out.push({ type: 'wall', x: wl.x, y: wl.y });
  for (const p of sel.paths) out.push({ type: 'path', x: p.x, y: p.y });
  return out;
}

/** Drop one item from the selection (the panel's × button). The
 *  rect stays — the item is just excluded from the group. Returns
 *  a new selection; an empty selection is still a selection (the
 *  caller clears it when the count hits zero). */
export function excludeItem(sel: AreaSelection, ref: SelectionItemRef): AreaSelection {
  switch (ref.type) {
    case 'placed': return { ...sel, placed: sel.placed.filter((p) => !samePlacement(p, ref.item)) };
    case 'hut': return { ...sel, huts: sel.huts.filter((h) => !rectEqual(h, ref.rect)) };
    case 'tree': return { ...sel, trees: sel.trees.filter((t) => !(t.x === ref.x && t.y === ref.y)) };
    case 'rock': return { ...sel, rocks: sel.rocks.filter((r) => !(r.x === ref.x && r.y === ref.y)) };
    case 'wall': return { ...sel, walls: sel.walls.filter((v) => !(v.x === ref.x && v.y === ref.y)) };
    case 'path': return { ...sel, paths: sel.paths.filter((p) => !(p.x === ref.x && p.y === ref.y)) };
  }
}

/** The selectable object at a tile, if any — the removeAt
 *  precedence (placed > house > tree > rock > wall > path), minus
 *  water (not selectable). Null when the tile holds nothing
 *  selectable. */
export function selectableAt(w: IsoWorld, tx: number, ty: number): SelectionItemRef | null {
  const placed = placementsOf(w).find((p) => tx >= p.x0 && tx <= p.x1 && ty >= p.y0 && ty <= p.y1);
  if (placed) return { type: 'placed', item: placed };
  const hut = hutAt(w, tx, ty);
  if (hut) return { type: 'hut', rect: hut };
  const hasTree = w.trees.some((t) => t.tx === tx && t.ty === ty);
  const hasCrate = w.crates.some((c) => c.tx === tx && c.ty === ty);
  if (hasTree || hasCrate) return { type: 'tree', x: tx, y: ty };
  if (w.rocks.some((r) => r.tx === tx && r.ty === ty)) return { type: 'rock', x: tx, y: ty };
  if (w.walls.some((wl) => wl.x === tx && wl.y === ty)) return { type: 'wall', x: tx, y: ty };
  if (terrainAt(w, tx, ty) === 'dirt') return { type: 'path', x: tx, y: ty };
  return null;
}

/** Tap-to-toggle: add the object at (tx, ty) to the selection when
 *  it is not in it, remove it when it is. Returns the new selection
 *  plus what happened, or null when the tile holds nothing
 *  selectable. The rect never changes — toggling only changes
 *  membership. */
export function toggleSelectionMember(sel: AreaSelection, w: IsoWorld, tx: number, ty: number): { sel: AreaSelection; action: 'added' | 'removed'; label: string } | null {
  const ref = selectableAt(w, tx, ty);
  if (!ref) return null;
  const already = selectionItems(sel).some((it) => {
    if (it.type !== ref.type) return false;
    if (it.type === 'placed' && ref.type === 'placed') return samePlacement(it.item, ref.item);
    if (it.type === 'hut' && ref.type === 'hut') return rectEqual(it.rect, ref.rect);
    return (it as { x: number; y: number }).x === (ref as { x: number; y: number }).x && (it as { x: number; y: number }).y === (ref as { x: number; y: number }).y;
  });
  if (already) return { sel: excludeItem(sel, ref), action: 'removed', label: selectionItemLabel(ref) };
  switch (ref.type) {
    case 'placed': return { sel: { ...sel, placed: [...sel.placed, ref.item] }, action: 'added', label: selectionItemLabel(ref) };
    case 'hut': return { sel: { ...sel, huts: [...sel.huts, ref.rect] }, action: 'added', label: selectionItemLabel(ref) };
    case 'tree': {
      const hasTree = w.trees.some((t) => t.tx === ref.x && t.ty === ref.y);
      const hasCrate = w.crates.some((c) => c.tx === ref.x && c.ty === ref.y);
      return { sel: { ...sel, trees: [...sel.trees, { x: ref.x, y: ref.y, hasTree, hasCrate }] }, action: 'added', label: selectionItemLabel(ref) };
    }
    case 'rock': return { sel: { ...sel, rocks: [...sel.rocks, { x: ref.x, y: ref.y }] }, action: 'added', label: selectionItemLabel(ref) };
    case 'wall': {
      const wl = w.walls.find((v) => v.x === ref.x && v.y === ref.y);
      return { sel: { ...sel, walls: [...sel.walls, { x: ref.x, y: ref.y, h: wl?.h ?? true }] }, action: 'added', label: selectionItemLabel(ref) };
    }
    case 'path': return { sel: { ...sel, paths: [...sel.paths, { x: ref.x, y: ref.y }] }, action: 'added', label: selectionItemLabel(ref) };
  }
}

// ---- Group move / rotate ----

export type GroupOpResult =
  | { ok: true; moved: number; skipped: Array<{ label: string; reason: string }>; entry: UndoEntry | null }
  | { ok: false; reason: string; skipped: Array<{ label: string; reason: string }> };

type PlannedMove =
  | { kind: 'placed'; oldItem: PlacedItem; newItem: PlacedItem; moveKind: PaletteKind; tap: { x: number; y: number }; index: number }
  | { kind: 'custom'; oldItem: PlacedItem; newItem: PlacedItem; index: number }
  | { kind: 'hut'; oldRect: HutRect; newRect: AreaRect; face: Face; newFace: Face; index: number }
  | { kind: 'tree'; x: number; y: number; newX: number; newY: number; hasTree: boolean; hasCrate: boolean; treeIndex: number; crateIndex: number }
  | { kind: 'path'; x: number; y: number; newX: number; newY: number }
  | { kind: 'rock'; x: number; y: number; newX: number; newY: number; rockIndex: number }
  | { kind: 'wall'; x: number; y: number; newX: number; newY: number; h: boolean; newH: boolean; wallIndex: number };

/** The placement tap tile for an item whose destination rect is
 *  known: house = rect centre, stall = west (even rot) / north
 *  (odd rot — the stall runs south from the tap) tile, everything
 *  else = the rect's min tile. The pasteTapTile anchor math. */
function destTapFor(kind: PaletteKind, rect: AreaRect, rot: Rotation): { x: number; y: number } {
  if (kind === 'house' || (kind as string).startsWith('house-')) return { x: Math.round((rect.x0 + rect.x1) / 2), y: Math.round((rect.y0 + rect.y1) / 2) };
  return { x: rect.x0, y: rect.y0 };
}

function isHousePaletteKind(kind: string): boolean {
  return kind === 'house' || kind.startsWith('house-');
}

/** Build the move plan for a translation (dx, dy): every selected
 *  item still in the world, with its destination. Items the world
 *  no longer holds (a stale selection after an undo) are skipped
 *  here, before any mutation. */
function planMove(w: IsoWorld, sel: AreaSelection, dx: number, dy: number): { plan: PlannedMove[]; stale: Array<{ label: string; reason: string }> } {
  const plan: PlannedMove[] = [];
  const stale: Array<{ label: string; reason: string }> = [];
  for (const item of sel.placed) {
    const index = (w.placements ?? []).findIndex((p) => samePlacement(p, item));
    if (index < 0) { stale.push({ label: selectionItemLabel({ type: 'placed', item }), reason: 'no longer here' }); continue; }
    const newItem: PlacedItem = { ...item, x0: item.x0 + dx, y0: item.y0 + dy, x1: item.x1 + dx, y1: item.y1 + dy };
    if (item.kind === 'custom') plan.push({ kind: 'custom', oldItem: item, newItem, index });
    else plan.push({ kind: 'placed', oldItem: item, newItem, moveKind: item.kind === 'house' ? (item.variant ? kindOfVariant(item.variant) : 'house') : item.kind, tap: destTapFor(item.kind, newItem, (item.rot ?? 0) as Rotation), index });
  }
  for (const hut of sel.huts) {
    const index = w.huts.findIndex((h) => rectEqual(h, hut));
    if (index < 0) { stale.push({ label: selectionItemLabel({ type: 'hut', rect: hut }), reason: 'no longer here' }); continue; }
    const face = hutFace(hut);
    plan.push({ kind: 'hut', oldRect: hut, newRect: { x0: hut.x0 + dx, y0: hut.y0 + dy, x1: hut.x1 + dx, y1: hut.y1 + dy }, face, newFace: face, index });
  }
  for (const t of sel.trees) {
    const treeIndex = w.trees.findIndex((v) => v.tx === t.x && v.ty === t.y);
    const crateIndex = w.crates.findIndex((v) => v.tx === t.x && v.ty === t.y);
    if (treeIndex < 0 && crateIndex < 0) { stale.push({ label: selectionItemLabel({ type: 'tree', x: t.x, y: t.y }), reason: 'no longer here' }); continue; }
    plan.push({ kind: 'tree', x: t.x, y: t.y, newX: t.x + dx, newY: t.y + dy, hasTree: treeIndex >= 0, hasCrate: crateIndex >= 0, treeIndex, crateIndex });
  }
  for (const p of sel.paths) {
    if (terrainAt(w, p.x, p.y) !== 'dirt') { stale.push({ label: selectionItemLabel({ type: 'path', x: p.x, y: p.y }), reason: 'no longer here' }); continue; }
    plan.push({ kind: 'path', x: p.x, y: p.y, newX: p.x + dx, newY: p.y + dy });
  }
  for (const rk of sel.rocks) {
    const rockIndex = w.rocks.findIndex((v) => v.tx === rk.x && v.ty === rk.y);
    if (rockIndex < 0) { stale.push({ label: selectionItemLabel({ type: 'rock', x: rk.x, y: rk.y }), reason: 'no longer here' }); continue; }
    plan.push({ kind: 'rock', x: rk.x, y: rk.y, newX: rk.x + dx, newY: rk.y + dy, rockIndex });
  }
  for (const wl of sel.walls) {
    const wallIndex = w.walls.findIndex((v) => v.x === wl.x && v.y === wl.y);
    if (wallIndex < 0) { stale.push({ label: selectionItemLabel({ type: 'wall', x: wl.x, y: wl.y }), reason: 'no longer here' }); continue; }
    plan.push({ kind: 'wall', x: wl.x, y: wl.y, newX: wl.x + dx, newY: wl.y + dy, h: wl.h, newH: wl.h, wallIndex });
  }
  return { plan, stale };
}

/** Build the rotate plan: every selected item still in the world,
 *  rotated `steps` quarter-turns clockwise around the selection's
 *  centre tile. Houses/stalls rotate their `rot` (the door face
 *  turns with the house); generated huts rotate their face; walls
 *  flip orientation on odd steps; 1x1 kinds just change tile. */
function planRotate(w: IsoWorld, sel: AreaSelection, steps: number): { plan: PlannedMove[]; stale: Array<{ label: string; reason: string }> } {
  const c = areaCentreTile(sel.rect);
  const plan: PlannedMove[] = [];
  const stale: Array<{ label: string; reason: string }> = [];
  for (const item of sel.placed) {
    const index = (w.placements ?? []).findIndex((p) => samePlacement(p, item));
    if (index < 0) { stale.push({ label: selectionItemLabel({ type: 'placed', item }), reason: 'no longer here' }); continue; }
    const newRect = rotateRect(c.x, c.y, item, steps);
    const newRot = (((item.rot ?? 0) + steps) % 4) as Rotation;
    // BUILD 1048: a custom upload rotates its mesh (rot advances
    // with the group) as well as its rect — the renderer turns the
    // triangles by rot, so the model turns with the selection.
    const newItem: PlacedItem = { ...item, ...newRect, ...(isHousePaletteKind(item.kind) || item.kind === 'stall' || item.kind === 'custom' ? { rot: newRot } : {}) };
    if (item.kind === 'custom') plan.push({ kind: 'custom', oldItem: item, newItem, index });
    else plan.push({ kind: 'placed', oldItem: item, newItem, moveKind: item.kind === 'house' ? (item.variant ? kindOfVariant(item.variant) : 'house') : item.kind, tap: destTapFor(item.kind, newRect, newRot), index });
  }
  for (const hut of sel.huts) {
    const index = w.huts.findIndex((h) => rectEqual(h, hut));
    if (index < 0) { stale.push({ label: selectionItemLabel({ type: 'hut', rect: hut }), reason: 'no longer here' }); continue; }
    const face = hutFace(hut);
    plan.push({ kind: 'hut', oldRect: hut, newRect: rotateRect(c.x, c.y, hut, steps), face, newFace: rotateFace(face, (((steps % 4) + 4) % 4) as Rotation), index });
  }
  for (const t of sel.trees) {
    const treeIndex = w.trees.findIndex((v) => v.tx === t.x && v.ty === t.y);
    const crateIndex = w.crates.findIndex((v) => v.tx === t.x && v.ty === t.y);
    if (treeIndex < 0 && crateIndex < 0) { stale.push({ label: selectionItemLabel({ type: 'tree', x: t.x, y: t.y }), reason: 'no longer here' }); continue; }
    const d = rotateTile(c.x, c.y, t.x, t.y, steps);
    plan.push({ kind: 'tree', x: t.x, y: t.y, newX: d.x, newY: d.y, hasTree: treeIndex >= 0, hasCrate: crateIndex >= 0, treeIndex, crateIndex });
  }
  for (const p of sel.paths) {
    if (terrainAt(w, p.x, p.y) !== 'dirt') { stale.push({ label: selectionItemLabel({ type: 'path', x: p.x, y: p.y }), reason: 'no longer here' }); continue; }
    const d = rotateTile(c.x, c.y, p.x, p.y, steps);
    plan.push({ kind: 'path', x: p.x, y: p.y, newX: d.x, newY: d.y });
  }
  for (const rk of sel.rocks) {
    const rockIndex = w.rocks.findIndex((v) => v.tx === rk.x && v.ty === rk.y);
    if (rockIndex < 0) { stale.push({ label: selectionItemLabel({ type: 'rock', x: rk.x, y: rk.y }), reason: 'no longer here' }); continue; }
    const d = rotateTile(c.x, c.y, rk.x, rk.y, steps);
    plan.push({ kind: 'rock', x: rk.x, y: rk.y, newX: d.x, newY: d.y, rockIndex });
  }
  for (const wl of sel.walls) {
    const wallIndex = w.walls.findIndex((v) => v.x === wl.x && v.y === wl.y);
    if (wallIndex < 0) { stale.push({ label: selectionItemLabel({ type: 'wall', x: wl.x, y: wl.y }), reason: 'no longer here' }); continue; }
    const d = rotateTile(c.x, c.y, wl.x, wl.y, steps);
    plan.push({ kind: 'wall', x: wl.x, y: wl.y, newX: d.x, newY: d.y, h: wl.h, newH: steps % 2 === 1 ? !wl.h : wl.h, wallIndex });
  }
  return { plan, stale };
}

/** The shared lift-all / place-each engine for moveArea and
 *  rotateArea. Lifts every planned item first (so destinations
 *  overlapping old spots validate against freed tiles), then
 *  validates and places each under the normal rules, restoring the
 *  original on failure. One trap check for the whole group at the
 *  end — a trapping group rolls back entirely. Returns the group
 *  undo entry (or null when nothing moved). */
function applyPlannedMoves(
  w: IsoWorld,
  plan: PlannedMove[],
  stale: Array<{ label: string; reason: string }>,
  label: string,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): GroupOpResult {
  const preFree = edgeConnectedTiles(w);
  // LIFT — by value, so plan-time indices (used for the undo
  // restore spot, not for finding) never matter here.
  for (const p of plan) {
    if (p.kind === 'placed' || p.kind === 'custom') {
      const idx = (w.placements ?? []).findIndex((it) => samePlacement(it, p.oldItem));
      if (idx >= 0) w.placements!.splice(idx, 1);
    } else if (p.kind === 'hut') {
      const idx = w.huts.findIndex((h) => rectEqual(h, p.oldRect));
      if (idx >= 0) w.huts.splice(idx, 1);
    } else if (p.kind === 'tree') {
      if (p.hasTree) { const i = w.trees.findIndex((t) => t.tx === p.x && t.ty === p.y); if (i >= 0) w.trees.splice(i, 1); }
      if (p.hasCrate) { const i = w.crates.findIndex((c) => c.tx === p.x && c.ty === p.y); if (i >= 0) w.crates.splice(i, 1); }
    } else if (p.kind === 'path') {
      const key = terrainKey(p.x, p.y);
      delete w.terrain[key];
      if (!w.removedPaths) w.removedPaths = [];
      if (!w.removedPaths.includes(key)) w.removedPaths.push(key);
    } else if (p.kind === 'rock') {
      const i = w.rocks.findIndex((r) => r.tx === p.x && r.ty === p.y);
      if (i >= 0) w.rocks.splice(i, 1);
    } else if (p.kind === 'wall') {
      const i = w.walls.findIndex((wl) => wl.x === p.x && wl.y === p.y);
      if (i >= 0) w.walls.splice(i, 1);
    }
  }
  // PLACE — each item under the normal rules, against the lifted
  // world. A failure restores the original exactly (same index,
  // same removed-set state) and is reported, never silent.
  const entries: UndoEntry[] = [];
  const skipped: Array<{ label: string; reason: string }> = [...stale];
  let moved = 0;
  for (const p of plan) {
    if (p.kind === 'placed') {
      const res = validatePlacement(w, p.moveKind, p.tap.x, p.tap.y, playerTile, npcTiles, (p.newItem.rot ?? 0) as Rotation);
      if (!res.ok) {
        if (!w.placements) w.placements = [];
        w.placements.splice(Math.min(p.index, w.placements.length), 0, p.oldItem);
        skipped.push({ label: selectionItemLabel({ type: 'placed', item: p.oldItem }), reason: res.reason });
        continue;
      }
      if (res.item.x0 !== p.newItem.x0 || res.item.y0 !== p.newItem.y0 || res.item.x1 !== p.newItem.x1 || res.item.y1 !== p.newItem.y1) {
        if (!w.placements) w.placements = [];
        w.placements.splice(Math.min(p.index, w.placements.length), 0, p.oldItem);
        skipped.push({ label: selectionItemLabel({ type: 'placed', item: p.oldItem }), reason: 'shape mismatch' });
        continue;
      }
      // A moved wall keeps its own orientation (the 1028 rule —
      // validatePlacement would re-orient it to its new neighbours).
      if (p.oldItem.kind === 'wall' && p.oldItem.h !== undefined) res.item.h = p.oldItem.h;
      // BUILD 1041: a moved farm tile keeps its growth clock (the
      // 1041 rule — validatePlacement builds a fresh item with no
      // stamp, so a group move/rotate must not re-plant it).
      if (p.oldItem.kind === 'farm' && p.oldItem.farmPlantedAt !== undefined) res.item.farmPlantedAt = p.oldItem.farmPlantedAt;
      // BUILD 1050: a moved/rotated house keeps its design seed
      // (the 1050 rule — validatePlacement stamps the destination
      // origin, so a group move/rotate must not re-roll the roof it
      // was built with). An old-save house with no seed keeps the
      // origin it was built at (its position before this move).
      if (p.oldItem.kind === 'house') {
        res.item.seedX0 = p.oldItem.seedX0 ?? p.oldItem.x0;
        res.item.seedY0 = p.oldItem.seedY0 ?? p.oldItem.y0;
      }
      if (!w.placements) w.placements = [];
      w.placements.splice(Math.min(p.index, w.placements.length), 0, res.item);
      entries.push({ kind: 'move', oldItem: p.oldItem, newItem: res.item, index: p.index });
      moved++;
    } else if (p.kind === 'custom') {
      const res = validateBlockingRect(w, p.newItem.x0, p.newItem.y0, p.newItem.x1, p.newItem.y1, playerTile, npcTiles);
      if (!res.ok) {
        if (!w.placements) w.placements = [];
        w.placements.splice(Math.min(p.index, w.placements.length), 0, p.oldItem);
        skipped.push({ label: selectionItemLabel({ type: 'placed', item: p.oldItem }), reason: res.reason });
        continue;
      }
      if (!w.placements) w.placements = [];
      w.placements.splice(Math.min(p.index, w.placements.length), 0, p.newItem);
      entries.push({ kind: 'move', oldItem: p.oldItem, newItem: p.newItem, index: p.index });
      moved++;
    } else if (p.kind === 'hut') {
      const check = validateBlockingRect(w, p.newRect.x0, p.newRect.y0, p.newRect.x1, p.newRect.y1, playerTile, npcTiles);
      if (!check.ok) {
        w.huts.splice(Math.min(p.index, w.huts.length), 0, p.oldRect);
        skipped.push({ label: selectionItemLabel({ type: 'hut', rect: p.oldRect }), reason: check.reason });
        continue;
      }
      const door = doorForRect(p.newRect.x0, p.newRect.y0, p.newRect.x1, p.newRect.y1, p.newFace);
      const newHut: HutRect = { ...p.newRect, doorX: door.x, doorY: door.y };
      // The moved record follows the hut (the 1006 rule): `from` is
      // the original layout rect (or the existing record's `from`),
      // `to` is the new rect.
      const existing = w.movedHuts?.find((m) => rectEqual(m.to, p.oldRect));
      const from: HutRect = existing ? { ...existing.from } : { x0: p.oldRect.x0, y0: p.oldRect.y0, x1: p.oldRect.x1, y1: p.oldRect.y1 };
      w.huts.splice(Math.min(p.index, w.huts.length), 0, newHut);
      if (!w.movedHuts) w.movedHuts = [];
      const rec = w.movedHuts.find((m) => rectEqual(m.from, from));
      if (rec) rec.to = { ...newHut };
      else w.movedHuts.push({ from: { ...from }, to: { ...newHut } });
      entries.push({ kind: 'moveGenHouse', from, prevTo: { x0: p.oldRect.x0, y0: p.oldRect.y0, x1: p.oldRect.x1, y1: p.oldRect.y1 }, to: { x0: p.newRect.x0, y0: p.newRect.y0, x1: p.newRect.x1, y1: p.newRect.y1 }, index: p.index, face: p.face, toFace: p.newFace });
      moved++;
    } else if (p.kind === 'tree') {
      const check = validatePlacement(w, 'tree', p.newX, p.newY, playerTile, npcTiles);
      if (!check.ok) {
        if (p.hasTree) w.trees.splice(Math.min(p.treeIndex, w.trees.length), 0, { tx: p.x, ty: p.y });
        if (p.hasCrate) w.crates.splice(Math.min(p.crateIndex, w.crates.length), 0, { tx: p.x, ty: p.y });
        skipped.push({ label: selectionItemLabel({ type: 'tree', x: p.x, y: p.y }), reason: check.reason });
        continue;
      }
      if (p.hasTree) w.trees.splice(Math.min(p.treeIndex, w.trees.length), 0, { tx: p.newX, ty: p.newY });
      if (p.hasCrate) w.crates.splice(Math.min(p.crateIndex, w.crates.length), 0, { tx: p.newX, ty: p.newY });
      // BUILD 1049: a moved prop crate carries its kind with it (the
      // undo of this entry goes through applyUndo's moveGenTree
      // branch, which carries it back).
      if (p.hasCrate) moveCrateKind(w, p.x, p.y, p.newX, p.newY);
      const fromKey = terrainKey(p.x, p.y);
      if (p.hasTree) {
        if (!w.removedTrees) w.removedTrees = [];
        if (!w.removedTrees.includes(fromKey)) w.removedTrees.push(fromKey);
      }
      if (p.hasCrate) {
        if (!w.removedCrates) w.removedCrates = [];
        if (!w.removedCrates.includes(fromKey)) w.removedCrates.push(fromKey);
      }
      entries.push({ kind: 'moveGenTree', fromX: p.x, fromY: p.y, toX: p.newX, toY: p.newY, hasTree: p.hasTree, hasCrate: p.hasCrate, treeIndex: p.treeIndex, crateIndex: p.crateIndex });
      moved++;
    } else if (p.kind === 'path') {
      const check = validatePlacement(w, 'path', p.newX, p.newY, { x: -1, y: -1 }, []);
      if (!check.ok) {
        // Restore the source dirt (the lift deleted it).
        const fromKey = terrainKey(p.x, p.y);
        if (w.removedPaths) w.removedPaths = w.removedPaths.filter((k) => k !== fromKey);
        w.terrain[fromKey] = 'dirt';
        skipped.push({ label: selectionItemLabel({ type: 'path', x: p.x, y: p.y }), reason: check.reason });
        continue;
      }
      addPlacement(w, { kind: 'path', x0: p.newX, y0: p.newY, x1: p.newX, y1: p.newY });
      entries.push({ kind: 'moveGenPath', fromX: p.x, fromY: p.y, toX: p.newX, toY: p.newY });
      moved++;
    } else if (p.kind === 'rock') {
      // No generated-rock move exists — convert to a placed rock at
      // the destination (the moveGenPath pattern), recorded as an
      // unrock + place pair so one undo restores the generated rock.
      const check = validatePlacement(w, 'rock', p.newX, p.newY, playerTile, npcTiles);
      if (!check.ok) {
        w.rocks.splice(Math.min(p.rockIndex, w.rocks.length), 0, { tx: p.x, ty: p.y });
        skipped.push({ label: selectionItemLabel({ type: 'rock', x: p.x, y: p.y }), reason: check.reason });
        continue;
      }
      const fromKey = terrainKey(p.x, p.y);
      if (!w.removedRocks) w.removedRocks = [];
      if (!w.removedRocks.includes(fromKey)) w.removedRocks.push(fromKey);
      const placedRock: PlacedItem = { kind: 'rock', x0: p.newX, y0: p.newY, x1: p.newX, y1: p.newY };
      addPlacement(w, placedRock);
      entries.push({ kind: 'unrock', x: p.x, y: p.y, rockIndex: p.rockIndex });
      entries.push({ kind: 'place', item: placedRock });
      moved++;
    } else {
      // Generated wall — same conversion as a rock, with its
      // orientation (rotated on odd steps).
      const check = validatePlacement(w, 'wall', p.newX, p.newY, playerTile, npcTiles);
      if (!check.ok) {
        w.walls.splice(Math.min(p.wallIndex, w.walls.length), 0, { x: p.x, y: p.y, h: p.h });
        skipped.push({ label: selectionItemLabel({ type: 'wall', x: p.x, y: p.y }), reason: check.reason });
        continue;
      }
      const fromKey = terrainKey(p.x, p.y);
      if (!w.removedWalls) w.removedWalls = [];
      if (!w.removedWalls.includes(fromKey)) w.removedWalls.push(fromKey);
      const placedWall: PlacedItem = { kind: 'wall', x0: p.newX, y0: p.newY, x1: p.newX, y1: p.newY, h: p.newH };
      addPlacement(w, placedWall);
      entries.push({ kind: 'unwall', x: p.x, y: p.y, wallIndex: p.wallIndex, h: p.h });
      entries.push({ kind: 'place', item: placedWall });
      moved++;
    }
  }
  if (entries.length === 0) return { ok: true, moved: 0, skipped, entry: null };
  // ONE trap check for the whole group. A trapping group rolls
  // back entirely (the failures were already restored, so undoing
  // the group entry restores the successes).
  const trapped = newlyTrapped(preFree, w, playerTile, npcTiles);
  if (trapped.player || trapped.npcs) {
    applyUndo(w, { kind: 'group', entries, label });
    return { ok: false, reason: trapped.player ? 'would trap you' : 'would trap a villager', skipped };
  }
  return { ok: true, moved, skipped, entry: { kind: 'group', entries, label } };
}

/** MOVE AREA — move everything selected together by (dx, dy),
 *  preserving relative spacing, rotations, and individual asset
 *  properties. A zero delta is a silent no-op (no mutation, no
 *  history entry). */
export function moveArea(
  w: IsoWorld,
  sel: AreaSelection,
  dx: number,
  dy: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): GroupOpResult {
  if (dx === 0 && dy === 0) return { ok: true, moved: 0, skipped: [], entry: null };
  const { plan, stale } = planMove(w, sel, dx, dy);
  if (plan.length === 0) return { ok: true, moved: 0, skipped: stale, entry: null };
  return applyPlannedMoves(w, plan, stale, 'Moved area', playerTile, npcTiles);
}

/** ROTATE AREA — rotate everything selected together around the
 *  selection centre, `steps` quarter-turns clockwise (1 = 90° CW,
 *  3 = 90° CCW). A multiple of 4 is a silent no-op. */
export function rotateArea(
  w: IsoWorld,
  sel: AreaSelection,
  steps: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): GroupOpResult {
  const n = ((steps % 4) + 4) % 4;
  if (n === 0) return { ok: true, moved: 0, skipped: [], entry: null };
  const { plan, stale } = planRotate(w, sel, n);
  if (plan.length === 0) return { ok: true, moved: 0, skipped: stale, entry: null };
  return applyPlannedMoves(w, plan, stale, 'Rotated area', playerTile, npcTiles);
}

// ---- Delete / duplicate ----

/** DELETE AREA — delete exactly the selected items (never
 *  everything in the rect), as ONE `stroke` undo entry, so one
 *  Undo tap restores the whole group. Returns null entry when
 *  nothing was selected. */
export function deleteArea(w: IsoWorld, sel: AreaSelection): { removed: number; entry: UndoEntry | null } {
  const entries: UndoEntry[] = [];
  for (const item of sel.placed) {
    const index = (w.placements ?? []).findIndex((p) => samePlacement(p, item));
    if (index < 0) continue;
    w.placements!.splice(index, 1);
    entries.push({ kind: 'unplace', item, index });
  }
  for (const hut of sel.huts) {
    const index = w.huts.findIndex((h) => rectEqual(h, hut));
    if (index < 0) continue;
    w.huts.splice(index, 1);
    if (!w.removedHuts) w.removedHuts = [];
    if (!w.removedHuts.some((r) => rectEqual(r, hut))) w.removedHuts.push({ x0: hut.x0, y0: hut.y0, x1: hut.x1, y1: hut.y1 });
    entries.push({ kind: 'unhouse', rect: hut, index });
  }
  for (const t of sel.trees) {
    const res = removeGeneratedTreeAt(w, t.x, t.y);
    if (!res) continue;
    entries.push({ kind: 'untree', tree: res.tree, treeIndex: res.treeIndex, crate: res.crate, crateIndex: res.crateIndex });
  }
  for (const rk of sel.rocks) {
    const res = removeGeneratedRockAt(w, rk.x, rk.y);
    if (!res) continue;
    entries.push({ kind: 'unrock', x: res.x, y: res.y, rockIndex: res.rockIndex });
  }
  for (const wl of sel.walls) {
    const res = removeGeneratedWallAt(w, wl.x, wl.y);
    if (!res) continue;
    entries.push({ kind: 'unwall', x: res.x, y: res.y, wallIndex: res.wallIndex, h: res.h });
  }
  for (const p of sel.paths) {
    const res = removeGeneratedAt(w, p.x, p.y);
    if (!res || res.kind !== 'path') continue;
    entries.push({ kind: 'unpath', x: p.x, y: p.y });
  }
  if (entries.length === 0) return { removed: 0, entry: null };
  return { removed: entries.length, entry: { kind: 'stroke', entries } };
}

/** The placed-house variant a generated hut duplicates as, by its
 *  footprint. 4x4 and 5x5 huts have no variant and are skipped.
 *  6x5 is 'grand' (residential, not the commercial inn); 5x4 is
 *  'smith' (a closed building, not the open-colonnade store). */
const HUT_VARIANT_BY_SIZE: Record<string, HouseVariantId> = {
  '4x3': 'cottage', '3x3': 'tall', '6x4': 'shop', '6x5': 'grand', '5x4': 'smith',
};

export function hutDuplicateVariant(hut: HutRect): HouseVariantId | null {
  const key = (hut.x1 - hut.x0 + 1) + 'x' + (hut.y1 - hut.y0 + 1);
  const v = HUT_VARIANT_BY_SIZE[key];
  if (!v) return null;
  // Belt-and-braces: the variant's measured footprint must be the
  // hut's footprint, or the paste shape guard would reject it.
  const fv = HOUSE_VARIANTS[v];
  return fv.w === hut.x1 - hut.x0 + 1 && fv.d === hut.y1 - hut.y0 + 1 ? v : null;
}

/** DUPLICATE AREA — stamp the selection at an anchor tile (the
 *  selection rect's min corner lands on the anchor), via pasteChunk
 *  (per-item validation, individual skips, one `paste` entry).
 *  Generated items become placed items at the destination; the
 *  originals stay put. BUILD 1048: custom uploads duplicate through
 *  the same path (pasteChunk validates them against the live
 *  library — `customAssets` — and skips a copy whose model is gone
 *  with a reason). Huts with no matching variant are skipped with
 *  a reason (reported, never silent). Skips carry a human-readable
 *  label, not a chunk item — a generated hut with no variant IS not
 *  a chunk item. */
export function duplicateArea(
  w: IsoWorld,
  sel: AreaSelection,
  anchor: { x: number; y: number },
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
  customAssets?: Array<{ id: string; width: number; height: number }>,
): { landed: PlacedItem[]; skipped: Array<{ label: string; reason: string }>; entry: UndoEntry | null } {
  const x0 = sel.rect.x0, y0 = sel.rect.y0;
  const items: ChunkItem[] = [];
  const skipped: Array<{ label: string; reason: string }> = [];
  for (const p of sel.placed) {
    if (p.kind === 'custom') {
      // BUILD 1048: a custom copy carries its assetId (+ rot) into
      // the chunk; pasteChunk validates it against the library.
      if (!p.assetId) {
        skipped.push({ label: selectionItemLabel({ type: 'placed', item: p }), reason: 'that model has no asset id' });
        continue;
      }
      items.push({ kind: 'custom', rx0: p.x0 - x0, ry0: p.y0 - y0, rx1: p.x1 - x0, ry1: p.y1 - y0, ...(p.rot !== undefined ? { rot: p.rot } : {}), assetId: p.assetId });
      continue;
    }
    const kind: PaletteKind = p.kind === 'house' ? (p.variant ? kindOfVariant(p.variant) : 'house') : p.kind;
    items.push({ kind, rx0: p.x0 - x0, ry0: p.y0 - y0, rx1: p.x1 - x0, ry1: p.y1 - y0, ...(p.rot !== undefined && (p.kind === 'house' || p.kind === 'stall') ? { rot: p.rot } : {}) });
  }
  for (const hut of sel.huts) {
    const v = hutDuplicateVariant(hut);
    if (!v) {
      skipped.push({ label: selectionItemLabel({ type: 'hut', rect: hut }), reason: 'no matching house design for a ' + (hut.x1 - hut.x0 + 1) + '×' + (hut.y1 - hut.y0 + 1) + ' house' });
      continue;
    }
    // The rect is preserved exactly; the door face is preserved for
    // south/north huts (rot 0/2 keep the footprint). A west/east
    // hut's door resets to south — a 90° rotation would swap the
    // footprint, so the rect wins over the door (see the header).
    const face = hutFace(hut);
    const rot: Rotation = face === 'north' ? 2 : 0;
    items.push({ kind: kindOfVariant(v), rx0: hut.x0 - x0, ry0: hut.y0 - y0, rx1: hut.x1 - x0, ry1: hut.y1 - y0, ...(rot !== 0 ? { rot } : {}) });
  }
  for (const t of sel.trees) items.push({ kind: 'tree', rx0: t.x - x0, ry0: t.y - y0, rx1: t.x - x0, ry1: t.y - y0 });
  for (const rk of sel.rocks) items.push({ kind: 'rock', rx0: rk.x - x0, ry0: rk.y - y0, rx1: rk.x - x0, ry1: rk.y - y0 });
  for (const wl of sel.walls) items.push({ kind: 'wall', rx0: wl.x - x0, ry0: wl.y - y0, rx1: wl.x - x0, ry1: wl.y - y0 });
  for (const p of sel.paths) items.push({ kind: 'path', rx0: p.x - x0, ry0: p.y - y0, rx1: p.x - x0, ry1: p.y - y0 });
  const res = pasteChunk(w, { name: 'Area copy', items }, anchor, playerTile, npcTiles, customAssets);
  const pasteSkips = res.skipped.map((s) => ({ label: s.item.kind + ' at +' + s.item.rx0 + ',+' + s.item.ry0, reason: s.reason }));
  return { landed: res.landed, skipped: [...skipped, ...pasteSkips], entry: res.landed.length ? { kind: 'paste', items: res.landed } : null };
}
