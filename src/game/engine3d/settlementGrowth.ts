/**
 * BUILD 1066 — Settlement growth: the chain's closing loop (0x06).
 *
 * The forest-to-resident chain is: a lumberjack cuts a real tree
 * (1057 + J-1 chop jobs) → the logs are physically carried to
 * shared storage (J-1 deliver jobs + the R-1 registry) → the
 * builder consumes stored wood + labour through visible
 * construction stages (1058 + per-site build jobs) → a completed
 * hut creates housing capacity (3 beds) → a new resident arrives
 * when housing, food, and settlement conditions allow. This module
 * is the last link: the arrival CONDITIONS and the check. The
 * resident themselves is spawned by founders.ts spawnResident
 * (a full FounderState, walking in from the entry tile — the tick
 * flips them to 'toTree' when they reach camp, so they join the
 * workforce on foot, never by teleport).
 *
 * ARRIVAL CONDITIONS (all must hold):
 * - a free bed: housing capacity (3 beds per COMPLETED hut) exceeds
 *   the population. The first hut sleeps the 3 founders (capacity
 *   3 = population 3), so nobody can arrive until the second hut
 *   is done — the chain only closes when the builder finishes it.
 * - food: the camp stock holds at least 10 meals (the same
 *   threshold the parked Tamsin design used — a newcomer must not
 *   arrive into a starving camp).
 * - settlement age: day 2 or later (the camp must have survived a
 *   full day before it grows).
 * - one at a time: no founder is currently 'arriving' (walking
 *   in). The next newcomer waits until the last one reaches camp.
 * - a name is left in the pool (RESIDENT_NAMES).
 *
 * Pure module (no React, no WebGL, no localStorage) so the sim and
 * the standalone asserts can import it directly. The tick calls
 * arrivalCheck once per tick and spawns the resident it names.
 */

import { housingCapacity } from './construction';
import type { ConstructionState } from './construction';
import { freeBed, nextResidentName } from './founders';
import type { FounderBed, FounderState } from './founders';

/** Meals the camp must hold for a newcomer to arrive. */
export const SETTLEMENT_ARRIVAL_FOOD_MIN = 10;
/** The camp must have survived this many days before it grows. */
export const SETTLEMENT_ARRIVAL_DAY_MIN = 2;
/** Where a newcomer enters the world: the east edge, the same
 *  entry the parked Tamsin design surveyed (a 77-step A* path to
 *  camp — asserted in the 1066 asserts, not assumed). */
export const RESIDENT_ENTRY_TILE = { x: 199, y: 120 };

/** What the arrival check needs: the residents, the housing, the
 *  food stock, and the day. */
export type ArrivalInput = {
  founders: readonly FounderState[];
  construction: ConstructionState;
  foodStock: number;
  day: number;
};

/** True when a newcomer may arrive right now (all conditions
 *  hold). Pure. */
export function canArrive(input: ArrivalInput): boolean {
  const { founders, construction, foodStock, day } = input;
  if (foodStock < SETTLEMENT_ARRIVAL_FOOD_MIN) return false;
  if (day < SETTLEMENT_ARRIVAL_DAY_MIN) return false;
  if (founders.some((f) => f.workState === 'arriving')) return false;
  if (founders.length >= housingCapacity(construction)) return false;
  return nextResidentName(founders) !== null;
}

/**
 * The newcomer to spawn now (their name + their free bed), or null
 * when nobody may arrive. The bed is the first free bed in a
 * completed hut — the arrival never takes a bed that does not
 * exist, and never takes a bed another founder holds. Pure.
 */
export function arrivalCheck(input: ArrivalInput): { name: string; bed: FounderBed } | null {
  if (!canArrive(input)) return null;
  const name = nextResidentName(input.founders);
  if (!name) return null;
  const taken = new Set(input.founders.map((f) => f.bed.hut + ',' + f.bed.x + ',' + f.bed.y));
  const bed = freeBed(input.construction, taken);
  if (!bed) return null;
  return { name, bed };
}
