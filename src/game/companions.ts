// Companion system foundation (BUILD 485 — Infinite World Phase 3).
//
// Companions are creatures the player can tame and fight alongside.
// Each has: species, rarity, personality, stats, combat role, abilities,
// elemental affinity, level/progression.
//
// Roles: tank, melee, ranged, healer, support, mobility, crowd_control.
// This is the DATA layer. Taming mechanic, combat AI, and UI are Phase 4+.

import { Element } from './elements';

export type CompanionRole =
  | 'tank' | 'melee' | 'ranged' | 'healer'
  | 'support' | 'mobility' | 'crowd_control';

export type CompanionRarity =
  | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type CompanionPersonality =
  | 'brave' | 'cautious' | 'playful' | 'loyal' | 'fierce' | 'gentle';

export interface CompanionSpecies {
  id: string;
  name: string;
  /** Base critter kind (deer, boar, badger, direwolf, etc.) */
  baseKind: string;
  element: Element;
  role: CompanionRole;
  rarity: CompanionRarity;
  /** Base stats at level 1 */
  baseStats: {
    hp: number;
    damage: number;
    speed: number;
  };
  /** Stat growth per level */
  growth: {
    hp: number;
    damage: number;
  };
  /** Preferred biome types */
  habitats: string[];
  /** Taming difficulty (1-10) */
  tameDifficulty: number;
  description: string;
}

export const COMPANION_SPECIES: CompanionSpecies[] = [
  {
    id: 'ember_fox',
    name: 'Ember Fox',
    baseKind: 'fox',
    element: 'fire',
    role: 'ranged',
    rarity: 'uncommon',
    baseStats: { hp: 40, damage: 8, speed: 1.2 },
    growth: { hp: 8, damage: 2 },
    habitats: ['forest', 'grassland'],
    tameDifficulty: 4,
    description: 'A fox wreathed in gentle flames. Its fire attack burns enemies.',
  },
  {
    id: 'frost_wolf',
    name: 'Frost Wolf',
    baseKind: 'direwolf',
    element: 'ice',
    role: 'melee',
    rarity: 'rare',
    baseStats: { hp: 70, damage: 12, speed: 1.1 },
    growth: { hp: 12, damage: 3 },
    habitats: ['snow', 'mountain'],
    tameDifficulty: 6,
    description: 'A wolf with ice in its breath. Slows enemies with frost.',
  },
  {
    id: 'thorn_boar',
    name: 'Thorn Boar',
    baseKind: 'boar',
    element: 'nature',
    role: 'tank',
    rarity: 'common',
    baseStats: { hp: 90, damage: 6, speed: 0.8 },
    growth: { hp: 15, damage: 1.5 },
    habitats: ['forest', 'grassland'],
    tameDifficulty: 3,
    description: 'A sturdy boar covered in thorns. Absorbs damage for the player.',
  },
  {
    id: 'gale_hawk',
    name: 'Gale Hawk',
    baseKind: 'bird',
    element: 'wind',
    role: 'mobility',
    rarity: 'uncommon',
    baseStats: { hp: 35, damage: 7, speed: 1.5 },
    growth: { hp: 6, damage: 2 },
    habitats: ['mountain', 'grassland'],
    tameDifficulty: 5,
    description: 'A swift hawk that rides the wind. Can reposition the player.',
  },
  {
    id: 'mud_turtle',
    name: 'Mud Turtle',
    baseKind: 'turtle',
    element: 'water',
    role: 'healer',
    rarity: 'common',
    baseStats: { hp: 80, damage: 4, speed: 0.6 },
    growth: { hp: 14, damage: 1 },
    habitats: ['swamp', 'coast'],
    tameDifficulty: 2,
    description: 'A gentle turtle with healing waters. Restores player HP.',
  },
  {
    id: 'stone_golem',
    name: 'Stone Golem',
    baseKind: 'golem',
    element: 'earth',
    role: 'tank',
    rarity: 'epic',
    baseStats: { hp: 150, damage: 15, speed: 0.5 },
    growth: { hp: 25, damage: 4 },
    habitats: ['mountain', 'badlands'],
    tameDifficulty: 8,
    description: 'An ancient stone guardian. Creates cover and knocks back enemies.',
  },
  {
    id: 'shadow_stag',
    name: 'Shadow Stag',
    baseKind: 'deer',
    element: 'shadow',
    role: 'crowd_control',
    rarity: 'legendary',
    baseStats: { hp: 60, damage: 10, speed: 1.3 },
    growth: { hp: 10, damage: 3 },
    habitats: ['forest', 'swamp'],
    tameDifficulty: 9,
    description: 'A mysterious stag wreathed in shadows. Confuses groups of enemies.',
  },
  {
    id: 'spark_rat',
    name: 'Spark Rat',
    baseKind: 'rat',
    element: 'lightning',
    role: 'melee',
    rarity: 'common',
    baseStats: { hp: 30, damage: 6, speed: 1.4 },
    growth: { hp: 5, damage: 1.5 },
    habitats: ['ruin', 'cave'],
    tameDifficulty: 3,
    description: 'A rat crackling with static. Fast attacks, strong vs wet targets.',
  },
];

export interface Companion {
  /** Unique instance ID */
  id: string;
  speciesId: string;
  name: string; // species name, or custom nickname
  level: number;
  xp: number;
  /** Current HP */
  hp: number;
  /** Personality affects behavior */
  personality: CompanionPersonality;
  /** Whether currently active (following player) */
  active: boolean;
}

/**
 * Calculate companion stats at a given level.
 */
export function companionStatsForLevel(
  species: CompanionSpecies,
  level: number,
): { hp: number; damage: number; speed: number } {
  return {
    hp: species.baseStats.hp + species.growth.hp * (level - 1),
    damage: species.baseStats.damage + species.growth.damage * (level - 1),
    speed: species.baseStats.speed,
  };
}

/**
 * XP required for next level.
 */
export function companionXpForLevel(level: number): number {
  return Math.floor(50 * Math.pow(1.5, level - 1));
}
