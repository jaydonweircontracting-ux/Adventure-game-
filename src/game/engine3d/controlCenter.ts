// BUILD 1068 (0x08) — World Simulation Control Center: the panel data
// + the sim-speed model. PURE: it reads live state and formats it; it
// does not own the sim, the registry, or the job board. The view owns
// the refs (founders, construction, registry, job board, living world,
// clock); this module turns them into the panel's numbers, and the panel
// component renders them. No save version moves — the sim speed is
// session-only (it resets to 1x on reload).

import { HUT_COST_WOOD } from './construction';
import { FARM_FOOD_THRESHOLD, HEALTH_WEAK_BELOW } from './food';
import { BAKE_FLOUR_PER_MEAL, GRIND_GRAIN_PER_BATCH } from './foodChain';
import { SMELT_ORE_PER_BATCH, SMELT_COAL_PER_BATCH, SMITH_INGOT_PER_TOOL, SAW_WOOD_PER_BATCH, CARPENTER_TIMBER_PER_BATCH } from './metalChain';
import type { MarketStallLine } from './housing';
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
  /** BUILD 1098 (0x21): the founder's profession label ('Farmer',
   *  'Lumberjack', …; null means no profession yet — the panel
   *  shows 'Commoner'). Optional: old callers pass none. */
  profession?: string | null;
  carrying: number;
  carryingGrain: number;
  carryingStone: number;
  /** BUILD 1089: the iron a founder carries from the mine. */
  carryingOre: number;
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
  camp: { wood: number; food: number; grain: number; flour: number; stone: number };
  /** BUILD 1094: the mill + the bakery states (optional — the old
   *  callers pass none and the panel shows 'none'). */
  foodChain?: { mill: { state: string; progress: number }; bakery: { state: string; progress: number } };
  /** BUILD 1095: the chain's five building states (optional — the
   *  old callers pass none and the panel shows 'none'). */
  metalChain?: { smelter: { state: string; progress: number }; blacksmith: { state: string; progress: number }; sawmill: { state: string; progress: number }; carpenter: { state: string; progress: number }; workshop: { state: string; progress: number }; workshopStall: string | null };
  // BUILD 1096 (3.5): the housing — the capacity (beds free/total),
  // the inn (state + progress + the food in its store), and the
  // market-stall listing (the settlement store, read-only).
  housing?: { capacity: number; bedsFree: number; inn: { state: string; progress: number; food: number }; stall: MarketStallLine[] };
  /** BUILD 1087: the storehouse (optional — the old callers pass
   *  none and the panel shows the site line). */
  storehouse?: { state: string; progress: number; wood: number; stone: number; iron: number; coal: number; ingots: number; tools: number; timber: number; furniture: number };
  player: { wood: number; stone: number; gold: number; grain: number };
  carried: { id: string; wood: number; grain: number; stone: number; iron: number }[];
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
    /** BUILD 1094: the flour in the granary (0 when the mill
     *  has never ground). */
    campFlour: number;
    campStone: number;
    playerWood: number;
    playerStone: number;
    playerGold: number;
    playerGrain: number;
    carriedWood: number;
    carriedGrain: number;
    carriedStone: number;
    /** BUILD 1089: the iron founders carry from the mine. */
    carriedIron: number;
    /** BUILD 1087: the storehouse store (0s when it never held any). */
    storehouseWood: number;
    storehouseStone: number;
    /** BUILD 1089: the storehouse's iron (0 when it never held any). */
    storehouseIron: number;
    /** BUILD 1095: the storehouse's chain counts (0 when it never
     *  held any). */
    storehouseCoal: number;
    storehouseIngots: number;
    storehouseTools: number;
    storehouseTimber: number;
    storehouseFurniture: number;
    /** BUILD 1087: the storehouse label ('—' / '3/6' / 'done'). */
    storehouseLabel: string;
    depositsWood: number;
    depositsStone: number;
    totalWoodAvailable: number;
    totalStoneAvailable: number;
  };
  shortages: string[];
  employment: ControlCenterJobs & { perFounder: { name: string; jobKind: string | null; jobTarget: string | null }[] };
  food: {
    grain: number;
    /** BUILD 1094: the flour in the granary. */
    flour: number;
    food: number;
    farmPlanted: number;
    farmGrowing: number;
    farmReady: number;
    healthAvg: number;
    weakCount: number;
    millReady: boolean;
    /** BUILD 1094: the mill / bakery states ('none' / 'building' /
     *  'done') + the bakery's own readiness. */
    millState: string;
    bakeryState: string;
    bakeryReady: boolean;
  };
  chain: {
    ingots: number;
    tools: number;
    timber: number;
    furniture: number;
    coal: number;
    /** BUILD 1095: the chain's five building states ('none' /
     *  'building' / 'done') + the workshop's stall reason (null
     *  when it is not stalled) + each building's readiness. */
    smelterState: string;
    blacksmithState: string;
    sawmillState: string;
    carpenterState: string;
    workshopState: string;
    workshopStall: string | null;
    smelterReady: boolean;
    blacksmithReady: boolean;
    sawmillReady: boolean;
    carpenterReady: boolean;
  };
  /** BUILD 1096: the housing — the capacity (beds free/total),
   *  the inn (state + the food in its store + readiness), and the
   *  market-stall listing (the settlement store, read-only). */
  housing: { capacity: number; bedsFree: number; innState: string; innFood: number; innReady: boolean; stall: MarketStallLine[] };
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
export function detectShortages(input: Pick<ControlCenterInput, 'camp' | 'hutDone' | 'foodChain' | 'metalChain' | 'storehouse' | 'housing'>): string[] {
  const out: string[] = [];
  if (!input.hutDone && input.camp.wood < HUT_COST_WOOD) {
    out.push(`Wood short: ${input.camp.wood}/${HUT_COST_WOOD} for the hut`);
  }
  if (input.camp.food < SETTLEMENT_ARRIVAL_FOOD_MIN) {
    out.push(`Food low: ${input.camp.food} meals (a new resident needs ${SETTLEMENT_ARRIVAL_FOOD_MIN})`);
  }
  // BUILD 1094: the chain names its broken link — a mill that was
  // never built, a mill with no grain, a bakery that was never
  // built, a bakery with no flour. A mill with no worker and no
  // grain produces nothing, and the panel says so.
  if (input.camp.food < FARM_FOOD_THRESHOLD) {
    const millState = input.foodChain?.mill.state ?? 'none';
    const bakeryState = input.foodChain?.bakery.state ?? 'none';
    if (millState !== 'done') {
      out.push(`Mill not built: food ${input.camp.food} < ${FARM_FOOD_THRESHOLD}, mill ${millState}`);
    } else if (input.camp.grain < GRIND_GRAIN_PER_BATCH) {
      out.push(`No grain to mill: ${input.camp.grain} grain, food ${input.camp.food} < ${FARM_FOOD_THRESHOLD}`);
    } else if (bakeryState !== 'done') {
      out.push(`Bakery not built: ${input.camp.flour} flour waiting, bakery ${bakeryState}`);
    } else if (input.camp.flour < BAKE_FLOUR_PER_MEAL) {
      out.push(`No flour to bake: ${input.camp.flour} flour, food ${input.camp.food} < ${FARM_FOOD_THRESHOLD}`);
    }
  }
  // BUILD 1095: the workshop stall — the first hard dependency.
  // Once the bakery is done the workshop is the settlement's next
  // building; when its next step needs a tool and the store holds
  // none, the shortage names the missing input (the stall is
  // visible in the panel's shortages line, not just the chain
  // section).
  const workshopState = input.metalChain?.workshop.state ?? 'none';
  const bakeryDone = (input.foodChain?.bakery.state ?? 'none') === 'done';
  if (workshopState !== 'done' && bakeryDone && input.metalChain?.workshopStall) {
    out.push(input.metalChain.workshopStall);
  }
  // BUILD 1096: no free bed — a new resident cannot arrive even
  // when food and day allow it, and the panel says so (the housing
  // check is the arrival gate, settlementGrowth.canArrive).
  if (input.housing && input.housing.bedsFree === 0 && input.housing.capacity > 0) {
    out.push(`No free bed: ${input.housing.capacity}/${input.housing.capacity} beds full — a new resident cannot arrive`);
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
      campFlour: input.camp.flour,
      campStone: input.camp.stone,
      playerWood: input.player.wood,
      playerStone: input.player.stone,
      playerGold: input.player.gold,
      playerGrain: input.player.grain,
      carriedWood: input.carried.reduce((s, c) => s + c.wood, 0),
      carriedGrain: input.carried.reduce((s, c) => s + c.grain, 0),
      carriedStone: input.carried.reduce((s, c) => s + c.stone, 0),
      carriedIron: input.carried.reduce((s, c) => s + (c.iron ?? 0), 0),
      storehouseWood: input.storehouse ? input.storehouse.wood : 0,
      storehouseStone: input.storehouse ? input.storehouse.stone : 0,
      storehouseIron: input.storehouse ? (input.storehouse.iron ?? 0) : 0,
      storehouseCoal: input.storehouse ? (input.storehouse.coal ?? 0) : 0,
      storehouseIngots: input.storehouse ? (input.storehouse.ingots ?? 0) : 0,
      storehouseTools: input.storehouse ? (input.storehouse.tools ?? 0) : 0,
      storehouseTimber: input.storehouse ? (input.storehouse.timber ?? 0) : 0,
      storehouseFurniture: input.storehouse ? (input.storehouse.furniture ?? 0) : 0,
      storehouseLabel: input.storehouse ? (input.storehouse.state === 'done' ? 'done' : input.storehouse.state === 'building' ? input.storehouse.progress + '/6' : '—') : '—',
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
      flour: input.camp.flour,
      food: input.camp.food,
      farmPlanted: input.farm.planted,
      farmGrowing: input.farm.growing,
      farmReady: input.farm.ready,
      healthAvg,
      weakCount,
      // BUILD 1094: the mill is ready when it is DONE and holds
      // grain to grind (2 grain a batch) while the camp is short
      // of food — a mill with no grain is not ready. The bakery
      // is ready when it is DONE and holds flour to bake (2 flour
      // a meal) while the camp is short of food.
      millReady: (input.foodChain?.mill.state ?? 'none') === 'done' && input.camp.grain >= GRIND_GRAIN_PER_BATCH && input.camp.food < FARM_FOOD_THRESHOLD,
      millState: input.foodChain?.mill.state ?? 'none',
      bakeryState: input.foodChain?.bakery.state ?? 'none',
      bakeryReady: (input.foodChain?.bakery.state ?? 'none') === 'done' && input.camp.flour >= BAKE_FLOUR_PER_MEAL && input.camp.food < FARM_FOOD_THRESHOLD,
    },
    chain: {
      ingots: input.storehouse?.ingots ?? 0,
      tools: input.storehouse?.tools ?? 0,
      timber: input.storehouse?.timber ?? 0,
      furniture: input.storehouse?.furniture ?? 0,
      coal: input.storehouse?.coal ?? 0,
      smelterState: input.metalChain?.smelter.state ?? 'none',
      blacksmithState: input.metalChain?.blacksmith.state ?? 'none',
      sawmillState: input.metalChain?.sawmill.state ?? 'none',
      carpenterState: input.metalChain?.carpenter.state ?? 'none',
      workshopState: input.metalChain?.workshop.state ?? 'none',
      workshopStall: input.metalChain?.workshopStall ?? null,
      // BUILD 1095: a chain building is ready when it is DONE and
      // holds its input — a smelter with no ore or no coal is not
      // ready, and the panel says so.
      smelterReady: (input.metalChain?.smelter.state ?? 'none') === 'done' && (input.storehouse?.iron ?? 0) >= SMELT_ORE_PER_BATCH && (input.storehouse?.coal ?? 0) >= SMELT_COAL_PER_BATCH,
      blacksmithReady: (input.metalChain?.blacksmith.state ?? 'none') === 'done' && (input.storehouse?.ingots ?? 0) >= SMITH_INGOT_PER_TOOL,
      sawmillReady: (input.metalChain?.sawmill.state ?? 'none') === 'done' && (input.storehouse?.wood ?? 0) >= SAW_WOOD_PER_BATCH,
      carpenterReady: (input.metalChain?.carpenter.state ?? 'none') === 'done' && (input.storehouse?.timber ?? 0) >= CARPENTER_TIMBER_PER_BATCH,
    },
    housing: {
      capacity: input.housing?.capacity ?? 0,
      bedsFree: input.housing?.bedsFree ?? 0,
      innState: input.housing?.inn.state ?? 'none',
      innFood: input.housing?.inn.food ?? 0,
      // BUILD 1096: the inn is ready when it is DONE and holds food
      // for a traveler — a finished inn with an empty store is not
      // ready, and the panel says so.
      innReady: (input.housing?.inn.state ?? 'none') === 'done' && (input.housing?.inn.food ?? 0) > 0,
      stall: input.housing?.stall ?? [],
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
