import { useEffect, useRef, useState } from 'react';
import { Backpack, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Coins, Map, Minus, Plus, Sword, Volume2, VolumeX, X } from 'lucide-react';
import { type CSSProperties } from 'react';
import { type PointerEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { createAdventureBrain, type RPGBrain } from '@/game/rpgBrain';

const queryClient = new QueryClient();
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
type Direction = 'up' | 'down' | 'left' | 'right';
type Point = { x: number; y: number };
type HorseState = { chunk: Point; position: Point };

const WALK_SPEED = 96; // 3x the original walking speed
const HORSE_SPEED = 180;
const HORSE_MOUNT_DISTANCE = 4.5;
const initialHorseState: HorseState = { chunk: { x: 4, y: 7 }, position: { x: 58, y: 52 } };

const directionKeys: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const delta: Record<Direction, Point> = {
  up: { x: 0, y: -2.4 }, down: { x: 0, y: 2.4 }, left: { x: -2.4, y: 0 }, right: { x: 2.4, y: 0 },
};
const terrainTypes = ['meadow', 'woodland', 'rock', 'shore', 'autumn', 'ocean'] as const;
type Terrain = (typeof terrainTypes)[number];
const fieldPalettes: Record<Terrain, { field: string; path: string; glow: string }> = {
  meadow: { field: '#77a45b', path: '#d9b979', glow: 'rgba(255, 227, 157, .22)' },
  woodland: { field: '#658e58', path: '#c7a66b', glow: 'rgba(180, 214, 141, .18)' },
  rock: { field: '#87927a', path: '#c9b27d', glow: 'rgba(238, 228, 186, .2)' },
  shore: { field: '#6f9b88', path: '#dfc58d', glow: 'rgba(218, 239, 194, .2)' },
  autumn: { field: '#9b785d', path: '#d6ae70', glow: 'rgba(255, 198, 123, .2)' },
  ocean: { field: '#2a6f8d', path: '#8ab8bd', glow: 'rgba(140, 213, 219, .2)' },
};

type RegionStyle = 'greenvale' | 'brackenfen' | 'ironwood' | 'northwatch' | 'sunwash' | 'ocean';
const regionPalettes: Record<Exclude<RegionStyle, 'ocean'>, { field: string; path: string; glow: string }> = {
  greenvale: { field: '#77a45b', path: '#d9b979', glow: 'rgba(255, 227, 157, .22)' },
  brackenfen: { field: '#617d51', path: '#bca979', glow: 'rgba(186, 207, 135, .2)' },
  ironwood: { field: '#587b58', path: '#c4a26c', glow: 'rgba(188, 219, 157, .18)' },
  northwatch: { field: '#858a78', path: '#d0bd8b', glow: 'rgba(238, 228, 186, .2)' },
  sunwash: { field: '#9a7658', path: '#d7ac6b', glow: 'rgba(255, 198, 123, .2)' },
};

const coastlineWater = new Set([
  '-3,1', '-2,1', '-1,1', '0,1', '1,1', '2,1', '9,1', '10,1', '11,1',
  '-3,2', '-2,2', '10,2', '11,2', '-3,3', '11,3', '-3,4', '11,4',
  '-3,5', '11,5', '-3,6', '11,6', '-3,7', '11,7', '-3,8', '11,8',
  '-3,9', '11,9', '-3,10', '10,10', '11,10', '-3,11', '9,11', '10,11', '11,11',
  '-3,12', '-2,12', '8,12', '9,12', '10,12', '11,12', '-3,13', '-2,13', '-1,13', '0,13', '1,13', '7,13', '8,13', '9,13', '10,13', '11,13',
]);

function isContinentChunk(point: Point) {
  return point.x >= -3 && point.x <= 11 && point.y >= 1 && point.y <= 13 && !coastlineWater.has(point.x + ',' + point.y);
}

function regionStyleFor(point: Point): RegionStyle {
  if (!isContinentChunk(point)) return 'ocean';
  if (point.y <= 4 || (point.y === 5 && point.x >= 5)) return 'northwatch';
  if (point.x <= 1) return 'brackenfen';
  if (point.x >= 7) return 'ironwood';
  if (point.y >= 10) return 'sunwash';
  return 'greenvale';
}

function chunkTerrain(chunk: Point): Terrain {
  const seed = Math.abs((chunk.x * 73856093) ^ (chunk.y * 19349663));
  return terrainTypes[seed % terrainTypes.length];
}

type SettlementKind = 'village' | 'town';
type MapTile = {
  x: number;
  y: number;
  terrain: Terrain;
  regionStyle: RegionStyle;
  waterFeature: 'river' | 'lake' | 'sea' | null;
  waterEdge: 'north' | 'south' | 'east' | 'west' | null;
  road: 'horizontal' | 'vertical' | 'cross' | 'none';
  bridge: boolean;
  landmark: { name: string; kind: SettlementKind } | null;
};

const mapLandmarks: Record<string, { name: string; kind: SettlementKind }> = {
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

function isStartingArea(point: Point) {
  return point.x === 4 && point.y === 7;
}

function mapTileFor(point: Point): MapTile {
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
    landmark: mapLandmarks[point.x + ',' + point.y] || null,
  };
}

type FieldTree = { id: number; x: number; y: number; scale: number; variant: number; style: RegionStyle };
type FieldRect = { left: number; top: number; right: number; bottom: number };

function fieldHouseRects(kind: SettlementKind, startingArea = false): FieldRect[] {
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

function pointInRect(point: Point, rect: FieldRect, padding = 0) {
  return point.x >= rect.left - padding && point.x <= rect.right + padding && point.y >= rect.top - padding && point.y <= rect.bottom + padding;
}

function pointOnFieldRoad(point: Point, road: MapTile['road']) {
  // Keep tree canopies and trunks off the full road corridor, not just its center line.
  const onHorizontalRoad = point.y >= 44 && point.y <= 59;
  const onVerticalRoad = point.x >= 44 && point.x <= 59;
  return road === 'horizontal' ? onHorizontalRoad : road === 'vertical' ? onVerticalRoad : road === 'cross' ? onHorizontalRoad || onVerticalRoad : false;
}

function fieldTreesFor(chunk: Point): FieldTree[] {
  const startingArea = isStartingArea(chunk);
  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
  const treeStyle = regionStyleFor(chunk);
  const road = mapTileFor(chunk).road;

  if (startingArea) {
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

function isFieldPositionBlocked(position: Point, chunk: Point) {
  const tile = mapTileFor(chunk);
  if (tile.waterFeature === 'sea' || (tile.waterFeature !== null && !tile.bridge)) return true;

  if (doorwayNear(position, chunk)) return false;

  const treeBlocked = fieldTreesFor(chunk).some((tree) => {
    const center = { x: tree.x + 3.2 * tree.scale, y: tree.y + 2.5 * tree.scale };
    return Math.hypot(position.x - center.x, position.y - center.y) < 5.2 * tree.scale;
  });
  if (treeBlocked) return true;

  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
  return landmark ? fieldHouseRects(landmark.kind, isStartingArea(chunk)).some((rect) => pointInRect(position, rect, 2.5)) : false;
}

function wrapFieldPosition(position: Point, chunk: Point) {
  const nextPosition = { ...position };
  const nextChunk = { ...chunk };
  const travelLabels: string[] = [];
  if (nextPosition.x < 4) { nextPosition.x = 94; nextChunk.x -= 1; travelLabels.push('west'); }
  if (nextPosition.x > 96) { nextPosition.x = 6; nextChunk.x += 1; travelLabels.push('east'); }
  if (nextPosition.y < 4) { nextPosition.y = 94; nextChunk.y -= 1; travelLabels.push('north'); }
  if (nextPosition.y > 96) { nextPosition.y = 6; nextChunk.y += 1; travelLabels.push('south'); }
  return { position: nextPosition, chunk: nextChunk, travelLabels };
}

function resolveFieldMovement(current: Point, movement: Point, chunk: Point) {
  const candidates = [
    { x: current.x + movement.x, y: current.y + movement.y },
    { x: current.x + movement.x, y: current.y },
    { x: current.x, y: current.y + movement.y },
  ];
  for (const candidate of candidates) {
    const wrapped = wrapFieldPosition(candidate, chunk);
    if (!isFieldPositionBlocked(wrapped.position, wrapped.chunk)) return wrapped;
  }
  return null;
}

type InteriorArea = { id: string; name: string; description: string; roomType: 'guild' | 'inn' | 'chapel' | 'building'; exteriorPosition: Point };
type Doorway = { id: string; position: Point; area: InteriorArea; buildingIndex?: number };
const startingDoorways: Doorway[] = [
  { id: 'guild-door', buildingIndex: 0, position: { x: 30, y: 36 }, area: { id: 'wayfarer-guild', name: 'Wayfarer Guild', description: 'Maps, contracts, and road-worn notices fill the guild hall.', roomType: 'guild', exteriorPosition: { x: 30, y: 48 } } },
  { id: 'inn-door', buildingIndex: 1, position: { x: 70, y: 36 }, area: { id: 'moonwell-inn', name: 'Moonwell Inn', description: 'A warm common room where travelers trade rumors over stew.', roomType: 'inn', exteriorPosition: { x: 70, y: 48 } } },
  { id: 'chapel-door', buildingIndex: 2, position: { x: 30, y: 72 }, area: { id: 'rootbound-chapel', name: 'Rootbound Chapel', description: 'Lanterns glow beneath old roots in the quiet town chapel.', roomType: 'chapel', exteriorPosition: { x: 30, y: 60 } } },
];

function buildingDoorwaysFor(chunk: Point): Doorway[] {
  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
  if (!landmark) return [];
  return fieldHouseRects(landmark.kind, isStartingArea(chunk)).map((rect, index) => {
    const namedDoorway = isStartingArea(chunk) ? startingDoorways.find((doorway) => doorway.buildingIndex === index) : null;
    if (namedDoorway) return namedDoorway;
    const position = { x: (rect.left + rect.right) / 2, y: Math.min(88, rect.bottom + 4) };
    return {
      id: chunk.x + ',' + chunk.y + '-building-' + index,
      position,
      area: {
        id: chunk.x + '-' + chunk.y + '-building-' + index,
        name: landmark.name + ' House ' + (index + 1),
        description: 'A simple brown room waiting to be furnished.',
        roomType: 'building' as const,
        exteriorPosition: { x: position.x, y: Math.min(94, position.y + 8) },
      },
    };
  });
}

function doorwayNear(position: Point, chunk: Point) {
  return buildingDoorwaysFor(chunk).find((doorway) => Math.hypot(position.x - doorway.position.x, position.y - doorway.position.y) <= 4.2) || null;
}

function canEnterDoorway(currentPosition: Point, nextPosition: Point, doorway: Doorway, direction: Direction) {
  return direction === 'up'
    && currentPosition.y > doorway.position.y
    && nextPosition.y <= doorway.position.y + 4.2
    && Math.abs(nextPosition.x - doorway.position.x) <= 4.2;
}

type GoatDisposition = 'calm' | 'aggressive' | 'defeated';
type GoatState = { id: number; position: Point; facing: Direction; hp: number; maxHp: number; disposition: GoatDisposition; attackCooldown: number };
const GOAT_STEP = 2.4;
const GOAT_ATTACK_RANGE = 9;
const GOAT_ATTACK_DAMAGE = 3;
const startingGoatPositions: Point[] = [
  { x: 13, y: 18 }, { x: 29, y: 14 }, { x: 72, y: 14 }, { x: 87, y: 19 },
  { x: 12, y: 43 }, { x: 88, y: 44 }, { x: 14, y: 82 }, { x: 31, y: 87 },
  { x: 70, y: 86 }, { x: 87, y: 80 },
];
function goatsForChunk(chunk: Point): GoatState[] {
  if (mapTileFor(chunk).terrain === 'ocean') return [];
  const positions = isStartingArea(chunk) ? startingGoatPositions : Array.from({ length: mapTileFor(chunk).terrain === 'meadow' ? 4 : 2 }, (_, index) => ({ x: 16 + ((Math.abs(chunk.x * 47 + chunk.y * 71 + index * 29) * 13) % 68), y: 17 + ((Math.abs(chunk.x * 31 + chunk.y * 53 + index * 41) * 17) % 66) }));
  const safePositions = positions.filter((position) => !isFieldPositionBlocked(position, chunk));
  return safePositions.map((position, index) => ({ id: index, position, facing: index % 2 ? 'left' : 'right', hp: 18, maxHp: 18, disposition: 'calm', attackCooldown: 0 }));
}
function goatDistance(goat: GoatState, position: Point) { return Math.hypot(goat.position.x - position.x, goat.position.y - position.y); }
function moveGoatIndependently(goat: GoatState, index: number, worldStep: number, playerPosition: Point, chunk: Point, goats: GoatState[]) {
  if (goat.disposition === 'defeated') return goat;
  const distance = goatDistance(goat, playerPosition);
  let direction: Direction;
  if (goat.disposition === 'aggressive' && distance > GOAT_ATTACK_RANGE) {
    const horizontal = playerPosition.x - goat.position.x;
    const vertical = playerPosition.y - goat.position.y;
    direction = Math.abs(horizontal) >= Math.abs(vertical) ? (horizontal >= 0 ? 'right' : 'left') : (vertical >= 0 ? 'down' : 'up');
  } else { direction = (['up', 'right', 'down', 'left'] as Direction[])[Math.abs((worldStep + index * 7) % 4)]; }
  const nextPosition = { x: Math.min(88, Math.max(12, goat.position.x + (direction === 'right' ? GOAT_STEP : direction === 'left' ? -GOAT_STEP : 0))), y: Math.min(88, Math.max(12, goat.position.y + (direction === 'down' ? GOAT_STEP : direction === 'up' ? -GOAT_STEP : 0))) };
  const occupied = goats.some((other) => other.id !== goat.id && other.disposition !== 'defeated' && Math.hypot(other.position.x - nextPosition.x, other.position.y - nextPosition.y) < 5);
  return occupied || isFieldPositionBlocked(nextPosition, chunk) ? { ...goat, facing: direction } : { ...goat, position: nextPosition, facing: direction };
}


function mapTileClass(tile: MapTile & { current: boolean }) {
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

function chunkRegion(chunk: Point) {
  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
  if (landmark) return landmark.name;
  if (!isContinentChunk(chunk)) return 'Open Water';
  if (chunk.y <= 4) return 'Northwatch Heights';
  if (chunk.x <= 1) return 'Brackenfen Wilds';
  if (chunk.x >= 7) return 'Ironwood March';
  if (chunk.y >= 10) return 'Sunwash Coast';
  return 'Greenvale';
}

const initialLogs = [
  { text: 'You arrive at the Mosslight Crossing.', color: '' },
  { text: 'A test horse waits just east of the square.', color: 'blue' },
  { text: 'The east path is clear.', color: 'blue' },
  { text: 'Your field position was saved locally.', color: '' },
];

type TownNpc = {
  name: string;
  title: string;
  role: 'mage' | 'warrior' | 'guide' | 'rogue';
  position: Point;
  facing: Direction;
};

const startingTownNpcs: TownNpc[] = [
  { name: 'Noah', title: 'Mage teacher', role: 'mage', position: { x: 40, y: 47 }, facing: 'right' },
  { name: 'Damon', title: 'Warrior teacher', role: 'warrior', position: { x: 60, y: 47 }, facing: 'left' },
  { name: 'Shawn', title: 'Rogue instructor', role: 'rogue', position: { x: 50, y: 64 }, facing: 'up' },
];

const atlasBounds = { minX: -3, maxX: 11, minY: 1, maxY: 13 };
const CAMERA_DEAD_ZONE = 10;
function cameraShiftAxis(coordinate: number) {
  const offset = 50 - coordinate;
  if (Math.abs(offset) <= CAMERA_DEAD_ZONE) return 0;
  return Math.max(-4, Math.min(4, (offset - Math.sign(offset) * CAMERA_DEAD_ZONE) * 0.4));
}

function WorldMap({ chunk, onClose }: { chunk: Point; onClose: () => void }) {
  const [zoom, setZoom] = useState(2);
  const atlasWidth = atlasBounds.maxX - atlasBounds.minX + 1;
  const atlasHeight = atlasBounds.maxY - atlasBounds.minY + 1;
  const mapScale = [0.84, 0.96, 1.08, 1.22][zoom - 1];
  const tiles = Array.from({ length: atlasWidth * atlasHeight }, (_, index) => {
    const row = Math.floor(index / atlasWidth);
    const column = index % atlasWidth;
    const point = { x: atlasBounds.minX + column, y: atlasBounds.minY + row };
    return { ...mapTileFor(point), current: point.x === chunk.x && point.y === chunk.y };
  });
  const currentTile = mapTileFor(chunk);

  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="map-title" data-testid="overlay-world-map">
      <div className="map-sheet">
        <div className="map-sheet-heading">
          <div><span className="atlas-eyebrow">Chart of the known coast</span><h2 id="map-title">The Far Meadow</h2></div>
          <button className="map-close" onClick={onClose} aria-label="Close world map" data-testid="button-close-map"><X size={19} /></button>
        </div>
        <div className="map-toolbar">
          <span className="map-area-label">{currentTile.landmark?.name || chunkRegion(chunk)} · {currentTile.terrain}</span>
          <div className="map-zoom-controls" aria-label="Map zoom controls">
            <button className="map-zoom-button" onClick={() => setZoom((value) => Math.max(1, value - 1))} disabled={zoom === 1} aria-label="Zoom out" data-testid="button-map-zoom-out"><Minus size={15} /></button>
            <span className="map-zoom-level">×{zoom}</span>
            <button className="map-zoom-button" onClick={() => setZoom((value) => Math.min(4, value + 1))} disabled={zoom === 4} aria-label="Zoom in" data-testid="button-map-zoom-in"><Plus size={15} /></button>
          </div>
        </div>
        <div className="big-map" data-testid="map-world-preview">
          <span className="atlas-compass" aria-hidden="true"><strong>N</strong><span>↑</span></span>
          <span className="atlas-region-label atlas-region-north">NORTHWATCH HEIGHTS</span>
          <span className="atlas-region-label atlas-region-west">BRACKENFEN WILDS</span>
          <span className="atlas-region-label atlas-region-east">IRONWOOD MARCH</span>
          <span className="atlas-region-label atlas-region-south">SUNWASH COAST</span>
          <div className="map-grid" style={{ gridTemplateColumns: 'repeat(' + atlasWidth + ', minmax(0, 1fr))', gridTemplateRows: 'repeat(' + atlasHeight + ', minmax(0, 1fr))', transform: 'scale(' + mapScale + ')' }}>
            {tiles.map((tile) => (
              <div className={mapTileClass(tile)} key={tile.x + '-' + tile.y} title={'Chunk ' + tile.x + ', ' + tile.y + ' · ' + (tile.landmark?.name || chunkRegion(tile))}>
                {tile.landmark && <><span className={'map-settlement ' + tile.landmark.kind} aria-label={tile.landmark.name} /><span className="map-settlement-name">{tile.landmark.name}</span></>}
                {tile.current && <span className="map-tile-player" aria-label="Your current position" />}
                {tile.current && <span className="map-tile-label">{tile.x}, {tile.y}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="map-legend">
          <span className="legend-item"><span className="legend-dot" /> You are here</span>
          <span className="legend-item"><span className="legend-town" /> Town</span>
          <span className="legend-item"><span className="legend-line river" /> River</span>
          <span className="legend-item"><span className="legend-line road" /> King’s road</span>
          <span className="legend-item">Chunk {chunk.x}, {chunk.y} · {chunkRegion(chunk)}</span>
        </div>
      </div>
    </div>
  );
}

function InventorySheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="inventory-title" data-testid="overlay-inventory">
      <div className="map-sheet inventory-sheet">
        <div className="map-sheet-heading">
          <h2 id="inventory-title">Inventory</h2>
          <button className="map-close" onClick={onClose} aria-label="Close inventory" data-testid="button-close-inventory"><X size={19} /></button>
        </div>
        <div className="inventory-body">
          <div className="inventory-count">0 items carried</div>
          <div className="inventory-empty">
            <Backpack size={30} strokeWidth={1.5} />
            <strong>Your pack is empty</strong>
            <span>Items you discover on the road will appear here.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InteriorRoom({ area, position }: { area: InteriorArea; position: Point }) {
  return (
    <div className={'interior-scene interior-' + area.roomType} aria-label={area.name + ' interior'} data-testid={'interior-' + area.id}>
      <div className="interior-header"><span className="interior-kicker">Mosslight Crossing</span><strong>{area.name}</strong><span>{area.description}</span></div>
      <div className="interior-room" aria-hidden="true"><span className="interior-rug" /><span className="interior-table" /><span className="interior-counter" /><span className="interior-shelf shelf-left" /><span className="interior-shelf shelf-right" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></div>
      <div className="interior-doorway" aria-label="Exit to Mosslight Crossing"><span>EXIT</span></div>
      <div className="interior-player" style={{ left: position.x + '%', top: position.y + '%' }}><span className="player-sprite" /></div>
      <div className="interior-exit-hint">Walk to the door to leave</div>
    </div>
  );
}

function GameField({ onOpenMap, onOpenInventory, onChunkChange, muted, onToggleMute, inputLocked }: { onOpenMap: () => void; onOpenInventory: () => void; onChunkChange: (chunk: Point) => void; muted: boolean; onToggleMute: () => void; inputLocked: boolean }) {
  const [position, setPosition] = useState<Point>({ x: 51, y: 52 });
  const [chunk, setChunk] = useState<Point>({ x: 4, y: 7 });
  const [areaFlash, setAreaFlash] = useState<{ id: string; label: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState<Direction>('down');
  const [mounted, setMounted] = useState(false);
  const [horse, setHorse] = useState<HorseState>(initialHorseState);
  const [horseFacing, setHorseFacing] = useState<Direction>('down');
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState(initialLogs);
  const [time, setTime] = useState('08:43');
  const [playerHp, setPlayerHp] = useState(84);
  const [goats, setGoats] = useState<GoatState[]>(() => goatsForChunk({ x: 4, y: 7 }));
  const [attackFlash, setAttackFlash] = useState<string | null>(null);
  const [interior, setInterior] = useState<InteriorArea | null>(null);
  const [interiorPosition, setInteriorPosition] = useState<Point>({ x: 50, y: 84 });
  const keysRef = useRef<Partial<Record<Direction, boolean>>>({});
  const positionRef = useRef(position);
  const chunkRef = useRef(chunk);
  const mountedRef = useRef(mounted);
  const horseRef = useRef(horse);
  const horseIdleAnchorRef = useRef(initialHorseState.position);
  const gameFrameRef = useRef<HTMLDivElement>(null);
  const areaFlashIdRef = useRef(0);
  const goatsRef = useRef(goats);
  const playerHpRef = useRef(playerHp);
  const interiorRef = useRef(interior);
  const interiorPositionRef = useRef(interiorPosition);
  const interiorDoorwayIdRef = useRef<string | null>(null);
  const doorwayExitCooldownRef = useRef<string | null>(null);
  const goatWorldStepRef = useRef(0);
  const brainRef = useRef<RPGBrain | null>(null);
  if (brainRef.current === null) {
    const brain = createAdventureBrain();
    brain.movePlayer('mosslight-crossing');
    brainRef.current = brain;
  }

  useEffect(() => {
    [
      assetUrl('assets/gameplay/shining-fields/characters/player/idle.png'),
      assetUrl('assets/gameplay/shining-fields/characters/player/run.png'),
    ].forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { chunkRef.current = chunk; }, [chunk]);
  useEffect(() => { mountedRef.current = mounted; }, [mounted]);
  useEffect(() => { horseRef.current = horse; }, [horse]);
  useEffect(() => { goatsRef.current = goats; }, [goats]);
  useEffect(() => { playerHpRef.current = playerHp; }, [playerHp]);
  useEffect(() => { interiorRef.current = interior; }, [interior]);
  useEffect(() => { interiorPositionRef.current = interiorPosition; }, [interiorPosition]);
  useEffect(() => {
    if (inputLocked) {
      keysRef.current = {};
      setMoving(false);
    }
  }, [inputLocked]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentGoats = goatsRef.current;
      if (currentGoats.length === 0 || interiorRef.current) return;
      goatWorldStepRef.current += 1;
      const currentPlayer = positionRef.current;
      const currentChunk = chunkRef.current;
      let damageTaken = 0;
      const nextGoats = currentGoats.map((goat, index) => {
        if (goat.disposition !== 'aggressive' || goat.attackCooldown > 0) {
          const moved = moveGoatIndependently(goat, index, goatWorldStepRef.current, currentPlayer, currentChunk, currentGoats);
          return { ...moved, attackCooldown: Math.max(0, moved.attackCooldown - 1) };
        }
        if (goatDistance(goat, currentPlayer) <= GOAT_ATTACK_RANGE) {
          damageTaken += GOAT_ATTACK_DAMAGE;
          return { ...goat, attackCooldown: 2 };
        }
        return moveGoatIndependently(goat, index, goatWorldStepRef.current, currentPlayer, currentChunk, currentGoats);
      });
      goatsRef.current = nextGoats;
      setGoats(nextGoats);
      if (damageTaken > 0) {
        const nextHp = Math.max(0, playerHpRef.current - damageTaken);
        playerHpRef.current = nextHp;
        setPlayerHp(nextHp);
        setLogs((currentLogs) => [{ text: 'A hostile goat rams you for ' + damageTaken + ' damage.', color: 'red' }, ...currentLogs].slice(0, 3));
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (mounted) return;

    const idleDirections: Direction[] = ['up', 'down', 'left', 'right'];
    let idleTimer = 0;
    const scheduleIdleAction = () => {
      idleTimer = window.setTimeout(() => {
        if (mountedRef.current) return;

        const direction = idleDirections[Math.floor(Math.random() * idleDirections.length)];
        setHorseFacing(direction);

        if (Math.random() < 0.38) {
          const currentHorse = horseRef.current;
          const idleStep = 3;
          const nextPosition = {
            x: currentHorse.position.x + (direction === 'left' ? -idleStep : direction === 'right' ? idleStep : 0),
            y: currentHorse.position.y + (direction === 'up' ? -idleStep : direction === 'down' ? idleStep : 0),
          };
          const anchor = horseIdleAnchorRef.current;
          const withinIdleArea = Math.hypot(nextPosition.x - anchor.x, nextPosition.y - anchor.y) <= 9;
          const withinField = nextPosition.x >= 12 && nextPosition.x <= 88 && nextPosition.y >= 12 && nextPosition.y <= 88;

          if (withinIdleArea && withinField) {
            setHorse((current) => ({ ...current, position: nextPosition }));
          }
        }

        if (!mountedRef.current) scheduleIdleAction();
      }, 2200 + Math.random() * 2800);
    };

    scheduleIdleAction();
    return () => window.clearTimeout(idleTimer);
  }, [mounted]);

  useEffect(() => {
    areaFlashIdRef.current += 1;
    setAreaFlash({ id: String(areaFlashIdRef.current), label: chunkRegion(chunk) });
  }, [chunk]);

  useEffect(() => {
    const nextGoats = goatsForChunk(chunk);
    goatsRef.current = nextGoats;
    setGoats(nextGoats);
    goatWorldStepRef.current = 0;
  }, [chunk]);

  useEffect(() => {
    if (!areaFlash) return;
    const timer = window.setTimeout(() => setAreaFlash(null), 1700);
    return () => window.clearTimeout(timer);
  }, [areaFlash]);

  useEffect(() => {
    const clearInput = () => {
      keysRef.current = {};
      setMoving(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (inputLocked) return;
      if (event.code === 'Space' || event.code === 'KeyF') { event.preventDefault(); attackGoat(); return; }
      const direction = directionKeys[event.code];
      if (!direction) return;
      event.preventDefault();
      keysRef.current[direction] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const direction = directionKeys[event.code];
      if (!direction) return;
      event.preventDefault();
      keysRef.current[direction] = false;
    };
    const onVisibilityChange = () => { if (document.hidden) clearInput(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', onVisibilityChange);

    let animationFrame = 0;
    let lastFrame = performance.now();
    const animate = (now: number) => {
      const elapsed = Math.min(50, now - lastFrame) / 1000;
      lastFrame = now;
      const input = {
        x: inputLocked ? 0 : (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0),
        y: inputLocked ? 0 : (keysRef.current.down ? 1 : 0) - (keysRef.current.up ? 1 : 0),
      };
      const length = Math.hypot(input.x, input.y);
      const active = length > 0;
      setMoving(active);

      
       const currentInterior = interiorRef.current;
       if (active && currentInterior) {
         const frameWidth = gameFrameRef.current?.clientWidth || window.innerWidth;
         const frameHeight = gameFrameRef.current?.clientHeight || window.innerHeight;
         const movement = { x: (input.x / length) * 150 * elapsed * 100 / frameWidth, y: (input.y / length) * 150 * elapsed * 100 / frameHeight };
         const current = interiorPositionRef.current;
         const next = { x: Math.min(90, Math.max(10, current.x + movement.x)), y: current.y + movement.y };
         if (next.y > 91) {
           const exitPosition = currentInterior.exteriorPosition;
           doorwayExitCooldownRef.current = interiorDoorwayIdRef.current;
           interiorDoorwayIdRef.current = null;
           interiorRef.current = null; setInterior(null);
           interiorPositionRef.current = { x: 50, y: 84 }; setInteriorPosition({ x: 50, y: 84 });
           positionRef.current = exitPosition; setPosition(exitPosition);
           setLogs((currentLogs) => [{ text: 'You step back outside into Mosslight Crossing.', color: 'blue' }, ...currentLogs].slice(0, 3));
         } else { interiorPositionRef.current = next; setInteriorPosition(next); }
         animationFrame = window.requestAnimationFrame(animate); return;
       }
if (active) {
        const direction = input.x > 0 ? 'right' : input.x < 0 ? 'left' : input.y < 0 ? 'up' : 'down';
        setFacing(direction);
        const speed = mountedRef.current ? HORSE_SPEED : WALK_SPEED;
        const frameWidth = gameFrameRef.current?.clientWidth || window.innerWidth;
        const frameHeight = gameFrameRef.current?.clientHeight || window.innerHeight;
        const movement = {
          x: (input.x / length) * speed * elapsed * 100 / frameWidth,
          y: (input.y / length) * speed * elapsed * 100 / frameHeight,
        };
        const current = positionRef.current;
        const currentChunk = chunkRef.current;
        const attempted = { x: current.x + movement.x, y: current.y + movement.y };
        const cooldownDoor = doorwayExitCooldownRef.current
          ? buildingDoorwaysFor(currentChunk).find((doorway) => doorway.id === doorwayExitCooldownRef.current)
          : null;
        if (!cooldownDoor || Math.hypot(attempted.x - cooldownDoor.position.x, attempted.y - cooldownDoor.position.y) > 10) {
          doorwayExitCooldownRef.current = null;
        }
        const nearbyDoor = doorwayNear(attempted, currentChunk);
        if (nearbyDoor && nearbyDoor.id !== doorwayExitCooldownRef.current && canEnterDoorway(current, attempted, nearbyDoor, direction)) {
          interiorDoorwayIdRef.current = nearbyDoor.id;
          interiorRef.current = nearbyDoor.area; setInterior(nearbyDoor.area);
          interiorPositionRef.current = { x: 50, y: 84 }; setInteriorPosition({ x: 50, y: 84 });
          setMoving(false);
          setLogs((currentLogs) => [{ text: 'You enter the ' + nearbyDoor.area.name + '.', color: 'blue' }, ...currentLogs].slice(0, 3));
          animationFrame = window.requestAnimationFrame(animate); return;
        }
        const resolved = resolveFieldMovement(current, movement, currentChunk);
        if (resolved) {
          positionRef.current = resolved.position;
          setPosition(resolved.position);
          if (resolved.travelLabels.length > 0) {
            brainRef.current?.visitChunk(resolved.chunk, chunkRegion(resolved.chunk), resolved.travelLabels.join(' and '));
            chunkRef.current = resolved.chunk;
            setChunk(resolved.chunk);
            onChunkChange(resolved.chunk);
            setLogs((currentLogs) => [{
              text: `You travel ${resolved.travelLabels.join(' and ')} into ${chunkRegion(resolved.chunk)} · chunk ${resolved.chunk.x}, ${resolved.chunk.y}.`,
              color: 'blue',
            }, ...currentLogs].slice(0, 3));
          }
        }
      }
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    const clock = window.setInterval(() => {
      setTime((current) => {
        const [hours, minutes] = current.split(':').map(Number);
        const nextMinutes = minutes + 1;
        return String((hours + Math.floor(nextMinutes / 60)) % 24).padStart(2, '0') + ':' + String(nextMinutes % 60).padStart(2, '0');
      });
    }, 3000);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearInterval(clock);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onChunkChange, interior, inputLocked]);



  const attackGoat = () => {
    if (interiorRef.current) return;
    const currentPlayer = positionRef.current;
    const target = goatsRef.current.filter((goat) => goat.disposition !== 'defeated' && goatDistance(goat, currentPlayer) <= 14).sort((a, b) => (a.disposition === 'aggressive' ? 0 : 1) - (b.disposition === 'aggressive' ? 0 : 1) || goatDistance(a, currentPlayer) - goatDistance(b, currentPlayer))[0];
    if (!target) { setAttackFlash('No goat is close enough to strike.'); window.setTimeout(() => setAttackFlash(null), 900); return; }
    const nextHp = target.hp - 9;
    const defeated = nextHp <= 0;
    const nextGoats = goatsRef.current.map((goat) => goat.id === target.id ? { ...goat, hp: Math.max(0, nextHp), disposition: defeated ? 'defeated' as GoatDisposition : 'aggressive' as GoatDisposition, attackCooldown: 0 } : goat);
    goatsRef.current = nextGoats;
    setGoats(nextGoats);
    const message = defeated ? 'You defeat the goat.' : 'You strike a goat. It bleats angrily and charges!';
    setAttackFlash(message);
    setLogs((currentLogs) => [{ text: message, color: defeated ? 'blue' : 'red' }, ...currentLogs].slice(0, 3));
    window.setTimeout(() => setAttackFlash(null), 1100);
  };

  const pressDirection = (direction: Direction) => {
    keysRef.current[direction] = true;
    setMoving(true);
  };
  const releaseDirection = (direction: Direction) => {
    keysRef.current[direction] = false;
    setMoving(Object.values(keysRef.current).some(Boolean));
  };
  const beginDirection = (direction: Direction, event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pressDirection(direction);
  };
  const endDirection = (direction: Direction, event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    releaseDirection(direction);
  };

  const horseHere = horse.chunk.x === chunk.x && horse.chunk.y === chunk.y;
  const horseDistance = Math.hypot(position.x - horse.position.x, position.y - horse.position.y);
  const canMount = !mounted && horseHere && horseDistance <= HORSE_MOUNT_DISTANCE;
  const showHorse = mounted || horseHere;
  const horseDisplayPosition = mounted ? position : horse.position;

  const toggleMount = () => {
    if (mounted) {
      const currentPosition = positionRef.current;
      const currentChunk = chunkRef.current;
      const preferredOffset = facing === 'right' ? -6 : facing === 'left' ? 6 : currentPosition.x < 50 ? 6 : -6;
      const clampFieldPosition = (candidate: Point): Point => ({
        x: Math.min(88, Math.max(12, candidate.x)),
        y: Math.min(88, Math.max(12, candidate.y)),
      });
      const dismountCandidates = [
        { x: currentPosition.x + preferredOffset, y: currentPosition.y },
        { x: currentPosition.x - preferredOffset, y: currentPosition.y },
        { x: currentPosition.x, y: currentPosition.y - 7 },
        { x: currentPosition.x, y: currentPosition.y + 7 },
      ].map(clampFieldPosition);
      const dismountPosition = dismountCandidates.find((candidate) => !isFieldPositionBlocked(candidate, currentChunk)) || clampFieldPosition(currentPosition);
      horseIdleAnchorRef.current = dismountPosition;

      setHorse({ chunk: currentChunk, position: currentPosition });
      positionRef.current = dismountPosition;
      setPosition(dismountPosition);
      setMounted(false);
      setLogs((currentLogs) => [{ text: 'You dismount and leave the horse here.', color: '' }, ...currentLogs].slice(0, 3));
      return;
    }

    if (!canMount) {
      setLogs((currentLogs) => [{ text: horseHere ? 'The horse is too far away to mount.' : 'Your horse is in another field.', color: 'blue' }, ...currentLogs].slice(0, 3));
      return;
    }

    const currentChunk = chunkRef.current;
    const mountPosition = { ...horse.position };
    positionRef.current = mountPosition;
    setPosition(mountPosition);
    setHorse({ chunk: currentChunk, position: mountPosition });
    setMounted(true);
    setLogs((currentLogs) => [{ text: 'You mount the horse. The road opens ahead.', color: 'blue' }, ...currentLogs].slice(0, 3));
  };

  const currentWorldTile = mapTileFor(chunk);
  const fieldTrees = fieldTreesFor(chunk);
  const fieldPalette = currentWorldTile.regionStyle === 'ocean' ? fieldPalettes.ocean : regionPalettes[currentWorldTile.regionStyle];
  const startingArea = isStartingArea(chunk);
  const cameraShift = {
    x: cameraShiftAxis(position.x),
    y: cameraShiftAxis(position.y),
  };

  return (
    <div className="field-column">
      <div ref={gameFrameRef} className="game-frame" tabIndex={0} aria-label="Playable Mosslight Crossing field" data-testid="game-field" data-brain-chunk={brainRef.current?.currentChunkId || 'unknown'}>
        {interior ? <InteriorRoom area={interior} position={interiorPosition} /> : (
        <div className={'pixel-field world-field world-region-' + currentWorldTile.regionStyle + ' map-terrain-' + currentWorldTile.terrain + (currentWorldTile.waterFeature ? ' world-is-' + currentWorldTile.waterFeature : '') + (startingArea ? ' starting-area' : '')} data-terrain={currentWorldTile.terrain} data-region={currentWorldTile.regionStyle} style={{
          '--field-color': fieldPalette.field,
          '--path-color': fieldPalette.path,
          '--field-glow': fieldPalette.glow,
        } as CSSProperties}>
          <span className="field-edge top" /><span className="field-edge bottom" /><span className="field-edge left" /><span className="field-edge right" />
          <div className="field-world-layer" style={{ transform: 'translate(' + cameraShift.x + '%, ' + cameraShift.y + '%)' }}>
          {currentWorldTile.waterFeature && <div className={'field-water world-water-' + currentWorldTile.waterFeature + (currentWorldTile.waterEdge ? ' water-edge-' + currentWorldTile.waterEdge : '')} aria-hidden="true" />}
          {currentWorldTile.road !== 'none' && <div className={'field-road field-road-' + currentWorldTile.road + (currentWorldTile.bridge ? ' field-bridge' : '')} aria-hidden="true" />}
          {startingArea && (
            <div className="starting-area-decor" aria-hidden="true">
              <span className="starting-flower flower-northwest" />
              <span className="starting-flower flower-northeast" />
              <span className="starting-flower flower-southwest" />
              <span className="starting-flower flower-southeast" />
            </div>
          )}
          <div className="field-goats" aria-label="Goats in the field">
            {goats.filter((goat) => goat.disposition !== 'defeated').map((goat) => (
              <div className={'goat goat-' + goat.disposition} style={{ left: goat.position.x + '%', top: goat.position.y + '%' }} data-facing={goat.facing} data-disposition={goat.disposition} aria-label={goat.disposition === 'aggressive' ? 'Hostile goat' : 'Peaceful goat'} key={goat.id}>
                <span className="goat-hp" style={{ width: (goat.hp / goat.maxHp) * 100 + '%' }} />
                {goat.disposition === 'aggressive' && <span className="goat-aggro">!</span>}
                <span className="goat-sprite" />
              </div>
            ))}
          </div>
          <div className="field-trees" aria-hidden="true">
            {fieldTrees.map((tree) => (
              <span
                className={'field-tree tree-' + tree.style + ' variant-' + tree.variant}
                key={tree.id}
                style={{ left: tree.x + '%', top: tree.y + '%', transform: 'scale(' + tree.scale + ')' }}
              />
            ))}
          </div>
          {currentWorldTile.landmark && (
            <div className={'field-village ' + currentWorldTile.landmark.kind + ' world-region-' + currentWorldTile.regionStyle} aria-label={currentWorldTile.landmark.name}>
              <span className="field-village-square" />
              <span className="field-house house-1" /><span className="field-house house-2" /><span className="field-house house-3" />
              <span className="field-house house-4" />
              {!startingArea && <>
                <span className="field-house house-5" /><span className="field-house house-6" />
              </>}
              {currentWorldTile.landmark?.name === 'Mosslight Crossing' ? (
                <span className="field-village-fountain" aria-label="Greenvale fountain"><span className="fountain-spray" /></span>
              ) : (
                <span className="field-village-well" />
              )}
            </div>
          )}
          {currentWorldTile.landmark?.name === 'Mosslight Crossing' && startingTownNpcs.map((npc) => (
            <div
              className={'town-npc npc-' + npc.role}
              style={{ left: npc.position.x + '%', top: npc.position.y + '%' }}
              data-role={npc.role}
              data-facing={npc.facing}
              aria-label={npc.name + ', ' + npc.title}
              data-testid={'npc-' + npc.name.toLowerCase()}
            >
              <span className="npc-nameplate">
                <span className="npc-role-mark" aria-hidden="true" />
                <strong>{npc.name}</strong>
                <small>{npc.title}</small>
              </span>
              <span className="npc-sprite" aria-hidden="true" />
            </div>
          ))}
          {showHorse && (
            <>
              <div className={'horse ' + (mounted ? 'is-mounted ' : '') + (mounted && moving ? 'is-moving' : '')} style={{ left: horseDisplayPosition.x + '%', top: horseDisplayPosition.y + '%' }} data-facing={mounted ? facing : horseFacing} aria-label={mounted ? 'Mounted horse' : 'Your horse'} data-testid="horse-character">
                {mounted && <>
                  <span className="rider-sprite" aria-hidden="true" />
                  <span className="animal-head" aria-hidden="true" />
                </>}
                <span className="horse-sprite" />
              </div>
              {canMount && <button className="horse-mount-button" style={{ left: horseDisplayPosition.x + '%', top: Math.min(88, Math.max(12, horseDisplayPosition.y + 10)) + '%' }} onClick={toggleMount} aria-label="Mount horse" data-testid="button-toggle-mount">Mount</button>}
            </>
          )}
          </div>
          {!mounted && <div className={'player ' + (!mounted && moving ? 'is-moving' : '')} style={{ left: position.x + '%', top: position.y + '%' }} data-facing={facing} data-testid="player-character">
            <span className="player-sprite" />
          </div>}
        </div>
        )}
        {attackFlash && <div className="combat-flash" aria-live="polite">{attackFlash}</div>}
        {!interior && doorwayNear(position, chunk) && <div className="door-prompt" aria-live="polite">Enter {doorwayNear(position, chunk)?.area.name}</div>}
        {areaFlash && (
          <div className="area-flash" key={areaFlash.id} aria-live="polite" data-testid="area-entry-flash">
            <span className="area-flash-kicker">Entering</span>
            <strong>{areaFlash.label}</strong>
          </div>
        )}
        <div className="world-hud">
          <div className="hud-card" data-testid="hud-player">
            <div className="hud-label"><span>Adventurer</span><span>08</span></div>
            <div className="hud-name">Rowan of the Vale</div>
            <div className="bar" aria-label={'Health ' + playerHp + ' percent'}><div className="bar-fill health" style={{ width: playerHp + '%' }} /></div><span className="hud-health-value">{playerHp} HP</span>
            {mounted && <button className="horse-dismount-button" onClick={toggleMount} aria-label="Dismount horse" data-testid="button-dismount-horse">Dismount</button>}
          </div>
          <button className="hud-card right hud-button" onClick={onOpenInventory} aria-label="Open inventory" data-testid="button-open-inventory">
            <div className="hud-label"><span>Satchel</span><Coins size={12} /></div>
            <div className="hud-coins" data-testid="text-coin-count">1,284 c</div>
            <div className="hud-time" data-testid="text-game-time">{time} / clear</div>
          </button>
        </div>
        <div className="touch-controls" aria-label="Touch movement controls">
           <button className="touch-control up" aria-label="Move north" data-testid="button-move-up" onPointerDown={(event) => beginDirection('up', event)} onPointerUp={(event) => endDirection('up', event)} onPointerCancel={(event) => endDirection('up', event)} onLostPointerCapture={() => releaseDirection('up')}><ChevronUp size={18} /></button>
           <button className="touch-control left" aria-label="Move west" data-testid="button-move-left" onPointerDown={(event) => beginDirection('left', event)} onPointerUp={(event) => endDirection('left', event)} onPointerCancel={(event) => endDirection('left', event)} onLostPointerCapture={() => releaseDirection('left')}><ChevronLeft size={18} /></button>
           <button className="touch-control down" aria-label="Move south" data-testid="button-move-down" onPointerDown={(event) => beginDirection('down', event)} onPointerUp={(event) => endDirection('down', event)} onPointerCancel={(event) => endDirection('down', event)} onLostPointerCapture={() => releaseDirection('down')}><ChevronDown size={18} /></button>
           <button className="touch-control right" aria-label="Move east" data-testid="button-move-right" onPointerDown={(event) => beginDirection('right', event)} onPointerUp={(event) => endDirection('right', event)} onPointerCancel={(event) => endDirection('right', event)} onLostPointerCapture={() => releaseDirection('right')}><ChevronRight size={18} /></button>
        </div>
         {logOpen && (
           <section id="field-log-drawer" className="field-log-drawer" aria-label="Field log" data-testid="panel-field-log">
             <div className="field-log-heading">
               <h2>Field log</h2>
               <button className="field-log-close" onClick={() => setLogOpen(false)} aria-label="Close field log" data-testid="button-close-field-log"><X size={16} /></button>
             </div>
             <div className="log-list">
               {logs.map((log, index) => <div className="log-row" key={`${log.text}-${index}`} data-testid={`log-entry-${index}`}><span className={`log-dot ${log.color}`} /><span>{log.text}</span></div>)}
             </div>
           </section>
         )}
         <div className="field-actions">
           <button className="icon-button field-attack-button" onClick={attackGoat} aria-label="Strike nearest goat" title="Strike (Space)" data-testid="button-attack"><Sword size={16} /></button>
            <button className="icon-button field-log-toggle" onClick={() => setLogOpen((value) => !value)} aria-expanded={logOpen} aria-controls="field-log-drawer" aria-label={logOpen ? 'Hide field log' : 'Open field log'} title={logOpen ? 'Hide field log' : 'Open field log'} data-testid="button-toggle-field-log"><BookOpen size={16} /></button>
           <button className="icon-button map-button" onClick={onOpenMap} aria-label="Open field atlas" title="Open field atlas" data-testid="button-open-map"><Map size={16} /></button>
            <button className="icon-button field-sound-button" onClick={onToggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={muted} data-testid="button-toggle-sound">{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
         </div>
      </div>
      <div className="sr-only" aria-live="polite" data-testid="status-movement">{moving ? (mounted ? 'Riding through Mosslight Crossing' : 'Moving through Mosslight Crossing') : (mounted ? 'Mounted and ready' : 'Standing still')}</div>
      <div className="sr-only" aria-live="polite" data-testid="status-mount">{mounted ? 'Mounted on the horse' : canMount ? 'Horse nearby and ready to mount' : horseHere ? 'Horse is parked in this field' : 'Horse is in another field'}</div>
      <div className="sr-only" aria-live="polite" data-testid="status-field-log">{logs[0].text}</div>
    </div>
  );
}

function Home() {
  const [mapOpen, setMapOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chunk, setChunk] = useState({ x: 4, y: 7 });

  useEffect(() => {
    const closeSheets = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMapOpen(false);
        setInventoryOpen(false);
      }
    };
    window.addEventListener('keydown', closeSheets);
    return () => window.removeEventListener('keydown', closeSheets);
  }, []);

  return (
    <main
      className="game-app"
      style={{
        '--player-sprite-url': `url("${assetUrl('assets/cute-fantasy/player.png')}")`,
        '--horse-sprite-url': `url("${assetUrl('assets/farm-male-cow-brown.png')}")`,
         '--goat-sprite-url': `url("${assetUrl('assets/gameplay/characters/goat/goat.png')}")`,
      } as CSSProperties}
    >
      <div className="game-layout">
      <GameField onOpenMap={() => setMapOpen(true)} onOpenInventory={() => setInventoryOpen(true)} onChunkChange={setChunk} muted={muted} onToggleMute={() => setMuted((value) => !value)} inputLocked={mapOpen || inventoryOpen} />
      </div>
      {mapOpen && <WorldMap chunk={chunk} onClose={() => setMapOpen(false)} />}
      {inventoryOpen && <InventorySheet onClose={() => setInventoryOpen(false)} />}
    </main>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
