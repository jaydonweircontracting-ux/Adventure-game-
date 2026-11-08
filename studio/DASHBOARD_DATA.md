# ASHFALL — DASHBOARD_DATA

**Version:** 1.0 — 2026-11-07 ~15:08 PST
**Source:** SOUL.md §55 (unify documentation/memory in GitHub).

The canonical dashboard data lives in `studio/dashboard/` — specifically `studio/dashboard/dashboard-data.json` (validated against `studio/dashboard/dashboard-schema.json`), with the dated snapshot in `studio/dashboard/snapshots/2026-11-07.json` and the supporting records in `studio/dashboard/history/`. **It must not be duplicated here.** This file is a pointer only.

The dashboard data holds: the last verified checkpoint (BUILD 1029, commit `14491c9f`), the active build (BUILD 1030, in progress), the build queue (1030 → 1031 → 1032 → Stages 2–6), the build history (1016–1032, 14 verified, 1 in progress, 2 planned; commit hashes verified against `git log`), the quality-gate results (1030: L1/L2 PASSED, L3/L4 NOT RUN; 1016–1029: Level 3 VERIFIED), the stage progress (Stage 1 done, Stages 2–6 planned, Stage 2 risk flag: HIGH), the measured Stage 1 baseline, the known issues, the verification history, the dashboard links, the development directives (§47–§59), the team responsibilities (Teams A–F), and the last update timestamp (2026-11-07T15:05:00-07:00).

Update the dashboard data per `studio/dashboard/MUSE_INSTRUCTIONS.md` (complete → test → quality gates → record results + commit hash → update ledger/queue/stages/issues → dated checkpoint on verification success). Never fabricate a commit hash, verification result, build number, or measurement. A task must never appear verified before its required checks pass.
