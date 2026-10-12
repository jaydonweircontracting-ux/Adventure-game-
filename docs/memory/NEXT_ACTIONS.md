# NEXT ACTIONS

> Ordered by priority. Updated after each build.

## 1. Diagnose goat discovery chain
- **Why:** 0/3 discovery; need root cause before changing spawns.
- **How:** Trace player chunk during walk; check if safe zone left; verify meadow locations.
- **Accept:** Know exactly why goats weren't found.

## 2. State-based waits for rat quest test
- **Why:** Timing failures block 5-kill verification.
- **How:** Replace sleeps with waits for observable game state.
- **Accept:** Quest test completes reliably.

## 3. Complete 5-rat quest + turn-in + save/load
- **Why:** Core gameplay loop unverified end-to-end.
- **Depends:** #2
- **Accept:** 5 kills, rewards once, persistence verified.

## 4. Connect sim clock to game
- **Why:** Standalone clock can't observe real gameplay.
- **How:** Hook into world clock or document limitation.
- **Accept:** Clock advances real game systems.
