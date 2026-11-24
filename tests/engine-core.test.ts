import assert from 'node:assert/strict';
import {
  addEngineComponent,
  createEngineEntity,
  createEngineProject,
  createEngineScene,
  deserializeEngineProject,
  removeEngineEntity,
  renameEngineEntity,
  renameEngineScene,
  serializeEngineProject,
  setActiveScene,
  updateEngineComponent,
  removeEngineComponent,
  updateEntityTransform,
  validateEngineProject,
} from '../src/game/engine/engineCore';

let project = createEngineProject('Engine Core Test', 'engine-core-test');
const original = project;
const firstSceneId = project.activeSceneId;

// Scene creation switches the active scene without mutating the old project.
const sceneResult = createEngineScene(project, 'Forest');
assert.equal(sceneResult.ok, true);
if (!sceneResult.ok) throw new Error(sceneResult.error);
project = sceneResult.value;
assert.equal(project.scenes.find((scene) => scene.id === firstSceneId)?.active, false);
assert.equal(project.scenes.find((scene) => scene.id === project.activeSceneId)?.active, true);
assert.equal(original.scenes.length, 1, 'project operations must be immutable');

// Scene switching validates IDs and maintains one active scene.
const switchResult = setActiveScene(project, firstSceneId);
assert.equal(switchResult.ok, true);
if (!switchResult.ok) throw new Error(switchResult.error);
project = switchResult.value;
assert.equal(project.activeSceneId, firstSceneId);
assert.equal(project.scenes.filter((scene) => scene.active).length, 1);

// Entity creation supports parent-child hierarchy with stable IDs.
const parentResult = createEngineEntity(project, firstSceneId, 'Player');
assert.equal(parentResult.ok, true);
if (!parentResult.ok) throw new Error(parentResult.error);
project = parentResult.value;
const parentId = project.scenes[0].entities[0].id;

const childResult = createEngineEntity(project, firstSceneId, 'Camera', parentId);
assert.equal(childResult.ok, true);
if (!childResult.ok) throw new Error(childResult.error);
project = childResult.value;
const childId = project.scenes[0].entities[1].id;
assert.notEqual(parentId, childId);
assert.equal(project.scenes[0].entities[1].parentId, parentId);

// Transform updates and versioned component data are validated and immutable.
const moved = updateEntityTransform(project, firstSceneId, parentId, {
  position: [4, 2, -3],
  rotation: [0, 1.5, 0],
  scale: [1, 1, 1],
});
assert.equal(moved.ok, true);
if (!moved.ok) throw new Error(moved.error);
project = moved.value;
assert.deepEqual(project.scenes[0].entities[0].transform.position, [4, 2, -3]);

const withComponent = addEngineComponent(project, firstSceneId, parentId, {
  type: 'adventure.player-controller',
  version: 1,
  enabled: true,
  data: { walkSpeed: 4.5, canSprint: true, tags: ['player', 'hero'] },
});
assert.equal(withComponent.ok, true);
if (!withComponent.ok) throw new Error(withComponent.error);
project = withComponent.value;
assert.equal(project.scenes[0].entities[0].components[0].type, 'adventure.player-controller');

// Scene/entity rename operations preserve stable IDs and immutable history.
const renamedScene = renameEngineScene(project, firstSceneId, 'Starting Village');
assert.equal(renamedScene.ok, true);
if (!renamedScene.ok) throw new Error(renamedScene.error);
assert.equal(renamedScene.value.scenes[0].id, firstSceneId);
assert.equal(renamedScene.value.scenes[0].name, 'Starting Village');
const renamedEntity = renameEngineEntity(renamedScene.value, firstSceneId, parentId, 'Hero');
assert.equal(renamedEntity.ok, true);
if (!renamedEntity.ok) throw new Error(renamedEntity.error);
assert.equal(renamedEntity.value.scenes[0].entities[0].name, 'Hero');
assert.equal(project.scenes[0].entities[0].name, 'Player', 'rename must not mutate prior project snapshots');

// Component inspector operations update, disable and remove by stable slot.
const editedComponent = updateEngineComponent(project, firstSceneId, parentId, 0, {
  type: 'adventure.player-controller',
  version: 2,
  enabled: false,
  data: { walkSpeed: 6, canSprint: false },
});
assert.equal(editedComponent.ok, true);
if (!editedComponent.ok) throw new Error(editedComponent.error);
assert.equal(editedComponent.value.scenes[0].entities[0].components[0].version, 2);
assert.equal(editedComponent.value.scenes[0].entities[0].components[0].enabled, false);
assert.deepEqual(editedComponent.value.scenes[0].entities[0].components[0].data, { walkSpeed: 6, canSprint: false });
const componentRemoved = removeEngineComponent(editedComponent.value, firstSceneId, parentId, 0);
assert.equal(componentRemoved.ok, true);
if (!componentRemoved.ok) throw new Error(componentRemoved.error);
assert.equal(componentRemoved.value.scenes[0].entities[0].components.length, 0);
assert.equal(removeEngineComponent(project, firstSceneId, parentId, 9).ok, false);

// Project files round-trip through JSON without losing hierarchy or data.
const serialized = serializeEngineProject(project);
const loaded = deserializeEngineProject(serialized);
assert.equal(loaded.ok, true);
if (!loaded.ok) throw new Error(loaded.error);
assert.deepEqual(loaded.value, project);

// Invalid input is rejected: malformed JSON, unsupported schema, non-finite
// transforms, missing parents, duplicate IDs and hierarchy cycles.
assert.equal(deserializeEngineProject('{not json').ok, false);
assert.equal(validateEngineProject({ ...project, schemaVersion: 99 }).ok, false);

const invalidTransform = structuredClone(project);
invalidTransform.scenes[0].entities[0].transform.position[0] = Number.NaN;
assert.equal(validateEngineProject(invalidTransform).ok, false);

const cycle = structuredClone(project);
cycle.scenes[0].entities[0].parentId = childId;
assert.equal(validateEngineProject(cycle).ok, false);

const missingParent = structuredClone(project);
missingParent.scenes[0].entities[1].parentId = 'does-not-exist';
assert.equal(validateEngineProject(missingParent).ok, false);

// Removing a parent removes its descendants, preventing orphaned entities.
const removed = removeEngineEntity(project, firstSceneId, parentId);
assert.equal(removed.ok, true);
if (!removed.ok) throw new Error(removed.error);
assert.equal(removed.value.scenes[0].entities.length, 0);
assert.equal(project.scenes[0].entities.length, 2, 'removal must not mutate the source project');

// Invalid references and malformed component payloads fail without mutation.
assert.equal(createEngineEntity(project, 'missing-scene').ok, false);
assert.equal(createEngineEntity(project, firstSceneId, 'Orphan', 'missing-parent').ok, false);
assert.equal(updateEntityTransform(project, firstSceneId, parentId, {
  position: [Infinity, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
}).ok, false);
assert.equal(addEngineComponent(project, firstSceneId, parentId, {
  type: 'bad.component', version: 1, enabled: true, data: { invalid: Infinity },
}).ok, false);

console.log('Engine Core tests passed (projects, scenes, entities, hierarchy, transforms, components, validation, JSON round-trip).');
