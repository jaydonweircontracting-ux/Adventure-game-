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

export type EngineProject = {
  schemaVersion: typeof ENGINE_PROJECT_SCHEMA_VERSION;
  runtimeVersion: string;
  id: string;
  name: string;
  activeSceneId: string;
  nextId: number;
  scenes: EngineScene[];
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
  return { ok: true, value: cloneJson(parsed) };
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
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      if (entity.parentId !== null && !scene.entities.some((candidate) => candidate.id === entity.parentId)) {
        return { ok: false, error: 'Entity parent must exist in the same scene' };
      }
      if (entity.parentId === entity.id) return { ok: false, error: 'Entity cannot parent itself' };
    }
  }
  return { ok: true, value: project as EngineProject };
}
