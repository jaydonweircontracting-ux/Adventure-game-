// BUILD 284: NPC combat AI — common-sense aggro, flee, wielded-gear drops.
// Run with: npx tsx scripts/sim/npc-combat.test.ts
import {
  updateGoat,
  gearForMonster,
  bonesForMonster,
  GOAT_FLEE_HP_RATIO,
  GOAT_OUTMATCHED_LEVEL_GAP,
  type GoatAIEntity,
} from '../../src/game/ai';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + name); }
}

function makeAggressive(overrides: Partial<GoatAIEntity> = {}): GoatAIEntity {
  return {
    position: { x: 50, y: 50 },
    facing: 'down',
    state: 'idle',
    disposition: 'aggressive',
    hp: 100,
    maxHp: 100,
    attackCooldown: 0,
    attackTimer: 0,
    attackHitApplied: false,
    hurtTimer: 0,
    moving: false,
    attacking: false,
    level: 2,
    ...overrides,
  };
}
const playerNear = { x: 55, y: 50 }; // 5 units away: inside chase range

// 1. Matched fight: monster near its own level chases the player.
{
  const g = makeAggressive({ level: 3, threatLevel: 3 });
  const r = updateGoat(g, playerNear, 'left', [g], 500);
  check('matched monster chases', r.goat.state === 'chase' && r.goat.moving);
}
// 2. Outmatched and unprovoked: holds still instead of suiciding.
{
  const g = makeAggressive({ level: 2, threatLevel: 2 + GOAT_OUTMATCHED_LEVEL_GAP + 1 });
  const r = updateGoat(g, playerNear, 'left', [g], 500);
  check('outmatched unprovoked monster idles', r.goat.state === 'idle' && !r.goat.moving && !r.attackHit);
}
// 3. Boundary: exactly at the gap still fights.
{
  const g = makeAggressive({ level: 2, threatLevel: 2 + GOAT_OUTMATCHED_LEVEL_GAP });
  const r = updateGoat(g, playerNear, 'left', [g], 500);
  check('monster at gap boundary still chases', r.goat.state === 'chase');
}
// 4. Provoked outmatched monster fights back (or flees if weak) — no suicide-idle.
{
  const g = makeAggressive({ level: 2, threatLevel: 20, provoked: true });
  const r = updateGoat(g, playerNear, 'left', [g], 500);
  check('provoked outmatched monster engages', r.goat.state === 'chase' || r.goat.state === 'attack');
}
// 5. Low HP flees even when provoked and outmatched.
{
  const g = makeAggressive({ level: 2, threatLevel: 20, provoked: true, hp: Math.floor(100 * GOAT_FLEE_HP_RATIO) });
  const before = { ...g.position };
  const r = updateGoat(g, playerNear, 'left', [g], 1000);
  const distBefore = Math.hypot(before.x - playerNear.x, before.y - playerNear.y);
  const distAfter = Math.hypot(r.goat.position.x - playerNear.x, r.goat.position.y - playerNear.y);
  check('low-hp monster moves away from player', distAfter > distBefore && r.goat.moving);
}
// 6. Dead stays dead.
{
  const g = makeAggressive({ hp: 0 });
  const r = updateGoat(g, playerNear, 'left', [g], 500);
  check('dead monster stays defeated', r.goat.disposition === 'defeated' && r.goat.state === 'die');
}
// 7. Calm creatures ignore the player regardless of threat.
{
  const g = makeAggressive({ disposition: 'calm', level: 1, threatLevel: 50 });
  const r = updateGoat(g, playerNear, 'left', [g], 500);
  check('calm creature idles', r.goat.state === 'idle');
}
// 8. No threat info: legacy behavior (chases) preserved.
{
  const g = makeAggressive({ level: 1 });
  const r = updateGoat(g, playerNear, 'left', [g], 500);
  check('no threatLevel still chases (back-compat)', r.goat.state === 'chase');
}

// --- Wielded gear drops (RuneScape-style: drop everything carried) ---
check('bandit archer wields a bow', JSON.stringify(gearForMonster('bandit', 'default', true)) === JSON.stringify({ bow: 1 }));
check('goblin archer wields a bow', JSON.stringify(gearForMonster('goblin', 'default', true)) === JSON.stringify({ bow: 1 }));
check('orc archer wields a bow', JSON.stringify(gearForMonster('orc', 'default', true)) === JSON.stringify({ bow: 1 }));
check('melee bandit wields daggers', JSON.stringify(gearForMonster('bandit', 'default', false)) === JSON.stringify({ daggers: 1 }));
check('soldier wields daggers', JSON.stringify(gearForMonster('soldier', 'default', false)) === JSON.stringify({ daggers: 1 }));
check('goblin warrior wields daggers', JSON.stringify(gearForMonster('goblin', 'warrior', false)) === JSON.stringify({ daggers: 1 }));
check('goblin shaman wields nothing', Object.keys(gearForMonster('goblin', 'shaman', false)).length === 0);
check('skeleton warrior wields daggers', JSON.stringify(gearForMonster('skeleton', 'warrior', false)) === JSON.stringify({ daggers: 1 }));
check('wolf wields nothing', Object.keys(gearForMonster('wolf', 'default', false)).length === 0);
check('troll wields nothing', Object.keys(gearForMonster('troll', 'default', false)).length === 0);

// --- Bones for humanoids ---
for (const kind of ['goblin', 'bandit', 'soldier', 'orc', 'skeleton', 'troll']) {
  check(kind + ' drops bones', bonesForMonster(kind).bone === 1);
}
for (const kind of ['wolf', 'spider', 'rat', 'slime', 'bat', 'snake', 'dragon']) {
  check(kind + ' drops no bones', bonesForMonster(kind).bone === undefined);
}

console.log(`\nnpc-combat: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
