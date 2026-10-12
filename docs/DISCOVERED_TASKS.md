# Discovered Tasks

*Generated: 2026-10-12T01:01:10.377Z*

These tasks were discovered by the autonomous task discovery engine.
They persist across sessions and are ranked by player value.

## DISC-NPC-001: Town NPCs too far from plaza gathering point

- **Evidence:** Audit 2026-10-11: All 12 NPCs 125-148 units from plaza (144,144). Closest is Mira at 53 units. NPCs cluster at (16-93, 23-87).
- **Files:** src/game/townsfolk.ts, src/App.tsx
- **Acceptance:** At least 3 NPCs visible within 30 units of plaza during daytime
- **Risk:** medium | **Scope:** medium
- **Needs approval:** No
- **Status:** closed (investigated 2026-10-11: NPCs correctly at homes)

## DISC-DLG-001: Key NPCs have only generic dialogue

- **Evidence:** Mira got unique dialogue in BUILD 549. Other key NPCs (Cedric merchant, Father Aldous, Tom smith) still use generic archetype responses.
- **Files:** src/game/dialogue.ts
- **Acceptance:** Merchant, priest, and smith have unique "who" responses
- **Risk:** low | **Scope:** small
- **Needs approval:** No
- **Status:** pending

## DISC-TEST-001: Expand real-game test coverage

- **Evidence:** Only 7 real-game test files. No dedicated NPC interaction, dialogue, or town navigation tests.
- **Files:** tests/real-game/
- **Acceptance:** New tests for NPC dialogue and town navigation
- **Risk:** low | **Scope:** medium
- **Needs approval:** No
- **Status:** pending

## DISC-HARNESS-001: Fix M6 stuck detection flakiness

- **Evidence:** M6 sometimes passes, sometimes fails. Test moves player during measurement, changing canMove conditions.
- **Files:** tests/real-game/playtest-harness.mjs
- **Acceptance:** M6 passes consistently across 5 runs, or test resets player position between directions
- **Risk:** low | **Scope:** small
- **Needs approval:** No
- **Status:** pending

## DISC-HARNESS-002: M5 canvas tap needs robustness

- **Evidence:** M5 works but depends on precise projection math. If camera smoothing lags, tap may miss.
- **Files:** tests/real-game/playtest-harness.mjs
- **Acceptance:** M5 passes 5/5 runs with NPCs at various distances
- **Risk:** low | **Scope:** small
- **Needs approval:** No
- **Status:** pending
