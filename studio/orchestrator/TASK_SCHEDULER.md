# Central Task Scheduler

**Directive:** SOUL.md §57 §1 (create a central task scheduler that distributes work intelligently).
**What already exists:** The prioritized backlog in `studio/CONTINUE_ASHFALL.md` (the queue in order) and the registry's top-10 priorities (`studio/IMPLEMENTATION_REGISTRY.md`, section "Top 10 highest-priority incomplete items"). The build-agent brief template (audit first, extend never duplicate, sync + rebase, gates, report DONE/TESTED/BROKEN/NEXT) is the standing procedure. This file adds the scheduling rules that coordinate agents around that queue — it does not replace the queue or the brief.

## The current task queue (from CONTINUE_ASHFALL.md, 2026-11-07 ~15:07 PST)

In order. Do not start a later item early when an earlier one is unfinished.

1. **BUILD 1030** — tap-to-walk pathfinding. IMPLEMENTED + CODE-VERIFIED, NOT committed, NOT live. Blocked: git EPERM + Chromium SIGTRAP. Next action when the environment clears: commit + push the 7 files, phone probe, live-verify by content marker, report, update the dashboard, spawn 1031.
2. **BUILD 1031** — blue-squares fix (subdivide wild-lake far cells to the lake's actual tiles). Queued after 1030 lands.
3. **BUILD 1032** — house interior invisible walls (boundary collision; enter/exit only via the Enter/Exit button). Queued after 1031.
4. **Ashfall Stages 2–6** — terrain (heightfield, HIGH risk, harness-prototype first), vegetation, architecture, settlements, atmosphere. One code build per stage, each verified live. Code builds start at Stage 2, after 1032.
5. **Dashboard repair (§54)** — data files created (`studio/dashboard/`, validated); move into the repo + wire the dashboard to read from them once git can write.
6. **Self-evolution files (§59)** — the three operating files move into version-controlled storage once 1030 lands and git can write (they are already in `studio/` as working copies; the move is a commit, not a rewrite).
7. **Master integration (§55)** — Stage A DONE (the registry). Stages B–F follow the registry's recommended order.
8. **Next evolution layer (§57)** — this directory. Implement only what is still missing, after the current hour's work is saved and reported.
9. **AGEE (§58)** — `studio/agee/` in creation by a parallel agent.
10. **Legacy cleanup (§52)** — audit DONE. Wave 1 removal once git can write (11-step procedure + tsc/build/sim/phone probe). Wave 3 needs explicit user approval per cluster.
11. **ACEE (§56)** — `studio/acee/` in creation by a parallel agent. Phases 1–7.
12. **Stone house replacement** — BLOCKED (package files never arrived).

## The file-ownership rule (the hard rule)

**One code agent at a time on the shared checkout.** Parallel agents share ONE working tree; uncommitted work interleaves. When agents share a tree, the parent sequences commits — an agent that commits whole files sweeps another agent's hunks in (this happened in BUILD 1022). When the tree is clean and one agent runs alone, it may commit + push itself. **Read-only audits can run in parallel** (they do not touch the tree — the legacy audit and the master integration audit ran in parallel with each other and with the 1030 build).

## How independent tasks run in parallel

A task is parallel-safe when it meets ALL of these:

* It does not modify the repo working tree (read-only audit, measurement, documentation in `~/workspace/verify*/` or `~/workspace/studio/` working copies).
* It does not write to a file another running task writes to.
* It does not require a commit, a push, or a deploy.
* It does not depend on another running task's output.

Examples that ARE parallel-safe: the legacy audit + the master integration audit (both read-only, different output dirs); a read-only measurement run alongside a code build in a different file; the dashboard-data drafting (in `~/workspace/studio/`) alongside a code build (in the repo tree).

Examples that are NOT parallel-safe: two code builds touching `Engine3DWorldView.tsx` (1030 and 1031 share that file — 1031 waits for 1030 to land); a code build + a Wave 1 removal in the same files; two agents committing.

## How conflicting tasks are coordinated

* **Same file, different tasks:** the tasks are serialized. The earlier queue item owns the file until it lands (committed + pushed + verified). The later task's agent must re-sync to the new HEAD and re-baseline before starting (Stage 2's agent must do this — the Stage 1 numbers are at 1029).
* **Same subsystem, different files:** allowed in parallel only if the files are disjoint and neither task changes a shared interface (a shared module's exports, a save key, a build marker). If either changes a shared interface, serialize.
* **Build-number collisions:** expected (ChatGPT builds in parallel constantly). The build number is always latest `origin/main` + 1, verified at build time — never assumed. Both markers are bumped per build (the hardcoded `window.__AG_BUILD` in `scripts/prepare-build-entry.cjs` AND `BUILD_NUMBER` in `src/App.tsx`); a mismatch fails deployment validation.
* **The parent sequences commits.** When the tree is shared, agents are briefed NO-commit and the parent commits in queue order. When the tree is clean and one agent runs alone, it may commit + push itself.

## How high-risk changes are isolated

A change is high-risk when it touches ground emission, every object's base y, far rings, the picker, save serialization, or a shared interface. Stage 2 terrain (the heightfield) is the current high-risk item.

* **Harness-prototype first.** The base-y agreement is proven in a prototype before the build touches the real renderer. The fallback (tint + shores + stone only) is kept ready.
* **Separate branch + verification before integration** (the §52 self-healing rule). A risky repair is developed on a branch, verified, then integrated — never directly on main.
* **Recoverable checkpoints.** A Git checkpoint is created before any removal or risky change, so a bad change rolls back cleanly.
* **One risk at a time.** Never stack two high-risk changes in one build. Stage 2 is one build; its risk is the heightfield alone.
* **Environment risk is not code risk.** The git EPERM / Chromium SIGTRAP blockers are environment failures, not code defects. They are recorded as BLOCKED in the registry (E1–E3), not as build failures, and no code is rewritten to work around them.

## How the scheduler prevents duplicated work and repeated problem-solving

* **The registry is the single source of truth for what exists.** Before starting a task, the agent reads the registry (and the legacy audit) to see whether the system already exists. If it exists, extend it — never duplicate it. (The §57 directive's own first rule: do not recreate systems already implemented.)
* **The queue is the single source of truth for what is next.** An agent takes the next dependency-ready item from the queue; it does not invent a new item or re-do a completed one. A completed item is marked in the registry and the dashboard data, and the continuation protocol refuses to restart it without a specific reason.
* **Failed attempts are recorded, not deleted.** `MUSE_EVOLUTION.md` keeps the revision log and the known gaps from real failures (environment write failure, MEMORY.md truncating-write rule, assert-runner no-pipe rule, subagent push transient rule). A future agent reads those before retrying the same approach. (See `RESEARCH_ENGINE.md` — failed experiments are recorded in the failed-attempts memory.)
* **The file-ownership rule prevents interleaving.** Two agents cannot silently edit the same file, so the same problem is never solved twice in two different hunks.
* **The parent verifies from git log + live markers + artifacts.** A subagent completion handoff may falsely claim its report was "already delivered" — if the user never got it, the task is still open. The parent verifies and delivers the report itself. This stops work from being lost (and re-done) between handoffs.
* **The 10-minute cycle (§50) is a checkpoint cadence, not a quota.** Do not manufacture changes to fill a report. If a task is blocked, the cycle is spent investigating, documenting, or working an independent task — not re-solving the blocked one.
