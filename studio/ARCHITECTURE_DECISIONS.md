# ASHFALL — ARCHITECTURE_DECISIONS

**Version:** 1.0 — 2026-11-07 ~15:08 PST
**Source:** SOUL.md §47–§59 (the directives) + `studio/LEGACY_AUDIT.md` (the classification + extraction rules) + `~/AGENTS.md` (the architecture map + the lessons). This file records the key architecture decisions — the decision, the reason, and the source. It is the record a future session consults before changing the architecture.
**Status:** This file is NEW (registry D7 did not name this doc separately, but §55's doc list includes ARCHITECTURE_DECISIONS). The decisions below are all in force as of 2026-11-07.

## 1. 3D is the game (§48, 2026-11-07)

**Decision:** 3D is THE game — the actual, primary version of ASHFALL. The old 2D/2.5D modes are no longer development targets (do not polish/expand/maintain them as separate experiences); their useful logic/content is reused in 3D.

**Reason:** The user directed it (2026-11-07): "We need to make 3D the actual game, not keep developing the old 2D/2.5D experience."

**Honest caveat (from the legacy audit + the registry):** the 3D game is NOT the game that ships today. `GraphicsModeHost` always boots 2.5D; the 3D demo imports only `isoWorld`, `mosslightLayout`, `dayNight`, and a slice of `townsfolk.ts`, and has no combat/quests/dialogue/shops/inventory/2.5D-save support. The decision is the direction; the implementation is the extraction backlog (registry G8, G11–G15, G17, G19). Deleting the 2D/2.5D code today would delete the game.

## 2. Extend, never duplicate (standing, 2026-09-28; §53; MUSE_SOUL.md principle 4 + 7)

**Decision:** Search the project before creating a new system. If a system already exists, improve it. Do not create a second architecture beside the first. Do not create duplicate systems merely because they are easier to write.

**Reason:** Duplicates are the project's largest structural debt (the legacy audit found 12 duplicate systems: three renderers, two stamina models, two interiors, two ground-detail, two worldgen, two minimaps, two character-art, two NPC-sims, two save systems). Every duplicate doubles the maintenance cost and halves the chance that a fix lands in both places.

## 3. One coordinate system (SOUL.md §26; MUSE_SOUL.md)

**Decision:** The game uses one grid/chunk coordinate system. Do not introduce a second incompatible coordinate system. Every system must agree on where an object actually is.

**Reason:** Coordinates are law. World, chunk, local, tile, and screen coordinates must agree, or doors, paths, NPCs, and saves silently disagree about where things are. (`FIELD_SIZE` is 280; stale comments citing 0..140 are wrong.)

## 4. Save games are sacred (SOUL.md §28)

**Decision:** Never casually invalidate a player's world. Save the player, inventory, equipment, quests, world time, NPC state, NPC relationships, important NPC locations, world events, discovered locations, economy, ground items, and important chunk state. Version saves. Migrate old saves when possible. Never silently overwrite a good save with corrupt data.

**Reason:** A player who loses their world to a format change does not come back. **Known gap (registry G16):** the `ag-3d-*` save keys have NO versioning (unlike `iso-world-v2`, which is versioned+migrated). Versioning them is a queued task (backlog item G16-SAVEVER).

## 5. No rewrites (standing, 2026-10-08; §48; MUSE_SOUL.md)

**Decision:** Keep improving incrementally. Never tear down and rebuild. Do not replace the entire game because a feature is difficult. Do not rewrite thousands of lines when a small fix is possible. Do not introduce a second architecture beside the first.

**Reason:** The user chose this explicitly (2026-10-08, Option 1). The game is large, working, and shipped; a rewrite discards verified behaviour and re-introduces bugs that were already fixed.

## 6. One code agent at a time on the shared checkout (the 1022 lesson, 2026-11-06)

**Decision:** Parallel agents share ONE checkout. When agents share a tree, brief NO-commit and the PARENT sequences commits. When the tree is clean and one agent runs alone, it may commit+push itself. Read-only audits may run in parallel.

**Reason:** In BUILD 1022, two agents shared `Engine3DWorldView.tsx`; one agent committing whole files swept the other agent's hunks in (the first-person pitch flip rode along in 1022's commit). The parent sequences commits to prevent this.

## 7. Verify live by content markers (BUILD 366 lesson, 2026-09-30)

**Decision:** Verify "live" by content markers in the served bundle (served `version.json` build + note, served `?v=<BUILD>` index `__AG_BUILD`), never bundle filenames. A build marker proves deployment, not that the user's problem is solved.

**Reason:** CI and local builds produce DIFFERENT bundle hashes for identical source (env/path differences), so a bundle filename proves nothing. And a deployed marker does not prove a gameplay fix — the fix must be traced through spawn, serialization, restore, and respawn paths (the BUILD 528/529 deer lesson: removing the spawn did not remove the deer from existing saves).

## 8. The build markers (both, every build)

**Decision:** Every build bumps BOTH markers: the hardcoded `window.__AG_BUILD` in `scripts/prepare-build-entry.cjs` (line 17; that script also rewrites `index.html` from a template every build — head changes go in the template) AND `BUILD_NUMBER` in `src/App.tsx` (~line 200). A mismatch fails deployment validation.

**Reason:** The marker is hardcoded in the prebuild script, NOT derived from BUILD_NOTES or git (BUILD 683 lesson: adding a build note without bumping the hardcoded number ships the old marker — the deploy "succeeds" but the site still reports the previous build).

## 9. Push via HTTPS + the credential helper; never force-push (standing)

**Decision:** Push via HTTPS + the stored credential helper (`~/.git-credentials`, 600 perms). SSH is blocked by the network proxy. Never force-push. Sync with fetch + rebase. Pasted PATs are treated as exposed and never quoted back.

**Reason:** SSH is blocked by the proxy, so HTTPS + the credential helper is the only push path. A force-push can destroy the shared history that the parent and the parallel agents depend on. If a subagent push fails git-protocol-blocked (proxy 403), stop and report the local commit hash for the parent to push; never extract credentials. A proxy "Recv failure: Connection reset by peer" (exit 128) is transient, not auth — the parent push is the recovery.

## 10. Never ship a guess-build (standing, 2026-10-03)

**Decision:** Never ship a guess-build for a failing system — trace the full path to the exact failing link first.

**Reason:** A guess-build that happens to work hides the real defect; a guess-build that fails wastes a deploy cycle and the user's trust. The 1018/1020/1021/1026/1030 traces are the model (each named the failing link before the fix was written).

## 11. The 3D renderer is vertex-colour triangles only (architectural fact, not a preference)

**Decision:** The 3D renderer is a custom WebGL renderer using vertex-colour triangles ONLY — no normals, no textures, no alpha blending (fragment alpha 1.0; day/night via the `uNight` uniform).

**Reason:** This is what the renderer is (since the 3D demo was built). Any visual work (Stage 2 terrain, Stage 3 vegetation, Stage 4 architecture, Stage 6 atmosphere) must work within this constraint, or the constraint itself must be changed deliberately (a decision, not an accident).

## 12. Remove only verified category-D code (§52, 2026-11-07)

**Decision:** Never delete a file based solely on its name. Verify references, dependencies, and save compatibility first. Remove only verified obsolete code (legacy audit class D), with a recoverable Git checkpoint first, following the §52 11-step safe-removal procedure. Extract reusable functionality into clean shared modules BEFORE removing old implementations.

**Reason:** The legacy audit proved that most "2D/2.5D" code is class B/C (reusable gameplay logic / content), not D. Deleting by name would delete the game. Wave 3 (23 files, complete but never wired in) is a user product decision per cluster, not routine cleanup.

## 13. The dashboard reads from data, not hard-coded values (§54, 2026-11-07)

**Decision:** The dashboard reads from `studio/dashboard/` (dashboard-data.json + the history files) instead of hard-coded information. GitHub is the permanent source of truth. Never fabricate commit hashes, verification results, build numbers, or measurements. Label unsupported records as requiring verification.

**Reason:** The 2026-11-07 MEMORY.md truncation incident proved that a single mutable memory file is not a safe home for project history. The dashboard data is version-controlled, validated against a schema, snapshotted by date, and written atomically (validate existing → save backup → write replacement to temp file → validate replacement → atomically replace → verify).

## 14. Quality gates carry real evidence (§50 + §54; MUSE_EVOLUTION.md v1.1)

**Decision:** Four gates (LEVEL 1 IMPLEMENTED, LEVEL 2 INTEGRATED, LEVEL 3 VERIFIED, LEVEL 4 POLISHED). Each gate must have actual verification evidence (gate name, status, timestamp, test/command, result, commit). A gate that has not run is NOT RUN. A gate that fails is FAILED. Missing results are never silently treated as passing. Never claim a gate level for a build unless a per-build evidence record exists for that gate.

**Reason:** The Master Integration Registry (§55 Stage A, 2026-11-07) found that the dashboard data claimed Level 4 for builds 1016–1029 with no per-build Level-4 evidence, and used midnight placeholders for 1016–1025 verification timestamps. The data was corrected (gate level 4 → 3; timestamps → null) and the rule was recorded in `studio/MUSE_EVOLUTION.md` v1.1 so it does not recur.

## Maintenance

* Record a new architecture decision here when one is made (the decision, the reason, the source, the date). Do not silently change an existing decision — record the change and the reason.
* If a decision in this file conflicts with a directive in `~/SOUL.md`, the directive wins and this file must be updated to match (with a note recording the conflict and its resolution).
