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


/** Paint a lush, hand-layered tree at its ground anchor. Deterministic variants
 * make forests feel varied without introducing sprite dependencies or flicker. */
export function drawProceduralTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  worldX: number,
  worldY: number,
): void {
  const h = tileHash(worldX, worldY, 0x7AEE);
  const variant = h % 4;
  const s = Math.max(0.45, Math.min(2, scale));
  const canopy = variant === 0 ? '#397543' : variant === 1 ? '#477e3d' : variant === 2 ? '#326b42' : '#557f3b';
  const shadow = variant === 2 ? '#234e35' : '#2c6038';
  const light = variant === 1 ? '#a0bd61' : '#8dbb59';
  const warm = variant === 3 ? '#d3b15e' : '#e8d18a';

  ctx.save();
  // Soft contact shadow grounds the tree on the diamond rather than floating.
  ctx.fillStyle = 'rgba(29, 43, 25, 0.24)';
  ctx.beginPath();
  ctx.ellipse(x + 2 * s, y + 2 * s, 13 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Trunk and visible roots.
  ctx.fillStyle = '#67472b';
  ctx.fillRect(Math.round(x - 3 * s), Math.round(y - 21 * s), 6 * s, 21 * s);
  ctx.fillStyle = '#8b6339';
  ctx.fillRect(Math.round(x - 1 * s), Math.round(y - 19 * s), 2 * s, 15 * s);
  ctx.fillStyle = '#5b4129';
  ctx.fillRect(Math.round(x - 6 * s), Math.round(y - 3 * s), 4 * s, 3 * s);
  ctx.fillRect(Math.round(x + 2 * s), Math.round(y - 3 * s), 4 * s, 3 * s);

  // Layered round lobes make the canopy read as a dense, storybook crown.
  const crownY = y - 37 * s;
  ctx.fillStyle = shadow;
  for (const [dx, dy, rx, ry] of [
    [-8, -7, 11, 12], [7, -8, 12, 13], [0, -17, 12, 13],
    [-1, 1, 12, 10], [12, 1, 8, 9],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * s, crownY + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = canopy;
  for (const [dx, dy, rx, ry] of [
    [-8, -9, 10, 11], [6, -10, 11, 12], [-1, -19, 10, 11],
    [-1, 0, 10, 9], [11, 0, 7, 8],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * s, crownY + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pixel clusters add readable highlights and shadow pockets at game zoom.
  ctx.fillStyle = light;
  ctx.fillRect(Math.round(x - 8 * s), Math.round(crownY - 19 * s), 4 * s, 4 * s);
  ctx.fillRect(Math.round(x - 12 * s), Math.round(crownY - 9 * s), 3 * s, 4 * s);
  ctx.fillRect(Math.round(x + 1 * s), Math.round(crownY - 25 * s), 4 * s, 3 * s);
  ctx.fillRect(Math.round(x + 7 * s), Math.round(crownY - 14 * s), 3 * s, 4 * s);
  ctx.fillStyle = shadow;
  ctx.fillRect(Math.round(x - 2 * s), Math.round(crownY - 6 * s), 4 * s, 5 * s);
  ctx.fillRect(Math.round(x + 8 * s), Math.round(crownY - 1 * s), 4 * s, 3 * s);

  // Occasional berries/blossoms: seeded, sparse, and stable per tree.
  if (variant === 3 || h % 5 === 0) {
    ctx.fillStyle = warm;
    ctx.fillRect(Math.round(x - 5 * s), Math.round(crownY - 12 * s), 3 * s, 3 * s);
    ctx.fillRect(Math.round(x + 5 * s), Math.round(crownY - 3 * s), 3 * s, 3 * s);
  }
  ctx.restore();
}

/** Add tiny, stable gravel and verge pixels to road tiles while they are cached. */
export function drawProceduralPathDetail(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  x: number,
  y: number,
  sandyStreet = false,
): void {
  const h = tileHash(worldX, worldY, 0xDA7A);
  // Keep the marks sparse so they read as worn material, not a grid pattern.
  ctx.save();
  if (h % 3 === 0) {
    ctx.fillStyle = sandyStreet ? 'rgba(247, 222, 171, 0.72)' : 'rgba(205, 174, 119, 0.78)';
    ctx.fillRect(Math.round(x - 12 + (h % 7) * 2), Math.round(y - 2 - ((h >>> 7) % 5)), 3, 2);
  }
  if ((h >>> 5) % 4 === 0) {
    ctx.fillStyle = sandyStreet ? 'rgba(151, 119, 72, 0.40)' : 'rgba(102, 76, 49, 0.38)';
    ctx.fillRect(Math.round(x + ((h >>> 11) % 15) - 7), Math.round(y + ((h >>> 16) % 7) - 3), 2, 2);
  }
  if ((h >>> 9) % 9 === 0) {
    // One or two tiny grass pixels soften path edges without changing its shape.
    ctx.fillStyle = '#64864a';
    ctx.fillRect(Math.round(x - 19 + ((h >>> 13) % 7)), Math.round(y - 2 + ((h >>> 18) % 4)), 2, 3);
  }
  ctx.restore();
}

/** Small doorstep, flower boxes and warm window accents around a building sprite. */
export function drawBuildingGroundDress(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number,
  width: number,
  worldX: number,
  worldY: number,
): void {
  const h = tileHash(worldX, worldY, 0xB01D);
  const w = Math.max(12, Math.min(30, width * 0.18));
  ctx.save();

  // A low timber doorstep gives the front of the sprite a visible ground contact.
  ctx.fillStyle = 'rgba(76, 55, 34, 0.72)';
  ctx.beginPath();
  ctx.moveTo(centerX - w * 0.55, baseY - 1);
  ctx.lineTo(centerX, baseY + 5);
  ctx.lineTo(centerX + w * 0.55, baseY - 1);
  ctx.lineTo(centerX, baseY - 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(211, 178, 119, 0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Small planters on either side of the entry, with a restrained flower color.
  for (const side of [-1, 1]) {
    const px = centerX + side * w * 0.72;
    ctx.fillStyle = '#775238';
    ctx.fillRect(Math.round(px - 3), Math.round(baseY - 7), 6, 4);
    ctx.fillStyle = (h + side) % 2 === 0 ? '#6c9a4f' : '#568447';
    ctx.fillRect(Math.round(px - 2), Math.round(baseY - 10), 2, 4);
    ctx.fillRect(Math.round(px + 1), Math.round(baseY - 11), 2, 5);
    ctx.fillStyle = h % 3 === 0 ? '#f0cf83' : '#f0e1b9';
    if ((h + side) % 3 !== 0) ctx.fillRect(Math.round(px + side), Math.round(baseY - 12), 2, 2);
  }
  ctx.restore();
}
