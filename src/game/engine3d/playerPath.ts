// BUILD 1030: tap-to-walk pathfinding for the player (pure, no React).
//
// AUDIT (traced before any fix):
// - The player had NO pathfinder. A tap set a raw point (moveTarget)
//   and the frame loop pushed straight at it with only local sliding
//   (playerStep.ts: direct step, component slides gated at
//   MIN_SLIDE_FRACTION 0.1, sticky perpendicular slide one step
//   sideways). That slides around a single-tile crate and, in the best
//   case, edges around a hut's side — but it has no lookahead and no
//   route memory. It cannot get around concave pockets (hut + tree +
//   rock forming a U), long wall runs, or a second obstacle on the
//   slide side; when all local moves fail the journey ends with
//   'Path blocked' and the user must re-tap. A moving NPC in the way
//   is worse: walkableAt blocks on figure proximity (0.42), the NPC
//   keeps pace, and the player pins behind it (the 1004 probe note:
//   stamina drained while stuck behind an eastbound traveler).
// - NPCs already HAVE tile A* (planPathNpc in townsfolk3d.ts) around
//   static obstacles — but it plans through tiles occupied by other
//   figures (only the per-tick occupied-next-tile wait + the 998
//   persistent-block replan handle them), checks only the NEXT tile
//   for unwalkability, and deadlocks head-on in a 1-wide stretch with
//   no alternate route (the detour fails → sealed wait + 11-tick
//   retry, both sides re-approaching). The 2.5D gaveUp latch
//   (npcNavigation.ts trackStep, MAX_REPLANS=1) does NOT apply here —
//   the 3D game never imports that module; 3D NPCs use planPathNpc.
// - This module extends the existing 3D A* (planPathNpc) for the
//   player instead of duplicating it: the player's walkability (door
//   tiles allowed, wild terrain out-of-map) is passed in as the
//   walkable override, occupied figure tiles as extraBlocked, and the
//   tile steps are smoothed into direct waypoints. The view's follower
//   (Engine3DWorldView) drives the waypoints through the existing
//   resolvePlayerStep, so sliding, sprint, and stamina are untouched.

import { walkableWithPlacements } from './placements';
import { isWildWalkable } from './wildTerrain';
import { planPathNpc } from './townsfolk3d';
import type { IsoWorld } from '../iso/isoWorld';

/** Replans at most once per 500ms (A* is tap-time work, not per-frame). */
export const PLAYER_REPLAN_MS = 500;
/** No real progress toward the waypoint for this long = stuck → replan. */
export const PLAYER_STUCK_MS = 1500;
/** A figure blocking the next waypoint: wait this long for it to move, then replan. */
export const PLAYER_WAIT_MS = 900;
/** Waypoint arrival radius (tiles). */
export const PLAYER_WAYPOINT_ARRIVE = 0.15;
/** Max A* nodes for a player plan (town routes are tens of tiles; the cap is a safety bound). */
export const PLAYER_PATH_MAX_NODES = 12000;

export type PlayerPathPoint = { x: number; y: number };

export interface PlayerPath {
  waypoints: PlayerPathPoint[];
  index: number;
  destination: PlayerPathPoint;
}

/**
 * The player's tile walkability: in-map placements rule (houses,
 * trees, rocks, water, walls, crates, placed items; door tiles
 * allowed so the player can walk up to a door to Enter), out-of-map
 * wild rule (ocean/lakes/wild trees/wild rocks block). This is the
 * static half of walkableAt — figures are handled separately via
 * extraBlocked (plan time) and the follower's wait/replan (live).
 */
export function playerWalkable(world: IsoWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return isWildWalkable(world, x, y);
  return walkableWithPlacements(world, world.crates, x, y);
}

/** True when the straight segment a→b stays on walkable tiles (sampled every 0.25). Pure. */
function segmentClear(world: IsoWorld, a: PlayerPathPoint, b: PlayerPathPoint): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / 0.25));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!playerWalkable(world, Math.round(x), Math.round(y))) return false;
  }
  return true;
}

/**
 * Smooth tile steps into direct waypoints (greedy forward, same shape
 * as the 2.5D smoothPath): from each anchor, keep the farthest point
 * with a clear line-of-sight. A Manhattan A* path becomes natural
 * diagonal walking instead of right-angle zigzag. Pure.
 */
export function smoothPlayerPath(world: IsoWorld, points: PlayerPathPoint[]): PlayerPathPoint[] {
  if (points.length <= 2) return points;
  const out: PlayerPathPoint[] = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    if (!segmentClear(world, points[anchor], points[i])) {
      out.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Plan a tap-to-walk route from `from` to `to`. Returns null when no
 * route exists (caller reports 'Path blocked'). The waypoints start at
 * the player's current position and end at the exact tapped point
 * (not the tile centre), so arrival lands where tapped. The goal tile
 * is exempt from extraBlocked (planPathNpc rule) — a destination
 * occupied by a standing figure is still reachable. Pure.
 */
export function planPlayerPath(
  world: IsoWorld,
  from: { x: number; y: number },
  to: { x: number; y: number },
  extraBlocked?: ReadonlySet<string>,
  maxNodes: number = PLAYER_PATH_MAX_NODES,
): PlayerPath | null {
  const fx = Math.round(from.x);
  const fy = Math.round(from.y);
  const tx = Math.round(to.x);
  const ty = Math.round(to.y);
  if (fx === tx && fy === ty) {
    return { waypoints: [{ x: to.x, y: to.y }], index: 0, destination: { x: to.x, y: to.y } };
  }
  const steps = planPathNpc(world, { x: fx, y: fy }, { x: tx, y: ty }, maxNodes, extraBlocked, undefined, playerWalkable);
  if (!steps) return null;
  const raw: PlayerPathPoint[] = [{ x: from.x, y: from.y }, ...steps.map((s) => ({ x: s.x, y: s.y }))];
  raw[raw.length - 1] = { x: to.x, y: to.y };
  return { waypoints: smoothPlayerPath(world, raw), index: 0, destination: { x: to.x, y: to.y } };
}
