# Bug Database

## BUG-001 — Stormhaven placed on ocean
- **Severity:** P1
- **Description:** Second-continent town Stormhaven at (125,-16) renders in open
  water. Its road leg also runs over ocean as a long bridge to nowhere.
- **Reproduction:** Generate the world with the real DEFAULT_WORLD_SEED
  (847291583); inspect tile (125,-16) -> biome `ocean`.
- **Root cause:** Build 161 validated settlement coordinates against seed 1, not
  the game's actual default seed.
- **Fix:** Move Stormhaven to (130,-16) (forest, inland, verified with real seed);
  trim the road leg to start at x=129.
- **Test:** Coordinate validation script vs real seed; sim map-validation tests.
- **Status:** Fix in progress (build 162).

## BUG-002 — Map atlas re-renders on every open
- **Severity:** P1 (performance)
- **Description:** `renderAtlasCanvas` (~16.5k tiles, 6 passes) runs inside a
  per-mount `useMemo`, so every map open pays the full render cost.
- **Reproduction:** Open/close the world map repeatedly; observe open latency.
- **Root cause:** Build 161 cached per-component-mount instead of globally.
  World data is deterministic and static, so the atlas never changes.
- **Fix:** Module-level lazy `getTerrainAtlas()`; map open becomes one blit.
- **Test:** `?debug=1` shows atlas build time + cache hits.
- **Status:** Fix in progress (build 162).

## BUG-003 — Mounted sprites enlarged (build 161)
- **Severity:** P2 (visual) — **FIXED in build 161**
- **Root cause:** `.horse { transform: ... scale(1.35) }` scaled rider + cow.
- **Status:** Fixed in source; awaiting live visual confirmation.
