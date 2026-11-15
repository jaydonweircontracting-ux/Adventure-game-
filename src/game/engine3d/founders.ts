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
 *   memories).
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
import type { ConstructionState } from './construction';
import type { IsoWorld } from '../iso/isoWorld';
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
 *  (neutral toward each other, no memories). */
export const FOUNDER_SAVE_VERSION = 3;

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

/** Meals the founders brought with them (3 founders × 3 meals/day
 *  ≈ 3 days of food; nothing replenishes it yet). */
export const FOUNDER_START_FOOD = 30;
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
/** Wood per felled tree — the same as the player's E-key chop. */
export const FOUNDER_WOOD_PER_TREE = 2;

// --- Needs model (villageLife.ts parity) ---

/** 0..100, higher = more satisfied (the villageLife convention). */
export type FounderNeeds = { hunger: number; energy: number; social: number };

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
  return { hunger, energy, social };
}

/** Round needs for display/save (runtime keeps floats). */
export function roundFounderNeeds(needs: FounderNeeds): FounderNeeds {
  return { hunger: Math.round(needs.hunger), energy: Math.round(needs.energy), social: Math.round(needs.social) };
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

// --- Founder state ---

export type FounderWorkState = 'toTree' | 'chopping' | 'toStockpile' | 'idle' | 'toSite' | 'building';

/** Runtime founder state (path cache + tree target are session-only,
 *  never saved). */
export type FounderState = {
  name: string;
  x: number;
  y: number;
  needs: FounderNeeds;
  activity: FounderActivity;
  workState: FounderWorkState;
  /** Wood currently carried (0 or FOUNDER_WOOD_PER_TREE). */
  carrying: number;
  /** Chop ticks spent on the current tree. */
  chopTicks: number;
  /** BUILD 1058: build ticks spent on the current hut work step. */
  buildTicks: number;
  /** Tree being worked, if any (session-only). */
  treeTarget: { x: number; y: number } | null;
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
  /** BUILD 1060: the tile this founder rests on (session-only,
   *  never saved) — a tile beside their closest founder at camp
   *  (memory.ts restTileFor), or null for the camp centre. Set when
   *  the founder's activity becomes 'rest', cleared when it
   *  changes away. */
  restTile: { x: number; y: number } | null;
};

/** Absolute game minutes: the clock's (day, minutes) as one number. */
export function founderAbsMinutes(day: number, minutes: number): number {
  return Math.max(0, Math.floor(day)) * 1440 + ((Math.floor(minutes) % 1440) + 1440) % 1440;
}

/** Fresh runtime state for one founder, spawned at their sleep tile. */
export function defaultFounderState(name: string, index: number, clockAbs: number): FounderState {
  const sleep = FOUNDER_SLEEP_TILES[index % FOUNDER_SLEEP_TILES.length];
  return {
    name,
    x: sleep.x,
    y: sleep.y,
    needs: { hunger: 80, energy: 90, social: 60 },
    activity: 'work',
    workState: 'toTree',
    carrying: 0,
    chopTicks: 0,
    buildTicks: 0,
    treeTarget: null,
    workTile: null,
    lastAbs: clockAbs,
    social: freshFounderSocial(FOUNDER_NAMES.filter((n) => n !== name)),
    restTile: null,
  };
}

/** Destination tile for a founder's current activity. */
export function founderDestination(f: FounderState): { x: number; y: number } {
  if (f.activity === 'sleep') {
    const i = FOUNDER_NAMES.indexOf(f.name);
    return FOUNDER_SLEEP_TILES[i >= 0 ? i : 0];
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
  if (f.carrying > 0) return FOUNDER_CAMP_CENTRE;
  if (f.workState === 'toStockpile') return FOUNDER_CAMP_CENTRE;
  if (f.workTile) return f.workTile;
  return FOUNDER_CAMP_CENTRE;
}

// --- Trees: find + chop (the player's E-key mechanism, reused) ---

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
  // First in scan order wins ties (seeded trees in world order, then
  // wild trees row-major) — the order is fixed, so the choice is
  // deterministic.
  const consider = (tx: number, ty: number) => {
    const d = Math.abs(tx - x) + Math.abs(ty - y);
    if (d > maxDist || d >= bestD) return;
    bestD = d;
    best = { tx, ty };
  };
  for (const t of world.trees ?? []) {
    if (exclude?.has(t.tx + ',' + t.ty)) continue;
    consider(t.tx, t.ty);
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
        if (wildTreeAt(tx, ty) && !(world.removedWildTrees ?? []).includes(tx + ',' + ty)) consider(tx, ty);
      }
    }
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
    if (!p.detour) {
      const detour = planPathNpc(world, pos, dest, 4000, new Set([next.x + ',' + next.y]));
      if (detour) {
        return { pos, path: { destKey, path: detour, index: 0, noPathTicks: 0, blockedTicks: 0, detour: true }, arrived: false };
      }
    }
    const aside = sidestepTile(world, pos, next, occupied);
    if (aside) {
      return { pos, path: { destKey, path: [aside], index: 0, noPathTicks: 0, blockedTicks: 0, detour: false }, arrived: false };
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
  name: string;
  x: number;
  y: number;
  carrying: number;
  hunger: number;
  energy: number;
  social: number;
  activity: FounderActivity;
  workState: FounderWorkState;
  chopTicks: number;
  /** BUILD 1058: build ticks on the current hut work step. */
  buildTicks: number;
  lastAbs: number;
  /** BUILD 1060: pairwise affinity + memories (v3; v2 saves have
   *  none and migrate to fresh social). Named socialState — the
   *  save's `social` field is already the needs social (a number). */
  socialState?: FounderSocial;
};

export type FoundersSaveState = {
  version: number;
  founders: FounderSave[];
  stockpileWood: number;
  foodStock: number;
  /** BUILD 1058: the first hut's construction (v2; v1 saves have
   *  none and migrate to a fresh one). */
  construction: ConstructionState;
};

/** Fresh v3 save: founders at their sleep tiles, empty stockpile,
 *  full starting food, no hut started, neutral toward each other. */
export function freshFoundersSave(clockAbs: number): FoundersSaveState {
  return {
    version: FOUNDER_SAVE_VERSION,
    founders: FOUNDER_NAMES.map((name, i) => ({
      name,
      x: FOUNDER_SLEEP_TILES[i].x,
      y: FOUNDER_SLEEP_TILES[i].y,
      carrying: 0,
      hunger: 80,
      energy: 90,
      social: 60,
      activity: 'work' as FounderActivity,
      workState: 'toTree' as FounderWorkState,
      chopTicks: 0,
      buildTicks: 0,
      lastAbs: clockAbs,
      socialState: freshFounderSocial(FOUNDER_NAMES.filter((n) => n !== name)),
    })),
    stockpileWood: 0,
    foodStock: FOUNDER_START_FOOD,
    construction: { state: 'none', progress: 0, spentWood: 0 },
  };
}

function clampNeed(n: number, fallback: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
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
      if (k === selfName || !FOUNDER_NAMES.includes(k)) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) affinity[k] = Math.max(0, Math.min(100, Math.round(n)));
    }
  }
  if (v.affinityDay && typeof v.affinityDay === 'object') {
    for (const [k, raw] of Object.entries(v.affinityDay as Record<string, unknown>)) {
      if (k === selfName || !FOUNDER_NAMES.includes(k)) continue;
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
      if (typeof r.other !== 'string' || r.other === selfName || !FOUNDER_NAMES.includes(r.other)) continue;
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
 * Migrate an unknown founders save to v3. Missing version field =
 * v0 (defaults filled); version 1 = validated + clamped (unknown
 * founder names dropped, missing founders restored at camp,
 * 'chopping' resets to 'toTree' — the tree target is session-only),
 * construction defaults to fresh (v1 predates the hut); version 2 =
 * validated + clamped the same way, social defaults to fresh
 * (v2 predates memory); version 3 = validated + clamped, social
 * validated by validateFounderSocial; any other version, or a
 * non-object, returns null (fresh defaults — never guess at an
 * unknown future format). Pure.
 */
export function migrateFoundersSave(value: unknown): FoundersSaveState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.version !== undefined && v.version !== 0 && v.version !== 1 && v.version !== 2 && v.version !== FOUNDER_SAVE_VERSION) return null;
  const rawFounders = Array.isArray(v.founders) ? v.founders : [];
  // BUILD 1058: construction from the save (v2), else fresh. A
  // 'done' construction with a founder still marked building/toSite
  // (saved mid-completion) resets that founder to 'toTree' below.
  const rawC = (v.construction && typeof v.construction === 'object' ? v.construction : {}) as Record<string, unknown>;
  const cState = rawC.state === 'building' || rawC.state === 'done' ? rawC.state : 'none';
  const construction: ConstructionState = {
    state: cState,
    progress: Math.max(0, Math.min(6, Math.round(Number(rawC.progress) || 0))),
    spentWood: Math.max(0, Math.round(Number(rawC.spentWood) || 0)),
  };
  if (construction.state === 'done') {
    construction.progress = 6;
    construction.spentWood = 12;
  }
  const founders: FounderSave[] = FOUNDER_NAMES.map((name, i) => {
    const s = rawFounders.find(
      (f: unknown) => f && typeof f === 'object' && (f as Record<string, unknown>).name === name,
    ) as Record<string, unknown> | undefined;
    const num = (k: string, d: number): number => {
      const n = s ? Number(s[k]) : NaN;
      return Number.isFinite(n) ? n : d;
    };
    const activity =
      s?.activity === 'sleep' || s?.activity === 'eat' || s?.activity === 'rest' || s?.activity === 'work' || s?.activity === 'build'
        ? (s.activity as FounderActivity)
        : 'work';
    let workState: FounderWorkState =
      s?.workState === 'toTree' || s?.workState === 'toStockpile' || s?.workState === 'idle' || s?.workState === 'toSite' || s?.workState === 'building'
        ? (s.workState as FounderWorkState)
        : 'toTree';
    if (construction.state === 'done' && (workState === 'toSite' || workState === 'building')) workState = 'toTree';
    return {
      name,
      x: Math.round(num('x', FOUNDER_SLEEP_TILES[i].x)),
      y: Math.round(num('y', FOUNDER_SLEEP_TILES[i].y)),
      carrying: Math.max(0, Math.round(num('carrying', 0))),
      hunger: clampNeed(num('hunger', 80), 80),
      energy: clampNeed(num('energy', 90), 90),
      social: clampNeed(num('social', 60), 60),
      activity,
      workState,
      chopTicks: Math.max(0, Math.round(num('chopTicks', 0))),
      buildTicks: Math.max(0, Math.round(num('buildTicks', 0))),
      lastAbs: Math.max(0, Math.round(num('lastAbs', 0))),
      // BUILD 1060: social from the save (v3) — v2 and older have
      // none and migrate to fresh (neutral, no memories).
      socialState: validateFounderSocial(s?.socialState, name),
    };
  });
  const stockpileWood =
    v.stockpileWood == null || !Number.isFinite(Number(v.stockpileWood))
      ? 0
      : Math.max(0, Math.round(Number(v.stockpileWood)));
  const foodStock =
    v.foodStock == null || !Number.isFinite(Number(v.foodStock))
      ? FOUNDER_START_FOOD
      : Math.max(0, Math.round(Number(v.foodStock)));
  return { version: FOUNDER_SAVE_VERSION, founders, stockpileWood, foodStock, construction };
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
export function foundersSaveOf(founders: FounderState[], stockpileWood: number, foodStock: number, construction: ConstructionState): FoundersSaveState {
  return {
    version: FOUNDER_SAVE_VERSION,
    founders: founders.map((f) => ({
      name: f.name,
      x: Math.round(f.x),
      y: Math.round(f.y),
      carrying: f.carrying,
      hunger: Math.round(f.needs.hunger),
      energy: Math.round(f.needs.energy),
      social: Math.round(f.needs.social),
      activity: f.activity,
      workState: f.workState,
      chopTicks: f.chopTicks,
      buildTicks: f.buildTicks,
      lastAbs: f.lastAbs,
      socialState: {
        affinity: { ...f.social.affinity },
        affinityDay: { ...f.social.affinityDay },
        memories: f.social.memories.map((m) => ({ ...m })),
      },
    })),
    stockpileWood,
    foodStock,
    construction: { ...construction },
  };
}

/** Save shape → runtime state (positions validated by the caller
 *  against the live world; tree targets re-found on demand). Pure. */
export function foundersStateOf(save: FoundersSaveState): FounderState[] {
  return save.founders.map((s) => ({
    name: s.name,
    x: s.x,
    y: s.y,
    needs: { hunger: s.hunger, energy: s.energy, social: s.social },
    activity: s.activity,
    workState: s.workState,
    carrying: s.carrying,
    chopTicks: s.chopTicks,
    buildTicks: s.buildTicks ?? 0,
    treeTarget: null,
    workTile: null,
    lastAbs: s.lastAbs,
    social: validateFounderSocial(s.socialState, s.name),
    restTile: null,
  }));
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
