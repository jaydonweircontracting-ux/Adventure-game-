# Autonomous Game Evolution Loop

**Status:** DOCUMENTED ONLY (registry D7). No autonomous game evolution loop exists as a running loop. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 15 ("THE AUTONOMOUS GAME EVOLUTION LOOP").

## What it is

The autonomous game evolution loop is the cycle by which AGEE continuously improves the playable game — without a human having to notice every gap, and without AGEE becoming a second task manager. It is a loop, not a one-off: it runs, it learns from what happened, and it runs again.

## The loop

```
AGEE decides what the game needs
  → the Code Evolution Engine implements it
    → the Verification Engine proves it
      → the result is measured and recorded
        → AGEE decides what the game needs next
```

### Step 1 — AGEE decides what the game needs

AGEE reads, in order:

1. **The implementation registry** (`studio/IMPLEMENTATION_REGISTRY.md`, 88 requirements) — what exists, what is partial, what is missing, what is blocked. The registry is the source of truth. AGEE does not re-audit the codebase itself; it reads the registry.
2. **The master health score** — the evidence-based score for the project (from §57; never an invented percentage). A system with no tests has no verified score.
3. **The player-experience results** (`PLAYER_EXPERIENCE.md`) — what the play-style agents found (frustration, confusion, exploits, missing gameplay).
4. **The completion roadmap** (`COMPLETION_ROADMAP.md`) — which systems are at which stage, and which lowest-stage system blocks the §48.16 acceptance chain.
5. **The Stage 1 baseline** — the measured state of the world (ground FLAT, 91.6% uniform grass, world buffer at 89% of budget).

AGEE picks the **highest-value** item by the same rule as the rest of the project: EXPECTED VALUE = PROJECT IMPACT × SUCCESS PROBABILITY ÷ RESOURCE COST (§53, §59). The highest-value item is usually the lowest-stage system that blocks the acceptance chain — right now, landing 1030, then 1031, then 1032, then the RPG systems (quests, economy, dungeons, skills) in the order the registry's Stage E defines.

AGEE's decision is a **proposal**, not an order. It names the item, the evidence for why it matters, and the measurable criteria for done. The user orders; the queue decides.

### Step 2 — The Code Evolution Engine implements it

The implementation is done by the Code Evolution Engine (ACEE, `studio/acee/`) — the same pipeline that implements every other build. AGEE does not have its own code generator, its own agent team, or its own branch. The work enters the same queue, is implemented by the same process (inspect → smallest safe change → build → test → fix → checkpoint), and follows the same rules (extend, never duplicate; no rewrites; both build markers bumped; player-terms note).

### Step 3 — The Verification Engine proves it

The implementation is proven by the same verification pipeline as every other build (see `CONTENT_QC.md`):

- `tsc --noEmit` exits 0.
- Sim vs pristine baseline: IDENTICAL (0 FAIL), except for the known 684 rig crash (which is recorded, not hidden).
- Standalone asserts, run directly (no pipe, no `&&` chain).
- Phone probe (390×844, 0 page errors) — when the environment allows it (Chromium is currently SIGTRAP-blocked; the probe scripts are ready).
- Live verify by content marker (served `version.json` build + note, served `?v=<BUILD>` index `__AG_BUILD`).

A build that fails any gate is FAILED. It is fixed or reverted — never shipped with a failing gate and a hopeful note.

### Step 4 — The result is measured and recorded

After the build lands (or fails), the result is recorded:

- The build ledger (`studio/dashboard/history/build-ledger.json`) — appended, never overwritten.
- The verification history (`studio/dashboard/history/verification-history.json`).
- The dashboard data (`studio/dashboard/dashboard-data.json`) — the queue advances, the stage progress updates, the quality gates record their evidence.
- The registry (`studio/IMPLEMENTATION_REGISTRY.md`) — the requirement's status changes (e.g. G11 NOT IMPLEMENTED → PARTIALLY IMPLEMENTED → COMPLETE AND VERIFIED), with the evidence.
- The completion roadmap (`COMPLETION_ROADMAP.md`) — the system's stage advances, with the measurable criteria met.
- The dated log (`~/memory/2026-11-07.md` and its successors) — the per-build detail.
- `CONTINUE_ASHFALL.md` — the resume point, updated every meaningful cycle.

If the build failed, the failure is recorded with the reason — and the loop learns from it (the §53 self-improvement loop: identify the inefficiency → root cause → propose → estimate impact → implement → benchmark → compare → keep only if it measurably improves, else revert).

### Step 5 — AGEE decides what the game needs next

The loop returns to Step 1 with the updated registry, roadmap, and health score. The next highest-value item is picked. The loop continues until the queue is complete, a genuine blocker appears, a resource limit is reached, or the user countermands it.

## The rule that governs the loop

**Use the existing orchestrator. Do NOT create another competing task manager.**

AGEE does not own a queue, a scheduler, a backlog, or an agent team. The orchestrator (`studio/orchestrator/`) owns scheduling. AGEE proposes; the orchestrator schedules; ACEE implements; the Verification Engine proves. The intended ecosystem is FOUR capabilities, CONNECTED — not four competing systems with four backlogs. If AGEE ever needs a task tracked, it enters the orchestrator's backlog, with a task ID, a priority, dependencies, and a status — the same as any other task.

## What the loop does NOT do

- It does not run indefinitely without a checkpoint. Every cycle ends with a checkpoint (a commit, a ledger entry, an updated resume point) — so an interruption costs a cycle, not the project.
- It does not claim background development when no process is running (§50). If the loop is not running, it says so.
- It does not bypass usage limits, evade billing controls, or conceal resource consumption (§59 hard rule). It optimizes within legitimate limits.
- It does not spend all resources on background systems while neglecting the playable game (the AGEE rule, `README.md`). The loop's output is measured in what the player experiences — not in how many subsystems were designed.
- It does not start §57/§58 work before the current hour's work is finished, saved, and reported (the §57 pacing instruction). The loop respects the queue order: 1030 → 1031 → 1032 → Stages 2–6 → dashboard → master integration → §57 → §58 (AGEE) → legacy cleanup → ACEE.
