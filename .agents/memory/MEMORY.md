# Project Memory

## Deployment target

- Repository: jaydonweircontracting-ux/Adventure-game-
- Source of truth: the GitHub main branch.
- Make routine game updates in GitHub; do not mount or import the game into a Replit project for routine updates.
- Production deployment (verified 2026-10-16): `.github/workflows/deploy-pages.yml` runs the Vite build and deploys `dist/public` to GitHub Pages. Check that workflow's latest main-branch run and deployed `version.json` for every release; do not assume the old `docs/` snapshot is active.

## GitHub Pages rules

- The active source deployment is `.github/workflows/deploy-pages.yml`: verify its Build and Deploy jobs and confirm the published `version.json` / `window.__AG_BUILD` marker.
- The older committed `docs/` snapshot and Jekyll status may be stale; inspect them only if the active Pages configuration or deployment evidence points to that path.
- Do not add a duplicate Pages workflow. Preserve the current working deployment workflow.
- Keep GitHub Pages asset paths under the repository base path `/Adventure-game-/`.
- Never hand-edit generated `index.html` or `public/version.json`; update `scripts/prepare-build-entry.cjs` and let `predev`/`prebuild` regenerate them.
- Every package imported by src/ must be declared in package.json; browser/runtime imports belong in dependencies.
- Do not add Replit workspace catalog dependency markers to package.json.
- Keep the browser build free of Replit-only plugins or required local-only environment variables.

The successful deployment required declaring @tanstack/react-query and wouter as runtime dependencies.


## Mounted horse rendering guardrail

- The down-facing horse head overlay in `src/index.css` must use the same `horse-walk` animation as the horse body while mounted so both sprite layers stay synchronized.


## Published Pages sync guardrail

- When the user sends the repository link, inspect both GitHub source and the actual deployed artifact before making changes.
- First identify the active deployment workflow and its artifact path; this repository's current source workflow builds `dist/public`.
- Source changes are not live until the matching main-branch deployment workflow succeeds and the published build marker/manifest matches.
- Do not hand-edit generated build output. Use `predev`/`prebuild` and verify the generated artifact. If Pages configuration changes back to `docs/`, then trace `docs/index.html` and its exact bundle before fixing live visuals.

## Mounted rider/cow layer guardrail

- Keep the mounted visual stack explicit: cow body below the player head, cow head overlay above the player head. Apply it for every facing direction and synchronize the active bundle referenced by `docs/index.html`.


## Collaboration and checkpoint workflow

- Before substantive implementation, record the user's direction, planned scope, constraints, and pending work in the shared repository.
- Push that checkpoint to GitHub main before editing code so progress survives interrupted sessions, credit limits, or a handoff.
- Keep DEVELOPMENT_LOG.md and this memory file current with decisions, completed work, verification limits, and next steps.
- Another AI may be testing or polishing concurrently: reread the latest main state before each work slice, keep edits narrow, and avoid overwriting unrelated changes.
- Cleanup and optimization are allowed only when they preserve current gameplay, content, and player-facing behavior; do not add gameplay or content during polish passes.


## Progression and release guardrail

- Monster levels are internal gameplay state only: assign a hidden level to each monster, never render or announce that level to the player.
- As the player levels up, living monsters should scale upward in health and attack pressure; defeated monsters should remain defeated until their normal respawn.
- Monster XP should diminish with player progression and never fall below the configured minimum reward; show the actual awarded XP, not the hidden monster level.
- For every published gameplay change, synchronize the active bundle referenced by docs/index.html and increment its cache-busting build key so the live Pages game cannot keep serving a stale artifact.
- When the user returns with the Adventure-game GitHub link, inspect the latest main branch, src/App.tsx, DEVELOPMENT_LOG.md, .agents/memory/MEMORY.md, and the active docs bundle before making the next change.


## Published-bundle validation

- A green GitHub Pages workflow only confirms that committed files were published; it does not parse or execute the browser JavaScript.
- Before every manual docs-bundle update, run a browser-targeted JavaScript build/parser check and do not publish if it fails.
- If the game goes blank after a release, inspect the active docs JavaScript syntax before changing gameplay code.


## Completion and verification

- After every requested fix, confirm the change was committed to GitHub main, confirm the exact deployed artifact serves it, and report any deployment or cache delay.
- Do not stop after an attempted patch or call the work complete until the user confirms satisfaction; if the problem remains, continue tracing, fixing, and rechecking it.


## Release and play-test communication (2026-10-16)

- The user expects a fresh playable game URL with every game update.
- Always include the production play URL with a cache-busting build query after a release; clearly label it as production/current or as a preview if it does not contain the proposed changes.
- Never call a change live until the deployed build/artifact is independently checked.
- For update-checker work, compare the running build against both the deployed version manifest and the latest main-branch source build marker. A commit-message-only fallback is not authoritative.
- Preserve the existing 10-second live polling, visible checked time, orange update action, and explicit red error state. Do not say “latest” when the source/deployment check is incomplete.
