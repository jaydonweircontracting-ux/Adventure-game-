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
  FOUNDER_WORK_RADIUS, FOUNDER_CHOP_TICKS, FOUNDER_HARVEST_TICKS,
  decayFounderNeeds, founderAbsMinutes, founderDestination, treeWorkTile,
  stepFounderMove, emptyFounderPath, applyFounderWaitStep, saveFoundersSave,
  foundersSaveOf, eatFounderMealFromRegistry, fellTreeToCarrier,
  deliverFounderCarryToRegistry, harvestFarmTileToCarrier, campWoodInRegistry,
  campFoodInRegistry, spawnResident,
  type FounderState, type FounderPathState,
} from './founders';
import {
  HUT_CENTRE, HUT_APPROACH, HUT_SITES, HUT_KIND, HUT_WOOD_PER_STEP,
  HUT_TICKS_PER_STEP, canBuild, spendBuildStepFromRegistry, finishConstruction,
  reconcileConstruction, reconcileExtraSites, hutPlacementExists, insideHutRect,
  hutSiteById, hutSiteIndexById, nearestUnfinishedSite, hasUnfinishedSite,
  type ConstructionState,
} from './construction';
import { readyFarmTiles, FARM_VILLAGER_RADIUS } from './farm';
import { growthFactorAt } from './livingWorld';
import { millGrainToMeals, campGrainInRegistry, FARM_FOOD_THRESHOLD } from './food';
import { advanceClock } from './worldclock';
import { chooseScoredActivity, founderDistToSite } from './utility';
import { closestFounder, recordSharedEvent, restTileFor } from './memory';
import { getSimSpeed, founderStepsForSpeed, clockMinutesPerSecond } from './controlCenter';
import {
  discoverJobs, claimJob, claimNearestJob, claimDeliverJobFor, releaseJob,
  completeJob, failJob, jobForFounder, scorerTreeDist, buildJobClaimedBy,
  buildJobIdFor, type JobBoard,
} from './jobs';
import { arrivalCheck, RESIDENT_ENTRY_TILE } from './settlementGrowth';
import { addPlacement, validatePlacement } from './placements';
import type { ResourceRegistry } from './resourceRegistry';

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
      while(minutes>=1440){minutes-=1440;day+=1;}
      clockRef.current={minutes,day};saveClock(clockRef.current);setClockUi(clockRef.current);
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
      const hutDone=!hasUnfinishedSite(constructionRef.current);
      // BUILD 1065 (J-1): rebuild the job board from the world —
      // chop jobs for the trees in radius, the build job while the
      // hut is unfinished, deliver jobs for carrying founders.
      // Jobs whose target is gone are removed (open) or failed
      // (claimed — the holder re-targets below).
      jobBoardRef.current=discoverJobs(jobBoardRef.current,{world,construction:constructionRef.current,founders,nowAbs,growthFactorAt:(tx:number,ty:number)=>growthFactorAt(world,clock.day,tx,ty)});
      // BUILD 1069: the ready farm tiles this tick — computed once
      // (the scan is over placed farm tiles only, a handful) and
      // fed to every founder's scorer, so food drives work.
      const readyFarmCount=readyFarmTiles(world,FOUNDER_CAMP.x,FOUNDER_CAMP.y,nowAbs,FARM_VILLAGER_RADIUS,(tx:number,ty:number)=>growthFactorAt(world,clock.day,tx,ty)).length;
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
          if(f.workState==='toSite'||f.workState==='building'||f.workState==='chopping'){f.workState='toTree';f.buildTicks=0;f.chopTicks=0;f.treeTarget=null;f.workTile=null;}
      else if(f.workState==='toFarm'||f.workState==='harvesting'){f.workState='toTree';f.harvestTicks=0;f.farmTarget=null;}
          else if(f.workState==='toTree'){f.treeTarget=null;f.workTile=null;}
          if(f.workState==='toStockpile'&&(f.carrying>0||f.carryingGrain>0)){
            const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carrying+f.carryingGrain,nowAbs);
            jobBoardRef.current=dc.board;
            if(dc.job)myJob=dc.job;
          }
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
        const buildSite=nearestUnfinishedSite(constructionRef.current,f);
        const builderTaken=(()=>{const b=buildSite?buildJobClaimedBy(jobBoardRef.current,buildSite.id):null;return b!==null&&b!==f.id;})();
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
          const decision=chooseScoredActivity({needs:f.needs,minutes:clock.minutes,foodStock:campFoodInRegistry(registryRef.current),stockpileWood:campWoodInRegistry(registryRef.current),construction:constructionRef.current,nearestTreeDist:scorerTreeDist(jobBoardRef.current,f.id,FOUNDER_CAMP.x,FOUNDER_CAMP.y,FOUNDER_WORK_RADIUS),distToSite:founderDistToSite({x:Math.round(f.x),y:Math.round(f.y)},constructionRef.current),builderTaken,currentJob,closestAffinity:tClosest?tClosest.affinity:50,companionAtCamp:tCompanionAtCamp,readyFarmTiles:readyFarmCount});
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
        if((f.workState==='toSite'||f.workState==='building')&&f.activity!=='build'){
          const keepSite=f.activity==='work'&&canBuild(constructionRef.current,campWoodInRegistry(registryRef.current));
          if(!keepSite){
            // BUILD 1065 (J-1): leaving the site releases the build
            // job — another founder can take it when wood is
            // available, instead of the site sitting reserved.
            if(myJob&&myJob.kind==='build'){jobBoardRef.current=releaseJob(jobBoardRef.current,myJob.id);myJob=undefined;}
            f.workState='toTree';f.buildTicks=0;f.treeTarget=null;f.workTile=null;
          }
        }
        // Eat: at the eat tile, one meal from the shared camp stock.
        // BUILD 1064 (R-1): the meal is withdrawn from the
        // registry's camp store — only a whole meal taken restores
        // hunger, and the pile drops by exactly that meal.
        // BUILD 1079 (0x0E): only eat when actually hungry. Without
        // the hunger guard a founder with nothing to do idles in 'eat'
        // (the scorer picks it at epsilon when all scores are ~0) and
        // consumes a meal EVERY tick at hunger 93-100, draining the
        // camp food to 0. Legitimate eating (hunger < 50) is untouched.
        if(f.activity==='eat'&&f.needs.hunger<90&&Math.round(f.x)===FOUNDER_EAT_TILE.x&&Math.round(f.y)===FOUNDER_EAT_TILE.y){
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
        let insideHut=hutPlaced&&insideHutRect(Math.round(f.x),Math.round(f.y));
        if(insideHut&&f.activity!=='sleep'){
          const exitApproach=HUT_SITES[f.bed.hut]?.approach??HUT_APPROACH;f.x=exitApproach.x;f.y=exitApproach.y;founderPath.delete(f.name);
          insideHut=false;
        }
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
          if(!hutDone&&!builderTaken&&canBuild(constructionRef.current,campWoodInRegistry(registryRef.current))&&buildSite){
            const bc=claimJob(jobBoardRef.current,f.id,buildJobIdFor(buildSite.id));
            jobBoardRef.current=bc.board;
            if(bc.job){f.workState='toSite';myJob=bc.job;}
          }
          // BUILD 1067: farming — a 'work' founder farms while the
          // camp is short of food (below FARM_FOOD_THRESHOLD) and a
          // ready farm tile is open. The build job still comes
          // first (the settlement's project); the harvest is the
          // 'work' choice when food is low, chopping when it is not.
          if(f.workState==='toTree'&&!f.treeTarget&&f.activity==='work'&&campFoodInRegistry(registryRef.current)<FARM_FOOD_THRESHOLD){
            const hc=claimNearestJob(jobBoardRef.current,f.id,'harvest',FOUNDER_CAMP.x,FOUNDER_CAMP.y,FARM_VILLAGER_RADIUS);
            jobBoardRef.current=hc.board;
            if(hc.job){f.workState='toFarm';f.farmTarget={x:hc.job.tile.x,y:hc.job.tile.y};myJob=hc.job;}
          }
          if(f.workState==='toTree'&&!f.treeTarget){
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
        if(myJob&&myJob.kind==='build')dest=myJob.tile;
        else if(myJob&&myJob.kind==='harvest'&&(f.activity==='work'||f.activity==='build'))dest=myJob.tile;
        else if(f.activity==='sleep'&&hutPlaced)dest=(HUT_SITES[f.bed.hut]?.approach??HUT_APPROACH);
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
          if(f.workState==='toStockpile'&&(f.carrying>0||f.carryingGrain>0)){
            // BUILD 1065 (J-1): the delivery runs only on a held
            // deliver job — the transfer IS the job's completion.
            // Without the job (claimed next tick) the founder
            // waits at camp; the wood never moves without a job.
            if(myJob&&myJob.kind==='deliver'){
              // BUILD 1064 (R-1): the delivery is a real transfer
              // (carrier store → camp store) — the wood the tree
              // held is the wood the pile gains, conserved.
              // BUILD 1067: the delivery moves wood AND grain.
              const res=deliverFounderCarryToRegistry(registryRef.current,f);
              registryRef.current=res.registry;
              f.carrying-=res.movedWood;f.carryingGrain-=res.movedGrain;stockChanged=true;
              if(f.carrying<=0&&f.carryingGrain<=0){
                f.carrying=0;f.carryingGrain=0;f.workState='toTree';
                jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;
                const what=res.movedWood>0&&res.movedGrain>0?'wood and grain':res.movedGrain>0?'grain':'wood';
                setMessage(f.name+' delivered '+what+' to the camp stockpile');
              }
            }
          }else if(f.workState==='toStockpile'){
            f.workState='toTree';
          }else if(f.activity==='sleep'&&hutPlaced&&!insideHut){
            // Through the door to their bed (their hut sleep tile —
            // the north row, door lane kept clear).
            const bed=f.bed;
            f.x=bed.x;f.y=bed.y;founderPath.delete(f.name);
          }else if(f.activity==='work'||f.activity==='build'){
            if(f.workState==='arriving'){
              // BUILD 1066: a newcomer reached camp on foot — they
              // join the workforce (the scorer picks their next job
              // next tick). No teleport: they walked in from the
              // east edge.
              f.workState='toTree';
              founderPath.delete(f.name);
            }else if(f.workState==='toSite'){
              // At the approach tile: start building.
              f.workState='building';f.buildTicks=0;
            }else if(f.workState==='building'){
              f.buildTicks++;
              if(f.buildTicks>=HUT_TICKS_PER_STEP){
                f.buildTicks=0;
                // BUILD 1064 (R-1): the step's wood is withdrawn
                // from the registry's camp store — 2 wood leaves
                // the pile only when the step completes.
                if(campWoodInRegistry(registryRef.current)>=HUT_WOOD_PER_STEP){
                  const jobSite=hutSiteById(myJob&&myJob.kind==='build'?myJob.targetId:'');
                  const jobSiteIndex=jobSite?hutSiteIndexById(jobSite.id):-1;
                  const res=spendBuildStepFromRegistry(registryRef.current,constructionRef.current,jobSiteIndex>=0?jobSiteIndex:undefined);
                  registryRef.current=res.registry;
                  constructionRef.current=res.construction;
                  stockChanged=true;hutChanged=true;
                  // BUILD 1060: a shared build step — the builder
                  // plus every founder chopping for the hut (activity
                  // work/build) built it together. The step is a
                  // discrete moment, so it records once.
                  for(const o of founders){if(o!==f&&(o.activity==='work'||o.activity==='build')){f.social=recordSharedEvent(f.social,o.name,'build',clock.day,nowAbs);o.social=recordSharedEvent(o.social,f.name,'build',clock.day,nowAbs);}}
                  if(res.completed){
                    // Stamp the hut through the same placement path
                    // the player uses. The rect may be occupied this
                    // tick (a founder crossing it) — then the builder
                    // waits at the site and retries next cycle; the
                    // progress is banked, no wood is spent twice.
                    const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
                    const npcTiles=founders.map(o=>({x:Math.round(o.x),y:Math.round(o.y)}));
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
                    }else if(res.spent){
                      setMessage('The hut is ready — waiting for a clear spot');
                    }
                  }
                }else{
                  // Pile ran dry mid-build: back to chopping — and
                  // the site is released (BUILD 1065), so another
                  // founder can take it when wood returns.
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
                  if(myJob&&myJob.kind==='chop'){jobBoardRef.current=completeJob(jobBoardRef.current,myJob.id);myJob=undefined;}
                  const dc=claimDeliverJobFor(jobBoardRef.current,f.id,f.carrying,nowAbs);
                  jobBoardRef.current=dc.board;
                  if(dc.job)myJob=dc.job;
                }else if(myJob&&myJob.kind==='chop'){
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
            }
          }
          // Sleep/rest at camp need no arrival action — the needs
          // decay already applied the sleep/rest gains this tick.
        }
        // Idle (no tree in range) retries next tick.
        if((f.activity==='work'||f.activity==='build')&&f.workState==='idle')f.workState='toTree';
      }
      // BUILD 1067: the mill — while the camp is short of food and
      // holds grain, mill grain into meals (2 grain → 1 meal, a
      // production step through the registry). The grain the
      // founders harvested becomes the meals they eat.
      const milled=millGrainToMeals(registryRef.current);
      if(milled.milled>0){registryRef.current=milled.registry;stockChanged=true;}
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
      saveFoundersSave(foundersSaveOf(foundersRef.current,campWoodInRegistry(registryRef.current),campFoodInRegistry(registryRef.current),campGrainInRegistry(registryRef.current),constructionRef.current));
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
        jobBoardRef.current=discoverJobs(jobBoardRef.current,{world:world,construction:constructionRef.current,founders:foundersRef.current,nowAbs,growthFactorAt:(tx:number,ty:number)=>growthFactorAt(world,clockRef.current.day,tx,ty)});
        // BUILD 1069: the ready farm tiles this wait step — the
        // same feed as the real-time tick, so a wait never
        // re-chooses by a different rule.
        const wReadyFarm=readyFarmTiles(world,FOUNDER_CAMP.x,FOUNDER_CAMP.y,nowAbs,FARM_VILLAGER_RADIUS,(tx:number,ty:number)=>growthFactorAt(world,clockRef.current.day,tx,ty)).length;
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
            stockpileWood:campWoodInRegistry(registryRef.current),
            construction:constructionRef.current,
            // BUILD 1065 (J-1): the SAME board feed as the
            // real-time tick (scorerTreeDist) — a wait never
            // re-chooses by a different rule. The held job (if
            // any) names the current work; a founder holding
            // nothing has no current job.
            nearestTreeDist:scorerTreeDist(jobBoardRef.current,wf.id,FOUNDER_CAMP.x,FOUNDER_CAMP.y,FOUNDER_WORK_RADIUS),
            distToSite:founderDistToSite({x:Math.round(wf.x),y:Math.round(wf.y)},constructionRef.current),
            builderTaken:(()=>{const b=buildJobClaimedBy(jobBoardRef.current);return b!==null&&b!==wf.id;})(),
            currentJob:(()=>{const j=jobForFounder(jobBoardRef.current,wf.id);return j?(j.kind==='build'?'build':'chop'):null;})(),
            closestAffinity:wClosest?wClosest.affinity:50,
            companionAtCamp:wCompanionAtCamp,
            readyFarmTiles:wReadyFarm,
          });
        }
        // BUILD 1058: construction does NOT advance during a wait
        // (positions, chopping, deliveries, and building all pause);
        // the saved construction rides along unchanged.
        // BUILD 1064 (R-1): the founders save is written back from
        // the registry (the camp store's numbers), not from the
        // plain refs — the registry is the authority, the save is
        // its serialization (v4 shape preserved).
        saveFoundersSave(foundersSaveOf(foundersRef.current,campWoodInRegistry(registryRef.current),campFoodInRegistry(registryRef.current),campGrainInRegistry(registryRef.current),constructionRef.current));
      }
}
