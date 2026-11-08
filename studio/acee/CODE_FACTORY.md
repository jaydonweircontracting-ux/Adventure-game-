# Automatic File and Code Factory

**Status:** Specification. Version 1.0 — 2026-11-07.
**Directive:** SOUL.md §56 §4 (Autonomous code sorting machine), §56 §5 (Autonomous code generation machine), §56 §8 (Automatic file and code factory).
**Location:** `studio/acee/CODE_FACTORY.md` (this file).

This file covers three machines that work as one pipeline: the **sorting machine** (organize what exists), the **generation machine** (turn an objective into code), and the **factory** (create complete files automatically). They share one rule: never create what already exists, and never create a file that has to be assembled by hand afterwards.

## Part 1 — The autonomous code sorting machine (§56 §4)

### What it does

Ingest code and intelligently organize it. It must:

* Identify what each file does.
* Recognize duplicate implementations.
* Identify obsolete code.
* Detect misplaced functionality.
* Identify missing dependencies.
* Detect circular dependencies.
* Identify unused imports.
* Identify unnecessary abstractions.
* Detect oversized modules.
* Suggest better architecture.
* Generate new module structures.
* Safely relocate code when necessary.

### Architectural identity

Give every file a machine-readable architectural identity. The seed for that identity is the legacy audit's classification (`studio/LEGACY_AUDIT.md`): A (required by 3D / boot path), B (reusable gameplay logic), C (reusable content / assets), D (obsolete, verified), E (unknown, needs investigation) — plus the `R` flag (retire-with-2.5D: the file's only consumer is the 2.5D game/renderer). The genome (`DEVELOPMENT_GENOME.md`) stores the identity and the relationships between source files, systems, tests, and documentation.

### What the sorting machine has already produced (real output, not a plan)

The Legacy Codebase Audit (2026-11-07, `studio/LEGACY_AUDIT.md`, 37,514 bytes, 230 lines) IS the sorting machine's first output — produced by hand, by the same method the machine will automate:

* **248 files classified** (A 47, B 104, C 56, D 41 code + 2 assets, E 2 code + 3 server `.js` + asset dirs).
* **12 duplicate systems found:** three renderers (App 2D canvas, `IsoFieldView`, App-internal `ThreeDGameView`, plus `Engine3DWorldView`); two stamina models; two interiors, two ground-detail, two worldgen, two minimaps, two character-art, two NPC-sims, two save systems.
* **1 circular dependency found:** `IsoFieldView` ↔ `App`.
* **41 verified-obsolete files in three waves:** Wave 1 (8 code + 2 assets, unambiguous dead — including `fbxHouseModels.ts`, which imports `three`, a package that is NOT installed); Wave 2 (10 sim-only utilities kept alive only by dynamic imports in `scripts/simulate.ts`); Wave 3 (23 files, complete but never wired in — CONTESTED, a user product decision).
* **~20 unused `package.json` dependencies** (shadcn template leftovers) and `public/` at 195 MB / 31,507 files (`public/rpg/` 129 MB, only ~25 MB verified used).

The machine's job is to keep that inventory current — re-classifying on every change, flagging new duplicates and new circular imports as they appear, and never letting the inventory go stale the way the Oct-era engine did.

### The safety procedure (before moving or deleting anything)

Before moving or deleting anything, inspect references and dependencies. Generate a proposed change plan before destructive operations. Preserve rollback capability. The §52 11-step safe-removal procedure governs:

1. Search imports and references (static + dynamic).
2. Check dynamic imports and runtime references.
3. Check build scripts and configuration.
4. Check tests and asset references.
5. Check save compatibility.
6. Determine dependencies.
7. Create a recoverable Git checkpoint.
8. Remove only verified obsolete code.
9. Run type checks and builds.
10. Run gameplay tests.
11. Confirm the 3D game still works.

Steps 7–11 require git to write (currently blocked by the environment EPERM) and a working phone probe (currently blocked by Chromium SIGTRAP). Until those clear, the sorting machine may *propose* removals but must not *execute* them.

## Part 2 — The autonomous code generation machine (§56 §5)

This is the most important component. It transforms a development objective into functioning software.

### Input

A task such as: *"Improve NPC intelligence so villagers remember interactions, develop relationships, and react to changes in their settlement."*

### Processing (the 14-step pipeline)

1. Interpret the objective.
2. Identify relevant architecture (via the genome — which files, which systems, which dependencies).
3. Retrieve existing code (only what's relevant — minimal context retrieval).
4. Identify missing functionality.
5. Determine dependencies.
6. Create an implementation plan.
7. Generate the necessary files.
8. Modify existing files.
9. Generate supporting interfaces.
10. Generate tests.
11. Integrate the implementation.
12. Execute validation.
13. Measure results.
14. Save the verified implementation.

### Output

A complete implementation with source files, updated interfaces, supporting systems, tests, documentation, performance measurements, dependency updates, and Git change records. **Do not output disconnected code snippets that require extensive manual assembly. Generate coherent, integrated implementations.**

### What the pipeline looks like today (the manual version)

The current build-agent brief IS the generation machine operated by hand: audit existing systems first → extend, never duplicate → sync first (fetch, rebase, never force-push) → build number = latest origin/main + 1 → bump BOTH markers → player-terms note → gates (tsc, sim vs pristine, standalone asserts, phone probe, live verify) → report DONE/TESTED/BROKEN/NEXT with commit hash + play link. BUILD 1030 is the most recent output of that pipeline (7 files, tsc clean, 97 + 47 asserts pass, sim identical to pristine1029). ACEE's Phase 2 automates the pipeline; it does not change what the pipeline produces.

## Part 3 — The automatic file and code factory (§56 §8)

### What the factory creates

Classes, interfaces, records, enums, configuration files, JSON schemas, build files, test files, documentation, asset manifests, data definitions, scripts, and generated code where appropriate.

### Before generating (the checks)

* **Check whether equivalent functionality already exists.** The standing rule: never assume a system does not exist — search first. The genome's "what implements Y" query is the check. (The registry exists because documentation kept claiming features that had no code.)
* **Follow established naming conventions.** Files are named for the task, grouped in subdirectories (`src/game/engine3d/` for 3D, `src/game/` for shared logic, `studio/` for dev systems, `~/workspace/verify<BUILD>/` for asserts). A new file that does not follow the convention is a file the next agent cannot find.
* **Follow existing architecture.** Extend `src/game/*`; do not add to `App.tsx` (~9k lines, already too large). Prefer the pure module over the giant component. One clear responsibility per module.
* **Check package structure and dependencies.** A new file that imports a package that is not installed (`fbxHouseModels.ts` importing `three`) is a file that only builds because nothing imports it. The factory validates every import at generation time.
* **Avoid duplication.** If the functionality exists, extend it. If it exists twice, the sorting machine flags it — the factory does not create a third copy.

### After generating (the checks)

* Format. Compile (`tsc --noEmit`, exit 0). Run tests (the smallest relevant suite first; the broader suite at milestones). Validate references (every import resolves; every save key round-trips). Update the project index (the genome — fingerprint the new file, link its dependencies). Update documentation (the architecture map if a new system was created; the build ledger if a build landed). Record changes (commit hash, run ID, gate results).

### Templates and registration (how the factory stays consistent)

* **The build-agent brief** is the factory's template for a code build (see Part 2). Every build follows it; every build reports in the same DONE/TESTED/BROKEN/NEXT shape.
* **Registration, not hardcoding.** New kinds register in one place (the 1029 pattern: `PALETTE_KINDS` derives its variant tail from `HOUSE_VARIANT_KINDS` so the list cannot drift). New systems register in the genome. New builds register in the ledger. A factory that hardcodes a list in two places has already created its next bug.
* **Placement.** The factory creates files directly in the correct project locations rather than requiring manual copy-and-paste. A generated file that lands in the wrong directory is a defect in the factory, not in the file.

## How generation accuracy is measured and improved

Accuracy is not a feeling. It is five numbers, recorded per build:

| Measure | How it is counted | 1030 (most recent) |
|---|---|---|
| tsc | exit code (0 = pass) | 0 (agent + parent re-ran) |
| Asserts | entry + runner checks, pass rate | 97 + 47, all pass |
| Sim vs pristine | normalized log diff, FAIL count | identical, 0 FAIL (known 684 rig crash only) |
| Phone probe | real taps, pass rate, page errors | NOT RUN (Chromium SIGTRAP) |
| Manual repair | files the parent had to fix after the agent's delivery | 0 (the agent's tree was committed as delivered, once git works) |

**Improvement loop (the self-optimizing pipeline, §56 §9):** track time spent searching, time spent generating code, compilation failures, test failures, repeated errors, duplicate work, rebuild time, token consumption, tool usage, successful implementation patterns, and regression frequency. Use the results to improve future strategies. Examples: if a type of change repeatedly causes compilation failures, improve the corresponding generation and validation procedure; if dependency indexing is already current, do not rebuild it; if a system has already passed an unchanged test suite, avoid repeating expensive tests; if a previous implementation failed, preserve the reason and avoid repeating the same mistake. **Optimize development throughput, not simply the number of files generated.**

Failures and their causes are recorded in `studio/MUSE_EVOLUTION.md` (versioned instructions — now v1.1, including the gate-evidence rule from the 2026-11-07 honesty-gap fix) and in the dated logs. A failure with no recorded cause will be repeated.
