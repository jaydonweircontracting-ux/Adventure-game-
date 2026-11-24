// worldSimulation3d.ts — BUILD 1070 (NEURON HEX 0x0D, area 1 of 8).
// The 3D world simulation, extracted from Engine3DWorldView.tsx.
// BEHAVIOR-PRESERVING: the bodies below moved verbatim out of the view
// (the clock timer, the founder tick, the founder interval, and the
// wait-step simulation). The view builds a context once from its refs
// and the timers call into here. Nothing here renders anything; the
// view still owns all rendering, input, and HUD.
// Area 1 covers the simulation only — rendering/terrain, NPC
// simulation, player controls, inventory/crafting, building
// interactions, HUD/interface, and world synchronization stay in the
// view for later areas.
import { saveWorld, type IsoWorld } from '../iso/isoWorld';
import { saveClock, npcWalkable, type DayClock } from './townsfolk3d';
import {
  FOUNDERS_ENABLED, FOUNDER_CAMP, FOUNDER_CAMP_CENTRE, FOUNDER_EAT_TILE,
  FOUNDER_WORK_RADIUS, FOUNDER_CHOP_TICKS, CHOP_GIVE_UP_TICKS, bridgeWorkTileReachableFromCamp, FOUNDER_HARVEST_TICKS, FOUNDER_MINE_TICKS,
  decayFounderNeeds, founderAbsMinutes, founderDestination, treeWorkTile,
  stepFounderMove, emptyFounderPath, applyFounderWaitStep, saveFoundersSave,
  foundersSaveOf, eatFounderMealFromRegistry, fellTreeToCarrier, carryAnimalYieldToCarrier,
  harvestFarmTileToCarrier, campWoodInRegistry,
  campFoodInRegistry, campStoneInRegistry, spawnResident, NEWCOMER_NAME, NEWCOMER_SLEEP_TILE,
  type FounderState, type FounderPathState,
} from './founders';
import {
  HUT_CENTRE, HUT_APPROACH, HUT_SITES, HUT_KIND, HUT_WOOD_PER_STEP,
  HUT_TICKS_PER_STEP, canBuild, hasReadyHutSite, spendBuildStepFromRegistry, finishConstruction,
  reconcileConstruction, reconcileExtraSites, hutPlacementExists, insideHutRect,
  hutSiteById, hutSiteIndexById, foundingHutsDone, housingCapacity, nearestUnfinishedSite, hasUnfinishedSite,
  type ConstructionState,
} from './construction';
import { existingBuildingRects, planFor, planNeedsReplan, type SettlementNeedInput, type SettlementPlan } from './sitePlan';
import { advanceFoundingTick, type FoundingState } from './founding';
import { recordAnimalKill } from './ecosystems';
import { type AnimalActor } from './animals';
import {
  FISH_TICKS_PER_SHIFT, FISH_YIELD, HUNT_GIVE_UP_TICKS, HUNT_TICKS_PER_SHIFT, HUNT_YIELD,
  PEN_APPROACH, PEN_FEED_JOB_ID, PEN_RECT, PEN_SHEAR_JOB_ID, PEN_SITE_ID, PEN_START_DAY, PEN_WOOD_PER_STEP, PEN_WORK_STEPS,
  canBuildPen, canStartPen, feedPen, finishPen, freshPen, penDayAdvance,
  penFeedNeeded, penShearReady,
  preyKindForTargetId, shearPen, spendPenStepFromRegistry, stockPenFromWild,
  type PenState,
} from './animalHusbandry';
import { readyFarmTiles, FARM_VILLAGER_RADIUS, waterFarmTile, waterableFarmTiles } from './farm';
import { soilFactorAt, growthFactorAt } from './livingWorld';
import { FOUNDER_PLANT_TICKS, granaryFishInRegistry, granaryFlourInRegistry, granaryMeatInRegistry, plantFarmTile } from './granary';
import { campGrainInRegistry, FARM_FOOD_THRESHOLD } from './food';
import { advanceClock } from './worldclock';
import { chooseScoredActivity, UTILITY_HUNT_FOOD_THRESHOLD, UTILITY_PILE_FULL } from './utility';
import { assignProfessions, professionSlotsFor, type ProfessionNeed } from './professions';
import { closestFounder, recordSharedEvent, restTileFor, addSocialKey } from './memory';
import { getSimSpeed, founderStepsForSpeed, clockMinutesPerSecond } from './controlCenter';
import {
  discoverJobs, claimJob, claimNearestJob, claimNearestMineJobForMineral, claimFirstJob, nearestOpenJob, openJobs, claimDeliverJobFor, releaseJob,
  completeJob, failJob, blockQuarryTarget, jobForFounder, scorerTreeDist, scorerQuarryDist, buildJobClaimedBy,
  buildJobIdFor, jobSummary, millJobIdFor, smeltJobIdFor, smithJobIdFor, sawJobIdFor, carpenterJobIdFor, fishJobIdFor, huntJobIdFor, shepherdJobIdFor, type JobBoard,
} from './jobs';
import { planPathNpc } from './townsfolk3d';
import { QUARRY_STONE_TARGET, QUARRY_CLAIM_RADIUS, quarryWorkTile, quarryTargetFromJob, mineStoneToCarrier } from './quarry';
import { arrivalCheck, RESIDENT_ENTRY_TILE } from './settlementGrowth';
import { newcomerEligibility, averageSettlerAffinity, newcomerEntryTile } from './population';
import {
  STOREHOUSE_APPROACH, STOREHOUSE_HUT_SITE, STOREHOUSE_KIND, STOREHOUSE_SITE_ID,
  STOREHOUSE_WOOD_PER_STEP, STOREHOUSE_STONE_PER_STEP,
  canStartStorehouse, canBuildStorehouse, spendStorehouseStepFromRegistry, finishStorehouse,
  reconcileStorehouse, storehouseWoodInRegistry, storehouseStoneInRegistry, quarryClaimRadiusForStorehouse,
  deliverFounderCarryToStore, fetchBuildWood, spendBuildStepFromCarried, distToActiveBuildSite,
  STOREHOUSE_STORE_ID, storehouseLeatherInRegistry, storehouseOreInRegistry, storehouseWoolInRegistry, type StorehouseState,
} from './storehouse';
import { addPlacement, placedFenceTiles, validatePlacement } from './placements';
import {
  BRIDGE_START_DAY, BRIDGE_WOOD_PER_STEP, BRIDGE_WORK_STEPS, WELL_START_DAY,
  bridgeBuildContext, bridgeSiteById, canBuildBridge, canStartBridge, detectBridgeSite,
  extendPathToCrossing, finishBridge, reconcileBridges, recordTraffic, scanForBridgeSites,
  spendBridgeStepFromRegistry, placeBridgeSpan, trafficPathKind, wellApproachFor, wellTile,
  type BridgeSite, type PathState,
} from './paths';
import { CAMP_STORE_ID, GRANARY_STORE_ID, INN_STORE_ID, transfer, withdrawFrom, type ResourceRegistry } from './resourceRegistry';
import {
  BAKERY_APPROACH, BAKERY_CENTRE, BAKERY_SITE_ID, BAKE_TICKS_PER_SHIFT, BAKE_SLOTS,
  MILL_APPROACH, MILL_CENTRE, MILL_SITE_ID, MILL_TICKS_PER_SHIFT, MILL_WOOD_PER_STEP, BAKERY_WOOD_PER_STEP,
  bakeFlourToMeals, canBuildBakery, canBuildMill, canStartBakery, canStartMill,
  finishBakery, finishMill, foodChainFlourInRegistry, grindGrainToFlour,
  grindPlacedWindmills, markPlacedWindmillGround, placedWindmillBatchesDue, placedWindmillRects,
  reconcileFoodChain, spendBakeryStepFromRegistry, spendMillStepFromRegistry,
  type FoodChainState,
} from './foodChain';
import {
  SMELTER_APPROACH, SMELTER_CENTRE, SMELTER_SITE_ID, SMELT_TICKS_PER_SHIFT,
  BLACKSMITH_APPROACH, BLACKSMITH_CENTRE, BLACKSMITH_SITE_ID, SMITH_TICKS_PER_SHIFT,
  SAWMILL_APPROACH, SAWMILL_CENTRE, SAWMILL_SITE_ID, SAW_TICKS_PER_SHIFT,
  CARPENTER_APPROACH, CARPENTER_CENTRE, CARPENTER_SITE_ID, CARPENTER_TICKS_PER_SHIFT,
  WORKSHOP_CENTRE, WORKSHOP_SITE_ID,
  smeltOreToIngots, smithIngotsToTools, sawWoodToTimber, carpenterTimberToFurniture,
  canBuildSmelter, canBuildBlacksmith, canBuildSawmill, canBuildCarpenter, canBuildWorkshop,
  canStartSmelter, canStartBlacksmith, canStartSawmill, canStartCarpenter, canStartWorkshop,
  finishSmelter, finishBlacksmith, finishSawmill, finishCarpenter, finishWorkshop,
  reconcileMetalChain,
  metalChainCoalInRegistry, metalChainIngotsInRegistry, metalChainToolsInRegistry, metalChainTimberInRegistry, metalChainFurnitureInRegistry,
  spendSmelterStepFromRegistry, spendBlacksmithStepFromRegistry, spendSawmillStepFromRegistry, spendCarpenterStepFromRegistry, spendWorkshopStepFromRegistry,
  type MetalChainState,
} from './metalChain';
import {
  INN_APPROACH, INN_CENTRE, INN_REST_TILES, INN_SITE_ID, INN_WOOD_PER_STEP, INN_REST_TICKS,
  buildInnStep, canBuildInn, canStartInn, eatInnMeal, finishInn, innFoodInRegistry,
  innRestTileFor, insideInnRect, isInnUsable, reconcileHousing, topUpInnStore,
  type HousingState,
} from './housing';
import {
  MINE_START_DAY, MINE_TICKS_PER_SHIFT, MINE_IRON_TARGET, MINE_COAL_TARGET, QUARRY_CREW_SIZE,
  designateMine, designateQuarry, designateLumber, reconcileMines, mineOreToCarrier,
  openMineSite, openMineSites, founderMiningMineral, isQuarrySiteRock, quarrySiteRocks, type MineState,
} from './mines';

// The mutable simulation state the tick needs. The fields are the
// view's refs (as { current } containers, so the module never imports
// React) plus the effect-local world/path and the callbacks the tick
// needs (message, clock UI, resource UI, the living-world sync —
// those stay view-owned; the module just calls them).
export interface FounderSimContext {
  world: IsoWorld;
  clock: { current: DayClock };
  founders: { current: FounderState[] };
  construction: { current: ConstructionState };
  // BUILD 1087: the storehouse state (the view's storehouseRef).
  storehouse: { current: StorehouseState };
  // BUILD 1088: the path layer (the view's pathsRef) — the traffic
  // counts, the bridge sites, and the last bridge-scan day.
  paths: { current: PathState };
  // BUILD 1089: the mine / quarry / lumber sites (the view's
  // minesRef) — designated over real deposits / rocks / trees.
  mines: { current: MineState };
  // BUILD 1094: the food chain (the view's foodChainRef) — the mill
  // + the bakery, saved in the founders save (v12).
  foodChain: { current: FoodChainState };
  // BUILD 1095: the metal + timber chain (the view's metalChainRef)
  // — the smelter, the blacksmith, the sawmill, the carpenter, the
  // workshop, saved in the founders save (v12).
  metalChain: { current: MetalChainState };
  // BUILD 1096: the housing (the view's housingRef) — the inn,
  // saved in the founders save (v12).
  housing: { current: HousingState };
  // BUILD 1100: the settlement plan (the view's sitePlanRef) —
  // the Mayor + Architect decision, saved in the founders save
  // (v12, a compatible field).
  sitePlan: { current: SettlementPlan | null };
  // BUILD 1102: the pen (the view's penRef) — the sheep pen,
  // saved in the founders save (v12, a compatible field).
  pen: { current: PenState };
  // BUILD 1102: the live animals (the view's animalActorsRef) —
  // the hunt reads them for prey (session-only, like transients).
  animals: { current: AnimalActor[] };
  // BUILD 1101: the founding party (the view's foundingRef) —
  // session-only, stepped once per founder tick.
  founding: { current: FoundingState | null };
  registry: { current: ResourceRegistry };
  jobBoard: { current: JobBoard };
  founderPath: Map<string, FounderPathState>;
  getPlayerPos: () => { x: number; y: number };
  npcActors: { current: readonly { alive: boolean; x: number; y: number }[] };
  waiting: { current: boolean };
  needsWorldRebuild: { current: boolean };
  setMessage: (msg: string) => void;
  setClockUi: (clock: DayClock) => void;
  refreshResourceUi: () => void;
  syncLivingWorld: (world: IsoWorld) => boolean;
}

// The wait step only re-chooses activities (no movement, no work) —
// it needs the world/clock/founders/construction/registry/board and
// the living-world sync, and nothing else.
export interface WaitSimContext {
  world: IsoWorld;
  clock: { current: DayClock };
  founders: { current: FounderState[] };
  construction: { current: ConstructionState };
  // BUILD 1087: the storehouse state (the view's storehouseRef).
  storehouse: { current: StorehouseState };
  // BUILD 1088: the path layer (the view's pathsRef) — the wait
  // step reads it for the same-rule scorer feeds.
  paths: { current: PathState };
  // BUILD 1089: the mines state — the wait step reads it for the
  // same-rule scorer feeds (mine / lumber terms).
  mines: { current: MineState };
  // BUILD 1094: the food chain — the wait step reads it for the
  // same-rule scorer feeds (mill / bake terms).
  foodChain: { current: FoodChainState };
  // BUILD 1095: the metal + timber chain — the wait step reads it
  // for the same-rule scorer feeds (smelt / smith / saw / carpenter
  // terms).
  metalChain: { current: MetalChainState };
  // BUILD 1096: the housing — the wait step reads it for the
  // inn build-job discovery (the same-rule scorer feeds).
  housing: { current: HousingState };
  // BUILD 1100: the settlement plan — the wait step carries it in
  // its save (a wait must not wipe the plan to null).
  sitePlan: { current: SettlementPlan | null };
  // BUILD 1102: the pen — the wait step carries it in its save
  // (a wait must not wipe the pen to fresh).
  pen: { current: PenState };
  registry: { current: ResourceRegistry };
  jobBoard: { current: JobBoard };
  syncLivingWorld: (world: IsoWorld) => boolean;
  setClockUi: (clock: DayClock) => void;
}

// The 1s clock timer: advance the DayClock by the sim speed (paused
// freezes it), persist + show it, and advance the living world on a
// real day boundary (the sync is idempotent).
export function advanceWorldSimClock(ctx: FounderSimContext): void {
  // BUILD 1070 (0x0D, area 1): the context fields, aliased to the
  // names the body used as view closures — the body below is verbatim.
  const world = ctx.world;
  const clockRef = ctx.clock;
  const foundersRef = ctx.founders;
  const constructionRef = ctx.construction;
  const registryRef = ctx.registry;
  const jobBoardRef = ctx.jobBoard;
  const waitingRef = ctx.waiting;
  const needsWorldRebuild = ctx.needsWorldRebuild;
  const npcActorsRef = ctx.npcActors;
  const founderPath = ctx.founderPath;
  const { setMessage, setClockUi, refreshResourceUi, syncLivingWorld } = ctx;
      // BUILD 1056: paused while a wait runs — the wait's own timer
      // advances the clock, so the live tick must not double-advance it.
      if(waitingRef.current)return;
      // BUILD 1068 (0x08): the sim speed (Control Center) — paused
      // freezes the clock; otherwise it advances `speed` game-minutes
      // per real second (the while loop rolls the day at any speed).
      const speed=clockMinutesPerSecond(getSimSpeed());
      if(speed===0)return;
      const c=clockRef.current;let minutes=c.minutes+speed,day=c.day;
      const dayBefore=c.day;
      while(minutes>=1440){minutes-=1440;day+=1;}
      clockRef.current={minutes,day};saveClock(clockRef.current);setClockUi(clockRef.current);
      // BUILD 1096: the inn store tops up from the granary at the
      // day boundary (a conserved transfer), but only once the inn
      // is finished.
      if(day>dayBefore&&isInnUsable(ctx.housing.current)){const top=topUpInnStore(registryRef.current);registryRef.current=top.registry;}
      // BUILD 1102: the pen's day step — sheep fed on the day just
      // ended lamb and grow wool; unfed sheep do neither (the fedDay
      // is the day just ended, dayBefore).
      if(day>dayBefore&&ctx.pen.current.site.state==='done'){ctx.pen.current=penDayAdvance(ctx.pen.current,dayBefore).pen;}
      // BUILD 1062: the living-world coordinator advances on the real
      // day boundary (this tick rolls the day at midnight). The sync
      // is idempotent — same-day calls are no-ops.
      syncLivingWorld(world);
}

// One founder tick: needs decay, job-board discovery, arrival, the
// utility scorer, work assignment, movement, and the arrival actions
// (eat/build/chop/harvest/deliver), plus the mill. Moved verbatim.
export function runFounderSimTick(ctx: FounderSimContext): void {
  // BUILD 1070 (0x0D, area 1): the context fields, aliased to the
  // names the body used as view closures — the body below is verbatim.
  const world = ctx.world;
  const clockRef = ctx.clock;
  const foundersRef = ctx.founders;
  const constructionRef = ctx.construction;
  const storehouseRef = ctx.storehouse;
  const pathsRef = ctx.paths;
  const minesRef = ctx.mines;
  const foodChainRef = ctx.foodChain;
  const metalChainRef = ctx.metalChain;
  const housingRef = ctx.housing;
  const sitePlanRef = ctx.sitePlan;
  const penRef = ctx.pen;
  const animalsRef = ctx.animals;
  const foundingRef = ctx.founding;
  const registryRef = ctx.registry;
  const jobBoardRef = ctx.jobBoard;
  const waitingRef = ctx.waiting;
  const needsWorldRebuild = ctx.needsWorldRebuild;
  const npcActorsRef = ctx.npcActors;
  const founderPath = ctx.founderPath;
  const { setMessage, setClockUi, refreshResourceUi, syncLivingWorld } = ctx;
      if(!FOUNDERS_ENABLED||waitingRef.current)return;
      const clock=clockRef.current;
      const nowAbs=founderAbsMinutes(clock.day,clock.minutes);
      const player=ctx.getPlayerPos();
      const founders=foundersRef.current;
      let worldDirty=false;
      let stockChanged=false;
      let hutChanged=false;
      // BUILD 1058: reconcile once per tick — a 'done' hut whose
      // placement is gone (the player removed it with Build Remove)
      // resets to 'none', so the founders rebuild from the pile. A
      // ready hut (progress 6, placement blocked) is NOT reset — it
      // is waiting for a clear rect, not removed.
      const hutPlaced=hutPlacementExists(world);
      const reconciled=reconcileExtraSites(reconcileConstruction(constructionRef.current,hutPlaced),world);
      if(reconciled!==constructionRef.current){constructionRef.current=reconciled;hutChanged=true;}
      // BUILD 1087: reconcile the storehouse the same way — a
      // 'done' storehouse whose placement is gone (the player
      // removed it with Build Remove) resets to 'none', so the
      // founders rebuild from the pile; a 'building' storehouse
      // with a placement present is treated as done. A ready
      // storehouse (progress 6, placement blocked) is NOT reset.
      const reconciledStorehouse=reconcileStorehouse(storehouseRef.current,world);
      if(reconciledStorehouse!==storehouseRef.current){storehouseRef.current=reconciledStorehouse;hutChanged=true;}
      // BUILD 1088: reconcile the bridge sites the same way — a
      // 'done' bridge whose placement is gone rebuilds from the
      // pile; a 'building' site with a placement present is done.
      // reconcileBridges always returns a new array, so the change
      // is detected element-wise (same site objects = unchanged).
      const reconciledBridges=reconcileBridges(pathsRef.current.bridges,world);
      const bridgesChanged=reconciledBridges.length!==pathsRef.current.bridges.length||reconciledBridges.some((b,i)=>b!==pathsRef.current.bridges[i]);
      if(bridgesChanged){pathsRef.current={...pathsRef.current,bridges:reconciledBridges};hutChanged=true;}
      // BUILD 1089: reconcile the mine / quarry / lumber sites the
      // same way — a mine whose deposit is mined out flips to
      // 'exhausted'; a quarry with no rocks left flips; a lumber
      // site with no trees flips (and flips back when saplings
      // mature — the felling rotation). Identity-checked, like the
      // bridges (the reconcile returns the same object when
      // nothing changed).
      const reconciledMines=reconcileMines(minesRef.current,world);
      if(reconciledMines!==minesRef.current){minesRef.current=reconciledMines;hutChanged=true;}
      // BUILD 1094: reconcile the mill + the bakery the same way — a
      // 'done' building whose placement is gone resets to 'none', so
      // the founders rebuild from the pile.
      const reconciledFoodChain=reconcileFoodChain(foodChainRef.current,world);
      if(reconciledFoodChain!==foodChainRef.current){foodChainRef.current=reconciledFoodChain;hutChanged=true;}
      // BUILD 1106: player-placed windmills grind on the wind — one
      // batch (2 grain -> 2 flour) per windmill per game-hour, from
      // the granary, capped at 100 flour like the founder mill. No
      // placed windmill in the sim worlds, so the M1069 numbers
      // cannot move; the watermark advances even when nothing
      // grinds (no grain / flour full), so the hour is not retried.
      const placedWindmills=placedWindmillRects(world);
      if(placedWindmills.length>0){
        const windmillDue=placedWindmillBatchesDue(foodChainRef.current,nowAbs);
        if(windmillDue.batchesPerWindmill>0){
          const ground=grindPlacedWindmills(registryRef.current,placedWindmills.length,windmillDue.batchesPerWindmill);
          if(ground.ground>0){registryRef.current=ground.registry;stockChanged=true;}
        }
        foodChainRef.current=markPlacedWindmillGround(foodChainRef.current,windmillDue.nextHour);
      }
      // BUILD 1095: reconcile the chain the same way — a 'done'
      // building whose placement is gone resets to 'none', so the
      // founders rebuild from the pile.
      const reconciledMetalChain=reconcileMetalChain(metalChainRef.current,world);
      if(reconciledMetalChain!==metalChainRef.current){metalChainRef.current=reconciledMetalChain;hutChanged=true;}
      // BUILD 1096: reconcile the inn the same way — a 'done' inn
      // whose placement is gone resets to 'none', so the founders
      // rebuild from the pile.
      const reconciledHousing=reconcileHousing(housingRef.current,world);
      if(reconciledHousing!==housingRef.current){housingRef.current=reconciledHousing;hutChanged=true;}
      const hutDone=!hasUnfinishedSite(constructionRef.current);
      // BUILD 1096: the founding huts (0+1) — the storehouse /
      // bridge / quarry open on these (the 1095 schedule), not on
      // worker housing. The hut BUILD claim below keeps hutDone
      // (all sites) so worker housing can still be claimed once
      // its gate opens.
      const foundingDone=foundingHutsDone(constructionRef.current);
      // BUILD 1087: the quarry claim radius this tick — computed BEFORE
      // the board rebuild, so discovery creates rock jobs out to the
      // widened radius while the storehouse needs stone (see storehouse.ts).
      const quarryRadius=quarryClaimRadiusForStorehouse(storehouseRef.current,foundingDone,clock.day,campStoneInRegistry(registryRef.current),storehouseStoneInRegistry(registryRef.current));
      // BUILD 1089: the claim radius widens to cover the designated
      // quarry site's rocks (the site centre is up to 72 out, past the
      // storehouse radius once it is done) — the crew works the site
      // even after the storehouse is done. The storehouseStoneNeed
      // proxy below keeps using quarryRadius (the storehouse need),
      // not this widened radius.
      const siteQuarryRadius=minesRef.current.quarry?quarrySiteRocks(world,minesRef.current.quarry).reduce((m,r)=>Math.max(m,Math.abs(r.tx-FOUNDER_CAMP.x)+Math.abs(r.ty-FOUNDER_CAMP.y)),0):0;
      const claimQuarryRadius=Math.max(quarryRadius,siteQuarryRadius);
      // BUILD 1089: the wood level that gates chopping — once the
      // storehouse is done, the lower of the camp pile and the
      // storehouse wood, so a full camp pile does not starve the
      // storehouse. Evaluated FRESH at each use (a function, not a
      // once-per-tick value): the original code re-read the camp pile
      // per founder, and a stale low pile makes every founder chop
      // (it moved the 24h wood pin 40->46).
      const pileForWood=()=>storehouseRef.current.state==='done'?Math.min(campWoodInRegistry(registryRef.current),storehouseWoodInRegistry(registryRef.current)):campWoodInRegistry(registryRef.current);
      // BUILD 1088: the once-a-day bridge scan — paths laid before
      // the day-3 gate (the arrival corridor's river crossing, laid
      // day 1–2) are checked for a river neighbour, so a bridge site
      // opens once the settlement is old enough. Gated on
      // lastBridgeScanDay so it runs once per day, not every tick.
      if(clock.day>=BRIDGE_START_DAY&&pathsRef.current.lastBridgeScanDay<clock.day){scanForBridgeSites(world,pathsRef.current,clock.day);}
      // BUILD 1089: designate the mine / quarry / lumber sites —
      // once per day at most (the lastDesignateDay gate, the bridge
      // scan's pattern: the quarry designation runs A* over the
      // rocks, so it must never run every tick). The mine opens
      // over the nearest live iron deposit; the quarry over the
      // best reachable rock cluster; the lumber over the surveyed
      // forest-edge rect. All three gate on day 3, so the 24h
      // window never sees a site.
      if(clock.day>=MINE_START_DAY&&minesRef.current.lastDesignateDay<clock.day){
        let nextMines=minesRef.current;
        if(!openMineSite(nextMines)){
          const site=designateMine(world,clock.day,storehouseRef.current.state==='done',nextMines.mines);
          if(site)nextMines={...nextMines,mines:[...nextMines.mines,site]};
        }
        // BUILD 1095: the coal mine — designated the same way, once
        // per day, when no open coal mine exists (the 1089 gate
        // checked for ANY open mine, which would have blocked the
        // coal mine while the iron mine was open).
        if(!openMineSites(nextMines).some((s)=>s.mineral==='coal')){
          const coalSite=designateMine(world,clock.day,storehouseRef.current.state==='done',nextMines.mines,'coal');
          if(coalSite)nextMines={...nextMines,mines:[...nextMines.mines,coalSite]};
        }
        if(!nextMines.quarry){
          const q=designateQuarry(world,clock.day,nextMines.quarry);
          if(q)nextMines={...nextMines,quarry:q};
        }
        if(!nextMines.lumber){
          const l=designateLumber(world,clock.day,nextMines.lumber);
          if(l)nextMines={...nextMines,lumber:l};
        }
        nextMines={...nextMines,lastDesignateDay:clock.day};
        if(nextMines!==minesRef.current){minesRef.current=nextMines;hutChanged=true;}
      }
      // BUILD 1088: the camp well this tick (null before the seed,
      // or if the placement was removed) — fed to discovery and the
      // scorer, so both read the same well.
      const well=wellTile(world,FOUNDER_CAMP.x,FOUNDER_CAMP.y);
      // BUILD 1065 (J-1): rebuild the job board from the world —
      // chop jobs for the trees in radius, the build job while the
      // hut is unfinished, deliver jobs for carrying founders.
      // Jobs whose target is gone are removed (open) or failed
      // (claimed — the holder re-targets below).
      jobBoardRef.current=discoverJobs(jobBoardRef.current,{world,construction:constructionRef.current,founders,nowAbs,growthFactorAt:(tx:number,ty:number)=>growthFactorAt(world,clock.day,tx,ty),soilFactorAt:(tx:number,ty:number)=>soilFactorAt(world,tx,ty),storehouse:storehouseRef.current,day:clock.day,quarryRadius:claimQuarryRadius,well,bridges:pathsRef.current.bridges,mines:minesRef.current,foodChain:foodChainRef.current,metalChain:metalChainRef.current,housing:housingRef.current,storehouseMaterials:{iron:storehouseOreInRegistry(registryRef.current,'iron'),coal:metalChainCoalInRegistry(registryRef.current),ingots:metalChainIngotsInRegistry(registryRef.current),tools:metalChainToolsInRegistry(registryRef.current),wood:storehouseWoodInRegistry(registryRef.current),timber:metalChainTimberInRegistry(registryRef.current),furniture:metalChainFurnitureInRegistry(registryRef.current)},granary:{grain:campGrainInRegistry(registryRef.current),flour:foodChainFlourInRegistry(registryRef.current),food:campFoodInRegistry(registryRef.current)},pen:penRef.current,liveAnimals:animalsRef.current});
      // BUILD 1069: the ready farm tiles this tick — computed once
      // (the scan is over placed farm tiles only, a handful) and
      // fed to every founder's scorer, so food drives work.
      const readyFarmCount=readyFarmTiles(world,FOUNDER_CAMP.x,FOUNDER_CAMP.y,nowAbs,FARM_VILLAGER_RADIUS,(tx:number,ty:number)=>growthFactorAt(world,clock.day,tx,ty)).length;
      // BUILD 1086: the open quarry jobs this tick — computed once
      // (the board already holds them) and fed to every founder's
      // scorer, so stone drives work when the pile is short.
      // BUILD 1086: only quarry jobs inside the claim radius count — the
      // stone term must not fire when only far (unclaimable) jobs remain.
      // BUILD 1087: the quarry claim radius widens while the storehouse needs stone (see storehouse.ts) — the 30-tile radius can only supply 3 rocks, and the storehouse needs 6 stone to complete. The gate is closed in the 24h window (the storehouse is 'none' and day < 3), so the M1069 numbers cannot move.
      const readyQuarryCount=openJobs(jobBoardRef.current,'quarry').filter((j)=>Math.abs(j.tile.x-FOUNDER_CAMP.x)+Math.abs(j.tile.y-FOUNDER_CAMP.y)<=claimQuarryRadius).length;
      // BUILD 1088: the waterable farm tiles this tick — the same
      // feed as the sim tick, so the mirror never re-chooses by a
      // different rule. Gated on the well + day 3 (the discovery
      // gate, mirrored here), so the count is 0 in the 24h window.
      const readyWaterCount=well&&clock.day>=WELL_START_DAY?waterableFarmTiles(world,FOUNDER_CAMP.x,FOUNDER_CAMP.y,nowAbs,FARM_VILLAGER_RADIUS,(tx:number,ty:number)=>growthFactorAt(world,clock.day,tx,ty)).length:0;
      // BUILD 1089: the open mine + lumber jobs this tick — the
      // same feed as the sim tick, so the mirror never re-chooses
      // by a different rule. Both are 0 in the 24h window (the
      // sites open day 3).
      const readyMineCount=openJobs(jobBoardRef.current,'mine').length;
      const readyLumberCount=openJobs(jobBoardRef.current,'lumber').length;
      // BUILD 1090: the open plant jobs this tick — the same
      // feed as the sim tick. 0 once the field is at target.
      const readyPlantCount=openJobs(jobBoardRef.current,'plant').length;
      // BUILD 1094: the open mill + bake jobs this tick — the same
      // feed as the sim tick. 0 until the buildings are done.
      const readyMillCount=openJobs(jobBoardRef.current,'mill').length;
      const readyBakeCount=openJobs(jobBoardRef.current,'bake').length;
      // BUILD 1095: the open chain work jobs this tick — the same
      // feed as the sim tick. 0 until the buildings are done.
      const readySmeltCount=openJobs(jobBoardRef.current,'smelt').length;
      const readySmithCount=openJobs(jobBoardRef.current,'smith').length;
      const readySawCount=openJobs(jobBoardRef.current,'saw').length;
      const readyCarpenterCount=openJobs(jobBoardRef.current,'carpenter').length;
      // BUILD 1089: the quarry crew cap — 2 when a site quarry job
      // is open (the crew works the designated site in parallel),
      // 1 otherwise (the ad-hoc rule). In the 24h window there is
      // no site, so the cap is 1 and the guard is the 1086 rule.
      const siteQuarryOpen=openJobs(jobBoardRef.current,'quarry').some((j)=>isQuarrySiteRock(minesRef.current.quarry,j.tile.x,j.tile.y));
      const quarryCrewCap=siteQuarryOpen?QUARRY_CREW_SIZE:1;
      // BUILD 1066 (0x06): the chain's closing loop — a newcomer
      // arrives when a finished hut leaves a free bed, the camp holds
      // food, and the settlement is old enough. One at a time (the
      // check gates on nobody 'arriving'), walking in from the east
      // edge on foot — the tick flips them to 'toTree' at camp, so
      // they join the workforce without ever teleporting.
      const arrival=arrivalCheck({founders,construction:constructionRef.current,foodStock:campFoodInRegistry(registryRef.current),day:clock.day});
      if(arrival){
        const newcomer=spawnResident(arrival.name,arrival.bed,RESIDENT_ENTRY_TILE,nowAbs,founders);
        foundersRef.current=[...foundersRef.current,newcomer];
        setMessage(arrival.name+' arrived at the camp!');
      }
      // BUILD 1103 (0x26, Phase 4.4): Tamsin — the affinity-gated
      // newcomer (population.ts), separate from the pool arrivals
      // above: the first hut done, food ≥ 10, the founders bonded
      // (avg affinity ≥ 55), day ≥ 2. She walks in from the east
      // edge on foot and sleeps at the camp bed (124,119), never
      // taking a hut bed. One at a time (nobody 'arriving'); in
      // practice she is due day 2, before any pool arrival needs
      // the second hut.
      if(!founders.some((f)=>f.name===NEWCOMER_NAME)&&!founders.some((f)=>f.workState==='arriving')){
        const tamsinEl=newcomerEligibility({day:clock.day,foodStock:campFoodInRegistry(registryRef.current),hutDone:constructionRef.current.sites[0].state==='done',avgAffinity:averageSettlerAffinity(founders,clock.day),hasNewcomer:false});
        if(tamsinEl.eligible){
          const entry=newcomerEntryTile(world)??RESIDENT_ENTRY_TILE;
          const tamsin=spawnResident(NEWCOMER_NAME,{hut:-1,x:NEWCOMER_SLEEP_TILE.x,y:NEWCOMER_SLEEP_TILE.y},entry,nowAbs,founders);
          foundersRef.current=[...foundersRef.current,tamsin];
          setMessage(NEWCOMER_NAME+' approaches from the east — a new settler is coming to the camp');
        }
      }
      // BUILD 1098 (0x21): professions — assigned by settlement
      // need, every tick, before the founder loop (the assignment
      // is idempotent: a founder keeps a profession that is still
      // an open slot, so the assignment only CHANGES when the need
      // changes — a new building opens a slot, a finished project
      // closes one, a founder without work takes the most-needed
      // open profession). The need is read from state the tick
      // already has: the field always exists (farmer), a buildable
      // hut or an unfinished production building (builder), open
      // lumber/mine/quarry jobs, a finished smelter/blacksmith/
      // sawmill/carpenter (their work exists). The player never
      // assigns a profession.
      const professionNeed: ProfessionNeed = {
        farmOpen: true,
        constructionPending:
          nearestUnfinishedSite(constructionRef.current, FOUNDER_CAMP, clock.day) !== null ||
          storehouseRef.current.state !== 'done' ||
          foodChainRef.current.mill.state !== 'done' ||
          foodChainRef.current.bakery.state !== 'done' ||
          metalChainRef.current.smelter.state !== 'done' ||
          metalChainRef.current.blacksmith.state !== 'done' ||
          metalChainRef.current.sawmill.state !== 'done' ||
          metalChainRef.current.carpenter.state !== 'done' ||
          metalChainRef.current.workshop.state !== 'done' ||
          housingRef.current.inn.state !== 'done',
        lumberOpen: readyLumberCount > 0,
        mineOpen: readyMineCount > 0,
        quarryOpen: readyQuarryCount > 0,
        smelterDone: metalChainRef.current.smelter.state === 'done',
        blacksmithDone: metalChainRef.current.blacksmith.state === 'done',
        sawmillDone: metalChainRef.current.sawmill.state === 'done',
        carpenterDone: metalChainRef.current.carpenter.state === 'done',
        bakeryDone: foodChainRef.current.bakery.state === 'done',
        // BUILD 1102 (gate fix): the animal needs — the mirror of
        // the sim tick (day 3+, an open job, total camp food below
        // the hunt threshold; the pen done + feed/shear wanted).
        // Day-3-gated, so the 24h window never sees them.
        huntOpen:
          clock.day >= PEN_START_DAY &&
          openJobs(jobBoardRef.current, 'hunt').length > 0 &&
          campFoodInRegistry(registryRef.current) + granaryMeatInRegistry(registryRef.current) + granaryFishInRegistry(registryRef.current) < UTILITY_HUNT_FOOD_THRESHOLD,
        fishOpen:
          clock.day >= PEN_START_DAY &&
          openJobs(jobBoardRef.current, 'fish').length > 0 &&
          campFoodInRegistry(registryRef.current) + granaryMeatInRegistry(registryRef.current) + granaryFishInRegistry(registryRef.current) < UTILITY_HUNT_FOOD_THRESHOLD,
        shepherdOpen:
          penRef.current.site.state === 'done' &&
          (penFeedNeeded(penRef.current, clock.day) || penShearReady(penRef.current)),
      };
      assignProfessions(foundersRef.current, professionSlotsFor(professionNeed));

      // BUILD 1100 (0x23, Phase 4.2): the settlement plan — the Mayor
      // + Architect re-decide what to build next + where, after the
      // board rebuild, before the founder loop (the same rule as the
      // sim tick). The plan only changes when its building is done or
      // no longer startable (planNeedsReplan) — a steady plan is not
      // re-decided every tick, and the A* site scoring runs only on a
      // re-plan, never per tick.
      const planInput: SettlementNeedInput = {
        day: clock.day,
        camp: { ...FOUNDER_CAMP },
        food: campFoodInRegistry(registryRef.current),
        grain: campGrainInRegistry(registryRef.current),
        flour: foodChainFlourInRegistry(registryRef.current),
        beds: housingCapacity(constructionRef.current),
        population: foundersRef.current.length,
        waitingArrivals: 0,
        campWood: campWoodInRegistry(registryRef.current),
        campStone: campStoneInRegistry(registryRef.current),
        storehouseWood: storehouseWoodInRegistry(registryRef.current),
        storehouseIron: storehouseOreInRegistry(registryRef.current, 'iron'),
        storehouseCoal: metalChainCoalInRegistry(registryRef.current),
        storehouseIngots: metalChainIngotsInRegistry(registryRef.current),
        storehouseTools: metalChainToolsInRegistry(registryRef.current),
        storehouseTimber: metalChainTimberInRegistry(registryRef.current),
        storehouseFurniture: metalChainFurnitureInRegistry(registryRef.current),
        construction: constructionRef.current,
        storehouse: storehouseRef.current,
        foodChain: foodChainRef.current,
        metalChain: metalChainRef.current,
        housing: housingRef.current,
        bridges: pathsRef.current.bridges,
        foundingDone,
      };
      if (planNeedsReplan(sitePlanRef.current, planInput)) {
        sitePlanRef.current = planFor(planInput, world, existingBuildingRects(constructionRef.current, storehouseRef.current, foodChainRef.current, metalChainRef.current, housingRef.current));
      }
      // BUILD 1101 (0x24, Phase 4.3): the founding party — one step
      // per founder tick (0.9 game-min), after the plan refresh. A
      // founding that fells a tree or stamps a placement dirties the
      // world like a founder build does.
      if (foundingRef.current) {
        const foundingPlayer = ctx.getPlayerPos();
        const foundingRes = advanceFoundingTick(foundingRef.current, world, { playerTile: { x: Math.round(foundingPlayer.x), y: Math.round(foundingPlayer.y) }, npcTiles: foundersRef.current.map((o) => ({ x: Math.round(o.x), y: Math.round(o.y) })) });
        if (foundingRes.worldDirty) worldDirty = true;
      }
      for(const f of founders){
        const elapsed=Math.max(0,nowAbs-f.lastAbs);
        f.needs=decayFounderNeeds(f.needs,elapsed,f.activity);
        f.lastAbs=nowAbs;
        // BUILD 1065 (J-1): the founder's held job (or none). A job
        // that vanished — failed by discovery, or completed — leaves
        // stale work state behind: clear it so the founder
        // re-targets instead of walking to a tree nobody owns. A
        // carrier in 'toStockpile' re-claims their deliver job
        // (discovery creates it from the carried wood — including
        // after a reload, where the claim did not survive but the
        // wood did).
        let myJob=jobForFounder(jobBoardRef.current,f.id);
        if(!myJob){
          if(f.workState==='toSite'||f.workState==='building'||f.workState==='toStorehouse'||f.workState==='chopping'){f.workState='toTree';f.buildTicks=0;f.chopTicks=0;f.treeTarget=null;f.workTile=null;}
      else if(f.workState==='toFarm'||f.workState==='harvesting'){f.workState='toTree';f.harvestTicks=0;f.farmTarget=null;}
      else if(f.workState==='toPlant'||f.workState==='planting'){f.workState='toTree';f.plantTicks=0;f.farmTarget=null;}
      else if(f.workState==='toWell'||f.workState==='toWater'){if(f.carryingWater>0)f.carryingWater=0;f.workState='toTree';f.waterTarget=null;}
      else if(f.workState==='toQuarry'||f.workState==='mining'){f.workState='toTree';f.mineTicks=0;f.quarryTarget=null;}
      else if(f.workState==='toMine'||f.workState==='miningOre'){f.workState='toTree';f.mineTicks=0;f.mineTarget=null;}
      else if(f.workState==='toMill'||f.workState==='milling'){f.workState='toTree';f.millTicks=0;}
      else if(f.workState==='toBakery'||f.workState==='baking'){f.workState='toTree';f.bakeTicks=0;}
      else if(f.workState==='toSmelter'||f.workState==='smelting'){f.workState='toTree';f.smeltTicks=0;}
      else if(f.workState==='toSmith'||f.workState==='smithing'){f.workState='toTree';f.smithTicks=0;}
      else if(f.workState==='toSawmill'||f.workState==='sawing'){f.workState='toTree';f.sawTicks=0;}
      else if(f.workState==='toCarpenter'||f.workState==='carpentering'){f.workState='toTree';f.carpenterTicks=0;}
      else if(f.workState==='toPrey'||f.workState==='hunting'){f.workState='toTree';f.preyTarget=null;f.animalTicks=0;}
      else if(f.workState==='toBank'||f.workState==='fishing'){f.workState='toTree';f.animalTicks=0;}
      else if(f.workState==='toPen'||f.workState==='shepherding'){f.workState='toTree';f.animalTicks=0;}
          else if(f.workState==='toTree'){f.treeTarget=null;f.workTile=null;}
          if(f.workState==='toStockpile'&&(f.carrying>0||f.carryingGrain>0||f.carryingStone>0||f.carryingBuild>0||f.carryingOre>0||f.carryingMeat>0||f.carryingLeather>0||f.carryingFish>0||f.carryingWool>0)){
            const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carrying+f.carryingGrain+f.carryingStone+f.carryingBuild+f.carryingOre+f.carryingMeat+f.carryingLeather+f.carryingFish+f.carryingWool,nowAbs);
            jobBoardRef.current=dc.board;
            if(dc.job)myJob=dc.job;
          }
        }
        // BUILD 1088: a bridge builder whose site vanished (reconciled
        // away while the job was held) releases the job and re-targets
        // — the site no longer exists to build on.
        if(myJob&&myJob.kind==='build'&&myJob.targetId.startsWith('bridge-')&&!bridgeSiteById(pathsRef.current.bridges,myJob.targetId)){jobBoardRef.current=releaseJob(jobBoardRef.current,myJob.id);myJob=undefined;f.workState='toTree';f.buildTicks=0;f.treeTarget=null;f.workTile=null;}
        // BUILD 1102: the prey moves — refresh the hunt target from
        // the live animal each tick, so the hunter follows it (the
        // dest below reads preyTarget). A prey that is gone (killed
        // by a wolf, or culled by the top-up) fails the job.
        if((f.workState==='toPrey'||f.workState==='hunting')&&f.preyTarget){
          const prey=animalsRef.current.find((a)=>a.id===f.preyTarget!.id);
          if(prey){f.preyTarget={...f.preyTarget,x:Math.round(prey.x),y:Math.round(prey.y)};}
          else if(myJob&&myJob.kind==='hunt'){jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'target-gone');myJob=undefined;f.workState='toTree';f.preyTarget=null;f.animalTicks=0;}
        }
        // BUILD 1059: the activity is the utility scorer's choice —
        // needs + context (time, food, pile, construction, distances,
        // who is building, current job). The 1057 fixed priority is
        // gone. The decision is stored on the founder (session-only)
        // so E can report WHY.
        // BUILD 1065 (J-1): the scorer reads the BOARD, not the
        // world. builderTaken is the build job claimed by someone
        // else; currentJob is the held job (a delivering founder is
        // still 'chop' — the delivery is the tail of the chop); and
        // the nearest-tree distance is the founder's own claimed
        // tree, or the nearest OPEN chop job — null when every tree
        // in range is claimed, so work scores 0 for the founder
        // with nothing left to chop.
        // BUILD 1096: pass the day — nearestUnfinishedSite skips a
        // gated worker-housing site (see construction.ts).
        const buildSite=nearestUnfinishedSite(constructionRef.current,f,clock.day);
        // BUILD 1098: builder priority at the claim — a builder is
        // FREE (workState 'toTree'), so a non-builder treats the
        // build slot as taken (the scorer scores build 0 AND no
        // build claim fires for them). The +0.03 nudge alone does not
        // make the builder build: claiming is first-come-first-
        // served, so a free non-builder takes the single build slot
        // and the builder is locked out (the live diagnostic caught
        // the farmer + stonecutter building the huts while the
        // builder's buildTicks stayed 0). When the builder is BUSY
        // (not 'toTree'), anyone steps in — the strict gate (block
        // whenever a builder merely EXISTS) serialised all building
        // on one founder and starved the settlement (M1069 24h:
        // starved 2717, pop 4). A founder already holding a build
        // job (myJob build) is exempt and finishes it.
        const builderIsFree=foundersRef.current.some((o)=>o.profession==='builder'&&o.workState==='toTree');
        const builderTaken=(()=>{const b=buildSite?buildJobClaimedBy(jobBoardRef.current,buildSite.id):null;const bs=buildJobClaimedBy(jobBoardRef.current,STOREHOUSE_SITE_ID);const bb=pathsRef.current.bridges.some((s)=>{const c=buildJobClaimedBy(jobBoardRef.current,s.id);return c!==null&&c!==f.id;});const bm=buildJobClaimedBy(jobBoardRef.current,MILL_SITE_ID);const bba=buildJobClaimedBy(jobBoardRef.current,BAKERY_SITE_ID);const bsm=buildJobClaimedBy(jobBoardRef.current,SMELTER_SITE_ID);const bbl=buildJobClaimedBy(jobBoardRef.current,BLACKSMITH_SITE_ID);const bsw=buildJobClaimedBy(jobBoardRef.current,SAWMILL_SITE_ID);const bcp=buildJobClaimedBy(jobBoardRef.current,CARPENTER_SITE_ID);const bwk=buildJobClaimedBy(jobBoardRef.current,WORKSHOP_SITE_ID);const bin=buildJobClaimedBy(jobBoardRef.current,INN_SITE_ID);return (b!==null&&b!==f.id)||(bs!==null&&bs!==f.id)||bb||(bm!==null&&bm!==f.id)||(bba!==null&&bba!==f.id)||(bsm!==null&&bsm!==f.id)||(bbl!==null&&bbl!==f.id)||(bsw!==null&&bsw!==f.id)||(bcp!==null&&bcp!==f.id)||(bwk!==null&&bwk!==f.id)||(bin!==null&&bin!==f.id)||(builderIsFree&&f.profession!=='builder'&&myJob?.kind!=='build');})();
        // BUILD 1095: the iron slot and the coal slot are separate —
        // a founder mining iron does not block a founder mining coal.
        const ironTaken=foundersRef.current.some((o)=>o!==f&&founderMiningMineral(o,minesRef.current)==='iron');
        const coalTaken=foundersRef.current.some((o)=>o!==f&&founderMiningMineral(o,minesRef.current)==='coal');
        const currentJob=myJob?(myJob.kind==='build'?'build':'chop'):null;
        // BUILD 1060: the companion context for the scorer — the
        // founder's closest founder (highest effective affinity)
        // and whether they are at camp (within 3 tiles of the camp
        // centre). The rest score's companionship premium rides on
        // these two numbers.
        const prevActivity=f.activity;
        const tClosest=closestFounder(f.social,clock.day);
        const tCompanion=tClosest?founders.find(o=>o.name===tClosest.name):undefined;
        const tCompanionAtCamp=!!tCompanion&&Math.abs(Math.round(tCompanion.x)-FOUNDER_CAMP.x)+Math.abs(Math.round(tCompanion.y)-FOUNDER_CAMP.y)<=3;
        // BUILD 1066: a newcomer walking in is not re-scored — they
        // keep activity 'work' and walk to camp first; the scorer
        // picks their job after they arrive (else the scorer could
        // flip them to sleep and the arrival block would teleport
        // them to bed).
        if(f.workState!=='arriving'){
          const decision=chooseScoredActivity({needs:f.needs,minutes:clock.minutes,foodStock:campFoodInRegistry(registryRef.current),stockpileWood:pileForWood(),construction:constructionRef.current,nearestTreeDist:scorerTreeDist(jobBoardRef.current,f.id,FOUNDER_CAMP.x,FOUNDER_CAMP.y,FOUNDER_WORK_RADIUS),distToSite:distToActiveBuildSite({x:Math.round(f.x),y:Math.round(f.y)},constructionRef.current,storehouseRef.current,clock.day,sitePlanRef.current?.site.approach??null),builderTaken,currentJob,closestAffinity:tClosest?tClosest.affinity:50,companionAtCamp:tCompanionAtCamp,readyFarmTiles:readyFarmCount,stoneStock:campStoneInRegistry(registryRef.current),readyQuarryJobs:readyQuarryCount,storehouseStoneNeed:quarryRadius>QUARRY_CLAIM_RADIUS,quarryTaken:foundersRef.current.filter((o)=>o!==f&&(o.workState==='toQuarry'||o.workState==='mining'||o.carryingStone>0)).length>=quarryCrewCap,storehouse:storehouseRef.current,storehouseWood:storehouseWoodInRegistry(registryRef.current),readyWaterJobs:readyWaterCount,well,bridge:bridgeBuildContext(pathsRef.current.bridges,{x:Math.round(f.x),y:Math.round(f.y)},clock.day,foundingDone,storehouseRef.current.state==='done',(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current))),day:clock.day,readyMineJobs:readyMineCount,mineTaken:ironTaken,coalTaken,storehouseIron:storehouseOreInRegistry(registryRef.current,'iron'),storehouseCoal:metalChainCoalInRegistry(registryRef.current),readyLumberJobs:readyLumberCount,readyPlantJobs:readyPlantCount,readyMillJobs:readyMillCount,millTaken:foundersRef.current.some((o)=>o!==f&&(o.workState==='toMill'||o.workState==='milling')),readyBakeJobs:readyBakeCount,bakeTaken:foundersRef.current.filter((o)=>o!==f&&(o.workState==='toBakery'||o.workState==='baking')).length>=BAKE_SLOTS,readySmeltJobs:readySmeltCount,smeltTaken:foundersRef.current.some((o)=>o!==f&&(o.workState==='toSmelter'||o.workState==='smelting')),readySmithJobs:readySmithCount,smithTaken:foundersRef.current.some((o)=>o!==f&&(o.workState==='toSmith'||o.workState==='smithing')),readySawJobs:readySawCount,sawTaken:foundersRef.current.some((o)=>o!==f&&(o.workState==='toSawmill'||o.workState==='sawing')),readyCarpenterJobs:readyCarpenterCount,carpenterTaken:foundersRef.current.some((o)=>o!==f&&(o.workState==='toCarpenter'||o.workState==='carpentering')),storehouseIngots:metalChainIngotsInRegistry(registryRef.current),storehouseTools:metalChainToolsInRegistry(registryRef.current),storehouseTimber:metalChainTimberInRegistry(registryRef.current),storehouseFurniture:metalChainFurnitureInRegistry(registryRef.current),campGrain:campGrainInRegistry(registryRef.current),campFlour:foodChainFlourInRegistry(registryRef.current),campMeat:granaryMeatInRegistry(registryRef.current),campFish:granaryFishInRegistry(registryRef.current),readyHuntJobs:openJobs(jobBoardRef.current,'hunt').length,readyFishJobs:openJobs(jobBoardRef.current,'fish').length,readyShepherdFeedJobs:openJobs(jobBoardRef.current,'shepherd').filter((j)=>j.targetId===PEN_FEED_JOB_ID).length,readyShepherdShearJobs:openJobs(jobBoardRef.current,'shepherd').filter((j)=>j.targetId===PEN_SHEAR_JOB_ID).length,huntTaken:foundersRef.current.some((o)=>o!==f&&(o.workState==='toPrey'||o.workState==='hunting')),fishTaken:foundersRef.current.some((o)=>o!==f&&(o.workState==='toBank'||o.workState==='fishing')),shepherdTaken:foundersRef.current.some((o)=>o!==f&&(o.workState==='toPen'||o.workState==='shepherding')),profession:f.profession,builderExists:foundersRef.current.some((o)=>o.profession==='builder')});
          f.activity=decision.activity;
          f.lastDecision=decision;
        }
        // BUILD 1060: activity transitions record shared events
        // (memory.ts) — the relationship only grows through moments
        // the founders actually live together. Rest and sleep record
        // on the transition into the activity, with every other
        // founder already in that activity: the second founder to
        // flip records for the pair, so each shared session counts
        // once. A founder who flips away and back starts a new
        // session. The rest tile is picked on the transition too —
        // a tile beside the closest founder at camp (memory.ts
        // restTileFor), or the camp centre when the companion is
        // out working.
        if(f.activity!==prevActivity){
          f.restTile=null;
          if(f.activity==='rest'){
            if(tClosest&&tCompanionAtCamp&&tCompanion){
              const taken=new Set(founders.filter(o=>o!==f&&o.restTile).map(o=>o.restTile!.x+','+o.restTile!.y));
              f.restTile=restTileFor({x:Math.round(tCompanion.x),y:Math.round(tCompanion.y)},taken,(x,y)=>npcWalkable(world,x,y),FOUNDER_CAMP_CENTRE);
            }
            for(const o of founders){
              if(o===f||o.activity!=='rest')continue;
              f.social=recordSharedEvent(f.social,o.name,'rest',clock.day,nowAbs);
              o.social=recordSharedEvent(o.social,f.name,'rest',clock.day,nowAbs);
            }
          }else if(f.activity==='sleep'){
            for(const o of founders){
              if(o===f||o.activity!=='sleep')continue;
              f.social=recordSharedEvent(f.social,o.name,'sleep',clock.day,nowAbs);
              o.social=recordSharedEvent(o.social,f.name,'sleep',clock.day,nowAbs);
            }
          }
        }
        // BUILD 1059: a builder who stops building RELEASES the site.
        // When the scorer sends a toSite/building founder to eat, rest,
        // sleep, or chop (pile dry), they leave the site — workState
        // back to 'toTree', partial buildTicks reset (banked progress
        // stays) — so another founder can take the site when wood is
        // available instead of the site sitting reserved-but-empty
        // for 40s. (The 1059 probe's second run showed exactly that:
        // Greta held the site while resting at camp, then the site
        // sat empty for ~45s — 250s for the hut vs the 178s baseline.
        // The 1058 doc already stated this rule — "a tired or hungry
        // builder leaves the site and the step's partial ticks reset"
        // — but the code never implemented it.) A builder whose
        // activity is 'work' while the pile still holds wood keeps
        // the site (the scorer flips them back to 'build' next tick).
        if((f.workState==='toSite'||f.workState==='building'||f.workState==='toStorehouse')&&f.activity!=='build'){
          // BUILD 1087: a storehouse builder keeps the site while
          // the storehouse step is startable (housing done, day
          // old enough, camp pile holds a step) — the same rule as
          // a hut builder, so a 'work' flip does not strand the
          // storehouse mid-build.
          // BUILD 1088: a bridge builder keeps the site while the
          // bridge step is startable — the same rule, third in line.
          const bridgeSite=myJob&&myJob.kind==='build'&&myJob.targetId.startsWith('bridge-')?bridgeSiteById(pathsRef.current.bridges,myJob.targetId):undefined;
          const keepBridge=!!bridgeSite&&bridgeSite.state!=='done'&&bridgeSite.progress<BRIDGE_WORK_STEPS; // BUILD 1127 fix 4 (port of 1113): kept while unfinished (pen precedent, 1102) - the pile gate released the job mid-build while the chain ate the step wood.
          const keepMill=!!(myJob&&myJob.kind==='build'&&myJob.targetId===MILL_SITE_ID)&&canStartMill(foodChainRef.current,campGrainInRegistry(registryRef.current),campWoodInRegistry(registryRef.current));
          const keepBakery=!!(myJob&&myJob.kind==='build'&&myJob.targetId===BAKERY_SITE_ID)&&canStartBakery(foodChainRef.current,campWoodInRegistry(registryRef.current));
          // BUILD 1095: a chain builder keeps the site while the step
          // is startable — the workshop's gate includes the tool gate,
          // so a builder who claimed while tools existed releases
          // the job when they run out mid-build.
          const keepSmelter=!!(myJob&&myJob.kind==='build'&&myJob.targetId===SMELTER_SITE_ID)&&canStartSmelter(metalChainRef.current,storehouseOreInRegistry(registryRef.current,'iron'),(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)));
          const keepBlacksmith=!!(myJob&&myJob.kind==='build'&&myJob.targetId===BLACKSMITH_SITE_ID)&&canStartBlacksmith(metalChainRef.current,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)));
          const keepSawmill=!!(myJob&&myJob.kind==='build'&&myJob.targetId===SAWMILL_SITE_ID)&&canStartSawmill(metalChainRef.current,storehouseRef.current.state==='done',(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)));
          const keepCarpenter=!!(myJob&&myJob.kind==='build'&&myJob.targetId===CARPENTER_SITE_ID)&&canStartCarpenter(metalChainRef.current,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)));
          const keepWorkshop=!!(myJob&&myJob.kind==='build'&&myJob.targetId===WORKSHOP_SITE_ID)&&canStartWorkshop(metalChainRef.current,foodChainRef.current.bakery.state==='done',(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)),metalChainToolsInRegistry(registryRef.current));
          const keepPen=!!(myJob&&myJob.kind==='build'&&myJob.targetId===PEN_SITE_ID)&&penRef.current.site.state!=='done'&&penRef.current.site.progress<PEN_WORK_STEPS; // BUILD 1102: the pen is kept while unfinished — the pile gate released the job mid-build and the bridges took the wood; the builder waits at the pen.
          const keepSite=f.activity==='work'&&(canBuild(constructionRef.current,campWoodInRegistry(registryRef.current))||(storehouseRef.current.state==='done'&&storehouseWoodInRegistry(registryRef.current)>=HUT_WOOD_PER_STEP)||canStartStorehouse(storehouseRef.current,clock.day,foundingDone,campWoodInRegistry(registryRef.current),campStoneInRegistry(registryRef.current))||keepBridge||keepMill||keepBakery||keepSmelter||keepBlacksmith||keepSawmill||keepCarpenter||keepWorkshop||keepPen);
          if(!keepSite){
            // BUILD 1065 (J-1): leaving the site releases the build
            // job — another founder can take it when wood is
            // available, instead of the site sitting reserved.
            if(myJob&&myJob.kind==='build'){jobBoardRef.current=releaseJob(jobBoardRef.current,myJob.id);myJob=undefined;}
            f.workState='toTree';f.buildTicks=0;f.treeTarget=null;f.workTile=null;
          }
        }
        // BUILD 1087: a founder carrying BUILD wood who is not
        // heading to (or at) a site returns it to the stockpile —
        // the wood never strands in the carrier (the release block
        // above resets a toSite/building founder to 'toTree'; this
        // rule sends them to the stockpile next, and the delivery
        // branch returns the wood to the store). The fetch leg
        // itself ('toStorehouse') is exempt — the wood is on its
        // way to a site.
        if(f.carryingBuild>0&&f.workState!=='toSite'&&f.workState!=='building'&&f.workState!=='toStorehouse')f.workState='toStockpile';
        // BUILD 1088: a founder carrying WATER who is not heading to
        // (or at) a farm tile spills it — the water is never stocked,
        // so it cannot be carried into the next job.
        if(f.carryingWater>0&&f.workState!=='toWater'&&f.workState!=='toWell'){f.carryingWater=0;f.waterTarget=null;}
        // Eat: at the eat tile, one meal from the shared camp stock.
        // BUILD 1064 (R-1): the meal is withdrawn from the
        // registry's camp store — only a whole meal taken restores
        // hunger, and the pile drops by exactly that meal.
        // BUILD 1079 (0x0E): only eat when actually hungry. Without
        // the hunger guard a founder with nothing to do idles in 'eat'
        // (the scorer picks it at epsilon when all scores are ~0) and
        // consumes a meal EVERY tick at hunger 93-100, draining the
        // camp food to 0. Legitimate eating (hunger < 50) is untouched.
        // BUILD 1091 (0x1A): eat from the campfire ring (the 3x3 around the eat tile), not just the exact tile — six founders converging on one tile deadlock and starve beside full stores (see settlementSim.ts).
        if(f.activity==='eat'&&f.needs.hunger<90&&Math.abs(Math.round(f.x)-FOUNDER_EAT_TILE.x)<=1&&Math.abs(Math.round(f.y)-FOUNDER_EAT_TILE.y)<=1){
          const res=eatFounderMealFromRegistry(registryRef.current,f.needs);
          if(res.ate){registryRef.current=res.registry;f.needs=res.needs;stockChanged=true;
            // BUILD 1060: a shared meal — record 'eat' with every
            // other founder at the eat tile (within 1 tile). The
            // meal is a discrete moment, so it records once.
            for(const o of founders){if(o!==f&&Math.abs(Math.round(o.x)-FOUNDER_EAT_TILE.x)<=1&&Math.abs(Math.round(o.y)-FOUNDER_EAT_TILE.y)<=1){f.social=recordSharedEvent(f.social,o.name,'eat',clock.day,nowAbs);o.social=recordSharedEvent(o.social,f.name,'eat',clock.day,nowAbs);}}
          }
        }
        // BUILD 1058: door transitions (the player's Enter/Exit, one
        // tile through the door — never a path through walls, so the
        // 990 rule stands). Inside + not sleeping → step out to the
        // approach tile and walk on from there. Inside + sleeping →
        // stay asleep (no movement this tick).
        // BUILD 1096: the inn rest ends when the stay runs out —
        // the traveler walks on to camp (the door transition below
        // steps them out to the inn approach). The scorer is skipped
        // while 'arriving', so the 'rest' holds until this flips it.
        if(f.workState==='arriving'&&f.activity==='rest'&&f.innRestTicks!==undefined&&f.innRestTicks>0){f.innRestTicks--;if(f.innRestTicks===0)f.activity='work';}
        let insideHut=hutPlaced&&insideHutRect(Math.round(f.x),Math.round(f.y));
        if(insideHut&&f.activity!=='sleep'){
          const exitApproach=HUT_SITES[f.bed.hut]?.approach??HUT_APPROACH;f.x=exitApproach.x;f.y=exitApproach.y;founderPath.delete(f.name);
          insideHut=false;
        }
        // BUILD 1096: the inn door transition — inside the inn and
        // not resting → step out to the inn approach and walk on
        // (the hut door transition's shape). Inside + resting →
        // stay resting.
        const insideInn=isInnUsable(housingRef.current)&&insideInnRect(Math.round(f.x),Math.round(f.y));
        if(insideInn&&f.activity!=='rest'){f.x=INN_APPROACH.x;f.y=INN_APPROACH.y;founderPath.delete(f.name);}
        // Work assignment: build vs chop. A founder with workState
        // 'toTree' and no tree target becomes the builder when the
        // hut is unfinished, the pile holds a step's wood, and nobody
        // else is building (one builder — the site has one work tile,
        // the approach tile). Otherwise they chop as before. BUILD
        // 1059: the assignment runs for 'build' AND 'work' — the
        // scorer may name either, and a 'build' founder whose step
        // cannot start (pile just ran dry, another founder took the
        // site) falls back to chopping instead of idling. A founder
        // mid-chop (tree targeted) finishes the tree first: the
        // work-state machine carries them, so a scorer flip never
        // strands wood on a tree.
        // BUILD 1065 (J-1): work assignment CLAIMS a job. The build
        // job first (one builder — the claim IS the site; the pile
        // check is canBuild, the same gate as before), else the
        // nearest open chop job on the board. A founder with no
        // claimable job idles at camp: no NPC works without an
        // actual job. A claimed tree with no walkable work tile
        // (blocked since discovery) fails the job — the tree is
        // unworkable for everyone, not just this founder.
        if((f.activity==='work'||f.activity==='build')&&f.workState==='toTree'&&!f.treeTarget){

          // BUILD 1100: the plan's building claims FIRST — the Mayor's
          // pick, not the code order. A free founder attempts the plan's
          // building with the SAME gate its fixed branch below uses; if
          // the plan claim fails the fixed branches run as before (the
          // fallback). A claimed plan job moves the founder off
          // 'toTree', so the branches below skip.
          if(sitePlanRef.current&&!builderTaken){
            const planBuilding=sitePlanRef.current.building;let planJobId:string|null=null;
            if(planBuilding==='hut'){const planHut=HUT_SITES.find((s)=>s.rect.x0===sitePlanRef.current!.site.rect.x0&&s.rect.y0===sitePlanRef.current!.site.rect.y0);if(!hutDone&&planHut&&(canBuild(constructionRef.current,campWoodInRegistry(registryRef.current))||(storehouseRef.current.state==='done'&&storehouseWoodInRegistry(registryRef.current)>=HUT_WOOD_PER_STEP)))planJobId=buildJobIdFor(planHut.id);}
            else if(planBuilding==='storehouse'){if(foundingDone&&canStartStorehouse(storehouseRef.current,clock.day,foundingDone,campWoodInRegistry(registryRef.current),campStoneInRegistry(registryRef.current)))planJobId=buildJobIdFor(STOREHOUSE_SITE_ID);}
            else if(planBuilding==='bridge'){const planBridge=pathsRef.current.bridges.find((s)=>s.x===sitePlanRef.current!.site.rect.x0&&s.y===sitePlanRef.current!.site.rect.y0);if(foundingDone&&storehouseRef.current.state==='done'&&planBridge&&bridgeWorkTileReachableFromCamp(world,planBridge)&&canStartBridge(planBridge,clock.day,foundingDone,true,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current))))planJobId=buildJobIdFor(planBridge.id);}
            else if(planBuilding==='mill'){if(constructionRef.current.sites[0]&&constructionRef.current.sites[0].state==='done'&&canStartMill(foodChainRef.current,campGrainInRegistry(registryRef.current),campWoodInRegistry(registryRef.current)))planJobId=buildJobIdFor(MILL_SITE_ID);}
            else if(planBuilding==='bakery'){if(canStartBakery(foodChainRef.current,campWoodInRegistry(registryRef.current)))planJobId=buildJobIdFor(BAKERY_SITE_ID);}
            else if(planBuilding==='smelter'){if(canStartSmelter(metalChainRef.current,storehouseOreInRegistry(registryRef.current,'iron'),(campWoodInRegistry(registryRef.current)+storehouseWoodInRegistry(registryRef.current))))planJobId=buildJobIdFor(SMELTER_SITE_ID);}
            else if(planBuilding==='blacksmith'){if(canStartBlacksmith(metalChainRef.current,(campWoodInRegistry(registryRef.current)+storehouseWoodInRegistry(registryRef.current))))planJobId=buildJobIdFor(BLACKSMITH_SITE_ID);}
            else if(planBuilding==='sawmill'){if(canStartSawmill(metalChainRef.current,storehouseRef.current.state==='done',(campWoodInRegistry(registryRef.current)+storehouseWoodInRegistry(registryRef.current))))planJobId=buildJobIdFor(SAWMILL_SITE_ID);}
            else if(planBuilding==='carpenter'){if(canStartCarpenter(metalChainRef.current,(campWoodInRegistry(registryRef.current)+storehouseWoodInRegistry(registryRef.current))))planJobId=buildJobIdFor(CARPENTER_SITE_ID);}
            else if(planBuilding==='workshop'){if(canStartWorkshop(metalChainRef.current,foodChainRef.current.bakery.state==='done',(campWoodInRegistry(registryRef.current)+storehouseWoodInRegistry(registryRef.current)),metalChainToolsInRegistry(registryRef.current)))planJobId=buildJobIdFor(WORKSHOP_SITE_ID);}
            else if(planBuilding==='inn'){if(canStartInn(housingRef.current,constructionRef.current,campWoodInRegistry(registryRef.current),storehouseWoodInRegistry(registryRef.current),clock.day))planJobId=buildJobIdFor(INN_SITE_ID);}
            if(planJobId){const pClaim=claimJob(jobBoardRef.current,f.id,planJobId);jobBoardRef.current=pClaim.board;if(pClaim.job){if(planBuilding==='hut'&&storehouseRef.current.state==='done'&&campWoodInRegistry(registryRef.current)<HUT_WOOD_PER_STEP&&storehouseWoodInRegistry(registryRef.current)>=HUT_WOOD_PER_STEP){f.workState='toStorehouse';}else{f.workState='toSite';}myJob=pClaim.job;}}
          }
          if(!hutDone&&!builderTaken&&(canBuild(constructionRef.current,campWoodInRegistry(registryRef.current))||(storehouseRef.current.state==='done'&&storehouseWoodInRegistry(registryRef.current)>=HUT_WOOD_PER_STEP))&&buildSite){
            const bc=claimJob(jobBoardRef.current,f.id,buildJobIdFor(buildSite.id));
            jobBoardRef.current=bc.board;
            if(bc.job){
              // BUILD 1087: the fetch leg — when the storehouse
              // exists and the camp pile is short of a step's wood,
              // the builder fetches the step's wood from the
              // storehouse first (walking to its approach and
              // carrying it to the site), instead of waiting for
              // the pile to refill. The camp pile is the first
              // source when it holds a step — the storehouse is
              // the reserve.
              if(storehouseRef.current.state==='done'&&campWoodInRegistry(registryRef.current)<HUT_WOOD_PER_STEP&&storehouseWoodInRegistry(registryRef.current)>=HUT_WOOD_PER_STEP){
                f.workState='toStorehouse';
              }else{
                f.workState='toSite';
              }
              myJob=bc.job;
            }
          }
          // BUILD 1087: the storehouse build — claimed the same way
          // as a hut (one builder, the claim IS the site), only once
          // the huts are done and the settlement is old enough (the
          // housing-first rule), and only when the camp pile holds a
          // step's wood + stone (the storehouse draws from camp — it
          // does not exist yet to draw from). The builder walks to
          // the storehouse approach and builds there; the step
          // spends from the camp pile (see the 'building' branch).
          if(f.workState==='toTree'&&!f.treeTarget&&foundingDone&&!builderTaken&&canStartStorehouse(storehouseRef.current,clock.day,foundingDone,campWoodInRegistry(registryRef.current),campStoneInRegistry(registryRef.current))){
            const sc=claimJob(jobBoardRef.current,f.id,buildJobIdFor(STOREHOUSE_SITE_ID));
            jobBoardRef.current=sc.board;
            if(sc.job){f.workState='toSite';myJob=sc.job;}
          }
          // BUILD 1102: the pen — claimed right after the storehouse, before the bridges/mill/bakery/chain (it is NOT a plan building, so the Mayor never picks it, and the direct claim sat last and was perpetually preempted — the probe failed three times at day 7 with the pen 'none').
          const penTaken=(()=>{const c=buildJobClaimedBy(jobBoardRef.current,PEN_SITE_ID);return c!==null&&c!==f.id;})();
          if(f.workState==='toTree'&&!f.treeTarget&&!penTaken&&canStartPen(penRef.current,clock.day,foundingHutsDone(constructionRef.current),storehouseRef.current.state==='done',campFoodInRegistry(registryRef.current),campWoodInRegistry(registryRef.current))){
            const pc=claimJob(jobBoardRef.current,f.id,buildJobIdFor(PEN_SITE_ID));
            jobBoardRef.current=pc.board;
            if(pc.job){f.workState='toSite';myJob=pc.job;}
          }
          // BUILD 1088: the bridge build — claimed the same way as a
          // hut (one builder, the claim IS the site), only once the
          // huts and the storehouse are done and the settlement is old
          // enough (bridges third), and only when the camp pile holds
          // a step's wood. The nearest startable site wins.
          if(f.workState==='toTree'&&!f.treeTarget&&foundingDone&&storehouseRef.current.state==='done'&&!builderTaken&&!canStartPen(penRef.current,clock.day,foundingHutsDone(constructionRef.current),storehouseRef.current.state==='done',campFoodInRegistry(registryRef.current),campWoodInRegistry(registryRef.current))){ // BUILD 1102: the bridge yields while the pen is startable.
            let bestSite:BridgeSite|null=null;let bestDist=Infinity;
            for(const s of pathsRef.current.bridges){if(!bridgeWorkTileReachableFromCamp(world,s)||!canStartBridge(s,clock.day,foundingDone,true,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current))))continue;const d=Math.abs(s.workTile.x-Math.round(f.x))+Math.abs(s.workTile.y-Math.round(f.y));if(d<bestDist){bestDist=d;bestSite=s;}}
            if(bestSite){const brc=claimJob(jobBoardRef.current,f.id,buildJobIdFor(bestSite.id));jobBoardRef.current=brc.board;if(brc.job){f.workState='toSite';myJob=brc.job;}}
          }
          // BUILD 1094: the mill build — claimed the same way as a hut
          // (one builder, the claim IS the site), only once hut 0 is done
          // (the housing-first rule — the mill must not steal the first
          // hut's wood) and the first grain has landed (there is something
          // to mill), and only when the camp pile holds a step's wood.
          if(f.workState==='toTree'&&!f.treeTarget&&constructionRef.current.sites[0]&&constructionRef.current.sites[0].state==='done'&&!builderTaken&&canStartMill(foodChainRef.current,campGrainInRegistry(registryRef.current),campWoodInRegistry(registryRef.current))){
            const mc=claimJob(jobBoardRef.current,f.id,buildJobIdFor(MILL_SITE_ID));
            jobBoardRef.current=mc.board;
            if(mc.job){f.workState='toSite';myJob=mc.job;}
          }
          // BUILD 1094: the bakery build — claimed the same way, only
          // once the mill is done (the bakery needs flour) and only when
          // the camp pile holds a step's wood.
          if(f.workState==='toTree'&&!f.treeTarget&&!builderTaken&&canStartBakery(foodChainRef.current,campWoodInRegistry(registryRef.current))){
            const bc2=claimJob(jobBoardRef.current,f.id,buildJobIdFor(BAKERY_SITE_ID));
            jobBoardRef.current=bc2.board;
            if(bc2.job){f.workState='toSite';myJob=bc2.job;}
          }
          // BUILD 1095: the smelter build — only once the first ore
          // has landed in the storehouse (the smelter's gate).
          if(f.workState==='toTree'&&!f.treeTarget&&!builderTaken&&canStartSmelter(metalChainRef.current,storehouseOreInRegistry(registryRef.current,'iron'),(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)))){
            const sc2=claimJob(jobBoardRef.current,f.id,buildJobIdFor(SMELTER_SITE_ID));
            jobBoardRef.current=sc2.board;
            if(sc2.job){f.workState='toSite';myJob=sc2.job;}
          }
          // BUILD 1095: the blacksmith build — only once the smelter
          // is done (the blacksmith needs ingots to be worth building).
          if(f.workState==='toTree'&&!f.treeTarget&&!builderTaken&&canStartBlacksmith(metalChainRef.current,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)))){
            const sb2=claimJob(jobBoardRef.current,f.id,buildJobIdFor(BLACKSMITH_SITE_ID));
            jobBoardRef.current=sb2.board;
            if(sb2.job){f.workState='toSite';myJob=sb2.job;}
          }
          // BUILD 1095: the sawmill build — only once the storehouse
          // is done (the sawmill draws its wood from the storehouse).
          if(f.workState==='toTree'&&!f.treeTarget&&!builderTaken&&canStartSawmill(metalChainRef.current,storehouseRef.current.state==='done',(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)))){
            const sw2=claimJob(jobBoardRef.current,f.id,buildJobIdFor(SAWMILL_SITE_ID));
            jobBoardRef.current=sw2.board;
            if(sw2.job){f.workState='toSite';myJob=sw2.job;}
          }
          // BUILD 1095: the carpenter build — only once the sawmill
          // is done (the carpenter needs timber to be worth building).
          if(f.workState==='toTree'&&!f.treeTarget&&!builderTaken&&canStartCarpenter(metalChainRef.current,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)))){
            const cp2=claimJob(jobBoardRef.current,f.id,buildJobIdFor(CARPENTER_SITE_ID));
            jobBoardRef.current=cp2.board;
            if(cp2.job){f.workState='toSite';myJob=cp2.job;}
          }
          // BUILD 1095: the workshop build — only once the bakery is
          // done. With 0 tools the next step is a tool step and
          // canStartWorkshop is false, so the site sits unstarted:
          // the tools stall, by design (workshopStallReason names it).
          if(f.workState==='toTree'&&!f.treeTarget&&!builderTaken&&canStartWorkshop(metalChainRef.current,foodChainRef.current.bakery.state==='done',(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)),metalChainToolsInRegistry(registryRef.current))){
            const wk2=claimJob(jobBoardRef.current,f.id,buildJobIdFor(WORKSHOP_SITE_ID));
            jobBoardRef.current=wk2.board;
            if(wk2.job){f.workState='toSite';myJob=wk2.job;}
          }
          // BUILD 1096: the inn build — claimed the same way, only
          // once worker housing is done and the settlement is old
          // enough (day >= INN_START_DAY), and only when the pile +
          // storehouse hold a step's wood.
          if(f.workState==='toTree'&&!f.treeTarget&&!builderTaken&&canStartInn(housingRef.current,constructionRef.current,campWoodInRegistry(registryRef.current),storehouseWoodInRegistry(registryRef.current),clock.day)){
            const in2=claimJob(jobBoardRef.current,f.id,buildJobIdFor(INN_SITE_ID));
            jobBoardRef.current=in2.board;
            if(in2.job){f.workState='toSite';myJob=in2.job;}
          }
          // BUILD 1102: the pen build — claimed the same way as a
          // hut (one builder, the claim IS the site), only once the
          // huts and the storehouse are done and the camp holds a
          // meals surplus (the Songs of Syx guardrail), and only
          // when the camp pile holds a step's wood.
          // BUILD 1067: farming — a 'work' founder farms while the
          // camp is short of food (below FARM_FOOD_THRESHOLD) and a
          // ready farm tile is open. The build job still comes
          // first (the settlement's project); the harvest is the
          // 'work' choice when food is low, chopping when it is not.
          // BUILD 1102 Fix 13: gated on workKind 'harvest' — the
          // ungated branch claimed EVERY free 'work' founder while
          // food was low and a tile was ready, so it sat above the
          // hunt/fish/shepherd claims and they never fired (the
          // probe saw no hunter in two days at food 5). The scorer
          // already picks 'harvest' when food is low, so the gate
          // only stops the hijack of a founder who decided to
          // hunt, fish, mill, bake or build.
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='harvest'&&campFoodInRegistry(registryRef.current)<FARM_FOOD_THRESHOLD){
            const hc=claimNearestJob(jobBoardRef.current,f.id,'harvest',FOUNDER_CAMP.x,FOUNDER_CAMP.y,FARM_VILLAGER_RADIUS);
            jobBoardRef.current=hc.board;
            if(hc.job){f.workState='toFarm';f.farmTarget={x:hc.job.tile.x,y:hc.job.tile.y};myJob=hc.job;}
          }
          // BUILD 1088: watering — the mirror of the sim tick (same
          // gate: workKind 'water' and food below the threshold).
          // The claim is nearest-first; the job's tile is the farm tile
          // to water, and the founder draws from the well on the way
          // (the 'toWell' leg). The farm is 2 tiles from camp, so no
          // one-founder-at-a-time guard is needed (unlike the quarry
          // — watering never strands a founder far away).
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='water'&&campFoodInRegistry(registryRef.current)<FARM_FOOD_THRESHOLD){
            const wc=claimNearestJob(jobBoardRef.current,f.id,'water',FOUNDER_CAMP.x,FOUNDER_CAMP.y,FARM_VILLAGER_RADIUS);
            jobBoardRef.current=wc.board;
            if(wc.job){f.workState='toWell';f.waterTarget={x:wc.job.tile.x,y:wc.job.tile.y};myJob=wc.job;}
          }
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='plant'&&campFoodInRegistry(registryRef.current)<FARM_FOOD_THRESHOLD){
            // BUILD 1090: the plant claim does the path check here,
            // like the quarry claim (a plant job whose tile the
            // founder cannot reach fails 'no-path' and the next
            // candidate is tried — a blocked tile never blocks
            // the founder). The claim loop runs once per founder
            // per tick at most; a founder that claimed keeps the
            // job until it is done or lost.
            for(;;){
              const pc=claimNearestJob(jobBoardRef.current,f.id,'plant',FOUNDER_CAMP.x,FOUNDER_CAMP.y,FARM_VILLAGER_RADIUS);
              jobBoardRef.current=pc.board;
              if(!pc.job)break;
              const path=planPathNpc(world,{x:f.x,y:f.y},{x:pc.job.tile.x,y:pc.job.tile.y});
              if(path&&path.length>0){f.workState='toPlant';f.farmTarget={x:pc.job.tile.x,y:pc.job.tile.y};myJob=pc.job;break;}
              jobBoardRef.current=failJob(jobBoardRef.current,pc.job.id,'no-path');
            }
          }
          // BUILD 1086: quarrying — a 'work' founder mines stone
          // when the scorer says stone is the work that matters
          // (workKind 'quarry') and the pile is below target. The
          // build job still comes first; the harvest still comes
          // before the quarry (food outranks stone); the quarry is
          // the 'work' choice when there is no chop work at all.
          // One founder quarries at a time — the rest of the
          // workforce keeps the wood/food loop on schedule.
          // BUILD 1089: the mine — a 'work' founder mines ore
          // when the scorer says iron is the work that matters
          // (workKind 'mine') and the storehouse is below its iron
          // target. One miner at a time (the mineTaken guard —
          // the mine has one work tile, one shift at a time). The
          // claim checks the path from the founder's own position
          // (the designation already proved camp ↔ work tile, but
          // the founder may be out working); when no path exists
          // the founder falls through to chopping and the job
          // stays open (never failed — the site is real, the
          // founder is just out of reach this tick).
          // BUILD 1095: two minerals, two slots — the claim picks the
          // short mineral (iron first on a tie) whose slot is free.
          const ironShort=storehouseOreInRegistry(registryRef.current,'iron')<MINE_IRON_TARGET;
          const coalShort=storehouseOreInRegistry(registryRef.current,'coal')<MINE_COAL_TARGET;
          const claimMineral=ironShort&&!ironTaken?'iron':coalShort&&!coalTaken?'coal':null;
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='mine'&&claimMineral){
            const mc=claimNearestMineJobForMineral(jobBoardRef.current,f.id,claimMineral,FOUNDER_CAMP.x,FOUNDER_CAMP.y,FOUNDER_WORK_RADIUS);
            jobBoardRef.current=mc.board;
            if(mc.job){
              const mJob=mc.job;
              const site=minesRef.current.mines.find((s)=>s.id==='mine:'+mJob.targetId)??openMineSites(minesRef.current).find((s)=>s.mineral===claimMineral);
              if(site&&planPathNpc(world,{x:Math.round(f.x),y:Math.round(f.y)},site.workTile)){
                f.workState='toMine';f.mineTarget={id:site.id,x:site.x,y:site.y};f.workTile={...site.workTile};myJob=mJob;
              }else{
                jobBoardRef.current=releaseJob(jobBoardRef.current,mJob.id);
              }
            }
          }
          // BUILD 1089: the lumber — a 'work' founder fells the
          // rect's trees in rotation order when the scorer says
          // lumber is the work that matters (workKind 'lumber').
          // The claim is first-in-board-order (claimFirstJob),
          // not nearest: discovery inserts the rect row-major, so
          // the crew fells section by section. The execution is
          // the chop path (treeTarget / workTile / 'chopping' /
          // fellTreeToCarrier — which plants the sapling), so the
          // site thins and regrows through the 1.6 path.
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='lumber'){
            const lc=claimFirstJob(jobBoardRef.current,f.id,'lumber');
            jobBoardRef.current=lc.board;
            if(lc.job){
              const wt=treeWorkTile(world,lc.job.tile.x,lc.job.tile.y);
              if(wt){f.treeTarget={x:lc.job.tile.x,y:lc.job.tile.y};f.workTile=wt;myJob=lc.job;}
              else jobBoardRef.current=failJob(jobBoardRef.current,lc.job.id,'no-work-tile');
            }
          }
          // BUILD 1094: milling — the mirror of the sim tick (same gate:
          // workKind 'mill'). One miller at a time (the millTaken guard).
          const millTaken=foundersRef.current.some((o)=>o!==f&&(o.workState==='toMill'||o.workState==='milling'));
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='mill'&&!millTaken){
            const mc=claimJob(jobBoardRef.current,f.id,millJobIdFor(MILL_SITE_ID));
            jobBoardRef.current=mc.board;
            if(mc.job){f.workState='toMill';f.millTicks=0;myJob=mc.job;}
          }
          // BUILD 1094: baking — the mirror of the sim tick (same gate:
          // workKind 'bake'). BUILD 1104: two bakers at a time
          // (BAKE_SLOTS) — the guard is true only when both slots
          // are taken, and the claim takes the first open bake job.
          const bakeTaken=foundersRef.current.filter((o)=>o!==f&&(o.workState==='toBakery'||o.workState==='baking')).length>=BAKE_SLOTS;
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='bake'&&!bakeTaken){
            const bc=claimFirstJob(jobBoardRef.current,f.id,'bake');
            jobBoardRef.current=bc.board;
            if(bc.job){f.workState='toBakery';f.bakeTicks=0;myJob=bc.job;}
          }
          // BUILD 1095: smelting — the mirror of the sim tick (same
          // gate: workKind 'smelt'). One smelter at a time.
          const smeltTaken=foundersRef.current.some((o)=>o!==f&&(o.workState==='toSmelter'||o.workState==='smelting'));
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='smelt'&&!smeltTaken){
            const sc=claimJob(jobBoardRef.current,f.id,smeltJobIdFor(SMELTER_SITE_ID));
            jobBoardRef.current=sc.board;
            if(sc.job){f.workState='toSmelter';f.smeltTicks=0;myJob=sc.job;}
          }
          // BUILD 1095: smithing — the same shape (one smith at a time).
          const smithTaken=foundersRef.current.some((o)=>o!==f&&(o.workState==='toSmith'||o.workState==='smithing'));
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='smith'&&!smithTaken){
            const sb=claimJob(jobBoardRef.current,f.id,smithJobIdFor(BLACKSMITH_SITE_ID));
            jobBoardRef.current=sb.board;
            if(sb.job){f.workState='toSmith';f.smithTicks=0;myJob=sb.job;}
          }
          // BUILD 1095: sawing — the same shape (one sawyer at a time).
          const sawTaken=foundersRef.current.some((o)=>o!==f&&(o.workState==='toSawmill'||o.workState==='sawing'));
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='saw'&&!sawTaken){
            const sw=claimJob(jobBoardRef.current,f.id,sawJobIdFor(SAWMILL_SITE_ID));
            jobBoardRef.current=sw.board;
            if(sw.job){f.workState='toSawmill';f.sawTicks=0;myJob=sw.job;}
          }
          // BUILD 1095: carpentering — the same shape (one carpenter at a time).
          const carpenterTaken=foundersRef.current.some((o)=>o!==f&&(o.workState==='toCarpenter'||o.workState==='carpentering'));
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='carpenter'&&!carpenterTaken){
            const cp=claimJob(jobBoardRef.current,f.id,carpenterJobIdFor(CARPENTER_SITE_ID));
            jobBoardRef.current=cp.board;
            if(cp.job){f.workState='toCarpenter';f.carpenterTicks=0;myJob=cp.job;}
          }
          // BUILD 1102: hunting — the mirror of the sim tick (same
          // gate: workKind 'hunt', day >= 3, one hunter at a time).
          // The claim is nearest-first from the founder, so a hunter
          // who emptied the near band walks further out (the
          // acceptance test). The radius is the whole map: prey roam
          // the wild band 100+ tiles from camp, far outside the
          // 60-tile work radius.
          const huntTaken=foundersRef.current.some((o)=>o!==f&&(o.workState==='toPrey'||o.workState==='hunting'));
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='hunt'&&clock.day>=PEN_START_DAY&&!huntTaken){
            const hc=claimNearestJob(jobBoardRef.current,f.id,'hunt',Math.round(f.x),Math.round(f.y),200);
            jobBoardRef.current=hc.board;
            if(hc.job){
              const kind=preyKindForTargetId(hc.job.targetId);
              if(kind){f.preyTarget={id:hc.job.targetId,kind,x:hc.job.tile.x,y:hc.job.tile.y};f.animalTicks=0;f.workState='toPrey';myJob=hc.job;}
              else{jobBoardRef.current=releaseJob(jobBoardRef.current,hc.job.id);}
            }
          }
          // BUILD 1102: fishing — the same shape (one fisher at a
          // time, the river bank tile is the job's tile).
          const fishTaken=foundersRef.current.some((o)=>o!==f&&(o.workState==='toBank'||o.workState==='fishing'));
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='fish'&&clock.day>=PEN_START_DAY&&!fishTaken){
            const fc=claimJob(jobBoardRef.current,f.id,fishJobIdFor());
            jobBoardRef.current=fc.board;
            if(fc.job){f.animalTicks=0;f.workState='toBank';myJob=fc.job;}
          }
          // BUILD 1102: shepherding — shear first (the utility pays
          // more for wool than for feeding), then feed. The feed leg
          // picks up its grain at the claim: the founder is at camp,
          // the granary is the camp store, so the withdrawal is
          // instant and the trip is the work (the well-draw
          // precedent). A granary that ran dry between discovery
          // and claim leaves the job open instead of walking
          // grain-less to the pen.
          const shepherdTaken=foundersRef.current.some((o)=>o!==f&&(o.workState==='toPen'||o.workState==='shepherding'));
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='shepherd'&&clock.day>=PEN_START_DAY&&!shepherdTaken){
            const shc=claimJob(jobBoardRef.current,f.id,shepherdJobIdFor(PEN_SHEAR_JOB_ID));
            jobBoardRef.current=shc.board;
            if(shc.job){f.animalTicks=0;f.workState='toPen';myJob=shc.job;}
            else{
              const fdc=claimJob(jobBoardRef.current,f.id,shepherdJobIdFor(PEN_FEED_JOB_ID));
              jobBoardRef.current=fdc.board;
              if(fdc.job){
                const g=withdrawFrom(registryRef.current,GRANARY_STORE_ID,'grain',1);
                registryRef.current=g.registry;
                if(g.taken>=1){f.carryingGrain+=1;f.animalTicks=0;f.workState='toPen';myJob=fdc.job;}
                else{jobBoardRef.current=releaseJob(jobBoardRef.current,fdc.job.id);}
              }
            }
          }
          // BUILD 1089: the quarry crew cap — up to QUARRY_CREW_SIZE
          // founders quarry at once when a site quarry job is open
          // (the crew works the designated site in parallel), else
          // one (the ad-hoc rule). In the 24h window the cap is 1.
          const quarryTaken=foundersRef.current.filter((o)=>o!==f&&(o.workState==='toQuarry'||o.workState==='mining'||o.carryingStone>0)).length>=quarryCrewCap;
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&f.lastDecision?.workKind==='quarry'&&!quarryTaken&&campStoneInRegistry(registryRef.current)<QUARRY_STONE_TARGET){
            // BUILD 1086: nearest-first, but only a REACHABLE rock/deposit is
            // claimed — a rock across a river has a walkable work tile yet no
            // path from camp, and a founder who claims it waits on an empty
            // path forever (see settlementSim.ts). Unreachable jobs are failed
            // off the board ('no-path'); when none is reachable the founder
            // falls through to chopping (the pile gate below).
            // BUILD 1091 (0x1A): the return is verified to BOTH delivery destinations (camp and the storehouse approach) — the storehouse finishes after the claim, so a rock claimed to camp must also return to the approach once the storehouse is done (a rock whose return to the approach needs >4000 A* nodes strands its miner carrying stone).
            const returnOk=(wt:{x:number;y:number})=>planPathNpc(world,wt,FOUNDER_CAMP)&&planPathNpc(world,wt,STOREHOUSE_APPROACH);
            for(;;){
              const cand=nearestOpenJob(jobBoardRef.current,'quarry',Math.round(f.x),Math.round(f.y),claimQuarryRadius);
              if(!cand)break;
              const wt=quarryWorkTile(world,cand.tile.x,cand.tile.y);
              // BUILD 1087: a round trip, not a one-way ticket — rock
              // (150,77) has an outbound path from camp (133 steps) but
              // its return needs >4000 A* nodes, so a founder who claims
              // it mines the stone and then stands at the work tile
              // forever carrying it (diag D/E). A candidate is claimable
              // only when the return to camp also plans inside the
              // default budget.
              if(wt&&planPathNpc(world,{x:Math.round(f.x),y:Math.round(f.y)},wt)&&returnOk(wt)){
                const claimed=claimJob(jobBoardRef.current,f.id,cand.id);
                jobBoardRef.current=claimed.board;
                if(claimed.job){f.workState='toQuarry';f.quarryTarget={id:claimed.job.targetId,x:claimed.job.tile.x,y:claimed.job.tile.y};f.workTile=wt;myJob=claimed.job;}
                break;
              }
              jobBoardRef.current=blockQuarryTarget(failJob(jobBoardRef.current,cand.id,'no-path'),cand.targetId);
            }
          }
          // BUILD 1086: the chop fallback is gated on the PILE, not
          // on the scorer's chopWork — a founder whose activity is
          // 'work' (stone or food) but who cannot claim a
          // harvest/quarry job must NOT fall through to chopping a
          // full pile (see settlementSim.ts). The gate counts wood
          // already committed (carried + 2 per founder holding a chop
          // job not yet carried), so two founders cannot both claim
          // while wood is in flight and overshoot the pile to 26.
          const woodInFlight1086=foundersRef.current.reduce((sum,o)=>{const oj=jobForFounder(jobBoardRef.current,o.id);return sum+o.carrying+(oj&&oj.kind==='chop'&&o.carrying===0?2:0);},0);
          if(f.workState==='toTree'&&!f.treeTarget&&pileForWood()+woodInFlight1086<UTILITY_PILE_FULL){
            const cc=claimNearestJob(jobBoardRef.current,f.id,'chop',FOUNDER_CAMP.x,FOUNDER_CAMP.y,FOUNDER_WORK_RADIUS);
            jobBoardRef.current=cc.board;
            if(cc.job){
              const wt=treeWorkTile(world,cc.job.tile.x,cc.job.tile.y);
              if(wt){f.treeTarget={x:cc.job.tile.x,y:cc.job.tile.y};f.workTile=wt;myJob=cc.job;}
              else jobBoardRef.current=failJob(jobBoardRef.current,cc.job.id,'no-work-tile');
            }
            if(!f.treeTarget)f.workState='idle';
          }
        }
        // BUILD 1102: the hunt give-up — MOVED out of the claims block
        // (it sat inside `if (... toTree ...)` at 808, so a toPrey
        // founder never reached it and walked forever at an unreachable
        // prey — diag-hunt: 400 ticks, animalTicks 0, never moved).
        if(f.workState==='toPrey'){
          f.animalTicks++;
          if(f.animalTicks>=HUNT_GIVE_UP_TICKS){
            if(myJob&&myJob.kind==='hunt'){jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'give-up');myJob=undefined;}
            f.workState='toTree';f.preyTarget=null;f.animalTicks=0;
          }
        }

        // BUILD 1127: chop give-up (port of the 1113 fix; the hunt give-up's twin).
        if(f.workState==='toTree'&&f.treeTarget){
          f.treeTicks=(f.treeTicks??0)+1;
          if(f.treeTicks>=CHOP_GIVE_UP_TICKS){
            if(myJob&&(myJob.kind==='chop'||myJob.kind==='lumber')){jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'give-up');myJob=undefined;}
            f.workState='toTree';f.treeTarget=null;f.workTile=null;f.treeTicks=0;
          }
        }else{f.treeTicks=0;}

        // Destination: building founders work at the approach tile;
        // sleeping founders head for the approach tile too (the door)
        // and the arrival block steps them through it. Everyone else
        // uses the 1057 destination. BUILD 1059: the site override
        // applies ONLY while the activity is work/build — a builder
        // who chooses eat/rest/sleep must LEAVE the site (to the eat
        // tile, the camp, or bed), or they are pinned there: eating
        // requires the eat tile and the arrival block gates build
        // ticks on work/build, so a hungry builder would stand at
        // the site starving, not eating and not building, until the
        // pile refilled. (The 1058 build took 233s in the 1059 probe
        // for exactly this reason — Marlow sat 'eat'+'building' for
        // ~90s. The 1058 fixed priority only flipped to eat at
        // hunger ≤30, so it rarely showed; the scorer flips earlier
        // as the nearest tree recedes.) The release block above frees
        // the site while they are away (workState back to 'toTree',
        // partial buildTicks reset, banked progress stays), so
        // another founder can take the site when wood is available;
        // the returning founder re-takes it if free.
        let dest=founderDestination(f);
        // BUILD 1087: the fetch leg walks to the storehouse
        // approach (not the build job's tile — the job names the
        // hut site), and a delivery walks to the storehouse
        // approach once the storehouse exists (the delivery lands
        // in the storehouse store, not the camp pile — see
        // deliverFounderCarryToStore).
        // BUILD 1087: the fetch dest applies only while the founder is working/building (the 1067 harvest guard, same class) — a founder who flips to eat/rest/sleep while fetching must leave the approach (they pin the tile otherwise, and no carrier can arrive to deliver behind them).
        if(f.workState==='toStorehouse'&&(f.activity==='work'||f.activity==='build'))dest={...STOREHOUSE_APPROACH};
        else if(f.workState==='toWell'&&(f.activity==='work'||f.activity==='build')){const approach=well?wellApproachFor(world,well,FOUNDER_CAMP.x,FOUNDER_CAMP.y):null;if(approach)dest=approach;}
        else if(f.workState==='toWater'&&f.waterTarget&&(f.activity==='work'||f.activity==='build'))dest={...f.waterTarget};
        // BUILD 1096: the inn waystation — an arriving founder who
        // has not rested at the inn walks to the inn approach first.
        else if(f.workState==='arriving'&&isInnUsable(housingRef.current)&&!f.innRested&&(f.activity==='work'||f.activity==='build'))dest={...INN_APPROACH};
        else if((f.workState==='toMill'||f.workState==='milling')&&(f.activity==='work'||f.activity==='build'))dest={...MILL_APPROACH};
        else if((f.workState==='toBakery'||f.workState==='baking')&&(f.activity==='work'||f.activity==='build'))dest=myJob&&myJob.kind==='bake'?{...myJob.tile}:{...BAKERY_APPROACH};
        else if((f.workState==='toSmelter'||f.workState==='smelting')&&(f.activity==='work'||f.activity==='build'))dest={...SMELTER_APPROACH};
        else if((f.workState==='toSmith'||f.workState==='smithing')&&(f.activity==='work'||f.activity==='build'))dest={...BLACKSMITH_APPROACH};
        else if((f.workState==='toSawmill'||f.workState==='sawing')&&(f.activity==='work'||f.activity==='build'))dest={...SAWMILL_APPROACH};
        else if((f.workState==='toCarpenter'||f.workState==='carpentering')&&(f.activity==='work'||f.activity==='build'))dest={...CARPENTER_APPROACH};
        // BUILD 1091 (0x1A): the delivery and build dests apply ONLY while the founder is working/building — the mirror of the driver fix. A carrier who flips to eat/rest/sleep must LEAVE the storehouse approach (a carrier whose delivery cannot complete is pinned there starving beside full stores).
        else if(f.workState==='toStockpile'&&storehouseRef.current.state==='done'&&(f.activity==='work'||f.activity==='build'))dest={...STOREHOUSE_APPROACH};
        else if(myJob&&myJob.kind==='build'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if(myJob&&myJob.kind==='harvest'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if(myJob&&myJob.kind==='plant'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if(myJob&&myJob.kind==='mill'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if(myJob&&myJob.kind==='bake'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if(myJob&&myJob.kind==='smelt'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if(myJob&&myJob.kind==='smith'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if(myJob&&myJob.kind==='saw'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if(myJob&&myJob.kind==='carpenter'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if((f.workState==='toPrey'||f.workState==='hunting')&&(f.activity==='work'||f.activity==='build'))dest=f.preyTarget?{x:f.preyTarget.x,y:f.preyTarget.y}:(myJob?myJob.tile:{x:Math.round(f.x),y:Math.round(f.y)});
        else if((f.workState==='toBank'||f.workState==='fishing')&&(f.activity==='work'||f.activity==='build'))dest=myJob?myJob.tile:{x:Math.round(f.x),y:Math.round(f.y)};
        else if((f.workState==='toPen'||f.workState==='shepherding')&&(f.activity==='work'||f.activity==='build'))dest={...PEN_APPROACH};
        else if(f.activity==='sleep'&&hutPlaced&&f.bed.hut>=0)dest=(HUT_SITES[f.bed.hut]?.approach??HUT_APPROACH);
        else if((f.activity==='work'||f.activity==='build')&&(f.workState==='toSite'||f.workState==='building'))dest=buildSite?buildSite.approach:HUT_APPROACH;
        const cx=Math.round(f.x),cy=Math.round(f.y);
        const atDest=cx===dest.x&&cy===dest.y;
        if(!insideHut||f.activity!=='sleep'){
          if(!atDest){
            let p=founderPath.get(f.name);
            if(!p){p=emptyFounderPath();founderPath.set(f.name,p);}
            const occupied=(x:number,y:number)=>(Math.round(player.x)===x&&Math.round(player.y)===y)||founders.some(o=>o!==f&&Math.round(o.x)===x&&Math.round(o.y)===y)||npcActorsRef.current.some(r=>r.alive&&Math.round(r.x)===x&&Math.round(r.y)===y);
            const res=stepFounderMove(world,{x:cx,y:cy},dest,p,occupied);
            founderPath.set(f.name,res.path);
            if(res.pos.x!==cx||res.pos.y!==cy){f.x=res.pos.x;f.y=res.pos.y;}
            if(res.arrived)founderPath.delete(f.name);
            // BUILD 1088: the path layer — every founder step is
            // traffic; at 8 passes a walkable tile becomes a dirt
            // path (the founders lay the path by walking it), and a
            // new path tile beside a river opens a bridge site. A
            // placed path dirties the world (the save + the rebuild).
            if(res.pos.x!==cx||res.pos.y!==cy){const placedPath=recordTraffic(pathsRef.current,world,res.pos.x,res.pos.y);if(placedPath){const placePath=validatePlacement(world,'path',placedPath.x,placedPath.y,{x:0,y:0},[],0);if(placePath.ok){addPlacement(world,{...placePath.item,pathKind:trafficPathKind(placedPath.x,placedPath.y,FOUNDER_CAMP)});worldDirty=true;detectBridgeSite(world,pathsRef.current,placedPath,clock.day);const stamped=extendPathToCrossing(world,pathsRef.current,placedPath);if(stamped.length>0)worldDirty=true;}}}
          }
        }
        if(atDest||(Math.round(f.x)===dest.x&&Math.round(f.y)===dest.y)){
          // Arrived: act on the destination.
          // BUILD 1079 (0x0E): the delivery runs by workState, not
          // activity. A founder who flips to rest/eat/sleep while
          // carrying must still deliver when they reach their
          // destination — the delivery is a physical fact (they are
          // carrying wood), not an activity. Before this fix the
          // delivery branch sat inside the work/build chain below,
          // so a carrier at camp with activity rest/eat stood
          // carrying wood until the scorer picked work again
          // (Greta + Perrin, 115+s). The empty-carrier reset rides
          // along: a 'toStockpile' founder with nothing to carry
          // goes back to 'toTree' on arrival, whatever the activity.
          if(f.workState==='toStockpile'&&(f.carrying>0||f.carryingGrain>0||f.carryingStone>0||f.carryingBuild>0||f.carryingOre>0||f.carryingMeat>0||f.carryingLeather>0||f.carryingFish>0||f.carryingWool>0)){
            // BUILD 1065 (J-1): the delivery runs only on a held
            // deliver job — the transfer IS the job's completion.
            // Without the job (claimed next tick) the founder
            // waits at camp; the wood never moves without a job.
            if(myJob&&myJob.kind==='deliver'){
              // BUILD 1087: the delivery is a real transfer to the
              // delivery store (the storehouse when it exists, the
              // camp pile before that) — wood, stone, and carried
              // build wood go to the store; grain always goes to
              // the camp store (the mill's buffer lives at camp).
              // BUILD 1064 (R-1): the wood the tree held is the
              // wood the pile gains, conserved. BUILD 1067: the
              // delivery moves wood AND grain.
              // BUILD 1089: the delivery moves ore too (iron to
              // the storehouse store — the mine's yield).
              const res=deliverFounderCarryToStore(registryRef.current,f,storehouseRef.current);
              registryRef.current=res.registry;
              f.carrying-=res.movedWood;f.carryingGrain-=res.movedGrain;f.carryingStone-=res.movedStone;f.carryingBuild-=res.movedBuildWood;f.carryingOre-=res.movedOre;f.carryingMeat-=res.movedMeat;f.carryingLeather-=res.movedLeather;f.carryingFish-=res.movedFish;f.carryingWool-=res.movedWool;stockChanged=true;
              if(f.carrying<=0&&f.carryingGrain<=0&&f.carryingStone<=0&&f.carryingBuild<=0&&f.carryingOre<=0&&f.carryingMeat<=0&&f.carryingLeather<=0&&f.carryingFish<=0&&f.carryingWool<=0){
                f.carrying=0;f.carryingGrain=0;f.carryingStone=0;f.carryingBuild=0;f.carryingOre=0;f.carryingMeat=0;f.carryingLeather=0;f.carryingFish=0;f.carryingWool=0;f.carryingOreKind=null;f.workState='toTree';
                jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;
                const parts:string[]=[];if(res.movedWood>0)parts.push('wood');if(res.movedGrain>0)parts.push('grain');if(res.movedStone>0)parts.push('stone');if(res.movedIron>0)parts.push('iron');if(res.movedCoal>0)parts.push('coal');if(res.movedMeat>0)parts.push('meat');if(res.movedFish>0)parts.push('fish');if(res.movedLeather>0)parts.push('leather');if(res.movedWool>0)parts.push('wool');const what=parts.join(' and ')||'wood';
                setMessage(f.name+' delivered '+what+' to '+(res.dest===STOREHOUSE_STORE_ID?'the storehouse':'the camp stockpile'));
              }
            }
          }else if(f.workState==='toStockpile'){
            f.workState='toTree';
          }else if(f.activity==='sleep'&&hutPlaced&&f.bed.hut>=0&&!insideHut){
            // Through the door to their bed (their hut sleep tile —
            // the north row, door lane kept clear).
            const bed=f.bed;
            f.x=bed.x;f.y=bed.y;founderPath.delete(f.name);
          }else if(f.activity==='work'||f.activity==='build'){
            if(f.workState==='arriving'){
              // BUILD 1096: the inn is a waystation — a newcomer who
              // has not rested there stops at the inn approach, rests
              // inside (energy to full, one meal from the inn store),
              // then walks on to camp. The rest is a real activity
              // (the scorer is skipped while 'arriving', so the 'rest'
              // holds until the stay runs out).
              if(isInnUsable(housingRef.current)&&!f.innRested&&Math.round(f.x)===INN_APPROACH.x&&Math.round(f.y)===INN_APPROACH.y){
                f.innRested=true;f.innRestTicks=INN_REST_TICKS;
                const taken=new Set(foundersRef.current.filter((o)=>o!==f&&o.restTile).map((o)=>o.restTile!.x+','+o.restTile!.y));
                const restTile=innRestTileFor(taken)??{x:INN_REST_TILES[0].x,y:INN_REST_TILES[0].y};
                f.activity='rest';f.restTile=restTile;
                f.x=restTile.x;f.y=restTile.y;founderPath.delete(f.name);
                f.needs={...f.needs,energy:100};
                const meal=eatInnMeal(f.needs,innFoodInRegistry(registryRef.current));
                if(meal.ate){const w=withdrawFrom(registryRef.current,INN_STORE_ID,'food',1);registryRef.current=w.registry;if(w.taken>=1){f.needs=meal.needs;}}
              }else{
                // BUILD 1066: a newcomer reached camp on foot — they
                // join the workforce (the scorer picks their next job
                // next tick). No teleport: they walked in from the
                // east edge.
                f.workState='toTree';
                // BUILD 1103: Tamsin is welcomed — every founder
                // gains her key (neutral 50, dated today), so the
                // settlement knows her from the moment she arrives.
                // Pool arrivals keep the old shape (no keys).
                if(f.name===NEWCOMER_NAME){for(const o of founders){if(o!==f)o.social=addSocialKey(o.social,f.name,clock.day);}setMessage(NEWCOMER_NAME+' has joined the settlement');}
              }
              founderPath.delete(f.name);
            }else if(f.workState==='toStorehouse'){
              // BUILD 1087: at the storehouse approach — fetch the
              // step's wood (2) from the storehouse store into the
              // carrier, then walk to the site. If the store is
              // short (another builder took it first), the fetch
              // carries 0 and the builder falls back to the site —
              // the step spends from the camp pile instead.
              const fetched=fetchBuildWood(registryRef.current,f);
              registryRef.current=fetched.registry;
              f.carryingBuild=fetched.moved;
              stockChanged=true;
              f.workState='toSite';
            }else if(f.workState==='toWell'){
              // BUILD 1088: at the well approach — draw one bucket of
              // water, then walk to the farm tile to pour it. The draw
              // is instant (the fetch leg's precedent) — the trip is
              // the work, not the drawing. If the well is gone, the
              // founder re-targets with nothing carried.
              if(well){f.carryingWater=1;f.workState='toWater';}else{f.carryingWater=0;f.waterTarget=null;f.workState='toTree';}
            }else if(f.workState==='toWater'){
              // BUILD 1088: at the farm tile — pour the bucket (the
              // tile grows 60 game-minutes faster) and complete the
              // water job. A tile that is no longer waterable spills
              // the bucket and fails the job — the water never strands
              // in the carrier.
              if(f.waterTarget&&waterFarmTile(world,f.waterTarget.x,f.waterTarget.y,nowAbs).ok){
                worldDirty=true;
                if(myJob&&myJob.kind==='water'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
              }else if(myJob&&myJob.kind==='water'){jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'target-gone');myJob=undefined;}
              f.carryingWater=0;f.waterTarget=null;f.workState='toTree';
            }else if(f.workState==='toSite'){
              // At the approach tile: start building.
              f.workState='building';f.buildTicks=0;
            }else if(f.workState==='building'){
              f.buildTicks++;
              if(f.buildTicks>=HUT_TICKS_PER_STEP){
                f.buildTicks=0;
                // BUILD 1087: three step paths, one shared
                // completion. The storehouse's own step draws from
                // the CAMP pile (it does not exist yet to draw from
                // — 2 wood + 1 stone). A hut step spends the CARRIED
                // wood when the builder fetched it from the
                // storehouse, else the camp pile. A ready site
                // (progress 6, placement blocked) spends nothing
                // and retries the placement below, so no wood is
                // ever spent twice.
                let step: { registry: ResourceRegistry; construction: ConstructionState; storehouse: StorehouseState; foodChain: FoodChainState; metalChain: MetalChainState; completed: boolean; spent: boolean } | null = null;
                const isStorehouseJob=myJob&&myJob.kind==='build'&&myJob.targetId===STOREHOUSE_SITE_ID;
                const isBridgeJob=myJob&&myJob.kind==='build'&&myJob.targetId.startsWith('bridge-');
                const isMillJob=myJob&&myJob.kind==='build'&&myJob.targetId===MILL_SITE_ID;
                const isBakeryJob=myJob&&myJob.kind==='build'&&myJob.targetId===BAKERY_SITE_ID;
                const isSmelterJob=myJob&&myJob.kind==='build'&&myJob.targetId===SMELTER_SITE_ID;
                const isBlacksmithJob=myJob&&myJob.kind==='build'&&myJob.targetId===BLACKSMITH_SITE_ID;
                const isSawmillJob=myJob&&myJob.kind==='build'&&myJob.targetId===SAWMILL_SITE_ID;
                const isCarpenterJob=myJob&&myJob.kind==='build'&&myJob.targetId===CARPENTER_SITE_ID;
                const isWorkshopJob=myJob&&myJob.kind==='build'&&myJob.targetId===WORKSHOP_SITE_ID;
                const isInnJob=myJob&&myJob.kind==='build'&&myJob.targetId===INN_SITE_ID;
                const isPenJob=myJob&&myJob.kind==='build'&&myJob.targetId===PEN_SITE_ID;
                if(isBridgeJob){
                  // BUILD 1088: a bridge step — 2 wood from the camp
                  // pile, the progress rises by 1; at the last step the
                  // bridge is READY but the state stays 'building'
                  // until the placement actually lands (finishBridge,
                  // below) — the hut and storehouse's ready/done split.
                  const site=bridgeSiteById(pathsRef.current.bridges,myJob!.targetId);
                  if(site&&canBuildBridge(site,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)))){
                    const brRes=spendBridgeStepFromRegistry(registryRef.current,pathsRef.current.bridges,myJob!.targetId);
                    pathsRef.current={...pathsRef.current,bridges:brRes.bridges};
                    if(brRes.spent||brRes.completed)step={registry:brRes.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:metalChainRef.current,completed:brRes.completed,spent:brRes.spent};
                  }
                }else if(isMillJob){
                  // BUILD 1094: a mill step — 1 wood from the camp pile,
                  // the progress rises by 1; at the last step the mill is
                  // READY but the state stays 'building' until the
                  // placement actually lands (finishMill, below).
                  if(canBuildMill(foodChainRef.current,campWoodInRegistry(registryRef.current))){
                    const mRes=spendMillStepFromRegistry(registryRef.current,foodChainRef.current);
                    if(mRes.spent||mRes.completed)step={registry:mRes.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:mRes.foodChain,metalChain:metalChainRef.current,completed:mRes.completed,spent:mRes.spent};
                  }
                }else if(isBakeryJob){
                  // BUILD 1094: a bakery step — same shape as the mill.
                  if(canBuildBakery(foodChainRef.current,campWoodInRegistry(registryRef.current))){
                    const bRes=spendBakeryStepFromRegistry(registryRef.current,foodChainRef.current);
                    if(bRes.spent||bRes.completed)step={registry:bRes.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:bRes.foodChain,metalChain:metalChainRef.current,completed:bRes.completed,spent:bRes.spent};
                  }
                }else if(isSmelterJob){
                  // BUILD 1095: a smelter step — 1 wood from the camp
                  // pile, the progress rises by 1; at the last step the
                  // smelter is READY but the state stays 'building'
                  // until the placement actually lands (finishSmelter,
                  // below) — the mill's ready/done split.
                  if(canBuildSmelter(metalChainRef.current,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)))){
                    const sRes=spendSmelterStepFromRegistry(registryRef.current,metalChainRef.current);
                    if(sRes.spent||sRes.completed)step={registry:sRes.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:sRes.metalChain,completed:sRes.completed,spent:sRes.spent};
                  }
                }else if(isBlacksmithJob){
                  // BUILD 1095: a blacksmith step — the same shape.
                  if(canBuildBlacksmith(metalChainRef.current,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)))){
                    const bRes2=spendBlacksmithStepFromRegistry(registryRef.current,metalChainRef.current);
                    if(bRes2.spent||bRes2.completed)step={registry:bRes2.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:bRes2.metalChain,completed:bRes2.completed,spent:bRes2.spent};
                  }
                }else if(isSawmillJob){
                  // BUILD 1095: a sawmill step — the same shape.
                  if(canBuildSawmill(metalChainRef.current,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)))){
                    const swRes=spendSawmillStepFromRegistry(registryRef.current,metalChainRef.current);
                    if(swRes.spent||swRes.completed)step={registry:swRes.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:swRes.metalChain,completed:swRes.completed,spent:swRes.spent};
                  }
                }else if(isCarpenterJob){
                  // BUILD 1095: a carpenter step — the same shape.
                  if(canBuildCarpenter(metalChainRef.current,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)))){
                    const cpRes=spendCarpenterStepFromRegistry(registryRef.current,metalChainRef.current);
                    if(cpRes.spent||cpRes.completed)step={registry:cpRes.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:cpRes.metalChain,completed:cpRes.completed,spent:cpRes.spent};
                  }
                }else if(isWorkshopJob){
                  // BUILD 1095: a workshop step — 2 wood from the camp
                  // pile, and on a tool step 1 tool from the storehouse
                  // store. canBuildWorkshop gates the tool step, so a
                  // builder with no tool does nothing here (the stall).
                  if(canBuildWorkshop(metalChainRef.current,(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current)),metalChainToolsInRegistry(registryRef.current))){
                    const wRes=spendWorkshopStepFromRegistry(registryRef.current,metalChainRef.current);
                    if(wRes.spent||wRes.completed)step={registry:wRes.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:wRes.metalChain,completed:wRes.completed,spent:wRes.spent};
                  }
                }else if(isInnJob){
                  // BUILD 1096: an inn step — 1 wood from the pile +
                  // storehouse (buildInnStep, withdrawChainWood); at
                  // the last step the inn is READY but the state
                  // stays 'building' until the placement actually
                  // lands (finishInn, below) — the mill's split.
                  if(canBuildInn(housingRef.current,campWoodInRegistry(registryRef.current),storehouseWoodInRegistry(registryRef.current))){
                    const iRes=buildInnStep(registryRef.current,housingRef.current);
                    housingRef.current=iRes.housing;
                    if(iRes.spent||iRes.completed)step={registry:iRes.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:metalChainRef.current,completed:iRes.completed,spent:iRes.spent};
                  }
                }else if(isPenJob){
                  // BUILD 1102: a pen step — 2 wood from the camp pile,
                  // the progress rises by 1 (spendPenStepFromRegistry);
                  // at the last step the pen is READY but the state
                  // stays 'building' until the placement actually lands
                  // (finishPen, below) — the mill's ready/done split.
                  // The pile is empty once the storehouse is done
                  // (deliveries go there), so the pen stalled at 5/6:
                  // transfer a step's wood from the storehouse to the
                  // pile (both are camp stores) when the pile is short.
                  if(campWoodInRegistry(registryRef.current)<PEN_WOOD_PER_STEP&&storehouseWoodInRegistry(registryRef.current)>=PEN_WOOD_PER_STEP){const tr=transfer(registryRef.current,STOREHOUSE_STORE_ID,CAMP_STORE_ID,'wood',PEN_WOOD_PER_STEP,{type:'loaded'});registryRef.current=tr.registry;}
                  if(canBuildPen(penRef.current,campWoodInRegistry(registryRef.current))){
                    const pRes=spendPenStepFromRegistry(registryRef.current,penRef.current);
                    penRef.current=pRes.pen;
                    if(pRes.spent||pRes.completed)step={registry:pRes.registry,construction:constructionRef.current,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:metalChainRef.current,completed:pRes.completed,spent:pRes.spent};
                  }
                }else if(isStorehouseJob){
                  if(canBuildStorehouse(storehouseRef.current,campWoodInRegistry(registryRef.current),campStoneInRegistry(registryRef.current))){
                    const shRes=spendStorehouseStepFromRegistry(registryRef.current,storehouseRef.current);
                    if(shRes.spent||shRes.completed)step={registry:shRes.registry,construction:constructionRef.current,storehouse:shRes.storehouse,foodChain:foodChainRef.current,metalChain:metalChainRef.current,completed:shRes.completed,spent:shRes.spent};
                  }
                }else if(f.carryingBuild>0){
                  const jobSite=hutSiteById(myJob&&myJob.kind==='build'?myJob.targetId:'');
                  const jobSiteIndex=jobSite?hutSiteIndexById(jobSite.id):-1;
                  const res=spendBuildStepFromCarried(registryRef.current,constructionRef.current,f,jobSiteIndex>=0?jobSiteIndex:undefined);
                  if(res.spent||res.completed){
                    if(res.spent)f.carryingBuild-=HUT_WOOD_PER_STEP;
                    step={registry:res.registry,construction:res.construction,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:metalChainRef.current,completed:res.completed,spent:res.spent};
                  }
                }else if(campWoodInRegistry(registryRef.current)>=HUT_WOOD_PER_STEP||hasReadyHutSite(constructionRef.current)){
                  // BUILD 1087 (ready-site fix, part 2): the camp-pile
                  // branch is also the placement-retry path — a ready
                  // site spends nothing (spendBuildStepFromRegistry
                  // returns completed without spending), so the branch
                  // must fire even when the pile is empty. Without
                  // this the gates let the builder walk to the site
                  // but the spend never runs, the builder releases,
                  // and the founders waste trips walking to a site
                  // they can never place (diag H: hut0 6/6 from t170
                  // to t407, the 24h numbers moved).
                  // BUILD 1064 (R-1): the step's wood is withdrawn
                  // from the registry's camp store — 2 wood leaves
                  // the pile only when the step completes.
                  const jobSite=hutSiteById(myJob&&myJob.kind==='build'?myJob.targetId:'');
                  const jobSiteIndex=jobSite?hutSiteIndexById(jobSite.id):-1;
                  const res=spendBuildStepFromRegistry(registryRef.current,constructionRef.current,jobSiteIndex>=0?jobSiteIndex:undefined);
                  if(res.spent||res.completed)step={registry:res.registry,construction:res.construction,storehouse:storehouseRef.current,foodChain:foodChainRef.current,metalChain:metalChainRef.current,completed:res.completed,spent:res.spent};
                }
                if(step){
                  registryRef.current=step.registry;
                  constructionRef.current=step.construction;
                  storehouseRef.current=step.storehouse;
                  foodChainRef.current=step.foodChain;
                  metalChainRef.current=step.metalChain;
                  stockChanged=true;hutChanged=true;
                  // BUILD 1060: a shared build step — the builder
                  // plus every founder chopping for the hut (activity
                  // work/build) built it together. The step is a
                  // discrete moment, so it records once.
                  for(const o of founders){if(o!==f&&(o.activity==='work'||o.activity==='build')){f.social=recordSharedEvent(f.social,o.name,'build',clock.day,nowAbs);o.social=recordSharedEvent(o.social,f.name,'build',clock.day,nowAbs);}}
                  if(step.completed){
                    const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
                    const npcTiles=founders.map(o=>({x:Math.round(o.x),y:Math.round(o.y)}));
                    if(isBridgeJob){
                      // BUILD 1088: stamp the bridge through the same
                      // placement path the player uses (validatePlacement
                      // 'bridge' requires a water tile — the river tile
                      // the site spans). The tile may be occupied this
                      // tick (a founder crossing it) — then the builder
                      // waits at the site and retries next cycle; the
                      // progress is banked, no wood is spent twice (the
                      // ready-site rule).
                      const site=bridgeSiteById(pathsRef.current.bridges,myJob!.targetId);
                      const placed=site?placeBridgeSpan(world,site,playerTile,npcTiles):{ok:false as const,reason:'no site'};
                      if(placed.ok){
                        saveWorld(world);worldDirty=true;
                        pathsRef.current={...pathsRef.current,bridges:finishBridge(pathsRef.current.bridges,myJob!.targetId)};
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished a bridge!');
                      }else if(step.spent){
                        setMessage('The bridge is ready — waiting for a clear spot');
                      }
                    }else if(isMillJob){
                      // Stamp the mill through the same placement path
                      // the player uses (the 'house-windmill' kind, the
                      // surveyed centre). The rect may be occupied this
                      // tick — then the builder waits and retries next
                      // cycle; the progress is banked, no wood is spent
                      // twice (the ready-site rule).
                      const placed=validatePlacement(world,'house-windmill',MILL_CENTRE.x,MILL_CENTRE.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        foodChainRef.current=finishMill(foodChainRef.current);
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the mill!');
                      }else if(step.spent){
                        setMessage('The mill is ready — waiting for a clear spot');
                      }
                    }else if(isBakeryJob){
                      // Stamp the bakery the same way (the 'house' kind
                      // on the surveyed centre — there is no
                      // 'house-bakery' palette kind).
                      const placed=validatePlacement(world,'house',BAKERY_CENTRE.x,BAKERY_CENTRE.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        foodChainRef.current=finishBakery(foodChainRef.current);
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the bakery!');
                      }else if(step.spent){
                        setMessage('The bakery is ready — waiting for a clear spot');
                      }
                    }else if(isSmelterJob){
                      // Stamp the smelter through the same placement path
                      // the player uses (the 'house' kind on the surveyed
                      // centre — there is no 'house-smelter' palette kind).
                      const placed=validatePlacement(world,'house',SMELTER_CENTRE.x,SMELTER_CENTRE.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        metalChainRef.current=finishSmelter(metalChainRef.current);
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the smelter!');
                      }else if(step.spent){
                        setMessage('The smelter is ready — waiting for a clear spot');
                      }
                    }else if(isBlacksmithJob){
                      // Stamp the blacksmith the same way — as a
                      // 3x3 'house', NOT the 5x4 'house-smith'
                      // town kind (BUILD 1095: the 5x4 rect would
                      // hit the market stall at (114,116), and the
                      // town's existing smithy already occupies
                      // the old (118,118) site).
                      const placed=validatePlacement(world,'house',BLACKSMITH_CENTRE.x,BLACKSMITH_CENTRE.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        metalChainRef.current=finishBlacksmith(metalChainRef.current);
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the blacksmith!');
                      }else if(step.spent){
                        setMessage('The blacksmith is ready — waiting for a clear spot');
                      }
                    }else if(isSawmillJob){
                      // Stamp the sawmill the same way (the 'house' kind
                      // on the surveyed centre).
                      const placed=validatePlacement(world,'house',SAWMILL_CENTRE.x,SAWMILL_CENTRE.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        metalChainRef.current=finishSawmill(metalChainRef.current);
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the sawmill!');
                      }else if(step.spent){
                        setMessage('The sawmill is ready — waiting for a clear spot');
                      }
                    }else if(isCarpenterJob){
                      // Stamp the carpenter the same way.
                      const placed=validatePlacement(world,'house',CARPENTER_CENTRE.x,CARPENTER_CENTRE.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        metalChainRef.current=finishCarpenter(metalChainRef.current);
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the carpenter!');
                      }else if(step.spent){
                        setMessage('The carpenter is ready — waiting for a clear spot');
                      }
                    }else if(isWorkshopJob){
                      // Stamp the workshop the same way.
                      const placed=validatePlacement(world,'house',WORKSHOP_CENTRE.x,WORKSHOP_CENTRE.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        metalChainRef.current=finishWorkshop(metalChainRef.current);
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the workshop!');
                      }else if(step.spent){
                        setMessage('The workshop is ready — waiting for a clear spot');
                      }
                    }else if(isInnJob){
                      // Stamp the inn through the same placement path
                      // the player uses (the 'house-inn' kind, the
                      // surveyed centre — the measured 6x5 variant).
                      const placed=validatePlacement(world,'house-inn',INN_CENTRE.x,INN_CENTRE.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        housingRef.current=finishInn(housingRef.current);
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the inn!');
                      }else if(step.spent){
                        setMessage('The inn is ready — waiting for a clear spot');
                      }
                    }else if(isPenJob){
                      // Stamp the pen's fence through the same placement
                      // path the player uses (the 'fence' kind, 1x1
                      // blocking, like a placed wall). The rect may be
                      // occupied this tick — then the builder waits and
                      // retries next cycle; the progress is banked, no
                      // wood is spent twice (the ready-site rule).
                      const fenced=new Set(placedFenceTiles(world).map((t)=>t.tx+','+t.ty));
                      const fenceTiles:Array<{x:number;y:number}> = [];
                      for(let x=PEN_RECT.x0;x<=PEN_RECT.x1;x++){fenceTiles.push({x,y:PEN_RECT.y0});fenceTiles.push({x,y:PEN_RECT.y1});}
                      for(let y=PEN_RECT.y0+1;y<=PEN_RECT.y1-1;y++){fenceTiles.push({x:PEN_RECT.x0,y});fenceTiles.push({x:PEN_RECT.x1,y});}
                      let fenceOk=true;
                      for(const t of fenceTiles){
                        if(fenced.has(t.x+','+t.y))continue;
                        const placed=validatePlacement(world,'fence',t.x,t.y,playerTile,npcTiles,0);
                        if(!placed.ok){fenceOk=false;break;}
                        addPlacement(world,placed.item);
                        fenced.add(t.x+','+t.y);
                      }
                      if(fenceOk){
                        saveWorld(world);worldDirty=true;
                        penRef.current=finishPen(penRef.current);
                        penRef.current=stockPenFromWild(penRef.current,world).pen;
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the pen!');
                      }else if(step.spent){
                        setMessage('The pen is ready — waiting for a clear spot');
                      }
                    }else if(isStorehouseJob){
                      // Stamp the storehouse through the same
                      // placement path the player uses. The rect may
                      // be occupied this tick (a founder crossing
                      // it) — then the builder waits at the site and
                      // retries next cycle; the progress is banked,
                      // no wood is spent twice.
                      const placed=validatePlacement(world,STOREHOUSE_KIND,STOREHOUSE_HUT_SITE.centre.x,STOREHOUSE_HUT_SITE.centre.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        storehouseRef.current=finishStorehouse(storehouseRef.current);
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage('The founders finished the storehouse!');
                      }else if(step.spent){
                        setMessage('The storehouse is ready — waiting for a clear spot');
                      }
                    }else{
                      // Stamp the hut through the same placement path
                      // the player uses. The rect may be occupied this
                      // tick (a founder crossing it) — then the builder
                      // waits at the site and retries next cycle; the
                      // progress is banked, no wood is spent twice.
                      const jobSite=hutSiteById(myJob&&myJob.kind==='build'?myJob.targetId:'');
                      const jobSiteIndex=jobSite?hutSiteIndexById(jobSite.id):-1;
                      const placed=validatePlacement(world,HUT_KIND,jobSite?jobSite.centre.x:HUT_CENTRE.x,jobSite?jobSite.centre.y:HUT_CENTRE.y,playerTile,npcTiles,0);
                      if(placed.ok){
                        addPlacement(world,placed.item);
                        saveWorld(world);worldDirty=true;
                        constructionRef.current=finishConstruction(constructionRef.current,jobSiteIndex>=0?jobSiteIndex:undefined);
                        // BUILD 1065 (J-1): the hut is done — the
                        // build job completes with it.
                        if(myJob&&myJob.kind==='build'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                        f.workState='toTree';
                        setMessage(jobSite&&jobSite.id==='hut-site-1'?'The founders finished their second hut!':'The founders finished their first hut!');
                      }else if(step.spent){
                        setMessage('The hut is ready — waiting for a clear spot');
                      }
                    }
                  }
                }else if(!isBridgeJob&&!isStorehouseJob&&!isMillJob&&!isBakeryJob&&storehouseRef.current.state==='done'&&storehouseWoodInRegistry(registryRef.current)>=HUT_WOOD_PER_STEP){
                  // BUILD 1087: the step's wood is in the storehouse,
                  // not the camp pile — walk back and fetch it instead
                  // of releasing the site (deliveries land in the
                  // storehouse while it is done, so the camp pile
                  // will not refill on its own).
                  f.workState='toStorehouse';f.buildTicks=0;
                }else{
                  // No step could start: the pile ran dry mid-build
                  // (hut: camp wood < 2; storehouse: camp wood < 2
                  // or stone < 1) — back to chopping, and the site
                  // is released (BUILD 1065), so another founder can
                  // take it when the pile refills.
                  if(myJob&&myJob.kind==='build'){jobBoardRef.current=releaseJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                  f.workState='toTree';f.treeTarget=null;f.workTile=null;
                }
              }
            }else if(f.workState==='toTree'&&f.treeTarget){
              // At the tree's work tile: start chopping.
              f.workState='chopping';f.chopTicks=0;
            }else if(f.workState==='chopping'&&f.treeTarget){
              f.chopTicks++;
              if(f.chopTicks>=FOUNDER_CHOP_TICKS){
                // The tree is gone (chopped by the player first) →
                // no wood, walk home empty and re-target.
                // BUILD 1064 (R-1): the fell goes through the
                // registry — the tree's deposit is extracted and
                // the yield lands in the founder's carrier store
                // (capacity 2), with the tree as its source.
                const fell=fellTreeToCarrier(registryRef.current,world,f,f.treeTarget.x,f.treeTarget.y);
                registryRef.current=fell.registry;
                if(fell.yield>0){
                  f.carrying=fell.yield;worldDirty=true;
                  // BUILD 1065 (J-1): the chop job completes on the
                  // fell (the yield is in the carrier); the delivery
                  // is a deliver job, claimed now so the founder
                  // holds it from the fell onward.
                  // BUILD 1089: a lumber job completes the same way
                  // (the fell is the same — the tree was a rect
                  // tree, and the sapling is planted by the fell).
                  if(myJob&&(myJob.kind==='chop'||myJob.kind==='lumber')){
                    if(myJob.kind==='lumber'&&minesRef.current.lumber)minesRef.current={...minesRef.current,lumber:{...minesRef.current.lumber,treesFelled:minesRef.current.lumber.treesFelled+1}};
                    jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;
                  }
                  const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carrying,nowAbs);
                  jobBoardRef.current=dc.board;
                  if(dc.job)myJob=dc.job;
                }else if(myJob&&(myJob.kind==='chop'||myJob.kind==='lumber')){
                  // The tree is gone (chopped by the player first)
                  // — the job failed; walk home empty and re-target.
                  jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'target-gone');myJob=undefined;
                }
                f.treeTarget=null;f.workTile=null;f.chopTicks=0;
                f.workState='toStockpile';
              }
            }else if(f.workState==='toFarm'&&f.farmTarget){
              // At the farm tile: start harvesting (the tile is
              // walk-through ground cover, so the founder stands
              // on it; the tile itself is the work tile).
              f.workState='harvesting';f.harvestTicks=0;
            }else if(f.workState==='harvesting'&&f.farmTarget){
              f.harvestTicks++;
              if(f.harvestTicks>=FOUNDER_HARVEST_TICKS){
                // BUILD 1067: the harvest goes through the registry
                // — the tile resets to planted (it regrows) and the
                // yield lands in the founder's carrier store
                // (capacity 2), with the farm tile as its source.
                const harv=harvestFarmTileToCarrier(registryRef.current,world,f,f.farmTarget.x,f.farmTarget.y,nowAbs,growthFactorAt(world,clock.day,f.farmTarget.x,f.farmTarget.y));
                registryRef.current=harv.registry;
                if(harv.yield>0){
                  f.carryingGrain=harv.yield;worldDirty=true;
                  // The harvest job completes on the harvest (the
                  // grain is in the carrier); the delivery is a
                  // deliver job, claimed now so the founder holds
                  // it from the harvest onward.
                  if(myJob&&myJob.kind==='harvest'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                  const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carrying+f.carryingGrain,nowAbs);
                  jobBoardRef.current=dc.board;
                  if(dc.job)myJob=dc.job;
                }else if(myJob&&myJob.kind==='harvest'){
                  // The tile is no longer ready (harvested by the
                  // player or another founder first) — the job
                  // failed; re-target next tick.
                  jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'target-gone');myJob=undefined;
                }
                f.farmTarget=null;f.harvestTicks=0;
                f.workState='toStockpile';
              }
            }else if(f.workState==='toPlant'&&f.farmTarget){
              // At the farm tile: start planting (the tile is
              // walk-through ground cover, so the founder stands
              // on it; the tile itself is the work tile).
              f.workState='planting';f.plantTicks=0;
            }else if(f.workState==='planting'&&f.farmTarget){
              f.plantTicks++;
              if(f.plantTicks>=FOUNDER_PLANT_TICKS){
                // BUILD 1090: planting tills the tile through the
                // same placement path the player uses (a tile that
                // is no longer plantable fails the job — another
                // founder planted it first, or the player built
                // there). No carried item, so no deliver job — the
                // founder goes straight back to work.
                const planted=plantFarmTile(world,f.farmTarget.x,f.farmTarget.y,nowAbs);
                if(planted.ok){
                  worldDirty=true;
                  if(myJob&&myJob.kind==='plant'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                }else if(myJob&&myJob.kind==='plant'){
                  jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'target-gone');myJob=undefined;
                }
                f.farmTarget=null;f.plantTicks=0;
                f.workState='toTree';
              }
            }else if(f.workState==='toMine'&&f.mineTarget){
              // At the mine's work tile: start the shift. No ore
              // moves while walking — the mine runs only here, on
              // arrival (the quarry's arrival gate).
              f.workState='miningOre';f.mineTicks=0;
            }else if(f.workState==='miningOre'&&f.mineTarget){
              f.mineTicks++;
              if(f.mineTicks>=MINE_TICKS_PER_SHIFT){
                // BUILD 1089: the shift goes through the registry —
                // the deposit depletes and the yield lands in the
                // founder's carrier store (capacity 2), with the
                // deposit as its source.
                const site=minesRef.current.mines.find((s)=>s.id===f.mineTarget!.id)??null;
                const mined=site?mineOreToCarrier(registryRef.current,world,f,site):{registry:registryRef.current,yield:0,sourceId:null};
                registryRef.current=mined.registry;
                if(mined.yield>0){
                  f.carryingOre+=mined.yield;f.carryingOreKind=site&&site.mineral==='coal'?'coal':'iron';worldDirty=true;
                  if(site)minesRef.current={...minesRef.current,mines:minesRef.current.mines.map((m)=>m.id===site.id?{...m,shiftsCompleted:m.shiftsCompleted+1,oreMined:m.oreMined+mined.yield}:m)};
                  if(myJob&&myJob.kind==='mine'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                  const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carrying+f.carryingGrain+f.carryingStone+f.carryingOre,nowAbs);
                  jobBoardRef.current=dc.board;
                  if(dc.job)myJob=dc.job;
                }else if(myJob&&myJob.kind==='mine'){
                  // The deposit is gone (mined out) — the job failed;
                  // walk home empty and re-target (the site exhausts
                  // on the next reconcile).
                  jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'target-gone');myJob=undefined;
                }
                f.mineTarget=null;f.mineTicks=0;
                f.workState='toStockpile';
              }
            }else if(f.workState==='toMill'){
              // At the mill approach: start the milling shift (the
              // arrival gate — no flour moves while walking).
              f.workState='milling';f.millTicks=0;
            }else if(f.workState==='milling'){
              // The shift grinds per tick (2 grain -> 2 flour a tick) —
              // a mill with no grain grinds nothing, and the flour
              // store caps the grind (the cap binds at 100). The job
              // completes at the shift end.
              const ground=grindGrainToFlour(registryRef.current,true);
              registryRef.current=ground.registry;
              if(ground.ground>0)stockChanged=true;
              f.millTicks++;
              if(f.millTicks>=MILL_TICKS_PER_SHIFT){
                if(myJob&&myJob.kind==='mill'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                f.millTicks=0;f.workState='toTree';
              }
            }else if(f.workState==='toBakery'){
              // At the bakery approach: start the baking shift.
              f.workState='baking';f.bakeTicks=0;
            }else if(f.workState==='baking'){
              // The shift bakes per tick (2 flour -> 1 meal a tick) —
              // a bakery with no flour bakes nothing, and the bake
              // stops when the camp holds 15 meals. The job completes
              // at the shift end.
              const baked=bakeFlourToMeals(registryRef.current,true);
              registryRef.current=baked.registry;
              if(baked.baked>0)stockChanged=true;
              f.bakeTicks++;
              if(f.bakeTicks>=BAKE_TICKS_PER_SHIFT){
                if(myJob&&myJob.kind==='bake'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                f.bakeTicks=0;f.workState='toTree';
              }
            }else if(f.workState==='toPrey'){
              // At the prey tile: start the hunt shift (the arrival
              // gate — no yield moves while walking).
              f.workState='hunting';f.animalTicks=0;
            }else if(f.workState==='hunting'){
              // The shift hunts per tick — the kill lands at the shift
              // end (HUNT_TICKS_PER_SHIFT). The live animal leaves the
              // field and its population drops by one; the yield goes
              // into the carrier (the fell pattern); the founder then
              // delivers it (the chop pattern).
              f.animalTicks++;
              if(f.animalTicks>=HUNT_TICKS_PER_SHIFT){
                const kind=preyKindForTargetId(myJob?myJob.targetId:'')??f.preyTarget?.kind??null;
                if(kind&&myJob&&myJob.kind==='hunt'){
                  if(f.preyTarget)animalsRef.current=animalsRef.current.filter((a)=>a.id!==f.preyTarget!.id);
                  recordAnimalKill(world,kind);
                  const y=HUNT_YIELD[kind as keyof typeof HUNT_YIELD];
                  if(y.meat>0){const m=carryAnimalYieldToCarrier(registryRef.current,f,'meat',y.meat,myJob.targetId);registryRef.current=m.registry;f.carryingMeat+=m.added;stockChanged=true;}
                  if(y.leather>0){const l=carryAnimalYieldToCarrier(registryRef.current,f,'leather',y.leather,myJob.targetId);registryRef.current=l.registry;f.carryingLeather+=l.added;stockChanged=true;}
                  jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;
                  const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carryingMeat+f.carryingLeather,nowAbs);
                  jobBoardRef.current=dc.board;
                  if(dc.job)myJob=dc.job;
                }else if(myJob&&myJob.kind==='hunt'){
                  jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'target-gone');myJob=undefined;
                }
                f.preyTarget=null;f.animalTicks=0;f.workState='toStockpile';
              }
            }else if(f.workState==='toBank'){
              // At the bank tile: start the fishing shift (the arrival
              // gate — no fish moves while walking).
              f.workState='fishing';f.animalTicks=0;
            }else if(f.workState==='fishing'){
              // The shift fishes per tick — the catch lands at the shift
              // end (FISH_TICKS_PER_SHIFT). The fish population drops by
              // one and the catch goes into the carrier; the founder
              // then delivers it.
              f.animalTicks++;
              if(f.animalTicks>=FISH_TICKS_PER_SHIFT){
                if(myJob&&myJob.kind==='fish'){
                  recordAnimalKill(world,'fish');
                  const c=carryAnimalYieldToCarrier(registryRef.current,f,'fish',FISH_YIELD,myJob.targetId);
                  registryRef.current=c.registry;f.carryingFish+=c.added;stockChanged=true;
                  jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;
                  const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carryingFish,nowAbs);
                  jobBoardRef.current=dc.board;
                  if(dc.job)myJob=dc.job;
                }
                f.animalTicks=0;f.workState='toStockpile';
              }
            }else if(f.workState==='toPen'){
              // At the pen approach: start the shepherding shift.
              f.workState='shepherding';f.animalTicks=0;
            }else if(f.workState==='shepherding'){
              // The shift works per tick — the leg lands at the shift
              // end (the same 3-tick shift as the hunt). Feed: the
              // carried grain is spent and the pen is fed for the day.
              // Shear: the wool leaves the sheep into the carrier (at
              // most the carrier cap — the rest stays for the next
              // shear). Either way the founder then delivers what
              // they carry.
              f.animalTicks++;
              if(f.animalTicks>=HUNT_TICKS_PER_SHIFT){
                if(myJob&&myJob.kind==='shepherd'){
                  if(myJob.targetId===PEN_FEED_JOB_ID){
                    penRef.current=feedPen(penRef.current,clock.day);
                    f.carryingGrain=Math.max(0,f.carryingGrain-1);
                  }else{
                    const sh=shearPen(penRef.current);
                    penRef.current=sh.pen;
                    if(sh.wool>0){const w=carryAnimalYieldToCarrier(registryRef.current,f,'wool',sh.wool,myJob.targetId);registryRef.current=w.registry;f.carryingWool+=w.added;stockChanged=true;}
                  }
                  jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;
                  const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carryingWool+f.carryingGrain,nowAbs);
                  jobBoardRef.current=dc.board;
                  if(dc.job)myJob=dc.job;
                }
                f.animalTicks=0;f.workState='toStockpile';
              }
            }else if(f.workState==='toSmelter'){
              // At the smelter approach: start the smelting shift (the
              // arrival gate — no ingots move while walking).
              f.workState='smelting';f.smeltTicks=0;
            }else if(f.workState==='smelting'){
              // The shift smelts per tick (1 ore + 1 coal -> 1 ingot a
              // tick) — a smelter with no ore or no coal smelts
              // nothing, and the ingot store caps the smelt (the cap
              // binds at 20). The job completes at the shift end.
              const smelted=smeltOreToIngots(registryRef.current,true);
              registryRef.current=smelted.registry;
              if(smelted.smelted>0)stockChanged=true;
              f.smeltTicks++;
              if(f.smeltTicks>=SMELT_TICKS_PER_SHIFT){
                if(myJob&&myJob.kind==='smelt'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                f.smeltTicks=0;f.workState='toTree';
              }
            }else if(f.workState==='toSmith'){
              // At the blacksmith approach: start the smithing shift.
              f.workState='smithing';f.smithTicks=0;
            }else if(f.workState==='smithing'){
              // The shift smiths per tick (2 ingots -> 1 tool a tick)
              // — a blacksmith with no ingots smiths nothing, and the
              // tool store caps the smith (the cap binds at 10). The
              // job completes at the shift end.
              const smithed=smithIngotsToTools(registryRef.current,true);
              registryRef.current=smithed.registry;
              if(smithed.smithed>0)stockChanged=true;
              f.smithTicks++;
              if(f.smithTicks>=SMITH_TICKS_PER_SHIFT){
                if(myJob&&myJob.kind==='smith'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                f.smithTicks=0;f.workState='toTree';
              }
            }else if(f.workState==='toSawmill'){
              // At the sawmill approach: start the sawing shift.
              f.workState='sawing';f.sawTicks=0;
            }else if(f.workState==='sawing'){
              // The shift saws per tick (2 wood -> 2 timber a tick) —
              // a sawmill with no wood saws nothing, and the timber
              // store caps the saw (the cap binds at 40). The job
              // completes at the shift end.
              const sawn=sawWoodToTimber(registryRef.current,true);
              registryRef.current=sawn.registry;
              if(sawn.sawn>0)stockChanged=true;
              f.sawTicks++;
              if(f.sawTicks>=SAW_TICKS_PER_SHIFT){
                if(myJob&&myJob.kind==='saw'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                f.sawTicks=0;f.workState='toTree';
              }
            }else if(f.workState==='toCarpenter'){
              // At the carpenter approach: start the carpentering shift.
              f.workState='carpentering';f.carpenterTicks=0;
            }else if(f.workState==='carpentering'){
              // The shift carpenters per tick (2 timber -> 1 furniture
              // a tick) — a carpenter with no timber makes nothing, and
              // the furniture store caps the work (the cap binds at
              // 10). The job completes at the shift end.
              const made=carpenterTimberToFurniture(registryRef.current,true);
              registryRef.current=made.registry;
              if(made.made>0)stockChanged=true;
              f.carpenterTicks++;
              if(f.carpenterTicks>=CARPENTER_TICKS_PER_SHIFT){
                if(myJob&&myJob.kind==='carpenter'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                f.carpenterTicks=0;f.workState='toTree';
              }
            }else if(f.workState==='toQuarry'&&f.quarryTarget){
              // At the quarry's work tile: start mining. No stone
              // moves while walking — the mine runs only here, on
              // arrival (the 2.5D quarry loop's arrival gate).
              f.workState='mining';f.mineTicks=0;
            }else if(f.workState==='mining'&&f.quarryTarget){
              f.mineTicks++;
              if(f.mineTicks>=FOUNDER_MINE_TICKS){
                // BUILD 1086: the mine goes through the registry —
                // the deposit depletes (or the rock is consumed)
                // and the yield lands in the founder's carrier
                // store (capacity 2), with the site as its source.
                const qt=quarryTargetFromJob(f.quarryTarget.id,f.quarryTarget.x,f.quarryTarget.y);
                const mined=qt?mineStoneToCarrier(registryRef.current,world,f,qt):{registry:registryRef.current,yield:0,sourceId:null};
                registryRef.current=mined.registry;
                if(mined.yield>0){
                  // Accumulate, never overwrite: a founder reassigned
                  // to quarry while still carrying stone (a rock by
                  // camp has a work tile AT camp) keeps the stone
                  // they hold — the carrier store accumulates the
                  // same way, so the two stay in step.
                  // BUILD 1089: a site rock counts toward the quarry
                  // site's stone (the crew's measured yield).
                  if(qt&&qt.kind==='rock'&&minesRef.current.quarry&&isQuarrySiteRock(minesRef.current.quarry,qt.x,qt.y))minesRef.current={...minesRef.current,quarry:{...minesRef.current.quarry,stonesMined:minesRef.current.quarry.stonesMined+mined.yield}};
                  f.carryingStone+=mined.yield;worldDirty=true;
                  // The quarry job completes on the mine (the stone
                  // is in the carrier); the delivery is a deliver
                  // job, claimed now so the founder holds it from
                  // the mine onward.
                  if(myJob&&myJob.kind==='quarry'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                  const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carrying+f.carryingGrain+f.carryingStone,nowAbs);
                  jobBoardRef.current=dc.board;
                  if(dc.job)myJob=dc.job;
                }else if(myJob&&myJob.kind==='quarry'){
                  // The site is gone (mined out by the player, or
                  // a rock the player took first) — the job failed;
                  // walk home empty and re-target.
                  jobBoardRef.current=failJob(jobBoardRef.current,myJob.id,'target-gone');myJob=undefined;
                }
                f.quarryTarget=null;f.mineTicks=0;
                f.workState='toStockpile';
              }
            }
          }
          // Sleep/rest at camp need no arrival action — the needs
          // decay already applied the sleep/rest gains this tick.
        }
        // Idle (no tree in range) retries next tick.
        if((f.activity==='work'||f.activity==='build')&&f.workState==='idle')f.workState='toTree';
      }
      // BUILD 1094: the old direct mill (grain -> meals, no worker, no
      // building) is REMOVED — the chain replaces it. Grain becomes meals
      // only through the mill (a founder's milling shift, grain -> flour)
      // and the bakery (a founder's baking shift, flour -> meals), above.
      // Nothing runs here: a mill with no worker produces nothing.
      if(worldDirty){saveWorld(world);needsWorldRebuild.current=true;}
      if(stockChanged||hutChanged)refreshResourceUi();
      // BUILD 1068: the founders save is written by the interval,
      // once per 900ms, after all sub-steps (not per sub-step).
}

// The 900ms founder interval: N sub-steps per interval (by sim speed),
// then the founders save once (from the registry, not per sub-step).
export function runFounderSimInterval(ctx: FounderSimContext): void {
  // BUILD 1070 (0x0D, area 1): the context fields, aliased to the
  // names the body used as view closures — the body below is verbatim.
  const world = ctx.world;
  const clockRef = ctx.clock;
  const foundersRef = ctx.founders;
  const constructionRef = ctx.construction;
  const storehouseRef = ctx.storehouse;
  const pathsRef = ctx.paths;
  const minesRef = ctx.mines;
  const foodChainRef = ctx.foodChain;
  const metalChainRef = ctx.metalChain;
  const housingRef = ctx.housing;
  const sitePlanRef = ctx.sitePlan;
  const penRef = ctx.pen;
  const registryRef = ctx.registry;
  const jobBoardRef = ctx.jobBoard;
  const waitingRef = ctx.waiting;
  const needsWorldRebuild = ctx.needsWorldRebuild;
  const npcActorsRef = ctx.npcActors;
  const founderPath = ctx.founderPath;
  const { setMessage, setClockUi, refreshResourceUi, syncLivingWorld } = ctx;
      if(!FOUNDERS_ENABLED||waitingRef.current)return;
      const steps=founderStepsForSpeed(getSimSpeed());
      for(let i=0;i<steps;i++)runFounderSimTick(ctx);
      // BUILD 1064 (R-1): the founders save is written back from
      // the registry (the camp store's numbers), not from the plain
      // refs — the registry is the authority, the save is its
      // serialization (v4 shape preserved).
      saveFoundersSave(foundersSaveOf(foundersRef.current,campWoodInRegistry(registryRef.current),campFoodInRegistry(registryRef.current),campGrainInRegistry(registryRef.current),campStoneInRegistry(registryRef.current),constructionRef.current,storehouseWoodInRegistry(registryRef.current),storehouseStoneInRegistry(registryRef.current),storehouseRef.current,pathsRef.current.bridges,storehouseOreInRegistry(registryRef.current,'iron'),minesRef.current,granaryFlourInRegistry(registryRef.current),foodChainRef.current,metalChainCoalInRegistry(registryRef.current),metalChainIngotsInRegistry(registryRef.current),metalChainToolsInRegistry(registryRef.current),metalChainTimberInRegistry(registryRef.current),metalChainFurnitureInRegistry(registryRef.current),metalChainRef.current,housingRef.current,innFoodInRegistry(registryRef.current),sitePlanRef.current,penRef.current,granaryMeatInRegistry(registryRef.current),granaryFishInRegistry(registryRef.current),storehouseWoolInRegistry(registryRef.current),storehouseLeatherInRegistry(registryRef.current),pathsRef.current.lastBridgeScanDay));
}

// One wait step: advance the clock, sync the living world, rebuild the
// job board, and re-choice every founder's activity by the stepped
// clock (the SAME scorer the real-time tick uses). Positions,
// chopping, deliveries, and construction do NOT fast-forward.
export function simulateWorldSimWaitStep(ctx: WaitSimContext, step: number): void {
  // BUILD 1070 (0x0D, area 1): the context fields, aliased to the
  // names the body used as view closures — the body below is verbatim.
  const world = ctx.world;
  const clockRef = ctx.clock;
  const foundersRef = ctx.founders;
  const constructionRef = ctx.construction;
  const storehouseRef = ctx.storehouse;
  const pathsRef = ctx.paths;
  const minesRef = ctx.mines;
  const foodChainRef = ctx.foodChain;
  const metalChainRef = ctx.metalChain;
  const housingRef = ctx.housing;
  const sitePlanRef = ctx.sitePlan;
  const penRef = ctx.pen;
  const registryRef = ctx.registry;
  const jobBoardRef = ctx.jobBoard;
  const { syncLivingWorld, setClockUi } = ctx;
      clockRef.current=advanceClock(clockRef.current,step);saveClock(clockRef.current);setClockUi(clockRef.current);
      // BUILD 1062: a wait can cross midnight, and the founder tick
      // is paused during waits — so the wait step advances the living
      // world itself (same idempotent sync as the 1s clock timer).
      syncLivingWorld(world);
      // BUILD 1057: waiting founders simulate per wait-step — needs
      // decay + activity re-choice by the stepped clock (sleep
      // restores energy). Positions, chopping, and deliveries do NOT
      // fast-forward (the real-time founder tick pauses during a
      // wait, so no wood appears without a delivery). lastAbs
      // advances with the step, so the first post-wait tick does not
      // re-decay the waited span. Saved each step, like the clock.
      // BUILD 1059: the re-choice is the SAME utility scorer the
      // real-time tick uses — the world context (pile, construction,
      // nearest tree, builder-taken, current job) rides along, so a
      // wait never re-chooses by a different rule.
      if(FOUNDERS_ENABLED){
        const nowAbs=founderAbsMinutes(clockRef.current.day,clockRef.current.minutes);
        // BUILD 1065 (J-1): the board is rebuilt for the wait (a
        // fresh boot may not have run a founder tick yet — the
        // scorer needs a populated board). No jobs are claimed or
        // executed during a wait (no physical work fast-forwards);
        // the board is frozen, and the re-choice reads it.
        // BUILD 1087: the same widened radius as the real-time tick (see above).
        const wQuarryRadius=quarryClaimRadiusForStorehouse(storehouseRef.current,!hasUnfinishedSite(constructionRef.current),clockRef.current.day,campStoneInRegistry(registryRef.current),storehouseStoneInRegistry(registryRef.current));
        // BUILD 1089: the wait-step board widens the same way as the
        // real-time tick, so a wait never re-chooses by a different rule.
        const wSiteQuarryRadius=minesRef.current.quarry?quarrySiteRocks(world,minesRef.current.quarry).reduce((m,r)=>Math.max(m,Math.abs(r.tx-FOUNDER_CAMP.x)+Math.abs(r.ty-FOUNDER_CAMP.y)),0):0;
        const wClaimQuarryRadius=Math.max(wQuarryRadius,wSiteQuarryRadius);
        // BUILD 1089: the wait-step pile widens the same way as the
        // real-time tick (fresh per use, as above).
        const wPileForWood=()=>storehouseRef.current.state==='done'?Math.min(campWoodInRegistry(registryRef.current),storehouseWoodInRegistry(registryRef.current)):campWoodInRegistry(registryRef.current);
        // BUILD 1088: the well + the water feed this wait step — the
        // same rule as the real-time tick (the discovery gate, day 3,
        // mirrored here), so a wait never re-chooses by a different rule.
        const wWell=wellTile(world,FOUNDER_CAMP.x,FOUNDER_CAMP.y);
        const wReadyWater=wWell&&clockRef.current.day>=WELL_START_DAY?waterableFarmTiles(world,FOUNDER_CAMP.x,FOUNDER_CAMP.y,nowAbs,FARM_VILLAGER_RADIUS,(tx:number,ty:number)=>growthFactorAt(world,clockRef.current.day,tx,ty)).length:0;
        jobBoardRef.current=discoverJobs(jobBoardRef.current,{world:world,construction:constructionRef.current,founders:foundersRef.current,nowAbs,growthFactorAt:(tx:number,ty:number)=>growthFactorAt(world,clockRef.current.day,tx,ty),soilFactorAt:(tx:number,ty:number)=>soilFactorAt(world,tx,ty),storehouse:storehouseRef.current,day:clockRef.current.day,quarryRadius:wClaimQuarryRadius,well:wWell,bridges:pathsRef.current.bridges,mines:minesRef.current,foodChain:foodChainRef.current,metalChain:metalChainRef.current,storehouseMaterials:{iron:storehouseOreInRegistry(registryRef.current,'iron'),coal:metalChainCoalInRegistry(registryRef.current),ingots:metalChainIngotsInRegistry(registryRef.current),tools:metalChainToolsInRegistry(registryRef.current),wood:storehouseWoodInRegistry(registryRef.current),timber:metalChainTimberInRegistry(registryRef.current),furniture:metalChainFurnitureInRegistry(registryRef.current)},granary:{grain:campGrainInRegistry(registryRef.current),flour:foodChainFlourInRegistry(registryRef.current),food:campFoodInRegistry(registryRef.current)},pen:penRef.current});
        // BUILD 1069: the ready farm tiles this wait step — the
        // same feed as the real-time tick, so a wait never
        // re-chooses by a different rule.
        const wReadyFarm=readyFarmTiles(world,FOUNDER_CAMP.x,FOUNDER_CAMP.y,nowAbs,FARM_VILLAGER_RADIUS,(tx:number,ty:number)=>growthFactorAt(world,clockRef.current.day,tx,ty)).length;
        const wReadyQuarry=jobSummary(jobBoardRef.current).quarryOpen;
        // BUILD 1089: the mine + lumber feeds for the wait-step
        // re-choice — the same rule as the real-time tick, so a
        // wait never re-chooses by a different rule.
        const wReadyMine=jobSummary(jobBoardRef.current).mineOpen;
        const wReadyLumber=jobSummary(jobBoardRef.current).lumberOpen;
        // BUILD 1090: the plant feed for the wait-step re-choice.
        const wReadyPlant=jobSummary(jobBoardRef.current).plantOpen;
        // BUILD 1094: the mill + bake feeds for the wait-step re-choice.
        const wReadyMill=jobSummary(jobBoardRef.current).millOpen;
        const wReadyBake=jobSummary(jobBoardRef.current).bakeOpen;
        // BUILD 1095: the chain feeds for the wait-step re-choice.
        const wReadySmelt=jobSummary(jobBoardRef.current).smeltOpen;
        const wReadySmith=jobSummary(jobBoardRef.current).smithOpen;
        const wReadySaw=jobSummary(jobBoardRef.current).sawOpen;
        const wReadyCarpenter=jobSummary(jobBoardRef.current).carpenterOpen;
        for(let i=0;i<foundersRef.current.length;i++){
          const wf=foundersRef.current[i];
          // BUILD 1060: the wait-step re-choice is the SAME scorer
          // the real-time tick uses — including the companionship
          // premium (the closest founder's effective affinity, and
          // whether they are at camp). A wait never re-chooses by a
          // different rule. (No events are recorded during a wait —
          // the founders are wherever the wait found them, and
          // positions do not fast-forward.)
          const wClosest=closestFounder(wf.social,clockRef.current.day);
          const wCompanion=wClosest?foundersRef.current.find(o=>o.name===wClosest.name):undefined;
          const wCompanionAtCamp=!!wCompanion&&Math.abs(Math.round(wCompanion.x)-FOUNDER_CAMP.x)+Math.abs(Math.round(wCompanion.y)-FOUNDER_CAMP.y)<=3;
          foundersRef.current[i]=applyFounderWaitStep(wf,step,clockRef.current.minutes,campFoodInRegistry(registryRef.current),nowAbs,{
            foodStock:campFoodInRegistry(registryRef.current),
            stockpileWood:wPileForWood(),
            construction:constructionRef.current,
            // BUILD 1065 (J-1): the SAME board feed as the
            // real-time tick (scorerTreeDist) — a wait never
            // re-chooses by a different rule. The held job (if
            // any) names the current work; a founder holding
            // nothing has no current job.
            nearestTreeDist:scorerTreeDist(jobBoardRef.current,wf.id,FOUNDER_CAMP.x,FOUNDER_CAMP.y,FOUNDER_WORK_RADIUS),
            distToSite:distToActiveBuildSite({x:Math.round(wf.x),y:Math.round(wf.y)},constructionRef.current,storehouseRef.current,clockRef.current.day,sitePlanRef.current?.site.approach??null),
            builderTaken:(()=>{const b=buildJobClaimedBy(jobBoardRef.current);return b!==null&&b!==wf.id;})(),
            currentJob:(()=>{const j=jobForFounder(jobBoardRef.current,wf.id);return j?(j.kind==='build'?'build':'chop'):null;})(),
            closestAffinity:wClosest?wClosest.affinity:50,
            companionAtCamp:wCompanionAtCamp,
            readyFarmTiles:wReadyFarm,
            readyWaterJobs:wReadyWater,
            well:wWell,
            bridge:bridgeBuildContext(pathsRef.current.bridges,{x:Math.round(wf.x),y:Math.round(wf.y)},clockRef.current.day,!hasUnfinishedSite(constructionRef.current),storehouseRef.current.state==='done',(campWoodInRegistry(registryRef.current) + storehouseWoodInRegistry(registryRef.current))),
            stoneStock:campStoneInRegistry(registryRef.current),
            readyQuarryJobs:wReadyQuarry,
            storehouse:storehouseRef.current,
            storehouseWood:storehouseWoodInRegistry(registryRef.current),
            day:clockRef.current.day,
            readyMineJobs:wReadyMine,
            storehouseIron:storehouseOreInRegistry(registryRef.current,'iron'),
            storehouseCoal:metalChainCoalInRegistry(registryRef.current),
            readyLumberJobs:wReadyLumber,
            readyPlantJobs:wReadyPlant,
            readyMillJobs:wReadyMill,
            millTaken:foundersRef.current.some((o)=>o!==wf&&(o.workState==='toMill'||o.workState==='milling')),
            readyBakeJobs:wReadyBake,
            bakeTaken:foundersRef.current.filter((o)=>o!==wf&&(o.workState==='toBakery'||o.workState==='baking')).length>=BAKE_SLOTS,
            readySmeltJobs:wReadySmelt,
            smeltTaken:foundersRef.current.some((o)=>o!==wf&&(o.workState==='toSmelter'||o.workState==='smelting')),
            readySmithJobs:wReadySmith,
            smithTaken:foundersRef.current.some((o)=>o!==wf&&(o.workState==='toSmith'||o.workState==='smithing')),
            readySawJobs:wReadySaw,
            sawTaken:foundersRef.current.some((o)=>o!==wf&&(o.workState==='toSawmill'||o.workState==='sawing')),
            readyCarpenterJobs:wReadyCarpenter,
            carpenterTaken:foundersRef.current.some((o)=>o!==wf&&(o.workState==='toCarpenter'||o.workState==='carpentering')),
            storehouseIngots:metalChainIngotsInRegistry(registryRef.current),
            storehouseTools:metalChainToolsInRegistry(registryRef.current),
            storehouseTimber:metalChainTimberInRegistry(registryRef.current),
            storehouseFurniture:metalChainFurnitureInRegistry(registryRef.current),
            campGrain:campGrainInRegistry(registryRef.current),
            campFlour:foodChainFlourInRegistry(registryRef.current),
          });
        }
        // BUILD 1058: construction does NOT advance during a wait
        // (positions, chopping, deliveries, and building all pause);
        // the saved construction rides along unchanged.
        // BUILD 1064 (R-1): the founders save is written back from
        // the registry (the camp store's numbers), not from the
        // plain refs — the registry is the authority, the save is
        // its serialization (v4 shape preserved).
        saveFoundersSave(foundersSaveOf(foundersRef.current,campWoodInRegistry(registryRef.current),campFoodInRegistry(registryRef.current),campGrainInRegistry(registryRef.current),campStoneInRegistry(registryRef.current),constructionRef.current,storehouseWoodInRegistry(registryRef.current),storehouseStoneInRegistry(registryRef.current),storehouseRef.current,pathsRef.current.bridges,storehouseOreInRegistry(registryRef.current,'iron'),minesRef.current,granaryFlourInRegistry(registryRef.current),foodChainRef.current,metalChainCoalInRegistry(registryRef.current),metalChainIngotsInRegistry(registryRef.current),metalChainToolsInRegistry(registryRef.current),metalChainTimberInRegistry(registryRef.current),metalChainFurnitureInRegistry(registryRef.current),metalChainRef.current,housingRef.current,innFoodInRegistry(registryRef.current),sitePlanRef.current,penRef.current,granaryMeatInRegistry(registryRef.current),granaryFishInRegistry(registryRef.current),storehouseWoolInRegistry(registryRef.current),storehouseLeatherInRegistry(registryRef.current),pathsRef.current.lastBridgeScanDay));
      }
}
