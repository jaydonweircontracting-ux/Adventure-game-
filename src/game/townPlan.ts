// Authored town plan for Mosslight Crossing (chunk 4,7) — BUILD 686.
//
// Deterministic hand-placed data (NOT random): building door positions are
// derived from the same formulas as buildingDoorwaysFor (App.tsx:1246/1254),
// and every path was checked against the 18 fixed building rects so no lane
// crosses a footprint. Pure module: no React, no App.tsx imports.
//
// Design grammar (from the reference): winding dirt paths connecting EVERY
// door to a central plaza; market cluster with striped stalls; lamps flanking
// paths; barrel clutter near buildings; perimeter wall + gatehouse; garden
// corner. Uses only audited assets (see settlements.ts MISSING_ASSETS — no
// fence references).

import { MOSSLIGHT_FIXED_RECTS_280, mosslightCottageRects280 } from './settlements';

export interface TownPoint { x: number; y: number }
export interface TownLane { points: TownPoint[]; width: number }
export interface TownProp { id: string; asset: string; x: number; y: number; r: number }
export interface TownWall { points: TownPoint[]; width: number }
export interface TownPlan {
  plazas: { x: number; y: number; r: number }[];
  lanes: TownLane[];
  props: TownProp[];
  walls: TownWall[];
}

export interface TownDoor { building: string; x: number; y: number }

/** Door positions replicating buildingDoorwaysFor (App.tsx:1246/1254).
 *  Mains (tutorial/guild/chapel/tavern) use newHouseDoorPosition;
 *  all others use fieldDoorPosition. */
function doorFor(name: string, rect: { left: number; top: number; right: number; bottom: number }): TownDoor {
  const w = rect.right - rect.left, h = rect.bottom - rect.top;
  const isMain = name === 'tutorial' || name === 'guild' || name === 'chapel' || name === 'tavern';
  return {
    building: name,
    x: rect.left + (isMain ? 0.50 : 0.51) * w,
    y: rect.top + (isMain ? 0.725 : 0.78) * h,
  };
}

/** The 18 fixed building rects (chunk 4,7), 280 field space.
 *  Single source: MOSSLIGHT_FIXED_RECTS_280 + mosslightCottageRects280()
 *  (settlements.ts) — never hardcoded, so the plan can't drift from the
 *  engine's rects. Order matches fieldHouseRects: 4 mains, 6 cottages,
 *  8 town buildings. */
const BUILDING_NAMES = [
  'tutorial', 'guild', 'chapel', 'tavern',
  'cottage-1', 'cottage-2', 'cottage-3', 'cottage-4', 'cottage-5', 'cottage-6',
  'town-n1', 'town-n2', 'town-s1', 'town-s2',
  'town-e1', 'town-e2', 'town-w1', 'town-w2',
];

function buildingRects(): { name: string; rect: { left: number; top: number; right: number; bottom: number } }[] {
  const fixed = MOSSLIGHT_FIXED_RECTS_280;
  const rects = [...fixed.slice(0, 4), ...mosslightCottageRects280(), ...fixed.slice(4)];
  return BUILDING_NAMES.map((name, i) => ({ name, rect: rects[i] }));
}

let _buildings: ReturnType<typeof buildingRects> | null = null;
/** Memoized building list (rects are deterministic). */
function BUILDINGS() { return (_buildings ??= buildingRects()); }

/** All 18 door positions (exterior approach = just south of the door). */
export function townDoors(): TownDoor[] {
  return BUILDINGS().map((b) => doorFor(b.name, b.rect));
}

/** Check a polyline against building rects (for plan validation).
 *  Points within 3.0 of a door are exempt (lanes legitimately end at doors). */
export function laneCrossesBuildings(points: TownPoint[], margin = 0): string[] {
  const hits: string[] = [];
  const doors = BUILDINGS().map((b) => doorFor(b.name, b.rect));
  const nearDoor = (p: TownPoint) =>
    doors.some((d) => Math.hypot(p.x - d.x, p.y - d.y) < 3.0);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (nearDoor(p)) continue;
      for (const bd of BUILDINGS()) {
        const r = bd.rect;
        if (p.x > r.left - margin && p.x < r.right + margin &&
            p.y > r.top - margin && p.y < r.bottom + margin) {
          const key = `${bd.name}@seg${i}`;
          if (!hits.includes(key)) hits.push(key);
        }
      }
    }
  }
  return hits;
}

const L = (pts: [number, number][], width = 2.5): TownLane => ({
  points: pts.map(([x, y]) => ({ x, y })), width,
});

let _plan: TownPlan | null = null;

/** The authored Mosslight Crossing town plan. Deterministic. */
export function mosslightTownPlan(): TownPlan {
  if (_plan) return _plan;
  const lanes: TownLane[] = [
    // Ring road around the plaza.
    L([[126,124],[136,121],[152,121],[162,124],[170,134],[172,144],[170,154],[162,164],[152,167],[136,167],[126,164],[118,154],[116,144],[118,134],[126,124]], 2.8),
    // Door spurs: town buildings -> ring/road. Each runs from the path
    // network to just outside the door's south side (doors face south).
    L([[126,124],[126.1,119],[126.1,115.5]], 2),
    L([[162,124],[162.1,119],[162.1,115.5]], 2),
    L([[126,183],[126.1,178.5]], 2),
    L([[163,183],[162.1,178.5]], 2),
    L([[104,138],[106.1,132],[106.1,127.5]], 2),
    L([[118,154],[112,170],[106.1,171],[106.1,166.5]], 2),
    L([[188,138],[184,132],[182.1,131],[182.1,127.5]], 2),
    L([[183,180],[187.5,179],[187.5,170],[184,168],[182.1,166.5]], 2),
    // Plaza connectors.
    L([[144,131],[144,121]], 2.5),
    L([[144,157],[144,167]], 2.5),
    L([[131,144],[116,144]], 2.5),
    L([[157,144],[172,144]], 2.5),
    // North road: ring -> cottage-5 (approach from south) -> around c5 -> cottage-6.
    L([[143,121],[142,108],[140,99],[139.5,98]], 2.5),
    L([[138,103],[130,98],[129,80],[128,58],[127,38],[126,20],[125,14]], 2.2),
    // South road: ring -> fork -> chapel / tavern.
    L([[144,167],[144,182]], 2.5),
    L([[144,182],[110,183],[90,179],[87.6,177]], 2.5),
    L([[144,182],[165,183],[183,180],[183.2,178]], 2.5),
    // Cottage-2 spur (southwest), approaching from the south.
    L([[110,183],[80,190],[55,200],[40,208],[29,208],[29,204.5]], 2.2),
    // West road: ring -> tutorial (+ cottage-1, cottage-3 spurs).
    L([[116,144],[104,138],[95,128],[90,116],[89.4,113]], 2.5),
    L([[104,139],[90,137],[84.5,134.5],[84.5,131.8]], 2.2),
    L([[94,135],[70,138],[40,140],[20,140],[12.1,139],[12.1,135]], 2.2),
    // East road: ring -> guild (+ cottage-4 spur, routed west of guild).
    L([[172,144],[188,138],[190,120],[192,100],[196,80],[199,55],[199.3,37]], 2.5),
    L([[190,128],[193,124],[195.6,115]], 2.2),
  ];
  const props: TownProp[] = [
    // NOTE: The central market square (fountain, stalls, plaza lamps) is
    // provided by the BUILD 613 hardcoded market in IsoFieldView — not
    // duplicated here. This plan adds paths, walls, gatehouse, garden,
    // door-spur lamps, and building clutter.
    // Lamps flanking paths.
    { id: 'lamp-1', asset: 'props/lamp.png', x: 138, y: 128, r: 0.8 },
    { id: 'lamp-2', asset: 'props/lamp.png', x: 150, y: 128, r: 0.8 },
    { id: 'lamp-3', asset: 'props/lamp.png', x: 138, y: 160, r: 0.8 },
    { id: 'lamp-4', asset: 'props/lamp.png', x: 150, y: 160, r: 0.8 },
    { id: 'lamp-5', asset: 'props/lamp.png', x: 120, y: 138, r: 0.8 },
    { id: 'lamp-6', asset: 'props/lamp.png', x: 120, y: 150, r: 0.8 },
    { id: 'lamp-7', asset: 'props/lamp.png', x: 168, y: 138, r: 0.8 },
    { id: 'lamp-8', asset: 'props/lamp.png', x: 168, y: 150, r: 0.8 },
    { id: 'lamp-9', asset: 'props/lamp.png', x: 143, y: 100, r: 0.8 },
    { id: 'lamp-10', asset: 'props/lamp.png', x: 130, y: 60, r: 0.8 },
    { id: 'lamp-11', asset: 'props/lamp.png', x: 100, y: 183, r: 0.8 },
    { id: 'lamp-12', asset: 'props/lamp.png', x: 190, y: 135, r: 0.8 },
    { id: 'lamp-13', asset: 'props/lamp.png', x: 60, y: 137, r: 0.8 },
    { id: 'lamp-14', asset: 'props/lamp.png', x: 200, y: 80, r: 0.8 },
    // Barrel clutter near buildings.
    { id: 'barrel-tutorial', asset: 'props/barrel.png', x: 95, y: 116, r: 0.7 },
    { id: 'barrel-guild', asset: 'props/barrel.png', x: 190, y: 118, r: 0.7 },
    { id: 'barrel-chapel', asset: 'props/barrel.png', x: 93, y: 180, r: 0.7 },
    { id: 'barrel-tavern', asset: 'props/barrel.png', x: 178, y: 181, r: 0.7 },
    { id: 'barrel-n1', asset: 'props/barrel.png', x: 134, y: 120, r: 0.7 },
    { id: 'barrel-n2', asset: 'props/barrel.png', x: 170, y: 120, r: 0.7 },
    { id: 'barrel-s1', asset: 'props/barrel.png', x: 134, y: 170, r: 0.7 },
    { id: 'barrel-w1', asset: 'props/barrel.png', x: 114, y: 132, r: 0.7 },
    { id: 'barrel-c2', asset: 'props/barrel.png', x: 38, y: 201, r: 0.7 },
    // Garden corner (SE): well + lamps.
    { id: 'garden-well', asset: 'props/well.png', x: 222, y: 222, r: 1.5 },
    { id: 'lamp-g1', asset: 'props/lamp.png', x: 210, y: 215, r: 0.8 },
    { id: 'lamp-g2', asset: 'props/lamp.png', x: 234, y: 229, r: 0.8 },
    // Gatehouse at the south town gate.
    { id: 'gatehouse', asset: 'buildings/gatehouse.png', x: 144, y: 196, r: 2.5 },
  ];
  const walls: TownWall[] = [
    // South town wall with a gate gap at x 136-152.
    { points: [{ x: 108, y: 196 }, { x: 136, y: 196 }], width: 2 },
    { points: [{ x: 152, y: 196 }, { x: 182, y: 196 }], width: 2 },
  ];
  _plan = {
    plazas: [
      { x: 144, y: 144, r: 13 },   // central plaza
      { x: 222, y: 222, r: 15 },   // garden corner
    ],
    lanes,
    props,
    walls,
  };
  return _plan;
}

/** Validate the whole plan: no lane crosses a building, all props in bounds,
 *  every door has a lane ending near it. Returns error strings. */
export function validateTownPlan(): string[] {
  const errors: string[] = [];
  const plan = mosslightTownPlan();
  const doors = townDoors();
  for (const [i, lane] of plan.lanes.entries()) {
    for (const hit of laneCrossesBuildings(lane.points)) {
      errors.push(`Lane ${i} crosses ${hit}`);
    }
  }
  for (const p of plan.props) {
    if (p.x < 1 || p.y < 1 || p.x > 279 || p.y > 279) errors.push(`Prop ${p.id} out of bounds`);
    for (const b of BUILDINGS()) {
      const r = b.rect;
      if (p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom) {
        errors.push(`Prop ${p.id} inside building ${b.name}`);
      }
    }
  }
  // Every door needs a lane endpoint within 3.5 units (south approach).
  for (const d of doors) {
    let best = Infinity;
    for (const lane of plan.lanes) {
      for (const pt of lane.points) {
        const dist = Math.hypot(pt.x - d.x, pt.y - (d.y + 1));
        if (dist < best) best = dist;
      }
    }
    if (best > 3.5) errors.push(`Door ${d.building} has no nearby lane (best ${best.toFixed(1)})`);
  }
  return errors;
}
