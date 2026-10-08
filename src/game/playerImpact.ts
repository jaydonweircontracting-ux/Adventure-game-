// Player ecological impact (BUILD 502 — A-life Phase 8).
//
// The player is part of the ecosystem. Actions have gradual effects:
// - Killing deer → deer decline → wolves lose food → wolves migrate
// - Clearing forest → habitat loss → birds/deer decline
// - Overharvesting → resource depletion → herbivores migrate
//
// Effects are gradual, not instantaneous. Tracked per region.

export type PlayerActionKind =
  | 'killed_deer'
  | 'killed_wolf'
  | 'killed_rabbit'
  | 'killed_boar'
  | 'harvested_berries'
  | 'harvested_wood'
  | 'harvested_herbs'
  | 'cleared_forest';

export interface RegionalImpact {
  regionX: number;
  regionY: number;
  /** Count of each action type */
  actions: Partial<Record<PlayerActionKind, number>>;
  /** Last day updated */
  lastDay: number;
}

/**
 * Create empty impact tracker for a region.
 */
export function createRegionalImpact(
  regionX: number,
  regionY: number,
): RegionalImpact {
  return {
    regionX,
    regionY,
    actions: {},
    lastDay: 0,
  };
}

/**
 * Record a player action.
 */
export function recordPlayerAction(
  impact: RegionalImpact,
  action: PlayerActionKind,
  day: number,
): RegionalImpact {
  const actions = { ...impact.actions };
  actions[action] = (actions[action] || 0) + 1;
  return {
    ...impact,
    actions,
    lastDay: day,
  };
}

/**
 * Calculate ecological effects from player actions.
 * Returns modifiers for population simulation.
 */
export interface EcologicalModifiers {
  /** Multiplier for deer population (0-1, 1 = no effect) */
  deerModifier: number;
  /** Multiplier for wolf population */
  wolfModifier: number;
  /** Multiplier for rabbit population */
  rabbitModifier: number;
  /** Multiplier for vegetation density */
  vegetationModifier: number;
}

export function calculateEcologicalModifiers(
  impact: RegionalImpact,
): EcologicalModifiers {
  const a = impact.actions;

  // Killing deer reduces deer, which reduces wolf food.
  const deerKilled = a.killed_deer || 0;
  const deerModifier = Math.max(0.3, 1 - deerKilled * 0.05);

  // Killing wolves reduces wolves, which lets deer increase.
  const wolvesKilled = a.killed_wolf || 0;
  const wolfModifier = Math.max(0.3, 1 - wolvesKilled * 0.08);

  // Killing rabbits.
  const rabbitsKilled = a.killed_rabbit || 0;
  const rabbitModifier = Math.max(0.3, 1 - rabbitsKilled * 0.05);

  // Clearing forest and harvesting wood reduces vegetation.
  const forestCleared = (a.cleared_forest || 0) + (a.harvested_wood || 0) * 0.5;
  const vegetationModifier = Math.max(0.2, 1 - forestCleared * 0.1);

  return {
    deerModifier,
    wolfModifier,
    rabbitModifier,
    vegetationModifier,
  };
}

/**
 * Get a description of player impact for examine/lore.
 */
export function impactDescription(impact: RegionalImpact): string {
  const a = impact.actions;
  const parts: string[] = [];

  if ((a.killed_deer || 0) > 5) {
    parts.push('Many deer have been hunted here');
  }
  if ((a.killed_wolf || 0) > 3) {
    parts.push('Wolves have been driven off');
  }
  if ((a.cleared_forest || 0) > 2) {
    parts.push('The forest has been heavily cleared');
  }
  if ((a.harvested_berries || 0) > 10) {
    parts.push('Berry bushes have been heavily harvested');
  }

  if (parts.length === 0) {
    return 'The ecosystem here seems undisturbed.';
  }
  return parts.join('. ') + '.';
}
