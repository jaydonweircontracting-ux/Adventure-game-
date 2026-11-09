// BUILD 1049 — Ashfall Stage 3 vegetation: tree variety, generated
// bushes, and honest town-prop shapes.
//
// Pure module (no imports except townLook's hash/tiers — no React, no
// DOM, no I/O), so it is safe for the sim/test import graphs.
//
// The Stage 1 audit's vegetation findings (~/workspace/verify1030/
// ASHFALL-STAGE1.md §1.2): ONE tree design for everything; 118 town
// crates (lamps, hedges, barrels, fountain, well, windmill, statue,
// gatehouse, carts) ALL rendering as the same pine tree; no bushes;
// grass 23% of the town buffer. This module is the data side of the
// fix; Engine3DWorldView.tsx is the render side.
//
// Determinism rule (the whole stage stands on it): every assignment
// is a pure function of tile coordinates, so the same tile always
// grows the same tree / bush and a reload shows the same world —
// never random per frame, never random per rebuild.

import { hash2, TREE_TIERS, type TreeTier } from './townLook';

// ---------------------------------------------------------------------------
// Tree shapes
// ---------------------------------------------------------------------------

/** The three tree shapes. 'pine' is the exact 983/992 tree (TREE_TIERS)
 *  — its tier list is shared by reference, so the pine never drifts
 *  from the shape the world has always had. */
export type TreeShapeId = 'pine' | 'oak' | 'birch';
export const TREE_SHAPE_IDS: TreeShapeId[] = ['pine', 'oak', 'birch'];

/** Oak: broad and leafy — a short trunk under three wide, lighter-green
 *  tiers. Total 3.60, the shortest of the three, and the widest (2.70). */
export const OAK_TIERS: TreeTier[] = [
  { w: 0.4, h: 1.3, y0: 0, color: [0.32, 0.22, 0.12] },
  { w: 2.7, h: 1.05, y0: 1.15, color: [0.16, 0.38, 0.15] },
  { w: 2.35, h: 0.95, y0: 2.0, color: [0.19, 0.42, 0.17] },
  { w: 1.6, h: 0.85, y0: 2.75, color: [0.22, 0.46, 0.19] },
];
export const OAK_TOTAL_H = 3.6;

/** Birch: slim and tall — a thin pale trunk (white bark, the one
 *  non-green trunk in the world) under three narrow yellow-green
 *  tiers. Total 4.70, the tallest of the three, and the narrowest
 *  (1.15). The three totals (oak 3.60 / pine 4.44 / birch 4.70) are
 *  deliberately distinct so a buffer probe can tell the shapes apart
 *  by height alone, after subtracting the heightfield at the tile. */
export const BIRCH_TIERS: TreeTier[] = [
  { w: 0.22, h: 2.3, y0: 0, color: [0.85, 0.83, 0.76] },
  { w: 1.15, h: 1.0, y0: 2.15, color: [0.32, 0.48, 0.2] },
  { w: 0.9, h: 0.9, y0: 3.05, color: [0.36, 0.52, 0.22] },
  { w: 0.6, h: 0.9, y0: 3.8, color: [0.4, 0.55, 0.24] },
];
export const BIRCH_TOTAL_H = 4.7;

export const TREE_SHAPES: Record<TreeShapeId, TreeTier[]> = {
  pine: TREE_TIERS,
  oak: OAK_TIERS,
  birch: BIRCH_TIERS,
};

/** Total height of a shape (last tier's top), for asserts/probes. */
export function treeShapeHeight(shape: TreeShapeId): number {
  const tiers = TREE_SHAPES[shape];
  const last = tiers[tiers.length - 1];
  return last.y0 + last.h;
}

/** Which shape grows on a tile: a hash of the tile, so the same tile
 *  always grows the same tree. Split ~45% pine / ~33% oak / ~22%
 *  birch — pine stays the common tree (it is the shape the world has
 *  always had), oak the broadleaf second, birch the rarer slim one.
 *  The salt (11/7) is chosen so the band does not collide with the
 *  flower (41), pebble (53), or bush (91) bands — a tile's tree
 *  shape, flower, pebble, and bush are independent draws. */
export function treeShapeForTile(tx: number, ty: number): TreeShapeId {
  const h = hash2(tx * 3.7 + 11, ty * 9.1 + 7);
  if (h < 0.45) return 'pine';
  if (h < 0.78) return 'oak';
  return 'birch';
}

// ---------------------------------------------------------------------------
// Generated bushes
// ---------------------------------------------------------------------------

/** Fraction of eligible grass tiles carrying a generated bush. At
 *  0.015 the ±64 detail range holds ~200-300 bushes — visible
 *  undergrowth without rivalling the trees. A bush is 2 boxes
 *  (20 tris); the whole population costs ~6k tris, paid for by the
 *  crate shapes getting cheaper (a pine tree was 32 tris; a crate
 *  box is 20, a lamp ~28 — see the view's crateAt). */
export const BUSH_DENSITY = 0.015;

/** True when a tile grows a generated bush. Pure tile hash (salt 91),
 *  independent of the tree-shape (11), flower (41), pebble (53),
 *  tuft, and scatter bands. Presence alone says nothing about
 *  blocking: generated bushes NEVER block — the view emits them in
 *  the render loop only, and no walkability function consults this. */
export function generatedBushAt(x: number, y: number): boolean {
  return hash2(x * 5.3 + 91, y * 9.1 + 57) < BUSH_DENSITY;
}

export interface BushParams {
  /** Tile-local offsets of the two blobs. */
  ox1: number; oz1: number; ox2: number; oz2: number;
  /** Overall scale (0.85–1.15) so neighbouring bushes differ. */
  scale: number;
  /** Green jitter (0–1) for the two blob colours. */
  g1: number; g2: number;
}

/** Seeded per-tile bush variation (same salt family as the presence
 *  check, so a bush's look is as stable as its presence). */
export function bushParamsForTile(x: number, y: number): BushParams {
  const h = (salt: number): number => hash2(x * 3.7 + salt, y * 11.3 + salt * 1.9);
  return {
    ox1: (h(1) - 0.5) * 0.16, oz1: (h(2) - 0.5) * 0.16,
    ox2: (h(3) - 0.5) * 0.3, oz2: (h(4) - 0.5) * 0.3,
    scale: 0.85 + h(5) * 0.3,
    g1: h(6), g2: h(7),
  };
}

// ---------------------------------------------------------------------------
// Town-prop crate kinds
// ---------------------------------------------------------------------------

/** What a world.crates entry really is. The 3D adapter
 *  (applyMosslightTownLayout) derives this from the layout generator's
 *  prop kinds — the crate list itself only ever held {tx, ty}, which
 *  is why every prop rendered as a pine tree. 'crate' is the default:
 *  the four authored crates and any crate with no recorded kind render
 *  as a plain wooden crate box. 'stall' never appears here (stall
 *  props become world.stalls, with their own shape); it is in the
 *  union only so propKindToCrateKind can be total over PropKind. */
export type CratePropKind =
  | 'crate' | 'lamp' | 'barrel' | 'hedge' | 'fountain' | 'well'
  | 'statue' | 'gatehouse' | 'cart' | 'windmill' | 'stall';
export const CRATE_PROP_KINDS: CratePropKind[] = [
  'crate', 'lamp', 'barrel', 'hedge', 'fountain', 'well',
  'statue', 'gatehouse', 'cart', 'windmill', 'stall',
];

/** Map a layout-generator prop kind (townLayout.ts PropKind) to the
 *  crate kind the renderer draws. 'watermill' has no prop of its own
 *  in the generated town (the kind exists in the type only) — it
 *  reads as the windmill tower, the closest honest shape. Anything
 *  unrecognised is a plain crate, never a tree. */
export function propKindToCrateKind(kind: string): CratePropKind {
  switch (kind) {
    case 'lamp': return 'lamp';
    case 'barrel': return 'barrel';
    case 'hedge': return 'hedge';
    case 'fountain': return 'fountain';
    case 'well': return 'well';
    case 'statue': return 'statue';
    case 'gatehouse': return 'gatehouse';
    case 'cart': return 'cart';
    case 'windmill': case 'watermill': return 'windmill';
    case 'stall': return 'stall';
    default: return 'crate';
  }
}

/** Build the "x,y" -> kind map for one adapter pass from the layout
 *  props that became crates. Stall props are NOT in here (they become
 *  world.stalls); the caller skips them before calling. */
export function crateKindsForProps(
  props: Array<{ x: number; y: number; kind: string }>,
): Record<string, CratePropKind> {
  const out: Record<string, CratePropKind> = {};
  for (const p of props) out[`${p.x},${p.y}`] = propKindToCrateKind(p.kind);
  return out;
}
