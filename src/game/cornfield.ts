// Cornfields: deterministic clusters of harvestable corn stalks.
// Corn no longer spawns as scattered single sprites; it grows in field
// patches (4-6 cols x 3-4 rows) in meadow-like terrain. Stalks are
// harvestable via the player's attack and drop corn loot.
export type Point = { x: number; y: number };

export type CornStalk = { id: number; position: Point; harvested: boolean };

// Terrain types that grow cornfields (same set where corn appeared before).
const CORN_TERRAINS = ['meadow', 'grassland', 'greenvale'];

export function cornStalksForChunk(
  chunk: Point,
  terrain: string,
  isBlocked: (pos: Point) => boolean,
): CornStalk[] {
  if (!CORN_TERRAINS.includes(terrain)) return [];
  const seed = Math.abs((chunk.x * 83492791) ^ (chunk.y * 2971215073)) >>> 0;
  let s = seed || 1;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const stalks: CornStalk[] = [];
  let id = 0;
  // ~45% of meadow chunks get one patch, ~15% get a second.
  const patchCount = (rng() < 0.45 ? 1 : 0) + (rng() < 0.15 ? 1 : 0);
  for (let p = 0; p < patchCount; p++) {
    // Patch origin kept clear of chunk center (buildings) and edges.
    const originX = 18 + rng() * 44;
    const originY = 18 + rng() * 44;
    const cols = 4 + Math.floor(rng() * 3); // 4-6
    const rows = 3 + Math.floor(rng() * 2); // 3-4
    const spacing = 7;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = originX + c * spacing + (rng() - 0.5) * 3;
        const y = originY + r * spacing + (rng() - 0.5) * 3;
        const pos = { x: Math.min(90, Math.max(10, x)), y: Math.min(90, Math.max(10, y)) };
        if (isBlocked(pos)) continue;
        stalks.push({ id: id++, position: pos, harvested: false });
      }
    }
  }
  return stalks;
}
