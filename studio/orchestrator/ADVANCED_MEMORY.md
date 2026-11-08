# Advanced Development Memory

**Directive:** SOUL.md §57 §5 (build the advanced development memory) and §59 (MUSE MEMORY CORE).
**What already exists:** `~/MEMORY.md` (the curated long-term memory), `~/memory/YYYY-MM-DD.md` (dated logs, append-only, per-build detail), `studio/MUSE_SOUL.md` (the operating constitution), `studio/MUSE_EVOLUTION.md` (v1.1, versioned instructions + revision log), `studio/CONTINUE_ASHFALL.md` (the exact resume point), `studio/IMPLEMENTATION_REGISTRY.md` (the 88-requirement source of truth), `studio/dashboard/` (the permanent GitHub-synced records), and the `~/dreams/alignment/` synthesis. This file adds the advanced memory system: structured categories, semantic retrieval, and integrity verification. It does not replace the existing memory — it organizes it and makes it retrievable.

## The problem it solves

Do not depend on one enormous context document. `~/MEMORY.md` is already 60,565+ bytes and is rewritten constantly by background jobs (which is why it was truncated to 0 bytes on 2026-11-07 ~15:16 PST by a failed `open('w')` write — restored from the injected context copy + dated logs). A single mutable file is a single point of failure. The advanced memory splits knowledge into structured, searchable categories, retrieves only what is relevant to the task, and verifies its own integrity.

## Structured categories

From §57 §5 and §59 (MUSE MEMORY CORE). Each category is a separate store, not a section of one file.

| Category | What it holds | Where it lives today (until the advanced memory is built) |
|---|---|---|
| Project memory | Durable facts, preferences, commitments, standing decisions | `~/MEMORY.md` (curated) |
| Session memory | What the current session did, in order | `~/memory/YYYY-MM-DD.md` (dated logs) |
| Next action | The exact next step, with commands | `studio/CONTINUE_ASHFALL.md` ("Next exact action") |
| Completed work | Landed builds with commit hash + live verification | `studio/dashboard/history/build-ledger.json` + `verification-history.json` |
| Failed attempts | What failed, why, and what not to retry | `studio/MUSE_EVOLUTION.md` (revision log + known gaps) + the dated logs |
| Architectural knowledge | The architecture map, the legacy audit's classifications, the extraction priorities | `~/AGENTS.md` + `studio/LEGACY_AUDIT.md` |
| Optimization history | Baselines, measurements, what improved and what regressed | `studio/dashboard/dashboard-data.json` (`measuredBaselines`) + `BENCHMARKING.md` |
| Active tasks | The queue in order + the registry's top-10 | `studio/CONTINUE_ASHFALL.md` + `studio/IMPLEMENTATION_REGISTRY.md` |
| Resource history | Credits/time per build (currently unmeasured — see `RESOURCE_INTELLIGENCE.md`) | TO-BE-CREATED |
| Session checkpoints | Dated snapshots of the dashboard state | `studio/dashboard/snapshots/` |
| System memory | How each subsystem works, its status, its dependencies | `studio/orchestrator/SUBSYSTEM_REGISTRY.md` (this directory) |
| Implementation history | Per-build detail (what changed, what was tested, what broke) | `~/memory/YYYY-MM-DD.md` (dated logs) |
| Bug history | Open issues, their causes, their status | `studio/dashboard/dashboard-data.json` (`knownIssues`, 9 entries) |
| Experiment history | Research experiments, their baselines, their results | TO-BE-CREATED (see `RESEARCH_ENGINE.md`) |
| Design decisions | Decisions and their reasons (including rejected approaches) | `~/MEMORY.md` + the dated logs (scattered — a gap) |
| Rejected approaches | What was tried and rejected, and why | `studio/MUSE_EVOLUTION.md` (revision log) + the dated logs (scattered — a gap) |
| Outstanding work | Everything not yet done, in priority order | `studio/IMPLEMENTATION_REGISTRY.md` (34 NOT IMPLEMENTED + 21 PARTIALLY IMPLEMENTED + 5 BLOCKED) |
| Agent knowledge | What each agent learned (harness landmines, probe lessons, push lessons) | `~/AGENTS.md` (lessons) + the dated logs |

## Semantic retrieval (retrieve only what's relevant)

* **Before starting a task, retrieve only the information relevant to that task.** A build agent for 1031 (blue squares) needs: the 1031 cause (wild lakes centre-sampled as whole far cells), the 1008 dirt-subdivision pattern, the far-cell code in `Engine3DWorldView.tsx`, and the 1030 state (same file, sequencing). It does not need the drywall quote, the REA program, or the §58 AGEE design.
* **Dependency-aware context selection.** Retrieve the task's files + their importers + their tests + the relevant registry entries + the relevant dated-log section. The Development Genome (`studio/genome/`, v1 2026-11-07) is the retrieval index: `query.mjs` depends-on / blast-radius / implements / search. The registry's "responsible files" field and the legacy audit's "depended-by" field are its sources.
* **After finishing a task, save useful discoveries.** The build agent's report becomes a dated-log entry; a new harness landmine becomes an `~/AGENTS.md` lesson; a process failure becomes a `MUSE_EVOLUTION.md` revision-log entry (v1.1 is the model: the gate-evidence rule came from a real failure).
* **Context compression.** When a session's context grows, the summary must preserve: the last verified checkpoint, the active task, the queue order, the blockers, and the next exact action. It must not drop a blocker (the 1030 git EPERM) or a sequencing constraint (1031 waits for 1030).

## How it connects to the existing memory

* `~/MEMORY.md` remains the curated human-readable record. It is NOT replaced. The advanced memory reads from it; it does not rewrite it.
* The dated logs (`~/memory/YYYY-MM-DD.md`) remain the append-only per-build detail. The advanced memory indexes them by build number and topic; it does not consolidate them into one file.
* The registry (`studio/IMPLEMENTATION_REGISTRY.md`) is the structured index of what exists. The advanced memory uses its IDs (G1–G20, D1–D12, Q0–Q8, R1–R13, S3–S26, T1–T6) as the keys for retrieval.
* The dashboard data (`studio/dashboard/`) is the permanent GitHub-synced record. The advanced memory uses its `buildHistory`, `qualityGates`, `measuredBaselines`, and `knownIssues` as the evidence store.
* `MUSE_EVOLUTION.md` is the versioned instruction store. The advanced memory uses its revision log as the failed-attempts and rejected-approaches store.
* `CONTINUE_ASHFALL.md` is the resume point. The advanced memory uses it as the session-start retrieval: a fresh session reads it first, then pulls only the categories the active task needs.

## Automatic recovery and integrity verification

* **Backups.** The dashboard data has dated snapshots (`studio/dashboard/snapshots/`). The memory categories must have the same: a snapshot before any bulk rewrite.
* **Atomic writes.** Validate the existing file → save a backup → write the replacement to a temp file → validate the replacement → atomically replace → verify. (The §54 procedure, proven by the 2026-11-07 MEMORY.md incident.)
* **Corruption detection.** Validate against the schema (`studio/dashboard/dashboard-schema.json` for the dashboard data). A file that fails validation is not used; the last valid snapshot is restored.
* **Missing-file detection.** Every file the memory depends on must exist; if one is missing, report it and restore from the last valid snapshot.
* **Duplicate detection.** Build numbers must be unique in the ledger; if a duplicate appears, preserve both entries and flag the discrepancy (do not silently delete one).
* **Never a single point of failure.** GitHub (`studio/`) holds the permanent records. A single mutable memory file is never the only source of project information.

## Current state

The advanced memory as a system does NOT exist yet — this file is its specification. What exists: the categories' contents, scattered across `~/MEMORY.md`, the dated logs, `studio/`, and `~/AGENTS.md` (the table above maps each category to its current home). What is missing: the structured stores (especially resource history, experiment history, and a consolidated design-decisions / rejected-approaches store), the retrieval mechanism (currently manual grep + reading), and the automatic integrity verification (currently the §54 procedure for the dashboard data only). The first advanced-memory task is to create the two missing stores (resource history, experiment history) and a retrieval index keyed by registry ID.
