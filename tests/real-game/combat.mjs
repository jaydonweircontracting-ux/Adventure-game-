/**
 * Real-Game Combat Test (Level 5 — Automated Gameplay Test)
 *
 * Tests actual combat via real gameplay: walks to a chunk with enemies,
 * attacks with Space key, verifies enemy HP decreases through the real
 * combat system.
 *
 * This exercises the REAL combat pathway (attackGoat → damage → death).
 * Not a mock. Not a simulation.
 *
 * Requirements: same as smoke.mjs
 * Run: `node tests/real-game/combat.mjs`
 *
 * BUILD 535: Initial version.
 */
import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';
const results = { passed: 0, failed: 0 };
function check(name, condition, detail = '') {
  const s = condition ? 'PASS' : 'FAIL';
  if (condition) results.passed++; else results.failed++;
  console.log(`[${s}] ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 150)));

async function exitInterior() {
  for (let i = 0; i < 15; i++) {
    if (!(await page.evaluate(() => window.__gameTest.isInInterior()))) return true;
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(700);
    await page.keyboard.up('ArrowDown');
  }
  return !(await page.evaluate(() => window.__gameTest.isInInterior()));
}

try {
  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
  await page.mouse.click(400, 300);
  await page.waitForTimeout(1000);

  // Exit interior
  check('Exited interior', await exitInterior());

  // Walk east toward chunk (5,7) where goats spawn
  // Strategy: go east until blocked by cliff, then north to go around, repeat
  // Uses canMove() for full collision+cliff validation
  console.log('Navigating to chunk (5,7) — going around cliffs...');
  let goats = [];
  let chunk = await page.evaluate(() => window.__gameTest.getChunk());
  console.log(`  Start chunk: (${chunk.x}, ${chunk.y})`);

  const canMove = (dx, dy) => page.evaluate(([dx, dy]) => window.__gameTest.canMove(dx, dy), [dx, dy]);

  for (let leg = 0; leg < 8; leg++) {
    // Go east as far as possible
    for (let i = 0; i < 40; i++) {
      goats = await page.evaluate(() => window.__gameTest.getGoats());
      chunk = await page.evaluate(() => window.__gameTest.getChunk());
      if (goats.length > 0 || chunk.x !== 4) break;
      if (!(await canMove(3, 0))) break;
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowRight');
    }
    const p = await page.evaluate(() => window.__gameTest.getPlayerPos());
    console.log(`  Leg ${leg}: x=${p.x.toFixed(0)} y=${p.y.toFixed(0)} chunk=(${chunk.x},${chunk.y}) goats=${goats.length}`);
    if (goats.length > 0 || chunk.x !== 4) break;

    // Go north to get around the cliff
    for (let i = 0; i < 15; i++) {
      if (!(await canMove(0, -3))) break;
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowUp');
    }
  }

  check('Found enemies', goats.length > 0, `${goats.length} goats`);
  if (goats.length === 0) {
    console.log('No enemies found — cannot test combat');
    await browser.close();
    process.exit(1);
  }

  // Approach the nearest goat
  const goat = goats[0];
  console.log(`  Target: ${goat.id} at (${goat.x.toFixed(1)}, ${goat.y.toFixed(1)}) hp=${goat.hp}`);
  const startHp = goat.hp;

  // Approach the nearest goat (attack range is 5 units, get within 4)
  // Goats may be far — be patient, navigate around cliffs
  console.log('Approaching nearest goat...');
  const canMove2 = (dx, dy) => page.evaluate(([dx, dy]) => window.__gameTest.canMove(dx, dy), [dx, dy]);
  for (let i = 0; i < 200; i++) {
    const p = await page.evaluate(() => window.__gameTest.getPlayerPos());
    const gl = await page.evaluate(() => window.__gameTest.getGoats());
    if (gl.length === 0) break;
    let nearest = gl[0], nd = Infinity;
    for (const goat of gl) {
      const d = Math.hypot(goat.x - p.x, goat.y - p.y);
      if (d < nd) { nd = d; nearest = goat; }
    }
    if (nd < 4) {
      console.log(`  In range: dist=${nd.toFixed(1)} to goat ${nearest.id}`);
      break;
    }
    if (i % 20 === 0) console.log(`  Step ${i}: dist=${nd.toFixed(0)}`);
    const dx = nearest.x - p.x, dy = nearest.y - p.y;
    const dirs = [];
    if (Math.abs(dx) > 1) dirs.push([dx > 0 ? 'ArrowRight' : 'ArrowLeft', Math.sign(dx) * 3, 0]);
    if (Math.abs(dy) > 1) dirs.push([dy > 0 ? 'ArrowDown' : 'ArrowUp', 0, Math.sign(dy) * 3]);
    let moved = false;
    for (const [key, mdx, mdy] of dirs) {
      if (await canMove2(mdx, mdy)) {
        await page.keyboard.down(key);
        await page.waitForTimeout(400);
        await page.keyboard.up(key);
        moved = true;
        break;
      }
    }
    if (!moved) {
      const perp = Math.abs(dx) > Math.abs(dy) ? ['ArrowUp', 0, -3] : ['ArrowRight', 3, 0];
      if (await canMove2(perp[1], perp[2])) {
        await page.keyboard.down(perp[0]);
        await page.waitForTimeout(400);
        await page.keyboard.up(perp[0]);
      }
    }
  }

  // Snapshot all goats before attack
  const beforeGoats = await page.evaluate(() => window.__gameTest.getGoats().map(g => ({id: String(g.id), hp: g.hp})));
  console.log('Before attack:', beforeGoats.map(g => `${g.id}:${g.hp}`).join(', '));

  // Attack with Space (real input)
  console.log('Attacking with Space...');
  await page.keyboard.press('Space');
  await page.waitForTimeout(2000); // wait for attack animation + damage

  const afterGoats = await page.evaluate(() => window.__gameTest.getGoats().map(g => ({id: String(g.id), hp: g.hp})));
  console.log('After attack:', afterGoats.map(g => `${g.id}:${g.hp}`).join(', '));

  // Check if ANY goat took damage
  let damaged = false, damageDetail = '';
  for (const b of beforeGoats) {
    const a = afterGoats.find(x => x.id === b.id);
    if (a && a.hp < b.hp) {
      damaged = true;
      damageDetail = `goat ${b.id}: ${b.hp} → ${a.hp}`;
      break;
    }
  }
  check('Enemy took damage', damaged, damageDetail || 'no HP decrease detected');

} catch (e) {
  check('Test completed', false, e.message.slice(0, 200));
}

await page.screenshot({ path: 'tests/real-game/combat-screenshot.png' });
await browser.close();
console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exit(results.failed > 0 ? 1 : 0);
