/**
 * Settlement driver — the 24-simulated-hour test's engine (NEURON HEX 0x09).
 *
 * It mirrors the view's runFounderTick (Engine3DWorldView.tsx) step by step
 * using the SAME pure functions — decayFounderNeeds, chooseScoredActivity,
 * discoverJobs / claimJob / claimNearestJob / claimDeliverJobFor,
 * fellTreeToCarrier, harvestFarmTileToCarrier, deliverFounderCarryToRegistry,
 * spendBuildStepFromRegistry, millGrainToMeals, arrivalCheck, stepFounderMove
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
  decayFounderNeeds,
  founderAbsMinutes,
  defaultFounderState,
  founderDestination,
  treeWorkTile,
  stepFounderMove,
  emptyFounderPath,
  spawnResident,
  campWoodInRegistry,
  campFoodInRegistry,
  eatFounderMealFromRegistry,
  fellTreeToCarrier,
  deliverFounderCarryToRegistry,
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
  claimNearestJob,
  claimDeliverJobFor,
  releaseJob,
  completeJob,
  failJob,
  jobForFounder,
  buildJobIdFor,
  buildJobClaimedBy,
  scorerTreeDist,
  type JobBoard,
  type JobKind,
} from './jobs';
import {
  HUT_SITES,
  HUT_APPROACH,
  HUT_KIND,
  HUT_WOOD_PER_STEP,
  HUT_TICKS_PER_STEP,
  freshConstruction,
  canBuild,
  spendBuildStepFromRegistry,
  finishConstruction,
  reconcileConstruction,
  reconcileExtraSites,
  hasUnfinishedSite,
  nearestUnfinishedSite,
  hutSiteById,
  hutSiteIndexById,
  hutPlacementExists,
  insideHutRect,
  type ConstructionState,
} from './construction';
import { FARM_FOOD_THRESHOLD, millGrainToMeals, campGrainInRegistry } from './food';
import { FARM_VILLAGER_RADIUS, readyFarmTiles, seedCampFarmPlot } from './farm';
import { stampRivers } from './rivers';
import { stampLandforms } from './landforms';
import { growthFactorAt } from './livingWorld';
import { arrivalCheck, RESIDENT_ENTRY_TILE } from './settlementGrowth';
import { chooseScoredActivity, founderDistToSite } from './utility';
import { closestFounder, recordSharedEvent, restTileFor } from './memory';
import { createRegistry, type ResourceRegistry } from './resourceRegistry';
import { validatePlacement, addPlacement } from './placements';
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
  mealsMilled: number;
  grainMilled: number;
  mealsEaten: number;
  jobsCompleted: Record<JobKind, number>;
  jobsFailed: Record<string, number>;
  hutsCompleted: number;
  placementRetries: number;
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
    mealsMilled: 0,
    grainMilled: 0,
    mealsEaten: 0,
    jobsCompleted: { chop: 0, build: 0, deliver: 0, harvest: 0 },
    jobsFailed: {},
    hutsCompleted: 0,
    placementRetries: 0,
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
  let registry = seedCampStore(createRegistry(), 0, 30, 0);
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
  return {
    world,
    founders,
    registry,
    board: createJobBoard(),
    construction: freshConstruction(),
    abs: SETTLEMENT_START_ABS,
    ledger: freshSettlementLedger(),
    paths: new Map(),
  };
}

/** Serialize the founders save (the reload contract — the world is not in it). */
export function serializeSettlement(sim: SettlementSim): string {
  return serializeFoundersSave(
    foundersSaveOf(sim.founders, campWoodInRegistry(sim.registry), campFoodInRegistry(sim.registry), campGrainInRegistry(sim.registry), sim.construction),
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
  let registry = seedCampStore(createRegistry(), save.stockpileWood, save.foodStock, save.grainStock);
  for (const f of founders) registry = seedCarrierStore(registry, f);
  return {
    world,
    founders,
    registry,
    board: createJobBoard(),
    construction: save.construction,
    abs,
    ledger,
    paths: new Map(),
  };
}

/** One founder tick — a mirror of the view's runFounderTick. */
export function advanceSettlementTick(sim: SettlementSim): void {
  const { world } = sim;
  sim.abs += SETTLEMENT_TICK_MIN;
  const nowAbs = sim.abs;
  const { day, minutes } = settlementClock(sim);
  const ledger = sim.ledger;
  ledger.ticks++;

  // Reconcile construction against the world (a 'done' hut whose placement
  // is gone rebuilds; a 'building' site with a placement present is done).
  const hutPlaced = hutPlacementExists(world);
  let construction = reconcileExtraSites(reconcileConstruction(sim.construction, hutPlaced), world);
  sim.construction = construction;
  const hutDone = !hasUnfinishedSite(construction);

  // Rebuild the job board from the world.
  sim.board = discoverJobs(sim.board, { world, construction, founders: sim.founders, nowAbs, growthFactorAt: (tx, ty) => growthFactorAt(world, day, tx, ty) });

  // BUILD 1069: the ready farm tiles this tick — computed once and
  // fed to every founder's scorer, so food drives work.
  const readyFarmCount = readyFarmTiles(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, nowAbs, FARM_VILLAGER_RADIUS, (tx, ty) => growthFactorAt(world, day, tx, ty)).length;

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
      if (f.workState === 'toSite' || f.workState === 'building' || f.workState === 'chopping') {
        f.workState = 'toTree';
        f.buildTicks = 0;
        f.chopTicks = 0;
        f.treeTarget = null;
        f.workTile = null;
      } else if (f.workState === 'toFarm' || f.workState === 'harvesting') {
        f.workState = 'toTree';
        f.harvestTicks = 0;
        f.farmTarget = null;
      } else if (f.workState === 'toTree') {
        f.treeTarget = null;
        f.workTile = null;
      }
      if (f.workState === 'toStockpile' && (f.carrying > 0 || f.carryingGrain > 0)) {
        const dc = claimDeliverJobFor(sim.board, f.id, f.carrying + f.carryingGrain, nowAbs);
        sim.board = dc.board;
        if (dc.job) myJob = dc.job;
      }
    }

    // The activity is the utility scorer's choice — needs + context.
    // A newcomer walking in is not re-scored (they keep 'work' and
    // walk to camp first; the scorer picks their job after they arrive).
    const buildSite = nearestUnfinishedSite(construction, f);
    const builderTaken = (() => {
      const b = buildSite ? buildJobClaimedBy(sim.board, buildSite.id) : null;
      return b !== null && b !== f.id;
    })();
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
        stockpileWood: campWoodInRegistry(sim.registry),
        construction,
        nearestTreeDist: scorerTreeDist(sim.board, f.id, FOUNDER_CAMP.x, FOUNDER_CAMP.y, FOUNDER_WORK_RADIUS),
        distToSite: founderDistToSite({ x: Math.round(f.x), y: Math.round(f.y) }, construction),
        builderTaken,
        currentJob,
        closestAffinity: tClosest ? tClosest.affinity : 50,
        companionAtCamp: tCompanionAtCamp,
        readyFarmTiles: readyFarmCount,
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
    if ((f.workState === 'toSite' || f.workState === 'building') && f.activity !== 'build') {
      const keepSite = f.activity === 'work' && canBuild(construction, campWoodInRegistry(sim.registry));
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

    // Eat: at the eat tile, one meal from the shared camp stock.
    // BUILD 1079 (0x0E): only eat when actually hungry — see
    // worldSimulation3d.ts. Without the guard a founder with nothing
    // to do idles in 'eat' and consumes a meal every tick at hunger
    // 93-100, draining the camp food to 0 (measured ticks 1400-1600).
    if (f.activity === 'eat' && f.needs.hunger < 90 && Math.round(f.x) === FOUNDER_EAT_TILE.x && Math.round(f.y) === FOUNDER_EAT_TILE.y) {
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

    // Work assignment: build vs chop vs harvest. A founder with
    // workState 'toTree' and no tree target becomes the builder when
    // the hut is unfinished, the pile holds a step's wood, and nobody
    // else is building. Farming is the 'work' choice while the camp
    // is short of food; chopping is the 'work' choice when it is not.
    if ((f.activity === 'work' || f.activity === 'build') && f.workState === 'toTree' && !f.treeTarget) {
      if (!hutDone && !builderTaken && canBuild(construction, campWoodInRegistry(sim.registry)) && buildSite) {
        const bc = claimJob(sim.board, f.id, buildJobIdFor(buildSite.id));
        sim.board = bc.board;
        if (bc.job) {
          f.workState = 'toSite';
          myJob = bc.job;
        }
      }
      if (f.workState === 'toTree' && !f.treeTarget && f.activity === 'work' && campFoodInRegistry(sim.registry) < FARM_FOOD_THRESHOLD) {
        const hc = claimNearestJob(sim.board, f.id, 'harvest', FOUNDER_CAMP.x, FOUNDER_CAMP.y, FARM_VILLAGER_RADIUS);
        sim.board = hc.board;
        if (hc.job) {
          f.workState = 'toFarm';
          f.farmTarget = { x: hc.job.tile.x, y: hc.job.tile.y };
          myJob = hc.job;
        }
      }
      if (f.workState === 'toTree' && !f.treeTarget) {
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

    // Destination: build/harvest job tiles, the sleep approach, the
    // site approach, else the 1057 destination (carrying → camp,
    // work tile, camp). The site/harvest overrides apply ONLY while
    // the activity is work/build — a builder who chooses eat/rest/
    // sleep must LEAVE the site (or they are pinned there, starving).
    let dest = founderDestination(f);
    if (myJob && myJob.kind === 'build') dest = myJob.tile;
    else if (myJob && myJob.kind === 'harvest' && (f.activity === 'work' || f.activity === 'build')) dest = myJob.tile;
    else if (f.activity === 'sleep' && hutPlaced) dest = HUT_SITES[f.bed.hut]?.approach ?? HUT_APPROACH;
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
      }
    }

    if (atDest || (Math.round(f.x) === dest.x && Math.round(f.y) === dest.y)) {
      // Arrived: act on the destination.
      // BUILD 1079 (0x0E): the delivery runs by workState, not
      // activity — the driver mirrors the view's fix. A founder who
      // flips to rest/eat/sleep while carrying must still deliver
      // when they reach their destination (see worldSimulation3d.ts).
      if (f.workState === 'toStockpile' && (f.carrying > 0 || f.carryingGrain > 0)) {
        // The delivery runs only on a held deliver job — the transfer
        // IS the job's completion. Without the job (claimed next tick)
        // the founder waits at camp; the wood never moves without a job.
        if (myJob && myJob.kind === 'deliver') {
          const res = deliverFounderCarryToRegistry(sim.registry, f);
          sim.registry = res.registry;
          f.carrying -= res.movedWood;
          f.carryingGrain -= res.movedGrain;
          ledger.woodDelivered += res.movedWood;
          ledger.grainDelivered += res.movedGrain;
          if (f.carrying <= 0 && f.carryingGrain <= 0) {
            f.carrying = 0;
            f.carryingGrain = 0;
            f.workState = 'toTree';
            ledger.jobsCompleted.deliver++;
            sim.board = completeJob(sim.board, myJob.id);
            myJob = undefined;
          }
        }
      } else if (f.workState === 'toStockpile') {
        f.workState = 'toTree';
      } else if (f.activity === 'sleep' && hutPlaced && !insideHut) {
        // Through the door to their bed (their hut sleep tile).
        const bed = f.bed;
        f.x = bed.x;
        f.y = bed.y;
        sim.paths.delete(f.name);
      } else if (f.activity === 'work' || f.activity === 'build') {
        if (f.workState === 'arriving') {
          // A newcomer reached camp on foot — they join the workforce.
          f.workState = 'toTree';
          sim.paths.delete(f.name);
        } else if (f.workState === 'toSite') {
          f.workState = 'building';
          f.buildTicks = 0;
        } else if (f.workState === 'building') {
          f.buildTicks++;
          if (f.buildTicks >= HUT_TICKS_PER_STEP) {
            f.buildTicks = 0;
            if (campWoodInRegistry(sim.registry) >= HUT_WOOD_PER_STEP) {
              const jobSite = hutSiteById(myJob && myJob.kind === 'build' ? myJob.targetId : '');
              const jobSiteIndex = jobSite ? hutSiteIndexById(jobSite.id) : -1;
              const res = spendBuildStepFromRegistry(
                sim.registry,
                construction,
                jobSiteIndex >= 0 ? jobSiteIndex : undefined,
              );
              sim.registry = res.registry;
              construction = res.construction;
              sim.construction = construction;
              if (res.spent) ledger.woodSpent += HUT_WOOD_PER_STEP;
              // A shared build step — the builder plus every founder
              // chopping for the hut built it together.
              for (const o of sim.founders) {
                if (o !== f && (o.activity === 'work' || o.activity === 'build')) {
                  f.social = recordSharedEvent(f.social, o.name, 'build', day, nowAbs);
                  o.social = recordSharedEvent(o.social, f.name, 'build', day, nowAbs);
                }
              }
              if (res.completed) {
                // Stamp the hut through the same placement path the
                // player uses. The rect may be occupied this tick (a
                // founder crossing it) — then the builder waits at the
                // site and retries next cycle; the progress is banked,
                // no wood is spent twice.
                const site = jobSite ?? buildSite;
                const npcTiles = sim.founders.map((o) => ({ x: Math.round(o.x), y: Math.round(o.y) }));
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
            } else {
              // Pile ran dry mid-build: back to chopping — and the site
              // is released, so another founder can take it when wood
              // returns.
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
              if (myJob && myJob.kind === 'chop') {
                ledger.jobsCompleted.chop++;
                sim.board = completeJob(sim.board, myJob.id);
                myJob = undefined;
              }
              const dc = claimDeliverJobFor(sim.board, f.id, f.carrying, nowAbs);
              sim.board = dc.board;
              if (dc.job) myJob = dc.job;
            } else if (myJob && myJob.kind === 'chop') {
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
        }
      }
      // Sleep/rest at camp need no arrival action — the needs decay
      // already applied the sleep/rest gains this tick.
    }
    // Idle (no tree in range) retries next tick.
    if ((f.activity === 'work' || f.activity === 'build') && f.workState === 'idle') f.workState = 'toTree';
  }

  // The mill — while the camp is short of food and holds grain, mill
  // grain into meals (2 grain → 1 meal, a production step through the
  // registry). The grain the founders harvested becomes the meals they eat.
  const milled = millGrainToMeals(sim.registry);
  if (milled.milled > 0) {
    sim.registry = milled.registry;
    ledger.mealsMilled += milled.milled;
    ledger.grainMilled += milled.grainUsed;
  }
}

/** Run N founder ticks (0.9 game-min each) — the accelerated clock. */
export function advanceSettlement(sim: SettlementSim, ticks: number): void {
  for (let i = 0; i < ticks; i++) advanceSettlementTick(sim);
}

/** Camp grain in the registry (the mill's input). */
export function settlementGrain(sim: SettlementSim): number {
  return campGrainInRegistry(sim.registry);
}
