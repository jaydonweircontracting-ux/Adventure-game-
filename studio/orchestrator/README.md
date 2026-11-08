# Master Development Orchestrator — README

**Location:** `studio/orchestrator/` (in the Adventure Game repo)
**Directive:** SOUL.md §57 (Next Evolution Layer), section 1
**Status:** NEW (created 2026-11-07). This directory is the §57 Next Evolution Layer. It does NOT replace anything that already exists.

## What already exists (do not duplicate)

| System | Where | Status (from the registry) |
|---|---|---|
| Autonomous Development Engine (session controller) | `scripts/autonomous-engine.mjs` (BUILD 573) | Implemented; stale Oct-era — the registry's top-10 item #9 says retire or reconcile it |
| Master Implementation Registry (88 requirements) | `studio/IMPLEMENTATION_REGISTRY.md` | Written + verified (88 rows, 88 sections, counts match) |
| Legacy codebase audit | `studio/LEGACY_AUDIT.md` | COMPLETE AND VERIFIED (registry S26) |
| Dashboard data (JSON + schema + history) | `studio/dashboard/` | Partially implemented; data files created + validated; not yet wired into the dashboard artifact |
| Live development dashboard (artifact) | `ashfall-development-dashboard` | Live + verified 2026-11-07 ~14:16 PST (audit pass) |
| Operating files (soul / evolution / resume point) | `studio/MUSE_SOUL.md`, `studio/MUSE_EVOLUTION.md` (v1.1), `studio/CONTINUE_ASHFALL.md` | Implemented but unverified |
| Code Evolution Engine (ACEE, §56) | `studio/acee/` | Files PRESENT on disk (10 files, 116,568 bytes, parent-verified 2026-11-07 ~15:15 PST); DOCUMENTED ONLY as a running engine (Phase 1 partially done, Phases 2–7 not started) |
| Game Evolution Engine (AGEE, §58) | `studio/agee/` | Files PRESENT on disk (15 files, 96,177 bytes, parent-verified 2026-11-07 ~15:13 PST); DOCUMENTED ONLY as a running engine (D7) |
| Development Genome | — (no file yet) | DOCUMENTED ONLY (§53 recommendation + §57 final target) |
| Sim suite | `scripts/simulate.ts` | Functioning, with the known 684 rig crash (~1,000 sim lines unverified; awaiting user word) |
| Standalone asserts + phone probe + live verify | `~/workspace/verify<BUILD>/` (outside the repo) | Asserts functioning (1030: 97 entry + 47 runner pass); phone probe BLOCKED (Chromium SIGTRAP); live verify is a working procedure, blocked for 1030 (no commit/push yet) |
| Memory | `~/MEMORY.md` + `~/memory/` dated logs + `studio/` (GitHub is the permanent record) | Functioning; the 2026-11-07 truncation incident was restored; the structured advanced memory in §57 §5 is not yet built |

## What this directory adds

The §57 Next Evolution Layer: the coordination, self-improvement, verification, benchmarking, memory, research, tooling, intelligence, cleanup, resource, health, and continuation systems that sit ON TOP of the existing infrastructure and make it better. It does not recreate the autonomous engine, the genome, the code evolution engine, the dashboard, or the game systems. It extends them.

## Note: §55 unification docs appeared during this session

While these orchestrator files were being written (2026-11-07 ~15:10–15:14 PST), a parallel agent created the §55 master-integration unification docs in `studio/`: `ENGINE_BIBLE.md`, `SYSTEM_MAP.md`, `PROJECT_STATE.md`, `NEXT_TASK.md`, `TEST_STATUS.md`, `DEVELOPMENT_ROADMAP.md`, `DEVELOPMENT_DIRECTIVES.md`, `DASHBOARD_DATA.md`, `BUILD_LEDGER.md`, `VERIFICATION_HISTORY.md`, `ARCHITECTURE_DECISIONS.md`. They were NOT touched by this task and their contents were NOT inspected here — they are listed only as present (observed by directory listing, mtimes 23:11–23:13 UTC). The table above describes the state verified at the start of this session; the §55 docs should be read and referenced by a follow-up pass (notably `ENGINE_BIBLE.md` for `ADVANCED_MEMORY.md`'s documentation component and `HEALTH_SCORE.md`, and `SYSTEM_MAP.md` / `PROJECT_STATE.md` for `SUBSYSTEM_REGISTRY.md`).

## What the orchestrator coordinates

One central intelligence that coordinates every development subsystem:

* Autonomous development (the engine in `scripts/autonomous-engine.mjs` + the §49/§50 autonomous directives).
* Code generation (ACEE, `studio/acee/` — in creation).
* Repository intelligence (the registry, the legacy audit, the dashboard data).
* Architecture (the §51/§52 engineering directives; the legacy audit's extraction priorities).
* Testing (the sim, the standalone asserts, the phone probe, live verification).
* Optimization (the Stage 1 baseline; the benchmarking system in `BENCHMARKING.md`).
* Visual development (the visual intelligence engine in `VISUAL_INTELLIGENCE.md`; the Stage 1 visual findings).
* World simulation (the sim + the world intelligence tests in `GAMEPLAY_INTELLIGENCE.md`).
* NPC intelligence (the NPC sim in `src/game/`; the living-world directives).
* Game mechanics (the 3D game systems; the registry's game-system requirements).
* Dashboard operations (the dashboard artifact + `studio/dashboard/` data).
* Persistent memory (the operating files + the advanced memory in `ADVANCED_MEMORY.md`).
* Performance monitoring (the Stage 1 baseline; the benchmarking system).

## Files in this directory

| File | §57 section | What it is |
|---|---|---|
| `README.md` | §1 | This file — the orchestrator overview |
| `SUBSYSTEM_REGISTRY.md` | §1 | Every subsystem registered with its capabilities and actual status |
| `TASK_SCHEDULER.md` | §1 | The central task scheduler (parallel, conflict, isolation, de-duplication) |
| `RECURSIVE_ENGINE.md` | §2 | The recursive development engine (improving the tools that build ASHFALL) |
| `VERIFICATION_INTELLIGENCE.md` | §3 | Independent verification intelligence (the GENERATED → APPROVED pipeline) |
| `BENCHMARKING.md` | §4 | The real development benchmarking system |
| `ADVANCED_MEMORY.md` | §5 | Advanced development memory (structured categories + semantic retrieval) |
| `RESEARCH_ENGINE.md` | §6 | The AI research and experimentation engine |
| `TOOL_BUS.md` | §7 | The development API and tool bus |
| `GAMEPLAY_INTELLIGENCE.md` | §8 + §9 | Automated gameplay intelligence + world intelligence / emergent story testing |
| `VISUAL_INTELLIGENCE.md` | §10 | The visual intelligence engine |
| `CLEANUP_ENGINE.md` | §11 | The automatic project cleanup engine |
| `RESOURCE_INTELLIGENCE.md` | §12 | Resource intelligence (credits/time/compute) |
| `HEALTH_SCORE.md` | §13 | The master project health score (evidence-based, never invented) |
| `CONTINUATION_PROTOCOL.md` | §14 | The autonomous continuation protocol |

## The final evolution target (§57 §15)

The finished ecosystem has:

* One central development orchestrator (this directory).
* One continuously updated development genome — v1 built 2026-11-07 (Phase 1): `studio/genome/` (scanner + genome.json + query.mjs + run-cycle.mjs); updates are run by hand until the orchestrator schedules them.
* One autonomous code-generation engine (ACEE, `studio/acee/` — in creation).
* Multiple coordinated engineering agents.
* Independent verification (`VERIFICATION_INTELLIGENCE.md`).
* Automated optimization (`BENCHMARKING.md`).
* Persistent project memory (`ADVANCED_MEMORY.md` + the operating files).
* Autonomous gameplay testing (`GAMEPLAY_INTELLIGENCE.md`).
* World simulation testing (`GAMEPLAY_INTELLIGENCE.md`).
* Visual intelligence (`VISUAL_INTELLIGENCE.md`).
* Safe project cleanup (`CLEANUP_ENGINE.md`).
* Resource intelligence (`RESOURCE_INTELLIGENCE.md`).
* Research and experimentation (`RESEARCH_ENGINE.md`).
* Continuous development (`CONTINUATION_PROTOCOL.md`).

These systems are integrated into the existing ASHFALL architecture. No unnecessary overlapping infrastructure. No replacing working systems. The highest-impact missing capabilities are implemented first.

## Current state (2026-11-07)

* Last verified checkpoint: BUILD 1029, commit `14491c9f` (live-confirmed 2026-11-07T21:37:14.339Z, run 42416626999).
* Active task: BUILD 1030 (tap-to-walk pathfinding) — implemented + code-verified, NOT committed, NOT live. Blocked by the environment: git cannot write (EPERM on overlayfs; re-tested 2026-11-07 ~15:04 PST, HEAD still `14491c9f`) and Chromium will not launch (SIGTRAP). The commit/push + phone probe wait for the environment to clear (likely on the next deployment/VM replacement).
* Queue: 1030 → 1031 → 1032 → Ashfall Stages 2–6.
* Registry: 88 requirements — 4 COMPLETE AND VERIFIED, 15 IMPLEMENTED BUT UNVERIFIED, 21 PARTIALLY IMPLEMENTED, 9 DOCUMENTED ONLY, 34 NOT IMPLEMENTED, 5 BLOCKED, 0 OBSOLETE OR DUPLICATED.
* The two audits that frame everything are done: the legacy audit (248 files) and the master implementation registry (88 requirements). Their headline finding: the 3D game is NOT the game that ships today — `GraphicsModeHost` always boots 2.5D, and `Engine3DWorldView` has no combat, quests, dialogue, shops, inventory, or 2.5D-save support. Deleting everything "2D/2.5D" today would delete the game; most legacy code is B/C (extract first), not D.

## The command

**BUILD. MEASURE. LEARN. EVOLVE. REPEAT.**

Make ASHFALL capable of improving both the game and the machinery used to create the game. Make every development cycle more informed, more efficient, more reliable, and more productive than the previous one. The system should not merely generate more code. It should generate better code, make better decisions, discover better approaches, detect its own mistakes, and continuously improve its ability to engineer software.

## Pacing (from §57)

Do not send another massive directive immediately after this one. Let Muse finish its current hour, save its work, and produce an implementation report first. Then send the next addition and have it implement only what is still missing. The ultimate goal is not maximum code generation. It is maximum verified progress per development credit. That distinction is what keeps ASHFALL from becoming an enormous collection of unfinished systems.
