/**
 * Little World Generator-inspired native world simulation.
 *
 * This is a clean-room implementation based on the supplied app's documented
 * controls and the static resource names found in data.win. It is NOT recovered
 * original source code and does not claim algorithmic equivalence to the binary.
 *
 * Pure TypeScript; no DOM, React, browser storage, or external dependencies.
 */

export type WorldBiome =
  | 'ocean' | 'beach' | 'desert' | 'savanna' | 'grassland'
  | 'woodland' | 'forest' | 'rainforest' | 'tundra' | 'taiga'
  | 'alpine' | 'wetland';

export type WorldOverlay =
  | 'geographic' | 'water' | 'height' | 'temperature' | 'biome' | 'plates';

export interface WorldGenOptions {
  width: number;
  height: number;
  seed: number;
  plateCount?: number;
  seaLevel?: number;
  globalTemperature?: number;
  equatorLatitude?: number;
  equatorVariation?: number;
  erosionIterations?: number;
}

export interface WorldCell {
  height: number;
  plate: number;
  temperature: number;
  moisture: number;
  water: boolean;
  river: boolean;
  forest: boolean;
  biome: WorldBiome;
}

export interface GeneratedWorld {
  version: 1;
  width: number;
  height: number;
  seed: number;
  seaLevel: number;
  globalTemperature: number;
  equatorLatitude: number;
  equatorVariation: number;
  cells: WorldCell[];
}

const clamp = (n: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, n));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Stable integer hash: deterministic across browsers and machines. */
export function worldHash(seed: number, x: number, y: number, salt = 0): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (salt | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function valueNoise(seed: number, x: number, y: number, scale: number, salt: number): number {
  const gx = x / scale, gy = y / scale;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = smooth(gx - x0), fy = smooth(gy - y0);
  const a = lerp(worldHash(seed, x0, y0, salt), worldHash(seed, x0 + 1, y0, salt), fx);
  const b = lerp(worldHash(seed, x0, y0 + 1, salt), worldHash(seed, x0 + 1, y0 + 1, salt), fx);
  return lerp(a, b, fy);
}

function fbm(seed: number, x: number, y: number, salt: number, worldScale = 1): number {
  return (
    valueNoise(seed, x, y, 64 * worldScale, salt) * 0.52 +
    valueNoise(seed, x, y, 28 * worldScale, salt + 1) * 0.30 +
    valueNoise(seed, x, y, 11 * worldScale, salt + 2) * 0.18
  );
}

function idx(width: number, x: number, y: number): number { return y * width + x; }

function neighbors(width: number, height: number, x: number, y: number): number[] {
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < width && ny < height) out.push(idx(width, nx, ny));
  }
  return out;
}

function classifyBiome(height: number, sea: number, temp: number, moisture: number, river: boolean): WorldBiome {
  if (height < sea) return 'ocean';
  if (height < sea + 0.035) return 'beach';
  if (height > 0.84 || (height > 0.73 && temp < 0.27)) return 'alpine';
  if (temp < 0.12) return 'tundra';
  if (temp < 0.27) return moisture > 0.42 ? 'taiga' : 'tundra';
  if (river && moisture > 0.58 && height < sea + 0.22) return 'wetland';
  if (temp > 0.72 && moisture < 0.25) return 'desert';
  if (temp > 0.62 && moisture < 0.43) return 'savanna';
  if (moisture > 0.76 && temp > 0.48) return 'rainforest';
  if (moisture > 0.58) return 'forest';
  if (moisture > 0.43) return 'woodland';
  return 'grassland';
}

/**
 * Generate a seeded world. Plate boundaries uplift or depress terrain; layered
 * value noise shapes continents. Rivers follow downhill flow accumulation.
 */
export function generateWorld(options: WorldGenOptions): GeneratedWorld {
  const width = Math.max(8, Math.min(512, Math.floor(options.width)));
  const height = Math.max(8, Math.min(512, Math.floor(options.height)));
  const seed = options.seed >>> 0;
  const seaLevel = clamp(options.seaLevel ?? 0.43, 0.1, 0.8);
  const globalTemperature = clamp(options.globalTemperature ?? 0.5);
  const equatorLatitude = clamp(options.equatorLatitude ?? 0.5);
  const equatorVariation = clamp(options.equatorVariation ?? 0.7);
  const plateCount = Math.max(3, Math.min(32, Math.floor(options.plateCount ?? 10)));
  const count = width * height;
  // Keep continent and detail frequencies proportional as map dimensions change.
  // A 512x512 world should not become noisy just because it is larger than the default preview.
  const worldScale = Math.max(width, height) / 96;
  const plates: { x: number; y: number; uplift: number }[] = [];
  for (let p = 0; p < plateCount; p++) {
    plates.push({
      x: worldHash(seed, p, 0, 100) * width,
      y: worldHash(seed, p, 0, 101) * height,
      uplift: worldHash(seed, p, 0, 102) * 2 - 1,
    });
  }

  const heights = new Float32Array(count);
  const plateIds = new Int16Array(count);
  const temperatures = new Float32Array(count);
  const moisture = new Float32Array(count);
  const water = new Uint8Array(count);
  const rivers = new Uint8Array(count);
  const forests = new Uint8Array(count);

  // Assign nearest/second-nearest plates. Boundary uplift is a stylized
  // tectonic approximation, not a physically accurate plate solver.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let best = Infinity, second = Infinity, bestId = 0;
    for (let p = 0; p < plates.length; p++) {
      const dx = x - plates[p].x, dy = y - plates[p].y;
      const d = dx * dx + dy * dy;
      if (d < best) { second = best; best = d; bestId = p; }
      else if (d < second) second = d;
    }
    const boundary = clamp(1 - (Math.sqrt(second) - Math.sqrt(best)) / 4);
    const plate = plates[bestId];
    const continental = fbm(seed, x, y, 200, worldScale);
    const detail = fbm(seed, x, y, 210, worldScale);
    const boundaryEffect = boundary * (plate.uplift >= 0 ? 0.16 : -0.08);
    const continentalBias = (continental - 0.48) * 0.66;
    heights[idx(width, x, y)] = clamp(0.36 + continentalBias + (detail - 0.5) * 0.20 + boundaryEffect);
    plateIds[idx(width, x, y)] = bestId;
  }

  // Optional hydraulic-style erosion: move a small amount of material from
  // steep cells toward their lowest neighbor, using a snapshot per iteration.
  const iterations = Math.max(0, Math.min(12, Math.floor(options.erosionIterations ?? 2)));
  for (let iteration = 0; iteration < iterations; iteration++) {
    const delta = new Float32Array(count);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = idx(width, x, y);
      let lowest = i;
      for (const n of neighbors(width, height, x, y)) if (heights[n] < heights[lowest]) lowest = n;
      const drop = heights[i] - heights[lowest];
      if (drop > 0.035) {
        const amount = Math.min(0.008, drop * 0.08);
        delta[i] -= amount;
        delta[lowest] += amount * 0.55;
      }
    }
    for (let i = 0; i < count; i++) heights[i] = clamp(heights[i] + delta[i]);
  }

  // Priority-free steepest descent flow and accumulation. Processing cells
  // from high to low makes every source contribute to lower destinations.
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => heights[b] - heights[a]);
  const flow = new Float32Array(count);
  flow.fill(1);
  const downstream = new Int32Array(count);
  downstream.fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = idx(width, x, y);
    let low = heights[i];
    for (const n of neighbors(width, height, x, y)) if (heights[n] < low) {
      low = heights[n]; downstream[i] = n;
    }
  }
  for (const i of order) if (downstream[i] >= 0) flow[downstream[i]] += flow[i];
  const riverThreshold = Math.max(5, Math.floor(count * 0.0008));
  for (let i = 0; i < count; i++) if (heights[i] >= seaLevel && flow[i] >= riverThreshold) rivers[i] = 1;

  // Climate uses latitude, altitude, broad moisture fields and river proximity.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = idx(width, x, y);
    const lat = y / Math.max(1, height - 1);
    const equatorDistance = Math.abs(lat - equatorLatitude) * 2;
    const latitudeHeat = 1 - clamp(equatorDistance) * equatorVariation;
    temperatures[i] = clamp(globalTemperature * 0.55 + latitudeHeat * 0.45 - Math.max(0, heights[i] - 0.55) * 0.55);
    let wet = fbm(seed, x, y, 300, worldScale) * 0.68 + fbm(seed, x, y, 310, worldScale) * 0.32;
    if (rivers[i]) wet += 0.22;
    if (heights[i] < seaLevel) wet = Math.max(wet, 0.72);
    moisture[i] = clamp(wet);
    water[i] = heights[i] < seaLevel ? 1 : 0;
  }

  const cells: WorldCell[] = new Array(count);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = idx(width, x, y);
    const biome = classifyBiome(heights[i], seaLevel, temperatures[i], moisture[i], rivers[i] === 1);
    const forest = !water[i] && ['woodland', 'forest', 'rainforest', 'taiga'].includes(biome) &&
      worldHash(seed, x, y, 401) < moisture[i] * 0.65;
    forests[i] = forest ? 1 : 0;
    cells[i] = {
      height: heights[i], plate: plateIds[i], temperature: temperatures[i],
      moisture: moisture[i], water: water[i] === 1, river: rivers[i] === 1,
      forest: forests[i] === 1, biome,
    };
  }

  return { version: 1, width, height, seed, seaLevel, globalTemperature, equatorLatitude, equatorVariation, cells };
}

/** Smooth a terrain patch with a 3x3 average while preserving array bounds. */
function rebuildDerivedTerrain(world: GeneratedWorld, cells: WorldCell[]): GeneratedWorld {
  const { width, height, seaLevel } = world;
  const count = width * height;
  const heights = cells.map(cell => cell.height);
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => heights[b] - heights[a]);
  const flow = new Float32Array(count);
  flow.fill(1);
  const downstream = new Int32Array(count);
  downstream.fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = idx(width, x, y);
    let lowest = heights[i];
    for (const n of neighbors(width, height, x, y)) if (heights[n] < lowest) {
      lowest = heights[n];
      downstream[i] = n;
    }
  }
  for (const i of order) if (downstream[i] >= 0) flow[downstream[i]] += flow[i];
  const threshold = Math.max(5, Math.floor(count * 0.0008));
  for (let i = 0; i < count; i++) {
    const cell = cells[i];
    cell.water = heights[i] < seaLevel;
    cell.river = !cell.water && flow[i] >= threshold;
    cell.biome = classifyBiome(heights[i], seaLevel, cell.temperature, cell.moisture, cell.river);
    const x = i % width, y = Math.floor(i / width);
    cell.forest = !cell.water && ['woodland', 'forest', 'rainforest', 'taiga'].includes(cell.biome) &&
      worldHash(world.seed, x, y, 401) < cell.moisture * 0.65;
  }
  return { ...world, cells };
}

export function smoothTerrain(world: GeneratedWorld, iterations = 1): GeneratedWorld {
  const cells = world.cells.map(c => ({ ...c }));
  for (let pass = 0; pass < Math.max(1, Math.min(8, Math.floor(iterations))); pass++) {
    const heights = cells.map(c => c.height);
    for (let y = 1; y < world.height - 1; y++) for (let x = 1; x < world.width - 1; x++) {
      const i = idx(world.width, x, y);
      let total = heights[i], n = 1;
      for (const j of neighbors(world.width, world.height, x, y)) { total += heights[j]; n++; }
      cells[i].height = total / n;
    }
  }
  return rebuildDerivedTerrain(world, cells);
}

/** Increase local relief like a mountain-building brush. */
export function raiseMountains(world: GeneratedWorld, cx: number, cy: number, radius: number, strength = 0.2): GeneratedWorld {
  const cells = world.cells.map(c => ({ ...c }));
  const r = Math.max(1, radius);
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(world.height - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(world.width - 1, Math.ceil(cx + r)); x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d <= 1) cells[idx(world.width, x, y)].height = clamp(cells[idx(world.width, x, y)].height + strength * (1 - smooth(d)));
    }
  }
  return rebuildDerivedTerrain(world, cells);
}

/**
 * Adapter for the game's existing chunk/biome vocabulary. This export is a
 * non-destructive map template: it never overwrites the authored live world.
 */
export type AdventureMapBiome = 'ocean' | 'shore' | 'meadow' | 'forest' | 'desert' | 'tundra' | 'rock';

export interface AdventureWorldMapExport {
  format: 'adventure-world-map';
  version: 1;
  generator: 'adventure-native-worldgen';
  seed: number;
  width: number;
  height: number;
  seaLevel: number;
  tiles: Array<{
    x: number;
    y: number;
    biome: AdventureMapBiome;
    sourceBiome: WorldBiome;
    elevation: number;
    temperature: number;
    moisture: number;
    water: boolean;
    river: boolean;
    forest: boolean;
    plate: number;
  }>;
}

function toAdventureBiome(cell: WorldCell): AdventureMapBiome {
  switch (cell.biome) {
    case 'ocean': return 'ocean';
    case 'beach': return 'shore';
    case 'desert': return 'desert';
    case 'savanna': return 'meadow';
    case 'grassland': return 'meadow';
    case 'woodland':
    case 'forest':
    case 'rainforest':
    case 'taiga': return 'forest';
    case 'tundra': return 'tundra';
    case 'alpine': return 'rock';
    case 'wetland': return 'meadow';
  }
}

/** Convert the detailed climate grid to the game's existing biome vocabulary. */
export function exportAdventureWorldMap(world: GeneratedWorld): AdventureWorldMapExport {
  return {
    format: 'adventure-world-map',
    version: 1,
    generator: 'adventure-native-worldgen',
    seed: world.seed >>> 0,
    width: world.width,
    height: world.height,
    seaLevel: world.seaLevel,
    tiles: world.cells.map((cell, index) => ({
      x: index % world.width,
      y: Math.floor(index / world.width),
      biome: toAdventureBiome(cell),
      sourceBiome: cell.biome,
      elevation: cell.height,
      temperature: cell.temperature,
      moisture: cell.moisture,
      water: cell.water,
      river: cell.river,
      forest: cell.forest,
      plate: cell.plate,
    })),
  };
}

export function serializeAdventureWorldMap(world: GeneratedWorld): string {
  return JSON.stringify(exportAdventureWorldMap(world));
}

/** Save/load format is versioned JSON so future schemas can migrate safely. */
export function serializeWorld(world: GeneratedWorld): string {
  return JSON.stringify(world);
}

export function deserializeWorld(serialized: string): GeneratedWorld {
  const value = JSON.parse(serialized) as GeneratedWorld;
  if (value.version !== 1 || !Number.isInteger(value.width) || !Number.isInteger(value.height) ||
      value.width < 1 || value.height < 1 || !Array.isArray(value.cells) ||
      value.cells.length !== value.width * value.height) {
    throw new Error('Invalid or unsupported world save file');
  }
  for (const cell of value.cells) {
    if (!Number.isFinite(cell.height) || !Number.isFinite(cell.temperature) ||
        !Number.isFinite(cell.moisture) || !Number.isInteger(cell.plate)) {
      throw new Error('World save contains invalid cell data');
    }
  }
  return value;
}

const BIOME_COLORS: Record<WorldBiome, [number, number, number]> = {
  ocean: [38, 92, 155], beach: [220, 201, 136], desert: [218, 183, 100],
  savanna: [177, 181, 91], grassland: [123, 176, 91], woodland: [78, 143, 75],
  forest: [40, 111, 59], rainforest: [24, 91, 53], tundra: [190, 199, 190],
  taiga: [76, 119, 105], alpine: [135, 135, 135], wetland: [76, 133, 124],
};

/** Produce an RGBA pixel buffer for map overlays; canvas integration is caller-owned. */
export function renderWorldPixels(world: GeneratedWorld, overlay: WorldOverlay): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(world.cells.length * 4);
  for (let i = 0; i < world.cells.length; i++) {
    const c = world.cells[i];
    let rgb: [number, number, number];
    switch (overlay) {
      case 'water': rgb = c.water ? [39, 104, 178] : c.river ? [56, 139, 208] : [193, 180, 127]; break;
      case 'height': rgb = c.height < world.seaLevel ? [34, 83, 148] :
        [Math.round(lerp(45, 238, c.height)), Math.round(lerp(112, 232, c.height)), Math.round(lerp(46, 222, c.height))]; break;
      case 'temperature': rgb = [Math.round(255 * c.temperature), Math.round(180 * (1 - Math.abs(c.temperature - 0.5) * 2)), Math.round(255 * (1 - c.temperature))]; break;
      case 'plates': {
        const hue = worldHash(world.seed, c.plate, 0, 901);
        rgb = [Math.round(70 + hue * 150), Math.round(70 + worldHash(world.seed, c.plate, 0, 902) * 150), Math.round(70 + worldHash(world.seed, c.plate, 0, 903) * 150)];
        break;
      }
      case 'biome': rgb = BIOME_COLORS[c.biome]; break;
      default:
        rgb = c.water ? BIOME_COLORS.ocean : c.river ? [53, 132, 207] :
          c.forest ? [35, 105, 57] : BIOME_COLORS[c.biome];
        if (c.height > 0.82) rgb = [210, 210, 205];
    }
    const offset = i * 4;
    pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2]; pixels[offset + 3] = 255;
  }
  return pixels;
}
