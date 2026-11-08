# AGEE — ASHFALL Game Evolution & Content Creation Engine

**Status:** Specification + design record (v1.0, 2026-11-07). AGEE as a running engine does **NOT** exist yet — the registry (D7) records it as DOCUMENTED ONLY (directive text in SOUL.md §58, lines 7067–7584). These files are the design and the honest state record. They do not claim a system exists that does not.
**Directive:** SOUL.md §58 ("ASHFALL — AUTONOMOUS GAME EVOLUTION & CONTENT CREATION ENGINE").
**Canonical home:** `studio/agee/` in the Adventure Game repo. (Created as repo files; they cannot be committed yet — git cannot write in this environment, EPERM. Commit when git can write.)

## What AGEE is

AGEE is the third major evolution layer of ASHFALL. The previous directives establish the autonomous development engine, the code evolution machine, project intelligence, multi-agent architecture, independent verification, and self-optimization. AGEE makes those capabilities produce an extraordinary **actual game**.

It is a central subsystem that evaluates and improves the actual playable game. It understands the current world, the available gameplay, the missing content, the existing mechanics, NPC behavior, world history, and the player's experience.

It is **not** simply a procedural content generator. It is an interconnected game evolution system.

## The decision → implementation → verification chain

```
AGEE decides what the game needs
  → the Code Evolution Engine implements it
    → the Verification Engine proves it
```

- **AGEE decides** — from the implementation registry, the master health score, player-experience results, and the completion roadmap. It names the highest-value missing or weak piece of the *playable game*.
- **The Code Evolution Engine implements** — it generates, organizes, and optimizes the code (the ACEE subsystem, `studio/acee/`).
- **The Verification Engine proves it** — the four quality gates (IMPLEMENTED → INTEGRATED → VERIFIED → POLISHED) plus the sim suite, standalone asserts, and the phone probe. Nothing is "done" because it compiles.

## The four connected capabilities (not four competing systems)

The intended ecosystem is FOUR capabilities, CONNECTED:

1. **Autonomous Development** — decides what needs building (the orchestrator, `studio/orchestrator/`; the backlog, the queue, the 10-minute cycle).
2. **Code Evolution Engine** — generates, organizes, and optimizes code (ACEE, `studio/acee/`).
3. **Development Intelligence** — verifies, learns, and improves the engineering process (the registry, the dashboard data, the quality gates, the verification pipeline).
4. **Game Evolution Engine (AGEE, this directory)** — creates and improves the actual RPG experience.

They share one backlog, one registry, and one set of quality gates. AGEE does **not** create its own competing task manager — it uses the existing orchestrator. A game-improvement task AGEE proposes enters the same queue as any other build, in priority order, and is implemented by the same code pipeline.

## The 15 subsystems (one file each)

| # | File | Subsystem | Registry status (2026-11-07) |
|---|---|---|---|
| 1 | `README.md` (this file) | AGEE overview | D7 DOCUMENTED ONLY |
| 2 | `WORLD_CONTENT_FACTORY.md` | World content factory | D7 DOCUMENTED ONLY |
| 3 | `EMERGENT_STORY_ENGINE.md` | Emergent story engine | D7 DOCUMENTED ONLY |
| 4 | `QUEST_ENGINE.md` | Quest generation + validation | G11 NOT IMPLEMENTED |
| 5 | `NPC_PERSONALITY_MEMORY.md` | Deep NPC personality + memory | G7 IMPLEMENTED BUT UNVERIFIED (schedules only; no memory/relationships in 3D) |
| 6 | `LIVING_ECONOMY.md` | Living economy + trade network | G12 NOT IMPLEMENTED |
| 7 | `WORLD_HISTORY.md` | World history + legacy engine | D7 DOCUMENTED ONLY (2.5D history systems exist, mostly Wave 3 CONTESTED) |
| 8 | `PLAYER_EXPERIENCE.md` | Player experience intelligence | D7 DOCUMENTED ONLY |
| 9 | `BALANCING_ENGINE.md` | Intelligent game balancing | D7 DOCUMENTED ONLY |
| 10 | `ASSET_PIPELINE.md` | Asset + visual content pipeline | D7 DOCUMENTED ONLY |
| 11 | `POPULATION_DIRECTOR.md` | World population + activity director | G9/G15 PARTIALLY IMPLEMENTED (animals + transients exist; full adventurer sim is 2D-only) |
| 12 | `CONTENT_QC.md` | Content quality control | D7 DOCUMENTED ONLY |
| 13 | `GAME_EVOLUTION_LAB.md` | GAME EVOLUTION LAB dashboard section | D7 DOCUMENTED ONLY (no such section exists in the dashboard data) |
| 14 | `COMPLETION_ROADMAP.md` | Continuous game completion roadmap | D7 DOCUMENTED ONLY |
| 15 | `AUTONOMOUS_LOOP.md` | Autonomous game evolution loop | D7 DOCUMENTED ONLY |

## The completion roadmap (five stages, measurable criteria)

Every system AGEE touches is scored on the same five-stage ladder, with measurable criteria per stage (see `COMPLETION_ROADMAP.md`):

1. **Prototype** — it exists and runs, even if rough.
2. **Functioning** — it works end-to-end for its core case.
3. **Integrated** — it is wired into the rest of the game (not a standalone demo).
4. **Polished** — it reads well, handles edge cases, and survives a real playtest.
5. **Release-ready** — it is verified live, with evidence, and a fresh player can rely on it.

Honest current state (from the registry, 2026-11-07): most 3D systems are **prototype** or **functioning**, not release-ready. Quests, economy, dungeons, skills/XP, audio, and the minimap in 3D are NOT IMPLEMENTED. The §48.16 acceptance chain (create a character → explore → meet adventurers → develop → dungeons → economy → save → return → world continued) has **never been demonstrated** by any build. AGEE's first job is to close that chain, not to add a second layer of systems on top of a broken one.

## The rule that governs AGEE

**Do NOT spend all resources on background systems while neglecting the playable game.**

AGEE exists to improve what the player actually experiences. A background system earns its place only by making the playable game better — a quest the player can accept and finish, an NPC who remembers them, a shop that actually sells something, a dungeon they can enter. If a proposed AGEE subsystem does not change what a player sees, does, or feels in the game, it does not go in the queue ahead of one that does.

## Honesty rules (binding on AGEE)

- **Never invent a system that does not exist.** If a subsystem is DOCUMENTED ONLY or NOT IMPLEMENTED, say so. Use the registry's statuses, not the directive's aspirations.
- **Never award XP for clicks or menu opens.** Skills earn XP only from real successful actions (registry T1, PARTIALLY IMPLEMENTED).
- **Never invent a crafting/fishing/mining system when the underlying gameplay does not exist yet.** In 3D, gathering gives resources only (E on a tree +2 wood, on a rock +1 stone, on a crate +1 wood) and **no XP is awarded** (G14 NOT IMPLEMENTED). There is no fishing anywhere in `engine3d/`. Leave that XP integration explicitly pending until the gameplay exists.
- **Never claim a build marker proves a gameplay fix.** Deployed does not mean fixed. Every AGEE-driven change is proven by the verification pipeline (sim vs pristine baseline, standalone asserts, phone probe, live verify by content marker).
- **Never fabricate evidence.** No invented commit hashes, verification results, build numbers, or measurements. Anything not verified is marked as such.

## What AGEE depends on (do not duplicate)

- **The registry** (`studio/IMPLEMENTATION_REGISTRY.md`, 88 requirements) — the source of truth for what exists. AGEE reads it; it does not replace it.
- **The legacy audit** (`studio/LEGACY_AUDIT.md`) — what is A (required by 3D), B (reusable gameplay logic — extract first), C (reusable content/assets), D (obsolete, verified), E (unknown). AGEE's content work extracts B/C systems; it never deletes by name.
- **The Stage 1 audit** (`~/workspace/verify1030/ASHFALL-STAGE1.md`) — the measured baseline (ground FLAT, 91.6% uniform grass, ONE tree design, 118 crates rendering as pine trees, world buffer 237k verts town / 266k wild, rebuild ~165–211ms, live hitch 566.6ms).
- **The dashboard data** (`studio/dashboard/dashboard-data.json`) — the permanent build ledger, queue, quality gates, and verification history.
- **The orchestrator** (`studio/orchestrator/`) — the task manager AGEE uses. AGEE proposes; the orchestrator schedules.
- **ACEE** (`studio/acee/`) — the Code Evolution Engine that implements what AGEE decides.
- **The three operating files** (`studio/MUSE_SOUL.md`, `studio/MUSE_EVOLUTION.md`, `studio/CONTINUE_ASHFALL.md`) — the constitution, the versioned instructions, and the resume point.

## What AGEE is NOT

- Not a second backlog, task manager, or queue. (The orchestrator owns scheduling.)
- Not a second renderer, world generator, or NPC system. (Extend what exists; never duplicate.)
- Not a replacement for the verification pipeline. (AGEE's output is proven by the same gates as every other build.)
- Not a promise that content will be generated forever. (AGEE proposes; the user orders; the queue decides.)
