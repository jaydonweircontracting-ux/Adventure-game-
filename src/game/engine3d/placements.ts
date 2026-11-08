// BUILD 984 — player placement rules for the 3D mode Build tool.
// Pure module: no React, no WebGL. The 3D view owns the UI; this file
// owns the rules so they can be asserted standalone.
//
// BUILD 1036 — placement rotation. A placed house/stall carries
// `rot` (quarter-turns clockwise from the default: 0 = house door
// faces south, stall runs east). The stored rect is the footprint
// AFTER rotation, so the door face derives from rot + rect
// (placedHutRects + doorForRect) and every consumer — rendering,
// Enter/Exit, interiors, walkability, undo/redo, move, chunk capture
// — reads the rotated door without knowing rot exists. 90° steps
// only: the whole model is axis-aligned tile rects, so 45°/15°/free
// rotation cannot exist for houses (a 45° house has no rect, no door
// tile, no interior). 1x1 kinds ignore rot entirely.
//
// Placed items live in IsoWorld.placements (see isoWorld.ts). They are
// deliberately NOT folded into world.huts/stalls/trees: the 3D adapter
// rebuilds generated lots near town on every load and would delete
// near-center placed work if it shared those arrays.
// Cost: FREE in V1. No Wood/Stone gate — the player's counters read 0,
// so a gate would let him place nothing (future economy decision).

import { hutAt, isWalkableWorld, terrainAt, terrainKey, type HutRect, type IsoWorld, type MovedHut, type PlacedItem } from '../iso/isoWorld';
import { HOUSE_VARIANTS, type HouseVariantId } from './townLook';

export type PaletteKind = 'path' | 'house' | 'tree' | 'stall' | 'grass' | 'rock' | 'water' | 'wall'
  | 'house-cottage' | 'house-tall' | 'house-shop' | 'house-grand'
  | 'house-inn' | 'house-smith' | 'house-store' | 'house-windmill';
/** The placeable house variants (BUILD 1012: four; BUILD 1015: the
 *  three commercial buildings join them; BUILD 1038: the windmill).
 *  'house' itself is NOT in this list: it is the legacy placed kind
 *  (old saves, and anything placed before variants existed) — it
 *  validates and renders exactly as it always did, but the palette
 *  no longer offers it. */
export const HOUSE_VARIANT_KINDS: PaletteKind[] = ['house-cottage', 'house-tall', 'house-shop', 'house-grand', 'house-inn', 'house-smith', 'house-store', 'house-windmill'];
export function isHouseVariantKind(kind: PaletteKind): kind is 'house-cottage' | 'house-tall' | 'house-shop' | 'house-grand' | 'house-inn' | 'house-smith' | 'house-store' | 'house-windmill' {
  return (HOUSE_VARIANT_KINDS as string[]).includes(kind);
}
/** True for the legacy 'house' kind and every variant kind. */
export function isHouseKind(kind: PaletteKind): kind is 'house' | 'house-cottage' | 'house-tall' | 'house-shop' | 'house-grand' | 'house-inn' | 'house-smith' | 'house-store' | 'house-windmill' {
  return kind === 'house' || isHouseVariantKind(kind);
}
export function variantOfKind(kind: PaletteKind): HouseVariantId | null {
  switch (kind) {
    case 'house-cottage': return 'cottage';
    case 'house-tall': return 'tall';
    case 'house-shop': return 'shop';
    case 'house-grand': return 'grand';
    case 'house-inn': return 'inn';
    case 'house-smith': return 'smith';
    case 'house-store': return 'store';
    case 'house-windmill': return 'windmill';
    default: return null;
  }
}
export function kindOfVariant(variant: HouseVariantId): PaletteKind {
  return ('house-' + variant) as PaletteKind;
}
/** The palette kind a placed house validates/moves/pastes under:
 *  its variant kind, or legacy 'house' when it has no variant. */
export function housePlacementKind(item: PlacedItem): PaletteKind {
  return item.variant ? kindOfVariant(item.variant) : 'house';
}
/** BUILD 1036: placement rotation in quarter-turns clockwise from
 *  the default (0 = house door faces south, stall runs east). */
export type Rotation = 0 | 1 | 2 | 3;

/** Rotate a door face by `rot` quarter-turns clockwise (viewed from
 *  above, north up): north → east → south → west → north. */
export function rotateFace(face: 'north' | 'south' | 'west' | 'east', rot: Rotation): 'north' | 'south' | 'west' | 'east' {
  const order: Array<'north' | 'east' | 'south' | 'west'> = ['north', 'east', 'south', 'west'];
  return order[(order.indexOf(face as 'north' | 'east' | 'south' | 'west') + rot) % 4];
}

/** Footprint (w x d in tiles) a house kind places: the variant's
 *  measured town footprint, or the legacy 3x3 for bare 'house'.
 *  BUILD 1036: an odd rotation swaps w/d — the rect rotates with
 *  the house, so a 4x3 cottage placed at 90° is a 3x4 rect whose
 *  door faces west instead of south. */
export function houseFootprint(kind: PaletteKind, rot: Rotation = 0): { w: number; d: number } {
  const v = variantOfKind(kind);
  const base = v ? { w: HOUSE_VARIANTS[v].w, d: HOUSE_VARIANTS[v].d } : { w: 3, d: 3 };
  return rot % 2 === 1 ? { w: base.d, d: base.w } : base;
}
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

/** BUILD 1036: identity for placed items — kind + rect + rotation.
 *  Two items can never share a rect (placement validation forbids
 *  overlap), but undo/move must match the EXACT item: a rotated
 *  house moved back must not match an unrotated item on the same
 *  rect, and vice versa. */
export function samePlacement(a: PlacedItem, b: PlacedItem): boolean {
  return a.kind === b.kind && a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1 && (a.rot ?? 0) === (b.rot ?? 0);
}

/** Remove the placed item exactly equal to `item` (kind + rect),
 *  if present. BUILD 989: undo of a placement. Returns true when
 *  removed. */
export function removeExactPlacement(w: IsoWorld, item: PlacedItem): boolean {
  const list = w.placements;
  if (!list) return false;
  const idx = list.findIndex((p) => samePlacement(p, item));
  if (idx < 0) return false;
  list.splice(idx, 1);
  return true;
}

/** BUILD 987: remove a GENERATED thing at (x, y) — a whole hut rect or
 *  one dirt path tile. Placed items are NOT handled here (the caller
 *  tries removePlacementAt first); precedence is placed > house > tree > rock > water > wall > path (see removeAt),
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

/** BUILD 1025: remove a GENERATED rock at (x, y). The mutation is
 *  exactly E-key mining's (1015): the rock leaves world.rocks and its
 *  terrain key joins removedRocks, so a mined rock and a removed rock
 *  are the same state — the adapter's stampExtraRocks skips the key
 *  and the saved rocks array no longer holds it, so it stays gone
 *  across reloads, and E-key on the same tile afterwards finds
 *  nothing (and vice versa: an E-key-mined rock is already absent
 *  here, so Remove finds nothing to do). This is deletion, NOT
 *  harvest: no stone is granted here — E-key remains the harvest
 *  path. Returns what was removed, or null when the tile holds no
 *  rock. */
export function removeGeneratedRockAt(w: IsoWorld, x: number, y: number): { x: number; y: number; rockIndex: number } | null {
  const rockIndex = w.rocks.findIndex((r) => r.tx === x && r.ty === y);
  if (rockIndex < 0) return null;
  w.rocks.splice(rockIndex, 1);
  const key = terrainKey(x, y);
  if (!w.removedRocks) w.removedRocks = [];
  if (!w.removedRocks.includes(key)) w.removedRocks.push(key);
  return { x, y, rockIndex };
}

/** BUILD 1027: remove GENERATED water at (x, y) — an ocean tile or
 *  the authored pond. The mutation is the water twin of
 *  removeGeneratedRockAt: the tile's terrain key joins removedWater,
 *  so it stays gone across reloads (terrainAt consults removedWater
 *  first, so neither the pure ocean function nor a re-stamped stored
 *  entry can resurrect it), and a stored pond entry is deleted too
 *  (the adapter never re-stamps water, but the delete keeps the saved
 *  world honest). This is deletion, NOT harvest: no fish or loot is
 *  granted here — there is no fishing mechanic to grant from (the
 *  2.5D game has none either; see the 1027 audit). Returns what was
 *  removed plus whether the tile held stored water (the pond) or was
 *  pure-function ocean — undo needs the distinction to restore the
 *  stored entry. Null when the tile holds no generated water. */
export function removeGeneratedWaterAt(w: IsoWorld, x: number, y: number): { x: number; y: number; wasStored: boolean } | null {
  // In-map only: the out-of-map ocean is the infinite sea, not a
  // removable tile (the Remove tool bounds its snap to the map, so
  // this is belt-and-braces — and it keeps removeAt returning null
  // out-of-map, like rocks and paths).
  if (x < 0 || y < 0 || x >= w.w || y >= w.h) return null;
  if (terrainAt(w, x, y) !== 'water') return null;
  const key = terrainKey(x, y);
  const wasStored = w.terrain[key] === 'water';
  if (wasStored) delete w.terrain[key];
  if (!w.removedWater) w.removedWater = [];
  if (!w.removedWater.includes(key)) w.removedWater.push(key);
  return { x, y, wasStored };
}

/** BUILD 1028: remove a GENERATED wall tile at (x, y) — one tile
 *  of the town boundary wall (or any wall in w.walls), never the
 *  whole run: the unit is the TILE, consistent with rock/water
 *  (a one-tile run is the same either way). The tile leaves
 *  w.walls and its terrain key joins removedWalls, so it stays gone
 *  across reloads — the adapter copies source walls verbatim on
 *  every load and consults removedWalls, so either half alone would
 *  be fragile (the 528/529 save-load lesson: the tile AND the set
 *  must agree). This is deletion, NOT harvest: no stone is granted
 *  here — E-key remains the harvest path (and E-key never mined
 *  walls). The tile's h rides along so undo restores its exact
 *  orientation. Null when the tile holds no generated wall. */
export function removeGeneratedWallAt(w: IsoWorld, x: number, y: number): { x: number; y: number; wallIndex: number; h: boolean } | null {
  const wallIndex = w.walls.findIndex((wl) => wl.x === x && wl.y === y);
  if (wallIndex < 0) return null;
  const [tile] = w.walls.splice(wallIndex, 1);
  const key = terrainKey(x, y);
  if (!w.removedWalls) w.removedWalls = [];
  if (!w.removedWalls.includes(key)) w.removedWalls.push(key);
  return { x, y, wallIndex, h: tile.h };
}
/** BUILD 989 refinement: what removeAt WOULD remove at (x, y), without
 *  mutating anything — the snap/paint/preview probe. Returns the kind
 *  only; the view calls removeAt on the snapped tile to do the work,
 *  so probe and action can never disagree about precedence. */
export type RemovableKind = 'placed' | 'house' | 'tree' | 'rock' | 'water' | 'wall' | 'path';

export function peekRemovableAt(w: IsoWorld, x: number, y: number): RemovableKind | null {
  if (w.placements && w.placements.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1)) return 'placed';
  if (hutAt(w, x, y)) return 'house';
  if (w.trees.some((t) => t.tx === x && t.ty === y) || w.crates.some((c) => c.tx === x && c.ty === y)) return 'tree';
  if (w.rocks.some((r) => r.tx === x && r.ty === y)) return 'rock';
  // BUILD 1027: generated water (ocean or pond) is a removable
  // fixture of the world — a water tile the player did not place.
  // Water yields to nothing below it, so it sits between rock and
  // path: house > tree > rock > water > path.
  if (terrainAt(w, x, y) === 'water') return 'water';
  // BUILD 1028: a generated wall tile is a removable fixture too.
  // Walls never sit on dirt, so the wall-before-path step is
  // unreachable in practice but explicit, like water's.
  if (w.walls.some((wl) => wl.x === x && wl.y === y)) return 'wall';
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
 *  removeAt order (placed > house > tree > rock > water > wall > path), via
 *  peekRemovableAt.
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
 *  generated rock (BUILD 1025) > generated water (BUILD 1027 — ocean
 *  or pond) > generated wall tile (BUILD 1028) > generated path
 *  (dirt tile). A tree
 *  standing on dirt therefore takes two taps (tree, then path),
 *  mirroring 987's hut-over-dirt two-tap.
 *  Generated stalls are NOT removed here (not asked): a stall tile
 *  with no tree/crate/house falls through to the path step, which
 *  preserves 987's edge (dirt under a stall is removed, the stall
 *  stands on grass). BUILD 1025: a tile holding both a tree and a
 *  rock removes the tree first (they look different, so separate taps
 *  are correct, unlike tree+crate which remove together); rocks never
 *  sit on dirt, so the rock-before-path step is unreachable in
 *  practice but explicit. BUILD 1027: water never sits on dirt
 *  either, so the water-before-path step is likewise unreachable in
 *  practice but explicit. BUILD 1028: walls never sit on dirt
 *  either, so the wall-before-path step is likewise unreachable in
 *  practice but explicit. */
export type RemoveAtResult =
  | { kind: 'placed'; item: PlacedItem; index: number }
  | { kind: 'house'; rect: HutRect; index: number }
  | { kind: 'tree'; tree: { tx: number; ty: number } | null; treeIndex: number; crate: { tx: number; ty: number } | null; crateIndex: number }
  | { kind: 'rock'; x: number; y: number; rockIndex: number }
  | { kind: 'water'; x: number; y: number; wasStored: boolean }
  | { kind: 'wall'; x: number; y: number; wallIndex: number; h: boolean }
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
  const rk = removeGeneratedRockAt(w, x, y);
  if (rk) return { kind: 'rock', x: rk.x, y: rk.y, rockIndex: rk.rockIndex };
  // BUILD 1027: generated water — the ocean or the pond. The
  // wasStored flag (stored pond vs pure-function ocean) rides along
  // so undo can restore the stored pond entry exactly.
  const wt = removeGeneratedWaterAt(w, x, y);
  if (wt) return { kind: 'water', x: wt.x, y: wt.y, wasStored: wt.wasStored };
  // BUILD 1028: a generated wall tile. The h rides along so undo
  // restores the tile's exact orientation.
  const wl = removeGeneratedWallAt(w, x, y);
  if (wl) return { kind: 'wall', x: wl.x, y: wl.y, wallIndex: wl.wallIndex, h: wl.h };
  const gen = removeGeneratedAt(w, x, y);
  if (gen && gen.kind === 'path') return { kind: 'path', x, y };
  return null;
}

/** BUILD 989: undo entries. One entry per Build-panel change (a whole
 *  stroke = one `stroke` entry). `place` = a placement to delete;
 *  `unplace` = a placed item to restore at its exact index;
 *  `unhouse`/`unpath`/`untree` = a generated removal to reverse
 *  (removed-set entry dropped, content restored). BUILD 1027:
 *  `unwater` = a generated water removal to reverse (removedWater
 *  entry dropped; a stored pond entry restored too). BUILD 1028:
 *  `unwall` = a generated wall removal to reverse (removedWalls
 *  entry dropped; the tile re-inserted at its exact index with its
 *  h). BUILD 995:
 *  a placed item moved from oldItem to newItem (index = its list
 *  position, so undo/redo restore the exact order). BUILD 991: entries
 *  are the unit of the undo AND redo stacks (see BuildHistory below)
 *  — the same entry undoes via applyUndo and redoes via applyRedo.
 *  Movement, E-key harvest, and tool selection changes are NOT
 *  changes and never enter the stacks. BUILD 996: `paste` = a whole
 *  chunk paste (one entry for every item that landed, in paste
 *  order). Undo removes them in reverse order; redo re-appends them
 *  in paste order, which preserves path-before-grass stacking.
 *  Skipped items are never in the entry, so undo/redo touch exactly
 *  what the paste added — nothing more, nothing less. BUILD 1006:
 *  `moveGenHouse`/`moveGenPath`/`moveGenTree` = one generated-item move
 *  each (see moveGeneratedHut/moveGeneratedPath/moveGeneratedTree).
 *  moveGenHouse stores BARE prevTo/to rects (doors are always recomputed
 *  from the facing derived from `from`'s door, so undo/redo can never
 *  disagree with the adapter about a door); `from` carries its door.
 *  BUILD 1037: a ROTATED hut also carries `face` (pre-rotation) and
 *  `toFace` (post-rotation) — a plain move leaves both absent, and the
 *  `from` door is the face. Without them, undo/redo of a rotation
 *  would restore the rect with the original face, not the face the
 *  hut had before/after this rotation. */
export type UndoEntry =
  | { kind: 'place'; item: PlacedItem }
  | { kind: 'unplace'; item: PlacedItem; index: number }
  | { kind: 'unhouse'; rect: HutRect; index: number }
  | { kind: 'unpath'; x: number; y: number }
  | { kind: 'untree'; tree: { tx: number; ty: number } | null; treeIndex: number; crate: { tx: number; ty: number } | null; crateIndex: number }
  | { kind: 'unrock'; x: number; y: number; rockIndex: number }
  | { kind: 'unwater'; x: number; y: number; wasStored: boolean }
  | { kind: 'unwall'; x: number; y: number; wallIndex: number; h: boolean }
  | { kind: 'stroke'; entries: UndoEntry[] }
  | { kind: 'move'; oldItem: PlacedItem; newItem: PlacedItem; index: number }
  | { kind: 'paste'; items: PlacedItem[] }
  | { kind: 'moveGenHouse'; from: HutRect; prevTo: HutRect; to: HutRect; index: number; face?: 'north' | 'south' | 'west' | 'east'; toFace?: 'north' | 'south' | 'west' | 'east' }
  | { kind: 'moveGenPath'; fromX: number; fromY: number; toX: number; toY: number }
  | { kind: 'moveGenTree'; fromX: number; fromY: number; toX: number; toY: number; hasTree: boolean; hasCrate: boolean; treeIndex: number; crateIndex: number }
  /** BUILD 1037: `group` = a whole AREA SELECT operation (move /
   *  rotate of many items, of mixed kinds) as ONE undo step — the
   *  generalisation of `stroke` for group moves/rotates. Sub-entries
   *  apply in reverse on undo, forward on redo, exactly like a
   *  stroke. `label` is the user-facing name ('Moved area',
   *  'Rotated area'). */
  | { kind: 'group'; entries: UndoEntry[]; label: string };

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
    } else if (res.kind === 'rock') {
      entries.push({ kind: 'unrock', x: res.x, y: res.y, rockIndex: res.rockIndex });
    } else if (res.kind === 'water') {
      entries.push({ kind: 'unwater', x: res.x, y: res.y, wasStored: res.wasStored });
    } else if (res.kind === 'wall') {
      entries.push({ kind: 'unwall', x: res.x, y: res.y, wallIndex: res.wallIndex, h: res.h });
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
    case 'group': {
      // BUILD 1037: a whole AREA SELECT operation as one undo step.
      // The `move` sub-entries undo in TWO phases — remove every new
      // position first, then restore every old position. A rotation
      // can map one item's destination onto another item's source (a
      // cycle: A's new rect == D's old rect). Undoing one entry at a
      // time would let the rect-based removal eat the other entry's
      // just-restored item, and the `exists` guard would then skip
      // the restore — silently losing an item (found by the 1037
      // probe: a rotation undone lost a path). Removing every new
      // position first (like the forward lift-all) makes the
      // restores collision-free. The restores go in ASCENDING
      // recorded-index order, which rebuilds the original list order
      // exactly (each insert lands at its final index because every
      // item that belongs before it is already in place). The other
      // kinds (huts, trees, paths, rocks, walls) live in separate
      // collections, so they undo in reverse order around the two
      // phases.
      const moves = entry.entries.filter((e) => e.kind === 'move');
      for (let i = entry.entries.length - 1; i >= 0; i--) {
        if (entry.entries[i].kind !== 'move') applyUndo(w, entry.entries[i]);
      }
      for (const m of moves) removeExactPlacement(w, m.newItem);
      const byIndex = [...moves].sort((a, b) => a.index - b.index);
      for (const m of byIndex) {
        if (!w.placements) w.placements = [];
        const old = m.oldItem;
        const exists = w.placements.some((p) => p.kind === old.kind && p.x0 === old.x0 && p.y0 === old.y0 && p.x1 === old.x1 && p.y1 === old.y1);
        if (!exists) w.placements.splice(Math.min(m.index, w.placements.length), 0, old);
      }
      return 'Undid ' + entry.label;
    }
    case 'place': {
      removeExactPlacement(w, entry.item);
      return 'Undid placed ' + entry.item.kind;
    }
    case 'unplace': {
      if (!w.placements) w.placements = [];
      const item = entry.item;
      const exists = w.placements.some((p) => samePlacement(p, item));
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
    case 'unrock': {
      const key = terrainKey(entry.x, entry.y);
      if (w.removedRocks) w.removedRocks = w.removedRocks.filter((k) => k !== key);
      if (!w.rocks.some((r) => r.tx === entry.x && r.ty === entry.y)) {
        w.rocks.splice(Math.min(entry.rockIndex, w.rocks.length), 0, { tx: entry.x, ty: entry.y });
      }
      return 'Restored rock';
    }
    case 'unwater': {
      // Drop the removed entry so terrainAt reports water again; a
      // stored pond tile also gets its stored entry back (the ocean
      // is pure-function, so dropping the entry is enough there).
      const key = terrainKey(entry.x, entry.y);
      if (w.removedWater) w.removedWater = w.removedWater.filter((k) => k !== key);
      if (entry.wasStored) w.terrain[key] = 'water';
      return 'Restored water';
    }
    case 'unwall': {
      // Drop the removed entry so the adapter stops skipping the
      // tile, and re-insert the tile at its exact index with its
      // orientation (idempotent — a tile already present is skipped,
      // so a stale entry cannot duplicate it).
      const key = terrainKey(entry.x, entry.y);
      if (w.removedWalls) w.removedWalls = w.removedWalls.filter((k) => k !== key);
      if (!w.walls.some((wl) => wl.x === entry.x && wl.y === entry.y)) {
        w.walls.splice(Math.min(entry.wallIndex, w.walls.length), 0, { x: entry.x, y: entry.y, h: entry.h });
      }
      return 'Restored wall';
    }
    case 'move': {
      removeExactPlacement(w, entry.newItem);
      if (!w.placements) w.placements = [];
      const old = entry.oldItem;
      const exists = w.placements.some((p) => p.kind === old.kind && p.x0 === old.x0 && p.y0 === old.y0 && p.x1 === old.x1 && p.y1 === old.y1);
      if (!exists) w.placements.splice(Math.min(entry.index, w.placements.length), 0, old);
      return 'Moved ' + old.kind + ' back';
    }
    case 'moveGenHouse': {
      // Doors recompute from the facing derived from `from`'s door, so
      // the restored hut's door always agrees with the adapter's
      // formula. A first move (prevTo == from) drops the moved record;
      // a chained move rewinds the record's `to` to prevTo.
      // BUILD 1037: a rotated hut carries its pre-rotation face in
      // `face` (a plain move leaves it absent, and the `from` door
      // is the pre-move face — same value). Without it, undoing a
      // rotation would restore the rect with the ORIGINAL face, not
      // the face the hut had before this rotation.
      const face = entry.face ?? hutFace(entry.from);
      const prevDoor = doorForRect(entry.prevTo.x0, entry.prevTo.y0, entry.prevTo.x1, entry.prevTo.y1, face);
      w.huts = w.huts.filter((h) => !rectEqual(h, entry.to));
      const prevHut: HutRect = { ...entry.prevTo, doorX: prevDoor.x, doorY: prevDoor.y };
      if (!w.huts.some((h) => rectEqual(h, entry.prevTo))) {
        w.huts.splice(Math.min(entry.index, w.huts.length), 0, prevHut);
      }
      if (rectEqual(entry.prevTo, entry.from)) {
        // First-move undo drops the record; when no record array exists
        // (a refused first move rolling back) nothing is created.
        if (w.movedHuts) w.movedHuts = w.movedHuts.filter((m) => !rectEqual(m.from, entry.from));
      } else {
        const rec = (w.movedHuts ?? []).find((m) => rectEqual(m.from, entry.from));
        if (rec) rec.to = { ...prevHut };
        else {
          if (!w.movedHuts) w.movedHuts = [];
          w.movedHuts.push({ from: { ...entry.from }, to: { ...prevHut } });
        }
      }
      return 'Moved house back';
    }
    case 'moveGenPath': {
      // The moved path is a literal placed path at the destination; undo
      // deletes it and restores the original dirt (dropping its removed
      // entry so the adapter re-stamps it on reload).
      removeExactPlacement(w, { kind: 'path', x0: entry.toX, y0: entry.toY, x1: entry.toX, y1: entry.toY });
      const fromKey = terrainKey(entry.fromX, entry.fromY);
      if (w.removedPaths) w.removedPaths = w.removedPaths.filter((k) => k !== fromKey);
      w.terrain[fromKey] = 'dirt';
      return 'Moved path back';
    }
    case 'moveGenTree': {
      const fromKey = terrainKey(entry.fromX, entry.fromY);
      if (entry.hasTree) {
        w.trees = w.trees.filter((t) => !(t.tx === entry.toX && t.ty === entry.toY));
        if (!w.trees.some((t) => t.tx === entry.fromX && t.ty === entry.fromY)) {
          w.trees.splice(Math.min(entry.treeIndex, w.trees.length), 0, { tx: entry.fromX, ty: entry.fromY });
        }
        if (w.removedTrees) w.removedTrees = w.removedTrees.filter((k) => k !== fromKey);
      }
      if (entry.hasCrate) {
        w.crates = w.crates.filter((c) => !(c.tx === entry.toX && c.ty === entry.toY));
        if (!w.crates.some((c) => c.tx === entry.fromX && c.ty === entry.fromY)) {
          w.crates.splice(Math.min(entry.crateIndex, w.crates.length), 0, { tx: entry.fromX, ty: entry.fromY });
        }
        if (w.removedCrates) w.removedCrates = w.removedCrates.filter((k) => k !== fromKey);
      }
      return 'Moved tree back';
    }
    case 'paste': {
      for (let i = entry.items.length - 1; i >= 0; i--) removeExactPlacement(w, entry.items[i]);
      const n = entry.items.length;
      return 'Undid paste (' + n + (n === 1 ? ' item' : ' items') + ')';
    }
  }
}

/** BUILD 991: re-apply the FORWARD action an UndoEntry undoes, so a
 *  popped undo entry becomes a redo entry. Every branch is idempotent
 *  (re-adding content already present is skipped, re-removing content
 *  already gone is a no-op), so a stale entry cannot duplicate or
 *  delete anything. Stroke sub-entries replay in FORWARD order (the
 *  order they were removed), mirroring applyUndo's reverse order. */
export function applyRedo(w: IsoWorld, entry: UndoEntry): string {
  switch (entry.kind) {
    case 'stroke': {
      for (const sub of entry.entries) applyRedo(w, sub);
      const n = entry.entries.length;
      return 'Redid ' + n + (n === 1 ? ' removal' : ' removals');
    }
    case 'group': {
      // BUILD 1037: a whole AREA SELECT operation as one redo step.
      // The `move` sub-entries redo in TWO phases — remove every old
      // position first, then place every new position — mirroring
      // the undo's two phases. A rotation cycle (A's new rect == D's
      // old rect) would otherwise let the rect-based removal eat the
      // other entry's just-placed item and lose one. The placements
      // go in ASCENDING recorded-index order, which rebuilds the
      // post-move list order exactly.
      const moves = entry.entries.filter((e) => e.kind === 'move');
      for (const sub of entry.entries) {
        if (sub.kind !== 'move') applyRedo(w, sub);
      }
      for (const m of moves) removeExactPlacement(w, m.oldItem);
      const byIndex = [...moves].sort((a, b) => a.index - b.index);
      for (const m of byIndex) {
        if (!w.placements) w.placements = [];
        const item = m.newItem;
        const exists = w.placements.some((p) => p.kind === item.kind && p.x0 === item.x0 && p.y0 === item.y0 && p.x1 === item.x1 && p.y1 === item.y1);
        if (!exists) w.placements.splice(Math.min(m.index, w.placements.length), 0, item);
      }
      return 'Redid ' + entry.label;
    }
    case 'place': {
      if (!w.placements) w.placements = [];
      const item = entry.item;
      const exists = w.placements.some((p) => p.kind === item.kind && p.x0 === item.x0 && p.y0 === item.y0 && p.x1 === item.x1 && p.y1 === item.y1);
      if (!exists) w.placements.push(item);
      return 'Re-placed ' + item.kind;
    }
    case 'unplace': {
      removeExactPlacement(w, entry.item);
      return 'Removed ' + entry.item.kind;
    }
    case 'unhouse': {
      const rect = entry.rect;
      w.huts = w.huts.filter((h) => !(h.x0 === rect.x0 && h.y0 === rect.y0 && h.x1 === rect.x1 && h.y1 === rect.y1));
      if (!w.removedHuts) w.removedHuts = [];
      if (!w.removedHuts.some((r) => r.x0 === rect.x0 && r.y0 === rect.y0 && r.x1 === rect.x1 && r.y1 === rect.y1)) {
        w.removedHuts.push({ x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 });
      }
      return 'Removed house';
    }
    case 'unpath': {
      const key = terrainKey(entry.x, entry.y);
      delete w.terrain[key];
      if (!w.removedPaths) w.removedPaths = [];
      if (!w.removedPaths.includes(key)) w.removedPaths.push(key);
      return 'Removed path';
    }
    case 'untree': {
      const tree = entry.tree;
      if (tree) {
        const idx = w.trees.findIndex((t) => t.tx === tree.tx && t.ty === tree.ty);
        if (idx >= 0) w.trees.splice(idx, 1);
        const key = terrainKey(tree.tx, tree.ty);
        if (!w.removedTrees) w.removedTrees = [];
        if (!w.removedTrees.includes(key)) w.removedTrees.push(key);
      }
      const crate = entry.crate;
      if (crate) {
        const idx = w.crates.findIndex((c) => c.tx === crate.tx && c.ty === crate.ty);
        if (idx >= 0) w.crates.splice(idx, 1);
        const key = terrainKey(crate.tx, crate.ty);
        if (!w.removedCrates) w.removedCrates = [];
        if (!w.removedCrates.includes(key)) w.removedCrates.push(key);
      }
      return 'Removed tree';
    }
    case 'unrock': {
      const idx = w.rocks.findIndex((r) => r.tx === entry.x && r.ty === entry.y);
      if (idx >= 0) w.rocks.splice(idx, 1);
      const key = terrainKey(entry.x, entry.y);
      if (!w.removedRocks) w.removedRocks = [];
      if (!w.removedRocks.includes(key)) w.removedRocks.push(key);
      return 'Removed rock';
    }
    case 'unwater': {
      // Re-apply the forward removal (idempotent — a tile already
      // removed is a no-op), which is exactly removeGeneratedWaterAt.
      removeGeneratedWaterAt(w, entry.x, entry.y);
      return 'Removed water';
    }
    case 'unwall': {
      // Re-apply the forward removal (idempotent — a tile already
      // removed is a no-op), which is exactly removeGeneratedWallAt.
      removeGeneratedWallAt(w, entry.x, entry.y);
      return 'Removed wall';
    }
    case 'move': {
      removeExactPlacement(w, entry.oldItem);
      if (!w.placements) w.placements = [];
      const item = entry.newItem;
      const exists = w.placements.some((p) => p.kind === item.kind && p.x0 === item.x0 && p.y0 === item.y0 && p.x1 === item.x1 && p.y1 === item.y1);
      if (!exists) w.placements.splice(Math.min(entry.index, w.placements.length), 0, item);
      return 'Moved ' + item.kind;
    }
    case 'moveGenHouse': {
      // BUILD 1037: a rotated hut carries its post-rotation face in
      // `toFace` (a plain move leaves it absent, and the `from` door
      // is the face — same value). Without it, redoing a rotation
      // would stamp the `to` rect with the ORIGINAL face, not the
      // rotated one.
      const face = entry.toFace ?? hutFace(entry.from);
      const toDoor = doorForRect(entry.to.x0, entry.to.y0, entry.to.x1, entry.to.y1, face);
      w.huts = w.huts.filter((h) => !rectEqual(h, entry.prevTo));
      const toHut: HutRect = { ...entry.to, doorX: toDoor.x, doorY: toDoor.y };
      if (!w.huts.some((h) => rectEqual(h, entry.to))) {
        w.huts.splice(Math.min(entry.index, w.huts.length), 0, toHut);
      }
      if (!w.movedHuts) w.movedHuts = [];
      const rec = w.movedHuts.find((m) => rectEqual(m.from, entry.from));
      if (rec) rec.to = { ...toHut };
      else w.movedHuts.push({ from: { ...entry.from }, to: { ...toHut } });
      return 'Moved house';
    }
    case 'moveGenPath': {
      const fromKey = terrainKey(entry.fromX, entry.fromY);
      delete w.terrain[fromKey];
      if (!w.removedPaths) w.removedPaths = [];
      if (!w.removedPaths.includes(fromKey)) w.removedPaths.push(fromKey);
      if (!w.placements) w.placements = [];
      const item: PlacedItem = { kind: 'path', x0: entry.toX, y0: entry.toY, x1: entry.toX, y1: entry.toY };
      if (!w.placements.some((p) => p.kind === 'path' && p.x0 === entry.toX && p.y0 === entry.toY)) w.placements.push(item);
      return 'Moved path';
    }
    case 'moveGenTree': {
      const fromKey = terrainKey(entry.fromX, entry.fromY);
      if (entry.hasTree) {
        w.trees = w.trees.filter((t) => !(t.tx === entry.fromX && t.ty === entry.fromY));
        if (!w.trees.some((t) => t.tx === entry.toX && t.ty === entry.toY)) {
          w.trees.splice(Math.min(entry.treeIndex, w.trees.length), 0, { tx: entry.toX, ty: entry.toY });
        }
        if (!w.removedTrees) w.removedTrees = [];
        if (!w.removedTrees.includes(fromKey)) w.removedTrees.push(fromKey);
      }
      if (entry.hasCrate) {
        w.crates = w.crates.filter((c) => !(c.tx === entry.fromX && c.ty === entry.fromY));
        if (!w.crates.some((c) => c.tx === entry.toX && c.ty === entry.toY)) {
          w.crates.splice(Math.min(entry.crateIndex, w.crates.length), 0, { tx: entry.toX, ty: entry.toY });
        }
        if (!w.removedCrates) w.removedCrates = [];
        if (!w.removedCrates.includes(fromKey)) w.removedCrates.push(fromKey);
      }
      return 'Moved tree';
    }
    case 'paste': {
      if (!w.placements) w.placements = [];
      for (const item of entry.items) {
        const exists = w.placements.some((p) => p.kind === item.kind && p.x0 === item.x0 && p.y0 === item.y0 && p.x1 === item.x1 && p.y1 === item.y1);
        if (!exists) w.placements.push(item);
      }
      const n = entry.items.length;
      return 'Re-pasted ' + n + (n === 1 ? ' item' : ' items');
    }
  }
}

/** BUILD 991: undo + redo stacks (MS Paint style). The undo stack
 *  holds inverse entries (newest last); the redo stack holds entries
 *  popped by undo, ready to replay forward. A new build action pushes
 *  onto undo and CLEARS redo — there is no branching timeline. Both
 *  stacks are session-only (created per mount, never saved): after a
 *  reload both start empty until a new change that session. Entries —
 *  not world snapshots — are the stack unit, for a measured reason:
 *  the renderer reads the live world arrays (huts/trees/crates/
 *  terrain), and the adapter never re-stamps real trees, so restoring
 *  removed-sets alone could not bring back a removed house or tree;
 *  the 989 inverse entries already restore exactly, and cost one
 *  small record per action (one per stroke), never a world copy and
 *  never a vertex buffer — so the stacks are uncapped and a long
 *  session's history costs kilobytes, not megabytes. */
export type BuildHistory = { undo: UndoEntry[]; redo: UndoEntry[] };
export function createBuildHistory(): BuildHistory { return { undo: [], redo: [] }; }
export function recordBuildChange(h: BuildHistory, entry: UndoEntry): void { h.undo.push(entry); h.redo.length = 0; }
export function undoBuildChange(w: IsoWorld, h: BuildHistory): string | null {
  const entry = h.undo.pop(); if (!entry) return null;
  const msg = applyUndo(w, entry); h.redo.push(entry); return msg;
}
export function redoBuildChange(w: IsoWorld, h: BuildHistory): string | null {
  const entry = h.redo.pop(); if (!entry) return null;
  const msg = applyRedo(w, entry); h.undo.push(entry); return msg;
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

/** BUILD 997: shared blocking-rect checks, so a custom upload's
 *  footprint validates exactly like a built-in blocking item and the
 *  two can never drift apart. The rect is an explicit tile rect
 *  (x0..x1, y0..y1); terrain, generated, placed, player, NPC and
 *  waypoint rules are the same ones validatePlacement applies to
 *  houses/stalls/trees. Paths and grass never use this (they are
 *  walkable decor with their own rules). */
export function validateBlockingRect(
  w: IsoWorld,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): { ok: true } | { ok: false; reason: string } {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) return { ok: false, reason: 'outside the map' };
      const terrain = terrainAt(w, x, y);
      if (terrain === 'water') return { ok: false, reason: 'water' };
      if (terrain === 'dirt') return { ok: false, reason: 'a path or road' };
      if (terrain === 'sand') return { ok: false, reason: 'the town square' };
      const gen = generatedBlock(w, x, y);
      if (gen) return { ok: false, reason: gen };
      const pl = placedBlock(w, x, y);
      if (pl) return { ok: false, reason: pl };
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x === playerTile.x && y === playerTile.y) return { ok: false, reason: 'where you are standing' };
      if (npcTiles.some((n) => n.x === x && n.y === y)) return { ok: false, reason: 'where someone is standing' };
      if (isWaypointTile(w, x, y)) return { ok: false, reason: 'an NPC walking route' };
    }
  }
  return { ok: true };
}

/**
 * Validate a placement whose tap landed on tile (tx, ty).
 * Houses are centred on the tap at their kind's footprint — the
 * legacy 3x3 for bare 'house', the variant's measured town footprint
 * for a variant kind (cottage 4x3, tall 3x3, shop 6x4, grand 6x5;
 * x0 = tap - floor(w/2), same anchor moveGeneratedHut uses, so
 * paste/move anchors reproduce the rect exactly). Stalls are 2x1
 * (tap + east); paths/trees/grass are single tiles. Standing rule: houses NEVER on
 * paths (dirt) or the square (sand); blocking items never on the
 * player, an NPC, or an NPC waypoint tile (an NPC that can never reach
 * its waypoint stalls forever). Paths are walkable ground, so they may
 * be placed under the player or an NPC. Grass (BUILD 985) is
 * walk-through decor: it may be placed on paths, the square and lawns
 * alike, under the player or an NPC, and on top of a placed path, but
 * never on water, walls, buildings, stalls, trees, rocks or crates,
 * and never twice on one tile. It never blocks movement.
 */
/** BUILD 1028: the orientation a newly placed wall tile takes. A
 *  neighbour on the same row extends a horizontal run; a neighbour
 *  in the same column extends a vertical one; a corner (a row
 *  neighbour present) reads horizontal. No wall neighbour at all
 *  defaults horizontal. Generated and placed walls both count, so
 *  extending the town boundary keeps its orientation. In 3D the
 *  cube looks the same either way — the h only matters to the 2.5D
 *  wall-run merge. */
function wallOrientationAt(w: IsoWorld, tx: number, ty: number): boolean {
  const isWall = (x: number, y: number): boolean => {
    if (w.walls.some((wl) => wl.x === x && wl.y === y)) return true;
    return placementsOf(w).some((p) => p.kind === 'wall' && p.x0 === x && p.y0 === y);
  };
  if (isWall(tx - 1, ty) || isWall(tx + 1, ty)) return true;
  if (isWall(tx, ty - 1) || isWall(tx, ty + 1)) return false;
  return true;
}

export function validatePlacement(
  w: IsoWorld,
  kind: PaletteKind,
  tx: number,
  ty: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
  rot: Rotation = 0,
): PlaceResult {
  // BUILD 997: custom items never validate here — their footprint
  // comes from the uploaded mesh, not from a fixed kind shape, so
  // validateCustomPlacement (customAssets.ts) owns them. A caller
  // passing 'custom' here is a bug, and failing loudly beats placing
  // a 1x1 tile for a 3x3 mesh.
  if ((kind as string) === 'custom') return { ok: false, reason: 'use validateCustomPlacement' };
  const tiles: Array<{ x: number; y: number }> = [];
  if (isHouseKind(kind)) {
    // BUILD 1036: the footprint rotates with the house — an odd rot
    // swaps w/d, so a 4x3 cottage at 90° validates as a 3x4 rect
    // centred on the same tap tile.
    const fp = houseFootprint(kind, rot);
    const x0 = tx - Math.floor(fp.w / 2), y0 = ty - Math.floor(fp.d / 2);
    for (let dy = 0; dy < fp.d; dy++) for (let dx = 0; dx < fp.w; dx++) tiles.push({ x: x0 + dx, y: y0 + dy });
  } else if (kind === 'stall') {
    // BUILD 1036: a stall runs east (tap + east) by default; an odd
    // rot runs it south (tap + south) instead.
    if (rot % 2 === 1) tiles.push({ x: tx, y: ty }, { x: tx, y: ty + 1 });
    else tiles.push({ x: tx, y: ty }, { x: tx + 1, y: ty });
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
  // BUILD 1012: a variant kind places kind 'house' carrying the
  // variant; bare 'house' stays the legacy variant-less item. The
  // rect is the validated footprint (centred on the tap), never
  // re-derived, so the shape guard in pasteChunk can trust it.
  // BUILD 1036: the item carries rot (house/stall only, and only
  // when non-zero — old saves have no rot and behave as rot 0).
  // 1x1 kinds ignore rot entirely: rotating a tree is meaningless
  // and storing it would be a lie.
  let item: PlacedItem;
  if (isHouseKind(kind)) {
    const fp = houseFootprint(kind, rot);
    const x0 = tx - Math.floor(fp.w / 2), y0 = ty - Math.floor(fp.d / 2);
    const v = variantOfKind(kind);
    item = v
      ? { kind: 'house', variant: v, x0, y0, x1: x0 + fp.w - 1, y1: y0 + fp.d - 1, ...(rot !== 0 ? { rot } : {}) }
      : { kind: 'house', x0, y0, x1: x0 + fp.w - 1, y1: y0 + fp.d - 1, ...(rot !== 0 ? { rot } : {}) };
  } else if (kind === 'stall') {
    item = rot % 2 === 1
      ? { kind, x0: tx, y0: ty, x1: tx, y1: ty + 1, rot }
      : { kind, x0: tx, y0: ty, x1: tx + 1, y1: ty };
  } else if (kind === 'wall') {
    // BUILD 1028: a placed wall is a 1x1 tile carrying its
    // orientation (auto-matched to an adjacent run, else horizontal).
    item = { kind, x0: tx, y0: ty, x1: tx, y1: ty, h: wallOrientationAt(w, tx, ty) };
  } else {
    item = { kind, x0: tx, y0: ty, x1: tx, y1: ty };
  }
  return { ok: true, item };
}

/** BUILD 995: move a PLACED item to a new tap tile, under the SAME
 *  rules as placing it (validatePlacement). The item is lifted out
 *  first, so a destination overlapping its own old rect validates
 *  against the freed tiles, not against itself; on failure the
 *  original item is restored at its exact index and nothing changes.
 *  The drop tile has placement semantics: house = centre tile of its
 *  footprint (legacy 3x3, or the variant's footprint), stall = west
 *  tile of the 2x1, everything else = the tile.
 *  Generated items are NOT movable here — callers only ever pass placed
 *  items, and an item missing from the list refuses. Generated moves
 *  live in moveGeneratedHut/moveGeneratedPath/moveGeneratedTree below
 *  (BUILD 1006). Returns the new item plus its list index so one undo
 *  entry restores exactly. */
export function movePlacement(
  w: IsoWorld,
  item: PlacedItem,
  destTx: number,
  destTy: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): { ok: true; item: PlacedItem; index: number } | { ok: false; reason: string } {
  const list = w.placements;
  const index = list ? list.findIndex((p) => samePlacement(p, item)) : -1;
  if (index < 0 || !list) return { ok: false, reason: 'item not found' };
  const [lifted] = list.splice(index, 1);
  // BUILD 997: custom items move by rect, not by kind shape — the
  // destination rect keeps the item's own dims, min corner on the
  // destination tap tile, validated with the shared blocking rules.
  if (item.kind === 'custom') {
    const wTiles = item.x1 - item.x0 + 1;
    const hTiles = item.y1 - item.y0 + 1;
    const res = validateBlockingRect(w, destTx, destTy, destTx + wTiles - 1, destTy + hTiles - 1, playerTile, npcTiles);
    if (!res.ok) {
      list.splice(Math.min(index, list.length), 0, lifted);
      return { ok: false, reason: res.reason };
    }
    const customItem: PlacedItem = { kind: 'custom', assetId: item.assetId, x0: destTx, y0: destTy, x1: destTx + wTiles - 1, y1: destTy + hTiles - 1 };
    const at = Math.min(index, list.length);
    list.splice(at, 0, customItem);
    return { ok: true, item: customItem, index: at };
  }
  // BUILD 1012: a placed house moves under its own kind (its variant
  // kind, or legacy 'house') so the footprint and the design travel
  // with it — validating a variant house as bare 'house' would shrink
  // it to 3x3 and drop the variant.
  // BUILD 1036: a moved house keeps its rotation — the destination
  // validates under the rotated footprint, so a 90° cottage stays
  // a 3x4 with its door on the same face.
  const moveKind = item.kind === 'house' ? housePlacementKind(item) : item.kind;
  const result = validatePlacement(w, moveKind, destTx, destTy, playerTile, npcTiles, item.rot ?? 0);
  if (!result.ok) {
    list.splice(Math.min(index, list.length), 0, lifted);
    return { ok: false, reason: result.reason };
  }
  // BUILD 1028: a moved wall keeps its own orientation — a move
  // must not flip what the thing is (validatePlacement would
  // re-orient it to its new neighbours).
  if (item.kind === 'wall' && item.h !== undefined) result.item.h = item.h;
  const at = Math.min(index, list.length);
  list.splice(at, 0, result.item);
  return { ok: true, item: result.item, index: at };
}

/** BUILD 1006: generated-item moves — the 995 Move mode extended to the
 *  game's own houses, paths, and trees. The drag interaction is the
 *  view's existing Move mode (same tap/drag, same one-undo-per-move);
 *  these pure functions own the world mutation so it is asserted
 *  standalone. Design notes, all load-bearing:
 *  - Houses move by RECORD, not by editing the layout: a movedHuts
 *    entry {from: original layout rect, to: current rect} tells the
 *    adapter to stamp the lot at `to` instead of `from` on every load
 *    (the adapter rebuilds town lots from layout, so plainly moving the
 *    hut rect would snap home on reload). Chained moves UPDATE the one
 *    record's `to`. The record survives a later removal of the moved
 *    hut — the adapter skips lots whose TARGET rect is removed, so
 *    keeping the record is what keeps a removed moved-hut gone.
 *  - Paths move as a 987 removal at the source (grass returns, removed
 *    entry blocks the road rasterizer) plus a LITERAL placed path at
 *    the destination (same rendering, walkability, and Remove behavior
 *    as a palette path). Consequence, stated: chunk saves capture a
 *    moved path as the placed path it now is — that is placed-item
 *    capture, not generated-item capture (still not built).
 *  - Trees move as entries: whatever backs the tile (real tree and/or
 *    crate, the 989 coherence rule) travels to the destination and the
 *    source tile is left completely empty — no duplicated harvest, no
 *    phantom collision. Source keys join the removed sets so the
 *    adapter's prop loop cannot resurrect a moved prop crate.
 *  - Destinations obey the full 984 rules (validateBlockingRect for
 *    huts, validatePlacement for trees/paths), with the source lifted
 *    first so a destination overlapping its own old footprint validates
 *    against freed tiles. A move that would newly cut the player or any
 *    NPC off from the map edge is refused and rolled back via the same
 *    applyUndo path as a real undo — never half-applied. Paths never
 *    need the trap check: dirt and grass are both walkable, so a path
 *    move cannot change connectivity.
 *  - Same-position drops return {ok, same} with ZERO mutation (the
 *    placed-move path can lift-and-restore harmlessly, but a generated
 *    tree move that touched the removed sets before the view's
 *    same-check would lose the tree on reload — so the check lives here,
 *    before any mutation). The view treats `same` as a silent no-op:
 *    no save, no history entry. */

export function rectEqual(a: HutRect, b: HutRect): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

/** The moved record whose CURRENT rect is `rect`, else null. */
export function movedRecordForHut(w: IsoWorld, rect: HutRect): MovedHut | null {
  return (w.movedHuts ?? []).find((m) => rectEqual(m.to, rect)) ?? null;
}

/** The moved record for a LAYOUT rect (a hut's original position), else null. */
export function movedRecordForLayoutRect(w: IsoWorld, rect: HutRect): MovedHut | null {
  return (w.movedHuts ?? []).find((m) => rectEqual(m.from, rect)) ?? null;
}

/** Seed rect for a hut's look: a moved hut keeps its ORIGINAL rect's
 *  look (townLook/interior seeds derive from it); unmoved huts seed
 *  from themselves. */
export function seedRectForHut(w: IsoWorld, hut: HutRect): HutRect {
  return movedRecordForHut(w, hut)?.from ?? hut;
}

/** The rect a placement of `kind` at tap (tx, ty) with rotation
 *  `rot` would occupy — the same anchor math validatePlacement
 *  uses (house = footprint centred on the tap, stall = west tile,
 *  everything else = the tile). Used by the placement preview to
 *  draw the would-be footprint even when validation fails (so the
 *  red preview still shows where the asset would land). */
export function placementRectFor(kind: PaletteKind, tx: number, ty: number, rot: Rotation = 0): { x0: number; y0: number; x1: number; y1: number } {
  if (isHouseKind(kind)) {
    const fp = houseFootprint(kind, rot);
    const x0 = tx - Math.floor(fp.w / 2), y0 = ty - Math.floor(fp.d / 2);
    return { x0, y0, x1: x0 + fp.w - 1, y1: y0 + fp.d - 1 };
  }
  if (kind === 'stall') {
    return rot % 2 === 1 ? { x0: tx, y0: ty, x1: tx, y1: ty + 1 } : { x0: tx, y0: ty, x1: tx + 1, y1: ty };
  }
  return { x0: tx, y0: ty, x1: tx, y1: ty };
}

/** Door face from a hut's stored door, mirroring interiors.hutDoor
 *  exactly (doorless huts fall back to the SE corner, as
 *  isWalkableWorld does). */
export function hutFace(hut: HutRect): 'north' | 'south' | 'west' | 'east' {
  const x = hut.doorX ?? hut.x1;
  const y = hut.doorY ?? hut.y1;
  return y <= hut.y0 ? 'north' : y >= hut.y1 ? 'south' : x <= hut.x0 ? 'west' : 'east';
}

/** Door tile for a rect + facing, mirroring the adapter's formula
 *  exactly (midX/midY of the rect on the facing edge). */
export function doorForRect(
  x0: number, y0: number, x1: number, y1: number,
  face: 'north' | 'south' | 'west' | 'east',
): { x: number; y: number } {
  const midX = Math.round((x0 + x1) / 2);
  const midY = Math.round((y0 + y1) / 2);
  return face === 'north' ? { x: midX, y: y0 }
    : face === 'south' ? { x: midX, y: y1 }
    : face === 'west' ? { x: x0, y: midY }
    : { x: x1, y: midY };
}

/** Walkable tiles connected to the map edge under NPC rules (no hut
 *  tile at all — door tiles included — plus walkableWithPlacements).
 *  The trap check compares this set before/after a tentative move:
 *  the player can step on door tiles, so the NPC-stricter set can only
 *  over-refuse in exotic door-tile cases, never under-refuse a real
 *  enclosure (a door tile never leads out of a pocket — Exit returns to
 *  the same side). One BFS over at most w*h tiles; a move action only,
 *  never per-frame. */
export function edgeConnectedTiles(w: IsoWorld): Set<string> {
  const key = (x: number, y: number) => x + ',' + y;
  const blocked = new Set<string>();
  for (const wl of w.walls) blocked.add(key(wl.x, wl.y));
  for (const h of w.huts) for (let y = h.y0; y <= h.y1; y++) for (let x = h.x0; x <= h.x1; x++) blocked.add(key(x, y));
  for (const s of w.stalls) for (let x = s.x0; x <= s.x1; x++) blocked.add(key(x, s.y0));
  for (const t of w.trees) blocked.add(key(t.tx, t.ty));
  for (const r of w.rocks) blocked.add(key(r.tx, r.ty));
  for (const c of w.crates) blocked.add(key(c.tx, c.ty));
  for (const p of placementsOf(w)) {
    if (p.kind === 'path' || p.kind === 'grass') continue;
    for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) blocked.add(key(x, y));
  }
  const seen = new Set<string>();
  const queue: Array<{ x: number; y: number }> = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) return;
    const k = key(x, y);
    if (seen.has(k) || blocked.has(k)) return;
    if (terrainAt(w, x, y) === 'water') return;
    seen.add(k);
    queue.push({ x, y });
  };
  for (let x = 0; x < w.w; x++) { push(x, 0); push(x, w.h - 1); }
  for (let y = 0; y < w.h; y++) { push(0, y); push(w.w - 1, y); }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    push(c.x + 1, c.y); push(c.x - 1, c.y); push(c.x, c.y + 1); push(c.x, c.y - 1);
  }
  return seen;
}

/** Actors cut off from the map edge by a tentative move: free BEFORE
 *  (in preFree) but not free AFTER (absent from the current world's
 *  edge set). Actors already sealed before the move are NOT newly
 *  trapped — a freeing move stays legal and an unrelated move is never
 *  refused because of a pre-existing pocket. BUILD 1037: exported —
 *  the AREA SELECT group move/rotate does one trap check for the
 *  whole group instead of one per item. */
export function newlyTrapped(
  preFree: Set<string>,
  w: IsoWorld,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): { player: boolean; npcs: boolean } {
  const postFree = edgeConnectedTiles(w);
  const key = (t: { x: number; y: number }) => t.x + ',' + t.y;
  return {
    player: preFree.has(key(playerTile)) && !postFree.has(key(playerTile)),
    npcs: npcTiles.some((t) => preFree.has(key(t)) && !postFree.has(key(t))),
  };
}

export type MoveGeneratedResult =
  | { ok: true; same: true }
  | { ok: true; same: false; entry: UndoEntry }
  | { ok: false; reason: string };

/** Move a GENERATED hut so its centre (adapter-mid) lands on the drop
 *  tile: new rect keeps the hut's exact size, door recomputed from its
 *  facing, moved record created or updated. The drop tile is the hut's
 *  centre, mirroring placed houses (centre tile) — for south/north
 *  facing huts the door lands on the drop tile. */
export function moveGeneratedHut(
  w: IsoWorld,
  hut: HutRect,
  destCx: number,
  destCy: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): MoveGeneratedResult {
  const width = hut.x1 - hut.x0 + 1;
  const height = hut.y1 - hut.y0 + 1;
  const nx0 = destCx - Math.floor(width / 2);
  const ny0 = destCy - Math.floor(height / 2);
  const nx1 = nx0 + width - 1;
  const ny1 = ny0 + height - 1;
  if (nx0 === hut.x0 && ny0 === hut.y0 && nx1 === hut.x1 && ny1 === hut.y1) return { ok: true, same: true };
  const index = w.huts.indexOf(hut);
  if (index < 0) return { ok: false, reason: 'house not found' };
  const face = hutFace(hut);
  const door = doorForRect(nx0, ny0, nx1, ny1, face);
  const newHut: HutRect = { x0: nx0, y0: ny0, x1: nx1, y1: ny1, doorX: door.x, doorY: door.y };
  const existing = movedRecordForHut(w, hut);
  const from: HutRect = existing ? { ...existing.from } : { ...hut };
  const prevTo: HutRect = { x0: hut.x0, y0: hut.y0, x1: hut.x1, y1: hut.y1 };
  const entry: UndoEntry = { kind: 'moveGenHouse', from, prevTo, to: { x0: nx0, y0: ny0, x1: nx1, y1: ny1 }, index };
  const preFree = edgeConnectedTiles(w);
  const [lifted] = w.huts.splice(index, 1);
  const check = validateBlockingRect(w, nx0, ny0, nx1, ny1, playerTile, npcTiles);
  if (!check.ok) {
    w.huts.splice(Math.min(index, w.huts.length), 0, lifted);
    return { ok: false, reason: check.reason };
  }
  w.huts.splice(Math.min(index, w.huts.length), 0, newHut);
  const trapped = newlyTrapped(preFree, w, playerTile, npcTiles);
  if (trapped.player || trapped.npcs) {
    // Roll back BEFORE any moved record is written, so a refused move
    // leaves zero trace (the undo branch likewise creates no array for
    // a first-move rollback — see applyUndo's moveGenHouse case).
    applyUndo(w, entry);
    return { ok: false, reason: trapped.player ? 'would trap you' : 'would trap a villager' };
  }
  if (!w.movedHuts) w.movedHuts = [];
  const rec = w.movedHuts.find((m) => rectEqual(m.from, from));
  if (rec) rec.to = { ...newHut };
  else w.movedHuts.push({ from: { ...from }, to: { ...newHut } });
  return { ok: true, same: false, entry };
}

/** Move a GENERATED dirt tile: 987 removal at the source plus a literal
 *  placed path at the destination. No trap check — dirt and grass are
 *  both walkable, so connectivity cannot change. */
export function moveGeneratedPath(
  w: IsoWorld,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): MoveGeneratedResult {
  if (fromX === toX && fromY === toY) return { ok: true, same: true };
  if (terrainAt(w, fromX, fromY) !== 'dirt') return { ok: false, reason: 'no path here' };
  const check = validatePlacement(w, 'path', toX, toY, { x: -1, y: -1 }, []);
  if (!check.ok) return { ok: false, reason: check.reason };
  const fromKey = terrainKey(fromX, fromY);
  delete w.terrain[fromKey];
  if (!w.removedPaths) w.removedPaths = [];
  if (!w.removedPaths.includes(fromKey)) w.removedPaths.push(fromKey);
  addPlacement(w, { kind: 'path', x0: toX, y0: toY, x1: toX, y1: toY });
  return { ok: true, same: false, entry: { kind: 'moveGenPath', fromX, fromY, toX, toY } };
}

/** Move a GENERATED visible tree: whatever backs the tile (real tree
 *  and/or crate, the 989 coherence rule) travels together; the source
 *  tile is left completely empty. E-key harvest follows the entries to
 *  the new tile with unchanged yields (crate +1, tree +2). */
export function moveGeneratedTree(
  w: IsoWorld,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): MoveGeneratedResult {
  if (fromX === toX && fromY === toY) return { ok: true, same: true };
  const treeIndex = w.trees.findIndex((t) => t.tx === fromX && t.ty === fromY);
  const crateIndex = w.crates.findIndex((c) => c.tx === fromX && c.ty === fromY);
  if (treeIndex < 0 && crateIndex < 0) return { ok: false, reason: 'no tree here' };
  const preFree = edgeConnectedTiles(w);
  let tree: { tx: number; ty: number } | null = null;
  let crate: { tx: number; ty: number } | null = null;
  if (treeIndex >= 0) [tree] = w.trees.splice(treeIndex, 1);
  if (crateIndex >= 0) [crate] = w.crates.splice(crateIndex, 1);
  const check = validatePlacement(w, 'tree', toX, toY, playerTile, npcTiles);
  if (!check.ok) {
    if (tree) w.trees.splice(Math.min(treeIndex, w.trees.length), 0, tree);
    if (crate) w.crates.splice(Math.min(crateIndex, w.crates.length), 0, crate);
    return { ok: false, reason: check.reason };
  }
  const entry: UndoEntry = {
    kind: 'moveGenTree', fromX, fromY, toX, toY,
    hasTree: tree !== null, hasCrate: crate !== null, treeIndex, crateIndex,
  };
  if (tree) w.trees.splice(Math.min(treeIndex, w.trees.length), 0, { tx: toX, ty: toY });
  if (crate) w.crates.splice(Math.min(crateIndex, w.crates.length), 0, { tx: toX, ty: toY });
  const trapped = newlyTrapped(preFree, w, playerTile, npcTiles);
  if (trapped.player || trapped.npcs) {
    // Roll back BEFORE any removed key is written, so a refused move
    // leaves zero trace (the undo branch only filters arrays that
    // already exist, so nothing is created here either).
    applyUndo(w, entry);
    return { ok: false, reason: trapped.player ? 'would trap you' : 'would trap a villager' };
  }
  const fromKey = terrainKey(fromX, fromY);
  if (tree) {
    if (!w.removedTrees) w.removedTrees = [];
    if (!w.removedTrees.includes(fromKey)) w.removedTrees.push(fromKey);
  }
  if (crate) {
    if (!w.removedCrates) w.removedCrates = [];
    if (!w.removedCrates.includes(fromKey)) w.removedCrates.push(fromKey);
  }
  return { ok: true, same: false, entry };
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

/** Placed houses as hut rects; door derived at render time (south edge centre). BUILD 1012: the variant travels on the rect so the house loop can render the picked design (absent = legacy seed-hash house). BUILD 1036: the door rotates with the house — doorForRect on the rotated face, so a 90° cottage has its door on the west edge, a 180° one on the north edge. Rendering, Enter/Exit, interiors and walkability all read this door, so rotation flows through unchanged. */
export function placedHutRects(w: IsoWorld): Array<{ x0: number; y0: number; x1: number; y1: number; doorX: number; doorY: number; variant?: HouseVariantId }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'house')
    .map((p) => {
      const door = doorForRect(p.x0, p.y0, p.x1, p.y1, rotateFace('south', p.rot ?? 0));
      return { x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, doorX: door.x, doorY: door.y, ...(p.variant ? { variant: p.variant } : {}) };
    });
}

export function placedTreeTiles(w: IsoWorld): Array<{ tx: number; ty: number }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'tree')
    .map((p) => ({ tx: p.x0, ty: p.y0 }));
}

/** Placed rock tiles (BUILD 1025). Single tiles, like placed trees. */
export function placedRockTiles(w: IsoWorld): Array<{ tx: number; ty: number }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'rock')
    .map((p) => ({ tx: p.x0, ty: p.y0 }));
}

/** Placed water tiles (BUILD 1027). Single tiles, like placed trees
 *  and rocks — a placed water tile renders and blocks exactly like
 *  generated water. */
export function placedWaterTiles(w: IsoWorld): Array<{ tx: number; ty: number }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'water')
    .map((p) => ({ tx: p.x0, ty: p.y0 }));
}

/** Placed wall tiles (BUILD 1028). Single tiles, like placed trees,
 *  rocks, and water — a placed wall tile renders and blocks exactly
 *  like a generated wall tile. The h rides along (absent =
 *  horizontal, the placement default), so the 2.5D wall-run merge
 *  sees the same orientation a generated tile carries. */
export function placedWallTiles(w: IsoWorld): Array<{ x: number; y: number; h: boolean }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'wall')
    .map((p) => ({ x: p.x0, y: p.y0, h: p.h ?? true }));
}

export function placedStallRects(w: IsoWorld): Array<{ x0: number; y0: number; x1: number }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'stall')
    .map((p) => ({ x0: p.x0, y0: p.y0, x1: p.x1 }));
}

/** Placed custom-upload rects (BUILD 997), with their asset ids, for
 *  rendering and grass-tuft blocking. */
export function placedCustomRects(w: IsoWorld): Array<{ x0: number; y0: number; x1: number; y1: number; assetId: string | undefined }> {
  return placementsOf(w)
    .filter((p) => p.kind === 'custom')
    .map((p) => ({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, assetId: p.assetId }));
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

/** Terrain keys of placed water tiles, for the terrain loop's
 *  effective terrain (BUILD 1027 — placed water is 'water' terrain,
 *  like the ocean and the pond). */
export function placedWaterKeys(w: IsoWorld): Set<string> {
  const keys = new Set<string>();
  for (const p of placementsOf(w)) {
    if (p.kind === 'water') keys.add(terrainKey(p.x0, p.y0));
  }
  return keys;
}

// BUILD 1035 — integer tile keys for the hot terrain loop. terrainKey
// builds a "x,y" STRING per call, and effTerrainFor calls it twice per
// tile — ~600k string allocations per world rebuild (the CPU profile
// put the effTerrain closure at 20.4% of rebuild time). Integer keys
// are allocation-free: (x+2048)*4096+(y+2048) is collision-free for
// tile coords in [-2048, 2048) (same scheme as the surfAt corner cache
// in Engine3DWorldView). The string-key functions above stay untouched
// (transients.ts and the save format use them); these integer versions
// serve ONLY the hot effTerrain closure.
/** Integer key for a tile (allocation-free; coords in [-2048, 2048)). */
export function tileKeyInt(x: number, y: number): number {
  return (x + 2048) * 4096 + (y + 2048);
}

/** Integer keys of placed path tiles (see tileKeyInt). */
export function placedPathKeyInts(w: IsoWorld): Set<number> {
  const keys = new Set<number>();
  for (const p of placementsOf(w)) {
    if (p.kind === 'path') keys.add(tileKeyInt(p.x0, p.y0));
  }
  return keys;
}

/** Integer keys of placed water tiles (see tileKeyInt). */
export function placedWaterKeyInts(w: IsoWorld): Set<number> {
  const keys = new Set<number>();
  for (const p of placementsOf(w)) {
    if (p.kind === 'water') keys.add(tileKeyInt(p.x0, p.y0));
  }
  return keys;
}
