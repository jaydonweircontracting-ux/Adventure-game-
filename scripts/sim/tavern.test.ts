// BUILD 282: Rusty Tankard services — focused simulation tests.
// Run with: npx tsx scripts/sim/tavern.test.ts
import {
  TAVERN_ANNEX_RECTS,
  BEER_PRICE,
  ROOM_PRICE,
  ESCORT_PRICE,
  ESCORT_BONUS_XP,
  BEER_BUFF_MULTIPLIER,
  BEER_BUFF_DURATION_MS,
  levelForXp,
  escortXpResult,
  statPointsForLevelGain,
  beerBuffActive,
  beerDamageMultiplier,
  pointInAnnexRect,
} from '../../src/game/tavern';

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + label); }
}

// --- Escort XP: one-time bonus of a full level (100 XP) ---
assert(levelForXp(0) === 1, 'xp 0 is level 1');
assert(levelForXp(99) === 1, 'xp 99 is level 1');
assert(levelForXp(100) === 2, 'xp 100 is level 2');
assert(levelForXp(250) === 3, 'xp 250 is level 3');
const fresh = escortXpResult(0);
assert(fresh.nextXp === 100, 'escort bonus adds 100 xp to a fresh character');
assert(fresh.nextLevel === 2, 'escort bonus takes a fresh character to level 2');
assert(fresh.leveledUp, 'escort bonus levels up a fresh character');
const mid = escortXpResult(50);
assert(mid.nextXp === 150 && mid.nextLevel === 2 && mid.leveledUp, 'escort bonus at 50 xp reaches level 2');
const high = escortXpResult(190);
assert(high.nextXp === 290 && high.nextLevel === 3 && high.leveledUp, 'escort bonus at 190 xp reaches level 3');
const almost = escortXpResult(95);
assert(almost.nextLevel === 2, 'escort bonus never skips more than one level from 95 xp');
assert(statPointsForLevelGain(1, 2, 5) === 5, 'one level = 5 stat points');
assert(statPointsForLevelGain(1, 3, 5) === 10, 'two levels = 10 stat points');

// --- Beer buff: +50% attack for one minute ---
const now = 1_000_000;
const until = now + BEER_BUFF_DURATION_MS;
assert(beerBuffActive(until, now), 'buff active right after drinking');
assert(beerBuffActive(until, until - 1), 'buff active 1ms before expiry');
assert(!beerBuffActive(until, until), 'buff expired exactly at the deadline');
assert(!beerBuffActive(until, until + 5000), 'buff expired after the deadline');
assert(beerDamageMultiplier(until, now) === BEER_BUFF_MULTIPLIER, 'buffed damage multiplier is 1.5x');
assert(beerDamageMultiplier(until, until + 1) === 1, 'expired buff deals normal damage');
assert(beerDamageMultiplier(0, now) === 1, 'no buff timestamp deals normal damage');
// Buff applies equally to melee and arrows: 10 base -> 15 buffed.
assert(Math.round(10 * beerDamageMultiplier(until, now)) === 15, '10 base damage becomes 15 under buff');

// --- Prices are sane ---
assert(BEER_PRICE === 5 && ROOM_PRICE === 10 && ESCORT_PRICE === 50, 'tavern prices are 5/10/50 gold');
assert(ESCORT_BONUS_XP === 100, 'escort bonus is one full level of xp');

// --- Annex rects: two wings, solid collision, no overlap with each other ---
assert(TAVERN_ANNEX_RECTS.length === 2, 'two tavern annexes exist');
const [west, east] = TAVERN_ANNEX_RECTS;
assert(west.right <= east.left, 'annexes do not overlap');
for (const r of TAVERN_ANNEX_RECTS) {
  assert(r.right > r.left && r.bottom > r.top, 'annex rect has positive area');
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  assert(pointInAnnexRect(cx, cy, r), 'annex center collides');
  assert(!pointInAnnexRect(cx, cy + 20, r), 'far from annex does not collide');
  assert(pointInAnnexRect(r.left - 0.4, cy, r), 'margin edge collides (matches 0.45 margin)');
  assert(!pointInAnnexRect(r.left - 1, cy, r), 'outside the margin does not collide');
}
// Annexes sit behind (north of) the tavern, which is around y 76..86.
for (const r of TAVERN_ANNEX_RECTS) {
  assert(r.bottom < 76, 'annex is north of the tavern building');
}

console.log(`tavern: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
