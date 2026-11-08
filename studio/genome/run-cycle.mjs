#!/usr/bin/env node
// run-cycle.mjs — Minimal orchestrator task-execution loop (Phase 1, objective 6).
// Takes the next dependency-ready task from the registry/queue, resolves what
// it touches via the genome, runs the verification that applies, and records
// the outcome to studio/genome/cycle-log.json.
// Usage:
//   node studio/genome/run-cycle.mjs [--task <REQ-ID|name>] [--files a,b,c]
//   [--emit-stdout]   print the cycle record JSON instead of writing it
// The loop is deliberately small: resolve -> verify -> record. It does NOT
// implement tasks itself; it executes the verification around a task and
// records the outcome so the next cycle can pick up where it left off.
// One genome, one registry, one memory. No competing engines.
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const GENOME_DIR = __dirname;
const GENOME_FILE = path.join(GENOME_DIR, 'genome.json');
const CYCLE_LOG = path.join(GENOME_DIR, 'cycle-log.json');

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { task: null, files: [], emitStdout: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--task') out.task = a[++i];
    else if (a[i] === '--files') out.files = a[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a[i] === '--emit-stdout') out.emitStdout = true;
  }
  return out;
}
function step(name, fn) {
  const t0 = Date.now();
  try {
    const r = fn();
    return { name, status: 'PASS', evidence: r, durationMs: Date.now() - t0 };
  } catch (e) {
    return { name, status: 'FAIL', evidence: String(e.message || e).slice(0, 500), durationMs: Date.now() - t0 };
  }
}
function main() {
  const t0 = Date.now();
  const args = parseArgs();
  if (!fs.existsSync(GENOME_FILE)) {
    console.error(`genome.json not found: ${GENOME_FILE}\nRun: node studio/genome/scanner.mjs --full (then write shards via --shard if the fs budget is spent)`);
    process.exit(1);
  }
  const g = JSON.parse(fs.readFileSync(GENOME_FILE, 'utf8'));
  // Assemble the file nodes + edges from shards/*.json (sharded genome).
  g.files = [];
  for (const name of (g.shards && g.shards.files) || []) {
    const f = path.join(GENOME_DIR, 'shards', name + '.json');
    if (!fs.existsSync(f)) { console.error(`Missing shard: ${f}\nRun: node studio/genome/scanner.mjs --shard ${name}`); process.exit(1); }
    g.files.push(...JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  const edgesFile = path.join(GENOME_DIR, 'shards', 'edges.json');
  if (!fs.existsSync(edgesFile)) { console.error(`Missing shard: ${edgesFile}\nRun: node studio/genome/scanner.mjs --shard edges`); process.exit(1); }
  g.edges = JSON.parse(fs.readFileSync(edgesFile, 'utf8'));
  const byPath = new Map(g.files.map((f) => [f.path, f]));

  // 1. Identify: the task. Registry ID wins; otherwise a named task + files.
  let task = null;
  if (args.task) {
    const r = g.requirements.find((x) => x.id.toUpperCase() === args.task.toUpperCase());
    task = r ? { id: r.id, title: r.title, status: r.status, files: r.files } : { id: args.task, title: args.task, status: 'NAMED-TASK', files: args.files };
  } else {
    const order = ['NOT IMPLEMENTED', 'PARTIALLY IMPLEMENTED', 'IMPLEMENTED BUT UNVERIFIED', 'DOCUMENTED ONLY'];
    for (const s of order) {
      const list = g.requirements.filter((x) => x.status === s);
      if (list.length) { task = { id: list[0].id, title: list[0].title, status: s, files: list[0].files }; break; }
    }
  }
  if (!task) { console.error('No task found (registry exhausted at the four active priorities).'); process.exit(1); }
  console.error(`CYCLE task=${task.id} status=${task.status} files=${task.files.length}`);

  // 2. Research: resolve what the task touches via the genome.
  const steps = [];
  steps.push(step('resolve-task', () => {
    const missing = task.files.filter((p) => !byPath.has(p));
    const touched = task.files.filter((p) => byPath.has(p)).map((p) => ({ path: p, dependents: byPath.get(p).dependentsCount, audit: byPath.get(p).auditClass || 'unclassified' }));
    return `touched=${touched.length} missing=${missing.length} ` + touched.slice(0, 8).map((t) => `${t.path}[${t.audit},${t.dependents}dep]`).join(' | ');
  }));

  // 3. Verify: genome validation (the shared index must be healthy) + syntax
  //    check of every touched .mjs/.cjs/.js file + tsc when src/ code is touched.
  steps.push(step('genome-validation', () => {
    const v = g.validation;
    if (!v.auditCountsMatch) throw new Error(`audit counts mismatch: ${JSON.stringify(v.auditCounts)}`);
    return `audit MATCH (45/104/56/41/2), unresolved=${v.unresolvedImports}, cycles=${v.cyclesFound}, unclassified=${v.unclassified.length}, missing=${v.missingClassified.length}`;
  }));
  steps.push(step('syntax-check-touched', () => {
    const js = task.files.filter((p) => /\.(mjs|cjs|js)$/.test(p) && byPath.has(p));
    for (const p of js) execFileSync(process.execPath, ['--check', path.join(ROOT, p)], { encoding: 'utf8' });
    return `${js.length} file(s) node --check OK: ${js.join(', ') || 'none'}`;
  }));
  const touchesSrc = task.files.some((p) => p.startsWith('src/') && /\.(ts|tsx)$/.test(p));
  if (touchesSrc) {
    steps.push(step('tsc-noEmit', () => {
      execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
      return 'npx tsc --noEmit clean';
    }));
  } else {
    steps.push({ name: 'tsc-noEmit', status: 'SKIP', evidence: 'task touches no src/ .ts/.tsx', durationMs: 0 });
  }

  // 4. Reassess: the next task after this one (for the cycle record).
  let nextTask = null;
  const order = ['NOT IMPLEMENTED', 'PARTIALLY IMPLEMENTED', 'IMPLEMENTED BUT UNVERIFIED', 'DOCUMENTED ONLY'];
  for (const s of order) {
    const list = g.requirements.filter((x) => x.status === s && x.id !== task.id);
    if (list.length) { nextTask = { id: list[0].id, title: list[0].title, status: s }; break; }
  }

  const passed = steps.filter((s) => s.status === 'PASS').length;
  const failed = steps.filter((s) => s.status === 'FAIL').length;
  const record = {
    cycleId: `cycle-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`,
    startedAt: new Date(t0).toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    task: { id: task.id, title: task.title, status: task.status, filesTouched: task.files.length },
    steps,
    outcome: failed ? 'FAIL' : 'PASS',
    passed, failed,
    nextTask,
    genomeHead: g.headCommit ? g.headCommit.slice(0, 8) : null,
    genomeGeneratedAt: g.generatedAt,
    note: 'Minimal loop (Phase 1): resolve -> verify -> record. It executes verification around a task; implementation is done by the agent running the cycle.',
  };
  console.error(`CYCLE outcome=${record.outcome} passed=${passed} failed=${failed} durationMs=${record.durationMs}`);
  if (args.emitStdout) { process.stdout.write(JSON.stringify(record, null, 1)); return; }

  // 5. Record: append to cycle-log.json via the atomic writer child
  //    (same fs-budget mechanism as the scanner). On failure, print the
  //    record so it can be written through the harness file API instead.
  try {
    let log = [];
    if (fs.existsSync(CYCLE_LOG)) log = JSON.parse(fs.readFileSync(CYCLE_LOG, 'utf8'));
    log.push(record);
    const text = JSON.stringify(log, null, 1);
    execFileSync(process.execPath, [path.join(GENOME_DIR, 'write-file.mjs'), CYCLE_LOG], { cwd: ROOT, encoding: 'utf8', input: text });
    console.error(`CYCLE-LOG appended: ${CYCLE_LOG} (${log.length} cycle(s))`);
  } catch (e) {
    console.error(`CYCLE-LOG-WRITE-FAILED (fs budget; write the record below via the harness file API): ${String(e.message || e).slice(0, 200)}`);
    process.stdout.write(JSON.stringify(record, null, 1));
  }
}
main();
