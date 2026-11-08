# ASHFALL — NEXT_TASK

**Version:** 1.0 — 2026-11-07 ~15:08 PST
**Source:** SOUL.md §55 (unify documentation/memory in GitHub) + `studio/CONTINUE_ASHFALL.md` (the exact persistent resume point). This file is the exact next task. It mirrors CONTINUE_ASHFALL.md's "Next exact action"; when the two disagree, CONTINUE_ASHFALL.md wins (it is the resume point).
**Status:** This file is NEW (registry D7 was NOT IMPLEMENTED — zero hits for any of the five named docs before this file).

## The exact next task

**Retry the BUILD 1030 commit + push.** The code is implemented, code-verified, and sitting uncommitted in the working tree (7 files). Do this first — it unblocks everything else (1031 → 1032 → Stages 2–6 → the studio files' commit → Wave 1 removal).

## The gate (check this first)

Git cannot write in this environment (EPERM on overlayfs). Do NOT waste cycles retrying the same failing command in a loop. Check once; if it still fails, stop and wait for the environment to clear (likely on the next deployment/VM replacement).

## Commands to resume

```bash
# 1. Check whether the environment can write again (this is the gate):
cd ~/workspace/adventure-game && git status --short
# If it still fails with "index.lock write error: Operation not permitted", STOP — the environment is still broken. Do not retry in a loop. Report it and wait for the next deployment/VM replacement.
# Last re-test: 2026-11-07 ~15:04 PST — STILL blocked, HEAD still 14491c9f.

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

## What 1030 is (for the session that resumes)

* **User order (2026-11-07 ~13:42 PST):** "When tapping to walk make the npcs and characters path around objects correctly instead of of having to constantly tap when they get stuck on trees and houses and rocks and npcs".
* **What was built (7 files, uncommitted):** NEW `src/game/engine3d/playerPath.ts` (tile A* reusing `planPathNpc`'s steps + greedy line-of-sight smoothing to ≤3 waypoints ending exactly on the tap; replan 500ms, stuck 1500ms, figure-wait 900ms, waypoint-arrive 0.15); `Engine3DWorldView.tsx` (tap plans via `planPlayerPath`; the draw loop follows waypoints); `townsfolk3d.ts`, `transients.ts`, `animals.ts` (NPC fixes: whole-remaining-path validation, `sidestepTile`, `detour` flag — head-on pair arrives in 21–22 ticks); `scripts/prepare-build-entry.cjs` + `src/App.tsx` (markers at 1030, both, + the '1030' player-terms note). Build-generated `index.html` + `public/version.json` restored byte-exact (hashes match HEAD).
* **Verification done:** tsc clean (agent + parent re-ran `tsc --noEmit`, exit 0); standalone asserts 97 entry + 47 runner checks PASS (agent's run ~15:04); sim vs pristine1029 IDENTICAL (parent verified: norms identical, 0 FAIL, same known 684 rig crash). Pristine worktree `/home/hatch/pristine1029` @ `14491c9f`.
* **Quality gates:** L1 IMPLEMENTED PASSED, L2 INTEGRATED PASSED, L3 VERIFIED NOT RUN (phone probe blocked — Chromium SIGTRAP), L4 POLISHED NOT RUN (depends on L3).

## After 1030 lands

1. Update `studio/CONTINUE_ASHFALL.md` (last verified checkpoint → 1030, active task → 1031) and this file (next task → 1031).
2. Update `studio/dashboard/dashboard-data.json` (last verified checkpoint, build queue, build history, quality gates) + `studio/dashboard/history/build-ledger.json` + `verification-history.json` + a dated snapshot in `studio/dashboard/snapshots/`.
3. Update the registry (`studio/IMPLEMENTATION_REGISTRY.md`): Q1 → COMPLETE AND VERIFIED, queue advances.
4. Update the dashboard artifact (`ashfall-development-dashboard`) via `artifact.edit`.
5. Spawn BUILD 1031 (blue-squares fix).

## Maintenance

* Update this file whenever the next task changes. It always holds exactly one task: the next thing to do. When that task is done, replace it with the following task — do not accumulate a list here (the queue lives in `studio/dashboard/dashboard-data.json`).
