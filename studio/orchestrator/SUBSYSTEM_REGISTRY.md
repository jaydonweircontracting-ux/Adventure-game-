# Subsystem Registry

**Directive:** SOUL.md §57 §1 (the orchestrator must understand what each subsystem does, what information it needs, what it produces, which systems depend on it, whether it is functioning, what resources it consumes, and whether it is currently improving).
**Source of truth for status:** `studio/IMPLEMENTATION_REGISTRY.md` (88 requirements; counts verified 2026-11-07: 4 COMPLETE AND VERIFIED, 15 IMPLEMENTED BUT UNVERIFIED, 21 PARTIALLY IMPLEMENTED, 9 DOCUMENTED ONLY, 34 NOT IMPLEMENTED, 5 BLOCKED, 0 OBSOLETE OR DUPLICATED). Anything marked unverified here is unverified — do not treat a registry entry as proof of a live system.

## How to read this file

* **Functioning** means the subsystem was observed working (a run, a probe, a served marker, a recorded test) — not merely that its source exists.
* **Improving** means there is a current, active improvement task for it — not merely that it could be improved.
* **Resources** is what the subsystem consumes when it runs (credits, time, disk, environment access).
* Statuses use the registry's vocabulary: COMPLETE AND VERIFIED / IMPLEMENTED BUT UNVERIFIED / PARTIALLY IMPLEMENTED / DOCUMENTED ONLY / NOT IMPLEMENTED / BLOCKED.

## Registered subsystems

### 1. Autonomous Development Engine

* **What it does:** Persistent session controller — continuous execution with checkpoint/resume (OBSERVE → THINK → BUILD → TEST → OPTIMIZE → DOCUMENT → REPEAT).
* **Where:** `scripts/autonomous-engine.mjs` (BUILD 573). There is NO `studio/autonomous-engine/` directory.
* **Needs:** The current checkpoint (`CONTINUE_ASHFALL.md` / `docs/sessions/current.json`), the prioritized backlog, git (it calls `git rev-parse HEAD`).
* **Produces:** Session state in `docs/sessions/current.json`, continuous development cycles.
* **Depended on by:** The autonomous directives (§49/§50) and RUN mode.
* **Functioning:** UNCERTAIN — it is Oct-era code; the registry's top-10 item #9 says to retire or reconcile it. It depends on git, which is currently EPERM-blocked (re-tested 2026-11-07 ~15:04 PST). It has not been observed running in the current environment. Mark as IMPLEMENTED BUT UNVERIFIED.
* **Resources:** A running process + git access + session disk state.
* **Currently improving:** No active task. Reconciliation is queued (registry top-10 #9).

### 2. Code Evolution Engine (ACEE, §56)

* **What it does:** The engineering subsystem that builds, repairs, optimizes, and evolves ASHFALL itself (Development Genome, code generation machine, multi-agent lab, optimization lab, evolution sandbox).
* **Where:** `studio/acee/` — PRESENT on disk as of 2026-11-07 ~15:15 PST (10 files, 116,568 bytes, parent-verified).
* **Needs:** The registry, the legacy audit, the codebase, the dashboard data.
* **Produces:** (Intended) generated/optimized code, evolution scores, architecture health checks.
* **Depended on by:** The §57 final evolution target (one autonomous code-generation engine).
* **Functioning:** NO — the files exist and were inspected, but ACEE as a running engine is DOCUMENTED ONLY (Phase 1 partially done, Phases 2–7 not started). Do not claim it functions.
* **Resources:** (Intended) credits per generation/optimization cycle; a sandbox for experiments.
* **Currently improving:** Files created 2026-11-07; the machine-readable genome index (Phase 1 remainder) is the next ACEE build.

### 3. Game Evolution Engine (AGEE, §58)

* **What it does:** Decides what the game needs (world content factory, emergent stories, quest generation/validation, NPC personality/memory, living economy, world history, player-experience intelligence, balancing, asset pipeline, population director, content QC).
* **Where:** `studio/agee/` — PRESENT on disk as of 2026-11-07 ~15:13 PST (15 files, 96,177 bytes, parent-verified).
* **Needs:** The registry, the 3D game systems, the world sim, the dashboard data.
* **Produces:** (Intended) game content and gameplay improvements, validated by the verification engine.
* **Depended on by:** The §57 final evolution target (continuous game evolution).
* **Functioning:** NO — the files exist and were inspected, but AGEE as a running engine is DOCUMENTED ONLY (D7). The subsystems depend on the queue order (1030 → 1031 → 1032 → Stages 2–6 → the RPG systems G11/G12/G13/G14). Do not claim it functions.
* **Resources:** (Intended) credits per content-generation cycle; playtest/sim time.
* **Currently improving:** Files created 2026-11-07; the first AGEE subsystem build waits for the queue to advance.

### 4. Development Genome

* **What it does:** The project-wide intelligence graph (the continuously updated record of the architecture, systems, dependencies, decisions, and measurements).
* **Where:** `studio/genome/` — `scanner.mjs` (builds it), `genome.json` (the index), `query.mjs` (query CLI), `run-cycle.mjs` (task loop). Built 2026-11-07 (Phase 1).
* **Needs:** The registry, the legacy audit, the codebase, the dashboard data, the development history.
* **Produces:** A queryable graph of what the project is and how it fits together (442 files, 4,767 symbols, 782 import edges, 88 requirements, 12 duplicate systems, 6 cycles).
* **Depended on by:** ACEE, the recursive engine, the orchestrator, the verification intelligence.
* **Functioning:** YES (v1, 2026-11-07, Phase 1) — the scanner validates (audit counts MATCH 45/104/56/41/2, 0 unresolved imports, markers agree 1030); `query.mjs` answers status / depends-on / blast-radius / implements / duplicates / cycles / remove / next-task / search. Not yet continuously updated by automation — the scanner is run by hand (or by `run-cycle.mjs`) until the orchestrator schedules it.
* **Resources:** Full scan ~7.6s, incremental <5s target; `genome.json` ~932 KB.
* **Currently improving:** Yes — Phase 1 built v1 (2026-11-07). Remaining: wire the orchestrator to schedule the scanner on repo changes; runtime telemetry and embeddings are gaps.

### 5. Live Development Dashboard (artifact)

* **What it does:** The phone-friendly view of what was completed, what changed, what is being developed, and what comes next (last verified checkpoint, queue, filterable build ledger, Stage 1 baseline, Stage 2–6 plan, known issues, studio section).
* **Where:** Artifact `ashfall-development-dashboard` (live).
* **Needs:** `studio/dashboard/dashboard-data.json` (intended source of truth — not yet wired; the artifact currently carries its own hard-coded content).
* **Produces:** The user-facing development view.
* **Depended on by:** The user's situational awareness; the §50 checkpoint-reporting requirement.
* **Functioning:** YES — verified by the parent 2026-11-07 ~14:16 PST (audit pass: no console errors, no broken assets, no text issues, no phone-width overflow; the Verified ledger filter works). The registry records it as IMPLEMENTED BUT UNVERIFIED only because its contents could not be directly inspected inside the subagent sessions — that is a limitation of the audit, not of the dashboard.
* **Resources:** Artifact hosting; a manual `artifact.edit` at each verified checkpoint.
* **Currently improving:** Yes — the §54 dashboard repair (wiring it to the JSON data) is the next bounded task once git can write.

### 6. Dashboard Data (`studio/dashboard/`)

* **What it does:** The permanent, GitHub-synced dashboard records: current state, schema, instructions, dated snapshots, build ledger, verification history, development history.
* **Where:** `studio/dashboard/dashboard-data.json`, `dashboard-schema.json`, `README.md`, `MUSE_INSTRUCTIONS.md`, `snapshots/2026-11-07.json`, `history/build-ledger.json`, `history/verification-history.json`, `history/development-history.json`.
* **Needs:** GitHub commit history (for hash verification), verification records, the Stage 1 baseline.
* **Produces:** The data the dashboard reads (once wired); the permanent development record that survives memory corruption.
* **Depended on by:** The dashboard artifact (once wired), the registry's next update, the health score, the continuation protocol.
* **Functioning:** PARTIALLY — the files exist, all JSON is validated, commit hashes are verified against `git log`, and an honesty-gap fix was applied 2026-11-07 ~15:05 PST (gate level 4 → 3 for builds 1016–1029; verifiedAt null for 1016–1025). The wiring (dashboard reads from these files) is NOT done.
* **Resources:** File writes (node `writeFileSync` works; git cannot write yet, so the files are uncommitted working-tree copies).
* **Currently improving:** Yes — the wiring is the §54 task; the honesty-gap fix is recorded in `history/development-history.json` (14 events).

### 7. Master Implementation Registry

* **What it does:** The classification of every requirement (88) as COMPLETE AND VERIFIED / IMPLEMENTED BUT UNVERIFIED / PARTIALLY IMPLEMENTED / DOCUMENTED ONLY / NOT IMPLEMENTED / BLOCKED / OBSOLETE OR DUPLICATED, each with purpose, implementation, dependencies, what remains, responsible files, how tested, and completion criteria.
* **Where:** `studio/IMPLEMENTATION_REGISTRY.md` (1,016 lines, 145,576 bytes).
* **Needs:** The directives (§47–§59), the codebase, the dashboard data, the legacy audit, the dated logs.
* **Produces:** The source of truth for what actually exists vs what is only documented.
* **Depended on by:** The orchestrator, the recursive engine, the health score, the task scheduler, the continuation protocol, ACEE, AGEE.
* **Functioning:** YES as a record — verified mechanically (88 summary rows, 88 sections, counts match the counts table). It is not itself a game system; it is the record. Its next update trigger is BUILD 1030 landing.
* **Resources:** Read-only audit time (three parallel subagents); no runtime cost.
* **Currently improving:** No — it is current as of 2026-11-07 ~15:02 PST. It must be updated when 1030 lands (Q1 → COMPLETE AND VERIFIED, queue advances).

### 8. Legacy Codebase Audit

* **What it does:** The classification of every 2D/2.5D file (248 `.ts/.tsx`) by actual dependency: A required by 3D (47), B reusable gameplay logic (104), C reusable content/assets (56), D obsolete verified (41 code + 2 assets), E unknown (2 code + 3 server `.js` + asset dirs).
* **Where:** `studio/LEGACY_AUDIT.md` (37,514 bytes, 230 lines).
* **Needs:** The codebase (import graph, dynamic imports, save keys, asset references, build scripts).
* **Produces:** The safe-removal order (Wave 1: 8 code + 2 assets, unambiguous dead; Wave 2: 10 sim-only utilities; Wave 3: 23 CONTESTED — user product decision per cluster) + the extraction priorities (townsfolk.ts, worldCore.ts clock, one tile-A* core, combat, quests, items/economy, one worldgen, unify stamina, unify saves, shared engine utils).
* **Depended on by:** The cleanup engine, the architecture work, ACEE, the §52 FINAL COMMAND.
* **Functioning:** YES — COMPLETE AND VERIFIED (registry S26). Its headline finding reframes §48: the 3D game is NOT the game that ships today (GraphicsModeHost always boots 2.5D; Engine3DWorldView has no combat/quests/dialogue/shops/inventory/2.5D-save support). Deleting everything "2D/2.5D" today would delete the game.
* **Resources:** Read-only audit time. No runtime cost.
* **Currently improving:** No — it is a completed audit. Its Wave 1 removal executes once git can write (with the §52 11-step procedure + tsc/build/sim/phone probe).

### 9. Sim Suite (`scripts/simulate.ts`)

* **What it does:** 41k+ assertions over `src/game` modules (the regression net for pure modules).
* **Where:** `scripts/simulate.ts`, run by bundling with the local esbuild binary.
* **Needs:** The source modules, the tsconfig `@/` alias, the game sprites, `public/mobs`.
* **Produces:** A pass/fail log + normalized log for diffing against a pristine baseline.
* **Depended on by:** Every build's verification (sim vs pristine baseline must be identical, 0 FAIL).
* **Functioning:** PARTIALLY — it runs and catches regressions, but it has the known 684 rig crash (`assetMetaFor` returns null for 5 variants — cottage-wide, hall-grand, house-balcony, house-tall, shop-banner; ~1,000 sim lines after the rig section are unverified). The fix awaits the user's word. Pristine worktrees live under `/home/hatch/` (never `/tmp` — 512 MB tmpfs).
* **Resources:** esbuild bundling + node runtime; a pristine worktree per baseline.
* **Currently improving:** No active task. The 684 fix is registry top-10 item #5.

### 10. Standalone Asserts (`~/workspace/verify<BUILD>/`)

* **What it does:** Throwing assert files that prove a build's pure-function behavior (entry + runner checks), run directly with node (no pipe, no `&&` chain — a piped run once returned a false failure).
* **Where:** `~/workspace/verify<BUILD>/` (outside the repo; per-build directories).
* **Needs:** The built/bundled pure modules (esbuild must be able to write the bundle — currently blocked by the environment EPERM for the parent's re-run).
* **Produces:** PASS/FAIL per check (1030: 97 entry + 47 runner checks PASS on the agent's run ~15:04).
* **Depended on by:** Every build's Level 1/Level 2 gates.
* **Functioning:** YES for the agent's run; the parent's re-run of `asserts1030.mjs` is BLOCKED (esbuild cannot write the bundle: operation not permitted). The asserts rest on the agent's passing run.
* **Resources:** esbuild + node; a bundle file per run.
* **Currently improving:** No.

### 11. Phone Probe (Playwright, 390×844)

* **What it does:** Real-game testing in a phone-sized viewport: serve `dist/public` on port 8901, drive the game through menu → New Game → character → "Begin Adventure", then exercise the feature with real taps and read `window.__gameTest` hooks.
* **Where:** Probe scripts in `~/workspace/verify<BUILD>/` (e.g. `probe1030-after.mjs` is ready).
* **Needs:** A local vite dev server or the deployed build, Chromium, the game past the main menu.
* **Produces:** Screenshots + measured behavior (speeds, positions, messages) + 0-page-errors evidence.
* **Depended on by:** Every build's Level 3 (VERIFIED) gate.
* **Functioning:** NO — BLOCKED. Chromium will not launch (SIGTRAP ~100ms after launch; 8 variants tried; the binary itself works — `--version` and `--dump-dom about:blank` exit 0; the 1028 probe used the same Chromium successfully earlier on 2026-11-07). The probe script for 1030 is ready and waiting.
* **Resources:** Chromium + a local HTTP server (kill by PID, never `pkill -f "http.server 8901"` — it matches its own command line).
* **Currently improving:** No — it waits for the environment to clear.

### 12. Live Verification (content markers)

* **What it does:** Proves a build is live by reading the served `version.json` (build number + note) and the served `?v=<BUILD>` index (`window.__AG_BUILD`). Never bundle filenames (CI and local builds produce different hashes for identical source).
* **Where:** A procedure (public GitHub Actions API for deploy diagnosis; served-marker reads for confirmation).
* **Needs:** A pushed commit + a completed Pages deploy (~2–3 min lag normally).
* **Produces:** The live-confirmed verdict (1026–1029 all verified live; 1029 served version.json 2026-11-07T21:37:14.339Z, run 42416626999).
* **Depended on by:** Every build's Level 3 (VERIFIED) gate and the last-verified-checkpoint update.
* **Functioning:** YES as a procedure. Currently BLOCKED for 1030 (no commit/push yet — git EPERM).
* **Resources:** Public API reads; no credentials.
* **Currently improving:** No.

### 13. Memory (~/MEMORY.md + dated logs + studio/)

* **What it does:** The durable record of facts, preferences, decisions, and per-build detail.
* **Where:** `~/MEMORY.md` (curated), `~/memory/YYYY-MM-DD.md` (dated logs, append-only), `studio/` (GitHub is the permanent record).
* **Needs:** Accurate recording after every meaningful operation; grep the current text before editing (background jobs rewrite MEMORY.md constantly).
* **Produces:** The context a fresh session reads to resume.
* **Depended on by:** Every session, the continuation protocol, the advanced memory.
* **Functioning:** YES, with a recorded incident: MEMORY.md was truncated to 0 bytes on 2026-11-07 ~15:16 PST by a failed `open('w')` write (EPERM); restored from the injected context copy + dated logs (32,172 bytes, verified). Rule now: never use a truncating write on a memory file; use the runtime file API or write-to-temp-then-atomic-replace.
* **Resources:** File writes (runtime API works; node `writeFileSync` and `cp` also work — tested 2026-11-07 ~15:05 PST).
* **Currently improving:** Yes — the §54 memory protection (atomic writes, backups, schema validation, recovery from the last valid snapshot) and the §57 §5 advanced memory (not yet built).

### 14. Operating Files (soul / evolution / resume point)

* **What they do:** `MUSE_SOUL.md` is the permanent operating constitution (12 principles). `MUSE_EVOLUTION.md` is the versioned self-improving instructions (currently v1.1 — the gate-evidence rule, added 2026-11-07). `CONTINUE_ASHFALL.md` is the exact persistent resume point (current status, active task, last verified checkpoint, queue, next exact action with commands).
* **Where:** `studio/MUSE_SOUL.md`, `studio/MUSE_EVOLUTION.md`, `studio/CONTINUE_ASHFALL.md`.
* **Needs:** Updating every meaningful cycle.
* **Produces:** Continuity across sessions, credits, and interruptions.
* **Depended on by:** The continuation protocol, every fresh session, the recursive engine.
* **Functioning:** YES as documents (they exist, are current as of 2026-11-07 ~15:07 PST, and are the resume point). They are IMPLEMENTED BUT UNVERIFIED in the registry (they are records, not live-verified systems).
* **Resources:** File writes.
* **Currently improving:** Yes — `CONTINUE_ASHFALL.md` is updated every meaningful cycle; `MUSE_EVOLUTION.md` gains a versioned revision when an evaluation produces one (v1.1 is the first).

### 15. The 3D Game (Engine3DWorldView + engine3d/)

* **What it does:** The 3D game — the primary version of ASHFALL per §48 (custom WebGL, vertex-colour triangles only, no normals/textures/alpha blending).
* **Where:** `src/game/engine3d/` (not a studio/ file; listed here because the orchestrator coordinates its development).
* **Needs:** The 2.5D systems it reuses (isoWorld, mosslightLayout, townsfolk slice, dayNight), the Build menus, the save keys (`ag-3d-*`).
* **Produces:** The playable 3D demo world (centre C=100, authored map 200×200, plaza (102,102), player start (99,105)).
* **Depended on by:** Every 3D build (1011–1032, Stages 1–6).
* **Functioning:** PARTIALLY — it renders and plays (29 huts, 224 trees, 118 crates, 131 rocks, 47 NPCs in the Stage 1 baseline), but it is a demo, not the shipped game: it has no combat, quests, dialogue, shops, inventory, or 2.5D-save support, and `GraphicsModeHost` always boots 2.5D. The registry records its systems as IMPLEMENTED BUT UNVERIFIED or PARTIALLY IMPLEMENTED.
* **Resources:** The world buffer (237,222 verts town / 266,000 wild — 89% of the 300k budget), rebuild ~165–211ms, live hitch 566.6ms on a 50-tile teleport.
* **Currently improving:** Yes — the active queue (1030 → 1031 → 1032 → Stages 2–6) is all 3D work.

## Gaps this registry exposes

* **The Development Genome exists (v1, 2026-11-07, Phase 1).** `studio/genome/` — 442 files, 4,767 symbols, 782 edges, validated. ACEE and the recursive engine can now build on it. Remaining: orchestrator-scheduled updates (currently run by hand) + runtime telemetry + embeddings.
* **ACEE and AGEE are now on disk** (verified by the parent 2026-11-07 ~15:13–15:15 PST: `studio/acee/` 10 files, 116,568 bytes; `studio/agee/` 15 files, 96,177 bytes; both inspected). They are specifications (DOCUMENTED ONLY as running engines), not automation — do not depend on them as functioning systems until they are built in code. (Correction applied by the parent 2026-11-07 ~15:16 PST; the orchestrator agent checked before they landed.)
* **The autonomous engine is stale and unobserved.** Retire or reconcile it (registry top-10 #9) before building more on top of it.
* **The dashboard is not wired to its data.** The artifact still carries hard-coded content.
* **The phone probe is environment-blocked.** Level 3 verification cannot run until Chromium launches again.
* **The sim has the 684 rig crash.** ~1,000 sim lines per build are unverified until it is fixed or formally accepted.
