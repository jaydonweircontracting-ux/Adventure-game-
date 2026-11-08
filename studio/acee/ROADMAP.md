# ACEE Roadmap

**Status:** Plan. Version 1.0 — 2026-11-07.
**Directive:** SOUL.md §56 §17 (Implementation roadmap) + §56 §16 (Safety, control and recovery).
**Location:** `studio/acee/ROADMAP.md` (this file).

Build this system incrementally. Each phase has an objective, deliverables, dependencies, completion criteria, and a current status. A phase is not complete because its spec was written — it is complete when its completion criteria are met with evidence.

## Phase 1 — Intelligence Foundation

* **Objective:** Create the development genome, symbol index, dependency graph, and incremental repository scanner.
* **Deliverables:** The genome index (machine-readable, queryable); the symbol index (AST analysis); the dependency graph (static + dynamic imports + runtime references); the incremental scanner (change detection + file fingerprints, never a full re-scan when only a few files changed).
* **Dependencies:** None (this is the foundation). Its inputs already exist: the Master Implementation Registry (88 requirements), the Legacy Codebase Audit (248 files classified A–E), the architecture map (AGENTS.md), and the dashboard data.
* **Completion criteria:** The index answers "what depends on X," "what implements Y," "what is duplicated," "what breaks if I remove X," and "what is the blast radius of this change" — without a full re-scan, and with the answers matching the registry/audit where they overlap. A query that returns a wrong answer is a defect, not a limitation.
* **Current status: DONE for the index.** The genome v1 index exists (`studio/genome/genome.json`, 2026-11-07, Phase 1) and answers queries (`studio/genome/query.mjs`: status, depends-on, blast-radius, implements, duplicates, cycles, remove, next-task, search). What remains for Phase 1 as a whole: orchestrator activation (objectives 3–9) — the index alone does not complete the phase.

## Phase 2 — Code Generation

* **Objective:** Create the objective-to-code pipeline, automatic file factory, and integrated validation.
* **Deliverables:** The 14-step pipeline (interpret → identify architecture → retrieve code → identify missing functionality → determine dependencies → create plan → generate files → modify existing files → generate interfaces → generate tests → integrate → validate → measure → save); the file factory (templates, registration, naming, placement — see `CODE_FACTORY.md`); integrated validation (tsc + asserts + sim vs pristine, run automatically on every generation).
* **Dependencies:** Phase 1 (the genome must exist to locate relevant systems and to check whether equivalent functionality already exists).
* **Completion criteria:** A submitted objective produces a complete implementation (source files + updated interfaces + supporting systems + tests + documentation + performance measurements + dependency updates + Git change records) that passes the gates — with no manual assembly of disconnected snippets.
* **Current status: NOT STARTED.** The pipeline is currently the build-agent brief operated by hand (BUILD 1030 is its most recent output: 7 files, tsc clean, 97 + 47 asserts pass, sim identical to pristine1029). The factory spec is in `CODE_FACTORY.md`. No pipeline code exists.

## Phase 3 — Multi-Agent Engineering

* **Objective:** Implement specialized agents, coordination, task ownership, and parallel execution.
* **Deliverables:** The 11 roles (Architect, Researcher, Code Generator, Optimizer, Debugger, Test Engineer, Security Engineer, Integration Engineer, Visual Engineer, Memory Engineer, Supervisor — see `MULTI_AGENT_LAB.md`); the shared project graph + task registry; file ownership; task locks; branch isolation; integration checkpoints.
* **Dependencies:** Phase 2 (the generation pipeline — agents operate the pipeline) + Phase 1 (the genome — the shared project graph).
* **Completion criteria:** The 11 roles operate with file ownership + task locks + branch isolation, and no file is rewritten by two agents. The hard rule holds: one code agent at a time on the shared checkout (the 1022 lesson); read-only audits run in parallel.
* **Current status: NOT STARTED.** The lab spec is in `MULTI_AGENT_LAB.md`. The current practice is the parent agent spawning subagents by hand, with the one-code-agent rule enforced by the parent. No lab infrastructure exists.

## Phase 4 — Optimization Lab

* **Objective:** Implement quantum-inspired optimization experiments, benchmarks, and implementation scoring.
* **Deliverables:** The computation lab (simulated annealing, genetic algorithms, evolutionary optimization, constraint solving, graph optimization, probabilistic search, Monte Carlo, Bayesian optimization, parallel search, reinforcement learning — see `OPTIMIZATION_LAB.md`); the benchmark set (world buffer, rebuild time, teleport hitch, harness FPS, sim diff, assert counts, tap journeys); the evolution formula scoring (see `CODE_EVOLUTION_FORMULA.md`).
* **Dependencies:** Phase 1 (the baseline measurements — the Stage 1 baseline is the reference point) + Phase 2 (candidate generation — the lab needs candidates to score).
* **Completion criteria:** At least one optimization is retained because it demonstrably improved a benchmark (with before/after numbers on the same harness). A technique that improves nothing is removed.
* **Current status: NOT STARTED.** The lab spec is in `OPTIMIZATION_LAB.md`; the formula spec is in `CODE_EVOLUTION_FORMULA.md` (including the worked example: BUILD 1030 scores 34, a hypothetical movement-system rewrite scores 10). No lab code, no benchmarks beyond the Stage 1 baseline, and no technique has been tried yet.

## Phase 5 — Self-Improvement

* **Objective:** Connect development telemetry, historical learning, automated diagnosis, and workflow optimization.
* **Deliverables:** Telemetry (time spent searching/generating/testing, compilation failures, test failures, repeated errors, duplicate work, rebuild time, token consumption, tool usage, successful patterns, regression frequency); historical learning (the evolution ledger); automated diagnosis (a failure proposes the workflow fix); workflow optimization (the pipeline improves based on measured results).
* **Dependencies:** Phases 1–4 (telemetry needs the pipeline + the lab to measure; learning needs history to learn from).
* **Completion criteria:** A workflow change is proposed, tested, and kept because it measurably improved a metric (e.g. fewer compilation failures, less re-scanning, faster time-to-verified-build). The change is recorded as a versioned revision in `studio/MUSE_EVOLUTION.md` with its test result.
* **Current status: NOT STARTED.** The memory engine spec is in `MEMORY_ENGINE.md`. The first versioned instruction set exists (`studio/MUSE_EVOLUTION.md`, now v1.1 — including the gate-evidence rule from the 2026-11-07 honesty-gap fix), but it is maintained by hand, not by a telemetry-driven loop. No telemetry is collected.

## Phase 6 — Dashboard Integration

* **Objective:** Connect the entire machine to the existing ASHFALL development dashboard.
* **Deliverables:** The CODE EVOLUTION LAB section in the live dashboard (see `CODE_EVOLUTION_LAB.md`): objective submission, repository intelligence, architecture graph, file-generation activity, agent activity, optimization experiments, code quality, build status, test status, performance comparisons, resource consumption, change previews, approval controls, rollback controls, evolution history.
* **Dependencies:** Phases 1–5 (the machine must exist before it can be surfaced — a dashboard section that shows fake activity is worse than no section).
* **Completion criteria:** The CODE EVOLUTION LAB section reads from `studio/dashboard/dashboard-data.json` + the registry (no separate hard-coded copy), shows real agent/file-generation activity, every control performs a real action, and every number has evidence behind it (never fake percentages).
* **Current status: NOT STARTED.** The interface spec is in `CODE_EVOLUTION_LAB.md`. The live dashboard artifact (`ashfall-development-dashboard`, verified 2026-11-07) does not yet have a CODE EVOLUTION LAB section.

## Phase 7 — Autonomous Evolution

* **Objective:** Allow the machine to receive objectives, plan, implement, test, optimize, checkpoint, and continue independently within configured budgets.
* **Deliverables:** The autonomous loop (receive → plan → implement → test → optimize → checkpoint → continue), the credit/execution governor (budgets, stopping thresholds, clean shutdown — save state, document, stop), and the continuation protocol (a fresh session reads the resume point and continues without re-explanation).
* **Dependencies:** Phases 1–6 (the whole machine must exist and be surfaced before it runs on its own).
* **Completion criteria:** The machine completes a full objective (submit → implement → test → verify → checkpoint) without manual intervention, within a configured budget, with the gates passing — and the result is a verified build with a commit hash + a play link, reported in the same DONE/TESTED/BROKEN/NEXT shape as a hand-operated build.
* **Current status: NOT STARTED.** This is RUN mode (§49) + the 10-minute cycle (§50) + the autonomous god-tier engine (§53), operated by the machine rather than by hand. The user's framing governs: the 10-minute target is a checkpoint cadence, not a promise of indefinite execution; actual background execution depends on the tools and limits available; no prompt overrides Muse's execution limits, credits, context window, or background-task capabilities.

## Safety, control and recovery (§56 §16)

The machine must not be allowed to damage the project while experimenting. These rules apply to every phase, from Phase 1 onward — they are not deferred to Phase 7.

* **Version-controlled changes.** Every change is a commit (or a worktree/branch) with a message, a hash, and a parent. No change exists only in a working tree.
* **Isolated branches or worktrees.** Larger changes use a feature branch; experiments use a worktree under `/home/hatch` (never `/tmp` — 512 MB tmpfs). The shared checkout is never an experiment.
* **Atomic file writes.** Validate existing → save backup → write replacement to a temp file → validate replacement → atomically replace → verify. If anything fails, retain the previous valid version. (The §54 procedure, written after the MEMORY.md truncation.)
* **Automatic backups.** A backup is saved before every replacement. Snapshots are dated and never overwritten.
* **Patch previews.** A change is previewed (diff) before it is applied. The CODE EVOLUTION LAB's change-preview view exists for this.
* **Dependency validation.** Every import resolves; every save key round-trips; every new dependency is reviewed (the Security Engineer's job).
* **Compilation checks.** `tsc --noEmit` must exit 0. A build that does not compile is not a build.
* **Test gates.** The four gates (§50) with real evidence. A gate that has not run is NOT RUN; a gate that fails is FAILED.
* **Rollback.** Restore the last verified checkpoint (git checkpoint + dashboard snapshot). Rollback is always available and always safe.
* **Resource limits.** Budgets, stopping thresholds, clean shutdown (finish the current safe operation, save state, document, stop). Never exceed hard limits. Reserve resources for testing, recovery, and reporting.
* **Operation logs.** Every operation is logged (what was done, by whom, with what result). The dated logs + the build ledger are the log.

### Approval

**Require approval for destructive operations, major architectural changes, external uploads, and operations with irreversible consequences.** Allow safe, reversible, low-risk improvements to proceed automatically. The approval control lives in the CODE EVOLUTION LAB (Phase 6); until it exists, approval happens in chat with the user (the current practice — the user orders a build, the parent reports DONE/TESTED/BROKEN/NEXT).

### Hard prohibitions (never, in any phase)

* **Never expose secrets, credentials, or private environment variables** to agents or generated logs. Pasted tokens are treated as exposed and never quoted back. A push failure is handled by a parent push, never by extracting credentials.
* **Never automatically push unverified code.** A push happens only after the gates pass and the commit is reviewed.
* **Never bypass usage limits, evade billing controls, or conceal resource consumption** (§59 hard rule). Optimize within legitimate limits.
* **Never silently overwrite stable production code** with experimental code (the sandbox rule).
* **Never claim a build is verified without evidence** (the gate rule; the honesty-gap fix is the cautionary example).
* **Never delete a file based solely on its name** (the legacy audit's rule — verify references, dependencies, and save compatibility first; remove only verified obsolete code, with a recoverable checkpoint).
