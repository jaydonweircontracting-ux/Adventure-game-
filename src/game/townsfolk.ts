// Living-town simulation for Mosslight Crossing (living-world phases 3-7).
//
// Design notes (from the master prompt):
// - Persistent identities: each townsfolk has a stable id, name, archetype
//   and persistentSeed. Schedule randomness is a pure function of
//   (seed, day), so an NPC never "changes personality" between visits.
// - Schedules are activity windows with per-NPC, per-day jitter — no two
//   NPCs run the identical robotic routine.
// - Simulation LOD: only the player's current chunk resolves physical NPCs.
//   Far-away NPCs are abstract (schedule math); nothing is simulated for
//   chunks the player isn't in.
// - All coordinates are true field coordinates in the same system the
//   player, houses, doorways and collision use.
// - PHYSICAL MOVEMENT (BUILD 312): NPCs never teleport between schedule
//   states. They walk along paths, cross doorways, and sleep in assigned
//   beds. The schedule says WHAT; the navigation layer says HOW.
import type { WorldClockState } from './worldCore';
import type { NPCWorldLocation, NavPath, NavPoint, DoorwayLink, ObstacleRect } from './npcNavigation';
import { pathTo, pathToDoor, stepAlongPath, findPath, trackStep, straightFallbackPath, validateDestination, REPLAN_HYSTERESIS, REPLAN_COOLDOWN_TICKS } from './npcNavigation';
import { SpatialHash } from './spatialHash';
import type { HousingRegistry } from './housing';
import { bedFor, buildHousingRegistry, assignBeds } from './housing';
// BUILD 679: Bed-to-field mapping for visual alignment.
import { layoutBedToField } from './interiors';
import { houseTypeForBuilding } from './houseTypes';
// BUILD 683: Unified settlement rects (single source in settlements.ts).
import { mosslightCottageRects280, MOSSLIGHT_MAIN_RECTS_280, mosslightHamletLayouts, SETTLEMENT_FIELD_SCALE } from './settlements';
// BUILD 699: household homes need pinned town-building + filler rects.
import { mosslightPinnedRects, mosslightFillerRects } from './mosslightLayout';

export type TownsfolkFacing = 'up' | 'down' | 'left' | 'right';
export type TownsfolkArchetype = 'farmer' | 'merchant' | 'guard' | 'priest' | 'smith' | 'commoner' | 'child';
/** Reuses the existing .town-npc.npc-<role> sprite classes. */
export type TownsfolkRole = 'mage' | 'warrior' | 'guide' | 'rogue';
export type TownsfolkPoint = { x: number; y: number };

/** A single remembered event. The only mutable per-NPC life state (event-driven). */
export type NPCMemory = {
  event: string;
  /** World day the event happened. */
  day: number;
  /** 1 = trivial (decays first), 2 = notable, 3 = life-changing (kept). */
  importance: 1 | 2 | 3;
};

export type Townsperson = {
  id: string;
  name: string;
  /** 'male' | 'female' — every archetype is open to both; this only drives names/appearance. */
  gender: 'male' | 'female';
  archetype: TownsfolkArchetype;
  role: TownsfolkRole;
  /** persistentSeed: deterministic personality/schedule. Never Math.random. */
  seed: number;
  /** Anchor key so homes follow moved houses (world-editor offsets). */
  homeKey: string;
  home: TownsfolkPoint;
  position: TownsfolkPoint;
  facing: TownsfolkFacing;
  moving: boolean;
  activity: string;
  /** True while asleep/off-screen: not rendered, purely abstract. */
  indoors: boolean;
  // --- Physical movement (BUILD 312) ---
  /** Where the NPC actually is right now (sim-owned, renderer displays). */
  location: NPCWorldLocation;
  /** Active walking path, if any. */
  path?: NavPath;
  /** Assigned cottage id from the housing registry. */
  homeId?: string;
  /** Assigned bed id from the housing registry. */
  bedId?: string;
  /** Building id when INTERIOR / ENTERING / EXITING / SLEEPING. */
  buildingId?: string;
  // --- Village life (BUILD 366): needs/personality are derived from the seed
  // + clock (see villageLife.ts); only genuine events persist below. ---
  /** Age category override (defaults to seed-derived). */
  age?: 'child' | 'young' | 'adult' | 'elder';
  /** Player-driven gold adjustments (tips, gifts). Base purse is derived. */
  goldDelta?: number;
  /**
   * BUILD 922: gear-economy stash — item-base ids this NPC owns beyond its
   * worn outfit (bought upgrades, spares). Undefined = the seed-derived
   * starting stash (see npcGearEconomy.effectiveOwnedGear); worn gear is
   * never stored here and never sold.
   */
  ownedGear?: string[];
  /**
   * BUILD 922: aspiration — the gold target this NPC is saving toward.
   * Undefined = the seed-derived default; ratchets upward when met.
   */
  wealthGoal?: number;
  /** Bounded event memories (max 12, pruned by importance). */
  memories?: NPCMemory[];
  // --- Flee state (BUILD 436): set when the player attacks the NPC. ---
  /** World tick until which the NPC flees (undefined = not fleeing). */
  fleeUntilTick?: number;
  /** Position of the threat to run away from. */
  fleeFrom?: TownsfolkPoint;
  /** BUILD 879: hostile response to an attacker; target position is refreshed by the world combat loop. */
  fightBackUntilTick?: number;
  fightBackTarget?: TownsfolkPoint;
  /**
   * BUILD 918: real-time (Date.now) moment when this NPC may next land a
   * melee hit. Was `fightBackNextAttackTick` in world-clock ticks until
   * BUILD 918: the world clock ticks once per 3 s of real time, so the
   * old 48-tick cooldown meant ~144 s between hits after the first —
   * NPCs landed one hit per fight. Melee cadence is a real-time combat
   * property (cf. GOAT_ATTACK_COOLDOWN_MS), not a world-clock property.
   */
  fightBackNextAttackAtMs?: number;
  /**
   * BUILD 914: when the fight-back target is a creature (not the player),
   * the creature's id and population. The world combat loop refreshes
   * fightBackTarget from the live creature and lands this NPC's hits on
   * it. Transient like the other fight fields — never serialized.
   */
  fightBackCreatureId?: number;
  fightBackCreatureKind?: 'goat' | 'monster';
  /**
   * BUILD 919: active combat-pursuit route — A* waypoints toward the live
   * fightBackTarget. Transient like the other fight fields (never
   * serialized: serializeTownsfolk picks fields explicitly). Kept separate
   * from `path` so combat routing never pollutes schedule pathing, and
   * schedule pathing never resumes a stale combat route.
   */
  fightPath?: NavPath;
  /** Real-time ms of the last combat-path plan attempt (rate limit). */
  fightPathPlannedAtMs?: number;
  /** Consecutive failed combat-path plans; the fight is dropped at the cap. */
  fightPathFailures?: number;
  /**
   * BUILD 704: true while the NPC is actively running (fleeing). Walk is the
   * default; the renderer picks the run cycle only when this is true.
   */
  running?: boolean;
  // --- Health (BUILD 441): NPCs can be damaged and killed. ---
  /** Current HP (undefined = full). */
  hp?: number;
  /** World tick until which the NPC is dead (undefined = alive). Respawns after. */
  deadUntilTick?: number;
  /** World tick until which the NPC is jailed (undefined = free). BUILD 885. */
  jailedUntilTick?: number;
};

/** Named world anchors townsfolk schedules resolve against. */
export type TownsfolkAnchors = {
  points: Record<string, TownsfolkPoint>;
  plaza: TownsfolkPoint;
  stalls: TownsfolkPoint[];
  gardens: TownsfolkPoint[];
  patrol: TownsfolkPoint[];
  /**
   * BUILD 694: arterial waypoints — walkable points along the town's main
   * roads between the plaza and the town edges. Derived live from the
   * settlement decor lanes (never hardcoded). Optional so older callers and
   * tests keep working; absent = skip the arterial stroll phase.
   */
  arterials?: TownsfolkPoint[];
};

/** Deterministic 0..1 from two ints. The NPC "personality" RNG. */
export function townsfolkHash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265461)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export type TownsfolkTarget = {
  activity: string;
  target: TownsfolkPoint;
  indoors: boolean;
  /**
   * BUILD 694: optional facing to adopt on arrival (e.g. a browser facing
   * the stall they stopped at). The movement layer applies it once the NPC
   * settles; walkers keep their travel facing.
   */
  face?: TownsfolkFacing;
};

function minutesOf(clock: WorldClockState): number {
  return Math.floor(clock.hour) * 60 + (Math.floor(clock.minuteOfDay) % 60);
}

/**
 * Deterministic per-NPC personal-space offset (BUILD 323). Stable per NPC per
 * day (hash of seed + day salt), so schedule targets and snap positions don't
 * shift between ticks. Used for shared gather-spot targets and for the
 * chunk-entry snap so cottage-mates don't stack on the exact door point.
 */
export function personalOffset(seed: number, day: number, salt: number): { x: number; y: number } {
  const daySalt = Math.floor(day) * 131;
  return {
    x: (townsfolkHash(seed, daySalt + salt) - 0.5) * 7,
    y: (townsfolkHash(seed, daySalt + salt + 997) - 0.5) * 7,
  };
}

/**
 * Pure schedule resolution: (npc, anchors, clock) -> { activity, target }.
 * No per-frame AI, no stored state — the world clock drives everything, so
 * leaving town and returning hours later shows NPCs where they should be.
 */
export function townsfolkTarget(npc: Townsperson, anchors: TownsfolkAnchors, clock: WorldClockState): TownsfolkTarget {
  const mins = minutesOf(clock);
  const daySalt = Math.floor(clock.day) * 131;
  const jitter = (salt: number, range: number) => Math.floor(townsfolkHash(npc.seed, daySalt + salt) * range);
  const home = anchors.points[npc.homeKey] ?? npc.home;

  // Personal space at shared gather spots (BUILD 323): NPCs heading for the
  // same anchor (plaza, tavern, chapel, forge, garden, stall, patrol point, a
  // shared home point) each get a deterministic per-NPC offset so a crowd
  // gathers *around* the spot instead of stacking on one pixel. Stable per NPC
  // per day (hash of seed + day salt), so paths don't replan every tick.
  const gatherSpot = (base: TownsfolkPoint, salt: number): TownsfolkPoint => {
    const o = personalOffset(npc.seed, clock.day, salt);
    return { x: base.x + o.x, y: base.y + o.y };
  };
  const plazaSpot = gatherSpot(anchors.plaza, 2001);
  const tavernSpot = gatherSpot(anchors.points.tavern ?? anchors.plaza, 2002);
  const chapelSpot = gatherSpot(anchors.points.chapel ?? anchors.plaza, 2003);
  const forgeSpot = gatherSpot(anchors.points.guild ?? anchors.plaza, 2004);
  const homeSpot = gatherSpot(home, 2005);
  const garden = gatherSpot(anchors.gardens[Math.floor(townsfolkHash(npc.seed, 77)) % anchors.gardens.length] ?? anchors.plaza, 2006);
  const stall = gatherSpot(anchors.stalls[Math.floor(townsfolkHash(npc.seed, 78)) % anchors.stalls.length] ?? anchors.plaza, 2007);

  const wake = 330 + jitter(1, 61);       // 5:30–6:30
  const sleep = 1260 + jitter(2, 61);    // 21:00–22:00
  const lunchStart = 720 + jitter(3, 31);// 12:00–12:30
  const lunchEnd = lunchStart + 60;
  const workEnd = 1020 + jitter(4, 61);  // 17:00–18:00
  const atNight = mins >= sleep || mins < wake;
  const atLunch = mins >= lunchStart && mins < lunchEnd;

  switch (npc.archetype) {
    case 'guard': {
      // Two 8-hour shifts: half the guards start at 6:00, half at 14:00.
      const shiftStart = 360 + (npc.seed % 2) * 480;
      const shiftEnd = shiftStart + 480;
      const onShift = mins >= shiftStart && mins < shiftEnd;
      if (!onShift) {
        if (atNight || mins < wake) return { activity: 'Off duty', target: home, indoors: true };
        return { activity: 'Off duty', target: plazaSpot, indoors: false };
      }
      const waypoint = gatherSpot(anchors.patrol[Math.floor(mins / 45) % anchors.patrol.length] ?? anchors.plaza, 2008);
      return { activity: 'Patrolling', target: waypoint, indoors: false };
    }
    case 'farmer': {
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (mins < wake + 30) return { activity: 'Waking up', target: homeSpot, indoors: false };
      if (atLunch) return { activity: 'Having lunch', target: plazaSpot, indoors: false };
      if (mins < workEnd) return { activity: 'Tending crops', target: garden, indoors: false };
      if (mins < workEnd + 90) return { activity: 'Evening at the Tankard', target: tavernSpot, indoors: false };
      return { activity: 'At home', target: homeSpot, indoors: true };
    }
    case 'merchant': {
      const open = 480 + jitter(5, 31); // 8:00–8:30
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (mins < open) return { activity: 'Opening the stall', target: homeSpot, indoors: false };
      if (atLunch) return { activity: 'Having lunch', target: plazaSpot, indoors: false };
      if (mins < workEnd) return { activity: 'Minding the stall', target: stall, indoors: false };
      if (mins < workEnd + 90) return { activity: 'Evening at the Tankard', target: tavernSpot, indoors: false };
      return { activity: 'At home', target: homeSpot, indoors: true };
    }
    case 'priest': {
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (atLunch) return { activity: 'Having lunch', target: plazaSpot, indoors: false };
      const chapel = anchors.points.chapel ?? anchors.plaza;
      const atChapel = (mins >= 480 && mins < 720) || (mins >= 840 && mins < workEnd);
      if (atChapel) return { activity: 'Prayers', target: chapelSpot, indoors: false };
      return { activity: 'Tending the parish', target: plazaSpot, indoors: false };
    }
    case 'smith': {
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (atLunch) return { activity: 'Having lunch', target: plazaSpot, indoors: false };
      const forge = anchors.points.guild ?? anchors.plaza;
      const atForge = (mins >= 420 && mins < 720) || (mins >= 780 && mins < workEnd);
      if (atForge) return { activity: 'Working the forge', target: forgeSpot, indoors: false };
      if (mins >= workEnd && mins < workEnd + 90) return { activity: 'Evening at the Tankard', target: tavernSpot, indoors: false };
      return { activity: 'At the guild', target: homeSpot, indoors: false };
    }
    case 'child': {
      if (atNight || mins < wake) return { activity: 'Sleeping', target: home, indoors: true };
      if (mins >= lunchStart && mins < lunchEnd + 30) return { activity: 'Lunch at home', target: homeSpot, indoors: false };
      if (mins >= 1080) return { activity: 'At home', target: homeSpot, indoors: true };
      // BUILD 694: afternoons the children join the market bustle.
      if (mins >= MARKET_WINDOWS[1][0] && mins < MARKET_WINDOWS[1][1]) {
        const market = marketRoutine(npc, anchors, clock);
        if (market) return market;
      }
      return { activity: 'Playing', target: plazaSpot, indoors: false };
    }
    case 'commoner':
    default: {
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (atLunch) return { activity: 'Having lunch', target: plazaSpot, indoors: false };
      const outAndAbout =
        (mins >= MARKET_WINDOWS[0][0] && mins < MARKET_WINDOWS[0][1]) ||
        (mins >= MARKET_WINDOWS[1][0] && mins < MARKET_WINDOWS[1][1]);
      // BUILD 694: market life — stroll between stalls, pause to browse, and
      // on errand days walk the arterials. Falls back to the plaza when the
      // market is unavailable (no stalls in the anchors).
      if (outAndAbout) return marketRoutine(npc, anchors, clock) ?? { activity: 'About town', target: plazaSpot, indoors: false };
      return { activity: 'At home', target: homeSpot, indoors: true };
    }
  }
}

// ---------------------------------------------------------------------------
// Ambient market life (BUILD 694): shoppers, browsers, errand loops.
//
// Pure and deterministic — everything derives from (npc, anchors, clock), so
// save/load and time-skips stay correct. The movement layer (advanceOne)
// does the walking; this only resolves targets. Stall positions come from
// the live settlement decor via marketStallsFromDecor (never hardcoded).
// ---------------------------------------------------------------------------

/** Asset-name substring identifying market-stall props in the decor. */
const STALL_ASSET_MATCH = 'stall';

/**
 * Market-stall positions from the live settlement decor props
 * (settlementDecorFor). Adapts automatically when stalls are added, moved or
 * removed — no hardcoded stall coordinates anywhere in the sim. Stable order
 * (decor order, deduped) so seeded stall picks stay consistent.
 */
export function marketStallsFromDecor(
  props: { asset: string; x: number; y: number }[],
): TownsfolkPoint[] {
  const seen = new Set<string>();
  const stalls: TownsfolkPoint[] = [];
  for (const p of props) {
    if (!p.asset.includes(STALL_ASSET_MATCH)) continue;
    const key = `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stalls.push({ x: p.x, y: p.y });
  }
  return stalls;
}

/**
 * Arterial waypoints from the live decor lanes: walkable points along the
 * town's main roads between the plaza and the town edges. Only long lanes
 * (the arterials — door spurs and short connectors are skipped) are sampled,
 * at fixed fractions, keeping clear of the plaza/market itself. Deterministic.
 */
export function arterialWaypointsFromDecor(
  lanes: { points: { x: number; y: number }[] }[],
  plaza: TownsfolkPoint,
  fieldSize = 280,
  maxPoints = 8,
): TownsfolkPoint[] {
  const pts: { p: TownsfolkPoint; len: number }[] = [];
  for (const lane of lanes) {
    const lp = lane.points;
    if (lp.length < 40) continue;
    for (const f of [0.2, 0.5, 0.8]) {
      const q = lp[Math.min(lp.length - 1, Math.floor(lp.length * f))];
      if (q.x < 4 || q.y < 4 || q.x > fieldSize - 4 || q.y > fieldSize - 4) continue;
      if (Math.hypot(q.x - plaza.x, q.y - plaza.y) < 25) continue;
      pts.push({ p: { x: q.x, y: q.y }, len: lp.length });
    }
  }
  pts.sort((a, b) => b.len - a.len); // longest lanes (true arterials) first
  return pts.slice(0, maxPoints).map((e) => e.p);
}

/** Facing from `from` toward `to` (dominant axis). Pure. */
export function faceToward(from: TownsfolkPoint, to: TownsfolkPoint): TownsfolkFacing {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
}

/**
 * Where a browser stands to look at a stall: just in front of it (toward
 * the plaza), with a deterministic per-NPC-per-day personal offset so
 * browsers gather *around* a stall instead of stacking on one point. Stalls
 * are decor-only (walkable) and ring the plaza — far from any door trigger
 * zone — and pathTo validates the destination against obstacles anyway.
 */
export function stallBrowseSpot(
  stall: TownsfolkPoint,
  plaza: TownsfolkPoint,
  npc: Townsperson,
  day: number,
  salt: number,
): TownsfolkPoint {
  const dx = plaza.x - stall.x, dy = plaza.y - stall.y;
  const d = Math.hypot(dx, dy) || 1;
  const o = personalOffset(npc.seed, day, salt);
  return {
    x: stall.x + (dx / d) * 2.6 + o.x * 0.6,
    y: stall.y + (dy / d) * 2.6 + o.y * 0.6,
  };
}

// Market windows (game minutes): 9:00–12:00 and 13:00–17:30. The afternoon
// window starts right after lunch at the plaza (a short walk from the
// stalls), so even shoppers commuting from far cottages get a full
// afternoon of browsing instead of spending it all on the road.
export const MARKET_WINDOWS: [number, number][] = [[540, 720], [780, 1050]];
/**
 * Minutes per stall visit; the last MARKET_BROWSE minutes of each visit are
 * the browse pause (stand still, face the stall). Visits are long on purpose:
 * NPCs walk ~33 field units per game hour, so a 90-minute visit lets them
 * actually arrive and pause instead of perpetually chasing a moving target.
 */
const MARKET_VISIT = 90;
const MARKET_BROWSE = 30;

/**
 * Ambient market routine for shoppers. Each visit picks one stall (seeded per
 * NPC/day/visit); the NPC strolls to its front, then PAUSES there for the
 * last 30 minutes, standing still and facing the stall ('Browsing the
 * stalls'). On errand days (~45%, seeded) the first morning visit is a long
 * walk along an arterial waypoint ('Running errands') — the door-to-market
 * errand loop; the walk home emerges from the schedule at noon.
 * Returns null outside market windows or when there are no stalls, so
 * callers fall back to the previous behavior.
 */
export function marketRoutine(
  npc: Townsperson,
  anchors: TownsfolkAnchors,
  clock: WorldClockState,
): TownsfolkTarget | null {
  const stalls = anchors.stalls;
  if (!stalls || stalls.length === 0) return null;
  const mins = minutesOf(clock);
  const winIdx = MARKET_WINDOWS.findIndex(([s, e]) => mins >= s && mins < e);
  if (winIdx < 0) return null;
  const wStart = MARKET_WINDOWS[winIdx][0];
  const daySalt = Math.floor(clock.day) * 131;
  const visit = Math.floor((mins - wStart) / MARKET_VISIT);
  const visitIndex = winIdx * 2 + visit;
  const inVisit = (mins - wStart) % MARKET_VISIT;
  const browsing = inVisit >= MARKET_VISIT - MARKET_BROWSE;
  const arterials = anchors.arterials ?? [];
  // Errand day: first morning visit walks an arterial before the market.
  const errandDay = townsfolkHash(npc.seed, daySalt + 8150) < 0.45;
  if (errandDay && visit === 0 && winIdx === 0 && arterials.length > 0) {
    const a = arterials[Math.floor(townsfolkHash(npc.seed, daySalt + 8151) * arterials.length) % arterials.length];
    const o = personalOffset(npc.seed, clock.day, 8152);
    return { activity: 'Running errands', target: { x: a.x + o.x, y: a.y + o.y }, indoors: false };
  }
  const stall = stalls[Math.floor(townsfolkHash(npc.seed, daySalt + 8101 + visitIndex * 17) * stalls.length) % stalls.length];
  const spot = stallBrowseSpot(stall, anchors.plaza, npc, clock.day, 8102 + visitIndex * 3);
  return {
    activity: browsing ? 'Browsing the stalls' : 'Strolling the market',
    target: spot,
    indoors: false,
    face: browsing ? faceToward(spot, stall) : undefined,
  };
}

/**
 * BUILD 700: which stall (index into anchors.stalls — the same
 * marketStallsFromDecor order that stallShopDef uses) an NPC is browsing
 * right now, plus the market visit index. Mirrors marketRoutine's
 * deterministic stall pick exactly. Returns null unless the NPC is in the
 * browse pause of a visit. Callers resolve the shop via stallShopDef(index).
 */
export function marketBrowseVisit(
  npc: Townsperson,
  anchors: TownsfolkAnchors,
  clock: WorldClockState,
): { stallIndex: number; visitIndex: number } | null {
  const stalls = anchors.stalls;
  if (!stalls || stalls.length === 0) return null;
  const mins = minutesOf(clock);
  const winIdx = MARKET_WINDOWS.findIndex(([s, e]) => mins >= s && mins < e);
  if (winIdx < 0) return null;
  const wStart = MARKET_WINDOWS[winIdx][0];
  const daySalt = Math.floor(clock.day) * 131;
  const visit = Math.floor((mins - wStart) / MARKET_VISIT);
  const visitIndex = winIdx * 2 + visit;
  const inVisit = (mins - wStart) % MARKET_VISIT;
  if (inVisit < MARKET_VISIT - MARKET_BROWSE) return null;
  const stallIndex = Math.floor(townsfolkHash(npc.seed, daySalt + 8101 + visitIndex * 17) * stalls.length) % stalls.length;
  return { stallIndex, visitIndex };
}

type TownsfolkDef = [name: string, gender: 'male' | 'female', archetype: TownsfolkArchetype, role: TownsfolkRole, homeKey: string];

/**
 * BUILD 699: 40 NPCs in households sharing houses (was 13). The first 13
 * entries keep their exact order and ids (townsfolk-0..12) so existing saves
 * restore cleanly; entries 13-39 are new. Households share a homeKey:
 * couples and household members per house; town visuals use adult NPC archetypes.
 * Home layout:
 *   cottage-1..6: families (3-4 each = 19)
 *   chapel: Father Aldous (1)
 *   town-n1..w2: couples/families (2-3 each = 18)
 *   filler-1: couple (2)
 * Total: 40. Every homeKey must resolve in townsfolkAnchors (App.tsx) and
 * have beds in buildMosslightHousing below.
 */
const ROSTER: TownsfolkDef[] = [
  // --- Original 13 (order preserved for save compatibility) ---
  ['Aldric', 'male', 'farmer', 'guide', 'cottage-6'],
  ['Brenna', 'female', 'farmer', 'guide', 'cottage-6'],
  ['Cedric', 'male', 'merchant', 'mage', 'cottage-2'],
  ['Father Aldous', 'male', 'priest', 'mage', 'chapel'],
  ['Rowan', 'female', 'guard', 'warrior', 'town-n1'],
  ['Kess', 'female', 'guard', 'warrior', 'town-n1'],
  ['Tom', 'male', 'smith', 'warrior', 'town-n2'],
  ['Mabel', 'female', 'commoner', 'mage', 'cottage-4'],
  ['Dunstan', 'male', 'commoner', 'guide', 'cottage-5'],
  ['Elsa', 'female', 'commoner', 'mage', 'town-n2'],
  ['Wren', 'female', 'commoner', 'mage', 'cottage-4'],
  ['Pip', 'male', 'commoner', 'warrior', 'cottage-2'],
  // BUILD 548: neighbor near tutorial house — visible life at player spawn.
  // Farmer archetype: wakes up outdoors at home (visible at 6am game start).
  // BUILD 555: Renamed from Mira to Bryn — the tavern bartender is already
  // named Mira (quest giver for 'rats-in-the-cellar'). Two Miras was confusing.
  // BUILD 699: Bryn's family takes cottage-1 (nearest the tutorial house).
  ['Bryn', 'female', 'farmer', 'guide', 'cottage-1'],
  // --- BUILD 699: 27 new townsfolk in households ---
  // Cottage-6: Aldric & Brenna's household
  ['Ash', 'male', 'commoner', 'warrior', 'cottage-6'],
  ['Lily', 'female', 'commoner', 'mage', 'cottage-6'],
  // Cottage-2: Cedric's household
  ['Sella', 'female', 'merchant', 'mage', 'cottage-2'],
  // Cottage-3: Garrick & Hilda's family
  ['Garrick', 'male', 'commoner', 'guide', 'cottage-3'],
  ['Hilda', 'female', 'commoner', 'mage', 'cottage-3'],
  ['Fen', 'male', 'commoner', 'warrior', 'cottage-3'],
  // Cottage-4: Mabel's household
  ['Odo', 'male', 'commoner', 'warrior', 'cottage-4'],
  // Cottage-5: Dunstan's household
  ['Petra', 'female', 'commoner', 'mage', 'cottage-5'],
  ['Ned', 'male', 'commoner', 'warrior', 'cottage-5'],
  // Cottage-1: Bryn's household near player spawn
  ['Cole', 'male', 'farmer', 'guide', 'cottage-1'],
  ['Sage', 'female', 'commoner', 'mage', 'cottage-1'],
  // town-s1: Brand's merchant household
  ['Brand', 'male', 'merchant', 'warrior', 'town-s1'],
  ['Tilda', 'female', 'commoner', 'mage', 'town-s1'],
  ['Kit', 'male', 'commoner', 'warrior', 'town-s1'],
  // town-s2: Finn & Willa
  ['Finn', 'male', 'commoner', 'guide', 'town-s2'],
  ['Willa', 'female', 'commoner', 'mage', 'town-s2'],
  // town-e1: Ham's farmer household
  ['Ham', 'male', 'farmer', 'guide', 'town-e1'],
  ['Rosa', 'female', 'commoner', 'mage', 'town-e1'],
  ['Bede', 'male', 'commoner', 'mage', 'town-e1'],
  // town-e2: Corb & Liss
  ['Corb', 'male', 'guard', 'warrior', 'town-e2'],
  ['Liss', 'female', 'commoner', 'mage', 'town-e2'],
  // town-w2: Jory & Ess
  ['Jory', 'male', 'smith', 'warrior', 'town-w2'],
  ['Ess', 'female', 'merchant', 'mage', 'town-w2'],
  // filler-1: Sten & Aya
  ['Sten', 'male', 'commoner', 'guide', 'filler-1'],
  ['Aya', 'female', 'commoner', 'mage', 'filler-1'],
];

/** Build DoorwayLinks for the 6 Mosslight cottages (pure, no App dependency). */
export function cottageDoorways(): DoorwayLink[] {
  // BUILD 683: Unified on mosslightCottageRects280() — the same 280-space
  // rects the renderer uses. Doors stay attached to the visible houses.
  const rects = mosslightCottageRects280();
  return rects.map((rect, i) => {
    const doorX = rect.left + (rect.right - rect.left) * 0.51;
    return {
      id: `cottage-${i + 1}-door`,
      exterior: { x: doorX, y: rect.bottom + 0.7 },
      interior: { x: doorX, y: (rect.top + rect.bottom) / 2 },
      buildingRect: rect,
    };
  });
}

/** All building rects that block NPC paths (4 main + 6 cottages). */
export function mosslightObstacles(): ObstacleRect[] {
  // BUILD 683: 280 field space, matching the visuals. Was 140-space.
  const main = MOSSLIGHT_MAIN_RECTS_280;
  const cottages = mosslightCottageRects280();
  // Settlement props (wells, barrels) block NPCs too.
  const { west, north } = mosslightHamletLayouts();
  const props: ObstacleRect[] = [];
  for (const l of [west, north]) {
    for (const p of l.props) {
      const s = SETTLEMENT_FIELD_SCALE;
      props.push({
        left: p.x * s - p.radius * s, top: p.y * s - p.radius * s,
        right: p.x * s + p.radius * s, bottom: p.y * s + p.radius * s,
      });
    }
  }
  return [...main, ...cottages, ...props];
}

/**
 * Deterministic indoor rest spot for an awake NPC spending the evening at
 * home (BUILD 329): just inside their cottage door, offset per-NPC so
 * cottage-mates don't stack. Field units of the cottage rect — the interior
 * renderer maps them proportionally into the room.
 */
export function indoorRestSpot(npc: Townsperson, door: DoorwayLink): NavPoint {
  return {
    x: door.interior.x + (townsfolkHash(npc.seed, 7001) - 0.5) * 2.5,
    y: door.interior.y - 0.8 - townsfolkHash(npc.seed, 7002) * 0.8,
  };
}

/**
 * Interior wander target (BUILD 333): an awake NPC spending the evening at
 * home strolls between a few deterministic spots inside the cottage instead
 * of standing frozen at the rest spot. The slot rotates every 15 in-game
 * minutes, so no new sim state is needed — the same (seed, clock) always
 * yields the same spot, keeping determinism and save/load intact.
 */
export function interiorWanderSpot(
  npc: Townsperson,
  door: DoorwayLink,
  clock: { day: number; minuteOfDay: number },
): NavPoint {
  const rest = indoorRestSpot(npc, door);
  const rect = door.buildingRect ?? (npc.buildingId ? cottageRectFor(npc.buildingId) : null);
  const quarter = Math.floor(clock.minuteOfDay / 15);
  const slot = Math.floor(townsfolkHash(npc.seed, 7300 + ((clock.day * 96 + quarter) % 100000)) * 4);
  if (slot === 0 || !rect) return rest;
  // Small deterministic offsets around the rest spot — hearth-side,
  // window-side, near the table — clamped 1 unit inside the cottage rect
  // so wander targets never escape through the walls.
  const dx = (townsfolkHash(npc.seed, 7310 + slot * 2) - 0.5) * 5;
  const dy = (townsfolkHash(npc.seed, 7311 + slot * 2) - 0.5) * 3.4;
  return {
    x: Math.min(rect.right - 1, Math.max(rect.left + 1, rest.x + dx)),
    y: Math.min(rect.bottom - 1, Math.max(rect.top + 1, rest.y + dy - 0.6)),
  };
}

/**
 * Player-facing interior area id for a townsfolk cottage (BUILD 329).
 * Mirrors buildingDoorwaysFor: cottages are indices 4..9 of fieldHouseRects.
 */
export function interiorAreaIdForCottage(cottageId: string, chunk: { x: number; y: number }): string | null {
  const m = /^cottage-(\d+)$/.exec(cottageId);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 6) return null;
  return `${Math.round(chunk.x)}-${Math.round(chunk.y)}-building-${n + 3}`;
}

/** Cottage field rect for proportional interior rendering (BUILD 329). */
export function cottageRectFor(cottageId: string): { left: number; top: number; right: number; bottom: number } | null {
  const m = /^cottage-(\d+)$/.exec(cottageId);
  if (!m) return null;
  const door = cottageDoorways()[parseInt(m[1], 10) - 1];
  const r = door?.buildingRect;
  return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
}

/**
 * BUILD 699: Doorways for ALL household homes (not just the 6 cottages).
 * Returns DoorwayLinks keyed by homeKey: cottage-1..6, town-n1..w2, chapel,
 * filler-1. Uses the same simplified door formula as cottageDoorways (door
 * centered on the south face) so NPC navigation stays consistent.
 */
export function mosslightHouseholdDoorways(): { homeKey: string; door: DoorwayLink }[] {
  const out: { homeKey: string; door: DoorwayLink }[] = [];
  const mkDoor = (homeKey: string, rect: { left: number; top: number; right: number; bottom: number }): void => {
    const doorX = rect.left + (rect.right - rect.left) * 0.51;
    out.push({
      homeKey,
      door: {
        id: `${homeKey}-door`,
        exterior: { x: doorX, y: rect.bottom + 0.7 },
        interior: { x: doorX, y: (rect.top + rect.bottom) / 2 },
        buildingRect: rect,
      },
    });
  };
  // 6 cottages.
  mosslightCottageRects280().forEach((rect, i) => mkDoor(`cottage-${i + 1}`, rect));
  // 8 town buildings (pinned indices 10-17).
  const pinned = mosslightPinnedRects();
  const townKeys = ['town-n1', 'town-n2', 'town-s1', 'town-s2', 'town-e1', 'town-e2', 'town-w1', 'town-w2'];
  townKeys.forEach((key, i) => mkDoor(key, pinned[10 + i]));
  // Chapel (pinned index 2) — Father Aldous lives there.
  mkDoor('chapel', pinned[2]);
  // First filler building — Sten & Aya.
  const filler = mosslightFillerRects();
  if (filler.length > 0) mkDoor('filler-1', filler[0]);
  return out;
}

/**
 * Bed counts per household home. Must cover the roster (40 NPCs).
 * Cottages hold families (4), town buildings hold couples/small families (3),
 * chapel and filler hold 1-2.
 */
const HOUSEHOLD_BEDS: Record<string, number> = {
  'cottage-1': 4, 'cottage-2': 4, 'cottage-3': 4,
  'cottage-4': 4, 'cottage-5': 4, 'cottage-6': 4,
  'town-n1': 3, 'town-n2': 3, 'town-s1': 3, 'town-s2': 3,
  'town-e1': 3, 'town-e2': 3, 'town-w1': 3, 'town-w2': 3,
  'chapel': 2, 'filler-1': 2,
};

/**
 * Build the housing registry for all Mosslight household homes and assign
 * beds HOUSEHOLD-aware: NPCs sharing a homeKey sleep in the same home.
 * Deterministic — same roster always gets the same beds.
 *
 * BUILD 699: replaces the cottage-only registry (13 beds). Now 6 cottages +
 * 8 town buildings + chapel + filler = 54 beds for 40 NPCs.
 */
export function buildMosslightHousing(entries: { id: string; homeKey: string }[]): HousingRegistry {
  const householdDoors = mosslightHouseholdDoorways();
  const registry = buildHousingRegistry(
    householdDoors.map(({ homeKey, door }) => ({
      buildingId: homeKey,
      doorwayId: door.id,
      rect: door.buildingRect!,
    })),
    // Bed counts per home (overrides the default 2-per-home).
    Object.fromEntries(householdDoors.map(({ homeKey }) => [homeKey, HOUSEHOLD_BEDS[homeKey] ?? 2])),
  );
  // BUILD 679: Align first bed in each cottage with the interior layout's
  // visual bed position (cottages only — town buildings have no interiors).
  const chunk = { x: 4, y: 7 };
  householdDoors.forEach(({ homeKey, door }, i) => {
    if (!homeKey.startsWith('cottage-')) return;
    const home = registry.homes[i];
    const rect = door.buildingRect!;
    const n = parseInt(homeKey.split('-')[1], 10);
    const buildingId = `4-7-building-${n + 3}`;
    const houseType = houseTypeForBuilding(buildingId);
    const layoutPos = layoutBedToField(homeKey, rect, chunk, houseType);
    if (layoutPos && home.beds.length > 0) {
      const oldFirst = home.beds[0].position;
      const dx = layoutPos.x - oldFirst.x;
      const dy = layoutPos.y - oldFirst.y;
      if (Math.abs(dx) < (rect.right - rect.left) && Math.abs(dy) < (rect.bottom - rect.top)) {
        home.beds[0].position = { ...layoutPos };
      }
    }
  });
  // Household-aware assignment: group NPC ids by homeKey, fill each home's
  // beds in roster order. NPCs without a matching home fall back to any
  // free bed (shouldn't happen — roster and homes are kept in sync).
  const homesByKey = new Map(registry.homes.map((h) => [h.id, h]));
  const byHome = new Map<string, string[]>();
  const unassigned: string[] = [];
  for (const e of entries) {
    if (homesByKey.has(e.homeKey)) {
      if (!byHome.has(e.homeKey)) byHome.set(e.homeKey, []);
      byHome.get(e.homeKey)!.push(e.id);
    } else {
      unassigned.push(e.id);
    }
  }
  const assignments: Record<string, { homeId: string; bedId: string }> = {};
  const warnings: string[] = [];
  for (const [homeKey, ids] of byHome) {
    const home = homesByKey.get(homeKey)!;
    ids.forEach((id, idx) => {
      if (idx < home.beds.length) {
        const bed = home.beds[idx];
        bed.occupantId = id;
        assignments[id] = { homeId: home.id, bedId: bed.id };
      } else {
        warnings.push(`HOUSING SHORTAGE — NPC: ${id}. Home ${homeKey} has ${home.beds.length} beds.`);
      }
    });
  }
  // Fallback: any unassigned NPC takes any free bed.
  if (unassigned.length > 0) {
    const freeBeds: { home: (typeof registry.homes)[number]; bed: { id: string; occupantId?: string } }[] = [];
    for (const home of registry.homes) {
      for (const bed of home.beds) {
        if (!(bed as { occupantId?: string }).occupantId) freeBeds.push({ home, bed: bed as { id: string; occupantId?: string } });
      }
    }
    unassigned.forEach((id, idx) => {
      if (idx < freeBeds.length) {
        const { home, bed } = freeBeds[idx];
        bed.occupantId = id;
        assignments[id] = { homeId: home.id, bedId: bed.id };
      } else {
        warnings.push(`HOUSING SHORTAGE — NPC: ${id}. Required: 1 bed. Available: 0.`);
      }
    });
  }
  return { homes: registry.homes, assignments, warnings };
}

/**
 * BUILD 699: Roster ids + homeKeys for building the nav context (housing)
 * before townsfolk are created. Order matches createTownsfolk.
 */
export function townsfolkRosterEntries(): { id: string; homeKey: string }[] {
  return ROSTER.map(([, , , , homeKey], index) => ({
    id: 'townsfolk-' + index,
    homeKey,
  }));
}

/** Build the persistent roster. Homes resolve through anchor keys. */
export function createTownsfolk(anchors: TownsfolkAnchors, worldSeed: number): Townsperson[] {  return ROSTER.map(([name, gender, archetype, role, homeKey], index) => {
    const seed = (worldSeed ^ Math.imul(index + 1, 2654435761)) >>> 0;
    const home = anchors.points[homeKey] ?? anchors.plaza;
    return {
      id: 'townsfolk-' + index,
      name,
      gender,
      archetype,
      role,
      seed,
      homeKey,
      home,
      position: { ...home },
      facing: 'down' as TownsfolkFacing,
      moving: false,
      activity: 'At home',
      indoors: false,
      location: 'OUTDOOR' as NPCWorldLocation,
      // BUILD 366: seed founding memories (villageLife.addNPCMemory handles
      // runtime events; kept inline here to avoid a circular import).
      memories: [
        {
          event: townsfolkHash(seed, 9301) < 0.5 ? 'Settled in Mosslight years ago.' : 'Grew up in Mosslight.',
          day: 0,
          importance: 2 as const,
        },
      ],
    };
  });
}

/** Re-resolve homes after the player moves houses in the world editor. */
export function reanchorTownsfolk(folk: Townsperson[], anchors: TownsfolkAnchors): Townsperson[] {
  return folk.map((npc) => {
    const home = anchors.points[npc.homeKey] ?? npc.home;
    if (home.x === npc.home.x && home.y === npc.home.y) return npc;
    return { ...npc, home };
  });
}

/**
 * Serializable townsfolk snapshot (BUILD 322). The active NavPath is
 * deliberately dropped — the state machine rebuilds paths on demand
 * (shouldReplanPath treats a missing path as "replan"), so a restored NPC
 * resumes walking from exactly where it stood instead of replaying a stale
 * route. Homes are re-anchored by the caller (houses may have moved).
 */
export type TownsfolkSave = {
  id: string;
  position: TownsfolkPoint;
  facing: TownsfolkFacing;
  moving: boolean;
  activity: string;
  indoors: boolean;
  location: NPCWorldLocation;
  homeId?: string;
  bedId?: string;
  buildingId?: string;
  /** BUILD 366: village-life state (all optional — old saves restore fine). */
  age?: 'child' | 'young' | 'adult' | 'elder';
  goldDelta?: number;
  memories?: NPCMemory[];
  /** BUILD 922: gear-economy stash + wealth goal (optional — old saves restore fine). */
  ownedGear?: string[];
  wealthGoal?: number;
  /** BUILD 885: jail sentence end tick (optional — old saves restore fine). */
  jailedUntilTick?: number;
};

const VALID_LOCATIONS: NPCWorldLocation[] = ['OUTDOOR', 'ENTERING', 'INTERIOR', 'EXITING', 'SLEEPING', 'WORKING'];

export function serializeTownsfolk(folk: Townsperson[]): TownsfolkSave[] {
  return folk.map((npc) => ({
    id: npc.id,
    position: { ...npc.position },
    facing: npc.facing,
    moving: npc.moving,
    activity: npc.activity,
    indoors: npc.indoors,
    location: npc.location,
    homeId: npc.homeId,
    bedId: npc.bedId,
    buildingId: npc.buildingId,
    age: npc.age,
    goldDelta: npc.goldDelta,
    memories: npc.memories?.map((m) => ({ ...m })),
    ownedGear: npc.ownedGear ? [...npc.ownedGear] : undefined,
    wealthGoal: npc.wealthGoal,
    jailedUntilTick: npc.jailedUntilTick,
  }));
}

/** Ticks an NPC flees after being attacked (~5 seconds at 60 ticks/sec). */
export const NPC_FLEE_DURATION_TICKS = 300;

/**
 * Mark an NPC as fleeing from a threat position (BUILD 436). Pure.
 * The NPC will run away from `from` for NPC_FLEE_DURATION_TICKS.
 */
export function startNpcFlee(npc: Townsperson, from: TownsfolkPoint, tick: number): Townsperson {
  return {
    ...npc,
    fleeUntilTick: tick + NPC_FLEE_DURATION_TICKS,
    fleeFrom: { ...from },
  };
}

/** Max HP for an NPC (BUILD 441). Guards are tougher. */
export function npcMaxHp(npc: Townsperson): number {
  return npc.archetype === 'guard' ? 60 : 30;
}

/**
 * BUILD 918: real-time cooldown between an NPC's landed melee hits while
 * fighting back (vs the player or a creature). Matches the creature
 * family cadence (GOAT_ATTACK_COOLDOWN_MS = 1000 ms in App.tsx).
 */
export const NPC_FIGHT_ATTACK_COOLDOWN_MS = 900;

/**
 * BUILD 918: step multiplier for a fighting NPC's pursuit in advanceOne.
 * At the App's standard step (0.22 units per 120 ms advance) this is
 * ~5.9 units/s — a genuine run: faster than the player's walk (~5 u/s),
 * so a fighting NPC closes on a walking/kiter player and keeps landing
 * hits, but slower than the player's sprint (1.75x walk), so sprinting
 * away remains a real escape. The old 1.35 multiplier (~2.5 u/s) could
 * never close on a moving player at all.
 */
export const NPC_FIGHT_CHASE_STEP_MULT = 3.2;

/**
 * BUILD 919: rate limit for combat-pursuit replans. advanceOne runs on the
 * 120 ms movement interval, so 1500 ms is ~12 ticks: a fighting NPC runs
 * at most ~0.67 A* searches per second, and only while it is actually
 * fighting (a handful of NPCs at most). Compare BUILD 905's lag bomb:
 * every NPC with an unreachable schedule destination retrying a full-grid
 * A* every 120 ms tick, forever (~25 searches/sec). The interval alone
 * bounds combat search load two orders of magnitude below that storm.
 */
export const NPC_FIGHT_REPATH_INTERVAL_MS = 1500;

/**
 * BUILD 919: target movement (in field units) that forces an immediate
 * combat replan even inside the interval — 6 units is 1.5 A* cells, so
 * ordinary kiting (the target moves ~0.7 units per 120 ms tick) never
 * triggers it; only a genuine jump (door entry, teleport, sprint burst
 * across the threshold) does.
 */
export const NPC_FIGHT_REPATH_SHIFT = 6;

/**
 * BUILD 919: consecutive failed combat-path plans after which the NPC
 * drops the fight and falls back to its schedule — the bounded give-up
 * for unreachable targets (behind a building interior, across an
 * unpathable gap). At the 1500 ms interval this spans ~4.5 s of waiting,
 * then silence: no search spam, no wall-swinging forever.
 */
export const NPC_FIGHT_MAX_PLAN_FAILURES = 3;

/**
 * BUILD 919: should the fighting NPC (re)plan its combat route? Pure.
 * - No route: plan one.
 * - Route consumed (NPC arrived at the old destination): replan only on
 *   the interval or a big target jump — never every tick.
 * - Route live: replan immediately only on a big target jump; otherwise
 *   replan on the interval once the target has drifted at least 2 units
 *   (so a kiting target gets a fresh route ~1.5 s at a time, not a stale
 *   one, and a stationary target costs zero searches).
 */
export function shouldReplanFightPath(
  path: NavPath | undefined,
  target: NavPoint,
  nowMs: number,
  plannedAtMs: number | undefined,
): boolean {
  if (!path) return true;
  const shift = Math.hypot(path.destination.x - target.x, path.destination.y - target.y);
  if (path.index >= path.waypoints.length) {
    return nowMs - (plannedAtMs ?? 0) >= NPC_FIGHT_REPATH_INTERVAL_MS || shift >= NPC_FIGHT_REPATH_SHIFT;
  }
  if (shift >= NPC_FIGHT_REPATH_SHIFT) return true;
  if (shift >= 2 && nowMs - (plannedAtMs ?? 0) >= NPC_FIGHT_REPATH_INTERVAL_MS) return true;
  return false;
}

/**
 * BUILD 918: character-XP value of a kill, by victim effective level.
 * Mirrors goatExperienceReward in App.tsx exactly (base 25, floor 5,
 * -2 per player level above 1, -1 per victim level above the player's,
 * +1 per 5 INT) so an NPC kill pays on the same scale as a creature
 * kill of the same effective level. Pure.
 */
export function killExperienceForLevel(victimLevel: number, playerLevel: number, intStat: number): number {
  const progressionPenalty = Math.max(0, playerLevel - 1) * 2;
  const monsterPenalty = Math.max(0, victimLevel - playerLevel);
  return Math.max(5, 25 - progressionPenalty - monsterPenalty) + Math.floor(intStat / 5);
}

/**
 * BUILD 918: XP the PLAYER earns for personally killing this NPC.
 * Effective level derives from the NPC's HP pool on the goat HP scale
 * (32 HP at level 1, +12 per level): a 30 HP commoner is a level-1
 * victim (same as a goat or a trivial monster); a 60 HP guard is
 * level 3 — worth at least a comparable monster. Pure.
 */
/**
 * BUILD 941: the NPC's effective victim level, factored out of
 * npcKillExperienceReward (identical math) so AA accrual can use the same
 * level without duplicating the formula.
 */
export function npcEffectiveLevel(npc: Townsperson): number {
  return 1 + Math.max(0, Math.floor((npcMaxHp(npc) - 32) / 12));
}

export function npcKillExperienceReward(npc: Townsperson, playerLevel: number, intStat: number): number {
  return killExperienceForLevel(npcEffectiveLevel(npc), playerLevel, intStat);
}

/** Current HP (defaults to full). */
export function npcHp(npc: Townsperson): number {
  return npc.hp ?? npcMaxHp(npc);
}

/** Exact 60/40 reaction split used by damageNpc. */
export function npcReactionForRoll(roll: number): 'fight' | 'flee' {
  return Math.max(0, Math.min(99, Math.floor(roll))) < 60 ? 'fight' : 'flee';
}

/** Ticks a dead NPC stays dead before respawning (~2 minutes at 60 ticks/sec). */
export const NPC_RESPAWN_TICKS = 7200;

/**
 * BUILD 879: NPCs make deterministic fight-or-flight decisions after being hit.
 * Guards and combat-capable archetypes are more likely to retaliate; civilians
 * still usually flee. A surviving fighter chases the attacker instead of fleeing.
 */
export function damageNpc(npc: Townsperson, damage: number, from: TownsfolkPoint, tick: number): Townsperson {
  const newHp = npcHp(npc) - damage;
  if (newHp <= 0) {
    return {
      ...npc, hp: 0, deadUntilTick: tick + NPC_RESPAWN_TICKS,
      fleeUntilTick: undefined, fleeFrom: undefined,
      fightBackUntilTick: undefined, fightBackTarget: undefined, fightBackNextAttackAtMs: undefined, running: false,
    };
  }
  // BUILD 901: clear 60/40 fight-or-flight roll for every adult townsperson.
  // Use the stable identity seed + tick + remaining HP so re-renders never
  // reroll the reaction and the same hit cannot flip between fleeing/fighting.
  const personalityRoll = Math.abs((npc.seed * 31 + Math.floor(tick / 3) * 17 + Math.round(npcHp(npc))) % 100);
  if (npcReactionForRoll(personalityRoll) === 'fight') {
    return {
      ...npc, hp: newHp,
      fleeUntilTick: undefined, fleeFrom: undefined,
      fightBackUntilTick: tick + 900, fightBackTarget: { ...from },
      moving: true, running: true, activity: 'Fighting back!',
    };
  }
  return {
    ...startNpcFlee({ ...npc, fightBackUntilTick: undefined, fightBackTarget: undefined }, from, tick),
    hp: newHp,
  };
}

/**
 * BUILD 914: an NPC is hit by a CREATURE. Runs the exact same fight-or-flee
 * decision as a player attack (damageNpc — same deterministic roll, same
 * death path), then tags the retaliation with the creature's identity so
 * the world combat loop chases and hits the creature instead of the
 * player. Guards are braver against beasts than against people: a guard
 * who rolled "flee" against a creature holds his ground and fights — a
 * wolf in town is precisely what guards exist for. No crime, witness, or
 * bounty consequences are recorded here: those exist only in the
 * player-attack handlers, so a creature kill never incriminates the
 * player. Pure.
 */
export function damageNpcByCreature(
  npc: Townsperson,
  damage: number,
  from: TownsfolkPoint,
  creatureKind: 'goat' | 'monster',
  creatureId: number,
  tick: number,
): Townsperson {
  const hurt = damageNpc(npc, damage, from, tick);
  if (hurt.deadUntilTick !== undefined) {
    return { ...hurt, fightBackCreatureId: undefined, fightBackCreatureKind: undefined };
  }
  if (hurt.fightBackUntilTick !== undefined) {
    return { ...hurt, fightBackCreatureId: creatureId, fightBackCreatureKind: creatureKind };
  }
  // The NPC chose to flee. Guards override the roll against creatures.
  if (npc.archetype === 'guard') {
    return {
      ...hurt,
      fleeUntilTick: undefined, fleeFrom: undefined,
      fightBackUntilTick: tick + 900, fightBackTarget: { ...from },
      fightBackCreatureId: creatureId, fightBackCreatureKind: creatureKind,
      moving: true, running: true, activity: 'Fighting back!',
    };
  }
  return { ...hurt, fightBackCreatureId: undefined, fightBackCreatureKind: undefined };
}

/** Whether the NPC is currently dead. */
export function isNpcDead(npc: Townsperson, tick: number): boolean {
  return npc.deadUntilTick !== undefined && tick < npc.deadUntilTick;
}

/** Ticks an arrested NPC spends in jail (2 in-game days at 10 min/tick). */
export const NPC_JAIL_TICKS = 288;

/** Whether the NPC is currently serving a jail sentence. BUILD 885. */
export function isNpcJailed(npc: Townsperson, tick: number): boolean {
  return npc.jailedUntilTick !== undefined && tick < npc.jailedUntilTick;
}

/** Arrest an NPC: pure — returns a copy serving a jail sentence from `tick`. */
export function arrestNpc(npc: Townsperson, tick: number): Townsperson {
  return {
    ...npc,
    jailedUntilTick: tick + NPC_JAIL_TICKS,
    moving: false,
    running: false,
    activity: 'In jail',
    path: undefined,
  };
}
export const NPC_SCREAMS = [
  'AHHH!',
  'Help! Help!',
  "Don't hurt me!",
  'Somebody help!',
  'Ow! Why?!',
  'Stay back!',
];

/** Pick a deterministic scream for an NPC. Pure. */
export function screamFor(npc: Townsperson): string {
  return NPC_SCREAMS[npc.seed % NPC_SCREAMS.length];
}

export function isTownsfolkSave(value: unknown): value is TownsfolkSave {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string') return false;
  const p = v.position as Record<string, unknown> | undefined;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  if (typeof v.activity !== 'string') return false;
  if (!VALID_LOCATIONS.includes(v.location as NPCWorldLocation)) return false;
  // BUILD 366: optional life fields — validate leniently, ignore if malformed.
  if (v.age !== undefined && !['child', 'young', 'adult', 'elder'].includes(v.age as string)) return false;
  if (v.goldDelta !== undefined && !Number.isFinite(v.goldDelta)) return false;
  if (v.memories !== undefined && !Array.isArray(v.memories)) return false;
  // BUILD 922: optional gear-economy fields — validate leniently, ignore if malformed.
  if (v.ownedGear !== undefined && (!Array.isArray(v.ownedGear) || !(v.ownedGear as unknown[]).every((g) => typeof g === 'string'))) return false;
  if (v.wealthGoal !== undefined && !Number.isFinite(v.wealthGoal)) return false;
  if (v.jailedUntilTick !== undefined && !Number.isFinite(v.jailedUntilTick)) return false;
  return true;
}

/**
 * Merge a save snapshot onto a freshly created roster. Unknown ids are
 * ignored; invalid entries fall back to the fresh NPC. Returns new objects
 * only for restored NPCs (identity-preserving for the rest).
 */
export function restoreTownsfolk(folk: Townsperson[], saved: unknown): Townsperson[] {
  if (!Array.isArray(saved) || saved.length === 0) return folk;
  const byId = new Map<string, TownsfolkSave>();
  for (const entry of saved) {
    if (isTownsfolkSave(entry)) byId.set(entry.id, entry);
  }
  if (byId.size === 0) return folk;
  return folk.map((npc) => {
    const s = byId.get(npc.id);
    if (!s) return npc;
    const memories = Array.isArray(s.memories)
      ? (s.memories as NPCMemory[]).filter(
          (m) => m && typeof m.event === 'string' && Number.isFinite(m.day) && m.importance >= 1 && m.importance <= 3,
        ).slice(0, 12)
      : undefined;
    return {
      ...npc,
      position: { x: s.position.x, y: s.position.y },
      facing: (['up', 'down', 'left', 'right'] as TownsfolkFacing[]).includes(s.facing) ? s.facing : npc.facing,
      moving: false, // resumes on the next schedule tick; never restore mid-stride
      activity: s.activity,
      indoors: s.indoors,
      location: s.location,
      path: undefined, // rebuilt on demand — never replay a stale route
      homeId: s.homeId ?? npc.homeId,
      bedId: s.bedId ?? npc.bedId,
      buildingId: s.buildingId,
      age: s.age ?? npc.age,
      goldDelta: s.goldDelta ?? npc.goldDelta,
      memories: memories ?? npc.memories,
      ownedGear: s.ownedGear ? [...s.ownedGear] : npc.ownedGear,
      wealthGoal: s.wealthGoal ?? npc.wealthGoal,
      jailedUntilTick: s.jailedUntilTick ?? npc.jailedUntilTick,
    };
  });
}

/** Navigation context for physical townsfolk movement. */
export type TownsfolkNavContext = {
  housing: HousingRegistry;
  doors: DoorwayLink[];
  obstacles: ObstacleRect[];
  /** Chunk road piece for A* road preference (e.g. 'nesw', 'none'). */
  roadPiece?: string;
  /** Chunk coords for A* water/bridge costs (Phase 2c). Omit indoors. */
  chunk?: { x: number; y: number };
};

function homeDoorFor(npc: Townsperson, nav: TownsfolkNavContext): DoorwayLink | undefined {
  const assignment = nav.housing.assignments[npc.id];
  if (!assignment) return undefined;
  const home = nav.housing.homes.find((h) => h.id === assignment.homeId);
  if (!home) return undefined;
  return nav.doors.find((d) => d.id === home.doorwayId);
}

type FightPursuitResult = {
  /** NPC with position/path/facing updated for this tick. */
  npc: Townsperson;
  /** True when no route exists right now: hold position, retry on cadence. */
  waiting: boolean;
  /** True when the target proved unreachable: the caller drops the fight. */
  gaveUpFight: boolean;
};

/**
 * BUILD 919: one combat-pursuit step for a fighting NPC. The NPC follows
 * an A* route (pathTo: building avoidance, road preference, water costs)
 * toward the live target instead of steering straight at it, so walls no
 * longer strand it. Planning obeys shouldReplanFightPath, so searches are
 * bounded (~0.67/sec per fighter worst case); a null plan increments the
 * failure count and stores an EMPTY route, which puts the retry on the same
 * 1500 ms cadence (a transiently unroutable target does not drop the fight
 * in milliseconds), and at NPC_FIGHT_MAX_PLAN_FAILURES spaced failures the
 * fight is dropped. The NPC never walks through a building: routes come from
 * the same pathfinder schedule movement uses, and a null route waits instead
 * of falling back to a straight line through the wall.
 */
function stepFightPursuit(
  npc: Townsperson,
  target: TownsfolkPoint,
  nav: TownsfolkNavContext,
  chaseStep: number,
  nowMs: number,
): FightPursuitResult {
  let path = npc.fightPath;
  if (shouldReplanFightPath(path, target, nowMs, npc.fightPathPlannedAtMs)) {
    const fresh = pathTo(npc.position, target, nav.obstacles, nav.roadPiece, nav.chunk);
    if (!fresh) {
      const failures = (npc.fightPathFailures ?? 0) + 1;
      if (failures >= NPC_FIGHT_MAX_PLAN_FAILURES) {
        return { npc, waiting: false, gaveUpFight: true };
      }
      // A failed plan stores an EMPTY route (index 0 >= 0 waypoints =
      // consumed), NOT undefined: shouldReplanFightPath replans instantly
      // for an undefined route, so the old code retried 3 times in ~360 ms
      // and dropped a fight whose target was only transiently unroutable
      // (teleport into a building cluster / deep water). The empty route
      // puts retries on the same 1500 ms cadence as live routes — or
      // immediately if the target jumps >= 6 units, in case it re-entered
      // reachability. Only persistently unroutable targets (3 spaced
      // failures, ~3 s) drop the fight.
      return {
        npc: { ...npc, fightPath: { waypoints: [], index: 0, destination: { ...target }, replanCooldown: REPLAN_COOLDOWN_TICKS }, fightPathPlannedAtMs: nowMs, fightPathFailures: failures },
        waiting: true,
        gaveUpFight: false,
      };
    }
    path = fresh;
    npc = { ...npc, fightPath: path, fightPathPlannedAtMs: nowMs, fightPathFailures: 0 };
  }
  const res = stepAlongPath(path!, npc.position, chaseStep);
  if (res.arrived) {
    // Route consumed but the target is still out of range (it moved, or
    // the validated destination stopped short of it). Hold here: the next
    // ticks replan on cadence via shouldReplanFightPath instead of
    // spinning a search every 120 ms. The consumed route stays stored so
    // the interval gate applies.
    return {
      npc: { ...npc, fightPath: { ...res.path }, moving: false, running: false, activity: 'Fighting back!' },
      waiting: false,
      gaveUpFight: false,
    };
  }
  return {
    npc: { ...npc, position: res.position, fightPath: res.path, facing: res.facing, moving: true, running: true, activity: 'Fighting back!' },
    waiting: false,
    gaveUpFight: false,
  };
}

/**
 * Step one NPC physically. The schedule (townsfolkTarget) decides WHAT the
 * NPC wants; this decides HOW they get there — always by walking, never by
 * teleporting. Doorways are crossed on foot; beds are walked to.
 */
function advanceOne(
  npc: Townsperson,
  anchors: TownsfolkAnchors,
  clock: WorldClockState,
  nav: TownsfolkNavContext,
  step: number,
  resolveTarget: (npc: Townsperson, anchors: TownsfolkAnchors, clock: WorldClockState) => TownsfolkTarget = townsfolkTarget,
  /** Real-time ms for combat-pursuit repath cadence (BUILD 919). Defaults to wall clock; sim tests pass explicit values for determinism. */
  nowMs: number = Date.now(),
): Townsperson {
  // --- DEAD (BUILD 441): skip entirely until respawn. ---
  if (npc.deadUntilTick !== undefined) {
    if (clock.tick < npc.deadUntilTick) return npc;
    // Respawn: back home, full HP, clear death.
    return { ...npc, hp: undefined, deadUntilTick: undefined, position: { ...npc.home }, activity: 'At home' };
  }

  // --- JAILED (BUILD 885): skip schedule until the sentence ends. ---
  if (npc.jailedUntilTick !== undefined) {
    if (clock.tick < npc.jailedUntilTick) return npc;
    // Released: back home, sentence served.
    return { ...npc, jailedUntilTick: undefined, position: { ...npc.home }, activity: 'At home' };
  }

  // --- BUILD 879: retaliating NPCs chase the player and suspend their schedule. ---
  // --- BUILD 919: the chase follows an A* route (stepFightPursuit) instead
  // of steering straight at the target, so a building between NPC and
  // target no longer strands it. Attack range and the 918 real-time hit
  // cadence are untouched — only how the NPC GETS there changed.
  if (!npc.indoors && npc.fightBackUntilTick !== undefined && npc.fightBackTarget) {
    if (clock.tick < npc.fightBackUntilTick) {
      const target = npc.fightBackTarget;
      const dist = Math.hypot(target.x - npc.position.x, target.y - npc.position.y);
      if (dist <= 1.35) {
        // In range: attacking stance (hits land via the App combat loop).
        // Drop any stale combat route.
        return { ...npc, fightPath: undefined, fightPathPlannedAtMs: undefined, fightPathFailures: undefined, moving: false, running: false, activity: npc.fightBackCreatureId != null ? 'Attacking the creature!' : 'Attacking the player' };
      }
      // BUILD 918: a fighting NPC RUNS at the target (see
      // NPC_FIGHT_CHASE_STEP_MULT). The old 1.35 multiplier was slower
      // than the player's walk, so a kiting player was never caught.
      const chaseStep = step * NPC_FIGHT_CHASE_STEP_MULT;
      const pursuit = stepFightPursuit(npc, target, nav, chaseStep, nowMs);
      if (pursuit.gaveUpFight) {
        // Target unreachable after repeated plans: drop the fight and fall
        // through to schedule — the same exit as fight expiry below.
        npc = { ...npc, fightBackUntilTick: undefined, fightBackTarget: undefined, fightBackNextAttackAtMs: undefined, fightBackCreatureId: undefined, fightBackCreatureKind: undefined, fightPath: undefined, fightPathPlannedAtMs: undefined, fightPathFailures: undefined, running: false };
      } else if (pursuit.waiting) {
        // No route right now: hold position, retry on cadence.
        return { ...pursuit.npc, moving: false, running: false, activity: 'Fighting back!' };
      } else {
        return pursuit.npc;
      }
    } else {
      npc = { ...npc, fightBackUntilTick: undefined, fightBackTarget: undefined, fightBackNextAttackAtMs: undefined, fightBackCreatureId: undefined, fightBackCreatureKind: undefined, fightPath: undefined, fightPathPlannedAtMs: undefined, fightPathFailures: undefined, running: false };
    }
  }

  // --- FLEEING (BUILD 436): run away from the attacker, skip schedule. ---
  // Only outdoors — indoor NPCs cower in place (don't path through walls).
  // BUILD 704: fleeing NPCs now genuinely RUN (1.5x walk, run animation).
  // BUILD 443 had slowed flee to 0.5x so the player could catch them; that
  // tradeoff is obsolete now that the player can sprint (1.75x walk) — a
  // sprinting player still catches a fleeing NPC. Flee lasts
  // NPC_FLEE_DURATION_TICKS, which is the natural stamina bound: after that
  // the NPC drops back to a walk.
  if (!npc.indoors && npc.fleeUntilTick !== undefined && npc.fleeFrom) {
    if (clock.tick < npc.fleeUntilTick) {
      const dx = npc.position.x - npc.fleeFrom.x;
      const dy = npc.position.y - npc.fleeFrom.y;
      const dist = Math.hypot(dx, dy) || 1;
      const fleeStep = step * 1.5;
      const nx = dx / dist, ny = dy / dist;
      const facing: TownsfolkFacing = Math.abs(nx) >= Math.abs(ny)
        ? (nx >= 0 ? 'right' : 'left')
        : (ny >= 0 ? 'down' : 'up');
      return {
        ...npc,
        position: { x: npc.position.x + nx * fleeStep, y: npc.position.y + ny * fleeStep },
        facing,
        moving: true,
        running: true,
        activity: 'Fleeing!',
      };
    }
    // Flee expired: clear the state and resume schedule (back to a walk).
    npc = { ...npc, fleeUntilTick: undefined, fleeFrom: undefined, running: false };
  }

  const want = resolveTarget(npc, anchors, clock);
  const wantsSleep = want.indoors && want.activity === 'Sleeping';
  const wantsIndoors = want.indoors;

  // --- SLEEPING: stay unless the schedule says to wake. ---
  if (npc.location === 'SLEEPING') {
    if (wantsSleep) return npc;
    // Wake up: walk from bed to the interior door, then exit.
    const bed = bedFor(nav.housing, npc.id);
    const door = homeDoorFor(npc, nav);
    if (!bed || !door) return { ...npc, location: 'INTERIOR' as NPCWorldLocation, activity: want.activity };
    const waypoints = findPath(npc.position, door.interior, []);
    const path: NavPath = waypoints
      ? { waypoints, index: 0, destination: { ...door.interior } }
      : straightFallbackPath(door.interior, []);
    return { ...npc, location: 'INTERIOR', path, moving: true, activity: 'Waking up', indoors: true, buildingId: bed.home.id };
  }

  // --- INTERIOR (awake inside): walk to bed to sleep, or to the door to leave. ---
  if (npc.location === 'INTERIOR') {
    const bed = bedFor(nav.housing, npc.id);
    const door = homeDoorFor(npc, nav);
    if (wantsSleep && bed) {
      // Walk to the assigned bed.
      if (shouldReplanPath(npc.path, bed.bed.position)) {
        const waypoints = findPath(npc.position, bed.bed.position, []);
        const path: NavPath = waypoints
          ? { waypoints, index: 0, destination: { ...bed.bed.position } }
          : straightFallbackPath(bed.bed.position, []);
        return { ...npc, path, moving: true, activity: want.activity, indoors: true };
      }
      if (npc.path!.gaveUp) {
        // Destination unreachable: wait for the schedule to pick a new one.
        return { ...npc, moving: false, activity: want.activity, indoors: true };
      }
      const res = stepAlongPath(npc.path!, npc.position, step);
      if (res.arrived) {
        return { ...npc, position: res.position, path: undefined, moving: false, location: 'SLEEPING', activity: 'Sleeping', indoors: true, facing: res.facing, bedId: bed.bed.id };
      }
      const tracked = trackStep(npc.path!, npc.position, res, (from) => {
        const wps = findPath(from, bed.bed.position, []);
        return wps ? { waypoints: wps, index: 0, destination: { ...bed.bed.position } } : null;
      });
      return { ...npc, position: tracked.position, path: tracked.path, moving: tracked.moving, facing: tracked.facing, activity: want.activity, indoors: true };
    }
    // Wants to go outside: walk to the interior door, then step out.
    // No door (unreachable in production — every assigned home has a doorway):
    // stay inside and wait rather than flipping to OUTDOOR while physically
    // indoors, which would path through the building walls.
    if (!door) return { ...npc, location: 'INTERIOR' as NPCWorldLocation, indoors: true, moving: false, path: undefined, activity: want.activity };
    if (wantsIndoors) {
      // Awake but the schedule wants them inside ('At home', BUILD 329):
      // stroll between deterministic interior waypoints (BUILD 333) instead
      // of freezing at one spot. Never the revolving door back outside —
      // the leave logic below only runs for outdoor wants.
      const wander = interiorWanderSpot(npc, door, clock);
      const atSpot = Math.hypot(npc.position.x - wander.x, npc.position.y - wander.y) < 1.0;
      const dest = npc.path && !npc.path.gaveUp ? npc.path.destination : null;
      const destStale = !dest || Math.hypot(dest.x - wander.x, dest.y - wander.y) > 1.5;
      if (!atSpot && destStale) {
        const waypoints = findPath(npc.position, wander, []);
        const path: NavPath = waypoints
          ? { waypoints, index: 0, destination: { ...wander } }
          : straightFallbackPath(wander, []);
        return { ...npc, path, moving: true, activity: want.activity, indoors: true, location: 'INTERIOR' as NPCWorldLocation };
      }
      if (!atSpot && npc.path && !npc.path.gaveUp) {
        const res = stepAlongPath(npc.path, npc.position, step);
        if (res.arrived) {
          return { ...npc, position: res.position, path: undefined, moving: false, location: 'INTERIOR' as NPCWorldLocation, indoors: true, facing: res.facing, activity: want.activity, buildingId: npc.buildingId ?? bed?.home.id };
        }
        const tracked = trackStep(npc.path, npc.position, res, (from) => {
          const wps = findPath(from, wander, []);
          return wps ? { waypoints: wps, index: 0, destination: { ...wander } } : null;
        });
        return { ...npc, position: tracked.position, path: tracked.path, moving: tracked.moving, facing: tracked.facing, activity: want.activity, indoors: true, location: 'INTERIOR' as NPCWorldLocation };
      }
      return { ...npc, moving: false, activity: want.activity, indoors: true, location: 'INTERIOR' as NPCWorldLocation, path: undefined, buildingId: npc.buildingId ?? bed?.home.id };
    }
    if (npc.path?.gaveUp) {
      // Destination unreachable: wait for the schedule to pick a new one.
      return { ...npc, moving: false, activity: want.activity, indoors: true };
    }
    if (!npc.path) {
      // (Re)build path to the interior door if we don't have one.
      const waypoints = findPath(npc.position, door.interior, []);
      const path: NavPath = waypoints
        ? { waypoints, index: 0, destination: { ...door.interior } }
        : straightFallbackPath(door.interior, []);
      return { ...npc, path, moving: true, activity: want.activity, indoors: true };
    }
    const res = stepAlongPath(npc.path!, npc.position, step);
    if (res.arrived) {
      // At the interior door: step out through the doorway as EXITING (still
      // hidden — indoors stays true until the NPC reaches the exterior, so
      // they never visibly pop inside the cottage walls).
      const waypoints = findPath(door.interior, door.exterior, []);
      const exitPath: NavPath = waypoints
        ? { waypoints, index: 0, destination: { ...door.exterior } }
        : straightFallbackPath(door.exterior, []);
      return {
        ...npc,
        position: res.position,
        location: 'EXITING',
        indoors: true,
        path: exitPath,
        moving: true,
        facing: res.facing,
        activity: 'Leaving',
      };
    }
    const tracked = trackStep(npc.path!, npc.position, res, (from) => {
      const wps = findPath(from, door.interior, []);
      return wps ? { waypoints: wps, index: 0, destination: { ...door.interior } } : null;
    });
    return { ...npc, position: tracked.position, path: tracked.path, moving: tracked.moving, facing: tracked.facing, activity: want.activity, indoors: true };
  }

  // --- EXITING: stepping out through the doorway (hidden — indoors stays true
  // until the NPC reaches the exterior, so they never visibly pop inside the
  // cottage walls). Mirrors ENTERING. ---
  if (npc.location === 'EXITING') {
    const door = homeDoorFor(npc, nav);
    if (!door) return { ...npc, location: 'INTERIOR' as NPCWorldLocation, indoors: true, moving: false, path: undefined, activity: want.activity };
    if (npc.path?.gaveUp) {
      // Doorway blocked: wait inside rather than clipping through walls.
      return { ...npc, moving: false, indoors: true, activity: 'Leaving' };
    }
    if (!npc.path) {
      const waypoints = findPath(npc.position, door.exterior, []);
      const path: NavPath = waypoints
        ? { waypoints, index: 0, destination: { ...door.exterior } }
        : straightFallbackPath(door.exterior, []);
      return { ...npc, path, moving: true, indoors: true, activity: 'Leaving' };
    }
    const res = stepAlongPath(npc.path, npc.position, step);
    if (res.arrived) {
      // Stepped outside: become a normal outdoor NPC at the door exterior.
      // The OUTDOOR branch paths to the schedule target on the next tick.
      return {
        ...npc,
        position: res.position,
        location: 'OUTDOOR',
        indoors: false,
        buildingId: undefined,
        path: undefined,
        moving: false,
        facing: res.facing,
        activity: want.activity,
      };
    }
    const tracked = trackStep(npc.path, npc.position, res, (from) => {
      const wps = findPath(from, door.exterior, []);
      return wps ? { waypoints: wps, index: 0, destination: { ...door.exterior } } : null;
    });
    return { ...npc, position: tracked.position, path: tracked.path, moving: tracked.moving, facing: tracked.facing, indoors: true, activity: 'Leaving' };
  }

  // --- ENTERING: walking the outdoor path to the home door exterior. ---
  if (npc.location === 'ENTERING' && npc.path) {
    const door = npc.path.viaDoor;
    if (npc.path.gaveUp) {
      // Destination unreachable: wait for the schedule to pick a new one.
      return { ...npc, moving: false, activity: want.activity, indoors: false };
    }
    const res = stepAlongPath(npc.path, npc.position, step);
    if (res.arrived && door) {
      // At the door exterior. Step through: now inside. Position is NOT
      // snapped — the NPC walks from the exterior through the doorway to the
      // interior point as the first leg of the interior path.
      const bed = bedFor(nav.housing, npc.id);
      let inPath: NavPath | undefined;
      if (wantsSleep && bed) {
        const wps = findPath(door.interior, bed.bed.position, []);
        const fullWps = [{ ...door.interior }, ...(wps ?? [straightFallbackPath(bed.bed.position, []).waypoints[0]])];
        inPath = { waypoints: fullWps, index: 0, destination: { ...bed.bed.position }, replanCooldown: REPLAN_COOLDOWN_TICKS };
      } else if (wantsIndoors) {
        // 'At home' (BUILD 329): walk through the door to the indoor rest
        // spot, not just the doorway — the NPC settles inside for the evening.
        const rest = indoorRestSpot(npc, door);
        const wps = findPath(door.interior, rest, []);
        inPath = { waypoints: [{ ...door.interior }, ...(wps ?? [rest])], index: 0, destination: { ...rest }, replanCooldown: REPLAN_COOLDOWN_TICKS };
      } else {
        inPath = { waypoints: [{ ...door.interior }], index: 0, destination: { ...door.interior }, replanCooldown: REPLAN_COOLDOWN_TICKS };
      }
      return {
        ...npc,
        location: 'INTERIOR',
        indoors: true,
        buildingId: npc.buildingId,
        path: inPath,
        moving: true,
        facing: res.facing,
        activity: want.activity,
      };
    }
    if (res.arrived) {
      // No door reference (shouldn't happen) — treat as inside.
      return { ...npc, position: res.position, path: undefined, moving: false, location: 'INTERIOR', indoors: true, facing: res.facing, activity: want.activity };
    }
    const tracked = trackStep(npc.path, npc.position, res, (from) =>
      door ? pathToDoor(from, door, nav.obstacles, nav.roadPiece, nav.chunk) : null,
    );
    return { ...npc, position: tracked.position, path: tracked.path, moving: tracked.moving, facing: tracked.facing, activity: want.activity, indoors: false };
  }

  // --- OUTDOOR: the normal case. ---
  // Wants to go inside (sleep or shelter): walk to the home door.
  if (wantsIndoors) {
    const door = homeDoorFor(npc, nav);
    if (!door) {
      // No assigned home (housing shortage): stay put, don't teleport.
      return npc.activity === want.activity && !npc.moving ? npc : { ...npc, moving: false, activity: want.activity };
    }
    if (npc.path?.gaveUp && pathDestIs(npc.path, door.exterior)) {
      // This door already proved unreachable: keep waiting instead of
      // re-running a full-grid A* every tick. A new schedule destination
      // (pathDestIs false) clears the wait on its own.
      return npc.activity === want.activity && !npc.moving ? npc : { ...npc, moving: false, activity: want.activity };
    }
    const needNewPath =
      npc.location !== 'ENTERING' || shouldReplanPath(npc.path, door.exterior);
    if (needNewPath) {
      const path = pathToDoor(npc.position, door, nav.obstacles, nav.roadPiece, nav.chunk);
      if (!path) {
        // Door unreachable: wait (don't teleport, don't wander). Record the
        // give-up on the NPC so subsequent ticks take the early-out above
        // instead of repeating the failed search.
        const gaveUpPath: NavPath = { waypoints: [], index: 0, destination: { ...door.exterior }, gaveUp: true };
        return { ...npc, moving: false, activity: want.activity, path: gaveUpPath };
      }
      const bed = bedFor(nav.housing, npc.id);
      return { ...npc, location: 'ENTERING', path, moving: true, activity: want.activity, indoors: false, buildingId: bed?.home.id };
    }
    // Already ENTERING with a path — handled above; fall through to step it.
    return advanceOne({ ...npc, location: 'ENTERING' as NPCWorldLocation }, anchors, clock, nav, step);
  }

  // Wants to be outdoors at `want.target`: walk there.
  const dx = want.target.x - npc.position.x;
  const dy = want.target.y - npc.position.y;
  if (Math.hypot(dx, dy) < 0.7 && !npc.path) {
    // BUILD 694: a settled NPC adopts the schedule's arrival facing (e.g. a
    // browser turning to face the stall when the browse phase begins — the
    // target doesn't move, so this branch is where the turn happens).
    const settledFacing = want.face ?? npc.facing;
    const settled = !npc.moving && npc.activity === want.activity && !npc.indoors
      && npc.location === 'OUTDOOR' && npc.facing === settledFacing;
    return settled
      ? npc
      : { ...npc, moving: false, activity: want.activity, indoors: false, location: 'OUTDOOR', path: undefined, facing: settledFacing };
  }
  if (npc.path?.gaveUp && pathDestIs(npc.path, want.target)) {
    // Destination unreachable: wait for the schedule to pick a new one.
    return npc.activity === want.activity && !npc.moving
      ? npc
      : { ...npc, moving: false, activity: want.activity, indoors: false, location: 'OUTDOOR' };
  }
  const needNewPath = shouldReplanPath(npc.path, want.target);
  let path = npc.path;
  if (needNewPath) {
    const newPath = pathTo(npc.position, want.target, nav.obstacles, nav.roadPiece, nav.chunk);
    if (!newPath) {
      // Destination unreachable: wait, and record the give-up so the
      // full-grid A* failure is not retried every 120ms tick. The gaveUp
      // guard above releases the NPC as soon as the schedule picks a new
      // destination.
      const gaveUpPath: NavPath = { waypoints: [], index: 0, destination: { ...want.target }, gaveUp: true };
      return { ...npc, moving: false, activity: want.activity, path: gaveUpPath };
    }
    path = newPath;
  }
  const res = stepAlongPath(path!, npc.position, step);
  if (res.arrived) {
    // BUILD 694: adopt the schedule's arrival facing when one is given (a
    // browser faces the stall they stopped at); otherwise keep walk facing.
    return { ...npc, position: res.position, path: undefined, moving: false, activity: want.activity, indoors: false, location: 'OUTDOOR', facing: want.face ?? res.facing };
  }
  const tracked = trackStep(path!, npc.position, res, (from) => pathTo(from, want.target, nav.obstacles, nav.roadPiece, nav.chunk));
  return { ...npc, position: tracked.position, path: tracked.path, moving: tracked.moving, facing: tracked.facing, activity: want.activity, indoors: false, location: 'OUTDOOR' };
}

// --- small helpers ---

function pathDestIs(path: NavPath, p: NavPoint): boolean {
  return Math.abs(path.destination.x - p.x) < 0.01 && Math.abs(path.destination.y - p.y) < 0.01;
}

/**
 * Should the NPC (re)plan a path to `target`?
 * - No path: yes. Gave up waiting: only a NEW destination replans.
 * - Same destination: no.
 * - Nearby destination during the anti-oscillation cooldown: no (prevents
 *   pacing when the schedule target jitters between close points).
 */
/** Should the NPC (re)plan a path to `target`? (Exported for sim tests.) */
export function shouldReplanPath(path: NavPath | undefined, target: NavPoint): boolean {
  if (!path) return true;
  if (path.gaveUp) return !pathDestIs(path, target);
  if (pathDestIs(path, target)) return false;
  if ((path.replanCooldown ?? 0) > 0) {
    const shift = Math.hypot(path.destination.x - target.x, path.destination.y - target.y);
    if (shift < REPLAN_HYSTERESIS) return false;
  }
  return true;
}

/**
 * Step every NPC toward its schedule target — physically. Runs on the
 * lightweight 120ms movement interval, only for the player's chunk.
 */
export function advanceTownsfolk(
  folk: Townsperson[],
  anchors: TownsfolkAnchors,
  clock: WorldClockState,
  nav: TownsfolkNavContext,
  step = 0.22,
  /**
   * Optional target resolver. Defaults to the base schedule (townsfolkTarget).
   * The village-life layer (villageLife.ts) passes `villageTarget` here to add
   * need-based overrides — kept as a callback so townsfolk.ts stays free of a
   * circular import.
   */
  resolveTarget: (npc: Townsperson, anchors: TownsfolkAnchors, clock: WorldClockState) => TownsfolkTarget = townsfolkTarget,
  /** Real-time ms for combat-pursuit repath cadence (BUILD 919); defaults to wall clock. */
  nowMs: number = Date.now(),
): Townsperson[] {
  return separateCrowd(folk.map((npc) => advanceOne(npc, anchors, clock, nav, step, resolveTarget, nowMs)));
}

/**
 * Light crowd separation (BUILD 319): after stepping, nudge apart outdoor
 * NPCs that overlap. Pure and deterministic (index-ordered pairs).
 *
 * Stability rules (no orbit jitter):
 * - Indoor/sleeping NPCs are authored positions — never touched.
 * - Settled NPCs (!moving) are anchors: only the moving member of a pair is
 *   pushed, so a walker flows around someone standing at a stall instead of
 *   shoving them off their spot (which would replan -> walk back -> loop).
 * - Pairs where nobody moves are left alone (a gathered crowd looks natural).
 * - NPCs far apart keep object identity so the renderer's change check works.
 */
export function separateCrowd(folk: Townsperson[], radius = 1.1, push = 0.14): Townsperson[] {
  // BUILD 467: spatial-hash separation (replaces O(n²) all-pairs).
  // Same behavior as before, but O(n) average via grid buckets.
  const eligible = (n: Townsperson) =>
    !n.indoors && n.location !== 'SLEEPING' && n.location !== 'INTERIOR';
  // Build hash of eligible, moving-or-near-moving NPCs.
  // We include all eligible NPCs (not just moving) because a stationary NPC
  // can still be pushed by a moving one, and vice versa.
  type HashEntry = { id: number; x: number; y: number; index: number; moving: boolean };
  const hash = new SpatialHash<HashEntry>({ cellSize: 4 });
  const entries: HashEntry[] = [];
  for (let i = 0; i < folk.length; i++) {
    if (!eligible(folk[i])) continue;
    const e: HashEntry = { id: i, x: folk[i].position.x, y: folk[i].position.y, index: i, moving: folk[i].moving };
    entries.push(e);
    hash.add(e);
  }
  if (entries.length < 2) return folk;

  const positions = folk.map((n) => ({ ...n.position }));
  const displaced = new Array<boolean>(folk.length).fill(false);
  const radiusSq = radius * radius;
  // For each entry, check neighbors via hash (avoids O(n²)).
  // To avoid double-processing pairs, only handle pairs where neighbor.id > entry.id.
  for (const e of entries) {
    hash.forEachNeighbor(e.x, e.y, radius, (other, dx, dy, distSq) => {
      if (other.id <= e.id) return; // each pair once
      if (!e.moving && !other.moving) return;
      if (distSq >= radiusSq) return;
      const dist = Math.sqrt(distSq); // one sqrt per close pair (rare)
      const nx = dist < 1e-6 ? 1 : dx / dist;
      const ny = dist < 1e-6 ? 0 : dy / dist;
      const overlap = (radius - Math.max(dist, 1e-6)) / radius;
      const px = nx * push * overlap;
      const py = ny * push * overlap;
      // Push the moving member(s); settled NPCs hold their ground.
      if (e.moving) {
        positions[e.index].x -= px;
        positions[e.index].y -= py;
        displaced[e.index] = true;
      }
      if (other.moving) {
        positions[other.index].x += px;
        positions[other.index].y += py;
        displaced[other.index] = true;
      }
    }, e.id);
  }
  if (!displaced.some(Boolean)) return folk;
  return folk.map((n, i) => (displaced[i] ? { ...n, position: positions[i] } : n));
}

/**
 * Initial placement when the player enters Mosslight (chunk enter / load).
 * This is world construction, not a schedule transition: each NPC is placed
 * in the physically-correct location state for the current time (in bed if
 * asleep, inside if indoors, at their home door if out). All subsequent
 * movement is physical — no teleporting between schedule states.
 */
export function snapTownsfolk(
  folk: Townsperson[],
  anchors: TownsfolkAnchors,
  clock: WorldClockState,
  nav: TownsfolkNavContext,
): Townsperson[] {
  return folk.map((npc) => {
    const resolved = townsfolkTarget(npc, anchors, clock);
    const wantsSleep = resolved.indoors && resolved.activity === 'Sleeping';
    const bed = bedFor(nav.housing, npc.id);
    const door = homeDoorFor(npc, nav);
    if (wantsSleep && bed && door) {
      return {
        ...npc,
        position: { ...bed.bed.position },
        location: 'SLEEPING' as NPCWorldLocation,
        indoors: true,
        moving: false,
        activity: 'Sleeping',
        path: undefined,
        homeId: bed.home.id,
        bedId: bed.bed.id,
        buildingId: bed.home.id,
      };
    }
    if (resolved.indoors && door) {
      return {
        ...npc,
        position: { ...door.interior },
        location: 'INTERIOR' as NPCWorldLocation,
        indoors: true,
        moving: false,
        activity: resolved.activity,
        path: undefined,
        buildingId: bed?.home.id ?? npc.buildingId,
      };
    }
    if (door) {
      const home = nav.housing.homes.find((h) => h.doorwayId === door.id);
      // Personal space (BUILD 323): cottage-mates would otherwise stack on the
      // exact door point. Jitter deterministically, then validate so the spot
      // stays walkable (never inside the building).
      const o = personalOffset(npc.seed, clock.day, 2009);
      const snapped = validateDestination(
        { x: door.exterior.x + o.x * 0.5, y: door.exterior.y + o.y * 0.5 },
        nav.obstacles,
      ).point;
      return {
        ...npc,
        position: snapped,
        location: 'OUTDOOR' as NPCWorldLocation,
        indoors: false,
        moving: false,
        activity: resolved.activity,
        path: undefined,
        homeId: home?.id,
        bedId: bed?.bed.id,
        buildingId: undefined,
      };
    }
    // No home assigned: place at the schedule target (fallback, no teleport
    // loop — this only runs once at construction).
    return {
      ...npc,
      position: { ...resolved.target },
      location: 'OUTDOOR' as NPCWorldLocation,
      indoors: false,
      moving: false,
      activity: resolved.activity,
      path: undefined,
    };
  });
}

/**
 * Place townsfolk at their assigned beds for new-game initialization (BUILD 673).
 * Unlike snapTownsfolk (which snaps to schedule positions), this places ALL
 * eligible NPCs inside their homes at their beds, regardless of the current
 * schedule. The schedule takes over on the first simulation tick.
 *
 * NPCs without a valid bed assignment are placed at their schedule target
 * (fallback, same as snapTownsfolk).
 */
export function placeTownsfolkAtHome(
  folk: Townsperson[],
  anchors: TownsfolkAnchors,
  clock: WorldClockState,
  nav: TownsfolkNavContext,
): Townsperson[] {
  return folk.map((npc) => {
    const bed = bedFor(nav.housing, npc.id);
    const door = homeDoorFor(npc, nav);
    if (bed && door) {
      // Place at bed, indoors, sleeping (schedule will wake them).
      return {
        ...npc,
        position: { ...bed.bed.position },
        location: 'INTERIOR' as NPCWorldLocation,
        indoors: true,
        moving: false,
        activity: 'Sleeping',
        path: undefined,
        homeId: bed.home.id,
        bedId: bed.bed.id,
        buildingId: undefined,
      };
    }
    // No bed: fall back to schedule position.
    const resolved = townsfolkTarget(npc, anchors, clock);
    return {
      ...npc,
      position: { ...resolved.target },
      location: 'OUTDOOR' as NPCWorldLocation,
      indoors: false,
      moving: false,
      activity: resolved.activity,
      path: undefined,
    };
  });
}
