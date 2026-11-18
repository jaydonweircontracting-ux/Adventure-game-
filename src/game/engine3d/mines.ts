/**
 * BUILD 1089 — Mines / quarries / lumber (NEURON HEX 0x18, Living
 * World plan Phase 2.4).
 *
 * Three designated work sites over real world objects — the
 * settlement stops gathering ad-hoc and works a plan:
 *
 * - MINE: a mine entrance over a 1.2 mineral deposit (iron first —
 *   the acceptance test names iron). A miner walks to the mine,
 *   works a shift (3 ticks, the quarry's shift), carries 2 ore to
 *   the storehouse through the R-1 registry. The deposit is real,
 *   countable, persistent (geology.ts) — it depletes 2 per visit
 *   and leaves the registry when mined out, like the quarry's
 *   deposit branch. The entrance IS the deposit's outcrop (already
 *   rendered, minimap-dotted, E-examined) — no new building, no
 *   new placement kind: the site is the designation, the outcrop
 *   is the entrance. A mine building through the construction path
 *   is Phase 3.1's catalogue, not this build.
 * - QUARRY: a designated rock site (not ad-hoc). The crew is up
 *   to 2 founders in parallel (vs ad-hoc's 1) — each claims a
 *   different rock in the site and works it, so the site gains
 *   stone faster than a solo founder working the same rocks
 *   sequentially. The site is the best reachable rock cluster
 *   (most rocks within QUARRY_SITE_RADIUS, ties → nearest) —
 *   surveyed on the real world: the only 2-rock cluster among
 *   reachable rocks is the near pair (120,120)+(111,125), and the
 *   ad-hoc quarry mines those in the first 24h, so a day-3 site
 *   designates over the far pair (148,94)+(157,81) — 22 apart,
 *   both round-trip reachable. A single rock is one job, so a
 *   1-rock site can never crew — the designation only counts
 *   clusters.
 * - LUMBER: a designated forest-edge site with a felling rotation
 *   tied to 1.6 regrowth. The rect (surveyed: 130..141 x 120..131,
 *   15 trees, centre 18 from camp, approach 25 steps) is the
 *   settlement's planned wood source — its trees are LUMBER jobs
 *   (not chop jobs) once designated, claimed in row-major order
 *   (the rotation: fell section by section across the rect).
 *   Each felled tree plants a sapling (fellTreeToCarrier, the
 *   1.6 path), so the site thins as the crew works it and regrows
 *   over ~7 days as saplings mature — a felled section refills
 *   and the crew rotates back to it. The lumber term is the chop
 *   formula without the distance penalty (the site is a planned
 *   destination, not a nearest-tree search), so the designated
 *   site is the preferred wood source while it has trees.
 *
 * GATES (the M1069 guard): all three sites open on day 3 (like
 * the storehouse / well / bridge) — the 24h window never sees a
 * mine, a quarry site, or a lumber job, so the 1087 baseline
 * numbers cannot move. The mine additionally needs the storehouse
 * done (ore has nowhere to go before storage exists). The quarry
 * site needs reachable rocks; the lumber site needs trees in its
 * rect. None of the three invents a resource: ore comes out of a
 * counted deposit, stone out of counted rocks, wood out of counted
 * trees — every transfer conserves through the registry.
 *
 * PERSISTENCE: the sites + carried ore ride in the founders save
 * (v11 — v10 migrates with no sites and no carried ore). The
 * board itself is session-only (rebuilt from the world + the
 * saved sites on load). The deposit / rock / tree depletion is
 * the world's own persistence (mineralDeposits, removedRocks,
 * removedTrees + saplings), so a reload keeps the sites' work.
 *
 * Pure module (no React, no WebGL, no localStorage) so the sim
 * and the standalone asserts can import it directly.
 */

import { FOUNDER_CAMP, FOUNDER_WORK_RADIUS, type FounderState } from './founders';
import { applyDepletion, mineralDepositEntry, type MineralDeposit, type MineralKind } from './geology';
import { addDeposit, carrierStoreId, depositInto, extractDeposit, storeQty, type ResourceRegistry } from './resourceRegistry';
import { rocksInRadius, quarryWorkTile } from './quarry';
import { planPathNpc } from './townsfolk3d';
import type { IsoWorld } from '../iso/isoWorld';

/** The day the mine, the quarry site, and the lumber site open. */
export const MINE_START_DAY = 3;
/** The quarry site and the lumber site open the same day. */
export const QUARRY_START_DAY = 3;
export const LUMBER_START_DAY = 3;
/** The mine's mineral — the acceptance test names iron, and the
 *  nearest live iron deposit to camp is the first mine. Coal is
 *  the second mine (Phase 3.4 — the smelter burns it); the
 *  designation takes the mineral as a parameter. */
export const MINE_MINERAL: MineralKind = 'iron';
/** Ore per miner shift — the quarry's deposit visit (2 stone). */
export const MINE_ORE_PER_SHIFT = 2;
/** Ticks per miner shift — FOUNDER_MINE_TICKS (the quarry's shift). */
export const MINE_TICKS_PER_SHIFT = 3;
/** The storehouse stockpile goal for iron — the miner works until
 *  the storehouse holds this much, then stops (the smelter is the
 *  iron sink now; smelting is Phase 3.4). */
export const MINE_IRON_TARGET = 20;
/** The storehouse stockpile goal for coal — the coal miner works
 *  until the storehouse holds this much, then stops (the smelter
 *  is the coal sink; the same size as the iron target). */
export const MINE_COAL_TARGET = 20;
/** The mine claims deposits inside the founder work radius. */
/** The mine claim radius — the founders' work radius, read at call
 *  time (a module-level `= FOUNDER_WORK_RADIUS` evaluates
 *  before founders.ts assigns it, so it would be undefined and no
 *  deposit would ever be in radius). */
export function mineClaimRadius(): number {
  return FOUNDER_WORK_RADIUS;
}
/** Rocks within this radius of the site centre are the site's
 *  rocks. Surveyed: the far pair (148,94)+(157,81) is 22 apart,
 *  so 25 covers it from either centre; the near pair is 14 apart. */
export const QUARRY_SITE_RADIUS = 25;
/** The quarry search radius: the site is designated while the
 *  storehouse needs stone, when the quarry claim radius is 100
 *  (STOREHOUSE_QUARRY_RADIUS) — the search must see the same rocks
 *  the crew can claim. Surveyed: the day-3 site's far rock (157,81)
 *  is 72 from camp, past the 60 work radius, so a 60 search finds
 *  no 2-rock cluster and returns null. */
export const QUARRY_SITE_SEARCH_RADIUS = 100;
/** The quarry crew: up to 2 founders in parallel (vs ad-hoc's 1). */
export const QUARRY_CREW_SIZE = 2;
/** The lumber rect (surveyed on the real fresh world): 12x12 at
 *  the forest edge east of the huts, 15 trees, centre 18 from
 *  camp, approach 25 steps. No hut / storehouse / farm / river
 *  tile inside it; the rect starts east of hut 0 (x 130 > 129). */
export const LUMBER_RECT = { x0: 130, y0: 120, x1: 141, y1: 131 };

/** A mine site's state: open (the deposit lives) or exhausted. */
export type MineSiteState = 'open' | 'exhausted';
/** One mine: a designation over a live mineral deposit. */
export type MineSite = {
  id: string;
  depositId: string;
  mineral: MineralKind;
  x: number;
  y: number;
  workTile: { x: number; y: number };
  state: MineSiteState;
  shiftsCompleted: number;
  oreMined: number;
};
/** One quarry: a designation over a rock cluster. */
export type QuarrySite = {
  id: string;
  centre: { x: number; y: number };
  radius: number;
  state: MineSiteState;
  stonesMined: number;
};
/** One lumber site: a designation over a forest-edge rect. */
export type LumberSite = {
  id: string;
  rect: { x0: number; y0: number; x1: number; y1: number };
  state: MineSiteState;
  treesFelled: number;
};
/** The mines state: the sites (saved, v11) + nothing else — the
 *  board is session-only and rebuilt from these + the world. */
export type MineState = {
  mines: MineSite[];
  quarry: QuarrySite | null;
  lumber: LumberSite | null;
  /** The last day the sites were designated (the once-a-day gate —
   * the quarry designation runs A*, so it must never run every tick). */
  lastDesignateDay: number;
};

/** A fresh mines state: no mine, no quarry site, no lumber site. */
export function freshMineState(): MineState {
  return { mines: [], quarry: null, lumber: null, lastDesignateDay: 1 };
}

/** The mine site id for a deposit. */
export function mineSiteIdFor(depositId: string): string {
  return 'mine:' + depositId;
}
/** The quarry site id for its centre rock. */
export function quarrySiteIdFor(x: number, y: number): string {
  return 'quarry:' + x + ',' + y;
}
/** The lumber site id for its rect. */
export function lumberSiteIdFor(rect: { x0: number; y0: number }): string {
  return 'lumber:' + rect.x0 + ',' + rect.y0;
}

/** Live mineral deposits of one kind within maxDist (Manhattan)
 *  of a point — the quarry's stoneDepositsInRadius, for ore. */
export function mineralDepositsInRadius(
  world: IsoWorld,
  mineral: MineralKind,
  x: number,
  y: number,
  maxDist: number,
): MineralDeposit[] {
  return ((world.mineralDeposits ?? []).filter(
    (d) => d.mineral === mineral && d.remaining > 0 && Math.abs(d.x - x) + Math.abs(d.y - y) <= maxDist,
  ) as unknown) as MineralDeposit[];
}

/** The walkable tile a miner stands on to work a deposit — the
 *  quarry's radius-2 rule (a deposit nobody can stand beside is
 *  not work). */
export function mineWorkTile(world: IsoWorld, x: number, y: number): { x: number; y: number } | null {
  return quarryWorkTile(world, x, y);
}

/** Round-trip reachability: a path from camp to the tile AND back
 *  inside the default budget (the 1087 round-trip rule — a rock
 *  across a river has an outbound path but strands the founder
 *  on the return). */
function roundTripReachable(world: IsoWorld, tile: { x: number; y: number }): boolean {
  return (
    planPathNpc(world, { x: FOUNDER_CAMP.x, y: FOUNDER_CAMP.y }, tile) !== null &&
    planPathNpc(world, tile, { x: FOUNDER_CAMP.x, y: FOUNDER_CAMP.y }) !== null
  );
}

/**
 * Designate the mine for one mineral (iron by default, coal for
 * the second mine): the nearest live deposit of that mineral
 * inside the claim radius with a walkable work tile and a
 * round-trip path.
 * Gated on day 3 + the storehouse done (ore has nowhere to go
 * before storage exists). Idempotent: an open site for the same
 * deposit is returned unchanged; an exhausted site's deposit is
 * never re-designated (the next nearest live deposit is picked
 * instead — when (84,111) empties, the mine moves to (180,123)).
 * Returns null when nothing is designatable. Pure (A* only — the
 * caller decides when to call it, once per day at most).
 */
export function designateMine(
  world: IsoWorld,
  day: number,
  storehouseDone: boolean,
  existing: MineSite[],
  mineral: MineralKind = MINE_MINERAL,
): MineSite | null {
  if (day < MINE_START_DAY || !storehouseDone) return null;
  const open = existing.find((s) => s.state === 'open' && s.mineral === mineral);
  if (open) return open;
  const taken = new Set(existing.map((s) => s.depositId));
  let best: MineralDeposit | null = null;
  let bestWorkTile: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const d of mineralDepositsInRadius(world, mineral, FOUNDER_CAMP.x, FOUNDER_CAMP.y, mineClaimRadius())) {
    if (taken.has('deposit:' + d.mineral + ':' + d.x + ',' + d.y)) continue;
    const wt = mineWorkTile(world, d.x, d.y);
    if (!wt || !roundTripReachable(world, wt)) continue;
    const dist = Math.abs(d.x - FOUNDER_CAMP.x) + Math.abs(d.y - FOUNDER_CAMP.y);
    if (dist >= bestD) continue;
    bestD = dist;
    best = d;
    bestWorkTile = wt;
  }
  if (!best || !bestWorkTile) return null;
  const depositId = 'deposit:' + best.mineral + ':' + best.x + ',' + best.y;
  return {
    id: mineSiteIdFor(depositId),
    depositId,
    mineral: best.mineral,
    x: best.x,
    y: best.y,
    workTile: bestWorkTile,
    state: 'open',
    shiftsCompleted: 0,
    oreMined: 0,
  };
}

/**
 * Designate the quarry site: the best reachable rock cluster —
 * the centre rock (within the work radius) with the most
 * round-trip-reachable rocks inside QUARRY_SITE_RADIUS, ties to
 * the nearest centre. Gated on day 3. A cluster of one is never a
 * site (a single rock is one job — a crew of 2 cannot work it in
 * parallel — so the designation returns null and the founders
 * quarry ad-hoc instead). Idempotent: an open site is returned
 * unchanged. Returns null when nothing is designatable. Pure
 * (A* once per rock, once per designation — the caller calls it
 * only when there is no site).
 */
export function designateQuarry(world: IsoWorld, day: number, existing: QuarrySite | null): QuarrySite | null {
  if (day < QUARRY_START_DAY) return null;
  if (existing && existing.state === 'open') return existing;
  const rocks = rocksInRadius(world, FOUNDER_CAMP.x, FOUNDER_CAMP.y, QUARRY_SITE_SEARCH_RADIUS);
  // Reachability once per rock (not once per pair): a rock the
  // crew cannot reach never counts toward a cluster.
  const reachable = new Map<string, boolean>();
  for (const r of rocks) {
    const wt = quarryWorkTile(world, r.tx, r.ty);
    reachable.set(r.tx + ',' + r.ty, !!wt && roundTripReachable(world, wt));
  }
  let best: { cx: number; cy: number; count: number; dist: number } | null = null;
  for (const c of rocks) {
    if (!reachable.get(c.tx + ',' + c.ty)) continue;
    let count = 0;
    for (const r of rocks) {
      if (!reachable.get(r.tx + ',' + r.ty)) continue;
      if (Math.abs(r.tx - c.tx) + Math.abs(r.ty - c.ty) <= QUARRY_SITE_RADIUS) count++;
    }
    if (count < 2) continue;
    const dist = Math.abs(c.tx - FOUNDER_CAMP.x) + Math.abs(c.ty - FOUNDER_CAMP.y);
    if (!best || count > best.count || (count === best.count && dist < best.dist)) {
      best = { cx: c.tx, cy: c.ty, count, dist };
    }
  }
  if (!best) return null;
  return {
    id: quarrySiteIdFor(best.cx, best.cy),
    centre: { x: best.cx, y: best.cy },
    radius: QUARRY_SITE_RADIUS,
    state: 'open',
    stonesMined: 0,
  };
}

/**
 * Designate the lumber site: the surveyed forest-edge rect.
 * Gated on day 3. The rect is fixed (surveyed once — the site
 * is the designation, not a search), so this is a pure
 * constructor; the site's trees are read live from the world
 * (they thin as the crew fells them and refill as saplings
 * mature). Idempotent: an open site is returned unchanged.
 */
export function designateLumber(world: IsoWorld, day: number, existing: LumberSite | null): LumberSite | null {
  if (day < LUMBER_START_DAY) return null;
  if (existing && existing.state === 'open') return existing;
  return {
    id: lumberSiteIdFor(LUMBER_RECT),
    rect: { ...LUMBER_RECT },
    state: 'open',
    treesFelled: 0,
  };
}

/** The trees standing in a rect (row-major — the felling
 *  rotation: the crew claims them in this order). */
export function lumberTreesInRect(
  world: IsoWorld,
  rect: { x0: number; y0: number; x1: number; y1: number },
): { tx: number; ty: number }[] {
  const inRect = new Set<string>();
  for (const t of world.trees ?? []) {
    if (t.tx >= rect.x0 && t.tx <= rect.x1 && t.ty >= rect.y0 && t.ty <= rect.y1) {
      inRect.add(t.tx + ',' + t.ty);
    }
  }
  const out: { tx: number; ty: number }[] = [];
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (inRect.has(x + ',' + y)) out.push({ tx: x, ty: y });
    }
  }
  return out;
}

/** The rocks standing in a quarry site (within its radius of its
 *  centre) — the crew's rocks, read live (consumed rocks leave). */
export function quarrySiteRocks(world: IsoWorld, site: QuarrySite): { tx: number; ty: number }[] {
  return rocksInRadius(world, site.centre.x, site.centre.y, site.radius);
}

/** True when a tile is one of the quarry site's rocks (the crew
 *  cap applies to jobs on these targets, not to ad-hoc rocks). */
export function isQuarrySiteRock(site: QuarrySite | null, x: number, y: number): boolean {
  if (!site || site.state !== 'open') return false;
  return Math.abs(x - site.centre.x) + Math.abs(y - site.centre.y) <= site.radius;
}

/**
 * Mine one shift of ore into a founder's carrier. Called ONLY
 * when the founder has arrived (the tick's 'miningOre' state) —
 * never while walking, never from a distance (the quarry's
 * arrival gate). The deposit depletes by the shift yield and the
 * registry entry is updated to match (removed when mined out —
 * the 1081 depleteDeposit pattern); the yield lands in the
 * founder's carrier store (capacity 2 — the real carry limit),
 * with the deposit as its source. Returns the new registry, the
 * yield (0 when the deposit is gone), and the source id. Pure.
 */
export function mineOreToCarrier(
  registry: ResourceRegistry,
  world: IsoWorld,
  f: FounderState,
  site: MineSite,
): { registry: ResourceRegistry; yield: number; sourceId: string | null } {
  const deposits = (world.mineralDeposits ?? []) as unknown as MineralDeposit[];
  const deposit = deposits.find((d) => 'deposit:' + d.mineral + ':' + d.x + ',' + d.y === site.depositId);
  if (!deposit || deposit.remaining <= 0) return { registry, yield: 0, sourceId: null };
  const qty = Math.min(MINE_ORE_PER_SHIFT, deposit.remaining);
  const res = applyDepletion(deposits, site.depositId, qty);
  if (!res.depleted) return { registry, yield: 0, sourceId: null };
  world.mineralDeposits = res.deposits as unknown as IsoWorld['mineralDeposits'];
  let next = registry;
  if (res.depleted.remaining <= 0) {
    next = extractDeposit(next, site.depositId).registry;
  } else {
    next = addDeposit(next, mineralDepositEntry(res.depleted));
  }
  const deposited = depositInto(
    next,
    carrierStoreId(f.id),
    site.mineral,
    qty,
    { type: 'entity', id: site.depositId },
    { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id },
  );
  return { registry: deposited.registry, yield: deposited.added, sourceId: site.depositId };
}

/** Ore of a kind in the storehouse store (0 when it never held any). */
export function storehouseOreInRegistry(registry: ResourceRegistry, kind: MineralKind): number {
  return storeQty(registry, 'storehouse', kind);
}

/** Ore of a kind in the camp store (0 when it never held any —
 *  the overflow when the storehouse is full for that kind). */
export function campOreInRegistry(registry: ResourceRegistry, kind: MineralKind): number {
  return storeQty(registry, 'camp', kind);
}

/** The mine site for a deposit id, or null. */
export function mineSiteForDeposit(sites: MineSite[], depositId: string): MineSite | null {
  return sites.find((s) => s.depositId === depositId) ?? null;
}

/** The open mine site, or null (the miner's job target). */
export function openMineSite(state: MineState): MineSite | null {
  return state.mines.find((s) => s.state === 'open') ?? null;
}

/** All open mine sites — the job board discovers one mine job per
 *  open site (BUILD 1095: the iron mine AND the coal mine), so
 *  two miners work in parallel. Pure. */
export function openMineSites(state: MineState): MineSite[] {
  return state.mines.filter((s) => s.state === 'open');
}

/** The mineral a founder is mining (or carrying) — the site's
 *  mineral when they are walking to / working a mine, the carried
 *  kind when they are carrying ore back, null when they are not
 *  mining. The per-mineral taken guards (ironTaken / coalTaken)
 *  read it, so two miners work in parallel (one per mine). A
 *  mine site's mineral is iron or coal; anything else reads as
 *  iron (the pre-1095 default). Pure. */
export function founderMiningMineral(f: FounderState, mines: MineState): 'iron' | 'coal' | null {
  if (f.carryingOre > 0) return f.carryingOreKind ?? 'iron';
  if ((f.workState === 'toMine' || f.workState === 'miningOre') && f.mineTarget) {
    const site = mines.mines.find((s) => s.id === f.mineTarget!.id);
    if (site) return site.mineral === 'coal' ? 'coal' : 'iron';
    return 'iron';
  }
  return null;
}

/**
 * Reconcile the sites against the world (the bridge/storehouse
 * pattern): a mine whose deposit is mined out (remaining 0 or
 * gone) flips to 'exhausted'; a quarry whose rocks are all gone
 * flips to 'exhausted'; a lumber site with no trees in its rect
 * flips to 'exhausted' — and flips back to 'open' when saplings
 * mature into trees (the felling rotation: the site re-opens for
 * the next rotation). Returns the same state object when nothing
 * changed (the tick detects a change by identity). Pure.
 */
export function reconcileMines(state: MineState, world: IsoWorld): MineState {
  let mines = state.mines;
  let changed = false;
  const deposits = (world.mineralDeposits ?? []) as unknown as MineralDeposit[];
  for (let i = 0; i < mines.length; i++) {
    const s = mines[i];
    const d = deposits.find((x) => 'deposit:' + x.mineral + ':' + x.x + ',' + x.y === s.depositId);
    const exhausted = !d || d.remaining <= 0;
    if (exhausted && s.state !== 'exhausted') {
      mines = mines.map((m, j) => (j === i ? { ...m, state: 'exhausted' as const } : m));
      changed = true;
    }
  }
  let quarry = state.quarry;
  if (quarry && quarry.state === 'open' && quarrySiteRocks(world, quarry).length === 0) {
    quarry = { ...quarry, state: 'exhausted' };
    changed = true;
  }
  let lumber = state.lumber;
  if (lumber) {
    const trees = lumberTreesInRect(world, lumber.rect).length;
    if (trees === 0 && lumber.state !== 'exhausted') {
      lumber = { ...lumber, state: 'exhausted' };
      changed = true;
    } else if (trees > 0 && lumber.state !== 'open') {
      lumber = { ...lumber, state: 'open' };
      changed = true;
    }
  }
  if (!changed) return state;
  return { mines, quarry, lumber, lastDesignateDay: state.lastDesignateDay };
}

/** Validate a saved mine site (the migration shape check — a
 *  corrupt entry is dropped, never guessed at). */
export function validateMineSite(value: unknown): MineSite | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const depositId = typeof v.depositId === 'string' ? v.depositId : '';
  const mineral = v.mineral === 'iron' || v.mineral === 'copper' || v.mineral === 'coal' || v.mineral === 'gold' || v.mineral === 'silver' ? (v.mineral as MineralKind) : null;
  const x = Number(v.x);
  const y = Number(v.y);
  const wt = v.workTile as Record<string, unknown> | undefined;
  const wx = Number(wt?.x);
  const wy = Number(wt?.y);
  if (!depositId || !mineral || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(wx) || !Number.isInteger(wy)) return null;
  const state = v.state === 'exhausted' ? 'exhausted' : 'open';
  return {
    id: mineSiteIdFor(depositId),
    depositId,
    mineral,
    x,
    y,
    workTile: { x: wx, y: wy },
    state,
    shiftsCompleted: Math.max(0, Math.round(Number(v.shiftsCompleted) || 0)),
    oreMined: Math.max(0, Math.round(Number(v.oreMined) || 0)),
  };
}

/** Validate a saved quarry site. */
export function validateQuarrySite(value: unknown): QuarrySite | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const c = v.centre as Record<string, unknown> | undefined;
  const cx = Number(c?.x);
  const cy = Number(c?.y);
  const radius = Number(v.radius);
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isFinite(radius) || radius <= 0) return null;
  return {
    id: quarrySiteIdFor(cx, cy),
    centre: { x: cx, y: cy },
    radius: Math.round(radius),
    state: v.state === 'exhausted' ? 'exhausted' : 'open',
    stonesMined: Math.max(0, Math.round(Number(v.stonesMined) || 0)),
  };
}

/** Validate a saved lumber site. */
export function validateLumberSite(value: unknown): LumberSite | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const r = v.rect as Record<string, unknown> | undefined;
  const x0 = Number(r?.x0);
  const y0 = Number(r?.y0);
  const x1 = Number(r?.x1);
  const y1 = Number(r?.y1);
  if (!Number.isInteger(x0) || !Number.isInteger(y0) || !Number.isInteger(x1) || !Number.isInteger(y1) || x1 < x0 || y1 < y0) return null;
  return {
    id: lumberSiteIdFor({ x0, y0 }),
    rect: { x0, y0, x1, y1 },
    state: v.state === 'exhausted' ? 'exhausted' : 'open',
    treesFelled: Math.max(0, Math.round(Number(v.treesFelled) || 0)),
  };
}

/** Validate a saved mines state (the migration shape check). */
export function validateMineState(value: unknown): MineState {
  if (!value || typeof value !== 'object') return freshMineState();
  const v = value as Record<string, unknown>;
  const mines: MineSite[] = [];
  if (Array.isArray(v.mines)) {
    for (const raw of v.mines) {
      const s = validateMineSite(raw);
      if (s) mines.push(s);
    }
  }
  const lastDesignateDay =
    typeof v.lastDesignateDay === 'number' && Number.isFinite(v.lastDesignateDay)
      ? Math.floor(v.lastDesignateDay)
      : 1;
  return { mines, quarry: validateQuarrySite(v.quarry), lumber: validateLumberSite(v.lumber), lastDesignateDay };
}

/** The mines state as a one-line summary for the HUD / E report. */
export function mineSummaryText(state: MineState, world: IsoWorld, registry: ResourceRegistry): string {
  const mine = openMineSite(state);
  const iron = storehouseOreInRegistry(registry, 'iron');
  const parts: string[] = [];
  if (mine) {
    const d = ((world.mineralDeposits ?? []) as unknown as MineralDeposit[]).find(
      (x) => 'deposit:' + x.mineral + ':' + x.x + ',' + x.y === mine.depositId,
    );
    parts.push('Mine ' + (d ? d.remaining + ' iron left' : 'exhausted') + ' · storehouse iron ' + iron);
  } else {
    parts.push('Mine — · storehouse iron ' + iron);
  }
  if (state.quarry) {
    parts.push('Quarry ' + quarrySiteRocks(world, state.quarry).length + ' rocks · ' + state.quarry.stonesMined + ' stone');
  } else {
    parts.push('Quarry —');
  }
  if (state.lumber) {
    parts.push('Lumber ' + lumberTreesInRect(world, state.lumber.rect).length + ' trees · ' + state.lumber.treesFelled + ' felled');
  } else {
    parts.push('Lumber —');
  }
  return parts.join(' · ');
}
