import assert from 'node:assert/strict';
import { defaultWorld } from '../src/game/iso/isoWorld';
import { freshPathState, scanForBridgeSites } from '../src/game/engine3d/paths';

// A controlled world with two independent river crossings; this fixture is deterministic. The first has
// a matching path on both banks; the second only has a near-bank approach.
const world = defaultWorld();
world.huts = [];
world.stalls = [];
world.trees = [];
world.rocks = [];
world.crates = [];
world.walls = [];
world.placements = [
  { kind: 'path', x0: 119, y0: 120, x1: 119, y1: 120 },
  { kind: 'path', x0: 121, y0: 120, x1: 121, y1: 120 },
  { kind: 'path', x0: 119, y0: 130, x1: 119, y1: 130 },
];
world.terrain = { '120,120': 'water', '120,130': 'water' };
world.rivers = [{
  id: 'river-test',
  tiles: [
    { x: 120, y: 120, dx: 0, dy: 1 },
    { x: 120, y: 130, dx: 0, dy: 1 },
  ],
  mouth: { x: 120, y: 140 },
}];

const state = freshPathState();
assert.deepEqual(scanForBridgeSites(world, state, 2), [], 'bridge day gate remains closed before day 3');
const sites = scanForBridgeSites(world, state, 3);
assert.equal(sites.length, 1, 'one daily scan opens only one bridge site');
assert.deepEqual({ x: sites[0].x, y: sites[0].y }, { x: 120, y: 120 }, 'the best two-bank-aligned crossing wins');
assert.equal(state.bridges.length, 1, 'only the selected site enters persisted bridge state');
assert.equal(state.bridges[0].id, 'bridge-120-120', 'bridge identity remains stable');
assert.equal('_candidateScore' in state.bridges[0], false, 'transient ranking data is never persisted');
assert.equal(state.lastBridgeScanDay, 3, 'the daily scan marker advances');
assert.deepEqual(scanForBridgeSites(world, state, 3), [], 'a second same-day scan does not create duplicates');
// BUILD 1123 release-gate test.
console.log('River bridge ranking tests passed (day gate, best crossing, one site/day, stable persistence).');
