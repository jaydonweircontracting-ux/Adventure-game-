/**
 * BUILD 1015 — town additions for the 3D demo world: the commercial
 * buildings (inn, general store, blacksmith) and the extra wild rocks.
 *
 * These are pure functions over an IsoWorld so they can be asserted
 * standalone; the adapter in Engine3DWorldView calls them after the
 * lot loop and before the prop loop / insideBuilding filter.
 *
 * BUILDINGS — stamped here, NOT in the shared layout generator (which
 * also feeds the 2.5D town: these are 3D-mode buildings, and the
 * generator's lots must not move). Rects were picked from a free-rect
 * scan of the adapted town (all grass, no hut/stall/tree/rock/crate/
 * wall, no NPC waypoint, walkable doorstep): inn west of the plaza
 * [90,101]-[95,105] door east onto the plaza; store south of the plaza
 * [94,107]-[98,110] door north toward it; smith north-east
 * [105,94]-[109,97] door south toward it. None covers an NPC anchor
 * (market (104,109), gardens (96,99)/(106,104), patrol points) or an
 * NPC home doorstep. Removed/moved rules mirror the lot loop exactly:
 * a removed building stays removed, a moved one stamps at its record's
 * `to` rect with the door recomputed from its facing. They are ordinary
 * huts otherwise — interiors (990), Enter/Exit, light schedules (1014),
 * and smoke (1014/1015) all apply with no special case. No mechanics:
 * no innkeeper, no shop stock, no forge — buildings only, mechanics
 * come later.
 *
 * ROCKS — deterministic hash scatter outside the town (±24), on grass
 * only (so never on roads, the plaza, or the pond), ~60 extra rocks on
 * top of the ~77 authored + scattered. Mined extra rocks stay mined:
 * the E-key handler records the key in removedRocks, and this loop
 * skips it; the rockKeys guard also stops a double-stamp when the save
 * already holds the rock (the adapter stamps into world.rocks, and the
 * view saves that world). The adapter's insideBuilding filter (run
 * after the prop loop) clears any that land under a hut, including the
 * three new buildings above.
 */
import { terrainAt, terrainKey, type HutRect, type IsoWorld } from '../iso/isoWorld';
import { hash2 } from './townLook';

export interface TownBuilding {
  x0: number; y0: number; x1: number; y1: number;
  doorX: number; doorY: number;
  facing: 'north' | 'south' | 'west' | 'east';
  variant: 'inn' | 'store' | 'smith';
}

export const TOWN_BUILDINGS: TownBuilding[] = [
  { x0: 90, y0: 101, x1: 95, y1: 105, doorX: 95, doorY: 103, facing: 'east', variant: 'inn' },
  { x0: 94, y0: 107, x1: 98, y1: 110, doorX: 96, doorY: 107, facing: 'north', variant: 'store' },
  { x0: 105, y0: 94, x1: 109, y1: 97, doorX: 107, doorY: 97, facing: 'south', variant: 'smith' },
];

export function stampTownBuildings(world: IsoWorld): void {
  for (const b of TOWN_BUILDINGS) {
    const moved = (world.movedHuts ?? []).find(m => m.from.x0 === b.x0 && m.from.y0 === b.y0 && m.from.x1 === b.x1 && m.from.y1 === b.y1);
    const tx0 = moved ? moved.to.x0 : b.x0, ty0 = moved ? moved.to.y0 : b.y0;
    const tx1 = moved ? moved.to.x1 : b.x1, ty1 = moved ? moved.to.y1 : b.y1;
    if ((world.removedHuts ?? []).some(h => h.x0 === tx0 && h.y0 === ty0 && h.x1 === tx1 && h.y1 === ty1)) continue;
    if (world.huts.some(h => h.x0 === tx0 && h.y0 === ty0 && h.x1 === tx1 && h.y1 === ty1)) continue;
    const midX = Math.round((tx0 + tx1) / 2), midY = Math.round((ty0 + ty1) / 2);
    const door = b.facing === 'north' ? { x: midX, y: ty0 }
      : b.facing === 'south' ? { x: midX, y: ty1 }
      : b.facing === 'west' ? { x: tx0, y: midY } : { x: tx1, y: midY };
    // HutRect has no variant field; the house loop reads
    // (hut as { variant?: string }).variant, same as 1012's placed huts.
    world.huts.push({ x0: tx0, y0: ty0, x1: tx1, y1: ty1, doorX: door.x, doorY: door.y, variant: b.variant } as HutRect);
  }
}

/** Density of the 1015 extra wild rocks (hash2 < 0.002 on wild grass). */
export const EXTRA_ROCK_DENSITY = 0.002;

export function stampExtraRocks(world: IsoWorld): void {
  const removedRockKeys = new Set(world.removedRocks ?? []);
  const rockKeys = new Set(world.rocks.map(r => terrainKey(r.tx, r.ty)));
  for (let x = 3; x < world.w - 3; x++) for (let y = 3; y < world.h - 3; y++) {
    if (Math.abs(x - 100) <= 24 && Math.abs(y - 100) <= 24) continue;
    if (terrainAt(world, x, y) !== 'grass') continue;
    const k = terrainKey(x, y);
    if (rockKeys.has(k) || removedRockKeys.has(k)) continue;
    if (hash2(x * 3.1 + 11, y * 7.7 + 11) < EXTRA_ROCK_DENSITY) { world.rocks.push({ tx: x, ty: y }); rockKeys.add(k); }
  }
}
