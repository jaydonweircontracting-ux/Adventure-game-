// dungeonPry.ts — Dungeon Pry sprite art for the Stone Soup dungeon (BUILD 946).
//
// The pack's 31 PNGs live in public/sprites/dungeon-sprites-tiles/ as
// game-size 128px variants (the 512px originals total 5.4MB; the shipped
// set is ~320KB — dungeon cells render at ~22-36px, so 128px is 3-5x
// display size). The 4 banner/showcase images and dungeon_map_001.png
// from the upload are showcase art and are NOT shipped. There is no
// license file in the upload; the source is recorded here and in the
// build notes, and no license terms are claimed.
//
// Classification (measured from the art itself, not the filenames):
// the tiles are isometric diamond renders, not top-down squares, so they
// are applied as full-cell cover backgrounds, not tiled grids.
//   floor pool: 01a plain stone, 01b dirt patch, 01c sunken pool,
//     01d mosaic circle (01c/01d are rarer by weight, not by chance).
//   wall pool: 02a/02b/04a corner walls, 02d broken wall + rubble,
//     03a pillar. Doorway tiles (02c/02e/04b) are NOT wall art — a wall
//     cell showing a doorway would read as passable.
//   door pool: 02c/02e/04b, the three doorway tiles.
//   unmapped: 05/06/07 are thin wall segments that are mostly
//     transparent (a cell showing one would read as an empty hole),
//     08 is a single loose stone. They ship in the folder for future
//     use but are never mapped to a cell.
//   decor pool: every placeable except the chest pair. Chests are
//     reserved: closed = the ground-loot visual, open = shipped in the
//     manifest but with no open-state trigger yet (no openable-chest
//     interaction exists in the engine; inventing one here would be a
//     fake feature — the trigger belongs to a later loot interaction).
//
// Determinism: every selector is a pure function of (seed, floor, x, y)
// via FNV-1a, so the same dungeon renders the same art on every load
// and every visit. Nothing here touches generation, combat, loot, or
// saves — visuals only. The iso cellar/prison interiors keep their own
// dungeonKit art (different perspective); this module is Stone Soup only.

export const DUNGEON_PRY_BASE = 'sprites/dungeon-sprites-tiles';

export const PRY_TILE_FILES = [
  'tile_01a.png', 'tile_01b.png', 'tile_01c.png', 'tile_01d.png',
  'tile_02a.png', 'tile_02b.png', 'tile_02c.png', 'tile_02d.png', 'tile_02e.png',
  'tile_03a.png', 'tile_04a.png', 'tile_04b.png',
  'tile_05.png', 'tile_06.png', 'tile_07.png', 'tile_08.png',
];

export const PRY_PLACEABLE_FILES = [
  'alchemy_shelf_001.png', 'barrel_001.png', 'barrel_002.png', 'bookshelf_001.png',
  'carpet_001.png', 'carpet_002.png', 'chest_01.png', 'chest_01_open.png',
  'flasks_01.png', 'flasks_02.png', 'stain_blood_001.png', 'stain_blood_002.png',
  'stain_green_001.png', 'stain_water_001.png', 'table_001.png',
];

export const PRY_FLOOR_TILES = ['tile_01a.png', 'tile_01b.png', 'tile_01c.png', 'tile_01d.png'];
export const PRY_WALL_TILES = ['tile_02a.png', 'tile_02b.png', 'tile_02d.png', 'tile_03a.png', 'tile_04a.png'];
export const PRY_DOOR_TILES = ['tile_02c.png', 'tile_02e.png', 'tile_04b.png'];
export const PRY_UNMAPPED_TILES = ['tile_05.png', 'tile_06.png', 'tile_07.png', 'tile_08.png'];
export const PRY_CHEST_CLOSED = 'chest_01.png';
export const PRY_CHEST_OPEN = 'chest_01_open.png';
export const PRY_DECOR_PLACEABLES = [
  'alchemy_shelf_001.png', 'barrel_001.png', 'barrel_002.png', 'bookshelf_001.png',
  'carpet_001.png', 'carpet_002.png', 'flasks_01.png', 'flasks_02.png',
  'stain_blood_001.png', 'stain_blood_002.png', 'stain_green_001.png',
  'stain_water_001.png', 'table_001.png',
];

/** FNV-1a 32-bit hash — stable across runs, no Math.random anywhere. */
export function pryHash(seed: number, floor: number, x: number, y: number): number {
  const s = `${seed}:${floor}:${x}:${y}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Floor tile for a cell. Weighted: 01a 4/8, 01b 2/8, 01c 1/8, 01d 1/8. */
export function pryFloorTileFor(seed: number, floor: number, x: number, y: number): string {
  const h = pryHash(seed, floor, x, y) % 8;
  if (h < 4) return 'tile_01a.png';
  if (h < 6) return 'tile_01b.png';
  if (h === 6) return 'tile_01c.png';
  return 'tile_01d.png';
}

/** Wall tile for a cell. */
export function pryWallTileFor(seed: number, floor: number, x: number, y: number): string {
  return PRY_WALL_TILES[pryHash(seed, floor, x, y) % PRY_WALL_TILES.length];
}

/** Door tile for a cell. */
export function pryDoorTileFor(seed: number, floor: number, x: number, y: number): string {
  return PRY_DOOR_TILES[pryHash(seed, floor, x, y) % PRY_DOOR_TILES.length];
}

/**
 * Decor placeable for a plain floor cell, or null. Sparse by design:
 * 1 in 6 cells gets decor (gate on the low bits, pick from the high
 * bits so gate and pick never correlate). Callers must only call this
 * for plain floor cells with nothing on them — a decor layer under a
 * monster/player/shopkeeper would hide that entity, since the dungeon
 * grid renders one background per cell.
 */
export function pryDecorFor(seed: number, floor: number, x: number, y: number): string | null {
  const h = pryHash(seed, floor, x, y);
  if (h % 6 !== 0) return null;
  return PRY_DECOR_PLACEABLES[((h >>> 3) % PRY_DECOR_PLACEABLES.length + PRY_DECOR_PLACEABLES.length) % PRY_DECOR_PLACEABLES.length];
}

/** Relative public path for a shipped Pry file (callers wrap in artUrl). */
export function pryTilePath(file: string): string {
  return `${DUNGEON_PRY_BASE}/tiles/${file}`;
}

/** Relative public path for a shipped Pry placeable (callers wrap in artUrl). */
export function pryPlaceablePath(file: string): string {
  return `${DUNGEON_PRY_BASE}/placeables/${file}`;
}
