// Debug map builder (BUILD 341): tilemap-style terrain painting, in the spirit
// of a Unity tilemap editor. The player paints terrain tiles onto a coarse
// grid per chunk; paints persist in localStorage and override the procedural
// ground canvas. Pure helpers live here so scripts/simulate.ts can unit-test
// them without importing the React app.

export type MapPaintTile = 'grass' | 'dirt' | 'water' | 'sand' | 'forest';
export interface PaintedTile {
  tx: number;
  ty: number;
  tile: MapPaintTile;
}
// chunkKey ("x,y") -> painted tiles in that chunk.
export type MapPaints = Record<string, PaintedTile[]>;

/** Field units per painted tile edge. */
export const MAP_TILE_UNITS = 10;
/** Tiles per chunk side (140 field units / 10). */
export const MAP_TILES_PER_SIDE = 14;

export function mapChunkKey(x: number, y: number): string {
  return x + ',' + y;
}

/**
 * Paint (or erase, when tile is null) one tile. Out-of-grid paints are
 * ignored. Repainting with the same tile is a no-op so drag strokes don't
 * churn state.
 */
export function paintTile(
  paints: MapPaints,
  chunkKey: string,
  tx: number,
  ty: number,
  tile: MapPaintTile | null,
): MapPaints {
  if (tx < 0 || ty < 0 || tx >= MAP_TILES_PER_SIDE || ty >= MAP_TILES_PER_SIDE) return paints;
  const list = paints[chunkKey] ?? [];
  const idx = list.findIndex((p) => p.tx === tx && p.ty === ty);
  if (tile === null) {
    if (idx === -1) return paints;
    const next = list.filter((_, i) => i !== idx);
    const out = { ...paints };
    if (next.length === 0) delete out[chunkKey];
    else out[chunkKey] = next;
    return out;
  }
  if (idx !== -1 && list[idx].tile === tile) return paints;
  const next =
    idx === -1
      ? [...list, { tx, ty, tile }]
      : list.map((p, i) => (i === idx ? { tx, ty, tile } : p));
  return { ...paints, [chunkKey]: next };
}

/** Remove every painted tile in a chunk. */
export function clearChunkPaints(paints: MapPaints, chunkKey: string): MapPaints {
  if (!(chunkKey in paints)) return paints;
  const out = { ...paints };
  delete out[chunkKey];
  return out;
}

/** Solid footprint (field units, centered) for painted tiles that block movement. */
export interface MapPaintSolid {
  chunk: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Water and forest tiles block movement. Painted houses are stamped through
// the world editor, which already gives them collision.
export function mapBuilderSolidsFor(paints: MapPaints, chunkKey: string): MapPaintSolid[] {
  const list = paints[chunkKey] ?? [];
  return list
    .filter((p) => p.tile === 'water' || p.tile === 'forest')
    .map((p) => ({
      chunk: chunkKey,
      x: p.tx * MAP_TILE_UNITS + MAP_TILE_UNITS / 2,
      y: p.ty * MAP_TILE_UNITS + MAP_TILE_UNITS / 2,
      w: MAP_TILE_UNITS,
      h: MAP_TILE_UNITS,
    }));
}
