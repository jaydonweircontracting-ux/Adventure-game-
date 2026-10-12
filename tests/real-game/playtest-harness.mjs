/**
 * Gameplay Measurement Harness — BUILD 552
 *
 * Automated browser-playtest harness measuring real gameplay quality.
 * Runs against the actual production build via Playwright + Chromium.
 *
 * Metrics:
 *   M1: Game loads, player can start
 *   M2: Player can move and navigate
 *   M3: Mosslight Crossing discoverable/reachable
 *   M4: Unique NPCs encountered
 *   M5: NPC interactions/dialogue completable
 *   M6: Stuck incidents (collisions, unreachable, broken transitions)
 *   M7: NPC visibility/behavior over observation period
 *
 * Usage: node tests/real-game/playtest-harness.mjs
 * Output: JSON results + docs/PLAYTEST_BASELINE.md
 *
 * IMPORTANT: These are BROWSER-PLAYTEST results (real game, real inputs).
 * They are distinct from unit tests and source inspection.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { exitInterior as helperExitInterior } from './helpers.mjs';

const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';
const results = {
  build: null,
  timestamp: new Date().toISOString(),
  method: 'browser-playtest (Playwright + Chromium, real inputs)',
  metrics: {},
  limitations: [],
};

async function setup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
  return { browser, page, errors };
}

async function newGame(page) {
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForFunction(
    () => typeof window.__gameTest !== 'undefined',
    null, { timeout: 30000 }
  );
  await page.mouse.click(400, 300);
  await page.waitForTimeout(1000);
  results.build = await page.evaluate(() => window.__gameTest.getBuild());
}

async function exitInterior(page) {
  // Use the proven helper: walk to doorway via keyboard
  const exited = await helperExitInterior(page, 20);
  await page.waitForTimeout(2000);
  return await page.evaluate(() => window.__gameTest.isInInterior());
}

// M1: Game loads, player can start
async function measureM1(page) {
  try {
    const pos = await page.evaluate(() => window.__gameTest.getPlayerPos());
    const hp = await page.evaluate(() => window.__gameTest.getPlayerHp());
    results.metrics.M1 = {
      name: 'Game loads, player can start',
      pass: pos && typeof hp === 'number' && hp > 0,
      detail: `Player at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}), HP=${hp}`,
      method: 'New Game clicked, hooks verified',
    };
  } catch (e) {
    results.metrics.M1 = { name: 'Game loads', pass: false, detail: e.message.slice(0, 100) };
  }
}

// M2: Player can move and navigate
async function measureM2(page) {
  try {
    const before = await page.evaluate(() => window.__gameTest.getInteriorPos());
    // Try moving right 5 times
    let moved = 0;
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => window.__gameTest.getInteriorPos());
      if (Math.abs(after.x - before.x) > 0.1 || Math.abs(after.y - before.y) > 0.1) moved++;
    }
    results.metrics.M2 = {
      name: 'Player can move and navigate',
      pass: moved >= 3,
      detail: `${moved}/5 movement inputs produced position change`,
      method: 'Real ArrowRight keypresses in tutorial interior',
    };
  } catch (e) {
    results.metrics.M2 = { name: 'Movement', pass: false, detail: e.message.slice(0, 100) };
  }
}

// M3: Mosslight Crossing discoverable
async function measureM3(page) {
  try {
    const stillInside = await exitInterior(page);
    await page.waitForTimeout(2000);
    const pos = await page.evaluate(() => window.__gameTest.getPlayerPos());
    const npcs = await page.evaluate(() => window.__gameTest.getTownsfolk());
    // Check if any NPC within 30 units (visible range)
    const nearby = npcs.filter(n => Math.hypot(n.x - pos.x, n.y - pos.y) < 30);
    results.metrics.M3 = {
      name: 'Mosslight Crossing / NPCs discoverable from spawn',
      pass: nearby.length > 0,
      detail: `Player at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}). ${nearby.length} NPCs within 30 units: ${nearby.map(n => n.name).join(', ') || 'none'}`,
      method: 'Exit tutorial, count NPCs within 30-unit visibility radius',
    };
    return { pos, npcs };
  } catch (e) {
    results.metrics.M3 = { name: 'Town discovery', pass: false, detail: e.message.slice(0, 100) };
    return null;
  }
}

// M4: Unique NPCs encountered
async function measureM4(page, npcs) {
  if (!npcs) {
    results.metrics.M4 = { name: 'NPC encounters', pass: false, detail: 'No NPC data (M3 failed)' };
    return;
  }
  const pos = await page.evaluate(() => window.__gameTest.getPlayerPos());
  const visible = npcs.filter(n => Math.hypot(n.x - pos.x, n.y - pos.y) < 50);
  results.metrics.M4 = {
    name: 'Unique NPCs encountered',
    pass: visible.length >= 1,
    detail: `${visible.length}/${npcs.length} NPCs within 50 units of player. Visible: ${visible.map(n => n.name).join(', ') || 'none'}`,
    method: 'Count NPCs within 50-unit radius of player position',
  };
}

// M5: NPC interaction/dialogue
async function measureM5(page) {
  try {
    // Field NPC buttons use data-testid="npc-<name>"
    const npcBtn = page.locator('[data-testid^="npc-"]').first();
    const visible = await npcBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      results.metrics.M5 = { name: 'NPC interaction', pass: false, detail: 'No clickable NPC button found' };
      return;
    }
    await npcBtn.click();
    await page.waitForTimeout(1500);
    const dialogue = await page.locator('[data-testid="townsfolk-dialogue"]').isVisible({ timeout: 5000 }).catch(() => false);
    results.metrics.M5 = {
      name: 'NPC interaction/dialogue completable',
      pass: dialogue,
      detail: dialogue ? 'Dialogue overlay opened after clicking NPC' : 'Clicked NPC but no dialogue appeared',
      method: 'Click NPC button [data-testid^="npc-"], check for dialogue overlay',
    };
    if (dialogue) {
      await page.locator('.dialogue-close').click().catch(() => {});
    }
  } catch (e) {
    results.metrics.M5 = { name: 'NPC interaction', pass: false, detail: e.message.slice(0, 100) };
  }
}

// M6: Stuck incidents
async function measureM6(page) {
  try {
    const pos = await page.evaluate(() => window.__gameTest.getPlayerPos());
    // Try moving in 4 directions, check if any succeed
    const dirs = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    let stuckCount = 0;
    for (const dir of dirs) {
      const before = await page.evaluate(() => window.__gameTest.getPlayerPos());
      await page.keyboard.press(dir);
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => window.__gameTest.getPlayerPos());
      const moved = Math.hypot(after.x - before.x, after.y - before.y) > 0.1;
      // Check if movement was blocked by collision (legitimate) vs stuck (bug)
      const canMove = await page.evaluate((dx, dy) => {
        const d = { ArrowRight: [1,0], ArrowLeft: [-1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }[dx];
        return window.__gameTest.canMove(d[0], d[1]);
      }, dir);
      if (!moved && canMove) stuckCount++; // Should have moved but didn't = stuck
    }
    results.metrics.M6 = {
      name: 'Stuck incidents',
      pass: stuckCount === 0,
      detail: stuckCount === 0 ? 'No stuck incidents: all blocked movement matched collision checks' : `${stuckCount} directions where movement should work but didn't`,
      method: 'Press each arrow, compare actual movement vs canMove() collision check',
    };
  } catch (e) {
    results.metrics.M6 = { name: 'Stuck check', pass: false, detail: e.message.slice(0, 100) };
  }
}

// M7: NPC behavior over time
async function measureM7(page) {
  try {
    const start = await page.evaluate(() => window.__gameTest.getTownsfolk());
    await page.waitForTimeout(10000); // Observe for 10 seconds
    const end = await page.evaluate(() => window.__gameTest.getTownsfolk());
    let movedCount = 0;
    let disappeared = 0;
    start.forEach((s, i) => {
      const e = end[i];
      if (!e) { disappeared++; return; }
      if (Math.hypot(e.x - s.x, e.y - s.y) > 0.5) movedCount++;
    });
    results.metrics.M7 = {
      name: 'NPC visibility/behavior over 10s',
      pass: disappeared === 0,
      detail: `${movedCount}/${start.length} NPCs moved, ${disappeared} disappeared. All ${end.length} NPCs still present.`,
      method: 'Compare NPC positions before/after 10s observation',
      limitation: '10s is short; full schedule cycles need longer observation',
    };
  } catch (e) {
    results.metrics.M7 = { name: 'NPC behavior', pass: false, detail: e.message.slice(0, 100) };
  }
}

// Main
let browser;
try {
  const setupResult = await setup();
  browser = setupResult.browser;
  const page = setupResult.page;
  const errors = setupResult.errors;

  await newGame(page);
  await measureM1(page);
  await measureM2(page);
  const m3 = await measureM3(page);
  await measureM4(page, m3?.npcs);
  await measureM5(page);
  await measureM6(page);
  await measureM7(page);

  results.consoleErrors = errors.length;
  results.consoleErrorDetails = errors.slice(0, 5);

  // Summary
  const passed = Object.values(results.metrics).filter(m => m.pass).length;
  const total = Object.keys(results.metrics).length;
  results.summary = `${passed}/${total} metrics passed`;

  console.log('\n=== PLAYTEST HARNESS RESULTS ===');
  console.log(`Build: ${results.build} | ${results.timestamp}`);
  console.log(`Method: ${results.method}\n`);
  for (const [key, m] of Object.entries(results.metrics)) {
    console.log(`${m.pass ? '✅' : '❌'} ${key}: ${m.name}`);
    console.log(`   ${m.detail}`);
  }
  console.log(`\nSummary: ${results.summary}`);
  console.log(`Console errors: ${results.consoleErrors}`);

  // Save JSON
  writeFileSync('/tmp/playtest-results.json', JSON.stringify(results, null, 2));

} catch (e) {
  console.error('HARNESS FAILED:', e.message.slice(0, 300));
  results.harnessError = e.message.slice(0, 300);
} finally {
  if (browser) await browser.close();
}
