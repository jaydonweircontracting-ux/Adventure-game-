#!/usr/bin/env node
// query.mjs — Development Genome query CLI (Phase 1, objective 5).
// The genome is the shared retrieval index for Muse, ACEE, AGEE and the
// orchestrator. One genome, one registry, one memory.
// Usage: node studio/genome/query.mjs <command> [args]
//   status | depends-on <file> | implements <REQ-ID> | duplicates |
//   blast-radius <file> | remove <file> | cycles | next-task |
//   file <path> | search <keyword>
// Reads studio/genome/genome.json (meta index) + shards/*.json (file nodes)
// + shards/edges.json, and assembles the full genome in memory. No writes.
// COMPACT FORMAT (2026-11-07): symbols are "name|kind|1" strings
// (1 = exported); imports are [spec, kind, to] (external: [spec, kind, null,
// package]); edges are [from, to, kind] (external: [from, null, kind, spec]).
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const GENOME_DIR = __dirname;
const GENOME_FILE = path.join(GENOME_DIR, 'genome.json');
const SHARD_DIR = path.join(GENOME_DIR, 'shards');

function loadGenome() {
  if (!fs.existsSync(GENOME_FILE)) {
    console.error(`genome.json not found: ${GENOME_FILE}\nRun: node studio/genome/scanner.mjs --full (then write shards via --shard if the fs budget is spent)`);
    process.exit(1);
  }
  const g = JSON.parse(fs.readFileSync(GENOME_FILE, 'utf8'));
  g.files = [];
  for (const name of (g.shards && g.shards.files) || []) {
    const f = path.join(SHARD_DIR, name + '.json');
    if (!fs.existsSync(f)) { console.error(`Missing shard: ${f}\nRun: node studio/genome/scanner.mjs --shard ${name}`); process.exit(1); }
    g.files.push(...JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  const edgesFile = path.join(SHARD_DIR, 'edges.json');
  if (!fs.existsSync(edgesFile)) { console.error(`Missing shard: ${edgesFile}\nRun: node studio/genome/scanner.mjs --shard edges`); process.exit(1); }
  g.edges = JSON.parse(fs.readFileSync(edgesFile, 'utf8'));
  return g;
}
function parseSymbol(s) { const [name, kind, exp] = s.split('|'); return { name, kind, exported: exp === '1' }; }
function parseImport(a) { return { spec: a[0], kind: a[1], to: a[2] || null, package: a[3] || null, external: a[2] === null && !!a[3] }; }
function usage() {
  console.log('Usage: node studio/genome/query.mjs <command> [args]');
  console.log('  status                 genome health: files, symbols, edges, cycles, markers, audit, registry');
  console.log('  file <path>            one file node: size, symbols, imports, audit class, dependents');
  console.log('  depends-on <file>      what imports <file> and what <file> imports');
  console.log('  blast-radius <file>    transitive dependents (BFS), depth-grouped');
  console.log('  implements <REQ-ID>    one registry requirement + the files it touches');
  console.log('  duplicates             the 12 known duplicate systems (audit §5.1)');
  console.log('  cycles                 all circular import chains');
  console.log('  remove <file>          removal-safety check (§52): dependents, audit class, requirement refs');
  console.log('  next-task              highest-priority unfinished requirement');
  console.log('  search <keyword>       files / symbols / requirements matching a keyword');
  process.exit(1);
}
function findFile(g, arg) {
  const byPath = new Map(g.files.map((f) => [f.path, f]));
  if (byPath.has(arg)) return byPath.get(arg);
  const base = arg.split('/').pop();
  const hits = g.files.filter((f) => f.path === arg || f.path.endsWith('/' + arg) || f.path.split('/').pop() === base);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) { console.log(`Ambiguous: ${hits.length} files match "${arg}":`); hits.forEach((f) => console.log('  ' + f.path)); process.exit(1); }
  return null;
}
function dependentsMap(g) {
  const m = new Map();
  for (const e of g.edges) {
    if (!e[1]) continue; // external edge (to=null) — not a repo dependent
    if (!m.has(e[1])) m.set(e[1], []);
    m.get(e[1]).push(e[0]);
  }
  return m;
}
function auditTag(f) {
  return f.auditClass ? `${f.auditClass}(${f.auditSafety || '?'})` : 'unclassified';
}
function cmdStatus(g) {
  console.log(`GENOME ${g.version}  generated ${g.generatedAt}  head ${g.headCommit ? g.headCommit.slice(0, 8) : 'unknown'}`);
  const s = g.stats;
  console.log(`  files: ${s.totalFiles} (src .ts/.tsx: ${s.srcTsxFiles})  symbols: ${s.totalSymbols}  import edges: ${s.totalImportEdges}  unresolved: ${s.unresolvedImports}  cycles: ${s.cycles}`);
  console.log(`  audit: A=${s.auditCounts.A} B=${s.auditCounts.B} C=${s.auditCounts.C} D=${s.auditCounts.D} E=${s.auditCounts.E} — ${g.validation.auditCountsMatch ? 'MATCH' : 'MISMATCH'} (expected 45/104/56/41/2)`);
  console.log(`  registry: ${s.requirements} requirements — ${Object.entries(s.requirementCounts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  console.log(`  markers: App.tsx=${g.markers.appTsx} prepare-build-entry=${g.markers.prepareBuildEntry} index.html=${g.markers.indexHtml} agree=${g.markers.agree}`);
  console.log(`  public: ${g.publicAssets.totalFiles} files, ${(g.publicAssets.totalBytes / 1048576).toFixed(1)} MB logical (${g.publicAssets.diskUsageNote || ''})`);
  console.log(`  scan: ${g.scan.full ? 'FULL' : 'incremental'} in ${g.scan.durationMs}ms, writer: ${g.scan.writer}`);
  console.log(`  shards: ${(g.shards.files || []).join(', ')} + edges`);
  console.log(`  gaps recorded: ${g.gaps.length} — ${g.gaps.map((x) => x.kind).join(', ')}`);
  const cp = g.lastVerifiedCheckpoint;
  console.log(`  last verified checkpoint: ${cp ? `BUILD ${cp.build} (${cp.commit}) — ${cp.description || ''} [${cp.verifiedAt || 'no date'}]` : 'none recorded'}`);
}
function cmdFile(g, arg) {
  const f = findFile(g, arg);
  if (!f) { console.log(`No file matches "${arg}"`); process.exit(1); }
  console.log(`${f.path}  ${f.size} bytes  ${f.lines} lines  hash ${f.hash}`);
  console.log(`  audit: ${auditTag(f)}${f.auditGroup ? ' group=' + f.auditGroup : ''}${f.auditWave ? ' wave=' + f.auditWave : ''}`);
  console.log(`  symbols: ${f.symbols.length}  imports: ${f.imports.length}  re-exports: ${f.reExports.length}  storageKeys: ${f.storageKeys.join(', ') || 'none'}`);
  console.log(`  dependents: ${f.dependentsCount} direct`);
  const syms = f.symbols.slice(0, 20).map((s) => { const p = parseSymbol(s); return `${p.name}(${p.kind}${p.exported ? ',exported' : ''})`; }).join(', ');
  console.log(`  symbols[0..20]: ${syms || 'none'}`);
}
function cmdDependsOn(g, arg) {
  const f = findFile(g, arg);
  if (!f) { console.log(`No file matches "${arg}"`); process.exit(1); }
  const dm = dependentsMap(g);
  const deps = dm.get(f.path) || [];
  console.log(`${f.path} [${auditTag(f)}]`);
  console.log(`  imported by ${deps.length} file(s):`);
  deps.slice(0, 40).forEach((d) => console.log('    ' + d));
  if (deps.length > 40) console.log(`    ... and ${deps.length - 40} more`);
  console.log(`  imports ${f.imports.length} module(s):`);
  f.imports.slice(0, 40).forEach((a) => { const i = parseImport(a); console.log(`    ${i.spec} -> ${i.to || (i.external ? 'external:' + (i.package || '') : 'UNRESOLVED')}`); });
  if (f.imports.length > 40) console.log(`    ... and ${f.imports.length - 40} more`);
}
function cmdBlastRadius(g, arg) {
  const f = findFile(g, arg);
  if (!f) { console.log(`No file matches "${arg}"`); process.exit(1); }
  const dm = dependentsMap(g);
  const seen = new Set([f.path]);
  let frontier = [f.path];
  const byDepth = [];
  for (let depth = 1; depth <= 6 && frontier.length; depth++) {
    const next = [];
    for (const p of frontier) for (const d of dm.get(p) || []) if (!seen.has(d)) { seen.add(d); next.push(d); }
    byDepth.push(next);
    frontier = next;
  }
  console.log(`BLAST RADIUS ${f.path} [${auditTag(f)}] — ${seen.size - 1} transitive dependent(s)`);
  byDepth.forEach((level, i) => {
    if (!level.length) return;
    console.log(`  depth ${i + 1}: ${level.length} file(s)`);
    level.slice(0, 25).forEach((d) => console.log('    ' + d));
    if (level.length > 25) console.log(`    ... and ${level.length - 25} more`);
  });
}
function cmdImplements(g, id) {
  const r = g.requirements.find((x) => x.id.toUpperCase() === id.toUpperCase());
  if (!r) { console.log(`No requirement ${id}. Known IDs: ${g.requirements.map((x) => x.id).join(', ')}`); process.exit(1); }
  console.log(`${r.id} — ${r.title}`);
  console.log(`  status: ${r.status}`);
  console.log(`  evidence: ${r.evidence}`);
  console.log(`  files (${r.files.length}):`);
  r.files.forEach((p) => {
    const f = g.files.find((x) => x.path === p);
    console.log(`    ${p}${f ? ' [' + auditTag(f) + ']' : ''}`);
  });
}
function cmdDuplicates(g) {
  console.log(`DUPLICATE SYSTEMS (${g.duplicates.length}) — from legacy audit §5.1`);
  for (const d of g.duplicates) {
    console.log(`  ${d.id} — ${d.job}`);
    d.files.forEach((f) => console.log('    ' + f));
    console.log(`    note: ${d.note}`);
  }
}
function cmdCycles(g) {
  console.log(`CIRCULAR IMPORTS (${g.cycles.length})`);
  g.cycles.forEach((c) => console.log('  ' + c.join(' -> ')));
}
function cmdRemove(g, arg) {
  const f = findFile(g, arg);
  if (!f) { console.log(`No file matches "${arg}"`); process.exit(1); }
  const dm = dependentsMap(g);
  const deps = dm.get(f.path) || [];
  const refs = g.requirements.filter((r) => r.files.includes(f.path));
  console.log(`REMOVE CHECK ${f.path} [${auditTag(f)}]`);
  console.log(`  direct dependents: ${deps.length}${deps.length ? ' — ' + deps.slice(0, 10).join(', ') + (deps.length > 10 ? ` (+${deps.length - 10})` : '') : ''}`);
  console.log(`  requirement refs: ${refs.length}${refs.length ? ' — ' + refs.map((r) => `${r.id}(${r.status})`).join(', ') : ''}`);
  const cls = f.auditClass;
  if (cls === 'A') console.log('  VERDICT: REMOVE-BLOCKED — class A (NEVER): required by the 3D game. Do not delete.');
  else if (cls === 'B' || cls === 'C') console.log('  VERDICT: REMOVE-BLOCKED — class ' + cls + ' (AFTER-EXTRACTION): remove only after its logic is extracted into the 3D game and the dependents are re-pointed.');
  else if (cls === 'D') console.log(`  VERDICT: REMOVE-CONDITIONAL — class D (WAVE${f.auditWave ? ' ' + f.auditWave : ''}): obsolete legacy; remove only inside its assigned wave, after the blast radius is checked.`);
  else if (cls === 'E') console.log('  VERDICT: REMOVE-BLOCKED — class E (HOLD): blocked pending a user decision.');
  else console.log('  VERDICT: REMOVE-UNCLASSIFIED — no audit class. Classify first (audit §2), then re-check.');
  if (deps.length && cls !== 'A') console.log(`  Next step: blast-radius ${f.path} — ${deps.length} direct dependent(s) must be re-pointed first.`);
}
function cmdNextTask(g) {
  const order = ['NOT IMPLEMENTED', 'PARTIALLY IMPLEMENTED', 'IMPLEMENTED BUT UNVERIFIED', 'DOCUMENTED ONLY'];
  for (const status of order) {
    const list = g.requirements.filter((r) => r.status === status);
    if (!list.length) continue;
    const r = list[0];
    console.log(`NEXT TASK — ${r.id} — ${r.title}`);
    console.log(`  status: ${r.status}  (${list.length} requirement(s) at this priority)`);
    console.log(`  evidence: ${r.evidence}`);
    console.log(`  files (${r.files.length}): ${r.files.slice(0, 10).join(', ')}${r.files.length > 10 ? ` (+${r.files.length - 10})` : ''}`);
    if (r.files.length) {
      const f = g.files.find((x) => x.path === r.files[0]);
      if (f) console.log(`  first file ${f.path}: ${f.dependentsCount} direct dependents, ${f.symbols.length} symbols [${auditTag(f)}]`);
    }
    return;
  }
  console.log('No unfinished requirements at the four active priorities. Remaining: ' + g.requirements.filter((r) => !['COMPLETE AND VERIFIED', 'OBSOLETE OR DUPLICATED'].includes(r.status)).map((r) => `${r.id}(${r.status})`).join(', '));
}
function cmdSearch(g, kw) {
  const k = kw.toLowerCase();
  const files = g.files.filter((f) => f.path.toLowerCase().includes(k));
  const syms = [];
  for (const f of g.files) for (const s of f.symbols) { const p = parseSymbol(s); if (p.name.toLowerCase().includes(k)) { syms.push(`${f.path} :: ${p.name}(${p.kind})`); if (syms.length >= 30) break; } }
  const reqs = g.requirements.filter((r) => (r.id + ' ' + r.title + ' ' + r.evidence).toLowerCase().includes(k));
  console.log(`SEARCH "${kw}" — files: ${files.length}, symbols: ${syms.length}${syms.length >= 30 ? ' (capped at 30)' : ''}, requirements: ${reqs.length}`);
  files.slice(0, 20).forEach((f) => console.log('  file: ' + f.path));
  syms.forEach((s) => console.log('  symbol: ' + s));
  reqs.forEach((r) => console.log(`  req: ${r.id} — ${r.title} [${r.status}]`));
}
function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!cmd) usage();
  const g = loadGenome();
  switch (cmd) {
    case 'status': cmdStatus(g); break;
    case 'file': arg ? cmdFile(g, arg) : usage(); break;
    case 'depends-on': arg ? cmdDependsOn(g, arg) : usage(); break;
    case 'blast-radius': arg ? cmdBlastRadius(g, arg) : usage(); break;
    case 'implements': arg ? cmdImplements(g, arg) : usage(); break;
    case 'duplicates': cmdDuplicates(g); break;
    case 'cycles': cmdCycles(g); break;
    case 'remove': arg ? cmdRemove(g, arg) : usage(); break;
    case 'next-task': cmdNextTask(g); break;
    case 'search': arg ? cmdSearch(g, arg) : usage(); break;
    default: usage();
  }
}
main();
