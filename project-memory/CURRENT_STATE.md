# Current Project State

**Last updated:** 2026-10-12 (BUILD 629 in progress)
**Latest verified build:** 628 (cf670a4)
**Git HEAD:** cf670a4 (main)

## What this game is
Large grid-based, chunk-based open-world adventure RPG. 2.5D isometric is default.
Deploys via GitHub Pages. Build marker `window.__AG_BUILD` injected by `scripts/prepare-build-entry.cjs`.

## Architecture (non-negotiable)
- Preserve: grid, chunks, coordinates, 2.5D renderer, collision, world gen, NPCs, quests, combat, inventory, interiors, saves
- No rewrites, no second coordinate system, no duplicate architecture
- `src/App.tsx` (~10k lines): GameField component holds all gameplay state
- `src/game/`: 46 modules for world, entities, systems
- `src/game/iso/`: 2.5D renderer

## Recent changes
- BUILD 628: HUD reorganized — skills in backpack, zoom under HP, cleaner layout
- BUILD 627: Deer/wildlife attackable via shared combat pipeline
- BUILD 626: Build notes + changelog in main menu

## Unresolved issues
- ISSUE-004: GitHub Pages deployment stuck (monitoring)
- ISSUE-005: Townsfolk test failures pre-existing from BUILD 548
- ISSUE-006: Player exits from back of house (unverified)

## Next recommended tasks
1. Verify BUILD 628 HUD on phone
2. Investigate ISSUE-006 (exit position)
3. Monitor ISSUE-004 (deployment)

## How to run tests
```bash
npx tsx scripts/simulate.ts  # 41k+ assertions
npx tsc --noEmit             # 2 known baseline errors (TS1355, TS2367)
npm run build                # production build
```

## Detailed records
- `project-memory/ISSUES.json` — issue tracker
- `project-memory/BUILD_HISTORY.json` — build log
- `project-memory/CURRENT_STATE.md` — this file
