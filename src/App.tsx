import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Backpack, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Eye, EyeOff, Hourglass, Map as MapIcon, Menu, MessageCircle, Minus, Plus, Settings, Sword, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { type CSSProperties } from 'react';
import { type ChangeEvent, type PointerEvent, type ReactNode, type TouchEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { createAdventureBrain, type RPGBrain, type RpgGameState } from '@/game/rpgBrain';
import { DEFAULT_WORLD_SEED, formatClockDisplay, ticksUntilHour, type WorldClockState } from '@/game/worldCore';
import type { EditorSolid, EditorPlaceKind, PlacedObject, FlaggedItem } from './game/worldEditor';
export type { EditorPlaceKind, PlacedObject, FlaggedItem } from './game/worldEditor';
import { editorPlaceObject, editorToggleFlag, editorSolidsFor, editorRemovalList, editorDeleteGenTree, editorRestoreGenTrees, editorFlaggedDeletions } from './game/worldEditor';
import { paintTile, clearChunkPaints, mapBuilderSolidsFor, MAP_TILE_UNITS, type MapPaints, type MapPaintTile } from './game/mapBuilder';
import { organicTownSpecs } from './game/organicTowns';
import { npcEntryPoint, facingForDelta, type NpcFacing } from './game/npcEntry';
import { findTalkTarget } from './game/talkTarget';
import { initialCellarRats, CELLAR_RAT_COUNT, type CellarRat } from './game/cellarRats';
import { createTouchHoldState, pressTouchHold, releaseTouchHold, isTouchHeld, clearTouchHolds, clearTouchHoldDirection, revalidateTouchHolds, type TouchHoldState, type TouchEventKind } from './game/touchInput';
import { npcAppearanceStyle } from './game/npcAppearance';
import { topicsFor, responseFor, dispositionTier, dispositionLabel, defaultDisposition, adjustDisposition, wantedLabel, type DialogueTopicId } from './game/dialogue';
import { shouldBark, barkFor, seedForName, type BarkContext } from './game/npcBarks';
import { EXPANDED_WORLD_BOUNDS, generateWorldMap, worldMapBiomeLabel, type GeneratedWorldTile, type WorldMapBiome } from '@/game/worldMap';
import StoneSoupDungeon from '@/game/StoneSoupDungeon';
import { advanceTownsfolk, createTownsfolk, reanchorTownsfolk, snapTownsfolk, restoreTownsfolk, serializeTownsfolk, isTownsfolkSave, buildMosslightHousing, cottageDoorways, mosslightObstacles, interiorAreaIdForCottage, cottageRectFor, type Townsperson, type TownsfolkAnchors, type TownsfolkPoint, type TownsfolkNavContext, type TownsfolkSave } from '@/game/townsfolk';
import { buildRoadLinks, travelersForChunk, type RoadArms, type RoadLink, type Traveler } from '@/game/travelers';
import { LANDMARKS } from '@/game/landmarks';
import {
  advanceCivilization,
  caravanPosition,
  caravanProgress,
  castleBySettlementId,
  civDayFloat,
  createCivilization,
  militaryPosition,
  militaryTarget,
  deserializeCivilization,
  kingdomLabelPoints,
  rulerById,
  rulerTarget,
  serializeCivilization,
  settlementById,
  settlementsByChunk,
  topProducedResources,
  tradeRoutePolylines,
  type CivilizationState,
  type WorldEvent,
} from '@/game/civilization';
import {
  createHorses,
  deserializeHorses,
  horseTarget,
  serializeHorses,
  type Horse,
  type HorseSettlement,
  type Stable,
} from '@/game/horses';
import { generateSettlementPopulation, type CharacterProfile } from '@/game/characterGen';
import { poisForChunk as modulePoisForChunk, treasureForPoi, monstersForPoiKind, type PointOfInterest, type PoiKind } from '@/game/pointsOfInterest';
import { spriteDefFor, animForMonsterState, monsterAnimFrameFor, resolveMonsterSprite } from '@/game/monsterSprites';
import { probeMonsterSheets, isMonsterSheetFailed, onMonsterSheetFailure } from './game/monsterSprites/sheetProbe';
import { MONSTER_SPAWN_TABLE } from '@/game/monsterSpawns';
import { advanceSimulatedAdventurers, initialSimulatedAdventurers, spawnDueAdventurer, type SimulatedAdventurer } from '@/game/simulatedAdventurers';
import { isInMeleeArc } from '@/game/combat';
import { renderGroundDetail, type GroundDetailSpec } from '@/game/groundDetail';
import { updateGoat, type GoatAIState, GOAT_ATTACK_WINDUP_MS, gearForMonster, bonesForMonster } from '@/game/ai';
import { STATION_DRIVERS, stopDriverFor, driverOnDuty, chunkDistance, carriagePrice, carriageTravelHours, carriageTravelTicks, serializeCarriage, deserializeCarriage, type CarriageStation, type CarriageStop, type CarriageDestination, type StationLayout } from '@/game/carriage';
import { TAVERN_ANNEX_RECTS, BEER_PRICE, ROOM_PRICE, ESCORT_PRICE, LOCKPICK_PRICE, ESCORT_BONUS_XP, beerDamageMultiplier } from '@/game/tavern';
import { QUESTS, questById, startQuest, availableQuests, advanceQuestStage, questProgressText, questRumors, serializeQuestStates, parseQuestStates, markerForGiver, type QuestState, type QuestEvent, type QuestDef } from '@/game/quests';
import { chestsForChunk, attemptLockpick, serializeOpenedChests, parseOpenedChests, type LockedChest } from '@/game/lockpicking';
import { sitesForActiveStages, resolveSiteChunk, chunkSatisfiesStage, type ActiveQuestStage } from '@/game/questSites';
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
const BUILD_NUMBER = '342';
// Field size in world units. Chunks are FIELD_SIZE x FIELD_SIZE; the camera
// follows the player with a slight zoom so each area feels large to explore.
const FIELD_SIZE = 140;
// BUILD 327: default gameplay zoom is 225%. When zoomed, the world layer is
// scaled around the top-left corner and translated so the player's field
// position lands at the viewport center:
//   screen = zoom * layer + (0.5 - zoom * playerFrac) * size
// The player sprite keeps its own scale(gameZoom) so it matches NPC size.
const DEFAULT_GAME_ZOOM = 2.25;
function zoomTranslatePct(playerFrac: number, zoom: number): number {
  return (0.5 - zoom * playerFrac) * 100;
}
function screenPxToFieldUnits(screenPx: number, sizePx: number, playerFrac: number, zoom: number): number {
  const t = (zoomTranslatePct(playerFrac, zoom) / 100) * sizePx;
  return (((screenPx - t) / zoom) / sizePx) * FIELD_SIZE;
}
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
  return formatClockDisplay(clock);
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

const mapLandmarks = LANDMARKS;

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

// BUILD 342: organic screenshot-style town generator. Houses cluster along
// the world road arms with varied setbacks and sizes, like a hand-built
// tilemap town. The pure placement logic lives in game/organicTowns.ts;
// this wrapper scales rects to field units.
function organicTownRects(
  variantSeed: number,
  variant: number,
  road: string,
  toBuilding: (r: FieldRect) => FieldRect,
): FieldRect[] {
  return organicTownSpecs(variantSeed, variant, road).map((r) => toBuilding(r));
}

function fieldHouseRects(kind: SettlementKind, startingArea = false, variantSeed = 0, road = 'nesw'): FieldRect[] {
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
  // Unique layouts per town: variant cycles 1-3 based on location seed.
  // BUILD 342: organic screenshot-style towns — houses cluster along the
  // world road arms with varied setbacks and sizes, like a hand-built
  // tilemap town. Variant 1 = town (10-13 houses), 2 = village (8-11),
  // 3 = hamlet (6-9, wider spacing). Houses never sit on the road.
  const variant = startingArea ? 0 : (Math.abs(variantSeed) % 3) + 1;
  if (variant >= 1) {
    return organicTownRects(variantSeed, variant, road, toBuilding);
  }
  // Four corners (starting area default). All four stone cottages.
  // Positions hardcoded from the user's 2026-09-30 mover screenshot
  // ("Move them here"): tutorial 41.2,53.2 / crafting 94.3,54.3 /
  // chapel 40.3,85.1 / fourth 88.1,85.5 — true field coordinates.
  // Each house is 7 x 4.8 field units.
  return [
    { left: 41.2, top: 53.2, right: 48.2, bottom: 58.0 },   // tutorial house
    { left: 94.3, top: 54.3, right: 101.3, bottom: 59.1 },  // wayfarer guild
    { left: 40.3, top: 85.1, right: 47.3, bottom: 89.9 },   // rootbound chapel
    { left: 88.1, top: 85.5, right: 95.1, bottom: 90.3 },   // stone house
    // BUILD 311: residential cottages (housing registry) — 2 beds each.
    { left: 14, top: 62, right: 20, bottom: 66.5 },   // cottage 1 (west)
    { left: 14, top: 74, right: 20, bottom: 78.5 },   // cottage 2 (west)
    { left: 14, top: 86, right: 20, bottom: 90.5 },   // cottage 3 (west)
    { left: 62, top: 22, right: 68, bottom: 26.5 },   // cottage 4 (north)
    { left: 76, top: 22, right: 82, bottom: 26.5 },   // cottage 5 (north)
    { left: 90, top: 22, right: 96, bottom: 26.5 },   // cottage 6 (north)
  ];
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
  const houseRects = landmark ? fieldHouseRects(landmark.kind, isStartingArea(chunk), chunk.x * 31 + chunk.y * 17, road) : [];
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

  // BUILD 342: dense forest clusters ring non-starting towns, like the
  // hand-built reference — 3 clusters of 4-6 trees near the chunk edges,
  // clear of houses, roads, and each other.
  if (landmark && (landmark.kind === 'town' || landmark.kind === 'village') && !startingCenter) {
    let cseed = Math.abs((chunk.x * 15485863) ^ (chunk.y * 32452843)) + 7;
    const crandom = () => {
      const value = Math.sin(cseed++) * 10000;
      return value - Math.floor(value);
    };
    for (let c = 0; c < 3; c++) {
      const edge = Math.floor(crandom() * 4); // 0=N, 1=S, 2=W, 3=E
      const ccx = edge === 2 ? 16 + crandom() * 10 : edge === 3 ? FIELD_SIZE - 26 + crandom() * 10 : 20 + crandom() * (FIELD_SIZE - 40);
      const ccy = edge === 0 ? 14 + crandom() * 10 : edge === 1 ? FIELD_SIZE - 24 + crandom() * 10 : 20 + crandom() * (FIELD_SIZE - 40);
      const clusterCount = 4 + Math.floor(crandom() * 3);
      for (let i = 0; i < clusterCount; i++) {
        const x = ccx + (crandom() - 0.5) * 22;
        const y = ccy + (crandom() - 0.5) * 22;
        if (x < 8 || y < 8 || x > FIELD_SIZE - 8 || y > FIELD_SIZE - 8) continue;
        const scale = 0.72 + crandom() * 0.48;
        const center = { x: x + 3.2 * scale, y: y + 2.5 * scale };
        const tooCloseToBuilding = allHouseRects.some((rect) => pointInRect(center, rect, 5));
        const tooCloseToTree = trees.some((tree) => Math.hypot(center.x - (tree.x + 3.2 * tree.scale), center.y - (tree.y + 2.5 * tree.scale)) < 9);
        const tooCloseToRoad = pointOnFieldRoad(center, road);
        if (tooCloseToBuilding || tooCloseToTree || tooCloseToRoad) continue;
        const variant = Math.floor(crandom() * 4);
        const sprite = envSpriteForTerrain(mapTileFor(chunk).terrain, variant);
        if (sprite === 'grass1' || sprite === 'grass2') continue;
        trees.push({ id: trees.length, x, y, scale, variant, style: treeStyle, sprite });
      }
    }
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
  const houseRects = landmark ? fieldHouseRects(landmark.kind, isStartingArea(chunk), chunk.x * 31 + chunk.y * 17, tile.road) : [];
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

function isFieldPositionBlocked(position: Point, chunk: Point, houseOffsets?: Record<string, Point>) {
  const tile = mapTileFor(chunk);
  if (pointInWater(position, tile)) return true;

  const treeBlocked = fieldTreesFor(chunk).some((tree) => !felledTreeKeys.has(fieldTreeKey(chunk, tree.id)) && !editorDeletedTreeKeys.has(fieldTreeKey(chunk, tree.id)) && pointInRect(position, fieldTreeBaseRect(tree), 0.45));
  if (treeBlocked) return true;

  // Rusty Tankard annexes are solid in the starting town.
  if (chunk.x === 4 && chunk.y === 7) {
    if (TAVERN_ANNEX_RECTS.some((r) => pointInRect(position, r, 0.45))) return true;
  }

  // Carriage stations/stops: house, stable and the carriage itself are solid.
  const station = getCarriageStation(chunk);
  if (station) {
    const l = station.layout;
    if (pointInRect(position, carriageHouseRect(l.house), 0.45) || pointInRect(position, carriageStableRect(l.stable), 0.45) || pointInRect(position, carriageCartRect(l.carriage), 0.45)) return true;
  } else {
    const stop = getCarriageStop(chunk);
    if (stop && pointInRect(position, carriageCartRect(stop.carriage), 0.45)) return true;
  }

  // Debug world editor (BUILD 274): user-placed houses/trees/rocks are solid
  // in normal play. Skipped while the editor is open (moveHouses) so the user
  // can walk freely while laying out, like generated-house collision.
  if (!moveHouses && editorSolids.length > 0) {
    const chunkKey = chunk.x + ',' + chunk.y;
    const placedBlocked = editorSolids.some((s) => s.chunk === chunkKey && pointInRect(position, {
      left: s.x - s.w / 2, top: s.y - s.h / 2, right: s.x + s.w / 2, bottom: s.y + s.h / 2,
    }, 0.35));
    if (placedBlocked) return true;
  }

  const landmark = tile.landmark;
  // Keep the visible building/base solid, but do not extend its collision far
  // into the surrounding grass where it reads as a random invisible wall.
  // In mover mode (?moveHouses=1), skip building collision so the user can
  // walk freely while positioning houses.
  // If house offsets are provided (mover mode), collision follows the visual —
  // the solid area is attached to the house, not a stagnant separate position.
  if (!moveHouses && landmark) {
    const rects = fieldHouseRects(landmark.kind, isStartingArea(chunk), Math.round(chunk.x) * 31 + Math.round(chunk.y) * 17, mapTileFor(chunk).road);
    const doorways = buildingDoorwaysFor(chunk);
    const blocked = rects.some((rect, index) => {
      const doorway = doorways[index];
      const off = (doorway && houseOffsets?.[doorway.id]) || { x: 0, y: 0 };
      const movedRect = {
        left: rect.left + off.x,
        top: rect.top + off.y,
        right: rect.right + off.x,
        bottom: rect.bottom + off.y,
      };
      return pointInRect(position, movedRect, 0.35);
    });
    if (blocked) return true;
  }

  // Farmhouses are solid enterable buildings too.
  if (!moveHouses && !landmark && ['meadow', 'grassland', 'greenvale'].includes(tile.terrain)) {
    if (fieldFarmRects(chunk.x, chunk.y).houses.some((rect) => pointInRect(position, rect, 0.35))) return true;
  }

  // Mosslight Crossing fountain: decorative only, no collision.
  // (Collision removed — was causing invisible wall reports.)

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

function resolveFieldMovement(current: Point, movement: Point, chunk: Point, goats: GoatState[] = [], houseOffsets?: Record<string, Point>) {
  const candidates = [
    { x: current.x + movement.x, y: current.y + movement.y },
    { x: current.x + movement.x, y: current.y },
    { x: current.x, y: current.y + movement.y },
  ];
  for (const candidate of candidates) {
    const wrapped = wrapFieldPosition(candidate, chunk);
    if (wrapped && !isFieldPositionBlocked(wrapped.position, wrapped.chunk, houseOffsets) && !isPositionOccupiedByGoat(wrapped.position, goats)) return wrapped;
  }
  return null;
}

type InteriorArea = { id: string; name: string; description: string; roomType: 'guild' | 'inn' | 'chapel' | 'building' | 'prison' | 'tavern' | 'cellar'; exteriorPosition: Point };
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
type Doorway = { id: string; position: Point; area: InteriorArea; buildingIndex?: number; rect: { left: number; top: number; right: number; bottom: number } };
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
    return fieldHouseRects(landmark.kind, isStartingArea(chunk), Math.round(chunk.x) * 31 + Math.round(chunk.y) * 17, mapTileFor(chunk).road).map((rect, index) => {
      // BUILD 239: All starting-area houses are the new stone style with
      // prominent entrances. Door position matches the new visual.
      const isNewStyleHouse = isStartingArea(chunk) && index < 4;
      const position = isNewStyleHouse ? newHouseDoorPosition(rect) : fieldDoorPosition(rect);
      // Stable IDs for the starting-area buildings so save games and the
      // starting interior keep working; positions are always computed.
      const stableId = isStartingArea(chunk) && index === 0 ? 'tutorial-house-door'
        : isStartingArea(chunk) && index === 1 ? 'crafting-guild-door'
        : isStartingArea(chunk) && index === 2 ? 'chapel-door'
        : isStartingArea(chunk) && index === 3 ? 'fourth-house-door'
        : chunk.x + ',' + chunk.y + '-building-' + index;
      const stableAreaId = isStartingArea(chunk) && index === 0 ? 'tutorial-house'
        : isStartingArea(chunk) && index === 1 ? 'wayfarer-guild'
        : isStartingArea(chunk) && index === 2 ? 'rootbound-chapel'
        : isStartingArea(chunk) && index === 3 ? 'fourth-house'
        : chunk.x + '-' + chunk.y + '-building-' + index;
      const stableName = isStartingArea(chunk) && index === 0 ? 'Tutorial House'
        : isStartingArea(chunk) && index === 1 ? 'Wayfarer Guild'
        : isStartingArea(chunk) && index === 2 ? 'Rootbound Chapel'
        : isStartingArea(chunk) && index === 3 ? 'The Rusty Tankard'
        : landmark.name + ' House ' + (index + 1);
      return {
        id: stableId,
        position,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        area: {
          id: stableAreaId,
          name: stableName,
          description: isStartingArea(chunk) && index === 0 ? 'A small safe house on the tutorial island.'
            : isStartingArea(chunk) && index === 1 ? 'A workbench, maps, and road-worn notices fill the guild hall.'
            : isStartingArea(chunk) && index === 2 ? 'Lanterns glow beneath old roots in the quiet town chapel.'
            : isStartingArea(chunk) && index === 3 ? 'A cozy tavern with a long oak bar. Mira serves ale and gossip.'
            : 'A simple brown room waiting to be furnished.',
          roomType: (isStartingArea(chunk) && index === 0 ? 'inn' : isStartingArea(chunk) && index === 1 ? 'guild' : isStartingArea(chunk) && index === 2 ? 'chapel' : isStartingArea(chunk) && index === 3 ? 'tavern' : 'building') as const,
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
  // Spawn just south of the house's collision rect (the door itself is inside
  // the solid rect, so spawning exactly at it would trap the player). Aligned
  // with the door's x and inside the entry trigger zone (2.5 units south of
  // the door), so leaving a building drops you at its entrance and walking
  // back north re-enters — never out in the grass.
  // BUILD 265: was rect.bottom + 1.2, which landed outside the trigger zone.
  return { x: doorway.x, y: Math.min(FIELD_SIZE - 6, rect.bottom + 0.7) };
}

const STARTING_DOORWAY_ID = 'tutorial-house-door';
const startingHouse = buildingDoorwaysFor({ x: 4, y: 7 }).find((doorway) => doorway.id === STARTING_DOORWAY_ID)?.area || {
  id: 'tutorial-house',
  name: 'Tutorial House',
  description: 'A small safe house on the tutorial island.',
  roomType: 'inn' as const,
  exteriorPosition: { x: 44.7, y: 58.7 },
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
// Debug visualization: draw RED=building collision, BLUE=door interaction,
// GREEN=exit spawn over the field so door/logic alignment is visible.
// Can be enabled via ?debugDoors=1 URL or the Debug menu. Module-level so the
// tap-mark overlay (outside the component) can read it.
let debugDoors: boolean = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugDoors') === '1';
// Visual house mover: can be enabled via ?moveHouses=1 URL or the Debug menu.
// Module-level so collision functions (outside the component) can read it.
let moveHouses: boolean = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('moveHouses') === '1';

// Debug world editor (BUILD 274): user-placed solid objects (houses, trees,
// rocks). GameField syncs this from its placed-objects state so the
// module-level collision check can see them. Roads are walkable (no entry).
// Solids are skipped while the editor is open (moveHouses) so the user can
// walk freely while laying out, exactly like generated-house collision.
// Pure helpers live in ./game/worldEditor.ts (unit-tested in simulate.ts).
export let editorSolids: EditorSolid[] = [];

function fieldDoorPosition(rect: FieldRect): Point {
  // Match .field-house::after: left 43%, width 16%, bottom 0, height 44%.
  return {
    x: rect.left + (rect.right - rect.left) * 0.51,
    y: rect.top + (rect.bottom - rect.top) * 0.78,
  };
}

function newHouseDoorPosition(rect: FieldRect): Point {
  // Match .field-house.new-house::after: left 38%, width 24%, bottom 0, height 55%.
  // Door center x: 38% + 12% = 50%. Door center y: 100% - 27.5% = 72.5%.
  return {
    x: rect.left + (rect.right - rect.left) * 0.50,
    y: rect.top + (rect.bottom - rect.top) * 0.725,
  };
}

function doorwayTriggerDims(rect: { left: number; right: number }): { xTol: number } {
  // Hard-lock the trigger to the visual doorway: the CSS door (::after) is
  // 24% of the house width, centered. Trigger x-tolerance = half the visual
  // door width plus a tiny padding so it feels precise, not loose.
  const halfDoorWidth = (rect.right - rect.left) * 0.12;
  return { xTol: halfDoorWidth + 0.3 };
}

function doorwayNear(position: Point, chunk: Point, offsets?: Record<string, Point>) {
  // Only trigger when the player is south of the door (where entry is possible),
  // not on the sides or north of the house. The trigger is hard-locked to the
  // visual doorway dimensions — not a loose approximation.
  // If house offsets are provided (mover mode), the trigger follows the visual —
  // the entry point is attached to the house, not a stagnant separate position.
  const found = buildingDoorwaysFor(chunk).find((doorway) => {
    const off = offsets?.[doorway.id] || { x: 0, y: 0 };
    const dx = doorway.position.x + off.x;
    const dy = doorway.position.y + off.y;
    const movedRect = {
      left: doorway.rect.left + off.x,
      right: doorway.rect.right + off.x,
    };
    const { xTol } = doorwayTriggerDims(movedRect);
    return position.y > dy
      && position.y - dy <= 2.5
      && Math.abs(position.x - dx) <= xTol;
  });
  if (!found) return null;
  // Return a copy with the offset applied so entry/exit use the moved position.
  const off = offsets?.[found.id] || { x: 0, y: 0 };
  if (off.x === 0 && off.y === 0) return found;
  return {
    ...found,
    position: { x: found.position.x + off.x, y: found.position.y + off.y },
    rect: {
      left: found.rect.left + off.x,
      top: found.rect.top + off.y,
      right: found.rect.right + off.x,
      bottom: found.rect.bottom + off.y,
    },
    area: {
      ...found.area,
      exteriorPosition: {
        x: found.area.exteriorPosition.x + off.x,
        y: found.area.exteriorPosition.y + off.y,
      },
    },
  };
}

function canEnterDoorway(currentPosition: Point, nextPosition: Point, doorway: Doorway, direction: Direction) {
  // Hard-locked to the visual doorway: same x-tolerance as the prompt, and the
  // player must be moving up from just south of the door into the trigger zone.
  // The doorway passed in already has mover offsets applied (from doorwayNear).
  const { xTol } = doorwayTriggerDims(doorway.rect);
  return direction === 'up'
    && currentPosition.y > doorway.position.y
    && nextPosition.y <= doorway.position.y + 2.5
    && Math.abs(nextPosition.x - doorway.position.x) <= xTol;
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
  tavern: [
    { left: 11, top: 7, right: 83, bottom: 22 }, // bar counter
    { left: 21, top: 24, right: 30, bottom: 34 }, // stool 1
    { left: 43, top: 24, right: 53, bottom: 34 }, // stool 2
    { left: 66, top: 24, right: 75, bottom: 34 }, // stool 3
    { left: 13, top: 54, right: 32, bottom: 71 }, // round table 1
    { left: 63, top: 59, right: 82, bottom: 76 }, // round table 2
    { left: 84, top: 9, right: 96, bottom: 26 }, // barrel 1
    { left: 84, top: 26, right: 96, bottom: 43 }, // barrel 2
  ],
  prison: [
    { left: 12, top: 30, right: 32, bottom: 50 }, // straw bed
    { left: 68, top: 60, right: 88, bottom: 80 }, // sewer grate (interactable, not blocking)
    { left: 40, top: 8, right: 60, bottom: 20 }, // cell bars (wall)
  ],
  cellar: [
    { left: 8, top: 18, right: 20, bottom: 40 }, // barrel row west
    { left: 80, top: 18, right: 92, bottom: 40 }, // barrel row east
    { left: 10, top: 66, right: 26, bottom: 84 }, // grain sacks
    { left: 74, top: 66, right: 90, bottom: 84 }, // crate stack
    // The entry ladder (x 44..56, bottom) stays walkable: it is the exit.
  ],
};

function isInteriorPositionBlocked(position: Point, area: InteriorArea) {
  return (interiorFurnitureCollision[area.roomType] || []).some((rect) => pointInRect(position, rect));
}

// BUILD 326: the Rusty Tankard's cellar — the real destination for the
// "Rats in the Cellar" quest. Entered through the hatch in the tavern (not a
// field doorway), exited back up to the tavern; exteriorPosition unused.
const TANKARD_CELLAR_AREA: InteriorArea = {
  id: 'rusty-tankard-cellar',
  name: 'Tankard Cellar',
  description: 'A low, earthy cellar beneath the Rusty Tankard. Something rustles between the barrels.',
  roomType: 'cellar',
  exteriorPosition: { x: 70, y: 70 },
};

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
type GameInventory = { coins: number; goatHorns: number; fabric: number; daggers: number; cloths: number; bone: number; pelt: number; fang: number; corn: number; wood: number; silk: number; bow: number; beer: number; lockpicks: number };
type GoatLoot = Partial<GameInventory>;
type DroppedLoot = { id: number; chunk: Point; position: Point; loot: GoatLoot };
// Ranged combat: arrows fired by the player's bow and by bandit archers.
type ArrowState = { id: number; chunk: Point; position: Point; dx: number; dy: number; traveled: number; damage: number; critical: boolean; hostile: boolean };
const ARROW_SPEED = 55; // field units per second
const ARROW_RANGE = 34;
const BOW_ARROW_DAMAGE_MULT = 0.9;
// Woodcutting: trees take a few axe swings, become stumps, then regrow.
// Woodcutting: felled trees become walkable stumps until they regrow.
// Session-local; GameField syncs this set whenever a tree falls or regrows.
const TREE_HITS_TO_FELL = 3;
const TREE_REGROW_MS = 5 * 60 * 1000;
const fieldTreeKey = (chunk: Point, treeId: number) => chunk.x + ',' + chunk.y + ':' + treeId;
const felledTreeKeys = new Set<string>();
// Debug world editor (BUILD 305): generated trees/rocks the user deleted in
// the editor, as fieldTreeKey strings. Synced from component state below.
const editorDeletedTreeKeys = new Set<string>();
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
type MonsterKind = 'goblin' | 'bandit' | 'skeleton' | 'troll' | 'snake' | 'spider' | 'dragon' | 'orc' | 'soldier' | 'wolf' | 'slime' | 'bat' | 'rat';
type MonsterState = GoatState & { kind: MonsterKind; variant?: string; ranged?: boolean; gear: GoatLoot };
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
const initialInventory: GameInventory = { coins: 0, goatHorns: 0, fabric: 0, daggers: 0, cloths: 0, bone: 0, pelt: 0, fang: 0, corn: 0, wood: 0, silk: 0, bow: 0, beer: 0, lockpicks: 0 };

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
  equippedBow?: boolean;
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
  townsfolk: TownsfolkSave[];
  goats: GoatState[];
  interiorId: string | null;
  interiorPosition: Point;
  inPrison?: boolean;
  prisonState?: { foundShiv: boolean; talkedToPrisoner: boolean; helpedPrisoner: boolean; escapeRoute: 'sewer' | 'gate' | null };
  journal?: JournalState;
  reputation?: ReputationState;
  dialogue?: {
    disposition?: Record<string, number>;
    wantedMosslight?: number;
  };
  carriage?: { earnings?: Record<string, number> };
  carriageTravel?: { destName: string; destChunk: Point; arrival: Point; totalTicks: number; doneTicks: number };
  escortHired?: boolean;
  questLog?: string;
  openedChests?: string;
  lootedPois?: string;
  civ?: string;
  horses?: unknown;
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
const saveAdventurerClasses = ['Beginner', 'Ranger', 'Mage', 'Rogue', 'Warrior'];

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
    && (value.corn == null || isFiniteNumber(value.corn))
    && (value.wood == null || isFiniteNumber(value.wood))
    && (value.silk == null || isFiniteNumber(value.silk))
    && (value.bow == null || isFiniteNumber(value.bow))
    && (value.beer == null || isFiniteNumber(value.beer));
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
    && Object.entries(value.loot).every(([key, amount]) => ['coins', 'goatHorns', 'fabric', 'daggers', 'cloths', 'wood', 'silk', 'bow'].includes(key) && isFiniteNumber(amount) && amount >= 0);
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
    && (value.equippedBow === undefined || typeof value.equippedBow === 'boolean')
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
    && (value.townsfolk === undefined || (Array.isArray(value.townsfolk) && value.townsfolk.every(isTownsfolkSave)))
    && Array.isArray(value.goats)
    && value.goats.every(isGoatSave)
    && (value.interiorId === null || typeof value.interiorId === 'string')
    && isSavePoint(value.interiorPosition)
    && (value.inPrison === undefined || typeof value.inPrison === 'boolean')
    && (value.prisonState === undefined || (isRecord(value.prisonState) && typeof value.prisonState.foundShiv === 'boolean' && typeof value.prisonState.talkedToPrisoner === 'boolean' && typeof value.prisonState.helpedPrisoner === 'boolean' && (value.prisonState.escapeRoute === null || value.prisonState.escapeRoute === 'sewer' || value.prisonState.escapeRoute === 'gate')))
    && (value.journal === undefined || isRecord(value.journal))
    && (value.reputation === undefined || isRecord(value.reputation))
    && (value.dialogue === undefined || isRecord(value.dialogue))
    && typeof value.time === 'string'
    && Array.isArray(value.logs)
    && value.logs.every((log) => isRecord(log) && typeof log.text === 'string' && typeof log.color === 'string')
    && (value.brainState === null || isBrainStateSave(value.brainState))
    && (value.civ === undefined || typeof value.civ === 'string');
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
type CraftItem = 'dagger' | 'cloths' | 'bow';
const craftRecipes: Record<CraftItem, { name: string; description: string; cost: GoatLoot; reward: GoatLoot }> = {
  dagger: { name: 'Goat-horn dagger', description: 'A sharp beginner weapon.', cost: { goatHorns: 2 }, reward: { daggers: 1 } },
  cloths: { name: 'Field cloths', description: 'Simple protective travel clothes.', cost: { fabric: 2 }, reward: { cloths: 1 } },
  bow: { name: 'Hunting bow', description: 'A ranged weapon. Chop trees for wood, gather silk from spiders.', cost: { wood: 5, silk: 3 }, reward: { bow: 1 } },
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
    case 'bandit': return { coins: 3 + Math.floor(Math.random() * 5), fabric: Math.random() < 0.5 ? 1 : 0, bone: 1, lockpicks: Math.random() < 0.35 ? 1 : 0 };
    case 'skeleton': return { bone: 1 + Math.floor(Math.random() * 2), coins: Math.random() < 0.5 ? 1 : 0 };
    case 'troll': return { pelt: 1, coins: 2 + Math.floor(Math.random() * 4) };
    case 'snake': return { fang: 1, coins: Math.random() < 0.3 ? 1 : 0 };
    case 'spider': return { silk: 2 + Math.floor(Math.random() * 2), fang: Math.random() < 0.5 ? 1 : 0 };
    case 'dragon': return { pelt: 2, fang: 2, coins: 10 + Math.floor(Math.random() * 10) };
    case 'orc': return { pelt: 1, coins: 2 + Math.floor(Math.random() * 4) };
    case 'soldier': return { coins: 3 + Math.floor(Math.random() * 4), fabric: Math.random() < 0.5 ? 1 : 0 };
    case 'wolf': return { pelt: 1, fang: Math.random() < 0.5 ? 1 : 0 };
    case 'slime': return { coins: Math.random() < 0.4 ? 1 : 0 };
    case 'bat': return { fang: 1, coins: Math.random() < 0.2 ? 1 : 0 };
    case 'rat': return { coins: Math.random() < 0.3 ? 1 : 0 };
  }
}
function monstersForChunk(chunk: Point, playerLevel = 1): MonsterState[] {  const terrain = mapTileFor(chunk).terrain;
  if (terrain === 'ocean') return [];
  const danger = dangerForChunk(chunk);
  const monsters: MonsterState[] = [];
  let id = 0;
  const spawn = (kind: MonsterKind, index: number, seedSalt: number, hpMult: number, variantPool?: string[]) => {
    const seed = Math.abs(chunk.x * 173 + chunk.y * 227 + index * 89 + seedSalt);
    const position = { x: 16 + ((seed * 43) % (FIELD_SIZE - 32)), y: 16 + ((seed * 61) % (FIELD_SIZE - 32)) };
    if (isFieldPositionBlocked(position, chunk)) return;
    const level = monsterLevelForChunk(chunk, index, playerLevel);
    const maxHp = Math.round(goatMaxHpForLevel(level) * hpMult);
    const variant = variantPool ? variantPool[seed % variantPool.length] : 'default';
    // Bows aren't just for bandits: some goblins and orcs fight at range too.
    const ranged = (kind === 'bandit' && seed % 3 === 0) || (kind === 'goblin' && seed % 4 === 0) || (kind === 'orc' && seed % 5 === 0);
    monsters.push({
      id: id++,
      kind,
      variant,
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
      ranged,
      // Wielded gear: always dropped on death, RuneScape-style.
      gear: gearForMonster(kind, variant, ranged),
    });
  };
  // Goblins: forest packs in deep wilderness (danger 2+).
  if (terrain === 'forest' && danger >= 2) {
    const packSize = 2 + (Math.abs(chunk.x * 7 + chunk.y * 13) % 2);
    for (let i = 0; i < packSize; i++) spawn('goblin', i, 5000, 0.8, ['default', 'default', 'warrior', 'shaman']);
  }
  // Bandits: near roads in outskirts and beyond (danger 1+).
  if (danger >= 1 && mapTileFor(chunk).road !== 'none') {
    const count = 1 + (Math.abs(chunk.x * 11 + chunk.y * 17) % 2);
    for (let i = 0; i < count; i++) spawn('bandit', i, 6000, 1.2);
  }
  // Skeletons: undead in rocky ruins and deep wilderness (danger 2+).
  if ((terrain === 'rock' || terrain === 'desert') && danger >= 2) {
    const count = 1 + (Math.abs(chunk.x * 13 + chunk.y * 19) % 2);
    for (let i = 0; i < count; i++) spawn('skeleton', i, 7000, 1.0, ['default', 'warrior', 'mage']);
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
  // Civ phase 15: monster ecology — POI dens. A POI's haunting monsters
  // (caves: goblins/bats/spiders; crypts/cemeteries: skeletons; bandit camps:
  // bandits) spawn clustered near the POI with a small den roam radius.
  const spawnDen = (kind: MonsterKind, at: Point, seed: number, hpMult: number) => {
    const denPos = {
      x: Math.min(FIELD_SIZE - 8, Math.max(8, at.x + (seed % 21) - 10)),
      y: Math.min(FIELD_SIZE - 8, Math.max(8, at.y + ((seed >> 5) % 21) - 10)),
    };
    if (isFieldPositionBlocked(denPos, chunk)) return;
    const level = monsterLevelForChunk(chunk, seed % 7, playerLevel);
    const maxHp = Math.round(goatMaxHpForLevel(level) * hpMult);
    const ranged = (kind === 'bandit' && seed % 3 === 0) || (kind === 'goblin' && seed % 4 === 0);
    monsters.push({
      id: id++,
      kind,
      variant: 'default',
      position: denPos,
      spawnPosition: { ...denPos },
      roamRadius: 12,
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
      ranged,
      gear: gearForMonster(kind, 'default', ranged),
    });
  };
  for (const poi of modulePoisForChunk(chunk, DEFAULT_WORLD_SEED, {})) {
    const kinds = monstersForPoiKind(poi.kind as PoiKind).filter((k) => (['goblin','bandit','skeleton','spider','wolf','slime','bat','rat'] as string[]).includes(k));
    if (kinds.length === 0) continue;
    const denSeed = Math.abs(chunk.x * 311 + chunk.y * 347 + poi.id.length * 53);
    const denSize = 1 + (denSeed % 2);
    for (let i = 0; i < denSize; i++) {
      const kind = kinds[(denSeed + i) % kinds.length] as MonsterKind;
      spawnDen(kind, poi.position, denSeed + i * 101, kind === 'skeleton' ? 1.0 : 0.8);
    }
  }
  // Soldiers: rogue sellswords ambushing roads in the outskirts (danger 1+), rarer than bandits.
  if (danger >= 1 && mapTileFor(chunk).road !== 'none' && Math.abs(chunk.x * 5 + chunk.y * 11) % 2 === 0) {
    spawn('soldier', 0, 13000, 1.1);
  }
  // Sprite-sheet monsters (wolf/slime/bat/rat): data-driven biome placement.
  for (const spec of MONSTER_SPAWN_TABLE) {
    if (danger < spec.minDanger || !spec.biomes.includes(terrain)) continue;
    const count = spec.packBase + (Math.abs(chunk.x * spec.seedMulX + chunk.y * spec.seedMulY) % spec.packVar);
    for (let i = 0; i < count; i++) {
      const vSeed = Math.abs(chunk.x * 173 + chunk.y * 227 + i * 89 + spec.seedSalt);
      const variant = spec.eliteVariant && danger >= spec.eliteVariant.minDanger && vSeed % 3 === 0
        ? spec.eliteVariant.variant
        : spec.variants[vSeed % spec.variants.length];
      spawn(spec.kind as MonsterKind, i, spec.seedSalt, spec.hpMult, [variant]);
    }
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

// Noah, Damon and Shawn now drink in the Rusty Tankard (fourth house) — removed from the field.
const startingTownNpcs: TownNpc[] = [];

// Get where an NPC should be based on the time of day
function npcScheduleTarget(npc: TownNpc, hour: number): Point {
  if (hour >= 22 || hour < 6) return npc.home || npc.position; // Night: home
  if (hour >= 9 && hour < 17) return npc.work || npc.position; // Day: work
  return npc.leisure || npc.position; // Evening/morning: leisure
}

// Road arms for a chunk: which neighboring chunks continue the road network.
// Drives the analytic road-traffic simulation (living-world phase 8).
function roadArmsForChunk(chunk: Point): RoadArms {
  return {
    n: worldRoadAt(chunk.x, chunk.y - 1),
    s: worldRoadAt(chunk.x, chunk.y + 1),
    e: worldRoadAt(chunk.x + 1, chunk.y),
    w: worldRoadAt(chunk.x - 1, chunk.y),
  };
}

// Living-town anchors for Mosslight Crossing (chunk 4,7). Home doorsteps are
// derived from the live doorway rects + world-editor offsets, so townsfolk
// homes follow houses the player moves.
const TOWNSFOLK_CHUNK: Point = { x: 4, y: 7 };
function townsfolkAnchors(offsets: Record<string, Point>): TownsfolkAnchors {
  const doorways = buildingDoorwaysFor(TOWNSFOLK_CHUNK);
  const points: Record<string, TownsfolkPoint> = {};
  const doorstep = (id: string): TownsfolkPoint => {
    const doorway = doorways.find((d) => d.id === id);
    if (!doorway) return { x: 70, y: 70 };
    const off = offsets[id] || { x: 0, y: 0 };
    return {
      x: (doorway.rect.left + doorway.rect.right) / 2 + off.x,
      y: doorway.rect.bottom + 1.5 + off.y,
    };
  };
  points.guild = doorstep('crafting-guild-door');
  points.chapel = doorstep('chapel-door');
  points.tavern = doorstep('fourth-house-door');
  points.farm0 = { x: 30, y: 119 };
  points.farm1 = { x: 110, y: 119 };
  return {
    points,
    plaza: { x: 70, y: 82 },
    stalls: [{ x: 58, y: 64 }, { x: 82, y: 64 }],
    gardens: [{ x: 30, y: 108 }, { x: 110, y: 108 }],
    patrol: [{ x: 70, y: 24 }, { x: 118, y: 70 }, { x: 70, y: 116 }, { x: 22, y: 70 }],
  };
}

// ---------------------------------------------------------------------------
// Carriage fast-travel network (physical, world-integrated).
// Four full stations sit one chunk outside Mosslight Crossing (N/S/E/W), each
// with a house, stable, horse, carriage, driver NPC, sign, lanterns and
// hitching post. Every other town/village settlement gets a small carriage
// stop (sign + carriage + driver) at a deterministic roadside spot, so fast
// travel always connects real world locations. Positions derive from the chunk
// coordinate system and nudge deterministically clear of trees/water; driver
// schedules are a pure function of the world clock; destination availability
// comes from the journal's discovered locations. Persistent by construction.
// ---------------------------------------------------------------------------
const CARRIAGE_STATION_CHUNKS: Record<'north' | 'south' | 'east' | 'west', Point> = {
  north: { x: 4, y: 6 },
  south: { x: 4, y: 8 },
  east: { x: 5, y: 7 },
  west: { x: 3, y: 7 },
};

// Base layouts in field units (road centerline = 70). The whole layout shifts
// deterministically if a solid would overlap a generated tree or water.
const CARRIAGE_BASE_LAYOUTS: Record<'north' | 'south' | 'east' | 'west', StationLayout> = {
  north: { house: { x: 98, y: 52 }, stable: { x: 98, y: 88 }, carriage: { x: 82, y: 70 }, horse: { x: 82, y: 60 }, driverPost: { x: 76, y: 70 }, sign: { x: 73, y: 62 }, hitching: { x: 89, y: 66 }, lanterns: [{ x: 91, y: 52 }, { x: 91, y: 88 }], arrival: { x: 70, y: 86 } },
  south: { house: { x: 42, y: 52 }, stable: { x: 42, y: 88 }, carriage: { x: 58, y: 70 }, horse: { x: 58, y: 60 }, driverPost: { x: 64, y: 70 }, sign: { x: 67, y: 62 }, hitching: { x: 51, y: 66 }, lanterns: [{ x: 49, y: 52 }, { x: 49, y: 88 }], arrival: { x: 70, y: 86 } },
  east: { house: { x: 52, y: 98 }, stable: { x: 88, y: 98 }, carriage: { x: 70, y: 82 }, horse: { x: 60, y: 82 }, driverPost: { x: 70, y: 76 }, sign: { x: 61, y: 78 }, hitching: { x: 66, y: 89 }, lanterns: [{ x: 52, y: 92 }, { x: 88, y: 92 }], arrival: { x: 86, y: 70 } },
  west: { house: { x: 52, y: 42 }, stable: { x: 88, y: 42 }, carriage: { x: 70, y: 58 }, horse: { x: 60, y: 58 }, driverPost: { x: 70, y: 64 }, sign: { x: 79, y: 62 }, hitching: { x: 66, y: 51 }, lanterns: [{ x: 52, y: 48 }, { x: 88, y: 48 }], arrival: { x: 54, y: 70 } },
};

const carriageHouseRect = (p: Point): FieldRect => ({ left: p.x - 8, top: p.y - 5.5, right: p.x + 8, bottom: p.y + 5.5 });
const carriageStableRect = (p: Point): FieldRect => ({ left: p.x - 6.5, top: p.y - 4.5, right: p.x + 6.5, bottom: p.y + 4.5 });
const carriageCartRect = (p: Point): FieldRect => ({ left: p.x - 4.5, top: p.y - 3, right: p.x + 4.5, bottom: p.y + 3 });

function shiftStationLayout(layout: StationLayout, dx: number, dy: number): StationLayout {
  const shift = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  return { house: shift(layout.house), stable: shift(layout.stable), carriage: shift(layout.carriage), horse: shift(layout.horse), driverPost: shift(layout.driverPost), sign: shift(layout.sign), hitching: shift(layout.hitching), lanterns: layout.lanterns.map(shift), arrival: shift(layout.arrival) };
}

const carriageStationCache = new Map<string, CarriageStation | null>();
const carriageStopCache = new Map<string, CarriageStop | null>();

function getCarriageStation(chunk: Point): CarriageStation | null {
  const key = chunk.x + ',' + chunk.y;
  const cached = carriageStationCache.get(key);
  if (cached !== undefined) return cached;
  const dir = (Object.keys(CARRIAGE_STATION_CHUNKS) as Array<'north' | 'south' | 'east' | 'west'>)
    .find((d) => CARRIAGE_STATION_CHUNKS[d].x === chunk.x && CARRIAGE_STATION_CHUNKS[d].y === chunk.y);
  if (!dir) { carriageStationCache.set(key, null); return null; }
  const tile = mapTileFor(chunk);
  const trees = fieldTreesFor(chunk);
  const base = CARRIAGE_BASE_LAYOUTS[dir];
  const solidsOf = (l: StationLayout): FieldRect[] => [carriageHouseRect(l.house), carriageStableRect(l.stable), carriageCartRect(l.carriage)];
  let layout = base;
  const shifts: Array<[number, number]> = [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14], [14, 14], [-14, -14]];
  for (const [dx, dy] of shifts) {
    const candidate = shiftStationLayout(base, dx, dy);
    const solids = solidsOf(candidate);
    const clear = solids.every((r) =>
      !trees.some((t) => rectsOverlapCenter(r, fieldTreeBaseRect(t))) &&
      !pointInWater({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }, tile));
    if (clear) { layout = candidate; break; }
  }
  const station: CarriageStation = {
    id: 'carriage-station-' + dir,
    name: dir === 'north' ? 'North Road Carriage Station' : dir === 'south' ? 'South Road Carriage Station' : dir === 'east' ? 'East Road Carriage Station' : 'West Road Carriage Station',
    chunk, dir, driver: STATION_DRIVERS[dir], layout,
  };
  carriageStationCache.set(key, station);
  return station;
}

/** Small carriage stop at a town/village settlement (not Mosslight). */
function getCarriageStop(chunk: Point): CarriageStop | null {
  const key = chunk.x + ',' + chunk.y;
  const cached = carriageStopCache.get(key);
  if (cached !== undefined) return cached;
  const tile = mapTileFor(chunk);
  const landmark = tile?.landmark;
  if (!landmark || (landmark.kind !== 'town' && landmark.kind !== 'village') || (chunk.x === 4 && chunk.y === 7)) {
    carriageStopCache.set(key, null); return null;
  }
  const road = tile.road;
  const base: Point = (road.includes('n') || road.includes('s')) ? { x: 94, y: 70 }
    : (road.includes('e') || road.includes('w')) ? { x: 70, y: 94 } : { x: 94, y: 94 };
  const trees = fieldTreesFor(chunk);
  let sign = base;
  const shifts: Array<[number, number]> = [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12], [12, 12], [-12, -12]];
  for (const [dx, dy] of shifts) {
    const candidate = { x: base.x + dx, y: base.y + dy };
    const cart = carriageCartRect({ x: candidate.x + 10, y: candidate.y + 4 });
    const blocked = trees.some((t) => rectsOverlapCenter(cart, fieldTreeBaseRect(t))) || pointInWater(candidate, tile);
    if (!blocked) { sign = candidate; break; }
  }
  const stop: CarriageStop = {
    id: 'carriage-stop-' + key,
    settlementName: landmark.name, settlementKind: landmark.kind, chunk,
    driver: stopDriverFor(landmark.name, chunk),
    sign,
    carriage: { x: sign.x + 10, y: sign.y + 4 },
    horse: { x: sign.x + 10, y: sign.y - 3 },
    driverPost: { x: sign.x + 4, y: sign.y + 4 },
    arrival: { x: sign.x - 8, y: sign.y + 10 },
  };
  carriageStopCache.set(key, stop);
  return stop;
}

function rectsOverlapCenter(a: FieldRect, b: FieldRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Destinations reachable from a chunk: discovered settlements, priced by real chunk distance. */
function carriageDestinations(fromChunk: Point, discoveredNames: string[]): CarriageDestination[] {
  const out: CarriageDestination[] = [];
  for (const key of Object.keys(mapLandmarks)) {
    const lm = mapLandmarks[key];
    if (lm.kind !== 'town' && lm.kind !== 'village') continue;
    const [cx, cy] = key.split(',').map(Number);
    if (cx === fromChunk.x && cy === fromChunk.y) continue;
    const discovered = lm.name === 'Mosslight Crossing' || discoveredNames.includes(lm.name);
    const distance = chunkDistance(fromChunk, { x: cx, y: cy });
    out.push({ name: lm.name, kind: lm.kind, chunk: { x: cx, y: cy }, distance, price: carriagePrice(distance, lm.kind), travelHours: carriageTravelHours(distance), discovered });
  }
  return out.sort((a, b) => a.distance - b.distance);
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
function renderMapOverlay(
  tiles: AtlasTile[],
  cols: number,
  rows: number,
  tier: 0 | 1 | 2,
  showCoords: boolean,
  kingdomLabels: { text: string; x: number; y: number }[] = [],
  tradeRoutes: { id: string; name: string; points: { x: number; y: number }[] }[] = [],
): HTMLCanvasElement {
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
  }

  // Trade routes (civ phase 7): dashed amber lines at far zoom.
  if (tier === 0 && tradeRoutes.length > 0) {
    ctx.strokeStyle = 'rgba(196, 148, 72, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    for (const route of tradeRoutes) {
      ctx.beginPath();
      route.points.forEach((p, i) => {
        const cx = px(p.x) + T / 2;
        const cy = py(p.y) + T / 2;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  regionLabel('THE FAR MEADOW', 4, -3);
  regionLabel('THE EASTERN REACHES', 157, -19);

  // Kingdom names (civ phase 4): far zoom only, gold to read as political.
  if (tier === 0) {
    ctx.font = '800 13px Verdana, Geneva, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const stylable = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    stylable.letterSpacing = '6px';
    for (const kl of kingdomLabels) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(32, 26, 18, 0.9)';
      ctx.strokeText(kl.text, px(kl.x), py(kl.y));
      ctx.fillStyle = '#f2c66d';
      ctx.fillText(kl.text, px(kl.x), py(kl.y));
    }
    stylable.letterSpacing = '0px';
  }

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

function WorldMap({ chunk, onClose, kingdomLabels, tradeRoutes }: { chunk: Point; onClose: () => void; kingdomLabels: { text: string; x: number; y: number }[]; tradeRoutes: { id: string; name: string; points: { x: number; y: number }[] }[] }) {
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
    ctx.drawImage(renderMapOverlay(atlas.tiles, atlas.cols, atlas.rows, tierForZoom(zoom), mapDebug, kingdomLabels, tradeRoutes), 0, 0);
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
function InventorySheet({ inventory, equippedDagger, onToggleDagger, equippedBow, onToggleBow, playerStats, statPoints, onAssignStat, time, onOpenOptions, onClose, onDrinkBeer, beerBuffActive, questStates, questPlayerLevel, onAcceptQuest, onWeaveBowstring }: { inventory: GameInventory; equippedDagger: boolean; onToggleDagger: () => void; equippedBow: boolean; onToggleBow: () => void; playerStats: PlayerStats; statPoints: number; onAssignStat: (stat: StatKey) => void; time: string; onOpenOptions: () => void; onClose: () => void; onDrinkBeer: () => void; beerBuffActive: boolean; questStates: QuestState[]; questPlayerLevel: number; onAcceptQuest: (questId: string) => void; onWeaveBowstring: () => void }) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'equipment' | 'stats' | 'quests'>('inventory');
  const itemCount = inventory.goatHorns + inventory.fabric + inventory.daggers + inventory.cloths + inventory.bone + inventory.pelt + inventory.fang + inventory.corn + inventory.wood + inventory.silk + inventory.bow + inventory.beer;
  const visibleItems = [
    { key: 'goatHorns', label: 'Goat horns', detail: 'Crafting material', mark: '✦', className: 'horn-mark' },
    { key: 'fabric', label: 'Fabric', detail: 'Useful cloth', mark: '▤', className: 'fabric-mark' },
    { key: 'daggers', label: 'Goat-horn dagger', detail: 'Crafted weapon', mark: '†', className: 'dagger-mark' },
    { key: 'cloths', label: 'Field cloths', detail: 'Crafted gear', mark: '✚', className: 'cloths-mark' },
    { key: 'bone', label: 'Bone', detail: 'Skeleton remains', mark: '☠', className: 'bone-mark' },
    { key: 'pelt', label: 'Pelt', detail: 'Thick animal hide', mark: '❖', className: 'pelt-mark' },
    { key: 'fang', label: 'Fang', detail: 'Sharp monster fang', mark: '⸙', className: 'fang-mark' },
    { key: 'corn', label: 'Corn', detail: 'Harvested crop', mark: '🌽', className: 'corn-mark' },
    { key: 'wood', label: 'Wood', detail: 'Chopped from trees', mark: '🪵', className: 'wood-mark' },
    { key: 'silk', label: 'Silk', detail: 'Spider silk for bowstrings', mark: '🕸', className: 'silk-mark' },
    { key: 'bow', label: 'Hunting bow', detail: 'Ranged weapon', mark: '🏹', className: 'bow-mark' },
    { key: 'beer', label: 'Beer', detail: '+50% attack for 1 min', mark: '🍺', className: 'beer-mark' },
    { key: 'lockpicks', label: 'Lockpicks', detail: 'For locked chests', mark: '🗝', className: 'lockpick-mark' },
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
          <button className={'satchel-tab ' + (activeTab === 'quests' ? 'is-active' : '')} role="tab" aria-selected={activeTab === 'quests'} onClick={() => setActiveTab('quests')} data-testid="tab-quests">Quests</button>
        </div>
        <div className="inventory-body">
          {activeTab === 'inventory' ? (
            <>
              <div className="inventory-count">{itemCount > 0 ? itemCount + ' items carried' : 'Menu is empty'} · {inventory.coins} gold</div>
              <div className="inventory-grid">
                <div className="inventory-item" data-testid="inventory-coins"><span className="inventory-item-mark coin-mark" aria-hidden="true" /><span><strong>Coins</strong><small>Spendable gold</small></span><b>{inventory.coins}</b></div>
                {visibleItems.map((item) => {
                  const count = inventory[item.key as keyof GameInventory] as number;
                  return <div className="inventory-item" key={item.key} data-testid={'inventory-' + item.key}><span className={'inventory-item-mark ' + item.className} aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.detail}</small></span><b>{count}</b>{item.key === 'daggers' && <button className={'item-action ' + (equippedDagger ? 'is-equipped' : '')} onClick={onToggleDagger} data-testid="button-toggle-dagger">{equippedDagger ? 'Unequip' : 'Equip'}</button>}{item.key === 'bow' && <button className={'item-action ' + (equippedBow ? 'is-equipped' : '')} onClick={onToggleBow} data-testid="button-toggle-bow">{equippedBow ? 'Unequip' : 'Equip'}</button>}{item.key === 'beer' && <button className="item-action" onClick={onDrinkBeer} data-testid="button-drink-beer">Drink</button>}</div>;
                })}
              </div>
              {itemCount === 0 && <div className="inventory-empty"><Backpack size={30} strokeWidth={1.5} /><strong>Menu is empty</strong></div>}
            </>
          ) : activeTab === 'equipment' ? (
            <div className="equipment-panel" role="tabpanel" aria-label="Equipment"><div className="inventory-count">Equipped gear changes your character</div><div className="paper-doll-wrap"><div className="paper-doll" role="img" aria-label={'Paper doll: ' + (equippedDagger ? 'dagger in hand' : 'no weapon') + ', ' + (equippedBow ? 'bow on back' : 'no bow')} data-testid="paper-doll"><span className="paper-doll-head" aria-hidden="true" /><span className="paper-doll-torso" aria-hidden="true" /><span className="paper-doll-arm arm-left" aria-hidden="true" /><span className="paper-doll-arm arm-right" aria-hidden="true" /><span className="paper-doll-leg leg-left" aria-hidden="true" /><span className="paper-doll-leg leg-right" aria-hidden="true" />{equippedBow && <span className="paper-doll-bow" aria-hidden="true">🏹</span>}{equippedDagger && <span className="paper-doll-dagger" aria-hidden="true">†</span>}</div><div className="paper-doll-slots"><div className={'equipment-slot ' + (equippedDagger ? 'is-equipped' : '')} data-testid="equipment-weapon-slot"><span className="equipment-slot-mark dagger-mark">†</span><span><small>Weapon slot</small><strong>{equippedDagger ? 'Goat-horn dagger' : 'Empty'}</strong></span>{(inventory.daggers > 0 || equippedDagger) && <button className="item-action" onClick={onToggleDagger} data-testid="button-equipment-dagger">{equippedDagger ? 'Unequip' : 'Equip'}</button>}</div><div className={'equipment-slot ' + (equippedBow ? 'is-equipped' : '')} data-testid="equipment-ranged-slot"><span className="equipment-slot-mark bow-mark">🏹</span><span><small>Ranged slot</small><strong>{equippedBow ? 'Hunting bow' : 'Empty'}</strong></span>{(inventory.bow > 0 || equippedBow) && <button className="item-action" onClick={onToggleBow} data-testid="button-equipment-bow">{equippedBow ? 'Unequip' : 'Equip'}</button>}</div></div></div><p className="equipment-hint">{equippedBow ? 'The bow is on your back — attacks fire arrows, even while mounted.' : equippedDagger ? 'The dagger is visible in your hand.' : 'Craft a dagger, then equip it from this tab.'}</p></div>
          ) : activeTab === 'quests' ? (
            <QuestLogPanel questStates={questStates} playerLevel={questPlayerLevel} silkCount={inventory.silk} onAcceptQuest={onAcceptQuest} onWeaveBowstring={onWeaveBowstring} />
          ) : <StatsPanel playerStats={playerStats} statPoints={statPoints} onAssign={onAssignStat} />}
        </div>
      </div>
    </div>
  );
}

function QuestLogPanel({ questStates, playerLevel, silkCount, onAcceptQuest, onWeaveBowstring }: { questStates: QuestState[]; playerLevel: number; silkCount: number; onAcceptQuest: (questId: string) => void; onWeaveBowstring: () => void }) {
  const [questTab, setQuestTab] = useState<'active' | 'available' | 'completed'>('active');
  const byId = new Map(questStates.map((s) => [s.questId, s]));
  const activeDefs = QUESTS.filter((def) => byId.get(def.id)?.status === 'active');
  const completedDefs = QUESTS.filter((def) => byId.get(def.id)?.status === 'completed');
  const availableDefs = availableQuests(playerLevel, questStates);
  const shown = questTab === 'active' ? activeDefs : questTab === 'available' ? availableDefs : completedDefs;
  return (
    <section className="quest-log-panel" role="tabpanel" aria-label="Quest log" data-testid="quest-log-panel">
      <div className="quest-log-tabs" role="tablist" aria-label="Quest lists">
        <button className={'quest-log-tab ' + (questTab === 'active' ? 'is-active' : '')} onClick={() => setQuestTab('active')} data-testid="quest-tab-active">Active ({activeDefs.length})</button>
        <button className={'quest-log-tab ' + (questTab === 'available' ? 'is-active' : '')} onClick={() => setQuestTab('available')} data-testid="quest-tab-available">Available ({availableDefs.length})</button>
        <button className={'quest-log-tab ' + (questTab === 'completed' ? 'is-active' : '')} onClick={() => setQuestTab('completed')} data-testid="quest-tab-completed">Completed ({completedDefs.length})</button>
      </div>
      {shown.length === 0 && <div className="quest-log-empty">{questTab === 'active' ? 'No active quests. Find someone with a ! over their head.' : questTab === 'available' ? 'No quests available at your level yet. Keep exploring.' : 'No quests completed yet.'}</div>}
      {shown.map((def) => {
        const state = byId.get(def.id);
        const stage = state?.status === 'active' ? def.stages[state.stageIndex] : null;
        const needsWeave = !!stage && stage.kind === 'craft' && stage.target === 'bowstring';
        return (
          <article className={'quest-card' + (def.storyQuest ? ' is-story' : '')} key={def.id} data-testid={'quest-card-' + def.id}>
            <header className="quest-card-head">
              <div>
                <strong>{def.title}</strong>
                {def.storyQuest && <span className="quest-story-badge" title="Main story quest">⭐ Story</span>}
              </div>
              <span className="quest-card-level">Lv {def.level}</span>
            </header>
            <p className="quest-card-desc">{def.description}</p>
            <p className="quest-card-giver">🗣 {def.giver.name} — {def.giver.location}</p>
            {state?.status === 'active' && (
              <ol className="quest-card-stages">
                {def.stages.map((s, index) => (
                  <li key={s.id} className={index < state.stageIndex ? 'is-done' : index === state.stageIndex ? 'is-current' : ''}>
                    {index < state.stageIndex ? '✓ ' : ''}{index === state.stageIndex ? questProgressText(def, state) : s.description}
                  </li>
                ))}
              </ol>
            )}
            <div className="quest-card-rewards" aria-label="Quest rewards"><span>🪙 {def.rewards.coins}</span><span>✦ {def.rewards.xp} XP</span>{def.rewards.items.slice(0, 3).map((item) => <span key={item}>🎁 {item}</span>)}</div>
            {questTab === 'available' && <button className="quest-accept-button" onClick={() => onAcceptQuest(def.id)} data-testid={'button-quest-accept-' + def.id}>Accept quest</button>}
            {questTab === 'completed' && <div className="quest-card-done">✓ Complete</div>}
            {needsWeave && <button className="quest-weave-button" onClick={onWeaveBowstring} disabled={silkCount < 6} data-testid="button-quest-weave">Weave bowstring ({silkCount}/6 silk)</button>}
          </article>
        );
      })}
    </section>
  );
}

function StatsPanel({ playerStats, statPoints, onAssign }: { playerStats: PlayerStats; statPoints: number; onAssign: (stat: StatKey) => void }) {
  return <section className="satchel-stats-panel" role="tabpanel" aria-label="Adventurer Stats"><div className="satchel-stats-heading"><span className="atlas-eyebrow">Character growth</span><h3>Adventurer Stats</h3></div><div className="satchel-stats-points"><strong>{statPoints}</strong><span>unspent stat points</span><small>Every level grants 5 points. Spend them to shape your build.</small></div><div className="satchel-stats-list">{STAT_KEYS.map((stat) => <div className="satchel-stat-row" key={stat} data-testid={'stat-row-' + stat}><span className="satchel-stat-key">{stat.toUpperCase()}</span><span className="satchel-stat-copy"><strong>{statDetails[stat].label}</strong><small>{statDetails[stat].description}</small></span><b className="satchel-stat-value">{playerStats[stat]}</b><button className="satchel-stat-add" onClick={() => onAssign(stat)} disabled={statPoints < 1} aria-label={'Add 1 ' + statDetails[stat].label} data-testid={'button-add-stat-' + stat}><Plus size={14} /> +1</button></div>)}</div><div className="satchel-stats-footer">STR raises hit damage · DEX speeds attacks · INT raises max HP/XP · LUK improves crits and loot.</div></section>;
}

function InteriorRoom({ area, position, facing, moving, equippedDagger, equippedBow, attacking, attackSequence, simulatedAdventurers, selectedAdventurerId, onInspect, onTalkToSmith, onTalkToBartender, onTalkToPatron, onTalkToTeacher, onTalkToQuestGiver, onEnterDungeon, onEnterCellar, onTavernSleep, cellarRats, onStrikeCellarRat, questStates, interiorTownsfolk, onTalkToTownsfolk }: { area: InteriorArea; position: Point; facing: Direction; moving: boolean; equippedDagger: boolean; equippedBow: boolean; attacking: boolean; attackSequence: number; simulatedAdventurers: SimulatedAdventurer[]; selectedAdventurerId: string | null; onInspect: (adventurer: SimulatedAdventurer) => void; onTalkToSmith: () => void; onTalkToBartender: () => void; onTalkToPatron: (name: string, line: string) => void; onTalkToTeacher: (name: string, title: string, role: 'mage' | 'warrior' | 'rogue') => void; onTalkToQuestGiver: (name: string) => void; onEnterDungeon: () => void; onEnterCellar: () => void; onTavernSleep: () => void; cellarRats: CellarRat[]; onStrikeCellarRat: (ratId: number) => void; questStates: QuestState[]; interiorTownsfolk: { npc: Townsperson; xPct: number; yPct: number }[]; onTalkToTownsfolk: (npc: Townsperson) => void }) {
  // Tavern patron nameplates auto-hide (bartender Mira's stays); tapping a patron pops theirs for 4s.
  const [shownPatron, setShownPatron] = useState<string | null>(null);
  const patronTimerRef = useRef<number | null>(null);
  const flashPatronNameplate = (id: string) => {
    setShownPatron(id);
    if (patronTimerRef.current !== null) window.clearTimeout(patronTimerRef.current);
    patronTimerRef.current = window.setTimeout(() => { setShownPatron(null); patronTimerRef.current = null; }, 4000);
  };
  // Room-type-specific furniture: each building type gets its own visual identity.
  // BUILD 326: quest-giver badges are quest-state-aware — '!' only while the
  // quest is unaccepted, '?' when the giver is the current turn-in target,
  // nothing otherwise (fixes the stuck yellow marker after accepting).
  const giverMarker = (name: string) => {
    const lowered = name.toLowerCase();
    const def = QUESTS.find((q) => {
      const giver = q.giver.name.toLowerCase();
      return giver === lowered || giver.includes(lowered) || lowered.includes(giver);
    });
    return def ? markerForGiver(def, questStates) : null;
  };
  const giverBadge = (name: string) => {
    const marker = giverMarker(name);
    if (marker === 'available') return <span className="quest-giver-badge" aria-hidden="true">!</span>;
    if (marker === 'turnin') return <span className="quest-giver-badge is-turnin" aria-hidden="true">?</span>;
    return null;
  };
  const furniture = {
    guild: (<><span className="interior-rug" /><span className="interior-workbench" /><span className="interior-forge" aria-hidden="true"><span className="forge-fire"><span className="forge-flame forge-flame-back" /><span className="forge-flame forge-flame-mid" /><span className="forge-flame forge-flame-core" /><span className="forge-sparks"><i /><i /><i /><i /><i /></span></span><span className="forge-logs" /></span><span className="interior-weapon-rack" aria-hidden="true"><span className="rack-weapon" style={{ left: '8%', height: '58%', transform: 'rotate(-6deg)' }} /><span className="rack-weapon" style={{ left: '27%', height: '66%', transform: 'rotate(4deg)' }} /><span className="rack-weapon" style={{ left: '46%', height: '60%', transform: 'rotate(-3deg)' }} /><span className="rack-weapon" style={{ left: '65%', height: '68%', transform: 'rotate(5deg)' }} /><span className="rack-weapon" style={{ left: '82%', height: '56%', transform: 'rotate(-5deg)' }} /></span><span className="interior-quest-board" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></>),
    inn: (<><span className="interior-rug" /><span className="interior-table" /><span className="interior-fireplace" /><span className="interior-bar" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></>),
    chapel: (<><span className="interior-rug" /><span className="interior-altar" /><span className="interior-pew pew-left" /><span className="interior-pew pew-right" /><span className="interior-candle candle-left" /><span className="interior-candle candle-right" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></>),
    building: (<><span className="interior-rug" /><span className="interior-table" /><span className="interior-fireplace" /><span className="interior-shelf shelf-left" /><span className="interior-shelf shelf-right" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></>),
    tavern: (<><span className="interior-rug" /><span className="interior-bed" aria-hidden="true" /><span className="interior-bar-counter" aria-hidden="true"><span className="bar-mug mug-1" /><span className="bar-mug mug-2" /><span className="bar-mug mug-3" /></span><span className="interior-stool stool-1" aria-hidden="true" /><span className="interior-stool stool-2" aria-hidden="true" /><span className="interior-stool stool-3" aria-hidden="true" /><span className="interior-round-table table-1" aria-hidden="true"><span className="bar-mug table-mug" /><span className="table-candle" /></span><span className="interior-round-table table-2" aria-hidden="true"><span className="bar-mug table-mug" /><span className="table-candle" /></span><span className="interior-barrel barrel-1" aria-hidden="true" /><span className="interior-barrel barrel-2" aria-hidden="true" /><span className="interior-lantern lantern-left" /><span className="interior-lantern lantern-right" /></>),
    prison: (<><span className="prison-bars" /><span className="prison-straw-bed" /><span className="prison-sewer-grate" /><span className="prison-torch" /><span className="interior-lantern lantern-left" /></>),
    cellar: (<><span className="cellar-barrel cellar-barrel-1" aria-hidden="true" /><span className="cellar-barrel cellar-barrel-2" aria-hidden="true" /><span className="cellar-sacks" aria-hidden="true" /><span className="cellar-crates" aria-hidden="true" /><span className="cellar-cobweb cellar-cobweb-1" aria-hidden="true" /><span className="cellar-cobweb cellar-cobweb-2" aria-hidden="true" /><span className="cellar-ladder" aria-hidden="true" /><span className="interior-lantern lantern-left" /></>),
  }[area.roomType];
  return (
    <div className={'interior-scene interior-' + area.roomType + ' interior-variant-' + (Math.abs(area.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 4)} aria-label={area.name + ' interior'} data-testid={'interior-' + area.id}>
      <div className="interior-room" aria-hidden="true">{furniture}</div>
      {area.id === 'wayfarer-guild' && (
        <button type="button" className="interior-npc npc-warrior" onClick={onTalkToSmith} style={{ ...npcAppearanceStyle('guild-smith', 'warrior'), left: '62%', top: '40%' }} aria-label="Talk to Bram, the guild smith" data-testid="guild-smith" data-facing="down">
          <span className="interior-npc-nameplate" aria-hidden="true"><strong>Bram</strong><small>Guild smith · Talk</small></span>
          <span className="npc-sprite" aria-hidden="true" />
        </button>
      )}
      {area.id === 'wayfarer-guild' && (
        <>
          <button type="button" className="interior-npc npc-guide quest-giver" onClick={() => onTalkToQuestGiver('Elsa')} style={{ ...npcAppearanceStyle('guild-quest-elsa', 'guide'), left: '20%', top: '52%' }} aria-label="Talk to Elsa, the seamstress" data-testid="guild-quest-elsa" data-facing="down">
            {giverBadge('Elsa')}
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Elsa</strong><small>Seamstress · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
          <button type="button" className="interior-npc npc-warrior quest-giver" onClick={() => onTalkToQuestGiver('Rowan')} style={{ ...npcAppearanceStyle('guild-quest-rowan', 'warrior'), left: '36%', top: '58%' }} aria-label="Talk to Rowan, guard captain" data-testid="guild-quest-rowan" data-facing="down">
            {giverBadge('Rowan')}
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Rowan</strong><small>Guard captain · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
          <button type="button" className="interior-npc npc-mage quest-giver" onClick={() => onTalkToQuestGiver('Steward Anselm')} style={{ ...npcAppearanceStyle('guild-quest-anselm', 'mage'), left: '80%', top: '30%' }} aria-label="Talk to Steward Anselm" data-testid="guild-quest-anselm" data-facing="down">
            {giverBadge('Steward Anselm')}
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Steward Anselm</strong><small>King's steward · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
        </>
      )}
      {area.id === 'rootbound-chapel' && (
        <>
          <button type="button" className="interior-npc npc-guide quest-giver" onClick={() => onTalkToQuestGiver('Mabel')} style={{ ...npcAppearanceStyle('chapel-quest-mabel', 'guide'), left: '28%', top: '62%' }} aria-label="Talk to Mabel" data-testid="chapel-quest-mabel" data-facing="down">
            {giverBadge('Mabel')}
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Mabel</strong><small>Chapel-goer · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
          <button type="button" className="interior-npc npc-mage quest-giver" onClick={() => onTalkToQuestGiver('Father Aldous')} style={{ ...npcAppearanceStyle('chapel-quest-aldous', 'mage'), left: '68%', top: '55%' }} aria-label="Talk to Father Aldous" data-testid="chapel-quest-aldous" data-facing="down">
            {giverBadge('Father Aldous')}
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Father Aldous</strong><small>Priest · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
        </>
      )}
      {area.id === 'fourth-house' && (
        <>
          <button type="button" className="interior-npc npc-guide" onClick={onTalkToBartender} style={{ ...npcAppearanceStyle('tavern-bartender', 'guide'), left: '50%', top: '24%' }} aria-label="Talk to Mira, the bartender" data-testid="tavern-bartender" data-facing="down">
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Mira</strong><small>Bartender · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
          <button type="button" className="tavern-sleep-button" onClick={onTavernSleep} style={{ left: '87%', top: '12%' }} aria-label="Sleep in the tavern bed until morning" data-testid="tavern-sleep-bed">😴 Sleep</button>
          <button type="button" className={'interior-npc npc-mage tavern-patron' + (shownPatron === 'tavern-noah' ? ' show-nameplate' : '')} onClick={() => { flashPatronNameplate('tavern-noah'); onTalkToTeacher('Noah', 'Mage teacher', 'mage'); }} style={{ ...npcAppearanceStyle('tavern-patron-noah', 'mage'), left: '13%', top: '63%' }} aria-label="Talk to Noah" data-testid="tavern-patron-noah" data-facing="right">
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Noah</strong><small>Mage teacher · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
          <button type="button" className={'interior-npc npc-warrior tavern-patron' + (shownPatron === 'tavern-damon' ? ' show-nameplate' : '')} onClick={() => { flashPatronNameplate('tavern-damon'); onTalkToTeacher('Damon', 'Warrior teacher', 'warrior'); }} style={{ ...npcAppearanceStyle('tavern-patron-damon', 'warrior'), left: '81%', top: '66%' }} aria-label="Talk to Damon" data-testid="tavern-patron-damon" data-facing="left">
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Damon</strong><small>Warrior teacher · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
          <button type="button" className={'interior-npc npc-rogue tavern-patron' + (shownPatron === 'tavern-shawn' ? ' show-nameplate' : '')} onClick={() => { flashPatronNameplate('tavern-shawn'); onTalkToTeacher('Shawn', 'Rogue instructor', 'rogue'); }} style={{ ...npcAppearanceStyle('tavern-patron-shawn', 'rogue'), left: '48%', top: '44%' }} aria-label="Talk to Shawn" data-testid="tavern-patron-shawn" data-facing="up">
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Shawn</strong><small>Rogue instructor · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
          <button type="button" className={'interior-npc npc-warrior tavern-patron' + (shownPatron === 'tavern-tam' ? ' show-nameplate' : '')} onClick={() => { flashPatronNameplate('tavern-tam'); onTalkToPatron('Old Tam', "Back in my day, the goats were bigger. And meaner. Mostly meaner."); }} style={{ ...npcAppearanceStyle('tavern-patron-tam', 'warrior'), left: '24%', top: '81%' }} aria-label="Talk to Old Tam" data-testid="tavern-patron-tam" data-facing="up">
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Old Tam</strong><small>Regular · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
          <button type="button" className={'interior-npc npc-mage tavern-patron' + (shownPatron === 'tavern-sella' ? ' show-nameplate' : '')} onClick={() => { flashPatronNameplate('tavern-sella'); onTalkToPatron('Sella', "They say the Ember Vault under the chapel glows when danger stirs. I don't go down there."); }} style={{ ...npcAppearanceStyle('tavern-patron-sella', 'mage'), left: '66%', top: '82%' }} aria-label="Talk to Sella" data-testid="tavern-patron-sella" data-facing="up">
            <span className="interior-npc-nameplate" aria-hidden="true"><strong>Sella</strong><small>Traveler · Talk</small></span>
            <span className="npc-sprite" aria-hidden="true" />
          </button>
        </>
      )}
      {(() => {
        // Fake players hang out inside buildings too: starting house, tavern, guild.
        const interiorLocation = area.id === 'tutorial-house' ? 'starting-house' : area.id === 'fourth-house' ? 'tavern' : area.id === 'wayfarer-guild' ? 'guild' : null;
        if (!interiorLocation) return null;
        return simulatedAdventurers.filter((adventurer) => (adventurer.location || 'field') === interiorLocation).map((adventurer) => {
        const housePosition = adventurer.interiorPosition || { x: 50, y: 47 };
        return <button type="button" key={adventurer.id} className={'simulated-adventurer interior-simulated-adventurer adventurer-' + adventurer.className.toLowerCase() + (adventurer.moving ? ' is-moving' : '') + (selectedAdventurerId === adventurer.id ? ' is-nameplate-visible' : '')} onClick={() => onInspect(adventurer)} style={{ ...npcAppearanceStyle(adventurer.id, adventurer.className.toLowerCase(), { kind: 'adventurer' }), left: housePosition.x + '%', top: housePosition.y + '%' }} data-facing={adventurer.facing} aria-label={adventurer.name + ', level ' + adventurer.level + ' ' + adventurer.className} data-testid={'simulated-adventurer-' + adventurer.id}>
          <span className="simulated-adventurer-nameplate"><strong>{adventurer.name}</strong><small>Lv. {adventurer.level} · {adventurer.activity}</small></span>
          <span className="simulated-adventurer-sprite" aria-hidden="true" />
        </button>;
        });
      })()}
      <div className="interior-doorway" aria-label={area.roomType === 'cellar' ? 'Climb back up to the tavern' : 'Exit to Mosslight Crossing'}><span>EXIT</span></div>
      {/* BUILD 329: townsfolk physically at home — rendered inside their own
          cottage when the player visits. Tapping talks to them. */}
      {interiorTownsfolk.map(({ npc, xPct, yPct }) => (
        <button
          type="button"
          key={'interior-townsfolk-' + npc.id}
          className={'interior-npc npc-' + npc.role + (npc.moving ? ' is-moving' : '')}
          onClick={() => onTalkToTownsfolk(npc)}
          style={{ ...npcAppearanceStyle(npc.id, npc.role), left: xPct + '%', top: yPct + '%' }}
          data-facing={npc.facing}
          aria-label={'Talk to ' + npc.name}
          data-testid={'interior-townsfolk-' + npc.id}
        >
          <span className="interior-npc-nameplate" aria-hidden="true"><strong>{npc.name}</strong><small>{npc.activity} · Talk</small></span>
        </button>
      ))}
      {area.id === 'rootbound-chapel' && (
        <button className="interior-dungeon-staircase" onClick={onEnterDungeon} aria-label="Descend to the Ember Vault dungeon" data-testid="button-enter-dungeon">
          <span className="dungeon-stairs-visual" aria-hidden="true" />
          <span className="dungeon-stairs-label">Ember Vault</span>
        </button>
      )}
      {area.id === 'fourth-house' && (
        <button className="cellar-hatch" onClick={onEnterCellar} aria-label="Descend into the Tankard Cellar" data-testid="button-enter-cellar">
          <span className="cellar-hatch-visual" aria-hidden="true" />
          <span className="cellar-hatch-label">Cellar</span>
        </button>
      )}
      {area.roomType === 'cellar' && cellarRats.filter((rat) => rat.hp > 0).map((rat) => (
        <button
          type="button"
          key={'cellar-rat-' + rat.id}
          className={'cellar-rat' + (rat.hitFlash ? ' is-hit' : '')}
          style={{ left: rat.x + '%', top: rat.y + '%' }}
          onClick={() => onStrikeCellarRat(rat.id)}
          aria-label={'Attack the rat, ' + rat.hp + ' of ' + rat.maxHp + ' health'}
          data-testid={'button-cellar-rat-' + rat.id}
          data-facing="left"
        >
          <span className="cellar-rat-sprite" aria-hidden="true" />
        </button>
      ))}
      <div className={'interior-player ' + (moving ? 'is-moving ' : '') + (attacking ? 'is-attacking' : '')} data-facing={facing} style={{ left: position.x + '%', top: position.y + '%', '--attack-y': `${-attackDirectionRow[facing] * 48}px` } as CSSProperties}><span className="player-sprite" />{attacking && <span key={attackSequence} className="player-attack-sprite" aria-hidden="true" style={{ '--attack-y': `${-attackDirectionRow[facing] * 48}px`, backgroundImage: `url("${assetUrl('assets/gameplay/shining-fields/characters/player/attack.png')}")` } as CSSProperties} />}{equippedDagger && <span className="player-dagger" aria-label="Equipped dagger" />}{equippedBow && <span className="player-bow" aria-label="Equipped bow" />}</div>
      <div className="interior-exit-hint">{area.roomType === 'cellar' ? 'Walk to the ladder to climb up' : 'Walk to the door to leave'}</div>
    </div>
  );
}

// Quest givers who live out in the field (chunk, field-unit position, display name).
const QUEST_GIVER_FIELD_NPCS: Array<{ name: string; displayName: string; title: string; chunk: Point; position: Point; sprite: string }> = [
  { name: 'Aldric', displayName: 'Aldric', title: 'Farmer', chunk: { x: 5, y: 7 }, position: { x: 70, y: 60 }, sprite: 'npc-guide' },
  { name: 'Cedric', displayName: 'Cedric', title: 'Merchant', chunk: { x: 4, y: 7 }, position: { x: 84, y: 72 }, sprite: 'npc-mage' },
  { name: 'Kess', displayName: 'Kess', title: 'Bridge-keeper', chunk: { x: 3, y: 12 }, position: { x: 70, y: 60 }, sprite: 'npc-warrior' },
  { name: 'Bram', displayName: 'Old Bram', title: 'Fisher', chunk: { x: 4, y: 8 }, position: { x: 60, y: 70 }, sprite: 'npc-rogue' },
];

function GameField({ inventory, equippedDagger, equippedBow, playerStats, statPoints, characterChoices, onPlayerStatsChange, onStatPointsChange, onLoot, onOpenMap, onOpenInventory, onOpenJournal, onDiscoverLocation, onRestorePrison, onRestoreJournal, onRestoreReputation, onQuestStatesChange, onQuestReputation, onAddRumor, onEscapeSpawnConsumed, onChunkChange, muted, onToggleMute, inputLocked, saveStateRef, loadState, onSave, onDownloadSave, onOpenLoad, onOpenMenu, onEnterDungeon, menuBridgeRef, inPrison, prisonState, journal, reputation, escapeSpawn, beerBuffUntil }: { inventory: GameInventory; equippedDagger: boolean; equippedBow: boolean; playerStats: PlayerStats; statPoints: number; characterChoices: CharacterChoices | null; onPlayerStatsChange: (stats: PlayerStats) => void; onStatPointsChange: (points: number | ((current: number) => number)) => void; onLoot: (loot: GoatLoot) => void; onOpenMap: () => void; onOpenInventory: () => void; onOpenJournal: () => void; onDiscoverLocation: (name: string, kind: string, chunk: Point) => void; onRestorePrison: (inPrison: boolean, prisonState: PrisonState | undefined) => void; onRestoreJournal: (journal: JournalState | undefined) => void; onRestoreReputation: (reputation: ReputationState | undefined) => void; onQuestStatesChange: (states: QuestState[], playerLevel: number) => void; onQuestReputation: (points: number) => void; onAddRumor: (text: string, source: string) => void; onEscapeSpawnConsumed: () => void; onChunkChange: (chunk: Point) => void; muted: boolean; onToggleMute: () => void; inputLocked: boolean; saveStateRef: { current: (() => SaveGameData) | null }; loadState: SaveGameData | null; onSave: () => void; onDownloadSave: () => void; onOpenLoad: () => void; onOpenMenu: () => void; onEnterDungeon: () => void; menuBridgeRef: { current: { openOptions: () => void; getTime: () => string; acceptQuest: (questId: string) => void; emitQuestEvent: (event: QuestEvent) => void; getKingdomLabels: () => { text: string; x: number; y: number }[]; getTradeRoutes: () => { id: string; name: string; points: { x: number; y: number }[] }[] } | null }; inPrison: boolean; prisonState: PrisonState; journal: JournalState; reputation: ReputationState; escapeSpawn: EscapeSpawn | null; beerBuffUntil: number }) {
  const [position, setPosition] = useState<Point>({ x: FIELD_SIZE / 2 + 1, y: FIELD_SIZE / 2 + 2 });
  // Debug tap marks (?debugDoors=1): user taps to mark where they think the
  // invisible exit/entrance is; rendered as lime green dots with coordinates.
  const [debugMarks, setDebugMarks] = useState<Point[]>([]);
  // Red markers: user taps to mark where collision should be removed or details they don't like.
  const [redMarks, setRedMarks] = useState<Point[]>([]);
  // Which color dot to place when tapping: 'green' (trigger positions) or 'red' (remove collision/details).
  const [markColor, setMarkColor] = useState<'green' | 'red'>('green');
  // Visual house mover: doorwayId -> {x, y} offset in field units.
  // Persisted to localStorage so placements survive reloads.
  // Cleared automatically when the build changes (hardcoded positions updated).
  const [houseOffsets, setHouseOffsets] = useState<Record<string, Point>>(() => {
    try {
      const savedBuild = localStorage.getItem('houseOffsetsBuild');
      const saved = localStorage.getItem('houseOffsets');
      // If the build changed, the hardcoded positions were updated — clear stale offsets.
      if (savedBuild !== BUILD_NUMBER) {
        localStorage.removeItem('houseOffsets');
        localStorage.setItem('houseOffsetsBuild', BUILD_NUMBER);
        return {};
      }
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  // Ref sync for the animation loop (movement entry must use the same offsets as the prompt).
  const houseOffsetsRef = useRef(houseOffsets);
  houseOffsetsRef.current = houseOffsets;
  // Save offsets to localStorage whenever they change.
  useEffect(() => {
    try { localStorage.setItem('houseOffsets', JSON.stringify(houseOffsets)); } catch { /* ignore */ }
  }, [houseOffsets]);
  // Tap-to-move: selected house ID. Tap a house to pick it up, tap the field to place it.
  const [selectedHouse, setSelectedHouse] = useState<string | null>(null);
  // Mover zoom level.
  // Game zoom (base game feature): +/− buttons on the right side. Min 100%.
  // BUILD 327: default is 225% with the player centered in the viewport.
  const [gameZoom, setGameZoom] = useState(DEFAULT_GAME_ZOOM);
  // Debug mover mode (toggleable from options menu). Syncs with module-level moveHouses.
  const [moverMode, setMoverMode] = useState(moveHouses);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const toggleMoverMode = () => {
    const next = !moverMode;
    moveHouses = next;
    setMoverMode(next);
    if (!next) {
      setSelectedHouse(null);
      setSelectedPlacedId(null);
      setEditorTool('select');
    }
  };
  // Debug world editor (BUILD 274): stamp houses/trees/rocks/roads onto the
  // field, flag generated objects for removal, teleport the player.
  type EditorTool = 'select' | 'house' | 'tree' | 'pine' | 'rock' | 'roadH' | 'roadV' | 'flag' | 'erase' | 'player';
  const [editorTool, setEditorTool] = useState<EditorTool>('select');
  const [showGrid, setShowGrid] = useState(false);
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const loadPlacedObjects = (): PlacedObject[] => {
    try {
      const raw = localStorage.getItem('worldEditorObjects');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((o) => o && typeof o.id === 'string' && typeof o.x === 'number' && typeof o.y === 'number' && typeof o.chunk === 'string') : [];
    } catch { return []; }
  };
  const loadFlaggedItems = (): FlaggedItem[] => {
    try {
      const raw = localStorage.getItem('worldEditorFlags');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((f) => f && typeof f.id === 'string') : [];
    } catch { return []; }
  };
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>(loadPlacedObjects);
  const [flaggedItems, setFlaggedItems] = useState<FlaggedItem[]>(loadFlaggedItems);
  // BUILD 305: generated trees/rocks deleted via the Erase tool, per chunk.
  const loadDeletedTrees = (): Record<string, number[]> => {
    try {
      const raw = localStorage.getItem('worldEditorDeletedTrees');
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object') return {};
      const clean: Record<string, number[]> = {};
      for (const k of Object.keys(parsed)) {
        if (Array.isArray(parsed[k])) clean[k] = parsed[k].filter((n: unknown) => typeof n === 'number');
      }
      return clean;
    } catch { return {}; }
  };
  const [deletedGenTrees, setDeletedGenTrees] = useState<Record<string, number[]>>(loadDeletedTrees);
  useEffect(() => {
    try { localStorage.setItem('worldEditorDeletedTrees', JSON.stringify(deletedGenTrees)); } catch { /* ignore */ }
  }, [deletedGenTrees]);
  // Sync the module-level key set so collision skips deleted trees.
  useEffect(() => {
    editorDeletedTreeKeys.clear();
    for (const ck of Object.keys(deletedGenTrees)) {
      for (const id of deletedGenTrees[ck]) editorDeletedTreeKeys.add(ck + ':' + id);
    }
  }, [deletedGenTrees]);
  // BUILD 305: chunks where the user hid the generated road visuals.
  const [hiddenRoadChunks, setHiddenRoadChunks] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('worldEditorHiddenRoads');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('worldEditorHiddenRoads', JSON.stringify(hiddenRoadChunks)); } catch { /* ignore */ }
  }, [hiddenRoadChunks]);
  // BUILD 305: minimize the editor panel so it doesn't block the view.
  const [editorMinimized, setEditorMinimized] = useState(false);
  useEffect(() => {
    try { localStorage.setItem('worldEditorObjects', JSON.stringify(placedObjects)); } catch { /* ignore */ }
  }, [placedObjects]);
  useEffect(() => {
    try { localStorage.setItem('worldEditorFlags', JSON.stringify(flaggedItems)); } catch { /* ignore */ }
  }, [flaggedItems]);
  // Monster sheet fallback: probe sheet PNGs once per session; a 404'd sheet
  // swaps its monsters to the engine-safe placeholder sprite.
  const [, setSheetProbeTick] = useState(0);
  useEffect(() => {
    probeMonsterSheets();
    return onMonsterSheetFailure(() => setSheetProbeTick((tick) => tick + 1));
  }, []);
  // Sync module-level solids so collision sees user-placed objects.
  useEffect(() => {
    editorSolids = editorSolidsFor(placedObjects);
  }, [placedObjects]);
  // BUILD 341: debug map builder (tilemap-style terrain painter).
  type MapBrush = MapPaintTile | 'house' | 'erase';
  const [mapBuilderMode, setMapBuilderMode] = useState(false);
  const [mapBrush, setMapBrush] = useState<MapBrush>('dirt');
  const loadMapPaints = (): MapPaints => {
    try {
      const raw = localStorage.getItem('mapBuilderPaints');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as MapPaints;
      }
    } catch { /* ignore */ }
    return {};
  };
  const [mapPaints, setMapPaints] = useState<MapPaints>(loadMapPaints);
  useEffect(() => {
    try { localStorage.setItem('mapBuilderPaints', JSON.stringify(mapPaints)); } catch { /* ignore */ }
  }, [mapPaints]);
  const toggleMapBuilder = () => setMapBuilderMode((m) => !m);
  // Convert a pointer event on the field into true field-unit coordinates,
  // inverting the game-zoom transform (same math as the mover/marker tools).
  const tapToField = (e: React.PointerEvent<HTMLElement>): Point => {
    const field = (e.currentTarget as HTMLElement).closest('.pixel-field') as HTMLElement | null;
    const rect = (field || e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (gameZoom !== 1) {
      // BUILD 327: invert the centered-zoom transform (translate then scale,
      // origin 0 0) to recover true field-unit coordinates.
      return {
        x: screenPxToFieldUnits(px, rect.width, position.x / FIELD_SIZE, gameZoom),
        y: screenPxToFieldUnits(py, rect.height, position.y / FIELD_SIZE, gameZoom),
      };
    }
    return { x: (px / rect.width) * FIELD_SIZE, y: (py / rect.height) * FIELD_SIZE };
  };
  // BUILD 341: map-builder painting — convert a pointer event to a tile and
  // paint it (or stamp a house). Drag paints a stroke; house stamps once per tap.
  const paintAtEvent = (e: React.PointerEvent<HTMLElement>, isTap: boolean) => {
    const field = (e.currentTarget as HTMLElement).closest('.pixel-field') as HTMLElement | null;
    const rect = (field || (e.currentTarget as HTMLElement)).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let fx: number;
    let fy: number;
    if (gameZoom !== 1) {
      fx = screenPxToFieldUnits(px, rect.width, position.x / FIELD_SIZE, gameZoom);
      fy = screenPxToFieldUnits(py, rect.height, position.y / FIELD_SIZE, gameZoom);
    } else {
      fx = (px / rect.width) * FIELD_SIZE;
      fy = (py / rect.height) * FIELD_SIZE;
    }
    if (mapBrush === 'house') {
      if (!isTap) return;
      const hx = Math.round(fx * 10) / 10;
      const hy = Math.round(fy * 10) / 10;
      setPlacedObjects((obs) => editorPlaceObject(obs, 'house', hx, hy, chunkKey));
      return;
    }
    const tx = Math.floor(fx / MAP_TILE_UNITS);
    const ty = Math.floor(fy / MAP_TILE_UNITS);
    setMapPaints((prev) => paintTile(prev, chunkKey, tx, ty, mapBrush === 'erase' ? null : mapBrush));
  };
  const mapBrushes: { id: MapBrush; label: string }[] = [
    { id: 'grass', label: '🌱 Grass' },
    { id: 'dirt', label: '🟫 Dirt' },
    { id: 'water', label: '🌊 Water' },
    { id: 'sand', label: '🏖️ Sand' },
    { id: 'forest', label: '🌲 Forest' },
    { id: 'house', label: '🏠 House' },
    { id: 'erase', label: '🧹 Erase' },
  ];
  // Debug markers (green dots): toggleable from options menu. Syncs with module-level debugDoors.
  const [markerMode, setMarkerMode] = useState(debugDoors);
  const toggleMarkerMode = () => {
    const next = !markerMode;
    debugDoors = next;
    setMarkerMode(next);
    if (!next) {
      setDebugMarks([]);
      setRedMarks([]);
    }
  };
  const dragStateRef = useRef<{ doorwayId: string; startClientX: number; startClientY: number; origX: number; origY: number; containerW: number; containerH: number } | null>(null);
  const [chunk, setChunk] = useState<Point>(playtestChunk ?? { x: 4, y: 7 });
  // Debug world editor: objects/flags for the current chunk.
  const chunkKey = chunk.x + ',' + chunk.y;
  // BUILD 341: merge map-builder painted solids (water/forest tiles) into the
  // module-level collision solids alongside world-editor placed objects.
  useEffect(() => {
    editorSolids = [...editorSolidsFor(placedObjects), ...mapBuilderSolidsFor(mapPaints, chunkKey)];
  }, [placedObjects, mapPaints, chunkKey]);
  // BUILD 306: NPC entrance — track which NPCs have been seen on the current
  // chunk so first sightings slide in from the edge they came from instead of
  // popping into view.
  const npcEntryRef = useRef<{ chunk: string; seen: Set<string> }>({ chunk: '', seen: new Set() });
  const npcEnterProps = (id: string, position: Point, facing: NpcFacing): { className: string; style: CSSProperties } | null => {
    if (npcEntryRef.current.chunk !== chunkKey) npcEntryRef.current = { chunk: chunkKey, seen: new Set() };
    if (npcEntryRef.current.seen.has(id)) return null;
    npcEntryRef.current.seen.add(id);
    const e = npcEntryPoint(position, facing);
    return {
      className: ' npc-entering',
      style: { '--npc-enter-x': fieldPct(e.x), '--npc-enter-y': fieldPct(e.y) } as CSSProperties,
    };
  };
  const placedHere = placedObjects.filter((o) => o.chunk === chunkKey);
  const flaggedHere = flaggedItems.filter((f) => f.chunk === chunkKey);
  const [areaFlash, setAreaFlash] = useState<{ id: string; label: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState<Direction>('down');
  const [attackFacing, setAttackFacing] = useState<Direction | null>(null);
  const [mounted, setMounted] = useState(playtestMounted);
  const [horse, setHorse] = useState<HorseState>(initialHorseState);
  const [horseFacing, setHorseFacing] = useState<Direction>('down');
  const [logOpen, setLogOpen] = useState(false);
  const [hpBoxHidden, setHpBoxHidden] = useState(false);
  // Quest system: active/completed quest states (pure logic in src/game/quests.ts).
  const [questStates, setQuestStates] = useState<QuestState[]>([]);
  const questStatesRef = useRef<QuestState[]>([]);
  // Lockpicking: opened locked-chest ids (pure logic in src/game/lockpicking.ts).
  const [openedChests, setOpenedChests] = useState<string[]>([]);
  const openedChestsRef = useRef<string[]>([]);
  // Civ phase 14: POI treasure looted once per POI id, persisted in the save.
  const [lootedPois, setLootedPois] = useState<string[]>([]);
  const lootedPoisRef = useRef<string[]>([]);
  // Civilization (phase 3+): settlement hierarchy, kingdoms, rulers, trade.
  // Created lazily on first clock tick; advanced once per in-game day.
  const civRef = useRef<CivilizationState | null>(null);
  const ensureCiv = () => {
    if (!civRef.current) civRef.current = createCivilization(DEFAULT_WORLD_SEED);
    return civRef.current;
  };
  // Civ phase 11: world horses (owned by NPCs + wild), created once per world
  // seed from the civilization settlements. Owner profiles regenerate
  // deterministically, so they never need to be saved.
  const horsesRef = useRef<{ horses: Horse[]; stables: Stable[]; owners: Map<string, CharacterProfile> } | null>(null);
  const ensureHorses = () => {
    if (!horsesRef.current) {
      const civ = ensureCiv();
      const kindMap = (k: string): HorseSettlement['kind'] =>
        k === 'capital' ? 'capital' : k === 'city' ? 'city' : k === 'town' ? 'town' : k === 'village' ? 'village' : 'hamlet';
      const settlements: HorseSettlement[] = civ.settlements.map((s) => ({
        id: s.id, chunk: { ...s.chunk }, kind: kindMap(s.kind),
      }));
      const ownersBySettlement: Record<string, CharacterProfile[]> = {};
      const owners = new Map<string, CharacterProfile>();
      for (const s of civ.settlements) {
        const roster = generateSettlementPopulation(DEFAULT_WORLD_SEED, s.id, s.kingdomId, 10, kindMap(s.kind));
        ownersBySettlement[s.id] = roster;
        for (const p of roster) owners.set(p.id, p);
      }
      const { horses, stables } = createHorses(DEFAULT_WORLD_SEED, settlements, ownersBySettlement);
      horsesRef.current = { horses, stables, owners };
    }
    return horsesRef.current;
  };
  // Civ phase 16: announce world events as the simulation advances them.
  const lastEventCountRef = useRef(-1);
  const advanceCivForClock = (clock: WorldClockState | null | undefined) => {
    if (!clock) return;
    const civ = ensureCiv();
    advanceCivilization(civ, clock);
    const count = civ.events.length;
    if (lastEventCountRef.current >= 0 && count > lastEventCountRef.current) {
      const fresh = civ.events.slice(lastEventCountRef.current);
      for (const event of fresh) {
        setLogs((currentLogs) => [{ text: `📰 Day ${event.day}: ${event.description}`, color: 'purple' }, ...currentLogs].slice(0, 5));
      }
    }
    lastEventCountRef.current = count;
  };
  const questRumoredRef = useRef<Set<string>>(new Set());
  const [questDialog, setQuestDialog] = useState<{ giverName: string; questId: string } | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [logs, setLogs] = useState(initialLogs);
  const [time, setTime] = useState('6:00 AM · Day 1 · Y1');
  const [playerHp, setPlayerHp] = useState(playerMaxHpForStats(initialPlayerStats));
  const [gameOver, setGameOver] = useState(false);
  const [playerXp, setPlayerXp] = useState(0);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerClass, setPlayerClass] = useState<PlayerClass>('Beginner');
  const [npcDialogue, setNpcDialogue] = useState<TownNpc | null>(null);
  // BUILD 330: Oblivion-style dialogue — open townsfolk, selected topic,
  // per-NPC disposition (0-100) and the Mosslight wanted level. Both persist
  // in the save under the optional `dialogue` field.
  const [townsfolkDialogue, setTownsfolkDialogue] = useState<Townsperson | null>(null);
  const [dialogueTopic, setDialogueTopic] = useState<DialogueTopicId | null>(null);
  const [disposition, setDisposition] = useState<Record<string, number>>({});
  const [wantedMosslight, setWantedMosslight] = useState(0);
  // BUILD 332: ambient barks — floating greetings, one per NPC per ~75s.
  const [barks, setBarks] = useState<Record<string, string>>({});
  const barksRef = useRef<Record<string, { text: string; until: number }>>({});
  const lastBarkRef = useRef<Record<string, number>>({});
  const dispositionRef = useRef<Record<string, number>>({});
  useEffect(() => { dispositionRef.current = disposition; }, [disposition]);
  // Town NPC nameplates (Noah/Damon/Shawn) stay hidden until the NPC is
  // tapped, then auto-hide after a few seconds.
  const [nameplateNpc, setNameplateNpc] = useState<string | null>(null);
  const nameplateTimerRef = useRef<number | null>(null);
  const [npcStates, setNpcStates] = useState(startingTownNpcs);
  const npcStatesRef = useRef(npcStates);
  useEffect(() => { npcStatesRef.current = npcStates; }, [npcStates]);
  // Living-town roster: persistent seeded townsfolk, simulated only while the
  // player is in Mosslight Crossing (simulation LOD).
  const [townsfolk, setTownsfolk] = useState<Townsperson[]>([]);
  const townsfolkRef = useRef<Townsperson[]>([]);
  const townsfolkAnchorsRef = useRef<TownsfolkAnchors | null>(null);
  // Physical NPC navigation: housing registry, cottage doors, obstacles.
  // Built once — the 12 townsfolk ids are stable (townsfolk-0..11).
  const townsfolkNavRef = useRef<TownsfolkNavContext | null>(null);
  if (!townsfolkNavRef.current) {
    const ids = Array.from({ length: 12 }, (_, i) => 'townsfolk-' + i);
    townsfolkNavRef.current = {
      housing: buildMosslightHousing(ids),
      doors: cottageDoorways(),
      obstacles: mosslightObstacles(),
      roadPiece: mapTileFor(TOWNSFOLK_CHUNK).road,
    };
  }
  useEffect(() => { townsfolkRef.current = townsfolk; }, [townsfolk]);
  // Carriage fast-travel network: physical stations/stops, driver dialogue,
  // travel state. Stations are deterministic (module cache); the dialogue and
  // in-progress travel live here.
  type CarriageDialogState = { kind: 'station'; station: CarriageStation } | { kind: 'stop'; stop: CarriageStop };
  const [carriageDialog, setCarriageDialog] = useState<CarriageDialogState | null>(null);
  const [carriageTravel, setCarriageTravel] = useState<{ destName: string; destChunk: Point; arrival: Point; totalTicks: number; doneTicks: number } | null>(null);
  const [carriageDebugOpen, setCarriageDebugOpen] = useState(false);
  const carriageTravelTimerRef = useRef<number | null>(null);
  const carriageEarningsRef = useRef<Record<string, number>>({});
  const carriageStation = useMemo(() => getCarriageStation(chunk), [chunk.x, chunk.y]);
  const carriageStop = useMemo(() => (carriageStation ? null : getCarriageStop(chunk)), [chunk.x, chunk.y, carriageStation]);
  // Living-town roster management: resolve the roster when the player enters
  // Mosslight Crossing (snapped to the current world-clock schedule, so the
  // town is already "alive" on arrival), clear it when they leave (abstract
  // LOD), and re-anchor homes when houses are moved in the world editor.
  useEffect(() => {
    const inTown = chunk.x === TOWNSFOLK_CHUNK.x && chunk.y === TOWNSFOLK_CHUNK.y;
    const anchors = townsfolkAnchors(houseOffsets);
    townsfolkAnchorsRef.current = anchors;
    if (!inTown) {
      if (townsfolkRef.current.length > 0) {
        townsfolkRef.current = [];
        setTownsfolk([]);
      }
      return;
    }
    const clock = brainRef.current?.worldCore.getClock();
    if (!clock) return;
    if (townsfolkRef.current.length === 0) {
      const folk = snapTownsfolk(createTownsfolk(anchors, DEFAULT_WORLD_SEED), anchors, clock, townsfolkNavRef.current!);
      townsfolkRef.current = folk;
      setTownsfolk(folk);
      return;
    }
    const reanchored = reanchorTownsfolk(townsfolkRef.current, anchors);
    if (reanchored.some((npc, index) => npc !== townsfolkRef.current[index])) {
      townsfolkRef.current = reanchored;
      setTownsfolk(reanchored);
    }
  }, [chunk.x, chunk.y, houseOffsets]);
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
  // Bridge so the menu sheet (rendered by App) can open GameField's options overlay, read the clock, and drive quests.
  useEffect(() => {
    menuBridgeRef.current = { openOptions: () => setOptionsOpen(true), getTime: () => time, acceptQuest, emitQuestEvent, getKingdomLabels: () => kingdomLabelPoints(ensureCiv()), getTradeRoutes: () => tradeRoutePolylines(ensureCiv()) };
  });
  const wildlifeRef = useRef<WildlifeState[]>(wildlife);
  useEffect(() => { waterLifeRef.current = waterLife; }, [waterLife]);
  const [targetGoatId, setTargetGoatId] = useState<number | null>(null);
  const [droppedLoot, setDroppedLoot] = useState<DroppedLoot[]>([]);
  const [attacking, setAttacking] = useState(false);
  const [attackSequence, setAttackSequence] = useState(0);
  const [attackFlash, setAttackFlash] = useState<string | null>(null);
  const [interior, setInterior] = useState<InteriorArea | null>(playtestInteriorArea ?? (playtestMounted || playtestChunk ? null : startingHouse));
  // BUILD 326: the interior to return to when leaving the tankard cellar
  // (the tavern), and the cellar's rats. Rats persist for the session once
  // spawned so leaving mid-quest and coming back keeps the remaining rats.
  const interiorReturnRef = useRef<InteriorArea | null>(null);
  const [cellarRats, setCellarRats] = useState<CellarRat[]>([]);
  const cellarRatsRef = useRef<CellarRat[]>([]);
  const syncCellarRats = (next: CellarRat[]) => { cellarRatsRef.current = next; setCellarRats(next); };
  // Spawn on clear floor below the furniture: (50, 47) sits inside the
  // inn/building fireplace collision rect and permanently soft-locks movement.
  const [interiorPosition, setInteriorPosition] = useState<Point>({ x: 50, y: 78 });
  const keysRef = useRef<Partial<Record<Direction, boolean>>>({});
  // BUILD 325: D-pad touch holds tracked by touch.identifier (see
  // src/game/touchInput.ts) — declared beside keysRef since every input-reset
  // path must clear both.
  const touchHoldsRef = useRef<TouchHoldState>(createTouchHoldState());
  // BUILD 337: immortal-loop diagnostics. If a frame throws, the message is
  // recorded here and shown as a small on-screen badge (tap to dismiss) so
  // the cause is visible instead of the character silently freezing.
  const loopErrorRef = useRef<{ message: string; count: number } | null>(null);
  const loopErrorLastRef = useRef(0);
  const [loopErrorTick, setLoopErrorTick] = useState(0);
  const recordLoopError = (err: unknown) => {
    const message = err instanceof Error ? (err.stack || err.message) : String(err);
    const prev = loopErrorRef.current;
    loopErrorRef.current = { message: message.slice(0, 300), count: (prev?.count || 0) + 1 };
    // Throttle the re-render: record every occurrence, but repaint the badge
    // at most once per second so a throw-every-frame fault can't storm React.
    const nowMs = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!prev || prev.message !== loopErrorRef.current.message || nowMs - loopErrorLastRef.current > 1000) {
      loopErrorLastRef.current = nowMs;
      setLoopErrorTick((t) => t + 1);
    }
  };
  const dismissLoopError = () => { loopErrorRef.current = null; setLoopErrorTick(0); };
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
  // Wait/pass-time: while true, the wait driver owns the world clock and the
  // living-sim ticks (ambient intervals skip so nothing double-advances).
  const waitingRef = useRef(false);
  const waitTimerRef = useRef<number | null>(null);
  const [waitSheetOpen, setWaitSheetOpen] = useState(false);
  const [waitProgress, setWaitProgress] = useState<{ done: number; total: number } | null>(null);
  const playerAttackCooldownRef = useRef(0);
  const playerAttackStateRef = useRef<{ active: boolean; direction: Direction; targetId: number | null; elapsed: number; hitApplied: boolean; ranged: boolean }>({ active: false, direction: 'down', targetId: null, elapsed: 0, hitApplied: false, ranged: false });
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
    equippedBow,
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
    townsfolk: serializeTownsfolk(townsfolkRef.current),
    goats,
    interiorId: interior?.id || null,
    interiorPosition,
    inPrison,
    prisonState,
    journal,
    reputation,
    dialogue: { disposition, wantedMosslight },
    logs,
    time,
    carriage: serializeCarriage(carriageEarningsRef.current),
    carriageTravel: carriageTravelRef.current ?? undefined,
    escortHired: escortHiredRef.current,
    questLog: serializeQuestStates(questStatesRef.current),
    openedChests: serializeOpenedChests(openedChestsRef.current),
    lootedPois: serializeOpenedChests(lootedPoisRef.current),
    civ: civRef.current ? serializeCivilization(civRef.current) : undefined,
    horses: horsesRef.current ? serializeHorses(horsesRef.current.horses, horsesRef.current.stables) : undefined,
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
    clearTouchHolds(touchHoldsRef.current);
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
    // Teachers moved to the Rusty Tankard: drop any saved field copies.
    setNpcStates((loadState.npcStates || []).filter((npc) => npc.name !== 'Noah' && npc.name !== 'Damon' && npc.name !== 'Shawn'));
    const validAdventurerLocations = ['starting-house', 'field', 'tavern', 'guild', 'traveling'];
    const restoredAdventurers = loadState.simulatedAdventurers.length
      ? loadState.simulatedAdventurers.map((adventurer) => ({ ...adventurer, level: adventurer.level || 1, location: validAdventurerLocations.includes(adventurer.location ?? '') ? adventurer.location : 'field', interiorPosition: adventurer.interiorPosition ?? { x: 50, y: 47 } }))
      : initialSimulatedAdventurers;
    simulatedAdventurersRef.current = restoredAdventurers;
    setSimulatedAdventurers(restoredAdventurers);
    // Townsfolk persistence (BUILD 322): a save made on the Mosslight chunk
    // carries the 12 townsfolk exactly as they were; restore positions and
    // location state so the town resumes instead of re-snapping. Saves made
    // elsewhere carry an empty list (townsfolk are abstract while away) and
    // fall through to the normal schedule snap on chunk entry.
    if (loadState.chunk.x === TOWNSFOLK_CHUNK.x && loadState.chunk.y === TOWNSFOLK_CHUNK.y
        && Array.isArray(loadState.townsfolk) && loadState.townsfolk.length > 0
        && townsfolkNavRef.current) {
      const anchors = townsfolkAnchors(houseOffsets);
      const fresh = createTownsfolk(anchors, DEFAULT_WORLD_SEED);
      const restored = reanchorTownsfolk(restoreTownsfolk(fresh, loadState.townsfolk), anchors);
      townsfolkRef.current = restored;
      setTownsfolk(restored);
    }
    interiorDoorwayIdRef.current = restoredDoorway?.id || null;
    interiorEntryChunkRef.current = { x: loadState.chunk.x, y: loadState.chunk.y };
    interiorRef.current = restoredDoorway?.area || null; setInterior(restoredDoorway?.area || null);
    interiorPositionRef.current = loadState.interiorPosition; setInteriorPosition(loadState.interiorPosition);
    onRestorePrison(loadState.inPrison || false, loadState.prisonState);
    if (loadState.journal) onRestoreJournal(loadState.journal);
    if (loadState.reputation) onRestoreReputation(loadState.reputation);
    // BUILD 330: dialogue state is optional — old saves simply start neutral.
    if (loadState.dialogue) {
      if (loadState.dialogue.disposition) setDisposition(loadState.dialogue.disposition);
      if (typeof loadState.dialogue.wantedMosslight === 'number') setWantedMosslight(loadState.dialogue.wantedMosslight);
    }
    setLogs(loadState.logs); setTime(loadState.time);
    carriageEarningsRef.current = deserializeCarriage(loadState.carriage);
    // Civ phase 18: resume a carriage ride that was saved mid-travel.
    const savedRide = loadState.carriageTravel;
    if (savedRide && typeof savedRide.destName === 'string' && savedRide.destChunk && savedRide.arrival
        && savedRide.totalTicks > 0 && savedRide.doneTicks < savedRide.totalTicks) {
      runCarriageTravel(savedRide.destName, savedRide.destChunk, savedRide.arrival, savedRide.totalTicks, savedRide.doneTicks);
      setLogs((currentLogs) => [{ text: `Your carriage journey to ${savedRide.destName} resumes.`, color: 'blue' }, ...currentLogs].slice(0, 3));
    }
    escortHiredRef.current = !!loadState.escortHired; setEscortHired(!!loadState.escortHired);
    const restoredQuests = loadState.questLog ? parseQuestStates(loadState.questLog) : [];
    questStatesRef.current = restoredQuests; setQuestStates(restoredQuests);
    const restoredChests = parseOpenedChests(loadState.openedChests);
    openedChestsRef.current = restoredChests; setOpenedChests(restoredChests);
    const restoredLooted = parseOpenedChests(loadState.lootedPois);
    lootedPoisRef.current = restoredLooted; setLootedPois(restoredLooted);
    // Civilization: restore the simulated hierarchy, or rebuild it lazily.
    if (loadState.civ) {
      try {
        civRef.current = deserializeCivilization(loadState.civ);
      } catch {
        civRef.current = null;
      }
    } else {
      civRef.current = null;
    }
    // World horses: restore, or rebuild lazily on a corrupt save.
    if (loadState.horses) {
      try {
        const restored = deserializeHorses(loadState.horses);
        const rebuilt = ensureHorses();
        horsesRef.current = { horses: restored.horses, stables: restored.stables, owners: rebuilt.owners };
      } catch {
        horsesRef.current = null;
      }
    } else {
      horsesRef.current = null;
    }
    setNpcDialogue(null); setAttackFlash(null); setLogOpen(false); setMoving(false);
    if (loadState.brainState) {
      // Phase 1: persistent world time must survive a corrupt/incompatible
      // brain save — never let a bad clock break the whole load.
      try {
        brainRef.current?.loadGameState(loadState.brainState);
      } catch {
        // Keep the fresh world clock.
      }
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
      clearTouchHolds(touchHoldsRef.current);
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
      // Living-town roster: step townsfolk toward their schedule targets on
      // the same lightweight interval (only exists in the player's chunk).
      const folkAnchors = townsfolkAnchorsRef.current;
      const folkClock = brainRef.current?.worldCore.getClock();
      if (folkAnchors && folkClock && townsfolkRef.current.length > 0) {
        const next = advanceTownsfolk(townsfolkRef.current, folkAnchors, folkClock, townsfolkNavRef.current!);
        if (next.some((npc, index) => npc !== townsfolkRef.current[index])) {
          townsfolkRef.current = next;
          setTownsfolk(next);
        }
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

  // BUILD 334: ambient barks for everyone — townsfolk, static town NPCs and
  // road travelers greet the player when nearby. Own 2s interval so the
  // checks stay cheap; throttled per NPC (~75s), each bubble visible ~4s.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (interiorRef.current) return;
      const clock = brainRef.current?.worldCore.getClock();
      if (!clock) return;
      const now = Date.now();
      let changed = false;
      for (const key of Object.keys(barksRef.current)) {
        if (barksRef.current[key].until <= now) { delete barksRef.current[key]; changed = true; }
      }
      const px = positionRef.current.x, py = positionRef.current.y;
      const consider = (id: string, x: number, y: number, ctx: Omit<BarkContext, 'minuteOfDay' | 'day'>) => {
        if (barksRef.current[id]) return;
        if (now - (lastBarkRef.current[id] || 0) < 75000) return;
        if (Math.hypot(x - px, y - py) > 14) return;
        if (!shouldBark(ctx.disposition, ctx.seed, clock.day)) return;
        barksRef.current[id] = {
          text: barkFor({ ...ctx, minuteOfDay: clock.minuteOfDay, day: clock.day }),
          until: now + 4000,
        };
        lastBarkRef.current[id] = now;
        changed = true;
      };
      for (const npc of townsfolkRef.current) {
        if (npc.indoors) continue;
        consider(npc.id, npc.position.x, npc.position.y, {
          archetype: npc.archetype, activity: npc.activity,
          disposition: dispositionRef.current[npc.id] ?? defaultDisposition(), seed: npc.seed,
        });
      }
      for (const npc of npcStatesRef.current) {
        consider('npcstate-' + npc.name, npc.position.x, npc.position.y, {
          archetype: npc.role, activity: npc.title, disposition: 50, seed: seedForName(npc.name),
        });
      }
      for (const t of travelersRef.current) {
        consider(t.id, t.position.x, t.position.y, {
          archetype: 'traveler', activity: '', disposition: 50, seed: seedForName(t.id), destination: t.destination,
        });
      }
      if (changed) {
        const nextBarks: Record<string, string> = {};
        for (const [id, b] of Object.entries(barksRef.current)) nextBarks[id] = b.text;
        setBarks(nextBarks);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  // Simulation LOD policy (civ phase 17):
  // - Nearby/full: the player's chunk — goats, monsters, townsfolk, POI dens
  //   tick every frame/interval.
  // - Regional/reduced: fake-player adventurers (they live around Mosslight
  //   Crossing) tick at 1/8 rate when the player is elsewhere; logins still
  //   spawn on cadence.
  // - Distant/abstract: townsfolk roster clears when the player leaves
  //   Mosslight (re-snapped to the clock on return); travelers, caravans,
  //   military, horses, trade prices, and world events are pure functions of
  //   the world clock — no per-frame cost at any distance.
  // One living-simulation tick shared by the ambient interval and the wait
  // driver. Stored in a ref so both interval callbacks stay stable.
  const advanceLivingSimTickRef = useRef(() => {});
  advanceLivingSimTickRef.current = () => {
    const nextTick = simulatedTickRef.current + 1;
    simulatedTickRef.current = nextTick;
    const liveGoats = goatsRef.current.filter((goat) => goat.disposition !== 'defeated' && goat.hp > 0);
    // A new "player" logs in every minute, up to 10.
    const withSpawns = spawnDueAdventurer(simulatedAdventurersRef.current, nextTick);
    const nearAdventurers = chunkRef.current.x === TOWNSFOLK_CHUNK.x && chunkRef.current.y === TOWNSFOLK_CHUNK.y;
    // Authoritative world-clock minutes for the adventurer exodus deadline.
    const worldClock = brainRef.current?.worldCore.getClock();
    const clockMinutes = worldClock ? worldClock.day * 1440 + worldClock.minuteOfDay : undefined;
    const next = (nearAdventurers || nextTick % 8 === 0)
      ? advanceSimulatedAdventurers(withSpawns, nextTick, liveGoats.map((goat) => ({ id: goat.id, position: goat.position })), clockMinutes)
      : withSpawns;
    // BUG-006 fix: background adventurers never touch the player's loaded
    // goats. Goat HP/disposition only change from the player's own attacks —
    // no more "random" damage on goats across the map.
    simulatedAdventurersRef.current = next;
    setSimulatedAdventurers(next);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (waitingRef.current) return; // the wait driver owns ticks while waiting
      advanceLivingSimTickRef.current();
    }, 1900);
    return () => window.clearInterval(timer);
  }, []);

  // ---- Wait / pass time (living-world phase 2) ----
  const cancelWait = () => {
    if (waitTimerRef.current !== null) {
      window.clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    waitingRef.current = false;
    setWaitProgress(null);
  };
  const startWait = (ticks: number, onComplete?: () => void) => {
    if (ticks <= 0 || waitingRef.current) return;
    cancelWait();
    waitingRef.current = true;
    setWaitSheetOpen(false);
    setWaitProgress({ done: 0, total: ticks });
    keysRef.current = {};
    clearTouchHolds(touchHoldsRef.current);
    setMoving(false);
    let remaining = ticks;
    const timer = window.setInterval(() => {
      if (remaining <= 0) { cancelWait(); if (onComplete) onComplete(); return; }
      const nextClock = brainRef.current?.worldCore.advance(1);
      if (nextClock) setTime(formatWorldClock(nextClock));
      advanceCivForClock(nextClock);
      // The world does NOT freeze: NPC schedules, travelers and the
      // simulated adventurers all advance one tick per world tick.
      advanceLivingSimTickRef.current();
      remaining -= 1;
      setWaitProgress({ done: ticks - remaining, total: ticks });
    }, 110);
    waitTimerRef.current = timer;
  };
  const waitOptionTicks = () => {
    const clock = brainRef.current?.worldCore.getClock();
    return [
      { label: 'Wait 1 hour', ticks: 6 },
      { label: 'Wait 2 hours', ticks: 12 },
      { label: 'Wait 4 hours', ticks: 24 },
      { label: 'Wait 8 hours', ticks: 48 },
      { label: 'Wait until morning (6 AM)', ticks: clock ? ticksUntilHour(clock, 6) : 48 },
      { label: 'Wait until evening (6 PM)', ticks: clock ? ticksUntilHour(clock, 18) : 48 },
    ];
  };
  // Shared arrival: places the player at the destination's real station/stop.
  const completeCarriageArrival = (destName: string, destChunk: Point, arrival: Point) => {
    positionRef.current = arrival;
    setPosition(arrival);
    const horseArrival = { x: Math.min(132, arrival.x + 6), y: Math.min(132, arrival.y + 6) };
    horseRef.current = { chunk: destChunk, position: horseArrival };
    setHorse(horseRef.current);
    brainRef.current?.visitChunk(destChunk, chunkRegion(destChunk), 'by carriage');
    chunkRef.current = destChunk;
    setChunk(destChunk);
    onChunkChange(destChunk);
    const discoveredTile = mapTileFor(destChunk);
    const discoveredLandmark = discoveredTile?.landmark;
    if (discoveredLandmark) {
      onDiscoverLocation(discoveredLandmark.name, discoveredLandmark.kind, destChunk);
      setLogs((currentLogs) => [{ text: 'Discovered: ' + discoveredLandmark.name, color: 'green' }, ...currentLogs].slice(0, 5));
    }
    setLogs((currentLogs) => [{ text: `You arrive at ${destName} by carriage. Your horse was tied behind.`, color: 'green' }, ...currentLogs].slice(0, 5));
  };
  const cancelCarriageTravel = () => {
    if (carriageTravelTimerRef.current !== null) {
      window.clearInterval(carriageTravelTimerRef.current);
      carriageTravelTimerRef.current = null;
    }
    waitingRef.current = false;
    setCarriageTravel(null);
  };
  const startCarriageTravel = (dest: CarriageDestination, driverName: string) => {
    if (carriageTravel || waitingRef.current) return;
    if (inventory.coins < dest.price) {
      setLogs((currentLogs) => [{ text: "You don't have enough gold.", color: 'red' }, ...currentLogs].slice(0, 5));
      return;
    }
    onLoot({ coins: -dest.price } as GoatLoot);
    carriageEarningsRef.current[driverName] = (carriageEarningsRef.current[driverName] || 0) + dest.price;
    const arrivalStation = getCarriageStation(dest.chunk);
    const arrivalStop = arrivalStation ? null : getCarriageStop(dest.chunk);
    const arrival = arrivalStation ? arrivalStation.layout.arrival : arrivalStop ? arrivalStop.arrival : { x: 70, y: 70 };
    const totalTicks = carriageTravelTicks(dest.distance);
    setCarriageDialog(null);
    setMounted(false);
    runCarriageTravel(dest.name, dest.chunk, arrival, totalTicks, 0);
  };
  // Civ phase 18: the travel driver, shared by fresh departures and save/load
  // resume. The whole state is serializable, so a mid-ride save restores it.
  const carriageTravelRef = useRef<{ destName: string; destChunk: Point; arrival: Point; totalTicks: number; doneTicks: number } | null>(null);
  useEffect(() => { carriageTravelRef.current = carriageTravel; }, [carriageTravel]);
  const runCarriageTravel = (destName: string, destChunk: Point, arrival: Point, totalTicks: number, startDone: number) => {
    if (carriageTravelTimerRef.current !== null) window.clearInterval(carriageTravelTimerRef.current);
    waitingRef.current = true; // locks input like the wait driver
    keysRef.current = {};
    clearTouchHolds(touchHoldsRef.current);
    setMoving(false);
    setCarriageTravel({ destName, destChunk, arrival, totalTicks, doneTicks: startDone });
    let done = startDone;
    const timer = window.setInterval(() => {
      const nextClock = brainRef.current?.worldCore.advance(1);
      if (nextClock) setTime(formatWorldClock(nextClock));
      advanceCivForClock(nextClock);
      advanceLivingSimTickRef.current();
      done += 1;
      if (done >= totalTicks) {
        if (carriageTravelTimerRef.current !== null) window.clearInterval(carriageTravelTimerRef.current);
        carriageTravelTimerRef.current = null;
        setCarriageTravel(null);
        waitingRef.current = false;
        // Arrive: the destination station/stop already exists in its chunk.
        completeCarriageArrival(destName, destChunk, arrival);
        return;
      }
      setCarriageTravel({ destName, destChunk, arrival, totalTicks, doneTicks: done });
    }, 110);
    carriageTravelTimerRef.current = timer;
  };
  useEffect(() => () => {
    if (carriageTravelTimerRef.current !== null) window.clearInterval(carriageTravelTimerRef.current);
  }, []);
  useEffect(() => () => {
    if (waitTimerRef.current !== null) window.clearInterval(waitTimerRef.current);
    waitingRef.current = false;
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

  // ---- Ranged combat + woodcutting state ----
  const [arrows, setArrows] = useState<ArrowState[]>([]);
  const arrowsRef = useRef<ArrowState[]>([]);
  const arrowIdRef = useRef(1);
  const equippedBowRef = useRef(false);
  useEffect(() => { equippedBowRef.current = equippedBow; }, [equippedBow]);
  const [felledTrees, setFelledTrees] = useState<Record<string, number>>({});
  const felledTreesRef = useRef<Record<string, number>>({});
  const treeHitsRef = useRef<Record<string, number>>({});
  const purgeRegrownTrees = () => {
    const now = Date.now();
    let changed = false;
    for (const key of Object.keys(felledTreesRef.current)) {
      if (felledTreesRef.current[key] <= now) {
        delete felledTreesRef.current[key];
        felledTreeKeys.delete(key);
        changed = true;
      }
    }
    if (changed) setFelledTrees({ ...felledTreesRef.current });
    return changed;
  };
  const isTreeFelled = (key: string) => {
    const until = felledTreesRef.current[key];
    if (until == null) return false;
    if (until <= Date.now()) {
      delete felledTreesRef.current[key];
      felledTreeKeys.delete(key);
      return false;
    }
    return true;
  };
  // Regrow stumps back into trees after a few minutes.
  useEffect(() => {
    const timer = window.setInterval(purgeRegrownTrees, 5000);
    return () => window.clearInterval(timer);
  }, []);

  // Shared player-damage application: melee swings and arrows both land here,
  // so defeat, loot, XP and level-ups behave identically at any range.
  // BUILD 326: shared XP grant + level-up handling for creature defeats
  // (field monsters and cellar rats). The goat branch keeps its own inline
  // copy because it also rescales goats on level-up.
  const grantCombatXp = (xpReward: number, hitPosition: Point) => {
    const nextXp = playerXpRef.current + xpReward; const nextLevel = Math.floor(nextXp / 100) + 1; const previousLevel = playerLevelRef.current;
    playerXpRef.current = nextXp; setPlayerXp(nextXp);
    spawnCombatText('+' + xpReward + ' XP', hitPosition, 'reward');
    if (nextLevel > previousLevel) {
      const awardedStatPoints = (nextLevel - previousLevel) * PLAYER_STAT_POINTS_PER_LEVEL;
      playerLevelRef.current = nextLevel; setPlayerLevel(nextLevel); onStatPointsChange((current) => current + awardedStatPoints);
      spawnCombatText('LEVEL UP! Lv. ' + nextLevel, hitPosition, 'reward');
      setLogs((currentLogs) => [{ text: 'Level up! You reached level ' + nextLevel + ' (+' + awardedStatPoints + ' stat points).', color: 'blue' }, ...currentLogs].slice(0, 3));
    }
  };

  const applyPlayerHitToCreature = (attackTarget: { entityKind: 'goat' | 'monster' } & GoatState & Partial<MonsterState>, damage: number, critical: boolean) => {
    const nextHp = Math.max(0, attackTarget.hp - damage);
    const defeated = nextHp <= 0;
    const hitPosition = { ...attackTarget.position };
    const targetLabel = attackTarget.entityKind === 'monster' ? ((attackTarget as MonsterState).kind || 'creature') : 'goat';
    if (attackTarget.entityKind === 'monster') {
      const monsterTarget = attackTarget as MonsterState;
      const updatedMonsters = monstersRef.current.map((monster) => monster.id === monsterTarget.id ? { ...monster, hp: nextHp, position: monster.position, disposition: defeated ? 'defeated' as GoatDisposition : 'aggressive' as GoatDisposition, state: defeated ? 'die' as GoatStateName : 'hurt' as GoatStateName, hurtTimer: defeated ? 0 : 300, attackCooldown: 0, attacking: false, hitFlash: true, provoked: true } : monster);
      monstersRef.current = updatedMonsters; setMonsters(updatedMonsters);
      spawnCombatText((critical ? 'CRIT ' : '') + '-' + damage, hitPosition, critical ? 'critical' : 'damage');
      playCombatSound('shing', muted);
      window.setTimeout(() => setMonsters((current) => current.map((monster) => monster.id === monsterTarget.id ? { ...monster, hitFlash: false } : monster)), 100);
      setLogs((currentLogs) => [{ text: defeated ? targetLabel + ' defeated.' : 'You hit the ' + targetLabel + ' for ' + damage + (critical ? ' critical' : '') + ' damage.', color: defeated ? 'blue' : 'red' }, ...currentLogs].slice(0, 3));
      if (defeated) {
        // RuneScape-style: the kill drops everything the monster was carrying
        // (wielded gear) plus bones for humanoids, on top of its normal loot.
        const loot: GoatLoot = { ...monsterLootForKind(monsterTarget.kind), ...monsterTarget.gear, ...bonesForMonster(monsterTarget.kind) };
        const drop: DroppedLoot = { id: droppedLootIdRef.current++, chunk: { ...chunkRef.current }, position: hitPosition, loot };
        droppedLootRef.current = [...droppedLootRef.current, drop]; setDroppedLoot(droppedLootRef.current);
        // Quest hook: kills feed kill stages (rats, wolves, bandits, trolls).
        emitQuestEvent({ type: 'kill', target: monsterTarget.kind });
        const xpReward = goatExperienceReward(monsterTarget, playerLevelRef.current, playerStatsRef.current);
        grantCombatXp(xpReward, hitPosition);
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
    }
  };

  // BUILD 326: damage resolution for Tankard Cellar rats. Same cadence as the
  // field path (hit flash, crit text, loot, XP, quest event) but loot goes
  // straight into the inventory — a field-coordinate drop would land outside
  // the tavern when the player climbs back up.
  const applyHitToCellarRat = (rat: CellarRat, damage: number, critical: boolean) => {
    const nextHp = Math.max(0, rat.hp - damage);
    const defeated = nextHp <= 0;
    const hitPosition = { x: rat.x, y: rat.y };
    const updated = cellarRatsRef.current.map((r) => r.id === rat.id ? { ...r, hp: nextHp, hitFlash: true } : r);
    syncCellarRats(updated);
    spawnCombatText((critical ? 'CRIT ' : '') + '-' + damage, hitPosition, critical ? 'critical' : 'damage');
    playCombatSound('shing', muted);
    window.setTimeout(() => syncCellarRats(cellarRatsRef.current.map((r) => r.id === rat.id ? { ...r, hitFlash: false } : r)), 100);
    setLogs((currentLogs) => [{ text: defeated ? 'Rat defeated.' : 'You hit the rat for ' + damage + (critical ? ' critical' : '') + ' damage.', color: defeated ? 'blue' : 'red' }, ...currentLogs].slice(0, 3));
    if (defeated) {
      const loot: GoatLoot = monsterLootForKind('rat');
      if ((loot.coins || 0) > 0) {
        onLoot(loot);
        setLogs((currentLogs) => [{ text: 'You find ' + loot.coins + ' coin' + (loot.coins === 1 ? '' : 's') + ' on the rat.', color: 'blue' }, ...currentLogs].slice(0, 3));
      }
      // Quest hook: cellar rat kills feed the kill-rats stage.
      emitQuestEvent({ type: 'kill', target: 'rat' });
      const xpReward = goatExperienceReward({ level: 1 } as GoatState, playerLevelRef.current, playerStatsRef.current);
      grantCombatXp(xpReward, hitPosition);
    }
  };

  // Fire a player arrow toward a facing (or straight at the selected target).
  const firePlayerArrow = (direction: Direction, targetId: number | null) => {
    const origin = { ...positionRef.current };
    const stats = playerStatsRef.current;
    const critical = Math.random() < playerCriticalChanceForStats(stats);
    const damage = Math.round(playerDamageForStats(stats) * (critical ? 2 : 1) * BOW_ARROW_DAMAGE_MULT * beerDamageMultiplier(beerBuffUntil));
    let dx = 0; let dy = 0;
    const target = targetId == null ? null : [...goatsRef.current, ...monstersRef.current].find((c) => c.id === targetId && c.disposition !== 'defeated');
    if (target && Math.hypot(target.position.x - origin.x, target.position.y - origin.y) <= ARROW_RANGE) {
      const dist = Math.hypot(target.position.x - origin.x, target.position.y - origin.y) || 1;
      dx = (target.position.x - origin.x) / dist; dy = (target.position.y - origin.y) / dist;
    } else {
      dx = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;
      dy = direction === 'down' ? 1 : direction === 'up' ? -1 : 0;
    }
    const arrow: ArrowState = { id: arrowIdRef.current++, chunk: { ...chunkRef.current }, position: origin, dx, dy, traveled: 0, damage, critical, hostile: false };
    arrowsRef.current = [...arrowsRef.current, arrow]; setArrows(arrowsRef.current);
    playCombatSound('shing', muted);
  };

  // BUILD 337: surface script errors outside the frame loop too, so a real
  // root cause is visible on screen instead of failing silently.
  useEffect(() => {
    const onError = (event: ErrorEvent) => { recordLoopError(event.error || event.message); };
    const onRejection = (event: PromiseRejectionEvent) => { recordLoopError(event.reason); };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    const clearInput = () => {
      keysRef.current = {};
      clearTouchHolds(touchHoldsRef.current);
      setMoving(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (inputLocked || optionsOpen || waitingRef.current) return;
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
    // BUILD 336 (attack-freeze root cause, for real this time): releasing a
    // D-pad hold on touchcancel desyncs input permanently when iOS cancels
    // the in-flight D-pad touch while the thumb is still down (second finger
    // taps Attack -> cancel -> no further events for that touch, ever).
    // Instead, holds are reconciled against the live touch list on every
    // document touch event: cancelled touches are kept (their id is in
    // changedTouches), genuinely-dead touches are reaped, and a touchend
    // still releases definitively. Any desync heals on the next tap.
    const revalidateFromEvent = (kind: TouchEventKind) => (event: globalThis.TouchEvent) => {
      const touches: number[] = [];
      for (let index = 0; index < event.touches.length; index += 1) touches.push(event.touches[index].identifier);
      const changed: number[] = [];
      for (let index = 0; index < event.changedTouches.length; index += 1) changed.push(event.changedTouches[index].identifier);
      const released = revalidateTouchHolds(touchHoldsRef.current, kind, touches, changed);
      if (released.length > 0) setMoving(anyDirectionHeld());
    };
    const onDocumentTouchStart = revalidateFromEvent('start');
    const onDocumentTouchEnd = revalidateFromEvent('end');
    const onDocumentTouchCancel = revalidateFromEvent('cancel');
    document.addEventListener('touchstart', onDocumentTouchStart, { passive: true });
    document.addEventListener('touchend', onDocumentTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onDocumentTouchCancel, { passive: true });
    // BUILD 325 (attack-freeze root cause): iOS Safari fires its own
    // gesturestart/gesturechange events for multi-touch sequences, independent
    // of the viewport meta. When a second finger taps the Attack button while
    // the D-pad is held, WebKit's gesture recognizer can claim the sequence
    // and cancel the in-flight D-pad touch (touchcancel) — freezing movement
    // until the thumb lifts and re-presses, while the world keeps simulating.
    // Blocking the gesture events on the game frame stops the recognizer from
    // ever taking the touch sequence. Single-finger taps still synthesize
    // click normally, so Attack/Talk buttons keep working, and the world-map
    // modal (rendered outside the game frame) is unaffected. React synthetic
    // touch handlers are passive and cannot preventDefault, so these must be
    // native non-passive listeners.
    const gameFrame = gameFrameRef.current;
    const blockIOSGesture = (event: Event) => { event.preventDefault(); };
    if (gameFrame) {
      gameFrame.addEventListener('gesturestart', blockIOSGesture, { passive: false });
      gameFrame.addEventListener('gesturechange', blockIOSGesture, { passive: false });
      gameFrame.addEventListener('gestureend', blockIOSGesture, { passive: false });
    }

    let animationFrame = 0;
    let lastFrame = performance.now();
    // BUILD 337: the frame loop is immortal. If a single frame throws (for
    // example inside attack hit-resolution), the error is recorded and shown
    // on screen, and the next frame is ALWAYS scheduled — one bad frame can
    // never permanently freeze the character again.
    const animate = (now: number) => {
      try {
        runFrame(now);
      } catch (err) {
        recordLoopError(err);
      }
      animationFrame = window.requestAnimationFrame(animate);
    };
    const runFrame = (now: number) => {
      if (gameOverRef.current) return;
      const elapsed = Math.min(50, now - lastFrame) / 1000;
      lastFrame = now;
      // BUILD 307: attacks no longer root the player. The swing animation,
      // hit timing and cooldown still pace combat, but movement input stays
      // live during the swing so fighting never feels like a freeze.
      // BUILD 325: merge keyboard state (keysRef) with D-pad touch holds so a
      // touch-tracked press drives movement even if keysRef was never set.
      const heldRight = keysRef.current.right === true || isTouchHeld(touchHoldsRef.current, 'right');
      const heldLeft = keysRef.current.left === true || isTouchHeld(touchHoldsRef.current, 'left');
      const heldDown = keysRef.current.down === true || isTouchHeld(touchHoldsRef.current, 'down');
      const heldUp = keysRef.current.up === true || isTouchHeld(touchHoldsRef.current, 'up');
      const input = {
        x: inputLocked || optionsOpen || waitingRef.current ? 0 : (heldRight ? 1 : 0) - (heldLeft ? 1 : 0),
        y: inputLocked || optionsOpen || waitingRef.current ? 0 : (heldDown ? 1 : 0) - (heldUp ? 1 : 0),
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
          try {
          if (playerAttack.ranged) {
            // Bow equipped: loose an arrow toward the facing (or the selected
            // target). Works on foot and on horseback.
            firePlayerArrow(playerAttack.direction, playerAttack.targetId);
          } else {
          // BUILD 326: in the Tankard Cellar the swing targets rats using the
          // interior position as the attacker origin. Field goats/monsters/
          // corn are excluded down there — their field-unit coordinates share
          // the same number range as interior percents and would false-hit.
          const inCellar = interiorRef.current?.roomType === 'cellar';
          const attackerPos = inCellar ? interiorPositionRef.current : positionRef.current;
          const ratCandidates = inCellar
            ? cellarRatsRef.current
              .filter((rat) => rat.hp > 0 && goatIsInAttackArc({ position: { x: rat.x, y: rat.y } } as GoatState, attackerPos, playerAttack.direction))
              .map((rat) => ({ ...rat, position: { x: rat.x, y: rat.y }, entityKind: 'cellar-rat' as const }))
            : [];
          const goatCandidates = inCellar ? [] : (goatsRef.current as (GoatState & { entityKind?: string })[])
            .filter((goat) => goat.disposition !== 'defeated' && goatIsInAttackArc(goat, attackerPos, playerAttack.direction))
            .map((goat) => ({ ...goat, entityKind: 'goat' as const }));
          const monsterCandidates = inCellar ? [] : (monstersRef.current as (MonsterState & { entityKind?: string })[])
            .filter((monster) => monster.disposition !== 'defeated' && goatIsInAttackArc(monster, attackerPos, playerAttack.direction))
            .map((monster) => ({ ...monster, entityKind: 'monster' as const }));
          const cornCandidates = inCellar ? [] : cornStalksRef.current
            .filter((stalk) => {
              if (stalk.harvested) return false;
              // Corn is harvested with a scythe-like swing: any stalk within
              // reach counts, not just the facing arc (player stands among rows).
              const dist = Math.hypot(stalk.position.x - attackerPos.x, stalk.position.y - attackerPos.y);
              return dist <= 4.5 || goatIsInAttackArc(stalk as unknown as GoatState, attackerPos, playerAttack.direction);
            })
            .map((stalk) => ({ ...stalk, entityKind: 'corn' as const }));
          const attackCandidates: Array<(typeof goatCandidates)[number] | (typeof monsterCandidates)[number] | (typeof cornCandidates)[number] | (typeof ratCandidates)[number]> =
            [...goatCandidates, ...monsterCandidates, ...cornCandidates, ...ratCandidates]
              .sort((a, b) => goatDistance(a as unknown as GoatState, attackerPos) - goatDistance(b as unknown as GoatState, attackerPos));
          const attackTarget = playerAttack.targetId == null
            ? attackCandidates[0]
            : attackCandidates.find((goat) => goat.id === playerAttack.targetId);
          if (attackTarget && goatIsInAttackArc(attackTarget as GoatState, attackerPos, playerAttack.direction)) {
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
            } else if (attackTarget.entityKind === 'cellar-rat') {
              const stats = playerStatsRef.current;
              const critical = Math.random() < playerCriticalChanceForStats(stats);
              const damage = playerDamageForStats(stats) * (critical ? 2 : 1) * beerDamageMultiplier(beerBuffUntil);
              const rat = cellarRatsRef.current.find((r) => r.id === attackTarget.id && r.hp > 0);
              if (rat) applyHitToCellarRat(rat, damage, critical);
            } else {
            const stats = playerStatsRef.current;
            const critical = Math.random() < playerCriticalChanceForStats(stats);
            const damage = playerDamageForStats(stats) * (critical ? 2 : 1) * beerDamageMultiplier(beerBuffUntil);
            applyPlayerHitToCreature(attackTarget as { entityKind: 'goat' | 'monster' } & GoatState & Partial<MonsterState>, damage, critical);
            } // end harvest else
          } else {
            // Woodcutting: a melee swing that hits no creature may still chop
            // a tree in the arc. Enough swings fell it into wood pickups and
            // leave a stump that regrows after a few minutes. Never in the
            // cellar — there are no trees down there.
            if (!inCellar) {
            const treeTarget = fieldTreesFor(chunkRef.current).find((tree) => {
              const key = fieldTreeKey(chunkRef.current, tree.id);
              if (isTreeFelled(key)) return false;
              // BUILD 338: trees carry x/y, not a .position — the old
              // goatIsInAttackArc(tree as GoatState) cast dereferenced
              // undefined.position and threw on every whiffed swing, which
              // killed the frame loop before BUILD 337's immortal loop.
              return isInMeleeArc(positionRef.current, { x: tree.x, y: tree.y }, playerAttack.direction);
            });
            if (treeTarget) {
              const key = fieldTreeKey(chunkRef.current, treeTarget.id);
              const hits = (treeHitsRef.current[key] || 0) + 1;
              treeHitsRef.current[key] = hits;
              const hitPosition = { x: treeTarget.x, y: treeTarget.y };
              if (hits >= TREE_HITS_TO_FELL) {
                delete treeHitsRef.current[key];
                felledTreesRef.current[key] = Date.now() + TREE_REGROW_MS;
                felledTreeKeys.add(key);
                setFelledTrees({ ...felledTreesRef.current });
                const woodCount = 2 + Math.floor(Math.random() * 3);
                const drop: DroppedLoot = { id: droppedLootIdRef.current++, chunk: { ...chunkRef.current }, position: hitPosition, loot: { wood: woodCount } };
                droppedLootRef.current = [...droppedLootRef.current, drop]; setDroppedLoot(droppedLootRef.current);
                spawnCombatText('+' + woodCount + ' wood', hitPosition, 'reward');
                playCombatSound('shing', muted);
                setLogs((currentLogs) => [{ text: 'You chop down a tree. +' + woodCount + ' wood.', color: 'blue' }, ...currentLogs].slice(0, 3));
              } else {
                spawnCombatText('chop', hitPosition, 'damage');
                playCombatSound('shing', muted);
              }
            }
            } // end cellar woodcutting guard
          }
          } // end bow-ranged else
          } catch (hitErr) {
            // BUILD 337: a failed hit-resolution must never wedge the attack
            // state (or the frame). Record it and let the swing complete.
            recordLoopError(hitErr);
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
          const result = updateGoat({ ...goat, state: goat.state ?? 'idle', hurtTimer: goat.hurtTimer ?? 0, attackTimer: goat.attackTimer ?? 0, attackHitApplied: goat.attackHitApplied ?? false, threatLevel: playerLevelRef.current }, currentPlayer, facingRef.current, currentGoats, elapsed * 1000);
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
          const result = updateGoat({ ...monster, state: monster.state ?? 'idle', hurtTimer: monster.hurtTimer ?? 0, attackTimer: monster.attackTimer ?? 0, attackHitApplied: monster.attackHitApplied ?? false, threatLevel: playerLevelRef.current }, currentPlayer, facingRef.current, currentMonsters, elapsed * 1000);
          let next = { ...result.goat, kind: monster.kind, id: monster.id, variant: monster.variant, ranged: monster.ranged, spawnPosition: monster.spawnPosition, roamRadius: monster.roamRadius, level: monster.level, maxHp: monster.maxHp, wanderSeed: monster.wanderSeed, hitFlash: monster.hitFlash, respawnTicks: monster.respawnTicks } as MonsterState;
          if (next.moving && isFieldPositionBlocked(next.position, currentChunk)) next = { ...next, position: monster.position, moving: false };
          if (result.attackHit) {
            const damage = goatAttackDamageForLevel(monster.level); damageTaken += damage;
            spawnCombatText('-' + damage, currentPlayer, 'damage'); playCombatSound('shing', muted);
          }
          // Ranged NPCs (bandit/goblin/orc archers) loose arrows at range instead of closing to melee.
          if (next.ranged && next.disposition === 'aggressive' && next.attackCooldown <= 0) {
            const distToPlayer = Math.hypot(next.position.x - currentPlayer.x, next.position.y - currentPlayer.y);
            if (distToPlayer > 7 && distToPlayer <= 30) {
              const dist = distToPlayer || 1;
              const arrow: ArrowState = { id: arrowIdRef.current++, chunk: { ...currentChunk }, position: { ...next.position }, dx: (currentPlayer.x - next.position.x) / dist, dy: (currentPlayer.y - next.position.y) / dist, traveled: 0, damage: goatAttackDamageForLevel(next.level), critical: false, hostile: true };
              arrowsRef.current = [...arrowsRef.current, arrow]; setArrows(arrowsRef.current);
              const archerId = next.id;
              next = { ...next, attackCooldown: 3200, state: 'attack' as GoatStateName, attackTimer: GOAT_ATTACK_WINDUP_MS, attackHitApplied: true, attacking: true };
              window.setTimeout(() => setMonsters((current) => current.map((m) => m.id === archerId ? { ...m, attacking: false } : m)), 350);
            }
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
      // Arrows in flight: player bow shots and bandit-archer volleys.
      if (!interiorRef.current && arrowsRef.current.length > 0) {
        const currentChunk = chunkRef.current;
        const currentPlayer = positionRef.current;
        const nextArrows: ArrowState[] = [];
        let playerDamageTaken = 0;
        for (const arrow of arrowsRef.current) {
          if (arrow.chunk.x !== currentChunk.x || arrow.chunk.y !== currentChunk.y) continue;
          const step = Math.min(ARROW_SPEED * elapsed, ARROW_RANGE - arrow.traveled);
          const position = { x: arrow.position.x + arrow.dx * step, y: arrow.position.y + arrow.dy * step };
          const traveled = arrow.traveled + step;
          if (traveled >= ARROW_RANGE || position.x < 4 || position.x > 136 || position.y < 4 || position.y > 136) continue;
          if (arrow.hostile) {
            if (Math.hypot(position.x - currentPlayer.x, position.y - currentPlayer.y) < 3) {
              playerDamageTaken += arrow.damage;
              spawnCombatText('-' + arrow.damage, currentPlayer, 'damage');
              continue;
            }
          } else {
            const hitGoat = goatsRef.current.find((goat) => goat.disposition !== 'defeated' && Math.hypot(position.x - goat.position.x, position.y - goat.position.y) < 3);
            const hitMonster = hitGoat ? null : monstersRef.current.find((monster) => monster.disposition !== 'defeated' && Math.hypot(position.x - monster.position.x, position.y - monster.position.y) < 3);
            const hit = hitGoat ? { ...hitGoat, entityKind: 'goat' as const } : hitMonster ? { ...hitMonster, entityKind: 'monster' as const } : null;
            if (hit) {
              applyPlayerHitToCreature(hit as { entityKind: 'goat' | 'monster' } & GoatState & Partial<MonsterState>, arrow.damage, arrow.critical);
              continue;
            }
          }
          nextArrows.push({ ...arrow, position, traveled });
        }
        if (playerDamageTaken > 0) {
          const nextHp = Math.max(0, playerHpRef.current - playerDamageTaken); playerHpRef.current = nextHp; setPlayerHp(nextHp);
          setLogs((currentLogs) => [{ text: 'A bandit arrow strikes you for ' + playerDamageTaken + ' damage.', color: 'red' }, ...currentLogs].slice(0, 3));
          playCombatSound('shing', muted);
          if (nextHp <= 0 && !gameOverRef.current) { gameOverRef.current = true; setGameOver(true); }
        }
        arrowsRef.current = nextArrows; setArrows(nextArrows);
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
           // BUILD 326: the cellar ladder climbs back up into the tavern the
           // player descended from — never out to the field.
           if (currentInterior.roomType === 'cellar' && interiorReturnRef.current) {
             const backTo = interiorReturnRef.current;
             interiorReturnRef.current = null;
             interiorRef.current = backTo; setInterior(backTo);
             interiorPositionRef.current = { x: 50, y: 62 }; setInteriorPosition({ x: 50, y: 62 });
             setMoving(false);
             setLogs((currentLogs) => [{ text: 'You climb back up into the Rusty Tankard.', color: 'blue' }, ...currentLogs].slice(0, 3));
           } else {
           // Compute exit position fresh from the doorway (not stored data) to ensure
           // the player appears directly outside the visible door. Use the actual
           // entry chunk, not a hardcoded one, so the doorway resolves correctly.
           let exitPosition = currentInterior.exteriorPosition;
           const doorwayId = interiorDoorwayIdRef.current;
           if (doorwayId) {
             const freshDoorway = buildingDoorwaysFor(interiorEntryChunkRef.current).find((d) => d.id === doorwayId);
             if (freshDoorway) {
               // Use the doorway's computed exterior position (just outside the
               // door, south of the building rect), not an arbitrary offset.
               // Apply mover offsets so the exit follows the house visual —
               // otherwise the player appears at the stale base position and
               // can get stuck inside the offset collision rect.
               const off = houseOffsetsRef.current[doorwayId] || { x: 0, y: 0 };
               exitPosition = { x: freshDoorway.area.exteriorPosition.x + off.x, y: freshDoorway.area.exteriorPosition.y + off.y };
             }
           }
           interiorDoorwayIdRef.current = null;
           interiorRef.current = null; setInterior(null);
           interiorPositionRef.current = { x: 50, y: 89 }; setInteriorPosition({ x: 50, y: 89 });
           positionRef.current = exitPosition; setPosition(exitPosition);
           setLogs((currentLogs) => [{ text: 'You step back outside into Mosslight Crossing.', color: 'blue' }, ...currentLogs].slice(0, 3));
           }
         } else {
           const interiorPosition = next.y > 91
             ? { ...resolvedInteriorPosition, y: 91 }
             : resolvedInteriorPosition;
           interiorPositionRef.current = interiorPosition;
           setInteriorPosition(interiorPosition);
         }
         return;
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
        const nearbyDoor = doorwayNear(attempted, currentChunk, houseOffsetsRef.current);
        if (nearbyDoor && canEnterDoorway(current, attempted, nearbyDoor, direction)) {
          enterDoorway(nearbyDoor, currentChunk);
          return;
        }
        const resolved = resolveFieldMovement(current, movement, currentChunk, goatsRef.current, houseOffsetsRef.current);
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
            modulePoisForChunk(resolved.chunk, DEFAULT_WORLD_SEED, { isTownChunk: !!discoveredLandmark }).forEach((poi) => {
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
    };
    animationFrame = window.requestAnimationFrame(animate);
    const clock = window.setInterval(() => {
      if (waitingRef.current) return; // the wait driver owns the clock while waiting
      const nextClock = brainRef.current?.worldCore.advance(1);
      if (nextClock) setTime(formatWorldClock(nextClock));
      advanceCivForClock(nextClock);
    }, 3000);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearInterval(clock);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('touchstart', onDocumentTouchStart);
      document.removeEventListener('touchend', onDocumentTouchEnd);
      document.removeEventListener('touchcancel', onDocumentTouchCancel);
      if (gameFrame) {
        gameFrame.removeEventListener('gesturestart', blockIOSGesture);
        gameFrame.removeEventListener('gesturechange', blockIOSGesture);
        gameFrame.removeEventListener('gestureend', blockIOSGesture);
      }
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
    const bowEquipped = equippedBowRef.current;
    const inCellar = interiorRef.current?.roomType === 'cellar';
    // BUILD 326: combat is enabled in the Tankard Cellar (rats), melee only —
    // the bow's arrows fly in field coordinates and would break down there.
    if ((!inCellar && interiorRef.current) || (!bowEquipped && mountedRef.current) || playerAttackStateRef.current.active || playerAttackCooldownRef.current > 0) return;
    const currentPlayer = positionRef.current;
    const currentFacing = facingRef.current;
    const targetId = preferredTargetId ?? targetGoatIdRef.current;
    const target = targetId == null
      ? null
      : goatsRef.current.find((goat) => goat.id === targetId && goat.disposition !== 'defeated');
    playerAttackStateRef.current = { active: true, direction: currentFacing, targetId: target?.id ?? null, elapsed: 0, hitApplied: false, ranged: inCellar ? false : bowEquipped };
    playerAttackCooldownRef.current = PLAYER_ATTACK_COOLDOWN_MS;
    setAttackCooldownMs(PLAYER_ATTACK_COOLDOWN_MS);
    playAttackAnimation(currentFacing);
  };

  // BUILD 326: tap a cellar rat to swing at it (mirrors the field monster tap).
  const strikeCellarRat = (ratId: number) => {
    if (interiorRef.current?.roomType !== 'cellar' || inputLocked || optionsOpen || waitingRef.current || playerAttackStateRef.current.active) return;
    const rat = cellarRatsRef.current.find((r) => r.id === ratId && r.hp > 0);
    if (!rat) return;
    if (!isInMeleeArc(interiorPositionRef.current, { x: rat.x, y: rat.y }, facingRef.current)) {
      setLogs((currentLogs) => [{ text: 'The rat is too far away — get closer.', color: 'red' }, ...currentLogs].slice(0, 3));
      return;
    }
    attackGoat(ratId);
  };

  // Lockpicking: simple for now — each attempt consumes one lockpick and rolls
  // a flat success chance (pure logic in src/game/lockpicking.ts).
  const attemptPickChest = (chest: LockedChest) => {
    if (Math.hypot(chest.position.x - positionRef.current.x, chest.position.y - positionRef.current.y) > 16) return;
    if ((inventory.lockpicks || 0) < 1) {
      setLogs((c) => [{ text: 'You need lockpicks for that. Mira sells them — and bandits carry them.', color: 'red' }, ...c].slice(0, 5));
      return;
    }
    onLoot({ lockpicks: -1 } as GoatLoot);
    if (attemptLockpick(Math.random())) {
      const next = [...openedChestsRef.current, chest.id];
      openedChestsRef.current = next; setOpenedChests(next);
      const drop: DroppedLoot = { id: droppedLootIdRef.current++, chunk: { ...chunkRef.current }, position: { ...chest.position }, loot: chest.loot as GoatLoot };
      droppedLootRef.current = [...droppedLootRef.current, drop]; setDroppedLoot(droppedLootRef.current);
      setLogs((c) => [{ text: 'Click! The ' + chest.label + ' swings open.', color: 'green' }, ...c].slice(0, 5));
    } else {
      setLogs((c) => [{ text: 'The pick snaps inside the lock. The ' + chest.label + ' stays shut.', color: 'red' }, ...c].slice(0, 5));
    }
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
    // Quest hook: spider silk feeds the seamstress quest's collect stage.
    if (drop.loot.silk) emitQuestEvent({ type: 'collect', target: 'spider_silk', count: drop.loot.silk });
  };

  // ------------------------------------------------------------------
  // Quest system: state, events, rewards (pure rules in src/game/quests.ts).
  // ------------------------------------------------------------------
  const currentWorldDay = () => brainRef.current?.worldCore.getClock()?.day ?? 1;

  const grantQuestXp = (amount: number) => {
    const nextXp = playerXpRef.current + amount; const nextLevel = Math.floor(nextXp / 100) + 1; const previousLevel = playerLevelRef.current;
    playerXpRef.current = nextXp; setPlayerXp(nextXp);
    spawnCombatText('+' + amount + ' XP', positionRef.current, 'reward');
    setLogs((currentLogs) => [{ text: 'Quest reward: +' + amount + ' XP.', color: 'blue' }, ...currentLogs].slice(0, 5));
    if (nextLevel > previousLevel) {
      const awardedStatPoints = (nextLevel - previousLevel) * PLAYER_STAT_POINTS_PER_LEVEL;
      playerLevelRef.current = nextLevel; setPlayerLevel(nextLevel); onStatPointsChange((current) => current + awardedStatPoints);
      spawnCombatText('LEVEL UP! Lv. ' + nextLevel, positionRef.current, 'reward');
      setLogs((currentLogs) => [{ text: 'Level up! You reached level ' + nextLevel + ' (+' + awardedStatPoints + ' stat points).', color: 'blue' }, ...currentLogs].slice(0, 5));
    }
  };

  const completeQuest = (def: QuestDef) => {
    if (def.rewards.coins) onLoot({ coins: def.rewards.coins });
    if (def.rewards.xp) grantQuestXp(def.rewards.xp);
    // 'Hunting bow' maps to the real bow item; other reward items are keepsakes named in the log.
    if (def.rewards.items.includes('Hunting bow')) onLoot({ bow: 1 });
    if (def.rewards.reputation) onQuestReputation(def.rewards.reputation);
    const keepsakes = def.rewards.items.filter((name) => name !== 'Hunting bow');
    const rewardText = `Quest complete: ${def.title}! +${def.rewards.coins} gold, +${def.rewards.xp} XP` + (keepsakes.length ? ', ' + keepsakes.join(', ') : '') + '.';
    setLogs((currentLogs) => [{ text: rewardText, color: 'green' }, ...currentLogs].slice(0, 5));
    spawnCombatText('QUEST COMPLETE', positionRef.current, 'reward');
    announceQuestRumors();
  };

  const emitQuestEvent = (event: QuestEvent) => {
    const withDay = { ...event, day: event.day ?? currentWorldDay() };
    const completedDefs: QuestDef[] = [];
    const advancedTitles: string[] = [];
    let changed = false;
    const next = questStatesRef.current.map((st) => {
      if (st.status !== 'active') return st;
      const def = questById(st.questId);
      if (!def) return st;
      const res = advanceQuestStage(st, def, withDay);
      if (!res.advanced) return st;
      changed = true;
      if (res.completed) completedDefs.push(def);
      else advancedTitles.push(def.title + ' — ' + questProgressText(def, res.state));
      return res.state;
    });
    if (!changed) return;
    questStatesRef.current = next;
    setQuestStates(next);
    if (advancedTitles.length) setLogs((currentLogs) => [...advancedTitles.map((text) => ({ text: 'Quest updated: ' + text, color: 'blue' as const })), ...currentLogs].slice(0, 5));
    for (const def of completedDefs) completeQuest(def);
  };

  const acceptQuest = (questId: string) => {
    const def = questById(questId);
    if (!def) return;
    if (questStatesRef.current.some((s) => s.questId === questId)) return;
    const day = currentWorldDay();
    // Accepting IS talking to the giver: the opening talk stage completes at once.
    const res = advanceQuestStage(startQuest(def, day), def, { type: 'talk', target: def.giver.name, day });
    const next = [...questStatesRef.current, res.state];
    questStatesRef.current = next;
    setQuestStates(next);
    setQuestDialog(null);
    setLogs((currentLogs) => [{ text: `Quest started: ${def.title}.`, color: 'green' }, ...currentLogs].slice(0, 5));
  };

  const questStateFor = (questId: string): QuestState | undefined => questStatesRef.current.find((s) => s.questId === questId);

  const openQuestDialog = (giverName: string) => {
    const def = QUESTS.find((q) => q.giver.name === giverName);
    if (!def) return;
    const state = questStateFor(def.id);
    if (state?.status === 'completed') {
      setLogs((currentLogs) => [{ text: `${giverName} thanks you again for your help.`, color: 'blue' }, ...currentLogs].slice(0, 5));
      return;
    }
    setQuestDialog({ giverName, questId: def.id });
  };

  const announceQuestRumors = () => {
    for (const def of availableQuests(playerLevelRef.current, questStatesRef.current)) {
      if (questRumoredRef.current.has(def.id)) continue;
      questRumoredRef.current.add(def.id);
      onAddRumor(def.rumor ?? questRumors(def)[0], 'Quest: ' + def.title);
    }
  };

  // Push quest state + level up to Home so the menu's quest log can render.
  useEffect(() => { onQuestStatesChange(questStatesRef.current, playerLevelRef.current); }, [questStates, onQuestStatesChange]);
  useEffect(() => { onQuestStatesChange(questStatesRef.current, playerLevelRef.current); announceQuestRumors(); }, [playerLevel]); // eslint-disable-line react-hooks/exhaustive-deps
  // Quest site discovery: entering a site chunk advances matching explore/visit stages.
  useEffect(() => {
    const dungeonChunk = currentWorldTile.landmark && currentWorldTile.landmark.kind === 'dungeon' ? { ...chunkRef.current } : null;
    for (const st of questStatesRef.current) {
      if (st.status !== 'active') continue;
      const def = questById(st.questId);
      if (!def) continue;
      const stage = def.stages[st.stageIndex];
      if (!stage || !stage.target) continue;
      const activeStage: ActiveQuestStage = { questId: st.questId, kind: stage.kind, target: stage.target };
      if (chunkSatisfiesStage(activeStage, chunkRef.current, dungeonChunk)) {
        emitQuestEvent({ type: stage.kind === 'visit' ? 'visit' : 'explore', target: stage.target });
      }
    }
  }, [chunk]); // eslint-disable-line react-hooks/exhaustive-deps

  // BUILD 325: D-pad touch holds are tracked by touch.identifier (see
  // src/game/touchInput.ts). Only the touch that pressed a direction can
  // release it on touchend.
  // BUILD 336: touchcancel NEVER releases a hold anymore. iOS can cancel the
  // in-flight D-pad touch when a second finger taps Attack while the thumb
  // is still down, and a cancelled touch delivers no further events — so
  // releasing on cancel desynced input permanently (the freeze). Cancelled
  // holds are reconciled against the live touch list by the document-level
  // revalidator in the input effect instead. Keyboard/mouse keep the legacy
  // keysRef path (touchId undefined).
  const anyDirectionHeld = () =>
    (['up', 'down', 'left', 'right'] as Direction[]).some(
      (held) => keysRef.current[held] === true || isTouchHeld(touchHoldsRef.current, held),
    );
  // Extracted so press/release stay consistent: both ride on the same
  // changedTouches[0].identifier, falling back to the legacy keysRef path.
  const touchIdentifierOf = (event: TouchEvent<HTMLButtonElement>): number | undefined =>
    event.changedTouches.length > 0 ? event.changedTouches[0].identifier : undefined;
  const pressDirection = (direction: Direction, touchId?: number) => {
    if (inputLocked || optionsOpen || waitingRef.current) return;
    if (touchId === undefined) keysRef.current[direction] = true;
    else pressTouchHold(touchHoldsRef.current, direction, touchId);
    setMoving(true);
  };
  const releaseDirection = (direction: Direction, touchId?: number) => {
    if (touchId === undefined) {
      keysRef.current[direction] = false;
      // Defensive: an identifier-less release clears any touch hold too, so a
      // missing identifier can never wedge movement on.
      clearTouchHoldDirection(touchHoldsRef.current, direction);
    } else {
      releaseTouchHold(touchHoldsRef.current, direction, touchId);
    }
    setMoving(anyDirectionHeld());
  };
  const mousePressDirection = (direction: Direction, event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') pressDirection(direction);
  };
  const mouseReleaseDirection = (direction: Direction, event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') releaseDirection(direction);
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
  const deletedHere = deletedGenTrees[chunkKey] ?? [];
  const fieldTrees = fieldTreesFor(chunk).filter((t) => !deletedHere.includes(t.id));
  const fieldAccents = fieldAccentsFor(chunk);
  const fieldPalette = fieldPalettes[currentWorldTile.terrain];
  const startingArea = isStartingArea(chunk);
  const startingCenter = isTutorialCenter(chunk);
  // BUILD 339: LTTP-style procedural ground detail spec (painted once per chunk).
  const groundSpec: GroundDetailSpec = {
    terrain: currentWorldTile.terrain,
    field: fieldPalette.field,
    path: fieldPalette.path,
    road: (currentWorldTile.road !== 'none' && !hiddenRoadChunks.includes(chunkKey) && !currentWorldTile.bridge)
      ? currentWorldTile.road : 'none',
    roadRect: startingCenter ? { x: 0.45, y: 0.45, w: 0.11, h: 0.11 } : { x: 0.47, y: 0.47, w: 0.09, h: 0.09 },
    sea: currentWorldTile.waterFeature === 'sea',
    seed: ((chunk.x * 73856093) ^ (chunk.y * 19349663)) >>> 0,
    // BUILD 341: map-builder painted tiles for this chunk.
    paints: mapPaints[chunkKey] ?? [],
  };
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
  // BUILD 330: tapping / Talk-button on a townsfolk opens the Oblivion-style
  // dialogue window (topics, disposition, town standing). Talking warms them
  // up slightly, capped so quests remain the real way to win hearts.
  const talkToTownsfolk = (npc: Townsperson) => {
    setNameplateNpc(npc.name);
    if (nameplateTimerRef.current !== null) window.clearTimeout(nameplateTimerRef.current);
    nameplateTimerRef.current = window.setTimeout(() => {
      setNameplateNpc(null);
      nameplateTimerRef.current = null;
    }, 4000);
    setTownsfolkDialogue(npc);
    setDialogueTopic(null);
    setDisposition((d) => ({ ...d, [npc.id]: adjustDisposition(d[npc.id] ?? defaultDisposition(), 1) }));
  };

  const chooseDialogueTopic = (npc: Townsperson, topic: DialogueTopicId) => {
    if (topic === 'bye') {
      setTownsfolkDialogue(null);
      setDialogueTopic(null);
      return;
    }
    const disp = disposition[npc.id] ?? defaultDisposition();
    const resp = responseFor(
      { name: npc.name, archetype: npc.archetype, activity: npc.activity, disposition: disp, townReputation: reputation.mosslight, seed: npc.seed },
      topic,
    );
    if (resp.rumor) onAddRumor(resp.rumor, npc.name);
    setDialogueTopic(topic);
    setDisposition((d) => ({ ...d, [npc.id]: adjustDisposition(d[npc.id] ?? defaultDisposition(), 1) }));
  };
  // Pokémon-style talk: when the player faces an NPC within range, a Talk
  // button appears beside Attack. Covers quest givers, town NPCs and outdoor
  // townsfolk — the same handlers as tapping the NPC directly.
  const talkTarget = useMemo(() => {
    if (interior || moverMode || markerMode || inputLocked) return null;
    const inMosslight = currentWorldTile.landmark?.name === 'Mosslight Crossing';
    const candidates: Array<{ name: string; position: Point; talk: () => void }> = [];
    for (const giver of QUEST_GIVER_FIELD_NPCS) {
      if (giver.chunk.x !== chunk.x || giver.chunk.y !== chunk.y) continue;
      candidates.push({ name: giver.displayName, position: giver.position, talk: () => openQuestDialog(giver.name) });
    }
    if (inMosslight) {
      for (const npc of npcStates) candidates.push({ name: npc.name, position: npc.position, talk: () => talkToNpc(npc) });
      for (const npc of townsfolk) {
        if (npc.indoors) continue;
        candidates.push({ name: npc.name, position: npc.position, talk: () => talkToTownsfolk(npc) });
      }
    }
    if (candidates.length === 0) return null;
    return findTalkTarget(candidates, position, facing);
  }, [interior, moverMode, markerMode, inputLocked, currentWorldTile, chunk, npcStates, townsfolk, position, facing]);
  // Road traffic: analytic travelers resolved from the world clock (civ phase 2).
  // Recomputed whenever the clock ticks, so waiting visibly moves traffic.
  // Road links are static for the world seed — built once.
  const roadLinks = useMemo<RoadLink[]>(() => buildRoadLinks(roadArmsForChunk), []);
  const travelers = useMemo(() => {
    const clock = brainRef.current?.worldCore.getClock();
    if (!clock) return [];
    return travelersForChunk(chunk, clock, roadLinks);
  }, [chunk.x, chunk.y, time, roadLinks]);
  const travelersRef = useRef(travelers);
  useEffect(() => { travelersRef.current = travelers; }, [travelers]);
  // BUILD 329: townsfolk who are physically inside the cottage the player is
  // currently visiting (INTERIOR/SLEEPING with a matching buildingId), mapped
  // from cottage field-unit coords to interior % coords. The field renderer
  // hides indoors NPCs, so this is the only place they appear — 'At home' is
  // truthful: Inspector, activity, location, interior rendering, building id.
  const interiorTownsfolk = useMemo(() => {
    if (!interior) return [];
    const out: { npc: Townsperson; xPct: number; yPct: number }[] = [];
    for (const npc of townsfolk) {
      if (!npc.indoors || !npc.buildingId) continue;
      if (npc.location !== 'INTERIOR' && npc.location !== 'SLEEPING') continue;
      if (interiorAreaIdForCottage(npc.buildingId, chunk) !== interior.id) continue;
      const rect = cottageRectFor(npc.buildingId);
      if (!rect) continue;
      const w = Math.max(0.01, rect.right - rect.left);
      const h = Math.max(0.01, rect.bottom - rect.top);
      const xPct = Math.min(90, Math.max(10, ((npc.position.x - rect.left) / w) * 100));
      const yPct = Math.min(88, Math.max(12, ((npc.position.y - rect.top) / h) * 100));
      out.push({ npc, xPct, yPct });
    }
    return out;
  }, [interior, townsfolk, chunk.x, chunk.y]);
  // Civ phase 8: merchant caravans traveling through the player's chunk,
  // positioned analytically from the world clock (no stored movement state).
  const visibleCaravans = useMemo(() => {
    const clock = brainRef.current?.worldCore.getClock();
    if (!clock) return [];
    const civ = ensureCiv();
    const out: { id: string; merchant: string; destination: string; goods: string[]; guards: number; position: Point; facing: NpcFacing }[] = [];
    for (const caravan of civ.caravans) {
      const pos = caravanPosition(caravan, clock, civ);
      if (pos.status !== 'traveling') continue;
      if (pos.chunk.x !== chunk.x || pos.chunk.y !== chunk.y) continue;
      const dest = settlementById(civ, caravan.destinationId);
      const origin = settlementById(civ, caravan.originId);
      const route = civ.routes.find((r) => r.id === caravan.routeId);
      // BUILD 306: facing from the route direction, for the walk-in entrance.
      const facing: NpcFacing = (origin && dest)
        ? facingForDelta(dest.chunk.x - origin.chunk.x, dest.chunk.y - origin.chunk.y)
        : 'down';
      out.push({
        id: caravan.id,
        merchant: caravan.merchant,
        destination: dest?.name ?? caravan.destinationId,
        goods: [...(route?.goods ?? [])],
        guards: caravan.guards,
        position: { x: pos.position.x, y: pos.position.y },
        facing,
      });
    }
    return out;
  }, [chunk.x, chunk.y, time]);
  // Civ phase 9: military units on the player's chunk — stationed guards at
  // their home settlement, patrols/messengers at analytic journey positions.
  const visibleUnits = useMemo(() => {
    const clock = brainRef.current?.worldCore.getClock();
    if (!clock) return [];
    const civ = ensureCiv();
    const out: { id: string; name: string; kind: string; size: number; activity: string; position: Point; facing: NpcFacing }[] = [];
    for (const unit of civ.units) {
      const pos = militaryPosition(unit, clock, civ);
      if (pos.chunk.x !== chunk.x || pos.chunk.y !== chunk.y) continue;
      const target = militaryTarget(unit, clock, civ);
      // BUILD 306: facing from the journey direction, for the walk-in entrance.
      let facing: NpcFacing = 'down';
      const journey = unit.journey;
      if (journey && journey.stops.length > 1) {
        const a = journey.stops[0].chunk;
        const b = journey.stops[journey.stops.length - 1].chunk;
        facing = facingForDelta(b.x - a.x, b.y - a.y);
        if (journey.reversed) facing = facing === 'up' ? 'down' : facing === 'down' ? 'up' : facing === 'left' ? 'right' : 'left';
      }
      out.push({
        id: unit.id,
        name: unit.name,
        kind: unit.kind,
        size: unit.soldiers + unit.archers + unit.cavalry,
        activity: target.activity,
        position: { x: pos.position.x, y: pos.position.y },
        facing,
      });
    }
    return out;
  }, [chunk.x, chunk.y, time]);
  // Civ phase 11: world horses on the player's chunk — owned horses follow
  // their owner's daily routine (horseTarget), wild horses graze.
  const visibleHorses = useMemo(() => {
    const clock = brainRef.current?.worldCore.getClock();
    if (!clock) return [];
    const { horses, stables, owners } = ensureHorses();
    const out: { id: string; name: string; color: string; activity: string; owner: string; position: Point }[] = [];
    for (const h of horses) {
      const target = horseTarget(h, owners.get(h.owner) ?? null, stables, clock);
      if (target.chunk.x !== chunk.x || target.chunk.y !== chunk.y) continue;
      const ownerName = h.owner === 'wild' ? 'wild' : (owners.get(h.owner)?.name ?? 'a traveler');
      out.push({
        id: h.id,
        name: h.name,
        color: h.color,
        activity: target.activity,
        owner: ownerName,
        position: { x: target.position.x, y: target.position.y },
      });
    }
    return out;
  }, [chunk.x, chunk.y, time]);
  const talkToHorse = (h: { name: string; activity: string; owner: string }) => {
    setNameplateNpc(h.name);
    if (nameplateTimerRef.current !== null) window.clearTimeout(nameplateTimerRef.current);
    nameplateTimerRef.current = window.setTimeout(() => {
      setNameplateNpc(null);
      nameplateTimerRef.current = null;
    }, 4000);
    setLogs((currentLogs) => [{ text: `${h.name} the horse (${h.owner}'s) is ${h.activity.replace(/_/g, ' ')}.`, color: 'blue' }, ...currentLogs].slice(0, 3));
  };
  const talkToCaravan = (c: { merchant: string; destination: string; goods: string[]; guards: number }) => {
    setNameplateNpc(c.merchant);
    if (nameplateTimerRef.current !== null) window.clearTimeout(nameplateTimerRef.current);
    nameplateTimerRef.current = window.setTimeout(() => {
      setNameplateNpc(null);
      nameplateTimerRef.current = null;
    }, 4000);
    setLogs((currentLogs) => [{ text: `${c.merchant}'s caravan is bound for ${c.destination} with ${c.goods.join(', ') || 'goods'} (${c.guards} guards).`, color: 'blue' }, ...currentLogs].slice(0, 3));
  };
  const talkToUnit = (u: { name: string; kind: string; size: number; activity: string }) => {
    setNameplateNpc(u.name);
    if (nameplateTimerRef.current !== null) window.clearTimeout(nameplateTimerRef.current);
    nameplateTimerRef.current = window.setTimeout(() => {
      setNameplateNpc(null);
      nameplateTimerRef.current = null;
    }, 4000);
    setLogs((currentLogs) => [{ text: `${u.name} — ${u.kind}, ${u.size} strong: ${u.activity}.`, color: 'blue' }, ...currentLogs].slice(0, 3));
  };
  const talkToTraveler = (traveler: Traveler) => {
    setNameplateNpc(traveler.name);
    if (nameplateTimerRef.current !== null) window.clearTimeout(nameplateTimerRef.current);
    nameplateTimerRef.current = window.setTimeout(() => {
      setNameplateNpc(null);
      nameplateTimerRef.current = null;
    }, 4000);
    setLogs((currentLogs) => [{ text: `${traveler.name} the ${traveler.kind} is bound for ${traveler.destination}.`, color: 'blue' }, ...currentLogs].slice(0, 3));
  };
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
      wood: -(recipe.cost.wood || 0),
      silk: -(recipe.cost.silk || 0),
      daggers: recipe.reward.daggers || 0,
      cloths: recipe.reward.cloths || 0,
      bow: recipe.reward.bow || 0,
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
  // Rusty Tankard tavern: the bartender shares rumors, patrons share flavor.
  // Rusty Tankard: Mira's full service menu (beer, rooms, escort, rumors).
  const [tavernMenuOpen, setTavernMenuOpen] = useState(false);
  const [escortHired, setEscortHired] = useState(false);
  const escortHiredRef = useRef(false);
  useEffect(() => { escortHiredRef.current = escortHired; }, [escortHired]);
  const talkToBartender = () => { setTavernMenuOpen(true); };
  const tavernBuyBeer = () => {
    if (inventory.coins < BEER_PRICE) { setLogs((c) => [{ text: "You don't have enough gold for a beer.", color: 'red' }, ...c].slice(0, 5)); return; }
    onLoot({ coins: -BEER_PRICE, beer: 1 } as GoatLoot);
    setLogs((c) => [{ text: 'Mira slides you a foaming mug. "Drink it from your inventory — it\'ll put fire in your arm."', color: 'green' }, ...c].slice(0, 5));
  };
  const tavernBuyLockpicks = () => {
    if (inventory.coins < LOCKPICK_PRICE) { setLogs((c) => [{ text: 'Lockpicks cost ' + LOCKPICK_PRICE + ' gold. Come back when you have the coin.', color: 'red' }, ...c].slice(0, 5)); return; }
    onLoot({ coins: -LOCKPICK_PRICE, lockpicks: 1 } as GoatLoot);
    setLogs((c) => [{ text: 'Mira slides a set of picks across the bar. "No questions asked."', color: 'green' }, ...c].slice(0, 5));
  };
  const tavernSleepUntilMorning = () => {
    if (inventory.coins < ROOM_PRICE) { setLogs((c) => [{ text: "Rooms cost 10 gold. Come back when you have the coin.", color: 'red' }, ...c].slice(0, 5)); return; }
    onLoot({ coins: -ROOM_PRICE } as GoatLoot);
    setTavernMenuOpen(false);
    const heal = () => {
      const maxHp = playerMaxHpForStats(playerStatsRef.current);
      playerHpRef.current = maxHp; setPlayerHp(maxHp);
      setLogs((c) => [{ text: 'You wake at dawn fully rested. HP restored.', color: 'green' }, ...c].slice(0, 5));
    };
    const clock = brainRef.current?.worldCore.getClock();
    const ticks = clock ? ticksUntilHour(clock, 6) : 48;
    if (ticks <= 0) { heal(); return; }
    setLogs((c) => [{ text: 'Mira shows you to a small room upstairs. You sleep until morning…', color: 'blue' }, ...c].slice(0, 5));
    startWait(ticks, heal);
  };
  const tavernHireEscort = () => {
    if (escortHiredRef.current) return;
    if (inventory.coins < ESCORT_PRICE) { setLogs((c) => [{ text: "An escort costs 50 gold.", color: 'red' }, ...c].slice(0, 5)); return; }
    onLoot({ coins: -ESCORT_PRICE } as GoatLoot);
    escortHiredRef.current = true; setEscortHired(true);
    setTavernMenuOpen(false);
    // One-time bonus: a full level's worth of XP (100 XP), with level-up.
    const nextXp = playerXpRef.current + ESCORT_BONUS_XP;
    const nextLevel = Math.floor(nextXp / 100) + 1;
    const previousLevel = playerLevelRef.current;
    playerXpRef.current = nextXp; setPlayerXp(nextXp);
    if (nextLevel > previousLevel) {
      const awarded = (nextLevel - previousLevel) * PLAYER_STAT_POINTS_PER_LEVEL;
      playerLevelRef.current = nextLevel; setPlayerLevel(nextLevel);
      onStatPointsChange((current) => current + awarded);
      setLogs((c) => [{ text: `A seasoned guide takes you under their wing. Level up! You reached level ${nextLevel} (+${awarded} stat points).`, color: 'blue' }, ...c].slice(0, 5));
    } else {
      setLogs((c) => [{ text: 'A seasoned guide shares hard-won wisdom. (+' + ESCORT_BONUS_XP + ' XP)', color: 'blue' }, ...c].slice(0, 5));
    }
  };
  const tavernRumor = () => {
    const rumor = WORLD_RUMORS[Math.floor(Math.random() * WORLD_RUMORS.length)];
    onAddRumor(rumor, 'Mira');
    setLogs((currentLogs) => [{ text: `Mira leans in. "Hear this one: ${rumor}"`, color: 'purple' }, ...currentLogs].slice(0, 5));
  };
  const talkToPatron = (name: string, line: string) => {
    setLogs((currentLogs) => [{ text: `${name} says: "${line}"`, color: 'blue' }, ...currentLogs].slice(0, 5));
  };
  // Class teachers now live in the Rusty Tankard. Tapping them opens their full
  // teacher dialogue (including the level-10 class choice), same as before.
  const talkToTavernTeacher = (name: string, title: string, role: 'mage' | 'warrior' | 'rogue') => {
    setNpcDialogue({ name, title, role, position: { x: 50, y: 50 }, facing: 'down', moving: false, target: null });
    setLogs((currentLogs) => [{ text: `${name} turns to you: ${title}.`, color: 'blue' }, ...currentLogs].slice(0, 3));
  };
  const enterDoorway = (doorway: Doorway, entryChunk: Point) => {
    interiorDoorwayIdRef.current = doorway.id;
    interiorEntryChunkRef.current = { x: entryChunk.x, y: entryChunk.y };
    interiorRef.current = doorway.area; setInterior(doorway.area);
    interiorPositionRef.current = { x: 50, y: 89 }; setInteriorPosition({ x: 50, y: 89 });
    setMoving(false);
    setLogs((currentLogs) => [{ text: 'You enter the ' + doorway.area.name + '.', color: 'blue' }, ...currentLogs].slice(0, 3));
  };
  // BUILD 326: descend into the Tankard Cellar through the tavern hatch.
  // Unlike field doorways, the cellar exits back up to the tavern (tracked in
  // interiorReturnRef), not out to the field. Rats top up to a full cellar
  // when the kill-rats stage is active; otherwise a few ambient rats remain.
  const enterCellar = () => {
    const from = interiorRef.current;
    if (!from || from.roomType === 'cellar') return;
    interiorReturnRef.current = from;
    const ratStageActive = questStatesRef.current.some((st) => {
      if (st.questId !== 'rats-in-the-cellar' || st.status !== 'active') return false;
      const def = questById(st.questId);
      return def?.stages[st.stageIndex]?.id === 'kill-rats';
    });
    const want = ratStageActive ? CELLAR_RAT_COUNT : 3;
    const live = cellarRatsRef.current.filter((rat) => rat.hp > 0);
    if (live.length < want) {
      const fresh = initialCellarRats(want);
      // Keep surviving rats where they are; only add replacements.
      const topped = [...live, ...fresh.slice(live.length)];
      syncCellarRats(topped);
    }
    interiorRef.current = TANKARD_CELLAR_AREA; setInterior(TANKARD_CELLAR_AREA);
    interiorPositionRef.current = { x: 50, y: 76 }; setInteriorPosition({ x: 50, y: 76 });
    setMoving(false);
    setLogs((currentLogs) => [{ text: 'You climb down into the Tankard Cellar.', color: 'blue' }, ...currentLogs].slice(0, 3));
  };

  // Debug world editor (BUILD 274) toolbar definition.
  const editorTools: { id: EditorTool; label: string }[] = [
    { id: 'select', label: '👆 Select' },
    { id: 'house', label: '🏠 House' },
    { id: 'tree', label: '🌲 Tree' },
    { id: 'pine', label: '🌲 Big pine' },
    { id: 'rock', label: '🪨 Rock' },
    { id: 'roadH', label: '🛤️ Road ↔' },
    { id: 'roadV', label: '🛤️ Road ↕' },
    { id: 'flag', label: '🚩 Flag' },
    { id: 'erase', label: '🧹 Erase' },
    { id: 'player', label: '📍 Teleport' },
  ];
  const copyRemovalList = () => {
    const text = editorRemovalList(flaggedItems);
    const done = () => { setCopiedNotice(true); window.setTimeout(() => setCopiedNotice(false), 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      done();
    }
  };

  return (
    <div className="field-column">
      <div ref={gameFrameRef} className="game-frame" tabIndex={0} aria-label="Playable Mosslight Crossing field" data-testid="game-field" data-brain-chunk={brainRef.current?.currentChunkId || 'unknown'}>
        {interior ? <InteriorRoom area={interior} position={interiorPosition} facing={playerRenderFacing} moving={moving} equippedDagger={equippedDagger} equippedBow={equippedBow} attacking={attacking} attackSequence={attackSequence} simulatedAdventurers={simulatedAdventurers} selectedAdventurerId={selectedAdventurerId} onInspect={inspectAdventurer} onTalkToSmith={talkToSmith} onTalkToBartender={talkToBartender} onTalkToPatron={talkToPatron} onTalkToTeacher={talkToTavernTeacher} onTalkToQuestGiver={openQuestDialog} onEnterDungeon={onEnterDungeon} onEnterCellar={enterCellar} onTavernSleep={tavernSleepUntilMorning} cellarRats={cellarRats} onStrikeCellarRat={strikeCellarRat} questStates={questStates} interiorTownsfolk={interiorTownsfolk} onTalkToTownsfolk={talkToTownsfolk} /> : (
        <div className={'pixel-field world-field has-ground-detail world-region-' + currentWorldTile.regionStyle + ' map-terrain-' + currentWorldTile.terrain + (currentWorldTile.waterFeature ? ' world-is-' + currentWorldTile.waterFeature : '') + (startingArea ? ' starting-area' : '')} data-terrain={currentWorldTile.terrain} data-region={currentWorldTile.regionStyle} data-world-biome={currentWorldTile.worldBiome} style={{
          '--field-color': fieldPalette.field,
          '--path-color': fieldPalette.path,
          '--field-glow': fieldPalette.glow,
        } as CSSProperties}
        onClick={markerMode ? (e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          // Account for zoom: the world layer is translated+scaled (BUILD 327)
          // so the player sits at the viewport center.
          // Invert the transform to get the true field coordinates.
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          let fx: number, fy: number;
          if (gameZoom !== 1) {
            // BUILD 327: invert the centered-zoom transform (translate then
            // scale, origin 0 0) to recover true field-unit coordinates.
            fx = screenPxToFieldUnits(px, rect.width, position.x / FIELD_SIZE, gameZoom);
            fy = screenPxToFieldUnits(py, rect.height, position.y / FIELD_SIZE, gameZoom);
          } else {
            fx = (px / rect.width) * FIELD_SIZE;
            fy = (py / rect.height) * FIELD_SIZE;
          }
          const mark = { x: Math.round(fx * 10) / 10, y: Math.round(fy * 10) / 10 };
          if (markColor === 'red') {
            setRedMarks((marks) => [...marks, mark]);
          } else {
            setDebugMarks((marks) => [...marks, mark]);
          }
        } : undefined}
        >
          <span className="field-edge top" /><span className="field-edge bottom" /><span className="field-edge left" /><span className="field-edge right" />
          {/* Debug world editor (BUILD 274): coordinate grid overlay. */}
          {moverMode && showGrid && (
            <div className="editor-grid" aria-hidden="true">
              {Array.from({ length: 7 }, (_, i) => (i + 1) * 20).map((v) => (
                <span key={'gx' + v} className="editor-grid-label editor-grid-label-x" style={{ left: fieldPct(v) }}>{v}</span>
              ))}
              {Array.from({ length: 7 }, (_, i) => (i + 1) * 20).map((v) => (
                <span key={'gy' + v} className="editor-grid-label editor-grid-label-y" style={{ top: fieldPct(v) }}>{v}</span>
              ))}
            </div>
          )}
          {/* Marker dots are rendered inside field-world-layer (below) so they stay locked to world positions when zooming/walking. */}
          {markerMode && (debugMarks.length > 0 || redMarks.length > 0) && (
            <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 70, display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setMarkColor(markColor === 'green' ? 'red' : 'green'); }}
                style={{
                  background: markColor === 'red' ? 'red' : 'black',
                  color: markColor === 'red' ? '#fff' : 'lime',
                  border: '1px solid ' + (markColor === 'red' ? 'darkred' : 'lime'),
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                }}
              >
                {markColor === 'red' ? '🔴 Red' : '🟢 Green'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDebugMarks([]); setRedMarks([]); }}
                style={{
                  background: 'black',
                  color: '#fff',
                  border: '1px solid #fff',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                }}
              >
                Clear ({debugMarks.length + redMarks.length})
              </button>
            </div>
          )}
          {markerMode && debugMarks.length === 0 && redMarks.length === 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setMarkColor(markColor === 'green' ? 'red' : 'green'); }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                zIndex: 70,
                background: markColor === 'red' ? 'red' : 'black',
                color: markColor === 'red' ? '#fff' : 'lime',
                border: '1px solid ' + (markColor === 'red' ? 'darkred' : 'lime'),
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
              }}
            >
              {markColor === 'red' ? '🔴 Red' : '🟢 Green'}
            </button>
          )}
          {moverMode && editorMinimized && (
            <button type="button" className="editor-minimized-chip" onClick={() => setEditorMinimized(false)} aria-label="Expand world editor">
              🛠️ Editor
            </button>
          )}
          {moverMode && !editorMinimized && (
            <div className="editor-panel">
              <div className="editor-panel-title">🛠️ World Editor <span className="editor-panel-chunk">chunk {chunkKey}</span>
                <button type="button" className="editor-minimize-btn" onClick={() => setEditorMinimized(true)} aria-label="Minimize world editor">—</button>
              </div>
              <div className="editor-tools">
                {editorTools.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={'editor-tool' + (editorTool === t.id ? ' is-active' : '')}
                    onClick={() => { setEditorTool(t.id); setSelectedHouse(null); setSelectedPlacedId(null); }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="editor-hint">
                {editorTool === 'select' && <>👆 Tap a house or placed object to pick it up, then tap the field to drop it.</>}
                {editorTool === 'flag' && <>🚩 Tap any tree, house, or placed object to flag it for removal. Tap again to unflag.</>}
                {editorTool === 'erase' && <>🧹 Tap a generated tree/rock or placed object to delete it for good.</>}
                {editorTool === 'player' && <>📍 Tap the field to teleport the player there.</>}
                {(editorTool === 'house' || editorTool === 'tree' || editorTool === 'pine' || editorTool === 'rock' || editorTool === 'roadH' || editorTool === 'roadV') && <>Tap the field to stamp a {editorTool === 'roadH' ? 'horizontal road' : editorTool === 'roadV' ? 'vertical road' : editorTool}.</>}
              </div>
              <div className="editor-readout">You: ({position.x.toFixed(1)}, {position.y.toFixed(1)}) · Placed here: {placedHere.length} · Flagged: {flaggedItems.length}</div>
              <label className="editor-toggle">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Show coordinate grid
              </label>
              <div className="editor-list">
                {buildingDoorwaysFor(chunk).map((d) => {
                  const r = d.rect;
                  const off = houseOffsets[d.id] || { x: 0, y: 0 };
                  const flagged = flaggedItems.some((f) => f.id === 'gen-house-' + d.id);
                  return <div key={d.id}>{flagged ? '🚩 ' : ''}{d.area.name}: {(r.left + off.x).toFixed(1)},{(r.top + off.y).toFixed(1)}</div>;
                })}
                {placedHere.map((o) => {
                  const flagged = flaggedItems.some((f) => f.id === o.id);
                  return <div key={o.id}>{flagged ? '🚩 ' : ''}▸ {o.kind} {o.x.toFixed(1)},{o.y.toFixed(1)}</div>;
                })}
              </div>
              <div className="editor-actions">
                <button type="button" className="editor-btn" onClick={copyRemovalList}>
                  {copiedNotice ? 'Copied!' : '📋 Copy removal list'}
                </button>
                <button
                  type="button"
                  className="editor-btn"
                  onClick={() => {
                    setPlacedObjects((prev) => prev.filter((o) => o.chunk !== chunkKey));
                    setFlaggedItems((prev) => prev.filter((f) => !(f.chunk === chunkKey && f.kind === 'placed')));
                    setSelectedPlacedId(null);
                  }}
                >
                  Clear placed (chunk)
                </button>
                <button
                  type="button"
                  className="editor-btn"
                  onClick={() => {
                    // BUILD 305: actually delete what was flagged — placed
                    // objects are removed, generated trees/rocks go to the
                    // per-chunk deleted set. Generated houses can't be deleted.
                    const { placedIds, treeIds } = editorFlaggedDeletions(flaggedItems, chunkKey);
                    if (placedIds.length > 0) setPlacedObjects((prev) => prev.filter((o) => !placedIds.includes(o.id)));
                    if (treeIds.length > 0) setDeletedGenTrees((prev) => {
                      let next = prev;
                      for (const tid of treeIds) next = editorDeleteGenTree(next, chunkKey, tid);
                      return next;
                    });
                    setFlaggedItems((prev) => prev.filter((f) => !(f.chunk === chunkKey && (f.kind === 'placed' || f.kind === 'tree'))));
                    setSelectedPlacedId(null);
                  }}
                >
                  🗑️ Delete flagged ({flaggedHere.filter((f) => f.kind !== 'house').length})
                </button>
                {(deletedGenTrees[chunkKey] ?? []).length > 0 && (
                  <button
                    type="button"
                    className="editor-btn"
                    onClick={() => setDeletedGenTrees((prev) => editorRestoreGenTrees(prev, chunkKey))}
                  >
                    ↩️ Restore deleted trees ({(deletedGenTrees[chunkKey] ?? []).length})
                  </button>
                )}
                {currentWorldTile.road !== 'none' && (
                  <button
                    type="button"
                    className="editor-btn"
                    onClick={() => setHiddenRoadChunks((prev) => prev.includes(chunkKey) ? prev.filter((c) => c !== chunkKey) : [...prev, chunkKey])}
                  >
                    {hiddenRoadChunks.includes(chunkKey) ? '🛤️ Show roads here' : '🛤️ Hide roads here'}
                  </button>
                )}
                <button
                  type="button"
                  className="editor-btn"
                  onClick={() => { setHouseOffsets({}); setSelectedHouse(null); }}
                >
                  Reset houses
                </button>
                <button type="button" className="editor-btn" onClick={() => setGameZoom(1)}>
                  Reset zoom
                </button>
              </div>
            </div>
          )}
          {/* BUILD 341: map-builder overlay + tile palette. The overlay sits
              below the HUD (z-index) so movement/zoom controls stay usable
              while painting. */}
          {mapBuilderMode && (
            <div
              className="map-builder-overlay"
              onPointerDown={(e) => {
                try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
                paintAtEvent(e, true);
              }}
              onPointerMove={(e) => { if (e.buttons > 0) paintAtEvent(e, false); }}
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
          {mapBuilderMode && (
            <div className="map-builder-bar">
              <div className="map-builder-title">🗺️ Map Builder <span className="map-builder-chunk">chunk {chunkKey}</span>
                <button type="button" className="map-builder-exit" onClick={toggleMapBuilder} aria-label="Exit map builder">✕</button>
              </div>
              <div className="map-builder-palette">
                {mapBrushes.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={'map-brush' + (mapBrush === b.id ? ' is-active' : '')}
                    onClick={() => setMapBrush(b.id)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <div className="map-builder-actions">
                <button
                  type="button"
                  className="map-builder-btn"
                  onClick={() => setMapPaints((p) => clearChunkPaints(p, chunkKey))}
                >
                  🧹 Clear painted tiles (chunk)
                </button>
              </div>
              <div className="map-builder-hint">
                {mapBrush === 'house'
                  ? '🏠 Tap the field to stamp a house.'
                  : mapBrush === 'erase'
                    ? '🧹 Tap or drag to erase painted tiles.'
                    : 'Tap or drag on the field to paint. Water and forest tiles block movement.'}
              </div>
            </div>
          )}
          {carriageDebugOpen && (() => {
            const clock = brainRef.current?.worldCore.getClock();
            const discoveredNames = journal.discoveredLocations.map((l) => l.name);
            const dests = carriageDestinations(chunk, discoveredNames);
            const dirs: Array<'north' | 'south' | 'east' | 'west'> = ['north', 'south', 'east', 'west'];
            return (
              <div className="editor-panel inspector-panel">
                <div className="editor-panel-title">🐎 Carriage Network <span className="editor-panel-chunk">{time}</span></div>
                <div className="editor-actions">
                  <button type="button" className="editor-btn" onClick={() => setCarriageDebugOpen(false)}>Close</button>
                </div>
                <div className="inspector-section">
                  <div className="inspector-heading">Stations (1 chunk outside Mosslight)</div>
                  {dirs.map((dir) => {
                    const st = getCarriageStation(CARRIAGE_STATION_CHUNKS[dir]);
                    if (!st) return null;
                    const onDuty = clock ? driverOnDuty(st.driver, clock) : true;
                    return (
                      <div key={dir} className="inspector-row">
                        <span><strong>{st.name}</strong><br /><small>chunk {st.chunk.x},{st.chunk.y} · {st.driver.name} · {onDuty ? `on duty (${st.driver.openHour}:00–${st.driver.closeHour}:00)` : 'closed'} · earned {carriageEarningsRef.current[st.driver.name] || 0}g</small></span>
                        <button type="button" className="editor-btn" onClick={() => { completeCarriageArrival(st.name, st.chunk, st.layout.arrival); setCarriageDebugOpen(false); }}>Go</button>
                      </div>
                    );
                  })}
                </div>
                <div className="inspector-section">
                  <div className="inspector-heading">Destinations from chunk {chunk.x},{chunk.y}</div>
                  {dests.map((d) => (
                    <div key={d.name} className="inspector-row">
                      <span>{d.discovered ? '✅' : '🔒'} <strong>{d.discovered ? d.name : '???'}</strong><br /><small>{d.discovered ? `${d.price}g · ${d.travelHours}h · ${d.distance} chunks · ${d.kind}` : 'undiscovered'}</small></span>
                      {d.discovered && (
                        <button type="button" className="editor-btn" onClick={() => { const a = getCarriageStation(d.chunk); const s = a ? null : getCarriageStop(d.chunk); completeCarriageArrival(d.name, d.chunk, a ? a.layout.arrival : s ? s.arrival : { x: 70, y: 70 }); setCarriageDebugOpen(false); }}>Ride</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {inspectorOpen && (
            <div className="editor-panel inspector-panel">
              <div className="editor-panel-title">🔍 NPC Inspector <span className="editor-panel-chunk">{time}</span></div>
              <div className="editor-actions">
                <button type="button" className="editor-btn" onClick={() => setInspectorOpen(false)}>
                  Close
                </button>
              </div>
              {(() => {
                const civ = ensureCiv();
                const here = settlementsByChunk(civ, chunk);
                return (
                  <div className="inspector-section">
                    <div className="inspector-heading">Civilization ({civ.kingdoms.length} kingdoms · {civ.settlements.length} settlements)</div>
                    {here.map((s) => (
                      <div key={s.id} className="inspector-row">
                        <span>🏰 <strong>{s.name}</strong> · {s.kind}{s.kingdomId ? ` · ${s.kingdomId === 'aldoria' ? 'Kingdom of Aldoria' : 'Thalara'}` : ''}</span>
                      </div>
                    ))}
                    {here.length === 0 && (
                      <div className="inspector-row"><span>Wilderness — no settlement on this chunk.</span></div>
                    )}
                    {civ.kingdoms.map((k) => {
                      const capital = settlementById(civ, k.capital);
                      const ruler = rulerById(civ, k.ruler);
                      const others = civ.kingdoms.filter((o) => o.id !== k.id);
                      const rel = others.map((o) => `${o.name}: ${k.relations[o.id] ?? 'neutral'}`).join('; ');
                      return (
                        <div key={k.id} className="inspector-row">
                          <span>👑 <strong>{k.name}</strong> · capital {capital?.name ?? '—'} · ruled by {ruler?.name ?? '—'} · pop {k.population.toLocaleString()} · treasury {k.treasury.toLocaleString()}g · tax {Math.round(k.taxRate * 100)}%{rel ? ` · ${rel}` : ''}</span>
                        </div>
                      );
                    })}
                    <div className="inspector-heading">Rulers &amp; castles ({civ.rulers.length})</div>
                    {(() => {
                      const clock = brainRef.current?.worldCore.getClock();
                      return civ.rulers.map((r) => {
                        const home = settlementById(civ, r.settlementId);
                        const castle = castleBySettlementId(civ, r.settlementId);
                        const target = clock ? rulerTarget(r, clock) : null;
                        return (
                          <div key={r.id} className="inspector-row">
                            <span>{target?.indoors === false ? '🌳' : '🏠'} <strong>{r.title} {r.name}</strong> · age {r.age} · {home?.name ?? '—'}{castle ? ` · ${castle.name} (garrison ${castle.garrison})` : ''}{target ? ` · ${target.activity}` : ''}</span>
                          </div>
                        );
                      });
                    })()}
                    
                    <div className="inspector-heading">Economy &amp; resources</div>
                    {civ.kingdoms.map((k) => (
                      <div key={k.id} className="inspector-row">
                        <span>💰 <strong>{k.name}</strong> · daily output {Math.round(k.economy).toLocaleString()}g · treasury {k.treasury.toLocaleString()}g</span>
                      </div>
                    ))}
                    {settlementsByChunk(civ, chunk).map((s) => (
                      <div key={s.id} className="inspector-row">
                        <span>🌾 <strong>{s.name}</strong> produces {topProducedResources(s).map((r) => `${r.resource} ${r.amount}/d (${r.price}g)`).join(', ') || 'nothing'}</span>
                      </div>
                    ))}
                    <div className="inspector-heading">Trade routes ({civ.routes.length})</div>
                    {civ.routes.map((r) => {
                      const from = settlementById(civ, r.from);
                      const to = settlementById(civ, r.to);
                      return (
                        <div key={r.id} className="inspector-row">
                          <span>🛤️ <strong>{r.name}</strong> · {from?.name ?? r.from} → {to?.name ?? r.to} · {r.goods.join(', ')} · danger {Math.round(r.danger * 100)}%</span>
                        </div>
                      );
                    })}
                    <div className="inspector-heading">Merchant caravans ({civ.caravans.length})</div>
                    {(() => {
                      const clock = brainRef.current?.worldCore.getClock();
                      if (!clock) return null;
                      const dayFloat = civDayFloat(clock);
                      return civ.caravans.slice(0, 12).map((cv) => {
                        const pos = caravanPosition(cv, clock, civ);
                        const origin = settlementById(civ, cv.originId);
                        const dest = settlementById(civ, cv.destinationId);
                        return (
                          <div key={cv.id} className="inspector-row">
                            <span>🐪 <strong>{cv.merchant}</strong> · {origin?.name ?? cv.originId} → {dest?.name ?? cv.destinationId} · {pos.status}{pos.status === 'traveling' ? ` ${Math.round(caravanProgress(cv, dayFloat) * 100)}%` : ''} · {cv.guards} guards</span>
                            {pos.status === 'traveling' && pos.chunk.x === chunk.x && pos.chunk.y === chunk.y && (
                              <span> · here</span>
                            )}
                          </div>
                        );
                      });
                    })()}
                    <div className="inspector-heading">Military ({civ.units.length})</div>
                    {(() => {
                      const clock = brainRef.current?.worldCore.getClock();
                      if (!clock) return null;
                      return civ.units.slice(0, 12).map((u) => {
                        const target = militaryTarget(u, clock, civ);
                        const home = settlementById(civ, u.homeSettlementId);
                        return (
                          <div key={u.id} className="inspector-row">
                            <span>🛡️ <strong>{u.name}</strong> · {u.kind} · {u.soldiers + u.archers + u.cavalry} strong · {home?.name ?? '—'} · {target.activity}</span>
                          </div>
                        );
                      });
                    })()}
                    <div className="inspector-heading">World events</div>
                    {(() => {
                      const events = ensureCiv().events.slice(-8).reverse();
                      if (events.length === 0) return <div className="inspector-row"><span>No recent events.</span></div>;
                      return events.map((e: WorldEvent) => (
                        <div key={e.id} className="inspector-row">
                          <span>📰 <strong>Day {e.day}</strong> · {e.description}</span>
                        </div>
                      ));
                    })()}
                    <div className="inspector-heading">Horses ({ensureHorses().horses.length})</div>
                    {(() => {
                      const clock = brainRef.current?.worldCore.getClock();
                      if (!clock) return null;
                      const { horses, stables, owners } = ensureHorses();
                      return horses.slice(0, 10).map((h) => {
                        const target = horseTarget(h, owners.get(h.owner) ?? null, stables, clock);
                        const here = target.chunk.x === chunk.x && target.chunk.y === chunk.y;
                        return (
                          <div key={h.id} className="inspector-row">
                            <span>🐴 <strong>{h.name}</strong> · {h.color} · {target.activity.replace(/_/g, ' ')}{here ? ' · here' : ''}</span>
                            {here && (
                              <button
                                type="button"
                                className="editor-btn"
                                onClick={() => {
                                  setPosition({ x: Math.min(134, Math.max(4, target.position.x + 3)), y: Math.min(134, Math.max(4, target.position.y + 3)) });
                                  setInspectorOpen(false);
                                }}
                              >
                                Go to
                              </button>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                );
              })()}
              {townsfolk.length > 0 && (
                <div className="inspector-section">
                  <div className="inspector-heading">Mosslight townsfolk ({townsfolk.length}) · wanted: {wantedLabel(wantedMosslight)}</div>
                  {townsfolk.map((npc) => {
                    // BUILD 314: debug overlay — location state, position,
                    // home/bed, destination, path waypoint, nav status.
                    // BUILD 335: also shows the dialogue disposition (330).
                    const npcAny = npc as unknown as Record<string, unknown>;
                    const loc = npcAny.location as string | undefined;
                    const path = npcAny.path as { waypoints?: unknown[]; waypointIndex?: number } | undefined;
                    const homeId = npcAny.homeId as string | undefined;
                    const bedId = npcAny.bedId as string | undefined;
                    const disp = disposition[npc.id] ?? defaultDisposition();
                    return (
                      <div key={npc.id} className="inspector-row">
                        <span>{npc.indoors ? '🏠' : '🌳'} <strong>{npc.gender === 'female' ? '♀' : '♂'} {npc.name}</strong> · {npc.archetype} · <em>{loc || (npc.indoors ? 'indoors' : 'outdoor')}</em> @({npc.position.x.toFixed(1)},{npc.position.y.toFixed(1)}) · {npc.activity} · 💭{dispositionTier(disp)}({disp})
                          {homeId && <> · 🏠{homeId}{bedId ? `/🛏️${bedId}` : ''}</>}
                          {path && path.waypoints && <> · 📍wp{path.waypointIndex ?? 0}/{path.waypoints.length}</>}
                        </span>
                        {!npc.indoors && (
                          <button
                            type="button"
                            className="editor-btn"
                            onClick={() => {
                              setPosition({ x: Math.min(134, Math.max(4, npc.position.x + 3)), y: Math.min(134, Math.max(4, npc.position.y + 3)) });
                              setInspectorOpen(false);
                            }}
                          >
                            Go to
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {travelers.length > 0 && (
                <div className="inspector-section">
                  <div className="inspector-heading">Road travelers ({travelers.length})</div>
                  {travelers.map((traveler) => (
                    <div key={traveler.id} className="inspector-row">
                      <span>🚶 <strong>{traveler.gender === 'female' ? '♀' : '♂'} {traveler.name}</strong> · {traveler.kind} → {traveler.destination}</span>
                      <button
                        type="button"
                        className="editor-btn"
                        onClick={() => {
                          setPosition({ x: Math.min(134, Math.max(4, traveler.position.x + 3)), y: Math.min(134, Math.max(4, traveler.position.y + 3)) });
                          setInspectorOpen(false);
                        }}
                      >
                        Go to
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="inspector-section">
                <div className="inspector-heading">Points of interest</div>
                {(() => {
                  const pois = modulePoisForChunk(chunk, DEFAULT_WORLD_SEED, {});
                  if (pois.length === 0) return <div className="inspector-row"><span>None on this chunk.</span></div>;
                  return pois.map((poi) => (
                    <div key={poi.id} className="inspector-row">
                      <span>📍 <strong>{poi.name}</strong> · {poi.kind.replace(/_/g, ' ')} · danger {poi.danger}</span>
                      <button
                        type="button"
                        className="editor-btn"
                        onClick={() => {
                          setPosition({ x: Math.min(134, Math.max(4, poi.position.x + 3)), y: Math.min(134, Math.max(4, poi.position.y + 3)) });
                          setInspectorOpen(false);
                        }}
                      >
                        Go to
                      </button>
                    </div>
                  ));
                })()}
              </div>
              <div className="inspector-section">
                <div className="inspector-heading">Adventurers ({simulatedAdventurers.length})</div>
                {simulatedAdventurers.map((adv) => {
                  // BUILD 314: debug overlay — location state, position,
                  // destination, exodus status, stuck/deadline info.
                  const advAny = adv as unknown as Record<string, unknown>;
                  const exodusTarget = advAny.exodusTarget as { x: number; y: number } | undefined;
                  const exodusMotive = advAny.exodusMotive as string | undefined;
                  const spawnTick = advAny.spawnTick as number | undefined;
                  const outingTicks = advAny.outingTicks as number | undefined;
                  return (
                    <div key={adv.id} className="inspector-row">
                      <span>⚔️ <strong>{adv.name}</strong> · Lv{adv.level} {adv.className} · <em>{adv.location}</em>{adv.outing ? `/${adv.outing}` : ''} @({adv.position.x.toFixed(1)},{adv.position.y.toFixed(1)}) — {adv.activity}
                        {exodusTarget && adv.outing === 'exodus' && (
                          <> · 🎯 exit ({exodusTarget.x.toFixed(0)},{exodusTarget.y.toFixed(0)}){exodusMotive ? ` — ${exodusMotive}` : ''}{typeof outingTicks === 'number' ? ` · ${outingTicks}t left` : ''}</>
                        )}
                        {typeof spawnTick === 'number' && adv.outing === 'exodus' && (
                          <> · spawned t{spawnTick}</>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!interior && (
            <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 60, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setGameZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                style={{ width: '44px', height: '44px', fontSize: '20px', background: 'rgba(0,0,0,0.75)', color: '#fff', border: '1px solid #fff', borderRadius: '8px', cursor: 'pointer' }}
                aria-label="Zoom in"
              >
                +
              </button>
              <div style={{ textAlign: 'center', fontSize: '11px', color: '#fff', background: 'rgba(0,0,0,0.75)', borderRadius: '4px', padding: '2px 4px' }}>
                {Math.round(gameZoom * 100)}%
              </div>
              <button
                type="button"
                onClick={() => setGameZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                style={{ width: '44px', height: '44px', fontSize: '20px', background: 'rgba(0,0,0,0.75)', color: '#fff', border: '1px solid #fff', borderRadius: '8px', cursor: 'pointer' }}
                aria-label="Zoom out"
              >
                −
              </button>
            </div>
          )}
          <div className="field-world-layer" style={gameZoom !== 1 ? (() => {
            // BUILD 327: zoom centers the player in the viewport — the layer
            // is scaled around the top-left, then translated so the player's
            // field position lands at 50%/50% of the frame.
            const tx = zoomTranslatePct(position.x / FIELD_SIZE, gameZoom);
            const ty = zoomTranslatePct(position.y / FIELD_SIZE, gameZoom);
            return { transform: `translate(${tx}%, ${ty}%) scale(${gameZoom})`, transformOrigin: '0 0' };
          })() : undefined}>
          {/* BUILD 340: the procedural ground canvas lives INSIDE the world layer so it
              pans/zooms with the world. As a direct child of .pixel-field it stayed
              glued to the screen, making the path appear to follow the player and
              houses appear to sit on pathways when zoomed. */}
          <FieldGroundLayer spec={groundSpec} />
          {/* Marker dots: inside the world layer so they stay locked to field positions when walking/zooming. */}
          {markerMode && debugMarks.map((mark, i) => [
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
            }} title={'(' + mark.x + ', ' + mark.y + ')'} />,
            <span key={'mark-label-' + i} aria-hidden="true" style={{
              position: 'absolute',
              left: fieldPct(mark.x - 4),
              top: fieldPct(mark.y + 2),
              fontSize: '10px',
              color: 'darkgreen',
              background: 'rgba(255,255,255,0.8)',
              padding: '1px 3px',
              borderRadius: '3px',
              pointerEvents: 'none',
              zIndex: 56,
              whiteSpace: 'nowrap',
            }}>{mark.x},{mark.y}</span>
          ])}
          {markerMode && redMarks.map((mark, i) => [
            <span key={'redmark-' + i} aria-hidden="true" style={{
              position: 'absolute',
              left: fieldPct(mark.x - 1.5),
              top: fieldPct(mark.y - 1.5),
              width: fieldPct(3),
              height: fieldPct(3),
              background: 'red',
              border: '2px solid darkred',
              borderRadius: '50%',
              pointerEvents: 'none',
              zIndex: 55,
            }} title={'(' + mark.x + ', ' + mark.y + ')'} />,
            <span key={'redmark-label-' + i} aria-hidden="true" style={{
              position: 'absolute',
              left: fieldPct(mark.x - 4),
              top: fieldPct(mark.y + 2),
              fontSize: '10px',
              color: 'red',
              background: 'rgba(255,255,255,0.8)',
              padding: '1px 3px',
              borderRadius: '3px',
              pointerEvents: 'none',
              zIndex: 56,
              whiteSpace: 'nowrap',
            }}>{mark.x},{mark.y}</span>
          ])}
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
          {currentWorldTile.road !== 'none' && !hiddenRoadChunks.includes(chunkKey) && (
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
                  if (inputLocked || optionsOpen || waitingRef.current || playerAttackStateRef.current.active) return;
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
            {monsters.map((monster) => {
              const dead = monster.disposition === 'defeated';
              const anim = animForMonsterState({ dead, hitFlash: monster.hitFlash, attacking: monster.attacking, moving: monster.moving });
              const sprite = resolveMonsterSprite(monster.kind);
              const def = sprite.def;
              // A 404'd sheet PNG falls back to the engine-safe placeholder sprite.
              const spriteKind = def && isMonsterSheetFailed(def.spriteSheet) ? 'placeholder' : sprite.kind;
              return (
              <button
                type="button"
                key={'monster-' + monster.kind + '-' + monster.id}
                className={'monster monster-' + spriteKind + ' monster-state-' + getSpriteState(monster.state, monster.facing) + (monster.moving ? ' is-moving' : '') + (monster.attacking ? ' is-attacking' : '') + (monster.hitFlash ? ' is-hit' : '') + (dead ? ' is-dead' : '')}
                style={{ left: fieldPct(monster.position.x), top: fieldPct(monster.position.y) }}
                data-facing={monster.facing}
                data-state={monster.state}
                data-variant={monster.variant || 'default'}
                aria-label={(dead ? 'Defeated ' : 'Hostile ') + monster.kind + ', level ' + monster.level}
                aria-disabled={dead}
                data-testid={'button-target-monster-' + monster.id}
                onClick={dead ? undefined : () => {
                  if (inputLocked || optionsOpen || waitingRef.current || playerAttackStateRef.current.active) return;
                  attackGoat();
                }}
              >
                {!dead && <span className="monster-aggro">!</span>}
                <span className="monster-sprite" />
                {markerMode && (
                  <span className="monster-debug">
                    {monster.kind}/{monster.variant || 'default'} · {monster.state} · {def ? 'f' + monsterAnimFrameFor(def, anim, Date.now(), monster.id) : anim} · ({monster.position.x.toFixed(0)},{monster.position.y.toFixed(0)}) · c{chunk.x},{chunk.y}
                  </span>
                )}
              </button>
              );
            })}
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
                : only('wood') ? 'wood'
                : only('silk') ? 'silk'
                : only('corn') ? 'corn' : 'bag';
              return <div className="loot-drop" key={drop.id} style={{ left: fieldPct(drop.position.x), top: fieldPct(drop.position.y) }}>
                <span className={'loot-visual loot-' + lootKind} aria-label={'Dropped ' + lootKind} />
                {nearby && <button className="pickup-button" onClick={() => pickupDrop(drop)} data-testid={'button-pickup-loot-' + drop.id}>Pick up</button>}
              </div>;
            })}
            {/* Quest givers out in the field: find them, talk to them, get quests. */}
            {QUEST_GIVER_FIELD_NPCS.filter((giver) => giver.chunk.x === chunk.x && giver.chunk.y === chunk.y).map((giver) => (
              <button type="button" key={'quest-giver-' + giver.name} className={'quest-giver ' + giver.sprite} onClick={() => openQuestDialog(giver.name)} style={{ left: fieldPct(giver.position.x), top: fieldPct(giver.position.y) }} aria-label={'Talk to ' + giver.displayName} data-testid={'quest-giver-' + giver.name} data-facing="down">
                {(() => {
                  // BUILD 326: quest-state-aware badges (same rule as interiors).
                  const lowered = giver.name.toLowerCase();
                  const def = QUESTS.find((q) => {
                    const gname = q.giver.name.toLowerCase();
                    return gname === lowered || gname.includes(lowered) || lowered.includes(gname);
                  });
                  const marker = def ? markerForGiver(def, questStates) : null;
                  if (marker === 'available') return <span className="quest-giver-badge" aria-hidden="true">!</span>;
                  if (marker === 'turnin') return <span className="quest-giver-badge is-turnin" aria-hidden="true">?</span>;
                  return null;
                })()}
                <span className="interior-npc-nameplate" aria-hidden="true"><strong>{giver.displayName}</strong><small>{giver.title} · Talk</small></span>
                <span className="npc-sprite" aria-hidden="true" />
              </button>
            ))}
            {/* Quest sites: landmarks and pickups for active explore/visit/collect stages. */}
            {(() => {
              const stages: ActiveQuestStage[] = [];
              for (const st of questStates) {
                if (st.status !== 'active') continue;
                const def = questById(st.questId);
                const stage = def?.stages[st.stageIndex];
                if (def && stage && stage.target) stages.push({ questId: st.questId, kind: stage.kind, target: stage.target });
              }
              const dungeonChunk = currentWorldTile.landmark && currentWorldTile.landmark.kind === 'dungeon' ? { ...chunk } : null;
              return sitesForActiveStages(stages).map((site) => {
                const siteChunk = resolveSiteChunk(site, dungeonChunk);
                if (!siteChunk || siteChunk.x !== chunk.x || siteChunk.y !== chunk.y) return null;
                const nearby = Math.hypot(site.position.x - position.x, site.position.y - position.y) <= 16;
                return (
                  <div className="quest-site" key={'quest-site-' + site.target + '-' + site.label} style={{ left: fieldPct(site.position.x), top: fieldPct(site.position.y) }}>
                    <span className={'quest-site-visual quest-site-' + site.kind} aria-label={site.label} title={site.label} />
                    <span className="quest-site-label" aria-hidden="true">{site.label}</span>
                    {nearby && site.kind === 'pickup' && <button className="pickup-button" onClick={() => emitQuestEvent({ type: 'collect', target: site.target })} data-testid={'button-quest-pickup-' + site.target}>Take</button>}
                  </div>
                );
              });
            })()}
            {/* Locked chests: contextual loot for lockpicking (BUILD 285). */}
            {chestsForChunk(chunk, { hasRoad: mapTileFor(chunk).road !== 'none', danger: dangerForChunk(chunk), terrain: mapTileFor(chunk).terrain })
              .filter((chest) => !openedChests.includes(chest.id))
              .map((chest) => {
                const nearby = Math.hypot(chest.position.x - position.x, chest.position.y - position.y) <= 16;
                return (
                  <div className="locked-chest" key={'locked-chest-' + chest.id} style={{ left: fieldPct(chest.position.x), top: fieldPct(chest.position.y) }}>
                    <span className="locked-chest-visual" aria-label={chest.label} title={chest.label} />
                    <span className="locked-chest-label" aria-hidden="true">{chest.label}</span>
                    {nearby && <button className="pickup-button" onClick={() => attemptPickChest(chest)} data-testid={'button-pick-lock-' + chest.id}>Pick lock</button>}
                  </div>
                );
              })}
          </div>
          {/* Arrows in flight: player bow shots and bandit-archer volleys. */}
          <div className="field-arrows" aria-hidden="true">
            {arrows.map((arrow) => {
              if (arrow.chunk.x !== chunk.x || arrow.chunk.y !== chunk.y) return null;
              const angle = Math.atan2(arrow.dy, arrow.dx) * 180 / Math.PI;
              return (
                <span
                  key={'arrow-' + arrow.id}
                  className={'arrow' + (arrow.hostile ? ' arrow-hostile' : '')}
                  style={{ left: fieldPct(arrow.position.x), top: fieldPct(arrow.position.y), transform: 'translate(-50%, -50%) rotate(' + angle + 'deg)' }}
                />
              );
            })}
          </div>
          <div className="field-trees" aria-hidden="true" style={{ '--env-sprites': 'url("' + assetUrl('environment/FreePack.png') + '")' } as CSSProperties}>
            {fieldTrees.map((tree) => {
              // Chopped-down trees render as stumps until they regrow.
              if (isTreeFelled(fieldTreeKey(chunk, tree.id))) {
                return (
                  <span
                    className="field-tree tree-stump"
                    key={'stump-' + tree.id}
                    style={{
                      left: 'calc(' + (tree.x + 3.2 * tree.scale) + '% - 13px)',
                      top: 'calc(' + (tree.y + 4 * tree.scale) + '% - 14px)',
                    }}
                    aria-hidden="true"
                  />
                );
              }
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
            // Single source of truth: visuals use the exact same doorway data as
            // triggers/collision, so houses can never drift from their doors.
            const doorways = buildingDoorwaysFor(chunk);
            return (
            <>
            <div className={'field-village ' + currentWorldTile.landmark.kind + ' world-region-' + currentWorldTile.regionStyle + ' town-variant-' + (Math.abs(currentWorldTile.landmark.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 4)} aria-label={currentWorldTile.landmark.name}
            >
              <span className="field-village-square" />
              {currentWorldTile.landmark?.name === 'Mosslight Crossing' ? (
                <span className="field-village-fountain" aria-label="Greenvale fountain"><span className="fountain-spray" /></span>
              ) : (
                <span className="field-village-well" />
              )}
            </div>
            {/* Houses live in a full-field layer using true field coordinates.
                The .field-village box is only 54%x52% of the field, so rendering
                houses inside it shifted every visual away from its door and
                collision. This layer keeps visuals, doors, and collision unified. */}
            <div className={'field-houses-layer' + (moverMode ? ' mover-active' : '')}
              onPointerUp={moverMode ? (e) => {
                // Debug world editor: all tap tools route through here. Taps on
                // houses / placed objects are handled by their own handlers
                // (stopPropagation) below.
                const target = e.target as HTMLElement;
                if (target.closest && (target.closest('.field-house') || target.closest('.editor-placed'))) return;
                const pt = tapToField(e);
                const fx = Math.round(pt.x * 10) / 10;
                const fy = Math.round(pt.y * 10) / 10;
                // Flag tool: mark the nearest flaggable object for removal.
                if (editorTool === 'flag') {
                  const candidates: FlaggedItem[] = [
                    ...fieldTreesFor(chunk).filter((t) => !(deletedGenTrees[chunkKey] ?? []).includes(t.id)).map((t) => ({
                      id: 'gen-tree-' + chunkKey + '-' + t.id,
                      kind: 'tree' as const,
                      label: 'tree #' + t.id,
                      x: Math.round(t.x * 10) / 10,
                      y: Math.round(t.y * 10) / 10,
                      chunk: chunkKey,
                    })),
                    ...buildingDoorwaysFor(chunk).map((d) => {
                      const r = d.rect;
                      const off = houseOffsets[d.id] || { x: 0, y: 0 };
                      return {
                        id: 'gen-house-' + d.id,
                        kind: 'house' as const,
                        label: d.area.name,
                        x: Math.round(((r.left + r.right) / 2 + off.x) * 10) / 10,
                        y: Math.round(((r.top + r.bottom) / 2 + off.y) * 10) / 10,
                        chunk: chunkKey,
                      };
                    }),
                    ...placedHere.map((o) => ({
                      id: o.id,
                      kind: 'placed' as const,
                      label: 'placed ' + o.kind + ' ' + o.id.slice(-6),
                      x: o.x,
                      y: o.y,
                      chunk: chunkKey,
                    })),
                  ];
                  let best: FlaggedItem | null = null;
                  let bestDist = 8;
                  for (const c of candidates) {
                    const dist = Math.hypot(c.x - fx, c.y - fy);
                    if (dist < bestDist) { bestDist = dist; best = c; }
                  }
                  if (best) setFlaggedItems((prev) => editorToggleFlag(prev, best as FlaggedItem));
                  return;
                }
                // Teleport tool: walk the player to the tap.
                if (editorTool === 'player') {
                  setPosition({ x: fx, y: fy });
                  return;
                }
                // Erase tool (BUILD 305): delete the nearest generated tree/rock
                // or placed object. Generated trees/rocks are remembered per
                // chunk so they stay gone.
                if (editorTool === 'erase') {
                  const treeCands = fieldTreesFor(chunk)
                    .filter((t) => !(deletedGenTrees[chunkKey] ?? []).includes(t.id))
                    .map((t) => ({ id: t.id, x: t.x, y: t.y, gen: true as const }));
                  const placedCands = placedHere.map((o) => ({ id: o.id, x: o.x, y: o.y, gen: false as const }));
                  let best: { id: number | string; x: number; y: number; gen: boolean } | null = null;
                  let bestDist = 8;
                  for (const c of [...treeCands, ...placedCands]) {
                    const dist = Math.hypot(c.x - fx, c.y - fy);
                    if (dist < bestDist) { bestDist = dist; best = c; }
                  }
                  if (best) {
                    if (best.gen) {
                      const tid = best.id as number;
                      setDeletedGenTrees((prev) => ({ ...prev, [chunkKey]: [...(prev[chunkKey] ?? []), tid] }));
                      setFlaggedItems((prev) => prev.filter((f) => f.id !== 'gen-tree-' + chunkKey + '-' + tid));
                    } else {
                      const pid = best.id as string;
                      setPlacedObjects((prev) => prev.filter((o) => o.id !== pid));
                      setFlaggedItems((prev) => prev.filter((f) => f.id !== pid));
                    }
                  }
                  return;
                }
                // Stamp tools: place a new object at the tap.
                if (editorTool !== 'select') {
                  setPlacedObjects((prev) => editorPlaceObject(prev, editorTool, fx, fy, chunkKey));
                  return;
                }
                // Select tool: tap-to-place a picked-up house.
                if (selectedHouse) {
                  // Find the selected doorway to get its size.
                  const dw = doorways.find((d) => d.id === selectedHouse);
                  if (!dw) return;
                  const w = dw.rect.right - dw.rect.left;
                  const h = dw.rect.bottom - dw.rect.top;
                  // Place so the house center is at the tap point.
                  const newLeft = fx - w / 2;
                  const newTop = fy - h / 2;
                  const offX = newLeft - dw.rect.left;
                  const offY = newTop - dw.rect.top;
                  setHouseOffsets((prev) => ({ ...prev, [selectedHouse]: { x: offX, y: offY } }));
                  setSelectedHouse(null);
                  return;
                }
                // Select tool: tap-to-place a picked-up placed object.
                if (selectedPlacedId) {
                  setPlacedObjects((prev) => prev.map((o) => o.id === selectedPlacedId ? { ...o, x: fx, y: fy } : o));
                  setSelectedPlacedId(null);
                }
              } : undefined}
            >
              {doorways.map((doorway) => {
                const rect = doorway.rect;
                const off = houseOffsets[doorway.id] || { x: 0, y: 0 };
                const isSelected = selectedHouse === doorway.id;
                return (
                <span
                  key={doorway.id}
                  className={'field-house' + (isStartingArea(chunk) ? ' new-house' : '')}
                  style={{
                    left: fieldPct(rect.left + off.x),
                    top: fieldPct(rect.top + off.y),
                    width: fieldPct(rect.right - rect.left),
                    height: fieldPct(rect.bottom - rect.top),
                    cursor: moverMode ? 'pointer' : undefined,
                    touchAction: moverMode ? 'none' : undefined,
                    outline: isSelected ? '3px solid #ff0' : undefined,
                    zIndex: isSelected ? 10 : undefined,
                  }}
                  onPointerUp={moverMode ? (e) => {
                    e.stopPropagation();
                    // Flag tool: mark this generated house for removal.
                    if (editorTool === 'flag') {
                      const r = doorway.rect;
                      const off = houseOffsets[doorway.id] || { x: 0, y: 0 };
                      const cx = Math.round(((r.left + r.right) / 2 + off.x) * 10) / 10;
                      const cy = Math.round(((r.top + r.bottom) / 2 + off.y) * 10) / 10;
                      setFlaggedItems((prev) => editorToggleFlag(prev, {
                        id: 'gen-house-' + doorway.id,
                        kind: 'house',
                        label: doorway.area.name,
                        x: cx, y: cy, chunk: chunkKey,
                      }));
                      return;
                    }
                    // Only the select tool picks houses up.
                    if (editorTool !== 'select') return;
                    // Tap a house to select/deselect it.
                    if (selectedHouse === doorway.id) {
                      setSelectedHouse(null);
                    } else {
                      setSelectedHouse(doorway.id);
                      setSelectedPlacedId(null);
                    }
                  } : undefined}
                >{doorway.area.id === 'fourth-house' && <span className="field-house-sign" aria-hidden="true" />}{moverMode && (
                  <span className="editor-coord" aria-hidden="true">
                    {(rect.left + off.x).toFixed(1)}, {(rect.top + off.y).toFixed(1)}
                  </span>
                )}</span>
                );
              })}
              {/* Debug world editor (BUILD 274): user-placed objects for this chunk. */}
              {placedHere.map((o) => {
                const isSel = selectedPlacedId === o.id;
                const isFlagged = flaggedItems.some((f) => f.id === o.id);
                const onPlacedTap = (e: React.PointerEvent<HTMLElement>) => {
                  if (!moverMode) return;
                  e.stopPropagation();
                  if (editorTool === 'flag') {
                    setFlaggedItems((prev) => editorToggleFlag(prev, {
                      id: o.id, kind: 'placed', label: 'placed ' + o.kind + ' ' + o.id.slice(-6),
                      x: o.x, y: o.y, chunk: chunkKey,
                    }));
                    return;
                  }
                  if (editorTool === 'erase') {
                    setPlacedObjects((prev) => prev.filter((p) => p.id !== o.id));
                    setFlaggedItems((prev) => prev.filter((f) => f.id !== o.id));
                    if (selectedPlacedId === o.id) setSelectedPlacedId(null);
                    return;
                  }
                  if (editorTool !== 'select') return;
                  setSelectedPlacedId(isSel ? null : o.id);
                  setSelectedHouse(null);
                };
                const shared = {
                  key: o.id,
                  className: 'editor-placed editor-placed-' + o.kind + (isSel ? ' is-selected' : '') + (isFlagged ? ' is-flagged' : ''),
                  onPointerUp: moverMode ? onPlacedTap : undefined,
                  style: { cursor: moverMode ? 'pointer' : undefined, touchAction: moverMode ? 'none' : undefined } as React.CSSProperties,
                };
                const coord = <span className="editor-coord" aria-hidden="true">{o.x.toFixed(1)}, {o.y.toFixed(1)}</span>;
                const badge = isFlagged ? <span className="editor-flag-badge" aria-hidden="true">✕</span> : null;
                if (o.kind === 'house') {
                  return (
                    <span {...shared} className={shared.className + ' field-house new-house'}
                      style={{ ...shared.style, left: fieldPct(o.x - 6.5), top: fieldPct(o.y - 4.5), width: fieldPct(13), height: fieldPct(9) }}>
                      {coord}{badge}
                    </span>
                  );
                }
                if (o.kind === 'roadH' || o.kind === 'roadV') {
                  const horiz = o.kind === 'roadH';
                  return (
                    <span {...shared}
                      style={{ ...shared.style, left: fieldPct(o.x), top: fieldPct(o.y), width: fieldPct(horiz ? 16 : 3.2), height: fieldPct(horiz ? 3.2 : 16), transform: 'translate(-50%, -50%)' }}>
                      {coord}{badge}
                    </span>
                  );
                }
                // Trees / rocks reuse the environment sprite boxes, anchored
                // bottom-center on (o.x, o.y) in field-unit space.
                const box = o.kind === 'pine' ? { w: 96, h: 156 } : o.kind === 'rock' ? { w: 100, h: 69 } : { w: 47, h: 112 };
                const spriteClass = o.kind === 'pine' ? 'env-bigpine' : o.kind === 'rock' ? 'env-rock' : 'env-pine2';
                return (
                  <span {...shared} className={shared.className + ' field-tree ' + spriteClass}
                    style={{ ...shared.style, left: 'calc(' + fieldPct(o.x) + ' - ' + box.w / 2 + 'px)', top: 'calc(' + fieldPct(o.y) + ' - ' + box.h + 'px)', width: box.w, height: box.h }}>
                    {coord}{badge}
                  </span>
                );
              })}
              {/* Flag badges for generated trees/houses marked for removal. */}
              {moverMode && flaggedHere.filter((f) => f.kind !== 'placed').map((f) => (
                <span key={'flag-' + f.id} className="editor-flag-badge" aria-hidden="true"
                  style={{ left: fieldPct(f.x), top: fieldPct(f.y) }}>
                  ✕<span className="editor-coord">{f.x.toFixed(1)}, {f.y.toFixed(1)}</span>
                </span>
              ))}
              {markerMode && doorways.map((doorway) => {
                const rect = doorway.rect;
                const off = houseOffsets[doorway.id] || { x: 0, y: 0 };
                const movedRect = {
                  left: rect.left + off.x,
                  right: rect.right + off.x,
                  top: rect.top + off.y,
                  bottom: rect.bottom + off.y,
                };
                const door = { x: doorway.position.x + off.x, y: doorway.position.y + off.y };
                const exit = { x: door.x, y: movedRect.bottom + 0.7 };
                const { xTol } = doorwayTriggerDims(movedRect);
                // RED = collision rect, BLUE = hard-locked trigger zone, GREEN = exit spawn
                return (
                  <span key={'dbg-' + doorway.id}>
                    <span aria-hidden="true" style={{
                      position: 'absolute',
                      left: fieldPct(movedRect.left - 0.35),
                      top: fieldPct(movedRect.top - 0.35),
                      width: fieldPct((movedRect.right - movedRect.left) + 0.7),
                      height: fieldPct((movedRect.bottom - movedRect.top) + 0.7),
                      border: '2px solid red',
                      pointerEvents: 'none',
                      zIndex: 50,
                    }} />
                    <span aria-hidden="true" style={{
                      position: 'absolute',
                      left: fieldPct(door.x - xTol),
                      top: fieldPct(door.y),
                      width: fieldPct(xTol * 2),
                      height: fieldPct(2.5),
                      border: '2px solid blue',
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
            </div>
            </>
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
            const pois = modulePoisForChunk(chunk, DEFAULT_WORLD_SEED, {});
            const tappable = (kind: string) => kind === 'cemetery' || kind === 'ruin' || kind === 'crypt' || kind === 'forgotten_grave' || kind === 'cave' || kind === 'mine' || kind === 'buried_treasure' || kind === 'bandit_camp' || kind === 'battlefield' || kind === 'watchtower';
            const inspectPoi = (poi: PointOfInterest) => {
              const dangerWord = ['safe', 'mild', 'dangerous', 'deadly'][poi.danger] ?? 'unknown';
              setLogs((currentLogs) => [{ text: `${poi.name} (${dangerWord}): ${poi.description}`, color: 'blue' }, ...currentLogs].slice(0, 3));
            };
            // Civ phase 14: treasure-bearing POIs can be looted once each.
            const lootable = (kind: string) => kind === 'buried_treasure' || kind === 'bandit_camp' || kind === 'battlefield' || kind === 'ruin' || kind === 'mine' || kind === 'watchtower' || kind === 'crypt';
            const lootPoi = (poi: PointOfInterest) => {
              if (lootedPoisRef.current.includes(poi.id)) { inspectPoi(poi); return; }
              const [treasure] = treasureForPoi(poi, DEFAULT_WORLD_SEED);
              if (!treasure) { inspectPoi(poi); return; }
              const next = [...lootedPoisRef.current, poi.id];
              lootedPoisRef.current = next; setLootedPois(next);
              onLoot({ coins: treasure.goldAmount });
              setLogs((currentLogs) => [{ text: `Looted ${poi.name}: +${treasure.goldAmount} coins — ${treasure.items.join(', ')}.`, color: 'gold' }, ...currentLogs].slice(0, 3));
            };
            return (
              <>
                {pois.map((poi, i) => tappable(poi.kind) ? (
                  <button
                    key={'poi-' + i}
                    type="button"
                    className={'poi poi-' + poi.kind + (lootedPois.includes(poi.id) ? ' is-looted' : '')}
                    style={{ left: fieldPct(poi.position.x), top: fieldPct(poi.position.y), pointerEvents: (moverMode || markerMode) ? 'none' : 'auto', cursor: 'pointer' }}
                    onClick={() => (lootable(poi.kind) ? lootPoi(poi) : inspectPoi(poi))}
                    aria-label={poi.name + (lootedPois.includes(poi.id) ? ' (looted)' : '')}
                    title={poi.name + (lootable(poi.kind) && !lootedPois.includes(poi.id) ? ' — tap to loot' : '')}
                  />
                ) : (
                  <span
                    key={'poi-' + i}
                    className={'poi poi-' + poi.kind}
                    style={{ left: fieldPct(poi.position.x), top: fieldPct(poi.position.y) }}
                    aria-label={poi.name}
                    title={poi.name}
                  />
                ))}
              </>
            );
          })()}
          {currentWorldTile.landmark?.name === 'Mosslight Crossing' && npcStates.map((npc) => {
            const enter = npcEnterProps('npcstate-' + npc.name, npc.position, npc.facing as NpcFacing);
            return (
            <button
              className={'town-npc npc-' + npc.role + (npc.moving ? ' is-moving' : '') + (nameplateNpc === npc.name ? ' show-nameplate' : '') + (enter ? enter.className : '')}
              onClick={(moverMode || markerMode) ? undefined : () => talkToNpc(npc)}
              style={{ ...npcAppearanceStyle('npcstate-' + npc.name, npc.role), left: fieldPct(npc.position.x), top: fieldPct(npc.position.y), pointerEvents: (moverMode || markerMode) ? 'none' : undefined, ...(enter ? enter.style : {}) }}
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
              {barks['npcstate-' + npc.name] && <span className="npc-bark" aria-hidden="true">{barks['npcstate-' + npc.name]}</span>}
              <span className="npc-sprite" aria-hidden="true" />
            </button>
            );
          })}
          {travelers.map((traveler) => {
            const enter = npcEnterProps(traveler.id, traveler.position, traveler.facing);
            return (
            <button
              key={traveler.id}
              className={'town-npc traveler npc-' + traveler.role + (nameplateNpc === traveler.name ? ' show-nameplate' : '') + (enter ? enter.className : '')}
              onClick={(moverMode || markerMode) ? undefined : () => talkToTraveler(traveler)}
              style={{ ...npcAppearanceStyle('traveler-' + traveler.name, traveler.role), left: fieldPct(traveler.position.x), top: fieldPct(traveler.position.y), pointerEvents: (moverMode || markerMode) ? 'none' : undefined, ...(enter ? enter.style : {}) }}
              data-role={traveler.role}
              data-facing={traveler.facing}
              data-gender={traveler.gender}
              aria-label={traveler.name + ', ' + traveler.kind + ', bound for ' + traveler.destination}
              title={traveler.name + ' — bound for ' + traveler.destination}
              data-testid={traveler.id}
            >
              <span className="npc-nameplate">
                <span className="npc-role-mark" aria-hidden="true" />
                <strong>{traveler.name}</strong>
                <small>→ {traveler.destination}</small>
              </span>
              {barks[traveler.id] && <span className="npc-bark" aria-hidden="true">{barks[traveler.id]}</span>}
              <span className="npc-sprite" aria-hidden="true" />
            </button>
            );
          })}
          {visibleCaravans.map((c) => {
            const enter = npcEnterProps(c.id, c.position, c.facing);
            return (
            <button
              key={c.id}
              className={'town-npc traveler npc-merchant' + (nameplateNpc === c.merchant ? ' show-nameplate' : '') + (enter ? enter.className : '')}
              onClick={(moverMode || markerMode) ? undefined : () => talkToCaravan(c)}
              style={{ ...npcAppearanceStyle('caravan-' + c.merchant, 'merchant'), left: fieldPct(c.position.x), top: fieldPct(c.position.y), pointerEvents: (moverMode || markerMode) ? 'none' : undefined, ...(enter ? enter.style : {}) }}
              data-role="merchant"
              data-facing={c.facing}
              aria-label={c.merchant + ', caravan merchant, bound for ' + c.destination}
              title={c.merchant + ' — bound for ' + c.destination}
              data-testid={c.id}
            >
              <span className="npc-nameplate">
                <span className="npc-role-mark" aria-hidden="true" />
                <strong>{c.merchant}</strong>
                <small>🐪 → {c.destination}</small>
              </span>
              <span className="npc-sprite" aria-hidden="true" />
            </button>
            );
          })}
          {visibleUnits.map((u) => {
            const enter = npcEnterProps(u.id, u.position, u.facing);
            return (
            <button
              key={u.id}
              className={'town-npc npc-guard' + (nameplateNpc === u.name ? ' show-nameplate' : '') + (enter ? enter.className : '')}
              onClick={(moverMode || markerMode) ? undefined : () => talkToUnit(u)}
              style={{ ...npcAppearanceStyle('guard-' + u.name, 'guard'), left: fieldPct(u.position.x), top: fieldPct(u.position.y), pointerEvents: (moverMode || markerMode) ? 'none' : undefined, ...(enter ? enter.style : {}) }}
              data-role="guard"
              data-facing={u.facing}
              aria-label={u.name + ', ' + u.kind + ', ' + u.activity}
              title={u.name + ' — ' + u.activity}
              data-testid={u.id}
            >
              <span className="npc-nameplate">
                <span className="npc-role-mark" aria-hidden="true" />
                <strong>{u.name}</strong>
                <small>🛡️ {u.activity}</small>
              </span>
              <span className="npc-sprite" aria-hidden="true" />
            </button>
            );
          })}
          {visibleHorses.map((h) => (
            <button
              key={h.id}
              className={'horse' + (nameplateNpc === h.name ? ' show-nameplate' : '')}
              onClick={(moverMode || markerMode) ? undefined : () => talkToHorse(h)}
              style={{ left: fieldPct(h.position.x), top: fieldPct(h.position.y), pointerEvents: (moverMode || markerMode) ? 'none' : 'auto' }}
              data-facing="down"
              aria-label={h.name + ', horse, ' + h.activity.replace(/_/g, ' ')}
              title={h.name + ' — ' + h.activity.replace(/_/g, ' ')}
              data-testid={h.id}
            >
              <span className="npc-nameplate">
                <strong>{h.name}</strong>
                <small>🐴 {h.activity.replace(/_/g, ' ')}</small>
              </span>
              <span className="horse-sprite" aria-hidden="true" />
            </button>
          ))}
          {currentWorldTile.landmark?.name === 'Mosslight Crossing' && !moverMode && !markerMode && (
            <>
              {/* Townsfolk workplaces: garden plots + market stalls (decorative, like the fountain) */}
              <span className="farm-field town-garden" style={{ left: fieldPct(18), top: fieldPct(100), width: fieldPct(24), height: fieldPct(16) }} aria-label="Town garden" />
              <span className="farm-field town-garden" style={{ left: fieldPct(98), top: fieldPct(100), width: fieldPct(24), height: fieldPct(16) }} aria-label="Town garden" />
              <span className="market-stall" style={{ left: fieldPct(58), top: fieldPct(64) }} aria-label="Market stall" />
              <span className="market-stall" style={{ left: fieldPct(82), top: fieldPct(64) }} aria-label="Market stall" />
            </>
          )}
          {currentWorldTile.landmark?.name === 'Mosslight Crossing' && townsfolk.filter((npc) => !npc.indoors).map((npc) => {
            const enter = npcEnterProps(npc.id, npc.position, npc.facing);
            return (
            <button
              key={npc.id}
              className={'town-npc npc-' + npc.role + (npc.moving ? ' is-moving' : '') + (nameplateNpc === npc.name ? ' show-nameplate' : '') + (enter ? enter.className : '')}
              onClick={(moverMode || markerMode) ? undefined : () => talkToTownsfolk(npc)}
              style={{ ...npcAppearanceStyle(npc.id, npc.archetype), left: fieldPct(npc.position.x), top: fieldPct(npc.position.y), pointerEvents: (moverMode || markerMode) ? 'none' : undefined, ...(enter ? enter.style : {}) }}
              data-role={npc.role}
              data-facing={npc.facing}
              data-gender={npc.gender}
              aria-label={npc.name + ', ' + npc.archetype + ', ' + npc.activity}
              title={npc.name + ' — ' + npc.activity}
              data-testid={'townsfolk-' + npc.id}
            >
              <span className="npc-nameplate">
                <span className="npc-role-mark" aria-hidden="true" />
                <strong>{npc.name}</strong>
                <small>{npc.activity}</small>
              </span>
              {barks[npc.id] && <span className="npc-bark" aria-hidden="true">{barks[npc.id]}</span>}
              <span className="npc-sprite" aria-hidden="true" />
            </button>
            );
          })}
          {currentWorldTile.landmark?.name === 'Mosslight Crossing' && simulatedAdventurers.filter((adventurer) => (adventurer.location || 'field') === 'field').map((adventurer) => {
            const enter = npcEnterProps(adventurer.id, adventurer.position, adventurer.facing);
            return (
            <button
              type="button"
              key={adventurer.id}
              className={'simulated-adventurer adventurer-' + adventurer.className.toLowerCase() + (adventurer.moving ? ' is-moving' : '') + (selectedAdventurerId === adventurer.id ? ' is-nameplate-visible' : '') + (enter ? enter.className : '')}
              onClick={(moverMode || markerMode) ? undefined : () => inspectAdventurer(adventurer)}
              style={{ ...npcAppearanceStyle(adventurer.id, adventurer.className.toLowerCase(), { kind: 'adventurer' }), left: fieldPct(adventurer.position.x), top: fieldPct(adventurer.position.y), pointerEvents: (moverMode || markerMode) ? 'none' : undefined, ...(enter ? enter.style : {}) }}
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
            );
          })}
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
            // Carriage network: physical stations/stops render as part of the chunk.
            const clock = brainRef.current?.worldCore.getClock();
            const station = carriageStation;
            const stop = carriageStop;
            if (!station && !stop) return null;
            const driver = station ? station.driver : stop!.driver;
            const onDuty = clock ? driverOnDuty(driver, clock) : true;
            const s = station ? station.layout : null;
            const sign = station ? s!.sign : stop!.sign;
            const cart = station ? s!.carriage : stop!.carriage;
            const horsePos = station ? s!.horse : stop!.horse;
            const driverPos = station ? s!.driverPost : stop!.driverPost;
            const openDialog = () => setCarriageDialog(station ? { kind: 'station', station } : { kind: 'stop', stop: stop! });
            return (
              <div className="carriage-site" aria-label={station ? station.name : stop!.settlementName + ' carriage stop'}>
                {station && (
                  <>
                    <div className="carriage-house" style={{ left: fieldPct(s!.house.x), top: fieldPct(s!.house.y), width: fieldPct(16), height: fieldPct(11) }} aria-label="Station house" />
                    <div className="carriage-stable" style={{ left: fieldPct(s!.stable.x), top: fieldPct(s!.stable.y), width: fieldPct(13), height: fieldPct(9) }} aria-label="Stable" />
                    <div className="station-path" style={station.dir === 'north' || station.dir === 'south'
                      ? { left: fieldPct(Math.min(70, s!.carriage.x)), top: fieldPct(s!.carriage.y), width: fieldPct(Math.abs(s!.carriage.x - 70)), height: fieldPct(4) }
                      : { left: fieldPct(s!.carriage.x), top: fieldPct(Math.min(70, s!.carriage.y)), width: fieldPct(4), height: fieldPct(Math.abs(s!.carriage.y - 70)) }} aria-hidden="true" />
                    <div className="hitching-post" style={{ left: fieldPct(s!.hitching.x), top: fieldPct(s!.hitching.y) }} aria-label="Hitching post" />
                    {s!.lanterns.map((p, i) => <span key={i} className="carriage-lantern" style={{ left: fieldPct(p.x), top: fieldPct(p.y) }} aria-hidden="true" />)}
                  </>
                )}
                <div className="carriage-cart" style={{ left: fieldPct(cart.x), top: fieldPct(cart.y) }} aria-label="Carriage" />
                <div className="horse carriage-team-horse" style={{ left: fieldPct(horsePos.x), top: fieldPct(horsePos.y) }} data-facing="down" aria-label="Carriage horse"><span className="horse-sprite" /></div>
                <div className="carriage-sign" style={{ left: fieldPct(sign.x), top: fieldPct(sign.y) }} aria-label={station ? station.name : stop!.settlementName + ' carriage stop'}>
                  <span className="carriage-sign-board">{station ? 'CARRIAGE' : 'CARRIAGE STOP'}<small>{station ? station.name.replace(' Carriage Station', '') + ' Road' : stop!.settlementName}</small></span>
                </div>
                {onDuty ? (
                  <button
                    className="town-npc npc-guide carriage-driver show-nameplate"
                    style={{ left: fieldPct(driverPos.x), top: fieldPct(driverPos.y) }}
                    onClick={(moverMode || markerMode) ? undefined : openDialog}
                    aria-label={driver.name + ', carriage driver'}
                    title={driver.name + ' — ' + driver.greeting}
                    data-testid={'carriage-driver-' + (station ? station.id : stop!.id)}
                  >
                    <span className="npc-nameplate"><strong>{driver.name}</strong><small>Carriage driver</small></span>
                    <span className="npc-sprite" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="carriage-closed-note" style={{ left: fieldPct(sign.x), top: fieldPct(sign.y + 8) }} aria-hidden="true">Closed · opens {driver.openHour}:00</span>
                )}
              </div>
            );
          })()}
          {chunk.x === 4 && chunk.y === 7 && TAVERN_ANNEX_RECTS.map((r, i) => (
            <div
              key={'annex-' + i}
              className="tavern-annex"
              style={{ left: fieldPct((r.left + r.right) / 2), top: fieldPct((r.top + r.bottom) / 2), width: fieldPct(r.right - r.left), height: fieldPct(r.bottom - r.top) }}
              aria-label="Tavern guest rooms"
            />
          ))}
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
             data-state={attacking ? 'attack' : moving ? 'run' : 'idle'} style={{ left: gameZoom !== 1 ? '50%' : fieldPct(position.x), top: gameZoom !== 1 ? '50%' : fieldPct(position.y), '--attack-y': `${-attackDirectionRow[playerRenderFacing] * 48}px`, ...(gameZoom !== 1 ? { transform: `translate(-50%, -50%) scale(${gameZoom})` } : {}) } as CSSProperties} data-facing={playerRenderFacing} data-testid="player-character">
            <span className="player-sprite" />
            {attacking && <span key={attackSequence} className="player-attack-sprite" aria-hidden="true" style={{ '--attack-y': `${-attackDirectionRow[playerRenderFacing] * 48}px`, backgroundImage: `url("${assetUrl('assets/gameplay/shining-fields/characters/player/attack.png')}")` } as CSSProperties} />}
            {equippedDagger && <span className="player-dagger" aria-label="Equipped dagger" />}
            {equippedBow && <span className="player-bow" aria-label="Equipped bow" />}
            {markerMode && <span aria-hidden="true" style={{
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
        {waitSheetOpen && !waitProgress && (
          <div className="wait-overlay" role="dialog" aria-modal="true" aria-label="Wait and pass time" data-testid="overlay-wait">
            <div className="wait-card">
              <div className="options-heading">
                <div>
                  <span className="options-kicker">The world keeps living</span>
                  <h2>Wait</h2>
                </div>
                <button className="map-close" onClick={() => setWaitSheetOpen(false)} aria-label="Close wait menu" data-testid="button-close-wait"><X size={19} /></button>
              </div>
              <p className="wait-sub">Time passes and the simulation keeps running — NPCs follow their schedules, travelers move, shops open and close.</p>
              <div className="wait-options">
                {waitOptionTicks().map((option) => (
                  <button key={option.label} className="wait-option" onClick={() => startWait(option.ticks)} data-testid={'button-wait-' + option.ticks}>{option.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {waitProgress && (
          <div className="wait-overlay" role="dialog" aria-modal="true" aria-label="Waiting" data-testid="overlay-waiting">
            <div className="wait-card">
              <span className="options-kicker">Passing time…</span>
              <h2>{time}</h2>
              <div className="wait-bar" aria-label="Wait progress"><div className="wait-bar-fill" style={{ width: (waitProgress.done / waitProgress.total * 100) + '%' }} /></div>
              <button className="wait-option wait-cancel" onClick={cancelWait} data-testid="button-cancel-wait">Stop waiting</button>
            </div>
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
                <button className="options-action" onClick={() => { setOptionsOpen(false); toggleMoverMode(); }} data-testid="button-debug-mover">
                  <span className="options-action-icon"><Settings size={17} /></span>
                  <span><strong>Debug: World Editor{moverMode ? ' (Exit)' : ''}</strong><small>{moverMode ? 'Return to normal play' : 'Place houses, trees, rocks, roads · flag removals'}</small></span>
                </button>
                <button className="options-action" onClick={() => { setOptionsOpen(false); toggleMapBuilder(); }} data-testid="button-debug-mapbuilder">
                  <span className="options-action-icon"><Settings size={17} /></span>
                  <span><strong>🗺️ Map Builder{mapBuilderMode ? ' (Exit)' : ''}</strong><small>{mapBuilderMode ? 'Return to normal play' : 'Paint terrain tiles like a tilemap editor'}</small></span>
                </button>
                <button className="options-action" onClick={() => { setOptionsOpen(false); toggleMarkerMode(); }} data-testid="button-debug-markers">
                  <span className="options-action-icon"><Settings size={17} /></span>
                  <span><strong>Debug: {markerMode ? 'Hide' : 'Show'} Markers</strong><small>{markerMode ? 'Hide dots' : 'Green=triggers, Red=remove'}</small></span>
                </button>
                <button className="options-action" onClick={() => { setOptionsOpen(false); setInspectorOpen(true); }} data-testid="button-debug-inspector">
                  <span className="options-action-icon"><Settings size={17} /></span>
                  <span><strong>Debug: NPC Inspector</strong><small>Townsfolk, travelers, adventurers · go-to</small></span>
                </button>
                <button className="options-action" onClick={() => { setOptionsOpen(false); setCarriageDebugOpen(true); }} data-testid="button-debug-carriage">
                  <span className="options-action-icon"><Settings size={17} /></span>
                  <span><strong>Debug: Carriage Network</strong><small>Stations, routes, prices, times · go-to</small></span>
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
        {carriageDialog && (() => {
          const driver = carriageDialog.kind === 'station' ? carriageDialog.station.driver : carriageDialog.stop.driver;
          const clock = brainRef.current?.worldCore.getClock();
          const onDuty = clock ? driverOnDuty(driver, clock) : true;
          const discoveredNames = journal.discoveredLocations.map((l) => l.name);
          const dests = carriageDestinations(chunk, discoveredNames);
          const available = dests.filter((d) => d.discovered);
          return (
            <div className="npc-dialogue-overlay" role="dialog" aria-modal="true" aria-labelledby="carriage-dialogue-title">
              <div className="npc-dialogue-card carriage-dialogue-card">
                <div className={'dialogue-portrait npc-guide'} data-facing="down"><span className="npc-sprite" /></div>
                <div className="npc-dialogue-copy">
                  <span className="dialogue-kicker">Carriage Service</span>
                  <h2 id="carriage-dialogue-title">{driver.name}</h2>
                  <p className="carriage-driver-sub">{driver.age} · {driver.occupation} · {driver.personality}</p>
                  {!onDuty ? (
                    <p>"Come back in the morning."</p>
                  ) : available.length === 0 ? (
                    <p>"There's nowhere I can take you yet. Visit some settlements first."</p>
                  ) : (
                    <>
                      <p>"{driver.greeting}" Then: "Where would you like to go?"</p>
                      <div className="carriage-destinations" role="list" aria-label="Carriage destinations">
                        {dests.map((d) => (
                          <div key={d.name} className={'carriage-destination' + (d.discovered ? '' : ' is-locked')} role="listitem">
                            <span className="carriage-dest-name">{d.discovered ? d.name : '???'}</span>
                            <span className="carriage-dest-meta">{d.discovered ? `${d.price} gold · ${d.travelHours}h` : 'Undiscovered'}</span>
                            {d.discovered && (
                              <button
                                className="carriage-ride-button"
                                disabled={inventory.coins < d.price}
                                onClick={() => startCarriageTravel(d, driver.name)}
                                data-testid={'button-carriage-ride-' + d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}
                                title={inventory.coins < d.price ? "You don't have enough gold." : `Ride to ${d.name} for ${d.price} gold`}
                              >
                                {inventory.coins < d.price ? 'Need ' + d.price + 'g' : 'Ride · ' + d.price + 'g'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <button className="dialogue-close" onClick={() => setCarriageDialog(null)} data-testid="button-close-carriage">Leave</button>
                </div>
              </div>
            </div>
          );
        })()}
        {carriageTravel && (
          <div className="carriage-travel-overlay" role="status" aria-live="polite" data-testid="overlay-carriage-travel">
            <div className="carriage-travel-card">
              <p>Traveling to {carriageTravel.destName}…</p>
              <div className="carriage-travel-progress" aria-hidden="true">
                <span style={{ width: Math.round((carriageTravel.doneTicks / Math.max(1, carriageTravel.totalTicks)) * 100) + '%' }} />
              </div>
            </div>
          </div>
        )}
        {tavernMenuOpen && (
          <div className="npc-dialogue-overlay" role="dialog" aria-modal="true" aria-labelledby="tavern-menu-title">
            <div className="npc-dialogue-card tavern-menu-card">
              <div className="dialogue-portrait npc-guide" data-facing="down"><span className="npc-sprite" /></div>
              <div className="npc-dialogue-copy">
                <span className="dialogue-kicker">The Rusty Tankard</span>
                <h2 id="tavern-menu-title">Mira, Bartender</h2>
                <p>"Welcome in! What'll it be?"</p>
                <div className="tavern-menu-options" role="group" aria-label="Tavern services">
                  <button className="tavern-menu-option" onClick={tavernBuyBeer} data-testid="button-tavern-beer"><strong>🍺 Buy beer — 5 gold</strong><small>+50% attack for 1 minute. Drink it from your inventory.</small></button>
                  <button className="tavern-menu-option" onClick={tavernSleepUntilMorning} data-testid="button-tavern-room"><strong>🛏️ Rent a room — 10 gold</strong><small>Sleep until morning, wake fully healed.</small></button>
                  {!escortHired && (
                    <button className="tavern-menu-option" onClick={tavernHireEscort} data-testid="button-tavern-escort"><strong>🧭 Hire an escort — 50 gold</strong><small>A seasoned guide's wisdom: bonus XP, one time only.</small></button>
                  )}
                  <button className="tavern-menu-option" onClick={tavernRumor} data-testid="button-tavern-rumor"><strong>👂 Ask for rumors</strong><small>Free, of course.</small></button>
                  <button className="tavern-menu-option" onClick={tavernBuyLockpicks} data-testid="button-tavern-lockpicks"><strong>🗝 Buy lockpicks — 15 gold</strong><small>For locked chests. No questions asked.</small></button>
                  {questStateFor('rats-in-the-cellar')?.status !== 'completed' && (
                    <button className="tavern-menu-option" onClick={() => { setTavernMenuOpen(false); openQuestDialog('Mira'); }} data-testid="button-tavern-work"><strong>🐀 Ask about work</strong><small>Mira might have a job for you.</small></button>
                  )}
                </div>
                <button className="dialogue-close" onClick={() => setTavernMenuOpen(false)} data-testid="button-close-tavern">Leave</button>
              </div>
            </div>
          </div>
        )}
        {questDialog && (() => {
          const def = questById(questDialog.questId);
          if (!def) return null;
          const state = questStates.find((s) => s.questId === def.id);
          const stage = state?.status === 'active' ? def.stages[state.stageIndex] : null;
          const talkToGiver = !!stage && stage.kind === 'talk' && !!stage.target && stage.target.toLowerCase() === def.giver.name.toLowerCase();
          const bramMapStage = !!stage && stage.kind === 'collect' && stage.target === 'old_merchants_map' && def.giver.name === 'Bram';
          return (
            <div className="npc-dialogue-overlay" role="dialog" aria-modal="true" aria-labelledby="quest-dialogue-title" data-testid="overlay-quest-dialogue">
              <div className="npc-dialogue-card quest-dialogue-card">
                <div className="dialogue-portrait npc-guide" data-facing="down"><span className="npc-sprite" /></div>
                <div className="npc-dialogue-copy">
                  <span className="dialogue-kicker">Quest {def.storyQuest ? '· ⭐ Story' : ''}</span>
                  <h2 id="quest-dialogue-title">{def.title}</h2>
                  <p>"{def.description}"</p>
                  <p className="quest-dialogue-giver"><strong>{def.giver.name}</strong> · {def.giver.location}</p>
                  {state?.status === 'active' && stage && (
                    <p className="quest-dialogue-progress" data-testid="quest-dialogue-progress">Current: {questProgressText(def, state)}</p>
                  )}
                  <div className="quest-dialogue-rewards" aria-label="Quest rewards">
                    <span>🪙 {def.rewards.coins}</span><span>✦ {def.rewards.xp} XP</span>{def.rewards.items.map((item) => <span key={item}>🎁 {item}</span>)}
                  </div>
                  <div className="dialogue-options" role="group" aria-label="Quest options">
                    {!state && <button type="button" className="dialogue-option" onClick={() => acceptQuest(def.id)} data-testid="button-quest-accept">Accept quest</button>}
                    {talkToGiver && <button type="button" className="dialogue-option" onClick={() => emitQuestEvent({ type: 'talk', target: def.giver.name })} data-testid="button-quest-talk">Talk</button>}
                    {bramMapStage && <button type="button" className="dialogue-option" onClick={() => emitQuestEvent({ type: 'collect', target: 'old_merchants_map' })} data-testid="button-quest-take-map">Take the Old Merchant's Map</button>}
                    <button type="button" className="dialogue-option" onClick={() => setQuestDialog(null)} data-testid="button-quest-leave">Leave</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {/* BUILD 330: Oblivion-style townsfolk dialogue — selectable topics,
            per-NPC disposition, town reputation and wanted level. */}
        {townsfolkDialogue && (() => {
          const npc = townsfolkDialogue;
          const disp = disposition[npc.id] ?? defaultDisposition();
          const ctx = { name: npc.name, archetype: npc.archetype, activity: npc.activity, disposition: disp, townReputation: reputation.mosslight, seed: npc.seed };
          const resp = dialogueTopic ? responseFor(ctx, dialogueTopic) : null;
          return (
            <div className="npc-dialogue-overlay" role="dialog" aria-modal="true" aria-labelledby="townsfolk-dialogue-title" data-testid="townsfolk-dialogue">
              <div className="npc-dialogue-card townsfolk-dialogue">
                <div className={'dialogue-portrait npc-' + npc.role} data-facing={npc.facing} style={npcAppearanceStyle(npc.id, npc.archetype) as CSSProperties}><span className="npc-sprite" /></div>
                <div className="npc-dialogue-copy">
                  <span className="dialogue-kicker">{npc.archetype} · {npc.activity}</span>
                  <h2 id="townsfolk-dialogue-title">{npc.name}</h2>
                  <div className="dialogue-standing">
                    <span className="disposition-meter" role="img" aria-label={'Disposition ' + disp + ' of 100'}><i style={{ width: disp + '%' }} /></span>
                    <span className="disposition-label">{dispositionLabel(dispositionTier(disp))} ({disp})</span>
                  </div>
                  <div className="dialogue-standing">
                    <span>Mosslight rep: <strong className={reputation.mosslight >= 0 ? 'rep-positive' : 'rep-negative'}>{reputation.mosslight >= 0 ? '+' : ''}{reputation.mosslight}</strong></span>
                    <span>Wanted: <strong>{wantedLabel(wantedMosslight)}</strong></span>
                  </div>
                  {resp && <p className="dialogue-response">“{resp.text}”</p>}
                  <div className="dialogue-topics">
                    {topicsFor(npc.archetype).map((t) => (
                      <button key={t.id} type="button" className={'dialogue-topic' + (dialogueTopic === t.id ? ' is-active' : '')} onClick={() => chooseDialogueTopic(npc, t.id)}>{t.label}</button>
                    ))}
                  </div>
                </div>
                <button type="button" className="dialogue-close" onClick={() => { setTownsfolkDialogue(null); setDialogueTopic(null); }} aria-label="Close dialogue">✕</button>
              </div>
            </div>
          );
        })()}
        {attackFlash && <div className="combat-flash" aria-live="polite">{attackFlash}</div>}
        {/* BUILD 337: frame-error badge. If the game loop ever catches an
            error, it shows here (tap to dismiss) so the cause is visible. */}
        {loopErrorTick > 0 && loopErrorRef.current && (
          <button type="button" className="loop-error-badge" onClick={dismissLoopError} aria-label="Dismiss error">
            ⚠ frame error ×{loopErrorRef.current.count}: {loopErrorRef.current.message}
          </button>
        )}
        {!interior && (() => { const promptDoor = doorwayNear(position, chunk, houseOffsets); return promptDoor && <button type="button" className="door-prompt" aria-live="polite" onClick={() => enterDoorway(promptDoor, chunk)}>Enter {promptDoor.area.name}</button>; })()}
        {areaFlash && (
          <div className="area-flash" key={areaFlash.id} aria-live="polite" data-testid="area-entry-flash">
            <span className="area-flash-kicker">Entering</span>
            <strong>{areaFlash.label}</strong>
          </div>
        )}
        <div className="world-hud">
          {!hpBoxHidden ? (
          <div className={'hud-card ' + (playerHp / playerMaxHp <= 0.25 ? 'is-wounded' : '')} data-testid="hud-player">
            <div className="hud-label"><span>Player</span><span data-testid="text-level">LV {playerLevel}</span></div>
            <div className="bar" aria-label={'Health ' + playerHp + ' of ' + playerMaxHp} ><div className="bar-fill health" style={{ width: ((playerHp / playerMaxHp) * 100) + '%' }} /></div><span className="hud-health-value">{playerHp} / {playerMaxHp} HP</span>
            <div className="bar xp-bar" aria-label={'Experience ' + (playerXp % 100) + ' of 100 to next level'}><div className="bar-fill xp-fill" style={{ width: ((playerXp % 100)) + '%' }} /></div><span className="hud-xp-value">{playerXp % 100} / 100 XP</span>
            <span className="hud-clock" data-testid="text-hud-time">{time}</span>
            {Date.now() < beerBuffUntil && (
              <span className="hud-buff-chip" role="status" aria-label="Beer buff: +50% attack" title="Beer: +50% attack" data-testid="hud-beer-buff">🍺</span>
            )}
            <button className="hud-quick-button" onClick={() => setWaitSheetOpen(true)} aria-label="Wait / pass time" title="Wait" data-testid="button-wait"><Hourglass size={15} /></button>
            <div className="hud-quick-actions">
              <button className="hud-quick-button" onClick={() => setHpBoxHidden(true)} aria-label="Hide HP box" title="Hide HP box" data-testid="button-hide-hp-box"><EyeOff size={15} /></button>
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
          ) : (
            <button className="hud-quick-button hud-card-restore" onClick={() => setHpBoxHidden(false)} aria-label="Show HP box" title="Show HP box" data-testid="button-show-hp-box"><Eye size={15} /></button>
          )}
          <button className="hud-bag-button" onClick={onOpenInventory} aria-label="Open menu" title="Menu" data-testid="button-open-inventory"><Backpack size={17} /></button>
        </div>
        <div className="touch-controls" aria-label="Touch movement controls">
           <button className="touch-control up" aria-label="Move north" data-testid="button-move-up" onTouchStart={(event) => pressDirection('up', touchIdentifierOf(event))} onTouchEnd={(event) => releaseDirection('up', touchIdentifierOf(event))} onPointerDown={(event) => mousePressDirection('up', event)} onPointerUp={(event) => mouseReleaseDirection('up', event)} onPointerLeave={(event) => mouseReleaseDirection('up', event)}><ChevronUp size={18} /></button>
           <button className="touch-control left" aria-label="Move west" data-testid="button-move-left" onTouchStart={(event) => pressDirection('left', touchIdentifierOf(event))} onTouchEnd={(event) => releaseDirection('left', touchIdentifierOf(event))} onPointerDown={(event) => mousePressDirection('left', event)} onPointerUp={(event) => mouseReleaseDirection('left', event)} onPointerLeave={(event) => mouseReleaseDirection('left', event)}><ChevronLeft size={18} /></button>
           <button className="touch-control down" aria-label="Move south" data-testid="button-move-down" onTouchStart={(event) => pressDirection('down', touchIdentifierOf(event))} onTouchEnd={(event) => releaseDirection('down', touchIdentifierOf(event))} onPointerDown={(event) => mousePressDirection('down', event)} onPointerUp={(event) => mouseReleaseDirection('down', event)} onPointerLeave={(event) => mouseReleaseDirection('down', event)}><ChevronDown size={18} /></button>
           <button className="touch-control right" aria-label="Move east" data-testid="button-move-right" onTouchStart={(event) => pressDirection('right', touchIdentifierOf(event))} onTouchEnd={(event) => releaseDirection('right', touchIdentifierOf(event))} onPointerDown={(event) => mousePressDirection('right', event)} onPointerUp={(event) => mouseReleaseDirection('right', event)} onPointerLeave={(event) => mouseReleaseDirection('right', event)}><ChevronRight size={18} /></button>
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
           <div className="equipped-weapon-box" role="status" aria-label={'Equipped weapon: ' + (equippedBow ? 'Hunting bow' : equippedDagger ? 'Goat-horn dagger' : 'Fists')} title={equippedBow ? 'Hunting bow — attacks fire arrows' : equippedDagger ? 'Goat-horn dagger' : 'Fists'} data-testid="hud-equipped-weapon">
             <span className="equipped-weapon-icon" aria-hidden="true">{equippedBow ? '🏹' : equippedDagger ? '†' : '✊'}</span>
             <span className="equipped-weapon-label">{equippedBow ? 'Bow' : equippedDagger ? 'Dagger' : 'Fists'}</span>
           </div>
           {talkTarget && (
             <button className="icon-button field-talk-button" onClick={() => talkTarget.talk()} aria-label={'Talk to ' + talkTarget.name} title={'Talk to ' + talkTarget.name} data-testid="button-talk"><MessageCircle size={16} /></button>
           )}
           <button className="icon-button field-attack-button" onClick={() => attackGoat()} disabled={attackCooldownMs > 0 || attacking || inputLocked || (Boolean(interior) && interior?.roomType !== 'cellar') || (mounted && !equippedBow)} aria-label={equippedBow ? (selectedGoat ? 'Loose arrow at target' : 'Loose arrow') : (selectedGoat ? 'Strike selected goat' : 'Strike nearest goat')} title={equippedBow ? 'Fire bow · Space' : (selectedGoat ? 'Strike selected target · Space' : 'Strike nearest target · Space')} aria-disabled={attackCooldownMs > 0 || attacking} data-testid="button-attack">{equippedBow ? '🏹' : <Sword size={16} />}{attackCooldownMs > 0 && <span className="attack-cooldown-ring" style={{ background: 'conic-gradient(rgba(219, 120, 94, .95) ' + ((attackCooldownMs / PLAYER_ATTACK_COOLDOWN_MS) * 100) + '%, rgba(19, 43, 34, .2) 0)' }} aria-hidden="true" />}</button>
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
  const menuBridgeRef = useRef<{ openOptions: () => void; getTime: () => string; acceptQuest: (questId: string) => void; emitQuestEvent: (event: QuestEvent) => void; getKingdomLabels: () => { text: string; x: number; y: number }[]; getTradeRoutes: () => { id: string; name: string; points: { x: number; y: number }[] }[] } | null>(null);
  const [muted, setMuted] = useState(false);
  const [chunk, setChunk] = useState({ x: 4, y: 7 });
  const [inventory, setInventory] = useState<GameInventory>(initialInventory);
  // Quest log: states pushed up from GameField; the menu renders them.
  const [questStates, setQuestStates] = useState<QuestState[]>([]);
  const [questPlayerLevel, setQuestPlayerLevel] = useState(1);
  const weaveBowstring = () => {
    if (inventory.silk < 6) return;
    setInventory((current) => ({ ...current, silk: Math.max(0, current.silk - 6) }));
    menuBridgeRef.current?.emitQuestEvent({ type: 'craft', target: 'bowstring' });
  };
  const questReputationReward = (points: number) => {
    setReputation((current) => ({ ...current, mosslight: current.mosslight + points }));
  };
  // Beer buff: drinking a beer grants +50% attack for 1 minute (wall clock).
  const [beerBuffUntil, setBeerBuffUntil] = useState(0);
  const drinkBeer = () => {
    if (inventory.beer < 1) return;
    setInventory((current) => ({ ...current, beer: Math.max(0, current.beer - 1) }));
    const until = Date.now() + 60000;
    setBeerBuffUntil(until);
    window.setTimeout(() => setBeerBuffUntil((current) => (current === until ? 0 : current)), 60500);
  };
  const beerBuffActive = Date.now() < beerBuffUntil;
  const [playerStats, setPlayerStats] = useState<PlayerStats>(initialPlayerStats);
  const [statPoints, setStatPoints] = useState(0);
  const [equippedDagger, setEquippedDagger] = useState(false);
  const [equippedBow, setEquippedBow] = useState(false);
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
    wood: Math.max(0, current.wood + (loot.wood || 0)),
    silk: Math.max(0, current.silk + (loot.silk || 0)),
    bow: Math.max(0, current.bow + (loot.bow || 0)),
    beer: Math.max(0, current.beer + (loot.beer || 0)),
    lockpicks: Math.max(0, current.lockpicks + (loot.lockpicks || 0)),
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

  const toggleBow = () => {
    if (equippedBow) {
      setEquippedBow(false);
      setInventory((current) => ({ ...current, bow: current.bow + 1 }));
      return;
    }
    if (inventory.bow < 1) return;
    setInventory((current) => ({ ...current, bow: Math.max(0, current.bow - 1) }));
    setEquippedBow(true);
  };

  const startNewGame = () => {
    setLoadedSave(null);
    setInventory(initialInventory);
    setPlayerStats(initialPlayerStats);
    setStatPoints(0);
    setEquippedDagger(false);
    setEquippedBow(false);
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
    const savedEquippedBow = Boolean(parsed.equippedBow);
    setInventory({ ...initialInventory, ...parsed.inventory, daggers: Math.max(0, parsed.inventory.daggers - (savedEquippedDagger ? 1 : 0)), bow: Math.max(0, (parsed.inventory.bow || 0) - (savedEquippedBow ? 1 : 0)) });
    setPlayerStats(parsed.playerStats || initialPlayerStats);
    setStatPoints(Math.max(0, Math.floor(parsed.statPoints || 0)));
    setEquippedDagger(savedEquippedDagger);
    setEquippedBow(savedEquippedBow);
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
            <div className="main-menu-swords" aria-hidden="true">
              <Sword className="menu-sword sword-left" size={44} strokeWidth={1.75} />
              <Sword className="menu-sword sword-right" size={44} strokeWidth={1.75} />
            </div>
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
            <GameField inventory={inventory} equippedDagger={equippedDagger} equippedBow={equippedBow} playerStats={playerStats} statPoints={statPoints} characterChoices={characterChoices} onPlayerStatsChange={setPlayerStats} onStatPointsChange={setStatPoints} onLoot={applyLoot} onOpenMap={() => setMapOpen(true)} onOpenInventory={() => setInventoryOpen(true)} onOpenJournal={() => setJournalOpen(true)} onDiscoverLocation={discoverLocation} onRestorePrison={restorePrison} onRestoreJournal={restoreJournal} onRestoreReputation={restoreReputation} onQuestStatesChange={(states, level) => { setQuestStates(states); setQuestPlayerLevel(level); }} onQuestReputation={questReputationReward} onAddRumor={addRumor} onEscapeSpawnConsumed={() => setEscapeSpawn(null)} onChunkChange={setChunk} muted={muted} onToggleMute={() => setMuted((value) => !value)} inputLocked={mapOpen || inventoryOpen || dungeonOpen || journalOpen} saveStateRef={saveStateRef} loadState={loadedSave} onSave={saveGame} onDownloadSave={downloadSave} onOpenLoad={openLoadPicker} onOpenMenu={() => { setSaveNotice(null); setMenuOpen(true); }} onEnterDungeon={() => setDungeonOpen(true)} beerBuffUntil={beerBuffUntil} menuBridgeRef={menuBridgeRef} inPrison={inPrison} prisonState={prisonState} journal={journal} reputation={reputation} escapeSpawn={escapeSpawn} />
          </div>
          {dungeonOpen && <StoneSoupDungeon onExit={() => setDungeonOpen(false)} />}
          {mapOpen && <WorldMap chunk={chunk} onClose={() => setMapOpen(false)} kingdomLabels={menuBridgeRef.current?.getKingdomLabels() ?? []} tradeRoutes={menuBridgeRef.current?.getTradeRoutes() ?? []} />}
          {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1' && <DebugOverlay chunk={chunk} />}
          {inventoryOpen && <InventorySheet inventory={inventory} equippedDagger={equippedDagger} onToggleDagger={toggleDagger} equippedBow={equippedBow} onToggleBow={toggleBow} playerStats={playerStats} statPoints={statPoints} onAssignStat={assignStatPoint} time={menuBridgeRef.current?.getTime() ?? ''} onOpenOptions={() => menuBridgeRef.current?.openOptions()} onClose={() => setInventoryOpen(false)} onDrinkBeer={drinkBeer} beerBuffActive={beerBuffActive} questStates={questStates} questPlayerLevel={questPlayerLevel} onAcceptQuest={(questId) => menuBridgeRef.current?.acceptQuest(questId)} onWeaveBowstring={weaveBowstring} />}
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

// BUILD 339: LTTP-style procedural ground detail. Paints the chunk's ground
// (dithered grass/sand/rock/tundra/water, tufts, flowers, dirt roads) into a
// static canvas once per chunk and mounts it as the bottom field layer.
function FieldGroundLayer({ spec }: { spec: GroundDetailSpec }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // BUILD 341: repaint when the map-builder paints change.
  const paintSig = (spec.paints ?? []).map((p) => p.tx + ',' + p.ty + ':' + p.tile).join(';');
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      host.replaceChildren(renderGroundDetail(spec));
    } catch {
      // Leave the flat CSS ground as the fallback.
    }
  }, [spec.terrain, spec.field, spec.path, spec.road, spec.sea, spec.seed, paintSig]);
  return <div ref={hostRef} className="field-ground-layer" aria-hidden="true" />;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
