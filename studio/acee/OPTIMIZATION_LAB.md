# Quantum-Inspired Computation Lab

**Status:** Specification. Version 1.0 — 2026-11-07.
**Directive:** SOUL.md §56 §3 (Create the quantum-inspired computation lab) + §56 §15 (Performance and execution requirements).
**Location:** `studio/acee/OPTIMIZATION_LAB.md` (this file).

## The plain statement (read this first)

**Do not pretend classical computers are quantum computers.** ACEE runs on ordinary hardware. It uses quantum-*inspired* mathematics — techniques borrowed from quantum computing, physics, mathematics, and advanced computational research — where they offer measurable benefits. Every technique below is judged the same way: benchmark it against the current method, keep it only if it demonstrably improves a result, drop it if it does not. The goal is to discover better ways to solve development problems, not to blindly apply fashionable algorithms.

## The baseline (what "better" is measured against)

No optimization is evaluated in a vacuum. The reference measurements are the Ashfall Stage 1 baseline (`~/workspace/verify1030/ASHFALL-STAGE1.md`, 2026-11-07, HEAD `14491c9f`):

* World buffer: 237,222 verts (town) / 266,000 verts (wild) — 89% of the 300k budget.
* World rebuild: ~165–211ms steady-state.
* Live hitch: 566.6ms on a 50-tile teleport.
* Harness FPS (SwiftShader — relative baseline only): town 6.79 / wild 7.82 / shore 9.29 / first-person 6.06.
* Ground: FLAT (max ground-plane vertex y = 0.038); 91.6% uniform grass; tint variation ±0.027; stone terrain 0 tiles.

A technique that claims to improve rendering, worldgen, or simulation must show a before/after delta on the same harness, on the same command, in the same environment. A claim with no numbers is not an improvement.

## The techniques

### Simulated annealing

* **What problem it solves here:** Choosing among many near-equivalent configurations when the search space is too large to enumerate — architecture decisions, world-generation parameters, dependency ordering, task scheduling.
* **When it applies:** When there is a single measurable cost function and a large discrete space. Example: tuning the wild-terrain noise thresholds (groundNoise cutoffs for lakes, trees, rocks) so the wild band looks varied without exceeding the vertex budget. Example: ordering the build queue to minimize context-switching (which tasks share files, which are independent).
* **Rule:** Define the cost function first (verts, rebuild ms, or a weighted combination). Anneal against it. Keep the result only if it beats the current configuration on the same harness.

### Genetic algorithms

* **What problem it solves here:** Evolving parameter sets (and, later, code-generation strategies) by selection, crossover, and mutation over generations.
* **When it applies:** When the parameter space is continuous or combinatorial and the fitness function is cheap to evaluate in a harness. Example: evolving grass/rock/flower density + placement rules against a fitness function of (visual variety) − (vertex cost) − (FPS cost). Example: evolving NPC schedule parameters against a fitness function of (NPCs visibly doing believable things) − (NPCs stuck or teleporting).
* **Rule:** Fitness must be measured, not asserted. A generation that cannot be scored in the harness is not a generation — it is a guess. Keep only the generations that beat the baseline.

### Evolutionary optimization

* **What problem it solves here:** Architecture search — evolving the *shape* of a solution (which modules, which data flow, which emission strategy) rather than just its parameters.
* **When it applies:** When there are several structurally different ways to solve the same problem and the trade-off is not obvious. Example: the ground-emission approaches (per-tile colour blocks vs the shared-corner colour field in BUILD 1009 vs a heightfield in Stage 2) — an evolutionary search over emission strategies scored by (visual continuity) − (verts) − (rebuild ms). Example: the three live pathfinders — evolving toward one canonical tile-A* core (extraction priority 3) by scoring candidate consolidations.
* **Rule:** The fitness function must include the regression cost (a prettier ground that breaks collision scores low). An architecture that wins on one metric and breaks a gate loses (see `CODE_EVOLUTION_FORMULA.md` — the highest score wins only when the gates pass).

### Constraint solving

* **What problem it solves here:** Enforcing the rules that must always hold, and finding a valid configuration when many rules interact.
* **When it applies:** Placement validation (houses must not be placed on top of pathways; every house's painted door, door trigger, exit point, and path endpoint must all agree — the standing quality bar from 2026-10-14). Build-menu validation (a kind is placeable only if `validatePlacement` accepts it; `PALETTE_KINDS` must equal exactly the kinds `captureChunk` emits — the 1029 fix). Chunk capture (a saved chunk round-trips exactly). Door/trigger/exit agreement (the standing door rule).
* **Rule:** Constraints are checked, not approximated. A placement that violates a constraint is rejected, not "mostly valid." The solver's job is to find a valid placement (or report that none exists), not to relax the rules.

### Graph optimization

* **What problem it solves here:** Anything that is a graph — dependencies, tasks, paths, the genome itself.
* **When it applies:** Dependency ordering (which files to index first, which builds to land first — the queue is a dependency graph: 1030 → 1031 → 1032 → Stages 2–6). Task scheduling (parallelize independent work, serialize conflicting work — the multi-agent lab's coordination rule). Pathfinding (A* already *is* graph optimization — the three live pathfinders are graph searches over the tile grid; the 1030 player path adds greedy line-of-sight smoothing to ≤3 waypoints). The genome's own queries ("what depends on X" is a reverse-graph traversal).
* **Rule:** Use the graph that already exists (the genome) rather than rebuilding one per question. A graph algorithm that re-scans the repo to answer a question the genome already knows is waste.

### Probabilistic search

* **What problem it solves here:** Exploring a space where the answer is a distribution, not a single point — worldgen, loot, encounters.
* **When it applies:** World generation (the noise-based terrain: `groundNoise(x,y,32) > 0.90` for wild lakes, 1.76% water; the moisture field that never exceeds ~0.7607, which is why the 2.5D lakes are dead code). Loot and encounter tables (drop rates, spawn mixes — the 915–920 stray mix: 1 live cap, wolf/slime/rat, spawn ≥114 units from plaza).
* **Rule:** A probabilistic system must be deterministic given its seed (the world is procedurally generated and must be reproducible). Randomness is allowed inside believable boundaries; a different seed must not produce a different *kind* of world.

### Monte Carlo methods

* **What problem it solves here:** Estimating a distribution by sampling — frame-time distributions, simulation outcomes, economy behaviour over long durations.
* **When it applies:** The simulation lab (`VALIDATION_LAB.md`): thousands of simulated entities where practical, long-duration simulation tests, NPC behaviour simulations, civilization simulations, economy simulations, combat simulations. Example: run the NPC sim for 100 in-game days across many seeds and measure how often an NPC gets stuck, loses its home, or has negative gold — then fix the worst offenders. Example: sample the frame-time distribution on a 50-tile teleport to measure the hitch (the 566.6ms number is one sample; a Monte Carlo run gives the distribution).
* **Rule:** Use representative workloads and reproducible seeds. Compare before-and-after measurements. A Monte Carlo result is a distribution (mean, p95, max) — reporting only the mean hides the hitch that the player actually feels.

### Bayesian optimization

* **What problem it solves here:** Tuning a small number of continuous parameters when each evaluation is expensive (a phone probe, a full sim run, a harness measurement).
* **When it applies:** Parameters that were hand-tuned and might not be optimal. Example: the sprint world-rebuild threshold (8 → 16 in BUILD 1026, chosen by reasoning about the ±22 ground window and the ±28 grass window — a Bayesian search over the threshold, scored by hitch count, could confirm or improve it with a handful of evaluations). Example: grass density vs FPS (BUILD 1015 denser grass cut harness frame rate ~13% — the optimum density is a Bayesian search, not a guess). Example: the 1030 replan/stuck/figure-wait constants (500ms / 1500ms / 900ms) — tuned by the entry asserts, but a Bayesian search over real tap journeys could refine them.
* **Rule:** Each evaluation must be a real measurement (a harness run, a probe), not a model prediction. The optimizer proposes; the harness disposes. Keep the optimum only if it beats the current value on the same measurement.

### Parallel search

* **What problem it solves here:** Exploring multiple candidate implementations concurrently and keeping the best — the sandbox's alternative approaches.
* **When it applies:** When there are two or more plausible implementations and the cost of trying each is affordable in parallel. Example: the sandbox (§56 §12) generating alternative approaches for a major improvement and benchmarking them side by side. Example: the three read-only auditors (game systems / dev systems / directives) who built the registry in parallel — the same pattern, applied to code.
* **Rule:** Parallel search is bounded by the one-code-agent rule (see `MULTI_AGENT_LAB.md`): parallel *reads* and parallel *experiments in isolated worktrees* are fine; parallel *writes to the same checkout* are not. Each candidate lives in its own isolated experiment until one is promoted through a controlled patch.

### Reinforcement learning (where appropriate)

* **What problem it solves here:** Learning a policy by trial and error in a simulation — NPC behaviour policies, adaptive difficulty, scheduling policies.
* **When it applies:** Only where (a) a simulation harness exists to train against, (b) the reward is defined in measurable terms (NPCs arriving on schedule, not NPCs "seeming smart"), and (c) the learned policy can be validated by the same gates as hand-written code. Candidate: NPC schedule-following (reward: arrivals on time, minus stuck time, minus teleports). Candidate: the build queue's task selection (reward: verified progress per credit).
* **Rule:** RL is the most speculative technique in this lab. It is NOT used for the game itself unless a system exists to train and validate it — there is no RL system in ASHFALL today, and none is claimed. Do not spend development credits implementing speculative technology without a credible path to practical benefit (§56 §14). A learned policy that cannot pass the gates is not promoted, no matter how clever it looks.

## Performance requirements (the machine's own speed)

From §56 §15 — the machine must be designed for speed and efficiency. Prioritize:

* Incremental indexing (the genome's change detection — never a full re-scan).
* Parallel independent tasks (read-only audits in parallel; code builds serialized).
* Cached dependency graphs (the genome, not a re-scan per question).
* Minimal context retrieval (retrieve only what's relevant to the task — the memory engine's rule).
* Efficient code generation (templates + registration, not regeneration from scratch).
* Selective testing (the smallest relevant suite first; the broader suite at milestones).
* Reusable templates (the build-agent brief; the palette-registration pattern).
* Background processing (audits and measurements run while the code agent works).
* Resource-aware scheduling (stop cleanly near a limit; finish the current safe operation, save state, document, stop).
* Incremental builds (only rebuild what changed).
* Persistent task state (the resume point — a fresh session continues without re-explaining the project).

Avoid unnecessary repository scans. Avoid rebuilding unchanged systems. Avoid repeatedly generating the same code. Use the fastest appropriate implementation strategy.

**"Light speed" means minimizing avoidable latency and maximizing throughput within actual hardware, network, model, and tool limits.** It is not a literal claim. There is no light-speed computer here; there is a machine that does not waste the time it has.

## Benchmarks (the keep-or-drop rule)

Create benchmarks to compare approaches. Only retain optimizations that demonstrate actual improvements. The benchmark set (v1):

| Benchmark | What it measures | Current baseline |
|---|---|---|
| World buffer | verts at town centre / wild | 237,222 / 266,000 (89% of 300k) |
| Rebuild time | ms, steady-state | ~165–211ms |
| Teleport hitch | ms, 50-tile teleport | 566.6ms |
| Harness FPS | town / wild / shore / first-person (SwiftShader, relative only) | 6.79 / 7.82 / 9.29 / 6.06 |
| Sim vs pristine | normalized log diff, FAIL count | identical, 0 FAIL (known 684 rig crash only) |
| Assert suite | entry + runner checks, pass rate | 1030: 97 + 47, all pass |
| Tap journey | ticks to arrival, replans (entry asserts) | hut detour 250 ticks / 0 replans; tree-line 226 / 0; water 392 / 0; standing-NPC 237 / 0; pacing-NPC 238 / 0; head-on pair 22 ticks |

A technique earns its place in the lab by improving one of these numbers (or by enabling a measurement that did not exist). A technique that improves nothing is removed — the lab is a laboratory, not a museum.
