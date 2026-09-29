import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Backpack, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Map as MapIcon, Menu, Minus, Plus, Settings, Sword, Upload, Volume2, VolumeX, X } from 'lucide-react';
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
import { EXPANDED_WORLD_BOUNDS, generateWorldMap, worldMapBiomeLabel, type GeneratedWorldTile, type WorldMapBiome } from '@/game/worldMap';
import StoneSoupDungeon from '@/game/StoneSoupDungeon';
import { advanceSimulatedAdventurers, initialSimulatedAdventurers, type SimulatedAdventurer } from '@/game/simulatedAdventurers';
import { isInMeleeArc } from '@/game/combat';
import { updateGoat, type GoatAIState } from '@/game/ai';
import { playCombatSound } from '@/game/effects';
import { cornStalksForChunk, type CornStalk } from '@/game/cornfield';
import { getSpriteState } from '@/game/animation';
import { CURRENT_SAVE_VERSION, SAVE_FILE_FORMAT, migrateSave } from '@/game/persistence';
import CharacterCreator from '@/components/CharacterCreator';
import { compositeAttackSprite, compositeCharacterSheet, sanitizeCharacterChoices, type CharacterChoices } from '@/game/characterCreator';
import { initWorldNoise, shouldPlaceVegetation, vegetationDensity } from '@/game/noise';
const PLAYER_SPRITE_URL = `${import.meta.env.BASE_URL}assets/cute-fantasy/player.png`;
const PLAYER_ATTACK_SPRITE_URL = `${import.meta.env.BASE_URL}assets/gameplay/shining-fields/characters/player/attack.png`;

const queryClient = new QueryClient();
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
// Flat fallback colors + PNG tile art for the world map, applied inline per tile.
const WORLD_TILE_BG: Record<string, string> = { ocean: '#2b2bd9', shore: '#e6d49a', meadow: '#47a13d', forest: '#47a13d', desert: '#e0c184', tundra: '#edf0ec', rock: '#9a9a9a' };
const BUILD_NUMBER = '204';
// Field size in world units. Chunks are FIELD_SIZE x FIELD_SIZE; the camera
// follows the player with a slight zoom so each area feels large to explore.
const FIELD_SIZE = 140;
// Buildings render larger than their authored 0..100 specs.
const BUILDING_SIZE_MULT = 1.0;
// Convert field units (0..FIELD_SIZE) to CSS percentage for positioning.
function fieldPct(v: number): string { return (v / FIELD_SIZE * 100) + '%'; }
type Direction = 'up' | 'down' | 'left' | 'right';
type Point = { x: number; y: number };
const PLAYER_COLLISION_BOX = { halfWidth: 3.6, halfHeight: 2.7 };
const GOAT_COLLISION_BOX = { halfWidth: 0.5, halfHeight: 0.6 };
const COLLISION_GAP = 0.35;
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
const terrainTypes = ['meadow', 'forest', 'rock', 'shore', 'desert', 'tundra', 'ocean'] as const;
type Terrain = (typeof terrainTypes)[number];
const fieldPalettes: Record<Terrain, { field: string; path: string; glow: string }> = {
  meadow: { field: '#77a45b', path: '#d9b979', glow: 'rgba(255, 227, 157, .22)' },
  forest: { field: '#4f7c50', path: '#c7a66b', glow: 'rgba(180, 214, 141, .18)' },
  rock: { field: '#87927a', path: '#c9b27d', glow: 'rgba(238, 228, 186, .2)' },
  shore: { field: '#c4a06a', path: '#dfc58d', glow: 'rgba(218, 239, 194, .2)' },
  desert: { field: '#bd9157', path: '#d7ac6b', glow: 'rgba(255, 198, 123, .2)' },
  tundra: { field: '#aebfba', path: '#d0d8d0', glow: 'rgba(222, 239, 236, .24)' },
  ocean: { field: '#2a6f8d', path: '#8ab8bd', glow: 'rgba(140, 213, 219, .2)' },
};

const worldMapBounds = EXPANDED_WORLD_BOUNDS;
const generatedWorldTiles = generateWorldMap(DEFAULT_WORLD_SEED, worldMapBounds);
const generatedWorldTileByKey = new Map(generatedWorldTiles.map((tile) => [tile.x + ',' + tile.y, tile]));
// Initialize Minecraft-style Perlin noise for vegetation/terrain placement
initWorldNoise(DEFAULT_WORLD_SEED);

function generatedWorldTileFor(point: Point) {
  return generatedWorldTileByKey.get(point.x + ',' + point.y) || null;
}

function terrainForWorldBiome(biome: GeneratedWorldTile['biome']): Terrain {
  return biome === 'forest' ? 'forest' : biome === 'desert' ? 'desert' : biome === 'tundra' ? 'tundra' : biome;
}

function regionStyleForWorldBiome(biome: GeneratedWorldTile['biome']): RegionStyle {
  if (biome === 'ocean') return 'ocean';
  if (biome === 'forest') return 'ironwood';
  if (biome === 'desert') return 'sunwash';
  if (biome === 'tundra' || biome === 'rock') return 'northwatch';
  if (biome === 'shore') return 'brackenfen';
  return 'greenvale';
}

type RegionStyle = 'greenvale' | 'brackenfen' | 'ironwood' | 'northwatch' | 'sunwash' | 'ocean';
const regionPalettes: Record<Exclude<RegionStyle, 'ocean'>, { field: string; path: string; glow: string }> = {
  greenvale: { field: '#77a45b', path: '#d9b979', glow: 'rgba(255, 227, 157, .22)' },
  brackenfen: { field: '#617d51', path: '#bca979', glow: 'rgba(186, 207, 135, .2)' },
  ironwood: { field: '#587b58', path: '#c4a26c', glow: 'rgba(188, 219, 157, .18)' },
  northwatch: { field: '#858a78', path: '#d0bd8b', glow: 'rgba(238, 228, 186, .2)' },
  sunwash: { field: '#9a7658', path: '#d7ac6b', glow: 'rgba(255, 198, 123, .2)' },
};

function isContinentChunk(point: Point) {
  const tile = generatedWorldTileFor(point);
  return Boolean(tile && tile.biome !== 'ocean');
}

function regionStyleFor(point: Point): RegionStyle {
  const tile = generatedWorldTileFor(point);
  return tile ? regionStyleForWorldBiome(tile.biome) : 'ocean';
}

function chunkTerrain(chunk: Point): Terrain {
  const tile = generatedWorldTileFor(chunk);
  return tile ? terrainForWorldBiome(tile.biome) : 'ocean';
}

type SettlementKind = 'village' | 'town' | 'dungeon' | 'ruin';
type MapTile = {
  x: number;
  y: number;
  terrain: Terrain;
  worldBiome: GeneratedWorldTile['biome'];
  regionStyle: RegionStyle;
  waterFeature: 'river' | 'lake' | 'sea' | null;
  waterEdge: 'north' | 'south' | 'east' | 'west' | null;
  // Road piece, named by the compass arms that connect to neighboring road tiles.
  // 'ew'/'ns' straights, 'nsew' cross, 'sew'/'nsw'/'new'/'nse' T-junctions,
  // 'ne'/'nw'/'se'/'sw' corners, 'e'/'w'/'n'/'s' dead ends, 'none' no road.
  road: 'ew' | 'ns' | 'nsew' | 'sew' | 'nsw' | 'new' | 'nse' | 'ne' | 'nw' | 'se' | 'sw' | 'e' | 'w' | 'n' | 's' | 'none';
  bridge: boolean;
  landmark: { name: string; kind: SettlementKind } | null;
  elevationLevel: number;
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
  // Outer-region settlements (expanded world)
  '5,-5': { name: 'Frosthold', kind: 'village' },
  '4,19': { name: 'Dunewatch', kind: 'village' },
  '17,7': { name: 'Eastmarch', kind: 'town' },
  '-7,7': { name: 'Westhold', kind: 'village' },
  // Second continent settlements (far-eastern continent: x 117..196, y -28..51).
  // Coordinates validated against the real DEFAULT_WORLD_SEED (847291583);
  // every site is on verified inland land. See BUG-001.
  '130,-16': { name: 'Stormhaven', kind: 'town' },
  '140,-20': { name: 'Frostwatch', kind: 'village' },
  '155,0': { name: 'Oakfield', kind: 'village' },
  '174,-8': { name: 'Stonebridge', kind: 'village' },
  '165,25': { name: 'Saltmarsh', kind: 'village' },
  '184,15': { name: 'Emberhold', kind: 'town' },
  '144,35': { name: 'Dunmere', kind: 'village' },
  // Second-continent points of interest (enterable dungeon + ruins).
  // Coordinates validated against the real DEFAULT_WORLD_SEED (847291583);
  // every site is on verified inland land. See BUG-001.
  '136,-12': { name: 'Sunken Crypt', kind: 'dungeon' },
  '188,20': { name: 'Ember Ruins', kind: 'ruin' },
  '150,6': { name: 'Whispering Stones', kind: 'ruin' },
};

function isStartingArea(point: Point) {
  return point.x >= 3 && point.x <= 5 && point.y >= 6 && point.y <= 8;
}

function isTutorialCenter(point: Point) {
  return point.x === 4 && point.y === 7;
}

function worldRoadAt(x: number, y: number): boolean {
  const horizontalRoad =
    (y === 7 && x >= -1 && x <= 9) ||
    (y === 4 && x >= 2 && x <= 5) ||
    (y === 3 && x >= 5 && x <= 9) ||
    (y === 10 && x >= 4 && x <= 10) ||
    (y === 12 && x >= 3 && x <= 4);
  const verticalRoad =
    (x === 4 && y >= 4 && y <= 12) ||
    (x === 5 && y >= 2 && y <= 4) ||
    (x === 5 && y >= -5 && y <= 2) ||
    (x === 4 && y >= 12 && y <= 19);
  const outerHorizontalRoad =
    (y === 7 && x >= 9 && x <= 17) ||
    (y === 7 && x >= -7 && x <= 0);
  // Second-continent road web: L-shaped packed-dirt runs linking the far-east
  // settlements. Pieces are neighbor-aware, so junctions render cleanly.
  const continentRoad =
    (y === -16 && x >= 129 && x <= 140) || // Stormhaven -> Frostwatch junction
    (x === 140 && y >= -20 && y <= -16) ||
    (x === 140 && y >= -20 && y <= 0) || // Frostwatch -> Oakfield
    (y === 0 && x >= 140 && x <= 165) || // Oakfield west road / Stonebridge leg
    (x === 165 && y >= -8 && y <= 0) ||
    (y === -8 && x >= 165 && x <= 174) || // -> Stonebridge
    (x === 160 && y >= 0 && y <= 25) || // Oakfield -> Saltmarsh
    (y === 25 && x >= 160 && x <= 184) ||
    (x === 184 && y >= 15 && y <= 25) || // Saltmarsh -> Emberhold
    (x === 150 && y >= 0 && y <= 35) || // Oakfield -> Dunmere
    (y === 35 && x >= 144 && x <= 150);
  return horizontalRoad || verticalRoad || outerHorizontalRoad || continentRoad;
}

function mapTileFor(point: Point): MapTile {
  const worldTile = generatedWorldTileFor(point);
  const biome = worldTile?.biome || 'ocean';
  const regionStyle = regionStyleForWorldBiome(biome);
  const isOcean = biome === 'ocean';
  const terrain = terrainForWorldBiome(biome);
  const waterFeature = isOcean ? 'sea' : null;
  const waterEdge = null;

  // Roads stay continuous: water tiles become bridges, and Mosslight Crossing is a full crossroads.
  // No redundant forks: the north loop (Emberpeak/Northwatch/Old Mill) and the south road
  // (Bellwater/Seabreak) already reach the main road through Mosslight Crossing, so there are
  // no mid-road T-junctions at (6,7) or (9,7) — the main east-west road runs straight through.
  // Each road tile renders only the arms that connect to neighboring road tiles, so
  // T-junctions and corners never draw phantom arms "to nowhere".
  // (The piece is only computed for tiles that are actually on the road —
  // neighbors of a road must not get phantom stubs pointing at it.)
  const onRoad = worldRoadAt(point.x, point.y);
  const piece = onRoad
    ? (worldRoadAt(point.x, point.y - 1) ? 'n' : '') +
      (worldRoadAt(point.x, point.y + 1) ? 's' : '') +
      (worldRoadAt(point.x + 1, point.y) ? 'e' : '') +
      (worldRoadAt(point.x - 1, point.y) ? 'w' : '')
    : '';
  const road = (piece === '' ? 'none' : piece) as MapTile['road'];
  const bridge = isOcean && road !== 'none';

  return {
    ...point,
    terrain,
    worldBiome: biome,
    regionStyle,
    waterFeature,
    waterEdge,
    road,
    bridge,
    landmark: mapLandmarks[point.x + ',' + point.y] || null,
    elevationLevel: worldTile?.elevationLevel ?? 1,
  };
}

type FieldTree = { id: number; x: number; y: number; scale: number; variant: number; style: RegionStyle; sprite: EnvSpriteKey };

// Biome vegetation from the FreeEnvironment pack (public/environment/FreePack.png,
// 512x384). Boxes are the trimmed alpha bounds of each sprite: { x, y, w, h }.
type EnvSpriteKey = 'bigpine' | 'pine2' | 'pine3' | 'snowpine' | 'deadtree' | 'saguaro1' | 'saguaro2' | 'pear' | 'grass1' | 'grass2' | 'rock' | 'icerock' | 'coral1' | 'coral2' | 'coral3' | 'apple' | 'berries' | 'tomato' | 'corn';
const ENV_SPRITE_BOXES: Record<EnvSpriteKey, { x: number; y: number; w: number; h: number }> = {
  bigpine: { x: 7, y: 100, w: 96, h: 156 },
  pine2: { x: 105, y: 272, w: 47, h: 112 },
  pine3: { x: 202, y: 272, w: 47, h: 112 },
  snowpine: { x: 5, y: 273, w: 56, h: 111 },
  deadtree: { x: 294, y: 276, w: 59, h: 108 },
  saguaro1: { x: 15, y: 11, w: 39, h: 117 },
  saguaro2: { x: 78, y: 20, w: 32, h: 108 },
  pear: { x: 290, y: 66, w: 65, h: 62 },
  grass1: { x: 110, y: 25, w: 75, h: 103 },
  grass2: { x: 190, y: 52, w: 85, h: 76 },
  rock: { x: 400, y: 171, w: 100, h: 69 },
  icerock: { x: 390, y: 271, w: 110, h: 102 },
  coral1: { x: 135, y: 199, w: 65, h: 36 },
  coral2: { x: 197, y: 211, w: 56, h: 24 },
  coral3: { x: 250, y: 216, w: 62, h: 19 },
  apple: { x: 421, y: 68, w: 19, h: 25 },
  berries: { x: 457, y: 72, w: 14, h: 18 },
  tomato: { x: 423, y: 104, w: 17, h: 19 },
  corn: { x: 458, y: 101, w: 12, h: 22 },
};

function envSpriteForTerrain(terrain: Terrain, variant: number): EnvSpriteKey {
  // variant is 0-3 from the chunk's deterministic seed; each terrain maps it
  // to a fixed sprite so placement stays deterministic and order-independent.
  switch (terrain) {
    case 'forest': return (['bigpine', 'pine2', 'pine3', 'apple'] as EnvSpriteKey[])[variant] || 'bigpine';
    case 'tundra': return (['snowpine', 'icerock', 'deadtree', 'berries'] as EnvSpriteKey[])[variant] || 'snowpine';
    case 'rock': return (['rock', 'deadtree', 'rock', 'icerock'] as EnvSpriteKey[])[variant] || 'rock';
    case 'desert': return (['saguaro1', 'saguaro2', 'pear', 'tomato'] as EnvSpriteKey[])[variant] || 'saguaro1';
    case 'shore': return (['grass1', 'coral1', 'coral2', 'coral3'] as EnvSpriteKey[])[variant] || 'grass1';
    default: return (['grass1', 'grass2', 'pine2', 'pear'] as EnvSpriteKey[])[variant] || 'grass1';
  }
}
type FieldRect = { left: number; top: number; right: number; bottom: number };

function fieldHouseRects(kind: SettlementKind, startingArea = false, variantSeed = 0): FieldRect[] {
  // Rect specs below are authored in 0..100 space; scale to field units so
  // houses keep their relative size and spread on larger fields.
  const k = FIELD_SIZE / 100;
  const toField = (r: FieldRect): FieldRect => ({ left: r.left * k, top: r.top * k, right: r.right * k, bottom: r.bottom * k });
  // Starting-area buildings render larger than their authored specs: grow each
  // rect around its center so doors/collision/visuals stay aligned. Other
  // areas keep authored sizes.
  const grow = (r: FieldRect): FieldRect => {
    if (!startingArea) return r;
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const hw = ((r.right - r.left) / 2) * BUILDING_SIZE_MULT, hh = ((r.bottom - r.top) / 2) * BUILDING_SIZE_MULT;
    return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
  };
  const toBuilding = (r: FieldRect): FieldRect => grow(toField(r));
  // Points of interest don't get houses: a dungeon gets one crypt mound, a ruin
  // gets scattered broken walls. Collision + doorway logic reuse these rects.
  if (kind === 'dungeon') return [toBuilding({ left: 38, top: 34, right: 62, bottom: 54 })];
  if (kind === 'ruin') return [
    toBuilding({ left: 28, top: 28, right: 43, bottom: 37 }),
    toBuilding({ left: 57, top: 42, right: 70, bottom: 51 }),
    toBuilding({ left: 39, top: 62, right: 58, bottom: 70 }),
  ];
  const parent = kind === 'town'
    ? { left: 19, top: 21, width: 62, height: 58 }
    : { left: 23, top: 24, width: 54, height: 52 };
  // Unique layouts per town: variant cycles 0-3 based on location seed.
  // 0 = four corners (Mosslight Crossing), 1 = main street row,
  // 2 = courtyard cluster, 3 = scattered hamlet.
  const variant = startingArea ? 0 : (Math.abs(variantSeed) % 3) + 1;
  let specs: { left: number; top: number; width: number; height: number; scale: number }[];
  if (variant === 1) {
    // Main street: houses line the road.
    specs = [
      { left: 8, top: 30, width: 19, height: 13, scale: 1 },
      { left: 8, top: 55, width: 19, height: 13, scale: 0.9 },
      { left: 73, top: 30, width: 19, height: 13, scale: 0.9 },
      { left: 73, top: 55, width: 19, height: 13, scale: 1 },
    ];
  } else if (variant === 2) {
    // Courtyard cluster: houses around a central green.
    specs = [
      { left: 30, top: 8, width: 19, height: 13, scale: 1 },
      { left: 55, top: 15, width: 19, height: 13, scale: 0.85 },
      { left: 25, top: 70, width: 19, height: 13, scale: 0.85 },
      { left: 55, top: 68, width: 19, height: 13, scale: 1 },
    ];
  } else if (variant === 3) {
    // Scattered hamlet: irregular placement.
    specs = [
      { left: 12, top: 20, width: 19, height: 13, scale: 0.9 },
      { left: 65, top: 12, width: 19, height: 13, scale: 1 },
      { left: 20, top: 65, width: 19, height: 13, scale: 1 },
      { left: 68, top: 70, width: 19, height: 13, scale: 0.8 },
    ];
  } else {
    // Four corners (starting area default).
    specs = [
      { left: 8, top: 11, width: 19, height: 13, scale: 1 },
      { left: 73, top: 12, width: 19, height: 13, scale: 1 },
      { left: 8, top: 75, width: 19, height: 13, scale: 1 },
      { left: 73, top: 75, width: 19, height: 13, scale: 1 },
    ];
  }

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
    return toBuilding({
      left: parent.left + (left / 100) * parent.width,
      top: parent.top + (top / 100) * parent.height,
      right: parent.left + ((left + width) / 100) * parent.width,
      bottom: parent.top + ((top + height) / 100) * parent.height,
    });
  });
}

function pointInRect(point: Point, rect: FieldRect, padding = 0) {
  return point.x >= rect.left - padding && point.x <= rect.right + padding && point.y >= rect.top - padding && point.y <= rect.bottom + padding;
}

// Farms and homesteads in non-settlement chunks: deterministic per-chunk.
// Returns house rects + crop field rects for rural flavor.
function fieldFarmRects(chunkX: number, chunkY: number): { houses: FieldRect[]; fields: FieldRect[] } {
  const seed = Math.abs(chunkX * 73856093 ^ chunkY * 19349663) >>> 0;
  const rng = () => {
    const x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  };
  // Only ~40% of non-settlement chunks get farms.
  if (rng() > 0.4) return { houses: [], fields: [] };
  
  const houses: FieldRect[] = [];
  const fields: FieldRect[] = [];
  const count = 1 + Math.floor(rng() * 2); // 1-2 farmsteads
  
  for (let i = 0; i < count; i++) {
    const bx = 20 + rng() * 60;
    const by = 20 + rng() * 60;
    // Farmhouse (smaller than town houses)
    houses.push({
      left: bx,
      top: by,
      right: bx + 12,
      bottom: by + 9,
    });
    // Crop field adjacent
    fields.push({
      left: bx - 15,
      top: by + 12,
      right: bx + 15,
      bottom: by + 25,
    });
  }
  const k = FIELD_SIZE / 100;
  const toField = (r: FieldRect): FieldRect => ({ left: r.left * k, top: r.top * k, right: r.right * k, bottom: r.bottom * k });
  const grow = (r: FieldRect): FieldRect => {
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const hw = ((r.right - r.left) / 2) * BUILDING_SIZE_MULT, hh = ((r.bottom - r.top) / 2) * BUILDING_SIZE_MULT;
    return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
  };
  return { houses: houses.map((r) => grow(toField(r))), fields: fields.map(toField) };
}

// Points of Interest: ruins, caves, camps, shrines scattered in the wilderness.
// Deterministic per-chunk, ~25% of non-settlement chunks get a POI.
type POIKind = 'ruin' | 'cave' | 'camp' | 'shrine';
type PointOfInterest = { kind: POIKind; x: number; y: number; name: string };

function poisForChunk(chunkX: number, chunkY: number): PointOfInterest[] {
  const seed = Math.abs(chunkX * 83492791 ^ chunkY * 2971215073) >>> 0;
  const rng = () => {
    const x = Math.sin(seed + 7) * 10000;
    return x - Math.floor(x);
  };
  // Only ~25% of chunks get a POI
  if (rng() > 0.25) return [];
  
  const kinds: POIKind[] = ['ruin', 'cave', 'camp', 'shrine'];
  const kind = kinds[Math.floor(rng() * kinds.length)];
  const x = 25 + rng() * 50;
  const y = 25 + rng() * 50;
  
  const names: Record<POIKind, string[]> = {
    ruin: ['Ancient Ruins', 'Forgotten Stones', 'Old Watchtower'],
    cave: ['Dark Cave', 'Goblin Den', 'Echo Cavern'],
    camp: ['Bandit Camp', 'Abandoned Camp', 'Hunter\'s Camp'],
    shrine: ['Old Shrine', 'Forest Altar', 'Stone Circle'],
  };
  const nameList = names[kind];
  const name = nameList[Math.floor(rng() * nameList.length)];
  
  return [{ kind, x, y, name }];
}

function pointInWater(position: Point, tile: MapTile) {
  if (tile.waterFeature === 'sea') return true;
  if (!tile.waterFeature || tile.bridge) return false;
  if (tile.waterEdge === 'east') return position.x >= 75;
  if (tile.waterEdge === 'west') return position.x <= 25;
  if (tile.waterEdge === 'north') return position.y <= 25;
  if (tile.waterEdge === 'south') return position.y >= 75;
  return false;
}

function pointOnFieldRoad(point: Point, road: MapTile['road']) {
  // Keep tree canopies and trunks off the road arms, not just the center lines.
  if (road === 'none') return false;
  const onHorizontalCorridor = point.y >= 44 && point.y <= 59;
  const onVerticalCorridor = point.x >= 44 && point.x <= 59;
  const onWestArm = road.includes('w') && point.x < 54 && onHorizontalCorridor;
  const onEastArm = road.includes('e') && point.x >= 46 && onHorizontalCorridor;
  const onNorthArm = road.includes('n') && point.y < 54 && onVerticalCorridor;
  const onSouthArm = road.includes('s') && point.y >= 46 && onVerticalCorridor;
  return onWestArm || onEastArm || onNorthArm || onSouthArm;
}

function fieldTreesFor(chunk: Point): FieldTree[] {
  const startingCenter = isTutorialCenter(chunk);
  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
  const treeStyle = regionStyleFor(chunk);
  const road = mapTileFor(chunk).road;

  if (startingCenter) {
    // Keep trees fully inside the field so sprites aren't clipped at edges.
    // Anchors sit clear of the four corner houses (x 24-36 / 64-76,
    // y 27-36 / 64-72) and clear of the road corridors (x/y 44-59).
    const perimeterTrees = [
      { x: 20, y: 22, scale: 0.56, variant: 1 },
      { x: 70, y: 22, scale: 0.56, variant: 2 },
      { x: 18, y: 68, scale: 0.56, variant: 2 },
      { x: 86, y: 64, scale: 0.56, variant: 1 },
    ];
    return perimeterTrees.map((tree, id) => ({ ...tree, id, style: treeStyle, sprite: (tree.variant === 1 ? 'bigpine' : 'pine2') as EnvSpriteKey }));
  }

  let seed = Math.abs((chunk.x * 92837111) + (chunk.y * 689287499)) + 1;
  const random = () => {
    const value = Math.sin(seed++) * 10000;
    return value - Math.floor(value);
  };
  const houseRects = landmark ? fieldHouseRects(landmark.kind, isStartingArea(chunk), chunk.x * 31 + chunk.y * 17) : [];
  // Farms/homesteads in non-settlement chunks (only on farmable terrain)
  const farmable = ['meadow', 'grassland', 'greenvale'].includes(mapTileFor(chunk).terrain);
  const farmData = (!landmark && farmable) ? fieldFarmRects(chunk.x, chunk.y) : { houses: [], fields: [] };
  const allHouseRects = [...houseRects, ...farmData.houses];
  const trees: FieldTree[] = [];
  const targetCount = 8 + Math.floor(random() * 5);
  let attempts = 0;

  while (trees.length < targetCount && attempts < targetCount * 24) {
    attempts += 1;
    const x = 14 + random() * (FIELD_SIZE - 28);
    const y = 13 + random() * (FIELD_SIZE - 26);
    // Minecraft-style: use Perlin noise for natural clustering (trees grow in patches)
    const worldX = chunk.x * FIELD_SIZE + x;
    const worldY = chunk.y * 100 + y;
    if (!shouldPlaceVegetation(worldX, worldY, 0.42)) continue;
    const scale = 0.72 + random() * 0.48;
    // Vary scale by noise for natural size variation
    const density = vegetationDensity(worldX, worldY);
    const naturalScale = scale * (0.8 + density * 0.4);
    const center = { x: x + 3.2 * naturalScale, y: y + 2.5 * naturalScale };
    const tooCloseToStart = Math.hypot(center.x - 50, center.y - 52) < 12;
    const tooCloseToBuilding = allHouseRects.some((rect) => pointInRect(center, rect, 5));
    const tooCloseToTree = trees.some((tree) => Math.hypot(center.x - (tree.x + 3.2 * tree.scale), center.y - (tree.y + 2.5 * tree.scale)) < 9);
    const tooCloseToRoad = pointOnFieldRoad(center, road);
    if (tooCloseToStart || tooCloseToBuilding || tooCloseToTree || tooCloseToRoad) continue;
    const variant = Math.floor(random() * 4);
    const sprite = envSpriteForTerrain(mapTileFor(chunk).terrain, variant);
    // Grass tufts removed (dense blades render as solid green bars) — uncomment to re-enable.
    if (sprite === 'grass1' || sprite === 'grass2') continue;
    const finalScale = naturalScale;
    trees.push({ id: trees.length, x, y, scale: finalScale, variant, style: treeStyle, sprite });
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
  const houseRects = landmark ? fieldHouseRects(landmark.kind, isStartingArea(chunk), chunk.x * 31 + chunk.y * 17) : [];
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
    const x = 8 + random() * (FIELD_SIZE - 16);
    const y = 9 + random() * (FIELD_SIZE - 18);
    // Minecraft-style: use noise for natural patchy distribution
    const worldX = chunk.x * FIELD_SIZE + x;
    const worldY = chunk.y * FIELD_SIZE + y;
    if (!shouldPlaceVegetation(worldX, worldY, 0.35)) continue;
    const tooCloseToBuilding = houseRects.some((rect) => pointInRect({ x, y }, rect, 4));
    const tooCloseToTownCenter = startingCenter && Math.hypot(x - FIELD_SIZE / 2, y - FIELD_SIZE / 2) < 15;
    const tooCloseToRoad = pointOnFieldRoad({ x, y }, tile.road);
    const tooCloseToAccent = accents.some((accent) => Math.hypot(x - accent.x, y - accent.y) < 6);
    if (tooCloseToBuilding || tooCloseToTownCenter || tooCloseToRoad || tooCloseToAccent) continue;

    const kind: FieldAccentKind = tile.terrain === 'rock'
      ? 'stone'
      : tile.terrain === 'desert'
        ? (random() > 0.42 ? 'stone' : 'grass')
        : tile.terrain === 'forest'
          ? (random() > 0.5 ? 'leaf' : 'grass')
          : tile.terrain === 'tundra'
            ? 'stone'
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

function fieldTreeBaseRect(tree: FieldTree): FieldRect {
  // The visible tree is a canopy with a narrow trunk. Only its lower base is
  // solid, so the player can pass beside the canopy without hitting an unseen wall.
  const centerX = tree.x + 3.2 * tree.scale;
  const baseY = tree.y + 4 * tree.scale;
  return {
    left: centerX - 2.1 * tree.scale,
    top: baseY - 1.1 * tree.scale,
    right: centerX + 2.1 * tree.scale,
    bottom: baseY + 1.7 * tree.scale,
  };
}

function isFieldPositionBlocked(position: Point, chunk: Point) {
  const tile = mapTileFor(chunk);
  if (pointInWater(position, tile)) return true;

  const treeBlocked = fieldTreesFor(chunk).some((tree) => pointInRect(position, fieldTreeBaseRect(tree), 0.45));
  if (treeBlocked) return true;

  const landmark = tile.landmark;
  // Keep the visible building/base solid, but do not extend its collision far
  // into the surrounding grass where it reads as a random invisible wall.
  if (landmark && fieldHouseRects(landmark.kind, isStartingArea(chunk), Math.round(chunk.x) * 31 + Math.round(chunk.y) * 17).some((rect) => pointInRect(position, rect, 0.35))) return true;

  // Farmhouses are solid enterable buildings too.
  if (!landmark && ['meadow', 'grassland', 'greenvale'].includes(tile.terrain)) {
    if (fieldFarmRects(chunk.x, chunk.y).houses.some((rect) => pointInRect(position, rect, 0.35))) return true;
  }

  // Mosslight Crossing fountain: solid stone circle at the plaza center.
  if (landmark?.name === 'Mosslight Crossing') {
    const fountainRect = { left: 47.5, top: 48.5, right: 52.5, bottom: 51.5 };
    if (pointInRect(position, fountainRect, 0.3)) return true;
  }

  return false;
}

function wrapFieldPosition(position: Point, chunk: Point) {
  const nextPosition = { ...position };
  const nextChunk = { ...chunk };
  const travelLabels: string[] = [];
  if (nextPosition.x < 4) { nextPosition.x = FIELD_SIZE - 6; nextChunk.x -= 1; travelLabels.push('west'); }
  if (nextPosition.x > FIELD_SIZE - 4) { nextPosition.x = 6; nextChunk.x += 1; travelLabels.push('east'); }
  if (nextPosition.y < 4) { nextPosition.y = FIELD_SIZE - 6; nextChunk.y -= 1; travelLabels.push('north'); }
  if (nextPosition.y > FIELD_SIZE - 4) { nextPosition.y = 6; nextChunk.y += 1; travelLabels.push('south'); }
  if (travelLabels.length > 0 && (!generatedWorldTileFor(nextChunk) || generatedWorldTileFor(nextChunk)?.biome === 'ocean')) return null;
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
    if (wrapped && !isFieldPositionBlocked(wrapped.position, wrapped.chunk) && !isPositionOccupiedByGoat(wrapped.position, goats)) return wrapped;
  }
  return null;
}

type InteriorArea = { id: string; name: string; description: string; roomType: 'guild' | 'inn' | 'chapel' | 'building' | 'prison'; exteriorPosition: Point };
type PrisonState = {
  foundShiv: boolean;
  talkedToPrisoner: boolean;
  helpedPrisoner: boolean;
  escapeRoute: 'sewer' | 'gate' | null;
};
type JournalState = {
  discoveredLocations: Array<{ name: string; kind: string; chunk: Point; discoveredAt: string }>;
  activeQuests: Array<{ id: string; title: string; description: string; progress: string }>;
  completedQuests: Array<{ id: string; title: string; completedAt: string }>;
  rumors: Array<{ text: string; source: string; heardAt: string }>;
  notes: Array<{ text: string; writtenAt: string }>;
};
type ReputationState = {
  mosslight: number;
  guards: number;
  merchants: number;
  wilderness: number;
};
type EscapeSpawn = {
  chunk: Point;
  position: Point;
  logs: Array<{ text: string; color: string }>;
};
type Doorway = { id: string; position: Point; area: InteriorArea; buildingIndex?: number };
// Bram the smith works the Wayfarer Guild in the starting area. Talking to
// him opens the crafting / sell / rumours flow.
const GUILD_SMITH: TownNpc = {
  name: 'Bram',
  title: 'Guild smith',
  role: 'warrior',
  position: { x: 62, y: 42 },
  facing: 'down',
  moving: false,
  target: null,
  smith: true,
};
// What Bram pays for monster drops (gold per item).
const SMITH_SELL_PRICES: { key: 'bone' | 'pelt' | 'fang' | 'goatHorns' | 'fabric'; name: string; price: number }[] = [
  { key: 'bone', name: 'Bone', price: 2 },
  { key: 'pelt', name: 'Pelt', price: 3 },
  { key: 'fang', name: 'Fang', price: 4 },
  { key: 'goatHorns', name: 'Goat horn', price: 5 },
  { key: 'fabric', name: 'Fabric', price: 2 },
];
const WORLD_RUMORS = [
  'I heard there are strange ruins to the north.',
  'A traveler said the caves east of here are dangerous.',
  'They say a dragon was spotted far to the south.',
  'The merchants are talking about bandits on the roads.',
  'Someone found an old shrine in the forest.',
];

function buildingDoorwaysFor(chunk: Point): Doorway[] {
  // Use the same landmark source as the visual renderer (mapTileFor) so door
  // triggers always align with the visible buildings.
  const landmark = mapTileFor(chunk).landmark;
  // Points of interest have no house doors (the dungeon gets its own entrance).
  if (landmark && (landmark.kind === 'dungeon' || landmark.kind === 'ruin')) return [];
  if (landmark) {
    // All doorway positions are computed fresh from the building rects every
    // call — no hardcoded positions, so triggers can never drift from visuals.
    return fieldHouseRects(landmark.kind, isStartingArea(chunk), Math.round(chunk.x) * 31 + Math.round(chunk.y) * 17).map((rect, index) => {
      const position = fieldDoorPosition(rect);
      // Stable IDs for the starting-area buildings so save games and the
      // starting interior keep working; positions are always computed.
      const stableId = isStartingArea(chunk) && index === 0 ? 'tutorial-house-door'
        : isStartingArea(chunk) && index === 1 ? 'crafting-guild-door'
        : isStartingArea(chunk) && index === 2 ? 'chapel-door'
        : chunk.x + ',' + chunk.y + '-building-' + index;
      const stableAreaId = isStartingArea(chunk) && index === 0 ? 'tutorial-house'
        : isStartingArea(chunk) && index === 1 ? 'wayfarer-guild'
        : isStartingArea(chunk) && index === 2 ? 'rootbound-chapel'
        : chunk.x + '-' + chunk.y + '-building-' + index;
      const stableName = isStartingArea(chunk) && index === 0 ? 'Tutorial House'
        : isStartingArea(chunk) && index === 1 ? 'Wayfarer Guild'
        : isStartingArea(chunk) && index === 2 ? 'Rootbound Chapel'
        : landmark.name + ' House ' + (index + 1);
      return {
        id: stableId,
        position,
        area: {
          id: stableAreaId,
          name: stableName,
          description: isStartingArea(chunk) && index === 0 ? 'A small safe house on the tutorial island.'
            : isStartingArea(chunk) && index === 1 ? 'A workbench, maps, and road-worn notices fill the guild hall.'
            : isStartingArea(chunk) && index === 2 ? 'Lanterns glow beneath old roots in the quiet town chapel.'
            : 'A simple brown room waiting to be furnished.',
          roomType: (isStartingArea(chunk) && index === 0 ? 'inn' : isStartingArea(chunk) && index === 1 ? 'guild' : isStartingArea(chunk) && index === 2 ? 'chapel' : 'building') as const,
          exteriorPosition: doorwayExteriorPosition(rect, position),
        },
      };
    });
  }
  // Farmhouses in non-settlement chunks are enterable too.
  if (!['meadow', 'grassland', 'greenvale'].includes(mapTileFor(chunk).terrain)) return [];
  return fieldFarmRects(chunk.x, chunk.y).houses.map((rect, index) => {
    const position = fieldDoorPosition(rect);
    return {
      id: chunk.x + ',' + chunk.y + '-farm-' + index,
      position,
      area: {
        id: chunk.x + '-' + chunk.y + '-farm-' + index,
        name: 'Farmhouse',
        description: 'A cozy farmhouse smelling of hay and baked bread.',
        roomType: 'building' as const,
        exteriorPosition: { x: position.x, y: Math.min(FIELD_SIZE - 6, position.y + 4) },
      },
    };
  });
}

function doorwayExteriorPosition(rect: FieldRect, doorway: Point): Point {
  // Spawn beyond the house's collision padding so the first frame outside is safe.
  return { x: doorway.x, y: Math.min(FIELD_SIZE - 6, Math.max(doorway.y + 4, rect.bottom + 4.5)) };
}

const STARTING_DOORWAY_ID = 'tutorial-house-door';
const startingHouse = buildingDoorwaysFor({ x: 4, y: 7 }).find((doorway) => doorway.id === STARTING_DOORWAY_ID)?.area || {
  id: 'tutorial-house',
  name: 'Tutorial House',
  description: 'A small safe house on the tutorial island.',
  roomType: 'inn' as const,
  exteriorPosition: { x: 41.96, y: 54.57 },
};
// Playtest tooling (?playtestInterior=<area-id>): start inside a named interior
// (e.g. wayfarer-guild) so visual checks don't require walking there.
// Param-gated; no effect on normal play.
const playtestInteriorArea: InteriorArea | null = (() => {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('playtestInterior');
  if (!id) return null;
  const found = buildingDoorwaysFor({ x: 4, y: 7 }).find((doorway) => doorway.area.id === id);
  return found ? found.area : null;
})();
// Playtest tooling (?playtestMount=1): start in the field already mounted on the
// horse, so mounted-sprite sizing can be checked without walking to the horse.
// Param-gated; no effect on normal play.
const playtestMounted: boolean = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('playtestMount') === '1';
// Playtest tooling (?playtestChunk=x,y): start in a given chunk's field (e.g.
// ?playtestChunk=136,-12 for the Sunken Crypt POI). Param-gated.
const playtestChunk: Point | null = (() => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('playtestChunk');
  if (!raw) return null;
  const [x, y] = raw.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
})();
// Debug visualization (?debugDoors=1): draw RED=building collision, BLUE=door
// interaction, GREEN=exit spawn over the field so door/logic alignment is visible.
const debugDoors: boolean = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugDoors') === '1';

function fieldDoorPosition(rect: FieldRect): Point {
  // Match .field-house::after: left 43%, width 16%, bottom 0, height 44%.
  return {
    x: rect.left + (rect.right - rect.left) * 0.51,
    y: rect.top + (rect.bottom - rect.top) * 0.78,
  };
}

function doorwayNear(position: Point, chunk: Point) {
  return buildingDoorwaysFor(chunk).find((doorway) => Math.hypot(position.x - doorway.position.x, position.y - doorway.position.y) <= 6.0) || null;
}

function canEnterDoorway(currentPosition: Point, nextPosition: Point, doorway: Doorway, direction: Direction) {
  return direction === 'up'
    && currentPosition.y > doorway.position.y
    && nextPosition.y <= doorway.position.y + 6.0
    && Math.abs(nextPosition.x - doorway.position.x) <= 6.0;
}

type InteriorCollisionRect = FieldRect;

// These rectangles are in the interior scene's 0-100 coordinate space. They include
// a little visual padding so the player cannot overlap the furniture sprites.
const interiorFurnitureCollision: Record<InteriorArea['roomType'], InteriorCollisionRect[]> = {
  guild: [
    { left: 36, top: 52, right: 64, bottom: 65 }, // workbench
    { left: 14, top: 30, right: 30, bottom: 52 }, // forge
    { left: 74, top: 30, right: 86, bottom: 56 }, // weapon rack
    { left: 38, top: 12, right: 62, bottom: 26 }, // quest board (wall, low)
  ],
  inn: [
    { left: 13, top: 32, right: 31, bottom: 52 }, // bed left
    { left: 69, top: 32, right: 87, bottom: 52 }, // bed right
    { left: 39, top: 57, right: 62, bottom: 68 }, // table
    { left: 42, top: 28, right: 58, bottom: 52 }, // fireplace
    { left: 20, top: 62, right: 80, bottom: 71 }, // bar
  ],
  chapel: [
    { left: 40, top: 26, right: 60, bottom: 42 }, // altar
    { left: 12, top: 52, right: 42, bottom: 60 }, // pew left
    { left: 58, top: 52, right: 88, bottom: 60 }, // pew right
  ],
  building: [
    { left: 39, top: 57, right: 62, bottom: 68 }, // table
    { left: 42, top: 28, right: 58, bottom: 52 }, // fireplace
    { left: 17, top: 43, right: 30, bottom: 67 }, // shelf left
    { left: 70, top: 43, right: 83, bottom: 67 }, // shelf right
  ],
  prison: [
    { left: 12, top: 30, right: 32, bottom: 50 }, // straw bed
    { left: 68, top: 60, right: 88, bottom: 80 }, // sewer grate (interactable, not blocking)
    { left: 40, top: 8, right: 60, bottom: 20 }, // cell bars (wall)
  ],
};

function isInteriorPositionBlocked(position: Point, area: InteriorArea) {
  return (interiorFurnitureCollision[area.roomType] || []).some((rect) => pointInRect(position, rect));
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
type GameInventory = { coins: number; goatHorns: number; fabric: number; daggers: number; cloths: number; bone: number; pelt: number; fang: number; corn: number };
type GoatLoot = Partial<GameInventory>;
type DroppedLoot = { id: number; chunk: Point; position: Point; loot: GoatLoot };
type GoatState = {
  id: number;
  position: Point;
  spawnPosition: Point;
  roamRadius: number;
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
// Hostile mobs: goblins and bandits. Reuse the goat combat AI shape.
type MonsterKind = 'goblin' | 'bandit' | 'skeleton' | 'troll' | 'snake' | 'spider' | 'dragon' | 'orc' | 'soldier';
type MonsterState = GoatState & { kind: MonsterKind };
const GOAT_STEP = 0.5;
// Ambient birds: lightweight wildlife, deterministic per chunk, not persisted.
type BirdStateName = 'idle' | 'hop' | 'peck' | 'fly';
type BirdState = {
  id: number;
  position: Point;
  homePosition: Point;
  state: BirdStateName;
  stateTimer: number;
  target: Point;
  variant: number;
  facing: Direction;
  fleeing: boolean; // true while fleeing the player off screen
};
// Living-world wildlife: biome + danger-zone based spawning.
type WildlifeSpecies = 'rabbit' | 'deer' | 'wolf' | 'boar' | 'bear';
type WildlifeState = {
  id: number;
  species: WildlifeSpecies;
  position: Point;
  homePosition: Point;
  facing: Direction;
  moving: boolean;
  wanderSeed: number;
  nextWanderTick: number;
  target: Point | null;
};
const BIRD_STEP = 1.2;
const BIRD_FLY_STEP = 3.5;
const BIRD_FLEE_RADIUS = 14; // player closeness that startles a bird into flight
const GOAT_TICK_MS = 500;
const GOAT_WANDER_MIN_TICKS = 10;
const GOAT_WANDER_MAX_TICKS = 20;
const PLAYER_ATTACK_ANIMATION_MS = 650;
const GOAT_RESPAWN_TICKS = Math.ceil(12000 / GOAT_TICK_MS);
const GOAT_SPAWN_DISPOSITION: GoatDisposition = 'calm';
const GOAT_ATTACK_RANGE = 15;
const GOAT_CLOSE_ATTACK_RANGE = 8;
const GOAT_ATTACK_DAMAGE = 9;
const PLAYER_ATTACK_COOLDOWN_MS = 800;
const GOAT_ATTACK_COOLDOWN_MS = 1000;
const GOAT_XP_REWARD = 25;
const GOAT_MIN_XP_REWARD = 5;
const GOAT_HP_PER_LEVEL = 12;
const GOAT_DAMAGE_PER_LEVEL = 3;
const PLAYER_MAX_HP = 88;
const PLAYER_BASE_ATTACK_DAMAGE = 5;
const PLAYER_STAT_POINTS_PER_LEVEL = 5;
const GOAT_LOOT_TYPES: Array<keyof GameInventory> = ['goatHorns', 'fabric', 'coins'];
const initialInventory: GameInventory = { coins: 0, goatHorns: 0, fabric: 0, daggers: 0, cloths: 0, bone: 0, pelt: 0, fang: 0, corn: 0 };

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
  characterChoices?: CharacterChoices | null;
  npcStates: TownNpc[];
  simulatedAdventurers: SimulatedAdventurer[];
  goats: GoatState[];
  interiorId: string | null;
  interiorPosition: Point;
  inPrison?: boolean;
  prisonState?: { foundShiv: boolean; talkedToPrisoner: boolean; helpedPrisoner: boolean; escapeRoute: 'sewer' | 'gate' | null };
  journal?: JournalState;
  reputation?: ReputationState;
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
const saveAdventurerClasses = ['Ranger', 'Mage', 'Rogue', 'Warrior'];

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
    && isFiniteNumber(value.cloths)
    && (value.bone == null || isFiniteNumber(value.bone))
    && (value.pelt == null || isFiniteNumber(value.pelt))
    && (value.fang == null || isFiniteNumber(value.fang))
    && (value.corn == null || isFiniteNumber(value.corn));
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
    && isFiniteNumber(value.routeIndex)
    && (value.status === undefined || value.status === 'healthy' || value.status === 'injured' || value.status === 'resting')
    && (value.reputation === undefined || isFiniteNumber(value.reputation));
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
    && (value.inPrison === undefined || typeof value.inPrison === 'boolean')
    && (value.prisonState === undefined || (isRecord(value.prisonState) && typeof value.prisonState.foundShiv === 'boolean' && typeof value.prisonState.talkedToPrisoner === 'boolean' && typeof value.prisonState.helpedPrisoner === 'boolean' && (value.prisonState.escapeRoute === null || value.prisonState.escapeRoute === 'sewer' || value.prisonState.escapeRoute === 'gate')))
    && (value.journal === undefined || isRecord(value.journal))
    && (value.reputation === undefined || isRecord(value.reputation))
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
  return 32 + Math.max(0, level - 1) * GOAT_HP_PER_LEVEL;
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
  // Starting town is a safe zone: no goats wandering through Mosslight Crossing.
  // Goats roam meadows and outskirts (danger 1+), RuneScape-style.
  if (isTutorialCenter(chunk)) return [];
  const positions = Array.from({ length: mapTileFor(chunk).terrain === 'meadow' ? 4 : 2 }, (_, index) => ({ x: 20 + ((Math.abs(chunk.x * 47 + chunk.y * 71 + index * 29) * 13) % (FIELD_SIZE - 40)), y: 20 + ((Math.abs(chunk.x * 31 + chunk.y * 53 + index * 41) * 17) % (FIELD_SIZE - 40)) }));
  const safePositions = positions.filter((position) => !isFieldPositionBlocked(position, chunk));
  return safePositions.map((position, index) => {
    const wanderSeed = Math.abs(chunk.x * 97 + chunk.y * 193 + index * 53 + 17);
    return {
      id: index,
      position,
      spawnPosition: { ...position },
      roamRadius: 16 + (wanderSeed % 9),
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
// Per-creature loot identity: each monster drops recognizable physical loot.
function monsterLootForKind(kind: MonsterKind): GoatLoot {
  switch (kind) {
    case 'goblin': return { coins: 1 + Math.floor(Math.random() * 3), fabric: Math.random() < 0.3 ? 1 : 0 };
    case 'bandit': return { coins: 3 + Math.floor(Math.random() * 5), fabric: Math.random() < 0.5 ? 1 : 0 };
    case 'skeleton': return { bone: 1 + Math.floor(Math.random() * 2), coins: Math.random() < 0.5 ? 1 : 0 };
    case 'troll': return { pelt: 1, coins: 2 + Math.floor(Math.random() * 4) };
    case 'snake': return { fang: 1, coins: Math.random() < 0.3 ? 1 : 0 };
    case 'spider': return { fang: 1 + Math.floor(Math.random() * 2) };
    case 'dragon': return { pelt: 2, fang: 2, coins: 10 + Math.floor(Math.random() * 10) };
    case 'orc': return { pelt: 1, coins: 2 + Math.floor(Math.random() * 4) };
    case 'soldier': return { coins: 3 + Math.floor(Math.random() * 4), fabric: Math.random() < 0.5 ? 1 : 0 };
  }
}
function monstersForChunk(chunk: Point, playerLevel = 1): MonsterState[] {  const terrain = mapTileFor(chunk).terrain;
  if (terrain === 'ocean') return [];
  const danger = dangerForChunk(chunk);
  const monsters: MonsterState[] = [];
  let id = 0;
  const spawn = (kind: MonsterKind, index: number, seedSalt: number, hpMult: number) => {
    const seed = Math.abs(chunk.x * 173 + chunk.y * 227 + index * 89 + seedSalt);
    const position = { x: 16 + ((seed * 43) % (FIELD_SIZE - 32)), y: 16 + ((seed * 61) % (FIELD_SIZE - 32)) };
    if (isFieldPositionBlocked(position, chunk)) return;
    const level = monsterLevelForChunk(chunk, index, playerLevel);
    const maxHp = Math.round(goatMaxHpForLevel(level) * hpMult);
    monsters.push({
      id: id++,
      kind,
      position,
      spawnPosition: { ...position },
      roamRadius: 20 + (seed % 8),
      facing: (['up', 'right', 'down', 'left'] as Direction[])[seed % 4],
      level,
      hp: maxHp,
      maxHp,
      disposition: 'aggressive',
      attackCooldown: 0,
      respawnTicks: 0,
      wanderSeed: seed,
      moving: false,
      attacking: false,
      state: 'idle',
      hurtTimer: 0,
      attackTimer: 0,
      attackHitApplied: false,
      hitFlash: false,
    });
  };
  // Goblins: forest packs in deep wilderness (danger 2+).
  if (terrain === 'forest' && danger >= 2) {
    const packSize = 2 + (Math.abs(chunk.x * 7 + chunk.y * 13) % 2);
    for (let i = 0; i < packSize; i++) spawn('goblin', i, 5000, 0.8);
  }
  // Bandits: near roads in outskirts and beyond (danger 1+).
  if (danger >= 1 && mapTileFor(chunk).road !== 'none') {
    const count = 1 + (Math.abs(chunk.x * 11 + chunk.y * 17) % 2);
    for (let i = 0; i < count; i++) spawn('bandit', i, 6000, 1.2);
  }
  // Skeletons: undead in rocky ruins and deep wilderness (danger 2+).
  if ((terrain === 'rock' || terrain === 'desert') && danger >= 2) {
    const count = 1 + (Math.abs(chunk.x * 13 + chunk.y * 19) % 2);
    for (let i = 0; i < count; i++) spawn('skeleton', i, 7000, 1.0);
  }
  // Spiders: dark forests (danger 2+).
  if (terrain === 'forest' && danger >= 2 && Math.abs(chunk.x * 5 + chunk.y * 23) % 2 === 0) {
    spawn('spider', 0, 8000, 0.7);
  }
  // Snakes: deserts and meadows (danger 1+).
  if ((terrain === 'desert' || terrain === 'meadow') && danger >= 1) {
    spawn('snake', 0, 9000, 0.5);
  }
  // Trolls: remote wilderness only (danger 3). Slow, huge, brutal.
  if (danger >= 3 && (terrain === 'forest' || terrain === 'rock' || terrain === 'tundra')) {
    spawn('troll', 0, 10000, 2.5);
  }
  // Dragons: extremely remote territories (danger 3), rare. Endgame.
  if (danger >= 3 && terrain !== 'ocean' && Math.abs(chunk.x * 29 + chunk.y * 31) % 4 === 0) {
    spawn('dragon', 0, 11000, 5);
  }
  // Orcs: brutes roaming the deep wilderness (danger 2+).
  if (danger >= 2 && (terrain === 'forest' || terrain === 'rock' || terrain === 'tundra' || terrain === 'meadow')) {
    const count = 1 + (Math.abs(chunk.x * 17 + chunk.y * 23) % 2);
    for (let i = 0; i < count; i++) spawn('orc', i, 12000, 1.5);
  }
  // Soldiers: rogue sellswords ambushing roads in the outskirts (danger 1+), rarer than bandits.
  if (danger >= 1 && mapTileFor(chunk).road !== 'none' && Math.abs(chunk.x * 5 + chunk.y * 11) % 2 === 0) {
    spawn('soldier', 0, 13000, 1.1);
  }
  return monsters;
}
function birdsForChunk(chunk: Point): BirdState[] {
  const terrain = mapTileFor(chunk).terrain;
  if (terrain === 'ocean') return [];
  // Birds are rare: only forests/meadows, and only half the chunks have one.
  if (terrain !== 'forest' && terrain !== 'meadow') return [];
  const chunkSeed = Math.abs(chunk.x * 131 + chunk.y * 197 + 7);
  if (chunkSeed % 2 !== 0) return [];
  const birds: BirdState[] = [];
  for (let index = 0; index < 1; index++) {
    const seed = Math.abs(chunk.x * 131 + chunk.y * 197 + index * 61 + 7);
    const position = { x: 14 + ((seed * 37) % 72), y: 15 + ((seed * 53) % 70) };
    if (isFieldPositionBlocked(position, chunk)) continue;
    birds.push({
      id: index,
      position,
      homePosition: { ...position },
      state: 'idle',
      stateTimer: 2 + (seed % 5),
      target: { ...position },
      variant: seed % 3,
      facing: (['left', 'right'] as Direction[])[seed % 2],
      fleeing: false,
    });
  }
  return birds;
}
// Danger zone: chunk distance from the starting town (Mosslight Crossing area).
function dangerForChunk(chunk: Point): number {
  const dist = Math.max(Math.abs(chunk.x - 4), Math.abs(chunk.y - 7));
  if (dist <= 1) return 0; // starting region: safe
  if (dist <= 3) return 1; // outskirts
  if (dist <= 6) return 2; // deep wilderness
  return 3; // remote / dangerous
}
// Ambient water life: fish and frogs. Lightweight, deterministic, not persisted.
type WaterLifeKind = 'fish' | 'frog';
type WaterLifeState = {
  id: number;
  kind: WaterLifeKind;
  position: Point;
  homePosition: Point;
  facing: Direction;
  swimTimer: number;
  target: Point;
  variant: number;
};
function waterLifeForChunk(chunk: Point): WaterLifeState[] {
  const terrain = mapTileFor(chunk).terrain;
  const life: WaterLifeState[] = [];
  let id = 0;
  const spawn = (kind: WaterLifeKind, index: number, salt: number) => {
    const seed = Math.abs(chunk.x * 191 + chunk.y * 241 + index * 97 + salt);
    const position = { x: 12 + ((seed * 47) % 76), y: 14 + ((seed * 67) % 72) };
    life.push({
      id: id++,
      kind,
      position: { ...position },
      homePosition: { ...position },
      facing: seed % 2 === 0 ? 'left' : 'right',
      swimTimer: 1 + (seed % 3),
      target: { ...position },
      variant: seed % 3,
    });
  };
  // Fish: ocean and shore waters.
  if (terrain === 'ocean' || terrain === 'shore') {
    const count = terrain === 'ocean' ? 4 : 2;
    for (let i = 0; i < count; i++) spawn('fish', i, 12000);
  }
  // Frogs: shorelines.
  if (terrain === 'shore') {
    for (let i = 0; i < 2; i++) spawn('frog', i, 13000);
  }
  return life;
}
function updateWaterLife(animal: WaterLifeState, deltaMs: number): WaterLifeState {
  const next = { ...animal, position: { ...animal.position }, target: { ...animal.target } };
  next.swimTimer -= deltaMs / 1000;
  const dx = next.target.x - next.position.x;
  const dy = next.target.y - next.position.y;
  const dist = Math.hypot(dx, dy);
  const speed = next.kind === 'fish' ? 3 : 1.5;
  if (dist > 1) {
    const step = Math.min(speed * (deltaMs / 1000), dist);
    next.position.x += (dx / dist) * step;
    next.position.y += (dy / dist) * step;
    next.facing = dx >= 0 ? 'right' : 'left';
  } else if (next.swimTimer <= 0) {
    // Pick a new nearby target within home range.
    const range = 12;
    next.target = {
      x: Math.min(FIELD_SIZE - 4, Math.max(4, next.homePosition.x + ((Math.random() * 2 - 1) * range))),
      y: Math.min(FIELD_SIZE - 4, Math.max(4, next.homePosition.y + ((Math.random() * 2 - 1) * range))),
    };
    next.swimTimer = 2 + Math.random() * 3;
  }
  return next;
}
function wildlifeForChunk(chunk: Point): WildlifeState[] {
  const terrain = mapTileFor(chunk).terrain;
  if (terrain === 'ocean') return [];
  const danger = dangerForChunk(chunk);
  const wildlife: WildlifeState[] = [];
  let id = 0;
  const spawn = (species: WildlifeSpecies, index: number, seedSalt: number) => {
    const seed = Math.abs(chunk.x * 149 + chunk.y * 211 + index * 73 + seedSalt);
    const position = { x: 12 + ((seed * 41) % 76), y: 14 + ((seed * 59) % 72) };
    if (isFieldPositionBlocked(position, chunk)) return;
    wildlife.push({
      id: id++,
      species,
      position,
      homePosition: { ...position },
      facing: (['up', 'right', 'down', 'left'] as Direction[])[seed % 4],
      moving: false,
      wanderSeed: seed,
      nextWanderTick: 60 + (seed % 120),
      target: null,
    });
  };
  // Rabbits temporarily removed (sprites glitched) — uncomment to re-enable.
  // if (terrain === 'meadow' || terrain === 'forest') {
  //   const count = terrain === 'meadow' ? 3 : 2;
  //   for (let i = 0; i < count; i++) spawn('rabbit', i, 1000);
  // }
  // Deer removed (brown-blob sprites) — uncomment to re-enable.
  // if (terrain === 'forest' || terrain === 'meadow') {
  //   for (let i = 0; i < 2; i++) spawn('deer', i, 2000);
  // }
  // Wolves: forests only, danger 2+ (never near the starting town).
  if (terrain === 'forest' && danger >= 2) {
    for (let i = 0; i < 2; i++) spawn('wolf', i, 3000);
  }
  // Boars: forests/meadows, danger 1+.
  if ((terrain === 'forest' || terrain === 'meadow') && danger >= 1) {
    spawn('boar', 0, 4000);
  }
  // Bears: forests and mountains, danger 2+ only. Slow, solitary.
  if ((terrain === 'forest' || terrain === 'rock') && danger >= 2) {
    spawn('bear', 0, 5000);
  }
  return wildlife;
}
function updateBird(bird: BirdState, nowMs: number, deltaMs: number, chunk: Point, playerPos: Point): BirdState {
  const next = { ...bird, position: { ...bird.position }, stateTimer: bird.stateTimer - deltaMs / 1000 };
  // Startled: player got close — take off and fly away off screen.
  const pdx = next.position.x - playerPos.x;
  const pdy = next.position.y - playerPos.y;
  const distPlayer = Math.hypot(pdx, pdy);
  if (!next.fleeing && distPlayer < BIRD_FLEE_RADIUS) {
    const d = distPlayer || 1;
    next.fleeing = true;
    next.state = 'fly';
    // Aim well past the field edge, away from the player, so the bird leaves the screen.
    next.target = {
      x: next.position.x + (pdx / d) * 140,
      y: next.position.y + (pdy / d) * 140,
    };
    next.stateTimer = 6;
  }
  if (next.fleeing) {
    const offScreen = next.position.x < -3 || next.position.x > 103 || next.position.y < -3 || next.position.y > 103;
    if (offScreen) {
      // Gone: stop fleeing; the normal behavior pick below flies it back home.
      next.fleeing = false;
      next.stateTimer = 0;
    } else if (next.stateTimer <= 0) {
      // Still on screen: keep flying, don't fall through to normal behavior yet.
      next.state = 'fly';
      next.stateTimer = 6;
    }
  }
  if (next.stateTimer > 0) {
    // Continue current state movement.
    if (next.state === 'hop' || next.state === 'fly') {
      const dx = next.target.x - next.position.x;
      const dy = next.target.y - next.position.y;
      const dist = Math.hypot(dx, dy);
      const step = next.state === 'fly' ? BIRD_FLY_STEP : BIRD_STEP;
      if (dist > 0.5) {
        const candidate = {
          x: next.position.x + (dx / dist) * Math.min(step, dist),
          y: next.position.y + (dy / dist) * Math.min(step, dist),
        };
        // Validate terrain/collision each step; flying birds can cross anything, hopping birds cannot.
        if (next.state === 'fly' || !isFieldPositionBlocked(candidate, chunk)) {
          next.position = candidate;
          next.facing = dx >= 0 ? 'right' : 'left';
        } else {
          next.stateTimer = 0; // blocked: pick a new behavior next update
        }
      } else {
        next.stateTimer = 0;
      }
    }
    return next;
  }
  // Pick a new behavior (durations in seconds).
  const tick = Math.floor(nowMs / 700);
  const seed = Math.abs(tick * 31 + bird.id * 101 + Math.floor(bird.homePosition.x));
  const roll = seed % 100;
  const homeDx = bird.homePosition.x - bird.position.x;
  const homeDy = bird.homePosition.y - bird.position.y;
  const distHome = Math.hypot(homeDx, homeDy);
  const clampTarget = (p: Point): Point => ({ x: Math.min(90, Math.max(10, p.x)), y: Math.min(90, Math.max(10, p.y)) });
  if (distHome > 25) {
    // Too far: fly back toward home.
    next.state = 'fly';
    next.target = clampTarget({ x: bird.homePosition.x + ((seed * 7) % 10) - 5, y: bird.homePosition.y + ((seed * 13) % 10) - 5 });
    next.stateTimer = 2.5;
  } else if (roll < 30) {
    next.state = 'idle';
    next.stateTimer = 1.5 + (seed % 6) * 0.5;
  } else if (roll < 55) {
    next.state = 'peck';
    next.stateTimer = 1 + (seed % 3) * 0.5;
  } else if (roll < 80) {
    // Hop to a nearby spot.
    const angle = (seed % 360) * (Math.PI / 180);
    const hopDist = 3 + (seed % 6);
    next.state = 'hop';
    next.target = clampTarget({
      x: bird.position.x + Math.cos(angle) * hopDist,
      y: bird.position.y + Math.sin(angle) * hopDist,
    });
    next.stateTimer = 2;
  } else {
    // Fly a short distance.
    const angle = ((seed * 3) % 360) * (Math.PI / 180);
    const flyDist = 10 + (seed % 15);
    next.state = 'fly';
    next.target = clampTarget({
      x: bird.position.x + Math.cos(angle) * flyDist,
      y: bird.position.y + Math.sin(angle) * flyDist,
    });
    next.stateTimer = 3;
  }
  return next;
}
// Wildlife wander: pick a nearby target, walk to it, idle. Stays near home.
function updateWildlife(animal: WildlifeState, tick: number, chunk: Point): WildlifeState {
  const next = { ...animal, position: { ...animal.position } };
  const isRabbit = animal.species === 'rabbit';
  const speed = isRabbit ? 1.6 : animal.species === 'deer' ? 1.0 : animal.species === 'wolf' ? 1.2 : animal.species === 'bear' ? 0.6 : 0.8;
  if (next.target) {
    const dx = next.target.x - next.position.x;
    const dy = next.target.y - next.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.5) {
      next.target = null;
      next.moving = false;
      // Rabbits hop often with short pauses; other wildlife rests longer.
      next.nextWanderTick = tick + (isRabbit ? 6 + (next.wanderSeed % 14) : 40 + (next.wanderSeed % 80));
    } else {
      const step = Math.min(speed, dist);
      const candidate = { x: next.position.x + (dx / dist) * step, y: next.position.y + (dy / dist) * step };
      if (!isFieldPositionBlocked(candidate, chunk)) {
        next.position = candidate;
        next.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        next.moving = true;
      } else {
        next.target = null;
        next.moving = false;
      }
    }
  } else if (tick >= next.nextWanderTick) {
    // Pick a wander target within home range (radius ~14); rabbits take short hops.
    const angle = ((next.wanderSeed * 37 + tick * 13) % 360) * (Math.PI / 180);
    const radius = isRabbit ? 2 + ((next.wanderSeed * 53 + tick * 7) % 5) : 4 + ((next.wanderSeed * 53 + tick * 7) % 10);
    next.target = {
      x: Math.max(8, Math.min(92, next.homePosition.x + Math.cos(angle) * radius)),
      y: Math.max(8, Math.min(92, next.homePosition.y + Math.sin(angle) * radius)),
    };
    next.nextWanderTick = tick + (isRabbit ? 8 + (next.wanderSeed % 24) : 60 + (next.wanderSeed % 100));
  } else {
    next.moving = false;
  }
  return next;
}
function goatDistance(goat: GoatState, position: Point) { return Math.hypot(goat.position.x - position.x, goat.position.y - position.y); }
function goatIsInAttackArc(goat: GoatState, position: Point, facing: Direction) {
  // Judge the swing by reach in the facing arc: combat is up close, so the
  // swing only connects within a short reach in front of the player.
  // Anything in front within reach connects.
  return isInMeleeArc(position, goat.position, facing);
}
function goatWanderDelay(wanderSeed: number) {
  const range = GOAT_WANDER_MAX_TICKS - GOAT_WANDER_MIN_TICKS + 1;
  return GOAT_WANDER_MIN_TICKS + Math.abs(wanderSeed % range);
}
function nextGoatWanderSeed(goat: GoatState, worldStep: number) {
  return Math.abs((goat.wanderSeed * 1664525 + worldStep * 101 + goat.id * 17) % 2147483647);
}
function resetGoatAfterRespawn(goat: GoatState): GoatState {
  return {
    ...goat,
    position: { ...goat.spawnPosition },
    hp: goat.maxHp,
    disposition: GOAT_SPAWN_DISPOSITION,
    state: 'idle',
    attackCooldown: GOAT_ATTACK_COOLDOWN_MS,
    respawnTicks: 0,
    moving: false,
    attacking: false,
    attackTimer: 0,
    attackHitApplied: false,
    hurtTimer: 0,
    hitFlash: false,
    nextWanderTick: goatWanderDelay(goat.wanderSeed),
  };
}
function moveGoatIndependently(goat: GoatState, worldStep: number, playerPosition: Point, chunk: Point, goats: GoatState[]) {
  if (goat.disposition === 'defeated') return { ...goat, moving: false, attacking: false };
  const isWandering = goat.disposition === 'calm';
  const scheduledTick = goat.nextWanderTick ?? goatWanderDelay(goat.wanderSeed);
  if (isWandering && worldStep < scheduledTick) return { ...goat, moving: false, attacking: false, nextWanderTick: scheduledTick };
  const wanderSeed = nextGoatWanderSeed(goat, worldStep);
  const distance = goatDistance(goat, playerPosition);
  // Home/range: goats wander freely near home, drift back when far.
  const roamRadius = goat.roamRadius ?? 18;
  const distFromHome = Math.hypot(goat.position.x - goat.spawnPosition.x, goat.position.y - goat.spawnPosition.y);
  const homeBias = distFromHome > roamRadius ? 1 : distFromHome > roamRadius * 0.8 ? 0.65 : 0;
  let direction: Direction;
  if (goat.disposition === 'aggressive' && distance > GOAT_ATTACK_RANGE) {
    const horizontal = playerPosition.x - goat.position.x;
    const vertical = playerPosition.y - goat.position.y;
    direction = Math.abs(horizontal) >= Math.abs(vertical) ? (horizontal >= 0 ? 'right' : 'left') : (vertical >= 0 ? 'down' : 'up');
  } else if (homeBias > 0 && wanderSeed % 100 < homeBias * 100) {
    // Head home: pick the axis with the larger offset.
    const hx = goat.spawnPosition.x - goat.position.x;
    const hy = goat.spawnPosition.y - goat.position.y;
    direction = Math.abs(hx) >= Math.abs(hy) ? (hx >= 0 ? 'right' : 'left') : (hy >= 0 ? 'down' : 'up');
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
  const tile = generatedWorldTileFor(chunk);
  return tile ? worldMapBiomeLabel(tile.biome) : 'Open Water';
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
  moving: boolean;
  target: Point | null;
  home?: Point;
  work?: Point;
  leisure?: Point;
  /** Guild smith: talk opens the crafting / sell / rumours flow. */
  smith?: boolean;
};

const startingTownNpcs: TownNpc[] = [
  { name: 'Noah', title: 'Mage teacher', role: 'mage', position: { x: 40, y: 47 }, facing: 'right', moving: false, target: null, home: { x: 35, y: 60 }, work: { x: 40, y: 47 }, leisure: { x: 50, y: 50 } },
  { name: 'Damon', title: 'Warrior teacher', role: 'warrior', position: { x: 60, y: 47 }, facing: 'left', moving: false, target: null, home: { x: 65, y: 60 }, work: { x: 60, y: 47 }, leisure: { x: 50, y: 55 } },
  { name: 'Shawn', title: 'Rogue instructor', role: 'rogue', position: { x: 50, y: 64 }, facing: 'up', moving: false, target: null, home: { x: 45, y: 65 }, work: { x: 50, y: 64 }, leisure: { x: 55, y: 50 } },
];

// Get where an NPC should be based on the time of day
function npcScheduleTarget(npc: TownNpc, hour: number): Point {
  if (hour >= 22 || hour < 6) return npc.home || npc.position; // Night: home
  if (hour >= 9 && hour < 17) return npc.work || npc.position; // Day: work
  return npc.leisure || npc.position; // Evening/morning: leisure
}

// ---------------------------------------------------------------------------
// Canvas world-map atlas (build 161).
// The atlas is pre-rendered once to an offscreen canvas at a fixed 26px per
// tile. Pan/zoom is a single GPU-composited transform, tile picking is O(1)
// coordinate math, and the art is drawn vector-crisp. This replaces the old
// per-tile React divs (16k+ DOM nodes with per-tile image downloads) that
// made opening the map laggy and rendered everything squished.
// ---------------------------------------------------------------------------
const MAP_TILE_PX = 26;

type AtlasTile = {
  world: GeneratedWorldTile;
  landmark: { name: string; kind: SettlementKind } | null;
  roadN: boolean;
  roadS: boolean;
  roadE: boolean;
  roadW: boolean;
  bridge: boolean;
};

function atlasTileHash(x: number, y: number): number {
  let h = Math.imul(x + 1000, 374761393) ^ Math.imul(y + 1000, 668265263) ^ Math.imul(x - y + 7, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shadeHex(hex: string, factor: number): string {
  const r = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * factor)));
  return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

const ATLAS_BIOME_COLORS: Record<WorldMapBiome, string> = {
  ocean: '#1e6a97',
  shore: '#dcc084',
  meadow: '#6fa055',
  forest: '#3f7a45',
  desert: '#d9b96a',
  tundra: '#c3d4d1',
  rock: '#8f8b84',
};

function buildAtlasTiles(): AtlasTile[] {
  return generatedWorldTiles.map((world) => {
    const onRoad = worldRoadAt(world.x, world.y);
    return {
      world,
      landmark: mapLandmarks[world.x + ',' + world.y] || null,
      roadN: onRoad && worldRoadAt(world.x, world.y - 1),
      roadS: onRoad && worldRoadAt(world.x, world.y + 1),
      roadE: onRoad && worldRoadAt(world.x + 1, world.y),
      roadW: onRoad && worldRoadAt(world.x - 1, world.y),
      bridge: onRoad && world.biome === 'ocean',
    };
  });
}

function renderTerrainAtlas(tiles: AtlasTile[], cols: number, rows: number): HTMLCanvasElement {
  // Static terrain only (passes 1-4). Labels/markers live on a separate
  // overlay canvas (renderMapOverlay) so zoom LOD never re-renders terrain.
  const canvas = document.createElement('canvas');
  const T = MAP_TILE_PX;
  canvas.width = cols * T;
  canvas.height = rows * T;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const minX = worldMapBounds.minX;
  const minY = worldMapBounds.minY;
  const byKey = new Map<string, AtlasTile>();
  for (const tile of tiles) byKey.set(tile.world.x + ',' + tile.world.y, tile);
  const at = (x: number, y: number) => byKey.get(x + ',' + y);
  const px = (x: number) => (x - minX) * T;
  const py = (y: number) => (y - minY) * T;

  // Deep open water (no land within 2 tiles) renders darker and flat.
  const deepWater = new Set<string>();
  for (const tile of tiles) {
    if (tile.world.biome !== 'ocean') continue;
    const { x, y } = tile.world;
    let deep = true;
    for (let dy = -2; dy <= 2 && deep; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const n = at(x + dx, y + dy);
        if (n && n.world.biome !== 'ocean') { deep = false; break; }
      }
    }
    if (deep) deepWater.add(x + ',' + y);
  }

  // Pass 1: base terrain with per-tile variation and elevation relief.
  for (const tile of tiles) {
    const { x, y, biome, elevationLevel } = tile.world;
    const h = atlasTileHash(x, y);
    const base = deepWater.has(x + ',' + y) ? '#175177' : ATLAS_BIOME_COLORS[biome];
    ctx.fillStyle = shadeHex(base, 0.94 + h * 0.12);
    ctx.fillRect(px(x), py(y), T, T);
    if (biome !== 'ocean') {
      if (elevationLevel >= 3) {
        ctx.fillStyle = 'rgba(255, 250, 228, ' + (0.05 * (elevationLevel - 2)).toFixed(3) + ')';
        ctx.fillRect(px(x), py(y), T, T);
      } else if (elevationLevel <= 1) {
        ctx.fillStyle = 'rgba(24, 44, 24, 0.07)';
        ctx.fillRect(px(x), py(y), T, T);
      }
    }
  }

  // Pass 2: biome detail glyphs — forests read as forests, ridges as ridges.
  const dot = (cx: number, cy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const pine = (cx: number, baseY: number, size: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, baseY - size);
    ctx.lineTo(cx - size * 0.62, baseY);
    ctx.lineTo(cx + size * 0.62, baseY);
    ctx.closePath();
    ctx.fill();
  };
  for (const tile of tiles) {
    const { x, y, biome, detail } = tile.world;
    const X0 = px(x);
    const Y0 = py(y);
    const h1 = atlasTileHash(x * 3 + 11, y * 7 + 5);
    const h2 = atlasTileHash(x * 5 + 3, y * 11 + 17);
    const ax = X0 + 5 + h1 * (T - 10);
    const ay = Y0 + 5 + h2 * (T - 10);
    switch (detail) {
      case 'trees':
        pine(ax - 4, ay + 2, 8, 'rgba(22, 64, 30, 0.9)');
        pine(ax + 5, ay + 5, 6, 'rgba(30, 80, 38, 0.9)');
        break;
      case 'ridge':
        ctx.strokeStyle = 'rgba(74, 70, 62, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(X0 + 4, Y0 + T - 7);
        ctx.lineTo(X0 + T / 2, Y0 + 6);
        ctx.lineTo(X0 + T - 4, Y0 + T - 7);
        ctx.stroke();
        break;
      case 'cactus':
        dot(ax, ay, 2.2, 'rgba(46, 110, 58, 0.9)');
        dot(ax + 6, ay + 4, 1.7, 'rgba(46, 110, 58, 0.8)');
        break;
      case 'bush':
        dot(ax, ay, 2.4, 'rgba(52, 96, 44, 0.9)');
        dot(ax + 6, ay - 3, 2, 'rgba(52, 96, 44, 0.85)');
        dot(ax + 3, ay + 5, 1.8, 'rgba(62, 110, 52, 0.85)');
        break;
      case 'pebbles':
        dot(ax, ay, 1.6, biome === 'shore' ? 'rgba(150, 124, 80, 0.9)' : 'rgba(220, 220, 210, 0.7)');
        dot(ax + 7, ay + 5, 1.4, biome === 'shore' ? 'rgba(150, 124, 80, 0.8)' : 'rgba(220, 220, 210, 0.6)');
        dot(ax + 3, ay - 4, 1.2, biome === 'shore' ? 'rgba(160, 134, 88, 0.8)' : 'rgba(220, 220, 210, 0.5)');
        break;
      case 'munchleaf':
        dot(ax, ay, 2, 'rgba(126, 168, 158, 0.9)');
        dot(ax + 6, ay + 4, 1.6, 'rgba(140, 180, 170, 0.85)');
        break;
      case 'waves':
        if (!deepWater.has(x + ',' + y)) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.lineWidth = 1.4;
          for (let w = 0; w < 2; w++) {
            const wy = Y0 + 8 + w * 9 + h1 * 4;
            ctx.beginPath();
            ctx.arc(X0 + 8 + h2 * 8, wy, 3.4, Math.PI * 0.15, Math.PI * 0.85);
            ctx.stroke();
          }
        }
        break;
      default:
        break;
    }
  }

  // Pass 3: coastlines — sand rim on the land side, foam on the water side.
  for (const tile of tiles) {
    const { x, y, biome } = tile.world;
    if (biome === 'ocean') continue;
    const X0 = px(x);
    const Y0 = py(y);
    ctx.fillStyle = 'rgba(190, 158, 96, 0.85)';
    if (at(x, y - 1)?.world.biome === 'ocean') ctx.fillRect(X0, Y0, T, 3);
    if (at(x, y + 1)?.world.biome === 'ocean') ctx.fillRect(X0, Y0 + T - 3, T, 3);
    if (at(x - 1, y)?.world.biome === 'ocean') ctx.fillRect(X0, Y0, 3, T);
    if (at(x + 1, y)?.world.biome === 'ocean') ctx.fillRect(X0 + T - 3, Y0, 3, T);
  }
  for (const tile of tiles) {
    const { x, y, biome } = tile.world;
    if (biome !== 'ocean' || deepWater.has(x + ',' + y)) continue;
    const X0 = px(x);
    const Y0 = py(y);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    if (at(x, y - 1)?.world.biome !== 'ocean') ctx.fillRect(X0, Y0, T, 2);
    if (at(x, y + 1)?.world.biome !== 'ocean') ctx.fillRect(X0, Y0 + T - 2, T, 2);
    if (at(x - 1, y)?.world.biome !== 'ocean') ctx.fillRect(X0, Y0, 2, T);
    if (at(x + 1, y)?.world.biome !== 'ocean') ctx.fillRect(X0 + T - 2, Y0, 2, T);
  }

  // Pass 4: roads as continuous cased paths; bridges over water.
  for (const tile of tiles) {
    if (!tile.roadN && !tile.roadS && !tile.roadE && !tile.roadW) continue;
    const cx = px(tile.world.x) + T / 2;
    const cy = py(tile.world.y) + T / 2;
    const arms: Array<[boolean, number, number]> = [
      [tile.roadN, 0, -1],
      [tile.roadS, 0, 1],
      [tile.roadE, 1, 0],
      [tile.roadW, -1, 0],
    ];
    const layers: Array<[string, number]> = tile.bridge
      ? [['#5d4a36', 10], ['#b08a5e', 5]]
      : [['#6b5a3e', 9], ['#d3b06f', 4.5]];
    for (const [color, width] of layers) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [on, dx, dy] of arms) {
        if (!on) continue;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (dx * T) / 2, cy + (dy * T) / 2);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (tile.bridge) {
      ctx.strokeStyle = 'rgba(70, 48, 30, 0.65)';
      ctx.lineWidth = 1;
      const horiz = (tile.roadE || tile.roadW) && !tile.roadN && !tile.roadS;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const off = i * 6;
        if (horiz) { ctx.moveTo(cx + off, cy - 4); ctx.lineTo(cx + off, cy + 4); }
        else { ctx.moveTo(cx - 4, cy + off); ctx.lineTo(cx + 4, cy + off); }
      }
      ctx.stroke();
    }
  }

  return canvas;
}

// Zoom-LOD label/marker overlay. Cheap to redraw (~25 settlements), so it is
// re-rendered when the zoom tier changes while the terrain canvas stays cached.
// tier 0 (far): region labels + towns only. tier 1 (mid): + villages.
// tier 2 (near): everything + optional chunk coordinates in map-debug mode.
function renderMapOverlay(tiles: AtlasTile[], cols: number, rows: number, tier: 0 | 1 | 2, showCoords: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const T = MAP_TILE_PX;
  canvas.width = cols * T;
  canvas.height = rows * T;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const minX = worldMapBounds.minX;
  const minY = worldMapBounds.minY;
  const px = (x: number) => (x - minX) * T;
  const py = (y: number) => (y - minY) * T;

  // Settlements — drawn keep/cottage icons plus name labels.
  const drawVillage = (cx: number, cy: number) => {
    const house = (hx: number, hy: number, s: number) => {
      ctx.fillStyle = '#7d5f43';
      ctx.fillRect(hx - s / 2, hy - s / 4, s, s / 2);
      ctx.fillStyle = '#b5463c';
      ctx.beginPath();
      ctx.moveTo(hx - s / 2 - 1, hy - s / 4);
      ctx.lineTo(hx, hy - s / 4 - s / 2);
      ctx.lineTo(hx + s / 2 + 1, hy - s / 4);
      ctx.closePath();
      ctx.fill();
    };
    house(cx - 5, cy + 2, 9);
    house(cx + 5, cy - 1, 7);
  };
  const drawTown = (cx: number, cy: number) => {
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(cx - 7, cy - 6, 14, 12);
    ctx.fillStyle = '#7e848a';
    for (let i = 0; i < 3; i++) ctx.fillRect(cx - 7 + i * 5, cy - 9, 3, 3);
    ctx.fillStyle = '#b5463c';
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 6);
    ctx.lineTo(cx, cy - 13);
    ctx.lineTo(cx + 8, cy - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5d646b';
    ctx.fillRect(cx - 2, cy + 1, 4, 5);
  };
  const drawDungeon = (cx: number, cy: number) => {
    // Dark stone arch with a stairwell: reads as a dungeon entrance.
    ctx.fillStyle = '#4a4f55';
    ctx.fillRect(cx - 7, cy - 8, 14, 14);
    ctx.fillStyle = '#2b2e33';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 6);
    ctx.lineTo(cx - 4, cy - 1);
    ctx.arc(cx, cy - 1, 4, Math.PI, 0);
    ctx.lineTo(cx + 4, cy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a1c1f';
    for (let i = 0; i < 3; i++) ctx.fillRect(cx - 3 + i * 2, cy + 2 + i, 6 - i * 2, 1);
  };
  const drawRuin = (cx: number, cy: number) => {
    // Broken pillar stubs: reads as ancient ruins.
    ctx.fillStyle = '#8d8577';
    ctx.fillRect(cx - 7, cy - 2, 4, 8);
    ctx.fillRect(cx + 3, cy - 5, 4, 11);
    ctx.fillStyle = '#6e675b';
    ctx.fillRect(cx - 7, cy - 4, 4, 2);
    ctx.fillRect(cx + 3, cy - 7, 4, 2);
    ctx.fillStyle = '#a09a8c';
    ctx.fillRect(cx - 2, cy + 3, 4, 3);
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const tile of tiles) {
    if (!tile.landmark) continue;
    // Far zoom: towns only; mid/near: villages appear too.
    if (tier === 0 && tile.landmark.kind !== 'town') continue;
    const cx = px(tile.world.x) + T / 2;
    const cy = py(tile.world.y) + T / 2;
    if (tile.landmark.kind === 'town') drawTown(cx, cy - 3);
    else if (tile.landmark.kind === 'dungeon') drawDungeon(cx, cy - 3);
    else if (tile.landmark.kind === 'ruin') drawRuin(cx, cy - 3);
    else drawVillage(cx, cy - 3);
    const label = tile.landmark.name.toUpperCase();
    ctx.font = '700 10px Verdana, Geneva, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(32, 26, 18, 0.9)';
    ctx.strokeText(label, cx, cy + 8);
    ctx.fillStyle = '#fff6dd';
    ctx.fillText(label, cx, cy + 8);
  }

  // Region names.
  const regionLabel = (text: string, wx: number, wy: number) => {
    ctx.font = '800 30px Verdana, Geneva, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const stylable = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    stylable.letterSpacing = '10px';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255, 248, 225, 0.45)';
    ctx.strokeText(text, px(wx), py(wy));
    ctx.fillStyle = 'rgba(38, 50, 60, 0.55)';
    ctx.fillText(text, px(wx), py(wy));
    stylable.letterSpacing = '0px';
  };
  regionLabel('THE FAR MEADOW', 4, -3);
  regionLabel('THE EASTERN REACHES', 157, -19);

  // Developer map-debug mode (?mapdebug=1): chunk coordinates on every tile.
  if (showCoords) {
    ctx.font = '7px Verdana, Geneva, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 80, 80, 0.85)';
    for (const tile of tiles) {
      ctx.fillText(tile.world.x + ',' + tile.world.y, px(tile.world.x) + T / 2, py(tile.world.y) + T / 2);
    }
  }
  return canvas;
}

type TerrainAtlas = {
  canvas: HTMLCanvasElement;
  tiles: AtlasTile[];
  byKey: Map<string, AtlasTile>;
  cols: number;
  rows: number;
  width: number;
  height: number;
  buildMs: number;
};

// Module-level cache: world data is deterministic and static, so the terrain
// atlas is rendered exactly once per page load. Opening the map is one blit.
let terrainAtlasCache: TerrainAtlas | null = null;
function getTerrainAtlas(): TerrainAtlas {
  if (!terrainAtlasCache) {
    const start = performance.now();
    const tiles = buildAtlasTiles();
    const cols = worldMapBounds.maxX - worldMapBounds.minX + 1;
    const rows = worldMapBounds.maxY - worldMapBounds.minY + 1;
    const canvas = renderTerrainAtlas(tiles, cols, rows);
    const byKey = new Map<string, AtlasTile>();
    for (const tile of tiles) byKey.set(tile.world.x + ',' + tile.world.y, tile);
    terrainAtlasCache = {
      canvas, tiles, byKey, cols, rows,
      width: cols * MAP_TILE_PX, height: rows * MAP_TILE_PX,
      buildMs: performance.now() - start,
    };
  }
  return terrainAtlasCache;
}

function tierForZoom(zoom: number): 0 | 1 | 2 {
  if (zoom <= 3) return 0;
  if (zoom <= 5) return 1;
  return 2;
}

// Map <-> world validation (master prompt section 29): every landmark must sit
// on land in the authoritative world data, and every road tile must exist in it.
// Used by the ?debug=1 overlay and the sim suite.
export function validateMapData(): { ok: boolean; problems: string[]; landmarkCount: number; roadTileCount: number } {
  const problems: string[] = [];
  let roadTileCount = 0;
  for (const [key, landmark] of Object.entries(mapLandmarks)) {
    const tile = generatedWorldTileByKey.get(key);
    if (!tile) problems.push(landmark.name + ' (' + key + '): no world tile');
    // Ocean is the failure mode (impassable water); shore is walkable coastline.
    else if (tile.biome === 'ocean') {
      problems.push(landmark.name + ' (' + key + '): on ocean, not land');
    }
  }
  for (let y = worldMapBounds.minY; y <= worldMapBounds.maxY; y++) {
    for (let x = worldMapBounds.minX; x <= worldMapBounds.maxX; x++) {
      if (worldRoadAt(x, y)) {
        roadTileCount++;
        if (!generatedWorldTileByKey.has(x + ',' + y)) {
          problems.push('road tile (' + x + ',' + y + '): no world tile');
        }
      }
    }
  }
  return { ok: problems.length === 0, problems, landmarkCount: Object.keys(mapLandmarks).length, roadTileCount };
}

export function getMapDebugStats(): { cached: boolean; buildMs: number; width: number; height: number; tileCount: number; landmarkCount: number } {
  const atlas = getTerrainAtlas();
  return {
    cached: terrainAtlasCache !== null,
    buildMs: Math.round(atlas.buildMs * 10) / 10,
    width: atlas.width,
    height: atlas.height,
    tileCount: atlas.tiles.length,
    landmarkCount: Object.keys(mapLandmarks).length,
  };
}

// Playtest diagnostics overlay (?debug=1): text-observable build/fps/position/
// map-cache/validation readout so automated playtests can verify without
// relying on screenshots.
function DebugOverlay({ chunk }: { chunk: Point }) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const report = useMemo(() => {
    const stats = getMapDebugStats();
    const validation = validateMapData();
    return { stats, validation };
  }, []);
  const { stats, validation } = report;
  return (
    <div data-testid="debug-overlay" style={{ position: 'fixed', left: 8, top: 8, zIndex: 9999, background: 'rgba(0,0,0,0.82)', color: '#7dff9a', font: '10px/1.5 monospace', padding: '8px 10px', borderRadius: 6, pointerEvents: 'none', maxWidth: 320 }}>
      <div>BUILD {BUILD_NUMBER} · {fps} fps</div>
      <div>chunk {chunk.x},{chunk.y}</div>
      <div>atlas {stats.cached ? 'CACHED' : 'MISS'} · built in {stats.buildMs}ms · {stats.width}x{stats.height}px · {stats.tileCount} tiles · {stats.landmarkCount} landmarks</div>
      <div>map-sync {validation.ok ? 'OK (' + validation.roadTileCount + ' road tiles)' : 'FAIL: ' + validation.problems.slice(0, 3).join(' | ')}</div>
    </div>
  );
}

function WorldMap({ chunk, onClose }: { chunk: Point; onClose: () => void }) {
  // Lock body scroll while the map is open so touch swipes pan the map
  // instead of scrolling the page behind it (iOS Safari).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const [zoom, setZoom] = useState(5);
  const [selected, setSelected] = useState<AtlasTile | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  const ZOOM_SCALES = [0.4, 0.6, 0.84, 1.0, 1.25, 1.6, 2.0, 2.5];
  const mapScale = ZOOM_SCALES[zoom - 1];

  // Module-cached terrain atlas + zoom-LOD label overlay: opening the map is
  // one cached blit plus a ~25-settlement overlay redraw per zoom tier change.
  const atlas = getTerrainAtlas();
  const mapDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mapdebug') === '1';

  useEffect(() => {
    const target = canvasRef.current;
    if (!target) return;
    const ctx = target.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(atlas.canvas, 0, 0);
    ctx.drawImage(renderMapOverlay(atlas.tiles, atlas.cols, atlas.rows, tierForZoom(zoom), mapDebug), 0, 0);
  }, [atlas, zoom, mapDebug]);

  const clampPan = (x: number, y: number, scale: number) => {
    const stage = stageRef.current;
    if (!stage) return { x, y };
    const maxX = Math.max(0, (atlas.width * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (atlas.height * scale - stage.clientHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };
  const changeZoom = (next: number) => {
    const clamped = Math.min(ZOOM_SCALES.length, Math.max(1, next));
    const oldScale = ZOOM_SCALES[zoom - 1];
    const newScale = ZOOM_SCALES[clamped - 1];
    const ratio = newScale / oldScale;
    setZoom(clamped);
    // Zoom anchors on the viewport center: scale pan by the zoom ratio so the
    // atlas point under the viewport center stays under it. (Previously pan
    // was left unchanged, which pivoted zoom around the atlas center and made
    // content drift toward a corner.)
    setPan((p) => clampPan(p.x * ratio, p.y * ratio, newScale));
  };
  const nudgePan = (dx: number, dy: number) => setPan((p) => clampPan(p.x + dx, p.y + dy, mapScale));
  // Open centered on the player's current chunk (the starting island area),
  // not the middle of the whole atlas — the far continent is east, by pan.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const scale = ZOOM_SCALES[zoom - 1];
    const col = chunk.x - worldMapBounds.minX;
    const row = chunk.y - worldMapBounds.minY;
    const targetX = -scale * ((col + 0.5) * MAP_TILE_PX - atlas.width / 2);
    const targetY = -scale * ((row + 0.5) * MAP_TILE_PX - atlas.height / 2);
    setPan(clampPan(targetX, targetY, scale));
    // Run once on mount; refs and props are fixed for the lifetime of the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tileAtClientPoint = (clientX: number, clientY: number): AtlasTile | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    const ax = ((clientX - rect.left) / rect.width) * canvas.width;
    const ay = ((clientY - rect.top) / rect.height) * canvas.height;
    const col = Math.floor(ax / MAP_TILE_PX);
    const row = Math.floor(ay / MAP_TILE_PX);
    return atlas.byKey.get((worldMapBounds.minX + col) + ',' + (worldMapBounds.minY + row)) || null;
  };

  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y, moved: false };
  };
  const onStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; if (!drag) return;
    const dx = event.clientX - drag.startX; const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; setPanning(true); }
    if (drag.moved) setPan(clampPan(drag.panX + dx, drag.panY + dy, mapScale));
  };
  const endStageDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; dragRef.current = null; setPanning(false);
    // A tap (no drag) selects the tile under the finger/cursor.
    if (drag && !drag.moved) setSelected(tileAtClientPoint(event.clientX, event.clientY));
  };

  const selectedAreaName = selected ? (selected.landmark?.name || worldMapBiomeLabel(selected.world.biome)) : null;
  const currentEntry = atlas.byKey.get(chunk.x + ',' + chunk.y);
  const currentAreaName = currentEntry ? (currentEntry.landmark?.name || worldMapBiomeLabel(currentEntry.world.biome)) : 'Unknown lands';
  const playerPX = (chunk.x - worldMapBounds.minX + 0.5) * MAP_TILE_PX;
  const playerPY = (chunk.y - worldMapBounds.minY + 0.5) * MAP_TILE_PX;
  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="map-title" data-testid="overlay-world-map">
      <div className="map-sheet">
        <div className="map-sheet-heading">
          <div><span className="atlas-eyebrow">Hand-drawn atlas · build v{BUILD_NUMBER}</span><h2 id="map-title">The Far Meadow</h2></div>
          <button className="map-close" onClick={onClose} aria-label="Close world map" data-testid="button-close-map"><X size={19} /></button>
        </div>
        <div className="map-toolbar">
          <span className="map-area-label">{currentAreaName} · {currentEntry ? worldMapBiomeLabel(currentEntry.world.biome) : ''}</span>
          <div className="map-zoom-controls" aria-label="Map zoom controls">
            <button className="map-zoom-button" onClick={() => changeZoom(zoom - 1)} disabled={zoom === 1} aria-label="Zoom out" data-testid="button-map-zoom-out"><Minus size={15} /></button>
            <span className="map-zoom-level">×{mapScale}</span>
            <button className="map-zoom-button" onClick={() => changeZoom(zoom + 1)} disabled={zoom === ZOOM_SCALES.length} aria-label="Zoom in" data-testid="button-map-zoom-in"><Plus size={15} /></button>
          </div>
        </div>
        <div ref={stageRef} className={'big-map world-map-stage' + (panning ? ' is-panning' : '')} data-testid="map-world-preview"
          onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={endStageDrag} onPointerCancel={() => { dragRef.current = null; setPanning(false); }}>
          <span className="atlas-compass" aria-hidden="true"><strong>N</strong><span>↑</span></span>
          <div className="world-map-canvas-wrap" style={{ width: atlas.width, height: atlas.height, marginLeft: -atlas.width / 2, marginTop: -atlas.height / 2, transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + mapScale + ')' }}>
            <canvas ref={canvasRef} className="world-map-canvas" width={atlas.width} height={atlas.height} />
            {selected && (
              <span className="map-selection-ring" aria-hidden="true" style={{ left: (selected.world.x - worldMapBounds.minX + 0.5) * MAP_TILE_PX, top: (selected.world.y - worldMapBounds.minY + 0.5) * MAP_TILE_PX }} />
            )}
            <span className="map-player-dot" aria-label="Your current position" style={{ left: playerPX, top: playerPY }} />
          </div>
          <div className="map-pan-pad" aria-label="Pan map controls" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="map-pan-button map-pan-up" onClick={() => nudgePan(0, 70)} aria-label="Pan map up" data-testid="button-map-pan-up">▲</button>
            <button type="button" className="map-pan-button map-pan-left" onClick={() => nudgePan(70, 0)} aria-label="Pan map left" data-testid="button-map-pan-left">◀</button>
            <button type="button" className="map-pan-button map-pan-right" onClick={() => nudgePan(-70, 0)} aria-label="Pan map right" data-testid="button-map-pan-right">▶</button>
            <button type="button" className="map-pan-button map-pan-down" onClick={() => nudgePan(0, -70)} aria-label="Pan map down" data-testid="button-map-pan-down">▼</button>
          </div>
        </div>
        <div className={'map-selection' + (selected ? ' has-selection' : '')} role="status" aria-live="polite">
          <span className="map-selection-label">Selected area</span>
          <strong>{selectedAreaName || 'Tap a tile'}</strong>
          <small>{selected ? worldMapBiomeLabel(selected.world.biome) + ' · chunk ' + selected.world.x + ', ' + selected.world.y : 'Tap any tile to inspect its biome and region'}</small>
        </div>
        <div className="map-legend world-map-legend">
          <span className="legend-item"><span className="legend-dot" /> You are here</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-town" /> Town</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-village" /> Village</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-road" /> Road</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-mountain">▲</span> Mountain</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-dungeon">▣</span> Dungeon</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-ruin">▤</span> Ruin</span>
          <span className="legend-item"><span className="world-map-legend-swatch forest" /> Forest</span>
          <span className="legend-item"><span className="world-map-legend-swatch desert" /> Desert</span>
          <span className="legend-item"><span className="world-map-legend-swatch tundra" /> Tundra</span>
          <span className="legend-item"><span className="world-map-legend-swatch ocean" /> Water</span>
          <span className="legend-item">Seed {DEFAULT_WORLD_SEED} · hand-drawn atlas</span>
        </div>
      </div>
    </div>
  );
}
function InventorySheet({ inventory, equippedDagger, onToggleDagger, playerStats, statPoints, onAssignStat, time, onOpenOptions, onClose }: { inventory: GameInventory; equippedDagger: boolean; onToggleDagger: () => void; playerStats: PlayerStats; statPoints: number; onAssignStat: (stat: StatKey) => void; time: string; onOpenOptions: () => void; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'equipment' | 'stats'>('inventory');
  const itemCount = inventory.goatHorns + inventory.fabric + inventory.daggers + inventory.cloths + inventory.bone + inventory.pelt + inventory.fang + inventory.corn;
  const visibleItems = [
    { key: 'goatHorns', label: 'Goat horns', detail: 'Crafting material', mark: '✦', className: 'horn-mark' },
    { key: 'fabric', label: 'Fabric', detail: 'Useful cloth', mark: '▤', className: 'fabric-mark' },
    { key: 'daggers', label: 'Goat-horn dagger', detail: 'Crafted weapon', mark: '†', className: 'dagger-mark' },
    { key: 'cloths', label: 'Field cloths', detail: 'Crafted gear', mark: '✚', className: 'cloths-mark' },
    { key: 'bone', label: 'Bone', detail: 'Skeleton remains', mark: '☠', className: 'bone-mark' },
    { key: 'pelt', label: 'Pelt', detail: 'Thick animal hide', mark: '❖', className: 'pelt-mark' },
    { key: 'fang', label: 'Fang', detail: 'Sharp monster fang', mark: '⸙', className: 'fang-mark' },
    { key: 'corn', label: 'Corn', detail: 'Harvested crop', mark: '🌽', className: 'corn-mark' },
  ].filter((item) => inventory[item.key as keyof GameInventory] > 0);
  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="inventory-title" data-testid="overlay-inventory">
      <div className="map-sheet inventory-sheet">
        <div className="map-sheet-heading">
          <div className="menu-heading-title">
            <h2 id="inventory-title">Menu</h2>
            {time && <span className="menu-time" data-testid="text-game-time">{time}</span>}
            <span className="menu-build" data-testid="text-build-number">BUILD {BUILD_NUMBER}</span>
          </div>
          <div className="menu-heading-actions">
            <button className="map-close" onClick={() => { onClose(); onOpenOptions(); }} aria-label="Open options" title="Options" data-testid="button-open-options"><Settings size={18} /></button>
            <button className="map-close" onClick={onClose} aria-label="Close menu" data-testid="button-close-inventory"><X size={19} /></button>
          </div>
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
                <div className="inventory-item" data-testid="inventory-coins"><span className="inventory-item-mark coin-mark" aria-hidden="true" /><span><strong>Coins</strong><small>Spendable gold</small></span><b>{inventory.coins}</b></div>
                {visibleItems.map((item) => {
                  const count = inventory[item.key as keyof GameInventory] as number;
                  return <div className="inventory-item" key={item.key} data-testid={'inventory-' + item.key}><span className={'inventory-item-mark ' + item.className} aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.detail}</small></span><b>{count}</b>{item.key === 'daggers' && <button className={'item-action ' + (equippedDagger ? 'is-equipped' : '')} onClick={onToggleDagger} data-testid="button-toggle-dagger">{equippedDagger ? 'Unequip' : 'Equip'}</button>}</div>;
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

function InteriorRoom({ area, position, facing, moving, equippedDagger, attacking, attackSequence, simulatedAdventurers, selectedAdventurerId, onInspect, onTalkToSmith, onEnterDungeon }: { area: InteriorArea; position: Point; facing: Direction; moving: boolean; equippedDagger: boolean; attacking: boolean; attackSequence: number; simulatedAdventurers: SimulatedAdventurer[]; selectedAdventurerId: string | null; onInspect: (adventurer: SimulatedAdventurer) => void; onTalkToSmith: () => void; onEnterDungeon: () => void }) {
  // Room-type-specific furniture: each building type gets its own visual identity.
  const furniture = {
    guild: (<><span className="interior-rug" /><span className="interior-workbench" /><span className="interior-forge" aria-hidden="true"><span className="forge-fire"><span className="forge-flame forge-flame-back" /><span className="forge-flame forge-flame-mid" /><span className="forge-flame forge-flame-core" /><span className="forge-sparks"><i /><i /><i /><i /><i /></span></span><span className="forge-logs" /></span><span className="interior-weapon-rack" aria-hidden="true"><span className="rack-weapon" style={{ left: '8%', height: '58%', transform: 'rotate(-6deg)' }} /><span className="rack-weapon" style={{ left: '27%', height: '66%', transform: 'rotate(4deg)' }} /><span className="rack-weapon" style={{ left: '46%', height: '60%', transform: 'rotate(-3deg)' }} /><span className="rack-weapon" style={{ left: '65%', height: '68%', transform: 'rotate(5deg)' }} /><span className="rack-weapon" style={{ left: '82%', height: '56%', transform: 'rotate(-5deg)' }} /></span><span className="interior-quest-board" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></>),
    inn: (<><span className="interior-rug" /><span className="interior-table" /><span className="interior-fireplace" /><span className="interior-bar" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></>),
    chapel: (<><span className="interior-rug" /><span className="interior-altar" /><span className="interior-pew pew-left" /><span className="interior-pew pew-right" /><span className="interior-candle candle-left" /><span className="interior-candle candle-right" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></>),
    building: (<><span className="interior-rug" /><span className="interior-table" /><span className="interior-fireplace" /><span className="interior-shelf shelf-left" /><span className="interior-shelf shelf-right" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></>),
    prison: (<><span className="prison-bars" /><span className="prison-straw-bed" /><span className="prison-sewer-grate" /><span className="prison-torch" /><span className="interior-lantern lantern-left" /></>),
  }[area.roomType];
  return (
    <div className={'interior-scene interior-' + area.roomType + ' interior-variant-' + (Math.abs(area.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 4)} aria-label={area.name + ' interior'} data-testid={'interior-' + area.id}>
      <div className="interior-room" aria-hidden="true">{furniture}</div>
      {area.id === 'wayfarer-guild' && (
        <button type="button" className="interior-npc npc-warrior" onClick={onTalkToSmith} style={{ left: '62%', top: '40%' }} aria-label="Talk to Bram, the guild smith" data-testid="guild-smith" data-facing="down">
          <span className="interior-npc-nameplate" aria-hidden="true"><strong>Bram</strong><small>Guild smith · Talk</small></span>
          <span className="npc-sprite" aria-hidden="true" />
        </button>
      )}
      {area.id === 'tutorial-house' && (
        <button type="button" className="interior-npc npc-warrior" onClick={onTalkToSmith} style={{ left: '60%', top: '44%' }} aria-label="Talk to Bram, the smith" data-testid="tutorial-smith" data-facing="left">
          <span className="interior-npc-nameplate" aria-hidden="true"><strong>Bram</strong><small>Smith · Talk</small></span>
          <span className="npc-sprite" aria-hidden="true" />
        </button>
      )}
      {area.id === 'tutorial-house' && simulatedAdventurers.filter((adventurer) => (adventurer.location || 'field') === 'starting-house').map((adventurer) => {
        const housePosition = adventurer.interiorPosition || { x: 50, y: 47 };
        return <button type="button" key={adventurer.id} className={'simulated-adventurer interior-simulated-adventurer adventurer-' + adventurer.className.toLowerCase() + (adventurer.moving ? ' is-moving' : '') + (selectedAdventurerId === adventurer.id ? ' is-nameplate-visible' : '')} onClick={() => onInspect(adventurer)} style={{ left: housePosition.x + '%', top: housePosition.y + '%' }} data-facing={adventurer.facing} aria-label={adventurer.name + ', level ' + adventurer.level + ' ' + adventurer.className} data-testid={'simulated-adventurer-' + adventurer.id}>
          <span className="simulated-adventurer-nameplate"><strong>{adventurer.name}</strong><small>Lv. {adventurer.level} · {adventurer.activity}</small></span>
          <span className="simulated-adventurer-sprite" aria-hidden="true" />
        </button>;
      })}
      <div className="interior-doorway" aria-label="Exit to Mosslight Crossing"><span>EXIT</span></div>
      {area.id === 'rootbound-chapel' && (
        <button className="interior-dungeon-staircase" onClick={onEnterDungeon} aria-label="Descend to the Ember Vault dungeon" data-testid="button-enter-dungeon">
          <span className="dungeon-stairs-visual" aria-hidden="true" />
          <span className="dungeon-stairs-label">Ember Vault</span>
        </button>
      )}
      <div className={'interior-player ' + (moving ? 'is-moving ' : '') + (attacking ? 'is-attacking' : '')} data-facing={facing} style={{ left: position.x + '%', top: position.y + '%', '--attack-y': `${-attackDirectionRow[facing] * 48}px` } as CSSProperties}><span className="player-sprite" />{attacking && <span key={attackSequence} className="player-attack-sprite" aria-hidden="true" style={{ '--attack-y': `${-attackDirectionRow[facing] * 48}px`, backgroundImage: `url("${assetUrl('assets/gameplay/shining-fields/characters/player/attack.png')}")` } as CSSProperties} />}{equippedDagger && <span className="player-dagger" aria-label="Equipped dagger" />}</div>
      <div className="interior-exit-hint">Walk to the door to leave</div>
    </div>
  );
}

function GameField({ inventory, equippedDagger, playerStats, statPoints, characterChoices, onPlayerStatsChange, onStatPointsChange, onLoot, onOpenMap, onOpenInventory, onOpenJournal, onDiscoverLocation, onRestorePrison, onRestoreJournal, onRestoreReputation, onAddRumor, onEscapeSpawnConsumed, onChunkChange, muted, onToggleMute, inputLocked, saveStateRef, loadState, onSave, onDownloadSave, onOpenLoad, onOpenMenu, onEnterDungeon, menuBridgeRef, inPrison, prisonState, journal, reputation, escapeSpawn }: { inventory: GameInventory; equippedDagger: boolean; playerStats: PlayerStats; statPoints: number; characterChoices: CharacterChoices | null; onPlayerStatsChange: (stats: PlayerStats) => void; onStatPointsChange: (points: number | ((current: number) => number)) => void; onLoot: (loot: GoatLoot) => void; onOpenMap: () => void; onOpenInventory: () => void; onOpenJournal: () => void; onDiscoverLocation: (name: string, kind: string, chunk: Point) => void; onRestorePrison: (inPrison: boolean, prisonState: PrisonState | undefined) => void; onRestoreJournal: (journal: JournalState | undefined) => void; onRestoreReputation: (reputation: ReputationState | undefined) => void; onAddRumor: (text: string, source: string) => void; onEscapeSpawnConsumed: () => void; onChunkChange: (chunk: Point) => void; muted: boolean; onToggleMute: () => void; inputLocked: boolean; saveStateRef: { current: (() => SaveGameData) | null }; loadState: SaveGameData | null; onSave: () => void; onDownloadSave: () => void; onOpenLoad: () => void; onOpenMenu: () => void; onEnterDungeon: () => void; menuBridgeRef: { current: { openOptions: () => void; getTime: () => string } | null }; inPrison: boolean; prisonState: PrisonState; journal: JournalState; reputation: ReputationState; escapeSpawn: EscapeSpawn | null }) {
  const [position, setPosition] = useState<Point>({ x: FIELD_SIZE / 2 + 1, y: FIELD_SIZE / 2 + 2 });
  // Debug tap marks (?debugDoors=1): user taps to mark where they think the
  // invisible exit/entrance is; rendered as lime green dots with coordinates.
  const [debugMarks, setDebugMarks] = useState<Point[]>([]);
  const [chunk, setChunk] = useState<Point>(playtestChunk ?? { x: 4, y: 7 });
  const [areaFlash, setAreaFlash] = useState<{ id: string; label: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState<Direction>('down');
  const [attackFacing, setAttackFacing] = useState<Direction | null>(null);
  const [mounted, setMounted] = useState(playtestMounted);
  const [horse, setHorse] = useState<HorseState>(initialHorseState);
  const [horseFacing, setHorseFacing] = useState<Direction>('down');
  const [logOpen, setLogOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [logs, setLogs] = useState(initialLogs);
  const [time, setTime] = useState('06:00 · Spring · Y1 D1');
  const [playerHp, setPlayerHp] = useState(playerMaxHpForStats(initialPlayerStats));
  const [gameOver, setGameOver] = useState(false);
  const [playerXp, setPlayerXp] = useState(0);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerClass, setPlayerClass] = useState<PlayerClass>('Beginner');
  const [npcDialogue, setNpcDialogue] = useState<TownNpc | null>(null);
  // Town NPC nameplates (Noah/Damon/Shawn) stay hidden until the NPC is
  // tapped, then auto-hide after a few seconds.
  const [nameplateNpc, setNameplateNpc] = useState<string | null>(null);
  const nameplateTimerRef = useRef<number | null>(null);
  const [npcStates, setNpcStates] = useState(startingTownNpcs);
  const [simulatedAdventurers, setSimulatedAdventurers] = useState(initialSimulatedAdventurers);
  const [selectedAdventurerId, setSelectedAdventurerId] = useState<string | null>(null);
  const [goats, setGoats] = useState<GoatState[]>(() => goatsForChunk({ x: 4, y: 7 }, 1));
  const [monsters, setMonsters] = useState<MonsterState[]>(() => monstersForChunk({ x: 4, y: 7 }, 1));
  const [cornStalks, setCornStalks] = useState<CornStalk[]>(() => {
    const startChunk = { x: 4, y: 7 };
    return cornStalksForChunk(startChunk, mapTileFor(startChunk).terrain, (pos) => isFieldPositionBlocked(pos, startChunk));
  });
  const monstersRef = useRef<MonsterState[]>(monsters);
  const [birds, setBirds] = useState<BirdState[]>(() => birdsForChunk({ x: 4, y: 7 }));
  const birdsRef = useRef<BirdState[]>(birds);
  const [wildlife, setWildlife] = useState<WildlifeState[]>(() => wildlifeForChunk({ x: 4, y: 7 }));
  const [waterLife, setWaterLife] = useState<WaterLifeState[]>(() => waterLifeForChunk({ x: 4, y: 7 }));
  const waterLifeRef = useRef<WaterLifeState[]>(waterLife);
  // Bridge so the menu sheet (rendered by App) can open GameField's options overlay and read the clock.
  useEffect(() => {
    menuBridgeRef.current = { openOptions: () => setOptionsOpen(true), getTime: () => time };
  });
  const wildlifeRef = useRef<WildlifeState[]>(wildlife);
  useEffect(() => { waterLifeRef.current = waterLife; }, [waterLife]);
  const [targetGoatId, setTargetGoatId] = useState<number | null>(null);
  const [droppedLoot, setDroppedLoot] = useState<DroppedLoot[]>([]);
  const [attacking, setAttacking] = useState(false);
  const [attackSequence, setAttackSequence] = useState(0);
  const [attackFlash, setAttackFlash] = useState<string | null>(null);
  const [interior, setInterior] = useState<InteriorArea | null>(playtestInteriorArea ?? (playtestMounted || playtestChunk ? null : startingHouse));
  // Spawn on clear floor below the furniture: (50, 47) sits inside the
  // inn/building fireplace collision rect and permanently soft-locks movement.
  const [interiorPosition, setInteriorPosition] = useState<Point>({ x: 50, y: 78 });
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
  const cornStalksRef = useRef<CornStalk[]>(cornStalks);
  const targetGoatIdRef = useRef<number | null>(null);
  const droppedLootRef = useRef(droppedLoot);
  const droppedLootIdRef = useRef(1);
  const playerHpRef = useRef(playerHp);
  const gameOverRef = useRef(false);
  const playerXpRef = useRef(playerXp);
  const playerLevelRef = useRef(playerLevel);
  const playerStatsRef = useRef(playerStats);
  const playerClassRef = useRef<PlayerClass>(playerClass);
  const interiorRef = useRef(interior);
  const interiorPositionRef = useRef(interiorPosition);
  const interiorDoorwayIdRef = useRef<string | null>(STARTING_DOORWAY_ID);
  // The chunk the player was in when they entered the current interior, so
  // exit can resolve the same doorway from the same chunk (not hardcoded 4,7).
  const interiorEntryChunkRef = useRef<Point>({ x: 4, y: 7 });
  const goatWorldStepRef = useRef(0);
  const simulatedTickRef = useRef(0);
  const simulatedAdventurersRef = useRef(initialSimulatedAdventurers);
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
    characterChoices,
    npcStates,
    simulatedAdventurers,
    goats,
    interiorId: interior?.id || null,
    interiorPosition,
    inPrison,
    prisonState,
    journal,
    reputation,
    logs,
    time,
    brainState: brainRef.current?.getGameState() || null,
  });
  saveStateRef.current = createSaveData;

  // Sync the starting chunk to the parent on mount so the world map centers on
  // the true starting chunk (matters for ?playtestChunk starts).
  useEffect(() => {
    onChunkChange(chunkRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    const restoredAdventurers = loadState.simulatedAdventurers.length
      ? loadState.simulatedAdventurers.map((adventurer) => ({ ...adventurer, level: 1, location: adventurer.location ?? 'field', interiorPosition: adventurer.interiorPosition ?? { x: 50, y: 47 } }))
      : initialSimulatedAdventurers;
    simulatedAdventurersRef.current = restoredAdventurers;
    setSimulatedAdventurers(restoredAdventurers);
    interiorDoorwayIdRef.current = restoredDoorway?.id || null;
    interiorEntryChunkRef.current = { x: loadState.chunk.x, y: loadState.chunk.y };
    interiorRef.current = restoredDoorway?.area || null; setInterior(restoredDoorway?.area || null);
    interiorPositionRef.current = loadState.interiorPosition; setInteriorPosition(loadState.interiorPosition);
    onRestorePrison(loadState.inPrison || false, loadState.prisonState);
    if (loadState.journal) onRestoreJournal(loadState.journal);
    if (loadState.reputation) onRestoreReputation(loadState.reputation);
    setLogs(loadState.logs); setTime(loadState.time);
    setNpcDialogue(null); setAttackFlash(null); setLogOpen(false); setMoving(false);
    if (loadState.brainState) {
      brainRef.current?.loadGameState(loadState.brainState);
      const restoredClock = brainRef.current?.worldCore.getClock();
      if (restoredClock) setTime(formatWorldClock(restoredClock));
    }
  }, [loadState, onChunkChange, onPlayerStatsChange, onStatPointsChange]);

  // Prison escape handoff: Home sets escapeSpawn, GameField applies it on mount
  // (the escaped prisoner appears in the overworld, not the starting house).
  useEffect(() => {
    if (!escapeSpawn) return;
    chunkRef.current = escapeSpawn.chunk;
    setChunk(escapeSpawn.chunk);
    positionRef.current = escapeSpawn.position;
    setPosition(escapeSpawn.position);
    interiorRef.current = null;
    setInterior(null);
    interiorDoorwayIdRef.current = null;
    interiorPositionRef.current = { x: 50, y: 89 };
    setInteriorPosition({ x: 50, y: 89 });
    setLogs((currentLogs) => [...escapeSpawn.logs, ...currentLogs].slice(0, 5));
    onChunkChange(escapeSpawn.chunk);
    onEscapeSpawnConsumed();
  }, [escapeSpawn]);

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
  useEffect(() => { cornStalksRef.current = cornStalks; }, [cornStalks]);
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
  useEffect(() => { simulatedAdventurersRef.current = simulatedAdventurers; }, [simulatedAdventurers]);
  useEffect(() => {
    if (inputLocked || optionsOpen) {
      keysRef.current = {};
      setMoving(false);
    }
  }, [inputLocked, optionsOpen]);


  // Town NPCs amble smoothly toward nearby waypoints instead of teleporting
  // every few seconds. Facing the player pauses them.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNpcStates((current) => current.map((npc) => {
        const player = positionRef.current;
        const nearby = Math.hypot(player.x - npc.position.x, player.y - npc.position.y) < 18;
        const directions: Direction[] = ['up', 'right', 'down', 'left'];
        const facePlayer: Direction = Math.abs(player.x - npc.position.x) >= Math.abs(player.y - npc.position.y)
          ? (player.x >= npc.position.x ? 'right' : 'left')
          : (player.y >= npc.position.y ? 'down' : 'up');
        if (nearby) {
          return npc.moving || npc.target || npc.facing !== facePlayer
            ? { ...npc, facing: facePlayer, moving: false, target: null }
            : npc;
        }
        let target = npc.target;
        let facing = npc.facing;
        if (!target) {
          // Use schedule-based target instead of random wandering
          const clock = brainRef.current?.worldCore.getClock();
          const hour = clock?.hour ?? 12;
          const scheduleTarget = npcScheduleTarget(npc, hour);
          const distToSchedule = Math.hypot(scheduleTarget.x - npc.position.x, scheduleTarget.y - npc.position.y);
          // If far from schedule location, head there; otherwise wander nearby
          if (distToSchedule > 8) {
            target = scheduleTarget;
          } else if (Math.random() < 0.05) {
            facing = directions[Math.floor(Math.random() * directions.length)];
            target = {
              x: Math.min(86, Math.max(14, scheduleTarget.x + (Math.random() * 12 - 6))),
              y: Math.min(76, Math.max(32, scheduleTarget.y + (Math.random() * 12 - 6))),
            };
          } else if (Math.random() < 0.02) {
            facing = directions.filter((candidate) => candidate !== npc.facing)[Math.floor(Math.random() * 3)];
          }
          return target || facing !== npc.facing ? { ...npc, facing, target, moving: false } : npc;
        }
        const dx = target.x - npc.position.x;
        const dy = target.y - npc.position.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.4) return { ...npc, target: null, moving: false };
        const step = Math.min(0.14, dist);
        facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
        return {
          ...npc,
          position: { x: npc.position.x + (dx / dist) * step, y: npc.position.y + (dy / dist) * step },
          facing,
          moving: true,
        };
      }));
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextTick = simulatedTickRef.current + 1;
      simulatedTickRef.current = nextTick;
      const liveGoats = goatsRef.current.filter((goat) => goat.disposition !== 'defeated' && goat.hp > 0);
      const next = advanceSimulatedAdventurers(simulatedAdventurersRef.current, nextTick, liveGoats.map((goat) => ({ id: goat.id, position: goat.position })));
      // BUG-006 fix: background adventurers never touch the player's loaded
      // goats. Goat HP/disposition only change from the player's own attacks —
      // no more "random" damage on goats across the map.
      simulatedAdventurersRef.current = next;
      setSimulatedAdventurers(next);
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
    const nextMonsters = monstersForChunk(chunk, playerLevelRef.current);
    monstersRef.current = nextMonsters;
    setMonsters(nextMonsters);
    const nextCorn = cornStalksForChunk(chunk, mapTileFor(chunk).terrain, (pos) => isFieldPositionBlocked(pos, chunk));
    cornStalksRef.current = nextCorn;
    setCornStalks(nextCorn);
    const nextBirds = birdsForChunk(chunk);
    birdsRef.current = nextBirds;
    setBirds(nextBirds);
    const nextWildlife = wildlifeForChunk(chunk);
    wildlifeRef.current = nextWildlife;
    setWildlife(nextWildlife);
    const nextWaterLife = waterLifeForChunk(chunk);
    waterLifeRef.current = nextWaterLife;
    setWaterLife(nextWaterLife);
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
      if (gameOverRef.current) { animationFrame = window.requestAnimationFrame(animate); return; }
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
          const goatCandidates = (goatsRef.current as (GoatState & { entityKind?: string })[])
            .filter((goat) => goat.disposition !== 'defeated' && goatIsInAttackArc(goat, positionRef.current, playerAttack.direction))
            .map((goat) => ({ ...goat, entityKind: 'goat' as const }));
          const monsterCandidates = (monstersRef.current as (MonsterState & { entityKind?: string })[])
            .filter((monster) => monster.disposition !== 'defeated' && goatIsInAttackArc(monster, positionRef.current, playerAttack.direction))
            .map((monster) => ({ ...monster, entityKind: 'monster' as const }));
          const cornCandidates = cornStalksRef.current
            .filter((stalk) => {
              if (stalk.harvested) return false;
              // Corn is harvested with a scythe-like swing: any stalk within
              // reach counts, not just the facing arc (player stands among rows).
              const dist = Math.hypot(stalk.position.x - positionRef.current.x, stalk.position.y - positionRef.current.y);
              return dist <= 4.5 || goatIsInAttackArc(stalk as unknown as GoatState, positionRef.current, playerAttack.direction);
            })
            .map((stalk) => ({ ...stalk, entityKind: 'corn' as const }));
          const attackCandidates: Array<(typeof goatCandidates)[number] | (typeof monsterCandidates)[number] | (typeof cornCandidates)[number]> =
            [...goatCandidates, ...monsterCandidates, ...cornCandidates]
              .sort((a, b) => goatDistance(a as unknown as GoatState, positionRef.current) - goatDistance(b as unknown as GoatState, positionRef.current));
          const attackTarget = playerAttack.targetId == null
            ? attackCandidates[0]
            : attackCandidates.find((goat) => goat.id === playerAttack.targetId);
          if (attackTarget && goatIsInAttackArc(attackTarget as GoatState, positionRef.current, playerAttack.direction)) {
            // Harvesting corn: one swing cuts the stalk, which disappears and
            // drops corn loot. No HP, no combat — it's a crop, not a creature.
            if (attackTarget.entityKind === 'corn') {
              const stalkId = attackTarget.id;
              const hitPosition = { ...attackTarget.position };
              const nextStalks = cornStalksRef.current.filter((stalk) => stalk.id !== stalkId);
              cornStalksRef.current = nextStalks;
              setCornStalks(nextStalks);
              const cornCount = 1 + Math.floor(Math.random() * 2);
              const drop: DroppedLoot = { id: droppedLootIdRef.current++, chunk: { ...chunkRef.current }, position: hitPosition, loot: { corn: cornCount } };
              droppedLootRef.current = [...droppedLootRef.current, drop];
              setDroppedLoot(droppedLootRef.current);
              spawnCombatText('+' + cornCount + ' corn', hitPosition, 'reward');
              playCombatSound('shing', muted);
              setLogs((currentLogs) => [{ text: 'Harvested ' + cornCount + ' corn.', color: 'blue' }, ...currentLogs].slice(0, 3));
            } else {
            const stats = playerStatsRef.current;
            const critical = Math.random() < playerCriticalChanceForStats(stats);
            const damage = playerDamageForStats(stats) * (critical ? 2 : 1);
            const nextHp = Math.max(0, attackTarget.hp - damage);
            const defeated = nextHp <= 0;
            const hitPosition = { ...attackTarget.position };
            const targetLabel = attackTarget.entityKind === 'monster' ? (attackTarget as MonsterState).kind : 'goat';
            if (attackTarget.entityKind === 'monster') {
              const monsterTarget = attackTarget as MonsterState;
              const updatedMonsters = monstersRef.current.map((monster) => monster.id === monsterTarget.id ? { ...monster, hp: nextHp, position: monster.position, disposition: defeated ? 'defeated' as GoatDisposition : 'aggressive' as GoatDisposition, state: defeated ? 'die' as GoatStateName : 'hurt' as GoatStateName, hurtTimer: defeated ? 0 : 300, attackCooldown: 0, attacking: false, hitFlash: true } : monster);
              monstersRef.current = updatedMonsters; setMonsters(updatedMonsters);
              spawnCombatText((critical ? 'CRIT ' : '') + '-' + damage, hitPosition, critical ? 'critical' : 'damage');
              playCombatSound('shing', muted);
              window.setTimeout(() => setMonsters((current) => current.map((monster) => monster.id === monsterTarget.id ? { ...monster, hitFlash: false } : monster)), 100);
              setLogs((currentLogs) => [{ text: defeated ? targetLabel + ' defeated.' : 'You hit the ' + targetLabel + ' for ' + damage + (critical ? ' critical' : '') + ' damage.', color: defeated ? 'blue' : 'red' }, ...currentLogs].slice(0, 3));
              if (defeated) {
                const loot: GoatLoot = monsterLootForKind(monsterTarget.kind);
                const drop: DroppedLoot = { id: droppedLootIdRef.current++, chunk: { ...chunkRef.current }, position: hitPosition, loot };
                droppedLootRef.current = [...droppedLootRef.current, drop]; setDroppedLoot(droppedLootRef.current);
                const xpReward = goatExperienceReward(monsterTarget, playerLevelRef.current, playerStatsRef.current);
                const nextXp = playerXpRef.current + xpReward; const nextLevel = Math.floor(nextXp / 100) + 1; const previousLevel = playerLevelRef.current;
                playerXpRef.current = nextXp; setPlayerXp(nextXp);
                spawnCombatText('+' + xpReward + ' XP', hitPosition, 'reward');
                if (nextLevel > previousLevel) {
                  const awardedStatPoints = (nextLevel - previousLevel) * PLAYER_STAT_POINTS_PER_LEVEL;
                  playerLevelRef.current = nextLevel; setPlayerLevel(nextLevel); onStatPointsChange((current) => current + awardedStatPoints);
                  spawnCombatText('LEVEL UP! Lv. ' + nextLevel, hitPosition, 'reward');
                  setLogs((currentLogs) => [{ text: 'Level up! You reached level ' + nextLevel + ' (+' + awardedStatPoints + ' stat points).', color: 'blue' }, ...currentLogs].slice(0, 3));
                }
              }
            } else {
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
                spawnCombatText('LEVEL UP! Lv. ' + nextLevel, hitPosition, 'reward');
                setLogs((currentLogs) => [{ text: 'Level up! You reached level ' + nextLevel + ' (+' + awardedStatPoints + ' stat points).', color: 'blue' }, ...currentLogs].slice(0, 3));
              }
              targetGoatIdRef.current = null; setTargetGoatId(null);
            }
            } // end goat branch
            } // end harvest else
          } else {
            // Keep missed swings silent; combat feedback is reserved for actual hits.
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
            if (respawnTicks >= GOAT_RESPAWN_TICKS) return resetGoatAfterRespawn(goat);
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
          if (nextHp <= 0 && !gameOverRef.current) { gameOverRef.current = true; setGameOver(true); }
        }
        goatsRef.current = nextGoats; setGoats(nextGoats);
      }
      // Hostile monsters (goblins, bandits): same combat AI as goats.
      if (!interiorRef.current && monstersRef.current.length > 0) {
        const currentMonsters = monstersRef.current; const currentPlayer = positionRef.current; const currentChunk = chunkRef.current;
        let damageTaken = 0;
        const nextMonsters = currentMonsters.map((monster) => {
          if (monster.disposition === 'defeated') {
            return { ...monster, moving: false, attacking: false };
          }
          const result = updateGoat({ ...monster, state: monster.state ?? 'idle', hurtTimer: monster.hurtTimer ?? 0, attackTimer: monster.attackTimer ?? 0, attackHitApplied: monster.attackHitApplied ?? false }, currentPlayer, facingRef.current, currentMonsters, elapsed * 1000);
          let next = { ...result.goat, kind: monster.kind, id: monster.id, spawnPosition: monster.spawnPosition, roamRadius: monster.roamRadius, level: monster.level, maxHp: monster.maxHp, wanderSeed: monster.wanderSeed, hitFlash: monster.hitFlash, respawnTicks: monster.respawnTicks } as MonsterState;
          if (next.moving && isFieldPositionBlocked(next.position, currentChunk)) next = { ...next, position: monster.position, moving: false };
          if (result.attackHit) {
            const damage = goatAttackDamageForLevel(monster.level); damageTaken += damage;
            spawnCombatText('-' + damage, currentPlayer, 'damage'); playCombatSound('shing', muted);
          }
          return next;
        });
        if (damageTaken > 0) {
          const nextHp = Math.max(0, playerHpRef.current - damageTaken); playerHpRef.current = nextHp; setPlayerHp(nextHp);
          setLogs((currentLogs) => [{ text: 'A hostile creature strikes you for ' + damageTaken + ' damage.', color: 'red' }, ...currentLogs].slice(0, 3));
          if (nextHp <= 0 && !gameOverRef.current) { gameOverRef.current = true; setGameOver(true); }
        }
        monstersRef.current = nextMonsters; setMonsters(nextMonsters);
      }
      // Ambient birds: lightweight, tick alongside goats.
      if (!interiorRef.current && birdsRef.current.length > 0) {
        const nowMs = performance.now();
        const nextBirds = birdsRef.current.map((bird) => updateBird(bird, nowMs, elapsed * 1000, chunkRef.current, positionRef.current));
        birdsRef.current = nextBirds; setBirds(nextBirds);
      }
      // Wildlife wander: simple home-range movement, tick-throttled.
      if (!interiorRef.current && wildlifeRef.current.length > 0) {
        const tick = Math.floor(performance.now() / 500);
        const nextWildlife = wildlifeRef.current.map((animal) => updateWildlife(animal, tick, chunkRef.current));
        wildlifeRef.current = nextWildlife; setWildlife(nextWildlife);
      }
      // Water life: fish and frogs swim/hop near home.
      if (!interiorRef.current && waterLifeRef.current.length > 0) {
        const nextWaterLife = waterLifeRef.current.map((animal) => updateWaterLife(animal, elapsed * 1000));
        waterLifeRef.current = nextWaterLife; setWaterLife(nextWaterLife);
      }
      const currentInterior = interiorRef.current;
       if (active && currentInterior) {
          const direction = input.x > 0 ? 'right' : input.x < 0 ? 'left' : input.y < 0 ? 'up' : 'down';
          facingRef.current = direction;
          setFacing(direction);
         const frameWidth = gameFrameRef.current?.clientWidth || window.innerWidth;
         const frameHeight = gameFrameRef.current?.clientHeight || window.innerHeight;
         const movement = { x: (input.x / length) * WALK_SPEED * elapsed * FIELD_SIZE / frameWidth, y: (input.y / length) * WALK_SPEED * elapsed * FIELD_SIZE / frameHeight };
         const current = interiorPositionRef.current;
         const next = { x: Math.min(90, Math.max(10, current.x + movement.x)), y: current.y + movement.y };
         const horizontalStep = { x: next.x, y: current.y };
         const verticalStep = { x: current.x, y: next.y };
         // If the current spot is somehow blocked (e.g. an old save), let the
         // player walk out instead of pinning them in place forever.
         const startsBlocked = isInteriorPositionBlocked(current, currentInterior);
         const resolvedInteriorPosition = startsBlocked || !isInteriorPositionBlocked(next, currentInterior)
           ? next
           : !isInteriorPositionBlocked(horizontalStep, currentInterior)
             ? horizontalStep
             : !isInteriorPositionBlocked(verticalStep, currentInterior)
               ? verticalStep
               : current;
         const doorwayHalfWidth = (((INTERIOR_DOORWAY_WIDTH_PX + INTERIOR_PLAYER_WIDTH_PX) / 2 + INTERIOR_DOORWAY_PADDING_PX) / Math.max(1, frameWidth)) * 100;
         const atDoorway = Math.abs(next.x - 50) <= doorwayHalfWidth;
         if (next.y > 91 && atDoorway) {
           // Compute exit position fresh from the doorway (not stored data) to ensure
           // the player appears directly outside the visible door. Use the actual
           // entry chunk, not a hardcoded one, so the doorway resolves correctly.
           let exitPosition = currentInterior.exteriorPosition;
           const doorwayId = interiorDoorwayIdRef.current;
           if (doorwayId) {
             const freshDoorway = buildingDoorwaysFor(interiorEntryChunkRef.current).find((d) => d.id === doorwayId);
             if (freshDoorway) {
               exitPosition = { x: freshDoorway.position.x, y: freshDoorway.position.y + 8 };
             }
           }
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
          x: (input.x / length) * speed * elapsed * FIELD_SIZE / frameWidth,
          y: (input.y / length) * speed * elapsed * FIELD_SIZE / frameHeight,
        };
        const current = positionRef.current;
        const currentChunk = chunkRef.current;
        const attempted = { x: current.x + movement.x, y: current.y + movement.y };
        const nearbyDoor = doorwayNear(attempted, currentChunk);
        if (nearbyDoor && canEnterDoorway(current, attempted, nearbyDoor, direction)) {
          enterDoorway(nearbyDoor, currentChunk);
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
            // Journal auto-discovery: landmarks and POIs in the new chunk.
            const discoveredTile = mapTileFor(resolved.chunk);
            const discoveredLandmark = discoveredTile?.landmark;
            if (discoveredLandmark) {
              onDiscoverLocation(discoveredLandmark.name, discoveredLandmark.kind, resolved.chunk);
              setLogs((currentLogs) => [{ text: 'Discovered: ' + discoveredLandmark.name, color: 'green' }, ...currentLogs].slice(0, 5));
            }
            poisForChunk(resolved.chunk.x, resolved.chunk.y).forEach((poi) => {
              onDiscoverLocation(poi.name, poi.kind, resolved.chunk);
              setLogs((currentLogs) => [{ text: 'Discovered: ' + poi.name, color: 'green' }, ...currentLogs].slice(0, 5));
            });
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
    if (interiorRef.current || mountedRef.current || playerAttackStateRef.current.active || playerAttackCooldownRef.current > 0) return;
    const currentPlayer = positionRef.current;
    const currentFacing = facingRef.current;
    const targetId = preferredTargetId ?? targetGoatIdRef.current;
    const target = targetId == null
      ? null
      : goatsRef.current.find((goat) => goat.id === targetId && goat.disposition !== 'defeated');
    playerAttackStateRef.current = { active: true, direction: currentFacing, targetId: target?.id ?? null, elapsed: 0, hitApplied: false };
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
      drop.loot.bone ? `+${drop.loot.bone} bone${drop.loot.bone === 1 ? '' : 's'}` : '',
      drop.loot.pelt ? `+${drop.loot.pelt} pelt${drop.loot.pelt === 1 ? '' : 's'}` : '',
      drop.loot.fang ? `+${drop.loot.fang} fang${drop.loot.fang === 1 ? '' : 's'}` : '',
      drop.loot.corn ? `+${drop.loot.corn} corn` : '',
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
  const fieldPalette = fieldPalettes[currentWorldTile.terrain];
  const startingArea = isStartingArea(chunk);
  const startingCenter = isTutorialCenter(chunk);
  const talkToNpc = (npc: TownNpc) => {
    setNpcDialogue(npc);
    // Pop the nameplate up on tap; auto-hide it after 4 seconds.
    setNameplateNpc(npc.name);
    if (nameplateTimerRef.current !== null) window.clearTimeout(nameplateTimerRef.current);
    nameplateTimerRef.current = window.setTimeout(() => {
      setNameplateNpc(null);
      nameplateTimerRef.current = null;
    }, 4000);
    setLogs((currentLogs) => [{ text: `${npc.name} turns to you: ${npc.title}.`, color: 'blue' }, ...currentLogs].slice(0, 3));
    // NPCs occasionally share rumors
    if (Math.random() < 0.4) {
      const rumor = WORLD_RUMORS[Math.floor(Math.random() * WORLD_RUMORS.length)];
      onAddRumor(rumor, npc.name);
      setLogs((currentLogs) => [{ text: `${npc.name} shares a rumor: "${rumor}"`, color: 'purple' }, ...currentLogs].slice(0, 5));
    }
  };
  useEffect(() => () => {
    if (nameplateTimerRef.current !== null) window.clearTimeout(nameplateTimerRef.current);
  }, []);
  const inspectAdventurer = (adventurer: SimulatedAdventurer) => {
    const closingNameplate = selectedAdventurerId === adventurer.id;
    setSelectedAdventurerId((current) => current === adventurer.id ? null : adventurer.id);
    if (closingNameplate) return;
    // Adventurers still in the starting house haven't gathered anything to sell yet.
    const displayGoal = (adventurer.location || 'field') === 'starting-house'
      ? 'setting out to begin their adventure'
      : adventurer.goal;
    setLogs((currentLogs) => [{ text: `${adventurer.name}, level ${adventurer.level} ${adventurer.className}, is ${adventurer.activity}. Goal: ${displayGoal}.`, color: 'blue' }, ...currentLogs].slice(0, 3));
    setAttackFlash(`${adventurer.name}: ${displayGoal}`);
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
  // Guild smith (Bram) talk flow: Talk -> Crafting / Sell / Rumours.
  const [smithTab, setSmithTab] = useState<'talk' | 'craft' | 'sell' | 'rumors'>('talk');
  const [smithRumor, setSmithRumor] = useState<string | null>(null);
  const talkToSmith = () => {
    setSmithTab('talk');
    setSmithRumor(null);
    setNpcDialogue(GUILD_SMITH);
    setLogs((currentLogs) => [{ text: 'Bram the smith looks up from his workbench.', color: 'blue' }, ...currentLogs].slice(0, 3));
  };
  const closeSmithDialogue = () => {
    setNpcDialogue(null);
    setSmithTab('talk');
    setSmithRumor(null);
  };
  const canCraftSmith = (item: CraftItem) => {
    const recipe = craftRecipes[item];
    return Object.entries(recipe.cost).every(([key, value]) => (inventory[key as keyof GameInventory] || 0) >= (value || 0));
  };
  const sellItem = (key: 'bone' | 'pelt' | 'fang' | 'goatHorns' | 'fabric', price: number, label: string) => {
    if ((inventory[key] || 0) < 1) return;
    onLoot({ [key]: -1, coins: price } as GoatLoot);
    setLogs((currentLogs) => [{ text: `Sold ${label} for ${price} gold.`, color: 'blue' }, ...currentLogs].slice(0, 3));
  };
  const askSmithRumor = () => {
    const rumor = WORLD_RUMORS[Math.floor(Math.random() * WORLD_RUMORS.length)];
    setSmithRumor(rumor);
    onAddRumor(rumor, 'Bram');
    setLogs((currentLogs) => [{ text: `Bram shares a rumor: "${rumor}"`, color: 'purple' }, ...currentLogs].slice(0, 5));
  };
  const enterDoorway = (doorway: Doorway, entryChunk: Point) => {
    interiorDoorwayIdRef.current = doorway.id;
    interiorEntryChunkRef.current = { x: entryChunk.x, y: entryChunk.y };
    interiorRef.current = doorway.area; setInterior(doorway.area);
    interiorPositionRef.current = { x: 50, y: 89 }; setInteriorPosition({ x: 50, y: 89 });
    setMoving(false);
    setLogs((currentLogs) => [{ text: 'You enter the ' + doorway.area.name + '.', color: 'blue' }, ...currentLogs].slice(0, 3));
  };

  return (
    <div className="field-column">
      <div ref={gameFrameRef} className="game-frame" tabIndex={0} aria-label="Playable Mosslight Crossing field" data-testid="game-field" data-brain-chunk={brainRef.current?.currentChunkId || 'unknown'}>
        {interior ? <InteriorRoom area={interior} position={interiorPosition} facing={playerRenderFacing} moving={moving} equippedDagger={equippedDagger} attacking={attacking} attackSequence={attackSequence} simulatedAdventurers={simulatedAdventurers} selectedAdventurerId={selectedAdventurerId} onInspect={inspectAdventurer} onTalkToSmith={talkToSmith} onEnterDungeon={onEnterDungeon} /> : (
        <div className={'pixel-field world-field world-region-' + currentWorldTile.regionStyle + ' map-terrain-' + currentWorldTile.terrain + (currentWorldTile.waterFeature ? ' world-is-' + currentWorldTile.waterFeature : '') + (startingArea ? ' starting-area' : '')} data-terrain={currentWorldTile.terrain} data-region={currentWorldTile.regionStyle} data-world-biome={currentWorldTile.worldBiome} style={{
          '--field-color': fieldPalette.field,
          '--path-color': fieldPalette.path,
          '--field-glow': fieldPalette.glow,
        } as CSSProperties}
        onClick={debugDoors ? (e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * FIELD_SIZE;
          const y = ((e.clientY - rect.top) / rect.height) * FIELD_SIZE;
          setDebugMarks((marks) => [...marks, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }]);
        } : undefined}
        >
          <span className="field-edge top" /><span className="field-edge bottom" /><span className="field-edge left" /><span className="field-edge right" />
          {debugDoors && debugMarks.map((mark, i) => (
            <span key={'mark-' + i} aria-hidden="true" style={{
              position: 'absolute',
              left: fieldPct(mark.x - 1.5),
              top: fieldPct(mark.y - 1.5),
              width: fieldPct(3),
              height: fieldPct(3),
              background: 'lime',
              border: '2px solid darkgreen',
              borderRadius: '50%',
              pointerEvents: 'none',
              zIndex: 55,
            }} title={'(' + mark.x + ', ' + mark.y + ')'} />
          ))}
          {debugDoors && debugMarks.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setDebugMarks([]); }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                zIndex: 70,
                background: 'black',
                color: 'lime',
                border: '1px solid lime',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
              }}
            >
              Clear marks ({debugMarks.length})
            </button>
          )}
          <div className="field-world-layer">
          {currentWorldTile.waterFeature && <div className={'field-water world-water-' + currentWorldTile.waterFeature + (currentWorldTile.waterEdge ? ' water-edge-' + currentWorldTile.waterEdge : '')} aria-hidden="true" />}
           <div className="field-accents" aria-hidden="true">
             {fieldAccents.map((accent) => (
               <span
                 className={'field-accent accent-' + accent.kind}
                 key={accent.id}
                 style={{ left: fieldPct(accent.x), top: fieldPct(accent.y), transform: 'translate(-50%, -50%) rotate(' + accent.rotation + 'deg) scale(' + accent.scale + ')' }}
               />
             ))}
           </div>
          {currentWorldTile.road !== 'none' && (
            <div className={'field-road' + (currentWorldTile.bridge ? ' field-bridge' : '')} aria-hidden="true">
              <span className="field-road-center" />
              {currentWorldTile.road.includes('n') && <span className="field-road-arm field-road-arm-n" />}
              {currentWorldTile.road.includes('s') && <span className="field-road-arm field-road-arm-s" />}
              {currentWorldTile.road.includes('e') && <span className="field-road-arm field-road-arm-e" />}
              {currentWorldTile.road.includes('w') && <span className="field-road-arm field-road-arm-w" />}
            </div>
          )}
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
                style={{ left: fieldPct(goat.position.x), top: fieldPct(goat.position.y) }}
                data-facing={goat.facing}
                 data-state={goat.state}
                 data-disposition={goat.disposition}
                aria-label={(goat.disposition === 'aggressive' ? 'Hostile goat' : 'Peaceful goat') + ', level ' + goat.level}
                aria-pressed={targetGoatId === goat.id}
                data-testid={'button-target-goat-' + goat.id}
                onClick={() => {
                  if (inputLocked || optionsOpen || playerAttackStateRef.current.active) return;
                  // Tapping the already-targeted goat clears the target.
                  if (targetGoatIdRef.current === goat.id) {
                    targetGoatIdRef.current = null;
                    setTargetGoatId(null);
                    return;
                  }
                  const dx = goat.position.x - position.x;
                  const dy = goat.position.y - position.y;
                  const nextFacing: Direction = Math.abs(dx) >= Math.abs(dy)
                    ? (dx >= 0 ? 'right' : 'left')
                    : (dy >= 0 ? 'down' : 'up');
                  facingRef.current = nextFacing;
                  setFacing(nextFacing);
                  targetGoatIdRef.current = goat.id;
                  setTargetGoatId(goat.id);
                }}
              >
                <span className="goat-target-ring" aria-hidden="true" />
                <span className="goat-hp" style={{ width: ((goat.hp / goat.maxHp) * 100) + '%' }} />
                {goat.disposition === 'aggressive' && <span className="goat-aggro">!</span>}
                <span className="goat-sprite" />
              </button>
            ))}
          </div>
          <div className="field-monsters" aria-label="Hostile monsters">
            {monsters.filter((monster) => monster.disposition !== 'defeated').map((monster) => (
              <button
                type="button"
                key={'monster-' + monster.kind + '-' + monster.id}
                className={'monster monster-' + monster.kind + ' monster-state-' + getSpriteState(monster.state, monster.facing) + (monster.moving ? ' is-moving' : '') + (monster.attacking ? ' is-attacking' : '') + (monster.hitFlash ? ' is-hit' : '')}
                style={{ left: fieldPct(monster.position.x), top: fieldPct(monster.position.y) }}
                data-facing={monster.facing}
                data-state={monster.state}
                aria-label={'Hostile ' + monster.kind + ', level ' + monster.level}
                data-testid={'button-target-monster-' + monster.id}
                onClick={() => {
                  if (inputLocked || optionsOpen || playerAttackStateRef.current.active) return;
                  attackGoat();
                }}
              >
                <span className="monster-aggro">!</span>
                <span className="monster-sprite" />
              </button>
            ))}
          </div>
          <div className="field-birds" aria-hidden="true">
            {birds.map((bird) => (
              <span
                key={'bird-' + bird.id}
                className={'bird bird-variant-' + bird.variant + ' bird-' + bird.state}
                data-facing={bird.facing}
                style={{ left: fieldPct(bird.position.x), top: fieldPct(bird.position.y) }}
              />
            ))}
          </div>
          <div className="field-wildlife" aria-hidden="true">
            {wildlife.map((animal) => (
              <span
                key={'wildlife-' + animal.species + '-' + animal.id}
                className={'wildlife wildlife-' + animal.species + (animal.moving ? ' is-moving' : '')}
                data-facing={animal.facing}
                style={{ left: fieldPct(animal.position.x), top: fieldPct(animal.position.y), ...(animal.species === 'wolf' ? { '--wolf-sheet': `url("${assetUrl('wolves/wolf_' + (['gray', 'brown', 'black'] as const)[Math.abs(animal.id) % 3] + '_full.png')}")` } : {}), ...(animal.species === 'rabbit' ? { '--rabbit-sheet': `url("${assetUrl('rabbits/rabbit_white_full.png')}")` } : {}) } as CSSProperties}
              />
            ))}
          </div>
          <div className="field-waterlife" aria-hidden="true">
            {waterLife.map((animal) => (
              <span
                key={'waterlife-' + animal.kind + '-' + animal.id}
                className={'waterlife waterlife-' + animal.kind + ' waterlife-variant-' + animal.variant}
                data-facing={animal.facing}
                style={{ left: fieldPct(animal.position.x), top: fieldPct(animal.position.y) }}
              />
            ))}
          </div>
          <div className="combat-text-layer" aria-live="polite">
            {damageTexts.map((entry) => <span className={'combat-text ' + entry.kind} key={entry.id} style={{ left: fieldPct(entry.position.x), top: fieldPct(entry.position.y) }}>{entry.text}</span>)}
          </div>
          <div className="field-drops" aria-label="Dropped loot">
            {droppedLoot.filter((drop) => drop.chunk.x === chunk.x && drop.chunk.y === chunk.y).map((drop) => {
              const nearby = Math.hypot(drop.position.x - position.x, drop.position.y - position.y) <= 16;
              // Monster-specific loot visual: show what actually dropped, not a generic bag.
              const only = (key: keyof GoatLoot) => (drop.loot[key] || 0) > 0 && (Object.keys(drop.loot) as Array<keyof GoatLoot>).every((k) => k === key || !(drop.loot[k] || 0));
              const lootKind = only('goatHorns') ? 'horn'
                : only('fabric') ? 'cloth'
                : only('coins') ? 'coins'
                : only('bone') ? 'bone'
                : only('pelt') ? 'pelt'
                : only('fang') ? 'fang'
                : only('corn') ? 'corn' : 'bag';
              return <div className="loot-drop" key={drop.id} style={{ left: fieldPct(drop.position.x), top: fieldPct(drop.position.y) }}>
                <span className={'loot-visual loot-' + lootKind} aria-label={'Dropped ' + lootKind} />
                {nearby && <button className="pickup-button" onClick={() => pickupDrop(drop)} data-testid={'button-pickup-loot-' + drop.id}>Pick up</button>}
              </div>;
            })}
          </div>
          <div className="field-trees" aria-hidden="true" style={{ '--env-sprites': 'url("' + assetUrl('environment/FreePack.png') + '")' } as CSSProperties}>
            {fieldTrees.map((tree) => {
              // Anchor the sprite's bottom-center on its collision base so the
              // visible trunk sits exactly where movement is blocked.
              const box = ENV_SPRITE_BOXES[tree.sprite];
              const anchorX = tree.x + 3.2 * tree.scale;
              const anchorY = tree.y + 4 * tree.scale;
              return (
                <span
                  className={'field-tree env-' + tree.sprite}
                  key={tree.id}
                  style={{
                    left: 'calc(' + anchorX + '% - ' + (box.w / 2) * tree.scale + 'px)',
                    top: 'calc(' + anchorY + '% - ' + box.h * tree.scale + 'px)',
                    width: box.w,
                    height: box.h,
                    transform: 'scale(' + tree.scale + ')',
                    transformOrigin: 'top left',
                  }}
                />
              );
            })}
          </div>
          {cornStalks.length > 0 && (
            <div className="field-corn" aria-hidden="true" style={{ '--env-sprites': 'url("' + assetUrl('environment/FreePack.png') + '")' } as CSSProperties} data-testid="cornfield">
              {cornStalks.map((stalk) => {
                const box = ENV_SPRITE_BOXES.corn;
                return (
                  <span
                    className="field-corn-stalk env-corn"
                    key={stalk.id}
                    style={{
                      left: 'calc(' + stalk.position.x + '% - ' + box.w / 2 + 'px)',
                      top: 'calc(' + stalk.position.y + '% - ' + box.h + 'px)',
                      width: box.w,
                      height: box.h,
                    }}
                  />
                );
              })}
            </div>
          )}
          {currentWorldTile.landmark && currentWorldTile.landmark.kind === 'dungeon' && (
            <div className="field-dungeon-entrance" aria-label={currentWorldTile.landmark.name + ' entrance'} data-testid="dungeon-entrance">
              <span className="dungeon-mound" aria-hidden="true" />
              <span className="dungeon-stairs" aria-hidden="true" />
              <span className="dungeon-entrance-label" aria-hidden="true">{currentWorldTile.landmark.name}</span>
            </div>
          )}
          {currentWorldTile.landmark && currentWorldTile.landmark.kind === 'ruin' && (
            <div className="field-ruin" aria-label={currentWorldTile.landmark.name} data-testid="ruin-remains">
              <span className="ruin-stone ruin-stone-1" aria-hidden="true" />
              <span className="ruin-stone ruin-stone-2" aria-hidden="true" />
              <span className="ruin-stone ruin-stone-3" aria-hidden="true" />
              <span className="ruin-label" aria-hidden="true">{currentWorldTile.landmark.name}</span>
            </div>
          )}
          {currentWorldTile.landmark && currentWorldTile.landmark.kind !== 'dungeon' && currentWorldTile.landmark.kind !== 'ruin' && (() => {
            const houseRects = fieldHouseRects(currentWorldTile.landmark.kind, isStartingArea(chunk), Math.round(chunk.x) * 31 + Math.round(chunk.y) * 17);
            return (
            <div className={'field-village ' + currentWorldTile.landmark.kind + ' world-region-' + currentWorldTile.regionStyle + ' town-variant-' + (Math.abs(currentWorldTile.landmark.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 4)} aria-label={currentWorldTile.landmark.name}>
              <span className="field-village-square" />
              {houseRects.map((rect, i) => (
                <span
                  key={i}
                  className="field-house"
                  style={{
                    left: fieldPct(rect.left),
                    top: fieldPct(rect.top),
                    width: fieldPct(rect.right - rect.left),
                    height: fieldPct(rect.bottom - rect.top),
                  }}
                />
              ))}
              {debugDoors && houseRects.map((rect, i) => {
                const door = fieldDoorPosition(rect);
                const exit = doorwayExteriorPosition(rect, door);
                // RED = collision rect (0.35 padding), BLUE = door interaction (6.0 radius), GREEN = exit spawn
                return (
                  <span key={'dbg-' + i}>
                    <span aria-hidden="true" style={{
                      position: 'absolute',
                      left: fieldPct(rect.left - 0.35),
                      top: fieldPct(rect.top - 0.35),
                      width: fieldPct((rect.right - rect.left) + 0.7),
                      height: fieldPct((rect.bottom - rect.top) + 0.7),
                      border: '2px solid red',
                      pointerEvents: 'none',
                      zIndex: 50,
                    }} />
                    <span aria-hidden="true" style={{
                      position: 'absolute',
                      left: fieldPct(door.x - 6.0),
                      top: fieldPct(door.y - 6.0),
                      width: fieldPct(12.0),
                      height: fieldPct(12.0),
                      border: '2px solid blue',
                      borderRadius: '50%',
                      pointerEvents: 'none',
                      zIndex: 50,
                    }} />
                    <span aria-hidden="true" style={{
                      position: 'absolute',
                      left: fieldPct(exit.x - 1),
                      top: fieldPct(exit.y - 1),
                      width: fieldPct(2),
                      height: fieldPct(2),
                      background: 'green',
                      borderRadius: '50%',
                      pointerEvents: 'none',
                      zIndex: 50,
                    }} />
                  </span>
                );
              })}
              {currentWorldTile.landmark?.name === 'Mosslight Crossing' ? (
                <span className="field-village-fountain" aria-label="Greenvale fountain"><span className="fountain-spray" /></span>
              ) : (
                <span className="field-village-well" />
              )}
            </div>
            );
          })()}
          {/* Farms/homesteads in non-settlement chunks (only on farmable terrain) */}
          {!currentWorldTile.landmark && ['meadow', 'grassland', 'greenvale'].includes(mapTileFor(chunk).terrain) && (() => {
            const farmData = fieldFarmRects(chunk.x, chunk.y);
            return (
              <>
                {farmData.houses.map((rect, i) => (
                  <span
                    key={'farm-house-' + i}
                    className="field-house farm-house"
                    style={{
                      left: fieldPct(rect.left),
                      top: fieldPct(rect.top),
                      width: fieldPct((rect.right - rect.left)),
                      height: fieldPct((rect.bottom - rect.top)),
                    }}
                    aria-label="Farmhouse"
                  />
                ))}
                {farmData.fields.map((rect, i) => (
                  <span
                    key={'farm-field-' + i}
                    className="farm-field"
                    style={{
                      left: fieldPct(rect.left),
                      top: fieldPct(rect.top),
                      width: fieldPct((rect.right - rect.left)),
                      height: fieldPct((rect.bottom - rect.top)),
                    }}
                    aria-label="Crop field"
                  />
                ))}
              </>
            );
          })()}
          {/* Points of Interest: ruins, caves, camps, shrines */}
          {!currentWorldTile.landmark && (() => {
            const pois = poisForChunk(chunk.x, chunk.y);
            return (
              <>
                {pois.map((poi, i) => (
                  <span
                    key={'poi-' + i}
                    className={'poi poi-' + poi.kind}
                    style={{ left: fieldPct(poi.x), top: fieldPct(poi.y) }}
                    aria-label={poi.name}
                    title={poi.name}
                  />
                ))}
              </>
            );
          })()}
          {currentWorldTile.landmark?.name === 'Mosslight Crossing' && npcStates.map((npc) => (
            <button
              className={'town-npc npc-' + npc.role + (npc.moving ? ' is-moving' : '') + (nameplateNpc === npc.name ? ' show-nameplate' : '')}
              onClick={() => talkToNpc(npc)}
              style={{ left: fieldPct(npc.position.x), top: fieldPct(npc.position.y) }}
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
          {currentWorldTile.landmark?.name === 'Mosslight Crossing' && simulatedAdventurers.filter((adventurer) => (adventurer.location || 'field') !== 'starting-house').map((adventurer) => (
            <button
              type="button"
              key={adventurer.id}
              className={'simulated-adventurer adventurer-' + adventurer.className.toLowerCase() + (adventurer.moving ? ' is-moving' : '') + (selectedAdventurerId === adventurer.id ? ' is-nameplate-visible' : '')}
              onClick={() => inspectAdventurer(adventurer)}
              style={{ left: fieldPct(adventurer.position.x), top: fieldPct(adventurer.position.y) }}
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
              <div className={'horse ' + (mounted ? 'is-mounted ' : '') + (mounted && moving ? 'is-moving' : '')} style={{ left: fieldPct(horseDisplayPosition.x), top: fieldPct(horseDisplayPosition.y) }} data-facing={mounted ? facing : horseFacing} aria-label={mounted ? 'Mounted horse' : 'Your horse'} data-testid="horse-character">
                {mounted && <>
                  <span className="rider-sprite" aria-hidden="true" />
                  <span className="animal-head" aria-hidden="true" />
                </>}
                <span className="horse-sprite" />
              </div>
              {canMount && <button className="horse-mount-button" style={{ left: fieldPct(horseDisplayPosition.x), top: fieldPct(Math.min(FIELD_SIZE - 12, Math.max(12, horseDisplayPosition.y + 10))) }} onClick={toggleMount} aria-label="Mount horse" data-testid="button-toggle-mount">Mount</button>}
            </>
          )}
          {(() => {
            // Dungeon POI entrance: offer Descend when the player is near the crypt stairs.
            const dungeon = currentWorldTile.landmark && currentWorldTile.landmark.kind === 'dungeon' ? currentWorldTile.landmark : null;
            if (!dungeon) return null;
            const entrance = { x: 50, y: 44 };
            if (Math.hypot(position.x - entrance.x, position.y - entrance.y) > 10) return null;
            return <button className="dungeon-descend-button" style={{ left: fieldPct((entrance.x + 16)), top: fieldPct(entrance.y) }} onClick={onEnterDungeon} aria-label={'Descend into ' + dungeon.name} data-testid="button-enter-field-dungeon">Descend</button>;
          })()}
          </div>
          {!mounted && <div className={'player ' + (!mounted && moving ? 'is-moving ' : '') + (attacking ? 'is-attacking' : '')}
             data-state={attacking ? 'attack' : moving ? 'run' : 'idle'} style={{ left: fieldPct(position.x), top: fieldPct(position.y), '--attack-y': `${-attackDirectionRow[playerRenderFacing] * 48}px` } as CSSProperties} data-facing={playerRenderFacing} data-testid="player-character">
            <span className="player-sprite" />
            {attacking && <span key={attackSequence} className="player-attack-sprite" aria-hidden="true" style={{ '--attack-y': `${-attackDirectionRow[playerRenderFacing] * 48}px`, backgroundImage: `url("${assetUrl('assets/gameplay/shining-fields/characters/player/attack.png')}")` } as CSSProperties} />}
            {equippedDagger && <span className="player-dagger" aria-label="Equipped dagger" />}
            {debugDoors && <span aria-hidden="true" style={{
              position: 'absolute',
              left: '-6px',
              top: '-6px',
              right: '-6px',
              bottom: '-6px',
              border: '3px solid yellow',
              borderRadius: '50%',
              pointerEvents: 'none',
              zIndex: 60,
            }} />}
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
                {npcDialogue.smith ? (
                  <>
                    <p>
                      {smithTab === 'talk' && 'Bram wipes his hands on his apron. "Need gear, coin, or gossip, traveler?"'}
                      {smithTab === 'craft' && '"Bring me horns and fabric and I\'ll hammer them into something useful."'}
                      {smithTab === 'sell' && '"Got monster bits to unload? I pay fair coin."'}
                      {smithTab === 'rumors' && '"Heard anything on the roads? I\'ve heard plenty."'}
                    </p>
                    <div className="dialogue-options" role="group" aria-label="Talk options">
                      <button type="button" className={'dialogue-option' + (smithTab === 'craft' ? ' is-active' : '')} onClick={() => setSmithTab('craft')} data-testid="button-smith-craft">Crafting</button>
                      <button type="button" className={'dialogue-option' + (smithTab === 'sell' ? ' is-active' : '')} onClick={() => setSmithTab('sell')} data-testid="button-smith-sell">Sell</button>
                      <button type="button" className={'dialogue-option' + (smithTab === 'rumors' ? ' is-active' : '')} onClick={() => setSmithTab('rumors')} data-testid="button-smith-rumors">Rumours</button>
                    </div>
                    {smithTab === 'craft' && (
                      <div className="crafting-options" data-testid="smith-crafting-options">
                        {(Object.keys(craftRecipes) as CraftItem[]).map((item) => {
                          const recipe = craftRecipes[item];
                          const costLabel = Object.entries(recipe.cost).map(([key, value]) => `${inventory[key as keyof GameInventory] || 0}/${value} ${key === 'goatHorns' ? 'horns' : key}`).join(' · ');
                          return (
                            <button className="craft-button" key={item} onClick={() => craftItem(item)} disabled={!canCraftSmith(item)} data-testid={'button-craft-' + item}>
                              <span><b>{recipe.name}</b><small>{recipe.description}</small></span>
                              <em>{costLabel}</em>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {smithTab === 'sell' && (
                      <div className="sell-options" data-testid="smith-sell-options">
                        {SMITH_SELL_PRICES.map(({ key, name, price }) => (
                          <button className="craft-button sell-button" key={key} onClick={() => sellItem(key, price, name)} disabled={(inventory[key] || 0) < 1} data-testid={'button-sell-' + key}>
                            <span><b>{name}</b><small>You have {inventory[key] || 0}</small></span>
                            <em>+{price} gold</em>
                          </button>
                        ))}
                      </div>
                    )}
                    {smithTab === 'rumors' && (
                      <div className="smith-rumors" data-testid="smith-rumors">
                        <p className="smith-rumor-text">{smithRumor ? `"${smithRumor}"` : 'Ask and I\'ll tell you what the road folk are saying.'}</p>
                        <button type="button" className="dialogue-option" onClick={askSmithRumor} data-testid="button-smith-ask-rumor">Ask for rumours</button>
                      </div>
                    )}
                    <button className="dialogue-close" onClick={closeSmithDialogue} data-testid="button-close-dialogue">Leave</button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {attackFlash && <div className="combat-flash" aria-live="polite">{attackFlash}</div>}
        {!interior && (() => { const promptDoor = doorwayNear(position, chunk); return promptDoor && <button type="button" className="door-prompt" aria-live="polite" onClick={() => enterDoorway(promptDoor, chunk)}>Enter {promptDoor.area.name}</button>; })()}
        {areaFlash && (
          <div className="area-flash" key={areaFlash.id} aria-live="polite" data-testid="area-entry-flash">
            <span className="area-flash-kicker">Entering</span>
            <strong>{areaFlash.label}</strong>
          </div>
        )}
        <div className="world-hud">
          <div className={'hud-card ' + (playerHp / playerMaxHp <= 0.25 ? 'is-wounded' : '')} data-testid="hud-player">
            <div className="hud-label"><span>Player</span><span data-testid="text-level">LV {playerLevel}</span></div>
            <div className="bar" aria-label={'Health ' + playerHp + ' of ' + playerMaxHp} ><div className="bar-fill health" style={{ width: ((playerHp / playerMaxHp) * 100) + '%' }} /></div><span className="hud-health-value">{playerHp} / {playerMaxHp} HP</span>
            <div className="bar xp-bar" aria-label={'Experience ' + (playerXp % 100) + ' of 100 to next level'}><div className="bar-fill xp-fill" style={{ width: ((playerXp % 100)) + '%' }} /></div><span className="hud-xp-value">{playerXp % 100} / 100 XP</span>
            <span className="hud-clock" data-testid="text-hud-time">{time}</span>
            <div className="hud-quick-actions">
              <button className="hud-quick-button" onClick={onOpenMap} aria-label="Open world map" title="World map" data-testid="button-open-map"><MapIcon size={15} /></button>
              <button className="hud-quick-button" onClick={() => setLogOpen((value) => !value)} aria-expanded={logOpen} aria-controls="field-log-drawer" aria-label={logOpen ? 'Hide field log' : 'Open field log'} title={logOpen ? 'Hide field log' : 'Open field log'} data-testid="button-toggle-field-log"><BookOpen size={15} /></button>
              <button className="hud-quick-button" onClick={onOpenJournal} aria-label="Open journal" title="Journal" data-testid="button-open-journal"><BookOpen size={15} /></button>
            </div>
            {selectedGoat && (
              <div className="hud-target" data-testid="hud-target">
                <div className="hud-target-label"><span>Target</span><strong>GOAT · LV {selectedGoat.level}</strong></div>
                <div className="bar target-bar" aria-label={'Target health ' + selectedGoat.hp + ' of ' + selectedGoat.maxHp}><div className="bar-fill target-health" style={{ width: ((selectedGoat.hp / selectedGoat.maxHp) * 100) + '%' }} /></div>
              </div>
            )}
            {mounted && <button className="horse-dismount-button" onClick={toggleMount} aria-label="Dismount horse" data-testid="button-dismount-horse">Dismount</button>}
          </div>
          <button className="hud-bag-button" onClick={onOpenInventory} aria-label="Open menu" title="Menu" data-testid="button-open-inventory"><Backpack size={17} /></button>
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
           <button className="icon-button field-attack-button" onClick={() => attackGoat()} disabled={attackCooldownMs > 0 || attacking || inputLocked || Boolean(interior) || mounted} aria-label={selectedGoat ? 'Strike selected goat' : 'Strike nearest goat'} title={selectedGoat ? 'Strike selected target · Space' : 'Strike nearest target · Space'} aria-disabled={attackCooldownMs > 0 || attacking} data-testid="button-attack"><Sword size={16} />{attackCooldownMs > 0 && <span className="attack-cooldown-ring" style={{ background: 'conic-gradient(rgba(219, 120, 94, .95) ' + ((attackCooldownMs / PLAYER_ATTACK_COOLDOWN_MS) * 100) + '%, rgba(19, 43, 34, .2) 0)' }} aria-hidden="true" />}</button>
         </div>
      </div>
      <div className="sr-only" aria-live="polite" data-testid="status-movement">{moving ? (mounted ? 'Riding through Mosslight Crossing' : 'Moving through Mosslight Crossing') : (mounted ? 'Mounted and ready' : 'Standing still')}</div>
      <div className="sr-only" aria-live="polite" data-testid="status-mount">{mounted ? 'Mounted on the horse' : canMount ? 'Horse nearby and ready to mount' : horseHere ? 'Horse is parked in this field' : 'Horse is in another field'}</div>
      <div className="sr-only" aria-live="polite" data-testid="status-field-log">{logs[0].text}</div>
      {gameOver && (
        <div className="game-over-overlay" role="alertdialog" aria-label="Game over">
          <div className="game-over-panel">
            <h2 className="game-over-title">GAME OVER</h2>
            <p className="game-over-sub">Your adventure has ended.</p>
            <button className="game-over-button" onClick={onOpenMenu}>Return to Title</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveIcon() {
  return <span className="save-icon" aria-hidden="true">▣</span>;
}

function Home() {
  const [mapOpen, setMapOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const menuBridgeRef = useRef<{ openOptions: () => void; getTime: () => string } | null>(null);
  const [muted, setMuted] = useState(false);
  const [chunk, setChunk] = useState({ x: 4, y: 7 });
  const [inventory, setInventory] = useState<GameInventory>(initialInventory);
  const [playerStats, setPlayerStats] = useState<PlayerStats>(initialPlayerStats);
  const [statPoints, setStatPoints] = useState(0);
  const [equippedDagger, setEquippedDagger] = useState(false);
  // Start at the title screen so New Game mounts a fresh full-health session.
  const [menuOpen, setMenuOpen] = useState(true);
  // Character creation: custom player sprite composited from Mana Seed parts.
  const [creatingCharacter, setCreatingCharacter] = useState(false);
  const [characterChoices, setCharacterChoices] = useState<CharacterChoices | null>(null);
  const [playerSpriteUrl, setPlayerSpriteUrl] = useState<string | null>(null);
  const [playerAttackSpriteUrl, setPlayerAttackSpriteUrl] = useState<string | null>(null);
  const [dungeonOpen, setDungeonOpen] = useState(false);
  const [loadedSave, setLoadedSave] = useState<SaveGameData | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  // Journal: discovered locations, quests, rumors, notes
  const [journalOpen, setJournalOpen] = useState(false);
  const [journal, setJournal] = useState<JournalState>({
    discoveredLocations: [],
    activeQuests: [],
    completedQuests: [],
    rumors: [],
    notes: [],
  });
  // Prison opening: player starts in a cell, escapes to the overworld
  const [inPrison, setInPrison] = useState(false);
  const [prisonState, setPrisonState] = useState<PrisonState>({
    foundShiv: false,
    talkedToPrisoner: false,
    helpedPrisoner: false,
    escapeRoute: null,
  });
  // Handoff consumed by GameField on mount: where the escaped prisoner appears.
  const [escapeSpawn, setEscapeSpawn] = useState<EscapeSpawn | null>(null);
  // Reputation: tracked per faction/region
  const [reputation, setReputation] = useState<ReputationState>({
    mosslight: 0,
    guards: 0,
    merchants: 0,
    wilderness: 0,
  });
  // Journal discovery callback: GameField calls this when the player enters a
  // chunk with a landmark or POI. Dedupe by name; timestamp from the menu bridge.
  const discoverLocation = (name: string, kind: string, chunkPos: Point) => {
    const discoveredAt = menuBridgeRef.current?.getTime() ?? '';
    setJournal((j) => {
      if (j.discoveredLocations.some((loc) => loc.name === name)) return j;
      return { ...j, discoveredLocations: [...j.discoveredLocations, { name, kind, chunk: { ...chunkPos }, discoveredAt }] };
    });
  };
  // Save-restore callbacks: GameField owns loading, Home owns this state.
  const restorePrison = (inPrisonValue: boolean, prisonStateValue: PrisonState | undefined) => {
    setInPrison(inPrisonValue);
    if (prisonStateValue) setPrisonState(prisonStateValue);
  };
  const restoreJournal = (journalValue: SaveGameData['journal']) => {
    if (journalValue) setJournal(journalValue);
  };
  const restoreReputation = (reputationValue: SaveGameData['reputation']) => {
    if (reputationValue) setReputation(reputationValue);
  };
  const addRumor = (text: string, source: string) => {
    const heardAt = menuBridgeRef.current?.getTime() ?? '';
    setJournal((j) => {
      if (j.rumors.some((r) => r.text === text)) return j;
      return { ...j, rumors: [...j.rumors, { text, source, heardAt }] };
    });
  };
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
    bone: Math.max(0, current.bone + (loot.bone || 0)),
    pelt: Math.max(0, current.pelt + (loot.pelt || 0)),
    fang: Math.max(0, current.fang + (loot.fang || 0)),
    corn: Math.max(0, current.corn + (loot.corn || 0)),
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
    // No prison opening for now: new games start directly in the world.
    setInPrison(false);
    setPrisonState({ foundShiv: false, talkedToPrisoner: false, helpedPrisoner: false, escapeRoute: null });
    setChunk({ x: 4, y: 7 });
    setMapOpen(false); setInventoryOpen(false); setSaveNotice(null); setMenuOpen(false);
  };

  // Character creation confirm: build the custom sprite sheet, then start.
  // Falls back to the default sprite if compositing fails.
  const confirmCharacter = (choices: CharacterChoices) => {
    setCharacterChoices(choices);
    setCreatingCharacter(false);
    compositeCharacterSheet(choices, PLAYER_SPRITE_URL)
      .then((url) => setPlayerSpriteUrl(url))
      .catch(() => setPlayerSpriteUrl(null));
    compositeAttackSprite(choices, PLAYER_ATTACK_SPRITE_URL)
      .then((url) => setPlayerAttackSpriteUrl(url))
      .catch(() => setPlayerAttackSpriteUrl(null));
    startNewGame();
  };
  // Prison opening interactions
  const searchPrisonBed = () => {
    if (!prisonState.foundShiv) {
      setPrisonState(s => ({ ...s, foundShiv: true }));
      setInventory(inv => ({ ...inv, daggers: (inv.daggers || 0) + 1 }));
    }
  };
  const talkToPrisoner = () => {
    setPrisonState(s => ({ ...s, talkedToPrisoner: true }));
  };
  const helpPrisoner = () => {
    setPrisonState(s => ({ ...s, helpedPrisoner: true, talkedToPrisoner: true }));
  };
  const escapeViaSewer = () => {
    setPrisonState(s => ({ ...s, escapeRoute: 'sewer' }));
    // Reputation consequences
    setReputation((r) => ({
      ...r,
      guards: r.guards - 5, // Escaped prisoner
      wilderness: r.wilderness + (prisonState.helpedPrisoner ? 10 : 0),
    }));
    // GameField consumes this on mount: overworld spawn + escape log entries.
    setEscapeSpawn({
      chunk: { x: 3, y: 8 },
      position: { x: 50, y: 50 },
      logs: [
        { text: 'You crawl through the sewers and emerge by the river. Free at last.', color: 'green' },
        { text: prisonState.helpedPrisoner ? 'You promised to help your fellow prisoner. He will remember this.' : 'You left the prisoner behind.', color: 'blue' },
      ],
    });
    setChunk({ x: 3, y: 8 });
    setInPrison(false);
  };
  const escapeViaGate = () => {
    setPrisonState(s => ({ ...s, escapeRoute: 'gate' }));
    // Reputation consequences: gate escape is bolder, angers guards more
    setReputation((r) => ({
      ...r,
      guards: r.guards - 10,
      mosslight: r.mosslight - 5,
      wilderness: r.wilderness + (prisonState.helpedPrisoner ? 10 : 0),
    }));
    setEscapeSpawn({
      chunk: { x: 4, y: 7 },
      position: { x: 50, y: 85 },
      logs: [
        { text: 'You make a break for the gate and escape to the town outskirts. The guards will be watching.', color: 'orange' },
        { text: prisonState.helpedPrisoner ? 'You promised to help your fellow prisoner. He will remember this.' : 'You left the prisoner behind.', color: 'blue' },
      ],
    });
    setChunk({ x: 4, y: 7 });
    setInPrison(false);
  };

  const assignStatPoint = (stat: StatKey) => {
    if (statPoints < 1) return;
    setStatPoints((current) => current - 1);
    setPlayerStats((current) => ({ ...current, [stat]: current[stat] + 1 }));
  };

  const applyLoadedSave = (parsed: SaveGameData, notice: string) => {
    setLoadedSave(parsed);
    const savedEquippedDagger = Boolean(parsed.equippedDagger);
    setInventory({ ...initialInventory, ...parsed.inventory, daggers: Math.max(0, parsed.inventory.daggers - (savedEquippedDagger ? 1 : 0)) });
    setPlayerStats(parsed.playerStats || initialPlayerStats);
    setStatPoints(Math.max(0, Math.floor(parsed.statPoints || 0)));
    setEquippedDagger(savedEquippedDagger);
    setChunk(parsed.chunk);
    // Restore the custom character sprite when the save has one.
    const savedCharacter = sanitizeCharacterChoices(parsed.characterChoices);
    setCharacterChoices(savedCharacter);
    if (savedCharacter) {
      compositeCharacterSheet(savedCharacter, PLAYER_SPRITE_URL)
        .then((url) => setPlayerSpriteUrl(url))
        .catch(() => setPlayerSpriteUrl(null));
      compositeAttackSprite(savedCharacter, PLAYER_ATTACK_SPRITE_URL)
        .then((url) => setPlayerAttackSpriteUrl(url))
        .catch(() => setPlayerAttackSpriteUrl(null));
    } else {
      setPlayerSpriteUrl(null);
      setPlayerAttackSpriteUrl(null);
    }
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
        '--player-sprite-url': playerSpriteUrl ? `url("${playerSpriteUrl}")` : `url("${assetUrl('assets/cute-fantasy/player.png')}")`,
        // Bandits stay pinned to the original player sprite sheet even when the
        // player creates a custom character.
        '--bandit-sprite-url': `url("${assetUrl('assets/cute-fantasy/player.png')}")`,
        // New mob sprites (Tiny RPG pack): orc brute and rogue soldier.
        '--orc-idle-url': `url("${assetUrl('mobs/orc_idle.png')}")`,
        '--orc-walk-url': `url("${assetUrl('mobs/orc_walk.png')}")`,
        '--soldier-idle-url': `url("${assetUrl('mobs/soldier_idle.png')}")`,
        '--soldier-walk-url': `url("${assetUrl('mobs/soldier_walk.png')}")`,
        // Inventory item icons (Raven Fantasy Icons).
        '--inventory-icons-url': `url("${assetUrl('icons/inventory.png')}")`,
        '--player-attack-sprite-url': playerAttackSpriteUrl ? `url("${playerAttackSpriteUrl}")` : `url("${assetUrl('assets/gameplay/shining-fields/characters/player/attack.png')}")`,
        '--horse-sprite-url': `url("${assetUrl('assets/farm-male-cow-brown.png')}")`,
         '--goat-sprite-url': `url("${assetUrl('assets/gameplay/characters/goat/goat.png')}")`,
      } as CSSProperties}
    >
      {creatingCharacter ? (
        <CharacterCreator onConfirm={confirmCharacter} onCancel={() => setCreatingCharacter(false)} />
      ) : inPrison ? (
          <section className="prison-scene" aria-label="Prison cell" data-testid="prison-scene">
            <div className="prison-cell">
              <h2>You wake in a cold stone cell...</h2>
              <p className="prison-desc">Damp walls. The clink of chains from the next cell. A sliver of light through the bars.</p>
              <div className="prison-actions">
                {!prisonState.foundShiv && (
                  <button className="main-menu-button" onClick={searchPrisonBed}>Search the straw bed</button>
                )}
                {prisonState.foundShiv && <p className="prison-found">Found: Rusty Shiv (weapon)</p>}
                {!prisonState.talkedToPrisoner && (
                  <button className="main-menu-button" onClick={talkToPrisoner}>Talk to the prisoner next door</button>
                )}
                {prisonState.talkedToPrisoner && !prisonState.helpedPrisoner && (
                  <div>
                    <p className="prison-dialogue">"Psst... there's a loose grate in the floor. Leads to the sewers. Or you could try the gate when the guard changes... I can help, if you help me."</p>
                    <button className="main-menu-button" onClick={helpPrisoner}>Promise to help him escape too</button>
                  </div>
                )}
                {prisonState.helpedPrisoner && <p className="prison-dialogue">"Good. I'll remember this. Now go!"</p>}
                <div className="prison-escape">
                  <h3>Choose your escape:</h3>
                  <button className="main-menu-button primary" onClick={escapeViaSewer}>Crawl through the sewer grate</button>
                  <button className="main-menu-button" onClick={escapeViaGate}>Make a break for the gate</button>
                </div>
              </div>
            </div>
          </section>
      ) : menuOpen ? (
        <section className="main-menu" aria-label="Main menu" data-testid="main-menu">
          <div className="main-menu-card">
            <span className="main-menu-kicker">THE FAR MEADOW · BUILD {BUILD_NUMBER}</span>
            <h1>Adventure Game</h1>
            <p>Follow the roads, learn the first hunt, and choose the path that carries you beyond Mosslight Crossing.</p>
            <div className="main-menu-actions">
              <button className="main-menu-button" onClick={() => setCreatingCharacter(true)} data-testid="button-new-game">New Game</button>
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
            <GameField inventory={inventory} equippedDagger={equippedDagger} playerStats={playerStats} statPoints={statPoints} characterChoices={characterChoices} onPlayerStatsChange={setPlayerStats} onStatPointsChange={setStatPoints} onLoot={applyLoot} onOpenMap={() => setMapOpen(true)} onOpenInventory={() => setInventoryOpen(true)} onOpenJournal={() => setJournalOpen(true)} onDiscoverLocation={discoverLocation} onRestorePrison={restorePrison} onRestoreJournal={restoreJournal} onRestoreReputation={restoreReputation} onAddRumor={addRumor} onEscapeSpawnConsumed={() => setEscapeSpawn(null)} onChunkChange={setChunk} muted={muted} onToggleMute={() => setMuted((value) => !value)} inputLocked={mapOpen || inventoryOpen || dungeonOpen || journalOpen} saveStateRef={saveStateRef} loadState={loadedSave} onSave={saveGame} onDownloadSave={downloadSave} onOpenLoad={openLoadPicker} onOpenMenu={() => { setSaveNotice(null); setMenuOpen(true); }} onEnterDungeon={() => setDungeonOpen(true)} menuBridgeRef={menuBridgeRef} inPrison={inPrison} prisonState={prisonState} journal={journal} reputation={reputation} escapeSpawn={escapeSpawn} />
          </div>
          {dungeonOpen && <StoneSoupDungeon onExit={() => setDungeonOpen(false)} />}
          {mapOpen && <WorldMap chunk={chunk} onClose={() => setMapOpen(false)} />}
          {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1' && <DebugOverlay chunk={chunk} />}
          {inventoryOpen && <InventorySheet inventory={inventory} equippedDagger={equippedDagger} onToggleDagger={toggleDagger} playerStats={playerStats} statPoints={statPoints} onAssignStat={assignStatPoint} time={menuBridgeRef.current?.getTime() ?? ''} onOpenOptions={() => menuBridgeRef.current?.openOptions()} onClose={() => setInventoryOpen(false)} />}
          {journalOpen && (
            <div className="sheet journal-sheet" role="dialog" aria-label="Adventure journal" data-testid="journal-sheet">
              <div className="sheet-header">
                <h2>Journal</h2>
                <button className="sheet-close" onClick={() => setJournalOpen(false)} aria-label="Close journal"><X size={18} /></button>
              </div>
              <div className="journal-tabs">
                <div className="journal-section">
                  <h3>Reputation</h3>
                  <ul className="journal-list">
                    <li>Mosslight Crossing: <strong className={reputation.mosslight >= 0 ? 'rep-positive' : 'rep-negative'}>{reputation.mosslight}</strong></li>
                    <li>Guards: <strong className={reputation.guards >= 0 ? 'rep-positive' : 'rep-negative'}>{reputation.guards}</strong></li>
                    <li>Merchants: <strong className={reputation.merchants >= 0 ? 'rep-positive' : 'rep-negative'}>{reputation.merchants}</strong></li>
                    <li>Wilderness: <strong className={reputation.wilderness >= 0 ? 'rep-positive' : 'rep-negative'}>{reputation.wilderness}</strong></li>
                  </ul>
                </div>
                <div className="journal-section">
                  <h3>Discovered Locations ({journal.discoveredLocations.length})</h3>
                  {journal.discoveredLocations.length === 0 ? (
                    <p className="journal-empty">No locations discovered yet. Explore the world!</p>
                  ) : (
                    <ul className="journal-list">
                      {journal.discoveredLocations.map((loc, i) => (
                        <li key={i}><strong>{loc.name}</strong> <span className="journal-kind">({loc.kind})</span></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="journal-section">
                  <h3>Active Quests ({journal.activeQuests.length})</h3>
                  {journal.activeQuests.length === 0 ? (
                    <p className="journal-empty">No active quests.</p>
                  ) : (
                    <ul className="journal-list">
                      {journal.activeQuests.map((q) => (
                        <li key={q.id}><strong>{q.title}</strong><p>{q.description}</p><p className="journal-progress">{q.progress}</p></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="journal-section">
                  <h3>Rumors ({journal.rumors.length})</h3>
                  {journal.rumors.length === 0 ? (
                    <p className="journal-empty">No rumors heard yet. Talk to travelers.</p>
                  ) : (
                    <ul className="journal-list">
                      {journal.rumors.map((r, i) => (
                        <li key={i}>"{r.text}" <span className="journal-source">— {r.source}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
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
