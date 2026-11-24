// Standalone asserts for the NEURON HEX scheduler. Run directly: node scheduler.test.mjs
// Throws on the first failure; prints the pass count on success.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  validate, gatesPass, isEligible, eligibleTasks, nextTask,
  stalledTasks, metrics, bottleneck, readConditions,
  releasePlan, conflicts, workspaceOf, maxWorkersFor, checkVerdict,
} from './scheduler.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const queue = JSON.parse(readFileSync(path.join(here, 'tasks.json'), 'utf8'));
const tasks = queue.tasks;

let n = 0;
function check(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  n += 1;
}
function throws(fn, label) {
  let ok = false;
  try { fn(); } catch { ok = true; }
  if (!ok) throw new Error(`FAIL (expected throw): ${label}`);
  n += 1;
}
validate(tasks); // live queue must validate (structural check only)
const GREEN = { ciPass: true, approvals: { 'pr61-merge': true } };
const NO_CI = { ciPass: false, approvals: { 'pr61-merge': true } };
const NO_APPROVAL = { ciPass: true, approvals: {} };

// --- live queue: structural checks only (state-independent; the queue moves) ---
check(tasks.length >= 12, 'queue has at least the 12 original tasks (it grows; the exact count is not a scheduler property)');
check(typeof queue.approvals['pr61-merge'] === 'boolean', 'pr61-merge approval is a boolean in tasks.json (the dispatcher never grants one; gates enforce it)');

// --- frozen queue: the 0x02-era state (2026-11-15 ~16:30 MST), so the
// gate / eligibility / metrics assertions do not go stale every time a task
// completes. The live queue has moved on (0x02-0x04 done, approval true);
// this snapshot preserves the coverage. ---
const ERA = '2026-11-15T00:00:00.000Z';
const era02 = [
  { id: '0x01', title: 'quest fix', status: 'done', priority: 1, dependsOn: [], gates: [], startedAt: ERA, completedAt: new Date(Date.parse(ERA) + 212000).toISOString() },
  { id: '0x02', title: 'wiring', status: 'pending', priority: 1, dependsOn: ['0x01', '0x0C'], gates: [{ type: 'ci' }, { type: 'approval', key: 'pr61-merge' }] },
  { id: '0x03', title: 'F-1', status: 'pending', priority: 2, dependsOn: ['0x02'], gates: [] },
  { id: '0x04', title: 'R-1', status: 'pending', priority: 2, dependsOn: ['0x03'], gates: [] },
  { id: '0x05', title: 'J-1', status: 'pending', priority: 2, dependsOn: ['0x04'], gates: [] },
  { id: '0x06', title: 'chain', status: 'pending', priority: 2, dependsOn: ['0x05'], gates: [] },
  { id: '0x07', title: 'food', status: 'pending', priority: 2, dependsOn: ['0x06'], gates: [] },
  { id: '0x08', title: 'control', status: 'pending', priority: 2, dependsOn: ['0x07'], gates: [] },
  { id: '0x09', title: '24h', status: 'pending', priority: 2, dependsOn: ['0x08'], gates: [] },
  { id: '0x0A', title: 'Tamsin', status: 'blocked', priority: 2, dependsOn: [], gates: [] },
  { id: '0x0B', title: 'hitch', status: 'pending', priority: 9, dependsOn: ['0x06'], gates: [] },
  { id: '0x0C', title: 'step-26', status: 'done', priority: 1, dependsOn: [], gates: [], startedAt: ERA, completedAt: new Date(Date.parse(ERA) + 472000).toISOString() },
];
const eraById = validate(era02);
const eraT02 = eraById.get('0x02');
const eraT03 = eraById.get('0x03');
const eraT0A = eraById.get('0x0A');
check(!gatesPass(eraT02, NO_CI), '0x02 gates fail closed when CI fails');
check(!gatesPass(eraT02, NO_APPROVAL), '0x02 gates fail closed when the merge is not approved');
check(gatesPass(eraT02, GREEN), '0x02 gates pass when CI passes AND the merge is approved');
check(!isEligible(eraT02, eraById, NO_CI), '0x02 not eligible while CI fails');
check(!isEligible(eraT02, eraById, NO_APPROVAL), '0x02 not eligible while the merge is unapproved');
check(isEligible(eraT02, eraById, GREEN), '0x02 eligible once 0x0C is done and both gates pass');
check(nextTask(era02, NO_CI) === null, 'nothing eligible while CI fails');
check(nextTask(era02, NO_APPROVAL) === null, 'nothing eligible while the merge is unapproved');
check(nextTask(era02, GREEN).id === '0x02', 'next is 0x02 once 0x0C is done and both gates pass');
check(!isEligible(eraT03, eraById, GREEN), '0x03 not eligible until 0x02 is done');
check(!isEligible(eraT0A, eraById, GREEN), '0x0A (blocked on user word) never eligible');
check(eligibleTasks(era02, GREEN).map((t) => t.id).join(',') === '0x02', 'only 0x02 eligible once 0x0C is done and both gates pass');

// --- frozen queue metrics + bottleneck ---
const m = metrics(era02);
check(m.total === 12 && m.counts.done === 2 && m.counts.pending === 9 && m.counts.blocked === 1 && m.counts.in_progress === 0,
  `counts are done 2 / pending 9 / blocked 1 / in_progress 0 (got ${JSON.stringify(m.counts)})`);
check(m.avgCompletionMs === 342000, `avg completion is 342000ms for 0x01 (212s) + 0x0C (472s) (got ${m.avgCompletionMs})`);
check(bottleneck(era02).id === '0x02' && bottleneck(era02).waitingOnIt === 8, 'bottleneck is 0x02 with 8 tasks waiting on it');

// --- conditions read from a temporary monitor-state fixture (portable in CI and worktrees) ---
const monitorDir = mkdtempSync(path.join(tmpdir(), 'neuron-hex-monitor-'));
const monitorStatePath = path.join(monitorDir, 'pr61-monitor-state.json');
const rawState = { conclusion: 'success', head_sha: 'fixture-head-sha', last_reported_run_id: 123456 };
try {
  writeFileSync(monitorStatePath, JSON.stringify(rawState));
  const cond = readConditions(monitorStatePath);
  check(cond.ciPass === (rawState.conclusion === 'success') && cond.ciHeadSha === rawState.head_sha && cond.ciRunId === rawState.last_reported_run_id && cond.ciConclusion === rawState.conclusion,
    'readConditions maps the monitor state fields correctly');
  check(readConditions(path.join(monitorDir, 'missing.json')).ciPass === false, 'missing state file fails closed');
} finally {
  rmSync(monitorDir, { recursive: true, force: true });
}

// --- synthetic: validation rejects bad queues ---
const base = (over) => [{ id: '0x01', title: 'a', status: 'pending', priority: 1, dependsOn: [], gates: [], ...(over || {}) }];
throws(() => validate([...base(), { id: '0x01', title: 'dup', status: 'pending', priority: 1, dependsOn: [], gates: [] }]), 'duplicate hex id throws');
throws(() => validate([{ id: '0x01', title: 'a', status: 'pending', priority: 1, dependsOn: ['0xFF'], gates: [] }]), 'unknown dependency throws');
throws(() => validate([{ id: '0x01', title: 'a', status: 'pending', priority: 1, dependsOn: ['0x01'], gates: [] }]), 'self-dependency throws');
throws(() => validate([
  { id: '0x01', title: 'a', status: 'pending', priority: 1, dependsOn: ['0x02'], gates: [] },
  { id: '0x02', title: 'b', status: 'pending', priority: 1, dependsOn: ['0x01'], gates: [] },
]), 'two-task cycle throws');
throws(() => validate([{ id: '0x01', title: 'a', status: 'weird', priority: 1, dependsOn: [], gates: [] }]), 'bad status throws');
throws(() => validate([{ id: '7', title: 'a', status: 'pending', priority: 1, dependsOn: [], gates: [] }]), 'non-hex id throws');
throws(() => validate([{ id: '0x01', title: 'a', status: 'pending', priority: 1, dependsOn: [], gates: [{ type: 'moon' }] }]), 'unknown gate type throws');
throws(() => validate([{ id: '0x01', title: 'a', status: 'pending', priority: 1, dependsOn: [], gates: [{ type: 'approval' }] }]), 'approval gate without a key throws');

// --- synthetic: tie-break, gates, stalls ---
const tie = [
  { id: '0x0B', title: 'b', status: 'pending', priority: 2, dependsOn: [], gates: [] },
  { id: '0x0A', title: 'a', status: 'pending', priority: 2, dependsOn: [], gates: [] },
];
check(nextTask(tie, {}).id === '0x0A', 'same priority breaks to the lowest hex id');
const gated = [{ id: '0x01', title: 'g', status: 'pending', priority: 1, dependsOn: [], gates: [{ type: 'ci' }] }];
check(!isEligible(gated[0], validate(gated), {}), 'CI gate with no condition fails closed');
check(!isEligible(gated[0], validate(gated), { ciPass: false }), 'CI gate with ciPass false fails closed');
const now = Date.now();
const stallSet = [
  { id: '0x01', title: 'old', status: 'in_progress', priority: 1, dependsOn: [], gates: [], startedAt: new Date(now - 2 * 3600 * 1000).toISOString() },
  { id: '0x02', title: 'fresh', status: 'in_progress', priority: 1, dependsOn: [], gates: [], startedAt: new Date(now - 10 * 60 * 1000).toISOString() },
  { id: '0x03', title: 'notime', status: 'in_progress', priority: 1, dependsOn: [], gates: [] },
  { id: '0x04', title: 'pend', status: 'pending', priority: 1, dependsOn: [], gates: [], startedAt: new Date(now - 5 * 3600 * 1000).toISOString() },
];
const stalled = stalledTasks(stallSet, now).map((t) => t.id).sort();
check(stalled.join(',') === '0x01,0x03', `stalled flags the 2h-old and the timestamp-less in-progress tasks (got ${stalled.join(',')})`);

// --- V1.1: conflicts + releasePlan + checkVerdict (synthetic) ---
const mk = (id, over) => ({ id, title: id, status: 'pending', priority: 2, dependsOn: [], gates: [], files: [], worktree: null, ...(over || {}) });
check(!conflicts(mk('0x01', { worktree: '/w/a', files: ['src/a.ts'] }), mk('0x02', { worktree: '/w/b', files: ['src/b.ts'] })), 'different worktrees, no shared files: no conflict');
check(conflicts(mk('0x01', { worktree: '/w/a' }), mk('0x02', { worktree: '/w/a' })), 'same worktree conflicts');
check(conflicts(mk('0x01'), mk('0x02')), 'both on the main checkout conflict');
check(conflicts(mk('0x01', { worktree: '/w/a', files: ['src/shared.ts'] }), mk('0x02', { worktree: '/w/b', files: ['src/shared.ts'] })), 'shared file conflicts across worktrees');
check(workspaceOf(mk('0x01')) === 'main-checkout', 'null worktree maps to main-checkout');
check(workspaceOf(mk('0x01', { worktree: '/w/a' })) === '/w/a', 'worktree maps to itself');
check(maxWorkersFor({}) === 2, 'maxWorkers defaults to 2');
check(maxWorkersFor({ concurrency: { maxWorkers: 3 } }) === 3, 'maxWorkers reads the queue value');
check(maxWorkersFor({ concurrency: { maxWorkers: 0 } }) === 2, 'maxWorkers below 1 falls back to 2');

const planSet = [
  mk('0x01', { priority: 1, worktree: '/w/a', files: ['src/a.ts'] }),
  mk('0x02', { priority: 1, worktree: '/w/b', files: ['src/b.ts'] }),
  mk('0x03', { priority: 2, worktree: '/w/c', files: ['src/c.ts'] }),
];
check(releasePlan(planSet, {}, 2).map((t) => t.id).join(',') === '0x01,0x02', 'maxWorkers 2 releases the two highest-priority independent tasks');
check(releasePlan(planSet, {}, 1).map((t) => t.id).join(',') === '0x01', 'maxWorkers 1 releases only the first');
const planConflict = [
  mk('0x01', { priority: 1, worktree: '/w/a', files: ['src/a.ts'] }),
  mk('0x02', { priority: 1, worktree: '/w/a', files: ['src/b.ts'] }),
  mk('0x03', { priority: 2, worktree: '/w/b', files: ['src/b.ts'] }),
];
check(releasePlan(planConflict, {}, 2).map((t) => t.id).join(',') === '0x01,0x03', 'same-worktree task skipped, next independent task taken instead');
const planSharedFile = [
  mk('0x01', { priority: 1, worktree: '/w/a', files: ['src/shared.ts'] }),
  mk('0x02', { priority: 1, worktree: '/w/b', files: ['src/shared.ts'] }),
  mk('0x03', { priority: 2, worktree: '/w/c', files: ['src/c.ts'] }),
];
check(releasePlan(planSharedFile, {}, 2).map((t) => t.id).join(',') === '0x01,0x03', 'shared-file task skipped, next independent task taken instead');
const planActive = [
  mk('0x01', { priority: 1, worktree: '/w/a', status: 'in_progress', startedAt: new Date().toISOString() }),
  mk('0x02', { priority: 1, worktree: '/w/b' }),
  mk('0x03', { priority: 2, worktree: '/w/c' }),
];
check(releasePlan(planActive, {}, 2).map((t) => t.id).join(',') === '0x02', 'one active worker leaves one slot');
check(releasePlan(planActive, {}, 1).length === 0, 'active worker fills the only slot');
const planGated = [
  mk('0x01', { priority: 1, worktree: '/w/a', gates: [{ type: 'ci' }] }),
  mk('0x02', { priority: 2, worktree: '/w/b' }),
];
check(releasePlan(planGated, { ciPass: false }, 2).map((t) => t.id).join(',') === '0x02', 'gated task skipped while its gate fails; the ungated one releases');
check(releasePlan(planGated, { ciPass: true }, 2).map((t) => t.id).join(',') === '0x01,0x02', 'gated task releases once its gate passes');

// checkVerdict on the live queue is state-independent: a stale active task may
// produce stalled-needs-parent, while a fully gated queue produces no-eligible.
const v = checkVerdict(tasks, { ciPass: false, approvals: {} }, 2);
check((v.verdict === 'NONE' && v.taskId === null) || (v.verdict === 'RELEASABLE' && typeof v.taskId === 'string'), 'real queue verdict has a valid state shape');
const onlyCiGated = [mk('0x01', { gates: [{ type: 'ci' }] })];
const vNoEligible = checkVerdict(onlyCiGated, { ciPass: false }, 2);
check(vNoEligible.verdict === 'NONE' && vNoEligible.reason === 'no-eligible', 'CI-gated synthetic queue reports no-eligible');
const vStalled = checkVerdict(stallSet, {}, 2);
check(vStalled.verdict === 'NONE' && vStalled.reason === 'stalled-needs-parent', 'stalled in-progress work requests parent intervention');
const v2 = checkVerdict(planSet, {}, 2);
check(v2.verdict === 'RELEASABLE' && v2.taskId === '0x01', 'synthetic queue check verdict is RELEASABLE 0x01');

console.log(`SCHEDULER ASSERTS: ${n} passed`);
