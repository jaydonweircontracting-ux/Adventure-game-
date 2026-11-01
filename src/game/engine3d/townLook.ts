/**
 * BUILD 983 — pure design data for the 3D-mode town look (reference match).
 *
 * Dependency-free on purpose: no imports, no React, no DOM, so it is safe
 * for the sim/test import graphs. Every variation is seeded from hut or
 * tile coordinates, NEVER from view order — a house looks identical from
 * every camera angle and after every world rebuild (the old code cycled
 * colours by visible-window order, so houses changed colour while panning).
 *
 * Palette rule, from the reference image: warm muted tans/browns/greys.
 * Stone-block ground floors (grey), dark timber framing, plaster upper
 * walls (cream/tan/pale yellow), steep pitched roofs (brown/dark brown/
 * red tile), small square windows (some warm-lit). NO lavender/pink
 * anywhere — that was the BUILD 980 iso bug look, and it must not recur
 * here. The packed 3D mesh format carries positions + colour only, so
 * these are plain RGB vertex colours; no textures, no normal/metallic/
 * roughness maps are involved in this renderer.
 */

export type Rgb = [number, number, number];

const fract = (n: number): number => n - Math.floor(n);

/** Deterministic 0..1 hash from two coordinates (same family as the iso
 *  filler-variant hash, so it is stable across sessions). */
export function hash2(x: number, y: number): number {
  return fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
}

/** Ground-floor stone greys. */
export const STONE_GREYS: Rgb[] = [
  [0.52, 0.52, 0.5], [0.58, 0.58, 0.56], [0.47, 0.47, 0.45], [0.62, 0.6, 0.57],
];
/** Dark mortar backing behind the stone-block courses. */
export const MORTAR: Rgb = [0.32, 0.32, 0.3];
/** Upper-floor plasters: cream / tan / pale yellow / warm beige. */
export const PLASTERS: Rgb[] = [
  [0.84, 0.78, 0.6], [0.76, 0.65, 0.47], [0.87, 0.8, 0.57],
  [0.79, 0.69, 0.51], [0.82, 0.74, 0.57],
];
/** Dark timber framing / beams / posts. */
export const TIMBERS: Rgb[] = [[0.23, 0.16, 0.1], [0.28, 0.2, 0.13]];
/** Steep pitched roofs: brown / dark brown / red tile. */
export const ROOFS: Rgb[] = [
  [0.42, 0.27, 0.17], [0.33, 0.22, 0.15], [0.56, 0.21, 0.15],
  [0.46, 0.23, 0.17], [0.38, 0.26, 0.18],
];
/** Window glass (dark) and warm-lit panes. */
export const GLASS_DARK: Rgb = [0.16, 0.24, 0.32];
export const GLASS_LIT: Rgb = [0.96, 0.76, 0.36];
/** Door wood. */
export const DOOR_WOOD: Rgb = [0.26, 0.16, 0.09];
/** Central dirt street: tan, matching the reference path. */
export const DIRT_TAN: Rgb = [0.74, 0.57, 0.31];
/** Flanking cobble/paver grey and its dark gaps. */
export const COBBLE_GAP: Rgb = [0.38, 0.38, 0.36];
/** Clear blue sky: zenith and horizon. */
export const SKY_TOP: Rgb = [0.36, 0.62, 0.92];
export const SKY_HORIZON: Rgb = [0.78, 0.87, 0.96];

/** Story heights in world units. */
export const GROUND_FLOOR_H = 1.25;
export const UPPER_FLOOR_H = 1.1;

/** Steep roof rise as a fraction of the cross-axis span. rise/run = 0.9,
 *  i.e. a ~42 degree pitch, matching the reference's steep roofs. */
export function roofRise(span: number): number {
  return 0.45 * span;
}
export function roofPitchDeg(span: number): number {
  return (Math.atan2(roofRise(span), span / 2) * 180) / Math.PI;
}

export type DoorFace = 'north' | 'south' | 'west' | 'east';

export interface HouseDesign {
  stories: 2 | 3;
  stone: Rgb;
  plaster: Rgb;
  timber: Rgb;
  roof: Rgb;
  /** Ridge axis: along the longer horizontal side. */
  roofAxis: 'x' | 'z';
  /** Ground floor on the door face is an open colonnade (posts + recess)
   *  instead of a stone wall, as in the reference's shop fronts. */
  openFront: boolean;
  chimney: boolean;
  doorFace: DoorFace;
  /** One flag per window slot (8 slots); true = warm-lit pane. */
  lit: boolean[];
}

/** Derive a house's full look from its hut rect + door tile. The door
 *  face comes from the layout's door position (door on the y0 edge =
 *  north face, y1 = south, x0 = west, x1 = east) — the layout is never
 *  moved, only read. */
export function houseDesignFor(
  x0: number, y0: number, x1: number, y1: number,
  doorX: number, doorY: number,
): HouseDesign {
  const h = (salt: number): number => hash2(x0 * 3.1 + salt, y0 * 7.7 + salt * 1.3);
  const doorFace: DoorFace =
    doorY <= y0 ? 'north' : doorY >= y1 ? 'south' : doorX <= x0 ? 'west' : 'east';
  const w = Math.max(2, x1 - x0 + 1);
  const d = Math.max(2, y1 - y0 + 1);
  const pick = <T>(arr: readonly T[], v: number): T => arr[Math.floor(v * arr.length) % arr.length];
  return {
    stories: h(1) < 0.45 ? 3 : 2,
    stone: pick(STONE_GREYS, h(2)),
    plaster: pick(PLASTERS, h(3)),
    timber: pick(TIMBERS, h(4)),
    roof: pick(ROOFS, h(5)),
    roofAxis: w >= d ? 'x' : 'z',
    openFront: h(6) < 0.25,
    chimney: h(7) < 0.5,
    doorFace,
    lit: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => h(10 + i) < 0.35),
  };
}

/** One scattered stone slab on a dirt tile, in tile-local coordinates.
 *  Sizes are clamped so slabs stay inside their tile (no coplanar overlap
 *  with the neighbour tile's slabs); the renderer staggers slab heights
 *  per index to avoid z-fighting within a tile. */
export interface Slab {
  dx: number;
  dz: number;
  w: number;
  d: number;
  shade: number;
}
export function streetSlabsFor(tileX: number, tileY: number): Slab[] {
  const h = (salt: number): number => hash2(tileX * 5.3 + salt, tileY * 9.1 + salt * 2.7);
  const count = 1 + Math.floor(h(1) * 3);
  const slabs: Slab[] = [];
  for (let i = 0; i < count; i++) {
    slabs.push({
      dx: 0.04 + h(2 + i * 3) * 0.42,
      dz: 0.04 + h(3 + i * 3) * 0.42,
      w: 0.24 + h(4 + i * 3) * 0.18,
      d: 0.2 + h(5 + i * 3) * 0.18,
      shade: 0.5 + h(6 + i * 3) * 0.1,
    });
  }
  return slabs;
}

/** One large cobble paver square inside a tile (2x2 per tile, dark gaps
 *  between). The renderer draws the dark gap quad first, then these. */
export interface CobbleSquare {
  dx: number;
  dz: number;
  size: number;
  shade: number;
}
export function cobbleSquaresFor(tileX: number, tileY: number): CobbleSquare[] {
  const h = (salt: number): number => hash2(tileX * 3.7 + salt, tileY * 11.3 + salt * 1.9);
  const gap = 0.07;
  const size = (1 - gap * 3) / 2;
  const squares: CobbleSquare[] = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      squares.push({
        dx: gap + c * (size + gap),
        dz: gap + r * (size + gap),
        size,
        shade: 0.54 + h(1 + r * 2 + c) * 0.09,
      });
    }
  }
  return squares;
}

/** True when a colour is in the forbidden lavender/pink family (the
 *  BUILD 980 bug look). Used by asserts, not by the renderer. */
export function isLavenderPink(c: Rgb): boolean {
  const [r, g, b] = c;
  return b > 0.55 && r > 0.5 && b > g + 0.12 && r > g + 0.05;
}

/** BUILD 988 unified sun: ONE fixed sun direction for every face-shaded
 *  box, replacing the inconsistent per-renderer multipliers (cube() used
 *  .75/.84/.68, houseBox() used .78/.88/.72, and neither agreed with the
 *  house contact-shadow blobs). The blobs are offset +x/+z, so shadows
 *  fall southeast and the sun stands northwest-high: north (-z) and west
 *  (-x) faces catch the sun, south (+z) and east (+x) faces lie in shade,
 *  tops are brightest. Average face brightness is 0.896 vs the old
 *  cube average 0.884, so the scene does not net-darken. */
export const SUN_SHADE = { north: 1.0, south: 0.75, west: 0.9, east: 0.68, top: 1.15 };

/** Multiply an RGB colour by a scalar, clamped to 1. */
export function shadeRgb(c: Rgb, s: number): Rgb {
  return [Math.min(1, c[0] * s), Math.min(1, c[1] * s), Math.min(1, c[2] * s)];
}

/** BUILD 988 ground tint: deterministic per-tile colour variation so
 *  lawns and dirt stop reading as flat paint. The old renderer added a
 *  brightness-only ((x*13+y*7)&3)*.012 wash — barely visible and the
 *  same on every terrain. This varies HUE inside each terrain's own
 *  colour family (grass green↔yellow-green, dirt tan↔brown), seeded by
 *  hash2(tile) so it is stable across rebuilds and cameras, and stays
 *  far from lavender/pink (asserted). Water gets no tint: a flat water
 *  plane reads better. Baked at build time — zero runtime cost. */
export function groundTintDelta(terrain: string, x: number, y: number): Rgb {
  const v = hash2(x * 3.1 + 7.7, y * 5.9 + 3.3) - 0.5; // -0.5..0.5
  const v2 = hash2(x * 9.4 + 1.7, y * 4.2 + 8.1) - 0.5;
  switch (terrain) {
    case 'grass': return [v * 0.04, v * 0.06, v2 * 0.02];
    case 'dirt': return [v * 0.05, v * 0.04, v2 * 0.03];
    case 'sand': return [v * 0.04, v * 0.03, v2 * 0.02];
    case 'stone': return [v * 0.03, v * 0.03, v * 0.03];
    case 'water': return [0, 0, 0];
    default: return [v * 0.03, v * 0.03, v * 0.03];
  }
}
