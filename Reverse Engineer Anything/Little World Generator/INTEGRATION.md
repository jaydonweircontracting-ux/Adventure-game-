# Little World Generator integration notes

## What is known from the supplied package

The archive contains a Windows PE executable and a GameMaker `data.win` resource container. Static inspection confirmed GameMaker runner markers, resource sections such as `SCPT`, `GLOB`, `SHDR`, and `ROOM`, and strings including `draw_map`, `get_biome`, `draw_biome_legend`, `resize_map`, `set_ocean_water`, `sMountain`, `oWorldGen`, `oRiver`, and `oForest`.

The included readme documents these systems:

- Procedural world and tectonic plate simulation
- Terrain erosion, smoothing, and mountain generation
- Rivers, water levels, and hydrology
- Temperature, seasonal equator, and biome classification
- Vegetation and forests
- Map overlays, zooming, and image export
- Saving and loading worlds

**Limitations:** this is static analysis, not a completed run of the REA engine. The original simulation algorithms have not been recovered from the compiled resources. Names and controls are evidence of resource/function labels and documented behavior, not proof of exact implementation details.

## Native implementation added

`src/game/worldgen/littleWorldGenerator.ts` is a clean-room TypeScript world generator inspired by the documented functionality. It does not embed or execute the Windows binary and does not claim to reproduce its private algorithms.

Included:
- Seeded deterministic terrain and stylized tectonic plate boundaries
- Optional erosion passes and terrain smoothing
- Steepest-descent flow accumulation and river flags
- Latitude/altitude temperature, moisture, biome classification, and forest placement
- Water, height, temperature, biome, plate, and geographic pixel overlays
- Mountain brush helper
- Versioned JSON save/load with validation

The module is independent of React and the browser UI so the existing game can integrate it incrementally.

## Verification

Run `npx tsx tests/little-world-generator.test.ts` to test seeded repeatability, water/land output, river generation, pixel buffers, save/load, smoothing, mountain editing, and malformed-save rejection.

## Next reverse-engineering pass

1. Run official REA in a supported environment and determine whether its installed version can inspect compiled GameMaker resources.
2. If unsupported, use a compatible GameMaker data.win parser/decompiler in a controlled environment.
3. Recover the actual scripts, objects, room/resource metadata, and function bodies where technically possible.
4. Compare recovered behavior against the clean-room implementation, correcting only where evidence supports it.
5. Integrate a user-facing world-gen/editor screen only after checking the current engine entry points and avoiding duplicate world-state systems.

Official reference: https://github.com/morluto/rea
