# Muse Resume Trigger

**Purpose:** A small GitHub push to wake the Muse development workflow and resume ASHFALL.

**Last updated:** 2026-11-09 ~13:48 PST (parent). The previous version of this file said "resume at BUILD 1051" — that was stale (1051 landed + live-verified 2026-11-09 ~10:46 PST). Do not follow the old 1051 resume point.

## Immediate instruction

Resume ASHFALL from `studio/CONTINUE_ASHFALL.md`. Do not restart or rebuild the project, and do not repeat completed work.

1. Read this file, `studio/CONTINUE_ASHFALL.md`, `studio/NEXT_TASK.md`, `studio/orchestrator/README.md`, and the applicable Muse operating instructions.
2. Reconcile the documented checkpoint against the actual repository state and latest commit before changing anything.
3. **Current checkpoint (verified): BUILD 1052 landed + live-verified** — Ashfall Stage 6: atmosphere (commit acc4810c, deploy run 42683144704 success, served version.json 1052 @ 2026-11-09T19:26:29.144Z). The queue since 1030: 1030 tap-to-walk pathfinding (9dc4cdf7), 1031 wild-lake rendering (336741da), 1032 interior boundary collision (7d1c8cf9), 1033 red sports car (7a9671d4), 1034 Stage 2 terrain (62354ebf), 1035 car lag fix (452da72b), 1036 Town Builder Stage 1 (0b21aba4), 1037 AREA SELECT (67880190), 1038 windmill (8963bc65), 1039 undo/redo (fa257044), 1040 Stage 4 asset library (58aa5ecd), 1041 farm land for the windmill (58529b47), 1042 Stage 5 layout helpers (8041e127), 1043 Import Hub Stage 1 (4a82b393), 1044 Import Hub Stage 2 IndexedDB asset store (a93a1d69), 1045 Import Hub Stage 3 preview + library (81d17b79), 1046 Import Hub Stage 4 packs / recovery (5bea9115), 1047 Import Hub Stage 5 AI / development handoff (a5cfa961), 1048 Import Hub Stage 6 integration (6430a5c3), 1049 Ashfall Stage 3 vegetation (0e3d7c0b), 1050 Ashfall Stage 4 architecture (9edb9212), 1051 Ashfall Stage 5 settlements (6a10dece), 1052 Ashfall Stage 6 atmosphere (acc4810c) — all live-verified. The Town Builder is complete (Stages 1–5, builds 1036–1042). **The Import Hub is complete (Stages 1–6, builds 1043–1048).** **The Ashfall program is complete (Stages 3–6, builds 1049–1052).** Do not re-do any of them.
4. **The next item is the Dashboard repair (§54 Stage B) — a user-decision item.** Wire the dashboard artifact ('ashfall-development-dashboard') to read from studio/dashboard/dashboard-data.json instead of hard-coded data. Do NOT start it without the user's word. One bounded, tested, documented checkpoint at a time. Honest limits: no direct local-folder access on iPhone Safari; ChatGPT cannot access local files without an upload. Do not build a desktop-style folder pipeline or claim AI local-file access.
5. Preserve existing working systems. Never delete legacy systems without the documented audit and approval gates. Never claim a feature is complete without evidence.
6. Update the resume point, task queue, registry, dashboard data, and development memory after meaningful checkpoints — including this file, so its resume point never goes stale again.

**Operating command:** BUILD. MEASURE. LEARN. EVOLVE. REPEAT.

This file is a continuation signal, not permission to bypass credit limits, safeguards, testing, or repository protections.

## Fresh wake signal — 2026-11-08 17:31 PST

This commit is the explicit request to resume the existing Muse workflow now. Continue the Import Hub as the next bounded build (1043+), following `studio/CONTINUE_ASHFALL.md`, `studio/NEXT_TASK.md`, and `studio/orchestrator/README.md`. Reconcile repository state first; preserve all verified work through build 1042. Do not restart ASHFALL, repeat completed Town Builder stages, bypass credit limits, or claim work is complete without tests and live evidence.

## User's next directive — make the Import Hub genuinely usable

The user wants importing fixed and expanded so we can keep developing ASHFALL with external assets instead of repeatedly hitting upload-size limits and slow manual GitHub uploads. Treat this as the active task after reconciling the actual latest code and build state.

Do not assume the old resume docs are current: this wake file says BUILD 1042 is live, while older CONTINUE_ASHFALL.md / NEXT_TASK.md / orchestrator status still contain 1029/1030-era notes. Reconcile against the actual branch, latest commits, deployment workflow and served version before editing. Update stale docs only after verifying facts.

### Deliver a real, staged Import Hub — not a mock UI

1. Audit first: inspect the current Build Menu, Town Builder asset library, asset loaders, save/persistence model, build pipeline, service worker/cache, and any existing import code. Reuse working systems; do not create a duplicate asset manager.
2. Stage 1 — dependable local import: Build Menu → Import Hub with a clear file picker and drag/drop where supported. Support practical formats the existing renderer can actually load (prioritize .glb/.gltf and textures; add .obj/.mtl, .fbx, audio, and ZIP only where loader/dependency support is verified). Validate file type, size, MIME/signature where practical, missing dependencies, and malformed files. Show useful errors; never silently fail.
3. Stage 2 — preview and library: show import progress, preview thumbnails/3D model, name/category/tags, dimensions where available, source filename, and explicit Add to Asset Library / Cancel. Keep imported assets organized and searchable. Avoid blocking the game render loop.
4. Stage 3 — persistence: store user imports in browser storage (prefer IndexedDB for binary assets; use an explicit quota/error path). Persist metadata and references in a versioned manifest. Ensure assets survive reloads on the same browser/device. Explain that browser-local assets do not automatically sync to other devices or GitHub.
5. Stage 4 — packs and recovery: ZIP import with safe path handling (reject traversal paths, unexpected expansion, excessive file counts/sizes); resolve relative glTF texture dependencies; report partial imports clearly; allow export/backup of the user's imported asset pack and manifest. Do not overwrite existing assets without confirmation.
6. Stage 5 — AI / development handoff: create an explicit export/share workflow for selected assets or packs, including a compact manifest and files that the user can upload/share into ChatGPT or Muse. If a connected runtime genuinely supports direct file handoff, use it; otherwise be honest and provide the upload/export route. Never claim ChatGPT or Muse can see browser-local files automatically.
7. Stage 6 — integration: imported assets must be selectable in Build Mode and placeable using the existing move/rotate/scale/duplicate/undo/redo flows. Preserve selection and placement behavior; imported assets must not break built-in assets or saved town chunks.

### Non-negotiable engineering gates

- iPhone Safari compatibility is a primary target. Use the browser file picker (input type=file) and supported browser APIs; do not promise arbitrary local-folder access on iOS. Directory import is progressive enhancement only where supported.
- Keep the game playable if storage is unavailable, full, or permission is denied. Provide clear quota guidance and a retry/export path.
- Do not use GitHub as the binary asset store. Do not commit large user asset packs or raise repository size needlessly. Keep code/manifests small; use user-controlled export for binaries.
- No hidden uploads, network transfer, or external asset hosting. Explain where data is stored and require an explicit user action before sharing.
- No fake progress bars, placeholder previews presented as real, or unsupported format claims.
- Preserve all existing Town Builder work and saved chunks. Never remove or rewrite existing assets as part of import work.
- Implement one bounded stage at a time. Run TypeScript, build, targeted import/security/persistence tests, and regression checks. Live-verify the deployed build before marking a stage complete. Update the build number, changelog, registry, dashboard, task queue, and resume docs consistently.
- If the current environment cannot edit/push or the Muse workflow cannot be triggered, stop after one check, report the exact blocker, and do not pretend the implementation shipped.

Acceptance test: On iPhone Safari, select a valid small GLB, see a real preview, add it to the library, place it in Build Mode, save/reload the town, and confirm the asset remains available. Also test an invalid file, a malformed GLB, a too-large file, storage quota failure, and a ZIP path-traversal attempt. At minimum, desktop browser tests should cover dependency-linked glTF textures and pack export/import.

Start by auditing what exists and report the actual Import Hub baseline. Then implement the highest-value safe stage immediately; do not stop at a plan.

## NEXT UPDATE — BUILD 1044: Fix the existing custom-asset import bottleneck

**Reconciliation note (parent, 2026-11-08 ~19:51 PST):** this section was written as "BUILD 1043" before the hub stage 1 landed. BUILD 1043 is now live as the Import Hub Stage 1 (hub UI + .gltf/.obj + ZIP, commit 4a82b393) — do not re-do it, and do not strip the ZIP support. This IndexedDB spec is therefore **BUILD 1044 (Import Hub Stage 2)**, not 1043. The ZIP work in 1043 matches the 6-stage plan's Stage 1 ("add .obj/.mtl, .fbx, audio, and ZIP only where loader/dependency support is verified") — ZIP support was verified with a hand-written reader and no new dependency.

The audit has identified an existing importer; do NOT build a second Import Hub from scratch.

**Verified baseline from the current source:**
- src/game/engine3d/customAssets.ts already parses self-contained glTF 2.0 binary .glb files directly in-browser.
- The renderer converts models to static vertex-colour triangles. Textures, animation, and external .gltf/buffer references are not rendered/supported today. Do not advertise them.
- Current upload cap is 1,000,000 bytes per file; the entire JSON library is capped at 2,000,000 bytes and stored in localStorage under ag-3d-custom-assets-v1.
- The existing parser has useful safety checks (GLB magic/version/chunks, triangle count, 8x8 footprint, malformed accessors). Preserve and test them.
- Engine3DWorldView.tsx already imports and uses loadCustomAssets, saveCustomAssets, and the GLB parser; PlacedItem.assetId ties custom placements to assets. Chunk templates currently exclude custom items. Preserve all current behavior.

**Implement this one bounded update now: make asset storage reliable and remove the tiny localStorage bottleneck.**

1. Replace binary/large-array persistence with an IndexedDB-backed asset store (versioned database + object store, stable asset IDs). Keep metadata/manifest compact and versioned. Do not store model vertex arrays in localStorage.
2. Migrate existing ag-3d-custom-assets-v1 data once, safely and idempotently. Never delete the legacy key until the IndexedDB write is confirmed and read-back validates every migrated asset. If migration fails, keep legacy data usable and show a visible warning.
3. Preserve the existing synchronous render path safely: load IndexedDB assets into an in-memory cache before enabling custom-asset placement/rendering, show a small loading state, and never make the world boot fail if IndexedDB is unavailable. Avoid stale async writes overwriting newer library changes.
4. Increase the file-size ceiling only to a measured, device-safe limit after accounting for decoded vertex/index memory. Add total-library byte/triangle budgets and clear actionable quota/size errors. Do not blindly accept huge models. Keep the current triangle/footprint limits unless tests justify a safe adjustment.
5. Make upload failure visible in the Build UI. No swallowed quota errors, fake success, or silent data loss. Keep the existing parser's validation and static vertex-colour limitations explicit.
6. Add focused tests: legacy migration success; migration interrupted/failure retains old data; corrupt IndexedDB record ignored; quota failure; duplicate names/IDs; reload persistence; malformed GLB and over-limit file; rapid consecutive uploads/deletes do not race; existing custom placements still render after reload.
7. Run typecheck, production build, targeted tests, and the relevant existing regression suite. Do not mark live-verified until the deployment and served build marker are confirmed.

**Acceptance:** upload a valid GLB larger than the old 1 MB limit but within the new measured cap, add it, reload on the same device, and confirm it remains in the library and existing placed copies still render. Verify old localStorage uploads migrate without loss. If iPhone Safari IndexedDB storage/quota behavior differs, handle it explicitly.

**Status: DONE as BUILD 1044 (2026-11-08 ~20:00 PST, commit a93a1d69, deploy run 42555446176 success, served version.json 1044 @ 2026-11-09T03:17:22.844Z, 114 asserts pass, sim vs pristine1043 byte-identical, phone probe 23 findings 0 page errors).** The 5 MB per-file / 50 MB library caps, the one-time idempotent migration (read-back validated before the legacy key is deleted), the loading state, and the boot-never-fails fallback all shipped and were verified live. One honest caveat: live quota exhaustion could not be forced in the harness (Storage.overrideQuotaForOrigin is a no-op in this Chromium) — the quota path is proven by the Node asserts plus the view's shared persist-first-then-commit path, not by a live browser quota failure.

After BUILD 1044 is implemented and verified, update the registry/dashboard/resume/task queue and only then move to Stage 3 (preview/library UX and broader formats). Do not bundle ZIP, FBX, audio, or unsupported texture rendering into this checkpoint.


## Fresh wake signal — 2026-11-08 22:35 PST — requested 8-hour continuation

The user explicitly requests that Muse resume now and continue working for up to **8 hours**, using its available runtime/credits. This is a continuation, not a restart. Begin from the actual latest main-branch state and the verified BUILD 1044 checkpoint; the next bounded task is **BUILD 1045 — Import Hub Stage 3: preview/library UX**. Read and reconcile the current resume/task/orchestrator files against the repository before editing; some of those older docs are stale and must not override the verified 1044 checkpoint in this file.

For this run: keep working through the highest-priority safe tasks in sequence for as much of the requested 8-hour window as the Muse session and available credits permit. Do not claim an eight-hour session is guaranteed or bypass Muse's runtime, credit, or safety limits. At each meaningful checkpoint: implement one bounded change, run relevant tests/typecheck/build/regressions, preserve working features, update build number/changelog/registry/dashboard/task queue/resume docs, and commit/push only verified work. Then immediately continue to the next queued task without waiting for another user prompt, until the session ends, resources run out, a genuine blocker requires user input, or the eight-hour window expires. Leave a precise resumable checkpoint and report what actually shipped, what was tested, and the next task. Do not restart ASHFALL, redo BUILD 1044 or earlier completed work, commit large binary assets, or weaken any acceptance/safety gates.

**Immediate next task:** BUILD 1045 — Import Hub Stage 3 preview/library UX. Follow the staged Import Hub acceptance criteria above and current source, not stale pre-1044 notes.


## Fresh wake signal — 2026-11-09 17:06 PST — user requested Muse trigger

**Resume now.** This is an explicit user request to wake Muse and continue ASHFALL development. Start by synchronizing to the current `main` HEAD (at wake-signal creation: `26d375c1fde43951b9b76c8ec465bf16c6e4b3b0`) and reading the latest repository state. The last recorded verified game checkpoint is **BUILD 1052 — Ashfall Stage 6 atmosphere** (the 2026-11-09 checkpoint commit identifies the Ashfall program as complete). Do not follow stale pre-1044 / BUILD 1045 notes below or in older resume files.

**First action:** reconcile `studio/CONTINUE_ASHFALL.md`, `studio/NEXT_TASK.md`, `studio/IMPLEMENTATION_REGISTRY.md`, `studio/DEVELOPMENT_ROADMAP.md`, and the latest commit/deployment evidence against BUILD 1052. The latest checkpoint message identifies the next area as **Dashboard repair (§54 Stage B)** and flags it as a user-decision item. Inspect the exact decision and its documented options. Do not fabricate user approval or make an irreversible choice on the user's behalf. If it truly blocks that task, record the blocker clearly and move to the highest-priority independent, already-authorized work in the registry/roadmap; ask the user only when a genuine decision is unavoidable.

Continue autonomously through bounded, useful tasks while Muse runtime and credits permit. Preserve existing systems; no restart, no duplicate infrastructure, no broad destructive cleanup, no weakening tests. For every change: inspect current code/docs, implement, typecheck, run targeted tests + relevant regressions + production build, verify deployment/live markers when applicable, update build/registry/dashboard/task/resume records, then commit/push only evidence-backed work. After each verified checkpoint, immediately select the next safe queued task. Stop only for exhausted runtime/credits, a real blocker requiring user input, or the session's normal limits. Leave a precise resumable checkpoint and report actual results; never claim background work or a duration that has not occurred.

**Immediate command:** reconcile from BUILD 1052, resolve or safely defer the §54 Stage B decision, and continue the next authorized high-impact ASHFALL task. This wake signal supersedes all earlier wake instructions in this file.
