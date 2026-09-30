// BUILD 285: lockpicks + simple lockpicking.
// Run with: npx tsx scripts/sim/lockpicking.test.ts
import {
  chestsForChunk,
  attemptLockpick,
  serializeOpenedChests,
  parseOpenedChests,
  LOCKPICK_SUCCESS_CHANCE,
  type LockedChest,
} from '../../src/game/lockpicking';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + name); }
}

// Deterministic: same chunk + info -> same chests.
{
  const a = chestsForChunk({ x: 6, y: 7 }, { hasRoad: true, danger: 2, terrain: 'meadow' });
  const b = chestsForChunk({ x: 6, y: 7 }, { hasRoad: true, danger: 2, terrain: 'meadow' });
  check('chests deterministic', JSON.stringify(a) === JSON.stringify(b));
}
// Bandit stash appears on dangerous road chunks (seed-gated, but some chunk has one).
{
  let found: LockedChest | null = null;
  for (let x = 0; x < 12 && !found; x++) for (let y = 0; y < 12 && !found; y++) {
    const c = chestsForChunk({ x, y }, { hasRoad: true, danger: 2, terrain: 'meadow' });
    const stash = c.find((ch) => ch.label === "Bandit's stash");
    if (stash) found = stash;
  }
  check('bandit stash exists on some road chunk', found !== null);
  if (found) {
    check('stash id encodes chunk', found.id === found.chunk.x + ',' + found.chunk.y + ':0');
    check('stash has coins', (found.loot.coins || 0) > 0);
    check('stash position in field bounds', found.position.x >= 0 && found.position.x <= 140 && found.position.y >= 0 && found.position.y <= 140);
  }
}
// No stash on safe chunks or roadless chunks.
{
  const safe = chestsForChunk({ x: 4, y: 7 }, { hasRoad: true, danger: 0, terrain: 'meadow' });
  check('no stash on safe chunk', safe.filter((c) => c.label === "Bandit's stash").length === 0);
  const noRoad = chestsForChunk({ x: 9, y: 9 }, { hasRoad: false, danger: 3, terrain: 'meadow' });
  check('no stash without road', noRoad.filter((c) => c.label === "Bandit's stash").length === 0);
}
// Stone coffer in deep rocky wilderness.
{
  let found: LockedChest | null = null;
  for (let x = 0; x < 12 && !found; x++) for (let y = 0; y < 12 && !found; y++) {
    const c = chestsForChunk({ x, y }, { hasRoad: false, danger: 2, terrain: 'rock' });
    const coffer = c.find((ch) => ch.label === 'Old stone coffer');
    if (coffer) found = coffer;
  }
  check('stone coffer exists in rocky wilds', found !== null);
  const meadow = chestsForChunk({ x: 3, y: 3 }, { hasRoad: false, danger: 3, terrain: 'meadow' });
  check('no coffer in meadow', meadow.filter((c) => c.label === 'Old stone coffer').length === 0);
}
// Attempt resolution is a flat chance.
{
  check('success chance is 0.65', LOCKPICK_SUCCESS_CHANCE === 0.65);
  check('roll below chance succeeds', attemptLockpick(0.0) === true && attemptLockpick(0.649) === true);
  check('roll above chance fails', attemptLockpick(0.65) === false && attemptLockpick(0.99) === false);
}
// Serialization round-trip + tolerance.
{
  const ids = ['4,7:0', '9,2:1'];
  check('serialize round-trip', JSON.stringify(parseOpenedChests(serializeOpenedChests(ids))) === JSON.stringify(ids));
  check('parse undefined -> []', parseOpenedChests(undefined).length === 0);
  check('parse corrupt -> []', parseOpenedChests('not json').length === 0);
  check('parse filters non-strings', parseOpenedChests('[1,"a",null]').length === 1);
}

console.log(`\nlockpicking: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
