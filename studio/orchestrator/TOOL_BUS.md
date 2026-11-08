# Development API and Tool Bus

**Directive:** SOUL.md §57 §7.
**What already exists:** The tools themselves — `muse.*` (exec, read, write, edit, memory), the esbuild binary (`./node_modules/.bin/esbuild`), the sim (`scripts/simulate.ts`), the Playwright harness, the GitHub public API (for deploy diagnosis), the REA client (`~/workspace/custom-connectors/custom.rea/bin/client.py`), and the connector docs (`/opt/hatch/connectors/`, `~/workspace/custom-connectors/`). This file adds the bus: the interfaces between subsystems, the routing rules, and the provider-independence rule. It does not replace any tool — it is the contract that lets subsystems call each other without knowing each other's internals.

## The interfaces

Every major subsystem communicates through a defined interface. The interface is the contract; the implementation behind it can change without breaking callers.

| Interface | What it does | Current implementation (where it exists) | Status |
|---|---|---|---|
| Repository search | Find code, symbols, and references without a full re-scan | `muse.exec` with `grep`/`rg`; the registry + legacy audit as indexes | Manual. No unified search API. TO-BE-BUILT. |
| Symbol lookup | Resolve a symbol to its definition and its importers | The legacy audit's import graph (a snapshot at 1029) | Snapshot only. TO-BE-BUILT as a live tool. |
| Dependency analysis | What a change actually touches (importers, save keys, build scripts) | The legacy audit's method (static import-graph + dynamic-import + save-key + asset-reference scan) | A method, not a tool. TO-BE-BUILT. |
| File creation | Create a file in the right place, with the right content | `muse.write` (runtime file API — works reliably); node `writeFileSync` (works — tested 2026-11-07 ~15:05 PST) | Working. |
| File modification | Edit a file precisely, without truncating it | `muse.edit` (works reliably). Never a truncating `open('w')` on a memory file. | Working. |
| Code generation | Generate code from a brief | Subagents (the build agents) + ACEE (`studio/acee/` — in creation) | Subagents working; ACEE not on disk yet. |
| Compilation | Type-check and build | `tsc --noEmit` (works, read-only); vite build (local build blocked by the copy_file_range budget; GitHub Actions deploy builds unaffected) | Partially blocked (environment). |
| Testing | Run the sim, the asserts, the probe | `scripts/simulate.ts` + esbuild; `~/workspace/verify<BUILD>/` asserts; Playwright probe (BLOCKED — Chromium SIGTRAP) | Partially blocked (environment). |
| Benchmarking | Measure against the baseline | The Stage 1 method (headless + live probe). See `BENCHMARKING.md`. | Manual. TO-BE-AUTOMATED. |
| Screenshot analysis | Evaluate a screenshot / capture | Manual (the parent views screenshots; the 1030 probe saves them to `verify1030/after/`) | Manual. The visual intelligence engine (`VISUAL_INTELLIGENCE.md`) is the automation target. |
| Documentation updates | Update the registry, the dashboard data, MEMORY.md, the dated logs | Manual (muse.edit + node for JSON). The §54 procedure (atomic writes, backups, validation) governs the dashboard data. | Manual. |
| Checkpoint management | Save/restore a verified checkpoint | Git (blocked for writes — EPERM); `studio/dashboard/snapshots/` (dated JSON snapshots); `studio/CONTINUE_ASHFALL.md` (the resume point) | Partially blocked (git). |
| Git operations | Status, log, commit, push, worktree | `git log` / `git ls-remote` work (read-only). `git status` / `git add` / `git commit` / `git push` FAIL (EPERM — cannot create `.git/index.lock` or write loose objects; re-tested 2026-11-07 ~15:04 PST). | Blocked for writes (environment). |

## Routing (which model/tool for which task)

The system routes different tasks to different models/tools based on: reasoning requirements, coding ability, context requirements, speed, cost, and availability. (§57 §7.)

* **Routine operations** (small edits, grep, validation, JSON updates): the smallest, fastest tool that can do the job. Do not spend a large model's context on a one-line edit.
* **Difficult architecture and debugging**: the strongest reasoning available, with the full relevant context (the registry entry + the legacy audit + the dated log + the file).
* **Read-only audits**: parallel subagents (they do not touch the tree — the legacy audit + the master integration audit ran in parallel safely).
* **Code builds**: one code agent at a time on the shared checkout (the file-ownership rule — see `TASK_SCHEDULER.md`).
* **Verification**: a separate process from generation (see `VERIFICATION_INTELLIGENCE.md`) — never the same agent that wrote the code.

## Provider independence (the hard rule)

**Never assume an external model, API, GPU, quantum processor, or service is available until it has been configured and tested.** (§57 §7.)

* No subsystem may depend on an unconfigured external service. If a service is not configured and tested, the subsystem must work without it (local fallback) or be marked NOT IMPLEMENTED.
* Adapters for external AI models and development tools are created where supported — but an adapter is not a dependency. The system must be able to route a task to a local model where practical.
* Keep the architecture provider-independent so future AI technologies can be integrated without rewriting the entire development engine. (This is why the bus is interfaces, not implementations.)
* The quantum-inspired optimization in ACEE (§56) is explicitly classical (simulated annealing, genetic algorithms, evolutionary optimization) — never pretend classical computers are quantum computers. A quantum processor is not assumed to exist.

## Current state

The tool bus as a unified interface does NOT exist yet — this file is its specification. What exists: the tools (listed above), the routing rules (practiced by the parent), and the provider-independence rule (stated in §57 §7 and in `MUSE_SOUL.md`). What is missing: the unified interface definitions (the table above is the specification, not an implementation), the adapters, and the automatic routing. The first tool-bus task is the repository-search + symbol-lookup + dependency-analysis trio — they are the three interfaces every other subsystem needs, and they are currently manual grep.
