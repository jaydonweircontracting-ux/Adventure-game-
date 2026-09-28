// Minecraft-style Perlin noise for terrain and decoration placement.
// Deterministic, seeded, with fractal octaves like Minecraft's terrain gen.

export class PerlinNoise {
  private p: number[] = [];

  constructor(seed: number) {
    // Initialize permutation table from seed (deterministic)
    const perm: number[] = [];
    for (let i = 0; i < 256; i++) perm[i] = i;
    
    let s = seed >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    
    // Duplicate for overflow
    this.p = [...perm, ...perm];
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // 2D Perlin noise, returns [-1, 1]
  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const p = this.p;
    const A = p[X] + Y, B = p[X + 1] + Y;
    return this.lerp(
      this.lerp(this.grad(p[A], x, y), this.grad(p[B], x - 1, y), u),
      this.lerp(this.grad(p[A + 1], x, y - 1), this.grad(p[B + 1], x - 1, y - 1), u),
      v
    );
  }

  // Fractal Brownian Motion: multiple octaves like Minecraft
  // octaves = detail levels, persistence = amplitude falloff, lacunarity = frequency growth
  fbm(x: number, y: number, octaves: number = 4, persistence: number = 0.5, lacunarity: number = 2.0): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      value += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    return value / maxValue; // Normalized to [-1, 1]
  }
}

// World-gen noise instances (seeded from world seed)
let worldNoise: PerlinNoise | null = null;
let detailNoise: PerlinNoise | null = null;

export function initWorldNoise(seed: number): void {
  worldNoise = new PerlinNoise(seed);
  detailNoise = new PerlinNoise(seed ^ 0x9E3779B9);
}

// Vegetation density at world position (chunk coords + local offset)
// Returns 0-1, higher = denser vegetation
export function vegetationDensity(worldX: number, worldY: number): number {
  if (!worldNoise) initWorldNoise(1337);
  // Large-scale biome variation + fine detail
  const biome = worldNoise!.fbm(worldX * 0.05, worldY * 0.05, 3);
  const detail = detailNoise!.fbm(worldX * 0.3, worldY * 0.3, 2);
  // Combine: 0-1 range, threshold for placement
  return Math.max(0, Math.min(1, (biome * 0.7 + detail * 0.3 + 1) / 2));
}

// Terrain height variation for visual richness (0-1)
export function terrainHeight(worldX: number, worldY: number): number {
  if (!worldNoise) initWorldNoise(1337);
  return (worldNoise!.fbm(worldX * 0.08, worldY * 0.08, 4) + 1) / 2;
}

// Should a tree/plant spawn here? Uses noise threshold for natural clustering
// (Minecraft-style: vegetation grows in patches, not uniform random)
export function shouldPlaceVegetation(worldX: number, worldY: number, threshold: number = 0.45): boolean {
  return vegetationDensity(worldX, worldY) > threshold;
}
