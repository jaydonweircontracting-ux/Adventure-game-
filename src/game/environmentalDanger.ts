// Environmental danger (BUILD 518 — World Systems prompt).
//
// Hazardous biomes apply damage over time to the player. Designed to be
// noticeable but crossable: slow tick, small damage, potions counter it.
// Pure module — tested in scripts/simulate.ts.

export type DangerBiome = 'desert' | 'tundra';

export interface BiomeDanger {
  /** HP damage per tick. */
  damage: number;
  /** Milliseconds between ticks. */
  tickMs: number;
  /** UI label. */
  label: string;
  /** UI icon. */
  icon: string;
}

export const BIOME_DANGERS: Record<DangerBiome, BiomeDanger> = {
  desert: { damage: 1, tickMs: 10000, label: 'Heat', icon: '☀️' },
  tundra: { damage: 1, tickMs: 10000, label: 'Cold', icon: '❄️' },
};

/** Returns the danger for a biome, or null if safe. */
export function dangerForBiome(biome: string): BiomeDanger | null {
  if (biome === 'desert') return BIOME_DANGERS.desert;
  if (biome === 'tundra') return BIOME_DANGERS.tundra;
  return null;
}

/**
 * Accumulates danger time and returns damage ticks owed.
 * Pure: given elapsed ms and danger, returns { damage, remainingMs }.
 */
export function accumulateDanger(elapsedMs: number, carriedMs: number, danger: BiomeDanger): { damage: number; remainingMs: number } {
  const total = carriedMs + elapsedMs;
  const ticks = Math.floor(total / danger.tickMs);
  return {
    damage: ticks * danger.damage,
    remainingMs: total - ticks * danger.tickMs,
  };
}
