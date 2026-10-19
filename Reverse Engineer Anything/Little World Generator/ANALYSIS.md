# Little World Generator — Static Reverse-Engineering Notes

## Status and method

- Input archive: `little_world_generator.zip`
- Analysis date: 2026-10-19
- Method: archive inventory, file-type identification, SHA-256 hashing, and static string inspection.
- **Important limitation:** the REA (`rea-agents`) engine was not executed in this environment. The Windows executable was not launched. This is a static triage report, not a complete decompilation or a verified reconstruction of the program's internals.

## Archive contents

| File | Size | Identification |
|---|---:|---|
| `little_world_generator.exe` | 5,225,984 bytes | PE32 Windows GUI executable, Intel 80386 |
| `data.win` | 262,108 bytes | GameMaker resource/data container |
| `options.ini` | 150 bytes | Windows-style configuration |
| `readme.txt` | 1,619 bytes | User instructions and keyboard controls |

SHA-256:
- ZIP: `9aae6a9e51f3463a228677db901d6096dfdd7296486f5f45f55b278d69747b3a`
- EXE: `754bcfe4bd39230cbd24ca055015a39d28acd9935c1c044e01d7341353560ec3`
- `data.win`: `8cd55c68bc6f3c2b1feaf2840917d3b92d45be3e55c37e9ac7f73278da5afd97`

## Technology clues

- The executable contains the runtime string `Made with GameMaker: Studio` and YoYo Games runner identifiers.
- The data container includes GameMaker resource markers and visible names including `Little World Generator`, `draw_map`, `get_biome`, `draw_biome_legend`, `resize_map`, `set_ocean_water`, and `map_range`.
- These names indicate likely map-rendering, biome, resizing, water/sea-level, and range-mapping routines. The actual algorithms, function bodies, data structures, and exact simulation behavior have **not** been recovered from these strings alone.

## User-visible functionality documented by the included readme

### World creation and editing
- Draw rock onto a planet's core with left-click.
- Fill a drawn region with `F`.
- Start/stop plate simulation with Space.
- Pan with right-click and zoom with the scroll wheel.
- Create small, large, or XL worlds with Ctrl+1, Ctrl+2, and Ctrl+3.
- Clear the world with Esc.

### Map display and simulation tools
- Toggle geographic, water, height, temperature, and biome overlays.
- Toggle depixelization, clouds, and equator line.
- Erode hills, smooth terrain, spawn rivers, crash asteroids, plant/destroy forests, build mountains, and create clouds.
- Adjust global temperature, sea level, and equator-to-pole temperature variation with modifier-plus-scroll controls.
- Move the seasonal equator with Z+left-click.
- Rerun vegetation simulation or clear vegetation.
- Save a map image and save/load a map file.

The readme calls the application rough and warns that it may not run well. Runtime stability has not been independently tested.

## Likely subsystem map (inferred, not confirmed)

1. **World input/editor:** drawing, fill, pan/zoom, world-size presets, clear.
2. **Plate/terrain simulation:** plate simulation, erosion, smoothing, mountains, asteroid impacts.
3. **Hydrology:** water-level adjustment and river generation.
4. **Climate:** global temperature, latitude/seasonal equator, temperature variation.
5. **Biomes/ecology:** biome classification/legend, vegetation simulation, forest growth/destruction, clouds.
6. **Rendering:** geographic and diagnostic overlays, depixelization, image export.
7. **Persistence:** map save/load and overlay image output.

These are functional categories inferred from documented controls, not evidence of the internal implementation.

## Reimplementation guidance for Adventure-game

Do not embed or execute the supplied Windows binary in the browser game. Rebuild the relevant behavior as native, testable modules:
- deterministic world seed and grid/height-field representation;
- plate/terrain simulation separated from rendering;
- hydrology and sea-level mask;
- latitude-based climate model;
- biome classifier driven by temperature/moisture/elevation;
- vegetation simulation;
- overlay renderer with independently toggled layers;
- world serialization/versioning and image export;
- editor controls for brush/fill, pan/zoom, and world-size presets.

Keep simulation state independent from UI state, make random generation seedable for reproducible tests, and use worker/background processing for expensive simulations if the existing engine supports it. This is a suggested design, not code extracted from the executable.

## Next steps for a genuine REA-assisted pass

1. Run the official REA setup in a supported environment with its required Node.js version and model/provider credentials.
2. Confirm whether the installed REA version supports compiled GameMaker PE executables and `data.win`. If it does not, use a dedicated GameMaker data-file parser/decompiler in a controlled environment.
3. Extract and inspect scripts, objects, rooms, sprites, shaders, and resource metadata from `data.win`.
4. Trace the actual algorithms and dependencies, recording evidence and confidence per subsystem.
5. Implement only the needed behaviors in Adventure-game, then test against known inputs and visual outputs.

Official REA reference: https://github.com/morluto/rea
REA website: https://rea.tools/


## Follow-up work completed (2026-10-19)

Static inspection was extended to enumerate additional GameMaker resource markers and names:
- Resource chunks include `SCPT`, `GLOB`, `SHDR`, and `ROOM`.
- Additional visible names include `sMountain`, `oWorldGen`, `oRiver`, and `oForest`.
- The archive readme was checked directly; all seven feature groups above come from its user-facing controls and descriptions.

The recommended next step has been started as a clean-room native implementation in `src/game/worldgen/littleWorldGenerator.ts`. It includes seeded terrain generation with stylized plate boundaries, erosion, flow accumulation and river flags, climate/biome/forest fields, terrain editing helpers, pixel buffers for diagnostic overlays, and validated JSON save/load. A test file was added at `tests/little-world-generator.test.ts`.

**Still not completed:** no REA engine execution, no full GameMaker resource decompilation, and no integration of a user-facing editor into the live React game. The new generator is a behavior-inspired implementation, not recovered original source or proof of identical output. See [INTEGRATION.md](INTEGRATION.md) for the staged plan.
