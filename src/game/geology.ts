// Deterministic geology layer: mineral regions and ore node placement.
//
// World-anchored design: every value derives from (seed, world tile coords)
// via coordinate hashing. Chunk generation order never affects results.
// This is the resource foundation for mining (Phase C of world gen;
// supports the mining skill's future ore-node loop).
//
// Conventions:
// - World tile coords: wx = cx * chunkSize + lx (chunk-independent).
// - Node placement uses a coarse jittered grid (CELL = 9 tiles) so nodes
//   are naturally spaced and identical regardless of chunk borders.

export type OreKind = 'stone' | 'coal' | 'copper' | 'iron' | 'silver' | 'gold';

export interface OreNode {
  /** Stable id: `ore-<kind>-<wx>-<wy>` */
  id: string;
  kind: OreKind;
  /** World tile coordinates (chunk-independent). */
  wx: number;
  wy: number;
  /** Ore yielded when fully mined. */
  richness: number;
}

/** Deterministic [0,1) hash from (seed, wx, wy, salt). Integer-math based. */
export function geoHash(seed: number, wx: number, wy: number, salt: number): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (wx | 0), 0x85ebca6b);
  h = Math.imul(h ^ (wy | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (salt | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * Low-frequency mineral richness field, 0..1.
 * Combines two coarse value-noise octaves so ore-bearing regions form
 * coherent geological zones instead of per-tile random rolls.
 */
export function mineralRichness(seed: number, wx: number, wy: number): number {
  // Coarse lattice value noise at two frequencies; lattice-anchored so it is
  // continuous across chunk borders by construction.
  const octave = (freq: number, salt: number): number => {
    const gx = wx / freq;
    const gy = wy / freq;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v00 = geoHash(seed, x0, y0, salt);
    const v10 = geoHash(seed, x0 + 1, y0, salt);
    const v01 = geoHash(seed, x0, y0 + 1, salt);
    const v11 = geoHash(seed, x0 + 1, y0 + 1, salt);
    return v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v00 - v10 - v01 + v11) * sx * sy;
  };
  return octave(48, 101) * 0.65 + octave(17, 202) * 0.35;
}

/** Terrain kinds where ore nodes may appear. Water, meadow, forest etc. excluded. */
const ORE_TERRAIN = new Set([
  'rock', 'hills', 'mountains', 'mountain', 'crag', 'highlands', 'foothills', 'cliff', 'stone',
]);

/** Jittered placement grid cell size (world tiles). */
export const GEOLOGY_CELL = 9;

/** Pick ore kind from richness tier + hash roll. Rarer ores need richer ground. */
export function oreKindFor(richness: number, roll: number): OreKind | null {
  if (richness > 0.86) return roll < 0.35 ? 'gold' : roll < 0.7 ? 'silver' : 'iron';
  if (richness > 0.74) return roll < 0.55 ? 'iron' : roll < 0.85 ? 'copper' : 'coal';
  if (richness > 0.62) return roll < 0.5 ? 'copper' : roll < 0.8 ? 'coal' : 'stone';
  if (richness > 0.52) return roll < 0.6 ? 'coal' : 'stone';
  return null;
}

/**
 * Ore nodes for one chunk. Deterministic in (seed, cx, cy).
 *
 * Each GEOLOGY_CELL x GEOLOGY_CELL world cell contributes at most one node,
 * at a hash-jittered position inside the cell. Because cells are world-anchored
 * (not chunk-anchored), adjacent chunks never duplicate or miss nodes and
 * generation order is irrelevant.
 *
 * @param terrainKindAt returns the terrain kind string for a world tile.
 */
export function oreNodesForChunk(
  seed: number,
  cx: number,
  cy: number,
  chunkSize: number,
  terrainKindAt: (wx: number, wy: number) => string,
): OreNode[] {
  const nodes: OreNode[] = [];
  const x0 = cx * chunkSize;
  const y0 = cy * chunkSize;
  const x1 = x0 + chunkSize;
  const y1 = y0 + chunkSize;

  // World-anchored cell range overlapping this chunk.
  const cellX0 = Math.floor(x0 / GEOLOGY_CELL);
  const cellX1 = Math.floor((x1 - 1) / GEOLOGY_CELL);
  const cellY0 = Math.floor(y0 / GEOLOGY_CELL);
  const cellY1 = Math.floor((y1 - 1) / GEOLOGY_CELL);

  for (let gx = cellX0; gx <= cellX1; gx++) {
    for (let gy = cellY0; gy <= cellY1; gy++) {
      // One candidate position per world cell, hash-jittered.
      const jx = Math.floor(geoHash(seed, gx, gy, 301) * GEOLOGY_CELL);
      const jy = Math.floor(geoHash(seed, gx, gy, 302) * GEOLOGY_CELL);
      const wx = gx * GEOLOGY_CELL + jx;
      const wy = gy * GEOLOGY_CELL + jy;
      // Only emit the node from the chunk that owns its world tile.
      if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1) continue;

      const richness = mineralRichness(seed, wx, wy);
      const kindRoll = geoHash(seed, wx, wy, 303);
      const kind = oreKindFor(richness, kindRoll);
      if (!kind) continue;
      if (!ORE_TERRAIN.has(terrainKindAt(wx, wy))) continue;

      nodes.push({
        id: `ore-${kind}-${wx}-${wy}`,
        kind,
        wx,
        wy,
        richness: kind === 'gold' || kind === 'silver' ? 1 : kind === 'iron' ? 2 : 3,
      });
    }
  }
  return nodes;
}
