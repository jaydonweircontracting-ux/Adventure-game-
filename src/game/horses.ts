// NPC/world horse entities + mounting system (living-world phases 11, 19-21).
//
// Design notes:
// - This module covers WORLD horses only. The player's own mount lives in
//   App.tsx HorseState and is NOT touched here.
// - Like travelers.ts, everything is analytic: a horse's position is a pure
//   function of (horse, owner schedule, world clock). There is no per-frame
//   horse AI and no stored state — the simulation resolves where a horse
//   should be for the current clock tick, so the world is consistent across
//   loads and long waits.
// - NO Math.random anywhere; all determinism comes from townsfolkHash-style
//   hashing. All types are plain serializable data.
// - Horse ownership is NOT universal: nobles, guards, soldiers, messengers,
//   merchants, hunters and wealthy travelers own horses based on
//   wealth/occupation/faction/location/military status. Farmers and servants
//   almost never do. A few wild horses roam.
import type { WorldClockState } from './worldCore';
import { townsfolkHash } from './townsfolk';
import { characterSeed, type CharacterProfile, type CharacterOccupation } from './characterGen';

export type HorsePoint = { x: number; y: number };
export type HorseChunk = { x: number; y: number };

export type Horse = {
  id: string;
  name: string;
  /** Character profile id of the owner, or 'wild'. */
  owner: string;
  chunk: HorseChunk;
  /** Field-unit coordinates within the chunk (0..FIELD_SIZE), same system as players/NPCs. */
  position: HorsePoint;
  health: number;
  maxHealth: number;
  /** Field units per game-minute while ridden. */
  speed: number;
  inventory: string[];
  /** Stable id where the horse belongs when stabled. */
  stableId: string;
  /** Profile id of the current rider, or null when unridden. */
  currentRider: string | null;
  color: string;
};

export type Stable = {
  id: string;
  settlementId: string;
  chunk: HorseChunk;
  position: HorsePoint;
  capacity: number;
};

/** Input shape for settlements that may hold stables. No App.tsx dependency. */
export type HorseSettlement = {
  id: string;
  chunk: HorseChunk;
  kind: 'capital' | 'city' | 'town' | 'village' | 'hamlet';
};

export type HorseActivity = 'stabled' | 'being_led' | 'ridden' | 'grazing';

export type HorseTarget = {
  activity: HorseActivity;
  chunk: HorseChunk;
  position: HorsePoint;
};

export type MountedTraveler = {
  id: string;
  name: string;
  occupation: CharacterOccupation;
  horseId: string;
  chunk: HorseChunk;
  position: HorsePoint;
  facing: 'up' | 'down' | 'left' | 'right';
  destination: string;
  origin: string;
};

const HORSE_NAMES = [
  'Ash', 'Bramble', 'Cinder', 'Dusk', 'Ember', 'Flint', 'Gale', 'Hazel',
  'Ivy', 'Juniper', 'Koda', 'Lark', 'Maple', 'Night', 'Onyx', 'Pippin',
  'Quartz', 'Rowan', 'Sable', 'Thistle', 'Umber', 'Vesper', 'Willow', 'Zephyr',
];

const HORSE_COLORS = ['bay', 'chestnut', 'black', 'gray', 'palomino', 'dappled gray', 'roan', 'white'];

// ---------------------------------------------------------------------------
// Ownership: who gets a horse
// ---------------------------------------------------------------------------

/** Occupations whose members commonly own horses (before the wealth check). */
const HORSE_OCCUPATIONS: Partial<Record<CharacterOccupation, number>> = {
  noble: 0.95, ruler: 0.95, queen: 0.95,
  guard: 0.75, soldier: 0.7, archer: 0.5, scout: 0.7,
  hunter: 0.65, horseRider: 0.9, caravanWorker: 0.6,
  merchant: 0.5, trader: 0.5,
  traveler: 0.25, adventurer: 0.3,
};

function ownershipChance(profile: CharacterProfile): number {
  const base = HORSE_OCCUPATIONS[profile.occupation] ?? 0.05;
  // Wealth shifts the odds: a rich merchant is likelier than a poor one;
  // a rich farmer still almost never owns a riding horse.
  const wealthShift = (profile.wealth - 50) / 500;
  // Military factions get mounts as equipment, not a luxury.
  const militaryBonus = profile.faction.endsWith('-militia') ? 0.15 : 0;
  return Math.min(0.98, Math.max(0.01, base + wealthShift + militaryBonus));
}

/** Stable per settlement (id derived deterministically). */
export function stableFor(settlement: HorseSettlement): Stable {
  const seed = characterSeed(7, settlement.id, 0);
  return {
    id: `stable-${settlement.id}`,
    settlementId: settlement.id,
    chunk: { x: settlement.chunk.x, y: settlement.chunk.y },
    position: {
      x: 20 + townsfolkHash(seed, 1) * 20,
      y: 110 + townsfolkHash(seed, 2) * 20,
    },
    capacity: settlement.kind === 'capital' ? 24 : settlement.kind === 'city' ? 16 : settlement.kind === 'town' ? 10 : 6,
  };
}

/**
 * Deterministic horse roster for a set of settlements. Creates one stable per
 * settlement, then assigns horses to profiles that pass the ownership check
 * (wealth/occupation/faction/location/military), plus a few wild horses.
 */
export function createHorses(
  worldSeed: number,
  settlements: HorseSettlement[],
  ownersBySettlement: Record<string, CharacterProfile[]>,
): { horses: Horse[]; stables: Stable[] } {
  const horses: Horse[] = [];
  const stables: Stable[] = [];

  for (const settlement of settlements) {
    const stable = stableFor(settlement);
    stables.push(stable);
    const owners = ownersBySettlement[settlement.id] ?? [];
    let slot = 0;
    for (let i = 0; i < owners.length && slot < stable.capacity; i++) {
      const profile = owners[i];
      const seed = characterSeed(worldSeed, settlement.id, 500000 + i);
      if (townsfolkHash(seed, 61) >= ownershipChance(profile)) continue;
      const name = HORSE_NAMES[Math.floor(townsfolkHash(seed, 62) * HORSE_NAMES.length) % HORSE_NAMES.length];
      const color = HORSE_COLORS[Math.floor(townsfolkHash(seed, 63) * HORSE_COLORS.length) % HORSE_COLORS.length];
      horses.push({
        id: `horse-${settlement.id}-${slot}`,
        name,
        owner: profile.id,
        chunk: { x: stable.chunk.x, y: stable.chunk.y },
        position: { ...stable.position },
        health: 100,
        maxHealth: 100,
        speed: 0.9 + townsfolkHash(seed, 64) * 0.6, // field units per game-minute
        inventory: [],
        stableId: stable.id,
        currentRider: null,
        color,
      });
      slot += 1;
    }
  }

  // A few wild horses roam the wilderness (no owner, no stable).
  for (let w = 0; w < 6; w++) {
    const seed = characterSeed(worldSeed, 'wilderness', 900000 + w);
    const chunk = {
      x: Math.floor(townsfolkHash(seed, 71) * 30) - 15,
      y: Math.floor(townsfolkHash(seed, 72) * 30) - 15,
    };
    horses.push({
      id: `horse-wild-${w}`,
      name: HORSE_NAMES[Math.floor(townsfolkHash(seed, 73) * HORSE_NAMES.length) % HORSE_NAMES.length] + ' (wild)',
      owner: 'wild',
      chunk,
      position: { x: 20 + townsfolkHash(seed, 74) * 100, y: 20 + townsfolkHash(seed, 75) * 100 },
      health: 100,
      maxHealth: 100,
      speed: 0.7 + townsfolkHash(seed, 76) * 0.4,
      inventory: [],
      stableId: '',
      currentRider: null,
      color: HORSE_COLORS[Math.floor(townsfolkHash(seed, 77) * HORSE_COLORS.length) % HORSE_COLORS.length],
    });
  }

  return { horses, stables };
}

/** Serialize for save/load. Types are already plain data; this deep-copies. */
export function serializeHorses(horses: Horse[], stables: Stable[]): { horses: Horse[]; stables: Stable[] } {
  return {
    horses: horses.map((h) => ({ ...h, chunk: { ...h.chunk }, position: { ...h.position }, inventory: [...h.inventory] })),
    stables: stables.map((s) => ({ ...s, chunk: { ...s.chunk }, position: { ...s.position } })),
  };
}

/** Deserialize with light validation; drops malformed entries rather than throwing. */
export function deserializeHorses(data: unknown): { horses: Horse[]; stables: Stable[] } {
  const horses: Horse[] = [];
  const stables: Stable[] = [];
  if (typeof data !== 'object' || data === null) return { horses, stables };
  const root = data as { horses?: unknown; stables?: unknown };
  if (Array.isArray(root.horses)) {
    for (const h of root.horses) {
      const horse = h as Partial<Horse>;
      if (typeof horse.id !== 'string' || typeof horse.owner !== 'string') continue;
      horses.push({
        id: horse.id,
        name: typeof horse.name === 'string' ? horse.name : 'Horse',
        owner: horse.owner,
        chunk: { x: Number(horse.chunk?.x) || 0, y: Number(horse.chunk?.y) || 0 },
        position: { x: Number(horse.position?.x) || 0, y: Number(horse.position?.y) || 0 },
        health: Number(horse.health) || 100,
        maxHealth: Number(horse.maxHealth) || 100,
        speed: Number(horse.speed) || 1,
        inventory: Array.isArray(horse.inventory) ? horse.inventory.map(String) : [],
        stableId: typeof horse.stableId === 'string' ? horse.stableId : '',
        currentRider: typeof horse.currentRider === 'string' ? horse.currentRider : null,
        color: typeof horse.color === 'string' ? horse.color : 'bay',
      });
    }
  }
  if (Array.isArray(root.stables)) {
    for (const s of root.stables) {
      const stable = s as Partial<Stable>;
      if (typeof stable.id !== 'string' || typeof stable.settlementId !== 'string') continue;
      stables.push({
        id: stable.id,
        settlementId: stable.settlementId,
        chunk: { x: Number(stable.chunk?.x) || 0, y: Number(stable.chunk?.y) || 0 },
        position: { x: Number(stable.position?.x) || 0, y: Number(stable.position?.y) || 0 },
        capacity: Number(stable.capacity) || 6,
      });
    }
  }
  return { horses, stables };
}

/** Pure: assign a rider to a horse (mount). Returns a new object. */
export function assignRider(horse: Horse, riderId: string): Horse {
  return { ...horse, currentRider: riderId };
}

/** Pure: return a horse to its stable (dismount + stable). Returns a new object. */
export function stableHorse(horse: Horse, stableId: string): Horse {
  return { ...horse, stableId, currentRider: null };
}

/** Look up a stable by id. */
export function findStable(stables: Stable[], stableId: string): Stable | null {
  return stables.find((s) => s.id === stableId) ?? null;
}

// ---------------------------------------------------------------------------
// Mounting behavior: pure function of (horse, owner, clock)
// ---------------------------------------------------------------------------

/**
 * Where should this horse be right now? Pure function of the owner's daily
 * routine — no stored AI state:
 *
 *   dawn:      owner walks to the stable, leads the horse out (being_led)
 *   morning:   owner mounts and rides to work / patrol (ridden)
 *   midday:    horse stabled while the owner works (stabled)
 *   afternoon: ridden again for patrols, errands, deliveries (ridden)
 *   evening:   led back and stabled for the night (being_led -> stabled)
 *   night:     stabled; wild horses graze instead
 *
 * Positions are analytic offsets from the stable/destination anchors so the
 * horse can be reconstructed at any clock tick (LOD-friendly).
 */
export function horseTarget(
  horse: Horse,
  ownerProfile: CharacterProfile | null,
  stables: Stable[],
  clock: WorldClockState,
): HorseTarget {
  const stable = findStable(stables, horse.stableId);
  const mins = Math.floor(clock.hour) * 60 + (Math.floor(clock.minuteOfDay) % 60);
  const daySalt = Math.floor(clock.day) * 911;
  const seed = characterSeed(3, horse.id, 0);

  if (horse.owner === 'wild' || !stable || !ownerProfile) {
    // Wild horses wander-graze slowly; ownerless stable horses graze nearby.
    if (horse.owner === 'wild' || !stable) {
      return {
        activity: 'grazing',
        chunk: { ...horse.chunk },
        position: {
          x: 20 + townsfolkHash(seed, 80 + (mins % 1440)) * 100,
          y: 20 + townsfolkHash(seed, 81 + (mins % 1440)) * 100,
        },
      };
    }
    const drift = 8 + townsfolkHash(seed, daySalt % 997) * 10;
    return {
      activity: 'grazing',
      chunk: { ...horse.chunk },
      position: { x: stable.position.x + drift, y: stable.position.y + 6 },
    };
  }

  // Owner's daily loop, jittered per horse-day.
  const mountAt = 390 + Math.floor(townsfolkHash(seed, 1 + daySalt) * 60);      // 6:30-7:30
  const arriveAt = mountAt + 45;                                                // ride to work
  const noonStabledAt = 690 + Math.floor(townsfolkHash(seed, 2 + daySalt) * 60); // 11:30-12:30
  const afternoonRideAt = 780 + Math.floor(townsfolkHash(seed, 3 + daySalt) * 60); // 13:00-14:00
  const returnAt = 1080 + Math.floor(townsfolkHash(seed, 4 + daySalt) * 60);     // 18:00-19:00
  const nightAt = returnAt + 30;

  // Destination: merchants/caravan workers ride toward the market; military
  // occupations ride the patrol circuit; others ride out to their workplace.
  const dest = destinationFor(ownerProfile, seed);

  if (mins >= nightAt || mins < mountAt - 30) {
    return { activity: 'stabled', chunk: { ...stable.chunk }, position: { ...stable.position } };
  }
  if (mins >= returnAt) {
    const t = (mins - returnAt) / 30;
    return {
      activity: 'being_led',
      chunk: { ...stable.chunk },
      position: lerp(dest, stable.position, t),
    };
  }
  if (mins >= afternoonRideAt) {
    return { activity: 'ridden', chunk: { ...stable.chunk }, position: patrolPos(dest, seed, mins, horse.speed) };
  }
  if (mins >= noonStabledAt) {
    return { activity: 'stabled', chunk: { ...stable.chunk }, position: { ...stable.position } };
  }
  if (mins >= arriveAt) {
    return { activity: 'ridden', chunk: { ...stable.chunk }, position: ridePos(stable.position, dest, seed, mins - mountAt, horse.speed) };
  }
  if (mins >= mountAt) {
    const t = (mins - mountAt) / 45;
    return {
      activity: 'being_led',
      chunk: { ...stable.chunk },
      position: lerp(stable.position, { x: stable.position.x + 10, y: stable.position.y }, t),
    };
  }
  return { activity: 'stabled', chunk: { ...stable.chunk }, position: { ...stable.position } };
}

function lerp(a: HorsePoint, b: HorsePoint, t: number): HorsePoint {
  const k = Math.min(1, Math.max(0, t));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Analytical ride from stable toward the work destination at the horse's speed. */
function ridePos(from: HorsePoint, to: HorsePoint, seed: number, minutesRiding: number, speed: number): HorsePoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const traveled = Math.min(dist, minutesRiding * speed);
  const bob = Math.sin(minutesRiding * 0.7 + seed) * 1.5;
  return {
    x: from.x + (dx / dist) * traveled,
    y: from.y + (dy / dist) * traveled + bob,
  };
}

/** Slow patrol circuit around the destination while ridden. */
function patrolPos(dest: HorsePoint, seed: number, mins: number, speed: number): HorsePoint {
  const angle = (mins / 60) * speed * 0.8 + townsfolkHash(seed, 91) * Math.PI * 2;
  return {
    x: dest.x + Math.cos(angle) * 18,
    y: dest.y + Math.sin(angle) * 14,
  };
}

function destinationFor(owner: CharacterProfile, seed: number): HorsePoint {
  // Field-unit anchor within the settlement chunk for this occupation.
  const jitter = (salt: number) => 20 + townsfolkHash(seed, salt) * 100;
  switch (owner.occupation) {
    case 'guard': case 'soldier': case 'archer': case 'scout':
      return { x: jitter(101), y: 70 }; // patrol circuit near the road axis
    case 'merchant': case 'trader': case 'caravanWorker':
      return { x: jitter(102), y: 50 }; // market / staging area
    case 'hunter':
      return { x: jitter(103), y: jitter(104) }; // out into the wilds
    default:
      return { x: jitter(105), y: jitter(106) };
  }
}

// ---------------------------------------------------------------------------
// Mounted travelers: occasional analytic horse traffic on roads
// ---------------------------------------------------------------------------

const MOUNTED_OCCUPATIONS: CharacterOccupation[] = [
  'horseRider', 'soldier', 'guard', 'scout', 'hunter', 'noble', 'merchant', 'adventurer', 'traveler',
];
const MOUNTED_ORIGINS = ['Aldor', 'Ravenhold', 'Stonewatch', 'Greenfield', 'Mosslight Crossing', 'Dunewatch'];
const MOUNTED_DESTINATIONS = ['the capital', 'the border fort', 'the northern mines', 'the coast', 'the market town', 'the old keep'];

/**
 * Occasional mounted NPC traffic on roads. Fully analytic: each traveler's
 * position is a pure function of (worldSeed, clock). Traffic varies by time
 * of day (morning/evening rush, quiet nights), road importance (busier roads
 * carry more riders), weather, kingdom and economy signals passed in via
 * `modifiers` — all pure inputs, no stored state.
 *
 * Weather/economy are encoded as simple 0..1 multipliers so the renderer
 * (which owns the weather system) can feed them in without coupling:
 * - weatherMod: 0.2 (blizzard) .. 1.0 (clear)
 * - economyMod: 0.5 (depression) .. 1.5 (boom) — affects merchant traffic
 */
export function mountedTravelers(
  worldSeed: number,
  clock: WorldClockState,
  modifiers: { roadImportance: number; weatherMod?: number; kingdomId?: string; economyMod?: number } = { roadImportance: 1 },
): MountedTraveler[] {
  const hour = Math.floor(clock.hour);
  // Nights are quiet: almost no riders between 22:00 and 05:00.
  if (hour >= 22 || hour < 5) return [];
  const weatherMod = modifiers.weatherMod ?? 1;
  const economyMod = modifiers.economyMod ?? 1;
  const importance = Math.max(0, Math.min(3, modifiers.roadImportance));

  const rush = (hour >= 6 && hour < 10) || (hour >= 16 && hour < 20) ? 1 : 0;
  const density = (1 + rush + importance) * weatherMod;
  const count = Math.min(6, Math.floor(townsfolkHash(worldSeed, 2001) * density) + rush);
  if (count <= 0) return [];

  const totalMinutes = Math.floor(clock.day) * 1440 + hour * 60 + (Math.floor(clock.minuteOfDay) % 60);
  const travelers: MountedTraveler[] = [];
  for (let i = 0; i < count; i++) {
    const occ = MOUNTED_OCCUPATIONS[Math.floor(townsfolkHash(worldSeed, 2100 + i) * MOUNTED_OCCUPATIONS.length) % MOUNTED_OCCUPATIONS.length];
    const isMerchant = occ === 'merchant';
    // Merchants follow the economy; soldiers/guard traffic ignores it.
    const econGate = isMerchant ? economyMod : 1;
    if (townsfolkHash(worldSeed, 2200 + i) > econGate) continue;

    // Analytic position along a road axis, faster than walkers (horses).
    const horizontal = townsfolkHash(worldSeed, 2300 + i) < 0.5;
    const dirSign = townsfolkHash(worldSeed, 2400 + i) < 0.5 ? 1 : -1;
    const speed = 0.8 + townsfolkHash(worldSeed, 2500 + i) * 0.6; // field units per game-minute
    const span = 160;
    const along = ((townsfolkHash(worldSeed, 2600 + i) * span + totalMinutes * speed) % span) - 10;
    const pos = dirSign > 0 ? along : 280 - along;
    const lane = (townsfolkHash(worldSeed, 2700 + i) < 0.5 ? -1 : 1) * 4.5;
    const chunkOffset = Math.floor(townsfolkHash(worldSeed, 2800 + i) * 5) - 2; // spread across neighboring chunks

    const origin = MOUNTED_ORIGINS[Math.floor(townsfolkHash(worldSeed, 2900 + i) * MOUNTED_ORIGINS.length) % MOUNTED_ORIGINS.length];
    const destination = MOUNTED_DESTINATIONS[Math.floor(townsfolkHash(worldSeed, 3000 + i) * MOUNTED_DESTINATIONS.length) % MOUNTED_DESTINATIONS.length];
    const name = HORSE_NAMES[Math.floor(townsfolkHash(worldSeed, 3100 + i) * HORSE_NAMES.length) % HORSE_NAMES.length];

    travelers.push({
      id: `mounted-${worldSeed}-${i}`,
      name,
      occupation: occ,
      horseId: `horse-mounted-${worldSeed}-${i}`,
      chunk: { x: chunkOffset, y: 0 },
      position: horizontal ? { x: pos, y: 70 + lane } : { x: 70 + lane, y: pos },
      facing: horizontal ? (dirSign > 0 ? 'right' : 'left') : (dirSign > 0 ? 'down' : 'up'),
      destination,
      origin,
    });
  }
  return travelers;
}
