/**
 * Quest Playthrough Test — BUILD 557
 *
 * End-to-end test of "Rats in the Cellar" using REAL quest logic.
 * Tests: accept → progress → complete → rewards → save/restore.
 * Also tests failure cases: early turn-in, partial kills, etc.
 *
 * Uses production functions from src/game/quests.ts (not mocks).
 * Run: npx tsx tests/quest-playthrough.mts
 */
import {
  questById, startQuest, advanceQuestStage,
  serializeQuestStates, parseQuestStates,
  type QuestState,
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
let result = advanceQuestStage(state, def, { type: 'talk', target: 'Mira' });
test('Talk to Mira advances to stage 1 (kill rats)', () => {
  return result.advanced && result.state.stageIndex === 1;
});
state = result.state;

// Stage 1: kill 5 rats
for (let i = 1; i <= 5; i++) {
  result = advanceQuestStage(state, def, { type: 'kill', target: 'rat' });
  state = result.state;
}
test('Killing 5 rats advances to stage 2 (return)', () => {
  return state.stageIndex === 2 && (state.progress['kill-rats'] ?? 0) >= 5;
});

// Stage 2: return to Mira
result = advanceQuestStage(state, def, { type: 'talk', target: 'Mira' });
test('Return to Mira completes quest', () => {
  return result.completed && result.state.status === 'completed';
});
state = result.state;

test('Rewards defined (25 coins, 40 xp, items)', () => {
  return def.rewards.coins === 25 && def.rewards.xp === 40 && def.rewards.items.length === 2;
});

// Save/restore round-trip
test('Serialize/parse round-trip preserves completion', () => {
  const json = serializeQuestStates([state]);
  const restored = parseQuestStates(json);
  return restored.length === 1 &&
    restored[0].questId === 'rats-in-the-cellar' &&
    restored[0].status === 'completed';
});

// P2: Failure cases
test('FAIL: Turn in before killing rats does not complete', () => {
  const s0 = startQuest(def, 1);
  const r0 = advanceQuestStage(s0, def, { type: 'talk', target: 'Mira' });
  // Try to talk again (should not skip kill stage)
  const r1 = advanceQuestStage(r0.state, def, { type: 'talk', target: 'Mira' });
  return !r1.completed && r1.state.stageIndex === 1;
});

test('FAIL: Killing only 3 rats does not advance', () => {
  let s = startQuest(def, 1);
  s = advanceQuestStage(s, def, { type: 'talk', target: 'Mira' }).state;
  for (let i = 0; i < 3; i++) {
    s = advanceQuestStage(s, def, { type: 'kill', target: 'rat' }).state;
  }
  return s.stageIndex === 1; // Still on kill stage
});

test('FAIL: Talking to wrong NPC does not advance', () => {
  const s0 = startQuest(def, 1);
  const r = advanceQuestStage(s0, def, { type: 'talk', target: 'Bryn' });
  return !r.advanced && r.state.stageIndex === 0;
});

test('FAIL: Invalid quest ID returns undefined', () => {
  return questById('nonexistent-quest') === undefined;
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
