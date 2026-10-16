// Deterministic exterior sprite assignment for world buildings.
// Uses only audited assets in public/buildings; no per-render randomness.
import { BUILDING_VARIANTS, mosslightCottageVariantForRect } from './settlements';
import { fillerVariantForLot, mosslightFillerLots } from './mosslightLayout';
import type { Rect } from './settlements';
export interface BuildingArt { variant: string; file: string; aspectRatio: '2 / 1' | '1 / 1' }
const MOSSLIGHT_PINNED_VARIANTS = ['blue-house', 'story-tower', 'plaster-house', 'tavern', '', '', '', '', '', '', 'blue-house', 'red-shop', 'green-shop', 'house-timber', 'shop-awning', 'blue-house', 'brick-shop', 'stone-cottage'] as const;
const HOUSE_VARIANTS = ['blue-cottage', 'red-cottage', 'hut-thatched', 'blue-house', 'house-timber', 'green-cottage', 'stone-cottage', 'plaster-house'] as const;
const SHOP_VARIANTS = ['red-shop', 'shop-awning', 'green-shop', 'brick-shop', 'tavern', 'inn-large'] as const;
const AUDITED = new Set<string>(BUILDING_VARIANTS);
export function buildingArtFor(chunk: { x: number; y: number }, index: number, rect: Rect): BuildingArt {
  let variant: string | undefined;
  if (chunk.x === 4 && chunk.y === 7) {
    if (index >= 0 && index < 4) variant = MOSSLIGHT_PINNED_VARIANTS[index];
    else if (index >= 4 && index < 10) variant = mosslightCottageVariantForRect(rect) ?? HOUSE_VARIANTS[(index + 1) % HOUSE_VARIANTS.length];
    else if (index >= 10 && index < 18) variant = MOSSLIGHT_PINNED_VARIANTS[index];
    else if (index >= 18) { const filler = mosslightFillerLots()[index - 18]; variant = filler ? fillerVariantForLot(rect, filler.district) : undefined; }
  }
  if (!variant) {
    const hash = Math.abs(Math.imul((chunk.x + 4099) | 0, 73856093) ^ Math.imul((chunk.y + 8191) | 0, 19349663) ^ Math.imul(index + 17, 83492791));
    const pool = index % 7 === 5 || index % 7 === 6 ? SHOP_VARIANTS : HOUSE_VARIANTS;
    variant = pool[hash % pool.length];
  }
  if (!AUDITED.has(variant)) variant = 'blue-cottage';
  return { variant, file: 'buildings/' + variant + '.png', aspectRatio: variant === 'hut-thatched' ? '1 / 1' : '2 / 1' };
}
