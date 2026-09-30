// Persistent simulated fantasy civilization for ASHFALL.
//
// This module is the "world layer" of the living-world simulation: kingdoms,
// rulers, castles, settlements, economy, trade routes, caravans, military,
// world events and simulation LOD. It extends the existing architecture:
//
// - World time comes from WorldCore (WorldClockState); every schedule and
//   position here is a pure function of (state, clock), exactly like
//   townsfolkTarget() and travelersForChunk().
// - Randomness is deterministic: SeededRng for one-time generation and
//   townsfolkHash() for per-entity/per-day jitter. Never Math.random.
// - Coordinates use the same field system as the game (0-140 field units per
//   chunk); settlements anchor to the real landmark chunks from App.tsx.
//   Settlement names/kinds are reconciled with the authoritative LANDMARKS
//   table (src/game/landmarks.ts): Ironwood Southhold, Eastmarch, Sunwash
//   Port, Fenmere Hamlet, Seabreak, Dunewatch, Stormhaven.
// - Caravans and traveling military units are FULLY ANALYTIC: position is
//   interpolated from (departureDay, travelDays, clock), so the world keeps
//   moving while the player is absent — no per-frame AI, no stored positions.
// - advanceCivilization() runs once per in-game day (never per frame) and is
//   cheap: ~27 settlements x 19 resources.
// - All state is plain JSON-serializable for save/load.
//
// The player is a participant in this world, not its engine: farmers farm,
// merchants travel, guards patrol, kings rule, and caravans carry real goods
// whether or not anyone is watching.

import type { WorldClockState } from './worldCore';
import { SeededRng } from './worldCore';
import { townsfolkHash } from './townsfolk';

/** Field coordinate units per chunk — matches the game's field system (0-140). */
export const CIV_FIELD_UNITS = 140;

export type CivPoint = { x: number; y: number };
export type CivChunk = { x: number; y: number };

export type SettlementKind = 'capital' | 'city' | 'town' | 'village' | 'hamlet' | 'farm';

export type Resource =
  | 'food' | 'wood' | 'stone' | 'iron' | 'coal' | 'leather' | 'wool'
  | 'grain' | 'livestock' | 'weapons' | 'armor' | 'tools' | 'clothing'
  | 'medicine' | 'luxury' | 'magicMaterials' | 'ore' | 'fish' | 'timber';

export const RESOURCES: Resource[] = [
  'food', 'wood', 'stone', 'iron', 'coal', 'leather', 'wool',
  'grain', 'livestock', 'weapons', 'armor', 'tools', 'clothing',
  'medicine', 'luxury', 'magicMaterials', 'ore', 'fish', 'timber',
];

/** Base market price per unit of each resource (before supply/demand). */
const BASE_PRICES: Record<Resource, number> = {
  food: 3, wood: 2, stone: 2, iron: 8, coal: 5, leather: 6, wool: 4,
  grain: 2, livestock: 25, weapons: 40, armor: 35, tools: 12, clothing: 10,
  medicine: 20, luxury: 60, magicMaterials: 80, ore: 6, fish: 3, timber: 3,
};

/** A new zero-filled resource record. */
export function zeroResources(): Record<Resource, number> {
  return {
    food: 0, wood: 0, stone: 0, iron: 0, coal: 0, leather: 0, wool: 0,
    grain: 0, livestock: 0, weapons: 0, armor: 0, tools: 0, clothing: 0,
    medicine: 0, luxury: 0, magicMaterials: 0, ore: 0, fish: 0, timber: 0,
  };
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

export type Settlement = {
  id: string;
  kind: SettlementKind;
  name: string;
  kingdomId: string;
  region: string;
  /** Chunk coordinates in the world chunk grid. */
  chunk: CivChunk;
  /** Field coordinates (0-140) inside the chunk. */
  position: CivPoint;
  population: number;
  /** Units produced / consumed per in-game day. */
  production: Record<Resource, number>;
  consumption: Record<Resource, number>;
  /** Stockpiled units. */
  storage: Record<Resource, number>;
  /** Current market price per unit (recomputed from supply/demand). */
  prices: Record<Resource, number>;
  demand: Record<Resource, number>;
  supply: Record<Resource, number>;
};

/**
 * Price reaction: price = base * clamp((demand+2)/(supply+2), 0.4, 2.5).
 * A grain-producing village has high supply -> cheap grain locally.
 * A grain-consuming city has high demand -> expensive grain there.
 * Pure function: same settlement in -> same prices out.
 */
export function recomputePrices(settlement: Settlement): Record<Resource, number> {
  const prices = zeroResources();
  for (const resource of RESOURCES) {
    const supply = (settlement.production[resource] || 0) + (settlement.storage[resource] || 0) / 20;
    const demand = settlement.consumption[resource] || 0;
    const ratio = (demand + 2) / (supply + 2);
    const clamped = Math.min(2.5, Math.max(0.4, ratio));
    prices[resource] = Math.round(BASE_PRICES[resource] * clamped * 100) / 100;
  }
  return prices;
}

/** Recompute supply/demand records from production/consumption/storage. */
export function recomputeSupplyDemand(settlement: Settlement): void {
  for (const resource of RESOURCES) {
    settlement.supply[resource] = Math.round(((settlement.production[resource] || 0) + (settlement.storage[resource] || 0) / 20) * 100) / 100;
    settlement.demand[resource] = settlement.consumption[resource] || 0;
  }
  settlement.prices = recomputePrices(settlement);
}

// ---------------------------------------------------------------------------
// Kingdoms
// ---------------------------------------------------------------------------

export type KingdomRelation = 'alliance' | 'neutral' | 'trade' | 'tension' | 'hostile';

export type Kingdom = {
  id: string;
  name: string;
  capital: string;
  ruler: string;
  heir: string;
  territories: string[];
  cities: string[];
  towns: string[];
  villages: string[];
  population: number;
  treasury: number;
  militaryStrength: number;
  /** Total daily production value (coin). */
  economy: number;
  resources: Resource[];
  relations: Record<string, KingdomRelation>;
  laws: string[];
  factions: string[];
  tradeRouteIds: string[];
  wars: string[];
  alliances: string[];
  taxRate: number;
};

// ---------------------------------------------------------------------------
// Rulers
// ---------------------------------------------------------------------------

export type RulerTitle =
  | 'King' | 'Queen' | 'Duke' | 'Duchess' | 'Lord' | 'Lady'
  | 'Mayor' | 'Steward' | 'Elder' | 'Reeve';

export type Ruler = {
  id: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  title: RulerTitle;
  settlementId: string;
  kingdomId: string;
  family: { spouse?: string; children: string[]; parent?: string };
  heirs: string[];
  personality: string[];
  wealth: number;
  scheduleNote: string;
  /** Deterministic per-ruler seed for schedule jitter. */
  seed: number;
};

export type RulerTarget = { activity: string; indoors: boolean };

function rulerMinutesOf(clock: WorldClockState): number {
  return Math.floor(clock.hour) * 60 + (Math.floor(clock.minuteOfDay) % 60);
}

const RULER_SPECIAL_ACTIVITIES = [
  'Inspecting the guard',
  'Visiting the city',
  'Attending a ceremony',
  'Reviewing taxes',
  'Meeting merchants',
];

/**
 * Pure ruler schedule: (ruler, clock) -> { activity, indoors }.
 * Follows the royal daily routine with per-ruler, per-day seeded jitter,
 * in the same style as townsfolkTarget(). Occasionally an afternoon block
 * is replaced by a special duty (inspections, visits, ceremonies).
 */
export function rulerTarget(ruler: Ruler, clock: WorldClockState): RulerTarget {
  const mins = rulerMinutesOf(clock);
  const daySalt = Math.floor(clock.day) * 911;
  const jitter = (salt: number, range: number) => Math.floor(townsfolkHash(ruler.seed, daySalt + salt) * range);
  const wake = 420 + jitter(1, 41); // 07:00 +/- 20m
  if (mins < wake) return { activity: 'Sleeping', indoors: true };
  if (mins < wake + 60) return { activity: 'Breakfast', indoors: true };
  if (mins < 660 + jitter(2, 21)) return { activity: 'Holding council', indoors: true };
  if (mins < 780 + jitter(3, 21)) return { activity: 'Administrative work', indoors: true };
  if (mins < 840) return { activity: 'Lunch', indoors: true };
  // Afternoon: occasionally a special duty instead of routine meetings.
  const special = townsfolkHash(ruler.seed, daySalt + 9);
  if (special < 0.18 && mins >= 840 && mins < 1080) {
    const pick = RULER_SPECIAL_ACTIVITIES[Math.floor(townsfolkHash(ruler.seed, daySalt + 10) * RULER_SPECIAL_ACTIVITIES.length) % RULER_SPECIAL_ACTIVITIES.length];
    const outdoors = pick === 'Inspecting the guard' || pick === 'Visiting the city';
    return { activity: pick, indoors: !outdoors };
  }
  if (mins < 960 + jitter(4, 21)) return { activity: 'Meetings', indoors: true };
  if (mins < 1080 + jitter(5, 21)) return { activity: 'In the courtyard', indoors: false };
  if (mins < 1200 + jitter(6, 21)) return { activity: 'Dinner', indoors: true };
  if (mins < 1320 + jitter(7, 21)) return { activity: 'Private chambers', indoors: true };
  return { activity: 'Sleeping', indoors: true };
}

// ---------------------------------------------------------------------------
// Castles
// ---------------------------------------------------------------------------

export type Castle = {
  id: string;
  name: string;
  settlementId: string;
  kingdomId: string;
  kind: 'capital' | 'border' | 'mountain' | 'river' | 'coastal';
  rooms: string[];
  garrison: number;
  guards: number;
  servants: number;
  nobles: number;
};

const CASTLE_ROOMS_ALL = [
  'throne room', 'great hall', 'barracks', 'armory', 'treasury',
  'kitchens', 'royal chambers', 'prison', 'stable', 'courtyard', 'training yard',
];

const FORTRESS_ROOMS = [
  'barracks', 'armory', 'courtyard', 'training yard', 'prison', 'stable', 'kitchens',
];

// ---------------------------------------------------------------------------
// Trade routes & caravans
// ---------------------------------------------------------------------------

/** An ordered stop on a route: a settlement, or a road-junction waypoint. */
export type RouteStop = {
  settlementId?: string;
  label: string;
  chunk: CivChunk;
  position: CivPoint;
};

export type TradeRoute = {
  id: string;
  name: string;
  kingdomId: string;
  from: string;
  to: string;
  /** Ordered stops from `from` to `to`, on actual roads. */
  waypoints: RouteStop[];
  goods: Resource[];
  /** 0 (safe) .. 1 (perilous). Raised by bandit/closure events. */
  danger: number;
};

export type CaravanStatus = 'scheduled' | 'traveling' | 'arrived';

export type Caravan = {
  id: string;
  routeId: string;
  merchant: string;
  guards: number;
  packAnimals: number;
  carts: number;
  inventory: Partial<Record<Resource, number>>;
  originId: string;
  destinationId: string;
  /** World-day float: (day - 1) + minuteOfDay / 1440. */
  departureDay: number;
  departureHour: number;
  travelDays: number;
  /** If true, the caravan walks the route waypoints in reverse. */
  reversed: boolean;
  /** Set once advanceCivilization() has processed its arrival. */
  returnSpawned: boolean;
};

/** World-day float for analytic travel math. Day 1 00:00 == 0. */
export function civDayFloat(clock: WorldClockState): number {
  return (Math.max(1, Math.floor(clock.day)) - 1) + Math.floor(clock.minuteOfDay) / 1440;
}

/** 0..1 journey progress for a caravan at a world-day float. Pure. */
export function caravanProgress(caravan: Caravan, dayFloat: number): number {
  const elapsed = dayFloat - caravan.departureDay;
  if (elapsed <= 0) return 0;
  if (elapsed >= caravan.travelDays) return 1;
  return elapsed / caravan.travelDays;
}

export function caravanStatus(caravan: Caravan, dayFloat: number): CaravanStatus {
  const progress = caravanProgress(caravan, dayFloat);
  if (progress <= 0) return 'scheduled';
  if (progress >= 1) return 'arrived';
  return 'traveling';
}

function worldUnitsOf(stop: RouteStop): CivPoint {
  return {
    x: stop.chunk.x * CIV_FIELD_UNITS + stop.position.x,
    y: stop.chunk.y * CIV_FIELD_UNITS + stop.position.y,
  };
}

function stopFromWorldUnits(wx: number, wy: number): { chunk: CivChunk; position: CivPoint } {
  const cx = Math.floor(wx / CIV_FIELD_UNITS);
  const cy = Math.floor(wy / CIV_FIELD_UNITS);
  return { chunk: { x: cx, y: cy }, position: { x: wx - cx * CIV_FIELD_UNITS, y: wy - cy * CIV_FIELD_UNITS } };
}

/**
 * Interpolate a position along ordered route stops at progress 0..1.
 * Distance-weighted over straight segments in world-field units, so
 * waypoints placed on road junctions keep caravans on actual roads.
 */
export function positionAlongStops(stops: RouteStop[], progress: number): { chunk: CivChunk; position: CivPoint } {
  if (stops.length === 0) return { chunk: { x: 0, y: 0 }, position: { x: 70, y: 70 } };
  if (stops.length === 1 || progress <= 0) {
    const s = stops[0];
    return { chunk: { ...s.chunk }, position: { ...s.position } };
  }
  if (progress >= 1) {
    const s = stops[stops.length - 1];
    return { chunk: { ...s.chunk }, position: { ...s.position } };
  }
  const pts = stops.map(worldUnitsOf);
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(len);
    total += len;
  }
  if (total <= 0) {
    const s = stops[0];
    return { chunk: { ...s.chunk }, position: { ...s.position } };
  }
  let target = progress * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const t = segLens[i] <= 0 ? 0 : target / segLens[i];
      const wx = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
      const wy = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
      return stopFromWorldUnits(wx, wy);
    }
    target -= segLens[i];
  }
  const s = stops[stops.length - 1];
  return { chunk: { ...s.chunk }, position: { ...s.position } };
}

/** Total route length in world-field units. */
export function routeLengthUnits(stops: RouteStop[]): number {
  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = worldUnitsOf(stops[i]);
    const b = worldUnitsOf(stops[i + 1]);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export type CaravanPosition = {
  status: CaravanStatus;
  progress: number;
  chunk: CivChunk;
  position: CivPoint;
  routeId: string;
};

/**
 * CRITICAL: fully analytic caravan position. A pure function of
 * (caravan, clock) — the merchant who leaves on Day 10 and arrives Day 11
 * is simply *computed* at the later clock; nothing is simulated or stored
 * per frame, so the world continues while the player is absent.
 * Visible caravans are never teleported: they render at the computed spot.
 */
export function caravanPosition(
  caravan: Caravan,
  clock: WorldClockState,
  civ: CivilizationState,
): CaravanPosition {
  const dayFloat = civDayFloat(clock);
  const progress = caravanProgress(caravan, dayFloat);
  const status = caravanStatus(caravan, dayFloat);
  const route = civ.routes.find((r) => r.id === caravan.routeId);
  if (!route) {
    const origin = civ.settlements.find((s) => s.id === caravan.originId);
    return {
      status, progress, routeId: caravan.routeId,
      chunk: { ...(origin?.chunk ?? { x: 0, y: 0 }) },
      position: { ...(origin?.position ?? { x: 70, y: 70 }) },
    };
  }
  const stops = caravan.reversed ? [...route.waypoints].reverse() : route.waypoints;
  const { chunk, position } = positionAlongStops(stops, progress);
  return { status, progress, chunk, position, routeId: caravan.routeId };
}

// ---------------------------------------------------------------------------
// Military
// ---------------------------------------------------------------------------

export type MilitaryUnitKind = 'garrison' | 'patrol' | 'messenger' | 'supply' | 'scouts';

export type MilitaryJourney = {
  stops: RouteStop[];
  departureDay: number;
  travelDays: number;
  reversed: boolean;
  purpose: string;
};

export type MilitaryUnit = {
  id: string;
  name: string;
  kingdomId: string;
  kind: MilitaryUnitKind;
  homeSettlementId: string;
  size: number;
  soldiers: number;
  archers: number;
  cavalry: number;
  commander: string;
  scheduleNote: string;
  seed: number;
  /** Set for traveling units (patrol/messenger/supply/scouts). Analytic. */
  journey?: MilitaryJourney;
};

export type MilitaryTarget = { activity: string; indoors: boolean };

/**
 * Pure military schedule. Stationary units rotate through barracks, training
 * yard, patrol, gate duty, meals, rest and sleep with seeded shift jitter.
 * Traveling units report their journey (position via militaryPosition()).
 */
export function militaryTarget(unit: MilitaryUnit, clock: WorldClockState, civ: CivilizationState): MilitaryTarget {
  if (unit.journey) {
    const dayFloat = civDayFloat(clock);
    const elapsed = dayFloat - unit.journey.departureDay;
    if (elapsed > 0 && elapsed < unit.journey.travelDays) {
      const from = unit.journey.stops[0]?.label ?? unit.homeSettlementId;
      const to = unit.journey.stops[unit.journey.stops.length - 1]?.label ?? unit.homeSettlementId;
      return { activity: `${unit.journey.purpose}: ${from} → ${to}`, indoors: false };
    }
    if (elapsed >= unit.journey.travelDays) {
      return { activity: `${unit.journey.purpose}: arrived, regrouping`, indoors: false };
    }
  }
  const mins = rulerMinutesOf(clock);
  const daySalt = Math.floor(clock.day) * 733;
  const jitter = (salt: number, range: number) => Math.floor(townsfolkHash(unit.seed, daySalt + salt) * range);
  const wake = 300 + jitter(1, 31); // 05:00-05:30
  if (mins < wake) return { activity: 'Sleeping in barracks', indoors: true };
  if (mins < wake + 120) return { activity: 'Training in the yard', indoors: false };
  if (mins < 720 + jitter(2, 31)) {
    const duty = townsfolkHash(unit.seed, daySalt + 3) < 0.5 ? 'Patrolling' : 'Gate duty';
    return { activity: duty, indoors: false };
  }
  if (mins < 780) return { activity: 'Midday meal', indoors: true };
  if (mins < 1020 + jitter(4, 31)) return { activity: 'Drills in the training yard', indoors: false };
  if (mins < 1140) return { activity: 'Evening meal', indoors: true };
  if (mins < 1320 + jitter(5, 21)) return { activity: 'Resting', indoors: true };
  return { activity: 'Sleeping in barracks', indoors: true };
}

export type MilitaryPosition = {
  status: 'stationed' | 'traveling' | 'arrived';
  progress: number;
  chunk: CivChunk;
  position: CivPoint;
};

/** Analytic military position — same pattern as caravans (pure of clock). */
export function militaryPosition(unit: MilitaryUnit, clock: WorldClockState, civ: CivilizationState): MilitaryPosition {
  const home = civ.settlements.find((s) => s.id === unit.homeSettlementId);
  const homePos = {
    chunk: { ...(home?.chunk ?? { x: 0, y: 0 }) },
    position: { ...(home?.position ?? { x: 70, y: 70 }) },
  };
  if (!unit.journey) return { status: 'stationed', progress: 0, ...homePos };
  const dayFloat = civDayFloat(clock);
  const elapsed = dayFloat - unit.journey.departureDay;
  if (elapsed <= 0) return { status: 'stationed', progress: 0, ...homePos };
  const stops = unit.journey.reversed ? [...unit.journey.stops].reverse() : unit.journey.stops;
  if (elapsed >= unit.journey.travelDays) {
    const end = positionAlongStops(stops, 1);
    return { status: 'arrived', progress: 1, ...end };
  }
  const mid = positionAlongStops(stops, elapsed / unit.journey.travelDays);
  return { status: 'traveling', progress: elapsed / unit.journey.travelDays, ...mid };
}

// ---------------------------------------------------------------------------
// World events
// ---------------------------------------------------------------------------

export type CivEventType =
  | 'merchant_arrival' | 'harvest_shortage' | 'mine_discovery' | 'road_closure'
  | 'bandit_activity' | 'monster_infestation' | 'military_patrol' | 'royal_procession'
  | 'caravan_arrival' | 'festival' | 'funeral' | 'market_day'
  | 'construction' | 'migration';

export type CivEventEffects = {
  priceMult?: Partial<Record<Resource, number>>;
  supplyDelta?: Partial<Record<Resource, number>>;
  populationDelta?: number;
  dangerDelta?: number;
  routeId?: string;
};

export type WorldEvent = {
  id: string;
  day: number;
  type: CivEventType;
  settlementId?: string;
  description: string;
  effects: CivEventEffects;
};

export type EventPlace = { id: string; name: string };
export type EventRoute = { id: string; name: string };

const EVENT_TYPE_TABLE: { type: CivEventType; weight: number; kind: 'settlement' | 'route' }[] = [
  { type: 'market_day', weight: 10, kind: 'settlement' },
  { type: 'military_patrol', weight: 8, kind: 'settlement' },
  { type: 'merchant_arrival', weight: 6, kind: 'settlement' },
  { type: 'construction', weight: 5, kind: 'settlement' },
  { type: 'harvest_shortage', weight: 4, kind: 'settlement' },
  { type: 'bandit_activity', weight: 4, kind: 'route' },
  { type: 'monster_infestation', weight: 4, kind: 'settlement' },
  { type: 'festival', weight: 3, kind: 'settlement' },
  { type: 'funeral', weight: 3, kind: 'settlement' },
  { type: 'migration', weight: 3, kind: 'settlement' },
  { type: 'mine_discovery', weight: 2, kind: 'settlement' },
  { type: 'road_closure', weight: 2, kind: 'route' },
  { type: 'royal_procession', weight: 2, kind: 'settlement' },
];

function buildEventDescription(
  type: CivEventType,
  placeName: string,
  rngPick: (n: number) => number,
): { description: string; effects: CivEventEffects } {
  switch (type) {
    case 'harvest_shortage':
      return {
        description: `Poor harvest near ${placeName}: food prices rise.`,
        effects: { priceMult: { grain: 1.8, food: 1.6 }, supplyDelta: { grain: -30, food: -15 } },
      };
    case 'mine_discovery':
      return {
        description: `New ore vein discovered near ${placeName}.`,
        effects: { supplyDelta: { ore: 60, iron: 25, stone: 20 }, priceMult: { ore: 0.7, iron: 0.85 } },
      };
    case 'bandit_activity':
      return {
        description: `Bandits harry travelers on ${placeName}.`,
        effects: { dangerDelta: 0.3 },
      };
    case 'road_closure':
      return {
        description: `Flooding closes ${placeName}; merchants reroute.`,
        effects: { dangerDelta: 0.4 },
      };
    case 'monster_infestation':
      return {
        description: `Monster infestation near ${placeName}: travel declines, food prices creep up.`,
        effects: { priceMult: { food: 1.25 }, dangerDelta: 0.15 },
      };
    case 'military_patrol': {
      const kinds = ['A patrol musters', 'Soldiers drill', 'Sentries double'];
      return { description: `${kinds[rngPick(kinds.length)]} at ${placeName}.`, effects: {} };
    }
    case 'royal_procession':
      return {
        description: `A royal procession passes through ${placeName}.`,
        effects: { priceMult: { luxury: 1.3, food: 1.2 } },
      };
    case 'festival':
      return {
        description: `Festival in ${placeName}: feasting and trade.`,
        effects: { priceMult: { food: 1.35, luxury: 1.25, clothing: 1.15 } },
      };
    case 'funeral':
      return { description: `A funeral is held in ${placeName}.`, effects: {} };
    case 'market_day':
      return {
        description: `Market day in ${placeName}: stalls overflow, prices dip.`,
        effects: { priceMult: { food: 0.9, clothing: 0.9, tools: 0.92 }, supplyDelta: { food: 20 } },
      };
    case 'construction':
      return {
        description: `New building rises in ${placeName}; timber and stone are consumed.`,
        effects: { supplyDelta: { wood: -25, timber: -15, stone: -20 } },
      };
    case 'migration':
      return {
        description: `Families settle in ${placeName}; the population grows.`,
        effects: { populationDelta: 12 + rngPick(30) },
      };
    case 'merchant_arrival':
      return {
        description: `A foreign merchant arrives in ${placeName} with exotic wares.`,
        effects: { supplyDelta: { luxury: 8, clothing: 10, medicine: 5 }, priceMult: { luxury: 0.9 } },
      };
    case 'caravan_arrival':
      return { description: `A caravan arrives in ${placeName}.`, effects: {} };
  }
}

/**
 * Deterministic world events for a given day. Relatively UNCOMMON: most days
 * produce 0-1 events. Pure function of (worldSeed, day, places).
 */
export function eventsForDay(
  worldSeed: number,
  day: number,
  settlements: EventPlace[] = [],
  routes: EventRoute[] = [],
): WorldEvent[] {
  const dayInt = Math.max(1, Math.floor(day));
  if (townsfolkHash(worldSeed >>> 0, (dayInt * 31 + 1) | 0) > 0.45) return [];
  const totalWeight = EVENT_TYPE_TABLE.reduce((sum, e) => sum + e.weight, 0);
  const pick = townsfolkHash(worldSeed >>> 0, (dayInt * 31 + 2) | 0) * totalWeight;
  let acc = 0;
  let chosen = EVENT_TYPE_TABLE[0];
  for (const entry of EVENT_TYPE_TABLE) {
    acc += entry.weight;
    if (pick < acc) { chosen = entry; break; }
  }
  const rngPick = (n: number) => Math.floor(townsfolkHash(worldSeed >>> 0, ((dayInt * 31 + 3) | 0) + n) * n);
  let placeId: string | undefined;
  let placeName = 'the wilds';
  let routeId: string | undefined;
  if (chosen.kind === 'route' && routes.length > 0) {
    const route = routes[Math.floor(townsfolkHash(worldSeed >>> 0, (dayInt * 31 + 4) | 0) * routes.length) % routes.length];
    routeId = route.id;
    placeName = route.name;
  } else if (settlements.length > 0) {
    const place = settlements[Math.floor(townsfolkHash(worldSeed >>> 0, (dayInt * 31 + 5) | 0) * settlements.length) % settlements.length];
    placeId = place.id;
    placeName = place.name;
  }
  const { description, effects } = buildEventDescription(chosen.type, placeName, rngPick);
  if (routeId) effects.routeId = routeId;
  return [{
    id: `civevt-${dayInt}-0`,
    day: dayInt,
    type: chosen.type,
    settlementId: placeId,
    description,
    effects,
  }];
}

// ---------------------------------------------------------------------------
// Simulation LOD
// ---------------------------------------------------------------------------

export type SimLod = 'full' | 'reduced' | 'abstract' | 'event';

/**
 * Simulation level-of-detail by chunk distance (Chebyshev):
 * adjacent chunks get full simulation, the nearby region gets reduced,
 * distant settlements are abstract, and the far world is event-based only.
 */
export function lodFor(chunk: CivChunk, playerChunk: CivChunk): SimLod {
  const dist = Math.max(Math.abs(chunk.x - playerChunk.x), Math.abs(chunk.y - playerChunk.y));
  if (dist <= 1) return 'full';
  if (dist <= 3) return 'reduced';
  if (dist <= 8) return 'abstract';
  return 'event';
}

// ---------------------------------------------------------------------------
// Civilization state + creation
// ---------------------------------------------------------------------------

export type CivilizationState = {
  version: 1;
  worldSeed: number;
  kingdoms: Kingdom[];
  settlements: Settlement[];
  rulers: Ruler[];
  castles: Castle[];
  routes: TradeRoute[];
  caravans: Caravan[];
  units: MilitaryUnit[];
  events: WorldEvent[];
  lastSimDay: number;
};

type SettlementDef = {
  id: string; kind: SettlementKind; name: string; kingdomId: string;
  region: string; chunk: CivChunk;
};

const SETTLEMENT_DEFS: SettlementDef[] = [
  // Kingdom of Aldoria — home 31x31 region (chunks anchored to real landmarks).
  { id: 'aldor', kind: 'capital', name: 'Ironwood Southhold', kingdomId: 'aldoria', region: 'Heartlands', chunk: { x: 8, y: 7 } },
  { id: 'ravenhold', kind: 'town', name: 'Eastmarch', kingdomId: 'aldoria', region: 'Eastmarch', chunk: { x: 17, y: 7 } },
  { id: 'stonewatch', kind: 'town', name: 'Sunwash Port', kingdomId: 'aldoria', region: 'Sunwash Hills', chunk: { x: 3, y: 12 } },
  { id: 'mosslight', kind: 'town', name: 'Mosslight Crossing', kingdomId: 'aldoria', region: 'Heartlands', chunk: { x: 4, y: 7 } },
  { id: 'greenfield', kind: 'village', name: 'Fenmere Hamlet', kingdomId: 'aldoria', region: 'Fenmere Vale', chunk: { x: 0, y: 7 } },
  { id: 'oakrest', kind: 'town', name: 'Seabreak', kingdomId: 'aldoria', region: 'Seabreak Coast', chunk: { x: 10, y: 10 } },
  { id: 'riverbend', kind: 'village', name: 'Dunewatch', kingdomId: 'aldoria', region: 'Dunewatch Reach', chunk: { x: 4, y: 19 } },
  { id: 'northwatch', kind: 'village', name: 'Northwatch Beacon', kingdomId: 'aldoria', region: 'Northfields', chunk: { x: 5, y: 2 } },
  { id: 'bellwater', kind: 'village', name: 'Bellwater', kingdomId: 'aldoria', region: 'Bellwater Fen', chunk: { x: 6, y: 10 } },
  { id: 'frosthold', kind: 'village', name: 'Frosthold', kingdomId: 'aldoria', region: 'Frosthold Pass', chunk: { x: 5, y: -5 } },
  { id: 'westhold', kind: 'village', name: 'Westhold', kingdomId: 'aldoria', region: 'Westermarch', chunk: { x: -7, y: 7 } },
  { id: 'oldmill', kind: 'hamlet', name: 'Old Mill', kingdomId: 'aldoria', region: 'Northfields', chunk: { x: 2, y: 4 } },
  { id: 'emberpeak', kind: 'hamlet', name: 'Emberpeak Shrine', kingdomId: 'aldoria', region: 'Eastmarch', chunk: { x: 9, y: 3 } },
  { id: 'blackroot', kind: 'hamlet', name: 'Blackroot Camp', kingdomId: 'aldoria', region: 'Heartlands', chunk: { x: 1, y: 3 } },
  { id: 'greenfield-farm-1', kind: 'farm', name: 'Greenfield Farm', kingdomId: 'aldoria', region: 'Fenmere Vale', chunk: { x: 0, y: 7 } },
  { id: 'greenfield-farm-2', kind: 'farm', name: 'Greenfield East Farm', kingdomId: 'aldoria', region: 'Fenmere Vale', chunk: { x: 0, y: 7 } },
  { id: 'riverbend-farm-1', kind: 'farm', name: 'Riverbend Farm', kingdomId: 'aldoria', region: 'Dunewatch Reach', chunk: { x: 4, y: 19 } },
  { id: 'westhold-farm-1', kind: 'farm', name: 'Westhold Farm', kingdomId: 'aldoria', region: 'Westermarch', chunk: { x: -7, y: 7 } },
  // Kingdom of Thalara — far 80x80 continent (chunks anchored to real landmarks).
  { id: 'valdris', kind: 'capital', name: 'Stormhaven', kingdomId: 'thalara', region: 'Stormlands', chunk: { x: 130, y: -16 } },
  { id: 'emberhold', kind: 'town', name: 'Emberhold', kingdomId: 'thalara', region: 'Emberlands', chunk: { x: 184, y: 15 } },
  { id: 'oakfield', kind: 'village', name: 'Oakfield', kingdomId: 'thalara', region: 'Oakvale', chunk: { x: 155, y: 0 } },
  { id: 'frostwatch', kind: 'village', name: 'Frostwatch', kingdomId: 'thalara', region: 'Stormlands', chunk: { x: 140, y: -20 } },
  { id: 'stonebridge', kind: 'village', name: 'Stonebridge', kingdomId: 'thalara', region: 'Stonebridge Vale', chunk: { x: 174, y: -8 } },
  { id: 'saltmarsh', kind: 'village', name: 'Saltmarsh', kingdomId: 'thalara', region: 'Saltmarsh Coast', chunk: { x: 165, y: 25 } },
  { id: 'dunmere', kind: 'village', name: 'Dunmere', kingdomId: 'thalara', region: 'Dunmere Downs', chunk: { x: 144, y: 35 } },
  { id: 'oakfield-farm-1', kind: 'farm', name: 'Oakfield Farm', kingdomId: 'thalara', region: 'Oakvale', chunk: { x: 155, y: 0 } },
  { id: 'dunmere-farm-1', kind: 'farm', name: 'Dunmere Farm', kingdomId: 'thalara', region: 'Dunmere Downs', chunk: { x: 144, y: 35 } },
];

type KindProfile = {
  population: number;
  production: Partial<Record<Resource, number>>;
  consumption: Partial<Record<Resource, number>>;
};

const KIND_PROFILES: Record<SettlementKind, KindProfile> = {
  farm: {
    population: 12,
    production: { grain: 60, food: 25, livestock: 8, wool: 10, leather: 2 },
    consumption: { food: 6, tools: 2, clothing: 2, medicine: 1 },
  },
  hamlet: {
    population: 60,
    production: { grain: 12, food: 8, wood: 8, wool: 4 },
    consumption: { food: 5, clothing: 2, tools: 2 },
  },
  village: {
    population: 350,
    production: { grain: 30, food: 14, wood: 12, timber: 6, wool: 8, leather: 5, livestock: 3 },
    consumption: { food: 12, grain: 6, tools: 4, clothing: 4, medicine: 2, wood: 4 },
  },
  town: {
    population: 1800,
    production: { tools: 14, clothing: 12, weapons: 5, armor: 4, medicine: 3, luxury: 2, food: 10, leather: 6 },
    consumption: { grain: 35, food: 30, wood: 18, timber: 8, iron: 10, coal: 4, leather: 8, wool: 8, fish: 10, livestock: 6, stone: 8, clothing: 5, medicine: 3 },
  },
  city: {
    population: 6000,
    production: { weapons: 24, armor: 20, tools: 18, clothing: 16, luxury: 9, medicine: 7, magicMaterials: 3, iron: 12 },
    consumption: { grain: 90, food: 80, wood: 45, timber: 22, iron: 35, coal: 18, stone: 30, leather: 18, wool: 15, fish: 25, livestock: 18, ore: 18, clothing: 10, medicine: 8, luxury: 4 },
  },
  capital: {
    population: 12000,
    production: { weapons: 42, armor: 36, tools: 30, clothing: 28, luxury: 18, medicine: 12, magicMaterials: 6, iron: 22 },
    consumption: { grain: 160, food: 140, wood: 80, timber: 40, iron: 60, coal: 32, stone: 55, leather: 32, wool: 28, fish: 45, livestock: 32, ore: 32, clothing: 18, medicine: 14, luxury: 12, magicMaterials: 6 },
  },
};

/** Local specialties: deterministic production flavor per settlement. */
const SETTLEMENT_SPECIALTIES: Record<string, Partial<Record<Resource, number>>> = {
  greenfield: { grain: 25 },
  'greenfield-farm-1': { grain: 20 },
  'greenfield-farm-2': { grain: 20 },
  stonewatch: { stone: 22, iron: 8 },
  emberhold: { coal: 20, iron: 15 },
  saltmarsh: { fish: 22 },
  oakfield: { timber: 16, wood: 12 },
  westhold: { timber: 12, fish: 8 },
  'westhold-farm-1': { wool: 8 },
  frosthold: { fish: 10, leather: 8 },
  frostwatch: { fish: 10 },
  dunmere: { grain: 12, livestock: 6 },
  riverbend: { grain: 10, fish: 8 },
  bellwater: { fish: 10 },
  aldor: { luxury: 6 },
  valdris: { luxury: 6 },
};

const MALE_NAMES = ['Edran', 'Osric', 'Halvar', 'Theomar', 'Brandel', 'Corvin', 'Aldemar', 'Rurik', 'Dunmor', 'Marwick', 'Fenwick', 'Bramm'];
const FEMALE_NAMES = ['Elira', 'Marenna', 'Ysolde', 'Catrin', 'Isolde', 'Maelis', 'Liora', 'Anwen', 'Sarella', 'Tilda', 'Asha', 'Linnet'];
const HOUSE_NAMES = ['Aldane', 'Veyne', 'Marhold', 'Thornwick', 'Corvane', 'Duskryn'];
const PERSONALITIES = ['just', 'ambitious', 'pious', 'stern', 'generous', 'cunning', 'patient', 'bold', 'cautious', 'charismatic', 'dutiful', 'proud'];
const MERCHANT_NAMES = ['Sarella', 'Dunmor', 'Pell', 'Marwick', 'Odo', 'Tilda', 'Fenwick', 'Asha', 'Corb', 'Linnet', 'Bramm', 'Ysolde'];
const COMMANDER_NAMES = ['Ser Garrick', 'Ser Ysolde', 'Captain Maren', 'Ser Osric', 'Captain Fenna', 'Ser Dunstan', 'Commander Ilsa', 'Ser Rurik'];

function pickFrom<T>(rng: SeededRng, list: T[]): T {
  return list[Math.floor(rng.nextFloat() * list.length) % list.length];
}

function settlePos(def: SettlementDef, worldSeed: number): CivPoint {
  // Deterministic field position inside the chunk; farms offset from the village.
  const salt = def.id.length * 131 + def.chunk.x * 17 + def.chunk.y * 29;
  const hx = townsfolkHash(worldSeed >>> 0, salt);
  const hy = townsfolkHash(worldSeed >>> 0, salt + 7);
  const baseX = 45 + hx * 50;
  const baseY = 45 + hy * 50;
  if (def.kind === 'farm') {
    const fx = townsfolkHash(worldSeed >>> 0, salt + 13);
    const fy = townsfolkHash(worldSeed >>> 0, salt + 19);
    return { x: 20 + fx * 100, y: 20 + fy * 100 };
  }
  return { x: baseX, y: baseY };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

function buildSettlements(rng: SeededRng, worldSeed: number): Settlement[] {
  return SETTLEMENT_DEFS.map((def) => {
    const profile = KIND_PROFILES[def.kind];
    const production = zeroResources();
    const consumption = zeroResources();
    const storage = zeroResources();
    const saltBase = def.id.length * 1009 + def.chunk.x * 61 + def.chunk.y * 67;
    for (const resource of RESOURCES) {
      const baseProd = (profile.production[resource] || 0) + (SETTLEMENT_SPECIALTIES[def.id]?.[resource] || 0);
      const baseCons = profile.consumption[resource] || 0;
      const jitterProd = 0.85 + townsfolkHash(worldSeed >>> 0, saltBase + resource.length) * 0.3;
      const jitterCons = 0.85 + townsfolkHash(worldSeed >>> 0, saltBase + 500 + resource.length) * 0.3;
      production[resource] = Math.round(baseProd * jitterProd * 10) / 10;
      consumption[resource] = Math.round(baseCons * jitterCons * 10) / 10;
      storage[resource] = Math.round(production[resource] * (2 + townsfolkHash(worldSeed >>> 0, saltBase + 900 + resource.length) * 3) * 10) / 10;
    }
    const settlement: Settlement = {
      id: def.id,
      kind: def.kind,
      name: def.name,
      kingdomId: def.kingdomId,
      region: def.region,
      chunk: { ...def.chunk },
      position: settlePos(def, worldSeed),
      population: Math.round(profile.population * (0.9 + rng.nextFloat() * 0.2)),
      production,
      consumption,
      storage,
      prices: zeroResources(),
      demand: zeroResources(),
      supply: zeroResources(),
    };
    recomputeSupplyDemand(settlement);
    return settlement;
  });
}

function titleFor(gender: 'male' | 'female', kind: SettlementKind, rng: SeededRng): RulerTitle {
  switch (kind) {
    case 'capital': return gender === 'female' ? 'Queen' : 'King';
    case 'city': {
      const noble = rng.nextFloat() < 0.5;
      if (gender === 'female') return noble ? 'Duchess' : 'Lady';
      return noble ? 'Duke' : 'Lord';
    }
    case 'town': return rng.nextFloat() < 0.75 ? 'Mayor' : 'Steward';
    case 'village': return rng.nextFloat() < 0.5 ? 'Elder' : 'Reeve';
    default: return 'Elder';
  }
}

function buildRulers(rng: SeededRng, worldSeed: number, settlements: Settlement[]): Ruler[] {
  const rulers: Ruler[] = [];
  for (const settlement of settlements) {
    // Hamlets and farms have no formal ruler.
    if (settlement.kind === 'hamlet' || settlement.kind === 'farm') continue;
    const gender: 'male' | 'female' = rng.nextFloat() < 0.5 ? 'male' : 'female';
    const firstName = gender === 'male' ? pickFrom(rng, MALE_NAMES) : pickFrom(rng, FEMALE_NAMES);
    const house = pickFrom(rng, HOUSE_NAMES);
    const name = `${firstName} ${house}`;
    const spouseFirst = gender === 'male' ? pickFrom(rng, FEMALE_NAMES) : pickFrom(rng, MALE_NAMES);
    const childCount = Math.floor(rng.nextFloat() * 4);
    const children: string[] = [];
    for (let i = 0; i < childCount; i++) {
      const childFirst = rng.nextFloat() < 0.5 ? pickFrom(rng, MALE_NAMES) : pickFrom(rng, FEMALE_NAMES);
      children.push(`${childFirst} ${house}`);
    }
    const personality: string[] = [];
    const p1 = pickFrom(rng, PERSONALITIES);
    let p2 = pickFrom(rng, PERSONALITIES);
    if (p2 === p1) p2 = pickFrom(rng, PERSONALITIES);
    personality.push(p1, p2);
    const age = settlement.kind === 'capital'
      ? 35 + Math.floor(rng.nextFloat() * 30)
      : 28 + Math.floor(rng.nextFloat() * 40);
    const seed = (worldSeed ^ Math.imul(rulers.length + 1, 2654435761)) >>> 0;
    rulers.push({
      id: `ruler-${settlement.id}`,
      name,
      gender,
      age,
      title: titleFor(gender, settlement.kind, rng),
      settlementId: settlement.id,
      kingdomId: settlement.kingdomId,
      family: {
        spouse: childCount > 0 || rng.nextFloat() < 0.7 ? `${spouseFirst} ${house}` : undefined,
        children,
      },
      heirs: children.slice(0, 2),
      personality,
      wealth: Math.round((settlement.kind === 'capital' ? 50000 : settlement.kind === 'city' ? 12000 : settlement.kind === 'town' ? 3000 : 600) * (0.7 + rng.nextFloat() * 0.6)),
      scheduleNote: 'Royal routine: council mornings, court afternoons.',
      seed,
    });
  }
  return rulers;
}

function buildCastles(settlements: Settlement[]): Castle[] {
  const defs: { id: string; name: string; settlementId: string; kind: Castle['kind']; fortress?: boolean }[] = [
    { id: 'castle-aldor', name: 'The Aubergine Keep', settlementId: 'aldor', kind: 'capital' },
    { id: 'castle-valdris', name: 'Stormcrown Castle', settlementId: 'valdris', kind: 'capital' },
    { id: 'castle-frosthold', name: 'Frosthold Bastion', settlementId: 'frosthold', kind: 'border', fortress: true },
    { id: 'castle-stonebridge', name: 'Stonebridge Redoubt', settlementId: 'stonebridge', kind: 'river', fortress: true },
  ];
  return defs.map((def) => {
    const settlement = settlements.find((s) => s.id === def.settlementId);
    const capital = !def.fortress;
    return {
      id: def.id,
      name: def.name,
      settlementId: def.settlementId,
      kingdomId: settlement?.kingdomId ?? 'aldoria',
      kind: def.kind,
      rooms: capital ? [...CASTLE_ROOMS_ALL] : [...FORTRESS_ROOMS],
      garrison: capital ? 220 : 90,
      guards: capital ? 60 : 30,
      servants: capital ? 80 : 12,
      nobles: capital ? 14 : 2,
    };
  });
}

type RouteDef = {
  id: string; name: string; kingdomId: string; from: string; to: string;
  goods: Resource[]; dangerBase: number;
  /** Intermediate road-junction waypoints (chunk + field pos on the road). */
  junctions: { chunk: CivChunk; position: CivPoint; label: string }[];
};

const ROUTE_DEFS: RouteDef[] = [
  {
    id: 'route-grain-run', name: 'Greenfield Grain Run', kingdomId: 'aldoria',
    from: 'greenfield-farm-1', to: 'aldor',
    goods: ['grain', 'food', 'wool'], dangerBase: 0.08, junctions: [],
  },
  {
    id: 'route-provision-line', name: 'Riverbend Provision Line', kingdomId: 'aldoria',
    from: 'riverbend-farm-1', to: 'aldor',
    goods: ['grain', 'livestock', 'leather'], dangerBase: 0.12,
    junctions: [
      { chunk: { x: 4, y: 12 }, position: { x: 70, y: 70 }, label: 'Crossroads' },
      { chunk: { x: 4, y: 7 }, position: { x: 70, y: 70 }, label: 'Mosslight junction' },
    ],
  },
  {
    id: 'route-timber-road', name: 'Westhold Timber Road', kingdomId: 'aldoria',
    from: 'westhold-farm-1', to: 'greenfield',
    goods: ['timber', 'wood', 'fish'], dangerBase: 0.1, junctions: [],
  },
  {
    id: 'route-royal-east', name: 'Royal East Road', kingdomId: 'aldoria',
    from: 'aldor', to: 'ravenhold',
    goods: ['luxury', 'weapons', 'clothing', 'iron'], dangerBase: 0.14, junctions: [],
  },
  {
    id: 'route-ember-ore', name: 'Ember Ore Line', kingdomId: 'thalara',
    from: 'oakfield', to: 'emberhold',
    goods: ['ore', 'iron', 'stone', 'coal'], dangerBase: 0.18,
    junctions: [
      { chunk: { x: 160, y: 0 }, position: { x: 70, y: 70 }, label: 'Oakfield east junction' },
      { chunk: { x: 160, y: 25 }, position: { x: 70, y: 70 }, label: 'Saltmarsh junction' },
      { chunk: { x: 184, y: 25 }, position: { x: 70, y: 70 }, label: 'Emberhold south junction' },
    ],
  },
  {
    id: 'route-valdris-grain', name: 'Valdris Grain Way', kingdomId: 'thalara',
    from: 'dunmere-farm-1', to: 'valdris',
    goods: ['grain', 'food', 'livestock'], dangerBase: 0.1,
    junctions: [
      { chunk: { x: 150, y: 35 }, position: { x: 70, y: 70 }, label: 'Dunmere road' },
      { chunk: { x: 150, y: 0 }, position: { x: 70, y: 70 }, label: 'Oakfield west junction' },
      { chunk: { x: 140, y: 0 }, position: { x: 70, y: 70 }, label: 'Frostwatch junction' },
      { chunk: { x: 140, y: -16 }, position: { x: 70, y: 70 }, label: 'Stormhaven junction' },
    ],
  },
];

/** Caravans travel the open road; military marches faster. */
const CARAVAN_UNITS_PER_DAY = 480;
const MARCH_UNITS_PER_DAY = 320;

function buildRoutes(worldSeed: number, settlements: Settlement[]): TradeRoute[] {
  const byId = new Map(settlements.map((s) => [s.id, s]));
  return ROUTE_DEFS.map((def, index) => {
    const from = byId.get(def.from);
    const to = byId.get(def.to);
    const waypoints: RouteStop[] = [];
    if (from) waypoints.push({ settlementId: from.id, label: from.name, chunk: { ...from.chunk }, position: { ...from.position } });
    for (const j of def.junctions) {
      waypoints.push({ label: j.label, chunk: { ...j.chunk }, position: { ...j.position } });
    }
    if (to) waypoints.push({ settlementId: to.id, label: to.name, chunk: { ...to.chunk }, position: { ...to.position } });
    const danger = Math.min(0.9, Math.max(0.03, def.dangerBase + townsfolkHash(worldSeed >>> 0, 5000 + index) * 0.1));
    return { id: def.id, name: def.name, kingdomId: def.kingdomId, from: def.from, to: def.to, waypoints, goods: [...def.goods], danger };
  });
}

function travelDaysFor(stops: RouteStop[], unitsPerDay: number): number {
  return Math.max(0.25, Math.round((routeLengthUnits(stops) / unitsPerDay) * 100) / 100);
}

function buildCaravans(rng: SeededRng, worldSeed: number, routes: TradeRoute[]): Caravan[] {
  const caravans: Caravan[] = [];
  routes.forEach((route, routeIndex) => {
    const travelDays = travelDaysFor(route.waypoints, CARAVAN_UNITS_PER_DAY);
    // Two caravans per route, staggered so the world starts mid-motion.
    for (let leg = 0; leg < 2; leg++) {
      const salt = routeIndex * 77 + leg * 131;
      const merchant = pickFrom(rng, MERCHANT_NAMES);
      const inventory: Partial<Record<Resource, number>> = {};
      for (const good of route.goods) {
        inventory[good] = Math.round(20 + townsfolkHash(worldSeed >>> 0, salt + good.length * 3) * 60);
      }
      const departureDay = leg === 0
        ? -(townsfolkHash(worldSeed >>> 0, salt + 5) * travelDays) // already en route on day 1
        : 1 + townsfolkHash(worldSeed >>> 0, salt + 11) * 2;
      caravans.push({
        id: `caravan-${route.id}-${leg}`,
        routeId: route.id,
        merchant,
        guards: 2 + Math.floor(townsfolkHash(worldSeed >>> 0, salt + 17) * 4),
        packAnimals: 3 + Math.floor(townsfolkHash(worldSeed >>> 0, salt + 23) * 5),
        carts: 1 + Math.floor(townsfolkHash(worldSeed >>> 0, salt + 29) * 3),
        inventory,
        originId: route.from,
        destinationId: route.to,
        departureDay: Math.round(departureDay * 100) / 100,
        departureHour: 6 + Math.floor(townsfolkHash(worldSeed >>> 0, salt + 31) * 6),
        travelDays,
        reversed: false,
        returnSpawned: false,
      });
    }
  });
  return caravans;
}

type GarrisonDef = {
  id: string; name: string; kingdomId: string; home: string;
  kind: MilitaryUnitKind; soldiers: number; archers: number; cavalry: number;
  journey?: { to: string; purpose: string; junctions: { chunk: CivChunk; position: CivPoint; label: string }[] };
};

const GARRISON_DEFS: GarrisonDef[] = [
  { id: 'unit-aldor-garrison', name: 'Aldor Royal Guard', kingdomId: 'aldoria', home: 'aldor', kind: 'garrison', soldiers: 140, archers: 70, cavalry: 40 },
  { id: 'unit-ravenhold-garrison', name: 'Ravenhold Garrison', kingdomId: 'aldoria', home: 'ravenhold', kind: 'garrison', soldiers: 80, archers: 40, cavalry: 20 },
  { id: 'unit-stonewatch-garrison', name: 'Stonewatch Garrison', kingdomId: 'aldoria', home: 'stonewatch', kind: 'garrison', soldiers: 80, archers: 40, cavalry: 15 },
  { id: 'unit-mosslight-guard', name: 'Mosslight Watch', kingdomId: 'aldoria', home: 'mosslight', kind: 'garrison', soldiers: 12, archers: 4, cavalry: 2 },
  { id: 'unit-greenfield-guard', name: 'Greenfield Watch', kingdomId: 'aldoria', home: 'greenfield', kind: 'garrison', soldiers: 12, archers: 4, cavalry: 0 },
  { id: 'unit-oakrest-guard', name: 'Oakrest Watch', kingdomId: 'aldoria', home: 'oakrest', kind: 'garrison', soldiers: 12, archers: 4, cavalry: 0 },
  { id: 'unit-riverbend-guard', name: 'Riverbend Watch', kingdomId: 'aldoria', home: 'riverbend', kind: 'garrison', soldiers: 12, archers: 4, cavalry: 2 },
  { id: 'unit-northwatch-militia', name: 'Northwatch Militia', kingdomId: 'aldoria', home: 'northwatch', kind: 'garrison', soldiers: 6, archers: 2, cavalry: 0 },
  { id: 'unit-bellwater-militia', name: 'Bellwater Militia', kingdomId: 'aldoria', home: 'bellwater', kind: 'garrison', soldiers: 6, archers: 2, cavalry: 0 },
  { id: 'unit-frosthold-militia', name: 'Frosthold Militia', kingdomId: 'aldoria', home: 'frosthold', kind: 'garrison', soldiers: 8, archers: 4, cavalry: 2 },
  { id: 'unit-westhold-militia', name: 'Westhold Militia', kingdomId: 'aldoria', home: 'westhold', kind: 'garrison', soldiers: 6, archers: 2, cavalry: 0 },
  {
    id: 'unit-aldor-patrol', name: 'Aldor Border Patrol', kingdomId: 'aldoria', home: 'aldor', kind: 'patrol',
    soldiers: 10, archers: 6, cavalry: 8,
    journey: {
      to: 'frosthold', purpose: 'Border patrol',
      junctions: [
        { chunk: { x: 4, y: 7 }, position: { x: 70, y: 70 }, label: 'Mosslight junction' },
        { chunk: { x: 4, y: 4 }, position: { x: 70, y: 70 }, label: 'North road' },
        { chunk: { x: 5, y: 4 }, position: { x: 70, y: 70 }, label: 'Frosthold turn' },
      ],
    },
  },
  {
    id: 'unit-aldor-messenger', name: "King's Messenger", kingdomId: 'aldoria', home: 'aldor', kind: 'messenger',
    soldiers: 1, archers: 0, cavalry: 1,
    journey: { to: 'ravenhold', purpose: 'Royal messenger', junctions: [] },
  },
  {
    id: 'unit-stonewatch-supply', name: 'Stonewatch Supply Train', kingdomId: 'aldoria', home: 'stonewatch', kind: 'supply',
    soldiers: 6, archers: 2, cavalry: 0,
    journey: {
      to: 'frosthold', purpose: 'Supply run',
      junctions: [
        { chunk: { x: 4, y: 12 }, position: { x: 70, y: 70 }, label: 'Crossroads' },
        { chunk: { x: 4, y: 4 }, position: { x: 70, y: 70 }, label: 'North road' },
        { chunk: { x: 5, y: 4 }, position: { x: 70, y: 70 }, label: 'Frosthold turn' },
      ],
    },
  },
  { id: 'unit-valdris-garrison', name: 'Valdris Stormguard', kingdomId: 'thalara', home: 'valdris', kind: 'garrison', soldiers: 120, archers: 60, cavalry: 35 },
  { id: 'unit-emberhold-garrison', name: 'Emberhold Garrison', kingdomId: 'thalara', home: 'emberhold', kind: 'garrison', soldiers: 70, archers: 35, cavalry: 15 },
  { id: 'unit-oakfield-guard', name: 'Oakfield Watch', kingdomId: 'thalara', home: 'oakfield', kind: 'garrison', soldiers: 12, archers: 4, cavalry: 2 },
  { id: 'unit-frostwatch-militia', name: 'Frostwatch Militia', kingdomId: 'thalara', home: 'frostwatch', kind: 'garrison', soldiers: 6, archers: 2, cavalry: 0 },
  { id: 'unit-stonebridge-militia', name: 'Stonebridge Militia', kingdomId: 'thalara', home: 'stonebridge', kind: 'garrison', soldiers: 8, archers: 4, cavalry: 2 },
  { id: 'unit-saltmarsh-militia', name: 'Saltmarsh Militia', kingdomId: 'thalara', home: 'saltmarsh', kind: 'garrison', soldiers: 6, archers: 2, cavalry: 0 },
  { id: 'unit-dunmere-militia', name: 'Dunmere Militia', kingdomId: 'thalara', home: 'dunmere', kind: 'garrison', soldiers: 6, archers: 2, cavalry: 0 },
  {
    id: 'unit-valdris-patrol', name: 'Valdris Border Patrol', kingdomId: 'thalara', home: 'valdris', kind: 'patrol',
    soldiers: 10, archers: 6, cavalry: 8,
    journey: {
      to: 'stonebridge', purpose: 'Border patrol',
      junctions: [
        { chunk: { x: 140, y: -16 }, position: { x: 70, y: 70 }, label: 'Stormhaven junction' },
        { chunk: { x: 140, y: 0 }, position: { x: 70, y: 70 }, label: 'Frostwatch junction' },
        { chunk: { x: 155, y: 0 }, position: { x: 70, y: 70 }, label: 'Oakfield' },
        { chunk: { x: 165, y: 0 }, position: { x: 70, y: 70 }, label: 'Stonebridge leg' },
      ],
    },
  },
  {
    id: 'unit-valdris-scouts', name: 'Valdris Scouts', kingdomId: 'thalara', home: 'valdris', kind: 'scouts',
    soldiers: 2, archers: 4, cavalry: 4,
    journey: {
      to: 'oakfield', purpose: 'Scouting the wilds',
      junctions: [
        { chunk: { x: 140, y: -16 }, position: { x: 70, y: 70 }, label: 'Stormhaven junction' },
        { chunk: { x: 140, y: 0 }, position: { x: 70, y: 70 }, label: 'Frostwatch junction' },
      ],
    },
  },
];

function buildUnits(rng: SeededRng, worldSeed: number, settlements: Settlement[]): MilitaryUnit[] {
  const byId = new Map(settlements.map((s) => [s.id, s]));
  return GARRISON_DEFS.map((def, index) => {
    const home = byId.get(def.home);
    let journey: MilitaryJourney | undefined;
    if (def.journey && home) {
      const dest = byId.get(def.journey.to);
      const stops: RouteStop[] = [
        { settlementId: home.id, label: home.name, chunk: { ...home.chunk }, position: { ...home.position } },
      ];
      for (const j of def.journey.junctions) {
        stops.push({ label: j.label, chunk: { ...j.chunk }, position: { ...j.position } });
      }
      if (dest) stops.push({ settlementId: dest.id, label: dest.name, chunk: { ...dest.chunk }, position: { ...dest.position } });
      journey = {
        stops,
        departureDay: Math.round((0.3 + townsfolkHash(worldSeed >>> 0, 9000 + index) * 1.5) * 100) / 100,
        travelDays: travelDaysFor(stops, MARCH_UNITS_PER_DAY),
        reversed: false,
        purpose: def.journey.purpose,
      };
    }
    const seed = (worldSeed ^ Math.imul(index + 101, 2246822519)) >>> 0;
    return {
      id: def.id,
      name: def.name,
      kingdomId: def.kingdomId,
      kind: def.kind,
      homeSettlementId: def.home,
      size: def.soldiers + def.archers + def.cavalry,
      soldiers: def.soldiers,
      archers: def.archers,
      cavalry: def.cavalry,
      commander: pickFrom(rng, COMMANDER_NAMES),
      scheduleNote: def.kind === 'garrison' ? 'Barracks routine: drills, patrol, gate duty.' : `${def.journey?.purpose ?? 'Traveling'} along the roads.`,
      seed,
      journey,
    };
  });
}

function buildKingdoms(rng: SeededRng, settlements: Settlement[], rulers: Ruler[], routes: TradeRoute[], units: MilitaryUnit[]): Kingdom[] {
  const forKingdom = (kingdomId: string) => settlements.filter((s) => s.kingdomId === kingdomId);
  const rulerFor = (settlementId: string) => rulers.find((r) => r.settlementId === settlementId);
  const defs = [
    {
      id: 'aldoria', name: 'Kingdom of Aldoria', capital: 'aldor',
      territories: ['Heartlands', 'Eastmarch', 'Fenmere Vale', 'Westermarch', 'Dunewatch Reach', 'Northfields', 'Seabreak Coast', 'Sunwash Hills', 'Bellwater Fen', 'Frosthold Pass'],
      laws: ['The King\'s Peace holds on all roads.', 'Grain tithe: one bushel in ten to the crown.', 'Trial by magistrate in towns; by the King\'s court in Aldor.'],
      factions: ['The Royal Court', 'The Grain Guild', 'The Ironmasters', 'The Wayfarer Compact'],
      taxRate: 0.08,
    },
    {
      id: 'thalara', name: 'Kingdom of Thalara', capital: 'valdris',
      territories: ['Stormlands', 'Emberlands', 'Oakvale', 'Dunmere Downs', 'Saltmarsh Coast', 'Stonebridge Vale'],
      laws: ['The Storm Truce binds all holds.', 'Ore tithe: one ingot in twelve to Stormcrown.', 'Disputes settled by moot at Valdris.'],
      factions: ['The Storm Court', 'The Ember Smiths', 'The Saltwise Traders', 'The Oakwardens'],
      taxRate: 0.07,
    },
  ];
  return defs.map((def) => {
    const owned = forKingdom(def.id);
    const capitalRuler = rulerFor(def.capital);
    const population = owned.reduce((sum, s) => sum + s.population, 0);
    const economy = Math.round(owned.reduce((sum, s) => {
      let value = 0;
      for (const resource of RESOURCES) value += (s.production[resource] || 0) * BASE_PRICES[resource];
      return sum + value;
    }, 0));
    const resources = [...new Set(owned.flatMap((s) => RESOURCES.filter((r) => (s.production[r] || 0) > 0)))];
    const militaryStrength = units
      .filter((u) => u.kingdomId === def.id)
      .reduce((sum, u) => sum + u.size, 0) * 10;
    const other = def.id === 'aldoria' ? 'thalara' : 'aldoria';
    return {
      id: def.id,
      name: def.name,
      capital: def.capital,
      ruler: capitalRuler?.id ?? '',
      heir: capitalRuler?.heirs[0] ?? capitalRuler?.family.children[0] ?? 'none named',
      territories: [...def.territories],
      cities: owned.filter((s) => s.kind === 'capital' || s.kind === 'city').map((s) => s.id),
      towns: owned.filter((s) => s.kind === 'town').map((s) => s.id),
      villages: owned.filter((s) => s.kind === 'village' || s.kind === 'hamlet' || s.kind === 'farm').map((s) => s.id),
      population,
      treasury: Math.round(economy * (2 + rng.nextFloat() * 2)),
      militaryStrength,
      economy,
      resources,
      // A peaceful world by default: trade partners, not warring states.
      relations: { [other]: 'trade' },
      laws: [...def.laws],
      factions: [...def.factions],
      tradeRouteIds: routes.filter((r) => r.kingdomId === def.id).map((r) => r.id),
      wars: [],
      alliances: [other],
      taxRate: def.taxRate,
    };
  });
}

/**
 * Build the entire civilization deterministically from a world seed.
 * Same seed -> identical kingdoms, settlements, rulers, routes, caravans.
 */
export function createCivilization(worldSeed: number): CivilizationState {
  const seed = worldSeed >>> 0;
  const rng = new SeededRng(seed ^ 0xc1a0);
  const settlements = buildSettlements(rng, seed);
  const rulers = buildRulers(rng, seed, settlements);
  const castles = buildCastles(settlements);
  const routes = buildRoutes(seed, settlements);
  const caravans = buildCaravans(rng, seed, routes);
  const units = buildUnits(rng, seed, settlements);
  const kingdoms = buildKingdoms(rng, settlements, rulers, routes, units);
  return {
    version: 1,
    worldSeed: seed,
    kingdoms,
    settlements,
    rulers,
    castles,
    routes,
    caravans,
    units,
    events: [],
    lastSimDay: 1,
  };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function settlementById(civ: CivilizationState, id: string): Settlement | undefined {
  return civ.settlements.find((s) => s.id === id);
}

export function kingdomOfSettlement(civ: CivilizationState, settlementId: string): Kingdom | undefined {
  const settlement = settlementById(civ, settlementId);
  if (!settlement) return undefined;
  return civ.kingdoms.find((k) => k.id === settlement.kingdomId);
}

export function settlementsByChunk(civ: CivilizationState, chunk: CivChunk): Settlement[] {
  return civ.settlements.filter((s) => s.chunk.x === chunk.x && s.chunk.y === chunk.y);
}

/**
 * World-map label points for kingdom names: one per kingdom, floating a few
 * chunks above its capital so the label reads at far zoom without covering
 * the capital's own town label.
 */
export function kingdomLabelPoints(civ: CivilizationState): { text: string; x: number; y: number }[] {
  return civ.kingdoms.map((k) => {
    const capital = civ.settlements.find((s) => s.id === k.capital);
    return {
      text: k.name.toUpperCase(),
      x: capital ? capital.chunk.x : 0,
      y: capital ? capital.chunk.y - 5 : 0,
    };
  });
}

export function rulerById(civ: CivilizationState, id: string): Ruler | undefined {
  return civ.rulers.find((r) => r.id === id);
}

/** Castle guarding a settlement, if one stands there. */
export function castleBySettlementId(civ: CivilizationState, settlementId: string): Castle | undefined {
  return civ.castles.find((c) => c.settlementId === settlementId);
}

// ---------------------------------------------------------------------------
// Daily simulation advance (NOT per frame)
// ---------------------------------------------------------------------------

function applyEventEffects(civ: CivilizationState, event: WorldEvent): void {
  const effects = event.effects;
  if (event.settlementId) {
    const settlement = settlementById(civ, event.settlementId);
    if (settlement) {
      if (effects.priceMult) {
        for (const resource of RESOURCES) {
          const mult = effects.priceMult[resource];
          if (mult !== undefined) {
            settlement.prices[resource] = Math.round(settlement.prices[resource] * mult * 100) / 100;
          }
        }
      }
      if (effects.supplyDelta) {
        for (const resource of RESOURCES) {
          const delta = effects.supplyDelta[resource];
          if (delta !== undefined) {
            settlement.storage[resource] = Math.max(0, Math.round((settlement.storage[resource] + delta) * 10) / 10);
          }
        }
        recomputeSupplyDemand(settlement);
      }
      if (effects.populationDelta) {
        settlement.population = Math.max(1, settlement.population + Math.round(effects.populationDelta));
      }
    }
  }
  if (effects.routeId && effects.dangerDelta) {
    const route = civ.routes.find((r) => r.id === effects.routeId);
    if (route) route.danger = Math.min(1, Math.max(0, route.danger + effects.dangerDelta));
  }
}

function processArrivals(civ: CivilizationState, dayFloat: number, rng: SeededRng): void {
  for (const caravan of civ.caravans) {
    if (caravan.returnSpawned) continue;
    if (caravanProgress(caravan, dayFloat) < 1) continue;
    caravan.returnSpawned = true;
    const route = civ.routes.find((r) => r.id === caravan.routeId);
    const destination = settlementById(civ, caravan.destinationId);
    const origin = settlementById(civ, caravan.originId);
    // Deliver the goods into the destination's stockpiles.
    if (destination) {
      for (const resource of RESOURCES) {
        const amount = caravan.inventory[resource] || 0;
        if (amount > 0) destination.storage[resource] = Math.round((destination.storage[resource] + amount) * 10) / 10;
      }
      recomputeSupplyDemand(destination);
    }
    const day = Math.floor(dayFloat) + 1;
    civ.events.push({
      id: `civevt-caravan-${caravan.id}`,
      day,
      type: 'caravan_arrival',
      settlementId: caravan.destinationId,
      description: `${caravan.merchant}'s caravan arrived in ${destination?.name ?? caravan.destinationId} from ${origin?.name ?? caravan.originId}.`,
      effects: {},
    });
    // Deterministic return trip: same merchant heads back with new wares.
    const travelDays = route ? travelDaysFor(route.waypoints, CARAVAN_UNITS_PER_DAY) : caravan.travelDays;
    const inventory: Partial<Record<Resource, number>> = {};
    if (route) {
      for (const good of route.goods) {
        inventory[good] = Math.round(20 + rng.nextFloat() * 60);
      }
    }
    civ.caravans.push({
      id: `${caravan.id}-return`,
      routeId: caravan.routeId,
      merchant: caravan.merchant,
      guards: caravan.guards,
      packAnimals: caravan.packAnimals,
      carts: caravan.carts,
      inventory,
      originId: caravan.destinationId,
      destinationId: caravan.originId,
      departureDay: Math.round((dayFloat + 0.5 + rng.nextFloat() * 0.5) * 100) / 100,
      departureHour: 6 + Math.floor(rng.nextFloat() * 6),
      travelDays,
      reversed: !caravan.reversed,
      returnSpawned: false,
    });
  }
  // Traveling military units turn around deterministically when they arrive.
  for (const unit of civ.units) {
    const journey = unit.journey;
    if (!journey) continue;
    const arrivalDay = journey.departureDay + journey.travelDays;
    if (dayFloat < arrivalDay) continue;
    // Only flip once per arrival: departureDay is always <= last arrival.
    const lastDeparture = journey.departureDay;
    journey.reversed = !journey.reversed;
    journey.departureDay = Math.round((arrivalDay + 0.75 + rng.nextFloat() * 0.5) * 100) / 100;
    if (journey.departureDay <= lastDeparture) {
      journey.departureDay = Math.round((lastDeparture + 0.5) * 100) / 100;
    }
  }
  // Bound memory: drop the oldest fully-arrived caravans past a cap.
  if (civ.caravans.length > 120) {
    const traveling = civ.caravans.filter((c) => caravanProgress(c, dayFloat) < 1);
    const arrived = civ.caravans
      .filter((c) => caravanProgress(c, dayFloat) >= 1)
      .sort((a, b) => (a.departureDay + a.travelDays) - (b.departureDay + b.travelDays));
    const keepArrived = arrived.slice(Math.max(0, arrived.length - (120 - traveling.length)));
    civ.caravans = [...traveling, ...keepArrived];
  }
  if (civ.events.length > 400) {
    civ.events = civ.events.slice(civ.events.length - 400);
  }
}

function simulateDay(civ: CivilizationState, day: number, rng: SeededRng): void {
  const places: EventPlace[] = civ.settlements.map((s) => ({ id: s.id, name: s.name }));
  const routePlaces: EventRoute[] = civ.routes.map((r) => ({ id: r.id, name: r.name }));
  // Economy: produce, consume, restock, reprice.
  for (const settlement of civ.settlements) {
    const cap = 50 + settlement.population;
    for (const resource of RESOURCES) {
      const next = settlement.storage[resource] + settlement.production[resource] - settlement.consumption[resource];
      settlement.storage[resource] = Math.round(Math.min(cap, Math.max(0, next)) * 10) / 10;
    }
    recomputeSupplyDemand(settlement);
  }
  // World events for the day (deterministic, uncommon) + their effects.
  const dayEvents = eventsForDay(civ.worldSeed, day, places, routePlaces);
  for (const event of dayEvents) {
    applyEventEffects(civ, event);
    civ.events.push(event);
  }
  // Kingdom ledgers: treasury tithe from daily production value.
  for (const kingdom of civ.kingdoms) {
    let tradeValue = 0;
    let population = 0;
    for (const settlement of civ.settlements) {
      if (settlement.kingdomId !== kingdom.id) continue;
      population += settlement.population;
      for (const resource of RESOURCES) {
        tradeValue += (settlement.production[resource] || 0) * (settlement.prices[resource] || 0);
      }
    }
    kingdom.population = population;
    kingdom.economy = Math.round(tradeValue);
    kingdom.treasury = Math.round(kingdom.treasury + tradeValue * kingdom.taxRate * 0.05);
  }
}

/**
 * Advance the civilization simulation. Runs the daily economy, world events,
 * caravan arrivals and military turnarounds ONCE PER IN-GAME DAY — never per
 * frame. Safe to call every tick: it no-ops when the day hasn't changed, and
 * catches up across multi-day jumps (waiting, fast-forward) day by day.
 * Mutates and returns `civ`.
 */
export function advanceCivilization(
  civ: CivilizationState,
  clock: WorldClockState,
  _prevClock?: WorldClockState,
): CivilizationState {
  const day = Math.max(1, Math.floor(clock.day));
  if (day <= civ.lastSimDay) return civ;
  const rng = new SeededRng((civ.worldSeed ^ Math.imul(day, 974634211)) >>> 0);
  // Cap catch-up so a huge jump can't hang the tick (debug fast-forward max).
  const maxDays = Math.min(day, civ.lastSimDay + 370);
  for (let d = civ.lastSimDay + 1; d <= maxDays; d++) {
    simulateDay(civ, d, rng);
  }
  civ.lastSimDay = maxDays;
  processArrivals(civ, civDayFloat(clock), rng);
  return civ;
}

// ---------------------------------------------------------------------------
// Serialization (save/load)
// ---------------------------------------------------------------------------

/** Plain JSON round-trip of the whole civilization state. */
export function serializeCivilization(civ: CivilizationState): string {
  return JSON.stringify(civ);
}

export function deserializeCivilization(data: string): CivilizationState {
  const parsed = JSON.parse(data) as Partial<CivilizationState>;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.settlements) || !Array.isArray(parsed.kingdoms)) {
    throw new Error('civilization: incompatible save data');
  }
  return parsed as CivilizationState;
}
