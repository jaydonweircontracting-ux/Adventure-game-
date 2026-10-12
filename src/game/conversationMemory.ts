// Conversation memory for NPC dialogue (BUILD 656).
// Uses the existing bounded NPCMemory system from villageLife.ts.
// Records what was discussed and what facts were shared, then retrieves
// them when the player asks "do you remember?" or "what did you tell me?"
// Pure — no React, no App dependency.

import type { Townsperson, NPCMemory } from './townsfolk';
import { addNPCMemory } from './villageLife';

/** Structured conversation memory event prefixes. */
export const CONV_PREFIX_DISCUSSED = 'Discussed ';
export const CONV_PREFIX_TOLD = 'Told traveler: ';

/**
 * Record that a topic was discussed. Deduplicated by the underlying
 * addNPCMemory (exact string match). Bounded at 12 memories.
 */
export function recordTopicDiscussed(
  npc: Townsperson,
  topicLabel: string,
  day: number,
): Townsperson {
  return addNPCMemory(npc, `${CONV_PREFIX_DISCUSSED}${topicLabel} with traveler`, day, 1);
}

/**
 * Record a specific fact the NPC shared. Higher importance (2) so it
 * survives longer than trivial topic markers.
 */
export function recordFactShared(
  npc: Townsperson,
  subject: string,
  fact: string,
  day: number,
): Townsperson {
  return addNPCMemory(npc, `${CONV_PREFIX_TOLD}${subject}: ${fact}`, day, 2);
}

/**
 * Find memories relevant to a query. Returns matches sorted by relevance
 * (importance, then recency). Only returns memories from THIS npc.
 */
export function recallRelevantMemories(
  npc: Townsperson,
  query: string,
  limit: number = 3,
): NPCMemory[] {
  const memories = npc.memories ?? [];
  if (memories.length === 0) return [];

  const queryWords = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  if (queryWords.length === 0) return [];

  const scored = memories.map((m) => {
    const eventLower = m.event.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (eventLower.includes(word)) score += 1;
    }
    return { memory: m, score };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) =>
    b.score - a.score ||
    b.memory.importance - a.memory.importance ||
    b.memory.day - a.memory.day
  );

  return scored.slice(0, limit).map((s) => s.memory);
}

/** Common words to ignore in memory matching. */
const STOP_WORDS = new Set([
  'the', 'and', 'you', 'your', 'did', 'what', 'about', 'tell', 'told',
  'remember', 'that', 'this', 'with', 'have', 'has', 'had', 'was',
  'were', 'are', 'for', 'from', 'she', 'him', 'her', 'they', 'them',
]);

/**
 * Format a memory as a natural recall response.
 * Preserves the source distinction: "Heard from X" stays second-hand.
 */
export function formatMemoryRecall(memory: NPCMemory, npcName: string): string {
  const event = memory.event;

  // Facts the NPC told the player.
  if (event.startsWith(CONV_PREFIX_TOLD)) {
    const content = event.slice(CONV_PREFIX_TOLD.length);
    return `I told you — ${content}.`;
  }

  // Topics discussed.
  if (event.startsWith(CONV_PREFIX_DISCUSSED)) {
    const content = event.slice(CONV_PREFIX_DISCUSSED.length).replace(' with traveler', '');
    return `We talked about ${content}.`;
  }

  // Rumors heard from others (preserve source).
  if (event.startsWith('Heard from')) {
    return `${event}.`;
  }

  // Other memories.
  return `I remember: ${event.toLowerCase()}.`;
}

/**
 * Check if an NPC has any conversation memories at all.
 */
export function hasConversationMemories(npc: Townsperson): boolean {
  return (npc.memories ?? []).some(
    (m) => m.event.startsWith(CONV_PREFIX_DISCUSSED) || m.event.startsWith(CONV_PREFIX_TOLD)
  );
}
