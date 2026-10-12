// World lore and chronicle registry (BUILD 662 — Existing World Preservation).
// Establishes persistent world history without inventing facts.
// Three categories:
// 1. Established lore: authored/verified by existing game content.
// 2. Recorded history: events that actually occurred during gameplay.
// 3. Unverified rumors: statements NPCs may believe but aren't confirmed.
//
// Pure — no React, no App dependency. Deterministic.

/** Lore entry categories. */
export type LoreCategory = 'established' | 'recorded' | 'rumored';

/** Source of the lore entry. */
export type LoreSource =
  | 'authored'      // Written by game designers, in existing content.
  | 'observed'      // Witnessed during gameplay.
  | 'inferred'      // Deduced from evidence, not directly observed.
  | 'unverified';   // Claimed but not confirmed.

export interface LoreEntry {
  /** Stable ID (e.g., 'lore-mosslight-founding'). */
  id: string;
  category: LoreCategory;
  /** Entry type (e.g., 'settlement_founding', 'road', 'npc_background'). */
  type: string;
  title: string;
  description: string;
  /** Associated location IDs (settlement, chunk, building). */
  locationIds: string[];
  /** Associated NPC or faction IDs. */
  entityIds: string[];
  /** In-world date (day number) when known. */
  worldDay?: number;
  source: LoreSource;
  /** Where this information came from. */
  provenance: string;
  /** Whether players/NPCs have discovered this. */
  discovered: boolean;
}

/** The lore registry — all world knowledge. */
export interface LoreRegistry {
  entries: LoreEntry[];
  /** Schema version for migration. */
  version: number;
}

export const LORE_REGISTRY_VERSION = 1;

/** Create an empty registry. */
export function createLoreRegistry(): LoreRegistry {
  return { entries: [], version: LORE_REGISTRY_VERSION };
}

/**
 * Add a lore entry. Returns new registry (immutable).
 * Deduplicates by ID — adding the same ID twice keeps the first.
 */
export function addLoreEntry(
  registry: LoreRegistry,
  entry: LoreEntry,
): LoreRegistry {
  if (registry.entries.some((e) => e.id === entry.id)) {
    return registry; // Already exists, don't duplicate.
  }
  return {
    ...registry,
    entries: [...registry.entries, entry],
  };
}

/**
 * Get entries by category.
 */
export function loreByCategory(
  registry: LoreRegistry,
  category: LoreCategory,
): LoreEntry[] {
  return registry.entries.filter((e) => e.category === category);
}

/**
 * Get entries for a location.
 */
export function loreForLocation(
  registry: LoreRegistry,
  locationId: string,
): LoreEntry[] {
  return registry.entries.filter((e) => e.locationIds.includes(locationId));
}

/**
 * Get entries for an entity (NPC/faction).
 */
export function loreForEntity(
  registry: LoreRegistry,
  entityId: string,
): LoreEntry[] {
  return registry.entries.filter((e) => e.entityIds.includes(entityId));
}

/**
 * Serialize for save/load. Plain JSON.
 */
export function serializeLoreRegistry(registry: LoreRegistry): string {
  return JSON.stringify(registry);
}

/**
 * Deserialize with validation. Returns empty registry on invalid input.
 */
export function deserializeLoreRegistry(json: string): LoreRegistry {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return createLoreRegistry();
    if (!Array.isArray(data.entries)) return createLoreRegistry();
    // Validate entries have required fields.
    const valid = data.entries.filter((e: any) =>
      e && typeof e.id === 'string' && typeof e.title === 'string'
    );
    return {
      entries: valid,
      version: typeof data.version === 'number' ? data.version : LORE_REGISTRY_VERSION,
    };
  } catch {
    return createLoreRegistry();
  }
}

/**
 * Seed established lore from existing game content.
 * ONLY adds facts verifiable in the current repository.
 * Does NOT invent history.
 */
export function seedEstablishedLore(): LoreRegistry {
  let registry = createLoreRegistry();

  // Mosslight Crossing — verified in civilization.ts (line 720).
  registry = addLoreEntry(registry, {
    id: 'lore-mosslight-crossing',
    category: 'established',
    type: 'settlement',
    title: 'Mosslight Crossing',
    description: 'A town at the crossroads, located at chunk (4, 7). Home to farmers, merchants, guards, and travelers.',
    locationIds: ['mosslight', 'chunk-4-7'],
    entityIds: [],
    source: 'authored',
    provenance: 'Verified in src/game/civilization.ts settlement definition.',
    discovered: true,
  });

  // Farmer NPCs — verified in townsfolk.ts (lines 227-228).
  registry = addLoreEntry(registry, {
    id: 'lore-farmers-mosslight',
    category: 'established',
    type: 'npc_profession',
    title: 'Mosslight Farmers',
    description: 'Aldric, Brenna, and Bryn work the farms near Mosslight Crossing. They tend crops during daylight hours.',
    locationIds: ['mosslight'],
    entityIds: ['aldric', 'brenna', 'bryn'],
    source: 'authored',
    provenance: 'Verified in src/game/townsfolk.ts roster.',
    discovered: true,
  });

  return registry;
}
