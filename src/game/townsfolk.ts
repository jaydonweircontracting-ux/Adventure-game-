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
  /** Bounded event memories (max 12, pruned by importance). */
  memories?: NPCMemory[];
  // --- Flee state (BUILD 436): set when the player attacks the NPC. ---
  /** World tick until which the NPC flees (undefined = not fleeing). */
  fleeUntilTick?: number;
  /** Position of the threat to run away from. */
  fleeFrom?: TownsfolkPoint;
  // --- Health (BUILD 441): NPCs can be damaged and killed. ---
  /** Current HP (undefined = full). */
  hp?: number;
  /** World tick until which the NPC is dead (undefined = alive). Respawns after. */
  deadUntilTick?: number;
};

/** Named world anchors townsfolk schedules resolve against. */
export type TownsfolkAnchors = {
  points: Record<string, TownsfolkPoint>;
  plaza: TownsfolkPoint;
  stalls: TownsfolkPoint[];
  gardens: TownsfolkPoint[];
  patrol: TownsfolkPoint[];
};

/** Deterministic 0..1 from two ints. The NPC "personality" RNG. */
export function townsfolkHash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265461)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export type TownsfolkTarget = { activity: string; target: TownsfolkPoint; indoors: boolean };

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
      if (mins >= workEnd && mins < workEnd + 90) return { activity: 'Evening at the Tankard', target: anchors.points.tavern ?? anchors.plaza, indoors: false };
      return { activity: 'At the guild', target: homeSpot, indoors: false };
    }
    case 'child': {
      if (atNight || mins < wake) return { activity: 'Sleeping', target: home, indoors: true };
      if (mins >= lunchStart && mins < lunchEnd + 30) return { activity: 'Lunch at home', target: homeSpot, indoors: false };
      if (mins >= 1080) return { activity: 'At home', target: homeSpot, indoors: true };
      return { activity: 'Playing', target: plazaSpot, indoors: false };
    }
    case 'commoner':
    default: {
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (atLunch) return { activity: 'Having lunch', target: plazaSpot, indoors: false };
      const outAndAbout = (mins >= 540 && mins < 720) || (mins >= 840 && mins < workEnd);
      if (outAndAbout) return { activity: 'About town', target: plazaSpot, indoors: false };
      return { activity: 'At home', target: homeSpot, indoors: true };
    }
  }
}

type TownsfolkDef = [name: string, gender: 'male' | 'female', archetype: TownsfolkArchetype, role: TownsfolkRole, homeKey: string];

const ROSTER: TownsfolkDef[] = [
  ['Aldric', 'male', 'farmer', 'guide', 'farm0'],
  ['Brenna', 'female', 'farmer', 'guide', 'farm1'],
  ['Cedric', 'male', 'merchant', 'mage', 'tavern'],
  ['Father Aldous', 'male', 'priest', 'mage', 'chapel'],
  ['Rowan', 'female', 'guard', 'warrior', 'guild'],
  ['Kess', 'female', 'guard', 'warrior', 'guild'],
  ['Tom', 'male', 'smith', 'warrior', 'guild'],
  ['Mabel', 'female', 'commoner', 'mage', 'chapel'],
  ['Dunstan', 'male', 'commoner', 'guide', 'tavern'],
  ['Elsa', 'female', 'commoner', 'mage', 'guild'],
  ['Wren', 'female', 'child', 'guide', 'chapel'],
  ['Pip', 'male', 'child', 'rogue', 'tavern'],
];

/** Build DoorwayLinks for the 6 Mosslight cottages (pure, no App dependency). */
export function cottageDoorways(): DoorwayLink[] {
  const rects = [
    { left: 14, top: 62, right: 20, bottom: 66.5 },
    { left: 14, top: 74, right: 20, bottom: 78.5 },
    { left: 14, top: 86, right: 20, bottom: 90.5 },
    { left: 62, top: 22, right: 68, bottom: 26.5 },
    { left: 76, top: 22, right: 82, bottom: 26.5 },
    { left: 90, top: 22, right: 96, bottom: 26.5 },
  ];
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
  const main = [
    { left: 41.2, top: 53.2, right: 48.2, bottom: 58.0 },
    { left: 94.3, top: 54.3, right: 101.3, bottom: 59.1 },
    { left: 40.3, top: 85.1, right: 47.3, bottom: 89.9 },
    { left: 88.1, top: 85.5, right: 95.1, bottom: 90.3 },
  ];
  const cottages = cottageDoorways().map((d) => d.buildingRect!);
  return [...main, ...cottages];
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
 * Build the housing registry for Mosslight's 6 cottages and assign beds to
 * the given NPC ids. Deterministic — same ids always get the same beds.
 */
export function buildMosslightHousing(npcIds: string[]): HousingRegistry {
  const doors = cottageDoorways();
  const registry = buildHousingRegistry(
    doors.map((d, i) => ({
      buildingId: `cottage-${i + 1}`,
      doorwayId: d.id,
      rect: d.buildingRect!,
    })),
  );
  return assignBeds(registry, npcIds);
}

/** Build the persistent roster. Homes resolve through anchor keys. */
export function createTownsfolk(anchors: TownsfolkAnchors, worldSeed: number): Townsperson[] {
  return ROSTER.map(([name, gender, archetype, role, homeKey], index) => {
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

/** Current HP (defaults to full). */
export function npcHp(npc: Townsperson): number {
  return npc.hp ?? npcMaxHp(npc);
}

/** Ticks a dead NPC stays dead before respawning (~2 minutes at 60 ticks/sec). */
export const NPC_RESPAWN_TICKS = 7200;

/**
 * Apply damage to an NPC (BUILD 441). Returns the updated NPC.
 * If HP reaches 0, the NPC dies (deadUntilTick set, flee cleared).
 * Survivors start fleeing from the attacker.
 */
export function damageNpc(npc: Townsperson, damage: number, from: TownsfolkPoint, tick: number): Townsperson {
  const newHp = npcHp(npc) - damage;
  if (newHp <= 0) {
    return {
      ...npc,
      hp: 0,
      deadUntilTick: tick + NPC_RESPAWN_TICKS,
      fleeUntilTick: undefined,
      fleeFrom: undefined,
    };
  }
  return {
    ...startNpcFlee(npc, from, tick),
    hp: newHp,
  };
}

/** Whether the NPC is currently dead. */
export function isNpcDead(npc: Townsperson, tick: number): boolean {
  return npc.deadUntilTick !== undefined && tick < npc.deadUntilTick;
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
): Townsperson {
  // --- DEAD (BUILD 441): skip entirely until respawn. ---
  if (npc.deadUntilTick !== undefined) {
    if (clock.tick < npc.deadUntilTick) return npc;
    // Respawn: back home, full HP, clear death.
    return { ...npc, hp: undefined, deadUntilTick: undefined, position: { ...npc.home }, activity: 'At home' };
  }

  // --- FLEEING (BUILD 436): run away from the attacker, skip schedule. ---
  // Only outdoors — indoor NPCs cower in place (don't path through walls).
  // BUILD 443: slowed to 0.5x walk (was 1.5x) so the player can catch them.
  if (!npc.indoors && npc.fleeUntilTick !== undefined && npc.fleeFrom) {
    if (clock.tick < npc.fleeUntilTick) {
      const dx = npc.position.x - npc.fleeFrom.x;
      const dy = npc.position.y - npc.fleeFrom.y;
      const dist = Math.hypot(dx, dy) || 1;
      const fleeStep = step * 0.5;
      const nx = dx / dist, ny = dy / dist;
      const facing: TownsfolkFacing = Math.abs(nx) >= Math.abs(ny)
        ? (nx >= 0 ? 'right' : 'left')
        : (ny >= 0 ? 'down' : 'up');
      return {
        ...npc,
        position: { x: npc.position.x + nx * fleeStep, y: npc.position.y + ny * fleeStep },
        facing,
        moving: true,
        activity: 'Fleeing!',
      };
    }
    // Flee expired: clear the state and resume schedule.
    npc = { ...npc, fleeUntilTick: undefined, fleeFrom: undefined };
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
    const needNewPath =
      npc.location !== 'ENTERING' || shouldReplanPath(npc.path, door.exterior);
    if (needNewPath) {
      const path = pathToDoor(npc.position, door, nav.obstacles, nav.roadPiece, nav.chunk);
      if (!path) {
        // Door unreachable: wait (don't teleport, don't wander).
        return npc.activity === want.activity && !npc.moving ? npc : { ...npc, moving: false, activity: want.activity, path: undefined };
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
    return !npc.moving && npc.activity === want.activity && !npc.indoors && npc.location === 'OUTDOOR'
      ? npc
      : { ...npc, moving: false, activity: want.activity, indoors: false, location: 'OUTDOOR', path: undefined };
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
      return npc.activity === want.activity && !npc.moving ? npc : { ...npc, moving: false, activity: want.activity, path: undefined };
    }
    path = newPath;
  }
  const res = stepAlongPath(path!, npc.position, step);
  if (res.arrived) {
    return { ...npc, position: res.position, path: undefined, moving: false, activity: want.activity, indoors: false, location: 'OUTDOOR', facing: res.facing };
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
): Townsperson[] {
  return separateCrowd(folk.map((npc) => advanceOne(npc, anchors, clock, nav, step, resolveTarget)));
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
