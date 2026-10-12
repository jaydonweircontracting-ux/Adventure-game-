// Chunk Builder: data structures for world-building (BUILD 672).
// Based on reference photos provided by the user (2026-10-12).
// Reference 7 (village with windmill) is the primary town layout target.
//
// This module defines:
// - ChunkTemplate: structured layout for a chunk (terrain + roads + buildings)
// - VillageTemplate: reference-matched town layout (image 7)
// - Validation rules for placement
//
// Pure — no React, no App dependency.

export type TerrainType =
  | 'grass' | 'meadow' | 'dirt' | 'path' | 'road'
  | 'forest' | 'rocky' | 'water' | 'farmland' | 'town_ground';

export interface ChunkTemplate {
  /** Chunk coordinates. */
  chunkX: number;
  chunkY: number;
  /** Seed for deterministic generation. */
  seed: number;
  /** Terrain preset name. */
  preset: 'village' | 'forest' | 'farmland' | 'wilderness' | 'town';
  /** Building placements (in chunk-local coordinates 0-280). */
  buildings: BuildingPlacement[];
  /** Road segments (in chunk-local coordinates). */
  roads: RoadSegment[];
  /** Terrain overrides (specific tiles). */
  terrainOverrides: TerrainOverride[];
}

export interface BuildingPlacement {
  /** Building type (matches existing asset names). */
  type: 'house' | 'shop' | 'tavern' | 'farmhouse' | 'mill' | 'well' | 'stall';
  /** Position in chunk-local coordinates (0-280). */
  x: number;
  y: number;
  /** Rotation (0, 90, 180, 270). */
  rotation: 0 | 90 | 180 | 270;
  /** Variant (for visual variety). */
  variant: number;
}

export interface RoadSegment {
  /** Start point (chunk-local). */
  x1: number; y1: number;
  /** End point (chunk-local). */
  x2: number; y2: number;
  /** Road width in tiles. */
  width: number;
}

export interface TerrainOverride {
  x: number; y: number;
  terrain: TerrainType;
}

/**
 * Village template based on reference image 7 (village with windmill).
 *
 * Layout (280x280 chunk-local coordinates):
 * - Central well/plaza at (140, 140)
 * - Windmill at (200, 80) — stone tower, prominent
 * - Houses arranged around center:
 *   - House 1: (80, 100) — red roof, faces plaza
 *   - House 2: (100, 180) — red roof, faces plaza
 *   - House 3: (180, 160) — red roof, faces plaza
 *   - House 4: (60, 160) — smaller, faces road
 * - Market stalls near plaza:
 *   - Stall 1: (120, 120) — striped awning
 *   - Stall 2: (160, 120) — striped awning
 * - Roads:
 *   - Main road: west edge (0, 140) → plaza (140, 140) → east edge (280, 140)
 *   - North road: plaza → north edge (140, 0)
 *   - South road: plaza → south edge (140, 280)
 * - River: flows along east side (x ~ 220-240, north-south)
 * - Bridges: at (230, 100) and (230, 180) crossing the river
 * - Farm plots: fenced areas at (40, 40) and (220, 220)
 * - Trees: clustered in groves, not evenly spaced
 */
export function createVillageTemplate(
  chunkX: number,
  chunkY: number,
  seed: number,
): ChunkTemplate {
  return {
    chunkX,
    chunkY,
    seed,
    preset: 'village',
    buildings: [
      // Central well.
      { type: 'well', x: 140, y: 140, rotation: 0, variant: 0 },
      // Windmill — prominent, on slight rise.
      { type: 'mill', x: 200, y: 80, rotation: 0, variant: 0 },
      // Houses around the plaza.
      { type: 'house', x: 80, y: 100, rotation: 90, variant: 0 },  // Faces east to plaza
      { type: 'house', x: 100, y: 180, rotation: 0, variant: 1 },   // Faces north to plaza
      { type: 'house', x: 180, y: 160, rotation: 270, variant: 0 },  // Faces west to plaza
      { type: 'house', x: 60, y: 160, rotation: 90, variant: 2 },   // Smaller, faces road
      // Market stalls near plaza.
      { type: 'stall', x: 120, y: 120, rotation: 0, variant: 0 },
      { type: 'stall', x: 160, y: 120, rotation: 0, variant: 1 },
      // Farmhouse near fields.
      { type: 'farmhouse', x: 40, y: 220, rotation: 0, variant: 0 },
    ],
    roads: [
      // Main east-west road through plaza.
      { x1: 0, y1: 140, x2: 280, y2: 140, width: 3 },
      // North-south road through plaza.
      { x1: 140, y1: 0, x2: 140, y2: 280, width: 3 },
      // Farm access road.
      { x1: 40, y1: 140, x2: 40, y2: 220, width: 2 },
    ],
    terrainOverrides: [
      // Plaza: town ground around well.
      { x: 140, y: 140, terrain: 'town_ground' },
      // Farm plots: farmland.
      { x: 40, y: 40, terrain: 'farmland' },
      { x: 220, y: 220, terrain: 'farmland' },
      // River: water along east side.
      { x: 230, y: 100, terrain: 'water' },
      { x: 230, y: 180, terrain: 'water' },
    ],
  };
}

/**
 * Validate a chunk template.
 * Returns list of errors (empty if valid).
 */
export function validateChunkTemplate(template: ChunkTemplate): string[] {
  const errors: string[] = [];

  // Check buildings don't overlap.
  for (let i = 0; i < template.buildings.length; i++) {
    for (let j = i + 1; j < template.buildings.length; j++) {
      const a = template.buildings[i];
      const b = template.buildings[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < 20) {
        errors.push(`Buildings ${i} and ${j} overlap (dist ${dist.toFixed(1)})`);
      }
    }
  }

  // Check buildings are within chunk bounds.
  for (let i = 0; i < template.buildings.length; i++) {
    const b = template.buildings[i];
    if (b.x < 0 || b.x > 280 || b.y < 0 || b.y > 280) {
      errors.push(`Building ${i} out of bounds (${b.x}, ${b.y})`);
    }
  }

  // Check roads connect to chunk edges (for continuity).
  // (Simplified: at least one road touches an edge.)
  const touchesEdge = template.roads.some((r) =>
    r.x1 <= 0 || r.x1 >= 280 || r.y1 <= 0 || r.y1 >= 280 ||
    r.x2 <= 0 || r.x2 >= 280 || r.y2 <= 0 || r.y2 >= 280
  );
  if (!touchesEdge && template.roads.length > 0) {
    errors.push('No road connects to chunk edge (breaks continuity)');
  }

  return errors;
}
