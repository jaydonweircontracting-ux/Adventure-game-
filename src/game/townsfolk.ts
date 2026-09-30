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
import type { WorldClockState } from './worldCore';

export type TownsfolkFacing = 'up' | 'down' | 'left' | 'right';
export type TownsfolkArchetype = 'farmer' | 'merchant' | 'guard' | 'priest' | 'smith' | 'commoner' | 'child';
/** Reuses the existing .town-npc.npc-<role> sprite classes. */
export type TownsfolkRole = 'mage' | 'warrior' | 'guide' | 'rogue';
export type TownsfolkPoint = { x: number; y: number };

export type Townsperson = {
  id: string;
  name: string;
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

type TownsfolkDef = [name: string, archetype: TownsfolkArchetype, role: TownsfolkRole, homeKey: string];

const ROSTER: TownsfolkDef[] = [
  ['Aldric', 'farmer', 'guide', 'farm0'],
  ['Brenna', 'farmer', 'guide', 'farm1'],
  ['Cedric', 'merchant', 'mage', 'tavern'],
  ['Father Aldous', 'priest', 'mage', 'chapel'],
  ['Rowan', 'guard', 'warrior', 'guild'],
  ['Kess', 'guard', 'warrior', 'guild'],
  ['Tom', 'smith', 'warrior', 'guild'],
  ['Mabel', 'commoner', 'mage', 'chapel'],
  ['Dunstan', 'commoner', 'guide', 'tavern'],
  ['Elsa', 'commoner', 'mage', 'guild'],
  ['Wren', 'child', 'guide', 'chapel'],
  ['Pip', 'child', 'rogue', 'tavern'],
];

/** Build the persistent roster. Homes resolve through anchor keys. */
export function createTownsfolk(anchors: TownsfolkAnchors, worldSeed: number): Townsperson[] {
  return ROSTER.map(([name, archetype, role, homeKey], index) => {
    const seed = (worldSeed ^ Math.imul(index + 1, 2654435761)) >>> 0;
    const home = anchors.points[homeKey] ?? anchors.plaza;
    return {
      id: 'townsfolk-' + index,
      name,
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
 * Step every NPC toward its schedule target. Runs on the lightweight
 * 120ms movement interval — only for the player's chunk (LOD: the roster
 * only exists while the player is in town).
 */
export function advanceTownsfolk(
  folk: Townsperson[],
  anchors: TownsfolkAnchors,
  clock: WorldClockState,
  step = 0.22,
): Townsperson[] {
  return folk.map((npc) => {
    const resolved = townsfolkTarget(npc, anchors, clock);
    if (resolved.indoors) {
      return npc.indoors && npc.activity === resolved.activity && !npc.moving
        ? npc
        : { ...npc, indoors: true, moving: false, activity: resolved.activity };
    }
    const dx = resolved.target.x - npc.position.x;
    const dy = resolved.target.y - npc.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.7) {
      return !npc.moving && npc.activity === resolved.activity && !npc.indoors
        ? npc
        : { ...npc, moving: false, activity: resolved.activity, indoors: false };
    }
    const s = Math.min(step, dist);
    const facing: TownsfolkFacing = Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? 'right' : 'left')
      : (dy >= 0 ? 'down' : 'up');
    return {
      ...npc,
      position: { x: npc.position.x + (dx / dist) * s, y: npc.position.y + (dy / dist) * s },
      facing,
      moving: true,
      activity: resolved.activity,
      indoors: false,
    };
  });
}

/** Snap everyone to their current schedule target (chunk enter / load). */
export function snapTownsfolk(folk: Townsperson[], anchors: TownsfolkAnchors, clock: WorldClockState): Townsperson[] {
  return folk.map((npc) => {
    const resolved = townsfolkTarget(npc, anchors, clock);
    if (resolved.indoors) return { ...npc, indoors: true, moving: false, activity: resolved.activity };
    return { ...npc, position: { ...resolved.target }, facing: 'down' as TownsfolkFacing, moving: false, activity: resolved.activity, indoors: false };
  });
}
