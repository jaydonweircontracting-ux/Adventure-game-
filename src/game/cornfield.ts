// Cornfields: deterministic clusters of harvestable corn stalks.
// Corn no longer spawns as scattered single sprites; it grows in dense field
// patches in meadow-like terrain. Stalks are planted in tight rows (3-unit
// spacing) so the patch reads as a real cornfield, not isolated dots.
// Stalks are harvestable via the player's attack and drop corn loot.
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
    // Patch is up to ~33 wide x ~21 tall. FIELD_SIZE is 140.
    const originX = 16 + rng() * 75;
    const originY = 16 + rng() * 75;
    const cols = 8 + Math.floor(rng() * 3); // 8-10
    const rows = 5 + Math.floor(rng() * 3); // 5-7
    const spacing = 3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = originX + c * spacing + (rng() - 0.5) * 1.6;
        const y = originY + r * spacing + (rng() - 0.5) * 1.6;
        const pos = { x: Math.min(130, Math.max(10, x)), y: Math.min(130, Math.max(10, y)) };
        if (isBlocked(pos)) continue;
        stalks.push({ id: id++, position: pos, harvested: false });
      }
    }
  }
  return stalks;
}
