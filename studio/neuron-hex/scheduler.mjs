// NEURON HEX scheduler — pure dependency engine + CLI.
// The engine never edits the queue. It computes eligibility, stalls, and
// metrics from tasks.json; the parent/dispatcher update the queue.
// CLI:
//   node scheduler.mjs status [--state <monitor-state.json>] [--out <dir>]
//     prints a JSON summary; writes neuron-hex-status.json/.md to <dir>.
//   node scheduler.mjs check [--state <monitor-state.json>]
//     read-only: prints one verdict line (RELEASABLE <id> | NONE <reason>).
//     Used by the hook detector (5s poll) — it writes nothing.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readEvents, aggregateEvents } from './events.mjs';

export const STALL_THRESHOLD_MS = 90 * 60 * 1000; // 90 minutes without a heartbeat
const HEX_ID = /^0x[0-9A-Fa-f]+$/;
const STATUSES = new Set(['pending', 'in_progress', 'blocked', 'done']);

function hexValue(id) { return parseInt(id.slice(2), 16); }

// --- validation: unique hex IDs, every dep exists, no cycles, sane fields ---
export function validate(tasks) {
  if (!Array.isArray(tasks)) throw new Error('tasks must be an array');
  const byId = new Map();
  for (const t of tasks) {
    if (!t || typeof t.id !== 'string' || !HEX_ID.test(t.id)) throw new Error(`bad hex id: ${JSON.stringify(t && t.id)}`);
    if (byId.has(t.id)) throw new Error(`duplicate hex id: ${t.id}`);
    if (!STATUSES.has(t.status)) throw new Error(`${t.id}: bad status ${JSON.stringify(t.status)}`);
    if (typeof t.priority !== 'number') throw new Error(`${t.id}: priority must be a number`);
    if (!Array.isArray(t.dependsOn)) throw new Error(`${t.id}: dependsOn must be an array`);
    byId.set(t.id, t);
  }
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      if (d === t.id) throw new Error(`${t.id}: depends on itself`);
      if (!byId.has(d)) throw new Error(`${t.id}: unknown dependency ${d}`);
    }
    if (!Array.isArray(t.gates)) throw new Error(`${t.id}: gates must be an array`);
    for (const g of t.gates) {
      if (g.type !== 'ci' && g.type !== 'approval') throw new Error(`${t.id}: unknown gate type ${JSON.stringify(g.type)}`);
      if (g.type === 'approval' && typeof g.key !== 'string') throw new Error(`${t.id}: approval gate needs a string key`);
    }
  }
  // Cycle detection (DFS over dependsOn edges).
  const state = new Map(); // 0 unvisited, 1 visiting, 2 done
  const visit = (id, trail) => {
    const s = state.get(id) || 0;
    if (s === 1) throw new Error(`dependency cycle: ${[...trail, id].join(' -> ')}`);
    if (s === 2) return;
    state.set(id, 1);
    for (const d of byId.get(id).dependsOn) visit(d, [...trail, id]);
    state.set(id, 2);
  };
  for (const t of tasks) visit(t.id, []);
  return byId;
}

// --- gates: fail closed. Unknown gate type or missing condition = not passed. ---
export function gatesPass(task, conditions) {
  for (const g of task.gates || []) {
    if (g.type === 'ci' && !(conditions && conditions.ciPass === true)) return false;
    if (g.type === 'approval' && !(conditions && conditions.approvals && conditions.approvals[g.key] === true)) return false;
    if (g.type !== 'ci' && g.type !== 'approval') return false;
  }
  return true;
}

export function isEligible(task, byId, conditions) {
  if (task.status !== 'pending') return false;
  if (!task.dependsOn.every((d) => byId.get(d).status === 'done')) return false;
  return gatesPass(task, conditions);
}

export function eligibleTasks(tasks, conditions) {
  const byId = validate(tasks);
  return tasks.filter((t) => isEligible(t, byId, conditions));
}

// Highest priority (lowest number); ties break to the lowest hex ID.
export function nextTask(tasks, conditions) {
  const list = eligibleTasks(tasks, conditions);
  if (list.length === 0) return null;
  list.sort((a, b) => (a.priority - b.priority) || (hexValue(a.id) - hexValue(b.id)));
  return list[0];
}

// --- V1.1 parallel release: which tasks can start now, up to maxWorkers ---
// Two tasks conflict when they share a workspace (same worktree, or both on
// the main checkout) or when their file lists overlap. One code agent per
// working tree; the dispatcher never releases conflicting tasks together.
export function workspaceOf(task) {
  return task.worktree || 'main-checkout';
}

export function conflicts(a, b) {
  if (workspaceOf(a) === workspaceOf(b)) return true;
  const fa = new Set(a.files || []);
  return (b.files || []).some((f) => fa.has(f));
}

export function maxWorkersFor(queue) {
  const n = queue && queue.concurrency && queue.concurrency.maxWorkers;
  return Number.isInteger(n) && n >= 1 ? n : 2;
}

// Eligible tasks that can start right now: sorted by (priority, hex id),
// capped by free slots, skipping anything that conflicts with an active
// task or with a task already selected in this plan.
export function releasePlan(tasks, conditions, maxWorkers) {
  const byId = validate(tasks);
  const active = tasks.filter((t) => t.status === 'in_progress');
  const slots = Math.max(0, maxWorkers - active.length);
  if (slots === 0) return [];
  const list = tasks.filter((t) => isEligible(t, byId, conditions));
  list.sort((a, b) => (a.priority - b.priority) || (hexValue(a.id) - hexValue(b.id)));
  const plan = [];
  for (const t of list) {
    if (plan.length >= slots) break;
    if (active.some((a) => conflicts(a, t))) continue;
    if (plan.some((p) => conflicts(p, t))) continue;
    plan.push(t);
  }
  return plan;
}

// Read-only verdict for the hook detector: RELEASABLE <id> when a task can
// start now, otherwise NONE <reason>. Writes nothing.
export function checkVerdict(tasks, conditions, maxWorkers, nowMs = Date.now()) {
  const plan = releasePlan(tasks, conditions, maxWorkers);
  if (plan.length > 0) return { verdict: 'RELEASABLE', taskId: plan[0].id, reason: null };
  const stalled = stalledTasks(tasks, nowMs);
  if (stalled.length > 0) return { verdict: 'NONE', taskId: null, reason: 'stalled-needs-parent' };
  const byId = validate(tasks);
  const elig = tasks.filter((t) => isEligible(t, byId, conditions));
  if (elig.length === 0) return { verdict: 'NONE', taskId: null, reason: 'no-eligible' };
  return { verdict: 'NONE', taskId: null, reason: 'no-releasable' };
}

function lastBeat(task) {
  return Date.parse(task.heartbeatAt || task.startedAt || '') || null;
}

export function stalledTasks(tasks, nowMs = Date.now()) {
  validate(tasks);
  return tasks.filter((t) => {
    if (t.status !== 'in_progress') return false;
    const beat = lastBeat(t);
    if (beat === null) return true; // in progress with no timestamp at all
    return nowMs - beat > STALL_THRESHOLD_MS;
  });
}

export function metrics(tasks) {
  validate(tasks);
  const counts = { pending: 0, in_progress: 0, blocked: 0, done: 0 };
  let totalMs = 0;
  let timed = 0;
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
    const s = Date.parse(t.startedAt || '');
    const e = Date.parse(t.completedAt || '');
    if (t.status === 'done' && Number.isFinite(s) && Number.isFinite(e) && e >= s) {
      totalMs += e - s;
      timed += 1;
    }
  }
  return { counts, total: tasks.length, completed: counts.done, avgCompletionMs: timed ? Math.round(totalMs / timed) : null, timedCompletions: timed };
}

// The non-done task the most other tasks transitively wait on.
export function bottleneck(tasks) {
  const byId = validate(tasks);
  const dependents = new Map(tasks.map((t) => [t.id, new Set()]));
  for (const t of tasks) {
    for (const d of t.dependsOn) dependents.get(d).add(t.id);
  }
  const transitive = (id, seen = new Set()) => {
    for (const dep of dependents.get(id)) {
      if (!seen.has(dep)) { seen.add(dep); transitive(dep, seen); }
    }
    return seen;
  };
  let best = null;
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const n = transitive(t.id).size;
    if (!best || n > best.waitingOnIt) best = { id: t.id, title: t.title, waitingOnIt: n, status: t.status, blockedReason: t.blockedReason || null };
  }
  return best;
}

// --- conditions: read from the PR #61 monitor state file (or any --state path) ---
export function readConditions(stateFile) {
  try {
    const s = JSON.parse(readFileSync(stateFile, 'utf8'));
    return {
      ciPass: s.conclusion === 'success',
      ciHeadSha: typeof s.head_sha === 'string' ? s.head_sha : null,
      ciRunId: s.last_reported_run_id ?? null,
      ciConclusion: typeof s.conclusion === 'string' ? s.conclusion : null,
    };
  } catch {
    return { ciPass: false, ciHeadSha: null, ciRunId: null, ciConclusion: null };
  }
}

export function renderStatus(tasks, conditions, nowMs = Date.now(), extra = {}) {
  const byId = validate(tasks);
  const eligible = eligibleTasks(tasks, conditions);
  const next = nextTask(tasks, conditions);
  const stalled = stalledTasks(tasks, nowMs);
  const maxWorkers = extra.maxWorkers || 2;
  const plan = releasePlan(tasks, conditions, maxWorkers);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    queue: 'autonomous-village',
    counts: metrics(tasks).counts,
    total: tasks.length,
    metrics: metrics(tasks),
    bottleneck: bottleneck(tasks),
    conditions,
    maxWorkers,
    releasePlan: plan.map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    events: extra.eventsAgg || null,
    next: next ? { id: next.id, title: next.title, priority: next.priority } : null,
    eligible: eligible.map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    inProgress: tasks.filter((t) => t.status === 'in_progress').map((t) => ({ id: t.id, title: t.title, startedAt: t.startedAt || null, heartbeatAt: t.heartbeatAt || null })),
    blocked: tasks.filter((t) => t.status === 'blocked').map((t) => ({ id: t.id, title: t.title, blockedReason: t.blockedReason || null })),
    stalled: stalled.map((t) => ({ id: t.id, title: t.title, startedAt: t.startedAt || null })),
    done: tasks.filter((t) => t.status === 'done').map((t) => ({ id: t.id, title: t.title, commit: t.commit || null, completedAt: t.completedAt || null })),
    waiting: tasks.filter((t) => t.status === 'pending' && !isEligible(t, byId, conditions)).map((t) => {
      const unmet = t.dependsOn.filter((d) => byId.get(d).status !== 'done');
      const unmetGates = (t.gates || []).filter((g) => {
        if (g.type === 'ci') return !(conditions && conditions.ciPass === true);
        if (g.type === 'approval') return !(conditions && conditions.approvals && conditions.approvals[g.key] === true);
        return true;
      }).map((g) => (g.type === 'approval' ? `gate approval ${g.key} not passed` : `gate ${g.type} not passed`));
      return { id: t.id, title: t.title, waitingOn: [...unmet, ...unmetGates] };
    }),
  };
}

export function renderStatusMd(s) {
  const lines = [];
  lines.push('# NEURON HEX — Status');
  lines.push('');
  lines.push('_Generated by the scheduler — do not hand-edit. Regenerated each run._');
  lines.push('');
  lines.push(`Generated: ${s.generatedAt}`);
  lines.push(`Queue: ${s.queue} — ${s.total} tasks: ${s.counts.done} done, ${s.counts.in_progress} in progress, ${s.counts.pending} pending, ${s.counts.blocked} blocked.`);
  lines.push('');
  if (s.next) lines.push(`**Next eligible:** ${s.next.id} — ${s.next.title} (priority ${s.next.priority}).`);
  else lines.push('**Next eligible:** none.');
  if (s.releasePlan && s.releasePlan.length) lines.push(`**Release plan:** ${s.releasePlan.map((t) => t.id).join(', ')} (up to ${s.maxWorkers} workers).`);
  if (s.events && s.events.total > 0) {
    lines.push(`**Events:** ${s.events.total} logged; ${s.events.completedLastHour} completed in the last hour; avg release→completion ${s.events.avgReleaseToCompletionMs !== null ? `${Math.round(s.events.avgReleaseToCompletionMs / 1000)}s` : 'n/a'}; duplicate-prevented ${s.events.byType.duplicate_prevented || 0}; failed ${s.events.byType.failed || 0}.`);
  }
  if (s.bottleneck) lines.push(`**Bottleneck:** ${s.bottleneck.id} — ${s.bottleneck.title} (${s.bottleneck.waitingOnIt} task(s) wait on it; status ${s.bottleneck.status}${s.bottleneck.blockedReason ? ` — ${s.bottleneck.blockedReason}` : ''}).`);
  lines.push(`**CI gate:** ${s.conditions.ciConclusion || 'unknown'}${s.conditions.ciHeadSha ? ` on ${s.conditions.ciHeadSha.slice(0, 8)}` : ''}${s.conditions.ciRunId ? ` (run ${s.conditions.ciRunId})` : ''}.`);
  if (s.metrics.avgCompletionMs !== null) lines.push(`**Throughput:** ${s.metrics.completed} completed, average task time ${Math.round(s.metrics.avgCompletionMs / 1000)}s over ${s.metrics.timedCompletions} timed completion(s).`);
  lines.push('');
  if (s.inProgress.length) {
    lines.push('## In progress');
    for (const t of s.inProgress) lines.push(`- ${t.id} — ${t.title} (started ${t.startedAt || 'unknown'})`);
    lines.push('');
  }
  if (s.stalled.length) {
    lines.push('## STALLED (in progress > 90 min without a heartbeat)');
    for (const t of s.stalled) lines.push(`- ${t.id} — ${t.title} (started ${t.startedAt || 'unknown'})`);
    lines.push('');
  }
  if (s.waiting.length) {
    lines.push('## Waiting (pending, dependencies or gates unmet)');
    for (const t of s.waiting) lines.push(`- ${t.id} — ${t.title} (waiting on: ${t.waitingOn.join(', ')})`);
    lines.push('');
  }
  if (s.blocked.length) {
    lines.push('## Blocked');
    for (const t of s.blocked) lines.push(`- ${t.id} — ${t.title}${t.blockedReason ? ` — ${t.blockedReason}` : ''}`);
    lines.push('');
  }
  if (s.done.length) {
    lines.push('## Done');
    for (const t of s.done) lines.push(`- ${t.id} — ${t.title}${t.commit ? ` (commit ${t.commit})` : ''}${t.completedAt ? ` — completed ${t.completedAt}` : ''}`);
    lines.push('');
  }
  lines.push('Controls: pause = set a task `blocked` in tasks.json; resume = set it `pending`; priority = the numeric priority field; safe shutdown = disable the `neuron-hex-dispatcher` cron.');
  return lines.join('\n') + '\n';
}

// --- CLI ---
const here = path.dirname(fileURLToPath(import.meta.url));
const queuePath = path.join(here, 'tasks.json');
// Status outputs live in the goal's hidden_files, NOT in the repo: the
// dispatcher regenerates them every run, and writing them into the checkout
// would dirty the tree a build agent is about to use.
const DEFAULT_OUT = '/home/hatch/workspace/goals/adventure-game-repo-updates-and-deployment/hidden_files';
const DEFAULT_STATE = '/home/hatch/workspace/goals/adventure-game-repo-updates-and-deployment/hidden_files/pr61-monitor-state.json';
const EVENTS_LOG = '/home/hatch/workspace/goals/adventure-game-repo-updates-and-deployment/hidden_files/neuron-hex-events.jsonl';

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const mode = process.argv[2];
  const stateIdx = process.argv.indexOf('--state');
  const stateFile = stateIdx >= 0 ? process.argv[stateIdx + 1] : DEFAULT_STATE;
  const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
  const conditions = { ...readConditions(stateFile), approvals: queue.approvals || {} };
  const maxWorkers = maxWorkersFor(queue);
  if (mode === 'check') {
    const v = checkVerdict(queue.tasks, conditions, maxWorkers);
    console.log(v.verdict === 'RELEASABLE' ? `RELEASABLE ${v.taskId}` : `NONE ${v.reason}`);
    process.exit(0);
  }
  if (mode !== 'status') {
    console.error('usage: node scheduler.mjs status [--state <path>] [--out <dir>] | node scheduler.mjs check [--state <path>]');
    process.exit(2);
  }
  const outIdx = process.argv.indexOf('--out');
  const outDir = outIdx >= 0 ? process.argv[outIdx + 1] : DEFAULT_OUT;
  const statusPath = path.join(outDir, 'neuron-hex-status.json');
  const statusMdPath = path.join(outDir, 'neuron-hex-status.md');
  const eventsAgg = aggregateEvents(readEvents(EVENTS_LOG));
  const status = renderStatus(queue.tasks, conditions, Date.now(), { maxWorkers, eventsAgg });
  const tmp = statusPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(status, null, 2) + '\n');
  const back = JSON.parse(readFileSync(tmp, 'utf8'));
  if (back.total !== queue.tasks.length) throw new Error('status.json validation failed');
  renameSync(tmp, statusPath);
  const tmpMd = statusMdPath + '.tmp';
  writeFileSync(tmpMd, renderStatusMd(status));
  renameSync(tmpMd, statusMdPath);
  console.log(JSON.stringify({ next: status.next, releasePlan: status.releasePlan.map((t) => t.id), stalled: status.stalled.map((t) => t.id), bottleneck: status.bottleneck && status.bottleneck.id, counts: status.counts, ci: status.conditions.ciConclusion, events: status.events }, null, 2));
}
