#!/usr/bin/env node
console.error('BOOT scanner.mjs');
// ASHFALL Development Genome — incremental repository scanner.
// Phase 1 (ACEE) / §57 §2. Builds studio/genome/genome.json from ACTUAL repo data.
//   node studio/genome/scanner.mjs [--full] [--quiet]
//   node studio/genome/scanner.mjs --shard <name>   # print one shard as JSON
//   node studio/genome/scanner.mjs --emit-stdout    # print the whole genome
// Exit 0 = genome written + validation passed. Exit 1 = validation failed
// (audit/registry counts mismatch, unresolved classification, JSON invalid).
// Incremental: file fingerprints (sha256 + size + mtime) — only changed/new
// files are re-parsed; unchanged files are reused from the previous genome.
// Never a full re-scan unless --full is passed or no previous genome exists.
// Writes are atomic (temp file -> validate -> rename) per the §54 procedure,
// and they happen in a FRESH CHILD PROCESS (studio/genome/write-file.mjs).
// ENVIRONMENT: a per-process filesystem-operation budget (~900-1200 ops when
// the session starts, draining over the session to ~1 op at a time — verified
// 2026-11-07: after ~1,200 reads write() returns EPERM; a 0-op write still
// succeeds but 10 reads + a write fails). The scanner therefore (a) keeps its
// own op count low (the 31,507-file public/ walk is cached in
// public-aggregates.json and read, not re-walked), (b) delegates writes to a
// fresh child, and (c) SHARDS its output: genome.json is a small meta index
// and the file nodes live in shards/*.json, so each piece fits through the
// harness file API when the exec budget is spent (--shard + muse.write).
// Does NOT scan node_modules, .git, or dist. public/ is metadata only
// (per-directory aggregates, not per-file nodes — 31,507 files).
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GENOME_DIR = path.join(ROOT, 'studio', 'genome');
const GENOME_FILE = path.join(GENOME_DIR, 'genome.json');
const GENOME_BAK = path.join(GENOME_DIR, 'genome.json.bak');
const GENOME_TMP = path.join(GENOME_DIR, 'genome.json.tmp');

const FULL = process.argv.includes('--full');
const QUIET = process.argv.includes('--quiet');
const EMIT_STDOUT = process.argv.includes('--emit-stdout');
const SHARD = (() => { const i = process.argv.indexOf('--shard'); return i >= 0 ? process.argv[i + 1] : null; })();
const t0 = Date.now();
const log = (...a) => { if (!QUIET) ((EMIT_STDOUT || SHARD) ? console.error : console.log)(...a); };
const elapsed = () => Date.now() - t0;

// ---------------------------------------------------------------- walk ----
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);
function walkDir(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walkDir(p, out); }
    else if (e.isFile()) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const fp = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

// ------------------------------------------------------------- sharding ----
// The genome is sharded so each piece fits through the harness file API
// when the fs-op budget is spent (a single ~932 KB genome.json cannot be
// written by the scanner in this environment, and cannot pass through one
// tool call). genome.json is the small meta index; the file nodes live in
// shards/<name>.json and the edges in shards/edges.json. query.mjs and
// run-cycle.mjs load the index + shards and assemble the full genome.
const SHARD_DIR = path.join(GENOME_DIR, 'shards');
const SHARD_DEFS = [
  { name: 'files-app', test: (p) => p === 'src/App.tsx' || p === 'src/main.tsx' || p === 'src/index.css' || p === 'src/vite-env.d.ts' || p.startsWith('src/components/') },
  { name: 'files-game', test: (p) => p.startsWith('src/game/') && !p.slice('src/game/'.length).includes('/') },
  { name: 'files-game-sub', test: (p) => p.startsWith('src/game/') && p.slice('src/game/'.length).includes('/') },
  { name: 'files-scripts', test: (p) => p.startsWith('scripts/') },
  { name: 'files-studio', test: (p) => p.startsWith('studio/') },
  { name: 'files-tests', test: (p) => p.startsWith('tests/') },
  { name: 'files-root', test: (p) => !p.includes('/') },
];
function shardFor(p) { for (const d of SHARD_DEFS) if (d.test(p)) return d.name; return 'files-root'; }
function readShardedGenome() {
  // Returns { meta, files, edges } from genome.json + shards/*.json, or null
  // when no genome exists yet. Used for incremental reuse.
  if (!fs.existsSync(GENOME_FILE)) return null;
  const meta = JSON.parse(fs.readFileSync(GENOME_FILE, 'utf8'));
  const files = [];
  for (const name of meta.shards.files) {
    const f = path.join(SHARD_DIR, name + '.json');
    if (fs.existsSync(f)) files.push(...JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  const edgesFile = path.join(SHARD_DIR, 'edges.json');
  const edges = fs.existsSync(edgesFile) ? JSON.parse(fs.readFileSync(edgesFile, 'utf8')) : [];
  return { meta, files, edges };
}

// ------------------------------------------------------- TS AST parse ----
const KIND_BY_EXT = { '.ts': ts.ScriptKind.TS, '.tsx': ts.ScriptKind.TSX, '.mts': ts.ScriptKind.TS, '.mjs': ts.ScriptKind.JS, '.cjs': ts.ScriptKind.JS, '.js': ts.ScriptKind.JS };
const PARSE_EXTS = new Set(Object.keys(KIND_BY_EXT));

// COMPACT FORMAT (2026-11-07): the genome must pass through the harness file
// API when the fs-op budget is spent, so per-file data is stored compactly:
//   symbols: ["name|kind|1"] — kind in {function,class,interface,type,enum,const},
//     trailing 1 = exported, 0 = not. (An exports list is derivable: symbols with |1.)
//   imports: [spec, kind, to] — kind in {static,type,dynamic,require}; `to` is
//     the resolved repo path, or null for external/unresolved; external imports
//     carry a 4th element, the package name: [spec, kind, null, package].
//   reExports: [spec, to] — `to` resolved, or null.
//   dependents: NOT stored (derivable from edges); only dependentsCount is kept.
function parseCodeFile(absPath, text) {
  const ext = path.extname(absPath);
  const sf = ts.createSourceFile(absPath, text, ts.ScriptTarget.ES2022, false, KIND_BY_EXT[ext]);
  const imports = []; const symbols = []; const reExports = [];
  const exportedNames = new Set();
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push([node.moduleSpecifier.text, node.importClause && node.importClause.isTypeOnly ? 'type' : 'static']);
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) reExports.push([node.moduleSpecifier.text, null]);
      else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const e of node.exportClause.elements) exportedNames.add(e.name.text);
      }
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
        imports.push([node.arguments[0].text, 'dynamic']);
      } else if (ts.isIdentifier(node.expression) && node.expression.escapedText === 'require' && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
        imports.push([node.arguments[0].text, 'require']);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // Top-level symbols (exported or not) — the symbol index.
  for (const st of sf.statements) {
    const mods = st.modifiers || [];
    const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    const push = (name, kind) => { if (name) symbols.push(`${name}|${kind}|${exported ? 1 : 0}`); };
    if (ts.isFunctionDeclaration(st)) push(st.name && st.name.text, 'function');
    else if (ts.isClassDeclaration(st)) push(st.name && st.name.text, 'class');
    else if (ts.isInterfaceDeclaration(st)) push(st.name.text, 'interface');
    else if (ts.isTypeAliasDeclaration(st)) push(st.name.text, 'type');
    else if (ts.isEnumDeclaration(st)) push(st.name.text, 'enum');
    else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) push(d.name.text, 'const');
  }
  // Symbols re-exported via `export { x }` carry no ExportKeyword on their
  // declaration — flip their flag from the export-declaration names.
  for (let i = 0; i < symbols.length; i++) {
    const [n, k] = symbols[i].split('|');
    if (exportedNames.has(n) && symbols[i].endsWith('|0')) symbols[i] = `${n}|${k}|1`;
  }
  // localStorage / save keys referenced as string literals.
  const keys = new Set();
  const keyRe = /localStorage\s*\.\s*(?:get|set)Item\s*\(\s*['"]([^'"]+)['"]/g;
  let m; while ((m = keyRe.exec(text)) !== null) keys.add(m[1]);
  const litRe = /['"](ag-3d-[a-z0-9-]+|ag-hide-ui-v1|iso-world-v2|adventure-game-save)['"]/g;
  while ((m = litRe.exec(text)) !== null) keys.add(m[1]);
  return { imports, reExports, symbols, storageKeys: [...keys].sort() };
}

// ---------------------------------------------------- import resolution ----
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const DEPS = new Set([...Object.keys(PKG.dependencies || {}), ...Object.keys(PKG.devDependencies || {})]);
const RESOLVE_EXTS = ['.ts', '.tsx', '.mts', '.mjs', '.cjs', '.js', '.css', '.json'];
function tryFile(base) {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  // esbuild-style .js suffix on a TS source (simulate.ts dynamic imports):
  // ../src/game/dialogueIntent.js -> dialogueIntent.ts / .tsx
  if (base.endsWith('.js')) {
    const stem = base.slice(0, -3);
    for (const e of ['.ts', '.tsx']) { const c = stem + e; if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; }
  }
  if (base.endsWith('.jsx')) {
    const c = base.slice(0, -4) + '.tsx'; if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  for (const e of RESOLVE_EXTS) { const c = base + e; if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; }
  for (const e of ['.ts', '.tsx', '.mts', '.mjs', '.js']) { const c = path.join(base, 'index' + e); if (fs.existsSync(c)) return c; }
  return null;
}
function resolveImport(fromRel, spec) {
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const base = path.resolve(ROOT, path.dirname(fromRel), spec);
    const hit = tryFile(base);
    return hit ? { to: rel(hit), external: false } : { to: null, external: false };
  }
  if (spec.startsWith('@/')) {
    const hit = tryFile(path.join(ROOT, 'src', spec.slice(2)));
    return hit ? { to: rel(hit), external: false } : { to: null, external: false };
  }
  if (spec.startsWith('src/')) {
    const hit = tryFile(path.join(ROOT, spec));
    return hit ? { to: rel(hit), external: false } : { to: null, external: false };
  }
  const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  return { to: null, external: true, package: pkgName, inPackageJson: DEPS.has(pkgName) };
}

// ------------------------------------------- legacy-audit classification ----
const AUDIT = fs.readFileSync(path.join(ROOT, 'studio', 'LEGACY_AUDIT.md'), 'utf8');
const CLASS_DIRS = ['src/game/engine3d', 'src/game/iso', 'src/game', 'src/game/engine', 'src/game/rendering', 'src/game/shared', 'src/game/dev', 'src/game/worldgen', 'src/game/monsterSprites', 'src/components', 'src'];
function resolveAuditToken(token, section) {
  const clean = token.replace(/^\.\//, '');
  if (clean.startsWith('src/')) return fs.existsSync(path.join(ROOT, clean)) ? clean : null;
  if (clean.startsWith('public/')) return fs.existsSync(path.join(ROOT, clean)) ? clean : null;
  if (clean.includes('/')) {
    for (const d of ['src/game', 'src', 'src/components']) { const c = `${d}/${clean}`; if (fs.existsSync(path.join(ROOT, c))) return c; }
    return null;
  }
  // Bare filename: repo-root server files (audit §2.5) live at the root.
  if (clean.endsWith('.js') && fs.existsSync(path.join(ROOT, clean))) return clean;
  // Bare filename: try the class dirs in order; prefer a slashed token in the
  // same row that resolves to the same basename (handled by the caller).
  for (const d of CLASS_DIRS) { const c = `${d}/${clean}`; if (fs.existsSync(path.join(ROOT, c))) return c; }
  return null;
}
function parseAudit() {
  const out = new Map(); // relPath -> {class, safety, group, wave}
  const notes = [];
  const sections = AUDIT.split(/^### (2\.[1-5]) /m);
  // sections: [pre, '2.1', body, '2.2', body, ...]
  for (let i = 1; i < sections.length; i += 2) {
    const num = sections[i]; const body = sections[i + 1];
    const cls = num === '2.1' ? 'A' : num === '2.2' ? 'B' : num === '2.3' ? 'C' : num === '2.4' ? 'D' : 'E';
    const safety = num === '2.1' ? 'NEVER' : num === '2.2' || num === '2.3' ? 'AFTER-EXTRACTION' : num === '2.4' ? 'WAVE' : 'HOLD';
    for (const line of body.split('\n')) {
      if (!line.startsWith('|')) continue;
      if (/^\|\s*-/.test(line)) continue;
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (!cells.length || /file/i.test(cells[0]) && /depended/i.test(cells[1] || '')) continue;
      let fileCell, group = null, wave = null;
      if (num === '2.1') { fileCell = cells[0]; }
      else if (num === '2.2' || num === '2.3') { fileCell = cells[1] || ''; const g = /^\(?(B\d|C\d)\)?/.exec(cells[0] || ''); group = g ? g[1] : null; }
      else if (num === '2.4') { fileCell = cells[0]; wave = parseInt(cells[1], 10) || null; }
      else { fileCell = cells[0]; }
      const tokens = [...fileCell.matchAll(/`([^`]+)`/g)].map((x) => x[1]);
      // Resolve slashed tokens first so bare duplicates of the same basename
      // (e.g. `barbarian.ts` (= `iso/barbarian.ts`)) dedupe to the slashed one.
      const resolvedBasenames = new Set();
      const ordered = [...tokens.filter((t) => t.includes('/')), ...tokens.filter((t) => !t.includes('/'))];
      for (const tok of ordered) {
        if (!(/\.(ts|tsx|css|html|js)$/.test(tok) || tok.endsWith('/'))) continue;
        if (tok.endsWith('/')) { // asset directory
          if (fs.existsSync(path.join(ROOT, tok))) out.set(tok.replace(/\/$/, ''), { class: cls, safety: safety === 'WAVE' ? `WAVE ${wave}` : safety, group, wave, kind: 'asset-dir' });
          continue;
        }
        const base = tok.split('/').pop();
        if (resolvedBasenames.has(base)) continue;
        const hit = resolveAuditToken(tok, num);
        if (!hit) { notes.push(`audit token unresolvable: §${num} \`${tok}\``); continue; }
        resolvedBasenames.add(base);
        if (out.has(hit) && out.get(hit).class !== cls) { notes.push(`audit token classified twice: ${hit} (${out.get(hit).class} then ${cls})`); continue; }
        out.set(hit, { class: cls, safety: safety === 'WAVE' ? `WAVE ${wave}` : safety, group, wave, kind: /\.(ts|tsx)$/.test(hit) ? 'code' : 'other' });
      }
    }
  }
  return { map: out, notes };
}

// ------------------------------------------------- registry requirements ----
function parseRegistry() {
  const text = fs.readFileSync(path.join(ROOT, 'studio', 'IMPLEMENTATION_REGISTRY.md'), 'utf8');
  const reqs = [];
  const STATUSES = new Set(['COMPLETE AND VERIFIED', 'IMPLEMENTED BUT UNVERIFIED', 'PARTIALLY IMPLEMENTED', 'DOCUMENTED ONLY', 'NOT IMPLEMENTED', 'BLOCKED', 'OBSOLETE OR DUPLICATED']);
  for (const line of text.split('\n')) {
    const m = /^\|\s*([A-Z]\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/.exec(line);
    if (!m) continue;
    const status = m[3].trim();
    if (!STATUSES.has(status)) continue;
    const evidence = m[4].trim();
    const fileRefs = new Set();
    for (const t of [...evidence.matchAll(/`([^`]+)`/g)].map((x) => x[1])) if (/\.(ts|tsx|mjs|cjs|md|json|html)$/.test(t) || t.startsWith('studio/') || t.startsWith('scripts/') || t.startsWith('src/')) fileRefs.add(t);
    for (const t of [...evidence.matchAll(/[\w./-]+\.(?:ts|tsx|mjs|cjs|md|json|html)/g)].map((x) => x[0])) fileRefs.add(t);
    reqs.push({ id: m[1].trim(), title: m[2].trim(), status, evidence, fileRefs: [...fileRefs].sort() });
  }
  return reqs;
}

// ------------------------------------------------------ dashboard data -----
function readDashboard() {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio', 'dashboard', 'dashboard-data.json'), 'utf8'));
  return {
    lastVerifiedCheckpoint: d.lastVerifiedCheckpoint || null,
    activeBuild: d.activeBuild || null,
    buildQueue: d.buildQueue || [],
    measuredBaselines: d.measuredBaselines || {},
    knownIssues: (d.knownIssues || []).map((k) => ({ id: k.id || k.title, title: k.title || k.id, status: k.status || null })),
    buildHistory: (d.buildHistory || []).map((b) => ({ build: b.build, commit: b.commit || null, qualityGateLevel: b.qualityGateLevel ?? null, verifiedAt: b.verifiedAt || null })),
    qualityGates: d.qualityGates || {},
    stageProgress: d.stageProgress || {},
    lastUpdateTimestamp: d.lastUpdateTimestamp || null,
    dataCorrections: d.dataCorrections || [],
  };
}

// ------------------------------------------------------- public/ metadata --
// Runs in a CHILD process (studio/genome/public-scan.mjs): the 31,507-file
// walk costs ~31k filesystem ops, and this process has a per-process budget
// of ~900-1200 ops before write() returns EPERM. The child only reads and
// prints JSON to stdout, so it never hits the budget.
function publicAggregates() {
  // public/ is 31,507 files. Walking it costs ~31k filesystem ops, which
  // exceeds the sandbox write budget when combined with a full scan (the
  // scanner could not write genome.json afterwards). Assets change rarely,
  // so the scanner reads the cached aggregates (studio/genome/
  // public-aggregates.json, refreshed by running public-scan.mjs standalone)
  // and only falls back to a live walk when the cache is missing.
  const cache = path.join(GENOME_DIR, 'public-aggregates.json');
  let pub;
  if (fs.existsSync(cache)) {
    pub = JSON.parse(fs.readFileSync(cache, 'utf8'));
    pub.source = 'cache:studio/genome/public-aggregates.json';
  } else {
    const { execSync } = require('child_process');
    const out = execSync(`node ${path.join(GENOME_DIR, 'public-scan.mjs')}`, { cwd: ROOT, encoding: 'utf8' });
    pub = JSON.parse(out);
    pub.source = 'live-walk:studio/genome/public-scan.mjs';
  }
  if (!pub.diskUsageNote) pub.diskUsageNote = `du -sh public reports 195 MB (block allocation); logical st_size total is ${(pub.totalBytes / 1048576).toFixed(1)} MB.`;
  return pub;
}

// ------------------------------------------------- infrastructure audit ----
const INFRA_STATUS = {
  'scripts/simulate.ts': ['ACTIVE', 'The sim suite (41k+ assertions); run per build vs a pristine baseline.'],
  'scripts/prepare-build-entry.cjs': ['ACTIVE', 'prebuild: injects window.__AG_BUILD into index.html; both build markers live here + App.tsx.'],
  'scripts/autonomous-engine.mjs': ['STALE-RECONCILED', 'BUILD 573 session controller (Oct 12). Session state docs/sessions/current.json is Oct 12 (sequence 2, commit e210225e != HEAD 14491c9f). Depends on git, which is EPERM-blocked. RECONCILED, not deleted: its session-controller role is now the continuation protocol + CONTINUE_ASHFALL.md + this genome. Do not build on top of it.'],
  'scripts/genome.mjs': ['STALE-UNRELATED', 'BUILD 571 "Game Genome" — persistent creative memory (docs/genome/genome.json, Oct 12). Unrelated to the Development Genome; name collision only. Do not mistake it for the genome.'],
  'scripts/brain.mjs': ['STALE', 'BUILD 545 unified brain. Runs (exit 0, verified 2026-11-07) but reads stale data: build marker 967 (tree index.html, not the 1030 marker), "Git: unavailable", queue TASK-004 "Movement speed tuning" (Oct-era). Not connected to the registry, the genome, or the orchestrator.'],
  'scripts/central-brain.mjs': ['STALE', 'BUILD 566/567 coordinator of brain/worker/consistency-audit/reuse-index/discover-tasks. Oct 12. Coordinates stale systems; not connected to the genome or orchestrator. Do not run — it would coordinate stale state.'],
  'scripts/worker.mjs': ['STALE', 'Autonomous game-evolution worker (permanent, resumable). Oct 12. No state file found in the repo; not run since Oct. Its loop is superseded by the §49/§50 procedure + the genome task loop (run-cycle.mjs).'],
  'scripts/discover-tasks.mjs': ['STALE', 'Autonomous task discovery. Output docs/DISCOVERED_TASKS.md is Oct-era. The registry + genome queue are the live task sources now.'],
  'scripts/consistency-audit.mjs': ['STALE', 'BUILD 556 gameplay consistency auditor (duplicate NPC names, dialogue anchors, quest givers). Oct 12. Not run in this session; its checks are not wired into any gate.'],
  'scripts/reuse-index.mjs': ['STALE', 'BUILD 564 source reuse engine (search own code before writing new systems). Oct 12. No persisted index found. The genome query.mjs now provides depends-on / blast-radius / duplicates.'],
  'scripts/gen-code-index.mjs': ['STALE', 'Codebase index generator. Output docs/CODE_INDEX.md is Oct-era. The genome index supersedes it (machine-readable, incremental, queryable).'],
  'scripts/safe-run.mjs': ['TOOLING', 'Safe command runner with bounded retry (BUILD 538). Generic utility, no state.'],
  'scripts/playtest.ts': ['SIM-TOOLING', 'Gameplay tester runner (BUILD 532). Used by gameplayAgent (Wave 2, sim-only).'],
  'scripts/benchmark.ts': ['TOOLING', 'Benchmark harness (BUILD 657). Outputs to work/experiments/ (not present in tree).'],
  'scripts/sim-lab.ts': ['SIM-TOOLING', 'Sim lab (Oct-era). Part of the sim/test tooling.'],
  'scripts/stress.ts': ['SIM-TOOLING', 'Stress harness (Oct-era). Part of the sim/test tooling.'],
  'scripts/render-mosslight.ts': ['RENDER-TOOLING', 'Renders Mosslight layouts (Oct 14). One-off render tooling.'],
  'scripts/render-town-layouts.ts': ['RENDER-TOOLING', 'Renders town layouts (Oct 14). One-off render tooling.'],
  'scripts/install-rpg-equipment.mjs': ['ASSET-TOOLING', 'RPG equipment asset install/check (package.json rpg:assets:*).'],
  'scripts/bake-grass-meshes.cjs': ['ASSET-TOOLING', 'Bakes grass meshes (Nov 1). Asset pipeline tooling.'],
  'scripts/gen-monster-sprite-css.mjs': ['ASSET-TOOLING', 'Generates monster sprite CSS (Sep 30). Asset pipeline tooling.'],
  'scripts/play944.cjs': ['TEST-TOOLING', 'Playtest script (Oct 21). One-off test tooling.'],
  'scripts/verify-rotation-944.ts': ['TEST-TOOLING', 'Rotation verification (Oct 21). One-off test tooling.'],
};
function headerPurpose(absPath, text) {
  const lines = text.split('\n').slice(0, 8);
  const bits = [];
  for (const l of lines) {
    const s = l.replace(/^\s*(\/\/|#|\*)\s?/, '').trim();
    if (s && !s.startsWith('import') && !s.startsWith('export') && !s.startsWith('const ') && !s.startsWith('from ')) bits.push(s);
    if (bits.length >= 2) break;
  }
  return bits.join(' ') || null;
}
function auditInfrastructure(files) {
  const out = [];
  const scriptFiles = files.filter((f) => f.path.startsWith('scripts/') && !f.path.startsWith('scripts/sim/'));
  for (const f of scriptFiles) {
    const text = fs.readFileSync(path.join(ROOT, f.path), 'utf8');
    const [status, note] = INFRA_STATUS[f.path] || ['UNVERIFIED', 'No run recorded in this session and no status rule yet; Oct-era unless its mtime says otherwise.'];
    out.push({ path: f.path, bytes: f.size, lines: f.lines, mtime: f.mtime, purpose: headerPurpose(path.join(ROOT, f.path), text), status, note });
  }
  // docs/ state (the Oct-era automation's home).
  const docs = [];
  for (const p of walkDir(path.join(ROOT, 'docs'))) {
    const st = fs.statSync(p);
    docs.push({ path: rel(p), bytes: st.size, mtime: st.mtimeMs });
  }
  const genome571 = docs.find((d) => d.path === 'docs/genome/genome.json');
  const sessions = docs.find((d) => d.path === 'docs/sessions/current.json');
  out.push({ path: 'docs/', bytes: docs.reduce((a, d) => a + d.bytes, 0), lines: null, mtime: null, purpose: 'Oct-era automation state (brain, sessions, genome-571, discovered tasks).', status: 'STALE', note: `All Oct 12-20. docs/genome/genome.json (${genome571 ? genome571.bytes : '?'} bytes, BUILD 571 creative memory) is UNRELATED to the Development Genome. docs/sessions/current.json (${sessions ? sessions.bytes : '?'} bytes) is sequence 2, Oct 12, commit e210225e != HEAD.` });
  return { scripts: out, docsFiles: docs.length };
}

// ---------------------------------------------------------- build markers ---
function buildMarkers() {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8');
  const pre = fs.readFileSync(path.join(ROOT, 'scripts', 'prepare-build-entry.cjs'), 'utf8');
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const appM = /const BUILD_NUMBER = '(\d+)'/.exec(app);
  const preM = /__AG_BUILD=\\?"(\d+)\\?"/.exec(pre);
  const idxM = /__AG_BUILD="(\d+)"/.exec(idx);
  const a = appM ? appM[1] : null; const p = preM ? preM[1] : null; const i = idxM ? idxM[1] : null;
  return { appTsx: a, prepareBuildEntry: p, indexHtml: i, agree: a !== null && a === p, indexHtmlStale: i !== null && i !== a, note: i !== null && i !== a ? 'index.html in the tree is NOT the served file — scripts/prepare-build-entry.cjs rewrites it from its template on every build; the live marker is prepare-build-entry.cjs.' : null };
}

// ------------------------------------------------------------------ main ----
function main() {
  console.error('PHASE start');
  // Incremental reuse reads the previous genome from genome.json + shards/.
  const prevSharded = !FULL ? readShardedGenome() : null;
  const prev = prevSharded ? prevSharded.meta : null;
  const prevFiles = new Map((prevSharded ? prevSharded.files : []).map((f) => [f.path, f]));

  // 1. Enumerate in-scope files.
  const scopeDirs = ['src', 'scripts', 'studio', 'tests'];
  const scopeFiles = [];
  for (const d of scopeDirs) for (const p of walkDir(path.join(ROOT, d))) scopeFiles.push(rel(p));
  // The genome does not index its own generated output (genome.json,
  // shards/*.json, public-aggregates.json, cycle-log.json) — otherwise every
  // scan adds the previous scan's output files as nodes and the count grows
  // by itself. The genome's own .mjs source IS indexed.
  for (let i = scopeFiles.length - 1; i >= 0; i--) {
    const p = scopeFiles[i];
    if (p.startsWith('studio/genome/shards/') || (p.startsWith('studio/genome/') && (p.endsWith('.json') || p.endsWith('.tmp') || p.endsWith('.bak')))) scopeFiles.splice(i, 1);
  }
  for (const f of ['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'server.js', 'world_generator.js', 'persistence.js']) if (fs.existsSync(path.join(ROOT, f))) scopeFiles.push(f);
  scopeFiles.sort();

  // 2. Fingerprint + parse (incremental).
  const files = []; let nParsed = 0; let nReused = 0; const deleted = [];
  for (const prevPath of prevFiles.keys()) if (!scopeFiles.includes(prevPath)) deleted.push(prevPath);
  for (const relPath of scopeFiles) {
    const abs = path.join(ROOT, relPath);
    const st = fs.statSync(abs);
    const buf = fs.readFileSync(abs);
    const hash = fp(buf);
    const prevNode = prevFiles.get(relPath);
    if (prevNode && prevNode.hash === hash) {
      nReused += 1;
      files.push({ ...prevNode, mtime: st.mtimeMs });
      continue;
    }
    nParsed += 1;
    const text = buf.toString('utf8');
    const node = { path: relPath, size: st.size, lines: text.split('\n').length, mtime: st.mtimeMs, hash, imports: [], reExports: [], symbols: [], storageKeys: [] };
    if (PARSE_EXTS.has(path.extname(relPath))) {
      try { Object.assign(node, parseCodeFile(abs, text)); } catch (e) { node.parseError = String(e && e.message || e); }
    }
    files.push(node);
  }
  const byPath = new Map(files.map((f) => [f.path, f]));
  console.error(`PHASE parsed files=${files.length} parsed=${nParsed} reused=${nReused}`);

  // 3. Import graph (resolved edges, dependents, unresolved).
  // Edges are compact arrays: internal [from, to, kind]; external
  // [from, null, kind, spec] (package derivable from spec). The resolved
  // target is also stored back into the import tuple ([spec, kind, to]).
  const edges = []; const unresolved = [];
  for (const f of files) {
    for (const imp of f.imports) {
      const r = resolveImport(f.path, imp[0]);
      if (r.external) { imp[2] = null; imp[3] = r.package; edges.push([f.path, null, imp[1], imp[0]]); continue; }
      if (!r.to) { imp[2] = null; unresolved.push({ from: f.path, spec: imp[0], kind: imp[1] }); continue; }
      imp[2] = r.to;
      edges.push([f.path, r.to, imp[1]]);
    }
    for (const re of f.reExports) {
      const r = resolveImport(f.path, re[0]);
      if (r.to) { re[1] = r.to; edges.push([f.path, r.to, 're-export']); }
      else { re[1] = null; unresolved.push({ from: f.path, spec: re[0], kind: 're-export' }); }
    }
  }
  const dependents = new Map();
  for (const e of edges) if (e[1]) { if (!dependents.has(e[1])) dependents.set(e[1], []); dependents.get(e[1]).push(e[0]); }
  for (const f of files) { f.dependentsCount = (dependents.get(f.path) || []).length; }

  // 4. Circular imports (DFS on resolved repo edges).
  const adj = new Map();
  for (const e of edges) if (e[1]) { if (!adj.has(e[0])) adj.set(e[0], new Set()); adj.get(e[0]).add(e[1]); }
  const cycles = []; const seenCycle = new Set();
  const WHITE = 0, GREY = 1, BLACK = 2; const color = new Map(); const stack = [];
  const dfs = (u) => {
    color.set(u, GREY); stack.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GREY) {
        const cyc = [...stack.slice(stack.indexOf(v)), v];
        const key = [...cyc].sort().join('|');
        if (!seenCycle.has(key)) { seenCycle.add(key); cycles.push(cyc); }
      } else if (!color.has(v)) dfs(v);
    }
    stack.pop(); color.set(u, BLACK);
  };
  for (const f of files) if (!color.has(f.path)) dfs(f.path);

  // 5. Audit classification + validation.
  const { map: auditMap, notes: auditNotes } = parseAudit();
  console.error(`PHASE audit parsed map=${auditMap.size} notes=${auditNotes.length}`);
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const unclassified = []; const missingClassified = [];
  for (const f of files) {
    if (!/\.(ts|tsx)$/.test(f.path)) continue;
    if (!f.path.startsWith('src/')) continue;
    const c = auditMap.get(f.path);
    if (!c) { unclassified.push(f.path); continue; }
    f.auditClass = c.class; f.auditSafety = c.safety; f.auditGroup = c.group || null; f.auditWave = c.wave || null;
    if (c.kind === 'code') counts[c.class] += 1;
  }
  for (const [p, c] of auditMap) {
    if (c.kind === 'code' && !byPath.has(p)) missingClassified.push(p);
    if (c.kind === 'code' && !counts[c.class] && c.class) { /* counted above */ }
  }
  const expected = { A: 45, B: 104, C: 56, D: 41, E: 2 };
  const validation = {
    auditCounts: counts, auditExpected: expected,
    auditCountsMatch: Object.keys(expected).every((k) => counts[k] === expected[k]),
    srcTsxCount: files.filter((f) => f.path.startsWith('src/') && /\.(ts|tsx)$/.test(f.path)).length,
    auditTotal: 45 + 104 + 56 + 41 + 2,
    unclassified, missingClassified, auditNotes,
    unresolvedImports: unresolved.length,
    cyclesFound: cycles.length,
  };

  // 6. Requirements, dashboard, markers, public, infrastructure.
  const requirements = parseRegistry();
  const reqCounts = {};
  for (const r of requirements) reqCounts[r.status] = (reqCounts[r.status] || 0) + 1;
  // Link requirement fileRefs to real files by basename where possible.
  const byBasename = new Map();
  for (const f of files) { const b = f.path.split('/').pop(); if (!byBasename.has(b)) byBasename.set(b, []); byBasename.get(b).push(f.path); }
  for (const r of requirements) {
    r.files = [];
    for (const ref of r.fileRefs) {
      if (byPath.has(ref)) { r.files.push(ref); continue; }
      const base = ref.split('/').pop();
      const hits = byBasename.get(base) || [];
      if (hits.length === 1) r.files.push(hits[0]);
      else if (hits.length > 1) r.files.push(...hits);
    }
    r.files = [...new Set(r.files)].sort();
    delete r.fileRefs;
  }
  const dashboard = readDashboard();
  const markers = buildMarkers();
  const pub = publicAggregates();
  console.error(`PHASE dashboard+markers+public done files=${pub.totalFiles}`);
  const infra = auditInfrastructure(files);
  console.error('PHASE infra done');

  // 7. Duplicates (seeded from the legacy audit §5.1 — data, not prose).
  const duplicates = [
    { id: 'dup-renderers', job: 'Rendering', files: ['src/App.tsx', 'src/game/iso/IsoFieldView.tsx', 'src/game/engine/ThreeDGameView.tsx', 'src/game/engine3d/Engine3DWorldView.tsx'], note: 'Three live renderers + the 3D demo. (c) consumes App live sim; (d) has its own demo world.' },
    { id: 'dup-pathfinders', job: 'Tile A* pathfinding', files: ['src/game/npcNavigation.ts', 'src/game/engine3d/townsfolk3d.ts', 'src/game/engine3d/playerPath.ts'], note: 'Three pathfinders + flowField.ts (Wave 2) + fearPath.ts. Extraction priority 3: one tile-A* core.' },
    { id: 'dup-stamina', job: 'Stamina / sprint', files: ['src/game/stamina.ts', 'src/game/engine3d/sprint.ts'], note: '2.5D drain 14/s regen 10/18/s relock 30 vs 3D 3.15/5.04 u/s drain 20/s regen 12/s rearm gate.' },
    { id: 'dup-interiors', job: 'Interior systems', files: ['src/game/interiors.ts', 'src/game/engine3d/interiors.ts'], note: '2.5D layout gen vs 3D hut doors/exits/walkability.' },
    { id: 'dup-ground-detail', job: 'Ground detail', files: ['src/game/groundDetail.ts', 'src/game/engine3d/groundDetail3d.ts'], note: '2.5D vs 3D ground detail.' },
    { id: 'dup-worldgen', job: 'World generation', files: ['src/game/worldMap.ts', 'src/game/landscape.ts', 'src/game/wfc.ts'], note: 'Live worldMap/landscape vs sim-only WFC (Wave 3) vs orphaned terrainNoise/chunkBuilder (Wave 2).' },
    { id: 'dup-minimap', job: 'Minimap', files: ['src/game/minimapRadar.ts', 'src/game/minimapIcons.ts'], note: 'Radar dots vs icons; both live in App.' },
    { id: 'dup-char-art', job: 'Character art', files: ['src/game/iso/isoSprites.ts', 'src/game/engine3d/villagers.ts'], note: 'LPC paper-doll (2.5D) vs Minecraft figures (3D). Plus unused Mana Seed set (Wave 1 asset).' },
    { id: 'dup-npc-sim', job: 'NPC simulation', files: ['src/game/townsfolk.ts', 'src/game/engine3d/townsfolk3d.ts'], note: '2.5D 47 NPCs + schedules vs 3D roster + schedules (imports only a slice of townsfolk.ts).' },
    { id: 'dup-dialogue', job: 'Dialogue stack', files: ['src/game/dialogue.ts', 'src/game/dialogueIntent.ts', 'src/game/topicMachines.ts', 'src/game/conversationMemory.ts'], note: 'Overlapping intent/topic handling; extract as one stack.' },
    { id: 'dup-saves', job: 'Save systems', files: ['src/game/persistence.ts', 'src/game/engine3d/townsfolk3d.ts'], note: '2.5D persistence.ts (v2 format) vs 3D ag-3d-* keys. G16 gap: ag-3d-* keys are unversioned.' },
    { id: 'dup-cache-metrics', job: 'Bounded cache / frame metrics', files: ['src/game/iso/boundedCache.ts', 'src/game/rendering/boundedCache.ts'], note: 'RESOLVED already — iso/* are deprecated shims over rendering/* (Wave 1). Do not create a third copy.' },
  ];

  // 8. Queue (from dashboard data + registry Q-items), blockers, gaps.
  // Dashboard queue items carry {build, commit, description, status} —
  // not id/title — so map build -> id and description -> title.
  const queue = (dashboard.buildQueue || []).map((q) => ({ id: q.id || (q.build ? `BUILD ${q.build}` : q.title), title: q.title || q.description || q.id, status: q.status || null }));
  const blockers = requirements.filter((r) => r.status === 'BLOCKED').map((r) => ({ id: r.id, title: r.title, evidence: r.evidence }));
  const gaps = [];
  if (unclassified.length) gaps.push({ kind: 'unclassified-src-files', files: unclassified, note: 'Source files with no legacy-audit class. The audit claims all 248 are classified.' });
  if (missingClassified.length) gaps.push({ kind: 'classified-but-missing', files: missingClassified, note: 'Files the audit classifies but that do not exist on disk.' });
  if (unresolved.length) gaps.push({ kind: 'unresolved-imports', count: unresolved.length, note: 'Imports that do not resolve to a repo file or a package in package.json. Expected: three (fbxHouseModels.ts, Wave 1).' });
  if (cycles.length) gaps.push({ kind: 'circular-imports', count: cycles.length, note: 'Import cycles in the graph. Expected: IsoFieldView <-> App at minimum.' });
  gaps.push({ kind: 'dashboard-wiring', note: 'Dashboard artifact still carries hard-coded data; not wired to studio/dashboard/dashboard-data.json (registry D2, PARTIALLY IMPLEMENTED).' });
  gaps.push({ kind: 'build-1030-uncommitted', note: 'BUILD 1030 (7 files incl. new playerPath.ts) is implemented + code-verified but uncommitted; git cannot write (EPERM). The genome indexes the working tree as it is.' });
  gaps.push({ kind: 'env-fs-op-budget', note: 'Per-process filesystem-operation budget (~900-1200 ops at session start, draining over the session to ~1 op at a time — verified 2026-11-07: after ~1,200 file reads in one process, write() returns EPERM; a 0-op write still succeeds but 10 reads + a write fails). Long-running tools must delegate writes (and 31k-file walks) to fresh child processes — this scanner does so via public-scan.mjs + write-file.mjs — and SHARD their output (genome.json is a meta index; file nodes live in shards/*.json) so each piece fits through the harness file API. This is a SEPARATE mechanism from the git EPERM (0444 temp objects) and the vite copy_file_range budget.' });
  gaps.push({ kind: 'no-embeddings', note: 'No semantic-search / embedding index. Retrieval is by registry ID, import graph, and keyword query (query.mjs).' });
  gaps.push({ kind: 'public-asset-graph-incomplete', note: 'public/ is indexed as directory aggregates only. Which of the 31,507 files are actually used needs a runtime asset trace, not static grep (audit §5.4).' });

  const communication = [
    { from: 'registry', to: 'genome', via: 'scanner parses studio/IMPLEMENTATION_REGISTRY.md summary table (88 requirements)', status: 'ACTIVE' },
    { from: 'legacy-audit', to: 'genome', via: 'scanner parses studio/LEGACY_AUDIT.md §2 tables (248 files, A-E)', status: 'ACTIVE' },
    { from: 'dashboard-data', to: 'genome', via: 'scanner reads studio/dashboard/dashboard-data.json (baselines, known issues, queue, last checkpoint)', status: 'ACTIVE' },
    { from: 'genome', to: 'orchestrator', via: 'studio/genome/genome.json is the shared index; run-cycle.mjs + query.mjs read it', status: 'ACTIVE' },
    { from: 'genome', to: 'advanced-memory', via: 'query.mjs is the retrieval index (depends-on / blast-radius / implements / duplicates / remove)', status: 'ACTIVE' },
    { from: 'verification', to: 'registry+dashboard', via: 'VERIFICATION_INTELLIGENCE pipeline (GENERATED→APPROVED) with evidence per status; parent-run procedure, not yet automated', status: 'PROCEDURE' },
    { from: 'autonomous-engine.mjs', to: 'genome', via: 'NONE — reconciled, not connected. Its session state (docs/sessions/current.json, Oct 12) is stale and is not a live source.', status: 'RECONCILED' },
    { from: 'brain.mjs/central-brain/worker/discover-tasks', to: 'genome', via: 'NONE — stale Oct-era systems reading their own docs/ state. Not connected; recorded as a gap, not a path.', status: 'NOT-CONNECTED' },
    { from: 'genome', to: 'genome', via: 'scanner.mjs is the only writer of genome.json + shards/*.json; one genome, one registry, one memory. The scanner re-reads the registry/audit/dashboard on every run so the index cannot drift from its sources.', status: 'ENFORCED' },
  ];

  const totalSymbols = files.reduce((a, f) => a + (f.symbols ? f.symbols.length : 0), 0);
  const totalEdges = edges.filter((e) => e[1]).length;
  // Shard the file nodes by directory (see SHARD_DEFS). genome.json is the
  // meta index; the nodes live in shards/*.json and the edges in shards/edges.json.
  const shardFiles = {};
  for (const d of SHARD_DEFS) shardFiles[d.name] = [];
  for (const f of files) shardFiles[shardFor(f.path)].push(f);
  const genome = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    generatedBy: 'studio/genome/scanner.mjs',
    headCommit: (() => { try { const { execSync } = require('child_process'); return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } })(),
    scan: { durationMs: elapsed(), full: FULL || !prev, filesSeen: scopeFiles.length, filesParsed: nParsed, filesReused: nReused, filesDeleted: deleted, deletedFiles: deleted, writer: 'child-process studio/genome/write-file.mjs (per-process fs-op budget ~900-1200, draining to ~1); genome.json is the meta index, file nodes live in shards/*.json' },
    stats: { srcTsxFiles: validation.srcTsxCount, totalFiles: files.length, totalSymbols, totalImportEdges: totalEdges, unresolvedImports: unresolved.length, cycles: cycles.length, requirements: requirements.length, requirementCounts: reqCounts, auditCounts: counts },
    shards: { files: SHARD_DEFS.map((d) => d.name), edges: 'edges' },
    requirements, queue, blockers,
    baselines: dashboard.measuredBaselines,
    knownIssues: dashboard.knownIssues,
    lastVerifiedCheckpoint: dashboard.lastVerifiedCheckpoint,
    buildHistory: dashboard.buildHistory,
    duplicates, cycles, unresolvedImports: unresolved,
    infrastructure: infra.scripts,
    docsFiles: infra.docsFiles,
    markers, publicAssets: pub, communication, gaps, validation,
  };

  // 9. Atomic write via a FRESH CHILD process (studio/genome/write-file.mjs).
  // This process has done ~500+ filesystem ops (walk + stat + read of ~470
  // files) and has spent its per-process budget — a direct writeFileSync here
  // returns EPERM (verified 2026-11-07). The child has a full budget: it
  // writes tmp, validates the JSON, backs up the old file, renames.
  // --shard <name> prints one shard as compact JSON to stdout instead
  // (the harness file API path when the exec budget is spent).
  log(`GENOME OK  ${genome.generatedAt}`);
  log(`  head: ${genome.headCommit || 'unknown (git rev-parse failed)'}`);
  log(`  scan: ${FULL || !prev ? 'FULL' : 'incremental'} in ${elapsed()}ms — ${scopeFiles.length} files seen, ${nParsed} parsed, ${nReused} reused, ${deleted.length} deleted`);
  log(`  index: ${files.length} file nodes, ${totalSymbols} symbols, ${totalEdges} resolved import edges, ${unresolved.length} unresolved imports, ${cycles.length} cycles`);
  log(`  audit: A=${counts.A} B=${counts.B} C=${counts.C} D=${counts.D} E=${counts.E} (expected 45/104/56/41/2) — ${validation.auditCountsMatch ? 'MATCH' : 'MISMATCH'}`);
  log(`  registry: ${requirements.length} requirements — ${Object.entries(reqCounts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  log(`  markers: App.tsx=${markers.appTsx} prepare-build-entry=${markers.prepareBuildEntry} index.html=${markers.indexHtml} agree=${markers.agree}`);
  log(`  public: ${pub.totalFiles} files, ${(pub.totalBytes / 1048576).toFixed(1)} MB, walked in ${pub.walkMs}ms`);
  if (auditNotes.length) log(`  audit notes (${auditNotes.length}):\n    - ${auditNotes.slice(0, 10).join('\n    - ')}`);
  if (unclassified.length) log(`  UNCLASSIFIED src files (${unclassified.length}): ${unclassified.join(', ')}`);
  if (missingClassified.length) log(`  CLASSIFIED BUT MISSING (${missingClassified.length}): ${missingClassified.join(', ')}`);
  if (cycles.length) log(`  CYCLES (${cycles.length}): ${cycles.slice(0, 5).map((c) => c.join(' -> ')).join(' | ')}`);
  if (unresolved.length) log(`  UNRESOLVED (${unresolved.length}): ${unresolved.slice(0, 10).map((u) => `${u.from} -> ${u.spec}`).join(' | ')}`);
  if (!EMIT_STDOUT && !SHARD && fs.existsSync(GENOME_FILE)) log(`  genome.json: ${(fs.statSync(GENOME_FILE).size / 1024).toFixed(0)} KB`);
  if (!validation.auditCountsMatch || unclassified.length || missingClassified.length) {
    console.error('VALIDATION FAILED — see genome.json validation section');
    process.exit(1);
  }
  if (SHARD) {
    let out;
    if (SHARD === 'meta') out = genome;
    else if (SHARD === 'edges') out = edges;
    else if (shardFiles[SHARD]) out = shardFiles[SHARD];
    else { console.error(`Unknown shard "${SHARD}". Known: meta, edges, ${Object.keys(shardFiles).join(', ')}`); process.exit(1); }
    const shardText = JSON.stringify(out);
    process.stdout.write(shardText);
    console.error(`PHASE shard ${SHARD} bytes=${shardText.length}`);
    return;
  }
  if (EMIT_STDOUT) {
    // Full genome as one compact JSON (meta + files + edges inline).
    process.stdout.write(JSON.stringify({ ...genome, files, edges }));
    return;
  }
  const { execSync } = require('child_process');
  const writeOne = (file, text) => {
    const out = execSync(`node ${path.join(GENOME_DIR, 'write-file.mjs')} ${file}`, { cwd: ROOT, encoding: 'utf8', input: text });
    log(`  ${out.trim()}`);
  };
  writeOne(GENOME_FILE, JSON.stringify(genome, null, 1));
  if (!fs.existsSync(SHARD_DIR)) fs.mkdirSync(SHARD_DIR, { recursive: true });
  for (const name of Object.keys(shardFiles)) writeOne(path.join(SHARD_DIR, name + '.json'), JSON.stringify(shardFiles[name]));
  writeOne(path.join(SHARD_DIR, 'edges.json'), JSON.stringify(edges));
  const written = JSON.parse(fs.readFileSync(GENOME_FILE, 'utf8'));
  if (written.version !== '1.0.0') throw new Error('genome.json failed post-write verification');
  log(`  shards: ${Object.keys(shardFiles).map((n) => `${n}=${shardFiles[n].length}`).join(', ')} edges=${edges.length}`);
}

try { main(); } catch (e) { console.error('SCANNER FATAL: ' + (e && e.stack || e)); process.exit(1); }
