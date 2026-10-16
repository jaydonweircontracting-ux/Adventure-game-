# World & Landscape Enhancement — Implementation Prompt

## Mission

Improve the existing Adventure Tile Game's **current 2D/isometric world and landscape** using the useful engineering ideas behind compact procedural world demos: world-coordinate sampling, deterministic terrain fields, coherent landforms, layered environmental detail, smooth lighting transitions, water continuity, and bounded rendering work.

**Do not build an ASCII game. Do not introduce a 3D camera, 3D geometry, ray-traced 3D renderer, WebGL ASCII compositor, or a separate prototype.** The current game, its visual identity, gameplay, controls, UI, and existing pixel-art/sprite assets remain authoritative.

## Repository context discovered

- Main app composition and legacy game wiring: `src/App.tsx`.
- Current world-map terrain source of truth: `src/game/worldMap.ts`.
- World-anchored landscape fields, macro/meso noise, regions, settlement influence, rivers/lakes, and water grids: `src/game/landscape.ts`.
- Sub-chunk elevation and cliff movement rules: `src/game/elevation.ts`.
- Static per-chunk terrain detail renderer: `src/game/groundDetail.ts`.
- Isometric renderer and camera: `src/game/iso/IsoFieldView.tsx`.
- Current asset directories and their established references must be preserved.
- Existing architecture notes explicitly require deterministic generation, stable saves/coordinates, bounded caches, culling, and no mass refactors.

The landscape system already contains much of the intended foundation. Extend it incrementally rather than replacing it or duplicating its responsibilities.

## Product outcome

Make the current world feel larger, more natural, more connected, and more alive while keeping its existing sprites and art style. Terrain should read as coherent regions rather than isolated random patches. Hills, valleys, forests, shorelines, rivers, lakes, roads, towns, and wilderness should transition naturally and remain consistent when the player crosses chunk boundaries.

## Hard constraints

1. Preserve the current game and all existing sprite/art assets. Do not convert the game to ASCII.
2. Preserve the current 2D/isometric presentation; no 3D world or camera conversion.
3. Preserve the default world seed, existing core-world layout, landmarks, town/road positions, controls, save format, and existing gameplay contracts.
4. Never use `Math.random()` or wall-clock time for generated world content.
5. Sample continuous spatial fields from **absolute world coordinates**, not chunk-local random positions, for terrain features that must cross chunk boundaries seamlessly.
6. Use subsystem-specific deterministic seeds for discrete placements so adding one kind of detail does not reshuffle unrelated systems.
7. Keep the existing world map authoritative. New fields must be additive and must not silently overwrite hand-authored landmarks or the starting area.
8. Retain all current assets, backups, documentation, saves, and recovery files. Do not perform broad cleanup as part of this task.
9. Keep rendering and simulation separate. Do not recompute terrain generation, water networks, sprite lookups, or immutable geometry in every animation frame.
10. Do not claim performance improvements without measurements or functional correctness without tests.

## Implementation sequence

### Phase A — Audit and baseline

- Trace how `worldMap.ts`, `landscape.ts`, `elevation.ts`, `groundDetail.ts`, and the field/isometric renderers are currently consumed.
- Identify the existing cache keys and invalidation rules for chunk ground, water grids, elevation, and static props.
- Record the existing behavior of the starting area, roads, settlements, and the two landmasses before changing generation.
- Keep the current core-world generation bit-identical unless a separately reviewed, explicit world-schema migration is approved.

### Phase B — Coherent macro landscape

Use the existing macro/meso/micro noise and region metadata to make landforms read at multiple scales:

- Broad forms: plains, rolling country, hill country, highlands, wetlands, and coast.
- Medium forms: connected forest belts, clearings, rocky outcrops, damp valleys, and meadow transitions.
- Fine detail: tufts, flowers, pebbles, leaf litter, cracks, and shoreline texture using the existing pixel-art rendering language.

Blend field influence gradually. Avoid noisy per-tile biome switching and hard square boundaries. Keep existing biome classification authoritative; use landscape fields to enrich rendering and compatible environmental placement rather than to contradict the map.

### Phase C — Elevation and movement consistency

- Preserve the existing elevation-cell model and movement rules.
- Ensure visual hill/cliff boundaries agree with walkability and never create inaccessible starting-area traps.
- Keep roads, bridges, settlement footprints, and designated flat areas traversable.
- Ensure adjacent chunks sample the same world-space elevation on either side of every boundary.

### Phase D — Water and shorelines

- Reuse the current world-anchored river/lake field and cached water grids.
- Rivers should continue across chunk edges without disconnected stubs; lake edges should be smooth and shallow-to-deep.
- Preserve the established ocean/coast behavior and road/bridge walkability.
- Avoid sampling expensive water calculations per pixel or per frame; cache coarse grids and invalidate only when relevant inputs change.

### Phase E — Settlement-to-wilderness gradients

Use the existing settlement-influence and land-use fields to guide compatible details:

- Town core: controlled vegetation, readable open space, roads, and existing buildings.
- Nearby farms/pasture: clearings and restrained field/fence detail where supported by current assets.
- Outer woodland: increasing tree and undergrowth density.
- Wilderness: natural variation in forest, rock, moisture, and landform.

Do not spawn new buildings or change landmark layouts in this pass. Do not add collision to scenery or alter NPC pathing unless a separate test-backed task explicitly requires it.

### Phase F — Rendering and performance

- Reuse the current static ground canvas and existing renderer caches.
- Cache immutable chunk/region results using stable keys and bounded capacity.
- Cull off-screen details before allocating render commands.
- Avoid frame-loop allocations, repeated whole-world scans, and repeated image readiness checks.
- Prefer low-cost color/tile variation and precomputed data over expensive per-pixel effects.
- Keep moving characters, NPCs, combat effects, and UI on their existing rendering paths.
- Any optional ambient lighting/day-night tint must be smooth, inexpensive, and must not flash or change sprite transparency unexpectedly.

### Phase G — Validation

At minimum, run:

- `npm run typecheck`
- `npm run test:iso-directions`
- `npm run build`

Also run any focused world-generation/landscape tests that exist or are added. Add tests for:
- Same seed and coordinates produce identical outputs.
- Adjacent chunks agree at shared world-space sample points.
- Road corridors and settlement/starting-area exclusions remain respected.
- Rivers/lakes are deterministic and bridge/road traversal remains valid.
- Existing core-world landmarks and coordinates remain unchanged.

For visual review, compare the same seeded locations before/after: starting town, forest edge, hill/cliff boundary, shoreline, river crossing, and far-continent coast. Confirm the bag/menu/minimap behavior and character/sprite rendering are unaffected.

## Deliverables

1. Small, reviewable commits on the experiment branch; no direct edits to the production branch.
2. Source changes that reuse existing landscape/world modules and art assets.
3. Focused regression tests and updated notes with actual commands/results.
4. A pull request describing exactly what changed, what was tested, and any remaining limitations.
5. No claim that a live deployment or browser playtest succeeded unless it was actually verified.

## Definition of done

The existing game still looks and plays like itself, but its terrain reads as a more coherent, continuous world. Existing assets remain in use. World generation is deterministic, chunk boundaries remain seamless, rendering work stays bounded, and all required checks pass. There is no ASCII rendering mode and no 3D engine conversion.
