# ASHFALL — ENGINE_BIBLE

**Version:** 1.0 — 2026-11-07
**Source:** SOUL.md §53 (living ENGINE_BIBLE describing the ACTUAL implementation) + §55 (unify documentation/memory in GitHub). This file is the living architecture document.
**Status:** This file is NEW (registry D7 was NOT IMPLEMENTED — zero hits for any of the five named docs before this file). It describes the ACTUAL implementation as of HEAD `14491c9f` (BUILD 1029) + the uncommitted BUILD 1030 work, grounded in the legacy audit (`studio/LEGACY_AUDIT.md`), the registry (`studio/IMPLEMENTATION_REGISTRY.md`), and `~/AGENTS.md`. It is not an imaginary future architecture. Where the implementation and the directive disagree, this file states the implementation and flags the gap.

## 1. The headline fact

**The 3D game is NOT the game that ships today. The 2.5D game is.**

* `src/main.tsx` renders `GraphicsModeHost`, which **always boots into 2.5D** (`initialMode()` force-writes `'2.5d'` and strips `?mode=`). The 3D demo is reachable only via Options → Graphics Mode → 3D.
* `Engine3DWorldView` imports only `../iso/isoWorld` (terrain/world data), `../mosslightLayout` (town layout), `../dayNight` (`darknessAlphaForMinutes`), and `../townsfolk` (`townsfolkTarget` + types only), plus `../worldCore` (**type-only**). It has **no combat, no quests, no dialogue, no shops, no inventory, no skills, and no persistence of the 2.5D save** — its saves are separate `ag-3d-*` keys.
* The full RPG lives in `src/App.tsx` (18,440 lines per the registry audit's count; `~/AGENTS.md`'s ~9k figure is stale) + ~160 `src/game/*` modules, rendered by `IsoFieldView` (2.5D) or App's own 2D canvas. App also contains a **third** renderer, `engine/ThreeDGameView` (primitive WebGL dots, Debug: 3D Mode button), which is a different 3D path from `Engine3DWorldView`.
* **Consequence:** deleting everything "2D/2.5D" today would delete the game. The legacy code is mostly B/C (extract first), not D. See `studio/LEGACY_AUDIT.md`.

## 2. The boot path

1. `src/main.tsx` renders `GraphicsModeHost`.
2. `GraphicsModeHost.initialMode()` force-writes `'2.5d'` and strips `?mode=` from the URL. The app always boots into 2.5D.
3. The 2.5D game (`App.tsx` + `IsoFieldView`) loads. The player starts in the tutorial house interior (in the 2.5D flow) and the main game world is the Mosslight overworld.
4. The 3D demo is reachable only via Options (top-right gear) → Graphics Mode → 3D Experimental. It renders `Engine3DWorldView` over the 3D demo world (a separate world from the main 2.5D game — `App.tsx` never imports `isoWorld.ts`).

## 3. The 3D engine (`src/game/engine3d/`)

The 3D demo world is a custom WebGL renderer (vertex-colour triangles ONLY — no normals, no textures, no alpha blending; fragment alpha 1.0; day/night via the `uNight` uniform). 27 files in `src/game/engine3d/` (per the registry).

### Core view

* **`Engine3DWorldView.tsx`** (~3,072 lines per the registry) — the 3D view. Renders the home chunk + 8 neighbours so generated terrain fills the screen at every zoom. Fog 300→600, far plane 700, FOV 66°. Ground in non-overlapping rings (window ±22, band ±64, far (64,240], horizon (240,600], apron (600,1000]). Right-side control cluster (Build, Walk, Undo, Redo, Remove quick-toggle, swipe handle). HUD: compact bottom-left strip (message row, HP bar, stamina bar, Wood/Stone/Gold) + the Sprint ⚡ icon (66×19px, immediately after Gold). Tap-to-move, D-pad, orbit camera, zoom (orbit max 64 since BUILD 1023).
* **`townLook.ts`** — the 3D town look. `VIEW_FAR_PLANE` 700. `groundTintDelta` continuous tint field (since BUILD 1009 — replaced per-tile colour blocks and ring seams with a shared-corner colour field). `houseDesignForVariant` (since BUILD 1012 — Cottage 4×3, Tall 3×3, Shopfront 6×4, Grand 6×5).
* **`placements.ts`** — placed items (path, house, tree, stall, grass, rock, water, wall), blocking rules, remove/undo/redo/move/chunk-capture.
* **`wildTerrain.ts`** — wild terrain beyond the 200×200 map. Wild lakes: `wildLakeAt = groundNoise(x,y,32) > 0.90` (1.76% water, coherent blobs a few tiles across, out-of-map only). Grass ±28, flowers/pebbles/wild trees to ±64 (since BUILD 1024).
* **`sky.ts`** — sun, moon, drifting clouds, day/night (since BUILD 1011; `uNight` = the exact 976 veil composite). Night reads as overcast day at full `uNight` (0.55 cap) — Stage 6 fixes this.
* **`firstPerson.ts`** — first-person mode. `ZOOM_MAX_FAR` = 64 (since BUILD 1023).

### Movement and collision

* **`playerStep.ts`** — `resolvePlayerStep`: direct step, component slides (need `MIN_SLIDE_FRACTION` 0.1), perpendicular slide (full-step lateral, never backwards; side FIXED — east for N/S, south for E/W — while lateral fraction negligible, STICKY via `slidePerpRef`). No-op slide never counts as a move. "Path blocked" only for truly boxed-in cases.
* **`playerPath.ts`** — NEW in BUILD 1030 (uncommitted). Tile A* for the player (reusing `planPathNpc`'s steps) + greedy line-of-sight smoothing (sample every 0.25 tiles) to ≤3 waypoints ending exactly on the tap. Constants: replan 500ms, stuck 1500ms, figure-wait 900ms, waypoint-arrive 0.15. The view follows waypoints (static-blocked → replan now; figure-blocked → wait ≤900ms then replan with the tile excluded; stuck → replan around the tile ahead).
* **`sprint.ts`** — sprint rules. Walk 3.15, sprint 5.04 (×1.6), stamina 100, drain 20/s while sprint-MOVING (actual displacement only), regen 12/s otherwise, exhausted at 0, recover at 25. Tap <500ms + ≤24px drift latches sprint on (green, "Sprinting"); latch clears ONLY on exhaustion. Rearm gate is a LEVEL: any sprint input while exhausted arms it, release only disarms it after recovery. While the gate is armed after recovery the control says "Release!"; while exhausted it says "Tired"/"⚡Tired". World-rebuild threshold 16 (`WORLD_REBUILD_DIST` = 16). Session-only stamina.
* **`townsfolk3d.ts`** — the 3D NPCs (47 Mosslight NPCs with real 2.5D schedules since BUILD 993). `planPathNpc` tile A* (4-dir Manhattan, maxNodes 4000). BUILD 1030 adds whole-remaining-path validation (`pathHasUnwalkableTile`), `sidestepTile`, and a `detour` flag that breaks the head-on ping-pong.
* **`npcMotion.ts`**, **`villagers.ts`** (Minecraft-style figures since BUILD 1019 — blocky bodies, goofy faces, hats), **`transients.ts`** (travelers/adventurers/barks, session-only), **`animals.ts`** (birds flush ≤5, goats shy ≤2, deer flee ≤6, wolves attack; town keep-out 72 from plaza; caps 5/3/3/2; chickens cap 5; session-only).

### World data and content

* **`src/game/iso/isoWorld.ts`** — the authored 200×200 map + the town generator. Centre C=100, plaza (102,102), player start (99,105). `oceanCoastX(y)` = 6 + 12·smoothed noise (coast at x 6–18; ocean extends infinitely west; town ~45 tiles east). Authored 5×5 pond at (119–123, 81–85). World walls (`WallTile {x,y,h}`) from the town generator (boundary wall at C−8=92).
* **`mosslightLayout.ts`** — the Mosslight town layout. `applyMosslightTownLayout` rebuilds town every load, filters authored walls/huts/stalls within 68 tiles of (100,100).
* **`interiors.ts`** + **`IsoInteriorView.tsx`** — enterable house interiors. BUILD 1032 (queued) adds invisible walls so the player can only enter/exit via the Enter/Exit button.
* **`templates.ts`** — chunk save/load templates. `PALETTE_KINDS` derives its variant tail from `HOUSE_VARIANT_KINDS` (BUILD 1029). `captureChunk` emits exactly 15 kinds (8 base placed + 7 house variants).
* **`customAssets.ts`** — custom GLB upload (direct GLB parser; its job supersedes the dead `fbxHouseModels.ts`, which imports `three` — not installed).
* **`houseFx.ts`** — chimney smoke (9 puffs, rise 7 over 10s, dark→sky fade) + staggered house lights (since BUILD 1014/1015).
* **`grassTufts.ts`**, **`grassMeshes.ts`**, **`groundDetail3d.ts`**, **`townAdditions3d.ts`**, **`houseFx.ts`** — ground detail, grass, town additions.

### What the 3D demo does NOT have (the honest gap)

No combat system (melee vs wolves/NPCs + lootable bodies exist, but no bounty/crime, no player XP, no ranged combat), no quests, no dialogue, no shops/economy (inn/store/smith are visual shells; gold only from looting dead NPCs), no dungeons (Ember Vault / Stone Soup are 2D-only), no skills/XP (3D gathering gives resources, no XP), no audio, no minimap, no NPC-vs-monster combat (wolves target the player only), no full AI adventurers (transient walkers exist; the full sim is 2D-only). These are the extraction backlog (registry G8, G11–G15, G17, G19) — the 2D systems exist and are the reuse targets, not dead code.

## 4. The 2.5D game (`src/App.tsx` + `src/game/` + `src/game/iso/`)

The shipped game. `src/App.tsx` (18,440 lines per the registry audit) holds everything app-level; module scope holds pure world-gen/field helpers; the giant `GameField` component holds all gameplay state. `src/game/` has 46 modules (world, entities, systems, player, content, editor/debug — see `~/AGENTS.md` for the full map). `src/game/iso/` is the 2.5D renderer (`IsoFieldView.tsx`, `IsoInteriorView.tsx`, `IsoRoom.tsx`, `isoChunks.ts`). Character art is the chibi LPC paper-doll pack in `public/lpc/` (49 PNGs). `FIELD_SIZE` is 280 (fieldCamera.ts; stale comments cite 0..140).

The 2.5D game has the full RPG: combat, quests, dialogue, shops, inventory, skills (XP from real actions), NPC schedules/relationships/memories, economy, dungeons (Ember Vault, Stone Soup), bounty/crime, factions, and versioned saves with migration. These systems are the reuse targets for 3D (registry G8, G11–G15) — extract them into clean shared modules before any 2.5D removal (legacy audit, class B).

## 5. The save keys

### 2.5D saves

Versioned saves with migration (`persistence.ts` + `migration.ts`). The whole-world JSON is under `iso-world-v2` (placements + `removedHuts`/`removedPaths`/`removedTrees`/`removedCrates`/`removedRocks`/`removedWater`/`removedWalls` + `movedHuts`). `iso-world-v2` is versioned and migrated.

### 3D saves (`ag-3d-*`)

* Player: `ag-3d-player-v1` (save fires on a 400ms interval WHILE WALKING only).
* NPCs: `ag-3d-npcs-v1`.
* Inventory: `ag-3d-inventory-v1`.
* Health: `ag-3d-health-v1`.
* Clock: `ag-3d-clock-v1` (1 game-min per real sec, default 08:00 day 1).
* Templates: `ag-3d-templates-v1`.
* Custom assets: `ag-3d-custom-assets-v1`.
* Hide UI: `ag-hide-ui-v1`.

**Gap (registry G16): the `ag-3d-*` keys have NO versioning.** `iso-world-v2` is versioned+migrated; the `ag-3d-*` keys are not. Versioning them (one version field + a migration path) is a queued task (backlog item G16-SAVEVER) — cheap insurance before any format change silently corrupts saves.

**Session-only (no save key; reload repopulates fresh):** stamina, animals (1013), chickens (1016), transients (1000). E-key gathering: crate +1 wood, tree +2 wood, rock +1 stone (mined rocks stay mined via `removedRocks`). Wood has NO sink in 3D (the Build palette is free).

## 6. The build / deploy pipeline

* **Two build markers, both bumped per build:** the hardcoded `window.__AG_BUILD` in `scripts/prepare-build-entry.cjs` (line 17; that script also rewrites `index.html` from a template every build — head changes go in the template) AND `BUILD_NUMBER` in `src/App.tsx` (~line 200). A mismatch fails deployment validation. The player-facing note is a `'<BUILD>': '<note>'` entry in the App.tsx note map (~line 245–252), ending "Everything else works exactly as before."
* **Deploy:** GitHub Pages. Deploys lag pushes ~2–3 min normally. Verify "live" by content markers (served `version.json` build + note, served `?v=<BUILD>` index `__AG_BUILD`), never bundle filenames (CI and local builds produce different bundle hashes for identical source).
* **Deploy failure recovery:** a Pages deploy can fail/hang at GitHub's deploy step while the build job succeeds. Diagnose via the PUBLIC Actions API (no auth): `api.github.com/repos/jaydonweircontracting-ux/Adventure-game-/actions/runs?per_page=N` and `/actions/runs/<id>/jobs`. Recovery is an empty re-trigger commit (same content, idempotent).
* **Push:** HTTPS + the stored credential helper (`~/.git-credentials`, 600 perms). SSH is blocked by the network proxy. Pasted PATs are treated as exposed and never quoted back. If a subagent push fails git-protocol-blocked (proxy 403), stop and report the local commit hash for the parent to push; never extract credentials. A proxy "Recv failure: Connection reset by peer" (exit 128) is transient, not auth — the parent push is the recovery.
* **Sequencing (the 1022 lesson):** parallel agents share ONE checkout; uncommitted work interleaves. When agents share a tree, brief NO-commit and the PARENT sequences commits (an agent committing whole files sweeps the other agent's hunks in). When the tree is clean and one agent runs alone, it may commit+push itself.
* **Tests:** `scripts/simulate.ts` (run by bundling with the local esbuild binary DIRECTLY — tsx is NOT installed; the bundle must live in `scripts/` for the sim). Pristine worktrees under `/home/hatch`, never `/tmp` (512 MB tmpfs). Playwright: serve `python3 -m http.server 8901 --directory dist/public`, test `http://localhost:8901/?testmode=1`, hooks at `window.__gameTest`; the player starts (141,142) in the main game. Kill servers by PID, never `pkill -f "http.server 8901"` (it matches its own command line and SIGTERMs the calling shell).

## 7. The duplicate systems (12, from the legacy audit)

Three renderers (App 2D canvas, `IsoFieldView`, App-internal `ThreeDGameView`, plus `Engine3DWorldView`); two stamina models (2.5D `stamina.ts` vs 3D `sprint.ts`); two interior, ground-detail, worldgen, minimap, character-art, NPC-sim, and save systems. These are adjudication candidates for Stage A follow-up — do not delete one side without extracting the reusable logic first and wiring 3D to it.

## 8. The known environment blockers (2026-11-07)

* **E1 — git cannot write (EPERM).** Git opens temp objects with mode 0444, then `write()` returns EPERM on overlayfs. `git status`, `git add`, `git hash-object -w`, and `git config --global` all fail. Blocks all landings. Re-tested 2026-11-07 ~15:04 PST — still blocked, HEAD still `14491c9f`. Recovery: retry when the restriction clears (likely on the next deployment/VM replacement). Note (2026-11-07 ~15:05 PST): the restriction is NOT a blanket ban on external-binary writes — `cp` and node `writeFileSync` DO work in `~/workspace`. What fails is git's write pattern, vite's local build (copy_file_range budget), and python's `open('w')`.
* **E2 — Chromium will not launch (SIGTRAP).** SIGTRAP ~100ms after launch; 8 variants tried; the binary itself works (`--version`, `--dump-dom about:blank` exit 0). Blocks phone probes (the Level 3 gate). The 1028 probe used the same Chromium successfully earlier on 2026-11-07.
* **E3 — local vite build impossible.** ~766-call `copy_file_range` budget, then EPERM on the 31,507-file `public/` dir. GitHub Actions deploy builds are unaffected.

## 9. Maintenance

* This file describes the ACTUAL implementation. Update it whenever a system changes (a new module, a removed module, a changed interface, a new save key, a changed pipeline step). Do not let it drift into describing an imaginary future architecture — that is the failure mode §53 warns against.
* When a system is extracted from 2.5D into a shared module and wired into 3D, update the relevant section here (the module moves from "2.5D-only" to "shared") and update the registry status with evidence.
* Next update trigger: BUILD 1030 landing (the `playerPath.ts` module becomes a landed part of the 3D engine, not an uncommitted change).
