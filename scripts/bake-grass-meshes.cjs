// BUILD 985 — bake the StayAtHomeDev stylized-grass GLBs (MIT 2023) into
// src/game/engine3d/grassMeshes.ts for the vertex-colour 3D renderer.
// Usage: node scripts/bake-grass-meshes.cjs  (deterministic: same input
// files always produce byte-identical output; run twice and diff to check).
//
// What it does, and why:
// - Parses GLB directly (header + JSON chunk + BIN chunk). No three.js
//   dependency: the repo does not declare three, and the renderer packs
//   triangles itself, so a runtime GLTFLoader would add a dependency for
//   no benefit on two tiny meshes.
// - Applies each node's TRS transform (grass2 carries a rotation/scale/
//   translation; grass has none), then normalizes: centre XZ on the
//   origin, base at y=0, uniform scale so height = 0.55 world units.
//   Uniform scaling keeps source proportions (the 983 house lesson:
//   independent axis normalization mangles imported meshes).
// - UV normalization: grass.glb's v increases with height (v=0 at base),
//   but grass2.glb's v DECREASES with height (an authoring flip). The
//   Godot shader's gradient (mix by 1-UV.y) would therefore paint the
//   two meshes with opposite gradients. The script flips grass2's v
//   (detected, not assumed: mean v of the bottom third by height vs the
//   top third) so both baked meshes share v=0 at base, v=1 at tip, and
//   the runtime shader formula gives both the same base-to-tip gradient.
// - Drops NORMALs (the packed format is positions + colour only) and
//   material factors (metallic/roughness have no equivalent here).
// - The source GLBs + license.txt ship in public/grass/ alongside this
//   output's MIT header, per the MIT requirement.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'public', 'grass');
const OUT = path.join(ROOT, 'src', 'game', 'engine3d', 'grassMeshes.ts');
const TARGET_HEIGHT = 0.55;

function parseGlb(buf, file) {
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'glTF') throw new Error(file + ': bad magic ' + magic);
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(file + ': unsupported glTF version ' + version);
  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error(file + ': first chunk is not JSON');
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  let off = 20 + jsonLen;
  const binLen = buf.readUInt32LE(off);
  const binType = buf.readUInt32LE(off + 4);
  if (binType !== 0x004e4942) throw new Error(file + ': second chunk is not BIN');
  const bin = buf.subarray(off + 8, off + 8 + binLen);
  return { json, bin };
}

function readAccessor(json, bin, idx) {
  const acc = json.accessors[idx];
  const view = json.bufferViews[acc.bufferView];
  const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
  const compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const stride = view.byteStride || compSize * compCount;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < compCount; k++) {
      const o = base + i * stride + k * compSize;
      if (acc.componentType === 5126) out.push(bin.readFloatLE(o));
      else if (acc.componentType === 5123) out.push(bin.readUInt16LE(o));
      else if (acc.componentType === 5125) out.push(bin.readUInt32LE(o));
      else if (acc.componentType === 5122) out.push(bin.readInt16LE(o));
      else throw new Error('unsupported componentType ' + acc.componentType);
    }
  }
  return out;
}

function quatToMatrix(q) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
    [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
    [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
  ];
}

function bakeOne(file) {
  const buf = fs.readFileSync(path.join(SRC_DIR, file));
  const { json, bin } = parseGlb(buf, file);
  const mesh = json.meshes[0];
  if (json.meshes.length !== 1 || mesh.primitives.length !== 1) {
    throw new Error(file + ': expected exactly 1 mesh with 1 primitive');
  }
  const prim = mesh.primitives[0];
  const pos = readAccessor(json, bin, prim.attributes.POSITION);
  const uv = readAccessor(json, bin, prim.attributes.TEXCOORD_0);
  const idx = readAccessor(json, bin, prim.indices);
  const node = (json.nodes || []).find((n) => n.mesh === 0) || {};
  const scale = node.scale || [1, 1, 1];
  const rot = node.rotation ? quatToMatrix(node.rotation) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const trans = node.translation || [0, 0, 0];
  // Apply TRS, then measure bounds.
  const verts = [];
  for (let i = 0; i < pos.length; i += 3) {
    const sx = pos[i] * scale[0], sy = pos[i + 1] * scale[1], sz = pos[i + 2] * scale[2];
    verts.push([
      rot[0][0] * sx + rot[0][1] * sy + rot[0][2] * sz + trans[0],
      rot[1][0] * sx + rot[1][1] * sy + rot[1][2] * sz + trans[1],
      rot[2][0] * sx + rot[2][1] * sy + rot[2][2] * sz + trans[2],
    ]);
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
    minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
    minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const s = TARGET_HEIGHT / (maxY - minY);
  const positions = [];
  for (const v of verts) {
    positions.push((v[0] - cx) * s, (v[1] - minY) * s, (v[2] - cz) * s);
  }
  // UV flip detection: mean v of the bottom third by height vs the top third.
  const order = verts.map((v, i) => i).sort((a, b) => verts[a][1] - verts[b][1]);
  const third = Math.max(1, Math.floor(order.length / 3));
  const meanV = (list) => list.reduce((sum, i) => sum + uv[i * 2 + 1], 0) / list.length;
  const vBot = meanV(order.slice(0, third));
  const vTop = meanV(order.slice(-third));
  const flipV = vTop < vBot;
  const uvs = [];
  for (let i = 0; i < uv.length; i += 2) {
    uvs.push(uv[i], flipV ? 1 - uv[i + 1] : uv[i + 1]);
  }
  const r6 = (n) => Math.round(n * 1e6) / 1e6;
  return {
    name: file,
    vertexCount: verts.length,
    triangleCount: idx.length / 3,
    flipV,
    positions: positions.map(r6),
    uvs: uvs.map(r6),
    indices: idx,
  };
}

const meshes = [bakeOne('grass.glb'), bakeOne('grass2.glb')];
for (const m of meshes) {
  console.log(`${m.name}: ${m.vertexCount} verts, ${m.triangleCount} tris, flipV=${m.flipV}`);
}

const header = `// BUILD 985 — baked stylized-grass meshes (StayAtHomeDev, MIT 2023).
// Source: public/grass/grass.glb + grass2.glb (license.txt ships alongside
// them). Baked by scripts/bake-grass-meshes.cjs: node TRS applied,
// centred XZ, base at y=0, uniform scale to 0.55 height, v normalized so
// v=0 is the base and v=1 the tip on both meshes (grass2's authored v
// runs the other way and is flipped at bake time — see the script).
// The MIT license (Copyright (c) 2023 StayAtHomeDev) is reproduced in
// public/grass/license.txt; this file is a derived portion of that work.
// Positions are normalized tuft geometry; colours are baked at render
// time by grassTufts.ts (gradient x noise), not stored here.

export interface BakedGrassMesh {
  name: string;
  positions: number[];
  uvs: number[];
  indices: number[];
}

export const GRASS_MESHES: BakedGrassMesh[] = [
`;

let body = header;
for (const m of meshes) {
  body += `  {\n    name: ${JSON.stringify(m.name)},\n    positions: ${JSON.stringify(m.positions)},\n    uvs: ${JSON.stringify(m.uvs)},\n    indices: ${JSON.stringify(m.indices)},\n  },\n`;
}
body += '];\n';
fs.writeFileSync(OUT, body);
console.log('wrote ' + OUT);
