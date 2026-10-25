/**
 * Quest Playthrough Test — current storage-key quest API.
 * Exercises the production progression and save/restore functions.
 * Run: npx tsx tests/quest-playthrough.mts
 */
import {
  questById, startQuest, advanceQuestStage, writeQuestEventToStorage,
  serializeQuestSave, parseQuestSave, questStorageKey,
  type QuestState, type QuestStorage, type QuestEvent,
} from '../src/game/quests.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) { passed++; console.log(`✅ ${name}`); }
    else { failed++; console.log(`❌ ${name}`); }
  } catch (e) {
    failed++;
    console.log(`❌ ${name} (threw: ${(e as Error).message.slice(0, 90)})`);
  }
}

const def = questById('rats-in-the-cellar')!;

function apply(state: QuestState, storage: QuestStorage, event: QuestEvent) {
  const nextStorage = writeQuestEventToStorage(storage, event);
  const result = advanceQuestStage(state, def, nextStorage, event);
  return { state: result.state, storage: nextStorage, result };
}

test('Quest exists with correct giver', () =>
  def.giver.name === 'Mira' && def.title === 'Rats in the Cellar');

test('Quest has talk → kill 5 rats → return stages', () =>
  def.stages.length === 3 &&
  def.stages[0].kind === 'talk' &&
  def.stages[1].kind === 'kill' && def.stages[1].count === 5 &&
  def.stages[2].kind === 'talk');

let storage: QuestStorage = {};
let state: QuestState = startQuest(def, 1, storage);
test('startQuest creates active state at stage 0',
  () => state.status === 'active' && state.stageIndex === 0 && state.questId === def.id);

let applied = apply(state, storage, { type: 'talk', target: 'Mira', day: 1 });
state = applied.state; storage = applied.storage;
test('Talk to Mira advances to stage 1 (kill rats)',
  () => applied.result.advanced && state.stageIndex === 1);

for (let i = 1; i <= 5; i++) {
  applied = apply(state, storage, { type: 'kill', target: 'rat', day: 1 });
  state = applied.state; storage = applied.storage;
}
test('Killing 5 rats advances to stage 2 (return)',
  () => state.stageIndex === 2 && (state.progress['kill-rats'] ?? 0) === 5);

applied = apply(state, storage, { type: 'talk', target: 'Mira', day: 1 });
state = applied.state; storage = applied.storage;
test('Return to Mira completes quest',
  () => applied.result.completed && state.status === 'completed');

test('Rewards defined (25 coins, 40 xp, two items)',
  () => def.rewards.coins === 25 && def.rewards.xp === 40 && def.rewards.items.length === 2);

test('Save/restore round-trip preserves completion and mission storage', () => {
  const restored = parseQuestSave(serializeQuestSave([state], storage));
  return restored.states.length === 1 &&
    restored.states[0].questId === def.id &&
    restored.states[0].status === 'completed' &&
    restored.storage[questStorageKey(def.id, 'kill-rats')] === 5;
});

test('Talking again before killing rats does not skip the kill stage', () => {
  let s = startQuest(def, 1, {});
  let store: QuestStorage = {};
  let a = apply(s, store, { type: 'talk', target: 'Mira', day: 1 });
  s = a.state; store = a.storage;
  a = apply(s, store, { type: 'talk', target: 'Mira', day: 1 });
  return !a.result.completed && a.state.stageIndex === 1;
});

test('Killing only 3 rats does not advance the kill stage', () => {
  let s = startQuest(def, 1, {});
  let store: QuestStorage = {};
  let a = apply(s, store, { type: 'talk', target: 'Mira', day: 1 });
  s = a.state; store = a.storage;
  for (let i = 0; i < 3; i++) {
    a = apply(s, store, { type: 'kill', target: 'rat', day: 1 });
    s = a.state; store = a.storage;
  }
  return s.stageIndex === 1 && (s.progress['kill-rats'] ?? 0) === 3;
});

test('Talking to the wrong NPC does not advance', () => {
  const s = startQuest(def, 1, {});
  const store = writeQuestEventToStorage({}, { type: 'talk', target: 'Bryn', day: 1 });
  const result = advanceQuestStage(s, def, store, { type: 'talk', target: 'Bryn', day: 1 });
  return !result.advanced && result.state.stageIndex === 0;
});

test('Invalid quest ID returns undefined', () => questById('nonexistent-quest') === undefined);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
