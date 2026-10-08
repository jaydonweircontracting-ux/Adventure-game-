// Seasonal ecology (BUILD 503 — A-life Phase 9).
//
// Seasons affect the ecosystem, not just visuals:
// - Spring: births increase, vegetation grows
// - Summer: food abundant, activity high
// - Autumn: migration begins, food declines
// - Winter: food scarce, reproduction stops, some species dormant

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonalModifiers {
  /** Birth rate multiplier */
  birthMultiplier: number;
  /** Food availability multiplier */
  foodMultiplier: number;
  /** Activity level multiplier (movement, foraging) */
  activityMultiplier: number;
  /** Migration pressure multiplier */
  migrationMultiplier: number;
  /** Resource growth multiplier */
  growthMultiplier: number;
}

const SEASONAL_DATA: Record<Season, SeasonalModifiers> = {
  spring: {
    birthMultiplier: 1.5,   // breeding season
    foodMultiplier: 1.1,
    activityMultiplier: 1.2,
    migrationMultiplier: 0.5, // settling
    growthMultiplier: 1.4,   // plants growing
  },
  summer: {
    birthMultiplier: 1.0,
    foodMultiplier: 1.3,     // abundant
    activityMultiplier: 1.3,
    migrationMultiplier: 0.3,
    growthMultiplier: 1.2,
  },
  autumn: {
    birthMultiplier: 0.7,
    foodMultiplier: 0.9,
    activityMultiplier: 1.0,
    migrationMultiplier: 1.5, // migration season
    growthMultiplier: 0.7,
  },
  winter: {
    birthMultiplier: 0.2,    // almost no breeding
    foodMultiplier: 0.5,     // scarce
    activityMultiplier: 0.6, // lethargic
    migrationMultiplier: 1.2,
    growthMultiplier: 0.3,   // dormant
  },
};

export function modifiersForSeason(season: Season): SeasonalModifiers {
  return SEASONAL_DATA[season];
}

/**
 * Determine season from day of year (0-364).
 * Simple: 91 days per season.
 */
export function seasonForDay(dayOfYear: number): Season {
  const d = ((dayOfYear % 365) + 365) % 365;
  if (d < 91) return 'spring';
  if (d < 182) return 'summer';
  if (d < 273) return 'autumn';
  return 'winter';
}

/**
 * Get a description of seasonal effects for examine/lore.
 */
export function seasonalDescription(season: Season): string {
  const descriptions: Record<Season, string> = {
    spring: 'New life emerges. Animals are breeding and plants are growing.',
    summer: 'Food is abundant. Wildlife is active.',
    autumn: 'Animals prepare for winter. Some begin migrating.',
    winter: 'Food is scarce. Many animals are dormant or have migrated.',
  };
  return descriptions[season];
}
