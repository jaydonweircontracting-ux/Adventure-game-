import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rpg = readFileSync(new URL('../src/game/iso/rpgSprites.ts', import.meta.url), 'utf8');
const iso = readFileSync(new URL('../src/game/iso/isoSprites.ts', import.meta.url), 'utf8');

const block = rpg.match(/export const RPG_CAM_FOR_FACE: Record<Face8, number> = \{([\s\S]*?)\n\};/);
assert.ok(block, 'RPG_CAM_FOR_FACE mapping exists');

const actual = Object.fromEntries(
  [...block[1].matchAll(/^\s*(up|down|left|right|upleft|upright|downleft|downright):\s*(\d+)/gm)]
    .map((m) => [m[1], Number(m[2])]),
);
assert.deepEqual(actual, {
  up: 3,
  down: 7,
  left: 1,
  right: 5,
  upleft: 2,
  upright: 4,
  downleft: 0,
  downright: 6,
}, 'RPG camera directions must match the actual eight views and old barbarian facing names');

assert.equal(new Set(Object.values(actual)).size, 8, 'each facing must use a unique camera view');
assert.deepEqual(
  [...iso.matchAll(/\{\s*num:\s*(\d+),\s*label:\s*'[^']+',\s*face:\s*'([^']+)'/g)]
    .map((m) => [Number(m[1]), m[2]]),
  [
    [1, 'up'], [2, 'upright'], [3, 'right'], [4, 'downright'],
    [5, 'down'], [6, 'downleft'], [7, 'left'], [8, 'upleft'],
  ],
  'debug direction numbers must retain the canonical clockwise 1=N through 8=NW order',
);

console.log('PASS: all eight RPG camera mappings match the canonical direction table.');
