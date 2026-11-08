# Quest Generation and Validation Engine

**Status:** NOT IMPLEMENTED in 3D (registry G11). The 2.5D quest stack exists and is the extraction source. No quest-generation or quest-validation engine exists. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 4 ("BUILD A QUEST GENERATION AND VALIDATION ENGINE").

## What it is

Two engines, working together:

1. **Quest generation** — creates quests from the world's actual state (an NPC's need, a creature threat, a missing item, a place that needs reaching). A generated quest is about something that really exists in the world.
2. **Quest validation** — proves, before the quest is ever offered, that it **can be completed**. A quest must never be impossible to finish.

A quest is not complete because dialogue says "quest accepted." The world state must actually change (SOUL.md §8 — no fake features).

## The current state (honest)

| Piece | Status | Evidence |
|---|---|---|
| Quests in 3D | NOT IMPLEMENTED (G11) | `grep quest` over `engine3d/` returns only comments stating "no quests" (`townsfolk3d.ts:5`, `wildTerrain.ts:41`, `animals.ts:19`). Zero quest wiring in the 3D view. |
| 2.5D quest stack | Exists, 2D-only, B-class reusable logic (legacy audit) | `src/game/quests.ts` (663 lines): `QUESTS`, `questById`, `startQuest`, `advanceQuestStage`, `questRewards`, `serializeQuestSave` / `parseQuestSave`, story quest `ashes-of-aldoria`. This is the extraction source — it must be extracted into a shared module and wired into 3D before any quest engine can run. |
| Quest giver / tracker / UI | NOT IMPLEMENTED in 3D | No quest giver, no tracker, no quest markers in the 3D view. The registry's completion criterion for G11 is: "At least one quest giver, tracker, and completable objective reachable in 3D." That has not been met. |
| NPC dialogue (needed for quests) | NOT IMPLEMENTED in 3D | The 3D NPC module explicitly has no dialogue (`townsfolk3d.ts:1–60`). A quest giver needs dialogue. |
| Quest save/load | 2D-only | `serializeQuestSave` / `parseQuestSave` exist in `quests.ts` (2D). No 3D quest save exists. |

## How quests are generated (the design)

1. **From the world, not from a list.** A quest is generated when a real situation exists: an NPC needs something (see `NPC_PERSONALITY_MEMORY.md`), a creature threatens a road (see `POPULATION_DIRECTOR.md`), a place needs exploring (see `WORLD_CONTENT_FACTORY.md`), or a story has formed (see `EMERGENT_STORY_ENGINE.md`). The generator reads the world state and proposes a quest that fits it.
2. **From templates, not from nothing.** Quest templates (fetch, escort, clear, deliver, discover, protect) are data, not hardcoded special cases. A template is filled with real entities — a real NPC, a real location, a real item — never a placeholder.
3. **One quest at a time per giver.** A quest giver offers one quest at a time. A new quest is generated only when the previous one is resolved (completed, failed, or abandoned) — so the world never accumulates a pile of stale, half-generated quests.
4. **Rewards are real.** A quest reward is gold, an item, a relationship change, or a world change — all things that exist in the game. A reward is never XP for a click or a menu open (honesty rule). A reward is never an item that does not exist.

## How quests are validated (the rule that matters most)

**A quest must never be impossible to finish.** Before a quest is offered, the validation engine proves all of these:

1. **The giver exists and is reachable.** The NPC is in the world, has a home and a schedule, and the player can walk to them (the 1030 player A* can plan a path to the giver's tile).
2. **The objective exists and is reachable.** The target (a creature, an item, a location) is in the world and the player can reach it. A quest whose target is inside a sealed pocket, behind an impassable wall, or in a place with no path is rejected — never offered.
3. **The objective is achievable.** The target can actually be completed by the player — the creature can be fought (combat exists in 3D, G10 PARTIALLY IMPLEMENTED), the item can be obtained (gathering exists: E on a tree +2 wood, on a rock +1 stone, on a crate +1 wood), the location can be entered (the door works; the standing door rule holds).
4. **The quest cannot softlock.** The validation engine checks the failure modes: what if the target dies unexpectedly, what if the player saves mid-quest, what if the giver moves, what if the quest item is consumed. A quest that can softlock is rejected.
5. **The reward can be delivered.** The reward (gold, item, relationship change) is something the game can actually grant. A reward of an item that does not exist, or of XP for a system that is not implemented, is rejected.
6. **The quest survives save/load.** The quest state (accepted, in progress, stage, completed) is serialized through the save path and reloads exactly. A quest that does not survive a reload is not offered.

Validation is done by the Verification Engine (sim + asserts), not by the generator asserting its own output is valid. A generated quest that fails any check is logged with the reason and discarded — never offered to the player.

## What the engine does NOT do

- It does not generate a quest for a system that does not exist (no fishing quests — there is no fishing; no crafting quests — there is no crafting; no dungeon quests — dungeons are NOT IMPLEMENTED in 3D, G13).
- It does not offer a quest the player cannot finish. This is the hard rule. If the validation engine cannot prove a quest is completable, the quest does not exist.
- It does not award XP for accepting a quest, opening a quest menu, or clicking a quest marker. XP comes only from real successful actions (registry T1).
