// WFC town generation (BUILD 492 — World Systems Phase 10).
//
// Rule-based town layouts using the WFC framework.
// Tiles: road, house, shop, farm, well, plaza, empty.
// Rules: houses connect to paths, shops to main roads, farms on outskirts.

import { WfcTileSet } from './wfc';

export type TownSize = 'hamlet' | 'village' | 'town' | 'city';

const TOWN_TILES = [
  // Roads
  { id: 'road', weight: 20, sockets: { north: 'ROAD', south: 'ROAD', east: 'ROAD', west: 'ROAD' } },
  { id: 'road_ns', weight: 15, sockets: { north: 'ROAD', south: 'ROAD', east: 'PATH', west: 'PATH' } },
  { id: 'road_ew', weight: 15, sockets: { north: 'PATH', south: 'PATH', east: 'ROAD', west: 'ROAD' } },
  // Buildings (connect to path/road)
  { id: 'house', weight: 25, sockets: { north: 'PATH', south: 'PATH', east: 'PATH', west: 'PATH' } },
  { id: 'shop', weight: 8, sockets: { north: 'ROAD', south: 'PATH', east: 'PATH', west: 'PATH' } },
  { id: 'well', weight: 3, sockets: { north: 'PATH', south: 'PATH', east: 'PATH', west: 'PATH' } },
  { id: 'plaza', weight: 5, sockets: { north: 'ROAD', south: 'ROAD', east: 'ROAD', west: 'ROAD' } },
  // Outskirts
  { id: 'farm', weight: 12, sockets: { north: 'FIELD', south: 'FIELD', east: 'FIELD', west: 'FIELD' } },
  { id: 'field', weight: 15, sockets: { north: 'FIELD', south: 'FIELD', east: 'FIELD', west: 'FIELD' } },
  // Empty
  { id: 'empty', weight: 10, sockets: { north: 'PATH', south: 'PATH', east: 'PATH', west: 'PATH' } },
];

function townTileSet(): WfcTileSet {
  return {
    tiles: TOWN_TILES.map(t => ({
      id: t.id,
      weight: t.weight,
      sockets: t.sockets,
    })),
    compatible: (a, b) => {
      // ROAD connects to ROAD. PATH connects to PATH or ROAD.
      // FIELD connects to FIELD. Buildings need PATH/ROAD adjacency.
      if (a === 'ROAD') return b === 'ROAD' || b === 'PATH';
      if (a === 'PATH') return b === 'PATH' || b === 'ROAD';
      if (a === 'FIELD') return b === 'FIELD';
      return a === b;
    },
  };
}

let cached: WfcTileSet | null = null;
export function townTileSetCached(): WfcTileSet {
  if (!cached) cached = townTileSet();
  return cached;
}

/**
 * Get town dimensions by size.
 */
export function townSizeFor(size: TownSize): { width: number; height: number } {
  if (size === 'hamlet') return { width: 8, height: 8 };
  if (size === 'village') return { width: 12, height: 12 };
  if (size === 'town') return { width: 16, height: 16 };
  return { width: 24, height: 24 }; // city
}
