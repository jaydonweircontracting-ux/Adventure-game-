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
import { stoneDepositsInRadius, rocksInRadius, quarryWorkTile, quarryTargetIdFor } from './quarry';
import { HUT_SITES, sitesOf } from './construction';
import { jobIdFor, treeId, wildTreeId, farmTileId } from './entityIds';
import { FARM_VILLAGER_RADIUS, readyFarmTiles } from './farm';
import type { ConstructionState } from './construction';
import type { IsoWorld } from '../iso/isoWorld';

/** The kinds of work the scheduler knows. */
export type JobKind = 'chop' | 'build' | 'deliver' | 'harvest' | 'quarry';

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
  return { jobs: { ...board.jobs }, completed: board.completed, failed: board.failed, lastCompletedId: board.lastCompletedId, lastFailedId: board.lastFailedId, lastFailedReason: board.lastFailedReason };
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

/** What discovery needs: the world (trees), the construction
 *  (the hut), the founders' carried wood, and the clock (for
 *  createdAbs). The registry is NOT an input — a job's existence
 *  is a fact about the world, not about a store; whether a job
 *  is ACTIONABLE (the pile holds a step's wood) is the claim
 *  site's check (canBuild), not discovery's. */
export type JobDiscoveryInput = {
  world: IsoWorld;
  construction: ConstructionState;
  founders: readonly { id: string; carrying: number; carryingGrain?: number; carryingStone?: number }[];
  nowAbs: number;
  /** BUILD 1083 (1.4) + 1084 (1.5): the farm growth factor per
   *  tile, from the 1.1 adapter (livingWorld.growthFactorAt =
   *  soil × season) — harvest discovery reads the combined
   *  factor through it, never by importing landforms.ts or
   *  climate.ts. */
  growthFactorAt?: (tx: number, ty: number) => number;
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
 * - build: one job while the hut is unfinished; completing it
 *   when the construction is done.
 * - harvest (BUILD 1067): one job per READY farm tile within the
 *   farmer radius of the camp; completing it when the tile is
 *   harvested (the grain is in the carrier).
 * - quarry (BUILD 1086): one job per live stone deposit + one per
 *   rock in work radius WITH a walkable work tile (a formation
 *   nobody can stand beside is not work). Completing it when the
 *   stone is in the carrier (the deposit depletes / the rock is
 *   consumed). A mined-out deposit leaves the board (open) or
 *   fails (claimed — 'target-gone').
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
  const trees = treesInRadius(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, FOUNDER_WORK_RADIUS);
  const liveChopIds = new Set<string>();
  for (const t of trees) {
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
  for (const r of rocksInRadius(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, FOUNDER_WORK_RADIUS)) {
    const targetId = quarryTargetIdFor('rock', r.tx, r.ty);
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
    if (Math.max(0, Math.floor(f.carrying)) + Math.max(0, Math.floor(f.carryingGrain ?? 0)) + Math.max(0, Math.floor(f.carryingStone ?? 0)) <= 0) continue;
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
  for (const job of Object.values(board.jobs)) {
    if (job.state === 'open') {
      open++;
      if (job.kind === 'chop') chopOpen++;
      else if (job.kind === 'build') buildOpen++;
      else if (job.kind === 'harvest') harvestOpen++;
      else if (job.kind === 'quarry') quarryOpen++;
      else deliverOpen++;
    } else if (job.state === 'claimed') {
      claimed++;
      if (job.kind === 'chop') chopClaimed++;
      else if (job.kind === 'build') buildClaimed++;
      else if (job.kind === 'harvest') harvestClaimed++;
      else if (job.kind === 'quarry') quarryClaimed++;
      else deliverClaimed++;
    }
  }
  return { open, claimed, completed: board.completed, failed: board.failed, chopOpen, chopClaimed, buildOpen, buildClaimed, deliverOpen, deliverClaimed, harvestOpen, harvestClaimed, quarryOpen, quarryClaimed, lastCompletedId: board.lastCompletedId, lastFailedId: board.lastFailedId, lastFailedReason: board.lastFailedReason };
}
