// NPC mood model (BUILD 660 — Alien NPC Psychology Engine, Stage C).
// Pure, causal, bounded emotional state. Moods change because of identifiable
// events, persist for appropriate durations, and recover according to
// personality and elapsed game time.
//
// Design:
// - 8 dimensions (0-1), can coexist (tired but happy, curious but afraid).
// - Events are typed with stable IDs for deduplication.
// - Personality (archetype psychology params) modifies response intensity.
// - Recovery uses elapsed game hours, not frame count.
// - No React, no App dependency. Deterministic and testable.

import type { NPCArchetype } from './npcArchetypes';

/** Bounded mood dimensions. All 0-1. */
export interface NPCMood {
  /** General satisfaction and well-being. */
  happiness: number;
  /** Accumulated pressure and tension. */
  stress: number;
  /** Frustration and irritation. */
  anger: number;
  /** Perceived threat. */
  fear: number;
  /** Satisfaction of social needs. */
  socialFulfillment: number;
  /** Physical and mental energy. */
  energy: number;
  /** Interest and engagement. */
  curiosity: number;
  /** Self-assurance. */
  confidence: number;
  /** Bounded list of processed event IDs (deduplication). */
  processedEvents: string[];
}

/** Categories of emotional events the game can observe. */
export type MoodEventCategory =
  | 'positive_interaction'
  | 'negative_interaction'
  | 'assistance_received'
  | 'task_completed'
  | 'task_interrupted'
  | 'discovery'
  | 'credible_danger'
  | 'threat_resolved'
  | 'social_rejection'
  | 'friendly_conversation';

/** A single emotional event with cause attribution. */
export interface MoodEvent {
  /** Stable ID for deduplication. */
  id: string;
  category: MoodEventCategory;
  /** Severity 0-1. */
  severity: number;
  /** Optional source actor (e.g., player or NPC id). */
  sourceId?: string;
  /** Whether the NPC witnessed it directly vs heard about it. */
  witnessed: boolean;
}

/** Baseline mood — neutral, not extreme. */
export function createDefaultMood(): NPCMood {
  return {
    happiness: 0.5,
    stress: 0.2,
    anger: 0.1,
    fear: 0.1,
    socialFulfillment: 0.5,
    energy: 0.8,
    curiosity: 0.5,
    confidence: 0.5,
    processedEvents: [],
  };
}

/** Clamp all dimensions to 0-1, validate no NaN/Infinity. */
export function clampMood(mood: NPCMood): NPCMood {
  const clamp = (v: number): number => {
    if (!Number.isFinite(v)) return 0.5;
    return Math.max(0, Math.min(1, v));
  };
  return {
    happiness: clamp(mood.happiness),
    stress: clamp(mood.stress),
    anger: clamp(mood.anger),
    fear: clamp(mood.fear),
    socialFulfillment: clamp(mood.socialFulfillment),
    energy: clamp(mood.energy),
    curiosity: clamp(mood.curiosity),
    confidence: clamp(mood.confidence),
    processedEvents: Array.isArray(mood.processedEvents)
      ? mood.processedEvents.filter((id) => typeof id === 'string').slice(-50)
      : [],
  };
}

/**
 * Base emotional effects per event category.
 * Each entry: [dimension, delta per severity point].
 * Positive deltas increase, negative decrease.
 */
const EVENT_EFFECTS: Record<MoodEventCategory, Array<[keyof Omit<NPCMood, 'processedEvents'>, number]>> = {
  positive_interaction: [['happiness', 0.15], ['socialFulfillment', 0.1]],
  negative_interaction: [['happiness', -0.15], ['anger', 0.2], ['stress', 0.1]],
  assistance_received: [['happiness', 0.2], ['confidence', 0.1], ['socialFulfillment', 0.15]],
  task_completed: [['happiness', 0.2], ['confidence', 0.15], ['stress', -0.1]],
  task_interrupted: [['anger', 0.25], ['stress', 0.15], ['happiness', -0.1]],
  discovery: [['curiosity', 0.2], ['happiness', 0.1], ['confidence', 0.05]],
  credible_danger: [['fear', 0.35], ['stress', 0.25], ['happiness', -0.15]],
  threat_resolved: [['fear', -0.3], ['stress', -0.2], ['confidence', 0.15], ['happiness', 0.1]],
  social_rejection: [['socialFulfillment', -0.25], ['happiness', -0.15], ['confidence', -0.1]],
  friendly_conversation: [['socialFulfillment', 0.2], ['happiness', 0.1]],
};

/**
 * Apply a mood event. Returns new mood state.
 * - Deduplicates by event ID (no double-processing).
 * - Scales by personality (emotionalSensitivity, stressTolerance).
 * - Heard-about events have reduced impact vs witnessed.
 * - Deterministic: same input = same output.
 */
export function applyMoodEvent(
  mood: NPCMood,
  event: MoodEvent,
  archetype: NPCArchetype,
): NPCMood {
  // Deduplication.
  if (mood.processedEvents.includes(event.id)) {
    return mood;
  }

  const psych = archetype.psychology;
  const severity = Math.max(0, Math.min(1, event.severity));

  // Witnessed events hit harder than heard-about ones.
  const witnessFactor = event.witnessed ? 1.0 : 0.5;

  // Emotional sensitivity scales all effects.
  const sensitivity = 0.5 + psych.emotionalSensitivity * 0.8;

  const result = { ...mood };

  for (const [dimension, baseDelta] of EVENT_EFFECTS[event.category]) {
    let delta = baseDelta * severity * witnessFactor * sensitivity;

    // Stress tolerance reduces stress gains (not stress relief).
    if (dimension === 'stress' && delta > 0) {
      delta *= (1 - psych.stressTolerance * 0.6);
    }

    // Social motivation amplifies social effects.
    if ((dimension === 'socialFulfillment') && psych.socialMotivation > 0.7) {
      delta *= 1.3;
    }

    // Novelty preference amplifies discovery.
    if (event.category === 'discovery' && psych.noveltyPreference > 0.7) {
      delta *= 1.4;
    }

    // Work motivation amplifies task completion/interruption.
    if ((event.category === 'task_completed' || event.category === 'task_interrupted')
        && psych.workMotivation > 0.8) {
      delta *= 1.3;
    }

    result[dimension] = result[dimension] + delta;
  }

  // Record processed event (bounded).
  result.processedEvents = [...mood.processedEvents, event.id].slice(-50);

  return clampMood(result);
}

/**
 * Advance mood over elapsed game time (hours).
 * Different dimensions recover at different rates.
 * - Anger fades relatively quickly.
 * - Stress recovers when causes absent (no new stress events).
 * - Fear persists longer (doesn't auto-resolve).
 * - Energy does NOT auto-recover (needs rest mechanic).
 * - Curiosity does NOT auto-reset.
 * - Social fulfillment decays slowly without interaction.
 *
 * @param elapsedHours Must be >= 0. Negative values are clamped to 0.
 */
export function advanceMoodTime(
  mood: NPCMood,
  elapsedHours: number,
  archetype: NPCArchetype,
): NPCMood {
  const hours = Math.max(0, Number.isFinite(elapsedHours) ? elapsedHours : 0);
  if (hours === 0) return mood;

  const recovery = archetype.psychology.recoverySpeed;
  const result = { ...mood };

  // Baselines for recovery targets.
  const BASELINE: Record<string, number> = {
    happiness: 0.5, stress: 0.2, anger: 0.1, fear: 0.1,
    socialFulfillment: 0.5, energy: 0.8, curiosity: 0.5, confidence: 0.5,
  };

  // Recovery rates per hour (fraction of distance to baseline).
  // Fear recovers slowest (threats persist); anger fades fastest.
  const RATES: Record<string, number> = {
    happiness: 0.08, stress: 0.10, anger: 0.15, fear: 0.03,
    socialFulfillment: 0.05, energy: 0.0, curiosity: 0.0, confidence: 0.06,
  };

  type MoodDim = keyof Omit<NPCMood, 'processedEvents'>;
  for (const dim of Object.keys(RATES) as Array<MoodDim>) {
    const rate = RATES[dim] * (0.5 + recovery * 0.8) * hours;
    const baseline = BASELINE[dim] as number;
    const current = result[dim];
    // Move toward baseline by rate fraction.
    const diff = baseline - current;
    result[dim] = current + diff * Math.min(1, rate);
  }

  // Social fulfillment also decays if no recent social events (handled by caller
  // via prolonged isolation events, not here).

  return clampMood(result);
}

/** Compact mood summary for debugging/diagnostics. */
export function moodSummary(mood: NPCMood): string {
  const dims: Array<keyof Omit<NPCMood, 'processedEvents'>> = [
    'happiness', 'stress', 'anger', 'fear',
    'socialFulfillment', 'energy', 'curiosity', 'confidence',
  ];
  return dims.map((d) => `${d}=${mood[d].toFixed(2)}`).join(' ');
}

/** Check if mood is in a valid state (all bounds, no NaN). */
export function isValidMood(mood: NPCMood): boolean {
  const dims: Array<keyof Omit<NPCMood, 'processedEvents'>> = [
    'happiness', 'stress', 'anger', 'fear',
    'socialFulfillment', 'energy', 'curiosity', 'confidence',
  ];
  return dims.every((d) => {
    const v = mood[d];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  });
}
