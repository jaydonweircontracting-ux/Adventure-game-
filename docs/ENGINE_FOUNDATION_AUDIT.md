# Adventure Engine Foundation — Phase 0 Repository Audit

**Audit date:** 2026-11-24  
**Scope:** source-level inspection of the current default branch. This is not a claim that a local build, browser smoke test, performance benchmark, or device test was run.

## Executive finding

Adventure already contains substantial game-specific systems and a separate 3D play mode, but it does **not** yet have a general-purpose editor/runtime comparable to Unity or Godot. The next step is to consolidate and expose the existing capabilities through a versioned project/scene model—not to replace working gameplay with a disconnected engine demo.

The established game remains the default **2.5D** experience. The 3D mode remains an optional mode selected through Options.

## Verified architecture

| Area | Current source-level finding | Consequence |
|---|---|---|
| Application entry | `src/main.tsx` mounts `GraphicsModeHost`. | The graphics-mode host is the application boundary. |
| Default mode | `src/game/engine3d/GraphicsModeHost.tsx` explicitly boots into 2.5D and offers 3D as a selectable mode. | Preserve this behaviour while building the editor/runtime. |
| 3D runtime | `src/game/engine3d/Engine3DWorldView.tsx` owns a very large amount of 3D gameplay, world rendering, placement, simulation, UI and asset workflow. | First architecture task is to identify clean seams and extract systems incrementally; do not rewrite the whole view at once. |
| Custom asset model | `src/game/engine3d/customAssets.ts` stores positions, RGB vertex colours and triangle indices. Its documented formats are GLB, glTF and OBJ. | The Import Hub's custom-asset representation is currently static vertex-colour geometry, not a general material/texture/skeleton representation. |
| ZIP import | `src/game/engine3d/zipImport.ts` routes GLB, glTF and OBJ entries through the same parsers. | FBX support must be added to the shared importer contract and ZIP path, not only to a separate picker. |
| Asset persistence | `src/game/engine3d/assetStore.ts` uses IndexedDB for geometry and a compact localStorage manifest. | Keep large binary/geometry data out of localStorage; preserve migration and budget checks. |
| World clock | `src/game/worldCore.ts` provides a serializable seeded clock, RNG, queued events and schema migration. | This is a useful core module, but source inspection found no use of `WorldCore` in the 3D world view. |
| 3D time | `src/game/engine3d/townsfolk3d.ts` defines a separate `DayClock` stored under `ag-3d-clock-v1`; `worldclock.ts` documents the 3D wait system. | The project currently has more than one clock model. Unification requires an adapter/migration plan, not a blind replacement. |
| Living-world simulation | `src/game/worldSimulation.ts` composes ecology, NPC production and civilization around a `WorldClockState`. | The daily coordinator is a useful integration point once the authoritative clock boundary is chosen. |
| Rendering dependency | `package.json` does not declare Three.js, while the Pages workflow installs `three@0.180.0` transiently with `npm install --no-save --package-lock=false`. | Dependency reproducibility is a blocker: declare and lock any runtime importer dependency before relying on it in developer builds. |
| Deployment | `.github/workflows/deploy-pages.yml` runs typecheck, a selected set of regressions, build and Pages deployment. | The current pipeline is a valuable safety gate, but it does not yet represent a complete engine test matrix. |

## Capability gaps confirmed by source inspection

- No general-purpose versioned game-project manifest and scene/resource format was found in the inspected entry points.
- No general-purpose scene hierarchy, component inspector, transform gizmos, prefab workflow or play-in-editor isolation was found in the inspected application host.
- The custom Import Hub asset shape is static triangles plus vertex colours. Texture maps, general material properties, UV-based rendering, skeletal animation and morph targets are not represented by that asset type.
- The ZIP importer currently advertises GLB, glTF and OBJ, not FBX.
- The 2D/3D clock boundary is split: `WorldCore` and the 3D `DayClock` are separate models.
- A 3D game renderer is not by itself a reusable 3D engine/editor. Physics, animation, scripting, audio, visual scripting, export profiles and creator-facing scene authoring still need explicit engine-level APIs and tools.

These are scoped findings from the files listed above, not a claim that no related helper exists anywhere in the repository.

## Risks and preservation constraints

1. Keep 2.5D as the boot default and retain the existing world/map, roads, rivers, bridges, settlements, saves and simulation.
2. Do not replace the large 3D view in one pass. Extract one tested subsystem at a time behind stable interfaces.
3. Keep asset import bounded and defensive: ZIP traversal/expansion limits, file/triangle/library caps, malformed-input handling and dependency reporting must remain.
4. Do not claim imported character packs work until real binary FBX files from the supplied pack have been tested in the actual browser renderer.
5. Do not merge or deploy an importer/engine change until CI and the relevant world/bridge/save/import regression suites pass.

## Baseline status

| Baseline | Status |
|---|---|
| Source architecture inspection | Complete for the files listed above |
| Local production build | Not run in this audit |
| Local TypeScript check | Not run in this audit |
| Full regression suite | Not run in this audit |
| Browser/mobile smoke test | Not run in this audit |
| Frame-time / memory baseline | Not run in this audit |
| Real medieval FBX character-pack validation | Blocked until the ZIP is available in the working session and importer work is ready |

No test or deployment result is inferred from a source inspection.

## First implementation slice (added on the engine branch)

- `src/game/engine/engineCore.ts`: renderer-agnostic versioned project/scene/entity model, stable IDs, parent hierarchy, transforms, versioned JSON components, immutable scene/entity/component operations, validation, and JSON serialization/deserialization.
- `src/game/engine/adventureWorldAdapter.ts`: stores the existing authoritative `WorldCore` save as an `adventure.world-core` component; supports snapshot, sync, and restore without introducing a parallel simulation clock.
- `tests/engine-core.test.ts`: project, scene, entity, hierarchy, transform, component, validation and JSON round-trip coverage.
- `tests/adventure-engine-adapter.test.ts`: verifies WorldCore snapshot/sync/project save/restore and deterministic RNG continuation.
- `tests/world-core.test.ts`: covers deterministic RNG, clock boundaries, events, save/load and schema-v1 migration.
- All three tests are registered in `package.json` and the Pages workflow. The workflow now also declares a pull-request validation trigger and guards deployment so PR validation cannot publish a Pages site.

## Creator-facing editor slice (added on this branch)

- `src/game/engine/EngineStudio.tsx` provides an interactive editor panel reachable from both 2.5D and 3D modes through the new **Engine Studio** control.
- Scene list and active-scene switching.
- Entity hierarchy list, parent-child creation, selection, rename, and delete (deleting a parent also deletes descendants through the engine core).
- Top-down X/Z scene viewport with a grid and selectable entity markers.
- Position, rotation and scale inspector fields, plus one-unit X/Z transform nudges.
- Versioned component display and adding a starter component.
- Bounded undo/redo history, local project persistence, and validated JSON project import/export.
- The editor uses the new engine project model and does not modify the live Adventure world/save. This is intentional until the renderer adapter and play-in-editor isolation are ready.

This is an initial scene-authoring workbench, not yet a complete 3D viewport: no orbit/fly camera, drag gizmos, snapping, asset preview, prefab workflow, multi-select, runtime play/pause, or live renderer binding is claimed.

## Reusable prefab slice (added on this branch)

- `EngineProject.prefabs` stores reusable templates as part of the versioned project JSON; older project files without a prefab list remain readable.
- `createEnginePrefab` captures the selected entity and its complete descendant hierarchy, retaining transforms, active flags and component payloads.
- `instantiateEnginePrefab` creates a fresh entity ID for every copied object, remaps parent links, and applies a placement offset to the root transform.
- Prefab rename and delete operations are immutable and validated.
- Project validation checks prefab IDs, root membership, hierarchy references/cycles, transforms and component payloads.
- Engine Studio exposes a prefab library: save selected hierarchy, rename, place into the active scene and delete. Prefab data is included in local persistence and JSON import/export.
- Regression coverage exercises hierarchy capture, fresh-ID placement, component retention, validation, deletion and JSON round-trip.

Prefab placement currently starts at the scene origin; creators can reposition the instance using the scene viewport and inspector. A future placement tool should support cursor/raycast placement, preview ghosts, snapping and asset-backed prefab previews.

## Remaining integration gates

1. Run a reproducible typecheck, production build and all new tests in GitHub Actions. No run has been observed yet for this branch; do not treat these tests as passed.
2. Connect the project model to an actual creator-facing scene hierarchy/inspector and play-in-editor flow.
3. Add an explicit compatibility adapter for the 3D `DayClock` and the existing 2.5D save without changing either live save format.
4. Integrate renderer resources/materials and asset import with the scene component registry.
5. Validate save/load and existing gameplay, river/bridge and mobile regressions before merge/deploy.

The new adapter is a tested-in-source integration seam, not yet a live runtime hook in the game UI. The first engine slice is not complete until the CI and in-game integration gates pass.
