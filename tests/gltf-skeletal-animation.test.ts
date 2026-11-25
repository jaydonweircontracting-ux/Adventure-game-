import assert from 'node:assert/strict';
import { parseGltfUpload } from '../src/game/engine3d/customAssets';

// Minimal valid glTF 2.0: one triangle weighted to one joint, with a
// translation animation on that joint. This exercises binary accessor
// decoding, inverse-bind matrices, node transforms and baked actor frames.
const chunks: Uint8Array[] = [];
const views: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
let byteLength = 0;
const add = (bytes: Uint8Array) => {
  while (byteLength % 4) { chunks.push(new Uint8Array([0])); byteLength++; }
  const byteOffset = byteLength;
  chunks.push(bytes);
  byteLength += bytes.length;
  views.push({ buffer: 0, byteOffset, byteLength: bytes.length });
  return views.length - 1;
};
const floats = (values: number[]) => {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, i) => view.setFloat32(i * 4, value, true));
  return out;
};
const positionsView = add(floats([0, 0, 0, 1, 0, 0, 0, 1, 0]));
const jointsView = add(new Uint8Array(12));
const weightsView = add(floats([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
const indicesView = add(new Uint8Array([0, 0, 1, 0, 2, 0]));
const inverseBindView = add(floats([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
const timesView = add(floats([0, 1]));
const translationView = add(floats([0, 0, 0, 0, 1, 0]));
const binary = new Uint8Array(byteLength);
let offset = 0;
for (const chunk of chunks) { binary.set(chunk, offset); offset += chunk.length; }

const json = {
  asset: { version: '2.0' },
  buffers: [{ byteLength: binary.length, uri: 'data:application/octet-stream;base64,' + Buffer.from(binary).toString('base64') }],
  bufferViews: views,
  accessors: [
    { bufferView: positionsView, componentType: 5126, count: 3, type: 'VEC3' },
    { bufferView: jointsView, componentType: 5121, count: 3, type: 'VEC4' },
    { bufferView: weightsView, componentType: 5126, count: 3, type: 'VEC4' },
    { bufferView: indicesView, componentType: 5123, count: 3, type: 'SCALAR' },
    { bufferView: inverseBindView, componentType: 5126, count: 1, type: 'MAT4' },
    { bufferView: timesView, componentType: 5126, count: 2, type: 'SCALAR' },
    { bufferView: translationView, componentType: 5126, count: 2, type: 'VEC3' },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, indices: 3 }] }],
  nodes: [{ mesh: 0, skin: 0 }, { name: 'RootBone' }],
  skins: [{ joints: [1], inverseBindMatrices: 4 }],
  animations: [{
    name: 'Walk',
    samplers: [{ input: 5, output: 6, interpolation: 'LINEAR' }],
    channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }],
  }],
};
const result = parseGltfUpload(JSON.stringify(json), 'animated-knight.gltf');
assert.equal(result.ok, true, result.ok ? '' : result.reason);
if (!result.ok) throw new Error(result.reason);
assert.ok(result.asset.animationFrames && result.asset.animationFrames.length >= 2);
assert.equal(result.asset.animationFrames?.[0].length, result.asset.positions.length);
assert.equal(result.asset.animationFrames?.[1].length, result.asset.positions.length);
const baseY = result.asset.positions[1];
const animatedY = result.asset.animationFrames![1][1];
assert.ok(animatedY > baseY + 0.05 && animatedY < baseY + 0.2,
  'joint translation should move the baked frame by the sampled animation time');
console.log('BUILD 1121 glTF skeletal animation: 6 assertions passed');
