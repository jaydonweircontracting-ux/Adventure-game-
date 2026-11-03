/**
 * BUILD 993 — 3D townsfolk presence + schedules (pure module, no React).
 *
 * Scope is deliberately narrow: presence + schedules ONLY. No dialogue, no
 * economy, no needs, no memories/relationships, no combat, no quests. The
 * town simply reads as populated: the 2.5D Mosslight roster walks the 3D
 * town on daily schedules.
 *
 * How it works:
 *  - ROSTER_3D mirrors townsfolk.ts ROSTER exactly (same order, so index i
 *    is townsfolk-i, same names/archetypes/roles/homeKeys). The standalone
 *    asserts prove the mirror against createTownsfolk, so a roster edit in
 *    townsfolk.ts that is not mirrored here fails loudly instead of
 *    silently depopulating the town.
 *  - Schedules are the REAL 2.5D schedule: scheduleTileFor calls
 *    townsfolkTarget with a synthetic Townsperson + synthetic clock, so
 *    jitter, guard shifts, market windows, and child phases all match the
 *    2.5D game. Only the ANCHORS are 3D: home/tavern/chapel/guild points
 *    are hut doorsteps (hutExitPoint — NPCs never step inside a house,
 *    keeping the 990 rule), plaza/stalls/gardens/patrol are real 3D tiles.
 *  - Home mapping: a 2.5D homeKey resolves to the 3D hut converted from
 *    the layout lot with that id (pinned lots keep their ids through
 *    toChunkSpace). filler-1 is the first filler lot, matched by footprint
 *    against mosslightFillerLots()[0] (the 2.5D definition), not by a
 *    fragile index. Matching is by exact hut rect, so the mapping survives
 *    undo (which restores bare rects) without any HutRect type change.
 *  - The adapter's lot->hut conversion is mirrored here (tile/clamp/door).
 *    If the adapter ever changes, the asserts (every homeKey maps to a
 *    real hut) fail loudly.
 *  - Indoors phases: the 2.5D game hides indoors NPCs (they sleep in beds).
 *    3D NPCs cannot enter houses (990 rule), so indoors phases render as
 *    the NPC standing at their home doorstep. The town stays populated at
 *    night instead of emptying for 8 hours.
 *  - No bank point: the 3D demo world has no bank building, so Brand
 *    follows the standard merchant path (stall all day) instead of bank
 *    mornings. The 982 bank is a main-game building, untouched.
 *  - Movement is A* routing on the 900ms timer (1 tile/tick, the demo's
 *    speed), following a cached path that replans when the destination
 *    changes or a path tile becomes unwalkable. This is a DELIBERATE
 *    deviation from the brief's "wait rather than pathfind" note, forced
 *    by measurement: dominant-axis greedy arrived on 6 of 32 home->
 *    plaza/tavern routes, no-backtrack greedy paced 14-step circles
 *    around hut+crate pockets, and visited-set greedy wandered up to
 *    2000 steps without arriving (43/64). Local rules cannot walk this
 *    town — its hut walls, door pockets, and crate lines trap them — so
 *    schedule movement plans tile routes instead. What survives of the
 *    984 wart: a destination with NO route (sealed on all sides, e.g. a
 *    placed item closing the only gap) still waits and retries on the
 *    next phase; nothing teleports and no wait is permanent (phases
 *    retarget every 30-120 real seconds at 1 game-minute/second).
 *  - Removed-home / removed-workplace fallback: hut lookups run LIVE on
 *    every tick against the current world.huts (removal splices that array
 *    mid-session), so a removed home, tavern, chapel, or guild hut falls
 *    back to the plaza immediately — the NPC never walks into a removed
 *    rect and never stands on a removed doorstep.
 */

import { townsfolkTarget, type TownsfolkAnchors, type TownsfolkArchetype, type TownsfolkRole, type Townsperson } from '../townsfolk';
import type { WorldClockState } from '../worldCore';
import { mosslightEngineChunkLayout, mosslightFillerLots } from '../mosslightLayout';
import { terrainAt, type HutRect, type IsoWorld } from '../iso/isoWorld';
import { hutExitPoint } from './interiors';
import { walkableWithPlacements } from './placements';

/** Mirror of townsfolk.ts ROSTER (order preserved: index i = townsfolk-i). */
export type RosterNpc3D = {
  name: string;
  gender: 'male' | 'female';
  archetype: TownsfolkArchetype;
  role: TownsfolkRole;
  homeKey: string;
};

export const ROSTER_3D: RosterNpc3D[] = [
  // --- Original 13 (order preserved for save compatibility) ---
  { name: 'Aldric', gender: 'male', archetype: 'farmer', role: 'guide', homeKey: 'cottage-6' },
  { name: 'Brenna', gender: 'female', archetype: 'farmer', role: 'guide', homeKey: 'cottage-6' },
  { name: 'Cedric', gender: 'male', archetype: 'merchant', role: 'mage', homeKey: 'cottage-2' },
  { name: 'Father Aldous', gender: 'male', archetype: 'priest', role: 'mage', homeKey: 'chapel' },
  { name: 'Rowan', gender: 'female', archetype: 'guard', role: 'warrior', homeKey: 'town-n1' },
  { name: 'Kess', gender: 'female', archetype: 'guard', role: 'warrior', homeKey: 'town-n1' },
  { name: 'Tom', gender: 'male', archetype: 'smith', role: 'warrior', homeKey: 'town-n2' },
  { name: 'Mabel', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'cottage-4' },
  { name: 'Dunstan', gender: 'male', archetype: 'commoner', role: 'guide', homeKey: 'cottage-5' },
  { name: 'Elsa', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'town-n2' },
  { name: 'Wren', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'cottage-4' },
  { name: 'Pip', gender: 'male', archetype: 'commoner', role: 'warrior', homeKey: 'cottage-2' },
  { name: 'Bryn', gender: 'female', archetype: 'farmer', role: 'guide', homeKey: 'cottage-1' },
  // --- BUILD 699: 25 new townsfolk in households ---
  { name: 'Ash', gender: 'male', archetype: 'commoner', role: 'warrior', homeKey: 'cottage-6' },
  { name: 'Lily', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'cottage-6' },
  { name: 'Sella', gender: 'female', archetype: 'merchant', role: 'mage', homeKey: 'cottage-2' },
  { name: 'Garrick', gender: 'male', archetype: 'commoner', role: 'guide', homeKey: 'cottage-3' },
  { name: 'Hilda', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'cottage-3' },
  { name: 'Fen', gender: 'male', archetype: 'commoner', role: 'warrior', homeKey: 'cottage-3' },
  { name: 'Odo', gender: 'male', archetype: 'commoner', role: 'warrior', homeKey: 'cottage-4' },
  { name: 'Petra', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'cottage-5' },
  { name: 'Ned', gender: 'male', archetype: 'commoner', role: 'warrior', homeKey: 'cottage-5' },
  { name: 'Cole', gender: 'male', archetype: 'farmer', role: 'guide', homeKey: 'cottage-1' },
  { name: 'Sage', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'cottage-1' },
  { name: 'Brand', gender: 'male', archetype: 'merchant', role: 'warrior', homeKey: 'town-s1' },
  { name: 'Tilda', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'town-s1' },
  { name: 'Kit', gender: 'male', archetype: 'commoner', role: 'warrior', homeKey: 'town-s1' },
  { name: 'Finn', gender: 'male', archetype: 'commoner', role: 'guide', homeKey: 'town-s2' },
  { name: 'Willa', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'town-s2' },
  { name: 'Ham', gender: 'male', archetype: 'farmer', role: 'guide', homeKey: 'town-e1' },
  { name: 'Rosa', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'town-e1' },
  { name: 'Bede', gender: 'male', archetype: 'commoner', role: 'mage', homeKey: 'town-e1' },
  { name: 'Corb', gender: 'male', archetype: 'guard', role: 'warrior', homeKey: 'town-e2' },
  { name: 'Liss', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'town-e2' },
  { name: 'Jory', gender: 'male', archetype: 'smith', role: 'warrior', homeKey: 'town-w2' },
  { name: 'Ess', gender: 'female', archetype: 'merchant', role: 'mage', homeKey: 'town-w2' },
  { name: 'Sten', gender: 'male', archetype: 'commoner', role: 'guide', homeKey: 'filler-1' },
  { name: 'Aya', gender: 'female', archetype: 'commoner', role: 'mage', homeKey: 'filler-1' },
  // --- BUILD 958: class teachers (townsfolk-38..41) ---
  { name: 'Dain', gender: 'male', archetype: 'teacher', role: 'warrior', homeKey: 'guild' },
  { name: 'Sable', gender: 'female', archetype: 'teacher', role: 'mage', homeKey: 'guild' },
  { name: 'Puck', gender: 'male', archetype: 'teacher', role: 'rogue', homeKey: 'guild' },
  { name: 'Wynn', gender: 'female', archetype: 'teacher', role: 'guide', homeKey: 'guild' },
  // --- BUILD 979: 5 children, appended LAST (townsfolk-42..46) ---
  { name: 'Tansy', gender: 'female', archetype: 'child', role: 'guide', homeKey: 'cottage-1' },
  { name: 'Milo', gender: 'male', archetype: 'child', role: 'guide', homeKey: 'cottage-2' },
  { name: 'Nia', gender: 'female', archetype: 'child', role: 'guide', homeKey: 'cottage-3' },
  { name: 'Joss', gender: 'male', archetype: 'child', role: 'guide', homeKey: 'cottage-4' },
  { name: 'Tove', gender: 'female', archetype: 'child', role: 'guide', homeKey: 'cottage-5' },
];

const ARCHETYPE_BY_NAME = new Map(ROSTER_3D.map((n) => [n.name, n.archetype]));
/** Archetype for render scale (children render at 0.7, per 979) and probes. */
export function rosterArchetype(name: string): TownsfolkArchetype | null {
  return ARCHETYPE_BY_NAME.get(name) ?? null;
}

// ---------------------------------------------------------------- clock

export type DayClock = { minutes: number; day: number };
export const CLOCK_KEY = 'ag-3d-clock-v1';

/** Load the persisted 3D day clock. Default 08:00 day 1: the town is awake. */
export function loadClock(): DayClock {
  try {
    const raw = localStorage.getItem(CLOCK_KEY);
    if (raw) {
      const c = JSON.parse(raw) as DayClock;
      if (Number.isFinite(c.minutes) && Number.isFinite(c.day)) {
        return { minutes: ((Math.floor(c.minutes) % 1440) + 1440) % 1440, day: Math.max(0, Math.floor(c.day)) };
      }
    }
  } catch { /* fresh clock */ }
  return { minutes: 480, day: 1 };
}

export function saveClock(c: DayClock): void {
  try { localStorage.setItem(CLOCK_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

// ------------------------------------------------------- layout conversion
// Mirror of applyMosslightTownLayout's lot->hut math (Engine3DWorldView).
// tile(v) = 100 + (v - 140) * 0.42; clamp to 2..197; door by facing.

const townTile = (v: number) => 100 + (v - 140) * 0.42;
const clampTile = (v: number) => Math.max(2, Math.min(197, Math.round(v)));

type LotShape = {
  id: string;
  kind: string;
  pinned?: boolean;
  facing: string;
  footprint: { left: number; top: number; right: number; bottom: number };
};

function lotHutRect(lot: LotShape): HutRect {
  const r = lot.footprint;
  const x0 = clampTile(Math.floor(townTile(r.left)));
  const y0 = clampTile(Math.floor(townTile(r.top)));
  const x1 = clampTile(Math.max(x0, Math.floor(townTile(r.right))));
  const y1 = clampTile(Math.max(y0, Math.floor(townTile(r.bottom))));
  const midX = Math.round((x0 + x1) / 2);
  const midY = Math.round((y0 + y1) / 2);
  const door = lot.facing === 'north' ? { x: midX, y: y0 }
    : lot.facing === 'south' ? { x: midX, y: y1 }
    : lot.facing === 'west' ? { x: x0, y: midY } : { x: x1, y: midY };
  return { x0, y0, x1, y1, doorX: door.x, doorY: door.y };
}

/**
 * The 3D hut for a 2.5D homeKey, or null when the hut is not in the world
 * (removed via Build, or never generated). Pinned keys match the layout
 * lot id; filler-1 matches the first filler lot by footprint against
 * mosslightFillerLots()[0] (the 2.5D definition). Matching is by exact hut
 * rect, so it survives undo restoring bare rects.
 */
export function homeHutFor(homeKey: string, world: IsoWorld): HutRect | null {
  const layout = mosslightEngineChunkLayout();
  let lot: LotShape | null = null;
  if (homeKey === 'filler-1') {
    const first = mosslightFillerLots()[0];
    if (!first) return null;
    const r = first.rect;
    lot = (layout.lots as LotShape[]).find((l) => l.kind === 'building' && !l.pinned
      && l.footprint.left === r.left && l.footprint.top === r.top
      && l.footprint.right === r.right && l.footprint.bottom === r.bottom)
      ?? (layout.lots as LotShape[]).find((l) => l.kind === 'building' && !l.pinned)
      ?? null;
  } else {
    lot = (layout.lots as LotShape[]).find((l) => l.kind === 'building' && l.id === homeKey) ?? null;
  }
  if (!lot) return null;
  const rect = lotHutRect(lot);
  return world.huts.find((h) => h.x0 === rect.x0 && h.y0 === rect.y0 && h.x1 === rect.x1 && h.y1 === rect.y1) ?? null;
}

/** Doorstep tile for a hut: the exit point, strictly outside the hut. */
export function doorstepOf(hut: HutRect): { x: number; y: number } {
  return hutExitPoint(hut);
}

// ------------------------------------------------------------- quantization

/**
 * NPC step rule: walkable AND never on any hut tile — door tiles count
 * as inside (the 990 rule extended to transit: NPCs never enter houses,
 * not even the doorway). Stricter than the player's walkable check, which
 * must allow door tiles for Enter. Used for destinations AND steps, so an
 * NPC never stands on, or walks through, a house.
 */
export function npcWalkable(world: IsoWorld, x: number, y: number): boolean {
  if (world.huts.some((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1)) return false;
  return walkableWithPlacements(world, world.crates, x, y);
}

/**
 * Round a schedule point to the nearest NPC-walkable tile (never inside a
 * hut, door tiles excluded too — destinations never sit in doorways).
 * Spiral search to maxRadius, else null (caller falls back to the plaza).
 */
export function quantizeTile(world: IsoWorld, tx: number, ty: number, maxRadius = 4): { x: number; y: number } | null {
  if (npcWalkable(world, tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (npcWalkable(world, tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
      }
    }
  }
  return null;
}

/**
 * Tile A* route from `from` to `to` (4-directional, Manhattan heuristic),
 * or null when no route exists within maxNodes. Steps use npcWalkable,
 * so routes never cross hut tiles (door tiles included) and route around
 * placed blockers when another street exists; a sealed destination
 * returns null and the caller waits. Returns the steps to take, excluding
 * the start tile; [] when already there. The open list is a linear
 * min-scan — town routes are tens of tiles, and maxNodes caps sealed
 * scans — so plans stay cheap at phase-change frequency.
 * BUILD 998: `extraBlocked` excludes tiles by "x,y" key — the
 * persistent-block rule replans with the blocking tile excluded, so a
 * head-on or standing blocker is routed around instead of waited on
 * forever. Excluding the destination itself yields null (sealed).
 */
export function planPathNpc(
  world: IsoWorld,
  from: { x: number; y: number },
  to: { x: number; y: number },
  maxNodes = 4000,
  extraBlocked?: ReadonlySet<string>,
): { x: number; y: number }[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  const key = (x: number, y: number) => x + ',' + y;
  const open: { x: number; y: number; g: number; f: number }[] = [
    { x: from.x, y: from.y, g: 0, f: Math.abs(to.x - from.x) + Math.abs(to.y - from.y) },
  ];
  const came = new Map<string, string>();
  const gScore = new Map<string, number>([[key(from.x, from.y), 0]]);
  const closed = new Set<string>();
  let nodes = 0;
  while (open.length > 0 && nodes < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    nodes++;
    const curKey = key(cur.x, cur.y);
    if (closed.has(curKey)) continue;
    closed.add(curKey);
    if (cur.x === to.x && cur.y === to.y) {
      const path: { x: number; y: number }[] = [];
      let k = curKey;
      while (k !== key(from.x, from.y)) {
        const [x, y] = k.split(',').map(Number);
        path.push({ x, y });
        k = came.get(k)!;
      }
      return path.reverse();
    }
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = key(nx, ny);
      if (closed.has(nk) || (extraBlocked && extraBlocked.has(nk))) continue;
      if (!npcWalkable(world, nx, ny)) continue;
      const g = cur.g + 1;
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g);
        came.set(nk, curKey);
        open.push({ x: nx, y: ny, g, f: g + Math.abs(to.x - nx) + Math.abs(to.y - ny) });
      }
    }
  }
  return null;
}

// ------------------------------------------------------------ static anchors

export type StaticAnchors3D = {
  plaza: { x: number; y: number };
  stalls: { x: number; y: number }[];
  gardens: { x: number; y: number }[];
  patrol: { x: number; y: number }[];
};

/**
 * Anchors that never move mid-session: plaza, stall fronts, garden tiles,
 * patrol points. Hut-derived anchors (homes, tavern, chapel, guild) are
 * resolved LIVE per tick in buildAnchors, so a mid-session house removal
 * falls back to the plaza immediately. Built once per world load.
 */
export function buildStaticAnchors(world: IsoWorld): StaticAnchors3D {
  const layout = mosslightEngineChunkLayout();
  const plazaRaw = layout.plazas[0];
  const plazaCenter = plazaRaw
    ? { x: Math.round(townTile(plazaRaw.x)), y: Math.round(townTile(plazaRaw.y)) }
    : { x: 100, y: 100 };
  const plaza = quantizeTile(world, plazaCenter.x, plazaCenter.y, 6) ?? { x: 100, y: 100 };

  // Market stall fronts: the layout's stall props (kind 'stall') converted
  // to 3D tiles, front = the tile south of the prop, quantized. NOTE:
  // world.stalls is EMPTY in the 3D town (the adapter only converts SOLID
  // props to stalls, and the one stall prop is non-solid — 986: layout
  // props contain no solid stall kind). Merchants work this market spot;
  // if no stall prop survives, townsfolkTarget falls back to the plaza.
  const stalls: { x: number; y: number }[] = [];
  for (const p of layout.props) {
    if (p.kind !== 'stall') continue;
    const px = clampTile(Math.floor(townTile(p.x)));
    const py = clampTile(Math.floor(townTile(p.y)));
    if (world.huts.some((h) => px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1)) continue;
    const front = quantizeTile(world, px, py + 1, 3);
    if (front && !stalls.some((t) => t.x === front.x && t.y === front.y)) stalls.push(front);
  }

  // Gardens: the closest grass tiles NW and SE of the plaza (2.5D has two
  // garden points and farmers hash-pick between them). Grass is the
  // DEFAULT terrain — it is NOT stored in world.terrain — so scan with
  // terrainAt over the box, never the terrain map.
  const grass: { x: number; y: number }[] = [];
  for (let y = plaza.y - 60; y <= plaza.y + 60; y++) {
    for (let x = plaza.x - 60; x <= plaza.x + 60; x++) {
      if (terrainAt(world, x, y) !== 'grass') continue;
      if (Math.max(Math.abs(x - plaza.x), Math.abs(y - plaza.y)) <= 60) grass.push({ x, y });
    }
  }
  const pickGrass = (sx: number, sy: number) => {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const g of grass) {
      const dx = g.x - plaza.x;
      const dy = g.y - plaza.y;
      if (Math.sign(dx) !== sx || Math.sign(dy) !== sy) continue;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  };
  const gardens: { x: number; y: number }[] = [];
  for (const g of [pickGrass(-1, -1), pickGrass(1, 1)]) {
    if (!g) continue;
    const q = quantizeTile(world, g.x, g.y, 3);
    if (q && !gardens.some((t) => t.x === q.x && t.y === q.y)) gardens.push(q);
  }
  if (gardens.length === 0) gardens.push(plaza);

  // Patrol: one dirt road tile per quadrant, distance closest to 10 tiles
  // from the plaza (within 6..16). Guards cycle these every 45 game minutes.
  const dirt: { x: number; y: number }[] = [];
  for (const [key, t] of Object.entries(world.terrain)) {
    if (t !== 'dirt') continue;
    const [x, y] = key.split(',').map(Number);
    const d = Math.max(Math.abs(x - plaza.x), Math.abs(y - plaza.y));
    if (d >= 6 && d <= 16) dirt.push({ x, y });
  }
  const quadrant = [
    (dx: number, dy: number) => dy < 0 && -dy >= Math.abs(dx),
    (dx: number, dy: number) => dy > 0 && dy >= Math.abs(dx),
    (dx: number, dy: number) => dx < 0 && -dx > Math.abs(dy),
    (dx: number, dy: number) => dx > 0 && dx > Math.abs(dy),
  ];
  const patrol: { x: number; y: number }[] = [];
  for (const dir of quadrant) {
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (const d of dirt) {
      const dx = d.x - plaza.x;
      const dy = d.y - plaza.y;
      if (!dir(dx, dy)) continue;
      const score = Math.abs(Math.hypot(dx, dy) - 10);
      if (score < bestScore) { bestScore = score; best = d; }
    }
    const q = best ? quantizeTile(world, best.x, best.y, 3) : null;
    patrol.push(q ?? plaza);
  }

  return { plaza, stalls, gardens, patrol };
}

/**
 * Full 2.5D-style anchors for townsfolkTarget, with hut-derived points
 * resolved LIVE against the current world (removal-safe). Call per tick:
 * cheap (layout is memoized, hut scans are ~30 rects). No bank point —
 * see the header: Brand follows the standard merchant path in 3D.
 */
export function buildAnchors(world: IsoWorld, statics: StaticAnchors3D): TownsfolkAnchors {
  const points: Record<string, { x: number; y: number }> = {};
  const doorstepOrPlaza = (hut: HutRect | null) => (hut ? doorstepOf(hut) : statics.plaza);
  for (const npc of ROSTER_3D) points[npc.homeKey] = doorstepOrPlaza(homeHutFor(npc.homeKey, world));
  points.tavern = doorstepOrPlaza(homeHutFor('tavern', world));
  points.chapel = doorstepOrPlaza(homeHutFor('chapel', world));
  points.guild = doorstepOrPlaza(homeHutFor('guild', world));
  return { points, plaza: statics.plaza, stalls: statics.stalls, gardens: statics.gardens, patrol: statics.patrol };
}

// ---------------------------------------------------------------- scheduling

export type ScheduleTile = { activity: string; tx: number; ty: number };

/**
 * The 2.5D schedule for one roster NPC at a 3D clock position, resolved to
 * a walkable 3D tile. townsfolkTarget does the phase math (wake/sleep/
 * lunch/workEnd jitter, guard shifts, market windows, child phases);
 * quantization maps its continuous point onto the 3D tile grid, never
 * inside a hut, falling back to the plaza when nothing is reachable.
 * Seeds mirror createTownsfolk's formula with the Mosslight engine seed
 * (4242), so jitter is deterministic per NPC per day.
 */
export function scheduleTileFor(
  npc: RosterNpc3D,
  index: number,
  anchors: TownsfolkAnchors,
  minutes: number,
  day: number,
  world: IsoWorld,
): ScheduleTile {
  const clock: WorldClockState = {
    tick: 0, year: 1, month: 1, week: 1, day,
    hour: Math.floor(minutes / 60), minuteOfDay: minutes % 60, second: 0, season: 'spring',
  };
  const synthetic = {
    id: 'townsfolk-' + index,
    name: npc.name,
    gender: npc.gender,
    archetype: npc.archetype,
    role: npc.role,
    seed: (4242 ^ Math.imul(index + 1, 2654435761)) >>> 0,
    homeKey: npc.homeKey,
    home: anchors.points[npc.homeKey] ?? anchors.plaza,
  } as unknown as Townsperson;
  const result = townsfolkTarget(synthetic, anchors, clock);
  const q = quantizeTile(world, Math.round(result.target.x), Math.round(result.target.y), 4);
  const tile = q ?? anchors.plaza;
  return { activity: result.activity, tx: tile.x, ty: tile.y };
}
