# ASHFALL QA Bug Ledger

This file records known problems and verification gaps. It is intentionally honest: an item is not marked PASS because a source file exists.

## Scoring

POLISH_SCORE = severity × frequency × player impact

Each factor is 1–5. Use the score to prioritize, not to hide failures.

## Open items

### QA-005 — Isometric monster render ownership

- Status: FIXED IN SOURCE; BUILD VERIFICATION PENDING
- Severity: 3
- Frequency: 4
- Player impact: 4
- Reproduction: In the isometric field, monster state belongs to the active chunk while the terrain renderer draws a 3×3 chunk scene grid.
- Expected: Each valid active-chunk monster renders once at its chunk-local world position; hostile monsters remain suppressed in starting areas.
- Actual: Renderer accepted the incoming monster array without validating chunk-local coordinates or duplicate IDs.
- Fix: Filter live monster drawables to valid active-chunk coordinates and deduplicate by entity ID before rendering. Existing safe-zone suppression remains in place.
- Verification: Source change committed; CI typecheck/build and browser playtest are pending. No runtime pass is claimed.


### QA-001 — World core is not yet driven by gameplay time

- Status: INCOMPLETE
- Severity: 4
- Frequency: 5
- Player impact: 4
- Polish score: 80
- Reproduction: Inspect the current integration boundary. WorldCore exposes advance and time subscriptions, but the existing overworld loop has not yet been connected to it.
- Expected: The world clock advances from an authoritative game-state transition and is persisted through the existing save path.
- Actual: The world-core foundation is present and serialized, but gameplay does not yet advance it as part of the playable loop.
- Likely cause: The current patch intentionally stopped before runtime integration.
- Fix: Connect one existing state transition to WorldCore.advance, then verify old-save loading and new-save restoration.
- Verification: Not run; this is an architecture-level incomplete item.

### QA-002 — Simulated adventurers are not persistent across regions

- Status: INCOMPLETE
- Severity: 4
- Frequency: 4
- Player impact: 4
- Polish score: 64
- Reproduction: Review ASHFALL_DEVELOPMENT_STATE.md and simulatedAdventurers.ts.
- Expected: Adventurers have persistent identities, goals, travel, progression, and save-backed state outside the player vicinity.
- Actual: The current slice uses a lightweight local route loop and is not yet persistent across regions or saves.
- Fix: Add a save-backed agent state boundary and simulation LOD before expanding behavior.
- Verification: Runtime test not run.

### QA-003 — Dungeon runs reset when the overlay closes

- Status: INCOMPLETE
- Severity: 3
- Frequency: 3
- Player impact: 4
- Polish score: 36
- Reproduction: Enter the Ember Vault, make progress, close the overlay, and reopen it during a local runtime check.
- Expected: Dungeon state follows the intended persistence rules.
- Actual: The current development state records that dungeon runs reset when the overlay closes.
- Fix: Separate and persist dungeon-run state through the save boundary after the world/player/dungeon model is stable.
- Verification: Runtime test not run in this session.

### QA-004 — Build and runtime verification are not current

- Status: NOT_RUN
- Severity: 4
- Frequency: 1
- Player impact: 5
- Polish score: 20
- Reproduction: No build, typecheck, browser launch, or gameplay session was run from this documentation checkpoint.
- Expected: The latest world-core and documentation commits have a recorded local verification result.
- Actual: GitHub writes succeeded; local runtime verification remains outstanding.
- Fix: Run the focused build/typecheck and save-compatibility checks before treating the world-core slice as release-ready.
- Verification: NOT_RUN by design; no pass is claimed.

## Ledger template

### QA-XXX — Short title

- Status: NOT_RUN | BLOCKED | INCOMPLETE | FAIL | PASS
- Severity: 1–5
- Frequency: 1–5
- Player impact: 1–5
- Polish score: severity × frequency × player impact
- Reproduction:
- Expected:
- Actual:
- Likely cause:
- Fix:
- Verification:

## Rules

- Keep reproducible issues here instead of rediscovering them in later sessions.
- Update status only when evidence changes.
- Move resolved items to a dated archive section rather than deleting the history.
- Do not turn a missing test into a passing result.
