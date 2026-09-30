// BUILD 326: the Rusty Tankard's cellar — deterministic rat spawns for the
// "Rats in the Cellar" quest. Positions are interior percent coords (0..100),
// the same space the interior player position uses, so the melee-arc check
// works unchanged. Pure + deterministic so the sim can cover it.

export type CellarRat = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hitFlash: boolean;
};

/** Rat ids start here so they never collide with field goat/monster ids. */
export const CELLAR_RAT_ID_BASE = 900001;
/** Two swings at starting strength (5 base + 4 str = 9 per hit). */
export const CELLAR_RAT_HP = 12;
/** The quest needs 5 kills; the cellar holds 6 so one can slip away. */
export const CELLAR_RAT_COUNT = 6;

// Spots keep clear of the entry ladder (x 44..56, y 80..100) and the barrel
// rows along the walls, and out of the furniture collision rects.
const CELLAR_RAT_SPOTS: Array<{ x: number; y: number }> = [
  { x: 22, y: 40 },
  { x: 38, y: 30 },
  { x: 64, y: 34 },
  { x: 78, y: 54 },
  { x: 28, y: 64 },
  { x: 60, y: 70 },
];

export function initialCellarRats(count: number = CELLAR_RAT_COUNT): CellarRat[] {
  const rats: CellarRat[] = [];
  for (let i = 0; i < count && i < CELLAR_RAT_SPOTS.length; i++) {
    rats.push({
      id: CELLAR_RAT_ID_BASE + i,
      x: CELLAR_RAT_SPOTS[i].x,
      y: CELLAR_RAT_SPOTS[i].y,
      hp: CELLAR_RAT_HP,
      maxHp: CELLAR_RAT_HP,
      hitFlash: false,
    });
  }
  return rats;
}
