// BUILD 1051 — Ashfall Stage 5 settlements: the market, readable
// districts, and fixed wild landmarks.
//
// Pure module (no React, no WebGL, no I/O), so it is safe for the
// sim/test import graphs. The Stage 1 audit's settlements findings
// (~/workspace/verify1030/ASHFALL-STAGE1.md §1.4 + Stage 5): the town
// is a 61x125 ribbon with 0 generated stalls (no market), and the
// wilderness is empty by design (no ruins, landmarks, camps, or POIs
// past the town). This module is the data side of the fix; the view
// renders the stalls/landmarks/paving, and walkability (isoWorld.ts)
// blocks the stall + landmark tiles, so the market and the landmarks
// are real geometry, not paint.
//
// Determinism rule (the whole stage stands on it): every assignment
// is a pure function of the world (or a fixed constant), so a reload
// shows the same market, the same districts, and the same landmarks
// — never random per frame, never random per rebuild. The market
// stalls are placed by a fixed scan order over verified-clear tiles,
// so a player edit (a placed stall, a removed path) moves them to the
// next clear spot instead of forcing one onto a road.

import { hash2 } from './townLook';
import { gardensFor } from './gardens';
import { hutDoor, hutExitPoint } from './interiors';
import { terrainAt, type HutRect, type IsoWorld } from '../iso/isoWorld';

// ---------------------------------------------------------------------------
// The plaza (fixed by the layout, seed 4242 — asserted against
// mosslightEngineChunkLayout in the 1051 asserts, never assumed).
// ---------------------------------------------------------------------------

/** The town square's centre tile (the statue stands here). */
export const PLAZA_CENTER = { x: 102, y: 102 };
/** The plaza disc radius in tiles (layout r=13 * adapter scale 0.42). */
export const PLAZA_RADIUS = 5.46;

// ---------------------------------------------------------------------------
// Market stalls
// ---------------------------------------------------------------------------

/** How many GENERATED stalls the market holds, beside the blueprint
 *  stall the prop loop restores — 3 stalls total, the Stage 5
 *  acceptance (>=3 stalls at the plaza rendering as stalls). */
export const MARKET_GENERATED_STALLS = 2;

/** A generated market stall: a 2x1 rect like every other stall
 *  (world.stalls entries are {x0,y0,x1}, tap + east). */
export interface MarketStall { x0: number; y0: number; x1: number; }

/** Tiles a market stall may never cover, in one lookup set (the
 *  gardens.ts buildGardenContext pattern — one pass over the world's
 *  arrays, then Set lookups, never a re-scan per tile). A stall must
 *  not land on a garden either: gardens are computed from huts, and
 *  a stall on a garden tile would dissolve that garden on the next
 *  memo recompute (stalls are in the garden memo key). */
interface StallContext {
  blocked: Set<number>;
}
function stallTileKey(x: number, y: number): number {
  return x * 4096 + y;
}
function buildStallContext(w: IsoWorld): StallContext {
  const blocked = new Set<number>();
  const add = (x: number, y: number): void => { blocked.add(stallTileKey(x, y)); };
  for (const h of w.huts) {
    for (let x = h.x0; x <= h.x1; x++) for (let y = h.y0; y <= h.y1; y++) add(x, y);
    const d = hutDoor(h);
    add(d.x, d.y);
    const e = hutExitPoint(h);
    add(e.x, e.y);
  }
  for (const s of w.stalls) for (let x = s.x0; x <= s.x1; x++) add(x, s.y0);
  for (const t of w.trees) add(t.tx, t.ty);
  for (const r of w.rocks) add(r.tx, r.ty);
  for (const c of w.crates) add(c.tx, c.ty);
  for (const wl of w.walls) add(wl.x, wl.y);
  for (const p of w.placements ?? []) {
    for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) add(x, y);
  }
  for (const s of w.npcSpawns ?? []) {
    add(Math.round(s.x), Math.round(s.y));
    for (const wp of s.waypoints ?? []) add(wp.tx, wp.ty);
  }
  if (w.playerStart) add(w.playerStart.tx, w.playerStart.ty);
  // Gardens: the fence ring + the planted patch are town geometry
  // too — a stall never sits on one (the garden memo would dissolve
  // it, and a stall on a planted tile reads as a stall in a bush).
  for (const g of gardensFor(w)) {
    for (const f of g.fences) add(f.x, f.y);
    for (const p of g.plants) add(p.x, p.y);
    for (let y = g.patch.y0; y <= g.patch.y1; y++) {
      for (let x = g.patch.x0; x <= g.patch.x1; x++) add(x, y);
    }
  }
  return { blocked };
}

/** True when a 2-wide stall may stand with its west tile at (x0, y0):
 *  both tiles in the map, on sand (the square) or grass (the verge
 *  just south of it) — never dirt (a road), never water — and clear
 *  of everything in the context. A stall on a road would block
 *  travel; the generator's own row guards (BUILD 759) rejected two
 *  of its three stalls for exactly this reason, so the check is the
 *  same rule, applied in 3D. */
export function marketStallClear(w: IsoWorld, x0: number, y0: number, ctx: StallContext | null = null): boolean {
  const clear = ctx ?? buildStallContext(w);
  for (let x = x0; x <= x0 + 1; x++) {
    if (x < 0 || y0 < 0 || x >= w.w || y0 >= w.h) return false;
    const t = terrainAt(w, x, y0);
    if (t !== 'sand' && t !== 'grass') return false;
    if (clear.blocked.has(stallTileKey(x, y0))) return false;
  }
  return true;
}

/** The generated market stalls: up to MARKET_GENERATED_STALLS 2x1
 *  rects on the blueprint stall's row, flanking it — west first,
 *  then east, scanning outward in fixed 2-tile steps, so the market
 *  is one compact row (the generator's BUILD 759 intent: a compact
 *  row at the central town fork, not stalls scattered around the
 *  plaza perimeter). The blueprint stall is the anchor: the row is
 *  its y0, and the scan starts at its edges. A side with no clear
 *  spot contributes nothing — nothing is forced onto a road, a
 *  garden, or a doorstep. The caller (the adapter) stamps the
 *  returned rects into world.stalls, after the prop loop has
 *  restored the blueprint stall. Deterministic: the scan order is
 *  fixed and the world is fixed, so a reload shows the same row;
 *  a player edit that occupies a spot shifts the row to the next
 *  clear one instead of overlapping it. */
export function marketStallSpots(w: IsoWorld): MarketStall[] {
  const near = w.stalls.filter((s) => Math.hypot((s.x0 + s.x1) / 2 - PLAZA_CENTER.x, s.y0 - PLAZA_CENTER.y) <= 15);
  if (near.length === 0) return [];
  const rowY = near[0].y0;
  // All market stalls share one row (asserted) — the scan anchors
  // on the row's outer edges, not on any one stall.
  const minX0 = Math.min(...near.map((s) => s.x0));
  const maxX1 = Math.max(...near.map((s) => s.x1));
  const ctx = buildStallContext(w);
  const out: MarketStall[] = [];
  // One per side — the NEAREST clear spot on each side — so the
  // market is one compact row flanking the blueprint stall. (The
  // first draft filled the whole quota from the west alone and put
  // the second stall at (92,108), past the store — a stall marooned
  // away from the market, not a row. One per side is the fix.)
  for (let x0 = minX0 - 2; x0 >= PLAZA_CENTER.x - 14; x0 -= 2) {
    if (marketStallClear(w, x0, rowY, ctx)) { out.push({ x0, y0: rowY, x1: x0 + 1 }); break; }
  }
  for (let x0 = maxX1 + 1; x0 <= PLAZA_CENTER.x + 14; x0 += 2) {
    if (marketStallClear(w, x0, rowY, ctx)) { out.push({ x0, y0: rowY, x1: x0 + 1 }); break; }
  }
  return out.slice(0, MARKET_GENERATED_STALLS);
}

// ---------------------------------------------------------------------------
// Districts
// ---------------------------------------------------------------------------

/** The four town districts + the wild. A district is a reading of
 *  the town that already exists — the market square, the commercial
 *  buildings, the mill field, the house streets — not a rebuild:
 *  no house moves, no footprint changes, only the ground under them
 *  is named. */
export type DistrictId = 'market' | 'craft' | 'farm' | 'residential' | 'wild';
export const DISTRICT_IDS: DistrictId[] = ['market', 'craft', 'farm', 'residential', 'wild'];

/** The craft/workshop district: the bounding rect of the 1015
 *  commercial buildings (inn [90,101]-[95,105], store [94,107]-
 *  [98,110], smith [105,94]-[109,97]) expanded by 2 tiles. A mine
 *  the player places joins it by variant (see districtAt). */
export const CRAFT_RECT = { x0: 88, y0: 92, x1: 111, y1: 112 };
/** The farm/mill district: the windmill prop's tile (141,99,
 *  asserted against the layout) plus a 5-tile margin, so the mill
 *  field reads as one place. Placed farm land extends it (see
 *  districtAt). */
export const FARM_RECT = { x0: 136, y0: 94, x1: 146, y1: 104 };
/** The windmill prop's tile — the farm district's anchor. */
export const WINDMILL_TILE = { x: 141, y: 99 };
/** How far past the plaza disc the market square reads (the disc
 *  itself is sand; the margin covers the stall row and the square's
 *  edge, so the stalls classify as market, not residential). */
export const MARKET_MARGIN = 2;
/** How far from a house a tile still reads as a residential street. */
export const RESIDENTIAL_HALO = 6;
/** How far from a placed farm tile the farm district extends. */
export const FARM_HALO = 2;

function hutVariantOf(w: IsoWorld, hut: HutRect): string | null {
  return (hut as { variant?: string }).variant ?? null;
}

function placedHutVariantOf(w: IsoWorld, x: number, y: number): string | null {
  for (const p of w.placements ?? []) {
    if (p.kind !== 'house' || !p.variant) continue;
    if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return p.variant;
  }
  return null;
}

/** Which district a tile reads as. Precedence is load-bearing and
 *  asserted: a hut's own variant wins first (the inn, store, and
 *  smith sit inside the market disc's margin, but their tiles are
 *  craft, not market), then the market disc, then the craft rect,
 *  then the farm rect / farm halo, then the residential halo around
 *  any house, then the wild. Every tile classifies as exactly one
 *  district — the function returns one id, never two. */
export function districtAt(w: IsoWorld, x: number, y: number): DistrictId {
  const hut = w.huts.find((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  if (hut) {
    const v = hutVariantOf(w, hut);
    if (v === 'inn' || v === 'store' || v === 'smith' || v === 'mine') return 'craft';
    if (v === 'windmill') return 'farm';
    return 'residential';
  }
  const pv = placedHutVariantOf(w, x, y);
  if (pv) {
    if (pv === 'inn' || pv === 'store' || pv === 'smith' || pv === 'mine') return 'craft';
    if (pv === 'windmill') return 'farm';
    return 'residential';
  }
  if (Math.hypot(x + 0.5 - PLAZA_CENTER.x, y + 0.5 - PLAZA_CENTER.y) <= PLAZA_RADIUS + MARKET_MARGIN) return 'market';
  if (x >= CRAFT_RECT.x0 && x <= CRAFT_RECT.x1 && y >= CRAFT_RECT.y0 && y <= CRAFT_RECT.y1) return 'craft';
  if (x >= FARM_RECT.x0 && x <= FARM_RECT.x1 && y >= FARM_RECT.y0 && y <= FARM_RECT.y1) return 'farm';
  for (const p of w.placements ?? []) {
    if (p.kind !== 'farm') continue;
    if (x >= p.x0 - FARM_HALO && x <= p.x1 + FARM_HALO && y >= p.y0 - FARM_HALO && y <= p.y1 + FARM_HALO) return 'farm';
  }
  for (const h of w.huts) {
    if (x >= h.x0 - RESIDENTIAL_HALO && x <= h.x1 + RESIDENTIAL_HALO && y >= h.y0 - RESIDENTIAL_HALO && y <= h.y1 + RESIDENTIAL_HALO) return 'residential';
  }
  for (const p of w.placements ?? []) {
    if (p.kind !== 'house') continue;
    if (x >= p.x0 - RESIDENTIAL_HALO && x <= p.x1 + RESIDENTIAL_HALO && y >= p.y0 - RESIDENTIAL_HALO && y <= p.y1 + RESIDENTIAL_HALO) return 'residential';
  }
  return 'wild';
}

// ---------------------------------------------------------------------------
// District paving (cobble)
// ---------------------------------------------------------------------------

/** Share of eligible market-square tiles carrying a cobble slab. */
export const COBBLE_DENSITY_MARKET = 0.55;
/** Share of eligible crafts-row tiles carrying a cobble slab. */
export const COBBLE_DENSITY_CRAFT = 0.45;
/** Cobble grey — clearly distinct from dirt tan, plaza sand, and
 *  grass green, and from the pebble grey (pebbles are small and
 *  sparse; a cobble slab covers most of its tile). */
export const COBBLE_COLOR: [number, number, number] = [0.42, 0.42, 0.4];

/** True when a tile carries a cobble paving slab: a dirt or sand
 *  tile in the market or craft district, by a tile hash (salt 71 —
 *  clear of the tree-shape (11), flower (41), pebble (53), bush
 *  (91), and garden (41/42/43/51) bands, so a tile's cobble is an
 *  independent draw). Cobble is ground dressing only: it never
 *  blocks, never saves, and renders window-only like the flowers
 *  and pebbles (the 1009 limit — a slab popping at the +/-22 edge
 *  is one slab appearing, not a chunk regenerating). The caller
 *  (the ground-detail loop) already skips blocked tiles, so no
 *  cobble ever sits under a stall, a crate, a house, or a landmark;
 *  decor tiles (the statue, the fountain) are excluded by the
 *  caller too, so no slab clips through a plinth. */
export function cobbleForTile(w: IsoWorld, x: number, y: number): boolean {
  const d = districtAt(w, x, y);
  if (d !== 'market' && d !== 'craft') return false;
  const t = terrainAt(w, x, y);
  if (t !== 'dirt' && t !== 'sand') return false;
  const density = d === 'market' ? COBBLE_DENSITY_MARKET : COBBLE_DENSITY_CRAFT;
  return hash2(x * 3.1 + 71, y * 7.7 + 71) < density;
}

// ---------------------------------------------------------------------------
// Wild landmarks
// ---------------------------------------------------------------------------

/** A fixed wild landmark: a named, permanent feature out in the
 *  wild, built from the existing box vocabulary (stone, timber,
 *  canvas — the same shapes as the town props). `blocks` are the
 *  solid tiles (walkability + placement + ground detail all read
 *  them); any tile inside the rect that is NOT in `blocks` stays
 *  walkable — the stone circle's centre is open ground you can
 *  stand in. `broken` (tower only) is the collapsed corner tile,
 *  rendered short with rubble. Positions are FIXED constants,
 *  verified clear by the design probe (grass, no lake, no wild
 *  obstacle, no road, no hut, no NPC route) and asserted in the
 *  1051 asserts — they never move, never randomise, and a reload
 *  shows the same landmarks. They are NOT removable (there is no
 *  removed-landmarks set — the generated-stall rule: a removed one
 *  would resurrect on reload) and NOT harvestable (E does nothing
 *  on them — they are fixtures, not resources). */
export type LandmarkKind = 'tower' | 'stones' | 'camp';
export const LANDMARK_KINDS: LandmarkKind[] = ['tower', 'stones', 'camp'];

export interface WildLandmark {
  kind: LandmarkKind;
  name: string;
  x0: number; y0: number; x1: number; y1: number;
  /** The solid tiles. `part` (camp only) says which piece of the
   *  landmark a tile is — 'tent' or 'firepit' — so the renderer
   *  draws the right shape without guessing from the position. */
  blocks: Array<{ x: number; y: number; part?: string }>;
  broken?: { x: number; y: number };
}

/** The three fixed wild landmarks. Distances from the plaza
 *  (102,102): the tower 92 tiles SW, the stones 74 NE, the camp
 *  70 E — all well outside the town (hut extent x 63-124, y 36-161)
 *  and all reachable by the 1030 tap-to-move A* (asserted). */
export const WILD_LANDMARKS: WildLandmark[] = [
  {
    kind: 'tower',
    name: 'The Ruined Tower',
    x0: 40, y0: 170, x1: 41, y1: 171,
    blocks: [{ x: 40, y: 170 }, { x: 41, y: 170 }, { x: 40, y: 171 }, { x: 41, y: 171 }],
    broken: { x: 41, y: 171 },
  },
  {
    kind: 'stones',
    name: 'The Standing Stones',
    x0: 148, y0: 46, x1: 152, y1: 50,
    blocks: [
      { x: 152, y: 48 }, { x: 151, y: 50 }, { x: 149, y: 50 },
      { x: 148, y: 48 }, { x: 149, y: 46 }, { x: 151, y: 46 },
    ],
  },
  {
    kind: 'camp',
    name: "The Hunter's Camp",
    x0: 165, y0: 130, x1: 166, y1: 131,
    blocks: [
      { x: 165, y: 130, part: 'tent' }, { x: 166, y: 130, part: 'tent' },
      { x: 165, y: 131, part: 'firepit' },
    ],
  },
];

/** Stamp the fixed landmarks into the world (a fresh deep copy —
 *  the adapter replaces whatever the save carried, so a landmark
 *  can never duplicate and never drift). Idempotent: call it on
 *  every load, like stampTownBuildings. */
export function stampLandmarks(w: IsoWorld): void {
  w.landmarks = WILD_LANDMARKS.map((l) => ({
    ...l,
    blocks: l.blocks.map((b) => ({ ...b })),
    broken: l.broken ? { ...l.broken } : undefined,
  }));
}

/** True when (x, y) is a solid landmark tile. */
export function landmarkBlockedAt(w: IsoWorld, x: number, y: number): boolean {
  for (const l of w.landmarks ?? []) {
    for (const b of l.blocks) if (b.x === x && b.y === y) return true;
  }
  return false;
}

/** The landmark (if any) whose solid tiles include (x, y). The
 *  IsoWorld field stores `kind` as a plain string (so the base
 *  model stays free of engine3d imports) — this re-narrows it to
 *  LandmarkKind on the way out. */
export function landmarkAt(w: IsoWorld, x: number, y: number): WildLandmark | null {
  for (const l of w.landmarks ?? []) {
    for (const b of l.blocks) {
      if (b.x === x && b.y === y) {
        return {
          kind: l.kind as LandmarkKind,
          name: l.name,
          x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1,
          blocks: l.blocks.map((bb) => ({ ...bb })),
          broken: l.broken ? { ...l.broken } : undefined,
        };
      }
    }
  }
  return null;
}
