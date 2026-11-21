// animalHusbandry.ts — NEURON HEX 0x25, Living World plan Phase 4.5:
// animals + hunting/fishing/shepherding (BUILD 1102).
//
// Three systems, one module (the foodChain.ts / metalChain.ts pattern —
// pure functions over plain state, no tick code, no rendering):
//
//   (a) THE SHEEP PEN — a staged building at the surveyed PEN_CENTRE
//       (132,117), rect 130..134 x 116..119 (all grass, no overlap
//       with any chain building, clear of the lumber rect, 9 tiles
//       from camp). 6 steps x 2 wood = 12 wood via stagePlanFor.
//       canStartPen gates on day >= 3 + both huts done + storehouse
//       done + camp meals >= 20 (the Songs of Syx guardrail: no
//       growth without a surplus). On completion the pen is stocked
//       with 2 sheep from the wild sheep population (a real conserved
//       transfer — population -2, flock +2, logged; the herding walk
//       is a documented follow-up, not a silent teleport: the
//       transfer is this build's explicit completion event). The
//       flock grows at the day boundary when fed (births = flock x
//       birthRate x (1 - flock/cap)); each sheep grows 1 wool/day
//       when fed; the shepherd shears it. Sheep live ONLY in the pen
//       — rendered via the pen fx, never live actors, never GPU slots.
//
//   (b) HUNTING — HUNTABLE_KINDS (deer/rabbit/boar/elk/goat) with
//       yields (meat + leather). The live tick hunts LIVE animals
//       (nearestPreyFrom); the sim tick hunts deterministic synthetic
//       prey (simPreyFor — the nearest habitat tile per huntable
//       kind with population > 0; the search start radius grows as
//       the population falls below capacity, which models the same
//       depletion the live cap produces: fewer animals near camp,
//       so the nearest one is further away). A kill is recorded
//       through the existing recordAnimalKill (one kill = one animal
//       gone at the next day advance, then cleared — the 1.6 rule),
//       and the live animal is removed at once in the live tick.
//       The hunter gives up after 60 ticks without reaching the
//       prey (the deer-flee give-up shape) and re-picks the nearest.
//
//   (c) FISHING + SHEPHERDING — fish are caught where the river
//       runs: the fish job's tile is the nearest walkable bank tile
//       adjacent to river/pond water (within 60 tiles of the plaza,
//       so the ocean never qualifies). The shepherd feeds the pen
//       (1 grain, carried like any delivery) and shears wool when
//       woolReady >= 1.
//
// The 24h window is days 1-2 and every gate here needs day >= 3,
// so the M1069 numbers cannot move. The week (days 1-7) exercises
// hunting/fishing from day 3 — during the day 7-8 food shortage
// they should REDUCE starved ticks (a legitimate improvement with
// a mechanism, reported honestly; the strict assert stays strict).
import {
  currentStageFor,
  stagePlanFor,
  stageProgressOf,
  stageStepSplit,
  type HutSite,
  type StagePlan,
  type StageSteps,
} from './construction';
import {
  ANIMAL_TOWN_KEEP_OUT,
  FISH_MAX_DIST_FROM_PLAZA,
  distFromPlaza,
  habitatTile,
  type AnimalActor,
  type AnimalKind,
} from './animals';
import { populationFor, populationParamsFor3D } from './ecosystems';
import { isWaterTile } from './rivers';
import { npcWalkable } from './townsfolk3d';
import {
  CAMP_STORE_ID,
  storeQty,
  withdrawFrom,
  type ResourceRegistry,
} from './resourceRegistry';
import type { IsoWorld } from '../iso/isoWorld';

// --------------------------------------------------------------------- pen

/** The pen's stable site id — the build job's target. */
export const PEN_SITE_ID = 'pen-site';

/** The pen's centre tile (surveyed 2026-11-20: all grass, no overlap). */
export const PEN_CENTRE = { x: 132, y: 117 } as const;
/** The pen's footprint rect (surveyed, 5x4). */
export const PEN_RECT = { x0: 130, y0: 116, x1: 134, y1: 119 } as const;
/** The pen's door tile (south edge). */
export const PEN_DOOR = { x: 132, y: 120 } as const;
/** The pen's approach tile (one south of the door). */
export const PEN_APPROACH = { x: 132, y: 121 } as const;

/** The pen as a HutSite — the renderer's build-site fx draws the
 *  half-built stage geometry from this (the mill's MILL_HUT_SITE
 *  pattern). No sleep tiles: nobody sleeps in the pen. */
export const PEN_HUT_SITE: HutSite = {
  id: PEN_SITE_ID,
  centre: { ...PEN_CENTRE },
  rect: { ...PEN_RECT },
  door: { ...PEN_DOOR },
  approach: { ...PEN_APPROACH },
  sleepTiles: [],
};

/** Work steps to build the pen (6 steps x 2 wood = 12 wood). */
export const PEN_WORK_STEPS = 6;
/** Wood spent per pen work step. */
export const PEN_WOOD_PER_STEP = 2;
/** Total wood to build the pen. */
export const PEN_COST_WOOD = PEN_WORK_STEPS * PEN_WOOD_PER_STEP;
/** The pen opens on day 3 (the 1089 mine/lumber pattern — the 24h
 *  window is days 1-2, so the pen can never move the M1069 pins). */
export const PEN_START_DAY = 3;
/** Camp meals the settlement must hold before the pen may start
 *  (the surplus guardrail — no growth while the camp is hungry).
 *  12, not 20: the camp's food equilibrates at ~15 (the bake
 *  ceiling is 15/day vs ~12-14 eaten), so a 20-meal gate never
 *  opens in a week (the diag-week proved it: food 8-15, the pen
 *  never starts, hunt/fish/shepherd never run). 12 is a day's
 *  food for the six founders — the camp must hold a day's buffer
 *  before spending 12 wood on a pen. The day-3 gate still holds. */
export const PEN_START_MEALS = 12;
/** Sheep stocked into the pen on completion (from the wild flock). */
export const PEN_SHEEP_STOCK = 2;
/** The flock's carrying capacity (the catalogue animal-pens cap 10,
 *  raised to 12 for the sheep-farms cap — one pen holds a dozen). */
export const PEN_FLOCK_CAP = 12;
/** Sheep birth rate (matches the sheep population param). */
export const SHEEP_BIRTH_RATE = 0.09;
/** Wool grown per sheep per fed day. */
export const WOOL_PER_SHEEP_PER_DAY = 1;
/** Grain spent per pen feeding. */
export const PEN_FEED_GRAIN = 1;
/** Wool a shepherd carries per shear trip (the carrier cap —
 *  resourceRegistry capacityFor returns 2 for carrier stores). */
export const PEN_SHEAR_CARRY_MAX = 2;
/** Ticks in one hunting shift (mirrors MILL_TICKS_PER_SHIFT). */
export const HUNT_TICKS_PER_SHIFT = 3;
/** Ticks in one fishing shift. */
export const FISH_TICKS_PER_SHIFT = 3;
/** A hunt gives up after this many ticks without reaching the prey. */
// A hunt gives up after this many ticks without reaching the prey
// (the deer-flee give-up pattern). 360, not 120: the founder moves
// 1 tile per tick and the wild band sits 50-90 tiles out, but the
// A* path detours around the river and cliffs, so the walk takes
// up to ~3x the straight-line distance — a 120-tick budget gave up
// on every far hunt before arriving (diag-pen3: the hunter chased
// one goat for a day without ever arriving).
export const HUNT_GIVE_UP_TICKS = 360;
/** Fish caught per fishing shift. */
export const FISH_YIELD = 2;

export type PenSiteKind = 'none' | 'building' | 'done';

/** One pen building's construction progress (saved in the founders
 *  save, v12 — the same shape as one FoodChainSiteState, wood-only). */
export type PenSiteState = {
  state: PenSiteKind;
  /** Completed work steps, 0..6. */
  progress: number;
  /** Wood actually spent on this building (2 per step). */
  spentWood: number;
  /** Per-stage steps completed (BUILD 1093). Optional: an old
   *  save without it derives the stages from the total progress. */
  stages?: StageSteps;
};

/** The pen (saved in the founders save, v12 — a compatible field). */
export type PenState = {
  site: PenSiteState;
  /** The flock (fractional — births accumulate like populations). */
  flock: number;
  /** The last day the pen was fed (-1 = never fed). */
  fedDay: number;
  /** Wool grown and waiting to be sheared (fractional). */
  woolReady: number;
  /** True once the 2 founding sheep moved in from the wild flock. */
  stocked: boolean;
};

function freshSite(totalSteps: number): PenSiteState {
  return { state: 'none', progress: 0, spentWood: 0, stages: stageProgressOf({ progress: 0 }, totalSteps) };
}

/** A fresh pen — no building, no flock, never fed, unstocked. Pure. */
export function freshPen(): PenState {
  return { site: freshSite(PEN_WORK_STEPS), flock: 0, fedDay: -1, woolReady: 0, stocked: false };
}

/** Validate a loaded pen (the founders-save load path, the
 *  validateFoodChainState shape): a missing or malformed pen
 *  migrates to fresh (nothing started, no flock — v12 saves have
 *  none). A done pen keeps its flock; a building pen keeps its
 *  progress. Pure. */
export function validatePenState(value: unknown): PenState {
  if (!value || typeof value !== 'object') return freshPen();
  const v = value as Record<string, unknown>;
  const site = validatePenSite(v.site);
  // BUILD 1102: the flock + woolReady are FRACTIONAL by design
  // (births + wool accrue fractionally — flock 2.84, wool 0.59) —
  // flooring them here silently loses sheep + wool on EVERY
  // save/load (2.15 -> 2, 0.59 -> 0). Sanitize (non-negative,
  // capped) but keep the fraction, or the reload never restores.
  const flock = Math.max(0, Math.min(PEN_FLOCK_CAP, Number(v.flock) || 0));
  const fedDay = Number.isFinite(Number(v.fedDay)) ? Math.floor(Number(v.fedDay)) : -1;
  const woolReady = Math.max(0, Number(v.woolReady) || 0);
  const stocked = v.stocked === true;
  return { site, flock, fedDay, woolReady, stocked };
}

function validatePenSite(raw: unknown): PenSiteState {
  if (!raw || typeof raw !== 'object') return freshSite(PEN_WORK_STEPS);
  const s = raw as Record<string, unknown>;
  const state = s.state === 'building' || s.state === 'done' ? (s.state as PenSiteState['state']) : 'none';
  let progress = Math.max(0, Math.min(PEN_WORK_STEPS, Math.round(Number(s.progress) || 0)));
  let spentWood = Math.max(0, Math.round(Number(s.spentWood) || 0));
  if (state === 'done') {
    progress = PEN_WORK_STEPS;
    spentWood = PEN_COST_WOOD;
  }
  if (state === 'none') {
    progress = 0;
    spentWood = 0;
  }
  const stages = stageProgressOf({ progress, stages: (s as { stages?: StageSteps }).stages }, PEN_WORK_STEPS);
  return { state, progress, spentWood, stages };
}

// --- Stage plan (0x1C: foundation -> frame -> finished) ---

/** The pen's stage plan: 6 steps / 12 wood -> 3x (2 steps, 4 wood). Pure. */
export function penStagePlan(): StagePlan {
  return stagePlanFor(PEN_WORK_STEPS, [{ resource: 'wood', qty: PEN_WOOD_PER_STEP * PEN_WORK_STEPS }]);
}

// --- Gates ---

/** True when the pen is ready for its placement (progress 6,
 *  still 'building' — the caller flips it to 'done' only when
 *  the placement actually lands, the same ready/done split as
 *  the mill). Pure. */
export function penReadyForPlacement(pen: PenState): boolean {
  return pen.site.state === 'building' && pen.site.progress >= PEN_WORK_STEPS;
}

/** True when a founder may start (or continue) building the pen:
 *  day >= 3, both huts done, the storehouse done, camp meals at
 *  the surplus (20), and the camp pile holds a step's wood. The
 *  day/meals/huts gates live here (the claim site); the per-step
 *  gate is canBuildPen. Pure. */
export function canStartPen(
  pen: PenState,
  day: number,
  hutsDone: boolean,
  storehouseDone: boolean,
  campMeals: number,
  campWood: number,
): boolean {
  // BUILD 1102: the camp wood is NOT a claim gate (diag-pen2 —
  // the pile oscillates 0-3 live, so the claim almost never fired).
  // The wood is a step input (canBuildPen + the storehouse transfer);
  // the claim gates only on the food surplus. campWood stays in the
  // signature so the call sites do not change.
  void campWood;
  return (
    penReadyForPlacement(pen) ||
    (pen.site.state !== 'done' &&
      pen.site.progress < PEN_WORK_STEPS &&
      day >= PEN_START_DAY &&
      hutsDone &&
      storehouseDone &&
      campMeals >= PEN_START_MEALS)
  );
}

/** True when a founder may do a pen work step: it is unfinished
 *  and the camp pile holds a step's wood. Pure. */
export function canBuildPen(pen: PenState, campWood: number): boolean {
  return (
    penReadyForPlacement(pen) ||
    (pen.site.state !== 'done' &&
      pen.site.progress < PEN_WORK_STEPS &&
      campWood >= PEN_WOOD_PER_STEP)
  );
}

/** True when the pen is finished and usable (all stages done).
 *  A half-built pen holds no sheep. Pure. */
export function isPenUsable(pen: PenState): boolean {
  return pen.site.state === 'done' && pen.site.progress >= PEN_WORK_STEPS;
}

// --- Construction step (spends from the camp pile) ---

/**
 * Complete one work step on the pen from the registry's camp
 * store: 2 wood leave the pile, the progress rises by 1. The pen
 * draws from the CAMP pile — it does not exist yet to draw from.
 * At the last step the pen is READY (progress 6) but the state
 * stays 'building' — the caller flips it to 'done' only when the
 * placement actually lands (finishPen), the same ready/done split
 * as the mill. With too little wood, or when the pen is already
 * ready, nothing happens and nothing is withdrawn. Pure.
 */
export function spendPenStepFromRegistry(
  registry: ResourceRegistry,
  pen: PenState,
): { registry: ResourceRegistry; pen: PenState; completed: boolean; spent: boolean } {
  const site = pen.site;
  if (site.state === 'done' || site.progress >= PEN_WORK_STEPS) {
    return { registry, pen, completed: site.progress >= PEN_WORK_STEPS, spent: false };
  }
  if (storeQty(registry, CAMP_STORE_ID, 'wood') < PEN_WOOD_PER_STEP) {
    return { registry, pen, completed: false, spent: false };
  }
  const w = withdrawFrom(registry, CAMP_STORE_ID, 'wood', PEN_WOOD_PER_STEP);
  if (w.taken < PEN_WOOD_PER_STEP) {
    // Cannot happen (the guard above read the same store), but a
    // partial withdrawal must never become a partial step.
    return { registry, pen, completed: false, spent: false };
  }
  const progress = site.progress + 1;
  const completed = progress >= PEN_WORK_STEPS;
  // BUILD 1093: the step lands on the first incomplete stage
  // (foundation -> frame -> finished).
  const cur = currentStageFor(site, PEN_WORK_STEPS);
  const stages = stageProgressOf(site, PEN_WORK_STEPS);
  const nextStages: StageSteps = cur ? { ...stages, [cur.id]: stages[cur.id] + 1 } : stages;
  return {
    registry: w.registry,
    pen: {
      ...pen,
      site: {
        state: 'building' as PenSiteKind,
        progress,
        spentWood: site.spentWood + PEN_WOOD_PER_STEP,
        stages: nextStages,
      },
    },
    completed,
    spent: true,
  };
}

/** Flip a ready pen (progress 6) to 'done' once its placement
 *  has actually landed. Pure. */
export function finishPen(pen: PenState): PenState {
  if (pen.site.state === 'done') return pen;
  return {
    ...pen,
    site: {
      state: 'done',
      progress: PEN_WORK_STEPS,
      spentWood: PEN_COST_WOOD,
      stages: { ...stageStepSplit(PEN_WORK_STEPS) },
    },
  };
}

// --- Stocking, feeding, shearing, day advance ---

/**
 * Stock the pen from the wild sheep population: 2 sheep move
 * (population -2, flock +2 — a real conserved transfer, logged
 * by the caller). Only once (stocked flips), only when the pen is
 * done, only when the wild flock holds at least 2. The wild
 * population entry is mutated in place (the recordAnimalKill
 * shape) — the next ecosystem day advance copies the current
 * values, so the -2 survives the day boundary. Pure except for
 * that one in-place population write.
 */
export function stockPenFromWild(
  pen: PenState,
  world: IsoWorld,
): { pen: PenState; stocked: boolean } {
  if (pen.stocked || !isPenUsable(pen)) return { pen, stocked: false };
  const p = (world.animalPopulations ?? []).find((x) => x.speciesId === 'sheep');
  if (!p || p.population < PEN_SHEEP_STOCK) return { pen, stocked: false };
  p.population -= PEN_SHEEP_STOCK;
  return { pen: { ...pen, flock: pen.flock + PEN_SHEEP_STOCK, stocked: true }, stocked: true };
}

/**
 * Advance the pen one day (the day just ended is `day`): when the
 * pen was fed during that day the flock grows (births = flock x
 * birthRate x (1 - flock/cap)) and each sheep grows one wool.
 * Unfed days grow nothing — a hungry flock neither breeds nor
 * yields wool. Pure.
 */
export function penDayAdvance(
  pen: PenState,
  day: number,
): { pen: PenState; births: number; woolGrown: number } {
  if (!isPenUsable(pen) || pen.flock <= 0 || pen.fedDay !== day) {
    return { pen, births: 0, woolGrown: 0 };
  }
  const densityFactor = Math.max(0, 1 - pen.flock / PEN_FLOCK_CAP);
  const births = pen.flock * SHEEP_BIRTH_RATE * densityFactor;
  const woolGrown = pen.flock * WOOL_PER_SHEEP_PER_DAY;
  return {
    pen: { ...pen, flock: pen.flock + births, woolReady: pen.woolReady + woolGrown },
    births,
    woolGrown,
  };
}

/** True when the pen needs feeding today (done, not yet fed today). Pure. */
export function penFeedNeeded(pen: PenState, day: number): boolean {
  return isPenUsable(pen) && pen.fedDay < day;
}

/** True when there is wool to shear (done, at least 1 whole wool). Pure. */
export function penShearReady(pen: PenState): boolean {
  return isPenUsable(pen) && Math.floor(pen.woolReady) >= 1;
}

/** Feed the pen (the shepherd delivered the grain): fedDay = today. Pure. */
export function feedPen(pen: PenState, day: number): PenState {
  return { ...pen, fedDay: day };
}

/** Shear the pen: whole wool leaves, the fractional remainder stays. Pure. */
export function shearPen(pen: PenState): { pen: PenState; wool: number } {
  // At most PEN_SHEAR_CARRY_MAX per shear: the shepherd carries
  // what they can (2, the carrier cap) and the rest stays on the
  // sheep for the next shear — an uncapped shear would strand wool
  // in the founder's hands and pin them at the approach (the same
  // carrier-cap bug as the elk yield). The shear job re-opens
  // while wool remains, so a big flock takes several trips.
  const wool = Math.min(PEN_SHEAR_CARRY_MAX, Math.floor(pen.woolReady));
  if (wool <= 0) return { pen, wool: 0 };
  return { pen: { ...pen, woolReady: pen.woolReady - wool }, wool };
}

// --- Pen rendering (the flock as pen fx) ---

/** Fixed sheep offsets inside the pen rect (up to 6 visible). */
const PEN_SHEEP_OFFSETS: [number, number][] = [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1], [0, -1]];

/** The visible sheep positions in the pen (count = min(floor(flock), 6)). Pure. */
export function penSheepPositions(pen: PenState): { x: number; y: number }[] {
  const n = Math.min(Math.floor(pen.flock), PEN_SHEEP_OFFSETS.length);
  return PEN_SHEEP_OFFSETS.slice(0, n).map(([dx, dy]) => ({ x: PEN_CENTRE.x + dx, y: PEN_CENTRE.y + dy }));
}

// ------------------------------------------------------------------ hunting

/** The kinds a hunter may hunt (live actors only — sheep/cattle/
 *  pig/horse/fish are populations, not prey). */
export const HUNTABLE_KINDS: AnimalKind[] = ['deer', 'rabbit', 'boar', 'elk', 'goat'];

/** The prey kind a hunt job's targetId names: 'sim-prey-<kind>'
 *  (the sim tick) or '<kind>-<slot>' (a live animal id, the
 *  animalId shape). Null when the target names no huntable prey —
 *  the tick fails the job 'target-gone' instead of killing the
 *  wrong animal. Pure. */
export function preyKindForTargetId(targetId: string): AnimalKind | null {
  const kind = targetId.startsWith('sim-prey-') ? targetId.slice('sim-prey-'.length) : targetId.split('-')[0];
  return isHuntableKind(kind as AnimalKind) ? (kind as AnimalKind) : null;
}

/** True when this kind is huntable prey. Pure. */
export function isHuntableKind(kind: AnimalKind): boolean {
  return HUNTABLE_KINDS.includes(kind);
}

/** Meat + leather per kill (rabbit: meat only, no hide). No yield
 *  exceeds 2 of a kind: the carrier store caps every kind at 2
 *  (resourceRegistry capacityFor — the wood/ore/wheat invariant),
 *  so a 3-meat kill would strand 1 unit in the founder's hands
 *  and pin them at the approach (the 1095 coal bug). Elk stays
 *  the best prey (2 meat + 2 leather = 4 units, the most of any). */
export const HUNT_YIELD: Record<'deer' | 'rabbit' | 'boar' | 'elk' | 'goat', { meat: number; leather: number }> = {
  deer: { meat: 2, leather: 1 },
  rabbit: { meat: 1, leather: 0 },
  boar: { meat: 2, leather: 1 },
  elk: { meat: 2, leather: 2 },
  goat: { meat: 1, leather: 1 },
};

/** The yield for a kill of this kind (0/0 for a non-huntable kind). Pure. */
export function huntYieldFor(kind: AnimalKind): { meat: number; leather: number } {
  return HUNT_YIELD[kind as keyof typeof HUNT_YIELD] ?? { meat: 0, leather: 0 };
}

/**
 * The nearest live prey to (x, y) — the live tick's hunt target.
 * The hunter claims the nearest, so overhunting near camp leaves
 * the nearest prey further away (the acceptance test). Pure.
 */
export function nearestPreyFrom(
  animals: readonly AnimalActor[],
  x: number,
  y: number,
): { animal: AnimalActor; dist: number } | null {
  let best: AnimalActor | null = null;
  let bestDist = Infinity;
  for (const a of animals) {
    if (!isHuntableKind(a.kind)) continue;
    const d = Math.hypot(a.x - x, a.y - y);
    if (d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  return best ? { animal: best, dist: bestDist } : null;
}

// ---------------------------------------------------------------- sim prey

/**
 * Scan the ring of radius r around `from` for the first tile the
 * test accepts (fixed order — deterministic). Pure.
 */
function scanRing(
  world: IsoWorld,
  from: { x: number; y: number },
  r: number,
  test: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  for (let dx = -r; dx <= r; dx++) {
    for (const dy of [-r, r]) {
      const x = from.x + dx, y = from.y + dy;
      if (x < 2 || y < 2 || x >= world.w - 2 || y >= world.h - 2) continue;
      if (test(x, y)) return { x, y };
    }
  }
  for (let dy = -r + 1; dy <= r - 1; dy++) {
    for (const dx of [-r, r]) {
      const x = from.x + dx, y = from.y + dy;
      if (x < 2 || y < 2 || x >= world.w - 2 || y >= world.h - 2) continue;
      if (test(x, y)) return { x, y };
    }
  }
  return null;
}

/**
 * The sim tick's synthetic prey: the nearest REACHABLE habitat tile
 * for a huntable kind with population > 0. The sim has no live
 * animals, so the prey never moves — but the tile must have a path
 * from camp (planPathNpc !== null), or the hunter walks at an
 * unreachable prey forever (diag-reach: all five sim prey sat
 * across the river, hunt 0 all week). The search start radius grows
 * as the population falls below capacity (up to +20 tiles at
 * extinction's edge), which models the same depletion the live cap
 * produces: a hunted-out area pushes the hunter further out. Null
 * when the population is extinct (no job opens). Pure apart from
 * the path memo (below) — the memo is referentially transparent
 * for a static world.
 */

/**
 * Reachable-set for simPreyFor: the tiles a founder can walk to
 * from `from`, from ONE BFS flood-fill over npcWalkable tiles. The
 * per-tile A* memo (Fix 9b) still paid a full-region A* for every
 * DISTINCT habitat tile (diag-reach3: 18 min CPU in a 4800-tick
 * advance) — the scan touches dozens of distinct tiles per ring.
 * The BFS gives the whole reachable set at once, and the scan then
 * does O(1) set lookups. BFS reachability IS A* reachability for
 * a static world (same walkability), so the result is identical —
 * only the cost changes. Cached per (world, from) in a WeakMap, so
 * a fresh world gets a fresh set. A bridge built after the BFS can
 * add reachability — the hunter still finds the other reachable
 * prey, and the live game never calls simPreyFor (it hunts live
 * animals).
 */
const simPreyReachableMemo = new WeakMap<object, Map<string, Set<string>>>();
function simPreyReachable(world: IsoWorld, from: { x: number; y: number }, x: number, y: number): boolean {
  let perWorld = simPreyReachableMemo.get(world);
  if (!perWorld) {
    perWorld = new Map<string, Set<string>>();
    simPreyReachableMemo.set(world, perWorld);
  }
  const fromKey = from.x + ',' + from.y;
  let set = perWorld.get(fromKey);
  if (!set) {
    set = new Set<string>();
    const queue: { x: number; y: number }[] = [{ x: from.x, y: from.y }];
    set.add(fromKey);
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
        const key = nx + ',' + ny;
        if (set.has(key)) continue;
        if (!npcWalkable(world, nx, ny)) continue;
        set.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
    perWorld.set(fromKey, set);
  }
  return set.has(x + ',' + y);
}
export function simPreyFor(
  world: IsoWorld,
  kind: AnimalKind,
  from: { x: number; y: number },
  plaza: { x: number; y: number },
): { x: number; y: number } | null {
  if (!isHuntableKind(kind)) return null;
  const pop = populationFor(world, kind);
  if (pop === null || pop <= 0) return null;
  const params = populationParamsFor3D(kind);
  const cap = params?.carryingCapacity ?? 50;
  const depletion = 1 - Math.min(1, pop / cap);
  const d0 = distFromPlaza(from.x, from.y, plaza);
  const rMin = Math.max(0, Math.ceil(ANIMAL_TOWN_KEEP_OUT - d0) + Math.floor(depletion * 20));
  for (let r = rMin; r <= 90; r++) {
    const tile = scanRing(world, from, r, (x, y) => habitatTile(world, kind, x, y, plaza) && simPreyReachable(world, from, x, y));
    if (tile) return tile;
  }
  return null;
}

// ------------------------------------------------------------------ fishing

/**
 * The nearest fishable bank tile to `from`: a walkable tile
 * adjacent (4-neighbourhood) to river/pond water within 60 tiles
 * of the plaza, so the ocean never qualifies. Null when no river
 * or pond runs within reach (the fish job never opens). Pure.
 */
export function nearestBankTile(
  world: IsoWorld,
  from: { x: number; y: number },
  plaza: { x: number; y: number },
): { x: number; y: number } | null {
  for (let r = 1; r <= 80; r++) {
    const tile = scanRing(world, from, r, (x, y) => {
      if (!npcWalkable(world, x, y)) return false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const wx = x + dx, wy = y + dy;
        if (wx < 0 || wy < 0 || wx >= world.w || wy >= world.h) continue;
        if (isWaterTile(world, wx, wy) && distFromPlaza(wx, wy, plaza) <= FISH_MAX_DIST_FROM_PLAZA) return true;
      }
      return false;
    });
    if (tile) return tile;
  }
  return null;
}

// --------------------------------------------------------------- shepherding

/** The shepherd's feed job id (one job while the pen needs feeding). */
export const PEN_FEED_JOB_ID = 'pen-feed';
/** The shepherd's shear job id (one job while wool is ready). */
export const PEN_SHEAR_JOB_ID = 'pen-shear';
