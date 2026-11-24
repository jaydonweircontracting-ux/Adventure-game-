import assert from 'node:assert/strict';
import {
  WorldCore,
  MINUTES_PER_TICK,
  type WorldCoreState,
} from '../src/game/worldCore';

// Deterministic seed: equal seeds produce equal sequences.
const rngA = new WorldCore(123456);
const rngB = new WorldCore(123456);
assert.deepEqual(
  Array.from({ length: 8 }, () => rngA.random()),
  Array.from({ length: 8 }, () => rngB.random()),
  'seeded random sequences must be reproducible',
);

// Clock progression and boundary events.
const core = new WorldCore(77);
const events: string[] = [];
core.subscribe('hour_changed', (event) => events.push(event.type));
core.subscribe('day_changed', (event) => events.push(event.type));
core.advance(6);
assert.equal(core.getClock().hour, 7);
assert.equal(core.getClock().minuteOfDay, 420);
assert.equal(MINUTES_PER_TICK, 10);
assert.deepEqual(events, ['hour_changed']);

const beforeMidnight = new WorldCore(77);
const midnightEvents: string[] = [];
beforeMidnight.subscribe('day_changed', () => midnightEvents.push('day_changed'));
beforeMidnight.advance(107); // 06:00 -> 23:50
assert.equal(beforeMidnight.getClock().day, 1);
beforeMidnight.advance(1);
assert.equal(beforeMidnight.getClock().day, 2);
assert.equal(beforeMidnight.getClock().hour, 0);
assert.deepEqual(midnightEvents, ['day_changed'], 'midnight emits one day-boundary event');
assert.deepEqual(events, ['hour_changed'], 'unrelated instances do not share listeners');

// Queued events are ordered and only drain when due.
const queue = new WorldCore(88);
queue.queueEvent('later', { value: 2 }, 2);
queue.queueEvent('now', { value: 1 }, 0);
assert.deepEqual(queue.drainDueEvents().map((event) => event.type), ['now']);
queue.advance(2);
assert.deepEqual(queue.drainDueEvents().map((event) => event.type), ['later']);

// Full state round-trip includes clock, pending events, RNG and speed.
const original = new WorldCore(99);
original.setSimulationSpeed(2);
original.advance(3);
original.queueEvent('checkpoint', { note: 'saved' }, 8);
original.random();
const saved = original.getState();
const restored = new WorldCore(99);
restored.loadState(saved);
assert.deepEqual(restored.getState(), saved, 'save/load must preserve the complete core state');
assert.equal(restored.random(), original.random(), 'RNG continuation must survive save/load');

// Schema-v1 saves remain loadable and receive current defaults.
const legacy = {
  ...saved,
  schemaVersion: 1,
  simulationSpeed: undefined,
  eventSequence: undefined,
} as unknown as WorldCoreState;
const migrated = new WorldCore(99);
migrated.loadState(legacy);
assert.equal(migrated.getState().schemaVersion, 2);
assert.equal(migrated.getSimulationSpeed(), 1);
assert.equal(migrated.getClock().tick, saved.clock.tick);

assert.throws(
  () => new WorldCore(100).loadState(saved),
  /incompatible save state/,
  'a save from another world seed must be rejected',
);

console.log('WorldCore tests passed (seeded RNG, clock boundaries, events, save/load, schema-v1 migration).');
