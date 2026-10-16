/**
 * Lightweight HTML5-canvas world dressing.
 *
 * These accents are procedural vector/pixel shapes rather than additional
 * image files. They are painted into the existing static ground cache, so
 * they do not add per-frame work and never affect collision or world logic.
 */
export type ProceduralGroundBiome = 'meadow' | 'forest' | 'rock' | 'shore' | 'desert' | 'tundra' | 'ocean';

function tileHash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(y | 0, 0x119de1f3) ^ Math.imul(salt | 0, 0x3449)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Draw one deterministic, small storybook ground accent. Called only while
 * building a cached chunk, never from a per-frame dynamic-entity pass.
 */
export function drawProceduralGroundAccent(
  ctx: CanvasRenderingContext2D,
  biome: ProceduralGroundBiome | string,
  worldX: number,
  worldY: number,
  x: number,
  y: number,
): boolean {
  if (biome !== 'meadow' && biome !== 'forest' && biome !== 'tundra' && biome !== 'shore') return false;

  const h = tileHash(worldX, worldY, 0xCA2A);
  // About one accent in seven otherwise-empty tiles: readable, not noisy.
  if (h % 100 >= 14) return false;

  const px = x + 4 + ((h >>> 8) % 5) * 2;
  const py = y - 3 - ((h >>> 13) % 4) * 2;
  ctx.save();
  ctx.globalAlpha = 0.9;

  if (biome === 'tundra') {
    ctx.fillStyle = (h & 1) ? '#e7f2f2' : '#b8d5d8';
    ctx.fillRect(Math.round(px), Math.round(py), 3, 2);
    ctx.fillRect(Math.round(px + 3), Math.round(py - 2), 2, 2);
  } else if (biome === 'shore') {
    ctx.fillStyle = (h & 1) ? '#d8c59b' : '#f0dfb6';
    ctx.fillRect(Math.round(px), Math.round(py), 3, 2);
    ctx.fillStyle = '#b8a47d';
    ctx.fillRect(Math.round(px + 2), Math.round(py + 2), 2, 1);
  } else if ((h >>> 4) % 3 === 0) {
    // Tiny clover/flower: warm cream petals, golden pixel center.
    ctx.fillStyle = '#fff0c5';
    ctx.fillRect(Math.round(px), Math.round(py - 2), 2, 2);
    ctx.fillRect(Math.round(px - 2), Math.round(py), 2, 2);
    ctx.fillRect(Math.round(px + 2), Math.round(py), 2, 2);
    ctx.fillRect(Math.round(px), Math.round(py + 2), 2, 2);
    ctx.fillStyle = '#e9b957';
    ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    ctx.fillStyle = '#5b8c4e';
    ctx.fillRect(Math.round(px), Math.round(py + 4), 2, 3);
  } else {
    // Small tuft with a shaded base gives the ground more depth at low zoom.
    ctx.fillStyle = biome === 'forest' ? '#46734a' : '#558b4a';
    ctx.fillRect(Math.round(px), Math.round(py), 2, 4);
    ctx.fillRect(Math.round(px + 2), Math.round(py - 2), 2, 5);
    ctx.fillStyle = biome === 'forest' ? '#78a45b' : '#9bc56b';
    ctx.fillRect(Math.round(px + 2), Math.round(py - 2), 2, 2);
  }
  ctx.restore();
  return true;
}
