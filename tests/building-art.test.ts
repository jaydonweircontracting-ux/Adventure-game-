import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { buildingArtFor } from '../src/game/buildingArt';
import { BUILDING_VARIANTS, mosslightCottageRects280 } from '../src/game/settlements';
import { mosslightPinnedRects, mosslightFillerLots } from '../src/game/mosslightLayout';
for (const variant of BUILDING_VARIANTS) {
  assert.ok(existsSync(resolve(process.cwd(), 'public', 'buildings', variant + '.png')), 'missing audited building sprite: ' + variant);
}
const pinned = mosslightPinnedRects();
assert.equal(pinned.length, 18, 'Mosslight pinned building order must remain stable');
const fixedVariants = ['blue-house', 'story-tower', 'plaster-house', 'tavern'];
for (let i = 0; i < 4; i++) assert.equal(buildingArtFor({ x: 4, y: 7 }, i, pinned[i]).variant, fixedVariants[i]);
for (let i = 4; i < 10; i++) assert.ok(BUILDING_VARIANTS.includes(buildingArtFor({ x: 4, y: 7 }, i, pinned[i]).variant as typeof BUILDING_VARIANTS[number]));
const townVariants = ['house-balcony', 'tavern', 'shop-banner', 'house-timber', 'shop-awning', 'cottage-wide', 'brick-shop', 'hall-grand'];
for (let i = 10; i < 18; i++) assert.equal(buildingArtFor({ x: 4, y: 7 }, i, pinned[i]).variant, townVariants[i - 10]);
const fillers = mosslightFillerLots();
for (let i = 0; i < fillers.length; i++) { const art = buildingArtFor({ x: 4, y: 7 }, 18 + i, fillers[i].rect); assert.ok(BUILDING_VARIANTS.includes(art.variant as typeof BUILDING_VARIANTS[number])); assert.equal(art.file, 'buildings/' + art.variant + '.png'); }
const cottage = mosslightCottageRects280()[0];
const first = buildingArtFor({ x: 4, y: 7 }, 4, cottage);
assert.deepEqual(first, buildingArtFor({ x: 4, y: 7 }, 4, { ...cottage }));
assert.equal(first.aspectRatio, first.variant === 'hut-thatched' ? '1 / 1' : '2 / 1');
for (let x = -20; x <= 20; x += 4) for (let y = -20; y <= 20; y += 4) for (let i = 0; i < 12; i++) { const rect = { left: 30 + i, top: 40 + i, right: 50 + i, bottom: 55 + i }; const a = buildingArtFor({ x, y }, i, rect); assert.deepEqual(a, buildingArtFor({ x, y }, i, rect), 'sprite selection must be deterministic'); assert.ok(BUILDING_VARIANTS.includes(a.variant as typeof BUILDING_VARIANTS[number])); }
console.log('Building art tests passed (catalog, pinned lots, fillers, deterministic selection).');
