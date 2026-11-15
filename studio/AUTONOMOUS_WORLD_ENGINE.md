# AUTONOMOUS WORLD ENGINE v1 — Milestone definition

User's milestone, received 2026-11-15 ~16:02 MST (his words, saved in full). This follows studio/LIVING_WORLD_SYSTEMS.md (§18–21) and the Settlement Simulation v1 milestone. It does not replace them — it is the next milestone after the foundation (PR #61) is connected, and its six systems map onto the existing plan's phases.

---

Now we move into building the actual autonomous world engine.

We've planned the civilization systems and created the first simulation coordinator. The next major milestone should be making the world operate continuously, even when the player is nowhere near a settlement.

## Next milestone: Autonomous World Engine v1

I would add these six systems in this order:

### 1. Living environment

Trees grow, forests spread, minerals deplete, animals reproduce, crops grow and seasons affect resources.

### 2. Resource entity system

Every resource has a physical location, quantity, quality, storage capacity and extraction method.

### 3. Autonomous job scheduler

NPCs identify work, claim jobs, gather resources, transport materials and complete tasks.

### 4. Construction engine

Buildings require land, materials, labour and time. They progress through visible construction stages.

### 5. Population and settlement growth

Housing, food, employment, health and safety determine whether populations grow, migrate or decline.

### 6. Regional civilization AI

Settlements establish trade, expand territory, specialize, negotiate and compete.

## One critical addition: the World Simulation Control Center

Inside Adventure's Debug/World Studio tools, I want a proper control center showing:

* World population and population changes.
* Number of settlements and buildings.
* Total resources and shortages.
* NPC employment and unemployment.
* Food production and consumption.
* Construction projects.
* Trade routes and deliveries.
* Environmental changes.
* Simulation errors and performance.
* Time controls: pause, 1×, 5×, 10×, 50× and 100×.

We should be able to simulate 100 years, inspect what happened and identify why a civilization succeeded or collapsed.

## The next concrete deliverable

Build one complete settlement simulation with:

* 20–30 autonomous villagers.
* Forest, stone and fertile farmland.
* Lumberjacks, miners, farmers, haulers and builders.
* Shared inventories and physical deliveries.
* Houses, farms, storage and workshops.
* Food consumption and population needs.
* Save/load and deterministic simulation tests.

Those numbers are a test scenario, not a claim about existing game capacity.

## The rule

No fake resources, no teleporting materials, no buildings appearing for free, and no NPCs working without actual jobs.

## The gate

We should finish the failed CI regression and connect the existing coordinator to gameplay before expanding this milestone. That way, every new system becomes part of the same world rather than another disconnected feature.

---

## Program notes (parent, added 2026-11-15)

* Saved verbatim from the user's message; this is the next milestone after the PR #61 foundation sequence (Settlement Simulation v1 phases 1–2) lands. The gate is explicit: CI green + coordinator wired into the game loop and saves BEFORE any of the six systems expand.
* How the six systems map onto the existing plan (parent's read — the addendum agent is verifying): (1) living environment = Phase 1 (trees in flight as 1061; then geology, rivers, landforms/soil, climate, regrowth); (2) resource entity system = Phase 2 (physical deposits, quantities, storage, extraction); (3) autonomous job scheduler = Phase 2/4 (the plan's job scheduler foundation + NPC professions — extends the 1059 utility scorer, which chooses activities but does not yet claim/haul jobs); (4) construction engine = Phase 3 (generalises the 1058 hut construction — land, materials, labour, time, visible stages); (5) population and settlement growth = Phase 4/5 (extends 1060 memory + the parked Tamsin population growth); (6) regional civilization AI = Phase 5 (trade, territory, specialization, negotiation, competition).
* The World Simulation Control Center maps to §19 (inspector + simulation controls) and Phase 6 (Studio). Its metrics list is the spec: population + changes, settlements + buildings, resources + shortages, employment/unemployment, food production/consumption, construction projects, trade routes + deliveries, environmental changes, sim errors + performance. Time controls pause/1×/5×/10×/50×/100×. Architectural note for the addendum: 100× cannot be the real-time 900ms tick — the coordinator advances by DAY, so a 100-year run is 36,500 daily steps as a batch computation; the controls must decouple simulation time from render time.
* The concrete deliverable (20–30 autonomous villagers) is a TEST SCENARIO, not a capacity claim (user's words). Dependency the addendum must record: NPC pathfinding (planPathNpc, linear-scan open list) is unproven past ~50 NPCs; 20–30 villagers is inside the plausible range but the 6.1 tiering + heap fix must be verified before the scenario is run as an acceptance test.
* The rule restates the program's standing rules (physical resources, no teleporting, real materials, real jobs) — no new policy, but now attached to this milestone as its acceptance gate.
* A read-only audit agent is folding this milestone into the plan addendum (PLAN_ADDENDUM_BLUEPRINT.md) and the feature dependency map (FEATURE_DEPENDENCY_MAP.md).
