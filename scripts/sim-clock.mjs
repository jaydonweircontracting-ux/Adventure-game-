#!/usr/bin/env node
// Simulation Clock + Experience Evaluator
// BUILD 575: AI playtesting with time awareness

import { readFileSync, writeFileSync, existsSync } from 'fs';

// === Simulation Clock ===
class SimClock {
  constructor() {
    this.simMinutes = 0;
    this.events = [];
    this.startRealTime = Date.now();
  }

  // Advance by simulated minutes (does not wait real time)
  advance(minutes, action = 'unknown') {
    this.simMinutes += minutes;
    this.events.push({
      simTime: this.simMinutes,
      action,
      realTime: Date.now() - this.startRealTime,
    });
  }

  getHours() { return this.simMinutes / 60; }
  getTimeline() { return this.events; }

  // Time since last event matching predicate
  timeSince(predicate) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (predicate(this.events[i])) {
        return this.simMinutes - this.events[i].simTime;
      }
    }
    return this.simMinutes; // Never happened
  }
}

// === Experience Evaluator ===
class ExperienceEvaluator {
  constructor() {
    this.discoveries = [];
    this.frustrations = [];
  }

  recordDiscovery(type, details) {
    this.discoveries.push({ simTime: clock.simMinutes, type, details });
  }

  recordFrustration(type, details) {
    this.frustrations.push({ simTime: clock.simMinutes, type, details });
  }

  // Measurable signals
  getSignals() {
    const timeSinceDiscovery = clock.timeSince(e => e.action.includes('discover'));
    const timeSinceAnimal = clock.timeSince(e => e.action.includes('animal'));
    return {
      simMinutes: clock.simMinutes,
      discoveries: this.discoveries.length,
      frustrations: this.frustrations.length,
      timeSinceDiscovery,
      timeSinceAnimal,
      // Estimated state
      state: this.estimateState(timeSinceDiscovery, timeSinceAnimal),
    };
  }

  estimateState(timeSinceDiscovery, timeSinceAnimal) {
    if (timeSinceDiscovery > 10) return 'bored';
    if (timeSinceAnimal > 15) return 'frustrated';
    if (this.discoveries.length === 0 && clock.simMinutes > 5) return 'lost';
    if (this.frustrations.length > 3) return 'frustrated';
    return 'engaged';
  }

  shouldCreateTask() {
    const signals = this.getSignals();
    return signals.state === 'bored' || signals.state === 'frustrated';
  }
}

const clock = new SimClock();
const evaluator = new ExperienceEvaluator();

// === CLI ===
const cmd = process.argv[2];
if (cmd === 'advance' && process.argv[3]) {
  const minutes = parseFloat(process.argv[3]);
  const action = process.argv[4] || 'explore';
  clock.advance(minutes, action);
  console.log(`Advanced ${minutes} sim-minutes (total: ${clock.simMinutes})`);
}
else if (cmd === 'discover' && process.argv[3]) {
  evaluator.recordDiscovery(process.argv[3], process.argv[4] || '');
  console.log(`Discovery recorded: ${process.argv[3]}`);
}
else if (cmd === 'signals') {
  console.log(JSON.stringify(evaluator.getSignals(), null, 2));
}
else if (cmd === 'timeline') {
  console.log(JSON.stringify(clock.getTimeline(), null, 2));
}
else {
  console.log('Usage:');
  console.log('  node scripts/sim-clock.mjs advance <minutes> [action]');
  console.log('  node scripts/sim-clock.mjs discover <type> [details]');
  console.log('  node scripts/sim-clock.mjs signals');
  console.log('  node scripts/sim-clock.mjs timeline');
}

export { clock, evaluator };
