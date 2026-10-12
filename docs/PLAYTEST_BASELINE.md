# Playtest Baseline — BUILD 550

**Generated:** 2026-10-12T01:09:44Z
**Method:** Browser-playtest (Playwright + Chromium, real inputs)
**Harness:** `tests/real-game/playtest-harness.mjs`
**Command:** `node tests/real-game/playtest-harness.mjs`

## Results: 5/7 metrics passed

### ✅ M1: Game loads, player can start
- Player at (141, 142), HP=100
- Method: New Game clicked, hooks verified

### ✅ M2: Player can move and navigate
- 5/5 movement inputs produced position change
- Method: Real ArrowRight keypresses in tutorial interior

### ✅ M3: Town discovery — NPCs visible from spawn
- Player at (89, 114). 1 NPC within 30 units: Mira
- Method: Exit tutorial, count NPCs within 30-unit radius
- **Evidence for DISC-NPC-001:** Only Mira visible. Other 12 NPCs are 125+ units away.

### ✅ M4: Unique NPCs encountered
- 1/13 NPCs within 50 units. Visible: Mira
- Method: Count NPCs within 50-unit radius

### ❌ M5: NPC interaction/dialogue
- Status: HARNESS LIMITATION (not a game bug)
- Detail: NPCs render on iso canvas, not as DOM buttons. Harness looked for `[data-testid^="npc-"]` which only exists in 2D fallback mode.
- Game is working: Mira is visible on canvas, tappable via canvas. Dialogue verified separately via tsx (BUILD 549/550/551).
- Action: Harness needs canvas-tap support for iso mode, or test in 2D fallback.

### ❌ M6: Stuck incidents
- 4 directions where movement should work but didn't
- Status: NEEDS INVESTIGATION — could be test artifact (canMove vs actual position desync) or real collision bug.
- Method: Press each arrow, compare movement vs canMove() check.

### ✅ M7: NPC visibility/behavior over 10s
- 12/13 NPCs moved, 0 disappeared. All 13 still present.
- Method: Compare positions before/after 10s.
- Limitation: 10s is short; full schedules need longer.

## Console errors: 0

## Key findings
1. **DISC-NPC-001 CONFIRMED:** Only 1/13 NPCs (Mira) visible from spawn. Others cluster at (16-93, 23-87), 125+ units away.
2. **Mira's directions are correct** (northwest, fixed in BUILD 550).
3. **No console errors.** Game is stable.
4. **NPCs are alive:** 12/13 moved during 10s observation.

## Limitations
- M5: Iso canvas interaction not automated (harness limitation)
- M6: Stuck detection needs refinement (possible false positives)
- M7: 10s observation too short for full schedule verification
- All tests use fresh game state; long-session behavior not measured
