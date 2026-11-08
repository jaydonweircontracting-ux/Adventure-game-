# Independent Verification Intelligence

**Directive:** SOUL.md §57 §3.
**What already exists:** The four quality gates (LEVEL 1 IMPLEMENTED, LEVEL 2 INTEGRATED, LEVEL 3 VERIFIED, LEVEL 4 POLISHED) recorded in `studio/dashboard/dashboard-data.json`; the build-agent gates (tsc, sim vs pristine baseline, standalone asserts, phone probe 390×844, live verify by content marker); the parent verification standard (origin/main top commit + tree clean + served markers + mechanism greps + parent re-runs standalone asserts DIRECTLY); the registry (`studio/IMPLEMENTATION_REGISTRY.md`, which classifies requirements by verification status). This file adds the independent verification layer: the pipeline, the evidence rules, and how it connects to the four gates. It does not replace the gates.

## The rule

**Never allow the same process that generates code to be the only process that declares it successful.** The agent (or subagent) that writes a build does not verify it. Verification is a separate process with separate evidence: the parent re-runs the asserts, diffs the sim against a pristine baseline, and checks the served markers. A subagent completion handoff may falsely claim its report was "already delivered" — if the user never got it, the task is still open, and the parent verifies from git log + live markers + artifacts and delivers the report itself.

## The status pipeline (§57 §3)

```
GENERATED → COMPILED → TESTED → INTEGRATED → VERIFIED → APPROVED
```

A feature cannot be marked verified merely because code was generated successfully. Each status requires its own evidence, and a status is never skipped.

| Status | What it means | Evidence required |
|---|---|---|
| GENERATED | Code exists (written by an agent or a tool) | The files exist in the working tree (or the commit); the diff is inspectable. |
| COMPILED | It type-checks and builds | `tsc --noEmit` exit 0 (real exit code, not a piped/compound command). For a deployable build, the CI build job must also succeed. |
| TESTED | The targeted tests pass | The standalone asserts pass (entry + runner checks, run DIRECTLY — no pipe, no `&&` chain). The numbers are recorded (e.g. 1030: 97 entry + 47 runner checks PASS on the agent's run ~15:04). |
| INTEGRATED | It does not regress the rest of the game | The sim vs a pristine baseline is IDENTICAL (normalized logs diff empty, 0 FAIL). The pristine worktree is fresh for the baseline build (e.g. `/home/hatch/pristine1029` @ `14491c9f` for 1030). The known 684 rig crash is the only permitted pre-existing failure. |
| VERIFIED | It works in the real game, on a real phone | The phone probe (390×844) exercises the feature with real taps and records 0 page errors + the expected behavior (e.g. one tap behind a house arrives; an unreachable tap reports "Path blocked"). Then live verification: the served `version.json` shows the new build and the served `?v=<BUILD>` index contains `window.__AG_BUILD="<BUILD>"`. |
| APPROVED | The user has the verified build | The report is delivered (DONE/TESTED/BROKEN/NEXT + commit hash + play link) and the dashboard is updated at the verified checkpoint. |

## What the verification layer inspects (§57 §3)

* Generated code (does it do what the brief asked, in the existing architecture?).
* Existing dependencies (does it break an importer? the legacy audit's import graph is the reference).
* Interface compatibility (did a shared module's exports, a save key, or a build marker change?).
* Compilation (`tsc --noEmit` + the CI build job).
* Runtime behavior (the phone probe — real taps, real movement, real messages).
* Save compatibility (does an old save load? does a new save round-trip? — 1029's chunk test is the model: place, save, reload, identical).
* Performance (the Stage 1 baseline — see `BENCHMARKING.md`; a build that regresses the baseline is not verified).
* Security (no credentials in the diff; no force-push; no exposed tokens).
* Regression risk (the sim-vs-pristine diff + the assert results).
* Documentation accuracy (does the note, the dashboard data, and the registry say what the code actually does?).

## Verification techniques (§57 §3)

Static analysis, unit tests, integration tests, property-based tests, deterministic simulation, runtime checks, visual comparisons, performance benchmarks. In practice for this project: `tsc`, the standalone asserts (property-style entry checks), the sim (deterministic simulation), the phone probe (runtime checks + visual comparisons via screenshots), and the Stage 1 baseline (performance benchmarks).

## How this connects to the four quality gates

The four gates (in `studio/dashboard/dashboard-data.json`) are the project's gate levels. The pipeline is the evidence path that moves a build through them. The mapping is:

| Gate | Pipeline statuses it covers | Evidence in the dashboard data |
|---|---|---|
| LEVEL 1 — IMPLEMENTED | GENERATED → COMPILED | Gate name, status, timestamp, test/command, result, commit. |
| LEVEL 2 — INTEGRATED | TESTED → INTEGRATED | Assert counts + sim-vs-pristine result (identical / 0 FAIL). |
| LEVEL 3 — VERIFIED | VERIFIED | Phone probe result (0 page errors + expected behavior) + live-verify markers (served version.json build + run ID). |
| LEVEL 4 — POLISHED | VERIFIED → APPROVED (with polish evidence) | A polish pass with its own evidence (visual inspection, game-feel check, edge cases). A build that was verified live but has no recorded polish pass is Level 3, not Level 4. |

The two systems are not duplicates: the gates are the levels a build reaches; the pipeline is the evidence that justifies each level. A gate without pipeline evidence for its level is not passed.

## The honesty rule (MUSE_EVOLUTION.md v1.1 — the gate-evidence rule)

**Never claim a quality-gate level for a build unless a per-build evidence record exists for that gate (gate name, status, timestamp, test/command, result, commit).** A build verified live supports Level 3 (VERIFIED); Level 4 (POLISHED) requires a formal polish gate with its own evidence record. Never use a placeholder timestamp (e.g. midnight) for a verification time — use null when the exact timestamp is not recorded, and note that only the date is known.

This rule was added because the Master Implementation Registry (§55 Stage A, 2026-11-07) found that the dashboard data claimed Level 4 for builds 1016–1029 with no per-build Level-4 evidence, and used midnight placeholders for 1016–1025 verification timestamps. The parent fixed the data (gate level 4 → 3 for 1016–1029; verifiedAt null for 1016–1025; correction recorded in `studio/dashboard/history/development-history.json`, 14 events). The Nov 7 snapshot (`studio/dashboard/snapshots/2026-11-07.json`) was left untouched as the dated historical record.

## Current state (2026-11-07)

* BUILD 1030: Level 1 PASSED (tsc clean; 97 entry + 47 runner asserts pass), Level 2 PASSED (sim vs pristine1029 IDENTICAL, 0 FAIL, same known 684 rig crash), Level 3 NOT RUN (phone probe blocked — Chromium SIGTRAP; live verify blocked — no commit/push yet), Level 4 NOT RUN. Pipeline position: INTEGRATED. It is not VERIFIED and must not be reported as landed.
* Builds 1016–1029: Level 3 (VERIFIED) with live evidence (served version.json + run IDs for 1026–1029; dates only for 1016–1025, exact timestamps not recorded).
* The verification layer itself is a procedure (parent + subagents + tools), not yet an automated system. Automating it (an independent verification agent that runs the pipeline without the generating agent) is the §57 §3 implementation task — it is NOT started. The pipeline and the gate mapping in this file are its specification.
