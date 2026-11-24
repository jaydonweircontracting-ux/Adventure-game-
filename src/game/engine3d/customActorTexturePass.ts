import type { CustomAsset } from './customAssets';

export interface TexturedActorInstance {
  asset: CustomAsset;
  x: number;
  z: number;
  yaw: number;
  baseY: number;
}

type Batch = { vertices: number[]; textureUri: string | null; cutoff: number };

const VERTEX_SHADER = 'attribute vec3 aPosition; attribute vec3 aColor; attribute vec2 aUv; uniform mat4 uViewProjection; varying vec3 vColor; varying vec2 vUv; void main(){gl_Position=uViewProjection*vec4(aPosition,1.0);vColor=aColor;vUv=aUv;}';
const FRAGMENT_SHADER = 'precision mediump float; uniform sampler2D uTexture; uniform float uUseTexture; uniform float uNight; uniform float uWarm; uniform float uAlphaCutoff; varying vec3 vColor; varying vec2 vUv; void main(){vec4 texel=mix(vec4(1.0),texture2D(uTexture,vUv),uUseTexture);vec4 surface=vec4(vColor*texel.rgb,texel.a);if(uAlphaCutoff>=0.0&&surface.a<uAlphaCutoff)discard;vec3 warm=mix(surface.rgb,surface.rgb*vec3(1.0,0.72,0.45),uWarm*0.45);vec3 lit=mix(warm,vec3(0.035,0.045,0.09),uNight);gl_FragColor=vec4(lit,surface.a);}';

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
  private readonly textures = new Map<string, { texture: WebGLTexture; ready: boolean }>();

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
    if (this.position < 0 || this.color < 0 || this.uv < 0 || !this.matrix || !this.sampler || !this.useTexture || !this.night || !this.warm || !this.alphaCutoff) {
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
      const vertexCount = asset.positions.length / 3;
      const limit = Math.min(asset.indices.length, 90000);
      for (let i = 0; i + 2 < limit; i += 3) {
        const vi = asset.indices[i];
        const materialIndex = asset.materialIndices?.[vi] ?? -1;
        const material = materialIndex >= 0 ? asset.materials?.[materialIndex] : undefined;
        const slot = material?.textures.baseColor;
        const uri = slot ? asset.textureImages?.[slot.textureIndex] || null : null;
        const key = asset.id + ':' + materialIndex + ':' + (uri || 'flat');
        let batch = batches.get(key);
        if (!batch) {
          batch = { vertices: [], textureUri: uri, cutoff: material?.alphaMode === 'MASK' ? material.alphaCutoff : -1 };
          batches.set(key, batch);
        }
        for (let corner = 0; corner < 3; corner++) {
          const index = asset.indices[i + corner];
          if (index < 0 || index >= vertexCount) continue;
          const p = index * 3, uv = index * 2, q = index * 3;
          const x = asset.positions[p], y = asset.positions[p + 1], z = asset.positions[p + 2];
          const wx = actor.x + x * c + z * sn, wz = actor.z - x * sn + z * c;
          batch.vertices.push(wx, actor.baseY + y, wz,
            asset.colors[q] ?? asset.avgColor[0], asset.colors[q + 1] ?? asset.avgColor[1], asset.colors[q + 2] ?? asset.avgColor[2],
            asset.uvs?.[uv] ?? 0, asset.uvs?.[uv + 1] ?? 0);
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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const batch of batches.values()) {
      const data = new Float32Array(batch.vertices);
      if (!data.length) continue;
      const tex = batch.textureUri ? this.texture(batch.textureUri) : null;
      gl.bindTexture(gl.TEXTURE_2D, tex?.texture || null);
      gl.uniform1f(this.useTexture, tex ? 1 : 0);
      gl.uniform1f(this.alphaCutoff, batch.cutoff);
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
