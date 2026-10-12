/**
 * Procedural settlement layout system (BUILD 680).
 *
 * Generates believable hamlet/village layouts: houses clustered around
 * a center, with roads, not scattered in lines.
 *
 * Design principles:
 * - Settlement center first, then building slots around it
 * - Noise influences placement, doesn't replace the layout
 * - Deterministic for same settlement ID and seed
 * - Building IDs stable across generations
 */

export interface SettlementCenter {
  x: number;
  y: number; // field coordinates (0-140)
}

export interface BuildingSlot {
  id: string; // e.g., 'cottage-1'
  rect: { left: number; top: number; right: number; bottom: number };
  /** Angle from center (radians), for orientation/road facing. */
  angleFromCenter: number;
  /** Distance from center in field units. */
  distanceFromCenter: number;
}

export type SettlementType = 'hamlet' | 'village' | 'market-town';

/**
 * Seeded RNG (mulberry32-style, deterministic).
 */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 0xdeadbeef;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a hamlet layout: 6 cottages around a village green.
 *
 * The center is a village green. Cottages are placed in a rough ring
 * around it, with seeded variation in angle and distance. This creates
 * a believable cluster rather than a straight line.
 *
 * @param center - village center in field coords
 * @param seed - deterministic seed
 * @param cottageIds - stable IDs like ['cottage-1', ...]
 * @param cottageSize - {w, h} in field units
 */
export function generateHamletLayout(
  center: SettlementCenter,
  seed: number,
  cottageIds: string[],
  cottageSize: { w: number; h: number } = { w: 6, h: 4.5 },
): BuildingSlot[] {
  const rng = seededRandom(seed);
  const slots: BuildingSlot[] = [];

  // Place cottages in a ring around the center.
  // Start at a seeded angle, space evenly with jitter.
  const baseAngle = rng() * Math.PI * 2;
  const count = cottageIds.length;

  for (let i = 0; i < count; i++) {
    // Even spacing around circle + jitter (±20 degrees).
    const angle = baseAngle + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.7;
    // Distance: 18-28 field units from center (outside the green, not too far).
    const distance = 18 + rng() * 10;

    const cx = center.x + Math.cos(angle) * distance;
    const cy = center.y + Math.sin(angle) * distance;

    // Cottage rect centered at (cx, cy).
    const left = cx - cottageSize.w / 2;
    const top = cy - cottageSize.h / 2;

    slots.push({
      id: cottageIds[i],
      rect: {
        left,
        top,
        right: left + cottageSize.w,
        bottom: top + cottageSize.h,
      },
      angleFromCenter: angle,
      distanceFromCenter: distance,
    });
  }

  return slots;
}

/**
 * Validate a settlement layout: no overlaps, within bounds.
 */
export function validateSettlementLayout(
  slots: BuildingSlot[],
  fieldSize: number = 140,
): string[] {
  const errors: string[] = [];

  // Check bounds.
  for (const s of slots) {
    if (s.rect.left < 2 || s.rect.top < 2 || s.rect.right > fieldSize - 2 || s.rect.bottom > fieldSize - 2) {
      errors.push(`Building ${s.id} out of bounds`);
    }
  }

  // Check overlaps (with 1-unit buffer).
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i].rect, b = slots[j].rect;
      if (a.left < b.right + 1 && b.left < a.right + 1 &&
          a.top < b.bottom + 1 && b.top < a.bottom + 1) {
        errors.push(`Buildings ${slots[i].id} and ${slots[j].id} overlap`);
      }
    }
  }

  return errors;
}
