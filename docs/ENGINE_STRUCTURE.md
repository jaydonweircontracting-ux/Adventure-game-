# Engine Structure and Safe Refactor Plan

## Non-negotiable preservation rules

- Do not delete game code, assets, backups, saves, tests, documentation, or historical recovery files as part of cleanup.
- Preserve gameplay behavior, world-generation seeds, coordinates, collision rules, controls, NPC/quest/combat behavior, and save compatibility.
- Keep changes in small, build-verified commits. A folder move is not complete until all imports, tests, type checks, and the production build pass.
- Keep the existing public GitHub Pages deployment working throughout the refactor.

## Current ownership map

| Area | Current home | Responsibility |
|---|---|---|
| App composition and legacy game systems | `src/App.tsx` | Main UI, game state, simulation integration, and several world-generation exports still consumed by the isometric view |
| Isometric presentation | `src/game/iso/IsoFieldView.tsx` | Canvas frame loop, camera, tile rendering, depth sorting, props, buildings, NPCs, critters, and pointer input |
| Isometric projection and chunk math | `src/game/iso/projection.ts`, `isoChunks.ts` | Coordinate transforms, visible tile ranges, and chunk offsets |
| Isometric tile selection and image loading | `src/game/iso/isoTiles.ts` | Deterministic ground/decor selectors and cached image assets |
| Isometric character rendering | `src/game/iso/characterSystem.ts`, `isoSprites.ts` | Sprite loading, directional mapping, and animation |
| Isometric wildlife | `src/game/iso/critters.ts` | Deterministic ambient wildlife, poses, sprite loading, and drawing |
| Town layout and settlement geometry | `src/game/mosslightLayout.ts`, `src/game/settlements.ts`, plus exports in `src/App.tsx` | Procedural town layouts, buildings, lanes, props, and doorways |
| Landscape/water fields | `src/game/landscape.ts` | Deterministic world fields and water grids |
| Building asset conventions | `src/game/buildingRig.ts` | Shared building metadata and anchor/scale conventions |
| Tests and developer tools | `tests/`, `scripts/`, `QA/` | Regression checks, build preparation, QA notes, and test harnesses |
| Historical material | `backups/`, existing recovery docs | Recovery only; retain and do not bundle into gameplay imports |

## Target source layout

Move code into these ownership boundaries incrementally, not in one risky mass move:

- `src/game/app/` — UI composition and screen-level wiring only.
- `src/game/simulation/` — fixed-step game updates, movement, combat, NPC decisions, quests, and interactions.
- `src/game/world/` — world generation, chunks, terrain fields, buildings, settlement data, and coordinate-independent queries.
- `src/game/rendering/` — renderer-independent render data, visibility helpers, and asset caches.
- `src/game/iso/` — isometric projection, canvas renderer, sprites, animation, and isometric-specific assets.
- `src/game/ui/` — HUD, menus, dialogs, inventory, and reusable UI.
- `src/game/persistence/` — save/load and save-version compatibility.
- `src/game/shared/` — small pure types/constants/helpers used by multiple domains.
- `public/` — runtime-loaded assets only; keep documentation, backups, source art, and tools outside runtime asset paths unless intentionally required.

The existing paths remain valid during migration: extract a module, then re-export it from the old path as a compatibility shim. Only remove an old implementation after references are migrated and all validation passes. Do not copy assets into duplicate folders just to make the tree look tidy.

## Performance rules

1. Keep simulation updates independent from canvas paint frequency.
2. Never regenerate deterministic world layouts, image maps, path geometry, or sprite variants inside the animation-frame callback.
3. Use constant-time readiness checks in hot loops; image load/error events should update counters.
4. Cull off-screen objects before allocating render commands.
5. Cache static terrain/decor separately from moving characters and interactive effects when cache invalidation can be proven correct.
6. Reuse frame buffers; avoid per-frame temporary arrays/objects and nested scans where practical.
7. Do not lower frame rate or remove visible game features to disguise slow frames.
8. Measure startup, frame time, long frames, and memory on both a cold load and a warmed-up run. Do not claim zero lag without measurement.

## Refactor sequence

1. **Hot-path cleanup:** remove repeated scans/allocations and memoize immutable geometry; preserve visual output.
2. **Baseline instrumentation:** add reproducible frame-time/startup measurements and retain results in `docs/PERFORMANCE_BASELINE.md`.
3. **Render separation:** extract pure render helpers and caches from the large canvas component, keeping the old component API stable.
4. **World/simulation separation:** move pure world-generation and query functions out of `App.tsx`; preserve old exports until all callers migrate.
5. **UI and persistence separation:** isolate UI domains and save/load code without changing save format.
6. **Organization cleanup:** group tests, scripts, and documentation by purpose; keep historical and recovery files intact.
7. **Validation after every stage:** run `npm run typecheck`, `npm run test:iso-directions`, and `npm run build`; run the available gameplay regression tests and verify GitHub Pages deployment.

## Current performance work

- Tile and critter asset readiness now uses load-event counters rather than scanning all image objects every frame.
- The isometric canvas keeps pixel-art smoothing disabled once per frame, avoiding repeated canvas-state toggles per tile.
- Water-depth-only terrain checks avoid temporary object allocations.
- Settlement decor is cached by world chunk, and building art variants are cached by stable scene-building object.
- Off-screen props, trees, ores, and wildlife remain culled before they enter the depth-sort queue.

These are targeted hot-path improvements, not a claim that all lag is solved. The next major step is profiling and caching static terrain/render layers while keeping dynamic entities and gameplay logic separate.


## BUILD 716 implementation progress

- `src/game/iso/boundedCache.ts` now owns the bounded insertion-order cache policy used by the isometric renderer. It is independent of React and world-generation imports.
- `src/game/iso/frameMetrics.ts` provides a fixed-size rolling frame-time window (average, p95, and estimated FPS).
- `src/game/iso/IsoFieldView.tsx` now raster-caches the static ground pass into a capped viewport-sized canvas. Animated characters, wildlife, props, combat text, and other depth-sorted objects remain on the main canvas. The cache rebuilds when zoom/viewport/chunk/render mode or terrain asset readiness changes, and when camera movement exits the cached world rectangle. Farmstead placement requests are retained alongside the cached ground so buildings still enter the depth-sorted pass.
- The isometric renderer can display live measurements when opened with `?perf=1`. The overlay is opt-in; normal gameplay does not allocate metric snapshots or draw the overlay.
- The renderer uses the shared bounded-cache helper for deterministic settlement decor and ambient wildlife. Cache capacity remains 32 entries and eviction remains oldest-inserted-first.
- No existing source, asset, backup, save, or test files were removed.

## Safe migration sequence (active)

1. Extract renderer utilities behind small, dependency-light modules while keeping visible behavior unchanged.
2. Add repeatable measurements before changing rendering architecture.
3. Keep extracting the ground pass behind a dedicated renderer boundary and verify cache invalidation/visual parity across zoom levels, resize, terrain asset loading, water, farmland, and neighboring chunks. The current viewport cache is intentionally capped; do not allocate one enormous full-chunk bitmap because the world chunks are too large for that to be safe on mobile.
4. Split `App.tsx` by domain. Move a complete dependency cluster at a time, and preserve the old exports as compatibility re-exports until all imports and tests are migrated.
5. Validate direction mapping, world-generation determinism, collision, save migration, simulation suites, type checking, and the production build after each stage.

The current changes are an instrumented refactor stage, not a claim that the entire engine has already been decomposed or that frame rate has been proven faster. Record before/after measurements in `docs/PERFORMANCE_BASELINE.md` on the same device, zoom, and scene.
