// execution.test.mjs — standalone asserts for execution.mjs.
// Run: node execution.test.mjs  (throws on the first failure, exit 1;
// silent + exit 0 when all pass). Numbers are the real 1062–1065 runs,
// not synthetic: Engine3DWorldView.tsx is 6,638 lines; builds 1062–1064
// put 232 added / 38 deleted into it; the J-1 diff holds 14 hunks in it
// made as ~6 edit calls.

import {
  WARN_FILE_HUNKS, FLAG_FILE_HUNKS, HOT_FILE_BUILDS, WARN_EDIT_CALLS, REPEAT_EDIT_CALLS,
  FOUNDATION_BASELINE,
  parseNumstat, parseHunks, executionMetrics, bottleneckFile, executionVerdict,
  productivityRecord, compareToBaseline, interventionPlan,
} from './execution.mjs';

let passed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: got ${a}, want ${e}`);
  passed += 1;
}
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
}

// --- parseNumstat ---
eq(parseNumstat('68\t6\tsrc/game/engine3d/Engine3DWorldView.tsx\n10\t3\tsrc/game/engine3d/founders.ts\n'),
  [{ file: 'src/game/engine3d/Engine3DWorldView.tsx', added: 68, deleted: 6 },
   { file: 'src/game/engine3d/founders.ts', added: 10, deleted: 3 }], 'numstat parses two files');
eq(parseNumstat('-\t-\tpublic/x.png\n'), [{ file: 'public/x.png', added: 0, deleted: 0 }], 'numstat binary file');
eq(parseNumstat(''), [], 'numstat empty');
eq(parseNumstat('garbage line\n'), [], 'numstat skips garbage');

// --- parseHunks ---
const diff = [
  'diff --git a/src/game/engine3d/Engine3DWorldView.tsx b/src/game/engine3d/Engine3DWorldView.tsx',
  '@@ -134,6 +134,13 @@ import x',
  ' context',
  '@@ -2188,6 +2195,10 @@ function View',
  ' context',
  'diff --git a/src/game/engine3d/founders.ts b/src/game/engine3d/founders.ts',
  '@@ -10,3 +10,5 @@ founders',
  ' context',
].join('\n');
eq(parseHunks(diff), { 'src/game/engine3d/Engine3DWorldView.tsx': 2, 'src/game/engine3d/founders.ts': 1 }, 'hunks counted per file');
eq(parseHunks(''), {}, 'hunks empty');

// --- executionMetrics ---
const m = executionMetrics({
  files: parseNumstat('170\t40\tsrc/game/engine3d/Engine3DWorldView.tsx\n62\t10\tsrc/game/engine3d/founders.ts\n'),
  hunks: { 'src/game/engine3d/Engine3DWorldView.tsx': 14, 'src/game/engine3d/founders.ts': 3 },
  editCalls: { 'src/game/engine3d/Engine3DWorldView.tsx': 6, 'src/game/engine3d/founders.ts': 1 },
  durationMs: 1500000,
});
eq(m.filesChanged, 2, 'metrics filesChanged');
eq(m.linesAdded, 232, 'metrics linesAdded');
eq(m.linesDeleted, 50, 'metrics linesDeleted');
eq(m.totalHunks, 17, 'metrics totalHunks');
eq(m.topFile, 'src/game/engine3d/Engine3DWorldView.tsx', 'metrics topFile');
eq(m.topHunks, 14, 'metrics topHunks');
eq(m.topEditFile, 'src/game/engine3d/Engine3DWorldView.tsx', 'metrics topEditFile');
eq(m.topEditCalls, 6, 'metrics topEditCalls');
eq(m.durationMs, 1500000, 'metrics durationMs');

// --- bottleneckFile: the real J-1 shape flags ---
const j1 = executionMetrics({
  files: parseNumstat('170\t40\tsrc/game/engine3d/Engine3DWorldView.tsx\n'),
  hunks: { 'src/game/engine3d/Engine3DWorldView.tsx': 14 },
  editCalls: { 'src/game/engine3d/Engine3DWorldView.tsx': 6 },
});
const b1 = bottleneckFile(j1);
ok(b1 !== null && b1.level === 'flag', 'J-1 shape (14 hunks) flags');
ok(b1.reasons.some((r) => r.includes('14 hunks')), 'J-1 reason names the 14 hunks');
ok(b1.reasons.some((r) => r.includes('edited 6 times')), 'J-1 reason names the 6 edits');

// --- thresholds: boundaries ---
const warnShape = executionMetrics({ hunks: { 'src/a.ts': WARN_FILE_HUNKS } });
eq(bottleneckFile(warnShape).level, 'warn', `${WARN_FILE_HUNKS} hunks warns`);
const belowWarn = executionMetrics({ hunks: { 'src/a.ts': WARN_FILE_HUNKS - 1 } });
eq(bottleneckFile(belowWarn), null, `${WARN_FILE_HUNKS - 1} hunks is ok`);
const flagShape = executionMetrics({ hunks: { 'src/a.ts': FLAG_FILE_HUNKS } });
eq(bottleneckFile(flagShape).level, 'flag', `${FLAG_FILE_HUNKS} hunks flags`);
const belowFlag = executionMetrics({ hunks: { 'src/a.ts': FLAG_FILE_HUNKS - 1 } });
eq(bottleneckFile(belowFlag).level, 'warn', `${FLAG_FILE_HUNKS - 1} hunks warns, not flags`);

// --- edit-call thresholds: 4 edits is a HARD STOP (flag), 3 warns ---
const editsWarn = executionMetrics({ editCalls: { 'src/a.ts': WARN_EDIT_CALLS } });
eq(bottleneckFile(editsWarn).level, 'warn', `${WARN_EDIT_CALLS} edits warns (one below the hard stop)`);
const editsFlag = executionMetrics({ editCalls: { 'src/a.ts': REPEAT_EDIT_CALLS } });
eq(bottleneckFile(editsFlag).level, 'flag', `${REPEAT_EDIT_CALLS} edits is the hard stop (flag)`);
const editsOk = executionMetrics({ editCalls: { 'src/a.ts': WARN_EDIT_CALLS - 1 } });
eq(bottleneckFile(editsOk), null, `${WARN_EDIT_CALLS - 1} edits is ok`);

// --- hot file across builds: 1062, 1063, 1064 all touched Engine3DWorldView.tsx ---
const hot = executionMetrics({ hunks: { 'src/other.ts': 2 } });
const bHot = bottleneckFile(hot, [
  ['src/game/engine3d/Engine3DWorldView.tsx', 'src/game/engine3d/founders.ts'],
  ['src/game/engine3d/Engine3DWorldView.tsx'],
  ['src/game/engine3d/Engine3DWorldView.tsx', 'src/game/engine3d/construction.ts'],
]);
ok(bHot !== null && bHot.level === 'warn', 'file in 3 consecutive builds is a hot file');
ok(bHot.reasons.some((r) => r.includes('hot file')), 'hot-file reason named');
const notHot = bottleneckFile(hot, [
  ['src/game/engine3d/Engine3DWorldView.tsx'],
  ['src/game/engine3d/founders.ts'],
  ['src/game/engine3d/Engine3DWorldView.tsx'],
]);
eq(notHot, null, 'file in 2 of 3 builds is not hot');

// --- balanced task is ok ---
const balanced = executionMetrics({
  hunks: { 'src/a.ts': 2, 'src/b.ts': 2, 'src/c.ts': 2, 'src/d.ts': 2, 'src/e.ts': 2 },
  editCalls: { 'src/a.ts': 1, 'src/b.ts': 1 },
});
eq(executionVerdict(balanced).level, 'ok', 'balanced task is ok');
eq(executionVerdict(balanced).reasons, [], 'balanced task has no reasons');

// --- verdict passes the bottleneck through ---
eq(executionVerdict(j1).level, 'flag', 'verdict flags the J-1 shape');
eq(executionVerdict(executionMetrics({})).level, 'ok', 'empty metrics is ok');

// --- productivity: a faster build that delivers less is not an improvement ---
const rec = productivityRecord({ taskId: '0x06', durationMs: 1200000, featuresCompleted: 3, testsPassed: 110, regressions: 0, filesChanged: 6, topHunks: 5, topEditCalls: 2, functionality: 'lumberjack carries logs to storage; builder builds a hut; a resident arrives' });
eq(rec.taskId, '0x06', 'productivity record keeps the task id');
eq(rec.featuresCompleted, 3, 'productivity record keeps the feature count');
const cmp = compareToBaseline(rec);
ok(cmp.faster === true && cmp.durationDeltaMs === 1200000 - FOUNDATION_BASELINE.avgDurationMs, 'faster build is faster by the baseline delta');
eq(cmp.durationPct, Math.round(((1200000 - 1511000) / 1511000) * 100), 'duration percent is computed from the baseline');
ok(cmp.regressionFree === true && cmp.improvement === true, 'faster + regression-free is an improvement');
const slow = productivityRecord({ taskId: '0x06', durationMs: 1800000, featuresCompleted: 3, testsPassed: 110, regressions: 0, filesChanged: 6, topHunks: 5, topEditCalls: 2 });
ok(compareToBaseline(slow).faster === false && compareToBaseline(slow).improvement === false, 'slower build is not an improvement');
const regressed = productivityRecord({ taskId: '0x06', durationMs: 1200000, featuresCompleted: 3, testsPassed: 110, regressions: 1, filesChanged: 6, topHunks: 5, topEditCalls: 2 });
ok(compareToBaseline(regressed).faster === true && compareToBaseline(regressed).regressionFree === false && compareToBaseline(regressed).improvement === false, 'faster but regressed is NOT an improvement');

// --- intervention: a flag pauses, preserves, diagnoses, reassigns ---
eq(interventionPlan(executionMetrics({})), null, 'no intervention when the verdict is ok');
eq(interventionPlan(executionMetrics({ hunks: { 'src/a.ts': WARN_FILE_HUNKS } })), null, 'no intervention on a warn');
const plan = interventionPlan(j1);
ok(plan !== null && plan.action === 'pause', 'a flag produces a pause plan');
ok(plan.preserve.includes('uncommitted work stays in the worktree'), 'the plan preserves uncommitted work');
ok(plan.diagnose.some((r) => r.includes('14 hunks')), 'the plan carries the diagnosis');
ok(plan.reassign.includes('Engine3DWorldView.tsx') && plan.reassign.includes('different implementation strategy'), 'the plan reassigns with a different strategy naming the bottleneck');

console.log(`EXECUTION ASSERTS: ${passed} passed`);
