# Decision Log

Architectural decisions. Future work must not silently undo these.

## 2026-09-28 — Map is a VIEW, world is SOURCE OF TRUTH
- The map renders `generatedWorldTiles` (module constant, generated once at load).
- Never add a second world generator, chunk system, or coordinate system for the map.
- `WORLD DATA -> MAP DATA -> MAP RENDERER`. Map open must never generate terrain.

## 2026-09-28 — Single cached canvas atlas, not DOM/SVG
- Build 161 replaced ~16.5k DOM nodes with one pre-rendered canvas.
- Build 162 caches the terrain canvas at module level (world data is static).
- Pan/zoom = CSS transform of the canvas wrapper. No per-frame redraws.

## 2026-09-28 — LOD via separate label overlay
- Terrain is baked once; settlement/region labels render to a lightweight overlay
  canvas, redrawn only when the zoom tier changes.
- Tiers: far (region labels + towns) / mid (+ villages) / near (all + debug coords
  when `?mapdebug=1`).
- Rationale: avoids a second full-resolution atlas (~45MB each) on mobile Safari.

## 2026-09-28 — Atlas landmarks stay fully visible (no discovery gating)
- The journal already tracks discovered locations; the map renders all landmarks
  as a navigational atlas. Gating markers behind discovery was considered and
  rejected: it would make the map useless for planning without adding gameplay
  the user requested.

## 2026-09-28 — Settlement coordinates validated against DEFAULT_WORLD_SEED
- Never validate world coordinates against a different seed again (see BUG-001).
- `validateMapData()` in worldMap.ts is the standing check; sim runs it.

## 2026-09-28 — Tutorial-house smith is Bram
- The smith NPC by the tutorial-house fireplace reuses Bram's identity and the
  existing smith dialogue (Craft/Sell/Rumours). No duplicate smith system.
