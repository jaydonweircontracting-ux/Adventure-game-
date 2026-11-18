/**
 * BUILD 1065 — J-1 job scheduler: the third foundation (§62.3).
 *
 * AUDIT (traced before any code — what "work" was before this
 * build): there was no job. The 1059 utility scorer picked an
 * activity (work/build/eat/rest/sleep) and the 900ms tick executed
 * it straight from the founder's work state: a founder whose
 * activity was 'work' called nearestTreeTile and walked to whatever
 * tree was nearest, and a founder whose activity was 'build' took
 * the site when the pile held wood. Nothing recorded the work
 * itself — no identity, no claim, no completion. Two founders
 * could target the SAME tree (nearestTreeTile is per-founder, with
 * only a private skipped set): the first felled it, the second
 * chopped for 3 ticks, found the tree gone, and walked home empty.
 * Nothing stopped a founder from "working" when every tree in
 * range was already taken. The scorer scored work from the world's
 * nearest tree, not from the work still available. And the
 * registry (R-1) had a nearestDeposit helper whose doc said, in so
 * many words, "The scheduler (J-1) asks this".
 *
 * THE SCHEDULER sits between the scorer and the executor. The
 * scorer still picks the ACTIVITY (untouched — J-1 builds on it,
 * it does not duplicate it); the scheduler turns the activity
 * into a concrete JOB, and the tick executes the claimed job:
 *
 *   discover → claim → execute → complete / fail / release
 *
 * - DISCOVER: the board is rebuilt from the world every tick. A
 *   chop job exists for every tree in work radius WITH a walkable
 *   work tile (a tree nobody can stand beside is not work — the
 *   old per-founder skipped set is replaced by this board-level
 *   fact). A build job exists while the hut is unfinished. A
 *   deliver job exists for every founder carrying wood. A job
 *   whose target is gone is removed (open) or failed (claimed —
 *   the holder's tree was felled by the player first).
 * - CLAIM: one founder per job, exclusive. A claimed job is
 *   invisible to every other founder's discovery and to their
 *   scorer (the scorer's nearest-tree distance is the nearest OPEN
 *   chop job — a founder scores work 0 when every tree in range
 *   is claimed, and keeps scoring their own claimed tree while
 *   they hold it). A claim is released when the founder leaves
 *   the work (activity flip, pile dry mid-build), so the site and
 *   the tree go back on the board instead of sitting reserved.
 * - EXECUTE: the tick's work-state machine is the executor, and
 *   it runs ONLY on a held job — treeTarget is set only by
 *   claiming a chop job, the site is entered only by claiming the
 *   build job, the delivery transfer runs only on a held deliver
 *   job. No NPC works without an actual job.
 * - COMPLETE / FAIL: a chop job completes when the tree is felled
 *   (the yield is in the carrier); a deliver job completes when
 *   the carrier empties into the camp store; the build job
 *   completes when the hut is done. Every completion is a registry
 *   transfer that already happened (fellTreeToCarrier,
 *   deliverFounderWoodToRegistry, spendBuildStepFromRegistry) —
 *   the scheduler routes the existing paths through jobs, it does
 *   not add new ones.
 *
 * JOB KINDS (the work that exists today):
 * - chop: one tree → the founder's carrier. Completes on the
 *   fell. The delivery is NOT part of this job — it is a deliver
 *   job, because the carrier's wood must survive a reload as
 *   work: a founder saved mid-carry re-claims a deliver job on
 *   the first tick, and a chop job whose tree is gone cannot
 *   carry a delivery that has no tree.
 * - deliver: one founder's carried wood → the camp store.
 *   Discovered from the carrier (carrying > 0), claimed by that
 *   founder alone (the id carries their founder id — no other
 *   founder can ever claim another's carry), completes when the
 *   carrier empties. The transport leg is a job with a claim, a
 *   completion, and a conserving registry transfer.
 * - build: a hut site, one job per unfinished site (BUILD 1066 —
 *   two sites, two jobs, one builder each). Progress lives in the
 *   construction state — banked across claims, so a builder who
 *   leaves and another who takes over continue the same job. One
 *   builder at a time per site: the claim is the site.
 *   A standalone haul job (store → store, contested claim) is
 *   the 0x0E extension point, not this build: the carrier is
 *   single-owner, so a deliver claim can never be contested.
 * - harvest (BUILD 1067, 0x07): one ready farm tile → the
 *   founder's carrier (2 grain). Completes on the harvest (the
 *   grain is in the carrier); the delivery is a deliver job, like
 *   chop's — the carrier's grain must survive a reload as work.
 *   A harvest job whose tile is no longer ready (harvested by the
 *   player or another founder first) is removed (open) or failed
 *   (claimed — 'target-gone').
 *
 * IDENTITY: a job's id is derived from its kind + target
 * (entityIds.ts jobIdFor — "job:chop:tree:122,122",
 * "job:build:hut-site", "job:deliver:founder-Marlow"), never
 * stored. The board is SESSION-ONLY (like treeTarget/workState/
 * path): it is rebuilt from the world on load, claims are
 * re-established when founders re-target, and NO save version
 * moves in this build — the founders save stays v4, so the
 * parked Tamsin stash's v4 claim is untouched and still rebases
 * to v5 on its own resume. A regrown tree on a new tile is a
 * NEW job (regrowth never re-plants a chopped tile, the 987/989
 * rule), so a job id is never re-issued to different work.
 *
 * Pure module (no React, no WebGL, no localStorage) so the sim
 * and the standalone asserts can import it directly.
 */

import { FOUNDER_CAMP, FOUNDER_CAMP_CENTRE, FOUNDER_WORK_RADIUS, treeWorkTile, treesInRadius } from './founders';
import { STOREHOUSE_APPROACH, STOREHOUSE_SITE_ID, STOREHOUSE_START_DAY, type StorehouseState } from './storehouse';
import { stoneDepositsInRadius, rocksInRadius, quarryWorkTile, quarryTargetIdFor } from './quarry';
import { HUT_SITES, sitesOf } from './construction';
import { jobIdFor, treeId, wildTreeId, farmTileId } from './entityIds';
import { FARM_VILLAGER_RADIUS, readyFarmTiles, waterableFarmTiles } from './farm';
import { GRANARY_CAPACITY_FLOUR, plantableFarmTiles } from './granary';
import { npcWalkable } from './townsfolk3d';
import { WELL_START_DAY, type BridgeSite } from './paths';
import { lumberTreesInRect, openMineSite, type MineState } from './mines';
import { BAKERY_APPROACH, BAKERY_SITE_ID, BAKE_FLOUR_PER_MEAL, BAKE_FOOD_THRESHOLD, GRIND_GRAIN_PER_BATCH, MILL_APPROACH, MILL_SITE_ID, isBakeryUsable, isMillUsable, type FoodChainState } from './foodChain';
import type { ConstructionState } from './construction';
import type { IsoWorld } from '../iso/isoWorld';

/** The kinds of work the scheduler knows. */
export type JobKind = 'chop' | 'build' | 'deliver' | 'harvest' | 'quarry' | 'water' | 'mine' | 'lumber' | 'plant' | 'mill' | 'bake';

/** A job's lifecycle: open → claimed → done | failed. */
export type JobState = 'open' | 'claimed' | 'done' | 'failed';

/** One unit of work: a kind, a target, a tile, a state, a claim. */
export type Job = {
  /** Derived id (entityIds.ts jobIdFor) — kind + target. */
  id: string;
  kind: JobKind;
  /** What the job works on: a tree id, 'hut-site', a founder id. */
  targetId: string;
  /** The tile the work happens on (the tree, the site approach,
   *  the camp centre for a delivery). */
  tile: { x: number; y: number };
  state: JobState;
  /** The founder holding the claim, or null when open. */
  claimedBy: string | null;
  /** Absolute game minutes when the job was discovered. */
  createdAbs: number;
};

/** The board: the live jobs, keyed by id, plus the counters the
 *  E report and the probe read (completed/failed are totals for
 *  the session — the board itself holds only live jobs; a done or
 *  failed job leaves the board, so it never grows without bound,
 *  and the last-ended ids are the observable record of what just
 *  happened). */
export type JobBoard = {
  jobs: Record<string, Job>;
  /** Jobs completed this session. */
  completed: number;
  /** Jobs failed this session. */
  failed: number;
  /** The last job completed (its id), or null when none yet. */
  lastCompletedId: string | null;
  /** The last job failed (its id), or null when none yet. */
  lastFailedId: string | null;
  /** Why the last job failed ('target-gone'), or null. */
  lastFailedReason: string | null;
  /** Quarry targetIds that failed with 'no-path' this session (a rock
   *  across a river — walkable work tile, no path from camp). Discovery
   *  never recreates them, so the expensive failed A* is paid once per
   *  session, not once per claim attempt (BUILD 1087). Session-only. */
  blockedQuarry?: string[];
};

/** The build job's target for the FIRST hut site (the 1058 hut).
 *  BUILD 1066: build jobs are per-site — one job per unfinished
 *  hut site, so two builders can work two sites in parallel (one
 *  builder per site: each site has one work tile, its approach).
 *  The job's targetId is the site id ('hut-site-0' / 'hut-site-1')
 *  and its tile is the site's approach. */
export const HUT_SITE_TARGET_ID = 'hut-site-0';
/** The build job's id for the first hut site. */
export const HUT_SITE_JOB_ID = jobIdFor('build', HUT_SITE_TARGET_ID);
/** The build job's id for a hut site. */
export function buildJobIdFor(siteId: string): string {
  return jobIdFor('build', siteId);
}

/** An empty board (no jobs — discovery fills it from the world). */
export function createJobBoard(): JobBoard {
  return { jobs: {}, completed: 0, failed: 0, lastCompletedId: null, lastFailedId: null, lastFailedReason: null };
}

function copyBoard(board: JobBoard): JobBoard {
  return { jobs: { ...board.jobs }, completed: board.completed, failed: board.failed, lastCompletedId: board.lastCompletedId, lastFailedId: board.lastFailedId, lastFailedReason: board.lastFailedReason, blockedQuarry: board.blockedQuarry ? [...board.blockedQuarry] : undefined };
}

/** Mark a quarry target as unreachable this session (its claim failed
 *  with 'no-path'). Discovery skips it from now on — the rock stays
 *  in the world, but no founder re-runs the failed A* for it. Pure. */
export function blockQuarryTarget(board: JobBoard, targetId: string): JobBoard {
  const blocked = board.blockedQuarry ? [...board.blockedQuarry] : [];
  if (!blocked.includes(targetId)) blocked.push(targetId);
  return { ...copyBoard(board), blockedQuarry: blocked };
}

/** The target id for a tree at (tx, ty): stored trees by their
 *  tile, wild (out-of-map) trees by their wild id. */
export function treeTargetId(world: IsoWorld, tx: number, ty: number): string {
  const outOfMap = tx < 0 || ty < 0 || tx >= world.w || ty >= world.h;
  return outOfMap ? wildTreeId(tx, ty) : treeId(tx, ty);
}

/** The job id for a tree at (tx, ty). */
export function chopJobIdFor(world: IsoWorld, tx: number, ty: number): string {
  return jobIdFor('chop', treeTargetId(world, tx, ty));
}

/** The job id for a founder's delivery (their carrier → camp). */
export function deliverJobIdFor(founderId: string): string {
  return jobIdFor('deliver', founderId);
}

/** The job id for a farm tile at (tx, ty). */
export function harvestJobIdFor(tx: number, ty: number): string {
  return jobIdFor('harvest', farmTileId(tx, ty));
}

/** The job id for watering the farm tile at (tx, ty). */
export function waterJobIdFor(tx: number, ty: number): string {
  return jobIdFor('water', farmTileId(tx, ty));
}

/** The job id for planting a farm tile at (tx, ty). */
export function plantJobIdFor(tx: number, ty: number): string {
  return jobIdFor('plant', farmTileId(tx, ty));
}

/** The job id for a mine site (its deposit id). */
export function mineJobIdFor(depositId: string): string {
  return jobIdFor('mine', depositId);
}

/** The job id for the mill site (BUILD 1094 — one mill job). */
export function millJobIdFor(siteId: string): string {
  return jobIdFor('mill', siteId);
}

/** The job id for the bakery site (BUILD 1094 — one bake job). */
export function bakeJobIdFor(siteId: string): string {
  return jobIdFor('bake', siteId);
}

/** The job id for a lumber tree at (tx, ty). */
export function lumberJobIdFor(tx: number, ty: number): string {
  return jobIdFor('lumber', treeId(tx, ty));
}

/** What discovery needs: the world (trees), the construction
 *  (the hut), the founders' carried wood, and the clock (for
 *  createdAbs). The registry is NOT an input — a job's existence
 *  is a fact about the world, not about a store; whether a job
 *  is ACTIONABLE (the pile holds a step's wood) is the claim
 *  site's check (canBuild), not discovery's. */
export type JobDiscoveryInput = {
  world: IsoWorld;
  construction: ConstructionState;
  founders: readonly { id: string; carrying: number; carryingGrain?: number; carryingStone?: number; carryingBuild?: number; carryingOre?: number }[];
  nowAbs: number;
  /** BUILD 1087: the storehouse state + the settlement day — the
   *  storehouse build job exists only once the huts are done and
   *  the day is old enough (the housing-first rule). Absent means
   *  no storehouse data (the old callers) and no storehouse job,
   *  so old boards are unchanged. */
  storehouse?: StorehouseState;
  day?: number;
  /** BUILD 1087: the rock-discovery radius this tick — the widened
   *  storehouse radius while the storehouse needs stone. Absent
   *  means FOUNDER_WORK_RADIUS (the 1086 behaviour). Deposits stay
   *  at FOUNDER_WORK_RADIUS (ore mining is Phase 2.4). */
  quarryRadius?: number;
  /** BUILD 1088: the camp well + the settlement day — a water job
   *  exists only once the well stands and the day is old enough
   *  (WELL_START_DAY — the 24h window never sees one). Absent
   *  means no well data (the old callers) and no water job, so old
   *  boards are unchanged. */
  well?: { x: number; y: number } | null;
  /** BUILD 1088: the open bridge sites — one build job per
   *  unfinished site (the builder-placed bridge, through the
   *  construction path). Absent means no bridge data (the old
   *  callers) and no bridge job, so old boards are unchanged. */
  bridges?: BridgeSite[];
  /** BUILD 1089: the mine / quarry / lumber sites (mines.ts) — a
   *  mine job per open mine site, lumber jobs per tree in the
   *  lumber rect (the rect's trees are lumber jobs, NOT chop
   *  jobs, once the site is designated). Absent means no mines
   *  data (the old callers) and no mine/lumber jobs, so old
   *  boards are unchanged. */
  mines?: MineState;
  /** BUILD 1094: the food-chain state + the granary numbers — a
   *  mill job exists only once the mill is done and there is
   *  grain to grind (and room in the flour store); a bake job
   *  only once the bakery is done and there is flour to bake
   *  (and the camp is short of food). Absent means no food-chain
   *  data (the old callers) and no mill/bake jobs, so old boards
   *  are unchanged. */
  foodChain?: FoodChainState;
  granary?: { grain: number; flour: number; food: number };
  /** BUILD 1083 (1.4) + 1084 (1.5): the farm growth factor per
   *  tile, from the 1.1 adapter (livingWorld.growthFactorAt =
   *  soil × season) — harvest discovery reads the combined
   *  factor through it, never by importing landforms.ts or
   *  climate.ts. */
  growthFactorAt?: (tx: number, ty: number) => number;
  /** BUILD 1090 (2.5): the soil factor per tile, from the 1.1
   *  adapter (livingWorld.soilFactorAt = rich 1.5 / neutral 1.0 /
   *  poor 0.6) — plant discovery reads soil through it, never by
   *  importing landforms.ts. Absent means no soil data (the old
   *  callers) and no plant job, so old boards are unchanged. */
  soilFactorAt?: (tx: number, ty: number) => number;
};

/** The board id for a quarry job on a target (a deposit or a rock). */
export function quarryJobIdFor(targetId: string): string {
  return jobIdFor('quarry', targetId);
}

/**
 * Rebuild the board from the world: add jobs for work that exists
 * and is not yet on the board, remove jobs whose target is gone.
 * - chop: one job per tree in work radius WITH a walkable work
 *   tile (a tree nobody can stand beside is not work). The
 *   work-tile check runs only for NEW trees (the board already
 *   holds the rest), so discovery stays one tree scan per tick.
 * - build: one job while a hut / the storehouse / a bridge / the
 *   mill / the bakery is unfinished and startable; completing it
 *   when the building is done.
 * - harvest (BUILD 1067): one job per READY farm tile within the
 *   farmer radius of the camp; completing it when the tile is
 *   harvested (the grain is in the carrier).
 * - quarry (BUILD 1086): one job per live stone deposit + one per
 *   rock in work radius WITH a walkable work tile (a formation
 *   nobody can stand beside is not work). Completing it when the
 *   stone is in the carrier (the deposit depletes / the rock is
 *   consumed). A mined-out deposit leaves the board (open) or
 *   fails (claimed — 'target-gone').
 * - mill (BUILD 1094): one job while the mill is done and there
 *   is grain to grind (and room in the flour store) — the job's
 *   tile is the mill approach; completing it when the founder's
 *   3-tick shift ends (the shift grinds per tick). A claimed job
 *   whose grain ran out mid-shift is NOT failed (the founder
 *   finishes the shift); an open job whose grain ran out is
 *   removed silently.
 * - bake (BUILD 1094): one job while the bakery is done and there
 *   is flour to bake (and the camp is short of food) — same shape
 *   as the mill job, the bakery approach as the tile.
 * - deliver: one job per founder carrying wood; completing it
 *   when the carrier empties (the work is done — the wood is
 *   in the camp store). BUILD 1067: a founder carrying GRAIN
 *   (harvested wheat) also gets a deliver job — the carrier
 *   holds wood or grain, and the job completes when BOTH are
 *   empty. BUILD 1086: a founder carrying STONE (mined) also
 *   gets a deliver job — the carrier holds wood, grain, or
 *   stone, and the job completes when ALL are empty.
 * A claimed job whose target vanished FAILS (failedReason
 * 'target-gone', the failed counter rises) — the holder's tree
 * was felled by the player first, and the holder must re-target.
 * An open job whose target vanished is removed silently (nobody
 * was doing it). Idempotent: discovering twice changes nothing.
 * Pure.
 */
export function discoverJobs(board: JobBoard, input: JobDiscoveryInput): JobBoard {
  const { world, construction, founders, nowAbs } = input;
  let next = copyBoard(board);
  let changed = false;

  // --- Chop jobs: the trees in radius, by tile. ---
  // BUILD 1089: a tree inside the designated lumber rect is a
  // LUMBER job, not a chop job (the rect is the settlement's
  // planned wood source — one job per tree, never two). Before
  // the site is designated (day < 3) the rect's trees are chop
  // jobs as always, so the 24h window is untouched.
  const lumberRect = input.mines?.lumber && input.mines.lumber.state === 'open' ? input.mines.lumber.rect : null;
  const trees = treesInRadius(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, FOUNDER_WORK_RADIUS);
  const liveChopIds = new Set<string>();
  for (const t of trees) {
    if (lumberRect && t.tx >= lumberRect.x0 && t.tx <= lumberRect.x1 && t.ty >= lumberRect.y0 && t.ty <= lumberRect.y1) continue;
    const targetId = treeTargetId(world, t.tx, t.ty);
    const id = jobIdFor('chop', targetId);
    liveChopIds.add(id);
    if (next.jobs[id]) continue;
    // A tree with no walkable tile beside it is not work (the
    // old per-founder skipped set, now a board-level fact).
    if (!treeWorkTile(world, t.tx, t.ty)) continue;
    next.jobs[id] = {
      id,
      kind: 'chop',
      targetId,
      tile: { x: t.tx, y: t.ty },
      state: 'open',
      claimedBy: null,
      createdAbs: nowAbs,
    };
    changed = true;
  }
  for (const job of Object.values(next.jobs)) {
    if (job.kind !== 'chop' || liveChopIds.has(job.id)) continue;
    if (job.state === 'claimed') {
      next = failJob(next, job.id, 'target-gone');
    } else {
      delete next.jobs[job.id];
    }
    changed = true;
  }

  // --- Build jobs: one per unfinished hut site (BUILD 1066). A
  // site's job is created while the site is unfinished and
  // completes when the site is done — so two builders can work two
  // sites in parallel, one per site (each site has one work tile,
  // its approach). A claimed job whose site finished completes
  // (the work is done, the hut stands).
  const sites = sitesOf(construction);
  for (let i = 0; i < sites.length; i++) {
    const site = HUT_SITES[i];
    const id = buildJobIdFor(site.id);
    if (sites[i].state !== 'done') {
      if (!next.jobs[id]) {
        next.jobs[id] = {
          id,
          kind: 'build',
          targetId: site.id,
          tile: { ...site.approach },
          state: 'open',
          claimedBy: null,
          createdAbs: nowAbs,
        };
        changed = true;
      }
    } else if (next.jobs[id]) {
      next = completeJob(next, id);
      changed = true;
    }
  }

  // --- Storehouse build job: one job while the storehouse is
  // unfinished (BUILD 1087) — created only once the huts are all
  // done and the settlement day is old enough (the housing-first
  // rule: STOREHOUSE_START_DAY). Completing it when the
  // storehouse is done. A claimed job whose startability vanished
  // (a hut removed mid-build) fails — the holder re-targets to
  // the hut, and the storehouse waits for housing again.
  if (input.storehouse !== undefined && input.day !== undefined) {
    const sh = input.storehouse;
    const shId = buildJobIdFor(STOREHOUSE_SITE_ID);
    const shStartable = sites.every((s) => s.state === 'done') && input.day >= STOREHOUSE_START_DAY;
    if (sh.state !== 'done' && shStartable) {
      if (!next.jobs[shId]) {
        next.jobs[shId] = {
          id: shId,
          kind: 'build',
          targetId: STOREHOUSE_SITE_ID,
          tile: { ...STOREHOUSE_APPROACH },
          state: 'open',
          claimedBy: null,
          createdAbs: nowAbs,
        };
        changed = true;
      }
    } else if (next.jobs[shId]) {
      if (sh.state === 'done') {
        next = completeJob(next, shId);
      } else if (next.jobs[shId].state === 'claimed') {
        next = failJob(next, shId, 'not-startable');
      } else {
        delete next.jobs[shId];
      }
      changed = true;
    }
  }

  // --- Mill + bakery build jobs (BUILD 1094): one job per
  // food-chain building while it is unfinished and startable —
  // the mill once hut 0 is done and the first grain has landed
  // (the housing-first rule + something to mill), the bakery
  // once the mill is done (the bakery needs flour). The job's
  // tile is the building's approach; completing it when the
  // building is done. A claimed job whose startability vanished
  // (the grain ran out mid-build) fails — the holder re-targets
  // and the building waits for grain again. The wood gate lives
  // in the claim (canStartMill/canStartBakery check the camp
  // pile), not here: a job may exist while the pile is empty.
  if (input.foodChain !== undefined) {
    const fc1094 = input.foodChain;
    const millBuildId = buildJobIdFor(MILL_SITE_ID);
    const millBuildable = fc1094.mill.state !== 'done' && sites[0] !== undefined && sites[0].state === 'done' && input.granary !== undefined && input.granary.grain >= 1;
    if (millBuildable) {
      if (!next.jobs[millBuildId]) {
        next.jobs[millBuildId] = {
          id: millBuildId,
          kind: 'build',
          targetId: MILL_SITE_ID,
          tile: { ...MILL_APPROACH },
          state: 'open',
          claimedBy: null,
          createdAbs: nowAbs,
        };
        changed = true;
      }
    } else if (next.jobs[millBuildId]) {
      if (fc1094.mill.state === 'done') {
        next = completeJob(next, millBuildId);
      } else if (next.jobs[millBuildId].state === 'claimed') {
        next = failJob(next, millBuildId, 'not-startable');
      } else {
        delete next.jobs[millBuildId];
      }
      changed = true;
    }
    const bakeryBuildId = buildJobIdFor(BAKERY_SITE_ID);
    const bakeryBuildable = fc1094.bakery.state !== 'done' && fc1094.mill.state === 'done';
    if (bakeryBuildable) {
      if (!next.jobs[bakeryBuildId]) {
        next.jobs[bakeryBuildId] = {
          id: bakeryBuildId,
          kind: 'build',
          targetId: BAKERY_SITE_ID,
          tile: { ...BAKERY_APPROACH },
          state: 'open',
          claimedBy: null,
          createdAbs: nowAbs,
        };
        changed = true;
      }
    } else if (next.jobs[bakeryBuildId]) {
      if (fc1094.bakery.state === 'done') {
        next = completeJob(next, bakeryBuildId);
      } else if (next.jobs[bakeryBuildId].state === 'claimed') {
        next = failJob(next, bakeryBuildId, 'not-startable');
      } else {
        delete next.jobs[bakeryBuildId];
      }
      changed = true;
    }
  }

  // --- Bridge build jobs: one per unfinished bridge site (BUILD
  // 1088) — created while the site is unfinished and completing
  // when the site is done (the placement landed, finishBridge).
  // A claimed job whose site vanished (reconciled away) fails —
  // the holder re-targets. The day/housing gates live in the
  // site's creation (paths.ts detect/scan), not here: a site only
  // exists once the settlement is old enough.
  for (const site of input.bridges ?? []) {
    const id = buildJobIdFor(site.id);
    if (site.state !== 'done') {
      if (!next.jobs[id]) {
        next.jobs[id] = {
          id,
          kind: 'build',
          targetId: site.id,
          tile: { ...site.workTile },
          state: 'open',
          claimedBy: null,
          createdAbs: nowAbs,
        };
        changed = true;
      }
    } else if (next.jobs[id]) {
      next = completeJob(next, id);
      changed = true;
    }
  }
  for (const job of Object.values(next.jobs)) {
    if (job.kind !== 'build' || !job.targetId.startsWith('bridge-')) continue;
    if ((input.bridges ?? []).some((s) => s.id === job.targetId)) continue;
    if (job.state === 'claimed') {
      next = failJob(next, job.id, 'target-gone');
    } else {
      delete next.jobs[job.id];
    }
    changed = true;
  }

  // --- Harvest jobs: one per READY farm tile within the farmer
  // radius of the camp (BUILD 1067). A tile that is no longer
  // ready (harvested by the player or another founder first) is
  // removed (open) or failed (claimed — 'target-gone'). Farm tiles
  // are walk-through ground cover, so the tile itself is the work
  // tile — the founder stands on it to harvest.
  const ready = readyFarmTiles(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, nowAbs, FARM_VILLAGER_RADIUS, input.growthFactorAt);
  const liveHarvestIds = new Set<string>();
  for (const t of ready) {
    const id = harvestJobIdFor(t.tx, t.ty);
    liveHarvestIds.add(id);
    if (next.jobs[id]) continue;
    next.jobs[id] = {
      id,
      kind: 'harvest',
      targetId: farmTileId(t.tx, t.ty),
      tile: { x: t.tx, y: t.ty },
      state: 'open',
      claimedBy: null,
      createdAbs: nowAbs,
    };
    changed = true;
  }
  for (const job of Object.values(next.jobs)) {
    if (job.kind !== 'harvest' || liveHarvestIds.has(job.id)) continue;
    if (job.state === 'claimed') {
      next = failJob(next, job.id, 'target-gone');
    } else {
      delete next.jobs[job.id];
    }
    changed = true;
  }

  // --- Plant jobs: one per plantable tile, up to the target field
  // size (BUILD 1090) — the founders plant farms on adapter-rated
  // soil (1.4) when the camp's field is below FARM_TARGET_TILES.
  // plantableFarmTiles caps the list (best soil first), so the
  // board holds at most the tiles still needed — never one job per
  // plantable tile. A tile that is planted (or built over) leaves
  // the list: open jobs are removed, claimed ones fail
  // ('target-gone'). No soil data (the old callers) means no plant
  // jobs, so old boards are unchanged.
  const livePlantIds = new Set<string>();
  if (input.soilFactorAt) {
    for (const t of plantableFarmTiles(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, input.soilFactorAt, (x, y) => npcWalkable(world, x, y))) {
      const id = plantJobIdFor(t.tx, t.ty);
      livePlantIds.add(id);
      if (next.jobs[id]) continue;
      next.jobs[id] = {
        id,
        kind: 'plant',
        targetId: farmTileId(t.tx, t.ty),
        tile: { x: t.tx, y: t.ty },
        state: 'open',
        claimedBy: null,
        createdAbs: nowAbs,
      };
      changed = true;
    }
  }
  for (const job of Object.values(next.jobs)) {
    if (job.kind !== 'plant' || livePlantIds.has(job.id)) continue;
    if (job.state === 'claimed') {
      next = failJob(next, job.id, 'target-gone');
    } else {
      delete next.jobs[job.id];
    }
    changed = true;
  }

  // --- Water jobs: one per waterable farm tile (BUILD 1088) — a
  // planted/growing tile not yet watered this cycle, within the
  // farmer radius, once the well exists and the settlement is old
  // enough (WELL_START_DAY — the 24h window never sees a water
  // job). A tile that is no longer waterable (watered by another
  // founder first, or grown ready) is removed (open) or failed
  // (claimed — 'target-gone').
  const liveWaterIds = new Set<string>();
  if (input.well && input.day !== undefined && input.day >= WELL_START_DAY) {
    for (const t of waterableFarmTiles(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, nowAbs, FARM_VILLAGER_RADIUS, input.growthFactorAt)) {
      const id = waterJobIdFor(t.tx, t.ty);
      liveWaterIds.add(id);
      if (next.jobs[id]) continue;
      next.jobs[id] = {
        id,
        kind: 'water',
        targetId: farmTileId(t.tx, t.ty),
        tile: { x: t.tx, y: t.ty },
        state: 'open',
        claimedBy: null,
        createdAbs: nowAbs,
      };
      changed = true;
    }
  }
  for (const job of Object.values(next.jobs)) {
    if (job.kind !== 'water' || liveWaterIds.has(job.id)) continue;
    if (job.state === 'claimed') {
      next = failJob(next, job.id, 'target-gone');
    } else {
      delete next.jobs[job.id];
    }
    changed = true;
  }

  // --- Mine jobs: one per open mine site (BUILD 1089) — the
  // miner's shift (walk to the mine, work 3 ticks, carry 2 ore
  // to the storehouse). The job's tile is the mine's work tile;
  // the job completes when the shift's ore is in the carrier
  // (the deposit depletes / the site exhausts). A claimed job
  // whose site exhausted fails ('target-gone').
  const liveMineIds = new Set<string>();
  const openMine = input.mines ? openMineSite(input.mines) : null;
  if (openMine) {
    const id = mineJobIdFor(openMine.depositId);
    liveMineIds.add(id);
    if (!next.jobs[id]) {
      next.jobs[id] = {
        id,
        kind: 'mine',
        targetId: openMine.depositId,
        tile: { ...openMine.workTile },
        state: 'open',
        claimedBy: null,
        createdAbs: nowAbs,
      };
      changed = true;
    }
  }
  for (const job of Object.values(next.jobs)) {
    if (job.kind !== 'mine' || liveMineIds.has(job.id)) continue;
    if (job.state === 'claimed') {
      next = failJob(next, job.id, 'target-gone');
    } else {
      delete next.jobs[job.id];
    }
    changed = true;
  }

  // --- Mill + bake jobs (BUILD 1094): one job per food-chain
  // building, while the building is done and there is input to
  // process. The mill job is open while the mill is done and
  // there is grain to grind (and room in the flour store); the
  // bake job while the bakery is done and there is flour to bake
  // (and the camp is short of food). The job's tile is the
  // building's approach; the job completes when the founder's
  // 3-tick shift ends (the shift produces per tick). A claimed
  // job whose input ran out mid-shift is NOT failed — the founder
  // finishes the shift (grinding/baking 0 on the dry ticks) and
  // the job completes; only a claimed job whose BUILDING is gone
  // fails ('target-gone'). An open job whose input ran out is
  // removed silently (nobody was doing it).
  const millId = millJobIdFor(MILL_SITE_ID);
  const millDone = input.foodChain ? isMillUsable(input.foodChain) : false;
  const millWorkable =
    millDone &&
    input.granary !== undefined &&
    input.granary.grain >= GRIND_GRAIN_PER_BATCH &&
    input.granary.flour < GRANARY_CAPACITY_FLOUR;
  if (millWorkable && !next.jobs[millId]) {
    next.jobs[millId] = {
      id: millId,
      kind: 'mill',
      targetId: MILL_SITE_ID,
      tile: { ...MILL_APPROACH },
      state: 'open',
      claimedBy: null,
      createdAbs: nowAbs,
    };
    changed = true;
  } else if (!millWorkable && next.jobs[millId]) {
    const job = next.jobs[millId];
    if (job.state === 'open') {
      delete next.jobs[millId];
      changed = true;
    } else if (!millDone) {
      next = failJob(next, millId, 'target-gone');
      changed = true;
    }
    // claimed + mill done: the grain ran out mid-shift — leave
    // it, the shift completes.
  }
  const bakeId = bakeJobIdFor(BAKERY_SITE_ID);
  const bakeryDone = input.foodChain ? isBakeryUsable(input.foodChain) : false;
  const bakeWorkable =
    bakeryDone &&
    input.granary !== undefined &&
    input.granary.flour >= BAKE_FLOUR_PER_MEAL &&
    input.granary.food < BAKE_FOOD_THRESHOLD;
  if (bakeWorkable && !next.jobs[bakeId]) {
    next.jobs[bakeId] = {
      id: bakeId,
      kind: 'bake',
      targetId: BAKERY_SITE_ID,
      tile: { ...BAKERY_APPROACH },
      state: 'open',
      claimedBy: null,
      createdAbs: nowAbs,
    };
    changed = true;
  } else if (!bakeWorkable && next.jobs[bakeId]) {
    const job = next.jobs[bakeId];
    if (job.state === 'open') {
      delete next.jobs[bakeId];
      changed = true;
    } else if (!bakeryDone) {
      next = failJob(next, bakeId, 'target-gone');
      changed = true;
    }
  }

  // --- Lumber jobs: one per tree in the designated lumber rect
  // (BUILD 1089) — the felling rotation. Discovery iterates the
  // rect row-major (lumberTreesInRect), so the board order IS the
  // rotation: the crew claims the first open lumber job and fells
  // section by section across the rect. A felled tree's job
  // completes on the fell (the sapling is planted by the fell, so
  // the site thins, then regrows). A claimed job whose tree is
  // gone (felled by the player first) fails ('target-gone').
  const liveLumberIds = new Set<string>();
  if (lumberRect) {
    for (const t of lumberTreesInRect(world, lumberRect)) {
      const id = lumberJobIdFor(t.tx, t.ty);
      liveLumberIds.add(id);
      if (next.jobs[id]) continue;
      if (!treeWorkTile(world, t.tx, t.ty)) continue;
      next.jobs[id] = {
        id,
        kind: 'lumber',
        targetId: treeTargetId(world, t.tx, t.ty),
        tile: { x: t.tx, y: t.ty },
        state: 'open',
        claimedBy: null,
        createdAbs: nowAbs,
      };
      changed = true;
    }
  }
  for (const job of Object.values(next.jobs)) {
    if (job.kind !== 'lumber' || liveLumberIds.has(job.id)) continue;
    if (job.state === 'claimed') {
      next = failJob(next, job.id, 'target-gone');
    } else {
      delete next.jobs[job.id];
    }
    changed = true;
  }

  // --- Quarry jobs: one per live stone deposit + one per rock in
  // work radius WITH a walkable work tile (BUILD 1086). A deposit
  // with no walkable tile beside it is not work (the chop rule).
  const liveQuarryIds = new Set<string>();
  for (const d of stoneDepositsInRadius(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, FOUNDER_WORK_RADIUS)) {
    const targetId = quarryTargetIdFor('deposit', d.x, d.y);
    const id = quarryJobIdFor(targetId);
    liveQuarryIds.add(id);
    if (next.jobs[id]) continue;
    if (!quarryWorkTile(world, d.x, d.y)) continue;
    next.jobs[id] = {
      id,
      kind: 'quarry',
      targetId,
      tile: { x: d.x, y: d.y },
      state: 'open',
      claimedBy: null,
      createdAbs: nowAbs,
    };
    changed = true;
  }
  const rockRadius = input.quarryRadius ?? FOUNDER_WORK_RADIUS;
  for (const r of rocksInRadius(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, rockRadius)) {
    const targetId = quarryTargetIdFor('rock', r.tx, r.ty);
    // BUILD 1087: a rock that failed 'no-path' is never rediscovered
    // this session — the claim loop already proved no path from camp.
    // It is skipped BEFORE liveQuarryIds, so a stale job for it is
    // cleaned up by the loop below instead of preserved.
    if (board.blockedQuarry?.includes(targetId)) continue;
    const id = quarryJobIdFor(targetId);
    liveQuarryIds.add(id);
    if (next.jobs[id]) continue;
    if (!quarryWorkTile(world, r.tx, r.ty)) continue;
    next.jobs[id] = {
      id,
      kind: 'quarry',
      targetId,
      tile: { x: r.tx, y: r.ty },
      state: 'open',
      claimedBy: null,
      createdAbs: nowAbs,
    };
    changed = true;
  }
  for (const job of Object.values(next.jobs)) {
    if (job.kind !== 'quarry' || liveQuarryIds.has(job.id)) continue;
    if (job.state === 'claimed') {
      next = failJob(next, job.id, 'target-gone');
    } else {
      delete next.jobs[job.id];
    }
    changed = true;
  }

  // --- Deliver jobs: one per founder carrying wood, grain, OR stone. ---
  const carryingIds = new Set<string>();
  for (const f of founders) {
    // BUILD 1087: a founder carrying BUILD wood (fetched from the
    // storehouse for a site) also gets a deliver job — the carrier
    // holds wood, grain, stone, or build wood, and the job
    // completes when ALL are empty (the return leg).
    // BUILD 1089: a founder carrying ORE (mined) also gets a
    // deliver job — the carrier holds ore too, and the job
    // completes when ALL are empty.
    if (Math.max(0, Math.floor(f.carrying)) + Math.max(0, Math.floor(f.carryingGrain ?? 0)) + Math.max(0, Math.floor(f.carryingStone ?? 0)) + Math.max(0, Math.floor(f.carryingBuild ?? 0)) + Math.max(0, Math.floor(f.carryingOre ?? 0)) <= 0) continue;
    carryingIds.add(f.id);
    const id = deliverJobIdFor(f.id);
    if (!next.jobs[id]) {
      next.jobs[id] = {
        id,
        kind: 'deliver',
        targetId: f.id,
        tile: { ...FOUNDER_CAMP_CENTRE },
        state: 'open',
        claimedBy: null,
        createdAbs: nowAbs,
      };
      changed = true;
    }
  }
  for (const job of Object.values(next.jobs)) {
    if (job.kind !== 'deliver' || carryingIds.has(job.targetId)) continue;
    // The carrier emptied — the work is done (the wood and grain
    // are in the camp store). A claimed deliver job completes here;
    // an open one is removed silently (nobody was carrying it).
    if (job.state === 'claimed') {
      next = completeJob(next, job.id);
    } else {
      delete next.jobs[job.id];
    }
    changed = true;
  }

  return changed ? next : board;
}

/**
 * Claim one open job for a founder (exclusive — a claimed job
 * cannot be claimed again). Returns the new board and the job, or
 * null when the job does not exist or is not open. Pure.
 */
export function claimJob(board: JobBoard, founderId: string, jobId: string): { board: JobBoard; job: Job | null } {
  const job = board.jobs[jobId];
  if (!job || job.state !== 'open') return { board, job: null };
  const next = copyBoard(board);
  const claimed: Job = { ...job, state: 'claimed', claimedBy: founderId };
  next.jobs[jobId] = claimed;
  return { board: next, job: claimed };
}

/**
 * Claim the nearest OPEN job of a kind to (x, y) within maxDist
 * (Manhattan). Ties go to the first in board order (insertion
 * order — deterministic for a given build). Returns the new board
 * and the job, or null when no open job of that kind is in range.
 * Pure.
 */
export function claimNearestJob(
  board: JobBoard,
  founderId: string,
  kind: JobKind,
  x: number,
  y: number,
  maxDist: number,
): { board: JobBoard; job: Job | null } {
  let best: Job | null = null;
  let bestD = Infinity;
  for (const job of Object.values(board.jobs)) {
    if (job.kind !== kind || job.state !== 'open') continue;
    const d = Math.abs(job.tile.x - x) + Math.abs(job.tile.y - y);
    if (d > maxDist || d >= bestD) continue;
    bestD = d;
    best = job;
  }
  if (!best) return { board, job: null };
  return claimJob(board, founderId, best.id);
}

/**
 * Claim the FIRST open job of a kind in board order (insertion
 * order — deterministic for a given build). The lumber rotation
 * claims this way: discovery inserts the rect's trees row-major,
 * so the first open lumber job is the next tree in the rotation
 * (fell section by section), not the nearest tree to the founder.
 * Pure.
 */
export function claimFirstJob(
  board: JobBoard,
  founderId: string,
  kind: JobKind,
): { board: JobBoard; job: Job | null } {
  for (const job of Object.values(board.jobs)) {
    if (job.kind !== kind || job.state !== 'open') continue;
    return claimJob(board, founderId, job.id);
  }
  return { board, job: null };
}

/**
 * Ensure a carrying founder's deliver job exists and claim it
 * (the delivery leg of their chop: the job is theirs alone — its
 * id carries their founder id — so this never contends with
 * another founder). Returns the new board and the job, or null
 * when the founder carries nothing (no job to claim). Pure.
 */
export function claimDeliverJobFor(
  board: JobBoard,
  founderId: string,
  carrying: number,
  nowAbs: number,
): { board: JobBoard; job: Job | null } {
  if (Math.max(0, Math.floor(carrying)) <= 0) return { board, job: null };
  const id = deliverJobIdFor(founderId);
  let next = board;
  if (!next.jobs[id]) {
    next = copyBoard(next);
    next.jobs[id] = {
      id,
      kind: 'deliver',
      targetId: founderId,
      tile: { ...FOUNDER_CAMP_CENTRE },
      state: 'open',
      claimedBy: null,
      createdAbs: nowAbs,
    };
  }
  return claimJob(next, founderId, id);
}

/**
 * Release a claimed job back to open (the holder left the work —
 * activity flip, pile dry mid-build — so the site and the tree go
 * back on the board instead of sitting reserved). A job that is
 * not claimed is untouched. Pure.
 */
export function releaseJob(board: JobBoard, jobId: string): JobBoard {
  const job = board.jobs[jobId];
  if (!job || job.state !== 'claimed') return board;
  const next = copyBoard(board);
  next.jobs[jobId] = { ...job, state: 'open', claimedBy: null };
  return next;
}

/**
 * Complete a job: it leaves the board and the completed counter
 * rises. The registry transfer that IS the completion (the fell,
 * the delivery, the finished hut) already happened — completing
 * the job records it, it does not perform it. A job that is not
 * on the board is untouched. Pure.
 */
export function completeJob(board: JobBoard, jobId: string): JobBoard {
  const job = board.jobs[jobId];
  if (!job) return board;
  const next = copyBoard(board);
  delete next.jobs[jobId];
  next.completed = board.completed + 1;
  next.lastCompletedId = jobId;
  return next;
}

/**
 * Fail a job: it leaves the board and the failed counter rises.
 * The holder's target vanished (their tree was felled by the
 * player first) — they must re-target. A job that is not on the
 * board is untouched. Pure.
 */
export function failJob(board: JobBoard, jobId: string, reason: string): JobBoard {
  const job = board.jobs[jobId];
  if (!job) return board;
  const next = copyBoard(board);
  delete next.jobs[jobId];
  next.failed = board.failed + 1;
  next.lastFailedId = jobId;
  next.lastFailedReason = reason;
  return next;
}

/** The job a founder currently holds (claimed by them), or
 *  undefined when they hold nothing. */
export function jobForFounder(board: JobBoard, founderId: string): Job | undefined {
  for (const job of Object.values(board.jobs)) {
    if (job.state === 'claimed' && job.claimedBy === founderId) return job;
  }
  return undefined;
}

/** Every open job, optionally of one kind (board order —
 *  deterministic for a given build). */
export function openJobs(board: JobBoard, kind?: JobKind): Job[] {
  return Object.values(board.jobs).filter((j) => j.state === 'open' && (kind === undefined || j.kind === kind));
}

/**
 * The nearest OPEN job of a kind to (x, y) within maxDist
 * (Manhattan), or null when none is in range. Read-only (no
 * claim) — the scorer asks this. Ties go to the first in board
 * order. Pure.
 */
export function nearestOpenJob(board: JobBoard, kind: JobKind, x: number, y: number, maxDist: number): Job | null {
  let best: Job | null = null;
  let bestD = Infinity;
  for (const job of Object.values(board.jobs)) {
    if (job.kind !== kind || job.state !== 'open') continue;
    const d = Math.abs(job.tile.x - x) + Math.abs(job.tile.y - y);
    if (d > maxDist || d >= bestD) continue;
    bestD = d;
    best = job;
  }
  return best;
}

/**
 * The scorer's nearest-tree distance from the board: a founder
 * holding a chop job scores by THEIR tree (they keep working it
 * while they hold it); a founder holding nothing scores by the
 * nearest OPEN chop job — null when every tree in range is
 * claimed (work scores 0, the founder does not score work for a
 * tree someone else is already chopping). The same function feeds
 * the real-time tick and the wait step, so the two never disagree.
 * Pure.
 */
export function scorerTreeDist(board: JobBoard, founderId: string, campX: number, campY: number, maxDist: number): number | null {
  const mine = jobForFounder(board, founderId);
  if (mine && mine.kind === 'chop') return Math.abs(mine.tile.x - campX) + Math.abs(mine.tile.y - campY);
  const open = nearestOpenJob(board, 'chop', campX, campY, maxDist);
  if (!open) return null;
  return Math.abs(open.tile.x - campX) + Math.abs(open.tile.y - campY);
}

/** BUILD 1086: the Manhattan distance camp → the founder's own
 *  claimed quarry job, or the nearest OPEN quarry job — null when
 *  every quarry site in range is claimed (the stone term scores 0,
 *  the founder does not score stone work for a site someone else
 *  is already mining). The same function feeds the real-time tick
 *  and the wait step, so the two never disagree. Pure. */
export function scorerQuarryDist(board: JobBoard, founderId: string, campX: number, campY: number, maxDist: number): number | null {
  const mine = jobForFounder(board, founderId);
  if (mine && mine.kind === 'quarry') return Math.abs(mine.tile.x - campX) + Math.abs(mine.tile.y - campY);
  const open = nearestOpenJob(board, 'quarry', campX, campY, maxDist);
  if (!open) return null;
  return Math.abs(open.tile.x - campX) + Math.abs(open.tile.y - campY);
}

/** BUILD 1089: the Manhattan distance camp → the founder's own
 *  claimed mine job, or the nearest OPEN mine job — null when no
 *  mine is open (the mine term scores 0). Pure. */
export function scorerMineDist(board: JobBoard, founderId: string, campX: number, campY: number, maxDist: number): number | null {
  const mine = jobForFounder(board, founderId);
  if (mine && mine.kind === 'mine') return Math.abs(mine.tile.x - campX) + Math.abs(mine.tile.y - campY);
  const open = nearestOpenJob(board, 'mine', campX, campY, maxDist);
  if (!open) return null;
  return Math.abs(open.tile.x - campX) + Math.abs(open.tile.y - campY);
}

/** BUILD 1089: the Manhattan distance camp → the founder's own
 *  claimed lumber job, or the nearest OPEN lumber job — null when
 *  no lumber tree in the rect is open (the lumber term scores 0).
 *  Pure. */
export function scorerLumberDist(board: JobBoard, founderId: string, campX: number, campY: number, maxDist: number): number | null {
  const mine = jobForFounder(board, founderId);
  if (mine && mine.kind === 'lumber') return Math.abs(mine.tile.x - campX) + Math.abs(mine.tile.y - campY);
  const open = nearestOpenJob(board, 'lumber', campX, campY, maxDist);
  if (!open) return null;
  return Math.abs(open.tile.x - campX) + Math.abs(open.tile.y - campY);
}

/** The founder holding a build job (the builder), or null when no
 *  build job is claimed. With a site id, the builder of THAT
 *  site's job (one builder per site); without one, the builder of
 *  any claimed build job. Pure. */
export function buildJobClaimedBy(board: JobBoard, siteId?: string): string | null {
  if (siteId !== undefined) {
    const job = board.jobs[buildJobIdFor(siteId)];
    if (!job || job.state !== 'claimed') return null;
    return job.claimedBy;
  }
  for (const job of Object.values(board.jobs)) {
    if (job.kind === 'build' && job.state === 'claimed') return job.claimedBy;
  }
  return null;
}

/** The board as numbers: open/claimed by kind, plus the session
 *  completed/failed totals — the E report and the probe read this. */
export function jobSummary(board: JobBoard): {
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
  waterOpen: number;
  waterClaimed: number;
  mineOpen: number;
  mineClaimed: number;
  lumberOpen: number;
  lumberClaimed: number;
  plantOpen: number;
  plantClaimed: number;
  millOpen: number;
  millClaimed: number;
  bakeOpen: number;
  bakeClaimed: number;
  lastCompletedId: string | null;
  lastFailedId: string | null;
  lastFailedReason: string | null;
} {
  let open = 0;
  let claimed = 0;
  let chopOpen = 0;
  let chopClaimed = 0;
  let buildOpen = 0;
  let buildClaimed = 0;
  let deliverOpen = 0;
  let deliverClaimed = 0;
  let harvestOpen = 0;
  let harvestClaimed = 0;
  let quarryOpen = 0;
  let quarryClaimed = 0;
  let waterOpen = 0;
  let waterClaimed = 0;
  let mineOpen = 0;
  let mineClaimed = 0;
  let lumberOpen = 0;
  let lumberClaimed = 0;
  let plantOpen = 0;
  let plantClaimed = 0;
  let millOpen = 0;
  let millClaimed = 0;
  let bakeOpen = 0;
  let bakeClaimed = 0;
  for (const job of Object.values(board.jobs)) {
    if (job.state === 'open') {
      open++;
      if (job.kind === 'chop') chopOpen++;
      else if (job.kind === 'build') buildOpen++;
      else if (job.kind === 'harvest') harvestOpen++;
      else if (job.kind === 'quarry') quarryOpen++;
      else if (job.kind === 'water') waterOpen++;
      else if (job.kind === 'mine') mineOpen++;
      else if (job.kind === 'lumber') lumberOpen++;
      else if (job.kind === 'plant') plantOpen++;
      else if (job.kind === 'mill') millOpen++;
      else if (job.kind === 'bake') bakeOpen++;
      else deliverOpen++;
    } else if (job.state === 'claimed') {
      claimed++;
      if (job.kind === 'chop') chopClaimed++;
      else if (job.kind === 'build') buildClaimed++;
      else if (job.kind === 'harvest') harvestClaimed++;
      else if (job.kind === 'quarry') quarryClaimed++;
      else if (job.kind === 'water') waterClaimed++;
      else if (job.kind === 'mine') mineClaimed++;
      else if (job.kind === 'lumber') lumberClaimed++;
      else if (job.kind === 'plant') plantClaimed++;
      else if (job.kind === 'mill') millClaimed++;
      else if (job.kind === 'bake') bakeClaimed++;
      else deliverClaimed++;
    }
  }
  return { open, claimed, completed: board.completed, failed: board.failed, chopOpen, chopClaimed, buildOpen, buildClaimed, deliverOpen, deliverClaimed, harvestOpen, harvestClaimed, quarryOpen, quarryClaimed, waterOpen, waterClaimed, mineOpen, mineClaimed, lumberOpen, lumberClaimed, plantOpen, plantClaimed, millOpen, millClaimed, bakeOpen, bakeClaimed, lastCompletedId: board.lastCompletedId, lastFailedId: board.lastFailedId, lastFailedReason: board.lastFailedReason };
}
