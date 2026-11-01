// BUILD 985 — stylized grass tufts for 3D mode.
//
// Geometry: the two StayAtHomeDev meshes (MIT 2023) baked by
// scripts/bake-grass-meshes.cjs into grassMeshes.ts (150-vertex grass,
// 102-vertex grass2, both normalized to 0.55 height with v=0 at the base
// and v=1 at the tip).
//
// Colouring follows the Godot shader (grass.gdshader) literally, adapted
// to a vertex-colour renderer:
//   ALBEDO = mix(color, color2, 1.0 - UV.y) * mix(color, color2, noise)
//   noise  = texture(noise, worldPos.xz / noiseScale).rgb
// The shader's `noise` texture was never provided (0 images in either
// zip), so noise is procedural deterministic value noise over world XZ
// at the shader's scale (20.0). Colours are baked PER VERTEX (each corner
// of each triangle gets the shader formula at its own world position —
// the rasterizer interpolates across the triangle, approximating the
// shader's per-fragment sampling for these small blades).
// The shader's normal flip and PBR factors have no equivalent in the
// packed positions+colour format and are not reproduced; the renderer
// disables back-face culling globally, so blades read from both sides
// (the shader's cull_disabled).
//
// Determinism: tuft presence, mesh choice, offset, rotation and scale
// are pure functions of tile coordinates (integer hashing, exact across
// engines — same principle as townLook.ts), so a tile's tuft never jumps
// or reshuffles while panning or across window rebuilds. The noise
// lattice hash uses Math.sin, but noise feeds COLOUR only, so any
// sub-ULP engine difference would shift a blade's tint imperceptibly,
// never its structure.

import { GRASS_MESHES, type BakedGrassMesh } from './grassMeshes';
import type { IsoWorld } from '../iso/isoWorld';
import { placedCustomRects, placedHutRects, placedStallRects, placedTreeTiles } from './placements';

export type V3 = [number, number, number];

// Shader uniforms, chosen for the town's warm muted palette and the
// 983 muted-olive ground (COLORS.grass = [0.31, 0.41, 0.22]). The product
// of two mixes darkens substantially and the flat renderer has no
// lights, so the uniforms are brighter than the ground: the result spans
// roughly R 0.14-0.42, G 0.27-0.56, B 0.05-0.16 — olive with sunlit tips.
export const GRASS_COLOR: V3 = [0.65, 0.75, 0.4]; // tip (v=1)
export const GRASS_COLOR2: V3 = [0.38, 0.52, 0.22]; // base (v=0)
export const GRASS_NOISE_SCALE = 20.0;

// Fraction of eligible grass tiles carrying a natural tuft (0.05 => ~100
// tufts, ~10k triangles, in a full-grass 45x45 window). 0.12 was measured
// first (26k tris) and cost 28-44% SwiftShader FPS vs the 984 baseline,
// so the density was cut to 0.05: near-field tufts still read clearly
// (see the after-field screenshot) while the frame cost stays bounded.
// Lower this first if grass ever costs frames on a real phone
// (SwiftShader headless numbers understate it).
export const GRASS_DENSITY = 0.05;

const TAU = Math.PI * 2;

// Integer tile hash -> [0, 1). Exact across engines (Math.imul only).
export function hashTile(x: number, y: number): number {
  let h = Math.imul(x ^ 0x9e3779b9, 374761393);
  h = Math.imul(h ^ y, 668265263);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Mulberry32 stream seeded from a tile's integer hash, for the tuft's
// appearance draws in fixed order (mesh, offset x, offset z, rotation,
// scale). A placed tuft on a tile looks identical to the natural tuft
// that tile would have, because presence is a separate hash check.
function rngForTile(x: number, y: number): () => number {
  let s = (Math.imul(x ^ 0x9e3779b9, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TuftParams {
  mesh: BakedGrassMesh;
  ox: number;
  oz: number;
  rot: number;
  scale: number;
}

export function tuftParamsForTile(x: number, y: number): TuftParams {
  const r = rngForTile(x, y);
  return {
    mesh: GRASS_MESHES[r() < 0.5 ? 0 : 1],
    ox: (r() - 0.5) * 0.5,
    oz: (r() - 0.5) * 0.5,
    rot: r() * TAU,
    scale: 0.85 + r() * 0.4,
  };
}

export function naturalTuftForTile(x: number, y: number): TuftParams | null {
  if (hashTile(x, y) >= GRASS_DENSITY) return null;
  return tuftParamsForTile(x, y);
}

// Deterministic value noise over world XZ at the shader's scale.
// Lattice hash via sin (colour only — see the module header).
function lattice(ix: number, iz: number): number {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function grassNoise(wx: number, wz: number): number {
  const gx = wx / GRASS_NOISE_SCALE;
  const gz = wz / GRASS_NOISE_SCALE;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iz);
  const b = lattice(ix + 1, iz);
  const c = lattice(ix, iz + 1);
  const d = lattice(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// The shader formula, per vertex: gradient(v) * noise(worldXZ).
export function tuftColor(v: number, wx: number, wz: number): V3 {
  const n = grassNoise(wx, wz);
  return [
    clamp01(mix(GRASS_COLOR[0], GRASS_COLOR2[0], 1 - v) * mix(GRASS_COLOR[0], GRASS_COLOR2[0], n)),
    clamp01(mix(GRASS_COLOR[1], GRASS_COLOR2[1], 1 - v) * mix(GRASS_COLOR[1], GRASS_COLOR2[1], n)),
    clamp01(mix(GRASS_COLOR[2], GRASS_COLOR2[2], 1 - v) * mix(GRASS_COLOR[2], GRASS_COLOR2[2], n)),
  ];
}

type TriV = (a: V3, ca: V3, b: V3, cb: V3, c: V3, cc: V3) => void;

function emitTuft(triV: TriV, p: TuftParams, originX: number, originZ: number): void {
  const cos = Math.cos(p.rot);
  const sin = Math.sin(p.rot);
  const { positions, uvs, indices } = p.mesh;
  for (let i = 0; i < indices.length; i += 3) {
    const vs: V3[] = [];
    const cs: V3[] = [];
    for (let k = 0; k < 3; k++) {
      const vi = indices[i + k];
      const lx = positions[vi * 3] * p.scale;
      const ly = positions[vi * 3 + 1] * p.scale;
      const lz = positions[vi * 3 + 2] * p.scale;
      const wx = originX + p.ox + lx * cos + lz * sin;
      const wz = originZ + p.oz - lx * sin + lz * cos;
      vs.push([wx, 0.01 + ly, wz]);
      cs.push(tuftColor(uvs[vi * 2 + 1], wx, wz));
    }
    triV(vs[0], cs[0], vs[1], cs[1], vs[2], cs[2]);
  }
}

// Tiles that must never carry a natural tuft: anything already occupied
// (walls, trees, rocks, crates, stalls, houses — generated or placed), so
// blades never clip through solid geometry. Grass terrain under a house
// or tree is still grass terrain, so the block list is checked first.
function blockedTiles(world: IsoWorld): Set<string> {
  const blocked = new Set<string>();
  const key = (x: number, y: number): string => x + ',' + y;
  for (const w of world.walls || []) blocked.add(key(w.x, w.y));
  for (const t of world.trees || []) blocked.add(key(t.tx, t.ty));
  for (const r of world.rocks || []) blocked.add(key(r.tx, r.ty));
  for (const c of world.crates || []) blocked.add(key(c.tx, c.ty));
  for (const s of world.stalls || []) for (let x = s.x0; x <= s.x1; x++) blocked.add(key(x, s.y0));
  for (const h of world.huts || []) {
    for (let x = h.x0; x <= h.x1; x++) for (let y = h.y0; y <= h.y1; y++) blocked.add(key(x, y));
  }
  for (const h of placedHutRects(world)) {
    for (let x = h.x0; x <= h.x1; x++) for (let y = h.y0; y <= h.y1; y++) blocked.add(key(x, y));
  }
  for (const s of placedStallRects(world)) {
    for (let x = s.x0; x <= s.x1; x++) blocked.add(key(x, s.y0));
  }
  for (const t of placedTreeTiles(world)) blocked.add(key(t.tx, t.ty));
  // BUILD 997: custom-upload rects are solid geometry too — no tuft
  // may poke through an uploaded mesh.
  for (const c of placedCustomRects(world)) {
    for (let x = c.x0; x <= c.x1; x++) for (let y = c.y0; y <= c.y1; y++) blocked.add(key(x, y));
  }
  return blocked;
}

export function emitNaturalGrass(
  triV: TriV,
  world: IsoWorld,
  effTerrain: (x: number, y: number) => string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): void {
  const blocked = blockedTiles(world);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (effTerrain(x, y) !== 'grass') continue;
      if (blocked.has(x + ',' + y)) continue;
      const p = naturalTuftForTile(x, y);
      if (!p) continue;
      emitTuft(triV, p, x + 0.5, y + 0.5);
    }
  }
}

export function emitPlacedGrass(
  triV: TriV,
  world: IsoWorld,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): void {
  const items = (world.placements || []).filter((p) => p.kind === 'grass');
  for (const it of items) {
    if (it.x0 < minX || it.x0 > maxX || it.y0 < minY || it.y0 > maxY) continue;
    emitTuft(triV, tuftParamsForTile(it.x0, it.y0), it.x0 + 0.5, it.y0 + 0.5);
  }
}
