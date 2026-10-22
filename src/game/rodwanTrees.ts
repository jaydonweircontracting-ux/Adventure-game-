// BUILD 945: Rodwan tree sprites (Rodwan_Trees.zip, uploaded 2026-10-21).
//
// The sheet is NOT a regular grid: it holds 8 trees at irregular x positions
// (x = 1..970 of a 1400px-wide strip; the right ~430px are empty), each with
// its own measured bounding box. The boxes below were measured from the
// sheet's alpha channel (opaque-column runs + bottom-row trunk spans), NOT
// assumed from 1400 / 8 = 175px cells — the 175px-cell reading is WRONG
// (cells 6-7 would be empty and several trees straddle cell boundaries).
// anchorX = trunk-center x in sheet coords (bottom-row opaque span center;
// tree 5 has low hanging foliage, so its anchor is its bottom-row center);
// anchorY = the slice bottom (trunk base at ground level).
// anchorXRel = anchorX - x, used to hang the sprite from its trunk base so
// the visible trunk sits exactly on the tree's existing collision base.

export const RODWAN_SHEET_PATH = 'sprites/rodwan-trees/Rodwan_Trees.png';
export const RODWAN_SHEET_W = 1400;
export const RODWAN_SHEET_H = 152;

export type RodwanSlice = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Trunk-center x in sheet coordinates. */
  anchorX: number;
  /** Trunk base y in sheet coordinates (= y + h). */
  anchorY: number;
  /** Trunk-center x relative to the slice left edge. */
  anchorXRel: number;
};

const slice = (x: number, y: number, w: number, h: number, anchorX: number): RodwanSlice => ({
  x, y, w, h, anchorX, anchorY: y + h, anchorXRel: anchorX - x,
});

export const RODWAN_SLICES: RodwanSlice[] = [
  slice(1, 32, 65, 113, 31.5),
  slice(133, 48, 56, 97, 161),
  slice(260, 49, 52, 96, 288),
  slice(382, 40, 62, 105, 415.5),
  slice(515, 41, 62, 106, 544.5),
  slice(633, 57, 80, 88, 667),
  slice(767, 35, 81, 110, 815.5),
  slice(895, 39, 76, 106, 927),
];

// 2D field view: only the leafy-tree env sprites swap to Rodwan art. Desert
// cacti, snow pines, dead trees, rocks, and shore props keep their own art —
// a green leafy tree in a desert or on a shore would be wrong. (The iso view
// already draws EVERY tree as the same leafy procedural tree regardless of
// terrain, so swapping all iso trees to Rodwan changes nothing semantically.)
export const RODWAN_LEAFY_SPRITES = ['bigpine', 'pine2', 'pine3'] as const;

// Deterministic variant assignment: same world position -> same tree on
// every load, without touching world generation (fieldTreesFor is untouched).
// Integer-mix hash over chunk + tree id, folded to 0..7.
export function rodwanTreeIndexFor(chunkX: number, chunkY: number, treeId: number): number {
  let h = (chunkX * 73856093) ^ (chunkY * 19349663) ^ (treeId * 83492791);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return ((h % 8) + 8) % 8;
}

// Iso view: match the procedural tree's silhouette height (trunk 21*s plus
// crown to ~69*s above the ground point) so Rodwan trees read at the same
// size players already see. s follows the iso tree loop's own formula.
export function rodwanIsoScale(treeScale: number): number {
  return 0.7 + treeScale * 0.6;
}

export function rodwanIsoHeightPx(treeScale: number): number {
  return 69 * rodwanIsoScale(treeScale);
}

// Canvas draw: trunk base lands exactly on (anchorScreenX, anchorScreenY).
// flip mirrors around the trunk vertical (not the slice center) so a flipped
// tree's trunk stays on its collision base — Rodwan trunks are NOT at slice
// center (e.g. tree 6's trunk sits 8px right of center).
export function drawRodwanTree(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sliceDef: RodwanSlice,
  anchorScreenX: number,
  anchorScreenY: number,
  heightPx: number,
  flip: boolean,
): void {
  const wPx = heightPx * (sliceDef.w / sliceDef.h);
  const anchorXOff = sliceDef.anchorXRel * (heightPx / sliceDef.h);
  ctx.save();
  ctx.translate(anchorScreenX, anchorScreenY);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, sliceDef.x, sliceDef.y, sliceDef.w, sliceDef.h, -anchorXOff, -heightPx, wPx, heightPx);
  ctx.restore();
}
