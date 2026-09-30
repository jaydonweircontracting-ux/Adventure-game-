// Carriage fast-travel network: physical roadside stations, drivers, routes,
// pricing and schedules. All pure/deterministic: station positions derive from
// the chunk coordinate system, driver profiles are fixed data, and schedules
// are a pure function of the world clock — so the network is persistent by
// construction (no save schema needed beyond the journal's discovered
// locations, which gate destination availability).
import type { WorldClockState } from './worldCore';

export type Point = { x: number; y: number };

export type CarriageDriverProfile = {
  name: string;
  gender: 'male' | 'female';
  age: number;
  appearance: string;
  clothing: string;
  occupation: string;
  home: string;
  schedule: string;
  money: number;
  inventory: string[];
  relationships: string;
  personality: string;
  greeting: string;
  /** Hour the station opens (24h). */
  openHour: number;
  /** Hour the station closes (24h). */
  closeHour: number;
};

export type StationLayout = {
  house: Point;
  stable: Point;
  carriage: Point;
  horse: Point;
  driverPost: Point;
  sign: Point;
  hitching: Point;
  lanterns: Point[];
  /** Where the player appears after carriage travel. */
  arrival: Point;
};

export type CarriageStation = {
  id: string;
  name: string;
  chunk: Point;
  dir: 'north' | 'south' | 'east' | 'west';
  driver: CarriageDriverProfile;
  layout: StationLayout;
};

/** A small carriage stop at a discovered settlement (sign + carriage + driver). */
export type CarriageStop = {
  id: string;
  settlementName: string;
  settlementKind: string;
  chunk: Point;
  driver: CarriageDriverProfile;
  sign: Point;
  carriage: Point;
  horse: Point;
  driverPost: Point;
  arrival: Point;
};

export type CarriageDestination = {
  name: string;
  kind: string;
  chunk: Point;
  /** Chunk-distance from the origin. */
  distance: number;
  price: number;
  travelHours: number;
  discovered: boolean;
};

// ---------------------------------------------------------------------------
// Driver profiles: the four starting-town station drivers. Persistent NPCs
// with homes (the station house), schedules, money, inventories and families.
// ---------------------------------------------------------------------------

export const STATION_DRIVERS: Record<'north' | 'south' | 'east' | 'west', CarriageDriverProfile> = {
  north: {
    name: 'Harlan Greer', gender: 'male', age: 54,
    appearance: 'Broad-shouldered, grey-streaked beard, weathered hands.',
    clothing: 'Patched brown coat, leather driving gloves, wide-brim hat.',
    occupation: 'Carriage Driver', home: 'The station house, North Road',
    schedule: 'Opens 7:00, runs the north road until 20:00, home by dark.',
    money: 120, inventory: ['reins', 'feed bag', 'whetstone'],
    relationships: 'Widower. His daughter Mara works the Mosslight mill.',
    personality: 'Gruff but fair. Tells long stories about the north road.',
    greeting: 'Need a ride?',
    openHour: 7, closeHour: 20,
  },
  south: {
    name: 'Odessa Vane', gender: 'female', age: 36,
    appearance: 'Tall, dark braided hair, sharp green eyes.',
    clothing: 'Blue travel cloak, brass carriage badge.',
    occupation: 'Carriage Driver', home: 'The station house, South Road',
    schedule: 'Opens 8:00, runs the south road until 21:00.',
    money: 90, inventory: ['route ledger', 'dried apples'],
    relationships: 'Her husband Tomas drives a freight wagon out of Seabreak.',
    personality: 'Warm and chatty. Remembers every passenger by name.',
    greeting: 'Heading somewhere?',
    openHour: 8, closeHour: 21,
  },
  east: {
    name: 'Tam Beck', gender: 'male', age: 27,
    appearance: 'Lanky, freckled, quick grin.',
    clothing: 'Patched green tunic, scuffed boots.',
    occupation: 'Carriage Driver', home: 'The station house, East Road',
    schedule: 'Opens 6:00 sharp, runs the east road until 19:00.',
    money: 45, inventory: ['spare horseshoes'],
    relationships: 'His younger brother is learning the trade as his stable boy.',
    personality: 'Eager and always in a hurry. Drives fast.',
    greeting: 'Where to, friend?',
    openHour: 6, closeHour: 19,
  },
  west: {
    name: 'Sella Marsh', gender: 'female', age: 48,
    appearance: 'Sturdy, silver hair in a bun, calm grey eyes.',
    clothing: 'Heavy wool coat, driving gloves.',
    occupation: 'Carriage Driver', home: 'The station house, West Road',
    schedule: 'Opens 7:00, runs the west road until 20:00.',
    money: 150, inventory: ['lantern oil', 'route ledger'],
    relationships: 'Two grown sons sailing out of Seabreak.',
    personality: 'No-nonsense. Steady as stone, safest driver on the roads.',
    greeting: 'Carriage is ready when you are.',
    openHour: 7, closeHour: 20,
  },
};

const STOP_FIRST = ['Benn', 'Aldis', 'Corra', 'Dain', 'Elswyth', 'Fen', 'Garr', 'Hilda', 'Ivo', 'Jora', 'Kell', 'Liora', 'Marek', 'Nessa', 'Odo', 'Petra', 'Quill', 'Runa', 'Sten', 'Tilda'];
const STOP_LAST = ['Ashdown', 'Blackwood', 'Coppers', 'Dunmore', 'Elmsworth', 'Fairwind', 'Grimshaw', 'Holloway', 'Ironbrow', 'Kettleburn'];

function seededPick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

/** Deterministic driver for a settlement carriage stop. */
export function stopDriverFor(settlementName: string, chunk: Point): CarriageDriverProfile {
  const seed = Math.abs(chunk.x * 131 + chunk.y * 197 + settlementName.length * 17);
  const gender = seed % 2 === 0 ? 'male' : 'female';
  const first = seededPick(STOP_FIRST, seed);
  const last = seededPick(STOP_LAST, seed * 7 + 3);
  return {
    name: first + ' ' + last,
    gender,
    age: 25 + (seed % 30),
    appearance: seededPick(['Weathered face, kind eyes.', 'Stocky build, calloused hands.', 'Lean, quick-moving, bright smile.', 'Tall, silver-streaked hair.'], seed + 1),
    clothing: seededPick(['Brown travel coat, driving gloves.', 'Green cloak, brass badge.', 'Grey wool coat, wide belt.'], seed + 2),
    occupation: 'Carriage Driver',
    home: 'The carriage stop, ' + settlementName,
    schedule: 'Opens 7:00, closes 20:00.',
    money: 40 + (seed % 80),
    inventory: ['reins', 'feed bag'],
    relationships: seededPick(['Married, two children in town.', 'Unmarried; sends coin to family up north.', 'Widowed; drives to keep busy.'], seed + 3),
    personality: seededPick(['Cheerful and talkative.', 'Quiet but reliable.', 'Loves gossip from the road.'], seed + 4),
    greeting: seededPick(['Need a ride?', 'Heading somewhere?', 'Carriage is ready when you are.'], seed + 5),
    openHour: 7, closeHour: 20,
  };
}

/** Is the driver on duty at this world-clock hour? */
export function driverOnDuty(driver: CarriageDriverProfile, clock: WorldClockState): boolean {
  const h = clock.hour;
  if (driver.openHour <= driver.closeHour) return h >= driver.openHour && h < driver.closeHour;
  return h >= driver.openHour || h < driver.closeHour;
}

// ---------------------------------------------------------------------------
// Pricing and travel time. Nearby settlements are cheap and quick; distant
// cities cost more and take longer. Derived from real chunk distance.
// ---------------------------------------------------------------------------

export function chunkDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Fare in gold: base + distance rate + town premium. */
export function carriagePrice(distance: number, kind: string): number {
  return 5 + distance * 3 + (kind === 'town' ? 10 : 0);
}

/** Whole hours the journey takes (6 world ticks per hour). */
export function carriageTravelHours(distance: number): number {
  return Math.max(1, Math.round(2 + distance * 0.5));
}

export function carriageTravelTicks(distance: number): number {
  return carriageTravelHours(distance) * 6;
}

// ---------------------------------------------------------------------------
// Serialization: stations are deterministic, so only per-driver earnings
// (session economy flavor) need persisting.
// ---------------------------------------------------------------------------

export type CarriageSave = {
  earnings: Record<string, number>;
};

export function serializeCarriage(earnings: Record<string, number>): CarriageSave {
  return { earnings: { ...earnings } };
}

export function deserializeCarriage(save: unknown): Record<string, number> {
  if (!save || typeof save !== 'object') return {};
  const earnings = (save as { earnings?: unknown }).earnings;
  if (!earnings || typeof earnings !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(earnings as Record<string, unknown>)) {
    if (typeof v === 'number' && isFinite(v)) out[k] = v;
  }
  return out;
}
