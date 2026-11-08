# ASHFALL Development Genome

**Status:** Specification + v1 seed. Version 1.0 — 2026-11-07.
**Directive:** SOUL.md §56 §2 (Build a project-wide intelligence graph).
**Location:** `studio/genome/genome.json` (the index), built by `studio/genome/scanner.mjs`. This file (`studio/acee/DEVELOPMENT_GENOME.md`) is its specification and its seed data — do not mistake this file for the index.

## What the Genome is

The ASHFALL Development Genome is a continuously updated representation of the entire project: a graph of files, classes, methods, functions, interfaces, dependencies, imports, components, systems, data structures, configuration, assets, tests, documentation, and build relationships. It understands relationships between files rather than treating every file as an isolated document.

The point: if a combat system needs an improvement, the engine should identify the relevant character, weapon, animation, damage, enemy AI, inventory, and save-data dependencies automatically. It should not waste time scanning unrelated systems.

## What it tracks

(From §56 §2 — the index covers:)

* **Files** — every source file, with its path, size, and architectural identity (see below).
* **Classes, methods, functions, interfaces** — the symbols inside each file (via AST analysis + symbol indexing).
* **Dependencies and imports** — static `from '…'` imports, dynamic `import()` calls, and runtime references (e.g. `readFileSync` asset paths, `localStorage` keys).
* **Components and systems** — which files belong to which system (3D engine, NPC sim, combat, quests, economy, worldgen, persistence, UI, build tools).
* **Data structures** — the shapes that flow between systems (player state, NPC state, placements, chunks, templates, save keys).
* **Configuration** — `package.json`, `tsconfig.json`, `vite.config.ts`, `scripts/prepare-build-entry.cjs` (which injects `window.__AG_BUILD`), the build markers.
* **Assets** — `public/` (195 MB / 31,507 files), with which files are actually referenced and which are not (only ~25 MB of `public/rpg/` is verified used; the rest needs a runtime asset trace, not static grep).
* **Tests** — `scripts/simulate.ts` (41k+ assertions), the standalone assert runners in `~/workspace/verify<BUILD>/`, the Playwright phone probes.
* **Documentation** — the directives (SOUL.md §47–§59), the architecture map (AGENTS.md), the registry, the legacy audit, the dated logs.
* **Build relationships** — which files a build touched, which commit it landed in, which gates it passed, which run ID deployed it.

## Architectural identity (every file gets one)

Every file carries a machine-readable identity, seeded by the legacy audit's classification (`studio/LEGACY_AUDIT.md`, 248 `.ts/.tsx` files at HEAD `14491c9f`):

| Class | Files | Meaning |
|---|---|---|
| **A — Required by 3D / boot path** | 47 (45 code + 2 CSS) | Breaks boot or the 3D demo if removed. |
| **B — Reusable gameplay logic** | 104 | Live in the shipped 2.5D game; 3D needs this logic eventually. Extract into clean shared modules BEFORE any 2.5D removal. |
| **C — Reusable content / assets** | 56 | Art, sprite, tile, loot, dungeon, and layout data modules. Same extraction-before-removal rule. |
| **D — Obsolete, verified** | 41 code + 2 assets | No live importer; removal waves in the audit (§4). Wave 3 (23 files) is CONTESTED — user product decision, not routine cleanup. |
| **E — Unknown, needs investigation** | 2 code + 3 root server `.js` + asset dirs | Do NOT delete. Never treated as D. |

Most B and C files carry the `R` flag (retire-with-2.5D): their only consumer is the 2.5D game/renderer. They become D the day 2.5D is retired **and** their reusable logic has been extracted. That is expected, not a defect.

## How it is updated (incrementally — never a full re-scan)

* **Change detection first.** The genome watches what changed (git status/diff, file fingerprints/mtimes) and re-indexes only the changed files and their dependents. If a system has already passed an unchanged test suite, do not rebuild its index. If dependency indexing is already current, do not rebuild it.
* **File fingerprints.** Each file gets a fingerprint (hash + size + mtime). A file whose fingerprint is unchanged is not re-parsed.
* **Dependency-graph invalidation.** When a file changes, invalidate only its node and its direct dependents (importers + dynamic importers + test files that cover it). Everything else stays cached.
* **Git history as a source.** Commits are the genome's change log: which files a build touched, which commit it landed in, which gates it passed. The genome reads `git log` (read-only) rather than re-deriving history from scratch.
* **Never rebuild the entire index unnecessarily.** A full re-scan is a recovery operation (after corruption, after a large reorganization), not a routine step.

## How it is queried

The genome answers questions, not file lists. The queries it must support (v1):

* **"What depends on X?"** — all importers (static + dynamic) of a file, plus the tests and build scripts that reference it. Example: `fbxHouseModels.ts` has 0 importers (verified dead, Wave 1) — and it imports `three`, which is NOT in `package.json` or `node_modules`.
* **"What implements Y?"** — which files implement a requirement (registry entry) or a system. Example: the three live pathfinders — `npcNavigation.ts` (2.5D NPC A*), `townsfolk3d.ts` `planPathNpc` (3D NPC A*), and 1030's `playerPath.ts` (3D player A*) — are three implementations of the same job and are extraction priority 3 (one canonical tile-A* core).
* **"What is duplicated?"** — the 12 duplicate systems from the legacy audit: three renderers (App 2D canvas, `IsoFieldView`, App-internal `ThreeDGameView`, plus `Engine3DWorldView`); two stamina models (2.5D `stamina.ts` vs 3D `sprint.ts`); two interiors, two ground-detail, two worldgen, two minimaps, two character-art, two NPC-sims, and two save systems (2.5D saves vs `ag-3d-*` keys).
* **"What breaks if I remove X?"** — the removal safety for a file (NEVER / AFTER-EXTRACTION / WAVE 1/2/3 / HOLD), from the audit's summary inventory.
* **"What is the blast radius of this change?"** — the dependents of the files a build touches. Example: BUILD 1030 touches 7 files (`playerPath.ts` new + `Engine3DWorldView.tsx`, `animals.ts`, `townsfolk3d.ts`, `transients.ts`, `prepare-build-entry.cjs`, `App.tsx`); its blast radius is the tap-to-move path + NPC pathing + the build markers.
* **"Where does this requirement live?"** — registry entry → responsible files. Example: the 3D minimap (registry G17) is NOT IMPLEMENTED in 3D; the 2D minimap exists to port.

## What a v1 genome holds (the seed — real data, not invented)

This is the seed the v1 index is built from. It is a *seed*, not the full graph — the full graph has 248 file nodes + 88 requirement nodes + thousands of symbol/edge entries, and building it is Phase 1's remaining work.

### File nodes (248, from the legacy audit)

The complete file → class → depended-by → removal-safety inventory is in `studio/LEGACY_AUDIT.md` §2. The genome v1 imports that inventory wholesale (it does not re-derive it). Key nodes:

* **Boot path (A):** `src/main.tsx` → `GraphicsModeHost` → always boots 2.5D (`initialMode()` force-writes `'2.5d'` and strips `?mode=`). `src/App.tsx` (18,440 lines). `src/game/engine3d/Engine3DWorldView.tsx` (3,072 lines).
* **3D engine (A/B):** `src/game/engine3d/` — `Engine3DWorldView.tsx`, `townLook.ts`, `placements.ts`, `grassTufts.ts`, `grassMeshes.ts`, `interiors.ts`, `firstPerson.ts`, `townsfolk3d.ts`, `villagers.ts`, `npcMotion.ts`, `templates.ts`, `customAssets.ts`, `transients.ts`, `sprint.ts`, `playerStep.ts`, `playerPath.ts` (NEW in 1030), `sky.ts`, `animals.ts`, `houseFx.ts`, `groundDetail3d.ts`, `townAdditions3d.ts`, `wildTerrain.ts`.
* **Shared game logic (B):** `src/game/` — 46 modules (world: `worldMap.ts`, `landscape.ts`, `elevation.ts`, `organicTowns.ts`, `landmarks.ts`, `civilization.ts`, `travelers.ts`, `mapBuilder.ts`; entities: `ai.ts`, `townsfolk.ts`, `villageLife.ts`, `npcNavigation.ts`, `npcEntry.ts`, `npcAppearance.ts`, `npcBarks.ts`, `simulatedAdventurers.ts`, `monsterSpawns.ts`, `cellarRats.ts`; systems: `worldCore.ts`, `combat.ts`, `quests.ts`, `dialogue.ts`, `persistence.ts`, `examine.ts`, `fieldCamera.ts`, `fieldCollision.ts`; player: `characterCreator.ts`, `characterGen.ts`, `horses.ts`, `housing.ts`, `lockpicking.ts`, `tavern.ts`, `carriage.ts`, `touchInput.ts`, `talkTarget.ts`; content: `pointsOfInterest.ts`, `questSites.ts`, `cornfield.ts`, `groundDetail.ts`, `kitAssets.ts`, `animation.ts`, `effects.ts`, `noise.ts`, `rpgBrain.ts`; editor/debug: `worldEditor.ts`; dungeon: `stoneSoupEngine.ts`, `StoneSoupDungeon.tsx`).
* **2.5D renderer (B, R-flagged):** `src/game/iso/` — `IsoFieldView.tsx`, `IsoInteriorView.tsx`, `IsoRoom.tsx`, `isoChunks.ts`, `isoWorld.ts` (the 3D demo's terrain/world-data source — this is why `isoWorld.ts` is A, not B).
* **Verified dead (D, Wave 1):** `engine3d/Engine3DView.tsx` (0 importers, superseded test scene), `engine3d/fbxHouseModels.ts` (0 importers; broken `three` import), `src/types/three-fbx.d.ts`, `iso/boundedCache.ts` + `iso/frameMetrics.ts` (deprecated shims), `dev/worldEventBus.ts` / `worldDevHistory.ts` / `worldHealthMonitor.ts` (test-only), `public/manaseed/` (unused since BUILD 380), `public/v2.5.5.html`.
* **Sim-only (D, Wave 2):** `chunkBuilder.ts`, `terrainNoise.ts`, `npcMood.ts`, `worldFingerprint.ts`, `worldLore.ts`, `dev/hexTools.ts`, `gameplayAgent.ts`, `simLod.ts`, `profiler.ts`, `workQueue.ts` — each kept alive only by a dynamic import in `scripts/simulate.ts`.
* **Contested (D, Wave 3 — user decision):** the ecosystem cluster (`ecosystem`, `ecoSave`, `ecoHistory`, `ecoQuests`, `migration`, `populations`, `resources`, `foodWeb`), the WFC worldgen cluster (`wfc`, `wfcWorld`, `wfcTown`, `wfcDungeon`, `wfcInfra`), lore/quest-gen (`landmarkGrid`, `caves`, `worldHistory`, `worldEvents`, `questGen`, `examineGen`), `bosses.ts` / `companions.ts` / `taming.ts` / `npcArchetypes.ts`.

### Requirement nodes (88, from the registry)

The complete requirement → status → evidence table is in `studio/IMPLEMENTATION_REGISTRY.md`. Counts: COMPLETE AND VERIFIED 4, IMPLEMENTED BUT UNVERIFIED 15, PARTIALLY IMPLEMENTED 21, DOCUMENTED ONLY 9, NOT IMPLEMENTED 34, BLOCKED 5, OBSOLETE OR DUPLICATED 0. The genome links each requirement to its responsible files (the registry's 7-field sections already name them).

### Edge examples (the relationships the genome must know)

* **Import:** `Engine3DWorldView` → `isoWorld`, `mosslightLayout`, `dayNight`, `townsfolk` (target + types only), `worldCore` (type-only). This edge set is the proof that the 3D demo has no combat/quests/dialogue/shops/inventory/2.5D-save support.
* **Circular import (flagged):** `IsoFieldView` ↔ `App`. The genome must detect and report circular dependencies, not silently accept them.
* **Duplicate:** three pathfinders (`npcNavigation` / `townsfolk3d.planPathNpc` / `playerPath`) → one job (tile A*). Two stamina models (`stamina.ts` vs `sprint.ts`). Two save systems (2.5D saves vs `ag-3d-*` keys).
* **Dependency chain (queue):** 1030 → 1031 → 1032 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 6. 1031 cannot start until 1030 lands (both touch `Engine3DWorldView.tsx`); Stage 2 cannot start until 1032 lands.
* **Blocker:** 1030 → git EPERM (environment) + Chromium SIGTRAP (environment). The genome records blockers as edges to their cause, not as a property of the code.
* **Build → files → commit:** BUILD 1029 → `templates.ts` (+ markers) → commit `14491c9f` → run 42416626999 → served version.json 2026-11-07T21:37:14.339Z. The genome reads this from `git log` + `studio/dashboard/history/build-ledger.json`, not from memory.

### Measurement nodes (Stage 1 baseline, from the audit)

The genome stores measured baselines so optimizations can be compared before/after (see `OPTIMIZATION_LAB.md`): world buffer 237,222 verts (town) / 266,000 verts (wild) — 89% of the 300k budget; rebuild ~165–211ms steady-state; live hitch 566.6ms on a 50-tile teleport; harness FPS town 6.79 / wild 7.82 / shore 9.29 / first-person 6.06 (SwiftShader — relative baseline only); ground FLAT (max ground-plane vertex y = 0.038); 91.6% uniform grass; tint variation ±0.027; stone terrain 0 tiles.

## Techniques (from §56 §2)

AST analysis, symbol indexing, dependency graphs, semantic code search, embeddings, file fingerprints, static analysis, runtime telemetry, git history, and architecture metadata — in appropriate combinations. No single technique is the genome; the genome is the graph they all feed.

## Name collisions (do not inflate any status)

* **BUILD 571 "Game Genome"** (`scripts/genome.mjs`, stale Oct 12) is an unrelated, stale script with a similar name. It is not the Development Genome, and its existence must not inflate the genome's status.
* **§57 advanced memory, §59 MEMORY CORE, and this genome** overlap in scope (all store project knowledge). The overlap is flagged in the registry and is NOT adjudicated here. The genome is the *code* graph; MEMORY CORE is the *operating* memory; the dashboard data is the *record*. They are three views of the same project, not three copies of the same data — and they must not drift into three competing sources of truth.

## What is NOT in v1 (honest gaps)

* The machine-readable genome index exists (v1, 2026-11-07, Phase 1): `studio/genome/genome.json` — AST parser, symbol index, incremental scanner, query CLI (`query.mjs`). This file remains the specification + seed.
* There is no runtime telemetry feed yet (no FPS/frame-time collection from real devices — the harness numbers above are SwiftShader-relative only).
* There is no embedding/semantic-search index yet.
* The `public/` asset graph is incomplete: only ~25 MB of `public/rpg/` is verified used; the rest needs a runtime asset trace, not static grep. Do not mark an asset as unused on static evidence alone.
