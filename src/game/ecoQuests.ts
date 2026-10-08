// Emergent eco-quests (BUILD 505 — A-life Phase 11).
//
// Simulation events become quest seeds. When the ecosystem changes,
// NPCs notice and quests emerge naturally.
//
// Examples:
// - Wolves numerous → "Wolves are terrorizing the road"
// - Deer scarce → "Find out why the deer disappeared"
// - Resource depleted → "Investigate the barren berry patches"
// - Rare species → "A rare creature was sighted..."

import { EcoEventKind } from './ecoHistory';
import { ProceduralLandmark } from './landmarkGrid';

export type EcoQuestKind =
  | 'cull_predators'      // too many predators
  | 'investigate_decline' // prey declining
  | 'find_migration'      // species migrated, find where
  | 'protect_resource'    // resource depleted
  | 'rare_sighting';      // rare creature spotted

export interface EcoQuest {
  id: string;
  kind: EcoQuestKind;
  /** Quest title */
  title: string;
  /** Quest description */
  description: string;
  /** Target species */
  targetSpecies: string;
  /** Where (real landmark or region) */
  locationName: string;
  regionX: number;
  regionY: number;
  /** Reward in gold */
  rewardGold: number;
}

/**
 * Generate a quest from an ecological event.
 */
export function questFromEcoEvent(
  eventKind: EcoEventKind,
  speciesId: string,
  regionX: number,
  regionY: number,
  // Nearby landmark for location reference (or null)
  landmark: ProceduralLandmark | null,
  worldSeed: number,
  day: number,
): EcoQuest | null {
  const locationName = landmark ? landmark.name : `the wilds (${regionX}, ${regionY})`;
  const id = `eco_${speciesId}_${regionX}_${regionY}_d${day}`;

  // Map event to quest.
  let kind: EcoQuestKind;
  let title: string;
  let description: string;
  let rewardGold: number;

  switch (eventKind) {
    case 'population_boom':
      // Too many of a predator → cull quest.
      // Only for predators.
      if (!['wolf', 'direwolf', 'bear'].includes(speciesId)) return null;
      kind = 'cull_predators';
      title = `Wolves Threaten ${locationName}`;
      description = `The ${speciesId} population has grown dangerous near ${locationName}. Cull them to protect travelers.`;
      rewardGold = 50;
      break;

    case 'population_crash':
    case 'species_extinct_local':
      kind = 'investigate_decline';
      title = `The Vanishing ${speciesId}`;
      description = `The ${speciesId} have disappeared near ${locationName}. Investigate what happened.`;
      rewardGold = 40;
      break;

    case 'migration_out':
      kind = 'find_migration';
      title = `Where Did They Go?`;
      description = `The ${speciesId} migrated away from ${locationName}. Track where they went.`;
      rewardGold = 35;
      break;

    case 'resource_depletion':
      kind = 'protect_resource';
      title = `Barren Land`;
      description = `The ${speciesId} resources near ${locationName} are depleted. Find the cause.`;
      rewardGold = 30;
      break;

    case 'species_returned':
      kind = 'rare_sighting';
      title = `A Rare Return`;
      description = `The ${speciesId} have returned to ${locationName} after a long absence. Confirm the sighting.`;
      rewardGold = 25;
      break;

    default:
      return null;
  }

  return {
    id,
    kind,
    title,
    description,
    targetSpecies: speciesId,
    locationName,
    regionX,
    regionY,
    rewardGold,
  };
}
