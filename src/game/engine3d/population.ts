/**
 * BUILD 1103 (0x26, Phase 4.4) — Population growth (G27), resumed
 * from the parked BUILD 1061 stash@{0} and rebased onto the 1102
 * tree (see ~/workspace/verify1103/PROGRESS.md for the rebase
 * decisions).
 *
 * A newcomer arrives when the settlement can support them and has
 * earned them — the conditions are deliberately checkable (the
 * probe proves each one blocks the arrival):
 *
 * - the hut is DONE (a finished home proves the founders can build);
 * - the shared food stock holds at least NEWCOMER_MIN_FOOD meals
 *   (a newcomer eats from the same stock — they must not arrive to
 *   an empty larder);
 * - the founders' average pairwise effective affinity is at least
 *   NEWCOMER_MIN_AFFINITY (a bonded crew, not three strangers — the
 *   build itself bonds them: +4 per shared build step, so a crew
 *   that finished the hut together normally clears this; strangers
 *   at neutral 50 do not);
 * - it is at least day NEWCOMER_MIN_DAY (they settle in overnight;
 *   no same-day arrival).
 *
 * The newcomer is Tamsin — a new name, none of the three founders,
 * none of the old 47 roster (townsfolk3d.ts ROSTER_3D; Wren and Sable
 * are both taken there), none of the pool (RESIDENT_NAMES). She walks
 * in from the east map edge (newcomerEntryTile: the walkable tile on
 * x = world.w - 1 nearest y = 120, the camp row — surveyed (199,120),
 * 79 A* steps to camp) over the real 900ms founder tick — a real
 * walk, not a pop-in (the NPC rule). On arrival she is a REAL
 * founder: same needs, same utility scorer, fresh neutral social
 * (affinity 50 with all three founders, no memories), eats from the
 * food stock, and sleeps at NEWCOMER_SLEEP_TILE (124,119) — the
 * founders' old camp sleep tile, free since they moved into the hut.
 *
 * REBASE NOTES (1103, vs the 1061 stash):
 * - No freshNewcomerState: founders.ts spawnResident already builds
 *   exactly that FounderState (workState 'arriving', fresh needs +
 *   social, caller-assigned bed) — extend, never duplicate. The
 *   spawn call passes the camp bed { hut: -1, x: 124, y: 119 }.
 * - No MAX_FOUNDERS: in the 1061 world the roster capped at 4, so
 *   rosterSize >= 4 was a correct proxy for "has a newcomer". In
 *   the 1103 world the pool (settlementGrowth.ts) grows the roster
 *   to 9, so the eligibility check is name-based (hasNewcomer) —
 *   the intent is unchanged, the proxy is corrected.
 * - The arrival check + the welcome (addSocialKey on arrival) live
 *   in the founder tick (worldSimulation3d.ts, mirrored in
 *   settlementSim.ts); the save is ag-3d-founders-v1 version 13.
 *
 * All pure here; the view owns the timers, rendering, and I/O.
 */
import { FOUNDER_CAMP, FOUNDER_NAMES, NEWCOMER_NAME, type FounderState } from './founders';
import { effectiveAffinity } from './memory';
import { npcWalkable } from './townsfolk3d';
import type { IsoWorld } from '../iso/isoWorld';

/** The settlement must be at least this old before anyone new arrives. */
export const NEWCOMER_MIN_DAY = 2;
/** Meals the shared stock must hold before a newcomer arrives. */
export const NEWCOMER_MIN_FOOD = 10;
/** Average pairwise effective affinity the founders must have reached. */
export const NEWCOMER_MIN_AFFINITY = 55;

/** The world the arrival is checked against (day, food, hut, bonds). */
export interface NewcomerWorld {
  /** Current game day (1-based). */
  day: number;
  /** Meals in the shared camp stock. */
  foodStock: number;
  /** True once the first hut is finished. */
  hutDone: boolean;
  /** Average pairwise effective affinity of the current founders. */
  avgAffinity: number;
  /** True once Tamsin already lives at the camp (one newcomer only). */
  hasNewcomer: boolean;
}

export interface NewcomerEligibility {
  eligible: boolean;
  /** One plain-language reason per unmet condition (empty when eligible). */
  reasons: string[];
}

/**
 * Is a newcomer due? Every condition is named in `reasons` when it
 * fails, so the probe (and the player, via the E report) can see
 * exactly what is missing.
 */
export function newcomerEligibility(w: NewcomerWorld): NewcomerEligibility {
  const reasons: string[] = [];
  if (w.hasNewcomer) reasons.push('the settlement already has a newcomer');
  if (!w.hutDone) reasons.push('the hut is not finished yet');
  if (w.foodStock < NEWCOMER_MIN_FOOD) reasons.push(`food stock is ${w.foodStock} (needs ${NEWCOMER_MIN_FOOD})`);
  if (w.avgAffinity < NEWCOMER_MIN_AFFINITY) reasons.push(`founders average ${Math.round(w.avgAffinity)} affinity (needs ${NEWCOMER_MIN_AFFINITY})`);
  if (w.day < NEWCOMER_MIN_DAY) reasons.push(`it is day ${w.day} (newcomers arrive from day ${NEWCOMER_MIN_DAY})`);
  return { eligible: reasons.length === 0, reasons };
}

/**
 * Mean pairwise effective affinity across the roster (each unordered
 * pair once). With three founders that is 3 pairs; with four, 6.
 * A lone founder has no pairs — 50 (neutral) by definition.
 */
export function averageSettlerAffinity(founders: Pick<FounderState, 'name' | 'social'>[], day: number): number {
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < founders.length; i++) {
    for (let j = i + 1; j < founders.length; j++) {
      sum += effectiveAffinity(founders[i].social, founders[j].name, day);
      pairs++;
    }
  }
  return pairs === 0 ? 50 : sum / pairs;
}

/**
 * The walk-in tile: the walkable tile on the east map edge
 * (x = world.w - 1) nearest the camp row (y = FOUNDER_CAMP.y).
 * Scans outward from the camp row (120, 119, 121, 118, 122, …) so
 * the arrival always starts on the camp's own latitude when the
 * edge there is walkable, and the nearest walkable edge tile
 * otherwise. Returns null only if the whole east edge is blocked.
 */
export function newcomerEntryTile(world: IsoWorld): { x: number; y: number } | null {
  const x = world.w - 1;
  const cy = FOUNDER_CAMP.y;
  for (let d = 0; d <= Math.max(cy, world.h - 1 - cy); d++) {
    for (const y of d === 0 ? [cy] : [cy - d, cy + d]) {
      if (y < 0 || y >= world.h) continue;
      if (npcWalkable(world, x, y)) return { x, y };
    }
  }
  return null;
}
