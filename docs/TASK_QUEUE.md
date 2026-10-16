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
- **Status:** `done`
- **Priority:** P2
- **Objective:** Verify new players can find the interior exit without guidance
- **Checkpoint:** 2026-10-11 — AUTOMATED VERIFICATION COMPLETE. Blind test (no hardcoded coords) found exit in 1 attempt via visible "🚪 Exit" button. Iso view has 3 consistent methods: UI button, tap door tile, walk onto door. BUILD 541 mismatch hypothesis was incorrect (compared iso hint to 2D mechanic).
- **Evidence:** discoverability.mjs 4/4 pass, 1.0s, 1 attempt via "🚪 Exit" button
- **Commit:** (BUILD 542)
- **Human value:** Still useful for "feel" but not required for functionality
- **Related:** `docs/HUMAN_EXPERIENCE_BRAIN.md`

## P3 — Medium

### TASK-004: Movement speed tuning
- **Status:** `todo`
- **Priority:** P3
- **Objective:** Evaluate if 2 u/s walk speed feels too slow for exploration
- **Note:** Speed is intentional per BUILD 377 (user request). Do not change without user approval.
- **Evidence:** Timed walks: 190 units = ~95 seconds

### TASK-005: Persistent task queue resume test
- **Status:** `done`
- **Priority:** P3
- **Objective:** Verify a fresh session can read this file and resume work
- **Checkpoint:** 2026-10-11 — VERIFIED. tests/session-resumption.mjs passes 11/11 on clean tree (10/11 on dirty tree, only "working tree clean" fails as expected). Fresh session can parse tasks, identify next, verify git sync.
- **Evidence:** session-resumption.mjs 11/11
- **Commit:** (BUILD 540)

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

### TASK-010: Player journey test
- **Status:** `done`
- **Priority:** P1
- **Objective:** Reusable automated test for new-player journey (start → move → exit → explore)
- **Files:** `tests/real-game/journey.mjs` (new)
- **Checkpoint:** 2026-10-11 — 6/6 pass. Exit in 2.3s, 0 move failures, 8.8s total. Screenshots captured.
- **Evidence:** journey.mjs 6/6, journey-interior.png, journey-exterior.png
- **Commit:** (BUILD 541)

### TASK-011: Human Experience Brain
- **Status:** `done`
- **Priority:** P1
- **Objective:** Evaluation system separating automated facts from AI hypotheses from human findings
- **Files:** `docs/HUMAN_EXPERIENCE_BRAIN.md` (new)
- **Checkpoint:** 2026-10-11 — Created with 5-dimension framework (Clarity, Responsiveness, Discovery, Feedback, Reward). 3 evaluations: doorway, journey, combat. Clear evidence categories.
- **Evidence:** docs/HUMAN_EXPERIENCE_BRAIN.md exists with structured evaluations
- **Commit:** (BUILD 541)

### TASK-012: Blind discoverability test
- **Status:** `done`
- **Priority:** P1
- **Objective:** Test exit discovery without hardcoded coordinates or privileged hooks
- **Files:** `tests/real-game/discoverability.mjs` (new)
- **Checkpoint:** 2026-10-11 — 4/4 pass. Found "🚪 Exit" button in 1 attempt (1.0s). Strategies: UI buttons → canvas clicks → exploration fallback. Proves discoverability without cheating.
- **Evidence:** discoverability.mjs 4/4, discoverability-interior.png
- **Commit:** (BUILD 542)

### TASK-013: Restore authoritative live update checker
- **Status:** `in_progress`
- **Priority:** P1
- **Objective:** Ensure the main menu detects newer source builds, reports deployment lag, polls every 10 seconds, and offers manual refresh.
- **Files:** `src/App.tsx`, `src/game/updateVersion.ts`, `scripts/prepare-build-entry.cjs`, `package.json`, `tests/update-version.test.ts`
- **Checkpoint:** 2026-10-16 — BUILD 725 restored orange checking/current status; BUILD 728 compares running, deployed, and latest source builds, adds Check now, and regenerates version markers through predev/prebuild.
- **Acceptance:** CI passes; deployment succeeds; source/deployed/running markers are checked; fresh play link is provided.
- **Evidence:** CI run 38972057977 passed typecheck, update-version regression (11 assertions), existing regression suite, and production build; live Pages verification pending.


### TASK-014: NPC death, disposition, corpse loot, and guard arrest loop
- **Status:** `in_progress`
- **Priority:** P1
- **Objective:** Close dialogue and ambient speech when an NPC dies; apply lasting negative disposition after attacks; make all melee NPC death paths create lootable bodies; transfer corpse gold/potions into the correct inventory fields; have witnessed assaults/murders create bounty and guards pursue the player with flee/jail/pay-fine choices.
- **Files:** `src/App.tsx`, `src/game/lootableBodies.ts`, `src/game/bounty.ts`, `src/game/crime.ts`, `docs/LEARNING_LOOP_2026-10-16.md`
- **Checkpoint:** 2026-10-16 — BUILD 730 committed. CI run `38972899139` passed typecheck, isometric direction regression, production build, artifact upload, and Pages deployment. Dedicated real-game NPC/arrest interaction tests remain unrun.
- **Acceptance:** Typecheck/build pass; real-game tests confirm dialogue closes on death, attack lowers disposition, corpse gold/potions transfer correctly, witnessed assault/murder creates bounty, guard approaches, flee moves player away, jail enters prison, and fine consumes coins/clears bounty.

### TASK-014: Lock wanted-guard dialogue controls
- **Status:** `in_progress`
- **Priority:** P1
- **Objective:** Ensure player movement, attacks, and world interactions pause while the wanted-guard decision prompt is open.
- **Files:** `src/App.tsx`
- **Checkpoint:** BUILD 730 adds the arrest prompt to the shared input-lock conditions so keyboard/touch movement and attack/interact paths cannot continue behind the modal.
- **Verification:** Pending CI, typecheck, production build, and real-game Playwright checks; do not mark done until evidence is available.

### TASK-015: Suppress dead NPC speech
- **Status:** `in_progress`
- **Priority:** P1
- **Objective:** Prevent dead NPCs from displaying ambient chatter or talk affordances; restore speech only after respawn clears death state.
- **Files:** `src/game/iso/IsoFieldView.tsx`, `src/App.tsx`, `scripts/prepare-build-entry.cjs`
- **Checkpoint:** BUILD 732 source patch committed. Renderer suppresses ambient speech when `deadUntilTick` is set or HP is zero and hides the talk prompt in the same state.
- **Verification:** Pending CI, deployed version marker, and real-game death/respawn regression check. Do not mark done until verified.

### TASK-016: Starting-house stone deposit
- **Status:** `in_progress`
- **Priority:** P2
- **Objective:** Add a large stone boulder behind the starting house in Mosslight Crossing.
- **Files:** `src/game/iso/IsoFieldView.tsx`, `src/App.tsx`, `scripts/prepare-build-entry.cjs`
- **Checkpoint:** BUILD 733 draws a large boulder at a fixed anchor behind the tutorial house in chunk (4, 7). This is currently visual-only; mining/collision integration is not included.
- **Verification:** Pending CI, deployed version marker, and in-game visual check.


### TASK-017: Autonomous settlement work and local economies
- **Status:** `todo`
- **Priority:** P1
- **Objective:** Give settlement NPCs persistent jobs and resource loops inspired by RTS village simulations: workers travel to resource nodes, gather stone/wood/food, haul materials to stockpiles, consume wages/food, and feed settlement construction/crafting/trade budgets. Each settlement owns its own resource ledger and production/consumption history.
- **Files:** `src/game/townsfolk.ts`, `src/game/civilization.ts`, `src/game/ecoSave.ts`, `src/App.tsx`, resource-node systems and simulation tests.
- **Checkpoint:** BUILD 734 adds a mineable starting-house stone deposit and player stone inventory as the first shared resource primitive. Autonomous NPC mining, hauling, stockpiles, and independent settlement ledgers remain to be implemented.
- **Acceptance:** Deterministic headless simulation proves NPCs select jobs, travel to valid resources, gather and haul without teleporting, update the correct settlement ledger, consume/produce goods over time, and persist/reload economic state. Include starvation/shortage and blocked-resource cases.
