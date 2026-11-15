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
- Dispatcher cron `neuron-hex-dispatcher` (~30m) — see its saved body for
  the spawn/verify rules.
