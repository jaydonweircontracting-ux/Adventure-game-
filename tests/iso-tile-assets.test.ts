import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DECOR_TILES, GROUND_TILES } from '../src/game/iso/isoTiles';

const root = process.cwd();
let groundCount = 0;
let decorCount = 0;
const missing: string[] = [];

for (const [terrain, ids] of Object.entries(GROUND_TILES)) {
  assert.ok(ids.length > 0, `ground palette "${terrain}" must not be empty`);
  for (const id of ids) {
    assert.ok(Number.isInteger(id) && id >= 0, `invalid ground tile id ${terrain}:${id}`);
    groundCount += 1;
    const path = resolve(root, 'public/iso-tiles/ground', `tile_${String(id).padStart(3, '0')}.png`);
    if (!existsSync(path) || statSync(path).size === 0) missing.push(`ground/${String(id).padStart(3, '0')}.png (${terrain})`);
  }
}
for (const [terrain, ids] of Object.entries(DECOR_TILES)) {
  for (const id of ids) {
    assert.ok(Number.isInteger(id) && id >= 0, `invalid decor tile id ${terrain}:${id}`);
    decorCount += 1;
    const path = resolve(root, 'public/iso-tiles/decor', `decor_${String(id).padStart(3, '0')}.png`);
    if (!existsSync(path) || statSync(path).size === 0) missing.push(`decor/${String(id).padStart(3, '0')}.png (${terrain})`);
  }
}
assert.deepEqual(missing, [], `referenced isometric tile assets must exist and be non-empty:\n${missing.join('\n')}`);
console.log(`Isometric tile assets passed: ${groundCount} ground references and ${decorCount} decor references resolve to non-empty PNG files.`);
