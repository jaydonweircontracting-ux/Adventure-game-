# ASHFALL — DEVELOPMENT_ROADMAP

**Version:** 1.0 — 2026-11-07 ~15:08 PST
**Source:** SOUL.md §55 (integration roadmap, Stages A–F) + `studio/IMPLEMENTATION_REGISTRY.md` (the recommended stage order + the top 10) + `studio/CONTINUE_ASHFALL.md` (the build queue). This file is the roadmap. It states the order and the exit criteria. It does not duplicate the registry's full contents or the dashboard's build history.
**Status:** This file is NEW (registry D7 was NOT IMPLEMENTED — zero hits for any of the five named docs before this file).

## The order (from the registry)

Stages overlap only when dependencies are satisfied and changes do not conflict. **Every code landing is gated on the environment recovering (E1 git, E2 Chromium).** The practical order right now is: retry the 1030 commit/push when the environment recovers → 1031 → 1032 → Stages 2–6, with the §54 repo move riding along on any landing.

## Stage A — Foundation (IN PROGRESS)

* The registry (`studio/IMPLEMENTATION_REGISTRY.md`, 88 requirements) — DONE 2026-11-07 ~15:02 PST.
* Reconcile with the legacy audit (`studio/LEGACY_AUDIT.md`) — DONE (the registry was corrected during its write after the legacy audit landed).
* Establish the §55 doc set (ENGINE_BIBLE, SYSTEM_MAP, PROJECT_STATE, NEXT_TASK, TEST_STATUS — this file set, plus DEVELOPMENT_ROADMAP, DEVELOPMENT_DIRECTIVES, ARCHITECTURE_DECISIONS, DASHBOARD_DATA, BUILD_LEDGER, VERIFICATION_HISTORY) — DONE 2026-11-07 (this file set).
* Establish the autonomous-engine doc set (`studio/autonomous-engine/ENGINE.md`, `GOVERNOR.md`, `EVOLUTION_LEDGER.md`) — DONE 2026-11-07.
* Move `studio/` files into the repo (D2, D9) — the files are in the repo's `studio/` now (uncommitted — git cannot write). The commit happens when git can write.
* Adjudicate the directive overlaps (registry, "Overlaps flagged") and rule OBSOLETE/DUPLICATED where warranted — NOT YET DONE. This prevents building four competing autonomous engines, three dashboards, and three memory/genome systems. Pure Stage A follow-up work — no code.
* **Exit:** registry + docs live in-repo and maintained.

## Stage B — Development infrastructure

* Dashboard wired to repo JSON (D1) — the artifact reads from `studio/dashboard/` instead of hard-coded data.
* Gates evidenced per build; historical Level-4 claims backfilled or downgraded (D4, D3) — the downgrade is DONE (2026-11-07 ~15:05 PST: gate level 4 → 3 for 1016–1029; verifiedAt null for 1016–1025). Backfilling real per-build Level-4 evidence (if it exists in the dated logs) is still open.
* Backlog = dashboard JSON; the stale Oct-era autonomous engine retired or superseded (D5).
* 684 crash fixed or formally accepted (S2).
* **Exit:** every "verified" claim has evidence; one backlog source of truth.

## Stage C — World systems

* BUILD 1031 (blue squares), BUILD 1032 (interior invisible walls), Ashfall Stages 2–6 (Q2–Q8).
* 3D minimap (G17) is a candidate to pull forward into this stage given its impact-per-credit (a standing request since 2026-10-12; the 2D minimap exists to port).
* **Exit:** terrain, vegetation, architecture, settlements, atmosphere each live-verified.

## Stage D — Living world

* NPC-vs-monster combat in 3D (G8), AI adventurers in 3D (G15), full 2.5D NPC sim in 3D if ordered (S19), NPC dialogue/needs/relationships.
* **Exit:** the world visibly lives without the player.

## Stage E — Gameplay

* Quests (G11), economy/shops (G12), dungeons (G13), skills/XP (G14), combat consequences (G10), inn/store/smith mechanics if ordered (S10).
* **Exit:** the §48.16 acceptance chain demonstrated live (create a character, explore, encounter adventurers, develop, discover dungeons, participate in the economy, influence the world, save, return, world continued).

## Stage F — Polish and optimization

* Device FPS baseline + budgets (G20), audio in 3D (G19), seamless horizon (S16), zoom-out black screen (S24), tree misalignment (S23), BUILD 707 / 945 confirmations (S21, S22), grass sway / placement costs if ordered (S17, S18).
* **Exit:** measured phone baseline; announced-but-unverified items confirmed or re-shipped.

## The build queue (1030 → 1031 → 1032 → Stages 2–6)

| Build | What | Status | Depends on |
|---|---|---|---|
| 1030 | Tap-to-walk pathfinding (player A* + NPC pathing fixes) | IMPLEMENTED (code done + code-verified; commit/push + phone probe blocked by the environment) | None (first) |
| 1031 | Blue-squares fix (wild lakes rendered as whole far cells; subdivide to the lake's actual tiles) | NOT IMPLEMENTED (queued) | 1030 lands |
| 1032 | House interior invisible walls (boundary collision; enter/exit only via the Enter/Exit button) | NOT IMPLEMENTED (queued) | 1031 lands |
| Stage 2 | Terrain (visual-only heightfield, stronger ground tint, shores, stone used or removed) | NOT IMPLEMENTED (queued) | 1032 lands. HIGH RISK — harness-prototype the base-y agreement first; fallback is tint+shores+stone only. Must re-sync + re-baseline first. |
| Stage 3 | Vegetation (3 tree shapes, bushes non-blocking, crates/stalls stop rendering as trees, grass density re-tested vs FPS) | NOT IMPLEMENTED (queued) | Stage 2 lands |
| Stage 4 | Architecture (roof variety, gardens/fences, interior ceilings + hearth glow; no mechanics) | NOT IMPLEMENTED (queued) | Stage 3 lands |
| Stage 5 | Settlements (market stalls at the plaza, readable districts, 2–3 fixed wild landmarks; second settlement out of scope) | NOT IMPLEMENTED (queued) | Stage 4 lands. Cause of the 0-stall drop is UNVERIFIED — verify before fixing. |
| Stage 6 | Atmosphere (night that reads as night + stars, dawn/dusk grading, staggered evening lights; weather + sun-follow shading are stretch) | NOT IMPLEMENTED (queued) | Stage 5 lands |

One code build per stage, each verified live. The full queue (with test requirements + completion evidence per item) is in `studio/autonomous-engine/ENGINE.md` (the prioritized backlog) and `studio/dashboard/dashboard-data.json` (`buildQueue`).

## Legacy Wave 1 removal (after the queue, or when git can write)

Wave 1 (8 code files + 2 assets, unambiguous dead — see `studio/LEGACY_AUDIT.md` §4.1 + §6): `engine3d/Engine3DView.tsx`, `engine3d/fbxHouseModels.ts`, `src/types/three-fbx.d.ts`, `iso/boundedCache.ts`, `iso/frameMetrics.ts`, `dev/worldEventBus.ts`, `dev/worldDevHistory.ts`, `dev/worldHealthMonitor.ts`, `public/manaseed/`, `public/v2.5.5.html`. Follow the §52 11-step safe-removal procedure (search imports/references, check dynamic imports + runtime references, build scripts/config, tests + asset references, save compatibility, dependencies, Git checkpoint, remove only verified obsolete code, type checks + builds + gameplay tests, confirm 3D still works). Wave 2 (10 sim-only orphaned utilities) follows Wave 1. Wave 3 (23, CONTESTED — complete but never wired in) needs explicit user approval per cluster — it is a product decision, not routine cleanup.

## Standing decisions awaiting the user's word

These are NOT on the roadmap until the user decides (do not build them unilaterally):

* **S1** Stone house replacement (3D) — BLOCKED (FBX package never arrived; only a README in `public/sprites/3d-house-sprites/`).
* **S2** 684 sim crash — BLOCKED (awaiting user word: fix or formal acceptance).
* **S3** Project Zomboid files disposition — awaiting user word; no decision record found.
* **S4** Syrinscape installer disposition — awaiting user word; no decision record found.
* **S5** Dungeon loot transfer — awaiting user word; Stone Soup is separate by design.
* **S6** Town-invasion raid variant — NOT built by decision; raids stay at the town edge pending approval.
* **S7** 983 house-setback layout change — user's call, NOT authorized; no spec found.
* **S8** Even-width hut door-draw offset — 0.5-tile offset measured; fix offered, no answer.
* **S9** Options button covering the smith dialogue Leave button — observed 1010; untouched, out of scope so far.
* **S10** Inn / store / smith mechanics — deferred by explicit user order ("code mechanics later").
* **S11** Chicken swarm / eggs — separate order required; 1016 shipped ambient-only chickens.
* **S12** Longer post-tired sprint bursts — numbers decision record not located.
* **S13** Moving the road crates (102,120)/(100,122)/(102,141) — deliberately not moved; code fixes routed around them.
* **S15** Timer-side stale-path guard (999 follow-up) — follow-up spec not located; 999 itself is live-verified.
* **S16** Seamless horizon rework — screen-space sky gradient is the standing limit; direction-based sky out of scope so far.
* **S17** Grass wind sway — no sway term found; never ordered.
* **S18** Placement costs — palette is FREE by the 984 rule; costs are a deferred decision.
* **S19** Full 2.5D NPC sim in 3D — NPC systems exist; full-sim-in-3D claim not evidenced.
* **S20** Swimming / fishing / boats — none exist in 2D or 3D; explicitly pending, do not invent.
* **S21** BUILD 707 (NPC smoothing / village chop) — IMPLEMENTED BUT UNVERIFIED (announced 2026-10-15; play link truncated; never confirmed).
* **S22** 945 iso tree anchor gap + Rodwan tree paint — IMPLEMENTED BUT UNVERIFIED (announced; anchor gap unchanged, 2D paint unproven).
* **S23** Tree visual/collision misalignment (non-starting chunks) — offered to fix 2026-09-30; awaiting user decision.
* **S24** Zoom-out black screen — reported 2026-10-12, unresolved; BUILD 608 path is a separate report.
* **S25** Roads behind houses after BUILD 690 — IMPLEMENTED BUT UNVERIFIED (attributed to stale cached art; awaiting user confirmation after a fresh load).

Full list with evidence: registry S1–S26.

## What is NOT on this roadmap (future work, after the current hour's work is saved and reported)

* **§57 Next evolution layer** — master orchestrator, recursive development engine, independent verification, benchmarking lab, advanced memory, research engine, tool bus, gameplay/world/visual intelligence, cleanup engine, resource intelligence, health score, continuation protocol. Implement only what is still missing, and only AFTER the current hour's work (the queue) is finished, saved, and an implementation report produced.
* **§58 Game evolution engine AGEE** — world content factory, emergent stories, quest generation/validation, NPC personality/memory, living economy, world history, player-experience intelligence, balancing engine, asset pipeline, population director, content QC, GAME EVOLUTION LAB dashboard section, completion roadmap. Connects the four capabilities (do not create four competing systems).
* **§56 Quantum code evolution machine ACEE** — separate engineering subsystem (Development Genome, code generation machine, multi-agent lab, optimization lab, evolution sandbox, CODE EVOLUTION LAB dashboard interface). Phases 1–7, not started.

## Maintenance

* Update this roadmap when a stage's status changes, a build lands, or a standing decision is resolved. A status changes only with evidence.
* Next update trigger: BUILD 1030 landing (Stage A exit — the studio files commit; the queue advances to 1031).
