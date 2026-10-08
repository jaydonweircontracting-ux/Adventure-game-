// Taming mechanic (BUILD 486 — Infinite World Phase 4).
//
// Interactive tracking-based taming (not a button press).
// 1. Player initiates taming on a creature.
// 2. Tracking zone appears around creature.
// 3. Creature moves unpredictably (species-specific patterns).
// 4. Player must stay within tracking zone to build trust.
// 5. Losing the creature reduces trust. Too much pressure → escape.
// 6. Trust reaches 100 → creature recruited as companion.
//
// Different species have different behaviors:
// - Rabbit: fast, erratic
// - Boar: charges, stops, changes direction
// - Bird: circles player, lands briefly
// - Wolf: circles player

export type TamingPhase =
  | 'inactive'
  | 'tracking'   // player following, building trust
  | 'success'    // tamed!
  | 'failed'     // creature escaped
  | 'escaped';   // too much pressure

export interface TamingState {
  phase: TamingPhase;
  /** Target creature ID */
  targetId: number;
  /** Target species ID */
  speciesId: string;
  /** Trust 0-100 */
  trust: number;
  /** Tracking radius (world units) */
  trackRadius: number;
  /** Ticks since taming started */
  ticks: number;
  /** Ticks since player last in range */
  ticksOutOfRange: number;
  /** Pressure level (increases if player too close/fast) */
  pressure: number;
}

export const TAMING_DEFAULTS = {
  trackRadius: 8,      // world units
  trustPerTick: 0.5,   // trust gained per tick in range
  trustLossPerTick: 2, // trust lost per tick out of range
  maxOutOfRangeTicks: 100, // fail if out of range too long
  maxPressure: 100,
  pressurePerTickClose: 2, // pressure if player very close
  pressureDecay: 1,        // pressure decays per tick
};

/**
 * Create initial taming state.
 */
export function startTaming(
  targetId: number,
  speciesId: string,
): TamingState {
  return {
    phase: 'tracking',
    targetId,
    speciesId,
    trust: 0,
    trackRadius: TAMING_DEFAULTS.trackRadius,
    ticks: 0,
    ticksOutOfRange: 0,
    pressure: 0,
  };
}

/**
 * Update taming state for one tick.
 * @param state current taming state
 * @param playerInRange true if player within trackRadius of creature
 * @param playerDistance distance from player to creature
 * @param playerSpeed player movement speed (for pressure)
 * @returns updated state
 */
export function updateTaming(
  state: TamingState,
  playerInRange: boolean,
  playerDistance: number,
  playerSpeed: number,
): TamingState {
  if (state.phase !== 'tracking') return state;

  const next = { ...state, ticks: state.ticks + 1 };

  if (playerInRange) {
    // Build trust.
    next.trust = Math.min(100, next.trust + TAMING_DEFAULTS.trustPerTick);
    next.ticksOutOfRange = 0;

    // Pressure if too close or moving fast.
    if (playerDistance < 3) {
      next.pressure = Math.min(
        TAMING_DEFAULTS.maxPressure,
        next.pressure + TAMING_DEFAULTS.pressurePerTickClose,
      );
    }
    if (playerSpeed > 2) {
      next.pressure = Math.min(
        TAMING_DEFAULTS.maxPressure,
        next.pressure + 1,
      );
    }
  } else {
    // Lose trust when out of range.
    next.trust = Math.max(0, next.trust - TAMING_DEFAULTS.trustLossPerTick);
    next.ticksOutOfRange += 1;
  }

  // Check outcomes (before pressure decay).
  if (next.trust >= 100) {
    next.phase = 'success';
  } else if (next.ticksOutOfRange > TAMING_DEFAULTS.maxOutOfRangeTicks) {
    next.phase = 'failed';
  } else if (next.pressure >= TAMING_DEFAULTS.maxPressure) {
    next.phase = 'escaped';
  }

  // Pressure decays (only if still tracking).
  if (next.phase === 'tracking') {
    next.pressure = Math.max(0, next.pressure - TAMING_DEFAULTS.pressureDecay);
  }

  return next;
}

/**
 * Get creature movement pattern for taming.
 * Returns a behavior descriptor the AI can use.
 */
export function tamingBehaviorForSpecies(
  speciesId: string,
): 'erratic' | 'charge_stop' | 'circle' | 'wander' {
  if (speciesId.includes('rabbit') || speciesId.includes('rat')) return 'erratic';
  if (speciesId.includes('boar') || speciesId.includes('turtle')) return 'charge_stop';
  if (speciesId.includes('hawk') || speciesId.includes('bird')) return 'circle';
  if (speciesId.includes('wolf') || speciesId.includes('stag')) return 'circle';
  return 'wander';
}
