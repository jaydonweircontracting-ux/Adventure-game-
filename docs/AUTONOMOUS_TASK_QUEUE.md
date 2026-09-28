# Autonomous Task Queue

Priorities re-evaluated after each pass. P0 first.

## P0 — Critical
- (none open; launch crash fixed in build 160)

## P1 — High
- [x] Map open lag (DOM atlas) — fixed in build 161 (canvas)
- [ ] Map atlas re-render on every open — fix in build 162 (module cache)
- [ ] Stormhaven on ocean (real seed) — fix in build 162 (move to 130,-16)
- [ ] No zoom LOD on map labels — fix in build 162 (overlay canvas per tier)

## P2 — Important
- [ ] Tutorial house: remove giant beds — build 162
- [ ] Tutorial house: smith NPC by the fireplace — build 162
- [ ] Playtest tooling: `?debug=1` diagnostics overlay — build 162
- [ ] Map<->world validation function + sim tests — build 162
- [ ] Debug map mode (`?mapdebug=1` chunk coords) — build 162
- [ ] Button segment compression nit (build-160 playtest)
- [ ] "EnterWayfarer Guild" missing space (build-160 playtest)
- [ ] Tree overlapping bottom-right house door (build-160 playtest)

## P3 — Polish
- [ ] Cartographic polish pass on atlas (parchment frame, vignette)
- [ ] Discovery-aware map markers (dim undiscovered) — decision needed
- [ ] Map legend expansion (roads, dungeons)

## P4 — Optional
- [ ] Second continent content: dungeons/POIs beyond the 7 settlements
- [ ] Ocean travel gameplay (the 96-tile gap is currently scenery)
