/**
 * Autonomous Gameplay Agent — BUILD 558
 *
 * A deterministic agent that plays the actual game through real inputs.
 * Can: explore, discover NPCs, navigate toward targets, talk to NPCs,
 * detect loops/stuck/dead-ends, and record everything.
 *
 * Uses only:
 *  - Real keyboard input (no teleport for navigation)
 *  - Real canvas taps (for NPC interaction)
 *  - Test hooks for OBSERVATION only (getPlayerPos, getTownsfolk, canMove)
 *  - teleportPlayer ONLY for fixture setup, never counted as navigation
 *
 * Decision-making is deterministic and bounded. No AI calls.
 */
import { chromium } from 'playwright';
import { exitInterior } from './helpers.mjs';

const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';

export class GameplayAgent {
  constructor(page) {
    this.page = page;
    this.log = [];
    this.visited = new Set();
    this.npcsMet = new Set();
    this.stuckCount = 0;
    this.actions = 0;
    this.maxActions = 200;
  }

  record(event, detail = '') {
    const entry = `[${this.actions}] ${event}${detail ? ': ' + detail : ''}`;
    this.log.push(entry);
  }

  async observe() {
    return await this.page.evaluate(() => ({
      pos: window.__gameTest.getPlayerPos(),
      npcs: window.__gameTest.getTownsfolk(),
      inInterior: window.__gameTest.isInInterior(),
    }));
  }

  async canMove(dx, dy) {
    return await this.page.evaluate(([x, y]) => window.__gameTest.canMove(x, y), [dx, dy]);
  }

  // Move one step in a direction using real keyboard input
  async step(dir) {
    const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    const deltas = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = deltas[dir];

    if (!(await this.canMove(dx, dy))) return false;

    const before = (await this.observe()).pos;
    await this.page.keyboard.down(keys[dir]);
    await this.page.waitForTimeout(400);
    await this.page.keyboard.up(keys[dir]);
    await this.page.waitForTimeout(100);

    const after = (await this.observe()).pos;
    const moved = Math.hypot(after.x - before.x, after.y - before.y) > 0.1;
    this.actions++;
    return moved;
  }

  // Navigate toward a target using greedy steering with wall avoidance
  // Returns true if reached within tolerance, false if stuck or max steps
  async navigateTo(tx, ty, tolerance = 3, maxSteps = 50) {
    this.record('navigate_start', `target=(${tx},${ty})`);
    let stuckSteps = 0;
    let lastPos = null;

    for (let i = 0; i < maxSteps; i++) {
      const { pos } = await this.observe();
      const dist = Math.hypot(pos.x - tx, pos.y - ty);
      if (dist < tolerance) {
        this.record('navigate_reached', `dist=${dist.toFixed(1)}`);
        return true;
      }

      // Loop detection: same position 3x = stuck
      const key = `${pos.x.toFixed(0)},${pos.y.toFixed(0)}`;
      this.visited.add(key);
      if (lastPos === key) {
        stuckSteps++;
        if (stuckSteps >= 3) {
          this.record('navigate_stuck', `at (${pos.x.toFixed(0)},${pos.y.toFixed(0)})`);
          this.stuckCount++;
          return false;
        }
      } else {
        stuckSteps = 0;
      }
      lastPos = key;

      // Greedy: pick direction that reduces distance and is walkable
      const dirs = [
        { dir: 'right', dx: 1, dy: 0 },
        { dir: 'left', dx: -1, dy: 0 },
        { dir: 'down', dx: 0, dy: 1 },
        { dir: 'up', dx: 0, dy: -1 },
      ];
      // Sort by which reduces distance most
      dirs.sort((a, b) => {
        const da = Math.hypot(pos.x + a.dx - tx, pos.y + a.dy - ty);
        const db = Math.hypot(pos.x + b.dx - tx, pos.y + b.dy - ty);
        return da - db;
      });

      let moved = false;
      for (const { dir, dx, dy } of dirs) {
        if (await this.canMove(dx, dy)) {
          moved = await this.step(dir);
          if (moved) break;
        }
      }
      if (!moved) {
        this.record('navigate_blocked', `at (${pos.x.toFixed(0)},${pos.y.toFixed(0)})`);
        this.stuckCount++;
        return false;
      }

      if (this.actions >= this.maxActions) {
        this.record('navigate_budget_exceeded');
        return false;
      }
    }
    this.record('navigate_max_steps');
    return false;
  }

  // Talk to nearest NPC via canvas tap (uses harness projection logic)
  async talkToNearest(maxDist = 15) {
    const { pos, npcs } = await this.observe();
    let best = null, bestD = maxDist;
    for (const n of npcs) {
      const d = Math.hypot(n.x - pos.x, n.y - pos.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (!best) {
      this.record('talk_no_npc_in_range');
      return null;
    }

    // Compute screen pos via iso projection
    const pxIso = (pos.x - pos.y) * 32;
    const pyIso = (pos.x + pos.y) * 16;
    const nxIso = (best.x - best.y) * 32;
    const nyIso = (best.x + best.y) * 16;
    const canvasBox = await this.page.locator('canvas').first().boundingBox();
    if (!canvasBox) return null;

    const sx = canvasBox.x + (nxIso - pxIso) + canvasBox.width / 2;
    const sy = canvasBox.y + (nyIso - pyIso) + canvasBox.height / 2 - 24;

    await this.page.mouse.click(sx, sy);
    await this.page.waitForTimeout(1200);
    this.actions++;

    const dlgOpen = await this.page.locator('[data-testid="townsfolk-dialogue"]').isVisible({ timeout: 3000 }).catch(() => false);
    if (dlgOpen) {
      const name = await this.page.locator('#townsfolk-dialogue-title').textContent().catch(() => '?');
      this.npcsMet.add(name.trim());
      this.record('talk_success', name.trim());
      // Close dialogue
      await this.page.locator('.dialogue-close').click().catch(() => {});
      await this.page.waitForTimeout(500);
      return name.trim();
    }
    this.record('talk_failed', best.name);
    return null;
  }

  getReport() {
    return {
      actions: this.actions,
      uniquePositions: this.visited.size,
      npcsMet: [...this.npcsMet],
      stuckCount: this.stuckCount,
      log: this.log.slice(-20), // last 20 events
    };
  }
}

// Standalone runner: only when executed directly, not on import
const isMain = process.argv[1]?.endsWith('agent.mjs');
if (isMain) {
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 100)));

    await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
    await page.click('[data-testid="button-new-game"]');
    await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
    await page.mouse.click(400, 300);
    await page.waitForTimeout(1000);

    const agent = new GameplayAgent(page);
    console.log('Agent starting...');

    // Exit interior
    await exitInterior(page, 20);
    await page.waitForTimeout(2000);
    agent.record('exited_interior');

    // Find Bryn (should be near spawn at ~(98,118))
    const { npcs } = await agent.observe();
    const bryn = npcs.find(n => n.name === 'Bryn');
    if (bryn) {
      console.log(`Found Bryn at (${bryn.x.toFixed(0)}, ${bryn.y.toFixed(0)})`);
      const reached = await agent.navigateTo(bryn.x, bryn.y, 12, 40);
      console.log(`Navigation to Bryn: ${reached ? 'REACHED' : 'FAILED'}`);
      if (reached) {
        const talked = await agent.talkToNearest(15);
        console.log(`Talk to Bryn: ${talked ? 'SUCCESS (' + talked + ')' : 'FAILED'}`);
      }
    } else {
      console.log('Bryn not found in NPC list!');
    }

    const report = agent.getReport();
    console.log('\n=== AGENT REPORT ===');
    console.log(`Actions: ${report.actions}`);
    console.log(`Unique positions visited: ${report.uniquePositions}`);
    console.log(`NPCs met: ${report.npcsMet.join(', ') || 'none'}`);
    console.log(`Stuck incidents: ${report.stuckCount}`);
    console.log('\nRecent log:');
    report.log.forEach(l => console.log('  ' + l));

  } catch (e) {
    console.error('AGENT FAILED:', e.message.slice(0, 200));
  } finally {
    if (browser) await browser.close();
  }
}
