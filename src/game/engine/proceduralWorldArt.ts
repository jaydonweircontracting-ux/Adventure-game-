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


/**
 * BUILD 730: complete storybook building finish pass. The source sprites remain
 * the canonical building art, but receive a consistent architectural treatment:
 * warm roof ridge, small shingle seams, glowing framed windows, timber trim,
 * chimney and a planted frontage. Every mark is pinned to the building's
 * world coordinates so it cannot shimmer while the camera moves.
 */
export function drawBuildingRenovation(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number,
  width: number,
  height: number,
  worldX: number,
  worldY: number,
): void {
  if (!(width > 12 && height > 12)) return;
  const h = tileHash(worldX, worldY, 0x730);
  const left = centerX - width * 0.5;
  const top = baseY - height;
  const scale = Math.max(0.45, Math.min(2.2, width / 180));
  const warmRoof = ['#a85e3d', '#5b7180', '#7d6648', '#a47a43'][h % 4];
  const roofLight = ['#d38a58', '#9eb1b1', '#c5a16b', '#e0bb72'][h % 4];

  ctx.save();
  // Fine, warm pixel-art outline gives every roof a coherent silhouette.
  ctx.strokeStyle = 'rgba(48, 39, 30, 0.72)';
  ctx.lineWidth = Math.max(1, 1.25 * scale);
  ctx.beginPath();
  ctx.moveTo(left + width * 0.08, top + height * 0.42);
  ctx.lineTo(left + width * 0.50, top + height * 0.06);
  ctx.lineTo(left + width * 0.92, top + height * 0.42);
  ctx.stroke();

  // Roof ridge and sparse tile seams. The light side is subtly sunlit.
  ctx.strokeStyle = roofLight;
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.beginPath();
  ctx.moveTo(left + width * 0.18, top + height * 0.35);
  ctx.lineTo(left + width * 0.50, top + height * 0.11);
  ctx.lineTo(left + width * 0.82, top + height * 0.35);
  ctx.stroke();
  ctx.strokeStyle = warmRoof;
  ctx.lineWidth = Math.max(1, scale);
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const y = top + height * (0.17 + t * 0.21);
    ctx.beginPath();
    ctx.moveTo(left + width * (0.20 + t * 0.25), y);
    ctx.lineTo(left + width * (0.47 + t * 0.04), y + height * 0.025);
    ctx.stroke();
  }

  // A pair of warm, framed windows placed on the upper front facade.
  const windowY = top + height * 0.57;
  for (const wx of [left + width * 0.27, left + width * 0.72]) {
    const ww = Math.max(4, width * 0.045);
    const wh = Math.max(5, height * 0.105);
    ctx.fillStyle = '#4b3528';
    ctx.fillRect(Math.round(wx - ww / 2 - scale), Math.round(windowY - scale), ww + 2 * scale, wh + 2 * scale);
    ctx.fillStyle = (h & 1) ? '#f4d68a' : '#ffe5a6';
    ctx.fillRect(Math.round(wx - ww / 2), Math.round(windowY), ww, wh);
    ctx.fillStyle = '#8b5738';
    ctx.fillRect(Math.round(wx - scale / 2), Math.round(windowY), Math.max(1, scale), wh);
    ctx.fillRect(Math.round(wx - ww / 2), Math.round(windowY + wh / 2), ww, Math.max(1, scale));
    ctx.fillStyle = '#8a6545';
    ctx.fillRect(Math.round(wx - ww / 2 - scale), Math.round(windowY + wh + scale), ww + 2 * scale, Math.max(1, scale));
  }

  // A small chimney with a highlight and a single drifting wisp, all static.
  const chimneyX = left + width * (0.67 + ((h >>> 6) % 8) / 100);
  const chimneyY = top + height * 0.18;
  const cw = Math.max(4, width * 0.035);
  const ch = Math.max(8, height * 0.15);
  ctx.fillStyle = '#704a38';
  ctx.fillRect(Math.round(chimneyX), Math.round(chimneyY), cw, ch);
  ctx.fillStyle = '#bd7651';
  ctx.fillRect(Math.round(chimneyX - scale), Math.round(chimneyY), Math.max(2, cw * 0.32), ch);
  ctx.fillStyle = '#4e3a30';
  ctx.fillRect(Math.round(chimneyX - scale), Math.round(chimneyY - scale), cw + 2 * scale, Math.max(2, scale * 2));

  // Extra timber corner accents unify the facade without hiding the entrance.
  ctx.fillStyle = 'rgba(84, 54, 34, 0.76)';
  ctx.fillRect(Math.round(left + width * 0.19), Math.round(top + height * 0.52), Math.max(1, scale * 1.5), height * 0.20);
  ctx.fillRect(Math.round(left + width * 0.81), Math.round(top + height * 0.52), Math.max(1, scale * 1.5), height * 0.20);

  // Low garden edging and seeded flowers soften the building footprint.
  const gardenY = baseY - Math.max(3, height * 0.025);
  ctx.fillStyle = '#6b4a31';
  ctx.fillRect(Math.round(left + width * 0.12), Math.round(gardenY), Math.max(3, width * 0.17), Math.max(2, scale * 2));
  ctx.fillRect(Math.round(left + width * 0.71), Math.round(gardenY), Math.max(3, width * 0.17), Math.max(2, scale * 2));
  const flowerColors = ['#f1d58b', '#e9a6a0', '#f6e8c2'];
  for (let i = 0; i < 6; i++) {
    const fx = left + width * 0.14 + ((h >>> (i % 16)) % 13) / 100 * width + i * width * 0.022;
    const fy = gardenY - (i % 2 ? 2 : 4) * scale;
    ctx.fillStyle = '#527e45';
    ctx.fillRect(Math.round(fx), Math.round(fy), Math.max(1, scale), Math.max(2, scale * 2));
    ctx.fillStyle = flowerColors[(h + i) % flowerColors.length];
    ctx.fillRect(Math.round(fx - scale), Math.round(fy - scale), Math.max(2, scale * 2), Math.max(2, scale * 2));
  }
  ctx.restore();
}
