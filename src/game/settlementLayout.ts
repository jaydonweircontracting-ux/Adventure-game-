// Procgen Arcana port — BUILD 975.
//
// Original TypeScript re-implementation of the PORTABLE ideas in
// Flynsarmy gd-procgen-arcana-addon v0.1 (CC0 1.0; verified in the
// REA analysis at ~/workspace/rea-targets/procgen-arcana/ANALYSIS.md).
// No GDScript is copied, no Godot scene/node structure shapes this
// module, and no demo data ships: the demo village's coordinates,
// counts, and placeholder models are NOT game content.
//
// What the addon actually is: a JSON -> scene MAPPER, not a
// generator. It contains no RNG, no layout code, no seeds. This port
// therefore has two halves, and only the second comes from the
// addon: (a) the game itself supplies the JSON — the adapter below
// builds it in memory from the game's own town data (no files, no
// Watabou web tool at runtime, ever); (b) the mapper below turns
// that JSON into placed instances using the game's EXISTING art.
//
// Five portable ideas shipped here:
//  1. GeoJSON-style FeatureCollection settlement schema as an
//     engine-independent layout interchange (in-memory only).
//  2. Footprint -> placed-model mapping: quad -> width / depth /
//     center / rotation -> scaled, rotated house instance, using
//     the game's existing Kenney town-kit art (BUILD 959), never
//     placeholder shapes as final art.
//  3. Width-aware path ribbons: roads flat, planks raised 0.5,
//     palisade wall ribbons 2 high, following a path — expressed
//     as data the game's existing path rendering consumes, not a
//     replacement for it.
//  4. Flat-slab layering with tiny offsets as a draw-order
//     convention (earth 0, fields/squares/water above it), so
//     overlapping slabs never z-fight. The Godot numbers (0.01)
//     do not transfer literally; the game uses draw-order ranks.
//  5. Art-swap by import option: the layout never names art. An
//     art table injected at map time assigns art keys; swapping
//     the table swaps the art without touching any layout.
//
// Two documented addon hazards are FIXED here, not copied:
//  - Silent-skip dispatch: unknown feature ids are collected into
//    `warnings` on the result (and never silently dropped). The
//    caller decides whether to log them; nothing vanishes.
//  - Order-dependent water handler: earth/water roles are resolved
//    in a dedicated first pass over the whole feature list, so a
//    file with water before earth maps identically to one with
//    earth before water. The two-set island-in-lake case is
//    resolved in that same pass, never by mutating a sibling node
//    mid-iteration.
//
// One further correction to the addon rule, documented not hidden:
// the addon's building rule computes depth as |p3 - p1|, which for
// a ring-ordered quad is a DIAGONAL, not a side. This port uses
// the geometrically correct depth |p2 - p1| (the edge adjacent to
// p0 -> p1), with center as the mean of all four points. For an
// axis-aligned rect (every game town house) both rules agree on
// center and rotation, and the corrected depth equals the rect
// height, which the diagonal rule does not.
//
// The schema carries no names, doors, interiors, heights, or
// gameplay data. Everything that makes a footprint a dwelling —
// doors and their triggers, exit points, path endpoints, identity,
// ownership, contents, interiors, NPC assignment — is supplied by
// the game and checked, never invented, by checkDoorAgreement().
// The standing quality bar holds: a placed house's painted door,
// door trigger, exit point, and path endpoint must all agree, and
// the round-trip test (game town -> collection -> placements)
// proves the door trigger survives the mapping untouched.
//
// Pure module: no React, no App.tsx imports (doorGeometry is pure
// and is the single source of truth for door positions, so the
// mapper uses it rather than duplicating its formulas).

import { fieldDoorPosition, newHouseDoorPosition } from './doorGeometry';

// ---------------------------------------------------------------- types

export type ArcanaPoint = [number, number];

export interface ArcanaValues {
  generator?: string;
  version?: string;
  roadWidth?: number;
  wallThickness?: number;
}

export interface ArcanaFeature {
  id: string;
  type: string;
  // Polygon / MultiPolygon / MultiPoint shapes.
  coordinates?: unknown;
  // GeometryCollection shapes (roads, planks): { type, coordinates, width }.
  geometries?: { type?: string; coordinates?: ArcanaPoint[]; width?: number }[];
}

export interface ArcanaCollection {
  type: 'FeatureCollection';
  features: ArcanaFeature[];
  values?: ArcanaValues;
}

export interface HouseRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PlacedBuilding {
  id: string;
  /** Footprint quad in ring order: TL, TR, BR, BL. */
  quad: ArcanaPoint[];
  center: { x: number; y: number };
  width: number;
  depth: number;
  /** Degrees, clockwise from east, from the p0 -> p1 edge. 0 = axis-aligned. */
  rotationDeg: number;
  /** Axis-aligned rect recovered from the placement (exact at rotation 0). */
  rect: HouseRect;
  /** Art key from the injected art table — never from the layout. */
  artKey: string;
  /** Door point on the facing edge, via the game's door geometry. */
  door: { x: number; y: number };
  facing: 'north' | 'south' | 'east' | 'west';
}

export interface PlacedTree {
  id: string;
  x: number;
  y: number;
  artKey: string;
}

export type RibbonKind = 'road' | 'plank' | 'palisade';

export interface PathRibbon {
  id: string;
  kind: RibbonKind;
  points: { x: number; y: number }[];
  width: number;
  /** Height profile: roads flat, planks raised 0.5, palisade 2 high. */
  height: number;
  /** Draw-order rank (flat-slab layering convention, idea 4). */
  drawOrder: number;
}

export type SlabKind = 'earth' | 'field' | 'square' | 'water' | 'island';

export interface GroundSlab {
  id: string;
  kind: SlabKind;
  ring: { x: number; y: number }[];
  drawOrder: number;
}

export interface MappedLayout {
  buildings: PlacedBuilding[];
  trees: PlacedTree[];
  ribbons: PathRibbon[];
  slabs: GroundSlab[];
  /** Unknown / skipped feature ids — the silent-skip hazard, fixed. */
  warnings: string[];
}

/** Art-swap table (idea 5): layout ids map to game art, injected at map time. */
export interface SettlementArtTable {
  house: string;
  tree: string;
}

export const DEFAULT_SETTLEMENT_ART: SettlementArtTable = {
  house: 'kenney-town-kit',
  tree: 'rodwan-tree',
};

/** Draw-order ranks: earth 0, fields/squares 1, water 2, roads 3, planks 4, palisade 5. */
export const LAYER_DRAW_ORDER: Record<string, number> = {
  earth: 0,
  field: 1,
  square: 1,
  water: 2,
  road: 3,
  plank: 4,
  palisade: 5,
};

// ------------------------------------------------------------ validation

function isFinitePoint(p: unknown): p is ArcanaPoint {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1])
  );
}

function asPointList(value: unknown): ArcanaPoint[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every(isFinitePoint)) return null;
  return value as ArcanaPoint[];
}

function asRingList(value: unknown): ArcanaPoint[][] | null {
  // MultiPolygon coordinates: polygon[] -> ring[] -> point[].
  // First ring of each polygon only, matching the addon rule.
  if (!Array.isArray(value)) return null;
  const out: ArcanaPoint[][] = [];
  for (const poly of value) {
    if (!Array.isArray(poly) || poly.length === 0) return null;
    const ring = asPointList(poly[0]);
    if (!ring) return null;
    out.push(ring);
  }
  return out;
}

/** Polygon coordinates: ring[] -> point[]. First ring only. */
function asPolygonRing(value: unknown): ArcanaPoint[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return asPointList(value[0]);
}

// ------------------------------------------------------- footprint rule

/**
 * Quad -> placed building (portable idea 2). Returns null + a warning
 * for non-quads instead of indexing out of range (triangle) or silently
 * losing a point (pentagon) the way the addon rule does.
 */
export function footprintToPlacement(
  quad: unknown,
  id: string,
  facing: PlacedBuilding['facing'],
  artKey: string,
  newStyleDoor: boolean,
): { placement: PlacedBuilding | null; warning: string | null } {
  const points = asPointList(quad);
  if (!points || points.length !== 4) {
    return {
      placement: null,
      warning: `building ${id}: expected a 4-point quad, got ${Array.isArray(quad) ? quad.length : 'non-array'} points — skipped, not placed`,
    };
  }
  const [p0, p1, p2] = points;
  const width = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const depth = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (width <= 0 || depth <= 0) {
    return { placement: null, warning: `building ${id}: degenerate footprint (width ${width}, depth ${depth}) — skipped` };
  }
  const center = {
    x: points.reduce((s, p) => s + p[0], 0) / 4,
    y: points.reduce((s, p) => s + p[1], 0) / 4,
  };
  const rotationDeg = (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI;
  const rect: HouseRect =
    Math.abs(rotationDeg) < 0.001 || Math.abs(Math.abs(rotationDeg) - 180) < 0.001
      ? {
          left: Math.min(...points.map((p) => p[0])),
          top: Math.min(...points.map((p) => p[1])),
          right: Math.max(...points.map((p) => p[0])),
          bottom: Math.max(...points.map((p) => p[1])),
        }
      : { left: center.x - width / 2, top: center.y - depth / 2, right: center.x + width / 2, bottom: center.y + depth / 2 };
  const door = newStyleDoor ? newHouseDoorPosition(rect) : fieldDoorPosition(rect);
  return {
    placement: { id, quad: points, center, width, depth, rotationDeg, rect, artKey, door, facing },
    warning: null,
  };
}

/** Quad for an axis-aligned rect, ring order TL, TR, BR, BL. */
export function quadFromRect(rect: HouseRect): ArcanaPoint[] {
  return [
    [rect.left, rect.top],
    [rect.right, rect.top],
    [rect.right, rect.bottom],
    [rect.left, rect.bottom],
  ];
}

/**
 * Standing quality-bar check: does the door the placement implies agree
 * with the game's live door trigger for the same rect? Exact for
 * axis-aligned houses (the whole town); tolerance covers float noise
 * only, never a real disagreement.
 */
export function checkDoorAgreement(
  rect: HouseRect,
  liveDoorTrigger: { x: number; y: number },
  newStyleDoor: boolean,
  tolerance = 0.01,
): { agrees: boolean; expected: { x: number; y: number }; distance: number } {
  const expected = newStyleDoor ? newHouseDoorPosition(rect) : fieldDoorPosition(rect);
  const distance = Math.hypot(expected.x - liveDoorTrigger.x, expected.y - liveDoorTrigger.y);
  return { agrees: distance <= tolerance, expected, distance };
}

// ------------------------------------------------------------- the mapper

const HANDLED_IDS = new Set([
  'values',
  'earth',
  'buildings',
  'trees',
  'roads',
  'planks',
  'palisade',
  'water',
  'fields',
  'squares',
]);

/**
 * Map a FeatureCollection to placed instances (portable ideas 2–5).
 * Two passes: pass 1 resolves earth/water roles order-independently
 * (the order-dependent water hazard, fixed); pass 2 maps the rest.
 * Unknown ids, `values` metadata, and the handler-less `prisms` /
 * `extendable` ids are reported in `warnings`, never silently dropped.
 * `values` metadata (generator/version/roadWidth/wallThickness) is
 * provenance only: roadWidth is IGNORED — per-geometry widths win,
 * because the demo's roadWidth 7 contradicts its own road widths 1.4.
 */
export function mapSettlementLayout(
  collection: ArcanaCollection,
  art: SettlementArtTable = DEFAULT_SETTLEMENT_ART,
): MappedLayout {
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('settlement layout: document must be a FeatureCollection with a features array');
  }
  const warnings: string[] = [];
  const buildings: PlacedBuilding[] = [];
  const trees: PlacedTree[] = [];
  const ribbons: PathRibbon[] = [];
  const slabs: GroundSlab[] = [];

  // ---- Pass 1: earth + water roles, order-independent.
  const earthFeature = collection.features.find((f) => f.id === 'earth');
  const waterFeature = collection.features.find((f) => f.id === 'water');
  const earthRing = earthFeature ? asPolygonRing(earthFeature.coordinates) : null;
  if (earthFeature && !earthRing) warnings.push('earth: expected a polygon ring — skipped');
  const waterSets = waterFeature ? asRingList(waterFeature.coordinates) : null;
  if (waterFeature && !waterSets) warnings.push('water: expected polygon sets — skipped');
  if (earthRing) {
    slabs.push({ id: 'earth', kind: 'earth', ring: earthRing.map(([x, y]) => ({ x, y })), drawOrder: LAYER_DRAW_ORDER.earth });
  }
  if (waterSets && waterSets.length > 0) {
    if (waterSets.length >= 2) {
      // Island-in-lake, resolved here — not by mutating the earth slab
      // mid-iteration. Set 1 = island (dry land inside the lake),
      // set 2 = the lake itself (earth-sized rect reads as water).
      slabs.push({ id: 'water-island', kind: 'island', ring: waterSets[0].map(([x, y]) => ({ x, y })), drawOrder: LAYER_DRAW_ORDER.water });
      slabs.push({ id: 'water', kind: 'water', ring: waterSets[1].map(([x, y]) => ({ x, y })), drawOrder: LAYER_DRAW_ORDER.water });
    } else {
      slabs.push({ id: 'water', kind: 'water', ring: waterSets[0].map(([x, y]) => ({ x, y })), drawOrder: LAYER_DRAW_ORDER.water });
    }
  }

  // ---- Pass 2: everything else, in file order.
  for (const feature of collection.features) {
    if (feature.id === 'earth' || feature.id === 'water') continue; // resolved in pass 1
    if (!HANDLED_IDS.has(feature.id)) {
      warnings.push(`unknown feature id '${feature.id}' — no handler; carried as a warning, not silently dropped`);
      continue;
    }
    if (feature.id === 'values') continue; // provenance only, ignored by design
    if (feature.id === 'buildings') {
      const polys = asRingList(feature.coordinates);
      if (!polys) {
        warnings.push('buildings: expected MultiPolygon coordinates — skipped');
        continue;
      }
      polys.forEach((ring, i) => {
        const { placement, warning } = footprintToPlacement(ring, `building_${i}`, 'south', art.house, false);
        if (warning) warnings.push(warning);
        if (placement) buildings.push(placement);
      });
      continue;
    }
    if (feature.id === 'trees') {
      const points = asPointList(feature.coordinates);
      if (!points) {
        warnings.push('trees: expected a point list — skipped');
        continue;
      }
      points.forEach(([x, y], i) => trees.push({ id: `tree_${i}`, x, y, artKey: art.tree }));
      continue;
    }
    if (feature.id === 'roads' || feature.id === 'planks') {
      const kind: RibbonKind = feature.id === 'roads' ? 'road' : 'plank';
      const height = kind === 'road' ? 0.02 : 0.5;
      (feature.geometries ?? []).forEach((g, i) => {
        const points = asPointList(g.coordinates);
        if (!points || points.length < 2) {
          warnings.push(`${kind} ${i}: expected a 2+ point path — skipped`);
          return;
        }
        ribbons.push({
          id: `${kind}_${i}`,
          kind,
          points: points.map(([x, y]) => ({ x, y })),
          width: typeof g.width === 'number' && Number.isFinite(g.width) && g.width > 0 ? g.width : 1.4,
          height,
          drawOrder: LAYER_DRAW_ORDER[kind],
        });
      });
      continue;
    }
    if (feature.id === 'palisade') {
      // Code-only in the addon (no demo data): input is a list of paths.
      const paths = Array.isArray(feature.coordinates) ? feature.coordinates : [];
      paths.forEach((path, i) => {
        const points = asPointList(path);
        if (!points || points.length < 2) {
          warnings.push(`palisade ${i}: expected a 2+ point path — skipped`);
          return;
        }
        ribbons.push({
          id: `palisade_${i}`,
          kind: 'palisade',
          points: points.map(([x, y]) => ({ x, y })),
          width: 1,
          height: 2,
          drawOrder: LAYER_DRAW_ORDER.palisade,
        });
      });
      continue;
    }
    if (feature.id === 'fields' || feature.id === 'squares') {
      const kind: SlabKind = feature.id === 'fields' ? 'field' : 'square';
      const polys = asRingList(feature.coordinates);
      if (!polys) {
        warnings.push(`${feature.id}: expected MultiPolygon coordinates — skipped`);
        continue;
      }
      polys.forEach((ring, i) =>
        slabs.push({ id: `${kind}_${i}`, kind, ring: ring.map(([x, y]) => ({ x, y })), drawOrder: LAYER_DRAW_ORDER[kind] }),
      );
      continue;
    }
  }
  return { buildings, trees, ribbons, slabs, warnings };
}

// -------------------------------------------------------------- adapter

export interface AdapterHouse {
  rect: HouseRect;
  facing?: PlacedBuilding['facing'];
  newStyleDoor?: boolean;
}

export interface AdapterInput {
  earthSize: number;
  houses: AdapterHouse[];
  trees: { x: number; y: number }[];
  roads?: { points: { x: number; y: number }[]; width: number }[];
  planks?: { points: { x: number; y: number }[]; width: number }[];
  palisadePaths?: { x: number; y: number }[][];
  fields?: { x: number; y: number }[][];
  waterRings?: { x: number; y: number }[][];
}

/**
 * Game town -> FeatureCollection, in memory (option A from the
 * analysis). No files are read or written, and the Watabou web tool
 * is never involved: the game's own generator is the source.
 * Door/trigger/exit/path data is NOT carried in the collection —
 * the schema cannot hold it — so it stays with the game and is
 * re-joined by footprint on the way back (see checkDoorAgreement).
 */
export function townToArcanaCollection(input: AdapterInput): ArcanaCollection {
  const features: ArcanaFeature[] = [];
  const half = input.earthSize / 2;
  // values = provenance metadata only (generator/version); the mapper
  // ignores it, and roadWidth is never copied into a builder.
  features.push({ id: 'values', type: 'Feature' });
  features.push({
    id: 'earth',
    type: 'Polygon',
    coordinates: [[[-half, -half], [half, -half], [half, half], [-half, half]]],
  });
  if (input.houses.length > 0) {
    features.push({
      id: 'buildings',
      type: 'MultiPolygon',
      coordinates: input.houses.map((h) => [quadFromRect(h.rect)]),
    });
  }
  if (input.trees.length > 0) {
    features.push({ id: 'trees', type: 'MultiPoint', coordinates: input.trees.map((t) => [t.x, t.y]) });
  }
  for (const [id, list] of [
    ['roads', input.roads ?? []],
    ['planks', input.planks ?? []],
  ] as const) {
    if (list.length > 0) {
      features.push({
        id,
        type: 'GeometryCollection',
        geometries: list.map((r) => ({ type: 'LineString', coordinates: r.points.map((p) => [p.x, p.y] as ArcanaPoint), width: r.width })),
      });
    }
  }
  if (input.palisadePaths && input.palisadePaths.length > 0) {
    features.push({
      id: 'palisade',
      type: 'MultiLineString',
      coordinates: input.palisadePaths.map((path) => path.map((p) => [p.x, p.y] as ArcanaPoint)),
    });
  }
  if (input.fields && input.fields.length > 0) {
    features.push({
      id: 'fields',
      type: 'MultiPolygon',
      coordinates: input.fields.map((ring) => [ring.map((p) => [p.x, p.y] as ArcanaPoint)]),
    });
  }
  if (input.waterRings && input.waterRings.length > 0) {
    features.push({
      id: 'water',
      type: 'MultiPolygon',
      coordinates: input.waterRings.map((ring) => [ring.map((p) => [p.x, p.y] as ArcanaPoint)]),
    });
  }
  return { type: 'FeatureCollection', features, values: { generator: 'adventure-game-town', version: '1' } };
}

// ------------------------------------------------------- seven systems

export type SettlementSystem = 'realm' | 'city' | 'village' | 'cave' | 'glade' | 'dungeon' | 'dwelling';

export interface SystemHandling {
  system: SettlementSystem;
  coverage: 'covered' | 'scaled' | 'partial' | 'not-covered';
  handling: string;
}

/**
 * Plain statement of how EACH of the seven systems is handled — no
 * coverage is claimed the schema does not provide.
 */
export const SEVEN_SYSTEM_HANDLING: SystemHandling[] = [
  {
    system: 'realm',
    coverage: 'not-covered',
    handling:
      'NOT covered by the schema: one settlement footprint, no multi-settlement, biome, or region concept. Realm scale stays with the game world systems; at most one settlement collection sits inside a realm, which is not a realm system.',
  },
  {
    system: 'city',
    coverage: 'scaled',
    handling:
      'Scaled village only: same features, more of them, palisade paths as walls. No districts, quarters, gates, or civic buildings exist in the schema; any district logic is the game\'s own, not this port\'s.',
  },
  {
    system: 'village',
    coverage: 'covered',
    handling:
      'Direct fit: the game supplies the collection via the in-memory adapter from its own town generator (or authored JSON), and the mapper places it with game art. Doors, interiors, NPC homes, shops, and names are joined by the game, not the schema.',
  },
  {
    system: 'cave',
    coverage: 'not-covered',
    handling:
      'NOT covered: zero cave features exist in the schema. Caves are NOT routed through it — BUILD 964 (Kenney cave kit) already owns caves separately and is untouched.',
  },
  {
    system: 'glade',
    coverage: 'partial',
    handling:
      'Partial, composition-only: earth + tree points with a gap can express a clearing, but no feature marks the clearing itself. The game must define the clearing and any glade content; in this schema a glade is trees + ground.',
  },
  {
    system: 'dungeon',
    coverage: 'not-covered',
    handling:
      'NOT covered as a system: no rooms, corridors, doors, loot, or monsters. BUILD 927–931 own dungeon layout and are untouched; a painted floor plan is not a dungeon.',
  },
  {
    system: 'dwelling',
    coverage: 'partial',
    handling:
      'Footprint + placement only: a quad resolves to a scaled, rotated house instance. Interiors, doors and triggers, identity, ownership, and contents are supplied and verified by the game (checkDoorAgreement).',
  },
];

export function systemHandlingFor(system: SettlementSystem): SystemHandling {
  const row = SEVEN_SYSTEM_HANDLING.find((r) => r.system === system);
  if (!row) throw new Error(`unknown settlement system: ${system}`);
  return row;
}
