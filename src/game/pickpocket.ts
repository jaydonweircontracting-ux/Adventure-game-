// Pickpocketing system (BUILD 525 — Advanced World Reactivity).
//
// Player attempts to steal from NPC. Success depends on multiple factors,
// not just a random roll. Outcomes feed into the crime system.
// Pure module — tested in scripts/simulate.ts.

export type PickpocketOutcome = 'success' | 'partial' | 'failure' | 'critical';

export interface PickpocketContext {
  /** Player is behind NPC (vs in front/side). */
  isBehind: boolean;
  /** NPC awareness 0-1 (0=distracted, 1=alert). */
  npcAwareness: number;
  /** NPC is busy with activity (working, talking, etc.). */
  npcBusy: boolean;
  /** 0-23 hour. Night is easier. */
  hour: number;
  /** Target item value (higher = harder). */
  itemValue: number;
  /** NPC difficulty modifier (guards harder, etc.). */
  targetDifficulty: number;
}

export interface PickpocketResult {
  outcome: PickpocketOutcome;
  /** 0-1 success chance that was used. */
  chance: number;
}

/**
 * Calculate pickpocket success chance (0-1). Pure.
 * Base 50%, modified by factors.
 */
export function pickpocketChance(ctx: PickpocketContext): number {
  let chance = 0.5;

  // Position: behind is +20%.
  if (ctx.isBehind) chance += 0.2;

  // Awareness: high awareness reduces chance (up to -30%).
  chance -= ctx.npcAwareness * 0.3;

  // Busy NPC is easier (+15%).
  if (ctx.npcBusy) chance += 0.15;

  // Night (22-5) is easier (+10%).
  if (ctx.hour >= 22 || ctx.hour <= 5) chance += 0.1;

  // High-value items are harder (-1% per 10 gold, max -20%).
  chance -= Math.min(0.2, (ctx.itemValue / 10) * 0.01);

  // Target difficulty (0-1, guards=0.8, etc.) reduces chance.
  chance -= ctx.targetDifficulty * 0.25;

  // Clamp 0.05-0.95 (never guaranteed, never impossible).
  return Math.max(0.05, Math.min(0.95, Math.round(chance * 100) / 100));
}

/**
 * Resolve a pickpocket attempt. Pure, deterministic given roll.
 * @param chance 0-1 success probability
 * @param roll 0-1 random roll (provided by caller for determinism)
 */
export function resolvePickpocket(chance: number, roll: number): PickpocketResult {
  // Critical success: roll in top 5% of success range.
  if (roll < chance * 0.05) {
    return { outcome: 'critical', chance };
  }
  // Success: roll < chance.
  if (roll < chance) {
    return { outcome: 'success', chance };
  }
  // Partial: roll within 10% above chance (noticed but not caught).
  if (roll < chance + 0.1) {
    return { outcome: 'partial', chance };
  }
  // Failure: caught.
  return { outcome: 'failure', chance };
}
