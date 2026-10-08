// Food web relationships (BUILD 494 — A-life Phase 2).
//
// Data-driven species relationships. Predator-prey dynamics emerge from
// these rules rather than hardcoded behavior.
//
// Relationship types:
// - preysOn: predator hunts prey
// - competesWith: compete for same food
// - avoids: prey avoids predator
// - feedsOn: herbivore eats plant
// - scavenges: eats carcasses

export type RelationshipKind =
  | 'preysOn' | 'competesWith' | 'avoids' | 'feedsOn' | 'scavenges';

export interface SpeciesRelationship {
  from: string; // species ID
  to: string;   // species ID or resource
  kind: RelationshipKind;
  /** Strength 0-1 */
  strength: number;
}

export const FOOD_WEB: SpeciesRelationship[] = [
  // Predators
  { from: 'wolf', to: 'deer', kind: 'preysOn', strength: 0.8 },
  { from: 'wolf', to: 'rabbit', kind: 'preysOn', strength: 0.6 },
  { from: 'wolf', to: 'boar', kind: 'preysOn', strength: 0.3 },
  { from: 'direwolf', to: 'deer', kind: 'preysOn', strength: 0.9 },
  { from: 'bear', to: 'deer', kind: 'preysOn', strength: 0.5 },
  { from: 'bear', to: 'fish', kind: 'preysOn', strength: 0.7 },

  // Prey avoids predators
  { from: 'deer', to: 'wolf', kind: 'avoids', strength: 0.9 },
  { from: 'rabbit', to: 'wolf', kind: 'avoids', strength: 0.9 },
  { from: 'rabbit', to: 'fox', kind: 'avoids', strength: 0.8 },

  // Herbivores feed on plants
  { from: 'deer', to: 'grass', kind: 'feedsOn', strength: 0.7 },
  { from: 'deer', to: 'berries', kind: 'feedsOn', strength: 0.3 },
  { from: 'rabbit', to: 'grass', kind: 'feedsOn', strength: 0.8 },
  { from: 'rabbit', to: 'berries', kind: 'feedsOn', strength: 0.5 },
  { from: 'boar', to: 'mushrooms', kind: 'feedsOn', strength: 0.6 },

  // Scavengers
  { from: 'crow', to: 'carcass', kind: 'scavenges', strength: 0.8 },
  { from: 'fox', to: 'carcass', kind: 'scavenges', strength: 0.5 },

  // Competition
  { from: 'deer', to: 'boar', kind: 'competesWith', strength: 0.4 },
  { from: 'rabbit', to: 'deer', kind: 'competesWith', strength: 0.3 },
];

/**
 * Get all relationships for a species.
 */
export function relationshipsFor(
  speciesId: string,
): SpeciesRelationship[] {
  return FOOD_WEB.filter(r => r.from === speciesId);
}

/**
 * Get predators of a species.
 */
export function predatorsOf(speciesId: string): SpeciesRelationship[] {
  return FOOD_WEB.filter(r => r.to === speciesId && r.kind === 'preysOn');
}

/**
 * Get prey of a species.
 */
export function preyOf(speciesId: string): SpeciesRelationship[] {
  return FOOD_WEB.filter(r => r.from === speciesId && r.kind === 'preysOn');
}

/**
 * Calculate predator pressure on a species (0-1).
 * Based on predator populations in the region.
 */
export function predatorPressureFor(
  speciesId: string,
  predatorPopulations: Record<string, number>,
): number {
  const predators = predatorsOf(speciesId);
  let pressure = 0;
  for (const rel of predators) {
    const pop = predatorPopulations[rel.from] || 0;
    // More predators → more pressure, scaled by relationship strength.
    pressure += Math.min(0.5, pop / 20) * rel.strength;
  }
  return Math.min(1, pressure);
}
