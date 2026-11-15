import assert from 'node:assert/strict';
import { createCivilization } from '../src/game/civilization';
import type { Townsperson } from '../src/game/townsfolk';
import type { WorldClockState } from '../src/game/worldCore';
import { initResource, harvestResource } from '../src/game/resources';
import {
  advanceLivingWorld,
  createLivingWorldState,
  deserializeLivingWorld,
  serializeLivingWorld,
} from '../src/game/worldSimulation';

function clock(day: number): WorldClockState {
  return {
    tick: day, year: 1, month: 1, week: 1, day,
    hour: 12, minuteOfDay: 720, second: 0, season: 'spring',
  };
}

const seed = 123456;
const forest = initResource('trees', 4, 7, seed);
const depletedForest = harvestResource(forest, 0.5).resource;
const civ = createCivilization(seed);
const state = createLivingWorldState(civ, { 'forest-4-7': depletedForest }, 1);
const roster = [
  { id: 'farmer-a', seed: 123, archetype: 'farmer' },
  { id: 'smith-a', seed: 234, archetype: 'smith' },
  { id: 'priest-a', seed: 345, archetype: 'priest' },
] as unknown as Townsperson[];

const first = advanceLivingWorld(state, roster, clock(3));
assert.equal(first.advancedDays, 3);
assert.equal(first.resourcePopulationsAdvanced, 1);
assert.ok(first.state.resources['forest-4-7'].density > depletedForest.density,
  'regional tree populations regenerate through the shared world advance');
assert.equal(first.state.civilization.lastSimDay, 3,
  'civilization economy advances to the same authoritative world day');

const storageAfterFirstAdvance = JSON.stringify(
  first.state.civilization.settlements.find((s) => s.id === 'mosslight')?.storage,
);
const repeated = advanceLivingWorld(first.state, roster, clock(3));
assert.equal(repeated.advancedDays, 0, 'repeating the same world day is idempotent');
assert.equal(
  JSON.stringify(repeated.state.civilization.settlements.find((s) => s.id === 'mosslight')?.storage),
  storageAfterFirstAdvance,
  'repeated calls do not duplicate NPC production',
);

const restored = deserializeLivingWorld(serializeLivingWorld(first.state));
assert.equal(restored.lastAdvancedDay, 3, 'shared simulation checkpoint survives save/load');
assert.equal(restored.resources['forest-4-7'].density, first.state.resources['forest-4-7'].density);
assert.equal(restored.civilization.lastSimDay, first.state.civilization.lastSimDay);

console.log('Living-world coordinator tests passed (ecology, NPC production, civilization, idempotency, save/load).');
