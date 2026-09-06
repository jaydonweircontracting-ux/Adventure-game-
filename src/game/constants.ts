// Game speed and movement constants
export const WALK_SPEED = 56; // Deliberately slower exploration pace
export const HORSE_SPEED = 180;
export const HORSE_MOUNT_DISTANCE = 4.5;

// Collision box dimensions
export const PLAYER_COLLISION_BOX = { halfWidth: 4.6, halfHeight: 3.4 };
export const GOAT_COLLISION_BOX = { halfWidth: 2.8, halfHeight: 2.5 };
export const COLLISION_GAP = 0.8;

// Interior constants
export const INTERIOR_DOORWAY_WIDTH_PX = 58;
export const INTERIOR_PLAYER_WIDTH_PX = 46;
export const INTERIOR_DOORWAY_PADDING_PX = 4;

// Terrain type definitions
export const TERRAIN_TYPES = ['meadow', 'woodland', 'rock', 'shore', 'autumn', 'ocean'] as const;
export type Terrain = (typeof TERRAIN_TYPES)[number];

// Field color palettes by terrain
export const FIELD_PALETTES: Record<Terrain, { field: string; path: string; glow: string }> = {
  meadow: { field: '#77a45b', path: '#d9b979', glow: 'rgba(255, 227, 157, .22)' },
  woodland: { field: '#658e58', path: '#c7a66b', glow: 'rgba(180, 214, 141, .18)' },
  rock: { field: '#87927a', path: '#c9b27d', glow: 'rgba(238, 228, 186, .2)' },
  shore: { field: '#6f9b88', path: '#dfc58d', glow: 'rgba(218, 239, 194, .2)' },
  autumn: { field: '#9b785d', path: '#d6ae70', glow: 'rgba(255, 198, 123, .2)' },
  ocean: { field: '#2a6f8d', path: '#8ab8bd', glow: 'rgba(140, 213, 219, .2)' },
};

// Region styles
export type RegionStyle = 'greenvale' | 'brackenfen' | 'ironwood' | 'northwatch' | 'sunwash' | 'ocean';

// Region color palettes
export const REGION_PALETTES: Record<Exclude<RegionStyle, 'ocean'>, { field: string; path: string; glow: string }> = {
  greenvale: { field: '#77a45b', path: '#d9b979', glow: 'rgba(255, 227, 157, .22)' },
  brackenfen: { field: '#617d51', path: '#bca979', glow: 'rgba(186, 207, 135, .2)' },
  ironwood: { field: '#587b58', path: '#c4a26c', glow: 'rgba(188, 219, 157, .18)' },
  northwatch: { field: '#858a78', path: '#d0bd8b', glow: 'rgba(238, 228, 186, .2)' },
  sunwash: { field: '#9a7658', path: '#d7ac6b', glow: 'rgba(255, 198, 123, .2)' },
};

// Goat behavior timing (milliseconds)
export const GOAT_TICK_MS = 500;
export const GOAT_WANDER_MIN_TICKS = 10;
export const GOAT_WANDER_MAX_TICKS = 20;
export const GOAT_STEP = 0.5;
export const GOAT_RESPAWN_TICKS = Math.ceil(12000 / GOAT_TICK_MS);
export const GOAT_SPAWN_DISPOSITION = 'calm' as const;

// Goat combat
export const GOAT_ATTACK_RANGE = 15;
export const GOAT_CLOSE_ATTACK_RANGE = 8;
export const GOAT_ATTACK_DAMAGE = 3;
export const GOAT_HP_PER_LEVEL = 4;
export const GOAT_DAMAGE_PER_LEVEL = 1;
export const GOAT_XP_REWARD = 25;
export const GOAT_MIN_XP_REWARD = 5;

// Player combat
export const PLAYER_ATTACK_COOLDOWN_MS = 800;
export const PLAYER_ATTACK_ANIMATION_MS = 650;
export const PLAYER_MAX_HP = 88;
export const PLAYER_BASE_ATTACK_DAMAGE = 5;
export const PLAYER_STAT_POINTS_PER_LEVEL = 5;

// Inventory and loot
export const GOAT_LOOT_TYPES = ['goatHorns', 'fabric', 'coins'] as const;

// Stat keys for player progression
export type StatKey = 'str' | 'dex' | 'int' | 'luk';
export const STAT_KEYS: StatKey[] = ['str', 'dex', 'int', 'luk'];

export const STAT_DETAILS: Record<StatKey, { label: string; description: string }> = {
  str: { label: 'Strength', description: 'Raises damage dealt per hit.' },
  dex: { label: 'Dexterity', description: 'Shortens your attack cooldown.' },
  int: { label: 'Intelligence', description: 'Raises max HP and bonus XP.' },
  luk: { label: 'Luck', description: 'Improves critical hits and loot rolls.' },
};

// Direction mapping
export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTION_KEYS: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

export const ATTACK_DIRECTION_ROW: Record<Direction, number> = {
  right: 0, down: 1, up: 2, left: 3,
};

export const DELTA: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -2.4 }, down: { x: 0, y: 2.4 }, left: { x: -2.4, y: 0 }, right: { x: 2.4, y: 0 },
};

// Build version
export const BUILD_NUMBER = '058';

// Settlement types
export type SettlementKind = 'village' | 'town';

// Player classes
export type PlayerClass = 'Beginner' | 'Warrior' | 'Mage' | 'Rogue';

// NPC roles
export type NpcRole = 'mage' | 'warrior' | 'guide' | 'rogue';

// Goat disposition states
export type GoatDisposition = 'calm' | 'aggressive' | 'defeated';

// Map bounds for atlas rendering
export const ATLAS_BOUNDS = { minX: -1, maxX: 11, minY: 1, maxY: 13 } as const;
