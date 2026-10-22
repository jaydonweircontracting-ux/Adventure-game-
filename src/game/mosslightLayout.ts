// Mosslight Crossing: the procedural town layout engine (BUILD 688/690) as
// the live town source, replacing the hand-authored townPlan.ts.
// The 18 gameplay-critical buildings are PINNED (fixed footprints, ids,
// roles, doors) — the engine generates streets, lanes, districts, props,
// and a bounded set of filler buildings around them.
// BUILD 690: phase-2 cutover. Seed 4242 pinned (selected from 8 candidates;
// validates with 0 errors, all 18 doors have lane endpoints <= 0.30u).
import {
  generateTownLayout,
  toChunkSpace,
  roadToTownLane,
  lotToBuildingRect,
  propToTownProp,
  type TownLayout,
} from './townLayout';
import {
  MOSSLIGHT_FIXED_RECTS_280,
  mosslightCottageRects280,
  type Rect,
} from './settlements';

/** The one true Mosslight seed. The town is identical every session. */
export const MOSSLIGHT_ENGINE_SEED = 4242;

/** Chunk-space ids of the 18 pinned buildings, in pin order. */
export const MOSSLIGHT_PINNED_NAMES = [
  'tutorial', 'guild', 'chapel', 'tavern',
  'cottage-1', 'cottage-2', 'cottage-3', 'cottage-4', 'cottage-5', 'cottage-6',
  'town-n1', 'town-n2', 'town-s1', 'town-s2',
  'town-e1', 'town-e2', 'town-w1', 'town-w2',
] as const;

/** Mosslight's chunk on the world map. */
export const MOSSLIGHT_CHUNK = { cx: 4, cy: 7 } as const;

function pinnedLots() {
  const rects = [
    ...MOSSLIGHT_FIXED_RECTS_280.slice(0, 4),
    ...mosslightCottageRects280(),
    ...MOSSLIGHT_FIXED_RECTS_280.slice(4),
  ];
  return rects.map((r: Rect, i: number) => ({
    id: MOSSLIGHT_PINNED_NAMES[i],
    footprint: {
      left: r.left - 140, top: r.top - 140,
      right: r.right - 140, bottom: r.bottom - 140,
    },
    facing: 'south' as const,
    district: 'residential' as const,
    kind: 'building' as const,
  }));
}

let cached: TownLayout | null = null;
let cachedChunked: ChunkedLayout | null = null;

/** The live Mosslight layout (local town space, memoized, deterministic). */
export function mosslightEngineLayout(): TownLayout {
  if (!cached) {
    cached = generateTownLayout(MOSSLIGHT_ENGINE_SEED, {
      size: 'town',
      arterialCount: 3,
      radius: 150,
      plazaCenter: { x: 4, y: 4 },
      plazaRadius: 13,
      pinnedLots: pinnedLots(),
      maxFillerLots: 8, // BUILD 959: denser town — was 5 (BUILD 895 left
      // breathing room); the Kenney rework fills the town out with more
      // roadside houses instead of empty green gaps.
      suburbs: false,
    });
  }
  return cached;
}

type ChunkedLayout = ReturnType<typeof toChunkSpace>;

/** The live Mosslight layout in chunk space (chunk 4,7), memoized. */
export function mosslightEngineChunkLayout(): ChunkedLayout {
  if (!cachedChunked) cachedChunked = toChunkSpace(mosslightEngineLayout());
  return cachedChunked;
}

/** Lanes for the renderer/collision, in chunk space (replaces townPlan lanes). */
export function mosslightEngineLanes() {
  return mosslightEngineChunkLayout().roads.map(roadToTownLane);
}

/** Solid engine props (fountain base, stalls, lamps, barrels, well) in chunk space. */
export function mosslightEngineProps() {
  return mosslightEngineChunkLayout().props.map(propToTownProp);
}

/** Filler building rects in chunk space (indices 18+, generic ids). Does NOT
 *  include the 18 pinned buildings — those come from the existing 689 source.
 *  Filtered to the chunk bounds: a building outside 0..280 would lose
 *  collision/doors when the player crosses into the neighboring chunk. */
export function mosslightFillerRects(): Rect[] {
  return mosslightEngineChunkLayout().lots
    .filter((l) => !l.pinned && l.kind === 'building')
    .map((l) => lotToBuildingRect(l))
    .filter((r) => r.left >= 0 && r.top >= 0 && r.right <= 280 && r.bottom <= 280);
}

/** Filler lots with district info, in chunk space (for district-appropriate
 *  variant assignment). Same bounds filter as mosslightFillerRects — the two
 *  stay in sync (rects only vs rects+district).
 *  BUILD 692: the engine's roadside filler lots get proper house/shop art
 *  variants instead of the generic position-hash rotation. */
let cachedFillerLots: { rect: Rect; district: string }[] | null = null;
/** Filler lots with district info — memoized (called in the per-frame render path). */
export function mosslightFillerLots(): { rect: Rect; district: string }[] {
  if (!cachedFillerLots) {
    cachedFillerLots = mosslightEngineChunkLayout().lots
      .filter((l) => !l.pinned && l.kind === 'building')
      .map((l) => ({ rect: lotToBuildingRect(l), district: l.district }))
      .filter((f) => f.rect.left >= 0 && f.rect.top >= 0 && f.rect.right <= 280 && f.rect.bottom <= 280);
  }
  return cachedFillerLots;
}

/** Pinned building rects in chunk space, in pin order.
 *  Byte-identical to the 689 source (same functions, same order). */
export function mosslightPinnedRects(): Rect[] {
  const rects = [
    ...MOSSLIGHT_FIXED_RECTS_280.slice(0, 4),
    ...mosslightCottageRects280(),
    ...MOSSLIGHT_FIXED_RECTS_280.slice(4),
  ];
  return rects.map((r: Rect) => ({ ...r }));
}

/** BUILD 692: district-appropriate art variant pools for the engine's
 *  roadside filler lots. Commercial lots get shops, residential get cottages.
 *  All doors verified on the south face (left of image, ~38% width). */
export const FILLER_VARIANT_POOLS: Record<string, readonly string[]> = {
  commercial: ['green-shop', 'brick-shop', 'shop-banner'],
  residential: ['green-cottage', 'stone-cottage', 'plaster-house', 'cottage-wide', 'house-balcony', 'house-tall'],
};
const FILLER_VARIANT_FALLBACK = ['plaster-house', 'green-shop'] as const;

/** Pick a district-appropriate variant for a filler lot. Stable hash on the
 *  rect (never flickers, varied across lots). Pure — safe for sim tests. */
export function fillerVariantForLot(rect: Rect, district: string): string {
  const pool = FILLER_VARIANT_POOLS[district] ?? FILLER_VARIANT_FALLBACK;
  const h = Math.abs(Math.sin((rect.left * 12.9898 + rect.top * 78.233) * 43758.5453) % 1);
  return pool[Math.floor(h * pool.length) % pool.length];
}

/** Clear the memo (tests only). */
export function clearMosslightEngineCache(): void {
  cached = null;
  cachedChunked = null;
  cachedFillerLots = null;
}
