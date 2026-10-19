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

The module is independent of React and the browser UI. The React panel at `src/game/worldgen/LittleWorldGeneratorPanel.tsx` provides generation settings, map-overlay selection, terrain smoothing/mountain actions, and JSON save/load controls. It is now mounted in `src/App.tsx` and launched from Debug Control Center → World Studio → **Little World Generator**. The preview is a separate floating window and does not replace the existing World Editor.

## Verification

Run `npm run test:little-world-generator` to test seeded repeatability, water/land output, river generation, pixel buffers, save/load, smoothing, mountain editing, and malformed-save rejection. This test is included in the GitHub Pages build workflow.

## Next reverse-engineering pass

1. Run official REA in a supported environment and determine whether its installed version can inspect compiled GameMaker resources.
2. If unsupported, use a compatible GameMaker data.win parser/decompiler in a controlled environment.
3. Recover the actual scripts, objects, room/resource metadata, and function bodies where technically possible.
4. Compare recovered behavior against the clean-room implementation, correcting only where evidence supports it.
5. Continue refining integration with the game's existing world-state/editor APIs rather than creating duplicate persistent world state.

Official reference: https://github.com/morluto/rea
