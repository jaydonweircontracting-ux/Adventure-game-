# Adventure Game Development Log

## Checkpoint 001 — orientation baseline

- Date: 2026-08-30 (America/Vancouver)
- Target: jaydonweircontracting-ux/Adventure-game-
- Target branch: main
- Workflow: GitHub-only; do not mount or run the game unless explicitly requested.
- Source repositories:
  - weirjay6-hue/Ashfall — browser RPG architecture, engine seams, and project-state controls.
  - challacade/legend-of-lua — reference for continuous movement behavior.
- Current target shape: small TypeScript/Vite browser game shell with the playable surface in src/App.tsx and styling in src/index.css.
- Current target movement: 130 ms interval, one active direction selected, fixed 2.4 percentage-point step, local position/chunk/stamina state, keyboard and pointer controls.
- Current source movement reference: Legend of Lua reads held input every frame, normalizes diagonal vectors, applies velocity from a frame delta, and separates movement state from animation/state handling.

## Bounded implementation plan

1. Preserve this checkpoint before implementation.
2. Read only the Ashfall browser-engine files that map to the target's current seams; do not transplant the Java engine or unrelated UI wholesale.
3. Replace the target's timer/one-direction movement loop with a browser-safe continuous input loop modeled on the Legend movement contract: held keys, normalized diagonals, frame-time scaling, release-safe pointer input, and explicit facing.
4. Keep the existing target visual direction and controls intact unless a source file is required for the movement seam.
5. Record static benchmarks and verification status in BENCHMARKS.md.
6. Push each bounded change as a focused commit. Stop after the movement slice for local testing.

## Guardrails

- No repository mount.
- No game execution from this session.
- No broad Ashfall rewrite.
- No credentials in files, commits, or chat.
- Future updates should prefer small patch-sized commits and update this log before the next slice.

## Verification status

- Repository access and branch permissions: verified through GitHub API.
- Runtime tests/build: not run in this session by design; local testing remains with the user.
- Implementation changes: none at the time of this checkpoint.


## Checkpoint 002 — movement and world foundation

- Completed client slice: replaced the fixed 130 ms movement loop with a requestAnimationFrame loop using elapsed-time scaling and normalized diagonals.
- Preserved: existing visual direction, keyboard bindings, touch controls, chunk wrapping, stamina behavior, field logs, clock, and UI layout.
- Added: explicit player facing metadata, blur/visibility input cleanup, and release-safe held-input behavior.
- Added optional world layer from the supplied blueprint, adapted to this repository's ESM setup:
  - world_generator.js — deterministic 16 × 16 coordinate-seeded chunks with town, outpost, and dungeon structures.
  - persistence.js — JSON state persistence that strips active connections and ignores generated runtime state.
  - server.js — optional HTTP health endpoint and WebSocket AUTH/JOIN plus MOVE/UPDATE contract with chunk-local translation, checkpointing, and graceful shutdown.
- Added package scripts: start and world-server. Added ws as a runtime dependency.
- Added .gitignore protection for node_modules, dist, world_state.json, and environment files.
- Browser/server boundary: the browser does not connect to the socket yet; synchronization is intentionally a separate next slice.

## Commits

- 4622ee1 — docs: save orientation checkpoint
- 50ad8a8 — docs: record baseline benchmarks
- 77c44e3 — feat: make field movement frame-based
- f661600 — feat: add deterministic world chunk generator
- b26b56a — feat: add sanitized world persistence
- 14324e4 — feat: add optional chunk world server
- f02f6eb — build: add optional world server scripts
- 0227a6a — chore: ignore local world state
- b33ffb6 — docs: document optional world server

## Verification status

- GitHub writes: complete on main.
- Static source checks: complete for changed file shapes and manifest JSON.
- npm install, browser build, TypeScript typecheck, WebSocket runtime, and gameplay feel: not run in this session. Run locally before the next implementation slice.

## Next bounded slice

Run the client locally and report four checks: keyboard movement, diagonal movement, touch hold/release, and crossing a chunk boundary. Then choose whether to wire the client to the optional server or continue the browser-only world generator integration.


## Checkpoint 003 — final handoff

- Final documentation polish commit: 6550726 — docs: format world server commands.
- Final verification confirmed the target file set, package JSON, frame-based movement markers, deterministic world module exports, persistence boundary, and server contract markers through GitHub reads.
- Direct Node syntax execution was attempted but is unavailable in this session because the environment has no node binary. No install, mount, browser launch, or server launch was performed.
- Local next step remains unchanged: run npm install, npm run typecheck, npm run build, then test keyboard, diagonal, touch hold/release, chunk crossing, and optional world-server behavior on the user's machine.


## Checkpoint 004 — Netlify deployment hardening

- Date: 2026-08-30 (America/Vancouver)
- Target: jaydonweircontracting-ux/Adventure-game-
- Workflow: GitHub-only; no repository mount or game execution.
- Changes: declared Node 20.x in package.json and clarified the static-client boundary in README.md.
- Netlify contract preserved: npm run build, dist/public, Node 20, and SPA fallback in netlify.toml.
- Optional server.js, persistence.js, and world_generator.js remain outside the Netlify browser build path.
- Verification: GitHub tree, package manifest, Netlify config, README, and source imports inspected statically; npm install, npm run build, typecheck, and gameplay runtime were not run.
- Commits: c7013d6 (manifest correction with Node engine declaration), e1c25c8 (deployment-boundary documentation).


## Checkpoint 005 — persistent test horse

- Date: 2026-08-30 (America/Vancouver)
- Target: jaydonweircontracting-ux/Adventure-game-
- Workflow: GitHub-only; no repository mount or game execution.
- Client change: added a horse near the spawn point with proximity-based Mount horse / Dismount controls.
- Movement change: mounted speed is 118 versus walking speed 32; diagonal normalization and frame-time movement remain intact.
- Persistence behavior: the horse is stored with its chunk and position and is left at the exact dismount location, remaining available when the player returns.
- Netlify boundary: changes are limited to browser source and CSS; no server.js, WebSocket, persistence, or new package dependency was added.
- Static verification: GitHub readback confirmed horse state, mount distance, speed constants, persistence handler, test IDs, horse CSS, and Node 20 declaration. npm install, npm run build, typecheck, and gameplay runtime were not run.
- Commits: 1c84d21 (horse behavior), 29aa7a1 (horse styling), 32e798a (README controls).


## Checkpoint 006 — contextual horse control and scale

- Date: 2026-08-30 (America/Vancouver)
- Target: jaydonweircontracting-ux/Adventure-game-
- Workflow: GitHub-only; no repository mount or game execution.
- UI change: moved the Mount / Dismount control from the bottom action bar to a contextual button positioned beside the rendered horse.
- Visual change: scaled the CSS horse to 0.68 so its visible footprint is closer to the player sprite.
- Behavior preserved: proximity gating, mounted speed, chunk-aware horse persistence, and exact dismount placement.
- Netlify boundary: only src/App.tsx and src/index.css changed; no package, server, persistence, or deployment configuration changes.
- Static verification: confirmed contextual button placement, removed old horse-button selector, horse scale, persistence markers, and Node 20 declaration through GitHub readback. Build, typecheck, and runtime testing were not run.
- Commits: 0b85551 (contextual control), 1d57236 (horse scale).


## Checkpoint 007 — GitHub Pages deployment correction

- Date: 2026-08-31 (America/Vancouver)
- Target: jaydonweircontracting-ux/Adventure-game-
- Workflow: GitHub-only; no repository mount or game execution.
- Deployment target: GitHub Pages publishes the committed `docs/` directory; Netlify is not the active deployment target.
- Diagnosis: the green `pages build and deployment` check is GitHub's Jekyll publish of `docs/`; it is not a Vite source build. The duplicate custom Pages workflow failed at `Build the app` on every recorded attempt.
- Correction: remove `.github/workflows/publish-pages.yml` instead of changing `index.html` or package scripts.
- Verification: 39 successful runs are GitHub's `pages build and deployment` workflow; no successful custom Vite Pages run was found.
- Runtime/build verification: not run by design.
