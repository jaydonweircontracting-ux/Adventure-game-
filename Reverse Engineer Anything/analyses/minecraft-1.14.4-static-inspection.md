# Minecraft 1.14.4 package inspection — Adventure adaptation

**Status:** preliminary static package inspection, 2026-11-22  
**Target:** user-supplied `Minecraft 1.14.4 (READ TXT FILE ON HOW TO PLAY).zip`  
**Important provenance:** this report was produced by inspecting the supplied archive and its JAR contents with standard ZIP/JDK tooling. It is **not** an REA-generated Evidence bundle, and it does not claim REA MCP execution. Do not describe it as an REA run.

## 1. Package facts observed

- The supplied archive contains a portable Minecraft Java Edition 1.14.4 client, a matching `minecraft_server.1.14.4.jar`, Java runtime files, shader-pack ZIPs, and saved-world folders.
- The client version metadata identifies `1.14.4`, release date `2019-07-19`, and main class `net.minecraft.client.main.Main`.
- The client JAR contains 13,083 ZIP entries (about 35.1 MB uncompressed in this inspection).
- The client JAR includes 1,201 block model JSON files, 677 blockstate JSON files, and 641 block texture PNG files under `assets/minecraft`.
- The JAR's classes are predominantly obfuscated short names, so meaningful renderer/world-generation method reconstruction requires mappings plus a Java bytecode decompiler or a suitable REA provider workflow.
- The packaged client JAR did not expose a `data/minecraft/worldgen/` resource directory in this inspection. The matching server JAR also did not expose that path. Do not infer that world generation is absent; much of the 1.14.4 implementation is in compiled Java classes.

## 2. Directly observed rendering/resource patterns

### Block models are data-driven

The supplied `assets/minecraft/models/block/cube.json` defines a full 16×16×16 cube with six independent faces. Each face has its own texture reference and a `cullface` direction. This is a concrete reference for a block-face renderer that omits faces hidden against adjacent opaque blocks.

The supplied `cube_column.json` inherits from `block/cube` and maps top/bottom faces to an end texture and the four side faces to a side texture. This is a useful model for logs, cliff strata, and other materials with different horizontal/vertical surfaces.

### Blockstates select model variants

The supplied `blockstates/grass_block.json` selects among rotated grass models for `snowy=false`, and selects a snow-covered model for `snowy=true`. The supplied `blockstates/stone.json` chooses among mirrored/rotated model variants. This shows a clean separation between a block's state and the geometry/material variant selected for rendering.

### Water is a distinct material/render path

The supplied `blockstates/water.json` points to `block/water`; `models/block/water.json` exposes a still-water particle texture. The archive also contains dedicated water textures such as `water_overlay.png`. This small JSON model is not the water simulation or complete fluid renderer; the actual fluid geometry/animation behavior is implemented in compiled game code and must be investigated separately.

## 3. Patterns worth adapting to Adventure

These are architectural recommendations inferred from the observed resources, not claims about recovered Minecraft internals.

1. **Separate logical block state from rendered geometry.** Keep terrain/material identity, orientation, shape, and environmental state in data; resolve those into a render model at draw/mesh-build time.
2. **Cull hidden voxel faces.** For a block face adjacent to an opaque solid block, do not emit that face into the chunk mesh. Preserve faces adjacent to transparent, cutout, fluid, or differently layered materials according to explicit material rules.
3. **Use per-face material/UV mapping.** A block can have different top, bottom, and side textures. Avoid stretching one texture across every surface.
4. **Support model variants from state.** Orientation, snowy state, waterlogged state, damage stage, and material variant should select a model/material without duplicating world simulation logic.
5. **Keep fluids separate from solid terrain.** Water needs its own surface height, transparency/render ordering, animation inputs, flow direction, depth/shoreline information, and collision/swimming semantics. Do not represent rivers as ordinary opaque cube blocks.
6. **Build chunk meshes from authoritative world data.** Generate render geometry from chunk-local block/height data, cache it, and invalidate only affected chunks when edits occur. Keep simulation and save data independent from GPU buffers.
7. **Use level-of-detail and visibility controls.** Avoid rebuilding static geometry every frame. Rebuild on edits or chunk changes; cull chunks outside the camera view and use coarser distant representations.

## 4. Adventure-specific integration points confirmed from repository source

The current Adventure `src/game/engine3d/rivers.ts` already has a deterministic priority-flood drainage model over `groundElevation`, flow accumulation, Strahler channel orders, variable river widths, bank queries, and stored downstream flow directions. It stamps rivers into the existing water terrain path rather than creating a second water system.

The same file explicitly says the current river module does not own rendering and that water is rendered through the existing `effTerrainFor` / world-render path. This is the right seam for a water-surface renderer; do not replace the working drainage model to get Minecraft-like visuals.

The same module documents bridge crossings as a later stage and exposes `filledElevationsFor`, intended to supply the drainage surface for waterfall and bridge heights. Preserve that data contract.

Adventure's `src/game/iso/isoWorld.ts` is the data model/persistence/edit-operations layer for the isometric world and imports `groundNoise` from `townLook`. Keep world facts and persistence there or in the established engine modules; keep render meshes as derived/cache data, not saved world state.

## 5. Recommended implementation sequence

### A. Improve current world rendering without replacing world data

- Read `groundElevation` and the existing river centreline/width/bank/flow metadata.
- Build a dedicated river surface mesh with continuous flow direction, smooth width transitions, visible banks, and a water surface that follows the filled drainage elevation.
- Add shoreline transition geometry/materials and foam/rapids only where the elevation/flow data supports them.
- Add waterfall geometry only where adjacent filled elevations show a meaningful drop.
- Keep road-crossing metadata and build bridge decks at the sampled river surface height.

### B. Add a reusable voxel/heightfield chunk renderer

- Define a renderer-facing block/material registry with opaque, cutout, transparent, and fluid render classes.
- Add a chunk mesher that emits only visible faces and supports independent face textures/UVs.
- Keep chunk dimensions configurable and benchmark 16×16 horizontal regions against the current renderer before selecting a production size.
- Keep height/elevation as authoritative world data; derive side walls/cliffs from neighbouring height differences rather than flattening the world into a single plane.
- Add chunk dirty flags and incremental rebuilds; never regenerate every chunk every frame.

### C. Only then expand block interaction

- Add place/remove/edit operations through the existing world-edit/persistence path.
- Ensure pathfinding, collision, placement occupancy, water, and save/load all read the same authoritative block/terrain state.
- Preserve Adventure's authored settlement layout and existing world-generation constraints.

## 6. What remains unverified / next REA pass

- No REA CLI/MCP invocation was possible in this execution environment: there is no registered REA tool exposed to this session; the local Node runtime here is 22.16.0, below the repository's documented REA minimum of 22.19; and an npm registry metadata request timed out.
- The Minecraft Java client classes are obfuscated. No class decompilation, call-graph recovery, runtime capture, or renderer behavior trace was performed.
- The portable archive's bundled Windows client cannot be launched in this Linux execution environment as supplied.
- No saved-world contents were inspected or copied.
- The next proper REA investigation should run in the existing Muse/developer environment with its registered REA MCP, target the extracted client/server JARs, and include mapped/decompiled Java class evidence for chunk section storage, block-face meshing, fluid rendering, lighting, terrain noise, chunk scheduling, and world-generation pipelines. If the installed REA release does not support Java bytecode/JAR analysis directly, use a Java decompiler/mapping workflow as the REA investigation's explicitly identified provider handoff rather than pretending a generic artifact inventory is a decompilation.

## 7. Source files inspected

- `Minecraft 1.14.4 Java Edition/Minecraft 1.14.4 Portable/versions/1.14.4/1.14.4.jar`
- `Minecraft 1.14.4 Java Edition/Minecraft 1.14.4 Portable/versions/1.14.4/1.14.4.json`
- `Minecraft 1.14.4 Java Edition/Minecraft 1.14.4 Portable/server/minecraft_server.1.14.4.jar`
- Client resources: `assets/minecraft/models/block/cube.json`, `cube_column.json`, `water.json`, `blockstates/grass_block.json`, `blockstates/stone.json`, `blockstates/water.json`
- Adventure source: `src/game/engine3d/rivers.ts`, `src/game/iso/isoWorld.ts`


## 8. Adventure implementation — BUILD 1122

Commit: `03e46d7376f41f4c2ef702c155ca8b8d45716066`

File changed: `src/game/engine3d/worldRender3d.ts`

- Added a shared `renderSurfaceElevation` sampler to the world-mesh builder.
- Samples inside the authored 200×200 map remain unchanged.
- Samples outside the authored map are snapped to half-world-unit elevation steps (`Math.round(height * 2) * 0.5`), producing level voxel caps and more legible exposed cliff faces.
- The same sampler now feeds the terrain corner cache and the renderer's surface/prop placement call sites, so wilderness trees and rocks use the same stepped ground height as the terrain.
- Water remains governed by the existing land/water blend and is not snapped into raised solid blocks.
- No world save schema, river drainage, road layout, settlement placement, collision, or walkability code was changed.

**Verification:** the commit was pushed to `main`; GitHub Actions deployment run `45094328347` was observed starting. Its typecheck, regression suite, and deployment result must be checked before calling this change verified or live.

**Scope reminder:** this is a first implementation pass toward the Minecraft-like wilderness terrain. It does not yet add textured block atlases, true 3D chunk section storage, dynamic lighting, or a recovered Minecraft Java renderer. The report remains a static package inspection, not an REA-generated reverse-engineering evidence bundle.
