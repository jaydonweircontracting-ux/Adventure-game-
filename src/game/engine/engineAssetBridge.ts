import type { CustomAsset } from '../engine3d/customAssets';
import type { EngineEntity, EngineProject, Transform3D } from './engineCore';

/** A resolved static-mesh instance ready for a renderer to upload/draw. */
export type EngineMeshInstance = {
  entityId: string;
  parentId: string | null;
  name: string;
  transform: Transform3D;
  asset: CustomAsset;
};

/**
 * Resolve engine mesh-asset components against the shared 3D asset library.
 * Geometry remains owned by IndexedDB; this bridge returns the original
 * vertex/index arrays without copying them into the engine project.
 */
export function buildEngineMeshInstances(
  project: EngineProject,
  sceneId: string,
  assets: readonly CustomAsset[],
): EngineMeshInstance[] {
  const scene = project.scenes.find((item) => item.id === sceneId);
  if (!scene) return [];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const instances: EngineMeshInstance[] = [];
  for (const entity of scene.entities) {
    if (!entity.active) continue;
    for (const component of entity.components) {
      if (component.type !== 'adventure.mesh-asset' || component.version !== 1 || !component.enabled) continue;
      if (component.data.visible === false || typeof component.data.assetId !== 'string') continue;
      const asset = assetsById.get(component.data.assetId);
      if (!asset) continue;
      instances.push({
        entityId: entity.id,
        parentId: entity.parentId,
        name: entity.name,
        transform: entity.transform,
        asset,
      });
    }
  }
  return instances;
}

/** Resolve a single entity's attached static mesh, if its reference is valid. */
export function resolveEngineMeshInstance(
  entity: EngineEntity,
  assets: readonly CustomAsset[],
): EngineMeshInstance | null {
  const project: EngineProject = {
    schemaVersion: 1,
    runtimeVersion: '0.1.0',
    id: 'asset-bridge',
    name: 'Asset Bridge',
    activeSceneId: 'asset-bridge-scene',
    nextId: 1,
    scenes: [{ id: 'asset-bridge-scene', name: 'Asset Bridge', active: true, entities: [entity] }],
    prefabs: [],
  };
  return buildEngineMeshInstances(project, 'asset-bridge-scene', assets)[0] ?? null;
}
