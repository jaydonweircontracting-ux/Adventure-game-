export type WorldMapBiome = 'ocean' | 'shore' | 'meadow' | 'forest' | 'desert' | 'tundra' | 'rock';
export type WorldMapDetail = 'waves' | 'pebbles' | 'bush' | 'trees' | 'cactus' | 'munchleaf' | 'ridge' | null;
export type WorldMapBounds = { minX: number; maxX: number; minY: number; maxY: number };
export const WORLD_MAP_BOUNDS: WorldMapBounds = { minX: 0, maxX: 10, minY: 2, maxY: 12 };
export const WORLD_MAP_RESERVED_MEADOW_COORDINATES = [
  '3,6', '4,6', '5,6', '3,7', '4,7', '5,7', '3,8', '4,8', '5,8',
] as const;
export const WORLD_MAP_LAND_COORDINATES = [
  '0,7', '8,7', '5,2', '2,4', '9,3', '3,12', '6,10', '10,10', '1,3',
] as const;
export type GeneratedWorldTile = { x: number; y: number; row: number; column: number; biome: WorldMapBiome; detail: WorldMapDetail; nearBiomeBorder: boolean };

const BIOMES: WorldMapBiome[] = ['ocean', 'shore', 'meadow', 'forest', 'desert', 'tundra', 'rock'];
const LAND_BIOMES: WorldMapBiome[] = ['shore', 'meadow', 'forest', 'desert', 'tundra', 'rock'];
const BASE_WEIGHTS: Record<WorldMapBiome, number> = { ocean: 1.1, shore: 1.4, meadow: 4.8, forest: 2.8, desert: 1.8, tundra: 1.7, rock: 1.9 };
const ALLOWED_NEIGHBORS: Record<WorldMapBiome, WorldMapBiome[]> = {
  ocean: ['ocean', 'shore'],
  shore: ['ocean', 'shore', 'meadow'],
  meadow: ['shore', 'meadow', 'forest', 'desert', 'tundra', 'rock'],
  forest: ['meadow', 'forest', 'rock'],
  desert: ['meadow', 'desert', 'shore', 'rock'],
  tundra: ['meadow', 'tundra', 'rock'],
  rock: ['meadow', 'forest', 'desert', 'tundra', 'rock'],
};
const HEX_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const;

class MapRng {
  private state: number;
  constructor(seed: number) { this.state = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0; }
  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

const cellKey = (x: number, y: number) => x + ',' + y;
const inside = (x: number, y: number, bounds: WorldMapBounds) => x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
function neighbors(x: number, y: number, bounds: WorldMapBounds) {
  return HEX_DIRECTIONS.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter((point) => inside(point.x, point.y, bounds));
}
function canTouch(source: WorldMapBiome, candidate: WorldMapBiome) { return ALLOWED_NEIGHBORS[source].includes(candidate); }
function chooseWeighted(options: WorldMapBiome[], cells: Map<string, Set<WorldMapBiome>>, x: number, y: number, bounds: WorldMapBounds, rng: MapRng) {
  const adjacent = neighbors(x, y, bounds);
  const scored = options.map((biome) => {
    let score = BASE_WEIGHTS[biome];
    for (const point of adjacent) {
      const neighborOptions = cells.get(cellKey(point.x, point.y));
      if (neighborOptions?.has(biome)) score += 0.75;
      if (neighborOptions?.size === 1 && neighborOptions.has(biome)) score += 3.5;
    }
    return { biome, score };
  });
  const total = scored.reduce((sum, entry) => sum + entry.score, 0);
  let roll = rng.next() * total;
  for (const entry of scored) { if ((roll -= entry.score) <= 0) return entry.biome; }
  return scored[scored.length - 1].biome;
}

function detailFor(biome: WorldMapBiome, nearWater: boolean, nearBiomeBorder: boolean, seed: number, x: number, y: number): WorldMapDetail {
  const rng = new MapRng((seed ^ Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663)) >>> 0);
  if (nearBiomeBorder && biome !== 'ocean' && biome !== 'shore' && rng.next() < 0.52) return 'pebbles';
  if (biome === 'ocean') return 'waves';
  if (biome === 'shore') return 'pebbles';
  if (biome === 'forest' && rng.next() < 0.82) return 'trees';
  if (biome === 'desert' && rng.next() < 0.62) return 'cactus';
  if (biome === 'tundra' && rng.next() < 0.7) return 'munchleaf';
  if (biome === 'rock' && rng.next() < 0.78) return 'ridge';
  if (biome === 'meadow' && !nearWater && rng.next() < 0.58) return 'bush';
  return null;
}

export function generateWorldMap(seed: number, bounds: WorldMapBounds = WORLD_MAP_BOUNDS): GeneratedWorldTile[] {
  const rng = new MapRng(seed);
  const cells = new Map<string, Set<WorldMapBiome>>();
  const reservedMeadow = new Set<string>(WORLD_MAP_RESERVED_MEADOW_COORDINATES);
  const reservedLand = new Set<string>(WORLD_MAP_LAND_COORDINATES);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const key = cellKey(x, y);
      const edge = x === bounds.minX || x === bounds.maxX || y === bounds.minY || y === bounds.maxY;
      const initialOptions = edge ? ['ocean'] : reservedMeadow.has(key) ? ['meadow'] : reservedLand.has(key) ? LAND_BIOMES : BIOMES;
      cells.set(key, new Set(initialOptions));
    }
  }
  const startKey = cellKey(4, 7);
  if (cells.has(startKey)) cells.set(startKey, new Set(['meadow']));
  const pending = [{ x: 4, y: 7 }];
  while (pending.length) {
    const current = pending.shift()!;
    const currentOptions = cells.get(cellKey(current.x, current.y));
    if (!currentOptions) continue;
    for (const point of neighbors(current.x, current.y, bounds)) {
      const key = cellKey(point.x, point.y);
      const options = cells.get(key)!;
      const reduced = new Set([...options].filter((candidate) => [...currentOptions].some((source) => canTouch(source, candidate))));
      if (reduced.size === 0) reduced.add(currentOptions.has('ocean') ? 'shore' : 'meadow');
      if (reduced.size !== options.size) { cells.set(key, reduced); pending.push(point); }
    }
  }
  while (true) {
    const unresolved = [...cells.entries()].filter(([, options]) => options.size > 1);
    if (!unresolved.length) break;
    const lowestEntropy = Math.min(...unresolved.map(([, options]) => options.size));
    const candidates = unresolved.filter(([, options]) => options.size === lowestEntropy);
    const [key, options] = candidates[Math.floor(rng.next() * candidates.length)];
    const [xText, yText] = key.split(',');
    const x = Number(xText); const y = Number(yText);
    cells.set(key, new Set([chooseWeighted([...options], cells, x, y, bounds, rng)]));
    const queue = [{ x, y }];
    while (queue.length) {
      const current = queue.shift()!;
      const currentOptions = cells.get(cellKey(current.x, current.y))!;
      for (const point of neighbors(current.x, current.y, bounds)) {
        const neighborKey = cellKey(point.x, point.y);
        const neighborOptions = cells.get(neighborKey)!;
        const reduced = new Set([...neighborOptions].filter((candidate) => [...currentOptions].some((source) => canTouch(source, candidate))));
        if (reduced.size === 0) reduced.add(currentOptions.has('ocean') ? 'shore' : 'meadow');
        if (reduced.size !== neighborOptions.size) { cells.set(neighborKey, reduced); queue.push(point); }
      }
    }
  }
  const tiles: GeneratedWorldTile[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const biome = [...cells.get(cellKey(x, y))!][0];
      const adjacentBiomes = neighbors(x, y, bounds).map((point) => [...cells.get(cellKey(point.x, point.y))!][0]);
      const nearBiomeBorder = adjacentBiomes.some((neighbor) => neighbor !== biome);
      const nearWater = biome === 'ocean' || biome === 'shore' || adjacentBiomes.some((neighbor) => neighbor === 'ocean' || neighbor === 'shore');
      tiles.push({ x, y, row: y - bounds.minY, column: x - bounds.minX, biome, nearBiomeBorder, detail: detailFor(biome, nearWater, nearBiomeBorder, seed, x, y) });
    }
  }
  return tiles;
}

export function worldMapBiomeLabel(biome: WorldMapBiome) {
  return { ocean: 'Open Water', shore: 'Coastal Shore', meadow: 'Meadowlands', forest: 'Deep Forest', desert: 'Sunwash Desert', tundra: 'Frost Tundra', rock: 'Highland Ridges' }[biome];
}
