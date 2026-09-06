import type { Point, FieldTree, FieldAccent, FieldRect } from './types';
import type { RegionStyle } from './constants';
import { isTutorialCenter } from './worldGen';
import { MAP_LANDMARKS, mapTileFor } from './worldGen';
import { regionStyleFor } from './worldGen';

export function fieldHouseRects(kind: 'village' | 'town', startingArea = false): FieldRect[] {
  const parent = kind === 'town'
    ? { left: 19, top: 21, width: 62, height: 58 }
    : { left: 23, top: 24, width: 54, height: 52 };
  const specs = [
    { left: 8, top: 11, width: 19, height: 13, scale: 1 },
    { left: 73, top: 12, width: 19, height: 13, scale: 1 },
    { left: 8, top: 75, width: 19, height: 13, scale: 1 },
    { left: 73, top: 75, width: 19, height: 13, scale: 1 },
  ];

  if (!startingArea) {
    specs.push(
      { left: 39, top: 7, width: 19, height: 13, scale: 0.8 },
      { left: 39, top: 80, width: 19, height: 13, scale: 0.8 },
    );
  }

  return specs.map((spec) => {
    const width = spec.width * spec.scale;
    const height = spec.height * spec.scale;
    const left = spec.left + (spec.width - width) / 2;
    const top = spec.top + (spec.height - height) / 2;
    return {
      left: parent.left + (left / 100) * parent.width,
      top: parent.top + (top / 100) * parent.height,
      right: parent.left + ((left + width) / 100) * parent.width,
      bottom: parent.top + ((top + height) / 100) * parent.height,
    };
  });
}

export function pointInRect(point: Point, rect: FieldRect, padding = 0): boolean {
  return point.x >= rect.left - padding && point.x <= rect.right + padding && point.y >= rect.top - padding && point.y <= rect.bottom + padding;
}

export function pointOnFieldRoad(point: Point, road: MapTile['road']): boolean {
  // Keep tree canopies and trunks off the full road corridor, not just its center line.
  const onHorizontalRoad = point.y >= 44 && point.y <= 59;
  const onVerticalRoad = point.x >= 44 && point.x <= 59;
  return road === 'horizontal' ? onHorizontalRoad : road === 'vertical' ? onVerticalRoad : road === 'cross' ? onHorizontalRoad || onVerticalRoad : false;
}

export function fieldTreesFor(chunk: Point): FieldTree[] {
  const startingCenter = isTutorialCenter(chunk);
  const landmark = MAP_LANDMARKS[chunk.x + ',' + chunk.y];
  const treeStyle = regionStyleFor(chunk);
  const road = mapTileFor(chunk).road;

  if (startingCenter) {
    const perimeterTrees = [
      { x: 12, y: 13, scale: 0.56, variant: 1 },
      { x: 77, y: 13, scale: 0.56, variant: 2 },
      { x: 12, y: 78, scale: 0.56, variant: 2 },
      { x: 77, y: 78, scale: 0.56, variant: 1 },
    ];
    return perimeterTrees.map((tree, id) => ({ ...tree, id, style: treeStyle }));
  }

  let seed = Math.abs((chunk.x * 92837111) + (chunk.y * 689287499)) + 1;
  const random = () => {
    const value = Math.sin(seed++) * 10000;
    return value - Math.floor(value);
  };
  
  const houseRects = landmark ? fieldHouseRects(landmark.kind) : [];
  const trees: FieldTree[] = [];
  const targetCount = 8 + Math.floor(random() * 5);
  let attempts = 0;

  while (trees.length < targetCount && attempts < targetCount * 24) {
    attempts += 1;
    const x = 14 + random() * 72;
    const y = 13 + random() * 74;
    const scale = 0.72 + random() * 0.48;
    const center = { x: x + 3.2 * scale, y: y + 2.5 * scale };
    const tooCloseToStart = Math.hypot(center.x - 50, center.y - 52) < 12;
    const tooCloseToBuilding = houseRects.some((rect) => pointInRect(center, rect, 5));
    const tooCloseToTree = trees.some((tree) => Math.hypot(center.x - (tree.x + 3.2 * tree.scale), center.y - (tree.y + 2.5 * tree.scale)) < 9);
    const tooCloseToRoad = pointOnFieldRoad(center, road);
    if (tooCloseToStart || tooCloseToBuilding || tooCloseToTree || tooCloseToRoad) continue;
    trees.push({ id: trees.length, x, y, scale, variant: Math.floor(random() * 3), style: treeStyle });
  }

  return trees;
}

export function fieldAccentsFor(chunk: Point): FieldAccent[] {
  const tile = mapTileFor(chunk);
  if (tile.waterFeature) return [];

  const landmark = MAP_LANDMARKS[chunk.x + ',' + chunk.y];
  const startingCenter = isTutorialCenter(chunk);
  const houseRects = landmark ? fieldHouseRects(landmark.kind, startingCenter) : [];
  
  let seed = Math.abs((chunk.x * 19349663) ^ (chunk.y * 83492791)) + 17;
  const random = () => {
    const value = Math.sin(seed++) * 10000;
    return value - Math.floor(value);
  };
  
  const accents: FieldAccent[] = [];
  const targetCount = startingCenter ? 16 : tile.terrain === 'rock' ? 11 : 13 + Math.floor(random() * 7);
  let attempts = 0;

  while (accents.length < targetCount && attempts < targetCount * 20) {
    attempts += 1;
    const x = 8 + random() * 84;
    const y = 9 + random() * 82;
    const tooCloseToBuilding = houseRects.some((rect) => pointInRect({ x, y }, rect, 4));
    const tooCloseToTownCenter = startingCenter && Math.hypot(x - 50, y - 52) < 15;
    const tooCloseToRoad = pointOnFieldRoad({ x, y }, tile.road);
    const tooCloseToAccent = accents.some((accent) => Math.hypot(x - accent.x, y - accent.y) < 6);
    if (tooCloseToBuilding || tooCloseToTownCenter || tooCloseToRoad || tooCloseToAccent) continue;

    const kind: 'grass' | 'flower' | 'stone' | 'leaf' = tile.terrain === 'rock'
      ? 'stone'
      : tile.terrain === 'autumn'
        ? (random() > 0.42 ? 'leaf' : 'grass')
        : tile.terrain === 'woodland'
          ? (random() > 0.5 ? 'leaf' : 'grass')
          : (random() > 0.7 ? 'flower' : 'grass');
    
    accents.push({
      id: accents.length,
      x,
      y,
      scale: 0.72 + random() * 0.56,
      rotation: -18 + random() * 36,
      kind,
    });
  }

  return accents;
}

// Import MapTile type for proper typing
import type { MapTile } from './types';
