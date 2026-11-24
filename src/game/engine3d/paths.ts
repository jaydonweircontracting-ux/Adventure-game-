/**
 * BUILD 1088 — NEURON HEX 0x17, Living World plan Phase 2.3: roads /
 * wells / bridges.
 *
 * This module owns the settlement's GROUNDWORK: the dirt paths the
 * founders wear into the ground by walking, the camp well as a
 * functional water source, and the builder-placed bridges where a
 * path meets a river. Three systems, one module, all REAL:
 *
 * - DIRT PATHS: every founder step is recorded (recordTraffic, called
 *   by the founder tick after each stepFounderMove). A tile the
 *   founders cross PATH_TRAFFIC_THRESHOLD times becomes a 'path'
 *   placement (the caller places it through addPlacement) — a real
 *   world tile, persisted by saveWorld, rendered as dirt by the
 *   existing effTerrainFor rule (placed paths read as dirt), and
 *   walkable (a path never blocks). Nothing is pre-painted: a path
 *   exists only where founders actually walked. Traffic counts are
 *   SESSION-ONLY (they live on the PathState the tick owns, never
 *   saved — a reload keeps the tiles, the counts restart). The
 *   pathfinder charges a uniform cost per tile (townsfolk3d.ts
 *   planPathNpc, no cost function), so a path tile can never change
 *   a founder's route or the 24h numbers — it only records where
 *   they already walk.
 * - THE WELL: a 'well' placement seeded near camp at load (seedWell
 *   — the farm-plot seed's pattern, idempotent). The tile is
 *   SURVEYED (verify1088/survey1088.mts): (121,120), 3 tiles west
 *   of camp on the camp row, with its approach on the camp side
 *   (122,120) — every founder route (nearest/mid tree work tile,
 *   farm, both hut approaches, storehouse approach, nearest rock
 *   work tile, arrival entry) keeps its exact planPathNpc length
 *   with the well placed, so the 24h window cannot move. The well
 *   is a FUNCTIONAL water source: from WELL_START_DAY (day 3 — the
 *   storehouse's day gate, so the 24h window never sees it) a
 *   founder draws water (workState 'toWell' → carryingWater 1) and
 *   waters a growing farm tile ('toWater' → waterFarmTile, farm.ts),
 *   which grows WATER_BOOST_MIN game-minutes faster — a real
 *   effect on the food loop, not a label. Water is drawn and poured
 *   in one trip and never stocked, so it rides on the founder
 *   (carryingWater, founders.ts v10), not the registry — there is
 *   no water store anywhere to account for.
 * - BRIDGES: when a dirt path reaches a river tile (a path tile
 *   4-adjacent to a river tile — detected on placement, plus a
 *   once-a-day scan for paths laid before the day gate), a bridge
 *   site opens for that river tile. From BRIDGE_START_DAY (day 3)
 *   a builder claims it through the construction path (a 'build'
 *   job on the board, one builder, BRIDGE_WORK_STEPS steps of
 *   BRIDGE_WOOD_PER_STEP wood from the camp pile — the hut/
 *   storehouse shape, same ready/done split: a site at full
 *   progress whose placement has not landed spends nothing on the
 *   retry). On completion the bridge is stamped through
 *   validatePlacement ('bridge' — the 1.3 rule: terrain 'water')
 *   and is walkable (isPlacedBridge, the 1.3 mechanic). Bridge
 *   sites persist in the founders save (v10, like the storehouse
 *   state); the bridge itself is a placement, persisted by
 *   saveWorld. Housing first, storage second, bridges third: a
 *   bridge scores only when no hut and no storehouse is pending.
 *
 * Pure apart from the world mutation the callers do (addPlacement
 * for paths/wells/bridges, and the traffic counts the tick owns).
 * No React, no WebGL, no localStorage — the sim and the standalone
 * asserts import it directly.
 */
import { terrainAt, inBounds, type IsoWorld, type PathKind, type PlacedItem } from '../iso/isoWorld';
import { walkableWithPlacements, placementsOf, addPlacement, validatePlacement, isPlacedFord, removeExactPlacement } from './placements';
import { riverAt, riverNear, riverWidthAt, allRoadCrossings, isShallowTile, type River } from './rivers';
import { CAMP_STORE_ID, storeQty, withdrawFrom, type ResourceRegistry } from './resourceRegistry';
import { STOREHOUSE_STORE_ID } from './storehouse';
import {
  stagePlanFor,
  stageStepSplit,
  stageProgressOf,
  currentStageFor,
  isStageOpen,
  ZERO_STAGE_STEPS,
  type BuildStageId,
  type StageSteps,
  type StagePlan,
} from './construction';
import { FOUNDER_CAMP, tileReachableFromCamp } from './founders';

/** Founder passes over a tile before it wears into a dirt path. */
export const PATH_TRAFFIC_THRESHOLD = 8;
/** Dirt paths stop growing here (the settlement's worn ground, not
 *  a paved map — cobblestone is Phase 3). */
export const PATH_MAX_TILES = 250;
/** The camp well (surveyed 1088 — see the header): 3 tiles west of
 *  camp on the camp row, approach on the camp side. */
export const WELL_TILE = { x: 121, y: 120 };
/** Fallbacks when the surveyed tile is taken (a player building,
 *  a tree) — surveyed-safe tiles nearest camp first (the survey
 *  proves each keeps every founder route's exact length). */
export const WELL_FALLBACK_TILES: Array<{ x: number; y: number }> = [
  { x: 122, y: 119 },
  { x: 122, y: 121 },
  { x: 123, y: 122 },
  { x: 120, y: 121 },
  { x: 119, y: 121 },
  { x: 127, y: 123 },
];
/** Do not seed the well when one already stands within this many
 *  tiles of the camp (the player already has water there). */
export const WELL_SEED_RADIUS = 40;
/** Watering + bridge work start on day 3 — the storehouse's day
 *  gate, so the 24h sim (day 1 → day 2 08:00) never sees either. */
export const WELL_START_DAY = 3;
export const BRIDGE_START_DAY = 3;
/** A bridge over one river tile: 2 work steps, 2 wood each. */
export const BRIDGE_WORK_STEPS = 2;
export const BRIDGE_WOOD_PER_STEP = 2;
export const BRIDGE_COST_WOOD = BRIDGE_WORK_STEPS * BRIDGE_WOOD_PER_STEP;

/** One bridge site's progress (saved in the founders save, v10 —
 *  the same shape as one hut SiteState, wood only). */
export type BridgeStyle = 'wooden' | 'stone' | 'footbridge' | 'large-road' | 'narrow-stream' | 'wide-river';
export type BridgeSiteStateKind = 'none' | 'building' | 'done';
export type BridgeSite = {
  /** Stable id ('bridge-<x>-<y>') — the build job's target. */
  id: string;
  /** The river tile the bridge spans. */
  x: number;
  y: number;
  /** The walkable bank tile the builder stands on. */
  workTile: { x: number; y: number };
  /** The near-bank road tile from which the crossing was detected. Optional on legacy saves. */
  nearBank?: { x: number; y: number };
  /** Every consecutive river-water tile crossed by this bridge. Optional on legacy saves. */
  spanTiles?: Array<{ x: number; y: number }>;
  /** Visual profile selected from the span and both-bank road geometry. Optional on legacy saves. */
  style?: BridgeStyle;
  /** Crossing direction; x = east/west span, y = north/south span. */
  axis?: 'x' | 'y';
  state: BridgeSiteStateKind;
  /** Completed work steps, 0..BRIDGE_WORK_STEPS. */
  progress: number;
  /** Wood actually spent on this bridge (2 per step). */
  spentWood: number;
  /** Per-stage steps completed (BUILD 1093). Optional: an old
   *  save without it derives the stages from the total progress. */
  stages?: StageSteps;
};

/** The tick-owned path state: session-only traffic counts + the
 *  persisted bridge sites. The traffic is never saved (a reload
 *  keeps the tiles, the counts restart); the bridges ride in the
 *  founders save (v10). */
export type PathState = {
  /** Passes per tile ("x,y" → count) — session-only. */
  traffic: Record<string, number>;
  bridges: BridgeSite[];
  /** The last day the once-a-day bridge scan ran. */
  lastBridgeScanDay: number;
};

/** Fresh path state: no traffic, no bridges, day 1 unscanned. */
export function freshPathState(): PathState {
  return { traffic: {}, bridges: [], lastBridgeScanDay: 1 };
}

/** The bridge site id for a river tile. */
export function bridgeSiteIdFor(x: number, y: number): string {
  return 'bridge-' + x + '-' + y;
}

/** Fresh bridge site: nothing started, on the river tile, the
 *  builder standing on the bank tile. */
export function freshBridgeSite(
  x: number,
  y: number,
  workTile: { x: number; y: number },
  spanTiles: Array<{ x: number; y: number }> = [{ x, y }],
  style: BridgeStyle = 'wooden',
  axis: 'x' | 'y' = 'x',
  nearBank: { x: number; y: number } = workTile,
): BridgeSite {
  const uniqueSpan = [...new Map(spanTiles.map((tile) => [tile.x + ',' + tile.y, { ...tile }])).values()].slice(0, 6);
  if (!uniqueSpan.some((tile) => tile.x === x && tile.y === y)) uniqueSpan.unshift({ x, y });
  return {
    id: bridgeSiteIdFor(x, y), x, y, workTile: { ...workTile }, nearBank: { ...nearBank },
    spanTiles: uniqueSpan, style, axis, state: 'none', progress: 0, spentWood: 0,
    stages: { ...ZERO_STAGE_STEPS },
  };
}

/** Validate a saved bridge site (v10 migration): unknown states /
 *  out-of-range numbers fall back to fresh (never guess at a
 *  corrupt save — the founders re-detect the site from the path).
 *  Pure. */
export function validateBridgeSite(value: unknown): BridgeSite | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const x = Number(v.x);
  const y = Number(v.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const w = v.workTile as Record<string, unknown> | undefined;
  const wx = Number(w?.x);
  const wy = Number(w?.y);
  if (!Number.isInteger(wx) || !Number.isInteger(wy)) return null;
  const state = v.state === 'building' || v.state === 'done' ? (v.state as BridgeSiteStateKind) : 'none';
  let progress = Math.max(0, Math.min(BRIDGE_WORK_STEPS, Math.round(Number(v.progress) || 0)));
  let spentWood = Math.max(0, Math.round(Number(v.spentWood) || 0));
  if (state === 'done') {
    progress = BRIDGE_WORK_STEPS;
    spentWood = BRIDGE_COST_WOOD;
  }
  if (state === 'none') {
    progress = 0;
    spentWood = 0;
  }
  // BUILD 1093: keep the saved per-stage progress when it is
  // valid (it sums to the total); an old save without it derives
  // the stages from the total (the sequential split).
  const stages = stageProgressOf({ progress, stages: (v as { stages?: StageSteps }).stages }, BRIDGE_WORK_STEPS);
  const rawSpan = Array.isArray(v.spanTiles) ? v.spanTiles : [];
  const spanTiles = rawSpan
    .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object')
    .map((raw) => ({ x: Number(raw.x), y: Number(raw.y) }))
    .filter((tile) => Number.isInteger(tile.x) && Number.isInteger(tile.y))
    .filter((tile, index, all) => all.findIndex((other) => other.x === tile.x && other.y === tile.y) === index)
    .slice(0, 6);
  if (!spanTiles.some((tile) => tile.x === x && tile.y === y)) spanTiles.unshift({ x, y });
  const styles: BridgeStyle[] = ['wooden', 'stone', 'footbridge', 'large-road', 'narrow-stream', 'wide-river'];
  const style = styles.includes(v.style as BridgeStyle) ? v.style as BridgeStyle : 'wooden';
  const axis = v.axis === 'y' ? 'y' : 'x';
  const rawBank = v.nearBank as Record<string, unknown> | undefined;
  const bx = Number(rawBank?.x), by = Number(rawBank?.y);
  const nearBank = Number.isInteger(bx) && Number.isInteger(by) ? { x: bx, y: by } : { x: wx, y: wy };
  return { id: bridgeSiteIdFor(x, y), x, y, workTile: { x: wx, y: wy }, nearBank, spanTiles, style, axis, state, progress, spentWood, stages };
}

/** Validate a saved bridge list (v10 migration): corrupt entries
 *  are dropped, never guessed at. Pure. */
export function validateBridges(value: unknown): BridgeSite[] {
  if (!Array.isArray(value)) return [];
  const out: BridgeSite[] = [];
  for (const raw of value) {
    const site = validateBridgeSite(raw);
    if (site) out.push(site);
  }
  return out;
}

/** The bridge site for a river tile, if one is open for it. */
export function bridgeSiteById(bridges: readonly BridgeSite[], id: string): BridgeSite | undefined {
  return bridges.find((s) => s.id === id);
}

/** The bridge site spanning a river tile, if any. */
export function bridgeSiteAt(bridges: readonly BridgeSite[], x: number, y: number): BridgeSite | undefined {
  return bridges.find((s) => s.x === x && s.y === y);
}

// --- Dirt paths ---

function trafficKey(x: number, y: number): string {
  return x + ',' + y;
}

/** Passes over a tile (session-only). */
export function trafficCount(state: PathState, x: number, y: number): number {
  return state.traffic[trafficKey(x, y)] ?? 0;
}

/** True when the tile already holds a dirt path placement. */
export function isPathTile(world: IsoWorld, x: number, y: number): boolean {
  return placementsOf(world).some((p) => p.kind === 'path' && x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
}

/** Every dirt path tile in the world, flat. */
export function pathTiles(world: IsoWorld): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const p of placementsOf(world)) {
    if (p.kind !== 'path') continue;
    for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) out.push({ x, y });
  }
  return out;
}

/** Every ford tile in the world, flat (BUILD 1128 probe hook). */
export function fordTiles(world: IsoWorld): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const p of placementsOf(world)) {
    if (p.kind !== 'ford') continue;
    for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) out.push({ x, y });
  }
  return out;
}

/** BUILD 1128 (0x31): the grade of a traffic-worn path tile —
 * 'dirt' inside the camp disc (the settlement's worn ground),
 * 'trail' outside it (a wild footpath). Bridge entrances are
 * 'stone' and stamped connectors are 'road' (see placeBridgeSpan /
 * extendPathToCrossing); this helper covers only traffic paths. */
export function trafficPathKind(x: number, y: number, camp: { x: number; y: number }): PathKind {
  return Math.abs(x - camp.x) + Math.abs(y - camp.y) <= 25 ? 'dirt' : 'trail';
}

/** True when a tile may wear into a path: walkable ground (grass
 *  or dirt — never water, stone, or a hut), holding no placement,
 *  and under the cap. A bridge tile is walkable but holds a bridge;
 *  a farm tile is walkable ground cover but holds a farm — neither
 *  ever becomes a path. Pure read (never mutates). */
export function pathPlaceable(world: IsoWorld, x: number, y: number): boolean {
  if (!inBounds(world, x, y)) return false;
  const t = terrainAt(world, x, y);
  if (t !== 'grass' && t !== 'dirt') return false;
  if (!walkableWithPlacements(world, world.crates, x, y)) return false;
  if (placementsOf(world).some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1)) return false;
  if (pathTiles(world).length >= PATH_MAX_TILES) return false;
  return true;
}

/**
 * Record one founder step on a tile. MUTATES state.traffic (the
 * session-only counts — the tick owns the state, like the founder
 * path cache). Returns the tile when this pass wears it into a
 * dirt path (the count hit the threshold and the tile is
 * placeable) — the caller places it through addPlacement. A tile
 * that already holds a path, or that stopped being placeable, never
 * returns again. Pure apart from the traffic mutation.
 */
export function recordTraffic(state: PathState, world: IsoWorld, x: number, y: number): { x: number; y: number } | null {
  const key = trafficKey(x, y);
  const count = (state.traffic[key] ?? 0) + 1;
  state.traffic[key] = count;
  if (count < PATH_TRAFFIC_THRESHOLD) return null;
  if (!pathPlaceable(world, x, y)) return null;
  return { x, y };
}

/**
 * True when a target tile is reachable from `from` through dirt
 * path tiles (4-directional BFS — the start and the targets
 * themselves need not be path tiles: a work site at the end of a
 * path counts). The acceptance test: after a week of founder
 * traffic a visible dirt path connects camp to work sites. Pure.
 */
export function pathConnects(world: IsoWorld, from: { x: number; y: number }, targets: Array<{ x: number; y: number }>): boolean {
  const paths = new Set(pathTiles(world).map((t) => trafficKey(t.x, t.y)));
  // A completed bridge — and a ford — are part of the same connected
  // road graph as dirt paths; water remains blocked everywhere else.
  for (const p of placementsOf(world)) {
    if (p.kind !== 'bridge' && p.kind !== 'ford') continue;
    for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) paths.add(trafficKey(x, y));
  }
  const targetKeys = new Set(targets.map((t) => trafficKey(t.x, t.y)));
  if (targetKeys.has(trafficKey(from.x, from.y))) return true;
  const seen = new Set<string>([trafficKey(from.x, from.y)]);
  const queue: Array<{ x: number; y: number }> = [{ ...from }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const key = trafficKey(nx, ny);
      if (seen.has(key)) continue;
      seen.add(key);
      if (targetKeys.has(key)) return true;
      if (paths.has(key)) queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

// --- The well ---

/**
 * Seed the camp well into the world (load path, once): places the
 * surveyed tile (121,120) — or the first surveyed-safe fallback
 * when it is taken — when no well stands within WELL_SEED_RADIUS
 * of the camp. Tiles that are not walkable (a tree, a rock, water
 * — the caller's `walkable` predicate, npcWalkable in the view) or
 * already hold a placement are skipped, never forced. Returns the
 * placed tile, or null when a well already stands nearby or
 * nowhere is free. The caller saves the world when a tile lands.
 * Pure apart from the world mutation (the placement list, like
 * addPlacement).
 */
export function seedWell(
  w: IsoWorld,
  campX: number,
  campY: number,
  walkable: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  if (!w.placements) w.placements = [];
  for (const p of w.placements) {
    if (p.kind !== 'well') continue;
    if (Math.abs(p.x0 - campX) + Math.abs(p.y0 - campY) <= WELL_SEED_RADIUS) return null;
  }
  const taken = (x: number, y: number): boolean =>
    w.placements!.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
  for (const tile of [WELL_TILE, ...WELL_FALLBACK_TILES]) {
    if (taken(tile.x, tile.y)) continue;
    if (!walkable(tile.x, tile.y)) continue;
    addPlacement(w, { kind: 'well', x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y });
    return { ...tile };
  }
  return null;
}

/** The camp well (the 'well' placement nearest camp), or null. */
export function wellTile(w: IsoWorld, campX: number, campY: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const p of w.placements ?? []) {
    if (p.kind !== 'well') continue;
    const d = Math.abs(p.x0 - campX) + Math.abs(p.y0 - campY);
    if (d < bestD) {
      bestD = d;
      best = { x: p.x0, y: p.y0 };
    }
  }
  return best;
}

/**
 * The tile a founder stands on to draw from the well: the walkable
 * 4-neighbour nearest camp (the founder comes from camp — the
 * approach is on the camp side). Null when the well is walled in.
 * Pure.
 */
export function wellApproachFor(w: IsoWorld, well: { x: number; y: number }, campX: number, campY: number): { x: number; y: number } | null {
  const cands = [
    { x: well.x + 1, y: well.y },
    { x: well.x - 1, y: well.y },
    { x: well.x, y: well.y + 1 },
    { x: well.x, y: well.y - 1 },
  ].filter((t) => walkableWithPlacements(w, w.crates, t.x, t.y));
  if (cands.length === 0) return null;
  cands.sort((a, b) => Math.abs(a.x - campX) + Math.abs(a.y - campY) - (Math.abs(b.x - campX) + Math.abs(b.y - campY)));
  return { ...cands[0] };
}

/**
 * BUILD 1128 (0x31): find the fordable shallow span touching a land
 * tile — a water run of span <= 2 whose every tile is shallow
 * (isShallowTile), whose both banks are walkable (scoreCrossing
 * returns a score), and which no bridge site, bridge placement or
 * ford already covers. Returns the span tiles plus the near bank
 * (closer to the reference tile) and the far bank, or null when no
 * such span touches the tile. Pure (reads only).
 */
export function fordableSpanFor(
  world: IsoWorld,
  bridges: readonly BridgeSite[],
  x: number,
  y: number,
): { tiles: Array<{ x: number; y: number }>; nearBank: { x: number; y: number }; farBank: { x: number; y: number } } | null {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const wx = x + dx, wy = y + dy;
    if (!inBounds(world, wx, wy) || terrainAt(world, wx, wy) !== 'water') continue;
    const run = crossingRunFor(world, wx, wy);
    if (!run || run.tiles.length > 2) continue;
    if (!run.tiles.every((t) => isShallowTile(world, t.x, t.y))) continue;
    if (scoreCrossing(world, run) === null) continue;
    if (bridgeSpanAlreadyClaimed(world, bridges as BridgeSite[], run.tiles)) continue;
    if (run.tiles.some((t) => isPlacedFord(world, t.x, t.y))) continue;
    const nearBank = Math.abs(run.bankA.x - x) + Math.abs(run.bankA.y - y) <= Math.abs(run.bankB.x - x) + Math.abs(run.bankB.y - y) ? run.bankA : run.bankB;
    const farBank = nearBank === run.bankA ? run.bankB : run.bankA;
    return { tiles: run.tiles, nearBank, farBank };
  }
  return null;
}

/**
 * BUILD 1128 (0x31): stamp a ford across a shallow span, plus a
 * road tile on the far-bank landing so pathConnects holds across
 * the crossing (a ford alone leaves the far bank as plain land,
 * which the road graph cannot see). MUTATES the world (placements
 * only). Returns the stamped tiles (ford tiles + landing, if any).
 */
export function stampFord(
  world: IsoWorld,
  ford: { tiles: Array<{ x: number; y: number }>; nearBank: { x: number; y: number }; farBank: { x: number; y: number } },
): Array<{ x: number; y: number }> {
  const stamped: Array<{ x: number; y: number }> = [];
  for (const tile of ford.tiles) {
    if (isPlacedFord(world, tile.x, tile.y)) continue;
    const result = validatePlacement(world, 'ford', tile.x, tile.y, { x: 0, y: 0 }, [], 0);
    if (result.ok) {
      addPlacement(world, result.item);
      stamped.push({ ...tile });
    }
  }
  if (stamped.length > 0 && !isPathTile(world, ford.farBank.x, ford.farBank.y) && pathPlaceable(world, ford.farBank.x, ford.farBank.y)) {
    if (stampPathTile(world, ford.farBank.x, ford.farBank.y, 'road', { x: 0, y: 0 }, [])) stamped.push({ ...ford.farBank });
  }
  return stamped;
}

/**
 * BUILD 1128 (0x31): when a fresh traffic path tile meets water,
 * grow a bank road from it toward the nearest crossing — a bridge
 * site/placement, a scored crossing's camp bank, or a fordable
 * shallow span — so no path dead-ends at water without a crossing
 * within a short walk (the 32-tile bank road IS the short walk).
 * The search walks the existing path network where it exists
 * (path tiles are traversable, never re-stamped) and stamps 'road'
 * tiles only where the network is missing; bank-adjacent tiles are
 * explored first so the road hugs the bank. It stamps a ford across
 * a shallow span (span <= 2, all shallow, both banks walkable, no
 * bridge or ford nearby) when no bridge is in reach, and stamps
 * nothing when nothing is in reach. MUTATES the world (placements
 * only). Returns the stamped tiles (roads + fords). Called from the
 * founder tick (live + sim) right after a new path tile is placed —
 * and only then, so the BFS never runs per step.
 */
export function extendPathToCrossing(
  world: IsoWorld,
  state: PathState,
  from: { x: number; y: number },
): Array<{ x: number; y: number }> {
  if (!riverNear(world, from.x, from.y, 1)) return [];
  // Targets: bridge sites (work tile / near bank / span), placed
  // bridge tiles, and scored crossing banks — all as land-tile keys.
  const bridgeTargets = new Set<string>();
  for (const site of state.bridges) {
    bridgeTargets.add(trafficKey(site.workTile.x, site.workTile.y));
    if (site.nearBank) bridgeTargets.add(trafficKey(site.nearBank.x, site.nearBank.y));
    for (const t of bridgeSiteSpan(site)) bridgeTargets.add(trafficKey(t.x, t.y));
  }
  for (const p of placementsOf(world)) {
    if (p.kind === 'bridge' || p.kind === 'ford') {
      for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) bridgeTargets.add(trafficKey(x, y));
    }
  }
  const crossingBanks = new Set<string>();
  for (const { run } of listCrossings(world)) {
    crossingBanks.add(trafficKey(run.bankA.x, run.bankA.y));
    crossingBanks.add(trafficKey(run.bankB.x, run.bankB.y));
  }
  // A fordable shallow span touching the path tile itself fords at
  // once — the path met the water here, so the crossing is here.
  const fordHere = fordableSpanFor(world, state.bridges, from.x, from.y);
  if (fordHere) return stampFord(world, fordHere);
  // BFS along the bank (then open ground, then through the existing
  // path network) to the nearest bridge / crossing bank / fordable
  // span. Path tiles are traversable — the road follows the network
  // where it exists and only stamps new road where it does not.
  const startKey = trafficKey(from.x, from.y);
  const previous = new Map<string, string | null>([[startKey, null]]);
  const queue: Array<{ x: number; y: number; distance: number }> = [{ ...from, distance: 0 }];
  const maxSteps = 32;
  let found: { x: number; y: number; ford?: { tiles: Array<{ x: number; y: number }>; nearBank: { x: number; y: number }; farBank: { x: number; y: number } } } | null = null;
  while (queue.length > 0 && !found) {
    const current = queue.shift()!;
    if (current.distance >= maxSteps) continue;
    const neighbours: Array<{ x: number; y: number }> = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      neighbours.push({ x: current.x + dx, y: current.y + dy });
    }
    neighbours.sort((a, b) => (riverNear(world, b.x, b.y, 1) ? 1 : 0) - (riverNear(world, a.x, a.y, 1) ? 1 : 0));
    for (const n of neighbours) {
      const key = trafficKey(n.x, n.y);
      if (previous.has(key) || !inBounds(world, n.x, n.y) || terrainAt(world, n.x, n.y) === 'water') continue;
      previous.set(key, trafficKey(current.x, current.y));
      if (bridgeTargets.has(key) || crossingBanks.has(key)) {
        found = { ...n };
        break;
      }
      const ford = fordableSpanFor(world, state.bridges, n.x, n.y);
      if (ford) {
        found = { ...n, ford };
        break;
      }
      if (isPathTile(world, n.x, n.y)) {
        queue.push({ x: n.x, y: n.y, distance: current.distance + 1 });
        continue;
      }
      if (!pathPlaceable(world, n.x, n.y)) {
        previous.delete(key);
        continue;
      }
      queue.push({ x: n.x, y: n.y, distance: current.distance + 1 });
    }
  }
  if (!found) return [];
  const route: Array<{ x: number; y: number }> = [];
  let cursor: string | null = trafficKey(found.x, found.y);
  while (cursor && cursor !== startKey) {
    const [x, y] = cursor.split(',').map(Number);
    route.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }
  route.reverse();
  const stamped: Array<{ x: number; y: number }> = [];
  for (const tile of route) {
    if (isPathTile(world, tile.x, tile.y)) continue;
    if (stampPathTile(world, tile.x, tile.y, 'road', { x: 0, y: 0 }, [])) stamped.push({ ...tile });
  }
  if (found.ford) stamped.push(...stampFord(world, found.ford));
  return stamped;
}

// --- Bridges ---

/** The water tiles covered by a bridge site (legacy saves are one tile). */
export function bridgeSiteSpan(site: BridgeSite): Array<{ x: number; y: number }> {
  return site.spanTiles?.length ? site.spanTiles : [{ x: site.x, y: site.y }];
}

/** True when a bridge placement spans the river tile. */
export function bridgePlacementExists(world: IsoWorld, x: number, y: number): boolean {
  return placementsOf(world).some((p) => p.kind === 'bridge' && x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
}

/** True only when every tile in a bridge's saved span is placed. */
export function bridgeSitePlacementExists(world: IsoWorld, site: BridgeSite): boolean {
  return bridgeSiteSpan(site).every((tile) => bridgePlacementExists(world, tile.x, tile.y));
}

/** A candidate cannot overlap an existing bridge or another site's reserved span. */
export function bridgeSpanAlreadyClaimed(
  world: IsoWorld,
  bridges: readonly BridgeSite[],
  span: readonly { x: number; y: number }[],
): boolean {
  return span.some((tile) =>
    bridgePlacementExists(world, tile.x, tile.y) ||
    bridges.some((site) => bridgeSiteSpan(site).some((other) => other.x === tile.x && other.y === tile.y)),
  );
}

/**
 * BUILD 1128 (0x31): the open-ground leg of a bridge approach. BFS
 * from `start` over path-placeable land tiles to the nearest existing
 * path tile, exploring bank-adjacent tiles first so the road hugs the
 * bank when a bank route exists and cuts across open ground when it
 * does not. Returns the route INCLUDING the start tile (the bank
 * entrance) and EXCLUDING the found path tile (already a path), or
 * null when no path is within maxSteps. Pure (reads only).
 */
export function planOpenGroundApproach(
  world: IsoWorld,
  start: { x: number; y: number },
  maxSteps = 48,
): Array<{ x: number; y: number }> | null {
  if (isPathTile(world, start.x, start.y) || !pathPlaceable(world, start.x, start.y)) return null;
  const startKey = trafficKey(start.x, start.y);
  const previous = new Map<string, string | null>([[startKey, null]]);
  const queue: Array<{ x: number; y: number; distance: number }> = [{ ...start, distance: 0 }];
  let foundPath: string | null = null;
  while (queue.length > 0 && foundPath === null) {
    const current = queue.shift()!;
    if (current.distance >= maxSteps) continue;
    const neighbours: Array<{ x: number; y: number }> = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      neighbours.push({ x: current.x + dx, y: current.y + dy });
    }
    // Bank-adjacent tiles first: the road follows the riverbank
    // when a bank route exists.
    neighbours.sort((a, b) => (riverNear(world, b.x, b.y, 1) ? 1 : 0) - (riverNear(world, a.x, a.y, 1) ? 1 : 0));
    for (const n of neighbours) {
      const key = trafficKey(n.x, n.y);
      if (previous.has(key) || !inBounds(world, n.x, n.y) || terrainAt(world, n.x, n.y) === 'water') continue;
      previous.set(key, trafficKey(current.x, current.y));
      if (isPathTile(world, n.x, n.y)) {
        foundPath = key;
        break;
      }
      if (!pathPlaceable(world, n.x, n.y)) {
        previous.delete(key);
        continue;
      }
      queue.push({ x: n.x, y: n.y, distance: current.distance + 1 });
    }
  }
  if (foundPath === null) return null;
  const route: Array<{ x: number; y: number }> = [];
  let cursor: string | null = foundPath;
  while (cursor && cursor !== startKey) {
    const [x, y] = cursor.split(',').map(Number);
    route.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }
  route.reverse();
  route.unshift({ ...start });
  return route.filter((tile) => !isPathTile(world, tile.x, tile.y));
}

/**
 * Plan a short, dry approach along a riverbank. It follows only
 * walkable tiles that remain adjacent to river water, stops at the
 * nearest existing path (4-way BFS), and never cuts across water.
 * If no bank road is within reach, it falls back to the open-ground
 * search (planOpenGroundApproach, cap 48) — a bridge ~24 tiles from
 * the worn network keeps an orphan entrance otherwise, and
 * pathConnects(camp, farBank) stays false. If no road is within
 * reach at all, the single bank entrance still joins the bridge and
 * is therefore not an orphan path tile.
 */
export function planBankApproachTiles(
  world: IsoWorld,
  start: { x: number; y: number },
  maxSteps = 12,
): Array<{ x: number; y: number }> {
  if (isPathTile(world, start.x, start.y) || !pathPlaceable(world, start.x, start.y)) return [];
  if (!riverNear(world, start.x, start.y, 1)) return [];
  const startKey = trafficKey(start.x, start.y);
  const previous = new Map<string, string | null>([[startKey, null]]);
  const queue: Array<{ x: number; y: number; distance: number }> = [{ ...start, distance: 0 }];
  let foundPath: string | null = null;
  while (queue.length > 0 && foundPath === null) {
    const current = queue.shift()!;
    if (current.distance >= maxSteps) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = current.x + dx, ny = current.y + dy;
      const key = trafficKey(nx, ny);
      if (previous.has(key) || !inBounds(world, nx, ny) || terrainAt(world, nx, ny) === 'water') continue;
      if (!riverNear(world, nx, ny, 1)) continue;
      previous.set(key, trafficKey(current.x, current.y));
      if (isPathTile(world, nx, ny)) {
        foundPath = key;
        break;
      }
      if (!pathPlaceable(world, nx, ny)) {
        previous.delete(key);
        continue;
      }
      queue.push({ x: nx, y: ny, distance: current.distance + 1 });
    }
  }
  if (foundPath === null) {
    // BUILD 1128 (0x31): no bank route to a path within 12 steps —
    // the bridge sits too far from the worn network (its banks are
    // on the generated dirt road, ~24 tiles from camp). Fall back to
    // an open-ground search for the nearest path tile (cap 48),
    // exploring bank-adjacent tiles first so the road still hugs the
    // bank when a bank route exists. Without this the entrance stays
    // an orphan tile and pathConnects(camp, farBank) stays false.
    const open = planOpenGroundApproach(world, start, 48);
    if (open) return open;
    return [{ ...start }];
  }
  const route: Array<{ x: number; y: number }> = [];
  let cursor: string | null = foundPath;
  while (cursor && cursor !== startKey) {
    const [x, y] = cursor.split(',').map(Number);
    route.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }
  route.reverse();
  // The backtrack deliberately stops before startKey; include the bank
  // entrance itself so the generated approach reaches the bridge deck.
  // Without it, a nearby existing road leaves a one-tile gap at the bank.
  route.unshift({ ...start });
  return route.filter((tile) => !isPathTile(world, tile.x, tile.y));
}

/**
 * BUILD 1128 (0x31): stamp one road tile with a grade, returning the
 * placed item or null. validatePlacement refuses kind 'path' on
 * 'dirt' terrain ("already a path or road") — the generated dirt
 * roads read as roads already — but a bridge entrance or a bank road
 * on generated dirt still needs a placement (its grade, and its seat
 * in the pathConnects graph). Route tiles are already vetted
 * walkable land by the planners, so the fallback direct-stamps only
 * the pure-dirt case (terrain 'dirt' + that exact refusal); every
 * other refusal (water, blocked, standing player/NPC, waypoint)
 * still refuses. MUTATES the world (one placement).
 */
export function stampPathTile(
  world: IsoWorld,
  x: number,
  y: number,
  kind: PathKind,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): PlacedItem | null {
  const result = validatePlacement(world, 'path', x, y, playerTile, npcTiles, 0);
  if (result.ok) {
    const item = { ...result.item, pathKind: kind };
    addPlacement(world, item);
    return item;
  }
  if (result.reason === 'already a path or road' && terrainAt(world, x, y) === 'dirt') {
    const item: PlacedItem = { kind: 'path', x0: x, y0: y, x1: x, y1: y, pathKind: kind };
    addPlacement(world, item);
    return item;
  }
  return null;
}

/** Validate the entire bridge span before mutating the world, then stamp
 * every tile with the same persisted visual profile. A blocked tile means
 * the whole bridge waits; no half-bridge or partial collision is possible. */
export function placeBridgeSpan(
  world: IsoWorld,
  site: BridgeSite,
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
): { ok: true; placed: PlacedItem[]; approachTiles: Array<{ x: number; y: number }> } | { ok: false; reason: string } {
  const span = bridgeSiteSpan(site);
  const nearBank = site.nearBank ?? site.workTile;
  const first = span[0], last = span[span.length - 1];
  const dx = first.x - nearBank.x, dy = first.y - nearBank.y;
  const farBank = { x: last.x + dx, y: last.y + dy };
  const approachTiles = [
    ...planBankApproachTiles(world, nearBank),
    ...planBankApproachTiles(world, farBank),
  ].filter((tile, index, all) =>
    all.findIndex((other) => other.x === tile.x && other.y === tile.y) === index);
  const pathItems: PlacedItem[] = [];
  for (const tile of approachTiles) {
    if (isPathTile(world, tile.x, tile.y)) continue;
    // BUILD 1128 (0x31): the bank entrance itself is paved stone;
    // the rest of the approach is a deliberately stamped road.
    // stampPathTile also paves entrances that sit on the generated
    // dirt road (validatePlacement refuses 'path' on dirt).
    const isEntrance = (tile.x === nearBank.x && tile.y === nearBank.y) || (tile.x === farBank.x && tile.y === farBank.y);
    const item = stampPathTile(world, tile.x, tile.y, isEntrance ? 'stone' : 'road', playerTile, npcTiles);
    if (item) pathItems.push(item);
  }
  const items: PlacedItem[] = [];
  for (const tile of span) {
    const result = validatePlacement(world, 'bridge', tile.x, tile.y, playerTile, npcTiles, 0);
    if (!result.ok) return { ok: false, reason: result.reason };
    items.push(result.item);
  }
  // BUILD 1128 (0x31): a ford under the deck is replaced by the
  // bridge — the deck is the upgrade, and leaving the ford would
  // stack two crossings on one tile. The ford no longer blocks
  // the span (placedBlock skips it); remove it here so the deck
  // is the only crossing on the tile.
  for (const tile of span) {
    const ford = placementsOf(world).find((p) => p.kind === 'ford' && tile.x >= p.x0 && tile.x <= p.x1 && tile.y >= p.y0 && tile.y <= p.y1);
    if (ford) removeExactPlacement(world, ford);
  }
  for (const item of items) addPlacement(world, { ...item, bridgeStyle: site.style ?? 'wooden', bridgeAxis: site.axis ?? 'x' });
  for (const item of pathItems) addPlacement(world, item);
  // BUILD 1128 (0x31): an entrance that is already a worn path keeps
  // its tile but is paved stone — the bridge's front door reads as
  // paved even when founders wore the path there first.
  for (const entrance of [nearBank, farBank]) {
    const existing = placementsOf(world).find((p) => p.kind === 'path' && p.x0 === entrance.x && p.y0 === entrance.y);
    if (existing) existing.pathKind = 'stone';
  }
  return { ok: true, placed: items, approachTiles: pathItems.map((item) => ({ x: item.x0, y: item.y0 })) };
}

/**
 * The tile a builder stands on to build a bridge over (rx, ry):
 * a walkable 4-neighbour, preferring a dirt path tile (the path's
 * end is where the builder already walks), else any walkable
 * neighbour, else the 8-neighbour ring the same way. Null when
 * the river tile is walled in on every side (no bank to stand on).
 * Pure.
 */
/**
 * Score a candidate bridge crossing without changing the persisted
 * BridgeSite shape. A good crossing has a clear opposite bank, road
 * alignment on both sides, and the narrowest practical water span.
 * Higher is better; the deterministic tie-break is west-to-east then
 * north-to-south in the caller.
 */
/** The direction the bridge deck runs across the water. */
export function bridgeAxisForCrossing(
  pathTile: { x: number; y: number },
  riverTile: { x: number; y: number },
): 'x' | 'y' {
  return riverTile.x !== pathTile.x ? 'x' : 'y';
}

/** Consecutive river tiles along the road's crossing axis, capped at six. */
export function bridgeSpanForCrossing(
  world: IsoWorld,
  pathTile: { x: number; y: number },
  riverTile: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const dx = riverTile.x - pathTile.x;
  const dy = riverTile.y - pathTile.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return [{ ...riverTile }];
  const span = [{ ...riverTile }];
  while (span.length < 6) {
    const last = span[span.length - 1];
    const next = { x: last.x + dx, y: last.y + dy };
    if (terrainAt(world, next.x, next.y) !== 'water' || !riverAt(world, next.x, next.y)) break;
    span.push(next);
  }
  return span;
}

/** Choose a distinct, deterministic bridge profile from water width and
 * both-bank access. These are original in-game profiles, not source-game assets. */
export function bridgeStyleForCrossing(
  world: IsoWorld,
  pathTile: { x: number; y: number },
  riverTile: { x: number; y: number },
): BridgeStyle {
  const span = bridgeSpanForCrossing(world, pathTile, riverTile);
  const dx = riverTile.x - pathTile.x, dy = riverTile.y - pathTile.y;
  const farBank = { x: riverTile.x + dx * span.length, y: riverTile.y + dy * span.length };
  const farWalkable = terrainAt(world, farBank.x, farBank.y) !== 'water' &&
    walkableWithPlacements(world, world.crates, farBank.x, farBank.y);
  const farPath = farWalkable && isPathTile(world, farBank.x, farBank.y);
  const effectiveWidth = Math.max(span.length, riverWidthAt(world, riverTile.x, riverTile.y));
  if (effectiveWidth >= 4) return 'wide-river';
  if (effectiveWidth >= 3) return 'large-road';
  if (effectiveWidth === 2) return farPath ? 'stone' : 'wooden';
  if (farPath) return 'wooden';
  if (farWalkable) return 'footbridge';
  return 'narrow-stream';
}

export function scoreBridgeCrossing(
  world: IsoWorld,
  pathTile: { x: number; y: number },
  riverTile: { x: number; y: number },
): number {
  const dx = riverTile.x - pathTile.x;
  const dy = riverTile.y - pathTile.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1 || (riverWidthAt(world, riverTile.x, riverTile.y) <= 0 && !riverAt(world, riverTile.x, riverTile.y))) return -Infinity;
  let score = 10;
  const span = bridgeSpanForCrossing(world, pathTile, riverTile);
  const width = Math.max(span.length, riverWidthAt(world, riverTile.x, riverTile.y));
  score += width <= 1 ? 18 : width === 2 ? 10 : 2;
  const farX = riverTile.x + dx * span.length, farY = riverTile.y + dy * span.length;
  if (terrainAt(world, farX, farY) === 'water' ||
      !walkableWithPlacements(world, world.crates, farX, farY)) return -Infinity;
  score += 24;
  if (isPathTile(world, farX, farY)) score += 80;
  if (isPathTile(world, pathTile.x, pathTile.y)) score += 12;
  return score - Math.max(0, span.length - 1) * 8;
}

function bestBridgeRiverNeighbour(
  world: IsoWorld,
  state: PathState,
  tile: { x: number; y: number },
): { x: number; y: number; score: number } | null {
  const candidates: Array<{ x:number; y:number; score:number }> = [];
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
    const x=tile.x+dx, y=tile.y+dy;
    if (riverWidthAt(world,x,y) <= 0 && !riverAt(world,x,y)) continue;
    const span = bridgeSpanForCrossing(world, tile, { x, y });
    if (bridgeSpanAlreadyClaimed(world, state.bridges, span)) continue;
    if (!bridgeWorkTileFor(world,x,y)) continue;
    const score = scoreBridgeCrossing(world,tile,{x,y});
    if (!Number.isFinite(score)) continue;
    candidates.push({x,y,score});
  }
  candidates.sort((a,b)=>b.score-a.score || a.x-b.x || a.y-b.y);
  return candidates[0] ?? null;
}

export function bridgeWorkTileFor(world: IsoWorld, rx: number, ry: number): { x: number; y: number } | null {
  const ring4 = [
    { x: rx + 1, y: ry },
    { x: rx - 1, y: ry },
    { x: rx, y: ry + 1 },
    { x: rx, y: ry - 1 },
  ];
  const ring8 = [
    { x: rx + 1, y: ry + 1 },
    { x: rx - 1, y: ry + 1 },
    { x: rx + 1, y: ry - 1 },
    { x: rx - 1, y: ry - 1 },
  ];
  for (const ring of [ring4, ring8]) {
    const paths = ring.filter((t) => isPathTile(world, t.x, t.y) && walkableWithPlacements(world, world.crates, t.x, t.y));
    if (paths.length > 0) return { ...paths[0] };
    const walkable = ring.filter((t) => walkableWithPlacements(world, world.crates, t.x, t.y));
    if (walkable.length > 0) return { ...walkable[0] };
  }
  return null;
}

/**
 * Open a bridge site where a dirt path meets a river: the river
 * tile 4-adjacent to `tile` with no bridge and no site yet gets a
 * site (the builder's bank tile is picked now). MUTATES
 * state.bridges (the tick owns the state). Returns the new site,
 * or null when the path meets no river, the day gate is closed,
 * or every neighbouring river tile is already bridged or walled
 * in. The caller runs the day gate's scan for older paths.
 */
export function detectBridgeSite(
  world: IsoWorld,
  state: PathState,
  tile: { x: number; y: number },
  day: number,
): BridgeSite | null {
  if (day < BRIDGE_START_DAY) return null;
  const candidate = bestBridgeRiverNeighbour(world, state, tile);
  if (!candidate) return null;
  const workTile = bridgeWorkTileFor(world, candidate.x, candidate.y);
  if (!workTile) return null;
  const spanTiles = bridgeSpanForCrossing(world, tile, { x: candidate.x, y: candidate.y });
  const style = bridgeStyleForCrossing(world, tile, { x: candidate.x, y: candidate.y });
  const site = freshBridgeSite(candidate.x, candidate.y, workTile, spanTiles, style, bridgeAxisForCrossing(tile, { x: candidate.x, y: candidate.y }), tile);
  state.bridges = [...state.bridges, site];
  return site;
}

/** The run of river tiles a road must span starting at (x, y):
 *  walk the river's own tiles perpendicular to its flow until
 *  land — the bridge's span. Ported from the 1113 crossing loop
 *  (BUILD 1127 fix 6, parent takeover): the 1126 scan reads only
 *  dirt-path tiles, and live paths cap at 250 near-camp tiles
 *  before any river-contact tile wears into a path — so the scan
 *  must also read the river geometry itself. Runs are capped at
 *  six tiles (the 1126 span cap in bridgeSpanForCrossing). Null
 *  when the tile is not river, the run is too long (a river
 *  flowing ALONG the road, not across it), or either end bank is
 *  not land. Pure. */
export type CrossingRun = {
  /** The river's tiles in crossing order. */
  tiles: Array<{ x: number; y: number }>;
  axis: 'x' | 'y';
  bankA: { x: number; y: number };
  bankB: { x: number; y: number };
  river: River;
};

export function crossingRunFor(world: IsoWorld, x: number, y: number): CrossingRun | null {
  const found = riverAt(world, x, y);
  if (!found) return null;
  const river = found.river;
  const isWater = (tx: number, ty: number): boolean => !!riverAt(world, tx, ty);
  const isLand = (tx: number, ty: number): boolean =>
    inBounds(world, tx, ty) && !isWater(tx, ty) && terrainAt(world, tx, ty) !== 'water';
  const runAlong = (axis: 'x' | 'y'): CrossingRun | null => {
    const d = axis === 'x' ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
    const tiles: Array<{ x: number; y: number }> = [{ x, y }];
    for (const dir of [1, -1] as const) {
      let cx = x, cy = y;
      for (let step = 0; step < 6; step++) {
        cx += d.dx * dir;
        cy += d.dy * dir;
        if (!isWater(cx, cy)) break;
        if (dir === 1) tiles.push({ x: cx, y: cy });
        else tiles.unshift({ x: cx, y: cy });
        if (tiles.length > 6) return null;
      }
    }
    const first = tiles[0];
    const last = tiles[tiles.length - 1];
    const bankA = { x: first.x - d.dx, y: first.y - d.dy };
    const bankB = { x: last.x + d.dx, y: last.y + d.dy };
    if (!isLand(bankA.x, bankA.y) || !isLand(bankB.x, bankB.y)) return null;
    return { tiles, axis, bankA, bankB, river };
  };
  const fx = found.tile.dx ?? 0;
  const fy = found.tile.dy ?? 0;
  const axes: Array<'x' | 'y'> = [];
  if (fx !== 0) axes.push('y');
  if (fy !== 0) axes.push('x');
  if (axes.length === 0) axes.push('x', 'y');
  let best: CrossingRun | null = null;
  for (const axis of axes) {
    const run = runAlong(axis);
    if (run && (!best || run.tiles.length < best.tiles.length)) best = run;
  }
  return best;
}

/** True when a bank tile continues a road: generated dirt, or a
 *  placed dirt path. Pure. */
export function bankContinuesRoad(world: IsoWorld, x: number, y: number): boolean {
  if (!inBounds(world, x, y)) return false;
  if (terrainAt(world, x, y) === 'dirt') return true;
  return isPathTile(world, x, y);
}

/**
 * Score a crossing for building (higher = better): narrow beats
 * wide (20 per extra span tile), low-order streams beat mains
 * (10 per extra order), a road continuing on either bank is worth
 * 25 (the bridge joins an existing route), and the nearer bank
 * costs a quarter point per tile of Manhattan distance from camp
 * (the founders build near home first). Null when either bank
 * is not walkable — a bridge to a walled-in bank is never scored.
 * Pure.
 */
export function scoreCrossing(world: IsoWorld, run: CrossingRun): number | null {
  const walkA = walkableWithPlacements(world, world.crates, run.bankA.x, run.bankA.y);
  const walkB = walkableWithPlacements(world, world.crates, run.bankB.x, run.bankB.y);
  if (!walkA || !walkB) return null;
  const span = run.tiles.length;
  const order = run.river.order ?? 1;
  const aligned =
    bankContinuesRoad(world, run.bankA.x, run.bankA.y) || bankContinuesRoad(world, run.bankB.x, run.bankB.y) ? 25 : 0;
  const distA = Math.abs(run.bankA.x - FOUNDER_CAMP.x) + Math.abs(run.bankA.y - FOUNDER_CAMP.y);
  const distB = Math.abs(run.bankB.x - FOUNDER_CAMP.x) + Math.abs(run.bankB.y - FOUNDER_CAMP.y);
  const dist = Math.round(0.25 * Math.min(distA, distB));
  return 100 - 20 * (span - 1) - 10 * (order - 1) + aligned - dist;
}

/**
 * Every scored road/river crossing in the world, best-first:
 * each v2 river's recorded road crossings (allRoadCrossings),
 * expanded to their runs and scored. Crossings that cannot be
 * scored (a walled-in bank) or cannot be spanned (a run longer
 * than the cap) are skipped. Pure (reads only).
 */
export function listCrossings(world: IsoWorld): Array<{ run: CrossingRun; score: number }> {
  const out: Array<{ run: CrossingRun; score: number }> = [];
  const seen = new Set<string>();
  for (const c of allRoadCrossings(world)) {
    const run = crossingRunFor(world, c.x, c.y);
    if (!run) continue;
    const key = run.tiles.map((t) => t.x + ',' + t.y).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const score = scoreCrossing(world, run);
    if (score === null) continue;
    out.push({ run, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * The intersection-driven fallback: score every road/river
 * crossing the world records (allRoadCrossings — the v2 rivers'
 * road intersections, best-first) and open the best-scoring one
 * that is not already bridged or sited and whose camp-side bank
 * a founder can walk to. One site per call (the day's bridge —
 * the scan runs once a day). Unlike the 1113 chain builder, the
 * 1126 BridgeSite carries the whole span in one site (spanTiles),
 * so one site per crossing is enough — no dependsOn chain.
 * MUTATES state.bridges. Returns the new site, or [] when no
 * crossing qualifies.
 */
export function detectCrossingSites(world: IsoWorld, state: PathState, day: number): BridgeSite[] {
  if (day < BRIDGE_START_DAY) return [];
  const scored = listCrossings(world);
  for (const { run, score } of scored) {
    if (score <= 0) continue;
    if (run.tiles.some((t) => bridgePlacementExists(world, t.x, t.y) || bridgeSiteAt(state.bridges, t.x, t.y))) continue;
    const distA = Math.abs(run.bankA.x - FOUNDER_CAMP.x) + Math.abs(run.bankA.y - FOUNDER_CAMP.y);
    const distB = Math.abs(run.bankB.x - FOUNDER_CAMP.x) + Math.abs(run.bankB.y - FOUNDER_CAMP.y);
    const campBank = distA <= distB ? run.bankA : run.bankB;
    // BUILD 1127 fix 5 (port of 1113): a crossing whose camp-side
    // bank no founder can walk to is unbuildable — skip it and let
    // the next scored crossing win the day.
    if (!tileReachableFromCamp(world, campBank.x, campBank.y)) continue;
    const ordered = distA <= distB ? run.tiles : [...run.tiles].reverse();
    const first = ordered[0];
    if (bridgeSpanAlreadyClaimed(world, state.bridges, ordered)) continue;
    const style = bridgeStyleForCrossing(world, campBank, first);
    const site = freshBridgeSite(first.x, first.y, campBank, ordered, style, bridgeAxisForCrossing(campBank, first), campBank);
    state.bridges = [...state.bridges, site];
    return [site];
  }
  return [];
}

/**
 * The once-a-day bridge scan: every dirt path tile is checked for
 * a river neighbour (the paths laid before the day gate opened
 * never had a detection event — the arrival corridor's river
 * crossing is laid on day 1–2, the bridge may only start on day
 * 3). MUTATES state.bridges + state.lastBridgeScanDay. Returns the
 * new sites. The river set is built once per scan, so the scan
 * stays a Set lookup per neighbour instead of a river-course scan
 * per tile. Call at most once per day (the tick gates on
 * lastBridgeScanDay).
 */
export function scanForBridgeSites(world: IsoWorld, state: PathState, day: number): BridgeSite[] {
  const found: BridgeSite[] = [];
  if (day < BRIDGE_START_DAY || day <= state.lastBridgeScanDay) return found;
  // BUILD 1128 (0x31): land the deck of any ready bridge before
  // detecting new sites (see finishReadyBridges — a ready site
  // strands when its builder drops the job after a failed
  // placement). The scan is the daily planning pass in both ticks.
  state.bridges = finishReadyBridges(world, state.bridges);
  const rivers = new Set<string>();
  // BUILD 1113: river v2 stores the centreline separately from
  // widthTiles. A bridge scan that reads only r.tiles silently
  // misses the shallow shoulder water, leaving a one-tile-wide
  // gap in otherwise detected crossings. Include every stamped
  // water tile; riverAt/terrainAt below still reject stale stamps.
  for (const raw of world.rivers ?? []) {
    const river = raw as unknown as { tiles?: Array<{ x: number; y: number }>; widthTiles?: Array<{ x: number; y: number }> };
    for (const t of river.tiles ?? []) rivers.add(t.x + ',' + t.y);
    for (const t of river.widthTiles ?? []) rivers.add(t.x + ',' + t.y);
  }
  for (const tile of pathTiles(world)) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = tile.x + dx, ny = tile.y + dy;
      if (!rivers.has(nx + ',' + ny)) continue;
      if (terrainAt(world, nx, ny) !== 'water') continue;
      const spanTiles = bridgeSpanForCrossing(world, tile, { x: nx, y: ny });
      if (bridgeSpanAlreadyClaimed(world, state.bridges, spanTiles) ||
          found.some((site) => bridgeSiteSpan(site).some((existing) => spanTiles.some((candidate) => candidate.x === existing.x && candidate.y === existing.y)))) continue;
      const workTile = bridgeWorkTileFor(world, nx, ny);
      if (!workTile) continue;
      // Rank sites using the same bank/width/road-alignment score as
      // event-driven detection. Each physical span can be claimed only once.
      const score = scoreBridgeCrossing(world, tile, { x: nx, y: ny });
      if (!Number.isFinite(score)) continue;
      const style = bridgeStyleForCrossing(world, tile, { x: nx, y: ny });
      found.push(Object.assign(freshBridgeSite(nx, ny, workTile, spanTiles, style, bridgeAxisForCrossing(tile, { x: nx, y: ny }), tile), { _candidateScore: score } as object));
    }
  }
  if (found.length > 0) {
    found.sort((a,b) => ((b as BridgeSite & { _candidateScore?: number })._candidateScore ?? 0) - ((a as BridgeSite & { _candidateScore?: number })._candidateScore ?? 0) || a.x-b.x || a.y-b.y);
    // One site per daily scan: commit only the highest-scoring crossing.
    // This prevents a single scan from opening every road/riverside
    // contact at once, while preserving deterministic tie-breaking.
    // Strip the transient score before it enters the saved BridgeSite list.
    // BUILD 1127 fix 5 (port of 1113): the best-scored crossing may sit
    // on a land spur no builder can walk to (the v2 rivers braid around
    // spurs — in 1113 the scan opened the sealed southern chain two days
    // running while reachable crossings waited). Walk the scored list
    // until a crossing whose work tile is reachable from camp is found;
    // the one-site-per-day contract is unchanged.
    const reachable = found.find((site) => tileReachableFromCamp(world, site.workTile.x, site.workTile.y));
    if (reachable) {
      const { _candidateScore: _score, ...site } = reachable as BridgeSite & { _candidateScore?: number };
      state.bridges = [...state.bridges, site];
      state.lastBridgeScanDay = day;
      return [site];
    }
  }
  // BUILD 1127 fix 6 (parent takeover): the path loop finds nothing in
  // live play — PATH_MAX_TILES fills with near-camp tiles before any
  // river-contact tile wears into a path. Fall back to the
  // intersection-driven crossing loop (road/river geometry, not
  // traffic): one site per day, same contract as the path loop.
  const crossed = detectCrossingSites(world, state, day);
  if (crossed.length > 0) {
    state.lastBridgeScanDay = day;
    return crossed;
  }
  state.lastBridgeScanDay = day;
  return [];
}

// --- BUILD 1093 (0x1C Phase 3.2): the bridge goes up in the
// same stages as a hut (foundation -> frame -> finished), through
// the same stage path in construction.ts. The bridge's stage plan
// is 2 steps of 2 wood: foundation (1 step, 2 wood), frame (1
// step, 2 wood), finished (0 steps, 0 wood — complete the moment
// the frame is done). A half-built bridge is unusable: its
// placement (the walkable crossing) lands only when the bridge
// is done (isBridgeUsable). ---

/** The bridge's stage plan (from its catalogue entry's materials: 4 wood). Pure. */
export function bridgeStagePlan(): StagePlan {
  return stagePlanFor(BRIDGE_WORK_STEPS, [{ resource: 'wood', qty: BRIDGE_COST_WOOD }]);
}

/** True when a bridge is usable: the state is 'done' and every
 *  stage is complete. A half-built bridge cannot be crossed.
 *  Pure. */
export function isBridgeUsable(site: BridgeSite): boolean {
  if (site.state !== 'done') return false;
  const split = stageStepSplit(BRIDGE_WORK_STEPS);
  const steps = stageProgressOf(site, BRIDGE_WORK_STEPS);
  return steps.foundation >= split.foundation && steps.frame >= split.frame && steps.finished >= split.finished;
}

/**
 * Complete one work step on a SPECIFIC stage of a bridge, from
 * the registry's camp store: 2 wood leave the pile, that stage's
 * progress rises by 1 (and the total with it). The stage must be
 * open (its predecessor has started) and incomplete — a locked
 * or finished stage spends nothing. The parallel-work primitive
 * (the hut's spendBuildStageStepFromRegistry, for a bridge).
 * Pure.
 */
export function spendBridgeStageStepFromRegistry(
  registry: ResourceRegistry,
  bridges: readonly BridgeSite[],
  siteId: string,
  stageId: BuildStageId,
): { registry: ResourceRegistry; bridges: BridgeSite[]; site: BridgeSite | null; completed: boolean; stageCompleted: boolean; spent: boolean } {
  const site = bridgeSiteById(bridges, siteId);
  if (!site) return { registry, bridges: [...bridges], site: null, completed: false, stageCompleted: false, spent: false };
  const split = stageStepSplit(BRIDGE_WORK_STEPS);
  const stages = stageProgressOf(site, BRIDGE_WORK_STEPS);
  if (site.state === 'done' || site.progress >= BRIDGE_WORK_STEPS || stages[stageId] >= split[stageId] || !isStageOpen(site, BRIDGE_WORK_STEPS, stageId)) {
    return { registry, bridges: [...bridges], site, completed: site.progress >= BRIDGE_WORK_STEPS, stageCompleted: stages[stageId] >= split[stageId], spent: false };
  }
  if (storeQty(registry, CAMP_STORE_ID, 'wood') < BRIDGE_WOOD_PER_STEP) {
    return { registry, bridges: [...bridges], site, completed: false, stageCompleted: false, spent: false };
  }
  const w = withdrawFrom(registry, CAMP_STORE_ID, 'wood', BRIDGE_WOOD_PER_STEP);
  if (w.taken < BRIDGE_WOOD_PER_STEP) {
    return { registry, bridges: [...bridges], site, completed: false, stageCompleted: false, spent: false };
  }
  const nextStages: StageSteps = { ...stages, [stageId]: stages[stageId] + 1 };
  const progress = site.progress + 1;
  const completed = progress >= BRIDGE_WORK_STEPS;
  const stageCompleted = nextStages[stageId] >= split[stageId];
  const next: BridgeSite = {
    ...site,
    state: 'building',
    progress,
    spentWood: site.spentWood + BRIDGE_WOOD_PER_STEP,
    stages: nextStages,
  };
  return {
    registry: w.registry,
    bridges: bridges.map((s) => (s.id === siteId ? next : s)),
    site: next,
    completed,
    stageCompleted,
    spent: true,
  };
}

/** A bridge site at full progress whose placement has not landed
 *  yet (the tile was occupied when the last step completed). The
 *  step spend on such a site returns completed without spending
 *  wood, so the placement retry is free — the storehouse's
 *  ready-site rule, same shape. Pure. */
export function bridgeReadyForPlacement(site: BridgeSite): boolean {
  return site.state === 'building' && site.progress >= BRIDGE_WORK_STEPS;
}

/**
 * BUILD 1128 (0x31): finish every ready bridge site whose deck can
 * land. A site reaches full progress (2 steps, 4 wood spent) but its
 * placement lands only when the founder's completion attempt
 * succeeds — if a founder is standing on the span that tick (a ford
 * makes span tiles occupiable, so this now happens) the placement
 * fails and the builder waits; if the builder then drops the job on
 * a needs flip, no founder comes back — the far site loses the
 * scorer's competition to nearby work and the ready bridge strands
 * at p2 forever (the §12 day-6 sim: bridge-128-170 stuck p2, 0
 * done; the §13/§14 sims fail the same way). The daily scan is the
 * settlement's planning pass and runs in both ticks, so it lands
 * ready decks itself: the work is already paid for, the deck just
 * needs placing. Called with no NPC tiles — a founder wading a ford
 * under the deck ends up standing on it, which is harmless. A
 * genuinely blocked span (placed water) stays ready and retries
 * tomorrow. Mutates the world (placements only). Returns the same
 * array when nothing changed. */
export function finishReadyBridges(world: IsoWorld, bridges: readonly BridgeSite[]): BridgeSite[] {
  let next = [...bridges];
  let changed = false;
  for (const site of bridges) {
    if (!bridgeReadyForPlacement(site)) continue;
    const placed = placeBridgeSpan(world, site, { x: 0, y: 0 }, []);
    if (!placed.ok) continue;
    next = finishBridge(next, site.id);
    changed = true;
  }
  return changed ? next : [...bridges];
}

/** True when a bridge may be STARTED: the settlement is old
 *  enough, housing + storage are done (bridges third), and a
 *  step's wood is on hand in the camp pile. The day + housing
 *  gates are what keep bridges out of the 24h window. Pure. */
export function canStartBridge(
  site: BridgeSite,
  day: number,
  hutsDone: boolean,
  storehouseDone: boolean,
  campWood: number,
): boolean {
  return (
    bridgeReadyForPlacement(site) ||
    (site.state !== 'done' &&
      site.progress < BRIDGE_WORK_STEPS &&
      day >= BRIDGE_START_DAY &&
      hutsDone &&
      storehouseDone &&
      campWood >= BRIDGE_WOOD_PER_STEP)
  );
}

/** True when a founder may start (or continue) building the
 *  bridge: it is unfinished and the camp pile holds a step's
 *  wood. The day/housing gates live in canStartBridge (the claim
 *  site); this is the per-step gate (the hut's canBuild shape).
 *  Pure. */
export function canBuildBridge(site: BridgeSite, campWood: number): boolean {
  return (
    bridgeReadyForPlacement(site) ||
    (site.state !== 'done' && site.progress < BRIDGE_WORK_STEPS && campWood >= BRIDGE_WOOD_PER_STEP)
  );
}

/**
 * Complete one work step on a bridge from the registry's camp
 * store: 2 wood leave the pile, the progress rises by 1. At the
 * last step the bridge is READY (progress 2) but the state stays
 * 'building' — the caller flips it to 'done' only when the
 * placement actually lands (finishBridge), the same ready/done
 * split as the hut and the storehouse. With too little wood, or
 * when the bridge is already ready, nothing happens and nothing
 * is withdrawn. Pure.
 */
export function spendBridgeStepFromRegistry(
  registry: ResourceRegistry,
  bridges: readonly BridgeSite[],
  siteId: string,
): { registry: ResourceRegistry; bridges: BridgeSite[]; site: BridgeSite | null; completed: boolean; spent: boolean } {
  const site = bridgeSiteById(bridges, siteId);
  if (!site) return { registry, bridges: [...bridges], site: null, completed: false, spent: false };
  if (site.state === 'done' || site.progress >= BRIDGE_WORK_STEPS) {
    return { registry, bridges: [...bridges], site, completed: site.progress >= BRIDGE_WORK_STEPS, spent: false };
  }
  // BUILD 1127 fix 3 (port of 1113): the step draws from the camp
  // pile AND the storehouse, camp first (the metalChain.ts
  // withdrawChainWood pattern). Once the storehouse is done the
  // founders deliver all wood to the storehouse store, so the camp
  // pile sits at 0 and a camp-only spend could never fire.
  const totalWood = storeQty(registry, CAMP_STORE_ID, 'wood') + storeQty(registry, STOREHOUSE_STORE_ID, 'wood');
  if (totalWood < BRIDGE_WOOD_PER_STEP) {
    return { registry, bridges: [...bridges], site, completed: false, spent: false };
  }
  let remaining = BRIDGE_WOOD_PER_STEP;
  let spentRegistry = registry;
  const campDraw = withdrawFrom(spentRegistry, CAMP_STORE_ID, 'wood', remaining);
  remaining -= campDraw.taken;
  spentRegistry = campDraw.registry;
  if (remaining > 0) {
    const storeDraw = withdrawFrom(spentRegistry, STOREHOUSE_STORE_ID, 'wood', remaining);
    remaining -= storeDraw.taken;
    spentRegistry = storeDraw.registry;
  }
  if (remaining > 0) {
    // Cannot happen (the guard above read both stores), but a
    // partial withdrawal must never become a partial step.
    return { registry, bridges: [...bridges], site, completed: false, spent: false };
  }
  const progress = site.progress + 1;
  const completed = progress >= BRIDGE_WORK_STEPS;
  // BUILD 1093: the step lands on the first incomplete stage
  // (foundation -> frame), so the stage progress is tracked
  // alongside the total. A single builder works the stages in
  // order — the same steps, wood, and ticks as before.
  const cur = currentStageFor(site, BRIDGE_WORK_STEPS);
  const stages = stageProgressOf(site, BRIDGE_WORK_STEPS);
  const nextStages: StageSteps = cur ? { ...stages, [cur.id]: stages[cur.id] + 1 } : stages;
  const next: BridgeSite = {
    ...site,
    state: 'building',
    progress,
    spentWood: site.spentWood + BRIDGE_WOOD_PER_STEP,
    stages: nextStages,
  };
  return {
    registry: spentRegistry,
    bridges: bridges.map((s) => (s.id === siteId ? next : s)),
    site: next,
    completed,
    spent: true,
  };
}

/** Flip a ready bridge (progress 2) to 'done' once its placement
 *  has actually landed. Pure. */
export function finishBridge(bridges: readonly BridgeSite[], siteId: string): BridgeSite[] {
  return bridges.map((s) =>
    s.id === siteId ? { ...s, state: 'done' as BridgeSiteStateKind, progress: BRIDGE_WORK_STEPS, spentWood: BRIDGE_COST_WOOD, stages: { ...stageStepSplit(BRIDGE_WORK_STEPS) } } : s,
  );
}

/**
 * Reconcile the bridge sites against the world (a 'done' bridge
 * whose placement is gone rebuilds from the pile; a 'building'
 * site with a placement present is done). Returns the same array
 * when nothing changed. Pure.
 */
export function reconcileBridges(bridges: readonly BridgeSite[], world: IsoWorld): BridgeSite[] {
  let changed = false;
  const next = bridges.map((s) => {
    const placed = bridgeSitePlacementExists(world, s);
    if (s.state === 'done' && !placed) {
      changed = true;
      return { ...s, state: 'none' as BridgeSiteStateKind, progress: 0, spentWood: 0, stages: { ...ZERO_STAGE_STEPS } };
    }
    if (s.state === 'building' && placed) {
      changed = true;
      return { ...s, state: 'done' as BridgeSiteStateKind, progress: BRIDGE_WORK_STEPS, spentWood: BRIDGE_COST_WOOD, stages: { ...stageStepSplit(BRIDGE_WORK_STEPS) } };
    }
    return s;
  });
  return changed ? next : [...bridges];
}

/**
 * The bridge the scorer builds: the nearest site a founder may
 * start (day + housing + storage gates + a step's wood on hand),
 * with its distance from `pos` (Manhattan to the bank tile the
 * builder stands on). Null when no bridge is buildable — the
 * build score's bridge branch stays off, so old scores are
 * unchanged. Pure.
 */
export function bridgeBuildContext(
  bridges: readonly BridgeSite[],
  pos: { x: number; y: number },
  day: number,
  hutsDone: boolean,
  storehouseDone: boolean,
  campWood: number,
): { dist: number; ready: boolean } | null {
  let best: { dist: number; ready: boolean } | null = null;
  for (const site of bridges) {
    if (!canStartBridge(site, day, hutsDone, storehouseDone, campWood)) continue;
    const dist = Math.abs(site.workTile.x - pos.x) + Math.abs(site.workTile.y - pos.y);
    if (!best || dist < best.dist) best = { dist, ready: true };
  }
  return best;
}

/** The bridge's HUD label ('—' / 'building 1/2' / 'done'). Pure. */
export function bridgeLabel(site: BridgeSite): string {
  if (site.state === 'done') return 'done';
  if (site.state === 'building') return 'building ' + site.progress + '/' + BRIDGE_WORK_STEPS;
  return '—';
}
