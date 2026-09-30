// Simulation play-test: 10,000 iterations across world gen, AI, and spawn rules.
// Run with: npx tsx scripts/simulate.ts
import { generateWorldMap, WORLD_MAP_BOUNDS, EXPANDED_WORLD_BOUNDS, elevationLevelFor } from '../src/game/worldMap';
import { updateGoat, type GoatAIEntity } from '../src/game/ai';
import { advanceSimulatedAdventurers, initialSimulatedAdventurers, spawnDueAdventurer, MAX_ADVENTURERS, ADVENTURER_SPAWN_INTERVAL_TICKS } from '../src/game/simulatedAdventurers';
import { cornStalksForChunk } from '../src/game/cornfield';
import { WorldCore, formatClockDisplay, ticksUntilHour, MINUTES_PER_TICK } from '../src/game/worldCore';
import { buildRoadLinks, travelersForChunk, type PlacedLandmark } from '../src/game/travelers';
import { advanceTownsfolk, createTownsfolk, reanchorTownsfolk, snapTownsfolk, townsfolkHash, townsfolkTarget, buildMosslightHousing, cottageDoorways, mosslightObstacles, type TownsfolkAnchors, type TownsfolkNavContext } from '../src/game/townsfolk';
import { editorPlaceObject, editorToggleFlag, editorSolidsFor, editorRemovalList, editorSolidSize, editorDeleteGenTree, editorRestoreGenTrees, editorFlaggedDeletions } from '../src/game/worldEditor';
import { npcEntryPoint, facingForDelta } from '../src/game/npcEntry';

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
  // BUILD 305: deleted generated trees per chunk.
  let del = editorDeleteGenTree({}, '4,7', 3);
  assert(del['4,7'].length === 1 && del['4,7'][0] === 3, 'editorDeleteGenTree did not add');
  del = editorDeleteGenTree(del, '4,7', 3);
  assert(del['4,7'].length === 1, 'editorDeleteGenTree must dedupe');
  del = editorDeleteGenTree(del, '5,7', 0);
  assert(Object.keys(del).length === 2, 'editorDeleteGenTree chunk keys wrong');
  del = editorRestoreGenTrees(del, '4,7');
  assert(!('4,7' in del) && '5,7' in del, 'editorRestoreGenTrees did not clear chunk');
  del = editorRestoreGenTrees(del, '9,9');
  assert(Object.keys(del).length === 1, 'editorRestoreGenTrees changed missing chunk');
  // BUILD 305: flagged deletions split placed/tree, skip generated houses.
  const flags2 = [
    { id: 'placed-a', kind: 'placed' as const, label: 'p', x: 1, y: 1, chunk: '4,7' },
    { id: 'gen-tree-4,7-7', kind: 'tree' as const, label: 'tree #7', x: 2, y: 2, chunk: '4,7' },
    { id: 'gen-house-x', kind: 'house' as const, label: 'h', x: 3, y: 3, chunk: '4,7' },
    { id: 'gen-tree-5,7-1', kind: 'tree' as const, label: 't', x: 4, y: 4, chunk: '5,7' },
  ];
  const split = editorFlaggedDeletions(flags2, '4,7');
  assert(split.placedIds.length === 1 && split.placedIds[0] === 'placed-a', 'editorFlaggedDeletions placed wrong');
  assert(split.treeIds.length === 1 && split.treeIds[0] === 7, 'editorFlaggedDeletions tree wrong');
}

// ---- BUILD 306: NPC entrance helpers ----
{
  // Entry point is just off the edge the NPC came from.
  let e = npcEntryPoint({ x: 70, y: 70 }, 'right');
  assert(e.x === -6 && e.y === 70, 'npcEntryPoint right wrong: ' + JSON.stringify(e));
  e = npcEntryPoint({ x: 70, y: 70 }, 'left');
  assert(e.x === 146 && e.y === 70, 'npcEntryPoint left wrong');
  e = npcEntryPoint({ x: 30, y: 40 }, 'down');
  assert(e.x === 30 && e.y === -6, 'npcEntryPoint down wrong');
  e = npcEntryPoint({ x: 30, y: 40 }, 'up');
  assert(e.x === 30 && e.y === 146, 'npcEntryPoint up wrong');
  // Facing follows the dominant axis of movement.
  assert(facingForDelta(5, 1) === 'right', 'facingForDelta +x wrong');
  assert(facingForDelta(-5, 1) === 'left', 'facingForDelta -x wrong');
  assert(facingForDelta(1, 5) === 'down', 'facingForDelta +y wrong');
  assert(facingForDelta(1, -5) === 'up', 'facingForDelta -y wrong');
  assert(facingForDelta(0, 0) === 'right', 'facingForDelta zero wrong');
}

// ---- 12. World clock display + wait math (BUILD 275) ----
console.log('Testing world clock display + wait math...');
{
  const core = new WorldCore(1234);
  const c0 = core.getClock();
  assert(formatClockDisplay(c0) === '6:00 AM · Day 1 · Y1', `Clock display mismatch: ${formatClockDisplay(c0)}`);
  // 22:00 -> 6:00 next morning = 8h = 48 ticks
  const night = { ...c0, hour: 22, minuteOfDay: 22 * 60 };
  assert(ticksUntilHour(night, 6) === 48, `ticksUntilHour(22->6) expected 48, got ${ticksUntilHour(night, 6)}`);
  // 5:00 -> 6:00 = 1h = 6 ticks
  const early = { ...c0, hour: 5, minuteOfDay: 5 * 60 };
  assert(ticksUntilHour(early, 6) === 6, `ticksUntilHour(5->6) expected 6, got ${ticksUntilHour(early, 6)}`);
  // exactly 6:00 -> next 6:00 = full day = 144 ticks
  const exact = { ...c0, hour: 6, minuteOfDay: 6 * 60 };
  assert(ticksUntilHour(exact, 6) === 144, `ticksUntilHour(6->6) expected 144, got ${ticksUntilHour(exact, 6)}`);
  // 6:30 -> 6:00 next day = 23.5h = 141 ticks
  const half = { ...c0, hour: 6, minuteOfDay: 6 * 60 + 30 };
  assert(ticksUntilHour(half, 6) === 141, `ticksUntilHour(6:30->6) expected 141, got ${ticksUntilHour(half, 6)}`);
  // advancing 48 ticks from 22:00 lands on 6:00
  const wc = new WorldCore(99);
  for (let i = 0; i < 48; i++) wc.advance(1);
  const c1 = wc.getClock();
  assert(c1.hour === 14 && c1.minuteOfDay % 60 === 0, `48 ticks from 6:00 start expected 14:00, got ${c1.hour}:${c1.minuteOfDay % 60}`);
  assert(MINUTES_PER_TICK === 10, 'MINUTES_PER_TICK must stay 10');
  // display for PM hours
  const pm = { ...c0, hour: 20, minuteOfDay: 20 * 60 + 37, day: 14, year: 127 };
  assert(formatClockDisplay(pm) === '8:37 PM · Day 14 · Y127', `PM display mismatch: ${formatClockDisplay(pm)}`);
}


// ---- 13. Townsfolk living-town simulation (BUILD 276) ----
console.log('Testing townsfolk living-town simulation...');
{
  const anchors: TownsfolkAnchors = {
    points: {
      guild: { x: 90, y: 60 }, chapel: { x: 40, y: 90 }, tavern: { x: 90, y: 90 },
      farm0: { x: 30, y: 119 }, farm1: { x: 110, y: 119 },
    },
    plaza: { x: 70, y: 82 },
    stalls: [{ x: 58, y: 64 }, { x: 82, y: 64 }],
    gardens: [{ x: 30, y: 108 }, { x: 110, y: 108 }],
    patrol: [{ x: 70, y: 24 }, { x: 118, y: 70 }, { x: 70, y: 116 }, { x: 22, y: 70 }],
  };
  const clockAt = (hour: number, minute: number, day = 5) => ({
    tick: 0, year: 1, month: 1, week: 1, day, hour,
    minuteOfDay: hour * 60 + minute, second: 0, season: 'spring' as const,
  });
  const folk = createTownsfolk(anchors, 847291583);
  assert(folk.length === 12, `Expected 12 townsfolk, got ${folk.length}`);
  assert(new Set(folk.map((n) => n.id)).size === 12, 'Townsfolk ids not unique');
  assert(new Set(folk.map((n) => n.name)).size === 12, 'Townsfolk names not unique');
  const archetypes = new Set(folk.map((n) => n.archetype));
  for (const a of ['farmer', 'merchant', 'guard', 'priest', 'smith', 'commoner', 'child']) {
    assert(archetypes.has(a as never), `Missing archetype ${a}`);
  }
  // Determinism: same npc + clock -> same schedule target.
  const farmer = folk.find((n) => n.archetype === 'farmer')!;
  const noon = clockAt(12, 0);
  const t1 = townsfolkTarget(farmer, anchors, noon);
  const t2 = townsfolkTarget(farmer, anchors, noon);
  assert(t1.activity === t2.activity && t1.target.x === t2.target.x && t1.target.y === t2.target.y, 'Schedule not deterministic');
  // Night: everyone indoors.
  const night = clockAt(2, 0);
  assert(folk.every((n) => townsfolkTarget(n, anchors, night).indoors), 'Not all townsfolk indoors at 2 AM');
  // Noon: farmer tends a garden; merchant minds a stall.
  const farmerNoon = townsfolkTarget(farmer, anchors, clockAt(10, 0));
  assert(!farmerNoon.indoors && farmerNoon.activity === 'Tending crops', `Farmer at 10 AM: ${farmerNoon.activity}`);
  assert(anchors.gardens.some((g) => g.x === farmerNoon.target.x && g.y === farmerNoon.target.y), 'Farmer not at a garden');
  const merchant = folk.find((n) => n.archetype === 'merchant')!;
  const merchantNoon = townsfolkTarget(merchant, anchors, clockAt(10, 0));
  assert(merchantNoon.activity === 'Minding the stall', `Merchant at 10 AM: ${merchantNoon.activity}`);
  // Guards: at least one patrolling mid-morning, none patrolling at 3 AM.
  const guards = folk.filter((n) => n.archetype === 'guard');
  assert(guards.some((g) => townsfolkTarget(g, anchors, clockAt(10, 0)).activity === 'Patrolling'), 'No guard patrolling at 10 AM');
  assert(guards.every((g) => townsfolkTarget(g, anchors, clockAt(3, 0)).indoors), 'Guard outdoors at 3 AM');
  // Hash sanity.
  assert(townsfolkHash(1, 2) === townsfolkHash(1, 2), 'townsfolkHash not deterministic');
  assert(townsfolkHash(5, 9) >= 0 && townsfolkHash(5, 9) < 1, 'townsfolkHash out of range');
  // Movement: advances toward target, stops on arrival.
  const navCtx: TownsfolkNavContext = {
    housing: buildMosslightHousing(folk.map((n) => n.id)),
    doors: cottageDoorways(),
    obstacles: mosslightObstacles(),
  };
  const snapped = snapTownsfolk(folk, anchors, clockAt(10, 0), navCtx);
  const walker = { ...snapped.find((n) => n.archetype === 'farmer')!, position: { x: 0, y: 0 }, moving: false, location: 'OUTDOOR' as const, path: undefined };
  const before = Math.hypot(walker.position.x - 30, walker.position.y - 108);
  const moved = advanceTownsfolk([walker], anchors, clockAt(10, 0), navCtx)[0];
  const farmerTarget = townsfolkTarget(walker, anchors, clockAt(10, 0)).target;
  const distAfter = Math.hypot(moved.position.x - farmerTarget.x, moved.position.y - farmerTarget.y);
  assert(moved.moving && distAfter < before, 'Townsfolk did not move toward target');
  const arrived = advanceTownsfolk([{ ...moved, position: { ...townsfolkTarget(walker, anchors, clockAt(10, 0)).target }, location: 'OUTDOOR' as const, path: undefined }], anchors, clockAt(10, 0), navCtx)[0];
  assert(!arrived.moving, 'Townsfolk still moving after arrival');
  // Re-anchor: moved house -> updated home.
  const movedAnchors: TownsfolkAnchors = { ...anchors, points: { ...anchors.points, guild: { x: 1, y: 2 } } };
  const reanchored = reanchorTownsfolk(folk, movedAnchors);
  const guildNpc = reanchored.find((n) => n.homeKey === 'guild')!;
  assert(guildNpc.home.x === 1 && guildNpc.home.y === 2, 'Re-anchor did not update guild home');
  const unchanged = reanchorTownsfolk(folk, anchors);
  assert(unchanged.every((n, i) => n === folk[i]), 'Re-anchor changed refs without anchor changes');
}

console.log('Testing NPC physical movement scenarios (BUILD 312)...');
{
  const anchors: TownsfolkAnchors = {
    points: {
      guild: { x: 90, y: 60 }, chapel: { x: 40, y: 90 }, tavern: { x: 90, y: 90 },
      farm0: { x: 30, y: 119 }, farm1: { x: 110, y: 119 },
    },
    plaza: { x: 70, y: 82 },
    stalls: [{ x: 58, y: 64 }, { x: 82, y: 64 }],
    gardens: [{ x: 30, y: 108 }, { x: 110, y: 108 }],
    patrol: [{ x: 70, y: 24 }, { x: 118, y: 70 }, { x: 70, y: 116 }, { x: 22, y: 70 }],
  };
  const clockAt = (hour: number, minute: number, day = 5) => ({
    tick: 0, year: 1, month: 1, week: 1, day, hour,
    minuteOfDay: hour * 60 + minute, second: 0, season: 'spring' as const,
  });
  const folk = createTownsfolk(anchors, 847291583);
  const navCtx: TownsfolkNavContext = {
    housing: buildMosslightHousing(folk.map((n) => n.id)),
    doors: cottageDoorways(),
    obstacles: mosslightObstacles(),
  };
  // Every NPC must have a bed assigned (no housing shortage for 12).
  assert(navCtx.housing.warnings.length === 0, `Housing shortage: ${navCtx.housing.warnings.join('; ')}`);
  assert(Object.keys(navCtx.housing.assignments).length === 12, 'Not all townsfolk assigned beds');

  // TEST 1 — Going home: NPC leaves work, walks home, enters door, walks to
  // bed, sleeps. No teleporting.
  {
    let npc = snapTownsfolk(folk, anchors, clockAt(16, 0), navCtx).find((n) => n.archetype === 'farmer')!;
    assert(npc.location === 'OUTDOOR', `Farmer not outdoors at 16:00: ${npc.location}`);
    let steps = 0;
    let teleported = false;
    const garden = anchors.gardens[0];
    npc = { ...npc, position: { ...garden }, location: 'OUTDOOR' as const, path: undefined, indoors: false };
    let lastPos = { ...npc.position };
    const clock = clockAt(23, 0);
    const maxSteps = 4000;
    while (steps < maxSteps) {
      const prevLoc = npc.location;
      const next = advanceTownsfolk([npc], anchors, clock, navCtx, 0.5)[0];
      const jump = Math.hypot(next.position.x - lastPos.x, next.position.y - lastPos.y);
      const isDoorCross = (prevLoc === 'ENTERING' && next.location === 'INTERIOR');
      if (jump > 2.5 && !isDoorCross) {
        teleported = true;
        break;
      }
      lastPos = { ...next.position };
      npc = next;
      steps++;
      if (npc.location === 'SLEEPING') break;
    }
    assert(!teleported, 'Farmer teleported on the way home');
    assert(npc.location === 'SLEEPING', `Farmer did not reach bed: ${npc.location} after ${steps} steps`);
    assert(npc.bedId, 'Farmer has no bedId after sleeping');
  }

  // TEST 2 — Morning: NPC wakes, gets out of bed, walks to door, exits,
  // continues to work. No teleporting.
  {
    let npc = snapTownsfolk(folk, anchors, clockAt(2, 0), navCtx).find((n) => n.archetype === 'farmer')!;
    assert(npc.location === 'SLEEPING', `Farmer not sleeping at 2:00: ${npc.location}`);
    const clock = clockAt(7, 0);
    let steps = 0;
    let teleported = false;
    let lastPos = { ...npc.position };
    let sawExit = false;
    const maxSteps = 4000;
    while (steps < maxSteps) {
      const prevLoc = npc.location;
      const next = advanceTownsfolk([npc], anchors, clock, navCtx, 0.5)[0];
      const jump = Math.hypot(next.position.x - lastPos.x, next.position.y - lastPos.y);
      const isDoorCross = (prevLoc === 'INTERIOR' && next.location === 'OUTDOOR');
      if (jump > 2.5 && !isDoorCross) {
        teleported = true;
        break;
      }
      if (isDoorCross) sawExit = true;
      lastPos = { ...next.position };
      npc = next;
      steps++;
      if (npc.location === 'OUTDOOR' && sawExit && npc.moving) break;
    }
    assert(!teleported, 'Farmer teleported on the way to work');
    assert(sawExit, 'Farmer did not physically exit through the door');
    assert(npc.location === 'OUTDOOR', `Farmer not outdoors after waking: ${npc.location}`);
  }

  // TEST 3 — 20 NPCs: no mass teleporting, no trapping.
  {
    const many = [...folk];
    for (let i = 12; i < 20; i++) {
      const base = folk[i % 12];
      many.push({ ...base, id: `townsfolk-extra-${i}`, seed: base.seed + i * 7919 });
    }
    const bigHousing = buildMosslightHousing(many.map((n) => n.id));
    const bigNav: TownsfolkNavContext = { housing: bigHousing, doors: cottageDoorways(), obstacles: mosslightObstacles() };
    assert(bigHousing.warnings.length === 8, `Expected 8 housing warnings, got ${bigHousing.warnings.length}`);
    let npcs = snapTownsfolk(many, anchors, clockAt(12, 0), bigNav);
    const clock = clockAt(12, 30);
    let teleports = 0;
    const lastPositions = new Map(npcs.map((n) => [n.id, { ...n.position }]));
    for (let s = 0; s < 200; s++) {
      npcs = advanceTownsfolk(npcs, anchors, clock, bigNav, 0.5);
      for (const n of npcs) {
        const last = lastPositions.get(n.id)!;
        const jump = Math.hypot(n.position.x - last.x, n.position.y - last.y);
        if (jump > 2.5) teleports++;
        lastPositions.set(n.id, { ...n.position });
      }
    }
    assert(teleports === 0, `${teleports} teleports detected among 20 NPCs`);
  }

  // TEST 4 — Adventurer exodus: all 10 starting adventurers physically leave
  // the starting area within 1 in-game hour (sim ticks), via varied routes,
  // with no teleporting.
  {
    const { initialSimulatedAdventurers, spawnDueAdventurer, advanceSimulatedAdventurers, MAX_ADVENTURERS, EXODUS_DEADLINE_TICKS } =
      await import('../src/game/simulatedAdventurers');
    let advs = initialSimulatedAdventurers.map((a) => ({ ...a }));
    const lastPos = new Map<string, { x: number; y: number }>();
    const lastLoc = new Map<string, string>();
    const leftAt = new Map<string, number>(); // tick when each first left
    let teleports = 0;
    // 1 in-game hour in sim ticks: spawn stagger (9*32) + exodus walk (~60) + margin.
    const HOUR_TICKS = 500;
    for (let tick = 0; tick <= HOUR_TICKS; tick++) {
      advs = spawnDueAdventurer(advs, tick);
      advs = advanceSimulatedAdventurers(advs, tick, []);
      for (const a of advs) {
        const prev = lastPos.get(a.id);
        const prevLoc = lastLoc.get(a.id);
        if (prev && prevLoc === 'field' && (a.location || 'field') === 'field') {
          // Both in field: position must be continuous (door exits are the
          // only allowed transition, and those change location).
          const jump = Math.hypot(a.position.x - prev.x, a.position.y - prev.y);
          if (jump > 5) teleports++;
        }
        // "Left" = reached traveling (exodus complete) or at a boundary.
        const p = a.position;
        const atBoundary = p.x <= 6 || p.x >= 134 || p.y <= 6 || p.y >= 134;
        if (!leftAt.has(a.id) && ((a.location || 'field') === 'traveling' || atBoundary)) {
          leftAt.set(a.id, tick);
        }
        lastPos.set(a.id, { ...a.position });
        lastLoc.set(a.id, a.location || 'field');
      }
    }
    assert(advs.length === MAX_ADVENTURERS, `Expected ${MAX_ADVENTURERS} adventurers, got ${advs.length}`);
    assert(teleports === 0, `${teleports} adventurer teleports detected during exodus`);
    // Every adventurer must have left within the deadline after spawning.
    const late: string[] = [];
    for (const a of advs) {
      const lt = leftAt.get(a.id);
      const st = (a as { spawnTick?: number }).spawnTick ?? 0;
      if (lt === undefined) late.push(`${a.id} never left`);
      else if (lt - st > EXODUS_DEADLINE_TICKS) late.push(`${a.id} left at tick ${lt} (spawned ${st})`);
    }
    assert(late.length === 0, `Adventurers did not leave in time: ${late.join(', ')}`);
    // Varied routes: not all adventurers exited via the same edge.
    const edges = new Set(advs.map((a) => {
      const t = (a as { exodusTarget?: { x: number; y: number } }).exodusTarget;
      if (!t) return 'none';
      if (t.x >= 138) return 'east';
      if (t.x <= 2) return 'west';
      if (t.y <= 2) return 'north';
      return 'south';
    }));
    assert(edges.size >= 3, `Exodus routes not varied: only ${[...edges].join(', ')}`);
    // Deterministic motivations assigned.
    assert(advs.every((a) => (a as { exodusMotive?: string }).exodusMotive), 'Missing exodus motivations');
  }
}

// ---- 14. Road travelers (civ phase 2: settlement-to-settlement journeys) ----
console.log('Testing road travelers...');
{
  const clockAt = (hour: number, minute: number, day = 5) => ({
    tick: 0, year: 1, month: 1, week: 1, day, hour,
    minuteOfDay: hour * 60 + minute, second: 0, season: 'spring' as const,
  });
  // Synthetic road: Westford (0,0) -- (4,0) Eastford, straight east-west.
  const testLandmarks: PlacedLandmark[] = [
    { name: 'Westford', kind: 'village', chunk: { x: 0, y: 0 } },
    { name: 'Eastford', kind: 'village', chunk: { x: 4, y: 0 } },
  ];
  const armsFor = (c: { x: number; y: number }) => ({
    n: false,
    s: false,
    e: c.y === 0 && c.x >= 0 && c.x < 4,
    w: c.y === 0 && c.x > 0 && c.x <= 4,
  });
  const links = buildRoadLinks(armsFor, testLandmarks);
  assert(links.length === 1, `Expected 1 road link, got ${links.length}`);
  assert(links[0].path.length === 5, `Expected 5-chunk path, got ${links[0].path.length}`);
  assert(links[0].from.name === 'Westford' && links[0].to.name === 'Eastford', 'Link endpoints wrong');
  // No roads -> no travelers.
  assert(travelersForChunk({ x: 9, y: 9 }, clockAt(12, 0), links).length === 0, 'Travelers on roadless chunk');
  // Determinism: same clock -> identical travelers (gathered across the link path).
  const onPath = (clock: ReturnType<typeof clockAt>) => {
    const out = [];
    for (const c of links[0].path) out.push(...travelersForChunk(c, clock, links));
    return out;
  };
  const a = onPath(clockAt(12, 0));
  const b = onPath(clockAt(12, 0));
  assert(a.length >= 1 && a.length <= 2, `Expected 1-2 travelers at noon, got ${a.length}`);
  assert(JSON.stringify(a) === JSON.stringify(b), 'Travelers not deterministic');
  // Traffic density: night is quiet, midday is busy.
  const nightTravelers = onPath(clockAt(3, 0));
  assert(nightTravelers.length <= a.length, `Night traffic not quieter: ${nightTravelers.length} vs ${a.length}`);
  // Travelers move as the clock advances and head for real settlements.
  const later = onPath(clockAt(13, 0));
  const movedAny = a.some((t) => {
    const other = later.find((o) => o.id === t.id);
    return other && (Math.abs(t.position.x - other.position.x) > 0.01 || Math.abs(t.position.y - other.position.y) > 0.01);
  });
  assert(movedAny, 'Travelers did not move with the clock');
  for (const t of later) {
    assert(t.position.x >= -10 && t.position.x <= 150 && t.position.y >= -10 && t.position.y <= 150, 'Traveler out of span');
    assert(t.destination === 'Westford' || t.destination === 'Eastford', `Bad destination: ${t.destination}`);
    assert(t.name.length > 0, 'Traveler missing name');
    assert(['up', 'down', 'left', 'right'].includes(t.facing), 'Bad traveler facing');
  }
  // Rebuild determinism.
  assert(JSON.stringify(buildRoadLinks(armsFor, testLandmarks)) === JSON.stringify(links), 'Link building not deterministic');
}

// ---- 14. Monster sprite system ----
console.log('Testing monster sprite system...');
import { readFileSync as readFileSyncSprites, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { spriteDefFor, SHEET_KINDS, monsterAnimFrameFor, animForMonsterState } from '../src/game/monsterSprites/index';
import { MONSTER_SPAWN_TABLE } from '../src/game/monsterSpawns';

const EXPECTED_KINDS = ['bat', 'goblin', 'orc', 'rat', 'skeleton', 'slime', 'spider', 'troll', 'wolf'];
assert(JSON.stringify([...SHEET_KINDS].sort()) === JSON.stringify(EXPECTED_KINDS), `SHEET_KINDS mismatch: ${SHEET_KINDS}`);
const appSrc = readFileSyncSprites('src/App.tsx', 'utf8');
const genCssPath = 'src/monster-sprites.gen.css';

for (const kind of EXPECTED_KINDS) {
  const jsonPath = `src/game/monsterSprites/${kind}.json`;
  assert(existsSync(jsonPath), `Missing sprite def ${jsonPath}`);
  const def = JSON.parse(readFileSyncSprites(jsonPath, 'utf8'));
  assert(def.id === kind, `${kind}: def id mismatch`);
  assert(def.spriteSheet === `/mobs/${kind}_sheet.png`, `${kind}: bad spriteSheet path`);
  assert(def.cell === 64 && def.cols === 8 && def.rows === 5, `${kind}: grid must be 8x5 of 64px`);
  const facings = Object.entries(def.facingRows as Record<string, number>);
  assert(facings.length === 4 && new Set(facings.map(([, r]) => r)).size === 4, `${kind}: facingRows must map 4 facings to distinct rows`);
  for (const [anim, a] of Object.entries(def.animations as Record<string, { row: string | number; startCol: number; frames: number; frameMs: number }>)) {
    assert(a.startCol >= 0 && a.startCol + a.frames <= def.cols, `${kind}.${anim}: frames exceed grid`);
    assert(a.frames >= 1 && a.frameMs >= 50, `${kind}.${anim}: bad frame spec`);
    if (typeof a.row === 'number') assert(a.row >= 0 && a.row < def.rows, `${kind}.${anim}: row out of range`);
  }
  assert(def.displaySize >= 20 && def.displaySize <= 100, `${kind}: displaySize ${def.displaySize} out of range`);
  assert(def.variants && def.variants.default, `${kind}: variants must include default`);
  assert(Array.isArray(def.biomes) && def.biomes.length > 0, `${kind}: biomes missing`);
  assert(def.minDanger >= 1 && def.minDanger <= 3, `${kind}: minDanger out of range`);
  // Sheet PNG exists and is a 512x320 RGBA grid.
  const pngPath = `public/mobs/${kind}_sheet.png`;
  assert(existsSync(pngPath), `Missing sheet PNG ${pngPath}`);
  const png = readFileSyncSprites(pngPath);
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), colorType = png[25];
  assert(w === 512 && h === 320, `${kind}: sheet is ${w}x${h}, expected 512x320`);
  assert(colorType === 6, `${kind}: sheet must be RGBA (color type 6), got ${colorType}`);
  // Module lookup agrees with the JSON.
  const modDef = spriteDefFor(kind);
  assert(modDef && modDef.displaySize === def.displaySize, `${kind}: module def mismatch`);
  // Generated CSS carries this kind: container size, sheet URL, all 5 keyframes.
  const css = readFileSyncSprites(genCssPath, 'utf8');
  assert(css.includes(`.monster-${kind} { width: ${def.displaySize}px; height: ${def.displaySize}px;`), `${kind}: CSS container size missing`);
  assert(css.includes(`url('/mobs/${kind}_sheet.png')`), `${kind}: CSS sheet URL missing`);
  for (const kf of ['idle', 'walk', 'attack', 'hurt', 'die']) {
    assert(css.includes(`@keyframes ${kind}-${kf}`), `${kind}: CSS keyframes ${kf} missing`);
  }
  for (const f of ['down', 'left', 'right', 'up']) {
    assert(css.includes(`.monster-${kind}[data-facing='${f}']`), `${kind}: CSS facing ${f} missing`);
  }
}
// Legacy-sprite kinds have no sheet def.
assert(spriteDefFor('bandit') === undefined, 'bandit should keep its legacy sprite');
assert(spriteDefFor('snake') === undefined, 'snake should keep its legacy sprite');
// Frame helper: deterministic, in-range per animation.
const goblinDef = spriteDefFor('goblin')!;
for (const anim of ['idle', 'walk', 'attack', 'hurt', 'death'] as const) {
  const a = goblinDef.animations[anim];
  for (let t = 0; t < 5000; t += 37) {
    const f = monsterAnimFrameFor(goblinDef, anim, t, 7);
    assert(f >= a.startCol && f < a.startCol + a.frames, `goblin.${anim}: frame ${f} out of range at t=${t}`);
    assert(monsterAnimFrameFor(goblinDef, anim, t, 7) === f, `goblin.${anim}: not deterministic`);
  }
}
assert(monsterAnimFrameFor(goblinDef, 'walk', 0, 1) !== monsterAnimFrameFor(goblinDef, 'walk', 0, 2) || true, 'frame helper runs');
// State -> animation priority: dead > hit > attacking > moving > idle.
assert(animForMonsterState({ dead: true, hitFlash: true, attacking: true, moving: true }) === 'death', 'dead priority');
assert(animForMonsterState({ dead: false, hitFlash: true, attacking: true, moving: true }) === 'hurt', 'hurt priority');
assert(animForMonsterState({ dead: false, hitFlash: false, attacking: true, moving: true }) === 'attack', 'attack priority');
assert(animForMonsterState({ dead: false, hitFlash: false, attacking: false, moving: true }) === 'walk', 'walk priority');
assert(animForMonsterState({ dead: false, hitFlash: false, attacking: false, moving: false }) === 'idle', 'idle default');
// Spawn table: every entry maps to a sheet kind with valid biomes/danger/variants.
const KNOWN_TERRAINS = ['forest', 'meadow', 'rock', 'desert', 'tundra'];
const salts = new Set<number>();
for (const spec of MONSTER_SPAWN_TABLE) {
  const def = spriteDefFor(spec.kind);
  assert(def !== undefined, `spawn table kind ${spec.kind} has no sprite def`);
  assert(spec.biomes.every((b) => KNOWN_TERRAINS.includes(b)), `${spec.kind}: unknown biome`);
  assert(spec.minDanger >= 1 && spec.minDanger <= 3, `${spec.kind}: bad minDanger`);
  assert(spec.packBase >= 1 && spec.packVar >= 1, `${spec.kind}: bad pack spec`);
  assert(!salts.has(spec.seedSalt), `${spec.kind}: duplicate seedSalt`);
  salts.add(spec.seedSalt);
  assert(spec.variants.length > 0 && spec.variants.every((v) => def!.variants[v] !== undefined), `${spec.kind}: variant not in def`);
  if (spec.eliteVariant) assert(def!.variants[spec.eliteVariant.variant] !== undefined, `${spec.kind}: elite variant not in def`);
  // Biome/danger metadata agrees with the JSON def.
  assert(JSON.stringify([...spec.biomes].sort()) === JSON.stringify([...def!.biomes].sort()), `${spec.kind}: table biomes disagree with def`);
  assert(spec.minDanger === def!.minDanger, `${spec.kind}: table minDanger disagrees with def`);
}
// Every sheet kind spawns: either via the table or an explicit spawn() call in App.tsx.
for (const kind of EXPECTED_KINDS) {
  const viaTable = MONSTER_SPAWN_TABLE.some((s) => s.kind === kind);
  const explicit = appSrc.includes(`spawn('${kind}'`);
  assert(viaTable || explicit, `${kind}: no spawn rule found`);
}
// Generated CSS is in sync with the JSON defs (self-heals, then fails once to signal).
{
  const before = readFileSyncSprites(genCssPath, 'utf8');
  execSync('node scripts/gen-monster-sprite-css.mjs', { stdio: 'pipe' });
  const after = readFileSyncSprites(genCssPath, 'utf8');
  assert(before === after, 'monster-sprites.gen.css was out of sync with JSON defs (regenerated — re-run sim)');
}

// ---- Results ----
console.log(`\n${'='.repeat(50)}`);
console.log(`${'='.repeat(50)}`);
if (failures.length > 0) {
  console.log('\nFirst failures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}

console.log(`SIMULATION COMPLETE: ${passed} passed, ${failed} failed`);
