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
  // Richer cozy ground: about one accent in four otherwise-empty tiles, still sparse enough to avoid a noisy grid.
  if (h % 100 >= 24) return false;

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
  } else if ((h >>> 4) % 5 === 0) {
    // Warm earth/stone flecks break up the flat tile fill without drawing a grid.
    ctx.fillStyle = (h & 1) ? 'rgba(104, 91, 61, 0.48)' : 'rgba(224, 203, 143, 0.65)';
    ctx.fillRect(Math.round(px - 2), Math.round(py), 4, 2);
    ctx.fillStyle = 'rgba(255, 244, 203, 0.48)';
    ctx.fillRect(Math.round(px + 2), Math.round(py - 1), 2, 1);
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

/**
 * Minimal, world-pinned doorstep dressing for authored building sprites.
 *
 * Keep all decoration BELOW the sprite silhouette. The asset artwork already
 * owns its roof, windows, chimney and facade; painting generic architecture
 * over it caused doubled roofs/windows and visibly mismatched perspective.
 * Doorways on the current building atlas sit left of center, so the porch is
 * aligned to that entry instead of the center of the whole house.
 */
export function drawBuildingGroundDress(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number,
  width: number,
  worldX: number,
  worldY: number,
): void {
  if (!(width > 28)) return;
  const h = tileHash(worldX, worldY, 0xB01D);
  const scale = Math.max(0.6, Math.min(1.4, width / 120));
  const doorX = centerX - width * 0.12; // ~38% of sprite width from the left
  const porchW = Math.max(10, Math.min(24, width * 0.15));

  ctx.save();
  // Soft contact shadow separates the building from the terrain without
  // drawing over the authored facade or adding expensive per-frame effects.
  ctx.fillStyle = 'rgba(35, 30, 24, 0.14)';
  ctx.beginPath();
  ctx.moveTo(doorX - porchW * 0.72, baseY + 1);
  ctx.lineTo(doorX, baseY + 6 * scale);
  ctx.lineTo(doorX + porchW * 0.72, baseY + 1);
  ctx.lineTo(doorX, baseY - 6 * scale);
  ctx.closePath();
  ctx.fill();

  // Small timber threshold on the ground plane, not painted over the facade.
  ctx.fillStyle = '#59402b';
  ctx.beginPath();
  ctx.moveTo(doorX - porchW * 0.5, baseY - 1);
  ctx.lineTo(doorX, baseY + 4 * scale);
  ctx.lineTo(doorX + porchW * 0.5, baseY - 1);
  ctx.lineTo(doorX, baseY - 5 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(224, 193, 139, 0.82)';
  ctx.lineWidth = Math.max(0.8, scale * 0.8);
  ctx.stroke();

  // Three offset flagstones make the entrance legible from the isometric
  // camera. Their positions and colors are pinned to world coordinates.
  for (let step = 0; step < 3; step++) {
    const jitter = ((h >>> (step * 3)) % 5) - 2;
    const stepX = doorX + jitter * scale;
    const stepY = baseY + (8 + step * 6) * scale;
    ctx.fillStyle = step === 1 ? '#9a8a70' : '#81745f';
    ctx.fillRect(Math.round(stepX - 3.5 * scale), Math.round(stepY), 7 * scale, 2.5 * scale);
    ctx.fillStyle = 'rgba(226, 211, 177, 0.55)';
    ctx.fillRect(Math.round(stepX - 3 * scale), Math.round(stepY), 5 * scale, Math.max(1, scale * 0.65));
  }

  // Two restrained garden pots sit beside the entrance at ground level.
  for (const side of [-1, 1]) {
    const px = doorX + side * porchW * 0.82;
    ctx.fillStyle = '#775238';
    ctx.fillRect(Math.round(px - 2.5 * scale), Math.round(baseY - 4 * scale), 5 * scale, 3 * scale);
    ctx.fillStyle = (h + side) % 2 === 0 ? '#6c9a4f' : '#568447';
    ctx.fillRect(Math.round(px - scale), Math.round(baseY - 7 * scale), 1.5 * scale, 3.5 * scale);
    ctx.fillRect(Math.round(px + 0.5 * scale), Math.round(baseY - 8 * scale), 1.5 * scale, 4.5 * scale);
    if ((h + side) % 3 !== 0) {
      ctx.fillStyle = h % 2 === 0 ? '#f0cf83' : '#f0e1b9';
      ctx.fillRect(Math.round(px + side * scale), Math.round(baseY - 9 * scale), 1.8 * scale, 1.8 * scale);
    }
  }
  ctx.restore();
}


/**
 * Reduced-cost canopy for distant trees. At small zoom the full layered crown
 * is sub-pixel detail; this version preserves silhouette and color variation
 * with far fewer canvas operations, improving frame time in dense forests.
 */
export function drawProceduralTreeLod(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  worldX: number,
  worldY: number,
): void {
  const h = tileHash(worldX, worldY, 0x7AEE);
  const s = Math.max(0.35, Math.min(1.4, scale));
  const canopy = ['#397543', '#477e3d', '#326b42', '#557f3b'][h % 4];
  ctx.fillStyle = 'rgba(29, 43, 25, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1 * s, 10 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#67472b';
  ctx.fillRect(Math.round(x - 2 * s), Math.round(y - 13 * s), Math.max(1, 4 * s), 13 * s);
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.ellipse(x, y - 22 * s, 13 * s, 14 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8dbb59';
  ctx.fillRect(Math.round(x - 6 * s), Math.round(y - 29 * s), Math.max(1, 4 * s), Math.max(1, 3 * s));
}


/**
 * Large landmark boulder near the starting town. Deterministic vector art
 * keeps it crisp at every zoom and avoids image loading or per-frame assets.
 */
export function drawProceduralBoulder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
): void {
  const s = Math.max(0.55, Math.min(1.8, scale));
  ctx.save();
  // Broad contact shadow anchors the stone to the ground plane.
  ctx.fillStyle = 'rgba(16, 23, 19, 0.32)';
  ctx.beginPath();
  ctx.ellipse(x + 2 * s, y + 1 * s, 31 * s, 11 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main angular silhouette, with a dark lower edge for readable volume.
  ctx.fillStyle = '#454b4c';
  ctx.beginPath();
  ctx.moveTo(x - 27 * s, y - 2 * s);
  ctx.lineTo(x - 22 * s, y - 20 * s);
  ctx.lineTo(x - 9 * s, y - 34 * s);
  ctx.lineTo(x + 9 * s, y - 37 * s);
  ctx.lineTo(x + 25 * s, y - 23 * s);
  ctx.lineTo(x + 31 * s, y - 7 * s);
  ctx.lineTo(x + 21 * s, y + 2 * s);
  ctx.lineTo(x - 18 * s, y + 3 * s);
  ctx.closePath();
  ctx.fill();

  // Facets use muted slate colors rather than a flat gray blob.
  ctx.fillStyle = '#697273';
  ctx.beginPath();
  ctx.moveTo(x - 22 * s, y - 20 * s);
  ctx.lineTo(x - 9 * s, y - 34 * s);
  ctx.lineTo(x + 1 * s, y - 18 * s);
  ctx.lineTo(x - 7 * s, y - 6 * s);
  ctx.lineTo(x - 27 * s, y - 2 * s);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#828989';
  ctx.beginPath();
  ctx.moveTo(x - 9 * s, y - 34 * s);
  ctx.lineTo(x + 9 * s, y - 37 * s);
  ctx.lineTo(x + 25 * s, y - 23 * s);
  ctx.lineTo(x + 9 * s, y - 17 * s);
  ctx.lineTo(x + 1 * s, y - 18 * s);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#555d5e';
  ctx.beginPath();
  ctx.moveTo(x + 1 * s, y - 18 * s);
  ctx.lineTo(x + 9 * s, y - 17 * s);
  ctx.lineTo(x + 31 * s, y - 7 * s);
  ctx.lineTo(x + 21 * s, y + 2 * s);
  ctx.lineTo(x - 7 * s, y - 6 * s);
  ctx.closePath();
  ctx.fill();

  // Small mineral flecks and cracks give the landmark scale and texture.
  ctx.strokeStyle = 'rgba(38, 44, 45, 0.8)';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo(x + 9 * s, y - 17 * s);
  ctx.lineTo(x + 5 * s, y - 8 * s);
  ctx.lineTo(x + 10 * s, y - 3 * s);
  ctx.moveTo(x - 17 * s, y - 13 * s);
  ctx.lineTo(x - 10 * s, y - 9 * s);
  ctx.stroke();
  ctx.fillStyle = '#a6aaa4';
  ctx.fillRect(Math.round(x - 13 * s), Math.round(y - 25 * s), Math.max(1, 4 * s), Math.max(1, 2 * s));
  ctx.fillRect(Math.round(x + 12 * s), Math.round(y - 26 * s), Math.max(1, 3 * s), Math.max(1, 2 * s));
  ctx.restore();
}
