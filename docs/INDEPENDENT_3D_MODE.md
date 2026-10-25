# Independent 3D Mode

## Goal
Add an opt-in 3D mode beside the existing 2D and 2.5D modes. The current engines remain the default and must not be replaced or rewritten.

## Architecture
- `src/game/engine3d/` owns the 3D renderer, camera, input mapping, scene lifecycle, and 3D-only asset adapters.
- Existing world/gameplay modules remain the source of truth for NPCs, inventory, combat, quests, time, and saves wherever their data contracts are compatible.
- A graphics-mode setting selects `2d`, `2.5d`, or `3d`; switching modes must dispose the previous renderer cleanly and preserve game state.
- 3D-only scene objects and caches must not mutate the existing isometric tile/chunk representation.
- The 3D renderer must be lazy-loaded so normal 2D/2.5D sessions do not pay its startup or memory cost.

## Staged implementation
1. Add mode contract and isolated engine entry point.
2. Wire a Debug graphics-mode selector into the existing debug UI after locating the authoritative mode/renderer owner.
3. Build the 3D scene from shared world data, beginning with a small test area and fallback geometry.
4. Add camera controls, player movement, collision, and asset adapters.
5. Connect gameplay systems incrementally and test each integration.
6. Run typecheck, production build, existing regression suite, mobile input checks, and verify the Pages deployment before calling it live.

## Non-negotiable regression rules
- 2D and 2.5D remain available and behave as before.
- Keep current map coordinates, chunks, collision, elevations, NPC simulation, combat, loot, and save data intact.
- Do not claim full 3D gameplay or deployment until implemented and tested.
