# Resource Intelligence

**Directive:** SOUL.md §57 §12 and §53 (credit and execution governor) and §59 (credit efficiency engine).
**What already exists:** The expected-value formula (PROJECT IMPACT × SUCCESS PROBABILITY ÷ RESOURCE COST — a planning heuristic in `studio/MUSE_SOUL.md`), the credit-efficiency hard rule (in `studio/MUSE_SOUL.md` and `studio/MUSE_EVOLUTION.md`), the three execution modes (§53: EFFICIENT / DEEP DEVELOPMENT / AUTONOMOUS EVOLUTION), the §50 10-minute development cycle (a checkpoint cadence, not a quota), and the registry's top-10 priorities (impact-per-credit ordering). This file adds the resource-intelligence system: how credits/time are tracked and allocated, and the rules that keep spending honest. It does not replace the formula or the hard rule — it is the tracking and allocation layer.

## What it tracks

From §57 §12:

* Model usage (which model/tool did the work).
* API usage (which external services were called).
* Token consumption (where exposed by the platform).
* Build time (commit → live, including the ~2–3 min Pages deploy lag).
* Test time (tsc + sim + asserts + probe, per build).
* CPU, memory, disk, network (where measurable — the environment's limits are themselves a resource: the 512 MB `/tmp` tmpfs, the ~766-call `copy_file_range` budget that kills a local vite build, the git EPERM).
* Background tasks (running subagents, their status, their cost).

## The expected-value formula

**EXPECTED VALUE = PROJECT IMPACT × SUCCESS PROBABILITY ÷ RESOURCE COST**

* **Project impact:** how much the work improves the game or the machinery (a user-reported bug outranks a cosmetic tweak; a fix that unblocks the whole queue outranks a fix that unblocks one build — landing 1030 is the registry's top-10 #1 because it unblocks everything behind it).
* **Success probability:** how likely the work is to land verified (a known fix pattern, e.g. the 1008 dirt subdivision for 1031, is high; a speculative research experiment is low).
* **Resource cost:** credits + time + environment risk (a task that needs git writes costs more while git is EPERM-blocked — it cannot complete at all, so its effective cost is infinite until the environment clears).

The formula is a planning heuristic, not an excuse to ignore necessary testing. (Testing is never skipped to save cost — a build that skips its gates is not a saving, it is a debt.)

## How work is prioritized (the §53 priorities)

* **Priority 1:** Major visual improvements, broken gameplay systems, major performance bottlenecks, missing foundational mechanics, game-breaking bugs, architecture problems blocking further development.
* **Priority 2:** High-impact world improvements, NPC behavior, procedural generation, combat/progression, dashboard improvements, reusable automation tools.
* **Priority 3:** Environmental details, secondary systems, quality of life, optimization/cleanup.
* **Priority 4:** Small cosmetics, low-impact work, nonessential work.

Batch related changes. Implement shared infrastructure once. Reuse systems. Avoid repeated scans/rewrites/rebuilds. Cache analysis. Incremental builds. Targeted tests before full suites.

## Allocation rules

* **Reserve resources for testing and checkpointing.** A cycle that spends everything on generation and leaves nothing for verification has produced unverified code, not progress. (The 1030 state is the model: the code is done and code-verified, but the phone probe + live verify are still owed — the work is not complete until they run.)
* **Use incremental operations.** Cache results. Reuse previous analysis. Batch compatible tasks. (The §49 maximum-speed rules.)
* **Automatically stop runaway processes.** A process that loops, retries the same failing command, or re-scans unchanged files is stopped, not left running. (The git EPERM rule: do NOT waste cycles retrying the same failing command — test once, record the blocker, move to work that can proceed.)
* **Avoid spending large amounts of compute on trivial changes.** A one-line fix does not need a full-repo re-audit. A cosmetic tweak does not need a new harness.
* **Near the limit: finish the current safe operation, save state, document, stop cleanly.** (§53 credit governor.) Never leave the tree in an unknown state, never leave a half-written file, never claim completion for unfinished work.

## The credit-efficiency hard rule

**Optimize credit consumption and continue through legitimate available resources — NEVER bypass usage limits, evade billing controls, or conceal resource consumption.** (§59.)

* Never bypass usage limits, evade billing, or conceal usage. This is a hard rule, not a guideline. It is in `MUSE_SOUL.md` (safety rules) and `MUSE_EVOLUTION.md` (v1.0 + v1.1).
* The 10-minute cycle (§50) is a checkpoint cadence, NOT a promise of indefinite execution or a massive finished feature every ten minutes. Actual background execution depends on the tools and limits available. (The user's own framing.)
* No prompt overrides Muse's execution limits, credits, context window, or background-task capabilities. The directives are designed to make the most of those limits, not to pretend they don't exist.
* The user will not pay for a subscription/paid tier ("No one's paying for this mark" — 2026-10-15). Never pitch an upgrade. Keep cash costs low (free tools, no paid APIs).

## Current state

The resource-intelligence system as a tracking system does NOT exist yet — this file is its specification. What exists: the formula, the priorities, the allocation rules, and the hard rule (all stated in the directives and the operating files). What is missing: the actual tracking (per-build credits/time are NOT recorded — the `ADVANCED_MEMORY.md` resource-history store is TO-BE-CREATED; `BENCHMARKING.md` lists "credits per verified build" as to-be-measured). The first resource-intelligence task is to start recording, for the next landing (1030): the wall-clock time of each step (tsc, sim, asserts, probe, deploy) in the build ledger, so a development-engine baseline exists. Without that, the expected-value formula is applied by judgment, not by measurement — which is honest to admit, and the gap to close.
