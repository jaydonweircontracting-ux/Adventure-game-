# Deep NPC Personality and Memory Engine

**Status:** PARTIALLY IMPLEMENTED in the narrow sense (G7: 47 NPCs with schedules and movement in 3D). The personality + memory engine itself is **NOT IMPLEMENTED in 3D**. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 5 ("BUILD A DEEP NPC PERSONALITY AND MEMORY ENGINE").

## What it is

An NPC is not a schedule with a sprite. An NPC is a person with a personality (traits that shape how they act), a memory (what they remember about the player and about other NPCs), and relationships (what they think of the people around them) — and all three must **affect their behavior**. A personality trait that never changes what an NPC does is decoration, not a system.

## What exists (the pieces)

| Piece | Status | What it actually does |
|---|---|---|
| NPC roster + schedules in 3D (993) | IMPLEMENTED BUT UNVERIFIED (G7) | 47 NPCs (`ROSTER_3D`: 13 original + 25 BUILD 699 + 4 teachers BUILD 958 + 5 children BUILD 979 — Tansy, Milo, Nia, Joss, Tove). `scheduleTileFor()` reuses the real 2D schedule. They leave homes, visit shops, work, socialize, travel, return home, sleep. Movement uses tile A* (`planPathNpc`, Manhattan, max 4000 nodes) with a 900ms logical tick and render glide (`npcMotion.ts`). |
| NPC figures (1019) | IMPLEMENTED BUT UNVERIFIED | Procedural blocky Minecraft-style figures (`villagers.ts`): children 0.7×, `NPC_SPEED=1/0.9` tiles/s. Player emerald + gold-band hat. |
| NPC needs / memories / relationships (2.5D) | 2D-only, B-class reusable logic | `villageLife.ts` (NPC needs, memories, relationships), `townsfolk.ts` (NPC roster, targets, schedules), `conversationMemory.ts` (what NPCs remember from conversations). These are the extraction sources. |
| NPC barks (1000) | IMPLEMENTED BUT UNVERIFIED | Transients greet the player (text barks, throttled 25s global / 90s per NPC, 4-tile range). Text only — no dialogue system. |
| NPC-vs-monster combat (2.5D) | 2D-only (G8 NOT IMPLEMENTED in 3D) | 915–920 rules exist in 2.5D. In 3D, wolves target the player only. |

## What is missing in 3D (the engine itself)

The 3D NPC module states its limits explicitly (`townsfolk3d.ts:1–60`): **no dialogue, no economy, no needs, no memories/relationships, no combat, no quests** in the 3D NPC module. Indoors phases render as standing at the home doorstep (NPCs never enter houses). No bank point (Brand stays at his stall). That is the honest starting point. The personality + memory engine must close each of those gaps — in order, by extraction from the 2.5D systems, not by writing a second NPC system.

### 1. Personality traits

Traits are data, not hardcoded special cases. Each NPC has traits (e.g. brave, cautious, generous, greedy, curious, homebound) that shape decisions:

- A **brave** NPC fights back when attacked (the 2.5D fight-back rules: 900ms retaliation cooldown, fight chase 5.9 u/s, A* pursuit repath at most every 1500ms, 3 spaced failures return to schedule — builds 918–919).
- A **cautious** NPC flees from a creature and warns others (memory propagation — see `EMERGENT_STORY_ENGINE.md`).
- A **generous** NPC gives a discount or a gift when they like the player; a **greedy** one charges more.
- A **curious** NPC travels and explores; a **homebound** one rarely leaves their house.

Traits must be visible in behavior, not just in a data file. A trait that never changes a decision is not implemented.

### 2. Memory

An NPC remembers:

- **What the player did to them.** Helped, harmed, traded, stole from, saved, ignored. Each memory has a strength (how important it was) and a decay (memories fade unless reinforced).
- **What the player did that they witnessed.** A guard who saw the player attack someone remembers it — even if the player did not attack the guard. (Witness radius 25 in the 2.5D rules.)
- **What other NPCs told them.** Memory propagates (see `EMERGENT_STORY_ENGINE.md`). A rumor an NPC heard is a memory, marked as second-hand — it is not as strong as something they saw themselves, and it can be wrong.
- **What happened in the world.** A disaster, a discovery, a death — the NPC's memory of world events comes from `WORLD_HISTORY.md`.

Memory is stored per NPC and survives save/load. The 2.5D `villageLife.ts` + `conversationMemory.ts` are the extraction sources. Memory must be **bounded** — an NPC does not remember everything forever. Old, weak memories decay and are dropped, or the save grows without bound.

### 3. Relationships

Relationships are the running total of memory between two people:

- **Player ↔ NPC.** Built from the player's actions toward that NPC and what the NPC has heard about the player. It gates what the NPC will do: trade, help, warn, refuse, attack, or flee.
- **NPC ↔ NPC.** NPCs have relationships with each other (family, friends, rivals, employer/employee). These shape who they talk to, who they help, and who they avoid. The 2.5D `townsfolk.ts` relationship model is the extraction source.
- **Bounty and faction standing are separate buckets** (standing rule from builds 926/939 — never copied into each other). A relationship change is not a bounty change, and a bounty is not a relationship. The memory engine must keep them apart.

Relationships change behavior: a friend gives a better price, a rival refuses to trade, a family member warns the player about a danger. If a relationship number exists but never changes what an NPC does, it is display-only — and display-only values are not a system (standing rule: tiers/charm points are display-only unless a build explicitly ships an effect).

### 4. How memory affects behavior (the test)

The engine is working when all of these are true and observable in a playtest:

- An NPC who the player helped treats the player differently from an NPC who the player harmed.
- An NPC who witnessed a crime reacts to the player (warns, flees, or reports — per their traits).
- An NPC's routine changes because of what they remember (they avoid a road where they were attacked; they visit a shop whose keeper they like).
- A rumor the player starts (or stops) changes what other NPCs say and do.
- All of the above survives a save/load.

## What the engine does NOT do

- It does not give an NPC a memory of something that never happened. Memories come from real events in the game.
- It does not store an unbounded history. Memories decay; weak ones are dropped.
- It does not duplicate the 2.5D NPC sim. The 2.5D `villageLife.ts` / `townsfolk.ts` / `conversationMemory.ts` are the extraction sources — the engine ports them into 3D, it does not write a second sim beside them.
- It does not make every NPC a main character. The §53 six-layer NPC intelligence model applies: deterministic needs/schedules for everyone, utility decisions, goal planning, memory/relationships, contextual intelligence for important characters, emergent social behavior — with expensive reasoning only for important characters.
