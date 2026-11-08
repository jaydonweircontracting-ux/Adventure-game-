# ASHFALL — DEVELOPMENT_DIRECTIVES

**Version:** 1.0 — 2026-11-07 ~15:08 PST
**Source:** `~/SOUL.md` §47–§59 (the directives, added verbatim 2026-11-07). This file is an INDEX only — section, title, date added, and a one-line summary each. **The full text lives in `~/SOUL.md`; do NOT copy the full directives here.** If this index and SOUL.md disagree, SOUL.md wins.
**Status:** This file is NEW (registry D7 did not name this doc separately, but §55's doc list includes DEVELOPMENT_DIRECTIVES).

## The directives (in order)

| Section | Title | Date added | One-line summary |
|---|---|---|---|
| §47 | UPDATE SPEED AND EFFICIENCY | 2026-11-07 | Updates must be dramatically faster (targeted incremental changes, reuse systems/assets, parallel when safe) but never at the cost of stability, functionality, or code quality. Testing/verification stays. |
| §48 | ASHFALL — 3D GAME MASTER DEVELOPMENT DIRECTIVE | 2026-11-07 | 3D is THE game — the actual, primary version of ASHFALL. The old 2D/2.5D modes are no longer development targets; their useful logic/content is reused in 3D. 16 sections; the full acceptance criteria are §48.16. |
| §49 | ASHFALL — AUTONOMOUS DEVELOPMENT AND CONTINUOUS COMPLETION DIRECTIVE | 2026-11-07 | Autonomous studio operation (inspect → unfinished → backlog → highest-value task → implement → test → fix → save/document → next task); maximum development speed; parallel teams A–F; self-managing backlog; automated bug detection/repair; RUN mode. |
| §50 | ASHFALL — AUTONOMOUS EVOLUTION DIRECTIVE | 2026-11-07 | The 10-minute development cycle (a checkpoint cadence, not a promise of indefinite execution); massive progress through parallel work; make the development machine better every cycle; progressive quality gates (L1–L4); autonomous checkpoints + phone-friendly reporting (the dashboard). |
| §51 | ASHFALL — ULTIMATE ENGINEERING AND SELF-EVOLVING ARCHITECTURE | 2026-11-07 | Complete codebase optimization; ultra-lightweight layered architecture (Core/World/Entity/Gameplay/Simulation/Presentation/Data engines); extreme performance optimization; extremely simple future development; self-healing codebase. **NOTE: §51 was cut off mid-sentence as received ('For risky changes, create a recover') — flagged in SOUL.md; the same self-healing rules are covered in full in §52.** |
| §52 | ASHFALL — GOD-TIER ENGINEERING DIRECTIVE | 2026-11-07 | One clean 3D architecture; legacy code cleanup (classify A–E, extract before removing, 11-step safe removal); simple modular code; extreme performance optimization; self-healing codebase; one source of truth; automated health checks; continuous refactoring; protect the game; FINAL COMMAND. |
| §53 | ASHFALL — AUTONOMOUS GOD-TIER DEVELOPMENT DIRECTIVE | 2026-11-07 | PRIME DIRECTIVE: MAXIMUM IMPROVEMENT PER CREDIT. The autonomous long-run development engine (OBSERVE → THINK → BUILD → TEST → OPTIMIZE → DOCUMENT → REPEAT), the credit and execution governor (three modes), the ultimate creation dashboard (10 modules), self-improving development intelligence, self-healing architecture, hexadecimal engineering (strategic only), living world simulation, next-gen NPC intelligence, autonomous QA, the Evolution Ledger. Implemented in this repo as `studio/autonomous-engine/`. |
| §54 | ASHFALL ADVENTURE GAME — DEVELOPMENT DASHBOARD: REPAIR, DATA INTEGRATION & AUTONOMOUS MAINTENANCE | 2026-11-07 | Make the dashboard permanent, data-driven, and GitHub-synced (`studio/dashboard/`); reconcile build history against GitHub commits; never fabricate evidence; four quality gates with real evidence; memory protection (atomic writes, backups, recovery from the last valid snapshot) after the 2026-11-07 MEMORY.md truncation. |
| §55 | ASHFALL — MASTER INTEGRATION DIRECTIVE | 2026-11-07 | CONNECT EVERYTHING. IMPLEMENT EVERYTHING. MAKE THE ENTIRE ECOSYSTEM WORK. The master implementation registry (classify every requirement), connect the whole ecosystem through clear interfaces, complete the autonomous engine/dashboard/world/RPG/adventurer systems, unify documentation/memory in GitHub (this doc set). Stages A–F. An integration mission, NOT a rebuild. |
| §56 | ASHFALL — QUANTUM-INSPIRED AUTONOMOUS CODE EVOLUTION MACHINE | 2026-11-07 | ACEE — a SEPARATE engineering subsystem (not a feature buried inside the game) whose job is to build, repair, optimize, and evolve ASHFALL itself. Development Genome, code generation machine, multi-agent lab, optimization lab, evolution sandbox, CODE EVOLUTION LAB dashboard interface. Phases 1–7. Future work. |
| §57 | ASHFALL — NEXT EVOLUTION LAYER | 2026-11-07 | Master development orchestrator, recursive development engine, independent verification intelligence (GENERATED → COMPILED → TESTED → INTEGRATED → VERIFIED → APPROVED), real development benchmarking, advanced memory, AI research engine, development API and tool bus, automated gameplay/world/visual intelligence, automatic cleanup, resource intelligence, master project health score, autonomous continuation protocol. Implement only what is still missing, and only AFTER the current hour's work is finished, saved, and an implementation report produced. |
| §58 | ASHFALL — AUTONOMOUS GAME EVOLUTION & CONTENT CREATION ENGINE | 2026-11-07 | AGEE — the game evolution engine: world content factory, emergent story engine, quest generation and validation, deep NPC personality and memory, living economy and trade network, world history and legacy, player experience intelligence, intelligent balancing, asset pipeline, world population director, content quality control, GAME EVOLUTION LAB dashboard section, continuous completion roadmap. The intended ecosystem is FOUR capabilities, CONNECTED, not four competing systems. |
| §59 | ASHFALL — MUSE SELF-EVOLUTION ENGINE | 2026-11-07 | Inspect/improve/maintain/evolve Muse's own development infrastructure. The three files first: `MUSE_SOUL.md` (operating constitution), `MUSE_EVOLUTION.md` (versioned self-improving instructions), `CONTINUE_ASHFALL.md` (exact persistent resume point). **HARD RULE: optimize within legitimate limits — NEVER bypass usage limits, evade billing controls, or conceal resource consumption.** |

## Prompt order (from §55)

1. §53 (Autonomous God-Tier Development Directive).
2. §54 (Dashboard Repair & Automation).
3. §55 (Master Integration Directive).

## Implementation status (from the registry, v1.0)

* §47 PARTIALLY IMPLEMENTED (rule in force as process; no speed measurement vs baseline).
* §48 PARTIALLY IMPLEMENTED (direction adopted; acceptance criteria §48.16 not demonstrated).
* §49 DOCUMENTED ONLY (directive in place; RUN has never been said; no registry/loop).
* §50 PARTIALLY IMPLEMENTED (dashboard live; 10-min cycle and gate automation do not exist).
* §51 DOCUMENTED ONLY (truncated as received; no engine split exists).
* §52 PARTIALLY IMPLEMENTED (audit delivered 2026-11-07; no file removed yet).
* §53 DOCUMENTED ONLY (no governor, creation dashboard, ENGINE_BIBLE, or Evolution Ledger — this doc set now provides the ENGINE_BIBLE, the governor spec, and the ledger spec, but no code).
* §54 PARTIALLY IMPLEMENTED (working copies exist in `studio/dashboard/`; not committed; artifact not wired).
* §55 PARTIALLY IMPLEMENTED (Stage A in progress — the registry + this doc set; Stages A–F not executed).
* §56 DOCUMENTED ONLY (directive text only; zero code hits).
* §57 DOCUMENTED ONLY (no orchestrator, verification intelligence, benchmarking lab, or health score).
* §58 DOCUMENTED ONLY (directive text only).
* §59 PARTIALLY IMPLEMENTED (three files exist; MEMORY CORE / watchdog / modes unverified).

## Maintenance

* Add a row here when a new directive is added to SOUL.md. Do not copy the full directive text into this file — the full text lives in `~/SOUL.md`.
* Update the implementation status when a directive's status changes in the registry (with evidence).
