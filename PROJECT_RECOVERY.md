# ASHFALL Project Recovery

GitHub is the canonical source of truth for this project.

Repository: https://github.com/jaydonweircontracting-ux/Adventure-game-
Branch: main
Latest world-core checkpoint: fedb27019ec05f7a2d614adee30201a29a86750c

## What this repository is today

The current implementation is a TypeScript/React/Vite browser RPG with an optional Node/WebSocket world-server boundary. It is not currently a Godot project. The supplied Godot architecture direction is treated as a design reference; do not migrate the working browser project wholesale without a separately planned checkpoint.

Current important areas:

- src/App.tsx — overworld UI, input, movement, rendering, combat, inventory, saves, and dungeon entry.
- src/game/rpgBrain.ts — deterministic RPG content registry and persistent game-state brain.
- src/game/worldCore.ts — deterministic seed, calendar, simulation speed, time events, and queued world events.
- src/game/simulatedAdventurers.ts — current lightweight living-world adventurer slice.
- src/game/stoneSoupEngine.ts — dungeon rules and state.
- world_generator.js — optional deterministic chunk generator.
- server.js — optional HTTP/WebSocket world-server boundary.
- ASHFALL_DEVELOPMENT_STATE.md — current implementation status and known gaps.
- DEVELOPMENT_LOG.md — prior checkpoints and bounded implementation notes.
- BENCHMARKS.md — benchmark and verification history.

## Recover the project

1. Clone the repository and check out the main branch.
2. Install the Node 20-compatible dependencies with npm install.
3. Read ASHFALL_DEVELOPMENT_STATE.md, DEVELOPMENT_LOG.md, and BENCHMARKS.md before changing code.
4. Inspect the latest commit and its parent before starting a risky change.
5. Make one small, coherent change at a time.
6. Commit each meaningful checkpoint to main with a descriptive message.

## Local commands

Browser development:

- npm run dev
- npm run build
- npm run typecheck

Optional world-server boundary:

- npm start
- npm run world-server

The browser client is not automatically connected to the optional WebSocket server. Do not assume server synchronization exists just because the server files are present.

## Recovery rules

- Preserve working systems before refactoring them.
- Do not create a parallel demo or duplicate authoritative system.
- Do not mount or run the game as part of a documentation-only checkpoint.
- Do not commit browser save data, world state, credentials, or environment files.
- Treat old save formats as migration inputs, not disposable data.
- Before a risky architectural change, create a clearly named Git checkpoint commit.
- If a change is worse, revert to the last known-good commit rather than stacking fixes on top of it.

## Current brain-layer status

The world core is deliberately foundational and is not yet driven by the render loop. It currently provides:

- deterministic seeded randomness;
- a serializable world clock with seconds through years;
- pause and configurable simulation-speed values;
- time-boundary subscriptions;
- queued world events;
- versioned state loading with compatibility for the previous world-core schema.

The next safe implementation seam is to advance this core from an existing game-state transition and persist the result through the current save path. Do not claim the living-world simulation is complete until that integration is real and verified.

## Handoff checklist

Before handing work to another agent, record:

- what changed;
- which files changed;
- the commit SHA;
- what was tested and what was intentionally not run;
- known risks or compatibility concerns;
- the single next recommended slice.

The project should be recoverable from GitHub and these documents without relying on chat history.
