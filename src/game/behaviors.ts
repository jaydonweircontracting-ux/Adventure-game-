// Creature behavior primitives (BUILD 500 — A-life Phase 6).
//
// Reusable behavior primitives that combine according to species data.
// Instead of massive AI scripts per animal, species define which
// behaviors they use and when. Simple rules → emergent behavior.

export type BehaviorKind =
  | 'wander'
  | 'forage'
  | 'drink'
  | 'sleep'
  | 'flee'
  | 'hunt'
  | 'follow'
  | 'seekShelter'
  | 'defendTerritory'
  | 'mate'
  | 'migrate'
  | 'scavenge'
  | 'investigateSound'
  | 'rest';

export interface BehaviorState {
  current: BehaviorKind;
  /** Ticks in current behavior */
  ticksInBehavior: number;
  /** Target position (if any) */
  targetX: number | null;
  targetY: number | null;
  /** Target entity ID (if any) */
  targetId: string | null;
}

export interface BehaviorContext {
  /** Is predator nearby? */
  predatorNearby: boolean;
  /** Is prey nearby? (for predators) */
  preyNearby: boolean;
  /** Hunger 0-1 (1 = starving) */
  hunger: number;
  /** Thirst 0-1 */
  thirst: number;
  /** Energy 0-1 (0 = exhausted) */
  energy: number;
  /** Is it night? */
  isNight: boolean;
  /** Is there danger? (sound, player, etc.) */
  danger: boolean;
  /** Food availability 0-1 */
  foodAvailable: number;
}

/**
 * Species behavior configuration.
 * Which behaviors a species uses and their priorities.
 */
export interface SpeciesBehavior {
  speciesId: string;
  /** Behaviors in priority order */
  priorities: BehaviorKind[];
  /** Is nocturnal? */
  nocturnal: boolean;
  /** Is a predator? */
  isPredator: boolean;
}

const SPECIES_BEHAVIORS: Record<string, SpeciesBehavior> = {
  deer: {
    speciesId: 'deer',
    priorities: ['flee', 'drink', 'forage', 'rest', 'wander', 'sleep', 'mate'],
    nocturnal: false,
    isPredator: false,
  },
  rabbit: {
    speciesId: 'rabbit',
    priorities: ['flee', 'forage', 'rest', 'wander', 'sleep'],
    nocturnal: false,
    isPredator: false,
  },
  wolf: {
    speciesId: 'wolf',
    priorities: ['flee', 'hunt', 'drink', 'rest', 'wander', 'sleep', 'defendTerritory'],
    nocturnal: true,
    isPredator: true,
  },
  boar: {
    speciesId: 'boar',
    priorities: ['flee', 'forage', 'drink', 'rest', 'wander', 'sleep'],
    nocturnal: false,
    isPredator: false,
  },
};

export function behaviorForSpecies(speciesId: string): SpeciesBehavior | null {
  return SPECIES_BEHAVIORS[speciesId] ?? null;
}

/**
 * Select the next behavior based on context and species priorities.
 * Higher priority behaviors override lower ones when their conditions met.
 */
export function selectBehavior(
  species: SpeciesBehavior,
  ctx: BehaviorContext,
  current: BehaviorState,
): BehaviorKind {
  // Flee has highest priority if danger.
  if (ctx.danger || ctx.predatorNearby) {
    if (species.priorities.includes('flee')) return 'flee';
  }

  // Predators hunt when hungry and prey nearby.
  if (species.isPredator && ctx.preyNearby && ctx.hunger > 0.5) {
    if (species.priorities.includes('hunt')) return 'hunt';
  }

  // Drink when thirsty.
  if (ctx.thirst > 0.7) {
    if (species.priorities.includes('drink')) return 'drink';
  }

  // Forage when hungry.
  if (ctx.hunger > 0.6 && ctx.foodAvailable > 0.2) {
    if (species.priorities.includes('forage')) return 'forage';
  }

  // Sleep at appropriate time.
  // Diurnal sleeps at night, nocturnal sleeps during day.
  const shouldSleep = species.nocturnal ? !ctx.isNight : ctx.isNight;
  if (shouldSleep && ctx.energy < 0.3) {
    if (species.priorities.includes('sleep')) return 'sleep';
  }

  // Rest when tired.
  if (ctx.energy < 0.4) {
    if (species.priorities.includes('rest')) return 'rest';
  }

  // Default: wander.
  if (species.priorities.includes('wander')) return 'wander';

  // Fallback to first priority.
  return species.priorities[0];
}

/**
 * Create initial behavior state.
 */
export function initialBehaviorState(): BehaviorState {
  return {
    current: 'wander',
    ticksInBehavior: 0,
    targetX: null,
    targetY: null,
    targetId: null,
  };
}
