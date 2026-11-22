/**
 * Settlement driver — the 24-simulated-hour test's engine (NEURON HEX 0x09).
 *
 * It mirrors the view's runFounderTick (Engine3DWorldView.tsx) step by step
 * using the SAME pure functions — decayFounderNeeds, chooseScoredActivity,
 * discoverJobs / claimJob / claimNearestJob / claimDeliverJobFor,
 * fellTreeToCarrier, harvestFarmTileToCarrier, deliverFounderCarryToStore,
 * spendBuildStepFromRegistry, grindGrainToFlour / bakeFlourToMeals
 * (the 1094 food chain — the old direct millGrainToMeals is removed),
 * arrivalCheck, stepFounderMove
 * — it does NOT re-implement them. The view's React refs, timers, setMessage
 * and saveWorld are replaced by plain state + a ledger that records the
 * actual flows (wood chopped/delivered/spent, grain harvested/delivered,
 * meals milled/eaten, jobs completed/failed by kind, huts finished,
 * arrivals, starved ticks, minimum health).
 *
 * Time: one founder tick is 900ms of real time = 0.9 game-minutes at 1x
 * (the clock runs 1 game-min per real second). A 24-in-game-hour run is
 * 1,440 game-minutes = 1,600 ticks, driven directly — no real timers, no
 * waiting. Deterministic: same world + same start = same ledger (the
 * pathfinder, the scorer and the job board are all deterministic; the
 * only input is the world, which defaultWorld fixes).
 *
 * Fidelity note: the driver reproduces the view's mechanics faithfully,
 * including its known rough edges — a completed hut whose rect is
 * occupied retries its placement next cycle. BUILD 1079 (0x0E): the
 * delivery strand is FIXED — the delivery runs by workState, not
 * activity, so a founder who flips to eat/rest/sleep while carrying
 * still delivers on arrival (the driver mirrors the view's fix).
 */
import {
  FOUNDER_CAMP,
  FOUNDER_CAMP_CENTRE,
  FOUNDER_EAT_TILE,
  FOUNDER_NAMES,
  FOUNDER_WORK_RADIUS,
  FOUNDER_CHOP_TICKS,
  FOUNDER_HARVEST_TICKS,
  FOUNDER_MINE_TICKS,
  decayFounderNeeds,
  founderAbsMinutes,
  defaultFounderState,
  founderDestination,
  treeWorkTile,
  stepFounderMove,
  emptyFounderPath,
  spawnResident,
  NEWCOMER_NAME,
  NEWCOMER_SLEEP_TILE,
  campWoodInRegistry,
  campFoodInRegistry,
  carryAnimalYieldToCarrier,
  campStoneInRegistry,
  eatFounderMealFromRegistry,
  fellTreeToCarrier,
  harvestFarmTileToCarrier,
  seedCampStore,
  seedCarrierStore,
  foundersSaveOf,
  foundersStateOf,
  serializeFoundersSave,
  migrateFoundersSave,
  type FounderState,
  type FounderPathState,
} from './founders';
import {
  createJobBoard,
  discoverJobs,
  claimJob,
  claimFirstJob,
  claimNearestJob,
  claimNearestMineJobForMineral,
  nearestOpenJob,
  openJobs,
  claimDeliverJobFor,
  releaseJob,
  completeJob,
  failJob,
  blockQuarryTarget,
  jobForFounder,
  buildJobIdFor,
  buildJobClaimedBy,
  millJobIdFor,
  bakeJobIdFor,
  smeltJobIdFor,
  smithJobIdFor,
  sawJobIdFor,
  carpenterJobIdFor,
  fishJobIdFor,
  huntJobIdFor,
  shepherdJobIdFor,
  scorerTreeDist,
  scorerQuarryDist,
  jobSummary,
  type JobBoard,
  type JobKind,
} from './jobs';
import { planPathNpc } from './townsfolk3d';
import {
  HUT_SITES,
  HUT_APPROACH,
  HUT_KIND,
  HUT_WOOD_PER_STEP,
  HUT_TICKS_PER_STEP,
  freshConstruction,
  canBuild,
  hasReadyHutSite,
  spendBuildStepFromRegistry,
  finishConstruction,
  reconcileConstruction,
  reconcileExtraSites,
  hasUnfinishedSite,
  foundingHutsDone,
  housingCapacity,
  nearestUnfinishedSite,
  hutSiteById,
  hutSiteIndexById,
  hutPlacementExists,
  insideHutRect,
  type ConstructionState,
} from './construction';
import { FARM_FOOD_THRESHOLD, campGrainInRegistry } from './food';
import { FARM_VILLAGER_RADIUS, readyFarmTiles, seedCampFarmPlot, waterFarmTile, waterableFarmTiles } from './farm';
import { stampRivers } from './rivers';
import { stampLandforms } from './landforms';
import { forestBaselineTrees, forestDensity, growthFactorAt, soilFactorAt } from './livingWorld';
import { FOUNDER_PLANT_TICKS, granaryFishInRegistry, granaryFlourInRegistry, granaryMeatInRegistry, plantFarmTile } from './granary';
import { advanceEcosystemDay, applyMaturedTrees, recordAnimalKill, stampAnimalPopulations } from './ecosystems';
import {
  FISH_TICKS_PER_SHIFT, FISH_YIELD, HUNT_GIVE_UP_TICKS, HUNT_TICKS_PER_SHIFT, HUNT_YIELD,
  PEN_APPROACH, PEN_FEED_JOB_ID, PEN_RECT, PEN_SHEAR_JOB_ID, PEN_SITE_ID, PEN_START_DAY, PEN_WOOD_PER_STEP, PEN_WORK_STEPS,
  canBuildPen, canStartPen, feedPen, finishPen, freshPen, penDayAdvance,
  penFeedNeeded, penShearReady,
  preyKindForTargetId, shearPen, spendPenStepFromRegistry, stockPenFromWild,
  type PenState,
} from './animalHusbandry';
import { arrivalCheck, RESIDENT_ENTRY_TILE } from './settlementGrowth';
import { newcomerEligibility, averageSettlerAffinity, newcomerEntryTile } from './population';
import { chooseScoredActivity, UTILITY_HUNT_FOOD_THRESHOLD, UTILITY_PILE_FULL } from './utility';
import { assignProfessions, professionSlotsFor, type ProfessionNeed } from './professions';
import {
  STOREHOUSE_APPROACH, STOREHOUSE_HUT_SITE, STOREHOUSE_KIND, STOREHOUSE_SITE_ID,
  STOREHOUSE_WOOD_PER_STEP, STOREHOUSE_STONE_PER_STEP,
  canStartStorehouse, canBuildStorehouse, spendStorehouseStepFromRegistry, finishStorehouse,
  reconcileStorehouse, storehouseWoodInRegistry, storehouseStoneInRegistry, quarryClaimRadiusForStorehouse,
  deliverFounderCarryToStore, fetchBuildWood, spendBuildStepFromCarried, distToActiveBuildSite,
  STOREHOUSE_STORE_ID, freshStorehouse, seedStorehouseStore, storehouseLeatherInRegistry, storehouseOreInRegistry, storehouseWoolInRegistry, type StorehouseState,
} from './storehouse';
import { QUARRY_STONE_TARGET, QUARRY_CLAIM_RADIUS, quarryWorkTile, quarryTargetFromJob, mineStoneToCarrier } from './quarry';
import {
  BAKERY_APPROACH, BAKERY_CENTRE, BAKERY_SITE_ID, BAKE_TICKS_PER_SHIFT,
  MILL_APPROACH, MILL_CENTRE, MILL_SITE_ID, MILL_TICKS_PER_SHIFT, MILL_WOOD_PER_STEP, BAKERY_WOOD_PER_STEP,
  bakeFlourToMeals, canBuildBakery, canBuildMill, canStartBakery, canStartMill,
  finishBakery, finishMill, foodChainFlourInRegistry, freshFoodChain, grindGrainToFlour,
  reconcileFoodChain, spendBakeryStepFromRegistry, spendMillStepFromRegistry,
  type FoodChainState,
} from './foodChain';
import {
  SMELTER_APPROACH, SMELTER_CENTRE, SMELTER_SITE_ID, SMELT_TICKS_PER_SHIFT,
  BLACKSMITH_APPROACH, BLACKSMITH_CENTRE, BLACKSMITH_SITE_ID, SMITH_TICKS_PER_SHIFT,
  SAWMILL_APPROACH, SAWMILL_CENTRE, SAWMILL_SITE_ID, SAW_TICKS_PER_SHIFT,
  CARPENTER_APPROACH, CARPENTER_CENTRE, CARPENTER_SITE_ID, CARPENTER_TICKS_PER_SHIFT,
  WORKSHOP_CENTRE, WORKSHOP_SITE_ID,
  SMELTER_WOOD_PER_STEP, BLACKSMITH_WOOD_PER_STEP, SAWMILL_WOOD_PER_STEP, CARPENTER_WOOD_PER_STEP, WORKSHOP_WOOD_PER_STEP,
  smeltOreToIngots, smithIngotsToTools, sawWoodToTimber, carpenterTimberToFurniture,
  canBuildSmelter, canBuildBlacksmith, canBuildSawmill, canBuildCarpenter, canBuildWorkshop,
  canStartSmelter, canStartBlacksmith, canStartSawmill, canStartCarpenter, canStartWorkshop,
  finishSmelter, finishBlacksmith, finishSawmill, finishCarpenter, finishWorkshop,
  freshMetalChain, reconcileMetalChain,
  metalChainCoalInRegistry, metalChainIngotsInRegistry, metalChainToolsInRegistry, metalChainTimberInRegistry, metalChainFurnitureInRegistry,
  spendSmelterStepFromRegistry, spendBlacksmithStepFromRegistry, spendSawmillStepFromRegistry, spendCarpenterStepFromRegistry, spendWorkshopStepFromRegistry,
  type MetalChainState,
} from './metalChain';
import {
  INN_APPROACH, INN_CENTRE, INN_REST_TILES, INN_SITE_ID, INN_WOOD_PER_STEP, INN_REST_TICKS,
  buildInnStep, canBuildInn, canStartInn, eatInnMeal, finishInn, freshHousing, innFoodInRegistry,
  innRestTileFor, insideInnRect, isInnUsable, reconcileHousing, seedInnStore, topUpInnStore,
  type HousingState,
} from './housing';
import { stampMineralDeposits } from './geology';
import { existingBuildingRects, planFor, planNeedsReplan, sitePlanFromSave, type SettlementNeedInput, type SettlementPlan } from './sitePlan';
import {
  MINE_START_DAY, MINE_TICKS_PER_SHIFT, MINE_IRON_TARGET, MINE_COAL_TARGET, QUARRY_CREW_SIZE,
  designateMine, designateQuarry, designateLumber, reconcileMines, mineOreToCarrier,
  openMineSite, openMineSites, founderMiningMineral, isQuarrySiteRock, quarrySiteRocks, freshMineState, validateMineState, type MineState,
} from './mines';
import {
  BRIDGE_START_DAY, BRIDGE_WOOD_PER_STEP, WELL_START_DAY,
  bridgeBuildContext, bridgeSiteById, canBuildBridge, canStartBridge, detectBridgeSite,
  finishBridge, freshPathState, reconcileBridges, recordTraffic, scanForBridgeSites, seedWell,
  spendBridgeStepFromRegistry, wellApproachFor, wellTile,
  type BridgeSite, type PathState,
} from './paths';
import { closestFounder, recordSharedEvent, restTileFor, addSocialKey } from './memory';
import { CAMP_STORE_ID, createRegistry, GRANARY_STORE_ID, INN_STORE_ID, transfer, withdrawFrom, type ResourceRegistry } from './resourceRegistry';
import { validatePlacement, addPlacement, placedFenceTiles } from './placements';
import { npcWalkable } from './townsfolk3d';
import type { IsoWorld } from '../iso/isoWorld';

/** One founder tick = 900ms of real time = 0.9 game-minutes at 1x. */
export const SETTLEMENT_TICK_MIN = 0.9;
/** Game-minutes in a day. */
export const SETTLEMENT_DAY_MINUTES = 1440;
/** The run starts day 1, 08:00 — the same default as the 3D clock. */
export const SETTLEMENT_START_ABS = founderAbsMinutes(1, 480);

/** The run's recorded flows — the numbers the test asserts on. */
export type SettlementLedger = {
  ticks: number;
  woodChopped: number;
  woodDelivered: number;
  woodSpent: number;
  grainHarvested: number;
  grainDelivered: number;
  /** Stone mined from deposits/rocks (the quarry loop, BUILD 1086). */
  stoneMined: number;
  /** Stone delivered to the camp stockpile. */
  stoneDelivered: number;
  /** Flour ground by the mill (BUILD 1094 — the chain replaces
   *  the old direct mill, so mealsMilled/grainMilled are gone). */
  flourMilled: number;
  /** Grain ground into flour (BUILD 1094). */
  grainGround: number;
  /** Meals baked by the bakery (BUILD 1094). */
  mealsBaked: number;
  /** Flour baked into meals (BUILD 1094). */
  flourBaked: number;
  mealsEaten: number;
  jobsCompleted: Record<JobKind, number>;
  jobsFailed: Record<string, number>;
  hutsCompleted: number;
  placementRetries: number;
  /** Wood delivered into the storehouse store (BUILD 1087). */
  storehouseWoodDelivered: number;
  /** Stone delivered into the storehouse store (BUILD 1087). */
  storehouseStoneDelivered: number;
  /** Wood spent on the storehouse's own construction (BUILD 1087). */
  storehouseWoodSpent: number;
  /** Stone spent on the storehouse's own construction (BUILD 1087). */
  storehouseStoneSpent: number;
  /** Wood fetched from the storehouse for hut steps (BUILD 1087). */
  buildWoodFetched: number;
  /** Hut steps spent from carried (fetched) wood (BUILD 1087). */
  carriedStepsSpent: number;
  /** Storehouses completed (0/1 in a run — BUILD 1087). */
  storehouseCompleted: number;
  /** Dirt path tiles laid by founder traffic (BUILD 1088). */
  pathTilesPlaced: number;
  /** Buckets drawn from the well (BUILD 1088). */
  waterDrawn: number;
  /** Farm tiles watered (BUILD 1088). */
  tilesWatered: number;
  /** Buckets spilled — carried water with nowhere to go (BUILD 1088). */
  waterSpilled: number;
  /** Bridges completed (BUILD 1088). */
  bridgesCompleted: number;
  /** Wood spent on bridge steps (BUILD 1088). */
  bridgeWoodSpent: number;
  /** Iron mined by the mine shift (BUILD 1089). */
  oreMined: number;
  /** Farm tiles the founders planted (BUILD 1090). */
  plantsPlanted: number;
  /** Iron delivered to the storehouse (BUILD 1089). */
  oreDelivered: number;
  /** Coal delivered to the storehouse (BUILD 1095). */
  coalDelivered: number;
  /** Mine shifts completed (BUILD 1089). */
  mineShifts: number;
  /** Stone mined at the designated quarry site (BUILD 1089). */
  quarrySiteStone: number;
  /** Lumber trees felled at the designated site (BUILD 1089). */
  lumberTreesFelled: number;
  /** Iron delivered into the storehouse store (BUILD 1089). */
  storehouseOreDelivered: number;
  /** Wood spent on the mill's construction (BUILD 1094). */
  millWoodSpent: number;
  /** Wood spent on the bakery's construction (BUILD 1094). */
  bakeryWoodSpent: number;
  /** Mills completed (0/1 in a run — BUILD 1094). */
  millsCompleted: number;
  /** Bakeries completed (0/1 in a run — BUILD 1094). */
  bakeriesCompleted: number;
  /** Ingots smelted (BUILD 1095). */
  ingotsSmelted: number;
  /** Ore smelted into ingots (BUILD 1095). */
  oreSmelted: number;
  /** Coal burned smelting (BUILD 1095). */
  coalBurned: number;
  /** Tools smithed (BUILD 1095). */
  toolsSmithed: number;
  /** Ingots smithed into tools (BUILD 1095). */
  ingotsSmithed: number;
  /** Timber sawn (BUILD 1095). */
  timberSawn: number;
  /** Wood sawn into timber (BUILD 1095). */
  woodSawn: number;
  /** Furniture made (BUILD 1095). */
  furnitureMade: number;
  /** Timber carpentered into furniture (BUILD 1095). */
  timberCarpentered: number;
  /** Smelters completed (BUILD 1095). */
  smeltersCompleted: number;
  /** Blacksmiths completed (BUILD 1095). */
  blacksmithsCompleted: number;
  /** Sawmills completed (BUILD 1095). */
  sawmillsCompleted: number;
  /** Carpenters completed (BUILD 1095). */
  carpentersCompleted: number;
  /** Workshops completed (BUILD 1095). */
  workshopsCompleted: number;
  /** Wood spent on the smelter's construction (BUILD 1095). */
  smelterWoodSpent: number;
  /** Wood spent on the blacksmith's construction (BUILD 1095). */
  blacksmithWoodSpent: number;
  /** Wood spent on the sawmill's construction (BUILD 1095). */
  sawmillWoodSpent: number;
  /** Wood spent on the carpenter's construction (BUILD 1095). */
  carpenterWoodSpent: number;
  /** Wood spent on the workshop's construction (BUILD 1095). */
  workshopWoodSpent: number;
  /** Tools spent on the workshop's construction (BUILD 1095). */
  workshopToolsSpent: number;
  /** Wood spent on the inn's construction (BUILD 1096). */
  innWoodSpent: number;
  /** Inns completed (0/1 in a run — BUILD 1096). */
  innsCompleted: number;
  /** Travelers who rested at the inn (BUILD 1096). */
  innRests: number;
  /** Meals eaten from the inn store (BUILD 1096). */
  innMeals: number;
  /** Coal delivered into the storehouse store (BUILD 1095). */
  storehouseCoalDelivered: number;
  /** Meat delivered to the granary (BUILD 1102). */
  meatDelivered: number;
  /** Fish delivered to the granary (BUILD 1102). */
  fishDelivered: number;
  /** Leather delivered to the storehouse (BUILD 1102). */
  leatherDelivered: number;
  /** Wool delivered to the storehouse (BUILD 1102). */
  woolDelivered: number;
  /** Fish caught by the fisher (BUILD 1102). */
  fishCaught: number;
  /** Wool sheared from the pen flock (BUILD 1102). */
  woolSheared: number;
  /** Lambs born in the pen (BUILD 1102). */
  sheepBorn: number;
  /** Wood spent on the pen's construction (BUILD 1102). */
  penWoodSpent: number;
  /** Pens completed (0/1 in a run — BUILD 1102). */
  pensCompleted: number;
  arrivals: string[];
  /** Founder-ticks spent at hunger 0 (starving). */
  starvedTicks: number;
  /** Lowest health any founder reached. */
  minHealth: number;
};

export function freshSettlementLedger(): SettlementLedger {
  return {
    ticks: 0,
    woodChopped: 0,
    woodDelivered: 0,
    woodSpent: 0,
    grainHarvested: 0,
    grainDelivered: 0,
    flourMilled: 0,
    grainGround: 0,
    mealsBaked: 0,
    flourBaked: 0,
    mealsEaten: 0,
    jobsCompleted: { chop: 0, build: 0, deliver: 0, harvest: 0, quarry: 0, water: 0, mine: 0, lumber: 0, plant: 0, mill: 0, bake: 0, smelt: 0, smith: 0, saw: 0, carpenter: 0, hunt: 0, fish: 0, shepherd: 0 },
    stoneMined: 0,
    stoneDelivered: 0,
    jobsFailed: {},
    hutsCompleted: 0,
    placementRetries: 0,
    storehouseWoodDelivered: 0,
    storehouseStoneDelivered: 0,
    storehouseWoodSpent: 0,
    storehouseStoneSpent: 0,
    buildWoodFetched: 0,
    carriedStepsSpent: 0,
    storehouseCompleted: 0,
    pathTilesPlaced: 0,
    waterDrawn: 0,
    tilesWatered: 0,
    waterSpilled: 0,
    bridgesCompleted: 0,
    bridgeWoodSpent: 0,
    oreMined: 0,
    plantsPlanted: 0,
    oreDelivered: 0,
    coalDelivered: 0,
    mineShifts: 0,
    quarrySiteStone: 0,
    lumberTreesFelled: 0,
    storehouseOreDelivered: 0,
    millWoodSpent: 0,
    bakeryWoodSpent: 0,
    millsCompleted: 0,
    bakeriesCompleted: 0,
    ingotsSmelted: 0,
    oreSmelted: 0,
    coalBurned: 0,
    toolsSmithed: 0,
    ingotsSmithed: 0,
    timberSawn: 0,
    woodSawn: 0,
    furnitureMade: 0,
    timberCarpentered: 0,
    smeltersCompleted: 0,
    blacksmithsCompleted: 0,
    sawmillsCompleted: 0,
    carpentersCompleted: 0,
    workshopsCompleted: 0,
    smelterWoodSpent: 0,
    blacksmithWoodSpent: 0,
    sawmillWoodSpent: 0,
    carpenterWoodSpent: 0,
    workshopWoodSpent: 0,
    workshopToolsSpent: 0,
    innWoodSpent: 0,
    innsCompleted: 0,
    innRests: 0,
    innMeals: 0,
    storehouseCoalDelivered: 0,
    meatDelivered: 0,
    fishDelivered: 0,
    leatherDelivered: 0,
    woolDelivered: 0,
    fishCaught: 0,
    woolSheared: 0,
    sheepBorn: 0,
    penWoodSpent: 0,
    pensCompleted: 0,
    arrivals: [],
    starvedTicks: 0,
    minHealth: 100,
  };
}

/** The settlement under test — plain state, no React, no timers. */
export type SettlementSim = {
  world: IsoWorld;
  founders: FounderState[];
  registry: ResourceRegistry;
  board: JobBoard;
  construction: ConstructionState;
  /** The storehouse state (BUILD 1087 — saved in the founders
   *  save, v9, and round-tripped by serialize/restore). */
  storehouse: StorehouseState;
  /** The food chain (BUILD 1094 — the mill + the bakery, saved in
   *  the founders save, v12, and round-tripped by serialize/restore). */
  foodChain: FoodChainState;
  /** The metal + timber chain (BUILD 1095 — the smelter, the
   *  blacksmith, the sawmill, the carpenter, the workshop, saved
   *  in the founders save, v12, and round-tripped by
   *  serialize/restore). */
  metalChain: MetalChainState;
  /** The housing (BUILD 1096 — the inn, saved in the founders
   *  save, v12, and round-tripped by serialize/restore). */
  housing: HousingState;
  /** The pen (BUILD 1102 — the sheep pen, saved in the founders
   *  save, v12, and round-tripped by serialize/restore). */
  pen: PenState;
  /** The settlement plan (BUILD 1100 — the Mayor + Architect
   *  decision, saved in the founders save, v12, and round-tripped
   *  by serialize/restore). */
  sitePlan: SettlementPlan | null;
  /** The path layer (BUILD 1088): the traffic counts, the bridge
   *  sites, and the last bridge-scan day. The traffic is
   *  session-only (never saved — the tiles persist via the world
   *  save); the bridges persist in the founders save (v10) and
   *  round-trip through serialize/restore. NOTE: `paths` (below)
   *  is the founder path CACHE (per-founder A* state), not this. */
  pathState: PathState;
  /** The mine / quarry / lumber sites (BUILD 1089 — saved in the
   *  founders save, v11, and round-tripped by serialize/restore). */
  mines: MineState;
  /** Absolute game-minutes (float — the clock advances 0.9/tick). */
  abs: number;
  ledger: SettlementLedger;
  paths: Map<string, FounderPathState>;
};

/** Day + minutes-of-day for the sim's absolute clock. Absolute minutes are
 *  day*1440 + minutes (founderAbsMinutes), so the day is floor(abs/1440). */
export function settlementClock(sim: SettlementSim): { day: number; minutes: number } {
  const day = Math.floor(sim.abs / SETTLEMENT_DAY_MINUTES);
  const minutes = sim.abs - day * SETTLEMENT_DAY_MINUTES;
  return { day, minutes };
}

/**
 * Fresh settlement: 3 founders at camp, empty pile, 30 starting meals,
 * fresh construction, the farm plot seeded (4 tiles, planted at the start
 * — the view seeds it at load). The world is the caller's (defaultWorld
 * in the test) and is mutated by the run (trees felled, huts placed).
 */
export function createSettlementSim(world: IsoWorld): SettlementSim {
  const founders = FOUNDER_NAMES.map((name, i) => defaultFounderState(name, i, SETTLEMENT_START_ABS));
  let registry = seedCampStore(createRegistry(), 0, 0, 0, 0); // BUILD 1090: no more magic 30 — fresh worlds start with an empty granary.
  for (const f of founders) registry = seedCarrierStore(registry, f);
  seedCampFarmPlot(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, SETTLEMENT_START_ABS, (x, y) => npcWalkable(world, x, y));
  // BUILD 1082 (1.3): stamp the rivers into the sim world too, so the
  // 24h run exercises founder paths around real water — the M1069
  // numbers staying identical WITH rivers present is the proof the
  // routing keeps the work sites clear (a rivers system that only
  // ADDS water must not change them).
  stampRivers(world);
  // BUILD 1083 (1.4): stamp the landforms into the sim world too,
  // so the 24h run exercises founder paths around real mountains
  // and cliffs — the M1069 numbers staying identical WITH
  // landforms present is the proof the band keeps the work sites
  // clear (a landforms system that only ADDS terrain must not
  // change them). The camp farm is neutral soil (factor 1.0), so
  // the farm grows at exactly the old rate.
  stampLandforms(world);
  // BUILD 1085 (1.6): stamp the animal populations into the sim world
  // too, so the 24h run exercises the ecosystem day step — the M1069
  // numbers staying identical WITH populations present is the proof the
  // day step never touches the founders (a forest regrows over days,
  // not hours; no sapling matures in 24h).
  stampAnimalPopulations(world);
  // BUILD 1088: seed the camp well (the 'well' placement, 3 tiles
  // west of camp on the camp row) — the founders draw from it from
  // day 3, and the dirt paths are laid by their traffic from the
  // first tick (the path layer starts empty — no pre-painted paths).
  seedWell(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, (x, y) => npcWalkable(world, x, y));
  // BUILD 1089 (2.4): stamp the mineral deposits into the sim world
  // too — the view's loadInitialWorld does this for the live game
  // (worldSync3d.ts), and without it the sim world has no deposits
  // at all, so the mine could never open in the sim. The stamp is
  // once-only and deterministic, like the rivers/landforms above;
  // the stone deposit at (112,167) is unreachable, so it is never
  // claimed in the 24h window (it is outside the 30-tile claim
  // radius there) and the M1069 numbers cannot move.
  stampMineralDeposits(world);
  return {
    world,
    founders,
    registry,
    board: createJobBoard(),
    construction: freshConstruction(),
    storehouse: freshStorehouse(),
    foodChain: freshFoodChain(),
    metalChain: freshMetalChain(),
    housing: freshHousing(),
    pen: freshPen(),
    sitePlan: null,
    abs: SETTLEMENT_START_ABS,
    ledger: freshSettlementLedger(),
    paths: new Map(),
    pathState: freshPathState(),
    mines: freshMineState(),
  };
}

/** Serialize the founders save (the reload contract — the world is not in it). */
export function serializeSettlement(sim: SettlementSim): string {
  return serializeFoundersSave(
    foundersSaveOf(sim.founders, campWoodInRegistry(sim.registry), campFoodInRegistry(sim.registry), campGrainInRegistry(sim.registry), campStoneInRegistry(sim.registry), sim.construction, storehouseWoodInRegistry(sim.registry), storehouseStoneInRegistry(sim.registry), sim.storehouse, sim.pathState.bridges, storehouseOreInRegistry(sim.registry, 'iron'), sim.mines, granaryFlourInRegistry(sim.registry), sim.foodChain, metalChainCoalInRegistry(sim.registry), metalChainIngotsInRegistry(sim.registry), metalChainToolsInRegistry(sim.registry), metalChainTimberInRegistry(sim.registry), metalChainFurnitureInRegistry(sim.registry), sim.metalChain, sim.housing, innFoodInRegistry(sim.registry), sim.sitePlan, sim.pen, granaryMeatInRegistry(sim.registry), granaryFishInRegistry(sim.registry), storehouseWoolInRegistry(sim.registry), storehouseLeatherInRegistry(sim.registry)),
  );
}

/**
 * Restore a settlement from a serialized founders save, on the SAME world
 * (the world save is separate — the trees, huts and farm tiles persist
 * there). The registry is rebuilt from the save (camp store + carrier
 * stores, the view's load path); the job board is fresh (session-only,
 * rebuilt by discovery next tick) and the path cache is empty. The ledger
 * carries over — the run before + after the reload is one record.
 */
export function restoreSettlement(world: IsoWorld, saveJson: string, abs: number, ledger: SettlementLedger): SettlementSim {
  const save = migrateFoundersSave(JSON.parse(saveJson));
  if (!save) throw new Error('settlementSim: the save does not migrate');
  const founders = foundersStateOf(save);
  let registry = seedCampStore(createRegistry(), save.stockpileWood, save.foodStock, save.grainStock, save.stoneStock, save.flourStock, save.meatStock, save.fishStock);
  registry = seedStorehouseStore(registry, save.storehouseWood, save.storehouseStone, save.storehouseOre, save.storehouseCoal, save.storehouseIngots, save.storehouseTools, save.storehouseTimber, save.storehouseFurniture, save.storehouseWool, save.storehouseLeather);
  registry = seedInnStore(registry, save.innFoodStock);
  for (const f of founders) registry = seedCarrierStore(registry, f);
  return {
    world,
    founders,
    registry,
    board: createJobBoard(),
    construction: save.construction,
    storehouse: save.storehouse,
    foodChain: save.foodChain,
    metalChain: save.metalChain,
    housing: save.housing,
    pen: save.pen,
    sitePlan: sitePlanFromSave(save.sitePlan),
    abs,
    ledger,
    paths: new Map(),
    pathState: { ...freshPathState(), bridges: save.bridges.map((b) => ({ ...b, workTile: { ...b.workTile } })) },
    mines: validateMineState(save.mines),
  };
}

/** One founder tick — a mirror of the view's runFounderTick. */
export function advanceSettlementTick(sim: SettlementSim): void {
  const { world } = sim;
  const dayBefore = settlementClock(sim).day;
  sim.abs += SETTLEMENT_TICK_MIN;
  const nowAbs = sim.abs;
  const { day, minutes } = settlementClock(sim);
  // BUILD 1085 (1.6): the ecosystem advances on the day boundary —
  // saplings grow at the season rate (none matures in 24h: 7 points
  // at 1.0/day in spring), animal populations run their day step.
  // Neither touches the founders, so the M1069 numbers cannot move.
  if (day > dayBefore) {
    const eco = advanceEcosystemDay(world, day, { forestDensity: forestDensity(world.trees.length, forestBaselineTrees(world)) });
    world.saplings = eco.saplings;
    world.animalPopulations = eco.populations;
    world.animalKills = eco.kills;
    applyMaturedTrees(world, eco.matured);
    // BUILD 1096: the inn store tops up from the granary at the
    // day boundary (a conserved transfer — food moves, the total
    // never changes), but only once the inn is finished.
    if (isInnUsable(sim.housing)) {
      const top = topUpInnStore(sim.registry);
      sim.registry = top.registry;
    }
    // BUILD 1102: the pen's day step — sheep fed on the day just
    // ended lamb and grow wool; unfed sheep do neither (the fedDay
    // is the day just ended, dayBefore — the day that flipped is
    // the new day, not the fed one).
    if (sim.pen.site.state === 'done') {
      const penDay = penDayAdvance(sim.pen, dayBefore);
      sim.pen = penDay.pen;
      sim.ledger.sheepBorn += penDay.births;
    }
  }
  const ledger = sim.ledger;
  ledger.ticks++;

  // Reconcile construction against the world (a 'done' hut whose placement
  // is gone rebuilds; a 'building' site with a placement present is done).
  const hutPlaced = hutPlacementExists(world);
  let construction = reconcileExtraSites(reconcileConstruction(sim.construction, hutPlaced), world);
  sim.construction = construction;
  // BUILD 1087: reconcile the storehouse the same way — a 'done'
  // storehouse whose placement is gone resets to 'none', so the
  // founders rebuild from the pile.
  sim.storehouse = reconcileStorehouse(sim.storehouse, world);
  // BUILD 1094: reconcile the mill + the bakery the same way — a
  // 'done' building whose placement is gone resets to 'none', so
  // the founders rebuild from the pile.
  sim.foodChain = reconcileFoodChain(sim.foodChain, world);
  // BUILD 1095: reconcile the chain the same way — a 'done'
  // building whose placement is gone resets to 'none', so the
  // founders rebuild from the pile.
  sim.metalChain = reconcileMetalChain(sim.metalChain, world);
  // BUILD 1096: reconcile the inn the same way — a 'done' inn
  // whose placement is gone resets to 'none', so the founders
  // rebuild from the pile.
  sim.housing = reconcileHousing(sim.housing, world);
  // BUILD 1088: reconcile the bridge sites the same way — a 'done'
  // bridge whose placement is gone rebuilds from the pile; a
  // 'building' site with a placement present is done.
  sim.pathState = { ...sim.pathState, bridges: reconcileBridges(sim.pathState.bridges, world) };
  // BUILD 1089: reconcile the mine / quarry / lumber sites the same
  // way (see worldSimulation3d.ts) — a mine whose deposit is mined
  // out flips to 'exhausted'; a quarry with no rocks flips; a lumber
  // site with no trees flips (and flips back when saplings mature).
  sim.mines = reconcileMines(sim.mines, world);
  const hutDone = !hasUnfinishedSite(construction);
  // BUILD 1096: the founding huts (0+1) — the storehouse / bridge /
  // quarry open on these (the 1095 schedule), not on worker housing.
  // The hut BUILD claim below keeps hutDone (all sites) so worker
  // housing can still be claimed once its gate opens.
  const foundingDone = foundingHutsDone(construction);

  // BUILD 1087: the quarry claim radius this tick — computed BEFORE the
  // board rebuild, so discovery creates rock jobs out to the widened
  // radius while the storehouse needs stone (see storehouse.ts).
  const quarryRadius = quarryClaimRadiusForStorehouse(sim.storehouse, foundingDone, day, campStoneInRegistry(sim.registry), storehouseStoneInRegistry(sim.registry));
  // BUILD 1089: the claim radius widens to cover the designated
  // quarry site's rocks (the mirror of the view tick — the site
  // centre is up to 72 out, past the storehouse radius once it is
  // done). The storehouseStoneNeed proxy below keeps using
  // quarryRadius (the storehouse need), not this widened radius.
  const siteQuarryRadius = sim.mines.quarry ? quarrySiteRocks(world, sim.mines.quarry).reduce((m, r) => Math.max(m, Math.abs(r.tx - FOUNDER_CAMP.x) + Math.abs(r.ty - FOUNDER_CAMP.y)), 0) : 0;
  const claimQuarryRadius = Math.max(quarryRadius, siteQuarryRadius);
  // BUILD 1089: the wood level that gates chopping — once the
  // storehouse is done, the lower of the camp pile and the
  // storehouse wood, so a full camp pile does not starve the
  // storehouse (the mirror of the view tick). Evaluated FRESH at
  // each use (a function, not a once-per-tick value — a stale low
  // pile makes every founder chop and moves the 24h pins).
  const pileForWood = () => sim.storehouse.state === 'done' ? Math.min(campWoodInRegistry(sim.registry), storehouseWoodInRegistry(sim.registry)) : campWoodInRegistry(sim.registry);

  // BUILD 1088: the once-a-day bridge scan — paths laid before the
  // day-3 gate (the arrival corridor's river crossing, laid day
  // 1–2) are checked for a river neighbour, so a bridge site opens
  // once the settlement is old enough. Gated on lastBridgeScanDay
  // so it runs once per day, not every tick.
  if (day >= BRIDGE_START_DAY && sim.pathState.lastBridgeScanDay < day) {
    scanForBridgeSites(world, sim.pathState, day);
  }
  // BUILD 1089: designate the mine / quarry / lumber sites — once
  // per day at most (the lastDesignateDay gate, the bridge scan's
  // pattern). The mine opens over the nearest live iron deposit;
  // the quarry over the best reachable rock cluster; the lumber
  // over the surveyed forest-edge rect. All three gate on day 3,
  // so the 24h window never sees a site.
  if (day >= MINE_START_DAY && sim.mines.lastDesignateDay < day) {
    let nextMines = sim.mines;
    if (!openMineSite(nextMines)) {
      const site = designateMine(world, day, sim.storehouse.state === 'done', nextMines.mines);
      if (site) nextMines = { ...nextMines, mines: [...nextMines.mines, site] };
    }
    // BUILD 1095: the coal mine — designated the same way, once
    // per day, when no open coal mine exists. The 1089 gate
    // checked for ANY open mine, which would have blocked the
    // coal mine while the iron mine was open (the smelter needs
    // both minerals, so both mines must open day 3).
    if (!openMineSites(nextMines).some((s) => s.mineral === 'coal')) {
      const coalSite = designateMine(world, day, sim.storehouse.state === 'done', nextMines.mines, 'coal');
      if (coalSite) nextMines = { ...nextMines, mines: [...nextMines.mines, coalSite] };
    }
    if (!nextMines.quarry) {
      const q = designateQuarry(world, day, nextMines.quarry);
      if (q) nextMines = { ...nextMines, quarry: q };
    }
    if (!nextMines.lumber) {
      const l = designateLumber(world, day, nextMines.lumber);
      if (l) nextMines = { ...nextMines, lumber: l };
    }
    sim.mines = { ...nextMines, lastDesignateDay: day };
  }
  // BUILD 1088: the camp well this tick (null before the seed, or
  // if the placement was removed) — fed to discovery and the
  // scorer, so both read the same well.
  const well = wellTile(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y);

  // Rebuild the job board from the world.
  sim.board = discoverJobs(sim.board, { world, construction, founders: sim.founders, nowAbs, growthFactorAt: (tx, ty) => growthFactorAt(world, day, tx, ty), soilFactorAt: (tx, ty) => soilFactorAt(world, tx, ty), storehouse: sim.storehouse, day, quarryRadius: claimQuarryRadius, well, bridges: sim.pathState.bridges, mines: sim.mines, foodChain: sim.foodChain, metalChain: sim.metalChain, housing: sim.housing, storehouseMaterials: { iron: storehouseOreInRegistry(sim.registry, 'iron'), coal: metalChainCoalInRegistry(sim.registry), ingots: metalChainIngotsInRegistry(sim.registry), tools: metalChainToolsInRegistry(sim.registry), wood: storehouseWoodInRegistry(sim.registry), timber: metalChainTimberInRegistry(sim.registry), furniture: metalChainFurnitureInRegistry(sim.registry) }, granary: { grain: campGrainInRegistry(sim.registry), flour: foodChainFlourInRegistry(sim.registry), food: campFoodInRegistry(sim.registry) }, pen: sim.pen });

  // BUILD 1069: the ready farm tiles this tick — computed once and
  // fed to every founder's scorer, so food drives work.
  const readyFarmCount = readyFarmTiles(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, nowAbs, FARM_VILLAGER_RADIUS, (tx, ty) => growthFactorAt(world, day, tx, ty)).length;
  // BUILD 1086: the open quarry jobs this tick — the same feed as
  // the real-time tick, so the mirror never re-chooses by a
  // different rule.
  // BUILD 1086: only quarry jobs inside the claim radius count — the
  // stone term must not fire when only far (unclaimable) jobs remain.
  // BUILD 1087: quarryRadius is computed above, before the board rebuild.
  const readyQuarryCount = openJobs(sim.board, 'quarry').filter((j) => Math.abs(j.tile.x - FOUNDER_CAMP.x) + Math.abs(j.tile.y - FOUNDER_CAMP.y) <= claimQuarryRadius).length;
  // BUILD 1088: the waterable farm tiles this tick — the same feed
  // as the real-time tick, so the mirror never re-chooses by a
  // different rule. Gated on the well + day 3 (the discovery gate,
  // mirrored here), so the count is 0 in the 24h window.
  const readyWaterCount = well && day >= WELL_START_DAY
    ? waterableFarmTiles(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, nowAbs, FARM_VILLAGER_RADIUS, (tx, ty) => growthFactorAt(world, day, tx, ty)).length
    : 0;
  // BUILD 1089: the open mine + lumber jobs this tick — the same
  // feed as the real-time tick, so the mirror never re-chooses by
  // a different rule. Both are 0 in the 24h window (the sites
  // open day 3).
  const readyMineCount = openJobs(sim.board, 'mine').length;
  const readyLumberCount = openJobs(sim.board, 'lumber').length;
  // BUILD 1090: the open plant jobs this tick — the same feed as
  // the real-time tick. 0 once the field is at target.
  const readyPlantCount = openJobs(sim.board, 'plant').length;
  // BUILD 1094: the open mill + bake jobs this tick — the same feed
  // as the real-time tick. 0 until the buildings are done.
  const readyMillCount = openJobs(sim.board, 'mill').length;
  const readyBakeCount = openJobs(sim.board, 'bake').length;
  // BUILD 1095: the open chain work jobs this tick — the same feed
  // as the real-time tick. 0 until the buildings are done.
  const readySmeltCount = openJobs(sim.board, 'smelt').length;
  const readySmithCount = openJobs(sim.board, 'smith').length;
  const readySawCount = openJobs(sim.board, 'saw').length;
  const readyCarpenterCount = openJobs(sim.board, 'carpenter').length;
  // BUILD 1089: the quarry crew cap — 2 when a site quarry job is
  // open (the crew works the designated site in parallel), 1
  // otherwise (the ad-hoc rule). In the 24h window there is no
  // site, so the cap is 1 and the guard is the 1086 rule.
  const siteQuarryOpen = openJobs(sim.board, 'quarry').some((j) => isQuarrySiteRock(sim.mines.quarry, j.tile.x, j.tile.y));
  const quarryCrewCap = siteQuarryOpen ? QUARRY_CREW_SIZE : 1;

  // A newcomer arrives when a finished hut leaves a free bed, the camp
  // holds food, and the settlement is old enough. One at a time.
  const arrival = arrivalCheck({
    founders: sim.founders,
    construction,
    foodStock: campFoodInRegistry(sim.registry),
    day,
  });
  if (arrival) {
    const newcomer = spawnResident(arrival.name, arrival.bed, RESIDENT_ENTRY_TILE, nowAbs, sim.founders);
    sim.founders = [...sim.founders, newcomer];
    ledger.arrivals.push(arrival.name);
  }

  // BUILD 1103 (0x26, Phase 4.4): Tamsin — the affinity-gated
  // newcomer (population.ts), the mirror of the view tick: first
  // hut done, food >= 10, founders bonded (avg affinity >= 55),
  // day >= 2. She walks in from the east edge and sleeps at the
  // camp bed (124,119), never taking a hut bed. One at a time.
  if (!sim.founders.some((f) => f.name === NEWCOMER_NAME) && !sim.founders.some((f) => f.workState === 'arriving')) {
    const tamsinEl = newcomerEligibility({
      day,
      foodStock: campFoodInRegistry(sim.registry),
      hutDone: construction.sites[0].state === 'done',
      avgAffinity: averageSettlerAffinity(sim.founders, day),
      hasNewcomer: false,
    });
    if (tamsinEl.eligible) {
      const entry = newcomerEntryTile(world) ?? RESIDENT_ENTRY_TILE;
      const tamsin = spawnResident(
        NEWCOMER_NAME,
        { hut: -1, x: NEWCOMER_SLEEP_TILE.x, y: NEWCOMER_SLEEP_TILE.y },
        entry,
        nowAbs,
        sim.founders,
      );
      sim.founders = [...sim.founders, tamsin];
      ledger.arrivals.push(NEWCOMER_NAME);
    }
  }

  // BUILD 1098 (0x21): professions — assigned by settlement need,
  // every tick, before the founder loop (the same rule as the view
  // tick, so the sim mirror never re-chooses by a different rule).
  // Idempotent: a founder keeps a profession that is still an open
  // slot, so the assignment only CHANGES when the need changes.
  const professionNeed: ProfessionNeed = {
    farmOpen: true,
    constructionPending:
      nearestUnfinishedSite(construction, FOUNDER_CAMP, day) !== null ||
      sim.storehouse.state !== 'done' ||
      sim.foodChain.mill.state !== 'done' ||
      sim.foodChain.bakery.state !== 'done' ||
      sim.metalChain.smelter.state !== 'done' ||
      sim.metalChain.blacksmith.state !== 'done' ||
      sim.metalChain.sawmill.state !== 'done' ||
      sim.metalChain.carpenter.state !== 'done' ||
      sim.metalChain.workshop.state !== 'done' ||
      sim.housing.inn.state !== 'done',
    lumberOpen: readyLumberCount > 0,
    mineOpen: readyMineCount > 0,
    quarryOpen: readyQuarryCount > 0,
    smelterDone: sim.metalChain.smelter.state === 'done',
    blacksmithDone: sim.metalChain.blacksmith.state === 'done',
    sawmillDone: sim.metalChain.sawmill.state === 'done',
    carpenterDone: sim.metalChain.carpenter.state === 'done',
    // BUILD 1102 (gate fix): the animal needs — the same shape as
    // the utility terms (day 3+, an open job, total camp food
    // below the hunt threshold; the pen done + feed/shear wanted).
    // Day-3-gated, so the 24h window never sees them.
    huntOpen:
      day >= PEN_START_DAY &&
      openJobs(sim.board, 'hunt').length > 0 &&
      campFoodInRegistry(sim.registry) + granaryMeatInRegistry(sim.registry) + granaryFishInRegistry(sim.registry) < UTILITY_HUNT_FOOD_THRESHOLD,
    fishOpen:
      day >= PEN_START_DAY &&
      openJobs(sim.board, 'fish').length > 0 &&
      campFoodInRegistry(sim.registry) + granaryMeatInRegistry(sim.registry) + granaryFishInRegistry(sim.registry) < UTILITY_HUNT_FOOD_THRESHOLD,
    shepherdOpen:
      sim.pen.site.state === 'done' &&
      (penFeedNeeded(sim.pen, day) || penShearReady(sim.pen)),
  };
  assignProfessions(sim.founders, professionSlotsFor(professionNeed));

  // BUILD 1100 (0x23, Phase 4.2): the settlement plan — the Mayor
  // + Architect re-decide what to build next + where, after the
  // board rebuild, before the founder loop (the same rule as the
  // view tick). The plan only changes when its building is done or
  // no longer startable (planNeedsReplan) — a steady plan is not
  // re-decided every tick, and the A* site scoring runs only on a
  // re-plan, never per tick.
  const planInput: SettlementNeedInput = {
    day,
    camp: { ...FOUNDER_CAMP },
    food: campFoodInRegistry(sim.registry),
    grain: campGrainInRegistry(sim.registry),
    flour: foodChainFlourInRegistry(sim.registry),
    beds: housingCapacity(construction),
    population: sim.founders.length,
    waitingArrivals: 0,
    campWood: campWoodInRegistry(sim.registry),
    campStone: campStoneInRegistry(sim.registry),
    storehouseWood: storehouseWoodInRegistry(sim.registry),
    storehouseIron: storehouseOreInRegistry(sim.registry, 'iron'),
    storehouseCoal: metalChainCoalInRegistry(sim.registry),
    storehouseIngots: metalChainIngotsInRegistry(sim.registry),
    storehouseTools: metalChainToolsInRegistry(sim.registry),
    storehouseTimber: metalChainTimberInRegistry(sim.registry),
    storehouseFurniture: metalChainFurnitureInRegistry(sim.registry),
    construction,
    storehouse: sim.storehouse,
    foodChain: sim.foodChain,
    metalChain: sim.metalChain,
    housing: sim.housing,
    bridges: sim.pathState.bridges,
    foundingDone,
  };
  if (planNeedsReplan(sim.sitePlan, planInput)) {
    sim.sitePlan = planFor(planInput, world, existingBuildingRects(construction, sim.storehouse, sim.foodChain, sim.metalChain, sim.housing));
  }

  for (const f of sim.founders) {
    const elapsed = Math.max(0, nowAbs - f.lastAbs);
    f.needs = decayFounderNeeds(f.needs, elapsed, f.activity);
    f.lastAbs = nowAbs;
    if (f.needs.hunger <= 0) ledger.starvedTicks++;
    if (f.needs.health < ledger.minHealth) ledger.minHealth = f.needs.health;

    // A job that vanished leaves stale work state behind: clear it so
    // the founder re-targets. A carrier in 'toStockpile' re-claims
    // their deliver job (discovery creates it from the carried wood).
    let myJob = jobForFounder(sim.board, f.id);
    if (!myJob) {
      if (f.workState === 'toSite' || f.workState === 'building' || f.workState === 'toStorehouse' || f.workState === 'chopping') {
        f.workState = 'toTree';
        f.buildTicks = 0;
        f.chopTicks = 0;
        f.treeTarget = null;
        f.workTile = null;
      } else if (f.workState === 'toFarm' || f.workState === 'harvesting') {
        f.workState = 'toTree';
        f.harvestTicks = 0;
        f.farmTarget = null;
      } else if (f.workState === 'toPlant' || f.workState === 'planting') {
        f.workState = 'toTree';
        f.plantTicks = 0;
        f.farmTarget = null;
      } else if (f.workState === 'toQuarry' || f.workState === 'mining') {
        f.workState = 'toTree';
        f.mineTicks = 0;
        f.quarryTarget = null;
      } else if (f.workState === 'toMine' || f.workState === 'miningOre') {
        f.workState = 'toTree';
        f.mineTicks = 0;
        f.mineTarget = null;
      } else if (f.workState === 'toPrey' || f.workState === 'hunting') {
        // BUILD 1102: the hunt job vanished (the prey went extinct
        // while the hunter walked — discovery failed it) — the
        // hunter re-targets instead of walking to a dead prey.
        f.workState = 'toTree';
        f.preyTarget = null;
        f.animalTicks = 0;
      } else if (f.workState === 'toBank' || f.workState === 'fishing') {
        // BUILD 1102: the fish job vanished (the river ran out of
        // fish) — the fisher re-targets.
        f.workState = 'toTree';
        f.animalTicks = 0;
      } else if (f.workState === 'toPen' || f.workState === 'shepherding') {
        // BUILD 1102: the shepherd job vanished — the shepherd
        // re-targets (carried feed grain is re-claimed as a
        // deliver below, like any other carried good).
        f.workState = 'toTree';
        f.animalTicks = 0;
      } else if (f.workState === 'toWell' || f.workState === 'toWater') {
        // BUILD 1088: the water job vanished (the tile was watered
        // by another founder, or grew ready) — spill the carried
        // water (it is never stocked) and re-target.
        if (f.carryingWater > 0) {
          ledger.waterSpilled += f.carryingWater;
          f.carryingWater = 0;
        }
        f.workState = 'toTree';
        f.waterTarget = null;
      } else if (f.workState === 'toTree') {
        f.treeTarget = null;
        f.workTile = null;
      }
      if (f.workState === 'toStockpile' && (f.carrying > 0 || f.carryingGrain > 0 || f.carryingStone > 0 || f.carryingBuild > 0 || f.carryingOre > 0)) {
        const dc = claimDeliverJobFor(sim.board, f.id, f.carrying + f.carryingGrain + f.carryingStone + f.carryingBuild + f.carryingOre + f.carryingMeat + f.carryingLeather + f.carryingFish + f.carryingWool, nowAbs);
        sim.board = dc.board;
        if (dc.job) myJob = dc.job;
      }
    }

    // BUILD 1088: a bridge builder whose site vanished (reconciled
    // away while the job was held) releases the job and re-targets
    // — the site no longer exists to build on.
    if (myJob && myJob.kind === 'build' && myJob.targetId.startsWith('bridge-') && !bridgeSiteById(sim.pathState.bridges, myJob.targetId)) {
      sim.board = releaseJob(sim.board, myJob.id);
      myJob = undefined;
      f.workState = 'toTree';
      f.buildTicks = 0;
      f.treeTarget = null;
      f.workTile = null;
    }

    // The activity is the utility scorer's choice — needs + context.
    // A newcomer walking in is not re-scored (they keep 'work' and
    // walk to camp first; the scorer picks their job after they arrive).
    // BUILD 1096: pass the day — nearestUnfinishedSite skips a
    // gated worker-housing site (see construction.ts).
    const buildSite = nearestUnfinishedSite(construction, f, day);
    // BUILD 1098: builder priority at the claim — a builder is
    // FREE (workState 'toTree'), so a non-builder treats the build
    // slot as taken. See worldSimulation3d.ts for the live-
    // diagnostic evidence and the fallback (when the builder is
    // BUSY, anyone steps in — the strict gate starved the
    // settlement). A founder already holding a build job (myJob
    // build) is exempt and finishes it.
    const builderIsFree = sim.founders.some((o) => o.profession === 'builder' && o.workState === 'toTree');
    const builderTaken = (() => {
      const b = buildSite ? buildJobClaimedBy(sim.board, buildSite.id) : null;
      const bs = buildJobClaimedBy(sim.board, STOREHOUSE_SITE_ID);
      // BUILD 1088: a claimed bridge job counts the same way — one
      // builder per bridge site.
      const bb = sim.pathState.bridges.some((s) => {
        const c = buildJobClaimedBy(sim.board, s.id);
        return c !== null && c !== f.id;
      });
      // BUILD 1094: a claimed mill/bakery build counts the same way.
      const bm = buildJobClaimedBy(sim.board, MILL_SITE_ID);
      const bba = buildJobClaimedBy(sim.board, BAKERY_SITE_ID);
      // BUILD 1095: a claimed chain build counts the same way —
      // one builder per chain site (the live tick's rule).
      const bsm = buildJobClaimedBy(sim.board, SMELTER_SITE_ID);
      const bbl = buildJobClaimedBy(sim.board, BLACKSMITH_SITE_ID);
      const bsw = buildJobClaimedBy(sim.board, SAWMILL_SITE_ID);
      const bcp = buildJobClaimedBy(sim.board, CARPENTER_SITE_ID);
      const bwk = buildJobClaimedBy(sim.board, WORKSHOP_SITE_ID);
      // BUILD 1096: a claimed inn build counts the same way — one
      // builder per site.
      const bin = buildJobClaimedBy(sim.board, INN_SITE_ID);
      return (b !== null && b !== f.id) || (bs !== null && bs !== f.id) || bb || (bm !== null && bm !== f.id) || (bba !== null && bba !== f.id) || (bsm !== null && bsm !== f.id) || (bbl !== null && bbl !== f.id) || (bsw !== null && bsw !== f.id) || (bcp !== null && bcp !== f.id) || (bwk !== null && bwk !== f.id) || (bin !== null && bin !== f.id) || (builderIsFree && f.profession !== 'builder' && myJob?.kind !== 'build');
    })();
    // BUILD 1095: the iron slot and the coal slot are separate —
    // a founder mining iron does not block a founder mining coal
    // (founderMiningMineral reads the site's mineral, or the
    // carried kind on the return leg).
    const ironTaken = sim.founders.some((o) => o !== f && founderMiningMineral(o, sim.mines) === 'iron');
    const coalTaken = sim.founders.some((o) => o !== f && founderMiningMineral(o, sim.mines) === 'coal');
    const currentJob = myJob ? (myJob.kind === 'build' ? 'build' : 'chop') : null;
    const prevActivity = f.activity;
    const tClosest = closestFounder(f.social, day);
    const tCompanion = tClosest ? sim.founders.find((o) => o.name === tClosest.name) : undefined;
    const tCompanionAtCamp =
      !!tCompanion &&
      Math.abs(Math.round(tCompanion.x) - FOUNDER_CAMP.x) + Math.abs(Math.round(tCompanion.y) - FOUNDER_CAMP.y) <= 3;
    if (f.workState !== 'arriving') {
      const decision = chooseScoredActivity({
        needs: f.needs,
        minutes,
        foodStock: campFoodInRegistry(sim.registry),
        stockpileWood: pileForWood(),
        construction,
        nearestTreeDist: scorerTreeDist(sim.board, f.id, FOUNDER_CAMP.x, FOUNDER_CAMP.y, FOUNDER_WORK_RADIUS),
        distToSite: distToActiveBuildSite({ x: Math.round(f.x), y: Math.round(f.y) }, construction, sim.storehouse, day, sim.sitePlan?.site.approach ?? null),
        builderTaken,
        currentJob,
        closestAffinity: tClosest ? tClosest.affinity : 50,
        companionAtCamp: tCompanionAtCamp,
        readyFarmTiles: readyFarmCount,
        readyWaterJobs: readyWaterCount,
        well,
        bridge: bridgeBuildContext(sim.pathState.bridges, { x: Math.round(f.x), y: Math.round(f.y) }, day, foundingDone, sim.storehouse.state === 'done', campWoodInRegistry(sim.registry)),
        stoneStock: campStoneInRegistry(sim.registry),
        readyQuarryJobs: readyQuarryCount, storehouseStoneNeed: quarryRadius > QUARRY_CLAIM_RADIUS,
        // BUILD 1086: the quarry slot is live — a founder scored
        // after another founder claimed the slot rests instead of
        // standing idle on the camp centre (see utility.ts).
        quarryTaken: sim.founders.filter((o) => o !== f && (o.workState === 'toQuarry' || o.workState === 'mining' || o.carryingStone > 0)).length >= quarryCrewCap,
        storehouse: sim.storehouse,
        storehouseWood: storehouseWoodInRegistry(sim.registry),
        day,
        readyMineJobs: readyMineCount,
        mineTaken: ironTaken,
        coalTaken,
        storehouseIron: storehouseOreInRegistry(sim.registry, 'iron'),
        storehouseCoal: metalChainCoalInRegistry(sim.registry),
        readyLumberJobs: readyLumberCount,
        readyPlantJobs: readyPlantCount,
        readyMillJobs: readyMillCount,
        millTaken: sim.founders.some((o) => o !== f && (o.workState === 'toMill' || o.workState === 'milling')),
        readyBakeJobs: readyBakeCount,
        bakeTaken: sim.founders.some((o) => o !== f && (o.workState === 'toBakery' || o.workState === 'baking')),
        readySmeltJobs: readySmeltCount,
        smeltTaken: sim.founders.some((o) => o !== f && (o.workState === 'toSmelter' || o.workState === 'smelting')),
        readySmithJobs: readySmithCount,
        smithTaken: sim.founders.some((o) => o !== f && (o.workState === 'toSmith' || o.workState === 'smithing')),
        readySawJobs: readySawCount,
        sawTaken: sim.founders.some((o) => o !== f && (o.workState === 'toSawmill' || o.workState === 'sawing')),
        readyCarpenterJobs: readyCarpenterCount,
        carpenterTaken: sim.founders.some((o) => o !== f && (o.workState === 'toCarpenter' || o.workState === 'carpentering')),
        storehouseIngots: metalChainIngotsInRegistry(sim.registry),
        storehouseTools: metalChainToolsInRegistry(sim.registry),
        storehouseTimber: metalChainTimberInRegistry(sim.registry),
        storehouseFurniture: metalChainFurnitureInRegistry(sim.registry),
        campGrain: campGrainInRegistry(sim.registry),
        campFlour: foodChainFlourInRegistry(sim.registry),
        campMeat: granaryMeatInRegistry(sim.registry),
        campFish: granaryFishInRegistry(sim.registry),
        readyHuntJobs: openJobs(sim.board, 'hunt').length,
        readyFishJobs: openJobs(sim.board, 'fish').length,
        readyShepherdFeedJobs: openJobs(sim.board, 'shepherd').filter((j) => j.targetId === PEN_FEED_JOB_ID).length,
        readyShepherdShearJobs: openJobs(sim.board, 'shepherd').filter((j) => j.targetId === PEN_SHEAR_JOB_ID).length,
        huntTaken: sim.founders.some((o) => o !== f && (o.workState === 'toPrey' || o.workState === 'hunting')),
        fishTaken: sim.founders.some((o) => o !== f && (o.workState === 'toBank' || o.workState === 'fishing')),
        shepherdTaken: sim.founders.some((o) => o !== f && (o.workState === 'toPen' || o.workState === 'shepherding')),
        profession: f.profession,
        builderExists: sim.founders.some((o) => o.profession === 'builder'),
      });
      f.activity = decision.activity;
      f.lastDecision = decision;
    }

    // Activity transitions record shared events (memory.ts) — rest and
    // sleep record on the transition, with every other founder already
    // in that activity. The rest tile is picked on the transition too.
    if (f.activity !== prevActivity) {
      f.restTile = null;
      if (f.activity === 'rest') {
        if (tClosest && tCompanionAtCamp && tCompanion) {
          const taken = new Set(
            sim.founders.filter((o) => o !== f && o.restTile).map((o) => o.restTile!.x + ',' + o.restTile!.y),
          );
          f.restTile = restTileFor(
            { x: Math.round(tCompanion.x), y: Math.round(tCompanion.y) },
            taken,
            (x, y) => npcWalkable(world, x, y),
            FOUNDER_CAMP_CENTRE,
          );
        }
        for (const o of sim.founders) {
          if (o === f || o.activity !== 'rest') continue;
          f.social = recordSharedEvent(f.social, o.name, 'rest', day, nowAbs);
          o.social = recordSharedEvent(o.social, f.name, 'rest', day, nowAbs);
        }
      } else if (f.activity === 'sleep') {
        for (const o of sim.founders) {
          if (o === f || o.activity !== 'sleep') continue;
          f.social = recordSharedEvent(f.social, o.name, 'sleep', day, nowAbs);
          o.social = recordSharedEvent(o.social, f.name, 'sleep', day, nowAbs);
        }
      }
    }

    // A builder who stops building RELEASES the site (another founder
    // can take it when wood is available instead of the site sitting
    // reserved-but-empty). A 'work' founder keeps it while the pile
    // still holds wood (the scorer flips them back to 'build' next tick).
    if ((f.workState === 'toSite' || f.workState === 'building' || f.workState === 'toStorehouse') && f.activity !== 'build') {
      // BUILD 1087: a storehouse builder keeps the site while the
      // storehouse step is startable — the same rule as a hut
      // builder (see worldSimulation3d.ts).
      // BUILD 1088: a bridge builder keeps the site while the
      // bridge step is startable — the same rule, third in line.
      const bridgeSite = myJob && myJob.kind === 'build' && myJob.targetId.startsWith('bridge-')
        ? bridgeSiteById(sim.pathState.bridges, myJob.targetId)
        : undefined;
      const keepBridge = !!bridgeSite && canStartBridge(bridgeSite, day, foundingDone, sim.storehouse.state === 'done', campWoodInRegistry(sim.registry));
      // BUILD 1094: a mill/bakery builder keeps the site while the
      // step is startable — the same rule as a hut/storehouse/
      // bridge builder (the view already had this; the sim did not,
      // so the sim released the mill builder every tick and the
      // mill never rose past progress 0 — see worldSimulation3d.ts).
      const keepMill = !!(myJob && myJob.kind === 'build' && myJob.targetId === MILL_SITE_ID) && canStartMill(sim.foodChain, campGrainInRegistry(sim.registry), campWoodInRegistry(sim.registry));
      const keepBakery = !!(myJob && myJob.kind === 'build' && myJob.targetId === BAKERY_SITE_ID) && canStartBakery(sim.foodChain, campWoodInRegistry(sim.registry));
      // BUILD 1095: a chain builder keeps the site while the step
      // is startable — the same rule as a mill/bakery builder (the
      // workshop's gate includes the tool gate, so a builder who
      // claimed while tools existed releases the job when they
      // run out mid-build).
      const keepSmelter = !!(myJob && myJob.kind === 'build' && myJob.targetId === SMELTER_SITE_ID) && canStartSmelter(sim.metalChain, storehouseOreInRegistry(sim.registry, 'iron'), (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)));
      const keepBlacksmith = !!(myJob && myJob.kind === 'build' && myJob.targetId === BLACKSMITH_SITE_ID) && canStartBlacksmith(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)));
      const keepSawmill = !!(myJob && myJob.kind === 'build' && myJob.targetId === SAWMILL_SITE_ID) && canStartSawmill(sim.metalChain, sim.storehouse.state === 'done', (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)));
      const keepCarpenter = !!(myJob && myJob.kind === 'build' && myJob.targetId === CARPENTER_SITE_ID) && canStartCarpenter(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)));
      const keepWorkshop = !!(myJob && myJob.kind === 'build' && myJob.targetId === WORKSHOP_SITE_ID) && canStartWorkshop(sim.metalChain, sim.foodChain.bakery.state === 'done', (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)), metalChainToolsInRegistry(sim.registry));
      const keepPen = !!(myJob && myJob.kind === 'build' && myJob.targetId === PEN_SITE_ID) && sim.pen.site.state !== 'done' && sim.pen.site.progress < PEN_WORK_STEPS; // BUILD 1102: the pen is kept while unfinished — the pile gate released the job mid-build (3/6) and the bridges took the wood; the builder waits at the pen for the next chop delivery.
      const keepSite =
        f.activity === 'work' &&
        (canBuild(construction, campWoodInRegistry(sim.registry)) ||
          (sim.storehouse.state === 'done' && storehouseWoodInRegistry(sim.registry) >= HUT_WOOD_PER_STEP) ||
          canStartStorehouse(sim.storehouse, day, foundingDone, campWoodInRegistry(sim.registry), campStoneInRegistry(sim.registry)) ||
          keepBridge ||
          keepMill ||
          keepBakery ||
          keepSmelter ||
          keepBlacksmith ||
          keepSawmill ||
          keepCarpenter ||
          keepWorkshop ||
          keepPen);
      if (!keepSite) {
        if (myJob && myJob.kind === 'build') {
          sim.board = releaseJob(sim.board, myJob.id);
          myJob = undefined;
        }
        f.workState = 'toTree';
        f.buildTicks = 0;
        f.treeTarget = null;
        f.workTile = null;
      }
    }

    // BUILD 1087: a founder carrying BUILD wood who is not heading
    // to (or at) a site returns it to the stockpile — the wood never
    // strands in the carrier (see worldSimulation3d.ts).
    if (f.carryingBuild > 0 && f.workState !== 'toSite' && f.workState !== 'building' && f.workState !== 'toStorehouse') f.workState = 'toStockpile';
    // BUILD 1088: a founder carrying WATER who is not heading to
    // (or at) a farm tile spills it — the water is never stocked,
    // so it cannot be carried into the next job; the spill is
    // ledgered, so waterDrawn = tilesWatered + waterSpilled +
    // carried stays exact.
    if (f.carryingWater > 0 && f.workState !== 'toWater' && f.workState !== 'toWell') {
      ledger.waterSpilled += f.carryingWater;
      f.carryingWater = 0;
      f.waterTarget = null;
    }
    // Eat: at the eat tile, one meal from the shared camp stock.
    // BUILD 1079 (0x0E): only eat when actually hungry — see
    // worldSimulation3d.ts. Without the guard a founder with nothing
    // to do idles in 'eat' and consumes a meal every tick at hunger
    // 93-100, draining the camp food to 0 (measured ticks 1400-1600).
    // BUILD 1091 (0x1A): eat from the campfire ring (the 3x3 around
    // the eat tile), not just the exact tile — six founders
    // converging on one tile deadlock (the `occupied` check + A*
    // replan loop), and a hungry founder starves beside 15 meals
    // while queued for the single tile (day 6 ran 565 starved
    // ticks). The shared-meal social radius below already treats
    // the 3x3 as the eating area.
    if (f.activity === 'eat' && f.needs.hunger < 90 && Math.abs(Math.round(f.x) - FOUNDER_EAT_TILE.x) <= 1 && Math.abs(Math.round(f.y) - FOUNDER_EAT_TILE.y) <= 1) {
      const res = eatFounderMealFromRegistry(sim.registry, f.needs);
      if (res.ate) {
        sim.registry = res.registry;
        f.needs = res.needs;
        ledger.mealsEaten++;
        for (const o of sim.founders) {
          if (
            o !== f &&
            Math.abs(Math.round(o.x) - FOUNDER_EAT_TILE.x) <= 1 &&
            Math.abs(Math.round(o.y) - FOUNDER_EAT_TILE.y) <= 1
          ) {
            f.social = recordSharedEvent(f.social, o.name, 'eat', day, nowAbs);
            o.social = recordSharedEvent(o.social, f.name, 'eat', day, nowAbs);
          }
        }
      }
    }

    // BUILD 1096: the inn rest ends when the stay runs out — the
    // traveler walks on to camp (the door transition below steps
    // them out to the inn approach). The scorer is skipped while
    // 'arriving', so the 'rest' holds until this flips it.
    if (f.workState === 'arriving' && f.activity === 'rest' && f.innRestTicks !== undefined && f.innRestTicks > 0) {
      f.innRestTicks--;
      if (f.innRestTicks === 0) f.activity = 'work';
    }

    // Door transitions: inside + not sleeping → step out to the approach
    // tile and walk on from there. Inside + sleeping → stay asleep.
    let insideHut = hutPlaced && insideHutRect(Math.round(f.x), Math.round(f.y));
    if (insideHut && f.activity !== 'sleep') {
      const exitApproach = HUT_SITES[f.bed.hut]?.approach ?? HUT_APPROACH;
      f.x = exitApproach.x;
      f.y = exitApproach.y;
      sim.paths.delete(f.name);
      insideHut = false;
    }
    // BUILD 1096: the inn door transition — inside the inn and not
    // resting → step out to the inn approach and walk on (the hut
    // door transition's shape). Inside + resting → stay resting.
    const insideInn = isInnUsable(sim.housing) && insideInnRect(Math.round(f.x), Math.round(f.y));
    if (insideInn && f.activity !== 'rest') {
      f.x = INN_APPROACH.x;
      f.y = INN_APPROACH.y;
      sim.paths.delete(f.name);
    }

    // Work assignment: build vs chop vs harvest. A founder with
    // workState 'toTree' and no tree target becomes the builder when
    // the hut is unfinished, the pile holds a step's wood, and nobody
    // else is building. Farming is the 'work' choice while the camp
    // is short of food; chopping is the 'work' choice when it is not.
    if ((f.activity === 'work' || f.activity === 'build') && f.workState === 'toTree' && !f.treeTarget) {

      // BUILD 1100: the plan's building claims FIRST — the Mayor's
      // pick, not the code order. A free founder attempts the plan's
      // building with the SAME gate its fixed branch below uses (the
      // gates live in both places — the plan block and the branch —
      // so a gate change updates both); if the plan claim fails
      // (gate closed, job gone, builder taken) the fixed branches
      // run as before (the fallback). A claimed plan job moves the
      // founder off 'toTree', so the branches below skip. The hut
      // resolves to the PLAN's site (matched by rect), not the
      // founder-nearest site — the plan and the build agree on
      // where the hut goes.
      if (sim.sitePlan && !builderTaken) {
        const planBuilding = sim.sitePlan.building;
        let planJobId: string | null = null;
        if (planBuilding === 'hut') {
          const planHut = HUT_SITES.find((s) => s.rect.x0 === sim.sitePlan!.site.rect.x0 && s.rect.y0 === sim.sitePlan!.site.rect.y0);
          if (!hutDone && planHut && (canBuild(construction, campWoodInRegistry(sim.registry)) || (sim.storehouse.state === 'done' && storehouseWoodInRegistry(sim.registry) >= HUT_WOOD_PER_STEP))) planJobId = buildJobIdFor(planHut.id);
        } else if (planBuilding === 'storehouse') {
          if (foundingDone && canStartStorehouse(sim.storehouse, day, foundingDone, campWoodInRegistry(sim.registry), campStoneInRegistry(sim.registry))) planJobId = buildJobIdFor(STOREHOUSE_SITE_ID);
        } else if (planBuilding === 'bridge') {
          const planBridge = sim.pathState.bridges.find((s) => s.x === sim.sitePlan!.site.rect.x0 && s.y === sim.sitePlan!.site.rect.y0);
          if (foundingDone && sim.storehouse.state === 'done' && planBridge && canStartBridge(planBridge, day, foundingDone, true, campWoodInRegistry(sim.registry))) planJobId = buildJobIdFor(planBridge.id);
        } else if (planBuilding === 'mill') {
          if (construction.sites[0] && construction.sites[0].state === 'done' && canStartMill(sim.foodChain, campGrainInRegistry(sim.registry), campWoodInRegistry(sim.registry))) planJobId = buildJobIdFor(MILL_SITE_ID);
        } else if (planBuilding === 'bakery') {
          if (canStartBakery(sim.foodChain, campWoodInRegistry(sim.registry))) planJobId = buildJobIdFor(BAKERY_SITE_ID);
        } else if (planBuilding === 'smelter') {
          if (canStartSmelter(sim.metalChain, storehouseOreInRegistry(sim.registry, 'iron'), (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) planJobId = buildJobIdFor(SMELTER_SITE_ID);
        } else if (planBuilding === 'blacksmith') {
          if (canStartBlacksmith(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) planJobId = buildJobIdFor(BLACKSMITH_SITE_ID);
        } else if (planBuilding === 'sawmill') {
          if (canStartSawmill(sim.metalChain, sim.storehouse.state === 'done', (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) planJobId = buildJobIdFor(SAWMILL_SITE_ID);
        } else if (planBuilding === 'carpenter') {
          if (canStartCarpenter(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) planJobId = buildJobIdFor(CARPENTER_SITE_ID);
        } else if (planBuilding === 'workshop') {
          if (canStartWorkshop(sim.metalChain, sim.foodChain.bakery.state === 'done', (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)), metalChainToolsInRegistry(sim.registry))) planJobId = buildJobIdFor(WORKSHOP_SITE_ID);
        } else if (planBuilding === 'inn') {
          if (canStartInn(sim.housing, sim.construction, campWoodInRegistry(sim.registry), storehouseWoodInRegistry(sim.registry), day)) planJobId = buildJobIdFor(INN_SITE_ID);
        }
        if (planJobId) {
          const pClaim = claimJob(sim.board, f.id, planJobId);
          sim.board = pClaim.board;
          if (pClaim.job) {
            // The hut fetch leg (the fixed branch's shape): the pile
            // short + the storehouse holding a step's wood sends the
            // builder to fetch first instead of waiting at the site.
            if (planBuilding === 'hut' && sim.storehouse.state === 'done' && campWoodInRegistry(sim.registry) < HUT_WOOD_PER_STEP && storehouseWoodInRegistry(sim.registry) >= HUT_WOOD_PER_STEP) {
              f.workState = 'toStorehouse';
            } else {
              f.workState = 'toSite';
            }
            myJob = pClaim.job;
          }
        }
      }
      if (!hutDone && !builderTaken && (canBuild(construction, campWoodInRegistry(sim.registry)) || (sim.storehouse.state === 'done' && storehouseWoodInRegistry(sim.registry) >= HUT_WOOD_PER_STEP)) && buildSite) {
        const bc = claimJob(sim.board, f.id, buildJobIdFor(buildSite.id));
        sim.board = bc.board;
        if (bc.job) {
          // BUILD 1087: the fetch leg — when the storehouse exists
          // and the camp pile is short of a step's wood, the builder
          // fetches the step's wood from the storehouse first (see
          // worldSimulation3d.ts).
          if (sim.storehouse.state === 'done' && campWoodInRegistry(sim.registry) < HUT_WOOD_PER_STEP && storehouseWoodInRegistry(sim.registry) >= HUT_WOOD_PER_STEP) {
            f.workState = 'toStorehouse';
          } else {
            f.workState = 'toSite';
          }
          myJob = bc.job;
        }
      }
      // BUILD 1087: the storehouse build — claimed the same way as a
      // hut (one builder, the claim IS the site), only once the huts
      // are done and the settlement is old enough (the housing-first
      // rule), and only when the camp pile holds a step's wood +
      // stone (see worldSimulation3d.ts).
      if (f.workState === 'toTree' && !f.treeTarget && foundingDone && !builderTaken && canStartStorehouse(sim.storehouse, day, foundingDone, campWoodInRegistry(sim.registry), campStoneInRegistry(sim.registry))) {
        const sc = claimJob(sim.board, f.id, buildJobIdFor(STOREHOUSE_SITE_ID));
        sim.board = sc.board;
        if (sc.job) {
          f.workState = 'toSite';
          myJob = sc.job;
        }
      }
      // BUILD 1102: the pen — claimed right after the storehouse,
      // before the bridges/mill/bakery/chain (it is NOT a plan
      // building, so the Mayor never picks it, and the direct claim
      // sat last and was perpetually preempted — the probe failed
      // three times at day 7 with the pen 'none'). Food infrastructure
      // (meat/wool), claimed alongside the mill/bakery by a different
      // founder. The claim checks penTaken (no other founder has
      // claimed THE PEN), not the global builderTaken.
      const penTaken = (() => { const c = buildJobClaimedBy(sim.board, PEN_SITE_ID); return c !== null && c !== f.id; })();
      if (f.workState === 'toTree' && !f.treeTarget && !penTaken && canStartPen(sim.pen, day, foundingHutsDone(construction), sim.storehouse.state === 'done', campFoodInRegistry(sim.registry), campWoodInRegistry(sim.registry))) {
        const pc = claimJob(sim.board, f.id, buildJobIdFor(PEN_SITE_ID));
        sim.board = pc.board;
        if (pc.job) {
          f.workState = 'toSite';
          myJob = pc.job;
        }
      }
      // BUILD 1088: the bridge build — claimed the same way as a
      // hut (one builder, the claim IS the site), only once the
      // huts and the storehouse are done and the settlement is old
      // enough (bridges third), and only when the camp pile holds
      // a step's wood (see worldSimulation3d.ts). The nearest
      // startable site wins.
      if (f.workState === 'toTree' && !f.treeTarget && foundingDone && sim.storehouse.state === 'done' && !builderTaken && !canStartPen(sim.pen, day, foundingHutsDone(construction), sim.storehouse.state === 'done', campFoodInRegistry(sim.registry), campWoodInRegistry(sim.registry))) { // BUILD 1102: the bridge yields while the pen is startable — the bridge claims are checked first, so the pen never won the builder.
        let bestSite: BridgeSite | null = null;
        let bestDist = Infinity;
        for (const s of sim.pathState.bridges) {
          if (!canStartBridge(s, day, foundingDone, true, campWoodInRegistry(sim.registry))) continue;
          const d = Math.abs(s.workTile.x - Math.round(f.x)) + Math.abs(s.workTile.y - Math.round(f.y));
          if (d < bestDist) { bestDist = d; bestSite = s; }
        }
        if (bestSite) {
          const brc = claimJob(sim.board, f.id, buildJobIdFor(bestSite.id));
          sim.board = brc.board;
          if (brc.job) {
            f.workState = 'toSite';
            myJob = brc.job;
          }
        }
      }
      // BUILD 1094: the mill build — claimed the same way as a hut
      // (one builder, the claim IS the site), only once hut 0 is done
      // (the housing-first rule — the mill must not steal the first
      // hut's wood) and the first grain has landed (there is something
      // to mill), and only when the camp pile holds a step's wood
      // (see worldSimulation3d.ts).
      if (f.workState === 'toTree' && !f.treeTarget && construction.sites[0] && construction.sites[0].state === 'done' && !builderTaken && canStartMill(sim.foodChain, campGrainInRegistry(sim.registry), campWoodInRegistry(sim.registry))) {
        const mc = claimJob(sim.board, f.id, buildJobIdFor(MILL_SITE_ID));
        sim.board = mc.board;
        if (mc.job) {
          f.workState = 'toSite';
          myJob = mc.job;
        }
      }
      // BUILD 1094: the bakery build — claimed the same way, only
      // once the mill is done (the bakery needs flour) and only when
      // the camp pile holds a step's wood.
      if (f.workState === 'toTree' && !f.treeTarget && !builderTaken && canStartBakery(sim.foodChain, campWoodInRegistry(sim.registry))) {
        const bc2 = claimJob(sim.board, f.id, buildJobIdFor(BAKERY_SITE_ID));
        sim.board = bc2.board;
        if (bc2.job) {
          f.workState = 'toSite';
          myJob = bc2.job;
        }
      }
      // BUILD 1095: the smelter build — claimed the same way, only
      // once the first ore has landed in the storehouse (the
      // smelter's gate) and only when the camp pile holds a
      // step's wood.
      if (f.workState === 'toTree' && !f.treeTarget && !builderTaken && canStartSmelter(sim.metalChain, storehouseOreInRegistry(sim.registry, 'iron'), (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) {
        const sc2 = claimJob(sim.board, f.id, buildJobIdFor(SMELTER_SITE_ID));
        sim.board = sc2.board;
        if (sc2.job) {
          f.workState = 'toSite';
          myJob = sc2.job;
        }
      }
      // BUILD 1095: the blacksmith build — only once the smelter
      // is done (the blacksmith needs ingots to be worth building).
      if (f.workState === 'toTree' && !f.treeTarget && !builderTaken && canStartBlacksmith(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) {
        const sb2 = claimJob(sim.board, f.id, buildJobIdFor(BLACKSMITH_SITE_ID));
        sim.board = sb2.board;
        if (sb2.job) {
          f.workState = 'toSite';
          myJob = sb2.job;
        }
      }
      // BUILD 1095: the sawmill build — only once the storehouse
      // is done (the sawmill draws its wood from the storehouse).
      if (f.workState === 'toTree' && !f.treeTarget && !builderTaken && canStartSawmill(sim.metalChain, sim.storehouse.state === 'done', (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) {
        const sw2 = claimJob(sim.board, f.id, buildJobIdFor(SAWMILL_SITE_ID));
        sim.board = sw2.board;
        if (sw2.job) {
          f.workState = 'toSite';
          myJob = sw2.job;
        }
      }
      // BUILD 1095: the carpenter build — only once the sawmill is
      // done (the carpenter needs timber to be worth building).
      if (f.workState === 'toTree' && !f.treeTarget && !builderTaken && canStartCarpenter(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) {
        const cp2 = claimJob(sim.board, f.id, buildJobIdFor(CARPENTER_SITE_ID));
        sim.board = cp2.board;
        if (cp2.job) {
          f.workState = 'toSite';
          myJob = cp2.job;
        }
      }
      // BUILD 1095: the workshop build — only once the bakery is
      // done (the workshop is the settlement's next building after
      // the food chain). With 0 tools the next step is a tool step
      // and canStartWorkshop is false, so the site sits unstarted:
      // the tools stall, by design (workshopStallReason names it).
      if (f.workState === 'toTree' && !f.treeTarget && !builderTaken && canStartWorkshop(sim.metalChain, sim.foodChain.bakery.state === 'done', (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)), metalChainToolsInRegistry(sim.registry))) {
        const wk2 = claimJob(sim.board, f.id, buildJobIdFor(WORKSHOP_SITE_ID));
        sim.board = wk2.board;
        if (wk2.job) {
          f.workState = 'toSite';
          myJob = wk2.job;
        }
      }
      // BUILD 1096: the inn build — claimed the same way, only
      // once worker housing is done and the settlement is old
      // enough (day >= INN_START_DAY), and only when the pile +
      // storehouse hold a step's wood.
      if (f.workState === 'toTree' && !f.treeTarget && !builderTaken && canStartInn(sim.housing, sim.construction, campWoodInRegistry(sim.registry), storehouseWoodInRegistry(sim.registry), day)) {
        const in2 = claimJob(sim.board, f.id, buildJobIdFor(INN_SITE_ID));
        sim.board = in2.board;
        if (in2.job) {
          f.workState = 'toSite';
          myJob = in2.job;
        }
      }
      // BUILD 1102: the pen build — claimed the same way as a
      // hut (one builder, the claim IS the site), only once the
      // huts and the storehouse are done and the camp holds a
      // meals surplus (the Songs of Syx guardrail — a pen is a
      // luxury, not survival), and only when the camp pile holds
      // a step's wood.
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'harvest' && campFoodInRegistry(sim.registry) < FARM_FOOD_THRESHOLD) {
        const hc = claimNearestJob(sim.board, f.id, 'harvest', FOUNDER_CAMP.x, FOUNDER_CAMP.y, FARM_VILLAGER_RADIUS);
        sim.board = hc.board;
        if (hc.job) {
          f.workState = 'toFarm';
          f.farmTarget = { x: hc.job.tile.x, y: hc.job.tile.y };
          myJob = hc.job;
        }
      }
      // BUILD 1088: watering — the mirror of the real-time tick
      // (same gate: workKind 'water' and food below the threshold).
      // The claim is nearest-first; the job's tile is the farm tile
      // to water, and the founder draws from the well on the way
      // (the 'toWell' leg). The farm is 2 tiles from camp, so no
      // one-founder-at-a-time guard is needed (unlike the quarry
      // — watering never strands a founder far away).
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'water' && campFoodInRegistry(sim.registry) < FARM_FOOD_THRESHOLD) {
        const wc = claimNearestJob(sim.board, f.id, 'water', FOUNDER_CAMP.x, FOUNDER_CAMP.y, FARM_VILLAGER_RADIUS);
        sim.board = wc.board;
        if (wc.job) {
          f.workState = 'toWell';
          f.waterTarget = { x: wc.job.tile.x, y: wc.job.tile.y };
          myJob = wc.job;
        }
      }
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'plant' && campFoodInRegistry(sim.registry) < FARM_FOOD_THRESHOLD) {
        for (;;) {
          const pc = claimNearestJob(sim.board, f.id, 'plant', FOUNDER_CAMP.x, FOUNDER_CAMP.y, FARM_VILLAGER_RADIUS);
          sim.board = pc.board;
          if (!pc.job) break;
          const path = planPathNpc(world, { x: f.x, y: f.y }, { x: pc.job.tile.x, y: pc.job.tile.y });
          if (path && path.length > 0) {
            f.workState = 'toPlant';
            f.farmTarget = { x: pc.job.tile.x, y: pc.job.tile.y };
            myJob = pc.job;
            break;
          }
          sim.board = failJob(sim.board, pc.job.id, 'no-path');
        }
      }
      // BUILD 1089: the mine — the mirror of the real-time tick
      // (same gate: workKind 'mine' and the storehouse below its
      // mineral target). BUILD 1095: two minerals, two slots — the
      // claim picks the short mineral (iron first on a tie) whose
      // slot is free; when the short mineral's slot is taken the
      // founder does not claim the other mineral's job (they fall
      // through to chopping — the scorer's mine term fires only
      // for a short mineral whose slot is free, so the two agree).
      // The claim checks the path from the founder's own position;
      // when no path exists the founder falls through to chopping
      // and the job stays open (never failed — the site is real).
      const ironShort = storehouseOreInRegistry(sim.registry, 'iron') < MINE_IRON_TARGET;
      const coalShort = storehouseOreInRegistry(sim.registry, 'coal') < MINE_COAL_TARGET;
      const claimMineral = ironShort && !ironTaken ? 'iron' : coalShort && !coalTaken ? 'coal' : null;
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'mine' && claimMineral) {
        const mc = claimNearestMineJobForMineral(sim.board, f.id, claimMineral, FOUNDER_CAMP.x, FOUNDER_CAMP.y, FOUNDER_WORK_RADIUS);
        sim.board = mc.board;
        if (mc.job) {
          const mJob = mc.job;
          const site = sim.mines.mines.find((s) => s.id === 'mine:' + mJob.targetId) ?? openMineSites(sim.mines).find((s) => s.mineral === claimMineral);
          if (site && planPathNpc(world, { x: Math.round(f.x), y: Math.round(f.y) }, site.workTile)) {
            f.workState = 'toMine';
            f.mineTarget = { id: site.id, x: site.x, y: site.y };
            f.workTile = { ...site.workTile };
            myJob = mJob;
          } else {
            sim.board = releaseJob(sim.board, mJob.id);
          }
        }
      }
      // BUILD 1089: the lumber — the mirror of the real-time tick
      // (same gate: workKind 'lumber'). The claim is first-in-
      // board-order (claimFirstJob) — discovery inserts the rect
      // row-major, so the crew fells section by section. The
      // execution is the chop path (treeTarget / workTile /
      // 'chopping' / fellTreeToCarrier — which plants the sapling),
      // so the site thins and regrows through the 1.6 path.
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'lumber') {
        const lc = claimFirstJob(sim.board, f.id, 'lumber');
        sim.board = lc.board;
        if (lc.job) {
          const wt = treeWorkTile(world, lc.job.tile.x, lc.job.tile.y);
          if (wt) {
            f.treeTarget = { x: lc.job.tile.x, y: lc.job.tile.y };
            f.workTile = wt;
            myJob = lc.job;
          } else {
            sim.board = failJob(sim.board, lc.job.id, 'no-work-tile');
            ledger.jobsFailed['no-work-tile'] = (ledger.jobsFailed['no-work-tile'] ?? 0) + 1;
          }
        }
      }
      // BUILD 1094: milling — the mirror of the real-time tick
      // (same gate: workKind 'mill'). One miller at a time (the
      // millTaken guard). The claim is the mill job (one job, the
      // mill approach as the tile); the founder walks to the mill
      // ('toMill'), works a 3-tick shift ('milling', grinding per
      // tick), and the job completes at the shift end.
      const millTaken = sim.founders.some((o) => o !== f && (o.workState === 'toMill' || o.workState === 'milling'));
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'mill' && !millTaken) {
        const mc = claimJob(sim.board, f.id, millJobIdFor(MILL_SITE_ID));
        sim.board = mc.board;
        if (mc.job) {
          f.workState = 'toMill';
          f.millTicks = 0;
          myJob = mc.job;
        }
      }
      // BUILD 1094: baking — the mirror of the real-time tick
      // (same gate: workKind 'bake'). One baker at a time.
      const bakeTaken = sim.founders.some((o) => o !== f && (o.workState === 'toBakery' || o.workState === 'baking'));
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'bake' && !bakeTaken) {
        const bc = claimJob(sim.board, f.id, bakeJobIdFor(BAKERY_SITE_ID));
        sim.board = bc.board;
        if (bc.job) {
          f.workState = 'toBakery';
          f.bakeTicks = 0;
          myJob = bc.job;
        }
      }
      // BUILD 1095: smelting — the mirror of the real-time tick
      // (same gate: workKind 'smelt'). One smelter at a time (the
      // smeltTaken guard). The claim is the smelt job (one job,
      // the smelter approach as the tile); the founder walks to
      // the smelter ('toSmelter'), works a 3-tick shift
      // ('smelting', smelting per tick), and the job completes at
      // the shift end.
      const smeltTaken = sim.founders.some((o) => o !== f && (o.workState === 'toSmelter' || o.workState === 'smelting'));
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'smelt' && !smeltTaken) {
        const sc = claimJob(sim.board, f.id, smeltJobIdFor(SMELTER_SITE_ID));
        sim.board = sc.board;
        if (sc.job) {
          f.workState = 'toSmelter';
          f.smeltTicks = 0;
          myJob = sc.job;
        }
      }
      // BUILD 1095: smithing — the same shape (one smith at a time).
      const smithTaken = sim.founders.some((o) => o !== f && (o.workState === 'toSmith' || o.workState === 'smithing'));
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'smith' && !smithTaken) {
        const sb = claimJob(sim.board, f.id, smithJobIdFor(BLACKSMITH_SITE_ID));
        sim.board = sb.board;
        if (sb.job) {
          f.workState = 'toSmith';
          f.smithTicks = 0;
          myJob = sb.job;
        }
      }
      // BUILD 1095: sawing — the same shape (one sawyer at a time).
      const sawTaken = sim.founders.some((o) => o !== f && (o.workState === 'toSawmill' || o.workState === 'sawing'));
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'saw' && !sawTaken) {
        const sw = claimJob(sim.board, f.id, sawJobIdFor(SAWMILL_SITE_ID));
        sim.board = sw.board;
        if (sw.job) {
          f.workState = 'toSawmill';
          f.sawTicks = 0;
          myJob = sw.job;
        }
      }
      // BUILD 1095: carpentering — the same shape (one carpenter at a time).
      const carpenterTaken = sim.founders.some((o) => o !== f && (o.workState === 'toCarpenter' || o.workState === 'carpentering'));
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'carpenter' && !carpenterTaken) {
        const cp = claimJob(sim.board, f.id, carpenterJobIdFor(CARPENTER_SITE_ID));
        sim.board = cp.board;
        if (cp.job) {
          f.workState = 'toCarpenter';
          f.carpenterTicks = 0;
          myJob = cp.job;
        }
      }
      // BUILD 1102: hunting — the mirror of the real-time tick
      // (same gate: workKind 'hunt', day >= 3, one hunter at a
      // time). The claim is nearest-first from the founder, so a
      // hunter who emptied the near band walks further out (the
      // acceptance test — the prey jobs' tiles move outward as
      // the near population falls). The radius is the whole map:
      // prey roam the wild band 100+ tiles from camp, far outside
      // the 60-tile work radius.
      const huntTaken = sim.founders.some((o) => o !== f && (o.workState === 'toPrey' || o.workState === 'hunting'));
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'hunt' && day >= PEN_START_DAY && !huntTaken) {
        const hc = claimNearestJob(sim.board, f.id, 'hunt', Math.round(f.x), Math.round(f.y), 200);
        sim.board = hc.board;
        if (hc.job) {
          const kind = preyKindForTargetId(hc.job.targetId);
          if (kind) {
            f.preyTarget = { id: hc.job.targetId, kind, x: hc.job.tile.x, y: hc.job.tile.y };
            f.animalTicks = 0;
            f.workState = 'toPrey';
            myJob = hc.job;
          } else {
            // An unparseable prey target is a discovery bug, not a
            // deer — release the job instead of hunting the wrong
            // population.
            sim.board = releaseJob(sim.board, hc.job.id);
          }
        }
      }
      // BUILD 1102: fishing — the same shape (one fisher at a
      // time, the river bank tile is the job's tile).
      const fishTaken = sim.founders.some((o) => o !== f && (o.workState === 'toBank' || o.workState === 'fishing'));
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'fish' && day >= PEN_START_DAY && !fishTaken) {
        const fc = claimJob(sim.board, f.id, fishJobIdFor());
        sim.board = fc.board;
        if (fc.job) {
          f.animalTicks = 0;
          f.workState = 'toBank';
          myJob = fc.job;
        }
      }
      // BUILD 1102: shepherding — shear first (the utility pays
      // more for wool than for feeding), then feed. The feed leg
      // picks up its grain at the claim: the founder is at camp,
      // the granary is the camp store, so the withdrawal is
      // instant and the trip is the work (the well-draw
      // precedent — the draw is instant, the trip is the work). A
      // granary that ran dry between discovery and claim leaves
      // the job open instead of walking grain-less to the pen.
      const shepherdTaken = sim.founders.some((o) => o !== f && (o.workState === 'toPen' || o.workState === 'shepherding'));
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'shepherd' && day >= PEN_START_DAY && !shepherdTaken) {
        const shc = claimJob(sim.board, f.id, shepherdJobIdFor(PEN_SHEAR_JOB_ID));
        sim.board = shc.board;
        if (shc.job) {
          f.animalTicks = 0;
          f.workState = 'toPen';
          myJob = shc.job;
        } else {
          const fdc = claimJob(sim.board, f.id, shepherdJobIdFor(PEN_FEED_JOB_ID));
          sim.board = fdc.board;
          if (fdc.job) {
            const g = withdrawFrom(sim.registry, GRANARY_STORE_ID, 'grain', 1);
            sim.registry = g.registry;
            if (g.taken >= 1) {
              f.carryingGrain += 1;
              f.animalTicks = 0;
              f.workState = 'toPen';
              myJob = fdc.job;
            } else {
              sim.board = releaseJob(sim.board, fdc.job.id);
            }
          }
        }
      }
      // BUILD 1086: quarrying — the mirror of the real-time tick
      // (same gate: workKind 'quarry' and the pile below target).
      // BUILD 1089: the crew cap — up to QUARRY_CREW_SIZE founders
      // quarry at once when a site quarry job is open (the crew
      // works the designated site in parallel), else one (the
      // ad-hoc rule). In the 24h window the cap is 1.
      const quarryTaken = sim.founders.filter((o) => o !== f && (o.workState === 'toQuarry' || o.workState === 'mining' || o.carryingStone > 0)).length >= quarryCrewCap;
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && f.lastDecision?.workKind === 'quarry' && !quarryTaken && campStoneInRegistry(sim.registry) < QUARRY_STONE_TARGET) {
        // Nearest-first, but only a REACHABLE rock/deposit is claimed:
        // a rock across a river has a walkable work tile yet no path
        // from camp (the rivers block), and a founder who claims it
        // waits on an empty path forever — Marlow sat 'toQuarry' for
        // 1056 ticks on rock:112,84 across the north river, and the
        // 24h wood ran 48→42 with meals 27→20. An unreachable job
        // is failed off the board ('no-path') and the next-nearest
        // is tried; when none is reachable the founder falls through
        // to chopping (the pile gate below).
        // BUILD 1091 (0x1A): the return is verified to the ACTUAL
        // delivery destination — the storehouse approach once the
        // storehouse is done, camp before that — not just to camp.
        // The return to camp plans fine from rock (158,61) (123
        // steps) but the return to the approach needs >4000 A* nodes,
        // so a founder who claims it mines the stone and then stands
        // at the work tile forever carrying it (the week-health
        // failure: Perrin starved at (157,60) for 4 days). Both
        // returns are verified: the storehouse finishes after the
        // claim, so a rock claimed to camp must also return to the
        // approach once the storehouse is done.
        const returnOk = (wt: { x: number; y: number }) => planPathNpc(world, wt, FOUNDER_CAMP) && planPathNpc(world, wt, STOREHOUSE_APPROACH);
        for (;;) {
          const cand = nearestOpenJob(sim.board, 'quarry', Math.round(f.x), Math.round(f.y), claimQuarryRadius);
          if (!cand) break;
          const wt = quarryWorkTile(world, cand.tile.x, cand.tile.y);
          // BUILD 1087: a round trip, not a one-way ticket — rock
          // (150,77) has an outbound path from camp (133 steps) but
          // its return needs >4000 A* nodes, so a founder who claims
          // it mines the stone and then stands at the work tile
          // forever carrying it (diag D/E). A candidate is claimable
          // only when the return to camp also plans inside the
          // default budget.
          if (wt && planPathNpc(world, { x: Math.round(f.x), y: Math.round(f.y) }, wt) && returnOk(wt)) {
            const claimed = claimJob(sim.board, f.id, cand.id);
            sim.board = claimed.board;
            if (claimed.job) {
              f.workState = 'toQuarry';
              f.quarryTarget = { id: claimed.job.targetId, x: claimed.job.tile.x, y: claimed.job.tile.y };
              f.workTile = wt;
              myJob = claimed.job;
            }
            break;
          }
          sim.board = blockQuarryTarget(failJob(sim.board, cand.id, 'no-path'), cand.targetId);
          ledger.jobsFailed['no-path'] = (ledger.jobsFailed['no-path'] ?? 0) + 1;
        }
      }
      // BUILD 1086: the chop fallback is gated on the PILE, not on
      // the scorer's chopWork — a founder whose activity is 'work'
      // (stone or food) but who cannot claim a harvest/quarry job
      // must NOT fall through to chopping a full pile (the stone
      // term made 'work' win while chopWork was 0, and the 24h wood
      // ran to 78). The pile gate still allows the legitimate
      // fall-through that fills the pile from 16 to 24 (chopWork
      // hits 0 via the distance penalty before the pile is full,
      // so a chopWork gate starves the pile); once the pile is full
      // no more wood is chopped. The gate counts wood already
      // committed (carried + 2 per founder holding a chop job not
      // yet carried), so two founders cannot both claim while wood
      // is in flight and overshoot the pile to 26 (the 24h wood ran
      // 48→50 after the radius cap).
      const woodInFlight1086 = sim.founders.reduce((sum, o) => {
        const oj = jobForFounder(sim.board, o.id);
        return sum + o.carrying + (oj && (oj.kind === 'chop' || oj.kind === 'lumber') && o.carrying === 0 ? 2 : 0);
      }, 0);
      if (f.workState === 'toTree' && !f.treeTarget && pileForWood() + woodInFlight1086 < UTILITY_PILE_FULL) {
        const cc = claimNearestJob(sim.board, f.id, 'chop', FOUNDER_CAMP.x, FOUNDER_CAMP.y, FOUNDER_WORK_RADIUS);
        sim.board = cc.board;
        if (cc.job) {
          const wt = treeWorkTile(world, cc.job.tile.x, cc.job.tile.y);
          if (wt) {
            f.treeTarget = { x: cc.job.tile.x, y: cc.job.tile.y };
            f.workTile = wt;
            myJob = cc.job;
          } else {
            sim.board = failJob(sim.board, cc.job.id, 'no-work-tile');
            ledger.jobsFailed['no-work-tile'] = (ledger.jobsFailed['no-work-tile'] ?? 0) + 1;
          }
        }
        if (!f.treeTarget) f.workState = 'idle';
      }
    }
    // BUILD 1102: the hunt give-up — MOVED out of the claims block
    // (it sat inside `if (... toTree ...)` at 1247, so a toPrey
    // founder never reached it and walked forever at an unreachable
    // prey — diag-hunt: 400 ticks, animalTicks 0, never moved). A
    // hunter who cannot reach the prey in HUNT_GIVE_UP_TICKS fails
    // the job and walks back to chopping (the 1091 quarry precedent).
    if (f.workState === 'toPrey') {
      f.animalTicks++;
      if (f.animalTicks >= HUNT_GIVE_UP_TICKS) {
        if (myJob && myJob.kind === 'hunt') {
          ledger.jobsFailed['give-up'] = (ledger.jobsFailed['give-up'] ?? 0) + 1;
          sim.board = failJob(sim.board, myJob.id, 'give-up');
          myJob = undefined;
        }
        f.workState = 'toTree';
        f.preyTarget = null;
        f.animalTicks = 0;
      }
    }


    // Destination: build/harvest job tiles, the sleep approach, the
    // site approach, else the 1057 destination (carrying → camp,
    // work tile, camp). The site/harvest overrides apply ONLY while
    // the activity is work/build — a builder who chooses eat/rest/
    // sleep must LEAVE the site (or they are pinned there, starving).
    let dest = founderDestination(f);
    // BUILD 1087: the fetch leg walks to the storehouse approach,
    // and a delivery walks there once the storehouse exists (see
    // worldSimulation3d.ts).
    // BUILD 1087: the fetch dest applies only while the founder is
    // working/building (the 1067 harvest guard, same class) — a
    // founder who flips to eat/rest/sleep while fetching must leave
    // the approach (they pin the tile otherwise, and no carrier can
    // arrive to deliver behind them).
    if (f.workState === 'toStorehouse' && (f.activity === 'work' || f.activity === 'build')) dest = { ...STOREHOUSE_APPROACH };
    else if (f.workState === 'toWell' && (f.activity === 'work' || f.activity === 'build')) {
      // BUILD 1088: the well approach (the walkable 4-neighbour
      // nearest camp — the founder comes from camp). Without a
      // well there is no override, and the founderDestination
      // fallback walks them to camp.
      const approach = well ? wellApproachFor(world, well, FOUNDER_CAMP.x, FOUNDER_CAMP.y) : null;
      if (approach) dest = approach;
    } else if (f.workState === 'toWater' && f.waterTarget && (f.activity === 'work' || f.activity === 'build')) dest = { ...f.waterTarget };
    // BUILD 1096: the inn waystation — an arriving founder who has
    // not rested at the inn walks to the inn approach first (the
    // inn sits on the arrival path, so the detour is short).
    else if (f.workState === 'arriving' && isInnUsable(sim.housing) && !f.innRested && (f.activity === 'work' || f.activity === 'build')) dest = { ...INN_APPROACH };
    else if ((f.workState === 'toMill' || f.workState === 'milling') && (f.activity === 'work' || f.activity === 'build')) dest = { ...MILL_APPROACH };
    else if ((f.workState === 'toBakery' || f.workState === 'baking') && (f.activity === 'work' || f.activity === 'build')) dest = { ...BAKERY_APPROACH };
    else if ((f.workState === 'toSmelter' || f.workState === 'smelting') && (f.activity === 'work' || f.activity === 'build')) dest = { ...SMELTER_APPROACH };
    else if ((f.workState === 'toSmith' || f.workState === 'smithing') && (f.activity === 'work' || f.activity === 'build')) dest = { ...BLACKSMITH_APPROACH };
    else if ((f.workState === 'toSawmill' || f.workState === 'sawing') && (f.activity === 'work' || f.activity === 'build')) dest = { ...SAWMILL_APPROACH };
    else if ((f.workState === 'toCarpenter' || f.workState === 'carpentering') && (f.activity === 'work' || f.activity === 'build')) dest = { ...CARPENTER_APPROACH };
    // BUILD 1091 (0x1A): the delivery and build dests apply ONLY
    // while the founder is working/building — the same rule the
    // fetch/well/water/harvest/plant overrides already follow. A
    // carrier who flips to eat/rest/sleep must LEAVE the storehouse
    // approach (and a builder must leave the site): without the
    // gate a carrier whose delivery cannot complete — a far quarry
    // rock whose return to the approach needs >4000 A* nodes, or a
    // full granary (grain has no camp overflow) — is pinned at the
    // approach carrying goods, starving beside 15 meals. Perrin
    // sat at (157,60) for 4 days and five founders piled up at the
    // approach on day 7; the week ran 11,315 starved ticks.
    else if (f.workState === 'toStockpile' && sim.storehouse.state === 'done' && (f.activity === 'work' || f.activity === 'build')) dest = { ...STOREHOUSE_APPROACH };
    else if (myJob && myJob.kind === 'build' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if (myJob && myJob.kind === 'harvest' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if (myJob && myJob.kind === 'plant' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if (myJob && myJob.kind === 'mill' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if (myJob && myJob.kind === 'bake' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if (myJob && myJob.kind === 'smelt' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if (myJob && myJob.kind === 'smith' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if (myJob && myJob.kind === 'saw' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if (myJob && myJob.kind === 'carpenter' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if ((f.workState === 'toPrey' || f.workState === 'hunting') && (f.activity === 'work' || f.activity === 'build')) dest = f.preyTarget ? { x: f.preyTarget.x, y: f.preyTarget.y } : (myJob ? myJob.tile : { x: Math.round(f.x), y: Math.round(f.y) });
    else if ((f.workState === 'toBank' || f.workState === 'fishing') && (f.activity === 'work' || f.activity === 'build')) dest = myJob ? myJob.tile : { x: Math.round(f.x), y: Math.round(f.y) };
    else if ((f.workState === 'toPen' || f.workState === 'shepherding') && (f.activity === 'work' || f.activity === 'build')) dest = { ...PEN_APPROACH };
    else if (f.activity === 'sleep' && hutPlaced && f.bed.hut >= 0) dest = HUT_SITES[f.bed.hut]?.approach ?? HUT_APPROACH;
    else if ((f.activity === 'work' || f.activity === 'build') && (f.workState === 'toSite' || f.workState === 'building'))
      dest = buildSite ? buildSite.approach : HUT_APPROACH;
    const cx = Math.round(f.x);
    const cy = Math.round(f.y);
    const atDest = cx === dest.x && cy === dest.y;
    if (!insideHut || f.activity !== 'sleep') {
      if (!atDest) {
        let p = sim.paths.get(f.name);
        if (!p) {
          p = emptyFounderPath();
          sim.paths.set(f.name, p);
        }
        const occupied = (x: number, y: number) =>
          sim.founders.some((o) => o !== f && Math.round(o.x) === x && Math.round(o.y) === y);
        const res = stepFounderMove(world, { x: cx, y: cy }, dest, p, occupied);
        sim.paths.set(f.name, res.path);
        if (res.pos.x !== cx || res.pos.y !== cy) {
          f.x = res.pos.x;
          f.y = res.pos.y;
        }
        if (res.arrived) sim.paths.delete(f.name);
        // BUILD 1088: the path layer — every founder step is
        // traffic; at 8 passes a walkable tile becomes a dirt path
        // (the founders lay the path by walking it), and a new
        // path tile beside a river opens a bridge site.
        if (res.pos.x !== cx || res.pos.y !== cy) {
          const placedPath = recordTraffic(sim.pathState, world, res.pos.x, res.pos.y);
          if (placedPath) {
            // The traffic call only names the tile — the caller
            // places it (validate + addPlacement), then a new path
            // tile beside a river opens a bridge site.
            const placePath = validatePlacement(world, 'path', placedPath.x, placedPath.y, { x: 0, y: 0 }, [], 0);
            if (placePath.ok) {
              addPlacement(world, placePath.item);
              ledger.pathTilesPlaced++;
              detectBridgeSite(world, sim.pathState, placedPath, day);
            }
          }
        }
      }
    }

    if (atDest || (Math.round(f.x) === dest.x && Math.round(f.y) === dest.y)) {
      // Arrived: act on the destination.
      // BUILD 1079 (0x0E): the delivery runs by workState, not
      // activity — the driver mirrors the view's fix. A founder who
      // flips to rest/eat/sleep while carrying must still deliver
      // when they reach their destination (see worldSimulation3d.ts).
      if (f.workState === 'toStockpile' && (f.carrying > 0 || f.carryingGrain > 0 || f.carryingStone > 0 || f.carryingBuild > 0 || f.carryingOre > 0 || f.carryingMeat > 0 || f.carryingLeather > 0 || f.carryingFish > 0 || f.carryingWool > 0)) {
        // The delivery runs only on a held deliver job — the transfer
        // IS the job's completion. Without the job (claimed next tick)
        // the founder waits at camp; the wood never moves without a job.
        if (myJob && myJob.kind === 'deliver') {
          // BUILD 1087: the delivery lands in the delivery store
          // (the storehouse when it exists, the camp pile before
          // that) — wood, stone, and carried build wood go to the
          // store; grain always goes to camp. The ledger splits by
          // destination, so the M1087 section can prove the
          // storehouse actually received wood/stone.
          // BUILD 1089: the delivery moves ore too (iron to the
          // storehouse store — the mine's yield).
          const res = deliverFounderCarryToStore(sim.registry, f, sim.storehouse);
          sim.registry = res.registry;
          f.carrying -= res.movedWood;
          f.carryingGrain -= res.movedGrain;
          f.carryingStone -= res.movedStone;
          f.carryingBuild -= res.movedBuildWood;
          f.carryingOre -= res.movedOre;
          f.carryingMeat -= res.movedMeat;
          f.carryingLeather -= res.movedLeather;
          f.carryingFish -= res.movedFish;
          f.carryingWool -= res.movedWool;
          ledger.woodDelivered += res.movedWood;
          ledger.grainDelivered += res.movedGrain;
          ledger.stoneDelivered += res.movedStone;
          ledger.oreDelivered += res.movedIron;
          ledger.coalDelivered += res.movedCoal;
          ledger.meatDelivered += res.movedMeat;
          ledger.fishDelivered += res.movedFish;
          ledger.leatherDelivered += res.movedLeather;
          ledger.woolDelivered += res.movedWool;
          if (res.dest === STOREHOUSE_STORE_ID) {
            ledger.storehouseWoodDelivered += res.movedWood + res.movedBuildWood;
            ledger.storehouseStoneDelivered += res.movedStone;
            ledger.storehouseOreDelivered += res.movedIron;
            ledger.storehouseCoalDelivered += res.movedCoal;
          }
          if (f.carrying <= 0 && f.carryingGrain <= 0 && f.carryingStone <= 0 && f.carryingBuild <= 0 && f.carryingOre <= 0 && f.carryingMeat <= 0 && f.carryingLeather <= 0 && f.carryingFish <= 0 && f.carryingWool <= 0) {
            f.carrying = 0;
            f.carryingGrain = 0;
            f.carryingStone = 0;
            f.carryingBuild = 0;
            f.carryingOre = 0;
            f.carryingMeat = 0;
            f.carryingLeather = 0;
            f.carryingFish = 0;
            f.carryingWool = 0;
            f.carryingOreKind = null;
            f.workState = 'toTree';
            ledger.jobsCompleted.deliver++;
            sim.board = completeJob(sim.board, myJob.id);
            myJob = undefined;
          }
        }
      } else if (f.workState === 'toStockpile') {
        f.workState = 'toTree';
      } else if (f.activity === 'sleep' && hutPlaced && f.bed.hut >= 0 && !insideHut) {
        // Through the door to their bed (their hut sleep tile).
        const bed = f.bed;
        f.x = bed.x;
        f.y = bed.y;
        sim.paths.delete(f.name);
      } else if (f.activity === 'work' || f.activity === 'build') {
        if (f.workState === 'arriving') {
          // BUILD 1096: the inn is a waystation — a newcomer who
          // has not rested there stops at the inn approach, rests
          // inside (energy to full, one meal from the inn store),
          // then walks on to camp. The rest is a real activity
          // (the scorer is skipped while 'arriving', so the 'rest'
          // holds until the stay runs out).
          if (isInnUsable(sim.housing) && !f.innRested && Math.round(f.x) === INN_APPROACH.x && Math.round(f.y) === INN_APPROACH.y) {
            f.innRested = true;
            f.innRestTicks = INN_REST_TICKS;
            const taken = new Set(
              sim.founders.filter((o) => o !== f && o.restTile).map((o) => o.restTile!.x + ',' + o.restTile!.y),
            );
            const restTile = innRestTileFor(taken) ?? { x: INN_REST_TILES[0].x, y: INN_REST_TILES[0].y };
            f.activity = 'rest';
            f.restTile = restTile;
            // Through the door to the rest tile (the hut sleep
            // teleport's shape — the inn interior is not walked).
            f.x = restTile.x;
            f.y = restTile.y;
            sim.paths.delete(f.name);
            f.needs = { ...f.needs, energy: 100 };
            const meal = eatInnMeal(f.needs, innFoodInRegistry(sim.registry));
            if (meal.ate) {
              const w = withdrawFrom(sim.registry, INN_STORE_ID, 'food', 1);
              sim.registry = w.registry;
              if (w.taken >= 1) {
                f.needs = meal.needs;
                ledger.innMeals++;
              }
            }
            ledger.innRests++;
          } else {
            // A newcomer reached camp on foot — they join the workforce.
            f.workState = 'toTree';
            // BUILD 1103: Tamsin is welcomed — every founder gains
            // her key (neutral 50, dated today). Pool arrivals keep
            // the old shape (no keys).
            if (f.name === NEWCOMER_NAME) {
              for (const o of sim.founders) {
                if (o !== f) o.social = addSocialKey(o.social, f.name, day);
              }
            }
            sim.paths.delete(f.name);
          }
        } else if (f.workState === 'toStorehouse') {
          // BUILD 1087: at the storehouse approach — fetch the
          // step's wood (2) from the storehouse store into the
          // carrier, then walk to the site. A short fetch (0) falls
          // back to the site — the step spends from the camp pile
          // instead (see worldSimulation3d.ts).
          const fetched = fetchBuildWood(sim.registry, f);
          sim.registry = fetched.registry;
          f.carryingBuild = fetched.moved;
          ledger.buildWoodFetched += fetched.moved;
          f.workState = 'toSite';
        } else if (f.workState === 'toWell') {
          // BUILD 1088: at the well approach — draw one bucket of
          // water, then walk to the farm tile to pour it. The draw
          // is instant (the fetch leg's precedent) — the trip is
          // the work, not the drawing. If the well is gone, the
          // founder re-targets with nothing carried.
          if (well) {
            f.carryingWater = 1;
            ledger.waterDrawn++;
            f.workState = 'toWater';
          } else {
            f.carryingWater = 0;
            f.waterTarget = null;
            f.workState = 'toTree';
          }
        } else if (f.workState === 'toWater') {
          // BUILD 1088: at the farm tile — pour the bucket (the
          // tile grows 60 game-minutes faster) and complete the
          // water job. A tile that is no longer waterable (watered
          // by another founder first, or grown ready) spills the
          // bucket and fails the job — the water never strands in
          // the carrier.
          if (f.waterTarget && waterFarmTile(world, f.waterTarget.x, f.waterTarget.y, nowAbs).ok) {
            ledger.tilesWatered++;
            if (myJob && myJob.kind === 'water') {
              ledger.jobsCompleted.water++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
            }
          } else {
            if (f.carryingWater > 0) ledger.waterSpilled += f.carryingWater;
            if (myJob && myJob.kind === 'water') {
              ledger.jobsFailed['target-gone'] = (ledger.jobsFailed['target-gone'] ?? 0) + 1;
              sim.board = failJob(sim.board, myJob.id, 'target-gone');
              myJob = undefined;
            }
          }
          f.carryingWater = 0;
          f.waterTarget = null;
          f.workState = 'toTree';
        } else if (f.workState === 'toSite') {
          f.workState = 'building';
          f.buildTicks = 0;
        } else if (f.workState === 'building') {
          f.buildTicks++;
          if (f.buildTicks >= HUT_TICKS_PER_STEP) {
            f.buildTicks = 0;
            // BUILD 1087: three step paths, one shared completion
            // (see worldSimulation3d.ts) — the storehouse's own step
            // draws from the camp pile; a hut step spends the CARRIED
            // wood when the builder fetched it, else the camp pile.
            let step: { registry: ResourceRegistry; construction: ConstructionState; storehouse: StorehouseState; foodChain: FoodChainState; metalChain: MetalChainState; completed: boolean; spent: boolean } | null = null;
            const isStorehouseJob = myJob && myJob.kind === 'build' && myJob.targetId === STOREHOUSE_SITE_ID;
            const isBridgeJob = myJob && myJob.kind === 'build' && myJob.targetId.startsWith('bridge-');
            const isMillJob = myJob && myJob.kind === 'build' && myJob.targetId === MILL_SITE_ID;
            const isBakeryJob = myJob && myJob.kind === 'build' && myJob.targetId === BAKERY_SITE_ID;
            const isSmelterJob = myJob && myJob.kind === 'build' && myJob.targetId === SMELTER_SITE_ID;
            const isBlacksmithJob = myJob && myJob.kind === 'build' && myJob.targetId === BLACKSMITH_SITE_ID;
            const isSawmillJob = myJob && myJob.kind === 'build' && myJob.targetId === SAWMILL_SITE_ID;
            const isCarpenterJob = myJob && myJob.kind === 'build' && myJob.targetId === CARPENTER_SITE_ID;
            const isWorkshopJob = myJob && myJob.kind === 'build' && myJob.targetId === WORKSHOP_SITE_ID;
            const isInnJob = myJob && myJob.kind === 'build' && myJob.targetId === INN_SITE_ID;
            const isPenJob = myJob && myJob.kind === 'build' && myJob.targetId === PEN_SITE_ID;
            if (isBridgeJob) {
              // BUILD 1088: a bridge step — 2 wood from the camp
              // pile, the progress rises by 1 (spendBridgeStepFrom-
              // Registry); at the last step the bridge is READY but
              // the state stays 'building' until the placement
              // actually lands (finishBridge, below) — the hut and
              // storehouse's ready/done split.
              const site = bridgeSiteById(sim.pathState.bridges, myJob!.targetId);
              if (site && canBuildBridge(site, campWoodInRegistry(sim.registry))) {
                const brRes = spendBridgeStepFromRegistry(sim.registry, sim.pathState.bridges, myJob!.targetId);
                sim.pathState = { ...sim.pathState, bridges: brRes.bridges };
                if (brRes.spent || brRes.completed) {
                  if (brRes.spent) ledger.bridgeWoodSpent += BRIDGE_WOOD_PER_STEP;
                  step = { registry: brRes.registry, construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: sim.metalChain, completed: brRes.completed, spent: brRes.spent };
                }
              }
            } else if (isMillJob) {
              // BUILD 1094: a mill step — 1 wood from the camp pile,
              // the progress rises by 1 (spendMillStepFromRegistry);
              // at the last step the mill is READY but the state
              // stays 'building' until the placement actually lands
              // (finishMill, below) — the hut and storehouse's
              // ready/done split.
              if (canBuildMill(sim.foodChain, campWoodInRegistry(sim.registry))) {
                const mRes = spendMillStepFromRegistry(sim.registry, sim.foodChain);
                if (mRes.spent || mRes.completed) {
                  if (mRes.spent) ledger.millWoodSpent += MILL_WOOD_PER_STEP;
                  step = { registry: mRes.registry, construction, storehouse: sim.storehouse, foodChain: mRes.foodChain, metalChain: sim.metalChain, completed: mRes.completed, spent: mRes.spent };
                }
              }
            } else if (isBakeryJob) {
              // BUILD 1094: a bakery step — same shape as the mill.
              if (canBuildBakery(sim.foodChain, campWoodInRegistry(sim.registry))) {
                const bRes = spendBakeryStepFromRegistry(sim.registry, sim.foodChain);
                if (bRes.spent || bRes.completed) {
                  if (bRes.spent) ledger.bakeryWoodSpent += BAKERY_WOOD_PER_STEP;
                  step = { registry: bRes.registry, construction, storehouse: sim.storehouse, foodChain: bRes.foodChain, metalChain: sim.metalChain, completed: bRes.completed, spent: bRes.spent };
                }
              }
            } else if (isSmelterJob) {
              // BUILD 1095: a smelter step — 1 wood from the camp
              // pile, the progress rises by 1; at the last step the
              // smelter is READY but the state stays 'building'
              // until the placement actually lands (finishSmelter,
              // below) — the mill's ready/done split.
              if (canBuildSmelter(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) {
                const sRes = spendSmelterStepFromRegistry(sim.registry, sim.metalChain);
                if (sRes.spent || sRes.completed) {
                  if (sRes.spent) ledger.smelterWoodSpent += SMELTER_WOOD_PER_STEP;
                  step = { registry: sRes.registry, construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: sRes.metalChain, completed: sRes.completed, spent: sRes.spent };
                }
              }
            } else if (isBlacksmithJob) {
              // BUILD 1095: a blacksmith step — the same shape.
              if (canBuildBlacksmith(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) {
                const bRes2 = spendBlacksmithStepFromRegistry(sim.registry, sim.metalChain);
                if (bRes2.spent || bRes2.completed) {
                  if (bRes2.spent) ledger.blacksmithWoodSpent += BLACKSMITH_WOOD_PER_STEP;
                  step = { registry: bRes2.registry, construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: bRes2.metalChain, completed: bRes2.completed, spent: bRes2.spent };
                }
              }
            } else if (isSawmillJob) {
              // BUILD 1095: a sawmill step — the same shape.
              if (canBuildSawmill(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) {
                const swRes = spendSawmillStepFromRegistry(sim.registry, sim.metalChain);
                if (swRes.spent || swRes.completed) {
                  if (swRes.spent) ledger.sawmillWoodSpent += SAWMILL_WOOD_PER_STEP;
                  step = { registry: swRes.registry, construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: swRes.metalChain, completed: swRes.completed, spent: swRes.spent };
                }
              }
            } else if (isCarpenterJob) {
              // BUILD 1095: a carpenter step — the same shape.
              if (canBuildCarpenter(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)))) {
                const cpRes = spendCarpenterStepFromRegistry(sim.registry, sim.metalChain);
                if (cpRes.spent || cpRes.completed) {
                  if (cpRes.spent) ledger.carpenterWoodSpent += CARPENTER_WOOD_PER_STEP;
                  step = { registry: cpRes.registry, construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: cpRes.metalChain, completed: cpRes.completed, spent: cpRes.spent };
                }
              }
            } else if (isWorkshopJob) {
              // BUILD 1095: a workshop step — 2 wood from the camp
              // pile, and on a tool step 1 tool from the storehouse
              // store. canBuildWorkshop gates the tool step, so a
              // builder with no tool does nothing here (the stall:
              // the site sits at its progress until tools exist).
              if (canBuildWorkshop(sim.metalChain, (campWoodInRegistry(sim.registry) + storehouseWoodInRegistry(sim.registry)), metalChainToolsInRegistry(sim.registry))) {
                const wRes = spendWorkshopStepFromRegistry(sim.registry, sim.metalChain);
                if (wRes.spent || wRes.completed) {
                  if (wRes.spent) {
                    ledger.workshopWoodSpent += WORKSHOP_WOOD_PER_STEP;
                    ledger.workshopToolsSpent += wRes.spentTools;
                  }
                  step = { registry: wRes.registry, construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: wRes.metalChain, completed: wRes.completed, spent: wRes.spent };
                }
              }
            } else if (isInnJob) {
              // BUILD 1096: an inn step — 1 wood from the pile +
              // storehouse (buildInnStep, withdrawChainWood); at the
              // last step the inn is READY but the state stays
              // 'building' until the placement actually lands
              // (finishInn, below) — the mill's ready/done split.
              if (canBuildInn(sim.housing, campWoodInRegistry(sim.registry), storehouseWoodInRegistry(sim.registry))) {
                const iRes = buildInnStep(sim.registry, sim.housing);
                sim.housing = iRes.housing;
                if (iRes.spent || iRes.completed) {
                  if (iRes.spent) ledger.innWoodSpent += INN_WOOD_PER_STEP;
                  step = { registry: iRes.registry, construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: sim.metalChain, completed: iRes.completed, spent: iRes.spent };
                }
              }
            } else if (isPenJob) {
              // BUILD 1102: a pen step — 2 wood from the camp pile,
              // the progress rises by 1 (spendPenStepFromRegistry);
              // at the last step the pen is READY but the state
              // stays 'building' until the placement actually lands
              // (finishPen, below) — the mill's ready/done split.
              // The pile is empty once the storehouse is done
              // (deliveries go there), so the pen stalled at 5/6:
              // transfer a step's wood from the storehouse to the
              // pile (both are camp stores) when the pile is short,
              // then spend from the pile as before.
              if (campWoodInRegistry(sim.registry) < PEN_WOOD_PER_STEP && storehouseWoodInRegistry(sim.registry) >= PEN_WOOD_PER_STEP) {
                const tr = transfer(sim.registry, STOREHOUSE_STORE_ID, CAMP_STORE_ID, 'wood', PEN_WOOD_PER_STEP, { type: 'loaded' });
                sim.registry = tr.registry;
              }
              if (canBuildPen(sim.pen, campWoodInRegistry(sim.registry))) {
                const pRes = spendPenStepFromRegistry(sim.registry, sim.pen);
                sim.pen = pRes.pen;
                if (pRes.spent || pRes.completed) {
                  if (pRes.spent) ledger.penWoodSpent += PEN_WOOD_PER_STEP;
                  step = { registry: pRes.registry, construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: sim.metalChain, completed: pRes.completed, spent: pRes.spent };
                }
              }
            } else if (isStorehouseJob) {
              if (canBuildStorehouse(sim.storehouse, campWoodInRegistry(sim.registry), campStoneInRegistry(sim.registry))) {
                const shRes = spendStorehouseStepFromRegistry(sim.registry, sim.storehouse);
                if (shRes.spent || shRes.completed) {
                  step = { registry: shRes.registry, construction, storehouse: shRes.storehouse, foodChain: sim.foodChain, metalChain: sim.metalChain, completed: shRes.completed, spent: shRes.spent };
                  if (shRes.spent) {
                    ledger.storehouseWoodSpent += STOREHOUSE_WOOD_PER_STEP;
                    ledger.storehouseStoneSpent += STOREHOUSE_STONE_PER_STEP;
                  }
                }
              }
            } else if (f.carryingBuild > 0) {
              const jobSite = hutSiteById(myJob && myJob.kind === 'build' ? myJob.targetId : '');
              const jobSiteIndex = jobSite ? hutSiteIndexById(jobSite.id) : -1;
              const res = spendBuildStepFromCarried(sim.registry, construction, f, jobSiteIndex >= 0 ? jobSiteIndex : undefined);
              if (res.spent || res.completed) {
                if (res.spent) {
                  f.carryingBuild -= HUT_WOOD_PER_STEP;
                  ledger.woodSpent += HUT_WOOD_PER_STEP;
                  ledger.carriedStepsSpent++;
                }
                step = { registry: res.registry, construction: res.construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: sim.metalChain, completed: res.completed, spent: res.spent };
              }
            } else if (campWoodInRegistry(sim.registry) >= HUT_WOOD_PER_STEP || hasReadyHutSite(construction)) {
              // BUILD 1087 (ready-site fix, part 2): the placement-retry
              // path — a ready site spends nothing, so the branch must
              // fire even when the camp pile is empty (see
              // worldSimulation3d.ts).
              const jobSite = hutSiteById(myJob && myJob.kind === 'build' ? myJob.targetId : '');
              const jobSiteIndex = jobSite ? hutSiteIndexById(jobSite.id) : -1;
              const res = spendBuildStepFromRegistry(sim.registry, construction, jobSiteIndex >= 0 ? jobSiteIndex : undefined);
              if (res.spent || res.completed) {
                if (res.spent) ledger.woodSpent += HUT_WOOD_PER_STEP;
                step = { registry: res.registry, construction: res.construction, storehouse: sim.storehouse, foodChain: sim.foodChain, metalChain: sim.metalChain, completed: res.completed, spent: res.spent };
              }
            }
            if (step) {
              sim.registry = step.registry;
              construction = step.construction;
              sim.construction = construction;
              sim.storehouse = step.storehouse;
              sim.foodChain = step.foodChain;
              sim.metalChain = step.metalChain;
              // A shared build step — the builder plus every founder
              // chopping for the hut built it together.
              for (const o of sim.founders) {
                if (o !== f && (o.activity === 'work' || o.activity === 'build')) {
                  f.social = recordSharedEvent(f.social, o.name, 'build', day, nowAbs);
                  o.social = recordSharedEvent(o.social, f.name, 'build', day, nowAbs);
                }
              }
              if (step.completed) {
                const npcTiles = sim.founders.map((o) => ({ x: Math.round(o.x), y: Math.round(o.y) }));
                if (isBridgeJob) {
                  // BUILD 1088: stamp the bridge through the same
                  // placement path the player uses (validatePlacement
                  // 'bridge' requires a water tile — the river tile
                  // the site spans). The tile may be occupied this
                  // tick (a founder crossing it) — then the builder
                  // waits at the site and retries next cycle; the
                  // progress is banked, no wood is spent twice (the
                  // ready-site rule).
                  const site = bridgeSiteById(sim.pathState.bridges, myJob!.targetId);
                  const placed = site
                    ? validatePlacement(world, 'bridge', site.x, site.y, { x: 0, y: 0 }, npcTiles, 0)
                    : { ok: false as const, reason: 'no site' };
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.pathState = { ...sim.pathState, bridges: finishBridge(sim.pathState.bridges, myJob!.targetId) };
                    ledger.bridgesCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isMillJob) {
                  // Stamp the mill through the same placement path
                  // the player uses (the 'house-windmill' kind, the
                  // surveyed centre). The rect may be occupied this
                  // tick — then the builder waits and retries next
                  // cycle; the progress is banked, no wood is spent
                  // twice (the ready-site rule).
                  const placed = validatePlacement(world, 'house-windmill', MILL_CENTRE.x, MILL_CENTRE.y, { x: 0, y: 0 }, npcTiles, 0);
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.foodChain = finishMill(sim.foodChain);
                    ledger.millsCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isBakeryJob) {
                  // Stamp the bakery the same way (the 'house' kind
                  // on the surveyed centre — there is no
                  // 'house-bakery' palette kind).
                  const placed = validatePlacement(world, 'house', BAKERY_CENTRE.x, BAKERY_CENTRE.y, { x: 0, y: 0 }, npcTiles, 0);
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.foodChain = finishBakery(sim.foodChain);
                    ledger.bakeriesCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isSmelterJob) {
                  // Stamp the smelter through the same placement path
                  // the player uses (the 'house' kind on the surveyed
                  // centre — there is no 'house-smelter' palette kind).
                  const placed = validatePlacement(world, 'house', SMELTER_CENTRE.x, SMELTER_CENTRE.y, { x: 0, y: 0 }, npcTiles, 0);
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.metalChain = finishSmelter(sim.metalChain);
                    ledger.smeltersCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isBlacksmithJob) {
                  // Stamp the blacksmith the same way — as a 3x3
                  // 'house', NOT the 5x4 'house-smith' town kind.
                  // BUILD 1095 (the week-run fix): the chain
                  // blacksmith is a 3x3 production site; the
                  // 5x4 'house-smith' rect would hit the market
                  // stall at (114,116), and the town's EXISTING
                  // smithy already occupies the old (118,118)
                  // site, so a 'house-smith' stamp could never
                  // land there.
                  const placed = validatePlacement(world, 'house', BLACKSMITH_CENTRE.x, BLACKSMITH_CENTRE.y, { x: 0, y: 0 }, npcTiles, 0);
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.metalChain = finishBlacksmith(sim.metalChain);
                    ledger.blacksmithsCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isSawmillJob) {
                  // Stamp the sawmill the same way (the 'house' kind
                  // on the surveyed centre).
                  const placed = validatePlacement(world, 'house', SAWMILL_CENTRE.x, SAWMILL_CENTRE.y, { x: 0, y: 0 }, npcTiles, 0);
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.metalChain = finishSawmill(sim.metalChain);
                    ledger.sawmillsCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isCarpenterJob) {
                  // Stamp the carpenter the same way.
                  const placed = validatePlacement(world, 'house', CARPENTER_CENTRE.x, CARPENTER_CENTRE.y, { x: 0, y: 0 }, npcTiles, 0);
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.metalChain = finishCarpenter(sim.metalChain);
                    ledger.carpentersCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isWorkshopJob) {
                  // Stamp the workshop the same way.
                  const placed = validatePlacement(world, 'house', WORKSHOP_CENTRE.x, WORKSHOP_CENTRE.y, { x: 0, y: 0 }, npcTiles, 0);
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.metalChain = finishWorkshop(sim.metalChain);
                    ledger.workshopsCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isInnJob) {
                  // Stamp the inn through the same placement path
                  // the player uses (the 'house-inn' kind, the
                  // surveyed centre — the measured 6x5 variant).
                  // The rect may be occupied this tick — then the
                  // builder waits and retries next cycle; the
                  // progress is banked, no wood is spent twice
                  // (the ready-site rule).
                  const placed = validatePlacement(world, 'house-inn', INN_CENTRE.x, INN_CENTRE.y, { x: 0, y: 0 }, npcTiles, 0);
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.housing = finishInn(sim.housing);
                    ledger.innsCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isPenJob) {
                  // Stamp the pen's fence through the same placement
                  // path the player uses (the 'fence' kind, 1x1
                  // blocking, like a placed wall). The rect may be
                  // occupied this tick — then the builder waits and
                  // retries next cycle; the progress is banked, no
                  // wood is spent twice (the ready-site rule).
                  const fenced = new Set(placedFenceTiles(world).map((t) => t.tx + ',' + t.ty));
                  const fenceTiles: Array<{ x: number; y: number }> = [];
                  for (let x = PEN_RECT.x0; x <= PEN_RECT.x1; x++) {
                    fenceTiles.push({ x, y: PEN_RECT.y0 });
                    fenceTiles.push({ x, y: PEN_RECT.y1 });
                  }
                  for (let y = PEN_RECT.y0 + 1; y <= PEN_RECT.y1 - 1; y++) {
                    fenceTiles.push({ x: PEN_RECT.x0, y });
                    fenceTiles.push({ x: PEN_RECT.x1, y });
                  }
                  let fenceOk = true;
                  for (const t of fenceTiles) {
                    if (fenced.has(t.x + ',' + t.y)) continue;
                    const placed = validatePlacement(world, 'fence', t.x, t.y, { x: 0, y: 0 }, npcTiles, 0);
                    if (!placed.ok) { fenceOk = false; break; }
                    addPlacement(world, placed.item);
                    fenced.add(t.x + ',' + t.y);
                  }
                  if (fenceOk) {
                    sim.pen = finishPen(sim.pen);
                    const stocked = stockPenFromWild(sim.pen, world);
                    sim.pen = stocked.pen;
                    ledger.pensCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else if (isStorehouseJob) {
                  // Stamp the storehouse through the same placement
                  // path the player uses (the sim has no player, so
                  // the player tile is a dummy — the rect may be
                  // occupied this tick, then the builder waits and
                  // retries next cycle; the progress is banked, no
                  // wood is spent twice).
                  const placed = validatePlacement(world, STOREHOUSE_KIND, STOREHOUSE_HUT_SITE.centre.x, STOREHOUSE_HUT_SITE.centre.y, { x: 0, y: 0 }, npcTiles, 0);
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.storehouse = finishStorehouse(sim.storehouse);
                    ledger.storehouseCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                } else {
                  // Stamp the hut through the same placement path the
                  // player uses. The rect may be occupied this tick (a
                  // founder crossing it) — then the builder waits at the
                  // site and retries next cycle; the progress is banked,
                  // no wood is spent twice.
                  const jobSite = hutSiteById(myJob && myJob.kind === 'build' ? myJob.targetId : '');
                  const jobSiteIndex = jobSite ? hutSiteIndexById(jobSite.id) : -1;
                  const site = jobSite ?? buildSite;
                  const placed = site
                    ? validatePlacement(world, HUT_KIND, site.centre.x, site.centre.y, { x: 0, y: 0 }, npcTiles, 0)
                    : { ok: false as const, reason: 'no site' };
                  if (placed.ok) {
                    addPlacement(world, placed.item);
                    sim.construction = finishConstruction(construction, jobSiteIndex >= 0 ? jobSiteIndex : undefined);
                    construction = sim.construction;
                    ledger.hutsCompleted++;
                    if (myJob && myJob.kind === 'build') {
                      ledger.jobsCompleted.build++;
                      sim.board = completeJob(sim.board, myJob.id);
                      myJob = undefined;
                    }
                    f.workState = 'toTree';
                  } else {
                    ledger.placementRetries++;
                  }
                }
              }
            } else if (!isBridgeJob && !isStorehouseJob && sim.storehouse.state === 'done' && storehouseWoodInRegistry(sim.registry) >= HUT_WOOD_PER_STEP) {
              // BUILD 1087: the step's wood is in the storehouse,
              // not the camp pile — walk back and fetch it instead
              // of releasing the site (deliveries land in the
              // storehouse while it is done, so the camp pile will
              // not refill on its own).
              f.workState = 'toStorehouse';
              f.buildTicks = 0;
            } else {
              // No step could start: the pile ran dry mid-build (hut:
              // camp wood < 2; storehouse: camp wood < 2 or stone <
              // 1) — back to chopping, and the site is released, so
              // another founder can take it when wood returns.
              if (myJob && myJob.kind === 'build') {
                sim.board = releaseJob(sim.board, myJob.id);
                myJob = undefined;
              }
              f.workState = 'toTree';
              f.treeTarget = null;
              f.workTile = null;
            }
          }
        } else if (f.workState === 'toTree' && f.treeTarget) {
          f.workState = 'chopping';
          f.chopTicks = 0;
        } else if (f.workState === 'chopping' && f.treeTarget) {
          f.chopTicks++;
          if (f.chopTicks >= FOUNDER_CHOP_TICKS) {
            const fell = fellTreeToCarrier(sim.registry, world, f, f.treeTarget.x, f.treeTarget.y);
            sim.registry = fell.registry;
            if (fell.yield > 0) {
              f.carrying = fell.yield;
              ledger.woodChopped += fell.yield;
              // BUILD 1089: a lumber job completes the same way
              // (the fell is the same — the tree was a rect tree,
              // and the sapling is planted by the fell).
              if (myJob && (myJob.kind === 'chop' || myJob.kind === 'lumber')) {
                if (myJob.kind === 'lumber') {
                  ledger.jobsCompleted.lumber++;
                  ledger.lumberTreesFelled++;
                  if (sim.mines.lumber) sim.mines = { ...sim.mines, lumber: { ...sim.mines.lumber, treesFelled: sim.mines.lumber.treesFelled + 1 } };
                } else {
                  ledger.jobsCompleted.chop++;
                }
                sim.board = completeJob(sim.board, myJob.id);
                myJob = undefined;
              }
              const dc = claimDeliverJobFor(sim.board, f.id, f.carrying, nowAbs);
              sim.board = dc.board;
              if (dc.job) myJob = dc.job;
            } else if (myJob && (myJob.kind === 'chop' || myJob.kind === 'lumber')) {
              ledger.jobsFailed['target-gone'] = (ledger.jobsFailed['target-gone'] ?? 0) + 1;
              sim.board = failJob(sim.board, myJob.id, 'target-gone');
              myJob = undefined;
            }
            f.treeTarget = null;
            f.workTile = null;
            f.chopTicks = 0;
            f.workState = 'toStockpile';
          }
        } else if (f.workState === 'toFarm' && f.farmTarget) {
          f.workState = 'harvesting';
          f.harvestTicks = 0;
        } else if (f.workState === 'harvesting' && f.farmTarget) {
          f.harvestTicks++;
          if (f.harvestTicks >= FOUNDER_HARVEST_TICKS) {
            const harv = harvestFarmTileToCarrier(sim.registry, world, f, f.farmTarget.x, f.farmTarget.y, nowAbs, growthFactorAt(world, day, f.farmTarget.x, f.farmTarget.y));
            sim.registry = harv.registry;
            if (harv.yield > 0) {
              f.carryingGrain = harv.yield;
              ledger.grainHarvested += harv.yield;
              if (myJob && myJob.kind === 'harvest') {
                ledger.jobsCompleted.harvest++;
                sim.board = completeJob(sim.board, myJob.id);
                myJob = undefined;
              }
              const dc = claimDeliverJobFor(sim.board, f.id, f.carrying + f.carryingGrain, nowAbs);
              sim.board = dc.board;
              if (dc.job) myJob = dc.job;
            } else if (myJob && myJob.kind === 'harvest') {
              ledger.jobsFailed['target-gone'] = (ledger.jobsFailed['target-gone'] ?? 0) + 1;
              sim.board = failJob(sim.board, myJob.id, 'target-gone');
              myJob = undefined;
            }
            f.farmTarget = null;
            f.harvestTicks = 0;
            f.workState = 'toStockpile';
          }
        } else if (f.workState === 'toPlant' && f.farmTarget) {
          f.workState = 'planting';
          f.plantTicks = 0;
        } else if (f.workState === 'planting' && f.farmTarget) {
          f.plantTicks++;
          if (f.plantTicks >= FOUNDER_PLANT_TICKS) {
            const planted = plantFarmTile(world, f.farmTarget.x, f.farmTarget.y, nowAbs);
            if (planted.ok) {
              ledger.plantsPlanted++;
              if (myJob && myJob.kind === 'plant') {
                ledger.jobsCompleted.plant++;
                sim.board = completeJob(sim.board, myJob.id);
                myJob = undefined;
              }
            } else if (myJob && myJob.kind === 'plant') {
              ledger.jobsFailed['target-gone'] = (ledger.jobsFailed['target-gone'] ?? 0) + 1;
              sim.board = failJob(sim.board, myJob.id, 'target-gone');
              myJob = undefined;
            }
            f.farmTarget = null;
            f.plantTicks = 0;
            f.workState = 'toTree';
          }
        } else if (f.workState === 'toMine' && f.mineTarget) {
          // At the mine's work tile: start the shift (the arrival
          // gate — no ore moves while walking).
          f.workState = 'miningOre';
          f.mineTicks = 0;
        } else if (f.workState === 'miningOre' && f.mineTarget) {
          f.mineTicks++;
          if (f.mineTicks >= MINE_TICKS_PER_SHIFT) {
            // BUILD 1089: the shift goes through the registry — the
            // deposit depletes and the yield lands in the founder's
            // carrier store (capacity 2), with the deposit as its
            // source. The deposit's remaining count is the site's
            // inventory — the shift's ore is its depletion.
            const site = sim.mines.mines.find((s) => s.id === f.mineTarget!.id) ?? null;
            const mined = site
              ? mineOreToCarrier(sim.registry, world, f, site)
              : { registry: sim.registry, yield: 0, sourceId: null };
            sim.registry = mined.registry;
            if (mined.yield > 0) {
              f.carryingOre += mined.yield;
              f.carryingOreKind = site && site.mineral === 'coal' ? 'coal' : 'iron';
              ledger.oreMined += mined.yield;
              ledger.mineShifts++;
              if (site) sim.mines = { ...sim.mines, mines: sim.mines.mines.map((m) => (m.id === site.id ? { ...m, shiftsCompleted: m.shiftsCompleted + 1, oreMined: m.oreMined + mined.yield } : m)) };
              if (myJob && myJob.kind === 'mine') {
                ledger.jobsCompleted.mine++;
                sim.board = completeJob(sim.board, myJob.id);
                myJob = undefined;
              }
              const dc = claimDeliverJobFor(sim.board, f.id, f.carrying + f.carryingGrain + f.carryingStone + f.carryingOre, nowAbs);
              sim.board = dc.board;
              if (dc.job) myJob = dc.job;
            } else if (myJob && myJob.kind === 'mine') {
              ledger.jobsFailed['target-gone'] = (ledger.jobsFailed['target-gone'] ?? 0) + 1;
              sim.board = failJob(sim.board, myJob.id, 'target-gone');
              myJob = undefined;
            }
            f.mineTarget = null;
            f.mineTicks = 0;
            f.workState = 'toStockpile';
          }
        } else if (f.workState === 'toMill') {
          // At the mill approach: start the milling shift (the
          // arrival gate — no flour moves while walking).
          f.workState = 'milling';
          f.millTicks = 0;
        } else if (f.workState === 'milling') {
          // The shift grinds per tick (2 grain -> 2 flour a tick) —
          // a mill with no grain grinds nothing, and the flour
          // store caps the grind (the cap binds at 100). The job
          // completes at the shift end; the founder returns to
          // chopping (the grain keeps coming from the farm).
          const ground = grindGrainToFlour(sim.registry, true);
          sim.registry = ground.registry;
          if (ground.ground > 0) {
            ledger.flourMilled += ground.ground;
            ledger.grainGround += ground.grainUsed;
          }
          f.millTicks++;
          if (f.millTicks >= MILL_TICKS_PER_SHIFT) {
            if (myJob && myJob.kind === 'mill') {
              ledger.jobsCompleted.mill++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
            }
            f.millTicks = 0;
            f.workState = 'toTree';
          }
        } else if (f.workState === 'toBakery') {
          // At the bakery approach: start the baking shift.
          f.workState = 'baking';
          f.bakeTicks = 0;
        } else if (f.workState === 'baking') {
          // The shift bakes per tick (2 flour -> 1 meal a tick) —
          // a bakery with no flour bakes nothing, and the bake
          // stops when the camp holds 15 meals. The job completes
          // at the shift end.
          const baked = bakeFlourToMeals(sim.registry, true);
          sim.registry = baked.registry;
          if (baked.baked > 0) {
            ledger.mealsBaked += baked.baked;
            ledger.flourBaked += baked.flourUsed;
          }
          f.bakeTicks++;
          if (f.bakeTicks >= BAKE_TICKS_PER_SHIFT) {
            if (myJob && myJob.kind === 'bake') {
              ledger.jobsCompleted.bake++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
            }
            f.bakeTicks = 0;
            f.workState = 'toTree';
          }
        } else if (f.workState === 'toPrey') {
          // At the prey tile: start the hunt shift (the arrival
          // gate — no yield moves while walking).
          f.workState = 'hunting';
          f.animalTicks = 0;
        } else if (f.workState === 'hunting') {
          // The shift hunts per tick — the kill lands at the shift
          // end (HUNT_TICKS_PER_SHIFT). The prey's population drops
          // by one (recordAnimalKill) and the yield goes into the
          // carrier (the fell pattern); the founder then delivers
          // it (the chop pattern — a deliver job is claimed for
          // the carried meat/leather).
          f.animalTicks++;
          if (f.animalTicks >= HUNT_TICKS_PER_SHIFT) {
            const kind = preyKindForTargetId(myJob ? myJob.targetId : '') ?? f.preyTarget?.kind ?? null;
            if (kind && myJob && myJob.kind === 'hunt') {
              recordAnimalKill(world, kind);
              const y = HUNT_YIELD[kind as keyof typeof HUNT_YIELD];
              if (y.meat > 0) {
                const m = carryAnimalYieldToCarrier(sim.registry, f, 'meat', y.meat, myJob.targetId);
                sim.registry = m.registry;
                f.carryingMeat += m.added;
              }
              if (y.leather > 0) {
                const l = carryAnimalYieldToCarrier(sim.registry, f, 'leather', y.leather, myJob.targetId);
                sim.registry = l.registry;
                f.carryingLeather += l.added;
              }
              ledger.jobsCompleted.hunt++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
              const dc = claimDeliverJobFor(sim.board, f.id, f.carryingMeat + f.carryingLeather, nowAbs);
              sim.board = dc.board;
              if (dc.job) myJob = dc.job;
            } else if (myJob && myJob.kind === 'hunt') {
              ledger.jobsFailed['target-gone'] = (ledger.jobsFailed['target-gone'] ?? 0) + 1;
              sim.board = failJob(sim.board, myJob.id, 'target-gone');
              myJob = undefined;
            }
            f.preyTarget = null;
            f.animalTicks = 0;
            f.workState = 'toStockpile';
          }
        } else if (f.workState === 'toBank') {
          // At the bank tile: start the fishing shift (the arrival
          // gate — no fish moves while walking).
          f.workState = 'fishing';
          f.animalTicks = 0;
        } else if (f.workState === 'fishing') {
          // The shift fishes per tick — the catch lands at the shift
          // end (FISH_TICKS_PER_SHIFT). The fish population drops by
          // one (recordAnimalKill) and the catch goes into the
          // carrier; the founder then delivers it.
          f.animalTicks++;
          if (f.animalTicks >= FISH_TICKS_PER_SHIFT) {
            if (myJob && myJob.kind === 'fish') {
              recordAnimalKill(world, 'fish');
              const c = carryAnimalYieldToCarrier(sim.registry, f, 'fish', FISH_YIELD, myJob.targetId);
              sim.registry = c.registry;
              f.carryingFish += c.added;
              ledger.fishCaught += c.added;
              ledger.jobsCompleted.fish++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
              const dc = claimDeliverJobFor(sim.board, f.id, f.carryingFish, nowAbs);
              sim.board = dc.board;
              if (dc.job) myJob = dc.job;
            }
            f.animalTicks = 0;
            f.workState = 'toStockpile';
          }
        } else if (f.workState === 'toPen') {
          // At the pen approach: start the shepherding shift.
          f.workState = 'shepherding';
          f.animalTicks = 0;
        } else if (f.workState === 'shepherding') {
          // The shift works per tick — the leg lands at the shift
          // end. Feed: the carried grain is spent and the pen is
          // fed for the day (feedPen sets fedDay). Shear: the wool
          // leaves the sheep into the carrier (at most the carrier
          // cap — the rest stays for the next shear). Either way
          // the founder then delivers what they carry.
          f.animalTicks++;
          if (f.animalTicks >= HUNT_TICKS_PER_SHIFT) {
            if (myJob && myJob.kind === 'shepherd') {
              if (myJob.targetId === PEN_FEED_JOB_ID) {
                sim.pen = feedPen(sim.pen, day);
                f.carryingGrain = Math.max(0, f.carryingGrain - 1);
              } else {
                const sh = shearPen(sim.pen);
                sim.pen = sh.pen;
                if (sh.wool > 0) {
                  const w = carryAnimalYieldToCarrier(sim.registry, f, 'wool', sh.wool, myJob.targetId);
                  sim.registry = w.registry;
                  f.carryingWool += w.added;
                  ledger.woolSheared += w.added;
                }
              }
              ledger.jobsCompleted.shepherd++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
              const dc = claimDeliverJobFor(sim.board, f.id, f.carryingWool + f.carryingGrain, nowAbs);
              sim.board = dc.board;
              if (dc.job) myJob = dc.job;
            }
            f.animalTicks = 0;
            f.workState = 'toStockpile';
          }
        } else if (f.workState === 'toSmelter') {
          // At the smelter approach: start the smelting shift (the
          // arrival gate — no ingots move while walking).
          f.workState = 'smelting';
          f.smeltTicks = 0;
        } else if (f.workState === 'smelting') {
          // The shift smelts per tick (1 ore + 1 coal -> 1 ingot a
          // tick) — a smelter with no ore or no coal smelts
          // nothing, and the ingot store caps the smelt (the cap
          // binds at 20). The job completes at the shift end; the
          // founder returns to chopping (the ore keeps coming from
          // the mines).
          const smelted = smeltOreToIngots(sim.registry, true);
          sim.registry = smelted.registry;
          if (smelted.smelted > 0) {
            ledger.ingotsSmelted += smelted.smelted;
            ledger.oreSmelted += smelted.oreUsed;
            ledger.coalBurned += smelted.coalUsed;
          }
          f.smeltTicks++;
          if (f.smeltTicks >= SMELT_TICKS_PER_SHIFT) {
            if (myJob && myJob.kind === 'smelt') {
              ledger.jobsCompleted.smelt++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
            }
            f.smeltTicks = 0;
            f.workState = 'toTree';
          }
        } else if (f.workState === 'toSmith') {
          // At the blacksmith approach: start the smithing shift.
          f.workState = 'smithing';
          f.smithTicks = 0;
        } else if (f.workState === 'smithing') {
          // The shift smiths per tick (2 ingots -> 1 tool a tick)
          // — a blacksmith with no ingots smiths nothing, and the
          // tool store caps the smith (the cap binds at 10). The
          // job completes at the shift end.
          const smithed = smithIngotsToTools(sim.registry, true);
          sim.registry = smithed.registry;
          if (smithed.smithed > 0) {
            ledger.toolsSmithed += smithed.smithed;
            ledger.ingotsSmithed += smithed.ingotsUsed;
          }
          f.smithTicks++;
          if (f.smithTicks >= SMITH_TICKS_PER_SHIFT) {
            if (myJob && myJob.kind === 'smith') {
              ledger.jobsCompleted.smith++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
            }
            f.smithTicks = 0;
            f.workState = 'toTree';
          }
        } else if (f.workState === 'toSawmill') {
          // At the sawmill approach: start the sawing shift.
          f.workState = 'sawing';
          f.sawTicks = 0;
        } else if (f.workState === 'sawing') {
          // The shift saws per tick (2 wood -> 2 timber a tick) —
          // a sawmill with no wood saws nothing, and the timber
          // store caps the saw (the cap binds at 40). The job
          // completes at the shift end.
          const sawn = sawWoodToTimber(sim.registry, true);
          sim.registry = sawn.registry;
          if (sawn.sawn > 0) {
            ledger.timberSawn += sawn.sawn;
            ledger.woodSawn += sawn.woodUsed;
          }
          f.sawTicks++;
          if (f.sawTicks >= SAW_TICKS_PER_SHIFT) {
            if (myJob && myJob.kind === 'saw') {
              ledger.jobsCompleted.saw++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
            }
            f.sawTicks = 0;
            f.workState = 'toTree';
          }
        } else if (f.workState === 'toCarpenter') {
          // At the carpenter approach: start the carpentering shift.
          f.workState = 'carpentering';
          f.carpenterTicks = 0;
        } else if (f.workState === 'carpentering') {
          // The shift carpenters per tick (2 timber -> 1 furniture
          // a tick) — a carpenter with no timber makes nothing, and
          // the furniture store caps the work (the cap binds at
          // 10). The job completes at the shift end.
          const made = carpenterTimberToFurniture(sim.registry, true);
          sim.registry = made.registry;
          if (made.made > 0) {
            ledger.furnitureMade += made.made;
            ledger.timberCarpentered += made.timberUsed;
          }
          f.carpenterTicks++;
          if (f.carpenterTicks >= CARPENTER_TICKS_PER_SHIFT) {
            if (myJob && myJob.kind === 'carpenter') {
              ledger.jobsCompleted.carpenter++;
              sim.board = completeJob(sim.board, myJob.id);
              myJob = undefined;
            }
            f.carpenterTicks = 0;
            f.workState = 'toTree';
          }
        } else if (f.workState === 'toQuarry' && f.quarryTarget) {
          // At the quarry's work tile: start mining (the arrival gate).
          f.workState = 'mining';
          f.mineTicks = 0;
        } else if (f.workState === 'mining' && f.quarryTarget) {
          f.mineTicks++;
          if (f.mineTicks >= FOUNDER_MINE_TICKS) {
            const qt = quarryTargetFromJob(f.quarryTarget.id, f.quarryTarget.x, f.quarryTarget.y);
            const mined = qt
              ? mineStoneToCarrier(sim.registry, world, f, qt)
              : { registry: sim.registry, yield: 0, sourceId: null };
            sim.registry = mined.registry;
            if (mined.yield > 0) {
              // Accumulate, never overwrite: a founder reassigned to
              // quarry while still carrying stone (a rock by camp has
              // a work tile AT camp) keeps the stone they hold — the
              // carrier store accumulates the same way, so the two
              // stay in step and no stone is orphaned.
              // BUILD 1089: a site rock counts toward the quarry
              // site's stone (the crew's measured yield).
              if (qt && qt.kind === 'rock' && sim.mines.quarry && isQuarrySiteRock(sim.mines.quarry, qt.x, qt.y)) {
                ledger.quarrySiteStone += mined.yield;
                sim.mines = { ...sim.mines, quarry: { ...sim.mines.quarry, stonesMined: sim.mines.quarry.stonesMined + mined.yield } };
              }
              f.carryingStone += mined.yield;
              ledger.stoneMined += mined.yield;
              if (myJob && myJob.kind === 'quarry') {
                ledger.jobsCompleted.quarry++;
                sim.board = completeJob(sim.board, myJob.id);
                myJob = undefined;
              }
              const dc = claimDeliverJobFor(sim.board, f.id, f.carrying + f.carryingGrain + f.carryingStone, nowAbs);
              sim.board = dc.board;
              if (dc.job) myJob = dc.job;
            } else if (myJob && myJob.kind === 'quarry') {
              ledger.jobsFailed['target-gone'] = (ledger.jobsFailed['target-gone'] ?? 0) + 1;
              sim.board = failJob(sim.board, myJob.id, 'target-gone');
              myJob = undefined;
            }
            f.quarryTarget = null;
            f.mineTicks = 0;
            f.workState = 'toStockpile';
          }
        }
      }
      // Sleep/rest at camp need no arrival action — the needs decay
      // already applied the sleep/rest gains this tick.
    }
    // Idle (no tree in range) retries next tick.
    if ((f.activity === 'work' || f.activity === 'build') && f.workState === 'idle') f.workState = 'toTree';
  }

  // BUILD 1094: the old direct mill (grain -> meals, no worker, no
  // building) is REMOVED — the chain replaces it. Grain becomes meals
  // only through the mill (a founder's milling shift, grain -> flour)
  // and the bakery (a founder's baking shift, flour -> meals), above.
  // Nothing runs here: a mill with no worker produces nothing.
}

/** Run N founder ticks (0.9 game-min each) — the accelerated clock. */
export function advanceSettlement(sim: SettlementSim, ticks: number): void {
  for (let i = 0; i < ticks; i++) advanceSettlementTick(sim);
}

/** Camp grain in the registry (the mill's input). */
export function settlementGrain(sim: SettlementSim): number {
  return campGrainInRegistry(sim.registry);
}
