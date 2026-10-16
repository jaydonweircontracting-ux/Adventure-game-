import assert from 'node:assert/strict';
import { npcNeeds, villageTarget } from '../src/game/villageLife';
import type { Townsperson, TownsfolkAnchors } from '../src/game/townsfolk';
import type { WorldClockState } from '../src/game/worldCore';

const npc = {
  id: 'test-farmer',
  name: 'Test Farmer',
  seed: 137,
  archetype: 'farmer',
  role: 'farmer',
  homeKey: 'home',
  home: { x: 2, y: 3 },
  position: { x: 2, y: 3 },
  facing: 'down',
  moving: false,
  activity: 'Tending crops',
  indoors: false,
  location: 'town',
} as unknown as Townsperson;

const clock = (hour: number, day = 2) => ({
  day,
  hour,
  minuteOfDay: hour * 60,
} as WorldClockState);

const anchors = {
  points: { home: { x: 2, y: 3 }, tavern: { x: 8, y: 8 } },
  plaza: { x: 5, y: 5 },
  stalls: [],
  gardens: [],
  patrol: [],
  arterials: [],
} as unknown as TownsfolkAnchors;

// Well-stocked stores preserve the existing meal schedule.
const supplied = npcNeeds(npc, clock(12), true);
// Empty stores mean breakfast and lunch are missed; hunger is substantially worse.
const shortage = npcNeeds(npc, clock(12), false);
assert.ok(shortage.hunger < supplied.hunger, `expected shortage hunger ${shortage.hunger} < supplied ${supplied.hunger}`);
assert.equal(shortage.hunger, 0);

// A hungry NPC still uses the existing navigation target, but communicates
// that food is being sought rather than falsely claiming to eat.
const hungryTarget = villageTarget(npc, anchors, clock(12), false);
assert.equal(hungryTarget.activity, 'Looking for food');
assert.deepEqual(hungryTarget.target, anchors.points.tavern);

// Default arguments retain backwards-compatible behavior for existing callers.
assert.deepEqual(npcNeeds(npc, clock(12)), supplied);

console.log('Village food-needs tests passed (supply-aware hunger and behavior).');
