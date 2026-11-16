// BUILD 1068 (0x08) — World Simulation Control Center: the panel data
// + the sim-speed model. PURE: it reads live state and formats it; it
// does not own the sim, the registry, or the job board. The view owns
// the refs (founders, construction, registry, job board, living world,
// clock); this module turns them into the panel's numbers, and the panel
// component renders them. No save version moves — the sim speed is
// session-only (it resets to 1x on reload).

import { HUT_COST_WOOD } from './construction';
import { FARM_FOOD_THRESHOLD, HEALTH_WEAK_BELOW, MILL_GRAIN_PER_MEAL } from './food';
import { SETTLEMENT_ARRIVAL_FOOD_MIN } from './settlementGrowth';
import type { LivingWorldSummary } from './livingWorld';

// --- Sim speed -----------------------------------------------------------
// 0 = paused (the sim is frozen), 1 = normal, 5/10/50/100 = accelerated.
// The clock advances `speed` game-minutes per real second. The founder
// tick runs `founderStepsForSpeed` sub-steps per 900ms interval, CAPPED
// at MAX_FOUNDER_STEPS_PER_INTERVAL — at 50x/100x the clock runs 50x/100x
// but the founders run at most 10x, because each sub-step is a full tick
// (job discovery, A*, movement, progress) and 100 ticks per second would
// stall the frame. The panel shows BOTH rates honestly (clock rate and
// founder rate), so a capped speed is never presented as a full one.
export const SIM_SPEEDS = [0, 1, 5, 10, 50, 100] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];
export const DEFAULT_SIM_SPEED: SimSpeed = 1;
export const MAX_FOUNDER_STEPS_PER_INTERVAL = 10;

export function isSimSpeed(v: number): v is SimSpeed {
  return (SIM_SPEEDS as readonly number[]).includes(v);
}

/** Founder-tick sub-steps per 900ms interval at this speed (0 when paused). */
export function founderStepsForSpeed(speed: number): number {
  if (!isSimSpeed(speed) || speed <= 0) return 0;
  return Math.min(speed, MAX_FOUNDER_STEPS_PER_INTERVAL);
}

/** Game-minutes the clock advances per real second at this speed (0 when paused). */
export function clockMinutesPerSecond(speed: number): number {
  if (!isSimSpeed(speed) || speed <= 0) return 0;
  return speed;
}

/** The multiple of the 1x founder rate the founders actually run at (capped). */
export function founderRateForSpeed(speed: number): number {
  return founderStepsForSpeed(speed);
}

export function simSpeedLabel(speed: number): string {
  if (!isSimSpeed(speed)) return '1×';
  return speed === 0 ? 'Paused' : `${speed}×`;
}

// The sim-speed setting itself. Module-level (the Control Center owns
// it; the clock/founder timers read it). Session-only.
let simSpeed: SimSpeed = DEFAULT_SIM_SPEED;
export function getSimSpeed(): SimSpeed {
  return simSpeed;
}
export function setSimSpeed(speed: number): SimSpeed {
  simSpeed = isSimSpeed(speed) ? speed : DEFAULT_SIM_SPEED;
  return simSpeed;
}

// --- Panel data ----------------------------------------------------------

export type ControlCenterFounderRow = {
  id: string;
  name: string;
  activity: string;
  workState: string;
  health: number;
  hunger: number;
  energy: number;
  social: number;
  jobKind: string | null;
  jobTarget: string | null;
  carrying: number;
  carryingGrain: number;
  carryingStone: number;
};

export type ControlCenterSiteRow = {
  id: string;
  state: string;
  progress: number;
  spentWood: number;
};

export type ControlCenterJobs = {
  open: number;
  claimed: number;
  completed: number;
  failed: number;
  chopOpen: number;
  chopClaimed: number;
  buildOpen: number;
  buildClaimed: number;
  deliverOpen: number;
  deliverClaimed: number;
  harvestOpen: number;
  harvestClaimed: number;
  quarryOpen: number;
  quarryClaimed: number;
  lastFailedId: string | null;
  lastFailedReason: string | null;
};

export type ControlCenterInput = {
  speed: SimSpeed;
  day: number;
  minutes: number;
  founders: ControlCenterFounderRow[];
  sites: ControlCenterSiteRow[];
  hutDone: boolean;
  camp: { wood: number; food: number; grain: number; stone: number };
  player: { wood: number; stone: number; gold: number; grain: number };
  carried: { id: string; wood: number; grain: number; stone: number }[];
  deposits: { wood: number; stone: number };
  totalWoodAvailable: number;
  totalStoneAvailable: number;
  jobs: ControlCenterJobs;
  livingWorld: LivingWorldSummary | null;
  farm: { planted: number; growing: number; ready: number };
  perf: { rebuilds: number; maxStepMsMoving: number; lastBuildMs: number; lastBuildFrames: number };
};

export type ControlCenterData = {
  speed: SimSpeed;
  /** Game-minutes the clock advances per real second. */
  clockRate: number;
  /** The multiple of the 1x founder rate the founders actually run at. */
  founderRate: number;
  day: number;
  minutes: number;
  population: { count: number; founders: ControlCenterFounderRow[] };
  settlements: { id: string; name: string; population: number; buildings: ControlCenterSiteRow[] }[];
  resources: {
    campWood: number;
    campFood: number;
    campGrain: number;
    campStone: number;
    playerWood: number;
    playerStone: number;
    playerGold: number;
    playerGrain: number;
    carriedWood: number;
    carriedGrain: number;
    carriedStone: number;
    depositsWood: number;
    depositsStone: number;
    totalWoodAvailable: number;
    totalStoneAvailable: number;
  };
  shortages: string[];
  employment: ControlCenterJobs & { perFounder: { name: string; jobKind: string | null; jobTarget: string | null }[] };
  food: {
    grain: number;
    food: number;
    farmPlanted: number;
    farmGrowing: number;
    farmReady: number;
    healthAvg: number;
    weakCount: number;
    millReady: boolean;
  };
  construction: { sites: ControlCenterSiteRow[]; hutDone: boolean; totalProgress: number };
  trade: { deliverOpen: number; deliverClaimed: number; deliveriesCompleted: number; routes: string[]; note: string };
  environment: {
    forestDensityPct: number;
    liveTrees: number;
    baselineTrees: number;
    plantedTotal: number;
    lastEvent: string | null;
    lastAdvancedDay: number;
    dayLag: number;
  };
  performance: {
    rebuilds: number;
    maxStepMsMoving: number;
    lastBuildMs: number;
    lastBuildFrames: number;
    simErrors: string[];
  };
};

/** Shortages, from the live numbers — never invented. A shortage is a
 *  real condition the player (or the sim) can act on. */
export function detectShortages(input: Pick<ControlCenterInput, 'camp' | 'hutDone'>): string[] {
  const out: string[] = [];
  if (!input.hutDone && input.camp.wood < HUT_COST_WOOD) {
    out.push(`Wood short: ${input.camp.wood}/${HUT_COST_WOOD} for the hut`);
  }
  if (input.camp.food < SETTLEMENT_ARRIVAL_FOOD_MIN) {
    out.push(`Food low: ${input.camp.food} meals (a new resident needs ${SETTLEMENT_ARRIVAL_FOOD_MIN})`);
  }
  if (input.camp.food < FARM_FOOD_THRESHOLD && input.camp.grain < MILL_GRAIN_PER_MEAL) {
    out.push(`No grain to mill: ${input.camp.grain} grain, food ${input.camp.food} < ${FARM_FOOD_THRESHOLD}`);
  }
  return out;
}

export function formatControlCenterData(input: ControlCenterInput): ControlCenterData {
  const lw = input.livingWorld;
  const healthAvg =
    input.founders.length > 0
      ? Math.round(input.founders.reduce((s, f) => s + f.health, 0) / input.founders.length)
      : 0;
  const weakCount = input.founders.filter((f) => f.health < HEALTH_WEAK_BELOW).length;
  const dayLag = lw ? Math.max(0, input.day - lw.lastAdvancedDay) : 0;
  const simErrors: string[] = [];
  if (dayLag > 1) simErrors.push(`Coordinator is ${dayLag} days behind the clock`);
  if (input.jobs.lastFailedId && input.jobs.lastFailedReason) {
    simErrors.push(`Last failed job ${input.jobs.lastFailedId}: ${input.jobs.lastFailedReason}`);
  }
  return {
    speed: input.speed,
    clockRate: clockMinutesPerSecond(input.speed),
    founderRate: founderRateForSpeed(input.speed),
    day: input.day,
    minutes: input.minutes,
    population: { count: input.founders.length, founders: input.founders },
    settlements: [
      {
        id: 'camp',
        name: "Founders' Camp",
        population: lw ? lw.campPopulation : input.founders.length,
        buildings: input.sites,
      },
    ],
    resources: {
      campWood: input.camp.wood,
      campFood: input.camp.food,
      campGrain: input.camp.grain,
      campStone: input.camp.stone,
      playerWood: input.player.wood,
      playerStone: input.player.stone,
      playerGold: input.player.gold,
      playerGrain: input.player.grain,
      carriedWood: input.carried.reduce((s, c) => s + c.wood, 0),
      carriedGrain: input.carried.reduce((s, c) => s + c.grain, 0),
      carriedStone: input.carried.reduce((s, c) => s + c.stone, 0),
      depositsWood: input.deposits.wood,
      depositsStone: input.deposits.stone,
      totalWoodAvailable: input.totalWoodAvailable,
      totalStoneAvailable: input.totalStoneAvailable,
    },
    shortages: detectShortages(input),
    employment: {
      ...input.jobs,
      perFounder: input.founders.map((f) => ({ name: f.name, jobKind: f.jobKind, jobTarget: f.jobTarget })),
    },
    food: {
      grain: input.camp.grain,
      food: input.camp.food,
      farmPlanted: input.farm.planted,
      farmGrowing: input.farm.growing,
      farmReady: input.farm.ready,
      healthAvg,
      weakCount,
      millReady: input.camp.grain >= MILL_GRAIN_PER_MEAL && input.camp.food < FARM_FOOD_THRESHOLD,
    },
    construction: {
      sites: input.sites,
      hutDone: input.hutDone,
      totalProgress: input.sites.reduce((s, x) => s + x.progress, 0),
    },
    trade: {
      deliverOpen: input.jobs.deliverOpen,
      deliverClaimed: input.jobs.deliverClaimed,
      deliveriesCompleted: input.jobs.completed,
      routes: [],
      note: 'No trade routes yet — deliveries run camp ↔ trees/farms.',
    },
    environment: {
      forestDensityPct: lw ? lw.forestDensityPct : 0,
      liveTrees: lw ? lw.liveTrees : 0,
      baselineTrees: lw ? lw.baselineTrees : 0,
      plantedTotal: lw ? lw.plantedTotal : 0,
      lastEvent: lw ? lw.lastEvent : null,
      lastAdvancedDay: lw ? lw.lastAdvancedDay : 0,
      dayLag,
    },
    performance: {
      rebuilds: input.perf.rebuilds,
      maxStepMsMoving: input.perf.maxStepMsMoving,
      lastBuildMs: input.perf.lastBuildMs,
      lastBuildFrames: input.perf.lastBuildFrames,
      simErrors,
    },
  };
}
