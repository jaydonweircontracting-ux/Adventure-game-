# Intelligent Game Balancing Engine

**Status:** DOCUMENTED ONLY (registry D7). No balancing engine exists. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 9 ("BUILD AN INTELLIGENT GAME BALANCING ENGINE").

## What it is

The balancing engine keeps difficulty, rewards, economy, and progression fair and interesting — not by making the game easier or harder on a slider, but by measuring what is actually happening in the game and adjusting the numbers that are out of line.

## The rule that governs balancing

**No traditional RPG level scaling. Natural danger zones instead.**

This is a standing directive (2026-10-08, and SOUL.md §48). The world has places that are dangerous because of what lives there and what the terrain is — not because the player leveled up and the world leveled with them. A wolf den near town is dangerous to a new player and trivial to a strong one, and that is correct. The balancing engine must never introduce level scaling (enemies that grow stronger as the player grows stronger). If a balancing proposal requires level scaling, it is rejected.

## What is balanced (and the honest current state of each)

| Area | Current state | What "balanced" means here |
|---|---|---|
| **Difficulty (combat)** | Player combat in 3D is PARTIALLY IMPLEMENTED (G10): melee vs wolves/NPCs + lootable bodies exist; no bounty/crime, no XP, no ranged combat. Wolves target the player only (G8 NOT IMPLEMENTED). | Difficulty comes from where the player goes (danger zones) and what they fight — not from a scaling formula. The engine measures: how often does the player die to wolves? How often do NPCs die to wolves? Is the town edge safe (the 917 placement rules: raids stay at the town edge; strays spawn ≥114 units from plaza, chase never within 78 units of center)? |
| **Rewards** | Gold's only source in 3D is looting a dead NPC (+5). Gathering gives +2 wood (tree), +1 stone (rock), +1 wood (crate). No XP is awarded (G14 NOT IMPLEMENTED). Wood has NO sink (the Build palette is free). | A reward must be worth the effort and must have a use. Wood with no sink is not a reward — it is a counter that grows. The engine flags rewards that have no sink, and sinks that have no source. |
| **Economy** | NOT IMPLEMENTED in 3D (G12). No shops, no trade, no prices. | There is nothing to balance yet. The engine records the absence and does not invent prices for a shop that does not exist. When the economy is ordered, the engine balances prices against supply/demand (see `LIVING_ECONOMY.md`). |
| **Progression** | NOT IMPLEMENTED in 3D (G14). No skills, no XP, no levels in 3D. | There is no progression to balance. The engine records the absence. When skills land, the engine balances the XP curve (`skills.ts`: RuneScape-style `xpForLevel`/`levelForXp`, `WOODCUTTING_XP_PER_TREE=25`, `SKILL_MASTERS` 1.5× bonus — 2D only, extraction source) against the actual rate at which a player gathers. |
| **Population / spawns** | Animals exist with caps (G9 IMPLEMENTED BUT UNVERIFIED). See `POPULATION_DIRECTOR.md`. | Spawn rates, caps, and keep-out zones are the balancing levers. If wolves overrun the town edge, the cap or the keep-out is wrong — the engine measures it and says so. |
| **Performance** | Stage 1 baseline measured (237k verts town / 266k wild, 89% of the 300k budget; rebuild ~165–211ms; live hitch 566.6ms on a 50-tile teleport). | Performance is part of gameplay (SOUL.md §13). A beautiful game that runs badly is not finished. The engine does not "balance" performance by destroying simulation depth — it uses simulation tiers, chunk streaming, caching, and LOD. |

## How the engine works (the design)

1. **Measure first.** The engine reads the actual game state — the registry, the Stage 1 baseline, the sim results, the player-experience agent reports (`PLAYER_EXPERIENCE.md`). It does not guess. A balancing change without a measurement is not made.
2. **Propose a change with a reason.** "Wolves kill the player in 3 hits at the town edge; the keep-out is 72 from the plaza but strays chase to 78 from center. Propose: move the stray chase limit outward, or reduce wolf damage at the edge." The proposal names the measurement, the rule it would change, and the expected effect.
3. **Test the change.** The change is implemented as a build, tested by the sim (vs pristine baseline), by standalone asserts, and by the phone probe. A balancing change that is not tested is not shipped.
4. **Measure again.** After the change lands, the engine re-measures. If the measurement did not improve, the change is reverted. (The §53 self-improvement loop: keep only what demonstrably improves results, else revert.)

## What the engine does NOT do

- **It does not introduce level scaling.** (The hard rule above.)
- **It does not balance a system that does not exist.** No economy, no progression, no quests in 3D — the engine records those absences and waits. It does not invent numbers for them.
- **It does not award XP for clicks or menu opens.** (Honesty rule. XP only from real successful actions.)
- **It does not make the game easier by removing challenge.** Difficulty is part of the game. The engine removes *unfair* difficulty (an enemy that cannot be avoided, a quest that cannot be finished, a reward that cannot be used) — not difficulty itself.
