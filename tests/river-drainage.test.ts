import assert from 'node:assert/strict';
import { defaultWorld } from '../src/game/iso/isoWorld';
import { generateRivers, stampRivers } from '../src/game/engine3d/rivers';

// BUILD 1130 river drainage regression: flat filled basins must drain by
// priority-flood discovery order, not row-major coordinate tie-breaks.
// Winding rivers are restored (the #79 straight-channel pass is removed):
// courses follow the drainage field and may meander.
const world = defaultWorld();
const first = generateRivers(world);
const second = generateRivers(world);
assert.ok(first.length > 0, 'the default landscape produces rivers');
assert.deepEqual(second, first, 'river courses remain deterministic');

const occupied = new Set<string>();
for (const river of first) {
  assert.ok(river.tiles.length >= 10, 'every shipped channel is a river, not a short rill');
  const local = new Set<string>();
  for (let i = 0; i < river.tiles.length; i++) {
    const tile = river.tiles[i];
    const key = tile.x + ',' + tile.y;
    assert.equal(local.has(key), false, 'a course never loops back over itself');
    local.add(key);
    assert.equal(occupied.has(key), false, 'independent courses do not duplicate centreline tiles');
    occupied.add(key);
    if (i > 0) {
      const prev = river.tiles[i - 1];
      assert.ok(Math.max(Math.abs(tile.x - prev.x), Math.abs(tile.y - prev.y)) === 1,
        'the river centreline remains 8-connected');
    }
  }
}

// Old saves carry persisted river stamps. They must be
// migrated once, while unrelated pond water remains intact.
const legacy = defaultWorld();
legacy.terrain['180,180'] = 'water';
legacy.rivers = [{
  id: 'legacy-row-major',
  tiles: [{ x: 180, y: 180, dx: 1, dy: 0 }],
  mouth: { x: 181, y: 180 },
}];
assert.equal(stampRivers(legacy), true, 'legacy river stamps are regenerated');
assert.equal(legacy.riverGeneration, 5, 'the new river generation stamp is persisted');
assert.ok(legacy.rivers!.every(r => r.id !== 'legacy-row-major'), 'the legacy course is replaced');
assert.equal(legacy.terrain['119,81'], 'water', 'the authored pond remains water');
assert.equal(stampRivers(legacy), false, 'the new river stamp is idempotent');
console.log('river drainage regression: passed');
