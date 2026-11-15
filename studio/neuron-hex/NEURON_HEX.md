# NEURON HEX — Hyper-Accelerated Autonomous Engineering Engine

Design + operating record for Adventure's development orchestration layer.
Created 2026-11-15 ~16:30 MST (user order). First mission: the autonomous village.

## 0. What it is — and what it is not

NEURON HEX is an orchestration **layer around Muse**, not another brain and not
another instruction to reread. It is code + data that runs:

- `tasks.json` — the machine-readable task queue (hex IDs, dependencies, gates,
  status). This is the executable form of the §49 backlog and the §62 run order.
- `scheduler.mjs` — the pure dependency engine. It computes what is eligible,
  what is stalled, and what the bottleneck is. It never edits the queue.
- `status.json` + `STATUS.md` — the generated control-center snapshot.
- The dispatcher cron — reads the queue on a schedule and spawns one eligible
  worker at a time. It never merges, never deploys, never overrides a block.

**Reconciliation (hard rule):** §53–§58 form one development brain; there are no
competing engines, registries, or memories. NEURON HEX does not replace them:

- The Development Genome (§55) is the architecture index — the scheduler
  consults it, it does not rebuild it.
- `studio/IMPLEMENTATION_REGISTRY.md` is the requirement registry — tasks
  reference registry IDs, they do not duplicate them.
- `~/MEMORY.md` + dated logs are the durable memory — task outcomes are
  recorded there by the parent, not in a second memory.
- The §57 orchestrator is the design — the scheduler + dispatcher are its
  executable form, not a rival.
- SOUL.md §49 (RUN mode), §60 (START), §61 (acceleration), §62 (correction)
  are the operating rules — the scheduler encodes them, it does not restate them.

**Honest limits (the user's own distinctions, kept):**

- Hexadecimal IDs are compact indexing and traceability. Hex encoding does
  not make a processor faster, and no prompt guarantees flawless code.
- The "1 BILLION TRILLION ×" figure is a symbolic ambition, not a claim of
  physically achievable speed. The measurable objective is eliminating wasted
  work: repeated inspections, redundant tool calls, idle agents, duplicate
  work, preventable errors.
- Never mark code flawless because it compiles. Never weaken a test for a
  green build. Never claim an unverified change.

## 1. HEX CORE — task encoding

Every task has: a unique hex ID (`0x01`, `0x02`, …), a title, a status
(`pending` | `in_progress` | `blocked` | `done`), a numeric priority
(1 = highest; ties break to the lowest hex ID), dependency IDs, an optional
list of gates, file references, test requirements, a brief, verification
evidence, and timestamps. Source code is never encoded in hex — there is no
measurable reason to do so.

Gates are external conditions a task waits on, distinct from dependencies
(which are other tasks). Two gate types exist, and both fail closed:

- `ci` — a branch's validation run must be green, read from the monitor's
  state file (never polled by the scheduler itself).
- `approval` — a user decision, recorded in `tasks.json` under `approvals`
  by the parent when the user gives it. The dispatcher never grants an
  approval and never merges. (First use: `pr61-merge` gates the wiring
  task 0x02 — the branch must be green AND the user must authorize the
  merge before any wiring worker spawns.)

## 2. NEURON PARALLEL ENGINE — agent roles, real mechanisms

The "specialist agents" are roles a worker agent takes, using real
mechanisms that already exist — not new infrastructure:

| Role | Real mechanism |
|---|---|
| ARCHITECT | Parent reads the Genome + AGENTS.md map before briefing |
| CODER | One subagent per worktree; one code agent per checkout |
| OPTIMIZER | Profile first (measured frames/costs), then change |
| TESTER | Standalone throwing asserts + sim + phone probe |
| DEBUGGER | Trace the full path to the failing link before fixing |
| INTEGRATOR | Wiring builds (F-0) — connect systems through shared state |
| VALIDATOR | Parent re-runs asserts + sim + probe + live markers directly |
| ASSET ENGINEER | Import Hub / asset pipeline (existing) |
| WORLD SIMULATION ENGINEER | The village queue itself (this mission) |

Conflicting writes are prevented the way they already are: one code agent
per working tree (separate git worktrees per branch), file ownership in the
brief, the parent sequences commits when a tree is shared. The scheduler
adds one rule the dispatcher enforces: **at most one worker agent active at
a time** while the village chain is serial by dependency. Parallelism is
used for independent tasks on independent worktrees (quest fix ∥ trees was
the proof) and for read-only audits alongside the one code agent.

## 3. NEURON MEMORY MATRIX — what already exists

No new memory system. The scheduler consults, in order: the Genome
(`studio/genome/`), the registry, `~/MEMORY.md` + dated logs, AGENTS.md.
Before modifying a module, the worker's brief points at the indexed
architecture; only changed information is re-read. The queue itself is the
new persistent piece: it records completed tasks, known defects, test
outcomes, and failed approaches per task (fields on the task, not a new DB).

## 4. HYPER EXECUTION SCHEDULER — rules

`scheduler.mjs` is pure: `validate(tasks)` (unique hex IDs, every dep
exists, no dependency cycles), `eligible(tasks, conditions)` (status
`pending` + all deps `done` + all gates pass), `next(tasks, conditions)`
(highest priority eligible, ties to lowest hex ID), `stalled(tasks, now)`
(`in_progress` with no heartbeat past the threshold), `metrics(tasks)`
(counts by status, completions, average task time from timestamps).
A completed dependency releases the next eligible task automatically — the
dispatcher acts on `next()` each run. A stalled task is flagged, never
silently killed. A failed worker's task returns to `pending` with the
failure recorded; it is retried only after the cause is fixed, never
repeated unchanged.

## 5. INSTANT BUILD PIPELINE — encoded practice

Targeted tests during development (the task's own asserts + tsc), full
regression (sim + CI) at integration milestones. Incremental builds via the
existing esbuild bundling for tests and the vite dev server for probes; no
full rebuild after every edit. Batch commits per verified build. Background
validation is the monitor cron + the dispatcher. This section codifies the
§61 practice; it builds no new pipeline.

## 6. ZERO-DEFECT ENGINEERING — the gates

Every code change passes: tsc, its standalone asserts (parent re-runs
them), the sim vs a pristine baseline (zero new failures), a phone probe
(0 page errors), and live-marker verification for shipped builds. Save/load
tests where the change touches persistence. Runtime verification for
gameplay changes. The parent is the independent validator — a worker's
"done" is a claim until the parent verifies it and marks the task `done`.

## 7. SELF-OPTIMIZING ENGINE — measured, not guessed

`status.json` carries the metrics the scheduler computes from the queue:
tasks by status, completions, average task completion time, tool-call and
inspection counts where the parent records them, stalled tasks, and the
current bottleneck (the longest-blocked task + the task the most others
wait on). The parent reviews the bottleneck each checkpoint and fixes the
actual one. No automatic "optimization" of the engine itself runs without
the user's word — the engine changes only by a recorded decision.

## 8. ADVENTURE INTEGRATION — first mission

The village, in dependency order (the queue): quest fix (done) → wire the
coordinator (F-0 + minimal 1.1 adapter) → F-1 entity identity → R-1
resource registry → J-1 job scheduler → forest-to-resident chain → food +
survival → Control Center → 24-simulated-hour test. Then scale. The 2.5D
game and its save data are preserved; nothing here builds a second game.

## 9. LIVE CONTROL CENTER — what exists now

`status.json` (machine-readable) + `STATUS.md` (human-readable), regenerated
by the scheduler each run: active agents, current tasks, completed tasks,
dependency queue, files being modified, build progress, test results,
errors, cache efficiency where measured, parallel execution state,
throughput, bottlenecks. They live in the goal's hidden_files
(`~/workspace/goals/adventure-game-repo-updates-and-deployment/hidden_files/neuron-hex-status.*`),
NOT in the repo — the dispatcher regenerates them every run, and writing
them into the checkout would dirty the tree a build agent is about to use. Controls are the queue and the cron, and they are
real: **pause** = set a task `blocked` (dispatcher will not spawn it);
**resume** = set it `pending`; **priority** = the numeric priority field;
**safe shutdown** = disable the dispatcher cron (running workers finish
their current step; nothing new spawns). A full interactive artifact
dashboard with buttons is a follow-up build, not this one — the control
surface above already works without it.

## 10. AUTONOMOUS OPERATING RULES (encoded, not just written)

Do not spend cycles planning when implementation is possible. Do not repeat
completed audits. Do not wait idle for an independent agent. Do not generate
unnecessary explanations. Do not claim unverified changes. Do not merge or
deploy without authorization. Preserve all completed work. Continue through
the dependency queue automatically. These are §60/§61/§62 — the scheduler
and dispatcher are how they execute without being reread each message.

## Files

- `NEURON_HEX.md` — this design.
- `tasks.json` — the queue (authoritative for "what's next").
- `scheduler.mjs` — the pure engine + CLI (`node scheduler.mjs status`).
- `scheduler.test.mjs` — standalone asserts, run directly with node.
- `neuron-hex-status.json` / `neuron-hex-status.md` — generated snapshots
  in the goal's hidden_files (do not hand-edit; kept out of the repo so the
  dispatcher never dirties the checkout).
- Dispatcher cron `neuron-hex-dispatcher` (5m safety net) — see its saved body for
  the spawn/verify rules.
- `events.mjs` + `events.test.mjs` — append-only timing log + aggregates.
- Hook `neuron-hex-eligible` (script `~/hooks/scripts/neuron-hex-eligible.sh`, 5s poll) — the fast path.

## 11. V1.1 — LIGHTSPEED DISPATCH (2026-11-15, user's order)

The 30-minute dispatcher is replaced by an event-driven system with a fast
fallback. The scheduler itself is NOT rebuilt — V1.1 extends it (release
plan, check mode, events) and preserves commit 8067f654's architecture.

### The five modes, mapped to real mechanisms

| User's mode | Real mechanism | Actual latency |
|---|---|---|
| Event-driven (immediate) | Runtime handoffs: a worker's completion/failure arrives instantly in the parent's context; the parent verifies, updates the queue, and releases the next task in that same turn. User messages are events too. | Immediate (the handoff turn) |
| Ultra-fast (1s target) | **Not available.** The hook system's minimum poll interval is 5 seconds — 1 second cannot be set. The 5s hook is the fastest real fallback. | 5s poll (the floor) |
| Rapid (5s) | Hook `neuron-hex-eligible`, poll_interval_secs 5. Detector: `node scheduler.mjs check` (~110ms, local files only, no API calls). Wakes the dispatcher only when a task is releasable. | 5s |
| Background (30s) | Same hook. A 5s lightweight local check is cheap enough that a separate 30s mode adds nothing; the hook stays silent (no agent turn, no cost beyond ~110ms of local reads) when nothing is releasable. | 5s |
| Idle (event-triggered) | When the queue has no pending task that could become eligible without the user, the parent disables the hook (safe shutdown). Otherwise the hook polls and stays silent — the poll itself is the minimum price of the fast path. | No agent turns while idle |

### The flow (Event → Queue → Worker → Verification)

Task finishes → the runtime delivers a completion handoff (the event) →
the parent verifies the result against the parent standard → the queue
updates (task done, with commit + verification note) → the scheduler
recalculates dependencies → the next eligible task releases (releasePlan,
up to maxWorkers, conflict-checked) → a worker starts on its own worktree
→ verification runs → the result determines the next release. A worker's
"done" is a claim until the parent verifies it.

### What the hook can and cannot see

The hook's detector reads only local files (tasks.json + the monitor state
file). It CANNOT see CI directly: polling the GitHub API every 5 seconds
would burn the shared rate limit (the proxy IP is already rate-limited) and
is not a real option. CI completion reaches the system through the
pr61-validation-monitor cron (20 min) or a parent check — the monitor's
state file is what the scheduler reads, and the hook notices the change
within 5 seconds of the monitor updating it. Faster scheduling cannot
bypass the gates: 0x02 still needs CI green AND the user's merge
authorization, and the hook uses the same eligibility computation as the
scheduler, so it cannot release a gated task.

### Parallel execution

`tasks.json` carries `concurrency: {maxWorkers: 2}`. The release plan is
`releasePlan(tasks, conditions, maxWorkers)`: eligible tasks sorted by
(priority, hex id), capped by free slots (maxWorkers minus active workers),
skipping anything that conflicts with an active task or with a task already
selected. Two tasks conflict when they share a workspace (same worktree, or
both on the main checkout) or when their file lists overlap. The village
chain is serial by dependency, so 2 is a ceiling for independent work, not
a target — the quest-fix ∥ trees pair is the proven shape. The dispatcher
and the hook both re-verify the plan before spawning; if the worker count
is inconclusive, they spawn nothing.

### No wasted execution

- The hook wakes an agent only when a task is releasable; silent polls cost
  ~110ms of local reads and no agent turn.
- The dispatcher cron (5m) is a safety net, not the primary path; it stays
  silent on no-ops.
- The scheduler's `check` mode writes nothing (read-only verdict).
- Duplicate prevention: the release plan subtracts active workers; the
  dispatcher re-checks the agent list before spawning; `duplicate_prevented`
  events are counted in the log.
- **Claim lock (V1.1 fix, 2026-11-15):** the hook fires every 5s, so a
  releasable task would wake a dispatcher on EVERY poll until tasks.json
  flips to in_progress — five wakes in 25s for 0x02 proved it. The hook
  script now writes a claim (`~/hooks/state/neuron-hex-claim.json`,
  {task, claimedAt}) when it wakes (live runs only — dry runs never write
  state), and stays silent while a fresh claim (< 5 min) exists for the
  same task. When the check returns NONE (the task is in_progress, done,
  or no longer eligible) the script clears the claim. The claim is the
  first layer; the dispatcher's agent-list re-check is the second.
  If a dispatcher never runs, the claim expires after 5 min and the hook
  wakes again — no permanent lock.
- Task state survives restarts: tasks.json + the events log are files on
  disk; the scheduler recomputes everything from them.

### Metrics (events log)

`neuron-hex-events.jsonl` in the goal hidden_files. Events: released,
completed, failed, stalled, duplicate_prevented, eligible_detected. The
status snapshot aggregates: total events, completions in the last hour,
average release→completion time, average detection→release time (released
events carry `detectedAt` from the hook's wake payload), duplicate-prevented
and failed counts. Measured 2026-11-15: scheduler `check` 111–115ms (3
runs); hook dry-run silent 139ms, wake 135ms; scheduler asserts 53 passed;
events asserts 10 passed.

### Verification (done 2026-11-15)

- Immediate dispatch after task completion: the parent already releases in
  the handoff turn (proven by the 0x0C spawn in the step-26 handoff turn).
- Hook silent path: dry-run, decision silent, "no releasable task: NONE
  no-eligible", 139ms — correct while 0x0C is in progress.
- Hook wake path: synthetic queue with one releasable task, dry-run
  decision wake, payload {"task":"0x02","detectedAt":"..."}, 135ms. Test
  hook + test script + synthetic queue removed after.
- Restart recovery: the scheduler recomputes from tasks.json + the monitor
  state; no in-memory state exists to lose.
- Concurrent independent tasks: releasePlan asserts (2 released at
  maxWorkers 2, 1 at maxWorkers 1, same-worktree and shared-file tasks
  skipped, active worker consumes a slot, gated task skipped until its
  gate passes).
- Dependency enforcement + duplicate prevention: releasePlan only returns
  eligible tasks; slots subtract active workers; the dispatcher re-checks
  the agent list.
- Pause and shutdown: pause = set a task `blocked`; safe shutdown = disable
  the dispatcher cron + the hook (both listed in Controls).
- The 1-second target is NOT met and is not claimed: the hook floor is 5s.
  The immediate path (handoff) has no poll interval at all.
