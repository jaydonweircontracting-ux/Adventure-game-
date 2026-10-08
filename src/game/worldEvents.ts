// Random world events (BUILD 491 — World Systems Phase 9).
//
// Lightweight procedural events that create spontaneous moments.
// Events are deterministic per chunk + time, so they don't feel random.
// Examples: traveling merchant, lost traveler, animal herd, etc.

import { wfcSeedFor } from './wfc';

export type WorldEventKind =
  | 'traveling_merchant'
  | 'lost_traveler'
  | 'injured_adventurer'
  | 'animal_herd'
  | 'treasure_hunter'
  | 'caravan'
  | 'wandering_monster'
  | 'abandoned_camp'
  | 'rare_creature'
  | 'help_request';

export interface WorldEvent {
  id: string;
  kind: WorldEventKind;
  /** Chunk where event occurs */
  chunk: { x: number; y: number };
  /** Description for logs/examine */
  description: string;
  /** Ticks until event expires */
  expiresIn: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENT_DESCRIPTIONS: Record<WorldEventKind, string> = {
  traveling_merchant: 'A traveling merchant has set up camp nearby.',
  lost_traveler: 'A lost traveler asks for directions.',
  injured_adventurer: 'An injured adventurer needs help.',
  animal_herd: 'A herd of animals passes through.',
  treasure_hunter: 'A treasure hunter shares a rumor.',
  caravan: 'A merchant caravan travels the road.',
  wandering_monster: 'A dangerous creature roams nearby.',
  abandoned_camp: 'An abandoned camp. The fire is still warm.',
  rare_creature: 'A rare creature has been sighted!',
  help_request: 'Someone calls for help!',
};

/**
 * Check for a world event in a chunk at a given time.
 * Deterministic: same chunk + time → same event (or none).
 * @param chunkX chunk X, chunkY chunk Y
 * @param worldSeed master seed
 * @param dayCount days since world start (for time variation)
 * @returns event or null
 */
export function eventForChunk(
  chunkX: number,
  chunkY: number,
  worldSeed: number,
  dayCount: number,
): WorldEvent | null {
  // Events change daily. Use dayCount in seed.
  const seed = wfcSeedFor(worldSeed, chunkX, chunkY, `event-d${dayCount}`);
  const rng = mulberry32(seed);

  // 15% chance of an event per chunk per day.
  if (rng() > 0.15) return null;

  const kinds: WorldEventKind[] = [
    'traveling_merchant', 'lost_traveler', 'injured_adventurer',
    'animal_herd', 'treasure_hunter', 'caravan',
    'wandering_monster', 'abandoned_camp', 'rare_creature', 'help_request',
  ];
  const kind = kinds[Math.floor(rng() * kinds.length)];

  return {
    id: `evt_${chunkX}_${chunkY}_d${dayCount}`,
    kind,
    chunk: { x: chunkX, y: chunkY },
    description: EVENT_DESCRIPTIONS[kind],
    expiresIn: 1000, // ticks (about a day)
  };
}
