# Phase 2 design — water/drainage + biome metadata (after BUILD 367)

## Goal
Extend `src/game/landscape.ts` with deterministic water systems and richer
biome metadata, then wire both into the 2D field renderer, world map, and iso
field view. No changes to towns, roads, chunk coords, saves, or NPC sim APIs.

## What BUILD 367 already provides
- `landscapeSeed(seed, cx, cy, subsystem)` — separate RNG streams incl. 'water'
- `macroLandformAt / moistureAt / forestDensityAt / rockDensityAt` — world-anchored fBm
- `regionForChunk` — 4x4-chunk regions with landform classification
- `roadCorridorsFor / pointInCorridors` — canonical road geometry
- `townInfluenceAt / landUseAt` — settlement gradient
- `landscapeSitesFor` — farm/grove/quarry activity metadata
- `checkFieldContinuity` — dev-only seam checks

## Water design
- Rivers: derive from macro landform via a downhill walk on a coarse,
  world-anchored height field (reuse `elevation.ts` relief sampling at
  20-unit cells). Seed river sources at high-macro cells in 'highlands'/
  'hills' regions; walk downhill until reaching sea level or map edge.
- Rivers must be computed from world coordinates only — no per-chunk RNG —
  so they cross chunk borders seamlessly. Cache per-region polylines in a
  Map keyed by regionId (regions are 4x4 chunks; rivers rarely span more
  than 2-3 regions).
- Lakes: where moisture > 0.8 AND macro < 0.35 (basins), place a small
  deterministic ellipse lake via the 'water' subsystem stream. Radius
  20-60 field units. Must not overlap towns/roads (check corridors +
  settlement influence > 0.5 => skip).
- API: `waterAt(wx, wy): { depth: 0..1, kind: 'none'|'river'|'lake'|'shore' }`
  - river: distance to nearest river polyline < width (width 6-10 units,
    wider downstream — track walk step count as proxy for stream order)
  - lake: inside a lake ellipse
  - shore: existing sea adjacency (keep current behavior)
- Collision: water depth > 0.5 blocks movement (player + NPC A* cost).
  Bridges: where a road corridor crosses a river, mark a bridge segment
  (walkable, rendered as planks). `bridgeAt(wx, wy): boolean`.

## Biome metadata design
- Extend `regionForChunk` output (additive fields, no breaking change):
  - `biomeDetail`: refines MapTile.biome with transition info, e.g.
    `{ primary: 'forest', secondary: 'meadow', blend: 0.3 }`
  - `elevationBand`: 0-5 quantized band at chunk center (from elevation.ts)
- New `biomeAt(wx, wy)`:
  1. Start from authoritative `mapTileFor` biome (never contradicts it).
  2. Blend at borders: sample neighbor chunk biomes, blend within 24 units
     of a chunk edge where biomes differ (smoothstep).
  3. Water overlay: river/lake => water rendering + damp soil ring
     (moisture boost within 30 units => lusher ground detail).
  4. Settlement overlay: landUse 'town'/'farms' => trampled dirt tint.
- Ground detail (`groundDetail.ts`): accept optional biome blend + dampness
  to vary tuft/flower density. Keep deterministic; sample world coords.

## Rendering wiring
- 2D field: water polygons from `waterAt` sampled on a coarse grid
  (10-unit cells) per chunk, cached; bridges drawn over rivers on roads.
- World map: rivers as polylines on the map canvas; lakes as ellipses.
- Iso field view: water tiles get animated-ish blue tint (static is fine);
  bridges as plank boxes. (Iso is beta; keep it simple.)

## NPC sim wiring
- A* (`npcNavigation.ts`): water depth > 0.5 => cost 50 (near-blocked);
  bridges => cost 1. Same 70x70 grid.
- Travelers/caravans: routes avoid river crossings except at bridges
  (junction metadata gains `bridge: boolean`).
- Fishing activity site kind already exists in types; Phase 2 can place
  'fishing' sites on lake/river banks via `landscapeSitesFor`.

## Determinism & continuity
- All water geometry from world coords + world seed. No chunk-local RNG
  for placement (streams only for lake size jitter, seeded per lake id).
- Extend `checkFieldContinuity` with water depth field.
- New sim tests: river crosses a chunk border (sample both sides),
  lake never inside town influence > 0.5, bridge walkable in A*.

## Rollout
- Phase 2a: waterAt + bridges + sim tests (no rendering).
- Phase 2b: 2D field + world map rendering.
- Phase 2c: iso rendering + NPC cost wiring.
- Each: sim + tsc + build + commit + push + live-verify, own build number.

## Non-goals
- No ocean expansion, no new continents, no world enlargement.
- No changes to save format (water is derived, not stored).
- No player-facing "generation score".
