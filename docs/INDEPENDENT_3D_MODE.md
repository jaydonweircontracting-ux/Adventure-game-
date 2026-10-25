# Independent 3D Mode

## Goal
Add an opt-in 3D mode beside the existing 2D and 2.5D modes. The current engines remain the default and must not be replaced or rewritten.

## Current prototype
- Isolated WebGL scene in `src/game/engine3d/Engine3DView.tsx`.
- Ground tiles, a curved stone road, low-poly trees, and a simple player placeholder.
- Keyboard movement (WASD/arrows), touch D-pad, drag-to-orbit camera, and wheel zoom.
- Player movement is constrained to the prototype ground bounds and blocked near tree trunks.
- Mode host provides a separate opt-in Debug · Graphics panel (`?debug=1`) and direct test entry (`?mode=3d`). The 2D/2.5D renderer is still the existing app.
- This is still a standalone prototype: it does not yet load the authored world, NPCs, inventory, combat, quests, mounts, or player save state.

## Target architecture
- `src/game/engine3d/` owns the 3D renderer, camera, input mapping, scene lifecycle, and 3D-only asset adapters.
- Existing world/gameplay modules remain the source of truth for NPCs, inventory, combat, quests, time, and saves wherever their data contracts are compatible.
- A graphics-mode setting selects `2d`, `2.5d`, or `3d`; switching modes must dispose the previous renderer cleanly and preserve game state.
- 3D-only scene objects and caches must not mutate the existing isometric tile/chunk representation.
- The 3D renderer should be lazy-loaded so normal 2D/2.5D sessions do not pay its startup or memory cost.

## Remaining stages
1. Integrate the selector into the authoritative in-game Debug UI, not only the root-level opt-in panel.
2. Replace fallback geometry with a read-only adapter over shared world/chunk data.
3. Add robust collision against terrain, buildings, doors, and other entities.
4. Connect gameplay systems incrementally: NPC simulation, interactions, combat, inventory/loot, quests, mounts, and persistence.
5. Add proper loading/error recovery, WebGL resource cleanup/context-loss handling, performance monitoring, and mobile interaction testing.
6. Run typecheck, production build, existing regression suite, 3D-specific tests, and verify Pages deployment before calling it live.

## Non-negotiable regression rules
- 2D and 2.5D remain available and behave as before.
- Keep current map coordinates, chunks, collision, elevations, NPC simulation, combat, loot, and save data intact.
- Do not claim full 3D gameplay or deployment until implemented and tested.
