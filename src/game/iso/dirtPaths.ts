/**
 * Textured dirt paths for the iso renderer (BUILD 692, reworked in BUILD 693).
 *
 * v1 (692) built filled offset-polygons (fringe/dirt/center layers). On real
 * lane data the filled ribbons rasterized into screen-spanning streaks —
 * bounded input geometry, but the fill triangulation exploded on the engine's
 * sharp road joints. v2 (693) draws the same layered look as STROKES with
 * round caps/joins: a stroke is the Minkowski sum of the polyline with a
 * disc, so it cannot produce spikes by construction.
 *
 * Layers per lane (all strokes of one cached wavy centerline):
 *   fringe — soft dark edge (widest, faintest)
 *   body   — the dirt itself
 *   center — lighter foot-worn strip (narrowest)
 * plus pebble speckles (tiny convex ellipse fills — always safe).
 *
 * Pure geometry module (no DOM): `computeDirtPathGeometry` returns plain
 * point arrays so it runs in node for sim assertions. The renderer converts
 * to Path2D via `buildDirtPath2D` (browser only) and caches per chunk —
 * zero per-frame allocation, satisfying the BUILD 687 perf bar.
 *
 * Deterministic: a seeded PRNG per lane drives the edge wobble and speckle
 * placement, so paths never flicker between frames.
 */

export interface DirtLaneInput {
  points: { x: number; y: number }[];
  width: number;
}

export interface Speckle { x: number; y: number; rx: number; ry: number; dark: boolean }

export interface DirtStrokeLane {
  /** Wavy centerline in projected space (wobble baked in). */
  line: { x: number; y: number }[];
  /** Full stroke widths in projected px: [fringe, body, center]. */
  widths: [number, number, number];
}

export interface DirtPathGeometry {
  /** One stroked lane per input lane. */
  strokes: DirtStrokeLane[];
  /** Pebble speckles in projected space. */
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

/** Resample a projected polyline at ~step px intervals. Returns points
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
 * Wavy centerline: offset each resampled point along its normal by wob(s).
 * The wobble gives the path organic edges; the stroke width stays constant
 * per layer, so rendering is spike-proof (round joins bound everything).
 */
export function wavyCenterline(
  pts: SPoint[], arc: number[],
  wob: (s: number) => number,
): SPoint[] {
  const out: SPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const o = wob(arc[i]);
    out.push({ x: p.x + -dy * o, y: p.y + dx * o });
  }
  return out;
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

const RESAMPLE_STEP = 10; // px between centerline samples

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
  const geo: DirtPathGeometry = { strokes: [], speckles: [] };
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
    // Full stroke width in px, matching the pre-692 flat-stroke look.
    const bodyW = Math.max(2, ln.width * 14);
    // Organic edge wobble, bounded to a fraction of the path width.
    const wobAmp = bodyW * 0.16;
    const wob = (s: number) =>
      wobAmp * (0.62 * Math.sin(s * f1 + p1) + 0.38 * Math.sin(s * f2 + p2));
    geo.strokes.push({
      line: wavyCenterline(pts, arc, wob),
      widths: [bodyW * 1.45, bodyW, bodyW * 0.5],
    });
    // pebble speckles along the path (sparse for perf)
    const count = Math.floor(total / 25);
    for (let k = 0; k < count; k++) {
      const s = rng() * total;
      const { p, n } = pointAt(pts, arc, s);
      const lateral = (rng() * 2 - 1) * bodyW * 0.38;
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

/** Layer styles, kept next to the geometry they belong to. */
export const DIRT_LAYER_STYLE = [
  'rgba(110, 82, 50, 0.16)', // worn fringe (widest)
  'rgba(156, 122, 72, 0.55)', // dirt body
  'rgba(190, 160, 108, 0.30)', // foot-worn center (narrowest)
] as const;

/** Browser-only: convert geometry to cached stroke Path2Ds.
 * Speckles are returned raw (drawn as fillRect dots): filling one Path2D
 * that holds thousands of ellipse subpaths corrupts Chromium's rasterizer
 * (full-canvas triangle explosion, reproduced in isolation). */
export function buildDirtPath2D(geo: DirtPathGeometry): {
  lanes: { path: Path2D; widths: [number, number, number]; pts: { x: number; y: number }[]; bbox: [number, number, number, number] }[];
  speckles: Speckle[];
} {
  const lanes = geo.strokes.map((st) => {
    const path = new Path2D();
    if (st.line.length >= 2) {
      path.moveTo(st.line[0].x, st.line[0].y);
      for (let i = 1; i < st.line.length; i++) path.lineTo(st.line[i].x, st.line[i].y);
    }
    // World-px bbox (padded by the widest layer) for viewport culling.
    const pad = st.widths[0];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of st.line) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return {
      path, widths: st.widths, pts: st.line,
      bbox: [x0 - pad, x1 + pad, y0 - pad, y1 + pad] as [number, number, number, number],
    };
  });
  return { lanes, speckles: geo.speckles };
}
