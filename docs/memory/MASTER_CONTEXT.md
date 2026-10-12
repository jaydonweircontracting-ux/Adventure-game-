# MASTER CONTEXT — Adventure Game Project

> Compact startup reference. Updated after each build.
> Last updated: 2026-10-12 (BUILD 579 in progress)

## What This Is
Open-world grid-based isometric/2.5D RPG. Persistent living world with NPCs,
wildlife, quests, procedural generation. Deploys via GitHub Pages.

- Repo: https://github.com/jaydonweircontracting-ux/Adventure-game-
- Live: https://jaydonweircontracting-ux.github.io/Adventure-game-/
- Branch: main | HEAD: c402f94 (BUILD 578)

## Non-Negotiable Rules
1. Preserve grid/chunks/coordinates/isometric renderer/collision/elevation.
2. No engine rewrite, no duplicate systems, no parallel architecture.
3. Smallest safe fix; never weaken tests to get green.
4. Never fabricate test results, commits, or gameplay verification.
5. Build marker proves deployment, NOT gameplay correctness.
6. No teleport-based verification; use real controls.
7. No wars/war-simulator direction.

## Current State
- Rat combat: damage works (12→3 HP verified BUILD 574).
- Rat quest: 5 kills + turn-in + save/load UNVERIFIED (test timing).
- Goats: spawn in table (BUILD 575), distinct visuals (BUILD 576).
- Goat discovery: 0/3 in 100-step walks (needs diagnosis).
- Brain: central-brain.mjs, autonomous-engine.mjs, genome.mjs, telemetry.mjs, sim-clock.mjs all exist.

## Known Blockers
1. **rat-quest-5-kills**: Test timing unreliable. Game combat works.
2. **goat-discovery-0-3**: 0/3 natural discovery. Root cause unknown.

## Next 3 Tasks
1. Diagnose goat discovery chain (spawn→render→encounter).
2. Make rat quest test use state-based waits.
3. Complete 5-kill quest + turn-in + save/load verification.

## Resume Commands
```bash
cd /home/hatch/workspace/adventure-game
git log --oneline -1
node scripts/autonomous-engine.mjs status
node scripts/central-brain.mjs tasks
```
