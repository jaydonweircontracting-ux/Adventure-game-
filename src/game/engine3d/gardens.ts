// BUILD 1050 — Ashfall Stage 4 architecture: GENERATED gardens.
//
// Pure module (no React, no WebGL, no I/O), so it is safe for the
// sim/test import graphs. The Stage 1 audit's architecture finding
// (§1.3): houses sit on bare grass with no boundary, garden, or
// path to the door. This module is the data side of the fix; the
// view renders the fences + plants, and walkability (placements.ts)
// blocks the fence tiles, so the garden is a real fenced patch, not
// paint.
//
// A garden is a fenced 3x2 planted patch beside a GENERATED town
// house (world.huts only — a placed house gets its fence from the
// 1042 Fence property helper, which the player taps). Determinism
// rule (the whole stage stands on it): existence, side, offset, and
// plants are pure functions of the house's SEED rect (the 1006 rule
// — a moved hut keeps its original origin, so its garden travels
// with it), while the geometry is built on the CURRENT rect, so the
// garden sits beside the house where it actually stands. A reload
// shows the same gardens; a move carries the garden along.
//
// The fence is the patch's 1-tile ring, minus the tiles the house
// wall itself closes (the ring row that falls inside the hut), minus
// anything that cannot hold a fence (a path, water, a tree, another
// building, an NPC route, a door or exit tile). The gate gap is the
// ring tile nearest the house's door, so the door leads into the
// garden — the 1042 gate-gap rule, generated instead of tapped.
// Plants are bushes (the 1049 vocabulary, walk-through decor) on
// about half the patch tiles, so the patch reads as planted, not
// bare. A side whose patch does not fit cleanly is skipped, and the
// next side (in hash order) is tried; a house with no fitting side
// has no garden — nothing is forced onto a road or another lot.
//
// PERFORMANCE (BUILD 1050, measured): a rebuild computes the gardens
// ~100 times — the world builder calls gardenFencesFor /
// gardenPlantsFor / blockedTiles once per 4-row strip, and each of
// those recomputed every garden from scratch, 41,000 tileClear calls
// per rebuild, tileClear alone 26% of rebuild CPU (rebuild p50
// 178ms -> 310ms, +74%, over the +25% Stage 1 budget). Two fixes:
// (1) tileClear reads precomputed lookup sets instead of re-scanning
// the world's arrays (and re-allocating hutDoor/hutExitPoint objects)
// on every tile; (2) gardensFor is memoized per world, validated by
// a rolling hash over everything a garden depends on, so the
// 100 calls per rebuild cost one computation + 99 fingerprint checks.
// The fingerprint itself then proved to be the hot spot: the terrain
// record (1,328 keys) was re-hashed per character on EVERY call,
// including every walkability check — 135.9 us per memo-hit call,
// worldGardenKey 59.5% of live-walk CPU, town walk max frame 700ms
// vs pristine 1049's 200ms. A cached terrain sub-hash did not fix
// it either: validating the cache still costs an Object.keys or
// for..in enumeration (46–65 us/call). So the terrain record left
// the key entirely — it cannot change in play without one of the
// hashed inputs changing too (see the worldGardenKey contract) —
// and the memo-hit cost is now ~4 us/call (a few hundred mixes).

import { hash2 } from './townLook';
import { hutDoor, hutExitPoint } from './interiors';
import { terrainAt, type HutRect, type IsoWorld } from '../iso/isoWorld';

export interface GardenTile { x: number; y: number; }

export interface Garden {
  /** The planted patch (3x2, walk-through bushes inside). */
  patch: { x0: number; y0: number; x1: number; y1: number };
  /** Fence tiles around the patch (blocking, like a placed fence). */
  fences: GardenTile[];
  /** Planted tiles inside the patch (bushes, non-blocking). */
  plants: GardenTile[];
  /** The gate gap — the one ring tile left open, nearest the door. */
  gate: GardenTile;
}

/** Share of town houses that get a garden (seeded, ~half). */
export const GARDEN_SHARE = 0.5;
/** Most fence tiles a garden may lay (a 3x2 patch rings 11). */
export const GARDEN_MIN_FENCES = 8;

type Side = 'south' | 'east' | 'north' | 'west';
const SIDES: Side[] = ['south', 'east', 'north', 'west'];

function rectEqual(a: HutRect, b: HutRect): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

/** The seed rect for a hut's garden: a moved hut keeps its ORIGINAL
 *  rect's garden (the 1006 rule, read straight off w.movedHuts so
 *  this module never imports placements.ts — that would be a cycle:
 *  placements.ts imports this module for walkability). */
export function gardenSeedRect(w: IsoWorld, hut: HutRect): HutRect {
  return (w.movedHuts ?? []).find((m) => rectEqual(m.to, hut))?.from ?? hut;
}

/** True when a tile can hold garden fence or a plant: bare grass,
 *  inside the map, holding nothing — no building, stall, tree, rock,
 *  crate, wall, placed item, NPC spawn or waypoint, player start,
 *  or any house's door or exit tile (the door must stay reachable). */
/**
 * Precomputed lookup sets for one garden computation. tileClear used
 * to re-scan the world's arrays — huts (with a hutDoor + hutExitPoint
 * object allocated per hut per tile), trees, crates, NPC spawns with
 * their waypoint arrays — on EVERY tile it tested. Building the sets
 * once per gardensFor call turns each test into a few Set lookups.
 * Keys are numeric (x * 4096 + y); tileClear rejects out-of-bounds
 * tiles first, so both coordinates are in [0, 4096).
 */
interface GardenContext {
  blocked: Set<number>;
}
function tileKey(x: number, y: number): number {
  return x * 4096 + y;
}
function buildGardenContext(w: IsoWorld): GardenContext {
  const blocked = new Set<number>();
  const add = (x: number, y: number): void => { blocked.add(tileKey(x, y)); };
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
  return { blocked };
}

function tileClearCtx(ctx: GardenContext, w: IsoWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= w.w || y >= w.h) return false;
  if (terrainAt(w, x, y) !== 'grass') return false;
  return !ctx.blocked.has(tileKey(x, y));
}

/** The 3x2 patch on one side of the hut, offset along the side by
 *  the seed hash (so neighbouring gardens do not line up). Null when
 *  the hut is too small for a 3-wide patch on that side. */
function patchOnSide(hut: HutRect, side: Side, off: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const w = hut.x1 - hut.x0 + 1, d = hut.y1 - hut.y0 + 1;
  if (side === 'south' || side === 'north') {
    if (w < 3) return null;
    const x0 = hut.x0 + Math.min(off, w - 3);
    const y0 = side === 'south' ? hut.y1 + 1 : hut.y0 - 2;
    return { x0, y0, x1: x0 + 2, y1: y0 + 1 };
  }
  if (d < 3) return null;
  const y0 = hut.y0 + Math.min(off, d - 3);
  const x0 = side === 'east' ? hut.x1 + 1 : hut.x0 - 2;
  return { x0, y0, x1: x0 + 1, y1: y0 + 2 };
}

/**
 * The garden for one hut, or null when the house has none (the seed
 * hash says no garden, or no side fits cleanly). The seed rect
 * (movedHuts `from`, else the hut itself) drives existence, side
 * order, and offset; the CURRENT rect drives the geometry.
 */
export function gardenForHut(hut: HutRect, w: IsoWorld, ctx: GardenContext | null = null): Garden | null {
  const seed = gardenSeedRect(w, hut);
  const h = (salt: number): number => hash2(seed.x0 * 3.1 + salt, seed.y0 * 7.7 + salt * 1.3);
  if (h(41) >= GARDEN_SHARE) return null;
  const clear = ctx ?? buildGardenContext(w);
  const door = hutDoor(hut);
  // Sides in hash order (a rotation of south/east/north/west), so
  // the tried-first side differs per house instead of every garden
  // landing on the same side of its house.
  const start = Math.floor(h(42) * SIDES.length) % SIDES.length;
  const order = SIDES.map((_, i) => SIDES[(start + i) % SIDES.length]);
  const spanAlong = (side: Side): number => (side === 'south' || side === 'north' ? hut.x1 - hut.x0 + 1 : hut.y1 - hut.y0 + 1);
  for (const side of order) {
    const span = spanAlong(side);
    if (span < 3) continue;
    const off = Math.floor(h(43) * Math.max(1, span - 2));
    const patch = patchOnSide(hut, side, off);
    if (!patch) continue;
    // Every patch tile must be clear ground (the plants need soil).
    let patchOk = true;
    for (let y = patch.y0; y <= patch.y1 && patchOk; y++) {
      for (let x = patch.x0; x <= patch.x1; x++) {
        if (!tileClearCtx(clear, w, x, y)) { patchOk = false; break; }
      }
    }
    if (!patchOk) continue;
    // The ring: every tile at Chebyshev distance exactly 1 from the
    // patch that is clear ground. Tiles inside a hut (the ring row
    // the house wall closes) are not clear, so they drop out here.
    const ring: GardenTile[] = [];
    for (let y = patch.y0 - 1; y <= patch.y1 + 1; y++) {
      for (let x = patch.x0 - 1; x <= patch.x1 + 1; x++) {
        if (x >= patch.x0 && x <= patch.x1 && y >= patch.y0 && y <= patch.y1) continue;
        if (tileClearCtx(clear, w, x, y)) ring.push({ x, y });
      }
    }
    if (ring.length < GARDEN_MIN_FENCES + 1) continue;
    // The gate is the ring tile nearest the door (Manhattan) — but
    // ONLY among the ring tiles that share an EDGE with the patch.
    // A corner ring tile touches the patch diagonally, and movement
    // is four-directional, so a corner gate seals the garden: the
    // player can reach the gate but can never step onto a plant tile
    // (4 of the first 11 gardens had exactly this defect — the gate
    // was reachable, the plants were not). If no edge-sharing ring
    // tile exists, this side does not fit.
    const edgeRing = ring.filter((t) =>
      (t.x >= patch.x0 && t.x <= patch.x1 && (t.y === patch.y0 - 1 || t.y === patch.y1 + 1)) ||
      (t.y >= patch.y0 && t.y <= patch.y1 && (t.x === patch.x0 - 1 || t.x === patch.x1 + 1)));
    if (edgeRing.length === 0) continue;
    edgeRing.sort((a, b) => (Math.abs(a.x - door.x) + Math.abs(a.y - door.y)) - (Math.abs(b.x - door.x) + Math.abs(b.y - door.y)));
    const gate = edgeRing[0];
    const fences = ring.filter((t) => !(t.x === gate.x && t.y === gate.y));
    if (fences.length < GARDEN_MIN_FENCES) continue;
    // Plants: about half the patch tiles, by a tile hash independent
    // of the garden salts (salt 51), so the planted pattern differs
    // per garden but is stable per tile.
    const plants: GardenTile[] = [];
    for (let y = patch.y0; y <= patch.y1; y++) {
      for (let x = patch.x0; x <= patch.x1; x++) {
        if (hash2(x * 3.7 + 51, y * 11.3 + 51) < 0.5) plants.push({ x, y });
      }
    }
    if (plants.length === 0) plants.push({ x: patch.x0 + 1, y: patch.y0 });
    return { patch, fences, plants, gate };
  }
  return null;
}

/**
 * A rolling hash over EVERYTHING a garden depends on, so the memo
 * below can tell a changed world from an unchanged one. The world
 * object is mutated in place during play (placements added, huts
 * moved, terrain edited), so identity alone cannot cache — but
 * every mutation that could move a garden changes one of these
 * inputs: hut rects + doors, moved-hut records, trees/rocks/crates/
 * walls/stalls, placed-item rects, NPC spawns + waypoints, the
 * player start, the map size, and the seven removal-tracking
 * arrays (removedHuts/removedPaths/removedWater/removedWalls/
 * removedTrees/removedRocks/removedCrates). FNV-1a over the values.
 *
 * THE TERRAIN RECORD IS DELIBERATELY NOT HASHED. It was the first
 * design (a full per-character hash over its 1,328 keys), and the
 * phone probe proved it unusable: 135.9 us per memo-hit call, 59.5%
 * of live-walk CPU, town walk max frame 700ms vs pristine 1049's
 * 200ms — and even the cheap-looking validation (Object.keys().length
 * or a for..in count) costs 46–65 us/call on this VM, because
 * enumerating 1,328 keys is the cost, not the mixing. The record
 * does not need hashing, because it cannot change without one of
 * the hashed inputs changing too:
 * - Authored terrain (paths, lakes, coast) is fixed at generation.
 * - Load-time painting (Engine3DWorldView 250/267) runs before the
 *   first gardensFor on that object, and loadWorld() returns a
 *   fresh object per mount, so a mode switch starts a fresh memo.
 * - Every in-play terrain mutation is paired with a mutation of a
 *   hashed or tracked array: generated-path/water removal deletes
 *   the key AND pushes removedPaths/removedWater (placements.ts
 *   removeGeneratedAt/removeGeneratedWaterAt); every undo/redo of
 *   those filters or pushes the same arrays (unpath/unwater/
 *   moveGenPath); hut removal replaces w.huts AND pushes
 *   removedHuts; tree/rock/crate/wall removal splices the hashed
 *   array AND pushes removedTrees/removedRocks/removedCrates/
 *   removedWalls; path placement/moves push a placed path item
 *   into w.placements (and the placed item itself blocks the tile
 *   in buildGardenContext, so the garden dissolves or moves).
 *   AREA SELECT's lift/place does the same pairing (areaSelect.ts
 *   453/569). The removed-* arrays ARE the terrain's change log —
 *   hashing them is hashing the terrain's mutations.
 * - The 2.5D world editor (IsoRoom.tsx) paints terrain directly,
 *   but it edits a different world object than the 3D view loads.
 * CONTRACT: any future code that writes w.terrain directly MUST
 * also mutate one of the hashed inputs (a tracked removed-* array
 * is the right one for a pure terrain edit), or gardens will go
 * stale until the next hashed change or reload. The asserts' memo
 * test pins the removedPaths hook.
 */
function worldGardenKey(w: IsoWorld): number {
  let h = 2166136261 >>> 0;
  const mix = (n: number): void => { h ^= (n | 0); h = Math.imul(h, 16777619); };
  const mixStr = (s: string): void => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); };
  mix(w.w); mix(w.h);
  for (const hut of w.huts) { mix(hut.x0); mix(hut.y0); mix(hut.x1); mix(hut.y1); mix(hut.doorX ?? -1); mix(hut.doorY ?? -1); }
  for (const m of w.movedHuts ?? []) {
    mix(m.from.x0); mix(m.from.y0); mix(m.from.x1); mix(m.from.y1);
    mix(m.to.x0); mix(m.to.y0); mix(m.to.x1); mix(m.to.y1);
  }
  for (const t of w.trees) { mix(t.tx); mix(t.ty); }
  for (const r of w.rocks) { mix(r.tx); mix(r.ty); }
  for (const c of w.crates) { mix(c.tx); mix(c.ty); }
  for (const wl of w.walls) { mix(wl.x); mix(wl.y); }
  for (const s of w.stalls) { mix(s.x0); mix(s.y0); mix(s.x1); }
  for (const p of w.placements ?? []) { mix(p.x0); mix(p.y0); mix(p.x1); mix(p.y1); }
  for (const s of w.npcSpawns ?? []) {
    mix(Math.round(s.x)); mix(Math.round(s.y));
    for (const wp of s.waypoints ?? []) { mix(wp.tx); mix(wp.ty); }
  }
  if (w.playerStart) { mix(w.playerStart.tx); mix(w.playerStart.ty); }
  // The terrain's change log (see the contract above): every in-play
  // terrain mutation pushes or filters one of these, so a garden
  // that a removed path/water tile would dissolve is recomputed.
  for (const r of w.removedHuts ?? []) { mix(r.x0); mix(r.y0); mix(r.x1); mix(r.y1); }
  for (const k of w.removedPaths ?? []) mixStr(k);
  for (const k of w.removedWater ?? []) mixStr(k);
  for (const k of w.removedWalls ?? []) mixStr(k);
  for (const k of w.removedTrees ?? []) mixStr(k);
  for (const k of w.removedRocks ?? []) mixStr(k);
  for (const k of w.removedCrates ?? []) mixStr(k);
  return h >>> 0;
}

interface GardensMemo {
  key: number;
  gardens: Garden[];
  fences: GardenTile[];
  plants: GardenTile[];
  fenceSet: Set<number>;
}
const gardensMemo = new WeakMap<IsoWorld, GardensMemo>();
function gardensMemoFor(w: IsoWorld): GardensMemo {
  const key = worldGardenKey(w);
  const hit = gardensMemo.get(w);
  if (hit && hit.key === key) return hit;
  // One shared lookup context for every hut (see buildGardenContext).
  const ctx = buildGardenContext(w);
  const gardens: Garden[] = [];
  for (const hut of w.huts) {
    const g = gardenForHut(hut, w, ctx);
    if (g) gardens.push(g);
  }
  const fences: GardenTile[] = [];
  const plants: GardenTile[] = [];
  const fenceSet = new Set<number>();
  for (const g of gardens) {
    for (const f of g.fences) { fences.push(f); fenceSet.add(tileKey(f.x, f.y)); }
    for (const p of g.plants) plants.push(p);
  }
  const memo: GardensMemo = { key, gardens, fences, plants, fenceSet };
  gardensMemo.set(w, memo);
  return memo;
}

/** Every garden in the world (generated huts only), in hut order.
 *  Memoized per world (validated by worldGardenKey): a rebuild asks
 *  for the gardens ~100 times, and recomputing them each time was
 *  the +74% rebuild regression. Callers must not mutate the returned
 *  array (gardenFencesFor/gardenPlantsFor copy it). */
export function gardensFor(w: IsoWorld): Garden[] {
  return gardensMemoFor(w).gardens;
}

/** Every garden fence tile in the world, for rendering. */
export function gardenFencesFor(w: IsoWorld): GardenTile[] {
  return [...gardensMemoFor(w).fences];
}

/** Every garden planted tile in the world, for rendering (bushes). */
export function gardenPlantsFor(w: IsoWorld): GardenTile[] {
  return [...gardensMemoFor(w).plants];
}

/** True when (x, y) holds a garden fence. The hut scan rejects
 *  fast: a garden extends at most 4 tiles from its hut's rect
 *  (patch 2 deep + ring 1 + the side offset stays inside the rect),
 *  so huts whose expanded box misses the tile never pay for the
 *  fence-set lookup. This runs inside walkableWithPlacements
 *  (player steps, NPC steps, pathfinding), so the cheap reject is
 *  load-bearing. The fence set itself is memoized with the gardens,
 *  so a walkability check costs one fingerprint + one Set lookup,
 *  never a garden recomputation. */
export function isGardenFenceTile(w: IsoWorld, x: number, y: number): boolean {
  for (const hut of w.huts) {
    if (x < hut.x0 - 4 || x > hut.x1 + 4 || y < hut.y0 - 4 || y > hut.y1 + 4) continue;
    return gardensMemoFor(w).fenceSet.has(tileKey(x, y));
  }
  return false;
}
