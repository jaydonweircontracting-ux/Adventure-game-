import type { Point, MapTile } from './types';
import type { RegionStyle, SettlementKind, Terrain } from './constants';
import { TERRAIN_TYPES, ATLAS_BOUNDS } from './constants';

// Map landmarks - deterministic positions
export const MAP_LANDMARKS: Record<string, { name: string; kind: SettlementKind }> = {
  '4,7': { name: 'Mosslight Crossing', kind: 'town' },
  '0,7': { name: 'Fenmere Hamlet', kind: 'village' },
  '8,7': { name: 'Ironwood Southhold', kind: 'town' },
  '5,2': { name: 'Northwatch Beacon', kind: 'village' },
  '2,4': { name: 'Old Mill', kind: 'village' },
  '9,3': { name: 'Emberpeak Shrine', kind: 'village' },
  '3,12': { name: 'Sunwash Port', kind: 'town' },
  '6,10': { name: 'Bellwater', kind: 'village' },
  '10,10': { name: 'Seabreak', kind: 'town' },
  '1,3': { name: 'Blackroot Camp', kind: 'village' },
};

// Coastline water for tutorial island buffer
const COASTLINE_WATER = new Set([
  '-3,1', '-2,1', '-1,1', '0,1', '1,1', '2,1', '9,1', '10,1', '11,1',
  '-3,2', '-2,2', '10,2', '11,2', '-3,3', '11,3', '-3,4', '11,4',
  '-3,5', '11,5', '-3,6', '11,6', '-3,7', '11,7', '-3,8', '11,8',
  '-3,9', '11,9', '-3,10', '10,10', '11,10', '-3,11', '9,11', '10,11', '11,11',
  '-3,12', '-2,12', '8,12', '9,12', '10,12', '11,12', '-3,13', '-2,13', '-1,13', '0,13', '1,13', '7,13', '8,13', '9,13', '10,13', '11,13',
]);

// Give the tutorial island a clear water buffer without changing the starting field.
for (let x = -1; x <= 11; x += 1) {
  COASTLINE_WATER.add(x + ',1');
  COASTLINE_WATER.add(x + ',13');
}
for (let y = 1; y <= 13; y += 1) {
  COASTLINE_WATER.add('-1,' + y);
  COASTLINE_WATER.add('11,' + y);
}

export function isContinentChunk(point: Point): boolean {
  return point.x >= -3 && point.x <= 11 && point.y >= 1 && point.y <= 13 && !COASTLINE_WATER.has(point.x + ',' + point.y);
}

export function regionStyleFor(point: Point): RegionStyle {
  if (!isContinentChunk(point)) return 'ocean';
  if (point.y <= 4 || (point.y === 5 && point.x >= 5)) return 'northwatch';
  if (point.x <= 1) return 'brackenfen';
  if (point.x >= 7) return 'ironwood';
  if (point.y >= 10) return 'sunwash';
  return 'greenvale';
}

export function chunkTerrain(chunk: Point): Terrain {
  const seed = Math.abs((chunk.x * 73856093) ^ (chunk.y * 19349663));
  return TERRAIN_TYPES[seed % TERRAIN_TYPES.length];
}

export function isStartingArea(point: Point): boolean {
  return point.x >= 3 && point.x <= 5 && point.y >= 6 && point.y <= 8;
}

export function isTutorialCenter(point: Point): boolean {
  return point.x === 4 && point.y === 7;
}

export function chunkRegion(chunk: Point): string {
  const landmark = MAP_LANDMARKS[chunk.x + ',' + chunk.y];
  if (landmark) return landmark.name;
  if (isStartingArea(chunk)) return 'Tutorial Island';
  if (!isContinentChunk(chunk)) return 'Open Water';
  if (chunk.y <= 4) return 'Northwatch Heights';
  if (chunk.x <= 1) return 'Brackenfen Wilds';
  if (chunk.x >= 7) return 'Ironwood March';
  if (chunk.y >= 10) return 'Sunwash Coast';
  return 'Greenvale';
}

export function mapTileFor(point: Point): MapTile {
  const regionStyle = regionStyleFor(point);
  const isOcean = regionStyle === 'ocean';
  
  const mainRiverX = Math.round(4.5 + Math.sin((point.y - 2) * 0.48) * 1.35);
  const mainRiver = !isOcean && point.y >= 2 && point.y <= 12 && point.x === mainRiverX;
  
  const westBranchY = Math.round(7 + Math.sin((point.x + 1) * 0.72) * 0.85);
  const westBranch = !isOcean && point.x >= -1 && point.x <= 4 && point.y === westBranchY;
  
  const southBranchY = Math.round(10 + Math.sin(point.x * 0.65) * 0.45);
  const southBranch = !isOcean && point.x >= 4 && point.x <= 9 && point.y === southBranchY;
  
  const lake = !isOcean && ((point.x === 6 && point.y === 5) || (point.x === 7 && point.y === 5) || (point.x === 7 && point.y === 6));
  const waterFeature = isStartingArea(point) ? null : isOcean ? 'sea' : lake ? 'lake' : mainRiver || westBranch || southBranch ? 'river' : null;
  const waterEdge = isStartingArea(point) ? null : isOcean ? null : lake ? 'south' : mainRiver ? (Math.sin((point.y - 2) * 0.48) >= 0 ? 'east' : 'west') : westBranch || southBranch ? 'south' : null;

  const ridgeLine = 3.2 + Math.sin(point.x * 0.55) * 0.7;
  const isRidge = !isOcean && (point.y <= ridgeLine || (point.x >= 8 && point.y <= 4));
  const isWoodland = !isOcean && !isRidge && ((point.x <= 2 && point.y >= 5) || (point.x >= 6 && point.y >= 7) || (point.x === 4 && point.y === 5));
  const isAutumn = !isOcean && !isRidge && !isWoodland && point.y >= 10 && point.x <= 3;
  const terrain = isOcean ? 'ocean' : isRidge ? 'rock' : isWoodland ? 'woodland' : isAutumn ? 'autumn' : 'meadow';

  const horizontalRoad = !isOcean && (
    (point.y === 7 && point.x >= -1 && point.x <= 8) ||
    (point.y === 4 && point.x >= 2 && point.x <= 5) ||
    (point.y === 3 && point.x >= 5 && point.x <= 9) ||
    (point.y === 10 && point.x >= 3 && point.x <= 10) ||
    (point.y === 12 && point.x >= 1 && point.x <= 3)
  );
  
  const verticalRoad = !isOcean && (
    (point.x === 4 && point.y >= 4 && point.y <= 8) ||
    (point.x === 5 && point.y >= 2 && point.y <= 4) ||
    (point.x === 9 && point.y >= 3 && point.y <= 7) ||
    (point.x === 3 && point.y >= 7 && point.y <= 12) ||
    (point.x === 6 && point.y >= 7 && point.y <= 10)
  );
  
  const road = horizontalRoad && verticalRoad ? 'cross' : horizontalRoad ? 'horizontal' : verticalRoad ? 'vertical' : 'none';
  const bridge = waterFeature !== null && !isOcean && road !== 'none';

  return {
    ...point,
    terrain,
    regionStyle,
    waterFeature,
    waterEdge,
    road,
    bridge,
    landmark: MAP_LANDMARKS[point.x + ',' + point.y] || null,
  };
}

export function getAtlasTiles(chunk: Point): Array<MapTile & { current: boolean }> {
  const atlasWidth = ATLAS_BOUNDS.maxX - ATLAS_BOUNDS.minX + 1;
  const atlasHeight = ATLAS_BOUNDS.maxY - ATLAS_BOUNDS.minY + 1;
  
  return Array.from({ length: atlasWidth * atlasHeight }, (_, index) => {
    const row = Math.floor(index / atlasWidth);
    const column = index % atlasWidth;
    const point = { x: ATLAS_BOUNDS.minX + column, y: ATLAS_BOUNDS.minY + row };
    return { ...mapTileFor(point), current: point.x === chunk.x && point.y === chunk.y };
  });
}

export function mapTileClass(tile: MapTile & { current: boolean }): string {
  return [
    'map-tile',
    'map-terrain-' + tile.terrain,
    'map-region-' + tile.regionStyle,
    tile.waterFeature ? 'is-' + tile.waterFeature : '',
    tile.waterEdge ? 'water-edge-' + tile.waterEdge : '',
    tile.road !== 'none' ? 'has-road road-' + tile.road : '',
    tile.bridge ? 'has-bridge' : '',
    tile.current ? 'is-current' : '',
  ].filter(Boolean).join(' ');
}
