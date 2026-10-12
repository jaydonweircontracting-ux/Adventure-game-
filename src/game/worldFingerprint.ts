// World fingerprint (BUILD 662 — Existing World Preservation).
// Detects unintended changes to protected world data.
// Hashes stable world layout (terrain, roads, buildings, NPC identities)
// so tests can verify the world wasn't accidentally regenerated.
//
// Design:
// - Pure functions, deterministic.
// - Only hashes IMMUTABLE layout data (not NPC positions, not storage).
// - Excludes mutable gameplay state (NPC movement, inventory, etc.).
// - Used in tests to catch accidental world regeneration.

/** Stable world data for fingerprinting. */
export interface WorldFingerprintInput {
  /** Chunk coordinate + terrain + road for each chunk in region. */
  chunks: Array<{
    x: number;
    y: number;
    terrain: string;
    road: string;
    landmarkName: string | null;
  }>;
  /** Building IDs and positions. */
  buildings: Array<{
    id: string;
    x: number;
    y: number;
    kind: string;
  }>;
  /** NPC IDs and archetypes (not positions — those move). */
  npcs: Array<{
    id: string;
    name: string;
    archetype: string;
  }>;
  /** World seed. */
  worldSeed: number;
}

/**
 * Compute a deterministic fingerprint hash from world layout data.
 * Uses FNV-1a hash (simple, deterministic, no dependencies).
 * Returns hex string.
 */
export function computeWorldFingerprint(input: WorldFingerprintInput): string {
  // Canonical serialization: sorted, stable key order.
  const sortedChunks = [...input.chunks].sort((a, b) => a.x - b.x || a.y - b.y);
  const sortedBuildings = [...input.buildings].sort((a, b) => a.id.localeCompare(b.id));
  const sortedNpcs = [...input.npcs].sort((a, b) => a.id.localeCompare(b.id));

  const canonical = JSON.stringify({
    seed: input.worldSeed,
    chunks: sortedChunks.map((c) => [c.x, c.y, c.terrain, c.road, c.landmarkName]),
    buildings: sortedBuildings.map((b) => [b.id, b.x, b.y, b.kind]),
    npcs: sortedNpcs.map((n) => [n.id, n.name, n.archetype]),
  });

  return fnv1a(canonical);
}

/** FNV-1a 32-bit hash. Deterministic across platforms. */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned hex.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compare two fingerprints.
 * Returns null if identical, or a description of the difference type.
 * (We don't diff the full data here — just detect change.)
 */
export function compareFingerprints(
  baseline: string,
  current: string,
): { changed: boolean; baseline: string; current: string } {
  return {
    changed: baseline !== current,
    baseline,
    current,
  };
}

/**
 * Validate that mutable gameplay state was excluded.
 * This is a documentation/test helper — ensures the input doesn't
 * contain fields that change during normal play.
 */
export function validateFingerprintInput(input: WorldFingerprintInput): string[] {
  const issues: string[] = [];
  // Check for suspicious mutable data.
  for (const chunk of input.chunks) {
    if ('storage' in chunk || 'npcPositions' in chunk) {
      issues.push('Chunk contains mutable gameplay state');
    }
  }
  return issues;
}
