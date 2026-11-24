/**
 * BUILD 1057 — "First settlers": the first NPC build of the
 * NPC-built-towns vision (studio/NPC_TOWNS_VISION.md, audit in
 * ~/workspace/verify-vision/PLAN.md §5).
 *
 * Three founder NPCs live at a camp in the empty wilderness, driven by
 * needs (hunger/energy/social, ported from villageLife.ts npcNeeds),
 * chopping trees and carrying wood to a visible camp stockpile with a
 * REAL count. Gathering → stockpile, no building yet — construction is
 * the next build, and it needs this stockpile to exist first.
 *
 * DESIGN (all pure here; the view owns the timers, rendering, and I/O):
 *
 * - NEEDS ARE CLOCK-DRIVEN, like villageLife.ts: hunger decays ~9/hr
 *   between meals (villageLife parity), energy drains across the waking
 *   day (06:00–21:30) and restores while sleeping, social drains while
 *   working alone and rises at camp with the others. Decay is a pure
 *   function of ELAPSED GAME MINUTES, not of ticks — so the 1056 wait
 *   (10 game-minutes per 110ms step) advances needs exactly like real
 *   time does, with no special-casing.
 * - ACTIVITY CHOICE is the utility scorer (utility.ts, BUILD 1059):
 *   needs + context (time, food, pile, construction, distances,
 *   who is building, current job) score five activities — sleep /
 *   eat / rest / work / build — and the highest wins. The 1057 fixed
 *   priority is gone; the scorer IS the decision, in the real-time
 *   tick and in the wait-step re-choice.
 * - FOOD: the camp starts with 30 meals — supplies the founders
 *   brought with them. Eating consumes 1 and restores hunger to 100.
 *   Nothing replenishes it yet (farming/hunting is a later build); a
 *   camp out of food has hungry founders, which is a real consequence,
 *   not a hidden refill.
 * - WORK is a state machine: toTree → chopping (3 ticks at the tree)
 *   → toStockpile → deliver (+2 wood, the same as the player's E-key
 *   chop). The founder walks to a walkable tile ADJACENT to the tree
 *   (trees block movement) and chops from there; the tree is removed
 *   with the same mechanism as the player's chop (seeded trees leave
 *   world.trees, wild trees join removedWildTrees), so the player sees
 *   the tree disappear and cannot chop the same tree twice.
 * - THE STOCKPILE is a real count: it goes up ONLY when a founder
 *   delivers wood. The pile is rendered as a log stack in the fx
 *   buffer (houseFx.ts, the wheat precedent) and grows with the count
 *   (1 log at 0 wood, +1 per 2 wood, capped at 6). It is never in the
 *   world, so the player cannot collect it and Build Remove cannot
 *   take it — it belongs to the founders.
 * - WAIT: waiting founders simulate per wait-step (needs decay +
 *   activity re-choice by the stepped clock; sleep restores energy),
 *   and the real-time founder tick PAUSES during a wait. Positions,
 *   chopping, and deliveries do NOT fast-forward — no teleporting, no
 *   phantom wood. When the wait ends, founders resume from their
 *   needs and walk to their next activity.
 * - SAVE VERSIONING (G16) rides along: founders + needs + stockpile
 *   save to `ag-3d-founders-v1` with a version field and a migrate
 *   function (the persistence.ts v1→v2 pattern). New key — the old
 *   roster's `ag-3d-npcs-v1` is never touched, migrated, or
 *   overwritten. A save without a version field migrates as v0
 *   (defaults filled); an unknown future version falls back to fresh
 *   defaults rather than guessing. BUILD 1058: v2 adds the
 *   construction state (the first hut) + buildTicks; v1 saves
 *   migrate to a fresh construction (no hut started). BUILD 1060:
 *   v3 adds each founder's social state (affinity + memories,
 *   memory.ts); v2 saves migrate with fresh social (neutral, no
 *   memories). BUILD 1063 (F-1): v4 adds each founder's stable
 *   id (entityIds.ts); v3 saves migrate with the id derived from
 *   the name.
 * - FOUNDERS flag: `FOUNDERS_ENABLED` here, scoped separately from
 *   WILDERNESS_ONLY — the old town stays gated off.
 *
 * Pure module (no React, no WebGL, no localStorage in the pure
 * functions) so the sim and the standalone asserts can import it
 * directly. loadFoundersSave/saveFoundersSave are the only I/O, and
 * the sim/asserts use migrateFoundersSave + serializeFoundersSave
 * instead (no localStorage in node — the 1056 persist-assert lesson).
 */

import { planPathNpc, pathHasUnwalkableTile, npcWalkable, quantizeTile, sidestepTile } from './townsfolk3d';
import { blockedAction } from './npcMotion';
import { wildTreeAt } from './wildTerrain';
import { chooseScoredActivity } from './utility';
import type { ScoredDecision, UtilityWorldContext } from './utility';
import { freshFounderSocial } from './memory';
import type { FounderSocial } from './memory';
import { founderIdFor, treeId, farmTileId } from './entityIds';
import { plantSapling } from './ecosystems';
import { decayFounderHealth } from './food';
import {
  CAMP_STORE_ID,
  GRANARY_STORE_ID,
  carrierStoreId,
  depositInto,
  extractDeposit,
  setStoreQty,
  storeQty,
  transfer,
  withdrawFrom,
  type ResourceRegistry,
} from './resourceRegistry';
import {
  HUT_SITES,
  HUT_SLEEP_TILES,
  HUT_WORK_STEPS,
  constructionFromSites,
  freshConstruction,
  sitesOf,
  stageProgressOf,
  type ConstructionState,
  type HutState,
  type SiteState,
  type StageSteps,
} from './construction';
import type { IsoWorld } from '../iso/isoWorld';
import type { MineState } from './mines';
import { harvestFarmTile } from './farm';
import { seedGranaryStore, GRANARY_GRAIN_TILE } from './granary';
import { freshStorehouse, validateStorehouseState, type StorehouseState } from './storehouse';
import { freshFoodChain, validateFoodChainState, type FoodChainState } from './foodChain';
import { freshMetalChain, validateMetalChainState, type MetalChainState } from './metalChain';
import { freshHousing, validateHousingState, type HousingState } from './housing';
import { freshPen, validatePenState, type PenState } from './animalHusbandry';
import type { SettlementPlan } from './sitePlan';
import type { ProfessionId } from './professions';
import { professionFromSave } from './professions';
import type { BridgeSite } from './paths';
import type { WheatTri } from './farm';

/** BUILD 1057: true = the three founders live at the camp. Separate
 *  from WILDERNESS_ONLY — the old town stays gated off. */
export const FOUNDERS_ENABLED = true;

/** Founder save key (new — the old roster's ag-3d-npcs-v1 is untouched). */
export const FOUNDERS_SAVE_KEY = 'ag-3d-founders-v1';
/** Current founders-save format version (G16). v2 (BUILD 1058)
 *  adds the construction state (the first hut) + buildTicks. v3
 *  (BUILD 1060) adds each founder's social state (affinity +
 *  memories, memory.ts) — v2 saves migrate with fresh social
 *  (neutral toward each other, no memories). v4 (BUILD 1063, F-1)
 *  adds each founder's stable id (entityIds.ts founderIdFor) — v3
 *  saves migrate with the id derived from the name, which is the
 *  same string the 1062 coordinator derived on every advance, so
 *  the coordinator's view of founder identity does not change.
 *  v5 (BUILD 1066, 0x06): each founder's BED (which hut, which
 *  tile — the chain's housing capacity), the multi-site
 *  construction (construction.ts sites list), and residents
 *  beyond the 3 names (newcomers who arrived through the chain).
 *  v4 saves migrate with beds from the founder's index (hut 0)
 *  and the construction as hut 1. v6 (BUILD 1067, 0x07): each
 *  founder's HEALTH (food.ts — starvation decays it, feeding
 *  recovers it) and their carried GRAIN (carryingGrain — the
 *  harvest leg, like carrying for wood). v5 saves migrate with
 *  health 100 and carryingGrain 0 (no data — assume healthy and
 *  empty-handed, the fresh-social precedent). v7 (BUILD 1069,
 *  0x0F): the camp's stored GRAIN (grainStock — the mill's
 *  buffer; the 0x09 24h test proved a reload lost it, so the
 *  food loop leaked grain on every save). v6 saves migrate with
 *  grainStock 0. v8 (BUILD 1086, 0x15): the camp's stored STONE
 *  (stoneStock — the quarry loop's stockpile leg) and each
 *  founder's carried STONE (carryingStone — the mine leg, like
 *  carryingGrain for the harvest). v7 saves migrate with
 *  stoneStock 0 and carryingStone 0. v9 (BUILD 1087, 0x16): the
 *  STOREHOUSE (storehouse.ts — its construction state, stored
 *  wood + stored stone) and each founder's carried BUILD WOOD
 *  (carryingBuild — the storehouse -> site haul leg, like
 *  carryingStone for the mine). v8 saves migrate with no
 *  storehouse and empty counts (the camp pile keeps everything,
 *  the same as before) and carryingBuild 0. v10 (BUILD 1088,
 *  0x17): the BRIDGE SITES (paths.ts — a bridge over a river
 *  tile the founders build through the construction path) and
 *  each founder's carried WATER (carryingWater — the well -> farm
 *  leg, like carryingGrain for the harvest, but never stocked, so
 *  it rides on the founder, not the registry). v9 saves migrate
 *  with no bridges and carryingWater 0 (no path had met a river
 *  yet, the world keeps working, the same as before). v11
 *  (BUILD 1089, 0x18): the MINES (mines.ts — the mine sites, the
 *  quarry site, the lumber site) and each founder's carried ORE
 *  (carryingOre — the mine leg, like carryingStone for the
 *  quarry) and the storehouse's stored ORE (storehouseOre — iron
 *  in the storehouse store). v10 saves migrate with no sites,
 *  no carried ore, and no stored ore (the world keeps working,
 *  the same as before). v12 (BUILD 1090, 0x19): the GRANARY
 *  (granary.ts — the camp's food store; foodStock/grainStock are
 *  now the granary's counts, not the camp store's; fresh worlds
 *  start with an empty granary, no more magic 30). v11 saves
 *  migrate with the granary seeded from their foodStock/
 *  grainStock (the same fields, the new store). v13 (BUILD 1103,
 *  0x26): the NEWCOMER (population.ts — Tamsin arrives when the
 *  settlement is ready, affinity-gated; the parked BUILD 1061
 *  stash@{0} claimed v4 for her, rebased here to v13). A v12
 *  save migrates with no newcomer invented — she arrives only
 *  when the conditions are met, never by migration; a v13 save
 *  with Tamsin keeps her (name, camp bed, workState, social keys
 *  toward her). */
export const FOUNDER_SAVE_VERSION = 13;

/** Camp centre (surveyed on the real fresh world, 2026-11-15):
 *  4 trees within 12 tiles, 7 within 25, nearest tree 4 tiles
 *  (122,122); 29 tiles from the player spawn (99,105) — a short walk
 *  for the player, a real working wood; 31 tiles from the plaza
 *  centre (100,100), so the camp is not on the old town; the 3x3
 *  footprint is all walkable grass, no trees, no water. */
export const FOUNDER_CAMP = { x: 124, y: 120 };
/** Camp centre: meeting/rest tile and the delivery tile (the founder
 *  carries wood here, beside the pile, and the count goes up). */
export const FOUNDER_CAMP_CENTRE = { x: 124, y: 120 };
/** The log pile sits on this tile (fx visual, not a world object). */
export const FOUNDER_STOCKPILE_TILE = { x: 125, y: 120 };
/** Eating happens on this tile, at the camp. */
export const FOUNDER_EAT_TILE = { x: 123, y: 120 };
/** One sleep tile per founder, north row of the camp. */
export const FOUNDER_SLEEP_TILES = [
  { x: 123, y: 119 },
  { x: 124, y: 119 },
  { x: 125, y: 119 },
];

/** New founders — none of these names is in the old 47-roster. */
export const FOUNDER_NAMES = ['Marlow', 'Greta', 'Perrin'];

/** BUILD 1103 (0x26, Phase 4.4) — the first newcomer (G27, population growth, resumed from the parked BUILD 1061 stash@{0}).
 *  Tamsin is a new name: none of the three founders, none of the old 47 roster (townsfolk3d.ts ROSTER_3D — Wren and Sable are both taken there), none of the pool (RESIDENT_NAMES). She arrives when the settlement is ready (population.ts) and sleeps at the camp's old centre sleep tile (124,119) — free since the founders moved into the hut. No second hut in this build; Tamsin sleeping under the stars is exactly why the second hut is wanted next. */
export const NEWCOMER_NAME = 'Tamsin';
/** Every settler who can live at the camp (3 founders + newcomer). */
export const ALL_SETTLER_NAMES = [...FOUNDER_NAMES, NEWCOMER_NAME];
/** The newcomer's bed: the founders' old camp-centre sleep tile. */
export const NEWCOMER_SLEEP_TILE = { x: 124, y: 119 };

/** A founder's bed: which hut (site index) and which sleep tile.
 *  Saved (v5) — the bed is the housing capacity a resident
 *  occupies, so it must survive a reload. hut -1 (BUILD 1103) is
 *  the camp bed: the newcomer sleeps at NEWCOMER_SLEEP_TILE, not
 *  in any hut — validSavedBed accepts only that one tile for -1. */
export type FounderBed = { hut: number; x: number; y: number };

/** Newcomer names for the chain's arrivals (BUILD 1066) — none is
 *  in the old 47-roster, none is a founder, none is Tamsin (the
 *  parked stash's newcomer — a different resident, on the user's
 *  word only). Checked in the 1066 asserts against ROSTER_3D. */
export const RESIDENT_NAMES = ['Bram', 'Fern', 'Silas', 'Tessa', 'Orin', 'Hazel'];

/** BUILD 1090 (2.5): meals the founders start with — 0. The
 *  camp's food no longer arrives as a magic 30: fresh worlds
 *  start with an empty granary, and the first meal comes from
 *  the first harvest (the seeded plot is ready ~11:30 day 1;
 *  hunger at 11:30 is ~48, no starvation). v11 saves migrate
 *  with the granary seeded from their foodStock (same field,
 *  new store), so old saves do not start starving on load. */
export const FOUNDER_START_FOOD = 0;
/** Nearest-tree search radius around the camp, in tiles. BUILD 1059:
 *  30 → 60. Only 8 trees sit within 30 tiles of the camp (measured
 *  from the deterministic default world: 4 within 12, 7 within 25,
 *  8 within 30), and the first hut fells ~7 of them — so after the
 *  first build + one rebuild delivery, the nearest tree is 31 away
 *  and the founders can never chop again: work scores 0, the pile
 *  stays 0, the rebuild stalls forever with a half-built hut (the
 *  1059 probe observed exactly this: 1/6 for 240s, zero deliveries).
 *  Within 60 there are 46 trees (~7 huts of headroom); the search
 *  always takes the NEAREST tree, so the common case is unchanged
 *  and the radius only matters once the near trees are gone. The
 *  scan cost is unchanged (same 226-entry world.trees scan). A
 *  sustainable supply (replanting/forestry) is a later build — this
 *  only removes the cliff. */
export const FOUNDER_WORK_RADIUS = 60;
/** Ticks spent chopping at a tree before it falls. */
export const FOUNDER_CHOP_TICKS = 3;
/** Ticks a founder may spend walking to a chop target before giving
 *  up (BUILD 1127 — port of the 1113 fix; the hunt give-up's twin,
 *  HUNT_GIVE_UP_TICKS 1102). A walk to the farthest tree in work
 *  radius is ~60 ticks; 360 is 6x that, so a legitimate walk never
 *  trips it. Without it a founder whose tree is unreachable (across
 *  a river with no bridge yet, or a permanently blocked corridor)
 *  holds the chop job forever — in 1113 all three founders sat
 *  toTree/chop for 11 game-hours, wood frozen at 8, the storehouse
 *  never started, health → 8. */
export const CHOP_GIVE_UP_TICKS = 360;
// BUILD 1127 fix 4 (port of 1113): a bridge site whose work tile no
// builder can walk to must never be claimed. The v2 rivers braid
// around land spurs, and a work tile can be walkable yet sealed by
// the river's meanders — in 1113 the claim loop pinned forever on
// such a spur while reachable sites waited. The seal is terrain, so
// the answer is cached per site.
const bridgeReachableCache = new WeakMap<object, boolean>();
// BUILD 1127 fix 5 (port of 1113): the tile-level reachability
// test, so the crossing scan (paths.ts) can test a crossing's
// work tile before opening its site.
export function tileReachableFromCamp(world: IsoWorld, x: number, y: number): boolean {
  return planPathNpc(world, { x: FOUNDER_CAMP.x, y: FOUNDER_CAMP.y }, { x, y }) !== null;
}
export function bridgeWorkTileReachableFromCamp(world: IsoWorld, site: BridgeSite): boolean {
  const hit = bridgeReachableCache.get(site);
  if (hit !== undefined) return hit;
  const ok = tileReachableFromCamp(world, site.workTile.x, site.workTile.y);
  bridgeReachableCache.set(site, ok);
  return ok;
}
/** Ticks spent harvesting at a farm tile before the wheat is in
 *  the carrier (BUILD 1067 — wheat is quicker than a tree). */
export const FOUNDER_HARVEST_TICKS = 2;
/** Ticks spent mining at a quarry site before the stone is in
 *  the carrier (BUILD 1086 — the same as chopping: the 2.5D
 *  quarry loop mines 2 stone per 3000ms at 1 tick/900ms). */
export const FOUNDER_MINE_TICKS = 3;
/** Wood per felled tree — the same as the player's E-key chop. */
export const FOUNDER_WOOD_PER_TREE = 2;

// --- Needs model (villageLife.ts parity) ---

/** 0..100, higher = more satisfied (the villageLife convention).
 *  BUILD 1067: health joins the needs — starvation decays it,
 *  feeding recovers it, and a weak founder works at half strength
 *  (utility.ts). */
export type FounderNeeds = { hunger: number; energy: number; social: number; health: number };

/** Hunger decay per game minute: ~9/hr between meals. */
export const HUNGER_DECAY_PER_MIN = 0.15;
/** Energy drain per waking game minute: 100 over 06:00–21:30. */
export const ENERGY_DRAIN_PER_MIN = 100 / 930;
/** Energy restored per sleeping game minute: ~100 over a night. */
export const ENERGY_SLEEP_PER_MIN = 0.21;
/** Social decay per working game minute (alone in the woods). */
export const SOCIAL_WORK_DECAY_PER_MIN = 0.04;
/** Social gain per resting game minute (together at camp). */
export const SOCIAL_REST_GAIN_PER_MIN = 0.15;
/** Social gain per eating/sleeping game minute (company at camp). */
export const SOCIAL_CAMP_GAIN_PER_MIN = 0.03;

/** Night starts 21:30, day starts 06:00 (villageLife wake/sleep). */
export const NIGHT_START_MIN = 1290;
export const DAY_START_MIN = 360;

export type FounderActivity = 'sleep' | 'eat' | 'rest' | 'work' | 'build';

/** True during the founders' night (sleep hours). */
export function isFounderNight(minutes: number): boolean {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return m >= NIGHT_START_MIN || m < DAY_START_MIN;
}

/**
 * BUILD 1059: the fixed priority is DELETED — activity choice is the
 * utility scorer (utility.ts: scoreFounderActivities /
 * chooseScoredActivity). The scorer IS the decision, in the
 * real-time tick and in the wait-step re-choice below. Nothing in
 * this file picks an activity by hand any more.
 */

/**
 * Decay needs by `elapsedMin` game minutes under the current
 * activity. Hunger always decays; energy drains while awake and
 * restores while sleeping; social drains while working and rises at
 * camp. Pure — floats kept (rounding each tick would freeze decay).
 */
export function decayFounderNeeds(needs: FounderNeeds, elapsedMin: number, activity: FounderActivity): FounderNeeds {
  const e = Math.max(0, elapsedMin);
  const hunger = Math.max(0, needs.hunger - HUNGER_DECAY_PER_MIN * e);
  const energy =
    activity === 'sleep'
      ? Math.min(100, needs.energy + ENERGY_SLEEP_PER_MIN * e)
      : Math.max(0, needs.energy - ENERGY_DRAIN_PER_MIN * e);
  let social = needs.social;
  // BUILD 1059: building is work for social (alone at the site) —
  // it decays like chopping, not like resting at camp.
  if (activity === 'work' || activity === 'build') social = Math.max(0, social - SOCIAL_WORK_DECAY_PER_MIN * e);
  else if (activity === 'rest') social = Math.min(100, social + SOCIAL_REST_GAIN_PER_MIN * e);
  else social = Math.min(100, social + SOCIAL_CAMP_GAIN_PER_MIN * e);
  // BUILD 1067: health decays while starving (hunger 0) and
  // recovers while fed — the shortage consequence, clock-driven
  // like the other needs (so a wait step decays it too).
  const health = decayFounderHealth(needs.health, hunger, e);
  return { hunger, energy, social, health };
}

/** Round needs for display/save (runtime keeps floats). */
export function roundFounderNeeds(needs: FounderNeeds): FounderNeeds {
  return { hunger: Math.round(needs.hunger), energy: Math.round(needs.energy), social: Math.round(needs.social), health: Math.round(needs.health) };
}

/**
 * Eat a meal from the shared camp stock: hunger to 100, food −1.
 * With no food, nothing happens (the founder stays hungry — a real
 * consequence, not a hidden refill). Pure.
 */
export function eatFounderMeal(needs: FounderNeeds, foodStock: number): { needs: FounderNeeds; foodStock: number } {
  if (foodStock <= 0) return { needs, foodStock };
  return { needs: { ...needs, hunger: 100 }, foodStock: foodStock - 1 };
}

/**
 * Deliver carried wood to the stockpile. The count goes up ONLY here
 * — never anywhere else, never without a delivery. Pure.
 */
export function deliverFounderWood(stockpileWood: number, carrying: number): number {
  return Math.max(0, stockpileWood) + Math.max(0, carrying);
}

// --- BUILD 1064 (R-1): the registry as the live-game authority. ---
//
// The pure helpers above (eatFounderMeal / deliverFounderWood) stay
// for the sim — the registry versions below are the live game's
// authority, and the view calls them. The founders save keeps its
// v4 shape (stockpileWood/foodStock/carrying numbers); the registry
// is rebuilt from those numbers on load and written back into them
// on save, so no save version moves in this build (the Tamsin
// design it mentions has since resumed as BUILD 1103, v13).

/**
 * Seed the camp store from the founders save numbers (load path):
 * wood + stone at the stockpile tile (the camp store, uncapped),
 * food + grain into the GRANARY store (granary.ts — the mill's
 * buffer lives there since BUILD 1090, not in the camp store).
 * Source 'loaded' (the save does not record where a unit came
 * from). The signature is unchanged (wood, food, grain, stone) —
 * the food/grain args now seed the granary, so the load sites and
 * the sim keep calling it the same way. Pure.
 */
export function seedCampStore(registry: ResourceRegistry, stockpileWood: number, foodStock: number, grainStock: number, stoneStock = 0, flourStock = 0, meatStock = 0, fishStock = 0): ResourceRegistry {
  let next = setStoreQty(registry, CAMP_STORE_ID, 'wood', stockpileWood, { type: 'loaded' }, { location: { ...FOUNDER_STOCKPILE_TILE } });
  next = seedGranaryStore(next, grainStock, foodStock, flourStock, meatStock, fishStock);
  next = setStoreQty(next, CAMP_STORE_ID, 'stone', stoneStock, { type: 'loaded' }, { location: { ...FOUNDER_STOCKPILE_TILE } });
  return next;
}

/**
 * Seed one founder's carrier store from their saved carrying (load
 * path): capacity 2 (the real carry limit), location the founder's
 * tile, owner the founder's id, source 'loaded'. A founder reloaded
 * mid-carry still holds what the save says they hold — wood AND
 * grain (BUILD 1067: a founder reloaded mid-harvest keeps the
 * grain in their carrier, and re-claims a deliver job for it)
 * — and stone (BUILD 1086: the same for a founder reloaded
 * mid-mine).
 * Pure.
 */
export function seedCarrierStore(registry: ResourceRegistry, f: FounderState): ResourceRegistry {
  // BUILD 1087: the carrier's wood is the gathered wood PLUS the
  // build wood (one store, capacity 2 — the two never coexist
  // above 2: a founder fetches only when empty-handed, and chops
  // only when carrying no build wood).
  const carrying = Math.max(0, Math.floor(f.carrying)) + Math.max(0, Math.floor(f.carryingBuild ?? 0));
  const carryingGrain = Math.max(0, Math.floor(f.carryingGrain));
  const carryingStone = Math.max(0, Math.floor(f.carryingStone));
  const carryingOre = Math.max(0, Math.floor(f.carryingOre ?? 0));
  const carryingMeat = Math.max(0, Math.floor(f.carryingMeat ?? 0));
  const carryingLeather = Math.max(0, Math.floor(f.carryingLeather ?? 0));
  const carryingFish = Math.max(0, Math.floor(f.carryingFish ?? 0));
  const carryingWool = Math.max(0, Math.floor(f.carryingWool ?? 0));
  if (carrying <= 0 && carryingGrain <= 0 && carryingStone <= 0 && carryingOre <= 0 && carryingMeat <= 0 && carryingLeather <= 0 && carryingFish <= 0 && carryingWool <= 0) return registry;
  let next = registry;
  if (carrying > 0) {
    next = setStoreQty(
      next,
      carrierStoreId(f.id),
      'wood',
      carrying,
      { type: 'loaded' },
      { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
    );
  }
  if (carryingGrain > 0) {
    next = setStoreQty(
      next,
      carrierStoreId(f.id),
      'grain',
      carryingGrain,
      { type: 'loaded' },
      { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
    );
  }
  if (carryingStone > 0) {
    next = setStoreQty(
      next,
      carrierStoreId(f.id),
      'stone',
      carryingStone,
      { type: 'loaded' },
      { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
    );
  }
  // BUILD 1095: the ore the founder carries from the mine — seeded
  // with the kind they actually carry (iron or coal; a v12 save
  // without a kind means iron, the only mineral mined before
  // 1095). The 1089 code never seeded ore at all, so a founder
  // saved mid-delivery reloaded with ore in hand but an empty
  // carrier store, and the delivery moved 0 — the founder pinned
  // at the approach (a likely contributor to the week-after-reload
  // divergence). The kind rides in the save (carryingOreKind).
  if (carryingOre > 0) {
    next = setStoreQty(
      next,
      carrierStoreId(f.id),
      f.carryingOreKind ?? 'iron',
      carryingOre,
      { type: 'loaded' },
      { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
    );
  }
  // BUILD 1102: the hunt / fish / shepherd yields — seeded like
  // ore (the same mid-delivery reload pin: a founder saved with
  // meat in hand reloads with an empty carrier store otherwise,
  // and the delivery moves 0).
  if (carryingMeat > 0) {
    next = setStoreQty(
      next,
      carrierStoreId(f.id),
      'meat',
      carryingMeat,
      { type: 'loaded' },
      { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
    );
  }
  if (carryingLeather > 0) {
    next = setStoreQty(
      next,
      carrierStoreId(f.id),
      'leather',
      carryingLeather,
      { type: 'loaded' },
      { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
    );
  }
  if (carryingFish > 0) {
    next = setStoreQty(
      next,
      carrierStoreId(f.id),
      'fish',
      carryingFish,
      { type: 'loaded' },
      { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
    );
  }
  if (carryingWool > 0) {
    next = setStoreQty(
      next,
      carrierStoreId(f.id),
      'wool',
      carryingWool,
      { type: 'loaded' },
      { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
    );
  }
  return next;
}

/**
 * Eat a meal from the granary (registry authority): withdraw 1
 * food; only when a whole meal is taken does hunger go to 100.
 * With no food, nothing happens (the founder stays hungry — a real
 * consequence, not a hidden refill). Pure.
 */
export function eatFounderMealFromRegistry(
  registry: ResourceRegistry,
  needs: FounderNeeds,
): { registry: ResourceRegistry; needs: FounderNeeds; ate: boolean } {
  // BUILD 1102: the eat priority is meals first, then meat, then
  // fish — a hunted meal is a meal, and a caught fish is a meal;
  // the camp eats what it has, in that order, through the same
  // withdraw path (conserved — the unit leaves the granary).
  const w = withdrawFrom(registry, GRANARY_STORE_ID, 'food', 1);
  if (w.taken >= 1) return { registry: w.registry, needs: { ...needs, hunger: 100 }, ate: true };
  const m = withdrawFrom(w.registry, GRANARY_STORE_ID, 'meat', 1);
  if (m.taken >= 1) return { registry: m.registry, needs: { ...needs, hunger: 100 }, ate: true };
  const fi = withdrawFrom(m.registry, GRANARY_STORE_ID, 'fish', 1);
  if (fi.taken < 1) return { registry, needs, ate: false };
  return { registry: fi.registry, needs: { ...needs, hunger: 100 }, ate: true };
}

/**
 * Deposit a hunt / fish / shepherd yield into the founder's
 * carrier store (BUILD 1102 — the fellTreeToCarrier shape for
 * animal yields): the yield is deposited into the carrier store
 * (the granary/storehouse caps do not bind the carrier — the
 * delivery caps it), source the prey id / 'river-bank' / the
 * pen, location the founder's tile, owner the founder. The
 * caller sets f.carryingMeat / f.carryingLeather /
 * f.carryingFish / f.carryingWool to the returned yield. Pure.
 */
export function carryAnimalYieldToCarrier(
  registry: ResourceRegistry,
  f: FounderState,
  kind: 'meat' | 'leather' | 'fish' | 'wool',
  qty: number,
  sourceId: string,
): { registry: ResourceRegistry; added: number } {
  if (qty <= 0) return { registry, added: 0 };
  const res = depositInto(
    registry,
    carrierStoreId(f.id),
    kind,
    qty,
    { type: 'entity', id: sourceId },
    { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
  );
  return res;
}

/**
 * Fell a tree into the founder's carrier store: the world loses
 * the tree (chopTreeAt — the same removal as the player's E-key
 * chop, so the tree disappears for everyone), the tree's deposit
 * is extracted from the registry, and the yield is deposited into
 * the carrier store (capacity 2, location the founder's tile,
 * owner the founder's id, source the tree id). When the tree is
 * already gone (chopped by the player first) the yield is 0 and
 * nothing is deposited — no wood appears without a tree. The
 * caller sets f.carrying to the returned yield. Pure apart from
 * the world mutation chopTreeAt already performs.
 */
export function fellTreeToCarrier(
  registry: ResourceRegistry,
  world: IsoWorld,
  f: FounderState,
  tx: number,
  ty: number,
): { registry: ResourceRegistry; yield: number; sourceId: string | null } {
  const sourceId = treeId(tx, ty);
  if (!chopTreeAt(world, tx, ty)) return { registry, yield: 0, sourceId: null };
  const extracted = extractDeposit(registry, sourceId);
  const yieldWood = extracted.qty > 0 ? extracted.qty : FOUNDER_WOOD_PER_TREE;
  const deposited = depositInto(
    extracted.registry,
    carrierStoreId(f.id),
    'wood',
    yieldWood,
    { type: 'entity', id: sourceId },
    { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
  );
  return { registry: deposited.registry, yield: deposited.added, sourceId };
}

/**
 * Deliver the founder's carried wood to the camp store: a real
 * transfer (carrier store → camp store), so the total is conserved
 * across the chain — the wood the tree held is the wood the pile
 * gains. Returns the new registry and how many units moved. The
 * caller sets f.carrying -= moved. Pure.
 */
export function deliverFounderWoodToRegistry(
  registry: ResourceRegistry,
  f: FounderState,
): { registry: ResourceRegistry; moved: number } {
  const carrying = Math.max(0, Math.floor(f.carrying));
  if (carrying <= 0) return { registry, moved: 0 };
  const res = transfer(
    registry,
    carrierStoreId(f.id),
    CAMP_STORE_ID,
    'wood',
    carrying,
    { type: 'entity', id: f.id },
    { location: { ...FOUNDER_CAMP_CENTRE } },
  );
  return res;
}

/**
 * Harvest a ready farm tile into the founder's carrier store
 * (BUILD 1067): the tile resets to planted (harvestFarmTile —
 * the same reset as the player's E-key harvest, so the wheat
 * regrows), and the yield is deposited into the carrier store
 * (capacity 2 — the real carry limit, the same as wood — location
 * the founder's tile, owner the founder's id, source the farm
 * tile id). When the tile is not ready (harvested by the player
 * or another founder first) the yield is 0 and nothing is
 * deposited — no grain appears without a ready tile. The caller
 * sets f.carryingGrain to the returned yield. Pure apart from the
 * world mutation harvestFarmTile already performs.
 */
export function harvestFarmTileToCarrier(
  registry: ResourceRegistry,
  world: IsoWorld,
  f: FounderState,
  tx: number,
  ty: number,
  nowAbs: number,
  soilFactor = 1,
): { registry: ResourceRegistry; yield: number; sourceId: string | null } {
  const sourceId = farmTileId(tx, ty);
  const res = harvestFarmTile(world, tx, ty, nowAbs, soilFactor);
  if (!res.ok) return { registry, yield: 0, sourceId: null };
  const deposited = depositInto(
    registry,
    carrierStoreId(f.id),
    'grain',
    res.wheat,
    { type: 'entity', id: sourceId },
    { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
  );
  return { registry: deposited.registry, yield: deposited.added, sourceId };
}

/**
 * Deliver the founder's carried wood AND grain to their stores
 * (BUILD 1067 — the grain leg; BUILD 1090 — the grain goes to the
 * granary now, not the camp store): two real transfers (carrier
 * store → camp store for wood, carrier store → granary store for
 * grain), so both totals are conserved across the chain. Returns
 * the new registry and how many units of each moved. The caller
 * sets f.carrying -= movedWood and f.carryingGrain -= movedGrain.
 * Pure.
 */
export function deliverFounderCarryToRegistry(
  registry: ResourceRegistry,
  f: FounderState,
): { registry: ResourceRegistry; movedWood: number; movedGrain: number; movedStone: number } {
  const wood = deliverFounderWoodToRegistry(registry, f);
  const grain = Math.max(0, Math.floor(f.carryingGrain));
  const stone = Math.max(0, Math.floor(f.carryingStone));
  let reg = wood.registry;
  let movedGrain = 0;
  if (grain > 0) {
    const res = transfer(reg, carrierStoreId(f.id), GRANARY_STORE_ID, 'grain', grain, { type: 'entity', id: f.id }, { location: { ...GRANARY_GRAIN_TILE } });
    reg = res.registry;
    movedGrain = res.moved;
  }
  // BUILD 1086: the stone leg — the mined stone moves from the
  // carrier store to the camp store, like the grain above.
  let movedStone = 0;
  if (stone > 0) {
    const res = transfer(reg, carrierStoreId(f.id), CAMP_STORE_ID, 'stone', stone, { type: 'entity', id: f.id }, { location: { ...FOUNDER_CAMP_CENTRE } });
    reg = res.registry;
    movedStone = res.moved;
  }
  return { registry: reg, movedWood: wood.moved, movedGrain, movedStone };
}

/** Units of wood in the camp store (the registry's answer to the
 *  old founderStockpileRef.current read). Pure. */
export function campWoodInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, CAMP_STORE_ID, 'wood');
}

/** Meals in the granary store (BUILD 1090 — the camp's food lives
 *  in the granary now; the name stays, it means "the camp's food").
 *  Pure. */
export function campFoodInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, GRANARY_STORE_ID, 'food');
}

/** Stone in the camp store (BUILD 1086 — the quarry loop's
 *  stockpile leg). Pure. */
export function campStoneInRegistry(registry: ResourceRegistry): number {
  return storeQty(registry, CAMP_STORE_ID, 'stone');
}

// --- Founder state ---

export type FounderWorkState = 'toTree' | 'chopping' | 'toStockpile' | 'idle' | 'toSite' | 'building' | 'arriving' | 'toFarm' | 'harvesting' | 'toQuarry' | 'mining' | 'toStorehouse' | 'toWell' | 'toWater' | 'toMine' | 'miningOre' | 'toPlant' | 'planting' | 'toMill' | 'milling' | 'toBakery' | 'baking' | 'toSmelter' | 'smelting' | 'toSmith' | 'smithing' | 'toSawmill' | 'sawing' | 'toCarpenter' | 'carpentering' | 'toPrey' | 'hunting' | 'toBank' | 'fishing' | 'toPen' | 'shepherding';

/** Runtime founder state (path cache + tree target are session-only,
 *  never saved). */
export type FounderState = {
  /** BUILD 1063 (F-1): the founder's stable identity
   *  ('founder-' + name, entityIds.ts) — stored in the save (v4),
   *  never re-derived at runtime, so the coordinator, the registry,
   *  and the scheduler all name the same founder across ticks,
   *  saves, and reloads. */
  id: string;
  name: string;
  x: number;
  y: number;
  needs: FounderNeeds;
  activity: FounderActivity;
  workState: FounderWorkState;
  /** Wood currently carried (0 or FOUNDER_WOOD_PER_TREE). */
  carrying: number;
  /** Grain currently carried (0 or FARM_HARVEST_WHEAT) — the
   *  harvest leg (BUILD 1067), like carrying for wood. */
  carryingGrain: number;
  /** Chop ticks spent on the current tree. */
  chopTicks: number;
  /** BUILD 1058: build ticks spent on the current hut work step. */
  buildTicks: number;
  /** Harvest ticks spent on the current farm tile (BUILD 1067). */
  harvestTicks: number;
  /** Plant ticks spent on the current farm tile (BUILD 1090 —
   *  the planting leg, like harvestTicks for the harvest).
   *  Session-only (reset to 0 on load, like mineTicks — a founder
   *  reloaded mid-plant restarts the plant; nothing is lost,
   *  the tile is not planted yet). */
  plantTicks: number;
  /** Stone currently carried (0..2 — the mine leg, BUILD 1086,
   *  like carryingGrain for the harvest). */
  carryingStone: number;
  /** Mine ticks spent on the current quarry site (BUILD 1086). */
  mineTicks: number;
  /** Mill ticks spent on the current milling shift (BUILD 1094).
   *  Session-only (reset to 0 on load, like mineTicks — a founder
   *  reloaded mid-mill restarts the shift; nothing is lost, the
   *  grain is still in the granary). */
  millTicks: number;
  /** Bake ticks spent on the current baking shift (BUILD 1094).
   *  Session-only (reset to 0 on load, like millTicks). */
  bakeTicks: number;
  /** Smelt ticks spent on the current smelting shift (BUILD 1095).
   *  Session-only (reset to 0 on load, like millTicks — a founder
   *  reloaded mid-smelt restarts the shift; nothing is lost, the
   *  ore and the coal are still in the storehouse). */
  smeltTicks: number;
  /** Smith ticks spent on the current smithing shift (BUILD 1095).
   *  Session-only (reset to 0 on load, like millTicks). */
  smithTicks: number;
  /** Saw ticks spent on the current sawing shift (BUILD 1095).
   *  Session-only (reset to 0 on load, like millTicks). */
  sawTicks: number;
  /** Carpenter ticks spent on the current carpentry shift (BUILD
   *  1095). Session-only (reset to 0 on load, like millTicks). */
  carpenterTicks: number;
  /** Wood carried FOR a build step (0 or 2 — the storehouse ->
   *  site haul leg, BUILD 1087): fetched from the storehouse
   *  store, spent at the site. Separate from `carrying` (gathered
   *  wood heading to a store), so the two flows never mix — the
   *  carrier store holds their sum, capacity 2. */
  carryingBuild: number;
  /** Water currently carried (0 or 1 — the well -> farm leg, BUILD
   *  1088): drawn at the well, poured on a growing farm tile.
   *  Never stocked anywhere, so it rides on the founder, not the
   *  registry — there is no water store to account for. */
  carryingWater: number;
  /** Ore currently carried (0 or MINE_ORE_PER_SHIFT — the mine
   *  leg, BUILD 1089, like carryingStone for the quarry). */
  carryingOre: number;
  /** Which mineral the carried ore is (BUILD 1095 — the coal mine
   *  is the second mine, so the carrier must know whether it holds
   *  iron or coal: the delivery moves the kind actually carried,
   *  and the save seeds the carrier store with it on reload).
   *  Null when carrying nothing (or when an old save had ore but
   *  no kind — that ore was iron, the only mineral mined before
   *  1095). Saved (v12, a compatible field). */
  carryingOreKind: 'iron' | 'coal' | null;
  /** Meat currently carried (the hunt leg, BUILD 1102 — the
   *  hunter's yield, delivered to the granary like grain).
   *  Saved (v12, a compatible field). */
  carryingMeat: number;
  /** Leather currently carried (the hunt leg, BUILD 1102 — the
   *  hunter's yield, delivered to the storehouse like ore).
   *  Saved (v12, a compatible field). */
  carryingLeather: number;
  /** Fish currently carried (the fish leg, BUILD 1102 — the
   *  fisher's yield, delivered to the granary like grain).
   *  Saved (v12, a compatible field). */
  carryingFish: number;
  /** Wool currently carried (the shear leg, BUILD 1102 — the
   *  shepherd's yield, delivered to the storehouse like ore).
   *  Saved (v12, a compatible field). */
  carryingWool: number;
  /** Hunt / fish / shepherd ticks spent on the current shift
   *  (BUILD 1102 — the 3-tick shift shape, shared by the three
   *  animal jobs; also the hunt's travel counter for the
   *  give-up). Session-only, reset to 0 on load like millTicks. */
  animalTicks: number;
  /** Ticks spent walking to the current chop target (BUILD 1127 —
   *  the chop give-up counter, the animalTicks pattern for trees).
   *  Optional — absent reads as 0; session-only, reset on load. */
  treeTicks?: number;
  /** Prey being hunted, if any (session-only — the job's target
   *  id + the prey's kind + its CURRENT tile, refreshed each
   *  tick from the live list, so the hunter follows a moving
   *  prey instead of walking to where it was at discovery). */
  preyTarget: { id: string; kind: string; x: number; y: number } | null;
  /** Quarry site being worked, if any (session-only — the job's
   *  target id + tile; the kind is the id's prefix). */
  quarryTarget: { id: string; x: number; y: number } | null;
  /** Mine site being worked, if any (session-only — the site's
   *  id + the deposit tile; the mineral is the site's). */
  mineTarget: { id: string; x: number; y: number } | null;
  /** Tree being worked, if any (session-only). */
  treeTarget: { x: number; y: number } | null;
  /** Farm tile being harvested, if any (session-only). */
  farmTarget: { x: number; y: number } | null;
  /** Farm tile being watered, if any (session-only). */
  waterTarget: { x: number; y: number } | null;
  /** Walkable tile adjacent to treeTarget to chop from (session-only). */
  workTile: { x: number; y: number } | null;
  /** Absolute game minutes (day*1440 + minutes) at the last update —
   *  decay is computed from elapsed clock time, never from ticks. */
  lastAbs: number;
  /** BUILD 1059: the last scored decision (session-only, never
   *  saved) — so E can report WHY the founder chose this activity. */
  lastDecision?: ScoredDecision;
  /** BUILD 1060: pairwise affinity + memories (memory.ts) — the
   *  founder's social state. Saved (v3); the runtime copy is the
   *  live one the tick records into. */
  social: FounderSocial;
  /** BUILD 1066: the founder's bed (which hut, which sleep tile).
   *  Saved (v5). Assigned at spawn/arrival from a free bed in a
   *  completed hut; the sleep destination and the door transition
   *  both read it, so a resident always sleeps in THEIR hut. */
  bed: FounderBed;
  /** BUILD 1060: the tile this founder rests on (session-only,
   *  never saved) — a tile beside their closest founder at camp
   *  (memory.ts restTileFor), or null for the camp centre. Set when
   *  the founder's activity becomes 'rest', cleared when it
   *  changes away. */
  restTile: { x: number; y: number } | null;
  /** BUILD 1096 (0x1F): whether this founder has rested at the inn
   *  on their way in (session-only — an arriving founder rests once;
   *  a reload mid-arrival re-rests, which is harmless). */
  innRested?: boolean;
  /** BUILD 1096 (0x1F): inn-rest ticks remaining (session-only) —
   *  the arriving founder stands at the inn rest tile while this
   *  counts down, then walks on to camp. */
  innRestTicks?: number;
  /** BUILD 1098 (0x21): the founder's profession (professions.ts)
   *  — assigned by settlement need, never by the player. Null
   *  means no profession yet (a new arrival, or an old save) — the
   *  tick's assignment fills it. Saved (v12, a compatible field). */
  profession: ProfessionId | null;
};

/** The first free bed: the first sleep tile in a completed hut
 *  that no founder in `taken` (a set of "hut,x,y" keys) occupies,
 *  or null when every bed in every finished hut is taken. A bed
 *  only exists in a FINISHED hut — an unfinished hut has no beds
 *  yet, so capacity never counts a hut still being built. Pure. */
export function freeBed(construction: ConstructionState, taken: ReadonlySet<string>): FounderBed | null {
  const sites = sitesOf(construction);
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].state !== 'done') continue;
    for (const t of HUT_SITES[i].sleepTiles) {
      const key = i + ',' + t.x + ',' + t.y;
      if (!taken.has(key)) return { hut: i, x: t.x, y: t.y };
    }
  }
  return null;
}

/** The next newcomer name (the first pool name nobody has), or
 *  null when the pool is exhausted. Pure. */
export function nextResidentName(founders: readonly { name: string }[]): string | null {
  for (const n of RESIDENT_NAMES) {
    if (!founders.some((f) => f.name === n)) return n;
  }
  return null;
}

/**
 * Spawn a new resident at an entry tile (BUILD 1066): a full
 * FounderState, walking in (workState 'arriving', destination the
 * camp centre — the tick flips them to 'toTree' when they arrive,
 * so they join the workforce on foot, never by teleport). Needs
 * start fresh; social is fresh toward the existing founders
 * (neutral, no memories — the relationship is earned, like the
 * founders'). The bed is assigned by the caller from freeBed.
 * Pure.
 */
export function spawnResident(
  name: string,
  bed: FounderBed,
  entry: { x: number; y: number },
  clockAbs: number,
  others: readonly { name: string }[],
): FounderState {
  return {
    id: founderIdFor(name),
    name,
    x: entry.x,
    y: entry.y,
    needs: { hunger: 80, energy: 90, social: 60, health: 100 },
    activity: 'work',
    workState: 'arriving',
    carrying: 0,
    carryingGrain: 0,
    carryingStone: 0,
    carryingBuild: 0,
    carryingWater: 0,
    carryingOre: 0,
    carryingMeat: 0,
    carryingLeather: 0,
    carryingFish: 0,
    carryingWool: 0,
    chopTicks: 0,
    buildTicks: 0,
    harvestTicks: 0,
    plantTicks: 0,
    mineTicks: 0,
    millTicks: 0,
    bakeTicks: 0,
    smeltTicks: 0,
    smithTicks: 0,
    sawTicks: 0,
    carpenterTicks: 0,
    animalTicks: 0,
    carryingOreKind: null,
    preyTarget: null,
    treeTarget: null,
    farmTarget: null,
    waterTarget: null,
    quarryTarget: null,
    mineTarget: null,
    workTile: null,
    lastAbs: clockAbs,
    social: freshFounderSocial(others.map((o) => o.name).filter((n) => n !== name)),
    bed,
    restTile: null,
    profession: null,
  };
}

/** Absolute game minutes: the clock's (day, minutes) as one number. */
export function founderAbsMinutes(day: number, minutes: number): number {
  return Math.max(0, Math.floor(day)) * 1440 + ((Math.floor(minutes) % 1440) + 1440) % 1440;
}

/** Fresh runtime state for one founder, spawned at their sleep tile. */
export function defaultFounderState(name: string, index: number, clockAbs: number): FounderState {
  const sleep = FOUNDER_SLEEP_TILES[index % FOUNDER_SLEEP_TILES.length];
  const bedTile = HUT_SLEEP_TILES[index % HUT_SLEEP_TILES.length];
  return {
    id: founderIdFor(name),
    name,
    x: sleep.x,
    y: sleep.y,
    needs: { hunger: 80, energy: 90, social: 60, health: 100 },
    activity: 'work',
    workState: 'toTree',
    carrying: 0,
    carryingGrain: 0,
    carryingStone: 0,
    carryingBuild: 0,
    carryingWater: 0,
    carryingOre: 0,
    carryingMeat: 0,
    carryingLeather: 0,
    carryingFish: 0,
    carryingWool: 0,
    chopTicks: 0,
    buildTicks: 0,
    harvestTicks: 0,
    plantTicks: 0,
    mineTicks: 0,
    millTicks: 0,
    bakeTicks: 0,
    smeltTicks: 0,
    smithTicks: 0,
    sawTicks: 0,
    carpenterTicks: 0,
    animalTicks: 0,
    carryingOreKind: null,
    preyTarget: null,
    treeTarget: null,
    farmTarget: null,
    waterTarget: null,
    quarryTarget: null,
    mineTarget: null,
    workTile: null,
    lastAbs: clockAbs,
    social: freshFounderSocial(FOUNDER_NAMES.filter((n) => n !== name)),
    bed: { hut: 0, x: bedTile.x, y: bedTile.y },
    restTile: null,
    profession: null,
  };
}

/** Destination tile for a founder's current activity. */
export function founderDestination(f: FounderState): { x: number; y: number } {
  // BUILD 1066: a newcomer still walking in from the entry tile
  // heads for the camp centre first (workState 'arriving') — they
  // join the workforce only once they arrive.
  if (f.workState === 'arriving') return FOUNDER_CAMP_CENTRE;
  if (f.activity === 'sleep') {
    return { x: f.bed.x, y: f.bed.y };
  }
  if (f.activity === 'eat') return FOUNDER_EAT_TILE;
  // BUILD 1060: rest is beside the founder's closest founder at
  // camp (restTile, set when the activity becomes 'rest') — or the
  // camp centre when there is no companion to rest with.
  if (f.activity === 'rest') return f.restTile ?? FOUNDER_CAMP_CENTRE;
  // Work: carrying → the stockpile (deliver at the camp centre, beside
  // the pile); otherwise → the tree's work tile (a walkable tile
  // adjacent to the tree — the tree tile itself blocks movement), or
  // the camp when no tree is targeted (idle at camp, visible, honest).
  // BUILD 1067: carried grain goes to the camp store too.
  // BUILD 1086: carried stone goes to the camp store too.
  if (f.carrying > 0 || f.carryingGrain > 0 || f.carryingStone > 0 || f.carryingOre > 0) return FOUNDER_CAMP_CENTRE;
  if (f.workState === 'toStockpile') return FOUNDER_CAMP_CENTRE;
  if (f.workTile) return f.workTile;
  return FOUNDER_CAMP_CENTRE;
}

// --- Trees: find + chop (the player's E-key mechanism, reused) ---

/**
 * BUILD 1065 (J-1): every tree within `maxDist` (Manhattan) of
 * (x, y), in the SAME scan order nearestTreeTile used (seeded trees
 * in world order, then wild trees row-major past the map edge) —
 * the scheduler's discovery needs the whole list, not just the
 * nearest, and the two must never disagree about which trees
 * exist. `exclude` skips trees already proven unworkable. Pure read
 * (never mutates the world).
 */
export function treesInRadius(
  world: IsoWorld,
  x: number,
  y: number,
  maxDist: number,
  exclude?: ReadonlySet<string>,
): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (const t of world.trees ?? []) {
    if (exclude?.has(t.tx + ',' + t.ty)) continue;
    if (Math.abs(t.tx - x) + Math.abs(t.ty - y) > maxDist) continue;
    out.push({ tx: t.tx, ty: t.ty });
  }
  // Wild trees only exist past the map edge — skip the out-of-map
  // scan entirely when the whole search box is in-map (the camp is
  // deep in-map, so this is the common case: the per-tick tree
  // search stays a ~226-entry seeded scan, not a 61x61 wild loop).
  if (x - maxDist < 0 || y - maxDist < 0 || x + maxDist >= world.w || y + maxDist >= world.h) {
    for (let ty = y - maxDist; ty <= y + maxDist; ty++) {
      for (let tx = x - maxDist; tx <= x + maxDist; tx++) {
        if (tx >= 0 && ty >= 0 && tx < world.w && ty < world.h) continue;
        if (Math.abs(tx - x) + Math.abs(ty - y) > maxDist) continue;
        if (exclude?.has(tx + ',' + ty)) continue;
        if (wildTreeAt(tx, ty) && !(world.removedWildTrees ?? []).includes(tx + ',' + ty)) out.push({ tx, ty });
      }
    }
  }
  return out;
}

/**
 * Nearest tree within `maxDist` (Manhattan) of (x, y): seeded trees
 * in world.trees, plus wild trees past the map edge. `exclude` skips
 * trees already proven unworkable (no walkable tile beside them).
 * Ties go to the first in scan order (seeded trees in world order,
 * then wild trees row-major) — the order is fixed, so the choice is
 * deterministic. Pure read (never mutates the world).
 */
export function nearestTreeTile(
  world: IsoWorld,
  x: number,
  y: number,
  maxDist: number,
  exclude?: ReadonlySet<string>,
): { tx: number; ty: number } | null {
  let best: { tx: number; ty: number } | null = null;
  let bestD = Infinity;
  // First in scan order wins ties (strict <, so the earliest of a
  // tie keeps the lead — the same rule the old inline scan had).
  for (const t of treesInRadius(world, x, y, maxDist, exclude)) {
    const d = Math.abs(t.tx - x) + Math.abs(t.ty - y);
    if (d >= bestD) continue;
    bestD = d;
    best = t;
  }
  return best;
}

/**
 * Walkable tile adjacent to a tree to chop from (trees block
 * movement, so the founder never stands on the tree tile). Null when
 * no walkable tile is near the tree. Pure.
 */
export function treeWorkTile(world: IsoWorld, tx: number, ty: number): { x: number; y: number } | null {
  return quantizeTile(world, tx, ty, 2);
}

/**
 * Fell the tree at (tx, ty): seeded trees leave world.trees, wild
 * trees join removedWildTrees — the same removal as the player's
 * E-key chop, so the tree disappears for everyone and cannot be
 * chopped twice. Returns true when a tree was actually there.
 * Mutates the world (the caller saves + rebuilds, like the E-key).
 */
export function chopTreeAt(world: IsoWorld, tx: number, ty: number): boolean {
  const seeded = (world.trees ?? []).find((t) => t.tx === tx && t.ty === ty);
  if (seeded) {
    world.trees = (world.trees ?? []).filter((t) => t !== seeded);
    // BUILD 1061: record the chop in removedTrees (the same reason
    // as the E-key handler) — the tree-density migration re-stamps
    // trees from the rule, and without the record a founder-felled
    // tree would resurrect on the next load.
    if (!world.removedTrees) world.removedTrees = [];
    const k = tx + ',' + ty;
    if (!world.removedTrees.includes(k)) world.removedTrees.push(k);
    // BUILD 1085 (1.6): the chopped tile regrows — a sapling is
    // planted here, maturing into a real tree over days at the season
    // rate. Never an instant resurrection: the tree stays chopped
    // until the sapling matures (the 1061 rule, reconciled).
    plantSapling(world, tx, ty);
    return true;
  }
  if ((tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) && wildTreeAt(tx, ty)) {
    const k = tx + ',' + ty;
    if (!(world.removedWildTrees ?? []).includes(k)) {
      if (!world.removedWildTrees) world.removedWildTrees = [];
      world.removedWildTrees.push(k);
      return true;
    }
  }
  return false;
}

// --- Movement: one 900ms step along a cached A* path ---

export type FounderPathState = {
  destKey: string;
  path: { x: number; y: number }[];
  index: number;
  noPathTicks: number;
  blockedTicks: number;
  detour: boolean;
};

export function emptyFounderPath(): FounderPathState {
  return { destKey: '', path: [], index: 0, noPathTicks: 0, blockedTicks: 0, detour: false };
}

/**
 * One movement step toward `dest`, following the resident tick's
 * rules (townsfolk3d.ts / npcMotion.ts): cached A* path, replan when
 * the destination changes or a later path tile becomes unwalkable,
 * sealed wait + 11-tick retry when no route exists, occupied next
 * tile waits, then replans with the blocking tile excluded (3 blocked
 * ticks), then sidesteps, then seals. Nothing teleports; no wait is
 * permanent. Pure apart from the path state it returns.
 */
export function stepFounderMove(
  world: IsoWorld,
  pos: { x: number; y: number },
  dest: { x: number; y: number },
  path: FounderPathState,
  occupied: (x: number, y: number) => boolean,
): { pos: { x: number; y: number }; path: FounderPathState; arrived: boolean } {
  if (pos.x === dest.x && pos.y === dest.y) {
    return { pos, path: { ...path, path: [], index: 0 }, arrived: true };
  }
  const destKey = dest.x + ',' + dest.y;
  let p = path;
  if (!p || p.destKey !== destKey) {
    p = { destKey, path: planPathNpc(world, pos, dest) ?? [], index: 0, noPathTicks: 0, blockedTicks: 0, detour: false };
  }
  if (p.path.length === 0) {
    const noPathTicks = p.noPathTicks + 1;
    if (noPathTicks >= 11) {
      p = { destKey, path: planPathNpc(world, pos, dest) ?? [], index: 0, noPathTicks: 0, blockedTicks: 0, detour: false };
    } else {
      p = { ...p, noPathTicks };
    }
    return { pos, path: p, arrived: false };
  }
  const next = p.path[p.index];
  if (!next) {
    // Path exhausted (a single-tile sidestep the founder is already
    // standing on): replan fresh NOW, like the resident tick's path
    // delete — do NOT fall into the sealed wait below, which would
    // stall the founder for 11 ticks after every sidestep. A
    // genuinely unroutable destination still seals (the empty-path
    // branch, next tick).
    const fresh = planPathNpc(world, pos, dest) ?? [];
    return { pos, path: { destKey, path: fresh, index: 0, noPathTicks: 0, blockedTicks: 0, detour: false }, arrived: false };
  }
  if (pathHasUnwalkableTile(world, p.path, p.index)) {
    p = { destKey, path: planPathNpc(world, pos, dest) ?? [], index: 0, noPathTicks: 0, blockedTicks: 0, detour: false };
    return { pos, path: p, arrived: false };
  }
  if (!occupied(next.x, next.y)) {
    const arrived = next.x === dest.x && next.y === dest.y;
    return { pos: { x: next.x, y: next.y }, path: { ...p, index: p.index + 1, blockedTicks: 0 }, arrived };
  }
  const blockedTicks = p.blockedTicks + 1;
  if (blockedAction(blockedTicks) === 'replan') {
    // FIX-2 (BUILD 1104): route AROUND the blocker, not through them.
    // A head-on pair in the camp<->bakery corridor (pinched to 2 tiles
    // wide by the hut at (126,119)-(129,121) and the bakery at
    // (128,124)-(130,126)) danced forever and starved 147 ticks in the
    // first 800: the detour avoided only the single blocked tile, so it
    // routed through the adjacent row the other founder was about to
    // step onto; the sidestep was a bare single tile, so the next tick
    // replanned the shortest path straight back into the corridor.
    // Two parts: (a) the detour avoids a 3x3 bubble around the blocked
    // tile (a moving blocker may step onto any neighbour next tick);
    // (b) a sidestep is followed by a detour from the aside tile, so
    // the founder stays routed around instead of replanning the
    // shortest path back. The goal tile stays exempt from the bubble
    // (planPathNpc exempts it); a null detour falls back to the old
    // bare sidestep, so tight spots keep the old behaviour.
    const bubble = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) bubble.add((next.x + dx) + ',' + (next.y + dy));
    }
    if (!p.detour) {
      const detour = planPathNpc(world, pos, dest, 4000, bubble);
      if (detour) {
        return { pos, path: { destKey, path: detour, index: 0, noPathTicks: 0, blockedTicks: 0, detour: true }, arrived: false };
      }
    }
    const aside = sidestepTile(world, pos, next, occupied);
    if (aside) {
      const onward = planPathNpc(world, aside, dest, 4000, bubble) ?? [];
      return { pos, path: { destKey, path: [aside, ...onward], index: 0, noPathTicks: 0, blockedTicks: 0, detour: onward.length > 0 }, arrived: false };
    }
    return { pos, path: { destKey, path: [], index: 0, noPathTicks: 0, blockedTicks: 0, detour: false }, arrived: false };
  }
  return { pos, path: { ...p, blockedTicks }, arrived: false };
}

// --- Wait: simulate per wait-step (needs only, never positions) ---

/**
 * One 1056 wait step (10 game-minutes) for a founder: needs decay by
 * the step under the CURRENT activity, then the activity is re-chosen
 * from the new needs + the stepped clock — by the SAME utility scorer
 * the real-time tick uses (BUILD 1059: the world context — pile,
 * construction, tree distance, builder-taken, current job — rides
 * along, so a wait never re-chooses by a different rule). Sleep
 * restores energy. Positions, chopping, and deliveries do NOT
 * fast-forward — the real-time founder tick pauses during a wait, so
 * this is the only simulation that runs. No eating during a wait
 * (meals happen at the camp, and the founder is wherever the wait
 * found them); when the wait ends the tick resumes and the founder
 * walks to eat. `nowAbs` is the stepped clock's absolute minutes —
 * lastAbs advances with it, so the first post-wait tick does not
 * re-decay the waited span. Pure.
 */
export function applyFounderWaitStep(f: FounderState, stepMinutes: number, minutes: number, foodStock: number, nowAbs: number, world: UtilityWorldContext): FounderState {
  const needs = decayFounderNeeds(f.needs, stepMinutes, f.activity);
  const decision = chooseScoredActivity({ ...world, needs, minutes, foodStock });
  return { ...f, needs, activity: decision.activity, lastDecision: decision, lastAbs: nowAbs };
}

// --- Save: versioned founders state (G16) ---

export type FounderSave = {
  /** BUILD 1063 (F-1): the founder's stable id (v4; v3 saves have
   *  none and migrate with the id derived from the name). */
  id: string;
  name: string;
  x: number;
  y: number;
  carrying: number;
  /** BUILD 1067: grain carried (v6; v5 saves have none and
   *  migrate to 0). */
  carryingGrain?: number;
  /** BUILD 1086: stone carried (v8; v7 saves have none and
   *  migrate to 0). */
  carryingStone?: number;
  /** BUILD 1087: build wood carried (v9; v8 saves have none and
   *  migrate to 0). */
  carryingBuild?: number;
  /** BUILD 1088: water carried (v10; v9 saves have none and
   *  migrate to 0). */
  carryingWater?: number;
  /** BUILD 1089: ore carried (v11; v10 saves have none and
   *  migrate to 0). */
  carryingOre?: number;
  /** BUILD 1095: which mineral the carried ore is (v12; older
   *  saves have none and migrate to null — iron, the only mineral
   *  mined before 1095). */
  carryingOreKind?: 'iron' | 'coal' | null;
  /** BUILD 1102: meat / leather / fish / wool carried (v12;
   *  older saves have none and migrate to 0). No version move
   *  (compatible fields). */
  carryingMeat?: number;
  carryingLeather?: number;
  carryingFish?: number;
  carryingWool?: number;
  /** BUILD 1098 (0x21): the founder's profession (v12; older
   *  saves have none and migrate to null — the tick assigns one).
   *  No version move (a compatible field). */
  profession?: ProfessionId | null;
  hunger: number;
  energy: number;
  social: number;
  /** BUILD 1067: health (v6; v5 saves have none and migrate to
   *  100 — no data, assume healthy, the fresh-social precedent). */
  health?: number;
  activity: FounderActivity;
  workState: FounderWorkState;
  chopTicks: number;
  /** BUILD 1058: build ticks on the current hut work step. */
  buildTicks: number;
  /** BUILD 1067: harvest ticks on the current farm tile (v6;
   *  v5 saves have none and migrate to 0). */
  harvestTicks?: number;
  lastAbs: number;
  /** BUILD 1066: the founder's bed (v5; v4 saves have none and
   *  migrate to the founder's index tile in hut 0, residents to
   *  the first free bed). */
  bed?: FounderBed;
  /** BUILD 1060: pairwise affinity + memories (v3; v2 saves have
   *  none and migrate to fresh social). Named socialState — the
   *  save's `social` field is already the needs social (a number). */
  socialState?: FounderSocial;
};

export type FoundersSaveState = {
  version: number;
  founders: FounderSave[];
  stockpileWood: number;
  /** BUILD 1090 (0x19, v12): the granary's stored meals — the
   *  camp's food lives in the granary store now, not the camp
   *  store (same field, new store — v11 saves migrate with the
   *  granary seeded from it). */
  foodStock: number;
  /** BUILD 1069 (0x0F, v7): the camp's stored grain — the mill's
   *  buffer. v6 saves have none and migrate to 0 (the 0x09 24h
   *  test proved a reload lost it). BUILD 1090 (v12): grainStock
   *  is the granary's stored grain now (same field, new store). */
  grainStock: number;
  /** BUILD 1094 (0x1D, v12): the granary's stored flour — the
   *  mill's output, the bakery's input. v12 saves have none and
   *  migrate to 0 (no version move — a compatible field, the
   *  1093 'stages' precedent). */
  flourStock: number;
  /** BUILD 1102 (0x25, v12): the granary's stored meat — the
   *  hunter's yield, the camp's protein. v12 saves have none and
   *  migrate to 0 (no version move — a compatible field). */
  meatStock: number;
  /** BUILD 1102 (0x25, v12): the granary's stored fish — the
   *  fisher's yield. v12 saves have none and migrate to 0. */
  fishStock: number;
  /** BUILD 1086 (0x15, v8): the camp's stored stone — the
   *  quarry loop's stockpile leg. v7 saves have none and migrate
   *  to 0. */
  stoneStock: number;
  /** BUILD 1088 (0x17, v10): the bridge sites (paths.ts) — v9
   *  saves have none and migrate to an empty list. */
  bridges: BridgeSite[];
  /** BUILD 1087 (0x16, v9): the storehouse's construction state
   *  (storehouse.ts) — v8 saves have none and migrate to a fresh
   *  one (nothing started). */
  storehouse: StorehouseState;
  /** BUILD 1087 (0x16, v9): wood stored in the storehouse — v8
   *  saves have none and migrate to 0. */
  storehouseWood: number;
  /** BUILD 1087 (0x16, v9): stone stored in the storehouse — v8
   *  saves have none and migrate to 0. */
  storehouseStone: number;
  /** BUILD 1089 (0x18, v11): iron stored in the storehouse — v10
   *  saves have none and migrate to 0. */
  storehouseOre: number;
  /** BUILD 1095 (0x1E, v12): coal stored in the storehouse — v12
   *  saves have none and migrate to 0. */
  storehouseCoal: number;
  /** BUILD 1095 (0x1E, v12): ingots stored in the storehouse —
   *  v12 saves have none and migrate to 0. */
  storehouseIngots: number;
  /** BUILD 1095 (0x1E, v12): tools stored in the storehouse — v12
   *  saves have none and migrate to 0. */
  storehouseTools: number;
  /** BUILD 1095 (0x1E, v12): timber stored in the storehouse —
   *  v12 saves have none and migrate to 0. */
  storehouseTimber: number;
  /** BUILD 1095 (0x1E, v12): furniture stored in the storehouse
   *  — v12 saves have none and migrate to 0. */
  storehouseFurniture: number;
  /** BUILD 1102 (0x25, v12): wool stored in the storehouse —
   *  the shepherd's shearing. v12 saves have none and migrate
   *  to 0 (no version move — a compatible field). */
  storehouseWool: number;
  /** BUILD 1102 (0x25, v12): leather stored in the storehouse —
   *  the hunter's yield. v12 saves have none and migrate to 0. */
  storehouseLeather: number;
  /** BUILD 1089 (0x18, v11): the mine sites, the quarry site,
   *  and the lumber site (mines.ts) — v10 saves have none and
   *  migrate to fresh (no sites). The deep shape check is
   *  validateMineState (mines.ts) at the load sites — this module
   *  only carries the field (a type-only import, so no runtime
   *  cycle with mines.ts, which imports this module). */
  mines: MineState;
  /** BUILD 1094 (0x1D, v12): the mill + the bakery (foodChain.ts)
   *  — v12 saves have none and migrate to a fresh chain (nothing
   *  started). No version move (a compatible field). */
  foodChain: FoodChainState;
  /** BUILD 1095 (0x1E, v12): the smelter + the blacksmith + the
   *  sawmill + the carpenter + the workshop (metalChain.ts) — v12
   *  saves have none and migrate to a fresh chain (nothing
   *  started). No version move (a compatible field). */
  metalChain: MetalChainState;
  /** BUILD 1096 (0x1F, v12): the inn (housing.ts) — v12 saves
   *  have none and migrate to a fresh inn (nothing started). No
   *  version move (a compatible field). */
  housing: HousingState;
  /** BUILD 1102 (0x25, v12): the pen (animalHusbandry.ts) — v12
   *  saves have none and migrate to a fresh pen (nothing started,
   *  no flock). No version move (a compatible field). */
  pen: PenState;
  /** BUILD 1096 (0x1F, v12): the inn store's food (meals for
   *  resting travelers) — v12 saves have none and migrate to 0.
   *  No version move (a compatible field). */
  innFoodStock: number;
  /** BUILD 1100 (0x23, v12): the settlement plan (sitePlan.ts) —
   *  what to build next, where, and why. v12 saves have none and
   *  migrate to null (the tick re-plans on the first tick). No
   *  version move (a compatible field). */
  sitePlan: SettlementPlan | null;
  /** BUILD 1058: the first hut's construction (v2; v1 saves have
   *  none and migrate to a fresh one). */
  construction: ConstructionState;
};

/** Fresh v12 save: founders at their sleep tiles, empty stockpile,
 *  empty granary (BUILD 1090 — no more magic 30), no hut started,
 *  neutral toward each other. */
export function freshFoundersSave(clockAbs: number): FoundersSaveState {
  return {
    version: FOUNDER_SAVE_VERSION,
    founders: FOUNDER_NAMES.map((name, i) => ({
      id: founderIdFor(name),
      name,
      x: FOUNDER_SLEEP_TILES[i].x,
      y: FOUNDER_SLEEP_TILES[i].y,
      carrying: 0,
      carryingGrain: 0,
      carryingStone: 0,
      carryingBuild: 0,
    carryingWater: 0,
      carryingOre: 0,
      carryingOreKind: null,
      carryingMeat: 0,
      carryingLeather: 0,
      carryingFish: 0,
      carryingWool: 0,
      profession: null,
      hunger: 80,
      energy: 90,
      social: 60,
      health: 100,
      activity: 'work' as FounderActivity,
      workState: 'toTree' as FounderWorkState,
      chopTicks: 0,
      buildTicks: 0,
      harvestTicks: 0,
      lastAbs: clockAbs,
      bed: { hut: 0, x: HUT_SLEEP_TILES[i].x, y: HUT_SLEEP_TILES[i].y },
      socialState: freshFounderSocial(FOUNDER_NAMES.filter((n) => n !== name)),
    })),
    stockpileWood: 0,
    foodStock: FOUNDER_START_FOOD,
    grainStock: 0,
    flourStock: 0,
    meatStock: 0,
    fishStock: 0,
    stoneStock: 0,
    storehouse: freshStorehouse(),
    storehouseWood: 0,
    storehouseStone: 0,
    storehouseOre: 0,
    storehouseCoal: 0,
    storehouseIngots: 0,
    storehouseTools: 0,
    storehouseTimber: 0,
    storehouseFurniture: 0,
    storehouseWool: 0,
    storehouseLeather: 0,
    mines: { mines: [], quarry: null, lumber: null, lastDesignateDay: 1 },
    foodChain: freshFoodChain(),
    metalChain: freshMetalChain(),
    housing: freshHousing(),
    pen: freshPen(),
    innFoodStock: 0,
    sitePlan: null,
    bridges: [],
    construction: freshConstruction(),
  };
}

function clampNeed(n: number, fallback: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

/** A saved bed ({hut, x, y}) is valid when the hut index exists
 *  and the tile is one of that hut's sleep tiles. Pure. */
function validSavedBed(value: unknown): FounderBed | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Record<string, unknown>;
  const hut = Number(b.hut);
  const x = Number(b.x);
  const y = Number(b.y);
  // BUILD 1103: the camp bed — hut -1, only the newcomer's tile
  // (124,119). Any other -1 bed is invalid, like any bad hut bed.
  if (hut === -1) {
    return x === NEWCOMER_SLEEP_TILE.x && y === NEWCOMER_SLEEP_TILE.y ? { hut: -1, x, y } : null;
  }
  if (!Number.isInteger(hut) || hut < 0 || hut >= HUT_SITES.length) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (!HUT_SITES[hut].sleepTiles.some((t) => t.x === x && t.y === y)) return null;
  return { hut, x, y };
}

/**
 * Validate a saved social state for one founder (v3): affinity
 * keys must be the OTHER founders' names, clamped 0..100;
 * affinityDay must be finite numbers ≥ 0; memories must have a
 * valid type, an other-founder name (never self), and finite
 * day/abs — anything else is dropped; the list is capped at 12
 * (oldest first out). Unknown/missing input → fresh social.
 * Pure.
 */
export function validateFounderSocial(value: unknown, selfName: string): FounderSocial {
  const fresh = freshFounderSocial(FOUNDER_NAMES.filter((n) => n !== selfName));
  if (!value || typeof value !== 'object') return fresh;
  const v = value as Record<string, unknown>;
  const affinity: Record<string, number> = { ...fresh.affinity };
  const affinityDay: Record<string, number> = { ...fresh.affinityDay };
  if (v.affinity && typeof v.affinity === 'object') {
    for (const [k, raw] of Object.entries(v.affinity as Record<string, unknown>)) {
      if (k === selfName || !ALL_SETTLER_NAMES.includes(k)) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) affinity[k] = Math.max(0, Math.min(100, Math.round(n)));
    }
  }
  if (v.affinityDay && typeof v.affinityDay === 'object') {
    for (const [k, raw] of Object.entries(v.affinityDay as Record<string, unknown>)) {
      if (k === selfName || !ALL_SETTLER_NAMES.includes(k)) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) affinityDay[k] = Math.max(0, Math.floor(n));
    }
  }
  const memories: FounderSocial['memories'] = [];
  if (Array.isArray(v.memories)) {
    for (const m of v.memories) {
      if (!m || typeof m !== 'object') continue;
      const r = m as Record<string, unknown>;
      if (r.type !== 'build' && r.type !== 'eat' && r.type !== 'rest' && r.type !== 'sleep') continue;
      if (typeof r.other !== 'string' || r.other === selfName || !ALL_SETTLER_NAMES.includes(r.other)) continue;
      const day = Number(r.day);
      const abs = Number(r.abs);
      if (!Number.isFinite(day) || !Number.isFinite(abs)) continue;
      memories.push({ type: r.type, other: r.other, day: Math.floor(day), abs: Math.floor(abs) });
    }
  }
  while (memories.length > 12) memories.shift();
  return { affinity, affinityDay, memories };
}

/**
 * Migrate an unknown founders save to the current version (v13).
 * Missing version field =
 * v0 (defaults filled); version 1 = validated + clamped (unknown
 * founder names dropped, missing founders restored at camp,
 * 'chopping' resets to 'toTree' — the tree target is session-only),
 * construction defaults to fresh (v1 predates the hut); version 2 =
 * validated + clamped the same way, social defaults to fresh
 * (v2 predates memory); version 3 = validated + clamped, social
 * validated by validateFounderSocial, ids derived from the names
 * (v3 predates stable ids — the derived id is the same string the
 * 1062 coordinator derived on every advance); version 4 =
 * validated + clamped, social validated, stored ids kept (a stored
 * id is authoritative — migration never re-derives it, so a rename
 * keeps the identity); a stored id that is missing, empty, or
 * already taken by an earlier founder in this save is replaced by
 * the derived id (with a :2/:3 suffix on the pathological case
 * where even the derived id is taken). Any other version, or a
 * non-object, returns null (fresh defaults — never guess at an
 * unknown future format). Pure.
 */
export function migrateFoundersSave(value: unknown): FoundersSaveState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.version !== undefined && v.version !== 0 && v.version !== 1 && v.version !== 2 && v.version !== 3 && v.version !== 4 && v.version !== 5 && v.version !== 6 && v.version !== 7 && v.version !== 8 && v.version !== 9 && v.version !== 10 && v.version !== 11 && v.version !== 12 && v.version !== FOUNDER_SAVE_VERSION) return null;
  const rawFounders = Array.isArray(v.founders) ? v.founders : [];
  // BUILD 1066 (v5): construction from the save — a v5 save has the
  // per-site list (`sites`); a v4-or-earlier save has the single-hut
  // shape (top-level state/progress/spentWood = hut 1) and the other
  // sites are fresh. A 'done' hut 1 with a founder still marked
  // building/toSite (saved mid-completion) resets that founder to
  // 'toTree' below.
  const rawC = (v.construction && typeof v.construction === 'object' ? v.construction : {}) as Record<string, unknown>;
  const rawSites = Array.isArray(rawC.sites) ? (rawC.sites as Record<string, unknown>[]) : null;
  const siteState = (raw: Record<string, unknown> | undefined): SiteState => {
    const st = raw?.state === 'building' || raw?.state === 'done' ? (raw.state as HutState) : 'none';
    let progress = Math.max(0, Math.min(6, Math.round(Number(raw?.progress) || 0)));
    let spentWood = Math.max(0, Math.round(Number(raw?.spentWood) || 0));
    if (st === 'done') {
      progress = 6;
      spentWood = 12;
    }
    // BUILD 1093: keep the saved per-stage progress when it is
    // valid (it sums to the total); an old save without it derives
    // the stages from the total (the sequential split). The save
    // version stays v12 — a compatible field, not a move.
    const stages = stageProgressOf({ progress, stages: (raw as { stages?: StageSteps } | undefined)?.stages }, HUT_WORK_STEPS);
    return { state: st, progress, spentWood, stages };
  };
  const sites: SiteState[] = HUT_SITES.map((_, i) => {
    if (rawSites && rawSites[i]) return siteState(rawSites[i]);
    if (i === 0) return siteState(rawC);
    return { state: 'none' as HutState, progress: 0, spentWood: 0 };
  });
  const construction: ConstructionState = constructionFromSites(sites);
  // BUILD 1063 (F-1): stable ids — a stored id is authoritative
  // and kept; a missing/empty/colliding one is replaced by the
  // derived id (suffixed on the pathological case where even the
  // derived id is already taken). The set lives outside the map so
  // two saved founders can never keep the same id.
  const takenIds = new Set<string>();
  const founders: FounderSave[] = FOUNDER_NAMES.map((name, i) => {
    const s = rawFounders.find(
      (f: unknown) => f && typeof f === 'object' && (f as Record<string, unknown>).name === name,
    ) as Record<string, unknown> | undefined;
    const num = (k: string, d: number): number => {
      const n = s ? Number(s[k]) : NaN;
      return Number.isFinite(n) ? n : d;
    };
    let id = typeof s?.id === 'string' && s.id.length > 0 ? (s.id as string) : founderIdFor(name);
    if (takenIds.has(id)) {
      id = founderIdFor(name);
      let n = 2;
      while (takenIds.has(id)) {
        id = founderIdFor(name) + ':' + n;
        n++;
      }
    }
    takenIds.add(id);
    const activity =
      s?.activity === 'sleep' || s?.activity === 'eat' || s?.activity === 'rest' || s?.activity === 'work' || s?.activity === 'build'
        ? (s.activity as FounderActivity)
        : 'work';
    let workState: FounderWorkState =
      s?.workState === 'toTree' || s?.workState === 'toStockpile' || s?.workState === 'idle' || s?.workState === 'toSite' || s?.workState === 'building' || s?.workState === 'arriving' || s?.workState === 'toFarm' || s?.workState === 'harvesting' || s?.workState === 'toStorehouse' || s?.workState === 'toQuarry' || s?.workState === 'mining' || s?.workState === 'toMine' || s?.workState === 'miningOre' || s?.workState === 'toWell' || s?.workState === 'toWater' || s?.workState === 'toPlant' || s?.workState === 'planting' || s?.workState === 'toMill' || s?.workState === 'milling' || s?.workState === 'toBakery' || s?.workState === 'baking' || s?.workState === 'chopping' || s?.workState === 'toSmelter' || s?.workState === 'smelting' || s?.workState === 'toSmith' || s?.workState === 'smithing' || s?.workState === 'toSawmill' || s?.workState === 'sawing' || s?.workState === 'toCarpenter' || s?.workState === 'carpentering' || s?.workState === 'toPrey' || s?.workState === 'hunting' || s?.workState === 'toBank' || s?.workState === 'fishing' || s?.workState === 'toPen' || s?.workState === 'shepherding'
        ? (s.workState as FounderWorkState)
        : 'toTree';
    if (construction.sites[0].state === 'done' && (workState === 'toSite' || workState === 'building')) workState = 'toTree';
    return {
      id,
      name,
      x: Math.round(num('x', FOUNDER_SLEEP_TILES[i].x)),
      y: Math.round(num('y', FOUNDER_SLEEP_TILES[i].y)),
      carrying: Math.max(0, Math.round(num('carrying', 0))),
      carryingGrain: Math.max(0, Math.round(num('carryingGrain', 0))),
      carryingStone: Math.max(0, Math.round(num('carryingStone', 0))),
      carryingBuild: Math.max(0, Math.round(num('carryingBuild', 0))),
      carryingWater: Math.max(0, Math.round(num('carryingWater', 0))),
      carryingOre: Math.max(0, Math.round(num('carryingOre', 0))),
      carryingOreKind: s?.carryingOreKind === 'coal' ? 'coal' : s?.carryingOreKind === 'iron' ? 'iron' : null,
      carryingMeat: Math.max(0, Math.round(num('carryingMeat', 0))),
      carryingLeather: Math.max(0, Math.round(num('carryingLeather', 0))),
      carryingFish: Math.max(0, Math.round(num('carryingFish', 0))),
      carryingWool: Math.max(0, Math.round(num('carryingWool', 0))),
      profession: professionFromSave(s?.profession),
      hunger: clampNeed(num('hunger', 80), 80),
      energy: clampNeed(num('energy', 90), 90),
      social: clampNeed(num('social', 60), 60),
      health: clampNeed(num('health', 100), 100),
      activity,
      workState,
      chopTicks: Math.max(0, Math.round(num('chopTicks', 0))),
      buildTicks: Math.max(0, Math.round(num('buildTicks', 0))),
      harvestTicks: Math.max(0, Math.round(num('harvestTicks', 0))),
      lastAbs: Math.max(0, Math.round(num('lastAbs', 0))),
      // BUILD 1066 (v5): the bed — from the save when valid, else
      // the founder's index tile in hut 0 (v4 saves have no bed).
      bed: validSavedBed(s?.bed) ?? { hut: 0, x: HUT_SLEEP_TILES[i].x, y: HUT_SLEEP_TILES[i].y },
      // BUILD 1060: social from the save (v3) — v2 and older have
      // none and migrate to fresh (neutral, no memories).
      socialState: validateFounderSocial(s?.socialState, name),
    };
  });
  // BUILD 1066 (v5): residents — saved founders beyond the 3 names
  // (newcomers who arrived through the chain). They keep their
  // name, id, needs, and bed; a missing/invalid/taken bed gets the
  // first free bed in a completed hut (or hut 0's first sleep tile
  // when no hut is done yet — a safety net, not the normal path,
  // since a resident only arrives when a bed is free).
  const takenBeds = new Set(founders.map((f) => (f.bed ? f.bed.hut + ',' + f.bed.x + ',' + f.bed.y : '')));
  for (const raw of rawFounders) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const rName = typeof r.name === 'string' ? r.name : '';
    if (!rName || FOUNDER_NAMES.includes(rName)) continue;
    if (founders.some((f) => f.name === rName)) continue;
    const num = (k: string, d: number): number => {
      const n = Number(r[k]);
      return Number.isFinite(n) ? n : d;
    };
    let rId = typeof r.id === 'string' && (r.id as string).length > 0 ? (r.id as string) : founderIdFor(rName);
    if (takenIds.has(rId)) {
      rId = founderIdFor(rName);
      let n = 2;
      while (takenIds.has(rId)) {
        rId = founderIdFor(rName) + ':' + n;
        n++;
      }
    }
    takenIds.add(rId);
    const rActivity =
      r.activity === 'sleep' || r.activity === 'eat' || r.activity === 'rest' || r.activity === 'work' || r.activity === 'build'
        ? (r.activity as FounderActivity)
        : 'work';
    let rWorkState: FounderWorkState =
      r.workState === 'toTree' || r.workState === 'toStockpile' || r.workState === 'idle' || r.workState === 'toSite' || r.workState === 'building' || r.workState === 'arriving' || r.workState === 'toFarm' || r.workState === 'harvesting' || r.workState === 'toStorehouse' || r.workState === 'toQuarry' || r.workState === 'mining' || r.workState === 'toMine' || r.workState === 'miningOre' || r.workState === 'toWell' || r.workState === 'toWater' || r.workState === 'toPlant' || r.workState === 'planting' || r.workState === 'chopping' || r.workState === 'toMill' || r.workState === 'milling' || r.workState === 'toBakery' || r.workState === 'baking' || r.workState === 'toSmelter' || r.workState === 'smelting' || r.workState === 'toSmith' || r.workState === 'smithing' || r.workState === 'toSawmill' || r.workState === 'sawing' || r.workState === 'toCarpenter' || r.workState === 'carpentering' || r.workState === 'toPrey' || r.workState === 'hunting' || r.workState === 'toBank' || r.workState === 'fishing' || r.workState === 'toPen' || r.workState === 'shepherding'
        ? (r.workState as FounderWorkState)
        : 'toTree';
    if (construction.sites[0].state === 'done' && (rWorkState === 'toSite' || rWorkState === 'building')) rWorkState = 'toTree';
    const rBed = validSavedBed(r.bed);
    // BUILD 1103: the newcomer's bed is the camp bed, never a hut
    // bed — a saved Tamsin without a valid bed falls back to it
    // (a pool resident falls back to the first free hut bed).
    const bed = rBed && !takenBeds.has(rBed.hut + ',' + rBed.x + ',' + rBed.y)
      ? rBed
      : rName === NEWCOMER_NAME
        ? { hut: -1, x: NEWCOMER_SLEEP_TILE.x, y: NEWCOMER_SLEEP_TILE.y }
        : freeBed(construction, takenBeds) ?? { hut: 0, x: HUT_SLEEP_TILES[0].x, y: HUT_SLEEP_TILES[0].y };
    takenBeds.add(bed.hut + ',' + bed.x + ',' + bed.y);
    founders.push({
      id: rId,
      name: rName,
      x: Math.round(num('x', FOUNDER_CAMP.x)),
      y: Math.round(num('y', FOUNDER_CAMP.y)),
      carrying: Math.max(0, Math.round(num('carrying', 0))),
      carryingGrain: Math.max(0, Math.round(num('carryingGrain', 0))),
      carryingStone: Math.max(0, Math.round(num('carryingStone', 0))),
      carryingBuild: Math.max(0, Math.round(num('carryingBuild', 0))),
      carryingWater: Math.max(0, Math.round(num('carryingWater', 0))),
      carryingOre: Math.max(0, Math.round(num('carryingOre', 0))),
      carryingOreKind: r.carryingOreKind === 'coal' ? 'coal' : r.carryingOreKind === 'iron' ? 'iron' : null,
      carryingMeat: Math.max(0, Math.round(num('carryingMeat', 0))),
      carryingLeather: Math.max(0, Math.round(num('carryingLeather', 0))),
      carryingFish: Math.max(0, Math.round(num('carryingFish', 0))),
      carryingWool: Math.max(0, Math.round(num('carryingWool', 0))),
      profession: professionFromSave(r.profession),
      hunger: clampNeed(num('hunger', 80), 80),
      energy: clampNeed(num('energy', 90), 90),
      social: clampNeed(num('social', 60), 60),
      health: clampNeed(num('health', 100), 100),
      activity: rActivity,
      workState: rWorkState,
      chopTicks: Math.max(0, Math.round(num('chopTicks', 0))),
      buildTicks: Math.max(0, Math.round(num('buildTicks', 0))),
      harvestTicks: Math.max(0, Math.round(num('harvestTicks', 0))),
      lastAbs: Math.max(0, Math.round(num('lastAbs', 0))),
      bed,
      socialState: validateFounderSocial(r.socialState, rName),
    });
  }
  const stockpileWood =
    v.stockpileWood == null || !Number.isFinite(Number(v.stockpileWood))
      ? 0
      : Math.max(0, Math.round(Number(v.stockpileWood)));
  const foodStock =
    v.foodStock == null || !Number.isFinite(Number(v.foodStock))
      ? FOUNDER_START_FOOD
      : Math.max(0, Math.round(Number(v.foodStock)));
  // BUILD 1069 (v7): the camp's stored grain — v6 saves have none
  // and migrate to 0 (no data — assume the mill's buffer is empty).
  const grainStock =
    v.grainStock == null || !Number.isFinite(Number(v.grainStock))
      ? 0
      : Math.max(0, Math.round(Number(v.grainStock)));
  // BUILD 1094 (v12): the granary's stored flour — v12 saves have
  // none and migrate to 0 (no data — assume the granary holds no
  // flour). No version move (a compatible field).
  const flourStock =
    v.flourStock == null || !Number.isFinite(Number(v.flourStock))
      ? 0
      : Math.max(0, Math.round(Number(v.flourStock)));
  // BUILD 1102 (v12): the granary's stored meat + fish — v12 saves
  // have none and migrate to 0 (no data — assume the granary holds
  // neither). No version move (compatible fields).
  const meatStock =
    v.meatStock == null || !Number.isFinite(Number(v.meatStock))
      ? 0
      : Math.max(0, Math.round(Number(v.meatStock)));
  const fishStock =
    v.fishStock == null || !Number.isFinite(Number(v.fishStock))
      ? 0
      : Math.max(0, Math.round(Number(v.fishStock)));
  // BUILD 1094 (v12): the mill + the bakery — v12 saves have none
  // and migrate to a fresh chain (nothing started). The deep shape
  // check is validateFoodChainState (foodChain.ts).
  const foodChain: FoodChainState = validateFoodChainState(v.foodChain);
  // BUILD 1102 (v12): the pen — v12 saves have none and migrate
  // to a fresh pen (nothing started, no flock). The deep shape
  // check is validatePenState (animalHusbandry.ts).
  const pen: PenState = validatePenState(v.pen);
  // BUILD 1086 (v8): the camp's stored stone — v7 saves have none
  // and migrate to 0 (no data — assume the pile holds no stone).
  const stoneStock =
    v.stoneStock == null || !Number.isFinite(Number(v.stoneStock))
      ? 0
      : Math.max(0, Math.round(Number(v.stoneStock)));
  // BUILD 1087 (v9): the storehouse — v8 saves have none and
  // migrate to a fresh one (nothing started, empty counts — the
  // camp pile keeps everything, the same as before).
  const storehouse = validateStorehouseState(v.storehouse);
  const storehouseWood =
    v.storehouseWood == null || !Number.isFinite(Number(v.storehouseWood))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseWood)));
  const storehouseStone =
    v.storehouseStone == null || !Number.isFinite(Number(v.storehouseStone))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseStone)));
  // BUILD 1089 (v11): the storehouse's stored ore (iron) — v10
  // saves have none and migrate to 0.
  const storehouseOre =
    v.storehouseOre == null || !Number.isFinite(Number(v.storehouseOre))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseOre)));
  // BUILD 1095 (v12): the storehouse's coal / ingots / tools /
  // timber / furniture — v12 saves have none and migrate to 0
  // (no data — assume the storehouse holds none). No version
  // move (compatible fields).
  const storehouseCoal =
    v.storehouseCoal == null || !Number.isFinite(Number(v.storehouseCoal))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseCoal)));
  const storehouseIngots =
    v.storehouseIngots == null || !Number.isFinite(Number(v.storehouseIngots))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseIngots)));
  const storehouseTools =
    v.storehouseTools == null || !Number.isFinite(Number(v.storehouseTools))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseTools)));
  const storehouseTimber =
    v.storehouseTimber == null || !Number.isFinite(Number(v.storehouseTimber))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseTimber)));
  const storehouseFurniture =
    v.storehouseFurniture == null || !Number.isFinite(Number(v.storehouseFurniture))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseFurniture)));
  // BUILD 1102 (v12): the storehouse's wool + leather — v12 saves
  // have none and migrate to 0. No version move (compatible fields).
  const storehouseWool =
    v.storehouseWool == null || !Number.isFinite(Number(v.storehouseWool))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseWool)));
  const storehouseLeather =
    v.storehouseLeather == null || !Number.isFinite(Number(v.storehouseLeather))
      ? 0
      : Math.max(0, Math.round(Number(v.storehouseLeather)));
  // BUILD 1095 (v12): the metal chain — v12 saves have none and
  // migrate to a fresh chain (nothing started). The deep shape
  // check is validateMetalChainState (metalChain.ts).
  const metalChain: MetalChainState = validateMetalChainState(v.metalChain);
  // BUILD 1096 (0x1F, v12): the inn — v12 saves have none and
  // migrate to a fresh inn (nothing started). The deep shape
  // check is validateHousingState (housing.ts).
  const housing: HousingState = validateHousingState(v.housing);
  // BUILD 1096 (0x1F, v12): the inn store's food — v12 saves have
  // none and migrate to 0 (no data — assume the inn holds no
  // meals). No version move (a compatible field).
  const innFoodStock =
    v.innFoodStock == null || !Number.isFinite(Number(v.innFoodStock))
      ? 0
      : Math.max(0, Math.round(Number(v.innFoodStock)));
  // BUILD 1089 (v11): the mines state — v10 saves have none and
  // migrate to fresh (no sites). Carried through as-is; the deep
  // shape check is validateMineState (mines.ts) at the load sites.
  const mines: MineState =
    v.mines && typeof v.mines === 'object' ? (v.mines as MineState) : { mines: [], quarry: null, lumber: null, lastDesignateDay: 1 };
  // BUILD 1088 (v10): the bridge sites — v9 saves have none and
  // migrate to an empty list (no path had met a river yet). A
  // corrupt entry is dropped, never guessed at (the shape check
  // mirrors validateBridgeSite in paths.ts).
  const bridges: BridgeSite[] = [];
  if (Array.isArray(v.bridges)) {
    for (const raw of v.bridges as Record<string, unknown>[]) {
      if (!raw || typeof raw !== 'object') continue;
      const bx = Number(raw.x);
      const by = Number(raw.y);
      const wt = raw.workTile as Record<string, unknown> | undefined;
      const bwx = Number(wt?.x);
      const bwy = Number(wt?.y);
      if (!Number.isInteger(bx) || !Number.isInteger(by) || !Number.isInteger(bwx) || !Number.isInteger(bwy)) continue;
      const bstate = raw.state === 'building' || raw.state === 'done' ? (raw.state as 'building' | 'done') : 'none';
      let bprogress = Math.max(0, Math.min(2, Math.round(Number(raw.progress) || 0)));
      let bspent = Math.max(0, Math.round(Number(raw.spentWood) || 0));
      if (bstate === 'done') { bprogress = 2; bspent = 4; }
      if (bstate === 'none') { bprogress = 0; bspent = 0; }
      bridges.push({ id: 'bridge-' + bx + '-' + by, x: bx, y: by, workTile: { x: bwx, y: bwy }, state: bstate, progress: bprogress, spentWood: bspent });
    }
  }
  // BUILD 1100 (0x23, v12): the settlement plan — v12 saves have
  // none and migrate to null (the tick re-plans). Carried through
  // as-is; the deep shape check is sitePlanFromSave (sitePlan.ts)
  // at the load sites (the mines precedent).
  const sitePlan: SettlementPlan | null =
    v.sitePlan && typeof v.sitePlan === 'object' ? (v.sitePlan as SettlementPlan) : null;
  return { version: FOUNDER_SAVE_VERSION, founders, stockpileWood, foodStock, grainStock, flourStock, meatStock, fishStock, stoneStock, storehouse, storehouseWood, storehouseStone, storehouseOre, storehouseCoal, storehouseIngots, storehouseTools, storehouseTimber, storehouseFurniture, storehouseWool, storehouseLeather, mines, foodChain, metalChain, housing, pen, innFoodStock, sitePlan, bridges, construction };
}

/** Serialize a founders save (the versioned format, for the round-
 *  trip asserts and the real save below). Pure. */
export function serializeFoundersSave(state: FoundersSaveState): string {
  return JSON.stringify(state);
}

/** Load the founders save (migrated). Null when nothing is saved or
 *  the saved data is corrupt/unknown — the caller uses fresh defaults.
 *  I/O: localStorage only (never called by the sim or the asserts). */
export function loadFoundersSave(): FoundersSaveState | null {
  try {
    const raw = localStorage.getItem(FOUNDERS_SAVE_KEY);
    if (!raw) return null;
    return migrateFoundersSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist the founders save (versioned). I/O: localStorage only. */
export function saveFoundersSave(state: FoundersSaveState): void {
  try {
    localStorage.setItem(FOUNDERS_SAVE_KEY, serializeFoundersSave(state));
  } catch {
    /* ignore */
  }
}

/** Runtime state → save shape (needs rounded, session-only fields
 *  dropped). Pure. */
export function foundersSaveOf(founders: FounderState[], stockpileWood: number, foodStock: number, grainStock: number, stoneStock: number, construction: ConstructionState, storehouseWood = 0, storehouseStone = 0, storehouse: StorehouseState = freshStorehouse(), bridges: BridgeSite[] = [], storehouseOre = 0, mines: MineState = { mines: [], quarry: null, lumber: null, lastDesignateDay: 1 }, flourStock = 0, foodChain: FoodChainState = freshFoodChain(), storehouseCoal = 0, storehouseIngots = 0, storehouseTools = 0, storehouseTimber = 0, storehouseFurniture = 0, metalChain: MetalChainState = freshMetalChain(), housing: HousingState = freshHousing(), innFoodStock = 0, sitePlan: SettlementPlan | null = null, pen: PenState = freshPen(), meatStock = 0, fishStock = 0, storehouseWool = 0, storehouseLeather = 0): FoundersSaveState {
  return {
    version: FOUNDER_SAVE_VERSION,
    founders: founders.map((f) => ({
      id: f.id,
      name: f.name,
      x: Math.round(f.x),
      y: Math.round(f.y),
      carrying: f.carrying,
      carryingGrain: f.carryingGrain,
      carryingStone: f.carryingStone,
      carryingBuild: f.carryingBuild,
      carryingWater: f.carryingWater,
      carryingOre: f.carryingOre,
      carryingOreKind: f.carryingOreKind,
      carryingMeat: f.carryingMeat,
      carryingLeather: f.carryingLeather,
      carryingFish: f.carryingFish,
      carryingWool: f.carryingWool,
      profession: f.profession ?? null,
      hunger: Math.round(f.needs.hunger),
      energy: Math.round(f.needs.energy),
      social: Math.round(f.needs.social),
      health: Math.round(f.needs.health),
      activity: f.activity,
      workState: f.workState,
      chopTicks: f.chopTicks,
      buildTicks: f.buildTicks,
      harvestTicks: f.harvestTicks,
      lastAbs: f.lastAbs,
      bed: { ...f.bed },
      socialState: {
        affinity: { ...f.social.affinity },
        affinityDay: { ...f.social.affinityDay },
        memories: f.social.memories.map((m) => ({ ...m })),
      },
    })),
    stockpileWood,
    foodStock,
    grainStock,
    flourStock,
    meatStock,
    fishStock,
    stoneStock,
    storehouse: { ...storehouse },
    storehouseWood,
    storehouseStone,
    storehouseOre,
    storehouseCoal,
    storehouseIngots,
    storehouseTools,
    storehouseTimber,
    storehouseFurniture,
    storehouseWool,
    storehouseLeather,
    mines: {
      mines: mines.mines.map((m) => ({ ...m, workTile: { ...m.workTile } })),
      quarry: mines.quarry ? { ...mines.quarry, centre: { ...mines.quarry.centre } } : null,
      lumber: mines.lumber ? { ...mines.lumber, rect: { ...mines.lumber.rect } } : null,
      lastDesignateDay: mines.lastDesignateDay,
    },
    foodChain: { mill: { ...foodChain.mill }, bakery: { ...foodChain.bakery }, placedWindmillGrindHour: foodChain.placedWindmillGrindHour },
    metalChain: { smelter: { ...metalChain.smelter }, blacksmith: { ...metalChain.blacksmith }, sawmill: { ...metalChain.sawmill }, carpenter: { ...metalChain.carpenter }, workshop: { ...metalChain.workshop } },
    housing: { inn: { ...housing.inn } },
    pen: { site: { ...pen.site }, flock: pen.flock, fedDay: pen.fedDay, woolReady: pen.woolReady, stocked: pen.stocked },
    innFoodStock,
    sitePlan: sitePlan
      ? { building: sitePlan.building, site: { rect: { ...sitePlan.site.rect }, door: { ...sitePlan.site.door }, approach: { ...sitePlan.site.approach } }, need: sitePlan.need, reasons: [...sitePlan.reasons], decidedDay: sitePlan.decidedDay }
      : null,
    bridges: bridges.map((b) => ({ ...b, workTile: { ...b.workTile } })),
    construction: constructionFromSites(sitesOf(construction)),
  };
}

/** Save shape → runtime state (positions validated by the caller
 *  against the live world; tree targets re-found on demand). The
 *  bed comes from the save when valid; a missing/invalid/taken bed
 *  falls back to the founder's index tile in hut 0 (the 3
 *  founders) or the first free bed in a completed hut (a
 *  resident). Pure. */
export function foundersStateOf(save: FoundersSaveState): FounderState[] {
  const taken = new Set<string>();
  return save.founders.map((s) => {
    const idx = FOUNDER_NAMES.indexOf(s.name);
    const savedBed = validSavedBed(s.bed);
    let bed: FounderBed;
    if (savedBed && !taken.has(savedBed.hut + ',' + savedBed.x + ',' + savedBed.y)) {
      bed = savedBed;
    } else if (idx >= 0) {
      bed = { hut: 0, x: FOUNDER_SLEEP_TILES[idx].x, y: FOUNDER_SLEEP_TILES[idx].y };
    } else if (s.name === NEWCOMER_NAME) {
      // BUILD 1103: the newcomer's bed is the camp bed — never a hut bed.
      bed = { hut: -1, x: NEWCOMER_SLEEP_TILE.x, y: NEWCOMER_SLEEP_TILE.y };
    } else {
      bed = freeBed(save.construction, taken) ?? { hut: 0, x: FOUNDER_SLEEP_TILES[0].x, y: FOUNDER_SLEEP_TILES[0].y };
    }
    taken.add(bed.hut + ',' + bed.x + ',' + bed.y);
    return {
      id: typeof s.id === 'string' && s.id.length > 0 ? s.id : founderIdFor(s.name),
      name: s.name,
      x: s.x,
      y: s.y,
      needs: { hunger: s.hunger, energy: s.energy, social: s.social, health: s.health ?? 100 },
      activity: s.activity,
      workState: s.workState,
      carrying: s.carrying,
      carryingGrain: s.carryingGrain ?? 0,
      carryingStone: s.carryingStone ?? 0,
      carryingBuild: s.carryingBuild ?? 0,
      carryingWater: s.carryingWater ?? 0,
      carryingOre: s.carryingOre ?? 0,
      carryingMeat: s.carryingMeat ?? 0,
      carryingLeather: s.carryingLeather ?? 0,
      carryingFish: s.carryingFish ?? 0,
      carryingWool: s.carryingWool ?? 0,
      chopTicks: s.chopTicks,
      buildTicks: s.buildTicks ?? 0,
      harvestTicks: s.harvestTicks ?? 0,
      mineTicks: 0,
      plantTicks: 0,
      millTicks: 0,
      bakeTicks: 0,
      smeltTicks: 0,
      smithTicks: 0,
      sawTicks: 0,
      carpenterTicks: 0,
      animalTicks: 0,
      carryingOreKind: s.carryingOreKind ?? null,
      preyTarget: null,
      profession: professionFromSave(s.profession),
      treeTarget: null,
      farmTarget: null,
    waterTarget: null,
      quarryTarget: null,
      mineTarget: null,
      workTile: null,
      lastAbs: s.lastAbs,
      social: validateFounderSocial(s.socialState, s.name),
      bed,
      restTile: null,
    };
  });
}

// --- Stockpile visual: a log stack in the fx buffer ---

/** Bark brown + darker end grain for the log pile. */
export const STOCKPILE_LOG: [number, number, number] = [0.42, 0.29, 0.16];
export const STOCKPILE_LOG_DARK: [number, number, number] = [0.3, 0.2, 0.11];

/**
 * Log-pile triangles for the stockpile tile: a pyramid of horizontal
 * logs (3 bottom, 2 middle, 1 top). 1 log at 0 wood, +1 per 2 wood,
 * capped at 6 — so the pile visibly grows as founders deliver. A
 * log is a 12-triangle box; faces alternate light/dark for shading
 * (the wheat-stalk precedent). Pure geometry.
 */
export function stockpileLogsFor(tx: number, ty: number, baseY: number, wood: number): WheatTri[] {
  const logs = Math.max(1, Math.min(6, 1 + Math.floor(Math.max(0, wood) / 2)));
  const out: WheatTri[] = [];
  const pushBox = (cx: number, cz: number, y0: number, len: number, h: number, d: number) => {
    const x0 = cx - len / 2, x1 = cx + len / 2;
    const z0 = cz - d / 2, z1 = cz + d / 2;
    const y1 = y0 + h;
    const c = STOCKPILE_LOG, k = STOCKPILE_LOG_DARK;
    const v: [number, number, number][] = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ];
    const faces: [number, number, number, number, [number, number, number]][] = [
      [4, 5, 6, 7, c], // top
      [0, 2, 1, 3, k], // bottom (dark, unseen)
      [0, 1, 5, 4, c], // north
      [2, 3, 7, 6, k], // south
      [1, 2, 6, 5, c], // east
      [3, 0, 4, 7, k], // west
    ];
    for (const [a, b, cc, dd, col] of faces) {
      out.push({ a: v[a], b: v[b], c: v[cc], col });
      out.push({ a: v[a], b: v[cc], c: v[dd], col });
    }
  };
  const cx = tx + 0.5, cz = ty + 0.5;
  const rows: { y: number; zs: number[] }[] = [
    { y: baseY, zs: [-0.22, 0, 0.22] },
    { y: baseY + 0.12, zs: [-0.11, 0.11] },
    { y: baseY + 0.24, zs: [0] },
  ];
  let placed = 0;
  for (const row of rows) {
    for (const dz of row.zs) {
      if (placed >= logs) break;
      pushBox(cx, cz + dz, row.y, 0.7, 0.12, 0.12);
      placed++;
    }
    if (placed >= logs) break;
  }
  return out;
}
