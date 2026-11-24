import assert from 'node:assert/strict';
import { normalizePbrMaterial } from '../src/game/engine3d/materialRuntime';
import { validAsset } from '../src/game/engine3d/customAssets';
import { decodedAssetBytes } from '../src/game/engine3d/assetStore';

const base = {
  id: 'custom-test', name: 'Textured knight',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  colors: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  indices: [0, 1, 2], width: 1, height: 1,
  avgColor: [1, 1, 1] as [number, number, number],
  format: 'fbx' as const,
  uvs: [0, 0, 1, 0, 0, 1],
  materials: [normalizePbrMaterial({
    name: 'Leather',
    baseColorFactor: [0.4, 0.2, 0.1, 1],
    metallicFactor: 0,
    roughnessFactor: 0.9,
    baseColorTexture: { textureIndex: 2, texCoord: 0 },
  })],
  materialIndices: [0, 0, 0],
};

const parsed = validAsset(base);
assert.ok(parsed);
assert.deepEqual(parsed?.uvs, base.uvs);
assert.deepEqual(parsed?.materialIndices, base.materialIndices);
assert.equal(parsed?.materials?.[0].name, 'Leather');
assert.equal(parsed?.materials?.[0].textures.baseColor?.textureIndex, 2);

assert.equal(validAsset({ ...base, uvs: [0, 0] }), null);
assert.equal(validAsset({ ...base, materialIndices: [0, 0] }), null);
assert.equal(validAsset({ ...base, materialIndices: [1, 1, 1] }), null);

// Older library records remain valid without the new optional attributes.
const legacy = { ...base };
delete (legacy as Partial<typeof base>).uvs;
delete (legacy as Partial<typeof base>).materials;
delete (legacy as Partial<typeof base>).materialIndices;
const oldRecord = validAsset(legacy);
assert.ok(oldRecord);
assert.equal(oldRecord?.uvs, undefined);
assert.equal(oldRecord?.materials, undefined);

const withoutMetadata = decodedAssetBytes(oldRecord!);
const withMetadata = decodedAssetBytes(parsed!);
assert.ok(withMetadata > withoutMetadata);

console.log('BUILD 1115 custom asset preservation: 10 assertions passed');
