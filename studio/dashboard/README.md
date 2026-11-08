# ASHFALL Development Dashboard — Data

**Canonical location (when git can write):** `studio/dashboard/` in the Adventure Game repo.
**Working copy:** `~/workspace/studio/dashboard/` (created 2026-11-07 ~14:55 PST; moves into the repo once BUILD 1030 lands and git can write).

GitHub is the permanent source of truth. The dashboard reads from these files instead of maintaining separate hard-coded information. That way, even if Muse's memory gets corrupted again, the development history survives.

## Files

| File | Purpose |
|---|---|
| `dashboard-data.json` | The current dashboard state: last verified checkpoint, active build, build queue, build history, quality-gate results, stage progress, stage risks, measured baselines, known issues, verification history, dashboard links, development directives, team responsibilities, last update timestamp. |
| `dashboard-schema.json` | The JSON schema for `dashboard-data.json`. Validate before replacing data. |
| `README.md` | This file. |
| `MUSE_INSTRUCTIONS.md` | Mandatory rules: Muse reads the dashboard data before beginning development and updates it after verification. Part of the standard Muse startup instructions. |
| `snapshots/2026-11-07.json` | The dated snapshot preserving the November 7, 2026 dashboard state. Never overwritten; new snapshots are added alongside it. |
| `history/build-ledger.json` | The permanent build ledger. Every build records its number, objective, description, files affected, commit hash, previous checkpoint, test results, quality-gate results, performance measurements, verification timestamp, and status. Historical entries are never overwritten. |
| `history/verification-history.json` | Verification records (build, commit, timestamp, run ID, result). |
| `history/development-history.json` | Development history (directives added, audits, dashboard creation, incidents, decisions). |

## How to update (Muse)

1. Complete the development task.
2. Run applicable tests.
3. Run the required quality gates.
4. Record actual results (never fabricated).
5. Record the commit hash (verified against GitHub; null when no commit exists — never fabricated).
6. Update the build ledger (`history/build-ledger.json`) — append, never overwrite a previous verified build.
7. Update the active queue and stage progress in `dashboard-data.json`.
8. Record new issues.
9. Create a dated checkpoint (a new file in `snapshots/`) when verification succeeds.
10. Update `lastUpdateTimestamp`.

## How to replace dashboard data (atomic, safe)

Before replacing dashboard data:

1. Validate the existing file against `dashboard-schema.json`.
2. Save a backup (copy the current file with a timestamp).
3. Write the replacement to a temporary file.
4. Validate the replacement against `dashboard-schema.json`.
5. Atomically replace the original (rename the temp file over it).
6. Verify the result (re-read and validate).

If anything fails, retain the previous valid version. Never leave the dashboard without a recoverable data source.

## Statuses

* `planned` — ordered, not started.
* `in_progress` — work underway.
* `implemented` — code written, not yet tested.
* `tested` — tests run, results recorded.
* `verified` — all required checks passed (quality gates + live verification where applicable).
* `blocked` — waiting on an external dependency (package, environment, user decision).
* `failed` — a check failed; see the record for the cause.

A task must never appear `verified` before its required checks pass. Only update the last verified checkpoint after successful verification.

## Quality gates

Four gates (§50): LEVEL 1 IMPLEMENTED, LEVEL 2 INTEGRATED, LEVEL 3 VERIFIED, LEVEL 4 POLISHED. Each gate must have actual verification evidence (gate name, status, timestamp, test/command, result, commit). A gate that has not run is NOT RUN. A gate that fails is FAILED. Missing results are never silently treated as passing.

## Build numbers vs engine job numbers (do not mix)

* **Adventure Game builds** (1029–1032, etc.) are the game builds in this repo. Their commit hashes are in `history/build-ledger.json` and verified against `git log`.
* **Java engine Jobs 001–006** are a SEPARATE track (the repository's separate engine documentation). They are not Adventure Game builds. Never confuse the two tracks.

## Recovery

* If `dashboard-data.json` is corrupt or missing, restore from the latest valid snapshot in `snapshots/` (validate it first).
* If a snapshot is corrupt, fall back to the previous snapshot, then to `history/build-ledger.json` + `history/verification-history.json` (which together reconstruct the build history).
* Corruption detection: validate against `dashboard-schema.json`; a file that fails validation is not used.
* Missing-file detection: every file listed above must exist; if one is missing, report it and restore from the last valid snapshot.
* Duplicate-record detection: build numbers must be unique in the ledger; if a duplicate appears, preserve both entries and flag the discrepancy (do not silently delete one).
