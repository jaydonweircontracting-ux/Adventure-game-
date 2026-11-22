/**
 * BUILD 1112 — NEURON HEX 0x2F, River overhaul Stage 1: river generation v2.
 *
 * Rivers now follow the terrain: a priority-flood drainage model
 * over the landforms elevation field (groundElevation) computes
 * where water would actually flow — every depression is filled
 * to its spill level, each tile drains to its lowest neighbour,
 * and flow accumulation marks the channels. A channel is a tile
 * whose catchment is at least RIVER_CHANNEL_THRESHOLD tiles:
 * Strahler order over the CHANNEL subgraph — order-1 channels
 * are streams, order-2 are tributaries, order-3+ are main
 * rivers. (Order over the whole field is wrong here: a
 * 100-tile catchment always contains merges, so no channel head
 * would ever be a stream.) Channels end at the ocean, a lake,
 * the pond, or at a confluence with a bigger river; a channel
 * that drains off the map edge is dropped (with its
 * tributaries), so every shipped river reaches water — the same
 * rule BUILD 1082 used for its walked courses.
 *
 * Width follows flow: a channel is 1 tile wide while its
 * accumulation is low, 2 wide on a tributary, 3 wide on a main
 * river near its mouth. Width tiles are always shallow water;
 * low-flow centreline tiles are shallow too. Banks are the land
 * tiles beside river water (queryable via bankAt /
 * allBankTiles, computed from the river tiles — never stored).
 * Road crossings (centreline tiles on the authored dirt cross
 * roads) are recorded per river for the Stage 2 bridges.
 * filledElevationsFor returns the drainage (filled) elevation
 * along each river — the surface the rivers follow, and what
 * Stage 2/3 reuse for waterfalls and bridge heights. The filled
 * surface never rises downstream; the RAW ground can rise
 * across a filled basin, so the raw profile is not the descent
 * test — the filled profile is.
 *
 * A river is a course of water tiles. The tiles are stamped as
 * 'water' terrain entries, so terrainAt / effTerrainFor /
 * walkability / rendering / maps all read them as water through
 * the EXISTING water path — no second water system is created.
 * The flow direction (dx/dy per tile, toward the next tile
 * downstream) lives on the river course itself and is rendered
 * as a flow chevron (worldRender3d.ts) and reported by Examine.
 *
 * The module does NOT own movement or rendering: water blocks
 * through isWalkableWorld (terrainAt === 'water'), bridges win
 * over water in walkableWithPlacements (a placed bridge over a
 * river tile is walkable, like over the ocean/pond), and the
 * ground renders water tiles from effTerrainFor. Fishing,
 * swimming/boats, and drinkable water are NOT built here
 * (explicitly pending).
 *
 * Persistence follows the BUILD 1061 removedTrees / BUILD 1081
 * mineralDeposits pattern: the rivers live on the world object
 * (IsoWorld.rivers, plain data) and are saved wholesale by
 * saveWorld. The stamp (stampRivers, called once from
 * loadInitialWorld and from createSettlementSim) never re-derives
 * a stamped world, so a river never moves or vanishes on reload.
 * Old saves load with none; the stamp generates them on the same
 * load (the layout is already applied by then). Old (BUILD 1082)
 * rivers load fine: the new fields are optional — a river
 * without widthTiles/order/shallow reads as a single-width,
 * order-1, deep course.
 *
 * A river never floods the settlement: the flow field treats
 * the camp disc, the hut rects, the farm tiles, the mineral
 * deposits, and every occupied tile (tree, rock, crate,
 * landmark, placement — including paths and bridges) as
 * barriers, so channels route around them. The mine corridor
 * stays dry (BUILD 1089). The authored dirt roads are NOT
 * barriers — a river must cross them to reach the ocean — so
 * crossings are recorded for bridges instead of avoided.
 */
import { oceanAt, terrainAt, inBounds, type IsoWorld } from '../iso/isoWorld';
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
  /** Shallow water: a low-flow centreline tile, or any width
   *  (bank-side) tile. Deep centreline tiles omit it. Old saves
   *  have no flag — they read as deep. */
  shallow?: boolean;
  /** The river's width at this centreline tile (2 or 3); a
   *  width-1 tile omits it. Width tiles omit it. */
  width?: number;
}

/** One river: a course from high ground to water. */
export interface River {
  id: string;
  /** Centreline, in downstream order. The last tile points at
   *  the mouth. */
  tiles: RiverTile[];
  /** The water tile the river meets (ocean, lake, pond, or
   *  another river's tile) — never a river tile itself. */
  mouth: { x: number; y: number };
  /** Strahler order: 1 = stream/headwater, 2 = tributary,
   *  3+ = main river. */
  order?: number;
  /** Extra water tiles that widen the river (perpendicular to
   *  the flow, always shallow). Not part of the centreline. */
  widthTiles?: RiverTile[];
  /** Centreline tiles on the authored dirt cross roads
   *  (x 99..100 or y 99..100) — where Stage 2 bridges them. */
  roadCrossings?: Array<{ x: number; y: number }>;
  /** The lake/pond tile this river starts beside, when it
   *  rises from a lake outlet (a lake-connected source). */
  sourceLake?: { x: number; y: number };
}

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
/** Minimum flow accumulation (upstream tiles) for a channel
 *  tile. Measured on the default world: 100 gives ~40 raw
 *  channels (~25 after edge/short drops) — streams, tributaries
 *  and mains — while 50 floods the map with ~100 short rills
 *  and 200 leaves only ~18 rivers. */
export const RIVER_CHANNEL_THRESHOLD = 100;
/** A centreline chain shorter than this is not a river (a
 *  rill that never reaches water). */
export const RIVER_MIN_LEN = 10;
/** Centreline tile with accumulation below this is shallow
 *  water (a stream you could wade). */
export const RIVER_SHALLOW_ACC = 300;
/** Width steps by accumulation: below 300 the river is 1 tile
 *  wide; 300..2999 it widens to 2; at 3000+ it is 3 wide. */
export const RIVER_WIDTH_ACC_2 = 300;
export const RIVER_WIDTH_ACC_3 = 3000;
export const RIVER_MAX_WIDTH = 3;
/** The authored dirt cross roads (isoWorld.ts): the vertical
 *  band x 99..100 and the horizontal band y 99..100. A river
 *  must cross them to reach the ocean — crossings are recorded
 *  per river for the Stage 2 bridges. */
export const ROAD_BAND_X = { x0: 99, x1: 100 };
export const ROAD_BAND_Y = { y0: 99, y1: 100 };

const DIRS8: Array<[number, number]> = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

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

/** A minimal binary heap of [key, index] pairs, smallest key
 *  first; ties break by index, so the flood order is fully
 *  deterministic. */
class FloodHeap {
  private keys: number[] = [];
  private idxs: number[] = [];
  get size(): number { return this.keys.length; }
  push(heapKey: number, idx: number): void {
    this.keys.push(heapKey);
    this.idxs.push(idx);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] < this.keys[i] || (this.keys[p] === this.keys[i] && this.idxs[p] < this.idxs[i])) break;
      const tk = this.keys[p]; this.keys[p] = this.keys[i]; this.keys[i] = tk;
      const ti = this.idxs[p]; this.idxs[p] = this.idxs[i]; this.idxs[i] = ti;
      i = p;
    }
  }
  pop(): [number, number] {
    const topKey = this.keys[0];
    const topIdx = this.idxs[0];
    const lastKey = this.keys.pop() as number;
    const lastIdx = this.idxs.pop() as number;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.idxs[0] = lastIdx;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.keys.length && (this.keys[l] < this.keys[m] || (this.keys[l] === this.keys[m] && this.idxs[l] < this.idxs[m]))) m = l;
        if (r < this.keys.length && (this.keys[r] < this.keys[m] || (this.keys[r] === this.keys[m] && this.idxs[r] < this.idxs[m]))) m = r;
        if (m === i) break;
        const tk = this.keys[m]; this.keys[m] = this.keys[i]; this.keys[i] = tk;
        const ti = this.idxs[m]; this.idxs[m] = this.idxs[i]; this.idxs[i] = ti;
        i = m;
      }
    }
    return [topKey, topIdx];
  }
}

/** The drainage model for a world: filled elevation, the
 *  downstream neighbour of every tile, flow accumulation, and
 *  the key-descending cell order (a topological order of the
 *  drainage graph). Pure — a deterministic function of the
 *  elevation field and the barriers. */
interface FlowField {
  w: number;
  h: number;
  /** Filled elevation (priority-flood): the drainage surface. */
  filled: Float64Array;
  /** Downstream neighbour index, or -1 at a sink/edge. */
  down: Int32Array;
  /** Flow accumulation: upstream tiles draining through here. */
  acc: Float64Array;
  /** Cell indices in drainage-key descending order (every cell
   *  precedes its downstream). */
  orderIdx: number[];
  /** True when a tile is blocked (a barrier). */
  blocked: Uint8Array;
}

function computeFlowField(world: IsoWorld, ex: Exclusions): FlowField {
  const W = world.w, H = world.h, N = W * H;
  const idx = (x: number, y: number): number => y * W + x;
  const E = new Float64Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) E[idx(x, y)] = groundElevation(x, y);
  // Existing water is a sink: drainage routes INTO it and the
  // channel ends at its edge, never through it.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (oceanAt(x, y) || wildLakeAt(x, y) || (x >= POND_RECT.x0 && x <= POND_RECT.x1 && y >= POND_RECT.y0 && y <= POND_RECT.y1)) E[idx(x, y)] = -10;
  }
  const blocked = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isExcluded(ex, x, y)) blocked[idx(x, y)] = 1;
  // Priority-flood: fill every depression to its spill level so
  // the whole field drains. Boundary cells seed the flood.
  const filled = new Float64Array(N);
  const visited = new Uint8Array(N);
  const heap = new FloodHeap();
  const seed = (i: number): void => {
    if (blocked[i] || visited[i]) return;
    visited[i] = 1;
    filled[i] = E[i];
    heap.push(E[i], i);
  };
  for (let x = 0; x < W; x++) { seed(idx(x, 0)); seed(idx(x, H - 1)); }
  for (let y = 0; y < H; y++) { seed(idx(0, y)); seed(idx(W - 1, y)); }
  while (heap.size > 0) {
    const [fv, i] = heap.pop();
    const ix = i % W, iy = (i / W) | 0;
    for (const [dx, dy] of DIRS8) {
      const nx = ix + dx, ny = iy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = idx(nx, ny);
      if (visited[ni] || blocked[ni]) continue;
      visited[ni] = 1;
      const nf = Math.max(E[ni], fv);
      filled[ni] = nf;
      heap.push(nf, ni);
    }
  }
  // A non-blocked cell the flood never reached (fully ringed by
  // barriers) keeps its raw elevation — it drains locally and
  // never becomes a channel (accumulation 0).
  for (let i = 0; i < N; i++) if (!visited[i] && !blocked[i]) filled[i] = E[i];
  // Downstream: the neighbour minimising the drainage key
  // (filled elevation, then index). The key strictly decreases
  // along every link, so the field is acyclic and a single
  // accumulation pass in key-descending order is exact.
  const down = new Int32Array(N).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (blocked[i]) continue;
    let best = -1, bf = Infinity;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = idx(nx, ny);
      if (blocked[ni]) continue;
      const f = filled[ni];
      if (best === -1 || f < bf || (f === bf && ni < best)) { best = ni; bf = f; }
    }
    down[i] = best;
  }
  // One pass in key-descending order: every cell is processed
  // before its downstream, so accumulation is exact. acc starts
  // at 1 (the tile itself). Strahler order is NOT computed here
  // — it is computed over the channel subgraph in
  // extractRivers (an order over the whole field would make
  // every channel head order 2+, since a 100-tile catchment
  // always contains merges).
  const orderIdx = Array.from({ length: N }, (_, i) => i);
  orderIdx.sort((a, b) => filled[b] - filled[a] || b - a);
  const acc = new Float64Array(N);
  for (let i = 0; i < N; i++) if (!blocked[i]) acc[i] = 1;
  for (const i of orderIdx) {
    if (blocked[i]) continue;
    const d = down[i];
    if (d >= 0) acc[d] += acc[i];
  }
  return { w: W, h: H, filled, down, acc, orderIdx, blocked };
}

/** The river's width at an accumulation: 1 while the flow is
 *  low, 2 on a tributary, 3 on a main river near its mouth. */
function widthForAcc(a: number): number {
  if (a >= RIVER_WIDTH_ACC_3) return 3;
  if (a >= RIVER_WIDTH_ACC_2) return 2;
  return 1;
}

/** One walked river before the drop fixpoint: the centreline
 *  cell indices in downstream order, and the downstream
 *  neighbour the last tile points at (a water tile, another
 *  river's tile, or -1 when the walk runs off the map). */
interface RawRiver {
  start: number;
  order: number;
  cells: number[];
  mouthIdx: number;
  mouthIsWater: boolean;
}

/** Extract the shipped rivers from the flow field: channels
 *  split at heads and confluences, walked downstream, then a
 *  drop fixpoint removes every river that does not reach water
 *  (edge drainage) and every river whose mouth was one of those
 *  (its tributaries). Pure — deterministic. */
function extractRivers(world: IsoWorld, ff: FlowField, ex: Exclusions): River[] {
  const W = ff.w, H = ff.h;
  const idx = (x: number, y: number): number => y * W + x;
  const { down, acc, blocked } = ff;
  const chan = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (!blocked[i] && acc[i] >= RIVER_CHANNEL_THRESHOLD && !isWaterTile(world, x, y)) chan[i] = 1;
  }
  // Strahler order over the CHANNEL subgraph only: a channel
  // head (no channel cell flows into it) is order 1; a channel
  // cell fed by two order-n channels is order n+1. Channel
  // upstreams precede a cell in key-descending order, so one
  // pass over ff.orderIdx is exact.
  const order = new Uint8Array(W * H);
  for (const i of ff.orderIdx) {
    if (!chan[i]) continue;
    const ix = i % W, iy = (i / W) | 0;
    let maxUpOrder = 0, countMax = 0;
    for (const [dx, dy] of DIRS8) {
      const nx = ix + dx, ny = iy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = idx(nx, ny);
      if (chan[ni] && down[ni] === i) {
        if (order[ni] > maxUpOrder) { maxUpOrder = order[ni]; countMax = 1; }
        else if (order[ni] === maxUpOrder) { countMax++; }
      }
    }
    order[i] = countMax >= 2 ? maxUpOrder + 1 : (maxUpOrder || 1);
  }
  // A channel cell starts a river when no channel cell flows
  // into it (a head), or when its order exceeds every channel
  // cell flowing into it (a confluence that merges up).
  const isStart = (i: number): boolean => {
    const ix = i % W, iy = (i / W) | 0;
    let maxUpOrder = 0, hasUp = false;
    for (const [dx, dy] of DIRS8) {
      const nx = ix + dx, ny = iy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = idx(nx, ny);
      if (chan[ni] && down[ni] === i) { hasUp = true; if (order[ni] > maxUpOrder) maxUpOrder = order[ni]; }
    }
    if (!hasUp) return true;
    return order[i] > maxUpOrder;
  };
  // Walk one river downstream from its start cell. The walk
  // stops at water (a mouth), at a confluence (the mouth is the
  // other river's tile), or off the map (mouth -1: dropped).
  const walkRiver = (s: number): RawRiver | null => {
    const o = order[s];
    const cells: number[] = [s];
    let cur = s;
    for (;;) {
      const d = down[cur];
      if (d < 0) return { start: s, order: o, cells, mouthIdx: -1, mouthIsWater: false };
      if (!chan[d]) {
        const dx = d % W, dy = (d / W) | 0;
        if (isWaterTile(world, dx, dy)) return { start: s, order: o, cells, mouthIdx: d, mouthIsWater: true };
        return { start: s, order: o, cells, mouthIdx: -1, mouthIsWater: false };
      }
      if (order[d] !== o || isStart(d)) return { start: s, order: o, cells, mouthIdx: d, mouthIsWater: false };
      cells.push(d);
      cur = d;
      if (cells.length > RIVER_MAX_LEN) return null;
    }
  };
  const raws: RawRiver[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!chan[i] || !isStart(i)) continue;
    const r = walkRiver(i);
    if (!r) continue;
    if (r.cells.length < RIVER_MIN_LEN) continue;
    raws.push(r);
  }
  // Drop fixpoint: a river with no mouth goes, and with it any
  // river whose mouth was one of its tiles.
  const kept = new Set<number>();
  for (let i = 0; i < raws.length; i++) if (raws[i].mouthIdx >= 0) kept.add(i);
  let changed = true;
  while (changed) {
    changed = false;
    const keptTiles = new Set<number>();
    for (const i of kept) for (const c of raws[i].cells) keptTiles.add(c);
    for (const i of [...kept]) {
      const r = raws[i];
      if (r.mouthIsWater) continue;
      if (!keptTiles.has(r.mouthIdx)) { kept.delete(i); changed = true; }
    }
  }
  // Centreline tiles first (all rivers), so a width tile can
  // never land on another river's course.
  const claimed = new Set<string>();
  const built: Array<{ raw: RawRiver; tiles: RiverTile[] }> = [];
  for (const i of [...kept].sort((a, b) => raws[a].start - raws[b].start)) {
    const r = raws[i];
    const tiles: RiverTile[] = r.cells.map((c, j) => {
      const next = j + 1 < r.cells.length ? r.cells[j + 1] : r.mouthIdx;
      const x = c % W, y = (c / W) | 0;
      const nx = next % W, ny = (next / W) | 0;
      const t: RiverTile = { x, y, dx: nx - x, dy: ny - y };
      if (acc[c] < RIVER_SHALLOW_ACC) t.shallow = true;
      const w = widthForAcc(acc[c]);
      if (w > 1) t.width = w;
      return t;
    });
    for (const t of tiles) claimed.add(key(t.x, t.y));
    built.push({ raw: r, tiles });
  }
  // Widen, record crossings and lake sources, ship.
  const out: River[] = [];
  let n = 0;
  for (const { raw: r, tiles } of built) {
    n++;
    const widthTiles: RiverTile[] = [];
    for (const t of tiles) {
      const w = t.width ?? 1;
      if (w < 2) continue;
      const left: [number, number] = [t.dy, -t.dx];
      const right: [number, number] = [-t.dy, t.dx];
      const sides: Array<[number, number]> = w >= 3 ? [left, right] : [((t.x + t.y) % 2 === 0) ? left : right];
      for (const [sx, sy] of sides) {
        const wx = t.x + sx, wy = t.y + sy;
        if (wx < 0 || wy < 0 || wx >= W || wy >= H) continue;
        if (isWaterTile(world, wx, wy)) continue;
        if (isExcluded(ex, wx, wy)) continue;
        const k = key(wx, wy);
        if (claimed.has(k)) continue;
        claimed.add(k);
        widthTiles.push({ x: wx, y: wy, dx: t.dx, dy: t.dy, shallow: true });
      }
    }
    const roadCrossings: Array<{ x: number; y: number }> = [];
    for (const t of tiles) {
      if ((t.x >= ROAD_BAND_X.x0 && t.x <= ROAD_BAND_X.x1) || (t.y >= ROAD_BAND_Y.y0 && t.y <= ROAD_BAND_Y.y1)) roadCrossings.push({ x: t.x, y: t.y });
    }
    let sourceLake: { x: number; y: number } | undefined;
    const first = tiles[0];
    outer: for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const lx = first.x + dx, ly = first.y + dy;
      if (lx < 0 || ly < 0 || lx >= W || ly >= H) continue;
      if (oceanAt(lx, ly)) continue; // the coast is not a lake
      if (wildLakeAt(lx, ly) || (lx >= POND_RECT.x0 && lx <= POND_RECT.x1 && ly >= POND_RECT.y0 && ly <= POND_RECT.y1)) { sourceLake = { x: lx, y: ly }; break outer; }
    }
    const river: River = {
      id: riverIdFor(n),
      tiles,
      mouth: { x: r.mouthIdx % W, y: (r.mouthIdx / W) | 0 },
      order: r.order,
      ...(widthTiles.length > 0 ? { widthTiles } : {}),
      ...(roadCrossings.length > 0 ? { roadCrossings } : {}),
      ...(sourceLake ? { sourceLake } : {}),
    };
    out.push(river);
  }
  return out;
}

/** The deterministic river map for a world: drainage channels
 *  over the landforms elevation field, with widths, banks and
 *  road crossings. Pure — no randomness, no I/O, no mutation. */
export function generateRivers(world: IsoWorld): River[] {
  const ex = buildExclusions(world);
  const ff = computeFlowField(world, ex);
  return extractRivers(world, ff, ex);
}

/** The filled (drainage) elevation at each centreline tile of
 *  each river, in downstream order — the surface the rivers
 *  follow. The filled elevation never rises downstream: that is
 *  what "the river follows the elevation gradient" means (the
 *  raw ground can rise across a filled basin, so the raw
 *  profile is not the test). Stage 2/3 reuse this for
 *  waterfalls (a steep filled drop) and bridge heights. One
 *  flow-field computation serves the whole call. */
export function filledElevationsFor(world: IsoWorld, rivers: River[]): number[][] {
  const ex = buildExclusions(world);
  const ff = computeFlowField(world, ex);
  const W = ff.w;
  return rivers.map((r) => r.tiles.map((t) => ff.filled[t.y * W + t.x]));
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
    for (const t of r.widthTiles ?? []) {
      world.terrain[`${t.x},${t.y}`] = 'water';
    }
  }
  return true;
}

/** world.rivers as the v2 River type. The IsoWorld inline type
 *  predates the v2 fields (widthTiles/order/shallow/width/
 *  roadCrossings/sourceLake), so the stamp stores full Rivers
 *  through a cast and reads go through this one. (The inline
 *  type gains the optional fields as a follow-up.) */
function riversOf(world: IsoWorld): River[] {
  return (world.rivers ?? []) as unknown as River[];
}

/** The river tile on a tile, if any (exact tile only — a
 *  centreline or a width tile). A tile whose terrain is no
 *  longer water (the player Removed it — removedWater wins,
 *  like the ocean/pond) reads as gone. */
function findTile(world: IsoWorld, x: number, y: number): { river: River; tile: RiverTile } | null {
  for (const r of riversOf(world)) {
    for (const t of r.tiles) if (t.x === x && t.y === y) return { river: r, tile: t };
    for (const t of r.widthTiles ?? []) if (t.x === x && t.y === y) return { river: r, tile: t };
  }
  return null;
}

export function riverAt(world: IsoWorld, x: number, y: number): { river: River; tile: RiverTile } | null {
  if (terrainAt(world, x, y) !== 'water') return null;
  return findTile(world, x, y);
}

/** The nearest river tile within the E-key reach (1 tile, same
 *  Chebyshev reach the crate/tree/rock/deposit branches use). */
export function riverNear(world: IsoWorld, x: number, y: number, reach = 1): { river: River; tile: RiverTile } | null {
  for (const r of riversOf(world)) {
    for (const t of [...r.tiles, ...(r.widthTiles ?? [])]) {
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

/** Every river tile in the world, flat (centreline + width —
 *  rendering + tests). */
export function allRiverTiles(world: IsoWorld): RiverTile[] {
  const out: RiverTile[] = [];
  for (const r of riversOf(world)) {
    out.push(...r.tiles);
    if (r.widthTiles) out.push(...r.widthTiles);
  }
  return out;
}

/** The width of the river at a tile (1/2/3), or 0 when the
 *  tile is not river water. */
export function riverWidthAt(world: IsoWorld, x: number, y: number): number {
  const found = findTile(world, x, y);
  if (!found) return 0;
  return found.tile.width ?? 1;
}

/** True when the river tile is shallow water (a low-flow
 *  centreline tile or any width tile). */
export function isShallowTile(world: IsoWorld, x: number, y: number): boolean {
  const found = findTile(world, x, y);
  return found !== null && found.tile.shallow === true;
}

/** The bank tile at (x,y): a land tile beside river water.
 *  Banks are computed from the river tiles, never stored — a
 *  bank is any non-water tile 8-adjacent to a river tile. */
export function bankAt(world: IsoWorld, x: number, y: number): { river: River; x: number; y: number } | null {
  if (!inBounds(world, x, y)) return null;
  if (isWaterTile(world, x, y)) return null;
  const riverKeys = new Set<string>();
  for (const r of riversOf(world)) {
    for (const t of r.tiles) riverKeys.add(key(t.x, t.y));
    for (const t of r.widthTiles ?? []) riverKeys.add(key(t.x, t.y));
  }
  if (riverKeys.has(key(x, y))) return null;
  for (const r of riversOf(world)) {
    for (const t of [...r.tiles, ...(r.widthTiles ?? [])]) {
      if (Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1) return { river: r, x, y };
    }
  }
  return null;
}

/** Every bank tile in the world, flat (one entry per tile —
 *  a tile beside two rivers lists the first). */
export function allBankTiles(world: IsoWorld): Array<{ river: River; x: number; y: number }> {
  const out: Array<{ river: River; x: number; y: number }> = [];
  const seen = new Set<string>();
  const riverKeys = new Set<string>();
  for (const r of riversOf(world)) {
    for (const t of r.tiles) riverKeys.add(key(t.x, t.y));
    for (const t of r.widthTiles ?? []) riverKeys.add(key(t.x, t.y));
  }
  for (const r of riversOf(world)) {
    for (const t of [...r.tiles, ...(r.widthTiles ?? [])]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const bx = t.x + dx, by = t.y + dy;
        if (!inBounds(world, bx, by)) continue;
        if (isWaterTile(world, bx, by)) continue;
        const k = key(bx, by);
        if (riverKeys.has(k)) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ river: r, x: bx, y: by });
      }
    }
  }
  return out;
}

/** Every road crossing in the world: river tiles on the
 *  authored dirt cross roads, with their river (Stage 2
 *  bridges span these). */
export function allRoadCrossings(world: IsoWorld): Array<{ river: River; x: number; y: number }> {
  const out: Array<{ river: River; x: number; y: number }> = [];
  for (const r of riversOf(world)) {
    for (const c of r.roadCrossings ?? []) out.push({ river: r, x: c.x, y: c.y });
  }
  return out;
}
