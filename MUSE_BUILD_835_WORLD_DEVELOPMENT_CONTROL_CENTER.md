# Muse Implementation Order — World Development Control Center (BUILD 835+)

## Mission

Implement the World Development Control Center in the existing Adventure-game- repository, using the current game engine and world as the source of truth. This is an implementation task, not a mockup or a planning-only task. Work in small, verifiable commits and preserve working gameplay.

Repository: https://github.com/jaydonweircontracting-ux/Adventure-game-
Play-test URL: https://jaydonweircontracting-ux.github.io/Adventure-game-/

## Non-negotiable safety rules

1. Inspect the current branch, build/version marker, existing editor/debug code, save formats, and relevant tests before changing code. The checked-in version marker may lag the user's recent working build; derive the next build from the actual repository and build history rather than blindly assuming a number.
2. Do not regenerate, replace, reset, or rearrange the existing world. Preserve the current map, starting house and its exterior/interior assets, roads, world coordinates, chunks, NPC identities, schedules, lore, spawn restrictions, collision fixes, touch input, tap-to-move, and update-banner behavior.
3. Reuse and extend the existing world/editor/save systems. Do not create a parallel fake world, visual-only offsets, duplicate source of truth, or a UI whose controls only change panel-local numbers.
4. Any control not genuinely wired to the live game state must be visibly labelled READ-ONLY, PREVIEW, or NOT CONNECTED. Never represent a stub as a finished feature.
5. Do not perform broad mechanical rewrites of the huge game component. Keep changes modular, typed, mobile-first, and small enough to build/test independently.
6. Maintain backwards compatibility for existing player saves. Editor drafts must be separate from player progress. Never silently overwrite a player's save with editor state.
7. Every mutation must go through a shared command/change service with validation, undo/redo, audit log, dirty state, autosave/recovery and explicit persistence. Avoid mutating arrays/objects in place.
8. Build, typecheck, run relevant tests, and test the actual browser game after each slice. Fix regressions before continuing. Commit and push completed slices; report the exact commit, build, tests, and deployment status. Do not claim deployment until GitHub Pages confirms it.

## Architecture target

Establish one shared, typed world-edit command boundary that adapts existing live systems instead of replacing them. Suggested modules (adjust names after inspection):
- `src/game/dev/worldDevTypes.ts`: editor selection, tools, diagnostics, snapshots and serializable command types.
- `src/game/dev/worldDevCommands.ts`: validated commands and reversible before/after patches.
- `src/game/dev/worldDevHistory.ts`: bounded undo/redo history, checkpoints and region/object snapshots.
- `src/game/dev/worldDevPersistence.ts`: versioned editor-draft persistence, migration, recovery and export/import.
- `src/game/dev/worldDevValidation.ts`: asset, tile, entrance, collision, placement and NPC-route checks.
- `src/game/dev/WorldDevelopmentControlCenter.tsx`: mobile-first panel/workspace; keep it modular and mount it into the existing Debug flow.
- Add unit tests under the existing test conventions.

These are suggested boundaries, not permission to duplicate systems. If an equivalent existing module exists, extend it instead.

## Implementation sequence

### Slice 1 — reliable shared editor foundation (highest priority)
- Audit and unify existing tile painting, object placement, erase, selection, coordinates and save behavior.
- World Studio: ground/tile palette, exact coordinate display/jump, eyedropper, tap and drag painting, brush size/shape, selection/multi-selection, copy/paste region, stamps/prefabs and terrain auto-tiling where the asset set supports it.
- Add bounded undo/redo for every supported mutation; dirty indicator; named checkpoint; autosave draft and crash recovery; import/export a versioned edit patch.
- Do not claim undo or persistence for any mutation type until it has a real inverse and a reload test.
- Add mobile touch handling: pointer capture, no accidental player movement while editing, clear active tool, cancel/close, compact toolbar, scrollable panels and hide/show panels without resetting the selected tool.

### Slice 2 — unified Asset Studio and Scene Inspector
- Search existing asset manifests/folders; preview transparency on checkerboard; show filename, dimensions and source path.
- Use supported browser file input for uploads, including iPhone image selection. Validate file type/size and report failures.
- Separate asset definitions from placed instances. Instance transforms (position, scale, flip, rotation, anchor, layer and collision) must not mutate the shared source asset or its other instances.
- Select world objects from the scene, jump camera to selection, inspect/edit world coordinates, layer, anchor, scale, collision and asset reference; lock/hide/filter categories; edit multiple selections.
- If a transform is not supported by a renderer or persistence format, report it and do not fake it.

### Slice 3 — Building and Interior Studio
- Build an explicit entrance/exit connection view from actual building and interior data.
- Inspect and edit doorway trigger, destination interior, return coordinates and collision boundary through the shared command layer.
- Preview exterior-to-interior-to-exterior transitions.
- Validator must flag missing interior, invalid destination, unreachable door, duplicate entrance and exit coordinates that trap the player.
- Preserve current starting-house exterior overlay behavior: visible outside, hidden inside. Preserve current art, coordinates and player movement behavior.

### Slice 4 — Collision and navigation tools
- Independent walkability/collision/interaction-zone painter, where engine data supports it.
- Overlay collision shapes, blockers, interaction ranges and NPC/player paths on the real scene.
- Validate paths with existing navigation functions; find stuck/repeated-failure NPCs and unreachable destinations.
- Never infer that artwork equals collision; expose artwork and collision as separate data.

### Slice 5 — Living World Control Center and NPC AI Lab
- Read-only overview first: population, home/work assignment, schedules, needs/mood, relationships, shop stock/economy, faction/crime and recent world events, only where the current engine exposes real values.
- NPC inspector: identity, current goal/action, schedule, path, blocked reason and recent decision/event trace.
- Add safe test-only actions (pause/freeze, step, teleport, reset test actor) only when implemented against real simulation state. Test actions must not corrupt persisted NPC/world data.
- Economy reports should trace actual supported transactions/production/stock changes. Label unavailable metrics explicitly; never fabricate numbers.
- Add world event log, repeated path failure/stuck detector, and monster spawn heatmap/zone audit using the actual spawn tables and safe-zone rules.
- Population/day simulation must use deterministic test fixtures or a disposable cloned test state, not fast-forward the live player's persistent world.

### Slice 6 — Simulation Lab, quests and gameplay test tools
- Pause, one-tick step, supported speed controls, set hour/day and day/night preview only if the simulation clock and lighting pipeline can be controlled safely.
- Quest/event workbench for existing dialogue, quest, switch, chest, gathering and trigger models; conditions must bind to real inventory/time/reputation/objective state.
- Combat sandbox, loot/item inspector, spawn manager, dialogue/quest debugger, save inspector, input tester and audio/lighting checks. Start with truthful read-only diagnostics; add mutation controls only after they are wired.
- Input tester must cover tap-to-move, hold-to-walk, target selection, camera gestures and UI conflict prevention without changing normal controls.

### Slice 7 — performance, world/chunk tools and validation
- Show measured FPS/frame time, visible sprites, loaded/culled chunks, NPC update cost and asset failures where measurable. Use existing frame metrics and counters; mark missing instrumentation as unavailable.
- Chunk/world map: jump to coordinates, inspect distant chunk metadata, terrain seams, duplicate objects, buildings/population/danger/spawn data where available.
- Diagnostics panel should run actual validators and list severity, entity/coordinate, cause, and actionable navigation to the affected object.
- Automated regression suite should cover the editor acceptance path below and key existing gameplay controls.

### Slice 8 — recovery, snapshots and publish safety
- Named editor checkpoints; compare two snapshots; restore one object or region; export/import patches with schema version and validation.
- Keep editor draft storage separate from player save data.
- Provide a clear confirm-before-restore/publish step and retain a last-known-good checkpoint.
- Make build/update status reliable: compare the running build to the published marker using the existing update mechanism, with cache-busting handled consistently.

## UI requirements (iPhone first)
- A single Debug/World Development workspace with categories/tabs rather than a wall of controls.
- Compact tool strip, large enough touch targets, safe-area spacing, scrollable panels, close-all and hide/show panels.
- Closing or hiding the workspace must not discard tool selection or edits. Switching tools must be explicit.
- While a modal/panel is open, game input and minimap visibility should follow the existing established menu rules and restore their prior state on close.
- Never block the playfield permanently. Normal gameplay must remain fully playable when the workspace is closed.

## Mandatory acceptance scenario

1. Open Debug on iPhone-sized viewport; panels scroll and close; game does not move while a world-edit tool is active.
2. Hide/show the panels without losing the selected tool.
3. Select an existing grass tile with eyedropper; paint exactly one tile and verify the underlying world data changed.
4. Undo and redo; verify actual tile data and rendering both change correctly.
5. Paint a short path using supported tile data; verify borders/autotiling where assets permit.
6. Place a transparent asset instance; change only that instance's size and flip; verify another instance and the original asset definition remain unchanged.
7. Save a named editor checkpoint, reload the page, and confirm draft edits recover while player save/progress remains separate.
8. Export an edit patch, validate it, and import it into a disposable/test world.
9. Validate the starting-house entrance/interior round trip and outside-only exterior overlay.
10. Run collision/path diagnostics and confirm reported coordinates point to actual objects.
11. Open Living World/NPC inspector and distinguish measured values from unavailable/read-only data.
12. Close Debug and verify walking, tap-to-move, hold-to-walk, combat, interactions, NPC simulation and update banner still behave normally.

## Definition of done
- No UI-only mock controls presented as functional.
- Every live mutation has validation and an undo path, or is explicitly read-only.
- Editor drafts/checkpoints do not corrupt player saves.
- Existing world and starting house remain intact.
- Relevant unit tests, typecheck, build and browser smoke tests pass (report pre-existing failures separately).
- Update build marker/changelog/ledger only to reflect the actual tested code.
- Commit/push each coherent slice and provide a fresh play-test URL plus verified deployment state. If any slice is too large, finish the current slice cleanly rather than claiming the entire system is done.
