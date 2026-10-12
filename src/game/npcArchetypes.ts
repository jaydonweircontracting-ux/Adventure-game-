// NPC personality archetypes (BUILD 659 — Alien NPC Psychology Engine, Stage B).
// Ten data-driven archetypes using the existing 5-trait model (sociability,
// diligence, thrift, courage, curiosity) plus psychology parameters.
// Deterministic assignment by NPC seed. Pure — no React, no App dependency.

import { townsfolkHash } from './townsfolk';
import type { Townsperson } from './townsfolk';

export type NPCArchetypeId =
  | 'social_butterfly'
  | 'stoic'
  | 'curious_explorer'
  | 'hard_worker'
  | 'merchant'
  | 'guardian'
  | 'worrier'
  | 'kindhearted_helper'
  | 'ambitious_opportunist'
  | 'easygoing_wanderer';

export interface NPCArchetype {
  id: NPCArchetypeId;
  name: string;
  description: string;
  /** Base trait profile (0-1). Individual variation applied via seed. */
  traits: {
    sociability: number;
    diligence: number;
    thrift: number;
    courage: number;
    curiosity: number;
  };
  /** Psychology parameters (0-1 unless noted). */
  psychology: {
    /** How strongly events affect mood. */
    emotionalSensitivity: number;
    /** Resistance to stress accumulation. */
    stressTolerance: number;
    /** Drive to seek social contact. */
    socialMotivation: number;
    /** Willingness to take risks. */
    riskTolerance: number;
    /** Drive to complete work. */
    workMotivation: number;
    /** Willingness to help others. */
    cooperation: number;
    /** Preference for new experiences. */
    noveltyPreference: number;
    /** How quickly moods return to baseline (per game hour). */
    recoverySpeed: number;
    /** How visibly emotions are expressed. */
    expressiveness: number;
  };
}

export const NPC_ARCHETYPES: Record<NPCArchetypeId, NPCArchetype> = {
  social_butterfly: {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Highly sociable, curious, expressive. Seeks company, shares news.',
    traits: { sociability: 0.9, diligence: 0.5, thrift: 0.4, courage: 0.6, curiosity: 0.8 },
    psychology: {
      emotionalSensitivity: 0.7, stressTolerance: 0.6, socialMotivation: 0.95,
      riskTolerance: 0.6, workMotivation: 0.4, cooperation: 0.7,
      noveltyPreference: 0.7, recoverySpeed: 0.7, expressiveness: 0.9,
    },
  },
  stoic: {
    id: 'stoic',
    name: 'Stoic',
    description: 'Emotionally restrained, diligent, stable. Works through frustration.',
    traits: { sociability: 0.3, diligence: 0.8, thrift: 0.6, courage: 0.7, curiosity: 0.4 },
    psychology: {
      emotionalSensitivity: 0.3, stressTolerance: 0.9, socialMotivation: 0.3,
      riskTolerance: 0.5, workMotivation: 0.8, cooperation: 0.5,
      noveltyPreference: 0.3, recoverySpeed: 0.5, expressiveness: 0.2,
    },
  },
  curious_explorer: {
    id: 'curious_explorer',
    name: 'Curious Explorer',
    description: 'High curiosity, novelty-seeking. Investigates new places and events.',
    traits: { sociability: 0.5, diligence: 0.5, thrift: 0.3, courage: 0.6, curiosity: 0.95 },
    psychology: {
      emotionalSensitivity: 0.6, stressTolerance: 0.6, socialMotivation: 0.5,
      riskTolerance: 0.7, workMotivation: 0.4, cooperation: 0.5,
      noveltyPreference: 0.95, recoverySpeed: 0.6, expressiveness: 0.7,
    },
  },
  hard_worker: {
    id: 'hard_worker',
    name: 'Hard Worker',
    description: 'High diligence, responsible. Prioritizes work, frustrated by interruptions.',
    traits: { sociability: 0.4, diligence: 0.95, thrift: 0.6, courage: 0.5, curiosity: 0.3 },
    psychology: {
      emotionalSensitivity: 0.5, stressTolerance: 0.7, socialMotivation: 0.4,
      riskTolerance: 0.4, workMotivation: 0.95, cooperation: 0.6,
      noveltyPreference: 0.2, recoverySpeed: 0.5, expressiveness: 0.4,
    },
  },
  merchant: {
    id: 'merchant',
    name: 'Merchant',
    description: 'Thrifty, practical, commercially minded. Values fair transactions.',
    traits: { sociability: 0.6, diligence: 0.7, thrift: 0.95, courage: 0.4, curiosity: 0.5 },
    psychology: {
      emotionalSensitivity: 0.5, stressTolerance: 0.6, socialMotivation: 0.6,
      riskTolerance: 0.3, workMotivation: 0.8, cooperation: 0.5,
      noveltyPreference: 0.4, recoverySpeed: 0.6, expressiveness: 0.6,
    },
  },
  guardian: {
    id: 'guardian',
    name: 'Guardian',
    description: 'Protective, courageous, loyal. Watches for danger, helps others.',
    traits: { sociability: 0.5, diligence: 0.7, thrift: 0.4, courage: 0.95, curiosity: 0.5 },
    psychology: {
      emotionalSensitivity: 0.6, stressTolerance: 0.8, socialMotivation: 0.5,
      riskTolerance: 0.8, workMotivation: 0.7, cooperation: 0.8,
      noveltyPreference: 0.3, recoverySpeed: 0.6, expressiveness: 0.5,
    },
  },
  worrier: {
    id: 'worrier',
    name: 'Worrier',
    description: 'Cautious, risk-sensitive. Reacts strongly to danger, seeks reassurance.',
    traits: { sociability: 0.4, diligence: 0.6, thrift: 0.7, courage: 0.2, curiosity: 0.4 },
    psychology: {
      emotionalSensitivity: 0.9, stressTolerance: 0.3, socialMotivation: 0.5,
      riskTolerance: 0.2, workMotivation: 0.6, cooperation: 0.6,
      noveltyPreference: 0.2, recoverySpeed: 0.3, expressiveness: 0.7,
    },
  },
  kindhearted_helper: {
    id: 'kindhearted_helper',
    name: 'Kindhearted Helper',
    description: 'Compassionate, cooperative. Offers help, comforts others.',
    traits: { sociability: 0.8, diligence: 0.6, thrift: 0.3, courage: 0.5, curiosity: 0.6 },
    psychology: {
      emotionalSensitivity: 0.8, stressTolerance: 0.6, socialMotivation: 0.8,
      riskTolerance: 0.5, workMotivation: 0.5, cooperation: 0.95,
      noveltyPreference: 0.5, recoverySpeed: 0.7, expressiveness: 0.8,
    },
  },
  ambitious_opportunist: {
    id: 'ambitious_opportunist',
    name: 'Ambitious Opportunist',
    description: 'Goal-oriented, competitive. Notices opportunities, negotiates firmly.',
    traits: { sociability: 0.5, diligence: 0.8, thrift: 0.7, courage: 0.7, curiosity: 0.7 },
    psychology: {
      emotionalSensitivity: 0.6, stressTolerance: 0.7, socialMotivation: 0.5,
      riskTolerance: 0.7, workMotivation: 0.9, cooperation: 0.4,
      noveltyPreference: 0.6, recoverySpeed: 0.6, expressiveness: 0.6,
    },
  },
  easygoing_wanderer: {
    id: 'easygoing_wanderer',
    name: 'Easygoing Wanderer',
    description: 'Relaxed, adaptable. Handles setbacks well, enjoys discovery.',
    traits: { sociability: 0.6, diligence: 0.4, thrift: 0.4, courage: 0.5, curiosity: 0.7 },
    psychology: {
      emotionalSensitivity: 0.4, stressTolerance: 0.8, socialMotivation: 0.6,
      riskTolerance: 0.5, workMotivation: 0.3, cooperation: 0.6,
      noveltyPreference: 0.7, recoverySpeed: 0.8, expressiveness: 0.5,
    },
  },
};

const ARCHETYPE_IDS = Object.keys(NPC_ARCHETYPES) as NPCArchetypeId[];

/**
 * Deterministic archetype assignment by NPC seed.
 * Same NPC always gets the same archetype. Different NPCs vary.
 */
export function npcArchetype(npc: Townsperson): NPCArchetype {
  const hash = townsfolkHash(npc.seed, 9201);
  const index = Math.floor(hash * ARCHETYPE_IDS.length) % ARCHETYPE_IDS.length;
  return NPC_ARCHETYPES[ARCHETYPE_IDS[index]];
}

/**
 * Get archetype by ID (for testing/debugging).
 */
export function getArchetype(id: NPCArchetypeId): NPCArchetype {
  return NPC_ARCHETYPES[id];
}

/**
 * Individual trait variation within archetype.
 * Two NPCs with the same archetype get slightly different traits via seed.
 * Returns traits in 0-1 range, biased toward archetype base.
 */
export function npcArchetypeTraits(npc: Townsperson): {
  sociability: number; diligence: number; thrift: number; courage: number; curiosity: number;
} {
  const arch = npcArchetype(npc);
  const vary = (base: number, salt: number): number => {
    const v = townsfolkHash(npc.seed, salt);
    // ±0.15 variation around base, clamped to 0-1.
    return Math.max(0, Math.min(1, base + (v - 0.5) * 0.3));
  };
  return {
    sociability: vary(arch.traits.sociability, 9211),
    diligence: vary(arch.traits.diligence, 9212),
    thrift: vary(arch.traits.thrift, 9213),
    courage: vary(arch.traits.courage, 9214),
    curiosity: vary(arch.traits.curiosity, 9215),
  };
}
