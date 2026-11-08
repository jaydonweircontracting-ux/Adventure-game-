# ASHFALL — BUILD_LEDGER

**Version:** 1.0 — 2026-11-07 ~15:08 PST
**Source:** SOUL.md §55 (unify documentation/memory in GitHub).

The canonical build ledger lives in `studio/dashboard/history/build-ledger.json` (validated against `studio/dashboard/dashboard-schema.json`). **It must not be duplicated here.** This file is a pointer only.

The ledger records every build (1016–1032) with its number, objective, description, files affected, commit hash (verified against `git log` — null when no commit exists yet, never fabricated), previous checkpoint, test results, quality-gate results, performance measurements, verification timestamp, and status. Builds 944–1015 are recorded in the dated logs (`~/memory/2026-10-21.md` for 944–989, `~/memory/2026-11-01.md` for 990–997, `~/memory/2026-11-02.md` for 998–1006, `~/memory/2026-11-03.md` for 1007–1009, `~/memory/2026-11-04.md` for 1010, `~/memory/2026-11-05.md` for 1011–1013, `~/memory/2026-11-06.md` for 1014–1021) and will be backfilled into the ledger.

Historical entries are never overwritten. Append a new entry when a build lands; update an entry only to correct it (and record the correction, as was done for the 2026-11-07 honesty-gap fix: gate level 4 → 3 for 1016–1029, verification timestamps → null for 1016–1025).
