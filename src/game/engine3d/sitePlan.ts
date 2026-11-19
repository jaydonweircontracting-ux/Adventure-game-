/**
 * BUILD 1100 (0x23, Living World plan Phase 4.2): construction
 * intelligence — site selection + the build queue.
 *
 * Exists now: hut sites hardcoded (HUT_SITES); the build-claim
 * order is FIXED code order in both ticks (settlementSim.ts +
 * worldSimulation3d.ts): hut (nearest site) -> storehouse -> bridge
 * (nearest startable) -> mill -> bakery -> smelter -> blacksmith ->
 * sawmill -> carpenter -> workshop -> inn. Each branch has its own
 * startability gate (day, prerequisites, resources). The "decision"
 * of what to build next is the code order + gates — no scored need,
 * no site choice, no explanation. The builder-first claiming gate
 * (1098) is the foundation this builds on; the 15 professions
 * already exist as data (architect + mayor are data-only — this
 * build gives them their planning work: the Architect plans the
 * layout, the Mayor sets the priority).
 *
 * This module is the decision system, as data + pure functions
 * (the professions.ts pattern — the ticks call it, it changes no
 * behaviour by itself):
 *
 * - THE MAYOR'S PRIORITY (need scoring): every settlement-run
 *   building scored 0..1 from live state + a reason string.
 *   The score is a PROGRESSION STAGE + a live URGENCY. The stage
 *   is the settlement's growth plan (housing -> storage -> food ->
 *   materials -> hospitality -> infrastructure — the order the
 *   founders have always built in, now data instead of code
 *   order); the urgency is the building's specific pressure
 *   (beds short, food short, grain piling, ore landed, timber
 *   short). On the normal trajectory the stage order holds, so the
 *   24h + week numbers are unchanged; in a crisis the urgency can
 *   outrank a stage (a mill at food 0 outranks a storehouse at
 *   low storage pressure — food before walls, genuinely).
 * - THE ARCHITECT'S SITE SELECTION: every building's surveyed site
 *   scored against an alternative candidate ring around camp —
 *   clear (no water/tree/rock, no overlap with an existing
 *   building rect — a hard reject), door reachable (planPathNpc
 *   camp -> approach — a hard reject), distance to camp, distance
 *   to water (mill/bakery), distance to the building's resource
 *   (deposits for smelter/blacksmith, trees for sawmill/
 *   carpenter). The surveyed site must WIN on merit — it was
 *   surveyed clear, near camp, near its resource, reachable — and
 *   the asserts prove the scorer rejects bad sites. Hut sites are
 *   a SEQUENCED layout (site 0 east of camp, then site 1 north,
 *   then site 2 west — the settlement grows around the camp in a
 *   ring): the Architect validates the next site in the sequence,
 *   it does not re-order it (site 1 is nearer camp than site 0,
 *   so a pure distance scorer would build hut 1 first and move
 *   M1069). Bridges use the detected sites (paths.ts).
 * - THE SETTLEMENT PLAN: { building, site, need, reasons,
 *   decidedDay } — the Mayor + Architect together. It rides in
 *   the founders save as a compatible field (v12, no version move
 *   — the foodChain/metalChain/housing pattern). The ticks
 *   re-plan when the plan's building is done or no longer
 *   startable; otherwise the plan stands (stable by construction
 *   — the same plan every tick until the need changes).
 *
 * The ticks consult the plan for the build-claim ORDER (the plan's
 * building claims first; the fixed-order branches stay as the
 * fallback for other founders / when the plan's building is not
 * claimable). The E report + Control Center show the plan + its
 * reasons — "why here, why this building".
 *
 * Pure module (no React, no WebGL, no localStorage — only the
 * world read for terrain + paths) so the sim and the standalone
 * asserts can import it directly.
 */

import { planPathNpc } from './townsfolk3d';
import { terrainAt, type IsoWorld } from '../iso/isoWorld';
import {
  HUT_SITES, nearestUnfinishedSite, type ConstructionState, type HutSite,
} from './construction';
import {
  STOREHOUSE_SITE_ID, STOREHOUSE_RECT, STOREHOUSE_DOOR, STOREHOUSE_APPROACH,
  type StorehouseState, canStartStorehouse,
} from './storehouse';
import {
  MILL_SITE_ID, MILL_RECT, MILL_DOOR, MILL_APPROACH,
  BAKERY_SITE_ID, BAKERY_RECT, BAKERY_DOOR, BAKERY_APPROACH,
  type FoodChainState, canStartMill, canStartBakery,
} from './foodChain';
import {
  SMELTER_SITE_ID, SMELTER_RECT, SMELTER_DOOR, SMELTER_APPROACH,
  BLACKSMITH_SITE_ID, BLACKSMITH_RECT, BLACKSMITH_DOOR, BLACKSMITH_APPROACH,
  SAWMILL_SITE_ID, SAWMILL_RECT, SAWMILL_DOOR, SAWMILL_APPROACH,
  CARPENTER_SITE_ID, CARPENTER_RECT, CARPENTER_DOOR, CARPENTER_APPROACH,
  WORKSHOP_SITE_ID, WORKSHOP_RECT, WORKSHOP_DOOR, WORKSHOP_APPROACH,
  type MetalChainState, canStartSmelter, canStartBlacksmith, canStartSawmill,
  canStartCarpenter, canStartWorkshop,
} from './metalChain';
import {
  INN_SITE_ID, INN_RECT, INN_DOOR, INN_APPROACH,
  type HousingState, canStartInn,
} from './housing';
import { type BridgeSite, canStartBridge } from './paths';

/** The buildings the settlement plan can choose (the founders'
 *  settlement-run buildings — the ones with a staged build path
 *  and a site). */
export type PlanBuildingId =
  | 'hut' | 'storehouse' | 'mill' | 'bakery'
  | 'smelter' | 'blacksmith' | 'sawmill' | 'carpenter' | 'workshop'
  | 'inn' | 'bridge';

/** The plan's buildings, in progression (stage) order — the order
 *  the founders have always built in (hut -> storehouse -> mill ->
 *  bakery -> smelter -> blacksmith -> sawmill -> carpenter ->
 *  workshop -> inn -> bridge). The stage is the Mayor's growth
 *  plan, as data. */
export const PLAN_BUILDINGS: PlanBuildingId[] = [
  'hut', 'storehouse', 'mill', 'bakery', 'smelter', 'blacksmith',
  'sawmill', 'carpenter', 'workshop', 'inn', 'bridge',
];

/** The progression stage of a building (0 = first). */
export function planStageFor(building: PlanBuildingId): number {
  return PLAN_BUILDINGS.indexOf(building);
}

/** The stage base score: 1.0 for the hut, -0.07 per stage after
 *  it (the bridge, last, is 0.30). The urgency (0..0.25) rides on
 *  top — a later stage at full urgency can outrank an earlier
 *  stage at none, but on the normal trajectory the stage order
 *  holds. */
export function planStageBase(building: PlanBuildingId): number {
  return Math.max(0, 1 - planStageFor(building) * 0.07);
}

/** The most urgency can add to a need score. A mill at food 0
 *  (urgency 0.25) reaches 0.86 + 0.25 = 1.0 (capped) — it ties
 *  the hut, and the tie-break (stage order) still builds the hut
 *  first: beds before food on a tie, food before walls otherwise. */
export const PLAN_URGENCY_MAX = 0.25;

/** The margin an alternative site must beat the current best by
 *  to displace it (0.05 of the 0..1 score): the surveyed site is
 *  the settlement's known-good site, so a ring candidate one tile
 *  nearer camp (worth ~0.01) must not move the mill — an
 *  alternative has to be clearly better (several tiles nearer
 *  camp, or much nearer water / its resource) to win. */
export const PLAN_SITE_MARGIN = 0.05;

/** A planned site: the rect + its door + its approach tile (the
 *  build work tile, the exit point, the door-transition tile). */
export type PlannedSite = {
  rect: { x0: number; y0: number; x1: number; y1: number };
  door: { x: number; y: number };
  approach: { x: number; y: number };
};

/** A hut site as a planned site (same geometry). */
export function plannedSiteForHutSite(site: HutSite): PlannedSite {
  return { rect: { ...site.rect }, door: { ...site.door }, approach: { ...site.approach } };
}

/** The surveyed site for a building (the site its module surveyed
 *  — the site the founders have always built on). Null for the hut
 *  (its site is the next in the construction sequence) and for the
 *  bridge (its site is a detected site). */
export function surveyedSiteFor(building: PlanBuildingId): PlannedSite | null {
  switch (building) {
    case 'storehouse': return { rect: { ...STOREHOUSE_RECT }, door: { ...STOREHOUSE_DOOR }, approach: { ...STOREHOUSE_APPROACH } };
    case 'mill': return { rect: { ...MILL_RECT }, door: { ...MILL_DOOR }, approach: { ...MILL_APPROACH } };
    case 'bakery': return { rect: { ...BAKERY_RECT }, door: { ...BAKERY_DOOR }, approach: { ...BAKERY_APPROACH } };
    case 'smelter': return { rect: { ...SMELTER_RECT }, door: { ...SMELTER_DOOR }, approach: { ...SMELTER_APPROACH } };
    case 'blacksmith': return { rect: { ...BLACKSMITH_RECT }, door: { ...BLACKSMITH_DOOR }, approach: { ...BLACKSMITH_APPROACH } };
    case 'sawmill': return { rect: { ...SAWMILL_RECT }, door: { ...SAWMILL_DOOR }, approach: { ...SAWMILL_APPROACH } };
    case 'carpenter': return { rect: { ...CARPENTER_RECT }, door: { ...CARPENTER_DOOR }, approach: { ...CARPENTER_APPROACH } };
    case 'workshop': return { rect: { ...WORKSHOP_RECT }, door: { ...WORKSHOP_DOOR }, approach: { ...WORKSHOP_APPROACH } };
    case 'inn': return { rect: { ...INN_RECT }, door: { ...INN_DOOR }, approach: { ...INN_APPROACH } };
    default: return null;
  }
}

/** The build-job site id for a plan building (the id the job
 *  board names the build job by). The hut's job id is per-site
 *  (hut-site-0/1/2); the bridge's is per detected site. */
export function planSiteIdFor(building: PlanBuildingId, site?: PlannedSite): string {
  switch (building) {
    case 'hut': {
      const hut = site ? HUT_SITES.find((s) => s.rect.x0 === site.rect.x0 && s.rect.y0 === site.rect.y0 && s.rect.x1 === site.rect.x1 && s.rect.y1 === site.rect.y1) : undefined;
      return hut ? hut.id : 'hut-site-0';
    }
    case 'storehouse': return STOREHOUSE_SITE_ID;
    case 'mill': return MILL_SITE_ID;
    case 'bakery': return BAKERY_SITE_ID;
    case 'smelter': return SMELTER_SITE_ID;
    case 'blacksmith': return BLACKSMITH_SITE_ID;
    case 'sawmill': return SAWMILL_SITE_ID;
    case 'carpenter': return CARPENTER_SITE_ID;
    case 'workshop': return WORKSHOP_SITE_ID;
    case 'inn': return INN_SITE_ID;
    case 'bridge': return site ? `bridge-${site.rect.x0},${site.rect.y0}` : 'bridge-site';
  }
}

/** The display name for a plan building. */
export function planBuildingLabel(building: PlanBuildingId): string {
  switch (building) {
    case 'hut': return 'Hut';
    case 'storehouse': return 'Storehouse';
    case 'mill': return 'Mill';
    case 'bakery': return 'Bakery';
    case 'smelter': return 'Smelter';
    case 'blacksmith': return 'Blacksmith';
    case 'sawmill': return 'Sawmill';
    case 'carpenter': return 'Carpenter';
    case 'workshop': return 'Workshop';
    case 'inn': return 'Inn';
    case 'bridge': return 'Bridge';
  }
}

/** What the Mayor reads to score the need — all from state the
 *  ticks already have (no new queries). */
export type SettlementNeedInput = {
  /** The settlement day (1-based). */
  day: number;
  /** The camp centre (the settlement's heart — distances are from
   *  here). */
  camp: { x: number; y: number };
  /** Meals in the granary. */
  food: number;
  /** Grain in the granary. */
  grain: number;
  /** Flour in the granary. */
  flour: number;
  /** Beds in finished huts. */
  beds: number;
  /** Founders + arrived residents. */
  population: number;
  /** Residents waiting for a bed (the arrival queue — a newcomer
   *  at the gate). */
  waitingArrivals: number;
  /** Wood in the camp pile. */
  campWood: number;
  /** Stone in the camp pile. */
  campStone: number;
  /** Wood in the storehouse store. */
  storehouseWood: number;
  /** Iron in the storehouse store. */
  storehouseIron: number;
  /** Coal in the storehouse store. */
  storehouseCoal: number;
  /** Ingots in the storehouse store. */
  storehouseIngots: number;
  /** Tools in the storehouse store. */
  storehouseTools: number;
  /** Timber in the storehouse store. */
  storehouseTimber: number;
  /** Furniture in the storehouse store. */
  storehouseFurniture: number;
  /** The hut construction state. */
  construction: ConstructionState;
  /** The storehouse state. */
  storehouse: StorehouseState;
  /** The mill + bakery state. */
  foodChain: FoodChainState;
  /** The five chain buildings' state. */
  metalChain: MetalChainState;
  /** The inn + worker-housing state. */
  housing: HousingState;
  /** The detected bridge sites. */
  bridges: readonly BridgeSite[];
  /** The founding huts (0+1) are done. */
  foundingDone: boolean;
};

/** One building's scored need: the score + why (the E report
 *  quotes the reason). */
export type BuildingNeed = {
  building: PlanBuildingId;
  /** 0..1 — stage base + urgency, capped at 1. */
  need: number;
  /** The urgency part (0..PLAN_URGENCY_MAX) — the live pressure. */
  urgency: number;
  /** Why this building, in one line. */
  reason: string;
};

/** The urgency for a building from its live pressure (0..1 —
 *  scaled to PLAN_URGENCY_MAX by the caller). Pure. */
function urgencyFor(building: PlanBuildingId, input: SettlementNeedInput): { pressure: number; reason: string } {
  const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
  switch (building) {
    case 'hut': {
      const shortfall = input.population + input.waitingArrivals - input.beds;
      if (shortfall <= 0) return { pressure: 0, reason: 'everyone has a bed' };
      if (input.waitingArrivals > 0) return { pressure: 1, reason: `${input.waitingArrivals} newcomer${input.waitingArrivals > 1 ? 's wait' : ' waits'} for a bed` };
      return { pressure: clamp01(shortfall / 3), reason: `${shortfall} founder${shortfall > 1 ? 's' : ''} without a bed` };
    }
    case 'storehouse': {
      const pressure = clamp01((input.campWood + input.campStone + input.storehouseIron + input.storehouseCoal) / 40);
      return { pressure, reason: pressure > 0.5 ? 'the camp pile is full of wood and stone with nowhere to store it' : 'the settlement needs somewhere to store wood, stone and ore' };
    }
    case 'mill': {
      const grainPressure = clamp01(input.grain / 60);
      const foodShortage = Math.max(0, 1 - input.food / 15);
      if (foodShortage >= 0.6) return { pressure: foodShortage, reason: `only ${input.food} meals left — the grain must be ground` };
      return { pressure: grainPressure, reason: `${input.grain} grain piled in the granary, nothing to grind it with` };
    }
    case 'bakery': {
      const flourPressure = clamp01(input.flour / 50);
      const foodShortage = Math.max(0, 1 - input.food / 15);
      if (foodShortage >= 0.6) return { pressure: foodShortage, reason: `only ${input.food} meals left — the flour must be baked` };
      return { pressure: flourPressure, reason: `${input.flour} flour piled up, nothing to bake it with` };
    }
    case 'smelter': {
      const pressure = clamp01(input.storehouseIron / 20);
      return { pressure, reason: input.storehouseIron > 0 ? `${input.storehouseIron} iron waiting to be smelted` : 'no ore yet — the smelter waits for the first iron' };
    }
    case 'blacksmith': {
      const pressure = clamp01(input.storehouseIngots / 10);
      return { pressure, reason: input.storehouseIngots > 0 ? `${input.storehouseIngots} ingots waiting to be smithed into tools` : 'no ingots yet — the smith waits for the smelter' };
    }
    case 'sawmill': {
      const pressure = clamp01(input.campWood / 40);
      return { pressure, reason: `${input.campWood} wood in the pile — the sawmill turns it into timber` };
    }
    case 'carpenter': {
      const pressure = clamp01(input.storehouseTimber / 20);
      return { pressure, reason: input.storehouseTimber > 0 ? `${input.storehouseTimber} timber waiting to be worked into furniture` : 'no timber yet — the carpenter waits for the sawmill' };
    }
    case 'workshop': {
      const pressure = input.storehouseTools > 0 ? 1 : 0;
      return { pressure, reason: input.storehouseTools > 0 ? `${input.storehouseTools} tools on hand — the workshop can open` : 'no tools yet — the workshop waits for the smith' };
    }
    case 'inn': {
      return { pressure: 0.5, reason: 'travellers pass through with nowhere to rest' };
    }
    case 'bridge': {
      return { pressure: 0.5, reason: 'a path meets the river — the crossing needs a bridge' };
    }
  }
}

/** Is the building STARTABLE right now (its existing gate —
 *  the same gate the job board uses, so the plan and the board
 *  never disagree about what can be built)? The hut is startable
 *  while a hut site is unfinished and buildable (the gated worker
 *  housing counts only once its gate opens). Pure. */
export function planBuildingStartable(building: PlanBuildingId, input: SettlementNeedInput): boolean {
  switch (building) {
    case 'hut': return nearestUnfinishedSite(input.construction, input.camp, input.day) !== null;
    case 'storehouse': return canStartStorehouse(input.storehouse, input.day, input.foundingDone, input.campWood, input.campStone);
    case 'mill': return canStartMill(input.foodChain, input.grain, input.campWood);
    case 'bakery': return canStartBakery(input.foodChain, input.campWood);
    case 'smelter': return canStartSmelter(input.metalChain, input.storehouseIron, input.campWood + input.storehouseWood);
    case 'blacksmith': return canStartBlacksmith(input.metalChain, input.campWood + input.storehouseWood);
    case 'sawmill': return canStartSawmill(input.metalChain, input.storehouse.state === 'done', input.campWood + input.storehouseWood);
    case 'carpenter': return canStartCarpenter(input.metalChain, input.campWood + input.storehouseWood);
    case 'workshop': return canStartWorkshop(input.metalChain, input.foodChain.bakery.state === 'done', input.campWood + input.storehouseWood, input.storehouseTools);
    case 'inn': return canStartInn(input.housing, input.construction, input.campWood, input.storehouseWood, input.day);
    case 'bridge': return input.bridges.some((s) => canStartBridge(s, input.day, input.foundingDone, input.storehouse.state === 'done', input.campWood));
  }
}

/** Is the building DONE (its construction state says so)? The
 *  hut is done when every hut site is done; the bridge is done
 *  when every detected site is done (or none is startable). Pure. */
export function planBuildingDone(building: PlanBuildingId, input: SettlementNeedInput): boolean {
  switch (building) {
    case 'hut': return !input.construction.sites.some((s) => s.state !== 'done');
    case 'storehouse': return input.storehouse.state === 'done';
    case 'mill': return input.foodChain.mill.state === 'done';
    case 'bakery': return input.foodChain.bakery.state === 'done';
    case 'smelter': return input.metalChain.smelter.state === 'done';
    case 'blacksmith': return input.metalChain.blacksmith.state === 'done';
    case 'sawmill': return input.metalChain.sawmill.state === 'done';
    case 'carpenter': return input.metalChain.carpenter.state === 'done';
    case 'workshop': return input.metalChain.workshop.state === 'done';
    case 'inn': return input.housing.inn.state === 'done';
    case 'bridge': return input.bridges.length > 0 && input.bridges.every((s) => s.state === 'done');
  }
}

/** Score every plan building's need (the Mayor's table) — stage
 *  base + urgency, capped at 1. Buildings that are done score 0
 *  (nothing to build); buildings that are not startable are still
 *  scored (the queue filters them — the table is the explanation,
 *  the queue is the decision). Pure. */
export function scoreBuildingNeeds(input: SettlementNeedInput): BuildingNeed[] {
  return PLAN_BUILDINGS.map((building) => {
    if (planBuildingDone(building, input)) {
      return { building, need: 0, urgency: 0, reason: `${planBuildingLabel(building)} is done` };
    }
    const { pressure, reason } = urgencyFor(building, input);
    const urgency = pressure * PLAN_URGENCY_MAX;
    const need = Math.min(1, planStageBase(building) + urgency);
    return { building, need, urgency, reason };
  });
}

/** The build queue (the Mayor's decision): the startable
 *  buildings, highest need first, ties broken by progression
 *  stage (the earlier stage wins — the settlement builds in
 *  order when the need is equal). Empty when nothing is
 *  startable. Pure. */
export function buildQueueFor(input: SettlementNeedInput): BuildingNeed[] {
  const scored = scoreBuildingNeeds(input);
  return scored
    .filter((n) => planBuildingStartable(n.building, input))
    .sort((a, b) => (b.need - a.need) || (planStageFor(a.building) - planStageFor(b.building)));
}

/** A candidate site for the Architect to score: a rect of the
 *  building's footprint + its door + approach (south door, like
 *  every surveyed site). */
export type SiteCandidate = PlannedSite;

/** The Architect's score for one candidate site (0..1, with the
 *  reasons). A hard reject scores 0 with a rejection reason:
 *  water/tree/rock in the rect, an overlap with an existing
 *  building rect, or no path from camp to the approach. Pure. */
export function scoreSiteFor(
  building: PlanBuildingId,
  candidate: SiteCandidate,
  world: IsoWorld,
  camp: { x: number; y: number },
  existingRects: readonly { x0: number; y0: number; x1: number; y1: number }[],
): { score: number; reasons: string[]; rejected: boolean } {
  const reasons: string[] = [];
  const { rect, door, approach } = candidate;
  // Hard reject: water / tree / rock in the rect. (A bridge is
  // the exception to the water rule — its one-tile rect IS the
  // river tile it spans; the bank it stands on is the approach.)
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (building !== 'bridge' && terrainAt(world, x, y) === 'water') return { score: 0, reasons: [`water at ${x},${y}`], rejected: true };
      if ((world.trees ?? []).some((t) => t.tx === x && t.ty === y)) return { score: 0, reasons: [`tree at ${x},${y}`], rejected: true };
      if ((world.rocks ?? []).some((r) => r.tx === x && r.ty === y)) return { score: 0, reasons: [`rock at ${x},${y}`], rejected: true };
    }
  }
  // Hard reject: overlap with an existing building rect.
  for (const r of existingRects) {
    if (rect.x0 <= r.x1 && rect.x1 >= r.x0 && rect.y0 <= r.y1 && rect.y1 >= r.y0) {
      return { score: 0, reasons: ['overlaps an existing building'], rejected: true };
    }
  }
  // Hard reject: no path from camp to the approach.
  const path = planPathNpc(world, { x: camp.x, y: camp.y }, { x: approach.x, y: approach.y });
  if (!path) return { score: 0, reasons: ['no path from camp to the door'], rejected: true };
  // Soft scores (0..1 each): near camp, near water (mill/bakery),
  // near the building's resource (deposits/trees).
  const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
  const distCamp = Math.abs(approach.x - camp.x) + Math.abs(approach.y - camp.y);
  const campScore = 1 - Math.min(1, distCamp / 40);
  reasons.push(`${distCamp} tiles from camp`);
  let waterScore = 0.5;
  if (building === 'mill' || building === 'bakery') {
    const waterDist = nearestWaterDist(world, candidate.rect, 30);
    waterScore = waterDist === null ? 0 : 1 - Math.min(1, waterDist / 30);
    reasons.push(waterDist === null ? 'no water nearby' : `${waterDist} tiles from water`);
  }
  let resourceScore = 0.5;
  if (building === 'smelter' || building === 'blacksmith') {
    const depDist = nearestDepositDist(world, candidate.rect);
    resourceScore = depDist === null ? 0 : 1 - Math.min(1, depDist / 60);
    reasons.push(depDist === null ? 'no deposit nearby' : `${depDist} tiles from the nearest deposit`);
  } else if (building === 'sawmill' || building === 'carpenter') {
    const treeDist = nearestTreeDist(world, candidate.rect);
    resourceScore = treeDist === null ? 0 : 1 - Math.min(1, treeDist / 30);
    reasons.push(treeDist === null ? 'no trees nearby' : `${treeDist} tiles from the nearest trees`);
  }
  // The settlement clusters around camp (0.5) — water and the
  // resource matter (0.25 each) but never outrank nearness.
  const score = clamp01(0.5 * campScore + 0.25 * waterScore + 0.25 * resourceScore);
  void door;
  return { score, reasons, rejected: false };
}

/** Manhattan distance from a rect to the nearest water tile
 *  (coarse scan, step 2, out to `radius`), or null when none is
 *  in range. Pure read. */
export function nearestWaterDist(world: IsoWorld, rect: { x0: number; y0: number; x1: number; y1: number }, radius: number): number | null {
  let best: number | null = null;
  const cx = Math.floor((rect.x0 + rect.x1) / 2);
  const cy = Math.floor((rect.y0 + rect.y1) / 2);
  for (let y = cy - radius; y <= cy + radius; y += 2) {
    for (let x = cx - radius; x <= cx + radius; x += 2) {
      if (terrainAt(world, x, y) !== 'water') continue;
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (best === null || d < best) best = d;
    }
  }
  return best;
}

/** Manhattan distance from a rect to the nearest mineral deposit,
 *  or null when the world has none. Pure read. */
export function nearestDepositDist(world: IsoWorld, rect: { x0: number; y0: number; x1: number; y1: number }): number | null {
  const deposits = world.mineralDeposits ?? [];
  if (deposits.length === 0) return null;
  const cx = Math.floor((rect.x0 + rect.x1) / 2);
  const cy = Math.floor((rect.y0 + rect.y1) / 2);
  let best: number | null = null;
  for (const d of deposits) {
    const dist = Math.abs(d.x - cx) + Math.abs(d.y - cy);
    if (best === null || dist < best) best = dist;
  }
  return best;
}

/** Manhattan distance from a rect to the nearest tree, or null
 *  when the world has none. Pure read. */
export function nearestTreeDist(world: IsoWorld, rect: { x0: number; y0: number; x1: number; y1: number }): number | null {
  const trees = world.trees ?? [];
  if (trees.length === 0) return null;
  const cx = Math.floor((rect.x0 + rect.x1) / 2);
  const cy = Math.floor((rect.y0 + rect.y1) / 2);
  let best: number | null = null;
  for (const t of trees) {
    const dist = Math.abs(t.tx - cx) + Math.abs(t.ty - cy);
    if (best === null || dist < best) best = dist;
  }
  return best;
}

/** The candidate ring around camp for a building's footprint:
 *  the surveyed site plus alternative rects on a ring (radius 8,
 *  14, 20 — step 6 around the camp, same footprint, south door).
 *  The surveyed site is always a candidate, so the Architect can
 *  confirm it — and the asserts prove it wins. Pure. */
export function candidateSitesFor(
  building: PlanBuildingId,
  footprint: { w: number; h: number },
  camp: { x: number; y: number },
): SiteCandidate[] {
  const out: SiteCandidate[] = [];
  const surveyed = surveyedSiteFor(building);
  if (surveyed) out.push(surveyed);
  const mk = (cx: number, cy: number): SiteCandidate => {
    const x0 = cx - Math.floor(footprint.w / 2);
    const y0 = cy - Math.floor(footprint.h / 2);
    const rect = { x0, y0, x1: x0 + footprint.w - 1, y1: y0 + footprint.h - 1 };
    const door = { x: cx, y: rect.y1 };
    return { rect, door, approach: { x: cx, y: rect.y1 + 1 } };
  };
  for (const r of [8, 14, 20]) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]] as const) {
      const c = mk(camp.x + dx, camp.y + dy);
      // Skip the surveyed site itself (it is already candidate 0)
      // and duplicates.
      if (surveyed && c.rect.x0 === surveyed.rect.x0 && c.rect.y0 === surveyed.rect.y0) continue;
      if (out.some((o) => o.rect.x0 === c.rect.x0 && o.rect.y0 === c.rect.y0)) continue;
      out.push(c);
    }
  }
  return out;
}

/** The footprint for a plan building (from its surveyed site, or
 *  the catalogue footprint for the hut/bridge). Pure. */
export function footprintFor(building: PlanBuildingId): { w: number; h: number } {
  const surveyed = surveyedSiteFor(building);
  if (surveyed) return { w: surveyed.rect.x1 - surveyed.rect.x0 + 1, h: surveyed.rect.y1 - surveyed.rect.y0 + 1 };
  if (building === 'hut') return { w: 4, h: 3 };
  return { w: 3, h: 1 };
}

/** The Architect's site choice for a building: the best-scoring
 *  candidate (surveyed site + ring), or null when every candidate
 *  is rejected. The hut's site is the next in the construction
 *  sequence (validated, not re-ordered — see the module doc);
 *  the bridge's site is the nearest startable detected site.
 *  Returns the site + its score + its reasons. Pure. */
export function planSiteFor(
  building: PlanBuildingId,
  world: IsoWorld,
  input: SettlementNeedInput,
  existingRects: readonly { x0: number; y0: number; x1: number; y1: number }[],
): { site: PlannedSite; score: number; reasons: string[] } | null {
  if (building === 'hut') {
    const next = nearestUnfinishedSite(input.construction, input.camp, input.day);
    if (!next) return null;
    const site = plannedSiteForHutSite(next);
    const scored = scoreSiteFor('hut', site, world, input.camp, existingRects);
    if (scored.rejected) return null;
    return { site, score: scored.score, reasons: [`next in the housing sequence (${next.id})`, ...scored.reasons] };
  }
  if (building === 'bridge') {
    let best: { site: PlannedSite; score: number; reasons: string[] } | null = null;
    for (const s of input.bridges) {
      if (!canStartBridge(s, input.day, input.foundingDone, input.storehouse.state === 'done', input.campWood)) continue;
      const site: PlannedSite = { rect: { x0: s.x, y0: s.y, x1: s.x, y1: s.y }, door: { x: s.x, y: s.y }, approach: { ...s.workTile } };
      const scored = scoreSiteFor('bridge', site, world, input.camp, existingRects);
      if (scored.rejected) continue;
      if (!best || scored.score > best.score) best = { site, score: scored.score, reasons: [`detected crossing at ${s.x},${s.y}`, ...scored.reasons] };
    }
    return best;
  }
  const footprint = footprintFor(building);
  const candidates = candidateSitesFor(building, footprint, input.camp);
  let best: { site: PlannedSite; score: number; reasons: string[] } | null = null;
  for (const c of candidates) {
    const scored = scoreSiteFor(building, c, world, input.camp, existingRects);
    if (scored.rejected) continue;
    // An alternative must beat the current best by the margin —
    // the surveyed site (candidate 0) holds against one-tile
    // noise and only a clearly better site displaces it.
    if (!best || scored.score > best.score + PLAN_SITE_MARGIN) {
      const surveyed = surveyedSiteFor(building);
      const isSurveyed = surveyed !== null && c.rect.x0 === surveyed.rect.x0 && c.rect.y0 === surveyed.rect.y0;
      best = { site: c, score: scored.score, reasons: [isSurveyed ? 'the surveyed site — clear, near camp, near its resource' : 'an alternative site that scored higher', ...scored.reasons] };
    }
  }
  return best;
}

/** The settlement plan: what to build next, where, and why. */
export type SettlementPlan = {
  /** The building the Mayor picked. */
  building: PlanBuildingId;
  /** Where the Architect put it. */
  site: PlannedSite;
  /** The Mayor's need score (0..1). */
  need: number;
  /** Why this building + why here (the E report quotes these). */
  reasons: string[];
  /** The day the plan was decided (a plan from an old day is
   *  re-decided when the need changes). */
  decidedDay: number;
};

/** No plan yet (a fresh settlement, or an old save). */
export function freshPlan(): SettlementPlan | null {
  return null;
}

/** The plan's building's state: 'done' when it stands,
 *  'building' when work has started, 'none' when it has not. The
 *  hut + the bridge read the PLAN's site (they have several); the
 *  rest read the building's own state. Pure. */
export function planBuildingState(plan: SettlementPlan, input: SettlementNeedInput): 'none' | 'building' | 'done' {
  if (plan.building === 'hut') {
    const site = HUT_SITES.find((s) => s.rect.x0 === plan.site.rect.x0 && s.rect.y0 === plan.site.rect.y0);
    if (!site) return 'none';
    return input.construction.sites[HUT_SITES.indexOf(site)]?.state ?? 'none';
  }
  if (plan.building === 'bridge') {
    const site = input.bridges.find((s) => s.x === plan.site.rect.x0 && s.y === plan.site.rect.y0);
    if (!site) return 'none';
    return site.state;
  }
  switch (plan.building) {
    case 'storehouse': return input.storehouse.state;
    case 'mill': return input.foodChain.mill.state;
    case 'bakery': return input.foodChain.bakery.state;
    case 'smelter': return input.metalChain.smelter.state;
    case 'blacksmith': return input.metalChain.blacksmith.state;
    case 'sawmill': return input.metalChain.sawmill.state;
    case 'carpenter': return input.metalChain.carpenter.state;
    case 'workshop': return input.metalChain.workshop.state;
    case 'inn': return input.housing.inn.state;
  }
}

/** True when the plan must be re-decided: no plan, the building
 *  is done, its SITE is done (a hut site finished while others
 *  remain — the plan must move to the next site), or it has not
 *  started and is no longer startable (its gate closed — the grain
 *  ran out before the first step, a prerequisite was removed). A
 *  building already underway stays the plan even when its
 *  startability flickers (the grain bin empties mid-build and
 *  refills within ticks — re-planning to nothing and back every few
 *  ticks is churn, not a decision; the job board fails + re-claims
 *  the work while the plan holds). Pure. */
export function planNeedsReplan(plan: SettlementPlan | null, input: SettlementNeedInput): boolean {
  if (!plan) return true;
  // The plan's site went stale: a hut site finished while others
  // remain, or a bridge site finished while others remain — the
  // plan must move to the next site (the building is not done, so
  // the done-check below would not fire).
  if (plan.building === 'hut') {
    const site = HUT_SITES.find((s) => s.rect.x0 === plan.site.rect.x0 && s.rect.y0 === plan.site.rect.y0);
    if (!site) return true;
    if (input.construction.sites[HUT_SITES.indexOf(site)]?.state === 'done') return true;
  } else if (plan.building === 'bridge') {
    const site = input.bridges.find((s) => s.x === plan.site.rect.x0 && s.y === plan.site.rect.y0);
    if (!site || site.state === 'done') return true;
  }
  if (planBuildingDone(plan.building, input)) return true;
  if (planBuildingState(plan, input) === 'building') return false;
  if (!planBuildingStartable(plan.building, input)) return true;
  return false;
}

/** The Mayor + Architect together: the highest-need startable
 *  building + its site. Null when nothing is startable (the
 *  settlement has nothing to build right now). Pure. */
export function planFor(
  input: SettlementNeedInput,
  world: IsoWorld,
  existingRects: readonly { x0: number; y0: number; x1: number; y1: number }[],
): SettlementPlan | null {
  const queue = buildQueueFor(input);
  if (queue.length === 0) return null;
  const pick = queue[0];
  const sited = planSiteFor(pick.building, world, input, existingRects);
  if (!sited) return null;
  return {
    building: pick.building,
    site: sited.site,
    need: pick.need,
    reasons: [pick.reason, ...sited.reasons],
    decidedDay: input.day,
  };
}

/** The plan as one E-report line: "Plan: build a Mill here —
 *  62 grain piled in the granary, nothing to grind it with · 9
 *  tiles from camp". Pure. */
export function planReportLine(plan: SettlementPlan | null): string {
  if (!plan) return 'Plan: nothing to build right now';
  return `Plan: build a ${planBuildingLabel(plan.building)} here — ${plan.reasons.join(' · ')}`;
}

/** Validate a plan value from a save (unknown or malformed ->
 *  null — an old save has no plan, and the tick re-plans). Pure. */
export function sitePlanFromSave(value: unknown): SettlementPlan | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.building !== 'string' || !(PLAN_BUILDINGS as string[]).includes(v.building)) return null;
  const site = v.site as Record<string, unknown> | undefined;
  if (!site || typeof site !== 'object') return null;
  const rect = site.rect as Record<string, unknown> | undefined;
  const door = site.door as Record<string, unknown> | undefined;
  const approach = site.approach as Record<string, unknown> | undefined;
  const isTile = (t: unknown): t is { x: number; y: number } =>
    !!t && typeof t === 'object' && Number.isInteger((t as Record<string, unknown>).x) && Number.isInteger((t as Record<string, unknown>).y);
  if (!rect || !Number.isInteger(rect.x0) || !Number.isInteger(rect.y0) || !Number.isInteger(rect.x1) || !Number.isInteger(rect.y1)) return null;
  if (!isTile(door) || !isTile(approach)) return null;
  if (typeof v.need !== 'number' || v.need < 0 || v.need > 1) return null;
  if (!Array.isArray(v.reasons) || !v.reasons.every((r) => typeof r === 'string')) return null;
  if (typeof v.decidedDay !== 'number' || !Number.isInteger(v.decidedDay)) return null;
  return {
    building: v.building as PlanBuildingId,
    site: {
      rect: { x0: rect.x0 as number, y0: rect.y0 as number, x1: rect.x1 as number, y1: rect.y1 as number },
      door: { x: (door as { x: number }).x, y: (door as { y: number }).y },
      approach: { x: (approach as { x: number }).x, y: (approach as { y: number }).y },
    },
    need: v.need,
    reasons: [...(v.reasons as string[])],
    decidedDay: v.decidedDay,
  };
}

/** Validate the plan module's data — returns the problems
 *  (empty when clean). The sim and the standalone asserts both
 *  call it. */
export function validateSitePlan(): string[] {
  const problems: string[] = [];
  if (PLAN_BUILDINGS.length !== 11) problems.push(`expected 11 plan buildings, got ${PLAN_BUILDINGS.length}`);
  const seen = new Set<string>();
  for (const b of PLAN_BUILDINGS) {
    if (seen.has(b)) problems.push(`duplicate plan building: ${b}`);
    seen.add(b);
    if (planStageBase(b) < 0 || planStageBase(b) > 1) problems.push(`plan building ${b} has a stage base outside 0..1`);
    if (surveyedSiteFor(b) === null && b !== 'hut' && b !== 'bridge') problems.push(`plan building ${b} has no surveyed site`);
    if (planSiteIdFor(b).length === 0) problems.push(`plan building ${b} has no site id`);
  }
  // The stage order is the progression: each stage's base is
  // strictly below the previous stage's base.
  for (let i = 1; i < PLAN_BUILDINGS.length; i++) {
    if (planStageBase(PLAN_BUILDINGS[i]) >= planStageBase(PLAN_BUILDINGS[i - 1])) {
      problems.push(`stage base for ${PLAN_BUILDINGS[i]} does not fall below ${PLAN_BUILDINGS[i - 1]}`);
    }
  }
  return problems;
}

/** All existing building rects for the overlap check (the hut
 *  sites + the storehouse + the food chain + the metal chain +
 *  the inn) — the ticks pass the rects of buildings that already
 *  stand, so a new site never overlaps one. Pure. */
export function existingBuildingRects(
  construction: ConstructionState,
  storehouse: StorehouseState,
  foodChain: FoodChainState,
  metalChain: MetalChainState,
  housing: HousingState,
): { x0: number; y0: number; x1: number; y1: number }[] {
  const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let i = 0; i < HUT_SITES.length; i++) {
    if (construction.sites[i] && construction.sites[i].state === 'done') out.push({ ...HUT_SITES[i].rect });
  }
  if (storehouse.state === 'done') out.push({ ...STOREHOUSE_RECT });
  if (foodChain.mill.state === 'done') out.push({ ...MILL_RECT });
  if (foodChain.bakery.state === 'done') out.push({ ...BAKERY_RECT });
  if (metalChain.smelter.state === 'done') out.push({ ...SMELTER_RECT });
  if (metalChain.blacksmith.state === 'done') out.push({ ...BLACKSMITH_RECT });
  if (metalChain.sawmill.state === 'done') out.push({ ...SAWMILL_RECT });
  if (metalChain.carpenter.state === 'done') out.push({ ...CARPENTER_RECT });
  if (metalChain.workshop.state === 'done') out.push({ ...WORKSHOP_RECT });
  if (housing.inn.state === 'done') out.push({ ...INN_RECT });
  return out;
}
