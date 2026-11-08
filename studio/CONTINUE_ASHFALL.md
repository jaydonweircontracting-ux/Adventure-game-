# CONTINUE_ASHFALL.md — Exact Persistent Resume Point

**Last updated:** 2026-11-07 ~15:07 PST
**Status:** Working copy. Canonical location (when git can write): version-controlled project storage (`studio/` in the Adventure Game repo). Working copy: `~/workspace/studio/CONTINUE_ASHFALL.md`.
**Purpose:** A fresh Muse session reads this file and continues without the user re-explaining the project.

---

## Current project status

* **Game:** ASHFALL — the Adventure Game repo (https://github.com/jaydonweircontracting-ux/Adventure-game-), deploying via GitHub Pages at https://jaydonweircontracting-ux.github.io/Adventure-game-/. 3D is THE game; 2D/2.5D are no longer development targets (their useful logic/content is reused in 3D).
* **Last verified checkpoint:** BUILD 1029, commit `14491c9f` (saved chunks keep the inn, blacksmith, and general store). Live-confirmed 2026-11-07 ~13:40 PST (served version.json 2026-11-07T21:37:14.339Z, run 42416626999, first try).
* **Active task:** BUILD 1030 — tap-to-walk pathfinding. IMPLEMENTED + CODE-VERIFIED, but NOT shipped and NOT live (see "Known problems" — environment write failure).
* **Directives in force:** SOUL.md §47–§59 (speed, 3D direction, autonomous development, autonomous evolution, ultimate engineering, god-tier engineering, autonomous god-tier, dashboard repair, master integration, code evolution machine, next evolution layer, game evolution engine, Muse self-evolution). SOUL.md is 9286 lines.
* **Dashboard:** Live (artifact `ashfall-development-dashboard`, verified 2026-11-07 ~14:16 PST). Shows 1029 as the last verified checkpoint, 1030 in progress, Stage 1 audit, the queue, a filterable build ledger (1016–1032), the Stage 1 baseline, the Stage 2–6 plan, known issues, and the studio section (§47–§50). Update it at each verified checkpoint via `artifact.edit`.
* **User:** Jaydon Weir, drywall contractor (Penticton, BC). Tests on his iPhone (iOS app). Blunt, literal, outcome-driven. Trust accrues per shipped, verified build, never per claim. Never pitch a paid tier. Include the play link every time a build is finished. Proactive outreach stays OFF (since 2026-10-18); follow-through on ordered work IS owed.

## Current active task

**BUILD 1030 — tap-to-walk pathfinding** (user order 2026-11-07 ~13:42 PST: "When tapping to walk make the npcs and characters path around objects correctly instead of of having to constantly tap when they get stuck on trees and houses and rocks and npcs").

**State:** Implemented + code-verified. NOT committed, NOT pushed, NOT live.

**What was built (7 files, uncommitted in the working tree):**
* NEW `src/game/engine3d/playerPath.ts` — tile A* for the player (reusing `planPathNpc`'s steps) + greedy line-of-sight smoothing to ≤3 waypoints ending exactly on the tap. Constants: replan 500ms, stuck 1500ms, figure-wait 900ms, waypoint-arrive 0.15.
* Modified `src/game/engine3d/Engine3DWorldView.tsx` — tap plans via `planPlayerPath`; draw loop follows waypoints (static-blocked → replan now; figure-blocked → wait ≤900ms then replan with the tile excluded; stuck → replan around the tile ahead). D-pad/keys clear the path and steer directly. Entering a hut clears path + moveTarget.
* Modified `src/game/engine3d/townsfolk3d.ts`, `transients.ts`, `animals.ts` — NPC fixes: whole-remaining-path validation (`pathHasUnwalkableTile`), `sidestepTile`, and a `detour` flag that breaks the head-on ping-pong (head-on pair arrives in 21–22 ticks).
* Modified `scripts/prepare-build-entry.cjs` + `src/App.tsx` — markers at 1030 (both) + the '1030' player-terms note.
* Build-generated `index.html` + `public/version.json` restored byte-exact (hashes match HEAD).

**Verification (done):** tsc clean (agent + parent re-ran `tsc --noEmit`, exit 0). Standalone asserts pass (agent's run: 97 entry + 47 runner checks). Sim vs pristine1029 IDENTICAL (parent verified: norms identical, 0 FAIL, same known 684 rig crash). Pristine worktree `/home/hatch/pristine1029` @ `14491c9f`.

## Recent accomplishments

* BUILD 1029 shipped + verified live (chunk-drop fix: saved chunks keep the inn/smith/store).
* BUILD 1028 shipped + verified live (walls removable + in the Build menu; Sprint as a small ⚡ icon next to Gold).
* BUILD 1027 shipped + verified live (ocean west of town + placeable water).
* Ashfall Stage 1 audit DONE (2026-11-07 ~13:50 PST; `~/workspace/verify1030/ASHFALL-STAGE1.md`, 660 lines; repo untouched at 14491c9f). Headline: ground is FLAT (no heightfield), 91.6% uniform grass, ONE tree design for everything (118 crates render as pine trees), all 26 town huts roofAxis='x', interiors bare boxes with sky visible, town is a 61×125 ribbon, 0 generated stalls, night reads as overcast day, world buffer 237k verts town / 266k wild (89% of the 300k budget), rebuild ~165–211ms, live hitch 566.6ms on a 50-tile teleport.
* Development dashboard built + live (verified, audit pass).
* Directives §47–§59 added to SOUL.md (verbatim) + recorded in MEMORY.md and the dated log.
* Legacy codebase audit DONE (2026-11-07 ~15:00 PST; `~/workspace/verify-legacy/LEGACY_AUDIT.md`, 37,514 bytes, 230 lines; repo untouched). Counts: A 47, B 104, C 56, D 41 code + 2 assets, E 2 code + 3 server .js + asset dirs. Headline: the 3D game is NOT the game that ships today (GraphicsModeHost always boots 2.5D; Engine3DWorldView has no combat/quests/dialogue/shops/inventory/2.5D-save support). Wave 1 (8 code + 2 assets) removable once git can write; Wave 3 (23) needs explicit user approval per cluster.
* Master Implementation Registry DONE (2026-11-07 ~15:02 PST; `~/workspace/verify-integration/IMPLEMENTATION_REGISTRY.md`, 1,016 lines, 145,576 bytes, 88 requirements). Counts: COMPLETE AND VERIFIED 4, IMPLEMENTED BUT UNVERIFIED 15, PARTIALLY IMPLEMENTED 21, DOCUMENTED ONLY 9, NOT IMPLEMENTED 34, BLOCKED 5, OBSOLETE OR DUPLICATED 0.
* Dashboard data files created (2026-11-07 ~14:55 PST; `~/workspace/studio/dashboard/`, all JSON validated; commit hashes verified against git log). Honesty-gap fix applied 2026-11-07 ~15:05 PST (gate level 4 → 3 for 1016–1029; verifiedAt null for 1016–1025).

## Outstanding implementation work (in order)

1. **BUILD 1030** — commit + push (BLOCKED on the environment — see below), then phone probe + live verify. Play link: https://jaydonweircontracting-ux.github.io/Adventure-game-/?v=1030
2. **BUILD 1031** — blue-squares fix (wild lakes rendered as whole far cells at distance; subdivide to the lake's actual tiles). Queued after 1030.
3. **BUILD 1032** — house interior invisible walls (player can walk out through the walls; add boundary collision so enter/exit is only via the Enter/Exit button). Queued after 1031.
4. **Ashfall Stages 2–6** — terrain (heightfield, HIGH risk, harness-prototype first), vegetation, architecture, settlements, atmosphere. One code build per stage, each verified live. Code builds start at Stage 2, after 1032.
5. **Dashboard repair & automation (§54)** — data files CREATED as working copies in `~/workspace/studio/dashboard/` (dashboard-data.json, dashboard-schema.json, README.md, MUSE_INSTRUCTIONS.md, snapshots/2026-11-07.json, history/build-ledger.json, verification-history.json, development-history.json; all JSON validated; commit hashes verified against git log; honesty-gap fix applied 2026-11-07 ~15:05 PST). Move into the repo (`studio/dashboard/`) once 1030 lands and git can write; then wire the dashboard to read from them. CRITICAL: Adventure Game build numbers (1029–1032) are a SEPARATE track from the Java engine job numbers (Jobs 001–006) — never mix them.
6. **Muse self-evolution files (§59)** — these three files (MUSE_SOUL.md, MUSE_EVOLUTION.md, CONTINUE_ASHFALL.md) move into version-controlled project storage (`studio/`) once 1030 lands and git can write. This working copy is the draft.
7. **Master integration mission (§55)** — Stage A (foundation) DONE: the Master Implementation Registry is written at `~/workspace/verify-integration/IMPLEMENTATION_REGISTRY.md` (88 requirements; COMPLETE AND VERIFIED 4, IMPLEMENTED BUT UNVERIFIED 15, PARTIALLY IMPLEMENTED 21, DOCUMENTED ONLY 9, NOT IMPLEMENTED 34, BLOCKED 5). Stages B–F follow (dev infrastructure → world systems → living world → gameplay → polish/optimization). Integration, NOT a rebuild. Canonical home once git writes: `<repo>/studio/IMPLEMENTATION_REGISTRY.md`.
8. **Next evolution layer (§57)** — master orchestrator, recursive development engine, independent verification, benchmarking lab, advanced memory, research engine, tool bus, gameplay/world/visual intelligence, cleanup engine, resource intelligence, health score, continuation protocol. Future work; implement only what is still missing after the current hour's work is saved and reported.
9. **Game evolution engine AGEE (§58)** — world content factory, emergent stories, quest generation/validation, NPC personality/memory, living economy, world history, player-experience intelligence, balancing engine, asset pipeline, population director, content QC, GAME EVOLUTION LAB dashboard section, completion roadmap. Future work.
10. **Legacy codebase audit (§52 FINAL COMMAND)** — DONE 2026-11-07 ~15:00 PST (`~/workspace/verify-legacy/LEGACY_AUDIT.md`, 37,514 bytes, 230 lines). 248 files: A 47, B 104, C 56, D 41 code + 2 assets, E 2 code + 3 server .js + asset dirs. Wave 1 (8 code + 2 assets, unambiguous dead) removable once git can write (with the §52 11-step procedure + tsc/build/sim/phone probe); Wave 2 (10 sim-only utilities); Wave 3 (23 CONTESTED — user product decision per cluster). Headline: the 3D game is NOT the game that ships today. Extraction priorities 1–3 before any B/C removal.
11. **Quantum code evolution machine ACEE (§56)** — separate engineering subsystem (Development Genome, code generation machine, multi-agent lab, optimization lab, evolution sandbox, CODE EVOLUTION LAB dashboard interface). Future work, Phases 1–7.
12. **Stone house replacement** — BLOCKED (package files never arrived; `3d-house-sprites/` holds only a README).

## Known problems

* **ENVIRONMENT WRITE FAILURE (blocking 1030):** git cannot write on this machine — every write fails with "Operation not permitted" (cannot create `.git/index.lock`, cannot write loose objects; strace shows git opens temp objects with mode 0444 then `write()` returns EPERM on overlayfs). `git status`, `git add`, `git hash-object -w`, and `git config --global` all fail. Chromium will not launch (SIGTRAP ~100ms after launch; 8 variants tried; the 1028 probe used the same Chromium successfully earlier today). Local `vite build` cannot copy the 31,507-file `public/` dir (~766-call `copy_file_range` budget, then EPERM). GitHub Actions deploy builds are unaffected. Recovery: retry when the restriction clears (likely on the next deployment/VM replacement). Re-tested 2026-11-07 ~15:04 PST — STILL blocked (same index.lock EPERM, HEAD still 14491c9f). CORRECTION (2026-11-07 ~15:05 PST): the write restriction is NOT a blanket ban on external-binary writes — `cp` and node `writeFileSync` DO work in ~/workspace (tested and verified). What fails: git's writes (temp objects opened with mode 0444, then write() returns EPERM on overlayfs), vite's local build (copy_file_range budget, then EPERM), and python's `open('w')` (truncated MEMORY.md, then failed). The runtime file API (`muse.write`/`muse.edit`) works reliably. Do NOT waste cycles retrying the same failing command.
* **MEMORY.md truncation (2026-11-07 ~15:16 PST):** a failed `open('w')` truncated MEMORY.md to 0 bytes; restored from the injected context copy + dated logs (32,172 bytes, verified). Rule: never use a truncating write on a memory file; use the runtime file API or write-to-temp-then-atomic-replace. Background memory jobs rewrite MEMORY.md constantly — grep the current text before editing (or use a unique anchor with `muse.edit`).
* **Sim 684 rig crash (known, unverified):** `assetMetaFor` returns null for 5 variants (cottage-wide, hall-grand, house-balcony, house-tall, shop-banner); `simulate.ts` crashes dereferencing `meta.file`; ~1,000 sim lines after the rig section are unverified. Awaiting the user's word.
* **Stone house package:** never arrived (see item 12 above).
* **Open issues (not ordered):** tree visuals misaligned with collision in non-starting chunks (2026-09-30); zooming too far out turns the screen black (2026-10-12); roads render behind houses after BUILD 690 (2026-10-14, awaiting user confirmation after a fresh load); walking chops near Mosslight village (BUILD 707 announced, UNVERIFIED).

## Relevant files

* Repo: `~/workspace/adventure-game` (https://github.com/jaydonweircontracting-ux/Adventure-game-)
* Soul/directives: `~/SOUL.md` (§47–§59, 9286 lines)
* Memory: `~/MEMORY.md` (curated; 60,565 bytes as of 2026-11-07 ~14:45 PST) + dated logs `~/memory/2026-11-07.md` (append-only; per-build detail) + `~/memory/2026-10-21.md`, `2026-11-01.md`, `2026-11-02.md`, `2026-11-03.md`, `2026-11-04.md`, `2026-11-05.md`, `2026-11-06.md`
* Operating files (working copies): `~/workspace/studio/MUSE_SOUL.md`, `~/workspace/studio/MUSE_EVOLUTION.md`, `~/workspace/studio/CONTINUE_ASHFALL.md` (this file)
* 1030 verification: `~/workspace/verify1030/` (asserts1030-entry.ts, asserts1030.mjs, probe1030-after.mjs, sim-1030.log/.norm, sim-pristine1029.log/.norm, ASHFALL-STAGE1.md, measure1030-entry.ts)
* Pristine worktrees: `/home/hatch/pristine1029` (14491c9f), pristine1028, pristine1027, pristine1026, pristine1025, pristine1023, pristine1021 (under `/home/hatch`, NEVER `/tmp` — 512 MB tmpfs)
* Dashboard: artifact `ashfall-development-dashboard` (update at each verified checkpoint via `artifact.edit`)
* Architecture map + lessons: `~/AGENTS.md` (read before touching code)

## Next exact action

**Retry the BUILD 1030 commit + push.** The code is implemented, code-verified, and sitting uncommitted in the working tree (7 files). Do this first — it unblocks everything else.

### Commands to resume

```bash
# 1. Check whether the environment can write again (this is the gate):
cd ~/workspace/adventure-game && git status --short
# If it still fails with "index.lock write error: Operation not permitted", STOP — the environment is still broken. Do not retry in a loop. Report it and wait for the next deployment/VM replacement.

# 2. If git status works, confirm the tree state:
git log --oneline -3            # expect HEAD = 14491c9f (BUILD 1029)
git diff --name-only            # expect the 6 modified files
ls src/game/engine3d/playerPath.ts   # expect the new file exists
grep -n '__AG_BUILD="1030"' scripts/prepare-build-entry.cjs   # expect line 17
grep -n "BUILD_NUMBER = '1030'" src/App.tsx                    # expect line 200

# 3. Re-run the asserts DIRECTLY (no pipe, no && chain) — they need esbuild to write a bundle, so this also tests whether writes work:
cd ~/workspace/verify1030 && node asserts1030.mjs
# Expect: "ALL 1030 ENTRY ASSERTS PASS (97 checks)" + "ALL 1030 ASSERTS PASS (47 runner checks + entry checks)"

# 4. Commit + push (only if steps 1–3 pass):
cd ~/workspace/adventure-game
git add scripts/prepare-build-entry.cjs src/App.tsx src/game/engine3d/Engine3DWorldView.tsx src/game/engine3d/animals.ts src/game/engine3d/townsfolk3d.ts src/game/engine3d/transients.ts src/game/engine3d/playerPath.ts
git commit -m "BUILD 1030: Tap to walk now paths around things: tap a destination and your character walks around trees, houses, rocks, water, and other people instead of getting stuck and making you re-tap — and NPCs path around obstacles and each other the same way. An unreachable spot still says Path blocked. Everything else works exactly as before."
git push
# If the push fails with a proxy 403 or connection reset, it is transient, not auth — retry the push once; if it still fails, report the local commit hash and stop (never extract credentials).

# 5. Wait ~2–3 min for the GitHub Pages deploy, then live-verify by content marker:
#    - Served version.json shows build 1030
#    - Served ?v=1030 index.html contains window.__AG_BUILD="1030"
#    - If the deploy fails/hangs at GitHub's deploy step while the build job succeeds, diagnose via the PUBLIC Actions API and recover with an empty re-trigger commit (same content, idempotent).

# 6. Run the phone probe (restart the vite dev server on 8901 first, or probe the deployed build):
#    ~/workspace/verify1030/probe1030-after.mjs  (390x844; hut detour one-tap arrival, NPC detour one-tap arrival, wall-ring sealed tile -> "Path blocked" + no movement, keyboard push smoke + sprint icon, screenshots to verify1030/after/)

# 7. Only after steps 5–6 pass: report 1030 as landed (DONE/TESTED/BROKEN/NEXT + commit hash + play link https://jaydonweircontracting-ux.github.io/Adventure-game-/?v=1030), update the dashboard (artifact.edit), update MEMORY.md + the dated log, then spawn BUILD 1031.
```

## Relevant testing requirements

* **tsc:** `./node_modules/.bin/tsc --noEmit` — must exit 0 (read-only; works even when writes are blocked).
* **Asserts:** `node asserts1030.mjs` run DIRECTLY (no pipe, no `&&` chain) — needs esbuild to write a bundle, so it fails while the environment write restriction is in force. Expect 97 entry + 47 runner checks.
* **Sim:** compare normalized logs vs pristine1029 — must be IDENTICAL, 0 FAIL (the known 684 rig crash is the only expected failure).
* **Phone probe:** 390×844, one tap behind a house/trees/rocks arrives; one tap behind an NPC paths around; unreachable tap reports "Path blocked". 0 page errors.
* **Live verify:** served `version.json` build + note, served `?v=<BUILD>` index `__AG_BUILD` — never bundle filenames.
* **Parent verification standard:** origin/main top commit + tree clean + served markers + mechanism greps + parent re-runs standalone asserts DIRECTLY before reporting. Assert runners' post-commit scope-guard failures are harness artifacts, not game defects, when the entry checks pass.

---

*Update this file every meaningful development cycle. If it is out of date, the next session starts from the wrong place — fix it before doing new work.*
