// World history generation (BUILD 490 — World Systems Phase 8).
//
// The world feels like it existed before the player arrived.
// Each major landmark gets deterministic lore: history, previous owners,
// reason for abandonment, current threat.
// Discoverable via examine, NPC dialogue, books, quests.

import { ProceduralLandmark } from './landmarkGrid';
import { wfcSeedFor } from './wfc';

export interface LandmarkHistory {
  landmarkId: string;
  /** What happened here */
  history: string;
  /** Who was here before */
  previousOwner: string;
  /** Why it was abandoned (if applicable) */
  abandonmentReason: string | null;
  /** Current threat or mystery */
  currentThreat: string;
  /** Rumor NPCs might share */
  rumor: string;
}

type HistoryTemplate = {
  history: string;
  owners: string[];
  reasons: (string | null)[];
  threats: string[];
};
const HISTORIES_RUIN: HistoryTemplate[] = [
  {
    history: 'Once a thriving outpost, now crumbled to dust.',
    owners: ['a merchant guild', 'a minor lord', 'a religious order'],
    reasons: ['a plague', 'a siege', 'a mysterious disappearance', 'economic collapse'],
    threats: ['Scavengers pick through the rubble.', 'Something stirs in the deeper ruins.', 'Bandits use it as a hideout.'],
  },
];

const HISTORIES_DUNGEON: HistoryTemplate[] = [
  {
    history: 'An ancient complex, sealed for centuries.',
    owners: ['an ancient kingdom', 'a cult', 'a wizard'],
    reasons: ['a great battle', 'a magical catastrophe', 'it was sealed intentionally'],
    threats: ['The seal is weakening.', 'Creatures have moved in.', 'Treasure hunters have gone missing.'],
  },
];

const HISTORIES_VILLAGE: HistoryTemplate[] = [
  {
    history: 'A quiet settlement with a long history.',
    owners: ['founding families', 'refugees from the north', 'a trading company'],
    reasons: [null], // villages aren't abandoned
    threats: ['Wolves threaten livestock.', 'Bandits demand tribute.', 'A strange illness spreads.'],
  },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate deterministic history for a landmark.
 */
export function historyForLandmark(
  landmark: ProceduralLandmark,
  worldSeed: number,
): LandmarkHistory {
  const seed = wfcSeedFor(worldSeed, landmark.chunk.x, landmark.chunk.y, 'history');
  const rng = mulberry32(seed);

  let template: HistoryTemplate;
  if (landmark.kind === 'ruin' || landmark.kind === 'graveyard') {
    template = HISTORIES_RUIN[0];
  } else if (landmark.kind === 'dungeon' || landmark.kind === 'cave') {
    template = HISTORIES_DUNGEON[0];
  } else {
    template = HISTORIES_VILLAGE[0];
  }

  const history = template.history;
  const previousOwner = template.owners[Math.floor(rng() * template.owners.length)];
  const abandonmentReason = template.reasons[Math.floor(rng() * template.reasons.length)];
  const currentThreat = template.threats[Math.floor(rng() * template.threats.length)];

  // Generate rumor.
  const rumor = `They say ${landmark.name} was once held by ${previousOwner}. ${currentThreat}`;

  return {
    landmarkId: landmark.id,
    history,
    previousOwner,
    abandonmentReason,
    currentThreat,
    rumor,
  };
}
