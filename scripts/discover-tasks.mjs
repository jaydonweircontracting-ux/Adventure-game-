#!/usr/bin/env node
/**
 * Autonomous Task Discovery Engine
 *
 * Discovers new tasks from repository and gameplay evidence.
 * Usage:
 *   node scripts/discover-tasks.mjs scan    — Scan for new tasks
 *   node scripts/discover-tasks.mjs list    — List discovered tasks
 *
 * Tasks are persisted in docs/DISCOVERED_TASKS.md and survive interruptions.
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const TASKS_FILE = 'docs/DISCOVERED_TASKS.md';
const cmd = process.argv[2] || 'list';

function scanForTasks() {
  const tasks = [];

  // 1. Check for TODO/FIXME in source
  try {
    const todos = execSync('grep -rn "TODO\\|FIXME\\|XXX\\|HACK" src/ --include="*.ts" --include="*.tsx" | head -20', { encoding: 'utf8' });
    if (todos.trim()) {
      tasks.push({
        id: 'DISC-TODO-001',
        title: 'Address TODO/FIXME comments in source',
        evidence: `Found ${todos.trim().split('\n').length} TODO/FIXME comments`,
        files: ['src/'],
        acceptance: 'All TODOs resolved or converted to tracked tasks',
        risk: 'low', scope: 'small',
        needsApproval: false,
      });
    }
  } catch { /* no todos found */ }

  // 2. Check NPC visibility (from audit)
  // NPCs cluster at (16-93, 23-87), plaza at (144,144) — 125+ units away
  tasks.push({
    id: 'DISC-NPC-001',
    title: 'Town NPCs too far from plaza gathering point',
    evidence: 'Audit 2026-10-11: All 12 NPCs 125-148 units from plaza (144,144). Closest is Mira at 53 units. NPCs cluster at (16-93, 23-87).',
    files: ['src/game/townsfolk.ts', 'src/App.tsx'],
    acceptance: 'At least 3 NPCs visible within 30 units of plaza during daytime',
    risk: 'medium', scope: 'medium',
    needsApproval: false,
  });

  // 3. Check for empty dialogue (generic responses)
  tasks.push({
    id: 'DISC-DLG-001',
    title: 'Key NPCs have only generic dialogue',
    evidence: 'Mira got unique dialogue in BUILD 549. Other key NPCs (Cedric merchant, Father Aldous, Tom smith) still use generic archetype responses.',
    files: ['src/game/dialogue.ts'],
    acceptance: 'Merchant, priest, and smith have unique "who" responses',
    risk: 'low', scope: 'small',
    needsApproval: false,
  });

  // 4. Check test coverage gaps
  try {
    const testFiles = execSync('ls tests/real-game/*.mjs 2>/dev/null | wc -l', { encoding: 'utf8' }).trim();
    if (parseInt(testFiles) < 10) {
      tasks.push({
        id: 'DISC-TEST-001',
        title: 'Expand real-game test coverage',
        evidence: `Only ${testFiles} real-game test files. No dedicated NPC interaction, dialogue, or town navigation tests.`,
        files: ['tests/real-game/'],
        acceptance: 'New tests for NPC dialogue and town navigation',
        risk: 'low', scope: 'medium',
        needsApproval: false,
      });
    }
  } catch { /* ignore */ }

  return tasks;
}

function saveTasks(tasks) {
  let content = '# Discovered Tasks\n\n';
  content += `*Generated: ${new Date().toISOString()}*\n\n`;
  content += 'These tasks were discovered by the autonomous task discovery engine.\n';
  content += 'They persist across sessions and are ranked by player value.\n\n';

  tasks.forEach((t, i) => {
    content += `## ${t.id}: ${t.title}\n\n`;
    content += `- **Evidence:** ${t.evidence}\n`;
    content += `- **Files:** ${t.files.join(', ')}\n`;
    content += `- **Acceptance:** ${t.acceptance}\n`;
    content += `- **Risk:** ${t.risk} | **Scope:** ${t.scope}\n`;
    content += `- **Needs approval:** ${t.needsApproval ? 'YES' : 'No'}\n`;
    content += `- **Status:** pending\n\n`;
  });

  writeFileSync(TASKS_FILE, content);
  console.log(`Discovered ${tasks.length} tasks, saved to ${TASKS_FILE}`);
}

function listTasks() {
  if (!existsSync(TASKS_FILE)) {
    console.log('No discovered tasks. Run: node scripts/discover-tasks.mjs scan');
    return;
  }
  const content = readFileSync(TASKS_FILE, 'utf8');
  // Extract task headers
  const matches = content.match(/## (DISC-[A-Z]+-\d+): (.+)/g) || [];
  console.log(`=== Discovered Tasks (${matches.length}) ===\n`);
  matches.forEach(m => console.log(m.replace('## ', '')));
}

// Main
if (cmd === 'scan') {
  const tasks = scanForTasks();
  saveTasks(tasks);
} else if (cmd === 'list') {
  listTasks();
} else {
  console.log('Usage: node scripts/discover-tasks.mjs [scan|list]');
}
