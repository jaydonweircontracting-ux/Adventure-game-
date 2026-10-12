/**
 * Real-Game Smoke Test (Level 4 — Live Application Test)
 *
 * Opens the actual built game in a real browser (Playwright/Chromium),
 * starts a new game, and verifies the test hooks expose real game state.
 *
 * This is NOT a mock test. It exercises the real React application.
 *
 * Requirements:
 * - Playwright with Chromium installed: `npx playwright install chromium`
 * - Game built: `npm run build` (serves from dist/public)
 * - Local server: `python3 -m http.server 8901 --directory dist/public`
 *   (or set GAME_URL env var to test a deployed URL)
 *
 * Run: `node tests/real-game/smoke.mjs`
 *
 * BUILD 537: Refactored to use shared helpers (self-improvement).
 */
import { setupGame, makeChecker } from './helpers.mjs';

const { check, results } = makeChecker();
let browser, page;

try {
  ({ browser, page } = await setupGame());
  check('Page loads and game starts', true);

  const build = await page.evaluate(() => window.__gameTest.getBuild());
  check('Build readable', typeof build === 'string', `build=${build}`);

  const pos = await page.evaluate(() => window.__gameTest.getPlayerPos());
  check('Player position readable',
    typeof pos.x === 'number' && typeof pos.y === 'number',
    `pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);

  const hp = await page.evaluate(() => window.__gameTest.getPlayerHp());
  check('Player HP readable', typeof hp === 'number' && hp > 0, `hp=${hp}`);

  const inInterior = await page.evaluate(() => window.__gameTest.isInInterior());
  check('Interior state readable', typeof inInterior === 'boolean',
    `inInterior=${inInterior}`);

  const blocked = await page.evaluate(() => window.__gameTest.isBlocked(70, 70));
  check('Collision query works', typeof blocked === 'boolean',
    `isBlocked(70,70)=${blocked}`);

  const canMove = await page.evaluate(() => window.__gameTest.canMove(1, 0));
  check('Movement validation works', typeof canMove === 'boolean');

} catch (e) {
  check('Test completed without exception', false, e.message.slice(0, 200));
}

if (page) await page.screenshot({ path: 'tests/real-game/smoke-screenshot.png' });
if (browser) await browser.close();

console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exit(results.failed > 0 ? 1 : 0);
