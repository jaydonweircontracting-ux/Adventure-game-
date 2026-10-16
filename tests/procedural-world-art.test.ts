import assert from 'node:assert/strict';
import { drawProceduralGroundAccent, drawProceduralPathDetail, drawProceduralTreeLod } from '../src/game/engine/proceduralWorldArt';

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


// BUILD 730: building re-skin geometry is deterministic and paints the full
// architectural pass without depending on animation time or random state.
import { drawBuildingRenovation } from '../src/game/engine/proceduralWorldArt';

function buildingContext() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() { calls.push('save'); }, restore() { calls.push('restore'); },
    beginPath() { calls.push('begin'); },
    moveTo(x: number, y: number) { calls.push(`move:${x},${y}`); },
    lineTo(x: number, y: number) { calls.push(`line:${x},${y}`); },
    stroke() { calls.push('stroke'); },
    fill() { calls.push('fill'); },
    fillRect(x: number, y: number, w: number, h: number) { calls.push(`rect:${x},${y},${w},${h},${this.fillStyle}`); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const houseA = buildingContext();
const houseB = buildingContext();
drawBuildingRenovation(houseA.ctx, 100, 200, 120, 90, 24, 71);
drawBuildingRenovation(houseB.ctx, 100, 200, 120, 90, 24, 71);
assert.deepEqual(houseA.calls, houseB.calls, 'building facade details must remain stable across redraws');
assert.ok(houseA.calls.length > 40, 'building renovation should draw a substantial architectural detail pass');
assert.equal(houseA.calls[0], 'save');
assert.equal(houseA.calls[houseA.calls.length - 1], 'restore');
const emptyHouse = buildingContext();
drawBuildingRenovation(emptyHouse.ctx, 100, 200, 0, 0, 24, 71);
assert.equal(emptyHouse.calls.length, 0, 'invalid building dimensions should be ignored safely');
console.log(`Building visual overhaul regression passed (${houseA.calls.length} stable drawing operations).`);


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
