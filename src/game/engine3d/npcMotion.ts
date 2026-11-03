/**
 * BUILD 998 — smooth 3D NPC motion, collision-avoidance decisions, and
 * figure-slot bookkeeping (pure module, no React).
 *
 * AUDIT RESULTS (2026-11-02, traced before any fix — the 998 brief
 * requires root causes, not symptoms):
 *
 * 1. SKIPPY MOTION: the 993 npcTimer moved each NPC's logical position
 *    by exactly 1 tile instantly every 900ms, and the render loop drew
 *    the figure at that logical tile directly. The figure therefore
 *    stood still for 900ms and then jumped a full tile in one frame.
 *    Worse, the walk animation was decoupled from the motion: an NPC
 *    counted as "traveling" while it had moved within the last 1000ms
 *    (ticks are 900ms apart, so almost always), and its phase advanced
 *    at the NOMINAL 1.11 u/s instead of the distance actually traveled
 *    — legs swung while the figure stood still, then the body
 *    teleported. The player never had this problem: its render loop
 *    moves continuously toward a target at 3.15 u/s with per-frame
 *    steps, and its phase is distance-based. 998 extends the player's
 *    rule to NPCs: the 900ms tick keeps updating PATHS and schedule
 *    destinations (the authority, saved), while the render loop glides
 *    the figure toward the logical tile at the demo speed (1.11 u/s).
 *    A logical step takes exactly one tick to render, so the figure
 *    arrives exactly as the next tick fires — continuous motion, exact
 *    arrival, no snap. The glide MUST use real frame time (capped at
 *    0.25s), not the render loop's 0.05s physics clamp: at low frame
 *    rates the clamped dt glides slower than the real-time tick clock
 *    (0.89 tiles/s at 16fps vs the clock's 1.11), so render would fall
 *    behind until the snap rule fired — a self-inflicted tile jump
 *    caught by the browser probe and fixed in this build.
 *
 * 2. HEAD-ON DEADLOCK + PERMANENT WAITS: the occupied-next-tile rule
 *    waited one tick "without replanning" and kept no memory of the
 *    block. Two NPCs meeting head-on in a 1-wide stretch each waited
 *    for the other's tile forever (until a schedule phase retargeted
 *    one of them, 30–120 real seconds later), and an NPC behind a
 *    standing player or a gathered NPC waited indefinitely instead of
 *    going around. The fix is a persistent-block rule: after 3 blocked
 *    ticks (2.7s) the NPC replans with the blocking tile excluded from
 *    A*; if that plan fails, it falls into the existing sealed wait +
 *    11-tick retry. No teleport, no stacking, no permanent wait.
 *
 * 3. LAG: every frame rebuilt every figure's ~300 vertices in JS
 *    (geometry math + shade lookups), allocated a fresh Float32Array
 *    for the whole actor buffer, and uploaded it wholesale with
 *    bufferData — even for figures standing perfectly still. The fix
 *    is per-figure GPU slots: slot sizes are constant per figure
 *    (specs are seeded per name and never change), so each figure owns
 *    a fixed vertex range; only slots whose (position, yaw, phase)
 *    changed re-emit and re-upload (bufferSubData), and each slot is
 *    drawn individually. Idle figures cost zero emission and zero
 *    upload per frame. The roster and the figures are NOT cut.
 *
 * 4. PLAYER: verified already smooth — the render loop moves the
 *    player continuously (tap target or held keys, 3.15 u/s, wall
 *    sliding) and its phase is distance-based. tryMove is dead code
 *    (no callers). No player snap exists to fix; 998 keeps the player
 *    path untouched except the shared idle-phase snap below.
 *
 * 5. ARMS (for 999, NOT fixed here): the arm attachment math in
 *    villagers.ts is structurally correct — arms pivot at their own
 *    shoulder tops, swing in the (up, forward) plane opposite their
 *    side's leg, and sit 0.01 units clear of the torso edge. There is
 *    no single obvious pose-code error. The "spaced out and weird"
 *    reading most plausibly comes from (a) the tile-jump system this
 *    build removes (yaw snapped up to 180° instantly at path turns
 *    while legs froze mid-stride between jumps) and (b) arm
 *    proportions (arms hang 0.06 below hip level; total span 0.74x
 *    width vs 0.46x torso), which is a design call for 999. 998's
 *    interpolation + distance-based phase + yaw smoothing should
 *    already make the arms read much less weird; 999 owns any
 *    remaining geometry work.
 *
 * 6. COLLISION CHECKS THAT ALREADY WORKED (verified, kept): hut
 *    footprints excluded from npcWalkable (doors included); newly
 *    placed blockers trigger a replan when they become the next step
 *    (the live path already checked npcWalkable per step); the player
 *    tile counts as occupied; sealed destinations wait + retry every
 *    11 ticks; sequential tick processing prevents two NPCs stepping
 *    onto the same tile in one tick; 2.5D gather spots already spread
 *    per NPC (BUILD 323), so plaza crowds do not share a tile.
 */

import { NPC_SPEED, PHASE_PER_UNIT } from './villagers';

/** The 993 demo speed: 1 tile per 900ms tick, in units per second. */
export const NPC_RENDER_SPEED = NPC_SPEED;
/** Ticks of waiting behind the same tile before replanning around it. */
export const BLOCKED_TICKS_TO_REPLAN = 3;
/** Yaw turn rate for figures (radians/second): a 90° turn takes ~0.13s. */
export const FIGURE_TURN_RATE = 12;
/** Render/logical divergence above this (tiles) is a real teleport
 * (load restore, migration rescue, probe setNpcPos) and snaps; normal
 * operation never diverges more than ~1 tile (one pending tick step). */
export const RENDER_SNAP_TILES = 1.5;

export type TilePos = { x: number; y: number };

/**
 * Glide a render position toward a logical tile position by at most
 * speed*dtSec (per axis, so axis-aligned steps stay axis-aligned).
 * Returns the new position and the distance actually traveled (the
 * walk-phase input — distance-based, like the player). Arrival lands
 * EXACTLY on the target: when the remaining distance fits in one
 * frame's travel, the step covers it whole, so no frame ever jumps
 * farther than one frame's travel distance.
 */
export function advanceRenderPos(
  cur: TilePos,
  target: TilePos,
  dtSec: number,
  speed: number = NPC_RENDER_SPEED,
): { pos: TilePos; dist: number } {
  const maxStep = Math.max(0, speed * dtSec);
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep || dist === 0) return { pos: { x: target.x, y: target.y }, dist };
  const s = maxStep / dist;
  return { pos: { x: cur.x + dx * s, y: cur.y + dy * s }, dist: maxStep };
}

/** True when render/logical divergence is a legitimate teleport, not a step. */
export function needsRenderSnap(cur: TilePos, target: TilePos): boolean {
  return Math.hypot(target.x - cur.x, target.y - cur.y) > RENDER_SNAP_TILES;
}

/** Shortest-arc turn toward a target yaw, capped at maxStep radians. */
export function turnYawToward(cur: number, target: number, maxStep: number): number {
  const TAU = 2 * Math.PI;
  let diff = (target - cur) % TAU;
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  if (Math.abs(diff) <= maxStep) return target;
  return cur + Math.sign(diff) * maxStep;
}

/**
 * Ease a walk phase toward its nearest neutral (a multiple of 2π).
 * Unlike the old asymptotic ease (which changed the phase by tiny
 * amounts forever, defeating every cache), this SNAPS exactly to
 * neutral once within 0.01 rad — an idle figure's pose then stops
 * changing entirely, which is what makes its GPU slot reusable.
 */
export function easePhaseToNeutral(phase: number, dtMs: number): number {
  const TAU = 2 * Math.PI;
  const target = Math.round(phase / TAU) * TAU;
  const diff = target - phase;
  if (Math.abs(diff) < 0.01) return target;
  return phase + diff * Math.min(1, (dtMs / 1000) * 6);
}

/** Walk-phase advance for a distance actually traveled (player rule). */
export function phaseForDistance(phase: number, dist: number): number {
  return phase + dist * PHASE_PER_UNIT;
}

/**
 * Persistent-block decision for the npcTimer's occupied-next-tile
 * branch. Below the threshold the NPC simply waits (the common case:
 * a leader one tick ahead, or a player stepping aside). At the
 * threshold it replans with the blocking tile excluded; the caller
 * falls back to the sealed wait + retry when that plan fails.
 */
export function blockedAction(blockedTicks: number): 'wait' | 'replan' {
  return blockedTicks >= BLOCKED_TICKS_TO_REPLAN ? 'replan' : 'wait';
}

/**
 * A figure's rendered pose for slot-dirty comparison. Two poses are
 * equal only when position, yaw, AND phase all match exactly — idle
 * figures satisfy this every frame (snapped phase, constant yaw and
 * position), movers never do (phase advances with distance). Exact
 * compare is safe because idle values are exact, not asymptotic.
 */
export type FigurePoseKey = { x: number; z: number; yaw: number; phase: number };

export function poseKeyEquals(a: FigurePoseKey | null, b: FigurePoseKey): boolean {
  return a !== null && a.x === b.x && a.z === b.z && a.yaw === b.yaw && a.phase === b.phase;
}

/**
 * Fixed per-figure GPU slot layout. Counts are constant per figure
 * because villager specs are seeded per name and never change; the
 * layout is computed once at mount from one emission per spec.
 */
export function figureSlotLayout(counts: number[]): { offsets: number[]; totalVerts: number } {
  const offsets: number[] = [];
  let total = 0;
  for (const c of counts) {
    offsets.push(total);
    total += c;
  }
  return { offsets, totalVerts: total };
}
