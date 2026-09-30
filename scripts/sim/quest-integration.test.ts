// BUILD 283: quest-system integration — focused simulation tests.
// Run with: npx tsx scripts/sim/quest-integration.test.ts
import {
  QUESTS,
  STORY_QUEST_ID,
  questById,
  startQuest,
  availableQuests,
  advanceQuestStage,
  questProgressText,
  serializeQuestStates,
  parseQuestStates,
  type QuestState,
} from '../../src/game/quests';
import {
  QUEST_SITES,
  sitesForTarget,
  sitesForActiveStages,
  resolveSiteChunk,
  chunkSatisfiesStage,
} from '../../src/game/questSites';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; if (failures.length < 20) failures.push(message); }
}

// ---- 1. Quest defs: ten quests, levels 1-10, story quest present ----
assert(QUESTS.length === 10, 'ten quest defs');
const levels = QUESTS.map((q) => q.level).sort((a, b) => a - b);
assert(levels.join(',') === '1,2,3,4,5,6,7,8,9,10', 'quests span levels 1-10');
const story = questById(STORY_QUEST_ID);
assert(!!story && story.storyQuest === true, 'story quest flagged');
assert(story !== undefined && story.stages.length === 6, 'story quest has six stages');

// ---- 2. Accept flow: talk stage auto-completes on accept ----
const rats = questById('rats-in-the-cellar')!;
let ratsState = startQuest(rats, 12);
assert(ratsState.status === 'active' && ratsState.stageIndex === 0, 'quest starts at stage 0');
const acceptRes = advanceQuestStage(ratsState, rats, { type: 'talk', target: 'Mira', day: 12 });
assert(acceptRes.advanced && !acceptRes.completed, 'accept talk advances to stage 1');
assert(acceptRes.state.stageIndex === 1, 'stage index moved past talk');
ratsState = acceptRes.state;

// ---- 3. Kill events accumulate ----
for (let i = 0; i < 4; i++) {
  const res = advanceQuestStage(ratsState, rats, { type: 'kill', target: 'rat' });
  assert(res.advanced && !res.completed, `rat kill ${i + 1} accumulates`);
  ratsState = res.state;
}
assert(ratsState.progress['kill-rats'] === 4, 'kill progress tracked');
const finalKill = advanceQuestStage(ratsState, rats, { type: 'kill', target: 'rat' });
assert(finalKill.advanced && !finalKill.completed, 'fifth rat completes kill stage');
assert(finalKill.state.stageIndex === 2, 'moved to return stage');
ratsState = finalKill.state;

// ---- 4. Return talk completes the quest ----
const done = advanceQuestStage(ratsState, rats, { type: 'talk', target: 'Mira', day: 13 });
assert(done.completed && done.state.status === 'completed', 'return talk completes quest');
assert(done.state.completedDay === 13, 'completedDay recorded');

// ---- 5. Explore events now match explore stages ----
const heirloom = questById('lost-heirloom')!;
let heirloomState = advanceQuestStage(startQuest(heirloom, 5), heirloom, { type: 'talk', target: 'Mabel', day: 5 }).state;
const exploreRes = advanceQuestStage(heirloomState, heirloom, { type: 'explore', target: 'buried_treasure', day: 5 });
assert(exploreRes.advanced && !exploreRes.completed, 'explore event matches explore stage');
assert(exploreRes.state.stageIndex === 2, 'explore advanced to return stage');

// ---- 6. Collect + craft (silk quest) ----
const silk = questById('silk-for-the-seamstress')!;
let silkState = advanceQuestStage(startQuest(silk, 5), silk, { type: 'talk', target: 'Elsa', day: 5 }).state;
const collectRes = advanceQuestStage(silkState, silk, { type: 'collect', target: 'spider_silk', count: 6 });
assert(collectRes.advanced && collectRes.state.stageIndex === 2, 'collecting 6 silk reaches craft stage');
silkState = collectRes.state;
const craftRes = advanceQuestStage(silkState, silk, { type: 'craft', target: 'bowstring' });
assert(craftRes.advanced && craftRes.state.stageIndex === 3, 'craft bowstring advances');

// ---- 7. Visit events (caravan quest) ----
const caravan = questById('caravan-guard')!;
let caravanState = advanceQuestStage(startQuest(caravan, 5), caravan, { type: 'talk', target: 'Cedric', day: 5 }).state;
const visitRes = advanceQuestStage(caravanState, caravan, { type: 'visit', target: 'greenfield' });
assert(visitRes.advanced && visitRes.state.stageIndex === 2, 'visit greenfield advances');

// ---- 8. Wrong events do not advance ----
const wrong = advanceQuestStage(silkState, silk, { type: 'kill', target: 'spider' });
assert(!wrong.advanced, 'kill does not advance a craft stage');
const wrongTarget = advanceQuestStage(ratsState, rats, { type: 'kill', target: 'wolf' });
assert(!wrongTarget.advanced, 'wrong kill target does not advance');

// ---- 9. availableQuests level gating ----
const noneAvail = availableQuests(1, []);
assert(noneAvail.some((q) => q.id === 'rats-in-the-cellar'), 'level 1 quest available at level 1');
assert(noneAvail.some((q) => q.id === 'lost-heirloom'), 'level 2 quest available at level 1 (level+1 gate)');
assert(!noneAvail.some((q) => q.id === 'wolf-pack'), 'level 3 quest gated at level 1');
const withActive: QuestState[] = [startQuest(rats, 1)];
assert(!availableQuests(1, withActive).some((q) => q.id === 'rats-in-the-cellar'), 'active quest not re-offered');
assert(!availableQuests(1, [done.state]).some((q) => q.id === 'rats-in-the-cellar'), 'completed quest not re-offered');

// ---- 10. Progress text ----
const progressState: QuestState = { ...startQuest(rats, 1), stageIndex: 1, progress: { 'talk-mira': 1, 'kill-rats': 3, 'return-mira': 0 } };
assert(questProgressText(rats, progressState).includes('3/5'), 'progress text shows 3/5');

// ---- 11. Serialization round-trip ----
const json = serializeQuestStates([done.state, progressState]);
const parsed = parseQuestStates(json);
assert(parsed.length === 2, 'round-trip keeps both states');
assert(parsed[0].status === 'completed' && parsed[0].completedDay === 13, 'round-trip keeps completion');
assert(parseQuestStates('not json').length === 0, 'bad json parses to empty');
assert(parseQuestStates(JSON.stringify({ schema: 1, states: [{ questId: 'nope' }] })).length === 0, 'unknown quest dropped');

// ---- 12. Quest sites ----
assert(QUEST_SITES.length >= 9, 'site table populated');
assert(sitesForTarget('buried_treasure').length === 2, 'two buried-treasure sites');
assert(sitesForTarget('BURIED_TREASURE').length === 2, 'site lookup is case-insensitive');
const activeStages = [
  { questId: 'lost-heirloom', kind: 'explore', target: 'buried_treasure' },
  { questId: 'the-old-crypt', kind: 'collect', target: 'funerary_mask' },
  { questId: 'caravan-guard', kind: 'visit', target: 'greenfield' },
];
const relevant = sitesForActiveStages(activeStages);
assert(relevant.length === 4, 'relevant sites: 2 treasure + mask + greenfield, got ' + relevant.length);
assert(relevant.every((s) => (s.eventType === 'explore' && s.target === 'buried_treasure') || (s.eventType === 'collect' && s.target === 'funerary_mask') || (s.eventType === 'visit' && s.target === 'greenfield')), 'relevant sites match stage kinds');
assert(sitesForActiveStages([{ questId: 'x', kind: 'kill', target: 'rat' }]).length === 0, 'kill stages have no sites');

// resolveSiteChunk: fixed vs dungeon
const fixed = QUEST_SITES.find((s) => s.target === 'ember_seal')!;
assert(resolveSiteChunk(fixed, null)?.x === 1 && resolveSiteChunk(fixed, { x: 9, y: 9 })?.x === 1, 'fixed chunk ignores dungeon');
const mask = QUEST_SITES.find((s) => s.target === 'funerary_mask')!;
assert(resolveSiteChunk(mask, null) === null, 'dungeon site unresolved without dungeon');
assert(resolveSiteChunk(mask, { x: 7, y: 3 })?.x === 7, 'dungeon site resolves to dungeon chunk');

// chunkSatisfiesStage
assert(chunkSatisfiesStage({ questId: 'a', kind: 'explore', target: 'buried_treasure' }, { x: 5, y: 7 }, null), 'oak chunk satisfies');
assert(!chunkSatisfiesStage({ questId: 'a', kind: 'explore', target: 'buried_treasure' }, { x: 4, y: 7 }, null), 'wrong chunk does not satisfy');
assert(chunkSatisfiesStage({ questId: 'a', kind: 'visit', target: 'greenfield' }, { x: 6, y: 7 }, null), 'greenfield visit satisfies');
assert(chunkSatisfiesStage({ questId: 'a', kind: 'visit', target: 'greenfield' }, { x: 6, y: 7 }, { x: 1, y: 1 }), 'dungeon chunk irrelevant for fixed sites');
assert(chunkSatisfiesStage({ questId: 'a', kind: 'explore', target: 'crypt' }, { x: 7, y: 3 }, { x: 7, y: 3 }), 'crypt satisfied at dungeon chunk');
assert(!chunkSatisfiesStage({ questId: 'a', kind: 'explore', target: 'crypt' }, { x: 7, y: 3 }, null), 'crypt not satisfied without dungeon');
assert(!chunkSatisfiesStage({ questId: 'a', kind: 'kill', target: 'rat' }, { x: 5, y: 7 }, null), 'kill never chunk-satisfied');

console.log(`quest-integration: ${passed} passed, ${failed} failed`);
if (failures.length) console.log('failures:\n' + failures.join('\n'));
process.exit(failed === 0 ? 0 : 1);
