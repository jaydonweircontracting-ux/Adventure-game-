import assert from 'node:assert/strict';
import { buildEngineMeshInstances, buildEngineMeshVertexData, resolveEngineMeshInstance } from '../src/game/engine/engineAssetBridge';
import { createEngineEntity, createEngineProject, addEngineComponent, type EngineEntity } from '../src/game/engine/engineCore';
import type { CustomAsset } from '../src/game/engine3d/customAssets';

const asset: CustomAsset = {
  id: 'model-house-1',
  name: 'Stone House',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  colors: [1, 0, 0, 1, 0, 0, 1, 0, 0],
  indices: [0, 1, 2],
  width: 1,
  height: 1,
  avgColor: [1, 0, 0],
  format: 'glb',
};

let project = createEngineProject('Asset Bridge Test', 'asset-bridge-test');
const sceneId = project.activeSceneId;
const created = createEngineEntity(project, sceneId, 'House');
assert.equal(created.ok, true);
if (!created.ok) throw new Error(created.error);
project = created.value;
const entityId = project.scenes[0].entities[0].id;
const attached = addEngineComponent(project, sceneId, entityId, {
  type: 'adventure.mesh-asset',
  version: 1,
  enabled: true,
  data: { assetId: asset.id, assetName: asset.name, format: 'glb', visible: true },
});
assert.equal(attached.ok, true);
if (!attached.ok) throw new Error(attached.error);
project = attached.value;

const instances = buildEngineMeshInstances(project, sceneId, [asset]);
assert.equal(instances.length, 1);
assert.equal(instances[0].entityId, entityId);
assert.equal(instances[0].asset, asset, 'bridge returns the stored geometry by reference, not a duplicate');
assert.equal(instances[0].asset.indices.length, 3);
const meshData = buildEngineMeshVertexData(instances);
assert.equal(meshData.length, 18, 'one indexed triangle expands to three interleaved XYZ/RGB vertices');
assert.deepEqual(Array.from(meshData.slice(0, 6)), [0, 0, 0, 1, 0, 0]);
assert.deepEqual(Array.from(meshData.slice(6, 12)), [1, 0, 0, 1, 0, 0]);
assert.deepEqual(Array.from(meshData.slice(12, 18)), [0, 1, 0, 1, 0, 0]);

const missingAsset = buildEngineMeshInstances(project, sceneId, []);
assert.equal(missingAsset.length, 0, 'missing library references are skipped safely');
const entity = project.scenes[0].entities[0];
assert.equal(resolveEngineMeshInstance(entity, [asset])?.asset.id, asset.id);
const disabledEntity: EngineEntity = {
  ...entity,
  components: entity.components.map((component) => ({ ...component, enabled: false })),
};
assert.equal(resolveEngineMeshInstance(disabledEntity, [asset]), null);
const hiddenEntity: EngineEntity = {
  ...entity,
  components: entity.components.map((component) => ({ ...component, data: { ...component.data, visible: false } })),
};
assert.equal(resolveEngineMeshInstance(hiddenEntity, [asset]), null);

console.log('Engine asset bridge tests passed (stable references, geometry resolution, visibility and missing-asset handling).');
