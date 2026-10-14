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
      maxFillerLots: 8,
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
 *  include the 18 pinned buildings — those come from the existing 689 source. */
export function mosslightFillerRects(): Rect[] {
  return mosslightEngineChunkLayout().lots
    .filter((l) => !l.pinned && l.kind === 'building')
    .map((l) => lotToBuildingRect(l));
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

/** Clear the memo (tests only). */
export function clearMosslightEngineCache(): void {
  cached = null;
  cachedChunked = null;
}
