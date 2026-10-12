#!/usr/bin/env node
/**
 * Fresh-Session Resumption Test (BUILD 540)
 *
 * Validates that a new agent session can resume work from persistent files
 * WITHOUT relying on conversational memory.
 *
 * Checks:
 * 1. TASK_QUEUE.md exists and has clear status for each task
 * 2. Last completed task has evidence (commit hash, test results)
 * 3. Next unfinished task is identifiable
 * 4. Required context files exist (CODE_INDEX, RESEARCH, RECOVERY_PROTOCOL)
 * 5. Git state is clean and remote is in sync
 *
 * Run: `node tests/session-resumption.mjs`
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};

// 1. Required files exist
const required = [
  'docs/TASK_QUEUE.md',
  'docs/CODE_INDEX.md',
  'docs/RESEARCH.md',
  'docs/RECOVERY_PROTOCOL.md',
  'tests/real-game/README.md',
];
for (const f of required) {
  check(`File exists: ${f}`, existsSync(f));
}

// 2. TASK_QUEUE.md has parseable tasks with status
const tq = readFileSync('docs/TASK_QUEUE.md', 'utf8');
const taskBlocks = tq.split(/^### /m).slice(1);
const tasks = taskBlocks.map(block => {
  const idMatch = block.match(/^(TASK-\d+):/);
  const statusMatch = block.match(/- \*\*Status:\*\* `(\w+)`/);
  return { id: idMatch?.[1], title: block.split('\n')[0], status: statusMatch?.[1], block };
}).filter(t => t.id);
check('Tasks parseable from TASK_QUEUE.md', tasks.length > 0,
  `${tasks.length} tasks found`);

const doneTasks = tasks.filter(t => t.status === 'done');
const todoTasks = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress');
check('Completed tasks have evidence',
  doneTasks.every(t => /- \*\*Evidence:\*\*/i.test(t.block) && /- \*\*Commit:\*\*/i.test(t.block)),
  `${doneTasks.length} done`);

// 3. Next unfinished task identifiable
check('Next task identifiable', todoTasks.length > 0 || doneTasks.length > 0,
  todoTasks.length ? `next: ${todoTasks[0].id}` : 'all done');

// 4. Git state
try {
  const status = execSync('git status --short', { encoding: 'utf8' }).trim();
  const clean = !status.split('\n').some(l => l && !l.startsWith('??'));
  check('Working tree clean (no uncommitted changes)', clean,
    clean ? '' : 'uncommitted changes present');
} catch { check('Working tree clean', false, 'git failed'); }

try {
  const local = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const remote = execSync('git rev-parse origin/main', { encoding: 'utf8' }).trim();
  check('Local matches remote', local === remote,
    local === remote ? local.slice(0, 7) : 'diverged');
} catch { check('Local matches remote', false, 'git failed'); }

// 5. Latest commit message is descriptive
try {
  const msg = execSync('git log -1 --format=%s', { encoding: 'utf8' }).trim();
  check('Latest commit descriptive', msg.length > 20, msg.slice(0, 60));
} catch { check('Latest commit descriptive', false, 'git failed'); }

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
