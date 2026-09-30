// Quest system: quest definitions, quest log state, rumors, and pure
// progression logic.
//
// Design notes:
// - All quest definitions are static data — no Math.random anywhere.
// - Quest givers are NPCs who live IN houses around Mosslight Crossing
//   (chunk 4,7 and neighbors). The player must find the house and talk to
//   the giver; the `hint` field is the rumor-style pointer that leads there.
// - Progression is pure: advanceQuestStage(state, def, event) returns the
//   updated state and whether the quest completed. Rendering and NPC
//   dialogue wiring happens in App.tsx; this module owns data + rules.
// - Serialization is plain JSON of QuestState[] — the world save owns it.
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
      hint: 'They say Mira at the Tankard is paying for rat tails — her cellar is overrun.',
    },
    stages: [
      { id: 'talk-mira', kind: 'talk', description: 'Talk to Mira at the Rusty Tankard', target: 'Mira' },
      { id: 'kill-rats', kind: 'kill', description: 'Kill rats in the tavern cellar (0/5)', target: 'rat', count: 5 },
      { id: 'return-mira', kind: 'talk', description: 'Return to Mira', target: 'Mira' },
    ],
    rewards: { coins: 25, xp: 40, items: ['Rat-skin gloves', 'Bread'] },
    description: 'Mira\'s cellar is overrun with rats. She will pay for every tail.',
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
      { id: 'kill-wolves', kind: 'kill', description: 'Drive off the wolf pack (0/4)', target: 'wolf', count: 4 },
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
      { id: 'collect-silk', kind: 'collect', description: 'Collect giant spider silk (0/6)', target: 'spider_silk', count: 6 },
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
      { id: 'clear-camp', kind: 'kill', description: 'Defeat the Redbrand bandits (0/6)', target: 'bandit', count: 6 },
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
      { id: 'recover-relic', kind: 'collect', description: 'Recover the funerary mask (0/1)', target: 'funerary_mask', count: 1 },
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
      { id: 'slay-troll', kind: 'kill', description: 'Slay the bridge troll (0/1)', target: 'troll', count: 1 },
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
      { id: 'get-map', kind: 'collect', description: 'Take the Old Merchant\'s Map (0/1)', target: 'old_merchants_map', count: 1 },
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
      { id: 'seal-ember', kind: 'collect', description: 'Recover the Ember Seal from the old battlefield (0/1)', target: 'ember_seal', count: 1 },
      { id: 'seal-tide', kind: 'collect', description: 'Recover the Tide Seal from the drowned mine (0/1)', target: 'tide_seal', count: 1 },
      { id: 'seal-thorn', kind: 'collect', description: 'Recover the Thorn Seal from the overgrown keep (0/1)', target: 'thorn_seal', count: 1 },
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

export function storyQuest(): QuestDef {
  const quest = questById(STORY_QUEST_ID);
  if (!quest) throw new Error('quests: story quest missing');
  return quest;
}

// ---------------------------------------------------------------------------
// Pure quest-log logic
// ---------------------------------------------------------------------------

/** Initial state for a quest the player just picked up. */
export function startQuest(def: QuestDef, day: number): QuestState {
  const progress: Record<string, number> = {};
  def.stages.forEach((stage) => {
    progress[stage.id] = stage.progress ?? 0;
  });
  return {
    questId: def.id,
    status: 'active',
    stageIndex: 0,
    progress,
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
 * Applies one game event to a quest's current stage. Pure: returns a new
 * state object. Kill/collect stages accumulate progress; talk/visit/craft/
 * explore stages complete on a single matching event.
 */
export function advanceQuestStage(state: QuestState, def: QuestDef, event: QuestEvent): AdvanceResult {
  if (state.status !== 'active') return { state, completed: false, advanced: false };
  const stage = def.stages[state.stageIndex];
  if (!stage) return { state, completed: false, advanced: false };
  if (!stageMatchesEvent(stage, event)) return { state, completed: false, advanced: false };

  const needed = stage.count ?? 1;
  const gained = event.count ?? 1;
  const nextProgress = { ...state.progress };
  nextProgress[stage.id] = Math.min(needed, (nextProgress[stage.id] ?? 0) + gained);
  const stageDone = nextProgress[stage.id] >= needed;

  if (!stageDone) {
    return { state: { ...state, progress: nextProgress }, completed: false, advanced: true };
  }
  const nextIndex = state.stageIndex + 1;
  if (nextIndex >= def.stages.length) {
    return {
      state: {
        ...state,
        progress: nextProgress,
        stageIndex: nextIndex,
        status: 'completed',
        completedDay: event.day !== undefined ? Math.max(1, Math.floor(event.day)) : state.startedDay,
      },
      completed: true,
      advanced: true,
    };
  }
  return {
    state: { ...state, progress: nextProgress, stageIndex: nextIndex },
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
  if ((stage.count ?? 1) > 1) {
    return `${state.progress[stage.id] ?? 0}/${stage.count} ${stage.description.replace(/\(\d+\/\d+\)/g, '').trim()}`;
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

const QUEST_SCHEMA = 1;

export type QuestSave = {
  schema: number;
  states: QuestState[];
};

function normalizeState(raw: Partial<QuestState>): QuestState | null {
  if (!raw || typeof raw.questId !== 'string') return null;
  if (!questById(raw.questId)) return null;
  const status: QuestStatus = raw.status === 'active' || raw.status === 'completed' ? raw.status : 'available';
  return {
    questId: raw.questId,
    status,
    stageIndex: Math.max(0, Math.floor(raw.stageIndex ?? 0)),
    progress: raw.progress && typeof raw.progress === 'object' ? { ...raw.progress } : {},
    startedDay: raw.startedDay !== undefined ? Math.max(1, Math.floor(raw.startedDay)) : undefined,
    completedDay: raw.completedDay !== undefined ? Math.max(1, Math.floor(raw.completedDay)) : undefined,
  };
}

/** Plain JSON of QuestState[] for the world save. */
export function serializeQuestStates(states: QuestState[]): string {
  return JSON.stringify({ schema: QUEST_SCHEMA, states } satisfies QuestSave);
}

export function parseQuestStates(json: string): QuestState[] {
  try {
    const parsed = JSON.parse(json) as Partial<QuestSave>;
    if (!parsed || parsed.schema !== QUEST_SCHEMA || !Array.isArray(parsed.states)) return [];
    const states: QuestState[] = [];
    for (const raw of parsed.states) {
      const normalized = normalizeState(raw);
      if (normalized) states.push(normalized);
    }
    return states;
  } catch {
    return [];
  }
}
