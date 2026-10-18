import assert from 'node:assert/strict';
import { WorldEventBus, type CoreWorldEvents } from '../src/game/dev/worldEventBus';
import { WorldDevHistory } from '../src/game/dev/worldDevHistory';
import { findRepeatedPathFailures, validateWorldSnapshot } from '../src/game/dev/worldHealthMonitor';

const bus = new WorldEventBus<CoreWorldEvents>({
  maxHistory: 2,
  now: () => 123,
  createId: (() => { let n = 0; return () => `test-${++n}`; })(),
});
const received: string[] = [];
const unsubscribe = bus.subscribe('npc.goal-changed', (event) => received.push(event.payload.nextGoal));
bus.publish('npc.goal-changed', { npcId: 'n1', previousGoal: null, nextGoal: 'work' }, { tick: 4 });
bus.publish('npc.goal-changed', { npcId: 'n1', previousGoal: 'work', nextGoal: 'home' }, { tick: 5 });
bus.publish('world.chunk-loaded', { chunkKey: '1,2' }, { tick: 6 });
assert.deepEqual(received, ['work', 'home']);
assert.equal(bus.getHistory().length, 2, 'event history stays bounded');
assert.equal(bus.getHistory({ type: 'npc.goal-changed' }).length, 1, 'type filters history');
assert.equal(bus.getHistory()[1].at, 123, 'injected clock is used');
unsubscribe();
assert.equal(bus.listenerCount(), 0);

let worldValue = 0;
const history = new WorldDevHistory({ limit: 2 });
const command = (before: number, after: number) => ({
  label: `value ${before} -> ${after}`,
  apply: () => { worldValue = after; },
  revert: () => { worldValue = before; },
});
history.execute(command(0, 1));
history.execute(command(1, 2));
assert.equal(worldValue, 2);
assert.equal(history.undo(), true);
assert.equal(worldValue, 1);
assert.equal(history.redo(), true);
assert.equal(worldValue, 2);
history.execute(command(2, 3));
assert.equal(history.getState().canRedo, false, 'new edits invalidate redo history');
assert.equal(history.getState().undoCount, 2, 'history limit is enforced');

const diagnostics = validateWorldSnapshot({
  entities: [
    { id: 'door-1', kind: 'entrance', x: 10, y: 20, destinationId: 'missing-room' },
    { id: 'door-1', kind: 'entrance', x: Number.NaN, y: 20 },
  ],
  knownDestinationIds: new Set(['room-1']),
});
assert.ok(diagnostics.some((item) => item.code === 'duplicate-entity-id'));
assert.ok(diagnostics.some((item) => item.code === 'invalid-coordinates'));
assert.ok(diagnostics.some((item) => item.code === 'missing-destination'));

const stuck = findRepeatedPathFailures([
  { npcId: 'npc-a', destinationKey: 'market', tick: 1, reason: 'blocked' },
  { npcId: 'npc-a', destinationKey: 'market', tick: 2, reason: 'blocked' },
  { npcId: 'npc-a', destinationKey: 'market', tick: 3, reason: 'no-path' },
  { npcId: 'npc-b', destinationKey: 'home', tick: 4, reason: 'blocked' },
]);
assert.equal(stuck.length, 1);
assert.equal(stuck[0].npcId, 'npc-a');
assert.equal(stuck[0].failures, 3);
assert.deepEqual(stuck[0].reasons, ['blocked', 'no-path']);

console.log('World development foundation tests passed.');
