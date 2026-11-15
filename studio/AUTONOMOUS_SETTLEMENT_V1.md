# AUTONOMOUS SETTLEMENT v1 — Milestone definition + 24-hour run order

User's milestone and run order, received 2026-11-15 ~16:03 MST (his words, saved in full). This is the next milestone after the foundation: connect the existing simulation to the playable game and finish ONE complete working settlement before spreading the simulation across the world.

---

The next step is to make Adventure's existing simulation actually operate inside the playable game, not just exist as a separate system.

I'd tackle it in this order:

## Next milestone: Autonomous Settlement v1

### Connect the world simulation to gameplay

* Fix the existing test failure in tests/quest-playthrough.mts so the full regression suite can pass.
* Connect the simulation coordinator to the actual game clock, gameplay loop and save/load system.
* Build the first complete resource chain:

  **Forest** — Trees grow and become harvestable resources.

  **Lumberjack** — NPC finds a tree, claims a job and cuts it down.

  **Logs and transport** — Logs are physically collected and delivered to storage.

  **Builder** — Uses stored materials and labour to construct a house.

  **New house and residents** — Housing creates capacity for population growth.

* Connect food and survival: farmers produce food, villagers consume it, shortages affect health and population.
* Add the World Simulation Control Center: inspect population, jobs, resources, production, construction, trade and simulation speed.
* Test the entire chain, including saving, reloading and running multiple simulation days.

### What comes after?

* Autonomous towns and expanding settlements.
* Roads, bridges, mines, farms and workshops.
* Caravans and inter-settlement trade.
* Wildlife, forests, seasons and environmental changes.
* Kingdoms, diplomacy, wars and independent factions.
* Generations, families, culture and world history.

### The important decision

We should finish one complete working settlement before spreading the simulation across the entire world. Once that loop works, we can scale it into a civilization simulator without creating disconnected features.

The existing PR #61 is still the starting point; its coordinator is not yet connected to the playable game, and its validation has an outstanding quest-test failure.

My recommendation is to make the next deliverable a functioning autonomous village, not another collection of systems.

## Run order

**Do it all now — run continuously for 24 hours, do everything.** (User's order, 2026-11-15 ~16:03 MST.)

## Correction (2026-11-15 ~16:16 MST — overrides the run order above where they conflict)

* **Concurrency:** do not wait for the tree implementation to finish before working on independent tasks. The quest-test fix runs concurrently with tree development in a separate worktree (`/home/hatch/pr61-questfix`, branch `feature/unified-world-simulation`) — one code agent per working tree.
* **"24 hours" means 24 simulated in-game hours**, not 24 hours of real-world waiting. Run it with accelerated deterministic simulation ticks and automated assertions. Record the results. The wall-clock end (~16:03 MST 2026-11-16) is withdrawn; the run is continuous execution until the village works or the user pauses.
* **Foundation order (strict):** entity identity → resource registry → job scheduler → forest-to-resident chain (logistics/construction + population arrival). Run order after the coordinator is wired: F-1 → R-1 → J-1 → chain → food/survival → Control Center → 24-simulated-hour test.
* **Do not merge PR #61 without the user's authorization.**
* **Do not spend another execution cycle repeating the 15-loop audit.** Every cycle must produce measurable progress in source code, tests or verified integration. If blocked, continue with independent tasks.
* **Report actual completed changes, not proposed changes.**
* **Scope freeze:** no research, disasters, kingdoms or another dozen systems yet. First village functioning from raw resources through autonomous construction and population growth.

---

## Program notes (parent, added 2026-11-15)

* This milestone IS Settlement Simulation v1 phases 1–6 in build order (the milestone's phases 1–2 are the PR #61 foundation sequence; phases 3–6 are the resource chain, food/survival, Control Center, and the full-chain test). The "what comes after" list is the Autonomous World Engine v1 six systems + the §18–21 societal layer, in that order — but ONLY after the settlement works. The 24-hour run works the queue in that order.
* Run structure (established in the 8-hour run, 2026-11-15): one code agent at a time on the single shared checkout; the parent verifies each landing (origin/main top commit, tree state, served markers, parent re-run asserts, sim-norm diff, phone probe) and checkpoints it before spawning the next agent. The run continues across subagent handoffs without waiting for the user to say "continue" each time. It stops when the user says pause/stop, or when 24 hours elapse from the order (~16:03 MST 2026-11-15 → ~16:03 MST 2026-11-16).
* Sequencing at the order: BUILD 1061 (trees) is still in flight on main and owns the checkout. It finishes, is verified and checkpointed first; the PR #61 sequence then starts on branch feature/unified-world-simulation (rebase onto main after 1061 lands). The PR #61 validation monitor (cron pr61-validation-monitor, every ~20m) reports the first green validation run.
* The Control Center in this milestone is the same system as the Autonomous World Engine v1 Control Center (studio/AUTONOMOUS_WORLD_ENGINE.md) — one system, not two. Its spec: inspect population, jobs, resources, production, construction, trade, simulation speed (plus the engine doc's full metrics list and pause/1×/5×/10×/50×/100× controls).
* A read-only audit agent is folding this milestone into the plan addendum (PLAN_ADDENDUM_BLUEPRINT.md) and the feature dependency map (FEATURE_DEPENDENCY_MAP.md).
