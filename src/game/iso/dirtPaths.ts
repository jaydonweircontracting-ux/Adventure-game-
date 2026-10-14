/**
 * Textured dirt paths for the iso renderer (BUILD 692).
 *
 * Replaces the old flat semi-transparent lane strokes with layered,
 * worn-dirt rendering: a soft dark fringe, a dirt body with deterministic
 * width wobble, a lighter foot-worn center strip, and pebble speckles.
 *
 * Pure geometry module (no DOM): `computeDirtPathGeometry` returns plain
 * point arrays so it runs in node for sim assertions. The renderer converts
 * to Path2D via `buildDirtPath2D` (browser only) and caches per chunk —
 * zero per-frame allocation, satisfying the BUILD 687 perf bar.
 *
 * Deterministic: a seeded PRNG per lane drives wobble phase and speckle
 * placement, so paths never flicker between frames.
 */

export interface DirtLaneInput {
  points: { x: number; y: number }[];
  width: number;
}

export interface Speckle { x: number; y: number; rx: number; ry: number; dark: boolean }

export interface DirtPathGeometry {
  /** One closed polygon per lane: outer soft fringe (drawn first, widest). */
  edge: { x: number; y: number }[][];
  /** Main dirt body polygons. */
  dirt: { x: number; y: number }[][];
  /** Foot-worn center strip polygons (narrowest, drawn last). */
  center: { x: number; y: number }[][];
  /** Pebble speckles in screen space. */
  speckles: Speckle[];
}

/** FNV-1a string hash -> uint32 seed. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SPoint { x: number; y: number }

/** Resample a screen-space polyline at ~step px intervals. Returns points
 *  plus cumulative arc length at each point. */
export function resamplePolyline(pts: SPoint[], step: number): { pts: SPoint[]; arc: number[] } {
  const out: SPoint[] = [];
  const arc: number[] = [];
  if (pts.length === 0) return { pts: out, arc };
  out.push({ ...pts[0] });
  arc.push(0);
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1e-6) continue;
    const n = Math.max(1, Math.round(segLen / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      acc += segLen / n;
      arc.push(acc);
    }
  }
  return { pts: out, arc };
}

/**
 * Build a closed offset polygon around a resampled centerline.
 * halfWidthAt(s) gives the half-width in px at arc length s (wobble lives here).
 */
export function offsetPolygon(
  pts: SPoint[], arc: number[],
  halfWidthAt: (s: number) => number,
): SPoint[] {
  const left: SPoint[] = [];
  const right: SPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const hw = Math.max(0.5, halfWidthAt(arc[i]));
    // normal (screen space)
    const nx = -dy, ny = dx;
    left.push({ x: p.x + nx * hw, y: p.y + ny * hw });
    right.push({ x: p.x - nx * hw, y: p.y - ny * hw });
  }
  return [...left, ...right.reverse()];
}

/** Point + normal at arc length s along a resampled polyline (for speckles). */
function pointAt(pts: SPoint[], arc: number[], s: number): { p: SPoint; n: SPoint } {
  let i = 0;
  while (i < arc.length - 1 && arc[i + 1] < s) i++;
  const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
  let dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const t = arc.length > 1 && arc[i + 1] > arc[i]
    ? Math.min(1, Math.max(0, (s - arc[i]) / (arc[i + 1] - arc[i])))
    : 0;
  return {
    p: { x: a.x + dx * len * t, y: a.y + dy * len * t },
    n: { x: -dy, y: dx },
  };
}

const RESAMPLE_STEP = 14; // px between centerline samples (perf: 6px -> 83k pts, too slow)

/**
 * Compute textured dirt-path geometry for a set of lanes.
 * `project` maps lane-local coords to screen px (bake chunk/scene offsets in).
 * `seedBase` scopes the deterministic decoration (e.g. chunk key).
 */
export function computeDirtPathGeometry(
  lanes: DirtLaneInput[],
  project: (x: number, y: number) => SPoint,
  seedBase: string,
): DirtPathGeometry {
  const geo: DirtPathGeometry = { edge: [], dirt: [], center: [], speckles: [] };
  lanes.forEach((ln, li) => {
    if (ln.points.length < 2) return;
    const screen = ln.points.map((p) => project(p.x, p.y));
    const { pts, arc } = resamplePolyline(screen, RESAMPLE_STEP);
    if (pts.length < 2) return;
    const total = arc[arc.length - 1];
    if (total < 1) return;
    const rng = mulberry32(hashSeed(`${seedBase}:lane:${li}`));
    const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2;
    const f1 = 0.035 + rng() * 0.03, f2 = 0.09 + rng() * 0.06;
    const baseHW = Math.max(1, (ln.width * 14) / 2);
    // Wobble is ADDITIVE and identical across layers (same phase/frequency):
    // only the base width differs per layer, so edge > dirt > center holds
    // at every point along the path. Scaling the amplitude per layer would
    // invert the ordering at wobble troughs.
    const wob = (s: number) => baseHW * 0.25 * (0.20 * Math.sin(s * f1 + p1) + 0.12 * Math.sin(s * f2 + p2));
    geo.edge.push(offsetPolygon(pts, arc, (s) => baseHW * 1.18 + 1.5 + wob(s)));
    geo.dirt.push(offsetPolygon(pts, arc, (s) => baseHW + wob(s)));
    geo.center.push(offsetPolygon(pts, arc, (s) => baseHW * 0.55 + wob(s)));
    // pebble speckles along the path (sparse for perf)
    const count = Math.floor(total / 25);
    for (let k = 0; k < count; k++) {
      const s = rng() * total;
      const { p, n } = pointAt(pts, arc, s);
      const lateral = (rng() * 2 - 1) * baseHW * 0.75;
      const rx = 0.9 + rng() * 1.9;
      geo.speckles.push({
        x: p.x + n.x * lateral,
        y: p.y + n.y * lateral,
        rx,
        ry: rx * 0.55, // iso squash
        dark: rng() < 0.62,
      });
    }
  });
  return geo;
}

/** Browser-only: convert geometry to cached Path2D layers. */
export function buildDirtPath2D(geo: DirtPathGeometry): {
  edge: Path2D; dirt: Path2D; center: Path2D; speckleDark: Path2D; speckleLight: Path2D;
} {
  const poly = (polys: SPoint[][]): Path2D => {
    const path = new Path2D();
    for (const polyPts of polys) {
      if (polyPts.length < 3) continue;
      path.moveTo(polyPts[0].x, polyPts[0].y);
      for (let i = 1; i < polyPts.length; i++) path.lineTo(polyPts[i].x, polyPts[i].y);
      path.closePath();
    }
    return path;
  };
  const speckleDark = new Path2D();
  const speckleLight = new Path2D();
  for (const s of geo.speckles) {
    const path = s.dark ? speckleDark : speckleLight;
    path.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
  }
  return {
    edge: poly(geo.edge),
    dirt: poly(geo.dirt),
    center: poly(geo.center),
    speckleDark,
    speckleLight,
  };
}
