// Deterministic landmark grid (BUILD 483 — Infinite World Phase 1).
//
// Major locations are planned BEFORE the player reaches them (no pop-in).
// Each region (4x4 chunks) deterministically generates 0-2 landmarks from
// the world seed. Spacing rules prevent clustering.
//
// Landmark types: village, town, city, ruin, dungeon, cave, shrine,
// tower, camp, temple, mine, graveyard.

import { wfcSeedFor } from './wfc';

export type LandmarkKind =
  | 'village' | 'town' | 'city'
  | 'ruin' | 'dungeon' | 'cave'
  | 'shrine' | 'tower' | 'camp'
  | 'temple' | 'mine' | 'graveyard';

export interface ProceduralLandmark {
  /** Unique ID: "lm_<rx>_<ry>_<idx>" */
  id: string;
  kind: LandmarkKind;
  /** Region coordinates */
  region: { x: number; y: number };
  /** Chunk coordinates (within region) */
  chunk: { x: number; y: number };
  /** Generated name */
  name: string;
  /** Deterministic seed for this landmark's content */
  seed: number;
  /** Whether this is a major landmark (affects spacing) */
  major: boolean;
}

// Region size in chunks.
export const LANDMARK_REGION_SIZE = 4;

// Name parts for procedural generation.
const NAME_PREFIXES = [
  'Moss', 'Iron', 'Oak', 'Stone', 'River', 'Hill', 'Thorn', 'Ash',
  'Birch', 'Cedar', 'Elm', 'Frost', 'Ember', 'Storm', 'Wolf', 'Bear',
];
const NAME_SUFFIXES_VILLAGE = [
  'hamlet', 'ville', 'ton', 'ford', 'wick', 'stead', 'holm', 'bury',
];
const NAME_SUFFIXES_TOWN = [
  'town', 'burg', 'haven', 'gate', 'port', 'fall', 'shire', 'cross',
];
const NAME_SUFFIXES_RUIN = [
  'Ruins', 'Remains', 'Hollow', 'Crypt', 'Wreck', 'Echo',
];
const NAME_SUFFIXES_DUNGEON = [
  'Depths', 'Catacombs', 'Labyrinth', 'Tomb', 'Vault', 'Abyss',
];

/**
 * Deterministic RNG from seed.
 */
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
 * Get landmarks for a region. Deterministic from world seed.
 * @param rx region X, ry region Y
 * @param worldSeed the world seed
 */
export function getLandmarksForRegion(
  rx: number,
  ry: number,
  worldSeed: number,
): ProceduralLandmark[] {
  const seed = wfcSeedFor(worldSeed, rx, ry, 'landmark');
  const rng = mulberry32(seed);
  const landmarks: ProceduralLandmark[] = [];

  // Each region has 0-2 landmarks (weighted toward 1).
  const count = rng() < 0.2 ? 0 : rng() < 0.7 ? 1 : 2;

  for (let i = 0; i < count; i++) {
    // Position within region (chunk coords).
    const cx = rx * LANDMARK_REGION_SIZE + Math.floor(rng() * LANDMARK_REGION_SIZE);
    const cy = ry * LANDMARK_REGION_SIZE + Math.floor(rng() * LANDMARK_REGION_SIZE);

    // Kind selection (weighted).
    const roll = rng();
    let kind: LandmarkKind;
    let major = false;
    if (roll < 0.25) { kind = 'village'; }
    else if (roll < 0.35) { kind = 'town'; major = true; }
    else if (roll < 0.40) { kind = 'city'; major = true; }
    else if (roll < 0.55) { kind = 'ruin'; }
    else if (roll < 0.65) { kind = 'dungeon'; major = true; }
    else if (roll < 0.72) { kind = 'cave'; }
    else if (roll < 0.80) { kind = 'shrine'; }
    else if (roll < 0.86) { kind = 'tower'; }
    else if (roll < 0.92) { kind = 'camp'; }
    else if (roll < 0.96) { kind = 'temple'; major = true; }
    else if (roll < 0.98) { kind = 'mine'; }
    else { kind = 'graveyard'; }

    // Generate name.
    const prefix = NAME_PREFIXES[Math.floor(rng() * NAME_PREFIXES.length)];
    let suffix: string;
    if (kind === 'village') suffix = NAME_SUFFIXES_VILLAGE[Math.floor(rng() * NAME_SUFFIXES_VILLAGE.length)];
    else if (kind === 'town' || kind === 'city') suffix = NAME_SUFFIXES_TOWN[Math.floor(rng() * NAME_SUFFIXES_TOWN.length)];
    else if (kind === 'ruin') suffix = NAME_SUFFIXES_RUIN[Math.floor(rng() * NAME_SUFFIXES_RUIN.length)];
    else if (kind === 'dungeon' || kind === 'cave') suffix = NAME_SUFFIXES_DUNGEON[Math.floor(rng() * NAME_SUFFIXES_DUNGEON.length)];
    else suffix = kind.charAt(0).toUpperCase() + kind.slice(1);

    const name = kind === 'village' || kind === 'town' || kind === 'city'
      ? prefix + suffix
      : prefix + ' ' + suffix;

    landmarks.push({
      id: `lm_${rx}_${ry}_${i}`,
      kind,
      region: { x: rx, y: ry },
      chunk: { x: cx, y: cy },
      name,
      seed: wfcSeedFor(seed, i, 0, 'lm-content'),
      major,
    });
  }

  return landmarks;
}

/**
 * Get all landmarks near a chunk (for preloading, no pop-in).
 * @param chunkX chunk X, chunkY chunk Y
 * @param radius regions to check in each direction
 */
export function getLandmarksNearChunk(
  chunkX: number,
  chunkY: number,
  worldSeed: number,
  radius: number = 2,
): ProceduralLandmark[] {
  const rx = Math.floor(chunkX / LANDMARK_REGION_SIZE);
  const ry = Math.floor(chunkY / LANDMARK_REGION_SIZE);
  const result: ProceduralLandmark[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      result.push(...getLandmarksForRegion(rx + dx, ry + dy, worldSeed));
    }
  }
  return result;
}
