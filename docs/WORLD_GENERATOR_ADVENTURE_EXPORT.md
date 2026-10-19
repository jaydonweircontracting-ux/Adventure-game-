# Native World Generator → Adventure Map Export

Build 877 adds a clean-room adapter between the native Little World Generator-inspired simulation and Adventure Game's existing biome vocabulary.

## Included systems

- **Terrain / tectonics:** deterministic seeded elevation and plate assignments.
- **Erosion:** terrain smoothing/erosion passes.
- **Hydrology:** water classification and river flags.
- **Climate:** temperature and moisture fields.
- **Biomes:** detailed generator biomes mapped to the game's existing `ocean`, `shore`, `meadow`, `forest`, `desert`, `tundra`, `rock` vocabulary.
- **Vegetation:** forest flags retained per tile.
- **Editor workflow:** overlay preview, seeded generation, save/load, terrain smoothing, mountain brush, and now a dedicated Adventure Map JSON export.

## Export format

Use **Export Adventure map** in Debug → World Studio → Little World Generator. The JSON contains `format: adventure-world-map`, version, seed, dimensions, sea level, and each tile's x/y, mapped biome, original biome, elevation, temperature, moisture, water/river/forest flags, and tectonic plate ID.

The export is deliberately non-destructive: it creates a reusable template file and does not replace the authored Mosslight starting area or mutate the live game world. The source is a clean-room implementation based on documented behavior and static resource metadata; original executable algorithms were not recovered.

## Verification

`tests/little-world-generator.test.ts` now asserts the export schema, dimensions, coordinates, biome vocabulary, and JSON serialization. GitHub Actions should run the project typecheck, generator regression, and production build for the pull request. This session did not execute the project locally or claim a live-browser test.
