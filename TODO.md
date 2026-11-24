# ASHFALL Task Queue

This queue is ordered by value and risk, not novelty. Finish or reclassify the highest-priority item before starting lower-priority polish.

## P0 — Blockers

- [ ] Run the repository build and typecheck locally after the world-core changes.
- [ ] Confirm old browser saves load when the world-core state is absent or uses schema version 1.
- [ ] Fix any compile, save, or load regression before adding another system.

## P1 — Core simulation

- [ ] Advance WorldCore from one existing game-state transition rather than from the render loop.
- [ ] Persist the advanced world clock through the existing browser save path.
- [ ] Add focused deterministic checks for seeded RNG, calendar boundaries, time events, queued events, and schema migration.
- [ ] Separate world/player/AI/dungeon/quest persistence boundaries without breaking current saves.
- [ ] Expand simulated adventurers from a local route loop into persistent goal-driven agents.

## P2 — Living-world systems

- [ ] Add simulation LOD for nearby, regional, distant, and historical activity.
- [ ] Add world history records that are caused by actual events.
- [ ] Add faction state and relationships connected to settlements and NPCs.
- [ ] Add event-driven quest state connected to real world consequences.
- [ ] Add a lightweight economy only after settlement production and trade data exist.
- [ ] Improve geography so terrain, water, roads, resources, and settlements influence one another.

## P3 — Experience and polish

- [ ] Improve overworld terrain composition and landmark hierarchy.
- [ ] Make Mosslight Crossing feel more inhabited through contextual NPC activity.
- [ ] Persist Ember Vault runs after the overworld/dungeon save boundary is separated.
- [ ] Add mobile interaction polish after core simulation behavior is stable.

## P4 — Optional enhancements

- [ ] Add developer simulation controls and an inspector.
- [ ] Add benchmark history for generation, save/load, and simulation cost.
- [ ] Add expanded recovery and architecture documents as those systems become real.

## Working rules

- One authoritative implementation per system.
- Preserve working systems; do not create a disconnected demo.
- A feature is not complete because a type or placeholder exists. It must be integrated and verified.
- Commit each meaningful slice to GitHub before moving to the next one.
- Do not mount or launch the game for documentation-only changes.

## Current recommendation

The next implementation slice is the P1 world-clock integration. Keep it bounded: connect one existing state transition to WorldCore.advance, persist the result, and stop for local verification before adding NPC schedules, factions, or economy.


## P0 — Unity/Godot-class Adventure Engine (NEW — all requested capabilities tracked)

This is a cumulative engine-development program, not a claim that these systems already exist. Keep the existing Adventure game playable throughout. The detailed architecture, phase gates, and definition of done are tracked in PR #83: https://github.com/jaydonweircontracting-ux/Adventure-game-/pull/83

### P0.1 — Baseline, architecture, and preservation
- [ ] Audit the current 2.5D and 3D renderers, world data, saves, simulation, editor tools, importers, and deployment pipeline.
- [ ] Record build, typecheck, regression-test, browser-smoke, and performance baselines.
- [ ] Map existing systems to one authoritative engine architecture; identify duplicate/overlapping implementations before adding replacements.
- [ ] Define compatibility and migration rules for all existing saves and assets.
- [ ] Evaluate browser-compatible renderer, physics, animation, audio, scripting, and compression libraries; verify licence, maintenance, browser support, bundle size, and performance before adoption.
- [ ] Preserve the existing world layout, rivers, roads, settlements, NPC simulation, 2.5D default, and current production game. Keep 3D as an optional trial until parity gates pass.

### P0.2 — Engine core and project format
- [ ] Create a versioned, portable Adventure project format with manifest, settings, scenes, resources, input maps, and build profiles.
- [ ] Add schema validation, stable resource/entity IDs, dependency references, and project migrations.
- [ ] Implement entity/component architecture, parent-child hierarchy, transforms, activation, groups/tags, and lifecycle.
- [ ] Implement scene loading/unloading, additive scenes, transitions, async streaming, and checkpoints.
- [ ] Implement fixed-step simulation clock, interpolated rendering, deterministic seeded RNG, event bus/signals, input actions, and diagnostics.
- [ ] Add transactional undo/redo commands and crash-safe save/load.
- [ ] Test nested scene/resource round trips, migration, and old Adventure save compatibility.

### P0.3 — Scene editor and creator workflow
- [ ] Build hierarchy tree with multi-select, drag/reparent, grouping, visibility/lock, search, and context actions.
- [ ] Build 3D viewport with orbit/pan/fly cameras, orthographic/perspective modes, selection, gizmos, snapping, grids, and local/global transforms.
- [ ] Build inspector with editable component properties, validation, reset, and multi-object editing.
- [ ] Add reusable prefabs/packed scenes, nested instances, variants, overrides, and apply/revert.
- [ ] Add asset browser, project templates, scene templates, and blank-project creation.
- [ ] Add play-in-editor with isolated runtime state, pause, step, and speed controls.
- [ ] Ensure every editor action updates real project data, supports undo/redo, and survives save/reload.

### P0.4 — Renderer, materials, and visual pipeline
- [ ] Add a production-capable WebGL/WebGPU renderer behind a renderer adapter; preserve current 2.5D and existing 3D modes.
- [ ] Support scene graphs, perspective/orthographic cameras, PBR materials, texture maps, UVs, normal maps, roughness/metalness, alpha modes, vertex colours, and material instances.
- [ ] Add directional/point/spot lights, environment lighting, shadows, fog, sky, tone mapping, and post-processing.
- [ ] Add instancing, batching, frustum culling, LOD, texture/mesh compression, and asset streaming.
- [ ] Add rendering quality presets and visual regression tests.

### P0.5 — Complete asset/import pipeline
- [ ] Unify drag/drop, Import Hub, ZIP, folder, and project-pack imports behind one importer contract.
- [ ] Support binary and ASCII FBX, GLB/glTF, OBJ, PNG/JPEG/WebP textures, material dependencies, and supported audio formats.
- [ ] Preserve model transforms, hierarchy, UVs, normals, material slots, texture maps, colours, scale, and orientation.
- [ ] Support skeletons, skin weights, bind poses, animation clips, morph targets, and animation metadata.
- [ ] Add import presets, thumbnails, metadata, validation, duplicate detection, reimport, dependency relinking, and useful error reports.
- [ ] Harden ZIP handling against path traversal, expansion bombs, duplicate paths, malformed files, and memory exhaustion.
- [ ] Finish PR #82 only after the actual Free Medieval 3D People Low Poly Pack 2 files are tested and rendered correctly.
- [ ] Add real binary FBX fixtures and regression fixtures for GLB, glTF, and OBJ; verify textures/material colours and missing-dependency reporting.

### P0.6 — Physics, collision, and navigation
- [ ] Evaluate and select a maintained browser-compatible physics engine (including Rapier and alternatives) based on licence and integration tests.
- [ ] Add 3D rigid bodies, static/dynamic/kinematic modes, colliders, collision layers/masks, triggers, raycasts, shape casts, joints, and character controllers.
- [ ] Add 2D physics for 2D projects and appropriate overlays.
- [ ] Add fixed-step physics, interpolation, sleeping, continuous collision detection, and debug drawing.
- [ ] Add navigation mesh/grid/path graph adapters for agents.
- [ ] Preserve existing tile collision and placement validation until parity tests prove safe migration.

### P0.7 — Animation, character creation, and AI
- [ ] Add skeletal animation player, blend trees, state machines, transitions, layers, additive poses, retargeting, root motion, and animation events.
- [ ] Add character controller, camera rigs, inverse-kinematics hooks, attachment sockets, and equipment slots.
- [ ] Build character/NPC creator and reusable character rigs with directional movement and animation previews.
- [ ] Add behaviour trees, state machines, utility AI, navigation/path following, perception, schedules, and event-driven behaviours.
- [ ] Integrate existing living-world simulation, NPC economy, jobs, factions, and schedules as reusable engine components.

### P0.8 — Scripting and visual programming
- [ ] Add sandboxed TypeScript/JavaScript gameplay scripts with stable engine API and development hot reload.
- [ ] Define explicit capability boundaries; never run imported project scripts with unrestricted browser/file/network privileges.
- [ ] Add script lifecycle hooks, signals/events, timers, async tasks, component access, serialization, and debugging.
- [ ] Add visual scripting graph editor for events, conditions, variables, and actions using the same runtime API.
- [ ] Add diagnostics, stack traces, breakpoints where supported, API versioning, and example projects.

### P0.9 — Audio, UI, input, and effects
- [ ] Add audio buses/mixer, spatial audio, attenuation, effects, music/ambience, streaming, and import previews.
- [ ] Add responsive UI canvas/layout, anchors, containers, themes, fonts, controls, focus/navigation, accessibility, and touch support.
- [ ] Add particle systems, trails, decals, weather, emitters, and reusable visual effects.
- [ ] Add action-based keyboard, mouse, touch, and controller input maps, rebinding, and per-context layers.

### P0.10 — World Studio and level authoring
- [ ] Add terrain sculpt/paint, heightmaps, material painting, water/river tools, foliage, biome painting, roads/paths, building placement, and spline tools.
- [ ] Add deterministic procedural generation with seeds, tilemap/isometric authoring, chunk editing/streaming, region tools, and prefab stamping.
- [ ] Add world validation for collision gaps, unreachable areas, missing references, broken navigation, invalid placements, and performance hotspots.
- [ ] Make all world edits non-destructive, undoable, and safe for the existing hand-authored Adventure map.
- [ ] Verify river continuity, bridges, roads, settlements, chunk boundaries, and existing world coherence after every world-tool milestone.

### P0.11 — Testing, profiling, export, and documentation
- [ ] Add unit, integration, visual, importer-fixture, save-migration, and browser/device tests.
- [ ] Add CPU/GPU (where exposed), memory, draw-call, triangle, asset-load, simulation-tick, and frame-pacing profiler.
- [ ] Add benchmark history for generation, import, save/load, rendering, and simulation.
- [ ] Add project backups, portable project export/import, asset packs, and recovery tools.
- [ ] Add web/PWA build profiles and independent playable exports; evaluate desktop/other targets only after abstractions and licences are validated.
- [ ] Add conflict-aware scene/resource serialization and optional version-control/collaboration workflows.
- [ ] Document engine APIs, project format, import formats, scripting, editor tools, and sample projects.

### Delivery gates (must pass in order)
- [ ] Gate 0: architecture audit and baseline; no gameplay regression.
- [ ] Gate 1: project format + scene/component runtime round-trip and migration tests.
- [ ] Gate 2: hierarchy + viewport + inspector + undo/redo + isolated play-in-editor.
- [ ] Gate 3: real materials/textures + model imports + medieval character pack visually verified.
- [ ] Gate 4: physics + collision + navigation + sandboxed gameplay scripting.
- [ ] Gate 5: animation + audio + UI + input + VFX sample project.
- [ ] Gate 6: World Studio tools safely edit/reopen Adventure world and pass river/bridge/world-coherence regressions.
- [ ] Gate 7: independent web export, profiler, full regression matrix, and production deployment verification.

### Definition of done
- [ ] A creator can start a blank project, create scenes and reusable objects, import/configure assets, script interactions, use physics/animation/audio/UI/VFX, author terrain/levels, test/profile, save/reopen, and export a playable game without editing Adventure-specific source code.

**Execution rule:** Work in small, independently testable vertical slices. Do not mark a checklist item complete until implementation, integration, automated checks, and relevant in-game verification all pass. Never merge or deploy a failing slice.
