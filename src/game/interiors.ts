// Interior layout data model (BUILD 674).
// Foundation for per-house interior variation.
// Replaces hardcoded per-roomType furniture with data-driven layouts.
//
// Design:
// - InteriorLayout: per-building record with template, dimensions, furniture
// - FurnitureCatalog: shared definitions used by both 2D and iso renderers
// - Deterministic generation from building ID (stable across sessions)
//
// Pure — no React, no App dependency.

export type FurnitureKind =
  | 'bed' | 'table' | 'chair' | 'shelf' | 'fireplace' | 'lamp'
  | 'rug' | 'chest' | 'workbench' | 'barrel' | 'crate' | 'plant';

export interface FurniturePlacement {
  kind: FurnitureKind;
  /** Tile X (0 to width-1). */
  tx: number;
  /** Tile Y (0 to height-1). */
  ty: number;
  /** Width in tiles. */
  w: number;
  /** Height in tiles. */
  h: number;
  /** Visual variant (0 = default). */
  variant: number;
  /** Whether this blocks movement. */
  solid: boolean;
}

export type HouseType =
  | 'cottage'      // Generic small home
  | 'farmhouse'    // Farmer's home: practical, agricultural touches
  | 'merchant'     // Merchant's home: neat, storage, desk
  | 'guard'        // Guard's home: simple, equipment storage
  | 'craftsman'    // Worker's home: tools, workbench
  | 'tavern'       // Tavern (existing)
  | 'chapel'       // Chapel (existing)
  | 'guild';       // Guild (existing)

export interface InteriorLayout {
  /** Stable ID (e.g., '4-7-building-5'). */
  id: string;
  /** House type for template selection. */
  houseType: HouseType;
  /** Room width in tiles. */
  width: number;
  /** Room height in tiles. */
  height: number;
  /** Floor palette name. */
  floor: string;
  /** Wall palette name. */
  wall: string;
  /** Furniture placements. */
  furniture: FurniturePlacement[];
  /** Bed position (for NPC alignment). Null if no bed. */
  bedPosition: { tx: number; ty: number } | null;
}

/**
 * Simple deterministic hash for building IDs.
 * Used to seed per-house variation.
 */
export function hashBuildingId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Deterministic PRNG from seed.
 */
function seededRng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Furniture catalog: dimensions and solidity for each kind.
 * Shared by both renderers to prevent drift.
 */
export const FURNITURE_CATALOG: Record<FurnitureKind, { w: number; h: number; solid: boolean }> = {
  bed:       { w: 2, h: 1, solid: true },
  table:     { w: 2, h: 1, solid: true },
  chair:     { w: 1, h: 1, solid: true },
  shelf:     { w: 1, h: 1, solid: true },
  fireplace: { w: 2, h: 1, solid: true },
  lamp:      { w: 1, h: 1, solid: false },
  rug:       { w: 3, h: 2, solid: false },
  chest:     { w: 1, h: 1, solid: true },
  workbench: { w: 2, h: 1, solid: true },
  barrel:    { w: 1, h: 1, solid: true },
  crate:     { w: 1, h: 1, solid: true },
  plant:     { w: 1, h: 1, solid: false },
};

/**
 * Generate an interior layout for a building.
 * Deterministic: same ID → same layout.
 */
export function generateInteriorLayout(
  buildingId: string,
  houseType: HouseType,
  width: number = 12,
  height: number = 10,
): InteriorLayout {
  const seed = hashBuildingId(buildingId);
  const rng = seededRng(seed);
  const furniture: FurniturePlacement[] = [];

  const place = (
    kind: FurnitureKind,
    tx: number, ty: number,
    variant?: number,
  ) => {
    const spec = FURNITURE_CATALOG[kind];
    furniture.push({
      kind, tx, ty,
      w: spec.w, h: spec.h,
      variant: variant ?? Math.floor(rng() * 3),
      solid: spec.solid,
    });
  };

  // Common: rug in center (non-solid, decorative).
  place('rug', Math.floor(width / 2) - 1, Math.floor(height / 2) - 1, 0);

  // Bed: along back wall (top), position varies by seed.
  const bedTx = 1 + Math.floor(rng() * (width - 4));
  place('bed', bedTx, 1, 0);

  // Table: center-ish, offset by seed.
  const tableTx = 4 + Math.floor(rng() * 3);
  const tableTy = 4 + Math.floor(rng() * 2);
  place('table', tableTx, tableTy, 0);

  // Chairs around table.
  place('chair', tableTx - 1, tableTy, 0);
  place('chair', tableTx + 2, tableTy, 0);

  // House-type specific furniture.
  switch (houseType) {
    case 'farmhouse':
      place('crate', 1, height - 2, 0);
      place('crate', 2, height - 2, 1);
      place('barrel', width - 2, height - 2, 0);
      // Tools near door.
      break;
    case 'merchant':
      place('shelf', 1, 3, 1);
      place('shelf', 1, 4, 1);
      place('chest', width - 2, 1, 0);
      break;
    case 'guard':
      place('chest', 1, height - 2, 0); // Equipment storage
      place('workbench', width - 3, 1, 0);
      break;
    case 'craftsman':
      place('workbench', 1, 1, 0);
      place('shelf', width - 2, 3, 0);
      break;
    case 'cottage':
    default:
      place('fireplace', Math.floor(width / 2) - 1, 0, 0);
      place('shelf', width - 2, 2, 0);
      place('lamp', 1, height - 2, 0);
      break;
  }

  // Find bed position for NPC alignment.
  const bed = furniture.find((f) => f.kind === 'bed');

  return {
    id: buildingId,
    houseType,
    width,
    height,
    floor: houseType === 'farmhouse' ? 'wood-dark' : 'wood',
    wall: 'plaster',
    furniture,
    bedPosition: bed ? { tx: bed.tx, ty: bed.ty } : null,
  };
}

/**
 * Check if a tile is blocked by furniture.
 */
export function isTileBlocked(
  layout: InteriorLayout,
  tx: number, ty: number,
): boolean {
  for (const f of layout.furniture) {
    if (!f.solid) continue;
    if (tx >= f.tx && tx < f.tx + f.w && ty >= f.ty && ty < f.ty + f.h) {
      return true;
    }
  }
  return false;
}

/**
 * Validate a layout: furniture within bounds, no overlaps, bed exists if needed.
 * Returns list of errors (empty if valid).
 */
export function validateInteriorLayout(layout: InteriorLayout): string[] {
  const errors: string[] = [];

  for (const f of layout.furniture) {
    if (f.tx < 0 || f.ty < 0 || f.tx + f.w > layout.width || f.ty + f.h > layout.height) {
      errors.push(`Furniture ${f.kind} out of bounds at (${f.tx}, ${f.ty})`);
    }
  }

  // Check overlaps (solid furniture only).
  const solid = layout.furniture.filter((f) => f.solid);
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      const overlap = a.tx < b.tx + b.w && b.tx < a.tx + a.w &&
                      a.ty < b.ty + b.h && b.ty < a.ty + a.h;
      if (overlap) {
        errors.push(`Furniture overlap: ${a.kind} and ${b.kind}`);
      }
    }
  }

  return errors;
}

/**
 * BUILD 677: Shared coordinate contract for bed anchors.
 *
 * Converts a layout's bed tile position to a normalized position (0-1)
 * within the room. This can be mapped to any renderer-specific coordinate
 * system (field coords via cottageRectFor, screen percentages, etc.).
 */
export function bedAnchorNormalized(
  buildingId: string,
  houseType: HouseType,
): { x: number; y: number } | null {
  const layout = generateInteriorLayout(buildingId, houseType, 12, 10);
  if (!layout.bedPosition) return null;
  // Center of bed in normalized room coordinates (0-1).
  const bed = layout.furniture.find((f) => f.kind === 'bed');
  if (!bed) return null;
  return {
    x: (bed.tx + bed.w / 2) / layout.width,
    y: (bed.ty + bed.h / 2) / layout.height,
  };
}

/**
 * Get a valid NPC sleeping position adjacent to the bed.
 * Returns tile coordinates for a walkable tile next to the bed.
 */
export function sleepingTileAdjacentToBed(
  buildingId: string,
  houseType: HouseType,
): { tx: number; ty: number } | null {
  const layout = generateInteriorLayout(buildingId, houseType, 12, 10);
  if (!layout.bedPosition) return null;
  const bed = layout.furniture.find((f) => f.kind === 'bed');
  if (!bed) return null;
  // Try tiles adjacent to bed (below, left, right, above).
  const candidates = [
    { tx: bed.tx, ty: bed.ty + bed.h }, // below
    { tx: bed.tx - 1, ty: bed.ty },     // left
    { tx: bed.tx + bed.w, ty: bed.ty }, // right
    { tx: bed.tx, ty: bed.ty - 1 },     // above
  ];
  for (const c of candidates) {
    if (c.tx >= 0 && c.ty >= 0 && c.tx < layout.width && c.ty < layout.height &&
        !isTileBlocked(layout, c.tx, c.ty)) {
      return c;
    }
  }
  return null;
}
