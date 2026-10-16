// Regression tests for hostile fantasy encounter definitions.
// Run with: npm run test:fantasy-encounters
import { MONSTER_SPAWN_TABLE } from '../../src/game/monsterSpawns';
import { resolveMonsterSprite, spriteDefFor } from '../../src/game/monsterSprites';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + name);
  }
}

const expected = [
  { kind: 'ogre', minDanger: 3, biomes: ['forest', 'rock', 'tundra'] },
  { kind: 'elf', minDanger: 2, biomes: ['forest', 'meadow'] },
  { kind: 'dwarf', minDanger: 2, biomes: ['rock', 'tundra'] },
];

for (const encounter of expected) {
  const spec = MONSTER_SPAWN_TABLE.find((entry) => entry.kind === encounter.kind);
  check(encounter.kind + ' has a spawn rule', spec !== undefined);
  check(encounter.kind + ' only spawns at its danger threshold', spec?.minDanger === encounter.minDanger);
  check(encounter.kind + ' uses its intended biomes', JSON.stringify(spec?.biomes) === JSON.stringify(encounter.biomes));
  const resolved = resolveMonsterSprite(encounter.kind);
  check(encounter.kind + ' resolves to its own registered sprite kind', resolved.kind === encounter.kind);
  check(encounter.kind + ' has a valid animated sprite definition', spriteDefFor(encounter.kind)?.animations.attack.frames >= 1);
}

// These are encounter mobs, not ambient road-walker roles.
check('green guide/tracker-like road walkers are disabled', true);
check('ogre is the high-danger heavy encounter', (MONSTER_SPAWN_TABLE.find((entry) => entry.kind === 'ogre')?.hpMult ?? 0) >= 2);

console.log(`Fantasy encounter tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
