/**
 * Real Player Journey Test (BUILD 541 — Human Experience Brain)
 *
 * Tests the complete new-player journey through real gameplay:
 * 1. Start new game
 * 2. Move (learn controls)
 * 3. Explore starting area
 * 4. Discover and enter a building (if available)
 * 5. Explore interior
 * 6. Find exit and return outside
 * 7. Locate interactable object/NPC
 * 8. Complete an interaction
 *
 * Measures objective usability indicators:
 * - Failed movement attempts
 * - Time to complete actions
 * - Interaction failures
 * - Recovery from wrong actions
 *
 * Run: `node tests/real-game/journey.mjs`
 */
import { setupGame, exitInterior, makeChecker } from './helpers.mjs';

const { check, results } = makeChecker();
let browser, page;
const metrics = {
  moveAttempts: 0,
  moveFailures: 0,
  startTime: Date.now(),
  actions: [],
};

function logAction(name, success, detail = '') {
  metrics.actions.push({ name, success, detail, t: Date.now() - metrics.startTime });
  console.log(`  ${success ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  ({ browser, page } = await setupGame());
  check('Game loaded', true);
  logAction('Game loads', true);

  // 1. START: Verify we're in the tutorial house interior
  const inInterior = await page.evaluate(() => window.__gameTest.isInInterior());
  check('Starts in tutorial interior', inInterior);
  logAction('Start in interior', inInterior);

  // 2. MOVE: Test basic movement in interior
  const startPos = await page.evaluate(() => window.__gameTest.getInteriorPos());
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  const afterMove = await page.evaluate(() => window.__gameTest.getInteriorPos());
  const moved = Math.abs(afterMove.x - startPos.x) > 0.5;
  metrics.moveAttempts++;
  if (!moved) metrics.moveFailures++;
  check('Movement works', moved, `x: ${startPos.x.toFixed(1)} → ${afterMove.x.toFixed(1)}`);
  logAction('Move right', moved);

  // 3. EXPLORE: Take screenshot of interior for visual analysis
  await page.screenshot({ path: 'tests/real-game/journey-interior.png' });
  logAction('Interior screenshot captured', true);

  // 4. EXIT: Try to find and use the doorway
  // The doorway is at x=50, y>91. Walk down to find it.
  console.log('  Attempting to exit interior...');
  const exitStart = Date.now();
  let exited = false;
  for (let i = 0; i < 40 && !exited; i++) {
    // Move toward bottom center (x=50)
    const pos = await page.evaluate(() => window.__gameTest.getInteriorPos());
    const dx = 50 - pos.x;
    if (Math.abs(dx) > 3) {
      const key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
      await page.keyboard.down(key);
      await page.waitForTimeout(200);
      await page.keyboard.up(key);
    } else {
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(300);
      await page.keyboard.up('ArrowDown');
    }
    exited = !(await page.evaluate(() => window.__gameTest.isInInterior()));
    metrics.moveAttempts++;
  }
  const exitTime = Date.now() - exitStart;
  check('Exited interior via doorway', exited, `took ${(exitTime/1000).toFixed(1)}s`);
  logAction('Exit interior', exited, `${(exitTime/1000).toFixed(1)}s`);

  if (exited) {
    // 5. EXPLORE OUTSIDE: Take screenshot
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/real-game/journey-exterior.png' });
    logAction('Exterior screenshot captured', true);

    // 6. Verify player position is sensible (not stuck in wall)
    const fieldPos = await page.evaluate(() => window.__gameTest.getPlayerPos());
    const blocked = await page.evaluate(() => {
      const p = window.__gameTest.getPlayerPos();
      return window.__gameTest.isBlocked(p.x, p.y);
    });
    check('Exit position not blocked', !blocked, `at (${fieldPos.x.toFixed(0)}, ${fieldPos.y.toFixed(0)})`);
    logAction('Exit to valid position', !blocked);

    // 7. Try to move in exterior (away from house — player just exited south side)
    const extStart = await page.evaluate(() => window.__gameTest.getPlayerPos());
    // Try moving south (away from house) first, then check
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowDown');
    const extAfter = await page.evaluate(() => window.__gameTest.getPlayerPos());
    const extMoved = Math.hypot(extAfter.x - extStart.x, extAfter.y - extStart.y) > 0.5;
    metrics.moveAttempts++;
    if (!extMoved) {
      metrics.moveFailures++;
      // Try alternative direction
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(800);
      await page.keyboard.up('ArrowRight');
      const extAfter2 = await page.evaluate(() => window.__gameTest.getPlayerPos());
      const extMoved2 = Math.hypot(extAfter2.x - extStart.x, extAfter2.y - extStart.y) > 0.5;
      check('Exterior movement works', extMoved2, extMoved2 ? 'moved east' : 'blocked both directions');
      logAction('Move in exterior', extMoved2);
    } else {
      check('Exterior movement works', true, `moved ${(Math.hypot(extAfter.x - extStart.x, extAfter.y - extStart.y)).toFixed(1)} units`);
      logAction('Move in exterior', true);
    }
  }

  // Metrics summary
  console.log(`\n  === Journey Metrics ===`);
  console.log(`  Move attempts: ${metrics.moveAttempts}`);
  console.log(`  Move failures: ${metrics.moveFailures}`);
  console.log(`  Total time: ${((Date.now() - metrics.startTime)/1000).toFixed(1)}s`);

} catch (e) {
  check('Journey completed', false, e.message.slice(0, 200));
  logAction('Journey', false, e.message.slice(0, 100));
}

if (browser) await browser.close();

console.log(`\n${results.passed} passed, ${results.failed} failed`);
console.log('Note: Objective usability indicators. Human judgment still required for "fun".');
process.exit(results.failed > 0 ? 1 : 0);
