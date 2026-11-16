/**
 * BUILD 1062 — F-0 + minimal 1.1 adapter: wire the unified living-world
 * coordinator (worldSimulation.ts) into the 3D game.
 *
 * AUDIT (traced before any code):
 * 1. CLOCK — the 3D DayClock { minutes, day } (townsfolk3d.ts, persisted
 *    'ag-3d-clock-v1') ticks 1 game minute per real second and rolls the
 *    day at midnight; the 1056 wait steps it 10 minutes at a time. The
 *    coordinator takes a 2.5D WorldClockState, so this adapter maps the
 *    DayClock onto it (day/hour/minuteOfDay real; year/month/week/season
 *    derived from the day by the same 360-day rule the coordinator uses).
 * 2. FOUNDERS — Marlow, Greta, Perrin (founders.ts) chop wood to a real
 *    stockpile, eat real meals, and build a real hut. They hold no 2.5D
 *    profession, so they enter the coordinator as 'commoner' — zero
 *    production, correctly — and the production leg is a checkpointed
 *    no-op until F-1 gives them real jobs. The coordinator's production
 *    reads only archetype + seed from a townsfolk, so the adapter
 *    supplies exactly those (plus a stable id/name) by cast.
 * 3. TREES — the in-map forest is world.trees (~830 after BUILD 1061);
 *    wild trees past the edge are a hash rule, not a list, and the
 *    founders never work them from camp. The forest population is the
 *    stored list: density = live / baseline, baseline fixed at first
 *    init (live + removedTrees — the generated count). Chopping lowers
 *    the density at once; each advanced day regrows it (logistic,
 *    resources.ts) and the adapter plants the gain as REAL trees.
 *    BUILD 1063 (F-1): a tree's identity is its tile (entityIds.ts
 *    treeId) — the coordinator never needed a stored tree id, and
 *    the forest population still keys on the stored list.
 * 4. CIVILIZATION — createCivilization's 27 settlements are the 2.5D
 *    Aldoria/Thalara map. Advancing THAT in 3D would be a second,
 *    disconnected simulation — exactly what this build must not do.
 *    The adapter's civilization has ONE settlement: the real camp
 *    (population = the founders standing here, production/consumption
 *    zero — the founders' real chopping and eating already happen in
 *    the founder tick, and the coordinator must not double-count them).
 *    Unifying the two ledgers is R-1, the next foundation.
 * 5. EVENTS — the coordinator's event table is written for towns:
 *    migration adds 12-41 people, construction takes 25 wood, a market
 *    day adds 20 food. Applied literally to a 3-founder camp they
 *    would corrupt it. Events are recorded in the camp ledger and
 *    reported (E + the living-world summary), but their material
 *    effects are NOT applied to the real stockpile/food in this build.
 *    Enacting events is R-1's unification work.
 * 6. REGROWTH — a regrown tree never re-plants a chopped tile
 *    (removedTrees/removedWildTrees are excluded, the 987/989 rule).
 *    It plants on forest near-miss tiles (scatter hash in
 *    [FOREST_TREE_MAX, FOREST_REGROWTH_BAND)) — the forest thickens
 *    back toward its generated density on fresh ground. The pick is
 *    deterministic per (world, day) and spread by a day salt, so one
 *    day's planting does not cluster in a corner.
 *
 * The adapter is pure except the load/save helpers at the bottom
 * (localStorage only, like founders.ts). The view owns the ref and
 * calls advanceLivingWorldDay on the day boundary (clock timer + wait
 * step); the function is idempotent — same-day calls are no-ops — so
 * calling it from both places can never double-advance a day.
 */
import { DEFAULT_WORLD_SEED, seasonForDay, type WorldClockState } from '../worldCore';
import {
  advanceLivingWorld,
  createLivingWorldState,
  deserializeLivingWorld,
  type LivingWorldState,
} from '../worldSimulation';
import {
  recomputePrices,
  zeroResources,
  type CivilizationState,
  type Kingdom,
  type Settlement,
  type WorldEvent,
} from '../civilization';
import { paramsForResource } from '../resources';
import type { Townsperson } from '../townsfolk';
import type { DayClock } from './townsfolk3d';
import type { FounderState } from './founders';
import type { TilePoint } from '../iso/projection';
import {
  FOREST_TREE_MAX,
  forestAt,
  hash2,
  oceanAt,
  terrainAt,
  terrainKey,
  treeBlockedKeys,
  type IsoWorld,
} from '../iso/isoWorld';

/** Persisted living-world save (versioned, strict on load). */
export const LIVING_WORLD_SAVE_KEY = 'ag-3d-living-world-v1';
export const LIVING_WORLD_SAVE_VERSION = 1;
/** The camp settlement: the real 3D camp, not a 2.5D town. */
export const CAMP_SETTLEMENT_ID = 'camp';
export const CAMP_SETTLEMENT_NAME = "Founders' Camp";
/** The forest population: the in-map stored trees. */
export const FOREST_POPULATION_ID = 'forest';
/**
 * Regrowth planting band: forest tiles whose scatter hash missed the
 * tree rule but falls in [FOREST_TREE_MAX, BAND) are where the forest
 * thickens back. 0.12 doubles the eligible set (~670 tiles measured
 * on a fresh world) — far more than the ~2 trees a day ever plants.
 */
export const FOREST_REGROWTH_BAND = 0.12;
/**
 * The 3D world carries no seed of its own, so the living world runs
 * on the default world seed; the event schedule is deterministic per
 * (seed, day) and the seed persists in the save.
 */
export const LIVING_WORLD_SEED = DEFAULT_WORLD_SEED;

/** Stable numeric seed for a founder, from the name (FNV-1a). */
export function founderSeed(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The 3D DayClock as the WorldClockState the coordinator takes. */
export function dayClockToWorldClock(clock: DayClock): WorldClockState {
  const day = Math.max(1, Math.floor(clock.day));
  const minutes = ((Math.floor(clock.minutes) % 1440) + 1440) % 1440;
  return {
    tick: (day - 1) * 1440 + minutes,
    year: 1 + Math.floor((day - 1) / 360),
    month: 1 + Math.floor(((day - 1) % 360) / 30),
    week: 1 + Math.floor((day - 1) / 7),
    day,
    hour: Math.floor(minutes / 60),
    minuteOfDay: minutes,
    second: 0,
    season: seasonForDay(day),
  };
}

/**
 * A founder as the townsfolk the coordinator takes. The coordinator's
 * production reads only archetype + seed (townProduction.ts), so the
 * adapter supplies exactly those, plus a stable id/name — the cast is
 * the honest boundary, not a fake roster. BUILD 1063 (F-1): the id
 * is the founder's STORED id (founders save v4) instead of being
 * re-derived from the name on every advance — the string is the
 * same ('founder-' + name), so the coordinator's view of founder
 * identity does not change; it just stops being recomputed.
 * Founders hold no 2.5D profession yet, so they enter as 'commoner'
 * (zero production); when F-1 gives them real jobs the archetype
 * comes from the job and production flows with no re-wiring here.
 */
export function founderTownsfolk(f: FounderState): Townsperson {
  return {
    id: f.id,
    name: f.name,
    archetype: 'commoner',
    seed: founderSeed(f.name),
  } as Townsperson;
}

/**
 * The camp as a civilization settlement. Population is the founders
 * standing here; production/consumption are zero — the founders'
 * real chopping (wood to the pile) and eating (meals from the stock)
 * already happen in the founder tick, and the coordinator must not
 * invent a second production/consumption stream for the same camp.
 * Position is the real 3D camp tile (founders.ts FOUNDER_CAMP
 * 124,120), not a 2.5D field position.
 */
export function campSettlement(population: number): Settlement {
  const settlement: Settlement = {
    id: CAMP_SETTLEMENT_ID,
    kind: 'hamlet',
    name: CAMP_SETTLEMENT_NAME,
    kingdomId: 'wilderness',
    region: 'The Wilds',
    chunk: { x: 0, y: 0 },
    position: { x: 124, y: 120 },
    population: Math.max(0, Math.floor(population)),
    production: zeroResources(),
    consumption: zeroResources(),
    storage: zeroResources(),
    prices: zeroResources(),
    demand: zeroResources(),
    supply: zeroResources(),
  };
  settlement.prices = recomputePrices(settlement);
  return settlement;
}

/** The camp's kingdom: one kingdom, one settlement, no tax, no army. */
export function wildernessKingdom(population: number): Kingdom {
  return {
    id: 'wilderness',
    name: 'The Wilds',
    capital: CAMP_SETTLEMENT_ID,
    ruler: '',
    heir: '',
    territories: [CAMP_SETTLEMENT_ID],
    cities: [],
    towns: [],
    villages: [CAMP_SETTLEMENT_ID],
    population: Math.max(0, Math.floor(population)),
    treasury: 0,
    militaryStrength: 0,
    economy: 0,
    resources: [],
    relations: {},
    laws: [],
    factions: [],
    tradeRouteIds: [],
    wars: [],
    alliances: [],
    taxRate: 0,
  };
}

/**
 * The generated tree count: every stored tree plus every stored tree
 * already chopped (removedTrees records each chop since BUILD 1061;
 * the migration re-stamped only new-rule trees, so a chopped tree is
 * never double-counted). Fixed at first init — planting raises the
 * live count back toward it, never the baseline itself.
 */
export function forestBaselineTrees(world: IsoWorld): number {
  return Math.max(1, (world.trees ?? []).length + (world.removedTrees ?? []).length);
}

/** Forest density from the live stored-tree count (0..1). */
export function forestDensity(liveTrees: number, baselineTrees: number): number {
  if (!Number.isFinite(baselineTrees) || baselineTrees <= 0) return 0;
  return Math.max(0, Math.min(1, liveTrees / baselineTrees));
}

/** The adapter's persisted state: its own version + the coordinator's. */
export type LivingWorld3DState = {
  version: typeof LIVING_WORLD_SAVE_VERSION;
  /** Fixed at first init: the generated tree count (live + removed). */
  baselineTrees: number;
  /**
   * Tiles this adapter planted (a report, not a resurrection list —
   * a planted tree the player later removes stays removed).
   */
  plantedTrees: TilePoint[];
  /** The coordinator's own state (schema v1). */
  livingWorld: LivingWorldState;
};

/** Fresh adapter state from the live world: real trees, real founders, real day. */
export function freshLivingWorldState(world: IsoWorld, founders: FounderState[], clock: DayClock): LivingWorld3DState {
  const day = Math.max(1, Math.floor(clock.day));
  const baselineTrees = forestBaselineTrees(world);
  const liveTrees = (world.trees ?? []).length;
  const treeParams = paramsForResource('trees');
  const civilization: CivilizationState = {
    version: 1,
    worldSeed: LIVING_WORLD_SEED,
    kingdoms: [wildernessKingdom(founders.length)],
    settlements: [campSettlement(founders.length)],
    rulers: [],
    castles: [],
    routes: [],
    caravans: [],
    units: [],
    events: [],
    lastSimDay: day - 1,
  };
  return {
    version: LIVING_WORLD_SAVE_VERSION,
    baselineTrees,
    plantedTrees: [],
    livingWorld: createLivingWorldState(
      civilization,
      {
        [FOREST_POPULATION_ID]: {
          kind: 'trees',
          regionX: 0,
          regionY: 0,
          density: forestDensity(liveTrees, baselineTrees),
          growthRate: treeParams.growthRate,
          maxDensity: treeParams.maxDensity,
          lastSimDay: day - 1,
        },
      },
      day,
    ),
  };
}

function isTilePoint(v: unknown): v is TilePoint {
  return !!v && typeof v === 'object'
    && Number.isFinite((v as TilePoint).tx) && Number.isFinite((v as TilePoint).ty);
}

/**
 * Validate an unknown living-world save. Anything malformed, any
 * wrong version, or any coordinator state that fails its own strict
 * deserialize returns null (fresh defaults — never guess at an
 * unknown future format). Pure.
 */
export function migrateLivingWorldState(value: unknown): LivingWorld3DState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.version !== LIVING_WORLD_SAVE_VERSION) return null;
  const baselineTrees = Number(v.baselineTrees);
  if (!Number.isFinite(baselineTrees) || baselineTrees < 1) return null;
  const plantedTrees: TilePoint[] = Array.isArray(v.plantedTrees)
    ? (v.plantedTrees as unknown[])
      .filter(isTilePoint)
      .map((t) => ({ tx: Math.floor(t.tx), ty: Math.floor(t.ty) }))
      // The 3D world is 200x200; a planted tile outside it is not a
      // tile this adapter could have planted.
      .filter((t) => t.tx >= 0 && t.ty >= 0 && t.tx < 200 && t.ty < 200)
    : [];
  if (!v.livingWorld || typeof v.livingWorld !== 'object') return null;
  try {
    const livingWorld = deserializeLivingWorld(JSON.stringify(v.livingWorld));
    return {
      version: LIVING_WORLD_SAVE_VERSION,
      baselineTrees: Math.floor(baselineTrees),
      plantedTrees,
      livingWorld,
    };
  } catch {
    return null;
  }
}

/** Serialize the adapter state (the versioned format, for the round-trip asserts and the real save below). Pure. */
export function serializeLivingWorld3D(state: LivingWorld3DState): string {
  return JSON.stringify(state);
}

/** Load the living-world save (validated). Null when nothing is saved or the saved data is corrupt/unknown. I/O: localStorage only (never called by the sim or the asserts). */
export function loadLivingWorldState(): LivingWorld3DState | null {
  try {
    const raw = localStorage.getItem(LIVING_WORLD_SAVE_KEY);
    if (!raw) return null;
    return migrateLivingWorldState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist the living-world save (versioned). I/O: localStorage only. */
export function saveLivingWorldState(state: LivingWorld3DState): void {
  try {
    localStorage.setItem(LIVING_WORLD_SAVE_KEY, serializeLivingWorld3D(state));
  } catch {
    /* ignore */
  }
}

/**
 * Regrowth candidates: forest tiles whose scatter hash missed the
 * tree rule but falls in the near-miss band — the forest thickens
 * here as it regrows. Excluded: tiles with a tree standing, tiles a
 * tree was chopped from (removed — the 987/989 rule: a felled tree
 * never resurrects), water, and every blocked tile (rocks, crates,
 * stalls, huts, placements, the spawn ring, the protected camp
 * tiles — the same set the tree-density migration uses). The pick is
 * deterministic per (world, day): the day's salt orders the
 * candidates, so each day's planting lands across the forest instead
 * of clustering where a row-major scan would fill first. Pure — but
 * a full-world scan, so callers only run it when trees are owed.
 */
export function pickRegrowthTiles(world: IsoWorld, count: number, day: number): TilePoint[] {
  const wanted = Math.max(0, Math.floor(count));
  if (wanted === 0) return [];
  const existing = new Set((world.trees ?? []).map((t) => terrainKey(t.tx, t.ty)));
  const removed = new Set([...(world.removedTrees ?? []), ...(world.removedWildTrees ?? [])]);
  const blocked = treeBlockedKeys(world);
  const candidates: TilePoint[] = [];
  for (let y = 3; y < world.h - 3; y++) {
    for (let x = 3; x < world.w - 3; x++) {
      if (!forestAt(x, y)) continue;
      const h = hash2(x, y, 7);
      if (h < FOREST_TREE_MAX || h >= FOREST_REGROWTH_BAND) continue;
      const k = terrainKey(x, y);
      if (existing.has(k) || removed.has(k) || blocked.has(k)) continue;
      if (oceanAt(x, y) || terrainAt(world, x, y) === 'water') continue;
      candidates.push({ tx: x, ty: y });
    }
  }
  candidates.sort((a, b) => hash2(a.tx, a.ty, 911 + day) - hash2(b.tx, b.ty, 911 + day));
  return candidates.slice(0, wanted);
}

export type LivingWorldDayInput = {
  state: LivingWorld3DState;
  clock: DayClock;
  founders: FounderState[];
  world: IsoWorld;
};

export type LivingWorldDayResult = {
  state: LivingWorld3DState;
  /** Trees this advance planted (the caller appends them to world.trees and saves the world). */
  planted: TilePoint[];
  advancedDays: number;
  /** Coordinator events fired for the camp this advance (for the view to report). */
  events: WorldEvent[];
};

/**
 * Advance the living world to the clock's day. Idempotent: a call on
 * a day already advanced is a no-op, so the clock timer and the wait
 * step can both call it without ever double-advancing a day. Pure
 * apart from the state it returns (the input is not mutated — the
 * coordinator's own advance copies what it must, and the camp sync
 * below works on the returned state's copies).
 *
 * Order: (1) sync the camp ledger to the live camp — population is
 * the founders standing here, forest density is the trees standing
 * here (a chop since the last advance lowers it at once; lastSimDay
 * is left alone, so the coordinator regrows for every day since the
 * last advance); (2) run the coordinator; (3) convert the forest
 * density gain into real trees to plant. The coordinator's event
 * effects stay in the camp ledger — they are NOT applied to the real
 * stockpile/food (see the module header: the event table is written
 * for towns, and enacting it is R-1's unification work).
 */
export function advanceLivingWorldDay(input: LivingWorldDayInput): LivingWorldDayResult {
  const { state, clock, founders, world } = input;
  const day = Math.max(1, Math.floor(clock.day));
  if (day <= state.livingWorld.lastAdvancedDay) {
    return { state, planted: [], advancedDays: 0, events: [] };
  }
  // Defensive: a state whose coordinator schema is not v1 can never
  // advance (the load validation guarantees v1; the timer must never
  // throw every second on a corrupt state).
  if (state.livingWorld.schemaVersion !== 1) {
    return { state, planted: [], advancedDays: 0, events: [] };
  }
  // The coordinator mutates the civilization object it is handed, so
  // sync on a copy: the input state stays untouched on every path.
  const livingWorld: LivingWorldState = {
    ...state.livingWorld,
    resources: Object.fromEntries(
      Object.entries(state.livingWorld.resources).map(([id, r]) => [id, { ...r }]),
    ),
    civilization: {
      ...state.livingWorld.civilization,
      settlements: state.livingWorld.civilization.settlements.map((s) => ({
        ...s,
        storage: { ...s.storage },
        production: { ...s.production },
        consumption: { ...s.consumption },
        prices: { ...s.prices },
        demand: { ...s.demand },
        supply: { ...s.supply },
      })),
      kingdoms: state.livingWorld.civilization.kingdoms.map((k) => ({ ...k })),
      events: [...state.livingWorld.civilization.events],
    },
  };
  const camp = livingWorld.civilization.settlements.find((s) => s.id === CAMP_SETTLEMENT_ID);
  if (camp) camp.population = founders.length;
  const kingdom = livingWorld.civilization.kingdoms.find((k) => k.id === 'wilderness');
  if (kingdom) kingdom.population = founders.length;
  const forest = livingWorld.resources[FOREST_POPULATION_ID];
  const liveTrees = (world.trees ?? []).length;
  if (forest) forest.density = forestDensity(liveTrees, state.baselineTrees);
  const eventsBefore = livingWorld.civilization.events.length;
  const result = advanceLivingWorld(
    livingWorld,
    founders.map(founderTownsfolk),
    dayClockToWorldClock(clock),
    { productionSettlementId: CAMP_SETTLEMENT_ID },
  );
  const planted: TilePoint[] = [];
  const after = result.state.resources[FOREST_POPULATION_ID];
  if (after) {
    const targetLive = Math.round(after.density * state.baselineTrees);
    const toPlant = Math.max(0, targetLive - liveTrees);
    if (toPlant > 0) planted.push(...pickRegrowthTiles(world, toPlant, day));
  }
  const next: LivingWorld3DState = {
    ...state,
    plantedTrees: [...state.plantedTrees, ...planted],
    livingWorld: result.state,
  };
  return {
    state: next,
    planted,
    advancedDays: result.advancedDays,
    events: result.state.civilization.events.slice(eventsBefore),
  };
}

/** The living-world numbers the E report, the HUD, and the test hooks show. */
export type LivingWorldSummary = {
  /** The clock's current day. */
  day: number;
  /** The last day the coordinator advanced through. */
  lastAdvancedDay: number;
  forestDensityPct: number;
  liveTrees: number;
  baselineTrees: number;
  plantedTotal: number;
  campPopulation: number;
  /** The latest coordinator event for the camp, if any. */
  lastEvent: string | null;
};

export function livingWorldSummary(state: LivingWorld3DState, liveTrees: number, day: number): LivingWorldSummary {
  const camp = state.livingWorld.civilization.settlements.find((s) => s.id === CAMP_SETTLEMENT_ID);
  const events = state.livingWorld.civilization.events;
  return {
    day: Math.max(1, Math.floor(day)),
    lastAdvancedDay: state.livingWorld.lastAdvancedDay,
    forestDensityPct: Math.round(forestDensity(liveTrees, state.baselineTrees) * 100),
    liveTrees,
    baselineTrees: state.baselineTrees,
    plantedTotal: state.plantedTrees.length,
    campPopulation: camp ? camp.population : 0,
    lastEvent: events.length > 0 ? events[events.length - 1].description : null,
  };
}
