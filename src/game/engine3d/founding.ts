/**
 * BUILD 1101 (0x24, Living World plan Phase 4.3): settlement
 * founding — camp to village seed.
 *
 * Exists now: one hardcoded camp (FOUNDER_CAMP (124,120)); hut
 * sites hardcoded (HUT_SITES 0/1/2); the 4.2 plan (sitePlan.ts:
 * the Mayor scores what to build next, the Architect scores where
 * to put it). The founding arc (1057–1058: a group arrives, a log
 * pile, a first hut) only ever ran at the hardcoded camp.
 *
 * This module is founding as a behaviour — a fresh group that
 * identifies suitable land, establishes a camp (shelter +
 * stockpile), then starts food production — the first build that
 * replays the 1057–1058 arc without hardcoded coordinates:
 *
 * - THE SURVEY: camp candidates on rings around the arrival point
 *   (199,120 — the 1066 arrival corridor), scored by the same
 *   rules the Architect uses (sitePlan.ts helpers: near water, near
 *   trees, near deposits, clear, reachable) plus rich soil for the
 *   farm and a minimum distance from the existing settlement (a new
 *   camp is its own place). The best site wins on merit, with the
 *   0.05 margin (sitePlan pattern) — a one-tile-better ring
 *   candidate must not displace the surveyed site on noise.
 * - THE CAMP LAYOUT: stockpile + eat tile either side of the
 *   centre (the founders' pattern), a hut centre+4 (4x3 rect, south
 *   door, approach, sleep tiles — the HUT_SITES[0] pattern), and a
 *   2x2 farm block on the best soil near camp (scanned, not
 *   hardcoded).
 * - THE STATE MACHINE: surveying -> travelling -> establishing
 *   (chop + deliver 12 wood into the stockpile) -> sheltering (the
 *   first hut: 6 steps x 3 ticks, 2 wood/step from the pile — the
 *   HUT_* constants) -> farming (plant the 4 farm tiles) -> founded.
 *   Members move with stepFounderMove (the founders' mover, 1 tile
 *   per tick), chop with nearestTreeTile/treeWorkTile/chopTreeAt
 *   (a felled tree leaves a sapling — the regrowth system), plant
 *   with plantFarmTile, and stamp the finished hut through
 *   validatePlacement 'house-cottage' + addPlacement (the same path
 *   the bridge and the founders' huts use — an occupied rect waits
 *   and retries, the progress is banked). The pile is real counted
 *   wood; the hut is a real placement; the farm tiles are real
 *   placements with timestamps (they grow via farmStageAt).
 * - SESSION-ONLY, like transients: the party + its founding state
 *   are NOT in the founders save (v12 stays — no save change). The
 *   hut + farm placements the party stamps are real world placements
 *   (they render + persist like any placed house/farm — the probe
 *   runs on a fresh test world, so nothing leaks into the user's
 *   save). The party has no hunger/energy in 4.3 (they arrive fed
 *   for the day's work; founder needs would starve them with no
 *   granary to eat from — that wiring is follow-up). Food production
 *   is the farm plot, planted + growing (hunt/fish/forage have no
 *   systems — fishing/swimming are explicitly pending, so they are
 *   NOT invented here).
 *
 * Pure module (no React, no WebGL, no localStorage — only the world
 * read + the placements it stamps) so the sim and the standalone
 * asserts can import it directly. The ticks call advanceFoundingTick
 * once per founder tick (0.9 game-min per tick, like the settlement
 * tick).
 */

import { planPathNpc } from './townsfolk3d';
import { terrainAt, type IsoWorld } from '../iso/isoWorld';
import {
  nearestWaterDist, nearestTreeDist, nearestDepositDist,
  existingBuildingRects,
} from './sitePlan';
import {
  HUT_KIND, HUT_COST_WOOD, HUT_WORK_STEPS, HUT_TICKS_PER_STEP,
  HUT_WOOD_PER_STEP, stageStepsFor, type HutSite, type StageSteps,
  type ConstructionState,
} from './construction';
import {
  FOUNDER_CAMP, FOUNDER_CHOP_TICKS, FOUNDER_WOOD_PER_TREE,
  FOUNDER_NAMES, RESIDENT_NAMES, founderAbsMinutes,
  nearestTreeTile, treeWorkTile, chopTreeAt,
  emptyFounderPath, stepFounderMove, type FounderPathState,
} from './founders';
import { FOUNDER_PLANT_TICKS, plantFarmTile } from './granary';
import { soilFactorAt } from './livingWorld';
import { validatePlacement, addPlacement, placedHutRects } from './placements';
import type { StorehouseState } from './storehouse';
import type { FoodChainState } from './foodChain';
import type { MetalChainState } from './metalChain';
import type { HousingState } from './housing';

/** The founding party: three settlers, like the founding three
 *  (1057) — a group small enough to feed from one farm plot, big
 *  enough to chop + build in a day. */
export const FOUNDING_PARTY_SIZE = 3;

/** The party's names — verified new: not in FOUNDER_NAMES,
 *  RESIDENT_NAMES, or the transient/adventurer pools. Render keys
 *  are namespaced 'founding:<name>' so they can never collide. */
export const FOUNDING_PARTY_NAMES = ['Corin', 'Mabel', 'Joss'];

/** Where a founding party enters the world: the east edge, the
 *  same corridor the 1066 arrivals walk in from. */
export const FOUNDING_ARRIVAL = { x: 199, y: 120 };

/** A new camp must be at least this far (Manhattan) from the
 *  existing camp — its own land, not the founders' backyard. */
export const FOUNDING_MIN_DIST_FROM_CAMP = 30;

/** The margin an alternative camp site must beat the current best
 *  by to displace it (sitePlan pattern: the surveyed site holds
 *  against one-tile noise). */
export const FOUNDING_SITE_MARGIN = 0.05;

/** Game minutes per founding tick — the same as the settlement
 *  tick (SETTLEMENT_TICK_MIN = 0.9); the founding steps once per
 *  founder tick, so a day is 1600 ticks. */
export const FOUNDING_TICK_MIN = 0.9;

/** The camp disc half-extents (the camp footprint the survey
 *  keeps clear of water): hut + stockpile + eat tile + farm, with
 *  room to stand. */
export const FOUNDING_CAMP_DISC = { hx: 6, hy: 4 };

/** Wood the first hut costs in total (the HUT_COST_WOOD the
 *  founders' huts cost — the party gathers it before building). */
export const FOUNDING_HUT_WOOD = HUT_COST_WOOD;

/** Farm tiles in the founding plot (the 1067 field is 4 tiles). */
export const FOUNDING_FARM_TILES = 4;

/** A tile in the world. */
export type FoundingTile = { x: number; y: number };

/** A chosen camp site: where the camp is, what stands on it, and
 *  why it was chosen (the reasons are the explanation — why here). */
export type CampSite = {
  /** The camp centre (the settlement's heart — the stockpile +
   *  eat tile sit either side of it). */
  centre: FoundingTile;
  /** The stockpile tile (the log pile — centre + (1,0)). */
  stockpile: FoundingTile;
  /** The eat tile (centre + (-1,0)). */
  eatTile: FoundingTile;
  /** The first hut (centre + (4,0) — the HUT_SITES[0] pattern). */
  hut: HutSite;
  /** The farm plot (2x2, best soil near camp). */
  farmTiles: FoundingTile[];
  /** The survey score (0..1). */
  score: number;
  /** Why this site (distances + soil + the walk in). */
  reasons: string[];
};

/** The camp layout for a centre: stockpile + eat tile either side,
 *  the hut east of camp, the farm plot filled in by the survey
 *  (best soil — see farmTilesFor). Pure. */
export function campLayoutFor(centre: FoundingTile, farmTiles: FoundingTile[]): CampSite {
  const hutCentre = { x: centre.x + 4, y: centre.y };
  const rect = { x0: hutCentre.x - 2, y0: hutCentre.y - 1, x1: hutCentre.x + 1, y1: hutCentre.y + 1 };
  const door = { x: hutCentre.x, y: rect.y1 };
  const sleepTiles = [
    { x: rect.x0, y: rect.y0 },
    { x: rect.x0 + 1, y: rect.y0 },
    { x: rect.x1, y: rect.y0 },
  ].filter((t) => t.x !== door.x);
  return {
    centre: { ...centre },
    stockpile: { x: centre.x + 1, y: centre.y },
    eatTile: { x: centre.x - 1, y: centre.y },
    hut: {
      id: 'founding-hut',
      centre: { ...hutCentre },
      rect,
      door,
      approach: { x: door.x, y: door.y + 1 },
      sleepTiles,
    },
    farmTiles: farmTiles.map((t) => ({ ...t })),
    score: 0,
    reasons: [],
  };
}

/** The best 2x2 farm block near a camp centre: every tile must
 *  validate as farm land, and the block with the richest soil wins.
 *  Returns the tiles + the average soil factor, or null when no
 *  block near camp is plantable. Pure read (validatePlacement only
 *  reads the world). */
export function farmTilesFor(
  world: IsoWorld, centre: FoundingTile,
): { tiles: FoundingTile[]; soil: number } | null {
  let best: { tiles: FoundingTile[]; soil: number } | null = null;
  const hutRect = { x0: centre.x + 2, y0: centre.y - 1, x1: centre.x + 5, y1: centre.y + 1 };
  for (let by = centre.y - 5; by <= centre.y + 4; by++) {
    for (let bx = centre.x - 7; bx <= centre.x + 4; bx++) {
      // Not on the hut, the stockpile, or the eat tile.
      let blocked = false;
      for (let y = by; y <= by + 1 && !blocked; y++) {
        for (let x = bx; x <= bx + 1 && !blocked; x++) {
          if (x >= hutRect.x0 && x <= hutRect.x1 && y >= hutRect.y0 && y <= hutRect.y1) blocked = true;
          if ((x === centre.x + 1 || x === centre.x - 1) && y === centre.y) blocked = true;
          if (!validatePlacement(world, 'farm', x, y, { x: 0, y: 0 }, [], 0).ok) blocked = true;
        }
      }
      if (blocked) continue;
      let soil = 0;
      for (let y = by; y <= by + 1; y++) {
        for (let x = bx; x <= bx + 1; x++) soil += soilFactorAt(world, x, y);
      }
      soil /= 4;
      if (!best || soil > best.soil) best = { tiles: [{ x: bx, y: by }, { x: bx + 1, y: by }, { x: bx, y: by + 1 }, { x: bx + 1, y: by + 1 }], soil };
    }
  }
  return best;
}

/** The survey score for one camp centre (0..1, with the reasons).
 *  A hard reject scores 0: water in the camp disc, a tree/rock in
 *  the hut rect or on the stockpile/eat tiles, an overlap with an
 *  existing building rect, too close to the existing camp, no water
 *  within 30, no tree within 30. The path check + the farm scan run
 *  on the top candidates only (surveyCampSites) — A* + farm
 *  validation per candidate would cost the live tick. Pure. */
export function scoreCampSite(
  centre: FoundingTile,
  world: IsoWorld,
  existingRects: readonly { x0: number; y0: number; x1: number; y1: number }[],
  arrival: FoundingTile,
): { score: number; reasons: string[]; rejected: boolean; waterDist: number | null; treeDist: number | null; depDist: number | null } {
  const reasons: string[] = [];
  const layout = campLayoutFor(centre, []);
  const { hut } = layout;
  // Hard reject: water in the camp disc.
  for (let y = centre.y - FOUNDING_CAMP_DISC.hy; y <= centre.y + FOUNDING_CAMP_DISC.hy; y++) {
    for (let x = centre.x - FOUNDING_CAMP_DISC.hx; x <= centre.x + FOUNDING_CAMP_DISC.hx; x++) {
      if (terrainAt(world, x, y) === 'water') return { score: 0, reasons: [`water at ${x},${y} — the camp would stand in the river`], rejected: true, waterDist: 0, treeDist: null, depDist: null };
    }
  }
  // Hard reject: a tree or rock in the hut rect, or on the
  // stockpile / eat tile (the hut cannot be built on a tree, and
  // the pile needs its tile clear).
  for (let y = hut.rect.y0; y <= hut.rect.y1; y++) {
    for (let x = hut.rect.x0; x <= hut.rect.x1; x++) {
      // The hut stamps through validatePlacement, which refuses a
      // house on water, dirt (a path or road), or sand — the survey
      // must reject the same ground, or the stamp fails forever (the
      // 1101 stall: the chosen site's hut rect sat on generated dirt
      // and the builder retried the stamp for 22,000 ticks). Stone
      // and grass stamp fine.
      const terrain = terrainAt(world, x, y);
      if (terrain === 'water' || terrain === 'dirt' || terrain === 'sand') return { score: 0, reasons: [`${terrain} at ${x},${y} — the hut cannot be built there`], rejected: true, waterDist: null, treeDist: null, depDist: null };
      if ((world.trees ?? []).some((t) => t.tx === x && t.ty === y)) return { score: 0, reasons: [`tree at ${x},${y} — the hut site is not clear`], rejected: true, waterDist: null, treeDist: 0, depDist: null };
      if ((world.rocks ?? []).some((r) => r.tx === x && r.ty === y)) return { score: 0, reasons: [`rock at ${x},${y} — the hut site is not clear`], rejected: true, waterDist: null, treeDist: null, depDist: null };
    }
  }
  for (const t of [layout.stockpile, layout.eatTile]) {
    if ((world.trees ?? []).some((tr) => tr.tx === t.x && tr.ty === t.y)) return { score: 0, reasons: [`tree at ${t.x},${t.y} — the camp centre is not clear`], rejected: true, waterDist: null, treeDist: 0, depDist: null };
    if ((world.rocks ?? []).some((r) => r.tx === t.x && r.ty === t.y)) return { score: 0, reasons: [`rock at ${t.x},${t.y} — the camp centre is not clear`], rejected: true, waterDist: null, treeDist: null, depDist: null };
  }
  // Hard reject: the hut overlaps an existing building.
  for (const r of existingRects) {
    if (hut.rect.x0 <= r.x1 && hut.rect.x1 >= r.x0 && hut.rect.y0 <= r.y1 && hut.rect.y1 >= r.y0) {
      return { score: 0, reasons: ['the hut would overlap an existing building'], rejected: true, waterDist: null, treeDist: null, depDist: null };
    }
  }
  // Hard reject: too close to the existing camp — a new camp is
  // its own place.
  const distCamp = Math.abs(centre.x - FOUNDER_CAMP.x) + Math.abs(centre.y - FOUNDER_CAMP.y);
  if (distCamp < FOUNDING_MIN_DIST_FROM_CAMP) return { score: 0, reasons: [`only ${distCamp} tiles from the founders' camp — too close for a new settlement`], rejected: true, waterDist: null, treeDist: null, depDist: null };
  // Hard reject: no water or no trees within 30 — a camp needs
  // both (water to drink, trees to build with).
  const waterDist = nearestWaterDist(world, hut.rect, 30);
  if (waterDist === null) return { score: 0, reasons: ['no water within 30 tiles — the camp would die of thirst'], rejected: true, waterDist: null, treeDist: null, depDist: null };
  const treeDist = nearestTreeDist(world, hut.rect);
  if (treeDist === null || treeDist > 30) return { score: 0, reasons: ['no trees within 30 tiles — nothing to build with'], rejected: true, waterDist, treeDist, depDist: null };
  const depDist = nearestDepositDist(world, hut.rect);
  // Soft scores (soil rides on top in surveyCampSites, after the
  // farm scan — 0.20 of the score): near water (0.30), near trees
  // (0.20), near deposits (0.15), near the arrival (0.15).
  const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
  const distArrival = Math.abs(centre.x - arrival.x) + Math.abs(centre.y - arrival.y);
  const score = clamp01(
    0.30 * (1 - waterDist / 30)
    + 0.20 * (1 - Math.min(treeDist, 30) / 30)
    + 0.15 * (depDist === null ? 0.5 : 1 - Math.min(depDist, 60) / 60)
    + 0.15 * (1 - Math.min(distArrival, 60) / 60),
  );
  reasons.push(`${waterDist} tiles from water`, `${treeDist} tiles from the nearest trees`);
  reasons.push(depDist === null ? 'no deposit nearby' : `${depDist} tiles from the nearest deposit`);
  reasons.push(`${distArrival} tiles from where the party arrived`, `${distCamp} tiles from the founders' camp`);
  return { score, reasons, rejected: false, waterDist, treeDist, depDist };
}

/** The survey: the best camp site near the arrival point. The
 *  candidates are rings around the arrival (8/14/20/30/45/60, 8
 *  directions each); the top 10 by score get the path check + the
 *  farm scan, and the best total wins — an alternative must beat
 *  the best by the margin to displace it. Null when no candidate
 *  passes (the party has nowhere to settle — the scenario fails
 *  honestly). Pure (reads the world, stamps nothing). */
export function surveyCampSites(
  world: IsoWorld,
  arrival: FoundingTile,
  existingRects: readonly { x0: number; y0: number; x1: number; y1: number }[],
): CampSite | null {
  const candidates: { centre: FoundingTile; score: number; reasons: string[] }[] = [];
  for (const r of [8, 14, 20, 30, 45, 60]) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]] as const) {
      const centre = { x: arrival.x + dx, y: arrival.y + dy };
      if (centre.x < 4 || centre.y < 4 || centre.x >= world.w - 4 || centre.y >= world.h - 4) continue;
      if (candidates.some((c) => c.centre.x === centre.x && c.centre.y === centre.y)) continue;
      const scored = scoreCampSite(centre, world, existingRects, arrival);
      if (scored.rejected) continue;
      candidates.push({ centre, score: scored.score, reasons: scored.reasons });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  let best: CampSite | null = null;
  for (const c of candidates.slice(0, 10)) {
    // The walk in must exist (a river between the party and the
    // site is a real barrier — planPathNpc says so).
    const path = planPathNpc(world, arrival, c.centre);
    if (!path) continue;
    // The farm must be plantable. The soil floor used to be 1.0
    // (neutral) — but the only ground near the arrival with a path
    // is the poor-soil east (0.6), and a slow farm beats no farm:
    // the party settles where it can actually walk. The soil term
    // in the total still prefers rich ground when it is reachable.
    const farm = farmTilesFor(world, c.centre);
    if (!farm) continue;
    const total = c.score + 0.20 * (farm.soil / 1.5);
    if (!best || total > best.score + FOUNDING_SITE_MARGIN) {
      const site = campLayoutFor(c.centre, farm.tiles);
      site.score = total;
      site.reasons = [...c.reasons, `farm soil ${farm.soil.toFixed(2)}`, `a ${path.length}-tile walk from where the party arrived`];
      best = site;
    }
  }
  return best;
}

/** The founding stages — the 1057–1058 arc, as a state machine. */
export type FoundingStage =
  | 'surveying' | 'travelling' | 'establishing' | 'sheltering' | 'farming' | 'founded';

/** What one party member is doing this tick. */
export type FoundingMemberState =
  | 'toCamp' | 'toTree' | 'chopping' | 'toStockpile' | 'toSite' | 'building' | 'toFarm' | 'planting' | 'idle';

/** One member of the founding party. */
export type FoundingMember = {
  id: string;
  name: string;
  x: number;
  y: number;
  path: FounderPathState;
  /** Wood carried (0 or 2 — the carrier cap, like the founders). */
  carrying: number;
  chopTicks: number;
  workTicks: number;
  plantTicks: number;
  /** Ticks spent in 'toTree' with an empty path (the work tile went
   *  unreachable after the pick) — give up past 33, don't wait forever. */
  stuckTicks: number;
  state: FoundingMemberState;
  treeTarget: { tx: number; ty: number } | null;
  farmTarget: FoundingTile | null;
};

/** The first hut's build state (the SiteState shape, without the
 *  construction module's site list — the hut is the party's own). */
export type FoundingHutState = {
  state: 'none' | 'building' | 'done';
  progress: number;
  spentWood: number;
  stages: StageSteps;
  /** The stamp failed last tick (a founder crossing the rect) —
   *  the builder waits and retries, the progress is banked. */
  stampBlocked: boolean;
};

/** The founding scenario's state (session-only — NOT saved). */
export type FoundingState = {
  stage: FoundingStage;
  party: FoundingMember[];
  site: CampSite | null;
  /** The stockpile: real counted wood + stone. */
  pile: { wood: number; stone: number };
  hut: FoundingHutState;
  farm: { planted: number; tiles: { x: number; y: number; plantedAt: number }[]; failed: FoundingTile[] };
  ticks: number;
  /** Absolute game minutes (day*1440 + minutes — the farm
   *  timestamps read from this). */
  clockAbs: number;
  day: number;
  /** The founding story, one line per milestone (capped). */
  log: string[];
  arrival: FoundingTile;
  existingRects: readonly { x0: number; y0: number; x1: number; y1: number }[];
  /** Trees whose work tile no path reaches (behind cliffs, across
   *  water) — proven unreachable once, never re-tested or re-picked. */
  unreachableTrees: string[];
};

/** All existing building rects for the overlap check (the
 *  settlement-run buildings + every placed hut in the world). */
export function existingRectsForFounding(
  world: IsoWorld,
  construction: ConstructionState,
  storehouse: StorehouseState,
  foodChain: FoodChainState,
  metalChain: MetalChainState,
  housing: HousingState,
): { x0: number; y0: number; x1: number; y1: number }[] {
  const out = existingBuildingRects(construction, storehouse, foodChain, metalChain, housing);
  for (const h of placedHutRects(world)) out.push({ ...h });
  for (const h of world.huts ?? []) out.push({ x0: h.x0, y0: h.y0, x1: h.x1, y1: h.y1 });
  return out;
}

/** A fresh founding party at the arrival point, surveying. */
export function createFoundingSim(
  world: IsoWorld,
  existingRects: readonly { x0: number; y0: number; x1: number; y1: number }[],
  arrival: FoundingTile = FOUNDING_ARRIVAL,
): FoundingState {
  void world;
  const clockAbs = founderAbsMinutes(1, 480);
  return {
    stage: 'surveying',
    party: FOUNDING_PARTY_NAMES.map((name, i) => ({
      id: `founding-${name}`,
      name,
      x: arrival.x,
      y: arrival.y,
      path: emptyFounderPath(),
      carrying: 0,
      chopTicks: 0,
      workTicks: 0,
      plantTicks: 0,
      stuckTicks: 0,
      state: 'idle' as FoundingMemberState,
      treeTarget: null,
      farmTarget: null,
    })),
    site: null,
    pile: { wood: 0, stone: 0 },
    hut: { state: 'none', progress: 0, spentWood: 0, stages: { foundation: 0, frame: 0, finished: 0 }, stampBlocked: false },
    farm: { planted: 0, tiles: [], failed: [] },
    ticks: 0,
    clockAbs,
    day: 1,
    log: [`Day 1 08:00 — ${FOUNDING_PARTY_NAMES.join(', ')} arrive at the edge of the wilds, looking for land to settle.`],
    arrival: { ...arrival },
    existingRects,
    unreachableTrees: [],
  };
}

/** The clock as HH:MM for the log. */
function fmtClock(clockAbs: number): string {
  const m = Math.floor(clockAbs % 1440);
  return `Day ${Math.floor(clockAbs / 1440)} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Append to the founding log (capped at 12 lines). */
function logFounding(state: FoundingState, line: string): void {
  state.log.push(`${fmtClock(state.clockAbs)} — ${line}`);
  if (state.log.length > 12) state.log.splice(0, state.log.length - 12);
}

/**
 * The nearest tree within maxDist whose work tile is reachable on
 * foot from (x, y) — and the work tile back, so the caller never
 * re-derives it. A tree can sit behind a cliff wall (its work tile
 * enclosed, no path at any A* budget — the 1101 probe stall: the
 * party's nearest tree was in the mountain band, its work tile in a
 * cliff pocket, and the member waited on an empty path forever while
 * standing on the stockpile tile, blocking every delivery). Trees
 * already proven unreachable are skipped, and a tree that fails the
 * reachability check is recorded in blocked (the state's
 * unreachableTrees) so no member ever re-tests or re-picks it.
 * Pure except for reading the world.
 */
function nearestReachableTreeTile(
  world: IsoWorld,
  x: number,
  y: number,
  maxDist: number,
  blocked: string[],
): { tx: number; ty: number; work: FoundingTile } | null {
  const exclude = new Set(blocked);
  for (let attempt = 0; attempt < 8; attempt++) {
    const tree = nearestTreeTile(world, x, y, maxDist, exclude);
    if (!tree) return null;
    const key = tree.tx + ',' + tree.ty;
    const work = treeWorkTile(world, tree.tx, tree.ty);
    if (!work || planPathNpc(world, { x, y }, work) === null) {
      exclude.add(key);
      blocked.push(key);
      continue;
    }
    return { tx: tree.tx, ty: tree.ty, work };
  }
  return null;
}

/** One founding tick (0.9 game-min — call once per founder tick).
 *  Mutates the state (the settlementSim pattern) and the world
 *  (trees felled, hut + farm placements stamped). Returns whether
 *  the world changed (the live tick rebuilds on it). */
export function advanceFoundingTick(
  state: FoundingState,
  world: IsoWorld,
  opts?: { playerTile?: FoundingTile; npcTiles?: FoundingTile[] },
): { worldDirty: boolean } {
  let worldDirty = false;
  state.ticks++;
  state.clockAbs += FOUNDING_TICK_MIN;
  state.day = Math.floor(state.clockAbs / 1440);
  const occupied = (x: number, y: number): boolean =>
    state.party.some((m) => Math.round(m.x) === x && Math.round(m.y) === y);
  const stepTo = (m: FoundingMember, dest: FoundingTile): boolean => {
    const res = stepFounderMove(world, { x: m.x, y: m.y }, dest, m.path, occupied);
    m.x = res.pos.x;
    m.y = res.pos.y;
    m.path = res.path;
    return res.arrived;
  };

  if (state.stage === 'surveying') {
    const site = surveyCampSites(world, state.arrival, state.existingRects);
    if (site) {
      state.site = site;
      state.stage = 'travelling';
      for (const m of state.party) m.state = 'toCamp';
      logFounding(state, `They chose a site at (${site.centre.x},${site.centre.y}) — ${site.reasons.join(' · ')}.`);
    } else {
      logFounding(state, 'No suitable land near the arrival — they keep looking.');
    }
    return { worldDirty };
  }
  if (!state.site) return { worldDirty };
  const site = state.site;

  // --- Stage transitions (checked every tick). ---
  if (state.stage === 'travelling') {
    const arrived = state.party.every((m) => Math.abs(m.x - site.centre.x) + Math.abs(m.y - site.centre.y) <= 1);
    if (arrived) {
      state.stage = 'establishing';
      for (const m of state.party) m.state = 'idle';
      logFounding(state, `They reached the site and raised the camp marker at (${site.centre.x},${site.centre.y}).`);
    }
  } else if (state.stage === 'establishing' && state.pile.wood >= FOUNDING_HUT_WOOD) {
    state.stage = 'sheltering';
    state.hut.state = 'building';
    for (const m of state.party) if (m.state !== 'toStockpile') m.state = 'idle';
    logFounding(state, `The stockpile holds ${state.pile.wood} wood — enough for the first hut.`);
  } else if (state.stage === 'sheltering' && state.hut.state === 'done') {
    state.stage = 'farming';
    for (const m of state.party) if (m.state !== 'toStockpile') m.state = 'idle';
    logFounding(state, 'The first hut stands — now the farm, so the camp can feed itself.');
  } else if (state.stage === 'farming' && state.farm.planted >= site.farmTiles.length) {
    state.stage = 'founded';
    for (const m of state.party) m.state = 'idle';
    logFounding(state, `The camp is founded at (${site.centre.x},${site.centre.y}) — shelter, stockpile, and a growing farm.`);
    return { worldDirty };
  }
  if (state.stage === 'founded') return { worldDirty };

  // --- The party works. ---
  for (let i = 0; i < state.party.length; i++) {
    const m = state.party[i];
    if (m.state === 'toCamp') {
      if (stepTo(m, site.centre)) m.state = 'idle';
      continue;
    }
    if (m.state === 'idle') {
      if (state.stage === 'establishing' || state.stage === 'sheltering') {
        // The builder (member 0) builds in the sheltering stage;
        // everyone else chops + delivers (the pile feeds the hut).
        if (state.stage === 'sheltering' && i === 0 && state.hut.state === 'building') {
          m.state = 'toSite';
          continue;
        }
        if (m.carrying > 0) { m.state = 'toStockpile'; continue; }
        // Only commit to a tree whose work tile a path actually
        // reaches — the nearest tree can sit in a cliff pocket.
        const found = nearestReachableTreeTile(world, Math.round(m.x), Math.round(m.y), 30, state.unreachableTrees);
        if (!found) continue;
        m.treeTarget = { tx: found.tx, ty: found.ty };
        m.stuckTicks = 0;
        m.state = 'toTree';
        continue;
      }
      if (state.stage === 'farming') {
        const next = site.farmTiles.find((t) => !state.farm.tiles.some((p) => p.x === t.x && p.y === t.y) && !state.farm.failed.some((f) => f.x === t.x && f.y === t.y));
        if (!next) continue;
        m.farmTarget = { ...next };
        m.state = 'toFarm';
        continue;
      }
      continue;
    }
    if (m.state === 'toTree' && m.treeTarget) {
      const work = treeWorkTile(world, m.treeTarget.tx, m.treeTarget.ty);
      if (!work) { m.treeTarget = null; m.state = 'idle'; continue; }
      // The work tile went unreachable after the pick (a placement
      // landed on it) — the path stays empty and stepTo never moves.
      // Give up after three full replan cycles instead of waiting
      // forever on the stockpile tile, blocking every delivery. (A
      // member already standing on the work tile is not stuck —
      // stepTo below returns true for it.)
      const destKey = work.x + ',' + work.y;
      const onWorkTile = Math.round(m.x) === work.x && Math.round(m.y) === work.y;
      if (!onWorkTile && m.path.path.length === 0 && m.path.destKey === destKey) {
        m.stuckTicks++;
        if (m.stuckTicks > 33) {
          state.unreachableTrees.push(m.treeTarget.tx + ',' + m.treeTarget.ty);
          m.treeTarget = null;
          m.state = 'idle';
          m.stuckTicks = 0;
        }
        continue;
      }
      m.stuckTicks = 0;
      if (stepTo(m, work)) { m.state = 'chopping'; m.chopTicks = 0; }
      continue;
    }
    if (m.state === 'chopping' && m.treeTarget) {
      m.chopTicks++;
      if (m.chopTicks >= FOUNDER_CHOP_TICKS) {
        // chopTreeAt is false when the tree is already gone (another
        // member felled it first) — no wood, no empty trip to the
        // stockpile: re-target instead of walking there carrying 0
        // and blocking the pile for the members who have wood.
        if (chopTreeAt(world, m.treeTarget.tx, m.treeTarget.ty)) {
          m.carrying = FOUNDER_WOOD_PER_TREE;
          worldDirty = true;
          m.state = 'toStockpile';
        } else {
          m.state = 'idle';
        }
        m.treeTarget = null;
      }
      continue;
    }
    if (m.state === 'toStockpile') {
      if (stepTo(m, site.stockpile)) {
        state.pile.wood += m.carrying;
        m.carrying = 0;
        m.state = 'idle';
      }
      continue;
    }
    if (m.state === 'toSite') {
      if (stepTo(m, site.hut.approach)) { m.state = 'building'; m.workTicks = 0; }
      continue;
    }
    if (m.state === 'building') {
      // The hut is finished (progress 6) but the stamp failed (a
      // founder crossing the rect) — wait at the site and retry;
      // the progress is banked, no wood is spent twice.
      if (state.hut.progress >= HUT_WORK_STEPS) {
        const placed = validatePlacement(world, HUT_KIND, site.hut.centre.x, site.hut.centre.y, opts?.playerTile ?? { x: 0, y: 0 }, [...(opts?.npcTiles ?? []), ...state.party.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))], 0);
        if (placed.ok) {
          addPlacement(world, placed.item);
          worldDirty = true;
          state.hut.state = 'done';
          state.hut.stampBlocked = false;
          logFounding(state, `The first hut is finished at (${site.hut.centre.x},${site.hut.centre.y}) — ${HUT_WORK_STEPS} steps, ${state.hut.spentWood} wood.`);
        } else {
          state.hut.stampBlocked = true;
        }
        continue;
      }
      m.workTicks++;
      if (m.workTicks >= HUT_TICKS_PER_STEP) {
        m.workTicks = 0;
        if (state.pile.wood >= HUT_WOOD_PER_STEP) {
          state.pile.wood -= HUT_WOOD_PER_STEP;
          state.hut.progress++;
          state.hut.spentWood += HUT_WOOD_PER_STEP;
          state.hut.stages = stageStepsFor(state.hut.progress, HUT_WORK_STEPS);
        }
        // Otherwise the pile is empty — wait for the choppers to
        // deliver (they keep working; no deadlock).
      }
      continue;
    }
    if (m.state === 'toFarm' && m.farmTarget) {
      if (stepTo(m, m.farmTarget)) { m.state = 'planting'; m.plantTicks = 0; }
      continue;
    }
    if (m.state === 'planting' && m.farmTarget) {
      m.plantTicks++;
      if (m.plantTicks >= FOUNDER_PLANT_TICKS) {
        const t = m.farmTarget;
        const planted = plantFarmTile(world, t.x, t.y, Math.round(state.clockAbs));
        if (planted.ok) {
          state.farm.tiles.push({ x: t.x, y: t.y, plantedAt: Math.round(state.clockAbs) });
          state.farm.planted++;
          worldDirty = true;
        } else {
          state.farm.failed.push({ ...t });
        }
        m.farmTarget = null;
        m.state = 'idle';
      }
      continue;
    }
  }
  return { worldDirty };
}

/** The founding as one report line (the Control Center + the
 *  probe quote it). */
export function foundingReportLine(state: FoundingState | null): string {
  if (!state) return 'Founding: no party in the wilds';
  if (!state.site) return `Founding: ${state.stage} — surveying the land near (${state.arrival.x},${state.arrival.y})`;
  const s = state.site;
  switch (state.stage) {
    case 'travelling': return `Founding: travelling to the chosen site at (${s.centre.x},${s.centre.y}) — ${s.reasons.join(' · ')}`;
    case 'establishing': return `Founding: establishing the camp at (${s.centre.x},${s.centre.y}) — stockpile ${state.pile.wood}/${FOUNDING_HUT_WOOD} wood`;
    case 'sheltering': return `Founding: building the first hut at (${s.hut.centre.x},${s.hut.centre.y}) — ${state.hut.progress}/${HUT_WORK_STEPS} steps, pile ${state.pile.wood} wood`;
    case 'farming': return `Founding: planting the farm at (${s.centre.x},${s.centre.y}) — ${state.farm.planted}/${s.farmTiles.length} tiles in the ground`;
    case 'founded': return `Founding: founded at (${s.centre.x},${s.centre.y}) — shelter, stockpile, and a growing farm`;
    default: return `Founding: ${state.stage} at (${s.centre.x},${s.centre.y})`;
  }
}

/** Validate the founding module's data — returns the problems
 *  (empty when clean). The sim and the standalone asserts both
 *  call it. */
export function validateFounding(): string[] {
  const problems: string[] = [];
  if (FOUNDING_PARTY_SIZE !== FOUNDING_PARTY_NAMES.length) problems.push(`party size ${FOUNDING_PARTY_SIZE} does not match ${FOUNDING_PARTY_NAMES.length} names`);
  const seen = new Set<string>();
  for (const n of FOUNDING_PARTY_NAMES) {
    if (seen.has(n)) problems.push(`duplicate party name: ${n}`);
    seen.add(n);
    if ((FOUNDER_NAMES as string[]).includes(n)) problems.push(`party name ${n} collides with a founder`);
    if ((RESIDENT_NAMES as string[]).includes(n)) problems.push(`party name ${n} collides with a resident`);
  }
  if (FOUNDING_MIN_DIST_FROM_CAMP < 10) problems.push('the minimum distance from the existing camp is too small for a new settlement');
  if (FOUNDING_SITE_MARGIN <= 0 || FOUNDING_SITE_MARGIN >= 1) problems.push('the site margin must be between 0 and 1');
  if (FOUNDING_TICK_MIN !== 0.9) problems.push('the founding tick must match the settlement tick (0.9 game-min)');
  // The layout geometry: hut 4x3, south door, approach south of
  // the door, stockpile/eat either side of the centre.
  const layout = campLayoutFor({ x: 100, y: 100 }, [{ x: 95, y: 102 }, { x: 96, y: 102 }, { x: 95, y: 103 }, { x: 96, y: 103 }]);
  if (layout.hut.rect.x1 - layout.hut.rect.x0 !== 3 || layout.hut.rect.y1 - layout.hut.rect.y0 !== 2) problems.push('the founding hut must be a 4x3 rect');
  if (layout.hut.door.y !== layout.hut.rect.y1 || layout.hut.approach.y !== layout.hut.door.y + 1) problems.push('the founding hut door must face south with the approach one tile further south');
  if (layout.stockpile.x !== 101 || layout.eatTile.x !== 99) problems.push('the stockpile + eat tile must sit either side of the camp centre');
  if (layout.hut.sleepTiles.length !== 3) problems.push('the founding hut must sleep three (the north row minus the door lane)');
  return problems;
}
