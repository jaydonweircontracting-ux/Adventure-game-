import assert from 'node:assert/strict';
import { customPaintColor, mapBuilderSolidsFor, paintTile, clearChunkPaints } from '../src/game/mapBuilder';
import { editorPlaceObject, editorSolidSize, editorSolidsFor } from '../src/game/worldEditor';

const empty = {};
const grass = paintTile(empty, '4,7', 2, 3, 'grass');
assert.deepEqual(grass['4,7'], [{ tx: 2, ty: 3, tile: 'grass' }], 'painting creates a chunk-scoped tile');
assert.equal(paintTile(grass, '4,7', 2, 3, 'grass'), grass, 'repainting the same tile is a no-op');
assert.equal(paintTile(grass, '4,7', 28, 3, 'grass'), grass, 'out-of-bounds tiles are rejected');
assert.equal(customPaintColor('color:#ABCDEF'), '#abcdef', 'custom hex colors normalize to lowercase');
assert.equal(customPaintColor('color:red'), null, 'invalid custom colors are rejected');

const recolored = paintTile(grass, '4,7', 2, 3, 'color:#123456');
assert.equal(recolored['4,7'][0].tile, 'color:#123456');
const erased = paintTile(recolored, '4,7', 2, 3, null);
assert.equal(erased['4,7'], undefined, 'erasing the final tile removes the empty chunk entry');
assert.deepEqual(clearChunkPaints(grass, '4,7'), {}, 'clear-chunk removes only the selected chunk');
assert.equal(clearChunkPaints(grass, '8,8'), grass, 'clearing an absent chunk is a no-op');

const terrainSolids = mapBuilderSolidsFor({
  '4,7': [
    { tx: 1, ty: 2, tile: 'water' },
    { tx: 3, ty: 4, tile: 'forest' },
    { tx: 5, ty: 6, tile: 'grass' },
    { tx: 7, ty: 8, tile: 'path' },
  ],
}, '4,7');
assert.equal(terrainSolids.length, 2, 'only water and forest paints block movement');
assert.deepEqual(terrainSolids[0], { chunk: '4,7', x: 15, y: 25, w: 10, h: 10 });

const house = editorPlaceObject([], 'house', 12.34, 56.78, '4,7');
const tree = editorPlaceObject(house, 'tree', 18.26, 60.04, '4,7');
const road = editorPlaceObject(tree, 'roadH', 25, 70, '4,7');
assert.equal(tree.length, 2);
assert.notEqual(tree[0].id, tree[1].id, 'placed object IDs remain unique for successive placements');
assert.equal(house[0].x, 12.3, 'placement coordinates are rounded to tenths');
assert.equal(house[0].y, 56.8);
assert.deepEqual(editorSolidSize('house'), { w: 13, h: 9 });
assert.equal(editorSolidSize('roadH'), null, 'roads remain walkable');

const objectSolids = editorSolidsFor(road);
assert.equal(objectSolids.length, 2, 'house and tree create solids while roads do not');
assert.deepEqual(objectSolids[0], { chunk: '4,7', x: 12.3, y: 56.8, w: 13, h: 9 });
assert.deepEqual(objectSolids[1], { chunk: '4,7', x: 18.3, y: 60, w: 4.5, h: 5 });

console.log('World editor persistence and collision regression tests passed.');
