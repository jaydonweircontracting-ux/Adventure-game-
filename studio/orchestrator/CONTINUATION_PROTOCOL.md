# Autonomous Continuation Protocol

**Directive:** SOUL.md §57 §14.
**What already exists:** `studio/CONTINUE_ASHFALL.md` (the exact persistent resume point — current status, active task, last verified checkpoint, queue, next exact action with commands, testing requirements), the §50 bounded-cycle procedure (review state → highest-value objective → implement → integrate → test → repair → checkpoint → update dashboard → next cycle), the §49 autonomous operating procedure (inspect → unfinished → backlog → highest-value task → implement → test → fix → save/document → next task), and the dashboard snapshots (`studio/dashboard/snapshots/`). This file adds the continuation protocol: how a session resumes, checkpoints, handles interruptions, and avoids repeating completed work. It does not replace `CONTINUE_ASHFALL.md` — it is the procedure that uses it.

## How a session resumes

A fresh session reads, in order:

1. **`studio/CONTINUE_ASHFALL.md`** — the exact resume point (current status, active task, last verified checkpoint, recent accomplishments, outstanding work, known problems, relevant files, next exact action, commands to resume, testing requirements). This is the first file. A session that does not read it will re-discover work that is already done.
2. **`studio/IMPLEMENTATION_REGISTRY.md`** — what actually exists vs what is only documented (88 requirements, counts 4/15/21/9/34/5/0). This stops the session from assuming a feature exists because documentation says it does, and from assuming something is missing because it has not been mentioned recently.
3. **`studio/dashboard/dashboard-data.json`** — the current state (last verified checkpoint, active build, queue, quality gates, Stage 1 baseline, known issues). This is the machine-readable version of the resume point.
4. **`studio/MUSE_SOUL.md` + `studio/MUSE_EVOLUTION.md`** — the operating constitution (v1.0) and the versioned instructions (v1.1, including the gate-evidence rule). The session follows these; it does not re-derive them.
5. **The relevant dated log** (`~/memory/2026-11-07.md` for the current day) — the per-build detail and the recent decisions, for the active task only. Not the whole memory.

Then the session verifies the resume point against reality before acting: `git log --oneline -1` (read-only — is HEAD still the recorded checkpoint?), `git status --short` (is the tree clean, or is 1030's uncommitted work still there?), and the served markers (is the live build still the recorded checkpoint?). If the resume point and reality disagree, reality wins and the resume point is corrected.

## The bounded development cycle (§50 + §57 §14)

At every checkpoint:

1. Review current project state (the resume point + reality check above).
2. Identify unfinished work (the queue in `CONTINUE_ASHFALL.md`, prioritized by the registry's top-10 and the expected-value formula).
3. Retrieve relevant project memory (only what the task needs — see `ADVANCED_MEMORY.md`).
4. Select the highest-impact dependency-ready task (the next queue item whose dependencies are satisfied).
5. Execute the task (audit first, extend never duplicate, smallest safe change).
6. Verify the result (the pipeline in `VERIFICATION_INTELLIGENCE.md` — GENERATED → COMPILED → TESTED → INTEGRATED → VERIFIED → APPROVED).
7. Measure improvements (against the baseline in `BENCHMARKING.md`).
8. Update the development genome: run `node studio/genome/scanner.mjs` (incremental), then update the registry + the dashboard data + `CONTINUE_ASHFALL.md`.
9. Update documentation (the registry, the dashboard data, MEMORY.md, the dated log).
10. Save a checkpoint (see below).
11. Continue (the next cycle starts at step 1).

## How it checkpoints

A checkpoint is saved when verification succeeds (a build lands) or when a meaningful cycle completes. A checkpoint consists of:

* **The verified state:** the last verified checkpoint in the dashboard data (build number, commit hash, verification timestamp, run ID) + a dated snapshot (`studio/dashboard/snapshots/YYYY-MM-DD.json` — never overwrite a dated snapshot).
* **The resume point:** `CONTINUE_ASHFALL.md` updated (last updated timestamp, current status, active task, queue, next exact action).
* **The registry:** updated if a requirement changed status (e.g. 1030 landing moves Q1 → COMPLETE AND VERIFIED).
* **The memory:** MEMORY.md + the dated log updated (via `muse.edit`, never a truncating write).
* **The code:** committed + pushed (when git can write). A checkpoint that is not committed is a working-tree checkpoint — it is real (the files exist), but it is not permanent until it is committed. (1030's 7 files are in this state as of 2026-11-07: implemented + code-verified, uncommitted, because git cannot write.)

## How it handles interruptions

If execution stops (session end, credit limit, timeout, service limit, or environment failure):

* **Finish or safely interrupt.** Finish the current safe operation; do not leave a half-written file or an unknown tree state.
* **Save all work.** The files are written (the runtime file API works; node `writeFileSync` works). Uncommitted work stays in the working tree and is recorded in `CONTINUE_ASHFALL.md` (which files, what state).
* **Update `CONTINUE_ASHFALL.md`.** The next exact action, with the commands to resume, so a fresh session continues without the user re-explaining.
* **Record remaining tasks + exact continuation instructions.** The queue, the blockers, and what unblocks each one (e.g. "1030's commit/push waits for git to write again — re-test with `git status --short`; do NOT retry in a loop").
* **Avoid repeating completed work.** The registry + the dashboard data + the dated log record what is done. A fresh session reads them before acting. (The 1030 code is done — a resumed session must NOT re-implement it; it must commit/push it.)
* **Resume when legitimate execution capacity becomes available.** Never repeatedly restart the whole process. Never claim background development when no process is running. (§50.)

## How it avoids repeating completed work

* **The registry is the record of what exists.** A requirement marked COMPLETE AND VERIFIED (with a commit hash + live verification) is done. It is not re-done.
* **The dashboard data is the record of what landed.** A build with a commit hash + a verification timestamp + a run ID is landed. It is not re-built.
* **The dated logs are the record of what was tried.** A failed attempt is recorded (the `MUSE_EVOLUTION.md` revision log + the dated logs). A resumed session reads the failure before retrying the approach.
* **The continuation queue is maintained, not rebuilt.** The queue in `CONTINUE_ASHFALL.md` is updated (items move from in-progress to done, new items are appended in order). It is never rewritten from scratch — that would lose the ordering and the blockers.
* **Never restart completed work without a specific reason.** (§57 §14.) A specific reason is: a regression was found, the user countermanded it, or the verification was invalid (e.g. a gate level claimed without evidence — the honesty-gap fix is the model: the data was corrected, the work was not re-done).

## The user's usage plan (from the directives)

The user's plan for the three directives is: 1. 3D transformation (§48 — what game we're building), 2. autonomous development (§49 — how Muse works independently), 3. 10-minute evolution (§50 — the continuous improvement cycle). Then RUN. RUN mode means: resume from the last verified checkpoint, inspect only what changed, take the next highest-priority task, develop, test, fix, save, update the backlog/dashboard, continue automatically. CONTINUE = resume where development stopped; AUDIT = inspect the whole project; OPTIMIZE = profile and improve pipeline + game performance; COMPLETE = work the backlog until acceptance criteria are verified or genuine blockers are documented. The user has NOT said RUN yet (as of 2026-11-07). The queue keeps executing under the user's order "Do everything now" (2026-11-07 ~13:48 PST: execute the whole queue back-to-back, no waiting for approval between builds) and "Continue until every prompt from the last three hours is done, don't stop" (2026-11-07 ~14:51 PST).

## Current state

The continuation protocol as a procedure exists in the directives (§49/§50/§57 §14) and in practice (the parent resumes from `CONTINUE_ASHFALL.md` every session). What this file adds is the written protocol: the resume order, the reality check, the checkpoint contents, the interruption handling, and the no-repeat rules. What is missing: the automated continuation queue (currently the queue in `CONTINUE_ASHFALL.md`, maintained by hand), the automated checkpointing (currently the parent updates the files), and the automated Development Genome update (the genome exists since 2026-11-07 — run the scanner; the registry + dashboard data + `CONTINUE_ASHFALL.md` are still updated alongside it). The protocol works as written; the automation is the §57 implementation task.
