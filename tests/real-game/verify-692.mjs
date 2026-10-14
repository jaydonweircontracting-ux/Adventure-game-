/**
 * BUILD 692 verification: textured dirt paths + new filler house art + alignment.
 * Run: node tests/real-game/verify-692.mjs (server on :8901 required)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:8901/?testmode=1';
const SHOT = '/tmp/verify-692';
mkdirSync(SHOT, { recursive: true });
const pageErrors = [];

// Filler doors from the engine (chunk 4,7 local coords).
const FILLERS = [
  { variant: 'brick-shop', door: { x: 33.4, y: 187.1 } },
  { variant: 'green-shop', door: { x: 72.7, y: 169.0 } },
  { variant: 'green-shop', door: { x: 181.1, y: 146.0 } },
  { variant: 'brick-shop', door: { x: 198.1, y: 144.7 } },
  { variant: 'brick-shop', door: { x: 237.2, y: 112.2 } },
  { variant: 'brick-shop', door: { x: 252.9, y: 106.6 } },
  { variant: 'brick-shop', door: { x: 267.8, y: 102.3 } },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => pageErrors.push(e.message.slice(0, 200)));

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

// 1. Paths overview from town center.
await T(`window.__gameTest.teleportPlayer(140, 140)`);
await sleep(1500);
await page.screenshot({ path: `${SHOT}/paths-overview.png` });
console.log('saved paths-overview.png');

// 2. Screenshot each filler variant (teleport south of the door, look north).
const seen = new Set();
for (let i = 0; i < FILLERS.length; i++) {
  const f = FILLERS[i];
  // Stand 8u south of the door so the building + path are in view.
  await T(`window.__gameTest.teleportPlayer(${f.door.x}, ${f.door.y + 8})`);
  await sleep(1200);
  const key = `filler-${i}-${f.variant}`;
  await page.screenshot({ path: `${SHOT}/${key}.png` });
  console.log(`saved ${key}.png (door at ${f.door.x},${f.door.y})`);
  seen.add(f.variant);
}
console.log('variants seen:', [...seen].join(', '));

// 3. Door/exit round-trip on 2 filler houses.
// Walk north into the door trigger, then exit.
async function doorRoundTrip(idx) {
  const f = FILLERS[idx];
  await T(`window.__gameTest.teleportPlayer(${f.door.x}, ${f.door.y + 6})`);
  await sleep(1000);
  // Walk north in steps until the door trigger fires (robust vs timing).
  let inInterior = false;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down('ArrowUp'); await sleep(400); await page.keyboard.up('ArrowUp');
    inInterior = await T(`window.__gameTest.isInInterior()`);
    if (inInterior) break;
  }
  console.log(`filler ${idx} (${f.variant}): entered interior = ${inInterior}`);
  if (!inInterior) return false;
  await sleep(500);
  await page.screenshot({ path: `${SHOT}/filler-${idx}-interior.png` });
  // Exit: walk to the exit (south side of interior).
  for (let i = 0; i < 20; i++) {
    if (!(await T(`window.__gameTest.isInInterior()`))) break;
    await page.keyboard.down('ArrowDown'); await sleep(400); await page.keyboard.up('ArrowDown');
  }
  const exited = !(await T(`window.__gameTest.isInInterior()`));
  console.log(`filler ${idx}: exited = ${exited}`);
  if (exited) {
    const pos = await T(`window.__gameTest.getPlayerPos()`);
    console.log(`filler ${idx}: exit pos (${pos.x.toFixed(1)},${pos.y.toFixed(1)}) vs door (${f.door.x},${f.door.y})`);
    await sleep(800);
    await page.screenshot({ path: `${SHOT}/filler-${idx}-exited.png` });
  }
  return exited;
}

const rt0 = await doorRoundTrip(0);
const rt1 = await doorRoundTrip(1);
console.log('round-trips:', rt0 && rt1 ? 'BOTH OK' : 'FAILED');

// 4. Frame times.
await T(`window.__gameTest.teleportPlayer(140, 140)`);
await sleep(1000);
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

console.log('page errors:', pageErrors.length ? pageErrors : 'none');
await browser.close();
console.log('DONE');
