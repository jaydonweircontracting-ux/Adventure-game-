import assert from 'node:assert/strict';
import { drawProceduralGroundAccent, drawProceduralPathDetail } from '../src/game/engine/proceduralWorldArt';

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
