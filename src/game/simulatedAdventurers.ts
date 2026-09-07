export type SimulatedAdventurer = {
  id: string;
  name: string;
  className: 'Ranger' | 'Mage' | 'Rogue' | 'Warrior';
  level: number;
  goal: string;
  activity: string;
  position: { x: number; y: number };
  interiorPosition?: { x: number; y: number };
  location?: 'starting-house' | 'field';
  facing: 'up' | 'down' | 'left' | 'right';
  routeIndex: number;
};

type Point = { x: number; y: number };
type GoatTarget = { id: number; position: Point };

const routes: Record<string, Point[]> = {
  kael: [{ x: 43, y: 48 }, { x: 47, y: 42 }, { x: 55, y: 42 }, { x: 60, y: 49 }, { x: 55, y: 56 }, { x: 45, y: 56 }],
  sera: [{ x: 38, y: 61 }, { x: 44, y: 65 }, { x: 54, y: 65 }, { x: 62, y: 59 }, { x: 62, y: 51 }, { x: 52, y: 50 }],
  orin: [{ x: 71, y: 49 }, { x: 76, y: 43 }, { x: 82, y: 45 }, { x: 82, y: 57 }, { x: 73, y: 62 }, { x: 67, y: 57 }],
  bram: [{ x: 58, y: 78 }, { x: 68, y: 72 }, { x: 76, y: 78 }, { x: 82, y: 68 }, { x: 72, y: 61 }, { x: 61, y: 67 }],
};

const houseRoutes: Record<string, Point[]> = {
  kael: [{ x: 36, y: 46 }, { x: 42, y: 60 }, { x: 50, y: 76 }, { x: 50, y: 89 }],
  sera: [{ x: 64, y: 46 }, { x: 58, y: 60 }, { x: 50, y: 76 }, { x: 50, y: 89 }],
  orin: [{ x: 38, y: 62 }, { x: 44, y: 72 }, { x: 50, y: 82 }, { x: 50, y: 89 }],
  bram: [{ x: 62, y: 62 }, { x: 56, y: 72 }, { x: 50, y: 82 }, { x: 50, y: 89 }],
};

export const initialSimulatedAdventurers: SimulatedAdventurer[] = [
  { id: 'kael', name: 'Kael Thorn', className: 'Ranger', level: 4, goal: 'scouting the old quarry', activity: 'waiting by the starting hearth', position: { x: 43, y: 48 }, interiorPosition: { x: 36, y: 46 }, location: 'starting-house', facing: 'right', routeIndex: 0 },
  { id: 'sera', name: 'Sera Flint', className: 'Mage', level: 3, goal: 'selling gathered ember-reeds', activity: 'waiting by the starting hearth', position: { x: 38, y: 61 }, interiorPosition: { x: 64, y: 46 }, location: 'starting-house', facing: 'left', routeIndex: 0 },
  { id: 'orin', name: 'Orin Vale', className: 'Rogue', level: 5, goal: 'finding a better dagger', activity: 'waiting by the starting hearth', position: { x: 71, y: 49 }, interiorPosition: { x: 38, y: 62 }, location: 'starting-house', facing: 'right', routeIndex: 0 },
  { id: 'bram', name: 'Bram Oak', className: 'Warrior', level: 2, goal: 'clearing the eastern pasture', activity: 'waiting by the starting hearth', position: { x: 58, y: 78 }, interiorPosition: { x: 62, y: 62 }, location: 'starting-house', facing: 'left', routeIndex: 0 },
];

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

function advanceFromHouse(adventurer: SimulatedAdventurer) {
  const path = houseRoutes[adventurer.id] || [];
  const current = adventurer.interiorPosition || { x: 50, y: 48 };
  const target = path[adventurer.routeIndex] || path[path.length - 1];
  if (!target) return { ...adventurer, location: 'field' as const };
  const moved = moveToward(current, target, 5);
  if (moved.distance < 1.25) {
    const nextIndex = adventurer.routeIndex + 1;
    if (nextIndex >= path.length) {
      const fieldStart = routes[adventurer.id]?.[0] || adventurer.position;
      return { ...adventurer, location: 'field' as const, position: fieldStart, interiorPosition: target, routeIndex: 0, facing: 'down', activity: 'stepping out to explore Mosslight Crossing' };
    }
    return { ...adventurer, interiorPosition: target, routeIndex: nextIndex, facing: target.x >= current.x ? 'right' : 'left', activity: 'heading for the front door' };
  }
  const facing = Math.abs(target.x - current.x) >= Math.abs(target.y - current.y)
    ? (target.x >= current.x ? 'right' : 'left')
    : (target.y >= current.y ? 'down' : 'up');
  return { ...adventurer, interiorPosition: moved.position, facing, activity: 'heading for the front door' };
}

export function advanceSimulatedAdventurers(adventurers: SimulatedAdventurer[], tick: number, goatTargets: GoatTarget[] = []) {
  return adventurers.map((adventurer) => {
    if ((adventurer.location || 'field') === 'starting-house') return advanceFromHouse(adventurer);
    const aliveTargets = goatTargets.filter((target) => Number.isFinite(target.position.x) && Number.isFinite(target.position.y));
    const nearestGoat = aliveTargets.sort((left, right) => Math.hypot(left.position.x - adventurer.position.x, left.position.y - adventurer.position.y) - Math.hypot(right.position.x - adventurer.position.x, right.position.y - adventurer.position.y))[0];
    if (nearestGoat) {
      const hunt = moveToward(adventurer.position, nearestGoat.position, 4.5);
      if (hunt.distance <= 5) {
        return { ...adventurer, position: hunt.position, facing: nearestGoat.position.x >= adventurer.position.x ? 'right' : 'left', activity: 'fighting a goat' };
      }
      return { ...adventurer, position: hunt.position, facing: Math.abs(nearestGoat.position.x - adventurer.position.x) >= Math.abs(nearestGoat.position.y - adventurer.position.y) ? (nearestGoat.position.x >= adventurer.position.x ? 'right' : 'left') : (nearestGoat.position.y >= adventurer.position.y ? 'down' : 'up'), activity: 'tracking a goat' };
    }
    const route = routes[adventurer.id] || [];
    if (!route.length) return adventurer;
    const target = route[adventurer.routeIndex % route.length];
    const moved = moveToward(adventurer.position, target, 1.1);
    if (moved.distance < 1.25) {
      const nextIndex = (adventurer.routeIndex + 1) % route.length;
      const activities = ['checking the town noticeboard', 'sharing a road rumor', 'preparing to leave again'];
      return { ...adventurer, routeIndex: nextIndex, activity: activities[(tick + adventurer.routeIndex) % activities.length] };
    }
    const horizontal = Math.abs(target.x - adventurer.position.x) >= Math.abs(target.y - adventurer.position.y);
    const facing = horizontal ? (target.x >= adventurer.position.x ? 'right' : 'left') : (target.y >= adventurer.position.y ? 'down' : 'up');
    return { ...adventurer, position: moved.position, facing };
  });
}
