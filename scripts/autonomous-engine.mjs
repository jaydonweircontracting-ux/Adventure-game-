#!/usr/bin/env node
// Autonomous Development Engine — Persistent session controller
// BUILD 573: Continuous execution with checkpoint/resume

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = join(__dirname, '..', 'docs', 'sessions');
const SESSION_FILE = join(SESSION_DIR, 'current.json');

function loadSession() {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
  } catch { return null; }
}

function saveSession(session) {
  mkdirSync(SESSION_DIR, { recursive: true });
  session.updated = new Date().toISOString();
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

function createSession() {
  const gitHead = execSync('git rev-parse HEAD', { cwd: join(__dirname, '..'), encoding: 'utf8' }).trim();
  return {
    id: `session-${Date.now()}`,
    sequence: 1,
    started: new Date().toISOString(),
    updated: new Date().toISOString(),
    startCommit: gitHead,
    currentCommit: gitHead,
    activeTask: null,
    completedTasks: [],
    blockedTasks: [],
    failedApproaches: [],
    testResults: [],
    filesChanged: [],
    commits: [],
    nextAction: 'Select highest-value task from queue',
    iterationBudget: 10,
    iterationsUsed: 0,
  };
}

function validateSession(session) {
  // Verify git HEAD matches
  try {
    const currentHead = execSync('git rev-parse HEAD', { cwd: join(__dirname, '..'), encoding: 'utf8' }).trim();
    if (session.currentCommit !== currentHead) {
      console.log(`⚠ Session commit ${session.currentCommit.slice(0,7)} != HEAD ${currentHead.slice(0,7)}`);
      console.log('  Updating to current HEAD');
      session.currentCommit = currentHead;
    }
  } catch (e) {
    console.log('⚠ Could not verify git HEAD');
  }
  return session;
}

// === Commands ===
const cmd = process.argv[2];

if (cmd === 'start') {
  let session = loadSession();
  if (session) {
    console.log(`Resuming session ${session.id}`);
    session = validateSession(session);
    session.sequence++;
  } else {
    console.log('Starting new session');
    session = createSession();
  }
  saveSession(session);
  console.log(`Session: ${session.id} (seq ${session.sequence})`);
  console.log(`Next: ${session.nextAction}`);
}
else if (cmd === 'status') {
  const session = loadSession();
  if (!session) { console.log('No active session'); process.exit(0); }
  console.log(`Session: ${session.id}`);
  console.log(`Iterations: ${session.iterationsUsed}/${session.iterationBudget}`);
  console.log(`Completed: ${session.completedTasks.length}`);
  console.log(`Blocked: ${session.blockedTasks.length}`);
  console.log(`Next: ${session.nextAction}`);
}
else if (cmd === 'complete-task' && process.argv[3]) {
  const session = loadSession();
  if (!session) { console.log('No session'); process.exit(1); }
  const taskId = process.argv[3];
  session.completedTasks.push({ id: taskId, completedAt: new Date().toISOString() });
  session.activeTask = null;
  session.iterationsUsed++;
  session.nextAction = 'Select next task from queue';
  saveSession(session);
  console.log(`✓ Task ${taskId} completed`);
}
else if (cmd === 'block-task' && process.argv[3]) {
  const session = loadSession();
  if (!session) { console.log('No session'); process.exit(1); }
  const taskId = process.argv[3];
  const reason = process.argv[4] || 'No reason given';
  session.blockedTasks.push({ id: taskId, reason, blockedAt: new Date().toISOString() });
  session.activeTask = null;
  session.iterationsUsed++;
  session.nextAction = 'Select next task from queue (skip blocked)';
  saveSession(session);
  console.log(`⊘ Task ${taskId} blocked: ${reason}`);
}
else if (cmd === 'checkpoint' && process.argv[3]) {
  const session = loadSession();
  if (!session) { console.log('No session'); process.exit(1); }
  session.nextAction = process.argv[3];
  try {
    session.currentCommit = execSync('git rev-parse HEAD', { cwd: join(__dirname, '..'), encoding: 'utf8' }).trim();
  } catch {}
  saveSession(session);
  console.log(`Checkpoint saved: ${session.nextAction}`);
}
else {
  console.log('Usage:');
  console.log('  node scripts/autonomous-engine.mjs start');
  console.log('  node scripts/autonomous-engine.mjs status');
  console.log('  node scripts/autonomous-engine.mjs complete-task <id>');
  console.log('  node scripts/autonomous-engine.mjs block-task <id> [reason]');
  console.log('  node scripts/autonomous-engine.mjs checkpoint "<next action>"');
}
