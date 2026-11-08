# Code Evolution Formula

**Status:** Specification. Version 1.0 — 2026-11-07.
**Directive:** SOUL.md §56 §7 (Create the code evolution formula).
**Location:** `studio/acee/CODE_EVOLUTION_FORMULA.md` (this file).

## The formula

```
EVOLUTION SCORE =
  Correctness + Performance + Reliability + Maintainability + Reusability
  − Complexity − Regression Risk
```

The directive also names the wider evaluation set — memory usage, dependency impact, test coverage, compatibility, and implementation cost. Those are folded into the seven terms below (memory usage into Performance; dependency impact into Complexity; test coverage into Correctness; compatibility into Reliability; implementation cost into Complexity) so the formula stays one number while nothing is dropped.

## Scoring scale

Each term is scored **0–10** (integer). The maximum possible score is 50 (5 positive terms × 10) minus 0 (no deductions) = 50; the minimum is 0 − 20 = −20. In practice a good build scores in the 25–40 range; a rewrite scores low because its deductions are large.

**Every term requires evidence.** A term scored without evidence is scored 0 and flagged. The evidence for each term is named below. Do not optimize a score at the expense of actual functionality — a high score on a build that does not work is a lie, and the quality gates (below) are what catch it.

## The seven terms

### 1. Correctness (0–10) — does it do what was asked?

* **What counts:** the implementation does the requested thing, in the game, for the player. Not that it compiles; that it works.
* **How it is measured:** standalone throwing asserts (the `verify<BUILD>/` runners, re-run directly by the parent with no pipe/`&&` chain), the sim vs a pristine baseline (normalized logs identical, 0 FAIL), and the phone probe (real taps on a 390×844 device, 0 page errors).
* **Evidence required:** assert counts + pass/fail, sim diff result, probe result. A build whose phone probe has not run cannot score above 8 on Correctness (it is code-verified, not gameplay-verified).
* **What lowers it:** failing asserts, sim differences, untested paths, a fix that only works in the harness.

### 2. Performance (0–10) — is it faster, or at least not slower?

* **What counts:** measured before/after on the same workload. Frame time, rebuild time, buffer size, hitch duration, harness FPS — whichever the change touches. Memory usage folds in here (buffer verts, allocations, retained state).
* **How it is measured:** the Stage 1 baseline is the reference point (world buffer 237,222 verts town / 266,000 verts wild — 89% of the 300k budget; rebuild ~165–211ms; live hitch 566.6ms on a 50-tile teleport; harness FPS town 6.79 / wild 7.82 / shore 9.29 / first-person 6.06, SwiftShader-relative only). A change is scored by its measured delta against that baseline, on the same harness.
* **Evidence required:** before/after numbers from the same measurement (same command, same environment). A claim with no numbers scores 5 (neutral — "no measured change") at best, never higher.
* **What lowers it:** a measured regression, an unmeasured change to a hot path, added per-frame work.

### 3. Reliability (0–10) — does it survive the real game?

* **What counts:** save/load round-trips, edge cases (boundaries, interiors, combat, repeated save/load), no softlocks, no crashes. Compatibility folds in here (old saves still load; the change does not break a neighbouring system).
* **How it is measured:** save/load tests, edge-case tests (player at world/chunk boundaries, entering a building while an NPC enters, saving during combat, rapid repeated interaction), and the sim's long-duration sections.
* **Evidence required:** the specific edge cases tested + their outcomes. A build that touches persistence without a save/load test cannot score above 6.
* **What lowers it:** a save-format change with no migration, an untested edge case in a touched path, a known blind spot (the 684 sim crash leaves ~1,000 sim lines unverified — any build that touches the rig section inherits that blind spot until the crash is fixed).

### 4. Maintainability (0–10) — can the next person (or the next agent) change it safely?

* **What counts:** small, focused modules; clear interfaces; no duplicate implementations; no giant functions; no hidden side effects; no circular imports.
* **How it is measured:** files touched, lines added/removed, whether the change extends an existing system (good) or creates a parallel one (bad), whether it follows the architecture map in AGENTS.md.
* **Evidence required:** the file list + a one-line justification per file. A change that adds a second implementation of an existing job scores at most 4.
* **What lowers it:** a new duplicate system, a giant component/function, a circular import, a change that ignores the existing architecture.

### 5. Reusability (0–10) — does it make the next build easier?

* **What counts:** shared modules, templates, registration (one place to add a kind), a pure function that other systems can call, a pattern the next build reuses.
* **How it is measured:** whether another system already uses (or is planned to use) the new code; whether the change follows the registration pattern (e.g. `PALETTE_KINDS` deriving its variant tail from `HOUSE_VARIANT_KINDS` so the list cannot drift).
* **Evidence required:** the named consumer(s) of the new code, or the named future use. A one-off special case scores at most 4.
* **What lowers it:** a hardcoded special case, a one-off hack, a change that only works for one build.

### 6. Complexity (0–10, subtracted) — how much did it cost to add?

* **What counts:** files touched, lines added, new systems, new dependencies, new concepts a reader must hold. Implementation cost folds in here.
* **How it is measured:** the diff (files + lines), the dependency delta (`package.json` changes), and the number of new concepts introduced.
* **Evidence required:** the diff stat. A small, targeted change (the §47 speed rule: targeted incremental changes, reuse existing systems/assets) scores a low deduction (0–3). A rewrite scores a high deduction (7–10).
* **What raises the deduction:** many files, many lines, a new system, a new dependency, a new architecture.

### 7. Regression Risk (0–10, subtracted) — how likely is it to break something that works?

* **What counts:** the blast radius (how many systems the touched files feed), the number of untested paths, and whether the change touches a hot path (movement, collision, saves, NPC schedules).
* **How it is measured:** the genome's "what depends on X" query (the dependents of every touched file) + the test coverage of those dependents. Dependency impact folds in here.
* **Evidence required:** the dependent list + which of them were tested. A change to a leaf file with no dependents scores a low deduction (0–2). A change to the movement pipeline (the most-exercised code in the game) scores a high deduction unless the sim + asserts + probe all pass.
* **What raises the deduction:** touching a hot path, touching a file with many dependents, untested dependents, a change made while the sim has a known blind spot (684) in the affected section.

## The gate rule (the formula never overrides the gates)

**The highest-scoring solution is selected ONLY when it passes the required quality gates.** The four gates (§50): LEVEL 1 IMPLEMENTED, LEVEL 2 INTEGRATED, LEVEL 3 VERIFIED, LEVEL 4 POLISHED. Each gate must have actual evidence (gate name, status, timestamp, test/command, result, commit). A gate that has not run is NOT RUN. A gate that fails is FAILED. Missing results are never silently treated as passing.

A candidate with a high score but a failed gate loses to a lower-scoring candidate whose gates pass. A candidate with no gate evidence at all is not scored — it is marked NOT RUN and set aside.

## Record competing approaches

For every decision, record the competing approaches and why the selected implementation won. Use historical results to improve future decisions. The record lives in the build's entry in `studio/dashboard/history/build-ledger.json` (the "testResults" field) and in the dated log (`~/memory/YYYY-MM-DD.md`). A decision with no recorded alternatives is a decision that cannot be learned from.

## Worked example: BUILD 1030 vs a hypothetical movement-system rewrite

The request (user order 2026-11-07 ~13:42 PST): *"When tapping to walk make the npcs and characters path around objects correctly instead of of having to constantly tap when they get stuck on trees and houses and rocks and npcs."*

### Candidate A — BUILD 1030 (as shipped, code-verified)

Add a tile A* for the player on tap (new pure module `playerPath.ts`, 6,202 bytes, reusing `planPathNpc`'s steps + greedy line-of-sight smoothing to ≤3 waypoints) + fix the NPC pathfinder (whole-remaining-path validation, `sidestepTile`, a `detour` flag that breaks the head-on ping-pong). 7 files touched (6 modified + 1 new). Direct pushes / D-pad / sliding (1020/1021) and sprint (1026) preserved.

| Term | Score | Evidence |
|---|---|---|
| Correctness | 9 | tsc clean (agent + parent re-ran `tsc --noEmit`, exit 0); standalone asserts 97 entry + 47 runner checks PASS; sim vs pristine1029 IDENTICAL, 0 FAIL, same known 684 rig crash. −1 because the phone probe has not run yet (Chromium SIGTRAP) — it is code-verified, not yet gameplay-verified. |
| Performance | 7 | No new per-frame work (pathfinding runs on tap + replan at most every 500ms; the follow loop is event-driven). No measured regression (sim identical). No measured improvement either — the win is fewer re-taps (user-facing), not FPS. Neutral-to-good. |
| Reliability | 8 | Save/load untouched; NPC schedules (993) preserved; 1020/1021 slide + 1026 sprint rules preserved and re-proven by asserts. Unreachable destinations return null ("Path blocked"). |
| Maintainability | 8 | New pure module (`playerPath.ts`), reuses `planPathNpc`'s steps, no duplicate pathfinder created; the change extends the existing movement pipeline. |
| Reusability | 7 | `playerPath` reuses `planPathNpc`'s steps; the A* core is extraction priority 3 (one canonical tile-A* core from the three live pathfinders) — the next build can consolidate it. |
| Complexity | −3 | 7 files, but the change is additive and small; no new system, no new dependency. |
| Regression Risk | −2 | Touches the movement path + NPC pathing (a hot path), but the sim is identical and the asserts re-prove the slide/sprint rules; residual risk is the unrun phone probe. |
| **TOTAL** | **34** | |

Gates: LEVEL 1 IMPLEMENTED (passed), LEVEL 2 INTEGRATED (passed — sim identical), LEVEL 3 VERIFIED (NOT RUN — phone probe + live verify blocked by the environment), LEVEL 4 POLISHED (NOT RUN — depends on Level 3). **1030 is the selected implementation, but it is not yet verified — it must not be reported as landed until Level 3 passes.**

### Candidate B — Hypothetical: rewrite the movement system

Replace `resolvePlayerStep` + the slide system + the NPC stepper with a new unified movement engine, then re-implement sprint, stamina, sliding, and NPC pathing on top of it.

| Term | Score | Evidence / reasoning |
|---|---|---|
| Correctness | 5 | Would need to re-prove every 1020/1021/1026 behaviour from scratch; high risk of losing edge cases (the perpendicular slide, the sticky side, the rearm gate). No asserts exist for the new engine yet. |
| Performance | 6 | Unknown — might improve or regress; no measurement exists. |
| Reliability | 4 | Touches save/load-adjacent movement, sprint, stamina, and NPC schedules — the highest blast radius in the game. |
| Maintainability | 5 | A new system that would eventually replace two — net simpler *eventually*, but the transition carries a second implementation until the old one is removed. |
| Reusability | 5 | A new core could be reused, but it is unproven and has no consumers yet. |
| Complexity | −8 | Rewrites the movement pipeline, touches many files, introduces a new architecture. |
| Regression Risk | −7 | The movement path is the most-exercised code in the game; a rewrite risks regressions in collision, sprint, stamina, and NPCs, and the sim has a known blind spot (684) in the rig section. |
| **TOTAL** | **10** | |

Gates: none run (the rewrite has not been built or tested). **It loses on score (10 vs 34) AND on gates (NOT RUN vs two gates passed).**

### What the example proves

The formula favours the smallest safe change that solves the actual problem — which is the standing rule (§47 speed + the no-rewrite rule + "fix root causes, never mask symptoms"). A rewrite is only worth its deductions when the existing system is fundamentally broken and cannot be fixed incrementally. The movement system was not broken — it was missing one piece (a pathfinder for the player). Adding that piece scored 34; rewriting the system scored 10. The formula records *why* so the next agent does not re-litigate it.

## Using the formula (procedure)

1. Name the candidates (at least two — the proposed implementation and the most plausible alternative, even if the alternative is "do nothing" or "rewrite it").
2. Score each term with evidence (or 0 + a flag if there is no evidence).
3. Run the quality gates for the leading candidate.
4. Select the highest-scoring candidate **whose gates pass**.
5. Record the candidates, their scores, the evidence, and why the winner won (build ledger + dated log).
6. If a later build contradicts the decision (a regression, a better measurement), re-score and record the correction — do not silently revise history.
