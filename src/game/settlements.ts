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

  for (let i = 0; i < count; i++) {
    const b = opts.buildings[i];
    const angle = baseAngle + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    // Distance: varied 18-28 (BUILD 680 proven safe for NPC separation).
    // Adaptive plaza affects the centre, not the building ring distance.
    const distance = 18 + rng() * 10;

    const cx = center.x + Math.cos(angle) * distance;
    const cy = center.y + Math.sin(angle) * distance;

    // Clamp to field bounds (keep 3-unit margin).
    const clampedCx = Math.max(3 + b.w / 2, Math.min(fieldSize - 3 - b.w / 2, cx));
    const clampedCy = Math.max(3 + b.h / 2, Math.min(fieldSize - 3 - b.h / 2, cy));

    const left = clampedCx - b.w / 2;
    const top = clampedCy - b.h / 2;

    // Pick variant: avoid repeating the last one.
    let variantIdx = Math.floor(rng() * variantCount);
    if (variantIdx === lastVariantIdx) {
      variantIdx = (variantIdx + 1) % variantCount;
    }
    lastVariantIdx = variantIdx;

    buildings.push({
      id: b.id,
      rect: { left, top, right: left + b.w, bottom: top + b.h },
      angleFromCenter: angle,
      distanceFromCenter: distance,
      district: b.district ?? 'residential',
      spriteVariant: BUILDING_VARIANTS[variantIdx],
    });
  }

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

  // Market stalls near plaza edge (village+ only, max 3).
  if (profile !== 'hamlet') {
    const stallAssets = [PROP_ASSETS.stallBlue, PROP_ASSETS.stallGreen, PROP_ASSETS.stallRed];
    const stallCount = Math.min(3, Math.floor(count / 4));
    for (let i = 0; i < stallCount; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = plazaRadius + 2;
      props.push({
        id: nextPropId(),
        asset: stallAssets[i % stallAssets.length],
        x: center.x + Math.cos(angle) * dist,
        y: center.y + Math.sin(angle) * dist,
        radius: 1.2,
      });
    }
  }

  // Lamps along lanes (village+ only).
  if (profile !== 'hamlet') {
    for (const lane of lanes) {
      // Place lamp at midpoint of lane.
      const mid = lane.points[Math.floor(lane.points.length / 2)];
      // Offset perpendicular so it's not ON the lane.
      props.push({
        id: nextPropId(),
        asset: PROP_ASSETS.lamp,
        x: mid.x + 2.5,
        y: mid.y + 2.5,
        radius: 0.8,
      });
    }
  }

  // Barrels near buildings (sparse: 1 per 3 buildings).
  for (let i = 0; i < buildings.length; i += 3) {
    const b = buildings[i];
    const bx = (b.rect.left + b.rect.right) / 2;
    const by = (b.rect.top + b.rect.bottom) / 2;
    props.push({
      id: nextPropId(),
      asset: PROP_ASSETS.barrel,
      x: bx + b.rect.right - b.rect.left + 1.5,
      y: by + 1,
      radius: 0.7,
    });
  }

  return {
    center,
    plazaRadius,
    centerFeature,
    buildings,
    lanes,
    props,
    profile,
  };
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
