// BUILD 974: quest/persistence extras 6/6 — quest event vocabulary.
// Rules/formats only, original TypeScript. Ported rule (EQEmu analysis):
// a quest system exposes a small typed vocabulary of lifecycle events
// that quest/task code emits and other systems can observe — accepted,
// stage advanced, completed, failed, objective updated — instead of
// every consumer re-deriving transitions from raw state.
//
// AUDIT (stated, not hidden) — what already existed:
// - Quest/task PROGRESS events already existed: QuestEvent
//   (kill/collect/talk/visit/craft/explore) in quests.ts, written once
//   into the 936 storage store by writeQuestEventToStorage and read by
//   advanceQuestStage / evaluateTaskState. This module does NOT duplicate
//   that: progress events are inputs, lifecycle events are outputs.
// - Lifecycle transitions did NOT exist in any observable form: App.tsx
//   advanced stages inline and only wrote log lines ("Quest updated:",
//   "Quest complete:"). Nothing else could observe a completion — the
//   974 title award and flag writes below are the first observers, and
//   they consume events from this vocabulary, not from log text.
// - 'quest-failed' is vocabulary only: no quest in this game can fail
//   (there is no fail path, no timer, no fail state in QuestStatus),
//   so nothing emits it. It is reserved so a future fail path has a
//   kind to emit, not a promise that quests fail today.
// - Task lifecycle is NOT vocabularized here: tasks are the 940 shell
//   around the same quests, and task completion writes a world flag
//   (worldFlags.ts) rather than a second event stream. One lifecycle
//   stream for quests; flags for cross-system facts.

import type { QuestDef, QuestState } from './quests';

/** Lifecycle kinds a quest can go through. See the audit note above for 'quest-failed'. */
export type QuestLifecycleKind =
  | 'quest-accepted'
  | 'quest-stage-advanced'
  | 'quest-completed'
  | 'quest-failed'
  | 'quest-objective-updated';

/** One observed lifecycle transition. Transient (never saved) — the durable facts live in quest state + world flags. */
export type QuestLifecycleEvent = {
  kind: QuestLifecycleKind;
  questId: string;
  questTitle: string;
  /** In-game day at event time. */
  day: number;
  /** Stage the event concerns, when it has one (stage-advanced: the stage reached). */
  stageId?: string;
  /** Stage index reached, for stage-advanced events. */
  stageIndex?: number;
};

function atDay(day: number): number {
  return Math.max(1, Math.floor(day) || 1);
}

/** The acceptance event: emitted once by the accept path, never derived. */
export function questAcceptedEvent(def: QuestDef, day: number): QuestLifecycleEvent {
  return { kind: 'quest-accepted', questId: def.id, questTitle: def.title, day: atDay(day) };
}

/**
 * The completion event: emitted once by the completion path (completeQuest).
 * Deliberately NOT derived in deriveQuestProgressEvents: completion is
 * emitted at the payout site, so a derived copy would double-emit.
 */
export function questCompletedEvent(def: QuestDef, day: number): QuestLifecycleEvent {
  return { kind: 'quest-completed', questId: def.id, questTitle: def.title, day: atDay(day) };
}

function progressChanged(before: QuestState, after: QuestState, def: QuestDef): boolean {
  return def.stages.some((stage) => (before.progress[stage.id] ?? 0) !== (after.progress[stage.id] ?? 0));
}

/**
 * Derives the progress-side lifecycle events from one advance step:
 * - objective-updated: any stage's progress mirror moved, stage unchanged.
 * - stage-advanced: stageIndex increased and the quest is still active.
 * Returns [] when nothing moved (same state reference or equal mirrors).
 * Completion is excluded by design (see questCompletedEvent): callers
 * that complete a quest emit the completion event at the payout site.
 */
export function deriveQuestProgressEvents(
  before: QuestState,
  after: QuestState,
  def: QuestDef,
  day: number,
): QuestLifecycleEvent[] {
  if (before === after) return [];
  const events: QuestLifecycleEvent[] = [];
  if (progressChanged(before, after, def)) {
    events.push({ kind: 'quest-objective-updated', questId: def.id, questTitle: def.title, day: atDay(day) });
  }
  if (after.status === 'active' && after.stageIndex > before.stageIndex) {
    const stage = def.stages[after.stageIndex];
    events.push({
      kind: 'quest-stage-advanced',
      questId: def.id,
      questTitle: def.title,
      day: atDay(day),
      stageId: stage?.id,
      stageIndex: after.stageIndex,
    });
  }
  return events;
}

/** Human-readable one-liner for a lifecycle event (log/debug use). */
export function questLifecycleText(event: QuestLifecycleEvent): string {
  switch (event.kind) {
    case 'quest-accepted': return `Quest accepted: ${event.questTitle}`;
    case 'quest-stage-advanced': return `Quest advanced: ${event.questTitle} (stage ${event.stageIndex ?? 0})`;
    case 'quest-completed': return `Quest completed: ${event.questTitle}`;
    case 'quest-failed': return `Quest failed: ${event.questTitle}`;
    case 'quest-objective-updated': return `Quest updated: ${event.questTitle}`;
  }
}
