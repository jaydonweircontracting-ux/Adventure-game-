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
- [x] Button segment compression nit (build-160 playtest) — NOT REPRODUCED: build-162 and build-163 playtests both confirmed 3-part buttons render correctly; closed, no change
- [x] "EnterWayfarer Guild" missing space (build-160 playtest) — NOT REPRODUCED: door prompt has always rendered `Enter {name}` with a space (App.tsx:3677, since 63fd751); closed, no change
- [ ] Tree overlapping bottom-right house door (build-160 playtest)

## P3 — Polish
- [x] Cartographic polish pass on atlas — DONE build 165 (parchment frame already existed; added aged-atlas vignette ::after on .world-map-stage, pointer-events none, local commit 674c706, push pending visual-verification landing)
- [ ] Discovery-aware map markers (dim undiscovered) — decision needed
- [x] Map legend expansion (roads, towns, villages, mountains) — build 164 (swatches match actual atlas render colors)

## P4 — Optional
- [ ] Second continent content: dungeons/POIs beyond the 7 settlements
- [ ] Ocean travel gameplay (the 96-tile gap is currently scenery)
