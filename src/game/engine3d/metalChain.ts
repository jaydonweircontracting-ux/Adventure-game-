/**
 * BUILD 1095 (0x1E, Phase 3.4): the metal + timber chain —
 * smelter -> ingots -> blacksmith -> tools, sawmill -> timber ->
 * carpenter -> furniture.
 *
 * Ore exists (1081 geology), is mined (1089 mines) and stored
 * (1087 storehouse, R-1 registry). There is no smelting and no
 * tools. This build adds the REAL chain:
 *
 *   iron deposit -> mine -> iron ore (storehouse)
 *   coal deposit -> mine -> coal (storehouse)
 *     -> SMELTER (a founder smelts) -> ingots (storehouse, 20 cap)
 *     -> BLACKSMITH (a founder smiths) -> tools (storehouse, 10 cap)
 *   wood (storehouse)
 *     -> SAWMILL (a founder saws) -> timber (storehouse, 40 cap)
 *     -> CARPENTER (a founder carpenters) -> furniture (storehouse, 10 cap)
 *   tools -> WORKSHOP (the first hard dependency: 12 wood + 2
 *     tools; with 0 tools the site sits unstarted).
 *
 * THE CHAIN IS ONLY AS STRONG AS ITS WEAKEST LINK:
 * - A smelter with NO worker produces nothing (smeltOreToIngots
 *   takes workerPresent — false means no ingots, ever).
 * - A smelter with a worker but NO ore or NO coal produces
 *   nothing (iron < 1 or coal < 1 means no smelt).
 * - A blacksmith with NO worker produces nothing; with a worker
 *   but NO ingots produces nothing (same shape).
 * - A sawmill with NO worker produces nothing; with a worker but
 *   NO wood produces nothing. A carpenter with NO worker produces
 *   nothing; with a worker but NO timber produces nothing.
 * - TOOLS AS A REAL INPUT: the workshop costs 12 wood + 2
 *   tools. The tools are spent on the foundation step (progress
 *   0) and the frame step (progress 2) — a lump gate, not a
 *   per-step divisible material (stagePlanFor throws when a
 *   material does not divide evenly by the step count, and 2
 *   tools / 6 steps does not divide). With 0 tools the workshop
 *   sits at progress 0; with 1 tool it does step 1 then stalls
 *   at progress 2; with 2 tools it completes. The stall is
 *   visible (workshopStallReason names the missing input for the
 *   HUD / Control Center) and reported (the probe log + the
 *   report name the stalled site and the missing input).
 *
 * MATERIALS CONSERVE (R-1): ore + coal -> ingots -> tools and
 * wood -> timber -> furniture are conserved across every smelt,
 * smith, saw, and carpenter call. Smelt: 1 ore + 1 coal -> 1
 * ingot. Smith: 2 ingots -> 1 tool. Saw: 2 wood -> 2 timber
 * (1:1). Carpenter: 2 timber -> 1 furniture. No free ingots, no
 * free tools, no free timber, no free furniture. Every output
 * has a cap (ingots 20, tools 10, timber 40, furniture 10, in
 * storehouse.ts — the storehouse is the settlement's material
 * store, so the chain outputs live there beside the ore, coal,
 * and wood); production stops at the cap, and the inputs for a
 * capped output are left in the store.
 *
 * CONSTRUCTION — the smelter, blacksmith, sawmill, carpenter,
 * and workshop are catalogue entries (B resource/production:
 * Smelter, Blacksmith, Sawmill, Carpenter, Workshop — see
 * buildingCatalogue.ts) and they are built through the STAGED
 * construction path (0x1C) — foundation -> frame -> finished,
 * materials delivered per stage, half-built unusable. There is
 * no second construction path. The four chain buildings each
 * cost 6 wood (6 steps x 1 wood, stages 2/2/2, per-stage 2
 * wood) — wood-only, so the chain's bottleneck is the INPUTS
 * (ore, coal, wood, timber), not construction material. The
 * workshop costs 12 wood + 2 tools (6 steps x 2 wood, tools on
 * steps 1 and 3). The foundry and the forge stay locked — they
 * are later upgrades (the foundry upgrades the smelter, the
 * forge is the blacksmith's hearth), not part of this build.
 * Each building stamps a real placement when it finishes (a
 * 'house' placement on its exact rect — there is no new palette
 * kind, and this build does not invent one). A player-placed
 * smithy does NOT smith — smithing is tied to the founder-built
 * blacksmith site (this module's state), out of scope for this
 * build.
 *
 * SITES (surveyed on the real fresh world, verify1095 survey):
 * - Smelter: north of the storehouse, clear of hut 0's approach
 *   (128,122) and of the storehouse rect (122..126 x 123..126) —
 *   the smelter rect starts at y=111 so the storehouse's north
 *   wall stays clear — clear of every tree/rock/river. Centre
 *   (124,112), rect 123..125 x 111..113, door south (124,113),
 *   approach (124,114). Camp -> approach is 6 steps.
 * - Blacksmith: west of the storehouse, clear of hut 1
 *   (126..129 x 119..121) and of the well (121,120) — the
 *   blacksmith rect ends at x=113 so the well stays clear —
 *   clear of every tree/rock/river. Centre (112,118), rect
 *   111..113 x 117..119, door south (112,119), approach
 *   (112,120). Camp -> approach is 14 steps. BUILD 1095 (the
 *   week-run fix): the site was (118,118) but the town's
 *   EXISTING smithy already stands there — a 'house' with
 *   variant 'smith' at 116,116..120,119 in the world template —
 *   so validatePlacement refused the chain blacksmith as
 *   "something you already placed" and it sat at 6/6 'building'
 *   for three days, never 'done', so no tools and no workshop.
 *   The site moves 6 tiles west to the free 3x3 at (112,118)
 *   (probed clear on the day-5 sim world); the stamp is a 3x3
 *   'house', not the 5x4 'house-smith' town kind (that rect
 *   would hit the market stall at (114,116)).
 * - Sawmill: southwest of the storehouse, clear of the well
 *   (121,120) and of the lumber rect (130..141 x 120..131) —
 *   the sawmill rect ends at x=119 so the lumber rect stays
 *   clear — clear of every tree/rock/river. Centre (118,124),
 *   rect 117..119 x 123..125, door south (118,125), approach
 *   (118,126). Camp -> approach is 12 steps.
 * - Carpenter: northeast of the storehouse, clear of hut 0
 *   (126..129 x 119..121) and of the smelter rect (123..125 x
 *   111..113) — the carpenter rect starts at x=129 so the
 *   smelter's east wall stays clear — clear of every
 *   tree/rock/river. Centre (130,112), rect 129..131 x 111..113,
 *   door south (130,113), approach (130,114). Camp -> approach
 *   is 12 steps.
 * - Workshop: south of the storehouse, clear of the mill rect
 *   (123..125 x 128..130) and of the bakery rect (128..130 x
 *   124..126) — the workshop rect ends at x=121 so the mill's
 *   west wall stays clear — clear of every tree/rock/river.
 *   Centre (120,132), rect 119..121 x 131..133, door south
 *   (120,133), approach (120,134). Camp -> approach is 18 steps.
 *
 * WORK: smelting/smithing/sawing/carpentry are J-1 jobs ('smelt'
 * | 'smith' | 'saw' | 'carpenter', see jobs.ts) — one worker per
 * building at a time (the smeltTaken / smithTaken / sawTaken /
 * carpenterTaken guard, mirroring mineTaken). The founder walks
 * to the building (workStates 'toSmelter'/'smelting',
 * 'toSmith'/'smithing', 'toSawmill'/'sawing',
 * 'toCarpenter'/'carpentering', see founders.ts), works a 3-tick
 * shift (SMELT_TICKS_PER_SHIFT / SMITH_TICKS_PER_SHIFT /
 * SAW_TICKS_PER_SHIFT / CARPENTER_TICKS_PER_SHIFT, mirroring
 * FOUNDER_MINE_TICKS), produces per tick, the job completes,
 * and the founder returns to 'toTree'. The scorer (utility.ts)
 * claims a chain job when the building is finished and there is
 * input to process.
 *
 * SAVE: the chain state + the storehouse coal/ingot/tool/timber/
 * furniture counts ride in the versioned founders save
 * (ag-3d-founders-v1, v12 — NO version move; the metalChain
 * state + the five store fields are compatible fields defaulted
 * when absent, the 1093 'stages' precedent). The chain
 * placements ride in the world save (w.placements, via
 * saveWorld), like the hut. If the player removes a chain
 * building with Build Remove, reconcileMetalChain resets it to
 * 'none' and the founders rebuild from the pile when the inputs
 * allow — no free smelter, no free blacksmith.
 *
 * Pure module (no React, no WebGL, no localStorage in the pure
 * functions) so the sim and the standalone asserts can import it
 * directly.
 */

import {
  stagePlanFor,
  stageStepSplit,
  stageProgressOf,
  currentStageFor,
  type HutSite,
  type StageSteps,
  type StagePlan,
  type StagePlanEntry,
  type BuildStageId,
} from './construction';
import {
  CAMP_STORE_ID,
  depositInto,
  storeQty,
  withdrawFrom,
  type ResourceRegistry,
} from './resourceRegistry';
import {
  STOREHOUSE_APPROACH,
  STOREHOUSE_STORE_ID,
  STOREHOUSE_CAPACITY_INGOT,
  STOREHOUSE_CAPACITY_TOOL,
  STOREHOUSE_CAPACITY_TIMBER,
  STOREHOUSE_CAPACITY_FURNITURE,
} from './storehouse';
import type { IsoWorld } from '../iso/isoWorld';

/** The smelter's stable site id — the build job's target. */
export const SMELTER_SITE_ID = 'smelter-site';
/** The blacksmith's stable site id — the build job's target. */
export const BLACKSMITH_SITE_ID = 'blacksmith-site';
/** The sawmill's stable site id — the build job's target. */
export const SAWMILL_SITE_ID = 'sawmill-site';
/** The carpenter's stable site id — the build job's target. */
export const CARPENTER_SITE_ID = 'carpenter-site';
/** The workshop's stable site id — the build job's target. */
export const WORKSHOP_SITE_ID = 'workshop-site';

/** The smelter's centre tile (surveyed). */
export const SMELTER_CENTRE = { x: 124, y: 112 } as const;
/** The smelter's footprint rect (surveyed, 3x3). */
export const SMELTER_RECT = { x0: 123, y0: 111, x1: 125, y1: 113 } as const;
/** The smelter's door tile (south edge). */
export const SMELTER_DOOR = { x: 124, y: 113 } as const;
/** The smelter's approach tile (one south of the door). */
export const SMELTER_APPROACH = { x: 124, y: 114 } as const;

/** The blacksmith's centre tile (surveyed). */
export const BLACKSMITH_CENTRE = { x: 112, y: 118 } as const;
/** The blacksmith's footprint rect (surveyed, 3x3). */
export const BLACKSMITH_RECT = { x0: 111, y0: 117, x1: 113, y1: 119 } as const;
/** The blacksmith's door tile (south edge). */
export const BLACKSMITH_DOOR = { x: 112, y: 119 } as const;
/** The blacksmith's approach tile (one south of the door). */
export const BLACKSMITH_APPROACH = { x: 112, y: 120 } as const;

/** The sawmill's centre tile (surveyed). */
export const SAWMILL_CENTRE = { x: 118, y: 124 } as const;
/** The sawmill's footprint rect (surveyed, 3x3). */
export const SAWMILL_RECT = { x0: 117, y0: 123, x1: 119, y1: 125 } as const;
/** The sawmill's door tile (south edge). */
export const SAWMILL_DOOR = { x: 118, y: 125 } as const;
/** The sawmill's approach tile (one south of the door). */
export const SAWMILL_APPROACH = { x: 118, y: 126 } as const;

/** The carpenter's centre tile (surveyed). */
export const CARPENTER_CENTRE = { x: 130, y: 112 } as const;
/** The carpenter's footprint rect (surveyed, 3x3). */
export const CARPENTER_RECT = { x0: 129, y0: 111, x1: 131, y1: 113 } as const;
/** The carpenter's door tile (south edge). */
export const CARPENTER_DOOR = { x: 130, y: 113 } as const;
/** The carpenter's approach tile (one south of the door). */
export const CARPENTER_APPROACH = { x: 130, y: 114 } as const;

/** The workshop's centre tile (surveyed). */
export const WORKSHOP_CENTRE = { x: 120, y: 132 } as const;
/** The workshop's footprint rect (surveyed, 3x3). */
export const WORKSHOP_RECT = { x0: 119, y0: 131, x1: 121, y1: 133 } as const;
/** The workshop's door tile (south edge). */
export const WORKSHOP_DOOR = { x: 120, y: 133 } as const;
/** The workshop's approach tile (one south of the door). */
export const WORKSHOP_APPROACH = { x: 120, y: 134 } as const;

/** The smelter as a HutSite — the renderer's build-site fx draws
 *  the half-built stage geometry from this (the storehouse's
 *  STOREHOUSE_HUT_SITE pattern). No sleep tiles: nobody sleeps
 *  in the smelter. */
export const SMELTER_HUT_SITE: HutSite = {
  id: SMELTER_SITE_ID,
  centre: { ...SMELTER_CENTRE },
  rect: { ...SMELTER_RECT },
  door: { ...SMELTER_DOOR },
  approach: { ...SMELTER_APPROACH },
  sleepTiles: [],
};

/** The blacksmith as a HutSite — same pattern as the smelter. */
export const BLACKSMITH_HUT_SITE: HutSite = {
  id: BLACKSMITH_SITE_ID,
  centre: { ...BLACKSMITH_CENTRE },
  rect: { ...BLACKSMITH_RECT },
  door: { ...BLACKSMITH_DOOR },
  approach: { ...BLACKSMITH_APPROACH },
  sleepTiles: [],
};

/** The sawmill as a HutSite — same pattern as the smelter. */
export const SAWMILL_HUT_SITE: HutSite = {
  id: SAWMILL_SITE_ID,
  centre: { ...SAWMILL_CENTRE },
  rect: { ...SAWMILL_RECT },
  door: { ...SAWMILL_DOOR },
  approach: { ...SAWMILL_APPROACH },
  sleepTiles: [],
};

/** The carpenter as a HutSite — same pattern as the smelter. */
export const CARPENTER_HUT_SITE: HutSite = {
  id: CARPENTER_SITE_ID,
  centre: { ...CARPENTER_CENTRE },
  rect: { ...CARPENTER_RECT },
  door: { ...CARPENTER_DOOR },
  approach: { ...CARPENTER_APPROACH },
  sleepTiles: [],
};

/** The workshop as a HutSite — same pattern as the smelter. */
export const WORKSHOP_HUT_SITE: HutSite = {
  id: WORKSHOP_SITE_ID,
  centre: { ...WORKSHOP_CENTRE },
  rect: { ...WORKSHOP_RECT },
  door: { ...WORKSHOP_DOOR },
  approach: { ...WORKSHOP_APPROACH },
  sleepTiles: [],
};

/** Work steps to build the smelter (6 steps x 1 wood = 6 wood). */
export const SMELTER_WORK_STEPS = 6;
/** Wood spent per smelter work step. */
export const SMELTER_WOOD_PER_STEP = 1;
/** Total wood to build the smelter. */
export const SMELTER_COST_WOOD = SMELTER_WORK_STEPS * SMELTER_WOOD_PER_STEP;

/** Work steps to build the blacksmith (6 steps x 1 wood = 6 wood). */
export const BLACKSMITH_WORK_STEPS = 6;
/** Wood spent per blacksmith work step. */
export const BLACKSMITH_WOOD_PER_STEP = 1;
/** Total wood to build the blacksmith. */
export const BLACKSMITH_COST_WOOD = BLACKSMITH_WORK_STEPS * BLACKSMITH_WOOD_PER_STEP;

/** Work steps to build the sawmill (6 steps x 1 wood = 6 wood). */
export const SAWMILL_WORK_STEPS = 6;
/** Wood spent per sawmill work step. */
export const SAWMILL_WOOD_PER_STEP = 1;
/** Total wood to build the sawmill. */
export const SAWMILL_COST_WOOD = SAWMILL_WORK_STEPS * SAWMILL_WOOD_PER_STEP;

/** Work steps to build the carpenter (6 steps x 1 wood = 6 wood). */
export const CARPENTER_WORK_STEPS = 6;
/** Wood spent per carpenter work step. */
export const CARPENTER_WOOD_PER_STEP = 1;
/** Total wood to build the carpenter. */
export const CARPENTER_COST_WOOD = CARPENTER_WORK_STEPS * CARPENTER_WOOD_PER_STEP;

/** Work steps to build the workshop (6 steps x 2 wood = 12 wood). */
export const WORKSHOP_WORK_STEPS = 6;
/** Wood spent per workshop work step. */
export const WORKSHOP_WOOD_PER_STEP = 2;
/** Total wood to build the workshop. */
export const WORKSHOP_COST_WOOD = WORKSHOP_WORK_STEPS * WORKSHOP_WOOD_PER_STEP;
/** Total tools to build the workshop. */
export const WORKSHOP_COST_TOOLS = 2;
/** The 0-indexed progress values where a workshop step spends a
 *  tool (foundation step 1 + frame step 1 — the lump gate). */
export const WORKSHOP_TOOL_STEPS: readonly number[] = [0, 2];

/** Ore smelted per smelt tick (one batch). */
export const SMELT_ORE_PER_BATCH = 1;
/** Coal burned per smelt tick (one batch). */
export const SMELT_COAL_PER_BATCH = 1;
/** Ingots made per smelt tick (1 ore + 1 coal -> 1 ingot). */
export const SMELT_INGOT_PER_BATCH = 1;
/** Ingots smithied per tool (2 ingots -> 1 tool). */
export const SMITH_INGOT_PER_TOOL = 2;
/** Wood sawn per saw tick (one batch). */
export const SAW_WOOD_PER_BATCH = 2;
/** Timber made per saw tick (2 wood -> 2 timber, 1:1). */
export const SAW_TIMBER_PER_BATCH = 2;
/** Timber carpentered per furniture (2 timber -> 1 furniture). */
export const CARPENTER_TIMBER_PER_BATCH = 2;
/** Furniture made per carpenter tick (2 timber -> 1 furniture). */
export const CARPENTER_FURNITURE_PER_BATCH = 1;
/** Ticks in one smelting shift (mirrors FOUNDER_MINE_TICKS). */
export const SMELT_TICKS_PER_SHIFT = 3;
/** Ticks in one smithing shift. */
export const SMITH_TICKS_PER_SHIFT = 3;
/** Ticks in one sawing shift. */
export const SAW_TICKS_PER_SHIFT = 3;
/** Ticks in one carpentry shift. */
export const CARPENTER_TICKS_PER_SHIFT = 3;
/** The smelter site opens once this much iron has landed. */
export const SMELTER_START_IRON = 1;

// --- State ---

export type MetalChainSiteKind = 'none' | 'building' | 'done';

/** One metal-chain building's construction progress (saved in
 *  the founders save, v12 — the same shape as one food-chain
 *  site, wood-only except the workshop, which also spends
 *  tools). */
export type MetalChainSiteState = {
  state: MetalChainSiteKind;
  /** Completed work steps, 0..6. */
  progress: number;
  /** Wood actually spent on this building (1 per step, 2 for the
   *  workshop). */
  spentWood: number;
  /** Tools actually spent on this building (0 except the
   *  workshop, 1 per tool step). */
  spentTools: number;
  /** Per-stage steps completed (BUILD 1093). Optional: an old
   *  save without it derives the stages from the total progress. */
  stages?: StageSteps;
};

/** The smelter + the blacksmith + the sawmill + the carpenter +
 *  the workshop (saved in the founders save, v12). */
export type MetalChainState = {
  smelter: MetalChainSiteState;
  blacksmith: MetalChainSiteState;
  sawmill: MetalChainSiteState;
  carpenter: MetalChainSiteState;
  workshop: MetalChainSiteState;
};

function freshSite(totalSteps: number): MetalChainSiteState {
  return { state: 'none', progress: 0, spentWood: 0, spentTools: 0, stages: stageProgressOf({ progress: 0 }, totalSteps) };
}

/** A fresh metal chain — nothing built. Pure. */
export function freshMetalChain(): MetalChainState {
  return {
    smelter: freshSite(SMELTER_WORK_STEPS),
    blacksmith: freshSite(BLACKSMITH_WORK_STEPS),
    sawmill: freshSite(SAWMILL_WORK_STEPS),
    carpenter: freshSite(CARPENTER_WORK_STEPS),
    workshop: freshSite(WORKSHOP_WORK_STEPS),
  };
}

// --- Stage plans (0x1C: foundation -> frame -> finished) ---

/** The smelter's stage plan: 6 steps / 6 wood -> 3x (2 steps, 2 wood). Pure. */
export function smelterStagePlan(): StagePlan {
  return stagePlanFor(SMELTER_WORK_STEPS, [{ resource: 'wood', qty: SMELTER_WOOD_PER_STEP * SMELTER_WORK_STEPS }]);
}

/** The blacksmith's stage plan: 6 steps / 6 wood -> 3x (2 steps, 2 wood). Pure. */
export function blacksmithStagePlan(): StagePlan {
  return stagePlanFor(BLACKSMITH_WORK_STEPS, [{ resource: 'wood', qty: BLACKSMITH_WOOD_PER_STEP * BLACKSMITH_WORK_STEPS }]);
}

/** The sawmill's stage plan: 6 steps / 6 wood -> 3x (2 steps, 2 wood). Pure. */
export function sawmillStagePlan(): StagePlan {
  return stagePlanFor(SAWMILL_WORK_STEPS, [{ resource: 'wood', qty: SAWMILL_WOOD_PER_STEP * SAWMILL_WORK_STEPS }]);
}

/** The carpenter's stage plan: 6 steps / 6 wood -> 3x (2 steps, 2 wood). Pure. */
export function carpenterStagePlan(): StagePlan {
  return stagePlanFor(CARPENTER_WORK_STEPS, [{ resource: 'wood', qty: CARPENTER_WOOD_PER_STEP * CARPENTER_WORK_STEPS }]);
}

/**
 * The workshop's stage plan: 6 steps / 12 wood + 2 tools ->
 * foundation (2 steps, 4 wood + 1 tool), frame (2 steps, 4 wood
 * + 1 tool), finished (2 steps, 4 wood). Built by hand, not by
 * stagePlanFor: 2 tools / 6 steps does not divide evenly, so
 * stagePlanFor throws — the tools are a lump gate on steps 1
 * and 3, not a per-step divisible material. Pure.
 */
export function workshopStagePlan(): StagePlan {
  const stages: StagePlanEntry[] = [
    { id: 'foundation' as BuildStageId, steps: 2, materials: [{ resource: 'wood', qty: 4 }, { resource: 'tools', qty: 1 }] },
    { id: 'frame' as BuildStageId, steps: 2, materials: [{ resource: 'wood', qty: 4 }, { resource: 'tools', qty: 1 }] },
    { id: 'finished' as BuildStageId, steps: 2, materials: [{ resource: 'wood', qty: 4 }] },
  ];
  return { stages };
}

// --- Gates ---

/** True when a chain building is ready for its placement
 *  (progress 6, still 'building' — the caller flips it to
 *  'done' only when the placement actually lands, the same
 *  ready/done split as the hut and the storehouse). Pure. */
function chainSiteReadyForPlacement(site: MetalChainSiteState, totalSteps: number): boolean {
  return site.state === 'building' && site.progress >= totalSteps;
}

/** True when the smelter is ready for its placement. Pure. */
export function smelterReadyForPlacement(metalChain: MetalChainState): boolean {
  return chainSiteReadyForPlacement(metalChain.smelter, SMELTER_WORK_STEPS);
}

/** True when the blacksmith is ready for its placement. Pure. */
export function blacksmithReadyForPlacement(metalChain: MetalChainState): boolean {
  return chainSiteReadyForPlacement(metalChain.blacksmith, BLACKSMITH_WORK_STEPS);
}

/** True when the sawmill is ready for its placement. Pure. */
export function sawmillReadyForPlacement(metalChain: MetalChainState): boolean {
  return chainSiteReadyForPlacement(metalChain.sawmill, SAWMILL_WORK_STEPS);
}

/** True when the carpenter is ready for its placement. Pure. */
export function carpenterReadyForPlacement(metalChain: MetalChainState): boolean {
  return chainSiteReadyForPlacement(metalChain.carpenter, CARPENTER_WORK_STEPS);
}

/** True when the workshop is ready for its placement. Pure. */
export function workshopReadyForPlacement(metalChain: MetalChainState): boolean {
  return chainSiteReadyForPlacement(metalChain.workshop, WORKSHOP_WORK_STEPS);
}

/** True when a founder may start (or continue) building the
 *  smelter: it is unfinished and the first iron has landed
 *  (there is something to smelt — a smelter with no ore is a
 *  shed) and the camp pile holds a step's wood. The iron gate
 *  lives here (the claim site); the per-step gate is
 *  canBuildSmelter. Pure. */
export function canStartSmelter(metalChain: MetalChainState, storehouseIron: number, campWood: number): boolean {
  return (
    smelterReadyForPlacement(metalChain) ||
    (metalChain.smelter.state !== 'done' &&
      metalChain.smelter.progress < SMELTER_WORK_STEPS &&
      storehouseIron >= SMELTER_START_IRON &&
      campWood >= SMELTER_WOOD_PER_STEP)
  );
}

/** True when a founder may start (or continue) building the
 *  blacksmith: it is unfinished, the smelter is DONE (the
 *  blacksmith needs ingots, and ingots only come from the
 *  smelter), and the camp pile holds a step's wood. Pure. */
export function canStartBlacksmith(metalChain: MetalChainState, campWood: number): boolean {
  return (
    blacksmithReadyForPlacement(metalChain) ||
    (metalChain.blacksmith.state !== 'done' &&
      metalChain.blacksmith.progress < BLACKSMITH_WORK_STEPS &&
      metalChain.smelter.state === 'done' &&
      campWood >= BLACKSMITH_WOOD_PER_STEP)
  );
}

/** True when a founder may start (or continue) building the
 *  sawmill: it is unfinished, the storehouse is DONE (the
 *  sawmill draws its wood from the storehouse store), and the
 *  camp pile holds a step's wood. Pure. */
export function canStartSawmill(metalChain: MetalChainState, storehouseDone: boolean, campWood: number): boolean {
  return (
    sawmillReadyForPlacement(metalChain) ||
    (metalChain.sawmill.state !== 'done' &&
      metalChain.sawmill.progress < SAWMILL_WORK_STEPS &&
      storehouseDone &&
      campWood >= SAWMILL_WOOD_PER_STEP)
  );
}

/** True when a founder may start (or continue) building the
 *  carpenter: it is unfinished, the sawmill is DONE (the
 *  carpenter needs timber, and timber only comes from the
 *  sawmill), and the camp pile holds a step's wood. Pure. */
export function canStartCarpenter(metalChain: MetalChainState, campWood: number): boolean {
  return (
    carpenterReadyForPlacement(metalChain) ||
    (metalChain.carpenter.state !== 'done' &&
      metalChain.carpenter.progress < CARPENTER_WORK_STEPS &&
      metalChain.sawmill.state === 'done' &&
      campWood >= CARPENTER_WOOD_PER_STEP)
  );
}

/** True when a workshop step spends a tool (the lump gate:
 *  foundation step 1 + frame step 1). Pure. */
export function workshopStepNeedsTool(progress: number): boolean {
  return WORKSHOP_TOOL_STEPS.includes(progress);
}

/** True when a founder may start (or continue) building the
 *  workshop: it is unfinished, the bakery is DONE (the workshop
 *  is the settlement's next building after the food chain), the
 *  camp pile holds a step's wood, and — when the next step is a
 *  tool step — the storehouse holds a tool. With 0 tools the
 *  site sits unstarted: the stall, by design. Pure. */
export function canStartWorkshop(metalChain: MetalChainState, bakeryDone: boolean, campWood: number, storehouseTools: number): boolean {
  return (
    workshopReadyForPlacement(metalChain) ||
    (metalChain.workshop.state !== 'done' &&
      metalChain.workshop.progress < WORKSHOP_WORK_STEPS &&
      bakeryDone &&
      campWood >= WORKSHOP_WOOD_PER_STEP &&
      (!workshopStepNeedsTool(metalChain.workshop.progress) || storehouseTools >= 1))
  );
}

/** True when a founder may do a smelter work step: it is
 *  unfinished and the camp pile holds a step's wood. The iron
 *  gate lives in canStartSmelter (the claim site); this is the
 *  per-step gate (the hut's canBuild shape). Pure. */
export function canBuildSmelter(metalChain: MetalChainState, campWood: number): boolean {
  return (
    smelterReadyForPlacement(metalChain) ||
    (metalChain.smelter.state !== 'done' &&
      metalChain.smelter.progress < SMELTER_WORK_STEPS &&
      campWood >= SMELTER_WOOD_PER_STEP)
  );
}

/** True when a founder may do a blacksmith work step. Pure. */
export function canBuildBlacksmith(metalChain: MetalChainState, campWood: number): boolean {
  return (
    blacksmithReadyForPlacement(metalChain) ||
    (metalChain.blacksmith.state !== 'done' &&
      metalChain.blacksmith.progress < BLACKSMITH_WORK_STEPS &&
      campWood >= BLACKSMITH_WOOD_PER_STEP)
  );
}

/** True when a founder may do a sawmill work step. Pure. */
export function canBuildSawmill(metalChain: MetalChainState, campWood: number): boolean {
  return (
    sawmillReadyForPlacement(metalChain) ||
    (metalChain.sawmill.state !== 'done' &&
      metalChain.sawmill.progress < SAWMILL_WORK_STEPS &&
      campWood >= SAWMILL_WOOD_PER_STEP)
  );
}

/** True when a founder may do a carpenter work step. Pure. */
export function canBuildCarpenter(metalChain: MetalChainState, campWood: number): boolean {
  return (
    carpenterReadyForPlacement(metalChain) ||
    (metalChain.carpenter.state !== 'done' &&
      metalChain.carpenter.progress < CARPENTER_WORK_STEPS &&
      campWood >= CARPENTER_WOOD_PER_STEP)
  );
}

/** True when a founder may do a workshop work step: it is
 *  unfinished, the camp pile holds a step's wood, and — when
 *  the next step is a tool step — the storehouse holds a tool.
 *  The tool gate lives HERE (the per-step gate), not only at
 *  the claim site: a builder who claimed the job while tools
 *  existed must stop when they run out mid-build. Pure. */
export function canBuildWorkshop(metalChain: MetalChainState, campWood: number, storehouseTools: number): boolean {
  return (
    workshopReadyForPlacement(metalChain) ||
    (metalChain.workshop.state !== 'done' &&
      metalChain.workshop.progress < WORKSHOP_WORK_STEPS &&
      campWood >= WORKSHOP_WOOD_PER_STEP &&
      (!workshopStepNeedsTool(metalChain.workshop.progress) || storehouseTools >= 1))
  );
}

/** True when the smelter is finished and usable (all stages
 *  done). A half-built smelter smelts nothing. Pure. */
export function isSmelterUsable(metalChain: MetalChainState): boolean {
  return metalChain.smelter.state === 'done' && metalChain.smelter.progress >= SMELTER_WORK_STEPS;
}

/** True when the blacksmith is finished and usable. Pure. */
export function isBlacksmithUsable(metalChain: MetalChainState): boolean {
  return metalChain.blacksmith.state === 'done' && metalChain.blacksmith.progress >= BLACKSMITH_WORK_STEPS;
}

/** True when the sawmill is finished and usable. Pure. */
export function isSawmillUsable(metalChain: MetalChainState): boolean {
  return metalChain.sawmill.state === 'done' && metalChain.sawmill.progress >= SAWMILL_WORK_STEPS;
}

/** True when the carpenter is finished and usable. Pure. */
export function isCarpenterUsable(metalChain: MetalChainState): boolean {
  return metalChain.carpenter.state === 'done' && metalChain.carpenter.progress >= CARPENTER_WORK_STEPS;
}

/** True when the workshop is finished and usable. Pure. */
export function isWorkshopUsable(metalChain: MetalChainState): boolean {
  return metalChain.workshop.state === 'done' && metalChain.workshop.progress >= WORKSHOP_WORK_STEPS;
}

// --- Construction steps (spend from the camp pile) ---

/**
 * Withdraw build wood for a chain step: the camp pile first, the
 * storehouse store for the remainder. BUILD 1095 (the week-run
 * fix): the camp pile sits at 0 once the storehouse exists —
 * every chopped log is hauled straight to the storehouse by a
 * deliver job, so the pile is a transit point, not a stockpile,
 * and a pile-only withdraw strands every chain build (the first
 * 1095 week run: the blacksmith sat at 4/6 for three days, no
 * tools, no workshop, because the pile never held a step's wood
 * while the storehouse held plenty). The storehouse IS the
 * settlement's wood stockpile (the sawmill already draws its
 * production wood from it), so a chain step draws from it when
 * the pile is short. The total is checked first, so a short
 * total withdraws nothing (no partial step). Pure. BUILD 1096
 * (0x1F): exported — the inn build step (housing.ts) draws the
 * same way (the pile sits at 0 once the storehouse exists).
 */
export function withdrawChainWood(
  registry: ResourceRegistry,
  qty: number,
): { registry: ResourceRegistry; taken: number } {
  const pile = storeQty(registry, CAMP_STORE_ID, 'wood');
  const store = storeQty(registry, STOREHOUSE_STORE_ID, 'wood');
  if (pile + store < qty) return { registry, taken: 0 };
  let next = registry;
  let taken = 0;
  if (pile > 0) {
    const fromPile = withdrawFrom(next, CAMP_STORE_ID, 'wood', Math.min(pile, qty));
    next = fromPile.registry;
    taken += fromPile.taken;
  }
  if (taken < qty) {
    const fromStore = withdrawFrom(next, STOREHOUSE_STORE_ID, 'wood', qty - taken);
    next = fromStore.registry;
    taken += fromStore.taken;
  }
  return { registry: next, taken };
}

function spendChainStepFromRegistry(
  registry: ResourceRegistry,
  metalChain: MetalChainState,
  which: 'smelter' | 'blacksmith' | 'sawmill' | 'carpenter',
  totalSteps: number,
  woodPerStep: number,
): { registry: ResourceRegistry; metalChain: MetalChainState; completed: boolean; spent: boolean } {
  const site = metalChain[which];
  if (site.state === 'done' || site.progress >= totalSteps) {
    return { registry, metalChain, completed: site.progress >= totalSteps, spent: false };
  }
  // BUILD 1095: the wood comes from the pile first, the storehouse
  // for the remainder (see withdrawChainWood — the pile sits at 0
  // once the storehouse exists, so a pile-only spend strands the
  // build). The gate (canBuild*) checks the same total.
  const w = withdrawChainWood(registry, woodPerStep);
  if (w.taken < woodPerStep) {
    return { registry, metalChain, completed: false, spent: false };
  }
  const progress = site.progress + 1;
  const completed = progress >= totalSteps;
  const cur = currentStageFor(site, totalSteps);
  const stages = stageProgressOf(site, totalSteps);
  const nextStages: StageSteps = cur ? { ...stages, [cur.id]: stages[cur.id] + 1 } : stages;
  return {
    registry: w.registry,
    metalChain: {
      ...metalChain,
      [which]: {
        state: 'building' as MetalChainSiteKind,
        progress,
        spentWood: site.spentWood + woodPerStep,
        spentTools: site.spentTools,
        stages: nextStages,
      },
    },
    completed,
    spent: true,
  };
}

/** Complete one work step on the smelter from the registry's camp
 *  store: 1 wood leaves the pile, the progress rises by 1. At
 *  the last step the smelter is READY (progress 6) but the state
 *  stays 'building' — the caller flips it to 'done' only when
 *  the placement actually lands (finishSmelter), the same
 *  ready/done split as the hut and the storehouse. Pure. */
export function spendSmelterStepFromRegistry(
  registry: ResourceRegistry,
  metalChain: MetalChainState,
): { registry: ResourceRegistry; metalChain: MetalChainState; completed: boolean; spent: boolean } {
  return spendChainStepFromRegistry(registry, metalChain, 'smelter', SMELTER_WORK_STEPS, SMELTER_WOOD_PER_STEP);
}

/** Complete one work step on the blacksmith from the registry's
 *  camp store: 1 wood leaves the pile, the progress rises by 1.
 *  Same ready/done split as the smelter. Pure. */
export function spendBlacksmithStepFromRegistry(
  registry: ResourceRegistry,
  metalChain: MetalChainState,
): { registry: ResourceRegistry; metalChain: MetalChainState; completed: boolean; spent: boolean } {
  return spendChainStepFromRegistry(registry, metalChain, 'blacksmith', BLACKSMITH_WORK_STEPS, BLACKSMITH_WOOD_PER_STEP);
}

/** Complete one work step on the sawmill from the registry's camp
 *  store: 1 wood leaves the pile, the progress rises by 1.
 *  Same ready/done split as the smelter. Pure. */
export function spendSawmillStepFromRegistry(
  registry: ResourceRegistry,
  metalChain: MetalChainState,
): { registry: ResourceRegistry; metalChain: MetalChainState; completed: boolean; spent: boolean } {
  return spendChainStepFromRegistry(registry, metalChain, 'sawmill', SAWMILL_WORK_STEPS, SAWMILL_WOOD_PER_STEP);
}

/** Complete one work step on the carpenter from the registry's
 *  camp store: 1 wood leaves the pile, the progress rises by 1.
 *  Same ready/done split as the smelter. Pure. */
export function spendCarpenterStepFromRegistry(
  registry: ResourceRegistry,
  metalChain: MetalChainState,
): { registry: ResourceRegistry; metalChain: MetalChainState; completed: boolean; spent: boolean } {
  return spendChainStepFromRegistry(registry, metalChain, 'carpenter', CARPENTER_WORK_STEPS, CARPENTER_WOOD_PER_STEP);
}

/**
 * Complete one work step on the workshop: 2 wood leave the camp
 * pile, and — on a tool step (progress 0 or 2) — 1 tool leaves
 * the storehouse store. With too little wood, or with no tool
 * on a tool step, nothing happens and nothing is withdrawn (the
 * stall: the site sits at its progress until tools exist). Same
 * ready/done split as the smelter (finishWorkshop flips it to
 * 'done' only when the placement lands). Pure.
 */
export function spendWorkshopStepFromRegistry(
  registry: ResourceRegistry,
  metalChain: MetalChainState,
): { registry: ResourceRegistry; metalChain: MetalChainState; completed: boolean; spent: boolean; spentTools: number } {
  const site = metalChain.workshop;
  if (site.state === 'done' || site.progress >= WORKSHOP_WORK_STEPS) {
    return { registry, metalChain, completed: site.progress >= WORKSHOP_WORK_STEPS, spent: false, spentTools: 0 };
  }
  // BUILD 1095: the wood comes from the pile first, the storehouse
  // for the remainder (see withdrawChainWood — the pile sits at 0
  // once the storehouse exists). The gate (canBuildWorkshop)
  // checks the same total.
  const w = withdrawChainWood(registry, WORKSHOP_WOOD_PER_STEP);
  if (w.taken < WORKSHOP_WOOD_PER_STEP) {
    return { registry, metalChain, completed: false, spent: false, spentTools: 0 };
  }
  const needsTool = workshopStepNeedsTool(site.progress);
  if (needsTool && storeQty(w.registry, STOREHOUSE_STORE_ID, 'tools') < 1) {
    return { registry, metalChain, completed: false, spent: false, spentTools: 0 };
  }
  let next = w.registry;
  let toolSpent = 0;
  if (needsTool) {
    const t = withdrawFrom(next, STOREHOUSE_STORE_ID, 'tools', 1);
    if (t.taken < 1) {
      // Cannot happen (the guard above read the same store), but
      // a partial withdrawal must never become a partial step.
      return { registry, metalChain, completed: false, spent: false, spentTools: 0 };
    }
    next = t.registry;
    toolSpent = 1;
  }
  const progress = site.progress + 1;
  const completed = progress >= WORKSHOP_WORK_STEPS;
  const cur = currentStageFor(site, WORKSHOP_WORK_STEPS);
  const stages = stageProgressOf(site, WORKSHOP_WORK_STEPS);
  const nextStages: StageSteps = cur ? { ...stages, [cur.id]: stages[cur.id] + 1 } : stages;
  return {
    registry: next,
    metalChain: {
      ...metalChain,
      workshop: {
        state: 'building' as MetalChainSiteKind,
        progress,
        spentWood: site.spentWood + WORKSHOP_WOOD_PER_STEP,
        spentTools: site.spentTools + toolSpent,
        stages: nextStages,
      },
    },
    completed,
    spent: true,
    spentTools: toolSpent,
  };
}

function finishChainSite(
  metalChain: MetalChainState,
  which: 'smelter' | 'blacksmith' | 'sawmill' | 'carpenter' | 'workshop',
  totalSteps: number,
  totalWood: number,
  totalTools: number,
): MetalChainState {
  if (metalChain[which].state === 'done') return metalChain;
  return {
    ...metalChain,
    [which]: {
      state: 'done',
      progress: totalSteps,
      spentWood: totalWood,
      spentTools: totalTools,
      stages: { ...stageStepSplit(totalSteps) },
    },
  };
}

/** Flip a ready smelter (progress 6) to 'done' once its placement
 *  has actually landed. Pure. */
export function finishSmelter(metalChain: MetalChainState): MetalChainState {
  return finishChainSite(metalChain, 'smelter', SMELTER_WORK_STEPS, SMELTER_COST_WOOD, 0);
}

/** Flip a ready blacksmith (progress 6) to 'done' once its
 *  placement has actually landed. Pure. */
export function finishBlacksmith(metalChain: MetalChainState): MetalChainState {
  return finishChainSite(metalChain, 'blacksmith', BLACKSMITH_WORK_STEPS, BLACKSMITH_COST_WOOD, 0);
}

/** Flip a ready sawmill (progress 6) to 'done' once its placement
 *  has actually landed. Pure. */
export function finishSawmill(metalChain: MetalChainState): MetalChainState {
  return finishChainSite(metalChain, 'sawmill', SAWMILL_WORK_STEPS, SAWMILL_COST_WOOD, 0);
}

/** Flip a ready carpenter (progress 6) to 'done' once its
 *  placement has actually landed. Pure. */
export function finishCarpenter(metalChain: MetalChainState): MetalChainState {
  return finishChainSite(metalChain, 'carpenter', CARPENTER_WORK_STEPS, CARPENTER_COST_WOOD, 0);
}

/** Flip a ready workshop (progress 6) to 'done' once its
 *  placement has actually landed. Pure. */
export function finishWorkshop(metalChain: MetalChainState): MetalChainState {
  return finishChainSite(metalChain, 'workshop', WORKSHOP_WORK_STEPS, WORKSHOP_COST_WOOD, WORKSHOP_COST_TOOLS);
}

// --- Smelt / smith / saw / carpenter (the chain itself) ---

/** The iron in the storehouse store (0 when it never held any). Pure. */
export function metalChainIronInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, STOREHOUSE_STORE_ID, 'iron');
}

/** The coal in the storehouse store (0 when it never held any). Pure. */
export function metalChainCoalInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, STOREHOUSE_STORE_ID, 'coal');
}

/** The ingots in the storehouse store (0 when it never held any). Pure. */
export function metalChainIngotsInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, STOREHOUSE_STORE_ID, 'ingot');
}

/** The tools in the storehouse store (0 when it never held any). Pure. */
export function metalChainToolsInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, STOREHOUSE_STORE_ID, 'tools');
}

/** The timber in the storehouse store (0 when it never held any). Pure. */
export function metalChainTimberInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, STOREHOUSE_STORE_ID, 'timber');
}

/** The furniture in the storehouse store (0 when it never held any). Pure. */
export function metalChainFurnitureInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, STOREHOUSE_STORE_ID, 'furniture');
}

/**
 * Smelt storehouse iron + coal into ingots: 1 ore + 1 coal -> 1
 * ingot, one batch per call (one smelt tick). Runs ONLY when a
 * founder is working the smelter (workerPresent) — a smelter
 * with no worker produces nothing — and only while there is ore
 * and coal to smelt and room in the ingot store (the cap binds:
 * ingots never exceed STOREHOUSE_CAPACITY_INGOT). Conservative:
 * if the ingot cannot be deposited (the storehouse is capped,
 * so this never happens today), the ore + coal for the
 * un-smelted ingot go back to the storehouse — ore + coal +
 * ingots is constant across the call. Pure.
 */
export function smeltOreToIngots(
  registry: ResourceRegistry,
  workerPresent: boolean,
): { registry: ResourceRegistry; smelted: number; oreUsed: number; coalUsed: number } {
  if (!workerPresent) return { registry, smelted: 0, oreUsed: 0, coalUsed: 0 };
  const iron = storeQty(registry, STOREHOUSE_STORE_ID, 'iron');
  const coal = storeQty(registry, STOREHOUSE_STORE_ID, 'coal');
  const ingots = storeQty(registry, STOREHOUSE_STORE_ID, 'ingot');
  if (iron < SMELT_ORE_PER_BATCH || coal < SMELT_COAL_PER_BATCH || ingots >= STOREHOUSE_CAPACITY_INGOT) {
    return { registry, smelted: 0, oreUsed: 0, coalUsed: 0 };
  }
  const room = STOREHOUSE_CAPACITY_INGOT - ingots;
  const toMake = Math.min(SMELT_INGOT_PER_BATCH, room);
  if (toMake <= 0) return { registry, smelted: 0, oreUsed: 0, coalUsed: 0 };
  const oreToUse = toMake * SMELT_ORE_PER_BATCH;
  const coalToUse = toMake * SMELT_COAL_PER_BATCH;
  const o = withdrawFrom(registry, STOREHOUSE_STORE_ID, 'iron', oreToUse);
  const c = withdrawFrom(o.registry, STOREHOUSE_STORE_ID, 'coal', coalToUse);
  const deposited = depositInto(c.registry, STOREHOUSE_STORE_ID, 'ingot', toMake, { type: 'production', settlementId: 'camp' }, { capacity: STOREHOUSE_CAPACITY_INGOT, location: { ...STOREHOUSE_APPROACH } });
  const made = Math.floor(deposited.added);
  const leftoverOre = o.taken - made * SMELT_ORE_PER_BATCH;
  const leftoverCoal = c.taken - made * SMELT_COAL_PER_BATCH;
  let next = deposited.registry;
  if (leftoverOre > 0) {
    next = depositInto(next, STOREHOUSE_STORE_ID, 'iron', leftoverOre, { type: 'loaded' }).registry;
  }
  if (leftoverCoal > 0) {
    next = depositInto(next, STOREHOUSE_STORE_ID, 'coal', leftoverCoal, { type: 'loaded' }).registry;
  }
  return { registry: next, smelted: made, oreUsed: o.taken - leftoverOre, coalUsed: c.taken - leftoverCoal };
}

/**
 * Smith storehouse ingots into tools: 2 ingots -> 1 tool, one
 * batch per call (one smith tick). Runs ONLY when a founder is
 * working the blacksmith (workerPresent) — a blacksmith with no
 * worker produces nothing — and only while there are ingots to
 * smith and room in the tool store (the cap binds: tools never
 * exceed STOREHOUSE_CAPACITY_TOOL). Conservative: if the tool
 * cannot be deposited, the ingots for the un-smithed tool go
 * back to the storehouse — ingots + 2xtools is constant across
 * the call. Pure.
 */
export function smithIngotsToTools(
  registry: ResourceRegistry,
  workerPresent: boolean,
): { registry: ResourceRegistry; smithed: number; ingotsUsed: number } {
  if (!workerPresent) return { registry, smithed: 0, ingotsUsed: 0 };
  const ingots = storeQty(registry, STOREHOUSE_STORE_ID, 'ingot');
  const tools = storeQty(registry, STOREHOUSE_STORE_ID, 'tools');
  if (ingots < SMITH_INGOT_PER_TOOL || tools >= STOREHOUSE_CAPACITY_TOOL) {
    return { registry, smithed: 0, ingotsUsed: 0 };
  }
  const room = STOREHOUSE_CAPACITY_TOOL - tools;
  const toMake = Math.min(1, room, Math.floor(ingots / SMITH_INGOT_PER_TOOL));
  if (toMake <= 0) return { registry, smithed: 0, ingotsUsed: 0 };
  const ingotsToUse = toMake * SMITH_INGOT_PER_TOOL;
  const withdrawn = withdrawFrom(registry, STOREHOUSE_STORE_ID, 'ingot', ingotsToUse);
  const deposited = depositInto(withdrawn.registry, STOREHOUSE_STORE_ID, 'tools', toMake, { type: 'production', settlementId: 'camp' }, { capacity: STOREHOUSE_CAPACITY_TOOL, location: { ...STOREHOUSE_APPROACH } });
  const made = Math.floor(deposited.added);
  const leftoverIngots = withdrawn.taken - made * SMITH_INGOT_PER_TOOL;
  let next = deposited.registry;
  if (leftoverIngots > 0) {
    next = depositInto(next, STOREHOUSE_STORE_ID, 'ingot', leftoverIngots, { type: 'loaded' }).registry;
  }
  return { registry: next, smithed: made, ingotsUsed: withdrawn.taken - leftoverIngots };
}

/**
 * Saw storehouse wood into timber: 2 wood -> 2 timber, one
 * batch per call (one saw tick). Runs ONLY when a founder is
 * working the sawmill (workerPresent) — a sawmill with no
 * worker produces nothing — and only while there is wood to saw
 * and room in the timber store (the cap binds: timber never
 * exceeds STOREHOUSE_CAPACITY_TIMBER). Conservative: if the
 * timber cannot be deposited, the wood for the un-sawn timber
 * goes back to the storehouse — wood + timber is constant
 * across the call. Pure.
 */
export function sawWoodToTimber(
  registry: ResourceRegistry,
  workerPresent: boolean,
): { registry: ResourceRegistry; sawn: number; woodUsed: number } {
  if (!workerPresent) return { registry, sawn: 0, woodUsed: 0 };
  const wood = storeQty(registry, STOREHOUSE_STORE_ID, 'wood');
  const timber = storeQty(registry, STOREHOUSE_STORE_ID, 'timber');
  if (wood < SAW_WOOD_PER_BATCH || timber >= STOREHOUSE_CAPACITY_TIMBER) {
    return { registry, sawn: 0, woodUsed: 0 };
  }
  const room = STOREHOUSE_CAPACITY_TIMBER - timber;
  const toMake = Math.min(SAW_TIMBER_PER_BATCH, room, wood);
  if (toMake <= 0) return { registry, sawn: 0, woodUsed: 0 };
  const woodToUse = toMake; // 1:1 — 2 wood -> 2 timber.
  const withdrawn = withdrawFrom(registry, STOREHOUSE_STORE_ID, 'wood', woodToUse);
  const deposited = depositInto(withdrawn.registry, STOREHOUSE_STORE_ID, 'timber', toMake, { type: 'production', settlementId: 'camp' }, { capacity: STOREHOUSE_CAPACITY_TIMBER, location: { ...STOREHOUSE_APPROACH } });
  const made = Math.floor(deposited.added);
  const leftoverWood = withdrawn.taken - made;
  let next = deposited.registry;
  if (leftoverWood > 0) {
    next = depositInto(next, STOREHOUSE_STORE_ID, 'wood', leftoverWood, { type: 'loaded' }).registry;
  }
  return { registry: next, sawn: made, woodUsed: withdrawn.taken - leftoverWood };
}

/**
 * Carpenter storehouse timber into furniture: 2 timber -> 1
 * furniture, one batch per call (one carpenter tick). Runs ONLY
 * when a founder is working the carpenter (workerPresent) — a
 * carpenter with no worker produces nothing — and only while
 * there is timber to carpenter and room in the furniture store
 * (the cap binds: furniture never exceeds
 * STOREHOUSE_CAPACITY_FURNITURE). Conservative: if the furniture
 * cannot be deposited, the timber for the un-made furniture goes
 * back to the storehouse — timber + 2xfurniture is constant
 * across the call. Pure.
 */
export function carpenterTimberToFurniture(
  registry: ResourceRegistry,
  workerPresent: boolean,
): { registry: ResourceRegistry; made: number; timberUsed: number } {
  if (!workerPresent) return { registry, made: 0, timberUsed: 0 };
  const timber = storeQty(registry, STOREHOUSE_STORE_ID, 'timber');
  const furniture = storeQty(registry, STOREHOUSE_STORE_ID, 'furniture');
  if (timber < CARPENTER_TIMBER_PER_BATCH || furniture >= STOREHOUSE_CAPACITY_FURNITURE) {
    return { registry, made: 0, timberUsed: 0 };
  }
  const room = STOREHOUSE_CAPACITY_FURNITURE - furniture;
  const toMake = Math.min(CARPENTER_FURNITURE_PER_BATCH, room, Math.floor(timber / CARPENTER_TIMBER_PER_BATCH));
  if (toMake <= 0) return { registry, made: 0, timberUsed: 0 };
  const timberToUse = toMake * CARPENTER_TIMBER_PER_BATCH;
  const withdrawn = withdrawFrom(registry, STOREHOUSE_STORE_ID, 'timber', timberToUse);
  const deposited = depositInto(withdrawn.registry, STOREHOUSE_STORE_ID, 'furniture', toMake, { type: 'production', settlementId: 'camp' }, { capacity: STOREHOUSE_CAPACITY_FURNITURE, location: { ...STOREHOUSE_APPROACH } });
  const made = Math.floor(deposited.added);
  const leftoverTimber = withdrawn.taken - made * CARPENTER_TIMBER_PER_BATCH;
  let next = deposited.registry;
  if (leftoverTimber > 0) {
    next = depositInto(next, STOREHOUSE_STORE_ID, 'timber', leftoverTimber, { type: 'loaded' }).registry;
  }
  return { registry: next, made, timberUsed: withdrawn.taken - leftoverTimber };
}

// --- Validate / reconcile / labels ---

/**
 * Validate a saved metal-chain state (the founders-save load
 * path): a corrupt / missing / partial value falls back to a
 * fresh chain (nothing started). A 'done' building is pinned
 * to full progress and full cost; a 'none' building is pinned
 * to 0. The per-stage progress is kept when valid (it sums to
 * the total); an old save without it derives the stages from
 * the total (the sequential split, the 1093 storehouse
 * pattern). Pure.
 */
export function validateMetalChainState(value: unknown): MetalChainState {
  if (!value || typeof value !== 'object') return freshMetalChain();
  const v = value as Record<string, unknown>;
  const validateSite = (raw: unknown, totalSteps: number, totalWood: number, totalTools: number): MetalChainSiteState => {
    if (!raw || typeof raw !== 'object') return freshSite(totalSteps);
    const s = raw as Record<string, unknown>;
    const state = s.state === 'building' || s.state === 'done' ? (s.state as MetalChainSiteKind) : 'none';
    let progress = Math.max(0, Math.min(totalSteps, Math.round(Number(s.progress) || 0)));
    let spentWood = Math.max(0, Math.round(Number(s.spentWood) || 0));
    let spentTools = Math.max(0, Math.round(Number(s.spentTools) || 0));
    if (state === 'done') {
      progress = totalSteps;
      spentWood = totalWood;
      spentTools = totalTools;
    }
    if (state === 'none') {
      progress = 0;
      spentWood = 0;
      spentTools = 0;
    }
    const stages = stageProgressOf({ progress, stages: (s as { stages?: StageSteps }).stages }, totalSteps);
    return { state, progress, spentWood, spentTools, stages };
  };
  return {
    smelter: validateSite(v.smelter, SMELTER_WORK_STEPS, SMELTER_COST_WOOD, 0),
    blacksmith: validateSite(v.blacksmith, BLACKSMITH_WORK_STEPS, BLACKSMITH_COST_WOOD, 0),
    sawmill: validateSite(v.sawmill, SAWMILL_WORK_STEPS, SAWMILL_COST_WOOD, 0),
    carpenter: validateSite(v.carpenter, CARPENTER_WORK_STEPS, CARPENTER_COST_WOOD, 0),
    workshop: validateSite(v.workshop, WORKSHOP_WORK_STEPS, WORKSHOP_COST_WOOD, WORKSHOP_COST_TOOLS),
  };
}

// --- Placements (the chain buildings in the world) ---

function chainPlacementExists(world: IsoWorld, rect: { x0: number; y0: number; x1: number; y1: number }): boolean {
  return (world.placements ?? []).some(
    (p) =>
      p.kind === 'house' &&
      p.x0 === rect.x0 &&
      p.y0 === rect.y0 &&
      p.x1 === rect.x1 &&
      p.y1 === rect.y1,
  );
}

/** The smelter placement exists in the world (a 'house' item on
 *  the site's exact rect — the rect is unique, no hut stands
 *  there). Pure read. */
export function smelterPlacementExists(world: IsoWorld): boolean {
  return chainPlacementExists(world, SMELTER_RECT);
}

/** The blacksmith placement exists in the world. Pure read. */
export function blacksmithPlacementExists(world: IsoWorld): boolean {
  return chainPlacementExists(world, BLACKSMITH_RECT);
}

/** The sawmill placement exists in the world. Pure read. */
export function sawmillPlacementExists(world: IsoWorld): boolean {
  return chainPlacementExists(world, SAWMILL_RECT);
}

/** The carpenter placement exists in the world. Pure read. */
export function carpenterPlacementExists(world: IsoWorld): boolean {
  return chainPlacementExists(world, CARPENTER_RECT);
}

/** The workshop placement exists in the world. Pure read. */
export function workshopPlacementExists(world: IsoWorld): boolean {
  return chainPlacementExists(world, WORKSHOP_RECT);
}

/**
 * Reconcile the two saves: a 'done' chain building whose
 * placement is gone (the player removed it with Build Remove)
 * resets to 'none' — the founders rebuild from the pile when
 * the inputs allow, and no free building ever appears. A
 * 'building' chain building with a placement present is treated
 * as done. A ready building (progress 6, placement blocked) is
 * NOT reset — it is waiting for a clear rect, not removed.
 * Returns the SAME object when nothing changes. Pure.
 */
export function reconcileMetalChain(metalChain: MetalChainState, world: IsoWorld): MetalChainState {
  const placed = {
    smelter: smelterPlacementExists(world),
    blacksmith: blacksmithPlacementExists(world),
    sawmill: sawmillPlacementExists(world),
    carpenter: carpenterPlacementExists(world),
    workshop: workshopPlacementExists(world),
  };
  const finishers = {
    smelter: finishSmelter,
    blacksmith: finishBlacksmith,
    sawmill: finishSawmill,
    carpenter: finishCarpenter,
    workshop: finishWorkshop,
  } as const;
  const steps = {
    smelter: SMELTER_WORK_STEPS,
    blacksmith: BLACKSMITH_WORK_STEPS,
    sawmill: SAWMILL_WORK_STEPS,
    carpenter: CARPENTER_WORK_STEPS,
    workshop: WORKSHOP_WORK_STEPS,
  } as const;
  let next = metalChain;
  (Object.keys(placed) as (keyof typeof placed)[]).forEach((key) => {
    if (next[key].state === 'done' && !placed[key]) {
      next = { ...next, [key]: freshSite(steps[key]) };
    } else if (next[key].state !== 'done' && placed[key]) {
      next = finishers[key](next);
    }
  });
  return next;
}

// --- Labels ---

function chainSiteLabel(site: MetalChainSiteState): string {
  if (site.state === 'done') return 'done';
  if (site.state === 'building') return `${site.progress}/6`;
  return '—';
}

/** The smelter's short label for the HUD / Control Center. Pure. */
export function smelterLabel(metalChain: MetalChainState): string {
  return chainSiteLabel(metalChain.smelter);
}

/** The blacksmith's short label for the HUD / Control Center. Pure. */
export function blacksmithLabel(metalChain: MetalChainState): string {
  return chainSiteLabel(metalChain.blacksmith);
}

/** The sawmill's short label for the HUD / Control Center. Pure. */
export function sawmillLabel(metalChain: MetalChainState): string {
  return chainSiteLabel(metalChain.sawmill);
}

/** The carpenter's short label for the HUD / Control Center. Pure. */
export function carpenterLabel(metalChain: MetalChainState): string {
  return chainSiteLabel(metalChain.carpenter);
}

/** The workshop's short label for the HUD / Control Center. Pure. */
export function workshopLabel(metalChain: MetalChainState): string {
  return chainSiteLabel(metalChain.workshop);
}

/**
 * Why the workshop is stalled, or null when its next step can
 * run: the missing input, named. A workshop that is done needs
 * nothing. A workshop whose bakery is not built yet waits on
 * the bakery. A workshop on a tool step with no tool in the
 * storehouse names the tool. A workshop short of camp wood
 * names the wood. Pure.
 */
export function workshopStallReason(
  metalChain: MetalChainState,
  bakeryDone: boolean,
  campWood: number,
  storehouseTools: number,
): string | null {
  const site = metalChain.workshop;
  if (site.state === 'done') return null;
  if (!bakeryDone) return 'Workshop waits: the bakery is not built yet';
  if (workshopStepNeedsTool(site.progress) && storehouseTools < 1) {
    return `Workshop ${site.progress}/6 · needs 1 tool (${storehouseTools} in store)`;
  }
  if (campWood < WORKSHOP_WOOD_PER_STEP) {
    return `Workshop ${site.progress}/6 · needs ${WORKSHOP_WOOD_PER_STEP} wood (${campWood} in camp pile)`;
  }
  return null;
}

/** The metal-chain count for the HUD / E-report / Control
 *  Center: 'Chain smelter done · smith done · saw 2/6 ·
 *  carpenter — · workshop 0/6 · 3 ingots · 2 tools · 6 timber ·
 *  1 furniture'. Pure. */
export function metalChainLabel(
  metalChain: MetalChainState,
  ingots: number,
  tools: number,
  timber: number,
  furniture: number,
): string {
  return `Chain smelter ${smelterLabel(metalChain)} · smith ${blacksmithLabel(metalChain)} · saw ${sawmillLabel(metalChain)} · carpenter ${carpenterLabel(metalChain)} · workshop ${workshopLabel(metalChain)} · ${ingots} ingots · ${tools} tools · ${timber} timber · ${furniture} furniture`;
}
