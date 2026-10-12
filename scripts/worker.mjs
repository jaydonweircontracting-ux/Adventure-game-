#!/usr/bin/env node
/**
 * Autonomous Game Evolution Worker (Permanent)
 *
 * Resumable worker for continuous game improvement.
 * Usage:
 *   node scripts/worker.mjs status   — Show worker state
 *   node scripts/worker.mjs resume   — Resume from saved state
 *   node scripts/worker.mjs cycle    — Run one complete cycle
 *
 * The worker persists state in docs/WORKER_STATE.md and resumes after interruption.
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const STATE_FILE = 'docs/WORKER_STATE.md';
const cmd = process.argv[2] || 'status';

function readState() {
  if (!existsSync(STATE_FILE)) return null;
  return readFileSync(STATE_FILE, 'utf8');
}

function updateState(updates) {
  let state = readState();
  if (!state) return false;
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`(\\*\\*${key}:\\*\\*) .*`, 'g');
    state = state.replace(regex, `$1 ${value}`);
  }
  // Also handle list items
  writeFileSync(STATE_FILE, state);
  return true;
}

function showStatus() {
  const state = readState();
  if (!state) {
    console.log('No worker state found. Run: node scripts/worker.mjs init');
    return;
  }
  // Extract key fields
  const get = (key) => {
    const m = state.match(new RegExp(`\\*\\*${key}:\\*\\* (.*)`));
    return m ? m[1].trim() : 'unknown';
  };
  console.log('=== Worker Status ===');
  console.log(`State: ${get('State')}`);
  console.log(`Cycle: ${get('Cycle')}, Phase: ${get('Phase')}`);
  console.log(`Last good: ${get('Last known-good commit')} (build ${get('Last known-good build')})`);
  console.log(`Task: ${get('Task')}`);
  console.log(`Result: ${get('Result')}`);
  console.log(`Next: ${get('Next Recommended Task')}`);
}

function initWorker() {
  if (existsSync(STATE_FILE)) {
    console.log('Worker state already exists. Use "resume" to continue.');
    return;
  }
  // State file already created manually
  console.log('Worker initialized. Use "cycle" to run.');
}

// Main
switch (cmd) {
  case 'status':
    showStatus();
    break;
  case 'init':
    initWorker();
    break;
  case 'resume':
    console.log('Resuming from saved state...');
    showStatus();
    console.log('\nTo continue, the agent should:');
    console.log('1. Read docs/WORKER_STATE.md');
    console.log('2. Check Current Cycle phase');
    console.log('3. Continue from that phase');
    break;
  case 'cycle':
    console.log('Starting new cycle...');
    console.log('The agent should execute: inspect → observe → measure → prioritize →');
    console.log('  hypothesize → implement → test → verify → commit → learn → select next');
    break;
  default:
    console.log('Usage: node scripts/worker.mjs [status|init|resume|cycle]');
}
