# Muse Resume Trigger

**Purpose:** A small GitHub push to wake the Muse development workflow and resume ASHFALL.

**Last updated:** 2026-11-08 ~17:31 PST (parent). The previous version of this file said "resume at BUILD 1036" — that was stale (1036 landed + live-verified 2026-11-07 ~20:25 PST). Do not follow the old 1036 resume point.

## Immediate instruction

Resume ASHFALL from `studio/CONTINUE_ASHFALL.md`. Do not restart or rebuild the project, and do not repeat completed work.

1. Read this file, `studio/CONTINUE_ASHFALL.md`, `studio/NEXT_TASK.md`, `studio/orchestrator/README.md`, and the applicable Muse operating instructions.
2. Reconcile the documented checkpoint against the actual repository state and latest commit before changing anything.
3. **Current checkpoint (verified): BUILD 1042 landed + live-verified** — Town Builder Stage 5: layout helpers (commit 8041e127, deploy run 42532242988 success, served version.json 1042 @ 2026-11-08T22:52:03.518Z). The queue since 1030: 1030 tap-to-walk pathfinding (9dc4cdf7), 1031 wild-lake rendering (336741da), 1032 interior boundary collision (7d1c8cf9), 1033 red sports car (7a9671d4), 1034 Stage 2 terrain (62354ebf), 1035 car lag fix (452da72b), 1036 Town Builder Stage 1 (0b21aba4), 1037 AREA SELECT (67880190), 1038 windmill (8963bc65), 1039 undo/redo (fa257044), 1040 Stage 4 asset library (58aa5ecd), 1041 farm land for the windmill (58529b47), 1042 Stage 5 layout helpers (8041e127) — all live-verified. The Town Builder is complete (Stages 1–5, builds 1036–1042). Do not re-do any of them.
4. **The next task is the Import Hub.** An Import Hub in the Build Menu for external 3D models/textures/asset packs/audio/ZIP/folders, a local file import pipeline, an AI asset-access layer. A separate staged program after the Town Builder — build it in stages, one bounded, tested, documented checkpoint at a time. Then Ashfall Stages 3–6. Honest limits: no direct local-folder access on iPhone Safari; ChatGPT cannot access local files without an upload. Do not build a desktop-style folder pipeline or claim AI local-file access.
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
