import type { Direction, Terrain, RegionStyle, SettlementKind, PlayerClass, NpcRole, GoatDisposition, StatKey } from './constants';

// Basic geometric types
export type Point = { x: number; y: number };
export type FieldRect = { left: number; top: number; right: number; bottom: number };

// World and terrain types
export interface MapTile {
  x: number;
  y: number;
  terrain: Terrain;
  regionStyle: RegionStyle;
  waterFeature: 'river' | 'lake' | 'sea' | null;
  waterEdge: 'north' | 'south' | 'east' | 'west' | null;
  road: 'horizontal' | 'vertical' | 'cross' | 'none';
  bridge: boolean;
  landmark: { name: string; kind: SettlementKind } | null;
}

// Field rendering types
export interface FieldTree {
  id: number;
  x: number;
  y: number;
  scale: number;
  variant: number;
  style: RegionStyle;
}

export interface FieldAccent {
  id: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  kind: 'grass' | 'flower' | 'stone' | 'leaf';
}

// Movement and collision types
export interface CollisionBox {
  halfWidth: number;
  halfHeight: number;
}

// Inventory types
export interface GameInventory {
  coins: number;
  goatHorns: number;
  fabric: number;
  daggers: number;
  cloths: number;
}

export type GoatLoot = Partial<GameInventory>;

export interface DroppedLoot {
  id: number;
  chunk: Point;
  position: Point;
  loot: GoatLoot;
}

// Player types
export type PlayerStats = Record<StatKey, number>;

export interface DamageText {
  id: number;
  text: string;
  position: Point;
  kind: 'damage' | 'reward' | 'critical';
}

// Horse state
export interface HorseState {
  chunk: Point;
  position: Point;
}

// NPC types
export interface TownNpc {
  name: string;
  title: string;
  role: NpcRole;
  position: Point;
  facing: Direction;
}

// Interior types
export interface InteriorArea {
  id: string;
  name: string;
  description: string;
  roomType: 'guild' | 'inn' | 'chapel' | 'building';
  exteriorPosition: Point;
}

export interface Doorway {
  id: string;
  position: Point;
  area: InteriorArea;
  buildingIndex?: number;
}

// Goat AI and combat types
export type GoatStateName = 'idle' | 'wandering' | 'attacking' | 'hurt';

export interface GoatState {
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
}

// Simulated adventurer type
export interface SimulatedAdventurer {
  id: string;
  name: string;
  className: string;
  level: number;
  goal: string;
  activity: string;
  position: Point;
  facing: Direction;
  routeIndex: number;
}

// Craft recipe type
export type CraftItem = 'dagger' | 'cloths';

export interface CraftRecipe {
  name: string;
  description: string;
  cost: GoatLoot;
  reward: GoatLoot;
}

// RPG Brain game state
export interface RpgGameState {
  currentLocationId: string | null;
  currentChunkId: string | null;
  discoveredChunks: string[];
  discoveredLocations: string[];
  discoveredLore: string[];
  enteredBuildings: string[];
  completedDungeons: string[];
  history: Array<{ text: string; timestamp: number }>;
}

// World clock state
export interface WorldClockState {
  hour: number;
  minuteOfDay: number;
  day: number;
  season: string;
  year: number;
}

// Save game data
export interface SaveGameData {
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
}

// Type guards
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isPoint(value: unknown): value is Point {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

export function isGameInventory(value: unknown): value is GameInventory {
  return isRecord(value)
    && isFiniteNumber(value.coins)
    && isFiniteNumber(value.goatHorns)
    && isFiniteNumber(value.fabric)
    && isFiniteNumber(value.daggers)
    && isFiniteNumber(value.cloths);
}

export function isPlayerStats(value: unknown): value is PlayerStats {
  return isRecord(value)
    && Object.keys(value).every((key) => isFiniteNumber(value[key]) && value[key] >= 0);
}
