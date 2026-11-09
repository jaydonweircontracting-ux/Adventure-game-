// BUILD 1015 — small ground detail for 3D mode: wildflowers + pebbles.
//
// The 3D world had three ground-detail kinds (street slabs, cobble
// squares, grass tufts — all window-only, all deterministic per tile).
// This module adds two more of the same family, for the "more details"
// polish: wildflowers on grass and flat pebbles on grass/dirt. Both
// are tiny (a flower is 4 tris, a pebble is 1 quad), deterministic per
// tile (integer hash, exact across engines — same principle as
// townLook.ts), and window-only like the tufts (the 1009 limit stands:
// small detail pops at the ±22 window edge; these are small enough
// that the pop is a single flower appearing, not a chunk regenerating).
// Blocked tiles are shared with grassTufts.blockedTiles, so detail
// never clips through houses, trees, rocks, crates, stalls, or walls.
// Colours avoid the forbidden lavender/pink family (asserted).
import { hash2, type Rgb } from './townLook';
import { blockedTiles } from './grassTufts';
import { wildObstacleAt, surfaceElevation } from './wildTerrain';
import { generatedBushAt } from './vegetation';
import { cobbleForTile, COBBLE_COLOR } from './settlements';
import type { IsoWorld, Terrain } from '../iso/isoWorld';

export type V3 = [number, number, number];

/** Fraction of eligible grass tiles carrying a wildflower (~36 in a
 *  full-grass 45x45 window, 4 tris each — ~150 verts, negligible). */
export const WILDFLOWER_DENSITY = 0.03;
/** Fraction of eligible grass/dirt tiles carrying a pebble (~56 in a
 *  full-grass window, 1 quad each — ~350 verts, negligible). */
export const PEBBLE_DENSITY = 0.04;

/** Flower head colours: yellow / white / red / orange. No lavender,
 *  no pink (the 980 bug look) — asserted via isLavenderPink. */
export const FLOWER_COLORS: Rgb[] = [
  [0.92, 0.8, 0.2],
  [0.95, 0.95, 0.9],
  [0.72, 0.22, 0.2],
  [0.9, 0.5, 0.2],
];
/** Flower stem green. */
export const FLOWER_STEM: Rgb = [0.25, 0.45, 0.2];
/** Lavender/pink guard (the 983 palette rule): no flower colour may
 *  read lavender or pink. Exported so the 1015 asserts can check it. */
export const isLavenderPink = (c: Rgb): boolean => c[0] > 0.55 && c[0] < 0.8 && c[1] < 0.75 && c[2] > 0.75;
/** Pebble grey range (shade multiplies the base). */
export const PEBBLE_GREY: Rgb = [0.5, 0.5, 0.48];

export interface Wildflower { ox: number; oz: number; color: Rgb; scale: number }
export interface Pebble { ox: number; oz: number; rot: number; size: number; shade: number }

export function wildflowerForTile(x: number, y: number): Wildflower | null {
  if (hash2(x * 3.1 + 41, y * 7.7 + 41) >= WILDFLOWER_DENSITY) return null;
  const h = (salt: number): number => hash2(x * 5.3 + salt, y * 9.1 + salt * 1.7);
  return {
    ox: (h(1) - 0.5) * 0.6,
    oz: (h(2) - 0.5) * 0.6,
    color: FLOWER_COLORS[Math.floor(h(3) * FLOWER_COLORS.length) % FLOWER_COLORS.length],
    scale: 0.8 + h(4) * 0.5,
  };
}

export function pebbleForTile(x: number, y: number): Pebble | null {
  if (hash2(x * 3.1 + 53, y * 7.7 + 53) >= PEBBLE_DENSITY) return null;
  const h = (salt: number): number => hash2(x * 5.3 + salt, y * 9.1 + salt * 1.7);
  return {
    ox: (h(1) - 0.5) * 0.6,
    oz: (h(2) - 0.5) * 0.6,
    rot: h(3) * Math.PI,
    size: 0.12 + h(4) * 0.16,
    shade: 0.75 + h(5) * 0.3,
  };
}

type TriV = (a: V3, ca: V3, b: V3, cb: V3, c: V3, cc: V3) => void;

function emitFlower(triV: TriV, f: Wildflower, originX: number, originZ: number, baseY = 0): void {
  const x = originX + f.ox, z = originZ + f.oz;
  const s = f.scale;
  const w = 0.05 * s, h = 0.16 * s, hw = 0.07 * s;
  // Stem: thin vertical quad (2 tris), head: small quad (2 tris).
  // BUILD 1034: baseY lifts the flower onto the heightfield.
  const a: V3 = [x - w, baseY + 0.01, z], b: V3 = [x + w, baseY + 0.01, z];
  const c: V3 = [x + w, baseY + 0.01 + h, z], d: V3 = [x - w, baseY + 0.01 + h, z];
  triV(a, FLOWER_STEM, b, FLOWER_STEM, c, FLOWER_STEM);
  triV(a, FLOWER_STEM, c, FLOWER_STEM, d, FLOWER_STEM);
  const hy = baseY + 0.01 + h;
  const e: V3 = [x - hw, hy, z], g: V3 = [x + hw, hy, z];
  const i: V3 = [x + hw, hy + hw, z], j: V3 = [x - hw, hy + hw, z];
  triV(e, f.color, g, f.color, i, f.color);
  triV(e, f.color, i, f.color, j, f.color);
}

function emitPebble(triV: TriV, p: Pebble, originX: number, originZ: number, baseY = 0): void {
  const x = originX + p.ox, z = originZ + p.oz;
  const h = p.size / 2;
  const co = Math.cos(p.rot), si = Math.sin(p.rot);
  // BUILD 1034: baseY lifts the pebble onto the heightfield.
  const corner = (sx: number, sz: number): V3 => [x + sx * co + sz * si, baseY + 0.012, z - sx * si + sz * co];
  const col: V3 = [PEBBLE_GREY[0] * p.shade, PEBBLE_GREY[1] * p.shade, PEBBLE_GREY[2] * p.shade];
  const a = corner(-h, -h), b = corner(h, -h), c = corner(h, h), d = corner(-h, h);
  triV(a, col, b, col, c, col);
  triV(a, col, c, col, d, col);
}

function emitCobble(triV: TriV, originX: number, originZ: number, baseY = 0, shade = 1): void {
  const h = 0.4;
  const col: V3 = [COBBLE_COLOR[0] * shade, COBBLE_COLOR[1] * shade, COBBLE_COLOR[2] * shade];
  const a: V3 = [originX - h, baseY + 0.012, originZ - h];
  const b: V3 = [originX + h, baseY + 0.012, originZ - h];
  const c: V3 = [originX + h, baseY + 0.012, originZ + h];
  const d: V3 = [originX - h, baseY + 0.012, originZ + h];
  triV(a, col, b, col, c, col);
  triV(a, col, c, col, d, col);
}

/** Emit flowers + pebbles + district cobble paving for the detail window.
 *  Returns the counts, so the probe can state them. Flowers need grass
 *  terrain; pebbles take grass or dirt. Cobble (BUILD 1051) takes dirt
 *  or sand in the market / craft districts — the Stage 5 district
 *  paving, from the same ground-detail family as the flowers and
 *  pebbles (window-only, deterministic per tile, zero collision, zero
 *  save state). A cobble tile never also carries a pebble (both sit
 *  at +0.012 — they would z-fight), and never sits under town decor
 *  (the statue's plinth, the fountain's rim). */
export function emitGroundDetail3d(
  triV: TriV,
  world: IsoWorld,
  effTerrain: (x: number, y: number) => Terrain,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): { flowers: number; pebbles: number; cobbles: number } {
  const blocked = blockedTiles(world);
  // BUILD 1051: decor tiles (the statue, the fountain) are not in
  // blockedTiles (they never block) — but a cobble slab under a
  // plinth would clip through it, so cobble skips them explicitly.
  const decor = new Set((world.propDecor ?? []).map((d) => d.tx + ',' + d.ty));
  let flowers = 0, pebbles = 0, cobbles = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (blocked.has(x + ',' + y)) continue;
      // BUILD 1024: out-of-map tiles hold wild trees/rocks, which are
      // generated from the scatter hash and never enter the world's
      // stored lists — no flower or pebble may sit under one. (Lakes
      // need no check here: effTerrain returns 'water' for them, and
      // flowers take grass, pebbles grass or dirt.)
      if ((x < 0 || y < 0 || x >= world.w || y >= world.h) && wildObstacleAt(x, y)) continue;
      // BUILD 1049: a generated bush owns its tile — no flower or
      // pebble sits under it (same rule as the grass tufts).
      if (generatedBushAt(x, y)) continue;
      const t = effTerrain(x, y);
      // BUILD 1034: flowers and pebbles sit on the heightfield.
      const baseY = surfaceElevation(effTerrain, x + 0.5, y + 0.5);
      // BUILD 1051: district cobble paving — a flat grey slab on
      // dirt/sand in the market / craft districts (settlements.ts).
      // Shade jitter per tile (hash salt 73) so the paving reads as
      // laid stones, not one flat sheet.
      const cobble = !decor.has(x + ',' + y) && cobbleForTile(world, x, y);
      if (cobble) {
        const shade = 0.85 + hash2(x * 3.1 + 73, y * 7.7 + 73) * 0.3;
        emitCobble(triV, x + 0.5, y + 0.5, baseY, shade);
        cobbles++;
      }
      if (t === 'grass') {
        const f = wildflowerForTile(x, y);
        if (f) { emitFlower(triV, f, x + 0.5, y + 0.5, baseY); flowers++; }
      }
      if ((t === 'grass' || t === 'dirt') && !cobble) {
        const p = pebbleForTile(x, y);
        if (p) { emitPebble(triV, p, x + 0.5, y + 0.5, baseY); pebbles++; }
      }
    }
  }
  return { flowers, pebbles, cobbles };
}
