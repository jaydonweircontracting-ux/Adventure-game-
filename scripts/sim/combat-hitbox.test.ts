// Combat hitbox regression tests.
// Run with: npx tsx scripts/sim/combat-hitbox.test.ts
import { isInMeleeArc, PLAYER_MELEE_REACH } from '../../src/game/combat';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) passed++;
  else { failed++; console.error('FAIL: ' + name); }
}

const attacker = { x: 10, y: 10 };
check('melee reach is intentionally close-range', PLAYER_MELEE_REACH <= 1.5);
check('target touching sprite in front can be hit', isInMeleeArc(attacker, { x: 13, y: 10 }, 'right'));
check('target several steps away cannot be hit', !isInMeleeArc(attacker, { x: 16, y: 10 }, 'right'));
check('target well off weapon lane cannot be hit', !isInMeleeArc(attacker, { x: 12, y: 14 }, 'right'));
check('target behind player cannot be hit', !isInMeleeArc(attacker, { x: 7, y: 10 }, 'right'));
check('left-facing attack hits target in front', isInMeleeArc(attacker, { x: 7, y: 10 }, 'left'));

console.log('combat-hitbox: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
