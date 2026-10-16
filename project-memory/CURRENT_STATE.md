# Current Project State

**Last updated:** 2026-10-16 (BUILD 728 proposed)
**Latest verified build:** 633 (66eec15) — confirmed live via curl
**Git HEAD:** 66eec15 (main)

## What this game is
Large grid-based, chunk-based open-world adventure RPG. 2.5D isometric is default.
Deploys via GitHub Pages. Build marker `window.__AG_BUILD` injected by `scripts/prepare-build-entry.cjs`.

## Architecture (non-negotiable)
- Preserve: grid, chunks, coordinates, 2.5D renderer, collision, world gen, NPCs, quests, combat, inventory, interiors, saves
- No rewrites, no second coordinate system, no duplicate architecture
- No server — GitHub Pages static hosting only
- `src/App.tsx` (~10k lines): GameField component holds all gameplay state
- `src/game/`: 46 modules for world, entities, systems
- `src/game/iso/`: 2.5D renderer

## Recent changes
- BUILD 634: Backoff on update check failures, deployment verification tests
- BUILD 633: Real-time update banner (10s poll)
- BUILD 632: Save button in main menu
- BUILD 631: Tri-color update banner
- BUILD 630: Update checker + deployment guard script

## Deployment status
- Live: BUILD 633 (verified 2026-10-12 via curl)
- Pushed: BUILD 633 (66eec15)
- Deployed: BUILD 633 (Actions succeeded)
- Verified: YES — live build matches expected

## Unresolved issues
- ISSUE-005: Townsfolk test failures pre-existing from BUILD 548
- ISSUE-006: Player exits from back of house (unverified)

## Resolved
- ISSUE-004: GitHub Pages deployment stuck — RESOLVED (deployments now propagating normally)

## Next recommended tasks
1. Verify BUILD 633 HUD on phone
2. Investigate ISSUE-006 (exit position)

## How to run tests
```bash
npx tsx scripts/simulate.ts  # 41k+ assertions
npx tsc --noEmit             # 2 known baseline errors (TS1355, TS2367)
npm run build                # production build
./scripts/check-deployment.sh [build]  # verify live deployment
```

## Detailed records
- `project-memory/ISSUES.json` — issue tracker
- `project-memory/BUILD_HISTORY.json` — build log
- `project-memory/CURRENT_STATE.md` — this file

## Active task — 2026-10-16: restore update checker and release verification

- User reports the main-menu live update indicator no longer reliably turns orange, polls, or warns when the running build is stale.
- Source inspection found generated markers were stale in the tracked tree (public/version.json 707, root index.html 712) while the authoritative build script had reached 727. The build script generates both files; BUILD 728 adds `predev` so local dev also regenerates them instead of hand-editing generated output.
- Current update checker trusts version.json and only checks GitHub's latest commit message for a `BUILD N` string; commits without that format can be incorrectly shown as current.
- docs/index.html points at a fixed old asset pair and docs/version.json is absent. The exact production Pages source must be confirmed; repository brain rules require checking the deployed artifact, not assuming src/ changes are live.
- BUILD 725 restored orange checking/current status and stale-manifest errors; BUILD 726 cleaned house outlines; BUILD 727 fixed dagger visibility. BUILD 728 adds authoritative source-build comparison and manual Check now while preserving those changes.
- User also expects a fresh playable link with every update; include the production play URL with cache busting and label deployment status honestly.
- Status: implementation committed to `fix/live-update-version-checker-728`; CI, merge, and live artifact verification pending.
