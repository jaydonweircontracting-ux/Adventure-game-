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
  if (!entity.active) return null;
  const component = entity.components.find((item) =>
    item.type === 'adventure.mesh-asset' && item.version === 1 && item.enabled
    && item.data.visible !== false && typeof item.data.assetId === 'string');
  if (!component || typeof component.data.assetId !== 'string') return null;
  const asset = assets.find((item) => item.id === component.data.assetId);
  return asset ? {
    entityId: entity.id,
    parentId: entity.parentId,
    name: entity.name,
    transform: entity.transform,
    asset,
  } : null;
}
