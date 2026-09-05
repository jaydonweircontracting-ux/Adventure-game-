// Deterministic world foundation for ASHFALL.
// This module owns world time, seed state, deterministic randomness, and
// scheduled events without coupling simulation rules to rendering.

export const DEFAULT_WORLD_SEED = 847291583;
export const WORLD_SCHEMA_VERSION = 2;
export const MINUTES_PER_TICK = 10;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export const SIMULATION_SPEEDS = [0, 1, 2, 5, 10, 50, 100, 1000] as const;
export type SimulationSpeed = typeof SIMULATION_SPEEDS[number];
export type WorldSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export type WorldClockState = {
  tick: number;
  year: number;
  month: number;
  week: number;
  day: number;
  hour: number;
  minuteOfDay: number;
  second: number;
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
  simulationSpeed?: SimulationSpeed;
  eventSequence?: number;
};

export type WorldTimeEventType =
  | 'tick'
  | 'minute_changed'
  | 'hour_changed'
  | 'day_changed'
  | 'week_changed'
  | 'month_changed'
  | 'season_changed'
  | 'year_changed';

export type WorldTimeEvent = {
  type: WorldTimeEventType;
  previous: WorldClockState;
  current: WorldClockState;
};

export type WorldTimeListener = (event: WorldTimeEvent) => void;

function normalizeSeed(seed: number) {
  return (Number.isFinite(seed) ? Math.floor(seed) : DEFAULT_WORLD_SEED) >>> 0;
}

function isSimulationSpeed(value: number): value is SimulationSpeed {
  return SIMULATION_SPEEDS.includes(value as SimulationSpeed);
}

function normalizeSimulationSpeed(value: number | undefined): SimulationSpeed {
  return typeof value === 'number' && isSimulationSpeed(value) ? value : 1;
}

function seasonForDay(day: number): WorldSeason {
  const dayOfYear = ((day - 1) % DAYS_PER_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  if (dayOfYear < 90) return 'spring';
  if (dayOfYear < 180) return 'summer';
  if (dayOfYear < 270) return 'autumn';
  return 'winter';
}

function copyClock(clock: WorldClockState): WorldClockState {
  return { ...clock };
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
    month: 1,
    week: 1,
    day: 1,
    hour: 6,
    minuteOfDay: 6 * MINUTES_PER_HOUR,
    second: 0,
    season: 'spring',
  };
  private readonly queuedEvents: WorldEvent[] = [];
  private readonly listeners = new Map<WorldTimeEventType, Set<WorldTimeListener>>();
  private eventSequence = 0;
  private simulationSpeed: SimulationSpeed = 1;
  readonly seed: number;

  constructor(seed = DEFAULT_WORLD_SEED) {
    this.seed = normalizeSeed(seed);
    this.rng = new SeededRng(this.seed);
  }

  getClock(): WorldClockState {
    return copyClock(this.clock);
  }

  getSimulationSpeed() {
    return this.simulationSpeed;
  }

  setSimulationSpeed(speed: number) {
    if (!Number.isFinite(speed) || !isSimulationSpeed(speed)) {
      throw new Error('World core: unsupported simulation speed ' + speed);
    }
    this.simulationSpeed = speed;
    return this.simulationSpeed;
  }

  subscribe(type: WorldTimeEventType, listener: WorldTimeListener) {
    const listeners = this.listeners.get(type) || new Set<WorldTimeListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  random() {
    return this.rng.nextFloat();
  }

  advance(ticks = 1) {
    const wholeTicks = Math.max(0, Math.floor(ticks));
    const simulationTicks = wholeTicks * this.simulationSpeed;
    for (let index = 0; index < simulationTicks; index += 1) this.advanceSingleTick();
    return this.getClock();
  }

  private advanceSingleTick() {
    const previous = this.getClock();
    const totalSeconds = this.clock.hour * MINUTES_PER_HOUR * SECONDS_PER_MINUTE
      + (this.clock.minuteOfDay % MINUTES_PER_HOUR) * SECONDS_PER_MINUTE
      + this.clock.second
      + MINUTES_PER_TICK * SECONDS_PER_MINUTE;
    const secondsPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
    const elapsedDays = Math.floor(totalSeconds / secondsPerDay);
    const secondsToday = totalSeconds % secondsPerDay;

    this.clock.tick += 1;
    this.clock.day += elapsedDays;
    this.clock.year = 1 + Math.floor((this.clock.day - 1) / DAYS_PER_YEAR);
    this.clock.month = 1 + Math.floor(((this.clock.day - 1) % DAYS_PER_YEAR) / DAYS_PER_MONTH);
    this.clock.week = 1 + Math.floor((this.clock.day - 1) / DAYS_PER_WEEK);
    this.clock.hour = Math.floor(secondsToday / (MINUTES_PER_HOUR * SECONDS_PER_MINUTE));
    this.clock.minuteOfDay = this.clock.hour * MINUTES_PER_HOUR
      + Math.floor((secondsToday % (MINUTES_PER_HOUR * SECONDS_PER_MINUTE)) / SECONDS_PER_MINUTE);
    this.clock.second = secondsToday % SECONDS_PER_MINUTE;
    this.clock.season = seasonForDay(this.clock.day);

    this.emitTimeEvent('tick', previous);
    if (previous.minuteOfDay !== this.clock.minuteOfDay || previous.second !== this.clock.second) this.emitTimeEvent('minute_changed', previous);
    if (previous.hour !== this.clock.hour || previous.day !== this.clock.day) this.emitTimeEvent('hour_changed', previous);
    if (previous.day !== this.clock.day) this.emitTimeEvent('day_changed', previous);
    if (previous.week !== this.clock.week) this.emitTimeEvent('week_changed', previous);
    if (previous.month !== this.clock.month) this.emitTimeEvent('month_changed', previous);
    if (previous.season !== this.clock.season) this.emitTimeEvent('season_changed', previous);
    if (previous.year !== this.clock.year) this.emitTimeEvent('year_changed', previous);
  }

  private emitTimeEvent(type: WorldTimeEventType, previous: WorldClockState) {
    const listeners = this.listeners.get(type);
    if (!listeners?.size) return;
    const event: WorldTimeEvent = { type, previous: copyClock(previous), current: this.getClock() };
    listeners.forEach((listener) => listener(event));
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
      simulationSpeed: this.simulationSpeed,
      eventSequence: this.eventSequence,
    };
  }

  loadState(state: WorldCoreState) {
    if (!state || (state.schemaVersion !== 1 && state.schemaVersion !== WORLD_SCHEMA_VERSION) || normalizeSeed(state.seed) !== this.seed) {
      throw new Error('World core: incompatible save state');
    }
    const savedClock = state.clock as Partial<WorldClockState>;
    this.clock.tick = Math.max(0, Math.floor(savedClock.tick || 0));
    this.clock.day = Math.max(1, Math.floor(savedClock.day || 1));
    this.clock.year = 1 + Math.floor((this.clock.day - 1) / DAYS_PER_YEAR);
    this.clock.month = 1 + Math.floor(((this.clock.day - 1) % DAYS_PER_YEAR) / DAYS_PER_MONTH);
    this.clock.week = 1 + Math.floor((this.clock.day - 1) / DAYS_PER_WEEK);
    this.clock.minuteOfDay = Math.min(24 * MINUTES_PER_HOUR - 1, Math.max(0, Math.floor(savedClock.minuteOfDay || 0)));
    this.clock.hour = Math.floor(this.clock.minuteOfDay / MINUTES_PER_HOUR);
    this.clock.second = Math.min(SECONDS_PER_MINUTE - 1, Math.max(0, Math.floor(savedClock.second || 0)));
    this.clock.season = seasonForDay(this.clock.day);
    this.simulationSpeed = normalizeSimulationSpeed(state.simulationSpeed);
    this.queuedEvents.splice(0, this.queuedEvents.length, ...state.queuedEvents.map((event) => ({
      id: String(event.id),
      tick: Math.max(this.clock.tick, Math.floor(event.tick)),
      type: String(event.type),
      payload: { ...event.payload },
    })));
    this.eventSequence = Math.max(this.queuedEvents.length, Math.floor(state.eventSequence || 0));
    this.rng.setState(state.rngState);
  }
}
