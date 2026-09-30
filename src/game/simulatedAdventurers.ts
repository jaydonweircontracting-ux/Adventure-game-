export type SimulatedAdventurer = {
  id: string;
  name: string;
  className: 'Beginner' | 'Ranger' | 'Mage' | 'Rogue' | 'Warrior';
  level: number;
  goal: string;
  activity: string;
  position: { x: number; y: number };
  interiorPosition?: { x: number; y: number };
  location?: 'starting-house' | 'field' | 'tavern' | 'guild' | 'traveling';
  facing: 'up' | 'down' | 'left' | 'right';
  routeIndex: number;
  moving?: boolean;
  status?: 'healthy' | 'injured' | 'resting';
  reputation?: number;
  /** Virtual goat kills (never touches the player's loaded goats — BUG-006). */
  xp?: number;
  /** Virtual goat horns carried, for dagger crafting. */
  horns?: number;
  daggersCrafted?: number;
  /** What the adventurer is currently out doing. */
  outing?: 'wander' | 'hunt' | 'tavern' | 'guild' | 'travel' | 'exodus';
  /** Ticks remaining in the current outing phase. */
  outingTicks?: number;
  /** Sim tick when this adventurer spawned (for the exodus deadline). */
  spawnTick?: number;
  /** Authoritative world-clock minutes (day * 1440 + minuteOfDay) when the
   * adventurer stepped out of the starting house and began the exodus. */
  exodusStartClockMinutes?: number;
  /** March speed (field units per living-sim tick) calibrated at exodus start
   * so the walk to the assigned boundary finishes within 1 in-game hour. */
  exodusSpeed?: number;
  /** Assigned chunk-boundary exit for the exodus (varied per adventurer). */
  exodusTarget?: { x: number; y: number };
  /** Deterministic motivation for leaving (shown in activity). */
  exodusMotive?: string;
};

type Point = { x: number; y: number };
type GoatTarget = { id: number; position: Point };

// A new "player" logs in every minute (sim ticks every 1.9s), up to 10.
export const ADVENTURER_SPAWN_INTERVAL_TICKS = 32;
export const MAX_ADVENTURERS = 10;

// Field dimensions (must match FIELD_SIZE in App.tsx).
const FIELD_SIZE = 280;
const FIELD_MIN = 4;
const FIELD_MAX = FIELD_SIZE - 4;

// Starting house (tutorial house) geometry — must match fieldHouseRects() in
// App.tsx for the starting area: rect { left: 41.2, top: 53.2, right: 48.2,
// bottom: 58.0 }, door via newHouseDoorPosition(), exterior via
// doorwayExteriorPosition().
const STARTING_HOUSE_DOOR_EXTERIOR: Point = { x: 44.7, y: 58.7 };

// Chunk boundaries (field units). Leaving the starting area means reaching one.
const BOUNDARY_WEST = 2;
const BOUNDARY_EAST = FIELD_SIZE - 2;
const BOUNDARY_NORTH = 2;
const BOUNDARY_SOUTH = FIELD_SIZE - 2;

// Exodus deadline: ticks after spawn by which the adventurer must have left
// the starting area. 1 in-game hour = 6 world ticks (10 min each); the
// adventurer sim ticks faster, so 200 ticks is a generous upper bound that
// still enforces prompt departure (the walk itself takes ~40 ticks).
export const EXODUS_DEADLINE_TICKS = 200;

/**
 * Authoritative exodus deadline: 1 in-game hour (60 world-clock minutes)
 * after the adventurer steps out of the starting house. The world clock
 * advances 10 minutes every 3 real seconds, so 1 game-hour = 18 real seconds
 * = ~9.5 living-sim ticks (1.9s each). The march speed is calibrated per
 * adventurer so the physical walk to their assigned boundary completes inside
 * the hour — no teleporting, whatever the route length.
 */
export const EXODUS_DEADLINE_MINUTES = 60;
export const EXODUS_LIVING_TICKS_PER_HOUR = 9.5;
/**
 * Target living-sim ticks for the exodus march — comfortably inside 1
 * game-hour (~9.5 ticks), so physical arrival always beats the deadline
 * backstop regardless of clock/tick phase alignment.
 */
export const EXODUS_MARCH_TICKS = 8;
const EXODUS_MIN_SPEED = 3.4;
const EXODUS_MAX_SPEED = 18;

/** World-clock minutes for a (day, minuteOfDay) pair — the authoritative clock. */
export function worldClockMinutes(day: number, minuteOfDay: number): number {
  return day * 1440 + minuteOfDay;
}

/**
 * March speed so the walk from `from` to `target` finishes within 1 game-hour.
 * Calibrated on Manhattan distance because the sim's moveToward walks
 * axis-by-axis (staircase), not diagonally — Euclidean calibration
 * underestimates the true path by up to ~40%.
 */
export function exodusMarchSpeed(from: Point, target: Point): number {
  const dist = Math.abs(target.x - from.x) + Math.abs(target.y - from.y);
  const speed = dist / EXODUS_MARCH_TICKS;
  return Math.min(EXODUS_MAX_SPEED, Math.max(EXODUS_MIN_SPEED, speed));
}

const routes: Record<string, Point[]> = {
  kael: [{ x: 43, y: 48 }, { x: 47, y: 42 }, { x: 55, y: 42 }, { x: 60, y: 49 }, { x: 55, y: 56 }, { x: 45, y: 56 }],
  sera: [{ x: 38, y: 61 }, { x: 44, y: 65 }, { x: 54, y: 65 }, { x: 62, y: 59 }, { x: 62, y: 51 }, { x: 52, y: 50 }],
  orin: [{ x: 71, y: 49 }, { x: 76, y: 43 }, { x: 82, y: 45 }, { x: 82, y: 57 }, { x: 73, y: 62 }, { x: 67, y: 57 }],
  bram: [{ x: 58, y: 78 }, { x: 68, y: 72 }, { x: 76, y: 78 }, { x: 82, y: 68 }, { x: 72, y: 61 }, { x: 61, y: 67 }],
  wren: [{ x: 40, y: 55 }, { x: 48, y: 60 }, { x: 58, y: 58 }, { x: 64, y: 64 }, { x: 52, y: 70 }, { x: 42, y: 66 }],
  tovin: [{ x: 66, y: 40 }, { x: 74, y: 46 }, { x: 78, y: 54 }, { x: 70, y: 60 }, { x: 62, y: 54 }, { x: 64, y: 44 }],
  dain: [{ x: 50, y: 70 }, { x: 58, y: 74 }, { x: 68, y: 74 }, { x: 76, y: 68 }, { x: 66, y: 64 }, { x: 56, y: 66 }],
  kelsa: [{ x: 36, y: 44 }, { x: 44, y: 40 }, { x: 54, y: 44 }, { x: 58, y: 52 }, { x: 48, y: 54 }, { x: 40, y: 50 }],
  soren: [{ x: 62, y: 66 }, { x: 70, y: 70 }, { x: 78, y: 64 }, { x: 80, y: 54 }, { x: 72, y: 50 }, { x: 64, y: 56 }],
  liora: [{ x: 46, y: 38 }, { x: 56, y: 36 }, { x: 66, y: 40 }, { x: 68, y: 50 }, { x: 58, y: 52 }, { x: 48, y: 46 }],
};

const houseRoutes: Record<string, Point[]> = {
  // Final waypoint sits just above the door (y=83): moveToward clamps interior
  // y to 84, so a y=89 waypoint could never be reached and NPCs piled up forever.
  kael: [{ x: 36, y: 46 }, { x: 42, y: 60 }, { x: 50, y: 76 }, { x: 50, y: 83 }],
  sera: [{ x: 64, y: 46 }, { x: 58, y: 60 }, { x: 50, y: 76 }, { x: 50, y: 83 }],
  orin: [{ x: 38, y: 62 }, { x: 44, y: 72 }, { x: 50, y: 82 }, { x: 50, y: 83 }],
  bram: [{ x: 62, y: 62 }, { x: 56, y: 72 }, { x: 50, y: 82 }, { x: 50, y: 83 }],
  wren: [{ x: 40, y: 48 }, { x: 44, y: 62 }, { x: 50, y: 76 }, { x: 50, y: 83 }],
  tovin: [{ x: 60, y: 48 }, { x: 56, y: 62 }, { x: 50, y: 76 }, { x: 50, y: 83 }],
  dain: [{ x: 44, y: 52 }, { x: 46, y: 64 }, { x: 50, y: 76 }, { x: 50, y: 83 }],
  kelsa: [{ x: 56, y: 52 }, { x: 54, y: 64 }, { x: 50, y: 76 }, { x: 50, y: 83 }],
  soren: [{ x: 42, y: 58 }, { x: 46, y: 68 }, { x: 50, y: 78 }, { x: 50, y: 83 }],
  liora: [{ x: 58, y: 58 }, { x: 54, y: 68 }, { x: 50, y: 78 }, { x: 50, y: 83 }],
};

// Exodus motivations — deterministic per adventurer, varied routes.
const EXODUS_MOTIVES = [
  'seeking the eastern trade roads',
  'heard rumors of western ruins',
  'tracking game into the northern wilds',
  'following the river south',
  'chasing bounties on the frontier',
  'looking for work in the next town',
  'mapping uncharted territory',
  'fleeing debts in Mosslight',
  'searching for a lost sibling',
  'drawn by tales of dungeon gold',
];

// The full "login" roster, in join order. Everyone starts as a Beginner at the
// starting house and lives a little adventuring life from there.
const ADVENTURER_ROSTER: SimulatedAdventurer[] = [
  { id: 'kael', name: 'Kael Thorn', className: 'Beginner', level: 1, goal: 'scouting the old quarry', activity: 'just logged in', position: { x: 43, y: 48 }, interiorPosition: { x: 36, y: 46 }, location: 'starting-house', facing: 'right', routeIndex: 0, status: 'healthy', reputation: 0 },
  { id: 'sera', name: 'Sera Flint', className: 'Beginner', level: 1, goal: 'gathering ember-reeds to sell', activity: 'just logged in', position: { x: 38, y: 61 }, interiorPosition: { x: 64, y: 46 }, location: 'starting-house', facing: 'left', routeIndex: 0, status: 'healthy', reputation: 0 },
  { id: 'orin', name: 'Orin Vale', className: 'Beginner', level: 1, goal: 'finding a better dagger', activity: 'just logged in', position: { x: 71, y: 49 }, interiorPosition: { x: 38, y: 62 }, location: 'starting-house', facing: 'right', routeIndex: 0, status: 'healthy', reputation: 0 },
  { id: 'bram', name: 'Bram Oak', className: 'Beginner', level: 1, goal: 'clearing the eastern pasture', activity: 'just logged in', position: { x: 58, y: 78 }, interiorPosition: { x: 62, y: 62 }, location: 'starting-house', facing: 'left', routeIndex: 0, status: 'healthy', reputation: 0 },
  { id: 'wren', name: 'Wren Hallow', className: 'Beginner', level: 1, goal: 'mapping the northern ruins', activity: 'just logged in', position: { x: 40, y: 55 }, interiorPosition: { x: 40, y: 48 }, location: 'starting-house', facing: 'right', routeIndex: 0, status: 'healthy', reputation: 0 },
  { id: 'tovin', name: 'Tovin Marsh', className: 'Beginner', level: 1, goal: 'hunting wolves in the forest', activity: 'just logged in', position: { x: 66, y: 40 }, interiorPosition: { x: 60, y: 48 }, location: 'starting-house', facing: 'left', routeIndex: 0, status: 'healthy', reputation: 0 },
  { id: 'dain', name: 'Dain Cole', className: 'Beginner', level: 1, goal: 'trading with the merchants', activity: 'just logged in', position: { x: 50, y: 70 }, interiorPosition: { x: 44, y: 52 }, location: 'starting-house', facing: 'right', routeIndex: 0, status: 'healthy', reputation: 0 },
  { id: 'kelsa', name: 'Kelsa Bryn', className: 'Beginner', level: 1, goal: 'exploring the cave system', activity: 'just logged in', position: { x: 36, y: 44 }, interiorPosition: { x: 56, y: 52 }, location: 'starting-house', facing: 'left', routeIndex: 0, status: 'healthy', reputation: 0 },
  { id: 'soren', name: 'Soren Ash', className: 'Beginner', level: 1, goal: 'helping farmers with pests', activity: 'just logged in', position: { x: 62, y: 66 }, interiorPosition: { x: 42, y: 58 }, location: 'starting-house', facing: 'right', routeIndex: 0, status: 'healthy', reputation: 0 },
  { id: 'liora', name: 'Liora Fen', className: 'Beginner', level: 1, goal: 'searching for ancient artifacts', activity: 'just logged in', position: { x: 46, y: 38 }, interiorPosition: { x: 58, y: 58 }, location: 'starting-house', facing: 'left', routeIndex: 0, status: 'healthy', reputation: 0 },
];

// First player is already logged in; the rest join one per minute.
export const initialSimulatedAdventurers: SimulatedAdventurer[] = [
  { ...ADVENTURER_ROSTER[0], ...assignExodus(ADVENTURER_ROSTER[0]), spawnTick: 0 },
];

/** Log in the next roster member if one is due (called each tick). */
export function spawnDueAdventurer(adventurers: SimulatedAdventurer[], tick: number): SimulatedAdventurer[] {
  if (adventurers.length >= MAX_ADVENTURERS) return adventurers;
  if (tick % ADVENTURER_SPAWN_INTERVAL_TICKS !== 0) return adventurers;
  const next = ADVENTURER_ROSTER.find((member) => !adventurers.some((a) => a.id === member.id));
  if (!next) return adventurers;
  return [...adventurers, { ...next, ...assignExodus(next), activity: 'just logged in', spawnTick: tick }];
}

// Dynamic goals that adventurers cycle through
const dynamicGoals = [
  'scouting the old quarry',
  'gathering ember-reeds to sell',
  'finding a better dagger',
  'clearing the eastern pasture',
  'mapping the northern ruins',
  'hunting wolves in the forest',
  'trading with the merchants',
  'exploring the cave system',
  'helping farmers with pests',
  'searching for ancient artifacts',
];

// Where fake players stand inside the tavern / guild (interior % coords).
const TAVERN_SPOTS: Point[] = [{ x: 28, y: 66 }, { x: 72, y: 68 }, { x: 50, y: 58 }, { x: 36, y: 44 }, { x: 64, y: 44 }];
const GUILD_SPOTS: Point[] = [{ x: 42, y: 58 }, { x: 58, y: 52 }, { x: 70, y: 58 }];
// Field approach points near the tavern / guild doors (within the 12..88 / 32..84 walk bounds).
// Real door exteriors (must match buildingDoorwaysFor() in App.tsx):
// - Rusty Tankard: rect {88.1,85.5,95.1,90.3} -> door (91.6,88.98) -> exterior (91.6,91.0)
// - Wayfarer Guild: rect {94.3,54.3,101.3,59.1} -> door (97.8,57.78) -> exterior (97.8,59.8)
const TAVERN_APPROACH: Point = { x: 91.6, y: 91.0 };
const GUILD_APPROACH: Point = { x: 97.8, y: 59.8 };

const TAVERN_ACTIVITIES = [
  'sharing a round with Noah',
  'listening to Mira\u2019s rumors',
  'arm-wrestling Damon',
  'hiding from Shawn',
  'sipping ale by the fire',
];
const GUILD_ACTIVITIES = [
  'browsing Bram\u2019s wares',
  'asking about dagger recipes',
  'warming up by the forge',
  'comparing blades with the smith',
];

const CLASS_CHOICES: Array<'Mage' | 'Warrior' | 'Rogue'> = ['Mage', 'Warrior', 'Rogue'];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function moveToward(position: Point, target: Point, step: number) {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1.25) return { position: target, distance };
  const amount = Math.min(step, distance);
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  return {
    position: {
      x: clamp(position.x + (horizontal ? Math.sign(dx) * amount : 0), FIELD_MIN, FIELD_MAX),
      y: clamp(position.y + (!horizontal ? Math.sign(dy) * amount : 0), FIELD_MIN, FIELD_MAX),
    },
    distance,
  };
}

function facingToward(from: Point, to: Point): 'up' | 'down' | 'left' | 'right' {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
    ? (to.x >= from.x ? 'right' : 'left')
    : (to.y >= from.y ? 'down' : 'up');
}

function hashId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash;
}

/** Deterministic RNG (mulberry32) — no Math.random() in the sim. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


/**
 * Assign a deterministic chunk-boundary exit target and motivation.
 * Each adventurer gets a different edge/direction for varied routes.
 */
function assignExodus(adventurer: SimulatedAdventurer): Pick<SimulatedAdventurer, 'exodusTarget' | 'exodusMotive'> {
  const h = hashId(adventurer.id);
  const edge = h % 4;
  // Vary the position along the edge deterministically.
  const along = 20 + (h % 100);
  let exodusTarget: { x: number; y: number };
  if (edge === 0) exodusTarget = { x: BOUNDARY_EAST, y: along };
  else if (edge === 1) exodusTarget = { x: BOUNDARY_WEST, y: along };
  else if (edge === 2) exodusTarget = { x: along, y: BOUNDARY_NORTH };
  else exodusTarget = { x: along, y: BOUNDARY_SOUTH };
  const exodusMotive = EXODUS_MOTIVES[h % EXODUS_MOTIVES.length];
  return { exodusTarget, exodusMotive };
}

/** At level 10 a Beginner visits the teachers and picks a class. */
function maybeChooseClass(adventurer: SimulatedAdventurer, tick: number): SimulatedAdventurer {
  if (adventurer.className !== 'Beginner' || adventurer.level < 10) return adventurer;
  const rng = seededRandom(hashId(adventurer.id) * 7 + tick);
  const chosen = CLASS_CHOICES[Math.floor(rng() * CLASS_CHOICES.length)];
  return {
    ...adventurer,
    className: chosen,
    goal: chosen === 'Mage' ? 'mastering the arcane arts' : chosen === 'Warrior' ? 'becoming a champion of the crossing' : 'striking from the shadows',
    activity: `chose the path of the ${chosen}!`,
  };
}

function advanceFromHouse(adventurer: SimulatedAdventurer, tick: number, clockMinutes?: number): SimulatedAdventurer {
  const path = houseRoutes[adventurer.id] || [];
  const current = adventurer.interiorPosition || { x: 50, y: 48 };
  const target = path[adventurer.routeIndex] || path[path.length - 1];
  if (!target) return { ...adventurer, location: 'field' as const, moving: false };
  const moved = moveToward(current, target, 5);
  if (moved.distance < 1.25) {
    const nextIndex = adventurer.routeIndex + 1;
    if (nextIndex >= path.length) {
      // Physical door exit: step out at the REAL starting-house door exterior
      // (not a hardcoded field point). Interior and field are different
      // coordinate spaces — this is a door transition, not a teleport.
      const assigned = adventurer.exodusTarget ? undefined : assignExodus(adventurer);
      // `assigned` is defined exactly when adventurer.exodusTarget is not; the
      // fallback is unreachable but satisfies the type checker.
      const exodusTarget = adventurer.exodusTarget ?? assigned?.exodusTarget ?? { x: BOUNDARY_EAST, y: 70 };
      return {
        ...adventurer,
        ...assigned,
        location: 'field' as const,
        position: { ...STARTING_HOUSE_DOOR_EXTERIOR },
        interiorPosition: target,
        routeIndex: 0,
        facing: 'down',
        moving: true,
        activity: `stepping out to explore Mosslight Crossing`,
        outing: 'exodus' as const,
        outingTicks: EXODUS_DEADLINE_TICKS,
        spawnTick: adventurer.spawnTick ?? tick,
        // Authoritative deadline: the world clock starts now, and the march
        // speed is calibrated so the physical walk beats the 1-hour mark.
        exodusStartClockMinutes: clockMinutes ?? adventurer.exodusStartClockMinutes,
        exodusSpeed: exodusMarchSpeed(STARTING_HOUSE_DOOR_EXTERIOR, exodusTarget),
      };
    }
    return { ...adventurer, interiorPosition: target, routeIndex: nextIndex, facing: (target.x >= current.x ? 'right' : 'left') as 'right' | 'left', moving: false, activity: 'heading for the front door' };
  }
  const facing: 'up' | 'down' | 'left' | 'right' = Math.abs(target.x - current.x) >= Math.abs(target.y - current.y)
    ? (target.x >= current.x ? 'right' : 'left')
    : (target.y >= current.y ? 'down' : 'up');
  return { ...adventurer, interiorPosition: moved.position, facing, moving: true, activity: 'heading for the front door' };
}

/**
 * Exodus: the adventurer's first outing — walk from the starting-house door
 * to their assigned chunk boundary and leave the starting area. This is
 * mandatory; normal outings (wander/hunt/tavern/guild) only begin after the
 * exodus completes. Enforces the 1-in-game-hour departure on the
 * AUTHORITATIVE world clock (tick-based fallback when no clock is passed).
 */
function advanceExodus(adventurer: SimulatedAdventurer, tick: number, clockMinutes?: number): SimulatedAdventurer {
  const target = adventurer.exodusTarget;
  if (!target) {
    // No target assigned (shouldn't happen) — assign and keep walking.
    return { ...advanceExodus({ ...adventurer, ...assignExodus(adventurer) }, tick, clockMinutes) };
  }
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  const spawnTick = adventurer.spawnTick ?? tick;
  // March speed calibrated at exodus start so the walk beats the 1-hour
  // deadline; recompute from the current position for older saves that lack
  // it (never slower than the legacy 3.4).
  const speed = adventurer.exodusSpeed
    ?? Math.max(3.4, exodusMarchSpeed(adventurer.position, target));
  // Authoritative deadline: 60 world-clock minutes after stepping out.
  // Falls back to the legacy tick count when no clock is available (tests).
  const startClock = adventurer.exodusStartClockMinutes;
  const overdue = clockMinutes !== undefined && startClock !== undefined
    ? clockMinutes - startClock >= EXODUS_DEADLINE_MINUTES
    : tick - spawnTick > EXODUS_DEADLINE_TICKS;
  const moved = moveToward(adventurer.position, target, speed);
  const arrived = moved.distance < 2.5;
  if (arrived || ticksLeft <= 0 || overdue) {
    // Left the starting area. The overdue backstop only fires when the walk
    // couldn't physically finish in time (far-sim 1/8 ticking while the
    // player is in another chunk, or a clock jump) — the adventurer left
    // while out of view, a legitimate simulation event.
    const dir = target.x >= BOUNDARY_EAST ? 'eastern' : target.x <= BOUNDARY_WEST ? 'western' : target.y <= BOUNDARY_NORTH ? 'northern' : 'southern';
    return {
      ...adventurer,
      location: 'traveling' as const,
      position: moved.position,
      moving: false,
      outing: 'travel' as const,
      outingTicks: 30 + (hashId(adventurer.id) % 60),
      activity: `${adventurer.exodusMotive || 'exploring'} — left for the ${dir} wilds`,
    };
  }
  return {
    ...adventurer,
    position: moved.position,
    facing: facingToward(adventurer.position, target),
    moving: true,
    outingTicks: ticksLeft,
    activity: adventurer.exodusMotive ? `leaving Mosslight: ${adventurer.exodusMotive}` : 'leaving Mosslight Crossing',
  };
}

function pickOuting(adventurer: SimulatedAdventurer, tick: number): SimulatedAdventurer {
  // Deterministic per adventurer + tick (no Math.random in the sim).
  const rng = seededRandom(hashId(adventurer.id) * 31 + tick);
  const roll = rng();
  if (roll < 0.30) return { ...adventurer, outing: 'wander', outingTicks: 40 + Math.floor(rng() * 40), activity: 'wandering the crossing' };
  if (roll < 0.58) return { ...adventurer, outing: 'hunt', outingTicks: 60 + Math.floor(rng() * 60), activity: 'looking for goats to hunt' };
  if (roll < 0.72) return { ...adventurer, outing: 'tavern', outingTicks: 120, activity: 'heading to the Rusty Tankard' };
  if (roll < 0.86) return { ...adventurer, outing: 'guild', outingTicks: 120, activity: 'heading to the Wayfarer Guild' };
  return { ...adventurer, outing: 'travel', outingTicks: 200, activity: 'setting off for neighboring lands' };
}

function advanceWander(adventurer: SimulatedAdventurer, tick: number): SimulatedAdventurer {
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  if (ticksLeft <= 0) return pickOuting(adventurer, tick);
  const route = routes[adventurer.id] || [];
  if (!route.length) return { ...adventurer, outingTicks: ticksLeft };
  const target = route[adventurer.routeIndex % route.length];
  const moved = moveToward(adventurer.position, target, 1.1);
  if (moved.distance < 1.25) {
    const nextIndex = (adventurer.routeIndex + 1) % route.length;
    const activities = ['checking the town noticeboard', 'sharing a road rumor', 'preparing to leave again'];
    return { ...adventurer, routeIndex: nextIndex, moving: false, outingTicks: ticksLeft, activity: activities[(tick + adventurer.routeIndex) % activities.length] };
  }
  return { ...adventurer, position: moved.position, facing: facingToward(adventurer.position, target), moving: true, outingTicks: ticksLeft };
}

function nearestGoat(position: Point, goatTargets: GoatTarget[]) {
  const alive = goatTargets.filter((target) => Number.isFinite(target.position.x) && Number.isFinite(target.position.y));
  return alive.sort((left, right) => Math.hypot(left.position.x - position.x, left.position.y - position.y) - Math.hypot(right.position.x - position.x, right.position.y - position.y))[0];
}

function advanceHunt(adventurer: SimulatedAdventurer, tick: number, goatTargets: GoatTarget[]): SimulatedAdventurer {
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  if (ticksLeft <= 0) return pickOuting(adventurer, tick);
  const goat = nearestGoat(adventurer.position, goatTargets);
  if (!goat) return advanceWander({ ...adventurer, outing: 'wander', outingTicks: ticksLeft }, tick);
  const hunt = moveToward(adventurer.position, goat.position, 4.5);
  const facing = facingToward(adventurer.position, goat.position);
  const rng = seededRandom(hashId(adventurer.id) * 43 + tick);
  if (hunt.distance <= 5) {
    // Virtual kill: the adventurer gains xp/horns, but the player's loaded
    // goats are NEVER touched (BUG-006).
    if (rng() < 0.02) {
      const xp = (adventurer.xp || 0) + 1;
      const horns = (adventurer.horns || 0) + 1;
      const level = 1 + Math.floor(xp / 3);
      const leveled = level > adventurer.level;
      const injured = rng() < 0.02;
      return maybeChooseClass({
        ...adventurer,
        xp, horns, level,
        status: injured ? 'injured' as const : adventurer.status,
        position: hunt.position, facing, moving: true, outingTicks: ticksLeft,
        activity: injured ? 'injured fighting a goat' : leveled ? `leveled up to ${level}!` : 'took down a goat',
      }, tick);
    }
    const injured = rng() < 0.02;
    return { ...adventurer, status: injured ? 'injured' as const : adventurer.status, position: hunt.position, facing, moving: true, outingTicks: ticksLeft, activity: injured ? 'injured fighting a goat' : 'fighting a goat' };
  }
  return { ...adventurer, position: hunt.position, facing, moving: true, outingTicks: ticksLeft, activity: 'tracking a goat' };
}

function advanceTavern(adventurer: SimulatedAdventurer, tick: number): SimulatedAdventurer {
  if ((adventurer.location || 'field') !== 'tavern') {
    const moved = moveToward(adventurer.position, TAVERN_APPROACH, 3.2);
    if (moved.distance < 4 || (adventurer.outingTicks ?? 1) <= 1) {
      const spot = TAVERN_SPOTS[hashId(adventurer.id) % TAVERN_SPOTS.length];
      return { ...adventurer, location: 'tavern' as const, interiorPosition: { ...spot }, position: moved.position, moving: false, facing: 'up', outingTicks: 25 + (hashId(adventurer.id) % 25), activity: 'grabbed a stool at the Rusty Tankard' };
    }
    return { ...adventurer, position: moved.position, facing: facingToward(adventurer.position, TAVERN_APPROACH), moving: true, outingTicks: (adventurer.outingTicks ?? 1) - 1, activity: 'heading to the Rusty Tankard' };
  }
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  if (ticksLeft <= 0) {
    return { ...adventurer, location: 'field' as const, position: { ...TAVERN_APPROACH }, moving: false, activity: 'leaving the Rusty Tankard', outing: undefined, outingTicks: 0 };
  }
  const tavRng = seededRandom(hashId(adventurer.id) * 53 + tick);
  const flavor = tick % 40 === 0 && tavRng() < 0.5
    ? TAVERN_ACTIVITIES[Math.floor(tavRng() * TAVERN_ACTIVITIES.length)]
    : adventurer.activity;
  return { ...adventurer, outingTicks: ticksLeft, moving: false, activity: flavor };
}

function advanceGuild(adventurer: SimulatedAdventurer, tick: number): SimulatedAdventurer {
  if ((adventurer.location || 'field') !== 'guild') {
    const moved = moveToward(adventurer.position, GUILD_APPROACH, 3.2);
    if (moved.distance < 4 || (adventurer.outingTicks ?? 1) <= 1) {
      const spot = GUILD_SPOTS[hashId(adventurer.id) % GUILD_SPOTS.length];
      return { ...adventurer, location: 'guild' as const, interiorPosition: { ...spot }, position: moved.position, moving: false, facing: 'up', outingTicks: 25 + (hashId(adventurer.id) % 25), activity: 'stepped into the Wayfarer Guild' };
    }
    return { ...adventurer, position: moved.position, facing: facingToward(adventurer.position, GUILD_APPROACH), moving: true, outingTicks: (adventurer.outingTicks ?? 1) - 1, activity: 'heading to the Wayfarer Guild' };
  }
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  if (ticksLeft <= 0) {
    return { ...adventurer, location: 'field' as const, position: { ...GUILD_APPROACH }, moving: false, activity: 'leaving the Wayfarer Guild', outing: undefined, outingTicks: 0 };
  }
  // Forge a goat-horn dagger while visiting Bram (2 horns -> 1 dagger, like the player recipe).
  const horns = adventurer.horns || 0;
  if (horns >= 2 && seededRandom(hashId(adventurer.id) * 61 + tick)() < 0.08) {
    return {
      ...adventurer,
      horns: horns - 2,
      daggersCrafted: (adventurer.daggersCrafted || 0) + 1,
      outingTicks: ticksLeft, moving: false,
      activity: 'forged a goat-horn dagger with Bram!',
    };
  }
  const guildRng = seededRandom(hashId(adventurer.id) * 67 + tick);
  const flavor = tick % 40 === 0 && guildRng() < 0.5
    ? GUILD_ACTIVITIES[Math.floor(guildRng() * GUILD_ACTIVITIES.length)]
    : adventurer.activity;
  return { ...adventurer, outingTicks: ticksLeft, moving: false, activity: flavor };
}

function advanceTravel(adventurer: SimulatedAdventurer, tick: number): SimulatedAdventurer {
  if ((adventurer.location || 'field') !== 'traveling') {
    const edgeX = adventurer.position.x < FIELD_SIZE / 2 ? BOUNDARY_WEST : BOUNDARY_EAST;
    const moved = moveToward(adventurer.position, { x: edgeX, y: adventurer.position.y }, 3.4);
    if (moved.distance < 2.5 || (adventurer.outingTicks ?? 1) <= 1) {
      const direction = edgeX <= FIELD_SIZE / 2 ? 'western' : 'eastern';
      return { ...adventurer, location: 'traveling' as const, position: moved.position, moving: false, outingTicks: 30 + (hashId(adventurer.id) % 60), activity: `exploring the ${direction} wilds` };
    }
    return { ...adventurer, position: moved.position, facing: facingToward(adventurer.position, { x: edgeX, y: adventurer.position.y }), moving: true, outingTicks: (adventurer.outingTicks ?? 1) - 1, activity: 'setting off for neighboring lands' };
  }
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  if (ticksLeft <= 0) {
    const rng = seededRandom(hashId(adventurer.id) * 131 + tick);
    const edgeX = rng() < 0.5 ? BOUNDARY_WEST : BOUNDARY_EAST;
    const direction = edgeX <= FIELD_SIZE / 2 ? 'western' : 'eastern';
    return {
      ...adventurer,
      location: 'field' as const,
      position: { x: edgeX, y: 20 + rng() * 100 },
      moving: false, facing: edgeX <= FIELD_SIZE / 2 ? 'right' as const : 'left' as const,
      activity: `returned from the ${direction} wilds`,
      outing: undefined, outingTicks: 0,
    };
  }
  return { ...adventurer, outingTicks: ticksLeft, moving: false };
}

export function advanceSimulatedAdventurers(
  adventurers: SimulatedAdventurer[],
  tick: number,
  goatTargets: GoatTarget[] = [],
  /** Authoritative world-clock minutes (day * 1440 + minuteOfDay). When
   * provided, the exodus deadline is enforced on the world clock. */
  clockMinutes?: number,
): SimulatedAdventurer[] {
  return adventurers.map((adventurer) => {
    if ((adventurer.location || 'field') === 'starting-house') return advanceFromHouse(adventurer, tick, clockMinutes);
    // Exodus is mandatory: no other outings until the adventurer has left the
    // starting area once.
    if (adventurer.outing === 'exodus') return advanceExodus(adventurer, tick, clockMinutes);
    // Occasionally change goals (every ~100 ticks) — deterministic.
    let goal = adventurer.goal;
    let status: 'healthy' | 'injured' | 'resting' = adventurer.status || 'healthy';
    const goalRng = seededRandom(hashId(adventurer.id) * 17 + tick);
    if (tick % 100 === 0 && goalRng() < 0.3) {
      goal = dynamicGoals[Math.floor(goalRng() * dynamicGoals.length)];
    }
    // Injured adventurers rest and recover
    if (status === 'injured') {
      if (goalRng() < 0.05) {
        status = 'healthy';
        return maybeChooseClass({ ...adventurer, goal, status, activity: 'recovered and ready to go' }, tick);
      }
      return { ...adventurer, goal, status, activity: 'resting from injuries', moving: false };
    }
    const withGoal = maybeChooseClass({ ...adventurer, goal, status }, tick);
    const outing = withGoal.outing || 'wander';
    if ((withGoal.location || 'field') === 'tavern' || outing === 'tavern') return advanceTavern(withGoal, tick);
    if ((withGoal.location || 'field') === 'guild' || outing === 'guild') return advanceGuild(withGoal, tick);
    if ((withGoal.location || 'field') === 'traveling' || outing === 'travel') return advanceTravel(withGoal, tick);
    if (outing === 'hunt') return advanceHunt(withGoal, tick, goatTargets);
    return advanceWander(withGoal, tick);
  });
}
