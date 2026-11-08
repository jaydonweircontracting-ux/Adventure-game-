# ASHFALL — Master Implementation Registry (§55 Stage A)

**Audit date:** 2026-11-07 ~15:00 PST
**Registry version:** 1.0 (first draft — Stage A)
**Auditors:** three parallel read-only subagents (game systems / development systems / directives & standing decisions), synthesized by the parent audit agent. No files were modified, no commits made, no builds run by the auditors.
**Repo state at audit time:** `~/workspace/adventure-game`, HEAD `14491c9f` (BUILD 1029, live-confirmed). BUILD 1030 implemented but UNCOMMITTED in the working tree (7 files). Git cannot write (EPERM on overlayfs); Chromium will not launch (SIGTRAP); local vite build impossible. See E1–E3.
**Sources:** `~/SOUL.md` §47–§59 (9,286 lines), `~/MEMORY.md`, `~/memory/2026-11-07.md`, `~/AGENTS.md`, `~/workspace/studio/` (MUSE_SOUL.md, MUSE_EVOLUTION.md, CONTINUE_ASHFALL.md, dashboard/), `~/workspace/verify*/` (110 directories), repo code (`src/App.tsx` — 18,440 lines per this audit's count, `src/game/`, `src/game/engine3d/` — 27 files), read-only `git log`.

## Method and honesty rules

- Every requirement was checked against the **actual implementation** (files, functions, grep results), not against documentation claims. Where documentation says a feature exists but no code was found in the relevant scope, it is marked NOT IMPLEMENTED or DOCUMENTED ONLY.
- **"In 3D" matters:** the 3D game is the primary target (§48). A system that exists in the legacy 2D/2.5D game but is not wired into `src/game/engine3d/` is NOT IMPLEMENTED *in 3D*, even though the legacy code exists. This is stated explicitly per entry.
- Anything not verified is marked as such. "IMPLEMENTED BUT UNVERIFIED" means the code was inspected and exists, but no live/phone verification was done or recorded in this audit. "COMPLETE AND VERIFIED" is used only where served markers, run IDs, or recorded phone probes support it.
- **Nothing in this registry was live-verified by the auditors** — no game run, no build, no `tsc`, no `simulate.ts`, no browser probe was executed during this audit. Test claims cite the dated logs and module headers.

## Status key

- **COMPLETE AND VERIFIED** — implemented, tested, and confirmed live (served marker / run ID / phone probe).
- **IMPLEMENTED BUT UNVERIFIED** — code inspected and present; live confirmation missing or not re-checked.
- **PARTIALLY IMPLEMENTED** — exists in part; material pieces missing.
- **DOCUMENTED ONLY** — exists as directive/design text; no implementation.
- **NOT IMPLEMENTED** — no implementation (and no design, or design only in a queue entry).
- **BLOCKED** — cannot proceed (missing files, missing user decision, or environment failure).
- **OBSOLETE OR DUPLICATED** — superseded by another system, or a duplicate of one. **No entry is ruled OBSOLETE/DUPLICATED in this draft** — overlaps are flagged in the "Overlaps flagged (not yet adjudicated)" section at the end; adjudication belongs to Stage A follow-up, not to this audit alone.

## Summary table

| ID | Requirement | Status | Evidence (one line) |
|----|-------------|--------|---------------------|
| G1 | 3D world rendering | IMPLEMENTED BUT UNVERIFIED | Engine3DWorldView.tsx (3,072 lines), fog 300–600, far plane 700, uNight day/night |
| G2 | Terrain: heightfield / shores / stone | PARTIALLY IMPLEMENTED | Ground tint complete; heightfield NOT IMPLEMENTED (flat); no shore band; stone type defined, 0 tiles |
| G3 | Water (ocean, pond, blocking, placeable) | IMPLEMENTED BUT UNVERIFIED | oceanCoastX / oceanAt in isoWorld.ts; blue-squares bug confirmed in code (1031) |
| G4 | Vegetation (trees, grass, wild detail) | IMPLEMENTED BUT UNVERIFIED | One tree design (TREE_TIERS); grass ±28, flowers/pebbles/wild to ±64 |
| G5 | Architecture & houses (7 variants, roofs, interiors) | IMPLEMENTED BUT UNVERIFIED | HOUSE_VARIANTS 7 entries; enterable interiors; roof variety is colour/axis only |
| G7 | NPCs in 3D (47, schedules, A*) | IMPLEMENTED BUT UNVERIFIED | ROSTER_3D 47 NPCs; scheduleTileFor reuses 2D schedules; planPathNpc A* |
| G8 | NPC-vs-monster combat in 3D | NOT IMPLEMENTED | Zero bounty/crime hits in engine3d/; wolves target player only |
| G9 | Animals (birds/goats/deer/wolves/chickens) | IMPLEMENTED BUT UNVERIFIED | animals.ts, caps 5/3/3/2/5, keep-out 72, session-only |
| G10 | Player combat in 3D | PARTIALLY IMPLEMENTED | Melee vs wolves/NPCs + lootable bodies exist; no bounty/crime, XP, or ranged combat |
| G11 | Quests in 3D | NOT IMPLEMENTED | quests.ts exists (2D only); zero quest wiring in engine3d/ |
| G12 | Economy / shops in 3D | NOT IMPLEMENTED | Inn/store/smith are visual shells; gold only from looting dead NPCs |
| G13 | Dungeons in 3D (Ember Vault, Stone Soup) | NOT IMPLEMENTED | dungeonVaults.ts / stoneSoupEngine.ts exist (2D only); zero dungeon hits in engine3d/ |
| G14 | Skills / XP in 3D | NOT IMPLEMENTED | skills.ts exists (2D only); 3D gathering gives resources, no XP |
| G15 | AI adventurers in 3D | PARTIALLY IMPLEMENTED | transients.ts walkers exist; full sim (delves/loot/coins) is 2D-only |
| G16 | Save / persistence (3D keys) | IMPLEMENTED BUT UNVERIFIED | iso-world-v2 versioned+migrated; ag-3d-* keys have NO versioning |
| G17 | Minimap in 3D | NOT IMPLEMENTED | Zero minimap hits in engine3d/; circular minimap is 2D-only despite standing request |
| G18 | HUD / Build menu / undo-redo / sprint | PARTIALLY IMPLEMENTED | Build menu + undo/redo + sprint exist; minimap absent (see G17) |
| G19 | Audio in 3D | NOT IMPLEMENTED | Zero audio hits in engine3d/; audio.ts is 2D-only |
| G20 | Performance (device baseline) | IMPLEMENTED BUT UNVERIFIED | Only SwiftShader harness numbers exist; real-phone FPS unknown |
| D1 | Live development dashboard (artifact) | IMPLEMENTED BUT UNVERIFIED | Artifact exists per records (verified 2026-11-07 ~14:16); hard-coded data; not inspected by this audit |
| D2 | §54 dashboard data in repo (studio/dashboard/) | PARTIALLY IMPLEMENTED | Working copies in ~/workspace/studio/dashboard/ (valid JSON); not in repo; nothing reads them |
| D3 | Build ledger / verification history | PARTIALLY IMPLEMENTED | 110 verify*/ dirs, 1016–1029 evidenced; 1016–1025 carry midnight-placeholder dates, no run IDs |
| D4 | Quality gates L1–L4 | PARTIALLY IMPLEMENTED | Real gate records exist only for 1030; 1016–1029 Level-4 claims are backfilled, unevidenced |
| D5 | Autonomous dev engine (§49/§50 RUN, backlog, Teams A–F) | PARTIALLY IMPLEMENTED | Oct-era scripts exist but stale (last session 2026-10-12); live queue lives only in dashboard JSON + MEMORY.md |
| D6 | Code evolution machine ACEE (§56) | PARTIALLY IMPLEMENTED | Docs in studio/acee/ (10 files, 116,568 B) + Development Genome index in studio/genome/ (scanner + query + genome.json, 440 files / 4,810 symbols / 782 edges, answers queries); Phases 2–7 not started; the machine itself is not built in code |
| D7 | ENGINE_BIBLE / SYSTEM_MAP / PROJECT_STATE / NEXT_TASK / TEST_STATUS | IMPLEMENTED BUT UNVERIFIED | All 14 files exist in studio/ (+ autonomous-engine/ 3 files), parent-verified against the tree 2026-11-07; not live-verified |
| D8 | Game evolution engine AGEE (§58) | DOCUMENTED ONLY | Directive text only; one hit in CONTINUE_ASHFALL.md future-work list |
| D9 | Self-evolution files (§59) | IMPLEMENTED BUT UNVERIFIED | Three files exist as working copies in ~/workspace/studio/; not in repo |
| D10 | This registry (§55 Stage A) | PARTIALLY IMPLEMENTED | This file (v1.0 draft); reconciliation with legacy audit + repo landing pending |
| D11 | Automated testing infrastructure | PARTIALLY IMPLEMENTED | simulate.ts + asserts + probes + CI all real; 684 crash + env blocks limit it |
| D12 | GitHub integration (repo + Pages deploy) | COMPLETE AND VERIFIED | HEAD 14491c9f; deploy pipeline works (incl. two recorded deploy-job failures recovered by re-trigger) |
| R1 | §47 Update speed / efficiency | PARTIALLY IMPLEMENTED | Rule in force as process; no speed measurement vs baseline |
| R2 | §48 3D game master directive | PARTIALLY IMPLEMENTED | Direction adopted; acceptance criteria (§48.16) not demonstrated |
| R3 | §49 Autonomous development directive | DOCUMENTED ONLY | Directive in place; RUN has never been said; no registry/loop |
| R4 | §50 Autonomous evolution directive | PARTIALLY IMPLEMENTED | Dashboard live; 10-min cycle and gate automation do not exist |
| R5 | §51 Ultimate engineering architecture | DOCUMENTED ONLY | Directive truncated mid-sentence as received; no engine split exists |
| R6 | §52 God-tier engineering / legacy cleanup | PARTIALLY IMPLEMENTED | Audit delivered 2026-11-07 ~15:00 (LEGACY_AUDIT.md); no file removed yet |
| R7 | §53 Autonomous god-tier directive | DOCUMENTED ONLY | Governor, ENGINE_BIBLE, Evolution Ledger now exist as docs in studio/autonomous-engine/ (2026-11-07); the engine itself is not built in code |
| R8 | §54 Dashboard repair & automation | PARTIALLY IMPLEMENTED | Working copies exist (see D2); not in repo; artifact not wired |
| R9 | §55 Master integration directive | PARTIALLY IMPLEMENTED | Stage A in progress (this registry); Stages A–F not executed |
| R10 | §56 ACEE directive | DOCUMENTED ONLY | See D6 |
| R11 | §57 Next evolution layer | DOCUMENTED ONLY | Orchestrator, verification intelligence, benchmarking lab, health score now exist as docs in studio/orchestrator/ (15 files, 2026-11-07); none runs yet |
| R12 | §58 AGEE directive | DOCUMENTED ONLY | See D8 |
| R13 | §59 Muse self-evolution engine | PARTIALLY IMPLEMENTED | Three files exist (see D9); MEMORY CORE / watchdog / modes unverified |
| Q0 | Ashfall Stage 1 audit | COMPLETE AND VERIFIED | ASHFALL-STAGE1.md (660 lines); headless + phone probe, 0 page errors |
| Q1 | BUILD 1030 tap-to-walk pathfinding | COMPLETE AND VERIFIED | Commit 9dc4cdf7, deploy run 42428294182 success, served version.json 1030 @ 2026-11-08T00:08:20.684Z, phone probe PASS 0 page errors |
| Q2 | BUILD 1031 blue squares (wild-lake far cells) | NOT IMPLEMENTED | Queued after 1030; cause confirmed by code |
| Q3 | BUILD 1032 interior invisible walls | NOT IMPLEMENTED | Queued after 1031; missing-wall cause confirmed by code |
| Q4 | Ashfall Stage 2 terrain | NOT IMPLEMENTED | Queued after 1032; HIGH risk; re-baseline required |
| Q5 | Ashfall Stage 3 vegetation | NOT IMPLEMENTED | Queued after Stage 2 |
| Q6 | Ashfall Stage 4 architecture | NOT IMPLEMENTED | Queued after Stage 3 |
| Q7 | Ashfall Stage 5 settlements | NOT IMPLEMENTED | Queued after Stage 4; 0-stall cause unverified |
| Q8 | Ashfall Stage 6 atmosphere | NOT IMPLEMENTED | Queued after Stage 5 |
| S1 | Stone house replacement (3D) | BLOCKED | FBX package never arrived; only a README in public/sprites/3d-house-sprites/ |
| S2 | 684 sim crash | BLOCKED | assetMetaFor null for 5 variants; ~1,000 sim lines unverified; awaiting user word |
| S3 | Project Zomboid files disposition | NOT IMPLEMENTED | Awaiting user word; no decision record found |
| S4 | Syrinscape installer disposition | NOT IMPLEMENTED | Awaiting user word; no decision record found |
| S5 | Dungeon loot transfer | NOT IMPLEMENTED | Awaiting user word; Stone Soup is separate by design |
| S6 | Town-invasion raid variant | NOT IMPLEMENTED | Not built by decision; raids stay at town edge pending approval |
| S7 | 983 house-setback layout change | NOT IMPLEMENTED | User's call, NOT authorized; no spec found |
| S8 | Even-width hut door-draw offset | NOT IMPLEMENTED | 0.5-tile offset measured; fix offered, no answer |
| S9 | Options button covering smith Leave button | NOT IMPLEMENTED | Observed 1010; untouched, out of scope so far |
| S10 | Inn / store / smith mechanics | NOT IMPLEMENTED | Deferred by explicit user order ("code mechanics later") |
| S11 | Chicken swarm / eggs | NOT IMPLEMENTED | Separate order required; 1016 shipped ambient-only chickens |
| S12 | Longer post-tired sprint bursts | NOT IMPLEMENTED | Numbers decision record not located in sources searched |
| S13 | Moving the road crates (102,120)/(100,122)/(102,141) | NOT IMPLEMENTED | Deliberately not moved; code fixes routed around them |
| S14 | Build panel scroll — physical-iPhone confirmation | IMPLEMENTED BUT UNVERIFIED | Headless only as far as established; iPhone check is the open caveat |
| S15 | Timer-side stale-path guard (999 follow-up) | NOT IMPLEMENTED | Follow-up spec not located; 999 itself is live-verified |
| S16 | Seamless horizon rework | NOT IMPLEMENTED | Screen-space sky gradient is the standing limit; direction-based sky out of scope so far |
| S17 | Grass wind sway | NOT IMPLEMENTED | No sway term found; never ordered |
| S18 | Placement costs | NOT IMPLEMENTED | Palette is FREE by the 984 rule; costs are a deferred decision |
| S19 | Full 2.5D NPC sim in 3D | NOT IMPLEMENTED | NPC systems exist; full-sim-in-3D claim not evidenced |
| S20 | Swimming / fishing / boats | NOT IMPLEMENTED | None exist in 2D or 3D; explicitly pending, do not invent |
| S21 | BUILD 707 (NPC smoothing / village chop) | IMPLEMENTED BUT UNVERIFIED | Announced 2026-10-15; play link truncated; never confirmed |
| S22 | 945 iso tree anchor gap + Rodwan tree paint | IMPLEMENTED BUT UNVERIFIED | Announced; anchor gap unchanged, 2D paint unproven |
| S23 | Tree visual/collision misalignment (non-starting chunks) | NOT IMPLEMENTED | Offered to fix 2026-09-30; awaiting user decision |
| S24 | Zoom-out black screen | NOT IMPLEMENTED | Reported 2026-10-12, unresolved; BUILD 608 path is a separate report |
| S25 | Roads behind houses after BUILD 690 | IMPLEMENTED BUT UNVERIFIED | Attributed to stale cached art; awaiting user confirmation after fresh load |
| S26 | Legacy codebase audit (§52 FINAL COMMAND) | COMPLETE AND VERIFIED | Audit DONE 2026-11-07 ~15:00 (LEGACY_AUDIT.md, 230 lines); A47/B104/C56/D41+2 assets/E |
| T1 | Standing rule: skills earn XP only from real actions | PARTIALLY IMPLEMENTED | Mining/chopping actions exist; XP wiring + UI + save/load not evidenced complete |
| T2 | Standing rule: everything added goes in Build menus | PARTIALLY IMPLEMENTED | Followed since 1025 (Rock/Water/Wall); palette-gap audit re-run per build |
| T3 | Standing rule: doors and paths must line up | PARTIALLY IMPLEMENTED | Quality bar in force; even-width door offset (S8) is a live violation |
| T4 | Standing rule: never ship guess-builds | PARTIALLY IMPLEMENTED | Process rule; followed in 1018/1020/1021/1026/1030 traces |
| T5 | Standing rule: no traditional RPG level scaling | DOCUMENTED ONLY | Rule only; danger zones exist via monster regions |
| T6 | Standing rule: play link with every finished build | COMPLETE AND VERIFIED | Every landed build report in the dated logs carries the play link |
| E1 | Environment: git cannot write (EPERM) | BLOCKED | git opens temp objects mode 0444, write() returns EPERM (strace-proven); blocks all landings |
| E2 | Environment: Chromium will not launch (SIGTRAP) | BLOCKED | SIGTRAP ~100ms after launch, 8 variants tried; blocks phone probes (L3 gate) |
| E3 | Environment: local vite build impossible | BLOCKED | ~766-call copy_file_range budget then EPERM on 31,507-file public/; GitHub Actions unaffected |

---

# Game systems

## G1 — 3D world rendering
- **(1) Intended purpose:** A vertex-colour triangle WebGL renderer for the 3D world: unlimited view distance, continuous ground to the horizon, day/night lighting, sun/moon/clouds.
- **(2) Current implementation:** `src/game/engine3d/Engine3DWorldView.tsx` (3,072 lines; `buildWorldVertices()` ~L393, `WORLD_FOV_DEG=66`, `FOG_NEAR=300` / `FOG_FAR=600`, `WORLD_REBUILD_DIST=16`, `VIEW_FAR_PLANE=700` in `townLook.ts:151`); `sky.ts` (`emitSkyObjects`, `nightFactorForMinutes`); `townLook.ts` (palettes, `groundTintDelta`, band constants: band 64/4-tile, far 240/16-tile, horizon 600/64-tile, apron 1000); `Engine3DView.tsx` (frame loop), `GraphicsModeHost.tsx` (mode switching). Fog is baked per-vertex, not shader; day/night is a `uNight` fragment uniform reusing `dayNight.ts:darknessAlphaForMinutes` (day 07:00–18:00, night cap 0.55). Sun/moon/clouds at 620 tiles, camera-centred. Figures are never fogged.
- **(3) Dependencies:** `src/game/iso/isoWorld.ts` (world data), `dayNight.ts`, `villagers.ts` / `npcMotion.ts` (figures).
- **(4) What remains unfinished:** Real-phone FPS/visual confirmation; sky suppressed inside houses is a known gap (`sky.ts` header).
- **(5) Responsible files/modules:** `Engine3DWorldView.tsx`, `townLook.ts`, `sky.ts`, `Engine3DView.tsx`, `GraphicsModeHost.tsx`.
- **(6) How it will be tested:** Harness probes cited in comments (BUILD 1002/1007/1024); `Diagnostics3D` reports verts/map/position only; phone probe at the current build marker.
- **(7) Completion:** Live phone probe with no sky holes, no mesa edge, no z-fighting at 240+ tiles.

## G2 — Terrain: heightfield / shores / stone
- **(1) Intended purpose:** Ground that is not flat: gentle rolling hills (visual-only, walkability unchanged per Stage 2 plan), a sand shore band where the ocean meets land, and stone terrain actually used somewhere.
- **(2) Current implementation:** `src/game/iso/isoWorld.ts:6` `Terrain = 'grass'|'dirt'|'sand'|'stone'|'water'`; `terrainAt()` L138; `townLook.ts:393+` `groundNoise`, `:406+` `groundTintDelta` (continuous per-corner field, BUILD 1009); `wildTerrain.ts` (out-of-map fallback); `Engine3DWorldView.tsx:438+` per-corner tint quads, ground layers at y −0.02/−0.05/−0.08/−0.11. Ground tint is complete. **Heightfield: NOT IMPLEMENTED — ground is FLAT** (no height function anywhere in `engine3d`; `elevation.ts` exists in legacy `src/game/` but is not used by the 3D renderer; all ground quads sit at ~0 with only layer-separation offsets). **Shores/beaches: NOT IMPLEMENTED** — no `shore` terrain in the 3D type (the `shore` colour in `App.tsx:196` is 2D-only); the ocean is a hard `oceanAt` cutoff with no sand band. **Stone terrain: DOCUMENTED ONLY in 3D** — `stone` is a defined type + colour, but `defaultWorld()` stamps only sand plaza, dirt roads, and a water pond; no stone region exists in the 3D default world.
- **(3) Dependencies:** Ground emission in `Engine3DWorldView.tsx`, every object's base y, far rings, picker (Stage 2 risk flag).
- **(4) What remains unfinished:** Heightfield, beach band along `oceanCoastX`, stone-terrain regions — all unbuilt (Ashfall Stage 2).
- **(5) Responsible files/modules:** `isoWorld.ts`, `townLook.ts`, `wildTerrain.ts`, `Engine3DWorldView.tsx`.
- **(6) How it will be tested:** Harness-prototype the base-y agreement first (Stage 2 risk mitigation); then phone probe comparing near/far ground.
- **(7) Completion:** A height function wired into ground verts, walkability, and NPC/player pathing, plus a visible shore; fallback (tint+shores+stone only) if the heightfield proves unsafe.

## G3 — Water (ocean, pond, blocking, placeable)
- **(1) Intended purpose:** A real ocean west of town and a pond, both blocking movement, placeable/removable in Build mode, rendering correctly at all distances.
- **(2) Current implementation:** `src/game/iso/isoWorld.ts:218` `oceanCoastX(y)` (smooth 1D noise, coast x≈6–18, wavy), `:230` `oceanAt(x,y)` (pure, infinite west); `defaultWorld()` pond at (119–123, 81–85); `terrainAt()` water blocks via `isWalkableWorld()` L158; `placements.ts:192+` `removeGeneratedWaterAt`, `:340` water removal/undo; `Engine3DWorldView.tsx:463+` placed water, `:1315` Build palette `water`, `COLORS.water [0.12,0.36,0.57]`. **Blue-squares bug confirmed in code:** `quadCellMixed()` (`Engine3DWorldView.tsx:568–600`) clips the mixed-terrain scan to the cell ∩ map rectangle, so far cells entirely outside the map skip the scan and centre-sample `effTerrain`; a centre tile that is a wild lake makes the whole 16/64-tile cell render as one blue quad. The comment at L~580 states it explicitly: "Wild lakes stay centre-sampled at distance (the 1024 accepted limit…)". The ocean got an analytic coast-subdivision fix in 1027; lakes did not. `wildLakeAt` = `groundNoise(x,y,32) > 0.90`, 1.76% water (`wildTerrain.ts:61`).
- **(3) Dependencies:** `isoWorld.ts`, `placements.ts`, `wildTerrain.ts`, far-cell emission in the view.
- **(4) What remains unfinished:** Subdivide wild-lake cells at distance like the 1008 dirt / 1027 ocean fix (queued BUILD 1031). No swimming, fishing, or boats (stated in the App build note 1027; see S20).
- **(5) Responsible files/modules:** `isoWorld.ts`, `wildTerrain.ts`, `placements.ts`, `Engine3DWorldView.tsx`.
- **(6) How it will be tested:** Phone probe walking toward a distant lake with screenshots at multiple distances (1031 gates).
- **(7) Completion:** Far lake renders as its actual tiles, not a whole-cell quad; near/far agree; water still blocks.

## G4 — Vegetation (trees, grass, wild detail)
- **(1) Intended purpose:** Trees, grass tufts, flowers/pebbles/wild trees/rocks populating the town and the wild out to stated radii, chop/mine-able where appropriate.
- **(2) Current implementation:** `townLook.ts:84` `TREE_TIERS` (single 4-tier design: trunk + 3 foliage tiers, total height 4.44) — **one tree design**; `grassTufts.ts` (`emitNaturalGrass`, `emitPlacedGrass`, `tuftParamsForTile`); `groundDetail3d.ts:48` `wildflowerForTile`, `:59` `pebbleForTile`, `:103` `emitGroundDetail3d`; `wildTerrain.ts` scatter (`hash2(x,y,7)`, tree <0.006, rock 0.006–0.008); `isoWorld.ts:defaultWorld()` stored trees/rocks + scatter. Grass tufts to ±28 tiles, flowers/pebbles/wild trees/rocks to ±64 (`Engine3DWorldView.tsx:360–386`); wild trees/rocks chop/mine-able and stay gone via `removedWildTrees`/`removedWildRocks`.
- **(3) Dependencies:** `townLook.ts`, `wildTerrain.ts`, world buffer emission.
- **(4) What remains unfinished:** Tree variety (only one design); no other vegetation kinds. (Ashfall Stage 3.)
- **(5) Responsible files/modules:** `townLook.ts`, `grassTufts.ts`, `groundDetail3d.ts`, `wildTerrain.ts`, `isoWorld.ts`.
- **(6) How it will be tested:** Live check that grass/flowers/pebbles populate to their stated radii with no popping worse than ~13px at the edge; FPS re-measured after any density change.
- **(7) Completion:** 3 tree shapes, bushes (non-blocking), crates/stalls no longer rendering as trees, grass density re-tested vs FPS (Stage 3 plan).

## G5 — Architecture & houses (7 variants, roofs, interiors)
- **(1) Intended purpose:** Distinct house designs, roof variety, enterable interiors with furniture, chimney smoke and staggered evening lights.
- **(2) Current implementation:** `townLook.ts:233` `HOUSE_VARIANTS` — **7 variants, not 4**: cottage 4×3/2-storey, tall 3×3/3, shop 6×4 open-front, grand 6×5/3, plus inn 6×5/3, smith 5×4, store 5×4 open-front (`:247` `HOUSE_VARIANT_IDS`); `ROOFS` 5 colours (`:44`), `roofRise`/`roofPitchDeg` (`:171`); `houseDesignFor`/`houseDesignForVariant` (seeded stone/plaster/timber/roof/chimney); `interiors.ts` (`hutDoor`, `hutExitPoint`, `nearestDoorHut`, `interiorBoxes` seeded furniture bed/table/chair/counter/shelf/hearth/rug, `interiorWalkable`, `rescuePosition`, `INTERIOR_FLOOR_Y=0.05`); `houseFx.ts` (chimney smoke `smokePuffsFor`, lit windows `houseLitAt`, staggered light schedules); `fbxHouseModels.ts` (external house-model loader — exports seen, usage in the 3D view **not verified** in this audit). Houses render with roof/stone/plaster variety; Enter/Exit via button or E key (`Engine3DWorldView.tsx:2956–2957`); interiors are session-only with load rescue to the exit point.
- **(3) Dependencies:** `townLook.ts`, `interiors.ts`, `placements.ts` (house footprints), save/load.
- **(4) What remains unfinished:** Interior invisible walls are MISSING — see Q3 (queued BUILD 1032). Roof variety is colour/axis only (no distinct roof shapes verified); all 26 town huts have `roofAxis='x'` (zero roofline variation). Inn/store/smith have no mechanics (see S10).
- **(5) Responsible files/modules:** `townLook.ts`, `interiors.ts`, `houseFx.ts`, `Engine3DWorldView.tsx`, `fbxHouseModels.ts`.
- **(6) How it will be tested:** Phone probe: enter each variant, check furniture/door/exit; roof-variety visual check (Stage 4).
- **(7) Completion:** Roof variety (axis/pitch/parapet), gardens/fences, interior ceilings + hearth glow (Stage 4 plan); player cannot leave except via Exit (Q3).

## G7 — NPCs in 3D (roster, schedules, movement)
- **(1) Intended purpose:** Mosslight residents with homes, jobs, schedules, and visible walking (no teleporting) in the 3D world.
- **(2) Current implementation:** `townsfolk3d.ts:74` `ROSTER_3D` — **47 NPCs confirmed by count** (13 original + 25 BUILD 699 + 4 teachers BUILD 958 + 5 children BUILD 979: Tansy, Milo, Nia, Joss, Tove); `scheduleTileFor()` L523 reuses the real 2D schedule (`townsfolkTarget` with synthetic clock/NPC, seed 4242); `planPathNpc()` L276 (tile A*, Manhattan heuristic, max 4000 nodes, `pathHasUnwalkableTile`, `sidestepTile` — 1030 additions); `npcWalkable()` L239; `buildAnchors()` home doorsteps/plaza/stalls; `npcMotion.ts` (render glide `advanceRenderPos`, yaw, phase, `BLOCKED_TICKS_TO_REPLAN=3`); `villagers.ts` (procedural blocky figures, children 0.7×, `NPC_SPEED=1/0.9` tiles/s); 900ms logical tick in `Engine3DWorldView.tsx`. Deliberate limits stated in `townsfolk3d.ts:1–60`: no dialogue, economy, needs, memories/relationships, combat, or quests in the 3D NPC module; indoors phases render as standing at the home doorstep (NPCs never enter houses); no bank point (Brand stays at his stall).
- **(3) Dependencies:** 2D schedule system (`townsfolkTarget`), `npcNavigation` A*, `npcMotion.ts`, `villagers.ts`.
- **(4) What remains unfinished:** Dialogue, needs/relationships, NPC-vs-creature combat (see G8), NPCs entering buildings.
- **(5) Responsible files/modules:** `townsfolk3d.ts`, `npcMotion.ts`, `villagers.ts`, `Engine3DWorldView.tsx`.
- **(6) How it will be tested:** Standalone asserts cited in the module header (roster mirror vs `createTownsfolk`); live observation of scheduled movement over a full day cycle.
- **(7) Completion:** Scheduled movement observed live over a full day; NPCs visibly walk, enter/exit doors, and perform jobs without teleporting.

## G8 — NPC-vs-monster combat in 3D
- **(1) Intended purpose:** Creatures engage NPCs; guards witness; NPCs fight back; creature kills drop lootable bodies (per BUILDS 915–920 in 2D).
- **(2) Current implementation:** None in 3D. Wolves target the player only (`animals.ts` wolf states use player position; `biteDamage` is dealt to the player in `Engine3DWorldView.tsx:2810+`). No NPC-vs-wolf code, no guard witness radius, no NPC fight-back exists in `engine3d`. The 915–920 systems live in the 2D game only — zero `bounty`/`crime` hits in `engine3d/`.
- **(3) Dependencies:** `animals.ts` wolf AI, `townsfolk3d.ts` NPC state, combat resolution (G10), crime/bounty system (2D-only `bounty.ts`/`crime.ts`).
- **(4) What remains unfinished:** Everything in 3D.
- **(5) Responsible files/modules:** `animals.ts`, `townsfolk3d.ts`, `Engine3DWorldView.tsx`.
- **(6) How it will be tested:** Live wolf-vs-NPC encounter behaving per spec (if ordered).
- **(7) Completion:** A wolf-vs-NPC encounter observed live with fight-back, witness, and lootable body per the 915–920 rules — or an explicit decision that 3D stays player-only combat.

## G9 — Animals (birds, goats, deer, wolves, chickens)
- **(1) Intended purpose:** Ambient wildlife with believable behaviour: birds flush, goats shy, deer flee, wolves hunt, chickens roam town; wild animals kept out of town.
- **(2) Current implementation:** `animals.ts` (1,225 lines): caps birds 5 / goats 3 / deer 3 / wolves 2 / chickens 5 (`MAX_ANIMALS=18`, L118–124); `ANIMAL_TOWN_KEEP_OUT=72` (L105), spawn 74–120, wolves 88–135 (L110–111); `spawnAnimal()` L398, `stepAnimal()` L633 (900ms tick, A* via `planPathNpc`, bird flush radius 5, goat shy 2, deer flee 6, chicken scuttle 2, wolf approach 10 / give-up 16, `WOLF_HP=50`, `WOLF_BITE=6`); `emitAnimal()`; header documents session-only saves.
- **(3) Dependencies:** `planPathNpc`, world walkability, player position.
- **(4) What remains unfinished:** No eggs, taming, herding, or loot from animals (dead wolf just vanishes with "Wolf slain"). See S11.
- **(5) Responsible files/modules:** `animals.ts`, `townsfolk3d.ts` (A* reuse).
- **(6) How it will be tested:** Live check that no wild animal enters 72 tiles of the plaza and wolves hunt only outside it.
- **(7) Completion:** Live check passes; animal behaviours match the stated radii/caps.

## G10 — Player combat in 3D
- **(1) Intended purpose:** Player melee combat against creatures and NPCs, with consequences and loot.
- **(2) Current implementation:** `Engine3DWorldView.tsx:2440+` F/Space attack — nearest wolf ≤1 tile takes 25 (HP 50, no strike-back; bites on its own 900ms tick for 6), else nearest living NPC ≤1 tile takes 25 (HP 100, scripted strike-back −5, dies at 0, "Press E beside them to loot"); E on a dead NPC loots +5 gold + 1 keepsake and marks `looted` (persisted in `ag-3d-npcs-v1`); corpses rendered (`:2430` `corpse()`); player HP 100 in `ag-3d-health-v1`, 0 = "exhausted, restored to 100" (no death screen).
- **(3) Dependencies:** `animals.ts` (wolf HP), `townsfolk3d.ts` (NPC HP), inventory/gold.
- **(4) What remains unfinished:** Bounty/crime consequences for killing residents (NOT IMPLEMENTED in 3D); wolf loot; any creature variety beyond the 5 ambient kinds; no XP; no ranged/bow combat.
- **(5) Responsible files/modules:** `Engine3DWorldView.tsx`, `animals.ts`, `townsfolk3d.ts`.
- **(6) How it will be tested:** Phone probe: kill a wolf, kill an NPC, loot the body, verify HP persistence across reload.
- **(7) Completion:** A defined crime response for killing a resident, or an explicit decision that 3D stays consequence-free; wolf loot defined.

## G11 — Quests in 3D
- **(1) Intended purpose:** Quests with givers, objectives, tracker, and rewards, reachable and completable in the 3D world.
- **(2) Current implementation:** None in 3D. `grep quest` over `engine3d/` returns only comments stating "no quests" (`townsfolk3d.ts:5`, `wildTerrain.ts:41`, `animals.ts:19`). The full legacy system exists unused by 3D: `quests.ts` (663 lines: `QUESTS`, `questById`, `startQuest`, `advanceQuestStage`, `questRewards`, `serializeQuestSave`/`parseQuestSave`, story quest `ashes-of-aldoria`).
- **(3) Dependencies:** `quests.ts`, NPC dialogue (missing in 3D), quest UI/markers (missing).
- **(4) What remains unfinished:** Everything in 3D — wiring, givers, tracker, rewards.
- **(5) Responsible files/modules:** `src/game/quests.ts` (legacy), `Engine3DWorldView.tsx` (wiring point).
- **(6) How it will be tested:** Accept, progress, and complete at least one quest in 3D with the reward landing.
- **(7) Completion:** At least one quest giver, tracker, and completable objective reachable in 3D.

## G12 — Economy / shops in 3D
- **(1) Intended purpose:** Trading at the store/blacksmith/inn, gold with real sources and sinks, a living settlement economy.
- **(2) Current implementation:** None in 3D. Inn/store/blacksmith are `HOUSE_VARIANTS` entries only (visual: inn sign, smith wide chimney, store awning/crates — `townLook.ts:238–245`, `Engine3DWorldView.tsx:909–940`). Gold is a bare inventory counter (`inventory.gold`, HUD line L2906 "Wood · Stone · Gold"); the only gold source in 3D is looting a dead NPC (+5). Zero `shops`/`settlementEconomy`/`bankBalance` references in `engine3d/`; `shops.ts`, `settlementEconomy.ts`, `playerBank.ts` are 2D-only.
- **(3) Dependencies:** `shops.ts` / `settlementEconomy.ts` (2D), NPC shopkeepers, inventory.
- **(4) What remains unfinished:** Everything in 3D; inn/store/smith mechanics deferred by explicit user order (see S10).
- **(5) Responsible files/modules:** `src/game/shops.ts`, `settlementEconomy.ts` (legacy), `townLook.ts`, `Engine3DWorldView.tsx`.
- **(6) How it will be tested:** Buy/sell interaction at the store/smith/inn with gold changing correctly, verified live.
- **(7) Completion:** A working buy/sell interaction at the store/smith/inn, or an explicit shells-only decision by the user.

## G13 — Dungeons in 3D (Ember Vault, Stone Soup)
- **(1) Intended purpose:** Dungeons/discovery in 3D, reusing the existing Ember Vault (which must not be discarded, §48.8) and the Stone Soup mini-game.
- **(2) Current implementation:** None in 3D. Zero `dungeon`/`cave` hits in `engine3d/` except a `transients.ts` comment that dungeon interiors are abstract. Legacy 2D only: `dungeonVaults.ts` (Ember Vault content, "Ember Hoard"), `dungeonLayouts.ts` (31×19 Ember Vault grid), `dungeonUniques.ts`, `dungeonShops.ts`, `stoneSoupEngine.ts` (1,206 lines) + `StoneSoupDungeon.tsx`, mounted only in `App.tsx:18235` when `dungeonOpen`.
- **(3) Dependencies:** `dungeonVaults.ts`, `dungeonLayouts.ts`, `stoneSoupEngine.ts`, a 3D entrance/transition.
- **(4) What remains unfinished:** Everything in 3D — entrance, transition, interior, loot wiring (see S5 for the loot-transfer decision).
- **(5) Responsible files/modules:** `src/game/dungeonVaults.ts`, `dungeonLayouts.ts`, `stoneSoupEngine.ts`, `StoneSoupDungeon.tsx`.
- **(6) How it will be tested:** Enter a dungeon from the 3D world, complete it, exit to the correct exterior point, loot persists.
- **(7) Completion:** A dungeon entrance reachable and enterable from the 3D world.

## G14 — Skills / XP in 3D
- **(1) Intended purpose:** Skills earn XP only from real successful actions, level up, appear in the UI, survive save/load, and interact with the world (mine real ore, chop persistent trees, fish in real water; gathered resources feed crafting). Never award XP for clicks/menu opens; never invent a system whose gameplay does not exist.
- **(2) Current implementation:** Legacy data layer exists: `skills.ts` (185 lines: `xpForLevel`/`levelForXp` RuneScape-style curve, `awardXp()`, `WOODCUTTING_XP_PER_TREE=25`, `SKILL_MASTERS` with 1.5× bonus "only multiplies XP from real successful actions — never grants free XP"); `skillTracks.ts` (159 lines). **Zero `awardXp`/`skill` references in `engine3d/`.** In 3D, E on a tree gives +2 wood, on a rock +1 stone, on a crate +1 wood (`Engine3DWorldView.tsx:2479–2497`, incl. wild trees/rocks) — resources only, **no XP awarded**. No fishing found anywhere in `engine3d/` (no water interaction beyond blocking/placement).
- **(3) Dependencies:** `skills.ts`, `skillTracks.ts`, gathering actions, save/load, UI.
- **(4) What remains unfinished:** XP wiring, level display, persistence — explicitly pending per the standing directive (see T1).
- **(5) Responsible files/modules:** `src/game/skills.ts`, `skillTracks.ts`, `Engine3DWorldView.tsx`.
- **(6) How it will be tested:** Chop/mine/fish and observe XP awarded, level-up in UI, and persistence across save/load; verify no XP for clicks/menu opens.
- **(7) Completion:** Chop/mine/fish grant XP through `awardXp`, levels appear in the UI, and persist across save/load.

## G15 — AI adventurers in 3D
- **(1) Intended purpose:** Simulated players with identity/race/class/level/equipment/goals/history who spawn, explore, fight, gather, loot, upgrade, level, quest, trade, dungeon, return, form relationships, die, leave, and return later — a defining feature (§48.5).
- **(2) Current implementation:** 3D has `transients.ts` (455 lines): max 5 travellers + 3 adventurers (`MAX_TRANSIENTS=8`), spawn ticks 50/111, road-biased A*, edge-to-edge walks, bark lines (`barkLineFor`, 3s check, 25s global / 90s per-figure cooldowns), despawn at edges, session-only. They are visual walkers with names/classes and bark text — no inventories, dungeon delves, or economy. The full sim lives only in 2D: `simulatedAdventurers.ts` (785 lines: `advanceSimulatedAdventurers`, dungeon runs with 0.60/0.85 success/empty odds, coins 5–25, loot table, exodus march) used by `App.tsx` only — no import in `engine3d/`.
- **(3) Dependencies:** `simulatedAdventurers.ts` (2D), `transients.ts`, dungeon/economy systems (G12/G13).
- **(4) What remains unfinished:** The full AI-adventurer simulation in 3D (delves, loot, coins, exodus, persistence, relationships).
- **(5) Responsible files/modules:** `src/game/engine3d/transients.ts`, `src/game/simulatedAdventurers.ts`.
- **(6) How it will be tested:** Adventurers visibly leaving town, delving, and returning with loot/coins in 3D, over a long session.
- **(7) Completion:** Adventurers visibly leave town, delve, and return with loot/coins in 3D; progress persists.

## G16 — Save / persistence (3D keys)
- **(1) Intended purpose:** Persist player, world, NPCs, clock, inventory, templates, and custom assets across reloads, with versioned saves and migration.
- **(2) Current implementation:** 3D keys in `Engine3DWorldView.tsx:44–47`: `ag-3d-player-v1`, `ag-3d-npcs-v1`, `ag-3d-inventory-v1`, `ag-3d-health-v1`; `townsfolk3d.ts:137` `ag-3d-clock-v1` (`loadClock`/`saveClock`); `templates.ts` `ag-3d-templates-v1`; `customAssets.ts` `ag-3d-custom-assets-v1`; world in `isoWorld.ts:133` `iso-world-v2` with `v:4` and real migration (`loadWorld()` L305–364: v2→v3 look migration, v3→v4 200×200 growth + town recentre, v1 demo crate rescue). Stamina, animals, transients are session-only by design. NPC save keeps hp/alive/position; looted NPCs stay gone (`savedNpcActors()` L296–345).
- **(3) Dependencies:** `isoWorld.ts` world store, `templates.ts`, `customAssets.ts`, localStorage.
- **(4) What remains unfinished:** **The `ag-3d-*` keys have NO versioning** — plain JSON merged over a fallback via `readSaved()` (L51), no schema/version field, no migration path; a format change would silently merge stale fields. Save/load round-trip proof on device is also outstanding.
- **(5) Responsible files/modules:** `Engine3DWorldView.tsx`, `isoWorld.ts`, `townsfolk3d.ts`, `templates.ts`, `customAssets.ts`.
- **(6) How it will be tested:** Save/load round-trip on device; format-bump migration test.
- **(7) Completion:** A versioned save set that survives a format bump without data loss, verified by a reload round-trip.

## G17 — Minimap in 3D
- **(1) Intended purpose:** A circular minimap in a corner of the screen showing the area near the player (user request 2026-10-12).
- **(2) Current implementation:** None in 3D — zero `minimap` hits in `engine3d/`; the circular minimap (`App.tsx:4354+`, `minimapRadar.ts`, `minimapIcons.ts`) is 2D-only.
- **(3) Dependencies:** 2D minimap code (`minimapRadar.ts`, `minimapIcons.ts`), 3D world state (player position, nearby terrain/buildings).
- **(4) What remains unfinished:** Everything in 3D.
- **(5) Responsible files/modules:** `src/game/minimapRadar.ts`, `minimapIcons.ts`, `Engine3DWorldView.tsx` (wiring point).
- **(6) How it will be tested:** Phone probe: minimap visible in 3D, updates as the player moves, shows nearby terrain/buildings/player.
- **(7) Completion:** Minimap visible in 3D showing nearby terrain/buildings/player.

## G18 — HUD / Build menu / undo-redo / sprint
- **(1) Intended purpose:** A clean play screen (HUD strip, Build menu with every addition, undo/redo, working sprint/stamina).
- **(2) Current implementation:** HUD (3D): HP bar + Wood/Stone/Gold counts + Sprint button + stamina state + message line + Enter/Exit buttons (`Engine3DWorldView.tsx:2894–2957`). Build menu: categories Terrain/Buildings/Plants/Props/Custom (`:1315–1324`); kinds `path, grass, water, house-cottage, house-tall, house-shop, house-grand, house-inn, house-smith, house-store, tree, stall, rock, wall` + legacy `house` (old saves only) + custom `.glb` upload (`customAssets.ts`, textures/animation ignored); Move/Remove/Save-area modes; chunk templates (`templates.ts: captureChunk`/`pasteChunk`). Undo/redo: `placements.ts:756+` `createBuildHistory`/`recordBuildChange`/`undoBuildChange`/`redoBuildChange`, stroke entries undo as one unit. Sprint/stamina: `sprint.ts` — walk 3.15 u/s, sprint ×1.6 (5.04), drain 20/s, regen 12/s, exhausted recovers at 25, tap latch 500ms/24px, session-only stamina.
- **(3) Dependencies:** `placements.ts`, `templates.ts`, `customAssets.ts`, `sprint.ts`, `playerStep.ts`.
- **(4) What remains unfinished:** Minimap absent (see G17); live verification of undo/redo across all kinds outstanding; Build panel scroll on a physical iPhone unconfirmed (see S14).
- **(5) Responsible files/modules:** `Engine3DWorldView.tsx`, `placements.ts`, `templates.ts`, `sprint.ts`, `customAssets.ts`.
- **(6) How it will be tested:** Phone probes per build (undo/redo restores every palette kind exactly; sprint latch/exhaust/rearm behaviour).
- **(7) Completion:** Minimap visible in 3D (G17) plus a probe proving undo/redo restores every palette kind exactly.

## G19 — Audio in 3D
- **(1) Intended purpose:** Sound/music in 3D (footsteps, combat, ambience, music zones).
- **(2) Current implementation:** None in 3D — zero `audio`/`sound`/`music` hits in `engine3d/`; `animals.ts:80` notes "no sound system" (chickens are silent; barks are text messages only). Legacy 2D system exists: `audio.ts` (310 lines: `attackGruntFor`, `resolveMusicZone`, `musicUrl`/`sfxUrl`, settings load/save).
- **(3) Dependencies:** `src/game/audio.ts`, 3D event hooks (footstep/attack/ambient).
- **(4) What remains unfinished:** Everything in 3D.
- **(5) Responsible files/modules:** `src/game/audio.ts`, `Engine3DWorldView.tsx` (hook points).
- **(6) How it will be tested:** Footstep/attack/ambient sounds audible in 3D on a phone, with mute/settings respected.
- **(7) Completion:** At minimum, footstep/attack/ambient hooks wired to the existing 2D audio layer, or an explicit no-audio decision by the user.

## G20 — Performance (device baseline)
- **(1) Intended purpose:** Know the real frame rate and rebuild cost on the user's phone, with budgets per subsystem.
- **(2) Current implementation:** `Engine3DWorldView.tsx`: world buffer rebuilt when the player moves >16 tiles (`WORLD_REBUILD_DIST`); ~60k verts emitted per rebuild per the 988 comment; buffer sizes cited in comments as ~143,772 verts (L490) / ~186k with grass (L362); grass ±28, far detail ±64; per-frame figure slots re-emit only on pose change (`emitFigureSlot`, L2320+); sky/FX buffers allocated once (`SKY_MAX_VERTS`, `FX_MAX_VERTS`); `Diagnostics3D` exposes verts only. The only numbers in the code are **SwiftShader harness** measurements, not a phone: pristine 1023 = 7.6 fps town / 13.1 wilderness; ±28 grass = 6.8 / 7.5; rebuild hitch ~150–250ms above baseline per rebuild, halved in frequency by the 16-tile distance (BUILD 1026). No live FPS meter exists in the 3D view (the `fps` display in `App.tsx:3709` is the 2D game). Real-phone baseline is **unknown from this audit** — the harness numbers must not be quoted as device performance.
- **(3) Dependencies:** World buffer emission, grass radii, rebuild threshold, device (user's iPhone).
- **(4) What remains unfinished:** Real-device FPS baseline (town + wilderness, walking and sprinting), rebuild-hitch measurement on phone.
- **(5) Responsible files/modules:** `Engine3DWorldView.tsx`, `grassTufts.ts`, `townLook.ts`.
- **(6) How it will be tested:** Measured phone FPS baseline at the current build with the grass radii above, recorded alongside the vert counts.
- **(7) Completion:** A measured phone FPS baseline at the current build, recorded alongside vert counts; budgets set per subsystem.

---

# Development systems

## D1 — Live development dashboard (artifact)
- **(1) Intended purpose:** Single phone-friendly view of the last verified checkpoint, the queue, the build ledger (1016–1032), the Stage 1 audit, the Stage 2–6 plan, quality gates, Teams A–F, and the directives.
- **(2) Current implementation:** Artifact slug `ashfall-development-dashboard`. **This audit could not inspect the artifact directly** — contents below are per project records (`~/MEMORY.md`, `~/workspace/studio/CONTINUE_ASHFALL.md`, `~/workspace/studio/dashboard/dashboard-data.json`), not independently verified. Records state it was built and audit-verified 2026-11-07 ~14:16 PST (no console errors, no broken assets, no phone-width overflow; Verified ledger filter works; Google Fonts blocked only by the audit's egress lockdown). It reportedly shows last verified checkpoint 1029, 1030 in progress, Stage 1 audit, queue, filterable ledger 1016–1032, Stage 1 baseline, Stage 2–6 plan with Stage 2 risk flag, known issues, studio section. The artifact itself is **hard-coded** (as built). The file-driven counterpart exists separately — `~/workspace/studio/dashboard/dashboard-data.json` — but **no wiring exists**: no repo code, fetch, or build step reads it, and the artifact does not reference it.
- **(3) Dependencies:** `dashboard-data.json`, `CONTINUE_ASHFALL.md`, MEMORY.md records.
- **(4) What remains unfinished:** Wire the artifact to read `studio/dashboard/dashboard-data.json` once that directory lands in the repo; re-verify the artifact after wiring; update it at each verified checkpoint (currently stale at 1029 — 1030 not landed).
- **(5) Responsible files/modules:** Artifact `ashfall-development-dashboard` (not in repo); `~/workspace/studio/dashboard/dashboard-data.json`.
- **(6) How it will be tested:** Artifact audit pass after wiring (no console errors, no broken assets, no phone-width overflow; ledger renders from JSON).
- **(7) Completion:** Artifact renders live from the version-controlled JSON with no hard-coded build/commit/verification values.

## D2 — §54 dashboard data in repo (studio/dashboard/)
- **(1) Intended purpose:** Permanent, version-controlled, schema-validated dashboard data + atomic-write memory protection, replacing hard-coded/memory-only state.
- **(2) Current implementation:** **Working copy only, NOT in the repo.** `ls ~/workspace/adventure-game/studio` → no such directory; `grep dashboard-data` across the repo → no hits. Working copy exists at `~/workspace/studio/dashboard/`: `dashboard-data.json` (21,455 B), `dashboard-schema.json` (5,756 B), `README.md` (5,074 B), `MUSE_INSTRUCTIONS.md` (4,533 B), `history/build-ledger.json` (13,174 B, 17 builds), `history/verification-history.json` (2,059 B), `history/development-history.json` (3,802 B), `snapshots/2026-11-07.json` (21,455 B — byte-size-identical to `dashboard-data.json`, i.e. a copy of current state). All four JSON files parse as valid JSON; top-level keys include `activeBuild, buildHistory (17), buildQueue (11), dashboardLinks, developmentDirectives (13, §47–§59), knownIssues (9), lastUpdateTimestamp, lastVerifiedCheckpoint, measuredBaselines (7), qualityGates (4), schemaVersion "1.0", stageProgress (6), teamResponsibilities (6), verificationHistory (4)`. 1030 has `commit: null`; 1031/1032 `planned`.
- **(3) Dependencies:** Git write access restored; BUILD 1030 landing first (per CONTINUE_ASHFALL.md ordering).
- **(4) What remains unfinished:** Copy into `<repo>/studio/dashboard/` + commit/push once git works; wire the artifact to it (D1); 944–1015 backfill; atomic-write/backup/recovery procedure is documented in `MUSE_INSTRUCTIONS.md`, not verified as implemented code.
- **(5) Responsible files/modules:** `~/workspace/studio/dashboard/*` (working copies) → `<repo>/studio/dashboard/`.
- **(6) How it will be tested:** JSON schema validation on every update; dashboard renders from repo JSON (D1); a landing updates ledger/queue/stages/issues with commit hash + gate evidence, no hand edit.
- **(7) Completion:** Files present in the repo at `studio/dashboard/`, artifact reading them, snapshot created per verified checkpoint.

## D3 — Build ledger / verification history
- **(1) Intended purpose:** Per-build evidence trail (asserts, sim diffs, probe screenshots/logs) proving what shipped vs what was only coded.
- **(2) Current implementation:** 110 `~/workspace/verify*/` directories (verify1000–verify1030, verify919-control, verify921–999, verify-animals, etc.). Standard per-build pattern, verified by listing: `assertsNNNN-entry.ts` + `assertsNNNN.mjs`, `probeNNNN-after.mjs`, `sim-NNNN.log` + `sim-NNNN.norm` + `sim-pristineNNNN.log/.norm`, plus `after/` probe screenshots/JSON for recent builds. verify1029: asserts, probe, sim + sim-pristine1028, `after/` with placed-house (inn/smith/store), chunk-saved, pasted, reload screenshots + `probe1029-after.json`. verify1030: `ASHFALL-STAGE1.md` (660 lines), asserts (97 entry + 47 runner checks, per records), sim + sim-pristine1029, `probe1030-after.mjs` (ready, **not run** — Chromium blocked), `probe1030-baseline.mjs` + 5 baseline screenshots in `after/`, `measure1030-*.mjs`. Live-confirmed: 1016–1029 (commits in `git log`, matching hashes in `dashboard-data.json` buildHistory; run IDs recorded for 1024, 1026, 1027, 1028, 1029 — e.g. 1029 run `42416626999`, served version.json 2026-11-07T21:37:14Z). **Caveat found by this audit:** builds 1016–1025 in `dashboard-data.json` carry placeholder `verifiedAt` values (`2026-11-06/07T00:00:00-07:00`, midnight) and `runId: null` (except 1024). Their "verified" status rests on MEMORY.md/ledger narrative, not timestamped run evidence in the JSON. Only 1026–1029 have full verificationHistory entries with run IDs and timestamps.
- **(3) Dependencies:** Git push → GitHub Actions deploy → served version.json check; Playwright/Chromium for phone probes.
- **(4) What remains unfinished:** Commit/push 1030, run `probe1030-after.mjs`, live-verify served version.json build 1030; backfill or explicitly label the 1016–1025 midnight-placeholder verification dates as "requires verification" per §54's own rule.
- **(5) Responsible files/modules:** `~/workspace/verify*/`, `~/workspace/studio/dashboard/history/*`.
- **(6) How it will be tested:** Every ledger entry checked against `git log` + served version.json + probe output.
- **(7) Completion:** Every ledger entry has commit + run ID + timestamped verification result, or is labelled unverified.

## D4 — Quality gates L1–L4
- **(1) Intended purpose:** Four evidence-backed gates per build (L1 IMPLEMENTED / L2 INTEGRATED / L3 VERIFIED / L4 POLISHED); a gate not run is NOT RUN, never silently passing.
- **(2) Current implementation:** Real gate evidence exists **only for BUILD 1030**, in `~/workspace/studio/dashboard/dashboard-data.json` → `qualityGates` (4 records): L1 IMPLEMENTED **PASSED** (tsc clean exit 0; 97 entry + 47 runner asserts; 2026-11-07T15:04-07:00); L2 INTEGRATED **PASSED** (sim vs pristine1029 normalized logs IDENTICAL, 0 FAIL, same known 684 rig crash; 15:07); L3 VERIFIED **NOT RUN** (phone probe blocked — Chromium SIGTRAP; no commit/push); L4 POLISHED **NOT RUN** (depends on L3). This matches the honest §54 format (name, status, timestamp, test/command, result, commit). But `buildHistory` claims `qualityGateLevel: 4` for **all** of 1016–1029 with no per-gate evidence records anywhere (no gate files in `verify*/`, no L1–L4 entries for those builds in the JSON; only the 4 verificationHistory narratives for 1026–1029). Those Level-4 claims are therefore **backfilled assertions, not evidenced gates**.
- **(3) Dependencies:** verify* evidence per build; Chromium/probe for L3; live deploy for L3/L4.
- **(4) What remains unfinished:** Per-build L1–L4 records for future builds (1031+); decide whether to retroactively evidence or downgrade/label the 1016–1029 Level-4 claims.
- **(5) Responsible files/modules:** `~/workspace/studio/dashboard/dashboard-data.json` (`qualityGates`), `~/workspace/verify*/`.
- **(6) How it will be tested:** Each gate record carries timestamp, command, result, and commit; audit the JSON against the verify* evidence.
- **(7) Completion:** Every "verified" build has four gate records with timestamps, commands, and results (or explicit NOT RUN).

## D5 — Autonomous dev engine (§49/§50 RUN, backlog, Teams A–F)
- **(1) Intended purpose:** Self-running OBSERVE→BUILD→TEST→CHECKPOINT loop with a persistent backlog and resume checkpoints; parallel Teams A–F.
- **(2) Current implementation (what actually exists in the repo):** `scripts/autonomous-engine.mjs` (5,738 B, "BUILD 573: Continuous execution with checkpoint/resume") — session controller reading/writing `docs/sessions/current.json`. `scripts/brain.mjs` (BUILD 545, "Unified Development Brain"), `scripts/central-brain.mjs` (BUILD 566/567, coordination layer), `scripts/genome.mjs` (BUILD 571, "Game Genome — Persistent Creative Memory", writes `docs/genome/genome.json`). `docs/AUTONOMOUS_TASK_QUEUE.md`, `docs/TASK_QUEUE.md` ("Authoritative task registry. Stored in Git."), `docs/DISCOVERED_TASKS.md`, `docs/WORKER_STATE.md`, `docs/BRAIN_STATE.json`, `docs/ENGINE_STRUCTURE.md`, `docs/CODE_INDEX.md`. Teams A–F exist **only as data**: `teamResponsibilities` (6 entries) in `dashboard-data.json`, plus the queue listing "Legacy codebase audit" and "Master integration audit" as `in_progress`. No team-agent code, no scheduler, no runner. **The engine scripts are stale:** `docs/sessions/current.json` is from **2026-10-12** (session-1791781531735, sequence 2, startCommit `e210225e`, activeTask null, 4/10 iterations used) — nearly a month old, predating builds 1000–1030 entirely. `docs/genome/genome.json` last modified Oct 12. `AUTONOMOUS_TASK_QUEUE.md` is build-160–170 era (all items checked off, P0 "none open"). `TASK_QUEUE.md` is likewise old-era (TASK-001 combat, BUILD 538). **The live queue (1030 in_progress, 1031, 1032, Stages 2–6) lives only in `dashboard-data.json` + `CONTINUE_ASHFALL.md` + MEMORY.md — not in any repo backlog file.** No 10-minute-cycle runner; no cron/scheduled-job file visible to this audit (cron state is not visible from this session). RUN mode is directive text in SOUL.md §49 (line 2000) and §50 (line 2417), not a runnable entry point found.
- **(3) Dependencies:** Git write (checkpoints must persist), a scheduler, the dashboard data as the backlog source of truth.
- **(4) What remains unfinished:** Reconcile the stale Oct-era engine/docs with the current queue (or mark them superseded); make `dashboard-data.json` (once in-repo) the backlog; implement or explicitly scope the RUN loop and 10-minute checkpoint cadence as runnable code.
- **(5) Responsible files/modules:** `scripts/autonomous-engine.mjs`, `scripts/brain.mjs`, `scripts/central-brain.mjs`, `scripts/genome.mjs`, `docs/*QUEUE*.md`, `~/workspace/studio/dashboard/dashboard-data.json`.
- **(6) How it will be tested:** A RUN invocation resumes from the last checkpoint in-repo, picks the next queued item, and checkpoints after verification — demonstrated, not just described.
- **(7) Completion:** A RUN session lands ≥1 verified build from the registry without a fresh user order per build.

## D6 — Code evolution machine ACEE (§56)
- **(1) Intended purpose:** A SEPARATE engineering subsystem (not a game feature) that builds, repairs, optimizes, and evolves ASHFALL itself: ACEE central intelligence + Development Genome + quantum-inspired computation lab + code sorting/generation machines + 11-role multi-agent lab + evolution-score formula + file/code factory + simulation/validation lab + memory/knowledge engine + experimental sandbox + CODE EVOLUTION LAB dashboard section.
- **(2) Current implementation:** **Docs + genome index (2026-11-07).** `studio/acee/` holds 10 files (116,568 B): README, DEVELOPMENT_GENOME, CODE_EVOLUTION_FORMULA, MULTI_AGENT_LAB, OPTIMIZATION_LAB, CODE_FACTORY, VALIDATION_LAB, MEMORY_ENGINE, CODE_EVOLUTION_LAB, ROADMAP (Phases 1–7). `studio/genome/` holds the Development Genome index: scanner.mjs (656 lines, real TS AST parsing) + genome.json + 8 shards (440 files, 4,810 symbols, 782 resolved import edges, 0 unresolved, 6 cycles; audit MATCH A=45/B=104/C=56/D=41/E=2); query.mjs answers status/file/depends-on/blast-radius/implements/duplicates/cycles/remove/next-task/search; full scan ~3.2s, incremental 104–203ms; one autonomous cycle demonstrated PASS (319ms). The similarly-named `scripts/genome.mjs` / `docs/genome/genome.json` (BUILD 571) is an older "Game Genome" creative-memory store (10 KB JSON, sections dict), **not** the ACEE Development Genome — different purpose, different era, stale since Oct 12 (recorded STALE-UNRELATED in the genome). No CODE EVOLUTION LAB section exists in the dashboard data.
- **(3) Dependencies:** §55 master integration; the dashboard data landing in-repo first.
- **(4) What remains unfinished:** Phases 2–7 per §56 (code generation, multi-agent engineering, optimization lab, self-improvement, dashboard integration, autonomous evolution). Phase 1 is partially done: genome spec + seed + index + scanner + query (the index answers queries); the generation machine itself is not built in code.
- **(5) Responsible files/modules:** `studio/acee/` (docs) + `studio/genome/` (scanner, query, run-cycle, genome.json, shards) + SOUL.md §56 (directive text).
- **(6) How it will be tested:** Genome + generation machine + labs exist as runnable code with test evidence; dashboard has a CODE EVOLUTION LAB section reading real data.
- **(7) Completion:** Phase 1 (intelligence foundation) demonstrably indexing the real repo — DONE 2026-11-07 (genome index + scanner + query, verified by the parent); later phases gated on measured benefit.

## D7 — ENGINE_BIBLE / SYSTEM_MAP / PROJECT_STATE / NEXT_TASK / TEST_STATUS (§55 docs)
- **(1) Intended purpose:** Living, accurate docs describing the actual implementation, system map, project state, next task, and test status — the unified documentation set in GitHub.
- **(2) Current implementation:** **All 14 files exist in the repo's `studio/` (2026-11-07, 126,009 B, parent-verified: byte counts match, pre-existing files untouched, no src//scripts/ file modified):** ENGINE_BIBLE.md (15,769), SYSTEM_MAP.md (16,415), PROJECT_STATE.md (8,837), NEXT_TASK.md (6,466), TEST_STATUS.md (8,479), DEVELOPMENT_ROADMAP.md (11,184), ARCHITECTURE_DECISIONS.md (10,294), DEVELOPMENT_DIRECTIVES.md (8,001), DASHBOARD_DATA.md (1,605), BUILD_LEDGER.md (1,314), VERIFICATION_HISTORY.md (1,267), plus autonomous-engine/ENGINE.md (16,282), GOVERNOR.md (8,662), EVOLUTION_LEDGER.md (11,434). The engine/governor/ledger are SPECIFICATIONS (DOCUMENTED ONLY) — building the engine in code is a separate future task. The dashboard JSON covers PROJECT_STATE/TEST_STATUS as data (not docs).
- **(3) Dependencies:** §55 Stage A (this registry) to define what each doc must contain.
- **(4) What remains unfinished:** Update at each verified checkpoint (registry D7 + CONTINUE_ASHFALL.md); wire the dashboard artifact to read from studio/dashboard/ (Stage B). The docs are written; keeping them current is the remaining work.
- **(5) Responsible files/modules:** `studio/ENGINE_BIBLE.md`, `SYSTEM_MAP.md`, `PROJECT_STATE.md`, `NEXT_TASK.md`, `TEST_STATUS.md`, `DEVELOPMENT_ROADMAP.md`, `ARCHITECTURE_DECISIONS.md`, `DEVELOPMENT_DIRECTIVES.md`, `DASHBOARD_DATA.md`, `BUILD_LEDGER.md`, `VERIFICATION_HISTORY.md`, `studio/autonomous-engine/` (ENGINE.md, GOVERNOR.md, EVOLUTION_LEDGER.md).
- **(6) How it will be tested:** Each doc verified against the actual tree; updated at each verified checkpoint.
- **(7) Completion:** Each doc exists in-repo, is generated or verified against the actual tree, and is updated at each verified checkpoint.

## D8 — Game evolution engine AGEE (§58)
- **(1) Intended purpose:** World content factory, quest generation/validation, NPC personality/memory engine, living economy/trade, world history/legacy, player-experience intelligence (play-style agents, no invasive personal data), intelligent balancing, asset/visual pipeline, population/activity director, content quality control, GAME EVOLUTION LAB dashboard section, completion roadmap (prototype → functioning → integrated → polished → release-ready, measurable criteria).
- **(2) Current implementation:** **None as an engine.** `rg "AGEE|GAME EVOLUTION LAB"` over `src/`, `scripts/`, `docs/`, `~/workspace/studio/` returns exactly **one hit: `~/workspace/studio/CONTINUE_ASHFALL.md`**, listing AGEE as future work item 9. Zero hits in the repo. (The *game* itself has NPC/economy/quest systems in `src/game/` — those are gameplay, not AGEE — but no AGEE content-generation engine sits above them, and no GAME EVOLUTION LAB section exists in the dashboard data.)
- **(3) Dependencies:** §55/§56 foundations; the 3D game systems it would drive (G11/G12/G15).
- **(4) What remains unfinished:** Everything.
- **(5) Responsible files/modules:** SOUL.md §58 only (directive text).
- **(6) How it will be tested:** A runnable content-generation/validation loop with QC evidence and a dashboard GAME EVOLUTION LAB section.
- **(7) Completion:** AGEE generating validated, measurable game improvements that land as verified builds.

## D9 — Self-evolution files (§59)
- **(1) Intended purpose:** Versioned operating constitution, versioned self-improving instructions, and an exact persistent resume point, so a future session can continue without re-explanation.
- **(2) Current implementation — all three exist as working copies in `~/workspace/studio/`, none in the repo:** `MUSE_SOUL.md` — 9,749 B, v1.0, 2026-11-07. 12 operating principles, "extend never duplicate", "smallest safe change", "never claim complete without evidence", atomic-write memory rule. Header states canonical location is `studio/` in the repo "when git can write". `MUSE_EVOLUTION.md` — 3,760 B, v1.0, 2026-11-07. Revision procedure (propose → benefit → compatibility check → version → test → record → rollback), evaluation criteria, revision log with only v1.0 (initial version). Known gaps recorded from real failures (git EPERM, MEMORY.md truncation, assert-runner pipe false-failure, subagent push 403s). "Awaiting the first real revision." `CONTINUE_ASHFALL.md` — 16,020 B, last updated 2026-11-07 ~14:48 PST. States: last verified checkpoint BUILD 1029 commit `14491c9f` (live-confirmed ~13:40 PST, served version.json 2026-11-07T21:37:14.339Z, run 42416626999); active task BUILD 1030 implemented + code-verified, NOT shipped/live; directives §47–§59; SOUL.md 9,286 lines; queue 1030→1031→1032→Stages 2–6→dashboard repair→self-evolution files→master integration→§57→AGEE→legacy audit→stone-house replacement (blocked, package never arrived). **Accuracy check vs reality (verified by the dev-systems auditor):** the resume point **matches the actual tree**: `git rev-parse HEAD` = `14491c9fa6c76510fd64fa1a0d6f9b2965420a6c` (1029); `git status --short` shows exactly the 7 files CONTINUE_ASHFALL.md claims for 1030 (6 modified + 1 untracked `playerPath.ts`); `prepare-build-entry.cjs` contains `__AG_BUILD="1030"`. SOUL.md line count verified: 9,286.
- **(3) Dependencies:** Git write restored; 1030 landing.
- **(4) What remains unfinished:** Move the three files (+ `studio/dashboard/`) into `<repo>/studio/` and commit; then the first real MUSE_EVOLUTION.md revision. MUSE MEMORY CORE (`/muse/memory/`, 10 files/dirs): **not verified by this audit**. Watchdog, six modes, self-audit: documented only.
- **(5) Responsible files/modules:** `~/workspace/studio/MUSE_SOUL.md`, `MUSE_EVOLUTION.md`, `CONTINUE_ASHFALL.md` → `<repo>/studio/`.
- **(6) How it will be tested:** A fresh session resumes from CONTINUE_ASHFALL.md alone without re-explanation; first MUSE_EVOLUTION revision recorded.
- **(7) Completion:** Files live in-repo, versioned, and a fresh session resumes from them alone.

## D10 — This registry (§55 Stage A)
- **(1) Intended purpose:** The master implementation registry classifying every requirement as COMPLETE AND VERIFIED / IMPLEMENTED BUT UNVERIFIED / PARTIALLY IMPLEMENTED / DOCUMENTED ONLY / NOT IMPLEMENTED / BLOCKED / OBSOLETE OR DUPLICATED, inspected against the actual implementation.
- **(2) Current implementation:** **This file** (`~/workspace/verify-integration/IMPLEMENTATION_REGISTRY.md`, v1.0, 2026-11-07). Prior to this audit, no registry file existed (`ls ~/workspace/verify-integration/` → no such directory, confirmed). `dashboard-data.json`'s buildQueue lists "Master integration audit (§55 Stage A)" as `in_progress` — that entry refers to this running audit.
- **(3) Dependencies:** The three scope audits (game systems, dev systems, directives/standing decisions) — delivered; the legacy audit (S26) for reconciliation.
- **(4) What remains unfinished:** Reconcile with the parallel legacy audit once its deliverable lands; move the registry into version-controlled repo storage (`studio/`); update it at each verified checkpoint.
- **(5) Responsible files/modules:** `~/workspace/verify-integration/IMPLEMENTATION_REGISTRY.md` → `<repo>/studio/`.
- **(6) How it will be tested:** Spot-checks of registry claims against the tree at each checkpoint; statuses change only with evidence.
- **(7) Completion:** A version-controlled registry file exists and is maintained, not a one-off chat report.

## D11 — Automated testing infrastructure
- **(1) Intended purpose:** Prove builds before they ship (unit/asserts, sim regression, live phone probes, CI).
- **(2) Current implementation (all real, inspected):** `scripts/simulate.ts` — 11,339 lines (~679 KB), 41k+ assertions per AGENTS.md; `scripts/sim-lab.ts`, `scripts/stress.ts`, `scripts/playtest.ts`, `scripts/benchmark.ts`. `tests/` — ~15 files (`body-loot-selection`, `building-art`, `character-creator-restrictions`, `iso-tile-assets`, `landscape-coherence`, `little-world-generator`, `settlement-economy`, `update-version`, `world-map-coherence`, `quest-playthrough.mts`, `real-game/`, etc.). Per-build assert runners + Playwright probes in `~/workspace/verify*/`; probe scripts import Playwright from the repo's own `node_modules`. CI: `.github/workflows/deploy-pages.yml` runs typecheck + ~12 regression tests + build + update-version check, then Pages deploy; `validate.yml` also present. **Limits (environment, not code):** git cannot write (E1), Chromium will not launch (E2), local vite build impossible (E3). Known sim-only gap: the **684 rig crash** (S2) — `assetMetaFor` returns null for 5 variants; `simulate.ts` crashes; ~1,000 sim lines after the rig section unverified — open since 2026-10-21, awaiting user word; it masks part of every sim comparison including 1030's.
- **(3) Dependencies:** Environment recovery (E1–E3); user decision on the 684 crash (S2).
- **(4) What remains unfinished:** Re-run probe + live verify once unblocked; fix or formally accept the 684 crash.
- **(5) Responsible files/modules:** `scripts/simulate.ts`, `scripts/sim-lab.ts`, `scripts/stress.ts`, `scripts/playtest.ts`, `scripts/benchmark.ts`, `tests/`, `~/workspace/verify*/`, `.github/workflows/deploy-pages.yml`.
- **(6) How it will be tested:** 1030 probe passes with 0 page errors and served version.json reads build 1030; full sim exits 0 once the 684 crash is fixed.
- **(7) Completion:** 1030 probe passes with 0 page errors and served version.json reads build 1030; sim runs to completion.

## D12 — GitHub integration (repo + Pages deploy)
- **(1) Intended purpose:** Version control + Pages deploy pipeline as the permanent source of truth.
- **(2) Current implementation:** `git --no-optional-locks log --oneline -15` (read-only) confirms HEAD **`14491c9f` "BUILD 1029: Saved chunks keep the inn, blacksmith, and general store"**, followed by 1028 `7266e49a`, 1027 `16b7eb9e`, 1026 `5d002922`, 1025 `88658d1e`, 1024 `b40f7b1a` (+ re-trigger `e49d3521`), 1023 `83ffcb0f`, 1022 `11ac074e`, 1021 `4fe8d127` (+ re-trigger `00a3f115`), 1020 `181f7871`, 1019 `b5af37ba`, 1018 `2d66086c`, 1017 `fe3c5896`. All hashes match `dashboard-data.json` buildHistory exactly (1016 `3b349dd3` is just below the 15-line window; verified in the JSON). Deploy pipeline: `.github/workflows/deploy-pages.yml` — push to `main` or workflow_dispatch; checkout, Node 20, `npm ci`, three@0.180.0 FBX loader install, typecheck, 12 regression tests, FBX staging, `npm run build`, update-version check, Pages artifact upload/deploy. Concurrency group `pages`, cancel-in-progress false. Recent history shows it works and also shows its failure modes honestly recorded (deploy job stuck/failed twice, recovered by re-trigger commits with identical content, 1021/1024).
- **(3) Dependencies:** GitHub Actions runners; a working local git write path for pushing.
- **(4) What remains unfinished:** Push 1030 once git writes again; nothing to fix in the pipeline itself.
- **(5) Responsible files/modules:** `.github/workflows/deploy-pages.yml`, `validate.yml`, remote `origin/main`.
- **(6) How it will be tested:** 1030 commit exists on origin/main and the Pages deploy serves version.json build 1030.
- **(7) Completion:** 1030 commit exists on origin/main and the Pages deploy serves version.json build 1030.

---

# Directives (§47–§59)

## R1 — §47 Update speed / efficiency
- **(1) Intended purpose:** "Make updates dramatically faster — targeted incremental changes, reuse existing systems/assets, parallel when safe — never at the cost of stability, functionality, or code quality."
- **(2) Current implementation:** The rule is in force as process (1030 agent reused NPC A* instead of duplicating it; 1022/1024 reused emission patterns; parallel read-only audits run now). No metric exists proving "dramatically faster" — build cadence 1016–1029 was ~1 build/30–60 min on 2026-11-07, but no baseline comparison was recorded.
- **(3) Dependencies:** None.
- **(4) What remains unfinished:** Any measurement of speed vs. the pre-§47 baseline.
- **(5) Responsible files/modules:** SOUL.md §47 only (L1269–1287).
- **(6) How it will be tested:** Measured before/after on build cycle time.
- **(7) Completion:** A measured before/after on build cycle time, or acceptance that it is a standing working rule, not a shippable feature.

## R2 — §48 3D game master directive
- **(1) Intended purpose:** "THE 3D GAME IS THE FUTURE AND PRIMARY VERSION OF ASHFALL" — 2D/2.5D are no longer development targets; preserve/reuse existing systems and progressively integrate them into one polished, cohesive 3D medieval fantasy RPG.
- **(2) Current implementation:** Direction adopted (MEMORY.md direction-change entry, 2026-11-07 ~14:07). Sub-requirements: §48.1 non-negotiable rules — followed per-build (Stage 1 audit = the opening step, done 13:50 PST, `~/workspace/verify1030/ASHFALL-STAGE1.md`, 660 lines, repo untouched at 14491c9f). §48.2 3D world overhaul — incremental pieces shipped (1011 sky, 1015 grass/rocks, 1022 cobbles, 1024 infinite world, 1027 ocean); Stage 1 baseline measured flat ground (max y 0.038), 91.6% uniform grass, stone terrain dead (0 tiles), no rivers/beaches. Stages 2–6 queued, not started. §48.3 architecture/settlements — 4 house designs (1012), inn/store/smith as buildings only (1015); roofline variation zero (all 26 town huts roofAxis='x'); Stage 4/5 queued. §48.4 living world — `villageLife.ts`, `townsfolk.ts`, NPC A* exist (2.5D-origin systems); depth of 3D integration not verified. §48.5 AI adventurers — `simulatedAdventurers.ts` exists and is imported/used in `App.tsx`; 3D-visible adventurers unverified (no grep hit in `Engine3DWorldView.tsx`). §48.6 complete RPG system — `combat.ts`, `quests.ts`, `classes.ts`, `classLoot.ts` exist; no verified end-to-end 3D RPG loop audit exists. §48.7 procedural world gen — deterministic seeded gen exists and is exercised daily; "features influence each other" only partly evidenced. §48.8 dungeons incl. Ember Vault reuse — `dungeonVaults.ts`, `dungeonLayouts.ts`, `dungeonUniques.ts`, `dungeonShops.ts`, `dungeonTraps.ts`, `stoneSoupEngine.ts` + `StoneSoupDungeon.tsx` exist; reuse **into 3D** not verified — directive text is the only evidence of a 3D integration plan. §48.9 economy/factions/civilization — `faction.ts`, `civilization.ts`, `ecoHistory.ts`, `ecosystem.ts` exist; 3D-visible economy not verified. §48.10 world events/history — `ecoHistory.ts` exists; no verified event system in 3D. §48.11 3D interface — HUD strip, Build menu, Options, Hide UI (1017), sprint ⚡ icon next to Gold (1028) shipped + live-verified. §48.12 audio — `audio.ts` exists; 3D audio/immersion scope unverified. §48.13 performance — Stage 1 measured baseline (237k verts town / 266k wild, 89% of 300k budget, rebuild 165–211ms, live hitch 566.6ms on 50-tile teleport; harness FPS town 6.79 SwiftShader). No performance target met/declared. §48.14 persistence — save/load exists incl. wild saves (1024) and removed-sets (rocks/walls/water); versioned-save/migration claim not verified. §48.15 development autonomy / RUN — documented only (see R3). §48.16 final acceptance criteria (create character → explore → meet adventurers → develop → dungeons → economy → save → return → world continued) — **NOT IMPLEMENTED**: no build has demonstrated the full chain.
- **(3) Dependencies:** Queue 1030→1031→1032→Stages 2–6 first.
- **(4) What remains unfinished:** Each §48.16 criterion demonstrated live in 3D.
- **(5) Responsible files/modules:** SOUL.md §48 (L1288–1999); `src/App.tsx`, `src/game/engine3d/`, `src/game/*.ts`.
- **(6) How it will be tested:** Per-build tsc + asserts + sim + phone probes (dated logs); Stage 1 headless + phone probe, 0 page errors.
- **(7) Completion:** Each §48.16 criterion demonstrated live in 3D.

## R3 — §49 Autonomous development directive
- **(1) Intended purpose:** "Turn development into an autonomous, self-improving production pipeline… continue until ASHFALL is a complete, polished, playable 3D RPG" — RUN mode: resume from last verified checkpoint, next highest-priority task, develop/test/fix/save/continue.
- **(2) Current implementation:** Directive text only (SOUL.md L2000–2416). **RUN has NOT been said** — recorded twice in the dated log. Teams A–F (3D Engine, World Design, RPG Gameplay, Living World, Interface, QA/Optimization): documented only; standing constraint still applies — parallel agents share ONE checkout, one code agent at a time (1022 lesson); read-only audits may run in parallel. Self-managing backlog: no formal registry found — MEMORY.md + dated logs serve as the backlog de facto; the §55 registry (this audit) is the first formal attempt. Automated bug detection/repair: per-build sim/asserts exist, but no standing autonomous pipeline.
- **(3) Dependencies:** §48 direction; git write access for any autonomous landing.
- **(4) What remains unfinished:** User says RUN (or CONTINUE/AUDIT/OPTIMIZE/COMPLETE); a real task registry; autonomous execution loop.
- **(5) Responsible files/modules:** SOUL.md §49 only.
- **(6) How it will be tested:** A RUN session lands ≥1 verified build from the registry without a fresh user order per build.
- **(7) Completion:** A RUN session that lands ≥1 verified build from the registry without a fresh user order per build.

## R4 — §50 Autonomous evolution directive
- **(1) Intended purpose:** "Every 10-minute development cycle should produce meaningful, visible, verified progress" — quality gates L1 IMPLEMENTED / L2 INTEGRATED / L3 VERIFIED / L4 POLISHED; live dashboard; autonomous checkpoints; phone-friendly reporting.
- **(2) Current implementation:** 10-minute cycle: **not implemented** — no background/continuous execution exists; the 10-min target is explicitly a checkpoint cadence, not a promise. Quality gates L1–L4: partially — the dashboard ledger carries gate levels per build (1016–1032), and per-build gates (tsc/asserts/sim/phone/live) are run manually per build; no automated gate runner. Dashboard: live (artifact built + verified 2026-11-07 ~14:16 PST, verification SUCCEEDED; footer dated Nov 7, 2026 snapshot; must be edited at each verified checkpoint). Checkpoints: partially — `CONTINUE_ASHFALL.md` exists as a working copy; last verified checkpoint 1029/14491c9f.
- **(3) Dependencies:** §49 RUN.
- **(4) What remains unfinished:** Automated cycle execution, gate automation, dashboard kept current (currently stale at 1029 — 1030 not landed).
- **(5) Responsible files/modules:** SOUL.md §50 (L2417–2799); dashboard artifact (not in repo).
- **(6) How it will be tested:** Dashboard auto-updated from verified landings; gates enforced by tooling, not by hand.
- **(7) Completion:** Dashboard auto-updated from verified landings; gates enforced by tooling, not by hand.

## R5 — §51 Ultimate engineering architecture
- **(1) Intended purpose:** "Complete codebase optimization; ultra-lightweight architecture (Core/World/Entity/Gameplay/Simulation/Presentation/Data engines); extreme performance optimization; extremely simple future development; self-healing codebase."
- **(2) Current implementation:** Directive text only — **AND TRUNCATED.** The directive as received ends mid-sentence at "For risky changes, create a recover" (flagged in SOUL.md at L3132). The same self-healing rules are covered in full in §52, so nothing is functionally lost, but §51 itself is incomplete as received. No Core/World/Entity/Gameplay/Simulation/Presentation/Data engine split exists — the repo is still the `App.tsx` monolith + `src/game/*` modules per AGENTS.md.
- **(3) Dependencies:** §52 legacy audit.
- **(4) What remains unfinished:** User sends the rest of §51 if wanted; engine-split architecture (not started).
- **(5) Responsible files/modules:** SOUL.md §51 only (L2800–3135).
- **(6) How it will be tested:** Engine layering demonstrably in place (imports flow one way; no monolith growth).
- **(7) Completion:** Truncated tail supplied or formally dropped; engine layering demonstrably in place.

## R6 — §52 God-tier engineering / legacy cleanup
- **(1) Intended purpose:** "One clean 3D architecture… remove obsolete 2D/2.5D code WITHOUT deleting systems, assets or logic the 3D game still depends on — classify every legacy file A/B/C/D/E; remove only verified category D."
- **(2) Current implementation:** Directive text + step 1 DONE. The legacy codebase audit (the FINAL COMMAND's step 1) is **complete** — `~/workspace/verify-legacy/LEGACY_AUDIT.md` (37,514 bytes, 230 lines, 2026-11-07 ~15:00 PST; verified directly by the registry author after the auditors' reports; repo untouched, HEAD 14491c9f). Counts (248 `.ts/.tsx` files): A required by 3D/boot 47, B reusable gameplay logic 104, C reusable content/assets 56, D obsolete verified 41 code + 2 assets, E unknown 2 code + 3 root server `.js` + asset dirs. Verified-D in three waves: Wave 1 (8 code + 2 assets, unambiguous dead), Wave 2 (10 orphaned utilities, sim-only), Wave 3 (23, CONTESTED — complete but never wired in; deletion is a user product decision). Headline finding: **the 3D game is NOT the game that ships today** — `GraphicsModeHost` always boots 2.5D (`initialMode()` force-writes `'2.5d'` and strips `?mode=`); `Engine3DWorldView` imports only `isoWorld`, `mosslightLayout`, `dayNight`, and a slice of `townsfolk.ts` (worldCore type-only) and has no combat, quests, dialogue, shops, inventory, or 2.5D-save support. Deleting everything '2D/2.5D' today would delete the game; most legacy code is B/C (extract first), not D. Also found: 12 duplicate systems, ~20 unused package.json dependencies, a circular import (`IsoFieldView` ↔ `App`), and `public/` at 195 MB / 31,507 files (`public/rpg/` 129 MB, only ~25 MB verified used). No file has been removed under this directive; no clean architecture established; no health checks / scorecard / self-healing code exists. Recommended order recorded: 1. audit → 2. identify unnecessary 2D/2.5D → 3. extract reusable systems → 4. clean 3D architecture → 5. optimize → 6. self-healing/regression → 7. expand game.
- **(3) Dependencies:** Audit completion (done); git write for any removal.
- **(4) What remains unfinished:** Wave 1 removal (with the §52 11-step procedure, git checkpoint, tsc + build + sim + phone probe) once git can write again; Wave 3 needs explicit user approval per cluster; extraction priorities 1–3 before any B/C removal.
- **(5) Responsible files/modules:** SOUL.md §52 (L3136–3673); (pending) `~/workspace/verify-legacy/LEGACY_AUDIT.md`.
- **(6) How it will be tested:** A–E classification published with dependency evidence per file; only verified-D files removed, with 3D still passing tsc + sim + phone probe after each removal.
- **(7) Completion:** A–E classification published with dependency evidence per file; only verified-D files removed, with 3D still passing tsc + sim + phone probe after each removal.

## R7 — §53 Autonomous god-tier directive
- **(1) Intended purpose:** "MAXIMUM IMPROVEMENT PER CREDIT" — impact-per-credit optimization; credit/execution governor (EFFICIENT / DEEP DEVELOPMENT / AUTONOMOUS EVOLUTION); ultimate creation dashboard (10 modules, every control real, no placeholder buttons or fake progress); self-healing code; hex engineering strategic-only; living world; 6-layer NPC intelligence; autonomous QA with simulated players; living ENGINE_BIBLE; Evolution Ledger.
- **(2) Current implementation:** Directive text only (SOUL.md L3674–4807). No credit governor code, no 10-module creation dashboard, no ENGINE_BIBLE, no Evolution Ledger, no Development Genome / World Simulation Observatory / Autonomous QA Players / Visual Intelligence Engine found in the repo (grep spot-checks only — a full-repo search for each was not done in this audit; absence is based on the dated-log record that these are "additional recommendations," not shipped work). Hex rule (strategic only, never convert ordinary code/docs to hex) is a standing rule, not code. Priority-1 focus (major visual/broken systems/performance/foundational mechanics/game-breaking bugs/architecture blockers) is followed informally by the queue.
- **(3) Dependencies:** §49/§50 execution; §52 audit.
- **(4) What remains unfinished:** Everything except the rule text.
- **(5) Responsible files/modules:** SOUL.md §53 only.
- **(6) How it will be tested:** Governor + dashboard modules + ENGINE_BIBLE + ledger demonstrably operating on real builds.
- **(7) Completion:** Governor + dashboard modules + ENGINE_BIBLE + ledger demonstrably operating on real builds.

## R8 — §54 Dashboard repair & automation
- **(1) Intended purpose:** "Preserve the existing dashboard; make its data permanent, version-controlled, reconciled against real GitHub commits — NEVER fabricate hashes/results/measurements; automatic updates after every meaningful operation; four quality gates with ACTUAL evidence; protect the memory (atomic writes, backups, recovery) after the 2026-11-07 MEMORY.md truncation."
- **(2) Current implementation:** Working copies created 2026-11-07 ~14:51–14:54 in `~/workspace/studio/dashboard/`: `dashboard-data.json` (14 keys; 17-entry build history: 14 verified, 1 in progress, 2 planned; last verified checkpoint 1029/14491c9f), `dashboard-schema.json`, `README.md`, `MUSE_INSTRUCTIONS.md`, `snapshots/2026-11-07.json` (21,455 bytes, byte-identical copy of dashboard-data.json), `history/build-ledger.json` (1016–1032, hashes verified against `git log`), `history/verification-history.json`, `history/development-history.json` — all 6 JSON validated (node parse, ALL JSON VALID). **Not yet in the repo** (`studio/` does not exist in `~/workspace/adventure-game`) — blocked on git EPERM. Dashboard artifact itself is live (see §50) but still reads hard-coded data, not these JSON files. Atomic-write/backup/recovery procedure is documented in `MUSE_INSTRUCTIONS.md`, not verified as implemented code. Build numbers vs Java engine job numbers (001–006) distinction recorded. 944–1015 backfill noted as still to do.
- **(3) Dependencies:** Git write (1030 landing first).
- **(4) What remains unfinished:** Move files into repo `studio/dashboard/`; wire artifact to read them; automatic update on landing; 944–1015 backfill.
- **(5) Responsible files/modules:** `~/workspace/studio/dashboard/*` (working copies); SOUL.md §54 (L4808–5226).
- **(6) How it will be tested:** JSON validity only so far; no live dashboard-from-JSON test yet.
- **(7) Completion:** Dashboard renders from repo JSON; a landing updates ledger/queue/stages/issues with commit hash + gate evidence, no hand edit.

## R9 — §55 Master integration directive
- **(1) Intended purpose:** "CONNECT EVERYTHING. IMPLEMENT EVERYTHING. MAKE THE ENTIRE ECOSYSTEM WORK" — master implementation registry (this file); connect dashboard/GitHub/instructions/backlog/ledger/verification/autonomous engine/knowledge base/performance/testing/self-healing/tools through clear interfaces; no disconnected mocks, no duplicate sources of truth; unify docs in GitHub (ENGINE_BIBLE, SYSTEM_MAP, PROJECT_STATE, NEXT_TASK, TEST_STATUS, DEVELOPMENT_ROADMAP, MUSE_INSTRUCTIONS, DEVELOPMENT_DIRECTIVES, DASHBOARD_DATA, BUILD_LEDGER, VERIFICATION_HISTORY, ARCHITECTURE_DECISIONS); Stages A–F.
- **(2) Current implementation:** Stage A in progress — this registry is part of it. A parallel §55 audit subagent was spawned ~14:51 writing to `~/workspace/verify-integration/IMPLEMENTATION_REGISTRY.md` — **this file**; at the time the directives auditor checked, no such directory/file existed, so its deliverable had not landed then (it has now — this file). No unified GitHub docs found (no ENGINE_BIBLE/SYSTEM_MAP/etc. in repo — spot-checked, not exhaustively searched). Stages A–F not executed; runs under RUN / after the current queue. Order recorded: §53 → §54 → §55.
- **(3) Dependencies:** §53/§54 outputs; current queue landing.
- **(4) What remains unfinished:** Registry completion (this file + legacy-audit reconciliation), Stages A–F execution, doc unification.
- **(5) Responsible files/modules:** SOUL.md §55 (L5227–5872); this registry.
- **(6) How it will be tested:** Registry published and kept current; every subsystem connected through a real interface with evidence.
- **(7) Completion:** Registry published and kept current; every subsystem connected through a real interface with evidence; unified docs live in GitHub.

## R10 — §56 ACEE directive
- **(1) Intended purpose:** "BUILD THE MACHINE. THEN USE THE MACHINE TO BUILD ASHFALL" — a SEPARATE engineering subsystem (not a game feature): ACEE central intelligence + Development Genome + quantum-inspired computation lab (classical only, benchmark everything, never pretend classical is quantum) + code sorting/generation machines + 11-role multi-agent lab + evolution-score formula + file/code factory + simulation/validation lab + memory/knowledge engine + experimental sandbox + CODE EVOLUTION LAB dashboard section.
- **(2) Current implementation:** Directive text (SOUL.md L5873–6549) + docs in studio/acee/ (10 files) + Development Genome index in studio/genome/ (scanner + query + genome.json, 440 files / 4,810 symbols / 782 edges, answers queries; Phase 1 partially done). No ACEE code, generation machine, lab, or dashboard section exists yet. See D6.
- **(3) Dependencies:** §52 audit, §53 infrastructure.
- **(4) What remains unfinished:** Phases 2–7 (code generation, multi-agent engineering, optimization lab, self-improvement, dashboard integration, autonomous evolution). Phase 1 is partially done (genome spec + seed + index + scanner + query).
- **(5) Responsible files/modules:** SOUL.md §56 (directive text) + studio/acee/ (docs) + studio/genome/ (index).
- **(6) How it will be tested:** Phase 1 demonstrably indexing the real repo; later phases gated on measured benefit.
- **(7) Completion:** Phase 1 (intelligence foundation) demonstrably indexing the real repo — DONE 2026-11-07 (genome index + scanner + query, verified by the parent); later phases gated on measured benefit.

## R11 — §57 Next evolution layer
- **(1) Intended purpose:** "Make ASHFALL capable of improving both the game and the machinery used to create it; BUILD. MEASURE. LEARN. EVOLVE. REPEAT." — master orchestrator, recursive development engine (MAJOR PRIORITY, test engine changes against previous behaviour, known-good + rollback), independent verification (GENERATED → COMPILED → TESTED → INTEGRATED → VERIFIED → APPROVED, evidence per status), real benchmarking lab (baselines for game AND engine), advanced memory (semantic retrieval), tool bus (provider-independent, route by reasoning/coding/context/speed/cost), automated gameplay intelligence, world/emergent-story testing, visual intelligence, cleanup engine, resource intelligence, evidence-based health score (NEVER invent completion percentages).
- **(2) Current implementation:** Directive text only (SOUL.md L6550–7066). No orchestrator, recursive engine, verification intelligence, benchmarking lab, tool bus, or health score found. **Pacing instruction recorded in §57 itself:** do NOT send another massive directive immediately after it — let Muse finish its current hour, save work, produce an implementation report first, then implement only what is still missing. Status per dated log: queued as a future layer; implement only after the current hour's work is saved/reported.
- **(3) Dependencies:** §53–§56.
- **(4) What remains unfinished:** All of it.
- **(5) Responsible files/modules:** SOUL.md §57 only.
- **(6) How it will be tested:** Orchestrator + independent verification + baselines + health score operating with real evidence.
- **(7) Completion:** Orchestrator + independent verification + baselines + health score operating with real evidence.

## R12 — §58 AGEE directive
- **(1) Intended purpose:** "Make the development machinery produce an extraordinary ACTUAL game" — AGEE decides what the game needs, the code evolution engine implements it, the verification engine proves it; world content factory, emergent story engine, quest generation + validation, deep NPC personality/memory, living economy/trade, world history/legacy, player-experience intelligence (play-style agents, no invasive personal data), intelligent balancing, asset/visual pipeline, population/activity director, content quality control, GAME EVOLUTION LAB dashboard section, completion roadmap (prototype → functioning → integrated → polished → release-ready, measurable criteria per subsystem).
- **(2) Current implementation:** Directive text only (SOUL.md L7067–7584). Underlying game systems exist in part (world gen, quests in `quests.ts`, NPC memory in `villageLife.ts`/`conversationMemory.ts`, economy in `civilization.ts`/`ecosystem.ts`) but there is no AGEE evaluating/improving the playable game, no quest-generation/validation engine, no GAME EVOLUTION LAB. Intended ecosystem is FOUR connected capabilities (Autonomous Development, Code Evolution Engine, Development Intelligence, Game Evolution Engine) — not four competing systems. Queued as future work per the §57 pacing instruction. See D8.
- **(3) Dependencies:** §56/§57.
- **(4) What remains unfinished:** All of it.
- **(5) Responsible files/modules:** SOUL.md §58 only (+ pre-existing game systems listed above).
- **(6) How it will be tested:** AGEE generating validated, measurable game improvements that land as verified builds.
- **(7) Completion:** AGEE generating validated, measurable game improvements that land as verified builds.

## R13 — §59 Muse self-evolution engine
- **(1) Intended purpose:** "Improve the machinery that improves ASHFALL" — MUSE_SOUL.md (permanent constitution, 12 principles), MUSE_EVOLUTION.md (versioned self-improving instructions), MUSE MEMORY CORE, persistent autonomous execution, credit-efficiency engine (EXPECTED VALUE = IMPACT × SUCCESS PROBABILITY ÷ RESOURCE COST), six modes (EFFICIENT/DEEP/AUTONOMOUS/MAINTENANCE/RECOVERY/RESEARCH), tool improvement, watchdog, CONTINUE_ASHFALL.md, self-audit (10 questions), GitHub persistence. **HARD RULE:** optimize credit consumption through legitimate resources — NEVER bypass usage limits, evade billing controls, or conceal usage.
- **(2) Current implementation:** The three files exist as **working copies** in `~/workspace/studio/` (verified sizes): `MUSE_SOUL.md` v1.0 (9,749 bytes), `MUSE_EVOLUTION.md` v1.0 (3,760 bytes, revision log starting v1.0 with real-failure lessons: env write-failure recovery, MEMORY.md truncating-write rule, assert-runner no-pipe rule, subagent push transient rule), `CONTINUE_ASHFALL.md` (16,020 bytes — status, active task 1030, last verified checkpoint 1029/14491c9f, outstanding work in order, known problems, next exact action with resume commands). **Not in version-controlled project storage** — blocked on git EPERM + 1030's uncommitted work. MUSE MEMORY CORE (`/muse/memory/` with 10 files/dirs): **not verified by this audit** (did not inspect). Watchdog, six modes, self-audit: documented only. See D9.
- **(3) Dependencies:** Git write (after 1030 lands).
- **(4) What remains unfinished:** Move the three files into repo `studio/`; verify MEMORY CORE contents; first MUSE_EVOLUTION revision cycle.
- **(5) Responsible files/modules:** `~/workspace/studio/MUSE_SOUL.md`, `MUSE_EVOLUTION.md`, `CONTINUE_ASHFALL.md`; SOUL.md §59 (L7585–9286).
- **(6) How it will be tested:** Sizes + key anchors verified only so far; fresh-session resume test after the files land in-repo.
- **(7) Completion:** Files live in repo, versioned, and a fresh session resumes from CONTINUE_ASHFALL.md without re-explanation.

---

# Build queue

## Q0 — Ashfall Stage 1 audit
- **(1) Intended purpose:** Measure the 3D world as it actually is (terrain, vegetation, architecture, settlements, atmosphere, performance) before changing it.
- **(2) Current implementation:** DONE 2026-11-07 ~13:50 PST (`~/workspace/verify1030/ASHFALL-STAGE1.md`, 660 lines; headless MEASURE_DONE exit 0; phone probe 0 page errors; repo untouched). Headline findings: ground FLAT (max y 0.038); 91.6% uniform grass; tint variation ±0.027 (nearly invisible); `stone` terrain dead (0 tiles); no rivers/beaches, ocean meets grass directly; ONE tree design; 118 crates render as pine trees; grass = 23% of town buffer; wild sparse (0.65% trees in ±64 band); one box language, all 26 town huts roofAxis='x'; no fences/gardens; interiors bare boxes with sky visible from inside (no ceiling); town is a 61×125 ribbon, 0 generated stalls (no market); 47 NPCs, 49% generic commoner; wilderness empty by design (no POIs); night reads as overcast day at full uNight (0.55 cap); all 29 houses lit 19:30–21:30 every evening; no stars/weather/dawn-dusk; baked SUN_SHADE fixed northwest-high while the sky sun moves. Performance: world buffer 237k verts town / 266k wild (89% of 300k budget); rebuild ~165–211ms; live hitch 566.6ms on a 50-tile teleport; harness FPS town 6.79 / wild 7.82 / shore 9.29 / first-person 6.06 (SwiftShader — relative baseline only).
- **(3) Dependencies:** None (audit only).
- **(4) What remains unfinished:** Nothing for Stage 1 itself; Stages 2–6 use it as the baseline.
- **(5) Responsible files/modules:** `~/workspace/verify1030/ASHFALL-STAGE1.md`.
- **(6) How it will be tested:** Headless measurement + live phone probe (done, 0 page errors).
- **(7) Completion:** Done — audit delivered, no code build claimed.

## Q1 — BUILD 1030 tap-to-walk pathfinding
- **(1) Intended purpose:** One tap must path around trees/houses/rocks/NPCs and arrive without re-taps.
- **(2) Current implementation:** New pure module `src/game/engine3d/playerPath.ts` (6,202 bytes) — `playerWalkable()`, `planPlayerPath()` (tile A* reusing `planPathNpc`'s steps + greedy line-of-sight smoothing to ≤3 waypoints ending exactly on the tap; replan 500ms, stuck 1500ms, figure-wait 900ms, waypoint-arrive 0.15); view follows waypoints (static-blocked → replan now; figure-blocked → wait ≤900ms then replan with the tile excluded; stuck → replan around the tile ahead); NPC fixes (`pathHasUnwalkableTile`, `sidestepTile`, detour flag breaking the head-on ping-pong — head-on pair arrives in 21–22 ticks). Markers bumped: `window.__AG_BUILD="1030"` in `scripts/prepare-build-entry.cjs` AND `BUILD_NUMBER='1030'` in `src/App.tsx`, plus the '1030' player-terms note. Files (working tree): modified `scripts/prepare-build-entry.cjs`, `src/App.tsx`, `src/game/engine3d/Engine3DWorldView.tsx`, `animals.ts`, `townsfolk3d.ts`, `transients.ts`; new `playerPath.ts`. **TESTED (code only):** tsc clean (agent + parent re-ran, exit 0); standalone asserts 97 entry + 47 runner PASS (agent's run ~15:04 — parent re-run BLOCKED: esbuild cannot write bundle, EPERM); sim vs pristine1029 IDENTICAL (parent-verified norms, 0 FAIL, same known 684 crash). **LANDED 2026-11-07:** commit 9dc4cdf7 pushed (7 files only); deploy run 42428294182 completed success (first try); served version.json build 1030 @ 2026-11-08T00:08:20.684Z with the 1030 note; served index `__AG_BUILD="1030"`; phone probe ALL 1030 PROBE CHECKS PASS, exit 0, 0 page errors (hut detour one-tap arrival, 23 samples, 0 inside-hut; NPC detour one-tap arrival, 24 samples, min dist 2.37; wall-ring sealed tile → "Path blocked", player unmoved; keyboard 'w' 1.42 tiles + ⚡Sprint icon present).
- **(3) Dependencies:** None remaining — environment cleared 2026-11-07 ~16:06 PST (git writes + Chromium launch both work); commit 9dc4cdf7 on origin/main.
- **(4) What remains unfinished:** Nothing — landed 2026-11-07 ~16:18 PST. Next: update the dashboard data + registry (this checkpoint), then BUILD 1031.
- **(5) Responsible files/modules:** `playerPath.ts`, `Engine3DWorldView.tsx`, `townsfolk3d.ts`, `transients.ts`, `animals.ts`, `App.tsx`, `prepare-build-entry.cjs`.
- **(6) How it will be tested:** Phone probe: hut detour one-tap arrival (never inside the hut rect), NPC detour one-tap arrival (never within 0.6 of Aldric), wall-ring sealed tile → "Path blocked" + no movement, keyboard push smoke + sprint icon, screenshots to `verify1030/after/`.
- **(7) Completion:** Served `__AG_BUILD="1030"` + version.json 1030 + phone probe pass — ALL MET 2026-11-07 ~16:18 PST. Play link: https://jaydonweircontracting-ux.github.io/Adventure-game-/?v=1030

## Q2 — BUILD 1031 blue squares in the distance (wild-lake far cells)
- **(1) Intended purpose:** Distant wild lakes render as their actual tiles at every distance — no whole-cell blue quads popping in/out as the player walks.
- **(2) Current implementation:** None. User report 2026-11-07 ~13:46 PST + 2 screenshots; cause confirmed by code (see G3): `wildLakeAt = groundNoise(x,y,32) > 0.90`, 1.76% water; far cells centre-sample, so a lake centre tile paints the whole 16/64-tile cell blue. This retires the 1024 accepted limit ("wild lakes stay centre-sampled at distance") — now a user-reported bug.
- **(3) Dependencies:** 1030 landing (same file, `Engine3DWorldView.tsx`).
- **(4) What remains unfinished:** Subdivide wild-lake cells (cf. 1008 dirt subdivision); measure cost (64×64 scan = 4096 noise calls); phone proof at multiple distances.
- **(5) Responsible files/modules:** `Engine3DWorldView.tsx`, `wildTerrain.ts`.
- **(6) How it will be tested:** Walk toward a distant lake; screenshots at multiple distances; water stays in place, no pop, no whole-cell quads.
- **(7) Completion:** Walk toward a distant lake; water stays in place, no pop, no whole-cell quads; near/far agree.

## Q3 — BUILD 1032 interior invisible walls
- **(1) Intended purpose:** Inside a house the player cannot walk out through the walls; enter/exit only via the Enter/Exit button.
- **(2) Current implementation:** None. User order 2026-11-07 ~13:48 PST + 3 screenshots. Cause confirmed by code (see G5): `interiors.ts:interiorWalkable()` returns true for *every* tile inside the hut rect with no wall check, and `walkableAt()` (`Engine3DWorldView.tsx:1577–1579`) returns true for any in-rect tile; movement is continuous tile-centre walkability, so stepping outward across a wall edge lands on walkable outside grass — nothing clamps the player to the rect or gates exit to the door.
- **(3) Dependencies:** 1031 landing.
- **(4) What remains unfinished:** Audit interior system (`interiors.ts`, `IsoInteriorView.tsx`, view interior mode, Enter/Exit buttons), add boundary collision; phone proof (walk into every wall, stay inside; Exit → correct exterior point; re-enter works).
- **(5) Responsible files/modules:** `src/game/engine3d/interiors.ts`, `Engine3DWorldView.tsx` (interior mode).
- **(6) How it will be tested:** Phone probe: enter, walk into every wall — stays inside; Exit → correct exterior point; re-enter works; tsc/asserts/sim gates.
- **(7) Completion:** Phone proof as above + tsc/asserts/sim gates pass.

## Q4 — Ashfall Stage 2 terrain
- **(1) Intended purpose:** Visual-only heightfield (gentle rolling hills, walkability unchanged), stronger ground tint, shores (sand band + water edge), stone used or removed.
- **(2) Current implementation:** None. Stage 1 baseline exists (Q0). **HIGH risk** (touches ground emission, every object's base y, far rings, picker) — harness-prototype the base-y agreement first; fallback is tint+shores+stone only. Stage 2's agent must re-sync to its HEAD and re-baseline first (Stage 1 numbers are at 1029).
- **(3) Dependencies:** 1030→1031→1032 landing, in order.
- **(4) What remains unfinished:** The whole stage, one verified-live build.
- **(5) Responsible files/modules:** Ground emission + every object's base y + far rings + picker (`Engine3DWorldView.tsx`, `townLook.ts`, `isoWorld.ts`, `wildTerrain.ts`).
- **(6) How it will be tested:** Harness prototype first; then tsc/asserts/sim + phone probe with measured acceptance criteria (Stage 1 plan).
- **(7) Completion:** Live-verified build with heightfield + shores + stone, walkability unchanged, no regressions.

## Q5 — Ashfall Stage 3 vegetation
- **(1) Intended purpose:** 3 tree shapes, bushes (non-blocking), crates/stalls stop rendering as trees, grass density re-tested vs FPS.
- **(2) Current implementation:** None. Stage 1 found: one tree design for everything; 118 crates render as pine trees; grass = 23% of town buffer.
- **(3) Dependencies:** Stage 2 landing.
- **(4) What remains unfinished:** The whole stage, one verified-live build.
- **(5) Responsible files/modules:** `townLook.ts`, `grassTufts.ts`, `groundDetail3d.ts`, `wildTerrain.ts`.
- **(6) How it will be tested:** tsc/asserts/sim + phone probe; FPS re-measured after density changes.
- **(7) Completion:** Live-verified build with tree variety + bushes + crate/stall rendering fixed + FPS within budget.

## Q6 — Ashfall Stage 4 architecture
- **(1) Intended purpose:** Roof variety (axis/pitch/parapet), gardens/fences, interior ceilings + hearth glow; no mechanics (inn/store/smith stay shells).
- **(2) Current implementation:** None. Stage 1 found: one box language; all 26 town huts roofAxis='x' (zero roofline variation); no fences/gardens; interiors bare boxes with the sky visible from inside (no ceiling).
- **(3) Dependencies:** Stage 3 landing.
- **(4) What remains unfinished:** The whole stage, one verified-live build.
- **(5) Responsible files/modules:** `townLook.ts`, `interiors.ts`, `houseFx.ts`, `Engine3DWorldView.tsx`.
- **(6) How it will be tested:** tsc/asserts/sim + phone probe (interior ceiling check from inside; roofline variety check).
- **(7) Completion:** Live-verified build with roof variety + gardens/fences + interior ceilings + hearth glow.

## Q7 — Ashfall Stage 5 settlements
- **(1) Intended purpose:** Market stalls at the plaza, readable districts, 2–3 fixed wild landmarks; second settlement explicitly out of scope.
- **(2) Current implementation:** None. Stage 1 found: town is a 61×125 ribbon, not a compact cluster; 0 generated stalls (no market); wilderness empty by design (no POIs). **Cause of the 0-stall drop is UNVERIFIED — verify before fixing.**
- **(3) Dependencies:** Stage 4 landing.
- **(4) What remains unfinished:** The whole stage, one verified-live build; first verify the 0-stall cause.
- **(5) Responsible files/modules:** Town layout / stall generation (`isoWorld.ts`, `townLook.ts`, `placements.ts`).
- **(6) How it will be tested:** tsc/asserts/sim + phone probe (market stalls at plaza, districts readable, landmarks present).
- **(7) Completion:** Live-verified build with market + districts + landmarks.

## Q8 — Ashfall Stage 6 atmosphere
- **(1) Intended purpose:** Night that reads as night + stars, dawn/dusk grading, staggered evening lights; weather + sun-follow shading are stretch, not promised.
- **(2) Current implementation:** None. Stage 1 found: night reads as overcast day at full uNight (0.55 cap); all 29 houses lit 19:30–21:30 every evening; no stars, weather, or dawn/dusk grading; baked SUN_SHADE fixed northwest-high while the sky sun moves.
- **(3) Dependencies:** Stage 5 landing.
- **(4) What remains unfinished:** The whole stage, one verified-live build.
- **(5) Responsible files/modules:** `sky.ts`, `houseFx.ts`, `townLook.ts`, `Engine3DWorldView.tsx`.
- **(6) How it will be tested:** tsc/asserts/sim + phone probe at night, dawn, and dusk.
- **(7) Completion:** Live-verified build with readable night + stars + dawn/dusk grading + staggered lights.

---

# Standing decisions / open blockers

## S1 — Stone house replacement in 3D — BLOCKED
- **(1) Intended purpose:** Replace ALL 3D houses with the user's stone house model (FBX + colour/normal/metallic/roughness), remove old houses, textures preserved (no white/tan).
- **(2) Current implementation:** None. User order 2026-10-28 17:09; verified same day: `public/sprites/3d-house-sprites/` contains only a README.md (939 bytes), no FBX/textures/zip anywhere in workspace or user files; no download link arrived. (Repo root holds the 20 existing FBX house models — those are the old houses, not the stone house.) Loader note: `fbxHouseModels.ts` forces the shared atlas onto every material and packs positions+colour only, so normal/metallic/roughness maps have no effect; the stone build must point the loader at the stone house's own colour texture.
- **(3) Dependencies:** User supplies the zip/link.
- **(4) What remains unfinished:** Everything, once files arrive. Must preserve the 982 bank list.
- **(5) Responsible files/modules:** `public/sprites/3d-house-sprites/`, `src/game/engine3d/fbxHouseModels.ts`.
- **(6) How it will be tested:** Absence verified 2026-10-28; after arrival, stone house renders in 3D with its own textures, all old houses replaced, old models removed.
- **(7) Completion:** Stone house renders in 3D with its own textures, all old houses replaced, old models removed.

## S2 — 684 sim crash — BLOCKED
- **(1) Intended purpose:** `scripts/simulate.ts` must run to completion; ~1,000 sim lines after the crash point are unverified.
- **(2) Current implementation:** None (fix). `assetMetaFor` returns null for 5 variants (Rig684 asserts in `simulate.ts` L10213+); every build's sim comparison since reports "same known 684 rig crash" with normalized logs identical and 0 FAIL *before* the crash. This audit did not run the sim — per the dated logs and the task brief.
- **(3) Dependencies:** User decision to prioritize (listed as "remaining candidate, NOT ordered").
- **(4) What remains unfinished:** Fix the 5 missing asset metas (or the rig assembly), then run the full sim.
- **(5) Responsible files/modules:** `scripts/simulate.ts`, `src/game/buildingRig.ts`.
- **(6) How it will be tested:** `simulate.ts` exits 0 with the post-684 sections asserting.
- **(7) Completion:** `simulate.ts` exits 0 with the post-684 sections asserting.

## S3 — Project Zomboid files disposition
- **(1) Intended purpose:** Decide what happens to the PZ files (user's files, disposition unknown).
- **(2) Current implementation:** None. MEMORY.md queue line only ("Remaining standing decisions: PZ disposition"). PZ itself is a design reference only, no reusable code (2026-10-14 living-world vision). No PZ-files decision record found in the sources searched.
- **(3) Dependencies:** User instruction.
- **(4) What remains unfinished:** The decision itself.
- **(5) Responsible files/modules:** Unknown (not located).
- **(6) How it will be tested:** n/a (decision).
- **(7) Completion:** User states keep / delete / archive, and it is done.

## S4 — Syrinscape installer disposition
- **(1) Intended purpose:** Decide the Syrinscape installer disposition.
- **(2) Current implementation:** None. MEMORY.md queue line only. No further record found in the sources searched (no file location, no user instruction).
- **(3) Dependencies:** User instruction.
- **(4) What remains unfinished:** The decision itself.
- **(5) Responsible files/modules:** Unknown.
- **(6) How it will be tested:** n/a (decision).
- **(7) Completion:** User states the disposition and it is done.

## S5 — Dungeon loot transfer
- **(1) Intended purpose:** Decide whether/how loot moves between the Stone Soup dungeon mini-game and the main game.
- **(2) Current implementation:** None. MEMORY.md queue line only; Stone Soup is a separate mini-game by design (`stoneSoupEngine.ts` + `StoneSoupDungeon.tsx`).
- **(3) Dependencies:** User decision on whether transfer should exist at all.
- **(4) What remains unfinished:** Decision, then implementation if ordered.
- **(5) Responsible files/modules:** `src/game/stoneSoupEngine.ts`, `src/game/StoneSoupDungeon.tsx`.
- **(6) How it will be tested:** n/a until ordered; then a looted item demonstrably lands in the main inventory with stats intact.
- **(7) Completion:** User decision recorded; if transfer is ordered, a looted item demonstrably lands in the main inventory with stats intact.

## S6 — Town-invasion raid variant
- **(1) Intended purpose:** A raid variant that enters the town (vs. raids staying at the town edge).
- **(2) Current implementation:** None, by decision. MEMORY.md standing rule: "town-invasion raid variant NOT built (raids stay at the town edge per 917 placement rules, pending user approval)."
- **(3) Dependencies:** User approval.
- **(4) What remains unfinished:** Approval, then build.
- **(5) Responsible files/modules:** Raid placement (BUILD 917 rules — file not located by this audit).
- **(6) How it will be tested:** n/a until approved; then verified live.
- **(7) Completion:** User approves and the variant ships verified, or the user confirms edge-only raids stand.

## S7 — 983 house-setback layout change
- **(1) Intended purpose:** A layout change to house setbacks originating in/around BUILD 983.
- **(2) Current implementation:** None. MEMORY.md queue line only ("983 house-setback layout change (user's call, NOT authorized)"). No setback specification found in the sources searched (BUILD 984 removed the 983 castle backdrop; that is a different change).
- **(3) Dependencies:** User decision.
- **(4) What remains unfinished:** The decision.
- **(5) Responsible files/modules:** Town layout (BUILD 983 area).
- **(6) How it will be tested:** n/a until authorized.
- **(7) Completion:** User authorizes (or rejects) the setback change explicitly.

## S8 — Even-width hut door-draw offset
- **(1) Intended purpose:** Even-width huts draw the door at the hut centre, 0.5 tiles off the door-tile centre (odd-width huts align exactly); standing at a door tile in first person looks 0.5 off the drawn door.
- **(2) Current implementation:** None (fix). `~/memory/2026-11-01.md` L135, L143 — pre-existing since 983, NOT introduced/fixed in 992; Enter/trigger/exit math untouched and correct. Fix = move drawn 3D doors to their door tiles. One-tap option offered to the user (widget-f89e3798); no answer at flush time.
- **(3) Dependencies:** User approval (touches the standing doors/paths quality bar, T3).
- **(4) What remains unfinished:** Approval, then the door-rendering alignment change.
- **(5) Responsible files/modules:** 3D door rendering in `Engine3DWorldView.tsx` / hut rendering.
- **(6) How it will be tested:** Quirk measured (0.5-tile offset); after fix, drawn doors align with door tiles on even- and odd-width huts; trigger/exit/path agreement re-verified.
- **(7) Completion:** Drawn doors align with door tiles on even- and odd-width huts; trigger/exit/path agreement re-verified.

## S9 — Options button covering smith Leave button
- **(1) Intended purpose:** The fixed top-right Options button must not cover the Leave button in smith dialogue.
- **(2) Current implementation:** None (fix). Observed BUILD 1010; untouched, out of scope so far. The closest record found is the 1017 limits note (`~/memory/2026-11-06.md`): "the Options button (fixed, top-right) covers the view's Exit 3D button (same corner) — the user exits 3D via Options → mode switch, as before" — observed pre-existing overlap, untouched and out of scope. A separate smith-Leave-button record was not located; the two may be the same top-right overlap class.
- **(3) Dependencies:** A build scoped to the Options/button-stack layout.
- **(4) What remains unfinished:** Fix + phone proof that Leave is tappable with Options open.
- **(5) Responsible files/modules:** Options dialog / HUD button cluster.
- **(6) How it will be tested:** On a physical phone viewport, Leave is visible and tappable.
- **(7) Completion:** On a physical phone viewport, Leave is visible and tappable.

## S10 — Inn / store / smith mechanics
- **(1) Intended purpose:** Give the inn, general store, and blacksmith actual mechanics (sleep/shop/smithing), not just buildings.
- **(2) Current implementation:** None. User order 2026-11-06 12:05: "inn/shop/blacksmith buildings only"; BUILD 1015 shipped them as buildings only, "code mechanics later" per the user. Stage 4/5 plan repeats: "No mechanics (inn/store/smith stay shells)."
- **(3) Dependencies:** User order to build mechanics; §48.6/§48.9 systems (G11/G12).
- **(4) What remains unfinished:** Mechanics design + implementation.
- **(5) Responsible files/modules:** `src/game/engine3d/townAdditions3d.ts` (buildings), `tavern.ts`, shop/smith systems (2.5D-origin).
- **(6) How it will be tested:** Buildings render (1015 phone proof — done); mechanics tested live once ordered.
- **(7) Completion:** User orders mechanics; each mechanic works in 3D and is verified live.

## S11 — Chicken swarm / eggs
- **(1) Intended purpose:** Chickens that swarm (Zelda-style) and/or lay collectable eggs.
- **(2) Current implementation:** None. BUILD 1016 shipped chickens as ambient town wildlife (cap 5, roam 64 from plaza, session-only, wander + peck, no attack target, not a mechanic). The 1016 brief states explicitly: "no egg-laying, no collecting, no picking them up — none of that was asked for… If the user wants the swarm later, that's a separate order."
- **(3) Dependencies:** User order.
- **(4) What remains unfinished:** Swarm behaviour and/or egg mechanics, if ordered.
- **(5) Responsible files/modules:** `src/game/engine3d/animals.ts`.
- **(6) How it will be tested:** 1016 ambient behaviour verified live (done); swarm/eggs tested live if ordered.
- **(7) Completion:** User orders it; swarm/eggs demonstrably work in 3D.

## S12 — Longer post-tired sprint bursts
- **(1) Intended purpose:** Decide the numbers for longer sprint bursts after the tired state.
- **(2) Current implementation:** None (decision). BUILD 1021 shipped the tired-state fix (micro-slide stall + level rearm gate; numbers unchanged: 3.15/5.04 u/s, drain 20/s, regen 12/s, floor 0, relock 25; 1026 kept them). **No distinct "longer post-tired bursts" decision record was located in the sources searched** — reported as unlocated, not assumed.
- **(3) Dependencies:** User/parent numbers decision.
- **(4) What remains unfinished:** Locate or make the decision; implement if ordered.
- **(5) Responsible files/modules:** `src/game/engine3d/sprint.ts`, `playerStep.ts`.
- **(6) How it will be tested:** 1021/1026 sprint behaviour verified live with the current numbers (done); new numbers tested live if ordered.
- **(7) Completion:** A recorded numbers decision + a build shipping it.

## S13 — Moving the road crates (102,120) / (100,122) / (102,141)
- **(1) Intended purpose:** Whether the three crates pinning the north road should be moved.
- **(2) Current implementation:** None (move). 1018: crate at (102,141) pinned the player silently — fixed by clearing the tap target with "Path blocked"; crate NOT moved (layout decision, not ordered). 1020: crate at (102,120) stopped sprint dead — fixed with perpendicular slide; crates NOT moved. 1021: micro-slide stall against a crate fixed in code.
- **(3) Dependencies:** User order to move them.
- **(4) What remains unfinished:** Nothing unless the user orders the move.
- **(5) Responsible files/modules:** Town layout / crate placement.
- **(6) How it will be tested:** Slide/clear behaviour verified live in 1018/1020/1021 (done).
- **(7) Completion:** User orders a move, or confirms they stay.

## S14 — Build panel scroll — physical-iPhone confirmation
- **(1) Intended purpose:** Build panel must scroll fully on phone touch (catalog, Remove/Move, Saved chunks, Custom upload).
- **(2) Current implementation:** 995 had built a scrollable catalog list; user reported it not scrollable on his phone; the 1001 agent was to reproduce on a phone viewport with touch drag. **The 1001 outcome record was not read in this audit** (1001 falls in the 944–1029 shipped range, but no 1001-specific live result was verified). Status by this audit: implemented but unverified; physical-iPhone confirmation specifically is the open caveat.
- **(3) Dependencies:** A physical iPhone check (headless Chromium is not the user's phone).
- **(4) What remains unfinished:** Confirm on the user's iPhone that the whole panel scrolls, incl. nested catalog vs panel scroll.
- **(5) Responsible files/modules:** Build panel / catalog.
- **(6) How it will be tested:** Headless only, as far as established; iPhone touch-drag confirmation outstanding.
- **(7) Completion:** User's iPhone confirms full-panel touch scroll.

## S15 — Timer-side stale-path guard (999 follow-up)
- **(1) Intended purpose:** A stale-path guard on the timer side, following BUILD 999.
- **(2) Current implementation:** Unverified. BUILD 999 shipped (commit ca9a2578) + live-confirmed 2026-11-02 18:24 MST. **No distinct "timer-side stale-path guard" follow-up record was located in the sources searched.**
- **(3) Dependencies:** Locate the follow-up spec.
- **(4) What remains unfinished:** Confirm whether the guard exists or is still open.
- **(5) Responsible files/modules:** Timer/path code (BUILD 999 area).
- **(6) How it will be tested:** 999 live-verified (done); guard located and asserted, or recorded as still open.
- **(7) Completion:** The guard is located and asserted, or recorded as still open.

## S16 — Seamless horizon rework
- **(1) Intended purpose:** A truly seamless horizon (no visible line where sky meets ground).
- **(2) Current implementation:** None. 1003/1007 limits (`~/memory/2026-11-02.md`): "first-person horizon seam — pale haze ground meets sky at eye level with a soft visible line, because the 983 sky gradient is screen-space (50% blend at screen centre) rather than horizon-anchored… a truly seamless horizon needs the sky gradient reworked to direction-based (out of scope)."
- **(3) Dependencies:** A build scoped to direction-based sky.
- **(4) What remains unfinished:** The rework, if ordered.
- **(5) Responsible files/modules:** `src/game/engine3d/sky.ts`, ground/far-ring rendering.
- **(6) How it will be tested:** Seam observed and documented (done); after fix, no visible horizon line at any zoom/first-person pitch.
- **(7) Completion:** Direction-based sky gradient; no visible horizon line at any zoom/first-person pitch.

## S17 — Grass wind sway
- **(1) Intended purpose:** Grass swaying in the wind.
- **(2) Current implementation:** None. `grassTufts.ts` has no wind/sway term found in spot-check. Never ordered.
- **(3) Dependencies:** User order.
- **(4) What remains unfinished:** Design + implementation, if ordered.
- **(5) Responsible files/modules:** `grassTufts.ts`.
- **(6) How it will be tested:** n/a until ordered; then visual check + FPS re-measurement.
- **(7) Completion:** Grass sways visibly with no FPS regression, if ordered.

## S18 — Placement costs
- **(1) Intended purpose:** Costs for placing things in Build mode (wood/stone/gold sinks).
- **(2) Current implementation:** None. Palette cost is FREE by the 984 rule ("future decision") — so this is a deferred decision, not a bug. Wood has NO sink in 3D (Build palette is free).
- **(3) Dependencies:** User decision on costs.
- **(4) What remains unfinished:** Cost design + implementation, if ordered.
- **(5) Responsible files/modules:** `placements.ts`, Build palette.
- **(6) How it will be tested:** n/a until ordered.
- **(7) Completion:** Costs ship as a verified build if ordered; otherwise stays explicitly pending.

## S19 — Full 2.5D NPC sim in 3D
- **(1) Intended purpose:** The full 2.5D NPC simulation (needs, memories, relationships, jobs, economy participation) running in 3D.
- **(2) Current implementation:** None as "full sim in 3D". NPC systems exist (`villageLife.ts`, `townsfolk3d.ts`) but a "full sim in 3D" claim is not evidenced (see G7 — 3D NPCs have schedules and movement, explicitly no needs/memories/relationships/economy).
- **(3) Dependencies:** User order; G7/G12/G15 foundations.
- **(4) What remains unfinished:** Design + implementation, if ordered.
- **(5) Responsible files/modules:** `townsfolk3d.ts`, `villageLife.ts`.
- **(6) How it will be tested:** n/a until ordered.
- **(7) Completion:** Full NPC sim demonstrably running in 3D, if ordered.

## S20 — Swimming / fishing / boats
- **(1) Intended purpose:** Swimming, fishing, and boats on the water.
- **(2) Current implementation:** None in 2D or 3D. 1027's 2D audit found NO swimming/fishing/boats in 2D either (boat route explicitly "future"); water is blocking-only. Explicitly pending — do not invent.
- **(3) Dependencies:** User order; water mechanics design.
- **(4) What remains unfinished:** Everything, if ordered.
- **(5) Responsible files/modules:** Water mechanics (none exist).
- **(6) How it will be tested:** n/a until ordered.
- **(7) Completion:** Each ships as a verified build if ordered; otherwise stays explicitly pending.

## S21 — BUILD 707 (NPC smoothing / village chop)
- **(1) Intended purpose:** Fix frame-rate collapse ("walking chops") near Mosslight village by smoothing NPC positions between updates (NPCs updated 8×/s vs 60fps screen).
- **(2) Current implementation:** Announced 2026-10-15 ~05:48 UTC as the fix; **UNVERIFIED** — the release is not corroborated (play link was truncated in the announcement) — treat 707 as announced, not shipped, until a fresh play link confirms it. (MEMORY.md fix log.)
- **(3) Dependencies:** A fresh play link / live check.
- **(4) What remains unfinished:** Live confirmation or re-ship.
- **(5) Responsible files/modules:** NPC update/render path.
- **(6) How it will be tested:** Served marker + phone proof that walking near Mosslight no longer chops.
- **(7) Completion:** Served marker + phone proof that walking near Mosslight no longer chops.

## S22 — 945 iso tree anchor gap + Rodwan tree paint
- **(1) Intended purpose:** Fix the iso tree anchor gap (945) and prove 2D Rodwan tree painting.
- **(2) Current implementation:** Announced; the Rodwan tree build left the pre-existing iso anchor gap unchanged with 2D tree paint unproven (alignment synthesis + MEMORY.md queue context).
- **(3) Dependencies:** A fresh verification pass.
- **(4) What remains unfinished:** Prove the anchor gap is closed and 2D tree paint works, or re-fix.
- **(5) Responsible files/modules:** Iso tree rendering (`IsoFieldView.tsx`, `isoSprites.ts` area).
- **(6) How it will be tested:** Phone/headless proof of correct anchors + painted Rodwan trees.
- **(7) Completion:** Phone/headless proof of correct anchors + painted Rodwan trees.

## S23 — Tree visual/collision misalignment (non-starting chunks)
- **(1) Intended purpose:** Generated tree visuals must align with their collision in every chunk.
- **(2) Current implementation:** None (fix). Open bug found 2026-09-30, unasked: `fieldTreesFor` returns field-unit coords 0..140 but the renderer uses raw %; even starting-perimeter trees off ~6% / ~8 units. Offered to fix; awaiting user decision.
- **(3) Dependencies:** User decision.
- **(4) What remains unfinished:** The fix, if ordered.
- **(5) Responsible files/modules:** Field tree helpers + renderer.
- **(6) How it will be tested:** Misalignment measured 0 after fix.
- **(7) Completion:** User decides; misalignment measured 0.

## S24 — Zoom-out black screen
- **(1) Intended purpose:** Zooming out must not make textures disappear and the screen turn black.
- **(2) Current implementation:** None (fix). Open issue 2026-10-12 17:55 UTC: zooming too far out makes textures disappear and the screen turn black (screenshot sent). Unresolved. BUILD 608 added a low-detail zoom-out path after a max-zoom lag report, but this report is separate.
- **(3) Dependencies:** A repro + a build scoped to the zoom/far-plane path.
- **(4) What remains unfinished:** Repro + fix + phone proof at max zoom.
- **(5) Responsible files/modules:** Zoom/far-plane path.
- **(6) How it will be tested:** Phone proof at max zoom.
- **(7) Completion:** Repro + fix + phone proof at max zoom.

## S25 — Roads behind houses after BUILD 690
- **(1) Intended purpose:** Roads render in front of / aligned with houses and entrances/paths (not behind houses, not reversed).
- **(2) Current implementation:** Unverified. Open issue 2026-10-14 ~04:05 UTC: after the Mosslight rebuild (BUILD 690), roads render behind houses and entrances/paths look reversed. Attributed to stale cached house art on the phone; BUILD 690 adds `?v=` cache-busting on every art file. Awaiting user confirmation after a fresh load.
- **(3) Dependencies:** User confirmation after a fresh load.
- **(4) What remains unfinished:** Confirmation, or a fresh repro.
- **(5) Responsible files/modules:** House art / road rendering.
- **(6) How it will be tested:** User confirms, or a fresh repro.
- **(7) Completion:** User confirms, or a fresh repro.

## S26 — Legacy codebase audit (§52 FINAL COMMAND)
- **(1) Intended purpose:** Audit the entire codebase, map every 2D/2.5D file to its actual dependencies, classify A–E, extract reusable logic before removing, establish the clean 3D architecture.
- **(2) Current implementation:** DONE 2026-11-07 ~15:00 PST (read-only subagent; `~/workspace/verify-legacy/LEGACY_AUDIT.md`, 37,514 bytes, 230 lines; repo untouched, HEAD 14491c9f; verified directly by the registry author). Method: static import-graph analysis (exact `from '…'` matches), dynamic-import scan, `localStorage` key scan, asset-path reference scan, `scripts/` + `tests/` importer scan. Scope: every source file under `src/` (248 `.ts/.tsx` files + supporting files), `public/` asset dirs, `package.json` dependencies, `scripts/simulate.ts`, `tests/`, build config, save keys. Counts: A 47 (45 `.ts/.tsx` + 2 CSS), B 104, C 56, D 41 code + 2 assets, E 2 code + 3 root server `.js` + asset dirs. Wave 1 (unambiguous dead, 8 code + 2 assets): `engine3d/Engine3DView.tsx`, `engine3d/fbxHouseModels.ts` (imports `three`, which is NOT in package.json or node_modules; its job is done by `customAssets.ts`'s direct GLB parser), `src/types/three-fbx.d.ts`, `iso/boundedCache.ts` + `iso/frameMetrics.ts` shims, `dev/worldEventBus.ts` + `worldDevHistory.ts` + `worldHealthMonitor.ts` (test-only), `public/manaseed/` (unused since BUILD 380), `public/v2.5.5.html`. Wave 2 (10 orphaned utilities, sim-only — kept alive only by dynamic imports in `scripts/simulate.ts`). Wave 3 (23, CONTESTED — complete but never wired in: ecosystem cluster, WFC worldgen cluster, lore/quest-gen, bosses/companions/taming/npcArchetypes — deletion is a user product decision, not routine cleanup). Headline finding: the 3D game is NOT the game that ships today (see R6). 12 duplicate systems: three renderers, two stamina models, two interiors, two ground-detail, two worldgen, two minimaps, two character-art, two NPC-sims, two save systems. Top extraction priorities: `townsfolk.ts` NPC roster/target slice, `worldCore.ts` clock, one tile-A* core from the three live pathfinders (`npcNavigation` / `townsfolk3d.planPathNpc` / 1030 `playerPath`), combat stack, quest stack, items/economy, one canonical worldgen, unify the two stamina models, unify 2.5D + `ag-3d-*` saves, shared engine utils.
- **(3) Dependencies:** Audit completion (done); git write for any removal.
- **(4) What remains unfinished:** Wave 1 removal (11-step §52 procedure, git checkpoint, tsc + build + sim + phone probe) once git can write; Wave 3 needs explicit user approval per cluster; extraction priorities 1–3 before any B/C removal.
- **(5) Responsible files/modules:** (pending) `~/workspace/verify-legacy/LEGACY_AUDIT.md`.
- **(6) How it will be tested:** A–E classification published with dependency evidence per file.
- **(7) Completion:** Audit published (done). Removal phase: only verified-D files removed, with 3D still passing tsc + sim + phone probe after each removal (see R6).

---

# Standing rules

## T1 — Skills earn XP only from real actions
- **(1) Intended purpose:** Skills earn XP from real successful actions, level up, appear in the UI, and survive save/load — and long-term skills must interact with the world (mining actual ore, chopping persistent trees, fishing in real water, gathered resources feeding crafting). Honesty rule: never award XP for clicks or menu opens, and never invent a crafting/fishing/mining system when the underlying gameplay doesn't exist yet — leave that XP integration explicitly pending.
- **(2) Current implementation:** Mining (E-key rock, +1 stone) and chopping (E-key tree, +2 wood) exist as actions; the full skill-XP-world loop is not evidenced as complete. See G14.
- **(3) Dependencies:** G14, G20 (world interaction), save/load.
- **(4) What remains unfinished:** XP demonstrably awarded only for real actions, visible in UI, surviving save/load.
- **(5) Responsible files/modules:** Skills system, `placements.ts`/harvest paths.
- **(6) How it will be tested:** XP awarded only for real actions, visible in UI, surviving save/load.
- **(7) Completion:** XP demonstrably awarded only for real actions, visible in UI, surviving save/load.

## T2 — Everything added goes in the Build menus
- **(1) Intended purpose:** Standing rule (2026-11-07): everything added to the game goes in the Build menus from now on.
- **(2) Current implementation:** Followed since: Rock (1025), Water (1027), Wall (1028) all got palette entries; 1025's palette-gap audit found inn/smith/store missing (fixed in 1029).
- **(3) Dependencies:** Every future addition.
- **(4) What remains unfinished:** Ongoing — every future addition ships with a palette entry; palette-gap audit re-run per build.
- **(5) Responsible files/modules:** Build palette (`Engine3DWorldView.tsx:1315+`, `templates.ts` PALETTE_KINDS).
- **(6) How it will be tested:** Palette-gap audit per build.
- **(7) Completion:** Ongoing — every future addition ships with a palette entry.

## T3 — Doors and paths must line up
- **(1) Intended purpose:** Standing quality bar (2026-10-14, town rebuild): every house's painted door, door trigger, exit point, and path endpoint (including building exits and entrances) must all agree.
- **(2) Current implementation:** Quality bar in force. The even-width door offset (S8) is a known live violation.
- **(3) Dependencies:** House placement, door rendering, interior/exterior transitions.
- **(4) What remains unfinished:** The bar holds on every build; the 992 quirk (S8) resolved.
- **(5) Responsible files/modules:** `interiors.ts`, door rendering, path endpoints.
- **(6) How it will be tested:** Per-build door/path agreement check.
- **(7) Completion:** The bar holds on every build; the 992 quirk resolved.

## T4 — Never ship guess-builds
- **(1) Intended purpose:** Standing process directive (2026-10-03): never ship guess-builds for a failing system — trace the full path to the exact failing link first.
- **(2) Current implementation:** Process rule; followed in 1018/1020/1021/1026/1030 traces.
- **(3) Dependencies:** Every build.
- **(4) What remains unfinished:** Ongoing.
- **(5) Responsible files/modules:** Process only.
- **(6) How it will be tested:** Each build report names the exact failing link before the fix.
- **(7) Completion:** Ongoing.

## T5 — No traditional RPG level scaling
- **(1) Intended purpose:** Standing rule (2026-09-28 master prompts): no traditional RPG level scaling — natural danger zones instead.
- **(2) Current implementation:** Rule only; danger zones exist via monster regions. No scaling system to remove.
- **(3) Dependencies:** Every RPG system (G10/G11/G15).
- **(4) What remains unfinished:** Ongoing — no scaling introduced.
- **(5) Responsible files/modules:** Rule only.
- **(6) How it will be tested:** No scaling introduced in any build.
- **(7) Completion:** Ongoing — no scaling introduced.

## T6 — Play link with every finished build
- **(1) Intended purpose:** Include the game's play link every time a build is finished.
- **(2) Current implementation:** Every landed build report in the dated logs carries `https://jaydonweircontracting-ux.github.io/Adventure-game-/?v=NNNN`.
- **(3) Dependencies:** Every build report.
- **(4) What remains unfinished:** Nothing — ongoing.
- **(5) Responsible files/modules:** Build reports.
- **(6) How it will be tested:** Each report checked for the link.
- **(7) Completion:** Ongoing.

---

# Environment blockers

## E1 — Git cannot write (EPERM)
- **(1) Intended purpose:** Local git must be able to commit and push so verified work lands on origin/main and deploys.
- **(2) Current implementation:** Broken. Git cannot write: `git add` fails ("fatal: unable to write loose object file: Operation not permitted"); `git status` fails on `index.lock` (the lock file does NOT exist — git cannot even CREATE it); even `git config --global` fails. Root cause (proven by strace): git opens its temp object file `.git/objects/ce/tmp_obj_*` with `O_RDWR|O_CREAT|O_EXCL, 0444` (succeeds), then `write()` returns **-1 EPERM**. The 0444 (read-only) mode blocks the write on this overlayfs. Shell writes that succeed are only bash builtins (`echo`/`printf`); external binaries (git, python, `dd`) have their `write()` calls EPERM'd or silently dropped to 0 bytes. `muse.write`/`muse.edit` (runtime file API) work reliably. Remote verified read-only: `git ls-remote origin main` = `14491c9f` (BUILD 1029). HEAD == origin/main == `14491c9f`. **No 1030 commit exists.**
- **(3) Dependencies:** Environment recovery (likely next deployment/VM replacement).
- **(4) What remains unfinished:** Retry commit + push when the restriction clears; do NOT waste cycles retrying the same failing command in a loop. Re-tested 2026-11-07 ~14:48 PST: still failing.
- **(5) Responsible files/modules:** Environment (overlayfs), not the repo.
- **(6) How it will be tested:** `git status` succeeds; a commit + push of 1030 lands on origin/main.
- **(7) Completion:** Git writes work again; 1030 commit exists on origin/main.

## E2 — Chromium will not launch (SIGTRAP)
- **(1) Intended purpose:** Playwright + Chromium must launch for phone probes (L3 quality gate).
- **(2) Current implementation:** Broken. Chromium will not launch (SIGTRAP ~100ms after launch; 8 variants tried; the binary itself works but Playwright's launch dies; the 1028 probe used the same Chromium successfully earlier on 2026-11-07).
- **(3) Dependencies:** Environment recovery.
- **(4) What remains unfinished:** Retry the probe when Chromium launches again; probe script ready (`~/workspace/verify1030/probe1030-after.mjs`).
- **(5) Responsible files/modules:** Environment (Playwright/Chromium), not the repo.
- **(6) How it will be tested:** `probe1030-after.mjs` runs with 0 page errors.
- **(7) Completion:** Phone probe passes with 0 page errors.

## E3 — Local vite build impossible
- **(1) Intended purpose:** Local production builds must work for pre-deploy verification.
- **(2) Current implementation:** Broken. Each process gets a ~766-call `copy_file_range` budget, then EPERM on writes — `vite build` cannot copy the 31,507-file `public/` dir. GitHub Actions deploy builds are unaffected.
- **(3) Dependencies:** Environment recovery.
- **(4) What remains unfinished:** Retry a local build when the restriction clears; until then, rely on the GitHub Actions deploy build + served-marker verification.
- **(5) Responsible files/modules:** Environment, not the repo.
- **(6) How it will be tested:** `npm run build` completes locally.
- **(7) Completion:** Local build completes; or formally accept Actions-only builds.

---

# Counts per status (88 requirements total)

| Status | Count | IDs |
|--------|-------|-----|
| COMPLETE AND VERIFIED | 4 | D12, Q0, S26, T6 |
| IMPLEMENTED BUT UNVERIFIED | 15 | G1, G3, G4, G5, G7, G9, G16, G20, D1, D9, Q1, S14, S21, S22, S25 |
| PARTIALLY IMPLEMENTED | 21 | G2, G10, G15, G18, D2, D3, D4, D5, D10, D11, R1, R2, R4, R6, R8, R9, R13, T1, T2, T3, T4 |
| DOCUMENTED ONLY | 9 | D6, D8, R3, R5, R7, R10, R11, R12, T5 |
| NOT IMPLEMENTED | 34 | G8, G11, G12, G13, G14, G17, G19, D7, Q2, Q3, Q4, Q5, Q6, Q7, Q8, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S15, S16, S17, S18, S19, S20, S23, S24 |
| BLOCKED | 5 | S1, S2, E1, E2, E3 |
| OBSOLETE OR DUPLICATED | 0 | (overlaps flagged below, not yet adjudicated) |

**Reading the counts:** only 4 of 88 requirements are complete and verified. 34 are not implemented at all — but most of those are future work by design (§56/§58 engines, Stages 2–6, 3D ports of 2D systems) or items awaiting a user decision (S3–S13, S15–S20, S23–S24), not oversights. The game itself is playable and verified through 1029; the gap is depth (quests, economy, dungeons, skills, audio, minimap) and the development machinery (ACEE, AGEE, RUN, gates evidence), not the core loop. The single most consequential number is 15 IMPLEMENTED BUT UNVERIFIED — code that exists but has never been confirmed live, including the whole 1030 build.

# Top 10 highest-priority incomplete items (by impact per credit)

1. **Land BUILD 1030 (Q1).** Code is done and code-verified; only the environment blocks it. Landing it unblocks the entire queue (1031 → 1032 → Stages 2–6) and proves the pipeline still works. Cost: one retry when git/Chromium recover.
2. **BUILD 1031 blue squares (Q2).** A user-reported, code-confirmed bug with a known fix pattern (subdivide like 1008/1027). Small, scoped, high user-visible value.
3. **BUILD 1032 interior invisible walls (Q3).** A user order with a code-confirmed cause. Small, scoped, high user-visible value.
4. **Move `studio/` + `studio/dashboard/` into the repo and wire the dashboard to the JSON (D2, D9, R8).** One commit once git works. Kills the hard-coded dashboard and the single-copy memory-loss risk (MEMORY.md already truncated once).
5. **Fix or formally accept the 684 sim crash (S2).** ~1,000 sim lines unverified on every build; the fix is likely small (5 missing asset metas). If the user won't prioritize it, record it as accepted so the sim comparison stops carrying a known blind spot.
6. **3D minimap (G17).** A standing user request since 2026-10-12; the 2D minimap exists to port; high daily value for navigation.
7. **Version the `ag-3d-*` save keys + migration (G16 gap).** Cheap insurance: one version field + a migration path, before any format change silently corrupts saves.
8. **Ashfall Stage 2 terrain (Q4).** The structural bet of the §48 overhaul (heightfield + shores + stone). High value, high risk — harness-prototype the base-y agreement first, keep the tint+shores+stone fallback.
9. **Reconcile/retire the stale Oct-era autonomous engine + backfill or downgrade the 1016–1029 Level-4 gate claims (D3, D4, D5).** Ledger honesty: cheap (thinking + JSON edits), and it closes the one place where the dashboard currently asserts more than the evidence supports.
10. **Adjudicate the directive overlaps (see below) and rule OBSOLETE/DUPLICATED where warranted.** Prevents building four competing autonomous engines, three dashboards, and three memory/genome systems. Pure Stage A follow-up work — no code.

# Recommended next stage (A–F) order

Per §55, stages overlap only when dependencies are satisfied and changes do not conflict. **Every code landing is gated on E1/E2 clearing** — the practical order right now is: retry the 1030 commit/push when the environment recovers → 1031 → 1032 → Stages 2–6, with the §54 repo move riding along on any landing.

- **Stage A — Foundation (in progress).** This registry; reconcile with the legacy audit (S26) once its deliverable lands; establish the §55 doc set (D7: ENGINE_BIBLE, SYSTEM_MAP, PROJECT_STATE, NEXT_TASK, TEST_STATUS); move `studio/` files into the repo (D2, D9). *Exit: registry + docs live in-repo and maintained.*
- **Stage B — Development infrastructure.** Dashboard wired to repo JSON (D1); gates evidenced per build, historical Level-4 claims backfilled or downgraded (D4, D3); backlog = dashboard JSON, stale Oct-era engine retired or superseded (D5); 684 crash fixed or formally accepted (S2). *Exit: every "verified" claim has evidence; one backlog source of truth.*
- **Stage C — World systems.** 1031, 1032, Ashfall Stages 2–6 (Q2–Q8); 3D minimap (G17) is a candidate to pull forward into this stage given its impact-per-credit. *Exit: terrain, vegetation, architecture, settlements, atmosphere each live-verified.*
- **Stage D — Living world.** NPC-vs-monster combat in 3D (G8), AI adventurers in 3D (G15), full 2.5D NPC sim in 3D if ordered (S19), NPC dialogue/needs/relationships. *Exit: the world visibly lives without the player.*
- **Stage E — Gameplay.** Quests (G11), economy/shops (G12), dungeons (G13), skills/XP (G14), combat consequences (G10), inn/store/smith mechanics if ordered (S10). *Exit: the §48.16 acceptance chain demonstrated live.*
- **Stage F — Polish and optimization.** Device FPS baseline + budgets (G20), audio in 3D (G19), seamless horizon (S16), zoom-out black screen (S24), tree misalignment (S23), BUILD 707 / 945 confirmations (S21, S22), grass sway / placement costs if ordered (S17, S18). *Exit: measured phone baseline; announced-but-unverified items confirmed or re-shipped.*

# Overlaps flagged (not yet adjudicated — no OBSOLETE/DUPLICATED rulings made)

These overlaps are real but were **not** merged or ruled on by this audit; adjudication belongs to Stage A follow-up:

- **Autonomous engines:** §49 (RUN mode) vs §50 (10-minute cycle) vs §53 (autonomous god-tier engine) vs §57 (master orchestrator + recursive development engine). Four descriptions of substantially the same loop.
- **Dashboards:** §50's dashboard vs §53's 10-module "ultimate creation dashboard" vs §54's dashboard repair. One live artifact exists; the other two are designs.
- **Genome / memory:** §56 Development Genome vs §57 advanced memory vs §59 MEMORY CORE vs BUILD 571 "Game Genome" (`scripts/genome.mjs`, stale Oct 12, unrelated purpose). The name collision must not inflate any status.
- **Self-healing / self-improvement:** §52 self-healing codebase vs §53 self-healing code architecture vs §59 self-improving instructions.
- **Docs:** §53's living ENGINE_BIBLE vs the §55 unified doc set (D7).
- **Autonomous QA / gameplay intelligence:** §53 Autonomous QA Players vs §57 automated gameplay intelligence vs §58 player-experience intelligence.
- **2D vs 3D parallel implementations:** quests, shops/economy, dungeons, skills XP, simulated adventurers, bounty/crime, audio, minimap each exist in 2D and are absent in 3D. Per §48 this is an intentional reuse target (port/wire into 3D), not duplication to delete — adjudicate as part of the legacy audit (S26), never by deleting the 2D system first.

# Honest gaps in this audit (what was NOT verified)

1. **No live verification by the auditors** — no game run, no build, no `tsc`, no `simulate.ts`, no browser probe was executed. All test claims cite the dated logs and module headers.
2. **The dashboard artifact was not directly inspected** (no artifact access in the subagent sessions) — D1 rests on project records.
3. **Legacy audit — CORRECTED during this write:** the deliverable landed while the registry was being written and was verified directly by the registry author (ls, wc, head, grep — see Registry corrections). The auditors' original "not found" statements in R6/S26 were superseded before delivery.
4. **"Longer post-tired sprint bursts" (S12) and "timer-side stale-path guard" (S15):** no decision/spec record was located in the sources searched — reported as unlocated, not assumed.
5. **§53 sub-systems** (Genome, Observatory, QA Players, Visual Intelligence Engine, Evolution Ledger, ENGINE_BIBLE): grep spot-checks only, not a full-repo search for each.
6. **MUSE MEMORY CORE** (`/muse/memory/`): not inspected.
7. **The 1001 outcome record** was not read — S14 rests on the brief + the 995/1001 queue context.
8. **Game-systems auditor gaps:** `fbxHouseModels.ts` usage in the 3D view; whether placed `house-shop`/`house-inn` etc. get interiors distinct from generic houses; exact live behaviour of the 1030 player-pathing changes (code present, untested by that auditor).
9. **1016–1025 verification timestamps** in `dashboard-data.json` are midnight placeholders with no run IDs (D3) — their "verified" status rests on narrative, not timestamped evidence.

# Registry corrections (2026-11-07 ~15:00 PST)

- **S26 / R6 corrected after the auditors' reports:** the legacy codebase audit landed while this registry was being written (`~/workspace/verify-legacy/LEGACY_AUDIT.md`, 37,514 bytes, 230 lines). The registry author verified the file directly (ls, wc, head, grep). S26 is now COMPLETE AND VERIFIED (audit only); R6 is now PARTIALLY IMPLEMENTED (audit = step 1 of 7). Counts updated accordingly (see counts table).
- **Headline finding the registry's game sections did not know:** the 3D game is NOT the game that ships today. `GraphicsModeHost.initialMode()` force-writes `'2.5d'` and strips `?mode=`; the 3D demo is reachable only via Options → Graphics Mode → 3D. `Engine3DWorldView` imports only `isoWorld`, `mosslightLayout`, `dayNight`, and a slice of `townsfolk.ts` (worldCore type-only). This reframes §48: the 3D game is a demo today, not the shipped game, and deleting '2D/2.5D' code would delete the game. The G-sections' "NOT IMPLEMENTED in 3D" statuses stand — they are the extraction backlog (B/C), not dead code.
- **Duplicate systems (12) found by the legacy audit:** three renderers, two stamina models, two interiors, two ground-detail, two worldgen, two minimaps, two character-art, two NPC-sims, two save systems. Adjudication candidates for Stage A follow-up (see overlaps list).
- **Correction to G5:** `fbxHouseModels.ts` is verified-dead (Wave 1) — it imports `three`, which is NOT in package.json or node_modules; its job is done by `customAssets.ts`'s direct GLB parser.
- **Correction to the overlaps list:** `public/` is 195 MB / 31,507 files; `public/rpg/` is 129 MB with only ~25 MB verified used — the rest needs a runtime asset trace, not static grep, before any removal.

# Maintenance

- Update this registry at each verified checkpoint. A status changes only with evidence (commit hash, run ID, probe output, served marker).
- Never fabricate a hash, result, build number, or measurement. Label unsupported records as requiring verification (§54 rule).
- Working copy location: `~/workspace/verify-integration/IMPLEMENTATION_REGISTRY.md`. Canonical home once git writes: `<repo>/studio/IMPLEMENTATION_REGISTRY.md` (alongside the §54 dashboard data and the three self-evolution files).
- Next update trigger: BUILD 1030 landing (Q1 → COMPLETE AND VERIFIED, queue advances, dashboard data updated).
