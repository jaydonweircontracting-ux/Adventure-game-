// Housing registry — assigns every NPC who needs sleep a home and a bed.
// Homes are real buildings with doors; beds are points inside them.
//
// The registry is built once per settlement from the building rects and
// doorway data. Assignments are deterministic (seeded) so an NPC always
// sleeps in the same bed.

import type { NavPoint } from './npcNavigation';

export type Bed = {
  id: string;
  /** Field point of the bed (inside the house). */
  position: NavPoint;
  /** NPC id currently assigned, if any. */
  occupantId?: string;
};

export type Home = {
  id: string;
  buildingId: string;
  /** Doorway id linking exterior <-> interior. */
  doorwayId: string;
  beds: Bed[];
};

export type HousingRegistry = {
  homes: Home[];
  /** npcId -> { homeId, bedId } */
  assignments: Record<string, { homeId: string; bedId: string }>;
  warnings: string[];
};

/**
 * Build a housing registry from residential building rects.
 * Each rect gets `bedsPerHome` beds laid out inside it.
 */
export function buildHousingRegistry(
  residential: { buildingId: string; doorwayId: string; rect: { left: number; top: number; right: number; bottom: number } }[],
  bedsPerHome = 2,
): HousingRegistry {
  const homes: Home[] = residential.map((r) => {
    const beds: Bed[] = [];
    for (let b = 0; b < bedsPerHome; b++) {
      // Beds along the back wall, spaced out.
      const bx = r.rect.left + ((b + 1) / (bedsPerHome + 1)) * (r.rect.right - r.rect.left);
      const by = r.rect.top + (r.rect.bottom - r.rect.top) * 0.3;
      beds.push({ id: `${r.buildingId}-bed-${b + 1}`, position: { x: bx, y: Math.max(r.rect.top + 1, by) } });
    }
    return { id: r.buildingId, buildingId: r.buildingId, doorwayId: r.doorwayId, beds };
  });
  return { homes, assignments: {}, warnings: [] };
}

/**
 * Assign every NPC a bed. Deterministic: sort NPC ids, fill homes in order.
 * If there aren't enough beds, record a HOUSING SHORTAGE warning per NPC
 * instead of silently breaking their schedule.
 */
export function assignBeds(registry: HousingRegistry, npcIds: string[]): HousingRegistry {
  const homes = registry.homes.map((h) => ({ ...h, beds: h.beds.map((b) => ({ ...b })) }));
  const assignments: Record<string, { homeId: string; bedId: string }> = {};
  const warnings: string[] = [];
  const sorted = [...npcIds].sort();
  let bedIndex = 0;
  const allBeds: { home: (typeof homes)[number]; bed: Bed }[] = [];
  for (const home of homes) for (const bed of home.beds) allBeds.push({ home, bed });

  for (const npcId of sorted) {
    if (bedIndex < allBeds.length) {
      const { home, bed } = allBeds[bedIndex++];
      bed.occupantId = npcId;
      assignments[npcId] = { homeId: home.id, bedId: bed.id };
    } else {
      warnings.push(`HOUSING SHORTAGE — NPC: ${npcId}. Required: 1 bed. Available: 0.`);
    }
  }
  return { homes, assignments, warnings };
}

/** Look up an NPC's assigned bed position, if any. */
export function bedFor(registry: HousingRegistry, npcId: string): { home: Home; bed: Bed } | null {
  const a = registry.assignments[npcId];
  if (!a) return null;
  const home = registry.homes.find((h) => h.id === a.homeId);
  const bed = home?.beds.find((b) => b.id === a.bedId);
  if (!home || !bed) return null;
  return { home, bed };
}

/** Residential cottage rects for Mosslight Crossing (chunk 4,7), field units.
 * Six small cottages in open ground west and north of the four main
 * buildings — 2 beds each = 12 beds for the 12 townsfolk. */
export function mosslightCottages(): { left: number; top: number; right: number; bottom: number }[] {
  return [
    { left: 14, top: 62, right: 20, bottom: 66.5 },   // cottage 1 (west)
    { left: 14, top: 74, right: 20, bottom: 78.5 },   // cottage 2 (west)
    { left: 14, top: 86, right: 20, bottom: 90.5 },   // cottage 3 (west)
    { left: 62, top: 22, right: 68, bottom: 26.5 },   // cottage 4 (north)
    { left: 76, top: 22, right: 82, bottom: 26.5 },   // cottage 5 (north)
    { left: 90, top: 22, right: 96, bottom: 26.5 },   // cottage 6 (north)
  ];
}
