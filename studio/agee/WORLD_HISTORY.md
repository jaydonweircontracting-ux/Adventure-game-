# World History and Legacy Engine

**Status:** DOCUMENTED ONLY (registry D7). No world history engine exists in 3D. The 2.5D history systems exist but are mostly in the Wave 3 CONTESTED cluster (complete but never wired in). This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 7 ("CREATE A WORLD HISTORY AND LEGACY ENGINE").

## What it is

The world history engine makes the world remember — permanently. It records what happened, keeps it, and lets it shape what happens later. The world should feel as though it existed before the player arrived, and it should be different because the player was there.

## What the world remembers (the directive's list)

Persistent records of:

- Wars.
- Leaders.
- Settlements.
- Faction changes.
- Major discoveries.
- Disasters.
- Important NPCs.
- Historical battles.
- Player achievements.
- Settlement destruction.
- Political changes.

And the consequences that follow from them:

- **NPCs reference relevant historical events.** An old NPC mentions the war. A guard mentions the bandits who were cleared from the road. A merchant mentions the year the harvest failed.
- **Ruins and abandoned settlements have believable origins.** A ruin is not a random pile of stones — it was a village, and something happened to it. The history engine supplies the origin; the content factory (`WORLD_CONTENT_FACTORY.md`) places the ruin to match.
- **The world feels as though it existed before the player arrived.** There is history before day 1. The player arrives in a world that already has a past.

## What exists (the pieces)

| Piece | Status | What it actually is |
|---|---|---|
| `ecoHistory.ts` | 2D-only, Wave 3 CONTESTED (legacy audit) | A history system that exists in the codebase but was never wired into the game. Complete, but no live consumer. Deleting it is a user product decision, not routine cleanup. |
| `worldEvents.ts`, `worldHistory.ts` | 2D-only, Wave 3 CONTESTED | Same status — complete but never wired in. |
| `ecosystem.ts`, `ecoSave.ts`, `ecoHistory.ts`, `ecoQuests.ts`, `migration.ts`, `populations.ts`, `resources.ts`, `foodWeb.ts` | 2D-only, Wave 3 CONTESTED (the ecosystem cluster) | The whole ecosystem cluster is complete but never wired in. It is the richest source of history-adjacent systems in the codebase — and also the most contested, because nothing in the shipped game uses it. |
| World events / history in 3D | NOT IMPLEMENTED (§48.10) | `ecoHistory.ts` exists; no verified event system in 3D. |
| 2.5D save / persistence | Exists (2D) | The 2.5D save system persists player, inventory, quests, world time, NPC state, relationships, and world events. The 3D save is separate (`ag-3d-*` keys + `iso-world-v2`). History must be stored in the save that the 3D game actually loads. |

## What is missing (the engine itself)

1. **A history log that the game actually writes to.** There is no running record of what happens in the 3D game. Nothing records that the player cleared a wolf den, that an NPC died, that a shop opened, or that a traveler arrived. The engine must write events as they happen — not reconstruct them later from a save file.
2. **Legacy effects.** A past event must change the present. A village that was attacked has fewer NPCs. A road that was cleared is safer. A hero who died is remembered. Without legacy effects, a history log is a diary, not an engine.
3. **NPC references to history.** NPCs cannot currently reference historical events because there is no dialogue system in 3D (`townsfolk3d.ts:1–60` — no dialogue) and no history for them to reference. Both gaps must close together.
4. **Pre-player history.** The world needs a past before day 1 — a seeded history (a war a generation ago, a ruined settlement, a famous adventurer) that the content factory can place ruins and landmarks to match. This is generated once, deterministically, from the world seed — not invented per session.
5. **A decision on the Wave 3 cluster.** The ecosystem/history systems (`ecoHistory.ts`, `worldEvents.ts`, `worldHistory.ts`, and the ecosystem cluster) are the natural extraction sources — but they are CONTESTED. The user must decide per cluster whether they are kept (and wired in) or removed. The history engine cannot be built on systems whose disposition is undecided. **This needs the user's call before the engine is implemented.**

## How history works (the design, when the pieces exist)

1. **Events are recorded as they happen.** Every significant event (a death, a discovery, a trade, a battle, a building placed, a quest completed) is appended to the history log with a timestamp (game time), a location, and the participants.
2. **History is summarized, not stored raw forever.** A log that grows without bound will bloat the save. Old events are summarized (a war becomes "the war of 1042" with its outcome) and the detail is dropped. The summary is what NPCs reference.
3. **Legacy effects are applied on load.** When the world loads, the history is read and its effects are applied — a settlement's population, a road's safety, a ruin's presence, an NPC's memory. The world the player returns to is the world they left, plus the time that passed.
4. **The player is part of history.** The player's achievements are recorded the same way as any other event. An NPC can later say "you're the one who cleared the wolves from the north road" — because it happened, and the history engine recorded it.

## What the engine does NOT do

- It does not invent a history for events that never happened. Every history entry traces to a real event in the game (or to the seeded pre-player history, which is generated once from the world seed and recorded as such).
- It does not store an unbounded log. Summarization is part of the engine, not an afterthought.
- It does not decide the Wave 3 cluster's fate. That is the user's product decision. This file records the dependency and waits for the call.
