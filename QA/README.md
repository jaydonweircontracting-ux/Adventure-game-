# ASHFALL Autonomous QA and Polish Policy

This is a separate quality layer for ASHFALL. It prevents a compiling feature from being mistaken for a finished feature.

## Current repository scope

The implementation under test is the TypeScript/React/Vite browser game with an optional Node/WebSocket server. Do not assume a Godot runtime or claim scene validation that was not performed.

## Definition of done

A feature is complete only when it is:

- technically working;
- integrated with the authoritative game state;
- understandable to a new player;
- visually readable and coherent;
- responsive and performant for its target device;
- safe across relevant edge cases;
- compatible with existing saves where applicable;
- free of known regressions;
- verified with recorded evidence.

A source file existing is not evidence that a feature works.

## Required quality loop

For every meaningful implementation change:

1. Build or typecheck the smallest affected surface.
2. Run the relevant deterministic checks.
3. Start the affected surface when runtime verification is available.
4. Exercise the golden scenario for the changed system.
5. Inspect the player-facing result for clarity, repetition, clipping, and responsiveness.
6. Measure performance or save behavior when the change can affect it.
7. Record failures and unverified areas in QA/BUGS.md or QA/POLISH.md.
8. Fix regressions before starting a new feature.
9. Commit the bounded result to GitHub.

Do not report a pass when a step was not run. Use NOT_RUN, BLOCKED, PASS, or FAIL.

## Credit-efficient order

Use the cheapest reliable evidence first:

1. static source checks;
2. focused deterministic tests;
3. targeted integration checks;
4. benchmark scripts;
5. runtime playtesting;
6. visual inspection and screenshots;
7. targeted AI critique only where cheaper checks cannot answer the question.

Run only checks affected by the change. Do not repeatedly rediscover repository structure.

## Quality audits

### Startup and core play

Check project startup, new game, player spawn, movement, camera, interaction, combat, inventory, map, dungeon entry, save, load, death, and progression as applicable to the changed surface.

### Player experience

Pretend to be a new player. Check whether controls, objectives, feedback, map information, interaction prompts, combat results, inventory state, and quest state are understandable without chat history.

### Visual and world polish

Check terrain seams, object placement, roads, settlement density, landmark readability, NPC scale and placement, UI clipping, mobile touch targets, camera framing, and obvious repetition. Fix player-facing problems instead of only describing them.

### Simulation integrity

When simulation systems exist, check schedules, needs, travel, event consequences, stuck entities, teleporting, invalid destinations, duplicate entities, and state persistence. A cosmetic timer or placeholder NPC does not pass this audit.

### Persistence and performance

Check old-save loading, deterministic state restoration, save size, load behavior, memory growth, frame-time regressions, and simulation cost when relevant. Never overwrite the only valid save during testing.

## Issue priority

For each observed issue, calculate:

POLISH_SCORE = severity × frequency × player impact

Each factor is scored from 1 to 5. Fix game-breaking and high-impact recurring issues before cosmetic polish.

## Evidence rules

Every QA report must distinguish:

- PASS — the check was run and the expected result was observed;
- FAIL — the check was run and a problem was observed;
- NOT_RUN — no attempt was made;
- BLOCKED — the check could not run because of a known environment or access constraint;
- INCOMPLETE — the feature exists but is not yet integrated enough to test as a finished system.

Never inflate a score by deleting failures, lowering the test scope, or changing the benchmark after observing a regression.

## Repository records

- QA/BUGS.md — reproducible technical and gameplay issues.
- QA/POLISH.md — visual, UX, immersion, repetition, and feel issues.
- QA/GOLDEN_SCENARIOS.md — repeatable scenarios for future verification.
- QA/LATEST_REVIEW.md — most recent honest quality review.
- BENCHMARKS.md — measured performance and verification history.

This policy is process documentation. It does not claim that the current game has passed the checks above.
