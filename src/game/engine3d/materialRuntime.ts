/**
 * BUILD 1114 — glTF/PBR material and texture runtime contract.
 *
 * Keeps material factors, texture slots, UV-set selection and KHR_texture_transform
 * intact between asset decoding and the renderer. This module is pure so the
 * importer can be tested without a WebGL context.
 */
export type TextureWrap = 'repeat' | 'clamp' | 'mirror';
export type AlphaMode = 'OPAQUE' | 'MASK' | 'BLEND';

export interface TextureTransform {
  offset: [number, number];
  rotation: number;
  scale: [number, number];
  texCoord?: number;
}

export interface TextureSlot {
  textureIndex: number;
  texCoord: number;
  transform?: TextureTransform;
  scale?: number;
}

export interface PbrMaterialInput {
  name?: string;
  baseColorFactor?: number[];
  metallicFactor?: number;
  roughnessFactor?: number;
  emissiveFactor?: number[];
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  baseColorTexture?: TextureSlot;
  metallicRoughnessTexture?: TextureSlot;
  normalTexture?: TextureSlot;
  occlusionTexture?: TextureSlot;
  emissiveTexture?: TextureSlot;
}

export interface RuntimePbrMaterial {
  name: string;
  baseColor: [number, number, number, number];
  metallic: number;
  roughness: number;
  emissive: [number, number, number];
  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
  textures: {
    baseColor?: TextureSlot;
    metallicRoughness?: TextureSlot;
    normal?: TextureSlot;
    occlusion?: TextureSlot;
    emissive?: TextureSlot;
  };
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function vector<T extends number[]>(value: number[] | undefined, size: number, fallback: T): T {
  if (!value || value.length < size) return [...fallback] as T;
  return value.slice(0, size).map(v => clamp(v, 0, 1)) as T;
}

function cloneSlot(slot?: TextureSlot): TextureSlot | undefined {
  if (!slot || !Number.isInteger(slot.textureIndex) || slot.textureIndex < 0) return undefined;
  const transform = slot.transform;
  return {
    textureIndex: slot.textureIndex,
    texCoord: Math.max(0, Math.trunc(slot.texCoord ?? 0)),
    ...(Number.isFinite(slot.scale) ? { scale: slot.scale } : {}),
    ...(transform ? { transform: {
      offset: [transform.offset[0], transform.offset[1]],
      rotation: Number.isFinite(transform.rotation) ? transform.rotation : 0,
      scale: [transform.scale[0], transform.scale[1]],
      ...(Number.isInteger(transform.texCoord) ? { texCoord: transform.texCoord } : {}),
    } } : {}),
  };
}

/** Normalize glTF metallic-roughness material values without losing texture slots. */
export function normalizePbrMaterial(input: PbrMaterialInput = {}): RuntimePbrMaterial {
  const alphaMode = input.alphaMode === 'MASK' || input.alphaMode === 'BLEND'
    ? input.alphaMode : 'OPAQUE';
  return {
    name: input.name?.trim() || 'Material',
    baseColor: vector(input.baseColorFactor, 4, [1, 1, 1, 1]),
    metallic: clamp(input.metallicFactor ?? 1, 0, 1),
    roughness: clamp(input.roughnessFactor ?? 1, 0, 1),
    emissive: vector(input.emissiveFactor, 3, [0, 0, 0]),
    alphaMode,
    alphaCutoff: clamp(input.alphaCutoff ?? 0.5, 0, 1),
    doubleSided: input.doubleSided === true,
    textures: {
      baseColor: cloneSlot(input.baseColorTexture),
      metallicRoughness: cloneSlot(input.metallicRoughnessTexture),
      normal: cloneSlot(input.normalTexture),
      occlusion: cloneSlot(input.occlusionTexture),
      emissive: cloneSlot(input.emissiveTexture),
    },
  };
}

export interface ResolvedTextureSource {
  uri: string;
  kind: 'data' | 'external' | 'absolute';
}

/**
 * Resolve glTF image URIs. Data URIs remain byte-source strings; relative paths
 * resolve against the asset URL; javascript: and other executable schemes fail closed.
 */
export function resolveTextureSource(uri: string, assetUrl: string): ResolvedTextureSource {
  const value = uri.trim();
  if (!value) throw new Error('texture URI is empty');
  if (/^data:/i.test(value)) return { uri: value, kind: 'data' };
  if (/^(javascript|vbscript):/i.test(value)) throw new Error('unsafe texture URI scheme');
  const resolved = new URL(value, assetUrl);
  if (!['http:', 'https:', 'blob:', 'file:'].includes(resolved.protocol)) {
    throw new Error(`unsupported texture URI scheme: ${resolved.protocol}`);
  }
  return {
    uri: resolved.href,
    kind: /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? 'absolute' : 'external',
  };
}

/** UV transform in glTF order: scale, then rotation, then offset. */
export function transformTextureUv(
  uv: [number, number],
  transform: TextureTransform = { offset: [0, 0], rotation: 0, scale: [1, 1] },
): [number, number] {
  const x = uv[0] * transform.scale[0];
  const y = uv[1] * transform.scale[1];
  const c = Math.cos(transform.rotation), s = Math.sin(transform.rotation);
  return [
    c * x - s * y + transform.offset[0],
    s * x + c * y + transform.offset[1],
  ];
}
