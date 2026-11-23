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
import { terrainAt, inBounds, type IsoWorld } from '../iso/isoWorld';
import { walkableWithPlacements, placementsOf, addPlacement } from './placements';
import { riverAt, riverWidthAt } from './rivers';
import { CAMP_STORE_ID, storeQty, withdrawFrom, type ResourceRegistry } from './resourceRegistry';
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
export type BridgeSiteStateKind = 'none' | 'building' | 'done';
export type BridgeSite = {
  /** Stable id ('bridge-<x>-<y>') — the build job's target. */
  id: string;
  /** The river tile the bridge spans. */
  x: number;
  y: number;
  /** The walkable bank tile the builder stands on. */
  workTile: { x: number; y: number };
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
export function freshBridgeSite(x: number, y: number, workTile: { x: number; y: number }): BridgeSite {
  return { id: bridgeSiteIdFor(x, y), x, y, workTile: { ...workTile }, state: 'none', progress: 0, spentWood: 0, stages: { ...ZERO_STAGE_STEPS } };
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
  return { id: bridgeSiteIdFor(x, y), x, y, workTile: { x: wx, y: wy }, state, progress, spentWood, stages };
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

// --- Bridges ---

/** True when a bridge placement spans the river tile. */
export function bridgePlacementExists(world: IsoWorld, x: number, y: number): boolean {
  return placementsOf(world).some((p) => p.kind === 'bridge' && x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
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
export function scoreBridgeCrossing(
  world: IsoWorld,
  pathTile: { x: number; y: number },
  riverTile: { x: number; y: number },
): number {
  const dx = riverTile.x - pathTile.x;
  const dy = riverTile.y - pathTile.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1 || !riverAt(world, riverTile.x, riverTile.y)) return -Infinity;
  let score = 10;
  const width = riverWidthAt(world, riverTile.x, riverTile.y);
  score += width <= 1 ? 18 : width === 2 ? 10 : 2;
  // Follow the crossing axis through the complete water strip to find
  // the far bank. A matching path there is the strongest evidence that
  // this is a real road crossing rather than a path ending at water.
  let farX = riverTile.x + dx, farY = riverTile.y + dy;
  let span = 1;
  while (span < 6 && terrainAt(world, farX, farY) === 'water') {
    farX += dx; farY += dy; span++;
  }
  if (terrainAt(world, farX, farY) !== 'water' &&
      walkableWithPlacements(world, world.crates, farX, farY)) {
    score += 24;
    if (isPathTile(world, farX, farY)) score += 80;
  } else {
    score -= 30;
  }
  // A straight approach is preferable to a diagonal/side-bank access.
  const nearBank = { x: pathTile.x, y: pathTile.y };
  if (isPathTile(world, nearBank.x, nearBank.y)) score += 12;
  return score - Math.max(0, span - 1) * 8;
}

function bestBridgeRiverNeighbour(
  world: IsoWorld,
  state: PathState,
  tile: { x: number; y: number },
): { x: number; y: number; score: number } | null {
  const candidates: Array<{ x:number; y:number; score:number }> = [];
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
    const x=tile.x+dx, y=tile.y+dy;
    if (!riverAt(world,x,y) || bridgePlacementExists(world,x,y) || bridgeSiteAt(state.bridges,x,y)) continue;
    if (!bridgeWorkTileFor(world,x,y)) continue;
    candidates.push({x,y,score:scoreBridgeCrossing(world,tile,{x,y})});
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
  const site = freshBridgeSite(candidate.x, candidate.y, workTile);
  state.bridges = [...state.bridges, site];
  return site;
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
  if (day < BRIDGE_START_DAY) return found;
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
      if (bridgePlacementExists(world, nx, ny)) continue;
      if (bridgeSiteAt(state.bridges, nx, ny) || found.some((s) => s.x === nx && s.y === ny)) continue;
      const workTile = bridgeWorkTileFor(world, nx, ny);
      if (!workTile) continue;
      // Rank sites using the same bank/width/road-alignment score as
      // event-driven detection. Existing save/state shape is unchanged.
      const score = scoreBridgeCrossing(world, tile, { x: nx, y: ny });
      found.push(Object.assign(freshBridgeSite(nx, ny, workTile), { _candidateScore: score } as object));
    }
  }
  if (found.length > 0) {
    found.sort((a,b) => ((b as BridgeSite & { _candidateScore?: number })._candidateScore ?? 0) - ((a as BridgeSite & { _candidateScore?: number })._candidateScore ?? 0) || a.x-b.x || a.y-b.y);
    // Strip the transient ranking value before it can enter the persisted
    // BridgeSite list; the versioned save schema remains byte-compatible.
    state.bridges = [...state.bridges, ...found.map(({ ...site }) => {
      delete (site as BridgeSite & { _candidateScore?: number })._candidateScore;
      return site;
    })];
  }
  state.lastBridgeScanDay = day;
  return found;
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
  if (storeQty(registry, CAMP_STORE_ID, 'wood') < BRIDGE_WOOD_PER_STEP) {
    return { registry, bridges: [...bridges], site, completed: false, spent: false };
  }
  const w = withdrawFrom(registry, CAMP_STORE_ID, 'wood', BRIDGE_WOOD_PER_STEP);
  if (w.taken < BRIDGE_WOOD_PER_STEP) {
    // Cannot happen (the guard above read the same store), but a
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
    registry: w.registry,
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
    const placed = bridgePlacementExists(world, s.x, s.y);
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
