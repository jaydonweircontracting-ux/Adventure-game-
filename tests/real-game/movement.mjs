/**
 * Real-Game Movement Test (Level 5 — Automated Gameplay Test)
 *
 * Verifies actual player movement via real keyboard input in the running game.
 * Tests: interior movement, doorway exit, field movement.
 *
 * This exercises the REAL input pathway (window keydown → keysRef → movement).
 * Not a mock. Not a simulation.
 *
 * Requirements: same as smoke.mjs
 * Run: `node tests/real-game/movement.mjs`
 *
 * BUILD 534: Initial version.
 */
import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';
const results = { passed: 0, failed: 0 };
function check(name, condition, detail = '') {
  const s = condition ? 'PASS' : 'FAIL';
  if (condition) results.passed++; else results.failed++;
  console.log(`[${s}] ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 150)));

try {
  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
  await page.mouse.click(400, 300); // ensure focus
  await page.waitForTimeout(1000);

  const getPos = () => page.evaluate(() => {
    const t = window.__gameTest;
    return t.isInInterior() ? t.getInteriorPos() : t.getPlayerPos();
  });

  // 1. Interior movement
  const start = await getPos();
  check('Starts in interior',
    await page.evaluate(() => window.__gameTest.isInInterior()));

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowRight');
  const afterRight = await getPos();
  check('Interior movement (ArrowRight)',
    afterRight.x > start.x, `dx=${(afterRight.x - start.x).toFixed(2)}`);

  // 2. Walk to doorway and exit (doorway at x=50, y>91)
  console.log('Walking to doorway...');
  for (let i = 0; i < 12; i++) {
    if (!(await page.evaluate(() => window.__gameTest.isInInterior()))) break;
    // Steer toward x=50 first, then down
    const p = await page.evaluate(() => window.__gameTest.getInteriorPos());
    const key = Math.abs(p.x - 50) > 1 ? (p.x < 50 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowDown';
    await page.keyboard.down(key);
    await page.waitForTimeout(800);
    await page.keyboard.up(key);
  }
  const exited = !(await page.evaluate(() => window.__gameTest.isInInterior()));
  check('Exited interior via doorway', exited);

  // 3. Field movement
  if (exited) {
    const fieldStart = await page.evaluate(() => window.__gameTest.getPlayerPos());
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowRight');
    const fieldAfter = await page.evaluate(() => window.__gameTest.getPlayerPos());
    check('Field movement (ArrowRight)',
      fieldAfter.x > fieldStart.x,
      `(${fieldStart.x.toFixed(1)},${fieldStart.y.toFixed(1)}) → (${fieldAfter.x.toFixed(1)},${fieldAfter.y.toFixed(1)})`);
  }

} catch (e) {
  check('Test completed', false, e.message.slice(0, 200));
}

await page.screenshot({ path: 'tests/real-game/movement-screenshot.png' });
await browser.close();
console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exit(results.failed > 0 ? 1 : 0);
