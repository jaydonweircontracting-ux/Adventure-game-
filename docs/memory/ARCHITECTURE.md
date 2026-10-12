# ARCHITECTURE

## Coordinate Systems
- **World/field**: 0..140 units per chunk (FIELD_SIZE=140).
- **Chunk**: grid of chunks, e.g. tutorial center = (4,7).
- **Interior 0-100**: 2D interiors use 0..100 x/y.
- **Interior tiles**: iso interiors use 12x10 tiles (ROOM_W=12, ROOM_H=10).
- **Tile to 0-100**: x=(tx/12)*100, y=(ty/10)*100.
- **1 tile = 8.33 units** in 0-100 space.

## Critical Constants
- `PLAYER_MELEE_REACH = 5` (0-100 units) — LESS than 1 tile!
- Iso combat uses tile adjacency (Chebyshev ≤1), not 0-100 distance.

## Key Systems
- `src/App.tsx` (~9k lines): GameField component, all gameplay state.
- `src/game/`: 46 modules (world, entities, systems, player, content).
- `src/game/iso/`: IsoFieldView, IsoInteriorView, isoChunks.
- Combat: `src/game/combat.ts` (isInMeleeArc, PLAYER_MELEE_REACH).
- Rats: `src/game/cellarRats.ts` (positions in 0-100).
- Goats: `goatsForChunk()` in App.tsx; kinds: goat/deer/boar/badger/direwolf.

## Test Hooks (testmode=1 only)
- `window.__gameTest`: getBuildings, getCellarRats, getGoats, isInInterior, etc.
- `window.__interiorTapTile(tx,ty)`: tap NPC/rat/move.
- `window.__interiorPlayerPos()`: player tile position.
- `window.__interiorToScreen(tx,ty)`: tile to screen.

## Build
- `npm run build` → vite → dist/public
- Build marker: `window.__AG_BUILD` via scripts/prepare-build-entry.cjs
- Test server: `python3 -m http.server 8901 --directory dist/public`
- Test URL: http://localhost:8901/?testmode=1
