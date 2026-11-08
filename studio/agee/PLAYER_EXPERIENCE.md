# Player Experience Intelligence Engine

**Status:** DOCUMENTED ONLY (registry D7). No player-experience intelligence engine exists. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 8 ("CREATE THE PLAYER EXPERIENCE INTELLIGENCE ENGINE").

## What it is

The player experience intelligence engine evaluates the **actual player experience** — how the game feels to play — through controlled testing. It finds frustration, confusion, exploits, and missing gameplay opportunities, and turns them into improvement tasks.

It is **not** surveillance. It monitors gameplay quality through controlled testing, **not** invasive collection of personal information. It does not collect who the player is, where they are, or what they do outside the game. It tests the game.

## What it evaluates

The directive's list, each of which is a real, testable quality of the game:

- Tutorial clarity. (The player starts inside the tutorial house interior — can they find the door?)
- Movement responsiveness. (Does tap-to-walk arrive? Does the D-pad steer? Does sprint actually sprint — the 1026 fix?)
- Combat feel. (Melee vs wolves/NPCs exists in 3D, G10 PARTIALLY IMPLEMENTED — but no bounty/crime, no XP, no ranged combat.)
- Exploration. (Is there something to find? The wilderness is empty by design — Stage 1. Is that a problem, or is it the point?)
- Progression. (There is no progression system in 3D — G14 NOT IMPLEMENTED. The engine must say so, not pretend otherwise.)
- Difficulty. (Natural danger zones, not level scaling — see `BALANCING_ENGINE.md`.)
- Reward pacing. (Gold's only source in 3D is looting dead NPCs, +5 each. Is that a reward loop, or a gap?)
- Quest clarity. (There are no quests in 3D — G11 NOT IMPLEMENTED. The engine must report the absence, not evaluate a quest UI that does not exist.)
- Inventory usability. (Wood/Stone/Gold in the HUD strip. Is it readable? Is it enough?)
- Interface consistency. (Build menus, Options, Hide UI, the sprint ⚡ icon next to Gold — 1017/1028.)
- Loading. (Does the world load? Does a save reload exactly?)
- Performance. (Stage 1 baseline: world buffer 237k verts town / 266k wild, 89% of the 300k budget; rebuild ~165–211ms; live hitch 566.6ms on a 50-tile teleport; harness FPS town 6.79 SwiftShader — a relative baseline only.)
- Accessibility. (Can the game be played by touch alone? Are the controls reachable?)

## The play-style agents

Automated player-testing agents, each with a different play style, test the game and report what they find. Each agent is a **test harness**, not a person — it plays the game through the same inputs a player uses (tap, D-pad, Build menu, E-key) and records where it gets stuck, confused, or bored.

| Agent | What it tests | What it would find (examples, from the real current state) |
|---|---|---|
| **Explorer** | Walks everywhere, enters buildings, crosses chunk boundaries, goes to the map edge. | The 200×200 wall is gone (1024) — can it walk to x=214? The ocean blocks at x 6–18 (1027) — does it report "That destination is blocked" correctly? Are there dead areas with nothing to find? |
| **Fighter** | Fights wolves, fights NPCs, tests combat feel, tests death and respawn. | Melee exists (G10 PARTIALLY IMPLEMENTED) but there is no XP, no bounty/crime, no ranged combat. Does the fighter get stuck with nothing to progress toward? |
| **Merchant** | Tries to trade, sell, buy, earn gold. | There are no shops in 3D (G12 NOT IMPLEMENTED). The only gold source is looting dead NPCs (+5). The merchant agent's finding is: **there is no merchant gameplay**. That is a real finding, not a failure of the agent. |
| **Collector** | Gathers wood/stone, places buildings, uses the Build menu, saves/loads chunks. | Gathering works (E on tree +2 wood, rock +1 stone, crate +1 wood) but wood has NO sink (the Build palette is free). Chunks save/load (1029). Does the collector run out of things to collect? |
| **Quest-focused adventurer** | Looks for quests, talks to NPCs, follows objectives. | There are no quests in 3D (G11 NOT IMPLEMENTED) and no dialogue. The quest-focused agent's finding is: **there is no quest gameplay**. That is the finding. |
| **Casual player** | Plays briefly, taps around, opens menus, tries the obvious things. | Is the first 10 minutes clear? Does the player understand how to move, where they are, what they can interact with? (SOUL.md §36 — game feel.) |
| **Experienced player** | Plays efficiently, looks for exploits, shortcuts, and optimal routes. | Can they break the economy (there is none)? Can they get somewhere they should not be (walk through a house wall — 1032, queued)? Can they duplicate items? |

## How results feed back

1. **Each agent produces a report** — what it did, where it got stuck, what confused it, what was missing, what felt good. The report is evidence (a reproducible sequence of inputs and observations), not an opinion.
2. **Findings become improvement tasks** — entered into the same backlog the orchestrator owns (`studio/orchestrator/`). A finding that "there is no merchant gameplay" becomes a task (G12) with its registry status, not a vague complaint.
3. **Findings feed balancing** — difficulty, reward pacing, and progression findings go to the balancing engine (`BALANCING_ENGINE.md`).
4. **Findings feed content** — missing-content findings go to the world content factory (`WORLD_CONTENT_FACTORY.md`).

## What the engine does NOT do

- **It does not collect personal information.** No identity, no location, no behavior outside the game. The agents are test harnesses running the game, not trackers watching a person.
- **It does not declare a feature complete because it compiles.** A feature is complete when the agents (and the phone probe) can actually use it. (SOUL.md §42 — a game can have zero console errors and still be bad.)
- **It does not invent gameplay to test.** If a system does not exist (quests, shops, skills in 3D), the agent reports the absence. It does not pretend to test a system that is not there.
- **It does not replace the phone probe.** The agents run in the harness; the real phone probe (390×844, the user's iPhone) is the final verification. The agents find problems early; the phone proves them fixed.
