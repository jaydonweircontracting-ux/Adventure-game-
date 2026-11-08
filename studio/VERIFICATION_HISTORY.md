# ASHFALL — VERIFICATION_HISTORY

**Version:** 1.0 — 2026-11-07 ~15:08 PST
**Source:** SOUL.md §55 (unify documentation/memory in GitHub).

The canonical verification history lives in `studio/dashboard/history/verification-history.json` (validated against `studio/dashboard/dashboard-schema.json`). **It must not be duplicated here.** This file is a pointer only.

The verification history records each build's verification (build, commit, timestamp, GitHub Actions run ID, result). Builds 1026–1029 have real verification timestamps + run IDs (1026: run 42404496335, 2026-11-07T19:06:53.952Z; 1027: run 42407766765, 2026-11-07T19:47:03.434Z; 1028: run 42410771257, 2026-11-07T20:23:52.159Z; 1029: run 42416626999, 2026-11-07T21:37:14.339Z). BUILD 1030 is recorded as NOT YET VERIFIED (code-verified only: tsc clean, 97 entry + 47 runner asserts pass, sim identical to pristine1029; commit/push blocked by the environment write failure, phone probe blocked by Chromium SIGTRAP). Do NOT mark 1030 verified until the commit/push + phone probe + live verify by content marker all pass.

Historical records are never overwritten. Append a new record when a build is verified; a status changes only with evidence (commit hash, run ID, probe output, served marker).
