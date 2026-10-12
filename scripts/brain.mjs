#!/usr/bin/env node
/**
 * Unified Development Brain (BUILD 545)
 *
 * Single command for the integrated vertical slice:
 * CONTEXT → INVESTIGATE → TEST SELECTION → VERIFY → LEARN
 *
 * Usage:
 *   node scripts/brain.mjs status          — Project state summary
 *   node scripts/brain.mjs test            — Run tests for changed files
 *   node scripts/brain.mjs task <keyword>  — Load task context
 *   node scripts/brain.mjs investigate <keyword> — Causal investigation template
 *
 * Reuses: TASK_QUEUE.md, LEARNING_LOOP.md, CODE_INDEX.md, task-context.mjs
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const cmd = process.argv[2] || 'status';
const arg = process.argv[3] || '';

// === BRAIN 1: Project State Summary ===
function projectState() {
  console.log('=== PROJECT STATE ===\n');

  // Git state (verified fact)
  try {
    const head = execSync('git log --oneline -1', { encoding: 'utf8' }).trim();
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    const remote = execSync('git rev-parse origin/main', { encoding: 'utf8' }).trim().slice(0, 7);
    const local = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().slice(0, 7);
    console.log(`Branch: ${branch} | HEAD: ${head}`);
    console.log(`Remote sync: ${local === remote ? '✅ in sync' : '⚠️ DIVERGED'}`);
    console.log(`Working tree: ${!status ? 'clean' : status.split('\n').length + ' changed files'}\n`);
  } catch { console.log('Git: unavailable\n'); }

  // Build marker (verified fact)
  try {
    const html = readFileSync('index.html', 'utf8');
    const m = html.match(/__AG_BUILD="(\d+)"/);
    console.log(`Build marker: ${m ? m[1] : 'not found'}\n`);
  } catch { console.log('Build marker: unreadable\n'); }

  // Task queue summary
  if (existsSync('docs/TASK_QUEUE.md')) {
    const tq = readFileSync('docs/TASK_QUEUE.md', 'utf8');
    const done = (tq.match(/Status:\*\* `done`/g) || []).length;
    const todo = (tq.match(/Status:\*\* `todo`/g) || []).length;
    const prog = (tq.match(/Status:\*\* `in_progress`/g) || []).length;
    console.log(`Tasks: ${done} done, ${todo} todo, ${prog} in_progress`);

    // Next actionable task
    const tasks = tq.split('### ').slice(1);
    const next = tasks.find(t => /Status:\*\* `(todo|in_progress)`/.test(t));
    if (next) {
      const id = next.match(/^(TASK-\d+)/)?.[1];
      const title = next.split('\n')[0].replace(/TASK-\d+: /, '').slice(0, 60);
      console.log(`Next: ${id} — ${title}\n`);
    }
  }

  // Recent lessons count
  if (existsSync('docs/LEARNING_LOOP.md')) {
    const loop = readFileSync('docs/LEARNING_LOOP.md', 'utf8');
    const entries = (loop.match(/^## \d{4}-\d{2}-\d{2}/gm) || []).length;
    console.log(`Learning loop entries: ${entries}\n`);
  }
}

// === BRAIN 4: Predictive Test Selection ===
function selectTests() {
  console.log('=== PREDICTIVE TEST SELECTION ===\n');

  let changed = [];
  try {
    const out = execSync('git status --porcelain', { encoding: 'utf8' });
    changed = out.split('\n').filter(Boolean).map(l => l.slice(3));
  } catch { console.log('Git unavailable'); return; }

  if (!changed.length) {
    console.log('No changes — no tests needed.\n');
    return;
  }

  console.log(`Changed files (${changed.length}):`);
  changed.slice(0, 10).forEach(f => console.log(`  ${f}`));
  console.log('');

  // File → test mapping (derived from observed relationships)
  const testMap = [
    { pattern: /^src\/game\/combat\.ts/, tests: ['combat'], reason: 'combat core' },
    { pattern: /^src\/App\.tsx$/, tests: ['smoke', 'combat', 'journey'], reason: 'main app (high risk)' },
    { pattern: /^src\/game\/iso\//, tests: ['smoke', 'journey', 'discoverability'], reason: 'renderer' },
    { pattern: /collision/i, tests: ['smoke', 'journey'], reason: 'collision' },
    { pattern: /^tests\/real-game\/(\w+)\.mjs$/, tests: ['$1'], reason: 'test file itself' },
    { pattern: /^docs\//, tests: [], reason: 'docs only (no tests)' },
    { pattern: /^scripts\//, tests: [], reason: 'scripts only (no tests)' },
  ];

  const selected = new Set();
  const reasons = [];

  for (const file of changed) {
    let matched = false;
    for (const { pattern, tests, reason } of testMap) {
      const m = file.match(pattern);
      if (m) {
        matched = true;
        tests.forEach(t => {
          const name = t === '$1' ? m[1] : t;
          if (name && name !== 'helpers') selected.add(name);
        });
        reasons.push(`${file} → ${reason}`);
        break;
      }
    }
    if (!matched && !file.endsWith('.png')) {
      // Unknown file type — be conservative, run smoke
      selected.add('smoke');
      reasons.push(`${file} → unknown (conservative: smoke)`);
    }
  }

  if (!selected.size) {
    console.log('No tests needed for these changes.\n');
  } else {
    console.log('Recommended tests:');
    [...selected].forEach(t => console.log(`  - ${t}`));
    console.log('\nReasoning:');
    reasons.slice(0, 8).forEach(r => console.log(`  ${r}`));
    console.log(`\nRun: node scripts/brain.mjs run ${[...selected].join(' ')}`);
  }
  console.log('');
}

// === BRAIN 2: Causal Investigation Template ===
function investigate(keyword) {
  console.log(`=== CAUSAL INVESTIGATION: "${keyword}" ===\n`);
  console.log('1. OBSERVABLE SYMPTOM: (what is wrong?)');
  console.log('   _Fill in after reproduction_\n');
  console.log('2. REPRODUCTION: (exact steps)');
  console.log('   _Fill in_\n');
  console.log('3. EXPECTED BEHAVIOR:');
  console.log('   _Fill in_\n');
  console.log('4. ACTUAL BEHAVIOR:');
  console.log('   _Fill in_\n');
  console.log('5. RELEVANT CODE PATHS:');

  // Auto-suggest from code index
  if (existsSync('docs/CODE_INDEX.md')) {
    const index = readFileSync('docs/CODE_INDEX.md', 'utf8');
    const matches = index.split('\n')
      .filter(l => l.toLowerCase().includes(keyword.toLowerCase()))
      .slice(0, 5);
    matches.forEach(m => console.log(`   - ${m.slice(0, 80)}`));
  }
  console.log('\n6. PLAUSIBLE CAUSES: (list with evidence for/against)');
  console.log('   a. _Cause 1_ — Evidence: _');
  console.log('   b. _Cause 2_ — Evidence: _\n');
  console.log('7. SMALLEST JUSTIFIED REPAIR:');
  console.log('   _Fill in after investigation_\n');
  console.log('8. VERIFICATION NEEDED:');
  console.log('   _What test proves the fix?_\n');
}

// === BRAIN 9: Task Ranking by Impact ===
function rankTasks() {
  console.log('=== TASK RANKING (by impact) ===\n');

  if (!existsSync('docs/TASK_QUEUE.md')) {
    console.log('No task queue found.\n');
    return;
  }

  const tq = readFileSync('docs/TASK_QUEUE.md', 'utf8');
  const blocks = tq.split(/^### /m).slice(1);

  const tasks = blocks.map(b => {
    const id = b.match(/^(TASK-\d+)/)?.[1];
    const status = b.match(/- \*\*Status:\*\* `(\w+)`/)?.[1];
    const priority = b.match(/- \*\*Priority:\*\* (\w+)/)?.[1];
    const title = b.split('\n')[0].replace(/TASK-\d+: /, '').slice(0, 60);
    const note = b.match(/- \*\*Note:\*\* (.+)/)?.[1] || '';
    const blocked = /user approval|needs human|blocked/i.test(b);
    return { id, status, priority, title, blocked, note: note.slice(0, 80) };
  }).filter(t => t.id && t.status !== 'done');

  if (!tasks.length) {
    console.log('No actionable tasks — all done.\n');
    console.log('Recommendation: Discover new issues via gameplay investigation.\n');
    return;
  }

  // Rank: P1 > P2 > P3; unblocked > blocked
  const pRank = { P1: 30, P2: 20, P3: 10 };
  tasks.forEach(t => {
    t.score = (pRank[t.priority] || 0) + (t.blocked ? 0 : 5);
  });
  tasks.sort((a, b) => b.score - a.score);

  console.log('Ranked by (priority × 10 + unblocked bonus):\n');
  tasks.forEach((t, i) => {
    const flag = t.blocked ? ' [BLOCKED]' : '';
    console.log(`${i + 1}. ${t.priority} ${t.id}: ${t.title}${flag}`);
    if (t.note) console.log(`   Note: ${t.note}`);
  });
  console.log('');

  const top = tasks[0];
  if (top.blocked) {
    console.log(`Top task ${top.id} is blocked. Recommendation:`);
    console.log('  → Discover new gameplay issues instead of waiting.\n');
  } else {
    console.log(`Recommended: ${top.id} (score ${top.score})\n`);
  }
}

// === Main ===
switch (cmd) {
  case 'status': projectState(); break;
  case 'test': selectTests(); break;
  case 'rank': rankTasks(); break;
  case 'task':
    if (arg) execSync(`node scripts/task-context.mjs ${arg}`, { stdio: 'inherit' });
    else console.log('Usage: node scripts/brain.mjs task <keyword>');
    break;
  case 'investigate': investigate(arg || 'issue'); break;
  default:
    console.log('Usage: node scripts/brain.mjs [status|test|task <kw>|investigate <kw>]');
}
