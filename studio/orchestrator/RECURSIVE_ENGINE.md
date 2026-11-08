# Recursive Development Engine

**Directive:** SOUL.md §57 §2 — a major priority.
**What already exists:** The autonomous engine (`scripts/autonomous-engine.mjs`, BUILD 573 — a session controller, stale Oct-era, unobserved in the current environment), the revision procedure in `studio/MUSE_EVOLUTION.md` (propose → explain benefit → check compatibility with `MUSE_SOUL.md` → versioned revision → test → record → rollback), the registry (`studio/IMPLEMENTATION_REGISTRY.md`), the dashboard data (`studio/dashboard/`), and the Development Genome (v1, 2026-11-07: `studio/genome/` — scanner + genome.json + query.mjs). This file adds the recursive engine itself: the system that improves the tools and processes that build ASHFALL. It does not replace the autonomous engine or the evolution procedure — it is the mechanism that drives them.

## What the recursive engine is

The system's capability to improve the tools and processes that build ASHFALL — not just the game. It looks at how development is going, finds the weakest part of the machinery, creates a task to improve that part, tests the improvement against the previous behavior, and keeps it only if it measurably helps. Then it repeats.

## What it improves

From §57 §2, in priority order (highest-leverage first):

1. **Repository indexing** — finding the right file/module without repeated full-repo scans. (Current state: the Development Genome is the queryable index (v1, 2026-11-07, `studio/genome/`); agents should query it instead of re-scanning the repo per task.)
2. **Code-generation accuracy** — fewer failed generations, fewer corrections. (Current state: unmeasured. See "Baseline" below.)
3. **Test selection** — running the smallest relevant suite first, broader verification at milestones (the §49 rule). (Current state: practiced by convention in the build-agent brief; not automated.)
4. **Dependency detection** — knowing what a change actually touches before making it. (Current state: the legacy audit's import-graph analysis is the method; it is a one-off audit, not a live tool.)
5. **Architecture analysis** — the health checks and the extraction priorities from the legacy audit, kept current. (Current state: the audit is a snapshot at 1029; it goes stale as the code changes.)
6. **Task prioritization** — the expected-value formula (PROJECT IMPACT × SUCCESS PROBABILITY ÷ RESOURCE COST) applied to the queue. (Current state: practiced by the parent; the registry's top-10 is the output.)
7. **Performance profiling** — the Stage 1 baseline and the benchmarking system (`BENCHMARKING.md`). (Current state: the baseline exists; continuous profiling does not.)
8. **Development memory** — the advanced memory (`ADVANCED_MEMORY.md`) and the operating files. (Current state: `~/MEMORY.md` + dated logs + `studio/`; the structured, semantically-retrievable memory is not yet built.)
9. **Agent coordination** — the task scheduler (`TASK_SCHEDULER.md`) and the file-ownership rule. (Current state: the rule exists and is enforced by the parent; the scheduler is this directory's coordination layer.)

## How it evaluates its own effectiveness

Measurable indicators (§57 §2). For each, the current baseline is stated where it exists; the rest are to-be-measured (marked as such — do not invent numbers).

| Indicator | What it measures | Current baseline (2026-11-07) |
|---|---|---|
| Successful implementations | Builds that land verified (commit hash + live verification) | 14 builds verified live in the ledger (1016–1029). 1030 is implemented + code-verified but NOT live (environment-blocked). |
| Compilation failures | `tsc --noEmit` failures per build | TO-BE-MEASURED. No per-build compilation-failure count is recorded. (1030: tsc clean, exit 0 — the only recorded data point in this cycle.) |
| Regression frequency | Sim-vs-pristine diffs that are NOT identical, or asserts that fail after a change | TO-BE-MEASURED as a rate. Recorded instances: 0 regressions in the sim-vs-pristine diffs for 1026–1030 (all identical, 0 FAIL — the only failure is the known 684 rig crash). |
| Average task completion time | Time from queue-item start to verified landing | TO-BE-MEASURED. The dated logs record build dates, not durations. (Known: 1029 landed first try; 1024 needed an empty re-trigger deploy; 1021 needed a re-trigger deploy.) |
| Repeated work | Tasks re-done because a previous completion was lost, or the same problem solved twice | TO-BE-MEASURED as a count. Known instances: the MEMORY.md truncation (restored, not re-done); the 1022 hunk-sweep (file-ownership rule created in response); the dashboard-data honesty gap (fixed, not re-done). |
| Resource consumption | Credits/time per verified build (see `RESOURCE_INTELLIGENCE.md`) | TO-BE-MEASURED. The expected-value formula exists; per-build credit consumption is not recorded. |
| Test reliability | False failures / false passes in the test harness | Known: one false failure (a piped assert run returned a false failure with elided output — the rule is now to run asserts DIRECTLY, no pipe, no `&&` chain). Post-commit scope-guard failures are harness artifacts, not game defects (1022, 1025, 1027, 1028, 1029 precedents). No rate is recorded. |
| Optimization improvements | Measured improvements vs the previous baseline | Stage 1 baseline exists (see `BENCHMARKING.md`). No optimization has been measured against it yet (Stages 2–6 are queued). |

## How a weakness becomes a task

1. An indicator moves in the wrong direction (or a failure repeats).
2. The engine identifies the responsible subsystem (from `SUBSYSTEM_REGISTRY.md`).
3. It creates a task in the queue with: the indicator, the measurement, the suspected cause, the subsystem, and the expected improvement.
4. The task is prioritized by expected value (impact × success probability ÷ cost).
5. The improvement is implemented, then tested against the subsystem's previous behavior.
6. It is kept only if the measurement improves. Otherwise it is reverted and the failure is recorded (see `RESEARCH_ENGINE.md` — failed experiments are recorded, not deleted).

## Safety rules (from §57 §2)

* **Any modification to the development engine itself must be tested against its previous behavior.** A change to the scheduler, the registry, the benchmarking system, or the memory must not silently change what those systems report.
* **Maintain a known-good version and rollback capability.** Every versioned file (`MUSE_EVOLUTION.md`, the dashboard data, the registry) keeps its previous version recoverable: the dashboard data has dated snapshots (`studio/dashboard/snapshots/`); `MUSE_EVOLUTION.md` keeps the full revision log; the registry's next update trigger is a landing, not a rewrite.
* **Never silently disable safeguards, remove recovery mechanisms, or corrupt project memory.** (MUSE_SOUL.md safety rules.) A recursive improvement that removes a safeguard is a regression, not an improvement.
* **The engine improves the machinery; it does not become the game.** (§50 development priority.) If a recursive-engine task competes with a game task for the same cycle, the game task wins unless the machinery task unblocks it.

## What the recursive engine is NOT

* It is not ACEE (`studio/acee/` — the code evolution engine, in creation by a parallel agent). ACEE is the engine that generates/optimizes code; the recursive engine is the loop that improves the tools (including ACEE) based on measured effectiveness.
* It is not the autonomous engine (`scripts/autonomous-engine.mjs`). That is the session controller that runs the cycles; the recursive engine is the self-evaluation inside those cycles.
* It is not a claim of genuine AGI or unrestricted self-learning. (§53.) It is a measured feedback loop: indicators → task → test → keep-or-revert.

## Current state

The recursive engine as a system does not exist yet — this file is its specification. Its components exist in part: the revision procedure (`MUSE_EVOLUTION.md` v1.1 is the first versioned revision, the gate-evidence rule, tested and kept), the registry (the measurement source), the dashboard data (the record), the Development Genome (the index the engine queries — v1, 2026-11-07, `studio/genome/`), and the task scheduler (this directory). The missing pieces are: automated indicator tracking (the counts above are hand-recorded — the genome now supplies them: `query.mjs status`), and the automatic task-creation step (currently the parent creates the task). The first recursive-engine task is to automate the indicator table above from the genome.
