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

/**
 * BUILD 992 — proportion pass. ONE character-height scale anchors the
 * whole town, measured from the player billboard (half-width .34,
 * height 1.48; NPCs 1.42). Ratios match the low-poly street reference
 * (a ratio target only — no reference assets are copied): door
 * ~1.2x character, tree ~3.0x, 2-story house ~4.0x, first-person eye
 * ~0.9x, level gaze by default. BEFORE (991): door 1.06 (0.72x —
 * shorter than the character), tree 2.8 (1.89x), 2-story walls+roof
 * 4.60 (3.11x), eye 1.6 (1.08x, looking down at doors). AFTER (992):
 * door 1.78, tree 4.44, 2-story 5.95 at span 5, eye 1.33. VISUAL ONLY:
 * footprints, door tiles, triggers, exits, paths, collision and layout
 * are untouched — only rendered heights/widths change.
 */
export const CHARACTER_H = 1.48;
/** Door: 1.78 tall (1.20x char), 0.87 wide (same 2.04:1 ratio as before). */
export const DOOR_W = 0.87;
export const DOOR_H = 1.78;
/** Story heights in world units: ground clears the door + headroom. */
export const GROUND_FLOOR_H = 2.1;
export const UPPER_FLOOR_H = 1.6;

/** Tree tiers (trunk + 3 foliage tiers): total 4.44 = 3.00x char. */
export interface TreeTier { w: number; h: number; y0: number; color: Rgb; }
export const TREE_TIERS: TreeTier[] = [
  { w: 0.35, h: 1.74, y0: 0, color: [0.36, 0.23, 0.12] },
  { w: 1.82, h: 1.43, y0: 1.59, color: [0.13, 0.30, 0.14] },
  { w: 1.35, h: 1.11, y0: 2.70, color: [0.16, 0.34, 0.16] },
  { w: 0.87, h: 0.95, y0: 3.49, color: [0.19, 0.37, 0.18] },
];
export const TREE_TOTAL_H = 4.44;
/** First-person camera: eye at 0.90x char, level gaze by default. */
export const FIRST_PERSON_EYE = 1.33;
export const FP_PITCH_MIN = -1.2;
export const FP_PITCH_MAX = 1.0;
/** Orbit zoom range + first-person engage/exit (zoom units). */
export const ZOOM_MIN = 4;
export const ZOOM_MAX = 32;
export const ZOOM_HYST = 1.5;
/** BUILD 1002 — view-distance constants (see Engine3DWorldView).
 * The detailed 45x45 ground window ends 22 tiles out, but the visible
 * ground reaches ~79 tiles at default orbit zoom and ~150 at max
 * zoom-out, and past the 200x200 map edge there is no ground at all —
 * so the sky quad showed through as empty area. VIEW_FAR_PLANE is the
 * projection far plane (was 200: at minimum orbit pitch the horizon
 * ray runs past 200, leaving a sky strip under the horizon line).
 * VIEW_BAND_HALF/CELL is the coarse fog-bridging ground band around
 * the window (its cells overlap the window and hide under real ground
 * at y=-0.02, so no stitching math is needed), and VIEW_APRON_HALF is
 * the single horizon-coloured quad under everything at y=-0.03. The
 * apron half-size exceeds far plane + max camera offset (300 + 32),
 * so every ground point the frustum can reach is covered.
 * BUILD 1005 — 240-tile view (Minecraft-style render distance).
 * Fog now completes at the 240 view edge instead of 30, and ground
 * geometry reaches ±240 in graduated cells: 4-tile cells to ±64, then
 * 16-tile cells to ±240 (961 quads), so vertex growth stays bounded
 * (~12.3k band vertices vs ~1.9k at 1002). The apron still reaches
 * ±340 past the far band. VIEW_FAR_PLANE is UNCHANGED at 300, by
 * measurement, not oversight: max camera-to-ground-point distance is
 * 272 tiles (240 view + 32 max orbit radius at min pitch 0.22), 280
 * with the 8-tile rebuild-staleness worst case, and apron coverage
 * reaches 340 - 32 = 308 from the camera — so 300 sits inside the
 * covering window [280, 308] with margin both sides, and raising it
 * would only coarsen depth precision at 240 tiles (near plane 0.1).
 * Layer y values are strictly monotonic (see VIEW_*_Y) so the far
 * layers never cover each other; far-field band/apron overlaps sit
 * at full horizon colour, where any depth tie is invisible.
 * BUILD 1007 — "unlimited" view (see everything). The world itself
 * is finite (200x200: farthest real points ~282 tiles apart), so
 * unlimited means every real object visible from anywhere, ground
 * unbroken to the visual horizon, haze only as a faint horizon
 * blend. Far ground becomes NON-OVERLAPPING rings (adjacent rects,
 * no shared plan area): band square ±64, far ring (64,240] at
 * 16-tile cells, horizon ring (240,600] at 64-tile cells, apron ring
 * (600,1000] as 4 quads. Rings cannot z-fight at any range because
 * no two layers occupy the same ground point — depth precision at
 * 300+ tiles (near plane 0.1) is far too coarse for the old
 * 0.02-0.03 layer separations, so overlap was removed instead of
 * widened. The only remaining overlap is window∩band (<=64 tiles,
 * depth resolution <=0.0024 there, far under the 0.02 separation).
 * VIEW_FAR_PLANE is 700: worst camera-to-farthest-object is 282
 * (map diagonal) + 64 (max orbit radius) = 346, but the far plane
 * must ALSO push the clip edge past the fog-full distance — the
 * clip edge sits at worst 700 - 64 (orbit) - 8 (staleness) = 628
 * tiles from the build centre, past FOG_FAR 600, so the clipped edge
 * is always uniform horizon colour meeting the sky's horizon colour
 * (the 1005 failure mode was a hazed-green clip edge). Apron
 * coverage 1000 - 64 = 936 > 700, so the apron always extends past
 * the far plane. Depth precision at a given distance depends on the
 * near plane and the distance, not the far plane, so 700 costs
 * nothing versus 300 at 282 tiles. */
export const VIEW_FAR_PLANE = 700;
export const VIEW_BAND_HALF = 64;
export const VIEW_BAND_CELL = 4;
export const VIEW_FAR_BAND_HALF = 240;
export const VIEW_FAR_BAND_CELL = 16;
export const VIEW_HORIZON_BAND_HALF = 600;
export const VIEW_HORIZON_BAND_CELL = 64;
export const VIEW_APRON_HALF = 1000;
/** Underlay layering (BUILD 1007): window 0 > band -0.02 > far band
 * -0.05 > horizon band -0.08 > apron ring -0.11, strictly monotonic
 * as belt-and-braces — but the real guarantee is non-overlap: far
 * rings share edges only, never plan area, so they cannot fight
 * regardless of depth precision. The apron ring MUST stay lowest. */
export const VIEW_BAND_Y = -0.02;
export const VIEW_FAR_BAND_Y = -0.05;
export const VIEW_HORIZON_BAND_Y = -0.08;
export const VIEW_APRON_Y = -0.11;

/** Steep roof rise as a fraction of the cross-axis span. rise/run = 0.9,
 *  i.e. a ~42 degree pitch, matching the reference's steep roofs.
 *  BUILD 1050: the pitch is now a per-house value (roofPitch, the
 *  rise fraction) — 0.25 shallow, 0.45 the old standard, 0.6 steep —
 *  so the town's rooflines vary instead of all sharing one slope. */
export function roofRise(span: number, pitch = 0.45): number {
  return pitch * span;
}
export function roofPitchDeg(span: number, pitch = 0.45): number {
  return (Math.atan2(roofRise(span, pitch), span / 2) * 180) / Math.PI;
}
/** BUILD 1050: a parapet roof is flat-topped with a raised edge
 *  (PARAPET_H) instead of a pitched ridge — the flat-roof form for
 *  shops. The chimney cap rides the parapet top, not a ridge. */
export const PARAPET_H = 0.35;

export type DoorFace = 'north' | 'south' | 'west' | 'east';

export interface HouseDesign {
  stories: 2 | 3;
  stone: Rgb;
  plaster: Rgb;
  timber: Rgb;
  roof: Rgb;
  /** Ridge axis: along the longer horizontal side. BUILD 1050: the
   *  axis is no longer forced by the footprint — 40% of houses flip
   *  it by seed (salt 8), so some roofs run north-south instead of
   *  east-west and the town stops reading as one roofline. */
  roofAxis: 'x' | 'z';
  /** BUILD 1050: roof form — 'pitched' is the old steep roof,
   *  'parapet' is a flat top with a raised edge (the shop form).
   *  roofPitch is the rise fraction of the pitched form: 0.25
   *  shallow, 0.45 the old standard, 0.6 steep. Both are seeded
   *  (salts 9-10), so a house keeps its roof across reloads and
   *  moves (the 1006 seed rule), and a placed house keeps the roof
   *  it was built with (the seed rides on the placement, 1050). */
  roofForm: 'pitched' | 'parapet';
  roofPitch: number;
  /** Ground floor on the door face is an open colonnade (posts + recess)
   *  instead of a stone wall, as in the reference's shop fronts. */
  openFront: boolean;
  chimney: boolean;
  doorFace: DoorFace;
  // BUILD 1014: the old `lit` flags (one per window slot, static) were
  // removed — window light is now a per-house schedule in houseFx.ts
  // (seeded on/off times, evaluated per frame), and the world builder
  // emits only the timber frames.
  // BUILD 1015: commercial-building identity (inn / blacksmith /
  // general store). Undefined for ordinary houses. Set by
  // houseDesignForVariant for the three new variants; the house loop
  // adds the sign / awning+crates / wide chimney from it.
  building?: 'inn' | 'smith' | 'store';
  /** Wide chimney (blacksmith): a 0.55 box instead of the 0.35 house
   *  chimney. The cap height is unchanged, so chimneyTopFor (and the
   *  smoke) need no special case. */
  wideChimney?: boolean;
}

/** BUILD 1012 — placeable house variants. AUDIT (measured from the
 *  generated town, not assumed): the town's 26 unique generated huts
 *  are 6x5 (11), 6x4 (5), 4x3 (4), 5x4 (3), 4x4 (2), 5x5 (1) — ZERO
 *  3x3 huts in town — with 15 two-story, 11 three-story, 6 open
 *  colonnade shopfronts, 7 chimneys, all roofAxis 'x'. The placed
 *  house was always 3x3 with a hash-random design (44% 3-story in a
 *  map-wide sample), which is why every placement read as the same
 *  skinny tall house: the footprint was fixed at the one size the
 *  town never uses, and the design was a positional lottery, not a
 *  choice. Each variant below is a REAL town combination: its
 *  footprint is a measured town size, its stories/openFront are
 *  values the emitter already produces. Chimney, stone, plaster,
 *  timber and roof stay seed-driven (town behaviour —
 *  two cottages at different spots differ in those, exactly like two
 *  town houses do). No new models, no new parameter values. */
export type HouseVariantId = 'cottage' | 'tall' | 'shop' | 'grand' | 'inn' | 'smith' | 'store' | 'windmill' | 'mine';
export interface HouseVariant {
  id: HouseVariantId;
  label: string;
  /** Footprint in tiles (w x d). */
  w: number;
  d: number;
  stories: 2 | 3;
  openFront: boolean;
}
export const HOUSE_VARIANTS: Record<HouseVariantId, HouseVariant> = {
  cottage: { id: 'cottage', label: 'Cottage', w: 4, d: 3, stories: 2, openFront: false },
  tall: { id: 'tall', label: 'Tall House', w: 3, d: 3, stories: 3, openFront: false },
  shop: { id: 'shop', label: 'Shopfront', w: 6, d: 4, stories: 2, openFront: true },
  grand: { id: 'grand', label: 'Grand House', w: 6, d: 5, stories: 3, openFront: false },
  // BUILD 1015: the town's commercial buildings. Inn: the tallest
  // house in town (3 stories, 6x5) with a hanging sign. Blacksmith:
  // 5x4 with a wide chimney and darker stone. General Store: 5x4
  // open colonnade with an awning and goods crates — distinct from
  // the generic 6x4 Shopfront by footprint, awning, and crates.
  inn: { id: 'inn', label: 'Inn', w: 6, d: 5, stories: 3, openFront: false },
  smith: { id: 'smith', label: 'Blacksmith', w: 5, d: 4, stories: 2, openFront: false },
  store: { id: 'store', label: 'General Store', w: 5, d: 4, stories: 2, openFront: true },
  // BUILD 1038: the placeable windmill — a 3x3 stone tower, 2 stories,
  // no open front. It is a house variant so it rides the whole
  // building system (placement, rotation, save/load, undo/redo, move,
  // chunks, AREA SELECT), but it is NOT a house shape: the view
  // branches on the variant and emits a tower + pyramid cap instead
  // of floors + pitched roof, and houseDesignForVariant forces no
  // chimney (a windmill has no smoke). Its rotating blades are
  // per-frame fx (windmill.ts + houseFx.ts), not part of the design.
  windmill: { id: 'windmill', label: 'Windmill', w: 3, d: 3, stories: 2, openFront: false },
  // BUILD 1040: the placeable mine — a 3x3 stone structure, 2
  // stories by the type (the render branch ignores stories, like
  // the windmill's). It is a house variant so it rides the whole
  // building system (placement, rotation, save/load, undo/redo,
  // move, chunks, AREA SELECT), but it is NOT a house shape: the
  // view branches on the variant and emits a rocky mound + dark
  // entrance instead of floors + pitched roof, and
  // houseDesignForVariant forces no chimney (a mine has no smoke)
  // and houseFx gives it no window panes (its branch emits no
  // frames, so panes would float in the air). It IS enterable like
  // any house (a bare interior for now — no mining inside yet).
  mine: { id: 'mine', label: 'Mine', w: 3, d: 3, stories: 2, openFront: false },
};
export const HOUSE_VARIANT_IDS: HouseVariantId[] = ['cottage', 'tall', 'shop', 'grand', 'inn', 'smith', 'store', 'windmill', 'mine'];

/** Derive a house's full look from its hut rect + door tile. The door
 *  face comes from the layout's door position (door on the y0 edge =
 *  north face, y1 = south, x0 = west, x1 = east) — the layout is never
 *  moved, only read. BUILD 1006: a moved hut passes its ORIGINAL rect's
 *  origin as (seedX0, seedY0), so the hash-driven look (stories, stone,
 *  plaster, timber, roof, open front, chimney) stays
 *  exactly the look the house had before it moved; proportions and door
 *  face still come from the CURRENT rect (same size, same facing, so
 *  they agree anyway). Default seeds are the rect itself. */
export function houseDesignFor(
  x0: number, y0: number, x1: number, y1: number,
  doorX: number, doorY: number,
  seedX0: number = x0, seedY0: number = y0,
): HouseDesign {
  const h = (salt: number): number => hash2(seedX0 * 3.1 + salt, seedY0 * 7.7 + salt * 1.3);
  const doorFace: DoorFace =
    doorY <= y0 ? 'north' : doorY >= y1 ? 'south' : doorX <= x0 ? 'west' : 'east';
  const w = Math.max(2, x1 - x0 + 1);
  const d = Math.max(2, y1 - y0 + 1);
  const pick = <T>(arr: readonly T[], v: number): T => arr[Math.floor(v * arr.length) % arr.length];
  // BUILD 1050: roof variety, all seeded (salts 8-10, outside the
  // light-schedule salts 31-33 and the design salts 1-7, so no
  // correlation with chimneys, colours, or light times). Axis: the
  // footprint's long side, flipped for 40% of houses. Pitch: 30%
  // shallow (0.25), 45% standard (0.45), 25% steep (0.6). Form: a
  // parapet for 15% of houses, and for 45% of open-front shops
  // (the flat-roof shop form from the Stage 1 plan).
  const openFront = h(6) < 0.25;
  const axisBase: 'x' | 'z' = w >= d ? 'x' : 'z';
  const hp = h(9);
  const hf = h(10);
  return {
    stories: h(1) < 0.45 ? 3 : 2,
    stone: pick(STONE_GREYS, h(2)),
    plaster: pick(PLASTERS, h(3)),
    timber: pick(TIMBERS, h(4)),
    roof: pick(ROOFS, h(5)),
    roofAxis: h(8) < 0.4 ? (axisBase === 'x' ? 'z' : 'x') : axisBase,
    roofForm: hf < 0.15 || (openFront && hf < 0.45) ? 'parapet' : 'pitched',
    roofPitch: hp < 0.3 ? 0.25 : hp < 0.75 ? 0.45 : 0.6,
    openFront,
    chimney: h(7) < 0.5,
    doorFace,
  };
}

/** BUILD 1012: a placed house's design when the player picked a
 *  variant. The variant fixes ONLY the structural choices the user
 *  picked (stories, open front); everything else is the exact same
 *  seed hash as houseDesignFor, so colours, chimney and lit windows
 *  still vary by placement spot exactly like town houses do.
 *  BUILD 1015: the three commercial variants also fix their identity:
 *  the inn and the blacksmith ALWAYS have a chimney (a smokeless inn
 *  or smithy would read wrong, and their chimneys feed the reworked
 *  smoke), the smith gets darker stone and a wide chimney, and all
 *  three carry the `building` flag the house loop dresses them from.
 *  The store keeps its seeded chimney like any house. */
export function houseDesignForVariant(
  variant: HouseVariant,
  x0: number, y0: number, x1: number, y1: number,
  doorX: number, doorY: number,
  seedX0: number = x0, seedY0: number = y0,
): HouseDesign {
  const base = houseDesignFor(x0, y0, x1, y1, doorX, doorY, seedX0, seedY0);
  const out: HouseDesign = { ...base, stories: variant.stories, openFront: variant.openFront };
  if (variant.id === 'inn') { out.building = 'inn'; out.chimney = true; }
  else if (variant.id === 'smith') {
    out.building = 'smith'; out.chimney = true; out.wideChimney = true;
    out.stone = [0.38, 0.38, 0.36];
  } else if (variant.id === 'store') { out.building = 'store'; }
  // BUILD 1038: a windmill has no chimney and no smoke.
  else if (variant.id === 'windmill') { out.chimney = false; }
  // BUILD 1040: a mine has no chimney and no smoke either.
  else if (variant.id === 'mine') { out.chimney = false; }
  return out;
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

/** BUILD 1009 — smooth value noise in [0,1] over a lattice of `spacing`
 *  tiles: bilinear smoothstep interpolation of decorrelated lattice
 *  hashes. Unlike hash2 (one independent random per tile), this is a
 *  CONTINUOUS field of position: neighbouring points differ slightly,
 *  never randomly, so a tint built on it has no steps at any sampling
 *  scale — a 64-tile cell's corners interpolate the same field the
 *  1-tile window samples directly. Defined for every real coordinate
 *  (negative and past the map edge included), so far cells outside the
 *  map evaluate it exactly like cells inside. */
export function groundNoise(x: number, z: number, spacing: number): number {
  const lx = x / spacing, lz = z / spacing;
  const ix = Math.floor(lx), iz = Math.floor(lz);
  const fx = lx - ix, fz = lz - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix * 127.1 + 311.7, iz * 269.5 + 183.3);
  const b = hash2((ix + 1) * 127.1 + 311.7, iz * 269.5 + 183.3);
  const c = hash2(ix * 127.1 + 311.7, (iz + 1) * 269.5 + 183.3);
  const d = hash2((ix + 1) * 127.1 + 311.7, (iz + 1) * 269.5 + 183.3);
  const top = a + (b - a) * ux, bot = c + (d - c) * ux;
  return top + (bot - top) * uz;
}

/**
 * BUILD 1034 — the heightfield (Stage 2 terrain). A single low octave
 * of the 1009 ground noise at a 64-tile wavelength, re-centred from
 * [0, 1] to [-1, 1] and scaled to ±1.5 tiles: gentle rolling hills,
 * never mountains. Pure position, no world state — the ground, every
 * object, the picker and the camera all sample this SAME function, so
 * they agree by construction. Max slope ~0.07 per tile (the noise
 * gradient over a 64-tile cell), so a 6-tile house footprint varies
 * by at most ~0.4 tiles and a 1-tile step is never a wall. Walkability
 * is untouched: the field is visual only, the tile step model is flat.
 */
export const GROUND_FIELD_SPACING = 64;
export const GROUND_FIELD_AMPLITUDE = 1.5;
export function groundElevation(x: number, z: number): number {
  return (groundNoise(x, z, GROUND_FIELD_SPACING) * 2 - 1) * GROUND_FIELD_AMPLITUDE;
}

/** BUILD 988 ground tint, REWORKED in BUILD 1009: deterministic colour
 *  variation so lawns and dirt stop reading as flat paint. The 988 form
 *  sampled hash2 per tile, so adjacent tiles differed randomly
 *  (near-field checkerboard) and far cells rendered ONE centre tile's
 *  hash over 16/64 tiles (literal tint blocks) — and a tile's colour
 *  JUMPED when it crossed the ±22 window edge on rebuild, which is
 *  the "chunks generating in the sight line" the user reported: the
 *  ground visibly regenerated as he moved, across the whole periphery.
 *  The 1009 form keeps the exact 988 per-terrain amplitudes (same
 *  palette, same hue families, still far from lavender/pink) but builds
 *  them on two-octave smooth value noise (8-tile rolling variation +
 *  2.5-tile fine grain) instead of the tile hash, so the field is
 *  continuous: a tile's colour no longer depends on which ring renders
 *  it, and ring boundaries are invisible. Water gets no tint: a flat
 *  water plane reads better. Baked at build time — zero runtime cost.
 *  CALLERS MUST EVALUATE THIS PER VERTEX (corner), not once per quad:
 *  a per-quad sample of even a smooth field reintroduces the blocks
 *  (one flat colour per cell). Engine3DWorldView's ground emission
 *  uses quadV (per-corner colours via triV) for exactly this reason. */
export function groundTintDelta(terrain: string, x: number, y: number): Rgb {
  // Octave mix 0.8/0.2 (not 0.65/0.35): the fine octave is what limits
  // how accurately a 4-tile band cell interpolates the field at its
  // interior points (a 2.5-tile wave is under-sampled by 4-tile
  // corners), and the band→window crossing is the one ring crossing
  // close enough to see. 0.2 keeps near-field grain while holding the
  // worst 4-tile interpolation error to ~1/4 of the old hash jump.
  const n = groundNoise(x, y, 8) * 0.8 + groundNoise(x, y, 2.5) * 0.2 - 0.5; // -0.5..0.5
  const n2 = groundNoise(x + 37.2, y + 11.8, 8) * 0.8 + groundNoise(x + 37.2, y + 11.8, 2.5) * 0.2 - 0.5;
  // BUILD 1034 — tint amplitude ~3x the 1009 values (Stage 2 terrain):
  // the 1009 tint was measured at max 0.027, nearly invisible against
  // the flat ground. These give a measured max grass delta >= 0.08 —
  // the ground reads as varied patches, not a uniform lawn — while
  // staying far below the level where adjacent tiles clash.
  switch (terrain) {
    case 'grass': return [n * 0.12, n * 0.18, n2 * 0.06];
    case 'dirt': return [n * 0.15, n * 0.12, n2 * 0.09];
    case 'sand': return [n * 0.12, n * 0.09, n2 * 0.06];
    case 'stone': return [n * 0.09, n * 0.09, n * 0.09];
    case 'water': return [0, 0, 0];
    default: return [n * 0.03, n * 0.03, n * 0.03];
  }
}
