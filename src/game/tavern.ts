// BUILD 282: Rusty Tankard services — pure helpers and constants.
//
// Prices, buff math, and the guest-room annex rects live here so they can be
// unit-tested without pulling in the whole React app. The UI in App.tsx
// imports these.

// BUILD 942: buff-duration formula (beer duration, below).
import { calcBuffDuration } from "./spellFormulas";

export type FieldRectLike = { left: number; top: number; right: number; bottom: number };

// Two guest-room wings built behind the Rusty Tankard so the tavern reads as a
// larger establishment. Fixed rects in the starting-town chunk (4,7).
export const TAVERN_ANNEX_RECTS: FieldRectLike[] = [
  { left: 71.5, top: 64.5, right: 80.5, bottom: 71.5 },
  { left: 90.5, top: 64.5, right: 99.5, bottom: 71.5 },
];

export const BEER_PRICE = 5;
export const ROOM_PRICE = 10;
export const ESCORT_PRICE = 50;
export const LOCKPICK_PRICE = 15;
// One-time escort bonus: a full level's worth of XP (levels are 100 XP each).
export const ESCORT_BONUS_XP = 100;
export const XP_PER_LEVEL = 100;
// Beer buff: +50% attack for one minute of wall-clock time.
// BUILD 942: the duration is computed by the buff-duration formula
// (formula 0 = flat base, 60 seconds) instead of a bare constant —
// the value is unchanged (60,000 ms). The multiplier itself is the
// buff's effect magnitude, not a duration, so it stays a constant.
// The beer mechanism stays timestamp-based (session-only, never
// saved); re-drinking while active already refreshes the timestamp,
// which is the stacking engine's same-buff refresh rule.
export const BEER_BUFF_MULTIPLIER = 1.5;
export const BEER_BUFF_DURATION_MS = calcBuffDuration({ base: 60, formula: 0 }, 0) * 1000;

/** Level for a given XP total (levels cost 100 XP each, starting at level 1). */
export function levelForXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

/** Result of hiring the escort: XP after the one-time bonus and the new level. */
export function escortXpResult(currentXp: number): { nextXp: number; nextLevel: number; leveledUp: boolean } {
  const nextXp = Math.max(0, currentXp) + ESCORT_BONUS_XP;
  const nextLevel = levelForXp(nextXp);
  return { nextXp, nextLevel, leveledUp: nextLevel > levelForXp(currentXp) };
}

/** Stat points awarded when crossing from one level to another. */
export function statPointsForLevelGain(previousLevel: number, nextLevel: number, pointsPerLevel: number): number {
  return Math.max(0, nextLevel - previousLevel) * pointsPerLevel;
}

/** Whether the beer attack buff is active right now. */
export function beerBuffActive(beerBuffUntil: number, now: number = Date.now()): boolean {
  return now < beerBuffUntil;
}

/** Attack multiplier while the beer buff is active (1.5x, else 1x). */
export function beerDamageMultiplier(beerBuffUntil: number, now: number = Date.now()): number {
  return beerBuffActive(beerBuffUntil, now) ? BEER_BUFF_MULTIPLIER : 1;
}

/** Point-in-rect check used for annex collision (matches App.tsx pointInRect). */
export function pointInAnnexRect(x: number, y: number, rect: FieldRectLike, margin = 0.45): boolean {
  return x >= rect.left - margin && x <= rect.right + margin && y >= rect.top - margin && y <= rect.bottom + margin;
}

// ---------------------------------------------------------------------------
// Service registry (BUILD 883 — SoX RoomServiceNeed model)
// ---------------------------------------------------------------------------

/** Needs a service building can satisfy. */
export type ServiceNeedKind = 'hunger' | 'social';

/**
 * Buildings declare which needs they service. The tavern (anchor key
 * 'tavern') serves food/drink (hunger) and company (social). NPC need
 * overrides in villageLife.ts resolve the anchor for a need from here.
 */
export const SERVICE_NEEDS: Record<string, ServiceNeedKind[]> = {
  tavern: ['hunger', 'social'],
};

/** Anchor key of the building servicing a need (undefined = none). */
export function serviceAnchorFor(need: ServiceNeedKind): string | undefined {
  for (const [anchorKey, needs] of Object.entries(SERVICE_NEEDS)) {
    if (needs.includes(need)) return anchorKey;
  }
  return undefined;
}
