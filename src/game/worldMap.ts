export type WorldMapBiome = 'ocean' | 'shore' | 'meadow' | 'forest' | 'desert' | 'tundra' | 'rock';
export type WorldMapDetail = 'waves' | 'pebbles' | 'bush' | 'trees' | 'cactus' | 'munchleaf' | 'ridge' | null;
export type WorldMapBounds = { minX: number; maxX: number; minY: number; maxY: number };
// Expanded world: 31x31 chunks. The original 11x11 region (CORE_BOUNDS) is
// generated bit-identical to before and sits at the center; the outer ring
// is generated deterministically around it.
export const WORLD_MAP_BOUNDS: WorldMapBounds = { minX: -10, maxX: 20, minY: -8, maxY: 22 };
export const CORE_WORLD_BOUNDS: WorldMapBounds = { minX: 0, maxX: 10, minY: 2, maxY: 12 };
// Second continent: a truly huge landmass far to the east of the original world,
// separated by a vast ocean gap. It reads as a real continent next to the home
// region: many times its size and a long voyage away. The original 31x31 world
// always generates bit-identically; the second continent is purely additive.
export const SECOND_CONTINENT_BOUNDS: WorldMapBounds = { minX: 69, maxX: 148, minY: -28, maxY: 51 };
export const EXPANDED_WORLD_BOUNDS: WorldMapBounds = { minX: -10, maxX: 148, minY: -28, maxY: 51 };
// Ocean gap between the original world and the second continent (x 21..68).
const SECOND_CONTINENT_GAP_MIN_X = WORLD_MAP_BOUNDS.maxX + 1;
const SECOND_CONTINENT_GAP_MAX_X = SECOND_CONTINENT_BOUNDS.minX - 1;
export const WORLD_MAP_RESERVED_MEADOW_COORDINATES = [
  '3,6', '4,6', '5,6', '3,7', '4,7', '5,7', '3,8', '4,8', '5,8',
] as const;
export const WORLD_MAP_LAND_COORDINATES = [
  '0,7', '8,7', '5,2', '2,4', '9,3', '3,12', '6,10', '10,10', '1,3',
] as const;
export type WorldMapClimate = { elevation: number; temperature: number; moisture: number };
export type GeneratedWorldTile = { x: number; y: number; row: number; column: number; biome: WorldMapBiome; detail: WorldMapDetail; nearBiomeBorder: boolean; climate: WorldMapClimate; elevationLevel: number };

const BIOMES: WorldMapBiome[] = ['ocean', 'shore', 'meadow', 'forest', 'desert', 'tundra', 'rock'];
const LAND_BIOMES: WorldMapBiome[] = ['shore', 'meadow', 'forest', 'desert', 'tundra', 'rock'];
// Interior land never starts as shore: shore belongs to the coastline band.
const INLAND_BIOMES: WorldMapBiome[] = ['meadow', 'forest', 'desert', 'tundra', 'rock'];
const ALLOWED_NEIGHBORS: Record<WorldMapBiome, WorldMapBiome[]> = {
  ocean: ['ocean', 'shore'],
  shore: ['ocean', 'shore', 'meadow'],
  meadow: ['shore', 'meadow', 'forest', 'desert', 'tundra', 'rock'],
  forest: ['meadow', 'forest', 'tundra', 'rock'],
  desert: ['meadow', 'forest', 'desert', 'shore', 'rock'],
  tundra: ['meadow', 'forest', 'tundra', 'rock'],
  rock: ['meadow', 'forest', 'desert', 'tundra', 'rock'],
};
const GRID_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

// Sea level for the elevation field: below it is ocean, just above it is shore.
const SEA_LEVEL = 0.42;

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

// Seeded smooth value noise with fractal Brownian motion: smooth random where
// each point blends with its neighbors, so terrain flows instead of jittering.
function makeSeededNoise(seed: number) {
  const hash2 = (ix: number, iy: number) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const valueNoise = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    const ux = fade(fx);
    const uy = fade(fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  return (x: number, y: number) => {
    let total = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let norm = 0;
    for (let octave = 0; octave < 3; octave++) {
      total += amplitude * valueNoise(x * frequency, y * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return total / norm;
  };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Three stacked climate fields: elevation shapes the continent and coastlines,
// temperature runs cold north to hot south, moisture decides wet vs dry.
// Biomes come from the temperature x moisture space, not a single axis.
function climateFor(
  x: number,
  y: number,
  bounds: WorldMapBounds,
  elevationNoise: (x: number, y: number) => number,
  temperatureNoise: (x: number, y: number) => number,
  moistureNoise: (x: number, y: number) => number,
): WorldMapClimate {
  const nx = (x - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX);
  const ny = (y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY);
  const dist = Math.hypot(nx - 0.5, ny - 0.5) / Math.SQRT1_2;
  const falloff = Math.max(0, 1 - dist * dist);
  // Low sampling frequencies: climate features span several tiles so biomes
  // form regions (bands, blobs, coastlines) instead of per-tile speckle.
  // Temperature runs cold north to hot south; moisture dries toward the south
  // so deserts form a southern band while the temperate middle grows forests.
  const elevation = 0.2 + falloff * 0.6 + (elevationNoise(x * 0.3 + 11.7, y * 0.3 + 5.3) - 0.5) * 0.32;
  const temperature = Math.min(1, Math.max(0, 0.25 + ny * 0.55 + (temperatureNoise(x * 0.28 + 41.2, y * 0.28 + 17.9) - 0.5) * 0.2));
  const moisture = Math.min(1, Math.max(0, moistureNoise(x * 0.26 + 71.4, y * 0.26 + 29.6) * 0.75 + (0.5 - ny) * 0.45 + 0.125));
  return { elevation, temperature, moisture };
}

// Per-tile biome weights from the climate: hot+dry -> desert, cold -> tundra,
// wet+mild -> forest, high elevation -> rock, near sea level -> shore.
// Climate leads; the WFC neighbor bonus only encourages natural blobs.
function climateBiomeWeights(climate: WorldMapClimate): Record<WorldMapBiome, number> {
  const { elevation, temperature, moisture } = climate;
  const hot = smoothstep(0.5, 0.75, temperature);
  const cold = 1 - smoothstep(0.3, 0.5, temperature);
  const dry = 1 - smoothstep(0.35, 0.55, moisture);
  const wet = smoothstep(0.45, 0.65, moisture);
  const mild = smoothstep(0.3, 0.45, temperature) * (1 - smoothstep(0.62, 0.8, temperature));
  const high = smoothstep(0.68, 0.82, elevation);
  const coastal = 1 - smoothstep(0.02, 0.1, elevation - SEA_LEVEL);
  return {
    ocean: 0,
    shore: 3.5 * coastal,
    meadow: 1.0 + 1.4 * mild,
    // Forests dislike true heat: hot+wet grows a little jungle, hot+dry is desert.
    forest: (0.5 + 8 * wet * (0.3 + 0.7 * mild)) * (1 - 0.7 * hot),
    desert: 0.2 + 9 * hot * dry,
    tundra: 0.2 + 10 * cold * (0.45 + 0.55 * (1 - wet)),
    rock: 0.5 + 8 * high,
  };
}

const cellKey = (x: number, y: number) => x + ',' + y;
const inside = (x: number, y: number, bounds: WorldMapBounds) => x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
function neighbors(x: number, y: number, bounds: WorldMapBounds) {
  return GRID_DIRECTIONS.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter((point) => inside(point.x, point.y, bounds));
}
function canTouch(source: WorldMapBiome, candidate: WorldMapBiome) { return ALLOWED_NEIGHBORS[source].includes(candidate); }
function chooseWeighted(options: WorldMapBiome[], weights: Record<WorldMapBiome, number>, cells: Map<string, Set<WorldMapBiome>>, x: number, y: number, bounds: WorldMapBounds, rng: MapRng) {
  const adjacent = neighbors(x, y, bounds);
  const scored = options.map((biome) => {
    let score = weights[biome];
    for (const point of adjacent) {
      const neighborOptions = cells.get(cellKey(point.x, point.y));
      if (neighborOptions?.has(biome)) score += 0.15;
      if (neighborOptions?.size === 1 && neighborOptions.has(biome)) score += 1.5;
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

// Legacy WFC generator: produces the original 11x11 core region bit-identical
// to before. The core is the authoritative existing world; expansion tiles
// are generated around it by generateOuterTiles below.
function generateCoreWorldMap(seed: number): GeneratedWorldTile[] {
  const bounds = CORE_WORLD_BOUNDS;
  const rng = new MapRng(seed);
  const elevationNoise = makeSeededNoise((seed ^ 0x9e3779b9) >>> 0);
  const temperatureNoise = makeSeededNoise((seed ^ 0x85ebca6b) >>> 0);
  const moistureNoise = makeSeededNoise((seed ^ 0xc2b2ae35) >>> 0);
  const climates = new Map<string, WorldMapClimate>();
  const weights = new Map<string, Record<WorldMapBiome, number>>();
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const climate = climateFor(x, y, bounds, elevationNoise, temperatureNoise, moistureNoise);
      climates.set(cellKey(x, y), climate);
      weights.set(cellKey(x, y), climateBiomeWeights(climate));
    }
  }
  const cells = new Map<string, Set<WorldMapBiome>>();
  const reservedMeadow = new Set<string>(WORLD_MAP_RESERVED_MEADOW_COORDINATES);
  const reservedLand = new Set<string>(WORLD_MAP_LAND_COORDINATES);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const key = cellKey(x, y);
      const edge = x === bounds.minX || x === bounds.maxX || y === bounds.minY || y === bounds.maxY;
      const climate = climates.get(key)!;
      let initialOptions: WorldMapBiome[];
      if (reservedMeadow.has(key)) initialOptions = ['meadow'];
      else if (reservedLand.has(key)) initialOptions = LAND_BIOMES;
      else if (edge) initialOptions = ['ocean'];
      else if (climate.elevation < SEA_LEVEL - 0.07) initialOptions = ['ocean'];
      else if (climate.elevation < SEA_LEVEL + 0.03) initialOptions = ['ocean', 'shore'];
      else initialOptions = INLAND_BIOMES;
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
    cells.set(key, new Set([chooseWeighted([...options], weights.get(key)!, cells, x, y, bounds, rng)]));
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
  // Collapse to a plain biome grid, then run cellular-automata smoothing:
  // isolated singletons adopt the surrounding region so the map reads as a
  // world (tundra band, desert expanse, forest, highland ridges) instead of
  // confetti. Protected cells (spawn meadow, ocean ring, deep water,
  // coastline) never change.
  const smoothed = new Map<string, WorldMapBiome>();
  for (const [key, options] of cells) smoothed.set(key, [...options][0]);
  const protectedMeadow = new Set<string>(WORLD_MAP_RESERVED_MEADOW_COORDINATES);
  for (let pass = 0; pass < 3; pass++) {
    const flips: Array<[string, WorldMapBiome]> = [];
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const key = cellKey(x, y);
        if (protectedMeadow.has(key)) continue;
        if (x === bounds.minX || x === bounds.maxX || y === bounds.minY || y === bounds.maxY) continue;
        if (climates.get(key)!.elevation < SEA_LEVEL - 0.07) continue;
        const current = smoothed.get(key)!;
        if (current === 'ocean' || current === 'shore') continue;
        const adjacent = neighbors(x, y, bounds).map((point) => smoothed.get(cellKey(point.x, point.y))!);
        if (adjacent.filter((biome) => biome === current).length > 1) continue;
        const counts = new Map<WorldMapBiome, number>();
        for (const biome of adjacent) {
          if (biome === 'ocean' || biome === 'shore') continue;
          counts.set(biome, (counts.get(biome) ?? 0) + 1);
        }
        let best: WorldMapBiome | null = null;
        let bestCount = 0;
        for (const [biome, count] of counts) {
          if (count > bestCount) { best = biome; bestCount = count; }
        }
        if (!best || best === current) continue;
        if (!adjacent.every((biome) => canTouch(biome, best!))) continue;
        const tileWeights = weights.get(key)!;
        if (tileWeights[best] < tileWeights[current] * 0.3) continue;
        flips.push([key, best]);
      }
    }
    if (!flips.length) break;
    for (const [key, biome] of flips) smoothed.set(key, biome);
  }
  const tiles: GeneratedWorldTile[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const biome = smoothed.get(cellKey(x, y))!;
      const adjacentBiomes = neighbors(x, y, bounds).map((point) => smoothed.get(cellKey(point.x, point.y))!);
      const nearBiomeBorder = adjacentBiomes.some((neighbor) => neighbor !== biome);
      const nearWater = biome === 'ocean' || biome === 'shore' || adjacentBiomes.some((neighbor) => neighbor === 'ocean' || neighbor === 'shore');
      const tileClimate = climates.get(cellKey(x, y))!;
      tiles.push({ x, y, row: y - bounds.minY, column: x - bounds.minX, biome, nearBiomeBorder, detail: detailFor(biome, nearWater, nearBiomeBorder, seed, x, y), climate: tileClimate, elevationLevel: elevationLevelFor(tileClimate, biome) });
    }
  }
  return tiles;
}

// Elevation layer (0-5) derived from the climate elevation field:
// 0 = water, 1 = lowland, 2 = rolling, 3 = hills, 4 = highlands, 5 = peaks.
// This is the data foundation for terrain depth; visuals and traversal
// rules build on top of it without changing the coordinate system.
export function elevationLevelFor(climate: WorldMapClimate, biome: WorldMapBiome): number {
  if (biome === 'ocean') return 0;
  const e = climate.elevation;
  if (e < 0.45) return 1;
  if (e < 0.55) return 2;
  if (e < 0.65) return 3;
  if (e < 0.75) return 4;
  return 5;
}

// Deterministic outer-ring generation. The core region is frozen (generated
// by generateCoreWorldMap); tiles outside it are derived from the climate
// fields (pure functions of x/y/seed) blended with already-generated
// neighbors, so the boundary stays continuous and the result is fully
// deterministic regardless of generation order within the ring.
//
// tileBounds: which tiles to generate. climateBounds: bounds used for the
// climate normalization (the falloff centers on this region). skipBounds:
// region to skip (the frozen core); null generates every tile in tileBounds.
// This powers both the original world's outer ring and the second continent.
function generateOuterTiles(
  seed: number,
  tileBounds: WorldMapBounds,
  climateBounds: WorldMapBounds,
  coreTiles: Map<string, GeneratedWorldTile>,
  skipBounds: WorldMapBounds | null,
): GeneratedWorldTile[] {
  const elevationNoise = makeSeededNoise((seed ^ 0x9e3779b9) >>> 0);
  const temperatureNoise = makeSeededNoise((seed ^ 0x85ebca6b) >>> 0);
  const moistureNoise = makeSeededNoise((seed ^ 0xc2b2ae35) >>> 0);
  const isSkipped = (x: number, y: number) =>
    skipBounds !== null &&
    x >= skipBounds.minX && x <= skipBounds.maxX &&
    y >= skipBounds.minY && y <= skipBounds.maxY;
  const tiles: GeneratedWorldTile[] = [];
  const generated = new Map<string, WorldMapBiome>();
  // Seed the map with core biomes so the ring blends with the frozen edge.
  for (const [key, tile] of coreTiles) generated.set(key, tile.biome);
  // Process outward from the core in row-major order for determinism.
  const outerCoords: Array<{ x: number; y: number }> = [];
  for (let y = tileBounds.minY; y <= tileBounds.maxY; y += 1) {
    for (let x = tileBounds.minX; x <= tileBounds.maxX; x += 1) {
      if (!isSkipped(x, y)) outerCoords.push({ x, y });
    }
  }
  for (const { x, y } of outerCoords) {
    const edge = x === tileBounds.minX || x === tileBounds.maxX || y === tileBounds.minY || y === tileBounds.maxY;
    const climate = climateFor(x, y, climateBounds, elevationNoise, temperatureNoise, moistureNoise);
    let biome: WorldMapBiome;
    if (edge) {
      biome = 'ocean';
    } else if (climate.elevation < SEA_LEVEL - 0.07) {
      biome = 'ocean';
    } else if (climate.elevation < SEA_LEVEL + 0.03) {
      biome = 'ocean';
    } else {
      // Weighted pick from climate, boosted toward already-generated neighbors
      // (which include the frozen core edge) for continuous regions.
      const weights = climateBiomeWeights(climate);
      const neighborBiomes: WorldMapBiome[] = [];
      for (const [dx, dy] of GRID_DIRECTIONS) {
        const nb = generated.get(cellKey(x + dx, y + dy));
        if (nb && nb !== 'ocean' && nb !== 'shore') neighborBiomes.push(nb);
      }
      const scored = INLAND_BIOMES.map((candidate) => {
        let score = weights[candidate];
        for (const nb of neighborBiomes) if (nb === candidate) score += 2.0;
        return { candidate, score };
      });
      // Position-hash rng: deterministic per tile, independent of order.
      const rng = new MapRng((seed ^ Math.imul(x + 101, 2654435761) ^ Math.imul(y + 37, 40503)) >>> 0);
      const total = scored.reduce((sum, entry) => sum + entry.score, 0);
      let roll = rng.next() * total;
      biome = scored[scored.length - 1].candidate;
      for (const entry of scored) {
        if ((roll -= entry.score) <= 0) { biome = entry.candidate; break; }
      }
      // Respect adjacency rules with the frozen core edge.
      const coreNeighbor = GRID_DIRECTIONS
        .map(([dx, dy]) => coreTiles.get(cellKey(x + dx, y + dy))?.biome)
        .find((b): b is WorldMapBiome => Boolean(b));
      if (coreNeighbor && !canTouch(coreNeighbor, biome)) biome = 'meadow';
    }
    // Shore band: land tiles touching ocean become shore.
    if (biome !== 'ocean') {
      const touchesOcean = GRID_DIRECTIONS.some(([dx, dy]) => {
        const nb = generated.get(cellKey(x + dx, y + dy));
        return nb === 'ocean';
      });
      if (touchesOcean) biome = 'shore';
    }
    generated.set(cellKey(x, y), biome);
    const adjacentBiomes = GRID_DIRECTIONS.map(([dx, dy]) => generated.get(cellKey(x + dx, y + dy))).filter((b): b is WorldMapBiome => Boolean(b));
    const nearBiomeBorder = adjacentBiomes.some((neighbor) => neighbor !== biome);
    const nearWater = biome === 'ocean' || biome === 'shore' || adjacentBiomes.some((neighbor) => neighbor === 'ocean' || neighbor === 'shore');
    tiles.push({
      x, y, row: y - tileBounds.minY, column: x - tileBounds.minX, biome, nearBiomeBorder,
      detail: detailFor(biome, nearWater, nearBiomeBorder, seed, x, y),
      climate, elevationLevel: elevationLevelFor(climate, biome),
    });
  }
  return tiles;
}

// Second continent: a huge standalone landmass in SECOND_CONTINENT_BOUNDS.
// Reuses the outer-ring machinery with its own seed and climate centering,
// and no frozen core to preserve. The edge tiles become ocean, giving the
// new continent its own coastline.
function generateSecondContinent(seed: number): GeneratedWorldTile[] {
  const continentSeed = (seed ^ 0x5bd1e995) >>> 0;
  return generateOuterTiles(
    continentSeed,
    SECOND_CONTINENT_BOUNDS,
    SECOND_CONTINENT_BOUNDS,
    new Map(),
    null,
  );
}

// Ocean gap tiles between the original world and the second continent.
// Pure open water with a simple climate; the atlas shades ocean uniformly.
function generateOceanGap(seed: number, bounds: WorldMapBounds): GeneratedWorldTile[] {
  const tiles: GeneratedWorldTile[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = SECOND_CONTINENT_GAP_MIN_X; x <= SECOND_CONTINENT_GAP_MAX_X; x += 1) {
      if (x < bounds.minX || x > bounds.maxX) continue;
      const climate: WorldMapClimate = { elevation: 0.1, temperature: 0.5, moisture: 0.5 };
      tiles.push({
        x, y,
        row: y - bounds.minY,
        column: x - bounds.minX,
        biome: 'ocean',
        nearBiomeBorder: false,
        detail: detailFor('ocean', true, false, seed, x, y),
        climate,
        elevationLevel: 0,
      });
    }
  }
  return tiles;
}

export function generateWorldMap(seed: number, bounds: WorldMapBounds = WORLD_MAP_BOUNDS): GeneratedWorldTile[] {
  // Original world: always generated against WORLD_MAP_BOUNDS so it stays
  // bit-identical no matter how far the requested bounds expand.
  const coreTiles = generateCoreWorldMap(seed);
  const coreByKey = new Map(coreTiles.map((tile) => [cellKey(tile.x, tile.y), tile]));
  const outerTiles = generateOuterTiles(seed, WORLD_MAP_BOUNDS, WORLD_MAP_BOUNDS, coreByKey, CORE_WORLD_BOUNDS);
  // Row/column are relative to the requested bounds for the atlas grid.
  const originalTiles = [...coreTiles, ...outerTiles].map((tile) => ({
    ...tile,
    row: tile.y - bounds.minY,
    column: tile.x - bounds.minX,
  }));
  // Second continent: purely additive, only when the requested bounds reach it.
  let extraTiles: GeneratedWorldTile[] = [];
  if (bounds.maxX >= SECOND_CONTINENT_BOUNDS.maxX && bounds.minX <= SECOND_CONTINENT_GAP_MIN_X) {
    extraTiles = [...generateOceanGap(seed, bounds), ...generateSecondContinent(seed).map((tile) => ({
      ...tile,
      row: tile.y - bounds.minY,
      column: tile.x - bounds.minX,
    }))];
  }
  // Fill every remaining cell in the requested bounds with open ocean so the
  // atlas grid has no holes (e.g. the stretches above and below the home region
  // once the bounds grow taller than it).
  const covered = new Set([...originalTiles, ...extraTiles].map((tile) => cellKey(tile.x, tile.y)));
  const fillTiles: GeneratedWorldTile[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (covered.has(cellKey(x, y))) continue;
      fillTiles.push({
        x, y,
        row: y - bounds.minY,
        column: x - bounds.minX,
        biome: 'ocean',
        nearBiomeBorder: false,
        detail: detailFor('ocean', false, false, seed, x, y),
        climate: { elevation: 0.1, temperature: 0.5, moisture: 0.5 },
        elevationLevel: 0,
      });
    }
  }
  const all = [...originalTiles, ...extraTiles, ...fillTiles];
  all.sort((a, b) => a.y - b.y || a.x - b.x);
  return all;
}

export function worldMapBiomeLabel(biome: WorldMapBiome) {
  return { ocean: 'Open Water', shore: 'Coastal Shore', meadow: 'Meadowlands', forest: 'Deep Forest', desert: 'Sunwash Desert', tundra: 'Frost Tundra', rock: 'Highland Ridges' }[biome];
}
