// Procedural TOWN LAYOUT engine — BUILD 688.
//
// Generates the 2D blueprint of a town: staged road network, districts,
// building lots, and suburbs. Pure deterministic module: no React, no
// App.tsx imports. Same seed + config -> byte-identical TownLayout.
//
// Functional reference: Fantasy Town Generator's documented pipeline
// (staged roads -> lot detection -> district stages -> suburb stage).
// Our implementation is original: roads are grown from a proposal queue,
// lots are placed roadside (guaranteeing every lot fronts a road), and
// districts are coherent zones (civic core, commercial arterials,
// industrial edge sector, parks, residential fill).
//
// Coordinate space: town-local units, origin at town center, roughly
// [-110, 110]. Phase 2 maps this into chunk space via toChunkSpace().
// Road records are structurally compatible with townPlan.ts TownLane
// ({ points, width }); lot footprints use settlements.ts Rect, matching
// MOSSLIGHT_FIXED_RECTS_280.

import { mulberry32 } from './groundDetail';
import { rectsOverlap, type Rect } from './settlements';
import { fieldDoorPosition, newHouseDoorPosition, isNewStyleDoorBuilding } from './doorGeometry';

// ---------------------------------------------------------------- types

export interface TLPoint { x: number; y: number }
export type RoadKind = 'arterial' | 'street' | 'lane';
export interface TLRoad {
  id: string;
  kind: RoadKind;
  points: TLPoint[];
  width: number;
  // BUILD 692: marks a door-spur lane and the lot whose door it serves, so
  // the validator can exempt it from that lot's road-clearance check (the
  // spur legitimately terminates AT the door).
  spurFor?: string;
}
export type DistrictKind = 'residential' | 'commercial' | 'industrial' | 'civic' | 'park';
export type DistrictZone = 'circle' | 'arterial-corridor' | 'edge-sector';
export interface TLDistrict {
  id: string;
  kind: DistrictKind;
  center: TLPoint;   // representative point (labels, SVG)
  radius: number;    // zone radius for 'circle' (0 otherwise)
  zone: DistrictZone;
  sectorAngle?: number;  // edge-sector: center angle (radians)
  sectorWidth?: number;  // edge-sector: half-width (radians)
  corridorDist?: number; // arterial-corridor: max distance to an arterial
}
export type Facing = 'north' | 'south' | 'east' | 'west';
export type LotKind = 'building' | 'farm' | 'plaza';
export interface TLLot {
  id: string;
  district: DistrictKind;
  parcel: Rect;      // town-local lot parcel (axis-aligned)
  footprint: Rect;   // town-local building rect (axis-aligned, inside parcel)
  facing: Facing;    // door side: direction from footprint toward its road
  roadId: string;    // the road this lot fronts
  kind: LotKind;
  pinned?: boolean;  // true for fixed anchor lots (phase 2: Mosslight's 18)
}
/** A fixed building anchor: the engine routes streets to it but never moves
 *  it. Footprint is town-local. Door geometry comes from doorGeometry.ts via
 *  the lot id (building name). */
export interface PinnedLot {
  id: string;
  footprint: Rect;
  facing: Facing;
  district: DistrictKind;
  kind: LotKind;
}
export type PropKind = 'fountain' | 'stall' | 'lamp' | 'barrel' | 'well' | 'gatehouse'
  // BUILD 695: storybook market/garden kinds.
  | 'statue' | 'hedge' | 'cart';
export interface TLProp {
  id: string;
  kind: PropKind;
  x: number; y: number;  // town-local
  r: number;             // collision/render radius (chunk units)
  solid: boolean;        // blocks movement
  asset: string;         // e.g. 'props/lamp.png'
}
export interface TLWall {
  points: TLPoint[];
  width: number;
}
export type TownSize = 'hamlet' | 'village' | 'town';
export interface TownGenConfig {
  size: TownSize;
  arterialCount?: number; // default by size
  radius?: number;        // default SIZE_PARAMS[size].radius
  plazaCenter?: TLPoint;  // default { x: 0, y: 0 }
  plazaRadius?: number;   // default SIZE_PARAMS[size].plazaR
  pinnedLots?: PinnedLot[];
  maxFillerLots?: number; // default: size target max
  avoidRects?: Rect[];    // filler lots keep clear (town-local)
  suburbs?: boolean;      // default true
}
export interface TownLayout {
  version: 1;
  seed: number;
  config: TownGenConfig;
  center: TLPoint;
  boundary: TLPoint[];   // irregular town-edge polygon (CCW)
  roads: TLRoad[];
  districts: TLDistrict[];
  lots: TLLot[];
  plazas: { x: number; y: number; r: number }[];
  props: TLProp[];
  walls: TLWall[];
}

export const TOWN_LAYOUT_VERSION = 1 as const;

// ---------------------------------------------------------------- rng

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** Independent deterministic stream per generation stage. */
function stream(seed: number, tag: string): () => number {
  return mulberry32(hashStr(`${seed}:${tag}`));
}

// ---------------------------------------------------------------- geometry

const dist = (a: TLPoint, b: TLPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

function distPointSeg(p: TLPoint, a: TLPoint, b: TLPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distPointPolyline(p: TLPoint, pts: TLPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distPointSeg(p, pts[i], pts[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

/** Nearest point on a polyline to p (for facing computation). */
function nearestOnPolyline(p: TLPoint, pts: TLPoint[]): TLPoint {
  let best: TLPoint = pts[0];
  let bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const c = { x: a.x + t * dx, y: a.y + t * dy };
    const d = dist(p, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function pointInPolygon(p: TLPoint, poly: TLPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Minimum distance from p to a polygon's edges (for margin checks). */
function distToPolygonEdge(p: TLPoint, poly: TLPoint[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distPointSeg(p, poly[j], poly[i]);
    if (d < best) best = d;
  }
  return best;
}

/** Sample a polyline every `step` units (endpoints included). */
function samplePolyline(pts: TLPoint[], step: number): TLPoint[] {
  const out: TLPoint[] = [pts[0]];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const segLen = dist(a, b);
    let d = step - acc;
    while (d < segLen) {
      const t = d / segLen;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      d += step;
    }
    acc = (acc + segLen) % step;
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > 1e-6) out.push({ ...last });
  return out;
}

function rectCenter(r: Rect): TLPoint {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

/** Min distance from a rect to a set of points (0 if any point inside). */
function distRectToPoints(r: Rect, pts: TLPoint[]): number {
  let best = Infinity;
  for (const p of pts) {
    if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) return 0;
    const cx = Math.max(r.left, Math.min(r.right, p.x));
    const cy = Math.max(r.top, Math.min(r.bottom, p.y));
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------- config

interface SizeParams {
  radius: number;
  targetLots: [number, number];
  maxStreets: number;
  maxLanes: number;
  plazaR: number;
}
const SIZE_PARAMS: Record<TownSize, SizeParams> = {
  // Keep a readable road hierarchy: a few continuous streets, with only
  // occasional connectors. Door spurs are generated separately, so pinned
  // gameplay buildings retain access without filling the town with shortcuts.
  hamlet:  { radius: 52, targetLots: [8, 14],   maxStreets: 4,  maxLanes: 1, plazaR: 5 },
  village: { radius: 72, targetLots: [18, 30],  maxStreets: 8,  maxLanes: 3, plazaR: 7 },
  town:    { radius: 92, targetLots: [35, 60],  maxStreets: 12, maxLanes: 3, plazaR: 9 },
};

// ---------------------------------------------------------------- generation

export function generateTownLayout(seed: number, config?: Partial<TownGenConfig>): TownLayout {
  const size: TownSize = config?.size ?? 'village';
  const P = SIZE_PARAMS[size];
  const fullConfig: TownGenConfig = {
    size,
    arterialCount: config?.arterialCount ?? (size === 'hamlet' ? 2 : 3),
  };
  const R = config?.radius ?? P.radius;
  const rngB = stream(seed, 'boundary');
  const rngR = stream(seed, 'roads');
  const rngD = stream(seed, 'districts');
  const rngL = stream(seed, 'lots');
  const rngS = stream(seed, 'spurs');
  const rngP = stream(seed, 'props');
  const pinned: PinnedLot[] = config?.pinnedLots ?? [];
  const avoid: Rect[] = config?.avoidRects ?? [];
  // Central plaza (phase 2: pinnable so Mosslight keeps its historic square).
  const plazaC: TLPoint = config?.plazaCenter ?? { x: 0, y: 0 };
  const plazaR: number = config?.plazaRadius ?? P.plazaR;

  // ---- boundary: irregular polygon around the center
  const boundary: TLPoint[] = [];
  const nVert = 18;
  // Phase 2: the boundary must contain every pinned footprint (the validator
  // requires non-farm footprints inside). No-op without pinned lots.
  let minBoundaryR = 0;
  if (pinned.length > 0) {
    for (const q of pinned) {
      const f = q.footprint;
      for (const c of [{ x: f.left, y: f.top }, { x: f.right, y: f.top },
                       { x: f.left, y: f.bottom }, { x: f.right, y: f.bottom }]) {
        minBoundaryR = Math.max(minBoundaryR, Math.hypot(c.x, c.y) + 10);
      }
    }
  }
  for (let i = 0; i < nVert; i++) {
    const a = (i / nVert) * Math.PI * 2;
    const r = Math.max(R * (0.82 + 0.36 * rngB()), minBoundaryR);
    boundary.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const inside = (p: TLPoint, margin = 0): boolean =>
    pointInPolygon(p, boundary) && distToPolygonEdge(p, boundary) > margin;

  const roads: TLRoad[] = [];
  let roadSeq = 0;
  const addRoad = (kind: RoadKind, points: TLPoint[], width: number): TLRoad => {
    const r: TLRoad = { id: `road-${roadSeq++}`, kind, points, width };
    roads.push(r);
    return r;
  };

  // ---- Stage A: arterials — edge to edge via near-center
  const arterials: TLRoad[] = [];
  const pinnedHit = (s: TLPoint, margin = 2): boolean =>
    pinned.some((q) => {
      const r = q.footprint;
      return s.x > r.left - margin && s.x < r.right + margin &&
             s.y > r.top - margin && s.y < r.bottom + margin;
    });
  const growArterial = (baseA: number): TLPoint[] => {
    const a0 = baseA + (rngR() - 0.5) * 0.35;
    const a1 = baseA + Math.PI + (rngR() - 0.5) * 0.35;
    const start = { x: Math.cos(a0) * R * 1.02, y: Math.sin(a0) * R * 1.02 };
    const end = { x: Math.cos(a1) * R * 1.02, y: Math.sin(a1) * R * 1.02 };
    const via = { x: (rngR() - 0.5) * 10, y: (rngR() - 0.5) * 10 };
    const pts: TLPoint[] = [];
    const legs: [TLPoint, TLPoint][] = [[start, via], [via, end]];
    for (const [p0, p1] of legs) {
      const segs = 6;
      const phase = rngR() * Math.PI * 2;
      const amp = 3 + rngR() * 5;
      for (let s = 0; s <= segs; s++) {
        if (pts.length > 0 && s === 0) continue;
        const t = s / segs;
        const nx = -(p1.y - p0.y), ny = p1.x - p0.x;
        const nl = Math.hypot(nx, ny) || 1;
        const off = Math.sin(t * Math.PI + phase) * amp * Math.sin(t * Math.PI);
        pts.push({
          x: p0.x + (p1.x - p0.x) * t + (nx / nl) * off,
          y: p0.y + (p1.y - p0.y) * t + (ny / nl) * off,
        });
      }
    }
    return pts;
  };
  const nArt = fullConfig.arterialCount!;
  for (let i = 0; i < nArt; i++) {
    // Retry with a rotated base angle if the arterial would cross a pinned
    // building (deterministic: same seed -> same retries). With no pinned
    // lots the first attempt always succeeds, preserving 688 output.
    let pts: TLPoint[] | null = null;
    let bestCands: TLPoint[] | null = null;
    let bestHits = Infinity;
    for (let attempt = 0; attempt < 12 && !pts; attempt++) {
      const cands = growArterial((i / nArt) * Math.PI * 2 + rngR() * 0.5 + attempt * 0.45);
      // Validator needs width/2+1 = 3.0 clearance for arterials; retry at 3.5
      // with fine sampling so near-misses between samples can't slip through.
      if (pinned.length === 0) { pts = cands; break; }
      const hits = samplePolyline(cands, 0.5).filter((s) => pinnedHit(s, 3.5)).length;
      if (hits === 0) { pts = cands; break; }
      if (hits < bestHits) { bestHits = hits; bestCands = cands; }
    }
    arterials.push(addRoad('arterial', pts ?? bestCands ?? growArterial((i / nArt) * Math.PI * 2), 4));
  }
  // Cached road samples for legality checks (rebuilt as roads are added).
  let roadSamples: { road: TLRoad; pts: TLPoint[] }[] = [];
  const refreshSamples = () => {
    roadSamples = roads.map((r) => ({ road: r, pts: samplePolyline(r.points, 2) }));
  };
  refreshSamples();

  // Relax arterials away from pinned footprints (deterministic constraint
  // pass). Retry-with-rotation gets close; relaxation guarantees clearance.
  // Operates on a dense resampling (polyline vertices alone can't capture
  // segment midpoints cutting near a rect). No-op without pinned lots.
  if (pinned.length > 0) {
    for (const art of arterials) {
      const pts = samplePolyline(art.points, 1);
      for (let iter = 0; iter < 8; iter++) {
        let moved = false;
        for (const s of pts) {
          for (const q of pinned) {
            const r = q.footprint;
            const cx = Math.max(r.left, Math.min(r.right, s.x));
            const cy = Math.max(r.top, Math.min(r.bottom, s.y));
            const dx = s.x - cx, dy = s.y - cy;
            const d = Math.hypot(dx, dy);
            const need = 4.0;
            if (d < need && d > 1e-6) {
              s.x += (dx / d) * (need - d);
              s.y += (dy / d) * (need - d);
              moved = true;
            } else if (d <= 1e-6) {
              s.y = r.bottom + need;
              moved = true;
            }
          }
        }
        if (!moved) break;
      }
      art.points = pts;
    }
    refreshSamples();
  }


  /** Min distance from p to any road sample, ignoring samples near `exempt`. */
  const minDistToRoads = (p: TLPoint, onlyKind?: RoadKind, exempt?: TLPoint, exemptR = 0): number => {
    let best = Infinity;
    for (const rs of roadSamples) {
      if (onlyKind && rs.road.kind !== onlyKind) continue;
      for (const s of rs.pts) {
        if (exempt && dist(p, exempt) < exemptR && dist(s, exempt) < exemptR) continue;
        const d = dist(p, s);
        if (d < best) best = d;
      }
    }
    return best;
  };

  // ---- Stage B: streets — proposal queue (branch/continue), pruned later
  interface Proposal { x: number; y: number; dir: number; len: number; depth: number }
  const queue: Proposal[] = [];
  for (const art of arterials) {
    const pts = art.points;
    const total = pts.reduce((a, _, i) => (i === 0 ? 0 : a + dist(pts[i - 1], pts[i])), 0);
    for (let d = 14; d < total - 8; d += 13 + rngR() * 8) {
      // walk to distance d along the polyline
      let acc = 0, px = pts[0].x, py = pts[0].y, pdx = 1, pdy = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const sl = dist(pts[i], pts[i + 1]);
        if (acc + sl >= d) {
          const t = (d - acc) / sl;
          px = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
          py = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
          pdx = (pts[i + 1].x - pts[i].x) / sl;
          pdy = (pts[i + 1].y - pts[i].y) / sl;
          break;
        }
        acc += sl;
      }
      if (!inside({ x: px, y: py }, 10)) continue;
      const base = Math.atan2(pdy, pdx);
      for (const side of [-1, 1]) {
        if (rngR() < 0.72) {
          queue.push({
            x: px, y: py,
            dir: base + (side * Math.PI) / 2 + (rngR() - 0.5) * 0.5,
            len: 24 + rngR() * 16,
            depth: 0,
          });
        }
      }
    }
  }

  const buildCurved = (x: number, y: number, dir: number, len: number): TLPoint[] => {
    const pts: TLPoint[] = [{ x, y }];
    const segs = 4;
    const bend = (rngR() - 0.5) * 0.5;
    let cx = x, cy = y, cd = dir;
    for (let s = 1; s <= segs; s++) {
      cd += bend / segs + (rngR() - 0.5) * 0.12;
      const sl = len / segs;
      cx += Math.cos(cd) * sl;
      cy += Math.sin(cd) * sl;
      pts.push({ x: cx, y: cy });
    }
    return pts;
  };

  const streetCount = () => roads.filter((r) => r.kind === 'street').length;
  while (queue.length > 0 && streetCount() < P.maxStreets) {
    const pr = queue.shift()!;
    const pts = buildCurved(pr.x, pr.y, pr.dir, pr.len);
    const samples = samplePolyline(pts, 2);
    // legality: inside boundary, clear of other streets/lanes and of pinned
    // building footprints
    let ok = true;
    for (const s of samples) {
      if (!inside(s, 4)) { ok = false; break; }
      if (pinnedHit(s, 2.75)) { ok = false; break; }
      const nearStart = dist(s, { x: pr.x, y: pr.y }) < 7;
      const dmin = minDistToRoads(s, undefined, nearStart ? { x: pr.x, y: pr.y } : undefined, 7);
      // arterials may be crossed (intersections are good); streets/lanes keep distance
      if (!nearStart) {
        let dStreets = Infinity;
        for (const rs of roadSamples) {
          if (rs.road.kind === 'arterial') continue;
          for (const q of rs.pts) {
            const d = dist(s, q);
            if (d < dStreets) dStreets = d;
          }
        }
        if (dStreets < 5.5) { ok = false; break; }
      }
      void dmin;
    }
    if (!ok || samples.length < 3) continue;
    const road = addRoad('street', pts, 2.5);
    refreshSamples();
    if (pr.depth < 3) {
      const endP = pts[pts.length - 1];
      const endDir = Math.atan2(
        endP.y - pts[pts.length - 2].y, endP.x - pts[pts.length - 2].x);
      if (rngR() < 0.75) {
        queue.push({ x: endP.x, y: endP.y, dir: endDir + (rngR() - 0.5) * 0.4,
          len: pr.len * 0.8, depth: pr.depth + 1 });
      }
      for (const side of [-1, 1]) {
        if (rngR() < 0.55) {
          queue.push({ x: endP.x, y: endP.y,
            dir: endDir + (side * Math.PI) / 2 + (rngR() - 0.5) * 0.5,
            len: pr.len * 0.7, depth: pr.depth + 1 });
        }
      }
    }
    void road;
  }

  // ---- Stage C: lanes — short connectors between nearby street endpoints
  const laneCount = () => roads.filter((r) => r.kind === 'lane').length;
  const endpoints: TLPoint[] = [];
  for (const r of roads) {
    if (r.kind === 'arterial') continue;
    endpoints.push(r.points[0], r.points[r.points.length - 1]);
  }
  let laneTries = 0;
  outer: for (let i = 0; i < endpoints.length && laneCount() < P.maxLanes; i++) {
    for (let j = i + 1; j < endpoints.length && laneCount() < P.maxLanes; j++) {
      if (laneTries++ > 220) break outer;
      const a = endpoints[i], b = endpoints[j];
      const d = dist(a, b);
      if (d < 8 || d > 17) continue;
      const mid = { x: (a.x + b.x) / 2 + (rngR() - 0.5) * 4,
                    y: (a.y + b.y) / 2 + (rngR() - 0.5) * 4 };
      const pts = [a, mid, b];
      const samples = samplePolyline(pts, 2);
      let ok = true;
      for (const s of samples) {
        if (!inside(s, 3)) { ok = false; break; }
        if (pinnedHit(s, 2.25)) { ok = false; break; }
        if (dist(s, a) < 5 || dist(s, b) < 5) continue;
        let dStreets = Infinity;
        for (const rs of roadSamples) {
          if (rs.road.kind === 'arterial') continue;
          for (const q of rs.pts) {
            const dd = dist(s, q);
            if (dd < dStreets) dStreets = dd;
          }
        }
        if (dStreets < 4) { ok = false; break; }
      }
      if (!ok) continue;
      addRoad('lane', pts, 1.5);
      refreshSamples();
    }
  }

  // ---- prune: drop roads disconnected from the arterial skeleton
  // (union-find over roads joined by sample proximity < 4)
  const parent = roads.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const allSamples = roads.map((r) => samplePolyline(r.points, 3));
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      let joined = false;
      for (const s of allSamples[i]) {
        for (const t of allSamples[j]) {
          if (dist(s, t) < 4) { joined = true; break; }
        }
        if (joined) break;
      }
      if (joined) union(i, j);
    }
  }
  const artRoots = new Set(arterials.map((a) => find(roads.indexOf(a))));
  const kept = roads.filter((_, i) => artRoots.has(find(i)));
  roads.length = 0;
  roads.push(...kept);
  refreshSamples();

  // ---- districts: coherent zones
  const districts: TLDistrict[] = [];
  let dSeq = 0;
  const civicR = R * 0.22;
  districts.push({ id: `district-${dSeq++}`, kind: 'civic', center: { x: 0, y: 0 },
    radius: civicR, zone: 'circle' });
  const indAngle = rngD() * Math.PI * 2;
  districts.push({ id: `district-${dSeq++}`, kind: 'industrial', center:
    { x: Math.cos(indAngle) * R * 0.75, y: Math.sin(indAngle) * R * 0.75 },
    radius: 0, zone: 'edge-sector', sectorAngle: indAngle, sectorWidth: 0.55 });
  districts.push({ id: `district-${dSeq++}`, kind: 'commercial', center: { x: 0, y: 0 },
    radius: 0, zone: 'arterial-corridor', corridorDist: 11 });
  // BUILD 725: place green spaces as real reserved districts, not just
  // random circles that can disappear inside the civic core or overlap a
  // road, fixed landmark, or another park. Candidate order is seeded, so
  // the same seed/config still produces identical layouts.
  const desiredParks = size === 'town' ? 2 : size === 'village' ? 1 : (rngD() < 0.5 ? 1 : 0);
  const placedParks: TLDistrict[] = [];
  const parkCandidates = Array.from({ length: 56 }, () => {
    const angle = rngD() * Math.PI * 2;
    const radial = R * (0.32 + rngD() * 0.43);
    return {
      center: { x: Math.cos(angle) * radial, y: Math.sin(angle) * radial },
      radius: 8 + rngD() * 3.5,
    };
  }).sort((a, b) => b.radius - a.radius);
  for (const candidate of parkCandidates) {
    if (placedParks.length >= desiredParks) break;
    const { center: c, radius: pr } = candidate;
    if (!pointInPolygon(c, boundary) || distToPolygonEdge(c, boundary) < pr + 3) continue;
    if (dist(c, plazaC) < plazaR + pr + 5) continue;
    if (placedParks.some((p) => dist(c, p.center) < pr + p.radius + 5)) continue;
    // Keep a green district clear of fixed buildings and all road corridors.
    const hitsPinned = pinned.some((q) => {
      const f = q.footprint;
      const px = Math.max(f.left, Math.min(f.right, c.x));
      const py = Math.max(f.top, Math.min(f.bottom, c.y));
      return Math.hypot(c.x - px, c.y - py) < pr + 3;
    });
    if (hitsPinned) continue;
    const hitsRoad = roads.some((road) =>
      distPointPolyline(c, road.points) < pr + road.width / 2 + 3);
    if (hitsRoad) continue;
    // Reserve a comfortable buffer from the civic center and commercial
    // corridor so the park remains a distinct neighborhood destination.
    if (dist(c, { x: 0, y: 0 }) < civicR + pr + 4) continue;
    const park: TLDistrict = {
      id: `district-${dSeq++}`, kind: 'park', center: c, radius: pr, zone: 'circle',
    };
    placedParks.push(park);
    districts.push(park);
  }

  const arterialSamples = arterials.flatMap((a) =>
    samplePolyline(a.points, 3));
  const distToArterial = (p: TLPoint): number => {
    let best = Infinity;
    for (const s of arterialSamples) {
      const d = dist(p, s);
      if (d < best) best = d;
    }
    return best;
  };
  const districtAt = (p: TLPoint): DistrictKind => {
    if (dist(p, { x: 0, y: 0 }) < civicR) return 'civic';
    for (const d of districts) {
      if (d.kind === 'park' && d.zone === 'circle' && dist(p, d.center) < d.radius) return 'park';
    }
    if (distToArterial(p) < 11) return 'commercial';
    const ind = districts.find((d) => d.kind === 'industrial')!;
    const pa = Math.atan2(p.y, p.x);
    let da = Math.abs(pa - ind.sectorAngle!);
    if (da > Math.PI) da = 2 * Math.PI - da;
    if (da < ind.sectorWidth! && dist(p, { x: 0, y: 0 }) > R * 0.55) return 'industrial';
    return 'residential';
  };

  // ---- lots: roadside placement (every lot fronts a road by construction)
  const lots: TLLot[] = [];
  let lotSeq = 0;
  const [lotMin, lotMax] = P.targetLots;
  // The central plaza rect is reserved up front so no building lot can
  // ever overlap it (the plaza lot itself is pushed after placement).
  const plazaRect: Rect = {
    left: plazaC.x - plazaR, top: plazaC.y - plazaR,
    right: plazaC.x + plazaR, bottom: plazaC.y + plazaR,
  };

  // Pinned anchor lots: fixed footprints the engine routes streets to but
  // never moves. Registered before filler placement so overlap checks
  // protect them. roadId is assigned after the door-spur stage.
  for (const pl of pinned) {
    const f = pl.footprint;
    lots.push({
      id: pl.id, district: pl.district,
      parcel: { left: f.left - 3, top: f.top - 3, right: f.right + 3, bottom: f.bottom + 3 },
      footprint: { ...f }, facing: pl.facing, roadId: '', kind: pl.kind, pinned: true,
    });
  }

  // ---- Stage B2: pinned door spurs — guarantee every pinned door has a
  // lane endpoint at its door (the BUILD 689 geometry contract). Organic
  // streets may already reach some doors; spurs cover the rest with short
  // curved lanes from the nearest road. Spurs terminate AT the door point
  // (like the authored plan's spurs) and may cross other roads at grade
  // (intersections); the validator exempts the door zone and the lot's own
  // spur from clearance.
  const doorPointForPinned = (pl: PinnedLot): TLPoint =>
    isNewStyleDoorBuilding(pl.id)
      ? newHouseDoorPosition(pl.footprint)
      : fieldDoorPosition(pl.footprint);
  // Shared door-spur builder (B2 pinned + B3 filler). Builds a short curved
  // lane from the nearest road to the door point and marks it with spurFor
  // so the validator exempts it from that lot's road clearance. Returns the
  // new road, or null if no legal spur could be built. Uses the shared
  // layout RNG (rngS) — call order is deterministic.
  const buildDoorSpur = (
    door: TLPoint,
    ownId: string,
    avoid: { id: string; footprint: Rect }[],
  ): TLRoad | null => {
    // collect the nearest road samples as spur starts (try several)
    const starts: { s: TLPoint; d: number }[] = [];
    for (const rs of roadSamples) {
      for (const s of rs.pts) {
        const d = dist(s, door);
        if (d <= 2.5) continue;
        // the spur start itself must be in a legal position (not inside
        // another building's margin)
        let legalStart = true;
        for (const q of avoid) {
          if (q.id === ownId) continue;
          const r = q.footprint, m = 2.5;
          if (s.x > r.left - m && s.x < r.right + m &&
              s.y > r.top - m && s.y < r.bottom + m) { legalStart = false; break; }
        }
        if (legalStart) starts.push({ s, d });
      }
    }
    starts.sort((a, b) => a.d - b.d);
    const E = { x: door.x, y: door.y + 0.3 };
    let built: TLRoad | null = null;
    // approach waypoints: 8 compass points around the door — the spur may
    // need to swing around a neighboring building to reach the door.
    const approaches: TLPoint[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      approaches.push({ x: door.x + Math.cos(a) * 7, y: door.y + Math.sin(a) * 7 });
    }
    for (const { s: start } of starts.slice(0, 4)) {
      if (built) break;
      const mx = (start.x + E.x) / 2, my = (start.y + E.y) / 2;
      const dx = E.x - start.x, dy = E.y - start.y;
      const dl = Math.hypot(dx, dy) || 1;
      const nx = -dy / dl, ny = dx / dl;
      const bow = Math.min(6, dl * 0.3) * (rngS() < 0.5 ? 1 : -1);
      const cands: TLPoint[][] = [
        [start, E],
        [start, { x: mx + nx * bow, y: my + ny * bow }, E],
        [start, { x: mx - nx * bow, y: my - ny * bow }, E],
        ...approaches.map((ap) => [start, ap, E]),
      ];
      for (const c of cands) {
        const samples = samplePolyline(c, 1.5);
        let ok = true;
        for (const s of samples) {
          if (dist(s, E) < 3.0) continue;      // door exemption zone
          if (dist(s, start) < 4.0) continue;  // joining the existing road
          if (!inside(s, 1)) { ok = false; break; }
          // clear of all avoided footprints (validator needs width/2+1 =
          // 2.0 for a width-2 lane; keep 2.5). The target's own footprint
          // is skipped: the spur legitimately terminates at its door.
          for (const q of avoid) {
            if (q.id === ownId) continue;
            const r = q.footprint;
            const m = 2.5;
            if (s.x > r.left - m && s.x < r.right + m &&
                s.y > r.top - m && s.y < r.bottom + m) { ok = false; break; }
          }
          if (!ok) break;
          // (may cross other roads at grade — intersections are fine)
        }
        if (ok) {
          built = addRoad('lane', c, 2);
          built.spurFor = ownId;
          break;
        }
      }
    }
    if (built) refreshSamples();
    return built;
  };
  const pinnedDoors = pinned.map((pl) => ({ pl, door: doorPointForPinned(pl) }));
  for (const { pl, door } of pinnedDoors) {
    let covered = false;
    for (const r of roads) {
      for (const e of [r.points[0], r.points[r.points.length - 1]]) {
        if (dist(e, door) <= 2.0) { covered = true; break; }
      }
      if (covered) break;
    }
    if (!covered) {
      buildDoorSpur(door, pl.id, pinned);
    }
    // assign the pinned lot its road: prefer a road with an endpoint at the
    // door (the spur, or an organic street that already reaches it); fall
    // back to the nearest road by polyline distance. The validator checks
    // the facing against this road, so it must be the door-serving one.
    let br: TLRoad | null = null;
    for (const r of roads) {
      for (const e of [r.points[0], r.points[r.points.length - 1]]) {
        if (dist(e, door) <= 2.0) { br = r; break; }
      }
      if (br) break;
    }
    if (!br) {
      let bd = Infinity;
      for (const r of roads) {
        const d = distPointPolyline(door, r.points);
        if (d < bd) { bd = d; br = r; }
      }
    }
    const lot = lots.find((l) => l.pinned && l.id === pl.id);
    if (lot) lot.roadId = br ? br.id : (roads[0]?.id ?? 'road-0');
  }


  const footprintSize = (dk: DistrictKind): [number, number] => {
    switch (dk) {
      case 'residential': return [6 + rngL() * 3, 5 + rngL() * 2.5];
      case 'commercial': return [8 + rngL() * 4, 6 + rngL() * 3];
      case 'industrial': return [12 + rngL() * 6, 9 + rngL() * 4];
      default: return [7 + rngL() * 3, 6 + rngL() * 2];
    }
  };
  const lotDepthFor = (dk: DistrictKind): number => {
    switch (dk) {
      case 'residential': return 11;
      case 'commercial': return 13;
      case 'industrial': return 19;
      default: return 12;
    }
  };
  const lotFrontageFor = (dk: DistrictKind): number => {
    switch (dk) {
      case 'residential': return 11;
      case 'commercial': return 14;
      case 'industrial': return 20;
      default: return 12;
    }
  };

  const tryPlaceLot = (road: TLRoad, sx: number, sy: number, tx: number, ty: number,
      sideSign: number, dkHint?: DistrictKind): boolean => {
    // station (sx,sy), tangent (tx,ty); lot sits to the side
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl * sideSign, ny = tx / tl * sideSign;
    const probe = { x: sx + nx * 6, y: sy + ny * 6 };
    const dk = dkHint ?? districtAt(probe);
    if (dk === 'civic' || dk === 'park') return false;
    const depth = lotDepthFor(dk);
    const frontage = lotFrontageFor(dk);
    const [fw, fh] = footprintSize(dk);
    const cx = sx + nx * (road.width / 2 + 2 + depth / 2);
    const cy = sy + ny * (road.width / 2 + 2 + depth / 2);
    const hw = Math.min(fw, frontage - 3) / 2, hh = Math.min(fh, depth - 4) / 2;
    const footprint: Rect = { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
    const parcel: Rect = { left: cx - frontage / 2, top: cy - depth / 2,
      right: cx + frontage / 2, bottom: cy + depth / 2 };
    // inside town?
    for (const c of [{ x: footprint.left, y: footprint.top }, { x: footprint.right, y: footprint.top },
                     { x: footprint.left, y: footprint.bottom }, { x: footprint.right, y: footprint.bottom }]) {
      if (!inside(c, 2)) return false;
    }
    // clear of all roads
    for (const rs of roadSamples) {
      const clearance = rs.road.width / 2 + 1.0;
      if (distRectToPoints(footprint, rs.pts) < clearance) return false;
    }
    // no footprint overlaps (shared overlap logic from settlements.ts),
    // and never on the reserved central plaza
    for (const l of lots) {
      if (rectsOverlap(footprint, l.footprint, 1.0)) return false;
      if (rectsOverlap(parcel, l.parcel, 0.5)) return false;
    }
    if (rectsOverlap(footprint, plazaRect, 1.0)) return false;
    // phase 2: filler lots keep clear of the avoid rects (pinned anchors'
    // expanded footprints) so generated houses never crowd fixed buildings
    for (const a of avoid) {
      if (rectsOverlap(footprint, a, 0) || rectsOverlap(parcel, a, 0)) return false;
    }
    // facing: dominant axis from footprint center toward the road
    const fc = rectCenter(footprint);
    const near = nearestOnPolyline(fc, road.points);
    const vx = near.x - fc.x, vy = near.y - fc.y;
    const facing: Facing = Math.abs(vx) > Math.abs(vy)
      ? (vx > 0 ? 'east' : 'west') : (vy > 0 ? 'south' : 'north');
    lots.push({ id: `lot-${lotSeq++}`, district: dk, parcel, footprint,
      facing, roadId: road.id, kind: 'building' });
    return true;
  };

  const roadOrder = [...roads].sort((a, b) => {
    const rank = (k: RoadKind) => (k === 'arterial' ? 0 : k === 'street' ? 1 : 2);
    return rank(a.kind) - rank(b.kind);
  });
  for (const road of roadOrder) {
    const fillerCap = config?.maxFillerLots ?? lotMax;
    const fillerCount = () => lots.filter((l) => l.kind === 'building' && !l.pinned).length;
    if (fillerCount() >= fillerCap) break;
    const pts = road.points;
    const total = pts.reduce((a, _, i) => (i === 0 ? 0 : a + dist(pts[i - 1], pts[i])), 0);
    const step = 12;
    for (let d = 6; d < total - 4; d += step + rngL() * 5) {
      if (fillerCount() >= fillerCap) break;
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const sl = dist(pts[i], pts[i + 1]);
        if (acc + sl >= d) {
          const t = (d - acc) / sl;
          const sx = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
          const sy = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
          const tx = (pts[i + 1].x - pts[i].x) / sl, ty = (pts[i + 1].y - pts[i].y) / sl;
          // jitter side order deterministically
          const sides = rngL() < 0.5 ? [-1, 1] : [1, -1];
          for (const s of sides) tryPlaceLot(road, sx, sy, tx, ty, s);
          break;
        }
        acc += sl;
      }
    }
  }

  // ---- center plaza lot (civic landmark; rect was reserved during placement)
  lots.push({
    id: `lot-${lotSeq++}`, district: 'civic',
    parcel: { left: plazaC.x - plazaR - 2, top: plazaC.y - plazaR - 2,
              right: plazaC.x + plazaR + 2, bottom: plazaC.y + plazaR + 2 },
    footprint: { left: plazaC.x - plazaR, top: plazaC.y - plazaR,
                 right: plazaC.x + plazaR, bottom: plazaC.y + plazaR },
    facing: 'south', roadId: arterials[0]?.id ?? roads[0]?.id ?? 'road-0', kind: 'plaza',
  });
  const plazas = [{ x: plazaC.x, y: plazaC.y, r: plazaR }];

  // ---- Stage B3: filler door spurs — the BUILD 689 geometry contract for
  // the roadside filler lots (placed after B2, so they got no spur yet).
  // Every filler building door gets a lane endpoint within 2.0u via the
  // shared builder. Filler lots are never new-style, so the door is always
  // fieldDoorPosition. The lot keeps its original roadId (facing and parcel
  // checks stay valid); the spur is marked spurFor so the validator exempts
  // it from that lot's road clearance, and the door-zone exemption covers
  // the terminal samples.
  {
    const avoidAll = lots.map((l) => ({ id: l.id, footprint: l.footprint }));
    for (const lot of lots) {
      if (lot.kind !== 'building' || lot.pinned) continue;
      const door = fieldDoorPosition(lot.footprint);
      let covered = false;
      for (const r of roads) {
        for (const e of [r.points[0], r.points[r.points.length - 1]]) {
          if (dist(e, door) <= 2.0) { covered = true; break; }
        }
        if (covered) break;
      }
      if (!covered) buildDoorSpur(door, lot.id, avoidAll);
    }
  }


  // ---- suburbs: farm lots along outward stubs past the boundary
  if (config?.suburbs ?? true) {
  const farmLots: TLLot[] = [];
  for (const art of arterials) {
    const endP = art.points[art.points.length - 1];
    const prev = art.points[art.points.length - 2];
    const dir = Math.atan2(endP.y - prev.y, endP.x - prev.x);
    const stubLen = 16 + rngL() * 10;
    const stub: TLPoint[] = [];
    for (let s = 0; s <= 4; s++) {
      const t = (s / 4) * stubLen;
      stub.push({ x: endP.x + Math.cos(dir + (rngL() - 0.5) * 0.2) * t,
                  y: endP.y + Math.sin(dir + (rngL() - 0.5) * 0.2) * t });
    }
    const stubRoad = addRoad('lane', stub, 1.5);
    refreshSamples();
    const nFarms = 1 + Math.floor(rngL() * 2.4);
    for (let f = 0; f < nFarms; f++) {
      const t = 0.35 + 0.5 * (f / Math.max(1, nFarms - 1)) + (rngL() - 0.5) * 0.1;
      const si = Math.min(stub.length - 1, Math.floor(t * (stub.length - 1)));
      const sp = stub[si];
      const side = rngL() < 0.5 ? -1 : 1;
      const nx = -Math.sin(dir) * side, ny = Math.cos(dir) * side;
      const cx = sp.x + nx * 14, cy = sp.y + ny * 14;
      const footprint: Rect = { left: cx - 4, top: cy - 3, right: cx + 4, bottom: cy + 3 };
      const parcel: Rect = { left: cx - 11, top: cy - 11, right: cx + 11, bottom: cy + 11 };
      const far = dist({ x: 0, y: 0 }, { x: cx, y: cy });
      if (far > R + 30) continue;
      let ok = true;
      for (const l of [...lots, ...farmLots]) {
        if (rectsOverlap(footprint, l.footprint, 2)) { ok = false; break; }
      }
      // farms must also clear all roads (the stub they front is 10+ units
      // from the footprint edge, so it passes naturally)
      if (ok) {
        for (const rs of roadSamples) {
          if (distRectToPoints(footprint, rs.pts) < rs.road.width / 2 + 1.0) { ok = false; break; }
        }
      }
      if (!ok) continue;
      const fc = rectCenter(footprint);
      const near = nearestOnPolyline(fc, stubRoad.points);
      const vx = near.x - fc.x, vy = near.y - fc.y;
      farmLots.push({ id: `lot-${lotSeq++}`, district: 'residential', parcel, footprint,
        facing: Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'east' : 'west') : (vy > 0 ? 'south' : 'north'),
        roadId: stubRoad.id, kind: 'farm' });
    }
  }
  lots.push(...farmLots);
  } // end suburbs

  // ---- Stage E: props — market square, street lamps, clutter, gate.
  // Deterministic; placed relative to generated features. Only runs when
  // the layout has a plaza (always, currently).
  const props: TLProp[] = [];
  const walls: TLWall[] = [];
  let propSeq = 0;
  const addProp = (kind: PropKind, x: number, y: number, r: number,
      solid: boolean, asset: string): void => {
    props.push({ id: `prop-${propSeq++}`, kind, x, y, r, solid, asset });
  };
  const footprintAt = (x: number, y: number, margin = 0.5): boolean =>
    lots.some((l) => {
      const f = l.footprint;
      return x > f.left - margin && x < f.right + margin &&
             y > f.top - margin && y < f.bottom + margin;
    });
  const nearPinnedDoor = (x: number, y: number, r = 2.5): boolean =>
    pinnedDoors.some(({ door }) => Math.hypot(x - door.x, y - door.y) < r);
  // BUILD 695: lane-corridor guard (689 contract) — exact point-to-segment
  // distance over every road. A prop "blocks a path" when it enters the
  // corridor; need = extra clearance beyond the road half-width.
  const clearOfRoads = (x: number, y: number, need: number): boolean => {
    for (const r of roads) {
      const pts = r.points, half = r.width / 2;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i].x, ay = pts[i].y;
        const dx = pts[i + 1].x - ax, dy = pts[i + 1].y - ay;
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < half + need) return false;
      }
    }
    return true;
  };
  // All three guards a market/garden prop must pass (689 contract: no prop
  // may block a door, path, or exit).
  const propSpotOk = (x: number, y: number, roadNeed: number, fpMargin = 0.5): boolean =>
    clearOfRoads(x, y, roadNeed) && !footprintAt(x, y, fpMargin) && !nearPinnedDoor(x, y);

  // BUILD 695: angel statue at the plaza center (decor only, like the
  // fountain it replaces — the north-south street passes ~1u east of the
  // center, so a solid centerpiece would block the path).
  addProp('statue', plazaC.x, plazaC.y, 2.0, false, 'props/statue-angel.png');
  // Market stalls in denser rows around the plaza (decor only). Candidates
  // form full rows/columns; the lane/door/footprint guards carve the gaps
  // where streets cross, so no stall ever sits on a path.
  const stallAssets = ['props/stall-red.png', 'props/stall-blue.png',
    'props/stall-green.png', 'props/market-stall.png'];
  const stallCands: [number, number][] = [];
  for (let i = 0; i < 7; i++) stallCands.push([-16 + i * (40 / 6), -18]);  // north row
  for (let i = 0; i < 8; i++) stallCands.push([-18 + i * (44 / 7), 17]);  // south row
  for (let i = 0; i < 4; i++) stallCands.push([-19, -10 + i * (20 / 3)]);  // west column
  for (let i = 0; i < 4; i++) stallCands.push([27, -10 + i * (20 / 3)]);   // east column
  for (let i = 0; i < 4; i++) stallCands.push([-4 + i * 4, -26]);          // north row 2 (short)
  for (let i = 0; i < 10; i++) stallCands.push([-22 + i * (48 / 9), 25]);  // south row 2 (full)
  let stallAssetIdx = 0;
  for (const [dx, dy] of stallCands) {
    const x = plazaC.x + dx, y = plazaC.y + dy;
    if (!propSpotOk(x, y, 1.5)) continue;
    addProp('stall', x, y, 1.4, false, stallAssets[stallAssetIdx++ % stallAssets.length]);
  }
  // BUILD 695: wooden carts near the market edge (solid, like barrels).
  for (const [dx, dy] of [[-28, -8], [-14, 22], [-8, -24]] as [number, number][]) {
    const x = plazaC.x + dx, y = plazaC.y + dy;
    if (!propSpotOk(x, y, 2.2, 1.5)) continue;
    addProp('cart', x, y, 1.2, true, 'props/cart-wood.png');
  }
  // BUILD 695: hedge-maze garden NE of the plaza (storybook top-right).
  // Concentric broken hedge rings around a central fountain; the gaps are
  // the maze entrances (offset per ring so it reads as a maze, not a box).
  // Solid walls, walkable gaps.
  const gardenC = { x: plazaC.x + 31, y: plazaC.y - 54 };
  const hedgeSeen = new Set<string>(); // ring corners are shared — place once
  const hedgeLine = (x0: number, y0: number, x1: number, y1: number,
      gapAlong: number | null, gapHalf: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / 2.5) + 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), along = t * len;
      if (gapAlong !== null && Math.abs(along - gapAlong) < gapHalf) continue;
      const x = gardenC.x + x0 + (x1 - x0) * t;
      const y = gardenC.y + y0 + (y1 - y0) * t;
      const key = `${x.toFixed(3)},${y.toFixed(3)}`;
      if (hedgeSeen.has(key)) continue;
      hedgeSeen.add(key);
      if (!propSpotOk(x, y, 1.0, 1.0)) continue;
      // r=2.6: the hedge sprite's content is ~48% of its frame, so the
      // visible wall (~2.5u) matches the 2.5u piece spacing — continuous
      // maze walls, not scattered bushes.
      addProp('hedge', x, y, 2.6, true, 'props/hedge-straight.png');
    }
  };
  hedgeLine(-10, -10, 10, -10, 10, 3);  // outer north, entrance gap
  hedgeLine(-10, 10, 10, 10, null, 0);   // outer south, full
  hedgeLine(-10, -10, -10, 10, null, 0); // outer west, full
  hedgeLine(10, -10, 10, 10, 10, 3);    // outer east, entrance gap
  hedgeLine(-5, -5, 5, -5, null, 0);    // inner north, full
  hedgeLine(-5, 5, 5, 5, 5, 3);         // inner south, entrance gap (offset)
  hedgeLine(-5, -5, -5, 5, 5, 3);       // inner west, entrance gap (offset)
  hedgeLine(5, -5, 5, 5, null, 0);       // inner east, full
  // The old plaza fountain becomes the garden centerpiece (decor only).
  if (propSpotOk(gardenC.x, gardenC.y, 1.5, 1.5) && !nearPinnedDoor(gardenC.x, gardenC.y, 4)) {
    addProp('fountain', gardenC.x, gardenC.y, 1.2, false, 'props/fountain.png');
  }
  // Plaza corner lamps (solid, like the old plan's lamps).
  for (const [dx, dy] of [[-20, -12], [20, -12], [-20, 12], [20, 12]] as [number, number][]) {
    addProp('lamp', plazaC.x + dx, plazaC.y + dy, 0.8, true, 'props/lamp.png');
  }
  // Street lamps along arterials and streets, alternating sides.
  for (const road of roads) {
    if (road.kind === 'lane') continue;
    const pts = road.points;
    const total = pts.reduce((a, _, i) => (i === 0 ? 0 : a + dist(pts[i - 1], pts[i])), 0);
    let side = 1;
    for (let d = 10; d < total - 5; d += 20 + rngP() * 8) {
      let acc = 0, px = 0, py = 0, pdx = 1, pdy = 0, found = false;
      for (let i = 0; i < pts.length - 1; i++) {
        const sl = dist(pts[i], pts[i + 1]);
        if (acc + sl >= d) {
          const t = (d - acc) / sl;
          px = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
          py = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
          pdx = (pts[i + 1].x - pts[i].x) / sl;
          pdy = (pts[i + 1].y - pts[i].y) / sl;
          found = true;
          break;
        }
        acc += sl;
      }
      if (!found) continue;
      const lx = px + -pdy * 3 * side, ly = py + pdx * 3 * side;
      side = -side;
      if (footprintAt(lx, ly) || nearPinnedDoor(lx, ly)) continue;
      if (Math.hypot(lx - plazaC.x, ly - plazaC.y) < plazaR + 4) continue;
      addProp('lamp', lx, ly, 0.8, true, 'props/lamp.png');
    }
  }
  // Barrel clutter near buildings (north side, away from the south doors).
  for (const lot of lots) {
    if (lot.kind !== 'building' || rngP() > 0.5) continue;
    const f = lot.footprint;
    const bx = (rngP() < 0.5 ? f.left : f.right) + (rngP() - 0.5) * 2;
    const by = f.top - 1.5 - rngP();
    if (footprintAt(bx, by)) continue;
    addProp('barrel', bx, by, 0.7, true, 'props/barrel.png');
  }
  // Well in the largest park (garden corner, like the old plan).
  const park = districts
    .filter((d) => d.kind === 'park' && d.zone === 'circle')
    .sort((a, b) => b.radius - a.radius)[0];
  if (park && !footprintAt(park.center.x, park.center.y, 2)) {
    addProp('well', park.center.x, park.center.y, 1.5, true, 'props/well.png');
  }
  // Gatehouse at the southernmost arterial exit, with flanking wall segments
  // (visual only — walls were never solid, matching the old plan).
  let gate: TLRoad | null = null;
  let gateY = -Infinity;
  for (const a of arterials) {
    const e = a.points[a.points.length - 1];
    if (e.y > gateY) { gateY = e.y; gate = a; }
  }
  if (gate) {
    const pts = gate.points;
    const e = pts[pts.length - 1], p = pts[pts.length - 2];
    const dx = e.x - p.x, dy = e.y - p.y;
    const dl = Math.hypot(dx, dy) || 1;
    const nx = -dy / dl, ny = dx / dl;
    addProp('gatehouse', e.x, e.y, 2.5, true, 'buildings/gatehouse.png');
    const gap = 5, run = 14;
    for (const s of [-1, 1]) {
      walls.push({
        points: [
          { x: e.x + nx * s * gap, y: e.y + ny * s * gap },
          { x: e.x + nx * s * (gap + run), y: e.y + ny * s * (gap + run) },
        ],
        width: 2,
      });
    }
  }

  return {
    version: TOWN_LAYOUT_VERSION,
    seed,
    config: fullConfig,
    center: { x: 0, y: 0 },
    boundary,
    roads,
    districts,
    lots,
    plazas,
    props,
    walls,
  };
}

// ---------------------------------------------------------------- validation

/** Validate a generated layout. Returns a list of error strings (empty = valid). */
export function validateTownLayout(layout: TownLayout): string[] {
  const errors: string[] = [];
  if (layout.version !== TOWN_LAYOUT_VERSION) {
    errors.push(`unsupported version ${layout.version}`);
  }
  const roadById = new Map(layout.roads.map((r) => [r.id, r]));
  const allSamples = layout.roads.map((r) => samplePolyline(r.points, 2));

  // unique ids
  const ids = new Set<string>();
  for (const l of layout.lots) {
    if (ids.has(l.id)) errors.push(`duplicate lot id ${l.id}`);
    ids.add(l.id);
  }

  // footprint inside parcel, no overlaps, clear of roads, fronts a road
  for (const lot of layout.lots) {
    const f = lot.footprint, p = lot.parcel;
    if (!(f.left >= p.left + 1 && f.top >= p.top + 1 && f.right <= p.right - 1 && f.bottom <= p.bottom - 1)) {
      errors.push(`lot ${lot.id}: footprint not inset inside parcel`);
    }
    if (!roadById.has(lot.roadId)) {
      errors.push(`lot ${lot.id}: unknown roadId ${lot.roadId}`);
      continue;
    }
    const road = roadById.get(lot.roadId)!;
    const isPlaza = lot.kind === 'plaza';
    // Road clearance + facing apply to buildings, not the open plaza square
    // (arterials legitimately border/cross the central plaza).
    if (!isPlaza) {
      // Door spurs legitimately terminate AT the door, so samples within
      // 3.0 of the lot's door are exempt from clearance (mirrors the
      // authored plan's near-door exemption). Applies to pinned (B2) and
      // filler (B3) building lots alike.
      const doorExempt: TLPoint[] = [];
      if (lot.kind === 'building') {
        doorExempt.push(lot.pinned && isNewStyleDoorBuilding(lot.id)
          ? newHouseDoorPosition(lot.footprint)
          : fieldDoorPosition(lot.footprint));
      }
      // road clearance: footprint must clear every road by half-width + 1
      for (let i = 0; i < layout.roads.length; i++) {
        // A lot's door spur (marked spurFor by the shared builder) legitimately
        // terminates at the door (generation-time legality is the guard).
        if (layout.roads[i].spurFor === lot.id) continue;
        // A pinned lot's own road is its door spur (B2 assigns roadId to it).
        if (lot.pinned && layout.roads[i].id === lot.roadId) continue;
        const clearance = layout.roads[i].width / 2 + 1.0;
        let viol = false;
        for (const s of allSamples[i]) {
          if (doorExempt.some((e) => dist(s, e) < 3.0)) continue;
          if (distRectToPoints(f, [s]) < clearance - 1e-6) { viol = true; break; }
        }
        if (viol) {
          errors.push(`lot ${lot.id}: footprint too close to ${layout.roads[i].id}`);
          break;
        }
      }
      // facing: the road must lie in the facing direction from the footprint.
      // Pinned lots are covered by the dedicated door-endpoint check below
      // (a spur terminating AT the door makes the dot-product degenerate).
      if (!lot.pinned) {
        const fc = rectCenter(f);
        const near = nearestOnPolyline(fc, road.points);
        const vx = near.x - fc.x, vy = near.y - fc.y;
        const dirVec: Record<Facing, TLPoint> = {
          north: { x: 0, y: -1 }, south: { x: 0, y: 1 },
          east: { x: 1, y: 0 }, west: { x: -1, y: 0 },
        };
        const fv = dirVec[lot.facing];
        const dot = vx * fv.x + vy * fv.y;
        if (dot <= 0.3 * Math.hypot(vx, vy)) {
          errors.push(`lot ${lot.id}: facing ${lot.facing} does not point at road ${lot.roadId}`);
        }
      }
    }
    // every lot's PARCEL must front its road (front edge sits roadHalf+2 out
    // by construction; the footprint may sit deeper in a deep parcel)
    const roadIdx = layout.roads.indexOf(road);
    const parcelTouch = distRectToPoints(p, allSamples[roadIdx]);
    if (parcelTouch > road.width / 2 + 3) {
      errors.push(`lot ${lot.id}: parcel does not front road ${lot.roadId} (gap ${parcelTouch.toFixed(1)})`);
    }
    // non-farm footprints inside the boundary
    if (lot.kind !== 'farm') {
      for (const c of [{ x: f.left, y: f.top }, { x: f.right, y: f.top },
                       { x: f.left, y: f.bottom }, { x: f.right, y: f.bottom }]) {
        if (!pointInPolygon(c, layout.boundary)) {
          errors.push(`lot ${lot.id}: footprint corner outside boundary`);
          break;
        }
      }
    }
  }

  // pairwise footprint overlaps (shared logic from settlements.ts)
  for (let i = 0; i < layout.lots.length; i++) {
    for (let j = i + 1; j < layout.lots.length; j++) {
      if (rectsOverlap(layout.lots[i].footprint, layout.lots[j].footprint, 0.5)) {
        errors.push(`lots ${layout.lots[i].id} and ${layout.lots[j].id} overlap`);
      }
    }
  }

  // road network connected: union-find over roads joined by sample proximity
  const n = layout.roads.length;
  const parent = layout.roads.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let joined = false;
      for (const s of allSamples[i]) {
        for (const t of allSamples[j]) {
          if (dist(s, t) < 4) { joined = true; break; }
        }
        if (joined) break;
      }
      if (joined) parent[find(i)] = find(j);
    }
  }
  const roots = new Set(layout.roads.map((_, i) => find(i)));
  if (roots.size > 1) errors.push(`road network has ${roots.size} disconnected components`);

  // pinned buildings: a lane endpoint must reach each door (the 689 contract)
  for (const lot of layout.lots) {
    if (!lot.pinned || lot.kind !== 'building') continue;
    const f = lot.footprint;
    const door = isNewStyleDoorBuilding(lot.id)
      ? newHouseDoorPosition(f)
      : fieldDoorPosition(f);
    let best = Infinity;
    for (const r of layout.roads) {
      for (const e of [r.points[0], r.points[r.points.length - 1]]) {
        const d = dist(e, door);
        if (d < best) best = d;
      }
    }
    if (best > 2.0) {
      errors.push(`pinned lot ${lot.id}: no lane endpoint at door (best ${best.toFixed(2)})`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------- export

export interface ExportedTownLayout {
  type: 'adventure-town-layout';
  version: 1;
  layout: TownLayout;
}

/** Serialize a layout to versioned JSON (the phase-2 blueprint). */
export function exportTownLayout(layout: TownLayout): string {
  const doc: ExportedTownLayout = { type: 'adventure-town-layout', version: TOWN_LAYOUT_VERSION, layout };
  return JSON.stringify(doc);
}

/** Parse a previously exported layout. Throws on bad type/version. */
export function importTownLayout(json: string): TownLayout {
  const doc = JSON.parse(json) as ExportedTownLayout;
  if (doc.type !== 'adventure-town-layout') throw new Error(`bad layout type: ${doc.type}`);
  if (doc.version !== TOWN_LAYOUT_VERSION) throw new Error(`unsupported layout version: ${doc.version}`);
  return doc.layout;
}

// ---------------------------------------------------------------- phase-2 bridges

/** Road -> townPlan.ts TownLane-compatible record ({ points, width }). */
export function roadToTownLane(road: TLRoad): { points: TLPoint[]; width: number } {
  return { points: road.points.map((p) => ({ ...p })), width: road.width };
}

/** Lot -> building rect (settlements.ts Rect, like MOSSLIGHT_FIXED_RECTS_280). */
export function lotToBuildingRect(lot: TLLot): Rect {
  return { ...lot.footprint };
}

/** Engine prop -> settlement decor prop record (asset path + radius + solidity). */
export function propToTownProp(p: TLProp): {
  id: string; asset: string; x: number; y: number; r: number; solid: boolean;
} {
  return { id: p.id, asset: p.asset, x: p.x, y: p.y, r: p.r, solid: p.solid };
}

/** Engine wall -> decor wall record ({ points, width }). */
export function wallToTownWall(w: TLWall): { points: TLPoint[]; width: number } {
  return { points: w.points.map((p) => ({ ...p })), width: w.width };
}

/**
 * Shift a layout into chunk space: town-local origin -> chunk center.
 * Default 280 matches FIELD_SIZE so rects drop straight into chunk coords.
 */
export function toChunkSpace(layout: TownLayout, chunkSize = 280): {
  roads: TLRoad[];
  lots: TLLot[];
  boundary: TLPoint[];
  plazas: { x: number; y: number; r: number }[];
  props: TLProp[];
  walls: TLWall[];
} {
  const o = chunkSize / 2;
  const shiftP = (p: TLPoint): TLPoint => ({ x: p.x + o, y: p.y + o });
  const shiftR = (r: Rect): Rect => ({ left: r.left + o, top: r.top + o, right: r.right + o, bottom: r.bottom + o });
  return {
    roads: layout.roads.map((r) => ({ ...r, points: r.points.map(shiftP) })),
    lots: layout.lots.map((l) => ({ ...l, parcel: shiftR(l.parcel), footprint: shiftR(l.footprint) })),
    boundary: layout.boundary.map(shiftP),
    plazas: layout.plazas.map((p) => ({ x: p.x + o, y: p.y + o, r: p.r })),
    props: layout.props.map((p) => ({ ...p, x: p.x + o, y: p.y + o })),
    walls: layout.walls.map((w) => ({ ...w, points: w.points.map(shiftP) })),
  };
}
