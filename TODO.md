# ASHFALL Task Queue

This queue is ordered by value and risk, not novelty. Finish or reclassify the highest-priority item before starting lower-priority polish.

## P0 — Blockers

- [ ] Run the repository build and typecheck locally after the world-core changes.
- [ ] Confirm old browser saves load when the world-core state is absent or uses schema version 1.
- [ ] Fix any compile, save, or load regression before adding another system.

## P1 — Core simulation

- [ ] Advance WorldCore from one existing game-state transition rather than from the render loop.
- [ ] Persist the advanced world clock through the existing browser save path.
- [ ] Add focused deterministic checks for seeded RNG, calendar boundaries, time events, queued events, and schema migration.
- [ ] Separate world/player/AI/dungeon/quest persistence boundaries without breaking current saves.
- [ ] Expand simulated adventurers from a local route loop into persistent goal-driven agents.

## P2 — Living-world systems

- [ ] Add simulation LOD for nearby, regional, distant, and historical activity.
- [ ] Add world history records that are caused by actual events.
- [ ] Add faction state and relationships connected to settlements and NPCs.
- [ ] Add event-driven quest state connected to real world consequences.
- [ ] Add a lightweight economy only after settlement production and trade data exist.
- [ ] Improve geography so terrain, water, roads, resources, and settlements influence one another.

## P3 — Experience and polish

- [ ] Improve overworld terrain composition and landmark hierarchy.
- [ ] Make Mosslight Crossing feel more inhabited through contextual NPC activity.
- [ ] Persist Ember Vault runs after the overworld/dungeon save boundary is separated.
- [ ] Add mobile interaction polish after core simulation behavior is stable.

## P4 — Optional enhancements

- [ ] Add developer simulation controls and an inspector.
- [ ] Add benchmark history for generation, save/load, and simulation cost.
- [ ] Add expanded recovery and architecture documents as those systems become real.

## Working rules

- One authoritative implementation per system.
- Preserve working systems; do not create a disconnected demo.
- A feature is not complete because a type or placeholder exists. It must be integrated and verified.
- Commit each meaningful slice to GitHub before moving to the next one.
- Do not mount or launch the game for documentation-only changes.

## Current recommendation

The next implementation slice is the P1 world-clock integration. Keep it bounded: connect one existing state transition to WorldCore.advance, persist the result, and stop for local verification before adding NPC schedules, factions, or economy.
