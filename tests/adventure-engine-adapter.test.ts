import assert from 'node:assert/strict';
import {
  createAdventureEngineSession,
  restoreAdventureWorldSession,
  syncAdventureWorldSession,
} from '../src/game/engine/adventureWorldAdapter';
import {
  deserializeEngineProject,
  serializeEngineProject,
} from '../src/game/engine/engineCore';
import { WorldCore } from '../src/game/worldCore';

const liveWorld = new WorldCore(20261124);
liveWorld.advance(4);
liveWorld.random();
const created = createAdventureEngineSession(liveWorld, 'Mosslight Test World');
assert.equal(created.ok, true);
if (!created.ok) throw new Error(created.error);
let session = created.value;

const worldEntity = session.project.scenes[0].entities.find((entity) => entity.id === session.worldEntityId);
assert.ok(worldEntity);
assert.equal(worldEntity.components[0].type, 'adventure.world-core');

// Advancing the actual WorldCore then syncing updates the existing component,
// rather than adding a second clock or a duplicate component.
liveWorld.advance(3);
liveWorld.random();
const synced = syncAdventureWorldSession(session, liveWorld);
assert.equal(synced.ok, true);
if (!synced.ok) throw new Error(synced.error);
session = synced.value;
assert.equal(
  session.project.scenes[0].entities[0].components.filter((item) => item.type === 'adventure.world-core').length,
  1,
);

// Save the project as JSON, reload it, and restore the original simulation.
const decoded = deserializeEngineProject(serializeEngineProject(session.project));
assert.equal(decoded.ok, true);
if (!decoded.ok) throw new Error(decoded.error);
session = { ...session, project: decoded.value };

const restoredWorld = new WorldCore(20261124);
const restored = restoreAdventureWorldSession(session, restoredWorld);
assert.equal(restored.ok, true);
if (!restored.ok) throw new Error(restored.error);
assert.deepEqual(restored.value, liveWorld.getState());
assert.equal(restoredWorld.random(), liveWorld.random(), 'restored RNG must continue the same sequence');

// Wrong world seeds are rejected by the authoritative WorldCore.
const wrongWorld = new WorldCore(9);
assert.equal(restoreAdventureWorldSession(session, wrongWorld).ok, false);

console.log('Adventure engine adapter tests passed (WorldCore snapshot, sync, project JSON save/load, restore, RNG continuity).');
