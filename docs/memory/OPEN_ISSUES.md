# OPEN ISSUES

## ISSUE-001: Rat quest 5 kills unverified
- **Status:** BLOCKED (test infrastructure)
- **Evidence:** Damage works (12→3 HP). Quest setup works.
- **Blocker:** Test timing unreliable; button selector valid but waits fail.
- **Next:** Replace arbitrary sleeps with state-based waits.

## ISSUE-002: Goat discovery 0/3
- **Status:** OPEN (diagnosis needed)
- **Evidence:** 3 runs × 100 northward steps, 0 goats found.
- **Hypotheses:**
  - Player never left safe zone chunk (4,7)
  - Wrong direction (no meadows north?)
  - Chunk activation issue
  - getGoats() only returns current chunk
- **Next:** Trace player chunk during walk; check meadow locations.

## ISSUE-003: Sim clock disconnected
- **Status:** OPEN
- **Evidence:** sim-clock.mjs is standalone counter.
- **Next:** Connect to game world clock or document as test-only.
