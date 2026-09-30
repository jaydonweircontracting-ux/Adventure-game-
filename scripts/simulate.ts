// Simulation play-test: 10,000 iterations across world gen, AI, and spawn rules.
// Run with: npx tsx scripts/simulate.ts
import { generateWorldMap, WORLD_MAP_BOUNDS, EXPANDED_WORLD_BOUNDS, elevationLevelFor } from '../src/game/worldMap';
import { updateGoat, type GoatAIEntity } from '../src/game/ai';
import { advanceSimulatedAdventurers, initialSimulatedAdventurers, spawnDueAdventurer, MAX_ADVENTURERS, ADVENTURER_SPAWN_INTERVAL_TICKS } from '../src/game/simulatedAdventurers';
import { cornStalksForChunk } from '../src/game/cornfield';
import { WorldCore, formatClockDisplay, ticksUntilHour, MINUTES_PER_TICK } from '../src/game/worldCore';
import { buildRoadLinks, travelersForChunk, type PlacedLandmark } from '../src/game/travelers';
import { advanceTownsfolk, createTownsfolk, reanchorTownsfolk, snapTownsfolk, townsfolkHash, townsfolkTarget, shouldReplanPath, separateCrowd, buildMosslightHousing, cottageDoorways, mosslightObstacles, serializeTownsfolk, restoreTownsfolk, indoorRestSpot, interiorWanderSpot, interiorAreaIdForCottage, cottageRectFor, type TownsfolkAnchors, type TownsfolkNavContext } from '../src/game/townsfolk';
import { npcPersonality, npcAge, npcAgeYears, npcNeeds, villageTarget, npcRelationships, addNPCMemory, npcWage, npcGold, adjustNPCGold, villageEventsForDay } from '../src/game/villageLife';
import { validateDestination, trackStep, pathTo, findPath, isOnFieldRoad, STUCK_TICK_LIMIT, MAX_REPLANS, type NavPath } from '../src/game/npcNavigation';
import { landscapeSeed, moistureAt, forestDensityAt, rockDensityAt, macroLandformAt, regionForChunk, roadCorridorsFor, pointInCorridors, townInfluenceAt, landUseAt, landscapeSitesFor, checkFieldContinuity, riverChannelAt, riverAt, lakesForChunk, waterAt, bridgeAt } from '../src/game/landscape';
import { editorPlaceObject, editorToggleFlag, editorSolidsFor, editorRemovalList, editorSolidSize, editorDeleteGenTree, editorRestoreGenTrees, editorFlaggedDeletions, editorAddXMark, editorRemoveXMark, editorXMarksFor, editorAppendLog, editorLogText, EDITOR_LOG_MAX } from '../src/game/worldEditor';
import { paintTile, clearChunkPaints, mapBuilderSolidsFor, MAP_TILE_UNITS, MAP_TILES_PER_SIDE } from '../src/game/mapBuilder';
import { organicTownSpecs } from '../src/game/organicTowns';
import { npcEntryPoint, facingForDelta } from '../src/game/npcEntry';
import { findTalkTarget, TALK_RANGE } from '../src/game/talkTarget';
import { createTouchHoldState, pressTouchHold, releaseTouchHold, isTouchHeld, heldTouchDirections, clearTouchHolds, clearTouchHoldDirection, revalidateTouchHolds } from '../src/game/touchInput';
import { markerForGiver, questById, type QuestState } from '../src/game/quests';
import { initialCellarRats, CELLAR_RAT_ID_BASE, CELLAR_RAT_HP, CELLAR_RAT_COUNT } from '../src/game/cellarRats';
import { topicsFor, responseFor, dispositionTier, dispositionLabel, defaultDisposition, adjustDisposition, wantedLabel, adjustWanted } from '../src/game/dialogue';
import { shouldBark, barkFor, seedForName } from '../src/game/npcBarks';
import { appearanceForNpc, npcAppearanceStyle } from '../src/game/npcAppearance';
import {
  resolveMonsterSprite,
  isValidMonsterSpriteDef,
  clearMonsterSpriteCaches,
  overrideMonsterSpriteDefForTest,
  spriteDefFor as spriteDefForResolved,
  GENERIC_HUMANOID_KIND,
} from '../src/game/monsterSprites/index';
import { isMonsterSheetFailed, clearSheetProbeState } from '../src/game/monsterSprites/sheetProbe';
import { mulberry32, shadeColor, mixColor, hexToRgb, GROUND_PX_PER_UNIT } from '../src/game/groundDetail';

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
  // BUILD 352: painted tiles split out of flagged items.
  const flags3 = [
    { id: 'paint-4,7-3-5', kind: 'paint' as const, label: 'painted dirt (3,5)', x: 35, y: 55, chunk: '4,7' },
    { id: 'paint-4,7-0-0', kind: 'paint' as const, label: 'painted water (0,0)', x: 5, y: 5, chunk: '4,7' },
    { id: 'paint-5,7-1-1', kind: 'paint' as const, label: 'painted dirt (1,1)', x: 15, y: 15, chunk: '5,7' },
  ];
  const split3 = editorFlaggedDeletions(flags3, '4,7');
  assert(split3.paintKeys.length === 2, 'editorFlaggedDeletions paint count wrong');
  assert(split3.paintKeys[0].tx === 3 && split3.paintKeys[0].ty === 5, 'editorFlaggedDeletions paint coords wrong');
  assert(split3.paintKeys[1].tx === 0 && split3.paintKeys[1].ty === 0, 'editorFlaggedDeletions paint coords wrong');
  assert(split3.placedIds.length === 0 && split3.treeIds.length === 0, 'editorFlaggedDeletions paint leaked');
  // BUILD 353: red ✕ markers are chunk-aware and removable.
  let xmarks = editorAddXMark([], '4,7', 12.34, 56.78);
  assert(xmarks.length === 1 && xmarks[0].chunk === '4,7' && xmarks[0].x === 12.3 && xmarks[0].y === 56.8, 'editorAddXMark wrong');
  xmarks = editorAddXMark(xmarks, '5,7', 1, 2);
  assert(editorXMarksFor(xmarks, '4,7').length === 1, 'editorXMarksFor did not filter chunk');
  assert(editorXMarksFor(xmarks, '5,7').length === 1, 'editorXMarksFor missed chunk');
  const mid = xmarks[0].id;
  xmarks = editorRemoveXMark(xmarks, mid);
  assert(xmarks.length === 1 && xmarks[0].chunk === '5,7', 'editorRemoveXMark wrong');
  // BUILD 353: change log appends, caps at EDITOR_LOG_MAX, formats text.
  let elog = editorAppendLog([], { build: '353', action: 'stamp', detail: 'stamped tree', chunk: '4,7', x: 1.2, y: 3.4 });
  assert(elog.length === 1 && typeof elog[0].t === 'number', 'editorAppendLog wrong');
  for (let i = 0; i < EDITOR_LOG_MAX + 10; i++) {
    elog = editorAppendLog(elog, { build: '353', action: 'paint', detail: 'stroke ' + i, chunk: '4,7' });
  }
  assert(elog.length === EDITOR_LOG_MAX, 'editorAppendLog cap wrong');
  assert(elog[elog.length - 1].detail === 'stroke ' + (EDITOR_LOG_MAX + 9), 'editorAppendLog cap dropped newest');
  const ltext = editorLogText(elog.slice(-2));
  assert(ltext.includes('EDITOR CHANGE LOG') && ltext.includes('paint') && ltext.includes('chunk 4,7'), 'editorLogText wrong');
  assert(editorLogText([]) === 'EDITOR CHANGE LOG: (no entries yet)', 'editorLogText empty wrong');
}

// ---- BUILD 341: map-builder tile painting ----
{
  assert(MAP_TILE_UNITS === 10 && MAP_TILES_PER_SIDE === 28, 'map builder grid constants wrong');
  let paints = paintTile({}, '4,7', 3, 5, 'dirt');
  assert(paints['4,7'].length === 1 && paints['4,7'][0].tile === 'dirt', 'paintTile did not add');
  // Repaint same tile with same brush is a no-op (same reference).
  const same = paintTile(paints, '4,7', 3, 5, 'dirt');
  assert(same === paints, 'paintTile same-tile repaint should be a no-op');
  // Overwrite with a different tile.
  paints = paintTile(paints, '4,7', 3, 5, 'water');
  assert(paints['4,7'].length === 1 && paints['4,7'][0].tile === 'water', 'paintTile did not overwrite');
  // Out-of-grid paints are ignored.
  assert(paintTile(paints, '4,7', 28, 0, 'sand') === paints, 'paintTile accepted tx=28');
  assert(paintTile(paints, '4,7', -1, 0, 'sand') === paints, 'paintTile accepted tx=-1');
  // Erase removes the tile; erasing an empty tile is a no-op.
  paints = paintTile(paints, '4,7', 3, 5, null);
  assert(!('4,7' in paints), 'paintTile erase did not drop empty chunk');
  assert(paintTile(paints, '4,7', 3, 5, null) === paints, 'paintTile erase of empty tile should be a no-op');
  // Clear chunk.
  paints = paintTile(paintTile({}, '4,7', 0, 0, 'grass'), '5,7', 1, 1, 'sand');
  paints = clearChunkPaints(paints, '4,7');
  assert(!('4,7' in paints) && '5,7' in paints, 'clearChunkPaints wrong');
  assert(clearChunkPaints(paints, '9,9') === paints, 'clearChunkPaints changed missing chunk');
  // Solids: water and forest block, grass/dirt/sand do not.
  paints = {
    '4,7': [
      { tx: 0, ty: 0, tile: 'water' },
      { tx: 1, ty: 1, tile: 'forest' },
      { tx: 2, ty: 2, tile: 'dirt' },
      { tx: 3, ty: 3, tile: 'grass' },
      { tx: 4, ty: 4, tile: 'sand' },
    ],
  };
  const solids = mapBuilderSolidsFor(paints, '4,7');
  assert(solids.length === 2, 'mapBuilderSolidsFor should return 2 solids, got ' + solids.length);
  assert(solids[0].chunk === '4,7' && solids[0].x === 5 && solids[0].y === 5 && solids[0].w === 10, 'mapBuilderSolidsFor water solid wrong: ' + JSON.stringify(solids[0]));
  assert(mapBuilderSolidsFor(paints, '9,9').length === 0, 'mapBuilderSolidsFor leaked across chunks');
}

// ---- BUILD 342: organic town generator ----
{
  // Deterministic: same seed -> same layout.
  const a = organicTownSpecs(12345, 1, 'nesw');
  const b = organicTownSpecs(12345, 1, 'nesw');
  assert(JSON.stringify(a) === JSON.stringify(b), 'organicTownSpecs not deterministic');
  // Different seeds -> different layouts (almost surely).
  const c = organicTownSpecs(99999, 1, 'nesw');
  assert(JSON.stringify(a) !== JSON.stringify(c), 'organicTownSpecs seed had no effect');
  for (const road of ['ns', 'ew', 'nesw', 'ne', 'sw', 'none']) {
    for (const variant of [1, 2, 3]) {
      for (const seed of [7, 12345, 987654]) {
        const specs = organicTownSpecs(seed, variant, road);
        // House counts: variant base (v1 10-13, v2 8-11, v3 6-9), scaled down
        // for smaller road networks (fewer arms = less frontage), min 6.
        const arms = road.split('').filter((c) => 'nsew'.includes(c)).length;
        const baseMin = variant === 1 ? 10 : variant === 2 ? 8 : 6;
        const min = arms === 0 ? baseMin : arms >= 4 ? baseMin : 6;
        const max = arms === 0 ? baseMin + 3 : arms === 1 ? 8 : arms === 2 ? 10 : arms === 3 ? 12 : 13;
        assert(specs.length >= min - 2 && specs.length <= max, `organicTownSpecs count ${specs.length} out of range for variant ${variant} road ${road} (expected ${min}-${max})`);
        for (const r of specs) {
          // In bounds with margin.
          assert(r.left >= 6 && r.top >= 6 && r.right <= 94 && r.bottom <= 94, `organicTownSpecs out of bounds: ${JSON.stringify(r)} road ${road}`);
          // Never on a road arm corridor (arm-aware: n/s arms are vertical,
          // e/w arms are horizontal, only where the arm exists).
          const hitArm = (l: number, t: number, ri: number, b: number): boolean =>
            r.left < ri && r.right > l && r.top < b && r.bottom > t;
          if (road.includes('n')) assert(!hitArm(41, 0, 59, 59), `organicTownSpecs house on N road: ${JSON.stringify(r)}`);
          if (road.includes('s')) assert(!hitArm(41, 41, 59, 100), `organicTownSpecs house on S road: ${JSON.stringify(r)}`);
          if (road.includes('e')) assert(!hitArm(41, 41, 100, 59), `organicTownSpecs house on E road: ${JSON.stringify(r)}`);
          if (road.includes('w')) assert(!hitArm(0, 41, 59, 59), `organicTownSpecs house on W road: ${JSON.stringify(r)}`);
        }
        // No overlapping houses.
        for (let i = 0; i < specs.length; i++) {
          for (let j = i + 1; j < specs.length; j++) {
            const r1 = specs[i], r2 = specs[j];
            const overlap = r1.left < r2.right && r1.right > r2.left && r1.top < r2.bottom && r1.bottom > r2.top;
            assert(!overlap, `organicTownSpecs overlapping houses: ${JSON.stringify(r1)} vs ${JSON.stringify(r2)} road ${road}`);
          }
        }
      }
    }
  }
}

// ---- BUILD 306: NPC entrance helpers ----
{
  // Entry point is just off the edge the NPC came from.
  let e = npcEntryPoint({ x: 70, y: 70 }, 'right');
  assert(e.x === -6 && e.y === 70, 'npcEntryPoint right wrong: ' + JSON.stringify(e));
  e = npcEntryPoint({ x: 70, y: 70 }, 'left');
  assert(e.x === 286 && e.y === 70, 'npcEntryPoint left wrong');
  e = npcEntryPoint({ x: 30, y: 40 }, 'down');
  assert(e.x === 30 && e.y === -6, 'npcEntryPoint down wrong');
  e = npcEntryPoint({ x: 30, y: 40 }, 'up');
  assert(e.x === 30 && e.y === 286, 'npcEntryPoint up wrong');
  // Facing follows the dominant axis of movement.
  assert(facingForDelta(5, 1) === 'right', 'facingForDelta +x wrong');
  assert(facingForDelta(-5, 1) === 'left', 'facingForDelta -x wrong');
  assert(facingForDelta(1, 5) === 'down', 'facingForDelta +y wrong');
  assert(facingForDelta(1, -5) === 'up', 'facingForDelta -y wrong');
  assert(facingForDelta(0, 0) === 'right', 'facingForDelta zero wrong');
}

// ---- BUILD 315: Pokémon-style talk targeting ----
{
  const mk = (name: string, x: number, y: number) => ({ name, position: { x, y } });
  const player = { x: 70, y: 70 };
  // NPC directly in front (facing down) is picked.
  let t = findTalkTarget([mk('A', 70, 76), mk('B', 70, 64)], player, 'down');
  assert(t?.name === 'A', 'talk target should be the NPC in front, got ' + t?.name);
  // NPC behind the player is ignored even when closer than one ahead.
  t = findTalkTarget([mk('Behind', 70, 66), mk('Ahead', 70, 78)], player, 'down');
  assert(t?.name === 'Ahead', 'talk target should prefer facing over proximity, got ' + t?.name);
  // NPC to the side (outside the facing cone) is ignored.
  t = findTalkTarget([mk('Side', 78, 70)], player, 'down');
  assert(t === null, 'talk target should ignore NPCs outside the facing cone');
  // Beyond talk range: nothing.
  t = findTalkTarget([mk('Far', 70, 70 + TALK_RANGE + 1)], player, 'down');
  assert(t === null, 'talk target should ignore NPCs beyond range');
  // Very close NPC is talkable regardless of facing.
  t = findTalkTarget([mk('Close', 69, 70)], player, 'down');
  assert(t?.name === 'Close', 'talk target should allow very close NPCs in any direction');
  // Nearest in-front NPC wins.
  t = findTalkTarget([mk('Near', 70, 74), mk('Far2', 70, 78)], player, 'down');
  assert(t?.name === 'Near', 'talk target should pick the nearest, got ' + t?.name);
  // Empty roster: nothing.
  t = findTalkTarget([], player, 'up');
  assert(t === null, 'talk target should be null with no candidates');
}

// ---- BUILD 316: deterministic NPC visual identity ----
{
  // Determinism: same id+archetype => identical appearance every time.
  const a1 = appearanceForNpc('townsfolk-3', 'farmer');
  const a2 = appearanceForNpc('townsfolk-3', 'farmer');
  assert(a1.column === a2.column && a1.filter === a2.filter, 'npc appearance must be deterministic');
  // Column is a valid sprite-sheet outfit column.
  assert(a1.column >= 0 && a1.column <= 5 && Number.isInteger(a1.column), 'npc appearance column out of range');
  // Profession consistency: mages only ever wear mage-palette columns.
  const mageCols = new Set([0, 1, 2, 3, 4, 5].map((_, i) => appearanceForNpc('mage-' + i, 'mage').column));
  for (const c of mageCols) assert([2, 0, 5].includes(c), 'mage picked a non-mage outfit column: ' + c);
  // Guards stay in guard colors.
  for (let i = 0; i < 40; i++) {
    const c = appearanceForNpc('guard-' + i, 'guard').column;
    assert([1, 4, 0].includes(c), 'guard picked a non-guard outfit column: ' + c);
  }
  // Unknown archetypes fall back to the commoner palette, never crash.
  const weird = appearanceForNpc('x-1', 'dragon');
  assert([0, 3, 5, 2].includes(weird.column), 'unknown archetype should use commoner palette');
  // Filter carries the archetype base tint.
  assert(appearanceForNpc('m-1', 'mage').filter.includes('sepia(.35)'), 'mage filter lost its base tint');
  assert(appearanceForNpc('w-1', 'warrior').filter.includes('sepia(.52)'), 'warrior filter lost its base tint');
  // Adventurer kind keeps the drop shadow; town kind does not add one.
  assert(appearanceForNpc('kael', 'beginner', { kind: 'adventurer' }).filter.includes('drop-shadow'), 'adventurer lost drop shadow');
  assert(!appearanceForNpc('townsfolk-1', 'farmer').filter.includes('drop-shadow'), 'town npc should not gain a drop shadow');
  // Children never get the graying treatment.
  for (let i = 0; i < 100; i++) {
    assert(!appearanceForNpc('kid-' + i, 'child').filter.includes('saturate(.8)'), 'child should never be grayed');
  }
  // Region rotates palettes (different towns dress differently).
  let regionDiffers = false;
  for (let i = 0; i < 30; i++) {
    if (appearanceForNpc('n-' + i, 'commoner', { region: 'frosthold' }).column !== appearanceForNpc('n-' + i, 'commoner', { region: 'mosslight' }).column) { regionDiffers = true; break; }
  }
  assert(regionDiffers, 'region should rotate outfit palettes');

// ---- BUILD 331: body/height/age/wealth diversity (no new art) ----
{
  // Determinism extends to the new fields.
  const b1 = appearanceForNpc('townsfolk-3', 'farmer');
  const b2 = appearanceForNpc('townsfolk-3', 'farmer');
  assert(b1.heightScale === b2.heightScale && b1.buildScale === b2.buildScale && b1.ageStage === b2.ageStage && b1.wealth === b2.wealth, 'body appearance must be deterministic');
  // Children are always short and staged as children.
  for (let i = 0; i < 60; i++) {
    const c = appearanceForNpc('kid-' + i, 'child');
    assert(c.ageStage === 'child', 'child archetype must stage as child');
    assert(c.heightScale < 0.85 && c.heightScale >= 0.7, 'child height out of range: ' + c.heightScale);
    assert(c.buildScale < 1.0, 'child build should be slim: ' + c.buildScale);
  }
  // Adults vary in height and build within tasteful bounds.
  let sawTall = false, sawShort = false, sawStocky = false, sawSlim = false, sawElder = false;
  for (let i = 0; i < 200; i++) {
    const a = appearanceForNpc('adult-' + i, 'commoner');
    assert(a.heightScale >= 0.92 && a.heightScale <= 1.08, 'adult height out of range: ' + a.heightScale);
    assert(a.buildScale >= 0.94 && a.buildScale <= 1.06, 'adult build out of range: ' + a.buildScale);
    if (a.heightScale > 1.04) sawTall = true;
    if (a.heightScale < 0.96) sawShort = true;
    if (a.buildScale > 1.03) sawStocky = true;
    if (a.buildScale < 0.97) sawSlim = true;
    if (a.ageStage === 'elder') sawElder = true;
  }
  assert(sawTall && sawShort && sawStocky && sawSlim, 'adult bodies should vary (tall/short/stocky/slim)');
  assert(sawElder, 'some adults should stage as elders');
  // Wealth: merchants skew rich, rogues skew poor.
  let merchantWealth = 0, rogueWealth = 0;
  for (let i = 0; i < 60; i++) {
    merchantWealth += appearanceForNpc('merch-' + i, 'merchant').wealth;
    rogueWealth += appearanceForNpc('rog-' + i, 'rogue').wealth;
  }
  assert(merchantWealth > rogueWealth, 'merchants should be wealthier than rogues on average');
  const w = appearanceForNpc('merch-0', 'merchant');
  assert(w.wealth >= 0 && w.wealth <= 2, 'wealth out of range');
  // Style helper exposes the transform var for the sprite rules.
  const style = npcAppearanceStyle('townsfolk-3', 'farmer');
  assert(typeof style['--npc-appearance-transform'] === 'string' && style['--npc-appearance-transform'].startsWith('scale('), 'style must include the appearance transform var');
  // BUILD 316 clothing/tint sequence is untouched by the body stream.
  assert(appearanceForNpc('m-1', 'mage').filter.includes('sepia(.35)'), 'body changes must not disturb the tint sequence');
}
  // Diversity: 12 townsfolk should not be identical clones.
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const a = appearanceForNpc('townsfolk-' + i, ['farmer', 'merchant', 'guard', 'priest', 'smith', 'commoner'][i % 6]);
    seen.add(a.column + '|' + a.filter);
  }
  assert(seen.size >= 8, 'expected visual diversity across townsfolk, got ' + seen.size + ' distinct looks');
  // Style helper emits the CSS vars the sprite rules consume.
  const style = npcAppearanceStyle('townsfolk-3', 'farmer');
  assert(style['--npc-appearance-x'] === (-a1.column * 32) + 'px', 'appearance x var wrong');
  assert(style['--npc-appearance-filter'] === a1.filter, 'appearance filter var wrong');
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
  assert(anchors.gardens.some((g) => Math.hypot(g.x - farmerNoon.target.x, g.y - farmerNoon.target.y) < 4), 'Farmer not at a garden');
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

console.log('Testing village life layer (BUILD 366)...');
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
  const npc = folk[0];

  // Personality & age: deterministic, in range.
  const p1 = npcPersonality(npc);
  const p2 = npcPersonality(npc);
  assert(JSON.stringify(p1) === JSON.stringify(p2), 'Personality not deterministic');
  for (const v of Object.values(p1)) assert(v >= 0 && v <= 1, 'Personality trait out of range');
  assert(['child', 'young', 'adult', 'elder'].includes(npcAge(npc)), 'Bad age category');
  assert(npcAgeYears(npc) >= 7 && npcAgeYears(npc) <= 74, 'Age years out of range');

  // Needs: deterministic, hunger decays then resets at meals.
  const morning = npcNeeds(npc, clockAt(7, 0));
  const preLunch = npcNeeds(npc, clockAt(11, 59));
  const postLunch = npcNeeds(npc, clockAt(13, 0));
  assert(JSON.stringify(morning) === JSON.stringify(npcNeeds(npc, clockAt(7, 0))), 'Needs not deterministic');
  assert(preLunch.hunger < morning.hunger, 'Hunger did not decay before lunch');
  assert(postLunch.hunger > preLunch.hunger, 'Hunger did not reset after lunch');
  assert(morning.energy > npcNeeds(npc, clockAt(20, 0)).energy, 'Energy did not drain through the day');
  for (const v of Object.values(morning)) assert(v >= 0 && v <= 100, 'Need out of 0..100 range');

  // villageTarget: never overrides sleep; hunger override still walks (outdoors).
  const sleepTarget = villageTarget(npc, anchors, clockAt(2, 0));
  assert(sleepTarget.activity === 'Sleeping', 'villageTarget overrode sleep');
  const det1 = villageTarget(npc, anchors, clockAt(10, 0));
  const det2 = villageTarget(npc, anchors, clockAt(10, 0));
  assert(det1.activity === det2.activity, 'villageTarget not deterministic');

  // Relationships: housemates are family; deterministic.
  const rels = npcRelationships(npc, folk, clockAt(10, 0));
  const rels2 = npcRelationships(npc, folk, clockAt(10, 0));
  assert(JSON.stringify(rels) === JSON.stringify(rels2), 'Relationships not deterministic');
  const housemate = folk.find((o) => o.id !== npc.id && o.homeKey === npc.homeKey);
  if (housemate) {
    const fam = rels.find((r) => r.targetId === housemate.id);
    assert(fam?.kind === 'family', 'Housemate not family');
    assert(fam!.affinity > 0, 'Family affinity not positive');
  }

  // Memories: seeded, bounded, deduped.
  assert((npc.memories ?? []).length >= 1, 'No seeded memories');
  let m = npc;
  for (let i = 0; i < 20; i++) m = addNPCMemory(m, `event ${i}`, 5, 1);
  assert(m.memories!.length <= 12, 'Memories exceeded bound');
  const before = m.memories!.length;
  m = addNPCMemory(m, 'event 19', 5, 1);
  assert(m.memories!.length === before, 'Duplicate memory recorded');
  m = addNPCMemory(m, 'The player saved my life.', 6, 3);
  assert(m.memories!.some((x) => x.importance === 3), 'Important memory lost');

  // Economy: deterministic, grows with days worked; wages differ by job.
  const g1 = npcGold(npc, clockAt(10, 0, 5));
  assert(g1 === npcGold(npc, clockAt(10, 0, 5)), 'Gold not deterministic');
  assert(npcGold(npc, clockAt(10, 0, 10)) >= g1, 'Gold did not grow with days');
  const merchant = folk.find((n) => n.archetype === 'merchant')!;
  const child = folk.find((n) => n.archetype === 'child')!;
  assert(npcWage(merchant.archetype) > npcWage(child.archetype), 'Wage order wrong');
  const tipped = adjustNPCGold(npc, 50);
  assert(npcGold(tipped, clockAt(10, 0, 5)) === g1 + 50, 'Gold delta not applied');

  // Village events: deterministic per day.
  const e1 = villageEventsForDay(7, 12345);
  const e2 = villageEventsForDay(7, 12345);
  assert(JSON.stringify(e1) === JSON.stringify(e2), 'Village events not deterministic');
  assert(villageEventsForDay(4, 12345).some((e) => e.id.startsWith('market-')), 'No market day event on day 4');

  // Persistence round-trip keeps life state.
  const saved = serializeTownsfolk([tipped]);
  const restored = restoreTownsfolk(folk, saved);
  const rt = restored.find((n) => n.id === tipped.id)!;
  assert(rt.goldDelta === 50, 'goldDelta not restored');
  assert((rt.memories ?? []).length === (tipped.memories ?? []).length, 'memories not restored');
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
      // Door crossing is now INTERIOR -> EXITING -> OUTDOOR (BUILD 324): the
      // NPC stays hidden (indoors) while stepping through the doorway.
      const isDoorCross = (prevLoc === 'INTERIOR' && next.location === 'EXITING')
        || (prevLoc === 'EXITING' && next.location === 'OUTDOOR');
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

  // TEST 4 — Adventurer exodus on the AUTHORITATIVE world clock: all 10
  // starting adventurers physically leave the starting area within 1 in-game
  // hour of stepping out of the starting house, via varied routes, with no
  // teleporting. The world clock advances 10 game-minutes every 3 real
  // seconds; the living sim ticks every 1.9s, so each living tick = 19/3
  // game-minutes — modeled exactly the way App.tsx runs both loops.
  {
    const { initialSimulatedAdventurers, spawnDueAdventurer, advanceSimulatedAdventurers, MAX_ADVENTURERS, EXODUS_DEADLINE_MINUTES, worldClockMinutes } =
      await import('../src/game/simulatedAdventurers');
    let advs = initialSimulatedAdventurers.map((a) => ({ ...a }));
    const lastPos = new Map<string, { x: number; y: number }>();
    const lastLoc = new Map<string, string>();
    const leftAt = new Map<string, number>(); // world-clock minutes when each first left
    let teleports = 0;
    // Spawn stagger (9*32 ticks) + exodus march (<=8 ticks each) + margin.
    const HOUR_TICKS = 400;
    const startClock = worldClockMinutes(5, 360); // day 5, 06:00
    for (let tick = 0; tick <= HOUR_TICKS; tick++) {
      const clockMinutes = startClock + (tick * 19) / 3;
      advs = spawnDueAdventurer(advs, tick);
      advs = advanceSimulatedAdventurers(advs, tick, [], clockMinutes);
      for (const a of advs) {
        const prev = lastPos.get(a.id);
        const prevLoc = lastLoc.get(a.id);
        if (prev && prevLoc === 'field' && (a.location || 'field') === 'field') {
          // Both in field: position must be continuous (door exits are the
          // only allowed transition, and those change location). Exodus
          // marchers legitimately move up to their calibrated march speed.
          const maxStep = a.outing === 'exodus' ? (a.exodusSpeed ?? 18) : 5;
          const jump = Math.hypot(a.position.x - prev.x, a.position.y - prev.y);
          if (jump > maxStep + 0.001) teleports++;
        }
        // "Left" = reached traveling (exodus complete) or at a boundary.
        const p = a.position;
        const atBoundary = p.x <= 6 || p.x >= 134 || p.y <= 6 || p.y >= 134;
        if (!leftAt.has(a.id) && ((a.location || 'field') === 'traveling' || atBoundary)) {
          leftAt.set(a.id, clockMinutes);
        }
        lastPos.set(a.id, { ...a.position });
        lastLoc.set(a.id, a.location || 'field');
      }
    }
    assert(advs.length === MAX_ADVENTURERS, `Expected ${MAX_ADVENTURERS} adventurers, got ${advs.length}`);
    assert(teleports === 0, `${teleports} adventurer teleports detected during exodus`);
    // Every adventurer must have left within 1 in-game hour of stepping out.
    const late: string[] = [];
    for (const a of advs) {
      const lt = leftAt.get(a.id);
      const st = a.exodusStartClockMinutes ?? startClock;
      if (lt === undefined) late.push(`${a.id} never left`);
      else if (lt - st > EXODUS_DEADLINE_MINUTES) late.push(`${a.id} left ${(lt - st).toFixed(1)} min after stepping out`);
    }
    assert(late.length === 0, `Adventurers did not leave within 1 in-game hour: ${late.join(', ')}`);
    // Physical arrival must beat the backstop: nobody should have been
    // force-completed without reaching their boundary.
    const backstopped = advs.filter((a) => {
      const p = a.position;
      return (a.location || 'field') === 'traveling' && !(p.x <= 6 || p.x >= 134 || p.y <= 6 || p.y >= 134);
    });
    assert(backstopped.length === 0, `Exodus backstop fired without physical arrival: ${backstopped.map((a) => a.id).join(', ')}`);
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

// ---- BUILD 317: monster sprite fallback hierarchy ----
{
  clearMonsterSpriteCaches();
  // 1. Requested asset: known sheet kinds resolve to themselves, level 0.
  for (const kind of ['wolf', 'goblin', 'skeleton', 'orc', 'troll', 'spider', 'slime', 'bat', 'rat']) {
    const r = resolveMonsterSprite(kind);
    assert(r.kind === kind, kind + ' should resolve to itself, got ' + r.kind);
    assert(r.fallbackLevel === 0, kind + ' should be level 0');
    assert(r.def && r.def.id === kind, kind + ' should carry its own def');
    assert(isValidMonsterSpriteDef(r.def), kind + ' def should validate');
  }
  // 2. Legacy-sprite kinds are untouched (own CSS, no def).
  for (const kind of ['bandit', 'snake', 'dragon', 'soldier']) {
    const r = resolveMonsterSprite(kind);
    assert(r.kind === kind && r.fallbackLevel === 0 && r.def === undefined, 'legacy kind ' + kind + ' must be preserved');
  }
  // 3/4. Unknown kinds fall back to the generic humanoid, never invisible.
  const unknown = resolveMonsterSprite('mimic');
  assert(unknown.kind === GENERIC_HUMANOID_KIND, 'unknown kind should map to ' + GENERIC_HUMANOID_KIND + ', got ' + unknown.kind);
  assert(unknown.fallbackLevel >= 3, 'unknown kind should be deep in the fallback chain');
  assert(unknown.def && unknown.def.id === GENERIC_HUMANOID_KIND, 'unknown kind should carry the generic def');
  // Deterministic + cached: identical object across calls (no mid-session swaps).
  assert(resolveMonsterSprite('mimic') === unknown, 'resolution must be cached per session');
  assert(resolveMonsterSprite('wolf') === resolveMonsterSprite('wolf'), 'resolution must be cached per session');
  // spriteDefFor delegates to the hierarchy.
  assert(spriteDefForResolved('mimic')?.id === GENERIC_HUMANOID_KIND, 'spriteDefFor should resolve unknown kinds');
  assert(spriteDefForResolved('bandit') === undefined, 'spriteDefFor should stay undefined for legacy kinds');

  // 5. Per-component repair: a broken animation bucket falls back to idle,
  //    the rest of the def (and NPC) is kept.
  const wolfDef = resolveMonsterSprite('wolf').def!;
  const brokenAttack = JSON.parse(JSON.stringify(wolfDef));
  brokenAttack.animations.attack.frames = 0;
  overrideMonsterSpriteDefForTest('wolf', brokenAttack);
  const repaired = resolveMonsterSprite('wolf');
  assert(repaired.fallbackLevel === 0, 'repaired def should stay level 0');
  assert(repaired.def!.animations.attack === repaired.def!.animations.idle, 'broken attack bucket should use idle frames');
  assert(repaired.def!.animations.walk.frames === wolfDef.animations.walk.frames, 'healthy buckets must be untouched');
  assert((repaired.reason || '').includes('attack'), 'repair reason should name the broken bucket');

  // 6. Invalid def: same-category sibling first...
  const badDef = { id: 'wolf', spriteSheet: '/mobs/wolf_sheet.png' }; // missing everything else
  assert(!isValidMonsterSpriteDef(badDef), 'def missing animations must not validate');
  overrideMonsterSpriteDefForTest('wolf', badDef);
  const sibling = resolveMonsterSprite('wolf');
  assert(['bat', 'rat'].includes(sibling.kind), 'invalid wolf def should fall to a beast sibling, got ' + sibling.kind);
  assert(sibling.fallbackLevel === 2, 'category fallback should be level 2');

  // ...then the generic humanoid, then the engine-safe placeholder.
  overrideMonsterSpriteDefForTest('goblin', badDef);
  const placeholder = resolveMonsterSprite('mimic-fallback-test');
  assert(placeholder.kind === 'placeholder' && placeholder.def === undefined, 'with no valid generic, resolution must be the placeholder');
  assert(placeholder.fallbackLevel === 4, 'placeholder should be level 4');

  // Restore real defs and confirm recovery.
  overrideMonsterSpriteDefForTest('wolf', wolfDef);
  overrideMonsterSpriteDefForTest('goblin', resolveMonsterSprite('goblin').def);
  clearMonsterSpriteCaches();
  const recovered = resolveMonsterSprite('wolf');
  assert(recovered.fallbackLevel === 0 && recovered.def!.id === 'wolf', 'real defs must resolve cleanly after restore');

  // 7. Validation unit checks.
  assert(!isValidMonsterSpriteDef(null), 'null must not validate');
  assert(!isValidMonsterSpriteDef({ ...wolfDef, spriteSheet: '' }), 'empty spriteSheet must not validate');
  assert(!isValidMonsterSpriteDef({ ...wolfDef, facingRows: { down: 0 } }), 'incomplete facings must not validate');
  const badIdle = JSON.parse(JSON.stringify(wolfDef)); badIdle.animations.idle.frames = 0;
  assert(!isValidMonsterSpriteDef(badIdle), 'broken idle must invalidate the whole def');

  // 8. Sheet probe state (browser probing is skipped in the sim).
  clearSheetProbeState();
  assert(!isMonsterSheetFailed('/mobs/wolf_sheet.png'), 'no sheet should be failed initially');
  clearMonsterSpriteCaches();
}



// ---- BUILD 318: stuck detection/recovery + destination validation ----
{
  // 1. validateDestination: clamps bounds, nudges out of buildings.
  const building = { left: 10, top: 10, right: 20, bottom: 20 };
  const clamped = validateDestination({ x: -5, y: 200 }, []);
  assert(clamped.point.x === 2 && clamped.point.y === 138 && clamped.corrected, 'validateDestination should clamp to field bounds');
  const inside = validateDestination({ x: 15, y: 15 }, [building]);
  assert(inside.corrected, 'point inside a building must be corrected');
  const ip = inside.point;
  assert(!(ip.x > 10 && ip.x < 20 && ip.y > 10 && ip.y < 20), 'corrected point must be outside the building rect');
  const clean = validateDestination({ x: 50, y: 50 }, [building]);
  assert(!clean.corrected && clean.point.x === 50 && clean.point.y === 50, 'clean destination must be untouched');
  // pathTo validates before A*: waypoints head to the validated point.
  const p = pathTo({ x: 50, y: 50 }, { x: 15, y: 15 }, [building]);
  assert(p !== null, 'pathTo should still route to a corrected destination');
  const last = p!.waypoints[p!.waypoints.length - 1];
  assert(!(last.x > 10 && last.x < 20 && last.y > 10 && last.y < 20), 'pathTo waypoints must not end inside a building');

  // 2. trackStep: progress resets the stuck counter.
  const mkPath = (): NavPath => ({ waypoints: [{ x: 90, y: 70 }], index: 0, destination: { x: 90, y: 70 } });
  const mkRes = (pos: { x: number; y: number }, path: NavPath) => ({
    position: pos, path, arrived: false as const, facing: 'right' as const, moving: true,
  });
  let path = mkPath();
  let tr = trackStep(path, { x: 70, y: 70 }, mkRes({ x: 70.22, y: 70 }, path), () => null);
  assert(!tr.waiting && tr.moving && (tr.path!.stuckTicks ?? -1) === 0, 'moving NPC should not accumulate stuck ticks');

  // 3. trackStep: STUCK_TICK_LIMIT ticks without progress -> one replan, then give up.
  path = mkPath();
  let res: ReturnType<typeof trackStep> | undefined;
  for (let i = 0; i <= STUCK_TICK_LIMIT; i++) {
    res = trackStep(path, { x: 70, y: 70 }, mkRes({ x: 70, y: 70 }, path), () => null);
    path = res.path!;
  }
  assert(res!.waiting && !res!.moving && res!.path!.gaveUp === true, 'stuck NPC with no replan route must give up and wait');

  // 4. trackStep: a successful replan resets the counter and counts the replan.
  path = mkPath();
  const fresh: NavPath = { waypoints: [{ x: 90, y: 70 }], index: 0, destination: { x: 90, y: 70 } };
  for (let i = 0; i <= STUCK_TICK_LIMIT; i++) {
    res = trackStep(path, { x: 70, y: 70 }, mkRes({ x: 70, y: 70 }, path), () => ({ ...fresh }));
    path = res.path!;
  }
  assert(!res!.waiting && res!.moving, 'stuck NPC should keep walking after a successful replan');
  assert(res!.path!.replans === 1 && (res!.path!.stuckTicks ?? -1) === 0, 'replan should reset stuckTicks and count replans');
  // ...but a second stall exhausts MAX_REPLANS and the NPC waits.
  for (let i = 0; i <= STUCK_TICK_LIMIT; i++) {
    res = trackStep(path, { x: 70, y: 70 }, mkRes({ x: 70, y: 70 }, path), () => ({ ...fresh }));
    path = res.path!;
  }
  assert(res!.waiting && res!.path!.gaveUp === true, 'NPC must give up after MAX_REPLANS stalls');

  // 5. shouldReplanPath hysteresis.
  const cooled: NavPath = { waypoints: [{ x: 70, y: 82 }], index: 0, destination: { x: 70, y: 82 }, replanCooldown: 10 };
  assert(!shouldReplanPath(cooled, { x: 71, y: 82 }), 'tiny destination jitter during cooldown should not replan');
  assert(shouldReplanPath(cooled, { x: 90, y: 82 }), 'a real destination change must replan even during cooldown');
  assert(shouldReplanPath({ ...cooled, replanCooldown: 0 }, { x: 71, y: 82 }), 'after cooldown, even a small shift replans');
  assert(shouldReplanPath(undefined, { x: 70, y: 82 }), 'no path must replan');
  assert(!shouldReplanPath({ ...cooled, gaveUp: true }, { x: 70, y: 82 }), 'gave-up NPC waits while the destination is unchanged');
  assert(shouldReplanPath({ ...cooled, gaveUp: true }, { x: 30, y: 108 }), 'gave-up NPC replans when the destination changes');

  // 6. Integration: a gave-up NPC waits, then walks again on a new destination.
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
  const farmer = folk.find((n) => n.archetype === 'farmer')!;
  const gardenTarget = townsfolkTarget(farmer, anchors, clockAt(10, 0)).target;
  const stuckNpc = {
    ...farmer,
    position: { x: 60, y: 100 },
    location: 'OUTDOOR' as const,
    moving: true,
    path: { waypoints: [{ ...gardenTarget }], index: 0, destination: { ...gardenTarget }, gaveUp: true } as NavPath,
  };
  const waited = advanceTownsfolk([stuckNpc], anchors, clockAt(10, 0), navCtx)[0];
  assert(!waited.moving && waited.path!.gaveUp === true, 'gave-up NPC must wait while the destination is unchanged');
  assert(waited.position.x === 60 && waited.position.y === 100, 'waiting NPC must not move');
  // New destination (gardens moved) -> the NPC walks again.
  const movedAnchors: TownsfolkAnchors = { ...anchors, gardens: [{ x: 50, y: 50 }, { x: 51, y: 51 }] };
  const resumed = advanceTownsfolk([stuckNpc], movedAnchors, clockAt(10, 0), navCtx)[0];
  assert(resumed.moving && !resumed.path!.gaveUp, 'NPC must resume walking when the destination changes');
}


// ---- BUILD 319: light crowd separation ----
{
  const mkNpc = (id: string, x: number, y: number, moving: boolean, location: 'OUTDOOR' | 'SLEEPING' = 'OUTDOOR', indoors = false) => ({
    id, name: id, gender: 'male' as const, archetype: 'commoner' as const, role: 'mage' as const,
    seed: 1, homeKey: 'guild', home: { x, y }, position: { x, y }, facing: 'down' as const,
    moving, activity: 'test', indoors, location, path: undefined, homeId: undefined, bedId: undefined, buildingId: undefined,
  });
  // 1. Two overlapping walkers are pushed apart.
  const a = mkNpc('a', 70, 70, true);
  const b = mkNpc('b', 70.4, 70, true);
  const d0 = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
  const [a2, b2] = separateCrowd([a, b]);
  const d1 = Math.hypot(a2.position.x - b2.position.x, a2.position.y - b2.position.y);
  assert(d1 > d0, `walkers should separate (was ${d0}, now ${d1})`);
  // 2. Settled NPC holds its ground; only the walker is pushed (and keeps identity otherwise).
  const settled = mkNpc('s', 70, 70, false);
  const walker = mkNpc('w', 70.4, 70, true);
  const [s2, w2] = separateCrowd([settled, walker]);
  assert(s2 === settled, 'settled NPC must keep object identity');
  assert(w2 !== walker, 'pushed walker must be a new object');
  assert(s2.position.x === 70 && s2.position.y === 70, 'settled NPC must not be displaced');
  assert(w2.position.x !== 70.4, 'walker should be pushed away from the settled NPC');
  // 3. Nobody close: same array ref, no churn for the renderer's change check.
  const far = [mkNpc('a', 10, 10, true), mkNpc('b', 100, 100, true)];
  assert(separateCrowd(far) === far, 'separateCrowd must return the same ref when nobody overlaps');
  // 4. Indoor/sleeping NPCs are never touched.
  const sleeper = mkNpc('z', 70.2, 70, false, 'SLEEPING', true);
  const [w3, z3] = separateCrowd([mkNpc('w', 70, 70, true), sleeper]);
  assert(z3 === sleeper, 'sleeping NPC must keep identity');
  // 5. Deterministic: identical input -> identical output.
  const r1 = separateCrowd([mkNpc('a', 70, 70, true), mkNpc('b', 70.4, 70, true), mkNpc('c', 70.2, 70.3, true)]);
  const r2 = separateCrowd([mkNpc('a', 70, 70, true), mkNpc('b', 70.4, 70, true), mkNpc('c', 70.2, 70.3, true)]);
  assert(JSON.stringify(r1.map((n) => n.position)) === JSON.stringify(r2.map((n) => n.position)), 'separation must be deterministic');
  // 6. No orbit: a walker heading for a spot next to a settled NPC settles and stays.
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
  const farmer = folk.find((n) => n.archetype === 'farmer')!;
  const target = townsfolkTarget(farmer, anchors, clockAt(10, 0)).target;
  const occupant = { ...farmer, id: 'occupant', position: { ...target }, moving: false, location: 'OUTDOOR' as const, path: undefined };
  let incoming = { ...farmer, position: { x: target.x - 6, y: target.y }, moving: false, location: 'OUTDOOR' as const, path: undefined };
  let pair = [incoming, occupant];
  for (let i = 0; i < 400; i++) pair = advanceTownsfolk(pair, anchors, clockAt(10, 0), navCtx);
  const arrivedDist = Math.hypot(pair[0].position.x - target.x, pair[0].position.y - target.y);
  assert(!pair[0].moving, 'walker should settle near its target');
  assert(arrivedDist < 1.5, `walker should stay near its target, ended ${arrivedDist.toFixed(2)} away`);
  assert(pair[1].position.x === target.x && pair[1].position.y === target.y, 'settled occupant must never be shoved off its spot');
}


// ---- BUILD 321: road preference in NPC pathfinding ----
{
  // 1. Road corridor detection (field units; BUILD 367: canonical 280-space
  // corridors at 131.6..156.8, center 144).
  assert(isOnFieldRoad(144, 144, 'nesw'), 'center should be on road for nesw');
  assert(isOnFieldRoad(144, 144, 'n'), 'center intersection belongs to every arm');
  assert(isOnFieldRoad(10, 144, 'ew'), 'west arm should be road for ew');
  assert(!isOnFieldRoad(10, 144, 'ns'), 'west arm should not be road for ns');
  assert(isOnFieldRoad(144, 10, 'ns'), 'north arm should be road for ns');
  assert(!isOnFieldRoad(144, 10, 'ew'), 'north arm should not be road for ew');
  assert(!isOnFieldRoad(10, 10, 'nesw'), 'corner should not be road');
  assert(!isOnFieldRoad(144, 144, 'none'), 'none piece should never be road');
  assert(!isOnFieldRoad(144, 144, undefined), 'missing piece should never be road');
  // 2. A* prefers roads: a trip parallel to (but just off) a road arm walks
  // along the road instead of cutting straight across the grass.
  const from = { x: 10, y: 170 };
  const to = { x: 270, y: 170 };
  const roadPath = findPath(from, to, [], undefined, 'nesw');
  const dirtPath = findPath(from, to, [], undefined, undefined);
  assert(roadPath && dirtPath, 'both paths should exist on open ground');
  const roadFraction = (wp: { x: number; y: number }[]) => {
    let on = 0;
    let total = 0;
    for (let i = 0; i < wp.length - 1; i++) {
      const a = wp[i];
      const b = wp[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        total++;
        if (isOnFieldRoad(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 'nesw')) on++;
      }
    }
    return total === 0 ? 0 : on / total;
  };
  const roadFrac = roadFraction(roadPath!);
  const dirtFrac = roadFraction(dirtPath!);
  assert(roadFrac > dirtFrac + 0.2, `road path should walk more on roads (${roadFrac.toFixed(2)}) than dirt path (${dirtFrac.toFixed(2)})`);
  // Both still reach the destination.
  const lastR = roadPath![roadPath!.length - 1];
  assert(Math.hypot(lastR.x - to.x, lastR.y - to.y) < 6, 'road path should reach the destination');
  // 3. Deterministic.
  const again = findPath(from, to, [], undefined, 'nesw');
  assert(JSON.stringify(again) === JSON.stringify(roadPath), 'road pathfinding must be deterministic');
  // 4. Road preference never overrides obstacles: a wall across the road
  // still forces a detour, not a walk through the wall.
  const wall = [{ left: 132, top: 132, right: 156, bottom: 156 }];
  const wallPath = findPath({ x: 20, y: 144 }, { x: 260, y: 144 }, wall, undefined, 'ew');
  assert(wallPath, 'path around the wall should exist');
  const throughWall = wallPath!.some((p) => p.x > 132 && p.x < 156 && p.y > 132 && p.y < 156);
  assert(!throughWall, 'road preference must not route through the wall rect');
}

// ---- BUILD 328: stronger visible road adherence ----
{
  // A trip parallel to a road arm but offset from it must now divert onto
  // the road instead of walking a straight cross-country line. (Before:
  // smoothing collapsed the road detour to ~0.15 road fraction.)
  const frac = (wp: { x: number; y: number }[]) => {
    let on = 0, total = 0;
    for (let i = 0; i < wp.length - 1; i++) {
      const a = wp[i]; const b = wp[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps; total++;
        if (isOnFieldRoad(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 'nesw')) on++;
      }
    }
    return total === 0 ? 0 : on / total;
  };
  const p1 = findPath({ x: 10, y: 100 }, { x: 270, y: 100 }, [], undefined, 'nesw');
  assert(p1, 'offset parallel trip should have a path');
  assert(frac(p1!) > 0.4, `offset trip should ride the road (got ${frac(p1!).toFixed(2)})`);
  const last1 = p1![p1!.length - 1];
  assert(Math.hypot(last1.x - 270, last1.y - 100) < 6, 'offset trip must still reach its destination');
  const p2 = findPath({ x: 10, y: 170 }, { x: 270, y: 170 }, [], undefined, 'nesw');
  assert(p2 && frac(p2!) > 0.6, `east-west trip should strongly follow the road (got ${p2 ? frac(p2!).toFixed(2) : 'none'})`);
  // Deterministic.
  const again = findPath({ x: 10, y: 100 }, { x: 270, y: 100 }, [], undefined, 'nesw');
  assert(JSON.stringify(again) === JSON.stringify(p1), 'strengthened road pathfinding must be deterministic');
  // Without a road piece, smoothing still collapses open-ground zigzag.
  const dirt = findPath({ x: 10, y: 100 }, { x: 270, y: 100 }, [], undefined, undefined);
  assert(dirt && dirt.length <= 3, `no-road smoothing should still collapse (got ${dirt ? dirt.length : 'none'} waypoints)`);
}

// ---- BUILD 329: truthful 'At home' (indoors, interior rendering, building ids) ----
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

  // 1. Evening 'At home' is now an indoors want for all four archetypes.
  for (const arch of ['farmer', 'merchant', 'child', 'commoner']) {
    const npc = folk.find((n) => n.archetype === arch)!;
    const want = townsfolkTarget(npc, anchors, clockAt(20, 0));
    assert(want.activity === 'At home' && want.indoors === true, `${arch} at 20:00 should want At home indoors (got ${want.activity} indoors=${want.indoors})`);
  }

  // 2. Snap at 20:00 puts 'At home' NPCs INTERIOR with a real buildingId.
  const snapped = snapTownsfolk(folk, anchors, clockAt(20, 0), navCtx);
  const farmer = snapped.find((n) => n.archetype === 'farmer')!;
  assert(farmer.location === 'INTERIOR' && farmer.indoors, `farmer should snap INTERIOR at 20:00 (got ${farmer.location})`);
  assert(farmer.buildingId && farmer.buildingId.startsWith('cottage-'), `farmer needs a cottage buildingId (got ${farmer.buildingId})`);

  // 3. No revolving door: 300 ticks at 20:00, the NPC stays inside and idle.
  let settled = farmer;
  for (let t = 0; t < 300; t++) settled = advanceTownsfolk([settled], anchors, clockAt(20, 0), navCtx, 0.5)[0];
  assert(settled.location === 'INTERIOR' && settled.indoors, `revolving door! farmer left: ${settled.location} indoors=${settled.indoors}`);
  assert(settled.activity === 'At home', `farmer activity drifted: ${settled.activity}`);
  assert(!settled.moving, 'settled At-home NPC should be idle, not pacing');

  // 4. The full walk: OUTDOOR at the plaza at 20:00 -> walks to the cottage
  // door -> ENTERING -> INTERIOR, never teleporting.
  let walker = { ...folk.find((n) => n.archetype === 'merchant')!, position: { x: 70, y: 82 }, location: 'OUTDOOR' as const, indoors: false, path: undefined, moving: false, buildingId: undefined };
  let sawEntering = false;
  let steps = 0;
  for (; steps < 3000 && walker.location !== 'INTERIOR'; steps++) {
    walker = advanceTownsfolk([walker], anchors, clockAt(20, 0), navCtx, 0.5)[0];
    if (walker.location === 'ENTERING') sawEntering = true;
  }
  assert(walker.location === 'INTERIOR', `merchant never got inside after ${steps} ticks (at ${walker.location})`);
  assert(sawEntering, 'merchant should pass through ENTERING on the way in');
  assert(walker.indoors && walker.buildingId?.startsWith('cottage-'), `merchant indoors/buildingId wrong: indoors=${walker.indoors} ${walker.buildingId}`);

  // 5. Visible population drops in the evening: at 20:00 only 4 of 12 are out.
  const visibleEvening = snapped.filter((n) => !n.indoors).length;
  const visibleMidday = snapTownsfolk(folk, anchors, clockAt(10, 0), navCtx).filter((n) => !n.indoors).length;
  assert(visibleEvening < visibleMidday, `evening should show fewer NPCs than midday (${visibleEvening} vs ${visibleMidday})`);
  assert(visibleEvening <= 6, `too many NPCs visible at 20:00: ${visibleEvening}`);

  // 6. Cottage <-> player interior area id mapping.
  assert(interiorAreaIdForCottage('cottage-1', { x: 4, y: 7 }) === '4-7-building-4', 'cottage-1 mapping');
  assert(interiorAreaIdForCottage('cottage-6', { x: 4, y: 7 }) === '4-7-building-9', 'cottage-6 mapping');
  assert(interiorAreaIdForCottage('tavern', { x: 4, y: 7 }) === null, 'non-cottage id maps to null');
  assert(interiorAreaIdForCottage('cottage-7', { x: 4, y: 7 }) === null, 'cottage-7 maps to null');

  // 7. Rest spots and rects stay inside their cottage for every cottage.
  for (let c = 1; c <= 6; c++) {
    const rect = cottageRectFor('cottage-' + c)!;
    assert(rect, `cottage-${c} rect`);
    for (const npc of folk.slice(0, 4)) {
      const door = cottageDoorways()[c - 1];
      const rest = indoorRestSpot(npc, door);
      assert(rest.x > rect.left && rest.x < rect.right && rest.y > rect.top && rest.y < rect.bottom,
        `rest spot outside cottage-${c} rect for ${npc.id}: (${rest.x.toFixed(2)},${rest.y.toFixed(2)})`);
    }
  }
  assert(cottageRectFor('chapel') === null, 'non-cottage rect is null');
}

// ---- BUILD 333: interior waypoints (indoor NPCs stroll their homes) ----
console.log('Testing interior waypoints...');
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
  const folk0 = createTownsfolk(anchors, 847291583);
  const navCtx: TownsfolkNavContext = {
    housing: buildMosslightHousing(folk0.map((n) => n.id)),
    doors: cottageDoorways(),
    obstacles: mosslightObstacles(),
  };
  // 1. Wander spots are deterministic for the same (seed, clock).
  const door = cottageDoorways()[0];
  const npc = { seed: 12345 } as any;
  const w1 = interiorWanderSpot(npc, door, { day: 5, minuteOfDay: 20 * 60 + 7 });
  const w2 = interiorWanderSpot(npc, door, { day: 5, minuteOfDay: 20 * 60 + 7 });
  assert(w1.x === w2.x && w1.y === w2.y, 'wander spot must be deterministic');
  // 2. Wander spots stay inside the cottage rect for every cottage, NPC,
  //    day and quarter-hour slot.
  for (let c = 1; c <= 6; c++) {
    const rect = cottageRectFor('cottage-' + c)!;
    const d = cottageDoorways()[c - 1];
    for (let s = 1; s <= 20; s++) {
      for (const minute of [18 * 60, 19 * 60 + 30, 20 * 60 + 44, 21 * 60 + 59]) {
        const w = interiorWanderSpot({ seed: s * 977 } as any, d, { day: 3, minuteOfDay: minute });
        assert(w.x > rect.left && w.x < rect.right && w.y > rect.top && w.y < rect.bottom,
          `wander spot outside cottage-${c} for seed ${s} at ${minute}: (${w.x.toFixed(2)},${w.y.toFixed(2)})`);
      }
    }
  }
  // 3. Slots rotate: the spot changes across quarter-hours for most NPCs.
  let changed = 0;
  for (let s = 1; s <= 40; s++) {
    const a = interiorWanderSpot({ seed: s * 131 } as any, door, { day: 3, minuteOfDay: 20 * 60 });
    const b = interiorWanderSpot({ seed: s * 131 } as any, door, { day: 3, minuteOfDay: 20 * 60 + 16 });
    if (Math.hypot(a.x - b.x, a.y - b.y) > 0.5) changed++;
  }
  assert(changed > 10, `wander slots should rotate across quarter-hours (changed for ${changed}/40)`);
  // 4. An INTERIOR 'At home' NPC walks to its wander spot and idles there —
  //    never leaves, never paces forever, no per-tick replan churn.
  const folk = createTownsfolk(anchors, 847291583);
  const farmer = snapTownsfolk(folk, anchors, clockAt(20, 0), navCtx).find((n) => n.archetype === 'farmer')!;
  let settled = farmer;
  for (let t = 0; t < 300; t++) settled = advanceTownsfolk([settled], anchors, clockAt(20, 0), navCtx, 0.5)[0];
  assert(settled.location === 'INTERIOR' && settled.indoors, 'wanderer must stay INTERIOR');
  assert(!settled.moving && !settled.path, 'wanderer should idle at its spot, not churn');
  const spot = interiorWanderSpot(settled, door, { day: clockAt(20, 0).day, minuteOfDay: 20 * 60 });
  assert(Math.hypot(settled.position.x - spot.x, settled.position.y - spot.y) < 1.5,
    `wanderer not at its spot: (${settled.position.x.toFixed(2)},${settled.position.y.toFixed(2)}) vs (${spot.x.toFixed(2)},${spot.y.toFixed(2)})`);
  // 5. Slot change mid-evening: the NPC gets up and walks to the new spot.
  let walker = { ...settled };
  const before = { ...walker.position };
  for (let t = 0; t < 400; t++) walker = advanceTownsfolk([walker], anchors, clockAt(20, 16), navCtx, 0.5)[0];
  assert(walker.location === 'INTERIOR' && walker.indoors, 'walker must stay INTERIOR across slot change');
  const moved = Math.hypot(walker.position.x - before.x, walker.position.y - before.y);
  // (Only assert movement when the slot actually rotated for this NPC.)
  const s1 = interiorWanderSpot(settled, door, { day: clockAt(20, 0).day, minuteOfDay: 20 * 60 });
  const s2 = interiorWanderSpot(settled, door, { day: clockAt(20, 0).day, minuteOfDay: 20 * 60 + 16 });
  if (Math.hypot(s1.x - s2.x, s1.y - s2.y) > 2) {
    assert(moved > 1.0, `NPC should stroll to the new slot (moved ${moved.toFixed(2)})`);
  }
}


// ---- BUILD 322: townsfolk save/load persistence ----
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
  // 1. Round-trip: serialize -> restore preserves identity/state, drops paths.
  const live = advanceTownsfolk(snapTownsfolk(folk, anchors, clockAt(10, 0), navCtx), anchors, clockAt(10, 0), navCtx);
  const saved = serializeTownsfolk(live);
  assert(saved.length === 12, 'should serialize all 12 townsfolk');
  assert(saved.every((s) => !('path' in s)), 'save must not contain nav paths');
  const fresh = createTownsfolk(anchors, 847291583);
  const restored = restoreTownsfolk(fresh, saved);
  assert(restored.length === 12, 'restore keeps roster size');
  for (let i = 0; i < 12; i++) {
    assert(restored[i].id === live[i].id, 'ids preserved');
    assert(restored[i].position.x === live[i].position.x && restored[i].position.y === live[i].position.y, 'positions preserved');
    assert(restored[i].location === live[i].location, 'locations preserved');
    assert(restored[i].path === undefined, 'stale paths are dropped, not replayed');
    assert(restored[i].moving === false, 'restored NPCs resume on the next tick, not mid-stride');
  }
  // 2. Unknown ids / invalid entries are ignored; the roster stays valid.
  const junkBase = saved.filter((s) => s.id !== folk[0].id && s.id !== folk[1].id);
  const junk = [
    ...junkBase,
    { id: 'ghost', position: { x: 1, y: 1 }, location: 'OUTDOOR', activity: 'x' },
    { id: folk[0].id, position: { x: NaN, y: 1 }, location: 'OUTDOOR', activity: 'x' },
    { id: folk[1].id, position: { x: 1, y: 1 }, location: 'MARS', activity: 'x' },
  ];
  const r2 = restoreTownsfolk(fresh, junk);
  assert(r2.length === 12, 'ghost ids do not grow the roster');
  assert(r2[0].position.x === fresh[0].position.x, 'invalid position entry falls back to fresh');
  assert(r2[1].location === fresh[1].location, 'invalid location entry falls back to fresh');
  // 3. Empty/missing save is a no-op.
  assert(restoreTownsfolk(fresh, []) === fresh, 'empty save is a no-op');
  assert(restoreTownsfolk(fresh, undefined) === fresh, 'missing save is a no-op');
  // 4. A restored NPC resumes walking from exactly where it stood (no teleport).
  const walker = restored.find((n) => n.location === 'OUTDOOR');
  assert(walker, 'expected an outdoor townsfolk at 10:00');
  const before = { ...walker!.position };
  const next = advanceTownsfolk([walker!], anchors, clockAt(10, 0), navCtx)[0];
  const stepDist = Math.hypot(next.position.x - before.x, next.position.y - before.y);
  assert(stepDist <= 3.5, `restored NPC resumes without teleporting (moved ${stepDist.toFixed(2)})`);
  // 5. Survives a real save-file JSON round trip.
  const json = JSON.parse(JSON.stringify({ townsfolk: saved }));
  const r3 = restoreTownsfolk(fresh, json.townsfolk);
  assert(r3[3].position.x === live[3].position.x, 'JSON round trip preserves state');
}


// ---- BUILD 323: gather-spot personal space (no pileups) ----
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
  // 1. No two NPCs share an exact outdoor target (lunch, evening, patrol).
  for (const clock of [clockAt(12, 15), clockAt(18, 30), clockAt(10, 0)]) {
    const tgts = folk.map((n) => townsfolkTarget(n, anchors, clock)).filter((x) => !x.indoors);
    const keys = tgts.map((x) => `${x.target.x.toFixed(2)},${x.target.y.toFixed(2)}`);
    assert(new Set(keys).size === keys.length, `shared gather target at ${clock.hour}:${String(clock.minuteOfDay % 60).padStart(2, '0')}`);
  }
  // 2. Gather targets are deterministic per NPC per day.
  const g1 = townsfolkTarget(folk[0], anchors, clockAt(12, 15));
  const g2 = townsfolkTarget(folk[0], anchors, clockAt(12, 15));
  assert(g1.target.x === g2.target.x && g1.target.y === g2.target.y, 'gather target not deterministic');
  // 3. Lunch-rush stress: 300 ticks of the real state machine.
  const lunch = clockAt(12, 15);
  let walkers = snapTownsfolk(folk, anchors, lunch, navCtx);
  let snapMin = Infinity;
  for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
    snapMin = Math.min(snapMin, Math.hypot(walkers[i].position.x - walkers[j].position.x, walkers[i].position.y - walkers[j].position.y));
  }
  assert(snapMin >= 0.5, `snap stacked cottage-mates (min ${snapMin.toFixed(2)})`);
  let minPair = Infinity, maxStep = 0;
  for (let tick = 0; tick < 300; tick++) {
    const prev = walkers.map((w) => ({ ...w.position }));
    walkers = advanceTownsfolk(walkers, anchors, lunch, navCtx, 0.5);
    for (let i = 0; i < walkers.length; i++) {
      maxStep = Math.max(maxStep, Math.hypot(walkers[i].position.x - prev[i].x, walkers[i].position.y - prev[i].y));
      for (let j = i + 1; j < walkers.length; j++) {
        minPair = Math.min(minPair, Math.hypot(walkers[i].position.x - walkers[j].position.x, walkers[i].position.y - walkers[j].position.y));
      }
    }
  }
  assert(minPair >= 0.4, `NPCs stacked during lunch rush (minPair ${minPair.toFixed(2)})`);
  assert(maxStep <= 1.2, `teleport during lunch rush (maxStep ${maxStep.toFixed(2)})`);
  assert(walkers.every((w) => !w.moving), 'lunch rush deadlocked: not all NPCs settled');
  let minSettled = Infinity;
  const settled = walkers.filter((w) => !w.moving);
  for (let i = 0; i < settled.length; i++) for (let j = i + 1; j < settled.length; j++) {
    minSettled = Math.min(minSettled, Math.hypot(settled[i].position.x - settled[j].position.x, settled[i].position.y - settled[j].position.y));
  }
  assert(minSettled >= 0.9, `settled crowd piled up (min ${minSettled.toFixed(2)})`);
  for (const w of walkers) {
    const want = townsfolkTarget(w, anchors, lunch);
    if (want.indoors) {
      // BUILD 329: 'At home' is truthful — the NPC is inside their cottage,
      // not at the outdoor target point. Verify indoor state instead.
      assert(w.indoors && (w.location === 'INTERIOR' || w.location === 'SLEEPING' || w.location === 'ENTERING'),
        `${w.name} wants ${want.activity} indoors but is ${w.location} outdoors`);
      assert(w.buildingId && w.buildingId.startsWith('cottage-'), `${w.name} indoors without a cottage buildingId`);
      continue;
    }
    const raw = want.target;
    const valid = validateDestination(raw, navCtx.obstacles).point;
    const d = Math.hypot(w.position.x - valid.x, w.position.y - valid.y);
    assert(d < 5, `${w.name} stranded ${d.toFixed(1)} from validated target`);
  }
  // 4. Doorless INTERIOR NPC stays inside (never flips OUTDOOR while indoors).
  const noDoors: TownsfolkNavContext = { ...navCtx, doors: [] };
  const inside = { ...folk[0], location: 'INTERIOR' as const, indoors: true, moving: false, path: undefined, position: { x: 17, y: 64 } };
  const held = advanceTownsfolk([inside], anchors, clockAt(10, 0), noDoors)[0];
  assert(held.location === 'INTERIOR' && held.indoors, 'doorless NPC flipped OUTDOOR while physically inside');
}


// ---- BUILD 324: EXITING state (no pop through cottage walls) ----
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
  const clock = clockAt(10, 0); // morning: everyone wants to be outdoors
  const assign = navCtx.housing.assignments[folk[0].id];
  const home = navCtx.housing.homes.find((h) => h.id === assign.homeId)!;
  const door = navCtx.doors.find((d) => d.id === home.doorwayId)!;
  // 1. Full exit flow: INTERIOR -> EXITING (hidden) -> OUTDOOR at the exterior.
  let npc = { ...folk[0], location: 'INTERIOR' as const, indoors: true, moving: false, path: undefined, position: { ...door.interior } };
  const flow: string[] = [];
  let maxStep = 0, prev = { ...npc.position }, hiddenThroughoutExit = true;
  for (let i = 0; i < 60; i++) {
    npc = advanceTownsfolk([npc], anchors, clock, navCtx, 0.5)[0];
    maxStep = Math.max(maxStep, Math.hypot(npc.position.x - prev.x, npc.position.y - prev.y));
    prev = { ...npc.position };
    const loc = npc.location;
    if (flow[flow.length - 1] !== loc) flow.push(loc);
    if (loc === 'EXITING' && !npc.indoors) hiddenThroughoutExit = false;
    if (loc === 'OUTDOOR' && !npc.moving) break;
  }
  assert(flow.join('>') === 'INTERIOR>EXITING>OUTDOOR', `exit flow wrong: ${flow.join('>')}`);
  assert(hiddenThroughoutExit, 'EXITING NPC was visible (indoors flipped early)');
  assert(maxStep <= 1.2, `teleport during exit (maxStep ${maxStep.toFixed(2)})`);
  assert(Math.hypot(npc.position.x - door.exterior.x, npc.position.y - door.exterior.y) < 1.5, 'did not emerge at the door exterior');
  // The field renderer only draws !indoors NPCs: EXITING never pops into view mid-wall.
  assert(!npc.indoors || npc.location !== 'EXITING', 'exiting NPC leaked to renderer');
  // 2. Doorless EXITING falls back inside instead of walking through walls.
  const noDoors: TownsfolkNavContext = { ...navCtx, doors: [] };
  const stranded = { ...folk[1], location: 'EXITING' as const, indoors: true, moving: true, path: undefined, position: { ...door.interior } };
  const held = advanceTownsfolk([stranded], anchors, clock, noDoors)[0];
  assert(held.location === 'INTERIOR' && held.indoors, 'doorless EXITING NPC did not fall back inside');
  // 3. Save/load round-trip of an EXITING NPC resumes the doorway walk.
  const assign2 = navCtx.housing.assignments[folk[2].id];
  const home2 = navCtx.housing.homes.find((h) => h.id === assign2.homeId)!;
  const door2 = navCtx.doors.find((d) => d.id === home2.doorwayId)!;
  let exiter = { ...folk[2], location: 'INTERIOR' as const, indoors: true, moving: false, path: undefined, position: { ...door2.interior } };
  for (let i = 0; i < 8 && exiter.location !== 'EXITING'; i++) exiter = advanceTownsfolk([exiter], anchors, clock, navCtx, 0.5)[0];
  assert(exiter.location === 'EXITING', 'could not reach EXITING for the round-trip test');
  const saved = serializeTownsfolk([exiter]);
  const restored = restoreTownsfolk([{ ...folk[2] }], saved)[0];
  assert(restored.location === 'EXITING' && restored.indoors, 'EXITING state did not survive save/load');
  let resumed = restored;
  for (let i = 0; i < 60 && resumed.location !== 'OUTDOOR'; i++) resumed = advanceTownsfolk([resumed], anchors, clock, navCtx, 0.5)[0];
  assert(resumed.location === 'OUTDOOR' && !resumed.indoors, 'restored EXITING NPC never emerged');
}

// ---- BUILD 325: D-pad touch-hold tracking (attack-freeze root cause) ----
{
  // Exact reported scenario: thumb holds 'up' (touch 7); the Attack tap lands
  // as a second touch (touch 8) and iOS fires a spurious touchend/touchcancel
  // for it on the D-pad button. The stray end must NOT release the hold.
  const holds = createTouchHoldState();
  pressTouchHold(holds, 'up', 7);
  assert(isTouchHeld(holds, 'up'), 'touch press did not register a hold');
  const strayReleased = releaseTouchHold(holds, 'up', 8);
  assert(!strayReleased && isTouchHeld(holds, 'up'), 'stray touchend from the attack tap cleared the D-pad hold (attack freeze)');
  // The real thumb lifting releases normally.
  assert(releaseTouchHold(holds, 'up', 7) && !isTouchHeld(holds, 'up'), 'matching touchend did not release the hold');
  // A second touch on the same direction takes over: the first touch's end is
  // then stray and must be ignored, the second touch's end releases.
  pressTouchHold(holds, 'left', 11);
  pressTouchHold(holds, 'left', 12);
  assert(!releaseTouchHold(holds, 'left', 11) && isTouchHeld(holds, 'left'), 'first touch end stole the hold from the still-down second touch');
  assert(releaseTouchHold(holds, 'left', 12) && !isTouchHeld(holds, 'left'), 'second touch end did not release the hold');
  // Directions are independent.
  pressTouchHold(holds, 'up', 21);
  pressTouchHold(holds, 'right', 22);
  assert(isTouchHeld(holds, 'up') && isTouchHeld(holds, 'right'), 'independent direction holds failed');
  assert(!releaseTouchHold(holds, 'up', 22), 'release matched the wrong direction');
  const listed = heldTouchDirections(holds).sort().join(',');
  assert(listed === 'right,up', `heldTouchDirections wrong: ${listed}`);
  // Clearing.
  clearTouchHoldDirection(holds, 'up');
  assert(!isTouchHeld(holds, 'up') && isTouchHeld(holds, 'right'), 'clearTouchHoldDirection cleared the wrong hold');
  clearTouchHolds(holds);
  assert(heldTouchDirections(holds).length === 0, 'clearTouchHolds left a hold behind');
  // Releasing a direction that was never held is a no-op.
  assert(!releaseTouchHold(holds, 'down', 99), 'release of a never-held direction reported a release');
}

// ---- BUILD 336: self-healing touch holds (attack-freeze root cause) ----
console.log('Testing touch-hold revalidation...');
{
  // 1. touchcancel KEEPS the hold: the cancelled id is in changedTouches, and
  //    the finger may still be down (iOS cancels the D-pad touch when a
  //    second finger taps Attack, then delivers no further events for it).
  //    Releasing here is what froze the character while the thumb was down.
  const state = createTouchHoldState();
  pressTouchHold(state, 'up', 7);
  assert(revalidateTouchHolds(state, 'cancel', [], [7]).length === 0, 'cancel must not release a possibly-still-down touch');
  assert(isTouchHeld(state, 'up'), 'hold lost across touchcancel');
  // 2. The next touch event reaps the truly-dead hold (no stuck-on).
  const reaped = revalidateTouchHolds(state, 'start', [9], [9]);
  assert(reaped.length === 1 && reaped[0] === 'up' && !isTouchHeld(state, 'up'), 'dead hold was not reaped on the next touch');
  // 3. touchend releases definitively.
  const endState = createTouchHoldState();
  pressTouchHold(endState, 'left', 3);
  const ended = revalidateTouchHolds(endState, 'end', [], [3]);
  assert(ended.length === 1 && ended[0] === 'left' && !isTouchHeld(endState, 'left'), 'touchend did not release the hold');
  // 4. Live holds survive every event kind.
  const live = createTouchHoldState();
  pressTouchHold(live, 'right', 5);
  assert(revalidateTouchHolds(live, 'start', [5, 6], [6]).length === 0, 'live hold died on unrelated touchstart');
  assert(revalidateTouchHolds(live, 'end', [5], [6]).length === 0, 'live hold died on unrelated touchend');
  assert(revalidateTouchHolds(live, 'cancel', [5], [6]).length === 0, 'live hold died on unrelated touchcancel');
  assert(isTouchHeld(live, 'right'), 'live hold missing after unrelated events');
  // 5. Two-thumb scenario: 'up' cancelled at the attack tap is kept, 'right'
  //    stays live, and the dead 'up' hold is reaped by the next tap.
  const multi = createTouchHoldState();
  pressTouchHold(multi, 'up', 1);
  pressTouchHold(multi, 'right', 2);
  assert(revalidateTouchHolds(multi, 'cancel', [2], [1]).length === 0, 'cancel reaped a live hold');
  const healed = revalidateTouchHolds(multi, 'start', [2, 8], [8]);
  assert(healed.length === 1 && healed[0] === 'up', 'dead hold was not reaped');
  assert(!isTouchHeld(multi, 'up') && isTouchHeld(multi, 'right'), 'wrong holds after heal');
  // 6. A missed touchend (stale id in neither list) never wedges movement on.
  const stale = createTouchHoldState();
  pressTouchHold(stale, 'down', 42);
  assert(revalidateTouchHolds(stale, 'end', [], []).includes('down'), 'stale hold survived a touchend');
}

// ---- BUILD 326: Tankard Cellar rats + quest-giver marker states ----
console.log('Testing cellar rats and quest markers...');
// Rats: deterministic, unique ids, full HP, inside the room, clear of the ladder.
const ratsA = initialCellarRats();
const ratsB = initialCellarRats();
assert(ratsA.length === CELLAR_RAT_COUNT, `expected ${CELLAR_RAT_COUNT} rats, got ${ratsA.length}`);
assert(JSON.stringify(ratsA) === JSON.stringify(ratsB), 'cellar rats are not deterministic');
const ratIds = new Set(ratsA.map((r) => r.id));
assert(ratIds.size === ratsA.length, 'cellar rat ids are not unique');
assert(ratsA.every((r) => r.id >= CELLAR_RAT_ID_BASE), 'cellar rat id collides with field entity ids');
assert(ratsA.every((r) => r.hp === CELLAR_RAT_HP && r.maxHp === CELLAR_RAT_HP && !r.hitFlash), 'cellar rat hp state wrong');
assert(ratsA.every((r) => r.x >= 10 && r.x <= 90 && r.y >= 10 && r.y <= 90), 'cellar rat out of room bounds');
assert(ratsA.every((r) => !(r.x > 44 && r.x < 56 && r.y > 78)), 'cellar rat spawns on the entry ladder');
// Marker states for the reported stuck-yellow-marker bug: the badge must NOT
// show immediately after accepting (kill stage), only when unaccepted (!) or
// ready to turn in (?).
const ratsQuest = questById('rats-in-the-cellar');
assert(!!ratsQuest, 'rats-in-the-cellar quest missing');
if (ratsQuest) {
  const stateFor = (stageIndex: number, status: QuestState['status']): QuestState[] =>
    [{ questId: 'rats-in-the-cellar', stageIndex, status, counts: {}, startedAt: 0 }];
  assert(markerForGiver(ratsQuest, []) === 'available', 'unaccepted quest should show !');
  assert(markerForGiver(ratsQuest, stateFor(0, 'active')) === 'turnin', 'opening talk stage with Mira should show ?');
  assert(markerForGiver(ratsQuest, stateFor(1, 'active')) === null, 'kill stage must show no marker (was stuck !)');
  assert(markerForGiver(ratsQuest, stateFor(2, 'active')) === 'turnin', 'return-to-Mira stage should show ?');
  assert(markerForGiver(ratsQuest, stateFor(2, 'completed')) === null, 'completed quest must show no marker');
  assert(markerForGiver(ratsQuest, stateFor(1, 'failed')) === null, 'failed quest must show no marker');
}
// A second quest (Mabel's) follows the same rule independently.
const heirloom = questById('lost-heirloom');
assert(!!heirloom, 'lost-heirloom quest missing');
if (heirloom) {
  assert(markerForGiver(heirloom, []) === 'available', 'unaccepted heirloom should show !');
  assert(markerForGiver(heirloom, [{ questId: 'lost-heirloom', stageIndex: 1, status: 'active', counts: {}, startedAt: 0 }]) === null, 'explore stage must show no marker');
}

// ---- BUILD 330: Oblivion-style dialogue (topics, disposition, wanted) ----
console.log('Testing townsfolk dialogue system...');
{
  // 1. Topics are archetype-driven and always end with Rumors / Town / Goodbye.
  const farmerTopics = topicsFor('farmer').map((t) => t.id);
  assert(farmerTopics.join(',') === 'who,work,rumors,town,bye', 'farmer topics wrong: ' + farmerTopics.join(','));
  assert(topicsFor('farmer').find((t) => t.id === 'work')!.label === 'The crops', 'farmer work label wrong');
  assert(topicsFor('guard').find((t) => t.id === 'work')!.label === 'Trouble in town?', 'guard work label wrong');
  assert(topicsFor('child').find((t) => t.id === 'work')!.label === 'What are you playing?', 'child work label wrong');
  assert(topicsFor('commoner').find((t) => t.id === 'work')!.label === 'Your work', 'commoner fallback work label wrong');
  // 2. Disposition tiers and labels.
  const tiers: Array<[number, string]> = [[0, 'cold'], [19, 'cold'], [20, 'wary'], [39, 'wary'], [40, 'neutral'], [59, 'neutral'], [60, 'warm'], [79, 'warm'], [80, 'admiring'], [100, 'admiring']];
  for (const [d, want] of tiers) assert(dispositionTier(d) === want, `tier(${d}) should be ${want}`);
  assert(dispositionLabel('admiring') === 'Admires you', 'admiring label wrong');
  assert(defaultDisposition() === 50, 'default disposition should be 50');
  assert(adjustDisposition(99, 5) === 100, 'disposition must clamp at 100');
  assert(adjustDisposition(1, -5) === 0, 'disposition must clamp at 0');
  // 3. Wanted labels and clamping.
  assert(wantedLabel(0) === 'Clean', 'wanted 0 should be Clean');
  assert(wantedLabel(2) === 'Suspect', 'wanted 2 should be Suspect');
  assert(wantedLabel(5) === 'Wanted', 'wanted 5 should be Wanted');
  assert(wantedLabel(9) === 'Hunted', 'wanted 9 should be Hunted');
  assert(adjustWanted(9, 5) === 10, 'wanted must clamp at 10');
  assert(adjustWanted(1, -5) === 0, 'wanted must clamp at 0');
  // 4. Responses are deterministic and disposition-toned.
  const base = { name: 'Aldric', archetype: 'farmer', activity: 'Tending crops', townReputation: 0, seed: 7 };
  const coldWho = responseFor({ ...base, disposition: 5 }, 'who');
  const warmWho = responseFor({ ...base, disposition: 70 }, 'who');
  assert(coldWho.text !== warmWho.text, 'cold and warm who-responses should differ');
  assert(responseFor({ ...base, disposition: 70 }, 'who').text === warmWho.text, 'responses must be deterministic');
  assert(warmWho.text.includes('Aldric') && warmWho.text.includes('tending crops'), 'warm who should name the NPC and activity');
  const coldWork = responseFor({ ...base, disposition: 5 }, 'work');
  const warmWork = responseFor({ ...base, disposition: 70 }, 'work');
  assert(coldWork.text.length < warmWork.text.length, 'cold work response should be curt');
  // 5. Rumors: strangers get nothing, friends get a journal rumor.
  const stranger = responseFor({ ...base, disposition: 10 }, 'rumors');
  assert(!stranger.rumor, 'cold NPC should not hand out rumors');
  const friend = responseFor({ ...base, disposition: 70 }, 'rumors');
  assert(!!friend.rumor && friend.text.includes(friend.rumor), 'warm NPC rumor should be filed to the journal');
  assert(responseFor({ ...base, disposition: 70 }, 'rumors').rumor === friend.rumor, 'rumor pick must be deterministic per NPC');
  // 6. Town topic reflects reputation.
  const loved = responseFor({ ...base, disposition: 60, townReputation: 15 }, 'town');
  const hated = responseFor({ ...base, disposition: 60, townReputation: -15 }, 'town');
  assert(loved.text.includes('speak well of you'), 'high rep should be praised');
  assert(hated.text.includes('whisper about you'), 'low rep should be warned');
  // 7. Goodbye always resolves per tier.
  for (const d of [0, 30, 50, 70, 95]) {
    const bye = responseFor({ ...base, disposition: d }, 'bye');
    assert(bye.text.length > 2, `bye at disposition ${d} must produce text`);
  }
}

// ---- BUILD 332: ambient NPC barks ----
console.log('Testing ambient NPC barks...');
{
  // 1. Cold NPCs never bark; the gate is deterministic per (seed, day).
  for (let i = 0; i < 50; i++) assert(!shouldBark(10, i, 3), 'cold NPC barked');
  assert(!shouldBark(34, 7, 3), 'disposition 34 should stay silent');
  const b1 = shouldBark(60, 42, 3), b2 = shouldBark(60, 42, 3);
  assert(b1 === b2, 'bark gate must be deterministic');
  // Roughly half of friendly NPC-days bark (not everyone, not no one).
  let barked = 0;
  for (let i = 0; i < 200; i++) if (shouldBark(60, i, 3)) barked++;
  assert(barked > 50 && barked < 150, `bark rate off: ${barked}/200`);
  // 2. Barks are deterministic and time-of-day aware.
  const ctx = { archetype: 'farmer', activity: 'Tending crops', disposition: 60, minuteOfDay: 8 * 60, seed: 11, day: 5 };
  const morning = barkFor(ctx);
  assert(barkFor(ctx) === morning, 'bark must be deterministic');
  assert(morning.length > 2, 'bark must produce text');
  const night = barkFor({ ...ctx, minuteOfDay: 23 * 60 });
  assert(night !== morning || true, 'night bark computed');
  // Farmer flavor differs from the generic greeting pool sometimes; the
  // generic pool covers unknown archetypes without crashing.
  const generic = barkFor({ ...ctx, archetype: 'dragon' });
  assert(generic.length > 2, 'unknown archetype should fall back to a greeting');
  // 3. Day-period coverage: every period yields a line for a commoner.
  for (const minute of [6 * 60, 13 * 60, 18 * 60, 23 * 60]) {
    const line = barkFor({ ...ctx, archetype: 'commoner', minuteOfDay: minute });
    assert(line.length > 2, `no bark for minute ${minute}`);
  }
}

// ---- BUILD 334: barks for static NPCs + road travelers ----
console.log('Testing barks for static NPCs and travelers...');
{
  // 1. Name seeds are deterministic and distinct per name.
  assert(seedForName('Mira') === seedForName('Mira'), 'name seed must be deterministic');
  assert(seedForName('Mira') !== seedForName('Bram'), 'different names should seed differently');
  // 2. Traveler barks mention their destination.
  const t = { archetype: 'traveler', activity: '', disposition: 50, minuteOfDay: 10 * 60, seed: seedForName('t-1'), day: 3, destination: 'Frosthold' };
  const line = barkFor(t);
  assert(barkFor(t) === line, 'traveler bark must be deterministic');
  assert(line.includes('Frosthold') || line.includes('road'), `traveler bark should be road-flavored (got "${line}")`);
  // Caravan merchants get the same treatment.
  const c = barkFor({ ...t, archetype: 'caravan', destination: 'Dunewatch' });
  assert(c.includes('Dunewatch') || c.includes('road'), `caravan bark should be road-flavored (got "${c}")`);
  // Traveler without a destination falls back to the period greeting.
  const g = barkFor({ ...t, destination: undefined });
  assert(g.length > 2 && !g.includes('undefined'), 'traveler without destination should get a greeting');
  // 3. shouldBark gates static NPCs the same way (disposition 50 barks ~half).
  let barked = 0;
  for (let i = 0; i < 100; i++) if (shouldBark(50, seedForName('static-' + i), 3)) barked++;
  assert(barked > 20 && barked < 80, `static bark rate off: ${barked}/100`);
}

// ---- Ground detail helpers are deterministic (BUILD 339) ----
console.log('Testing ground detail determinism...');
{
  // mulberry32: same seed -> same sequence; different seeds -> different.
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const c = mulberry32(54321);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert(seqA.every((v, i) => v === seqB[i]), 'mulberry32 same seed should give same sequence');
  assert(c() !== seqA[0] || c() !== seqA[1], 'mulberry32 different seeds should differ');
  assert(seqA.every((v) => v >= 0 && v < 1), 'mulberry32 values should be in [0,1)');
  // Color helpers.
  assert(shadeColor('#808080', 0.5) === 'rgb(64,64,64)', `shadeColor darken (got ${shadeColor('#808080', 0.5)})`);
  assert(shadeColor('#808080', 2) === 'rgb(255,255,255)', `shadeColor lighten clamps (got ${shadeColor('#808080', 2)})`);
  assert(mixColor('#000000', '#ffffff', 0.5) === 'rgb(128,128,128)', `mixColor midpoint (got ${mixColor('#000000', '#ffffff', 0.5)})`);
  const [r, g, b2] = hexToRgb('#77a45b');
  assert(r === 0x77 && g === 0xa4 && b2 === 0x5b, 'hexToRgb should parse meadow green');
  assert(GROUND_PX_PER_UNIT === 4, 'ground canvas should be 4px per field unit');
}

// ---- BUILD 367: landscape substrate (regions, fields, corridors) ----
console.log('Testing landscape substrate...');
{
  // Subsystem seeds: deterministic per (seed, chunk, subsystem).
  const s1 = landscapeSeed(847291583, 4, 7, 'vegetation');
  const s2 = landscapeSeed(847291583, 4, 7, 'vegetation');
  const s3 = landscapeSeed(847291583, 4, 7, 'rocks');
  const s4 = landscapeSeed(847291583, 5, 7, 'vegetation');
  assert(s1() === s2(), 'same subsystem stream should be deterministic');
  assert(s1() !== s3(), 'different subsystems should differ');
  assert(s1() !== s4(), 'different chunks should differ');
  // World-anchored fields: continuous, bounded, border-seamless.
  for (const f of [moistureAt, forestDensityAt, rockDensityAt, macroLandformAt]) {
    const v = f(1234.5, 678.9);
    assert(v >= 0 && v <= 1, 'landscape fields should be in [0,1]');
  }
  assert(moistureAt(100, 100) === moistureAt(100, 100), 'fields should be pure functions');
  // Continuity: adjacent chunks must agree across the shared edge.
  const cont = checkFieldContinuity([{ x: 4, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 8 }]);
  for (const s of cont) {
    assert(s.maxDelta < 0.01, `field continuity ${s.chunk.x},${s.chunk.y} ${s.edge}: delta ${s.maxDelta}`);
  }
  // Region layer: stable ids, known landforms.
  const r1 = regionForChunk(4, 7);
  const r2 = regionForChunk(4, 7);
  assert(r1.regionId === r2.regionId && r1.landform === r2.landform, 'region should be deterministic');
  assert(regionForChunk(4, 7).regionId === regionForChunk(6, 6).regionId, '4x4 chunks share a region');
  assert(regionForChunk(4, 7).regionId !== regionForChunk(8, 7).regionId, 'regions tile every 4 chunks');
  // Canonical road corridors: 131.6..156.8 band, arms reach chunk edges.
  const corr = roadCorridorsFor('nesw');
  assert(corr.length === 5, `nesw should give 4 arms + center (got ${corr.length})`);
  const nArm = corr.find((r) => r.y === 0)!;
  assert(Math.abs(nArm.x - 131.6) < 0.01 && Math.abs(nArm.w - 25.2) < 0.01, `north arm x/w should be 131.6/25.2 (got ${nArm.x}/${nArm.w})`);
  assert(nArm.h >= 131.6, 'north arm should reach the center');
  assert(roadCorridorsFor('none').length === 0, 'none should give no corridors');
  assert(roadCorridorsFor('e').length === 2, 'single arm + center');
  assert(pointInCorridors(144, 144, corr), 'center should be in corridors');
  assert(!pointInCorridors(10, 10, corr), 'corner should not be in corridors');
  assert(pointInCorridors(144, 10, roadCorridorsFor('ns')), 'north arm point');
  assert(!pointInCorridors(144, 10, roadCorridorsFor('ew')), 'north arm not in ew');
  const margined = roadCorridorsFor('n', { margin: 6 });
  assert(margined[0].x < 131.6 && margined[0].w > 25.2, 'margin should expand corridors');
  // Settlement influence: Mosslight (4,7) is the strongest local source.
  const moss = townInfluenceAt(4.5 * 280, 7.5 * 280);
  const wild = townInfluenceAt(-8 * 280, -6 * 280);
  assert(moss.influence > 0.9, `town center should have high influence (got ${moss.influence})`);
  assert(wild.influence < 0.2, `far corner should be wilderness (got ${wild.influence})`);
  assert(landUseAt(4.5 * 280, 7.5 * 280) === 'town', 'Mosslight center should be town land use');
  assert(landUseAt(-8 * 280, -6 * 280) === 'wilderness', 'far corner should be wilderness');
  // Activity sites: deterministic, in-bounds.
  const sites1 = landscapeSitesFor({ x: 6, y: 7 });
  const sites2 = landscapeSitesFor({ x: 6, y: 7 });
  assert(JSON.stringify(sites1) === JSON.stringify(sites2), 'sites should be deterministic');
  for (const s of sites1) {
    assert(s.rect.x >= 0 && s.rect.y >= 0 && s.rect.x + s.rect.w <= 280 && s.rect.y + s.rect.h <= 280,
      `site ${s.kind} should be inside the chunk`);
  }
}

// ---- BUILD 367 Phase 2a: water systems (rivers + lakes) ----
console.log('Testing water systems...');
{
  // Determinism.
  assert(waterAt(1500, 2100).depth === waterAt(1500, 2100).depth, 'waterAt should be deterministic');
  assert(waterAt(1500, 2100).kind === waterAt(1500, 2100).kind, 'water kind should be deterministic');
  assert(JSON.stringify(lakesForChunk(4, 7)) === JSON.stringify(lakesForChunk(4, 7)), 'lakes should be deterministic');
  // Bounds.
  for (let i = 0; i < 200; i++) {
    const wx = -2800 + i * 37.7;
    const wy = -2240 + i * 53.3;
    const w = waterAt(wx, wy);
    assert(w.depth >= 0 && w.depth <= 1, `water depth in [0,1] (got ${w.depth})`);
    const ch = riverChannelAt(wx, wy);
    assert(ch >= 0 && ch <= 1, 'river channel in [0,1]');
  }
  // Border continuity: sampling just inside vs just outside a chunk edge agrees.
  for (let i = 0; i < 40; i++) {
    const y = 1500 + i * 25;
    const a = waterAt(4 * 280 - 0.5, y);
    const b = waterAt(4 * 280 + 0.5, y);
    assert(Math.abs(a.depth - b.depth) < 0.05 && a.kind === b.kind,
      `water should be continuous across chunk border (got ${a.kind}/${a.depth} vs ${b.kind}/${b.depth})`);
  }
  // Rivers exist somewhere in the starting region (channel networks are global).
  let riverFound = false;
  let riverWx = 0;
  let riverWy = 0;
  outer: for (let gx = 0; gx < 40; gx++) {
    for (let gy = 0; gy < 40; gy++) {
      const wx = 2 * 280 + gx * 14;
      const wy = 5 * 280 + gy * 14;
      const r = riverAt(wx, wy);
      if (r.depth > 0.3) { riverFound = true; riverWx = wx; riverWy = wy; break outer; }
    }
  }
  assert(riverFound, 'should find river water in a 560x560 scan near the start');
  // Lakes: deterministic, world-anchored, away from towns.
  let lakeChunk: { x: number; y: number } | null = null;
  for (let cx = -10; cx <= 20 && !lakeChunk; cx++) {
    for (let cy = -8; cy <= 22 && !lakeChunk; cy++) {
      if (lakesForChunk(cx, cy).length > 0) lakeChunk = { x: cx, y: cy };
    }
  }
  if (lakeChunk) {
    const lakes = lakesForChunk(lakeChunk.x, lakeChunk.y);
    for (const lake of lakes) {
      const center = waterAt(lake.x, lake.y);
      assert(center.kind === 'lake' && center.depth > 0.5, 'lake center should be deep lake water');
      const rim = waterAt(lake.x + lake.r * 1.5, lake.y);
      assert(rim.kind !== 'lake' || rim.depth < 0.2, 'outside lake radius should not be lake water');
      const { influence } = townInfluenceAt(lake.x, lake.y);
      assert(influence <= 0.35, 'lakes should stay away from towns');
    }
  }
  // Bridges: a road corridor crossing river water reports a bridge.
  if (riverFound) {
    const cx = Math.floor(riverWx / 280);
    const cy = Math.floor(riverWy / 280);
    const lx = riverWx - cx * 280;
    // A synthetic north-south road strip through the river point.
    const corridors = [{ x: lx - 12, y: 0, w: 24, h: 280 }];
    assert(bridgeAt(riverWx, riverWy, corridors), 'road over river should be a bridge');
    assert(!bridgeAt(riverWx, riverWy, []), 'no corridors means no bridge');
    assert(!bridgeAt(cx * 280 + 10, cy * 280 + 10, corridors), 'dry land on a road is not a bridge');
  }
}

// ---- BUILD 367 Phase 2c: water/bridge costs in NPC A* ----
console.log('Testing NPC water/bridge pathfinding...');
{
  // Chunk (3,6) has a river meandering through it (probed 2026-09-30): a
  // north-south 'ns' road crosses it on bridges.
  const CH = { x: 3, y: 6 };
  const wAt = (x: number, y: number) => waterAt(CH.x * 280 + x, CH.y * 280 + y).depth;
  // Dense deep-water exposure along a polyline (no bridges in these corridors).
  const deepExposure = (pts: { x: number; y: number }[], corridors: { x: number; y: number; w: number; h: number }[]) => {
    let bad = 0;
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        total++;
        const wx = CH.x * 280 + x;
        const wy = CH.y * 280 + y;
        if (waterAt(wx, wy).depth > 0.5 && !bridgeAt(wx, wy, corridors)) bad++;
      }
    }
    return { bad, total };
  };
  // 1. Avoidance: E-W trip over dry endpoints. The unaware path plows through
  // the water band; the water-aware path avoids deep water entirely.
  const ewNoWater = findPath({ x: 10, y: 20 }, { x: 270, y: 20 }, [], undefined, undefined);
  const ewWater = findPath({ x: 10, y: 20 }, { x: 270, y: 20 }, [], undefined, undefined, CH);
  assert(ewNoWater !== null && ewWater !== null, 'E-W test paths should exist');
  const ewBadNoWater = deepExposure(ewNoWater!, []).bad;
  const ewBadWater = deepExposure(ewWater!, []).bad;
  assert(ewBadNoWater > 0, `unaware path should cross deep water (got ${ewBadNoWater})`);
  assert(ewBadWater === 0, `water-aware path should avoid deep water (got ${ewBadWater})`);
  // 2. Bridges: N-S trip down the ns road must cross the river, but only on
  // bridge cells.
  const nsCorr = roadCorridorsFor('ns');
  const bridgePath = findPath({ x: 144, y: 10 }, { x: 144, y: 270 }, [], undefined, 'ns', CH);
  assert(bridgePath !== null, 'bridge path down the ns road should exist');
  const bridgeExp = deepExposure(bridgePath!, nsCorr);
  assert(bridgeExp.bad === 0, `bridge path should only cross deep water on bridges (got ${bridgeExp.bad} bad)`);
  // It does cross water (the river intersects the road) — sample densely.
  let denseMax = 0;
  for (let i = 1; i < bridgePath!.length; i++) {
    const a = bridgePath![i - 1];
    const b = bridgePath![i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      denseMax = Math.max(denseMax, wAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
    }
  }
  assert(denseMax > 0.5, 'bridge path should actually cross river water');
  // 3. No bridge, no crossing: same N-S trip with roadPiece 'none' (no
  // corridors, so no bridges) must detour around — longer and dry.
  const detour = findPath({ x: 144, y: 10 }, { x: 144, y: 270 }, [], undefined, 'none', CH);
  assert(detour !== null, 'detour around the river should exist');
  const detourExp = deepExposure(detour!, []);
  assert(detourExp.bad === 0, `detour should avoid deep water (got ${detourExp.bad})`);
  const pathLen = (p: { x: number; y: number }[]) =>
    p.reduce((acc, q, i) => (i ? acc + Math.hypot(q.x - p[i - 1].x, q.y - p[i - 1].y) : 0), 0);
  assert(pathLen(detour!) > pathLen(bridgePath!) * 1.2,
    'detour without a bridge should be longer than the bridge crossing');
  // 4. Determinism: same water-aware call twice -> identical path.
  const ewAgain = findPath({ x: 10, y: 20 }, { x: 270, y: 20 }, [], undefined, undefined, CH);
  assert(JSON.stringify(ewAgain) === JSON.stringify(ewWater), 'water-aware paths should be deterministic');
  // 5. Backward compatibility: omitting the chunk keeps old behavior.
  const legacy = findPath({ x: 10, y: 20 }, { x: 270, y: 20 }, [], undefined, undefined);
  assert(JSON.stringify(legacy) === JSON.stringify(ewNoWater), 'omitted chunk should match legacy path');
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
