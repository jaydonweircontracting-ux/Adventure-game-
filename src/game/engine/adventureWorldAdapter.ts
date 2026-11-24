/**
 * Adapter between Adventure's existing deterministic WorldCore and the
 * reusable engine project model. It stores the authoritative existing world
 * save as a versioned component; it does not introduce a second simulation.
 */

import { WorldCore, type WorldCoreState } from '../worldCore';
import {
  createEngineEntity,
  createEngineProject,
  upsertEngineComponent,
  type EngineProject,
  type EngineResult,
  type JsonValue,
} from './engineCore';

export const ADVENTURE_WORLD_COMPONENT = 'adventure.world-core';
export const ADVENTURE_WORLD_COMPONENT_VERSION = 1;

export type AdventureEngineSession = {
  project: EngineProject;
  sceneId: string;
  worldEntityId: string;
};

function worldStateData(world: WorldCore): Record<string, JsonValue> {
  return {
    seed: world.seed,
    worldState: JSON.parse(JSON.stringify(world.getState())) as JsonValue,
  };
}

/** Create an engine project whose world component contains the real WorldCore save. */
export function createAdventureEngineSession(
  world: WorldCore,
  projectName = 'Adventure World',
): EngineResult<AdventureEngineSession> {
  let project = createEngineProject(projectName, 'adventure-world-' + world.seed);
  const sceneId = project.activeSceneId;
  const entityResult = createEngineEntity(project, sceneId, 'Adventure World');
  if (!entityResult.ok) return entityResult;
  project = entityResult.value;
  const worldEntityId = project.scenes.find((scene) => scene.id === sceneId)!.entities[0].id;
  const componentResult = upsertEngineComponent(project, sceneId, worldEntityId, {
    type: ADVENTURE_WORLD_COMPONENT,
    version: ADVENTURE_WORLD_COMPONENT_VERSION,
    enabled: true,
    data: worldStateData(world),
  });
  if (!componentResult.ok) return componentResult;
  return {
    ok: true,
    value: { project: componentResult.value, sceneId, worldEntityId },
  };
}

/** Snapshot the current Adventure simulation into its engine world component. */
export function syncAdventureWorldSession(
  session: AdventureEngineSession,
  world: WorldCore,
): EngineResult<AdventureEngineSession> {
  const componentResult = upsertEngineComponent(session.project, session.sceneId, session.worldEntityId, {
    type: ADVENTURE_WORLD_COMPONENT,
    version: ADVENTURE_WORLD_COMPONENT_VERSION,
    enabled: true,
    data: worldStateData(world),
  });
  if (!componentResult.ok) return componentResult;
  return { ok: true, value: { ...session, project: componentResult.value } };
}

/** Restore the existing WorldCore from a validated engine project component. */
export function restoreAdventureWorldSession(
  session: AdventureEngineSession,
  world: WorldCore,
): EngineResult<WorldCoreState> {
  const scene = session.project.scenes.find((item) => item.id === session.sceneId);
  const entity = scene?.entities.find((item) => item.id === session.worldEntityId);
  const component = entity?.components.find((item) => item.type === ADVENTURE_WORLD_COMPONENT);
  if (!component || component.version !== ADVENTURE_WORLD_COMPONENT_VERSION) {
    return { ok: false, error: 'Adventure WorldCore component is missing or unsupported' };
  }
  const state = component.data.worldState;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, error: 'Adventure WorldCore component has no valid save state' };
  }
  try {
    world.loadState(state as unknown as WorldCoreState);
    return { ok: true, value: world.getState() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Adventure world restore failed' };
  }
}
