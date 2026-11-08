# Automated Gameplay Intelligence + World Intelligence and Emergent Story Testing

**Directive:** SOUL.md §57 §8 (automated gameplay intelligence) and §9 (world intelligence and emergent story testing).
**What already exists:** The sim suite (`scripts/simulate.ts` — 41k+ assertions over pure modules, deterministic), the standalone asserts (`~/workspace/verify<BUILD>/` — entry + runner checks), the phone probe (Playwright, 390×844, real taps, `window.__gameTest` hooks — BLOCKED by Chromium SIGTRAP), the NPC-vs-monster combat system (BUILDS 915–920, verified live 2026-10-20), the simulated adventurers / travelers (BUILD 1000, transient visitors), and the Stage 1 baseline (the world's measured state). This file adds the gameplay-intelligence and world-intelligence testing systems: the simulated players, the world simulations, and the emergent-story tests. It does not replace the sim or the phone probe — it is the layer that tests the game as a played experience, not as source code.

## Automated gameplay intelligence (§57 §8)

The development system must be able to evaluate the actual game, not just its source code. Autonomous testing agents enter the game and perform realistic activities.

### What the simulated players do

* Start new characters (menu → New Game → character → "Begin Adventure" — the same flow the phone probe uses).
* Explore regions (walk the town, cross chunk boundaries, travel to the wild).
* Travel between settlements (follow roads; the 1000 travelers already do this as NPCs — the test agents do it as players).
* Interact with NPCs (talk targets, barks, schedules).
* Fight enemies (wolves, slimes, rats — the 915–920 combat systems).
* Gather resources (E-key: crate +1 wood, tree +2 wood, rock +1 stone — the 3D gathering rules).
* Trade (where shops exist — the inn/store/smith are visual shells in 3D, so trade testing waits for their mechanics).
* Complete quests (where quests exist in 3D — they do not yet; the registry records quests in 3D as NOT IMPLEMENTED).
* Die and recover where supported.
* Test progression (levels, skills — skills earn XP only from real successful actions; never for clicks or menu opens).
* Test equipment (where equipment exists in 3D — the registry records it as NOT IMPLEMENTED).
* Test save/load (place, save, reload, identical — the 1029 chunk test is the model).
* Discover broken interactions (and automatically generate development tasks when problems are found).

### How it runs

* **Multiple deterministic test scenarios.** Each scenario has a seed, a script (the sequence of actions), and an expected outcome. Deterministic seeds so failures can be reproduced.
* **Long-duration simulations.** A scenario that runs for many in-game hours (the world sim continues whether or not the player is watching — the §50 living-world rule).
* **Issue tracking.** When a simulated player finds a problem (stuck, softlocked, unreachable, inconsistent), the system automatically generates a development task (in the queue, prioritized by expected value) with the reproduction (seed + scenario + position + state).
* **Separate from real-player progress.** Simulated testing never touches the user's save (`ag-3d-*` keys) or the real player's world. Test runs use their own save keys / a fresh profile.

## World intelligence and emergent story testing (§57 §9)

The world is tested as a living system, not as a static map.

### What the world simulations evaluate

* Population stability (do NPC counts stay in their caps? do they collapse?).
* Food production (do settlements produce enough? do they run out unexpectedly?).
* Resource availability (wood/stone/gold flows; do resources generate infinite economic loops?).
* Trade networks (do trade routes work? do they fail?).
* Settlement growth (does the town grow, shrink, or stagnate?).
* Faction relationships (do factions behave consistently?).
* Migration (do NPCs/travelers move as their schedules say?).
* Conflict (do creature incursions follow the 917 placement rules — town edge only?).
* NPC survival (do NPCs die unexpectedly? do they get permanently stuck?).
* Economic stability (does gold inflate? does a shop run dry?).
* World-event propagation (does a rumor/event spread as designed?).

### Detecting broken outcomes

Examples from §57 §9 (each is a test assertion, not a vague concern):

* Settlements running out of food unexpectedly.
* NPCs becoming permanently stuck (the 1030 pathfinding fix is the countermeasure — the head-on ping-pong was proven by trace: an 8-tick cycle to 60 ticks, no arrival; the detour flag fixed it, head-on pair arrives in 21–22 ticks).
* Trade routes failing.
* Populations collapsing without explanation.
* Factions behaving inconsistently.
* Resources generating infinite economic loops.

Use deterministic seeds so failures can be reproduced. A world-sim failure must be reproducible from its seed + its scenario, or it is not a usable report.

## The limit (the rule that matters most)

**Simulated success is NOT gameplay verification.** A simulated player completing a scenario does not prove the game is good, fun, or correct on a real phone. The phone probe (real taps, real viewport, real timing) and live verification (served markers) are separate gates (Level 3 — see `VERIFICATION_INTELLIGENCE.md`). The sim proves the pure functions; the asserts prove the entry behavior; the gameplay intelligence proves the scenarios run; the phone probe proves a human can play it. No layer substitutes for another.

Concretely: the 1030 asserts prove the pathfinding (97 entry + 47 runner checks, 0 replans on the test journeys). The gameplay intelligence would prove a simulated player can walk from the plaza to a hut without getting stuck. The phone probe proves a real tap behind a house arrives on the user's phone. All three are needed; none alone is sufficient.

## Current state

Neither system exists yet as an automated layer — this file is their specification. What exists: the sim (deterministic, pure-module), the asserts (entry behavior), the phone probe (real play, currently environment-blocked), the NPC-vs-monster combat (915–920, live-verified), the transient travelers/adventurers (1000), and the Stage 1 baseline (the world's measured state). What is missing: the simulated-player agents (no agent currently enters the game and plays it), the deterministic scenario suite, the long-duration world simulations, the automatic task generation from found issues, and the emergent-story test assertions. The first gameplay-intelligence task, once the phone probe works again, is a deterministic scenario suite for the 1030 pathfinding (the five assert journeys — hut detour, tree-line, water, standing-NPC, pacing-NPC — replayed as played scenarios in the game, not just as pure-function asserts).
