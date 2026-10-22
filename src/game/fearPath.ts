// BUILD 973: fear-path movement (combat extras 5/6).
//
// Portable kernel only, from the EQEmu analysis (§(c)15): a feared
// creature moves along a COMPUTED flee path rather than wandering.
// No EQ names or content; the planner below is original TypeScript
// written against this game's own movement shape.
//
// Audit result: until now BOTH fleeing populations moved without a
// path. Creatures (ai.ts updateGoat) ran straight radially away from
// the threat with only wall-sliding, so a building between the creature
// and its away-direction stranded it sliding along the wall. Townsfolk
// (townsfolk.ts advanceOne) ran radially with NO collision check at
// all — a fleeing NPC could ghost straight through a house. Neither
// behavior teleports, but neither routes either.
//
// This module supplies the shared pieces; it is NOT a second movement
// system. Movement itself still goes through the existing movers:
// creatures walk waypoints through updateGoat's resolveCollisionMove,
// and NPCs walk waypoints through npcNavigation's stepAlongPath on the
// existing A* (pathTo). What is new is only the destination + route
// choice: flee AWAY from the threat, around obstacles, visibly walking.
//
// - fleeDestination: the point `distance` units from `from`, directly
//   away from `threat` (a fixed fallback direction when the two
//   coincide), clamped to field bounds.
// - planFleeWaypoints (creatures): the field has no A* grid — creature
//   movement probes a caller-supplied isBlocked callback — so the route
//   is planned by sampling: straight line first; if any sample is
//   blocked, try perpendicular detours around the blocked segment at
//   increasing offsets and take the first route whose legs both sample
//   clear. Returns null when no detour clears, and the caller falls
//   back to the old radial slide — a failed plan never strands the
//   creature worse than before.
// - NPCs do not use planFleeWaypoints: they already have A*, so
//   townsfolk advanceOne plans with pathTo directly and only borrows
//   fleeDestination from here, keeping one destination rule.

export type FearPoint = { x: number; y: number };

/** How far a flee destination sits from the fleer (field units). */
export const FLEE_PATH_DISTANCE = 20;
/** NPC flee destination distance (matches the old radial run's reach). */
export const NPC_FLEE_PATH_DISTANCE = 24;
/** Field bounds for flee destinations (inside the 0..280 field). */
export const FLEE_FIELD_MIN = 4;
export const FLEE_FIELD_MAX = 276;
/** Sampling step when probing a planned route for blocked cells. */
export const FLEE_SAMPLE_STEP = 2;
/** Perpendicular detour offsets tried, in order, around a blockage. */
export const FLEE_DETOUR_OFFSETS = [6, 12, 18, 24];

function clampField(v: number): number {
  return Math.min(FLEE_FIELD_MAX, Math.max(FLEE_FIELD_MIN, v));
}

/**
 * Point `distance` units from `from`, directly away from `threat`.
 * Coincident positions fall back to due east so the result is always
 * a real destination, never a zero vector.
 */
export function fleeDestination(from: FearPoint, threat: FearPoint, distance: number): FearPoint {
  const dx = from.x - threat.x;
  const dy = from.y - threat.y;
  const len = Math.hypot(dx, dy);
  const nx = len > 0 ? dx / len : 1;
  const ny = len > 0 ? dy / len : 0;
  return { x: clampField(from.x + nx * distance), y: clampField(from.y + ny * distance) };
}

/** True when every sample along a-b (plus the endpoints) is unblocked. */
export function routeClear(
  a: FearPoint,
  b: FearPoint,
  isBlocked: (pos: FearPoint) => boolean,
): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / FLEE_SAMPLE_STEP));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (isBlocked(p)) return false;
  }
  return true;
}

/**
 * Plan a creature flee route: [destination] when the straight line is
 * clear, otherwise [detour, destination] for the first perpendicular
 * detour whose two legs both sample clear. Detour points are tried at
 * three stations along the route (mid, quarter, three-quarter) at
 * increasing offsets, so a tall blockage straddling the line still
 * routes around its end instead of sliding along it. When the
 * destination itself is blocked (a building sits on the away-line),
 * the destination shifts sideways to the nearest clear point before
 * routing — a blocked destination is a routing problem, not a reason
 * to give up. Null = nothing cleared (caller falls back to the old
 * radial slide). The destination is clamped to the home range when
 * one is supplied, so flight can never strand a quest past the roam
 * edge (the same clamp the old radial flee used).
 */
export function planFleeWaypoints(
  from: FearPoint,
  threat: FearPoint,
  isBlocked: (pos: FearPoint) => boolean,
  home?: { spawn: FearPoint; radius: number },
): FearPoint[] | null {
  let dest = fleeDestination(from, threat, FLEE_PATH_DISTANCE);
  if (home && home.radius > 0) {
    const dx = dest.x - home.spawn.x;
    const dy = dest.y - home.spawn.y;
    const d = Math.hypot(dx, dy);
    if (d > home.radius) {
      dest = {
        x: clampField(home.spawn.x + (dx / d) * home.radius),
        y: clampField(home.spawn.y + (dy / d) * home.radius),
      };
    }
  }
  const ax0 = dest.x - from.x;
  const ay0 = dest.y - from.y;
  const len0 = Math.hypot(ax0, ay0) || 1;
  const px0 = -ay0 / len0;
  const py0 = ax0 / len0;
  if (isBlocked(dest)) {
    let shifted: FearPoint | null = null;
    for (const off of FLEE_DETOUR_OFFSETS) {
      for (const sign of [1, -1]) {
        const cand = {
          x: clampField(dest.x + px0 * off * sign),
          y: clampField(dest.y + py0 * off * sign),
        };
        if (!isBlocked(cand)) {
          shifted = cand;
          break;
        }
      }
      if (shifted) break;
    }
    if (!shifted) return null;
    dest = shifted;
  }
  if (routeClear(from, dest, isBlocked)) return [dest];
  const ax = dest.x - from.x;
  const ay = dest.y - from.y;
  const len = Math.hypot(ax, ay) || 1;
  const px = -ay / len;
  const py = ax / len;
  for (const station of [0.5, 0.25, 0.75]) {
    const base = { x: from.x + ax * station, y: from.y + ay * station };
    for (const off of FLEE_DETOUR_OFFSETS) {
      for (const sign of [1, -1]) {
        const via = {
          x: clampField(base.x + px * off * sign),
          y: clampField(base.y + py * off * sign),
        };
        if (routeClear(from, via, isBlocked) && routeClear(via, dest, isBlocked)) {
          return [via, dest];
        }
      }
    }
  }
  return null;
}
