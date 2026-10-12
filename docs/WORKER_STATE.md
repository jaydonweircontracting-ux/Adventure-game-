# Autonomous Worker State

**Purpose:** Persistent record for the continuous game evolution engine.
The worker reads this at startup, updates it after each cycle, and resumes from it after interruption.

## Worker Status
- **State:** `paused` (budget exhausted)
- **Started:** 2026-10-11 (BUILD 548)
- **Last cycle:** 5 (complete)
- **Last known-good commit:** `e5d11fb`
- **Last known-good build:** 551

## Current Cycle
- **Cycle:** 5
- **Phase:** `complete`
- **Task:** DISC-DLG-001 — Unique dialogue for key NPCs
- **Started:** 2026-10-11
- **Files changed:** [src/game/dialogue.ts]
- **Tests run:** [smoke 7/7, tsx dialogue verification]
- **Result:** `verified` — Cedric, Father Aldous, Tom have unique introductions

## Retry History
- (empty)

## Known Regressions
- (none)

## Blockers
- TASK-004 (movement speed): needs user approval per BUILD 377. Does not block other work.

## Next Recommended Task (user priority order for next session)
1. DISC-NPC-001 — Investigate Mosslight Crossing NPC placement. Do NOT blindly move NPCs to plaza. First verify: coordinate systems match, NPCs visible/reachable, distance intentional vs bug, actual town/roads/buildings locations, home/workplace assignments. Smallest safe change for coherent town. Mira's directions must stay accurate.
2. DISC-TEST-001 — Expand gameplay regression tests: NPC spawning/visibility, positions vs intended town, unique dialogue (Mira/Cedric/Aldous/Tom), Mira's directions match world, interaction opens dialogue, collision around NPCs, invalid spawns, duplicates.
3. Then: one additional player-facing improvement from world simulation (schedules, routines, destinations, animations, merchant interactions, roads, examine descriptions).

User caution: task discovery needs proof over multiple sessions — must resume, discover new tasks, avoid repeating work, ship verified improvements without direction.

## Resume Instructions
If the worker stops unexpectedly:
1. Read this file
2. Check `Last known-good commit` — reset to it if working tree is corrupt
3. Check `Current Cycle` — if Phase is not `complete`, resume from that phase
4. Run `node scripts/worker.mjs resume` to continue
5. Run `node scripts/discover-tasks.mjs list` to see discovered tasks

## Budget
- Max cycles per session: 5
- Max retries per task: 3
- Max wall time per cycle: 30 minutes
- Cycles used: 5/5 (budget exhausted — reset for next session)
