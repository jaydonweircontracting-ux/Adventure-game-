// BUILD 940: EQEmu task shell (portable item 2 of 5) — rules only,
// original TypeScript. Ported rule: a task is a shell of activities with
// optional steps, zone bounds, match lists, reward bundles, and replay
// timers. EQEmu source reference: the task structure from the EQEmu
// analysis (activities with types, goal counts, NPC/item/skill/spell
// match lists, XYZ bounds, zone lists, optional steps, and a header
// with cash/XP/faction rewards, level bounds, and replay timers).
//
// COMPOSITION (stated, not hidden) — Tibia = the counter, EQEmu = the
// shell. BUILD 936 supplied the numeric mission counter (storage-key
// ranges, one writer, clamped values). This module supplies the shell
// around it: a task wraps one of the 936 static quests and re-expresses
// that quest's WORK stages as parallel activities. The 936 store stays
// the ONLY progress backend: task progress lives in the SAME storage
// record as quest progress, under `task:`-namespaced keys, written by
// the same clamped writer semantics. There is no second progress store.
//
// ADAPTATIONS (stated, not hidden):
// - Talk bookends are NOT activities. A quest's opening talk is the
//   acceptance itself and its closing talk is the turn-in; in the task
//   shell, accepting starts the task and completing all REQUIRED
//   activities pays the bundle at once — no return trip. Converted
//   quests therefore lose their return-to-giver step by design; the
//   giver's dialogue still thanks the player after completion.
// - Activities are order-free (parallel), unlike the linear quest stage
//   pipeline. Work done in any order counts; the 936 linear quests that
//   stay linear keep their order.
// - Match lists are kind + target lists, wired ONLY where a real event
//   exists: kill / collect / visit / craft / explore all have real
//   event paths. Skill matches are NOT built (no skill-gain event
//   exists in the game) and spell matches are NOT built (Ember Bolt /
//   Veil Step are dungeon-only; no overworld casting event exists).
//   Building either would be a fake feature.
// - Zone bounds are settlement names and/or chunk rects, from existing
//   geography data only. The one settlement resolvable from a chunk is
//   Mosslight Crossing (mosslightLayout.MOSSLIGHT_CHUNK); other
//   settlements have no chunk mapping in the game, so settlement bounds
//   for them are not built. An event outside a bound activity's zone
//   is IGNORED (never queued) — the zone check runs in the writer.
// - Reward bundles pay through existing paths only: gold, XP, items
//   (the same bow-mapping + keepsake rules as quest rewards), legacy
//   reputation, and 939 faction standing (arbitrary amount via the new
//   general mover, not just the +25 quest gain). No new currencies.
// - Replay timers are WORLD-CLOCK days (the quest day counter), never
//   real-time sleeps. A repeatable task's activities reset to start
//   only when it is re-accepted after its timer expires — never on
//   expiry alone, so a cooldown task's old progress is never silently
//   wiped while the player is looking at it.
// - Shared tasks are NOT built: they are a multiplayer party concept
//   and this is a single-player game. Companions do not share tasks.
// - Skill/spell matches, shared tasks, and non-Mosslight settlement
//   bounds are absent by decision, not by oversight; each is stated
//   above so a future build does not "fix" them by inventing events.

import type { QuestDef, QuestEvent, QuestStorage } from './quests';
import { MOSSLIGHT_CHUNK } from './mosslightLayout';
import { FACTION_QUEST_DELTA, factionForQuestLocation } from './faction';

// ---------------------------------------------------------------------------
// Definition shape
// ---------------------------------------------------------------------------

/** A zone bound: a settlement name and/or a chunk rect. Both, when present, must match. */
export type TaskZone = {
  settlement?: string;
  chunkRect?: { x0: number; y0: number; x1: number; y1: number };
};

/** Zone context carried on an event: the player's chunk at event time. */
export type TaskEventZone = {
  chunk?: { x: number; y: number };
  settlement?: string;
};

/** A reward bundle: existing reward paths only. */
export type TaskRewardBundle = {
  coins: number;
  xp: number;
  items: string[];
  reputation?: number;
  faction?: { factionId: string; amount: number };
};

export type TaskActivityKind = 'kill' | 'collect' | 'visit' | 'craft' | 'explore';

/** One activity: a 936-style storage-key range with shell metadata. */
export type TaskActivity = {
  id: string;
  kind: TaskActivityKind;
  /** Match list: event targets that count (case-insensitive). */
  targets: string[];
  /** Short log label, e.g. 'Rats slain' renders as 'Rats slain: 3/5'. */
  label: string;
  /** Range end; start is always 0 (936 numbering). */
  end: number;
  /** Optional activities never block completion; finishing one pays its own bundle. */
  optional: boolean;
  zone?: TaskZone;
  /** Bundle paid when THIS optional activity completes (required activities pay the task bundle). */
  rewards?: TaskRewardBundle;
};

/** Per-stage overrides on the wrapped quest's work stages. */
export type TaskActivityOverride = {
  optional?: boolean;
  zone?: TaskZone;
  rewards?: TaskRewardBundle;
};

/**
 * A task definition. It does NOT duplicate the quest: it names the
 * wrapped quest (title, giver, level, description, rumor, rewards all
 * come from the QuestDef) and adds the shell — which stages are
 * optional, which are zone-bound, and whether the task repeats.
 */
export type TaskDef = {
  id: string;
  questId: string;
  replayDays?: number;
  overrides?: Record<string, TaskActivityOverride>;
};

export type TaskStatus = 'available' | 'active' | 'completed' | 'cooldown';

export type TaskState = {
  taskId: string;
  status: TaskStatus;
  /** Progress mirror from the storage store (same pattern as QuestState.progress). */
  progress: Record<string, number>;
  startedDay?: number;
  completedDay?: number;
  /** World day the task becomes acceptable again (replay tasks only). */
  availableDay?: number;
  /** Optional activity ids whose bundles have already been paid. */
  optionalPaid: string[];
};

// ---------------------------------------------------------------------------
// The converted tasks: 6 of the 10 static quests.
// Stay linear (single work activity, no zone/optional/replay value):
// lost-heirloom, wolf-pack, bandit-toll, troll-bridge.
// ---------------------------------------------------------------------------

export const TASKS: TaskDef[] = [
  {
    id: 'task-rats-in-the-cellar',
    questId: 'rats-in-the-cellar',
    replayDays: 14,
    // Zone demo: only kills in Mosslight Crossing count. Cellar rats
    // die in the tavern's chunk; field rats elsewhere do not count.
    // (Zone is chunk-level: a field rat killed inside Mosslight's
    // chunk also counts — stated limitation, not hidden.)
    overrides: { 'kill-rats': { zone: { settlement: 'Mosslight Crossing' } } },
  },
  { id: 'task-silk-for-the-seamstress', questId: 'silk-for-the-seamstress' },
  { id: 'task-the-old-crypt', questId: 'the-old-crypt' },
  {
    id: 'task-caravan-guard',
    questId: 'caravan-guard',
    replayDays: 30,
  },
  { id: 'task-the-sunken-cache', questId: 'the-sunken-cache' },
  { id: 'task-ashes-of-aldoria', questId: 'ashes-of-aldoria' },
];

export function taskDefById(id: string): TaskDef | undefined {
  return TASKS.find((t) => t.id === id);
}

export function taskDefForQuest(questId: string): TaskDef | undefined {
  return TASKS.find((t) => t.questId === questId);
}

export function isTaskDriven(questId: string): boolean {
  return taskDefForQuest(questId) !== undefined;
}

// ---------------------------------------------------------------------------
// Activities: the wrapped quest's work stages, re-expressed in parallel.
// Talk stages are excluded (see header: acceptance is the opening talk,
// completion auto-pays, so there is no turn-in talk to track).
// ---------------------------------------------------------------------------

export function taskActivities(questDef: QuestDef, taskDef: TaskDef): TaskActivity[] {
  const activities: TaskActivity[] = [];
  for (const stage of questDef.stages) {
    if (stage.kind === 'talk') continue;
    const override = taskDef.overrides?.[stage.id];
    activities.push({
      id: stage.id,
      kind: stage.kind as TaskActivityKind,
      targets: stage.target ? [stage.target] : [],
      label: stage.label ?? stage.description,
      end: Math.max(1, Math.floor(stage.count ?? 1)),
      optional: !!override?.optional,
      zone: override?.zone,
      rewards: override?.rewards,
    });
  }
  return activities;
}

/** Storage key for one activity: `task:<taskId>:<activityId>`. */
export function taskStorageKey(taskId: string, activityId: string): string {
  return `task:${taskId}:${activityId}`;
}

/** Range end of one activity, for storage sanitizing. Null when unknown. */
export function taskKeyEnd(questDef: QuestDef, taskDef: TaskDef, activityId: string): number | null {
  const activity = taskActivities(questDef, taskDef).find((a) => a.id === activityId);
  return activity ? activity.end : null;
}

/** This task's activity values from the store, clamped to each range. */
export function snapshotTaskProgress(questDef: QuestDef, taskDef: TaskDef, storage: QuestStorage): Record<string, number> {
  const progress: Record<string, number> = {};
  for (const activity of taskActivities(questDef, taskDef)) {
    const raw = storage[taskStorageKey(taskDef.id, activity.id)];
    progress[activity.id] = typeof raw === 'number' && Number.isFinite(raw)
      ? Math.min(activity.end, Math.max(0, Math.floor(raw)))
      : 0;
  }
  return progress;
}

function taskProgressEqual(a: Record<string, number>, b: Record<string, number>, activities: TaskActivity[]): boolean {
  return activities.every((activity) => (a[activity.id] ?? 0) === (b[activity.id] ?? 0));
}

// ---------------------------------------------------------------------------
// Matching + zone filtering (the writer's rules)
// ---------------------------------------------------------------------------

export function activityMatchesEvent(activity: TaskActivity, event: QuestEvent): boolean {
  if (activity.kind !== event.type) return false;
  if (activity.targets.length === 0) return false;
  const target = event.target.toLowerCase();
  return activity.targets.some((t) => t.toLowerCase() === target);
}

/**
 * Settlement for a chunk, from existing geography data: Mosslight
 * Crossing is the only settlement with a known chunk. Every other
 * chunk resolves to no settlement (so a settlement-bound activity can
 * never be credited outside Mosslight — never faked).
 */
export function settlementForChunk(chunk: { x: number; y: number } | undefined): string | undefined {
  if (!chunk) return undefined;
  if (chunk.x === MOSSLIGHT_CHUNK.cx && chunk.y === MOSSLIGHT_CHUNK.cy) return 'Mosslight Crossing';
  return undefined;
}

/** Zone context for an event at the player's chunk. */
export function eventZoneForChunk(chunk: { x: number; y: number }): TaskEventZone {
  return { chunk: { ...chunk }, settlement: settlementForChunk(chunk) };
}

/**
 * Zone gate: an unbounded activity counts everywhere. A bound activity
 * counts ONLY when the event's zone matches every bound present. An
 * event with no zone context can never satisfy a bound (ignored, not
 * queued) — the shell never guesses where an event happened.
 */
export function zoneMatchesActivity(zone: TaskZone | undefined, eventZone: TaskEventZone | undefined): boolean {
  if (!zone) return true;
  if (!eventZone) return false;
  if (zone.settlement !== undefined) {
    if (!eventZone.settlement || eventZone.settlement.toLowerCase() !== zone.settlement.toLowerCase()) return false;
  }
  if (zone.chunkRect !== undefined) {
    const chunk = eventZone.chunk;
    if (!chunk) return false;
    const r = zone.chunkRect;
    if (chunk.x < r.x0 || chunk.x > r.x1 || chunk.y < r.y0 || chunk.y > r.y1) return false;
  }
  return true;
}

/**
 * The task writer: same semantics as the 936 quest writer (add count,
 * clamp at range end, copy-on-write, same reference when nothing
 * matched) plus the zone gate. Callers pass the quest defs so this
 * module never imports the QUESTS value (quests.ts imports this
 * module for storage sanitizing — a value import back would cycle).
 */
export function writeTaskEventToStorage(
  storage: QuestStorage,
  event: QuestEvent,
  questDefs: QuestDef[],
  taskDefs: TaskDef[] = TASKS,
): QuestStorage {
  let next: QuestStorage | null = null;
  for (const taskDef of taskDefs) {
    const questDef = questDefs.find((q) => q.id === taskDef.questId);
    if (!questDef) continue;
    for (const activity of taskActivities(questDef, taskDef)) {
      if (!activityMatchesEvent(activity, event)) continue;
      if (!zoneMatchesActivity(activity.zone, event.zone)) continue;
      const key = taskStorageKey(taskDef.id, activity.id);
      const gained = event.count ?? 1;
      const value = Math.min(activity.end, Math.max(0, Math.floor((storage[key] ?? 0) + gained)));
      if (value === (storage[key] ?? 0)) continue;
      if (!next) next = { ...storage };
      next[key] = value;
    }
  }
  return next ?? storage;
}

/** Reset a task's activity keys to 0 (re-accept after a replay timer). Copy-on-write. */
export function resetTaskKeys(storage: QuestStorage, questDef: QuestDef, taskDef: TaskDef): QuestStorage {
  let next: QuestStorage | null = null;
  for (const activity of taskActivities(questDef, taskDef)) {
    const key = taskStorageKey(taskDef.id, activity.id);
    if ((storage[key] ?? 0) === 0) continue;
    if (!next) next = { ...storage };
    next[key] = 0;
  }
  return next ?? storage;
}

// ---------------------------------------------------------------------------
// State machine (pure evaluation; App pays the bundles)
// ---------------------------------------------------------------------------

/** Initial state for a task just accepted. Progress seeds from the store (pre-progress honored, 936-style). */
export function startTask(questDef: QuestDef, taskDef: TaskDef, day: number, storage: QuestStorage): TaskState {
  return {
    taskId: taskDef.id,
    status: 'active',
    progress: snapshotTaskProgress(questDef, taskDef, storage),
    startedDay: Math.max(1, Math.floor(day)),
    optionalPaid: [],
  };
}

/** True when every REQUIRED activity reached its range end. */
export function taskComplete(questDef: QuestDef, taskDef: TaskDef, storage: QuestStorage): boolean {
  const progress = snapshotTaskProgress(questDef, taskDef, storage);
  return taskActivities(questDef, taskDef)
    .filter((a) => !a.optional)
    .every((a) => (progress[a.id] ?? 0) >= a.end);
}

export type TaskEvaluation = {
  state: TaskState;
  /** Optional activities that completed on this event (bundles unpaid yet). */
  newlyOptionalPaid: TaskActivity[];
  /** True when the event completed the task (base bundle unpaid yet). */
  completed: boolean;
};

/**
 * Pure evaluation of one event against one active task: refresh the
 * progress mirror, collect newly completed optional activities, and
 * flip to completed/cooldown when all required activities are done.
 * Bundle payment is App's job (side effects don't belong here).
 */
export function evaluateTaskState(
  state: TaskState,
  questDef: QuestDef,
  taskDef: TaskDef,
  storage: QuestStorage,
  day: number,
): TaskEvaluation {
  if (state.status !== 'active') return { state, newlyOptionalPaid: [], completed: false };
  const activities = taskActivities(questDef, taskDef);
  const progress = snapshotTaskProgress(questDef, taskDef, storage);
  const newlyOptionalPaid = activities.filter(
    (a) => a.optional && (progress[a.id] ?? 0) >= a.end && !state.optionalPaid.includes(a.id),
  );
  const done = activities.filter((a) => !a.optional).every((a) => (progress[a.id] ?? 0) >= a.end);
  let next = state;
  if (!taskProgressEqual(state.progress, progress, activities) || newlyOptionalPaid.length > 0) {
    next = { ...next, progress, optionalPaid: [...state.optionalPaid, ...newlyOptionalPaid.map((a) => a.id)] };
  }
  if (done) {
    next = {
      ...next,
      status: taskDef.replayDays ? 'cooldown' : 'completed',
      completedDay: Math.max(1, Math.floor(day)),
      availableDay: taskDef.replayDays ? Math.max(1, Math.floor(day)) + taskDef.replayDays : undefined,
    };
  }
  return { state: next, newlyOptionalPaid, completed: done };
}

// ---------------------------------------------------------------------------
// Availability + giver markers
// ---------------------------------------------------------------------------

export type TaskAvailability = 'available' | 'active' | 'completed' | 'cooldown' | 'hidden';

/** Availability of one task for a player at a level on a world day. */
export function taskAvailability(
  questDef: QuestDef,
  taskDef: TaskDef,
  state: TaskState | undefined,
  playerLevel: number,
  day: number,
): TaskAvailability {
  if (questDef.level > playerLevel + 1) return 'hidden'; // level-gated: never offered
  if (!state) return 'available';
  if (state.status === 'active') return 'active';
  if (state.status === 'completed') return 'completed';
  // Cooldown: re-acceptable once the replay timer expires.
  if (taskDef.replayDays && state.availableDay !== undefined && day >= state.availableDay) return 'available';
  return 'cooldown';
}

/** Tasks the player can accept right now. */
export function availableTasks(
  playerLevel: number,
  taskStates: TaskState[],
  day: number,
  questDefs: QuestDef[],
): { questDef: QuestDef; taskDef: TaskDef }[] {
  const byId = new Map(taskStates.map((s) => [s.taskId, s]));
  const out: { questDef: QuestDef; taskDef: TaskDef }[] = [];
  for (const taskDef of TASKS) {
    const questDef = questDefs.find((q) => q.id === taskDef.questId);
    if (!questDef) continue;
    if (taskAvailability(questDef, taskDef, byId.get(taskDef.id), playerLevel, day) === 'available') {
      out.push({ questDef, taskDef });
    }
  }
  return out;
}

/**
 * Giver marker for a task-driven quest: 'available' (!) when the task
 * can be accepted, null otherwise. Tasks have no turn-in talk, so they
 * never show '?' — completion pays on the final activity, not on a
 * return visit.
 */
export function markerForTaskGiver(
  questDef: QuestDef,
  taskDef: TaskDef,
  taskStates: TaskState[],
  playerLevel: number,
  day: number,
): 'available' | null {
  const state = taskStates.find((s) => s.taskId === taskDef.id);
  return taskAvailability(questDef, taskDef, state, playerLevel, day) === 'available' ? 'available' : null;
}

// ---------------------------------------------------------------------------
// Rewards: the wrapped quest's rewards as a bundle, plus faction.
// ---------------------------------------------------------------------------

/** The base bundle for a task: the wrapped quest's rewards, unchanged, plus the 939 faction gain. */
export function taskBundleFor(questDef: QuestDef): TaskRewardBundle {
  const factionId = factionForQuestLocation(questDef.giver?.location);
  return {
    coins: questDef.rewards.coins,
    xp: questDef.rewards.xp,
    items: [...questDef.rewards.items],
    reputation: questDef.rewards.reputation,
    faction: factionId ? { factionId, amount: FACTION_QUEST_DELTA } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Log text
// ---------------------------------------------------------------------------

/** One activity's log line from its storage value. End-1 activities show no number. */
export function taskActivityText(activity: TaskActivity, value: number): string {
  const clamped = Math.min(activity.end, Math.max(0, Math.floor(value)));
  if (activity.end > 1) return `${activity.label}: ${clamped}/${activity.end}`;
  return activity.label;
}

/** The task's current line: first incomplete required activity, or 'Complete'. */
export function taskProgressText(questDef: QuestDef, taskDef: TaskDef, state: TaskState): string {
  const activities = taskActivities(questDef, taskDef);
  const first = activities.find((a) => !a.optional && (state.progress[a.id] ?? 0) < a.end);
  if (!first) return 'Complete';
  return taskActivityText(first, state.progress[first.id] ?? 0);
}

// ---------------------------------------------------------------------------
// Serialization: task states only (progress lives in the shared store).
// ---------------------------------------------------------------------------

export type TaskSave = { schema: number; states: TaskState[] };

const TASK_SCHEMA = 1;

export function serializeTaskSave(states: TaskState[]): string {
  return JSON.stringify({ schema: TASK_SCHEMA, states } satisfies TaskSave);
}

function normalizeTaskState(raw: Partial<TaskState>, questDefs: QuestDef[], storage: QuestStorage): TaskState | null {
  if (!raw || typeof raw.taskId !== 'string') return null;
  const taskDef = taskDefById(raw.taskId);
  if (!taskDef) return null;
  const questDef = questDefs.find((q) => q.id === taskDef.questId);
  if (!questDef) return null;
  const status: TaskStatus =
    raw.status === 'active' || raw.status === 'completed' || raw.status === 'cooldown' ? raw.status : 'available';
  const activities = taskActivities(questDef, taskDef);
  const optionalIds = new Set(activities.filter((a) => a.optional).map((a) => a.id));
  return {
    taskId: raw.taskId,
    status,
    progress: snapshotTaskProgress(questDef, taskDef, storage),
    startedDay: raw.startedDay !== undefined ? Math.max(1, Math.floor(raw.startedDay)) : undefined,
    completedDay: raw.completedDay !== undefined ? Math.max(1, Math.floor(raw.completedDay)) : undefined,
    availableDay: raw.availableDay !== undefined ? Math.max(1, Math.floor(raw.availableDay)) : undefined,
    optionalPaid: Array.isArray(raw.optionalPaid) ? raw.optionalPaid.filter((id): id is string => typeof id === 'string' && optionalIds.has(id)) : [],
  };
}

export type ParsedTaskSave = { states: TaskState[] };

export function parseTaskSave(json: string, questDefs: QuestDef[], storage: QuestStorage): ParsedTaskSave {
  const empty: ParsedTaskSave = { states: [] };
  try {
    const parsed = JSON.parse(json) as Partial<TaskSave>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.states)) return empty;
    if (parsed.schema !== TASK_SCHEMA) return empty;
    const states: TaskState[] = [];
    for (const raw of parsed.states) {
      const normalized = normalizeTaskState(raw, questDefs, storage);
      if (normalized) states.push(normalized);
    }
    return { states };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Migration: old linear QuestStates for converted quests become TaskStates.
// Idempotent: only QuestStates that still exist are converted, and task
// keys are only filled where they are still undefined — nothing the
// player earned is ever reset or overwritten.
// ---------------------------------------------------------------------------

export type MigratedTaskLoad = {
  questStates: import('./quests').QuestState[];
  taskStates: TaskState[];
  storage: QuestStorage;
};

export function migrateTaskStates(
  questStates: import('./quests').QuestState[],
  storage: QuestStorage,
  taskStates: TaskState[],
  questDefs: QuestDef[],
): MigratedTaskLoad {
  let nextStorage: QuestStorage | null = null;
  const converted = new Set<string>();
  const newTaskStates: TaskState[] = [];
  for (const taskDef of TASKS) {
    if (taskStates.some((s) => s.taskId === taskDef.id)) continue;
    const questState = questStates.find((s) => s.questId === taskDef.questId);
    if (!questState) continue;
    const questDef = questDefs.find((q) => q.id === taskDef.questId);
    if (!questDef) continue;
    converted.add(taskDef.questId);
    // Copy stage values into task keys where the task key is still empty.
    // Stage ids ARE activity ids (activities derive from stages).
    for (const activity of taskActivities(questDef, taskDef)) {
      const sourceKey = `quest:${taskDef.questId}:${activity.id}`;
      const targetKey = taskStorageKey(taskDef.id, activity.id);
      const source = storage[sourceKey];
      if (typeof source !== 'number' || !Number.isFinite(source)) continue;
      if (typeof storage[targetKey] === 'number') continue;
      if (!nextStorage) nextStorage = { ...storage };
      nextStorage[targetKey] = Math.min(activity.end, Math.max(0, Math.floor(source)));
    }
    const merged = nextStorage ?? storage;
    if (questState.status === 'active' || questState.status === 'completed') {
      newTaskStates.push({
        taskId: taskDef.id,
        status: questState.status === 'completed' && taskDef.replayDays ? 'cooldown' : questState.status,
        progress: snapshotTaskProgress(questDef, taskDef, merged),
        startedDay: questState.startedDay,
        completedDay: questState.completedDay,
        availableDay:
          questState.status === 'completed' && taskDef.replayDays && questState.completedDay !== undefined
            ? questState.completedDay + taskDef.replayDays
            : undefined,
        optionalPaid: [],
      });
    }
  }
  return {
    questStates: questStates.filter((s) => !converted.has(s.questId)),
    taskStates: [...taskStates, ...newTaskStates],
    storage: nextStorage ?? storage,
  };
}
