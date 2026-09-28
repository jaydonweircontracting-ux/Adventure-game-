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
- **Severity:** P2 (visual) — **FIXED in build 161, VERIFIED live in build 168**
- **Root cause:** `.horse { transform: ... scale(1.35) }` scaled rider + cow.
- **Fix:** Removed the scale; horse/rider render at authored size.
- **Test:** Live playtest with `?playtestMount=1` (starts mounted in the field): horse + rider normal-sized relative to NPCs/houses/trees; no console errors. Verdict NORMAL SIZE.
- **Status:** Closed 2026-09-28.

## BUG-004 — Playtester could not find Saltmarsh / Emberhold / Dunmere (build 161)
- **Severity:** P2 (report) — **NOT REPRODUCED, no code change**
- **Description:** Build-161 live playtest found 4/7 second-continent settlements
  (Stormhaven, Frostwatch, Oakfield, Stonebridge) but not Saltmarsh (165,25),
  Emberhold (184,15), Dunmere (144,35).
- **Reproduction:** N/A — data verified present.
- **Root cause:** Playtest coverage gap, not a data bug. All 7 sites exist in
  `mapLandmarks` and sit on verified land under the real seed 847291583
  (Saltmarsh meadow, Emberhold rock/ridge, Dunmere desert). The three missed
  sites are the far south/east corner of the 80x80-tile continent (y 15..35,
  x up to 184); the tester did not pan that far.
- **Test:** One-off coordinate check vs real seed (all on land); permanent sim
  section 8 asserts every landmark is non-ocean (33,061 passed).
- **Status:** Closed as not-reproduced 2026-09-28. No fix needed.
