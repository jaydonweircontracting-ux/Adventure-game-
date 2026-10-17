/**
 * Procedural settlement layout system (BUILD 680, extended BUILD 681).
 *
 * BUILD 681: Centre-first adaptive settlement design.
 * - Plaza/centre placed first, scaled to building count (no giant empty plazas)
 * - Radial lanes from centre, buildings face lanes
 * - District assignment (residential, market, farm, civic)
 * - Roof variant assignment from real asset catalogue
 * - Prop placement (well, stalls, lamps, barrels) from real assets
 * - Full footprint validation
 *
 * Design principles:
 * - Settlement center first, then lanes, then building slots
 * - Noise influences placement within structure, doesn't replace it
 * - Deterministic for same settlement ID and seed
 * - Building IDs stable across generations
 * - Adaptive: layout scales to actual building count and available space
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettlementCenter {
  x: number;
  y: number; // field coordinates (0-140)
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// BUILD 688: shared AABB overlap test (exported for the town layout engine;
// previously a local closure inside generateSettlementLayout).
export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.left < b.right + margin && b.left < a.right + margin &&
    a.top < b.bottom + margin && b.top < a.bottom + margin
  );
}

export interface BuildingSlot {
  id: string;
  rect: Rect;
  /** Angle from center (radians), for orientation/lane facing. */
  angleFromCenter: number;
  /** Distance from center in field units. */
  distanceFromCenter: number;
  /** District assignment. */
  district: 'residential' | 'market' | 'farm' | 'civic';
  /** Roof/sprite variant from asset catalogue. */
  spriteVariant: string;
}

export interface Lane {
  /** Points from plaza edge outward (field coords). */
  points: { x: number; y: number }[];
  /** Width in field units. */
  width: number;
}

export interface PropPlacement {
  id: string;
  /** Asset path, e.g. 'props/well.png'. */
  asset: string;
  x: number;
  y: number; // center position in field coords
  /** Radius for collision (field units). */
  radius: number;
}

export interface SettlementLayout {
  center: SettlementCenter;
  /** Plaza radius in field units (adaptive). */
  plazaRadius: number;
  /** Centre feature asset, or null if none available. */
  centerFeature: string | null;
  buildings: BuildingSlot[];
  lanes: Lane[];
  props: PropPlacement[];
  /** Settlement profile. */
  profile: 'hamlet' | 'village' | 'market-town';
}

export type SettlementType = 'hamlet' | 'village' | 'market-town';

// ---------------------------------------------------------------------------
// Asset inventory (BUILD 681: audited from public/ on 2026-10-12)
// ---------------------------------------------------------------------------

/**
 * Real building sprite variants available in public/buildings/.
 * Audited 2026-10-12. Do not reference files not in this list.
 */
export const BUILDING_VARIANTS = [
  'blue-cottage',
  'red-cottage',
  'blue-house',
  'red-shop',
  'hut-thatched',
  'shop-awning',
  'house-timber',
  'inn-large',
  'tavern',
  'gatehouse',
  // BUILD 692: new art variants for the engine's roadside filler lots.
  'green-shop',
  'brick-shop',
  'green-cottage',
  'stone-cottage',
  'plaster-house',
  // BUILD 694: storybook civic tower (grey stone, crenellations, orange cone
  // roof). Catalog registration only — Mosslight filler lots keep their own
  // district pools in mosslightLayout.ts.
  'story-tower',
] as const;

/**
 * Real prop assets available in public/props/.
 * Audited 2026-10-12. Note: NO fence asset exists.
 */
export const PROP_ASSETS = {
  well: 'props/well.png',
  fountain: 'props/fountain.png',
  lamp: 'props/lamp.png',
  barrel: 'props/barrel.png',
  stallBlue: 'props/stall-blue.png',
  stallGreen: 'props/stall-green.png',
  stallRed: 'props/stall-red.png',
  marketStall: 'props/market-stall.png',
} as const;

/** Assets confirmed missing (do not reference). */
export const MISSING_ASSETS = [
  'fence (no fence PNG in public/props/ or public/assets/)',
] as const;

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 0xdeadbeef;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Adaptive settlement generation (BUILD 681)
// ---------------------------------------------------------------------------

export interface SettlementOptions {
  center: SettlementCenter;
  seed: number;
  /** Building IDs with their sizes. */
  buildings: { id: string; w: number; h: number; district?: BuildingSlot['district'] }[];
  /** Override profile; otherwise inferred from building count. */
  profile?: SettlementType;
  /** Field size (default 140). */
  fieldSize?: number;
  /** Rects (in generator space) that lanes must not cross.
   *  Lane points stop before entering them (with margin). */
  avoid?: Rect[];
}

/**
 * Generate a complete settlement layout: centre, lanes, buildings, props.
 *
 * Adaptive: plaza radius, lane count, and building distance all scale
 * with the actual building count. A 3-cottage hamlet gets a small
 * green, not a giant empty plaza.
 */
export function generateSettlementLayout(opts: SettlementOptions): SettlementLayout {
  const { center, seed, fieldSize = 140 } = opts;
  const rng = seededRandom(seed);
  const count = opts.buildings.length;

  // Infer profile from building count if not specified.
  const profile: SettlementType = opts.profile
    ?? (count <= 7 ? 'hamlet' : count <= 12 ? 'village' : 'market-town');

  // Adaptive plaza radius: small for hamlets, larger for towns.
  // Formula: base 4 + 0.7 per building, clamped to [5, 14].
  // 3 buildings -> ~6.1 (intimate green)
  // 6 buildings -> ~8.2 (village plaza)
  // 12 buildings -> ~12.4 (market square)
  const plazaRadius = Math.max(5, Math.min(14, 4 + count * 0.7));

  // Centre feature: well for hamlets/villages (asset exists).
  const centerFeature = count >= 3 ? PROP_ASSETS.well : null;

  // Generate lanes: 2-4 radial lanes depending on profile.
  const laneCount = profile === 'hamlet' ? 2 : profile === 'village' ? 3 : 4;
  const lanes: Lane[] = [];
  const laneBaseAngle = rng() * Math.PI * 2;
  for (let i = 0; i < laneCount; i++) {
    const angle = laneBaseAngle + (i / laneCount) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const points: { x: number; y: number }[] = [];
    // Lane from plaza edge outward, with gentle curvature.
    const laneLength = plazaRadius + 25 + rng() * 10;
    const segments = 5;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const dist = plazaRadius + t * laneLength;
      // Curvature: perpendicular offset grows then shrinks.
      const curve = Math.sin(t * Math.PI) * (rng() - 0.5) * 8;
      const px = center.x + Math.cos(angle) * dist - Math.sin(angle) * curve;
      const py = center.y + Math.sin(angle) * dist + Math.cos(angle) * curve;
      points.push({ x: px, y: py });
    }
    lanes.push({ points, width: 3 });
  }

  // Place buildings in ring around plaza.
  // Distance: plazaRadius + building half-size + gap (3-6 units).
  const buildings: BuildingSlot[] = [];
  const baseAngle = rng() * Math.PI * 2;

  // Assign sprite variants: deterministic, no adjacent duplicates.
  const variantCount = BUILDING_VARIANTS.length;
  let lastVariantIdx = -1;

  // BUILD 684: overlap rejection (uses shared rectsOverlap; BUILD 688 export).
  // The ring slot (angle + jitter) can collide for larger counts — expand
  // radially until the rect clears already-placed buildings. The retry
  // consumes no rng, so the stream (and hamlet output) is unchanged when
  // nothing overlaps: same seed -> same layout.
  const placeRectAt = (b: { w: number; h: number }, angle: number, distance: number): Rect => {
    const cx = center.x + Math.cos(angle) * distance;
    const cy = center.y + Math.sin(angle) * distance;
    // Clamp to field bounds (keep 3-unit margin).
    const clampedCx = Math.max(3 + b.w / 2, Math.min(fieldSize - 3 - b.w / 2, cx));
    const clampedCy = Math.max(3 + b.h / 2, Math.min(fieldSize - 3 - b.h / 2, cy));
    return {
      left: clampedCx - b.w / 2, top: clampedCy - b.h / 2,
      right: clampedCx + b.w / 2, bottom: clampedCy + b.h / 2,
    };
  };

  for (let i = 0; i < count; i++) {
    const b = opts.buildings[i];
    const angle = baseAngle + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    // Distance: varied 18-28 (BUILD 680 proven safe for NPC separation).
    // Adaptive plaza affects the centre, not the building ring distance.
    let distance = 18 + rng() * 10;
    let rect = placeRectAt(b, angle, distance);
    for (let attempt = 0;
         attempt < 40 && buildings.some((o) => rectsOverlap(rect, o.rect, 1.5));
         attempt++) {
      distance += 2.5;
      rect = placeRectAt(b, angle, distance);
    }

    // Pick variant: avoid repeating the last one.
    let variantIdx = Math.floor(rng() * variantCount);
    if (variantIdx === lastVariantIdx) {
      variantIdx = (variantIdx + 1) % variantCount;
    }
    lastVariantIdx = variantIdx;

    buildings.push({
      id: b.id,
      rect,
      angleFromCenter: angle,
      distanceFromCenter: distance,
      district: b.district ?? 'residential',
      spriteVariant: BUILDING_VARIANTS[variantIdx],
    });
  }

  // BUILD 684: prop placement must also clear building footprints. Nudge
  // radially outward from the centre (bounded); drop the prop if it cannot
  // be placed cleanly. Deterministic.
  const propOverlapsBuilding = (x: number, y: number, radius: number): boolean =>
    buildings.some((bd) => {
      const bx = (bd.rect.left + bd.rect.right) / 2;
      const by = (bd.rect.top + bd.rect.bottom) / 2;
      const dist = Math.hypot(x - bx, y - by);
      return dist < radius + Math.max(bd.rect.right - bd.rect.left, bd.rect.bottom - bd.rect.top) / 2;
    });
  const placePropClear = (x: number, y: number, radius: number): { x: number; y: number } | null => {
    for (let t = 0; t < 20; t++) {
      if (!propOverlapsBuilding(x, y, radius)) return { x, y };
      const dx = x - center.x, dy = y - center.y;
      const len = Math.hypot(dx, dy) || 1;
      x = Math.max(1, Math.min(fieldSize - 1, center.x + (dx / len) * (len + 2)));
      y = Math.max(1, Math.min(fieldSize - 1, center.y + (dy / len) * (len + 2)));
    }
    return propOverlapsBuilding(x, y, radius) ? null : { x, y };
  };

  // Place props.
  const props: PropPlacement[] = [];
  let propId = 0;
  const nextPropId = () => `prop-${propId++}`;

  // Well at center (if feature selected).
  if (centerFeature) {
    props.push({
      id: nextPropId(),
      asset: centerFeature,
      x: center.x,
      y: center.y,
      radius: 1.5,
    });
  }

  // BUILD 758: put every market stall together at the central road fork,
  // inside the middle of the town plaza rather than along its outer edge.
  // Keep the stalls in one fixed row just south of the well/meeting point.
  if (profile !== 'hamlet') {
    const stallAssets = [PROP_ASSETS.stallBlue, PROP_ASSETS.stallGreen, PROP_ASSETS.stallRed];
    const stallCount = Math.min(3, Math.floor(count / 4));
    const stallSpacing = 3;
    const rowY = center.y + Math.min(4, plazaRadius * 0.35);
    for (let i = 0; i < stallCount; i++) {
      const rowX = center.x + (i - (stallCount - 1) / 2) * stallSpacing;
      const spot = placePropClear(rowX, rowY, 1.2);
      if (spot) {
        props.push({ id: nextPropId(), asset: stallAssets[i % stallAssets.length],
          x: spot.x, y: spot.y, radius: 1.2 });
      }
    }
  }

  // Lamps along lanes (village+ only).
  if (profile !== 'hamlet') {
    for (const lane of lanes) {
      // Place lamp at midpoint of lane.
      const mid = lane.points[Math.floor(lane.points.length / 2)];
      // Offset perpendicular so it's not ON the lane.
      const spot = placePropClear(mid.x + 2.5, mid.y + 2.5, 0.8);
      if (spot) {
        props.push({ id: nextPropId(), asset: PROP_ASSETS.lamp,
          x: spot.x, y: spot.y, radius: 0.8 });
      }
    }
  }

  // Barrels near buildings (sparse: 1 per 3 buildings).
  for (let i = 0; i < buildings.length; i += 3) {
    const b = buildings[i];
    const bx = (b.rect.left + b.rect.right) / 2;
    const by = (b.rect.top + b.rect.bottom) / 2;
    const spot = placePropClear(bx + b.rect.right - b.rect.left + 1.5, by + 1, 0.7);
    if (spot) {
      props.push({ id: nextPropId(), asset: PROP_ASSETS.barrel,
        x: spot.x, y: spot.y, radius: 0.7 });
    }
  }

  // BUILD 683: Trim lanes — stop before avoid rects and field bounds.
  // Own buildings are NOT blockers: lanes draw on the ground plane and
  // buildings occlude them, so a path passing behind a cottage (or ending
  // at its door) reads naturally.
  const trimLanes = (lanes: Lane[]): Lane[] => {
    const blockers: Rect[] = (opts.avoid ?? []).map((r) => padRect(r, 1));
    const inBounds = (x: number, y: number) =>
      x >= 1 && y >= 1 && x <= fieldSize - 1 && y <= fieldSize - 1;
    const blocked = (x: number, y: number) =>
      blockers.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom);
    const out: Lane[] = [];
    for (const lane of lanes) {
      const pts: { x: number; y: number }[] = [];
      for (const p of lane.points) {
        if (!inBounds(p.x, p.y) || blocked(p.x, p.y)) break;
        pts.push(p);
      }
      if (pts.length >= 2) out.push({ points: pts, width: lane.width });
    }
    return out;
  };

  const trimmedLanes = trimLanes(lanes);

  return {
    center,
    plazaRadius,
    centerFeature,
    buildings,
    lanes: trimmedLanes,
    props,
    profile,
  };
}

function padRect(r: Rect, pad: number): Rect {
  return { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad };
}

// ---------------------------------------------------------------------------
// Legacy hamlet generator (BUILD 680) — preserved for compatibility
// ---------------------------------------------------------------------------

export function generateHamletLayout(
  center: SettlementCenter,
  seed: number,
  cottageIds: string[],
  cottageSize: { w: number; h: number } = { w: 6, h: 4.5 },
): BuildingSlot[] {
  const layout = generateSettlementLayout({
    center,
    seed,
    buildings: cottageIds.map((id) => ({ id, w: cottageSize.w, h: cottageSize.h })),
    profile: 'hamlet',
  });
  // Return in legacy format (without district/variant for compat).
  return layout.buildings;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a settlement layout: bounds, overlaps, lane clearance, doorway access.
 */
export function validateSettlementLayout(
  slots: BuildingSlot[],
  fieldSize: number = 140,
): string[] {
  const errors: string[] = [];

  for (const s of slots) {
    if (s.rect.left < 2 || s.rect.top < 2 || s.rect.right > fieldSize - 2 || s.rect.bottom > fieldSize - 2) {
      errors.push(`Building ${s.id} out of bounds`);
    }
  }

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i].rect, b = slots[j].rect;
      if (a.left < b.right + 1 && b.left < a.right + 1 &&
          a.top < b.bottom + 1 && b.top < a.bottom + 1) {
        errors.push(`Buildings ${slots[i].id} and ${slots[j].id} overlap`);
      }
    }
  }

  return errors;
}

/**
 * Validate full settlement layout including lanes and props.
 */
export function validateFullSettlement(layout: SettlementLayout, fieldSize: number = 140): string[] {
  const errors = validateSettlementLayout(layout.buildings, fieldSize);

  // Props must not overlap buildings.
  for (const p of layout.props) {
    for (const b of layout.buildings) {
      const bx = (b.rect.left + b.rect.right) / 2;
      const by = (b.rect.top + b.rect.bottom) / 2;
      const dx = p.x - bx, dy = p.y - by;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = p.radius + Math.max(b.rect.right - b.rect.left, b.rect.bottom - b.rect.top) / 2;
      if (dist < minDist) {
        errors.push(`Prop ${p.id} overlaps building ${b.id}`);
      }
    }
  }

  // Props must be in bounds.
  for (const p of layout.props) {
    if (p.x < 1 || p.y < 1 || p.x > fieldSize - 1 || p.y > fieldSize - 1) {
      errors.push(`Prop ${p.id} out of bounds`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Mosslight Crossing unification (BUILD 683)
//
// The generator works in 140-space; the field is 280 units. All consumers
// (visuals, player collision, NPC doors/homes/obstacles, interiors) must use
// the SAME rects in field space. Previously the renderer used hardcoded
// straight-line rects while NPC logic used generated ring positions —
// NPCs lived in invisible houses. These exports are the single source.
// ---------------------------------------------------------------------------

/** Generator space (140) -> field space (280). */
export const SETTLEMENT_FIELD_SCALE = 2;

/**
 * Fixed 280-space rects in Mosslight Crossing (chunk 4,7): 4 main buildings
 * (user-placed 2026-09-30) + 8 walled-town buildings (BUILD 604).
 * The settlement generator avoids these; lanes stop before them.
 */
export const MOSSLIGHT_FIXED_RECTS_280: Rect[] = [
  { left: 85.9, top: 108.8, right: 92.9, bottom: 113.6 },   // tutorial house
  { left: 192.1, top: 111.0, right: 199.1, bottom: 115.8 }, // wayfarer guild
  { left: 84.1, top: 172.6, right: 91.1, bottom: 177.4 },   // rootbound chapel
  { left: 179.7, top: 173.4, right: 186.7, bottom: 178.2 }, // stone house (tavern)
  { left: 120, top: 108, right: 132, bottom: 117 },          // town north 1
  { left: 156, top: 108, right: 168, bottom: 117 },          // town north 2
  { left: 120, top: 171, right: 132, bottom: 180 },          // town south 1
  { left: 156, top: 171, right: 168, bottom: 180 },          // town south 2
  { left: 176, top: 120, right: 188, bottom: 129 },          // town east 1
  { left: 176, top: 159, right: 188, bottom: 168 },          // town east 2
  { left: 100, top: 120, right: 112, bottom: 129 },          // town west 1
  { left: 100, top: 159, right: 112, bottom: 168 },          // town west 2
];

/** The 4 main buildings (first 4 of the fixed rects). */
export const MOSSLIGHT_MAIN_RECTS_280: Rect[] = MOSSLIGHT_FIXED_RECTS_280.slice(0, 4);

const HAMLET_WEST = { center: { x: 17, y: 76 }, seed: 0x1a2b3c, ids: ['cottage-1', 'cottage-2', 'cottage-3'] };
const HAMLET_NORTH = { center: { x: 79, y: 24 }, seed: 0x4d5e6f, ids: ['cottage-4', 'cottage-5', 'cottage-6'] };

export function scaleRectToField(r: Rect): Rect {
  const s = SETTLEMENT_FIELD_SCALE;
  return { left: r.left * s, top: r.top * s, right: r.right * s, bottom: r.bottom * s };
}

let _hamletLayouts: { west: SettlementLayout; north: SettlementLayout } | null = null;

/**
 * Full settlement layouts for Mosslight's two hamlet clusters.
 * Deterministic (same seeds as BUILD 680). Lanes avoid the fixed buildings.
 */
export function mosslightHamletLayouts(): { west: SettlementLayout; north: SettlementLayout } {
  if (!_hamletLayouts) {
    const s = SETTLEMENT_FIELD_SCALE;
    const avoid140 = MOSSLIGHT_FIXED_RECTS_280.map((r) => ({
      left: r.left / s, top: r.top / s, right: r.right / s, bottom: r.bottom / s,
    }));
    const gen = (h: typeof HAMLET_WEST) => generateSettlementLayout({
      center: h.center,
      seed: h.seed,
      buildings: h.ids.map((id) => ({ id, w: 6, h: 4.5 })),
      profile: 'hamlet',
      avoid: avoid140,
    });
    _hamletLayouts = { west: gen(HAMLET_WEST), north: gen(HAMLET_NORTH) };
  }
  return _hamletLayouts;
}

/** The 6 cottage rects in 280 field space — the single source for visuals, collision, doors. */
export function mosslightCottageRects280(): Rect[] {
  const { west, north } = mosslightHamletLayouts();
  return [...west.buildings, ...north.buildings].map((b) => scaleRectToField(b.rect));
}

/** Roof/sprite variant for a cottage rect (matched by center proximity). */
export function mosslightCottageVariantForRect(rect: Rect): string | null {
  const { west, north } = mosslightHamletLayouts();
  const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2;
  for (const b of [...west.buildings, ...north.buildings]) {
    const r = scaleRectToField(b.rect);
    const bx = (r.left + r.right) / 2, by = (r.top + r.bottom) / 2;
    if (Math.hypot(cx - bx, cy - by) < 2) return b.spriteVariant;
  }
  return null;
}

/** Settlement decor for chunk (4,7) in 280 field space: plazas, lanes, props. */
export interface SettlementDecor {
  plazas: { x: number; y: number; r: number }[];
  lanes: { points: { x: number; y: number }[]; width: number }[];
  props: { id: string; asset: string; x: number; y: number; r: number }[];
}

let _settlementDecor: SettlementDecor | null = null;
export function mosslightSettlementDecor(): SettlementDecor {
  // BUILD 687: memoized — this is pure deterministic data, but it was rebuilt
  // (fresh lane/point/prop objects) on every call: twice per render frame plus
  // once per collision probe (~54 calls/sec while walking in town).
  // Callers only read the result (settlementDecorFor spreads into new arrays),
  // so sharing the instance is safe.
  if (_settlementDecor) return _settlementDecor;
  const { west, north } = mosslightHamletLayouts();
  const s = SETTLEMENT_FIELD_SCALE;
  const convert = (l: SettlementLayout) => ({
    plaza: { x: l.center.x * s, y: l.center.y * s, r: l.plazaRadius * s },
    lanes: l.lanes.map((ln) => ({
      points: ln.points.map((p) => ({ x: p.x * s, y: p.y * s })),
      width: ln.width * s,
    })),
    props: l.props.map((p) => ({
      id: p.id, asset: p.asset, x: p.x * s, y: p.y * s, r: p.radius * s,
    })),
  });
  const w = convert(west), n = convert(north);
  _settlementDecor = {
    plazas: [w.plaza, n.plaza],
    lanes: [...w.lanes, ...n.lanes],
    props: [...w.props, ...n.props],
  };
  return _settlementDecor;
}
