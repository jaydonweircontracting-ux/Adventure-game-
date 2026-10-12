// Coherent terrain noise (BUILD 672).
// Deterministic seeded gradient noise for natural terrain generation.
// Uses multiple octaves for large/medium/small scale variation.
//
// Pure — no React, no App dependency.

/**
 * Simple deterministic PRNG (mulberry32).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gradient noise (value noise with smooth interpolation).
 * Deterministic for given x, y, seed.
 */
export function gradientNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  // Smoothstep interpolation.
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  // Hash corners to pseudo-random values.
  const hash = (cx: number, cy: number): number => {
    const h = Math.imul(cx, 374761393) + Math.imul(cy, 668265263) + Math.imul(seed, 1440662683);
    const n = (h ^ (h >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
  };

  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);

  // Bilinear interpolation.
  const x1 = a + u * (b - a);
  const x2 = c + u * (d - c);
  return x1 + v * (x2 - x1); // 0 to 1
}

/**
 * Fractal Brownian Motion: multiple octaves of noise.
 * @param x, y Coordinates (in chunk-local or world units)
 * @param seed Random seed
 * @param octaves Number of noise layers (default 4)
 * @param lacunarity Frequency multiplier per octave (default 2.0)
 * @param gain Amplitude multiplier per octave (default 0.5)
 */
export function fbm(
  x: number,
  y: number,
  seed: number,
  octaves: number = 4,
  lacunarity: number = 2.0,
  gain: number = 0.5,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += gradientNoise(x * frequency, y * frequency, seed + i * 1000) * amplitude;
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue; // Normalized 0 to 1
}

/**
 * Terrain type from noise values.
 * Uses two noise fields: elevation and moisture.
 */
export type TerrainKind = 'water' | 'grass' | 'forest' | 'rocky' | 'dirt';

export function terrainFromNoise(
  elevation: number, // 0-1, from fbm
  moisture: number,  // 0-1, from fbm with different seed
): TerrainKind {
  // Water: low elevation.
  if (elevation < 0.3) return 'water';
  // Rocky: high elevation.
  if (elevation > 0.75) return 'rocky';
  // Forest: mid elevation + high moisture.
  if (moisture > 0.6 && elevation > 0.35 && elevation < 0.7) return 'forest';
  // Dirt: low moisture.
  if (moisture < 0.35) return 'dirt';
  // Default: grass.
  return 'grass';
}

/**
 * Generate terrain for a chunk using coherent noise.
 * Returns a 2D array of terrain kinds (28x28 cells, 10 units each).
 */
export function generateChunkTerrain(
  chunkX: number,
  chunkY: number,
  seed: number,
): TerrainKind[][] {
  const CELLS = 28; // 280 / 10
  const terrain: TerrainKind[][] = [];

  for (let cy = 0; cy < CELLS; cy++) {
    const row: TerrainKind[] = [];
    for (let cx = 0; cx < CELLS; cx++) {
      // World coordinates for noise sampling (ensures continuity across chunks).
      const wx = (chunkX * 280 + cx * 10) / 100; // Scale for noise frequency
      const wy = (chunkY * 280 + cy * 10) / 100;

      const elevation = fbm(wx, wy, seed, 4);
      const moisture = fbm(wx + 1000, wy + 1000, seed + 5000, 3);

      row.push(terrainFromNoise(elevation, moisture));
    }
    terrain.push(row);
  }

  return terrain;
}
