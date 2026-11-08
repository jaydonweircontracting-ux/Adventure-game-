# Real Development Benchmarking System

**Directive:** SOUL.md §57 §4 (build a permanent performance laboratory; establish baselines for the game and the development engine).
**What already exists:** The Stage 1 measured baseline (`~/workspace/verify1030/ASHFALL-STAGE1.md`, 660 lines; the numbers are also in `studio/dashboard/dashboard-data.json` under `measuredBaselines`), the per-build verification records (`studio/dashboard/history/verification-history.json`), and the build ledger (`studio/dashboard/history/build-ledger.json`). This file adds the benchmarking system itself: what to measure, how to measure it, the baseline, the budgets, and the regression rule. It does not duplicate the Stage 1 audit — it is the laboratory that keeps the baseline current.

## What to measure

### Game performance (§57 §4)

* Build duration (CI build job time).
* Compilation duration (`tsc --noEmit` time; vite build time).
* Memory consumption (world buffer size; runtime memory where measurable).
* CPU usage (main-thread load during play, where measurable).
* Frame rate (harness FPS; real-phone FPS when measurable).
* Frame-time consistency (hitch count / max frame time during a fixed movement test).
* Rendering cost (world buffer vertices; draw calls where measurable).
* Chunk-loading time (time to generate/stream a chunk, where measurable).
* World-generation throughput (tiles/ms for the deterministic generator, where measurable).
* NPC simulation throughput (NPCs updated per tick, where measurable).
* Pathfinding performance (A* time per plan; replans per journey — 1030's asserts record replans per journey: hut detour 0, tree-line 0, water 0, standing-NPC 0, pacing-NPC 0).
* Save/load duration (save round-trip time, where measurable).
* Test execution time (sim time; assert-run time; probe time).
* Code-generation success rate (builds that pass Level 1 on the first attempt vs builds that need a fix — see the recursive engine's indicator table).

### Development-engine performance (§57 §4)

* Build time (commit → live, including the ~2–3 min Pages deploy lag).
* Test time (tsc + sim + asserts + probe, per build).
* Sim time (the sim suite's runtime per run).
* Probe time (the phone probe's runtime per run).
* Credits per verified build (see `RESOURCE_INTELLIGENCE.md` — currently unmeasured).
* Regressions per build (sim-vs-pristine non-identical diffs + assert failures after a change).

## How to measure it

* **Game:** the Stage 1 method — a headless measurement (node, esbuild bundle of the real 3D systems) for the deterministic numbers, plus a live phone probe (390×844, SwiftShader) for the runtime numbers. The headless and live counts must match exactly (Stage 1: live counts matched headless exactly — 29 huts, 224 trees, 118 crates, 131 rocks, 0 walls).
* **Development:** record the wall-clock time of each step (tsc, sim, asserts, probe, deploy) in the build ledger (`studio/dashboard/history/build-ledger.json`) at landing time. Do not reconstruct times from memory afterward.
* **Comparison:** every meaningful optimization is compared against the previous baseline. Do not claim an improvement without measurements. Automatically identify regressions (a measurement that moves the wrong way past its budget is a regression, not noise).
* **Environment note:** harness FPS is SwiftShader (a software renderer) — it is a RELATIVE baseline only. Real-phone frame rate is unmeasured (1015's denser grass cut harness FPS ~13%; real-phone FPS was never measured). Never present a harness FPS number as a phone FPS number.

## The baseline (Stage 1, at BUILD 1029 / commit 14491c9f, 2026-11-07)

From `studio/dashboard/dashboard-data.json` (`measuredBaselines`) and `~/workspace/verify1030/ASHFALL-STAGE1.md`. These are the numbers every later measurement is compared against.

| Measurement | Result | How measured |
|---|---|---|
| World buffer vertices (town centre) | 237,222 verts (town) / 266,000 verts (wild) — 89% of the 300k budget | Headless measurement (node, esbuild bundle) |
| World rebuild time (steady-state) | ~165–211ms | Headless measurement |
| Live hitch on a 50-tile teleport | 566.6ms | Live phone probe 390×844 (SwiftShader) |
| Ground uniformity | 91.6% uniform grass; tint variation ±0.027 (nearly invisible); stone terrain dead (0 tiles); no rivers/beaches; ocean meets grass directly | Headless + live probe |
| Harness FPS (SwiftShader — relative baseline only) | Town 6.79 / wild 7.82 / shore 9.29 / first-person 6.06 | Headless harness (SwiftShader) |
| Ground heightfield | FLAT — no heightfield; max ground-plane vertex y = 0.038 | Headless measurement |
| Town composition (live counts, matching headless exactly) | 29 huts, 224 trees, 118 crates (all render as pine trees), 131 rocks, 0 walls, 47 NPCs (49% generic commoner), 0 generated stalls | Headless + live probe |

Also recorded (from the Stage 1 audit, not in the dashboard `measuredBaselines` array — a gap to close on the next baseline update): night reads as overcast day at full uNight (0.55 cap); all 29 houses lit 19:30–21:30 every evening; no stars, weather, or dawn/dusk grading; baked SUN_SHADE fixed northwest-high while the sky sun moves; town is a 61×125 ribbon; all 26 town huts roofAxis='x' (zero roofline variation); interiors bare boxes with the sky visible from inside (no ceiling).

## Performance budgets (to be enforced, not yet enforced)

Budgets are set from the baseline. A measurement that exceeds its budget is a regression and blocks the build's Level 3 gate until it is fixed or the budget is formally revised (with a recorded reason).

| Subsystem | Budget (from the Stage 1 baseline) | Status |
|---|---|---|
| World buffer | ≤ 300,000 verts (the stated budget; currently 237k town / 266k wild = 89%) | TO-BE-ENFORCED. No build has yet been gated on it. |
| World rebuild (steady-state) | ≤ 211ms (the top of the measured steady-state range) | TO-BE-ENFORCED. |
| Live hitch (50-tile teleport) | ≤ 566.6ms (the measured value; the target is to reduce it, not to match it) | TO-BE-ENFORCED. Stage 2's heightfield must not increase it — the harness prototype must measure it. |
| Harness FPS | No absolute budget (SwiftShader is relative only). The budget is: no regression vs the previous baseline on the same harness. | TO-BE-ENFORCED. |
| Sim | 0 FAIL vs the pristine baseline (the existing rule). | ENFORCED (every build). |

## Regression rule

* A change that improves one subsystem but damages another is a regression, not an improvement. (Example: 1015's denser grass improved the look but cut harness FPS ~13% — that cost was recorded honestly, not hidden.)
* The system must know when a change improves one subsystem but damages another: every build records the baseline measurements that its change could affect (ground emission changes → world buffer + rebuild time + hitch; vegetation changes → buffer + FPS; pathfinding changes → replans per journey + sim time).
* A regression is recorded in the build ledger and in `knownIssues` (`studio/dashboard/dashboard-data.json`), not silently absorbed.

## Current state

The baseline exists (Stage 1). The benchmarking system as an automated laboratory does NOT exist yet — this file is its specification. What is missing: automated per-build measurement recording (currently hand-recorded in the ledger), enforced budgets (currently targets, not gates), a development-engine baseline (build/test/sim/probe times and credits per verified build are not recorded), and a real-phone FPS measurement (unmeasured). The first benchmarking task is to record the development-engine times for the next landing (1030) so the development baseline exists.
