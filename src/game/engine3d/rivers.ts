/**
 * BUILD 1082 — NEURON HEX 0x11, Living World plan Phase 1.3: rivers +
 * flowing water.
 *
 * This module owns the RIVER MAP: where the rivers run, which way
 * each tile flows, and where each river meets water. It is a pure,
 * deterministic function of the world (same seed → same rivers,
 * same courses): sources are picked on eastern high ground by
 * hashed noise, then each river walks downhill — steepest descent
 * on the elevation field with a westward pull toward the ocean, so
 * a river meanders through the valleys but always trends to the
 * coast — until it reaches the ocean, a lake, the pond, or another
 * river. Streams are short tributaries that join a main river.
 *
 * A river is a course of water tiles. The tiles are stamped as
 * 'water' terrain entries, so terrainAt / effTerrainFor /
 * walkability / rendering / maps all read them as water through
 * the EXISTING water path — no second water system is created.
 * The flow direction (dx/dy per tile, toward the next tile
 * downstream) lives on the river course itself and is rendered as
 * a flow chevron (worldRender3d.ts) and reported by Examine.
 *
 * The module does NOT own movement or rendering: water blocks
 * through isWalkableWorld (terrainAt === 'water'), bridges win
 * over water in walkableWithPlacements (a placed bridge over a
 * river tile is walkable, like over the ocean/pond), and the
 * ground renders water tiles from effTerrainFor. Fishing,
 * swimming/boats, and drinkable water are NOT built here (Phase
 * 2/4, explicitly pending).
 *
 * Persistence follows the BUILD 1061 removedTrees / BUILD 1081
 * mineralDeposits pattern: the rivers live on the world object
 * (IsoWorld.rivers, plain data) and are saved wholesale by
 * saveWorld. The stamp (stampRivers, called once from
 * loadInitialWorld and from createSettlementSim) never re-derives
 * a stamped world, so a river never moves or vanishes on reload.
 * Old saves load with none; the stamp generates them on the same
 * load (the layout is already applied by then).
 *
 * A river never floods the settlement: courses are routed around
 * the camp disc, the hut rects, the farm tiles, and the 1.2
 * mineral deposits, and never share a tile with a tree, rock,
 * crate, landmark, or anything placed. A river that cannot reach
 * water is discarded and the next source is tried — every shipped
 * river reaches water (or joins another river that does).
 */
import { hash2, oceanAt, terrainAt, inBounds, type IsoWorld } from '../iso/isoWorld';
import { groundElevation } from './townLook';
import { wildLakeAt, POND_RECT } from './wildTerrain';
import { FOUNDER_CAMP } from './founders';

/** One river tile: the downstream step toward the next tile
 *  (the last tile points at the mouth water it joins). */
export interface RiverTile {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** One river: a course from high ground to water. */
export interface River {
  id: string;
  tiles: RiverTile[];
  /** The water tile the river meets (ocean, lake, pond, or
   *  another river's tile) — never a river tile itself. */
  mouth: { x: number; y: number };
}

/** Rivers in the world — one north, one south of the camp. */
export const RIVER_COUNT = 2;
/** No river tile within this many tiles of the camp centre
 *  (the founders' immediate work area — a river here would
 *  cut their paths to the nearest trees). */
export const RIVER_CAMP_EXCLUSION = 25;
/** No river tile within this many tiles of a hut rect edge. */
export const RIVER_HUT_MARGIN = 2;
/** BUILD 1089 (2.4): the mine corridor — the lane from camp
 *  (124,120) to the near iron deposit (84,111), work tile
 *  (83,110). River:1's southward meander used to cut diagonally
 *  across this lane (18 water tiles, x 80..97, y 108..116),
 *  which made the near iron unreachable: the mine designation
 *  reads a deposit as unreachable when no round-trip path exists
 *  at the A* default budget, so it fell through to the far iron
 *  (180,123), whose 89-step trip no founder can complete (the
 *  needs decay outruns the walk at 100x). The corridor stays dry
 *  so the mine route is the direct ~51-step path. The deposits
 *  and the camp are deterministic world facts, so the rectangle
 *  is stable across loads. */
export const RIVER_MINE_CORRIDOR = { x0: 80, y0: 108, x1: 124, y1: 122 };
/** Longest a river course may run (a coast-to-coast walk is
 *  ~160 tiles west plus meanders; 300 is headroom). */
export const RIVER_MAX_LEN = 300;
/** Longest a tributary may run before it must join or reach
 *  water (a tributary starts near the main river's middle,
 *  ~90 tiles from the coast, so it needs room to either join
 *  the river or reach the water itself). */
export const TRIB_MAX_LEN = 120;
/** Westward pull in the descent score (per tile of x): the
 *  elevation field's max slope is ~0.07/tile, so 0.1 guarantees
 *  a westward step always lowers the score — the river trends
 *  to the ocean even across a flat or a rise — while a steep
 *  downhill north/south step can still win and meander it. */
export const RIVER_WEST_PULL = 0.1;
/** Hash jitter in the descent score (meander — breaks ties
 *  between equally good neighbours). */
const RIVER_JITTER_W = 0.05;
/** A source must stand on ground this high (groundElevation
 *  ±1.5 — but the field's measured max over the eastern half is
 *  0.794, so 0.8 admitted nothing. 0.5 is the top ~29% of the
 *  eastern half: genuinely high ground, with a comfortable
 *  margin below the field max). */
const SOURCE_ELEV_MIN = 0.5;
/** Sources live in the eastern third (x >= 140) — the high
 *  ground the rivers drain from. */
const SOURCE_MIN_X = 140;
/** Fraction of high-ground tiles that are source candidates
 *  (hash-gated, like the 1.2 deposit candidates). */
const SOURCE_CANDIDATE_HASH = 0.02;
/** Minimum tiles between two river sources. */
const SOURCE_MIN_SPACING = 40;
/** Source candidates tried per half before giving up on it. */
const SOURCE_TRIES_PER_HALF = 8;

function riverIdFor(n: number): string {
  return `river:${n}`;
}

function key(x: number, y: number): string {
  return x + ',' + y;
}

/** True when the tile is water by any existing rule (ocean,
 *  wild lake, authored pond) — a river stops here (its mouth),
 *  never overwrites it. */
export function isWaterTile(world: IsoWorld, x: number, y: number): boolean {
  if (oceanAt(x, y)) return true;
  if (wildLakeAt(x, y)) return true;
  if (x >= POND_RECT.x0 && x <= POND_RECT.x1 && y >= POND_RECT.y0 && y <= POND_RECT.y1) return true;
  return terrainAt(world, x, y) === 'water';
}

/** Tiles already occupied by something standing — a river never
 *  shares a tile with a tree, rock, crate, landmark block, or
 *  anything placed (house, farm, path, stall, wall, lantern...).
 *  Same rule as the 1.2 deposit map. */
function occupiedTiles(world: IsoWorld): Set<string> {
  const occ = new Set<string>();
  for (const t of world.trees ?? []) occ.add(key(t.tx, t.ty));
  for (const r of world.rocks ?? []) occ.add(key(r.tx, r.ty));
  for (const c of world.crates ?? []) occ.add(key(c.tx, c.ty));
  for (const l of world.landmarks ?? []) for (const b of l.blocks) occ.add(key(b.x, b.y));
  for (const p of world.placements ?? []) {
    for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) occ.add(key(x, y));
  }
  return occ;
}

/** Hut rects (authored + player-placed) with a margin — a river
 *  never runs against a hut wall. */
function hutRects(world: IsoWorld): Array<{ x0: number; y0: number; x1: number; y1: number }> {
  const rects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  for (const h of world.huts ?? []) rects.push(h);
  for (const p of world.placements ?? []) if (p.kind === 'house') rects.push({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 });
  return rects;
}

/** The exclusion set for river routing: camp disc, hut rects,
 *  farm tiles, mineral deposits, and occupied tiles. A river
 *  tile is never one of these. */
interface Exclusions {
  occ: Set<string>;
  huts: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  farms: Set<string>;
  deposits: Set<string>;
}

function buildExclusions(world: IsoWorld): Exclusions {
  const farms = new Set<string>();
  for (const p of world.placements ?? []) if (p.kind === 'farm') farms.add(key(p.x0, p.y0));
  const deposits = new Set<string>();
  for (const d of world.mineralDeposits ?? []) deposits.add(key(d.x, d.y));
  return { occ: occupiedTiles(world), huts: hutRects(world), farms, deposits };
}

function isExcluded(ex: Exclusions, x: number, y: number): boolean {
  if (Math.hypot(x - FOUNDER_CAMP.x, y - FOUNDER_CAMP.y) < RIVER_CAMP_EXCLUSION) return true;
  // BUILD 1089: the mine corridor stays dry (above).
  if (x >= RIVER_MINE_CORRIDOR.x0 && x <= RIVER_MINE_CORRIDOR.x1 && y >= RIVER_MINE_CORRIDOR.y0 && y <= RIVER_MINE_CORRIDOR.y1) return true;
  if (ex.occ.has(key(x, y))) return true;
  if (ex.farms.has(key(x, y))) return true;
  if (ex.deposits.has(key(x, y))) return true;
  for (const r of ex.huts) {
    if (x >= r.x0 - RIVER_HUT_MARGIN && x <= r.x1 + RIVER_HUT_MARGIN && y >= r.y0 - RIVER_HUT_MARGIN && y <= r.y1 + RIVER_HUT_MARGIN) return true;
  }
  return false;
}

/** The descent score at a tile: elevation plus a westward pull
 *  (toward the ocean) plus a hash jitter for meander. Lower is
 *  further downstream. Pure position — no world state. */
function descentScore(x: number, y: number): number {
  return groundElevation(x, y) + x * RIVER_WEST_PULL + (hash2(x, y, 7701) - 0.5) * RIVER_JITTER_W;
}

/** Walk one river course downhill from a source. Returns the
 *  course plus its mouth, or null when the walk cannot reach
 *  water (dead end, edge, or too long — the caller tries the
 *  next source). `joinTiles` are tiles of an already-built
 *  river: reaching one joins it (a confluence), which counts
 *  as reaching water. Pure — reads the world, never writes. */
function walkCourse(
  world: IsoWorld,
  ex: Exclusions,
  sx: number,
  sy: number,
  maxLen: number,
  joinTiles: Set<string>,
): { tiles: RiverTile[]; mouth: { x: number; y: number } } | null {
  const seen = new Set<string>();
  const path: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
  seen.add(key(sx, sy));
  let cx = sx, cy = sy;
  for (let step = 0; step < maxLen; step++) {
    // A neighbour that is water (or another river) is the mouth:
    // the course ends here, pointing at it.
    let mouth: { x: number; y: number } | null = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(world, nx, ny)) continue;
      if (joinTiles.has(key(nx, ny))) { mouth = { x: nx, y: ny }; break; }
      if (isWaterTile(world, nx, ny)) { mouth = { x: nx, y: ny }; break; }
    }
    if (mouth) {
      const tiles: RiverTile[] = path.map((p, i) => {
        const next = i + 1 < path.length ? path[i + 1] : mouth;
        return { x: p.x, y: p.y, dx: next.x - p.x, dy: next.y - p.y };
      });
      return { tiles, mouth };
    }
    // Otherwise step to the lowest-score valid neighbour.
    let best: { x: number; y: number; s: number } | null = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(world, nx, ny)) continue;
      if (seen.has(key(nx, ny))) continue;
      if (isExcluded(ex, nx, ny)) continue;
      if (isWaterTile(world, nx, ny)) continue; // handled above as a mouth
      const s = descentScore(nx, ny);
      if (!best || s < best.s) best = { x: nx, y: ny, s };
    }
    if (!best) return null; // boxed in — no valid step
    cx = best.x; cy = best.y;
    path.push({ x: cx, y: cy });
    seen.add(key(cx, cy));
  }
  return null; // too long without reaching water
}

/** Source candidates for one half of the map (north: y < 100,
 *  south: y >= 100): eastern high ground, hash-gated, lowest
 *  hash first so the same world always picks the same sources. */
function sourceCandidates(world: IsoWorld, ex: Exclusions, north: boolean): Array<{ x: number; y: number; h: number }> {
  const cands: Array<{ x: number; y: number; h: number }> = [];
  for (let y = 0; y < world.h; y++) {
    if (north && y >= 100) continue;
    if (!north && y < 100) continue;
    for (let x = SOURCE_MIN_X; x < world.w; x++) {
      const h = hash2(x, y, 7703);
      if (h >= SOURCE_CANDIDATE_HASH) continue;
      if (groundElevation(x, y) < SOURCE_ELEV_MIN) continue;
      const t = terrainAt(world, x, y);
      if (t !== 'grass' && t !== 'dirt' && t !== 'stone') continue;
      if (isExcluded(ex, x, y)) continue;
      if (isWaterTile(world, x, y)) continue;
      cands.push({ x, y, h });
    }
  }
  cands.sort((a, b) => a.h - b.h);
  return cands;
}

/** The deterministic river map for a world: one river per half
 *  (north + south of the camp), each with a tributary where one
 *  joins. Pure — no randomness, no I/O, no mutation. A river
 *  that cannot reach water is dropped and the next source is
 *  tried; a world that yields no river in a half simply has
 *  one river instead of two (the asserts require at least one
 *  river reaching the coast). */
export function generateRivers(world: IsoWorld): River[] {
  const ex = buildExclusions(world);
  const out: River[] = [];
  const riverTiles = new Set<string>();
  let n = 0;
  for (const north of [true, false]) {
    const cands = sourceCandidates(world, ex, north);
    let placed = false;
    for (const c of cands.slice(0, SOURCE_TRIES_PER_HALF)) {
      if (placed) break;
      // Sources stay apart from each other and from the other river.
      let tooClose = false;
      for (const r of out) for (const t of r.tiles) if (Math.hypot(t.x - c.x, t.y - c.y) < SOURCE_MIN_SPACING) { tooClose = true; break; }
      if (tooClose) continue;
      const walked = walkCourse(world, ex, c.x, c.y, RIVER_MAX_LEN, riverTiles);
      if (!walked) continue;
      n++;
      const river: River = { id: riverIdFor(n), tiles: walked.tiles, mouth: walked.mouth };
      out.push(river);
      for (const t of walked.tiles) riverTiles.add(key(t.x, t.y));
      placed = true;
      // Tributary: a short course from high ground near the
      // main river's SOURCE (the eastern high ground, where a
      // tributary can actually start — the river's middle is low
      // western ground, where no high-ground tile exists) that
      // joins it. A walk that reaches the coast instead is a
      // parallel river, not a tributary, and is not added.
      const trib = tributaryFor(world, ex, c, riverTiles, cands);
      if (trib) {
        n++;
        out.push({ id: riverIdFor(n), tiles: trib.tiles, mouth: trib.mouth });
        for (const t of trib.tiles) riverTiles.add(key(t.x, t.y));
      }
    }
  }
  return out;
}

/** A tributary for a river: a high-ground source near the main
 *  river's SOURCE (the same half's source list, nearest the main
 *  source first — a tributary starts on the same high ground and
 *  converges downstream) whose walk JOINS the main river within
 *  TRIB_MAX_LEN. Null when none joins. A walk that reaches the
 *  coast instead is a parallel river, not a tributary. */
function tributaryFor(
  world: IsoWorld,
  ex: Exclusions,
  mainSource: { x: number; y: number },
  joinTiles: Set<string>,
  cands: Array<{ x: number; y: number; h: number }>,
): { tiles: RiverTile[]; mouth: { x: number; y: number } } | null {
  const near = cands
    .filter((c) => Math.hypot(c.x - mainSource.x, c.y - mainSource.y) >= 10)
    .filter((c) => Math.hypot(c.x - mainSource.x, c.y - mainSource.y) <= 40)
    .sort((a, b) => Math.hypot(a.x - mainSource.x, a.y - mainSource.y) - Math.hypot(b.x - mainSource.x, b.y - mainSource.y));
  for (const c of near.slice(0, SOURCE_TRIES_PER_HALF)) {
    if (joinTiles.has(key(c.x, c.y))) continue;
    const walked = walkCourse(world, ex, c.x, c.y, TRIB_MAX_LEN, joinTiles);
    if (!walked) continue;
    if (!joinTiles.has(key(walked.mouth.x, walked.mouth.y))) continue;
    return walked;
  }
  return null;
}

/** Stamp the river map onto a world that has none, once, and
 *  stamp the tiles as 'water' terrain so the whole game reads
 *  them as water through the existing water path. Returns true
 *  when it generated (the caller saves the world then). A world
 *  that already has rivers is left untouched — this is what
 *  keeps a river from moving or vanishing across reloads. */
export function stampRivers(world: IsoWorld): boolean {
  if (world.rivers && world.rivers.length > 0) return false;
  const rivers = generateRivers(world);
  if (rivers.length === 0) return false;
  world.rivers = rivers as unknown as IsoWorld['rivers'];
  for (const r of rivers) {
    for (const t of r.tiles) {
      world.terrain[`${t.x},${t.y}`] = 'water';
    }
  }
  return true;
}

/** The river tile on a tile, if any (exact tile only). A tile
 *  whose terrain is no longer water (the player Removed it —
 *  removedWater wins, like the ocean/pond) reads as gone. */
export function riverAt(world: IsoWorld, x: number, y: number): { river: River; tile: RiverTile } | null {
  if (terrainAt(world, x, y) !== 'water') return null;
  for (const r of world.rivers ?? []) {
    for (const t of r.tiles) if (t.x === x && t.y === y) return { river: r, tile: t };
  }
  return null;
}

/** The nearest river tile within the E-key reach (1 tile, same
 *  Chebyshev reach the crate/tree/rock/deposit branches use). */
export function riverNear(world: IsoWorld, x: number, y: number, reach = 1): { river: River; tile: RiverTile } | null {
  for (const r of world.rivers ?? []) {
    for (const t of r.tiles) {
      if (Math.abs(t.x - x) <= reach && Math.abs(t.y - y) <= reach) {
        if (terrainAt(world, t.x, t.y) !== 'water') continue;
        return { river: r, tile: t };
      }
    }
  }
  return null;
}

/** Compass word for a downstream step (dx,dy are -1/0/1). +y
 *  is south, +x is east — the same compass the minimap uses. */
export function flowDirName(dx: number, dy: number): string {
  const ns = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
  const ew = dx < 0 ? 'west' : dx > 0 ? 'east' : '';
  if (ns && ew) return ns + '-' + ew;
  return ns || ew || 'still';
}

/** The Examine text for a river tile — the acceptance-test
 *  wording. */
export function examineRiver(found: { river: River; tile: RiverTile }): string {
  return `River — flows ${flowDirName(found.tile.dx, found.tile.dy)}`;
}

/** Every river tile in the world, flat (rendering + tests). */
export function allRiverTiles(world: IsoWorld): RiverTile[] {
  const out: RiverTile[] = [];
  for (const r of world.rivers ?? []) out.push(...r.tiles);
  return out;
}
