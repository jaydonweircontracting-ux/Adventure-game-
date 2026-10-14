// BUILD 690 verification: engine town visuals, buildings list, touch fix, perf.
// Run: node tests/real-game/verify-690.mjs (server on :8901)
import { chromium } from 'playwright';

const SHOT = '/tmp/verify-690';
const { mkdirSync } = await import('fs');
mkdirSync(SHOT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const T = (expr) => page.evaluate(expr);

let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('[PAGEERROR]', e.message); });

await page.goto('http://localhost:8901/?testmode=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.click('text=New Game');
await page.waitForTimeout(4000);

console.log('build =', await T(`window.__gameTest.getBuild()`));

// Exit tutorial house by walking (like ground-truth)
const buildings0 = await T(`window.__gameTest.getBuildings()`);
console.log('buildings at start:', buildings0.length, buildings0.slice(0, 3).map(b => b.id).join(','));
const door = buildings0.find(b => b.id === 'tutorial-house-door');
console.log('tutorial door:', door ? JSON.stringify({ x: door.x, y: door.y }) : 'NOT FOUND');
// Walk south out the door
for (let i = 0; i < 30; i++) {
  if (!(await T(`window.__gameTest.isInInterior()`))) break;
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowDown');
}
console.log('exited interior:', !(await T(`window.__gameTest.isInInterior()`)));
await page.waitForTimeout(1000);
await page.screenshot({ path: `${SHOT}/690-town-field.png` });

// Buildings list: should include 18 pinned + 8 filler
const buildings = await T(`window.__gameTest.getBuildings()`);
console.log('total buildings:', buildings.length);
const filler = buildings.filter(b => /building-(1[89]|2[0-5])$/.test(b.id));
console.log('filler buildings found:', filler.length);
for (const f of filler.slice(0, 3)) {
  console.log('  filler:', f.id, JSON.stringify({ x: Math.round(f.x), y: Math.round(f.y) }));
}

// Check touch-action on canvas (iPhone fix)
const touchAction = await T(`getComputedStyle(document.querySelector('canvas')).touchAction`);
console.log('canvas touch-action:', touchAction);

// Perf: frame times while in town
const perf = await T(`new Promise((res) => {
  const times = [];
  let last = performance.now();
  let frames = 0;
  const tick = () => {
    const now = performance.now();
    times.push(now - last);
    last = now;
    if (++frames < 120) requestAnimationFrame(tick);
    else {
      times.sort((a, b) => a - b);
      res({ p50: times[60].toFixed(1), p95: times[114].toFixed(1), max: times[119].toFixed(1) });
    }
  };
  requestAnimationFrame(tick);
})`);
console.log('frame times ms:', JSON.stringify(perf));
console.log('page errors:', errors);

await browser.close();
console.log('DONE');
