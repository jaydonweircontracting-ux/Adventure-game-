// NPC ecological knowledge (BUILD 504 — A-life Phase 10).
//
// NPCs don't magically know everything. They acquire simplified
// knowledge from observing the world: animal sightings, resource
// shortages, population changes. This feeds into dialogue and quests.
//
// Example:
// hunter notices deer population falling → mentions it to player
// → possible quest → player investigates

export type EcoKnowledgeKind =
  | 'saw_species'        // saw this species recently
  | 'species_scarce'     // noticed this species is scarce
  | 'species_abundant'   // noticed this species is abundant
  | 'resource_depleted'  // noticed resource is depleted
  | 'predator_threat'    // noticed predator danger
  | 'migration_observed'; // saw migration

export interface EcoKnowledge {
  kind: EcoKnowledgeKind;
  speciesId: string; // or resource kind
  regionX: number;
  regionY: number;
  /** Game day learned */
  dayLearned: number;
  /** Confidence 0-1 (decays over time) */
  confidence: number;
}

export interface NpcEcoKnowledge {
  npcId: string;
  knowledge: EcoKnowledge[];
}

/**
 * Create empty knowledge for an NPC.
 */
export function createNpcKnowledge(npcId: string): NpcEcoKnowledge {
  return { npcId, knowledge: [] };
}

/**
 * NPC learns something. Caps at 10 items (forgets oldest).
 */
export function npcLearn(
  npc: NpcEcoKnowledge,
  kind: EcoKnowledgeKind,
  speciesId: string,
  regionX: number,
  regionY: number,
  day: number,
): NpcEcoKnowledge {
  // Don't duplicate recent knowledge.
  const existing = npc.knowledge.find(
    k => k.kind === kind && k.speciesId === speciesId &&
         k.regionX === regionX && k.regionY === regionY
  );
  if (existing) {
    // Refresh confidence.
    const knowledge = npc.knowledge.map(k =>
      k === existing ? { ...k, confidence: 1.0, dayLearned: day } : k
    );
    return { ...npc, knowledge };
  }

  const newKnowledge: EcoKnowledge = {
    kind,
    speciesId,
    regionX,
    regionY,
    dayLearned: day,
    confidence: 1.0,
  };

  let knowledge = [...npc.knowledge, newKnowledge];
  // Keep only 10 most recent.
  if (knowledge.length > 10) {
    knowledge = knowledge.slice(-10);
  }

  return { ...npc, knowledge };
}

/**
 * Decay confidence over time. Old knowledge becomes uncertain.
 */
export function decayKnowledge(
  npc: NpcEcoKnowledge,
  currentDay: number,
): NpcEcoKnowledge {
  const knowledge = npc.knowledge
    .map(k => ({
      ...k,
      confidence: Math.max(0, k.confidence - (currentDay - k.dayLearned) * 0.05),
    }))
    .filter(k => k.confidence > 0.1); // forget if too uncertain

  return { ...npc, knowledge };
}

/**
 * Generate dialogue line from NPC knowledge.
 */
export function knowledgeDialogue(npc: NpcEcoKnowledge): string | null {
  // Find highest confidence knowledge.
  if (npc.knowledge.length === 0) return null;

  const best = npc.knowledge.reduce((a, b) =>
    a.confidence > b.confidence ? a : b
  );

  const lines: Record<EcoKnowledgeKind, string> = {
    saw_species: `I saw ${best.speciesId} nearby recently.`,
    species_scarce: `The ${best.speciesId} have been scarce lately.`,
    species_abundant: `There are ${best.speciesId} everywhere these days!`,
    resource_depleted: `The ${best.speciesId} are running low around here.`,
    predator_threat: `Be careful - ${best.speciesId} have been spotted nearby.`,
    migration_observed: `The ${best.speciesId} are on the move.`,
  };

  return lines[best.kind];
}

/**
 * Check if NPC knowledge suggests a quest.
 * Returns quest hint if conditions met.
 */
export function knowledgeQuestHint(
  npc: NpcEcoKnowledge,
): { speciesId: string; kind: EcoKnowledgeKind } | null {
  // High-confidence scarcity or predator threat → quest.
  for (const k of npc.knowledge) {
    if (k.confidence > 0.7) {
      if (k.kind === 'species_scarce' || k.kind === 'predator_threat') {
        return { speciesId: k.speciesId, kind: k.kind };
      }
    }
  }
  return null;
}
