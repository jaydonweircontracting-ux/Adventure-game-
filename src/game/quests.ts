// Quest system: quest definitions, quest log state, rumors, and pure
// progression logic.
//
// Design notes:
// - All quest definitions are static data — no Math.random anywhere.
// - Quest givers are NPCs who live IN houses around Mosslight Crossing
//   (chunk 4,7 and neighbors). The player must find the house and talk to
//   the giver; the `hint` field is the rumor-style pointer that leads there.
// - Progression is pure: writeQuestEventToStorage writes an event to the
//   storage store, advanceQuestStage(state, def, storage, event) returns the
//   updated state and whether the quest completed. Rendering and NPC
//   dialogue wiring happens in App.tsx; this module owns data + rules.
// - Serialization is plain JSON of quest states + the storage store
//   (schema 2; schema-1 saves migrate) — the world save owns it.
import { townsfolkHash } from './townsfolk';
import { DEFAULT_WORLD_SEED } from './worldCore';

export type QuestStageKind = 'talk' | 'kill' | 'collect' | 'visit' | 'craft' | 'explore';

export type QuestStage = {
  id: string;
  kind: QuestStageKind;
  description: string;
  /** What the event target must match (monster kind, item, NPC name, place). */
  target?: string;
  /** How many for kill/collect stages. */
  count?: number;
  /** Starting progress for the log display. */
  progress?: number;
  /**
   * BUILD 936: short log label for range missions, e.g. 'Rats slain' renders
   * as 'Rats slain: 3/5' from the mission's storage-key value.
   */
  label?: string;
};

export type QuestGiver = {
  name: string;
  /** Which house/settlement the giver lives in — the player must find it. */
  location: string;
  /** Rumor-style hint pointing the player at the giver. */
  hint: string;
};

export type QuestRewards = {
  coins: number;
  xp: number;
  items: string[];
  reputation?: number;
};

export type QuestDef = {
  id: string;
  title: string;
  level: number;
  giver: QuestGiver;
  stages: QuestStage[];
  rewards: QuestRewards;
  storyQuest?: boolean;
  description: string;
  rumor?: string;
};

export type QuestStatus = 'available' | 'active' | 'completed';

export type QuestState = {
  questId: string;
  status: QuestStatus;
  stageIndex: number;
  progress: Record<string, number>;
  startedDay?: number;
  completedDay?: number;
};

export type QuestEventType = 'kill' | 'collect' | 'talk' | 'visit' | 'craft' | 'explore';

export type QuestEvent = {
  type: QuestEventType;
  target: string;
  count?: number;
  day?: number;
};

export const STORY_QUEST_ID = 'ashes-of-aldoria';

/**
 * The ten quests, levels 1-10, all around the starting island
 * (Mosslight Crossing, chunk 4,7 and neighboring chunks).
 */
export const QUESTS: QuestDef[] = [
  {
    id: 'rats-in-the-cellar',
    title: 'Rats in the Cellar',
    level: 1,
    giver: {
      name: 'Mira',
      location: 'The Rusty Tankard tavern, Mosslight Crossing',
      hint: 'They say Mira at the Tankard is paying for rat tails — her cellar is overrun. Look for the hatch behind the bar.',
    },
    stages: [
      { id: 'talk-mira', kind: 'talk', description: 'Talk to Mira at the Rusty Tankard', target: 'Mira' },
      { id: 'kill-rats', kind: 'kill', description: 'Descend through the hatch behind the bar and kill the cellar rats (0/5)', target: 'rat', count: 5, label: 'Rats slain' },
      { id: 'return-mira', kind: 'talk', description: 'Return to Mira', target: 'Mira' },
    ],
    rewards: { coins: 25, xp: 40, items: ['Rat-skin gloves', 'Bread'] },
    description: 'Mira\'s cellar is overrun with rats. Descend through the hatch behind the bar and deal with them — she will pay for every tail.',
    rumor: 'They say Mira at the Tankard is paying for rat tails...',
  },
  {
    id: 'lost-heirloom',
    title: 'The Lost Heirloom',
    level: 2,
    giver: {
      name: 'Mabel',
      location: 'Cottage by the chapel, Mosslight Crossing',
      hint: 'Old Mabel by the chapel lost her grandmother\'s locket — buried somewhere near the ancient oak, she thinks.',
    },
    stages: [
      { id: 'talk-mabel', kind: 'talk', description: 'Talk to Mabel by the chapel', target: 'Mabel' },
      { id: 'find-cache', kind: 'explore', description: 'Find the buried cache near the ancient oak', target: 'buried_treasure' },
      { id: 'return-heirloom', kind: 'talk', description: 'Return the locket to Mabel', target: 'Mabel' },
    ],
    rewards: { coins: 40, xp: 80, items: ['Silver locket', 'Herb poultice'] },
    description: 'Mabel\'s grandmother\'s locket is buried somewhere near the ancient oak east of town. Follow her clues.',
    rumor: 'Old Mabel lost something precious near the big oak — she\'d reward its return.',
  },
  {
    id: 'wolf-pack',
    title: 'Wolf Pack',
    level: 3,
    giver: {
      name: 'Aldric',
      location: 'Farmhouse east of Mosslight Crossing',
      hint: 'Aldric the farmer east of town is losing livestock to wolves from the treeline.',
    },
    stages: [
      { id: 'talk-aldric', kind: 'talk', description: 'Talk to Aldric at his farmhouse', target: 'Aldric' },
      { id: 'kill-wolves', kind: 'kill', description: 'Drive off the wolf pack (0/4)', target: 'wolf', count: 4, label: 'Wolves driven off' },
      { id: 'report-aldric', kind: 'talk', description: 'Report back to Aldric', target: 'Aldric' },
    ],
    rewards: { coins: 70, xp: 140, items: ['Wolf-pelt cloak', 'Iron dagger'] },
    description: 'Wolves from the forest edge are taking Aldric\'s goats. Thin the pack.',
    rumor: 'Wolves have been bold near Aldric\'s farm — he\'s asking for help.',
  },
  {
    id: 'silk-for-the-seamstress',
    title: 'Silk for the Seamstress',
    level: 4,
    giver: {
      name: 'Elsa',
      location: 'House by the Wayfarer Guild, Mosslight Crossing',
      hint: 'Elsa the seamstress needs giant spider silk — and she knows a bowyer\'s trick or two.',
    },
    stages: [
      { id: 'talk-elsa', kind: 'talk', description: 'Talk to Elsa by the guild', target: 'Elsa' },
      { id: 'collect-silk', kind: 'collect', description: 'Collect giant spider silk (0/6)', target: 'spider_silk', count: 6, label: 'Spider silk collected' },
      { id: 'weave-bowstring', kind: 'craft', description: 'Weave the silk into a bowstring', target: 'bowstring' },
      { id: 'return-elsa', kind: 'talk', description: 'Bring the bowstring to Elsa', target: 'Elsa' },
    ],
    rewards: { coins: 90, xp: 200, items: ['Hunting bow', 'Quiver of arrows', 'Silk gloves'] },
    description: 'Elsa needs giant spider silk for her weaving — and in return she will string a proper hunting bow for you.',
    rumor: 'Elsa will trade a real bow for spider silk, if you\'ve the nerve to gather it.',
  },
  {
    id: 'bandit-toll',
    title: 'The Bandit Toll',
    level: 5,
    giver: {
      name: 'Rowan',
      location: 'Guard barracks at the Wayfarer Guild, Mosslight Crossing',
      hint: 'Rowan at the guild barracks is mustering volunteers against the Redbrand camp on the west road.',
    },
    stages: [
      { id: 'talk-rowan', kind: 'talk', description: 'Talk to Rowan at the guild barracks', target: 'Rowan' },
      { id: 'clear-camp', kind: 'kill', description: 'Defeat the Redbrand bandits (0/6)', target: 'bandit', count: 6, label: 'Redbrand bandits defeated' },
      { id: 'report-rowan', kind: 'talk', description: 'Report back to Rowan', target: 'Rowan' },
    ],
    rewards: { coins: 150, xp: 320, items: ['Guard\'s longsword', 'Iron shield', 'Stolen strongbox'] },
    description: 'Bandits are taxing every cart on the west road. Rowan wants their camp cleared.',
    rumor: 'The west road isn\'t safe — Rowan\'s paying anyone who\'ll face the Redbrands.',
  },
  {
    id: 'the-old-crypt',
    title: 'The Old Crypt',
    level: 6,
    giver: {
      name: 'Father Aldous',
      location: 'Rootbound Chapel, Mosslight Crossing',
      hint: 'Father Aldous at the chapel fears the dead are restless in the old crypt north of town.',
    },
    stages: [
      { id: 'talk-aldous', kind: 'talk', description: 'Talk to Father Aldous at the chapel', target: 'Father Aldous' },
      { id: 'enter-crypt', kind: 'explore', description: 'Enter the ancient crypt north of town', target: 'crypt' },
      { id: 'recover-relic', kind: 'collect', description: 'Recover the funerary mask (0/1)', target: 'funerary_mask', count: 1, label: 'Funerary mask recovered' },
      { id: 'return-aldous', kind: 'talk', description: 'Return the relic to Father Aldous', target: 'Father Aldous' },
    ],
    rewards: { coins: 220, xp: 480, items: ['Blessed amulet', 'Ancient bronze sword', 'Holy water'] },
    description: 'The dead stir in the old crypt. Father Aldous asks you to lay them to rest and recover a stolen funerary mask.',
    rumor: 'The chapel priest says the crypt dead walk — and something of theirs was taken.',
  },
  {
    id: 'caravan-guard',
    title: 'Caravan Guard',
    level: 7,
    giver: {
      name: 'Cedric',
      location: 'Market stall, Mosslight Crossing',
      hint: 'Cedric the merchant needs a guard for his route — Greenfield farmstead, then the Oakrest waystone.',
    },
    stages: [
      { id: 'talk-cedric', kind: 'talk', description: 'Talk to Cedric at his market stall', target: 'Cedric' },
      { id: 'visit-greenfield', kind: 'visit', description: 'Escort the caravan to Greenfield farmstead', target: 'greenfield' },
      { id: 'visit-oakrest', kind: 'visit', description: 'Escort the caravan to the Oakrest waystone', target: 'oakrest' },
      { id: 'return-cedric', kind: 'talk', description: 'Collect your pay from Cedric', target: 'Cedric' },
    ],
    rewards: { coins: 350, xp: 700, items: ['Merchant\'s ring', 'Reinforced leather armor', 'Spice satchel'] },
    description: 'Guard Cedric\'s caravan along the trade route: Mosslight to Greenfield to the Oakrest waystone and back.',
    rumor: 'Cedric\'s hiring swords for the Greenfield run — good pay, long walk.',
  },
  {
    id: 'troll-bridge',
    title: 'Troll Under the Bridge',
    level: 8,
    giver: {
      name: 'Kess',
      location: 'Stone house by the river bridge, west of Mosslight Crossing',
      hint: 'Kess by the river bridge swears a troll has taken up under the crossing and wants it gone.',
    },
    stages: [
      { id: 'talk-kess', kind: 'talk', description: 'Talk to Kess at the bridge house', target: 'Kess' },
      { id: 'slay-troll', kind: 'kill', description: 'Slay the bridge troll (0/1)', target: 'troll', count: 1, label: 'Bridge troll slain' },
      { id: 'report-kess', kind: 'talk', description: 'Tell Kess the bridge is safe', target: 'Kess' },
    ],
    rewards: { coins: 500, xp: 950, items: ['Trollbone club', 'Bridge-keeper\'s helm', 'Greater healing potion'] },
    description: 'A troll has claimed the river bridge and demands tolls in livestock. End it.',
    rumor: 'Nobody crosses the river bridge after dark — Kess will pay for a troll\'s head.',
  },
  {
    id: 'the-sunken-cache',
    title: 'The Sunken Cache',
    level: 9,
    giver: {
      name: 'Bram',
      location: 'Riverside hut, south of Mosslight Crossing',
      hint: 'Old Bram in the riverside hut has a drowned merchant\'s map — and he can\'t swim anymore.',
    },
    stages: [
      { id: 'talk-bram', kind: 'talk', description: 'Talk to Bram at the riverside hut', target: 'Bram' },
      { id: 'get-map', kind: 'collect', description: 'Take the Old Merchant\'s Map (0/1)', target: 'old_merchants_map', count: 1, label: "Old Merchant's Map taken" },
      { id: 'find-cache', kind: 'explore', description: 'Follow the map\'s clues to the sunken cache', target: 'buried_treasure' },
      { id: 'split-bram', kind: 'talk', description: 'Return to Bram with his share', target: 'Bram' },
    ],
    rewards: { coins: 800, xp: 1400, items: ['Jeweled dagger', 'Drowned merchant\'s coat', 'Map to the Ember Vault'] },
    description: 'A drowned merchant\'s map points to a sunken cache. Follow its clues — no markers, just your wits — and split the find with Bram.',
    rumor: 'Bram has a real treasure map and no legs for the journey. He\'ll split the take.',
  },
  {
    id: STORY_QUEST_ID,
    title: 'Ashes of Aldoria',
    level: 10,
    storyQuest: true,
    giver: {
      name: 'Steward Anselm',
      location: 'Wayfarer Guild hall, Mosslight Crossing',
      hint: 'The King of Aldoria\'s steward has come to Mosslight in person — something about three seals and a burned keep.',
    },
    stages: [
      { id: 'audience', kind: 'talk', description: 'Seek audience with Steward Anselm in the guild hall', target: 'Steward Anselm' },
      { id: 'seal-ember', kind: 'collect', description: 'Recover the Ember Seal from the old battlefield (0/1)', target: 'ember_seal', count: 1, label: 'Ember Seal recovered' },
      { id: 'seal-tide', kind: 'collect', description: 'Recover the Tide Seal from the drowned mine (0/1)', target: 'tide_seal', count: 1, label: 'Tide Seal recovered' },
      { id: 'seal-thorn', kind: 'collect', description: 'Recover the Thorn Seal from the overgrown keep (0/1)', target: 'thorn_seal', count: 1, label: 'Thorn Seal recovered' },
      { id: 'confront', kind: 'explore', description: 'Confront what remains at the Ashen Keep', target: 'ruin' },
      { id: 'return-anselm', kind: 'talk', description: 'Return the seals to Steward Anselm', target: 'Steward Anselm' },
    ],
    rewards: { coins: 1500, xp: 2500, items: ['Blade of Aldoria', 'King\'s favor', 'Aldorian plate armor'], reputation: 50 },
    description: 'The Kingdom of Aldoria is dying by inches. Its steward believes three lost seals — and the truth of the Ashen Keep — can rally it. This is the story of the island, and it starts with you.',
    rumor: 'The King\'s own steward walks Mosslight\'s streets. Something old is waking in the Ashen Keep.',
  },
];

export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

export type QuestGiverMarker = 'available' | 'turnin' | null;

/**
 * BUILD 326: which quest marker a giver should show.
 * - 'available' (!): the giver has a quest the player has not picked up.
 * - 'turnin' (?): the giver is the target of the player's current talk stage
 *   (quest ready to advance/complete with them).
 * - null: quest active but not at a talk-to-giver stage, or already completed.
 * Pure, so the sim covers the marker-state transitions.
 */
export function markerForGiver(def: QuestDef, states: QuestState[]): QuestGiverMarker {
  const state = states.find((s) => s.questId === def.id);
  if (!state) return 'available';
  if (state.status !== 'active') return null;
  const stage = def.stages[state.stageIndex];
  if (stage && stage.kind === 'talk' && stage.target && stage.target.toLowerCase() === def.giver.name.toLowerCase()) {
    return 'turnin';
  }
  return null;
}

export function storyQuest(): QuestDef {
  const quest = questById(STORY_QUEST_ID);
  if (!quest) throw new Error('quests: story quest missing');
  return quest;
}

// ---------------------------------------------------------------------------
// BUILD 936: storage-key mission ranges (Tibia portable item 3).
//
// A mission is a NUMERIC RANGE on a named storage key, not a boolean flag:
//   key = `quest:<questId>:<stageId>`, range = [0, stage.count ?? 1].
// The store is global per player: ANY system can advance ANY mission by
// writing a number to its key, decoupled from quest acceptance and from the
// linear stage pipeline. Stage ORDER stays linear (stageIndex only moves on
// matching events), but progress is not: kills, collections, and talks that
// happen before accepting, or while on an earlier stage, are recorded in the
// store and honored when the player reaches that stage (pre-progress).
// Start is 0, not Tibia's 1: the game's existing progress text is 0-based
// ('(0/5)'), so the range keeps the game's own numbering.
//
// Write/gate split (single writer, no double-counting):
// - writeQuestEventToStorage(storage, event) is the ONLY writer: it adds
//   event.count (default 1) to every matching mission key across ALL quests,
//   clamped at the range end. App calls it once per event, before advancing.
// - advanceQuestStage(state, def, storage, event) only READS the store: it
//   refreshes the state's progress mirror from the store, then advances the
//   current stage when its key reached the range end.
// QuestState.progress is a derived mirror of the store for this quest's
// stages, kept so the log and dialogue keep reading state, not the store.
// ---------------------------------------------------------------------------

/** Global per-player quest storage: storage key → current number. */
export type QuestStorage = Record<string, number>;

/** Storage key for one mission: `quest:<questId>:<stageId>`. */
export function questStorageKey(questId: string, stageId: string): string {
  return `quest:${questId}:${stageId}`;
}

/** The numeric range of a mission: start 0 → end (count ?? 1). */
export function missionRange(stage: QuestStage): { start: number; end: number } {
  return { start: 0, end: Math.max(1, Math.floor(stage.count ?? 1)) };
}

/** This quest's stage values from the store, clamped to each range. */
export function snapshotQuestProgress(def: QuestDef, storage: QuestStorage): Record<string, number> {
  const progress: Record<string, number> = {};
  for (const stage of def.stages) {
    const { start, end } = missionRange(stage);
    const raw = storage[questStorageKey(def.id, stage.id)];
    progress[stage.id] = typeof raw === 'number' && Number.isFinite(raw)
      ? Math.min(end, Math.max(start, Math.floor(raw)))
      : start;
  }
  return progress;
}

function progressMirrorEqual(def: QuestDef, a: Record<string, number>, b: Record<string, number>): boolean {
  return def.stages.every((stage) => (a[stage.id] ?? 0) === (b[stage.id] ?? 0));
}

/**
 * The single writer: adds an event's count to every matching mission key
 * across all quests (default QUESTS), clamped at each range end. Returns the
 * same store reference when nothing matched.
 */
export function writeQuestEventToStorage(storage: QuestStorage, event: QuestEvent, defs: QuestDef[] = QUESTS): QuestStorage {
  let next: QuestStorage | null = null;
  for (const def of defs) {
    for (const stage of def.stages) {
      if (!stageMatchesEvent(stage, event)) continue;
      const key = questStorageKey(def.id, stage.id);
      const { end } = missionRange(stage);
      const gained = event.count ?? 1;
      const value = Math.min(end, Math.max(0, Math.floor((storage[key] ?? 0) + gained)));
      if (value === (storage[key] ?? 0)) continue;
      if (!next) next = { ...storage };
      next[key] = value;
    }
  }
  return next ?? storage;
}

// ---------------------------------------------------------------------------
// Pure quest-log logic
// ---------------------------------------------------------------------------

/**
 * Initial state for a quest the player just picked up. Progress is seeded
 * from the storage store, so work done before accepting is honored.
 */
export function startQuest(def: QuestDef, day: number, storage: QuestStorage = {}): QuestState {
  return {
    questId: def.id,
    status: 'active',
    stageIndex: 0,
    progress: snapshotQuestProgress(def, storage),
    startedDay: Math.max(1, Math.floor(day)),
  };
}

/**
 * Quests the player can pick up: level-gated to playerLevel + 1, and only
 * quests with no state (or explicitly 'available'). Completed and active
 * quests are never offered again.
 */
export function availableQuests(playerLevel: number, states: QuestState[]): QuestDef[] {
  const byId = new Map(states.map((s) => [s.questId, s]));
  return QUESTS.filter((def) => {
    if (def.level > playerLevel + 1) return false;
    const state = byId.get(def.id);
    return !state || state.status === 'available';
  });
}

function stageMatchesEvent(stage: QuestStage, event: QuestEvent): boolean {
  if (stage.kind !== event.type) return false;
  if (stage.target) return stage.target.toLowerCase() === event.target.toLowerCase();
  return true;
}

export type AdvanceResult = {
  state: QuestState;
  /** True when the event completed the final stage. */
  completed: boolean;
  /** True when the event advanced (or completed) the current stage. */
  advanced: boolean;
};

/**
 * Applies one game event to a quest's current stage. Pure: reads the store
 * (the caller writes first via writeQuestEventToStorage) and returns a new
 * state object. The state's progress mirror is refreshed from the store on
 * every call, so pre-progress on future stages is visible; the same state
 * reference is returned when neither the mirror nor the stage moved.
 * A matching event advances the current stage when its key reached the range
 * end — including a pre-completed stage, which advances on next contact.
 */
export function advanceQuestStage(state: QuestState, def: QuestDef, storage: QuestStorage, event: QuestEvent): AdvanceResult {
  const mirror = snapshotQuestProgress(def, storage);
  const mirrored = progressMirrorEqual(def, state.progress, mirror) ? state : { ...state, progress: mirror };
  if (state.status !== 'active') return { state: mirrored, completed: false, advanced: false };
  const stage = def.stages[state.stageIndex];
  if (!stage) return { state: mirrored, completed: false, advanced: false };
  if (!stageMatchesEvent(stage, event)) return { state: mirrored, completed: false, advanced: false };

  const { end } = missionRange(stage);
  const stageDone = (mirror[stage.id] ?? 0) >= end;

  if (!stageDone) {
    return { state: mirrored, completed: false, advanced: true };
  }
  const nextIndex = state.stageIndex + 1;
  if (nextIndex >= def.stages.length) {
    return {
      state: {
        ...mirrored,
        stageIndex: nextIndex,
        status: 'completed',
        completedDay: event.day !== undefined ? Math.max(1, Math.floor(event.day)) : state.startedDay,
      },
      completed: true,
      advanced: true,
    };
  }
  return {
    state: { ...mirrored, stageIndex: nextIndex },
    completed: false,
    advanced: true,
  };
}

/** Rewards snapshot for the quest-complete UI. */
export function questRewards(def: QuestDef): QuestRewards {
  return { coins: def.rewards.coins, xp: def.rewards.xp, items: [...def.rewards.items], reputation: def.rewards.reputation };
}

export function questProgressText(def: QuestDef, state: QuestState): string {
  const stage = def.stages[state.stageIndex];
  if (!stage) return 'Complete';
  return questMissionText(stage, state.progress[stage.id] ?? 0);
}

/**
 * Dynamic log text for one mission, rendered from its storage-key value —
 * never a static string. Labeled range missions read 'Label: value/end'
 * ('Rats slain: 3/5'); unlabeled stages keep their description (0→1 ranges
 * such as talk/visit/explore/craft show no number, as before).
 */
export function questMissionText(stage: QuestStage, value: number): string {
  const { end } = missionRange(stage);
  const clamped = Math.min(end, Math.max(0, Math.floor(value)));
  if (stage.label) return `${stage.label}: ${clamped}/${end}`;
  if (end > 1) {
    return `${clamped}/${end} ${stage.description.replace(/\(\d+\/\d+\)/g, '').trim()}`;
  }
  return stage.description;
}

// ---------------------------------------------------------------------------
// Rumors
// ---------------------------------------------------------------------------

const RUMOR_TEMPLATES = [
  '{hint}',
  'Heard about "{title}"? {giver} over at {location} is the one to ask.',
  'If you\'re looking for work, {giver} — {location} — might have something.',
];

/**
 * 2-3 rumor strings per quest that NPCs can share, hinting at the
 * giver and location without giving the quest away outright.
 * Deterministic per quest id: the same quest always yields the same rumors.
 */
export function questRumors(def: QuestDef): string[] {
  const salt = def.id.split('').reduce((acc, ch) => (Math.imul(acc, 31) + ch.charCodeAt(0)) | 0, 7) >>> 0;
  const fill = (template: string): string =>
    template
      .replace('{hint}', def.giver.hint)
      .replace('{title}', def.title)
      .replace('{giver}', def.giver.name)
      .replace('{location}', def.giver.location);
  const count = 2 + Math.floor(townsfolkHash(salt ^ (DEFAULT_WORLD_SEED | 0), 913) * 2);
  const rumors: string[] = [];
  for (let i = 0; i < count && i < RUMOR_TEMPLATES.length; i++) {
    rumors.push(fill(RUMOR_TEMPLATES[(salt + i) % RUMOR_TEMPLATES.length]));
  }
  if (def.rumor && !rumors.includes(def.rumor)) rumors.push(def.rumor);
  return rumors.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const QUEST_SCHEMA = 2;

export type QuestSave = {
  schema: number;
  states: QuestState[];
  /** BUILD 936: the storage-key store; schema-1 saves migrate into it. */
  storage?: QuestStorage;
};

function normalizeState(raw: Partial<QuestState>, storage: QuestStorage): QuestState | null {
  if (!raw || typeof raw.questId !== 'string') return null;
  const def = questById(raw.questId);
  if (!def) return null;
  const status: QuestStatus = raw.status === 'active' || raw.status === 'completed' ? raw.status : 'available';
  let stageIndex = Math.max(0, Math.floor(raw.stageIndex ?? 0));
  if (stageIndex > def.stages.length) stageIndex = def.stages.length;
  if (status === 'completed') stageIndex = def.stages.length;
  return {
    questId: raw.questId,
    status,
    stageIndex,
    progress: snapshotQuestProgress(def, storage),
    startedDay: raw.startedDay !== undefined ? Math.max(1, Math.floor(raw.startedDay)) : undefined,
    completedDay: raw.completedDay !== undefined ? Math.max(1, Math.floor(raw.completedDay)) : undefined,
  };
}

/** Keeps only known mission keys, with finite values clamped to each range. */
function sanitizeStorage(raw: unknown): QuestStorage {
  const storage: QuestStorage = {};
  if (!raw || typeof raw !== 'object') return storage;
  const record = raw as Record<string, unknown>;
  for (const def of QUESTS) {
    for (const stage of def.stages) {
      const key = questStorageKey(def.id, stage.id);
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        const { start, end } = missionRange(stage);
        storage[key] = Math.min(end, Math.max(start, Math.floor(value)));
      }
    }
  }
  return storage;
}

/** Plain JSON of quest states + the storage store for the world save. */
export function serializeQuestSave(states: QuestState[], storage: QuestStorage): string {
  return JSON.stringify({ schema: QUEST_SCHEMA, states, storage } satisfies QuestSave);
}

export type ParsedQuestSave = { states: QuestState[]; storage: QuestStorage };

export function parseQuestSave(json: string): ParsedQuestSave {
  const empty: ParsedQuestSave = { states: [], storage: {} };
  try {
    const parsed = JSON.parse(json) as Partial<QuestSave>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.states)) return empty;
    if (parsed.schema === QUEST_SCHEMA) {
      const storage = sanitizeStorage(parsed.storage);
      const states: QuestState[] = [];
      for (const raw of parsed.states) {
        const normalized = normalizeState(raw, storage);
        if (normalized) states.push(normalized);
      }
      return { states, storage };
    }
    if (parsed.schema === 1) {
      // Migration: build the store from the old per-stage progress maps.
      // A completed quest's missions all sit at their range ends; an active
      // quest keeps its recorded progress; anything unrecorded starts at 0.
      // Nothing the player earned is reset.
      const storage: QuestStorage = {};
      const raws: Partial<QuestState>[] = [];
      for (const raw of parsed.states) {
        if (!raw || typeof raw.questId !== 'string') continue;
        const def = questById(raw.questId);
        if (!def) continue;
        raws.push(raw);
        const progress = raw.progress && typeof raw.progress === 'object' ? raw.progress : {};
        for (const stage of def.stages) {
          const { end } = missionRange(stage);
          const recorded = progress[stage.id];
          const value = typeof recorded === 'number' && Number.isFinite(recorded)
            ? Math.min(end, Math.max(0, Math.floor(recorded)))
            : 0;
          storage[questStorageKey(def.id, stage.id)] = raw.status === 'completed' ? end : value;
        }
      }
      const states: QuestState[] = [];
      for (const raw of raws) {
        const normalized = normalizeState(raw, storage);
        if (normalized) states.push(normalized);
      }
      return { states, storage };
    }
    return empty;
  } catch {
    return empty;
  }
}
