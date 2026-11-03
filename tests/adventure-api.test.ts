import assert from 'node:assert/strict';
import { createAdventureAPI } from '../src/game/api';

const api = createAdventureAPI({ eventHistoryLimit: 8 });
assert.equal(api.version, '1.0.0');

const world = { getSeed: () => 12345 };
const unregister = api.registerSystem({
  id: 'world.core',
  domain: 'world',
  version: '1.0.0',
  description: 'Core world adapter',
}, world);

assert.equal(api.getSystem<typeof world>('world.core'), world);
assert.equal(api.requireSystem<typeof world>('world.core').getSeed(), 12345);
assert.equal(api.hasSystem('world.core'), true);
assert.equal(api.listSystems('world').length, 1);
assert.throws(() => api.registerSystem({
  id: 'world.core',
  domain: 'world',
  version: '1.0.0',
  description: 'Duplicate',
}, {}), /already registered/);

let observed = 0;
const unsubscribe = api.events.subscribe('npc.injured', (event) => {
  observed += event.payload.amount;
});
api.events.publish('npc.injured', { npcId: 'npc-test', amount: 7 }, { tick: 4 });
assert.equal(observed, 7);
assert.equal(api.events.getHistory({ type: 'npc.injured' }).length, 1);
unsubscribe();

unregister();
assert.equal(api.hasSystem('world.core'), false);
assert.equal(api.getSystemCount(), 0);
assert.throws(() => api.requireSystem('world.core'), /not registered/);

console.log('Adventure API foundation: all checks passed.');
