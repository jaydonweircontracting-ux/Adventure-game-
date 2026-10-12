# Autonomous Worker State

**Purpose:** Persistent record for the continuous game evolution engine.
The worker reads this at startup, updates it after each cycle, and resumes from it after interruption.

## Worker Status
- **State:** `running` (emergency directive — executing)
- **Started:** 2026-10-11 (BUILD 548)
- **Last cycle:** 13 (complete — long-distance nav)
- **Last known-good commit:** `6e0c04b`
- **Last known-good build:** 559

## Current Cycle
- **Cycle:** 13
- **Phase:** `complete`
- **Task:** Long-distance navigation verification (78 units)
- **Started:** 2026-10-11
- **Files changed:** [tests/real-game/agent.mjs (import guard)]
- **Tests run:** [nav 78 units: REACHED, 85 actions, 0 stuck]
- **Result:** `verified` — Greedy navigation handles 78 units, 0 stuck. No pathfinding upgrade needed.

## Retry History
- (empty)

## Known Regressions
- (none)

## Blockers
- TASK-004 (movement speed): needs user approval per BUILD 377. Does not block other work.

## Next Recommended Task
1. DISC-TEST-001 — Expand coverage (still open).
2. Next gameplay improvement from evidence (none currently needed — game healthy). Do NOT blindly move NPCs to plaza. First verify: coordinate systems match, NPCs visible/reachable, distance intentional vs bug, actual town/roads/buildings locations, home/workplace assignments. Smallest safe change for coherent town. Mira's directions must stay accurate.
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
- Cycles used: 6 (emergency directive — continued beyond budget)

## Long-term goal: gameplay quality metrics (user directive 2026-10-11)
Move from 'does the code build' to 'does the game play well'. Track:
- Can players find the town? (navigation success rate)
- Can players discover NPCs? (NPC encounter rate in first 10 min)
- Can players complete interactions? (dialogue/quest completion rate)
- Can players navigate without getting stuck? (stuck incidents per session)
- Does the world feel alive? (visible NPC activity density over time)
Measure these in real-game tests, not just unit tests. This is how the worker
evolves from autonomous coding toward autonomous game development + playtesting.

SAFEGUARD (user directive 2026-10-11): metrics inform design judgment, they do not
replace it. Never optimize a number at the cost of believability — e.g. clustering
all NPCs beside the player would inflate encounter counts while making the town feel
artificial. Each metric needs: defined measurement method, baseline, repeatable test.
Distinguish automated simulation results from actual browser-playtest results; never
mistake one for the other. Feedback loop: observe real gameplay → identify friction →
rank → implement → replay same tests → compare → preserve improvement → repeat.
