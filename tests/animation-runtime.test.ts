import assert from 'node:assert/strict';
import {
  multiplyAnimationMatrices,
  sampleAnimationSampler,
  slerpQuaternion,
  skinAnimationVertex,
} from '../src/game/engine3d/animationRuntime';

const linear = sampleAnimationSampler({
  times: [0, 2], values: [0, 2, 4, 10, 12, 14], components: 3,
}, 1, 'translation');
assert.deepEqual(linear.value, [5, 7, 9]);
assert.equal(linear.leftKey, 0);
assert.equal(linear.rightKey, 1);

const stepped = sampleAnimationSampler({
  times: [0, 1], values: [1, 2, 3, 7, 8, 9], components: 3, interpolation: 'STEP',
}, 0.9, 'translation');
assert.deepEqual(stepped.value, [1, 2, 3]);

const cubic = sampleAnimationSampler({
  times: [0, 1],
  // key 0: in, value, out; key 1: in, value, out
  values: [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0],
  components: 3,
  interpolation: 'CUBICSPLINE',
}, 0.5, 'translation');
assert.deepEqual(cubic.value.map(v => Number(v.toFixed(6))), [0.5, 0.5, 0.5]);

const halfTurn = slerpQuaternion([0, 0, 0, 1], [0, 1, 0, 0], 0.5);
assert.ok(Math.abs(Math.hypot(...halfTurn) - 1) < 1e-9);
assert.ok(Math.abs(halfTurn[1] - Math.SQRT1_2) < 1e-6);

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translate = identity.slice(); translate[12] = 3;
assert.equal(multiplyAnimationMatrices(identity, translate)[12], 3);
assert.deepEqual(skinAnimationVertex([1, 2, 3], [0, 1, 0, 0], [0.25, 0.75, 0, 0], [identity, translate]), [3.25, 2, 3]);

assert.throws(() => sampleAnimationSampler({
  times: [0, 1], values: [0, 1], components: 3,
}, 0.5, 'translation'), /inconsistent/);

console.log('BUILD 1113 animation runtime: 7 assertions passed');
