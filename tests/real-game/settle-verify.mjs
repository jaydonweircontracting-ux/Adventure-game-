/** BUILD 683 verification: settlement decor renders at gameplay scale. */
import { setupGame } from './helpers.mjs';

let browser, page;
try {
  ({ browser, page } = await setupGame());
  const btn = page.locator('button', { hasText: 'Exit' }).first();
  await btn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);

  // West hamlet: center (34,152), plaza r 12.2, well at center.
  await page.evaluate(() => window.__gameTest.teleportPlayer(34, 152));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/b683-west.png' });

  // North hamlet: center (158,48).
  await page.evaluate(() => window.__gameTest.teleportPlayer(158, 48));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/b683-north.png' });

  // NPC positions — should now be in 280-space near the hamlets.
  const folk = await page.evaluate(() => window.__gameTest.getTownsfolk());
  console.log('NPCs:', folk.slice(0, 6).map(n => `${n.name}(${n.x.toFixed(0)},${n.y.toFixed(0)})`).join(' '));
  console.log('done');
} finally {
  await browser?.close();
}
