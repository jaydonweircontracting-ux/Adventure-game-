# ASHFALL — PROJECT_STATE

**Version:** 1.0 — 2026-11-07 ~15:08 PST
**Source:** SOUL.md §55 (unify documentation/memory in GitHub). This file is the current project state. It references the dashboard data and the registry; it does not duplicate their full contents.
**Status:** This file is NEW (registry D7 was NOT IMPLEMENTED — zero hits for any of the five named docs before this file).

## Last verified checkpoint

* **BUILD 1029**, commit `14491c9f` — "Saved chunks keep the inn, blacksmith, and general store."
* Live-confirmed 2026-11-07 ~13:40 PST (served version.json 2026-11-07T21:37:14.339Z, run 42416626999, first try).
* Play link: https://jaydonweircontracting-ux.github.io/Adventure-game-/?v=1029

## Active build

* **BUILD 1030** — tap-to-walk pathfinding. Status: IMPLEMENTED (code done + code-verified), NOT shipped, NOT live.
* Code: player A* (new pure module `playerPath.ts`) + NPC pathing fixes (whole-remaining-path validation, `sidestepTile`, `detour` flag). 7 files, uncommitted in the working tree.
* Verification done: tsc clean (agent + parent re-ran `tsc --noEmit`, exit 0); standalone asserts 97 entry + 47 runner checks PASS (agent's run ~15:04); sim vs pristine1029 IDENTICAL (parent verified: norms identical, 0 FAIL, same known 684 rig crash).
* Blocked by: the environment write failure (git EPERM — commit/push blocked) and Chromium SIGTRAP (phone probe blocked). Quality gates: L1/L2 PASSED, L3/L4 NOT RUN.
* Play link (not yet serving 1030): https://jaydonweircontracting-ux.github.io/Adventure-game-/?v=1030

## The queue (in order)

1. **BUILD 1030** — commit + push (blocked on the environment), then phone probe + live verify.
2. **BUILD 1031** — blue-squares fix (wild lakes rendered as whole far cells; subdivide to the lake's actual tiles). Queued after 1030.
3. **BUILD 1032** — house interior invisible walls (boundary collision so enter/exit is only via the Enter/Exit button). Queued after 1031.
4. **Ashfall Stages 2–6** — terrain (heightfield, HIGH risk, harness-prototype first), vegetation, architecture, settlements, atmosphere. One code build per stage, each verified live. Code builds start at Stage 2, after 1032.
5. **Dashboard repair (§54)** — data files created as working copies in `studio/dashboard/` (all JSON validated; commit hashes verified against git log; honesty-gap fix applied 2026-11-07 ~15:05 PST). Move into the repo + wire the dashboard to read from them once 1030 lands and git can write.
6. **Self-evolution files (§59)** — `MUSE_SOUL.md` (v1.0), `MUSE_EVOLUTION.md` (v1.1), `CONTINUE_ASHFALL.md` — created as working copies in `studio/`; they are in the repo's `studio/` now (uncommitted — git cannot write). Keep them updated every meaningful cycle.
7. **Master integration (§55)** — Stage A DONE (the registry, 88 requirements). Stages B–F follow (see `studio/DEVELOPMENT_ROADMAP.md`).
8. **Next evolution layer (§57)** and **game evolution engine (§58)** — future work; implement only what is still missing after the current hour's work is saved and reported.
9. **Legacy codebase audit (§52)** — DONE 2026-11-07 ~15:00 PST. Wave 1 removal once git can write; Wave 3 needs explicit user approval per cluster.
10. **Quantum code evolution machine ACEE (§56)** — future engineering, Phases 1–7, not started.
11. **Stone house replacement** — BLOCKED (package files never arrived).

## What is done (2026-11-07)

* **Directives §47–§59** added to SOUL.md (verbatim). SOUL.md is 9,286 lines.
* **Ashfall Stage 1 audit** DONE (2026-11-07 ~13:50 PST; `~/workspace/verify1030/ASHFALL-STAGE1.md`, 660 lines; repo untouched at 14491c9f). Headline: ground is FLAT (no heightfield), 91.6% uniform grass, ONE tree design for everything (118 crates render as pine trees), all 26 town huts roofAxis='x', interiors bare boxes with sky visible, town is a 61×125 ribbon, 0 generated stalls, night reads as overcast day, world buffer 237k verts town / 266k wild (89% of the 300k budget), rebuild ~165–211ms, live hitch 566.6ms on a 50-tile teleport.
* **Development dashboard** built + live (artifact `ashfall-development-dashboard`, verified 2026-11-07 ~14:16 PST). Shows 1029 as the last verified checkpoint, 1030 in progress, Stage 1 audit, the queue, a filterable build ledger (1016–1032), the Stage 1 baseline, the Stage 2–6 plan, known issues, and the studio section (§47–§50).
* **Three self-evolution files (§59)** created (working copies in `studio/`): `MUSE_SOUL.md` v1.0, `MUSE_EVOLUTION.md` v1.1 (gate-evidence rule added 2026-11-07 ~15:07 PST), `CONTINUE_ASHFALL.md`.
* **Dashboard data files (§54)** created (working copies in `studio/dashboard/`): `dashboard-data.json` (17-entry build history: 14 verified, 1 in progress, 2 planned; last verified 1029/14491c9f; Stage 1 done, Stages 2–6 planned), `dashboard-schema.json`, `README.md`, `MUSE_INSTRUCTIONS.md`, `snapshots/2026-11-07.json`, `history/build-ledger.json` (1016–1032), `history/verification-history.json`, `history/development-history.json` (14 events). All JSON validated. Honesty-gap fix applied 2026-11-07 ~15:05 PST (gate level 4 → 3 for 1016–1029; verifiedAt null for 1016–1025).
* **Legacy codebase audit (§52)** DONE (2026-11-07 ~15:00 PST; `studio/LEGACY_AUDIT.md`, 37,514 bytes, 230 lines). 248 files: A 47, B 104, C 56, D 41 code + 2 assets, E 2 code + 3 server .js + asset dirs. Headline: the 3D game is NOT the game that ships today (GraphicsModeHost always boots 2.5D; Engine3DWorldView has no combat/quests/dialogue/shops/inventory/2.5D-save support). Wave 1 (8 code + 2 assets) removable once git can write; Wave 3 (23) needs explicit user approval per cluster.
* **Master Implementation Registry (§55 Stage A)** DONE (2026-11-07 ~15:02 PST; `studio/IMPLEMENTATION_REGISTRY.md`, 1,016 lines, 145,576 bytes, 88 requirements). Counts: COMPLETE AND VERIFIED 4, IMPLEMENTED BUT UNVERIFIED 15, PARTIALLY IMPLEMENTED 21, DOCUMENTED ONLY 9, NOT IMPLEMENTED 34, BLOCKED 5, OBSOLETE OR DUPLICATED 0.
* **This §55 doc set** created 2026-11-07: `ENGINE_BIBLE.md`, `SYSTEM_MAP.md`, `PROJECT_STATE.md` (this file), `NEXT_TASK.md`, `TEST_STATUS.md`, `DEVELOPMENT_ROADMAP.md`, `DEVELOPMENT_DIRECTIVES.md`, `ARCHITECTURE_DECISIONS.md`, `DASHBOARD_DATA.md`, `BUILD_LEDGER.md`, `VERIFICATION_HISTORY.md`, plus `autonomous-engine/ENGINE.md`, `GOVERNOR.md`, `EVOLUTION_LEDGER.md`.

## Environment blockers

* **E1 — git cannot write (EPERM).** Re-tested 2026-11-07 ~15:04 PST — still blocked, HEAD still `14491c9f`. Blocks all landings (1030 commit/push, the studio files' commit, Wave 1 removal). Recovery: retry when the restriction clears (likely on the next deployment/VM replacement).
* **E2 — Chromium will not launch (SIGTRAP).** Blocks phone probes (the Level 3 gate).
* **E3 — local vite build impossible.** GitHub Actions deploy builds are unaffected.

## Standing decisions awaiting the user's word

Project Zomboid files disposition; Syrinscape installer disposition; dungeon loot transfer; town-invasion raid variant (raids stay at the town edge); the 684 sim crash fix (sim-only); the 983 house-setback layout change; even-width hut door alignment; the phone Options button covering the smith dialogue Leave button; inn/store/smith mechanics (deferred: "code mechanics later"); chicken swarm/eggs; longer post-tired sprint bursts; moving the road crates; physical-iPhone confirmation of Build panel scroll; the timer-side stale-path guard; the seamless horizon rework; grass wind sway; placement costs; full 2.5D NPC sim in 3D; swimming/fishing/boats (none exist — pending, do not invent). Full list: registry S1–S26.

## Where the canonical data lives

* **Dashboard data:** `studio/dashboard/dashboard-data.json` (last verified checkpoint, active build, build queue, build history, quality gates, stage progress, measured baselines, known issues, verification history, directives, teams). Do not duplicate it here.
* **Build ledger:** `studio/dashboard/history/build-ledger.json` (1016–1032, commit hashes verified against git log).
* **Verification history:** `studio/dashboard/history/verification-history.json`.
* **Registry:** `studio/IMPLEMENTATION_REGISTRY.md` (88 requirements, statuses, top 10, stage order, overlaps).
* **Legacy audit:** `studio/LEGACY_AUDIT.md` (248 files, A–E, waves, extraction priorities).
* **Resume point:** `studio/CONTINUE_ASHFALL.md` (the exact next action + the commands to resume).
* **Memory:** `~/MEMORY.md` + the dated logs (`~/memory/2026-11-07.md` and earlier).

## Maintenance

* Update this file at each verified checkpoint and whenever the queue, the blockers, or the done-list changes. A status changes only with evidence.
* Next update trigger: BUILD 1030 landing (last verified checkpoint → 1030, queue advances, active build → 1031).
