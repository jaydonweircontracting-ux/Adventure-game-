// WFC infrastructure tiles (BUILD 471 — WFC Phase 3).
//
// Rivers and roads as constraint-based tiles with DIRECTIONAL sockets.
// Unlike biome tiles (uniform per tile), infrastructure tiles have different
// sockets per side: a river flowing north-south has WATER on N/S and
// RIVERBANK on E/W. This ensures connectivity (§7, §8).
//
// Socket semantics:
// - 'WATER': river water (must connect to WATER)
// - 'BANK': riverbank (transitions water→land)
// - 'ROAD': road surface (must connect to ROAD)
// - 'PATH': dirt path (connects to ROAD or PATH)
// - 'LAND': normal land (no infrastructure)
// - 'BRIDGE': bridge deck (road over water)

import { WfcTileSet, WfcTile } from './wfc';

// ---------------------------------------------------------------------------
// Rivers (§8): must flow, connect, and have banks.
// ---------------------------------------------------------------------------

// A river tile is defined by which sides have water.
// We generate all 16 combinations, but only the connected ones are useful.
// For simplicity, we define the common patterns.

interface RiverPattern {
  id: string;
  // Which sides have water (true = water flows through this side).
  north: boolean; south: boolean; east: boolean; west: boolean;
  weight: number;
}

const RIVER_PATTERNS: RiverPattern[] = [
  // Straight
  { id: 'river_ns', north: true, south: true, east: false, west: false, weight: 20 },
  { id: 'river_ew', north: false, south: false, east: true, west: true, weight: 20 },
  // Corners
  { id: 'river_ne', north: true, south: false, east: true, west: false, weight: 10 },
  { id: 'river_nw', north: true, south: false, east: false, west: true, weight: 10 },
  { id: 'river_se', north: false, south: true, east: true, west: false, weight: 10 },
  { id: 'river_sw', north: false, south: true, east: false, west: true, weight: 10 },
  // T-junctions
  { id: 'river_t_n', north: false, south: true, east: true, west: true, weight: 5 },
  { id: 'river_t_s', north: true, south: false, east: true, west: true, weight: 5 },
  { id: 'river_t_e', north: true, south: true, east: false, west: true, weight: 5 },
  { id: 'river_t_w', north: true, south: true, east: true, west: false, weight: 5 },
  // Cross
  { id: 'river_x', north: true, south: true, east: true, west: true, weight: 3 },
  // Ends (sources/sinks)
  { id: 'river_end_n', north: true, south: false, east: false, west: false, weight: 4 },
  { id: 'river_end_s', north: false, south: true, east: false, west: false, weight: 4 },
  { id: 'river_end_e', north: false, south: false, east: true, west: false, weight: 4 },
  { id: 'river_end_w', north: false, south: false, east: false, west: true, weight: 4 },
];

function riverTileSet(): WfcTileSet {
  const tiles: WfcTile[] = RIVER_PATTERNS.map((p) => ({
    id: p.id,
    weight: p.weight,
    sockets: {
      north: p.north ? 'WATER' : 'BANK',
      south: p.south ? 'WATER' : 'BANK',
      east: p.east ? 'WATER' : 'BANK',
      west: p.west ? 'WATER' : 'BANK',
    },
  }));
  // Add a "no river" tile (land) for areas without water.
  tiles.push({
    id: 'land',
    weight: 100,
    sockets: { north: 'LAND', south: 'LAND', east: 'LAND', west: 'LAND' },
  });
  return {
    tiles,
    compatible: (a, b) => {
      // WATER must meet WATER. BANK can meet BANK, LAND, or WATER (transition).
      // LAND must meet LAND or BANK.
      if (a === 'WATER') return b === 'WATER';
      if (a === 'BANK') return b === 'BANK' || b === 'LAND' || b === 'WATER';
      if (a === 'LAND') return b === 'LAND' || b === 'BANK';
      return a === b;
    },
  };
}

let cachedRiver: WfcTileSet | null = null;
export function riverTileSetCached(): WfcTileSet {
  if (!cachedRiver) cachedRiver = riverTileSet();
  return cachedRiver;
}

// ---------------------------------------------------------------------------
// Roads (§7): must connect, avoid impossible terrain.
// ---------------------------------------------------------------------------

interface RoadPattern {
  id: string;
  north: boolean; south: boolean; east: boolean; west: boolean;
  weight: number;
}

const ROAD_PATTERNS: RoadPattern[] = [
  { id: 'road_ns', north: true, south: true, east: false, west: false, weight: 20 },
  { id: 'road_ew', north: false, south: false, east: true, west: true, weight: 20 },
  { id: 'road_ne', north: true, south: false, east: true, west: false, weight: 12 },
  { id: 'road_nw', north: true, south: false, east: false, west: true, weight: 12 },
  { id: 'road_se', north: false, south: true, east: true, west: false, weight: 12 },
  { id: 'road_sw', north: false, south: true, east: false, west: true, weight: 12 },
  { id: 'road_t_n', north: false, south: true, east: true, west: true, weight: 6 },
  { id: 'road_t_s', north: true, south: false, east: true, west: true, weight: 6 },
  { id: 'road_t_e', north: true, south: true, east: false, west: true, weight: 6 },
  { id: 'road_t_w', north: true, south: true, east: true, west: false, weight: 6 },
  { id: 'road_x', north: true, south: true, east: true, west: true, weight: 4 },
  // Dead ends (road termini at settlements/POIs)
  { id: 'road_end_n', north: true, south: false, east: false, west: false, weight: 5 },
  { id: 'road_end_s', north: false, south: true, east: false, west: false, weight: 5 },
  { id: 'road_end_e', north: false, south: false, east: true, west: false, weight: 5 },
  { id: 'road_end_w', north: false, south: false, east: false, west: true, weight: 5 },
];

function roadTileSet(): WfcTileSet {
  const tiles: WfcTile[] = ROAD_PATTERNS.map((p) => ({
    id: p.id,
    weight: p.weight,
    sockets: {
      north: p.north ? 'ROAD' : 'LAND',
      south: p.south ? 'ROAD' : 'LAND',
      east: p.east ? 'ROAD' : 'LAND',
      west: p.west ? 'ROAD' : 'LAND',
    },
  }));
  tiles.push({
    id: 'land',
    weight: 100,
    sockets: { north: 'LAND', south: 'LAND', east: 'LAND', west: 'LAND' },
  });
  // Bridge: road crosses water. Has ROAD on two opposite sides, WATER on others.
  // (Simplified: bridge is a road tile that can be placed over water.)
  tiles.push({
    id: 'bridge_ns',
    weight: 3,
    sockets: { north: 'ROAD', south: 'ROAD', east: 'WATER', west: 'WATER' },
  });
  tiles.push({
    id: 'bridge_ew',
    weight: 3,
    sockets: { north: 'WATER', south: 'WATER', east: 'ROAD', west: 'ROAD' },
  });
  return {
    tiles,
    compatible: (a, b) => {
      // ROAD must meet ROAD (or BRIDGE which has ROAD sockets).
      // LAND meets LAND. WATER meets WATER (for bridge sides).
      if (a === 'ROAD') return b === 'ROAD';
      if (a === 'LAND') return b === 'LAND';
      if (a === 'WATER') return b === 'WATER';
      return a === b;
    },
  };
}

let cachedRoad: WfcTileSet | null = null;
export function roadTileSetCached(): WfcTileSet {
  if (!cachedRoad) cachedRoad = roadTileSet();
  return cachedRoad;
}
