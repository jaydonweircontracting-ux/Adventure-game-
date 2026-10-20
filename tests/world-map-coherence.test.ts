import assert from 'node:assert/strict';
import {
  CORE_WORLD_BOUNDS,
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
  const inFrozenCore =
    tile.x >= CORE_WORLD_BOUNDS.minX && tile.x <= CORE_WORLD_BOUNDS.maxX &&
    tile.y >= CORE_WORLD_BOUNDS.minY && tile.y <= CORE_WORLD_BOUNDS.maxY;
  // The original core atlas is intentionally frozen for compatibility; audit
  // the generated outer ring and second continent without rewriting its tiles.
  if (!inFrozenCore && tile.biome !== 'ocean' && touchesOcean) {
    assert.equal(tile.biome, 'shore', `generated land tile ${tile.x},${tile.y} touching ocean must use the shore band`);
  }
  if (tile.biome === 'shore') {
    assert.ok(touchesOcean || neighbors.some((n) => n.biome === 'shore'),
      `shore tile ${tile.x},${tile.y} must connect to a coastline`);
  }
}
assert.ok(shorelineCount > 0, 'world must contain coastlines');
assert.ok(borderDetailCount > 0, 'world must mark biome boundaries for edge detail');

// Multi-seed audit: map expansion must not change the authored core, and
// every seed must still produce a varied, valid home region.
for (const seed of [1, 42, 2026, 0x7fffffff]) {
  const coreOnly = generateWorldMap(seed, CORE_WORLD_BOUNDS);
  const expanded = generateWorldMap(seed, bounds);
  const coreKey = (tile: GeneratedWorldTile) => `${tile.x},${tile.y}`;
  const expandedCore = new Map(expanded
    .filter((tile) => tile.x >= CORE_WORLD_BOUNDS.minX && tile.x <= CORE_WORLD_BOUNDS.maxX &&
      tile.y >= CORE_WORLD_BOUNDS.minY && tile.y <= CORE_WORLD_BOUNDS.maxY)
    .map((tile) => [coreKey(tile), tile]));
  assert.equal(coreOnly.length, (CORE_WORLD_BOUNDS.maxX - CORE_WORLD_BOUNDS.minX + 1) *
    (CORE_WORLD_BOUNDS.maxY - CORE_WORLD_BOUNDS.minY + 1));
  for (const tile of coreOnly) {
    const same = expandedCore.get(coreKey(tile));
    assert.ok(same, `expanded world lost frozen-core tile ${coreKey(tile)} for seed ${seed}`);
    assert.equal(same.biome, tile.biome, `core biome changed at ${coreKey(tile)} for seed ${seed}`);
    assert.deepEqual(same.climate, tile.climate, `core climate changed at ${coreKey(tile)} for seed ${seed}`);
    assert.equal(same.detail, tile.detail, `core detail changed at ${coreKey(tile)} for seed ${seed}`);
  }
  const biomes = new Set(expanded.map((tile) => tile.biome));
  for (const required of ['ocean', 'shore', 'meadow', 'forest', 'desert', 'tundra', 'rock']) {
    assert.ok(biomes.has(required as GeneratedWorldTile['biome']),
      `seed ${seed} missing expected world biome ${required}`);
  }
  const coords = new Set(expanded.map(coreKey));
  assert.equal(coords.size, expanded.length, `seed ${seed} produced duplicate cells`);
  assert.ok(expanded.every((tile) => Number.isFinite(tile.elevationLevel) &&
    tile.elevationLevel >= 0 && tile.elevationLevel <= 5),
  `seed ${seed} produced invalid elevation levels`);
}
console.log('Multi-seed audit passed: frozen core, biome variety, unique coordinates, and elevation bands.');

console.log(`World map coherence passed: ${expectedCount} unique cells, ${shorelineCount} shoreline tiles, ${borderDetailCount} biome-border tiles.`);
