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
- **Status:** **FIXED in build 162, VERIFIED** (Stormhaven renders on forest at (130,-16); road leg trimmed).

## BUG-002 — Map atlas re-renders on every open
- **Severity:** P1 (performance)
- **Description:** `renderAtlasCanvas` (~16.5k tiles, 6 passes) runs inside a
  per-mount `useMemo`, so every map open pays the full render cost.
- **Reproduction:** Open/close the world map repeatedly; observe open latency.
- **Root cause:** Build 161 cached per-component-mount instead of globally.
  World data is deterministic and static, so the atlas never changes.
- **Fix:** Module-level lazy `getTerrainAtlas()`; map open becomes one blit.
- **Test:** `?debug=1` shows atlas build time + cache hits.
- **Status:** **FIXED in build 162, VERIFIED** (map open is one cached blit; `?debug=1` confirms cache hits).

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

## BUG-005 — Map zoom pivots around atlas center instead of viewport center
- **Severity:** P3 (visual/polish)
- **Description:** Zooming the world map in/out makes content drift toward a
  corner instead of zooming into the viewport center. Noted in build-170 QA.
- **Reproduction:** Open the world map (opens centered on player), press zoom
  in/out; the player marker slides away from center.
- **Root cause:** `changeZoom` kept `pan` unchanged across zoom steps. With
  `transform: translate(pan) scale(s)` and `transform-origin: center`, a fixed
  pan pivots zoom around the atlas center, not the viewport center.
- **Fix:** Scale pan by the zoom ratio (`pan * newScale/oldScale`) on every zoom
  step, so the atlas point under the viewport center stays under it.
- **Test:** Algebraic verification of the transform math; sim suite unaffected
  (UI state only).
- **Status:** **FIXED in build 175.**

## BUG-006 — Background adventurer hits make goats aggro the player
- **Severity:** P1 (gameplay)
- **Description:** Goats flash white / take damage seemingly at random, then
  chase and attack the player even though the player never hit them.
- **Reproduction:** Stand near goats; every 1.9s the background adventurer sim
  can hit a goat >30 units away; the goat's disposition was forced to
  'aggressive', and goat AI only chases the player.
- **Root cause:** The simulated-adventurer scuffle block copied the player-hit
  goat update verbatim, including `disposition: 'aggressive'`. Goat AI has no
  target tracking — aggressive always means "chase the player".
- **Fix:** Preserve the goat's existing disposition on background hits
  (`disposition: defeated ? 'defeated' : goat.disposition`). Player hits still
  set aggressive as before.
- **Test:** Sim suite 33,067 passed; tsc 8 pre-existing errors, no new ones.
- **Status:** **FIXED in build 176, VERIFIED live.**
