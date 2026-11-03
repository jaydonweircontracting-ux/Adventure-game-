/**
 * Default Adventure runtime: real adapters around the existing simulation
 * modules. This creates an API-facing runtime without replacing the game's
 * current application state or renderer.
 */
import { AdventureAPI } from './AdventureAPI';
import { WorldCore, DEFAULT_WORLD_SEED, type WorldTimeEvent } from '../worldCore';
import {
  macroLandformAt,
  moistureAt,
  forestDensityAt,
  rockDensityAt,
  regionForChunk,
  waterAt,
  landUseAt,
} from '../landscape';
import {
  createCivilization,
  advanceCivilization,
  settlementById,
  settlementsByChunk,
  serializeCivilization,
  deserializeCivilization,
  type CivilizationState,
  type CivChunk,
} from '../civilization';
import { GRAPHICS_MODE_OPTIONS, type GraphicsMode } from '../engine3d/engine3d';

export interface AdventureRuntimeOptions {
  readonly worldSeed?: number;
  readonly eventHistoryLimit?: number;
}

export interface AdventureWorldService {
  readonly core: WorldCore;
  getClock: WorldCore['getClock'];
  getSimulationSpeed: WorldCore['getSimulationSpeed'];
  setSimulationSpeed: WorldCore['setSimulationSpeed'];
  advance: (ticks?: number) => ReturnType<WorldCore['advance']>;
  getState: WorldCore['getState'];
  loadState: WorldCore['loadState'];
}

export interface AdventureTerrainService {
  sample(x: number, y: number): {
    landform: number;
    moisture: number;
    forestDensity: number;
    rockDensity: number;
    landUse: ReturnType<typeof landUseAt>;
    water: ReturnType<typeof waterAt>;
    region: ReturnType<typeof regionForChunk>;
  };
}

export interface AdventureCivilizationService {
  readonly state: CivilizationState;
  advanceDay: (day?: number) => void;
  settlement: typeof settlementById;
  settlementsInChunk: typeof settlementsByChunk;
  serialize: typeof serializeCivilization;
  load: (serialized: string) => void;
}

export interface AdventureGraphicsService {
  readonly modes: typeof GRAPHICS_MODE_OPTIONS;
  getModeOptions: () => typeof GRAPHICS_MODE_OPTIONS;
  isSupportedMode: (mode: string) => mode is GraphicsMode;
}

export interface AdventureRuntime {
  readonly api: AdventureAPI;
  readonly world: AdventureWorldService;
  readonly terrain: AdventureTerrainService;
  readonly civilization: AdventureCivilizationService;
  readonly graphics: AdventureGraphicsService;
  dispose: () => void;
}

export function createAdventureRuntime(options: AdventureRuntimeOptions = {}): AdventureRuntime {
  const api = new AdventureAPI({ eventHistoryLimit: options.eventHistoryLimit });
  const core = new WorldCore(options.worldSeed ?? DEFAULT_WORLD_SEED);
  let civilization = createCivilization(core.seed);
  const subscriptions: Array<() => void> = [];

  const publishTimeEvent = (event: WorldTimeEvent) => {
    if (event.type === 'tick') {
      api.events.publish('world.time-advanced', {
        tick: event.current.tick,
        day: event.current.day,
        hour: event.current.hour,
        minuteOfDay: event.current.minuteOfDay,
        season: event.current.season,
      }, { tick: event.current.tick });
    } else if (event.type === 'day_changed') {
      api.events.publish('world.day-changed', {
        previousDay: event.previous.day,
        day: event.current.day,
        season: event.current.season,
      }, { tick: event.current.tick });
    } else if (event.type === 'season_changed') {
      api.events.publish('world.season-changed', {
        previousSeason: event.previous.season,
        season: event.current.season,
        day: event.current.day,
      }, { tick: event.current.tick });
    }
  };

  subscriptions.push(core.subscribe('tick', publishTimeEvent));
  subscriptions.push(core.subscribe('day_changed', publishTimeEvent));
  subscriptions.push(core.subscribe('season_changed', publishTimeEvent));

  const world: AdventureWorldService = {
    core,
    getClock: () => core.getClock(),
    getSimulationSpeed: () => core.getSimulationSpeed(),
    setSimulationSpeed: (speed) => core.setSimulationSpeed(speed),
    advance: (ticks = 1) => core.advance(ticks),
    getState: () => core.getState(),
    loadState: (state) => core.loadState(state),
  };

  const terrain: AdventureTerrainService = {
    sample(x, y) {
      const chunkX = Math.floor(x / 280);
      const chunkY = Math.floor(y / 280);
      return {
        landform: macroLandformAt(x, y),
        moisture: moistureAt(x, y),
        forestDensity: forestDensityAt(x, y),
        rockDensity: rockDensityAt(x, y),
        landUse: landUseAt(x, y),
        water: waterAt(x, y),
        region: regionForChunk(chunkX, chunkY),
      };
    },
  };

  const civ: AdventureCivilizationService = {
    get state() { return civilization; },
    advanceDay(day = core.getClock().day) {
      civilization = advanceCivilization(civilization, core.getClock(), day);
    },
    settlement: (state, id) => settlementById(state, id),
    settlementsInChunk: (state, chunk) => settlementsByChunk(state, chunk),
    serialize: (state) => serializeCivilization(state),
    load(serialized) {
      civilization = deserializeCivilization(serialized);
    },
  };

  const graphics: AdventureGraphicsService = {
    modes: GRAPHICS_MODE_OPTIONS,
    getModeOptions: () => GRAPHICS_MODE_OPTIONS,
    isSupportedMode: (mode): mode is GraphicsMode =>
      GRAPHICS_MODE_OPTIONS.some((option) => option.value === mode),
  };

  const unregister = [
    api.registerSystem({
      id: 'world.clock',
      domain: 'world',
      version: '1.0.0',
      description: 'Existing deterministic world clock, seeded RNG and simulation speed',
    }, world),
    api.registerSystem({
      id: 'world.terrain',
      domain: 'world',
      version: '1.0.0',
      description: 'Existing deterministic landscape, moisture, vegetation, geology and water queries',
    }, terrain),
    api.registerSystem({
      id: 'world.civilization',
      domain: 'economy',
      version: '1.0.0',
      description: 'Existing persistent settlements, production, trade and civilization simulation',
    }, civ),
    api.registerSystem({
      id: 'graphics.modes',
      domain: 'graphics',
      version: '1.0.0',
      description: 'Shared 2D, 2.5D and experimental 3D mode contract',
    }, graphics),
  ];

  return {
    api,
    world,
    terrain,
    civilization: civ,
    graphics,
    dispose() {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      unregister.reverse().forEach((remove) => remove());
    },
  };
}
