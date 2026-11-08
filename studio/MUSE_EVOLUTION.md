# MUSE_EVOLUTION.md — Versioned Self-Improving Instructions

**Current version:** 1.1 — 2026-11-07
**Status:** Continuously improving development instructions. Every revision is versioned, tested, recorded here, and reversible. No revision may change the fundamental purpose or remove an essential safety control in MUSE_SOUL.md.

## Revision procedure

When an improvement to the operating instructions is identified:

1. Propose the change (what, and why).
2. Explain the expected benefit (in verified progress per credit, or in a specific failure it prevents).
3. Check compatibility with MUSE_SOUL.md (the constitution). If it conflicts, the constitution wins — do not make the change.
4. Create a versioned revision (bump the version, date it, record it below).
5. Test the revised workflow on a real task.
6. Record the result (kept, or reverted and why).
7. Retain rollback capability (the previous version stays in the log below).

## Periodic evaluation

Evaluate, on a regular cadence and after any failed or costly cycle:

* Which instructions produce the best results?
* Which instructions create unnecessary work?
* Which processes waste credits?
* Which workflows repeatedly fail?
* Which tools are underutilized?
* Which development practices create regressions?
* Which architectural decisions should be improved?

## Revision log

### v1.1 — 2026-11-07 (gate-evidence rule)

**What changed:** Added the rule: *never claim a quality-gate level for a build unless a per-build evidence record exists for that gate (gate name, status, timestamp, test/command, result, commit).* A build verified live (served version.json + phone proof + asserts + sim) supports Level 3 (VERIFIED); Level 4 (POLISHED) requires a formal polish gate with its own evidence record. Likewise, never use a placeholder timestamp (e.g. midnight) for a verification time — use null when the exact timestamp is not recorded, and note that only the date is known.

**Why:** The Master Integration Registry (§55 Stage A, 2026-11-07) found that the dashboard data created in v1.0 claimed Level 4 for builds 1016–1029 with no per-build Level-4 evidence, and used midnight placeholders for 1016–1025 verification timestamps. The parent fixed the data (gate level 4 → 3, timestamps → null, correction recorded in the development history). The rule prevents the same overclaim from recurring.

**Compatibility:** Compatible with MUSE_SOUL.md (principle 12: never claim something is complete without evidence; quality requirements: gates carry real evidence, missing results are never silently treated as passing).

**Test:** The fix was applied to dashboard-data.json + history/build-ledger.json and validated (all JSON valid; gate levels 1016–1029 all 3; verifiedAt null for 1016–1025, real for 1026–1029).

**Result:** Kept. The rule is now part of the operating instructions.

### v1.0 — 2026-11-07 (initial version)

**What it is:** The first versioned instruction set, created alongside MUSE_SOUL.md (the operating constitution) and CONTINUE_ASHFALL.md (the resume point), per SOUL.md §59.

**Contents:** This file's revision procedure and evaluation criteria; the operating constitution in MUSE_SOUL.md; the resume point in CONTINUE_ASHFALL.md.

**Basis:** The full directive set in SOUL.md §47–§59 (speed §47, 3D direction §48, autonomous development §49, autonomous evolution §50, ultimate engineering §51, god-tier engineering §52, autonomous god-tier §53, dashboard repair §54, master integration §55, code evolution machine §56, next evolution layer §57, game evolution engine §58, Muse self-evolution §59), plus the project's accumulated operating lessons (AGENTS.md, the build queue, the parent verification standard, the push lessons, the harness landmines).

**Known gaps to evaluate first (from real failures, not theory):**
* The 2026-11-07 environment write failure (git EPERM on overlayfs; Chromium SIGTRAP) blocked the 1030 commit/push and phone probe. The instructions need a recovery procedure for "environment cannot write" that does not waste cycles retrying the same failing command — currently the only recovery is waiting for the environment to clear (likely on deployment/VM replacement).
* The 2026-11-07 MEMORY.md truncation (a failed `open('w')` truncated the file to 0 bytes; restored from the injected context copy + dated logs). The instruction is: never use a truncating write on a memory file; prefer the runtime file API (`muse.write`/`muse.edit`) or write-to-temp-then-atomic-replace. This is now in MUSE_SOUL.md (atomic writes) and must be followed for every memory/dashboard write.
* The assert-runner habit of piping through `ls`/`&&` chains produced a false failure once; the parent verification standard is to run standalone asserts DIRECTLY with no pipe/&& chain. Keep that rule.
* Subagent push failures (proxy 403 / connection reset) are transient, not auth — the recovery is a parent push, never credential extraction. Keep that rule.

**Result:** In use from 2026-11-07. Awaiting the first real revision (to be recorded here when an evaluation produces one).

---

*Future revisions go above this line (newest first), each with: version, date, what changed, why, test result, and whether it was kept or reverted.*
