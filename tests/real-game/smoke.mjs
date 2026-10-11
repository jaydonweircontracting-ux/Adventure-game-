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
 * BUILD 534: Initial version. Verifies __gameTest hooks work.
 */
import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';

const results = { passed: 0, failed: 0, checks: [] };
function check(name, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  results.checks.push({ name, status, detail });
  if (condition) results.passed++; else results.failed++;
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('pageerror', e => errors.push(e.message.slice(0, 200)));

try {
  console.log('Loading:', GAME_URL);
  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
  check('Page loads', true);

  // Start new game (real user flow)
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  check('New Game button clickable', true);

  // Wait for test hooks
  await page.waitForFunction(
    () => typeof window.__gameTest !== 'undefined',
    null, { timeout: 30000 }
  );
  check('window.__gameTest exists', true);

  // Read real game state
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

  check('No fatal page errors', errors.length === 0,
    errors.length ? errors[0] : 'clean');

} catch (e) {
  check('Test completed without exception', false, e.message.slice(0, 200));
}

await page.screenshot({ path: 'tests/real-game/smoke-screenshot.png' });
await browser.close();

console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exit(results.failed > 0 ? 1 : 0);
