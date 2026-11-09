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
import { hash2, GROUND_FLOOR_H, DOOR_W, DOOR_H, type Rgb } from './townLook';
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
    // BUILD 1050: the first piece is ALWAYS a hearth, so every
    // interior has one — the hearth is the room's light source (its
    // fire glows at night on the house-light schedule, houseFx.ts),
    // and a room with no hearth would have no glow at all. The other
    // pieces keep their seeded kinds; only the first kind is forced.
    const kind = i === 0 ? 'hearth'
      : FURNITURE_KINDS[
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

// ---- BUILD 1050: interior ceiling, wall band, hearth glow ----

/** Ceiling height above the interior floor: the ground-floor height
 *  (2.1), so the ceiling sits at the top of the ground floor, under
 *  the upper storeys. The first-person eye (1.33 above the floor)
 *  stands 0.82 below it — the ceiling is in view when looking up,
 *  and every furniture piece (tallest: shelf 1.1) clears it. */
export const INTERIOR_CEILING_H = GROUND_FLOOR_H;

/** One flat quad for the fx buffer: four corners + a colour.
 *  Positions are absolute world units (baseY already added). */
export interface InteriorQuad {
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  d: [number, number, number];
  color: Rgb;
}

const CEILING_WOOD: Rgb = [0.45, 0.32, 0.2];
const WALL_PLASTER: Rgb = [0.8, 0.72, 0.55];

/**
 * The interior ceiling: one timber quad spanning the hut footprint
 * at floor + GROUND_FLOOR_H, so the sky is not visible from inside
 * when looking up. The view renders it per frame (fx buffer) only
 * in first-person inside — the orbit view keeps its cutaway, so the
 * room stays visible from above (a ceiling in the static world
 * buffer would hide the furniture from the orbit camera). The
 * geometry proof is a point test: a point above the room's centre,
 * below this y, is under the ceiling, not under the sky.
 */
export function interiorCeilingFor(hut: HutRect, baseY: number): InteriorQuad {
  const y = baseY + INTERIOR_FLOOR_Y + INTERIOR_CEILING_H;
  const x0 = hut.x0, x1 = hut.x1 + 1, z0 = hut.y0, z1 = hut.y1 + 1;
  return {
    a: [x0, y, z0], b: [x1, y, z0], c: [x1, y, z1], d: [x0, y, z1],
    color: CEILING_WOOD,
  };
}

/**
 * The interior wall band: one plaster quad per side, floor to
 * ceiling, at the rect's edge planes. The door face carries a
 * doorway gap (the door's width, 0.87, up to its 1.78 height, with
 * a lintel above) instead of a solid wall, so the door reads from
 * inside and the room is not sealed shut — Exit is still the way
 * out (the 1032 rule is unchanged: the walls are visual, the
 * walkability is interiorTileWalkable). Like the ceiling, this
 * renders per frame only in first-person inside.
 */
export function interiorWallBandFor(hut: HutRect, baseY: number): InteriorQuad[] {
  const y0 = baseY + INTERIOR_FLOOR_Y;
  const y1 = y0 + INTERIOR_CEILING_H;
  const x0 = hut.x0, x1 = hut.x1 + 1, z0 = hut.y0, z1 = hut.y1 + 1;
  const door = hutDoor(hut);
  const out: InteriorQuad[] = [];
  const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number]): InteriorQuad =>
    ({ a, b, c, d, color: WALL_PLASTER });
  // North + south walls are full quads, unless they ARE the door
  // face (then they get the doorway treatment below instead).
  const fullWall = (face: DoorFace): void => {
    if (face === 'north') out.push(quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]));
    else if (face === 'south') out.push(quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]));
    else if (face === 'west') out.push(quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]));
    else out.push(quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]));
  };
  // The door-face wall, with a doorway gap: two side segments and
  // a lintel over the door. The door centre sits on the door tile
  // (tile centre + 0.5 along the face); the gap is DOOR_W wide.
  const doorWall = (face: DoorFace): void => {
    const gap = DOOR_W;
    const top = y0 + DOOR_H;
    if (face === 'south' || face === 'north') {
      const cx = door.x + 0.5;
      const z = face === 'south' ? z1 : z0;
      const a0 = x0, a1 = cx - gap / 2, a2 = cx + gap / 2, a3 = x1;
      const q = (p0: number, p1: number, q0: number, q1: number): void => {
        if (p1 <= p0 || q1 <= q0) return;
        if (face === 'south') out.push(quad([p1, q0, z], [p0, q0, z], [p0, q1, z], [p1, q1, z]));
        else out.push(quad([p0, q0, z], [p1, q0, z], [p1, q1, z], [p0, q1, z]));
      };
      q(a0, a1, y0, y1);
      q(a2, a3, y0, y1);
      q(a1, a2, top, y1);
    } else {
      const cz = door.y + 0.5;
      const x = face === 'west' ? x0 : x1;
      const a0 = z0, a1 = cz - gap / 2, a2 = cz + gap / 2, a3 = z1;
      const q = (p0: number, p1: number, q0: number, q1: number): void => {
        if (p1 <= p0 || q1 <= q0) return;
        if (face === 'west') out.push(quad([x, q0, p1], [x, q0, p0], [x, q1, p0], [x, q1, p1]));
        else out.push(quad([x, q0, p0], [x, q0, p1], [x, q1, p1], [x, q1, p0]));
      };
      q(a0, a1, y0, y1);
      q(a2, a3, y0, y1);
      q(a1, a2, top, y1);
    }
  };
  const faces: DoorFace[] = ['north', 'south', 'west', 'east'];
  for (const f of faces) {
    if (f === door.face) doorWall(f);
    else fullWall(f);
  }
  return out;
}

/**
 * The hearth fire's centre, in absolute world units (baseY added),
 * or null when the interior has no hearth. interiorBoxes guarantees
 * a hearth as its first piece (1050), so this is null only for a
 * degenerate hut with no furniture tiles at all. The fire box is
 * the hearth piece's FIRE-coloured box (the second box the hearth
 * kind emits); the glow box sits on it.
 */
export function interiorHearthFor(hut: HutRect, seedHut: HutRect, baseY: number): [number, number, number] | null {
  for (const b of interiorBoxes(hut, seedHut)) {
    if (b.kind !== 'hearth') continue;
    if (b.color[0] !== FIRE[0] || b.color[1] !== FIRE[1] || b.color[2] !== FIRE[2]) continue;
    return [b.x, b.y0 + b.h / 2 + baseY, b.z];
  }
  return null;
}
