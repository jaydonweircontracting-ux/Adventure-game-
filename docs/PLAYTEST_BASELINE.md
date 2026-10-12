# Playtest Baseline — BUILD 553

**Generated:** 2026-10-12T01:20:00Z
**Method:** Browser-playtest (Playwright + Chromium, real inputs)
**Harness:** `tests/real-game/playtest-harness.mjs` (hardened)
**Command:** `node tests/real-game/playtest-harness.mjs`

## Results: 6/7 metrics passed (BUILD 552: 5/7)

### ✅ M1: Game loads, player can start
- Player at (141, 142), HP=100

### ✅ M2: Player can move and navigate
- 5/5 movement inputs produced position change
- Fixed: uses down/wait/up pattern (like proven movement.mjs)

### ✅ M3: Town discovery
- Player at (89, 114). 1 NPC within 30 units: Mira

### ✅ M4: Unique NPCs encountered
- 1/13 NPCs within 50 units. Visible: Mira

### ✅ M5: NPC interaction/dialogue via canvas tap (FIXED in BUILD 553)
- Tapped Mira, dialogue opened with correct NPC
- Method: Compute NPC screen pos via iso projection (TILE_W=64, TILE_H=32),
  camera centered on player, mouse.click at computed coords, verify dialogue
  title matches NPC name. Does NOT bypass game interaction system.

### ⚠️ M6: Stuck incidents (IMPROVED, flaky)
- Sometimes passes ("No stuck incidents"), sometimes fails
- Root cause: test moves player during measurement, changing canMove conditions
- Game itself verified fine by dedicated movement.mjs tests
- Needs: test that doesn't move player, or resets position between directions

### ✅ M7: NPC behavior/schedule over 30s (IMPROVED in BUILD 553)
- 11/13 moved, 3 changed activity, 0 disappeared
- Captured real transitions: Cedric (Opening→Minding stall),
  Father Aldous (Tending→Prayers), Tom (At guild→Working forge)
- Method: 30s observation (was 10s), tracks activity changes

## Console errors: 0

## Comparison: BUILD 552 → BUILD 553
| Metric | 552 | 553 | Change |
|--------|-----|-----|--------|
| M1 | ✅ | ✅ | — |
| M2 | ✅ | ✅ | Fixed flakiness with down/wait/up |
| M3 | ✅ | ✅ | — |
| M4 | ✅ | ✅ | — |
| M5 | ❌ | ✅ | **FIXED: canvas tap interaction** |
| M6 | ❌ | ⚠️ | Improved logic, still flaky |
| M7 | ✅ | ✅ | 30s + activity transitions |

## P5: Gameplay issue investigation
No confirmed gameplay defect found. Game is healthy:
- Loads, moves, NPCs visible, dialogue works, schedules transition
- 0 console errors across all runs
- M6 flakiness is test infrastructure, not game bug
