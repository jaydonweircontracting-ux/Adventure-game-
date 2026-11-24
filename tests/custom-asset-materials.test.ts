import assert from 'node:assert/strict';
import { normalizePbrMaterial } from '../src/game/engine3d/materialRuntime';
import { extractGltfTextureImages, validAsset } from '../src/game/engine3d/customAssets';
import { decodedAssetBytes } from '../src/game/engine3d/assetStore';

const base = {
  id: 'custom-test', name: 'Textured knight',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  colors: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  indices: [0, 1, 2], width: 1, height: 1,
  avgColor: [1, 1, 1] as [number, number, number],
  format: 'fbx' as const,
  uvs: [0, 0, 1, 0, 0, 1],
  uvSets: [[0.1, 0.2, 0.8, 0.2, 0.1, 0.9]],
  materials: [normalizePbrMaterial({
    name: 'Leather',
    baseColorFactor: [0.4, 0.2, 0.1, 1],
    metallicFactor: 0,
    roughnessFactor: 0.9,
    baseColorTexture: { textureIndex: 2, texCoord: 0 },
  })],
  materialIndices: [0, 0, 0],
  textureImages: ['data:image/png;base64,AQID'],
};

const parsed = validAsset(base);
assert.ok(parsed);
assert.deepEqual(parsed?.uvs, base.uvs);
assert.deepEqual(parsed?.uvSets, base.uvSets);
assert.equal(validAsset({ ...base, uvSets: [[0, 0]] }), null);
assert.deepEqual(parsed?.materialIndices, base.materialIndices);
assert.equal(parsed?.materials?.[0].name, 'Leather');
assert.equal(parsed?.materials?.[0].textures.baseColor?.textureIndex, 2);
assert.deepEqual(parsed?.textureImages, ['data:image/png;base64,AQID']);
const embeddedImages = extractGltfTextureImages({
  images: [{ uri: 'data:image/png;base64,AQID' }],
  textures: [{ source: 0 }],
} as any, new Uint8Array(), '');
assert.deepEqual(embeddedImages, ['data:image/png;base64,AQID']);
const companionImages = extractGltfTextureImages({
  images: [{ uri: '../textures/armor.png' }],
  textures: [{ source: 0 }],
} as any, new Uint8Array(), 'models', new Map([['textures/armor.png', new Uint8Array([1, 2, 3]).buffer]]));
assert.deepEqual(companionImages, ['data:image/png;base64,AQID']);
const bufferViewImages = extractGltfTextureImages({
  images: [{ bufferView: 0, mimeType: 'image/png' }],
  textures: [{ source: 0 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 3 }],
} as any, new Uint8Array([1, 2, 3]), '');
assert.deepEqual(bufferViewImages, ['data:image/png;base64,AQID']);

const animatedTextured = validAsset({
  ...base,
  textureImages: ['data:image/png;base64,AA=='],
  animationFrames: [base.positions, base.positions.map((v, i) => v + (i % 3 === 1 ? 0.1 : 0))],
  animationFps: 8,
});
assert.ok(animatedTextured);
assert.equal(animatedTextured?.textureImages?.[0], 'data:image/png;base64,AA==');
assert.equal(animatedTextured?.animationFrames?.length, 2);
assert.equal(animatedTextured?.animationFps, 8);
const malformedAnimation = validAsset({ ...base, animationFrames: [base.positions, [0, 1, 2]] });
assert.ok(malformedAnimation);
assert.equal(malformedAnimation?.animationFrames, undefined);
assert.equal(validAsset({ ...base, textureImages: ['javascript:alert(1)'] }), null);

assert.equal(validAsset({ ...base, uvs: [0, 0] }), null);
assert.equal(validAsset({ ...base, materialIndices: [0, 0] }), null);
assert.equal(validAsset({ ...base, materialIndices: [1, 1, 1] }), null);

// Older library records remain valid without the new optional attributes.
const legacy = { ...base };
delete (legacy as Partial<typeof base>).uvs;
delete (legacy as Partial<typeof base>).uvSets;
delete (legacy as Partial<typeof base>).materials;
delete (legacy as Partial<typeof base>).materialIndices;
delete (legacy as Partial<typeof base>).textureImages;
const oldRecord = validAsset(legacy);
assert.ok(oldRecord);
assert.equal(oldRecord?.uvs, undefined);
assert.equal(oldRecord?.uvSets, undefined);
assert.equal(oldRecord?.materials, undefined);
assert.equal(oldRecord?.textureImages, undefined);

const withoutMetadata = decodedAssetBytes(oldRecord!);
const withMetadata = decodedAssetBytes(parsed!);
assert.ok(withMetadata > withoutMetadata);
assert.ok(decodedAssetBytes(animatedTextured!) > decodedAssetBytes(parsed!));

console.log('BUILD 1118 custom asset texture/animation/UV preservation: 22 assertions passed');
