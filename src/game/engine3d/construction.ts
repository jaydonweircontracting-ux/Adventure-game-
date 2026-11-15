/**
 * BUILD 1058 — NPC construction: the first hut from the stockpile.
 *
 * The founders (BUILD 1057) filled a real wood stockpile at their
 * camp. This module is the construction side: one cottage, built by
 * the founders from that stockpile, through the SAME placement path
 * the player uses (placements.ts validatePlacement + addPlacement),
 * so the finished hut is a REAL building — collision, door, interior
 * — not set-dressing. The vision plan (PLAN.md §2) calls placements
 * "the construction substrate"; §6 warns the cottage door-nav
 * defect (findPath returns null for doors in 6-unit gaps), so the
 * site is surveyed and its door reachability is asserted, not
 * assumed.
 *
 * DESIGN (all pure here; the view owns the timers, rendering, I/O):
 *
 * - SITE (surveyed on the real fresh world, 2026-11-15): the camp
 *   is at (124,120), the log pile at (125,120). The hut centre is
 *   (128,120) — 4 tiles east of the camp, on the same row, so camp,
 *   pile, and hut read as one little settlement. The cottage
 *   footprint is 4x3 (townLook.ts), rect 126..129 x 119..121: all
 *   walkable grass, no trees, no water, no rocks, and it touches
 *   none of the camp's own tiles (centre, pile, eat tile, sleep
 *   row). The door faces south at (128,121) with the approach tile
 *   (128,122) in open meadow; planPathNpc succeeds camp → approach
 *   (6 steps) and approach → player spawn (46 steps), asserted.
 * - COST: 12 wood = 6 work steps x 2 wood. A founder delivers 2 wood
 *   per trip (~15s per delivery in the 1057 probe), so the pile fills
 *   in ~45-60s with three founders and the hut finishes ~90s after
 *   a fresh start — observable in one probe.
 * - SPENDING IS HONEST: wood leaves the stockpile ONLY when a work
 *   step completes at the site (2 wood per step, 3 ticks per step,
 *   mirroring FOUNDER_CHOP_TICKS). The stockpile count never drops
 *   without wood being spent, and the hut never appears without the
 *   wood having been spent (the placement is added only when the 6th
 *   step completes). One builder at a time (the site has one work
 *   tile — the approach tile, in front of the door); the other
 *   founders keep the wood coming.
 * - NEEDS STILL DRIVE THE WORK: building is work. The builder is
 *   assigned only while their activity is 'work' (the 1057 chooser:
 *   sleep wins at night or on low energy, eat wins when hungry,
 *   rest wins when social is low). A tired or hungry builder leaves
 *   the site and the step's partial ticks reset; banked progress
 *   stays. If the pile runs dry mid-build the builder goes back to
 *   chopping.
 * - THE FINISHED HUT IS REAL: stamped through validatePlacement +
 *   addPlacement ('house-cottage', rot 0), so placedHutRects renders
 *   it, walkableWithPlacements collides it, nearestDoorHut opens it,
 *   and interiors.ts furnishes it — the same as a player-placed
 *   cottage. Once it exists the founders sleep IN it (their sleep
 *   tiles move to the hut's north row, door lane kept clear). Entry
 *   and exit are door transitions (the player's Enter/Exit, one tile
 *   through the door) — the 990 rule (NPCs never walk through hut
 *   tiles) is never broken, because the tick moves a founder through
 *   the door in one step instead of pathing them through walls.
 * - WAIT: construction does not advance during a wait — positions,
 *   chopping, deliveries, and building all pause (the 1057 rule);
 *   needs simulate per wait-step. No phantom wood, no phantom hut.
 * - SAVE: the construction state rides in the versioned founders
 *   save (ag-3d-founders-v1, v2 — see founders.ts), the hut itself
 *   rides in the world save (w.placements, via saveWorld). If the
 *   player removes the hut with Build Remove, the construction
 *   resets to 'none' (reconcileConstruction) and the founders
 *   rebuild from the pile when wood allows — no free hut, no
 *   disagreement between the two saves.
 *
 * Pure module (no React, no WebGL, no localStorage in the pure
 * functions) so the sim and the standalone asserts can import it
 * directly.
 */

import { planPathNpc } from './townsfolk3d';
import { houseFootprint, doorForRect } from './placements';
import { FOUNDER_CAMP, FOUNDER_STOCKPILE_TILE, FOUNDER_EAT_TILE, FOUNDER_SLEEP_TILES } from './founders';
import { terrainAt } from '../iso/isoWorld';
import type { IsoWorld } from '../iso/isoWorld';
import type { WheatTri } from './farm';

/** Hut centre (surveyed — see the module doc). */
export const HUT_CENTRE = { x: 128, y: 120 };
/** Hut rect: cottage 4x3 centred on HUT_CENTRE. */
export const HUT_RECT = { x0: 126, y0: 119, x1: 129, y1: 121 };
/** Door tile: south edge centre (doorForRect, rot 0). */
export const HUT_DOOR = { x: 128, y: 121 };
/** Approach tile: one tile south of the door — the exit point, the
 *  build work tile, and the door-transition tile. */
export const HUT_APPROACH = { x: 128, y: 122 };
/** Founders' sleep tiles inside the finished hut: the north row,
 *  with the door lane (x=128) kept clear. */
export const HUT_SLEEP_TILES = [
  { x: 126, y: 119 },
  { x: 127, y: 119 },
  { x: 129, y: 119 },
];
/** Placement kind for the hut (validatePlacement 'house-cottage'). */
export const HUT_KIND = 'house-cottage' as const;

/** Wood the hut costs in total. */
export const HUT_COST_WOOD = 12;
/** Work steps to finish the hut (each spends HUT_WOOD_PER_STEP). */
export const HUT_WORK_STEPS = 6;
/** Wood spent per completed work step. */
export const HUT_WOOD_PER_STEP = 2;
/** Ticks a founder works at the site per step (mirrors chop ticks). */
export const HUT_TICKS_PER_STEP = 3;

export type HutState = 'none' | 'building' | 'done';

/** Construction progress (saved in the founders save, v2). */
export type ConstructionState = {
  state: HutState;
  /** Completed work steps, 0..HUT_WORK_STEPS. */
  progress: number;
  /** Wood actually spent on the hut (2 per step). */
  spentWood: number;
};

/** Fresh construction: nothing started. */
export function freshConstruction(): ConstructionState {
  return { state: 'none', progress: 0, spentWood: 0 };
}

/** True when the tile is inside the hut rect. */
export function insideHutRect(x: number, y: number): boolean {
  return x >= HUT_RECT.x0 && x <= HUT_RECT.x1 && y >= HUT_RECT.y0 && y <= HUT_RECT.y1;
}

/** The hut placement exists in the world (a 'house' item on the
 *  exact hut rect — the same check the player-facing lists use). */
export function hutPlacementExists(world: IsoWorld): boolean {
  return (world.placements ?? []).some(
    (p) => p.kind === 'house' && p.x0 === HUT_RECT.x0 && p.y0 === HUT_RECT.y0 && p.x1 === HUT_RECT.x1 && p.y1 === HUT_RECT.y1,
  );
}

/**
 * Survey the site against the live world: every rect tile must be
 * walkable grass (no water, no tree, no rock) and none of the camp's
 * own tiles may fall inside the rect. Returns the problems (empty =
 * clear). Pure read.
 */
export function hutSiteProblems(world: IsoWorld): string[] {
  const problems: string[] = [];
  const fp = houseFootprint(HUT_KIND, 0);
  if (fp.w !== HUT_RECT.x1 - HUT_RECT.x0 + 1 || fp.d !== HUT_RECT.y1 - HUT_RECT.y0 + 1) {
    problems.push('hut rect does not match the cottage footprint');
  }
  const door = doorForRect(HUT_RECT.x0, HUT_RECT.y0, HUT_RECT.x1, HUT_RECT.y1, 'south');
  if (door.x !== HUT_DOOR.x || door.y !== HUT_DOOR.y) problems.push('door is not where the constants say');
  for (let y = HUT_RECT.y0; y <= HUT_RECT.y1; y++) {
    for (let x = HUT_RECT.x0; x <= HUT_RECT.x1; x++) {
      if (terrainAt(world, x, y) === 'water') problems.push(`water@${x},${y}`);
      if ((world.trees ?? []).some((t) => t.tx === x && t.ty === y)) problems.push(`tree@${x},${y}`);
      if ((world.rocks ?? []).some((r) => r.tx === x && r.ty === y)) problems.push(`rock@${x},${y}`);
      if (x === FOUNDER_CAMP.x && y === FOUNDER_CAMP.y) problems.push('on camp centre');
      if (x === FOUNDER_STOCKPILE_TILE.x && y === FOUNDER_STOCKPILE_TILE.y) problems.push('on stockpile');
      if (x === FOUNDER_EAT_TILE.x && y === FOUNDER_EAT_TILE.y) problems.push('on eat tile');
      if (FOUNDER_SLEEP_TILES.some((s) => s.x === x && s.y === y)) problems.push(`on sleep tile ${x},${y}`);
    }
  }
  return problems;
}

/**
 * The cottage warning (PLAN.md §6): the door must be reachable —
 * planPathNpc must succeed from the camp to the approach tile, and
 * from the approach tile to the player spawn (so the player can
 * reach the door too). Returns the step counts, or nulls when a
 * route does not exist. Pure read.
 */
export function hutDoorReachable(world: IsoWorld): { campToApproach: number | null; approachToSpawn: number | null } {
  const toApproach = planPathNpc(world, { x: FOUNDER_CAMP.x, y: FOUNDER_CAMP.y }, HUT_APPROACH);
  const toSpawn = planPathNpc(world, HUT_APPROACH, { x: 99, y: 105 });
  return { campToApproach: toApproach ? toApproach.length : null, approachToSpawn: toSpawn ? toSpawn.length : null };
}

/** True when the site is clear AND the door is reachable. */
export function verifyHutSite(world: IsoWorld): { ok: boolean; problems: string[]; campToApproach: number | null; approachToSpawn: number | null } {
  const problems = hutSiteProblems(world);
  const reach = hutDoorReachable(world);
  if (reach.campToApproach === null) problems.push('no path camp -> door approach');
  if (reach.approachToSpawn === null) problems.push('no path door approach -> player spawn');
  return { ok: problems.length === 0, problems, ...reach };
}

/** True when a founder may start (or continue) building: the hut is
 *  unfinished and the pile holds at least one step's wood. */
export function canBuild(c: ConstructionState, stockpileWood: number): boolean {
  return c.state !== 'done' && stockpileWood >= HUT_WOOD_PER_STEP;
}

/**
 * Complete one work step at the site: 2 wood leaves the pile, the
 * progress rises by 1. At the last step the hut is READY (progress
 * 6) but the state stays 'building' — the caller flips it to 'done'
 * only when the placement actually lands (finishConstruction). That
 * is what keeps a blocked completion (someone standing in the rect)
 * from looking like a player removal: reconcileConstruction only
 * resets a 'done' hut, never a ready one. With too little wood, or
 * when the hut is already ready, nothing happens (the caller sends
 * the builder back to chopping, or retries the placement). The hut
 * placement itself is added by the caller only when `completed` is
 * true — the hut never appears without the wood having been spent.
 * Pure.
 */
export function spendBuildStep(
  c: ConstructionState,
  stockpileWood: number,
): { construction: ConstructionState; stockpileWood: number; completed: boolean; spent: boolean } {
  if (c.state === 'done' || c.progress >= HUT_WORK_STEPS || stockpileWood < HUT_WOOD_PER_STEP) {
    return { construction: c, stockpileWood, completed: c.progress >= HUT_WORK_STEPS, spent: false };
  }
  const progress = c.progress + 1;
  const spentWood = c.spentWood + HUT_WOOD_PER_STEP;
  const completed = progress >= HUT_WORK_STEPS;
  return {
    construction: { state: 'building', progress, spentWood },
    stockpileWood: stockpileWood - HUT_WOOD_PER_STEP,
    completed,
    spent: true,
  };
}

/** Flip a ready construction (progress 6) to 'done' once its hut
 *  placement has actually landed. Pure. */
export function finishConstruction(c: ConstructionState): ConstructionState {
  return { state: 'done', progress: HUT_WORK_STEPS, spentWood: HUT_COST_WOOD };
}

/**
 * Reconcile the two saves: a 'done' construction whose hut placement
 * is gone (the player removed it with Build Remove) resets to
 * 'none' — the founders rebuild from the pile when wood allows, and
 * no free hut ever appears. A 'building' construction with a
 * placement present (should not happen — the placement is added only
 * on completion) is treated as done. Pure.
 */
export function reconcileConstruction(c: ConstructionState, hutPlaced: boolean): ConstructionState {
  if (c.state === 'done' && !hutPlaced) return freshConstruction();
  if (c.state !== 'done' && hutPlaced) return { state: 'done', progress: HUT_WORK_STEPS, spentWood: HUT_COST_WOOD };
  return c;
}

/** Hut progress as a "3/6" label for the HUD / E reports. */
export function hutProgressLabel(c: ConstructionState): string {
  if (c.state === 'done') return 'done';
  if (c.state === 'building') return `${c.progress}/${HUT_WORK_STEPS}`;
  return '—';
}

// --- Build-site visual: foundation + frame that grows with progress ---

/** Stone-grey foundation slab. */
export const SITE_FOUNDATION: [number, number, number] = [0.55, 0.55, 0.52];
/** Timber-brown frame. */
export const SITE_FRAME: [number, number, number] = [0.45, 0.32, 0.18];
export const SITE_FRAME_DARK: [number, number, number] = [0.34, 0.24, 0.13];

/**
 * Build-site triangles for the hut rect: a foundation slab (always,
 * while building), corner posts from step 2, wall beams from step 4,
 * roof beams at step 5. At step 6 the real hut placement renders
 * instead, so this returns nothing for a finished hut. A box is a
 * 12-triangle box; faces alternate light/dark for shading (the
 * stockpile-logs precedent). Pure geometry.
 */
export function constructionSiteTrisFor(baseY: number, progress: number): WheatTri[] {
  if (progress >= HUT_WORK_STEPS) return [];
  const out: WheatTri[] = [];
  const pushBox = (cx: number, cz: number, y0: number, len: number, h: number, d: number, col: [number, number, number], dark: [number, number, number]) => {
    const x0 = cx - len / 2, x1 = cx + len / 2;
    const z0 = cz - d / 2, z1 = cz + d / 2;
    const y1 = y0 + h;
    const v: [number, number, number][] = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ];
    const faces: [number, number, number, number, [number, number, number]][] = [
      [4, 5, 6, 7, col],
      [0, 2, 1, 3, dark],
      [0, 1, 5, 4, col],
      [2, 3, 7, 6, dark],
      [1, 2, 6, 5, col],
      [3, 0, 4, 7, dark],
    ];
    for (const [a, b, cc, dd, cl] of faces) {
      out.push({ a: v[a], b: v[b], c: v[cc], col: cl });
      out.push({ a: v[a], b: v[cc], c: v[dd], col: cl });
    }
  };
  const cx = HUT_RECT.x0 + (HUT_RECT.x1 - HUT_RECT.x0 + 1) / 2;
  const cz = HUT_RECT.y0 + (HUT_RECT.y1 - HUT_RECT.y0 + 1) / 2;
  const w = HUT_RECT.x1 - HUT_RECT.x0 + 1;
  const d = HUT_RECT.y1 - HUT_RECT.y0 + 1;
  // Foundation slab covering the rect.
  pushBox(cx, cz, baseY, w - 0.2, 0.1, d - 0.2, SITE_FOUNDATION, SITE_FOUNDATION);
  if (progress >= 2) {
    // Four corner posts.
    const px = [HUT_RECT.x0 + 0.15, HUT_RECT.x1 + 0.85];
    const pz = [HUT_RECT.y0 + 0.15, HUT_RECT.y1 + 0.85];
    for (const x of px) for (const z of pz) pushBox(x, z, baseY + 0.1, 0.14, 0.9, 0.14, SITE_FRAME, SITE_FRAME_DARK);
  }
  if (progress >= 4) {
    // Wall beams along the top of the posts (north + south edges).
    pushBox(cx, HUT_RECT.y0 + 0.15, baseY + 1.0, w - 0.2, 0.12, 0.14, SITE_FRAME, SITE_FRAME_DARK);
    pushBox(cx, HUT_RECT.y1 + 0.85, baseY + 1.0, w - 0.2, 0.12, 0.14, SITE_FRAME, SITE_FRAME_DARK);
  }
  if (progress >= 5) {
    // Roof ridge beam.
    pushBox(cx, cz, baseY + 1.15, w - 0.2, 0.12, 0.14, SITE_FRAME, SITE_FRAME_DARK);
  }
  return out;
}
