// Organic screenshot-style town generator (BUILD 342). Houses cluster near
// the world road with varied setbacks and sizes, like a hand-built tilemap
// town. Pure and deterministic so scripts/simulate.ts can unit-test the
// placement invariants (no house on a road, no overlaps).
//
// Rects are authored in 0..100 field space; the caller scales to field units.

export interface TownHouseSpec {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Generate house rects for a non-starting town.
 * @param variantSeed location seed (drives the deterministic RNG)
 * @param variant 1 = town (10-13 houses), 2 = village (8-11), 3 = hamlet (6-9, wider spacing)
 * @param road chunk road arms like 'ns', 'ew', 'nesw', or 'none'
 * @param fieldSize chunk size in field units (houses keep absolute size)
 */
export function organicTownSpecs(variantSeed: number, variant: number, road: string, fieldSize = 140): TownHouseSpec[] {
  let s = (Math.abs(variantSeed) * 2654435761 + 987654321) % 4294967296;
  if (s === 0) s = 987654321;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const specs: TownHouseSpec[] = [];
  const overlaps = (r: TownHouseSpec): boolean =>
    specs.some((p) => r.left < p.right + 2 && r.right > p.left - 2 && r.top < p.bottom + 2 && r.bottom > p.top - 2);
  // Road corridors per arm (9 half-width): only the arms that exist.
  // n: x 41-59, y 0-59 · s: x 41-59, y 41-100 · e: x 41-100, y 41-59 · w: x 0-59, y 41-59.
  const hitsRoad = (r: TownHouseSpec): boolean => {
    const hit = (l: number, t: number, ri: number, b: number): boolean =>
      r.left < ri && r.right > l && r.top < b && r.bottom > t;
    if (road.includes('n') && hit(41, 0, 59, 59)) return true;
    if (road.includes('s') && hit(41, 41, 59, 100)) return true;
    if (road.includes('e') && hit(41, 41, 100, 59)) return true;
    if (road.includes('w') && hit(0, 41, 59, 59)) return true;
    return false;
  };
  const inBounds = (r: TownHouseSpec): boolean => r.left >= 6 && r.top >= 6 && r.right <= 94 && r.bottom <= 94;

  // Town size scales with the road network: more arms = more frontage.
  // Base targets: v1 town 10-13, v2 village 8-11, v3 hamlet 6-9.
  const armChars = road.split('').filter((c) => 'nsew'.includes(c));
  const baseTarget = variant === 1 ? 10 + Math.floor(rnd() * 4) : variant === 2 ? 8 + Math.floor(rnd() * 4) : 6 + Math.floor(rnd() * 4);
  const targetCount = armChars.length === 0 ? baseTarget : Math.max(6, Math.min(baseTarget, 4 + armChars.length * 2 + Math.floor(rnd() * 3)));
  // House sizes in normalized 0..100 space, derived from absolute field-unit
  // targets (17-22 wide, 13-17 tall) so houses don't grow with chunk size.
  // BUILD 343: fieldSize 280 -> norm = 100/280.
  const norm = 100 / fieldSize;
  const houseW = () => (17 + rnd() * 5) * norm;
  const houseH = () => (13 + rnd() * 4) * norm;

  if (!road.includes('n') && !road.includes('s') && !road.includes('e') && !road.includes('w')) {
    // Roadless hamlet: ring of houses around a central green.
    let attempts = 0;
    while (specs.length < targetCount && attempts < 1200) {
      attempts++;
      const angle = rnd() * Math.PI * 2;
      const radius = 19 + rnd() * 13;
      const w = houseW();
      const h = houseH();
      const cx = 50 + Math.cos(angle) * radius;
      const cy = 50 + Math.sin(angle) * radius;
      const r = { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
      if (!inBounds(r) || overlaps(r)) continue;
      specs.push(r);
    }
    return specs;
  }

  let attempts = 0;
  // Quadrant sampling: the roads divide the chunk into 4 quadrants. Houses
  // go in the quadrants, set back 9+ from the road centerlines. Quadrants
  // are clear of all road arms by construction.
  const quadrants = [
    { x0: 59, x1: 92, y0: 8, y1: 41 },  // NE
    { x0: 8, x1: 41, y0: 8, y1: 41 },   // NW
    { x0: 59, x1: 92, y0: 59, y1: 92 }, // SE
    { x0: 8, x1: 41, y0: 59, y1: 92 },  // SW
  ];
  while (specs.length < targetCount && attempts < 1500) {
    attempts++;
    const q = quadrants[Math.floor(rnd() * quadrants.length)];
    // Modest house sizes (screenshot-style), absolute field units.
    const w = houseW();
    const h = houseH();
    if (q.x1 - q.x0 - w <= 0 || q.y1 - q.y0 - h <= 0) continue;
    const cx = q.x0 + w / 2 + rnd() * (q.x1 - q.x0 - w);
    const cy = q.y0 + h / 2 + rnd() * (q.y1 - q.y0 - h);
    const r = { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
    if (!inBounds(r) || hitsRoad(r) || overlaps(r)) continue;
    specs.push(r);
  }
  return specs;
}
