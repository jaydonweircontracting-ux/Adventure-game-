/**
 * BUILD 1000 — transient NPC life for the 3D town: travelers and
 * simulated adventurers, ported from the 2.5D systems (rules only).
 *
 * AUDIT RESULTS (2026-11-02, traced before any code — the brief
 * requires ports, never invented population):
 *
 * 1. TRAVELERS (travelers.ts): fully ANALYTIC in 2.5D — a traveler's
 *    position is a pure function of (road link, world clock), walking
 *    BETWEEN settlements along chunk road links, one per link per
 *    direction by day (one direction at night), kinds merchant (x2
 *    weight) and courier ('traveler' kind disabled in 2.5D), names
 *    from 6+6 pools, destination = a landmark name. The 3D town is a
 *    single 200x200 tile map, not chunks, so the analytic chunk walk
 *    cannot port literally — and an analytic walk would stride
 *    straight through placed houses. The ported RULES are: journey
 *    through town on roads (entry edge -> exit edge), two directions
 *    by day / one at night is replaced by spawn pacing (the 3D clock
 *    still gates nothing else), merchant/courier kinds, and
 *    destination-flavored barks. Movement itself follows the 998
 *    rules (gliding render, A* with road-biased costs, persistent
 *    block replans) instead of analytic interpolation.
 *
 * 2. SIMULATED ADVENTURERS (simulatedAdventurers.ts): a 10-roster of
 *    "fake players" who log in at the starting house, wander, then
 *    EXODUS — they visibly walk to a chunk boundary within 1 in-game
 *    hour and leave (never teleport). Outings (wander/hunt/tavern/
 *    guild/travel/dungeon) are mostly abstract once out of view. The
 *    ported RULES are the visible part: arrive from an edge, pass
 *    through town on their own business (plaza pause), leave at
 *    another edge, never teleport. Dungeon/tavern/guild interiors do
 *    not port (3D transients never enter houses — the 990 rule).
 *
 * 3. BARKS (npcBarks.ts): disposition-gated (cold NPCs silent),
 *    ~50% of days (seeded), period-aware, archetype-flavored, plus
 *    traveler destination lines. The LINES do not port verbatim: the
 *    3D module carries its own fresh generic lines (same rule shape:
 *    period + archetype + seeded day variation). The disposition gate
 *    cannot port either — 3D has no disposition system — so every
 *    living resident is bark-eligible and the seeded day rule alone
 *    thins them; transients are always day-eligible (they are only
 *    around briefly) and the global + per-NPC cooldowns do the rest.
 *
 * 4. ROSTER: the 47 Mosslight residents are already in 3D (993) and
 *    are NOT duplicated or changed here. Name pools are FILTERED
 *    against resident first names: traveler pools drop Odo, Fen, Corb
 *    (male) and Tilda (female) — all residents — plus Wrenna (too
 *    close to resident Wren); the adventurer roster drops Wren Hallow
 *    and Dain Cole (first names collide with residents Wren and
 *    teacher Dain), leaving 8. Every transient display name is
 *    therefore distinct from every resident name (asserted).
 *
 * 5. LABELS VERDICT: NOT viable. The renderer draws vertex-colour
 *    triangles only — no text pipeline was ever built. The only text
 *    path is DOM (the message area, buttons). DOM-projected floating
 *    labels would need per-frame projection + DOM writes for 55+
 *    figures, directly fighting the 998 slot-caching FPS story. So
 *    barks go through the existing message area (bottom-left), and
 *    no floating labels are built or faked.
 *
 * SAVE TREATMENT: transients are SESSION-ONLY. They live in a
 * separate array the view never serializes: the resident save key
 * still holds exactly the 47 residents (asserted by file-content
 * checks). On
 * reload the town starts with residents only; the spawn manager
 * repopulates transients fresh. Transients never take beds, jobs,
 * or homes, never enter houses, and never join the roster.
 */

import { terrainAt, terrainKey, type IsoWorld } from '../iso/isoWorld';
import { npcWalkable, planPathNpc } from './townsfolk3d';
import { placedPathKeys } from './placements';
import { blockedAction } from './npcMotion';
import { emitVillager, hashStr, villagerSpecFor } from './villagers';

export type TransientKind = 'traveler' | 'adventurer';

export type TransientState = 'toPlaza' | 'pausing' | 'toExit';

/** A transient figure. Logical tiles (integers after each 900ms step);
 * the view glides the render position toward them (998 rule). `slotId`
 * is the fixed GPU slot (0..MAX_TRANSIENTS-1) assigned at spawn. */
export interface TransientActor {
  id: string;
  kind: TransientKind;
  name: string;
  /** 2.5D adventurer class ('Beginner' for the whole roster); null for travelers. */
  className: string | null;
  x: number;
  y: number;
  state: TransientState;
  /** Exit-edge tile. Adventurers walk plaza first, then here. */
  exit: { x: number; y: number };
  /** Ticks left while pausing at the plaza (adventurers only). */
  pauseTicks: number;
  slotId: number;
}

/** Caps: the town never floods, and the 998 slot story stays bounded. */
export const MAX_TRAVELERS = 5;
export const MAX_ADVENTURERS = 3;
export const MAX_TRANSIENTS = MAX_TRAVELERS + MAX_ADVENTURERS;
/** Spawn pacing in 900ms ticks: traveler ~45s, adventurer ~100s (staggered). */
export const TRAVELER_SPAWN_TICKS = 50;
export const ADVENTURER_SPAWN_TICKS = 111;
export const ADVENTURER_SPAWN_PHASE = 25;
/** Spawn entries must sit beyond the 22-tile figure cull (no pop-in). */
export const SPAWN_VIEW_DIST = 22;
/** Bark delivery: existing message area, never spam. */
export const BARK_CHECK_MS = 3000;
export const BARK_GLOBAL_COOLDOWN_MS = 25000;
export const BARK_NPC_COOLDOWN_MS = 90000;
export const BARK_RANGE = 4.0;

// ------------------------------------------------------------ name pools
// 2.5D traveler pools (travelers.ts) FILTERED against resident first
// names (see header): male drops Odo/Fen/Corb, female drops Tilda,
// Wrenna dropped for closeness to resident Wren.

export const TRAVELER_NAMES_MALE = ['Pell', 'Bramm', 'Ost'];
export const TRAVELER_NAMES_FEMALE = ['Rhea', 'Asha', 'Linnet', 'Sorrel'];
export const TRAVELER_NAMES = [...TRAVELER_NAMES_MALE, ...TRAVELER_NAMES_FEMALE];

/** 2.5D adventurer roster (simulatedAdventurers.ts) FILTERED against
 * resident first names: Wren Hallow and Dain Cole dropped. All start
 * as Beginners, exactly like the 2.5D roster. */
export const ADVENTURER_NAMES: { name: string; className: string }[] = [
  { name: 'Kael Thorn', className: 'Beginner' },
  { name: 'Sera Flint', className: 'Beginner' },
  { name: 'Orin Vale', className: 'Beginner' },
  { name: 'Bram Oak', className: 'Beginner' },
  { name: 'Tovin Marsh', className: 'Beginner' },
  { name: 'Kelsa Bryn', className: 'Beginner' },
  { name: 'Soren Ash', className: 'Beginner' },
  { name: 'Liora Fen', className: 'Beginner' },
];

// ------------------------------------------------------------------ roads

/** A road tile: layout dirt, or a player-placed path tile. */
export function isRoadTile(world: IsoWorld, x: number, y: number): boolean {
  if (terrainAt(world, x, y) === 'dirt') return true;
  return placedPathKeys(world).has(terrainKey(x, y));
}

/** Road-biased A* cost: dirt 1.0, everything else walkable 1.6, so a
 * road route wins whenever it is less than 1.6x the grass shortcut.
 * Residents call planPathNpc without a cost and are unaffected. */
export function roadCostFn(world: IsoWorld): (x: number, y: number) => number {
  return (x: number, y: number) => (isRoadTile(world, x, y) ? 1 : 1.6);
}

export type EdgeDir = 'n' | 's' | 'e' | 'w';
const EDGE_ORDER: EdgeDir[] = ['n', 'e', 's', 'w'];

/**
 * The road tile nearest each map edge (ties: closest to the edge
 * midpoint), or null when the town has no roads at all. Placed paths
 * count as roads, so a fully re-pathed town still admits travelers.
 */
export function edgeTiles(world: IsoWorld): Record<EdgeDir, { x: number; y: number } | null> {
  const out: Record<EdgeDir, { x: number; y: number } | null> = { n: null, s: null, e: null, w: null };
  const best: Record<EdgeDir, number> = { n: Infinity, s: Infinity, e: Infinity, w: Infinity };
  const midX = Math.floor(world.w / 2);
  const midY = Math.floor(world.h / 2);
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      // BUILD 1000 fix (probes caught it): road dirt can run UNDER a
      // hut — the west road end (66,99) sits inside a hut rect, so a
      // terrain-only pick made every westbound traveler unplannable
      // (A* can never step onto a hut tile, so the route was null
      // forever and the figure froze at its spawn). Edge tiles must
      // be tiles a figure can actually stand on.
      if (!isRoadTile(world, x, y)) continue;
      if (!npcWalkable(world, x, y)) continue;
      const consider = (edge: EdgeDir, edgeDist: number, midDist: number) => {
        const score = edgeDist * 10000 + midDist;
        if (score < best[edge]) { best[edge] = score; out[edge] = { x, y }; }
      };
      consider('n', y, Math.abs(x - midX));
      consider('s', world.h - 1 - y, Math.abs(x - midX));
      consider('w', x, Math.abs(y - midY));
      consider('e', world.w - 1 - x, Math.abs(y - midY));
    }
  }
  return out;
}

// ------------------------------------------------------------------ spawn

/**
 * Spawn one transient, or null when it cannot spawn (no roads, no
 * free slot, no unused name, degenerate entry==exit, or — when
 * requireOutOfView — no out-of-view entry). Entry edges rotate with
 * spawnCount so traffic varies; the exit edge is always a different
 * edge (entry + 1..3 by spawnCount). Travelers walk entry -> exit;
 * adventurers walk entry -> plaza -> exit (plaza resolved by the
 * caller at step time, not stored, so a moved plaza still works).
 */
export function spawnTransient(
  world: IsoWorld,
  kind: TransientKind,
  usedNames: ReadonlySet<string>,
  usedSlots: ReadonlySet<number>,
  spawnCount: number,
  player: { x: number; y: number },
  requireOutOfView: boolean,
): TransientActor | null {
  const edges = edgeTiles(world);
  const freeSlot = (() => {
    for (let i = 0; i < MAX_TRANSIENTS; i++) if (!usedSlots.has(i)) return i;
    return null;
  })();
  if (freeSlot === null) return null;
  const pool: string[] = kind === 'traveler' ? TRAVELER_NAMES : ADVENTURER_NAMES.map((a) => a.name);
  let name: string | null = null;
  for (let k = 0; k < pool.length; k++) {
    const cand = pool[(spawnCount + k) % pool.length];
    if (!usedNames.has(cand)) { name = cand; break; }
  }
  if (!name) return null;
  // Entry: rotate edges, prefer out-of-view (no pop-in at spawn).
  let entryEdge: EdgeDir | null = null;
  let entry: { x: number; y: number } | null = null;
  for (let k = 0; k < EDGE_ORDER.length; k++) {
    const edge = EDGE_ORDER[(spawnCount + k) % EDGE_ORDER.length];
    const tile = edges[edge];
    if (!tile) continue;
    if (!entryEdge) { entryEdge = edge; entry = tile; }
    if (Math.max(Math.abs(tile.x - player.x), Math.abs(tile.y - player.y)) > SPAWN_VIEW_DIST) {
      entryEdge = edge; entry = tile; break;
    }
  }
  if (!entryEdge || !entry) return null;
  if (requireOutOfView && Math.max(Math.abs(entry.x - player.x), Math.abs(entry.y - player.y)) <= SPAWN_VIEW_DIST) return null;
  const entryIdx = EDGE_ORDER.indexOf(entryEdge);
  const exitEdge = EDGE_ORDER[(entryIdx + 1 + (spawnCount % 3)) % EDGE_ORDER.length];
  const exit = edges[exitEdge];
  if (!exit || (exit.x === entry.x && exit.y === entry.y)) return null;
  const adv = kind === 'adventurer' ? ADVENTURER_NAMES.find((a) => a.name === name) : undefined;
  return {
    id: kind + '-' + name,
    kind,
    name,
    className: adv ? adv.className : null,
    x: entry.x,
    y: entry.y,
    state: kind === 'adventurer' ? 'toPlaza' : 'toExit',
    exit,
    pauseTicks: 0,
    slotId: freeSlot,
  };
}

// ------------------------------------------------------------------- step

export interface TransientPathState {
  dest: string;
  path: { x: number; y: number }[];
  index: number;
  noPathTicks: number;
  blockedTicks: number;
}

/**
 * One 900ms step for a transient, mirroring the resident timer rules
 * exactly: cached A* (replan on destination change or unwalkable next
 * step), occupied-next-tile waits, the 998 persistent-block replan
 * with the blocking tile excluded (sealed fallback: empty path +
 * 11-tick retry), at most 1 tile per step, never a teleport, never a
 * hut tile (npcWalkable excludes doors too). Travelers walk straight
 * to their exit; adventurers pause at the plaza (seeded 22–44 ticks,
 * ~20–40s) before walking out. Returns despawn when the figure leaves
 * (traveler at exit, adventurer at exit after its plaza pause).
 * Mutates the actor in place, like the resident timer.
 */
export function stepTransient(
  world: IsoWorld,
  actor: TransientActor,
  path: TransientPathState | undefined,
  occupied: (x: number, y: number) => boolean,
  plaza: { x: number; y: number },
): { path: TransientPathState | undefined; despawn: boolean } {
  if (actor.state === 'pausing') {
    actor.pauseTicks--;
    if (actor.pauseTicks <= 0) {
      actor.state = 'toExit';
      return { path: undefined, despawn: false };
    }
    return { path, despawn: false };
  }
  const dest = actor.state === 'toPlaza' ? plaza : actor.exit;
  const cx = Math.round(actor.x);
  const cy = Math.round(actor.y);
  if (cx === dest.x && cy === dest.y) {
    if (actor.state === 'toPlaza') {
      actor.state = 'pausing';
      actor.pauseTicks = 22 + (hashStr(actor.id) % 23);
      return { path: undefined, despawn: false };
    }
    return { path: undefined, despawn: true };
  }
  const destKey = dest.x + ',' + dest.y;
  const cost = roadCostFn(world);
  let w = path;
  if (!w || w.dest !== destKey) {
    w = { dest: destKey, path: planPathNpc(world, { x: cx, y: cy }, dest, 4000, undefined, cost) ?? [], index: 0, noPathTicks: 0, blockedTicks: 0 };
  }
  if (w.path.length === 0) {
    w.noPathTicks++;
    if (w.noPathTicks >= 11) {
      w.path = planPathNpc(world, { x: cx, y: cy }, dest, 4000, undefined, cost) ?? [];
      w.index = 0; w.noPathTicks = 0;
    }
    return { path: w, despawn: false };
  }
  const next = w.path[w.index];
  if (!next) return { path: undefined, despawn: false };
  if (!npcWalkable(world, next.x, next.y)) {
    w.path = planPathNpc(world, { x: cx, y: cy }, dest, 4000, undefined, cost) ?? [];
    w.index = 0; w.noPathTicks = 0; w.blockedTicks = 0;
    return { path: w, despawn: false };
  }
  if (occupied(next.x, next.y)) {
    w.blockedTicks++;
    if (blockedAction(w.blockedTicks) === 'replan') {
      const detour = planPathNpc(world, { x: cx, y: cy }, dest, 4000, new Set([next.x + ',' + next.y]), cost);
      if (detour) { w.path = detour; w.index = 0; w.blockedTicks = 0; w.noPathTicks = 0; }
      else { w.path = []; w.index = 0; w.blockedTicks = 0; w.noPathTicks = 0; }
    }
    return { path: w, despawn: false };
  }
  actor.x = next.x;
  actor.y = next.y;
  w.index++;
  w.blockedTicks = 0;
  return { path: w, despawn: false };
}

// ------------------------------------------------------------------ barks
// Fresh generic lines (same rule shape as npcBarks.ts: period +
// archetype + seeded day variation) — NO lines copied from npcBarks.ts.

type DayPeriod = 'morning' | 'day' | 'evening' | 'night';

function periodFor(minuteOfDay: number): DayPeriod {
  const hour = Math.floor(minuteOfDay / 60);
  if (hour < 5 || hour >= 21) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'day';
  return 'evening';
}

export const PERIOD_LINES: Record<DayPeriod, string[]> = {
  morning: ['Good morning!', 'Fine morning for the road.'],
  day: ['Good day!', 'Fine day, isn\'t it?'],
  evening: ['Good evening.', 'Evening, friend.'],
  night: ['Mind the dark.', 'Best get inside soon.'],
};

export const ARCHETYPE_LINES: Record<string, Partial<Record<DayPeriod, string[]>>> = {
  farmer: {
    morning: ['Up early — the fields won\'t wait.'],
    day: ['Crops are coming along.'],
  },
  merchant: {
    morning: ['New stock just in.'],
    day: ['Finest goods in town!'],
  },
  guard: {
    day: ['Stay on the road.'],
    night: ['All quiet on my watch.'],
  },
  priest: {
    morning: ['Blessings on you.'],
    day: ['The chapel door is open.'],
  },
  smith: {
    day: ['Steel\'s hot if you need work done.'],
  },
  child: {
    morning: ['Hi hi!'],
    day: ['Bet you can\'t catch me!'],
    evening: ['Almost dinner time!'],
  },
};

export const TRAVELER_LINES = ['Just passing through.', 'The road is long, friend.', 'Bound for the next town.'];
export const ADVENTURER_LINES = ['Seeking my fortune out there.', 'Heard rumors of ruins nearby.', 'Just passing through on my own business.'];

/** Seeded day rule for residents (~50% of days, deterministic). */
export function barkDayEligible(name: string, day: number): boolean {
  return hashStr(name + ':' + day) % 100 < 50;
}

/** Pick the bark line for a figure. Deterministic per name + day + period. */
export function barkLineFor(
  kind: TransientKind | 'resident',
  archetype: string | null,
  minuteOfDay: number,
  name: string,
  day: number,
): string {
  const period = periodFor(minuteOfDay);
  let pool: string[];
  if (kind === 'traveler') pool = TRAVELER_LINES;
  else if (kind === 'adventurer') pool = ADVENTURER_LINES;
  else {
    const flavor = archetype ? ARCHETYPE_LINES[archetype]?.[period] : undefined;
    pool = flavor ?? PERIOD_LINES[period];
  }
  return pool[hashStr(name + ':' + day + ':' + period) % pool.length];
}

/**
 * Largest figure vertex count over all headwear AND face kinds, for
 * transient GPU slot capacity. BUILD 1019: figures vary by hat (the
 * pointed hat adds the most boxes) AND by face (toothy mouth + brows
 * add the most boxes), so the probe uses the max-count face combo
 * (googly eyes + toothy mouth + wonky brows) for every hat kind.
 * Expected 720: 11 base boxes + 9 face boxes + 4 pointed-hat boxes,
 * × 30 verts each. The asserts prove this covers every roster figure
 * and every face x mouth x brow x hat combination.
 */
export function maxVillagerVerts(): number {
  let max = 0;
  for (const hat of ['brim', 'cap', 'hood', 'pointed', 'flat', 'none'] as const) {
    const spec = { ...villagerSpecFor('__probe__'), hat, face: 'googly' as const, mouth: 'toothy' as const, brow: 'wonky' as const };
    const out: number[] = [];
    emitVillager(out, 0, 0, 0, 0, spec, false);
    if (out.length / 6 > max) max = out.length / 6;
  }
  return max;
}
