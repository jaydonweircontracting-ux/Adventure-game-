// worldStudio.ts — BUILD 1133 (NEURON HEX 0x34): World Studio editing
// tools for the 3D world.
//
// STAGE 6 of the river overhaul. The Build panel already places single
// items (bridge / ford / dock / stepping stone / embankment / path) one
// tap at a time; this module is the stroke-based editor on top of it:
// draw a river, widen or narrow one, harden a bank, span a whole
// crossing with a bridge, draw a path that connects itself to the
// nearest bridge. Every tool is preview-then-apply: previewStudioEdit
// is PURE (it reads the world and reports exactly what would change,
// and nothing else), applyStudioEdit mutates through the SAME
// validators the catalog uses, and the caller (the view) does the
// commitWorld + save + one undo entry, like every other Build change.
//
// What is reused, not duplicated:
// - river rules: rivers.ts (riverTileRefusal shares the generator's
//   exclusion set — camp disc, hut margin, mine corridor, occupied,
//   farms, deposits — so a hand-drawn river can never cut the
//   settlement the generator routes around; width tiles follow the
//   1117 bank-side rule).
// - bridge spans: paths.ts (crossingRunFor / bridgeSpanForCrossing /
//   bridgeStyleForCrossing / placeBridgeSpan — the atomic whole-span
//   stamp with stone-paved entrances and approach roads).
// - path stamping + auto-connect: paths.ts (stampPathTile /
//   extendPathToCrossing — the bank-road + ford grower the founder
//   tick already runs after traffic paths).
// - placements: placements.ts (validatePlacement / addPlacement /
//   removeExactPlacement — the catalog's own rules, so a studio
//   bridge refuses exactly where a catalog bridge refuses).
//
// A drawn river is a real River on world.rivers (id `river:studio-N`)
// with its tiles stamped as 'water' terrain, so riverAt / Examine /
// flow chevrons / walkability / maps / founder bridge detection all
// read it through the existing water path — no second water system.
// stampRivers never re-derives a stamped world, so a studio river
// survives reloads exactly like a generated one (saveWorld serializes
// world.rivers wholesale). A drawn river that crosses the authored
// dirt roads records roadCrossings, so the founders can bridge it.
//
// The sim never calls this module: studio edits are player actions
// only (UI + probe hooks). An untouched world simulates exactly as
// before — the M1069 24h pins must stay IDENTICAL.
import { inBounds, terrainAt, terrainKey, type IsoWorld, type PlacedItem } from '../iso/isoWorld';
import { oceanAt } from '../iso/isoWorld';
import {
  bankAt, riverTileRefusal, isWaterTile, riverNear,
  RIVER_MAX_WIDTH, ROAD_BAND_X, ROAD_BAND_Y,
  type River, type RiverTile,
} from './rivers';
import { wildLakeAt, POND_RECT } from './wildTerrain';
import {
  validatePlacement, addPlacement, removeExactPlacement,
  placementsOf, isPlacedBridge, isPlacedEmbankment, isPlacedFord,
  type UndoEntry,
} from './placements';
import {
  crossingRunFor, bridgeStyleForCrossing, scoreCrossing, listCrossings,
  placeBridgeSpan, stampPathTile, extendPathToCrossing, freshBridgeSite,
  freshPathState, isPathTile,
  type BridgeStyle, type PathState, type CrossingRun,
} from './paths';

export type StudioTool = 'river' | 'widen' | 'narrow' | 'bank' | 'bridge' | 'path';

export interface StudioTile { x: number; y: number }

export interface StudioPreview {
  tool: StudioTool;
  /** Tiles that WILL change when applied (green in the preview). */
  tiles: StudioTile[];
  /** Tiles refused, with the reason (red in the preview). */
  rejected: Array<StudioTile & { reason: string }>;
  /** One-line human summary for the panel. */
  summary: string;
  /** River draw: the width the stroke will be stamped at. */
  width?: number;
  /** River draw: true when the stroke touches existing water. */
  reachesWater?: boolean;
  /** River draw: the centreline + width tiles as full RiverTile
   *  objects (flow + shallow/width flags) — the apply stamps
   *  these, it never re-derives them from `tiles`. */
  centreline?: RiverTile[];
  widthTiles?: RiverTile[];
  /** River draw: where the river ends + which authored roads it
   *  crosses + the lake/pond it springs from, if any. */
  mouth?: { x: number; y: number };
  roadCrossings?: Array<{ x: number; y: number }>;
  sourceLake?: { x: number; y: number };
  /** The river a widen/narrow stroke edits. */
  riverId?: string;
  bridge?: {
    action: 'place' | 'remove';
    span: StudioTile[];
    style: BridgeStyle;
    axis: 'x' | 'y';
    score: number | null;
  };
  bank?: { action: 'harden' | 'remove' };
  /** Auto-connect route the apply will stamp: the bridge route
   *  when a bridge is in reach, else the founder grower may ford
   *  on the spot instead (the apply prefers the bridge). */
  connector?: StudioTile[];
}

export interface StudioPreviewOpts {
  /** River draw width (1/2/3). Default 1. */
  width?: number;
  /** Bridge style to stamp; null/undefined = auto from the crossing. */
  bridgeStyle?: BridgeStyle | null;
  playerTile: { x: number; y: number };
  npcTiles: Array<{ x: number; y: number }>;
  /** Path auto-connect targets (founder bridge sites). The view
   *  passes pathsRef.current; asserts pass a fresh state. */
  paths?: PathState | null;
}

export interface StudioApplyResult {
  ok: boolean;
  message: string;
  /** One undo entry for the whole apply (null when nothing changed). */
  undo: UndoEntry | null;
  /** Tiles the apply changed (river/path/bridge/embankment). */
  applied: StudioTile[];
  /** Connector tiles the apply stamped (path tool). */
  connected: StudioTile[];
}

function key(x: number, y: number): string {
  return x + ',' + y;
}

/** world.rivers as the v2 River type (same cast rivers.ts uses —
 *  the IsoWorld inline type predates the v2 fields). */
function riversOf(world: IsoWorld): River[] {
  return (world.rivers ?? []) as unknown as River[];
}

function normalizeStroke(tiles: Array<{ x: number; y: number }>): StudioTile[] {
  const seen = new Set<string>();
  const out: StudioTile[] = [];
  for (const t of tiles) {
    const k = key(t.x, t.y);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ x: t.x, y: t.y });
  }
  return out;
}

/** The next studio river number (max `river:studio-N` + 1). */
export function nextStudioRiverNumber(world: IsoWorld): number {
  let n = 0;
  for (const r of riversOf(world)) {
    const m = /^river:studio-(\d+)$/.exec(r.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return n + 1;
}

/** The river tile at (x,y), if any — centreline or width tile. */
function findRiverTile(world: IsoWorld, x: number, y: number): { river: River; tile: RiverTile; centreline: boolean } | null {
  for (const r of riversOf(world)) {
    for (const t of r.tiles) if (t.x === x && t.y === y) return { river: r, tile: t, centreline: true };
    for (const t of r.widthTiles ?? []) if (t.x === x && t.y === y) return { river: r, tile: t, centreline: false };
  }
  return null;
}

/** The water tile adjacent to (x,y) (4-neighbours first, then
 *  diagonals — deterministic order), or null. Existing water only;
 *  tiles in `exclude` (the stroke being drawn) do not count. */
function adjacentWater(world: IsoWorld, x: number, y: number, exclude?: Set<string>): { x: number; y: number } | null {
  const dirs: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(world, nx, ny)) continue;
    if (exclude && exclude.has(key(nx, ny))) continue;
    if (isWaterTile(world, nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

/** Width tiles for a centreline, following the generator's rule
 *  (rivers.ts extractRivers): width 2 takes ONE consistent bank
 *  side (parity of the river number), width 3 takes both sides.
 *  Width tiles are always shallow. No validity filtering here —
 *  the caller drops tiles that land on water / exclusions. */
function widthTilesForCentreline(tiles: RiverTile[], width: number, riverNum: number): RiverTile[] {
  const out: RiverTile[] = [];
  if (width < 2) return out;
  for (const t of tiles) {
    const left: [number, number] = [t.dy, -t.dx];
    const right: [number, number] = [-t.dy, t.dx];
    const bankSide: [number, number] = riverNum % 2 === 0 ? left : right;
    const sides: Array<[number, number]> = width >= 3 ? [left, right] : [bankSide];
    for (const [sx, sy] of sides) {
      out.push({ x: t.x + sx, y: t.y + sy, dx: t.dx, dy: t.dy, shallow: true });
    }
  }
  return out;
}

/** True when a would-be width tile may be stamped as water. */
function widthTileOk(world: IsoWorld, x: number, y: number, claimed: Set<string>): boolean {
  if (!inBounds(world, x, y)) return false;
  if (claimed.has(key(x, y))) return false;
  if (isWaterTile(world, x, y)) return false;
  return riverTileRefusal(world, x, y) === null;
}

/** The side a width-2 river already occupies at a centreline tile:
 *  'left' / 'right' / null (no width tile found — a stale flag). */
function existingWidthSide(world: IsoWorld, river: River, c: RiverTile): 'left' | 'right' | null {
  const left: [number, number] = [c.dy, -c.dx];
  const right: [number, number] = [-c.dy, c.dx];
  const wt = river.widthTiles ?? [];
  if (wt.some((t) => t.x === c.x + left[0] && t.y === c.y + left[1] && t.dx === c.dx && t.dy === c.dy)) return 'left';
  if (wt.some((t) => t.x === c.x + right[0] && t.y === c.y + right[1] && t.dx === c.dx && t.dy === c.dy)) return 'right';
  return null;
}

/** The river number for the bank-side parity rule: the trailing
 *  digits of the river id (`river:12` → 12, `river:studio-3` → 3). */
function riverNumber(river: River): number {
  const m = /(\d+)$/.exec(river.id);
  return m ? Number(m[1]) : 0;
}

// --- River draw -------------------------------------------------------

function previewRiver(world: IsoWorld, stroke: StudioTile[], opts: StudioPreviewOpts): StudioPreview {
  const width = opts.width === 2 || opts.width === 3 ? opts.width : 1;
  const valid: StudioTile[] = [];
  const rejected: Array<StudioTile & { reason: string }> = [];
  const claimed = new Set<string>();
  let prev: StudioTile | null = null;
  for (const t of stroke) {
    let reason: string | null = null;
    if (!inBounds(world, t.x, t.y)) reason = 'outside the map';
    else if (prev && Math.max(Math.abs(t.x - prev.x), Math.abs(t.y - prev.y)) > 1) reason = 'not connected to the stroke';
    else if (isWaterTile(world, t.x, t.y)) reason = 'already water';
    else reason = riverTileRefusal(world, t.x, t.y);
    if (reason) rejected.push({ ...t, reason });
    else {
      valid.push({ ...t });
      claimed.add(key(t.x, t.y));
    }
    prev = t;
  }
  // Centreline flow follows the stroke (first tile = source, last =
  // mouth); the last tile points at adjacent water when there is
  // any, else continues the last step.
  const centreline: RiverTile[] = valid.map((t, i) => {
    let dx = 0, dy = 0;
    if (i + 1 < valid.length) {
      // Sign-clamped: a rejected tile mid-stroke leaves a gap
      // between valid tiles, and the flow step must stay -1..1.
      dx = Math.sign(valid[i + 1].x - t.x);
      dy = Math.sign(valid[i + 1].y - t.y);
    } else if (valid.length > 1) {
      dx = Math.sign(t.x - valid[i - 1].x);
      dy = Math.sign(t.y - valid[i - 1].y);
    }
    const tile: RiverTile = { x: t.x, y: t.y, dx, dy };
    if (width === 1) tile.shallow = true;
    if (width > 1) tile.width = width;
    return tile;
  });
  // Fix the last tile's flow toward adjacent water when it has any.
  if (centreline.length > 0) {
    const last = centreline[centreline.length - 1];
    const w = adjacentWater(world, last.x, last.y, claimed);
    if (w) {
      last.dx = Math.sign(w.x - last.x);
      last.dy = Math.sign(w.y - last.y);
    }
  }
  const riverNum = nextStudioRiverNumber(world);
  const widthTiles = widthTilesForCentreline(centreline, width, riverNum)
    .filter((t) => widthTileOk(world, t.x, t.y, claimed));
  for (const t of widthTiles) claimed.add(key(t.x, t.y));
  const strokeSet = new Set(valid.map((t) => key(t.x, t.y)));
  const reachesWater = valid.some((t) => adjacentWater(world, t.x, t.y, strokeSet) !== null);
  const tiles: StudioTile[] = [...valid, ...widthTiles.map((t) => ({ x: t.x, y: t.y }))];
  // The river object the apply will stamp: mouth = adjacent water
  // at the last tile (else the last tile itself), road crossings =
  // centreline tiles on the authored dirt cross, source = a wild
  // lake / pond beside the first tile, if any.
  const mouth: { x: number; y: number } = centreline.length > 0
    ? (adjacentWater(world, centreline[centreline.length - 1].x, centreline[centreline.length - 1].y, new Set(valid.map((t) => key(t.x, t.y)))) ?? { x: centreline[centreline.length - 1].x, y: centreline[centreline.length - 1].y })
    : { x: 0, y: 0 };
  const roadCrossings: Array<{ x: number; y: number }> = [];
  for (const t of centreline) {
    if ((t.x >= ROAD_BAND_X.x0 && t.x <= ROAD_BAND_X.x1) || (t.y >= ROAD_BAND_Y.y0 && t.y <= ROAD_BAND_Y.y1)) roadCrossings.push({ x: t.x, y: t.y });
  }
  let sourceLake: { x: number; y: number } | undefined;
  if (centreline.length > 0) {
    const first = centreline[0];
    outer: for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const lx = first.x + dx, ly = first.y + dy;
      if (!inBounds(world, lx, ly) || oceanAt(lx, ly)) continue;
      if (wildLakeAt(lx, ly) || (lx >= POND_RECT.x0 && lx <= POND_RECT.x1 && ly >= POND_RECT.y0 && ly <= POND_RECT.y1)) { sourceLake = { x: lx, y: ly }; break outer; }
    }
  }
  const summary = valid.length === 0
    ? 'Nothing to draw — ' + (rejected[0]?.reason ?? 'no valid tiles')
    : 'River: ' + valid.length + ' tile' + (valid.length === 1 ? '' : 's') +
      (widthTiles.length > 0 ? ' + ' + widthTiles.length + ' bank' + (widthTiles.length === 1 ? '' : 's') : '') +
      ', width ' + width +
      (reachesWater ? ', reaches water' : ', ends on dry land (a pond)') +
      (rejected.length > 0 ? ' · ' + rejected.length + ' refused: ' + rejected[0].reason : '');
  return { tool: 'river', tiles, rejected, summary, width, reachesWater, centreline, widthTiles, mouth, roadCrossings, ...(sourceLake ? { sourceLake } : {}) };
}

// --- Widen / narrow ---------------------------------------------------

function previewWiden(world: IsoWorld, stroke: StudioTile[]): StudioPreview {
  const valid: StudioTile[] = [];
  const rejected: Array<StudioTile & { reason: string }> = [];
  const claimed = new Set<string>();
  let riverId: string | undefined;
  for (const t of stroke) {
    const found = findRiverTile(world, t.x, t.y);
    if (!found || !found.centreline) {
      rejected.push({ ...t, reason: found ? 'a bank tile, not the river itself' : 'not a river' });
      continue;
    }
    riverId = found.river.id;
    const cur = found.tile.width ?? 1;
    if (cur >= RIVER_MAX_WIDTH) {
      rejected.push({ ...t, reason: 'already at full width' });
      continue;
    }
    // The tiles widening adds at this centreline tile.
    const num = riverNumber(found.river);
    const side = cur === 1
      ? (num % 2 === 0 ? 'left' as const : 'right' as const)
      : (existingWidthSide(world, found.river, found.tile) === 'left' ? 'right' as const : 'left' as const);
    const [sx, sy] = side === 'left' ? [found.tile.dy, -found.tile.dx] : [-found.tile.dy, found.tile.dx];
    const wx = t.x + sx, wy = t.y + sy;
    if (!widthTileOk(world, wx, wy, claimed)) {
      rejected.push({ ...t, reason: 'no room on the bank here' });
      continue;
    }
    valid.push({ ...t });
    claimed.add(key(wx, wy));
    claimed.add(key(t.x, t.y));
  }
  // The added width tiles (green in the preview) ride on `tiles`
  // after the centreline tiles.
  const added: StudioTile[] = [];
  for (const t of valid) {
    const found = findRiverTile(world, t.x, t.y)!;
    const cur = found.tile.width ?? 1;
    const num = riverNumber(found.river);
    const side = cur === 1
      ? (num % 2 === 0 ? 'left' as const : 'right' as const)
      : (existingWidthSide(world, found.river, found.tile) === 'left' ? 'right' as const : 'left' as const);
    const [sx, sy] = side === 'left' ? [found.tile.dy, -found.tile.dx] : [-found.tile.dy, found.tile.dx];
    added.push({ x: t.x + sx, y: t.y + sy });
  }
  const summary = valid.length === 0
    ? 'Nothing to widen — ' + (rejected[0]?.reason ?? 'no river tiles')
    : 'Widen ' + valid.length + ' river tile' + (valid.length === 1 ? '' : 's') + ' by one' +
      (rejected.length > 0 ? ' · ' + rejected.length + ' refused: ' + rejected[0].reason : '');
  return { tool: 'widen', tiles: [...valid, ...added], rejected, summary, riverId };
}

function previewNarrow(world: IsoWorld, stroke: StudioTile[]): StudioPreview {
  const valid: StudioTile[] = [];
  const rejected: Array<StudioTile & { reason: string }> = [];
  let riverId: string | undefined;
  for (const t of stroke) {
    const found = findRiverTile(world, t.x, t.y);
    if (!found || !found.centreline) {
      rejected.push({ ...t, reason: found ? 'a bank tile, not the river itself' : 'not a river' });
      continue;
    }
    riverId = found.river.id;
    const cur = found.tile.width ?? 1;
    if (cur <= 1) {
      rejected.push({ ...t, reason: 'already at its narrowest' });
      continue;
    }
    // There must be width tiles to take away.
    const side = existingWidthSide(world, found.river, found.tile);
    if (cur === 2 && !side) {
      rejected.push({ ...t, reason: 'the bank is already clear' });
      continue;
    }
    valid.push({ ...t });
  }
  // The width tiles coming off (green in the preview) ride after.
  const removed: StudioTile[] = [];
  for (const t of valid) {
    const found = findRiverTile(world, t.x, t.y)!;
    const cur = found.tile.width ?? 1;
    const wt = found.river.widthTiles ?? [];
    // A width tile belongs to this centreline tile when it sits at
    // one of its two perpendicular side positions. (Manhattan
    // distance is wrong here: on a diagonal flow a side tile is
    // 2 away by Manhattan, 1 away per axis.)
    const [lx, ly] = [found.tile.dy, -found.tile.dx];
    const [rx, ry] = [-found.tile.dy, found.tile.dx];
    for (const w of wt) {
      if (w.dx !== found.tile.dx || w.dy !== found.tile.dy) continue;
      const isSide = (w.x === t.x + lx && w.y === t.y + ly) || (w.x === t.x + rx && w.y === t.y + ry);
      if (!isSide) continue;
      // Width 3 loses one side (the side the 1117 rule put second);
      // width 2 loses its only side.
      if (cur === 3) {
        const num = riverNumber(found.river);
        const keepSide: 'left' | 'right' = num % 2 === 0 ? 'left' : 'right';
        const [kx, ky] = keepSide === 'left' ? [found.tile.dy, -found.tile.dx] : [-found.tile.dy, found.tile.dx];
        if (w.x === t.x + kx && w.y === t.y + ky) continue;
      }
      removed.push({ x: w.x, y: w.y });
    }
  }
  const summary = valid.length === 0
    ? 'Nothing to narrow — ' + (rejected[0]?.reason ?? 'no river tiles')
    : 'Narrow ' + valid.length + ' river tile' + (valid.length === 1 ? '' : 's') + ' by one' +
      (rejected.length > 0 ? ' · ' + rejected.length + ' refused: ' + rejected[0].reason : '');
  return { tool: 'narrow', tiles: [...valid, ...removed], rejected, summary, riverId };
}

// --- Bank -------------------------------------------------------------

function previewBank(world: IsoWorld, stroke: StudioTile[], opts: StudioPreviewOpts): StudioPreview {
  const t = stroke[0];
  if (!t) return { tool: 'bank', tiles: [], rejected: [], summary: 'Tap a river bank to harden it' };
  if (isPlacedEmbankment(world, t.x, t.y)) {
    return { tool: 'bank', tiles: [{ ...t }], rejected: [], summary: 'Remove the embankment here', bank: { action: 'remove' } };
  }
  if (!inBounds(world, t.x, t.y)) {
    return { tool: 'bank', tiles: [], rejected: [{ ...t, reason: 'outside the map' }], summary: 'Outside the map' };
  }
  if (!bankAt(world, t.x, t.y)) {
    return { tool: 'bank', tiles: [], rejected: [{ ...t, reason: 'not a river bank' }], summary: 'Not a river bank — tap dry land beside river water' };
  }
  const res = validatePlacement(world, 'embankment', t.x, t.y, opts.playerTile, opts.npcTiles, 0);
  if (!res.ok) {
    return { tool: 'bank', tiles: [], rejected: [{ ...t, reason: res.reason }], summary: 'Cannot harden this bank: ' + res.reason };
  }
  return { tool: 'bank', tiles: [{ ...t }], rejected: [], summary: 'Harden this bank with an embankment — founders prefer to bridge from a hardened bank', bank: { action: 'harden' } };
}

// --- Bridge -----------------------------------------------------------

/** The contiguous run of placed bridge tiles around (x,y)
 *  (4-adjacent), for whole-bridge removal. */
function contiguousBridgeRun(world: IsoWorld, x: number, y: number): StudioTile[] {
  const seen = new Set<string>();
  const out: StudioTile[] = [];
  const queue: StudioTile[] = [{ x, y }];
  seen.add(key(x, y));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    out.push(cur);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (seen.has(key(nx, ny))) continue;
      if (!isPlacedBridge(world, nx, ny)) continue;
      seen.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
}

function previewBridge(world: IsoWorld, stroke: StudioTile[], opts: StudioPreviewOpts): StudioPreview {
  const t = stroke[0];
  if (!t) return { tool: 'bridge', tiles: [], rejected: [], summary: 'Tap a river tile to bridge it' };
  if (isPlacedBridge(world, t.x, t.y)) {
    const run = contiguousBridgeRun(world, t.x, t.y);
    return {
      tool: 'bridge', tiles: run, rejected: [],
      summary: 'Remove this bridge (' + run.length + ' tile' + (run.length === 1 ? '' : 's') + ')',
      bridge: { action: 'remove', span: run, style: 'wooden', axis: 'x', score: null },
    };
  }
  if (!inBounds(world, t.x, t.y)) {
    return { tool: 'bridge', tiles: [], rejected: [{ ...t, reason: 'outside the map' }], summary: 'Outside the map' };
  }
  const run: CrossingRun | null = crossingRunFor(world, t.x, t.y);
  if (!run) {
    return { tool: 'bridge', tiles: [], rejected: [{ ...t, reason: 'no river crossing here' }], summary: 'No river crossing here — tap a river tile between two banks' };
  }
  const style = opts.bridgeStyle ?? bridgeStyleForCrossing(world, run.bankA, t);
  const score = scoreCrossing(world, run);
  const valid: StudioTile[] = [];
  const rejected: Array<StudioTile & { reason: string }> = [];
  for (const s of run.tiles) {
    const res = validatePlacement(world, 'bridge', s.x, s.y, opts.playerTile, opts.npcTiles, 0, { bridgeStyle: style });
    if (res.ok) valid.push({ ...s });
    else rejected.push({ ...s, reason: res.reason });
  }
  if (valid.length === 0) {
    return { tool: 'bridge', tiles: [], rejected, summary: 'Cannot bridge here: ' + (rejected[0]?.reason ?? 'the span refuses'), bridge: { action: 'place', span: run.tiles, style, axis: run.axis, score } };
  }
  const summary = 'Bridge (' + style + ', ' + run.tiles.length + ' tile' + (run.tiles.length === 1 ? '' : 's') +
    ', order-' + (run.river.order ?? 1) + ' river' +
    (score !== null ? ', crossing score ' + score : ', bank not walkable — founders cannot use it yet') +
    (rejected.length > 0 ? ' · ' + rejected.length + ' span tile' + (rejected.length === 1 ? '' : 's') + ' refused: ' + rejected[0].reason : '') +
    ' — entrances are paved and approach roads stamped';
  return { tool: 'bridge', tiles: valid, rejected, summary, bridge: { action: 'place', span: run.tiles, style, axis: run.axis, score } };
}

// --- Path + auto-connect ----------------------------------------------

/** The pure half of extendPathToCrossing's search: the road route
 *  from `from` to the nearest bridge / ford / dock / stepping-stone
 *  placement or scored crossing bank, over path-placeable land
 *  (max 32 steps, bank-adjacent tiles first). Returns the route
 *  INCLUDING the target tile and EXCLUDING `from`, or null when
 *  nothing is in reach. Reads only — the apply stamps through the
 *  real extendPathToCrossing, which may also ford a shallow span. */
export function planPathConnector(world: IsoWorld, paths: PathState | null, from: { x: number; y: number }): StudioTile[] | null {
  const tkey = (x: number, y: number): string => x + ',' + y;
  const targets = new Set<string>();
  for (const site of paths?.bridges ?? []) {
    targets.add(tkey(site.workTile.x, site.workTile.y));
    if (site.nearBank) targets.add(tkey(site.nearBank.x, site.nearBank.y));
    for (const s of site.spanTiles ?? []) targets.add(tkey(s.x, s.y));
  }
  for (const p of placementsOf(world)) {
    if (p.kind === 'bridge' || p.kind === 'ford' || p.kind === 'dock' || p.kind === 'stepping-stone') {
      for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) targets.add(tkey(x, y));
    }
  }
  // BUILD 1133 (0x34): a path must reach the BANK beside a placed
  // crossing, not the water tile under the deck — the deck itself
  // is unreachable by a land BFS, and a studio river records no
  // road crossing for listCrossings to offer its banks. Add the
  // land neighbours of every placed crossing as targets, so a path
  // drawn to a player-placed bridge routes to its bank entrance.
  for (const p of placementsOf(world)) {
    if (p.kind !== 'bridge' && p.kind !== 'ford' && p.kind !== 'dock' && p.kind !== 'stepping-stone') continue;
    for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (inBounds(world, nx, ny) && terrainAt(world, nx, ny) !== 'water') targets.add(tkey(nx, ny));
      }
    }
  }
  // Scored crossing banks are targets too (a bridge the founders
  // will build, or one the player will place next).
  for (const c of listCrossings(world)) {
    targets.add(tkey(c.run.bankA.x, c.run.bankA.y));
    targets.add(tkey(c.run.bankB.x, c.run.bankB.y));
  }
  if (targets.size === 0) return null;
  const startKey = tkey(from.x, from.y);
  const previous = new Map<string, string | null>([[startKey, null]]);
  const queue: Array<{ x: number; y: number; distance: number }> = [{ ...from, distance: 0 }];
  const maxSteps = 32;
  let found: { x: number; y: number } | null = null;
  while (queue.length > 0 && !found) {
    const current = queue.shift()!;
    if (current.distance >= maxSteps) continue;
    const neighbours: Array<{ x: number; y: number }> = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) neighbours.push({ x: current.x + dx, y: current.y + dy });
    neighbours.sort((a, b) => (riverNear(world, b.x, b.y, 1) ? 1 : 0) - (riverNear(world, a.x, a.y, 1) ? 1 : 0));
    for (const n of neighbours) {
      const k = tkey(n.x, n.y);
      if (previous.has(k) || !inBounds(world, n.x, n.y) || terrainAt(world, n.x, n.y) === 'water') continue;
      previous.set(k, tkey(current.x, current.y));
      if (targets.has(k)) { found = { ...n }; break; }
      if (isPathTile(world, n.x, n.y)) { queue.push({ x: n.x, y: n.y, distance: current.distance + 1 }); continue; }
      // A path-placeable tile is traversable for the route (the
      // stamp will land it); anything else is a wall.
      const res = validatePlacement(world, 'path', n.x, n.y, { x: 0, y: 0 }, [], 0);
      if (!res.ok && res.reason !== 'already a path or road') { previous.delete(k); continue; }
      queue.push({ x: n.x, y: n.y, distance: current.distance + 1 });
    }
  }
  if (!found) return null;
  const route: StudioTile[] = [];
  let cursor: string | null = tkey(found.x, found.y);
  while (cursor && cursor !== startKey) {
    const [x, y] = cursor.split(',').map(Number);
    // A tile that is already a path needs no stamping — the
    // connector lists only what the apply will actually pave, so
    // the preview and the apply agree exactly.
    if (!isPathTile(world, x, y)) route.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }
  route.reverse();
  return route;
}

function previewPath(world: IsoWorld, stroke: StudioTile[], opts: StudioPreviewOpts): StudioPreview {
  const valid: StudioTile[] = [];
  const rejected: Array<StudioTile & { reason: string }> = [];
  let prev: StudioTile | null = null;
  for (const t of stroke) {
    let reason: string | null = null;
    if (!inBounds(world, t.x, t.y)) reason = 'outside the map';
    else if (prev && Math.max(Math.abs(t.x - prev.x), Math.abs(t.y - prev.y)) > 1) reason = 'not connected to the stroke';
    else if (terrainAt(world, t.x, t.y) === 'water') reason = 'water — bridge it or ford it first';
    else {
      const res = validatePlacement(world, 'path', t.x, t.y, opts.playerTile, opts.npcTiles, 0);
      if (!res.ok && res.reason !== 'already a path or road') reason = res.reason;
    }
    if (reason) rejected.push({ ...t, reason });
    else valid.push({ ...t });
    prev = t;
  }
  // Auto-connect: each end of the stroke reaches for the nearest
  // bridge / crossing within 32 tiles.
  const connector: StudioTile[] = [];
  const seenConnector = new Set<string>();
  const validSet = new Set(valid.map((t) => key(t.x, t.y)));
  for (const end of [valid[0], valid[valid.length - 1]].filter(Boolean) as StudioTile[]) {
    const route = planPathConnector(world, opts.paths ?? null, end);
    if (!route) continue;
    for (const t of route) {
      const k = key(t.x, t.y);
      if (validSet.has(k) || seenConnector.has(k)) continue;
      seenConnector.add(k);
      connector.push({ ...t });
    }
  }
  const summary = valid.length === 0
    ? 'Nothing to pave — ' + (rejected[0]?.reason ?? 'no valid tiles')
    : 'Path: ' + valid.length + ' tile' + (valid.length === 1 ? '' : 's') +
      (connector.length > 0 ? ' + ' + connector.length + ' tile' + (connector.length === 1 ? '' : 's') + ' connecting to a bridge' : ' (no bridge in reach — it stays a plain path)') +
      (rejected.length > 0 ? ' · ' + rejected.length + ' refused: ' + rejected[0].reason : '');
  return { tool: 'path', tiles: valid, rejected, summary, connector: connector.length > 0 ? connector : undefined };
}

// --- Preview dispatcher -------------------------------------------------

export function previewStudioEdit(world: IsoWorld, tool: StudioTool, tiles: Array<{ x: number; y: number }>, opts: StudioPreviewOpts): StudioPreview {
  const stroke = normalizeStroke(tiles);
  switch (tool) {
    case 'river': return previewRiver(world, stroke, opts);
    case 'widen': return previewWiden(world, stroke);
    case 'narrow': return previewNarrow(world, stroke);
    case 'bank': return previewBank(world, stroke, opts);
    case 'bridge': return previewBridge(world, stroke, opts);
    case 'path': return previewPath(world, stroke, opts);
  }
}

// --- Apply --------------------------------------------------------------

function findPlacementIndex(world: IsoWorld, kind: string, x: number, y: number): { item: PlacedItem; index: number } | null {
  const list = world.placements ?? [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.kind === kind && x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return { item: p, index: i };
  }
  return null;
}

function applyRiver(world: IsoWorld, stroke: StudioTile[], opts: StudioPreviewOpts): StudioApplyResult {
  // Recompute the preview from the ORIGINAL stroke — never from a
  // preview's tiles (a river preview's tiles are centreline +
  // width tiles, and re-running on those would stamp the width
  // tiles as centreline). The world may have changed since the
  // panel previewed, so the apply never trusts a stale preview.
  const fresh = previewRiver(world, stroke, opts);
  const centreline = fresh.centreline ?? [];
  if (centreline.length === 0) return { ok: false, message: 'Nothing to draw — ' + (fresh.rejected[0]?.reason ?? 'no valid tiles'), undo: null, applied: [], connected: [] };
  const riverNum = nextStudioRiverNumber(world);
  const widthTiles = fresh.widthTiles ?? [];
  const river: River = {
    id: 'river:studio-' + riverNum,
    tiles: centreline,
    mouth: fresh.mouth ?? { x: centreline[centreline.length - 1].x, y: centreline[centreline.length - 1].y },
    order: 1,
    ...(widthTiles.length > 0 ? { widthTiles } : {}),
    ...((fresh.roadCrossings?.length ?? 0) > 0 ? { roadCrossings: fresh.roadCrossings } : {}),
    ...(fresh.sourceLake ? { sourceLake: fresh.sourceLake } : {}),
  };
  if (!world.rivers) world.rivers = [];
  (world.rivers as unknown as River[]).push(river);
  if (!world.terrain) world.terrain = {};
  for (const t of [...river.tiles, ...(river.widthTiles ?? [])]) {
    world.terrain[terrainKey(t.x, t.y)] = 'water';
  }
  return {
    ok: true,
    message: 'Drew a river (' + river.tiles.length + ' tiles' + (river.widthTiles?.length ? ', ' + river.widthTiles.length + ' bank tiles' : '') + ')' + (fresh.reachesWater ? ' — it reaches water' : ' — it ends on dry land'),
    undo: { kind: 'studioRiver', mode: 'add', riverId: river.id, river: JSON.parse(JSON.stringify(river)) as River },
    applied: [...river.tiles, ...(river.widthTiles ?? [])].map((t) => ({ x: t.x, y: t.y })),
    connected: [],
  };
}

function applyWiden(world: IsoWorld, preview: StudioPreview): StudioApplyResult {
  const fresh = previewWiden(world, preview.tiles);
  const changed: Array<{ x: number; y: number; riverId: string; widthBefore: number; widthAfter: number; added: StudioTile[] }> = [];
  const applied: StudioTile[] = [];
  for (const t of fresh.tiles) {
    const found = findRiverTile(world, t.x, t.y);
    if (!found || !found.centreline) continue;
    const cur = found.tile.width ?? 1;
    if (cur >= RIVER_MAX_WIDTH) continue;
    const num = riverNumber(found.river);
    const side = cur === 1
      ? (num % 2 === 0 ? 'left' as const : 'right' as const)
      : (existingWidthSide(world, found.river, found.tile) === 'left' ? 'right' as const : 'left' as const);
    const [sx, sy] = side === 'left' ? [found.tile.dy, -found.tile.dx] : [-found.tile.dy, found.tile.dx];
    const wx = t.x + sx, wy = t.y + sy;
    if (!widthTileOk(world, wx, wy, new Set())) continue;
    if (!found.river.widthTiles) found.river.widthTiles = [];
    found.river.widthTiles.push({ x: wx, y: wy, dx: found.tile.dx, dy: found.tile.dy, shallow: true });
    found.tile.width = cur + 1;
    if (!world.terrain) world.terrain = {};
    world.terrain[terrainKey(wx, wy)] = 'water';
    changed.push({ x: t.x, y: t.y, riverId: found.river.id, widthBefore: cur, widthAfter: cur + 1, added: [{ x: wx, y: wy }] });
    applied.push({ x: wx, y: wy });
  }
  if (changed.length === 0) return { ok: false, message: 'Nothing to widen — ' + (fresh.rejected[0]?.reason ?? 'no river tiles'), undo: null, applied: [], connected: [] };
  return {
    ok: true,
    message: 'Widened ' + changed.length + ' river tile' + (changed.length === 1 ? '' : 's') + ' by one',
    undo: { kind: 'studioRiver', mode: 'widen', changes: changed },
    applied,
    connected: [],
  };
}

function applyNarrow(world: IsoWorld, preview: StudioPreview): StudioApplyResult {
  const fresh = previewNarrow(world, preview.tiles);
  const changed: Array<{ x: number; y: number; riverId: string; widthBefore: number; widthAfter: number; removed: StudioTile[] }> = [];
  const applied: StudioTile[] = [];
  for (const t of fresh.tiles) {
    const found = findRiverTile(world, t.x, t.y);
    if (!found || !found.centreline) continue;
    const cur = found.tile.width ?? 1;
    if (cur <= 1) continue;
    const num = riverNumber(found.river);
    const keepSide: 'left' | 'right' = num % 2 === 0 ? 'left' : 'right';
    const [kx, ky] = keepSide === 'left' ? [found.tile.dy, -found.tile.dx] : [-found.tile.dy, found.tile.dx];
    const removed: StudioTile[] = [];
    const wt = found.river.widthTiles ?? [];
    const kept: RiverTile[] = [];
    const [lx, ly] = [found.tile.dy, -found.tile.dx];
    const [rx, ry] = [-found.tile.dy, found.tile.dx];
    for (const w of wt) {
      const belongs = w.dx === found.tile.dx && w.dy === found.tile.dy &&
        ((w.x === t.x + lx && w.y === t.y + ly) || (w.x === t.x + rx && w.y === t.y + ry));
      if (!belongs) { kept.push(w); continue; }
      if (cur === 3 && w.x === t.x + kx && w.y === t.y + ky) { kept.push(w); continue; }
      removed.push({ x: w.x, y: w.y });
    }
    if (removed.length === 0) continue;
    found.river.widthTiles = kept;
    if (cur - 1 <= 1) delete found.tile.width;
    else found.tile.width = cur - 1;
    for (const r of removed) {
      // Only clear the terrain when no river tile still claims
      // the tile (a neighbouring river's tile may share it).
      if (findRiverTile(world, r.x, r.y)) continue;
      if (world.terrain && world.terrain[terrainKey(r.x, r.y)] === 'water') delete world.terrain[terrainKey(r.x, r.y)];
    }
    changed.push({ x: t.x, y: t.y, riverId: found.river.id, widthBefore: cur, widthAfter: cur - 1, removed });
    applied.push(...removed);
  }
  if (changed.length === 0) return { ok: false, message: 'Nothing to narrow — ' + (fresh.rejected[0]?.reason ?? 'no river tiles'), undo: null, applied: [], connected: [] };
  return {
    ok: true,
    message: 'Narrowed ' + changed.length + ' river tile' + (changed.length === 1 ? '' : 's') + ' by one',
    undo: { kind: 'studioRiver', mode: 'narrow', changes: changed },
    applied,
    connected: [],
  };
}

function applyBank(world: IsoWorld, preview: StudioPreview, opts: StudioPreviewOpts): StudioApplyResult {
  const t = preview.tiles[0];
  if (!t) return { ok: false, message: preview.summary, undo: null, applied: [], connected: [] };
  if (preview.bank?.action === 'remove') {
    const found = findPlacementIndex(world, 'embankment', t.x, t.y);
    if (!found) return { ok: false, message: 'No embankment here anymore', undo: null, applied: [], connected: [] };
    removeExactPlacement(world, found.item);
    return { ok: true, message: 'Removed the embankment', undo: { kind: 'unplace', item: found.item, index: found.index }, applied: [{ ...t }], connected: [] };
  }
  const res = validatePlacement(world, 'embankment', t.x, t.y, opts.playerTile, opts.npcTiles, 0);
  if (!res.ok) return { ok: false, message: 'Cannot harden this bank: ' + res.reason, undo: null, applied: [], connected: [] };
  addPlacement(world, res.item);
  return { ok: true, message: 'Hardened the bank with an embankment', undo: { kind: 'place', item: res.item }, applied: [{ ...t }], connected: [] };
}

function applyBridge(world: IsoWorld, preview: StudioPreview, opts: StudioPreviewOpts): StudioApplyResult {
  const t = preview.tiles[0];
  if (!t) return { ok: false, message: preview.summary, undo: null, applied: [], connected: [] };
  if (preview.bridge?.action === 'remove') {
    const run = contiguousBridgeRun(world, t.x, t.y);
    const entries: UndoEntry[] = [];
    // Remove in an order that keeps indices stable for the undo:
    // capture each item + index first, then remove.
    const captured: Array<{ item: PlacedItem; index: number }> = [];
    for (const tile of run) {
      const found = findPlacementIndex(world, 'bridge', tile.x, tile.y);
      if (found) captured.push(found);
    }
    for (const c of captured) removeExactPlacement(world, c.item);
    for (const c of captured) entries.push({ kind: 'unplace', item: c.item, index: c.index });
    if (captured.length === 0) return { ok: false, message: 'No bridge here anymore', undo: null, applied: [], connected: [] };
    return { ok: true, message: 'Removed the bridge (' + captured.length + ' tiles)', undo: { kind: 'stroke', entries }, applied: run, connected: [] };
  }
  const run = crossingRunFor(world, t.x, t.y);
  if (!run) return { ok: false, message: 'No river crossing here anymore', undo: null, applied: [], connected: [] };
  const style = opts.bridgeStyle ?? preview.bridge?.style ?? bridgeStyleForCrossing(world, run.bankA, t);
  const site = freshBridgeSite(run.tiles[0].x, run.tiles[0].y, run.bankA, run.tiles, style, run.axis, run.bankA);
  // Snapshot the low crossings the deck will replace, so the undo
  // can restore them exactly.
  const lows: Array<{ item: PlacedItem; index: number }> = [];
  for (const tile of run.tiles) {
    for (const kind of ['ford', 'stepping-stone', 'dock'] as const) {
      const found = findPlacementIndex(world, kind, tile.x, tile.y);
      if (found) lows.push(found);
    }
  }
  // Snapshot the entrances' path grade BEFORE the span lands:
  // placeBridgeSpan re-paves a pre-existing entrance path to
  // stone, and the undo must restore the old grade.
  const entranceBefore: Array<{ x: number; y: number; pathKind: string | undefined }> = [];
  for (const e of [run.bankA, run.bankB]) {
    const existing = placementsOf(world).find((p) => p.kind === 'path' && p.x0 === e.x && p.y0 === e.y);
    if (existing) entranceBefore.push({ x: e.x, y: e.y, pathKind: existing.pathKind });
  }
  const placed = placeBridgeSpan(world, site, opts.playerTile, opts.npcTiles);
  if (!placed.ok) return { ok: false, message: 'Cannot bridge here: ' + placed.reason, undo: null, applied: [], connected: [] };
  const entries: UndoEntry[] = [];
  // Record the deck items as they sit in the world (styled, with
  // axis + id) — placed.placed holds the pre-style
  // validatePlacement items, and undoing/redoing those restored a
  // style-less, id-less deck.
  for (const deck of placed.placed) {
    const found = findPlacementIndex(world, 'bridge', deck.x0, deck.y0);
    if (found) entries.push({ kind: 'place', item: found.item });
  }
  for (const tile of placed.approachTiles) {
    const found = findPlacementIndex(world, 'path', tile.x, tile.y);
    if (found) entries.push({ kind: 'place', item: found.item });
  }
  for (const e of entranceBefore) {
    const now = placementsOf(world).find((p) => p.kind === 'path' && p.x0 === e.x && p.y0 === e.y);
    if (now && now.pathKind !== e.pathKind) entries.push({ kind: 'unpathkind', x: e.x, y: e.y, pathKind: e.pathKind });
  }
  for (const low of lows) entries.push({ kind: 'unplace', item: low.item, index: low.index });
  const applied = [...placed.placed.map((p) => ({ x: p.x0, y: p.y0 })), ...placed.approachTiles];
  return {
    ok: true,
    message: 'Bridged the river (' + style + ', ' + placed.placed.length + ' deck tiles, entrances paved)',
    undo: { kind: 'stroke', entries },
    applied,
    connected: placed.approachTiles,
  };
}

function applyPath(world: IsoWorld, preview: StudioPreview, opts: StudioPreviewOpts): StudioApplyResult {
  const fresh = previewPath(world, preview.tiles, opts);
  const entries: UndoEntry[] = [];
  const applied: StudioTile[] = [];
  for (const t of fresh.tiles) {
    if (isPathTile(world, t.x, t.y)) continue;
    const item = stampPathTile(world, t.x, t.y, 'road', opts.playerTile, opts.npcTiles);
    if (!item) continue;
    entries.push({ kind: 'place', item });
    applied.push({ ...t });
  }
  // Auto-connect: each end reaches for the nearest bridge/crossing.
  // The bridge route comes first — the preview's planner
  // (planPathConnector) routes to a placed bridge's bank, and the
  // apply stamps exactly that route, so the preview and the apply
  // agree. Only when no bridge is in reach does the founder
  // path-grower run, which may ford on the spot instead.
  const connected: StudioTile[] = [];
  // Snapshot first: the connector walks over existing paths, and
  // only what it actually stamped may go in the undo.
  const beforeKeys = new Set(placementsOf(world).map((p) => p.kind + '|' + p.x0 + ',' + p.y0 + '-' + p.x1 + ',' + p.y1));
  const ends = [fresh.tiles[0], fresh.tiles[fresh.tiles.length - 1]].filter(Boolean) as StudioTile[];
  for (const end of ends) {
    const route = planPathConnector(world, opts.paths ?? null, end);
    if (route && route.length > 0) {
      for (const tile of route) {
        if (applied.some((a) => a.x === tile.x && a.y === tile.y) || connected.some((a) => a.x === tile.x && a.y === tile.y)) continue;
        if (isPathTile(world, tile.x, tile.y)) continue;
        const item = stampPathTile(world, tile.x, tile.y, 'road', opts.playerTile, opts.npcTiles);
        if (!item) continue;
        connected.push({ ...tile });
        entries.push({ kind: 'place', item });
      }
      continue;
    }
    const stamped = extendPathToCrossing(world, opts.paths ?? freshPathState(), end);
    for (const tile of stamped) {
      if (applied.some((a) => a.x === tile.x && a.y === tile.y) || connected.some((a) => a.x === tile.x && a.y === tile.y)) continue;
      connected.push({ ...tile });
      const kind = isPlacedFord(world, tile.x, tile.y) ? 'ford' : 'path';
      const found = findPlacementIndex(world, kind, tile.x, tile.y);
      if (found && !beforeKeys.has(found.item.kind + '|' + found.item.x0 + ',' + found.item.y0 + '-' + found.item.x1 + ',' + found.item.y1)) entries.push({ kind: 'place', item: found.item });
    }
  }
  if (applied.length === 0 && connected.length === 0) {
    return { ok: false, message: 'Nothing to pave — ' + (fresh.rejected[0]?.reason ?? 'no valid tiles'), undo: null, applied: [], connected: [] };
  }
  return {
    ok: true,
    message: 'Paved ' + applied.length + ' path tile' + (applied.length === 1 ? '' : 's') +
      (connected.length > 0 ? ' + ' + connected.length + ' connecting to a crossing' : ''),
    undo: entries.length > 0 ? { kind: 'stroke', entries } : null,
    applied,
    connected,
  };
}

export function applyStudioEdit(world: IsoWorld, tool: StudioTool, tiles: Array<{ x: number; y: number }>, opts: StudioPreviewOpts): StudioApplyResult {
  const preview = previewStudioEdit(world, tool, tiles, opts);
  switch (tool) {
    case 'river': return applyRiver(world, tiles, opts);
    case 'widen': return applyWiden(world, preview);
    case 'narrow': return applyNarrow(world, preview);
    case 'bank': return applyBank(world, preview, opts);
    case 'bridge': return applyBridge(world, preview, opts);
    case 'path': return applyPath(world, preview, opts);
  }
}
