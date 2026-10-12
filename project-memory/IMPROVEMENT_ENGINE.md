# Improvement Engine State (BUILD 669)

Persistent state for the autonomous game improvement engine.
Updated after each development cycle.

## Current Status

- **Verified HEAD:** 29d66d3
- **Last Build:** 668 (in progress)
- **Status:** Active
- **Last Updated:** 2026-10-12

## Current Task

**BUILD 668:** True 8-direction horse animations + smart minimap pathfinding + input regression audit
- Status: In progress
- Stage: Implementation complete, testing

## Improvement Queue

### P0 — Broken/Destructive
(none currently)

### P1 — Core Gameplay
- [ ] Minimap pathfinding: verify A* navigates around obstacles in real gameplay
- [ ] Text input isolation: audit all keyboard handlers (IsoRoom, StoneSoupDungeon)

### P2 — World Believability
- [ ] Horse sprite: true 8-direction art (currently maps diagonals to cardinals)
- [ ] Market: verify NPCs actually gather at stalls during midday

### P3 — Major Gameplay
- [ ] Wheat-to-flour-to-bread: complete food chain
- [ ] Woodcutter NPCs: gather timber (no woodcutter NPCs exist yet)

### P4 — Polish
- [ ] Horse animation: smoother transitions between directions

## Completed Improvements

### BUILD 668 (2026-10-12)
- Minimap A* pathfinding: tap → findPath → follow waypoints
- 8-direction horse facing: eightDirectionFromVector + CSS mapping
- 11 new tests, 54,800 pass

### BUILD 666/667 (2026-10-12)
- Horse speed rebalanced: 180 → 28 (1.75x)
- D-pad slide-to-change-direction
- Minimap click-to-move (straight-line)
- Text input keybind isolation (isTextInputActive)

### BUILD 665 (2026-10-12)
- Wheat fields with 5-stage lifecycle
- Working mills: 4 wheat → 3 flour
- Farmer harvesting integration

### BUILD 664 (2026-10-12)
- Market stalls relocated to plaza (128,128)/(160,128)
- Control Center Market tab

## Known Limitations

- No true horse sprite (uses cow placeholder)
- No cart sprites
- Wheat fields are logical, not visual
- Mill is logical, no sprite

## Next Recommended Task

**Verify BUILD 668 in browser:** Use Playwright to test minimap click-to-move with obstacles, verify horse 8-direction facing changes, confirm text input isolation in NPC dialogue.

**Why:** BUILD 668 changes are logic-only (no visual assets). Browser verification ensures the A* pathfinding actually works in the real game, not just in unit tests.
