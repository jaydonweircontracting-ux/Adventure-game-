# AI Research and Experimentation Engine

**Directive:** SOUL.md §57 §6.
**What already exists:** The revision procedure in `studio/MUSE_EVOLUTION.md` (propose → explain benefit → check compatibility → versioned revision → test → record → rollback), the experiment-like work already done (the Stage 1 harness prototype, the 1008 dirt subdivision, the 1024 wild-lake investigation, the smoke rework after the user's verdict), and the failed-attempts record (the revision log + the dated logs). This file adds the research engine: how experiments are proposed, isolated, evaluated, and recorded. It does not replace the revision procedure — it is the controlled system that feeds it.

## What it explores

From §57 §6 (research targets, in the order the project is most likely to need them):

* Automated debugging (why did this build fail? which link in the chain broke?).
* Advanced code-generation methods (fewer failed generations, fewer corrections).
* Graph-based reasoning (the Development Genome as a queryable graph).
* Evolutionary computation / quantum-inspired optimization (the ACEE quantum-inspired lab — §56; only where it offers measurable benefits, and never pretending classical computers are quantum computers).
* Automated architecture design (the legacy audit's extraction priorities as the input).
* Hardware-aware optimization (SwiftShader vs real-phone performance — the harness FPS is relative only).
* New AI agent architectures (better coordination than one-code-agent-at-a-time + read-only audits).
* Program synthesis, neural-symbolic reasoning, advanced simulation techniques (lower priority — speculative until a concrete problem needs them).

## The experiment procedure (§57 §6)

For each promising approach:

1. **Identify the problem it could solve.** A real, observed problem (e.g. "agents re-scan the repo per task" → repository indexing; "the sim has the 684 rig crash" → automated debugging). Not a solution looking for a problem.
2. **Research the technique.** Read the relevant code/docs first. Do not build on an uninspected premise.
3. **Create a small experiment.** The smallest test that can distinguish "helps" from "doesn't help." (The Stage 1 harness prototype is the model: prove the base-y agreement before touching the renderer.)
4. **Establish a baseline.** Measure before (see `BENCHMARKING.md`). No baseline = no experiment.
5. **Test the alternative.** Run it against the baseline, on the same harness, with the same inputs.
6. **Compare results.** The improvement must be measurable (time, accuracy, regressions, credits). A qualitative "feels better" is not a result.
7. **Record findings.** In the experiment history (see `ADVANCED_MEMORY.md` — the experiment-history store, TO-BE-CREATED). Record the baseline, the alternative, the measurements, and the verdict.
8. **Adopt it only when beneficial.** Keep it only if the measurement improves. Otherwise revert it and record the failure.

## Isolation (the evolution sandbox)

* **Never let experimental code silently overwrite stable production code.** Experiments run in a sandbox: a separate worktree (under `/home/hatch/`, never `/tmp` — 512 MB tmpfs), a separate branch, or a scratch directory under `~/workspace/verify*/`. Never in the repo working tree while 1030's uncommitted work is there.
* **Experimental code never reaches main unverified.** An experiment that "works" in the sandbox still goes through the normal pipeline (GENERATED → COMPILED → TESTED → INTEGRATED → VERIFIED → APPROVED — see `VERIFICATION_INTELLIGENCE.md`) before it touches the game.
* **The sandbox is disposable.** If an experiment fails, the sandbox is discarded. The findings are kept; the code is not.

## What happens to failed experiments

* **Recorded in the failed-attempts memory, not deleted.** The finding ("X does not help because Y") is as valuable as a success — it stops the next agent from trying X again. The record goes in the experiment history + the `MUSE_EVOLUTION.md` revision log (the known-gaps section is the model: the environment write failure, the MEMORY.md truncating-write rule, the assert-runner no-pipe rule, the subagent push transient rule all came from real failures).
* **A failed experiment is not a failed cycle.** The §50 rule: do not manufacture changes to fill a report, and do not spend more resources auditing than improving the game. A clean, recorded failure is a productive cycle.
* **Avoid expensive speculative development without measurable potential.** (§57 §6.) If the experiment's expected value (impact × success probability ÷ cost — see `RESOURCE_INTELLIGENCE.md`) is low, do not run it. The research engine proposes; the expected-value formula disposes.

## Current state

The research engine as a system does NOT exist yet — this file is its specification. What exists: the procedure (this file + the `MUSE_EVOLUTION.md` revision procedure), the sandbox convention (worktrees under `/home/hatch/`, scratch under `~/workspace/verify*/`), and a history of experiment-like work (Stage 1, 1008, 1024, the smoke rework). What is missing: the experiment-history store (TO-BE-CREATED), the automated baseline comparison (currently manual), and any running research program. The first research task, now that the genome exists (v1, 2026-11-07), is the repository-indexing experiment (does a queryable index reduce per-task repo scans measurably?).
