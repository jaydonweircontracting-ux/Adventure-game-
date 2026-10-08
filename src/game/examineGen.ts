// Examine text generators (BUILD 489 — World Systems Phase 7).
//
// Every procedural system integrates with the RuneScape-style examine system.
// Text is generated from actual object properties, not hardcoded.

import { ProceduralLandmark } from './landmarkGrid';
import { GeneratedCave, CaveDepthTier } from './caves';
import { CompanionSpecies } from './companions';

/**
 * Examine text for a procedural landmark.
 */
export function examineLandmark(landmark: ProceduralLandmark): string {
  const kindDescriptions: Record<string, string> = {
    village: 'A small settlement. Smoke rises from chimneys.',
    town: 'A bustling town. Merchants call out their wares.',
    city: 'A large city. Towers rise above the walls.',
    ruin: 'Ancient ruins. Something happened here long ago.',
    dungeon: 'A dark entrance. Danger lurks within.',
    cave: 'A cave mouth. It descends into darkness.',
    shrine: 'A weathered shrine. Offerings have been left here.',
    tower: 'A tall tower. Someone watches from above.',
    camp: 'A temporary camp. The fire is still warm.',
    temple: 'An ancient temple. The air feels sacred.',
    mine: 'A mine entrance. The sound of picks echoes from within.',
    graveyard: 'A quiet graveyard. The stones are weathered.',
  };
  const base = kindDescriptions[landmark.kind] || 'An interesting location.';
  return `${landmark.name}. ${base}`;
}

/**
 * Examine text for a cave entrance.
 */
export function examineCaveEntrance(
  caveX: number,
  caveY: number,
  hasBeenExplored: boolean,
): string {
  if (hasBeenExplored) {
    return 'A cave entrance. You have explored its depths.';
  }
  return 'An opening leading deep underground. Who knows what lies within?';
}

/**
 * Examine text for a cave depth tier.
 */
export function examineCaveTier(tier: CaveDepthTier): string {
  if (tier === 'surface') {
    return 'The upper cave. Common stone and coal line the walls.';
  }
  if (tier === 'mid') {
    return 'The middle depths. Iron glints in the rock. Stronger creatures lurk.';
  }
  return 'The deep dark. Gold and crystals sparkle. Ancient things stir.';
}

/**
 * Examine text for a companion species.
 */
export function examineCompanionSpecies(species: CompanionSpecies): string {
  return `${species.name}. ${species.description} Element: ${species.element}. Role: ${species.role}.`;
}

/**
 * Examine text for a discovered location (first discovery).
 */
export function examineDiscovery(
  name: string,
  kind: string,
  isFirstVisit: boolean,
): string {
  if (isFirstVisit) {
    return `Discovered: ${name}! A ${kind}. This location is now marked on your map.`;
  }
  return `${name}. A ${kind}.`;
}
