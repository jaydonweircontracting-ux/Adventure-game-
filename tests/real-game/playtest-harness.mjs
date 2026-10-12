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
    // Ensure canvas has focus for keyboard input
    await page.mouse.click(400, 300);
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => window.__gameTest.getInteriorPos());
    // Try moving right 5 times (using down/wait/up like proven movement.mjs)
    let moved = 0;
    let lastPos = before;
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(700);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => window.__gameTest.getInteriorPos());
      if (Math.abs(after.x - lastPos.x) > 0.1 || Math.abs(after.y - lastPos.y) > 0.1) moved++;
      lastPos = after;
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

// M5: NPC interaction/dialogue via iso canvas tap
// Uses the game's actual projection math (see IsoFieldView.tsx onTap).
// Camera centers on player; NPC screen pos computed from world coords.
async function measureM5(page) {
  try {
    const data = await page.evaluate(() => {
      const t = window.__gameTest;
      const player = t.getPlayerPos();
      const npcs = t.getTownsfolk();
      // Find closest NPC within 30 units
      let best = null, bestD = 30;
      for (const n of npcs) {
        const d = Math.hypot(n.x - player.x, n.y - player.y);
        if (d < bestD) { bestD = d; best = n; }
      }
      return { player, npc: best };
    });

    if (!data.npc) {
      results.metrics.M5 = { name: 'NPC interaction', pass: false, detail: 'No NPC within 30 units', method: 'iso canvas tap' };
      return;
    }

    // Compute screen position using game's projection (TILE_W=64, TILE_H=32)
    // isoToScreen: x=(tx-ty)*32, y=(tx+ty)*16
    const pxIso = (data.player.x - data.player.y) * 32;
    const pyIso = (data.player.x + data.player.y) * 16;
    const nxIso = (data.npc.x - data.npc.y) * 32;
    const nyIso = (data.npc.x + data.npc.y) * 16;

    // Get canvas size
    const canvasBox = await page.locator('canvas').first().boundingBox();
    if (!canvasBox) {
      results.metrics.M5 = { name: 'NPC interaction', pass: false, detail: 'No canvas found' };
      return;
    }

    // Screen pos: (npcIso - camIso) * zoom + canvasCenter - 24 (sprite center)
    // Camera ≈ player iso position, zoom = 1 (default)
    const sx = canvasBox.x + (nxIso - pxIso) * 1 + canvasBox.width / 2;
    const sy = canvasBox.y + (nyIso - pyIso) * 1 + canvasBox.height / 2 - 24;

    // Tap at computed position
    await page.mouse.click(sx, sy);
    await page.waitForTimeout(1500);

    const dialogue = await page.locator('[data-testid="townsfolk-dialogue"]').isVisible({ timeout: 5000 }).catch(() => false);
    // Also check dialogue contains the NPC name
    let correctNpc = false;
    if (dialogue) {
      const title = await page.locator('#townsfolk-dialogue-title').textContent().catch(() => '');
      correctNpc = title.includes(data.npc.name);
    }

    results.metrics.M5 = {
      name: 'NPC interaction/dialogue via canvas tap',
      pass: dialogue && correctNpc,
      detail: dialogue
        ? (correctNpc ? `Tapped ${data.npc.name}, dialogue opened with correct NPC` : `Dialogue opened but wrong NPC (expected ${data.npc.name})`)
        : `Tapped at (${sx.toFixed(0)}, ${sy.toFixed(0)}) for ${data.npc.name} but no dialogue`,
      method: 'Compute NPC screen pos via iso projection, mouse.click, verify dialogue',
    };
    if (dialogue) {
      await page.locator('.dialogue-close').click().catch(() => {});
    }
  } catch (e) {
    results.metrics.M5 = { name: 'NPC interaction', pass: false, detail: e.message.slice(0, 120) };
  }
}

// M6: Stuck incidents — distinguish genuine stuck from legitimate blocking
// A player is STUCK only if: canMove says YES for a direction, but sustained
// attempts in that direction produce zero movement. Being blocked by a wall
// (canMove=false) is correct behavior, not a bug.
async function measureM6(page) {
  try {
    // Settle: ensure dialogue is closed and keyboard has focus.
    // Do NOT click mouse here — that would set a tap-move target.
    const dlgOpen = await page.locator('[data-testid="townsfolk-dialogue"]').isVisible().catch(() => false);
    if (dlgOpen) {
      await page.locator('.dialogue-close').click().catch(() => {});
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1000);

    const dirs = [
      { key: 'ArrowUp', dx: 0, dy: -1 },
      { key: 'ArrowDown', dx: 0, dy: 1 },
      { key: 'ArrowLeft', dx: -1, dy: 0 },
      { key: 'ArrowRight', dx: 1, dy: 0 },
    ];
    const stuckDirs = [];
    const blockedDirs = [];

    for (const { key, dx, dy } of dirs) {
      // Check if game says this direction is walkable
      const canMove = await page.evaluate(([x, y]) => window.__gameTest.canMove(x, y), [dx, dy]);
      if (!canMove) {
        blockedDirs.push(key);
        continue; // Legitimately blocked — not stuck
      }
      // Try 3 sustained attempts (using down/wait/up like proven movement.mjs)
      let totalMove = 0;
      for (let i = 0; i < 3; i++) {
        const before = await page.evaluate(() => window.__gameTest.getPlayerPos());
        await page.keyboard.down(key);
        await page.waitForTimeout(700);
        await page.keyboard.up(key);
        await page.waitForTimeout(200);
        const after = await page.evaluate(() => window.__gameTest.getPlayerPos());
        totalMove += Math.hypot(after.x - before.x, after.y - before.y);
      }
      if (totalMove < 0.1) {
        stuckDirs.push(key); // canMove=true but zero movement = genuinely stuck
      }
    }

    results.metrics.M6 = {
      name: 'Stuck incidents (genuine)',
      pass: stuckDirs.length === 0,
      detail: stuckDirs.length === 0
        ? `No stuck incidents. ${blockedDirs.length} directions legitimately blocked by collision.`
        : `STUCK in directions: ${stuckDirs.join(', ')} (canMove=true but no movement)`,
      method: 'For each walkable direction: 3x sustained keypress, measure total displacement',
    };
  } catch (e) {
    results.metrics.M6 = { name: 'Stuck check', pass: false, detail: e.message.slice(0, 120) };
  }
}

// M7: NPC behavior and schedule transitions over observation period
// Tracks: position changes, activity changes (schedule transitions),
// disappearances. Longer observation than BUILD 552 (30s vs 10s).
async function measureM7(page) {
  try {
    const start = await page.evaluate(() => window.__gameTest.getTownsfolk());
    await page.waitForTimeout(30000); // 30s observation
    const end = await page.evaluate(() => window.__gameTest.getTownsfolk());

    let movedCount = 0;
    let activityChanged = 0;
    let disappeared = 0;
    const transitions = [];

    start.forEach((s, i) => {
      const e = end.find(x => x.name === s.name);
      if (!e) { disappeared++; return; }
      if (Math.hypot(e.x - s.x, e.y - s.y) > 0.5) movedCount++;
      if (e.activity !== s.activity) {
        activityChanged++;
        transitions.push(`${s.name}: ${s.activity} → ${e.activity}`);
      }
    });

    results.metrics.M7 = {
      name: 'NPC behavior/schedule over 30s',
      pass: disappeared === 0,
      detail: `${movedCount}/${start.length} moved, ${activityChanged} changed activity, ${disappeared} disappeared. ` +
        (transitions.length > 0 ? `Transitions: ${transitions.slice(0, 3).join('; ')}` : 'No activity transitions in 30s (expected — schedules change over hours)'),
      method: 'Compare NPC positions + activities before/after 30s browser observation',
      limitation: '30s cannot capture full day schedules. Use sim-lab for deterministic multi-day simulation (marked as simulation, not browser-playtest).',
    };
  } catch (e) {
    results.metrics.M7 = { name: 'NPC behavior', pass: false, detail: e.message.slice(0, 120) };
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
