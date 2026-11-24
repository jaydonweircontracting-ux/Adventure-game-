/**
 * Adventure Engine Core — first reusable scene/entity vertical slice.
 *
 * This module is deliberately renderer-agnostic and has no browser/storage
 * dependencies. It provides a small, versioned, serializable project model
 * that future editor and runtime systems can build on without replacing the
 * existing Adventure world or its save formats.
 */

export const ENGINE_PROJECT_SCHEMA_VERSION = 1;
export const ENGINE_RUNTIME_VERSION = '0.1.0';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type Transform3D = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type EngineComponent = {
  type: string;
  version: number;
  enabled: boolean;
  data: Record<string, JsonValue>;
};

export type EngineEntity = {
  id: string;
  name: string;
  parentId: string | null;
  active: boolean;
  transform: Transform3D;
  components: EngineComponent[];
};

export type EngineScene = {
  id: string;
  name: string;
  active: boolean;
  entities: EngineEntity[];
};

export type EnginePrefab = {
  id: string;
  name: string;
  rootEntityId: string;
  entities: EngineEntity[];
};

export type EnginePrefabInstantiation = {
  project: EngineProject;
  rootEntityId: string;
};

export type EngineProject = {
  schemaVersion: typeof ENGINE_PROJECT_SCHEMA_VERSION;
  runtimeVersion: string;
  id: string;
  name: string;
  activeSceneId: string;
  nextId: number;
  scenes: EngineScene[];
  prefabs?: EnginePrefab[];
};

export type EngineResult<T> = { ok: true; value: T } | { ok: false; error: string };

const identityTransform = (): Transform3D => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cleanName(value: string, fallback: string): string {
  const name = value.trim();
  return name || fallback;
}

function isFiniteTuple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, depth + 1));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .every((entry) => isJsonValue(entry, depth + 1));
  }
  return false;
}

export function createEngineProject(name = 'Untitled Project', id = 'adventure-project'): EngineProject {
  const projectId = cleanName(id, 'adventure-project');
  const scene: EngineScene = {
    id: projectId + '-scene-1',
    name: 'Main Scene',
    active: true,
    entities: [],
  };
  return {
    schemaVersion: ENGINE_PROJECT_SCHEMA_VERSION,
    runtimeVersion: ENGINE_RUNTIME_VERSION,
    id: projectId,
    name: cleanName(name, 'Untitled Project'),
    activeSceneId: scene.id,
    nextId: 1,
    scenes: [scene],
    prefabs: [],
  };
}

export function createEngineScene(project: EngineProject, name = 'New Scene'): EngineResult<EngineProject> {
  const id = project.id + '-scene-' + project.nextId;
  if (project.scenes.some((scene) => scene.id === id)) {
    return { ok: false, error: 'Engine scene ID collision: ' + id };
  }
  const scene: EngineScene = {
    id,
    name: cleanName(name, 'New Scene'),
    active: true,
    entities: [],
  };
  return {
    ok: true,
    value: {
      ...project,
      nextId: project.nextId + 1,
      scenes: [...project.scenes.map((item) => ({ ...item, active: false })), scene],
      activeSceneId: id,
    },
  };
}

export function setActiveScene(project: EngineProject, sceneId: string): EngineResult<EngineProject> {
  if (!project.scenes.some((scene) => scene.id === sceneId)) {
    return { ok: false, error: 'Scene not found: ' + sceneId };
  }
  return {
    ok: true,
    value: {
      ...project,
      activeSceneId: sceneId,
      scenes: project.scenes.map((scene) => ({ ...scene, active: scene.id === sceneId })),
    },
  };
}

export function renameEngineScene(
  project: EngineProject,
  sceneId: string,
  name: string,
): EngineResult<EngineProject> {
  const clean = cleanName(name, 'Untitled Scene');
  if (!project.scenes.some((scene) => scene.id === sceneId)) {
    return { ok: false, error: 'Scene not found: ' + sceneId };
  }
  return {
    ok: true,
    value: {
      ...project,
      scenes: project.scenes.map((scene) => scene.id === sceneId ? { ...scene, name: clean } : scene),
    },
  };
}

export function renameEngineEntity(
  project: EngineProject,
  sceneId: string,
  entityId: string,
  name: string,
): EngineResult<EngineProject> {
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  if (!scene.entities.some((entity) => entity.id === entityId)) {
    return { ok: false, error: 'Entity not found: ' + entityId };
  }
  const clean = cleanName(name, 'Entity');
  return {
    ok: true,
    value: {
      ...project,
      scenes: project.scenes.map((item) => item.id === sceneId
        ? { ...item, entities: item.entities.map((entity) => entity.id === entityId ? { ...entity, name: clean } : entity) }
        : item),
    },
  };
}

export function createEngineEntity(
  project: EngineProject,
  sceneId: string,
  name = 'Entity',
  parentId: string | null = null,
): EngineResult<EngineProject> {
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  if (parentId !== null && !scene.entities.some((entity) => entity.id === parentId)) {
    return { ok: false, error: 'Parent entity not found: ' + parentId };
  }
  const id = project.id + '-entity-' + project.nextId;
  const entity: EngineEntity = {
    id,
    name: cleanName(name, 'Entity'),
    parentId,
    active: true,
    transform: identityTransform(),
    components: [],
  };
  return {
    ok: true,
    value: {
      ...project,
      nextId: project.nextId + 1,
      scenes: project.scenes.map((item) => item.id === sceneId
        ? { ...item, entities: [...item.entities, entity] }
        : item),
    },
  };
}

export function updateEntityTransform(
  project: EngineProject,
  sceneId: string,
  entityId: string,
  transform: Transform3D,
): EngineResult<EngineProject> {
  if (!isFiniteTuple(transform.position) || !isFiniteTuple(transform.rotation) || !isFiniteTuple(transform.scale)) {
    return { ok: false, error: 'Transform values must be three finite numbers' };
  }
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  if (!scene.entities.some((entity) => entity.id === entityId)) {
    return { ok: false, error: 'Entity not found: ' + entityId };
  }
  return {
    ok: true,
    value: {
      ...project,
      scenes: project.scenes.map((item) => item.id === sceneId
        ? {
          ...item,
          entities: item.entities.map((entity) => entity.id === entityId
            ? { ...entity, transform: cloneJson(transform) }
            : entity),
        }
        : item),
    },
  };
}

export function addEngineComponent(
  project: EngineProject,
  sceneId: string,
  entityId: string,
  component: EngineComponent,
): EngineResult<EngineProject> {
  if (!component.type.trim() || !Number.isInteger(component.version) || component.version < 1) {
    return { ok: false, error: 'Component type and positive integer version are required' };
  }
  if (!component.data || typeof component.data !== 'object' || Array.isArray(component.data)
    || !isJsonValue(component.data)) {
    return { ok: false, error: 'Component data must be a JSON object with finite values' };
  }
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  if (!scene.entities.some((entity) => entity.id === entityId)) {
    return { ok: false, error: 'Entity not found: ' + entityId };
  }
  return {
    ok: true,
    value: {
      ...project,
      scenes: project.scenes.map((item) => item.id === sceneId
        ? {
          ...item,
          entities: item.entities.map((entity) => entity.id === entityId
            ? { ...entity, components: [...entity.components, cloneJson(component)] }
            : entity),
        }
        : item),
    },
  };
}

/** Replace a component by type, or append it when it is not present. */
export function upsertEngineComponent(
  project: EngineProject,
  sceneId: string,
  entityId: string,
  component: EngineComponent,
): EngineResult<EngineProject> {
  if (!component.type.trim() || !Number.isInteger(component.version) || component.version < 1) {
    return { ok: false, error: 'Component type and positive integer version are required' };
  }
  if (!component.data || typeof component.data !== 'object' || Array.isArray(component.data)
    || !isJsonValue(component.data)) {
    return { ok: false, error: 'Component data must be a JSON object with finite values' };
  }
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  if (!scene.entities.some((entity) => entity.id === entityId)) {
    return { ok: false, error: 'Entity not found: ' + entityId };
  }
  const copied = cloneJson(component);
  return {
    ok: true,
    value: {
      ...project,
      scenes: project.scenes.map((item) => item.id === sceneId
        ? {
          ...item,
          entities: item.entities.map((entity) => entity.id === entityId
            ? {
              ...entity,
              components: entity.components.some((entry) => entry.type === component.type)
                ? entity.components.map((entry) => entry.type === component.type ? copied : entry)
                : [...entity.components, copied],
            }
            : entity),
        }
        : item),
    },
  };
}

export function updateEngineComponent(
  project: EngineProject,
  sceneId: string,
  entityId: string,
  componentIndex: number,
  component: EngineComponent,
): EngineResult<EngineProject> {
  if (!component.type.trim() || !Number.isInteger(component.version) || component.version < 1
    || !component.data || typeof component.data !== 'object' || Array.isArray(component.data)
    || !isJsonValue(component.data)) {
    return { ok: false, error: 'Component type, version and JSON data are invalid' };
  }
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  const entity = scene.entities.find((item) => item.id === entityId);
  if (!entity) return { ok: false, error: 'Entity not found: ' + entityId };
  if (!Number.isInteger(componentIndex) || componentIndex < 0 || componentIndex >= entity.components.length) {
    return { ok: false, error: 'Component index is out of range' };
  }
  const components = entity.components.map((item, index) => index === componentIndex ? cloneJson(component) : item);
  return {
    ok: true,
    value: {
      ...project,
      scenes: project.scenes.map((item) => item.id === sceneId
        ? { ...item, entities: item.entities.map((entry) => entry.id === entityId ? { ...entry, components } : entry) }
        : item),
    },
  };
}

export function removeEngineComponent(
  project: EngineProject,
  sceneId: string,
  entityId: string,
  componentIndex: number,
): EngineResult<EngineProject> {
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  const entity = scene.entities.find((item) => item.id === entityId);
  if (!entity) return { ok: false, error: 'Entity not found: ' + entityId };
  if (!Number.isInteger(componentIndex) || componentIndex < 0 || componentIndex >= entity.components.length) {
    return { ok: false, error: 'Component index is out of range' };
  }
  return {
    ok: true,
    value: {
      ...project,
      scenes: project.scenes.map((item) => item.id === sceneId
        ? { ...item, entities: item.entities.map((entry) => entry.id === entityId
          ? { ...entry, components: entry.components.filter((_, index) => index !== componentIndex) }
          : entry) }
        : item),
    },
  };
}

export function removeEngineEntity(
  project: EngineProject,
  sceneId: string,
  entityId: string,
): EngineResult<EngineProject> {
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  if (!scene.entities.some((entity) => entity.id === entityId)) {
    return { ok: false, error: 'Entity not found: ' + entityId };
  }
  const removed = new Set([entityId]);
  let changed = true;
  while (changed) {
    changed = false;
    scene.entities.forEach((entity) => {
      if (entity.parentId && removed.has(entity.parentId) && !removed.has(entity.id)) {
        removed.add(entity.id);
        changed = true;
      }
    });
  }
  return {
    ok: true,
    value: {
      ...project,
      scenes: project.scenes.map((item) => item.id === sceneId
        ? { ...item, entities: item.entities.filter((entity) => !removed.has(entity.id)) }
        : item),
    },
  };
}

/**
 * Capture an entity and all descendants as a reusable prefab template.
 * Child transforms remain local to their parent; the selected root is detached.
 */
export function createEnginePrefab(
  project: EngineProject,
  sceneId: string,
  entityId: string,
  name?: string,
): EngineResult<EngineProject> {
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  const root = scene.entities.find((item) => item.id === entityId);
  if (!root) return { ok: false, error: 'Entity not found: ' + entityId };
  const included = new Set<string>([entityId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entity of scene.entities) {
      if (entity.parentId && included.has(entity.parentId) && !included.has(entity.id)) {
        included.add(entity.id);
        changed = true;
      }
    }
  }
  const entities = scene.entities.filter((entity) => included.has(entity.id)).map((entity) => ({
    ...cloneJson(entity),
    parentId: entity.id === entityId ? null : entity.parentId,
  }));
  const prefab: EnginePrefab = {
    id: project.id + '-prefab-' + project.nextId,
    name: cleanName(name ?? root.name, 'Prefab'),
    rootEntityId: entityId,
    entities,
  };
  return { ok: true, value: { ...project, nextId: project.nextId + 1, prefabs: [...(project.prefabs ?? []), prefab] } };
}

export function renameEnginePrefab(project: EngineProject, prefabId: string, name: string): EngineResult<EngineProject> {
  if (!(project.prefabs ?? []).some((prefab) => prefab.id === prefabId)) return { ok: false, error: 'Prefab not found: ' + prefabId };
  return { ok: true, value: { ...project, prefabs: (project.prefabs ?? []).map((prefab) =>
    prefab.id === prefabId ? { ...prefab, name: cleanName(name, 'Prefab') } : prefab) } };
}

export function removeEnginePrefab(project: EngineProject, prefabId: string): EngineResult<EngineProject> {
  if (!(project.prefabs ?? []).some((prefab) => prefab.id === prefabId)) return { ok: false, error: 'Prefab not found: ' + prefabId };
  return { ok: true, value: { ...project, prefabs: (project.prefabs ?? []).filter((prefab) => prefab.id !== prefabId) } };
}

/** Instantiate a prefab with fresh IDs; the supplied position offsets its root. */
export function instantiateEnginePrefab(
  project: EngineProject,
  sceneId: string,
  prefabId: string,
  position: [number, number, number] = [0, 0, 0],
): EngineResult<EnginePrefabInstantiation> {
  if (!isFiniteTuple(position)) return { ok: false, error: 'Prefab placement position must contain three finite numbers' };
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: 'Scene not found: ' + sceneId };
  const prefab = (project.prefabs ?? []).find((item) => item.id === prefabId);
  if (!prefab) return { ok: false, error: 'Prefab not found: ' + prefabId };
  if (!prefab.entities.some((entity) => entity.id === prefab.rootEntityId)) return { ok: false, error: 'Prefab root entity is missing' };
  const idMap = new Map<string, string>();
  let nextId = project.nextId;
  for (const entity of prefab.entities) { idMap.set(entity.id, project.id + '-entity-' + nextId); nextId += 1; }
  const copies = prefab.entities.map((entity) => {
    const isRoot = entity.id === prefab.rootEntityId;
    const transform = cloneJson(entity.transform);
    if (isRoot) transform.position = [
      transform.position[0] + position[0], transform.position[1] + position[1], transform.position[2] + position[2],
    ];
    return {
      ...cloneJson(entity),
      id: idMap.get(entity.id)!,
      parentId: entity.parentId === null ? null : idMap.get(entity.parentId) ?? null,
      transform,
    };
  });
  const rootEntityId = idMap.get(prefab.rootEntityId)!;
  return {
    ok: true,
    value: {
      project: { ...project, nextId, scenes: project.scenes.map((item) => item.id === sceneId
        ? { ...item, entities: [...item.entities, ...copies] } : item) },
      rootEntityId,
    },
  };
}

export function serializeEngineProject(project: EngineProject): string {
  const validation = validateEngineProject(project);
  if (!validation.ok) throw new Error(validation.error);
  return JSON.stringify(project, null, 2);
}

export function deserializeEngineProject(source: string): EngineResult<EngineProject> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, error: 'Project file is not valid JSON' };
  }
  const validation = validateEngineProject(parsed);
  if (!validation.ok) return validation;
  return { ok: true, value: cloneJson(validation.value) };
}

export function validateEngineProject(value: unknown): EngineResult<EngineProject> {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Project must be an object' };
  const project = value as Partial<EngineProject>;
  if (project.schemaVersion !== ENGINE_PROJECT_SCHEMA_VERSION) {
    return { ok: false, error: 'Unsupported engine project schema version' };
  }
  if (typeof project.id !== 'string' || !project.id.trim()
    || typeof project.name !== 'string' || !project.name.trim()
    || typeof project.runtimeVersion !== 'string'
    || !Number.isInteger(project.nextId) || (project.nextId ?? 0) < 1
    || !Array.isArray(project.scenes) || project.scenes.length === 0) {
    return { ok: false, error: 'Project metadata or scenes are invalid' };
  }
  if (project.prefabs !== undefined && !Array.isArray(project.prefabs)) return { ok: false, error: 'Project prefabs must be an array' };
  const prefabIds = new Set<string>();
  for (const prefab of project.prefabs ?? []) {
    if (!prefab || typeof prefab.id !== 'string' || !prefab.id.trim() || prefabIds.has(prefab.id)
      || typeof prefab.name !== 'string' || !prefab.name.trim() || typeof prefab.rootEntityId !== 'string'
      || !Array.isArray(prefab.entities) || prefab.entities.length === 0) {
      return { ok: false, error: 'Prefab metadata is invalid or duplicated' };
    }
    prefabIds.add(prefab.id);
    const ids = new Set(prefab.entities.map((entity) => entity?.id));
    if (!ids.has(prefab.rootEntityId)) return { ok: false, error: 'Prefab root entity does not exist' };
    for (const entity of prefab.entities) {
      if (!entity || typeof entity.id !== 'string' || !entity.id.trim() || typeof entity.name !== 'string' || !entity.name.trim()
        || typeof entity.active !== 'boolean' || !isFiniteTuple(entity.transform?.position)
        || !isFiniteTuple(entity.transform?.rotation) || !isFiniteTuple(entity.transform?.scale)
        || !Array.isArray(entity.components) || (entity.parentId !== null && !ids.has(entity.parentId))) {
        return { ok: false, error: 'Prefab entity data is invalid' };
      }
    }
  }
  const sceneIds = new Set<string>();
  const entityIds = new Set<string>();
  for (const scene of project.scenes) {
    if (!scene || typeof scene.id !== 'string' || !scene.id.trim()
      || typeof scene.name !== 'string' || !scene.name.trim()
      || typeof scene.active !== 'boolean' || !Array.isArray(scene.entities)
      || sceneIds.has(scene.id)) {
      return { ok: false, error: 'Scene metadata is invalid or duplicated' };
    }
    sceneIds.add(scene.id);
    for (const entity of scene.entities) {
      if (!entity || typeof entity.id !== 'string' || !entity.id.trim()
        || typeof entity.name !== 'string' || !entity.name.trim()
        || typeof entity.active !== 'boolean'
        || !isFiniteTuple(entity.transform?.position)
        || !isFiniteTuple(entity.transform?.rotation)
        || !isFiniteTuple(entity.transform?.scale)
        || !Array.isArray(entity.components)
        || entityIds.has(entity.id)) {
        return { ok: false, error: 'Entity metadata or transform is invalid' };
      }
      entityIds.add(entity.id);
      for (const component of entity.components) {
        if (!component || typeof component.type !== 'string' || !component.type.trim()
          || !Number.isInteger(component.version) || component.version < 1
          || typeof component.enabled !== 'boolean'
          || !component.data || typeof component.data !== 'object' || Array.isArray(component.data)
          || !isJsonValue(component.data)) {
          return { ok: false, error: 'Entity component is invalid' };
        }
      }
    }
  }
  if (!sceneIds.has(project.activeSceneId ?? '')) {
    return { ok: false, error: 'Active scene does not exist' };
  }
  if (project.scenes.filter((scene) => scene.active).length !== 1
    || !project.scenes.some((scene) => scene.id === project.activeSceneId && scene.active)) {
    return { ok: false, error: 'Exactly the active scene must be marked active' };
  }
  for (const scene of project.scenes) {
    const entitiesById = new Map(scene.entities.map((entity) => [entity.id, entity]));
    for (const entity of scene.entities) {
      if (entity.parentId !== null && !entitiesById.has(entity.parentId)) {
        return { ok: false, error: 'Entity parent must exist in the same scene' };
      }
      const ancestors = new Set<string>([entity.id]);
      let parentId = entity.parentId;
      while (parentId !== null) {
        if (ancestors.has(parentId)) return { ok: false, error: 'Entity hierarchy contains a cycle' };
        ancestors.add(parentId);
        parentId = entitiesById.get(parentId)?.parentId ?? null;
      }
    }
  }
  return { ok: true, value: project as EngineProject };
}
