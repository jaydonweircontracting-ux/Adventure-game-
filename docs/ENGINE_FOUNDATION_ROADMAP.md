# Adventure Engine — Unity/Godot-Class Foundation Roadmap

## Goal

Evolve Adventure from a game-specific browser renderer into a general-purpose, creator-owned game engine with the practical capabilities people use Unity and Godot for: authoring scenes, composing reusable objects, importing assets, scripting behaviours, building worlds, running physics and animation, creating UI/audio/VFX, testing, saving, and publishing games.

This is an original implementation built around Adventure's existing TypeScript/browser stack. It is not a literal embedding or copy of Unity or Godot, and it must not copy proprietary source, editor UI, trademarks, or licensed assets. Reuse compatible open-source libraries only after checking their current licences and browser support.

## Non-negotiable constraints

- Preserve the existing Adventure game, save data, world layout, terrain, settlements, NPC simulation, and current 2.5D mode.
- Keep the existing 3D trial available while the new runtime is developed; do not switch the default renderer until parity tests pass.
- No fake features: a control is not shipped until it changes real project data and survives save/reload.
- All project data is versioned, validated, migratable, and exportable. Do not make IndexedDB or localStorage the only copy of a user's work.
- Keep rendering, simulation, editor state, and persistence separate. Editor tools must not mutate the live game accidentally.
- Support desktop and touch workflows, with sensible performance budgets and progressive loading.
- Every milestone includes automated tests, a sample project, migration coverage, and a rollback path.

## Target architecture

### 1. Engine core and project format

Create a versioned `AdventureProject` format with a manifest, settings, scenes, resources, input maps, build profiles, and dependency references. Add a project upgrader and schema validation.

Core runtime services:
- Engine lifecycle and deterministic frame scheduler (fixed simulation step + interpolated render).
- Entity/component system with stable IDs, parent-child hierarchy, transform propagation, activation, groups/tags, and lifecycle hooks.
- Resource manager with stable GUIDs, dependency graph, caching, reference tracking, import settings, and hot reload.
- Event/message bus, signals, typed input actions, time service, random seeds, and diagnostics.
- Scene loading/unloading, additive scenes, transitions, checkpoints, and async streaming.
- Undo/redo command history shared by editor tools, with transactions and recoverable operations.

### 2. Scene and object authoring

Build a real Scene Editor:
- Hierarchy tree, multi-select, drag/reparent, visibility/lock, grouping, search, and context actions.
- Viewport with orbit/pan/fly cameras, orthographic/perspective modes, gizmos, snapping, grids, local/global transforms, and selectable handles.
- Inspector with editable component properties, validation, reset, and multi-object editing.
- Reusable prefabs/packed scenes, nested instances, overrides, variants, and safe apply/revert.
- Scene templates, reusable project templates, and asset browser.
- Save/load round-trip tests for hierarchy, transforms, references, and overrides.

### 3. Rendering and materials

Move toward a production WebGL/WebGPU-capable renderer (Three.js is a candidate integration layer, not the whole engine):
- Scene graph rendering, perspective and orthographic cameras, physically based materials, texture maps, normal maps, roughness/metalness, alpha modes, vertex colours, and material instances.
- Directional/point/spot lights, ambient environment, shadows, fog, sky, tone mapping, post-processing, and quality presets.
- Instancing, batching, frustum/occlusion culling where appropriate, LOD, texture compression, mesh compression, and asset streaming.
- Keep the existing flat/isometric renderer as a supported Adventure presentation mode, not a forced migration.

### 4. Asset pipeline

Create one importer/processor contract used by drag-and-drop, Import Hub, ZIP, folders, and project packs:
- Models: GLB/glTF, FBX (binary and ASCII), OBJ, and later USD/other formats only where browser-safe decoders exist.
- Textures: PNG/JPEG/WebP and supported compressed GPU formats; preserve UVs and bake/convert only when explicitly requested.
- Materials: preserve slots and material properties; resolve external dependencies and report missing files clearly.
- Animation: skeletal rigs, skin weights, bind poses, clips, morph targets, retargeting metadata, and animation events.
- Audio: WAV/MP3/OGG as supported by browser playback and decoding.
- 2D: spritesheets, atlases, tile sets, fonts, and nine-slice assets.
- Import presets, thumbnails, metadata, validation, duplicate detection, reimport, dependency relinking, and readable failure reports.
- ZIP import must defend against path traversal, oversized expansion, duplicate paths, malformed files, and memory exhaustion.

FBX PR #82 is only the first importer slice. Before it is merged, test the actual medieval pack, material/texture dependencies, binary variants, malformed files, and regressions for GLB/glTF/OBJ. The current vertex-colour-only renderer is not sufficient for the target material pipeline.

### 5. Physics and interaction

Add a physics adapter with a maintained browser-compatible engine (evaluate Rapier and alternatives before selecting):
- 3D rigid bodies, static/dynamic/kinematic modes, colliders, collision layers/masks, triggers, raycasts, shape casts, joints, and character-controller support.
- 2D physics for 2D projects and UI/gameplay overlays where appropriate.
- Fixed-step simulation, deterministic settings where feasible, interpolation, sleeping, CCD, and debug draw.
- Navigation meshes or grid/path graph integration for agents.
- Preserve Adventure's existing tile collision and placement validation through adapters until equivalent physics tests pass.

### 6. Animation, characters, and AI

- Skeletal animation player, blend trees/state machines, transitions, layers, additive poses, retargeting, root motion, and animation events.
- Character controller, camera rigs, inverse kinematics hooks, attachment sockets, and equipment slots.
- Behaviour trees, state machines, utility AI, navigation/path following, perception, schedules, and event-driven NPC behaviour.
- Keep the existing living-world simulation and NPC economy as first-class systems that can be attached to reusable scene entities.

### 7. Scripting and gameplay logic

Provide a documented, sandboxed scripting layer:
- TypeScript/JavaScript gameplay scripts with a stable engine API and hot reload in development.
- Explicit capability boundaries for file/network access; never execute arbitrary imported project scripts with unrestricted browser privileges.
- Script lifecycle hooks, signals/events, timers, coroutines/tasks, component access, serialization, and debugging.
- Visual scripting graph editor for common events, conditions, variables, and actions; graphs compile to the same runtime API.
- Versioned API, diagnostics, stack traces, breakpoints where supported, and example scripts.

### 8. Audio, UI, VFX, and input

- Audio buses/mixer, spatial audio, attenuation, effects, music/ambience, streaming, and import previews.
- UI canvas/layout system with anchors, containers, responsive sizing, themes, fonts, controls, focus/navigation, accessibility, and touch support.
- Particle systems, trails, decals, weather, emitters, and reusable visual effects.
- Action-based input mapping for keyboard, mouse, touch, controller, rebinding, and per-context input layers.

### 9. World and level tools

Make World Studio a general authoring workspace:
- Terrain sculpt/paint, heightmaps, materials, water/river tools, foliage, biome painting, roads/paths, building placement, spline tools, and procedural generation with deterministic seeds.
- Tilemap/isometric authoring, chunk editing, streaming, region tools, prefab stamping, and multi-layer editing.
- Scene and world validation: collision gaps, unreachable areas, missing references, broken navigation, invalid placements, and performance hotspots.
- Preserve existing hand-authored world and town layout; procedural tools must be opt-in and non-destructive.

### 10. Testing, profiling, collaboration, and export

- Play-in-editor with pause, step, speed controls, isolated runtime state, and clear editor/runtime boundaries.
- Profiler for CPU, GPU (where exposed), memory, draw calls, triangles, asset loads, simulation ticks, and frame pacing.
- Automated unit, integration, visual, import-fixture, save-migration, and browser/device tests.
- Crash-safe autosave, project backups, asset pack export/import, and portable project folder format.
- Build profiles for web/PWA first, with static hosting export; evaluate desktop packaging and other targets only after runtime abstractions and licensing are settled.
- Optional collaboration/version-control workflows with conflict-aware scene/resource serialization.

## Delivery phases and acceptance gates

### Phase 0 — Baseline and architecture audit
- Inventory current renderers, world data, save formats, editors, importers, simulation, tests, and deployment.
- Record current production build/test baseline and identify all code paths that must remain compatible.
- Decide renderer, physics, scripting, and project-format libraries based on licence, browser support, bundle size, maintenance, and performance.
- Deliver an architecture decision record and a migration map. No production renderer replacement in this phase.

### Phase 1 — Engine core and project format
- Implement versioned project/scene/resource schemas, stable IDs, resource registry, scene graph, transforms, lifecycle, event bus, fixed-step clock, and save/load.
- Acceptance: round-trip a sample scene with nested entities/components and resource references; migrate an older fixture; no change to existing Adventure saves.

### Phase 2 — Creator editor foundation
- Implement hierarchy, viewport selection, transform gizmos, inspector, asset browser, undo/redo, and play-in-editor boundary.
- Acceptance: create/edit/reparent/delete objects, undo/redo, save, reload, and run the scene without mutating editor state.

### Phase 3 — Real asset/render pipeline
- Implement materials and texture support, model dependency resolution, skeletal animation data, asset reimport, and importer fixtures.
- Acceptance: supplied medieval character pack imports with correct scale, orientation, material colours/textures, and visible character geometry; GLB/glTF/OBJ regression fixtures pass.

### Phase 4 — Physics and gameplay scripting
- Add physics adapter, colliders, raycasts, character controller, script components, sandbox, hot reload, and debugging.
- Acceptance: sample platform/adventure scene supports collision, triggers, movement, script-driven interactions, save/reload, and deterministic regression tests.

### Phase 5 — Animation, audio, UI, and VFX
- Add animation state machines, audio buses, UI layout, particles, and input maps.
- Acceptance: sample character animates and interacts; UI works with mouse/touch/controller; audio and effects load through the resource system.

### Phase 6 — World Studio and procedural tools
- Integrate terrain, rivers, foliage, building, tilemap, chunk, biome, spline, and validation tools with non-destructive undo.
- Acceptance: edit a copy of the Adventure world, preserve roads/buildings/river connectivity, save/reopen, and pass world coherence tests.

### Phase 7 — Build, export, performance, and release
- Add web build profiles, asset optimization, diagnostics, automated browser/device coverage, project backup/export, and documentation.
- Acceptance: exported sample project runs independently from the editor; production deployment passes the full test matrix and existing game regression suite.

## Immediate next implementation slice

1. Finish and validate PR #82 on its own: texture/material limitation clearly surfaced, real binary medieval pack fixtures added, and all CI checks green.
2. Do not merge PR #82 solely because the parser compiles; verify the imported character visually in the actual game.
3. Start Phase 0 audit on a separate branch. Do not combine the importer merge with a renderer replacement.
4. Deliver Phase 1 as a small, testable vertical slice before expanding editor features.

## Definition of done

Adventure is considered an engine rather than a collection of game-specific tools only when a creator can start a blank project, create scenes and reusable objects, import and configure assets, script interactions, use physics/animation/audio/UI/VFX, author terrain/levels, test and profile the game, save and reopen the project, and export a playable build without modifying Adventure-specific source code.
