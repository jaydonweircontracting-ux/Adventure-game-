/**
 * BUILD 944 standalone proof for src/game/iso/rotation.ts. Throwing asserts
 * (the sim collects asserts and its Results print is blocked by the
 * pre-existing BUILD 694 crash, so this script is the real proof).
 *
 * Run: npx tsx scripts/verify-rotation-944.ts
 */
import {
  IsoRotation,
  rotateIsoScreen,
  unrotateIsoScreen,
  rotatedDepth,
  rotateFace8,
  rotateCritterDir,
  rotatedGridBounds,
  rotatedVisibleTileRange,
  sanitizeIsoRotation,
} from '../src/game/iso/rotation';
import { isoToScreen, screenToTile } from '../src/game/iso/projection';
import { isoChunkGridBounds, isoVisibleTileRange } from '../src/game/iso/isoChunks';

let n = 0;
function eq<T>(a: T, b: T, label: string): void {
  n++;
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`FAIL ${label}: got ${sa}, want ${sb}`);
}
function ok(cond: boolean, label: string): void {
  n++;
  if (!cond) throw new Error(`FAIL ${label}`);
}
const near = (a: number, b: number, label: string): void => {
  n++;
  if (Math.abs(a - b) > 1e-9) throw new Error(`FAIL ${label}: got ${a}, want ${b}`);
};
const pt = (x: number, y: number) => ({ x, y });
const KS: IsoRotation[] = [0, 1, 2, 3];
const SAMPLES = [pt(0, 0), pt(32, 16), pt(-32, 16), pt(64, 0), pt(0, 64), pt(100, -40), pt(-7, 3)];

// 1. k = 0 is identity everywhere.
for (const p of SAMPLES) {
  eq(rotateIsoScreen(p.x, p.y, 0), p, `k=0 screen identity ${JSON.stringify(p)}`);
  eq(unrotateIsoScreen(p.x, p.y, 0), p, `k=0 unscreen identity ${JSON.stringify(p)}`);
}
for (const t of [[1, 0], [0, 1], [5, 3], [-2, 7]]) {
  near(rotatedDepth(t[0], t[1], 0), t[0] + t[1], `k=0 depth ${t}`);
}
for (const f of ['up', 'upright', 'right', 'downright', 'down', 'downleft', 'left', 'upleft'] as const) {
  eq(rotateFace8(f, 0), f, `k=0 face ${f}`);
}
for (const d of ['NE', 'SE', 'SW', 'NW'] as const) eq(rotateCritterDir(d, 0), d, `k=0 critter ${d}`);

// 2. Four rotations = identity (each direction); left + right cancel.
for (const k of [1, 2, 3] as IsoRotation[]) {
  for (const p of SAMPLES) {
    let q = p;
    for (let i = 0; i < 4; i++) q = rotateIsoScreen(q.x, q.y, k);
    near(q.x, p.x, `4x k=${k} x ${JSON.stringify(p)}`);
    near(q.y, p.y, `4x k=${k} y ${JSON.stringify(p)}`);
  }
}
for (const p of SAMPLES) {
  eq(rotateIsoScreen(rotateIsoScreen(p.x, p.y, 1).x, rotateIsoScreen(p.x, p.y, 1).y, 3), p, 'left+right cancel (via k=1 then k=3)');
  const a = rotateIsoScreen(p.x, p.y, 1);
  const b = rotateIsoScreen(a.x, a.y, 3);
  near(b.x, p.x, `1 then 3 x ${JSON.stringify(p)}`);
  near(b.y, p.y, `1 then 3 y ${JSON.stringify(p)}`);
  const c = rotateIsoScreen(p.x, p.y, 3);
  const d = rotateIsoScreen(c.x, c.y, 1);
  near(d.x, p.x, `3 then 1 x ${JSON.stringify(p)}`);
  near(d.y, p.y, `3 then 1 y ${JSON.stringify(p)}`);
}

// 3. Screen <-> world round-trip at all 4 orientations (the tap-to-move core).
for (const k of KS) {
  for (const p of SAMPLES) {
    const r = rotateIsoScreen(p.x, p.y, k);
    const u = unrotateIsoScreen(r.x, r.y, k);
    near(u.x, p.x, `round-trip k=${k} x ${JSON.stringify(p)}`);
    near(u.y, p.y, `round-trip k=${k} y ${JSON.stringify(p)}`);
  }
}
// Tap mapping: tile center -> rotated screen -> unrotate -> screenToTile -> same tile.
const N = 280;
for (const k of KS) {
  for (const [tx, ty] of [[0, 0], [1, 0], [0, 1], [140, 140], [279, 279], [-280, 0], [0, -280], [300, 300], [-5, 42]] as const) {
    const c = isoToScreen(tx + 0.5, ty + 0.5);
    const r = rotateIsoScreen(c.x, c.y, k);
    const u = unrotateIsoScreen(r.x, r.y, k);
    const t = screenToTile(u.x, u.y);
    eq([Math.floor(t.tx), Math.floor(t.ty)], [tx, ty], `tap tile k=${k} (${tx},${ty})`);
  }
}

// 4. Worked example (audit-corrected): tile (1,0) default (32,16); k=1 -> (-32,16) = isoToScreen(0,1).
eq(isoToScreen(1, 0), pt(32, 16), 'isoToScreen(1,0)');
eq(rotateIsoScreen(32, 16, 1), pt(-32, 16), 'k=1 of (32,16)');
eq(rotateIsoScreen(32, 16, 1), isoToScreen(0, 1), 'k=1 remap (1,0)->(0,1)');
// Facing example: field-east movement faces downright by default, downleft at k=1.
eq(rotateFace8('downright', 1), 'downleft', 'face downright k=1 -> downleft');
eq(rotateFace8('downleft', 3), 'downright', 'face downleft k=3 -> downright');

// 5. Facing full cycle: +2 steps per k; twice k=1 equals k=2; four k=1 = identity.
const CYCLE = ['up', 'upright', 'right', 'downright', 'down', 'downleft', 'left', 'upleft'] as const;
for (const f of CYCLE) {
  const i = CYCLE.indexOf(f);
  eq(rotateFace8(f, 1), CYCLE[(i + 2) % 8], `face ${f} k=1`);
  eq(rotateFace8(f, 2), CYCLE[(i + 4) % 8], `face ${f} k=2`);
  eq(rotateFace8(f, 3), CYCLE[(i + 6) % 8], `face ${f} k=3`);
  eq(rotateFace8(rotateFace8(f, 1), 1), rotateFace8(f, 2), `face ${f} 1+1=2`);
  eq(rotateFace8(rotateFace8(f, 1), 3), f, `face ${f} 1+3=id`);
}
eq(rotateFace8('down', 1), 'left', 'Face4 down k=1 -> left');
eq(rotateFace8('down', 3), 'right', 'Face4 down k=3 -> right');
// Critter cycle: NE -> SE -> SW -> NW -> NE.
eq(rotateCritterDir('NE', 1), 'SE', 'critter NE k=1');
eq(rotateCritterDir('SE', 1), 'SW', 'critter SE k=1');
eq(rotateCritterDir('SW', 1), 'NW', 'critter SW k=1');
eq(rotateCritterDir('NW', 1), 'NE', 'critter NW k=1');
eq(rotateCritterDir('NE', 2), 'SW', 'critter NE k=2');

// 6. Depth: linearity (midpoint depth = mean) and front-direction ordering at every k.
for (const k of KS) {
  const a: [number, number] = [10, 4];
  const b: [number, number] = [20, 14];
  const m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  near(rotatedDepth(m[0], m[1], k), (rotatedDepth(a[0], a[1], k) + rotatedDepth(b[0], b[1], k)) / 2, `depth linear k=${k}`);
  // Front direction at k: step along the front axis and require increasing depth.
  const front: Record<IsoRotation, [number, number]> = { 0: [1, 1], 1: [1, -1], 2: [-1, -1], 3: [-1, 1] };
  const [fx, fy] = front[k];
  let prev = rotatedDepth(0, 0, k);
  for (let s = 1; s <= 5; s++) {
    const d = rotatedDepth(s * fx, s * fy, k);
    ok(d > prev, `depth front order k=${k} step ${s}`);
    prev = d;
  }
}

// 7. Grid bounds: k=0 equals isoChunkGridBounds; k=1..3 equal the vertex transform.
for (const k of KS) {
  const rb = rotatedGridBounds(1, N, 64, k);
  if (k === 0) {
    const gb = isoChunkGridBounds(1, N, 64);
    eq(rb, gb, 'k=0 bounds equal isoChunkGridBounds');
  } else {
    const minT = -N;
    const maxT = 2 * N - 1;
    const verts = [
      isoToScreen(minT, minT), isoToScreen(maxT, minT),
      isoToScreen(minT, maxT), isoToScreen(maxT, maxT),
    ].map((p) => rotateIsoScreen(p.x, p.y, k));
    const xs = verts.map((v) => v.x);
    const ys = verts.map((v) => v.y);
    near(rb.minX, Math.min(...xs) - 64, `bounds k=${k} minX`);
    near(rb.maxX, Math.max(...xs) + 64, `bounds k=${k} maxX`);
    near(rb.minY, Math.min(...ys) - 64, `bounds k=${k} minY`);
    near(rb.maxY, Math.max(...ys) + 64, `bounds k=${k} maxY`);
  }
}

// 8. View coverage (BUILD 376 lesson): k=0 range equals isoVisibleTileRange;
// every orientation's range covers neighbor tiles on all sides when zoomed out.
const CAM = isoToScreen(140, 140); // player mid home chunk, default view
for (const k of KS) {
  // The camera lives in ROTATED space: the frame loop stores cam = M_k(anchor).
  const camK = rotateIsoScreen(CAM.x, CAM.y, k);
  const r = rotatedVisibleTileRange(camK.x, camK.y, 1200, 800, 1, k);
  if (k === 0) {
    const base = isoVisibleTileRange(CAM.x, CAM.y, 1200, 800, 1);
    eq(r, base, 'k=0 range equals isoVisibleTileRange');
  }
  ok(r.x0 < r.x1 && r.y0 < r.y1, `range non-degenerate k=${k}`);
  ok(r.x0 <= 140 && r.x1 >= 140 && r.y0 <= 140 && r.y1 >= 140, `range covers player tile k=${k}`);
}
// Pixel coverage: every viewport pixel's world tile must lie inside the
// range, at every orientation. Sampled with the camera near the home
// chunk's NW corner so neighbor-chunk tiles are visible (BUILD 376 lesson:
// home chunk + neighbors render at every orientation, never void).
for (const k of KS) {
  for (const zm of [1, 0.5]) {
    const anchor = isoToScreen(10, 10);
    const camK = rotateIsoScreen(anchor.x, anchor.y, k);
    const r = rotatedVisibleTileRange(camK.x, camK.y, 1200, 800, zm, k);
    let sawNeighbor = false;
    for (let sx = 0; sx <= 1200; sx += 100) {
      for (let sy = 0; sy <= 800; sy += 100) {
        const rx = camK.x + (sx - 600) / zm;
        const ry = camK.y + (sy - 400) / zm;
        const u = unrotateIsoScreen(rx, ry, k);
        const t = screenToTile(u.x, u.y);
        const fx = Math.floor(t.tx);
        const fy = Math.floor(t.ty);
        ok(fx >= r.x0 && fx <= r.x1 && fy >= r.y0 && fy <= r.y1, `pixel covered k=${k} zm=${zm} (${sx},${sy}) -> (${fx},${fy}) range ${JSON.stringify(r)}`);
        if (fx < 0 || fy < 0 || fx >= N || fy >= N) sawNeighbor = true;
      }
    }
    ok(sawNeighbor, `viewport reaches neighbor tiles k=${k} zm=${zm}`);
  }
}

// 9. Sanitize.
eq(sanitizeIsoRotation(0), 0, 'sanitize 0');
eq(sanitizeIsoRotation(3), 3, 'sanitize 3');
eq(sanitizeIsoRotation(2.7), 2, 'sanitize 2.7 floors');
eq(sanitizeIsoRotation(4), 0, 'sanitize 4 -> 0');
eq(sanitizeIsoRotation(-1), 0, 'sanitize -1 -> 0');
eq(sanitizeIsoRotation(NaN), 0, 'sanitize NaN -> 0');
eq(sanitizeIsoRotation('2'), 0, 'sanitize string -> 0');
eq(sanitizeIsoRotation(undefined), 0, 'sanitize undefined -> 0');

console.log(`rotation-944 standalone: ${n} asserts passed`);
