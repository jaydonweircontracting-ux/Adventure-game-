// caveKit.ts — Kenney Modular Cave Kit art for the Stone Soup cave variant (BUILD 964).
//
// The pack's 40 Previews PNGs live in public/sprites/cave-sprites/ as shipped
// 64x64 renders (plus License.txt, CC0 — see the file). The 3D models (FBX/GLB)
// and the Sample/Preview showcase images are NOT shipped.
//
// Classification (measured from the art itself, not the filenames): the
// template pieces are stone surfaces, the gates are mouths, the stairs are
// steps, and the room/corridor pieces are whole 3D-room dioramas. A grid cell
// showing a whole room diorama would read as an object or a hole, not as a
// cave floor — so, exactly like dungeonPry's unmapped 05/06/07/08, the
// room/corridor pieces ship in the folder for future use but are NEVER
// mapped to grid cells. The cave interior is still assembled from kit
// pieces, not one flat picture: cavern layout (928 cellular) + per-cell kit
// floors/walls + gate doors + kit stairs + sparse kit detail decor.
//
// Determinism: every selector is a pure function of (seed, floor, x, y)
// via FNV-1a, so the same cave renders the same art on every visit.
// Nothing here touches generation, combat, loot, or saves — visuals only.

export const CAVE_KIT_BASE = 'sprites/cave-sprites';

export const CAVE_KIT_FILES = [
  'corridor-corner.png', 'corridor-end.png', 'corridor-intersection.png',
  'corridor-junction.png', 'corridor-transition.png', 'corridor-wide-corner.png',
  'corridor-wide-end.png', 'corridor-wide-intersection.png',
  'corridor-wide-junction.png', 'corridor-wide.png', 'corridor.png',
  'gate-metal-bars.png', 'gate-overhang.png', 'gate-rock.png', 'gate.png',
  'ladder.png', 'room-corner.png', 'room-large-variation.png', 'room-large.png',
  'room-small-variation.png', 'room-small.png', 'room-wide-variation.png',
  'room-wide.png', 'stairs-wide.png', 'stairs.png', 'template-corner.png',
  'template-detail.png', 'template-floor-big.png', 'template-floor-detail-a.png',
  'template-floor-detail.png', 'template-floor-layer-hole.png',
  'template-floor-layer-raised.png', 'template-floor-layer.png',
  'template-floor.png', 'template-wall-corner.png',
  'template-wall-detail-a.png', 'template-wall-half.png',
  'template-wall-stairs.png', 'template-wall-top.png', 'template-wall.png',
];

/** Cells mapped to kit art (surfaces + mouths + steps + details). */
export const CAVE_FLOOR_TILES = [
  'template-floor.png', 'template-floor-big.png',
  'template-floor-detail.png', 'template-floor-detail-a.png',
];
export const CAVE_WALL_TILES = [
  'template-wall.png', 'template-wall-top.png', 'template-wall-half.png',
  'template-wall-corner.png', 'template-wall-detail-a.png', 'template-corner.png',
];
export const CAVE_DOOR_TILES = [
  'gate-rock.png', 'gate.png', 'gate-overhang.png', 'gate-metal-bars.png',
];
export const CAVE_STAIRS_TILES = ['stairs.png', 'stairs-wide.png'];
export const CAVE_DECOR_TILES = [
  'template-detail.png', 'template-floor-layer-hole.png',
  'template-floor-layer-raised.png',
];
/** Shipped but never mapped to a grid cell (whole-room dioramas). */
export const CAVE_UNMAPPED_TILES = [
  'corridor-corner.png', 'corridor-end.png', 'corridor-intersection.png',
  'corridor-junction.png', 'corridor-transition.png', 'corridor-wide-corner.png',
  'corridor-wide-end.png', 'corridor-wide-intersection.png',
  'corridor-wide-junction.png', 'corridor-wide.png', 'corridor.png',
  'ladder.png', 'room-corner.png', 'room-large-variation.png', 'room-large.png',
  'room-small-variation.png', 'room-small.png', 'room-wide-variation.png',
  'room-wide.png', 'template-floor-layer.png', 'template-wall-stairs.png',
];

/** FNV-1a 32-bit hash — same construction as dungeonPry's pryHash. */
export function caveHash(seed: number, floor: number, x: number, y: number): number {
  const s = `${seed}:${floor}:${x}:${y}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Floor tile for a cell. Weighted: plain 4/8, big 2/8, detail 1/8, detail-a 1/8. */
export function caveFloorTileFor(seed: number, floor: number, x: number, y: number): string {
  const h = caveHash(seed, floor, x, y) % 8;
  if (h < 4) return 'template-floor.png';
  if (h < 6) return 'template-floor-big.png';
  if (h < 7) return 'template-floor-detail.png';
  return 'template-floor-detail-a.png';
}

/** Wall tile for a cell. Plain weighted 2/7, the other five evenly. */
export function caveWallTileFor(seed: number, floor: number, x: number, y: number): string {
  const h = caveHash(seed, floor, x, y) % 7;
  if (h < 2) return 'template-wall.png';
  return CAVE_WALL_TILES[h - 1];
}

/** Door tile for a cell. The rock gate is the cave mouth; weighted 4/8. */
export function caveDoorTileFor(seed: number, floor: number, x: number, y: number): string {
  const h = caveHash(seed, floor, x, y) % 8;
  if (h < 4) return 'gate-rock.png';
  if (h < 6) return 'gate.png';
  if (h < 7) return 'gate-overhang.png';
  return 'gate-metal-bars.png';
}

/** Stairs tile for a cell (alternates by hash parity). */
export function caveStairsTileFor(seed: number, floor: number, x: number, y: number): string {
  return caveHash(seed, floor, x, y) % 2 === 0 ? 'stairs.png' : 'stairs-wide.png';
}

/**
 * Sparse decor for a plain floor cell (1-in-6, like pryDecorFor): a detail
 * piece layered over the floor tile. Returns null for most cells and for
 * cells holding items, plates, or the player (callers check those first).
 */
export function caveDecorFor(seed: number, floor: number, x: number, y: number): string | null {
  const h = caveHash(seed, floor, x, y);
  if (h % 6 !== 0) return null;
  return CAVE_DECOR_TILES[Math.floor(h / 6) % CAVE_DECOR_TILES.length];
}

export function caveKitPath(file: string): string {
  return `${CAVE_KIT_BASE}/${file}`;
}
