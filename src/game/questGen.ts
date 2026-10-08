// Procedural quest generation (BUILD 487 — Infinite World Phase 5).
//
// Quests are generated from REAL world data: landmarks, regions, species.
// Never create fake destinations. Each quest references an actual landmark
// from the landmark grid.
//
// Quest types: hunt, slay_boss, find_treasure, explore_dungeon,
// investigate_ruin, discover_location, gather_resource.

import { ProceduralLandmark, LandmarkKind } from './landmarkGrid';
import { COMPANION_SPECIES } from './companions';

export type QuestType =
  | 'hunt' | 'slay_boss' | 'find_treasure' | 'explore_dungeon'
  | 'investigate_ruin' | 'discover_location' | 'gather_resource';

export interface GeneratedQuest {
  id: string;
  type: QuestType;
  title: string;
  description: string;
  /** Target landmark (real, from grid) */
  target: ProceduralLandmark;
  /** For hunt quests: target species */
  targetSpecies?: string;
  /** For hunt quests: count required */
  targetCount?: number;
  /** Reward in gold */
  rewardGold: number;
  /** Reward XP */
  rewardXp: number;
}

const HUNT_TARGETS = [
  'direwolf', 'boar', 'badger', 'deer',
];

/**
 * Generate a quest from a landmark.
 * @param landmark the target landmark (must be real)
 * @param questSeed deterministic seed
 */
export function generateQuestForLandmark(
  landmark: ProceduralLandmark,
  questSeed: number,
): GeneratedQuest | null {
  // Simple deterministic RNG.
  let s = questSeed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const id = `q_${landmark.id}_${questSeed}`;

  // Choose quest type based on landmark kind.
  let type: QuestType;
  const roll = rng();

  if (landmark.kind === 'dungeon' || landmark.kind === 'cave') {
    type = roll < 0.5 ? 'explore_dungeon' : 'slay_boss';
  } else if (landmark.kind === 'ruin' || landmark.kind === 'graveyard') {
    type = roll < 0.5 ? 'investigate_ruin' : 'find_treasure';
  } else if (landmark.kind === 'village' || landmark.kind === 'town' || landmark.kind === 'city') {
    // Towns give hunt quests for surrounding areas.
    type = 'hunt';
  } else {
    type = 'discover_location';
  }

  // Generate title and description.
  let title: string;
  let description: string;
  let targetSpecies: string | undefined;
  let targetCount: number | undefined;

  switch (type) {
    case 'hunt': {
      targetSpecies = HUNT_TARGETS[Math.floor(rng() * HUNT_TARGETS.length)];
      targetCount = 3 + Math.floor(rng() * 5);
      title = `Hunt the ${targetSpecies}s`;
      description = `Creatures are terrorizing the roads near ${landmark.name}. Slay ${targetCount} ${targetSpecies}s.`;
      break;
    }
    case 'slay_boss':
      title = `Slay the Beast of ${landmark.name}`;
      description = `A powerful creature has taken residence in ${landmark.name}. Defeat it.`;
      break;
    case 'explore_dungeon':
      title = `Explore ${landmark.name}`;
      description = `Delve into ${landmark.name} and discover its secrets.`;
      break;
    case 'investigate_ruin':
      title = `Investigate ${landmark.name}`;
      description = `Ancient ruins at ${landmark.name} hold forgotten history. Investigate.`;
      break;
    case 'find_treasure':
      title = `Treasure of ${landmark.name}`;
      description = `Legends speak of treasure hidden in ${landmark.name}. Find it.`;
      break;
    case 'discover_location':
      title = `Discover ${landmark.name}`;
      description = `Travel to ${landmark.name} and discover what lies there.`;
      break;
  }

  // Rewards scale with landmark importance.
  const baseReward = landmark.major ? 100 : 50;
  const rewardGold = Math.round(baseReward * (0.8 + rng() * 0.4));
  const rewardXp = Math.round(rewardGold * 2);

  return {
    id,
    type,
    title,
    description,
    target: landmark,
    targetSpecies,
    targetCount,
    rewardGold,
    rewardXp,
  };
}

/**
 * Generate available quests for a region.
 * @param landmarks landmarks in the region
 * @param maxQuests maximum to generate
 */
export function generateQuestsForLandmarks(
  landmarks: ProceduralLandmark[],
  worldSeed: number,
  maxQuests: number = 5,
): GeneratedQuest[] {
  const quests: GeneratedQuest[] = [];
  // Prioritize major landmarks.
  const sorted = [...landmarks].sort((a, b) =>
    (b.major ? 1 : 0) - (a.major ? 1 : 0)
  );
  for (let i = 0; i < Math.min(sorted.length, maxQuests); i++) {
    const q = generateQuestForLandmark(sorted[i], worldSeed + i * 1000);
    if (q) quests.push(q);
  }
  return quests;
}
