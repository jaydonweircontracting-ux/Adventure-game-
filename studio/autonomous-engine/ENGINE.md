# ASHFALL — Autonomous Development Engine

**Version:** 1.0 — 2026-11-07
**Source:** SOUL.md §53 (Autonomous God-Tier Development Directive), §49 (Autonomous Development Directive), §50 (Autonomous Evolution Directive). This file is the engine's operating specification. It does not replace the directives; it implements them.
**Status:** DOCUMENTED ONLY (registry D5: PARTIALLY IMPLEMENTED — the Oct-era scripts exist but are stale, last session 2026-10-12; the live queue lives only in `studio/dashboard/dashboard-data.json` + `MEMORY.md`). This file is the specification the engine must satisfy. It is not a claim that the engine exists.

## Purpose

The autonomous development engine is the loop that builds ASHFALL without the user having to re-explain the project, re-plan the queue, or re-discover what is already done. It inspects the project, picks the highest-value task, implements it, tests it, records the result, and moves to the next task — until the execution budget is exhausted or human approval is required.

## The loop

One cycle, repeated. Each phase has a defined job and a defined output.

### PHASE A — OBSERVE

Inspect the current project state. Identify:

* Missing features.
* Broken systems.
* Performance problems.
* Visual weaknesses.
* Unused code.
* Duplicate systems.
* Incomplete mechanics.
* Architectural weaknesses.
* Opportunities for improvement.

**Sources to inspect (in order):** `studio/CONTINUE_ASHFALL.md` (the resume point), `studio/dashboard/dashboard-data.json` (the queue + last verified checkpoint), `studio/IMPLEMENTATION_REGISTRY.md` (what exists and what does not), `studio/LEGACY_AUDIT.md` (what is reusable vs obsolete), `studio/PROJECT_STATE.md` (this file's companion), `git log` (read-only — what actually landed), and the repo code itself. Do not re-scan files that have not changed since the last cycle.

**Output:** a list of candidate improvements, each tied to a registry entry or a user order.

### PHASE B — THINK

Generate a ranked improvement backlog. For each candidate, calculate approximately:

* Implementation difficulty.
* Expected impact.
* Credit consumption.
* Risk.
* Dependencies.
* Testing requirements.

**Ranking rule:** EXPECTED VALUE = PROJECT IMPACT × SUCCESS PROBABILITY ÷ RESOURCE COST. This is a planning heuristic, not an excuse to skip necessary testing. Priority 1: major visual improvements, broken gameplay systems, major performance bottlenecks, missing foundational mechanics, game-breaking bugs, architecture problems blocking further development. Priority 2: high-impact world improvements, NPC behavior, procedural generation, combat/progression, dashboard improvements, reusable automation tools. Priority 3: environmental details, secondary systems, quality of life, optimization/cleanup. Priority 4: small cosmetic, low-impact, nonessential work.

**Output:** the prioritized backlog (see below).

### PHASE C — BUILD

Select the highest-value improvements. Implement multiple compatible improvements together when they touch the same files (to avoid repeated scans/rewrites). Prefer small, modular, reusable changes over unnecessary rewrites. Extend existing systems; never duplicate them. Never tear down and rebuild.

**Rules:** audit existing systems first; the smallest safe change; no fake features (a feature is complete when it actually works in the game, not when a button exists); no guess-builds (trace the full path to the exact failing link first); never force-push; sync with fetch + rebase; one code agent at a time on the shared checkout (read-only audits may run in parallel).

**Output:** the changed files, ready for testing.

### PHASE D — TEST

Automatically verify:

* Compilation (`tsc --noEmit` — must exit 0).
* Existing functionality (the sim vs a pristine baseline — normalized logs must be identical, 0 FAIL, apart from the known 684 rig crash).
* Gameplay behavior (standalone throwing asserts in `~/workspace/verify<BUILD>/`, run DIRECTLY with no pipe/`&&` chain).
* Performance (measured before and after; never optimize blindly).
* Visual rendering (phone probe, 390×844, 0 page errors).
* Integration (the change works with the systems it touches).
* Regression risks (movement, chunk generation, collision, NPCs, combat, quests, inventory, saving, loading, minimap, time, procedural generation).

**Output:** test results with evidence (command, exit code, counts, log paths). A test that was not run is NOT RUN. A test that fails is FAILED. Missing results are never silently treated as passing.

### PHASE E — OPTIMIZE

Remove unnecessary overhead. Improve algorithms. Consolidate duplicate logic. Optimize resource usage. Improve the development tools themselves. Measure before and after; keep an optimization only if it produces a measurable benefit, else revert.

**Output:** the measured before/after numbers, recorded in the Evolution Ledger.

### PHASE F — DOCUMENT

Record:

* What changed.
* Why it changed.
* Files affected.
* Tests performed.
* Results.
* Remaining problems.
* Next recommended improvements.

**Where:** the build ledger (`studio/dashboard/history/build-ledger.json`), the verification history, the development history, `studio/CONTINUE_ASHFALL.md`, `MEMORY.md` + the dated log, and the dashboard data (`studio/dashboard/dashboard-data.json`). Update the registry status only with evidence (commit hash, run ID, probe output, served marker).

**Output:** the records, updated and validated.

### PHASE G — REPEAT

Continue automatically with the next highest-value task. Do not stop after a plan or one small feature. Do not ask what to do next. Continue until a genuine blocker, a resource limit, a required authorization, or a completed queue.

## Persistent progress

The engine must:

* **Maintain persistent progress between sessions.** The checkpoint is `studio/CONTINUE_ASHFALL.md` (the exact resume point) + `studio/dashboard/dashboard-data.json` (last verified checkpoint, active build, queue). A fresh session reads them and continues without the user re-explaining the project.
* **Resume from the last successful checkpoint.** The last verified checkpoint is BUILD 1029, commit `14491c9f` (live-confirmed 2026-11-07 ~13:40 PST). Never resume from an unverified claim.
* **Maintain a prioritized backlog.** See below. The backlog lives in `studio/dashboard/dashboard-data.json` (`buildQueue`) and is mirrored here. One backlog source of truth — when the two disagree, the dashboard JSON wins (it is the version-controlled record).
* **Avoid repeating completed tasks.** Check the registry + the build ledger before starting work. If a task is COMPLETE AND VERIFIED, do not redo it.
* **Detect failed implementations.** A test failure, a sim divergence, a phone-probe failure, or a live-verify failure means the implementation is not accepted. Record it as FAILED with the evidence (what failed, where, the log path). Do not report it as success. Do not silently retry the same failing command in a loop.
* **Roll back dangerous changes.** Before risky work, create a recoverable Git checkpoint (a commit on a branch, or a clean-tree baseline). If the change breaks the game, revert to the last verified checkpoint. Never push broken or unverified code. Never force-push.
* **Preserve working functionality.** A fix that breaks a neighboring system is not a fix. Re-run the regression set (movement, collision, NPCs, combat, quests, inventory, saving, loading) after every meaningful change.
* **Recognize when an improvement is already implemented.** Search the project before creating a new system. If the improvement exists (in code, not just in documentation), mark it complete and move on. Do not rebuild what already works.
* **Avoid unnecessary modifications.** Do not manufacture changes to fill a report. Do not re-scan unchanged files, rebuild unchanged indexes, or regenerate verified implementations.
* **Continue until the available execution budget is exhausted or human approval is required.** The governor (`GOVERNOR.md`) decides when to stop. Never assume unlimited execution time or unlimited credits are available.

## The prioritized backlog

Statuses: NOT STARTED / READY / IN PROGRESS / BLOCKED / IMPLEMENTED / TESTING / VERIFIED / COMPLETE. A status changes only with evidence. "VERIFIED" requires the quality gates + live verification where applicable (see `studio/TEST_STATUS.md`).

| Task ID | Description | Priority | Dependencies | Status | Files | Notes | Test requirements | Completion evidence |
|---|---|---|---|---|---|---|---|---|
| 1030 | Tap-to-walk pathfinding (player A* + NPC pathing fixes) | 1 | None (first) | IMPLEMENTED (not verified) | `src/game/engine3d/playerPath.ts` (new), `Engine3DWorldView.tsx`, `townsfolk3d.ts`, `transients.ts`, `animals.ts`, `scripts/prepare-build-entry.cjs`, `src/App.tsx` | Code done + code-verified; commit/push + phone probe BLOCKED by environment (git EPERM, Chromium SIGTRAP). Unblocks the whole queue. | tsc clean; 97 entry + 47 runner asserts; sim vs pristine1029 identical; phone probe 390×844; live verify by content marker (served version.json build 1030) | Commit hash + served version.json build 1030 + probe output |
| 1031 | Blue-squares fix (wild lakes rendered as whole far cells at distance; subdivide to the lake's actual tiles) | 1 | 1030 lands | READY | `src/game/engine3d/Engine3DWorldView.tsx`, `src/game/engine3d/wildTerrain.ts` | User-reported bug (2026-11-07, two screenshots). Cause confirmed in code: far cells centre-sample; if the centre tile is a lake tile the whole cell renders as a blue quad. Fix pattern: subdivide like the 1008 dirt subdivision. Retires the 1024 accepted limit. | tsc; asserts in `~/workspace/verify1031/`; sim vs pristine1030; phone proof (walk toward a distant lake, screenshots at multiple distances, water stays in place, no whole-cell blue quads) | Commit hash + served version.json build 1031 + phone screenshots |
| 1032 | House interior invisible walls (player can walk out through the walls; add boundary collision so enter/exit is only via the Enter/Exit button) | 1 | 1031 lands | READY | `src/game/engine3d/interiors.ts`, `src/game/iso/IsoInteriorView.tsx`, `Engine3DWorldView.tsx` | User order (2026-11-07, three screenshots). Audit the interior system first. | tsc; asserts in `~/workspace/verify1032/`; sim vs pristine1031; phone proof (enter, walk into every wall — stays inside; Exit → correct exterior point; re-enter works) | Commit hash + served version.json build 1032 + phone proof |
| STAGE-2 | Ashfall Stage 2 — Terrain (visual-only heightfield, stronger ground tint, shores, stone used or removed) | 1 | 1032 lands | NOT STARTED | `src/game/engine3d/` (ground emission, every object's base y, far rings, picker) | HIGH RISK. Harness-prototype the base-y agreement first; fallback is tint+shores+stone only. Must re-sync + re-baseline first (Stage 1 numbers are at 1029). | tsc; asserts; sim vs pristine1032; phone probe; harness prototype before the build | Commit hash + served version.json + phone proof + harness prototype output |
| STAGE-3 | Ashfall Stage 3 — Vegetation (3 tree shapes, bushes non-blocking, crates/stalls stop rendering as trees, grass density re-tested vs FPS) | 2 | Stage 2 lands | NOT STARTED | `src/game/engine3d/` (vegetation, grass, townLook) | — | tsc; asserts; sim; phone probe; FPS re-test | Commit hash + served version.json + phone proof |
| STAGE-4 | Ashfall Stage 4 — Architecture (roof variety, gardens/fences, interior ceilings + hearth glow; no mechanics) | 2 | Stage 3 lands | NOT STARTED | `src/game/engine3d/` (townLook, interiors) | Inn/store/smith stay shells (mechanics deferred by user). | tsc; asserts; sim; phone probe | Commit hash + served version.json + phone proof |
| STAGE-5 | Ashfall Stage 5 — Settlements (market stalls at the plaza, readable districts, 2–3 fixed wild landmarks; second settlement out of scope) | 2 | Stage 4 lands | NOT STARTED | `src/game/engine3d/` (placements, townLook) | Cause of the 0-stall drop is UNVERIFIED — verify before fixing. | tsc; asserts; sim; phone probe | Commit hash + served version.json + phone proof |
| STAGE-6 | Ashfall Stage 6 — Atmosphere (night that reads as night + stars, dawn/dusk grading, staggered evening lights; weather + sun-follow shading are stretch) | 2 | Stage 5 lands | NOT STARTED | `src/game/engine3d/sky.ts`, `Engine3DWorldView.tsx` | — | tsc; asserts; sim; phone probe | Commit hash + served version.json + phone proof |
| DASH-WIRE | Move `studio/` + `studio/dashboard/` into the repo and wire the dashboard to the JSON | 1 | 1030 lands (one commit once git works) | NOT STARTED | `studio/` (all files), the dashboard artifact | Kills the hard-coded dashboard and the single-copy memory-loss risk (MEMORY.md already truncated once). | Validate all JSON against the schema; dashboard reads from the files; no hard-coded data remains | Commit hash + dashboard reads from repo JSON |
| WAVE-1 | Legacy Wave 1 removal (8 code files + 2 assets, unambiguous dead) | 2 | Git can write | NOT STARTED | See `studio/LEGACY_AUDIT.md` §4.1 + §6 (Engine3DView.tsx, fbxHouseModels.ts, three-fbx.d.ts, boundedCache.ts, frameMetrics.ts, worldEventBus.ts, worldDevHistory.ts, worldHealthMonitor.ts, public/manaseed/, public/v2.5.5.html) | §52 11-step safe-removal procedure; git checkpoint first; tsc + build + sim + phone probe after. | tsc; build; sim vs pristine; phone probe; 3D game still works | Commit hash + test outputs |
| S2-684 | Fix or formally accept the 684 sim crash | 1 | User word (fix) or a recorded acceptance | BLOCKED | `src/game/` (assetMetaFor; 5 variants missing BUILDING_ASSET_META entries: cottage-wide, hall-grand, house-balcony, house-tall, shop-banner) | ~1,000 sim lines unverified on every build; the fix is likely small. If the user won't prioritize it, record it as accepted so the sim comparison stops carrying a known blind spot. | Sim runs past the rig section without crashing | Commit hash (if fixed) or a recorded acceptance in the registry |
| G17-MINIMAP | 3D minimap (circular, in a corner, showing the area near the player) | 2 | None (candidate to pull forward into Stage C) | NOT STARTED | `src/game/engine3d/` (new), 2D minimap code to port | Standing request since 2026-10-12. The 2D minimap exists to port. | tsc; asserts; sim; phone probe | Commit hash + served version.json + phone proof |
| G16-SAVEVER | Version the `ag-3d-*` save keys + migration | 2 | None | NOT STARTED | `src/game/engine3d/` (save/load paths) | Cheap insurance: one version field + a migration path, before any format change silently corrupts saves. `iso-world-v2` is versioned+migrated; the `ag-3d-*` keys have NO versioning. | tsc; asserts (old save loads + migrates; new save writes the version); sim | Commit hash + served version.json + asserts |

## What the engine does NOT do

* It does not bypass usage limits, evade billing controls, or conceal resource consumption. (See `GOVERNOR.md` — the hard rule.)
* It does not claim a build marker proves a gameplay fix. A build is verified only by the quality gates + live verification.
* It does not delete code based on a file name. Removal follows the §52 11-step procedure and only verified category-D files.
* It does not invent a system that does not exist. If the underlying gameplay does not exist yet, the XP/crafting/fishing/mining integration is left explicitly pending.
* It does not build four competing autonomous engines, three dashboards, or three memory/genome systems. The overlaps (registry, "Overlaps flagged") are not yet adjudicated; until they are, this engine is the single implementation of the loop, the live dashboard artifact is the single dashboard, and `studio/` is the single memory home. Adjudication belongs to Stage A follow-up, not to this file alone.

## Maintenance

* Update this file when the loop, the backlog, or the operating requirements change. Record the change in `studio/MUSE_EVOLUTION.md` (versioned revision).
* The backlog's canonical home is `studio/dashboard/dashboard-data.json` (`buildQueue`). This file mirrors it; when the two disagree, the dashboard JSON wins.
* Next update trigger: BUILD 1030 landing (1030 → VERIFIED, queue advances, backlog re-ranked).
