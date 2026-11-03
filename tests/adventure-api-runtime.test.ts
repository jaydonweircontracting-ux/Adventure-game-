import assert from 'node:assert/strict';
import { createAdventureRuntime } from '../src/game/api';

const runtime = createAdventureRuntime({ worldSeed: 847291583, eventHistoryLimit: 32 });
const { api, world, terrain, civilization, graphics, npc, navigation, combat } = runtime;

assert.equal(api.version, '1.0.0');
assert.equal(api.getSystemCount(), 7);
assert.equal(api.hasSystem('world.clock'), true);
assert.equal(api.hasSystem('world.terrain'), true);
assert.equal(api.hasSystem('world.civilization'), true);
assert.equal(api.hasSystem('graphics.modes'), true);
assert.equal(api.hasSystem('npc.psychology'), true);
assert.equal(api.hasSystem('npc.navigation'), true);
assert.equal(api.hasSystem('combat.geometry'), true);

const start = world.getClock();
let timeEvents = 0;
let dayEvents = 0;
const stopTime = api.events.subscribe('world.time-advanced', () => { timeEvents += 1; });
const stopDay = api.events.subscribe('world.day-changed', () => { dayEvents += 1; });
world.advance(1);
assert.equal(world.getClock().tick, start.tick + 1);
assert.equal(timeEvents, 1);
assert.equal(dayEvents, 0);

world.setSimulationSpeed(10);
world.advance(1);
assert.equal(world.getClock().tick, start.tick + 11);
assert.equal(timeEvents, 11);
assert.throws(() => world.setSimulationSpeed(3), /unsupported simulation speed/);

let civAdvances = 0;
const stopCiv = api.events.subscribe('economy.civilization-advanced', (event) => {
  civAdvances += 1;
  assert.ok(event.payload.settlements > 0);
});
world.setSimulationSpeed(1);
world.advance(120);
assert.ok(civAdvances >= 1, 'civilization should advance automatically on a new world day');
assert.ok(civilization.state.lastSimDay >= 2);

const sample = terrain.sample(100, 100);
assert.ok(Number.isFinite(sample.landform));
assert.ok(Number.isFinite(sample.moisture));
assert.ok(Number.isFinite(sample.forestDensity));
assert.ok(Number.isFinite(sample.rockDensity));
assert.ok(sample.water && typeof sample.water === 'object');
assert.ok(sample.region && typeof sample.region === 'object');

assert.ok(civilization.state.settlements.length > 0);
const civSave = civilization.serialize(civilization.state);
const originalSeed = civilization.state.worldSeed;
civilization.load(civSave);
assert.equal(civilization.state.worldSeed, originalSeed);

assert.deepEqual(graphics.getModeOptions().map((mode) => mode.value), ['2d', '2.5d', '3d']);
assert.equal(graphics.isSupportedMode('3d'), true);
assert.equal(graphics.isSupportedMode('vr'), false);

const mood = npc.createMood();
const stressed = npc.applyEvent(mood, {
  id: 'api-test-danger', category: 'credible_danger', severity: 1, witnessed: true,
}, 'worrier');
assert.ok(npc.validate(stressed));
assert.ok(stressed.fear > mood.fear);
assert.equal(npc.applyEvent(stressed, {
  id: 'api-test-danger', category: 'credible_danger', severity: 1, witnessed: true,
}, 'worrier'), stressed, 'NPC mood events should deduplicate by stable ID');
assert.equal(npc.archetype('guardian').id, 'guardian');
assert.equal(typeof npc.summarize(stressed), 'string');
assert.ok(npc.advanceTime(stressed, 2, 'worrier').fear <= stressed.fear);

const navPath = navigation.pathTo({ x: 10, y: 10 }, { x: 20, y: 20 }, []);
assert.ok(navPath && navPath.waypoints.length > 0);
const navStep = navigation.step(navPath, { x: 10, y: 10 }, 1);
assert.ok(navStep.moving || navStep.arrived);
assert.equal(navigation.validateDestination({ x: -50, y: -50 }, []).corrected, true);

assert.equal(combat.direction({ x: 0, y: 0 }, { x: 5, y: 0 }), 'right');
assert.equal(combat.isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 }), true);
assert.equal(combat.isInMeleeArc({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 'right'), true);
assert.equal(combat.intersectsHitbox({ x: 0, y: 0 }, combat.entityBounds({ x: 0, y: 0 })), true);
assert.equal(combat.isLineBlocked({ x: 0, y: 0 }, { x: 10, y: 0 }, (point) => point.x > 4 && point.x < 6), true);

stopTime();
stopDay();
stopCiv();
runtime.dispose();
assert.equal(api.getSystemCount(), 0);

console.log('Adventure API runtime integration: all checks passed.');
