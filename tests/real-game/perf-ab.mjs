/** Quick frame-time A/B at the market: ?nodirt=1 vs default. */
import { chromium } from 'playwright';
const SHOT = process.argv[2] || '';
const URL = `http://localhost:8901/?testmode=1${SHOT}`;
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
await T(`window.__gameTest.teleportPlayer(144, 140)`);
await sleep(3000);
const stats = await T(`new Promise((resolve) => {
  const deltas = []; let last = performance.now(); let frames = 0;
  function tick() {
    const now = performance.now(); deltas.push(now - last); last = now; frames++;
    if (frames < 240) requestAnimationFrame(tick);
    else { deltas.sort((a,b)=>a-b); resolve({ p50: +deltas[120].toFixed(1), p95: +deltas[228].toFixed(1), max: +deltas[239].toFixed(1) }); }
  }
  requestAnimationFrame(tick);
})`);
console.log(`${SHOT || 'default'}:`, JSON.stringify(stats));
await browser.close();
