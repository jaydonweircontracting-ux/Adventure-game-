// BUILD 902: browser-decoded visual integrity audit for every referenced iso tile.
// This verifies the actual PNG pixel data, not just filenames and file sizes.
// It is an automated asset audit, not a substitute for device-specific visual review.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { DECOR_TILES, GROUND_TILES } from '../src/game/iso/isoTiles';

type TileAsset = { kind: 'ground' | 'decor'; id: number; file: string };
const root = process.cwd();
const assets = new Map<string, TileAsset>();
for (const ids of Object.values(GROUND_TILES)) {
  for (const id of ids) assets.set(`ground:${id}`, {
    kind: 'ground', id, file: resolve(root, 'public/iso-tiles/ground', `tile_${String(id).padStart(3, '0')}.png`),
  });
}
for (const ids of Object.values(DECOR_TILES)) {
  for (const id of ids) assets.set(`decor:${id}`, {
    kind: 'decor', id, file: resolve(root, 'public/iso-tiles/decor', `decor_${String(id).padStart(3, '0')}.png`),
  });
}
assert.ok(assets.size > 0, 'tile palette must reference visual assets');

const payload = [...assets.values()].map((asset) => {
  assert.ok(existsSync(asset.file), `missing ${asset.kind} tile ${asset.id}`);
  const bytes = readFileSync(asset.file);
  assert.ok(bytes.length > 64, `empty or truncated ${asset.kind} tile ${asset.id}`);
  assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a', `tile ${asset.file} is not a PNG`);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `tile ${asset.file} has no PNG header`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.ok(width >= 8 && height >= 8 && width <= 512 && height <= 512,
    `implausible tile dimensions ${width}x${height}: ${asset.file}`);
  return { kind: asset.kind, id: asset.id, file: asset.file, bytes: bytes.toString('base64'), width, height, size: statSync(asset.file).size };
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  const stats = await page.evaluate(\`async (items) => {
    const results = [];
    for (const item of items) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + item.bytes;
      try { await img.decode(); } catch (error) {
        results.push({ kind: item.kind, id: item.id, width: 0, height: 0, visible: 0, transparent: 0, uniqueColors: 0, opaqueWhiteCorners: false, decodeError: String(error) });
        continue;
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('2D canvas unavailable');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      let transparent = 0;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a > 8) visible++;
        if (a < 248) transparent++;
        if (colors.size < 512) colors.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ',' + a);
      }
      const corners = [[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]];
      let opaqueWhiteCorners = true;
      for (const point of corners) {
        const i = (point[1] * canvas.width + point[0]) * 4;
        if (!(data[i + 3] > 245 && data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242)) opaqueWhiteCorners = false;
      }
      results.push({
        kind: item.kind, id: item.id, width: canvas.width, height: canvas.height,
        visible, transparent, uniqueColors: colors.size, opaqueWhiteCorners,
      });
    }
    return results;
  }\`, payload) as Array<{ kind: string; id: number; width: number; height: number; visible: number; transparent: number; uniqueColors: number; opaqueWhiteCorners: boolean; decodeError?: string }>;

  const failures: string[] = [];
  for (const tile of stats) {
    const pixels = tile.width * tile.height;
    if (tile.decodeError) failures.push(`${tile.kind}/${tile.id}: browser PNG decode failed (${tile.decodeError})`);
    else {
      if (tile.visible < pixels * 0.02) failures.push(`${tile.kind}/${tile.id}: fewer than 2% visible pixels`);
      if (tile.uniqueColors < 2) failures.push(`${tile.kind}/${tile.id}: visually flat single-color image`);
      if (tile.kind === 'decor' && tile.opaqueWhiteCorners) failures.push(`${tile.kind}/${tile.id}: opaque white background at all four corners`);
    }
  }
  if (failures.length) console.error('Tile visual audit failures:\\n' + failures.join('\\n'));
  assert.deepEqual(failures, [], `tile pixel audit found broken-looking assets:\n${failures.join('\n')}`);
  const decor = stats.filter((tile) => tile.kind === 'decor');
  const transparentDecor = decor.filter((tile) => tile.transparent > 0).length;
  console.log(`Tile pixel audit passed: ${stats.length} unique assets decoded in Chromium; ${decor.length} decor assets, ${transparentDecor} with alpha transparency; all assets contain visible pixel detail.`);
} finally {
  await browser.close();
}
