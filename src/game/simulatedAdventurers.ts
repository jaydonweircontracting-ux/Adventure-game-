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
  outing?: 'wander' | 'hunt' | 'tavern' | 'guild' | 'travel';
  /** Ticks remaining in the current outing phase. */
  outingTicks?: number;
};

type Point = { x: number; y: number };
type GoatTarget = { id: number; position: Point };

// A new "player" logs in every minute (sim ticks every 1.9s), up to 10.
export const ADVENTURER_SPAWN_INTERVAL_TICKS = 32;
export const MAX_ADVENTURERS = 10;

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
export const initialSimulatedAdventurers: SimulatedAdventurer[] = [{ ...ADVENTURER_ROSTER[0] }];

/** Log in the next roster member if one is due (called each tick). */
export function spawnDueAdventurer(adventurers: SimulatedAdventurer[], tick: number): SimulatedAdventurer[] {
  if (adventurers.length >= MAX_ADVENTURERS) return adventurers;
  if (tick % ADVENTURER_SPAWN_INTERVAL_TICKS !== 0) return adventurers;
  const next = ADVENTURER_ROSTER.find((member) => !adventurers.some((a) => a.id === member.id));
  if (!next) return adventurers;
  return [...adventurers, { ...next, activity: 'just logged in' }];
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
const TAVERN_APPROACH: Point = { x: 84, y: 78 };
const GUILD_APPROACH: Point = { x: 86, y: 62 };

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
      x: clamp(position.x + (horizontal ? Math.sign(dx) * amount : 0), 12, 88),
      y: clamp(position.y + (!horizontal ? Math.sign(dy) * amount : 0), 32, 84),
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

/** At level 10 a Beginner visits the teachers and picks a class. */
function maybeChooseClass(adventurer: SimulatedAdventurer): SimulatedAdventurer {
  if (adventurer.className !== 'Beginner' || adventurer.level < 10) return adventurer;
  const chosen = CLASS_CHOICES[Math.floor(Math.random() * CLASS_CHOICES.length)];
  return {
    ...adventurer,
    className: chosen,
    goal: chosen === 'Mage' ? 'mastering the arcane arts' : chosen === 'Warrior' ? 'becoming a champion of the crossing' : 'striking from the shadows',
    activity: `chose the path of the ${chosen}!`,
  };
}

function advanceFromHouse(adventurer: SimulatedAdventurer): SimulatedAdventurer {
  const path = houseRoutes[adventurer.id] || [];
  const current = adventurer.interiorPosition || { x: 50, y: 48 };
  const target = path[adventurer.routeIndex] || path[path.length - 1];
  if (!target) return { ...adventurer, location: 'field' as const, moving: false };
  const moved = moveToward(current, target, 5);
  if (moved.distance < 1.25) {
    const nextIndex = adventurer.routeIndex + 1;
    if (nextIndex >= path.length) {
      const fieldStart = routes[adventurer.id]?.[0] || adventurer.position;
      return { ...adventurer, location: 'field' as const, position: fieldStart, interiorPosition: target, routeIndex: 0, facing: 'down', moving: false, activity: 'stepping out to explore Mosslight Crossing', outing: 'wander' as const, outingTicks: 40 + Math.floor(Math.random() * 30) };
    }
    return { ...adventurer, interiorPosition: target, routeIndex: nextIndex, facing: (target.x >= current.x ? 'right' : 'left') as 'right' | 'left', moving: false, activity: 'heading for the front door' };
  }
  const facing: 'up' | 'down' | 'left' | 'right' = Math.abs(target.x - current.x) >= Math.abs(target.y - current.y)
    ? (target.x >= current.x ? 'right' : 'left')
    : (target.y >= current.y ? 'down' : 'up');
  return { ...adventurer, interiorPosition: moved.position, facing, moving: true, activity: 'heading for the front door' };
}

function pickOuting(adventurer: SimulatedAdventurer): SimulatedAdventurer {
  const roll = Math.random();
  if (roll < 0.30) return { ...adventurer, outing: 'wander', outingTicks: 40 + Math.floor(Math.random() * 40), activity: 'wandering the crossing' };
  if (roll < 0.58) return { ...adventurer, outing: 'hunt', outingTicks: 60 + Math.floor(Math.random() * 60), activity: 'looking for goats to hunt' };
  if (roll < 0.72) return { ...adventurer, outing: 'tavern', outingTicks: 120, activity: 'heading to the Rusty Tankard' };
  if (roll < 0.86) return { ...adventurer, outing: 'guild', outingTicks: 120, activity: 'heading to the Wayfarer Guild' };
  return { ...adventurer, outing: 'travel', outingTicks: 200, activity: 'setting off for neighboring lands' };
}

function advanceWander(adventurer: SimulatedAdventurer, tick: number): SimulatedAdventurer {
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  if (ticksLeft <= 0) return pickOuting(adventurer);
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
  if (ticksLeft <= 0) return pickOuting(adventurer);
  const goat = nearestGoat(adventurer.position, goatTargets);
  if (!goat) return advanceWander({ ...adventurer, outing: 'wander', outingTicks: ticksLeft }, tick);
  const hunt = moveToward(adventurer.position, goat.position, 4.5);
  const facing = facingToward(adventurer.position, goat.position);
  if (hunt.distance <= 5) {
    // Virtual kill: the adventurer gains xp/horns, but the player's loaded
    // goats are NEVER touched (BUG-006).
    if (Math.random() < 0.02) {
      const xp = (adventurer.xp || 0) + 1;
      const horns = (adventurer.horns || 0) + 1;
      const level = 1 + Math.floor(xp / 3);
      const leveled = level > adventurer.level;
      const injured = Math.random() < 0.02;
      return maybeChooseClass({
        ...adventurer,
        xp, horns, level,
        status: injured ? 'injured' as const : adventurer.status,
        position: hunt.position, facing, moving: true, outingTicks: ticksLeft,
        activity: injured ? 'injured fighting a goat' : leveled ? `leveled up to ${level}!` : 'took down a goat',
      });
    }
    const injured = Math.random() < 0.02;
    return { ...adventurer, status: injured ? 'injured' as const : adventurer.status, position: hunt.position, facing, moving: true, outingTicks: ticksLeft, activity: injured ? 'injured fighting a goat' : 'fighting a goat' };
  }
  return { ...adventurer, position: hunt.position, facing, moving: true, outingTicks: ticksLeft, activity: 'tracking a goat' };
}

function advanceTavern(adventurer: SimulatedAdventurer, tick: number): SimulatedAdventurer {
  if ((adventurer.location || 'field') !== 'tavern') {
    const moved = moveToward(adventurer.position, TAVERN_APPROACH, 3.2);
    if (moved.distance < 4 || (adventurer.outingTicks ?? 1) <= 1) {
      const spot = TAVERN_SPOTS[hashId(adventurer.id) % TAVERN_SPOTS.length];
      return { ...adventurer, location: 'tavern' as const, interiorPosition: { ...spot }, position: moved.position, moving: false, facing: 'up', outingTicks: 25 + Math.floor(Math.random() * 25), activity: 'grabbed a stool at the Rusty Tankard' };
    }
    return { ...adventurer, position: moved.position, facing: facingToward(adventurer.position, TAVERN_APPROACH), moving: true, outingTicks: (adventurer.outingTicks ?? 1) - 1, activity: 'heading to the Rusty Tankard' };
  }
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  if (ticksLeft <= 0) {
    return { ...adventurer, location: 'field' as const, position: { ...TAVERN_APPROACH }, moving: false, activity: 'leaving the Rusty Tankard', outing: undefined, outingTicks: 0 };
  }
  const flavor = tick % 40 === 0 && Math.random() < 0.5
    ? TAVERN_ACTIVITIES[Math.floor(Math.random() * TAVERN_ACTIVITIES.length)]
    : adventurer.activity;
  return { ...adventurer, outingTicks: ticksLeft, moving: false, activity: flavor };
}

function advanceGuild(adventurer: SimulatedAdventurer, tick: number): SimulatedAdventurer {
  if ((adventurer.location || 'field') !== 'guild') {
    const moved = moveToward(adventurer.position, GUILD_APPROACH, 3.2);
    if (moved.distance < 4 || (adventurer.outingTicks ?? 1) <= 1) {
      const spot = GUILD_SPOTS[hashId(adventurer.id) % GUILD_SPOTS.length];
      return { ...adventurer, location: 'guild' as const, interiorPosition: { ...spot }, position: moved.position, moving: false, facing: 'up', outingTicks: 25 + Math.floor(Math.random() * 25), activity: 'stepped into the Wayfarer Guild' };
    }
    return { ...adventurer, position: moved.position, facing: facingToward(adventurer.position, GUILD_APPROACH), moving: true, outingTicks: (adventurer.outingTicks ?? 1) - 1, activity: 'heading to the Wayfarer Guild' };
  }
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  if (ticksLeft <= 0) {
    return { ...adventurer, location: 'field' as const, position: { ...GUILD_APPROACH }, moving: false, activity: 'leaving the Wayfarer Guild', outing: undefined, outingTicks: 0 };
  }
  // Forge a goat-horn dagger while visiting Bram (2 horns -> 1 dagger, like the player recipe).
  const horns = adventurer.horns || 0;
  if (horns >= 2 && Math.random() < 0.08) {
    return {
      ...adventurer,
      horns: horns - 2,
      daggersCrafted: (adventurer.daggersCrafted || 0) + 1,
      outingTicks: ticksLeft, moving: false,
      activity: 'forged a goat-horn dagger with Bram!',
    };
  }
  const flavor = tick % 40 === 0 && Math.random() < 0.5
    ? GUILD_ACTIVITIES[Math.floor(Math.random() * GUILD_ACTIVITIES.length)]
    : adventurer.activity;
  return { ...adventurer, outingTicks: ticksLeft, moving: false, activity: flavor };
}

function advanceTravel(adventurer: SimulatedAdventurer): SimulatedAdventurer {
  if ((adventurer.location || 'field') !== 'traveling') {
    const edgeX = adventurer.position.x < 50 ? 12 : 88;
    const moved = moveToward(adventurer.position, { x: edgeX, y: adventurer.position.y }, 3.4);
    if (moved.distance < 2.5 || (adventurer.outingTicks ?? 1) <= 1) {
      const direction = edgeX <= 50 ? 'western' : 'eastern';
      return { ...adventurer, location: 'traveling' as const, position: moved.position, moving: false, outingTicks: 30 + Math.floor(Math.random() * 60), activity: `exploring the ${direction} wilds` };
    }
    return { ...adventurer, position: moved.position, facing: facingToward(adventurer.position, { x: edgeX, y: adventurer.position.y }), moving: true, outingTicks: (adventurer.outingTicks ?? 1) - 1, activity: 'setting off for neighboring lands' };
  }
  const ticksLeft = (adventurer.outingTicks ?? 1) - 1;
  if (ticksLeft <= 0) {
    const edgeX = Math.random() < 0.5 ? 12 : 88;
    const direction = edgeX <= 50 ? 'western' : 'eastern';
    return {
      ...adventurer,
      location: 'field' as const,
      position: { x: edgeX, y: 45 + Math.random() * 25 },
      moving: false, facing: edgeX <= 50 ? 'right' as const : 'left' as const,
      activity: `returned from the ${direction} wilds`,
      outing: undefined, outingTicks: 0,
    };
  }
  return { ...adventurer, outingTicks: ticksLeft, moving: false };
}

export function advanceSimulatedAdventurers(adventurers: SimulatedAdventurer[], tick: number, goatTargets: GoatTarget[] = []): SimulatedAdventurer[] {
  return adventurers.map((adventurer) => {
    if ((adventurer.location || 'field') === 'starting-house') return advanceFromHouse(adventurer);
    // Occasionally change goals (every ~100 ticks)
    let goal = adventurer.goal;
    let status: 'healthy' | 'injured' | 'resting' = adventurer.status || 'healthy';
    if (tick % 100 === 0 && Math.random() < 0.3) {
      goal = dynamicGoals[Math.floor(Math.random() * dynamicGoals.length)];
    }
    // Injured adventurers rest and recover
    if (status === 'injured') {
      if (Math.random() < 0.05) {
        status = 'healthy';
        return maybeChooseClass({ ...adventurer, goal, status, activity: 'recovered and ready to go' });
      }
      return { ...adventurer, goal, status, activity: 'resting from injuries', moving: false };
    }
    const withGoal = maybeChooseClass({ ...adventurer, goal, status });
    const outing = withGoal.outing || 'wander';
    if ((withGoal.location || 'field') === 'tavern' || outing === 'tavern') return advanceTavern(withGoal, tick);
    if ((withGoal.location || 'field') === 'guild' || outing === 'guild') return advanceGuild(withGoal, tick);
    if ((withGoal.location || 'field') === 'traveling' || outing === 'travel') return advanceTravel(withGoal);
    if (outing === 'hunt') return advanceHunt(withGoal, tick, goatTargets);
    return advanceWander(withGoal, tick);
  });
}
