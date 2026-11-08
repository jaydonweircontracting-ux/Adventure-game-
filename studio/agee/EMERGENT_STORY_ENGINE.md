# Emergent Story Engine

**Status:** DOCUMENTED ONLY (registry D7). No emergent story engine exists. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 3 ("CREATE AN EMERGENT STORY ENGINE").

## What it is

The emergent story engine lets stories **arise** from the world instead of being scripted. A story is not a cutscene the player watches; it is a situation the player discovers — an NPC who lost their job and cannot afford food, a merchant whose prices rose because a road is unsafe, a village that remembers the player helped it. The player should discover stories. They should not always be told exactly what to do.

## The loop (the standing directive)

The engine runs on the loop from the standing Advanced World Reactivity directive:

```
Actions → Memory → Information → Relationships → Consequences → New Encounters → New Actions
```

- **Actions:** the player (or an NPC, or a creature) does something — helps, harms, trades, steals, kills, saves, ignores.
- **Memory:** the witnesses and the affected remember it (see `NPC_PERSONALITY_MEMORY.md`).
- **Information:** memory spreads — as rumor, as gossip, as a warning (see below).
- **Relationships:** what an NPC thinks of the player (and of other NPCs) changes.
- **Consequences:** prices change, doors close, guards watch, friends help, enemies hunt.
- **New Encounters:** the changed world produces new situations the player runs into.
- **New Actions:** the player acts again, and the loop continues.

The world must remember. A story is never an isolated scripted event.

## What exists (the pieces the engine can build on)

| Piece | Status | What it actually does |
|---|---|---|
| NPC schedules (993) | IMPLEMENTED BUT UNVERIFIED (G7) | All 47 Mosslight NPCs in 3D with real 2.5D schedules — homes, beds, jobs, destinations. They leave homes, visit shops, work, socialize, travel, return home, sleep. |
| NPC barks (1000) | IMPLEMENTED BUT UNVERIFIED | Transients greet the player (barks via the message area, throttled: 25s global, 90s per NPC, 4-tile range). Text only — no dialogue system. |
| Travelers / adventurers (1000) | PARTIALLY IMPLEMENTED (G15) | Transients walk the roads (max 5 travellers + 3 adventurers, session-only). They are visual walkers with names/classes and bark text — no inventories, dungeon delves, or economy. |
| NPC-vs-monster combat (915–920) | NOT IMPLEMENTED in 3D (G8) | The 2.5D rules exist (creatures engage NPCs; guard witness radius 25; creature kills drop lootable bodies with no crime/bounty and no player XP/quest credit). In 3D, wolves target the player only. |
| Crime / bounty / witness (2.5D) | 2D-only (`bounty.ts`, `crime.ts`) | The witness system, bounty, and wanted state exist in 2.5D. Zero bounty/crime hits in `engine3d/`. |
| NPC needs / memories / relationships (2.5D) | 2D-only (`villageLife.ts`, `townsfolk.ts`, `conversationMemory.ts`) | The full 2.5D NPC simulation has needs, memories, and relationships. In 3D, the NPC module explicitly has **no** needs, memories/relationships, economy, dialogue, combat, or quests (`townsfolk3d.ts:1–60`). |
| World events / history (2.5D) | Mostly Wave 3 CONTESTED (legacy audit) | `ecoHistory.ts`, `worldEvents.ts`, `worldHistory.ts` exist but are complete-but-never-wired-in. No verified event system in 3D (§48.10). |

## What is missing (the engine itself)

1. **Memory propagation.** Nothing in 3D spreads information. An NPC who sees the player do something does not tell anyone. There is no rumor system, no gossip, no "the town heard about it." The 2.5D `villageLife.ts` memory model is the extraction source — it must be ported into 3D before the story engine can run.
2. **Rumor spreading.** No mechanism by which a memory becomes common knowledge. Rumors need a carrier (an NPC who travels, a merchant, a traveler), a decay (rumors fade unless reinforced), and a distortion (a rumor retold is not the same as the event).
3. **Consequence tracking.** No record of what the player has done that the world can consult. There is no "the player helped this village" flag, no "the player is wanted here" state, no "this NPC owes the player" ledger in 3D. The 2.5D crime/bounty system (`bounty.ts`, `crime.ts`) and the standing rule that bounty and faction standing are separate buckets (never copied into each other) are the extraction sources.
4. **Story detection.** No system that notices a situation has become a story (an NPC in trouble, a feud, a shortage, a threat) and surfaces it to the player as something to discover — not as a quest marker, but as a visible situation (an NPC standing outside a closed shop, a guard posted on a road, a price board changed).
5. **Emergent quest hooks.** The story engine must feed the quest engine (see `QUEST_ENGINE.md`) — a situation it detects can become a quest the player can accept. But the quest engine itself is NOT IMPLEMENTED in 3D (G11), so this hook has nothing to plug into yet.

## How a story works (the design, when the pieces exist)

1. **A situation forms.** An NPC loses a job, a creature den appears near a road, a merchant's supply is cut, a traveler arrives with news. The situation is a real world state, not a script flag.
2. **The world reacts.** NPCs change their routines (the jobless NPC shops differently; the guard patrols the road; the merchant raises prices). These are schedule and economy changes, visible to the player.
3. **Information spreads.** Witnesses tell others. A rumor reaches the player through a bark, a price, or a closed door — never through a popup that says "a story happened."
4. **The player encounters it.** The player walks into the situation and can act — help, ignore, exploit, or worsen it.
5. **The world remembers the player's action.** The loop continues (see the loop above).

## What the engine does NOT do

- It does not script cutscenes or force the player down a path. The player discovers stories; they are not told exactly what to do.
- It does not invent a memory for an NPC who has no memory system. Until the NPC memory engine exists (`NPC_PERSONALITY_MEMORY.md`), the story engine has no memory to work with — it is DOCUMENTED ONLY, and this file says so.
- It does not turn the world into constant war. The standing directive is explicit: this is a living fantasy adventure world (exploration, towns, NPC life, quests, travel, commerce, monsters, dungeons, secrets, history, relationships, adventure) — not an endless war simulator.
