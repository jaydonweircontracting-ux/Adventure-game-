# World Population and Activity Director

**Status:** PARTIALLY IMPLEMENTED (the pieces exist; the director does not). This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 11 ("CREATE A WORLD POPULATION AND ACTIVITY DIRECTOR").

## What it is

The population director decides **who is in the world, where they are, and what they are doing** — NPCs, animals, monsters, and adventurers — and keeps them active within the rules. It is not a spawner that drops creatures at random. It is a director that maintains a living world: the right number of the right things, in the right places, doing the right things.

## What exists (the pieces, with their real numbers)

### Animals (1013, 1016) — G9 IMPLEMENTED BUT UNVERIFIED

| Creature | Cap | Behavior | Keep-out |
|---|---|---|---|
| Birds | 5 | Flush ≤5 tiles, Stardew-style (fly away when the player approaches) | Town keep-out 72 from plaza |
| Goats | 3 | Shy ≤2 tiles | Town keep-out 72 from plaza |
| Deer | 3 | Flee ≤6 tiles | Town keep-out 72 from plaza |
| Wolves | 2 | Attack (target the player only in 3D) | Town keep-out 72 from plaza |
| Chickens (1016) | 5 | Roam 64 from plaza, peck, wander, scuttle aside (Zelda-style) | Loose around town |

All animals are **session-only** (no save key; reload repopulates fresh — proven). Animals never take water (habitat check). Wild animals are kept out of town.

### NPCs (993) — G7 IMPLEMENTED BUT UNVERIFIED

47 NPCs (`ROSTER_3D`) with real 2.5D schedules — homes, beds, jobs, destinations. They leave homes, visit shops, work, socialize, travel, return home, sleep. Movement uses tile A* with a 900ms logical tick.

### Travelers / adventurers (1000) — G15 PARTIALLY IMPLEMENTED

`transients.ts` (455 lines): max 5 travellers + 3 adventurers (`MAX_TRANSIENTS=8`), spawn ticks 50/111, road-biased A*, edge-to-edge walks, bark lines (3s check, 25s global / 90s per-figure cooldowns), despawn at edges, **session-only**. They are visual walkers with names/classes and bark text — no inventories, dungeon delves, or economy. The full sim lives only in 2D: `simulatedAdventurers.ts` (785 lines: `advanceSimulatedAdventurers`, dungeon runs with 0.60/0.85 success/empty odds, coins 5–25, loot table, exodus march).

### Strays / NPC-vs-monster combat (915–920) — G8 NOT IMPLEMENTED in 3D

Strays: 1 live cap, wolf/slime/rat mix, spawn ≥114 units from plaza, chase never within 78 units of center. In 2.5D, creatures engage NPCs; guard witness radius 25; creature kills drop lootable bodies with no crime/bounty and no player XP/quest credit. In 3D, wolves target the player only.

## What is missing (the director itself)

1. **AI adventurers as a defining feature (§48.5).** The directive calls simulated players a defining feature: they spawn, explore, fight, gather, loot, upgrade, level, quest, trade, dungeon, return, form relationships, die, leave, and return later — with progress that persists. In 3D, only the visual walkers exist. The full sim (delves, loot, coins, exodus, persistence, relationships) is 2D-only. The director must bring the full sim into 3D — by extracting `simulatedAdventurers.ts`, not by writing a second adventurer system.
2. **Simulation levels (§48.5).** The directive defines four levels — **NEAR** (full simulation), **REGIONAL** (reduced simulation), **DISTANT** (abstract simulation), **INACTIVE** (statistical simulation). No simulation-level system exists in 3D. The director must assign a level to every NPC, animal, and adventurer based on distance from the player, and transition them cleanly when they become visible (the NPC rule: visible NPCs walk, turn, animate, navigate, enter doors, leave doors — they never appear to teleport unless teleportation is an intentional simulation operation).
3. **A unified population budget.** Animals, NPCs, transients, and strays each have their own caps, but there is no single budget for the world. The world buffer is already at 89% of the 300k vertex budget (Stage 1). The director must know the total cost of everything alive in the world and keep it within budget — not just per-species caps.
4. **Activity, not just presence.** The director must ensure the population is **doing** something, not just standing somewhere. An NPC with a schedule is active. A transient walking a road is active. An animal in its habitat is active. A creature standing still in an empty field is not active — it is decoration. The director measures activity (are NPCs reaching their destinations? are animals in their habitats? are adventurers completing walks?) and reports when activity drops.

## How the director works (the design, when it exists)

1. **Place by rule, not by random.** Every placement follows a rule: a habitat (animals), a home + schedule (NPCs), a road (travelers), a danger zone (monsters), a keep-out (town). A placement that violates a rule is rejected.
2. **Cap by budget, not by wish.** Caps come from the measured cost (vertices, sim ticks, save size), not from a round number. If the world buffer is at 89%, the director does not add more visible population until the buffer has room.
3. **Simulate by distance.** NEAR = full simulation (movement, A*, schedules, combat). REGIONAL = reduced (schedules and movement, abstracted combat). DISTANT = abstract (statistical — "this adventurer is on a dungeon run" without simulating each step). INACTIVE = statistical only. Transitions are clean — an NPC who becomes visible walks in through a door or along a road; they do not pop into existence.
4. **Keep the town alive.** The starting town must immediately communicate "this is a real place" (SOUL.md §23). NPCs leave homes, visit shops, work, socialize, travel, return home, sleep. Fake adventurers visibly leave the starting area within roughly one in-game hour when their schedules call for it. They enter the real town. They do not disappear into a scripted void.

## What the director does NOT do

- It does not spawn creatures inside the town keep-out (72 from plaza for animals; strays ≥114 from plaza, chase never within 78 of center).
- It does not exceed the caps. A cap is a cap — the director does not "temporarily" exceed it.
- It does not make NPCs teleport visibly. (The NPC rule — see above.)
- It does not duplicate the 2.5D adventurer sim. `simulatedAdventurers.ts` is the extraction source.
