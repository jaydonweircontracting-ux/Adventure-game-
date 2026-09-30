// LTTP-style procedural ground detail for field chunks (BUILD 339).
//
// Renders a whole 140x140-unit chunk into a static canvas (8px per unit,
// 1120x1120) with deterministic per-chunk pixel detail: dithered grass,
// tufts, flowers, dirt patches, scalloped dirt roads with wheel ruts,
// water waves, sand pebbles, rock cracks, tundra sparkles.
//
// Deterministic: the same seed always paints the same chunk (mulberry32 only,
// no Date/Math.random). Painted once per chunk and cached by the caller.

export type GroundTerrain = 'meadow' | 'forest' | 'rock' | 'shore' | 'desert' | 'tundra' | 'ocean';

export interface GroundRoadRect { x: number; y: number; w: number; h: number }

export interface GroundDetailSpec {
  terrain: GroundTerrain;
  /** Base ground hex (from the chunk's field palette). */
  field: string;
  /** Dirt/path hex (from the chunk's field palette). */
  path: string;
  /** 'none' or arm flags like 'ns', 'ew', 'nesw'. */
  road: string;
  /** Road center rect as fractions of the field (0..1). */
  roadRect: GroundRoadRect;
  /** Full-field water (sea / ocean chunks). */
  sea: boolean;
  /** Chunk-derived seed. */
  seed: number;
}

export const GROUND_PX_PER_UNIT = 8;
const SIZE = 140 * GROUND_PX_PER_UNIT;

// ---------------------------------------------------------------------------
// Color + random helpers (pure, DOM-free so they stay unit-testable).
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbStr([r, g, b]: RGB): string {
  return 'rgb(' + Math.max(0, Math.min(255, Math.round(r))) + ',' + Math.max(0, Math.min(255, Math.round(g))) + ',' + Math.max(0, Math.min(255, Math.round(b))) + ')';
}

/** Multiply a hex color by a factor (<1 darkens, >1 lightens). */
export function shadeColor(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbStr([r * f, g * f, b * f]);
}

/** Blend two hex colors: t=0 -> a, t=1 -> b. */
export function mixColor(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbStr([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Renderer.
// ---------------------------------------------------------------------------

export function renderGroundDetail(spec: GroundDetailSpec): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const rand = mulberry32(spec.seed);
  const ri = (n: number) => Math.floor(rand() * n);
  const pick = <T,>(arr: T[]): T => arr[ri(arr.length)];

  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };

  // 4x4 dither tile (2px checkerboard cells, slight irregularity). Painted via
  // createPattern so the whole-field dither is two fill calls, not 300k.
  const dither = (dark: string, light: string, cell: number, jitter: number): CanvasPattern | null => {
    const s = cell * 2;
    const tile = document.createElement('canvas');
    tile.width = s;
    tile.height = s;
    const t = tile.getContext('2d');
    if (!t) return null;
    for (let yy = 0; yy < 2; yy++) {
      for (let xx = 0; xx < 2; xx++) {
        let useDark = (xx + yy) % 2 === 0;
        if (jitter > 0 && rand() < jitter) useDark = !useDark;
        t.fillStyle = useDark ? dark : light;
        t.fillRect(xx * cell, yy * cell, cell, cell);
      }
    }
    return ctx.createPattern(tile, 'repeat');
  };
  const ditherFill = (dark: string, light: string, cell = 2, jitter = 0.1) => {
    const p = dither(dark, light, cell, jitter);
    if (p) {
      ctx.fillStyle = p;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
  };

  const scatter = (n: number, size: number, colors: string[], maxSize = 0) => {
    for (let i = 0; i < n; i++) {
      const s = maxSize > 0 ? size + ri(maxSize) : size;
      rect(ri(SIZE - s), ri(SIZE - s), s, s, pick(colors));
    }
  };

  const isWater = spec.sea || spec.terrain === 'ocean';
  const field = spec.field;
  const fieldDark = shadeColor(field, 0.86);
  const fieldLight = shadeColor(field, 1.07);
  const fieldDeep = shadeColor(field, 0.68);

  if (isWater) {
    // --- Open water: deep blue dither, wave dashes, sparse foam. ---
    const deep = shadeColor(field, 0.82);
    const lite = shadeColor(field, 1.12);
    rect(0, 0, SIZE, SIZE, field);
    ditherFill(deep, lite, 2, 0.12);
    // Depth blobs.
    for (let i = 0; i < 26; i++) {
      const w = 30 + ri(70);
      const h = 18 + ri(40);
      rect(ri(SIZE - w), ri(SIZE - h), w, h, shadeColor(field, 0.9));
    }
    // Wave dashes in loose rows.
    const wave = shadeColor(field, 1.28);
    const foam = 'rgb(235,248,250)';
    for (let row = 8; row < SIZE; row += 26) {
      const y = row + ri(10) - 5;
      for (let x = ri(24); x < SIZE; x += 26 + ri(30)) {
        const w = 5 + ri(5);
        rect(x, y, w, 2, rand() < 0.22 ? foam : wave);
        if (rand() < 0.3) rect(x + ri(w), y + 2, 2, 1, wave);
      }
    }
    scatter(50, 1, [foam], 2);
  } else if (spec.terrain === 'desert' || spec.terrain === 'shore') {
    // --- Sand: tan dither, pebbles, dry tufts. ---
    rect(0, 0, SIZE, SIZE, field);
    ditherFill(fieldDark, fieldLight, 2, 0.1);
    scatter(420, 1, [fieldDark, fieldDeep], 2);
    // Pebbles: 2px body + 1px highlight.
    for (let i = 0; i < 60; i++) {
      const x = ri(SIZE - 3);
      const y = ri(SIZE - 3);
      const c = pick([shadeColor(field, 1.18), shadeColor(field, 0.94), '#b9a67f']);
      rect(x, y, 3, 2, c);
      rect(x, y, 1, 1, shadeColor(c, 1.25));
    }
    // Dry grass tufts.
    const dry = '#a8a05c';
    const dryDark = shadeColor(dry, 0.72);
    for (let i = 0; i < 46; i++) {
      const x = ri(SIZE - 4);
      const y = ri(SIZE - 5);
      rect(x + 1, y, 1, 4, dryDark);
      rect(x, y + 1, 1, 3, dry);
      rect(x + 3, y + 1, 1, 3, dry);
    }
  } else if (spec.terrain === 'rock') {
    // --- Rock: gray dither, cracks, stones. ---
    rect(0, 0, SIZE, SIZE, field);
    ditherFill(fieldDark, fieldLight, 2, 0.14);
    scatter(380, 1, [fieldDeep, fieldDark], 2);
    // Cracks: short dark random walks.
    for (let i = 0; i < 26; i++) {
      let x = ri(SIZE);
      let y = ri(SIZE);
      const steps = 3 + ri(4);
      for (let s = 0; s < steps; s++) {
        rect(x, y, 2, 1, fieldDeep);
        x += ri(5) - 2;
        y += ri(3);
      }
    }
    // Stones: body + highlight + shadow.
    for (let i = 0; i < 44; i++) {
      const x = ri(SIZE - 5);
      const y = ri(SIZE - 4);
      const c = pick([shadeColor(field, 1.16), shadeColor(field, 1.05), shadeColor(field, 0.92)]);
      rect(x, y + 1, 5, 2, c);
      rect(x + 1, y, 3, 1, shadeColor(c, 1.18));
      rect(x + 1, y + 3, 3, 1, shadeColor(c, 0.72));
    }
  } else if (spec.terrain === 'tundra') {
    // --- Tundra: pale dither, ice sparkles, sparse stones. ---
    rect(0, 0, SIZE, SIZE, field);
    ditherFill(fieldDark, fieldLight, 2, 0.1);
    scatter(300, 1, [fieldDark, fieldDeep], 2);
    scatter(90, 1, ['rgb(240,250,252)', 'rgb(255,255,255)'], 2);
    for (let i = 0; i < 22; i++) {
      const x = ri(SIZE - 4);
      const y = ri(SIZE - 3);
      rect(x, y + 1, 4, 2, shadeColor(field, 0.9));
      rect(x + 1, y, 2, 1, shadeColor(field, 1.12));
    }
  } else {
    // --- Grass (meadow / forest): LTTP two-tone checkerboard, tufts, flowers. ---
    const forest = spec.terrain === 'forest';
    rect(0, 0, SIZE, SIZE, field);
    ditherFill(fieldDark, fieldLight, 2, forest ? 0.14 : 0.08);
    scatter(forest ? 700 : 520, 1, [fieldDeep, fieldDark], 2);
    scatter(120, 1, [fieldLight], 1);
    // Grass tufts: 3 blades.
    const tuft = fieldDeep;
    const tuftLight = shadeColor(field, 0.82);
    const tuftCount = forest ? 200 : 140;
    for (let i = 0; i < tuftCount; i++) {
      const x = ri(SIZE - 5);
      const y = ri(SIZE - 6);
      const lean = ri(3) - 1;
      rect(x + 2, y, 1, 5, tuft);
      rect(x + (lean > 0 ? 3 : 1), y + 1, 1, 4, tuftLight);
      rect(x + (lean < 0 ? 1 : 3), y + 2, 1, 3, tuft);
    }
    // Flowers: 2x2 petals + contrasting center.
    const petals = ['rgb(245,244,230)', '#f2d06b', '#e07856', 'rgb(230,120,140)'];
    for (let i = 0; i < (forest ? 16 : 30); i++) {
      const x = ri(SIZE - 4);
      const y = ri(SIZE - 4);
      const p = pick(petals);
      rect(x, y + 1, 4, 2, p);
      rect(x + 1, y, 2, 4, p);
      rect(x + 1, y + 1, 2, 2, '#f7e08a');
    }
    // Dirt patches (meadow only): irregular blobs of path tone.
    if (spec.terrain === 'meadow') {
      const dirt = shadeColor(spec.path, 0.94);
      const dirtDark = shadeColor(spec.path, 0.8);
      for (let i = 0; i < 9; i++) {
        const cx = 20 + ri(SIZE - 40);
        const cy = 20 + ri(SIZE - 40);
        const blobs = 4 + ri(4);
        for (let b = 0; b < blobs; b++) {
          const w = 8 + ri(18);
          const h = 6 + ri(12);
          rect(cx + ri(24) - 12, cy + ri(18) - 9, w, h, dirt);
        }
        scatter(26, 1, [dirtDark, shadeColor(spec.path, 1.08)], 2);
      }
    }
  }

  // --- Dirt road with ragged grass borders and wheel ruts. ---
  if (!isWater && spec.road !== 'none') {
    const rx = spec.roadRect.x * SIZE;
    const ry = spec.roadRect.y * SIZE;
    const rw = spec.roadRect.w * SIZE;
    const rh = spec.roadRect.h * SIZE;
    const arms: Array<[number, number, number, number, boolean]> = [];
    // [x, y, w, h, vertical]
    if (spec.road.includes('n')) arms.push([rx, 0, rw, ry + rh, true]);
    if (spec.road.includes('s')) arms.push([rx, ry, rw, SIZE - ry, true]);
    if (spec.road.includes('w')) arms.push([0, ry, rx + rw, rh, false]);
    if (spec.road.includes('e')) arms.push([rx, ry, SIZE - rx, rh, false]);
    arms.push([rx, ry, rw, rh, false]); // center junction

    const dirtDark = shadeColor(spec.path, 0.82);
    const dirtLight = shadeColor(spec.path, 1.1);
    const edgeDark = '#5e4028';
    for (const [ax, ay, aw, ah, vertical] of arms) {
      // Dark outline, then dirt dither inset by 3px.
      rect(ax - 3, ay - 3, aw + 6, ah + 6, edgeDark);
      const save = ctx.fillStyle;
      const p = dither(dirtDark, dirtLight, 2, 0.16);
      ctx.fillStyle = p ?? dirtLight;
      ctx.fillRect(ax, ay, aw, ah);
      ctx.fillStyle = save;
      // Ragged grass fringe along the inner dirt edge.
      const fringe = shadeColor(field, 0.8);
      const fringeDark = shadeColor(field, 0.62);
      const fringeEdge = (x0: number, y0: number, len: number, horizontal: boolean, flip: boolean) => {
        for (let d = 0; d < len; d += 2) {
          if (rand() < 0.45) {
            const off = ri(3);
            const fx = horizontal ? x0 + d : x0 + (flip ? -off - 1 : off);
            const fy = horizontal ? y0 + (flip ? -off - 1 : off) : y0 + d;
            rect(fx, fy, horizontal ? 2 : 1, horizontal ? 1 : 2, rand() < 0.5 ? fringe : fringeDark);
          }
        }
      };
      const atMinX = ax <= 0;
      const atMaxX = ax + aw >= SIZE;
      const atMinY = ay <= 0;
      const atMaxY = ay + ah >= SIZE;
      if (vertical) {
        if (!atMinX) fringeEdge(ax, ay, ah, false, true);
        if (!atMaxX) fringeEdge(ax + aw, ay, ah, false, false);
      } else {
        if (!atMinY) fringeEdge(ax, ay, aw, true, true);
        if (!atMaxY) fringeEdge(ax, ay + ah, aw, true, false);
      }
      // Wheel ruts along travel direction.
      const rut = 'rgba(70, 48, 28, 0.55)';
      if (vertical) {
        rect(ax + aw * 0.26, ay, 2, ah, rut);
        rect(ax + aw * 0.72, ay, 2, ah, rut);
      } else {
        rect(ax, ay + ah * 0.26, aw, 2, rut);
        rect(ax, ay + ah * 0.72, aw, 2, rut);
      }
      // Pebbles on the road.
      for (let i = 0; i < 14; i++) {
        rect(ax + ri(Math.max(1, aw - 2)), ay + ri(Math.max(1, ah - 2)), 2, 1, pick([dirtDark, dirtLight, edgeDark]));
      }
    }
  }

  return canvas;
}
