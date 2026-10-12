#!/usr/bin/env node
/**
 * Central Brain Orchestrator — BUILD 566/567
 *
 * Minimal coordination layer connecting existing systems:
 * - brain.mjs (project state, investigation)
 * - worker.mjs (autonomous cycles)
 * - consistency-audit.mjs (7/7 checks)
 * - reuse-index.mjs (code search)
 * - discover-tasks.mjs (task discovery)
 *
 * Does NOT duplicate these systems. Coordinates them.
 *
 * Usage:
 *   node scripts/central-brain.mjs status     — Health report
 *   node scripts/central-brain.mjs cycle      — Run one coordinated cycle
 *   node scripts/central-brain.mjs registry   — Show system registry
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const STATE_PATH = 'docs/BRAIN_STATE.json';

// === System Registry ===
// Each system declares: id, purpose, command, health check
const REGISTRY = {
  'consistency-audit': {
    purpose: 'World consistency checks (7/7)',
    command: 'node scripts/consistency-audit.mjs',
    health: () => {
      try {
        const out = execSync('node scripts/consistency-audit.mjs 2>&1', { encoding: 'utf8' });
        return out.includes('7/7') ? 'HEALTHY' : 'DEGRADED';
      } catch { return 'BROKEN'; }
    },
  },
  'reuse-index': {
    purpose: 'Internal code search',
    command: 'node scripts/reuse-index.mjs',
    health: () => existsSync('scripts/reuse-index.mjs') ? 'HEALTHY' : 'MISSING',
  },
  'brain': {
    purpose: 'Project state and investigation',
    command: 'node scripts/brain.mjs status',
    health: () => existsSync('scripts/brain.mjs') ? 'HEALTHY' : 'MISSING',
  },
  'quest-tests': {
    purpose: 'Quest logic verification (12/12)',
    command: 'npx tsx tests/quest-playthrough.mts',
    health: () => existsSync('tests/quest-playthrough.mts') ? 'HEALTHY' : 'MISSING',
  },
  'gameplay-agent': {
    purpose: 'Real browser gameplay testing',
    command: 'node tests/real-game/agent.mjs',
    health: () => existsSync('tests/real-game/agent.mjs') ? 'HEALTHY' : 'MISSING',
  },
};

// === Shared State ===
function loadState() {
  if (existsSync(STATE_PATH)) {
    try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
    catch { /* corrupted, start fresh */ }
  }
  return {
    version: 1,
    lastCycle: null,
    lastHealth: {},
    taskQueue: [],
    completedTasks: [],
    blockedTasks: [],
  };
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// === Health Report ===
function healthReport() {
  console.log('=== CENTRAL BRAIN HEALTH ===\n');
  const state = loadState();
  let healthy = 0, total = 0;

  for (const [id, sys] of Object.entries(REGISTRY)) {
    total++;
    const health = sys.health();
    if (health === 'HEALTHY') healthy++;
    const icon = health === 'HEALTHY' ? '✅' : health === 'DEGRADED' ? '⚠️' : '❌';
    console.log(`${icon} ${id}: ${health} — ${sys.purpose}`);
    state.lastHealth[id] = health;
  }

  console.log(`\n${healthy}/${total} systems healthy`);

  // Git state
  try {
    const head = execSync('git log --oneline -1', { encoding: 'utf8' }).trim();
    console.log(`\nHEAD: ${head}`);
  } catch { console.log('\nGit: unavailable'); }

  saveState(state);
  return healthy === total;
}

// === Task Selection ===
// Priority: broken systems > gameplay blockers > performance > features
function selectTask() {
  const state = loadState();

  // Check system health first
  for (const [id, sys] of Object.entries(REGISTRY)) {
    const health = sys.health();
    if (health === 'BROKEN' || health === 'MISSING') {
      return {
        id: `fix-${id}`,
        priority: 'P0',
        description: `Repair ${id}: ${sys.purpose}`,
        system: id,
      };
    }
  }

  // Check task queue
  if (state.taskQueue.length > 0) {
    return state.taskQueue[0];
  }

  return null;
}

// === Single Cycle ===
function runCycle() {
  console.log('=== CENTRAL BRAIN CYCLE ===\n');

  // 1. Health check
  console.log('1. Checking system health...');
  const allHealthy = healthReport();
  console.log();

  // 2. Select task
  console.log('2. Selecting task...');
  const task = selectTask();
  if (!task) {
    console.log('No tasks. All systems healthy.\n');
    return;
  }
  console.log(`Selected: [${task.priority}] ${task.description}\n`);

  // 3. Record
  const state = loadState();
  state.lastCycle = {
    timestamp: new Date().toISOString(),
    task: task.id,
    healthBefore: { ...state.lastHealth },
  };
  saveState(state);

  console.log('Task recorded. Execute manually or via worker.');
  console.log('This orchestrator coordinates; it does not auto-modify code.');
}

const cmd = process.argv[2] || 'status';
if (cmd === 'status') healthReport();
else if (cmd === 'cycle') runCycle();
else if (cmd === 'registry') {
  console.log('=== SYSTEM REGISTRY ===\n');
  for (const [id, sys] of Object.entries(REGISTRY)) {
    console.log(`${id}:`);
    console.log(`  Purpose: ${sys.purpose}`);
    console.log(`  Command: ${sys.command}`);
    console.log(`  Health: ${sys.health()}\n`);
  }
}
else console.log('Usage: node scripts/central-brain.mjs <status|cycle|registry>');
