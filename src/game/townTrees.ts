// ---------------------------------------------------------------------------
// BUILD 959: trees inside the starting town (Mosslight, chunk 4,7).
//
// The town previously had only 4 perimeter trees (fieldTreesFor's
// starting-center branch). These town trees use the Rodwan art from
// BUILD 945 automatically — the iso tree loop draws every field tree
// from the Rodwan sheet — and carry normal tree collision (fieldTreeBaseRect),
// so they are solid like any other tree.
//
// Placement discipline (same as houses, no exceptions):
//   - never on a pathway: clear of every engine road AND lane segment
//     (lanes include door spurs) by half-width + 4
//   - never on a house: outside every lot footprint expanded by 4
//   - never blocking a door: 5u+ from every pinned/filler door point
//   - never crowding a prop: prop radius + 3.5
//   - never on the plaza decal: plaza radius + 3
//   - never crowding another tree: 9u+ between visual centers (the same
//     rule fieldTreesFor uses), including the 4 perimeter trees
// Clearances are measured from the tree's visual center and padded so
// the collision base rect (which extends ~3.2u south of the center)
// stays clear too.
//
// Candidates, in order: plaza corners, park interiors, street lines.
// Deterministic (no rng): fixed angles, fixed offsets, fixed scales.
// Memoized — the layout is deterministic, so compute once.
//
// NOTE: the 4 perimeter-tree centers below duplicate fieldTreesFor's
// starting-center branch in App.tsx. If those move, update this list
// (worst case is a town tree within 9u of a perimeter tree — visual
// crowding only, never a crash).
// ---------------------------------------------------------------------------

import { mosslightEngineLayout, mosslightEngineChunkLayout } from './mosslightLayout';
import { fieldDoorPosition, newHouseDoorPosition, isNewStyleDoorBuilding } from './doorGeometry';

export interface TownTreeSpot {
  /** Field-tree origin (top-left-ish), as fieldTreesFor uses it. */
  x: number;
  y: number;
  scale: number;
  variant: number;
  flip: boolean;
  sprite: 'bigpine' | 'pine2';
}

interface Pt { x: number; y: number }

// Perimeter trees from fieldTreesFor's starting-center branch (App.tsx):
// {x, y, scale} -> visual center (x + 3.2*scale, y + 2.5*scale).
const PERIMETER_CENTERS: Pt[] = [
  { x: 56 + 3.2 * 0.56, y: 61.6 + 2.5 * 0.56 },
  { x: 196 + 3.2 * 0.56, y: 61.6 + 2.5 * 0.56 },
  { x: 50.4 + 3.2 * 0.56, y: 190.4 + 2.5 * 0.56 },
  { x: 240.8 + 3.2 * 0.56, y: 179.2 + 2.5 * 0.56 },
];

const MAX_TOWN_TREES = 16;

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

let cached: TownTreeSpot[] | null = null;

/** Guarded town-tree spots in chunk (4,7) field space. */
export function mosslightTownTrees(): TownTreeSpot[] {
  if (cached) return cached;
  const chunked = mosslightEngineChunkLayout();
  const local = mosslightEngineLayout();
  const roads = chunked.roads;
  const lots = chunked.lots;
  const props = chunked.props;
  const plazas = chunked.plazas;

  // Door points in chunk space (same formulas the engine uses).
  const doors: Pt[] = [];
  for (const lot of lots) {
    if (lot.kind !== 'building') continue;
    const f = lot.footprint;
    const d = (lot.pinned && isNewStyleDoorBuilding(lot.id))
      ? newHouseDoorPosition(f)
      : fieldDoorPosition(f);
    doors.push(d);
  }

  const accepted: Pt[] = [...PERIMETER_CENTERS];
  const spots: TownTreeSpot[] = [];
  const tryAdd = (cx: number, cy: number): void => {
    if (spots.length >= MAX_TOWN_TREES) return;
    if (cx < 8 || cx > 272 || cy < 8 || cy > 272) return;
    for (const lot of lots) {
      const f = lot.footprint;
      if (cx > f.left - 4 && cx < f.right + 4 && cy > f.top - 4 && cy < f.bottom + 4) return;
    }
    for (const r of roads) {
      const pts = r.points, half = r.width / 2;
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(cx, cy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < half + 4) return;
      }
    }
    for (const d of doors) {
      if (Math.hypot(cx - d.x, cy - d.y) < 5) return;
    }
    for (const p of props) {
      if (Math.hypot(cx - p.x, cy - p.y) < p.r + 3.5) return;
    }
    for (const pl of plazas) {
      if (Math.hypot(cx - pl.x, cy - pl.y) < pl.r + 3) return;
    }
    for (const t of accepted) {
      if (Math.hypot(cx - t.x, cy - t.y) < 9) return;
    }
    const i = spots.length;
    const scale = [0.9, 1.1, 0.8, 1.0][i % 4];
    spots.push({
      x: cx - 3.2 * scale,
      y: cy - 2.5 * scale,
      scale,
      variant: i % 4,
      flip: i % 2 === 0,
      sprite: i % 2 === 0 ? 'bigpine' : 'pine2',
    });
    accepted.push({ x: cx, y: cy });
  };

  // 1. Plaza corners (diagonals, just outside the plaza decal).
  for (const pl of plazas) {
    const d = (pl.r + 7) * Math.SQRT1_2;
    tryAdd(pl.x - d, pl.y - d);
    tryAdd(pl.x + d, pl.y - d);
    tryAdd(pl.x - d, pl.y + d);
    tryAdd(pl.x + d, pl.y + d);
  }
  // 2. Park interiors (town-local districts shifted to chunk space).
  for (const dist of local.districts) {
    if (dist.kind !== 'park' || dist.zone !== 'circle') continue;
    const px = dist.center.x + 140, py = dist.center.y + 140;
    const rr = dist.radius * 0.55;
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      tryAdd(px + rr * Math.cos(a), py + rr * Math.sin(a));
    }
  }
  // 3. Street lines: sample arterials/streets every ~20u, alternate sides.
  let side = 1;
  for (const r of roads) {
    if (r.kind === 'lane') continue;
    const pts = r.points;
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    for (let d = 14; d < total - 8; d += 20) {
      let acc = 0, found = false, sx = 0, sy = 0, dx = 1, dy = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const sl = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        if (acc + sl >= d) {
          const t = (d - acc) / sl;
          sx = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
          sy = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
          dx = (pts[i + 1].x - pts[i].x) / sl;
          dy = (pts[i + 1].y - pts[i].y) / sl;
          found = true;
          break;
        }
        acc += sl;
      }
      if (!found) continue;
      const off = r.width / 2 + 4;
      tryAdd(sx + -dy * off * side, sy + dx * off * side);
      side = -side;
    }
  }

  cached = spots;
  return spots;
}

/** Clear the memo (tests only). */
export function clearTownTreeCache(): void {
  cached = null;
}
