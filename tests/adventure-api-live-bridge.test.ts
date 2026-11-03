import assert from 'node:assert/strict';
import { createAdventureLiveBridge } from '../src/game/api/AdventureLiveBridge';

let clock = { tick: 12, day: 3, season: 'spring' };
let player = { hp: 42, level: 4 };
let roster = [{ id: 'npc-1', name: 'Mira' }];
let inventory = { gold: 25 };
let quests = { active: [{ questId: 'q-1', status: 'active' }], tasks: [] };
let civilization = { settlements: [{ id: 'mosslight' }], kingdoms: [] };

const bridge = createAdventureLiveBridge({
  world: () => ({ clock, chunk: { x: 4, y: 7 } }),
  player: () => player,
  npcs: () => ({ count: roster.length, roster }),
  inventory: () => inventory,
  quests: () => quests,
  civilization: () => civilization,
});

assert.equal(bridge.api.getSystemCount(), 11);
assert.equal(bridge.api.hasSystem('world.live'), true);
assert.equal(bridge.api.hasSystem('player.live'), true);
assert.equal(bridge.api.hasSystem('npc.roster.live'), true);
assert.equal(bridge.api.hasSystem('inventory.live'), true);
assert.equal(bridge.api.hasSystem('quests.live'), true);
assert.equal(bridge.api.hasSystem('civilization.live'), true);
assert.equal(bridge.api.hasSystem('npc.psychology'), true);
assert.equal(bridge.api.hasSystem('npc.navigation'), true);
assert.equal(bridge.api.hasSystem('economy.items'), true);
assert.equal(bridge.api.hasSystem('combat.geometry'), true);

const worldService = bridge.api.requireSystem<{ getSnapshot: () => { clock: typeof clock } }>('world.live');
assert.equal(worldService.getSnapshot().clock.day, 3);
assert.equal(bridge.readSnapshot().player, player);

clock = { tick: 30, day: 4, season: 'summer' };
player = { hp: 19, level: 5 };
roster = [...roster, { id: 'npc-2', name: 'Cedric' }];
inventory = { gold: 40 };
quests = { active: [{ questId: 'q-1', status: 'completed' }], tasks: [{ taskId: 't-1' }] };
civilization = { settlements: [{ id: 'mosslight' }, { id: 'greenvale' }], kingdoms: [] };

const live = bridge.readSnapshot();
assert.equal((live.world as { clock: typeof clock }).clock.day, 4);
assert.equal((live.player as typeof player).hp, 19);
assert.equal((live.npcs as { count: number }).count, 2);
assert.equal((live.inventory as typeof inventory).gold, 40);
assert.equal((live.quests as typeof quests).active[0].status, 'completed');
assert.equal((live.civilization as typeof civilization).settlements.length, 2);

// The bridge exposes the real providers and gameplay helpers; it owns no clock.
assert.equal(bridge.api.hasSystem('world.clock'), false);
bridge.dispose();
assert.equal(bridge.api.getSystemCount(), 0);
console.log('Adventure live API bridge: all checks passed.');
