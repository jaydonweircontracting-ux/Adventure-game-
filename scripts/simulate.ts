// Simulation play-test: 10,000 iterations across world gen, AI, and spawn rules.
// Run with: npx tsx scripts/simulate.ts
import { generateWorldMap, WORLD_MAP_BOUNDS, elevationLevelFor } from '../src/game/worldMap';
import { updateGoat, type GoatAIEntity } from '../src/game/ai';
import { advanceSimulatedAdventurers, initialSimulatedAdventurers } from '../src/game/simulatedAdventurers';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; if (failures.length < 20) failures.push(message); }
}

// ---- 1. World generation determinism (1,000 iterations) ----
console.log('Testing world generation determinism...');
for (let i = 0; i < 1000; i++) {
  const seed = 1000 + i;
  const a = generateWorldMap(seed);
  const b = generateWorldMap(seed);
  assert(a.length === b.length, `World gen length mismatch for seed ${seed}`);
  const same = a.every((tile, idx) => tile.biome === b[idx].biome && tile.elevationLevel === b[idx].elevationLevel);
  assert(same, `World gen not deterministic for seed ${seed}`);
}

// ---- 2. World structure validation ----
console.log('Testing world structure...');
const world = generateWorldMap(42);
assert(world.length === 31 * 31, `Expected 961 tiles, got ${world.length}`);
// Ocean ring: perimeter tiles should be ocean
let perimeterOcean = 0;
let perimeterTotal = 0;
for (const tile of world) {
  const isPerimeter = tile.x === WORLD_MAP_BOUNDS.minX || tile.x === WORLD_MAP_BOUNDS.maxX ||
    tile.y === WORLD_MAP_BOUNDS.minY || tile.y === WORLD_MAP_BOUNDS.maxY;
  if (isPerimeter) {
    perimeterTotal++;
    if (tile.biome === 'ocean') perimeterOcean++;
  }
  assert(tile.elevationLevel >= 0 && tile.elevationLevel <= 5, `Elevation out of range at ${tile.x},${tile.y}: ${tile.elevationLevel}`);
}
assert(perimeterOcean === perimeterTotal, `Ocean ring broken: ${perimeterOcean}/${perimeterTotal} perimeter tiles are ocean`);

// ---- 3. Danger zone logic (replicated from App.tsx) ----
console.log('Testing danger zones...');
function dangerForChunk(chunk: { x: number; y: number }): number {
  const dist = Math.max(Math.abs(chunk.x - 4), Math.abs(chunk.y - 7));
  if (dist <= 1) return 0;
  if (dist <= 3) return 1;
  if (dist <= 6) return 2;
  return 3;
}
for (let i = 0; i < 10000; i++) {
  const chunk = {
    x: WORLD_MAP_BOUNDS.minX + (i * 37) % 31,
    y: WORLD_MAP_BOUNDS.minY + (i * 53) % 31,
  };
  const danger = dangerForChunk(chunk);
  assert(danger >= 0 && danger <= 3, `Danger out of range for chunk ${chunk.x},${chunk.y}`);
  // Starting area must always be safe
  if (Math.abs(chunk.x - 4) <= 1 && Math.abs(chunk.y - 7) <= 1) {
    assert(danger === 0, `Starting area chunk ${chunk.x},${chunk.y} not danger 0`);
  }
}

// ---- 4. Goat AI home-range (10,000 simulated chase steps) ----
console.log('Testing goat home-range clamping...');
for (let i = 0; i < 10000; i++) {
  const spawnPosition = { x: 50, y: 50 };
  const roamRadius = 16 + (i % 9);
  const goat: GoatAIEntity = {
    position: { x: 50 + (i % 10) - 5, y: 50 + (i % 7) - 3 },
    facing: 'right',
    state: 'chase',
    disposition: 'aggressive',
    hp: 100, maxHp: 100,
    attackCooldown: 0, attackTimer: 0, attackHitApplied: false,
    hurtTimer: 0, moving: false, attacking: false,
    spawnPosition, roamRadius,
  };
  // Player far away, luring the goat out
  const player = { x: 50 + roamRadius + 30, y: 50 };
  const result = updateGoat(goat, player, 'left', [goat], 100);
  const distFromHome = Math.hypot(result.goat.position.x - spawnPosition.x, result.goat.position.y - spawnPosition.y);
  assert(distFromHome <= roamRadius + 0.01, `Goat escaped home range: ${distFromHome.toFixed(2)} > ${roamRadius} (iter ${i})`);
}

// ---- 5. Goat AI flee clamping ----
console.log('Testing goat flee clamping...');
for (let i = 0; i < 5000; i++) {
  const spawnPosition = { x: 50, y: 50 };
  const roamRadius = 20;
  const goat: GoatAIEntity = {
    position: { x: 50 + roamRadius - 2, y: 50 },
    facing: 'left',
    state: 'chase',
    disposition: 'aggressive',
    hp: 10, maxHp: 100, // low HP triggers flee
    attackCooldown: 0, attackTimer: 0, attackHitApplied: false,
    hurtTimer: 0, moving: false, attacking: false,
    spawnPosition, roamRadius,
  };
  const player = { x: 50, y: 50 }; // threat at home, goat flees outward
  const result = updateGoat(goat, player, 'right', [goat], 500);
  const distFromHome = Math.hypot(result.goat.position.x - spawnPosition.x, result.goat.position.y - spawnPosition.y);
  assert(distFromHome <= roamRadius + 0.01, `Fleeing goat escaped range: ${distFromHome.toFixed(2)} > ${roamRadius} (iter ${i})`);
}

// ---- 6. Elevation level function ----
console.log('Testing elevation levels...');
const biomes = ['ocean', 'shore', 'meadow', 'forest', 'desert', 'tundra', 'rock'] as const;
for (let i = 0; i < 5000; i++) {
  const climate = { elevation: (i * 13) % 100 / 100, temperature: (i * 7) % 100 / 100, moisture: (i * 11) % 100 / 100 };
  const level = elevationLevelFor(climate, biomes[i % biomes.length]);
  assert(Number.isInteger(level) && level >= 0 && level <= 5, `Bad elevation level: ${level}`);
}

// ---- 7. Hostile spawn rules: nothing dangerous in the safe zone ----
console.log('Testing hostile spawn rules...');
const worldTiles = new Map(world.map((t) => [`${t.x},${t.y}`, t]));
let safeZoneViolations = 0;
for (let i = 0; i < 10000; i++) {
  const chunk = {
    x: WORLD_MAP_BOUNDS.minX + (i * 37) % 31,
    y: WORLD_MAP_BOUNDS.minY + (i * 53) % 31,
  };
  const danger = dangerForChunk(chunk);
  const tile = worldTiles.get(`${chunk.x},${chunk.y}`);
  if (!tile) continue;
  const terrain = tile.biome;
  // Replicate spawn-table gates from monstersForChunk: would anything hostile spawn here?
  const goblinOk = terrain === 'forest' && danger >= 2;
  const banditOk = danger >= 1; // + road check omitted, danger gate is the point
  const skeletonOk = (terrain === 'rock' || terrain === 'desert') && danger >= 2;
  const spiderOk = terrain === 'forest' && danger >= 2;
  const snakeOk = (terrain === 'desert' || terrain === 'meadow') && danger >= 1;
  const trollOk = danger >= 3;
  const dragonOk = danger >= 3 && terrain !== 'ocean';
  if (danger === 0 && (goblinOk || banditOk || skeletonOk || spiderOk || snakeOk || trollOk || dragonOk)) {
    safeZoneViolations++;
    if (safeZoneViolations < 5) failures.push(`Hostile spawn gate open in safe zone at ${chunk.x},${chunk.y}`);
  }
}
assert(safeZoneViolations === 0, `Hostile spawn gates open in safe zone: ${safeZoneViolations} violations`);

// ---- 7. Adventurers leave the starting house (no doorway pile-up) ----
console.log('Testing adventurer house exit...');
let leavers = initialSimulatedAdventurers.map((a) => ({ ...a }));
for (let tick = 0; tick < 500; tick++) {
  leavers = advanceSimulatedAdventurers(leavers, tick);
}
for (const a of leavers) {
  assert(a.location === 'field', `${a.name} never left the starting house (stuck at ${a.interiorPosition?.x},${a.interiorPosition?.y})`);
}
// While still inside, nobody should be past the door or outside the room.
let insideOk = initialSimulatedAdventurers.map((a) => ({ ...a }));
for (let tick = 0; tick < 60; tick++) {
  insideOk = advanceSimulatedAdventurers(insideOk, tick);
  for (const a of insideOk) {
    if ((a.location || 'field') === 'starting-house' && a.interiorPosition) {
      assert(a.interiorPosition.y <= 84, `${a.name} escaped interior bounds at y=${a.interiorPosition.y}`);
    }
  }
}

// ---- Results ----
console.log(`\n${'='.repeat(50)}`);
console.log(`SIMULATION COMPLETE: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);
if (failures.length > 0) {
  console.log('\nFirst failures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
