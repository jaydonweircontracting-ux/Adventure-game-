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
import { pathTo, pathToDoor, stepAlongPath, findPath, trackStep, straightFallbackPath, REPLAN_HYSTERESIS, REPLAN_COOLDOWN_TICKS } from './npcNavigation';
import type { HousingRegistry } from './housing';
import { bedFor, buildHousingRegistry, assignBeds } from './housing';

export type TownsfolkFacing = 'up' | 'down' | 'left' | 'right';
export type TownsfolkArchetype = 'farmer' | 'merchant' | 'guard' | 'priest' | 'smith' | 'commoner' | 'child';
/** Reuses the existing .town-npc.npc-<role> sprite classes. */
export type TownsfolkRole = 'mage' | 'warrior' | 'guide' | 'rogue';
export type TownsfolkPoint = { x: number; y: number };

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
 * Pure schedule resolution: (npc, anchors, clock) -> { activity, target }.
 * No per-frame AI, no stored state — the world clock drives everything, so
 * leaving town and returning hours later shows NPCs where they should be.
 */
export function townsfolkTarget(npc: Townsperson, anchors: TownsfolkAnchors, clock: WorldClockState): TownsfolkTarget {
  const mins = minutesOf(clock);
  const daySalt = Math.floor(clock.day) * 131;
  const jitter = (salt: number, range: number) => Math.floor(townsfolkHash(npc.seed, daySalt + salt) * range);
  const home = anchors.points[npc.homeKey] ?? npc.home;

  const wake = 330 + jitter(1, 61);       // 5:30–6:30
  const sleep = 1260 + jitter(2, 61);    // 21:00–22:00
  const lunchStart = 720 + jitter(3, 31);// 12:00–12:30
  const lunchEnd = lunchStart + 60;
  const workEnd = 1020 + jitter(4, 61);  // 17:00–18:00
  const atNight = mins >= sleep || mins < wake;
  const atLunch = mins >= lunchStart && mins < lunchEnd;
  const garden = anchors.gardens[Math.floor(townsfolkHash(npc.seed, 77)) % anchors.gardens.length] ?? anchors.plaza;
  const stall = anchors.stalls[Math.floor(townsfolkHash(npc.seed, 78)) % anchors.stalls.length] ?? anchors.plaza;

  switch (npc.archetype) {
    case 'guard': {
      // Two 8-hour shifts: half the guards start at 6:00, half at 14:00.
      const shiftStart = 360 + (npc.seed % 2) * 480;
      const shiftEnd = shiftStart + 480;
      const onShift = mins >= shiftStart && mins < shiftEnd;
      if (!onShift) {
        if (atNight || mins < wake) return { activity: 'Off duty', target: home, indoors: true };
        return { activity: 'Off duty', target: anchors.plaza, indoors: false };
      }
      const waypoint = anchors.patrol[Math.floor(mins / 45) % anchors.patrol.length] ?? anchors.plaza;
      return { activity: 'Patrolling', target: waypoint, indoors: false };
    }
    case 'farmer': {
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (mins < wake + 30) return { activity: 'Waking up', target: home, indoors: false };
      if (atLunch) return { activity: 'Having lunch', target: anchors.plaza, indoors: false };
      if (mins < workEnd) return { activity: 'Tending crops', target: garden, indoors: false };
      if (mins < workEnd + 90) return { activity: 'Evening at the Tankard', target: anchors.points.tavern ?? anchors.plaza, indoors: false };
      return { activity: 'At home', target: home, indoors: false };
    }
    case 'merchant': {
      const open = 480 + jitter(5, 31); // 8:00–8:30
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (mins < open) return { activity: 'Opening the stall', target: home, indoors: false };
      if (atLunch) return { activity: 'Having lunch', target: anchors.plaza, indoors: false };
      if (mins < workEnd) return { activity: 'Minding the stall', target: stall, indoors: false };
      if (mins < workEnd + 90) return { activity: 'Evening at the Tankard', target: anchors.points.tavern ?? anchors.plaza, indoors: false };
      return { activity: 'At home', target: home, indoors: false };
    }
    case 'priest': {
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (atLunch) return { activity: 'Having lunch', target: anchors.plaza, indoors: false };
      const chapel = anchors.points.chapel ?? anchors.plaza;
      const atChapel = (mins >= 480 && mins < 720) || (mins >= 840 && mins < workEnd);
      if (atChapel) return { activity: 'Prayers', target: chapel, indoors: false };
      return { activity: 'Tending the parish', target: anchors.plaza, indoors: false };
    }
    case 'smith': {
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (atLunch) return { activity: 'Having lunch', target: anchors.plaza, indoors: false };
      const forge = anchors.points.guild ?? anchors.plaza;
      const atForge = (mins >= 420 && mins < 720) || (mins >= 780 && mins < workEnd);
      if (atForge) return { activity: 'Working the forge', target: forge, indoors: false };
      if (mins >= workEnd && mins < workEnd + 90) return { activity: 'Evening at the Tankard', target: anchors.points.tavern ?? anchors.plaza, indoors: false };
      return { activity: 'At the guild', target: home, indoors: false };
    }
    case 'child': {
      if (atNight || mins < wake) return { activity: 'Sleeping', target: home, indoors: true };
      if (mins >= lunchStart && mins < lunchEnd + 30) return { activity: 'Lunch at home', target: home, indoors: false };
      if (mins >= 1080) return { activity: 'At home', target: home, indoors: false };
      return { activity: 'Playing', target: anchors.plaza, indoors: false };
    }
    case 'commoner':
    default: {
      if (atNight) return { activity: 'Sleeping', target: home, indoors: true };
      if (atLunch) return { activity: 'Having lunch', target: anchors.plaza, indoors: false };
      const outAndAbout = (mins >= 540 && mins < 720) || (mins >= 840 && mins < workEnd);
      if (outAndAbout) return { activity: 'About town', target: anchors.plaza, indoors: false };
      return { activity: 'At home', target: home, indoors: false };
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

/** Navigation context for physical townsfolk movement. */
export type TownsfolkNavContext = {
  housing: HousingRegistry;
  doors: DoorwayLink[];
  obstacles: ObstacleRect[];
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
): Townsperson {
  const want = townsfolkTarget(npc, anchors, clock);
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
    if (!door) return { ...npc, location: 'OUTDOOR' as NPCWorldLocation, indoors: false, activity: want.activity };
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
      // At the interior door. Walk out: position is NOT snapped — the NPC
      // walks from the interior door through the doorway to the exterior as
      // the first leg of the outdoor path.
      const outPath = pathTo(door.exterior, want.target, nav.obstacles);
      const fullWps = [{ ...door.exterior }, ...(outPath?.waypoints ?? [straightFallbackPath(want.target, nav.obstacles).waypoints[0]])];
      return {
        ...npc,
        location: 'OUTDOOR',
        indoors: false,
        buildingId: undefined,
        path: { waypoints: fullWps, index: 0, destination: { ...want.target }, replanCooldown: REPLAN_COOLDOWN_TICKS },
        moving: true,
        facing: res.facing,
        activity: want.activity,
      };
    }
    const tracked = trackStep(npc.path!, npc.position, res, (from) => {
      const wps = findPath(from, door.interior, []);
      return wps ? { waypoints: wps, index: 0, destination: { ...door.interior } } : null;
    });
    return { ...npc, position: tracked.position, path: tracked.path, moving: tracked.moving, facing: tracked.facing, activity: want.activity, indoors: true };
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
      door ? pathToDoor(from, door, nav.obstacles) : null,
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
      const path = pathToDoor(npc.position, door, nav.obstacles);
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
    const newPath = pathTo(npc.position, want.target, nav.obstacles);
    if (!newPath) {
      return npc.activity === want.activity && !npc.moving ? npc : { ...npc, moving: false, activity: want.activity, path: undefined };
    }
    path = newPath;
  }
  const res = stepAlongPath(path!, npc.position, step);
  if (res.arrived) {
    return { ...npc, position: res.position, path: undefined, moving: false, activity: want.activity, indoors: false, location: 'OUTDOOR', facing: res.facing };
  }
  const tracked = trackStep(path!, npc.position, res, (from) => pathTo(from, want.target, nav.obstacles));
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
): Townsperson[] {
  return folk.map((npc) => advanceOne(npc, anchors, clock, nav, step));
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
        buildingId: npc.buildingId,
      };
    }
    if (door) {
      const home = nav.housing.homes.find((h) => h.doorwayId === door.id);
      return {
        ...npc,
        position: { ...door.exterior },
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
