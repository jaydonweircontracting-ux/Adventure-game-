# Persistent Task Queue

**Authoritative task registry.** Survives session restarts. Stored in Git.

## How to use
1. Read this file at session start
2. Pick highest-priority unblocked task
3. Update status as you work
4. Commit changes

## Status values
- `todo` — not started
- `in_progress` — actively working
- `blocked` — waiting on external dependency
- `done` — verified complete (with evidence)

---

## P1 — Critical

### TASK-001: Combat damage verification (full loop)
- **Status:** `done`
- **Priority:** P1
- **Objective:** Verify complete combat loop: attack → damage → enemy death → loot → player damage
- **Files:** `tests/real-game/combat.mjs`, `src/App.tsx` (attackGoat, damage)
- **Checkpoint:** 2026-10-11 — FULL LOOP VERIFIED. Attack input → damage (40→31, 9/hit) → death (hp=0, disposition=defeated) in 7 hits. 8/8 tests pass. Goat becomes aggressive when hit. Loot drops not yet verified (next).
- **Next:** Verify loot drops appear after kill
- **Evidence:** BUILD 538 combat.mjs: 8/8 pass, kill confirmed
- **Commit:** `87e7875`

## P2 — High

### TASK-002: Research/provenance registry
- **Status:** `done`
- **Priority:** P2
- **Objective:** Create searchable registry of technical research with source URLs, licenses, integration status
- **Files:** `docs/RESEARCH.md`
- **Checkpoint:** 2026-10-11 — Created with Playwright and FOnline entries. Verified working.
- **Evidence:** docs/RESEARCH.md exists with 2 entries, source URLs, licenses
- **Commit:** `0ba222e`

### TASK-003: Doorway discoverability (human playtest)
- **Status:** `todo`
- **Priority:** P2
- **Objective:** Verify new players can find the interior exit without guidance
- **Evidence needed:** Human playtest or clearer visual indicator
- **Related:** `tests/real-game/HUMAN_EXPERIENCE.md` (scored 3/5)

## P3 — Medium

### TASK-004: Movement speed tuning
- **Status:** `todo`
- **Priority:** P3
- **Objective:** Evaluate if 2 u/s walk speed feels too slow for exploration
- **Note:** Speed is intentional per BUILD 377 (user request). Do not change without user approval.
- **Evidence:** Timed walks: 190 units = ~95 seconds

### TASK-005: Persistent task queue resume test
- **Status:** `todo`
- **Priority:** P3
- **Objective:** Verify a fresh session can read this file and resume work
- **Next:** Document the limitation or demonstrate resume

## Done

### TASK-000: Real-game testing bridge (BUILD 533-534)
- **Status:** `done`
- **Evidence:** Playwright + Chromium controls real game. 9/9 smoke tests pass.
- **Commit:** `9b5ddb5`

### TASK-000b: Codebase index (BUILD 537)
- **Status:** `done`
- **Evidence:** `scripts/gen-code-index.mjs` generates `docs/CODE_INDEX.md` (89 modules)
- **Commit:** `084ee0b`

### TASK-000c: Test helpers self-improvement (BUILD 537)
- **Status:** `done`
- **Evidence:** `tests/real-game/helpers.mjs` created, smoke.mjs refactored, 7/7 pass
- **Commit:** `084ee0b`

### TASK-007: Loot drop verification (full enemy-to-loot loop)
- **Status:** `done`
- **Priority:** P1
- **Objective:** Verify kill → loot drop → pickup → removal through production systems
- **Files:** `src/App.tsx` (getDroppedLoot hook), `tests/real-game/combat.mjs`
- **Checkpoint:** 2026-10-11 — 10/10 pass. Kill → `{"goatHorns":1}` drop → walk to loot → click pickup → drop removed. Full loop verified.
- **Evidence:** combat.mjs 10/10, loot drop confirmed in 3 separate runs
- **Commit:** (BUILD 540)

### TASK-008: Fresh-session resumption test
- **Status:** `done`
- **Priority:** P1
- **Objective:** Prove new session can resume from persistent files without conversational memory
- **Files:** `tests/session-resumption.mjs` (new)
- **Checkpoint:** 2026-10-11 — 11/11 pass on clean tree. Validates TASK_QUEUE.md parseable, tasks have evidence, git in sync, required files exist.
- **Evidence:** session-resumption.mjs 11/11
- **Commit:** (BUILD 540)

### TASK-009: Development learning loop
- **Status:** `done`
- **Priority:** P2
- **Objective:** Create persistent record connecting tasks → changes → tests → defects → repairs → lessons
- **Files:** `docs/LEARNING_LOOP.md` (new)
- **Checkpoint:** 2026-10-11 — Created with 4 entries (loot verification, safe-run fix, combat kill, session resumption). Each has task/expected/files/tests/result/defects/cause/fix/regression/lesson.
- **Evidence:** docs/LEARNING_LOOP.md exists with structured entries
- **Commit:** (BUILD 540)
