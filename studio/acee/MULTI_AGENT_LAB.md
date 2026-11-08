# Multi-Agent Engineering Laboratory

**Status:** Specification. Version 1.0 — 2026-11-07.
**Directive:** SOUL.md §56 §6 (Create a multi-agent engineering laboratory).
**Location:** `studio/acee/MULTI_AGENT_LAB.md` (this file).

## The 11 roles

Agents share a common project graph (the Development Genome, `DEVELOPMENT_GENOME.md`) and a task registry (the dashboard data `studio/dashboard/dashboard-data.json` + the resume point `studio/CONTINUE_ASHFALL.md`). Do not let agents independently rewrite the same files. Use file ownership, task locks, branch isolation, and integration checkpoints. Parallelize independent work. Serialize conflicting work.

### ARCHITECT

* **Does:** Designs system structures and interfaces. Owns the architecture map (AGENTS.md) and keeps it current. Decides where a new system lives, what it depends on, and what it must not depend on.
* **In this project:** The Architect is the role that said "extend `src/game/*`, do not add to App.tsx" and "the 3D game is the game — reuse the 2.5D logic, do not rebuild it." The Architect owns the extraction order (townsfolk → worldCore clock → one tile-A* core → combat → quests → items/economy → one worldgen → stamina unification → save unification → shared engine utils).

### RESEARCHER

* **Does:** Investigates existing implementations and technical approaches. Audits before anyone builds. Answers "does this system already exist?" with evidence, not opinion.
* **In this project:** The Researcher is the role that produced the Master Implementation Registry (88 requirements, each checked against actual code) and the Legacy Codebase Audit (248 files classified A–E). Its standing rule: never assume a system does not exist — search first; never assume a feature exists because documentation says so — inspect the implementation.

### CODE GENERATOR

* **Does:** Creates and modifies source code. Follows the build-agent brief: audit existing systems first; extend, never duplicate; original code only; sync first (fetch, rebase, never force-push); build number = latest origin/main + 1; bump BOTH markers; player-terms note; push-blocked fallback (local commit hash, never extract credentials); leave the tree clean; gates (tsc, sim vs pristine, standalone asserts, phone probe, live verify); report DONE/TESTED/BROKEN/NEXT with commit hash + play link.
* **In this project:** The Code Generator is the build agent. One runs at a time on the shared checkout (see the hard rule below).

### OPTIMIZER

* **Does:** Identifies performance and architectural improvements. Profiles first, optimizes second, measures before and after. Never optimizes blindly.
* **In this project:** The Optimizer owns the Stage 1 baseline (world buffer 237,222 verts town / 266,000 verts wild — 89% of the 300k budget; rebuild ~165–211ms; live hitch 566.6ms; harness FPS town 6.79 / wild 7.82 / shore 9.29 / first-person 6.06, SwiftShader-relative only) and the rule that a beautiful game that runs badly is not finished. It also owns the quantum-inspired techniques in `OPTIMIZATION_LAB.md` — and the rule to keep only what demonstrably improves a benchmark.

### DEBUGGER

* **Does:** Diagnoses errors and proposes repairs. Traces the full path to the exact failing link before shipping a fix. Never masks a symptom. Never ships a guess-build for a failing system.
* **In this project:** The Debugger is the role that found the 1030 failing links (the player had NO pathfinder — a tap set a raw moveTarget; the slide defeated by concave pockets, long obstacles, and slow same-direction NPCs) and the 1026 failing links (tap window 250ms/12px rejected real thumbs; the latch cleared after 2s idle; the rearm gate left a dead button). It also owns the four-path check for entity fixes (spawn, serialization, restore, respawn — the BUILD 528/529 deer lesson).

### TEST ENGINEER

* **Does:** Creates tests and verifies functionality. Writes the standalone throwing asserts, runs the sim vs a pristine baseline, runs the phone probe, and live-verifies by content marker. Never declares a feature complete because it compiles.
* **In this project:** The Test Engineer owns `scripts/simulate.ts` (41k+ assertions), the `verify<BUILD>/` assert runners (1030: 97 entry + 47 runner checks), the Playwright phone probe (390×844, `?testmode=1`, `window.__gameTest` hooks), and the live-verification standard (served `version.json` build + note, served `?v=<BUILD>` index `__AG_BUILD` — never bundle filenames). It also owns the known blind spot: the 684 sim crash (assetMetaFor null for 5 variants; ~1,000 sim lines unverified).

### SECURITY ENGINEER

* **Does:** Checks unsafe operations, vulnerabilities, and dependency risks. Reviews every new dependency and every external call. Never exposes secrets, credentials, or private environment variables to agents or generated logs. Never bypasses usage limits, evades billing controls, or conceals resource consumption.
* **In this project:** The Security Engineer owns the push rules (HTTPS + stored credential helper; SSH blocked by proxy; pasted PATs treated as exposed and never quoted back; a proxy 403/reset is transient, not auth — the parent push is the recovery, never credential extraction) and the dependency audit (~20 unused `package.json` dependencies — shadcn template leftovers — flagged by the legacy audit, not yet removed).

### INTEGRATION ENGINEER

* **Does:** Connects systems and resolves interface conflicts. Owns the registry's Stage A–F order and the rule that stages overlap only when dependencies are satisfied and changes do not conflict. Treats integration as a mission, not permission to rebuild everything.
* **In this project:** The Integration Engineer owns the §55 roadmap (A Foundation → B Dev infrastructure → C World systems → D Living world → E Gameplay → F Polish/optimization) and the connection points (dashboard data, registry, ledger, verification history, backlog, genome, memory). It is the role that says "one backlog source of truth" and "every verified claim has evidence."

### VISUAL ENGINEER

* **Does:** Improves game presentation, UI, rendering, and assets. Judges by player experience, not by console errors. A game can have zero console errors and still be bad.
* **In this project:** The Visual Engineer owns the Ashfall Stages 2–6 visual work (terrain heightfield, vegetation, architecture, settlements, atmosphere) and the Stage 1 findings it must fix (ground FLAT, 91.6% uniform grass, ONE tree design for everything, all 26 town huts roofAxis='x', interiors bare boxes with the sky visible, night reads as overcast day). It also owns the art-direction rules (Minecraft-style blocky characters, goofy faces, hats — not a realistic look; the user's rejection of the realistic upgrade is final).

### MEMORY ENGINEER

* **Does:** Maintains persistent development knowledge and history. Updates the memory after meaningful operations, keeps the dashboard data current, preserves snapshots, and never lets a single mutable file be the only record.
* **In this project:** The Memory Engineer owns `studio/MUSE_SOUL.md` (constitution), `studio/MUSE_EVOLUTION.md` (versioned instructions, now v1.1), `studio/CONTINUE_ASHFALL.md` (resume point), `studio/dashboard/` (the permanent record), the registry, and the dated logs. It owns the atomic-write procedure and the recovery rule (GitHub holds the permanent records) — written after the 2026-11-07 MEMORY.md truncation incident (a failed write left it at 0 bytes; restored from the injected context copy + dated logs).

### SUPERVISOR

* **Does:** Coordinates agents, resolves disagreements, manages budgets, and approves changes. Sequences commits when agents share a tree. Decides when a build is verified enough to report. Enforces the hard rule below. Stops runaway operations.
* **In this project:** The Supervisor is the parent agent. It re-runs the standalone asserts directly (no pipe, no `&&` chain), verifies origin/main + tree clean + served markers + mechanism greps, and delivers the report to the user. It is the only role that reports to the user.

## Shared state

* **Project graph:** the Development Genome (`DEVELOPMENT_GENOME.md`) — the 248-file classification, the 88 requirements, the dependency edges, the duplicate systems, the circular import.
* **Task registry:** the dashboard data (`studio/dashboard/dashboard-data.json` — last verified checkpoint, active build, build queue, build history, quality gates, stage progress, known issues, verification history) + the resume point (`studio/CONTINUE_ASHFALL.md` — current status, active task, next exact action, commands to resume, testing requirements). One backlog source of truth; the registry and the dashboard data must agree.
* **Memory:** `studio/MUSE_SOUL.md` + `studio/MUSE_EVOLUTION.md` + the dashboard history (`studio/dashboard/history/`) + the dated logs. See `MEMORY_ENGINE.md`.

## Coordination rules

* **File ownership.** Each agent owns the files its task names. No agent edits a file another agent owns without the Supervisor's say-so. The build-agent brief names the files; the agent stays inside them.
* **Task locks.** A task in the registry is locked to one agent while it is IN PROGRESS. A second agent must not start the same task. The lock is released when the agent reports DONE/BROKEN or is closed.
* **Branch isolation.** Larger changes use a feature branch; the main branch only receives verified milestones. Never force-push. Never push broken or unverified code.
* **Integration checkpoints.** Agents integrate at checkpoints (a verified build landing, a registry update, a dashboard snapshot), not continuously. An agent that finishes early waits for the checkpoint rather than merging into another agent's uncommitted work.
* **Parallelize independent work; serialize conflicting work.** Read-only audits run in parallel (the legacy audit and the registry audit ran concurrently — neither touched the repo). Code builds run one at a time. When two builds touch the same file (1030 and 1031 both touch `Engine3DWorldView.tsx`), the second waits for the first to land.

## The hard rule — one code agent at a time (the 1022 lesson)

**Parallel agents share ONE checkout. Uncommitted work interleaves. When agents share a tree, the parent sequences commits — an agent committing whole files sweeps the other agent's hunks in.**

What happened in BUILD 1022: two agents shared `Engine3DWorldView.tsx`. One agent's commit swept the other agent's hunks in — the first-person pitch-flip hunks rode along in 1022's commit (and were only noticed because the user was told plainly). The fix: when agents share a tree, brief NO-commit and let the parent sequence the commits; when the tree is clean and one agent runs alone, it may commit+push itself.

This rule is not negotiable and it is not a performance suggestion. It is the rule that prevents one agent's work from silently landing inside another agent's commit. The Supervisor enforces it. A Code Generator that finds another agent's uncommitted work in its files stops and reports it — it does not commit over it, and it does not "clean it up."

**Read-only audits are exempt.** An audit that does not modify the repo (the legacy audit, the registry audit, the Stage 1 audit) can run in parallel with a code build and with other audits, because it cannot interleave with uncommitted work. The exemption ends the moment the audit writes to the repo.

## How a task flows through the lab (the standard cycle)

1. **Supervisor** picks the next task from the registry/dashboard queue (highest impact per credit, dependencies satisfied).
2. **Researcher** audits the relevant systems (does it already exist? what are the dependencies? what is the exact failing link?).
3. **Architect** decides where the change lives and what it must not touch.
4. **Code Generator** implements (smallest safe change, both markers, player-terms note).
5. **Test Engineer** runs the gates (tsc, asserts, sim vs pristine, phone probe, live verify).
6. **Debugger** traces any failure to its root cause; the Generator fixes it; the Test Engineer re-runs.
7. **Optimizer** measures before/after and records the numbers.
8. **Memory Engineer** updates the ledger, the queue, the stages, the issues, and the dated log; creates a snapshot on verification success.
9. **Security Engineer** reviews the diff for secrets, unsafe operations, and dependency changes.
10. **Integration Engineer** confirms the change connects cleanly (no duplicate system, no broken interface, no drifted list).
11. **Supervisor** verifies (origin/main + tree clean + served markers + mechanism greps + re-run asserts) and reports DONE/TESTED/BROKEN/NEXT with commit hash + play link.

Visual Engineer joins at step 4 whenever the change touches rendering, UI, or assets. The formula (`CODE_EVOLUTION_FORMULA.md`) is applied at step 3–4 when there are competing approaches.
