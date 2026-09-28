# Autonomous Task Queue

Priorities re-evaluated after each pass. P0 first.

## P0 — Critical
- (none open; launch crash fixed in build 160)

## P1 — High
- [x] Map open lag (DOM atlas) — fixed in build 161 (canvas)
- [x] Map atlas re-render on every open — fixed in build 162 (module cache)
- [x] Stormhaven on ocean (real seed) — fixed in build 162 (moved to 130,-16)
- [x] No zoom LOD on map labels — fixed in build 162 (overlay canvas per tier)

## P2 — Important
- [x] Tutorial house: remove giant beds — build 162
- [x] Tutorial house: smith NPC by the fireplace — build 162
- [x] Playtest tooling: `?debug=1` diagnostics overlay — build 162
- [x] Map<->world validation function + sim tests — build 162
- [x] Debug map mode (`?mapdebug=1` chunk coords) — build 162
- [x] Button segment compression nit (build-160 playtest) — NOT REPRODUCED: build-162 and build-163 playtests both confirmed 3-part buttons render correctly; closed, no change
- [x] "EnterWayfarer Guild" missing space (build-160 playtest) — NOT REPRODUCED: door prompt has always rendered `Enter {name}` with a space (App.tsx:3677, since 63fd751); closed, no change
- [x] Tree overlapping bottom-right house door (build-160 playtest) — fixed build 163, live-verified

## P3 — Polish
- [x] Cartographic polish pass on atlas — DONE build 165 (parchment frame already existed; added aged-atlas vignette ::after on .world-map-stage, pointer-events none, local commit 674c706, push pending visual-verification landing)
- [x] Discovery-aware map markers (dim undiscovered) — REJECTED per DECISIONS.md (atlas landmarks stay fully visible; journal tracks discovery; gating would hurt planning without requested gameplay)
- [x] Map legend expansion (roads, towns, villages, mountains) — build 164 (swatches match actual atlas render colors)

## P4 — Optional
- [x] Second continent content: dungeons/POIs — build 169/170 (Sunken Crypt/Ember Ruins/Whispering Stones); build-170 regression fixes (Descend button, map centering); re-verification running
- [ ] Ocean travel gameplay (the 96-tile gap is currently scenery)
