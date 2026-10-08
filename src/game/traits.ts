// Individual trait variation (BUILD 499 — A-life Phase 5).
//
// Creatures of the same species are not identical. Each has small
// inherited differences within species boundaries. Traits affect
// survival and reproduction, enabling lightweight natural selection.

export interface CreatureTraits {
  /** Movement speed multiplier (0.9-1.1) */
  speed: number;
  /** Vision range multiplier (0.9-1.1) */
  vision: number;
  /** Hearing range multiplier (0.9-1.1) */
  hearing: number;
  /** Size multiplier (0.9-1.1) */
  size: number;
  /** Aggression 0-1 */
  aggression: number;
  /** Fear response 0-1 */
  fear: number;
  /** Stamina multiplier (0.9-1.1) */
  stamina: number;
  /** Fertility multiplier (0.9-1.1) */
  fertility: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate traits for a new creature (deterministic from seed).
 * Traits vary ±10% from baseline.
 */
export function generateTraits(seed: number): CreatureTraits {
  const rng = mulberry32(seed);
  const vary = () => 0.9 + rng() * 0.2; // 0.9-1.1

  return {
    speed: vary(),
    vision: vary(),
    hearing: vary(),
    size: vary(),
    aggression: rng(), // 0-1
    fear: rng(),       // 0-1
    stamina: vary(),
    fertility: vary(),
  };
}

/**
 * Inherit traits from parents with small mutation.
 * Offspring traits are average of parents ±2% mutation.
 */
export function inheritTraits(
  parentA: CreatureTraits,
  parentB: CreatureTraits,
  seed: number,
): CreatureTraits {
  const rng = mulberry32(seed);
  const mutate = (v: number) => {
    // ±2% mutation, clamped to 0.8-1.2 (bounded evolution).
    const m = v * (0.98 + rng() * 0.04);
    return Math.max(0.8, Math.min(1.2, m));
  };

  const avg = (a: number, b: number) => (a + b) / 2;

  return {
    speed: mutate(avg(parentA.speed, parentB.speed)),
    vision: mutate(avg(parentA.vision, parentB.vision)),
    hearing: mutate(avg(parentA.hearing, parentB.hearing)),
    size: mutate(avg(parentA.size, parentB.size)),
    aggression: Math.max(0, Math.min(1, avg(parentA.aggression, parentB.aggression) + (rng() - 0.5) * 0.1)),
    fear: Math.max(0, Math.min(1, avg(parentA.fear, parentB.fear) + (rng() - 0.5) * 0.1)),
    stamina: mutate(avg(parentA.stamina, parentB.stamina)),
    fertility: mutate(avg(parentA.fertility, parentB.fertility)),
  };
}

/**
 * Check if traits are within valid bounds.
 */
export function traitsValid(traits: CreatureTraits): boolean {
  const inRange = (v: number, min: number, max: number) => v >= min && v <= max;
  return (
    inRange(traits.speed, 0.8, 1.2) &&
    inRange(traits.vision, 0.8, 1.2) &&
    inRange(traits.hearing, 0.8, 1.2) &&
    inRange(traits.size, 0.8, 1.2) &&
    inRange(traits.aggression, 0, 1) &&
    inRange(traits.fear, 0, 1) &&
    inRange(traits.stamina, 0.8, 1.2) &&
    inRange(traits.fertility, 0.8, 1.2)
  );
}
