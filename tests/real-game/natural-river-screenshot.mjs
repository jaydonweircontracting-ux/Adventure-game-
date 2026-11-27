import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

try {
  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForSelector('[data-testid="button-confirm-rpg-character"]', { state: 'visible', timeout: 15000 });
  await page.click('[data-testid="button-confirm-rpg-character"]');
  await page.waitForTimeout(700);
  await page.click('button[aria-label="Open graphics options"]');
  await page.getByRole('button', { name: '3D Experimental' }).click();
  await page.waitForFunction(
    () => typeof window.__ag3dTest?.findRiverViewSpot === 'function',
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(700);

  const spot = await page.evaluate(() => window.__ag3dTest.findRiverViewSpot());
  if (!spot) throw new Error('No walkable bank beside a generated river was found');
  if (spot.length < 12) throw new Error(`Selected river is too short for a useful visual: ${spot.length} tiles`);

  await page.evaluate(({ bank, flow }) => {
    const test = window.__ag3dTest;
    test.setFirstPerson(false);
    test.setPlayer(bank.x, bank.y);
    test.setYaw(Math.atan2(-flow.dx, -flow.dy) + 0.45);
    test.setPitch(1.05);
    test.setZoom(13);
  }, spot);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/real-game/natural-river-screenshot.png' });

  if (pageErrors.length) throw new Error('Browser errors: ' + pageErrors.join(' | '));
  console.log(`Natural river screenshot captured: ${spot.riverId}, ${spot.length} centreline tiles, water neighbours ${spot.waterNeighbors}, bend ${spot.bend}, bank ${spot.bank.x},${spot.bank.y}`);
} finally {
  await browser.close();
}
