# Automatic Project Cleanup Engine

**Directive:** SOUL.md §57 §11.
**What already exists:** The legacy codebase audit (`studio/LEGACY_AUDIT.md` — the complete classification of all 248 `.ts/.tsx` files + the safe-removal order + the extraction priorities), the §52 11-step safe-removal procedure (in SOUL.md §52 and in the audit), and the dashboard's `knownIssues` (the recorded cleanup-relevant findings: 12 duplicate systems, ~20 unused dependencies, the circular import, `public/` at 195 MB). This file adds the cleanup engine: what it cleans, what it never deletes without verification, and the Wave 1/2/3 removal order. It does not replace the audit — it is the engine that executes the audit's removal order safely.

## What it cleans

From §57 §11 (identify):

* **Dead code** — files with no importer in the shipped game, no save dependency, no build-script reference. (The audit's class D: 41 code files + 2 assets, verified.)
* **Duplicate systems** — two or more live implementations of the same job. (The audit found 12: three renderers — App 2D canvas, `IsoFieldView`, App-internal `ThreeDGameView`, plus `Engine3DWorldView`; two stamina models; two interior, ground-detail, worldgen, minimap, character-art, NPC-sim, and save systems.)
* **Unused assets** — files in `public/` that no code path references. (The audit: `public/` is 195 MB / 31,507 files; `public/rpg/` alone is 129 MB; only ~25 MB of base folders verified used. The rest is class E — it needs a runtime asset trace, not static grep. Do NOT delete on grep alone.)
* **Obsolete files** — superseded scenes, deprecated shims, test-only modules that leaked into `src/`. (Wave 1: `engine3d/Engine3DView.tsx`, `iso/boundedCache.ts` + `iso/frameMetrics.ts`, `dev/worldEventBus.ts` / `worldDevHistory.ts` / `worldHealthMonitor.ts`.)
* **Unnecessary dependencies** — packages in `package.json` that nothing imports. (The audit: ~20 unused — shadcn template leftovers: `framer-motion`, `recharts`, `date-fns`, `zod`, `react-hook-form`, most `@radix-ui/*`.)
* **Outdated documentation** — docs that describe a system that no longer exists or has changed. (Not yet audited — a gap. The registry's DOCUMENTED ONLY entries are the starting list.)
* **Unused configuration** — config that no build script or tool reads. (Not yet audited — a gap.)
* **Abandoned experiments** — scratch that was never adopted. (The `public/manaseed/` folder — unused since BUILD 380 — is the example.)
* **Excessive complexity** — the circular import (`IsoFieldView` ↔ `App`) and the giant `src/App.tsx` (~9k lines in the AGENTS.md map; 18,440 lines in the audit's count — the audit's number is the measured one). Complexity is flagged, not deleted: the fix is extraction, not removal.

## What it never deletes without verification (the §52 11-step procedure)

Before removing anything:

1. Search imports and references (static `from`, plus dynamic `import()`).
2. Check dynamic imports and runtime references.
3. Check build scripts and configuration references.
4. Check tests and asset references.
5. Check save compatibility (does any save/load path depend on it?).
6. Check whether the file is needed by another project component.
7. Create a recoverable Git checkpoint (a commit before the removal, so it rolls back cleanly).
8. Remove only verified obsolete code (class D with full evidence — never class E, never by name alone).
9. Run type checks (`tsc --noEmit` exit 0) and builds.
10. Run gameplay tests (sim vs pristine baseline identical; asserts pass; phone probe 0 page errors).
11. Confirm the 3D game still works (the game boots, the player moves, the world renders).

Generate cleanup reports and remove only verified obsolete material. A cleanup report records: the file, its class, the evidence (importers: none; save keys: none; build refs: none), the checkpoint, and the verification results after removal.

## The Wave 1/2/3 removal order (from the legacy audit)

### Wave 1 — Unambiguous dead (8 code files + 2 assets; no extraction needed)

* `src/game/engine3d/Engine3DView.tsx` (0 importers, superseded test scene).
* `src/game/engine3d/fbxHouseModels.ts` (0 importers; imports `three`, which is NOT in `package.json` or `node_modules` — its job is done by `customAssets.ts`'s direct GLB parser; the build only passes because nothing imports it).
* `src/types/three-fbx.d.ts`.
* `src/game/iso/boundedCache.ts` + `src/game/iso/frameMetrics.ts` (deprecated shims).
* `src/game/dev/worldEventBus.ts` / `worldDevHistory.ts` / `worldHealthMonitor.ts` (test-only).
* `public/manaseed/` (unused since BUILD 380).
* `public/v2.5.5.html`.

Execute once git can write (git checkpoint first, then the 11-step procedure, then tsc + build + sim + phone probe).

### Wave 2 — Orphaned utilities, sim-only (10 files; no extraction, but the sim sections go with them)

`chunkBuilder.ts`, `terrainNoise.ts`, `npcMood.ts`, `worldFingerprint.ts`, `worldLore.ts`, `dev/hexTools.ts`, `gameplayAgent.ts`, `simLod.ts`, `profiler.ts`, `workQueue.ts` — each kept alive only by a dynamic import in `scripts/simulate.ts`. Removing them means removing the sim sections that import them, and re-baselining the sim.

### Wave 3 — Sim-only systems, complete but never wired in (23 files; USER DECISION REQUIRED)

The ecosystem cluster (`ecosystem`, `ecoSave`, `ecoHistory`, `ecoQuests`, `migration`, `populations`, `resources`, `foodWeb`), the WFC worldgen cluster (`wfc`, `wfcWorld`, `wfcTown`, `wfcDungeon`, `wfcInfra`), lore/quest-gen (`landmarkGrid`, `caves`, `worldHistory`, `worldEvents`, `questGen`, `examineGen`), and `bosses.ts` / `companions.ts` / `taming.ts` / `npcArchetypes.ts`. Verified zero references in `App.tsx` (apparent mentions are build-note strings/comments). Deletion is a user product decision per cluster, not routine cleanup. Do NOT delete Wave 3 without the user's explicit approval for that cluster.

## What the cleanup engine never does

* Never deletes a file based solely on its name. (The §52 emphasis: never assume a file is unnecessary because its name contains 2D or 2.5D. Most legacy code is B/C — extract first — not D.)
* Never deletes class B or C without extraction first. (The extraction priorities: townsfolk.ts NPC roster/target slice, worldCore.ts clock, one tile-A* core, combat stack, quest stack, items/economy, one canonical worldgen, unify the two stamina models, unify 2.5D + `ag-3d-*` saves, shared engine utils.)
* Never deletes class E. (Unknown means investigate, not delete.)
* Never deletes without a recoverable checkpoint.
* Never deletes `public/rpg/` content on static grep alone — it needs a runtime asset trace first.

## Current state

The cleanup engine as an automated system does NOT exist yet — this file is its specification. What exists: the audit (the classification + the order + the evidence), the 11-step procedure, and the recorded findings (12 duplicate systems, ~20 unused deps, the circular import, `public/` 195 MB). What is missing: the automated identification (currently the audit's one-off analysis), the cleanup-report generation, and the automated verification-after-removal (currently the manual 11-step procedure). The first cleanup task is Wave 1 removal, once git can write — it is the smallest, safest, fully-verified wave, and it proves the engine's procedure on real files.
