// Deterministic world foundation for ASHFALL.
// This module is intentionally small: it owns world time, seed state,
// deterministic randomness, and queued events without coupling to rendering.

export const DEFAULT_WORLD_SEED = 847291583;
export const WORLD_SCHEMA_VERSION = 1;
export const MINUTES_PER_TICK = 10;
export const DAYS_PER_YEAR = 360;

export type WorldSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export type WorldClockState = {
  tick: number;
  year: number;
  day: number;
  minuteOfDay: number;
  season: WorldSeason;
};

export type WorldEvent = {
  id: string;
  tick: number;
  type: string;
  payload: Record<string, boolean | number | string | null>;
};

export type WorldCoreState = {
  schemaVersion: number;
  seed: number;
  clock: WorldClockState;
  queuedEvents: WorldEvent[];
  rngState: number;
};

function normalizeSeed(seed: number) {
  return (Number.isFinite(seed) ? Math.floor(seed) : DEFAULT_WORLD_SEED) >>> 0;
}

function seasonForDay(day: number): WorldSeason {
  const dayOfYear = ((day - 1) % DAYS_PER_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  if (dayOfYear < 90) return 'spring';
  if (dayOfYear < 180) return 'summer';
  if (dayOfYear < 270) return 'autumn';
  return 'winter';
}

/** A serializable seeded generator. Never use Math.random for world data. */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = normalizeSeed(seed);
  }

  nextFloat() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  getState() {
    return this.state >>> 0;
  }

  setState(state: number) {
    this.state = normalizeSeed(state);
  }
}

export class WorldCore {
  private readonly rng: SeededRng;
  private readonly clock: WorldClockState = {
    tick: 0,
    year: 1,
    day: 1,
    minuteOfDay: 6 * 60,
    season: 'spring',
  };
  private readonly queuedEvents: WorldEvent[] = [];
  private eventSequence = 0;
  readonly seed: number;

  constructor(seed = DEFAULT_WORLD_SEED) {
    this.seed = normalizeSeed(seed);
    this.rng = new SeededRng(this.seed);
  }

  getClock(): WorldClockState {
    return { ...this.clock };
  }

  random() {
    return this.rng.nextFloat();
  }

  advance(ticks = 1) {
    const wholeTicks = Math.max(0, Math.floor(ticks));
    if (wholeTicks === 0) return this.getClock();

    const totalMinutes = this.clock.minuteOfDay + wholeTicks * MINUTES_PER_TICK;
    const elapsedDays = Math.floor(totalMinutes / (24 * 60));
    this.clock.minuteOfDay = totalMinutes % (24 * 60);
    this.clock.day += elapsedDays;
    this.clock.year = 1 + Math.floor((this.clock.day - 1) / DAYS_PER_YEAR);
    this.clock.season = seasonForDay(this.clock.day);
    this.clock.tick += wholeTicks;
    return this.getClock();
  }

  queueEvent(type: string, payload: WorldEvent['payload'] = {}, tick = this.clock.tick) {
    const event: WorldEvent = {
      id: 'world-event-' + this.clock.tick + '-' + this.eventSequence,
      tick: Math.max(this.clock.tick, Math.floor(tick)),
      type,
      payload: { ...payload },
    };
    this.eventSequence += 1;
    this.queuedEvents.push(event);
    this.queuedEvents.sort((left, right) => left.tick - right.tick || left.id.localeCompare(right.id));
    return { ...event, payload: { ...event.payload } };
  }

  drainDueEvents() {
    const due: WorldEvent[] = [];
    const pending: WorldEvent[] = [];
    this.queuedEvents.forEach((event) => {
      (event.tick <= this.clock.tick ? due : pending).push(event);
    });
    this.queuedEvents.splice(0, this.queuedEvents.length, ...pending);
    return due.map((event) => ({ ...event, payload: { ...event.payload } }));
  }

  getState(): WorldCoreState {
    return {
      schemaVersion: WORLD_SCHEMA_VERSION,
      seed: this.seed,
      clock: this.getClock(),
      queuedEvents: this.queuedEvents.map((event) => ({ ...event, payload: { ...event.payload } })),
      rngState: this.rng.getState(),
    };
  }

  loadState(state: WorldCoreState) {
    if (!state || state.schemaVersion !== WORLD_SCHEMA_VERSION || normalizeSeed(state.seed) !== this.seed) {
      throw new Error('World core: incompatible save state');
    }
    this.clock.tick = Math.max(0, Math.floor(state.clock.tick));
    this.clock.year = Math.max(1, Math.floor(state.clock.year));
    this.clock.day = Math.max(1, Math.floor(state.clock.day));
    this.clock.minuteOfDay = Math.min(24 * 60 - 1, Math.max(0, Math.floor(state.clock.minuteOfDay)));
    this.clock.season = seasonForDay(this.clock.day);
    this.queuedEvents.splice(0, this.queuedEvents.length, ...state.queuedEvents.map((event) => ({
      id: String(event.id),
      tick: Math.max(this.clock.tick, Math.floor(event.tick)),
      type: String(event.type),
      payload: { ...event.payload },
    })));
    this.eventSequence = this.queuedEvents.length;
    this.rng.setState(state.rngState);
  }
}
