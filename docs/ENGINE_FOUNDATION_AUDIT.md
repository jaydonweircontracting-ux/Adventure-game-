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

## Recommended first implementation slice

1. Establish the real baseline in a reproducible checkout/CI run.
2. Add focused tests for `WorldCore` serialization, seeded RNG restore, schema-v1 migration and event queue ordering.
3. Define a small engine-core contract (stable IDs, entity/component ownership, transforms, lifecycle and serialization) in a new isolated module.
4. Connect one existing gameplay transition through that contract, then prove save/load and existing gameplay regressions.
5. Only after that, proceed to scene hierarchy/editor UI.

The first implementation must be an adapter over existing game state, not a second disconnected world.
