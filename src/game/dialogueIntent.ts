// Free-text intent recognition for NPC dialogue (BUILD 654).
// Pure — no React, no App dependency. Maps player-typed text to
// DialogueTopicId values so the existing responseFor() backend handles
// everything downstream (disposition, rumors, named-NPC cases).
// Unknown input returns null → caller shows in-character fallback.

import type { DialogueTopicId } from './dialogue';

export type IntentTopic = DialogueTopicId | 'memory';

export interface IntentResult {
  topic: IntentTopic;
  confidence: number; // 0-1
  /** For 'memory' intents: the subject to recall (extracted keywords). */
  memoryQuery?: string;
}

// Memory/recall patterns — checked before topic keywords.
const MEMORY_PATTERNS = [
  'do you remember',
  'remember me',
  'what did we talk about',
  'what did you tell me',
  'what did you say about',
  'did you hear anything new',
  'remember my promise',
  'remember when',
  'you told me',
  'we discussed',
];

// Keyword lists per topic. Each entry: [keywords, weight].
const TOPIC_KEYWORDS: Record<DialogueTopicId, [string[], number][]> = {
  who: [
    [['who are you', 'your name', 'introduce yourself', 'tell me about yourself'], 3],
    [['who', 'name', 'yourself'], 1],
  ],
  work: [
    [['what do you do', 'your work', 'your job', 'your trade', 'your craft'], 3],
    [['work', 'job', 'trade', 'forge', 'crops', 'farm', 'shop', 'chapel', 'guard', 'patrol'], 1.5],
    [['blacksmith', 'merchant', 'farmer'], 1],
  ],
  rumors: [
    [['rumor', 'rumour', 'gossip', 'heard anything', 'news', 'happening'], 3],
    [['strange', 'weird', 'missing', 'disappeared', 'traveler'], 1],
  ],
  town: [
    [['town', 'village', 'mosslight', 'crossing', 'settlement', 'place'], 2],
    [['where am i', 'this place', 'around here'], 2],
    [['road', 'north', 'south', 'east', 'west', 'direction'], 1],
  ],
  bye: [
    [['goodbye', 'bye', 'farewell', 'see you', 'later', 'got to go'], 3],
    [['leave', 'go now'], 1],
  ],
};

// Greeting patterns — map to 'who' (introduction flow).
const GREETINGS = ['hello', 'hi ', 'hi!', 'hey', 'greetings', 'good morning', 'good evening', 'good day'];

function normalize(text: string): string {
  return ' ' + text.toLowerCase().replace(/[^a-z0-9\s?']/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

function scoreTopic(normalized: string, topic: DialogueTopicId): number {
  let score = 0;
  for (const [keywords, weight] of TOPIC_KEYWORDS[topic]) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) score += weight * kw.length; // longer matches = more specific
    }
  }
  return score;
}

/**
 * Recognize the player's intent from free text.
 * Returns the best-matching topic with confidence, or null if no confident match.
 */
export function recognizeIntent(text: string): IntentResult | null {
  if (!text || !text.trim()) return null;
  const norm = normalize(text);

  // BUILD 656: Memory/recall patterns — checked first (highest priority).
  for (const pattern of MEMORY_PATTERNS) {
    if (norm.includes(pattern)) {
      return { topic: 'memory', confidence: 0.95, memoryQuery: text };
    }
  }

  // Greetings → 'who' (natural conversation opener).
  for (const g of GREETINGS) {
    if (norm.includes(g)) {
      return { topic: 'who', confidence: 0.9 };
    }
  }

  // Question words boost relevance but don't determine topic alone.
  const isQuestion = norm.includes('?') || / (who|what|where|when|why|how|can|could|do|does|is|are|will|would) /.test(norm);

  let best: DialogueTopicId | null = null;
  let bestScore = 0;
  const scores: Record<string, number> = {};

  for (const topic of Object.keys(TOPIC_KEYWORDS) as DialogueTopicId[]) {
    const s = scoreTopic(norm, topic);
    scores[topic] = s;
    if (s > bestScore) {
      bestScore = s;
      best = topic;
    }
  }

  // Minimum threshold: need at least a meaningful keyword hit.
  if (!best || bestScore < 2) return null;

  // Confidence: how dominant is the winner vs runner-up.
  const sorted = Object.values(scores).sort((a, b) => b - a);
  const dominance = sorted[1] > 0 ? bestScore / (bestScore + sorted[1]) : 1;
  const confidence = Math.min(1, 0.5 + dominance * 0.5 + (isQuestion ? 0.1 : 0));

  return { topic: best, confidence };
}

/** In-character fallback when intent is unclear. */
export function fallbackResponse(npcName: string): string {
  const options = [
    `I'm not sure what you mean, traveler.`,
    `Hmm, I don't follow. What are you asking about?`,
    `You'll have to speak plainer than that.`,
  ];
  // Deterministic pick by name hash so it's stable per NPC.
  let h = 0;
  for (let i = 0; i < npcName.length; i++) h = (h * 31 + npcName.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length];
}
