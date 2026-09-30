// POI + quest simulation tests.
// Run with: node_modules/.bin/esbuild scripts/sim/poi-quests.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/poi-quests.test.cjs && node /tmp/poi-quests.test.cjs
// Mirrors the assert/passed/failed conventions of scripts/simulate.ts.
import {
  poisForChunk,
  cemeteryForSettlement,
  treasureForPoi,
  lootForContext,
  mapToTreasure,
  discoverPoi,
  discoveryMessage,
  serializeDiscoveries,
  parseDiscoveries,
  mergeDiscoveries,
  monstersForPoiKind,
  dangerForPoi,
  isCavePoi,
  isCemeteryPoi,
  type PointOfInterest,
  type PoiKind,
} from '../../src/game/pointsOfInterest';
import {
  QUESTS,
  STORY_QUEST_ID,
  questById,
  storyQuest,
  startQuest,
  availableQuests,
  advanceQuestStage,
  questRewards,
  questRumors,
  serializeQuestStates,
  parseQuestStates,
} from '../../src/game/quests';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; if (failures.length < 30) failures.push(message); }
}

// ---- 1. POI determinism: same chunk + seed -> identical POIs ----
console.log('Testing POI determinism...');
for (let i = 0; i < 200; i++) {
  const chunk = { x: 4 + (i % 9) - 4, y: 7 + ((i * 3) % 9) - 4 };
  const a = poisForChunk(chunk, 847291583);
  const b = poisForChunk(chunk, 847291583);
  assert(JSON.stringify(a) === JSON.stringify(b), `POIs not deterministic for chunk ${chunk.x},${chunk.y}`);
  // Structural invariants.
  assert(a.length >= 0 && a.length <= 3, `POI count out of range for chunk ${chunk.x},${chunk.y}: ${a.length}`);
  const ids = new Set(a.map((p) => p.id));
  assert(ids.size === a.length, `Duplicate POI ids in chunk ${chunk.x},${chunk.y}`);
  for (const poi of a) {
    assert(poi.position.x >= 0 && poi.position.x <= 140 && poi.position.y >= 0 && poi.position.y <= 140,
      `POI ${poi.id} position out of field bounds`);
    assert(poi.danger >= 0 && poi.danger <= 3, `POI ${poi.id} danger out of range`);
    assert(['common', 'uncommon', 'rare', 'very_rare', 'unique'].includes(poi.lootTier), `POI ${poi.id} bad loot tier`);
    assert(poi.description.length > 10, `POI ${poi.id} missing description`);
    assert(poi.discovered === false, `POI ${poi.id} should start undiscovered`);
    assert(poi.chunk.x === chunk.x && poi.chunk.y === chunk.y, `POI ${poi.id} chunk mismatch`);
  }
}

// ---- 2. Town chunks get no wilderness POIs ----
console.log('Testing town-chunk exclusion...');
for (let i = 0; i < 50; i++) {
  const chunk = { x: i - 25, y: 7 };
  const pois = poisForChunk(chunk, 847291583, { isTownChunk: true });
  assert(pois.length === 0, `Town chunk ${chunk.x},${chunk.y} got wilderness POIs`);
}

// ---- 3. Ruin history: built before abandoned ----
console.log('Testing POI history...');
let historySeen = 0;
for (let i = 0; i < 300; i++) {
  const pois = poisForChunk({ x: 100 + i, y: -50 - i }, 847291583);
  for (const poi of pois) {
    if (poi.history) {
      historySeen++;
      assert(poi.history.builtYear < poi.history.abandonedYear,
        `POI ${poi.id}: builtYear ${poi.history.builtYear} >= abandonedYear ${poi.history.abandonedYear}`);
      assert(poi.history.reason.length > 0 && poi.history.inhabitants.length > 0 && poi.history.discovery.length > 0,
        `POI ${poi.id}: incomplete history`);
    }
  }
}
assert(historySeen > 0, 'No POI histories generated across 300 chunks');

// ---- 4. Caves scale contents with size ----
console.log('Testing cave sizes...');
const caveSizes = new Set<string>();
for (let i = 0; i < 300 && caveSizes.size < 4; i++) {
  for (const poi of poisForChunk({ x: -200 - i, y: 300 + i }, 99)) {
    if (isCavePoi(poi)) {
      caveSizes.add(poi.size);
      assert(poi.chambers >= 1, `Cave ${poi.id} has no chambers`);
      assert(poi.contents.length > 0, `Cave ${poi.id} has no contents`);
      if (poi.size === 'small') assert(poi.chambers === 1, `Small cave ${poi.id} has ${poi.chambers} chambers`);
      if (poi.size === 'huge') assert(poi.chambers >= 4, `Huge cave ${poi.id} has only ${poi.chambers} chambers`);
    }
  }
}

// ---- 5. Cemetery sizes scale with settlement kind ----
console.log('Testing cemetery sizes...');
const city = cemeteryForSettlement('Aldor', 'city');
const town = cemeteryForSettlement('Greenfield', 'town');
const village = cemeteryForSettlement('Oakhollow', 'village');
assert(isCemeteryPoi(city) && isCemeteryPoi(town) && isCemeteryPoi(village), 'cemeteryForSettlement did not return cemetery POIs');
assert(city.cemetery.graves.length > town.cemetery.graves.length, `City graves (${city.cemetery.graves.length}) not > town (${town.cemetery.graves.length})`);
assert(town.cemetery.graves.length > village.cemetery.graves.length, `Town graves (${town.cemetery.graves.length}) not > village (${village.cemetery.graves.length})`);
assert(city.cemetery.graves.length >= 24, `City cemetery too small: ${city.cemetery.graves.length}`);
assert(village.cemetery.graves.length <= 8, `Village graveyard too big: ${village.cemetery.graves.length}`);
assert(city.cemetery.features.includes('Crypt entrances'), 'Large cemetery missing crypt entrances');
assert(!village.cemetery.features.includes('Crypt entrances'), 'Village graveyard should not have crypt entrances');
for (const grave of city.cemetery.graves) {
  assert(grave.bornYear < grave.diedYear, `Grave ${grave.name}: born after died`);
  assert(grave.name.includes(' '), `Grave missing full name: ${grave.name}`);
  assert(grave.epitaph.length > 0, `Grave ${grave.name} missing epitaph`);
}
// Deterministic for the same settlement name.
const city2 = cemeteryForSettlement('Aldor', 'city');
assert(JSON.stringify(city) === JSON.stringify(city2), 'Cemetery not deterministic for settlement name');

// ---- 6. Treasure context rules ----
console.log('Testing treasure context...');
for (let seed = 0; seed < 50; seed++) {
  const farmer = lootForContext('farmer', seed);
  assert(farmer.tier === 'common', `Farmer loot tier ${farmer.tier} is not common (seed ${seed})`);
  const merchant = lootForContext('merchant', seed);
  assert(merchant.tier === 'common' || merchant.tier === 'uncommon', `Merchant loot tier ${merchant.tier} too high`);
  const guard = lootForContext('guard', seed);
  assert(guard.tier === 'common' || guard.tier === 'uncommon', `Guard loot tier ${guard.tier} too high`);
  const crypt = lootForContext('crypt', seed);
  assert(crypt.tier === 'rare' || crypt.tier === 'very_rare', `Crypt loot tier ${crypt.tier} never common-tier-only violated (seed ${seed})`);
  const dragon = lootForContext('dragon_lair', seed);
  assert(dragon.tier === 'very_rare' || dragon.tier === 'unique', `Dragon lair loot tier ${dragon.tier} too low`);
  const bandit = lootForContext('bandit', seed);
  assert(bandit.tier === 'uncommon' || bandit.tier === 'rare', `Bandit loot tier ${bandit.tier} out of range`);
  // Determinism.
  assert(JSON.stringify(lootForContext('crypt', seed)) === JSON.stringify(lootForContext('crypt', seed)), 'lootForContext not deterministic');
}
// Contextual treasure per POI kind.
const cryptPoi: PointOfInterest = {
  id: 'poi-0,0-crypt-0', kind: 'crypt', name: 'Crypt of the Nameless King',
  chunk: { x: 0, y: 0 }, position: { x: 70, y: 70 }, discovered: false,
  danger: 2, lootTier: 'rare', description: 'A crypt.',
};
const cryptTreasure = treasureForPoi(cryptPoi);
assert(cryptTreasure.length === 1, 'Crypt should yield one treasure');
assert(cryptTreasure[0].kind === 'artifacts', `Crypt treasure kind ${cryptTreasure[0].kind} is not burial treasure`);
assert(cryptTreasure[0].tier !== 'common', 'Crypt treasure should never be common tier');
assert(cryptTreasure[0].contextualNote.length > 0, 'Crypt treasure missing contextual note');
assert(cryptTreasure[0].poiId === cryptPoi.id, 'Treasure poiId mismatch');
const campPoi: PointOfInterest = { ...cryptPoi, id: 'poi-0,0-bandit_camp-0', kind: 'bandit_camp', name: 'Redbrand Camp', lootTier: 'uncommon' };
const campTreasure = treasureForPoi(campPoi);
assert(campTreasure[0].contextualNote.toLowerCase().includes('stolen'), 'Bandit camp treasure should be stolen goods');

// ---- 7. Treasure maps reference their target ----
console.log('Testing treasure maps...');
const target: PointOfInterest = {
  id: 'poi-5,7-buried_treasure-0', kind: 'buried_treasure', name: 'Buried Cache',
  chunk: { x: 5, y: 7 }, position: { x: 90, y: 40 }, discovered: false,
  danger: 1, lootTier: 'rare', description: 'Buried.',
};
const map = mapToTreasure(target, 847291583);
assert(map.targetPoiId === target.id, 'Treasure map targetPoiId mismatch');
assert(map.name === 'Old Merchant\'s Map', `Treasure map name wrong: ${map.name}`);
assert(map.clues.length === 3, `Treasure map should have 3 clues, got ${map.clues.length}`);
const clueText = map.clues.join(' ').toLowerCase();
assert(clueText.includes('buried cache') || clueText.includes(target.name.toLowerCase()),
  'Treasure map clues do not reference the target');
assert(JSON.stringify(mapToTreasure(target, 847291583)) === JSON.stringify(mapToTreasure(target, 847291583)),
  'Treasure map not deterministic');

// ---- 8. Discovery ----
console.log('Testing discovery...');
const sample = poisForChunk({ x: 4, y: 7 }, 847291583)[0];
if (sample) {
  const { poi, discovery } = discoverPoi(sample, { day: 12, hour: 9 });
  assert(poi.discovered === true, 'discoverPoi did not mark discovered');
  assert(sample.discovered === false, 'discoverPoi mutated the input POI');
  assert(discovery.name === sample.name && discovery.kind === sample.kind, 'Discovery record name/kind mismatch');
  assert(discovery.discoveredAt.day === 12 && discovery.discoveredAt.hour === 9, 'Discovery time mismatch');
  assert(discovery.chunk.x === sample.chunk.x && discovery.position.x === sample.position.x, 'Discovery coords mismatch');
}
assert(discoveryMessage(cryptPoi) === 'Ancient Crypt discovered.', `Crypt message wrong: ${discoveryMessage(cryptPoi)}`);
const towerPoi: PointOfInterest = { ...cryptPoi, kind: 'watchtower' };
assert(discoveryMessage(towerPoi) === 'Abandoned Watchtower discovered.', `Watchtower message wrong: ${discoveryMessage(towerPoi)}`);
const kinds: PoiKind[] = ['ruin', 'cemetery', 'cave', 'shrine', 'bandit_camp', 'battlefield', 'buried_treasure', 'watchtower', 'crypt', 'mine', 'waterfall', 'ancient_tree', 'forgotten_grave', 'hidden_valley'];
for (const kind of kinds) {
  const msg = discoveryMessage({ ...cryptPoi, kind });
  assert(/^.+ discovered\.$/.test(msg), `Discovery message format wrong for ${kind}: ${msg}`);
}
// Serialization round-trip: only discovered ids persist.
const ids = ['poi-4,7-ruin-0', 'poi-5,7-crypt-1'];
const parsed = parseDiscoveries(serializeDiscoveries(ids));
assert(JSON.stringify(parsed) === JSON.stringify(ids), 'Discovery serialization round-trip failed');
assert(JSON.stringify(parseDiscoveries('not json')) === '[]', 'parseDiscoveries should return [] for garbage');
const merged = mergeDiscoveries(poisForChunk({ x: 4, y: 7 }, 847291583), ids);
assert(merged.every((p) => (ids.includes(p.id) ? p.discovered === true : p.discovered === false)),
  'mergeDiscoveries misapplied discovery state');

// ---- 9. Monster ecology ----
console.log('Testing monster ecology...');
assert(monstersForPoiKind('crypt').includes('skeleton'), 'Crypts should host skeletons');
assert(monstersForPoiKind('cave').includes('goblin'), 'Caves should host goblins');
assert(monstersForPoiKind('bandit_camp').includes('bandit'), 'Bandit camps should host bandits');
assert(monstersForPoiKind('shrine').length === 0, 'Shrines should host no monsters');
assert(monstersForPoiKind('cemetery').includes('skeleton'), 'Cemeteries should host skeletons');
for (const kind of kinds) {
  const d = dangerForPoi(kind);
  assert(d >= 0 && d <= 3, `dangerForPoi(${kind}) out of range`);
  const m = monstersForPoiKind(kind);
  assert(Array.isArray(m), `monstersForPoiKind(${kind}) not an array`);
}

// ---- 10. Quest definitions: 10 quests, levels 1-10 ----
console.log('Testing quest definitions...');
assert(QUESTS.length === 10, `Expected 10 quests, got ${QUESTS.length}`);
const levels = QUESTS.map((q) => q.level).sort((a, b) => a - b);
assert(JSON.stringify(levels) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), `Quest levels not 1-10: ${levels}`);
const questIds = new Set(QUESTS.map((q) => q.id));
assert(questIds.size === 10, 'Duplicate quest ids');
for (const q of QUESTS) {
  assert(q.stages.length >= 2 && q.stages.length <= 6, `Quest ${q.id} has ${q.stages.length} stages (want 2-6)`);
  assert(q.giver.name.length > 0 && q.giver.location.length > 0 && q.giver.hint.length > 0, `Quest ${q.id} giver incomplete`);
  assert(q.rewards.coins > 0 && q.rewards.xp > 0 && q.rewards.items.length > 0, `Quest ${q.id} rewards incomplete`);
  assert(q.description.length > 0, `Quest ${q.id} missing description`);
  const stageIds = new Set(q.stages.map((s) => s.id));
  assert(stageIds.size === q.stages.length, `Quest ${q.id} has duplicate stage ids`);
}
// Story quest.
const story = storyQuest();
assert(story.id === STORY_QUEST_ID, 'STORY_QUEST_ID mismatch');
assert(story.storyQuest === true, 'Story quest flag missing');
assert(story.level === 10, 'Story quest should be level 10');
assert(story.stages.length >= 4, `Story quest has only ${story.stages.length} stages`);
assert(questById(STORY_QUEST_ID) === story, 'questById(STORY_QUEST_ID) mismatch');
assert(questById('nope') === undefined, 'questById should return undefined for unknown id');

// ---- 11. Quest flow: start -> advance stages -> complete -> rewards ----
console.log('Testing quest flow...');
const rats = questById('rats-in-the-cellar');
assert(rats !== undefined, 'rats-in-the-cellar missing');
if (rats) {
  let state = startQuest(rats, 5);
  assert(state.status === 'active' && state.stageIndex === 0 && state.startedDay === 5, 'startQuest state wrong');
  // Wrong event type does nothing.
  let res = advanceQuestStage(state, rats, { type: 'kill', target: 'rat' });
  assert(!res.advanced && res.state === state, 'talk stage should ignore kill events');
  // Talk to Mira.
  res = advanceQuestStage(state, rats, { type: 'talk', target: 'Mira' });
  assert(res.advanced && !res.completed && res.state.stageIndex === 1, 'talk stage did not advance');
  state = res.state;
  // Kill 5 rats across events (partial progress).
  res = advanceQuestStage(state, rats, { type: 'kill', target: 'rat', count: 2 });
  assert(res.advanced && !res.completed && res.state.stageIndex === 1, 'partial kill should stay on stage');
  assert(res.state.progress['kill-rats'] === 2, 'kill progress not tracked');
  state = res.state;
  res = advanceQuestStage(state, rats, { type: 'kill', target: 'rat', count: 3 });
  assert(res.advanced && !res.completed && res.state.stageIndex === 2, 'kill stage did not complete at 5 rats');
  state = res.state;
  // Wrong NPC talk does nothing.
  res = advanceQuestStage(state, rats, { type: 'talk', target: 'Bram' });
  assert(!res.advanced, 'talk to wrong NPC should not advance');
  // Return to Mira with day set.
  res = advanceQuestStage(state, rats, { type: 'talk', target: 'Mira', day: 6 });
  assert(res.completed && res.state.status === 'completed', 'quest did not complete');
  assert(res.state.completedDay === 6, 'completedDay not set from event day');
  // Completed quests ignore further events.
  const done = advanceQuestStage(res.state, rats, { type: 'talk', target: 'Mira' });
  assert(!done.advanced && !done.completed, 'completed quest should ignore events');
  // Rewards.
  const rewards = questRewards(rats);
  assert(rewards.coins === rats.rewards.coins && rewards.xp === rats.rewards.xp, 'questRewards mismatch');
  assert(JSON.stringify(rewards.items) === JSON.stringify(rats.rewards.items), 'questRewards items mismatch');
}

// ---- 12. availableQuests respects level gating ----
console.log('Testing quest availability...');
{
  const l1 = availableQuests(1, []);
  assert(l1.every((q) => q.level <= 2), 'Level-1 player offered quests above level 2');
  assert(l1.some((q) => q.id === 'rats-in-the-cellar'), 'Level-1 player not offered rats quest');
  assert(l1.some((q) => q.id === 'lost-heirloom'), 'Level-1 player not offered level-2 quest');
  assert(!l1.some((q) => q.id === 'wolf-pack'), 'Level-1 player offered level-3 quest');
  assert(!l1.some((q) => q.id === STORY_QUEST_ID), 'Level-1 player offered story quest');
  const l9 = availableQuests(9, []);
  assert(l9.some((q) => q.id === STORY_QUEST_ID), 'Level-9 player not offered level-10 story quest');
  // Started quests are not re-offered.
  const started = startQuest(questById('rats-in-the-cellar')!, 1);
  const after = availableQuests(1, [started]);
  assert(!after.some((q) => q.id === 'rats-in-the-cellar'), 'Active quest re-offered');
  const finished = { ...started, status: 'completed' as const };
  const afterDone = availableQuests(1, [finished]);
  assert(!afterDone.some((q) => q.id === 'rats-in-the-cellar'), 'Completed quest re-offered');
}

// ---- 13. Quest rumors ----
console.log('Testing quest rumors...');
for (const q of QUESTS) {
  const rumors = questRumors(q);
  assert(rumors.length >= 2 && rumors.length <= 3, `Quest ${q.id}: ${rumors.length} rumors (want 2-3)`);
  const text = rumors.join(' ').toLowerCase();
  assert(text.includes(q.giver.name.toLowerCase()) || text.includes(q.giver.hint.toLowerCase().slice(0, 20)),
    `Quest ${q.id}: rumors do not hint at the giver`);
  assert(JSON.stringify(questRumors(q)) === JSON.stringify(rumors), `Quest ${q.id}: rumors not deterministic`);
}

// ---- 14. Quest serialization round-trip ----
console.log('Testing quest serialization...');
{
  const silk = questById('silk-for-the-seamstress')!;
  let state = startQuest(silk, 10);
  state = advanceQuestStage(state, silk, { type: 'talk', target: 'Elsa' }).state;
  state = advanceQuestStage(state, silk, { type: 'collect', target: 'spider_silk', count: 6 }).state;
  const states = [state, { ...startQuest(questById('wolf-pack')!, 11), status: 'completed' as const, completedDay: 13, stageIndex: 3 }];
  const roundTripped = parseQuestStates(serializeQuestStates(states));
  assert(JSON.stringify(roundTripped) === JSON.stringify(states), 'Quest serialization round-trip failed');
  assert(JSON.stringify(parseQuestStates('garbage')) === '[]', 'parseQuestStates should return [] for garbage');
  // Unknown quest ids are dropped on load.
  const withBogus = parseQuestStates(JSON.stringify({ schema: 1, states: [...states, { questId: 'nope', status: 'active', stageIndex: 0, progress: {} }] }));
  assert(withBogus.length === states.length, 'parseQuestStates should drop unknown quest ids');
}

// ---- Results ----
console.log(`\n${'='.repeat(50)}`);
console.log(`${'='.repeat(50)}`);
if (failures.length > 0) {
  console.log('\nFirst failures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log(`POI+QUEST SIMULATION COMPLETE: ${passed} passed, ${failed} failed`);
