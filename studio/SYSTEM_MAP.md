# ASHFALL — SYSTEM_MAP

**Version:** 1.0 — 2026-11-07
**Source:** SOUL.md §55 (unify documentation/memory in GitHub) + `studio/IMPLEMENTATION_REGISTRY.md` (the 88 requirements, each with its implementation, dependencies, and responsible files) + `studio/LEGACY_AUDIT.md` (the file-level dependency map) + `~/AGENTS.md` (the architecture map). This file is the system map. It describes what exists, what each system takes in and puts out, and what it depends on.
**Status:** This file is NEW (registry D7 was NOT IMPLEMENTED — zero hits for any of the five named docs before this file). Statuses below are from the registry (v1.0, 2026-11-07 ~15:00 PST). Nothing here was live-verified by this file's author — statuses cite the registry and the dated logs.

## How to read this map

* **Status** is the registry status (COMPLETE AND VERIFIED / IMPLEMENTED BUT UNVERIFIED / PARTIALLY IMPLEMENTED / DOCUMENTED ONLY / NOT IMPLEMENTED / BLOCKED). "In 3D" means the system is wired into `src/game/engine3d/`; a system that exists only in the 2.5D game is NOT IMPLEMENTED *in 3D*, even though the legacy code exists.
* **Inputs / Outputs** are the system's interface (what it consumes, what it produces). **Dependencies** are the systems or files it needs to work.
* **Files** are the responsible modules. Where a system is 2D-only, the files are the reuse targets for 3D extraction (legacy audit class B).

## Game systems (3D world)

| ID | System | Status | Inputs | Outputs | Dependencies | Files |
|---|---|---|---|---|---|---|
| G1 | 3D world rendering | IMPLEMENTED BUT UNVERIFIED | World data (isoWorld, mosslightLayout), player position, camera state, clock | The rendered 3D view (WebGL vertex-colour triangles, fog, day/night) | isoWorld, mosslightLayout, dayNight, townLook, placements, wildTerrain, sky | `src/game/engine3d/Engine3DWorldView.tsx` (3,072 lines), `townLook.ts`, `placements.ts`, `wildTerrain.ts`, `sky.ts`, `firstPerson.ts` |
| G2 | Terrain: heightfield / shores / stone | PARTIALLY IMPLEMENTED | Ground noise, terrain types, coast function | Ground surface (flat today), tint field, coast | wildTerrain, isoWorld, groundDetail3d | `wildTerrain.ts`, `townLook.ts` (groundTintDelta), `groundDetail3d.ts`. Heightfield NOT IMPLEMENTED (ground is flat, max y 0.038). No shore band. Stone type defined, 0 tiles. Stage 2 builds this. |
| G3 | Water (ocean, pond, blocking, placeable) | IMPLEMENTED BUT UNVERIFIED | Coast function, placed water, player/NPC positions | Water surface (#1f5c91), movement blocking, placeable water in the Build menu | isoWorld (oceanCoastX), placements, wildTerrain | `src/game/iso/isoWorld.ts` (oceanCoastX), `Engine3DWorldView.tsx`, `placements.ts`. Bug: wild lakes render as whole far cells at distance (BUILD 1031). |
| G4 | Vegetation (trees, grass, wild detail) | IMPLEMENTED BUT UNVERIFIED | Tree/grass placement data, wild terrain | Trees, grass tufts, flowers, pebbles, wild trees | townLook, grassTufts, grassMeshes, wildTerrain, groundDetail3d | `grassTufts.ts`, `grassMeshes.ts`, `groundDetail3d.ts`, `wildTerrain.ts`. ONE tree design for everything (118 crates render as pine trees). Stage 3 builds this. |
| G5 | Architecture & houses (7 variants, roofs, interiors) | IMPLEMENTED BUT UNVERIFIED | House variants, placements, interiors | Houses (7 variants), enterable interiors, roof variety (colour/axis only) | templates, interiors, townLook, placements | `templates.ts` (HOUSE_VARIANTS, PALETTE_KINDS), `interiors.ts`, `IsoInteriorView.tsx`, `townLook.ts`. All 26 town huts roofAxis='x' (zero roofline variation). Stage 4 builds this. |
| G7 | NPCs in 3D (47, schedules, A*) | IMPLEMENTED BUT UNVERIFIED | NPC roster, 2.5D schedules, world walkability | 47 NPCs walking their schedules, A* pathfinding, facing | townsfolk.ts (roster/schedules), townsfolk3d (planPathNpc), npcMotion, villagers | `townsfolk3d.ts` (ROSTER_3D, planPathNpc), `npcMotion.ts`, `villagers.ts`, `src/game/townsfolk.ts` (roster/schedules — 2D source, reused). BUILD 1030 adds whole-path validation, sidestep, detour flag. |
| G8 | NPC-vs-monster combat in 3D | NOT IMPLEMENTED | — | — | — | Zero bounty/crime hits in engine3d/; wolves target the player only. The 2.5D combat stack (combat.ts, creatureCombat.ts, creatureBehavior.ts) is the reuse target. Stage D builds this. |
| G9 | Animals (birds, goats, deer, wolves, chickens) | IMPLEMENTED BUT UNVERIFIED | Player position, habitat, town keep-out radius | Animals roaming, flushing/fleeing/attacking, chickens pecking | animals.ts, wildTerrain | `animals.ts` (caps 5/3/3/2/5, keep-out 72 from plaza, session-only). |
| G10 | Player combat in 3D | PARTIALLY IMPLEMENTED | Player input, target, weapon | Melee vs wolves/NPCs, lootable bodies | combat (2D), playerStep | Melee + lootable bodies exist; no bounty/crime, no player XP, no ranged combat. Stage E builds this. |
| G11 | Quests in 3D | NOT IMPLEMENTED | — | — | — | `quests.ts` exists (2D only); zero quest wiring in engine3d/. Stage E builds this. |
| G12 | Economy / shops in 3D | NOT IMPLEMENTED | — | — | — | Inn/store/smith are visual shells; gold only from looting dead NPCs. `shops.ts` + `settlementEconomy.ts` (2D) are the reuse targets. Stage E builds this. |
| G13 | Dungeons in 3D (Ember Vault, Stone Soup) | NOT IMPLEMENTED | — | — | — | `dungeonVaults.ts` / `stoneSoupEngine.ts` exist (2D only); zero dungeon hits in engine3d/. The Ember Vault must not be discarded — reuse it into 3D. Stage E builds this. |
| G14 | Skills / XP in 3D | NOT IMPLEMENTED | — | — | — | `skills.ts` exists (2D only); 3D gathering gives resources, no XP. Standing rule: skills earn XP only from real successful actions; never award XP for clicks or menu opens; never invent a crafting/fishing/mining system when the underlying gameplay does not exist yet. Stage E builds this. |
| G15 | AI adventurers in 3D | PARTIALLY IMPLEMENTED | Road network, plaza, schedules | Transient walkers (travelers, adventurers) passing through, pausing at the plaza, barking | transients.ts, townsfolk3d, npcMotion | `transients.ts` (cap 5 travelers + 3 adventurers, session-only). Full sim (delves/loot/coins/level/equipment) is 2D-only. Stage D builds this. |
| G16 | Save / persistence (3D keys) | IMPLEMENTED BUT UNVERIFIED | Player/NPC/inventory/health/clock/templates/custom-assets state | Saved 3D state (localStorage) | persistence (2D), migration (2D) | `iso-world-v2` (versioned+migrated); `ag-3d-player-v1`, `ag-3d-npcs-v1`, `ag-3d-inventory-v1`, `ag-3d-health-v1`, `ag-3d-clock-v1`, `ag-3d-templates-v1`, `ag-3d-custom-assets-v1`, `ag-hide-ui-v1` (NO versioning — backlog item G16-SAVEVER). Stamina/animals/chickens/transients are session-only. |
| G17 | Minimap in 3D | NOT IMPLEMENTED | — | — | — | Zero minimap hits in engine3d/; the circular minimap is 2D-only despite a standing request since 2026-10-12. Candidate to pull forward into Stage C. |
| G18 | HUD / Build menu / undo-redo / sprint | PARTIALLY IMPLEMENTED | Player state, Build palette, input | HUD strip (HP/stamina/Wood/Stone/Gold + Sprint ⚡ icon), Build menu, undo/redo, sprint | sprint.ts, playerStep.ts, templates.ts, Engine3DWorldView | Build menu + undo/redo + sprint exist; minimap absent (see G17). |
| G19 | Audio in 3D | NOT IMPLEMENTED | — | — | — | Zero audio hits in engine3d/; `audio.ts` is 2D-only. Stage F builds this. |
| G20 | Performance (device baseline) | IMPLEMENTED BUT UNVERIFIED | World buffer, rebuild time, FPS | Measured numbers (SwiftShader harness only) | Engine3DWorldView, townLook, grass | Only SwiftShader harness numbers exist (town 6.79 / wild 7.82 / shore 9.29 / first-person 6.06; world buffer 237k verts town / 266k wild, 89% of the 300k budget; rebuild ~165–211ms; live hitch 566.6ms on a 50-tile teleport). Real-phone FPS is unknown. Stage F builds this. |

## Development systems

| ID | System | Status | Inputs | Outputs | Dependencies | Files |
|---|---|---|---|---|---|---|
| D1 | Live development dashboard (artifact) | IMPLEMENTED BUT UNVERIFIED | Hard-coded data (today) | The dashboard artifact (`ashfall-development-dashboard`) | — (reads nothing from the repo today) | Artifact `ashfall-development-dashboard` (verified 2026-11-07 ~14:16 PST: no console errors, no broken assets, no text issues, no phone-width overflow; the Verified ledger filter works). Must be wired to `studio/dashboard/` JSON (Stage B). |
| D2 | §54 dashboard data in repo (`studio/dashboard/`) | PARTIALLY IMPLEMENTED | Build history, verification records, quality gates, Stage 1 baseline | `dashboard-data.json`, `dashboard-schema.json`, `README.md`, `MUSE_INSTRUCTIONS.md`, `snapshots/`, `history/` | git log (commit hashes, read-only), the dated logs | `studio/dashboard/` (working copies in the repo's `studio/` now; all JSON validated; honesty-gap fix applied 2026-11-07 ~15:05 PST). Nothing reads them yet — wiring is Stage B. |
| D3 | Build ledger / verification history | PARTIALLY IMPLEMENTED | Build results, commit hashes, run IDs, verification records | `history/build-ledger.json` (1016–1032), `history/verification-history.json`, `~/workspace/verify*/` (110 dirs) | git log, GitHub Actions runs, phone probes | 1016–1029 evidenced; 1016–1025 carry null verification timestamps (exact times not recorded — only dates known); 1026–1029 have real timestamps + run IDs. |
| D4 | Quality gates L1–L4 | PARTIALLY IMPLEMENTED | Test results, commit hashes | Gate records (name, status, timestamp, test/command, result, commit) | tsc, sim, asserts, phone probe, live verify | Real gate records exist only for 1030 (L1/L2 PASSED, L3/L4 NOT RUN). 1016–1029 are Level 3 (VERIFIED) — the Level-4 claims were downgraded 2026-11-07 ~15:05 PST (no per-build Level-4 evidence). |
| D5 | Autonomous dev engine (§49/§50 RUN, backlog, Teams A–F) | PARTIALLY IMPLEMENTED | The backlog, the last verified checkpoint, the execution budget | Implemented + tested + verified builds, in order | ENGINE.md, GOVERNOR.md, EVOLUTION_LEDGER.md (this doc set), the registry, the dashboard JSON | Oct-era scripts exist but are stale (last session 2026-10-12); the live queue lives only in dashboard JSON + MEMORY.md. This doc set (`studio/autonomous-engine/`) is the specification. |
| D6 | Code evolution machine ACEE (§56) | DOCUMENTED ONLY | — | — | — | Directive text only; zero code hits. BUILD 571 "Game Genome" is unrelated and stale. Future work, Phases 1–7. |
| D7 | ENGINE_BIBLE / SYSTEM_MAP / PROJECT_STATE / NEXT_TASK / TEST_STATUS (§55 docs) | NOT IMPLEMENTED → DONE (this file set) | The registry, the legacy audit, the dashboard data, AGENTS.md | The five §55 docs (this file is one of them) | IMPLEMENTATION_REGISTRY.md, LEGACY_AUDIT.md, dashboard-data.json | `studio/ENGINE_BIBLE.md`, `studio/SYSTEM_MAP.md` (this file), `studio/PROJECT_STATE.md`, `studio/NEXT_TASK.md`, `studio/TEST_STATUS.md`. Created 2026-11-07. |
| D8 | Game evolution engine AGEE (§58) | DOCUMENTED ONLY | — | — | — | Directive text only; one hit in CONTINUE_ASHFALL.md future-work list. Future work. |
| D9 | Self-evolution files (§59) | IMPLEMENTED BUT UNVERIFIED | The directives, the project state, the revision log | `MUSE_SOUL.md`, `MUSE_EVOLUTION.md`, `CONTINUE_ASHFALL.md` | SOUL.md §47–§59, MEMORY.md, the dated logs | `studio/MUSE_SOUL.md` (v1.0), `studio/MUSE_EVOLUTION.md` (v1.1), `studio/CONTINUE_ASHFALL.md`. In the repo's `studio/` now (working copies; commit when git can write). |
| D10 | This registry (§55 Stage A) | PARTIALLY IMPLEMENTED | SOUL.md §47–§59, MEMORY.md, the dated logs, AGENTS.md, the repo code, read-only git log | `IMPLEMENTATION_REGISTRY.md` (88 requirements) | The three scope audits, the legacy audit | `studio/IMPLEMENTATION_REGISTRY.md` (v1.0, 2026-11-07 ~15:00 PST, 1,016 lines, 145,576 bytes). Reconciliation with the legacy audit + repo landing pending. Next update trigger: BUILD 1030 landing. |
| D11 | Automated testing infrastructure | PARTIALLY IMPLEMENTED | Source code, pristine baselines, assert files, probe scripts | tsc results, sim comparisons, assert outputs, probe screenshots, CI runs | simulate.ts, esbuild, Playwright/Chromium, GitHub Actions | `scripts/simulate.ts` + `~/workspace/verify*/` (110 dirs) + CI. Limited by the 684 crash (S2) and the environment blocks (E1–E3). |
| D12 | GitHub integration (repo + Pages deploy) | COMPLETE AND VERIFIED | Commits, pushes, GitHub Actions | The repo (HEAD `14491c9f`), the Pages deploy (live at the play link) | git, GitHub Actions, the credential helper | Repo `https://github.com/jaydonweircontracting-ux/Adventure-game-`; Pages deploy works (including two recorded deploy-job failures recovered by empty re-trigger commits). |

## Directives (§47–§59) — the rules layer

The directives are not code; they are the operating rules. Their index is `studio/DEVELOPMENT_DIRECTIVES.md` (section, title, date, one-line summary each; full text in `~/SOUL.md`). Their implementation status is in the registry (R1–R13): §47 PARTIALLY IMPLEMENTED, §48 PARTIALLY IMPLEMENTED, §49 DOCUMENTED ONLY, §50 PARTIALLY IMPLEMENTED, §51 DOCUMENTED ONLY (truncated as received), §52 PARTIALLY IMPLEMENTED (audit delivered; no file removed yet), §53 DOCUMENTED ONLY, §54 PARTIALLY IMPLEMENTED, §55 PARTIALLY IMPLEMENTED, §56 DOCUMENTED ONLY, §57 DOCUMENTED ONLY, §58 DOCUMENTED ONLY, §59 PARTIALLY IMPLEMENTED.

## Standing rules (T1–T6) — the process layer

| ID | Rule | Status | Notes |
|---|---|---|---|
| T1 | Skills earn XP only from real successful actions | PARTIALLY IMPLEMENTED | Mining/chopping actions exist; XP wiring + UI + save/load not evidenced complete. Never award XP for clicks or menu opens; never invent a crafting/fishing/mining system when the underlying gameplay does not exist yet. |
| T2 | Everything added goes in the Build menus | PARTIALLY IMPLEMENTED | Followed since 1025 (Rock/Water/Wall); palette-gap audit re-run per build. |
| T3 | Doors and paths must line up | PARTIALLY IMPLEMENTED | Quality bar in force; the even-width door offset (S8) is a live violation. |
| T4 | Never ship guess-builds | PARTIALLY IMPLEMENTED | Process rule; followed in the 1018/1020/1021/1026/1030 traces. |
| T5 | No traditional RPG level scaling | DOCUMENTED ONLY | Rule only; danger zones exist via monster regions. |
| T6 | Play link with every finished build | COMPLETE AND VERIFIED | Every landed build report in the dated logs carries the play link. |

## Environment blockers (E1–E3) — the infrastructure layer

| ID | Blocker | Status | Effect |
|---|---|---|---|
| E1 | Git cannot write (EPERM) | BLOCKED | Git opens temp objects with mode 0444, then `write()` returns EPERM on overlayfs. Blocks all landings. Re-tested 2026-11-07 ~15:04 PST — still blocked, HEAD still `14491c9f`. |
| E2 | Chromium will not launch (SIGTRAP) | BLOCKED | SIGTRAP ~100ms after launch; 8 variants tried. Blocks phone probes (the Level 3 gate). |
| E3 | Local vite build impossible | BLOCKED | ~766-call `copy_file_range` budget, then EPERM on the 31,507-file `public/` dir. GitHub Actions deploy builds are unaffected. |

## Overlaps (not yet adjudicated)

From the registry ("Overlaps flagged"): four descriptions of the same autonomous loop (§49 RUN vs §50 10-minute cycle vs §53 engine vs §57 orchestrator); three dashboards (§50 vs §53's 10-module dashboard vs §54); three genome/memory systems (§56 Development Genome vs §57 advanced memory vs §59 MEMORY CORE vs BUILD 571 "Game Genome" — a name collision, not a status); self-healing (§52 vs §53 vs §59); docs (§53's ENGINE_BIBLE vs the §55 doc set); autonomous QA (§53 QA Players vs §57 gameplay intelligence vs §58 player-experience intelligence); 2D vs 3D parallel implementations (quests, shops, dungeons, skills, adventurers, bounty/crime, audio, minimap — intentional reuse targets, not duplication to delete). Adjudication belongs to Stage A follow-up. Until then: one engine (`studio/autonomous-engine/`), one live dashboard artifact, one memory home (`studio/`).

## Maintenance

* Update this map when a system changes status, gains or loses an interface, or is added/removed. The registry is the source of truth for statuses; this map mirrors it.
* Next update trigger: BUILD 1030 landing (Q1 → COMPLETE AND VERIFIED; the `playerPath.ts` module becomes a landed part of the 3D engine).
