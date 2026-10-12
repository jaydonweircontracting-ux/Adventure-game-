/**
 * Real-Game Combat Test (Level 5 — Automated Gameplay Test)
 *
 * Uses an isolated test fixture (spawnTestGoat) to create a real enemy
 * through the production combat system. The fixture is localhost-only
 * and the goat is a real GoatState entity — attacks, damage, death, and
 * loot all go through production code paths.
 *
 * This exercises the REAL combat pathway (attackGoat → damage → death).
 * Not a mock. Fixture-assisted setup, production combat.
 *
 * Requirements: same as smoke.mjs (localhost only for fixture)
 * Run: `node tests/real-game/combat.mjs`
 *
 * BUILD 538: Rewritten to use spawnTestGoat fixture.
 */
import { setupGame, exitInterior, makeChecker } from './helpers.mjs';

const { check, results } = makeChecker();
let browser, page;

try {
  ({ browser, page } = await setupGame());
  check('Game loaded', true);

  // Exit interior (combat disabled indoors)
  check('Exited interior', await exitInterior(page));

  // Spawn a test goat via fixture (localhost only)
  const goatId = await page.evaluate(() => {
    const t = window.__gameTest;
    return typeof t.spawnTestGoat === 'function' ? t.spawnTestGoat() : null;
  });
  check('Test fixture available', goatId !== null,
    goatId ? `goat id=${goatId}` : 'spawnTestGoat not available (not localhost?)');

  if (goatId === null) {
    throw new Error('Fixture unavailable — must run on localhost');
  }

  // Verify goat exists and is in range (3 units east)
  const goats = await page.evaluate(() => window.__gameTest.getGoats());
  const goat = goats.find(g => String(g.id) === String(goatId));
  check('Goat spawned', !!goat, goat ? `hp=${goat.hp}` : 'not found');

  const p = await page.evaluate(() => window.__gameTest.getPlayerPos());
  const dist = goat ? Math.hypot(goat.x - p.x, goat.y - p.y) : 999;
  check('Goat in melee range', dist <= 5, `dist=${dist.toFixed(1)}`);

  const startHp = goat.hp;

  // Attack with Space (real input pathway)
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const attacking = await page.evaluate(() => window.__gameTest.isAttacking());
  check('Attack triggered', attacking);

  // Wait for damage to apply
  await page.waitForTimeout(2000);

  const afterGoats = await page.evaluate(() => window.__gameTest.getGoats());
  const afterGoat = afterGoats.find(g => String(g.id) === String(goatId));

  if (afterGoat) {
    console.log(`  Goat HP: ${startHp} → ${afterGoat.hp}`);
    check('Enemy took damage', afterGoat.hp < startHp,
      `hp ${startHp} → ${afterGoat.hp}`);
  } else {
    // Goat is gone — might have died (check for loot/drops)
    check('Enemy defeated (removed)', true, 'goat no longer in list');
  }

  // Test cooldown: immediate second attack should be blocked
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const cooldown = await page.evaluate(() => window.__gameTest.getAttackCooldown());
  check('Attack cooldown enforced', cooldown > 0, `cooldown=${cooldown}ms`);

  // Cleanup
  const removed = await page.evaluate((id) => window.__gameTest.removeTestGoat(id), goatId);
  check('Fixture cleanup', removed);

} catch (e) {
  check('Test completed', false, e.message.slice(0, 200));
}

if (page) await page.screenshot({ path: 'tests/real-game/combat-screenshot.png' });
if (browser) await browser.close();

console.log(`\n${results.passed} passed, ${results.failed} failed`);
console.log('Note: fixture-assisted test — setup uses spawnTestGoat, combat uses production code.');
process.exit(results.failed > 0 ? 1 : 0);
