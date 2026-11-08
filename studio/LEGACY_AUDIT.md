# LEGACY CODEBASE AUDIT — Adventure Game

**Date:** 2026-11-07 · **HEAD:** `14491c9f` (BUILD 1029) · **Auditor:** read-only subagent (GOD-TIER Directive, SOUL.md §52 §2)
**Scope:** every source file under `src/` (248 `.ts`/`.tsx` files + supporting files), `public/` asset dirs, `package.json` dependencies, `scripts/simulate.ts`, `tests/`, build config (`vite.config.ts`, `scripts/prepare-build-entry.cjs`, `tsconfig.json`), save keys.
**Method:** static import-graph analysis (exact `from '…<module>'` matches, not name mentions), dynamic-import scan, `localStorage` key scan, asset-path reference scan (literal + constructed base constants), `scripts/` + `tests/` importer scan. No file was modified, no commit, no build run (read-only task; `tsc` was NOT re-run because the incremental mode writes build info into the tree).
**Working tree note:** BUILD 1030 (tap-to-walk pathfinding, 7 files incl. new `src/game/engine3d/playerPath.ts`) is uncommitted in the tree. It was not touched. `playerPath.ts` is counted in A (engine3d).

## 0. The finding that frames everything else

**The 3D game is NOT the game that ships today. The 2.5D game is.**

- `src/main.tsx` renders `GraphicsModeHost`, which **always boots into 2.5D** (`initialMode()` force-writes `'2.5d'` and strips `?mode=`). The 3D demo (`Engine3DWorldView`) is reachable only via Options → Graphics Mode → 3D.
- `Engine3DWorldView` imports exactly **two** non-engine3d game modules: `../iso/isoWorld` (terrain/world data) and `../mosslightLayout` (town layout), plus `../townsfolk` (`townsfolkTarget` + types only), `../worldCore` (**type-only**), and `../dayNight` (`darknessAlphaForMinutes`). It has **no combat, no quests, no dialogue, no shops, no inventory, no skills, no persistence of the 2.5D save** — its saves are separate `ag-3d-*` keys.
- The full RPG lives in `src/App.tsx` (18,440 lines) + ~160 `src/game/*` modules, rendered by `IsoFieldView` (2.5D) or App's own 2D canvas. App also contains a **third** renderer, `engine/ThreeDGameView` (primitive WebGL dots, Debug: 3D Mode button), which is a different 3D path from `Engine3DWorldView`.
- **Consequence for classification:** deleting everything "2D/2.5D" today would delete the game. The honest classes are therefore:
  - **A — REQUIRED:** imported by the 3D demo world, or required for the app to boot/start at all.
  - **B — REUSABLE GAMEPLAY LOGIC:** live in the shipped 2.5D game, holding rules the 3D game does not yet have (combat, NPC sim, quests, economy, worldgen, engine utils). Extract into clean shared modules BEFORE any 2.5D removal.
  - **C — REUSABLE CONTENT / ASSETS:** art, sprite, tile, loot, dungeon and layout data modules. Same extraction-before-removal rule.
  - **D — OBSOLETE LEGACY (verified):** no importer in the shipped game, no save dependency, no build-script reference — full evidence in §4. Includes a large **sim-only cluster** (§4.3) that exists only inside `scripts/simulate.ts` / `tests/`.
  - **E — UNKNOWN:** could not be fully verified; never treated as D.
- **`R` flag (retire-with-2.5D):** the file's only consumer is the 2.5D game/renderer. It becomes D the day 2.5D is retired **and** its reusable logic has been extracted. Most of B and C carry this flag — that is expected, not a defect.

## 1. Counts

| Class | Files | What it means |
|---|---|---|
| **A — Required by 3D / boot path** | **47** (45 `.ts/.tsx` + 2 CSS) | Breaks boot or the 3D demo if removed |
| **B — Reusable gameplay logic** | **104** | Live in 2.5D; 3D needs this logic eventually |
| **C — Reusable content / assets** | **56** | Art/data/content modules; extract before removal |
| **D — Obsolete, verified** | **41** `.ts/.tsx` + 2 assets | No live importer; see §4 for waves |
| **E — Unknown, needs investigation** | **2** `.ts/.tsx` + 3 root server `.js` + asset dirs | Do NOT delete |
| **Total `.ts/.tsx` audited** | **248** | 45+104+56+41+2 = 248 ✓ |
| Other files in `src/` | 18 | CSS, JSON, SVG, `.d.ts` counted in A/D where applicable |

Verified-D files: **41 code files + 2 assets** (`public/manaseed/`, `public/v2.5.5.html`).
Top extraction priorities (§6): `townsfolk.ts` (NPC sim), `worldCore.ts` (clock), `combat.ts` + `creatureCombat.ts` + `creatureBehavior.ts`, `quests.ts` + `tasks.ts`, `items.ts`, `npcNavigation.ts`, `shops.ts` + `settlementEconomy.ts`, `worldMap.ts` + `landscape.ts`, `persistence.ts` + `migration.ts`, `skills.ts` + `skillTracks.ts`, engine utils (`spatialHash.ts`, `flowField.ts`, `entityPool.ts`, `simLod.ts` — note `simLod` itself is D/sim-only, see §4.2).

## 2. Summary inventory (file → class → depended-by → removal safety)

Legend: **Depended-by** = verified importers (static `from`, plus dynamic `import()` in `simulate.ts` where noted). **Safety** = `NEVER` (removal breaks boot/3D), `AFTER-EXTRACTION` (remove only after the reusable logic is extracted into a shared module and 3D is wired to it), `WAVE 1/2/3` (verified-D removal waves, §6), `HOLD` (do not remove until investigated).

### 2.1 A — Required (47 files)

| File | Depended-by (verified) | Safety |
|---|---|---|
| `src/main.tsx` | entry (`index.html` → `/src/main.tsx`) | NEVER |
| `src/App.tsx` (18,440 lines) | `GraphicsModeHost` (boot path) | NEVER as a file; contains inseparable 2D canvas + 2.5D + 3D-mode code — see §3.1 |
| `src/game/engine3d/GraphicsModeHost.tsx` | `main.tsx` | NEVER |
| `src/game/engine3d/Engine3DWorldView.tsx` (3,072 lines) | `GraphicsModeHost` (3D mode) | NEVER |
| `src/game/engine3d/engine3d.ts` | `GraphicsModeHost` (type `GraphicsMode`) | NEVER |
| `src/game/engine3d/animals.ts`, `customAssets.ts`, `firstPerson.ts`, `grassMeshes.ts`, `grassTufts.ts`, `groundDetail3d.ts`, `houseFx.ts`, `interiors.ts`, `npcMotion.ts`, `placements.ts`, `playerPath.ts` (1030, uncommitted), `playerStep.ts`, `sky.ts`, `sprint.ts`, `swipe.ts`, `templates.ts`, `townAdditions3d.ts`, `townLook.ts`, `townsfolk3d.ts`, `transients.ts`, `villagers.ts`, `wildTerrain.ts`, `Engine3DTouchControls.tsx` (24 files) | `Engine3DWorldView` (directly or transitively) | NEVER |
| `src/game/iso/isoWorld.ts` | `Engine3DWorldView` + `placements.ts`, `townsfolk3d.ts`, `wildTerrain.ts`, `interiors.ts`, etc. (15 importers) | NEVER |
| `src/game/mosslightLayout.ts` | `Engine3DWorldView`, `townsfolk3d.ts`, App, `IsoFieldView` (11 importers) | NEVER |
| `src/game/dayNight.ts` | `townsfolk3d.ts` (`darknessAlphaForMinutes`), App | NEVER |
| `src/game/townsfolk.ts` (**partial**) | `townsfolk3d.ts` uses only `townsfolkTarget` + roster types; the rest is 2.5D-only (22 importers total) | NEVER as a file; the 2.5D-only 90% is B — extract the roster/target slice first (§6) |
| `src/game/engine/ThreeDGameView.tsx` | App (Debug: 3D Mode, `threeDMode`) — a **third, separate** renderer from `Engine3DWorldView` | NEVER while App's 3D button exists; duplicate-renderer finding (§5) |
| `src/game/iso/IsoRoom.tsx`, `src/game/iso/RpgPreview.tsx` | App demo routes (`return <IsoRoomDemo/>`, `RpgPreview`) | NEVER (reachable); route reachability itself unverified — confirm before relying on it |
| `src/components/error-boundary.tsx` | `main.tsx`, App | NEVER |
| `src/components/CharacterCreator.tsx`, `src/components/RpgCharacterCreator.tsx` | App character creation (2.5D sprite-based; 3D has no equivalent) | NEVER while 2.5D start flow exists |
| `src/components/ui/card.tsx`, `ui/toast.tsx`, `ui/toaster.tsx`, `ui/tooltip.tsx`, `src/hooks/use-toast.ts`, `src/lib/utils.ts` | App + CharacterCreator + iso modules | NEVER |
| `src/pages/not-found.tsx` | App (wouter `Switch`) | NEVER |
| `src/index.css`, `src/monster-sprites.gen.css` | `main.tsx` | NEVER |

### 2.2 B — Reusable gameplay logic (104 files, all `R`-flagged except where noted)

| Group (count) | Files | Depended-by | Extraction note |
|---|---|---|---|
| B1 World / time / gen rules (18) | `worldCore.ts`, `worldMap.ts`, `landscape.ts`, `elevation.ts`, `geology.ts`, `noise.ts`, `seasons.ts`, `worldFlags.ts`, `microCA.ts`, `organicTowns.ts`, `settlementLayout.ts`, `townLayout.ts`, `travelers.ts`, `civilization.ts`, `pointsOfInterest.ts`, `questSites.ts`, `worldEditor.ts`, `mapBuilder.ts` | App + sim (+ iso modules for `landscape`) | `worldCore` clock is the #1 extraction (3D has its own `DayClock` in `townsfolk3d.ts`); `landscape`/`worldMap` overlap WFC worldgen (D) — pick one canonical worldgen before extracting |
| B2 NPC / social rules (18) | `villageLife.ts`, `npcNavigation.ts`, `npcEntry.ts`, `npcBarks.ts`, `npcMorality.ts`, `npcGear.ts`, `npcGearEconomy.ts`, `npcStorage.ts`, `conversationMemory.ts`, `dialogue.ts`, `dialogueIntent.ts`, `topicMachines.ts`, `partner.ts`, `simulatedAdventurers.ts`, `rpgBrain.ts`, `characterGen.ts`, `playerImpact.ts`, `housing.ts` | App + sim | `npcNavigation.findPath` vs 3D `planPathNpc` vs 1030 `playerPath` — three pathfinders (§5); `dialogue` + `topicMachines` + `conversationMemory` form one dialogue stack, extract together |
| B3 Combat / creature rules (20) | `combat.ts`, `creatureCombat.ts`, `creatureBehavior.ts`, `creatureAbilities.ts`, `ai.ts`, `monsterSpawns.ts`, `hateList.ts`, `fearPath.ts`, `raids.ts`, `cellarRats.ts`, `overworldTraps.ts`, `environmentalDanger.ts`, `mitigation.ts`, `elements.ts`, `spellFormulas.ts`, `classes.ts`, `aa.ts`, `lootableBodies.ts`, `questRewards.ts`, `houseDeeds.ts` | App + sim | Combat stack (`combat` + `creatureCombat` + `creatureBehavior` + `mitigation` + `ai`) is pure and 3D-ready in principle; `raids.ts` is edge-only by user order (do not expand scope while extracting) |
| B4 Player / items / economy rules (22) | `items.ts`, `skills.ts`, `skillTracks.ts`, `stamina.ts`, `horses.ts`, `houseChests.ts`, `playerBank.ts`, `shops.ts`, `carriage.ts`, `tavern.ts`, `lockpicking.ts`, `pickpocket.ts`, `sneak.ts`, `crime.ts`, `bounty.ts`, `faction.ts`, `quests.ts`, `tasks.ts`, `questEvents.ts`, `settlementEconomy.ts`, `townProduction.ts`, `examine.ts` | App + sim | `stamina.ts` (2.5D) vs `engine3d/sprint.ts` (3D) is a live duplicate (§5) — unify on one stamina model; `quests` + `tasks` + `questEvents` + `questSites` extract as one quest stack |
| B5 Engine / utils / render-support (26) | `fieldCamera.ts`, `fieldCollision.ts`, `touchInput.ts`, `textInputGuard.ts`, `audio.ts`, `effects.ts`, `animation.ts`, `updateVersion.ts`, `spatialHash.ts`, `flowField.ts`, `entityPool.ts`, `persistence.ts`, `minimapRadar.ts`, `iso/projection.ts`, `iso/rotation.ts`, `iso/isoSprites.ts`, `iso/characterSystem.ts`, `iso/isoChunks.ts`, `iso/dirtPaths.ts`, `engine/browserGameEngine.ts`, `engine/proceduralWorldArt.ts`, `rendering/boundedCache.ts`, `rendering/frameMetrics.ts`, `StoneSoupDungeon.tsx`, `stoneSoupEngine.ts`, `shared/guards.ts` | App / `IsoFieldView` / sim | `projection`/`rotation` are pure math — extract as-is; `persistence.ts` is the 2.5D save format (v2, `SAVE_FILE_FORMAT='adventure-game-save'`) — 3D saves use separate `ag-3d-*` keys and do NOT use it; Stone Soup is a separate mini-game reachable from App, not part of 3D |

### 2.3 C — Reusable content / assets (56 files, all `R`-flagged)

| Group (count) | Files | Depended-by | Extraction note |
|---|---|---|---|
| C1 Sprite / art modules (21) | `animalSprites.ts`, `artCache.ts`, `barbarian.ts` (= `iso/barbarian.ts`), `buildingArt.ts`, `buildingRig.ts`, `caveKit.ts`, `foodSprites.ts`, `kitAssets.ts`, `knightSprites.ts`, `monsterSprites/index.ts`, `monsterSprites/sheetProbe.ts`, `rodwanTrees.ts`, `rpgSprites.ts` (= `iso/rpgSprites.ts`), `equipmentArt.ts` (= `iso/equipmentArt.ts`), `townSprites.ts`, `dialoguePortraits.ts`, `isoTiles.ts` (= `iso/isoTiles.ts`), `cornfield.ts`, `groundDetail.ts`, `houseTypes.ts`, `npcAppearance.ts` | App / `IsoFieldView` / sim | `buildingRig.ts` carries the known 684 gap (`assetMetaFor` returns null for 5 variants: cottage-wide, hall-grand, house-balcony, house-tall, shop-banner); `rpgSprites`/`equipmentArt` drive the 2.5D paper-doll — 3D uses Minecraft figures (`villagers.ts`), so this art is reusable only if 2.5D art is kept or re-skinned |
| C2 Content / data tables (20) | `dungeonLayouts.ts`, `dungeonPry.ts`, `dungeonShops.ts`, `dungeonTraps.ts`, `dungeonUniques.ts`, `dungeonVaults.ts`, `questTitles.ts`, `settlements.ts`, `bestiary.ts`, `classLoot.ts`, `lootGrammar.ts`, `characterCreator.ts`, `iso/critters.ts`, `iso/horseArt.ts`, `iso/dungeonKit.ts`, `townTrees.ts`, `wheatFields.ts`, `mills.ts`, `minimapIcons.ts`, `landmarks.ts` | App / `stoneSoupEngine` / sim | Dungeon vault/shop/trap/unique tables feed `stoneSoupEngine` (B5) — extract with it; `bestiary`/`classLoot`/`lootGrammar` are data+rules, extract with the loot stack |
| C3 Dev / editor / UI + 2.5D renderer components (15) | `AudioOptions.tsx`, `dev/ChunkZoneSelector.tsx`, `dev/DevConsole.tsx`, `dev/WorldObjectCoordinates.tsx`, `dev/assetTransparency.ts`, `worldgen/LittleWorldGeneratorPanel.tsx`, `worldgen/littleWorldGenerator.ts`, `doorGeometry.ts`, `eightDirection.ts`, `behaviors.ts`, `talkTarget.ts`, `iso/IsoFieldView.tsx`, `iso/IsoInteriorView.tsx`, `townStrays.ts`, `interiors.ts` (= `game/interiors.ts`) | App / sim | `IsoFieldView`↔App is a **circular import** (`IsoFieldView.tsx:54` imports from `../../App`); `IsoFieldView`/`IsoInteriorView` are renderer components, not reusable logic — they retire with 2.5D, their reusable parts are the B5 math modules; `interiors.ts` (2.5D layout gen) vs `engine3d/interiors.ts` (3D) is a duplicate pair (§5) |

### 2.4 D — Obsolete, verified (41 code files + 2 assets)

See §4 for per-file evidence. Waves: **Wave 1** (8, unambiguous dead) · **Wave 2** (10, orphaned utilities, sim-only) · **Wave 3** (23, sim-only systems — complete but never wired in; deletion is a product decision, see §4.3).

| File | Wave | Evidence (one line) |
|---|---|---|
| `engine3d/Engine3DView.tsx` | 1 | 0 importers; isolated WebGL test scene; superseded by `Engine3DWorldView` |
| `engine3d/fbxHouseModels.ts` | 1 | 0 importers; imports `three` — package is NOT in `package.json` and NOT in `node_modules`; `customAssets.ts` parses GLB directly without three.js (BUILD 997) |
| `src/types/three-fbx.d.ts` | 1 | Declares only the `FBXLoader` module used by `fbxHouseModels.ts` |
| `iso/boundedCache.ts`, `iso/frameMetrics.ts` | 1 | 2-line `@deprecated` re-export shims; 0 importers of the shims; canonical files live in `rendering/` and are what `IsoFieldView` imports |
| `dev/worldEventBus.ts`, `dev/worldDevHistory.ts`, `dev/worldHealthMonitor.ts` | 1 | 0 `src/` importers; only `tests/world-dev-foundation.test.ts` imports them |
| `chunkBuilder.ts`, `terrainNoise.ts` | 2 | 0 app imports; only `simulate.ts` dynamic imports (ll.9793–9794) + one help-text string in `App.tsx:13598` ("Full API: src/game/chunkBuilder.ts…", "UI preview coming in next build") |
| `npcMood.ts`, `worldFingerprint.ts`, `worldLore.ts`, `dev/hexTools.ts` | 2 | Only `simulate.ts` dynamic imports (ll.9302, 9489, 9493, 9951); 0 app references |
| `gameplayAgent.ts` | 2 | Only `scripts/playtest.ts` + `simulate.ts`; 0 app references |
| `simLod.ts`, `profiler.ts`, `workQueue.ts` | 2 | Only `simulate.ts`; 0 app references |
| `ecosystem.ts`, `ecoSave.ts`, `ecoHistory.ts`, `ecoQuests.ts`, `migration.ts`, `populations.ts`, `resources.ts`, `foodWeb.ts` | 3 | Sim-only cluster (§4.3); `migration.ts`'s 2 App mentions are comments, not imports |
| `wfc.ts`, `wfcWorld.ts`, `wfcTown.ts`, `wfcDungeon.ts`, `wfcInfra.ts` | 3 | Sim-only; `wfc.ts`'s only live consumers are sim-only modules (`landmarkGrid`, `caves`, `worldHistory`) |
| `landmarkGrid.ts`, `caves.ts`, `worldHistory.ts`, `worldEvents.ts`, `questGen.ts`, `examineGen.ts` | 3 | Sim-only; all App mentions are build-note strings/comments (e.g. build 929 bosses, build 964 caves — implemented via `dungeonUniques`/`caveKit`, not these modules) |
| `bosses.ts`, `companions.ts`, `taming.ts`, `npcArchetypes.ts` | 3 | Sim-only; `bosses.ts` is NOT the dungeon-boss implementation (that is `dungeonUniques.ts`); `companions.ts` is NOT the live companion system (that is `partner.ts`) |
| `public/manaseed/` (1.3 MB) | 1 (asset) | 0 references anywhere in `src`/`scripts`/`tests`/`index.html`; `AGENTS.md` records "Mana Seed PNGs still on disk… but unused since BUILD 380" |
| `public/v2.5.5.html` (16 KB) | 1 (asset) | 0 references anywhere; appears to be an old version snapshot served at `/v2.5.5.html` |

### 2.5 E — Unknown, needs investigation (2 code files + 3 server files + asset dirs)

| File | Why E | What to check before any decision |
|---|---|---|
| `src/game/traits.ts` | 1 loose importer; precise import chain not traced in this audit | Trace its importer(s); check whether `characterGen`/`npcArchetypes` depend on it |
| `src/game/npcKnowledge.ts` | 1 loose importer; precise chain not traced | Trace its importer(s); check whether the dialogue stack reads it |
| `server.js`, `world_generator.js`, `persistence.js` (repo root) | Standalone world server (`npm run world-server` / `start`); imports resolve (files exist); NOT part of the Vite/GitHub-Pages game | Confirm whether anyone runs this server; if dead, it is a separate removal decision, not part of the game audit |
| Asset dirs with no literal reference (see §5.4) | Paths are often constructed from base constants, so absence of a literal string is not proof of death | Runtime asset trace (see §6) before deleting: `public/rabbits/`, `public/gui/`, `public/map-tiles/`, `public/iso-chars/`, `game sprites/` subdirs other than `starting house/` + `world tiles/`, bulk of `public/rpg/` beyond the 7 base folders, depth-of-use of `public/barbarian/` (12 MB), `public/buildings/` (17 MB), `public/props/` (9 MB), `public/sprites/` (4 MB) |

## 3. Class A — evidence

- **Boot path (verified by reading the files):** `index.html` → `/src/main.tsx` → `GraphicsModeHost` → `App` (2.5D) or `Engine3DWorldView` (3D). `GraphicsModeHost.initialMode()` force-writes `'2.5d'`. There is no code path in which the 3D demo is the default or the only game.
- **3D demo's real dependency surface (verified from `Engine3DWorldView.tsx` imports + transitive imports of every `engine3d/` module):** `iso/isoWorld.ts`, `mosslightLayout.ts`, `dayNight.ts`, `townsfolk.ts` (slice), `worldCore.ts` (type-only). Everything else the 3D demo needs lives inside `engine3d/` itself. The 3D demo does not import `isoSprites`, `characterSystem`, `rpgSprites`, `combat`, `quests`, `items`, `shops`, `dialogue`, `persistence`, or any other gameplay module.
- **App.tsx is A as a file but B/C in content:** it is the shell that must boot, and it contains the 2D canvas renderer, the 2.5D wiring, the Stone Soup mount, the editor/debug panels, and the `threeDMode` mount — inseparable without a rewrite (which §52 forbids). Any future "remove 2.5D" work is a surgical excision inside App.tsx, not a file deletion.
- **Save compatibility:** the 2.5D save format is `persistence.ts` (`SAVE_FILE_FORMAT='adventure-game-save'`, `CURRENT_SAVE_VERSION=2`, `migrateSave` v1→v2). The 3D demo uses its own keys (`ag-3d-player-v1`, `ag-3d-npcs-v1`, `ag-3d-inventory-v1`, `ag-3d-health-v1`, `ag-3d-clock-v1`, `ag-3d-templates-v1`, `ag-3d-custom-assets-v1`, `iso-world-v2`). Removing `persistence.ts`/`migration.ts` would break loading existing 2.5D saves; `migration.ts` itself is D (sim-only — see §4.3) but `persistence.ts` is B and must be kept until 2.5D saves are migrated or abandoned by user decision.

## 4. Class D — evidence per wave

### 4.1 Wave 1 — unambiguous dead (8 code files + 2 assets)

- `engine3d/Engine3DView.tsx`: zero importers in `src/` + `scripts/`; header says "Isolated WebGL test scene. It does not touch either legacy renderer." Superseded by `Engine3DWorldView`. Safe-removal steps §52 apply; no save, test, or asset depends on it.
- `engine3d/fbxHouseModels.ts`: zero importers; imports `three` + `three/examples/jsm/loaders/FBXLoader.js`; `three` is absent from `package.json` and from `node_modules/` (verified by `ls`), and there is no transitive `three` directory. The file's own header claims "Three.js and FBXLoader are bundled locally" — that is no longer true. Its job (loading the FBX house pack for the blocked stone-house replacement) is currently done by `customAssets.ts`, which parses GLB directly with no three.js (BUILD 997). Note: if the stone-house FBX package ever arrives, this loader's *approach* may be wanted again — keep the decision in the removal commit message, do not silently delete the context.
- `src/types/three-fbx.d.ts`: declares only the `FBXLoader` module; goes with `fbxHouseModels.ts`.
- `iso/boundedCache.ts`, `iso/frameMetrics.ts`: each is a 2-line `@deprecated` re-export of `../rendering/*`; zero importers of the shims. `IsoFieldView` already imports from `rendering/`.
- `dev/worldEventBus.ts`, `dev/worldDevHistory.ts`, `dev/worldHealthMonitor.ts`: zero `src/` importers; sole importer is `tests/world-dev-foundation.test.ts`. Removing them requires deleting/updating that test file's imports.
- Assets: `public/manaseed/` (zero references + AGENTS.md "unused since BUILD 380"); `public/v2.5.5.html` (zero references; old snapshot).

### 4.2 Wave 2 — orphaned utilities, sim-only (10 files)

Each has **zero** static importers in `src/`, zero references in `App.tsx` (except the noted help string), and is kept alive only by a dynamic `import()` inside `scripts/simulate.ts` (or `scripts/playtest.ts`):

- `chunkBuilder.ts` / `terrainNoise.ts` — `simulate.ts:9793–9794`; App's only mention is the help string at `App.tsx:13598` ("Full API: src/game/chunkBuilder.ts, src/game/terrainNoise.ts", "UI preview coming in next build" — the preview never shipped).
- `npcMood.ts` — `simulate.ts:9302` only. (It imports `npcArchetypes.ts`, which is Wave 3.)
- `worldFingerprint.ts` / `worldLore.ts` — `simulate.ts:9489, 9493` only.
- `dev/hexTools.ts` — `simulate.ts:9951` only.
- `gameplayAgent.ts` — `scripts/playtest.ts` + `simulate.ts` only.
- `simLod.ts`, `profiler.ts`, `workQueue.ts` — `simulate.ts` only.
- Removal requires deleting the corresponding `simulate.ts` sections (they are the only consumers). Do not delete the modules while leaving dangling dynamic imports in the sim.

### 4.3 Wave 3 — sim-only systems, complete but never wired in (23 files) — CONTESTED

This is the audit's largest single finding. A whole second game-systems layer exists that **the shipped game never imports**:

- **Ecosystem cluster:** `ecosystem.ts`, `ecoSave.ts`, `ecoHistory.ts`, `ecoQuests.ts`, `migration.ts`, `populations.ts`, `resources.ts`, `foodWeb.ts`. Importers are only each other + `simulate.ts`. `App.tsx` contains zero references to `ecosystem`, `ecoSave`, `ecoHistory`, `ecoQuests` (verified by grep). `migration.ts`'s two App mentions are comments ("migration runs on load", "build/save migration"), not imports.
- **WFC worldgen cluster:** `wfc.ts`, `wfcWorld.ts`, `wfcTown.ts`, `wfcDungeon.ts`, `wfcInfra.ts`. `wfc.ts` itself is imported only by sim-only modules (`wfcWorld`, `wfcInfra`, `wfcDungeon`, `landmarkGrid`, `caves`, `worldHistory`) + `simulate.ts`. The live worldgen is `worldMap.ts` / `landscape.ts` / `elevation.ts` (B1).
- **Lore/quest-gen cluster:** `landmarkGrid.ts`, `caves.ts`, `worldHistory.ts`, `worldEvents.ts`, `questGen.ts`, `examineGen.ts`. All App mentions are build-note strings or comments: build 929's named dungeon bosses are implemented in `dungeonUniques.ts`, not `bosses.ts`; build 964's walk-in caves are implemented via `caveKit.ts` + `pointsOfInterest.ts`, not `caves.ts` (`generateCave`).
- **Creature systems:** `bosses.ts` (NOT the dungeon-boss implementation), `companions.ts` (NOT the live companion system — that is `partner.ts`, B2), `taming.ts`, `npcArchetypes.ts` (imported only by `npcMood.ts` (Wave 2) + `simulate.ts:9233`).
- **Why "contested":** these are complete, sim-tested systems, not broken stubs. Deleting them is a **product decision** (the user never ordered them wired in, and never ordered them deleted), not a routine cleanup. Recommendation: **Wave 3 goes last, only on explicit user approval, one cluster at a time, with the sim sections removed in the same commit.** The alternative — wiring them into the 3D game — would reclassify them as B, which is also a legitimate outcome and is the §58 (AGEE) direction. Do not delete Wave 3 silently as part of a "cleanup" commit.

## 5. Duplicates, unused dependencies, dead code, redundant assets

### 5.1 Duplicate systems (two or more live implementations of the same job)

1. **Three renderers:** (a) App's 2D canvas field renderer (inside `App.tsx`), (b) `IsoFieldView` 2.5D isometric renderer, (c) App-internal `ThreeDGameView` (primitive WebGL, Debug: 3D Mode), (d) `Engine3DWorldView` (the real 3D demo). (c) and (d) are different 3D paths; (c) consumes App's live sim (townsfolk/monsters) while (d) has its own demo world — so (c) is not redundant *today*, but the two 3D paths must converge before 3D becomes the game.
2. **Three pathfinders:** `npcNavigation.findPath` (2.5D NPCs, App), `townsfolk3d.planPathNpc` (3D NPCs), `playerPath.planPlayerPath` (1030, 3D player tap-to-move). Plus `flowField.ts` (sim-only, Wave 2) and `fearPath.ts` (B3). Unify on one tile-A* core when extracting.
3. **Two stamina/sprint models:** `stamina.ts` (2.5D: drain 14/s, regen 10/18/s, relock 30, persisted in saves) vs `engine3d/sprint.ts` (3D: 3.15/5.04 u/s, drain 20/s, regen 12/s, rearm gate). Same player concept, different numbers and rules.
4. **Two interior systems:** `game/interiors.ts` (`generateInteriorLayout`, 2.5D) vs `engine3d/interiors.ts` (3D hut doors/exits/walkability).
5. **Two ground-detail systems:** `groundDetail.ts` (2.5D, App) vs `engine3d/groundDetail3d.ts` (3D).
6. **Two worldgen families:** live `worldMap.ts`/`landscape.ts`/`elevation.ts`/`noise.ts` vs sim-only WFC (`wfc*.ts`, Wave 3) vs orphaned `terrainNoise.ts`/`chunkBuilder.ts` (Wave 2).
7. **Two minimap systems:** `minimapRadar.ts` (radar dots) vs `minimapIcons.ts` (icons) — both live in App; check whether both are still rendered.
8. **Two bounded-cache / frame-metrics copies:** resolved already — `iso/*` are deprecated shims over `rendering/*` (Wave 1). Do not create a third copy.
9. **Two character-art systems:** LPC paper-doll (`iso/isoSprites.ts`, `characterSystem.ts`, `rpgSprites.ts`, `equipmentArt.ts`, `public/lpc/`) for 2.5D vs Minecraft figures (`engine3d/villagers.ts`) for 3D. Plus the unused Mana Seed set (`public/manaseed/`, Wave 1 asset).
10. **Two NPC sims:** `townsfolk.ts` (2.5D, 47 Mosslight NPCs + schedules) vs `townsfolk3d.ts` (3D roster + schedules, imports only a slice of `townsfolk.ts`).
11. **Two dialogue-adjacent stacks:** `dialogue.ts` + `dialogueIntent.ts` + `topicMachines.ts` + `conversationMemory.ts` (all B2, live) — overlapping intent/topic handling; extract as one stack, do not split.
12. **Two save systems:** 2.5D `persistence.ts`/`migration.ts` vs 3D `ag-3d-*` keys managed inside `engine3d/` modules (`townsfolk3d.loadClock/saveClock`, `isoWorld.loadWorld/saveWorld`, `templates.ts`, `placements.ts`). A future unified save must reconcile both.

### 5.2 Unused dependencies (`package.json`)

Verified by grep over `src/` (no import of the package name anywhere):

- **Definitely unused:** `framer-motion`, `recharts`, `date-fns`, `embla-carousel-react`, `sonner`, `cmdk`, `zod`, `react-hook-form`, `react-icons`, `next-themes`, `react-day-picker`, `input-otp`, `@hookform/resolvers`, `@radix-ui/react-accordion` (and, by the same check, every other `@radix-ui/react-*` package except `react-toast` and `react-tooltip`, which are imported once each). These are shadcn/ui template leftovers. `src/components/ui/` contains only `card`, `toast`, `toaster`, `tooltip`.
- **Used (do not remove):** `wouter` (App routing), `@tanstack/react-query` (`QueryClientProvider` in App), `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-toast`, `@radix-ui/react-tooltip`, `react`, `react-dom`, `vite`, `typescript`, `tailwindcss`, `@tailwindcss/vite`, `vaul` (false positive — the 15 hits are the English word "vault", not the package; no `vaul` import exists).
- **Not in `package.json` but imported:** `three` (imported only by Wave-1-dead `fbxHouseModels.ts`; `npm run build` succeeds today only because nothing imports that file). If `three` is ever wanted, add it properly; do not vendor it by hand.
- **Note:** removing unused deps is a `package.json` + lockfile change with a fresh `npm ci` + build verification; it is not part of a code-removal wave and was not tested here.

### 5.3 Dead code inside live files (flagged, not verified for removal)

- `App.tsx` build-note map (ll. ~239–304) contains strings referencing systems that do not exist in the live code (e.g. build 929 bosses via `bosses.ts`, build 964 caves via `caves.ts`) — the notes describe the *dungeon/cave features*, which were implemented through other modules. Do not "fix" the notes by deleting the features; the notes are history.
- `IsoFieldView.tsx:54` imports from `../../App` (circular import App ↔ IsoFieldView). It works today; any extraction of `IsoFieldView` must break this cycle first.
- `worldEditor.ts` / `mapBuilder.ts` / dev panels: live editor tooling inside the shipped game (App). They are B/C, not dead — but they are 2.5D-only, and the 3D game has its own Build tool (`placements.ts`, `templates.ts`). Do not delete the 2.5D editor until the 3D Build tool covers its jobs.
- Known 684 sim crash (`assetMetaFor` returns null for 5 building variants) is a **test-only** crash in `simulate.ts`'s rig section; it is not a dead-code issue and is out of scope for this audit (user decision pending).

### 5.4 Redundant / unverified assets (do NOT delete without a runtime asset trace)

- `public/` totals **195 MB / 31,507 files**; `public/rpg/` alone is **129 MB / 29,772 files**. `rpgSprites.ts` states only the 7 base folders (~25 MB) are used; `equipmentArt.ts` references `rpg/` for gear, but the bulk was not traced file-by-file — **E**.
- Root `game sprites/` directory is **122 MB** and is NOT under `public/`; Vite bundles only the files imported by path (`starting house/IMG_5422.png`, `IMG_5424.png` via `IsoFieldView`/`IsoInteriorView`) plus runtime URL loads of `game sprites/world tiles/*` (`isoTiles.ts:394`). The rest (`BaseHumanMale`, `baseHumanMale`, `dagger`, `temple dungeon`, …) is **E** — trace before touching.
- Verified-used asset dirs (literal or constructed-base references found): `public/lpc/` (`isoSprites.ts`), `public/iso-tiles/` (`ISO_TILES_BASE`), `public/iso-food/` (`foodSprites.ts`), `public/sprites/animal-sprites/` (`animalSprites.ts`, incl. `rabbit.png` — so `public/rabbits/` itself is unreferenced), `public/audio/` (`audio.ts`), `public/buildings/` + `public/props/` (`IsoFieldView`, `buildingArt`, `settlements`, `townLayout`), `public/rpg/` base folders (`rpgSprites.ts`).
- No literal reference found, needs a runtime trace (E): `public/rabbits/`, `public/gui/`, `public/map-tiles/`, `public/iso-chars/`, `public/iso-critters/` (1 loose hit), `public/iso-dungeon/` (1 loose hit), `public/iso-ui/` (1 loose hit), `public/map-tiles-pixel/`, `public/mobs/` (2 loose hits — likely constructed paths), `public/kit/` (3), `public/dungeon/` (2), `public/critters/` (2), `public/wolves/` (1), `public/environment/` (1), `public/items/` (1), `public/assets/` (6). Loose hits may be substring false positives; the trace must resolve constructed paths (`${base}…`, `artUrl(…)`, `KENNEY_PIECE_PATHS`, etc.).

## 6. Recommended safe-removal order + extraction priorities

**Rules (from §52, applied literally):** for every file — (1) search imports/references, (2) check dynamic imports, (3) check build scripts/config, (4) check tests/assets, (5) check save compatibility, (6) determine dependencies, (7) create a recoverable Git checkpoint, (8) remove only verified obsolete code, (9) run type checks + builds, (10) run gameplay tests, (11) confirm the 3D game still works. **Never remove a B/C file before its extraction is done and 3D is wired to the extracted module.** All waves below assume git can write again (it cannot in this environment at audit time).

### Wave 1 — Unambiguous dead (8 code files + 2 assets; no extraction needed)
`engine3d/Engine3DView.tsx` · `engine3d/fbxHouseModels.ts` · `src/types/three-fbx.d.ts` · `iso/boundedCache.ts` · `iso/frameMetrics.ts` · `dev/worldEventBus.ts` · `dev/worldDevHistory.ts` · `dev/worldHealthMonitor.ts` · `public/manaseed/` · `public/v2.5.5.html`.
Also delete/update: the `tests/world-dev-foundation.test.ts` imports of the dev trio. Then: `tsc --noEmit`, production build, sim run, phone probe of 3D + 2.5D boot.

### Wave 2 — Orphaned utilities (10 files; no extraction, but sim sections go with them)
`chunkBuilder.ts` · `terrainNoise.ts` (also remove the App help string at `App.tsx:13598` or repoint it) · `npcMood.ts` · `worldFingerprint.ts` · `worldLore.ts` · `dev/hexTools.ts` · `gameplayAgent.ts` · `simLod.ts` · `profiler.ts` · `workQueue.ts`.
Each removal deletes its `simulate.ts` dynamic-import section in the same commit. Then: sim run (expect the sim to pass with fewer sections — record the new assertion count), build, phone probe.

### Wave 3 — Sim-only systems (23 files; USER DECISION REQUIRED — see §4.3)
One cluster at a time, only on explicit approval: (a) ecosystem cluster (8), (b) WFC cluster (5), (c) lore/quest-gen cluster (6), (d) creature systems (4). Each cluster removal deletes its `simulate.ts` + `tests/` sections in the same commit and records the new sim assertion count. **Alternative outcome:** reclassify a cluster as B and wire it into the 3D game instead (the §58 AGEE direction). Either outcome must be the user's call.

### Extraction priorities (before any B/C removal; in order)
1. **`townsfolk.ts` → shared NPC core.** Extract the roster/target/schedule slice that `townsfolk3d.ts` already uses (`townsfolkTarget`, roster types) into a shared module both sims consume; the 2.5D-only remainder stays until 2.5D retires.
2. **`worldCore.ts` clock → shared clock.** 3D's `DayClock` (`townsfolk3d.ts:140`) and the 2.5D `WorldClockState` must become one clock; `dayNight.ts` is already shared (A).
3. **Pathfinding → one tile-A* core.** Merge `npcNavigation.findPath`, `townsfolk3d.planPathNpc`, `playerPath.planPlayerPath` (1030) onto a single core with per-caller walkability; keep the 1030 figure-wait/detour behaviour (verified 2026-11-07).
4. **Combat stack → shared combat.** `combat.ts` + `creatureCombat.ts` + `creatureBehavior.ts` + `creatureAbilities.ts` + `mitigation.ts` + `ai.ts` as one package; 3D has no combat today, so this is additive, not a replacement.
5. **Quest stack → shared quests.** `quests.ts` + `tasks.ts` + `questEvents.ts` + `questSites.ts` + `questRewards.ts` (+ `questTitles.ts` data).
6. **Items/economy → shared economy.** `items.ts` + `shops.ts` + `settlementEconomy.ts` + `playerBank.ts` + `npcStorage.ts` + `npcGearEconomy.ts`.
7. **Worldgen → one canonical generator.** Decide between live `worldMap`/`landscape` and WFC (Wave 3) before extracting; do not extract both.
8. **Stamina → one model.** Unify `stamina.ts` (2.5D) and `engine3d/sprint.ts` (3D) numbers/rules by user decision (sprint numbers are user-visible: 3.15/5.04, 20/s, 12/s, 0, 25).
9. **Persistence → one save.** Reconcile 2.5D `persistence.ts` (v2 format) with the `ag-3d-*` keys; do not break existing 2.5D saves without a migration the user approves.
10. **Engine utils → shared kernel.** `spatialHash.ts`, `flowField.ts` (currently Wave 2/sim-only — reclassify to B if the 3D sim needs it), `entityPool.ts`, `noise.ts`, `shared/guards.ts`, `iso/projection.ts`, `iso/rotation.ts`.

### What NOT to do
- Do not delete any A file, any B/C file before extraction, any E file, or any Wave 3 cluster without explicit user approval.
- Do not delete `App.tsx`'s 2D canvas renderer, `IsoFieldView`, or the 2.5D editor while 2.5D is still the boot path.
- Do not remove unused `package.json` dependencies in the same commit as code removal; verify with a fresh `npm ci` + build separately.
- Do not "fix" the `three` situation by vendoring three.js by hand; either add the package properly or leave `fbxHouseModels.ts` deleted.

## 7. Limits of this audit (honest gaps)

- **Not verified:** runtime asset usage (constructed paths make static grep insufficient — §5.4 lists the E dirs); reachability of App's demo routes (`IsoRoomDemo`, `RpgPreview`); whether `server.js` / `world_generator.js` / `persistence.js` are run anywhere; `traits.ts` / `npcKnowledge.ts` import chains; the full contents of `scripts/*.mjs` tooling (autonomous-engine, brain, genome, worker, etc. — repo automation, not game code, not audited file-by-file).
- **Not run:** `tsc`, production build, sim suite, or phone probe (read-only task + environment write restriction). Every D claim rests on static dependency evidence only, which is the correct bar for D — but the §52 steps 9–11 (type checks, builds, gameplay tests) must still be executed at removal time, per wave.
- **Counts check:** 45 (A `.ts/.tsx`) + 104 (B) + 56 (C) + 41 (D) + 2 (E) = 248 `.ts/.tsx` files, matching the repo file count at HEAD `14491c9f` plus the uncommitted 1030 file `playerPath.ts` (counted in A). If a recount disagrees by a file, the per-file tables in §2 govern, not the headline counts.
