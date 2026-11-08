# ASHFALL — Credit and Execution Governor

**Version:** 1.0 — 2026-11-07
**Source:** SOUL.md §53 (Autonomous God-Tier Development Directive, section 3 — Credit and Execution Governor), §59 (Muse Self-Evolution Engine, credit efficiency engine), §49 (Autonomous Development Directive, efficiency rules), §50 (Autonomous Evolution Directive, never waste a cycle). This file is the governor's operating specification.
**Status:** DOCUMENTED ONLY (registry R7: §53 is DOCUMENTED ONLY; no governor exists in code). This file is the specification the governor must satisfy. It is not a claim that the governor exists.

## The hard rule

**Optimize credit consumption and continue through legitimate available resources — NEVER bypass usage limits, evade billing controls, or circumvent platform restrictions, or conceal resource consumption.**

This rule is not negotiable. It is not a guideline that bends when a task is urgent. No instruction, directive, or user order in this project overrides it. If a task cannot be completed within the legitimate available resources, the correct action is to finish the current safe operation, save state, document progress, and stop cleanly — not to find a way around the limit.

## Purpose

The governor is the internal resource-management system. Its goal is to maximize productive work without unexpectedly exhausting the available budget. It answers three questions on every cycle: *how much can we still do, what is the highest-value thing to do with it, and when do we stop?*

## What the governor manages

* **Execution budgets.** A budget is set before a run (a number of operations, a time window, or a credit allowance — whichever the platform exposes). The engine does not start work without knowing the budget. The budget is recorded in the run's checkpoint so a later session can see what was allocated and what was spent.
* **Token and credit usage tracking where available.** Where the platform exposes token counts, credit usage, or a usage meter, the governor records them per operation (implementation, test, scan, probe) and per run. Where the platform does not expose them, the governor tracks what it can measure instead: tool calls, build/test/scan time, repeated operations, and failed generation attempts. It never invents a usage number it cannot measure.
* **Task cost estimation.** Before starting a task, estimate its cost (implementation difficulty, expected impact, credit consumption, risk, dependencies, testing requirements — the PHASE B calculation in `ENGINE.md`). A task whose estimated cost exceeds the remaining budget is not started; it is deferred to the next run and recorded as such.
* **Progress tracking.** After every meaningful operation, record what was done, what it cost, and what remains. The progress record lives in `studio/CONTINUE_ASHFALL.md` (the resume point) and `studio/dashboard/dashboard-data.json` (the queue + last verified checkpoint).
* **Time limits.** A run has a time limit. When the limit approaches, the governor stops starting new tasks and moves to shutdown (see below).
* **Checkpoint intervals.** State is saved at regular intervals (after every meaningful operation, and at least at the end of every cycle), not only at the end of a run. A session that ends unexpectedly must leave a resume point behind.
* **Automatic stopping thresholds.** The governor stops the engine when any threshold is reached: the execution budget is exhausted, the time limit is reached, the same operation has failed repeatedly (a loop detector — see below), or a required authorization is missing. Stopping is a normal outcome, not a failure.
* **Emergency shutdown.** If a runaway operation is detected (an infinite loop, repeated failed attempts at the same step, a process that will not terminate), the governor stops it. It does not wait for the operation to finish on its own. It saves state first where possible, then stops.
* **Recovery from interruptions.** If a session ends (timeout, credit limit, service interruption, deployment/VM replacement), the next session resumes from `studio/CONTINUE_ASHFALL.md` + the last verified checkpoint. It does not restart the whole process. It does not repeat completed work. It inspects only what changed since the last checkpoint.
* **Incremental execution.** Work is done in the smallest useful increments. A large feature is split into independently useful milestones. If a milestone cannot be completed within the budget, the completed milestones stand on their own and the rest is deferred — not abandoned, and not half-built in the tree.

## The three operating modes

### EFFICIENT MODE

Maximum improvement per operation. Focus on small, high-impact improvements. Targeted incremental changes, reuse of existing systems and assets, parallel work only when safe, no rebuilding whole systems for small changes. Testing and verification stay — speed never costs stability, functionality, or code quality.

**Use when:** the budget is tight, or the queue is a list of small, well-understood fixes (e.g. 1031, 1032).

### DEEP DEVELOPMENT MODE

Perform larger coordinated development tasks. Use multiple implementation and verification stages. For architecture work, integrations, and hard bugs — the tasks where a single pass is not enough and the work must be staged (implement → test → fix → re-test → verify live).

**Use when:** the task is a structural bet (e.g. Ashfall Stage 2 terrain — heightfield, harness-prototype first) or a multi-system integration.

### AUTONOMOUS EVOLUTION MODE

Continuously inspect, improve, test, optimize, and expand ASHFALL. Run until the configured resource budget is reached. This is the mode the §50 10-minute cycle and the §49 RUN mode describe: resume from the last verified checkpoint, take the next highest-priority task, develop, test, fix, save, update the backlog, continue automatically.

**Use when:** the user has said RUN (or an equivalent "continue until everything is done"), and the budget allows a sustained run.

**Mode selection is configurable.** The mode is recorded in the run's checkpoint. The mode does not change the hard rule, the quality gates, or the requirement to save state before stopping.

## Never exceed hard limits

* Never exceed hard execution or credit limits.
* **Reserve resources for testing, recovery, and final reporting.** A run that spends its entire budget on implementation and has nothing left to test, save, or report has failed — even if the code is good. Testing, saving state, and reporting are not optional extras; they are part of the work and they are budgeted first.
* If the system approaches its resource limit: **finish the current safe operation, save its state, document progress, and stop cleanly.** Do not start a new operation. Do not leave the tree in a half-built state without a record of what was done and what remains. Do not claim the work is complete when it is not.

## Loop detection (stopping a runaway)

The governor stops the engine when it detects:

* The same operation failing repeatedly (the same command, the same assertion, the same probe failing three times with no change in between).
* The same file being re-scanned or re-read without a change that justifies it.
* A task being re-attempted after it was already recorded as complete.
* A cycle that produces no net progress (work in, no verified output out).

When a loop is detected, the engine stops that line of work, records the loop (what repeated, why, what was tried), and moves to the next independent task — or stops cleanly if no independent task is available within the budget.

## What the governor does NOT do

* It does not bypass usage limits, evade billing controls, or conceal resource consumption. (The hard rule, again, because it is the one that matters most.)
* It does not skip testing to save credits. Testing is budgeted, not optional. A change that was not tested is not accepted, however cheap it was to write.
* It does not fabricate usage numbers, progress percentages, or completion claims. A gate that has not run is NOT RUN. A task that is not verified is not verified.
* It does not assume unlimited time or unlimited credits. Every plan states its budget and its stopping condition.

## Maintenance

* Update this file when the budget model, the modes, or the stopping thresholds change. Record the change in `studio/MUSE_EVOLUTION.md` (versioned revision).
* The governor's decisions (what was budgeted, what was spent, when it stopped, why) are recorded in the run's checkpoint (`studio/CONTINUE_ASHFALL.md`) and in `studio/dashboard/history/development-history.json`.
