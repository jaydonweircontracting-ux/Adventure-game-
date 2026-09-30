// Simulation play-test: 10,000 iterations across world gen, AI, and spawn rules.
// Run with: npx tsx scripts/simulate.ts
import { generateWorldMap, WORLD_MAP_BOUNDS, EXPANDED_WORLD_BOUNDS, elevationLevelFor } from '../src/game/worldMap';
import { updateGoat, type GoatAIEntity } from '../src/game/ai';
import { advanceSimulatedAdventurers, initialSimulatedAdventurers, spawnDueAdventurer, MAX_ADVENTURERS, ADVENTURER_SPAWN_INTERVAL_TICKS } from '../src/game/simulatedAdventurers';
import { cornStalksForChunk } from '../src/game/cornfield';
import { editorPlaceObject, editorToggleFlag, editorSolidsFor, editorRemovalList, editorSolidSize } from '../src/game/worldEditor';

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
// They live full little lives now (tavern, guild, travel), so assert nobody is
// stuck inside and every location is a known one.
console.log('Testing adventurer house exit...');
{
  const validLocations = new Set(['starting-house', 'field', 'tavern', 'guild', 'traveling']);
  let leavers = initialSimulatedAdventurers.map((a) => ({ ...a }));
  for (let tick = 0; tick < 500; tick++) {
    leavers = advanceSimulatedAdventurers(leavers, tick);
  }
  for (const a of leavers) {
    assert(a.location !== 'starting-house', `${a.name} never left the starting house (stuck at ${a.interiorPosition?.x},${a.interiorPosition?.y})`);
    assert(validLocations.has(a.location || 'field'), `${a.name} has invalid location ${a.location}`);
  }
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

// ---- 7c. Staggered "player login": one new adventurer per minute, max 10 ----
console.log('Testing staggered adventurer logins...');
{
  assert(spawnDueAdventurer([], 31).length === 0, 'spawned before the minute was up');
  const one = spawnDueAdventurer([], ADVENTURER_SPAWN_INTERVAL_TICKS);
  assert(one.length === 1 && one[0].location === 'starting-house', 'first login should spawn at the starting house');
  const two = spawnDueAdventurer(one, ADVENTURER_SPAWN_INTERVAL_TICKS * 2);
  assert(two.length === 2 && two[1].id !== two[0].id, 'second login should add a different adventurer');
  // Fill to the cap: no more than MAX_ADVENTURERS ever.
  let roster = [];
  for (let tick = ADVENTURER_SPAWN_INTERVAL_TICKS; tick <= ADVENTURER_SPAWN_INTERVAL_TICKS * 40; tick++) {
    roster = spawnDueAdventurer(roster, tick);
  }
  assert(roster.length === MAX_ADVENTURERS, `expected ${MAX_ADVENTURERS} adventurers, got ${roster.length}`);
  const ids = new Set(roster.map((a) => a.id));
  assert(ids.size === MAX_ADVENTURERS, 'roster has duplicate adventurer ids');
  assert(roster.every((a) => a.className === 'Beginner' && a.level === 1), 'new logins should start as level 1 Beginners');
}

// ---- 7d. Beginners pick a class at level 10 ----
console.log('Testing adventurer class choice at level 10...');
{
  let student = [{ ...initialSimulatedAdventurers[0], location: 'field' as const, level: 10, xp: 27, outing: 'wander' as const, outingTicks: 50 }];
  for (let tick = 0; tick < 5; tick++) {
    student = advanceSimulatedAdventurers(student, tick);
  }
  assert(student[0].className !== 'Beginner', 'level 10 Beginner never chose a class');
  assert(['Mage', 'Warrior', 'Rogue'].includes(student[0].className), `invalid class choice ${student[0].className}`);
}

// ---- 7b. BUG-006 regression: background simulation never mutates loaded goats ----
// Simulated adventurers tick every 1.9s with the player's loaded goats as
// positional targets. They must NEVER change goat HP or disposition — the
// user saw goats "randomly taking damage" across the map. Only the player's
// own attacks may do that (App.tsx no longer applies background damage).
console.log('Testing background adventurers never damage goats...');
{
  const goatTargets = [
    { id: 'g1', position: { x: 20, y: 20 } },
    { id: 'g2', position: { x: 80, y: 80 } },
    { id: 'g3', position: { x: 50, y: 50 } },
  ];
  const snapshot = JSON.stringify(goatTargets);
  let advs = initialSimulatedAdventurers.map((a) => ({ ...a }));
  for (let tick = 0; tick < 2000; tick++) {
    advs = advanceSimulatedAdventurers(advs, tick, goatTargets);
  }
  assert(JSON.stringify(goatTargets) === snapshot, 'advanceSimulatedAdventurers mutated its goat target inputs');
  // Note: adventurers may still show a cosmetic "fighting a goat" activity
  // label as ambient flavor, but the function has no HP/damage channel —
  // goat HP can only change via the player's own attacks (the App-level
  // background damage block was removed).
}

// ---- 8. Map data validation: every settlement landmark must sit on land
// under the REAL default seed (regression test for BUG-001: Stormhaven was
// validated against seed 1 and actually spawned in the ocean). ----
console.log('Testing map landmark placement...');
const REAL_SEED = 847291583;
const mapTiles = generateWorldMap(REAL_SEED, EXPANDED_WORLD_BOUNDS);
const tileByKey = new Map(mapTiles.map((t) => [t.x + ',' + t.y, t]));
const expectedLandmarks: Array<[string, string]> = [
  ['4,7', 'Mosslight Crossing'], ['0,7', 'Fenmere Hamlet'], ['8,7', 'Ironwood Southhold'],
  ['5,2', 'Northwatch Beacon'], ['2,4', 'Old Mill'], ['9,3', 'Emberpeak Shrine'],
  ['3,12', 'Sunwash Port'], ['6,10', 'Bellwater'], ['10,10', 'Seabreak'],
  ['1,3', 'Blackroot Camp'], ['5,-5', 'Frosthold'], ['4,19', 'Dunewatch'],
  ['17,7', 'Eastmarch'], ['-7,7', 'Westhold'],
  ['130,-16', 'Stormhaven'], ['140,-20', 'Frostwatch'], ['155,0', 'Oakfield'],
  ['174,-8', 'Stonebridge'], ['165,25', 'Saltmarsh'], ['184,15', 'Emberhold'],
  ['144,35', 'Dunmere'],
  ['136,-12', 'Sunken Crypt'], ['188,20', 'Ember Ruins'], ['150,6', 'Whispering Stones'],
];
for (const [key, name] of expectedLandmarks) {
  const tile = tileByKey.get(key);
  assert(tile !== undefined, `Landmark ${name} (${key}) has no world tile`);
  // Ocean is the failure mode (impassable water); shore is walkable coastline.
  const notOcean = tile !== undefined && tile.biome !== 'ocean';
  assert(notOcean, `Landmark ${name} (${key}) is on ${tile?.biome ?? 'nothing'}, not land`);
}
// The ocean gap between the home region and the second continent must be water.
for (const [gx, gy] of [[60, 7], [90, -10], [110, 30], [40, 0]] as Array<[number, number]>) {
  const tile = tileByKey.get(gx + ',' + gy);
  assert(tile?.biome === 'ocean', `Ocean gap tile (${gx},${gy}) is ${tile?.biome}, expected ocean`);
}
// The second continent must be a real landmass, far larger than the home region.
let continentLand = 0;
let homeLand = 0;
for (const t of mapTiles) {
  const isLand = t.biome !== 'ocean' && t.biome !== 'shore';
  if (t.x >= 117 && t.x <= 196 && t.y >= -28 && t.y <= 51 && isLand) continentLand++;
  if (t.x >= -10 && t.x <= 20 && t.y >= -8 && t.y <= 22 && isLand) homeLand++;
}
assert(continentLand > homeLand * 3, `Second continent too small: ${continentLand} land tiles vs home ${homeLand}`);

// ---- Cornfields: deterministic clustered harvestable corn ----
// Corn must be deterministic per chunk.
for (let i = 0; i < 200; i++) {
  const chunk = { x: (i * 7) % 31 - 10, y: (i * 13) % 31 - 8 };
  const a = cornStalksForChunk(chunk, 'meadow', () => false);
  const b = cornStalksForChunk(chunk, 'meadow', () => false);
  assert(a.length === b.length && a.every((s, idx) => s.position.x === b[idx].position.x && s.position.y === b[idx].position.y),
    `Cornfield not deterministic for chunk ${chunk.x},${chunk.y}`);
}
// Corn only grows in meadow-like terrain, never scattered in other biomes.
for (const terrain of ['forest', 'tundra', 'desert', 'rock', 'shore', 'ocean']) {
  const stalks = cornStalksForChunk({ x: 5, y: 5 }, terrain, () => false);
  assert(stalks.length === 0, `Corn spawned in ${terrain} terrain (${stalks.length} stalks)`);
}
// When corn spawns, it must be a dense field, not scattered singles:
// dozens of stalks, nearly every one with a neighbor within 6 units.
let clusteredOk = 0;
let clusteredTotal = 0;
let allClustered = true;
for (let i = 0; i < 300; i++) {
  const chunk = { x: (i * 11) % 40 - 10, y: (i * 17) % 40 - 8 };
  const stalks = cornStalksForChunk(chunk, 'meadow', () => false);
  if (stalks.length === 0) continue;
  clusteredTotal++;
  if (stalks.length < 30) { allClustered = false; continue; }
  let lonely = 0;
  for (let a = 0; a < stalks.length; a++) {
    let nearest = Infinity;
    for (let b = 0; b < stalks.length; b++) {
      if (a === b) continue;
      const d = Math.hypot(stalks[a].position.x - stalks[b].position.x, stalks[a].position.y - stalks[b].position.y);
      if (d < nearest) nearest = d;
    }
    if (nearest > 6) lonely++;
  }
  if (lonely === 0) clusteredOk++; else allClustered = false;
}
assert(clusteredTotal > 0, 'No cornfields generated in 300 meadow chunks');
assert(allClustered && clusteredOk === clusteredTotal, `Corn not a dense field: ${clusteredOk}/${clusteredTotal} fields have 30+ stalks all grouped`);
// Blocked positions are skipped (no stalks inside buildings/water).
{
  const blocked = (pos: { x: number; y: number }) => pos.x > 40 && pos.x < 60 && pos.y > 40 && pos.y < 60;
  const stalks = cornStalksForChunk({ x: 4, y: 7 }, 'meadow', blocked);
  const inBlocked = stalks.filter((s) => blocked(s.position));
  assert(inBlocked.length === 0, `${inBlocked.length} corn stalks spawned inside blocked area`);
}

// ---- BUILD 274: debug world editor helpers ----
{
  // Placing stamps objects with rounded coords and unique ids.
  let objects = editorPlaceObject([], 'house', 41.27, 53.24, '4,7');
  assert(objects.length === 1, 'editorPlaceObject did not add');
  assert(objects[0].kind === 'house' && objects[0].x === 41.3 && objects[0].y === 53.2 && objects[0].chunk === '4,7', 'editorPlaceObject coords/kind wrong');
  objects = editorPlaceObject(objects, 'roadH', 60, 70, '4,7');
  assert(objects.length === 2 && objects[0].id !== objects[1].id, 'editorPlaceObject ids not unique');
  // Solids: houses/trees/rocks solid, roads walkable.
  const solids = editorSolidsFor(objects);
  assert(solids.length === 1 && solids[0].w === 13 && solids[0].h === 9, 'editorSolidsFor house footprint wrong');
  assert(editorSolidsFor(editorPlaceObject([], 'roadV', 10, 10, '4,7')).length === 0, 'roads must not be solid');
  assert(editorSolidSize('tree') !== null && editorSolidSize('roadH') === null, 'editorSolidSize kinds wrong');
  // Flag toggle adds then removes.
  const flag = { id: 'gen-tree-4,7-3', kind: 'tree' as const, label: 'tree #3', x: 34.2, y: 51.8, chunk: '4,7' };
  let flags = editorToggleFlag([], flag);
  assert(flags.length === 1, 'editorToggleFlag did not add');
  flags = editorToggleFlag(flags, flag);
  assert(flags.length === 0, 'editorToggleFlag did not remove');
  // Removal list format.
  const list = editorRemovalList([flag]);
  assert(list.includes('tree "tree #3" at (34.2, 51.8) chunk 4,7'), 'editorRemovalList format wrong: ' + list);
  assert(editorRemovalList([]).includes('nothing flagged'), 'editorRemovalList empty wrong');
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
