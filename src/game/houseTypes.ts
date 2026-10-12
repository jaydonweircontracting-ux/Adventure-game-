// House type mapping for NPC residences (BUILD 675).
// Maps building IDs to house types based on resident archetype.
//
// The 6 Mosslight cottages house 13 NPCs (2 per cottage, 3 in cottage-1).
// Assignment is by sorted NPC ID order (see housing.ts assignBeds).

import type { HouseType } from './interiors';

/**
 * Get the house type for a building based on its resident's archetype.
 * For Mosslight cottages (4-7-building-4 through 4-7-building-9).
 *
 * Cottage assignments (sorted by NPC ID):
 * - cottage-1 (building-4): townsfolk-0 (Aldric, farmer), townsfolk-1 (Brenna, farmer), townsfolk-12 (Bryn, farmer)
 * - cottage-2 (building-5): townsfolk-2 (Cedric, merchant), townsfolk-3 (Father Aldous, priest)
 * - cottage-3 (building-6): townsfolk-4 (Rowan, guard), townsfolk-5 (Kess, guard)
 * - cottage-4 (building-7): townsfolk-6 (Tom, smith), townsfolk-7 (Mabel, commoner)
 * - cottage-5 (building-8): townsfolk-8 (Dunstan, commoner), townsfolk-9 (Elsa, commoner)
 * - cottage-6 (building-9): townsfolk-10 (Wren, child), townsfolk-11 (Pip, child)
 */
export function houseTypeForBuilding(buildingId: string): HouseType {
  // Mosslight cottages in chunk 4-7.
  const match = /^4-7-building-(\d+)$/.exec(buildingId);
  if (match) {
    const n = parseInt(match[1], 10);
    switch (n) {
      case 4: return 'farmhouse';  // cottage-1: farmers
      case 5: return 'merchant';   // cottage-2: merchant + priest
      case 6: return 'guard';      // cottage-3: guards
      case 7: return 'craftsman';  // cottage-4: smith + commoner
      case 8: return 'cottage';    // cottage-5: commoners
      case 9: return 'cottage';    // cottage-6: children
    }
  }
  // Default for other buildings.
  return 'cottage';
}
