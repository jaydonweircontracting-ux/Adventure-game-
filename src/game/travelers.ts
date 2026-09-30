// Road traffic for the living world (phase 8).
//
// Travelers are FULLY analytic: a traveler's position is a pure function of
// (chunk, world clock). No per-frame AI, no stored state, no chunk-transition
// bookkeeping — when the player enters a chunk, its travelers are already
// exactly where the simulation says they should be (phase 21: the population
// conceptually exists before the player arrives).
import type { WorldClockState } from './worldCore';
import { townsfolkHash } from './townsfolk';

export type TravelerPoint = { x: number; y: number };
export type TravelerFacing = 'up' | 'down' | 'left' | 'right';
export type TravelerKind = 'merchant' | 'traveler' | 'courier';
export type RoadArms = { n: boolean; s: boolean; e: boolean; w: boolean };

export type Traveler = {
  id: string;
  name: string;
  kind: TravelerKind;
  /** Reuses the existing .town-npc.npc-<role> sprite classes. */
  role: 'mage' | 'warrior' | 'guide' | 'rogue';
  position: TravelerPoint;
  facing: TravelerFacing;
  destination: string;
};

const TRAVELER_NAMES = ['Rhea', 'Odo', 'Fen', 'Asha', 'Corb', 'Linnet', 'Pell', 'Sorrel', 'Bramm', 'Tilda', 'Ost', 'Wrenna'];
const TRAVELER_KINDS: TravelerKind[] = ['merchant', 'traveler', 'traveler', 'courier'];
const TRAVELER_ROLES: Record<TravelerKind, Traveler['role']> = { merchant: 'mage', traveler: 'guide', courier: 'rogue' };
const DESTINATIONS = [
  'Dunewatch', 'Frosthold', 'Eastmarch', 'Westhold', 'Stormhaven',
  'Mosslight Crossing', 'the north road', 'the coast', 'the old mill',
];

export function chunkSeedFor(x: number, y: number): number {
  return (Math.abs(Math.round(x) * 73856093 ^ Math.round(y) * 19349663)) >>> 0;
}

/**
 * How many travelers are on this chunk's roads right now. Traffic follows
 * the time of day: morning/evening rush, quiet nights — never a fixed cast.
 */
export function travelerCountFor(chunkSeed: number, clock: WorldClockState, armCount: number): number {
  if (armCount === 0) return 0;
  const hour = Math.floor(clock.hour);
  if (hour >= 22 || hour < 5) return townsfolkHash(chunkSeed, 8) < 0.3 ? 1 : 0;
  const base = 1 + Math.floor(townsfolkHash(chunkSeed, 7) * 3); // 1–3
  const rush = (hour >= 6 && hour < 10) || (hour >= 16 && hour < 20) ? 1 : 0;
  return Math.min(4, base + rush);
}

/**
 * Resolve this chunk's travelers for the current world clock. Travelers walk
 * the road axes (y=70 for east-west, x=70 for north-south) on offset lanes so
 * opposite directions pass each other, and wrap past the chunk edges.
 */
export function travelersForChunk(
  chunk: { x: number; y: number },
  arms: RoadArms,
  clock: WorldClockState,
): Traveler[] {
  const seed = chunkSeedFor(chunk.x, chunk.y);
  const armList = (['n', 's', 'e', 'w'] as const).filter((arm) => arms[arm]);
  const count = travelerCountFor(seed, clock, armList.length);
  if (count === 0) return [];
  const totalMinutes = Math.floor(clock.day) * 1440 + Math.floor(clock.hour) * 60 + (Math.floor(clock.minuteOfDay) % 60);
  const travelers: Traveler[] = [];
  for (let i = 0; i < count; i++) {
    const axisArm = armList[Math.floor(townsfolkHash(seed, 100 + i) * armList.length) % armList.length];
    const horizontal = axisArm === 'e' || axisArm === 'w';
    const dirSign = townsfolkHash(seed, 200 + i) < 0.5 ? 1 : -1;
    // Field units per game-minute: unhurried walking pace.
    const speed = 0.35 + townsfolkHash(seed, 300 + i) * 0.3;
    const span = 160;
    const along = ((townsfolkHash(seed, 400 + i) * span + totalMinutes * speed) % span) - 10;
    const pos = dirSign > 0 ? along : 140 - along;
    const lane = (townsfolkHash(seed, 500 + i) < 0.5 ? -1 : 1) * 3.5;
    const kind = TRAVELER_KINDS[Math.floor(townsfolkHash(seed, 700 + i) * TRAVELER_KINDS.length) % TRAVELER_KINDS.length];
    travelers.push({
      id: `traveler-${chunk.x},${chunk.y}-${i}`,
      name: TRAVELER_NAMES[Math.floor(townsfolkHash(seed, 600 + i) * TRAVELER_NAMES.length) % TRAVELER_NAMES.length],
      kind,
      role: TRAVELER_ROLES[kind],
      position: horizontal ? { x: pos, y: 70 + lane } : { x: 70 + lane, y: pos },
      facing: horizontal ? (dirSign > 0 ? 'right' : 'left') : (dirSign > 0 ? 'down' : 'up'),
      destination: DESTINATIONS[Math.floor(townsfolkHash(seed, 800 + i) * DESTINATIONS.length) % DESTINATIONS.length],
    });
  }
  return travelers;
}
