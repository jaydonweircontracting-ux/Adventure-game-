/**
 * BUILD 695 diagnostics: framing checks for market/statue/garden/sand.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:8901/?testmode=1';
const SHOT = '/tmp/verify-695';
mkdirSync(SHOT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const T = (expr) => page.evaluate(new Function('return (' + expr + ')'));
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
await page.click('[data-testid="button-new-game"]');
await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
await page.mouse.click(640, 400);
await sleep(2000);
for (let i = 0; i < 30; i++) {
  if (!(await T(`window.__gameTest.isInInterior()`))) break;
  const p = await T(`window.__gameTest.getInteriorPos()`);
  const key = Math.abs(p.x - 50) > 4 ? (p.x < 50 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowDown';
  await page.keyboard.down(key); await sleep(400); await page.keyboard.up(key);
}

// Statue close-up: stand 6u south of plaza center.
await T(`window.__gameTest.teleportPlayer(144, 150)`);
await sleep(2500);
console.log('player:', JSON.stringify(await T(`window.__gameTest.getPlayerPos()`)));
await page.screenshot({ path: `${SHOT}/statue-close.png` });
console.log('saved statue-close.png');

// Market overview: zoom out 1 level from south of plaza.
await T(`window.__gameTest.teleportPlayer(144, 172)`);
await sleep(1500);
{
  const btn = await page.$('[data-testid="button-zoom-out-hud"]');
  if (btn) { await btn.click(); await sleep(1000); console.log('zoomed out 1'); }
  else console.log('NO zoom-out button found');
}
await page.screenshot({ path: `${SHOT}/market-wide.png` });
console.log('saved market-wide.png');

// Hedge garden close: stand at garden south entrance.
await T(`window.__gameTest.teleportPlayer(175, 106)`);
await sleep(2500);
await page.screenshot({ path: `${SHOT}/garden-close.png` });
console.log('saved garden-close.png');

await browser.close();
