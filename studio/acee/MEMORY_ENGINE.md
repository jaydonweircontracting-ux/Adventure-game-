# Development Memory and Knowledge Engine

**Status:** Specification. Version 1.0 — 2026-11-07.
**Directive:** SOUL.md §56 §11 (Create a development memory and knowledge engine).
**Location:** `studio/acee/MEMORY_ENGINE.md` (this file).

## What the engine stores

Persistent memory that understands what has been built, why it was built, where it exists, what depends on it, what failed, what succeeded, what remains incomplete, which approaches were rejected, and which optimizations worked. Store useful information in structured, version-controlled records.

| Store | What it holds | Format | Location |
|---|---|---|---|
| **Master registry** | The 88 requirements, each with purpose, implementation, dependencies, what remains, responsible files, how tested, completion criteria, and status (COMPLETE AND VERIFIED / IMPLEMENTED BUT UNVERIFIED / PARTIALLY IMPLEMENTED / DOCUMENTED ONLY / NOT IMPLEMENTED / BLOCKED / OBSOLETE OR DUPLICATED). | Markdown | `studio/IMPLEMENTATION_REGISTRY.md` |
| **Build ledger** | Every build: number, objective, description, files affected, commit hash, previous checkpoint, test results, quality-gate results, performance measurements, verification timestamp, status. Historical entries are never overwritten. | JSON | `studio/dashboard/history/build-ledger.json` |
| **Verification history** | Verification records: build, commit, timestamp, run ID, result. | JSON | `studio/dashboard/history/verification-history.json` |
| **Development history** | Directives added, audits, dashboard creation, incidents, decisions, corrections (including the 2026-11-07 honesty-gap fix). | JSON | `studio/dashboard/history/development-history.json` |
| **Dashboard data** | The current state: last verified checkpoint, active build, build queue, build history, quality gates, stage progress, stage risks, measured baselines, known issues, verification history, links, directives, teams, last update timestamp. | JSON (schema-validated) | `studio/dashboard/dashboard-data.json` (+ `dashboard-schema.json`) |
| **Dated logs** | The append-only detail: per-build reports, decisions, failures, measurements, user orders, in the order they happened. | Markdown | `~/memory/YYYY-MM-DD.md` |
| **Curated memory** | The durable facts, preferences, and commitments (the user, the game, the standing rules, the queue). | Markdown | `~/MEMORY.md` |
| **Operating files** | The constitution (`MUSE_SOUL.md`), the versioned instructions (`MUSE_EVOLUTION.md`, now v1.1), the resume point (`CONTINUE_ASHFALL.md`). | Markdown | `studio/` |
| **Architecture map** | How to operate in the workspace: conventions, lessons, the file map, the deployment-verification lessons. | Markdown | `~/AGENTS.md` |
| **Legacy audit** | The 248-file classification (A–E), the removal waves, the duplicate systems, the extraction priorities. | Markdown | `studio/LEGACY_AUDIT.md` |
| **Directives** | SOUL.md §47–§59 (speed, 3D direction, autonomous development, autonomous evolution, ultimate engineering, god-tier engineering, autonomous god-tier, dashboard repair, master integration, code evolution machine, next evolution layer, game evolution engine, self-evolution). | Markdown | `~/SOUL.md` (9,286 lines) |
| **Evolution ledger** | Which instructions produce the best results, which create unnecessary work, which waste credits, which repeatedly fail, which tools are underutilized, which practices create regressions. Versioned revisions with test results. | Markdown | `studio/MUSE_EVOLUTION.md` |

## How it is retrieved (only what's relevant)

Use retrieval to supply relevant information to agents instead of repeatedly feeding the entire project history into every task.

* **Search first, then read the source.** `muse.memory_search` with 2–3 close recall phrasings; read the cited source (the registry, the ledger, the dated log) — a summary does not replace the source. After compaction, re-read the relevant skill and connector documents before continuing.
* **Retrieve only what's relevant to the task.** A build agent for 1031 needs the 1031 cause + the 1008/1027 subdivision pattern + the `Engine3DWorldView.tsx` far-cell code — not the whole registry. A build agent for Stage 2 needs the Stage 1 baseline + the heightfield risk flag — not the drywall quote.
* **Never feed the entire project history into every task.** The genome (`DEVELOPMENT_GENOME.md`) exists so an agent can query "what depends on X" instead of re-reading the repo. The registry exists so an agent can look up a requirement's status instead of re-auditing it.
* **Create automatic knowledge compression and indexing.** The dated logs are the raw detail; MEMORY.md is the compressed curated record; the dashboard data is the machine-readable index. Each layer compresses the one below it, and each layer points at the one below it for detail.

## How it is updated

After every meaningful operation: complete → test → quality gates → record results + commit hash → update ledger/queue/stages/issues → dated checkpoint on verification success. Concretely:

1. Complete the development task.
2. Run applicable tests.
3. Run the required quality gates.
4. Record actual results (never fabricated).
5. Record the commit hash (verified against GitHub; null when no commit exists).
6. Update the build ledger (append, never overwrite a previous verified build).
7. Update the active queue and stage progress in the dashboard data.
8. Record new issues.
9. Create a dated checkpoint (a new file in `studio/dashboard/snapshots/`) when verification succeeds.
10. Update `lastUpdateTimestamp` and the resume point (`studio/CONTINUE_ASHFALL.md`).

The three operating files are updated every meaningful cycle: the constitution only by a versioned revision, the evolution log on every process learning, the resume point on every status change. A fresh session reads `CONTINUE_ASHFALL.md` and continues without the user re-explaining the project.

## Backup and validation rules (§54 — written after the MEMORY.md incident)

On 2026-11-07 a failed write (`open('w')` truncated the file, then the write failed with EPERM) left `~/MEMORY.md` at 0 bytes. It was restored from the injected context copy + dated logs (32,172 bytes, verified). That incident is why these rules exist — and why GitHub holds the permanent records, not a single mutable file.

* **Atomic writes.** Before replacing dashboard data: validate the existing file against the schema → save a backup → write the replacement to a temporary file → validate the replacement → atomically replace the original → verify the result. If anything fails, retain the previous valid version.
* **JSON schema validation.** Every dashboard data file validates against `studio/dashboard/dashboard-schema.json` before it is used. A file that fails validation is not used.
* **Backups.** A backup is saved before every replacement. Snapshots (`studio/dashboard/snapshots/`) are dated and never overwritten; new snapshots are added alongside.
* **Recovery from the last valid snapshot.** If `dashboard-data.json` is corrupt or missing, restore from the latest valid snapshot (validate it first). If a snapshot is corrupt, fall back to the previous snapshot, then to the build ledger + verification history (which together reconstruct the build history).
* **Corruption / missing-file / duplicate detection.** Validate against the schema (corruption); check that every file listed in the dashboard README exists (missing); check that build numbers are unique in the ledger (duplicates — preserve both entries and flag the discrepancy, do not silently delete one).
* **Never leave the dashboard without a recoverable data source.** Never silently replace dashboard data. Never delete historical development records.
* **What actually writes reliably here.** The runtime file API (`muse.write` / `muse.edit`) works reliably. Node `writeFileSync` and `cp` also work (tested 2026-11-07). What fails: git's writes (temp objects opened with mode 0444, then `write()` returns EPERM on overlayfs), vite's local build (copy_file_range budget, then EPERM), and python's `open('w')` (truncated MEMORY.md, then failed). Never use a truncating write on a memory file.

## What the engine does NOT do

* **It does not invent.** Never fabricate a commit hash, a verification result, a build number, or a measurement. Label unsupported records as requiring verification. (The 2026-11-07 honesty-gap fix: dashboard data had claimed Level 4 for builds 1016–1029 with no per-build Level-4 evidence, and used midnight placeholders for 1016–1025 verification timestamps. It was corrected to Level 3 + null timestamps, and the correction was recorded. The rule is now v1.1 in `MUSE_EVOLUTION.md`: never claim a gate level without a per-build evidence record; never use a placeholder timestamp.)
* **It does not keep three copies of the same truth.** The genome is the *code* graph, MEMORY CORE (§59) is the *operating* memory, and the dashboard data is the *record*. They are three views of the same project. The overlap between §56's memory engine, §57's advanced memory, §59's MEMORY CORE, and the dashboard data is flagged in the registry and NOT adjudicated here — adjudication is Stage A follow-up. Until then, the dashboard data is the machine-readable source of truth for builds/gates/stages, and the registry is the source of truth for requirement status.
* **It does not discard important decisions.** Never discard important architectural decisions or historical checkpoints. A rejected approach is archived with its reason (the sandbox's rule); a failed implementation is recorded with its cause (the factory's rule); a corrected overclaim is recorded with the correction (the honesty-gap fix).
