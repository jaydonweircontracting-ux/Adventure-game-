/**
 * Shared Playwright test helpers
 *
 * Eliminates duplicated setup code across real-game tests.
 * Before: each test had 15+ lines of identical setup.
 * After: one function call.
 *
 * BUILD 537: Initial version (self-improvement cycle).
 */
import { chromium } from 'playwright';

export const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';

/**
 * Launch browser, load game, click New Game, wait for test hooks.
 * Returns { browser, page }.
 */
export async function setupGame() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.setDefaultTimeout(20000);
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text().slice(0, 200)}`); });

  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
  try {
    await page.waitForSelector('[data-testid="button-new-game"]', { state: 'visible', timeout: 20000 });
  } catch (error) {
    await page.screenshot({ path: 'tests/real-game/startup-failure.png', fullPage: true }).catch(() => {});
    const state = await page.evaluate(() => ({ title: document.title, url: location.href, body: document.body.innerText.slice(0, 1200), button: !!document.querySelector('[data-testid="button-new-game"]'), ready: document.readyState })).catch(() => null);
    throw new Error(`Game title screen did not become visible; state=${JSON.stringify(state)}; browserErrors=${errors.join(' | ').slice(0, 1200)}; cause=${error.message.slice(0, 180)}`);
  }
  await page.click('[data-testid="button-new-game"]');
  // New Game opens the character creator; confirm it to enter the live world.
  await page.waitForSelector('[data-testid="button-confirm-rpg-character"]', { state: 'visible', timeout: 15000 });
  await page.click('[data-testid="button-confirm-rpg-character"]');
  await page.waitForFunction(
    () => typeof window.__gameTest !== 'undefined',
    null, { timeout: 30000 }
  );
  await page.mouse.click(400, 300); // ensure focus
  await page.waitForTimeout(1000);

  return { browser, page, errors };
}

/**
 * Create a new page in an existing browser (for test runner reuse).
 * Much faster than launching a new browser per test (~3s saved each).
 * BUILD 544: Browser reuse optimization.
 */
export async function createTestPage(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)));

  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForSelector('[data-testid="button-confirm-rpg-character"]', { state: 'visible', timeout: 15000 });
  await page.click('[data-testid="button-confirm-rpg-character"]');
  await page.waitForFunction(
    () => typeof window.__gameTest !== 'undefined',
    null, { timeout: 30000 }
  );
  await page.mouse.click(400, 300);
  await page.waitForTimeout(1000);

  return { page, errors };
}

/**
 * Exit the tutorial house interior via the doorway.
 * Returns true if successfully exited.
 */
export async function exitInterior(page, maxSteps = 15) {
  for (let i = 0; i < maxSteps; i++) {
    if (!(await page.evaluate(() => window.__gameTest.isInInterior()))) return true;
    const p = await page.evaluate(() => window.__gameTest.getInteriorPos());
    // Steer toward doorway x=50, then down
    let key = 'ArrowDown';
    if (Math.abs(p.x - 50) > 3) {
      key = p.x < 50 ? 'ArrowRight' : 'ArrowLeft';
    }
    await page.keyboard.down(key);
    await page.waitForTimeout(700);
    await page.keyboard.up(key);
  }
  return !(await page.evaluate(() => window.__gameTest.isInInterior()));
}

/**
 * Get player position (interior or field, whichever applies).
 */
export const getPos = (page) => page.evaluate(() => {
  const t = window.__gameTest;
  return t.isInInterior() ? t.getInteriorPos() : t.getPlayerPos();
});

/**
 * Check if player can move by (dx, dy) using real game logic.
 */
export const canMove = (page, dx, dy) =>
  page.evaluate(([dx, dy]) => window.__gameTest.canMove(dx, dy), [dx, dy]);

/**
 * Simple test result tracker.
 */
export function makeChecker() {
  const results = { passed: 0, failed: 0 };
  const check = (name, condition, detail = '') => {
    const s = condition ? 'PASS' : 'FAIL';
    if (condition) results.passed++; else results.failed++;
    console.log(`[${s}] ${name}${detail ? ' — ' + detail : ''}`);
  };
  return { results, check };
}
