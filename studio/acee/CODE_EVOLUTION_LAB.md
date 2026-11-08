# CODE EVOLUTION LAB — Dashboard Interface Spec

**Status:** Specification only. Version 1.0 — 2026-11-07.
**Directive:** SOUL.md §56 §13 (Build the code machine interface).
**Location:** `studio/acee/CODE_EVOLUTION_LAB.md` (this file).

## What this is

A specification for a dedicated interface inside the ASHFALL development dashboard, called **CODE EVOLUTION LAB**. It is the interface through which the user tells ACEE what to build and watches it work. **No UI exists yet.** This file is the spec; Phase 6 (dashboard integration) builds it. Do not mistake this file for an implementation.

## The input

A simple input:

> **"Tell the machine what to build."**

One text field. The user describes the desired result in plain language — an objective, not a technical specification. Examples from real orders:

* "When tapping to walk make the npcs and characters path around objects correctly instead of of having to constantly tap when they get stuck on trees and houses and rocks and npcs" (BUILD 1030).
* "Blue squares randomly appear and disappear in the distance etc I thought it was a lake or a pond but as I walk to it it disappears" (BUILD 1031).
* "When entering houses make it so you can't walk outside thru the walls etc add invisible walls so you need to enter and exit with the button etc" (BUILD 1032).

The machine handles the technical workflow (interpret → locate systems → plan → generate → integrate → test → measure → save). The user does not write the plan, the file list, or the test commands.

## What it shows

(From §56 §13 — every item is a real view onto real data, not a placeholder.)

| View | What it shows | Source of truth |
|---|---|---|
| **Objective submission** | The input field + the queue of submitted objectives (each with its status: planned / in progress / implemented / tested / verified / blocked / failed). | Dashboard data (`studio/dashboard/dashboard-data.json` — build queue). |
| **Repository intelligence** | The genome: what the machine knows about the project (file count, classification counts, dependency graph, duplicate systems, circular imports). | The Development Genome (`DEVELOPMENT_GENOME.md` + the genome index, Phase 1). |
| **Architecture graph** | The dependency graph, rendered so a human can see what depends on what (the file a build touches, its dependents, its blast radius). | The genome. |
| **File-generation activity** | Files created/modified per build, with the diff stat and the commit hash. | The build ledger (`studio/dashboard/history/build-ledger.json`) + `git log`. |
| **Agent activity** | Which roles are active, what task each holds, which files each owns (file ownership + task locks, from `MULTI_AGENT_LAB.md`). | The task registry (dashboard data + the resume point). |
| **Optimization experiments** | The sandbox experiments: baseline, candidates, benchmarks, and which one won (with numbers). | The validation lab (`VALIDATION_LAB.md`) + the evolution formula (`CODE_EVOLUTION_FORMULA.md`). |
| **Code quality** | tsc exit code, assert pass rates, sim diff results, per build. | The build ledger + the verification history. |
| **Build status** | The last verified checkpoint, the active build, the build queue, and the deploy status (run ID, success/failure). | Dashboard data. |
| **Test status** | The four gates per build (LEVEL 1–4) with their evidence (gate name, status, timestamp, test/command, result, commit). A gate that has not run shows NOT RUN; a gate that fails shows FAILED. | Dashboard data (quality gates). |
| **Performance comparisons** | Before/after on the benchmark set (world buffer, rebuild time, teleport hitch, harness FPS, sim diff, assert counts, tap journeys). | The optimization lab (`OPTIMIZATION_LAB.md` benchmark set) + the Stage 1 baseline. |
| **Resource consumption** | Time spent searching/generating/testing, compilation failures, test failures, repeated errors, duplicate work, rebuild time, token consumption, tool usage (the §56 §9 telemetry). | The self-optimizing pipeline (Phase 5). **Not yet collected** — this view shows "not yet measured" until Phase 5 exists. Do not invent numbers for it. |
| **Change previews** | The diff a build proposes, before it is applied (patch preview). | The factory (`CODE_FACTORY.md`) + the sandbox's controlled patch. |
| **Approval controls** | Approve / reject for destructive operations, major architectural changes, external uploads, and operations with irreversible consequences. | The safety rules (`ROADMAP.md`). |
| **Rollback controls** | Restore the last verified checkpoint (git checkpoint + the snapshot). | The safety rules + the dashboard snapshots (`studio/dashboard/snapshots/`). |
| **Evolution history** | Every build, every decision, every competing approach and why the winner won — the permanent record. | The build ledger + the development history + the dated logs. |

## The progress rule (the most important rule in this spec)

**Show meaningful progress rather than fake percentages.** Every number on this interface must have evidence behind it (a commit hash, a run ID, a probe output, a served marker, a measurement). A build that is 60% done because three of five gates passed shows three gates passed — it does not show "60%". A task with no evidence shows "no evidence yet," not a plausible-looking number. This is the §50 rule (actual evidence, never invented percentages) and the §54 rule (never fabricate a commit hash, verification result, build number, or measurement). The dashboard data's honesty-gap fix (2026-11-07: Level 4 downgraded to Level 3 for 1016–1029 because no per-build Level-4 evidence existed) is the example of what happens when this rule is broken — and the fix is the example of how it is repaired.

## How it connects

* **To the dashboard data.** The CODE EVOLUTION LAB reads `studio/dashboard/dashboard-data.json` (last verified checkpoint, active build, build queue, build history, quality gates, stage progress, known issues, verification history). It does NOT maintain a separate hard-coded copy. If the JSON and the interface disagree, the JSON is right and the interface is wrong.
* **To the registry.** Requirement status comes from `studio/IMPLEMENTATION_REGISTRY.md` (88 requirements, 7-field sections). The interface links each build to the requirement(s) it satisfies, and each requirement to the build(s) that address it. The registry's next update trigger is BUILD 1030 landing.
* **To the live dashboard.** The live artifact (`ashfall-development-dashboard`, verified 2026-11-07) is the existing UI. The CODE EVOLUTION LAB is a **section within it**, not a second dashboard. The §58 GAME EVOLUTION LAB is a different section (the game-content side: world content factory, emergent stories, quest generation) — the two sections are distinct, not competing. (The registry flags the dashboard overlaps — §50's dashboard vs §53's 10-module "ultimate creation dashboard" vs §54's dashboard repair — as not yet adjudicated. This spec does not adjudicate them; it adds a section to the one live dashboard that exists.)

## Controls

* **Submit an objective** (the input field). Submitting creates a queue entry (status: planned) — it does not start work until the Supervisor picks it up (highest impact per credit, dependencies satisfied).
* **Approve / reject a change preview.** Required for destructive operations, major architectural changes, external uploads, and operations with irreversible consequences. Safe, reversible, low-risk improvements may proceed automatically.
* **Roll back.** Restore the last verified checkpoint (the git checkpoint + the dashboard snapshot). Rollback is always available and always safe — it returns to a state that was verified.
* **View agent activity / evolution history.** Read-only views onto the task registry and the ledger. They show what happened; they do not let the user rewrite history (historical entries are never overwritten).

## What is NOT in this spec (honest gaps)

* There is no UI. Phase 6 has not started. The live dashboard artifact does not yet have a CODE EVOLUTION LAB section.
* There is no resource-consumption telemetry yet (Phase 5). The view is specified but will show "not yet measured" until the telemetry exists.
* There is no live agent-activity feed yet (Phase 3). The view is specified but will show the static task registry until the multi-agent lab exists.
* The genome index does not exist yet (Phase 1). The repository-intelligence and architecture-graph views will show the seed data (the registry + legacy audit counts) until the index is built.
