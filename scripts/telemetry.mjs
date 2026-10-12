#!/usr/bin/env node
// Live Game Telemetry — Connects evaluator to actual gameplay events
// BUILD 577: Observes real game via test hooks

import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';

// Event history
const events = [];
let simMinutes = 0;

function recordEvent(type, details = {}) {
  events.push({
    simMinutes,
    type,
    ...details,
    timestamp: Date.now(),
  });
  // Keep last 1000 events
  if (events.length > 1000) events.shift();
}

function getSignals() {
  const discoveries = events.filter(e => e.type === 'discovery').length;
  const animalEncounters = events.filter(e => e.type === 'animal').length;
  const lastDiscovery = [...events].reverse().find(e => e.type === 'discovery');
  const timeSinceDiscovery = lastDiscovery ? simMinutes - lastDiscovery.simMinutes : simMinutes;

  let state = 'engaged';
  if (timeSinceDiscovery > 10 && simMinutes > 5) state = 'bored';
  else if (animalEncounters === 0 && simMinutes > 15) state = 'frustrated';

  return {
    simMinutes,
    discoveries,
    animalEncounters,
    timeSinceDiscovery,
    state,
    totalEvents: events.length,
  };
}

async function observeGameplay(durationMinutes = 5) {
  console.log(`Observing gameplay for ${durationMinutes} sim-minutes...`);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
    await page.click('[data-testid="button-new-game"]');
    await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
    await page.mouse.click(400, 300);
    await page.waitForTimeout(1000);

    // Exit tutorial - inline to avoid import issues
    await page.evaluate(() => {
      // Click exit button if in interior
      const exitBtn = document.querySelector('[data-testid="button-interior-exit"]');
      if (exitBtn) exitBtn.click();
    });
    await page.waitForTimeout(2000);

    recordEvent('game_start', {});

    // Observe for duration - check for animals periodically
    const steps = durationMinutes * 2; // Check every 30 sim-seconds
    for (let i = 0; i < steps; i++) {
      simMinutes += 0.5;

      // Check for visible animals via test hook
      const animals = await page.evaluate(() => {
        // Try to get goats/animals from game state
        if (window.__gameTest && window.__gameTest.getGoats) {
          return window.__gameTest.getGoats();
        }
        return [];
      }).catch(() => []);

      if (animals && animals.length > 0) {
        const goats = animals.filter(a => a.kind === 'goat');
        if (goats.length > 0) {
          recordEvent('animal', { kind: 'goat', count: goats.length });
          recordEvent('discovery', { type: 'goat', count: goats.length });
        } else {
          recordEvent('animal', { kind: animals[0].kind, count: animals.length });
        }
      }

      // Move randomly to explore
      const dirs = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      await page.keyboard.press(dir);
      await page.waitForTimeout(500);

      if (i % 4 === 0) {
        const signals = getSignals();
        console.log(`[${simMinutes.toFixed(1)}m] state=${signals.state}, animals=${signals.animalEncounters}, discoveries=${signals.discoveries}`);
      }
    }

    const final = getSignals();
    console.log('\n=== FINAL SIGNALS ===');
    console.log(JSON.stringify(final, null, 2));

    // Create brain task if bored/frustrated
    if (final.state === 'bored' || final.state === 'frustrated') {
      console.log(`\n⚠ Experience issue detected: ${final.state}`);
      console.log('Creating brain task...');
      // Task creation would go here
    }

    await browser.close();
    return final;
  } catch (e) {
    console.error('Observation failed:', e.message.slice(0, 200));
    await browser.close();
    return null;
  }
}

const cmd = process.argv[2];
if (cmd === 'observe') {
  const minutes = parseFloat(process.argv[3] || '5');
  observeGameplay(minutes).then(() => process.exit(0));
} else if (cmd === 'signals') {
  console.log(JSON.stringify(getSignals(), null, 2));
} else {
  console.log('Usage: node scripts/telemetry.mjs observe [minutes]');
}
