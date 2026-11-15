/**
 * Quest Playthrough Test — BUILD 557
 *
 * End-to-end test of "Rats in the Cellar" using REAL quest logic.
 * Tests: accept → progress → complete → rewards → save/restore.
 * Also tests failure cases: early turn-in, partial kills, etc.
 *
 * Uses production functions from src/game/quests.ts (not mocks).
 * Run: npx tsx tests/quest-playthrough.mts
 *
 * NOTE (PR #61 quest fix): the production API is the schema-2 storage
 * model — a game event is written to the QuestStorage store first via
 * writeQuestEventToStorage, then advanceQuestStage reads the store.
 * Save/restore uses serializeQuestSave/parseQuestSave, which persist
 * states + storage together. Same coverage as the original test; the
 * old serializeQuestStates/parseQuestStates names no longer exist and
 * the old 3-arg advanceQuestStage(state, def, event) call passed the
 * event where the store belongs, so the test now threads the store.
 */
import {
  questById, startQuest, advanceQuestStage, writeQuestEventToStorage,
  serializeQuestSave, parseQuestSave,
  type QuestState, type QuestStorage, type QuestEvent,
} from '../src/game/quests.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      passed++;
      console.log(`✅ ${name}`);
    } else {
      failed++;
      console.log(`❌ ${name}`);
    }
  } catch (e) {
    failed++;
    console.log(`❌ ${name} (threw: ${(e as Error).message.slice(0, 60)})`);
  }
}

// P1: Full playthrough
const def = questById('rats-in-the-cellar')!;

// Production flow: write the event to the store, then advance from the
// store. advanceQuestStage only READS the store — it never applies the
// event itself.
function applyEvent(
  state: QuestState,
  storage: QuestStorage,
  event: QuestEvent,
): { state: QuestState; storage: QuestStorage; advanced: boolean; completed: boolean } {
  const next = writeQuestEventToStorage(storage, event);
  const result = advanceQuestStage(state, def, next, event);
  return { state: result.state, storage: next, advanced: result.advanced, completed: result.completed };
}

let storage: QuestStorage = {};

test('Quest exists with correct giver', () => {
  return def.giver.name === 'Mira' && def.title === 'Rats in the Cellar';
});

test('Quest has 3 stages: talk → kill 5 rats → talk', () => {
  return def.stages.length === 3 &&
    def.stages[0].kind === 'talk' &&
    def.stages[1].kind === 'kill' && def.stages[1].count === 5 &&
    def.stages[2].kind === 'talk';
});

let state: QuestState = startQuest(def, 1);
test('startQuest creates active state at stage 0', () => {
  return state.status === 'active' && state.stageIndex === 0 && state.questId === 'rats-in-the-cellar';
});

// Stage 0: talk to Mira
let step = applyEvent(state, storage, { type: 'talk', target: 'Mira' });
state = step.state;
storage = step.storage;
test('Talk to Mira advances to stage 1 (kill rats)', () => {
  return step.advanced && state.stageIndex === 1;
});

// Stage 1: kill 5 rats
for (let i = 1; i <= 5; i++) {
  step = applyEvent(state, storage, { type: 'kill', target: 'rat' });
  state = step.state;
  storage = step.storage;
}
test('Killing 5 rats advances to stage 2 (return)', () => {
  return state.stageIndex === 2 && (state.progress['kill-rats'] ?? 0) >= 5;
});

// Stage 2: return to Mira
step = applyEvent(state, storage, { type: 'talk', target: 'Mira' });
state = step.state;
storage = step.storage;
test('Return to Mira completes quest', () => {
  return step.completed && state.status === 'completed';
});

test('Rewards defined (25 coins, 40 xp, items)', () => {
  return def.rewards.coins === 25 && def.rewards.xp === 40 && def.rewards.items.length === 2;
});

// Save/restore round-trip
test('Serialize/parse round-trip preserves completion', () => {
  const json = serializeQuestSave([state], storage);
  const restored = parseQuestSave(json);
  return restored.states.length === 1 &&
    restored.states[0].questId === 'rats-in-the-cellar' &&
    restored.states[0].status === 'completed' &&
    restored.storage['quest:rats-in-the-cellar:kill-rats'] === 5;
});

// P2: Failure cases
test('FAIL: Turn in before killing rats does not complete', () => {
  let s = startQuest(def, 1);
  let st: QuestStorage = {};
  let r = applyEvent(s, st, { type: 'talk', target: 'Mira' });
  s = r.state;
  st = r.storage;
  // Try to talk again (should not skip kill stage)
  r = applyEvent(s, st, { type: 'talk', target: 'Mira' });
  return !r.completed && r.state.stageIndex === 1;
});

test('FAIL: Killing only 3 rats does not advance', () => {
  let s = startQuest(def, 1);
  let st: QuestStorage = {};
  let r = applyEvent(s, st, { type: 'talk', target: 'Mira' });
  s = r.state;
  st = r.storage;
  for (let i = 0; i < 3; i++) {
    r = applyEvent(s, st, { type: 'kill', target: 'rat' });
    s = r.state;
    st = r.storage;
  }
  return s.stageIndex === 1; // Still on kill stage
});

test('FAIL: Talking to wrong NPC does not advance', () => {
  const s0 = startQuest(def, 1);
  const r = applyEvent(s0, {}, { type: 'talk', target: 'Bryn' });
  return !r.advanced && r.state.stageIndex === 0;
});

test('FAIL: Invalid quest ID returns undefined', () => {
  return questById('nonexistent-quest') === undefined;
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
