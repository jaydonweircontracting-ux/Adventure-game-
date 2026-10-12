# Human Experience Brain — Evidence Log

Evidence-based player experience findings from real Playwright sessions.
All findings tied to observable game behavior, not speculation.

## BUILD 535 — 2026-10-11

### First-Time Player Experience

**Spawn & Orientation**
- Evidence: Player spawns inside Tutorial House interior at (50,78). Screen shows "You wake inside the left Tutorial House on the island."
- Finding: Clear starting context. Player understands they are indoors.
- Score: 4/5 (satisfying, clear)

**Movement Responsiveness**
- Evidence: ArrowRight held for 2s → interior x: 50.0 → 57.1 (dx=7.1). Field movement: ~2 units/sec.
- Finding: Movement is responsive (immediate start), but speed feels slow for crossing large fields. 190 units takes ~95 seconds.
- Score: 3/5 (functional but slow for exploration)
- Hypothesis: Faster base speed or a run toggle would improve exploration feel.

**Doorway Discovery**
- Evidence: Doorway at (50, y>91). Player must walk to bottom of interior to exit. No visual indicator of doorway in test (screenshot needed).
- Finding: Exit mechanism works but may not be discoverable. First-time player might not know to walk to the bottom.
- Score: 3/5 (functional, discoverability uncertain)
- Recommended: Playtest with human to verify doorway discoverability.

### Explorer Experience

**Chunk Transition**
- Evidence: Player walked from (4,7) to (5,7). Position wrapped from x=253 to x=6. Chunk changed. 4 goats spawned in new chunk.
- Finding: Chunk transition works seamlessly. New content (enemies) appears.
- Score: 4/5 (satisfying, reliable)

**Obstacle Navigation**
- Evidence: Cliff at x≈192 blocked eastward movement. Player had to navigate north around it (y: 114 → 43) to continue east.
- Finding: Cliffs create meaningful terrain obstacles. Navigation around them works but is slow and tedious for automated tests.
- Score: 3/5 (functional, but pathfinding around obstacles is manual)
- Note: This is working as designed (cliffs block uphill). Not a defect.

**Enemy Discovery**
- Evidence: 4 goats in chunk (5,7) at positions (176,82), (73,59), (210,36), (107,253). Player at (256,274) after transition — 200+ units from nearest goat.
- Finding: Enemies exist but can be far from chunk entry point. Player must explore to find them.
- Score: 3/5 (functional, exploration required)

### Combat Player Experience (IN PROGRESS)

**Attack Input**
- Evidence: Space key calls `attackGoat()`. Attack button exists with `data-testid="button-attack"`.
- Status: Testing in progress. Initial attempts showed no damage — investigating range (5 units) and positioning.

**Combat Feedback**
- Status: Not yet verified. Need to confirm: attack animation plays, damage numbers or HP bar updates, enemy reacts.

### Frustration Points Identified

1. **Slow movement speed** (~2 u/s): Crossing a 280-unit field takes 2+ minutes. May feel tedious.
   - Severity: P3 (polish)
   - Evidence: Timed walks in automated tests

2. **Doorway discoverability**: Unclear if new players know to walk to bottom of interior to exit.
   - Severity: P3 (needs human playtest)
   - Evidence: No visual indicator observed in test

3. **Enemy distance**: After chunk transition, enemies can be 200+ units away.
   - Severity: P4 (exploration is part of game)
   - Evidence: Measured positions

### Performance

- Evidence: No fatal page errors in any test. Game loads in ~10s. Screenshots render correctly.
- Score: 4/5 (stable)

## Test Coverage

- ✅ Boot & spawn (L4)
- ✅ Interior movement (L5)
- ✅ Doorway exit (L5)
- ✅ Field movement (L5)
- ✅ Chunk transition (L5)
- ✅ Cliff obstacle navigation (L5)
- ⏳ Combat (L5) — in progress
- ❌ NPC interaction (not tested)
- ❌ Inventory/UI (not tested)
- ❌ Save/load (not tested)
