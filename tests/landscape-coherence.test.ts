import assert from 'node:assert/strict';
import {
  LANDSCAPE_FIELD_SIZE,
  checkFieldContinuity,
  forestDensityAt,
  landscapeSeed,
  lakesForChunk,
  macroLandformAt,
  moistureAt,
  regionForChunk,
  rockDensityAt,
  roadCorridorsFor,
  pointInCorridors,
  waterAt,
  waterGridForChunk,
} from '../src/game/landscape';

const seed = 847291583;
const points = [
  [0, 0],
  [LANDSCAPE_FIELD_SIZE, LANDSCAPE_FIELD_SIZE],
  [-LANDSCAPE_FIELD_SIZE * 2.5, LANDSCAPE_FIELD_SIZE * 3.25],
  [12345.125, -9876.5],
] as const;

// World-space environmental fields are deterministic, finite, and bounded.
for (const [x, y] of points) {
  for (const field of [macroLandformAt, moistureAt, forestDensityAt, rockDensityAt]) {
    const first = field(x, y);
    assert.equal(field(x, y), first, 'field samples must be reproducible');
    assert.ok(Number.isFinite(first), 'field samples must be finite');
    assert.ok(first >= 0 && first <= 1, 'normalized field samples must stay in [0, 1]');
  }
}

// A chunk edge is a shared world-space line, not two independent random edges.
const continuity = checkFieldContinuity([
  { x: 0, y: 0 },
  { x: -1, y: 2 },
  { x: 7, y: -4 },
]);
assert.equal(continuity.length, 12);
assert.ok(continuity.every((sample) => sample.maxDelta < 0.001),
  'world-anchored fields should remain effectively continuous across chunk edges');

// Independent subsystem streams are repeatable and do not share a stream.
const readStream = (cx: number, cy: number, subsystem: 'terrain' | 'water' | 'vegetation') => {
  const rng = landscapeSeed(seed, cx, cy, subsystem);
  return [rng(), rng(), rng(), rng()];
};
assert.deepEqual(readStream(-2, 5, 'terrain'), readStream(-2, 5, 'terrain'));
assert.notDeepEqual(readStream(-2, 5, 'terrain'), readStream(-2, 5, 'water'));
assert.notDeepEqual(readStream(-2, 5, 'vegetation'), readStream(-1, 5, 'vegetation'));

// Negative world coordinates use floor-based chunk addressing consistently.
assert.equal(regionForChunk(-1, -1).regionId, '-1,-1');
assert.equal(regionForChunk(-4, -4).regionId, '-1,-1');
assert.equal(regionForChunk(-5, -4).regionId, '-2,-1');

// Road corridor geometry stays deterministic and margins only expand clearance.
const road = roadCorridorsFor('nsew');
const expandedRoad = roadCorridorsFor('nsew', { margin: 8 });
assert.deepEqual(road, roadCorridorsFor('nsew'));
assert.equal(road.length, 5);
assert.equal(expandedRoad.length, road.length);
assert.ok(pointInCorridors(140, 140, road));
assert.ok(!pointInCorridors(0, 0, road));
assert.ok(pointInCorridors(0, 0, expandedRoad) === false,
  'margin expansion should not unexpectedly reach the chunk corner');

// Lake placement and sampled water are stable for the same seed and coordinates.
for (const [cx, cy] of [[0, 0], [-2, 4], [7, -3]] as const) {
  assert.deepEqual(lakesForChunk(cx, cy, seed), lakesForChunk(cx, cy, seed));
  const wx = (cx + 0.37) * LANDSCAPE_FIELD_SIZE;
  const wy = (cy + 0.61) * LANDSCAPE_FIELD_SIZE;
  assert.deepEqual(waterAt(wx, wy, seed), waterAt(wx, wy, seed));
  const a = waterGridForChunk(cx, cy, 12, seed);
  const b = waterGridForChunk(cx, cy, 12, seed);
  assert.deepEqual(Array.from(a.depths), Array.from(b.depths));
  assert.deepEqual(Array.from(a.kinds), Array.from(b.kinds));
}

console.log('Landscape coherence checks passed.');
