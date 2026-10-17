// Deterministic exterior sprite assignment for world buildings.
// BUILD 761: Mosslight's replacement buildings use original vector pixel-art
// sprites so the new vernacular reads consistently at every zoom level.
import { BUILDING_VARIANTS, mosslightCottageVariantForRect } from './settlements';
import { mosslightFillerLots } from './mosslightLayout';
import type { Rect } from './settlements';
export interface BuildingArt { variant: string; file: string; aspectRatio: '2 / 1' | '1 / 1' }
const MOSSLIGHT_PINNED_VARIANTS = ['new-stone-house', 'new-story-hall', 'new-plaster-house', 'new-tavern', '', '', '', '', '', '', 'new-stone-house', 'new-tavern', 'new-market-shop', 'new-timber-house', 'new-market-shop', 'new-stone-house', 'new-market-shop', 'new-stone-house'] as const;
const HOUSE_VARIANTS = ['new-stone-house', 'new-plaster-house', 'new-timber-house', 'new-green-cottage'] as const;
const SHOP_VARIANTS = ['new-market-shop', 'new-tavern', 'new-market-shop'] as const;
const AUDITED = new Set<string>(BUILDING_VARIANTS);
export function buildingArtFor(chunk: { x: number; y: number }, index: number, rect: Rect): BuildingArt {
  let variant: string | undefined;
  if (chunk.x === 4 && chunk.y === 7) {
    if (index >= 0 && index < 4) variant = MOSSLIGHT_PINNED_VARIANTS[index];
    else if (index >= 4 && index < 10) variant = HOUSE_VARIANTS[(index + 1) % HOUSE_VARIANTS.length];
    else if (index >= 10 && index < 18) variant = MOSSLIGHT_PINNED_VARIANTS[index];
    else if (index >= 18) { const filler = mosslightFillerLots()[index - 18]; variant = filler ? (filler.district === 'commercial' ? 'new-market-shop' : filler.district === 'civic' ? 'new-story-hall' : filler.district === 'industrial' ? 'new-timber-house' : HOUSE_VARIANTS[(index + 1) % HOUSE_VARIANTS.length]) : undefined; }
  }
  if (!variant) {
    const hash = Math.abs(Math.imul((chunk.x + 4099) | 0, 73856093) ^ Math.imul((chunk.y + 8191) | 0, 19349663) ^ Math.imul(index + 17, 83492791));
    const pool = index % 7 === 5 || index % 7 === 6 ? SHOP_VARIANTS : HOUSE_VARIANTS;
    variant = pool[hash % pool.length];
  }
  if (!AUDITED.has(variant)) variant = 'new-stone-house';
  const svgVariants = new Set(['new-stone-house', 'new-story-hall', 'new-plaster-house', 'new-tavern', 'new-market-shop', 'new-timber-house', 'new-green-cottage']);
  return {
    variant,
    file: 'buildings/' + variant + (svgVariants.has(variant) ? '.svg' : '.png'),
    aspectRatio: variant === 'new-story-hall' ? '1 / 1' : '2 / 1',
  };
}
