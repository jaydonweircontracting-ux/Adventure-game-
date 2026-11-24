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

/**
 * Expand resolved indexed meshes into the renderer's interleaved XYZ/RGB
 * triangle stream. Entity transforms are applied in local-to-parent order.
 */
export function buildEngineMeshVertexData(instances: readonly EngineMeshInstance[]): Float32Array {
  const byId = new Map(instances.map((instance) => [instance.entityId, instance]));
  const output: number[] = [];
  const transformPoint = (point: [number, number, number], transform: Transform3D): [number, number, number] => {
    let [x, y, z] = point;
    x *= transform.scale[0]; y *= transform.scale[1]; z *= transform.scale[2];
    const [rx, ry, rz] = transform.rotation;
    let cy = Math.cos(rx), sy = Math.sin(rx);
    [y, z] = [y * cy - z * sy, y * sy + z * cy];
    cy = Math.cos(ry); sy = Math.sin(ry);
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    cy = Math.cos(rz); sy = Math.sin(rz);
    [x, y] = [x * cy - y * sy, x * sy + y * cy];
    return [x + transform.position[0], y + transform.position[1], z + transform.position[2]];
  };
  for (const instance of instances) {
    const { asset } = instance;
    if (!asset.positions.length || !asset.indices.length) continue;
    const chain: Transform3D[] = [];
    let parentId: string | null = instance.entityId;
    const seen = new Set<string>();
    while (parentId) {
      if (seen.has(parentId)) break;
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      chain.push(parent.transform);
      parentId = parent.parentId;
    }
    const colorAt = (vertex: number, channel: number): number => {
      const value = asset.colors[vertex * 3 + channel];
      return Number.isFinite(value) ? value : asset.avgColor[channel] ?? 0.7;
    };
    for (const index of asset.indices) {
      const offset = index * 3;
      if (offset < 0 || offset + 2 >= asset.positions.length) continue;
      let point: [number, number, number] = [
        asset.positions[offset], asset.positions[offset + 1], asset.positions[offset + 2],
      ];
      for (const transform of chain) point = transformPoint(point, transform);
      output.push(...point, colorAt(index, 0), colorAt(index, 1), colorAt(index, 2));
    }
  }
  return new Float32Array(output);
}
