# GAME EVOLUTION LAB — Dashboard Section Spec

**Status:** DOCUMENTED ONLY (registry D7). No GAME EVOLUTION LAB section exists in the dashboard data. This file is the spec for it. It does not claim the section exists.
**Directive:** SOUL.md §58 section 13 ("CREATE THE CONTENT EVOLUTION DASHBOARD" — the GAME EVOLUTION LAB dashboard section).

## What it is

The GAME EVOLUTION LAB is a section of the development dashboard (artifact `ashfall-development-dashboard`, verified live 2026-11-07 ~14:16 PST) that shows **what AGEE is doing to the game** — what content was generated, what stories emerged, what quests were validated, how healthy the economy is, how active the population is, and how far along the completion roadmap the game is.

It is a **display** of AGEE's work, not a second dashboard. It reads from the same dashboard data (`studio/dashboard/dashboard-data.json`) as every other section, and it follows the same rules (real evidence, never invented numbers, never a verified status before the checks pass).

## What it shows

| Panel | What it displays | Source of the numbers |
|---|---|---|
| **Content generated** | What the world content factory produced (features, architecture, creatures, NPCs, quests) — and what was rejected, with reasons. | The factory's generation log + content QC rejections (`CONTENT_QC.md`). Nothing is shown as "generated" unless it passed QC and is in the game. |
| **Stories emergent** | What stories the emergent story engine detected — the situations that formed, how the world reacted, and what the player did. | The story engine's situation log (`EMERGENT_STORY_ENGINE.md`). No stories exist yet — the engine is DOCUMENTED ONLY, so this panel shows "no stories recorded" until the engine exists. It does not invent stories. |
| **Quests validated** | Quests generated, quests validated, quests offered, quests completed, quests rejected (with the validation check that failed). | The quest engine (`QUEST_ENGINE.md`). No quests exist in 3D (G11 NOT IMPLEMENTED), so this panel shows "no quests" until the quest engine exists. |
| **Economy health** | Gold sources and sinks, shop stock, price movements, trade-route status. | The living economy (`LIVING_ECONOMY.md`). No economy exists in 3D (G12 NOT IMPLEMENTED), so this panel shows "no economy" — and the one real number it can show: gold's only source in 3D is looting dead NPCs (+5 each). |
| **Population activity** | NPCs active (reaching their destinations), animals in habitat, transients completing walks, adventurers on delves — vs caps. | The population director (`POPULATION_DIRECTOR.md`). Real numbers exist here: 47 NPCs, animal caps 5/3/3/2/5, transient cap 8 (5 travellers + 3 adventurers), stray cap 1. |
| **Completion roadmap progress** | Each system on the five-stage ladder (prototype / functioning / integrated / polished / release-ready) with the measurable criteria for its current stage. | The completion roadmap (`COMPLETION_ROADMAP.md`) + the registry (88 requirements). |

## The controls

Every control in the GAME EVOLUTION LAB performs a **real action** (the §53 rule for the ultimate creation dashboard — every component must actually work, no placeholder buttons or fake progress indicators):

- **"What does the game need most?"** — runs AGEE's decision step (see `AUTONOMOUS_LOOP.md`) and shows the highest-value missing or weak piece, with the evidence (registry status, health score, player-experience findings). It does not invent a need — it reads the registry.
- **"Show the evidence"** — for any number in the Lab, shows the source (the registry entry, the Stage 1 baseline measurement, the sim result, the phone probe). A number with no evidence is not shown — or is shown as "no evidence."
- **"Filter by stage"** — filters the roadmap by stage (prototype / functioning / integrated / polished / release-ready), like the dashboard's existing Verified ledger filter (which works — clicking it filters to verified builds only).
- **"Open the registry"** — links to `studio/IMPLEMENTATION_REGISTRY.md` (the source of truth for what exists).

## How it connects to the dashboard data

The Lab reads from `studio/dashboard/dashboard-data.json` — the same file as the rest of the dashboard. It does **not** maintain a separate data store (no duplicate sources of truth — the §55 integration rule).

The data it needs (to be added to `dashboard-data.json` when the Lab is built — not before, and not by inventing numbers):

- `agee.contentGenerated` — counts by type + rejections with reasons. (Empty until the factory exists.)
- `agee.storiesEmergent` — situations detected + outcomes. (Empty until the story engine exists.)
- `agee.questsValidated` — generated / validated / offered / completed / rejected. (Empty until the quest engine exists.)
- `agee.economyHealth` — gold sources/sinks, shop stock, prices. (Empty until the economy exists.)
- `agee.populationActivity` — NPCs active, animals in habitat, transients completing walks, caps. (Populated from the real caps + the NPC/animal systems that exist.)
- `agee.completionRoadmap` — each system + its stage + the criteria met. (Populated from the registry + `COMPLETION_ROADMAP.md`.)

**Schema rule:** any new field added to `dashboard-data.json` for the Lab must be added to `dashboard-schema.json` first, and validated before the data is replaced (the §54 atomic-replacement procedure: validate existing → save backup → write replacement to a temp file → validate replacement → atomically replace → verify). The Lab never writes dashboard data directly — it reads it.

## What the Lab does NOT do

- It does not show a number it cannot source. An empty panel that says "no data — the system does not exist yet" is correct. A panel with an invented number is a lie.
- It does not create a second dashboard. It is a section of the existing dashboard.
- It does not run AGEE. It displays AGEE's work. (AGEE runs through the orchestrator — see `AUTONOMOUS_LOOP.md`.)
- It does not claim a system is at a stage it has not reached. (The gate-evidence rule, `MUSE_EVOLUTION.md` v1.1: a stage is only claimed when the measurable criteria for it are met and evidenced.)
