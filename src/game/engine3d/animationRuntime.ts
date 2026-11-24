/**
 * BUILD 1113 — animation runtime foundation.
 *
 * Deterministic glTF animation sampling and linear-blend skinning helpers.
 * This module is deliberately renderer-independent: importers can preserve
 * animation channels and the WebGL actor pass can evaluate them without
 * coupling asset parsing to frame scheduling.
 */
export type AnimationPath = 'translation' | 'rotation' | 'scale';
export type AnimationInterpolation = 'STEP' | 'LINEAR' | 'CUBICSPLINE';

export interface AnimationSamplerData {
  times: number[];
  values: number[];
  components: 3 | 4;
  interpolation?: AnimationInterpolation;
}

export interface SampledAnimationValue {
  value: number[];
  leftKey: number;
  rightKey: number;
  alpha: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function normalizeQuaternion(q: number[]): number[] {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  return length > 1e-12 ? q.map(v => v / length) : [0, 0, 0, 1];
}

/** Shortest-path spherical interpolation for glTF rotation channels. */
export function slerpQuaternion(a: number[], b: number[], t: number): number[] {
  let end = b.slice();
  let dot = a.reduce((sum, v, i) => sum + v * end[i], 0);
  if (dot < 0) { dot = -dot; end = end.map(v => -v); }
  if (dot > 0.9995) return normalizeQuaternion(a.map((v, i) => v + (end[i] - v) * t));
  const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return normalizeQuaternion(a.map((v, i) => v * wa + end[i] * wb));
}

/**
 * Sample a glTF animation sampler at seconds. CUBICSPLINE follows glTF's
 * in-tangent/value/out-tangent triplets and scales tangents by key duration.
 */
export function sampleAnimationSampler(
  sampler: AnimationSamplerData,
  seconds: number,
  path: AnimationPath,
): SampledAnimationValue {
  const { times, values, components } = sampler;
  if (!times.length || values.length !== times.length * components *
      (sampler.interpolation === 'CUBICSPLINE' ? 3 : 1)) {
    throw new Error('animation sampler has inconsistent keyframe data');
  }
  const last = times.length - 1;
  const time = Math.max(times[0], Math.min(times[last], Number.isFinite(seconds) ? seconds : times[0]));
  let left = 0;
  while (left < last - 1 && times[left + 1] < time) left++;
  const right = Math.min(last, left + 1);
  const span = times[right] - times[left];
  const alpha = span > 0 ? clamp01((time - times[left]) / span) : 0;
  const mode = sampler.interpolation || 'LINEAR';
  const offset = (key: number, part = 0) => {
    const base = (key * (mode === 'CUBICSPLINE' ? 3 : 1) + part) * components;
    return values.slice(base, base + components);
  };
  const leftValue = offset(left, mode === 'CUBICSPLINE' ? 1 : 0);
  if (left === right || mode === 'STEP') {
    return { value: path === 'rotation' ? normalizeQuaternion(leftValue) : leftValue, leftKey: left, rightKey: right, alpha };
  }
  const rightValue = offset(right, mode === 'CUBICSPLINE' ? 1 : 0);
  let value: number[];
  if (mode === 'CUBICSPLINE') {
    const outTangent = offset(left, 2);
    const inTangent = offset(right, 0);
    const t2 = alpha * alpha, t3 = t2 * alpha;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + alpha;
    const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    value = leftValue.map((v, i) =>
      h00 * v + h10 * span * outTangent[i] + h01 * rightValue[i] + h11 * span * inTangent[i]);
  } else if (path === 'rotation') {
    value = slerpQuaternion(leftValue, rightValue, alpha);
  } else {
    value = leftValue.map((v, i) => v + (rightValue[i] - v) * alpha);
  }
  return { value: path === 'rotation' ? normalizeQuaternion(value) : value, leftKey: left, rightKey: right, alpha };
}

/** Column-major 4x4 matrix multiplication (out = a * b). */
export function multiplyAnimationMatrices(a: number[], b: number[]): number[] {
  if (a.length !== 16 || b.length !== 16) throw new Error('expected two 4x4 matrices');
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

/**
 * Apply up to four weighted joint matrices to one position. Matrices are
 * already jointWorld * inverseBind in column-major order. Unused/zero
 * weights contribute nothing; callers normalize weights when importing.
 */
export function skinAnimationVertex(
  position: [number, number, number],
  joints: [number, number, number, number],
  weights: [number, number, number, number],
  jointMatrices: number[][],
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const weight = weights[i], matrix = jointMatrices[joints[i]];
    if (!(weight > 0) || !matrix || matrix.length !== 16) continue;
    const [x, y, z] = position;
    out[0] += (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * weight;
    out[1] += (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * weight;
    out[2] += (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * weight;
    total += weight;
  }
  if (total > 1e-12 && Math.abs(total - 1) > 1e-6) {
    out[0] /= total; out[1] /= total; out[2] /= total;
  }
  return out;
}
