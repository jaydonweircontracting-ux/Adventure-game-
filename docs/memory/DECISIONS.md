# DECISIONS

## DECISION-001: Tile adjacency for iso combat
- **Date:** BUILD 571/574
- **Decision:** Iso cellar combat uses tile adjacency (Chebyshev ≤1), not 0-100 distance.
- **Reason:** 1 tile = 8.33 units > PLAYER_MELEE_REACH (5). Adjacent tiles would never hit.
- **Preserved:** 2D mode still uses original arc check.

## DECISION-002: Goats use deer sprite + horns
- **Date:** BUILD 575/576
- **Decision:** Goat kind added to spawn table; renders deer sprite with horns + tint.
- **Reason:** No goat asset exists. Horns make them distinct.
- **Future:** Replace with proper goat sprite when available.

## DECISION-003: Starting safe zone
- **Decision:** Tutorial center chunk (4,7) spawns no animals.
- **Reason:** Safe starting experience.
- **Constraint:** Do not spawn animals in safe zone.

## DECISION-004: No teleport testing
- **Decision:** Tests must use real controls, never teleport.
- **Reason:** Teleporting bypasses the systems under test.
