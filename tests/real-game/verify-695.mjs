/**
 * BUILD 695 verification: storybook town content — market square, angel
 * statue, hedge garden, sandy streets, lamps.
 * Run: node tests/real-game/verify-695.mjs (server on :8901 required)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:8901/?testmode=1';
const SHOT = '/tmp/verify-695';
mkdirSync(SHOT, { recursive: true });
const pageErrors = [];
const consoleErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => pageErrors.push(e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

const T = (expr) => page.evaluate(new Function('return (' + expr + ')'));
const sleep = (ms) => page.waitForTimeout(ms);

async function boot() {
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
  console.log('chunk:', JSON.stringify(await T(`window.__gameTest.getChunk()`)));
  console.log('build:', await T(`window.__gameTest.getBuild()`));
}

await boot();

// 1. Market square: stand south of the plaza, statue + stall rows in view.
await T(`window.__gameTest.teleportPlayer(144, 168)`);
await sleep(2500);
await page.screenshot({ path: `${SHOT}/market-square.png` });
console.log('saved market-square.png');

// 2. Hedge garden: stand south of the garden center (175,90).
await T(`window.__gameTest.teleportPlayer(175, 112)`);
await sleep(2500);
await page.screenshot({ path: `${SHOT}/hedge-garden.png` });
console.log('saved hedge-garden.png');

// 3. Sandy streets: town center wide view.
await T(`window.__gameTest.teleportPlayer(144, 144)`);
await sleep(2500);
await page.screenshot({ path: `${SHOT}/sandy-streets.png` });
console.log('saved sandy-streets.png');

// 4. Arterial lamps: stand by road-0 west stretch.
await T(`window.__gameTest.teleportPlayer(100, 152)`);
await sleep(2500);
await page.screenshot({ path: `${SHOT}/arterial-lamps.png` });
console.log('saved arterial-lamps.png');

// 5. Zoomed-out: sandy mask overview (click zoom-out HUD 3x).
await T(`window.__gameTest.teleportPlayer(144, 144)`);
await sleep(1000);
for (let i = 0; i < 3; i++) {
  const btn = await page.$('[data-testid="button-zoom-out-hud"]');
  if (btn) await btn.click(); else break;
  await sleep(800);
}
await page.screenshot({ path: `${SHOT}/town-overview.png` });
console.log('saved town-overview.png');

// 6. Frame-time sample (perf sanity).
const ft = await T(`new Promise(res => {
  const ts = []; let last = performance.now(); let n = 0;
  function f(t) { ts.push(t - last); last = t; if (++n < 120) requestAnimationFrame(f); else res(ts); }
  requestAnimationFrame(f);
})`);
ft.sort((a, b) => a - b);
console.log(`frame ms: p50=${ft[60].toFixed(1)} p95=${ft[114].toFixed(1)} max=${ft[119].toFixed(1)}`);

console.log('PAGE ERRORS:', pageErrors.length ? pageErrors.slice(0, 5) : 'none');
console.log('CONSOLE ERRORS:', consoleErrors.length ? consoleErrors.slice(0, 5) : 'none');
await browser.close();
