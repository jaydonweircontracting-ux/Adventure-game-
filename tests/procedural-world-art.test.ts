import assert from 'node:assert/strict';
import { drawProceduralGroundAccent, drawProceduralPathDetail, drawProceduralTreeLod, drawBuildingGroundDress } from '../src/game/engine/proceduralWorldArt';
import { BUILDING_ASSET_META, buildingSpriteHeightForWidth } from '../src/game/buildingRig';

function mockContext() {
  const calls: Array<[number, number, number, number, string]> = [];
  const ctx = {
    fillStyle: '#000000',
    globalAlpha: 1,
    save() {},
    restore() {},
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push([x, y, w, h, String(this.fillStyle)]);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

let accents = 0;
for (let y = -20; y < 40; y++) {
  for (let x = -20; x < 40; x++) {
    const a = mockContext();
    const b = mockContext();
    const resultA = drawProceduralGroundAccent(a.ctx, 'meadow', x, y, x * 32, y * 16);
    const resultB = drawProceduralGroundAccent(b.ctx, 'meadow', x, y, x * 32, y * 16);
    assert.equal(resultA, resultB, 'same world tile should return the same accent result');
    assert.deepEqual(a.calls, b.calls, 'same world tile should draw identical pixel shapes');
    if (resultA) accents++;
  }
}
assert.ok(accents > 100, 'procedural accents should appear often enough to be visible');

for (const biome of ['ocean', 'desert', 'rock']) {
  const mock = mockContext();
  assert.equal(drawProceduralGroundAccent(mock.ctx, biome, 12, 34, 20, 20), false);
  assert.equal(mock.calls.length, 0, 'unsupported biome must not receive cozy grass accents');
}

console.log(`Procedural world art tests passed (${accents} deterministic meadow accents sampled).`);


let pathMarks = 0;
for (let y = -15; y < 25; y++) {
  for (let x = -15; x < 25; x++) {
    const a = mockContext();
    const b = mockContext();
    drawProceduralPathDetail(a.ctx, x, y, x * 32, y * 16, false);
    drawProceduralPathDetail(b.ctx, x, y, x * 32, y * 16, false);
    assert.deepEqual(a.calls, b.calls, 'road texture must remain stable across frames and chunk boundaries');
    pathMarks += a.calls.length;
  }
}
assert.ok(pathMarks > 100, 'road dressing should add a visible but sparse texture');
console.log(`Path detail regression passed (${pathMarks} deterministic marks sampled).`);


// Building ground dressing stays deterministic and aligned to the atlas door
// (~38% from the left), without painting generic roof/facade details over sprites.
function buildingContext() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() { calls.push('save'); }, restore() { calls.push('restore'); },
    beginPath() { calls.push('begin'); }, closePath() { calls.push('close'); },
    moveTo(x: number, y: number) { calls.push(`move:${x},${y}`); },
    lineTo(x: number, y: number) { calls.push(`line:${x},${y}`); },
    stroke() { calls.push('stroke'); }, fill() { calls.push('fill'); },
    fillRect(x: number, y: number, w: number, h: number) { calls.push(`rect:${x},${y},${w},${h},${this.fillStyle}`); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const houseA = buildingContext();
const houseB = buildingContext();
drawBuildingGroundDress(houseA.ctx, 100, 200, 120, 24, 71);
drawBuildingGroundDress(houseB.ctx, 100, 200, 120, 24, 71);
assert.deepEqual(houseA.calls, houseB.calls, 'building ground details must remain stable across redraws');
assert.ok(houseA.calls.length > 12, 'building entry should receive a restrained porch and planters');
assert.equal(houseA.calls[0], 'save');
assert.equal(houseA.calls[houseA.calls.length - 1], 'restore');
const emptyHouse = buildingContext();
drawBuildingGroundDress(emptyHouse.ctx, 100, 200, 0, 24, 71);
assert.equal(emptyHouse.calls.length, 0, 'tiny building dimensions should be ignored safely');
const firstPorchPoint = houseA.calls.find((call) => call.startsWith('move:'));
assert.ok(firstPorchPoint, 'entry porch should have a ground-plane polygon');
const porchX = Number(firstPorchPoint.slice('move:'.length).split(',')[0]);
assert.ok(porchX < 100, 'porch must align left of center with the authored door location');
console.log(`Building rendering regression passed (${houseA.calls.length} deterministic ground-detail operations).`);


// BUILD 731: distant-tree LOD is stable and uses a compact drawing sequence.
function treeLodContext() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '', beginPath() { calls.push('begin'); },
    ellipse(x: number, y: number, rx: number, ry: number) { calls.push(`ellipse:${x},${y},${rx},${ry}`); },
    fill() { calls.push(`fill:${this.fillStyle}`); },
    fillRect(x: number, y: number, w: number, h: number) { calls.push(`rect:${x},${y},${w},${h},${this.fillStyle}`); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const treeA = treeLodContext();
const treeB = treeLodContext();
drawProceduralTreeLod(treeA.ctx, 30, 60, 1, -42, 71);
drawProceduralTreeLod(treeB.ctx, 30, 60, 1, -42, 71);
assert.deepEqual(treeA.calls, treeB.calls, 'distant tree silhouette must be deterministic');
assert.ok(treeA.calls.length <= 10, 'distant tree should use a small drawing operation budget');
console.log(`Tree LOD regression passed (${treeA.calls.length} drawing operations).`);


// Building sprite culling uses each asset's real aspect ratio, including the
// taller thatched huts and gatehouses, so roofs remain visible at viewport edges.
assert.equal(buildingSpriteHeightForWidth(100, 'blue-cottage'), 50);
assert.equal(buildingSpriteHeightForWidth(100, 'hut-thatched'), 100);
assert.equal(buildingSpriteHeightForWidth(80, 'story-tower'), 40);
assert.equal(buildingSpriteHeightForWidth(0, 'blue-cottage'), 0);
assert.equal(buildingSpriteHeightForWidth(-10, 'blue-cottage'), 0);
assert.equal(buildingSpriteHeightForWidth(100, 'missing-variant'), 100, 'unknown sprite should use conservative square bounds');
for (const [variant, meta] of Object.entries(BUILDING_ASSET_META)) {
  assert.ok(meta.w > 0 && meta.h > 0, `${variant} must have positive audited dimensions`);
  const h = buildingSpriteHeightForWidth(120, variant);
  assert.ok(h > 0 && Number.isFinite(h), `${variant} must produce a valid culling height`);
}
console.log(`Building sprite bounds regression passed (${Object.keys(BUILDING_ASSET_META).length} variants checked).`);
