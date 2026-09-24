# World map generation

The overworld map now uses a deterministic hex atlas inspired by the attached world-generation transcript.

## Generation rules

- A seeded wave-function-collapse pass assigns each hex one biome from ocean, shore, meadow, forest, desert, tundra, or rock.
- Each hex considers six neighbors. Adjacency rules prevent impossible transitions such as ocean directly touching forest.
- The lowest-entropy hex is collapsed first. Weighted choices favor contiguous regions and keep the map from becoming a noisy checkerboard.
- The tutorial location remains meadow, while the outer edge is ocean so the world reads as connected islands and coastlines.
- Decorations are placed only after biome generation: waves in water, bushes in safe meadow, trees in forest, cactus in desert, munchleaf in tundra, ridges in highlands, and border pebbles near biome transitions.

## Why hexes

Hexes expose six natural connections instead of four square-grid corners. That makes region growth, ponds, forests, and biome borders read more organically while still keeping the generated map deterministic for saves and debugging.

## Deferred simulation hooks

The transcript also suggests food, warmth, disease, plant evolution, predators, and intelligence traits. Those belong in the simulation layer and are intentionally not mixed into this map-generation pass.

## Implementation

- Generator: src/game/worldMap.ts
- Map overlay: src/App.tsx
- Hex atlas styling: src/index.css
- Seed: DEFAULT_WORLD_SEED from src/game/worldCore.ts
