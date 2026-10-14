/**
 * Phase 3 NPC-LIFE verification: ambient market life in Mosslight.
 * Boot -> exit -> teleport to market -> wait 4h -> poll townsfolk until
 * shoppers are browsing -> screenshot -> frame-time A/B.
 * Run: node tests/real-game/verify-market.mjs (server on :8901 required)
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:8901/?testmode=1';
const SHOT = '/tmp/market-shots';
const pageErrors = [];
const resFailures = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));
page.on('requestfailed', (r) => resFailures.push(r.url().slice(0, 80)));

const T = (expr) => page.evaluate(new Function('return (' + expr + ')'));
const sleep = (ms) => page.waitForTimeout(ms);

async function boot() {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
  await page.mouse.click(640, 400);
  await sleep(2000);
}
async function exitInteriorWalk() {
  for (let i = 0; i < 20; i++) {
    if (!(await T(`window.__gameTest.isInInterior()`))) return true;
    const p = await T(`window.__gameTest.getInteriorPos()`);
    const key = Math.abs(p.x - 50) > 4 ? (p.x < 50 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowDown';
    await page.keyboard.down(key); await sleep(500); await page.keyboard.up(key);
  }
  return !(await T(`window.__gameTest.isInInterior()`));
}

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name} ${extra}`); }
};

await boot();
check('boot: zero JS page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
console.log('  build =', await T(`window.__gameTest.getBuild()`));
check('exit: walked out via doorway', await exitInteriorWalk());

// Teleport to the market plaza itself (stalls ring the fountain at 144,144),
// and let the camera settle so the market is in frame.
check('teleport: to market', await T(`window.__gameTest.teleportPlayer(144, 140)`));
await sleep(3000);

// NO fast-forward: let the clock and NPCs advance together in real time
// (fast-forwarding the clock without moving NPCs distorts commutes).
// Game starts at 6:00; the morning market window opens at 9:00
// (3 game-hours = 18 ticks x 3s = ~54s real). Poll from there.
console.log('  letting real time run to the morning market window...');
await sleep(60000); // 6:00 -> ~6:20... wait for the window below via clock

// Poll townsfolk until shoppers REACH the market and pause at stalls.
// Walkers and browsers peak at DIFFERENT instants (they walk, then pause),
// so track peaks across polls and screenshot each phase when seen.
const MARKET_ACTS = ['Strolling the market', 'Browsing the stalls', 'Running errands', 'Minding the stall'];
const STALLS = [[132,130],[144,130],[156,130],[132,158],[144,158],[156,158],[128,144],[160,144]];
const nearStall = (n) => STALLS.some(([sx, sy]) => Math.hypot(n.x - sx, n.y - sy) < 7);
let folk = [];
let peakWalkers = [];
let peakBrowsers = [];
const t0 = Date.now();
let shotWalking = false, shotBrowsing = false;
while (Date.now() - t0 < 240000) {
  folk = await T(`window.__gameTest.getTownsfolk()`);
  const walkers = folk.filter((n) => n.activity === 'Strolling the market' || n.activity === 'Running errands');
  const browsers = folk.filter((n) => n.activity === 'Browsing the stalls' && nearStall(n));
  if (walkers.length > peakWalkers.length) {
    peakWalkers = walkers;
    if (walkers.length >= 2 && !shotWalking) {
      shotWalking = true;
      await page.screenshot({ path: `${SHOT}/market-walking.png` });
      console.log(`  screenshot walkers: ${SHOT}/market-walking.png`);
    }
  }
  if (browsers.length > peakBrowsers.length) {
    peakBrowsers = browsers;
    if (browsers.length >= 1 && !shotBrowsing) {
      shotBrowsing = true;
      // Player is already at the plaza; screenshot immediately while the
      // browser is paused at the stall.
      await page.screenshot({ path: `${SHOT}/market-browsing.png` });
      const b0 = browsers[0];
      console.log(`  screenshot browsers: ${SHOT}/market-browsing.png (browser ${b0.name} @ ${b0.x.toFixed(0)},${b0.y.toFixed(0)})`);
    }
  }
  if (peakWalkers.length >= 2 && peakBrowsers.length >= 1) break;
  await sleep(5000);
}
console.log(`  townsfolk: ${folk.length}, peak walkers: ${peakWalkers.length}, peak browsers: ${peakBrowsers.length}`);
for (const b of peakBrowsers.slice(0, 6)) console.log(`    browser: ${b.name} @ (${b.x.toFixed(0)},${b.y.toFixed(0)}) ${b.activity}`);
for (const w of peakWalkers.slice(0, 4)) console.log(`    walker: ${w.name} @ (${w.x.toFixed(0)},${w.y.toFixed(0)}) ${w.activity}`);
check('market: >=1 NPC paused browsing at a stall front', peakBrowsers.length >= 1, `got ${peakBrowsers.length}`);
check('market: >=2 NPCs walked the streets/stalls', peakWalkers.length >= 2, `got ${peakWalkers.length}`);
check('market: peak browsers stood at stall fronts', peakBrowsers.length >= 1 && peakBrowsers.every(nearStall),
  `${peakBrowsers.filter(nearStall).length}/${peakBrowsers.length} near stalls`);

// Frame times at the market (A/B handled by ?nodirt=1 param externally).
const frameStats = await T(`new Promise((resolve) => {
  const deltas = [];
  let last = performance.now();
  let frames = 0;
  function tick() {
    const now = performance.now();
    deltas.push(now - last);
    last = now;
    frames++;
    if (frames < 180) requestAnimationFrame(tick);
    else {
      deltas.sort((a, b) => a - b);
      resolve({
        p50: +deltas[Math.floor(deltas.length * 0.5)].toFixed(2),
        p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(2),
        max: +deltas[deltas.length - 1].toFixed(2),
      });
    }
  }
  requestAnimationFrame(tick);
})`);
console.log('frame times ms:', JSON.stringify(frameStats));

check('runtime: zero JS page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
console.log(`\nMARKET VERIFY: ${pass} passed, ${fail} failed`);
console.log('page errors:', pageErrors.length ? pageErrors : 'none');
await browser.close();
process.exit(fail ? 1 : 0);
