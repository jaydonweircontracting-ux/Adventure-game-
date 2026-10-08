// Simulation LOD tiers (BUILD 473 — Performance Phase 3).
//
// Entities far from the player update less frequently. This is NOT about
// deleting distant entities — they persist with schedules and state.
// It's about reducing computation for entities the player can't see.
//
// Tiers (from performance prompt §9-10):
// - TIER 0 (0-1 chunks): FULL — every tick
// - TIER 1 (2-3 chunks): REDUCED — every 4 ticks
// - TIER 2 (4-8 chunks): LOW — every 16 ticks
// - TIER 3 (beyond): BACKGROUND — every 64 ticks (schedule only)

export type SimTier = 0 | 1 | 2 | 3;

export const SIM_TIER_INTERVAL: Record<SimTier, number> = {
  0: 1,   // every tick
  1: 4,   // every 4 ticks
  2: 16,  // every 16 ticks
  3: 64,  // every 64 ticks
};

export const SIM_TIER_CHUNK_RADIUS: Record<SimTier, number> = {
  0: 1,   // 0-1 chunks
  1: 3,   // 2-3 chunks
  2: 8,   // 4-8 chunks
  3: Infinity, // beyond
};

/**
 * Determine simulation tier from chunk distance.
 * @param dx  chunk X distance from player
 * @param dy  chunk Y distance from player
 */
export function simTierForDistance(dx: number, dy: number): SimTier {
  const dist = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev (chunk grid)
  if (dist <= 1) return 0;
  if (dist <= 3) return 1;
  if (dist <= 8) return 2;
  return 3;
}

/**
 * True if an entity at the given tier should update on this tick.
 * Distributes updates: tier 1 entities update on ticks where (tick + id) % 4 === 0,
 * so not all tier-1 entities update on the same tick.
 */
export function shouldUpdate(tier: SimTier, tick: number, entityId: number): boolean {
  const interval = SIM_TIER_INTERVAL[tier];
  if (interval === 1) return true;
  return (tick + entityId) % interval === 0;
}

/**
 * LOD-aware update helper. Calls updateFn only when the tier dictates.
 * @returns true if updated, false if skipped this tick
 */
export function updateWithLod(
  tier: SimTier,
  tick: number,
  entityId: number,
  updateFn: () => void,
): boolean {
  if (shouldUpdate(tier, tick, entityId)) {
    updateFn();
    return true;
  }
  return false;
}
