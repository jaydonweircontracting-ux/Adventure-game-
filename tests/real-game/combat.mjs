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

  // Face the goat: tap ArrowRight briefly (goat is 3 units east)
  // The attack only hits if the target is in the facing arc.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(300);

  // Attack until the goat dies (40 HP, ~9 dmg/hit = ~5 hits)
  // Wait for cooldown between attacks
  console.log('Attacking until goat dies...');
  let killed = false;
  for (let hit = 0; hit < 10; hit++) {
    // Face east toward goat (attack requires target in facing arc)
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.up('ArrowRight');

    await page.keyboard.press('Space');
    await page.waitForTimeout(800); // attack animation + cooldown

    const current = await page.evaluate((id) => {
      const g = window.__gameTest.getGoats().find(x => String(x.id) === String(id));
      return g ? { hp: g.hp, disposition: g.disposition, state: g.state } : null;
    }, goatId);

    if (!current) {
      console.log(`  Hit ${hit + 1}: goat defeated (removed from list)`);
      killed = true;
      break;
    }
    console.log(`  Hit ${hit + 1}: hp=${current.hp} disposition=${current.disposition}`);
    if (current.disposition === 'defeated' || current.hp <= 0) {
      killed = true;
      break;
    }
  }

  check('Enemy killed', killed, killed ? 'goat defeated' : 'survived 10 hits');

  // Verify death state is consistent
  const finalState = await page.evaluate((id) => {
    const g = window.__gameTest.getGoats().find(x => String(x.id) === String(id));
    return g ? { hp: g.hp, disposition: g.disposition } : null;
  }, goatId);
  check('Death state consistent',
    finalState === null || finalState.disposition === 'defeated' || finalState.hp <= 0,
    finalState ? `hp=${finalState.hp}, disp=${finalState.disposition}` : 'removed');

  // PRIORITY 1 (BUILD 540): Verify loot drops
  const drops = await page.evaluate(() => window.__gameTest.getDroppedLoot());
  console.log(`  Dropped loot: ${drops.length} items`);
  check('Loot dropped on kill', drops.length > 0,
    drops.length ? `drop id=${drops[0].id} loot=${JSON.stringify(drops[0].loot)}` : 'no drops');

  // Try to pick up the loot (walk to it and click pickup button)
  if (drops.length > 0) {
    const drop = drops[0];
    console.log(`  Drop at (${drop.x.toFixed(1)}, ${drop.y.toFixed(1)})`);

    // Walk toward the drop (button appears within 16 units)
    for (let i = 0; i < 30; i++) {
      const p = await page.evaluate(() => window.__gameTest.getPlayerPos());
      const d = Math.hypot(drop.x - p.x, drop.y - p.y);
      console.log(`    Walk ${i}: player at (${p.x.toFixed(1)},${p.y.toFixed(1)}) dist=${d.toFixed(1)}`);
      if (d < 12) break;
      const dx = drop.x - p.x, dy = drop.y - p.y;
      const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
      await page.keyboard.down(key);
      await page.waitForTimeout(300);
      await page.keyboard.up(key);
    }

    // Click the pickup button if visible
    const pickupBtn = `[data-testid="button-pickup-loot-${drop.id}"]`;
    const btnCount = await page.locator(pickupBtn).count();
    console.log(`    Pickup button in DOM: ${btnCount}`);
    if (btnCount > 0) {
      // Scroll into view and click via JS (bypasses viewport issues)
      await page.evaluate((sel) => {
        const btn = document.querySelector(sel);
        if (btn) btn.click();
      }, pickupBtn);
      await page.waitForTimeout(500);
      const afterDrops = await page.evaluate(() => window.__gameTest.getDroppedLoot());
      const stillThere = afterDrops.some(d => String(d.id) === String(drop.id));
      check('Loot picked up', !stillThere, stillThere ? 'drop still present' : 'drop removed');
    } else {
      check('Loot picked up', false, 'pickup button not in DOM');
    }
  }

  // Cleanup (if goat survived)
  if (finalState) {
    const removed = await page.evaluate((id) => window.__gameTest.removeTestGoat(id), goatId);
    check('Fixture cleanup', removed);
  } else {
    check('Fixture cleanup', true, 'goat removed by death');
  }

} catch (e) {
  check('Test completed', false, e.message.slice(0, 200));
}

if (page) await page.screenshot({ path: 'tests/real-game/combat-screenshot.png' });
if (browser) await browser.close();

console.log(`\n${results.passed} passed, ${results.failed} failed`);
console.log('Note: fixture-assisted test — setup uses spawnTestGoat, combat uses production code.');
process.exit(results.failed > 0 ? 1 : 0);
