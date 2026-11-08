# ACEE — ASHFALL Code Evolution Engine

**Status:** Specification + Phase 1 seed. Version 1.0 — 2026-11-07.
**Location:** `studio/acee/` in the Adventure Game repo.
**Directive:** SOUL.md §56 (ASHFALL — QUANTUM-INSPIRED AUTONOMOUS CODE EVOLUTION MACHINE).
**Companion files in this directory:** `DEVELOPMENT_GENOME.md`, `CODE_EVOLUTION_FORMULA.md`, `MULTI_AGENT_LAB.md`, `OPTIMIZATION_LAB.md`, `CODE_FACTORY.md`, `VALIDATION_LAB.md`, `MEMORY_ENGINE.md`, `CODE_EVOLUTION_LAB.md`, `ROADMAP.md`.

## What ACEE is

ACEE (the ASHFALL Code Evolution Engine) is a **separate engineering subsystem** whose job is to build, repair, optimize, and evolve ASHFALL itself. It is the central processing intelligence for development. It accepts natural-language instructions, entire development objectives, existing source code, multiple files, repository references, architecture documents, error reports, performance data, screenshots and visual references, and existing implementation history — and it turns an objective into a verified implementation.

Its responsibilities (§56 §1):

1. Understand the requested outcome.
2. Locate relevant systems automatically.
3. Build a dependency map.
4. Identify existing reusable functionality.
5. Determine what needs to change.
6. Calculate an implementation strategy.
7. Generate required code and files.
8. Integrate changes.
9. Run tests.
10. Optimize the result.
11. Save verified changes.
12. Record lessons for future development.

The user submits one objective and the machine handles the technical workflow: understand the architecture, determine what needs to happen, create the necessary code, integrate it, and prove that it works.

## What ACEE is NOT

* **Not a game feature.** Nothing in this directory ships to the player. ACEE never appears in the game, the Build menus, or the play screen. It is development infrastructure, not gameplay.
* **Not a dashboard.** The dashboard (`studio/dashboard/`, live artifact `ashfall-development-dashboard`) reports on development; ACEE does development. The CODE EVOLUTION LAB (`CODE_EVOLUTION_LAB.md`) is ACEE's interface *inside* the dashboard — it is not a second dashboard.
* **Not a collection of scripts.** ACEE is a connected machine (genome → generation → validation → memory → optimization), not a folder of disconnected utilities.
* **Not a replacement for the game.** ACEE evolves ASHFALL; it does not replace it, rebuild it, or define what the game should be. Game direction comes from the user and the directives in SOUL.md (§48–§59).
* **Not a quantum computer.** Classical computers are not quantum computers. ACEE uses quantum-*inspired* mathematics (simulated annealing, genetic algorithms, Bayesian optimization, and the rest — see `OPTIMIZATION_LAB.md`) only where they offer measurable benefits, and it benchmarks every technique before keeping it.

## The separation principle

ACEE is a separate engineering subsystem, not a feature buried inside the game. That separation makes it reusable for every future project. The game (`src/`, `scripts/`, `public/`) must never import from `studio/acee/`, and ACEE must never be required for the game to build, run, or ship. If ACEE were deleted tomorrow, ASHFALL would still build and play exactly as before.

The same separation applies to the other development systems in `studio/`:

| System | Job | Lives in |
|---|---|---|
| ACEE (this directory) | Build, repair, optimize, and evolve the codebase | `studio/acee/` |
| Autonomous engine (§53) | Long-run development loop (OBSERVE → THINK → BUILD → TEST → OPTIMIZE → DOCUMENT → REPEAT) | `studio/autonomous-engine/` |
| Dashboard data (§54) | The permanent, GitHub-synced record of builds, gates, stages, and issues | `studio/dashboard/` |
| Operating files (§59) | The constitution, the versioned instructions, and the resume point | `studio/MUSE_SOUL.md`, `studio/MUSE_EVOLUTION.md`, `studio/CONTINUE_ASHFALL.md` |
| Master registry (§55) | What exists, what is missing, and what is blocked (88 requirements) | `studio/IMPLEMENTATION_REGISTRY.md` |
| Legacy audit (§52) | Which 2D/2.5D files are required, reusable, obsolete, or unknown (248 files) | `studio/LEGACY_AUDIT.md` |

**Overlap warning (from the registry, not yet adjudicated):** §49 (RUN mode), §50 (10-minute cycle), §53 (autonomous god-tier engine), §57 (master orchestrator + recursive development engine), and §56 (ACEE) all describe substantially the same development loop. §56's Development Genome, §57's advanced memory, §59's MEMORY CORE, and BUILD 571's stale "Game Genome" (`scripts/genome.mjs`, Oct 12, unrelated purpose) share a name and overlapping scope. The §58 framing governs: the intended ecosystem is FOUR capabilities, CONNECTED, not four competing systems — (1) Autonomous Development (decides what needs building), (2) Code Evolution Engine (generates, organizes, optimizes code), (3) Development Intelligence (verifies, learns, improves the engineering process), (4) Game Evolution Engine (creates and improves the actual RPG experience). ACEE is capability (2). Adjudicating the overlaps (and ruling OBSOLETE/DUPLICATED where warranted) is Stage A follow-up work in the registry — it is not this directory's job to merge the other systems unilaterally.

## Components (this directory)

| File | What it is |
|---|---|
| `DEVELOPMENT_GENOME.md` | The project-wide intelligence graph: what it tracks, how it is updated incrementally, how it is queried, and what a v1 genome holds (seeded from the registry + legacy audit + AGENTS.md). |
| `CODE_EVOLUTION_FORMULA.md` | The scoring system: EVOLUTION SCORE = Correctness + Performance + Reliability + Maintainability + Reusability − Complexity − Regression Risk. Each term defined, each measured, with a worked example scoring BUILD 1030 against a hypothetical movement-system rewrite. |
| `MULTI_AGENT_LAB.md` | The 11 engineering roles, the shared project graph + task registry, file ownership, task locks, branch isolation, and the hard rule: one code agent at a time on the shared checkout (the 1022 lesson). |
| `OPTIMIZATION_LAB.md` | The quantum-inspired computation lab: simulated annealing, genetic algorithms, evolutionary optimization, constraint solving, graph optimization, probabilistic search, Monte Carlo, Bayesian optimization, parallel search, reinforcement learning. Each with the problem it solves here, when it applies, and the benchmark-or-drop rule. |
| `CODE_FACTORY.md` | The automatic file and code factory + the autonomous code sorting machine + the autonomous code generation machine: how a request becomes a file, how code is sorted, how generation accuracy is measured and improved. |
| `VALIDATION_LAB.md` | The continuous simulation and validation lab (simulated success is NOT gameplay verification) + the experimental evolution sandbox (never let experimental code silently overwrite stable production code). |
| `MEMORY_ENGINE.md` | The development memory and knowledge engine: what it stores, how it is retrieved, how it is updated, and the backup/validation rules. |
| `CODE_EVOLUTION_LAB.md` | The CODE EVOLUTION LAB dashboard interface spec: "Tell the machine what to build," meaningful progress (never fake percentages), controls, and how it connects to the dashboard data and the registry. |
| `ROADMAP.md` | Phases 1–7 (intelligence foundation → code generation → multi-agent engineering → optimization lab → self-improvement → dashboard integration → autonomous evolution), each with objective, deliverables, dependencies, completion criteria, and current status — plus the safety/control/recovery rules. |

## What actually exists today (2026-11-07)

* **Phase 1 is partially done.** The genome v1 *specification and seed* are in this directory (`DEVELOPMENT_GENOME.md`). The inputs it is built from already exist and are verified: the Master Implementation Registry (88 requirements, `studio/IMPLEMENTATION_REGISTRY.md`), the Legacy Codebase Audit (248 files classified A–E, `studio/LEGACY_AUDIT.md`), the architecture map (`AGENTS.md`), and the dashboard data (`studio/dashboard/dashboard-data.json`). What does NOT exist yet is a machine-readable, incrementally updated genome index — that is Phase 1's remaining work.
* **Phases 2–7 are not started.** The specs in this directory describe them; no pipeline, lab, or interface has been built. Do not mistake these files for an implementation.
* **The current development machine is the parent agent + subagents + the build-agent brief.** It already follows ACEE's shape (audit first → smallest safe change → tsc → asserts → sim vs pristine → phone probe → live verify → report DONE/TESTED/BROKEN/NEXT), but it is operated by hand, not by ACEE. ACEE's job is to make that machine increasingly autonomous, intelligent, and fast — not to replace the verification discipline that makes it trustworthy.

## Current state of the game (the machine's first subject)

* Last verified checkpoint: BUILD 1029, commit `14491c9f` (saved chunks keep the inn, blacksmith, and general store). Live-confirmed 2026-11-07 (served version.json 2026-11-07T21:37:14.339Z, run 42416626999, first try).
* Active build: BUILD 1030 (tap-to-walk pathfinding) — implemented + code-verified, NOT shipped (commit/push blocked by the environment write failure; phone probe blocked by Chromium). See `studio/CONTINUE_ASHFALL.md` for the exact resume point.
* The 3D game is NOT the game that ships today (legacy audit headline finding): `GraphicsModeHost` always boots 2.5D, and `Engine3DWorldView` has no combat, quests, dialogue, shops, inventory, or 2.5D-save support. ACEE's extraction backlog (registry classes B/C) is the work of porting that logic into 3D — it must never be shortcut by deleting the 2D/2.5D system first.

## Final directive

> We are building more than an AI that writes code. We are building an AI-powered software engineering machine. It should understand the project as a connected structure, reason about changes before making them, generate complete implementations, evaluate alternative solutions, test its own work, and improve its engineering process over time. The developer should not need to manually search hundreds of files to accomplish a single objective. The developer should describe the desired result. The machine should understand the architecture, determine what needs to happen, create the necessary code, integrate it, and prove that it works.
>
> **BUILD THE MACHINE. THEN USE THE MACHINE TO BUILD ASHFALL.**
