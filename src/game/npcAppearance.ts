// NPC visual identity — deterministic per-NPC appearance.
// Works WITH the existing 6-column player sprite sheet (each column is a
// different outfit color: 0 blue, 1 red, 2 purple, 3 green, 4 dark, 5 orange)
// and the existing CSS filter-tint system. No new art assets, no animation
// changes, no collision changes.
//
// Identity is derived deterministically from the NPC's stable id, so the
// same NPC keeps the same appearance across chunks, buildings, off-screen
// simulation, save/load, and restarts without any extra stored state.
// Appearance never feeds back into the simulation.

export type NpcAppearanceArchetype =
  | 'mage' | 'warrior' | 'guide' | 'rogue'   // town-npc roles
  | 'farmer' | 'merchant' | 'guard' | 'priest' | 'smith' | 'commoner' | 'child' // townsfolk
  | 'beginner' | 'ranger' | 'traveler';       // adventurers / travelers

export interface NpcAppearance {
  /** Sprite-sheet outfit column 0..5. */
  column: number;
  /** Full CSS filter for the sprite span (includes drop-shadow for adventurers). */
  filter: string;
}

export interface NpcAppearanceOptions {
  /** 'town' (default) or 'adventurer' — adventurers keep their drop shadow. */
  kind?: 'town' | 'adventurer';
  /** Region key; rotates the palette so different towns dress differently. */
  region?: string;
}

/** FNV-1a 32-bit hash — stable across sessions and platforms. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Profession-consistent outfit palettes. Each entry is a sprite-sheet column;
 * the first entry is the archetype's dominant look and appears most often.
 */
const OUTFIT_PALETTES: Record<NpcAppearanceArchetype, number[]> = {
  mage:     [2, 2, 0, 5],
  warrior:  [1, 1, 4, 0],
  guide:    [3, 3, 5, 0],
  rogue:    [4, 4, 1, 3],
  farmer:   [3, 3, 5, 0],
  merchant: [5, 5, 2, 0],
  guard:    [1, 1, 4, 0],
  priest:   [0, 0, 2, 5],
  smith:    [1, 1, 4, 0],
  commoner: [0, 3, 5, 2],
  child:    [0, 5, 3, 2],
  beginner: [0, 0, 3, 5],
  ranger:   [3, 3, 5, 0],
  traveler: [3, 5, 0, 2],
};

/** Base tints — reuse the existing role looks so professions stay readable. */
const BASE_TINTS: Record<NpcAppearanceArchetype, string> = {
  mage:     'sepia(.35) saturate(1.5) hue-rotate(-12deg) brightness(.95)',
  warrior:  'sepia(.52) saturate(1.7) hue-rotate(-18deg) brightness(.9)',
  guide:    'hue-rotate(10deg) saturate(1.25) brightness(1.05)',
  rogue:    'sepia(.52) saturate(1.7) hue-rotate(-18deg) brightness(.9)',
  farmer:   'hue-rotate(4deg) saturate(1.15) brightness(1)',
  merchant: 'sepia(.3) saturate(1.3) brightness(1.02)',
  guard:    'sepia(.5) saturate(1.5) hue-rotate(-16deg) brightness(.92)',
  priest:   'saturate(.9) brightness(1.08)',
  smith:    'sepia(.45) saturate(1.4) hue-rotate(-10deg) brightness(.95)',
  commoner: 'saturate(1.1) brightness(1)',
  child:    'saturate(1.25) brightness(1.06)',
  beginner: 'sepia(.25) saturate(1.2) brightness(1.02)',
  ranger:   'sepia(.4) saturate(1.45) hue-rotate(-22deg)',
  traveler: 'hue-rotate(10deg) saturate(1.25) brightness(1.05)',
};

const ADVENTURER_SHADOW = 'drop-shadow(0 2px 1px rgba(23, 42, 29, .38))';

function normalizeArchetype(archetype: string): NpcAppearanceArchetype {
  const key = archetype.toLowerCase() as NpcAppearanceArchetype;
  return key in OUTFIT_PALETTES ? key : 'commoner';
}

/**
 * Compute the deterministic visual identity for one NPC.
 * Pure function: same (id, archetype, region) always yields the same result.
 */
export function appearanceForNpc(id: string, archetype: string, opts: NpcAppearanceOptions = {}): NpcAppearance {
  const arch = normalizeArchetype(archetype);
  const kind = opts.kind === 'adventurer' ? 'adventurer' : 'town';
  const rand = mulberry32(hashString(id + '|' + arch + '|' + (opts.region || '')));

  // Outfit column from the archetype palette; region rotates the palette so
  // different settlements dress differently while individuals stay stable.
  const palette = OUTFIT_PALETTES[arch];
  const offset = opts.region ? hashString(opts.region) % palette.length : 0;
  const column = palette[Math.floor(rand() * palette.length + offset) % palette.length];

  // Subtle per-NPC tint jitter — tasteful, never garish.
  const hueJitter = Math.round((rand() * 2 - 1) * 7);          // ±7deg
  const satJitter = ((rand() * 2 - 1) * 0.1).toFixed(2);        // ±0.10
  const brightJitter = ((rand() * 2 - 1) * 0.04).toFixed(2);    // ±0.04
  // A fraction of adults read as graying elders.
  const grayed = arch !== 'child' && rand() < 0.2;
  const grayPart = grayed ? ' saturate(.8) brightness(1.06)' : '';

  const filter =
    BASE_TINTS[arch] +
    ' hue-rotate(' + hueJitter + 'deg) saturate(' + (1 + Number(satJitter)).toFixed(2) + ') brightness(' + (1 + Number(brightJitter)).toFixed(2) + ')' +
    grayPart +
    (kind === 'adventurer' ? ' ' + ADVENTURER_SHADOW : '');

  return { column, filter };
}

/**
 * Inline-style CSS variables consumed by the sprite rules:
 * `--npc-appearance-x` overrides the sprite-sheet column,
 * `--npc-appearance-filter` overrides the tint (role default as CSS fallback).
 */
export function npcAppearanceStyle(
  id: string,
  archetype: string,
  opts: NpcAppearanceOptions = {},
): { '--npc-appearance-x': string; '--npc-appearance-filter': string } {
  const appearance = appearanceForNpc(id, archetype, opts);
  return {
    '--npc-appearance-x': (-appearance.column * 32) + 'px',
    '--npc-appearance-filter': appearance.filter,
  };
}
