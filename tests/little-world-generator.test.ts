import assert from 'node:assert/strict';
import {
  generateWorld, serializeWorld, deserializeWorld, renderWorldPixels,
  smoothTerrain, raiseMountains, exportAdventureWorldMap, serializeAdventureWorldMap,
} from '../src/game/worldgen/littleWorldGenerator';

const options = { width: 40, height: 32, seed: 8128 };
const a = generateWorld(options);
const b = generateWorld(options);
assert.equal(a.cells.length, 1280);
assert.deepEqual(a.cells, b.cells, 'same seed must produce identical maps');
assert.ok(a.cells.some(c => c.water), 'map should contain ocean cells');
assert.ok(a.cells.some(c => c.biome !== 'ocean'), 'map should contain land cells');
assert.ok(a.cells.some(c => c.river), 'hydrology should produce at least one river');
assert.equal(renderWorldPixels(a, 'biome').length, a.cells.length * 4);
const adventureMap = exportAdventureWorldMap(a);
assert.equal(adventureMap.format, 'adventure-world-map');
assert.equal(adventureMap.tiles.length, a.cells.length);
assert.equal(adventureMap.tiles[0].x, 0);
assert.equal(adventureMap.tiles[0].y, 0);
assert.equal(adventureMap.tiles[0].row, 0);
assert.equal(adventureMap.tiles[0].column, 0);
assert.ok(adventureMap.tiles.every(tile => ['ocean', 'shore', 'meadow', 'forest', 'desert', 'tundra', 'rock'].includes(tile.biome)));
assert.ok(adventureMap.tiles.every(tile => tile.elevationLevel >= 0 && tile.elevationLevel <= 5));
assert.ok(adventureMap.tiles.every(tile => [null, 'waves', 'pebbles', 'bush', 'trees', 'cactus', 'munchleaf', 'ridge'].includes(tile.detail)));
assert.ok(adventureMap.tiles.every(tile => typeof tile.nearBiomeBorder === 'boolean'));
assert.deepEqual(JSON.parse(serializeAdventureWorldMap(a)), adventureMap);
assert.deepEqual(deserializeWorld(serializeWorld(a)), a);
const smoothed = smoothTerrain(a);
assert.equal(smoothed.cells.length, a.cells.length);
assert.ok(smoothed.cells.every(cell => cell.water === (cell.height < smoothed.seaLevel)), 'smoothing must refresh water classification');
assert.ok(smoothed.cells.every(cell => !cell.water || !cell.river), 'river cells must remain land cells');
const mountainWorld = raiseMountains(a, 20, 16, 5);
assert.equal(mountainWorld.cells.length, a.cells.length);
assert.ok(mountainWorld.cells.every(cell => cell.water === (cell.height < mountainWorld.seaLevel)), 'mountain edits must refresh water classification');
assert.ok(mountainWorld.cells.every(cell => !cell.water || !cell.river), 'mountain edits must refresh river classification');
assert.throws(() => deserializeWorld('{"version":99}'), /Invalid or unsupported/);
console.log('Little World Generator tests passed');
