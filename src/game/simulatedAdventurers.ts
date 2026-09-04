export type SimulatedAdventurer = {
  id: string;
  name: string;
  className: 'Ranger' | 'Mage' | 'Rogue';
  level: number;
  goal: string;
  activity: string;
  position: { x: number; y: number };
  facing: 'up' | 'down' | 'left' | 'right';
  routeIndex: number;
};

type Point = { x: number; y: number };

const routes: Record<string, Point[]> = {
  kael: [{ x: 43, y: 48 }, { x: 47, y: 42 }, { x: 55, y: 42 }, { x: 60, y: 49 }, { x: 55, y: 56 }, { x: 45, y: 56 }],
  sera: [{ x: 38, y: 61 }, { x: 44, y: 65 }, { x: 54, y: 65 }, { x: 62, y: 59 }, { x: 62, y: 51 }, { x: 52, y: 50 }],
  orin: [{ x: 71, y: 49 }, { x: 76, y: 43 }, { x: 82, y: 45 }, { x: 82, y: 57 }, { x: 73, y: 62 }, { x: 67, y: 57 }],
};

export const initialSimulatedAdventurers: SimulatedAdventurer[] = [
  { id: 'kael', name: 'Kael Thorn', className: 'Ranger', level: 4, goal: 'scouting the old quarry', activity: 'following the north road', position: { x: 43, y: 48 }, facing: 'right', routeIndex: 0 },
  { id: 'sera', name: 'Sera Flint', className: 'Mage', level: 3, goal: 'selling gathered ember-reeds', activity: 'walking back from Brackenfen', position: { x: 38, y: 61 }, facing: 'right', routeIndex: 0 },
  { id: 'orin', name: 'Orin Vale', className: 'Rogue', level: 5, goal: 'finding a better dagger', activity: 'watching the guild road', position: { x: 71, y: 49 }, facing: 'up', routeIndex: 0 },
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function advanceSimulatedAdventurers(adventurers: SimulatedAdventurer[], tick: number) {
  return adventurers.map((adventurer) => {
    const route = routes[adventurer.id] || [];
    if (!route.length) return adventurer;
    const target = route[adventurer.routeIndex % route.length];
    const dx = target.x - adventurer.position.x;
    const dy = target.y - adventurer.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1.25) {
      const nextIndex = (adventurer.routeIndex + 1) % route.length;
      const activities = ['checking the town noticeboard', 'sharing a road rumor', 'preparing to leave again'];
      return { ...adventurer, routeIndex: nextIndex, activity: activities[(tick + adventurer.routeIndex) % activities.length] };
    }
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const step = Math.min(1.1, distance);
    const position = {
      x: clamp(adventurer.position.x + (horizontal ? Math.sign(dx) * step : 0), 15, 87),
      y: clamp(adventurer.position.y + (!horizontal ? Math.sign(dy) * step : 0), 34, 78),
    };
    const facing = horizontal ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
    return { ...adventurer, position, facing };
  });
}
