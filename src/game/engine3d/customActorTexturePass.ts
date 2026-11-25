import type { CustomAsset } from './customAssets';
import { transformTextureUv } from './materialRuntime';

export interface TexturedActorInstance {
  asset: CustomAsset;
  x: number;
  z: number;
  yaw: number;
  baseY: number;
  phase: number;
  /** Match imported player gait cadence to the slower NPC walk cycle. */
  phaseScale?: number;
}

type Batch = { vertices: number[]; textureUri: string | null; cutoff: number; alphaMode: 'OPAQUE' | 'MASK' | 'BLEND'; opacity: number };

const VERTEX_SHADER = 'attribute vec3 aPosition; attribute vec3 aColor; attribute vec2 aUv; uniform mat4 uViewProjection; varying vec3 vColor; varying vec2 vUv; void main(){gl_Position=uViewProjection*vec4(aPosition,1.0);vColor=aColor;vUv=aUv;}';
const FRAGMENT_SHADER = 'precision mediump float; uniform sampler2D uTexture; uniform float uUseTexture; uniform float uNight; uniform float uWarm; uniform float uAlphaCutoff; uniform float uOpacity; uniform float uAlphaMode; varying vec3 vColor; varying vec2 vUv; void main(){vec4 texel=mix(vec4(1.0),texture2D(uTexture,vUv),uUseTexture);vec4 surface=vec4(vColor*texel.rgb,uAlphaMode<0.5?1.0:texel.a*uOpacity);if(uAlphaCutoff>=0.0&&surface.a<uAlphaCutoff)discard;vec3 warm=mix(surface.rgb,surface.rgb*vec3(1.0,0.72,0.45),uWarm*0.45);vec3 lit=mix(warm,vec3(0.035,0.045,0.09),uNight);gl_FragColor=vec4(lit,surface.a);}';

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to allocate custom actor shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) || 'unknown shader error';
    gl.deleteShader(shader);
    throw new Error('Custom actor shader failed: ' + error);
  }
  return shader;
}

/** WebGL1 textured actor pass. Texture objects are cached; actor triangles are batched by material. */
export class CustomActorTexturePass {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly position: number;
  private readonly color: number;
  private readonly uv: number;
  private readonly matrix: WebGLUniformLocation;
  private readonly sampler: WebGLUniformLocation;
  private readonly useTexture: WebGLUniformLocation;
  private readonly night: WebGLUniformLocation;
  private readonly warm: WebGLUniformLocation;
  private readonly alphaCutoff: WebGLUniformLocation;
  private readonly opacity: WebGLUniformLocation;
  private readonly alphaMode: WebGLUniformLocation;
  private readonly textures = new Map<string, { texture: WebGLTexture; ready: boolean }>();
  // Older locally saved FBX uploads may predate the importer's up-axis
  // correction. Detect their dominant vertical axis once and correct them
  // at draw time too, so users do not have to upload the pack again.
  private readonly uprightAxis = new Map<string, number>();
  private readonly verticalFloor = new Map<string, number>();
  private readonly armPose = new Map<string, { minY: number; height: number; shoulder: number; spread: number; spreadAxis: 0 | 2 }>();
  private bounds(asset: CustomAsset) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < asset.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], asset.positions[i + axis]);
        max[axis] = Math.max(max[axis], asset.positions[i + axis]);
      }
    }
    return { min, max, extents: max.map((value, axis) => value - min[axis]) };
  }
  private verticalAxis(asset: CustomAsset): number {
    const cached = this.uprightAxis.get(asset.id);
    if (cached !== undefined) return cached;
    const extents = this.bounds(asset).extents;
    const axis = extents.indexOf(Math.max(...extents));
    this.uprightAxis.set(asset.id, axis);
    // The source-space coordinate that becomes Y after the up-axis rotation.
    const sourceVerticalAxis = axis === 2 ? 2 : axis === 0 ? 0 : 1;
    this.verticalFloor.set(asset.id, this.bounds(asset).min[sourceVerticalAxis]);
    return axis;
  }
  private floorOffset(asset: CustomAsset): number {
    this.verticalAxis(asset);
    return this.verticalFloor.get(asset.id) ?? 0;
  }
  private armPoseFor(asset: CustomAsset) {
    const cached = this.armPose.get(asset.id);
    if (cached) return cached;
    const b = this.bounds(asset), axis = this.verticalAxis(asset);
    const height = b.extents[axis];
    // After the up-axis conversion, a humanoid's arm span can lie along
    // either horizontal axis. Choose the wider horizontal dimension, but
    // never infer the model's up axis from arm span.
    const horizontalAxis = axis === 0 ? 1 : 0;
    const depthAxis = axis === 2 ? 1 : 2;
    const spread = Math.max(b.extents[horizontalAxis], b.extents[depthAxis]);
    const spreadAxis: 0 | 2 = b.extents[horizontalAxis] >= b.extents[depthAxis] ? 0 : 2;
    const pose = { minY: b.min[axis], height, shoulder: spread * 0.16, spread, spreadAxis };
    this.armPose.set(asset.id, pose);
    return pose;
  }
  private hangArms(asset: CustomAsset, x: number, y: number, z: number): [number, number, number] {
    const pose = this.armPoseFor(asset);
    if (pose.height <= 0 || pose.spread < pose.height * 0.28) return [x, y, z];
    const horizontal = pose.spreadAxis === 0 ? x : z;
    const localY = y - pose.minY;
    if (localY < pose.height * 0.48 || localY > pose.height * 0.94 || Math.abs(horizontal) <= pose.shoulder) return [x, y, z];
    const side = horizontal < 0 ? -1 : 1;
    const pivot = side * pose.shoulder, pivotY = pose.minY + pose.height * 0.78;
    // Rotate each upper arm down around its own shoulder. This changes only
    // the arm vertices; the model's root, feet, and overall vertical position
    // remain untouched.
    const angle = side > 0 ? -1.48 : 1.48;
    const dh = horizontal - pivot, dy = y - pivotY, c = Math.cos(angle), sn = Math.sin(angle);
    const nextH = pivot + dh * c - dy * sn;
    const nextY = pivotY + dh * sn + dy * c;
    return pose.spreadAxis === 0 ? [nextH, nextY, z] : [x, nextY, nextH];
  }

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error('Unable to allocate custom actor program');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program) || 'unknown link error';
      gl.deleteProgram(program);
      throw new Error('Custom actor program failed: ' + error);
    }
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Unable to allocate custom actor buffer');
    this.program = program;
    this.buffer = buffer;
    this.position = gl.getAttribLocation(program, 'aPosition');
    this.color = gl.getAttribLocation(program, 'aColor');
    this.uv = gl.getAttribLocation(program, 'aUv');
    this.matrix = gl.getUniformLocation(program, 'uViewProjection')!;
    this.sampler = gl.getUniformLocation(program, 'uTexture')!;
    this.useTexture = gl.getUniformLocation(program, 'uUseTexture')!;
    this.night = gl.getUniformLocation(program, 'uNight')!;
    this.warm = gl.getUniformLocation(program, 'uWarm')!;
    this.alphaCutoff = gl.getUniformLocation(program, 'uAlphaCutoff')!;
    this.opacity = gl.getUniformLocation(program, 'uOpacity')!;
    this.alphaMode = gl.getUniformLocation(program, 'uAlphaMode')!;
    if (this.position < 0 || this.color < 0 || this.uv < 0 || !this.matrix || !this.sampler || !this.useTexture || !this.night || !this.warm || !this.alphaCutoff || !this.opacity || !this.alphaMode) {
      throw new Error('Custom actor program is missing required attributes or uniforms');
    }
  }

  private texture(uri: string): { texture: WebGLTexture; ready: boolean } | null {
    const cached = this.textures.get(uri);
    if (cached) return cached;
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    const entry = { texture, ready: false };
    this.textures.set(uri, entry);
    const image = new Image();
    image.onload = () => {
      if (!this.textures.has(uri)) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      entry.ready = true;
    };
    image.onerror = () => { /* retain white fallback */ };
    image.src = uri;
    return entry;
  }

  draw(instances: TexturedActorInstance[], viewProjection: ArrayLike<number>, night: number, warm: number): void {
    const gl = this.gl;
    const batches = new Map<string, Batch>();
    for (const actor of instances) {
      const asset = actor.asset;
      const c = Math.cos(actor.yaw), sn = Math.sin(actor.yaw);
      const frames = asset.animationFrames;
      const scaledPhase = actor.phase * (actor.phaseScale ?? 1);
      const cycle = ((scaledPhase % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
      // Blend between baked walk frames instead of snapping to one frame.
      // Discrete frame selection made imported people visibly pop at each
      // stride boundary, especially on a phone at variable frame rates.
      const framePosition = frames?.length ? cycle / (Math.PI * 2) * frames.length : 0;
      const frameIndex = frames?.length ? Math.floor(framePosition) % frames.length : 0;
      const nextFrameIndex = frames?.length ? (frameIndex + 1) % frames.length : 0;
      const frameA = frames?.length ? frames[frameIndex] : undefined;
      const frameB = frames?.length ? frames[nextFrameIndex] : undefined;
      const frameBlend = framePosition - Math.floor(framePosition);
      const posePositions = frameA ?? asset.positions;
      const vertexCount = posePositions.length / 3;
      // Align the lowest point of this specific imported model with the
      // terrain. This works for saved uploads whose FBX origin is not at
      // the feet, instead of applying a guessed global lift.
      const floorY = this.floorOffset(asset);
      const limit = Math.min(asset.indices.length, 90000);
      for (let i = 0; i + 2 < limit; i += 3) {
        const vi = asset.indices[i];
        const materialIndex = asset.materialIndices?.[vi] ?? -1;
        const material = materialIndex >= 0 ? asset.materials?.[materialIndex] : undefined;
        const slot = material?.textures.baseColor;
        const uvData = slot && slot.texCoord > 0 ? asset.uvSets?.[slot.texCoord - 1] || asset.uvs : asset.uvs;
        const uri = slot ? asset.textureImages?.[slot.textureIndex] || null : null;
        const key = asset.id + ':' + materialIndex + ':' + (uri || 'flat');
        let batch = batches.get(key);
        if (!batch) {
          batch = { vertices: [], textureUri: uri, cutoff: material?.alphaMode === 'MASK' ? material.alphaCutoff : -1, alphaMode: material?.alphaMode || 'OPAQUE', opacity: material?.baseColor[3] ?? 1 };
          batches.set(key, batch);
        }
        for (let corner = 0; corner < 3; corner++) {
          const index = asset.indices[i + corner];
          if (index < 0 || index >= vertexCount) continue;
          const p = index * 3, uv = index * 2, q = index * 3;
          const blendFrames = frameA && frameB && frameA.length === frameB.length;
          let x = blendFrames ? frameA[p] + (frameB[p] - frameA[p]) * frameBlend : posePositions[p];
          let y = blendFrames ? frameA[p + 1] + (frameB[p + 1] - frameA[p + 1]) * frameBlend : posePositions[p + 1];
          let z = blendFrames ? frameA[p + 2] + (frameB[p + 2] - frameA[p + 2]) * frameBlend : posePositions[p + 2];
          const upAxis = this.verticalAxis(asset);
          if (upAxis === 2) { const oldY = y; y = z; z = -oldY; }
          else if (upAxis === 0) { const oldX = x; x = y; y = oldX; }
          [x, y, z] = this.hangArms(asset, x, y, z);
          const wx = actor.x + x * c + z * sn, wz = actor.z - x * sn + z * c;
          const sourceUv: [number, number] = [uvData?.[uv] ?? 0, uvData?.[uv + 1] ?? 0];
          const mappedUv = slot?.transform ? transformTextureUv(sourceUv, slot.transform) : sourceUv;
          let cr = asset.colors[q] ?? asset.avgColor[0];
          let cg = asset.colors[q + 1] ?? asset.avgColor[1];
          let cb = asset.colors[q + 2] ?? asset.avgColor[2];
          if (cr + cg + cb < 0.025) {
            const base = material?.baseColor;
            const fallback = base && base.slice(0, 3).some(value => value > 0.04) ? base : asset.avgColor;
            cr = fallback[0]; cg = fallback[1]; cb = fallback[2];
          }
          batch.vertices.push(wx, actor.baseY + (y - this.floorOffset(asset)), wz,
            cr, cg, cb, mappedUv[0], mappedUv[1]);
        }
      }
    }
    if (!batches.size) return;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.matrix, false, viewProjection as Float32List);
    gl.uniform1i(this.sampler, 0);
    gl.uniform1f(this.night, night);
    gl.uniform1f(this.warm, warm);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.position);
    gl.enableVertexAttribArray(this.color);
    gl.enableVertexAttribArray(this.uv);
    gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(this.color, 3, gl.FLOAT, false, 32, 12);
    gl.vertexAttribPointer(this.uv, 2, gl.FLOAT, false, 32, 24);
    gl.activeTexture(gl.TEXTURE0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const batch of batches.values()) {
      const data = new Float32Array(batch.vertices);
      if (!data.length) continue;
      const tex = batch.textureUri ? this.texture(batch.textureUri) : null;
      gl.bindTexture(gl.TEXTURE_2D, tex?.texture || null);
      gl.uniform1f(this.useTexture, tex ? 1 : 0);
      gl.uniform1f(this.alphaCutoff, batch.cutoff);
      gl.uniform1f(this.opacity, batch.opacity);
      gl.uniform1f(this.alphaMode, batch.alphaMode === 'OPAQUE' ? 0 : 1);
      if (batch.alphaMode === 'BLEND') { gl.enable(gl.BLEND); gl.depthMask(false); }
      else { gl.disable(gl.BLEND); gl.depthMask(true); }
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 8);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    const gl = this.gl;
    for (const entry of this.textures.values()) gl.deleteTexture(entry.texture);
    this.textures.clear();
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
  }
}
