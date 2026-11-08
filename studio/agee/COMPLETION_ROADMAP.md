# Continuous Game Completion Roadmap

**Status:** DOCUMENTED ONLY (registry D7). No completion roadmap exists as a tracked artifact. This file is the roadmap + the honest state record.
**Directive:** SOUL.md §58 section 14 ("CREATE A CONTINUOUS GAME COMPLETION ROADMAP").

## The five stages (with measurable criteria)

Every system is scored on the same ladder. A stage is only claimed when **all** of its measurable criteria are met and evidenced (the gate-evidence rule, `MUSE_EVOLUTION.md` v1.1). A system does not advance because it feels ready.

### 1. Prototype

**It exists and runs, even if rough.**

Measurable criteria:
- The code exists and the game boots with it.
- It does something observable (even if only in a test scene or a single case).
- It does not crash the game.

### 2. Functioning

**It works end-to-end for its core case.**

Measurable criteria:
- The core case works start to finish (e.g. a quest can be accepted, progressed, and completed; a shop can sell something; a dungeon can be entered and exited).
- The happy path is proven by a test (sim assert or standalone assert, run directly).
- `tsc --noEmit` exits 0 with the system included.

### 3. Integrated

**It is wired into the rest of the game (not a standalone demo).**

Measurable criteria:
- It reads from and writes to the game's real state (not a mock, not a separate store).
- It interacts with at least one other system (e.g. a quest's reward changes the economy; an NPC's memory changes their behavior; a generated landmark appears on the minimap).
- It survives save/load (its state serializes and reloads exactly).
- The sim vs pristine baseline is IDENTICAL (0 FAIL) with the system included.

### 4. Polished

**It reads well, handles edge cases, and survives a real playtest.**

Measurable criteria:
- Edge cases are handled (what if the target dies, what if the player saves mid-quest, what if the giver moves — see `QUEST_ENGINE.md`).
- A real playtest (phone probe, 390×844, 0 page errors) exercises it without a softlock or a broken state.
- The visual presentation is consistent with the rest of the game (no placeholder art, no mismatched scale, no text overflow on a phone).

### 5. Release-ready

**It is verified live, with evidence, and a fresh player can rely on it.**

Measurable criteria:
- The build containing it is committed, pushed, and live-verified by content marker (served `version.json` build + note, served `?v=<BUILD>` index `__AG_BUILD`).
- The phone probe (390×844, the user's iPhone) has exercised it live, with 0 page errors.
- A fresh player (the casual play-style agent, `PLAYER_EXPERIENCE.md`) can use it without confusion.
- Its quality-gate record exists (name, status, timestamp, test/command, result, commit) for all four gates.

## Where the real systems are (honest, from the registry, 2026-11-07)

| System | Registry | Stage (honest) | Why |
|---|---|---|---|
| 3D rendering / world (ground, sky, houses, paths) | G1–G6 (various) | **Functioning** (some parts Polished) | It renders, it is live-verified (1029), the view distance and ground surface work. But the ground is FLAT (Stage 1), 91.6% uniform grass, ONE tree design — so the world is functioning, not polished. |
| Tap-to-walk pathfinding (1030) | Q1 (in progress) | **Functioning** (not Integrated) | Implemented + code-verified (tsc clean, 97+47 asserts pass, sim identical to pristine1029) — but NOT committed, NOT pushed, NOT live, NOT phone-probed. It cannot be Integrated or higher until it ships. |
| NPCs in 3D (47, schedules, A*) | G7 IMPLEMENTED BUT UNVERIFIED | **Functioning** | The roster, schedules, and movement exist and are live (993). But the NPC module has no dialogue, economy, needs, memories/relationships, combat, or quests — so it is not Integrated (it does not interact with those systems, because they do not exist in 3D). |
| Animals | G9 IMPLEMENTED BUT UNVERIFIED | **Functioning** | Caps, keep-outs, and behaviors exist (1013, 1016). Session-only. No persistence, no habitat depth. |
| Player combat | G10 PARTIALLY IMPLEMENTED | **Prototype** | Melee vs wolves/NPCs + lootable bodies exist. No bounty/crime, no XP, no ranged combat. It works for its core case but is not integrated with consequences. |
| Quests in 3D | G11 NOT IMPLEMENTED | **Not started** | No quest wiring in `engine3d/`. The 2.5D stack (`quests.ts`, 663 lines) is the extraction source. |
| Economy / shops in 3D | G12 NOT IMPLEMENTED | **Not started** | No shops, no trade. Gold's only source is looting dead NPCs (+5). The inn/store/smith are buildings only (mechanics explicitly deferred by the user). |
| Dungeons in 3D | G13 NOT IMPLEMENTED | **Not started** | No dungeon hits in `engine3d/`. The 2.5D Ember Vault + Stone Soup exist (2D only). |
| Skills / XP in 3D | G14 NOT IMPLEMENTED | **Not started** | No XP is awarded in 3D. Gathering gives resources only. No fishing. |
| AI adventurers in 3D | G15 PARTIALLY IMPLEMENTED | **Prototype** | Visual walkers exist (transients). The full sim (delves, loot, coins, persistence) is 2D-only. |
| Minimap in 3D | G17 NOT IMPLEMENTED | **Not started** | Zero minimap hits in `engine3d/`. The circular minimap is 2D-only (standing request since 2026-10-12). |
| Audio in 3D | G19 NOT IMPLEMENTED | **Not started** | Zero audio hits in `engine3d/`. `audio.ts` is 2D-only. |
| Ashfall Stages 2–6 | S3–S8 (queued) | **Not started** | Stage 1 (audit) is DONE. Stages 2–6 are queued after 1032. |
| AGEE (this engine) | D7 DOCUMENTED ONLY | **Not started** (specification) | These files are the design. No AGEE engine exists. |
| The §48.16 acceptance chain | §48.16 NOT IMPLEMENTED | **Not started** | No build has demonstrated the full chain (create a character → explore → meet adventurers → develop → dungeons → economy → save → return → world continued). |

**Summary:** most 3D systems are **prototype** or **functioning**. None of the RPG systems (quests, economy, dungeons, skills, audio, minimap) are past "not started" in 3D. The game is not release-ready as a complete RPG — and this roadmap says so plainly, because that is what a roadmap is for.

## How the roadmap is used

1. **AGEE reads it** to decide what the game needs most (see `AUTONOMOUS_LOOP.md`). The highest-value item is usually the lowest-stage system that blocks the acceptance chain — right now, that is landing 1030, then 1031, then 1032, then the RPG systems (quests, economy, dungeons, skills) in the order the registry's Stage E defines.
2. **A build moves a system up the ladder** — one stage at a time, with evidence. A build that claims to move a system from Prototype to Integrated must show the integration evidence (save/load survival, interaction with another system, sim IDENTICAL).
3. **The roadmap is updated after every verified build** — in the dashboard data (`studio/dashboard/dashboard-data.json`) and in the GAME EVOLUTION LAB (`GAME_EVOLUTION_LAB.md`). A stage change without evidence is not recorded.
4. **The roadmap is never used to hide a gap.** A system at "not started" stays at "not started" until the work is done. The roadmap's job is to show the truth, not to make the project look further along than it is.
