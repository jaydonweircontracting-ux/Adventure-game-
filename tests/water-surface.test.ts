import assert from 'node:assert/strict';
import { isWaterSurfaceTerrain, waterSurfaceY } from '../src/game/engine3d/worldRender3d';

assert.equal(isWaterSurfaceTerrain('water'), true, 'deep water is a water surface');
assert.equal(isWaterSurfaceTerrain('foam'), true, 'foam is still a water surface');
assert.equal(isWaterSurfaceTerrain('grass'), false, 'land remains heightfield terrain');
assert.equal(waterSurfaceY('water', 7.25), 0, 'water ignores sloped land corner height');
assert.equal(waterSurfaceY('foam', 4.5), 0, 'foam ignores sloped land corner height');
assert.equal(waterSurfaceY('grass', 4.5), 4.5, 'land keeps its sampled height');
assert.equal(waterSurfaceY('water', 7.25, -0.02), -0.02, 'far water uses its ring offset');
assert.equal(waterSurfaceY('foam', 4.5, -0.08), -0.08, 'far foam uses its ring offset');

console.log('Flat water surface regression: passed');
