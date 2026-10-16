// Deterministic landscape regression tests.
// Run with: npm run test:landscape
import {
  DEFAULT_WORLD_SEED,
  LANDSCAPE_FIELD_SIZE,
  SETTLEMENT_INFLUENCE_RADIUS,
  townInfluenceAt,
  landUseAt,
  moistureAt,
  forestDensityAt,
  rockDensityAt,
  macroLandformAt,
  checkFieldContinuity,
  landscapeSeed,
  roadCorridorsFor,
  pointInCorridors,
  waterGridForChunk,
  waterGridAt,
} from '../../src/game/landscape';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else { failed++; if (failures.length < 30) failures.push(message); }
}

console.log('Testing deterministic landscape fields...');
for (const [name, field] of [
  ['moisture', moistureAt],
  ['forest density', forestDensityAt],
  ['rock density', rockDensityAt],
  ['macro landform', macroLandformAt],
] as const) {
  for (const [x, y] of [[0, 0], [140, 280], [-840, 1120], [4210, -1960]]) {
    const a = field(x, y);
    const b = field(x, y);
    assert(Number.isFinite(a) && a >= 0 && a <= 1, name + ' is finite and in [0,1]');
    assert(a === b, name + ' repeats deterministically at ' + x + ',' + y);
  }
}

console.log('Testing settlement influence...');
const townCenter = townInfluenceAt(4.5 * LANDSCAPE_FIELD_SIZE, 7.5 * LANDSCAPE_FIELD_SIZE);
assert(townCenter.nearestChunk?.x === 4 && townCenter.nearestChunk?.y === 7,
  'Mosslight Crossing is the nearest settlement at its center');
assert(townCenter.distance === 0 && townCenter.influence === 1,
  'settlement center has zero distance and full influence');
const outside = townInfluenceAt(
  (4.5 * LANDSCAPE_FIELD_SIZE) + SETTLEMENT_INFLUENCE_RADIUS * 10,
  7.5 * LANDSCAPE_FIELD_SIZE,
);
assert(outside.influence === 0, 'influence fades to zero beyond its radius');
assert(outside.distance > SETTLEMENT_INFLUENCE_RADIUS, 'distance remains actual world distance');
assert(landUseAt(4.5 * LANDSCAPE_FIELD_SIZE, 7.5 * LANDSCAPE_FIELD_SIZE) === 'town',
  'settlement center is classified as town');

console.log('Testing world-coordinate continuity...');
const continuity = checkFieldContinuity([{ x: 0, y: 0 }, { x: -3, y: 4 }, { x: 12, y: -8 }]);
assert(continuity.length === 12, 'continuity checker returns four edges per chunk');
assert(continuity.every((sample) => Number.isFinite(sample.maxDelta) && sample.maxDelta < 0.001),
  'world-anchored fields stay continuous across chunk edges');

console.log('Testing isolated deterministic random streams...');
type Subsystem = 'region' | 'terrain' | 'water' | 'vegetation' | 'rocks' | 'resources' | 'pois' | 'detail';
const readStream = (seed: number, x: number, y: number, subsystem: Subsystem) => {
  const rng = landscapeSeed(seed, x, y, subsystem);
  return [rng(), rng(), rng()];
};
assert(JSON.stringify(readStream(DEFAULT_WORLD_SEED, 2, -4, 'vegetation')) ===
  JSON.stringify(readStream(DEFAULT_WORLD_SEED, 2, -4, 'vegetation')),
  'same seed/chunk/subsystem produces the same stream');
assert(JSON.stringify(readStream(DEFAULT_WORLD_SEED, 2, -4, 'vegetation')) !==
  JSON.stringify(readStream(DEFAULT_WORLD_SEED, 2, -4, 'water')),
  'separate subsystems do not share the same stream');

console.log('Testing road corridor geometry...');
const corridors = roadCorridorsFor('nesw');
assert(corridors.length === 5, 'four-way road includes four arms and its center');
assert(pointInCorridors(LANDSCAPE_FIELD_SIZE / 2, LANDSCAPE_FIELD_SIZE / 2, corridors),
  'road center lies in its corridor');
assert(!pointInCorridors(0, 0, corridors), 'road corner remains outside the corridor');

console.log('Testing water-grid determinism and bounds...');
const gridA = waterGridForChunk(0, 0, 12, DEFAULT_WORLD_SEED);
const gridB = waterGridForChunk(0, 0, 12, DEFAULT_WORLD_SEED);
assert(gridA.depths.length === 144 && gridA.kinds.length === 144, 'water grid allocates the requested cell count');
assert(Array.from(gridA.depths).every((depth) => Number.isFinite(depth) && depth >= 0 && depth <= 1),
  'water depths remain finite and in [0,1]');
assert(Array.from(gridA.depths).every((depth, i) => depth === gridB.depths[i]) &&
  Array.from(gridA.kinds).every((kind, i) => kind === gridB.kinds[i]),
  'same seed and chunk generate identical water grids');
const sample = waterGridAt(gridA, gridA.originX + gridA.cellSize / 2, gridA.originY + gridA.cellSize / 2);
assert(sample.depth === gridA.depths[0] && sample.kind === gridA.kinds[0],
  'water grid lookup matches its first cell');
const outsideGrid = waterGridAt(gridA, gridA.originX - 1, gridA.originY);
assert(outsideGrid.depth === 0 && outsideGrid.kind === 0, 'out-of-grid lookups safely return dry terrain');

console.log(`Landscape tests: ${passed} passed, ${failed} failed.`);
if (failed) {
  console.error(failures.join('\n'));
  process.exit(1);
}
