import type { CombatPoint } from './combat';
import {
  isTownCenterPosition,
  isTownEdgePosition,
  strayKindForRoll,
  TOWN_CENTER_SAFE_RADIUS,
  TOWN_STRAY_ROAM_RADIUS,
} from './townStrays';

/**
 * BUILD 937: raid scheduler (Tibia item 4) — scheduled world events
 * with staged waves and warnings, ported as RULES ONLY from the
 * Forgotten Server raid shape (`data/scripts/globalevents/raids/`):
 *
 * - A scheduler ticks every 60 s (Tibia's CHECK_RAIDS_INTERVAL). For
 *   each check the firing chance is CHECK_INTERVAL / raid.interval,
 *   so the expected rate is one firing per raid.interval,
 *   independent of tick length.
 * - A `margin` enforces quiet time after the last raid ends (and
 *   after game start: the first town visit starts the margin).
 * - Only one raid runs at a time (the `running` guard), and a raid
 *   and a 917 stray never run concurrently (see raidShouldFire and
 *   the stray-gate guard in App.tsx).
 * - A raid is a script of timed steps: broadcast a warning, spawn a
 *   wave in a radius around an edge point, spawn a named leader,
 *   broadcast escalation if the wave is not cleared in time, spawn a
 *   larger wave. Steps advance on the field-loop clock (elapsed time
 *   accumulated by the rAF loop), never on real-time sleeps — so a
 *   raid cannot progress while the tab is hidden.
 *
 * PLACEMENT CONSTRAINT (user-approved, non-negotiable): raid waves
 * obey the 917 settlement rules — spawn points sit in the edge band
 * (114+ units from the plaza) and the roam anchor (spawnPosition +
 * roamRadius 30, clamped by the same updateGoat home-range rule as
 * strays) means even a full chase can never come within
 * TOWN_CENTER_SAFE_RADIUS (78) of the plaza. The town-invasion
 * variant of the Tibia raid concept is NOT built: raids are a
 * town-EDGE event only, pending the user's approval.
 *
 * Raid creatures are ordinary 915/934/935 creatures: they acquire,
 * pursue, flee, and mitigate exactly like any other creature, and
 * drop ordinary loot and pay ordinary XP. There are no raid-only
 * combat rules, no raid currency, no raid score. Raid state is
 * transient session state (monsters are never serialized), so a raid
 * can never duplicate or get stuck in a save. A raid never softlocks
 * the game if ignored: escalation fires at most once, and after
 * RAID_MAX_DURATION_MS the raid disperses (remaining live raid
 * creatures are removed) and the quiet margin starts.
 */

/** How often the scheduler rolls while the player is in the town field. */
export const RAID_CHECK_INTERVAL_MS = 60000;
/** Expected rate: one raid firing per this long of town field time. */
export const RAID_INTERVAL_MS = 1800000;
/** Quiet time after a raid ends (and after game start) with no firing. */
export const RAID_MARGIN_MS = 600000;
/** Warning stage length: warning broadcast -> wave spawn. */
export const RAID_WARNING_MS = 15000;
/** Wave stage length: if the wave is not cleared in this window, the
 * raid escalates. */
export const RAID_ESCALATION_WINDOW_MS = 120000;
/** Escalation stage length: escalation broadcast -> larger wave. */
export const RAID_ESCALATION_DELAY_MS = 5000;
/** Hard cap: the raid disperses this long after firing, cleared or not. */
export const RAID_MAX_DURATION_MS = 600000;
/** First wave size (Tibia's example script spawns 3). */
export const RAID_WAVE_1_SIZE = 3;
/** Escalation wave size (Tibia's example spawns 4-10; fixed at 5). */
export const RAID_WAVE_2_SIZE = 5;
/** Named leader toughness (929-unique pattern: same type, named,
 * modestly tougher). Level and attacks are unchanged. */
export const RAID_LEADER_HP_MULT = 1.5;
/** Roam anchor radius for raid creatures — same as 917 strays, so the
 * edge containment argument is identical. */
export const RAID_ROAM_RADIUS = TOWN_STRAY_ROAM_RADIUS;
/** Melee standoff distance (matches GOAT_MELEE_RANGE in ai.ts): the
 * chase step can push a creature this far past its home-range clamp
 * when it keeps its distance from the player, so the chase-floor
 * check below subtracts it. Raid waves use only melee kinds from
 * the stray table, so no larger archer preferred range can arise. */
export const RAID_CHASE_STANDOFF = 4;
/** Wave spawn offsets around the anchor point (field units). */
export const RAID_WAVE_1_OFFSETS: ReadonlyArray<CombatPoint> = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 },
];
export const RAID_WAVE_2_OFFSETS: ReadonlyArray<CombatPoint> = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }, { x: 0, y: -10 },
];

export type RaidStage = 'idle' | 'warning' | 'wave' | 'escalating' | 'wave2';

export interface RaidState {
  stage: RaidStage;
  /** Field-loop timestamp (ms) when the raid fired. */
  firedAt: number;
  /** Field-loop timestamp (ms) when the current stage began. */
  stageAt: number;
}

export const IDLE_RAID_STATE: RaidState = { stage: 'idle', firedAt: 0, stageAt: 0 };

export type RaidAction =
  | 'broadcastWarning'
  | 'spawnWave1'
  | 'spawnLeader'
  | 'broadcastEscalation'
  | 'spawnWave2'
  | 'endCleared'
  | 'endDispersed';

/**
 * Tibia's firing chance: chance = (MAX_RAND_RANGE * CHECK_INTERVAL) /
 * raid.interval against random(0, MAX_RAND_RANGE) — i.e. the firing
 * probability per check is CHECK_INTERVAL / interval. Clamped to
 * [0, 1] so a check interval longer than the raid interval can never
 * exceed certainty.
 */
export function raidFireChance(checkIntervalMs: number, intervalMs: number): number {
  if (intervalMs <= 0) return 1;
  if (checkIntervalMs <= 0) return 0;
  return Math.min(1, checkIntervalMs / intervalMs);
}

/**
 * The one-at-a-time guard, mirroring strayGateDecision: a raid may
 * fire only when no raid is running, no 917 stray is alive (a live
 * stray blocks the raid; the raid in turn suppresses stray spawns in
 * App.tsx — the raid wins once it has fired, the stray wins while it
 * is still alive), the quiet margin has elapsed, and the interval
 * roll succeeds.
 */
export function raidShouldFire(args: {
  stage: RaidStage;
  aliveStrays: number;
  marginReady: boolean;
  roll: number;
  chance: number;
}): boolean {
  if (args.stage !== 'idle') return false;
  if (args.aliveStrays > 0) return false;
  if (!args.marginReady) return false;
  return args.roll < args.chance;
}

/**
 * Pure stage machine. The caller fires the raid (raidShouldFire) by
 * setting stage 'warning' with firedAt/stageAt = now and emitting
 * 'broadcastWarning'; raidAdvance then runs every field-loop frame.
 * Cleared always beats escalation/dispersal on the same frame, and
 * dispersal always beats escalation: escalation fires at most once.
 */
export function raidAdvance(
  state: RaidState,
  nowMs: number,
  aliveRaid: number,
): { next: RaidState; actions: RaidAction[] } {
  switch (state.stage) {
    case 'idle':
      return { next: state, actions: [] };
    case 'warning':
      if (nowMs - state.stageAt >= RAID_WARNING_MS) {
        return { next: { stage: 'wave', firedAt: state.firedAt, stageAt: nowMs }, actions: ['spawnWave1', 'spawnLeader'] };
      }
      return { next: state, actions: [] };
    case 'wave': {
      if (aliveRaid === 0) {
        return { next: IDLE_RAID_STATE, actions: ['endCleared'] };
      }
      if (nowMs - state.firedAt >= RAID_MAX_DURATION_MS) {
        return { next: IDLE_RAID_STATE, actions: ['endDispersed'] };
      }
      if (nowMs - state.stageAt >= RAID_ESCALATION_WINDOW_MS) {
        return { next: { stage: 'escalating', firedAt: state.firedAt, stageAt: nowMs }, actions: ['broadcastEscalation'] };
      }
      return { next: state, actions: [] };
    }
    case 'escalating': {
      if (aliveRaid === 0) {
        return { next: IDLE_RAID_STATE, actions: ['endCleared'] };
      }
      if (nowMs - state.firedAt >= RAID_MAX_DURATION_MS) {
        return { next: IDLE_RAID_STATE, actions: ['endDispersed'] };
      }
      if (nowMs - state.stageAt >= RAID_ESCALATION_DELAY_MS) {
        return { next: { stage: 'wave2', firedAt: state.firedAt, stageAt: nowMs }, actions: ['spawnWave2'] };
      }
      return { next: state, actions: [] };
    }
    case 'wave2': {
      if (aliveRaid === 0) {
        return { next: IDLE_RAID_STATE, actions: ['endCleared'] };
      }
      if (nowMs - state.firedAt >= RAID_MAX_DURATION_MS) {
        return { next: IDLE_RAID_STATE, actions: ['endDispersed'] };
      }
      return { next: state, actions: [] };
    }
  }
}

/** Display name for a named raid leader of a kind: "Raid Wolf". */
export function raidLeaderName(kind: string): string {
  if (kind.length === 0) return 'Raid Creature';
  return `Raid ${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

/** Wave kinds come from the 917 stray table (wolf/slime/rat). */
export function raidWaveKinds(size: number, roll: () => number): string[] {
  const kinds: string[] = [];
  for (let i = 0; i < size; i++) kinds.push(strayKindForRoll(roll()));
  return kinds;
}

/**
 * A wave position is legal only if a full chase from it can never
 * reach the plaza heart: the chase step clamps movement to
 * roamRadius around the spawn position (updateGoat's home-range
 * clamp, same as 917 strays) and can push at most RAID_CHASE_STANDOFF
 * past that clamp when keeping its distance — so the position's
 * distance from the plaza center minus roamRadius minus standoff
 * must stay above TOWN_CENTER_SAFE_RADIUS. Edge-midpoint anchors sit
 * exactly 114 units out (114 - 30 - 4 = 80 > 78); an inward offset
 * that would break the floor falls back to the anchor itself.
 * An invalid offset with an invalid/blocked anchor skips that
 * creature — a wave may spawn fewer than its size, never an illegal
 * position. The anchor is re-validated here so no caller can place a
 * raid creature in the town heart.
 */
export function raidWavePositions(
  anchor: CombatPoint,
  size: number,
  isFree: (pos: CombatPoint) => boolean,
  fieldSize = 280,
): CombatPoint[] {
  const center = fieldSize / 2;
  const chaseFloorOk = (pos: CombatPoint) =>
    Math.hypot(pos.x - center, pos.y - center) - RAID_ROAM_RADIUS - RAID_CHASE_STANDOFF > TOWN_CENTER_SAFE_RADIUS;
  const offsets = size <= RAID_WAVE_1_SIZE ? RAID_WAVE_1_OFFSETS : RAID_WAVE_2_OFFSETS;
  const out: CombatPoint[] = [];
  const anchorOk =
    isTownEdgePosition(anchor, fieldSize) && !isTownCenterPosition(anchor, fieldSize) && chaseFloorOk(anchor) && isFree(anchor);
  for (let i = 0; i < size; i++) {
    const off = offsets[i % offsets.length];
    const pos = { x: anchor.x + off.x, y: anchor.y + off.y };
    if (isTownEdgePosition(pos, fieldSize) && !isTownCenterPosition(pos, fieldSize) && chaseFloorOk(pos) && isFree(pos)) {
      out.push(pos);
    } else if (anchorOk) {
      out.push({ ...anchor });
    }
  }
  return out;
}
