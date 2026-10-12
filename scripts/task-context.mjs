#!/usr/bin/env node
/**
 * Task Context Loader (BUILD 544)
 *
 * Gathers relevant context for a task without reading the entire repo.
 * Usage: node scripts/task-context.mjs <task-keyword>
 * Example: node scripts/task-context.mjs combat
 *          node scripts/task-context.mjs doorway
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const keyword = process.argv[2] || '';
if (!keyword) {
  console.log('Usage: node scripts/task-context.mjs <keyword>');
  process.exit(1);
}

console.log(`=== Task Context: "${keyword}" ===\n`);

// 1. Git state
try {
  const head = execSync('git log --oneline -1', { encoding: 'utf8' }).trim();
  const status = execSync('git status --short', { encoding: 'utf8' }).trim();
  console.log(`HEAD: ${head}`);
  console.log(`Clean: ${!status ? 'yes' : 'NO — ' + status.split('\n').length + ' changed files'}\n`);
} catch { console.log('Git: unavailable\n'); }

// 2. Code index lookup
if (existsSync('docs/CODE_INDEX.md')) {
  const index = readFileSync('docs/CODE_INDEX.md', 'utf8');
  const lines = index.split('\n');
  const matches = lines.filter(l =>
    l.toLowerCase().includes(keyword.toLowerCase())
  ).slice(0, 10);
  if (matches.length) {
    console.log('Relevant modules (from CODE_INDEX.md):');
    matches.forEach(m => console.log(`  ${m.slice(0, 100)}`));
    console.log('');
  }
}

// 3. Recent changes to relevant files
try {
  const log = execSync(
    `git log --oneline -5 --grep="${keyword}" -i`, { encoding: 'utf8' }
  ).trim();
  if (log) {
    console.log('Recent related commits:');
    console.log(log.split('\n').map(l => `  ${l}`).join('\n'));
    console.log('');
  }
} catch {}

// 4. Relevant lessons from learning loop
if (existsSync('docs/LEARNING_LOOP.md')) {
  const loop = readFileSync('docs/LEARNING_LOOP.md', 'utf8');
  const sections = loop.split('## ').slice(1);
  const relevant = sections.filter(s =>
    s.toLowerCase().includes(keyword.toLowerCase())
  ).slice(0, 3);
  if (relevant.length) {
    console.log('Relevant lessons (from LEARNING_LOOP.md):');
    relevant.forEach(s => {
      const title = s.split('\n')[0];
      const lesson = s.match(/Lesson:\*\* (.+)/);
      console.log(`  - ${title}`);
      if (lesson) console.log(`    Lesson: ${lesson[1].slice(0, 120)}`);
    });
    console.log('');
  }
}

// 5. Related tasks
if (existsSync('docs/TASK_QUEUE.md')) {
  const tq = readFileSync('docs/TASK_QUEUE.md', 'utf8');
  const tasks = tq.split('### ').slice(1);
  const relevant = tasks.filter(t =>
    t.toLowerCase().includes(keyword.toLowerCase())
  ).slice(0, 5);
  if (relevant.length) {
    console.log('Related tasks (from TASK_QUEUE.md):');
    relevant.forEach(t => {
      const id = t.match(/^(TASK-\d+)/)?.[1];
      const status = t.match(/Status:\*\* `(\w+)`/)?.[1];
      console.log(`  - ${id}: ${status}`);
    });
  }
}
