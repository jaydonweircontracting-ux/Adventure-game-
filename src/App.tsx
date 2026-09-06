import { useEffect, useRef, useState } from 'react';
import { Backpack, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Coins, Download, Map, Menu, Minus, Plus, Settings, Sword, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { type CSSProperties } from 'react';
import { type ChangeEvent, type PointerEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { createAdventureBrain, type RPGBrain, type RpgGameState } from '@/game/rpgBrain';
import { DEFAULT_WORLD_SEED, type WorldClockState } from '@/game/worldCore';
import StoneSoupDungeon from '@/game/StoneSoupDungeon';
import { advanceSimulatedAdventurers, initialSimulatedAdventurers, type SimulatedAdventurer } from '@/game/simulatedAdventurers';
import { getDirection, isAdjacentAndFacing, isAdjacentTarget } from '@/game/combat';
import { updateGoat, type GoatAIState } from '@/game/ai';
import { playCombatSound } from '@/game/effects';
import { getSpriteState } from '@/game/animation';
import { CURRENT_SAVE_VERSION, SAVE_FILE_FORMAT, migrateSave } from '@/game/persistence';

const queryClient = new QueryClient();
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const BUILD_NUMBER = '051';
type Direction = 'up' | 'down' | 'left' | 'right';
type Point = { x: number; y: number };
const PLAYER_COLLISION_BOX = { halfWidth: 4.6, halfHeight: 3.4 };
const GOAT_COLLISION_BOX = { halfWidth: 2.8, halfHeight: 2.5 };
const COLLISION_GAP = 0.8;
const INTERIOR_DOORWAY_WIDTH_PX = 58;
const INTERIOR_PLAYER_WIDTH_PX = 46;
const INTERIOR_DOORWAY_PADDING_PX = 4;

type CollisionBox = { halfWidth: number; halfHeight: number };

function collisionBoxesOverlap(a: Point, aBox: CollisionBox, b: Point, bBox: CollisionBox) {
  return Math.abs(a.x - b.x) < aBox.halfWidth + bBox.halfWidth + COLLISION_GAP
    && Math.abs(a.y - b.y) < aBox.halfHeight + bBox.halfHeight + COLLISION_GAP;
}

function isPositionOccupiedByGoat(position: Point, goats: GoatState[]) {
  return goats.some((goat) => goat.disposition !== 'defeated' && collisionBoxesOverlap(position, PLAYER_COLLISION_BOX, goat.position, GOAT_COLLISION_BOX));
}

function separateGoatFromPlayer(goatPosition: Point, playerPosition: Point) {
  const minimumX = PLAYER_COLLISION_BOX.halfWidth + GOAT_COLLISION_BOX.halfWidth + COLLISION_GAP;
  const minimumY = PLAYER_COLLISION_BOX.halfHeight + GOAT_COLLISION_BOX.halfHeight + COLLISION_GAP;
  const dx = goatPosition.x - playerPosition.x;
  const dy = goatPosition.y - playerPosition.y;
  const overlapX = minimumX - Math.abs(dx);
  const overlapY = minimumY - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return null;
  if (overlapX <= overlapY) {
    return { x: playerPosition.x + (dx >= 0 ? minimumX : -minimumX), y: goatPosition.y };
  }
  return { x: goatPosition.x, y: playerPosition.y + (dy >= 0 ? minimumY : -minimumY) };
}
type HorseState = { chunk: Point; position: Point };

function formatWorldClock(clock: WorldClockState) {
  const hour = String(clock.hour).padStart(2, '0');
  const minute = String(clock.minuteOfDay % 60).padStart(2, '0');
  const season = clock.season.charAt(0).toUpperCase() + clock.season.slice(1);
  return hour + ':' + minute + ' · ' + season + ' · Y' + clock.year + ' D' + clock.day;
}

const WALK_SPEED = 56; // Deliberately slower exploration pace
const HORSE_SPEED = 180;
const HORSE_MOUNT_DISTANCE = 4.5;
const initialHorseState: HorseState = { chunk: { x: 4, y: 7 }, position: { x: 58, y: 52 } };

const directionKeys: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const attackDirectionRow: Record<Direction, number> = { right: 0, down: 1, up: 2, left: 3 };
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

// Give the tutorial island a clear water buffer without changing the starting field.
for (let x = -1; x <= 11; x += 1) {
  coastlineWater.add(x + ',1');
  coastlineWater.add(x + ',13');
}
for (let y = 1; y <= 13; y += 1) {
  coastlineWater.add('-1,' + y);
  coastlineWater.add('11,' + y);
}

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
  return point.x >= 3 && point.x <= 5 && point.y >= 6 && point.y <= 8;
}

function isTutorialCenter(point: Point) {
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
  const startingCenter = isTutorialCenter(chunk);
  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
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

type FieldAccentKind = 'grass' | 'flower' | 'stone' | 'leaf';
type FieldAccent = { id: number; x: number; y: number; scale: number; rotation: number; kind: FieldAccentKind };

function fieldAccentsFor(chunk: Point): FieldAccent[] {
  const tile = mapTileFor(chunk);
  if (tile.waterFeature) return [];

  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
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

    const kind: FieldAccentKind = tile.terrain === 'rock'
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

function isFieldPositionBlocked(position: Point, chunk: Point) {
  const tile = mapTileFor(chunk);
  if (tile.waterFeature === 'sea' || (tile.waterFeature !== null && !tile.bridge)) return true;

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

function resolveFieldMovement(current: Point, movement: Point, chunk: Point, goats: GoatState[] = []) {
  const candidates = [
    { x: current.x + movement.x, y: current.y + movement.y },
    { x: current.x + movement.x, y: current.y },
    { x: current.x, y: current.y + movement.y },
  ];
  for (const candidate of candidates) {
    const wrapped = wrapFieldPosition(candidate, chunk);
    if (!isFieldPositionBlocked(wrapped.position, wrapped.chunk) && !isPositionOccupiedByGoat(wrapped.position, goats)) return wrapped;
  }
  return null;
}

type InteriorArea = { id: string; name: string; description: string; roomType: 'guild' | 'inn' | 'chapel' | 'building'; exteriorPosition: Point };
type Doorway = { id: string; position: Point; area: InteriorArea; buildingIndex?: number };
const startingDoorways: Doorway[] = [
  { id: 'tutorial-house-door', buildingIndex: 0, position: { x: 30, y: 36 }, area: { id: 'tutorial-house', name: 'Tutorial House', description: 'A small safe house on the tutorial island.', roomType: 'inn', exteriorPosition: { x: 30, y: 48 } } },
  { id: 'crafting-guild-door', buildingIndex: 1, position: { x: 70, y: 36 }, area: { id: 'wayfarer-guild', name: 'Wayfarer Guild', description: 'A workbench, maps, and road-worn notices fill the guild hall.', roomType: 'guild', exteriorPosition: { x: 70, y: 48 } } },
  { id: 'chapel-door', buildingIndex: 2, position: { x: 30, y: 72 }, area: { id: 'rootbound-chapel', name: 'Rootbound Chapel', description: 'Lanterns glow beneath old roots in the quiet town chapel.', roomType: 'chapel', exteriorPosition: { x: 30, y: 60 } } },
];

function buildingDoorwaysFor(chunk: Point): Doorway[] {
  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
  if (!landmark) return [];
  return fieldHouseRects(landmark.kind, isStartingArea(chunk)).map((rect, index) => {
    const namedDoorway = isStartingArea(chunk) ? startingDoorways.find((doorway) => doorway.buildingIndex === index) : null;
    const position = fieldDoorPosition(rect);
    if (namedDoorway) {
      return {
        ...namedDoorway,
        position,
        area: {
          ...namedDoorway.area,
          exteriorPosition: doorwayExteriorPosition(rect, position),
        },
      };
    }
    return {
      id: chunk.x + ',' + chunk.y + '-building-' + index,
      position,
      area: {
        id: chunk.x + '-' + chunk.y + '-building-' + index,
        name: landmark.name + ' House ' + (index + 1),
        description: 'A simple brown room waiting to be furnished.',
        roomType: 'building' as const,
        exteriorPosition: { x: position.x, y: Math.min(94, position.y + 4) },
      },
    };
  });
}

function doorwayExteriorPosition(rect: FieldRect, doorway: Point): Point {
  // Spawn beyond the house's collision padding so the first frame outside is safe.
  return { x: doorway.x, y: Math.min(94, Math.max(doorway.y + 4, rect.bottom + 4.5)) };
}

const STARTING_DOORWAY_ID = 'tutorial-house-door';
const startingHouse = buildingDoorwaysFor({ x: 4, y: 7 }).find((doorway) => doorway.id === STARTING_DOORWAY_ID)?.area || startingDoorways[0].area;

function fieldDoorPosition(rect: FieldRect): Point {
  // Match .field-house::after: left 43%, width 16%, bottom 0, height 44%.
  return {
    x: rect.left + (rect.right - rect.left) * 0.51,
    y: rect.top + (rect.bottom - rect.top) * 0.78,
  };
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

type InteriorCollisionRect = FieldRect;

// These rectangles are in the interior scene's 0-100 coordinate space. They include
// a little visual padding so the player cannot overlap the furniture sprites.
const interiorFurnitureCollision: InteriorCollisionRect[] = [
  { left: 20, top: 29, right: 80, bottom: 40 }, // counter
  { left: 17, top: 43, right: 30, bottom: 67 }, // left shelf — extra inner clearance
  { left: 70, top: 43, right: 83, bottom: 67 }, // right shelf — extra inner clearance
  { left: 41, top: 57, right: 60, bottom: 68 }, // table and legs
];

function isInteriorPositionBlocked(position: Point, area: InteriorArea) {
  if (area.roomType === 'building') return false;
  return interiorFurnitureCollision.some((rect) => pointInRect(position, rect));
}

type GoatDisposition = 'calm' | 'aggressive' | 'defeated';
type GoatStateName = GoatAIState;
type PlayerClass = 'Beginner' | 'Warrior' | 'Mage' | 'Rogue';
type StatKey = 'str' | 'dex' | 'int' | 'luk';
type PlayerStats = Record<StatKey, number>;
const STAT_KEYS: StatKey[] = ['str', 'dex', 'int', 'luk'];
const statDetails: Record<StatKey, { label: string; description: string }> = {
  str: { label: 'Strength', description: 'Raises damage dealt per hit.' },
  dex: { label: 'Dexterity', description: 'Shortens your attack cooldown.' },
  int: { label: 'Intelligence', description: 'Raises max HP and bonus XP.' },
  luk: { label: 'Luck', description: 'Improves critical hits and loot rolls.' },
};
const initialPlayerStats: PlayerStats = { str: 4, dex: 4, int: 4, luk: 4 };
type GameInventory = { coins: number; goatHorns: number; fabric: number; daggers: number; cloths: number };
type GoatLoot = Partial<GameInventory>;
type DroppedLoot = { id: number; chunk: Point; position: Point; loot: GoatLoot };
type GoatState = {
  id: number;
  position: Point;
  spawnPosition: Point;
  facing: Direction;
  level: number;
  hp: number;
  maxHp: number;
  disposition: GoatDisposition;
  attackCooldown: number;
  respawnTicks: number;
  wanderSeed: number;
  moving: boolean;
  attacking: boolean;
  state: GoatStateName;
  hurtTimer: number;
  attackTimer: number;
  attackHitApplied: boolean;
  hitFlash: boolean;
  nextWanderTick?: number;
};
const GOAT_STEP = 0.5;
const GOAT_TICK_MS = 500;
const GOAT_WANDER_MIN_TICKS = 10;
const GOAT_WANDER_MAX_TICKS = 20;
const PLAYER_ATTACK_ANIMATION_MS = 650;
const GOAT_RESPAWN_TICKS = Math.ceil(12000 / GOAT_TICK_MS);
const GOAT_SPAWN_DISPOSITION: GoatDisposition = 'calm';
const GOAT_ATTACK_RANGE = 15;
const GOAT_CLOSE_ATTACK_RANGE = 8;
const GOAT_ATTACK_DAMAGE = 3;
const PLAYER_ATTACK_COOLDOWN_MS = 800;
const GOAT_ATTACK_COOLDOWN_MS = 1000;
const GOAT_XP_REWARD = 25;
const GOAT_MIN_XP_REWARD = 5;
const GOAT_HP_PER_LEVEL = 4;
const GOAT_DAMAGE_PER_LEVEL = 1;
const PLAYER_MAX_HP = 88;
const PLAYER_BASE_ATTACK_DAMAGE = 5;
const PLAYER_STAT_POINTS_PER_LEVEL = 5;
const GOAT_LOOT_TYPES: Array<keyof GameInventory> = ['goatHorns', 'fabric', 'coins'];
const initialInventory: GameInventory = { coins: 0, goatHorns: 0, fabric: 0, daggers: 0, cloths: 0 };

function playerMaxHpForStats(stats: PlayerStats) {
  return PLAYER_MAX_HP + stats.int * 3;
}
function playerDamageForStats(stats: PlayerStats) {
  return PLAYER_BASE_ATTACK_DAMAGE + stats.str;
}
function playerCriticalChanceForStats(stats: PlayerStats) {
  return Math.min(0.35, stats.luk * 0.01);
}

type SaveGameData = {
  format: 'adventure-game-save';
  version: 2;
  saveId: string;
  savedAt: string;
  worldSeed: number;
  position: Point;
  chunk: Point;
  mounted: boolean;
  horse: HorseState;
  inventory: GameInventory;
  equippedDagger?: boolean;
  droppedLoot?: DroppedLoot[];
  playerHp: number;
  playerXp: number;
  playerLevel: number;
  playerClass: PlayerClass;
  playerStats?: PlayerStats;
  statPoints?: number;
  npcStates: TownNpc[];
  simulatedAdventurers: SimulatedAdventurer[];
  goats: GoatState[];
  interiorId: string | null;
  interiorPosition: Point;
  logs: Array<{ text: string; color: string }>;
  time: string;
  brainState: RpgGameState | null;
};

const SAVE_FILE_VERSION = CURRENT_SAVE_VERSION;
const SAVE_STORAGE_KEY = 'adventure-game-save-v2';
const SAVE_LEGACY_STORAGE_KEY = 'adventure-game-save-v1';
const saveDirections = ['up', 'down', 'left', 'right'];
const savePlayerClasses = ['Beginner', 'Warrior', 'Mage', 'Rogue'];
const saveNpcRoles = ['mage', 'warrior', 'guide', 'rogue'];
const saveGoatDispositions = ['calm', 'aggressive', 'defeated'];
const saveAdventurerClasses = ['Ranger', 'Mage', 'Rogue'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSavePoint(value: unknown): value is Point {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isGameInventory(value: unknown): value is GameInventory {
  return isRecord(value)
    && isFiniteNumber(value.coins)
    && isFiniteNumber(value.goatHorns)
    && isFiniteNumber(value.fabric)
    && isFiniteNumber(value.daggers)
    && isFiniteNumber(value.cloths);
}

function isPlayerStats(value: unknown): value is PlayerStats {
  return isRecord(value)
    && STAT_KEYS.every((key) => isFiniteNumber(value[key]) && value[key] >= 0);
}

function isTownNpcSave(value: unknown): value is TownNpc {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.title === 'string'
    && typeof value.role === 'string'
    && saveNpcRoles.includes(value.role)
    && isSavePoint(value.position)
    && typeof value.facing === 'string'
    && saveDirections.includes(value.facing);
}

function isGoatSave(value: unknown): value is GoatState {
  return isRecord(value)
    && isFiniteNumber(value.id)
    && isSavePoint(value.position)
    && isSavePoint(value.spawnPosition)
    && typeof value.facing === 'string'
    && saveDirections.includes(value.facing)
    && isFiniteNumber(value.level)
    && isFiniteNumber(value.hp)
    && isFiniteNumber(value.maxHp)
    && typeof value.disposition === 'string'
    && saveGoatDispositions.includes(value.disposition)
    && isFiniteNumber(value.attackCooldown)
    && isFiniteNumber(value.respawnTicks)
    && isFiniteNumber(value.wanderSeed)
    && typeof value.moving === 'boolean'
    && (value.attacking === undefined || typeof value.attacking === 'boolean')
    && (value.nextWanderTick === undefined || isFiniteNumber(value.nextWanderTick));
}

function isSimulatedAdventurerSave(value: unknown): value is SimulatedAdventurer {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.className === 'string'
    && saveAdventurerClasses.includes(value.className)
    && isFiniteNumber(value.level)
    && typeof value.goal === 'string'
    && typeof value.activity === 'string'
    && isSavePoint(value.position)
    && typeof value.facing === 'string'
    && saveDirections.includes(value.facing)
    && isFiniteNumber(value.routeIndex);
}

function isDroppedLootSave(value: unknown): value is DroppedLoot {
  return isRecord(value)
    && isFiniteNumber(value.id)
    && isSavePoint(value.chunk)
    && isSavePoint(value.position)
    && isRecord(value.loot)
    && Object.entries(value.loot).every(([key, amount]) => ['coins', 'goatHorns', 'fabric', 'daggers', 'cloths'].includes(key) && isFiniteNumber(amount) && amount >= 0);
}

function isBrainStateSave(value: unknown): value is RpgGameState {
  return isRecord(value)
    && (value.currentLocationId === null || typeof value.currentLocationId === 'string')
    && (value.currentChunkId === null || typeof value.currentChunkId === 'string')
    && Array.isArray(value.discoveredChunks)
    && Array.isArray(value.discoveredLocations)
    && Array.isArray(value.discoveredLore)
    && Array.isArray(value.enteredBuildings)
    && Array.isArray(value.completedDungeons)
    && Array.isArray(value.history);
}

function isSaveGameData(value: unknown): value is SaveGameData {
  return isRecord(value)
    && value.format === SAVE_FILE_FORMAT
    && value.version === SAVE_FILE_VERSION
    && typeof value.saveId === 'string'
    && isFiniteNumber(value.worldSeed)
    && typeof value.savedAt === 'string'
    && isSavePoint(value.position)
    && isSavePoint(value.chunk)
    && typeof value.mounted === 'boolean'
    && isRecord(value.horse)
    && isSavePoint(value.horse.chunk)
    && isSavePoint(value.horse.position)
    && isGameInventory(value.inventory)
    && (value.equippedDagger === undefined || typeof value.equippedDagger === 'boolean')
    && (value.droppedLoot === undefined || (Array.isArray(value.droppedLoot) && value.droppedLoot.every(isDroppedLootSave)))
    && isFiniteNumber(value.playerHp)
    && isFiniteNumber(value.playerXp)
    && isFiniteNumber(value.playerLevel)
    && typeof value.playerClass === 'string'
    && savePlayerClasses.includes(value.playerClass)
    && (value.playerStats === undefined || isPlayerStats(value.playerStats))
    && (value.statPoints === undefined || (isFiniteNumber(value.statPoints) && value.statPoints >= 0))
    && Array.isArray(value.npcStates)
    && value.npcStates.every(isTownNpcSave)
    && Array.isArray(value.simulatedAdventurers)
    && value.simulatedAdventurers.every(isSimulatedAdventurerSave)
    && Array.isArray(value.goats)
    && value.goats.every(isGoatSave)
    && (value.interiorId === null || typeof value.interiorId === 'string')
    && isSavePoint(value.interiorPosition)
    && typeof value.time === 'string'
    && Array.isArray(value.logs)
    && value.logs.every((log) => isRecord(log) && typeof log.text === 'string' && typeof log.color === 'string')
    && (value.brainState === null || isBrainStateSave(value.brainState));
}


function monsterLevelForChunk(chunk: Point, index: number, playerLevel = 1) {
  const areaOffset = Math.abs(chunk.x * 17 + chunk.y * 31 + index * 7) % 3;
  return Math.max(1, playerLevel + areaOffset);
}

function goatMaxHpForLevel(level: number) {
  return 18 + Math.max(0, level - 1) * GOAT_HP_PER_LEVEL;
}

function goatAttackDamageForLevel(level: number) {
  return GOAT_ATTACK_DAMAGE + Math.floor(Math.max(0, level - 1) / 2) * GOAT_DAMAGE_PER_LEVEL;
}

function goatExperienceReward(goat: GoatState, playerLevel: number, stats: PlayerStats = initialPlayerStats) {
  const progressionPenalty = Math.max(0, playerLevel - 1) * 2;
  const monsterPenalty = Math.max(0, goat.level - playerLevel);
  return Math.max(GOAT_MIN_XP_REWARD, GOAT_XP_REWARD - progressionPenalty - monsterPenalty) + Math.floor(stats.int / 5);
}

function scaleGoatsToPlayerLevel(goats: GoatState[], playerLevel: number) {
  return goats.map((goat) => {
    if (goat.disposition === 'defeated') return goat;
    const level = Math.max(goat.level, playerLevel);
    const maxHp = goatMaxHpForLevel(level);
    return { ...goat, level, maxHp, hp: maxHp };
  });
}
const classDescriptions: Record<Exclude<PlayerClass, 'Beginner'>, string> = {
  Warrior: 'More health and a heavy starting style.',
  Mage: 'A spell-focused path for curious explorers.',
  Rogue: 'A fast, precise path for clever adventurers.',
};
type CraftItem = 'dagger' | 'cloths';
const craftRecipes: Record<CraftItem, { name: string; description: string; cost: GoatLoot; reward: GoatLoot }> = {
  dagger: { name: 'Goat-horn dagger', description: 'A sharp beginner weapon.', cost: { goatHorns: 2 }, reward: { daggers: 1 } },
  cloths: { name: 'Field cloths', description: 'Simple protective travel clothes.', cost: { fabric: 2 }, reward: { cloths: 1 } },
};
const startingGoatPositions: Point[] = [
  { x: 13, y: 18 }, { x: 29, y: 14 }, { x: 72, y: 14 }, { x: 87, y: 19 },
  { x: 12, y: 43 }, { x: 88, y: 44 }, { x: 14, y: 82 }, { x: 31, y: 87 },
  { x: 70, y: 86 }, { x: 87, y: 80 },
];
function goatsForChunk(chunk: Point, playerLevel = 1): GoatState[] {
  if (mapTileFor(chunk).terrain === 'ocean') return [];
  const positions = isTutorialCenter(chunk) ? startingGoatPositions : Array.from({ length: mapTileFor(chunk).terrain === 'meadow' ? 4 : 2 }, (_, index) => ({ x: 16 + ((Math.abs(chunk.x * 47 + chunk.y * 71 + index * 29) * 13) % 68), y: 17 + ((Math.abs(chunk.x * 31 + chunk.y * 53 + index * 41) * 17) % 66) }));
  const safePositions = positions.filter((position) => !isFieldPositionBlocked(position, chunk));
  return safePositions.map((position, index) => {
    const wanderSeed = Math.abs(chunk.x * 97 + chunk.y * 193 + index * 53 + 17);
    return {
      id: index,
      position,
      spawnPosition: { ...position },
      facing: (['up', 'right', 'down', 'left'] as Direction[])[wanderSeed % 4],
      level: monsterLevelForChunk(chunk, index, playerLevel),
      hp: goatMaxHpForLevel(monsterLevelForChunk(chunk, index, playerLevel)),
      maxHp: goatMaxHpForLevel(monsterLevelForChunk(chunk, index, playerLevel)),
      disposition: GOAT_SPAWN_DISPOSITION,
      attackCooldown: 0,
      respawnTicks: 0,
      wanderSeed,
      moving: false,
      attacking: false,
      state: 'idle',
      hurtTimer: 0,
      attackTimer: 0,
      attackHitApplied: false,
      hitFlash: false,
      nextWanderTick: GOAT_WANDER_MIN_TICKS + (wanderSeed % (GOAT_WANDER_MAX_TICKS - GOAT_WANDER_MIN_TICKS + 1)),
    };
  });
}
function goatDistance(goat: GoatState, position: Point) { return Math.hypot(goat.position.x - position.x, goat.position.y - position.y); }
function goatIsInAttackArc(goat: GoatState, position: Point, facing: Direction) {
  const distance = goatDistance(goat, position);
  return getDirection(position, goat.position) === facing
    && (distance <= GOAT_CLOSE_ATTACK_RANGE || isAdjacentTarget(position, goat.position, GOAT_ATTACK_RANGE));
}
function goatWanderDelay(wanderSeed: number) {
  const range = GOAT_WANDER_MAX_TICKS - GOAT_WANDER_MIN_TICKS + 1;
  return GOAT_WANDER_MIN_TICKS + Math.abs(wanderSeed % range);
}
function nextGoatWanderSeed(goat: GoatState, worldStep: number) {
  return Math.abs((goat.wanderSeed * 1664525 + worldStep * 101 + goat.id * 17) % 2147483647);
}
function moveGoatIndependently(goat: GoatState, worldStep: number, playerPosition: Point, chunk: Point, goats: GoatState[]) {
  if (goat.disposition === 'defeated') return { ...goat, moving: false, attacking: false };
  const isWandering = goat.disposition === 'calm';
  const scheduledTick = goat.nextWanderTick ?? goatWanderDelay(goat.wanderSeed);
  if (isWandering && worldStep < scheduledTick) return { ...goat, moving: false, attacking: false, nextWanderTick: scheduledTick };
  const wanderSeed = nextGoatWanderSeed(goat, worldStep);
  const distance = goatDistance(goat, playerPosition);
  let direction: Direction;
  if (goat.disposition === 'aggressive' && distance > GOAT_ATTACK_RANGE) {
    const horizontal = playerPosition.x - goat.position.x;
    const vertical = playerPosition.y - goat.position.y;
    direction = Math.abs(horizontal) >= Math.abs(vertical) ? (horizontal >= 0 ? 'right' : 'left') : (vertical >= 0 ? 'down' : 'up');
  } else {
    const wanderDirections: Direction[] = ['up', 'right', 'down', 'left'];
    direction = wanderDirections[wanderSeed % wanderDirections.length];
  }
  const directions: Direction[] = ([direction, 'up', 'right', 'down', 'left'] as Direction[]).filter((candidate, index, all) => all.indexOf(candidate) === index);
  for (const candidateDirection of directions) {
    const nextPosition = {
      x: Math.min(90, Math.max(10, goat.position.x + (candidateDirection === 'right' ? GOAT_STEP : candidateDirection === 'left' ? -GOAT_STEP : 0))),
      y: Math.min(90, Math.max(10, goat.position.y + (candidateDirection === 'down' ? GOAT_STEP : candidateDirection === 'up' ? -GOAT_STEP : 0))),
    };
    const occupied = goats.some((other) => other.id !== goat.id && other.disposition !== 'defeated' && Math.hypot(other.position.x - nextPosition.x, other.position.y - nextPosition.y) < 4.2);
    if (!occupied && !collisionBoxesOverlap(nextPosition, GOAT_COLLISION_BOX, playerPosition, PLAYER_COLLISION_BOX) && !isFieldPositionBlocked(nextPosition, chunk)) {
      return { ...goat, position: nextPosition, facing: candidateDirection, moving: true, attacking: false, wanderSeed, nextWanderTick: isWandering ? worldStep + goatWanderDelay(wanderSeed) : goat.nextWanderTick };
    }
  }
  return { ...goat, facing: direction, moving: false, attacking: false, wanderSeed, nextWanderTick: isWandering ? worldStep + goatWanderDelay(wanderSeed) : goat.nextWanderTick };
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
  if (isStartingArea(chunk)) return 'Tutorial Island';
  if (!isContinentChunk(chunk)) return 'Open Water';
  if (chunk.y <= 4) return 'Northwatch Heights';
  if (chunk.x <= 1) return 'Brackenfen Wilds';
  if (chunk.x >= 7) return 'Ironwood March';
  if (chunk.y >= 10) return 'Sunwash Coast';
  return 'Greenvale';
}

const initialLogs = [
  { text: 'You wake inside the left Tutorial House on the island.', color: 'blue' },
  { text: 'Leave the house to meet goats and the town guides.', color: '' },
  { text: 'A test horse waits just east of the square.', color: 'blue' },
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

// Keep the atlas compact while the water buffer frames the tutorial island.
const atlasBounds = { minX: -1, maxX: 11, minY: 1, maxY: 13 };
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

function InventorySheet({ inventory, equippedDagger, onToggleDagger, playerStats, statPoints, onAssignStat, onClose }: { inventory: GameInventory; equippedDagger: boolean; onToggleDagger: () => void; playerStats: PlayerStats; statPoints: number; onAssignStat: (stat: StatKey) => void; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'equipment' | 'stats'>('inventory');
  const itemCount = inventory.goatHorns + inventory.fabric + inventory.daggers + inventory.cloths;
  const visibleItems = [
    { key: 'goatHorns', label: 'Goat horns', detail: 'Crafting material', mark: '✦', className: 'horn-mark' },
    { key: 'fabric', label: 'Fabric', detail: 'Useful cloth', mark: '▤', className: 'fabric-mark' },
    { key: 'daggers', label: 'Goat-horn dagger', detail: 'Crafted weapon', mark: '†', className: 'dagger-mark' },
    { key: 'cloths', label: 'Field cloths', detail: 'Crafted gear', mark: '✚', className: 'cloths-mark' },
  ].filter((item) => inventory[item.key as keyof GameInventory] > 0);
  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="inventory-title" data-testid="overlay-inventory">
      <div className="map-sheet inventory-sheet">
        <div className="map-sheet-heading">
          <h2 id="inventory-title">Menu</h2>
          <button className="map-close" onClick={onClose} aria-label="Close menu" data-testid="button-close-inventory"><X size={19} /></button>
        </div>
        <div className="satchel-tabs" role="tablist" aria-label="Menu sections">
          <button className={'satchel-tab ' + (activeTab === 'inventory' ? 'is-active' : '')} role="tab" aria-selected={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} data-testid="tab-inventory">Inventory</button>
          <button className={'satchel-tab ' + (activeTab === 'equipment' ? 'is-active' : '')} role="tab" aria-selected={activeTab === 'equipment'} onClick={() => setActiveTab('equipment')} data-testid="tab-equipment">Equipment</button>
          <button className={'satchel-tab ' + (activeTab === 'stats' ? 'is-active' : '')} role="tab" aria-selected={activeTab === 'stats'} onClick={() => setActiveTab('stats')} data-testid="tab-stats">Stats</button>
        </div>
        <div className="inventory-body">
          {activeTab === 'inventory' ? (
            <>
              <div className="inventory-count">{itemCount > 0 ? itemCount + ' items carried' : 'Menu is empty'} · {inventory.coins} gold</div>
              <div className="inventory-grid">
                <div className="inventory-item" data-testid="inventory-coins"><span className="inventory-item-mark coin-mark"><Coins size={16} /></span><span><strong>Coins</strong><small>Spendable gold</small></span><b>{inventory.coins}</b></div>
                {visibleItems.map((item) => {
                  const count = inventory[item.key as keyof GameInventory] as number;
                  return <div className="inventory-item" key={item.key} data-testid={'inventory-' + item.key}><span className={'inventory-item-mark ' + item.className}>{item.mark}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><b>{count}</b>{item.key === 'daggers' && <button className={'item-action ' + (equippedDagger ? 'is-equipped' : '')} onClick={onToggleDagger} data-testid="button-toggle-dagger">{equippedDagger ? 'Unequip' : 'Equip'}</button>}</div>;
                })}
              </div>
              {itemCount === 0 && <div className="inventory-empty"><Backpack size={30} strokeWidth={1.5} /><strong>Menu is empty</strong></div>}
            </>
          ) : activeTab === 'equipment' ? (
            <div className="equipment-panel" role="tabpanel" aria-label="Equipment"><div className="inventory-count">Equipped gear changes your character</div><div className={'equipment-slot ' + (equippedDagger ? 'is-equipped' : '')} data-testid="equipment-weapon-slot"><span className="equipment-slot-mark dagger-mark">†</span><span><small>Weapon slot</small><strong>{equippedDagger ? 'Goat-horn dagger' : 'Empty'}</strong></span>{(inventory.daggers > 0 || equippedDagger) && <button className="item-action" onClick={onToggleDagger} data-testid="button-equipment-dagger">{equippedDagger ? 'Unequip' : 'Equip'}</button>}</div><p className="equipment-hint">{equippedDagger ? 'The dagger is visible in your hand.' : 'Craft a dagger, then equip it from this tab.'}</p></div>
          ) : <StatsPanel playerStats={playerStats} statPoints={statPoints} onAssign={onAssignStat} />}
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ playerStats, statPoints, onAssign }: { playerStats: PlayerStats; statPoints: number; onAssign: (stat: StatKey) => void }) {
  return <section className="satchel-stats-panel" role="tabpanel" aria-label="Adventurer Stats"><div className="satchel-stats-heading"><span className="atlas-eyebrow">Character growth</span><h3>Adventurer Stats</h3></div><div className="satchel-stats-points"><strong>{statPoints}</strong><span>unspent stat points</span><small>Every level grants 5 points. Spend them to shape your build.</small></div><div className="satchel-stats-list">{STAT_KEYS.map((stat) => <div className="satchel-stat-row" key={stat} data-testid={'stat-row-' + stat}><span className="satchel-stat-key">{stat.toUpperCase()}</span><span className="satchel-stat-copy"><strong>{statDetails[stat].label}</strong><small>{statDetails[stat].description}</small></span><b className="satchel-stat-value">{playerStats[stat]}</b><button className="satchel-stat-add" onClick={() => onAssign(stat)} disabled={statPoints < 1} aria-label={'Add 1 ' + statDetails[stat].label} data-testid={'button-add-stat-' + stat}><Plus size={14} /> +1</button></div>)}</div><div className="satchel-stats-footer">STR raises hit damage · DEX speeds attacks · INT raises max HP/XP · LUK improves crits and loot.</div></section>;
}

function InteriorRoom({ area, position, facing, moving, inventory, equippedDagger, attacking, attackSequence, onCraft }: { area: InteriorArea; position: Point; facing: Direction; moving: boolean; inventory: GameInventory; equippedDagger: boolean; attacking: boolean; attackSequence: number; onCraft: (item: CraftItem) => void }) {
  const canCraft = (item: CraftItem) => {
    const recipe = craftRecipes[item];
    return Object.entries(recipe.cost).every(([key, value]) => (inventory[key as keyof GameInventory] || 0) >= (value || 0));
  };
  return (
    <div className={'interior-scene interior-' + area.roomType} aria-label={area.name + ' interior'} data-testid={'interior-' + area.id}>
      <div className="interior-room" aria-hidden="true"><span className="interior-rug" /><span className="interior-table" /><span className="interior-counter" /><span className="interior-shelf shelf-left" /><span className="interior-shelf shelf-right" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></div>
      {area.roomType === 'guild' && (
        <section className="crafting-panel" aria-label="Crafting bench" data-testid="crafting-panel">
          <span className="crafting-kicker">Guild workbench</span>
          <strong>Turn goat drops into gear</strong>
          <div className="crafting-options">
            {(Object.keys(craftRecipes) as CraftItem[]).map((item) => {
              const recipe = craftRecipes[item];
              const costLabel = item === 'dagger' ? `${inventory.goatHorns}/2 horns` : `${inventory.fabric}/2 fabric`;
              return (
                <button className="craft-button" key={item} onClick={() => onCraft(item)} disabled={!canCraft(item)} data-testid={'button-craft-' + item}>
                  <span><b>{recipe.name}</b><small>{recipe.description}</small></span>
                  <em>{costLabel}</em>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div className="interior-doorway" aria-label="Exit to Mosslight Crossing"><span>EXIT</span></div>
      <div className={'interior-player ' + (moving ? 'is-moving ' : '') + (attacking ? 'is-attacking' : '')} data-facing={facing} style={{ left: position.x + '%', top: position.y + '%', '--attack-y': `${-attackDirectionRow[facing] * 48}px` } as CSSProperties}><span className="player-sprite" />{attacking && <span key={attackSequence} className="player-attack-sprite" aria-hidden="true" style={{ '--attack-y': `${-attackDirectionRow[facing] * 48}px`, backgroundImage: `url("${assetUrl('assets/gameplay/shining-fields/characters/player/attack.png')}")` } as CSSProperties} />}{equippedDagger && <span className="player-dagger" aria-label="Equipped dagger" />}</div>
      <div className="interior-exit-hint">Walk to the door to leave</div>
    </div>
  );
}

function GameField({ inventory, equippedDagger, playerStats, statPoints, onPlayerStatsChange, onStatPointsChange, onLoot, onOpenMap, onOpenInventory, onChunkChange, muted, onToggleMute, inputLocked, saveStateRef, loadState, onSave, onDownloadSave, onOpenLoad, onOpenMenu, onEnterDungeon }: { inventory: GameInventory; equippedDagger: boolean; playerStats: PlayerStats; statPoints: number; onPlayerStatsChange: (stats: PlayerStats) => void; onStatPointsChange: (points: number | ((current: number) => number)) => void; onLoot: (loot: GoatLoot) => void; onOpenMap: () => void; onOpenInventory: () => void; onChunkChange: (chunk: Point) => void; muted: boolean; onToggleMute: () => void; inputLocked: boolean; saveStateRef: { current: (() => SaveGameData) | null }; loadState: SaveGameData | null; onSave: () => void; onDownloadSave: () => void; onOpenLoad: () => void; onOpenMenu: () => void; onEnterDungeon: () => void }) {
  const [position, setPosition] = useState<Point>({ x: 51, y: 52 });
  const [chunk, setChunk] = useState<Point>({ x: 4, y: 7 });
  const [areaFlash, setAreaFlash] = useState<{ id: string; label: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState<Direction>('down');
  const [attackFacing, setAttackFacing] = useState<Direction | null>(null);
  const [mounted, setMounted] = useState(false);
  const [horse, setHorse] = useState<HorseState>(initialHorseState);
  const [horseFacing, setHorseFacing] = useState<Direction>('down');
  const [logOpen, setLogOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [logs, setLogs] = useState(initialLogs);
  const [time, setTime] = useState('06:00 · Spring · Y1 D1');
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [playerXp, setPlayerXp] = useState(0);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerClass, setPlayerClass] = useState<PlayerClass>('Beginner');
  const [npcDialogue, setNpcDialogue] = useState<TownNpc | null>(null);
  const [npcStates, setNpcStates] = useState(startingTownNpcs);
  const [simulatedAdventurers, setSimulatedAdventurers] = useState(initialSimulatedAdventurers);
  const [goats, setGoats] = useState<GoatState[]>(() => goatsForChunk({ x: 4, y: 7 }, 1));
  const [targetGoatId, setTargetGoatId] = useState<number | null>(null);
  const [droppedLoot, setDroppedLoot] = useState<DroppedLoot[]>([]);
  const [attacking, setAttacking] = useState(false);
  const [attackSequence, setAttackSequence] = useState(0);
  const [attackFlash, setAttackFlash] = useState<string | null>(null);
  const [interior, setInterior] = useState<InteriorArea | null>(startingHouse);
  const [interiorPosition, setInteriorPosition] = useState<Point>({ x: 50, y: 47 });
  const keysRef = useRef<Partial<Record<Direction, boolean>>>({});
  const positionRef = useRef(position);
  const facingRef = useRef(facing);
  const chunkRef = useRef(chunk);
  const mountedRef = useRef(mounted);
  const horseRef = useRef(horse);
  const horseIdleAnchorRef = useRef(initialHorseState.position);
  const gameFrameRef = useRef<HTMLDivElement>(null);
  const areaFlashIdRef = useRef(0);
  const goatsRef = useRef(goats);
  const targetGoatIdRef = useRef<number | null>(null);
  const droppedLootRef = useRef(droppedLoot);
  const droppedLootIdRef = useRef(1);
  const playerHpRef = useRef(playerHp);
  const playerXpRef = useRef(playerXp);
  const playerLevelRef = useRef(playerLevel);
  const playerStatsRef = useRef(playerStats);
  const playerClassRef = useRef<PlayerClass>(playerClass);
  const interiorRef = useRef(interior);
  const interiorPositionRef = useRef(interiorPosition);
  const interiorDoorwayIdRef = useRef<string | null>(STARTING_DOORWAY_ID);
  const goatWorldStepRef = useRef(0);
  const simulatedTickRef = useRef(0);
  const playerAttackCooldownRef = useRef(0);
  const playerAttackStateRef = useRef<{ active: boolean; direction: Direction; targetId: number | null; elapsed: number; hitApplied: boolean }>({ active: false, direction: 'down', targetId: null, elapsed: 0, hitApplied: false });
  const [attackCooldownMs, setAttackCooldownMs] = useState(0);
  const [damageTexts, setDamageTexts] = useState<Array<{ id: number; text: string; position: Point; kind: 'damage' | 'reward' | 'critical' }>>([]);
  const combatTextIdRef = useRef(0);
  const brainRef = useRef<RPGBrain | null>(null);
  if (brainRef.current === null) {
    const brain = createAdventureBrain();
    brain.movePlayer('mosslight-crossing');
    brainRef.current = brain;
  }

  const createSaveData = (): SaveGameData => ({
    format: SAVE_FILE_FORMAT,
    version: SAVE_FILE_VERSION,
    saveId: 'save-' + Date.now().toString(36),
    savedAt: new Date().toISOString(),
    worldSeed: DEFAULT_WORLD_SEED,
    position,
    chunk,
    mounted,
    horse,
    inventory,
    equippedDagger,
    droppedLoot,
    playerHp,
    playerXp,
    playerLevel,
    playerClass,
    playerStats,
    statPoints,
    npcStates,
    simulatedAdventurers,
    goats,
    interiorId: interior?.id || null,
    interiorPosition,
    logs,
    time,
    brainState: brainRef.current?.getGameState() || null,
  });
  saveStateRef.current = createSaveData;

  useEffect(() => {
    if (!loadState) return;
    const restoredDoorway = loadState.interiorId
      ? buildingDoorwaysFor(loadState.chunk).find((doorway) => doorway.area.id === loadState.interiorId) || null
      : null;
    keysRef.current = {};
    positionRef.current = loadState.position; setPosition(loadState.position);
    chunkRef.current = loadState.chunk; setChunk(loadState.chunk); onChunkChange(loadState.chunk);
    mountedRef.current = loadState.mounted; setMounted(loadState.mounted);
    horseRef.current = loadState.horse; setHorse(loadState.horse);
    horseIdleAnchorRef.current = loadState.horse.position;
    goatsRef.current = loadState.goats.map((goat) => ({ ...goat, attacking: goat.attacking ?? false, state: goat.state ?? 'idle', hurtTimer: goat.hurtTimer ?? 0, attackTimer: goat.attackTimer ?? 0, attackHitApplied: goat.attackHitApplied ?? false, hitFlash: false })); setGoats(goatsRef.current);
    targetGoatIdRef.current = null; setTargetGoatId(null);
    droppedLootRef.current = loadState.droppedLoot || []; setDroppedLoot(droppedLootRef.current);
    droppedLootIdRef.current = droppedLootRef.current.reduce((highest, drop) => Math.max(highest, drop.id), 0) + 1;
    playerHpRef.current = loadState.playerHp; setPlayerHp(loadState.playerHp);
    playerXpRef.current = loadState.playerXp; setPlayerXp(loadState.playerXp);
    playerLevelRef.current = loadState.playerLevel; setPlayerLevel(loadState.playerLevel);
    playerClassRef.current = loadState.playerClass; setPlayerClass(loadState.playerClass);
    const restoredStats = loadState.playerStats || initialPlayerStats;
    playerStatsRef.current = restoredStats; onPlayerStatsChange(restoredStats);
    onStatPointsChange(Math.max(0, Math.floor(loadState.statPoints || 0)));
    setNpcStates(loadState.npcStates);
    setSimulatedAdventurers(loadState.simulatedAdventurers.length ? loadState.simulatedAdventurers : initialSimulatedAdventurers);
    interiorDoorwayIdRef.current = restoredDoorway?.id || null;
    interiorRef.current = restoredDoorway?.area || null; setInterior(restoredDoorway?.area || null);
    interiorPositionRef.current = loadState.interiorPosition; setInteriorPosition(loadState.interiorPosition);
    setLogs(loadState.logs); setTime(loadState.time);
    setNpcDialogue(null); setAttackFlash(null); setLogOpen(false); setMoving(false);
    if (loadState.brainState) {
      brainRef.current?.loadGameState(loadState.brainState);
      const restoredClock = brainRef.current?.worldCore.getClock();
      if (restoredClock) setTime(formatWorldClock(restoredClock));
    }
  }, [loadState, onChunkChange, onPlayerStatsChange, onStatPointsChange]);

  useEffect(() => {
    [
      assetUrl('assets/gameplay/shining-fields/characters/player/idle.png'),
      assetUrl('assets/gameplay/shining-fields/characters/player/run.png'),
      assetUrl('assets/gameplay/shining-fields/characters/player/attack.png'),
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
  useEffect(() => { targetGoatIdRef.current = targetGoatId; }, [targetGoatId]);
  useEffect(() => { droppedLootRef.current = droppedLoot; }, [droppedLoot]);
  useEffect(() => { playerHpRef.current = playerHp; }, [playerHp]);
  useEffect(() => { playerXpRef.current = playerXp; }, [playerXp]);
  useEffect(() => { playerLevelRef.current = playerLevel; }, [playerLevel]);
  useEffect(() => { playerStatsRef.current = playerStats; }, [playerStats]);
  useEffect(() => { playerClassRef.current = playerClass; }, [playerClass]);
  useEffect(() => { facingRef.current = facing; }, [facing]);
  useEffect(() => { interiorRef.current = interior; }, [interior]);
  useEffect(() => { interiorPositionRef.current = interiorPosition; }, [interiorPosition]);
  useEffect(() => {
    if (inputLocked || optionsOpen) {
      keysRef.current = {};
      setMoving(false);
    }
  }, [inputLocked, optionsOpen]);


  useEffect(() => {
    const timer = window.setInterval(() => {
      setNpcStates((current) => current.map((npc, index) => {
        const player = positionRef.current;
        const nearby = Math.hypot(player.x - npc.position.x, player.y - npc.position.y) < 18;
        const directions: Direction[] = ['up', 'right', 'down', 'left'];
        const facePlayer: Direction = Math.abs(player.x - npc.position.x) >= Math.abs(player.y - npc.position.y)
          ? (player.x >= npc.position.x ? 'right' : 'left')
          : (player.y >= npc.position.y ? 'down' : 'up');
        const direction = nearby
          ? facePlayer
          : Math.random() < 0.08
            ? directions.filter((candidate) => candidate !== npc.facing)[Math.floor(Math.random() * 3)]
            : npc.facing;
        const step = nearby ? 0 : Math.random() < 0.08 ? 1.2 : 0;
        const nextPosition = {
          x: Math.min(86, Math.max(14, npc.position.x + (direction === 'right' ? step : direction === 'left' ? -step : 0))),
          y: Math.min(76, Math.max(32, npc.position.y + (direction === 'down' ? step : direction === 'up' ? -step : 0))),
        };
        return { ...npc, position: nextPosition, facing: direction };
      }));
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSimulatedAdventurers((current) => {
        const nextTick = simulatedTickRef.current + 1;
        simulatedTickRef.current = nextTick;
        return advanceSimulatedAdventurers(current, nextTick);
      });
    }, 1900);
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
    const nextGoats = goatsForChunk(chunk, playerLevelRef.current);
    goatsRef.current = nextGoats;
    setGoats(nextGoats);
    goatWorldStepRef.current = 0;
    targetGoatIdRef.current = null;
    setTargetGoatId(null);
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
      if (inputLocked || optionsOpen) return;
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
      const movementLocked = playerAttackStateRef.current.active;
      const input = {
        x: inputLocked || optionsOpen || movementLocked ? 0 : (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0),
        y: inputLocked || optionsOpen || movementLocked ? 0 : (keysRef.current.down ? 1 : 0) - (keysRef.current.up ? 1 : 0),
      };
      const length = Math.hypot(input.x, input.y);
      const active = length > 0;
      setMoving(active);

      
       playerAttackCooldownRef.current = Math.max(0, playerAttackCooldownRef.current - elapsed * 1000);
      setAttackCooldownMs(playerAttackCooldownRef.current);
      const playerAttack = playerAttackStateRef.current;
      if (playerAttack.active) {
        playerAttack.elapsed += elapsed * 1000;
        if (!playerAttack.hitApplied && playerAttack.elapsed >= 100) {
          playerAttack.hitApplied = true;
          const attackTarget = playerAttack.targetId == null ? null : goatsRef.current.find((goat) => goat.id === playerAttack.targetId && goat.disposition !== 'defeated');
          if (attackTarget && goatIsInAttackArc(attackTarget, positionRef.current, playerAttack.direction)) {
            const stats = playerStatsRef.current;
            const critical = Math.random() < playerCriticalChanceForStats(stats);
            const damage = playerDamageForStats(stats) * (critical ? 2 : 1);
            const nextHp = Math.max(0, attackTarget.hp - damage);
            const defeated = nextHp <= 0;
            const hitPosition = { ...attackTarget.position };
            let updatedGoats = goatsRef.current.map((goat) => goat.id === attackTarget.id ? { ...goat, hp: nextHp, position: goat.position, disposition: defeated ? 'defeated' as GoatDisposition : 'aggressive' as GoatDisposition, state: defeated ? 'die' as GoatStateName : 'hurt' as GoatStateName, hurtTimer: defeated ? 0 : 300, attackCooldown: 0, attacking: false, hitFlash: true, respawnTicks: defeated ? 0 : goat.respawnTicks } : goat);
            goatsRef.current = updatedGoats; setGoats(updatedGoats);
            spawnCombatText((critical ? 'CRIT ' : '') + '-' + damage, hitPosition, critical ? 'critical' : 'damage');
            playCombatSound('baa', muted);
            window.setTimeout(() => setGoats((current) => current.map((goat) => goat.id === attackTarget.id ? { ...goat, hitFlash: false } : goat)), 100);
            setLogs((currentLogs) => [{ text: defeated ? 'Goat defeated. It drops experience and gold.' : 'You hit the goat for ' + damage + (critical ? ' critical' : '') + ' damage.', color: defeated ? 'blue' : 'red' }, ...currentLogs].slice(0, 3));
            if (defeated) {
              const lootType = GOAT_LOOT_TYPES[Math.floor(Math.random() * GOAT_LOOT_TYPES.length)];
              const lootAmount = Math.floor(Math.random() * (2 + Math.floor(playerStatsRef.current.luk / 10))) + 1;
              const loot: GoatLoot = { [lootType]: lootAmount };
              const drop: DroppedLoot = { id: droppedLootIdRef.current++, chunk: { ...chunkRef.current }, position: hitPosition, loot };
              droppedLootRef.current = [...droppedLootRef.current, drop]; setDroppedLoot(droppedLootRef.current);
              const xpReward = goatExperienceReward(attackTarget, playerLevelRef.current, playerStatsRef.current);
              const nextXp = playerXpRef.current + xpReward; const nextLevel = Math.floor(nextXp / 100) + 1; const previousLevel = playerLevelRef.current;
              playerXpRef.current = nextXp; setPlayerXp(nextXp);
              spawnCombatText('+' + xpReward + ' XP  +' + (loot.coins || 0) + ' gold', hitPosition, 'reward');
              if (nextLevel > previousLevel) {
                const awardedStatPoints = (nextLevel - previousLevel) * PLAYER_STAT_POINTS_PER_LEVEL;
                playerLevelRef.current = nextLevel; setPlayerLevel(nextLevel); onStatPointsChange((current) => current + awardedStatPoints);
                updatedGoats = scaleGoatsToPlayerLevel(updatedGoats, nextLevel); goatsRef.current = updatedGoats; setGoats(updatedGoats);
              }
              targetGoatIdRef.current = null; setTargetGoatId(null);
            }
          } else {
            spawnCombatText('MISS', positionRef.current, 'damage');
          }
        }
        if (playerAttack.elapsed >= PLAYER_ATTACK_ANIMATION_MS) {
          playerAttack.active = false;
          setAttacking(false);
          setAttackFacing(null);
        }
      }
      if (!interiorRef.current && goatsRef.current.length > 0) {
        const currentGoats = goatsRef.current; const currentPlayer = positionRef.current; const currentChunk = chunkRef.current;
        let damageTaken = 0;
        const nextGoats = currentGoats.map((goat) => {
          if (goat.disposition === 'defeated') {
            const respawnTicks = goat.respawnTicks + elapsed * 1000 / GOAT_TICK_MS;
            if (respawnTicks >= GOAT_RESPAWN_TICKS) return { ...goat, state: 'idle' as GoatStateName, attacking: false, position: { ...goat.spawnPosition }, hp: goat.maxHp, disposition: GOAT_SPAWN_DISPOSITION, attackCooldown: GOAT_ATTACK_COOLDOWN_MS, respawnTicks: 0, moving: false, attackTimer: 0, attackHitApplied: false, hurtTimer: 0, hitFlash: false };
            return { ...goat, moving: false, attacking: false, respawnTicks };
          }
          const result = updateGoat({ ...goat, state: goat.state ?? 'idle', hurtTimer: goat.hurtTimer ?? 0, attackTimer: goat.attackTimer ?? 0, attackHitApplied: goat.attackHitApplied ?? false }, currentPlayer, facingRef.current, currentGoats, elapsed * 1000);
          let next = result.goat;
          if (next.moving && isFieldPositionBlocked(next.position, currentChunk)) next = { ...next, position: goat.position, moving: false };
          const separatedPosition = separateGoatFromPlayer(next.position, currentPlayer);
          if (separatedPosition) {
            next = !isFieldPositionBlocked(separatedPosition, currentChunk)
              ? { ...next, position: separatedPosition, moving: false }
              : { ...next, position: goat.position, moving: false };
          }
          if (result.attackHit) {
            const damage = goatAttackDamageForLevel(goat.level); damageTaken += damage;
            spawnCombatText('-' + damage, currentPlayer, 'damage'); playCombatSound('shing', muted);
          }
          return next;
        });
        if (damageTaken > 0) {
          const nextHp = Math.max(0, playerHpRef.current - damageTaken); playerHpRef.current = nextHp; setPlayerHp(nextHp); 
          setLogs((currentLogs) => [{ text: 'A hostile goat rams you for ' + damageTaken + ' damage.', color: 'red' }, ...currentLogs].slice(0, 3));
        }
        goatsRef.current = nextGoats; setGoats(nextGoats);
      }
      const currentInterior = interiorRef.current;
       if (active && currentInterior) {
          const direction = input.x > 0 ? 'right' : input.x < 0 ? 'left' : input.y < 0 ? 'up' : 'down';
          facingRef.current = direction;
          setFacing(direction);
         const frameWidth = gameFrameRef.current?.clientWidth || window.innerWidth;
         const frameHeight = gameFrameRef.current?.clientHeight || window.innerHeight;
         const movement = { x: (input.x / length) * WALK_SPEED * elapsed * 100 / frameWidth, y: (input.y / length) * WALK_SPEED * elapsed * 100 / frameHeight };
         const current = interiorPositionRef.current;
         const next = { x: Math.min(90, Math.max(10, current.x + movement.x)), y: current.y + movement.y };
         const horizontalStep = { x: next.x, y: current.y };
         const verticalStep = { x: current.x, y: next.y };
         const resolvedInteriorPosition = isInteriorPositionBlocked(next, currentInterior)
           ? !isInteriorPositionBlocked(horizontalStep, currentInterior)
             ? horizontalStep
             : !isInteriorPositionBlocked(verticalStep, currentInterior)
               ? verticalStep
               : current
           : next;
         const doorwayHalfWidth = (((INTERIOR_DOORWAY_WIDTH_PX + INTERIOR_PLAYER_WIDTH_PX) / 2 + INTERIOR_DOORWAY_PADDING_PX) / Math.max(1, frameWidth)) * 100;
         const atDoorway = Math.abs(next.x - 50) <= doorwayHalfWidth;
         if (next.y > 91 && atDoorway) {
           const exitPosition = currentInterior.exteriorPosition;
           interiorDoorwayIdRef.current = null;
           interiorRef.current = null; setInterior(null);
           interiorPositionRef.current = { x: 50, y: 89 }; setInteriorPosition({ x: 50, y: 89 });
           positionRef.current = exitPosition; setPosition(exitPosition);
           setLogs((currentLogs) => [{ text: 'You step back outside into Mosslight Crossing.', color: 'blue' }, ...currentLogs].slice(0, 3));
         } else {
           const interiorPosition = next.y > 91
             ? { ...resolvedInteriorPosition, y: 91 }
             : resolvedInteriorPosition;
           interiorPositionRef.current = interiorPosition;
           setInteriorPosition(interiorPosition);
         }
         animationFrame = window.requestAnimationFrame(animate); return;
       }
if (active) {
        const direction = input.x > 0 ? 'right' : input.x < 0 ? 'left' : input.y < 0 ? 'up' : 'down';
        facingRef.current = direction;
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
        const nearbyDoor = doorwayNear(attempted, currentChunk);
        if (nearbyDoor && canEnterDoorway(current, attempted, nearbyDoor, direction)) {
          interiorDoorwayIdRef.current = nearbyDoor.id;
          interiorRef.current = nearbyDoor.area; setInterior(nearbyDoor.area);
          interiorPositionRef.current = { x: 50, y: 89 }; setInteriorPosition({ x: 50, y: 89 });
          setMoving(false);
          setLogs((currentLogs) => [{ text: 'You enter the ' + nearbyDoor.area.name + '.', color: 'blue' }, ...currentLogs].slice(0, 3));
          animationFrame = window.requestAnimationFrame(animate); return;
        }
        const resolved = resolveFieldMovement(current, movement, currentChunk, goatsRef.current);
        if (resolved) {
          // The current continent is the tutorial world. Its ocean edge is reserved for the future boat route.
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
      const nextClock = brainRef.current?.worldCore.advance(1);
      if (nextClock) setTime(formatWorldClock(nextClock));
    }, 3000);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearInterval(clock);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onChunkChange, interior, inputLocked, optionsOpen]);



  const spawnCombatText = (text: string, position: Point, kind: 'damage' | 'reward' | 'critical') => {
    const id = combatTextIdRef.current++;
    setDamageTexts((current) => [...current, { id, text, position, kind }]);
    window.setTimeout(() => setDamageTexts((current) => current.filter((entry) => entry.id !== id)), 900);
  };
  const playAttackAnimation = (direction: Direction) => {
    setAttackFacing(direction);
    setAttackSequence((current) => current + 1);
    setAttacking(true);
  };

  const attackGoat = (preferredTargetId?: number) => {
    if (interiorRef.current || playerAttackStateRef.current.active || playerAttackCooldownRef.current > 0) return;
    const currentPlayer = positionRef.current;
    const currentFacing = facingRef.current;
    const targetId = preferredTargetId ?? targetGoatIdRef.current;
    const target = targetId == null
      ? goatsRef.current.filter((goat) => goat.disposition !== 'defeated' && goatIsInAttackArc(goat, currentPlayer, currentFacing)).sort((a, b) => goatDistance(a, currentPlayer) - goatDistance(b, currentPlayer))[0]
      : goatsRef.current.find((goat) => goat.id === targetId && goat.disposition !== 'defeated' && goatIsInAttackArc(goat, currentPlayer, currentFacing));
    if (!target) return;
    playerAttackStateRef.current = { active: true, direction: currentFacing, targetId: target.id, elapsed: 0, hitApplied: false };
    playerAttackCooldownRef.current = PLAYER_ATTACK_COOLDOWN_MS;
    setAttackCooldownMs(PLAYER_ATTACK_COOLDOWN_MS);
    playAttackAnimation(currentFacing);
  };

  const pickupDrop = (drop: DroppedLoot) => {
    if (drop.chunk.x !== chunkRef.current.x || drop.chunk.y !== chunkRef.current.y || Math.hypot(drop.position.x - positionRef.current.x, drop.position.y - positionRef.current.y) > 16) return;
    onLoot(drop.loot);
    setDroppedLoot((current) => current.filter((candidate) => candidate.id !== drop.id));
    const contents = [
      drop.loot.goatHorns ? `+${drop.loot.goatHorns} horn${drop.loot.goatHorns === 1 ? '' : 's'}` : '',
      drop.loot.fabric ? `+${drop.loot.fabric} fabric` : '',
      drop.loot.coins ? `+${drop.loot.coins} gold` : '',
    ].filter(Boolean).join(' · ');
    const message = `Picked up goat loot: ${contents}.`;
    setLogs((currentLogs) => [{ text: message, color: 'blue' }, ...currentLogs].slice(0, 3));
    setAttackFlash(message);
    window.setTimeout(() => setAttackFlash(null), 1200);
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
    if (inputLocked || optionsOpen) return;
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

  const playerRenderFacing = attackFacing ?? facing;
  const currentWorldTile = mapTileFor(chunk);
  const selectedGoat = targetGoatId === null ? null : goats.find((goat) => goat.id === targetGoatId && goat.disposition !== 'defeated') || null;
  const playerMaxHp = playerMaxHpForStats(playerStats);
  const fieldTrees = fieldTreesFor(chunk);
  const fieldAccents = fieldAccentsFor(chunk);
  const fieldPalette = currentWorldTile.regionStyle === 'ocean' ? fieldPalettes.ocean : regionPalettes[currentWorldTile.regionStyle];
  const startingArea = isStartingArea(chunk);
  const startingCenter = isTutorialCenter(chunk);
  const inventoryItemCount = inventory.goatHorns + inventory.fabric + inventory.daggers + inventory.cloths;
  const talkToNpc = (npc: TownNpc) => {
    setNpcDialogue(npc);
    setLogs((currentLogs) => [{ text: `${npc.name} turns to you: ${npc.title}.`, color: 'blue' }, ...currentLogs].slice(0, 3));
  };
  const inspectAdventurer = (adventurer: SimulatedAdventurer) => {
    setLogs((currentLogs) => [{ text: `${adventurer.name}, level ${adventurer.level} ${adventurer.className}, is ${adventurer.activity}. Goal: ${adventurer.goal}.`, color: 'blue' }, ...currentLogs].slice(0, 3));
    setAttackFlash(`${adventurer.name}: ${adventurer.goal}`);
    window.setTimeout(() => setAttackFlash(null), 1600);
  };
  const chooseClass = (nextClass: Exclude<PlayerClass, 'Beginner'>) => {
    if (playerLevelRef.current < 10) return;
    playerClassRef.current = nextClass;
    setPlayerClass(nextClass);
    setNpcDialogue(null);
    setAttackFlash(`Class chosen: ${nextClass}. The boat route to the wider world is unlocked.`);
    setLogs((currentLogs) => [{ text: `You become a ${nextClass}. The wider world will open by boat.`, color: 'blue' }, ...currentLogs].slice(0, 3));
    window.setTimeout(() => setAttackFlash(null), 1500);
  };
  const craftItem = (item: CraftItem) => {
    const recipe = craftRecipes[item];
    if (!Object.entries(recipe.cost).every(([key, value]) => (inventory[key as keyof GameInventory] || 0) >= (value || 0))) {
      setAttackFlash(`You need more materials to make ${recipe.name}.`);
      window.setTimeout(() => setAttackFlash(null), 1100);
      return;
    }
    onLoot({
      goatHorns: -(recipe.cost.goatHorns || 0),
      fabric: -(recipe.cost.fabric || 0),
      daggers: recipe.reward.daggers || 0,
      cloths: recipe.reward.cloths || 0,
    });
    setAttackFlash(`${recipe.name} crafted.`);
    setLogs((currentLogs) => [{ text: `${recipe.name} added to your satchel.`, color: 'blue' }, ...currentLogs].slice(0, 3));
    window.setTimeout(() => setAttackFlash(null), 1100);
  };

  return (
    <div className="field-column">
      <div ref={gameFrameRef} className="game-frame" tabIndex={0} aria-label="Playable Mosslight Crossing field" data-testid="game-field" data-brain-chunk={brainRef.current?.currentChunkId || 'unknown'}>
        {interior ? <InteriorRoom area={interior} position={interiorPosition} facing={playerRenderFacing} moving={moving} inventory={inventory} equippedDagger={equippedDagger} attacking={attacking} attackSequence={attackSequence} onCraft={craftItem} /> : (
        <div className={'pixel-field world-field world-region-' + currentWorldTile.regionStyle + ' map-terrain-' + currentWorldTile.terrain + (currentWorldTile.waterFeature ? ' world-is-' + currentWorldTile.waterFeature : '') + (startingArea ? ' starting-area' : '')} data-terrain={currentWorldTile.terrain} data-region={currentWorldTile.regionStyle} style={{
          '--field-color': fieldPalette.field,
          '--path-color': fieldPalette.path,
          '--field-glow': fieldPalette.glow,
        } as CSSProperties}>
          <span className="field-edge top" /><span className="field-edge bottom" /><span className="field-edge left" /><span className="field-edge right" />
          <div className="field-world-layer">
          {currentWorldTile.waterFeature && <div className={'field-water world-water-' + currentWorldTile.waterFeature + (currentWorldTile.waterEdge ? ' water-edge-' + currentWorldTile.waterEdge : '')} aria-hidden="true" />}
           <div className="field-accents" aria-hidden="true">
             {fieldAccents.map((accent) => (
               <span
                 className={'field-accent accent-' + accent.kind}
                 key={accent.id}
                 style={{ left: accent.x + '%', top: accent.y + '%', transform: 'translate(-50%, -50%) rotate(' + accent.rotation + 'deg) scale(' + accent.scale + ')' }}
               />
             ))}
           </div>
          {currentWorldTile.road !== 'none' && <div className={'field-road field-road-' + currentWorldTile.road + (currentWorldTile.bridge ? ' field-bridge' : '')} aria-hidden="true" />}
          {startingCenter && (
            <div className="starting-area-decor" aria-hidden="true">
              <span className="starting-flower flower-northwest" />
              <span className="starting-flower flower-northeast" />
              <span className="starting-flower flower-southwest" />
              <span className="starting-flower flower-southeast" />
            </div>
          )}
                    <div className="field-goats" aria-label="Goats in the field">
            {goats.filter((goat) => goat.disposition !== 'defeated').map((goat) => (
              <button
                type="button"
                className={'goat goat-' + goat.disposition + ' goat-state-' + getSpriteState(goat.state, goat.facing) + (goat.moving ? ' is-moving' : '') + (goat.attacking ? ' is-attacking' : '') + (goat.hitFlash ? ' is-hit' : '') + (targetGoatId === goat.id ? ' is-targeted' : '')}
                style={{ left: goat.position.x + '%', top: goat.position.y + '%' }}
                data-facing={goat.facing}
                 data-state={goat.state}
                 data-disposition={goat.disposition}
                aria-label={(goat.disposition === 'aggressive' ? 'Hostile goat' : 'Peaceful goat') + ', level ' + goat.level}
                aria-pressed={targetGoatId === goat.id}
                data-testid={'button-target-goat-' + goat.id}
                onClick={() => {
                  if (inputLocked || optionsOpen || playerAttackStateRef.current.active) return;
                  const dx = goat.position.x - position.x;
                  const dy = goat.position.y - position.y;
                  const nextFacing: Direction = Math.abs(dx) >= Math.abs(dy)
                    ? (dx >= 0 ? 'right' : 'left')
                    : (dy >= 0 ? 'down' : 'up');
                  facingRef.current = nextFacing;
                  setFacing(nextFacing);
                  targetGoatIdRef.current = goat.id;
                  setTargetGoatId(goat.id);
                  attackGoat(goat.id);
                }}
              >
                <span className="goat-target-ring" aria-hidden="true" />
                <span className="goat-hp" style={{ width: (goat.hp / goat.maxHp) * 100 + '%' }} />
                {goat.disposition === 'aggressive' && <span className="goat-aggro">!</span>}
                <span className="goat-sprite" />
              </button>
            ))}
          </div>
          <div className="combat-text-layer" aria-live="polite">
            {damageTexts.map((entry) => <span className={'combat-text ' + entry.kind} key={entry.id} style={{ left: entry.position.x + '%', top: entry.position.y + '%' }}>{entry.text}</span>)}
          </div>
          <div className="field-drops" aria-label="Dropped loot">
            {droppedLoot.filter((drop) => drop.chunk.x === chunk.x && drop.chunk.y === chunk.y).map((drop) => {
              const nearby = Math.hypot(drop.position.x - position.x, drop.position.y - position.y) <= 16;
              return <div className="loot-drop" key={drop.id} style={{ left: drop.position.x + '%', top: drop.position.y + '%' }}>
                <span className="loot-bag" aria-label="Dropped goat loot bag" />
                {nearby && <button className="pickup-button" onClick={() => pickupDrop(drop)} data-testid={'button-pickup-loot-' + drop.id}>Pick up</button>}
              </div>;
            })}
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
              <span className="field-house house-1" /><span className="field-house house-2" /><span className="field-house house-3">
                {startingArea && (
                  <button className="dungeon-staircase" onClick={onEnterDungeon} aria-label="Enter the Ember Vault dungeon" data-testid="button-enter-dungeon">
                    <span className="dungeon-staircase-stone" aria-hidden="true">▾</span>
                    <span className="dungeon-staircase-label">Ember Vault</span>
                  </button>
                )}
              </span>
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
          {currentWorldTile.landmark?.name === 'Mosslight Crossing' && npcStates.map((npc) => (
            <button
              className={'town-npc npc-' + npc.role}
              onClick={() => talkToNpc(npc)}
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
            </button>
          ))}
          {currentWorldTile.landmark?.name === 'Mosslight Crossing' && simulatedAdventurers.map((adventurer) => (
            <button
              key={adventurer.id}
              className={'simulated-adventurer adventurer-' + adventurer.className.toLowerCase()}
              onClick={() => inspectAdventurer(adventurer)}
              style={{ left: adventurer.position.x + '%', top: adventurer.position.y + '%' }}
              data-facing={adventurer.facing}
              aria-label={adventurer.name + ', level ' + adventurer.level + ' ' + adventurer.className}
              title={adventurer.name + ' — ' + adventurer.goal}
              data-testid={'simulated-adventurer-' + adventurer.id}
            >
              <span className="simulated-adventurer-nameplate">
                <strong>{adventurer.name}</strong>
                <small>Lv. {adventurer.level} · {adventurer.activity}</small>
              </span>
              <span className="simulated-adventurer-sprite" aria-hidden="true" />
            </button>
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
          {!mounted && <div className={'player ' + (!mounted && moving ? 'is-moving ' : '') + (attacking ? 'is-attacking' : '')}
             data-state={attacking ? 'attack' : moving ? 'run' : 'idle'} style={{ left: position.x + '%', top: position.y + '%', '--attack-y': `${-attackDirectionRow[playerRenderFacing] * 48}px` } as CSSProperties} data-facing={playerRenderFacing} data-testid="player-character">
            <span className="player-sprite" />
            {attacking && <span key={attackSequence} className="player-attack-sprite" aria-hidden="true" style={{ '--attack-y': `${-attackDirectionRow[playerRenderFacing] * 48}px`, backgroundImage: `url("${assetUrl('assets/gameplay/shining-fields/characters/player/attack.png')}")` } as CSSProperties} />}
            {equippedDagger && <span className="player-dagger" aria-label="Equipped dagger" />}
          </div>}
        </div>
        )}
        {optionsOpen && (
          <div className="options-overlay" role="dialog" aria-modal="true" aria-labelledby="options-title" data-testid="overlay-options">
            <div className="options-card">
              <div className="options-heading">
                <div>
                  <span className="options-kicker">Adventure Game</span>
                  <h2 id="options-title">Options</h2>
                </div>
                <button className="map-close" onClick={() => setOptionsOpen(false)} aria-label="Close options" data-testid="button-close-options"><X size={19} /></button>
              </div>
              <p className="options-copy">Save your progress in this browser for quick continuation, or download a file to keep a backup.</p>
              <div className="options-sound-control">
                <div className="options-sound-info">
                  {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                  <span><strong>Volume</strong><small>{muted ? 'Sound is muted' : 'Sound is on'}</small></span>
                </div>
                <button className="options-sound-toggle" onClick={onToggleMute} aria-pressed={muted} data-testid="button-options-sound">{muted ? 'Turn on' : 'Mute'}</button>
              </div>
              <div className="options-actions">
                <button className="options-action primary" onClick={() => { onSave(); setOptionsOpen(false); }} data-testid="button-save-browser">
                  <span className="options-action-icon"><SaveIcon /></span>
                  <span><strong>Save Game</strong><small>Keep progress in this browser</small></span>
                </button>
                <button className="options-action" onClick={() => { onDownloadSave(); setOptionsOpen(false); }} data-testid="button-download-save">
                  <span className="options-action-icon"><Download size={17} /></span>
                  <span><strong>Download Save File</strong><small>Export a portable JSON backup</small></span>
                </button>
                <button className="options-action" onClick={() => { setOptionsOpen(false); onOpenLoad(); }} data-testid="button-import-save">
                  <span className="options-action-icon"><Upload size={17} /></span>
                  <span><strong>Load Save File</strong><small>Import a downloaded JSON save</small></span>
                </button>
              </div>
              <button className="options-menu-button" onClick={() => { setOptionsOpen(false); onOpenMenu(); }} data-testid="button-options-main-menu">Main Menu</button>
            </div>
          </div>
        )}
        {npcDialogue && (
          <div className="npc-dialogue-overlay" role="dialog" aria-modal="true" aria-labelledby="npc-dialogue-title">
            <div className="npc-dialogue-card">
              <div className={'dialogue-portrait npc-' + npcDialogue.role} data-facing={npcDialogue.facing}><span className="npc-sprite" /></div>
              <div className="npc-dialogue-copy">
                <span className="dialogue-kicker">{npcDialogue.title}</span>
                <h2 id="npc-dialogue-title">{npcDialogue.name}</h2>
                <p>
                  {playerLevel < 10
                    ? `Welcome, Beginner. Earn ${10 - playerLevel} more levels by exploring and defeating goats, then return here for your class choice.`
                    : playerClass === 'Beginner'
                      ? `You have reached level 10. Choose the path that feels right: ${classDescriptions[npcDialogue.role === 'guide' ? 'Warrior' : npcDialogue.role === 'warrior' ? 'Warrior' : npcDialogue.role === 'mage' ? 'Mage' : 'Rogue']}`
                      : `You are already a ${playerClass}. Keep exploring the world and put your new strengths to work.`
                  }
                </p>
                {playerLevel >= 10 && playerClass === 'Beginner' && (
                  <div className="class-choice-grid" aria-label="Choose your class">
                    {(Object.keys(classDescriptions) as Exclude<PlayerClass, 'Beginner'>[]).map((nextClass) => (
                      <button key={nextClass} className="class-choice" onClick={() => chooseClass(nextClass)} data-testid={'button-choose-' + nextClass.toLowerCase()}>
                        <strong>{nextClass}</strong><small>{classDescriptions[nextClass]}</small>
                      </button>
                    ))}
                  </div>
                )}
                <button className="dialogue-close" onClick={() => setNpcDialogue(null)} data-testid="button-close-dialogue">
                  {playerLevel >= 10 && playerClass === 'Beginner' ? 'Not yet' : 'Continue'}
                </button>
              </div>
            </div>
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
          <div className={'hud-card ' + (playerHp / playerMaxHp <= 0.25 ? 'is-wounded' : '')} data-testid="hud-player">
            <div className="hud-label"><span>Player</span><span data-testid="text-level">LV {playerLevel}</span></div>
            <div className="bar" aria-label={'Health ' + playerHp + ' of ' + playerMaxHp} ><div className="bar-fill health" style={{ width: (playerHp / playerMaxHp) * 100 + '%' }} /></div><span className="hud-health-value">{playerHp} / {playerMaxHp} HP</span>
            {selectedGoat && (
              <div className="hud-target" data-testid="hud-target">
                <div className="hud-target-label"><span>Target</span><strong>GOAT · LV {selectedGoat.level}</strong></div>
                <div className="bar target-bar" aria-label={'Target health ' + selectedGoat.hp + ' of ' + selectedGoat.maxHp}><div className="bar-fill target-health" style={{ width: (selectedGoat.hp / selectedGoat.maxHp) * 100 + '%' }} /></div>
              </div>
            )}
            <span className="hud-build" data-testid="text-build-number">BUILD {BUILD_NUMBER}</span>
            {mounted && <button className="horse-dismount-button" onClick={toggleMount} aria-label="Dismount horse" data-testid="button-dismount-horse">Dismount</button>}
          </div>
          <button className="hud-card right hud-button" onClick={onOpenInventory} aria-label="Open inventory" data-testid="button-open-inventory">
            <div className="hud-label"><span>Menu</span><Coins size={12} /></div>
             <div className="hud-coins" data-testid="text-coin-count">{inventory.coins.toLocaleString()} gold</div>
             <div className="hud-items" data-testid="text-item-count">{inventoryItemCount} items</div>
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
           <button className="icon-button field-attack-button" onClick={() => attackGoat()} disabled={attackCooldownMs > 0 || attacking || inputLocked || Boolean(interior)} aria-label={selectedGoat ? 'Strike selected goat' : 'Strike nearest goat'} title={selectedGoat ? 'Strike selected target · Space' : 'Strike nearest target · Space'} aria-disabled={attackCooldownMs > 0 || attacking} data-testid="button-attack"><Sword size={16} />{attackCooldownMs > 0 && <span className="attack-cooldown-ring" style={{ background: 'conic-gradient(rgba(219, 120, 94, .95) ' + ((attackCooldownMs / PLAYER_ATTACK_COOLDOWN_MS) * 100) + '%, rgba(19, 43, 34, .2) 0)' }} aria-hidden="true" />}</button>
            <button className="icon-button field-log-toggle" onClick={() => setLogOpen((value) => !value)} aria-expanded={logOpen} aria-controls="field-log-drawer" aria-label={logOpen ? 'Hide field log' : 'Open field log'} title={logOpen ? 'Hide field log' : 'Open field log'} data-testid="button-toggle-field-log"><BookOpen size={16} /></button>
           <button className="icon-button map-button" onClick={onOpenMap} aria-label="Open field atlas" title="Open field atlas" data-testid="button-open-map"><Map size={16} /></button>
            <button className="icon-button" onClick={() => setOptionsOpen(true)} aria-label="Open options" title="Options" data-testid="button-open-options"><Settings size={15} /></button>
         </div>
      </div>
      <div className="sr-only" aria-live="polite" data-testid="status-movement">{moving ? (mounted ? 'Riding through Mosslight Crossing' : 'Moving through Mosslight Crossing') : (mounted ? 'Mounted and ready' : 'Standing still')}</div>
      <div className="sr-only" aria-live="polite" data-testid="status-mount">{mounted ? 'Mounted on the horse' : canMount ? 'Horse nearby and ready to mount' : horseHere ? 'Horse is parked in this field' : 'Horse is in another field'}</div>
      <div className="sr-only" aria-live="polite" data-testid="status-field-log">{logs[0].text}</div>
    </div>
  );
}

function SaveIcon() {
  return <span className="save-icon" aria-hidden="true">▣</span>;
}

function Home() {
  const [mapOpen, setMapOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chunk, setChunk] = useState({ x: 4, y: 7 });
  const [inventory, setInventory] = useState<GameInventory>(initialInventory);
  const [playerStats, setPlayerStats] = useState<PlayerStats>(initialPlayerStats);
  const [statPoints, setStatPoints] = useState(0);
  const [equippedDagger, setEquippedDagger] = useState(false);
  // Start with the RPG brain-backed game state active by default.
  const [menuOpen, setMenuOpen] = useState(false);
  const [dungeonOpen, setDungeonOpen] = useState(false);
  const [loadedSave, setLoadedSave] = useState<SaveGameData | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!saveNotice) return;
    const timeout = window.setTimeout(() => setSaveNotice(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);
  const [hasLocalSave, setHasLocalSave] = useState(false);
  const saveStateRef = useRef<(() => SaveGameData) | null>(null);
  const saveFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setHasLocalSave(Boolean(window.localStorage.getItem(SAVE_STORAGE_KEY) || window.localStorage.getItem(SAVE_LEGACY_STORAGE_KEY)));
    } catch {
      setHasLocalSave(false);
    }
  }, []);
  const applyLoot = (loot: GoatLoot) => setInventory((current) => ({
    coins: Math.max(0, current.coins + (loot.coins || 0)),
    goatHorns: Math.max(0, current.goatHorns + (loot.goatHorns || 0)),
    fabric: Math.max(0, current.fabric + (loot.fabric || 0)),
    daggers: Math.max(0, current.daggers + (loot.daggers || 0)),
    cloths: Math.max(0, current.cloths + (loot.cloths || 0)),
  }));

  const toggleDagger = () => {
    if (equippedDagger) {
      setEquippedDagger(false);
      setInventory((current) => ({ ...current, daggers: current.daggers + 1 }));
      return;
    }
    if (inventory.daggers < 1) return;
    setInventory((current) => ({ ...current, daggers: Math.max(0, current.daggers - 1) }));
    setEquippedDagger(true);
  };

  const startNewGame = () => {
    setLoadedSave(null);
    setInventory(initialInventory);
    setPlayerStats(initialPlayerStats);
    setStatPoints(0);
    setEquippedDagger(false);
    setChunk({ x: 4, y: 7 });
    setMapOpen(false); setInventoryOpen(false); setSaveNotice(null); setMenuOpen(false);
  };

  const assignStatPoint = (stat: StatKey) => {
    if (statPoints < 1) return;
    setStatPoints((current) => current - 1);
    setPlayerStats((current) => ({ ...current, [stat]: current[stat] + 1 }));
  };

  const applyLoadedSave = (parsed: SaveGameData, notice: string) => {
    setLoadedSave(parsed);
    const savedEquippedDagger = Boolean(parsed.equippedDagger);
    setInventory({ ...parsed.inventory, daggers: Math.max(0, parsed.inventory.daggers - (savedEquippedDagger ? 1 : 0)) });
    setPlayerStats(parsed.playerStats || initialPlayerStats);
    setStatPoints(Math.max(0, Math.floor(parsed.statPoints || 0)));
    setEquippedDagger(savedEquippedDagger);
    setChunk(parsed.chunk);
    setMapOpen(false); setInventoryOpen(false); setSaveNotice(notice); setMenuOpen(false);
  };

  const loadLocalSave = () => {
    try {
      const raw = window.localStorage.getItem(SAVE_STORAGE_KEY) || window.localStorage.getItem(SAVE_LEGACY_STORAGE_KEY);
      if (!raw) {
        setSaveNotice('No browser save found yet. Start a game and save from Options.');
        return;
      }
      const parsed: unknown = migrateSave(JSON.parse(raw));
      if (!isSaveGameData(parsed)) throw new Error('invalid save');
      applyLoadedSave(parsed, 'Browser save loaded.');
    } catch {
      setHasLocalSave(false);
      setSaveNotice('The browser save could not be loaded.');
    }
  };

  const saveGame = () => {
    const save = saveStateRef.current?.();
    if (!save) { setSaveNotice('Start a game before saving.'); return; }
    try {
      window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
      setHasLocalSave(true);
      setSaveNotice('Game saved in this browser.');
    } catch {
      setSaveNotice('This browser could not store the save. Download a save file instead.');
    }
  };

  const openLoadPicker = () => saveFileInputRef.current?.click();

  const handleSaveFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = migrateSave(JSON.parse(String(reader.result)));
        if (!isSaveGameData(parsed)) throw new Error('invalid save');
        applyLoadedSave(parsed, 'Save file loaded.');
      } catch {
        setSaveNotice('That file is not a valid Adventure Game save.');
      }
    };
    reader.onerror = () => setSaveNotice('The save file could not be read.');
    reader.readAsText(file);
  };

  const downloadSave = () => {
    const save = saveStateRef.current?.();
    if (!save) { setSaveNotice('Start a game before downloading a save.'); return; }
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'adventure-game-save-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setSaveNotice('Save file downloaded.');
  };

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
      className={menuOpen ? 'game-app menu-mode' : 'game-app'}
      style={{
        '--player-sprite-url': `url("${assetUrl('assets/cute-fantasy/player.png')}")`,
        '--player-attack-sprite-url': `url("${assetUrl('assets/gameplay/shining-fields/characters/player/attack.png')}")`,
        '--horse-sprite-url': `url("${assetUrl('assets/farm-male-cow-brown.png')}")`,
         '--goat-sprite-url': `url("${assetUrl('assets/gameplay/characters/goat/goat.png')}")`,
      } as CSSProperties}
    >
      {menuOpen ? (
        <section className="main-menu" aria-label="Main menu" data-testid="main-menu">
          <div className="main-menu-card">
            <span className="main-menu-kicker">THE FAR MEADOW · BUILD {BUILD_NUMBER}</span>
            <h1>Adventure Game</h1>
            <p>Follow the roads, learn the first hunt, and choose the path that carries you beyond Mosslight Crossing.</p>
            <div className="main-menu-actions">
              <button className="main-menu-button primary" onClick={startNewGame} data-testid="button-new-game">New Game</button>
              <button className="main-menu-button" onClick={loadLocalSave} disabled={!hasLocalSave} data-testid="button-load-game-menu">{hasLocalSave ? 'Load Game' : 'Load Game · No Save Yet'}</button>
              <button className="main-menu-button" onClick={openLoadPicker} data-testid="button-load-save-menu">Import Save File</button>
            </div>
            <p className="main-menu-note">Use Load Game for this browser, or Import Save File for a downloaded backup.</p>
            {saveNotice && <div className="save-notice" role="status">{saveNotice}</div>}
          </div>
        </section>
      ) : (
        <>
          <div className="game-layout">
            <GameField inventory={inventory} equippedDagger={equippedDagger} playerStats={playerStats} statPoints={statPoints} onPlayerStatsChange={setPlayerStats} onStatPointsChange={setStatPoints} onLoot={applyLoot} onOpenMap={() => setMapOpen(true)} onOpenInventory={() => setInventoryOpen(true)} onChunkChange={setChunk} muted={muted} onToggleMute={() => setMuted((value) => !value)} inputLocked={mapOpen || inventoryOpen || dungeonOpen} saveStateRef={saveStateRef} loadState={loadedSave} onSave={saveGame} onDownloadSave={downloadSave} onOpenLoad={openLoadPicker} onOpenMenu={() => { setSaveNotice(null); setMenuOpen(true); }} onEnterDungeon={() => setDungeonOpen(true)} />
          </div>
          {dungeonOpen && <StoneSoupDungeon onExit={() => setDungeonOpen(false)} />}
          {mapOpen && <WorldMap chunk={chunk} onClose={() => setMapOpen(false)} />}
          {inventoryOpen && <InventorySheet inventory={inventory} equippedDagger={equippedDagger} onToggleDagger={toggleDagger} playerStats={playerStats} statPoints={statPoints} onAssignStat={assignStatPoint} onClose={() => setInventoryOpen(false)} />}
          {saveNotice && <div className="save-notice save-notice-floating" role="status">{saveNotice}</div>}
        </>
      )}
      <input ref={saveFileInputRef} className="save-file-input" type="file" accept="application/json,.json" onChange={handleSaveFile} aria-label="Load Adventure Game save file" />
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
