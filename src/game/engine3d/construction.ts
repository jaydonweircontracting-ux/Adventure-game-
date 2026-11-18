/**
 * BUILD 1058 — NPC construction: the first hut from the stockpile.
 *
 * The founders (BUILD 1057) filled a real wood stockpile at their
 * camp. This module is the construction side: one cottage, built by
 * the founders from that stockpile, through the SAME placement path
 * the player uses (placements.ts validatePlacement + addPlacement),
 * so the finished hut is a REAL building — collision, door, interior
 * — not set-dressing. The vision plan (PLAN.md §2) calls placements
 * "the construction substrate"; §6 warns the cottage door-nav
 * defect (findPath returns null for doors in 6-unit gaps), so the
 * site is surveyed and its door reachability is asserted, not
 * assumed.
 *
 * DESIGN (all pure here; the view owns the timers, rendering, I/O):
 *
 * - SITE (surveyed on the real fresh world, 2026-11-15): the camp
 *   is at (124,120), the log pile at (125,120). The hut centre is
 *   (128,120) — 4 tiles east of the camp, on the same row, so camp,
 *   pile, and hut read as one little settlement. The cottage
 *   footprint is 4x3 (townLook.ts), rect 126..129 x 119..121: all
 *   walkable grass, no trees, no water, no rocks, and it touches
 *   none of the camp's own tiles (centre, pile, eat tile, sleep
 *   row). The door faces south at (128,121) with the approach tile
 *   (128,122) in open meadow; planPathNpc succeeds camp → approach
 *   (6 steps) and approach → player spawn (46 steps), asserted.
 * - COST: 12 wood = 6 work steps x 2 wood. A founder delivers 2 wood
 *   per trip (~15s per delivery in the 1057 probe), so the pile fills
 *   in ~45-60s with three founders and the hut finishes ~90s after
 *   a fresh start — observable in one probe.
 * - SPENDING IS HONEST: wood leaves the stockpile ONLY when a work
 *   step completes at the site (2 wood per step, 3 ticks per step,
 *   mirroring FOUNDER_CHOP_TICKS). The stockpile count never drops
 *   without wood being spent, and the hut never appears without the
 *   wood having been spent (the placement is added only when the 6th
 *   step completes). One builder at a time (the site has one work
 *   tile — the approach tile, in front of the door); the other
 *   founders keep the wood coming.
 * - NEEDS STILL DRIVE THE WORK: building is work. The builder is
 *   assigned only while their activity is 'work' (the 1057 chooser:
 *   sleep wins at night or on low energy, eat wins when hungry,
 *   rest wins when social is low). A tired or hungry builder leaves
 *   the site and the step's partial ticks reset; banked progress
 *   stays. If the pile runs dry mid-build the builder goes back to
 *   chopping.
 * - THE FINISHED HUT IS REAL: stamped through validatePlacement +
 *   addPlacement ('house-cottage', rot 0), so placedHutRects renders
 *   it, walkableWithPlacements collides it, nearestDoorHut opens it,
 *   and interiors.ts furnishes it — the same as a player-placed
 *   cottage. Once it exists the founders sleep IN it (their sleep
 *   tiles move to the hut's north row, door lane kept clear). Entry
 *   and exit are door transitions (the player's Enter/Exit, one tile
 *   through the door) — the 990 rule (NPCs never walk through hut
 *   tiles) is never broken, because the tick moves a founder through
 *   the door in one step instead of pathing them through walls.
 * - WAIT: construction does not advance during a wait — positions,
 *   chopping, deliveries, and building all pause (the 1057 rule);
 *   needs simulate per wait-step. No phantom wood, no phantom hut.
 * - SAVE: the construction state rides in the versioned founders
 *   save (ag-3d-founders-v1, v2 — see founders.ts), the hut itself
 *   rides in the world save (w.placements, via saveWorld). If the
 *   player removes the hut with Build Remove, the construction
 *   resets to 'none' (reconcileConstruction) and the founders
 *   rebuild from the pile when wood allows — no free hut, no
 *   disagreement between the two saves.
 *
 * Pure module (no React, no WebGL, no localStorage in the pure
 * functions) so the sim and the standalone asserts can import it
 * directly.
 */

import { planPathNpc } from './townsfolk3d';
import { houseFootprint, doorForRect } from './placements';
import { FOUNDER_CAMP, FOUNDER_STOCKPILE_TILE, FOUNDER_EAT_TILE, FOUNDER_SLEEP_TILES } from './founders';
import { CAMP_STORE_ID, storeQty, withdrawFrom, type ResourceRegistry } from './resourceRegistry';
import { terrainAt } from '../iso/isoWorld';
import type { IsoWorld } from '../iso/isoWorld';
import type { WheatTri } from './farm';

/** Hut centre (surveyed — see the module doc). */
export const HUT_CENTRE = { x: 128, y: 120 };
/** Hut rect: cottage 4x3 centred on HUT_CENTRE. */
export const HUT_RECT = { x0: 126, y0: 119, x1: 129, y1: 121 };
/** Door tile: south edge centre (doorForRect, rot 0). */
export const HUT_DOOR = { x: 128, y: 121 };
/** Approach tile: one tile south of the door — the exit point, the
 *  build work tile, and the door-transition tile. */
export const HUT_APPROACH = { x: 128, y: 122 };
/** Founders' sleep tiles inside the finished hut: the north row,
 *  with the door lane (x=128) kept clear. */
export const HUT_SLEEP_TILES = [
  { x: 126, y: 119 },
  { x: 127, y: 119 },
  { x: 129, y: 119 },
];
// --- BUILD 1066 (0x06): the second hut — the chain's housing.
// The first hut sleeps the 3 founders (capacity 3 = population 3),
// so no resident can ever arrive. The second hut is the capacity
// the chain creates: surveyed on the real fresh world (verify1066
// survey — north of camp is clear, door reachable in 2 steps;
// west has a rock on the centre tile, east has three trees in the
// rect). A hut site is one cottage: centre, 4x3 rect, south door,
// approach tile one south of the door, and 3 sleep tiles on the
// north row with the door lane kept clear. ---
/** One hut site: the geometry a cottage needs. */
export type HutSite = {
  /** Stable id ('hut-site-0', 'hut-site-1') — the build job's
   *  target and the bed's hut index. */
  id: string;
  centre: { x: number; y: number };
  rect: { x0: number; y0: number; x1: number; y1: number };
  door: { x: number; y: number };
  approach: { x: number; y: number };
  sleepTiles: { x: number; y: number }[];
};
/** The hut sites, in build order. Site 0 is the 1058 hut (east of
 *  camp); site 1 is the 1066 hut (north of camp). */
export const HUT_SITES: HutSite[] = [
  {
    id: 'hut-site-0',
    centre: { ...HUT_CENTRE },
    rect: { ...HUT_RECT },
    door: { ...HUT_DOOR },
    approach: { ...HUT_APPROACH },
    sleepTiles: HUT_SLEEP_TILES.map((t) => ({ ...t })),
  },
  {
    id: 'hut-site-1',
    centre: { x: 124, y: 116 },
    rect: { x0: 122, y0: 115, x1: 125, y1: 117 },
    door: { x: 124, y: 117 },
    approach: { x: 124, y: 118 },
    sleepTiles: [
      { x: 122, y: 115 },
      { x: 123, y: 115 },
      { x: 125, y: 115 },
    ],
  },
  // BUILD 1096 (0x1F): worker housing — the third hut site (the
  // catalogue's worker-housing variant, 4 beds: the north row minus
  // the door lane x=120, plus the west middle tile). Centre (120,117)
  // surveyed clear: 5 steps from camp, approach (120,119) clear of
  // every building rect + approach tile (see verify1096). Start gate:
  // sites 0+1 done + day >= HOUSING_START_DAY (jobs.ts) — the 24h
  // run is day 1 only, so M1069 cannot move.
  {
    id: 'hut-site-2',
    centre: { x: 120, y: 117 },
    rect: { x0: 118, y0: 116, x1: 121, y1: 118 },
    door: { x: 120, y: 118 },
    approach: { x: 120, y: 119 },
    sleepTiles: [
      { x: 118, y: 116 },
      { x: 119, y: 116 },
      { x: 121, y: 116 },
      { x: 118, y: 117 },
    ],
  },
];
/** A hut site by its id, or undefined when unknown. */
export function hutSiteById(id: string): HutSite | undefined {
  return HUT_SITES.find((s) => s.id === id);
}
/** A hut site's index in HUT_SITES, or -1 when unknown. */
export function hutSiteIndexById(id: string): number {
  return HUT_SITES.findIndex((s) => s.id === id);
}
/** The hut site containing a tile (inside its rect), or undefined
 *  when the tile is in no hut. */
export function hutSiteForTile(x: number, y: number): HutSite | undefined {
  return HUT_SITES.find((s) => x >= s.rect.x0 && x <= s.rect.x1 && y >= s.rect.y0 && y <= s.rect.y1);
}
/** Placement kind for the hut (validatePlacement 'house-cottage'). */
export const HUT_KIND = 'house-cottage' as const;

/** Wood the hut costs in total. */
export const HUT_COST_WOOD = 12;
/** BUILD 1096 (0x1F): the earliest day hut-site-2 (worker housing)
 *  may start — the same day the storehouse opens (STOREHOUSE_START_DAY),
 *  so the week builds it from day 3 while the 24h run (day 1) never sees it. */
export const HOUSING_START_DAY = 3;

/** Work steps to finish the hut (each spends HUT_WOOD_PER_STEP). */
export const HUT_WORK_STEPS = 6;
/** Wood spent per completed work step. */
export const HUT_WOOD_PER_STEP = 2;
/** Ticks a founder works at the site per step (mirrors chop ticks). */
export const HUT_TICKS_PER_STEP = 3;

// --- BUILD 1093 (0x1C Phase 3.2): construction stages. ---
//
// A building goes up in STAGES — foundation -> frame -> finished —
// and each stage has its own material cost, drawn from the
// catalogue entry (the hut's 12 wood, the storehouse's 12 wood +
// 6 stone, the bridge's 4 wood — the existing costs, unchanged).
// A stage cannot start until its materials are delivered to the
// site; a stage completes only when its steps are worked AND its
// materials are spent. The stage plan splits the building's total
// steps and total materials into three stages (foundation =
// ceil(n/3) steps, frame = ceil of half the rest, finished = the
// rest; each material splits proportionally by steps, so every
// stage's cost is a whole number of per-step costs). The site
// tracks per-stage progress (`stages`) alongside the total
// (`progress` = the sum of the stage steps), so two founders can
// work DIFFERENT stages of the same building at once — the frame
// opens once the foundation has started, the finished stage once
// the frame has started — while the live tick's single-builder
// policy (one builder per site, the scorer's builderTaken) keeps
// the 24h settlement identical. A site is usable only when every
// stage is complete (state 'done'); a half-built building is
// visibly unfinished (the build-site tris already grow with
// progress: slab at step 0, corner posts at step 2 = the frame,
// wall beams at step 4 = the finished stage, roof ridge at step
// 5) and unusable (no sleeping in a half-built hut, no storing
// in a half-built storehouse). Old saves and old literals carry
// no `stages` — the per-stage progress is derived from the total
// (the sequential split), so a v12 save loads without a version
// move.

/** The three construction stages, in build order. */
export type BuildStageId = 'foundation' | 'frame' | 'finished';
export const BUILD_STAGES: BuildStageId[] = ['foundation', 'frame', 'finished'];
/** Steps completed per stage. */
export type StageSteps = { foundation: number; frame: number; finished: number };
/** One stage's material cost (a catalogue material). */
export type StageMaterial = { resource: string; qty: number };
/** One stage's plan: its step count + its material cost. */
export type StagePlanEntry = { id: BuildStageId; steps: number; materials: StageMaterial[] };
/** A building's stage plan (three stages, in build order). */
export type StagePlan = { stages: StagePlanEntry[] };

/** Zero stage progress (a fresh site). */
export const ZERO_STAGE_STEPS: StageSteps = { foundation: 0, frame: 0, finished: 0 };

/**
 * How a building's total steps split into three stages:
 * foundation = ceil(n/3), frame = ceil of half the rest,
 * finished = the rest. (6 steps -> 2/2/2; 2 steps -> 1/1/0 —
 * the bridge's finished stage has 0 steps: it is complete the
 * moment the frame is done.) Pure.
 */
export function stageStepSplit(totalSteps: number): StageSteps {
  const n = Math.max(0, Math.round(totalSteps));
  const foundation = Math.ceil(n / 3);
  const frame = Math.ceil((n - foundation) / 2);
  const finished = n - foundation - frame;
  return { foundation, frame, finished };
}

/**
 * The stage plan for a building: the step split above, and each
 * material split proportionally by steps (per-step qty x stage
 * steps). Throws when a material does not divide evenly by the
 * step count — a stage cost must be a whole number of per-step
 * costs, never a fraction. Pure.
 */
export function stagePlanFor(totalSteps: number, materials: readonly StageMaterial[]): StagePlan {
  const n = Math.max(0, Math.round(totalSteps));
  const split = stageStepSplit(n);
  const stages: StagePlanEntry[] = BUILD_STAGES.map((id) => {
    const steps = split[id];
    const mats: StageMaterial[] = materials.map((m) => {
      if (n === 0) return { resource: m.resource, qty: 0 };
      if (m.qty % n !== 0) throw new Error('stagePlanFor: material ' + m.resource + ' qty ' + m.qty + ' does not divide evenly by ' + n + ' steps');
      return { resource: m.resource, qty: (m.qty / n) * steps };
    });
    return { id, steps, materials: mats };
  });
  return { stages };
}

/**
 * Per-stage steps derived from a total progress (the sequential
 * split — what an old state without `stages` means: the stages
 * were worked in order). Pure.
 */
export function stageStepsFor(progress: number, totalSteps: number): StageSteps {
  const split = stageStepSplit(totalSteps);
  const foundation = Math.max(0, Math.min(progress, split.foundation));
  const frame = Math.max(0, Math.min(progress - split.foundation, split.frame));
  const finished = Math.max(0, progress - split.foundation - split.frame);
  return { foundation, frame, finished };
}

/**
 * A site's per-stage progress: the stored `stages` when it is
 * valid (each stage within its step count and the sum equal to
 * the total progress), else the sequential derivation from the
 * total. Pure.
 */
export function stageProgressOf(site: { progress: number; stages?: StageSteps }, totalSteps: number): StageSteps {
  const split = stageStepSplit(totalSteps);
  const derived = stageStepsFor(site.progress, totalSteps);
  const s = site.stages;
  if (!s) return derived;
  if (
    Number.isInteger(s.foundation) && s.foundation >= 0 && s.foundation <= split.foundation &&
    Number.isInteger(s.frame) && s.frame >= 0 && s.frame <= split.frame &&
    Number.isInteger(s.finished) && s.finished >= 0 && s.finished <= split.finished &&
    s.foundation + s.frame + s.finished === site.progress
  ) {
    return { foundation: s.foundation, frame: s.frame, finished: s.finished };
  }
  return derived;
}

/**
 * The first incomplete stage (the one a builder works next), or
 * null when every stage is complete. A 0-step stage is complete
 * the moment it is reached (the bridge's finished stage). Pure.
 */
export function currentStageFor(site: { progress: number; stages?: StageSteps }, totalSteps: number): { id: BuildStageId; done: number; total: number } | null {
  const split = stageStepSplit(totalSteps);
  const steps = stageProgressOf(site, totalSteps);
  for (const id of BUILD_STAGES) {
    if (steps[id] < split[id]) return { id, done: steps[id], total: split[id] };
  }
  return null;
}

/**
 * The stage a total progress sits in (the build-site visual's
 * stage): foundation below the foundation step count, frame
 * below foundation + frame, finished below the last step, done
 * at the last step. Pure.
 */
export function stageLabelFor(progress: number, totalSteps: number): BuildStageId | 'done' {
  if (progress >= totalSteps) return 'done';
  const split = stageStepSplit(totalSteps);
  if (progress < split.foundation) return 'foundation';
  if (progress < split.foundation + split.frame) return 'frame';
  return 'finished';
}

/**
 * True when a stage is open for work: the foundation is always
 * open; a later stage opens once the previous stage has STARTED
 * (progress > 0) — so two founders can work two stages of the
 * same building at once (one on the foundation, one on the
 * frame), while a stage never starts before its predecessor.
 * A 0-step stage is open the moment it is reached (it is
 * complete already). Pure.
 */
export function isStageOpen(site: { progress: number; stages?: StageSteps }, totalSteps: number, stageId: BuildStageId): boolean {
  const idx = BUILD_STAGES.indexOf(stageId);
  if (idx <= 0) return true;
  const prev = BUILD_STAGES[idx - 1];
  const split = stageStepSplit(totalSteps);
  if (split[prev] === 0) return true;
  return stageProgressOf(site, totalSteps)[prev] > 0;
}

/** True when a hut site is usable: the state is 'done' and every
 *  stage is complete. A half-built hut has no beds and no sleep.
 *  Pure. */
export function isHutSiteUsable(c: ConstructionState, siteIndex: number): boolean {
  const sites = sitesOf(c);
  const site = sites[siteIndex];
  if (!site || site.state !== 'done') return false;
  const split = stageStepSplit(HUT_WORK_STEPS);
  const steps = stageProgressOf(site, HUT_WORK_STEPS);
  return steps.foundation >= split.foundation && steps.frame >= split.frame && steps.finished >= split.finished;
}

export type HutState = 'none' | 'building' | 'done';

/** One site's progress (0..HUT_WORK_STEPS, 2 wood per step). */
export type SiteState = {
  state: HutState;
  /** Completed work steps, 0..HUT_WORK_STEPS. */
  progress: number;
  /** Wood actually spent on this hut (2 per step). */
  spentWood: number;
  /** Per-stage steps completed (BUILD 1093). Optional: an old
   *  save or literal without it derives the stages from the
   *  total progress (the sequential split). */
  stages?: StageSteps;
};

/**
 * Construction progress (saved in the founders save, v2 — v5 in
 * BUILD 1066). BUILD 1066: the state is a list — one entry per hut
 * site — PLUS a top-level mirror of the ACTIVE site (the first
 * unfinished site; when all are done, the last site). The mirror is
 * what keeps the old single-hut readers working: the sim's M1058
 * asserts construct {state, progress, spentWood} literals with no
 * `sites` at all, the scorer reads `construction.state` /
 * `construction.spentWood`, and the HUD reads the label — all of
 * them mean the ACTIVE site, which is the site the founders are
 * building now. The pure functions below are the only writers, and
 * they always update the mirror together with the site they change,
 * so the two can never drift. `sitesOf` normalizes a state with no
 * `sites` (an old literal or an old save) to a one-site list built
 * from the top-level fields, so old shapes keep working.
 */
export type ConstructionState = {
  /** The ACTIVE site's state (mirror — see the doc above). */
  state: HutState;
  /** The ACTIVE site's completed work steps (mirror). */
  progress: number;
  /** The ACTIVE site's wood spent (mirror). */
  spentWood: number;
  /** One entry per hut site, in HUT_SITES order. */
  sites: SiteState[];
};

/** The per-site list for a construction state (normalized — an old
 *  state with no `sites` is the single site its top-level fields
 *  describe). Pure. */
export function sitesOf(c: ConstructionState): SiteState[] {
  if (Array.isArray((c as { sites?: unknown }).sites) && (c.sites as SiteState[]).length === HUT_SITES.length) {
    return c.sites;
  }
  // BUILD 1096 (0x1F): a SHORT list is an old save (2 sites) — PAD
  // it, preserving the existing entries. The mirror fallback below
  // would LOSE site-1 progress when both huts are done (the mirror
  // is the last site, so site 0 would be "done" and site 1 fresh).
  if (Array.isArray((c as { sites?: unknown }).sites) && (c.sites as SiteState[]).length > 0) {
    const out: SiteState[] = (c.sites as SiteState[]).map((s) => ({ ...s }));
    while (out.length < HUT_SITES.length) out.push({ state: 'none', progress: 0, spentWood: 0 });
    return out;
  }
  // Old shape (no `sites`): site 0 is the top-level fields, the
  // rest are fresh — so an old save that says "hut done" means hut
  // 1 is done and hut 2 is still to build.
  const out: SiteState[] = [{ state: c.state, progress: c.progress, spentWood: c.spentWood }];
  while (out.length < HUT_SITES.length) out.push({ state: 'none', progress: 0, spentWood: 0 });
  return out;
}

/** The mirror fields for a per-site list: the ACTIVE site (the
 *  first unfinished one; when all are done, the last site). Pure. */
export function mirrorFor(sites: SiteState[]): { state: HutState; progress: number; spentWood: number } {
  const active = sites.find((s) => s.state !== 'done') ?? sites[sites.length - 1] ?? { state: 'none' as HutState, progress: 0, spentWood: 0 };
  return { state: active.state, progress: active.progress, spentWood: active.spentWood };
}

/** A construction state from a per-site list (mirror computed). Pure. */
export function constructionFromSites(sites: SiteState[]): ConstructionState {
  return { ...mirrorFor(sites), sites: sites.map((s) => ({ ...s })) };
}

/** The index of the ACTIVE site (the first unfinished one), or null
 *  when every site is done. Pure. */
export function activeSiteIndex(c: ConstructionState): number | null {
  const sites = sitesOf(c);
  const i = sites.findIndex((s) => s.state !== 'done');
  return i >= 0 ? i : null;
}

/** The ACTIVE site's geometry, or null when every site is done. Pure. */
export function activeSite(c: ConstructionState): HutSite | null {
  const i = activeSiteIndex(c);
  return i === null ? null : HUT_SITES[i];
}

/** True when any site is unfinished (there is housing left to
 *  build). Pure. */
export function hasUnfinishedSite(c: ConstructionState): boolean {
  return activeSiteIndex(c) !== null;
}

/**
 * The nearest unfinished site to a position (Manhattan to its
 * approach tile), or null when every site is done. Pure.
 * BUILD 1096 (0x1F): hut-site-2 (worker housing) is SKIPPED while
 * its build gate is closed — it is the nearest unfinished site to
 * camp (approach (120,119), 5 steps) and shadows hut 0 (6 steps),
 * so a founder asking for the nearest site to build gets a site
 * with no build job, the claim returns null, and hut 0 never gets
 * claimed (the 24h run starved: hut 0 a step late at hour 12,
 * capacity 3, no arrival, harvest 14 vs 37). The gate is the same
 * as the job gate in jobs.ts: sites 0+1 done + day >=
 * HOUSING_START_DAY. Without a day the day-half of the gate cannot
 * be evaluated, so only the sites-half applies (a gated site 2 is
 * still skipped while 0+1 are unfinished — the shadowing case).
 */
export function nearestUnfinishedSite(c: ConstructionState, pos: { x: number; y: number }, day?: number): HutSite | null {
  const sites = sitesOf(c);
  // BUILD 1096: worker housing is buildable only once sites 0+1
  // are done and (when the day is known) day >= HOUSING_START_DAY.
  // Without a day the day-half cannot be evaluated, so it is
  // assumed open once 0+1 are done (the shadowing case — 0+1
  // unfinished — is still skipped).
  const site2Open = sites[0] !== undefined && sites[0].state === 'done' && sites[1] !== undefined && sites[1].state === 'done' && (day === undefined || day >= HOUSING_START_DAY);
  let best: HutSite | null = null;
  let bestD = Infinity;
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].state === 'done') continue;
    // BUILD 1096: a gated worker-housing site is not a buildable
    // site — skip it (see above).
    if (i === 2 && !site2Open) continue;
    const d = Math.abs(HUT_SITES[i].approach.x - pos.x) + Math.abs(HUT_SITES[i].approach.y - pos.y);
    if (d < bestD) {
      bestD = d;
      best = HUT_SITES[i];
    }
  }
  return best;
}

/** Housing capacity: beds in completed huts — the SUM of each done
 *  site's sleep tiles (BUILD 1096: hut-site-2 has 4 beds, not 3, so
 *  the per-site count replaces the 3-per-hut multiply). A half-built
 *  house adds nothing. Pure. */
export function housingCapacity(c: ConstructionState): number {
  const sites = sitesOf(c);
  let n = 0;
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].state === 'done') n += HUT_SITES[i].sleepTiles.length;
  }
  return n;
}

/**
 * The FOUNDING huts are done (sites 0+1) — the settlement's core
 * infrastructure gate (BUILD 1096: worker housing is a 3rd site,
 * but the storehouse / bridge / quarry open on the founding huts,
 * the 1095 schedule — they must not wait for worker housing).
 * Pure.
 */
export function foundingHutsDone(c: ConstructionState): boolean {
  const sites = sitesOf(c);
  return sites[0] !== undefined && sites[0].state === 'done' && sites[1] !== undefined && sites[1].state === 'done';
}

/** Fresh construction: nothing started, on any site. */
export function freshConstruction(): ConstructionState {
  return constructionFromSites(HUT_SITES.map(() => ({ state: 'none' as HutState, progress: 0, spentWood: 0, stages: { ...ZERO_STAGE_STEPS } })));
}

/** True when the tile is inside ANY hut rect. */
export function insideHutRect(x: number, y: number): boolean {
  return hutSiteForTile(x, y) !== undefined;
}

/** A hut site's placement exists in the world (a 'house' item on
 *  the site's exact rect — the same check the player-facing lists
 *  use). Pure read. */
export function hutSitePlacementExists(world: IsoWorld, site: HutSite): boolean {
  return (world.placements ?? []).some(
    (p) => p.kind === 'house' && p.x0 === site.rect.x0 && p.y0 === site.rect.y0 && p.x1 === site.rect.x1 && p.y1 === site.rect.y1,
  );
}

/** The hut placement exists in the world (the first hut — the
 *  1058 site). */
export function hutPlacementExists(world: IsoWorld): boolean {
  return hutSitePlacementExists(world, HUT_SITES[0]);
}

/** A hut site's stable id — the id of the 'house' PlacedItem on
 *  the site's rect, or null when no hut placement exists yet. */
export function hutSitePlacementId(world: IsoWorld, site: HutSite): string | null {
  const p = (world.placements ?? []).find(
    (q) => q.kind === 'house' && q.x0 === site.rect.x0 && q.y0 === site.rect.y0 && q.x1 === site.rect.x1 && q.y1 === site.rect.y1,
  );
  return p && typeof p.id === 'string' && p.id.length > 0 ? p.id : null;
}

/**
 * BUILD 1063 (F-1): the hut's stable id — the id of the 'house'
 * PlacedItem on the hut rect, or null when no hut placement exists
 * yet (the hut is not built, or the player removed it). The
 * scheduler's construction jobs name the hut by this id; a rebuild
 * after a removal stamps a NEW placement with a NEW id (a different
 * hut, honestly). Null is also what an old save returns before its
 * first load migration assigns the id.
 */
export function hutPlacementId(world: IsoWorld): string | null {
  const p = (world.placements ?? []).find(
    (q) => q.kind === 'house' && q.x0 === HUT_RECT.x0 && q.y0 === HUT_RECT.y0 && q.x1 === HUT_RECT.x1 && q.y1 === HUT_RECT.y1,
  );
  return p && typeof p.id === 'string' && p.id.length > 0 ? p.id : null;
}

/**
 * Survey the site against the live world: every rect tile must be
 * walkable grass (no water, no tree, no rock) and none of the camp's
 * own tiles may fall inside the rect. Returns the problems (empty =
 * clear). Pure read.
 */
export function hutSiteProblems(world: IsoWorld, site: HutSite = HUT_SITES[0]): string[] {
  const problems: string[] = [];
  const fp = houseFootprint(HUT_KIND, 0);
  if (fp.w !== site.rect.x1 - site.rect.x0 + 1 || fp.d !== site.rect.y1 - site.rect.y0 + 1) {
    problems.push('hut rect does not match the cottage footprint');
  }
  const door = doorForRect(site.rect.x0, site.rect.y0, site.rect.x1, site.rect.y1, 'south');
  if (door.x !== site.door.x || door.y !== site.door.y) problems.push('door is not where the constants say');
  for (let y = site.rect.y0; y <= site.rect.y1; y++) {
    for (let x = site.rect.x0; x <= site.rect.x1; x++) {
      if (terrainAt(world, x, y) === 'water') problems.push(`water@${x},${y}`);
      if ((world.trees ?? []).some((t) => t.tx === x && t.ty === y)) problems.push(`tree@${x},${y}`);
      if ((world.rocks ?? []).some((r) => r.tx === x && r.ty === y)) problems.push(`rock@${x},${y}`);
      if (x === FOUNDER_CAMP.x && y === FOUNDER_CAMP.y) problems.push('on camp centre');
      if (x === FOUNDER_STOCKPILE_TILE.x && y === FOUNDER_STOCKPILE_TILE.y) problems.push('on stockpile');
      if (x === FOUNDER_EAT_TILE.x && y === FOUNDER_EAT_TILE.y) problems.push('on eat tile');
      if (FOUNDER_SLEEP_TILES.some((s) => s.x === x && s.y === y)) problems.push(`on sleep tile ${x},${y}`);
    }
  }
  return problems;
}

/**
 * The cottage warning (PLAN.md §6): the door must be reachable —
 * planPathNpc must succeed from the camp to the approach tile, and
 * from the approach tile to the player spawn (so the player can
 * reach the door too). Returns the step counts, or nulls when a
 * route does not exist. Pure read.
 */
export function hutDoorReachable(world: IsoWorld, site: HutSite = HUT_SITES[0]): { campToApproach: number | null; approachToSpawn: number | null } {
  const toApproach = planPathNpc(world, { x: FOUNDER_CAMP.x, y: FOUNDER_CAMP.y }, site.approach);
  const toSpawn = planPathNpc(world, site.approach, { x: 99, y: 105 });
  return { campToApproach: toApproach ? toApproach.length : null, approachToSpawn: toSpawn ? toSpawn.length : null };
}

/** True when the site is clear AND the door is reachable. */
export function verifyHutSite(world: IsoWorld, site: HutSite = HUT_SITES[0]): { ok: boolean; problems: string[]; campToApproach: number | null; approachToSpawn: number | null } {
  const problems = hutSiteProblems(world, site);
  const reach = hutDoorReachable(world, site);
  if (reach.campToApproach === null) problems.push('no path camp -> door approach');
  if (reach.approachToSpawn === null) problems.push('no path door approach -> player spawn');
  return { ok: problems.length === 0, problems, ...reach };
}

/** True when a founder may start (or continue) building: the hut is
 *  unfinished and the pile holds at least one step's wood. */
/** A hut site at full progress whose placement has not landed yet
 *  (the rect was occupied when the last step completed). The step
 *  spend on such a site returns completed without spending wood, so
 *  the placement retry is free — the site still needs a builder.
 *  BUILD 1087: without this, a ready hut whose placement failed
 *  strands the same way a ready storehouse did (no camp wood, no
 *  build score, no re-claim, the job sits open forever). Pure. */
export function hasReadyHutSite(c: ConstructionState): boolean {
  return sitesOf(c).some((s) => s.state !== 'done' && s.progress >= HUT_WORK_STEPS);
}

export function canBuild(c: ConstructionState, stockpileWood: number): boolean {
  return (c.state !== 'done' && stockpileWood >= HUT_WOOD_PER_STEP) || hasReadyHutSite(c);
}

/**
 * Complete one work step at the site: 2 wood leaves the pile, the
 * progress rises by 1. At the last step the hut is READY (progress
 * 6) but the state stays 'building' — the caller flips it to 'done'
 * only when the placement actually lands (finishConstruction). That
 * is what keeps a blocked completion (someone standing in the rect)
 * from looking like a player removal: reconcileConstruction only
 * resets a 'done' hut, never a ready one. With too little wood, or
 * when the hut is already ready, nothing happens (the caller sends
 * the builder back to chopping, or retries the placement). The hut
 * placement itself is added by the caller only when `completed` is
 * true — the hut never appears without the wood having been spent.
 * Pure.
 */
export function spendBuildStep(
  c: ConstructionState,
  stockpileWood: number,
  siteIndex: number | null = activeSiteIndex(c),
): { construction: ConstructionState; stockpileWood: number; completed: boolean; spent: boolean } {
  const sites = sitesOf(c);
  const i = siteIndex ?? activeSiteIndex(c) ?? 0;
  const site = sites[i] ?? sites[0];
  if (site.state === 'done' || site.progress >= HUT_WORK_STEPS || stockpileWood < HUT_WOOD_PER_STEP) {
    return { construction: c, stockpileWood, completed: site.progress >= HUT_WORK_STEPS, spent: false };
  }
  const progress = site.progress + 1;
  const spentWood = site.spentWood + HUT_WOOD_PER_STEP;
  const completed = progress >= HUT_WORK_STEPS;
  // BUILD 1093: the step lands on the first incomplete stage
  // (foundation -> frame -> finished), so the stage progress is
  // tracked alongside the total. A single builder works the
  // stages in order — the same steps, wood, and ticks as before.
  const cur = currentStageFor(site, HUT_WORK_STEPS);
  const stages = stageProgressOf(site, HUT_WORK_STEPS);
  const nextStages: StageSteps = cur ? { ...stages, [cur.id]: stages[cur.id] + 1 } : stages;
  const next = sites.map((s, j) => (j === i ? { state: 'building' as HutState, progress, spentWood, stages: nextStages } : { ...s }));
  return {
    construction: constructionFromSites(next),
    stockpileWood: stockpileWood - HUT_WOOD_PER_STEP,
    completed,
    spent: true,
  };
};

/**
 * Complete one work step on a SPECIFIC stage, from the
 * registry's camp store: 2 wood is withdrawn, that stage's
 * progress rises by 1 (and the total with it). The stage must
 * be open (its predecessor has started) and incomplete — a
 * locked or finished stage spends nothing. This is the
 * parallel-work primitive: two founders can spend two stages
 * of the same building at once (one on the foundation, one on
 * the frame), each step spending its own stage's materials, so
 * the stage accounting stays conserved per stage. The live
 * tick uses spendBuildStepFromRegistry (first incomplete
 * stage); this is the explicit-stage form. Pure.
 */
export function spendBuildStageStepFromRegistry(
  registry: ResourceRegistry,
  c: ConstructionState,
  siteIndex: number | null,
  stageId: BuildStageId,
): { registry: ResourceRegistry; construction: ConstructionState; completed: boolean; stageCompleted: boolean; spent: boolean } {
  const sites = sitesOf(c);
  const i = siteIndex ?? activeSiteIndex(c) ?? 0;
  const site = sites[i] ?? sites[0];
  const split = stageStepSplit(HUT_WORK_STEPS);
  const stages = stageProgressOf(site, HUT_WORK_STEPS);
  if (site.state === 'done' || site.progress >= HUT_WORK_STEPS || stages[stageId] >= split[stageId] || !isStageOpen(site, HUT_WORK_STEPS, stageId)) {
    return { registry, construction: c, completed: site.progress >= HUT_WORK_STEPS, stageCompleted: stages[stageId] >= split[stageId], spent: false };
  }
  if (storeQty(registry, CAMP_STORE_ID, 'wood') < HUT_WOOD_PER_STEP) {
    return { registry, construction: c, completed: false, stageCompleted: false, spent: false };
  }
  const w = withdrawFrom(registry, CAMP_STORE_ID, 'wood', HUT_WOOD_PER_STEP);
  if (w.taken < HUT_WOOD_PER_STEP) {
    return { registry, construction: c, completed: false, stageCompleted: false, spent: false };
  }
  const nextStages: StageSteps = { ...stages, [stageId]: stages[stageId] + 1 };
  const progress = site.progress + 1;
  const spentWood = site.spentWood + HUT_WOOD_PER_STEP;
  const completed = progress >= HUT_WORK_STEPS;
  const stageCompleted = nextStages[stageId] >= split[stageId];
  const next = sites.map((s, j) => (j === i ? { state: 'building' as HutState, progress, spentWood, stages: nextStages } : { ...s }));
  return {
    registry: w.registry,
    construction: constructionFromSites(next),
    completed,
    stageCompleted,
    spent: true,
  };
};

// --- BUILD 1064 (R-1): the registry as the live-game authority. ---
//
// spendBuildStep above stays for the sim. The live game spends
// through the registry's camp store — the same rule (2 wood leaves
// the pile only when a work step completes), the same guard (too
// little wood, or an already-ready hut, spends nothing), but the
// wood is withdrawn from the one authoritative record, not from a
// plain number ref.

/**
 * Complete one work step at the site from the registry's camp
 * store: 2 wood is withdrawn, the progress rises by 1. At the last
 * step the hut is READY (progress 6) but the state stays
 * 'building' — the caller flips it to 'done' only when the
 * placement actually lands (finishConstruction). With too little
 * wood in the camp store, or when the hut is already ready, nothing
 * happens and nothing is withdrawn (a partial step is never taken).
 * Pure.
 */
export function spendBuildStepFromRegistry(
  registry: ResourceRegistry,
  c: ConstructionState,
  siteIndex: number | null = activeSiteIndex(c),
): { registry: ResourceRegistry; construction: ConstructionState; completed: boolean; spent: boolean } {
  const sites = sitesOf(c);
  const i = siteIndex ?? activeSiteIndex(c) ?? 0;
  const site = sites[i] ?? sites[0];
  if (site.state === 'done' || site.progress >= HUT_WORK_STEPS || storeQty(registry, CAMP_STORE_ID, 'wood') < HUT_WOOD_PER_STEP) {
    return { registry, construction: c, completed: site.progress >= HUT_WORK_STEPS, spent: false };
  }
  const w = withdrawFrom(registry, CAMP_STORE_ID, 'wood', HUT_WOOD_PER_STEP);
  if (w.taken < HUT_WOOD_PER_STEP) {
    // Cannot happen (the guard above read the same store), but a
    // partial withdrawal must never become a partial step — put
    // back what was taken and spend nothing.
    return { registry, construction: c, completed: false, spent: false };
  }
  const progress = site.progress + 1;
  const spentWood = site.spentWood + HUT_WOOD_PER_STEP;
  const completed = progress >= HUT_WORK_STEPS;
  // BUILD 1093: the step lands on the first incomplete stage
  // (foundation -> frame -> finished), so the stage progress is
  // tracked alongside the total. A single builder works the
  // stages in order — the same steps, wood, and ticks as before.
  const cur = currentStageFor(site, HUT_WORK_STEPS);
  const stages = stageProgressOf(site, HUT_WORK_STEPS);
  const nextStages: StageSteps = cur ? { ...stages, [cur.id]: stages[cur.id] + 1 } : stages;
  const next = sites.map((s, j) => (j === i ? { state: 'building' as HutState, progress, spentWood, stages: nextStages } : { ...s }));
  return {
    registry: w.registry,
    construction: constructionFromSites(next),
    completed,
    spent: true,
  };
}

/** Flip a ready site (progress 6) to 'done' once its hut placement
 *  has actually landed. Defaults to the active site. Pure. */
export function finishConstruction(c: ConstructionState, siteIndex: number | null = activeSiteIndex(c)): ConstructionState {
  const sites = sitesOf(c);
  const i = siteIndex ?? activeSiteIndex(c);
  if (i === null || i < 0 || i >= sites.length) return c;
  if (sites[i].state === 'done') return c;
  const next = sites.map((s, j) => (j === i ? { state: 'done' as HutState, progress: HUT_WORK_STEPS, spentWood: HUT_COST_WOOD, stages: { ...stageStepSplit(HUT_WORK_STEPS) } } : { ...s }));
  return constructionFromSites(next);
}

/**
 * Reconcile the two saves: a 'done' construction whose hut placement
 * is gone (the player removed it with Build Remove) resets to
 * 'none' — the founders rebuild from the pile when wood allows, and
 * no free hut ever appears. A 'building' construction with a
 * placement present (should not happen — the placement is added only
 * on completion) is treated as done. Pure.
 */
export function reconcileConstruction(c: ConstructionState, hutPlaced: boolean): ConstructionState {
  // Site 0 only (hutPlaced is the FIRST hut's placement — the
  // signature is the sim's M1058 contract, so it does not change).
  // Sites 1+ are reconciled by reconcileExtraSites (which has the
  // world). Returns the SAME object when nothing changes (the sim
  // asserts reference equality for the unchanged case).
  const sites = sitesOf(c);
  const s0 = sites[0];
  if (s0.state === 'done' && !hutPlaced) {
    const next = sites.map((s, j) => (j === 0 ? { state: 'none' as HutState, progress: 0, spentWood: 0, stages: { ...ZERO_STAGE_STEPS } } : { ...s }));
    return constructionFromSites(next);
  }
  if (s0.state !== 'done' && hutPlaced) {
    const next = sites.map((s, j) => (j === 0 ? { state: 'done' as HutState, progress: HUT_WORK_STEPS, spentWood: HUT_COST_WOOD, stages: { ...stageStepSplit(HUT_WORK_STEPS) } } : { ...s }));
    return constructionFromSites(next);
  }
  return c;
}

/**
 * Reconcile sites 1+ against the world: a 'done' site whose hut
 * placement is gone (the player removed it with Build Remove)
 * resets to 'none' — the founders rebuild it from the pile; a
 * 'building' site with a placement present is treated as done.
 * Site 0 is reconcileConstruction's job (above). Returns the SAME
 * object when nothing changes. Pure.
 */
export function reconcileExtraSites(c: ConstructionState, world: IsoWorld): ConstructionState {
  const sites = sitesOf(c);
  let changed = false;
  const next = sites.map((s, j) => {
    if (j === 0) return s;
    const placed = hutSitePlacementExists(world, HUT_SITES[j]);
    if (s.state === 'done' && !placed) {
      changed = true;
      return { state: 'none' as HutState, progress: 0, spentWood: 0, stages: { ...ZERO_STAGE_STEPS } };
    }
    if (s.state !== 'done' && placed) {
      changed = true;
      return { state: 'done' as HutState, progress: HUT_WORK_STEPS, spentWood: HUT_COST_WOOD, stages: { ...stageStepSplit(HUT_WORK_STEPS) } };
    }
    return s;
  });
  return changed ? constructionFromSites(next) : c;
}

/** Hut progress as a label for the HUD / E reports. One hut:
 *  "3/6", "done", or "—" (the sim's M1058 literals, which have no
 *  `sites`, keep the old label). Two huts: "1 done · 2/6" — the
 *  finished count plus the active site's progress — or "done" when
 *  every site is finished. Pure. */
export function hutProgressLabel(c: ConstructionState): string {
  if (!Array.isArray((c as { sites?: unknown }).sites) || (c.sites as SiteState[]).length !== HUT_SITES.length) {
    if (c.state === 'done') return 'done';
    if (c.state === 'building') return `${c.progress}/${HUT_WORK_STEPS}`;
    return '—';
  }
  const sites = c.sites;
  const done = sites.filter((s) => s.state === 'done').length;
  if (done === sites.length) return 'done';
  const active = sites.find((s) => s.state !== 'done');
  const prog = active ? `${active.progress}/${HUT_WORK_STEPS}` : '—';
  return done > 0 ? `${done} done · ${prog}` : prog;
}

// --- Build-site visual: foundation + frame that grows with progress ---

/** Stone-grey foundation slab. */
export const SITE_FOUNDATION: [number, number, number] = [0.55, 0.55, 0.52];
/** Timber-brown frame. */
export const SITE_FRAME: [number, number, number] = [0.45, 0.32, 0.18];
export const SITE_FRAME_DARK: [number, number, number] = [0.34, 0.24, 0.13];

/**
 * Build-site triangles for the hut rect: a foundation slab (always,
 * while building), corner posts from step 2, wall beams from step 4,
 * roof beams at step 5. At step 6 the real hut placement renders
 * instead, so this returns nothing for a finished hut. A box is a
 * 12-triangle box; faces alternate light/dark for shading (the
 * stockpile-logs precedent). Pure geometry.
 */
export function constructionSiteTrisFor(baseY: number, progress: number, site: HutSite = HUT_SITES[0]): WheatTri[] {
  if (progress >= HUT_WORK_STEPS) return [];
  const out: WheatTri[] = [];
  const pushBox = (cx: number, cz: number, y0: number, len: number, h: number, d: number, col: [number, number, number], dark: [number, number, number]) => {
    const x0 = cx - len / 2, x1 = cx + len / 2;
    const z0 = cz - d / 2, z1 = cz + d / 2;
    const y1 = y0 + h;
    const v: [number, number, number][] = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ];
    const faces: [number, number, number, number, [number, number, number]][] = [
      [4, 5, 6, 7, col],
      [0, 2, 1, 3, dark],
      [0, 1, 5, 4, col],
      [2, 3, 7, 6, dark],
      [1, 2, 6, 5, col],
      [3, 0, 4, 7, dark],
    ];
    for (const [a, b, cc, dd, cl] of faces) {
      out.push({ a: v[a], b: v[b], c: v[cc], col: cl });
      out.push({ a: v[a], b: v[cc], c: v[dd], col: cl });
    }
  };
  const cx = site.rect.x0 + (site.rect.x1 - site.rect.x0 + 1) / 2;
  const cz = site.rect.y0 + (site.rect.y1 - site.rect.y0 + 1) / 2;
  const w = site.rect.x1 - site.rect.x0 + 1;
  const d = site.rect.y1 - site.rect.y0 + 1;
  // Foundation slab covering the rect.
  pushBox(cx, cz, baseY, w - 0.2, 0.1, d - 0.2, SITE_FOUNDATION, SITE_FOUNDATION);
  if (progress >= 2) {
    // Four corner posts.
    const px = [site.rect.x0 + 0.15, site.rect.x1 + 0.85];
    const pz = [site.rect.y0 + 0.15, site.rect.y1 + 0.85];
    for (const x of px) for (const z of pz) pushBox(x, z, baseY + 0.1, 0.14, 0.9, 0.14, SITE_FRAME, SITE_FRAME_DARK);
  }
  if (progress >= 4) {
    // Wall beams along the top of the posts (north + south edges).
    pushBox(cx, site.rect.y0 + 0.15, baseY + 1.0, w - 0.2, 0.12, 0.14, SITE_FRAME, SITE_FRAME_DARK);
    pushBox(cx, site.rect.y1 + 0.85, baseY + 1.0, w - 0.2, 0.12, 0.14, SITE_FRAME, SITE_FRAME_DARK);
  }
  if (progress >= 5) {
    // Roof ridge beam.
    pushBox(cx, cz, baseY + 1.15, w - 0.2, 0.12, 0.14, SITE_FRAME, SITE_FRAME_DARK);
  }
  return out;
}

/**
 * Build-site triangles for EVERY site still building (the view's
 * per-frame fx call): the foundation + frame for each unfinished
 * site at its own rect, so the second hut grows visibly too. A
 * finished site renders its real hut placement instead. Pure.
 */
export function constructionSiteTrisForAll(baseY: number, c: ConstructionState): WheatTri[] {
  const out: WheatTri[] = [];
  const sites = sitesOf(c);
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].state === 'done') continue;
    out.push(...constructionSiteTrisFor(baseY, sites[i].progress, HUT_SITES[i]));
  }
  return out;
}
