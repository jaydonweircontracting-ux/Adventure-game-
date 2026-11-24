import assert from 'node:assert/strict';
import {
  normalizePbrMaterial,
  resolveTextureSource,
  transformTextureUv,
} from '../src/game/engine3d/materialRuntime';

const material = normalizePbrMaterial({
  name: 'Knight',
  baseColorFactor: [0.8, 0.4, 0.2, 0.75],
  metallicFactor: 1.4,
  roughnessFactor: -0.2,
  emissiveFactor: [0.1, 0.2, 0.3],
  alphaMode: 'BLEND',
  doubleSided: true,
  baseColorTexture: {
    textureIndex: 3,
    texCoord: 1,
    transform: { offset: [0.25, 0.5], rotation: 0, scale: [2, 2] },
  },
});
assert.equal(material.name, 'Knight');
assert.deepEqual(material.baseColor, [0.8, 0.4, 0.2, 0.75]);
assert.equal(material.metallic, 1);
assert.equal(material.roughness, 0);
assert.equal(material.alphaMode, 'BLEND');
assert.equal(material.doubleSided, true);
assert.equal(material.textures.baseColor?.textureIndex, 3);
assert.equal(material.textures.baseColor?.texCoord, 1);

const defaults = normalizePbrMaterial();
assert.deepEqual(defaults.baseColor, [1, 1, 1, 1]);
assert.equal(defaults.metallic, 1);
assert.equal(defaults.roughness, 1);
assert.equal(defaults.alphaMode, 'OPAQUE');

assert.deepEqual(
  transformTextureUv([0.25, 0.5], { offset: [0.1, 0.2], rotation: 0, scale: [2, 2] }),
  [0.6, 1.2],
);
const rotated = transformTextureUv([1, 0], {
  offset: [0, 0], rotation: Math.PI / 2, scale: [1, 1],
});
assert.ok(Math.abs(rotated[0]) < 1e-9);
assert.ok(Math.abs(rotated[1] - 1) < 1e-9);

assert.deepEqual(resolveTextureSource('data:image/png;base64,AAAA', 'https://game.test/a/model.gltf'), {
  uri: 'data:image/png;base64,AAAA', kind: 'data',
});
assert.deepEqual(resolveTextureSource('../textures/armor.png', 'https://game.test/a/model.gltf'), {
  uri: 'https://game.test/textures/armor.png', kind: 'external',
});
assert.equal(resolveTextureSource('https://cdn.test/a.png', 'https://game.test/model.gltf').kind, 'absolute');
assert.throws(() => resolveTextureSource('javascript:alert(1)', 'https://game.test/model.gltf'), /unsafe/);
assert.throws(() => resolveTextureSource('', 'https://game.test/model.gltf'), /empty/);

console.log('BUILD 1114 material runtime: 20 assertions passed');
