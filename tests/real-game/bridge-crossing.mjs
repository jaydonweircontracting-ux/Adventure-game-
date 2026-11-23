/**
 * BUILD 1124 — phone-sized real-game bridge traversal probe.
 * Creates a controlled two-tile river in unused wilderness through the
 * test-only hook, places the real bridge + bank paths, then walks the
 * player across it using the production WASD movement pathway.
 */
import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';
const results = { passed: 0, failed: 0 };
const pageErrors = [];
function check(name, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (condition) results.passed++; else results.failed++;
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
page.on('pageerror', error => {
  pageErrors.push(error.message);
  console.log('PAGEERROR:', error.message.slice(0, 180));
});

try {
  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForSelector('[data-testid="button-confirm-rpg-character"]', { state: 'visible', timeout: 15000 });
  await page.click('[data-testid="button-confirm-rpg-character"]');
  await page.waitForTimeout(700);

  // The production default remains 2.5D. Enter the separate 3D world
  // through the same Options control a player uses on an iPhone.
  await page.click('button[aria-label="Open graphics options"]');
  await page.getByRole('button', { name: '3D Experimental' }).click();
  await page.waitForFunction(
    () => typeof window.__ag3dTest?.createBridgeCrossingForTest === 'function',
    null,
    { timeout: 30000 },
  );
  await page.mouse.click(195, 422);
  await page.waitForTimeout(500);

  const crossing = await page.evaluate(() => window.__ag3dTest.createBridgeCrossingForTest());
  check('Generated a complete two-tile bridge fixture', !!crossing,
    crossing ? `style=${crossing.style}, axis=${crossing.axis}, span=${crossing.span.length}` : 'no safe unused wilderness crossing found');
  if (crossing) {
    const bridgeTiles = await page.evaluate(() => window.__ag3dTest.getPlacements()
      .filter(item => item.kind === 'bridge')
      .map(item => ({ x: item.x0, y: item.y0, style: item.bridgeStyle, axis: item.bridgeAxis })));
    const allTilesPlaced = crossing.span.every(tile =>
      bridgeTiles.some(placed => placed.x === tile.x && placed.y === tile.y &&
        placed.style === crossing.style && placed.axis === crossing.axis));
    check('Every river tile has the correct saved bridge profile', allTilesPlaced,
      `expected ${crossing.span.map(t => t.x + ',' + t.y).join(' | ')}`);

    await page.evaluate(({ near }) => {
      window.__ag3dTest.setPlayer(near.x, near.y);
      window.__ag3dTest.clearMoveTarget();
    }, crossing);
    await page.waitForTimeout(350);
    const start = await page.evaluate(() => window.__ag3dTest.getPlayer());
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyD');
    const end = await page.evaluate(() => window.__ag3dTest.getPlayer());
    check('Player walks across the generated bridge to the far bank',
      end.x >= crossing.far.x - 0.2,
      `x ${start.x.toFixed(2)} → ${end.x.toFixed(2)}, far bank x=${crossing.far.x}`);
  }
  check('390×844 mobile viewport', page.viewportSize().width === 390 && page.viewportSize().height === 844);
  check('Zero browser page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (error) {
  check('Bridge crossing probe completed', false, String(error?.message || error).slice(0, 220));
}

await page.screenshot({ path: 'tests/real-game/bridge-crossing-screenshot.png' });
await browser.close();
console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exit(results.failed > 0 ? 1 : 0);
