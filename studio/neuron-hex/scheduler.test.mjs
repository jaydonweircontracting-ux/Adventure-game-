// Standalone asserts for the NEURON HEX scheduler. Run directly: node scheduler.test.mjs
// Throws on the first failure; prints the pass count on success.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  validate, gatesPass, isEligible, eligibleTasks, nextTask,
  stalledTasks, metrics, bottleneck, readConditions,
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
const byId = validate(tasks);
const t02 = byId.get('0x02');
const t03 = byId.get('0x03');
const t0A = byId.get('0x0A');
const GREEN = { ciPass: true, approvals: { 'pr61-merge': true } };
const NO_CI = { ciPass: false, approvals: { 'pr61-merge': true } };
const NO_APPROVAL = { ciPass: true, approvals: {} };

// --- real queue, CI failing (current monitor state) ---
check(tasks.length === 11, 'queue has 11 tasks');
check(queue.approvals && queue.approvals['pr61-merge'] === false, 'pr61-merge approval starts false');
check(!gatesPass(t02, NO_CI), '0x02 gates fail closed when CI fails');
check(!gatesPass(t02, NO_APPROVAL), '0x02 gates fail closed when the merge is not approved');
check(gatesPass(t02, GREEN), '0x02 gates pass when CI passes AND the merge is approved');
check(!isEligible(t02, byId, NO_CI), '0x02 not eligible while CI fails');
check(!isEligible(t02, byId, NO_APPROVAL), '0x02 not eligible while the merge is unapproved');
check(isEligible(t02, byId, GREEN), '0x02 eligible once CI passes and the merge is approved');
check(nextTask(tasks, NO_CI) === null, 'nothing eligible while CI fails');
check(nextTask(tasks, NO_APPROVAL) === null, 'nothing eligible while the merge is unapproved');
check(nextTask(tasks, GREEN).id === '0x02', 'next is 0x02 once both gates pass');
check(!isEligible(t03, byId, GREEN), '0x03 not eligible until 0x02 is done');
check(!isEligible(t0A, byId, GREEN), '0x0A (blocked on user word) never eligible');
check(eligibleTasks(tasks, GREEN).map((t) => t.id).join(',') === '0x02', 'only 0x02 eligible with both gates green');

// --- real queue metrics + bottleneck ---
const m = metrics(tasks);
check(m.total === 11 && m.counts.done === 1 && m.counts.pending === 9 && m.counts.blocked === 1 && m.counts.in_progress === 0,
  `counts are done 1 / pending 9 / blocked 1 / in_progress 0 (got ${JSON.stringify(m.counts)})`);
check(m.avgCompletionMs === 212000, `avg completion is 212000ms for 0x01 (got ${m.avgCompletionMs})`);
check(bottleneck(tasks).id === '0x02' && bottleneck(tasks).waitingOnIt === 8, 'bottleneck is 0x02 with 8 tasks waiting on it');

// --- conditions read from the real monitor state file ---
const cond = readConditions('/home/hatch/workspace/goals/adventure-game-repo-updates-and-deployment/hidden_files/pr61-monitor-state.json');
check(cond.ciPass === false && cond.ciConclusion === 'failure' && cond.ciHeadSha === '69dfb623b7' && cond.ciRunId === 43771819960,
  'monitor state reads as CI failure on 69dfb623, run 43771819960');
check(readConditions('/nonexistent/state.json').ciPass === false, 'missing state file fails closed');

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

console.log(`SCHEDULER ASSERTS: ${n} passed`);
