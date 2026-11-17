// worldSync3d.ts — NEURON HEX 0x0D area 8: the world synchronization
// layer, extracted verbatim from Engine3DWorldView.tsx (BUILD 1078).
// The one canonical "persist the world + mark it for rebuild" primitive
// (commitWorld), the rebuild-flag setter (markWorldDirty), the initial
// world load (loadInitialWorld), and the living-world coordinator sync
// (syncLivingWorld). The refs themselves (stateRef, needsWorldRebuild)
// stay declared in the view — they are passed by reference into the
// renderer and the other extracted modules; what moved here is the
// logic that operates on them. No gameplay, visual, or balance change.
import type { MutableRefObject } from 'react';
import { loadWorld, saveWorld, type IsoWorld, type PlacedItem } from '../iso/isoWorld';
import { seedCampFarmPlot } from './farm';
import { stampMineralDeposits } from './geology';
import { stampRivers } from './rivers';
import { seedWell } from './paths';
import { stampLandforms } from './landforms';
import { applyMaturedTrees, stampAnimalPopulations } from './ecosystems';
import { FOUNDER_CAMP, FOUNDERS_ENABLED, type FounderState } from './founders';
import { CAMP_SETTLEMENT_ID, advanceLivingWorldDay, saveLivingWorldState, type LivingWorld3DState } from './livingWorld';
import { seasonArrivalMessage, seasonForDay } from './climate';
import { CAMP_STORE_ID, addDeposit, treeDeposit, registryToSettlementStorage, syncCampStoreFromSettlement, type ResourceRegistry } from './resourceRegistry';
import type { DayClock } from './townsfolk3d';

export interface WorldSyncContext {
  needsWorldRebuild: MutableRefObject<boolean>;
  setPlacedCount: (n: number) => void;
}

// The canonical persist + mark-dirty + placed-count primitive: every
// world mutation in the view goes through this (it replaces the
// saveWorld(world); needsWorldRebuild.current=true;
// setPlacedCount(...) triple that used to be inlined at ~20 call
// sites). The count update is always safe: sites that do not change
// placements set the same value the count already holds.
export function commitWorld(ctx: WorldSyncContext, world: IsoWorld): void {
  saveWorld(world);
  ctx.needsWorldRebuild.current = true;
  ctx.setPlacedCount(world.placements?.length ?? 0);
}

// Mark the world dirty (rebuild on the next frame) without saving —
// for position-only changes (car enter/exit, D-pad move, the setPlayer
// test hook, the remove-stroke preview).
export function markWorldDirty(ctx: WorldSyncContext): void {
  ctx.needsWorldRebuild.current = true;
}

// The initial world load (the mount effect's world setup): load, stamp
// the Mosslight town layout, ensure a placements array, seed the camp
// farm plot (BUILD 1067 — idempotent; the world is saved when tiles
// land, so the plot survives reload), and return the world with
// placements guaranteed present.
export function loadInitialWorld(
  layout: (w: IsoWorld) => IsoWorld,
  nowAbsMinutes: number,
  walkable: (w: IsoWorld, x: number, y: number) => boolean,
): IsoWorld & { placements: PlacedItem[] } {
  const world = layout(loadWorld());
  if (!world.placements) world.placements = [];
  // BUILD 1067: the camp's farm plot — seed the 4 farm tiles
  // south-west of the camp (planted now) when no farm land exists
  // near it, so a fresh world can feed itself. Idempotent (the
  // seed checks for existing farm land first); the world is saved
  // when tiles land, so the plot survives reload.
  if (seedCampFarmPlot(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, nowAbsMinutes, (x, y) => walkable(world, x, y)) > 0) saveWorld(world);
  // BUILD 1081 (1.2): stamp the mineral deposit map on a world
  // that has none (the stamp never re-derives a stamped world, so
  // a mined-out deposit stays mined-out). The layout is already
  // applied by the time this runs, so the camp/hut/path exclusions
  // see the real world.
  if (stampMineralDeposits(world)) saveWorld(world);
  // BUILD 1082 (1.3): stamp the river map on a world that has none
  // (the stamp never re-derives a stamped world, so a river never
  // moves or vanishes on reload). After the deposits stamp, so the
  // river routing sees the real deposit tiles and routes around them.
  if (stampRivers(world)) saveWorld(world);
  // BUILD 1088 (2.3): seed the camp well (the 'well' placement, 3
  // tiles west of camp on the camp row) — idempotent (the seed
  // checks for an existing well first); the world is saved when it
  // lands, so the well survives reload. After the rivers stamp, so
  // the well's tile is chosen on the real world (never on a river).
  if (seedWell(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, (x, y) => walkable(world, x, y))) saveWorld(world);
  // BUILD 1083 (1.4): stamp the landform map on a world that has
  // none (the stamp never re-derives a stamped world, so a mountain
  // never moves or vanishes on reload). After the rivers stamp, so
  // the band routing sees the real river tiles and flows around
  // them (the rivers cut gorges through the range).
  if (stampLandforms(world)) saveWorld(world);
  // BUILD 1085 (1.6): stamp the animal populations on a world that
  // has none (the stamp never re-derives a stamped world, so the
  // counts persist across reloads). After the landforms stamp, so
  // the forest density the populations read is the real one.
  if (stampAnimalPopulations(world)) saveWorld(world);
  return world as IsoWorld & { placements: PlacedItem[] };
}

export interface LivingWorldSyncContext {
  livingWorld: MutableRefObject<LivingWorld3DState | null>;
  registry: MutableRefObject<ResourceRegistry>;
  founders: MutableRefObject<FounderState[]>;
  clock: MutableRefObject<DayClock>;
  needsWorldRebuild: MutableRefObject<boolean>;
  refreshResourceUi: () => void;
  setMessage: (m: string) => void;
}

// BUILD 1062: advance the living world to the clock's day — called
// from the 1s clock timer and the wait step, the two places the
// clock moves. Idempotent (same-day calls are no-ops), so both
// callers can never double-advance a day. Plants any regrown trees
// into the world (saved + rebuilt, like a chop), persists the
// adapter state, refreshes the Camp line, and reports a coordinator
// event once when one fires. Returns true when anything changed.
export function syncLivingWorld(ctx: LivingWorldSyncContext, world: IsoWorld): boolean {
  if(!FOUNDERS_ENABLED||!ctx.livingWorld.current)return false;
  // BUILD 1064 (R-1): the camp settlement's storage is a MIRROR
  // of the registry's camp store, not a second pile — sync the
  // real numbers in before advancing, so the coordinator sees the
  // pile the founders actually filled.
  const campSettlement=ctx.livingWorld.current.livingWorld.civilization.settlements.find(s=>s.id===CAMP_SETTLEMENT_ID);
  if(campSettlement)registryToSettlementStorage(ctx.registry.current,campSettlement,CAMP_STORE_ID);
  const res=advanceLivingWorldDay({state:ctx.livingWorld.current,clock:ctx.clock.current,founders:ctx.founders.current,world});
  if(res.advancedDays===0&&res.planted.length===0)return false;
  ctx.livingWorld.current=res.state;
  // BUILD 1085 (1.6): the ecosystem advance rides on the world save —
  // saplings, populations and kills persist; a matured sapling becomes
  // a real tree (with a registry deposit, like a regrown tree), so the
  // founders can chop it and the player can too.
  world.saplings=res.saplings;world.animalPopulations=res.populations;world.animalKills=res.kills;
  if(res.matured.length>0){applyMaturedTrees(world,res.matured);for(const t of res.matured)ctx.registry.current=addDeposit(ctx.registry.current,treeDeposit(t.x,t.y));}
  if(res.planted.length>0){
    world.trees=[...world.trees,...res.planted];
    // BUILD 1064: a regrown tree is a new deposit (2 wood, chop).
    for(const t of res.planted)ctx.registry.current=addDeposit(ctx.registry.current,treeDeposit(t.tx,t.ty));
  }
  // The world changed on this advance (saplings grew, populations
  // moved, trees may have planted/matured) — save it, and rebuild
  // when a tree appeared.
  saveWorld(world);
  if(res.planted.length>0||res.matured.length>0)ctx.needsWorldRebuild.current=true;
  // BUILD 1064: any coordinator change to the camp settlement's
  // storage lands back in the registry's camp store (the reverse
  // sync — the coordinator's production/consumption for the camp
  // is zero today, so this is a no-op until it is not).
  const campAfter=ctx.livingWorld.current.livingWorld.civilization.settlements.find(s=>s.id===CAMP_SETTLEMENT_ID);
  if(campAfter)ctx.registry.current=syncCampStoreFromSettlement(ctx.registry.current,campAfter);
  saveLivingWorldState(res.state);
  ctx.refreshResourceUi();
  if(res.events.length>0)ctx.setMessage(res.events[res.events.length-1].description);
  // BUILD 1084 (1.5): a season change is announced once, when the
  // day boundary crosses it — it wins over a coordinator event
  // (a season turns every 90 days; the event is rarer). The
  // previous day must be a real played day (>= 1): a fresh world's
  // first sync advances from lastAdvancedDay 0, and day 0 is not
  // a season the player ever saw (it would announce "Spring has
  // arrived" at every fresh boot).
  if(res.advancedDays>0){const prevDay=ctx.clock.current.day-res.advancedDays;const prevSeason=seasonForDay(prevDay);const nowSeason=seasonForDay(ctx.clock.current.day);if(prevDay>=1&&prevSeason!==nowSeason)ctx.setMessage(seasonArrivalMessage(nowSeason));}
  return true;
}
