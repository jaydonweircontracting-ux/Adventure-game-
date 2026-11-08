/**
 * BUILD 990 — generated 3D house interiors + door/exit math (pure module).
 *
 * The 3D demo world (isoWorld) has no doorway/interior machinery (the main
 * game's 977 enterDoorway/exitInteriorToField is a different model and is
 * untouched). This module is the whole interior system for engine3d:
 *
 *  - hutDoor(hut): the door tile + face for a hut, replicating EXACTLY the
 *    defaults the 983 house loop uses (generated huts carry doorX/doorY
 *    from the layout adapter; doorless huts fall back to centre-x /
 *    south edge; face order matches houseDesignFor: y-edges, then x-edges).
 *  - hutExitPoint(hut): the door tile stepped one tile outward along the
 *    door-face normal (the 982 door-agreement principle: the exit shares
 *    the door's along-face coordinate). Always outside the rect.
 *  - nearestDoorHut(huts, px, py): the hut whose door tile is within
 *    Chebyshev distance 1 of the player tile (doorstep, door tile, or a
 *    door-side neighbour). Shared by the Enter button and the E key.
 *  - interiorBoxes(hut): seeded furniture boxes for the hut's interior.
 *    No save field: layouts derive only from the hut rect, so they are
 *    identical on every load and cost no save space.
 *  - interiorWalkable(hut, tx, ty): every tile inside the rect is walkable
 *    while inside — furniture is visual only and never blocks, and the
 *    door tile + the tile directly inward from it are furniture-free
 *    (reserved lane), so the player can never be trapped.
 *  - rescuePosition(huts, tx, ty): load rule. Interior occupancy is
 *    session-only: a saved tile strictly inside a hut (not its walkable
 *    door tile) means the player quit while inside, so it returns that
 *    hut's exit point; anything else returns null (keep the save).
 *  - interiorTileWalkable(hut, tx, ty) [BUILD 1032]: the boundary rule
 *    the view's walkableAt calls while inside — the walls are solid,
 *    so only rect tiles are walkable and every tile outside (exit
 *    point included) is blocked; leaving is via Exit only. Returns
 *    null when not inside, so the caller falls through to the outdoor
 *    walkability.
 *
 * Furniture kinds (positions+colour style, no new assets, no textures):
 *  bed (frame + mattress + pillow), table (top + pedestal), chair (seat +
 *  back), counter, shelf, hearth (stone + fire), rug. Count is clamped
 *  1..6 by interior area; pieces are chosen by a seeded hash over the hut
 *  rect + piece index, so layouts differ per house and are deterministic.
 */
import { hash2, type Rgb } from './townLook';
import type { HutRect } from '../iso/isoWorld';

export type DoorFace = 'north' | 'south' | 'west' | 'east';

export interface HutDoor {
  x: number;
  y: number;
  face: DoorFace;
}

/** Door tile + face, replicating the house loop's defaults exactly. */
export function hutDoor(hut: HutRect): HutDoor {
  const x = hut.doorX ?? Math.round((hut.x0 + hut.x1 + 1) / 2);
  const y = hut.doorY ?? hut.y1;
  const face: DoorFace =
    y <= hut.y0 ? 'north' : y >= hut.y1 ? 'south' : x <= hut.x0 ? 'west' : 'east';
  return { x, y, face };
}

/** Exit point: door tile stepped one tile outward along the face normal. */
export function hutExitPoint(hut: HutRect): { x: number; y: number } {
  const d = hutDoor(hut);
  if (d.face === 'north') return { x: d.x, y: hut.y0 - 1 };
  if (d.face === 'south') return { x: d.x, y: hut.y1 + 1 };
  if (d.face === 'west') return { x: hut.x0 - 1, y: d.y };
  return { x: hut.x1 + 1, y: d.y };
}

export function sameHut(a: HutRect, b: HutRect): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

/** Nearest hut whose door tile is within Chebyshev distance 1 of (px, py). */
export function nearestDoorHut(huts: HutRect[], px: number, py: number): HutRect | null {
  let best: HutRect | null = null;
  let bestD = Infinity;
  for (const h of huts) {
    const d = hutDoor(h);
    const dist = Math.max(Math.abs(d.x - px), Math.abs(d.y - py));
    if (dist <= 1 && dist < bestD) {
      best = h;
      bestD = dist;
    }
  }
  return best;
}

/** The tile directly inward from the door (reserved lane, furniture-free). */
export function hutInwardTile(hut: HutRect): { x: number; y: number } {
  const d = hutDoor(hut);
  if (d.face === 'north') return { x: d.x, y: hut.y0 + 1 };
  if (d.face === 'south') return { x: d.x, y: hut.y1 - 1 };
  if (d.face === 'west') return { x: hut.x0 + 1, y: d.y };
  return { x: hut.x1 - 1, y: d.y };
}

/** Walkability while inside: every tile in the rect, furniture never blocks. */
export function interiorWalkable(hut: HutRect, tx: number, ty: number): boolean {
  return tx >= hut.x0 && tx <= hut.x1 && ty >= hut.y0 && ty <= hut.y1;
}

/**
 * BUILD 1032 — the interior boundary rule. While inside a hut the
 * walls are solid: the player may only stand on tiles inside the
 * rect. Returns the interior verdict when inside (hut non-null):
 * true for rect tiles (the door tile included — it is the entry
 * point), false for every tile outside the rect, including the exit
 * point one tile beyond the door and the tiles just past each wall.
 * Returns null when not inside, so the caller falls through to the
 * outdoor walkability. The view's walkableAt MUST use this verdict
 * as the whole answer while inside — falling through to the outdoor
 * rule for an exterior tile was the hole: the grass outside a hut is
 * walkable outdoors, so the player walked straight through the wall.
 * With this rule the only way out is Exit (button or E key).
 */
export function interiorTileWalkable(hut: HutRect | null, tx: number, ty: number): boolean | null {
  if (!hut) return null;
  return interiorWalkable(hut, tx, ty);
}

/**
 * Load rescue: a saved tile strictly inside a hut (not the walkable door
 * tile) means the player quit while inside — return that hut's exit point.
 * Anything else (outside, or the door tile itself) returns null.
 */
export function rescuePosition(
  huts: HutRect[],
  tx: number,
  ty: number,
): { x: number; y: number } | null {
  for (const h of huts) {
    if (tx >= h.x0 && tx <= h.x1 && ty >= h.y0 && ty <= h.y1) {
      const d = hutDoor(h);
      if (tx === d.x && ty === d.y) return null;
      return hutExitPoint(h);
    }
  }
  return null;
}

export type FurnitureKind = 'bed' | 'table' | 'chair' | 'counter' | 'shelf' | 'hearth' | 'rug';

export interface InteriorBox {
  kind: FurnitureKind;
  /** Tile the box sits on (for door/lane asserts). */
  tx: number;
  ty: number;
  /** Centre in world units. */
  x: number;
  z: number;
  /** Footprint in world units. */
  w: number;
  d: number;
  /** Height, and base height above the ground plane. */
  h: number;
  y0: number;
  color: Rgb;
}

/** Interior floor height: above ground (0), slabs (<=.034), cobbles (<=.022). */
export const INTERIOR_FLOOR_Y = 0.05;

const WOOD: Rgb = [0.45, 0.32, 0.2];
const WOOD_DARK: Rgb = [0.36, 0.25, 0.15];
const CREAM: Rgb = [0.88, 0.85, 0.75];
const WHITE: Rgb = [0.95, 0.95, 0.92];
const STONE_GREY: Rgb = [0.52, 0.52, 0.5];
const FIRE: Rgb = [0.95, 0.55, 0.15];
const RUG_COLORS: Rgb[] = [
  [0.55, 0.2, 0.2],
  [0.2, 0.35, 0.55],
  [0.3, 0.5, 0.3],
];
const FLOOR_WOOD: Rgb = [0.55, 0.42, 0.28];

/** Seeded per-tile floor tint (same townLook hashing principle). */
export function interiorFloorColor(tx: number, ty: number): Rgb {
  const v = hash2(tx * 3.1 + 7.7, ty * 5.3 + 2.9);
  const t = (v - 0.5) * 0.07;
  return [FLOOR_WOOD[0] + t, FLOOR_WOOD[1] + t, FLOOR_WOOD[2] + t];
}

const FURNITURE_KINDS: FurnitureKind[] = ['bed', 'table', 'chair', 'counter', 'shelf', 'hearth', 'rug'];

/**
 * Seeded furniture for a hut. Boxes are centred within their tile (never
 * overlapping the wall plane) and are visual only — walkability is
 * interiorWalkable(), so connectivity from the door tile is trivially
 * complete. The door tile and the tile directly inward from it never
 * carry furniture (reserved entry lane). BUILD 1006: a moved hut passes
 * its ORIGINAL rect as seedHut, so the furniture KIND sequence and
 * count stay the house's own (bounds, door, and lane still come from
 * the CURRENT rect, so furniture sits inside the moved house). Default
 * seed is the hut itself.
 */
export function interiorBoxes(hut: HutRect, seedHut: HutRect = hut): InteriorBox[] {
  const door = hutDoor(hut);
  const lane = hutInwardTile(hut);
  const candidates: Array<{ tx: number; ty: number }> = [];
  for (let ty = hut.y0; ty <= hut.y1; ty++) {
    for (let tx = hut.x0; tx <= hut.x1; tx++) {
      if (tx === door.x && ty === door.y) continue;
      if (tx === lane.x && ty === lane.y) continue;
      candidates.push({ tx, ty });
    }
  }
  if (candidates.length === 0) return [];
  // Seeded spread: sort by a hash of the tile + hut origin so the chosen
  // tiles (and kinds) differ per house but are stable for a given hut.
  const seeded = [...candidates].sort(
    (a, b) =>
      hash2(a.tx * 3.7 + seedHut.x0 * 13.1, a.ty * 9.1 + seedHut.y0 * 7.3) -
      hash2(b.tx * 3.7 + seedHut.x0 * 13.1, b.ty * 9.1 + seedHut.y0 * 7.3),
  );
  const count = Math.min(6, Math.max(1, Math.floor(candidates.length / 3)));
  const out: InteriorBox[] = [];
  for (let i = 0; i < count; i++) {
    const tile = seeded[i];
    const kind =
      FURNITURE_KINDS[
        Math.floor(hash2(seedHut.x0 * 13.7 + i * 3.3, seedHut.y0 * 7.9 + i * 1.7) * FURNITURE_KINDS.length) %
          FURNITURE_KINDS.length
      ];
    const cx = tile.tx + 0.5;
    const cz = tile.ty + 0.5;
    const y = INTERIOR_FLOOR_Y;
    const box = (
      w: number,
      h: number,
      d: number,
      y0: number,
      color: Rgb,
      dx = 0,
      dz = 0,
    ): InteriorBox => ({ kind, tx: tile.tx, ty: tile.ty, x: cx + dx, z: cz + dz, w, d, h, y0, color });
    if (kind === 'bed') {
      out.push(box(0.9, 0.18, 0.9, y, WOOD_DARK));
      out.push(box(0.8, 0.16, 0.8, y + 0.18, CREAM));
      out.push(box(0.5, 0.1, 0.25, y + 0.34, WHITE, 0, -0.28));
    } else if (kind === 'table') {
      out.push(box(0.9, 0.08, 0.6, y + 0.57, WOOD));
      out.push(box(0.3, 0.57, 0.3, y, WOOD_DARK));
    } else if (kind === 'chair') {
      out.push(box(0.5, 0.08, 0.5, y + 0.38, WOOD));
      out.push(box(0.5, 0.5, 0.12, y + 0.46, WOOD_DARK, 0, -0.19));
    } else if (kind === 'counter') {
      out.push(box(0.9, 0.8, 0.55, y, STONE_GREY));
    } else if (kind === 'shelf') {
      out.push(box(0.8, 1.1, 0.3, y, WOOD_DARK));
    } else if (kind === 'hearth') {
      out.push(box(0.8, 0.9, 0.4, y, STONE_GREY));
      out.push(box(0.4, 0.35, 0.15, y, FIRE, 0, 0.13));
    } else {
      out.push(
        box(0.9, 0.02, 0.9, y, RUG_COLORS[Math.floor(hash2(tile.tx, tile.ty) * RUG_COLORS.length)]),
      );
    }
  }
  return out;
}
