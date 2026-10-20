import assert from 'node:assert/strict';
import {
  EXPANDED_WORLD_BOUNDS,
  generateWorldMap,
  type GeneratedWorldTile,
} from '../src/game/worldMap';

const bounds = EXPANDED_WORLD_BOUNDS;
const width = bounds.maxX - bounds.minX + 1;
const height = bounds.maxY - bounds.minY + 1;
const expectedCount = width * height;
const first = generateWorldMap(20261019, bounds);
const second = generateWorldMap(20261019, bounds);

assert.equal(first.length, expectedCount, 'expanded atlas must contain every map cell');
assert.deepEqual(first, second, 'same seed and bounds must produce identical world maps');

const byCoord = new Map<string, GeneratedWorldTile>();
for (const tile of first) {
  const key = `${tile.x},${tile.y}`;
  assert.ok(!byCoord.has(key), `duplicate map cell ${key}`);
  byCoord.set(key, tile);
  assert.ok(Number.isFinite(tile.climate.elevation) && tile.climate.elevation >= 0 && tile.climate.elevation <= 1);
  assert.ok(Number.isFinite(tile.climate.temperature) && tile.climate.temperature >= 0 && tile.climate.temperature <= 1);
  assert.ok(Number.isFinite(tile.climate.moisture) && tile.climate.moisture >= 0 && tile.climate.moisture <= 1);
}
assert.equal(byCoord.size, expectedCount, 'atlas coordinates must be unique and hole-free');

const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
let shorelineCount = 0;
let borderDetailCount = 0;
for (const tile of first) {
  const neighbors = dirs
    .map(([dx, dy]) => byCoord.get(`${tile.x + dx},${tile.y + dy}`))
    .filter((n): n is GeneratedWorldTile => Boolean(n));
  const touchesOcean = neighbors.some((n) => n.biome === 'ocean');
  if (tile.biome === 'shore') shorelineCount++;
  if (tile.nearBiomeBorder) borderDetailCount++;
  if (tile.biome !== 'ocean' && touchesOcean) {
    assert.equal(tile.biome, 'shore', `land tile ${tile.x},${tile.y} touching ocean must use the shore band`);
  }
  if (tile.biome === 'shore') {
    assert.ok(touchesOcean || neighbors.some((n) => n.biome === 'shore'),
      `shore tile ${tile.x},${tile.y} must connect to a coastline`);
  }
}
assert.ok(shorelineCount > 0, 'world must contain coastlines');
assert.ok(borderDetailCount > 0, 'world must mark biome boundaries for edge detail');

console.log(`World map coherence passed: ${expectedCount} unique cells, ${shorelineCount} shoreline tiles, ${borderDetailCount} biome-border tiles.`);
