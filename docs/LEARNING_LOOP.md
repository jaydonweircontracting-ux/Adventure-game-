# Development Learning Loop

**Purpose:** Connect tasks → changes → tests → results → defects → repairs.
A new session reads this to avoid repeating failed approaches.

## Format
Each entry records:
- **Task:** What was attempted
- **Expected:** What should happen
- **Files:** What changed
- **Tests:** What was run
- **Result:** Before → After
- **Defects:** What went wrong
- **Cause:** Root cause of each defect
- **Fix:** What was changed to repair
- **Regression:** Did existing tests still pass?
- **Lesson:** What to do differently next time

---

## 2026-10-11 — Combat Loot Verification (BUILD 540)

**Task:** Verify complete enemy-to-loot loop: kill goat → loot drops → pickup works

**Expected:** Goat dies, loot appears on ground, player picks it up via button

**Files:**
- `src/App.tsx` (added `getDroppedLoot` test hook)
- `tests/real-game/combat.mjs` (extended with loot verification)

**Tests:**
- `node tests/real-game/combat.mjs`
- `node tests/session-resumption.mjs`

**Result:**
- Before: combat.mjs verified damage (40→31) and death, but not loot
- After: 10/10 pass — kill → loot drop → pickup → removal all verified

**Defects:**
1. Pickup button not visible via `page.isVisible()` — test failed initially
2. TypeScript `as` syntax in .mjs file caused parse error

**Cause:**
1. Button was in DOM but outside viewport; `isVisible()` returns false for off-viewport elements
2. Used TypeScript type assertion in plain JavaScript file

**Fix:**
1. Changed to `page.locator().count()` to check DOM presence, then click via `page.evaluate()` (bypasses viewport)
2. Removed `as HTMLButtonElement` type assertion

**Regression:** smoke.mjs 7/7 still pass

**Lesson:** For Playwright button clicks, check DOM presence with `locator().count()` not `isVisible()`. Use `page.evaluate(() => document.querySelector(sel).click())` for off-viewport elements.

---

## 2026-10-11 — Safe-run Hard Failure Classification (BUILD 539)

**Task:** Test safe-run.mjs failure classification

**Expected:** Hard failures stop after 1 attempt, transient failures retry

**Files:**
- `scripts/safe-run.mjs` (fixed HARD patterns)

**Tests:**
- `node scripts/safe-run.mjs --retries 2 ls /nonexistent-path-xyz`

**Result:**
- Before: "No such file" classified as `unknown`, retried 3 times
- After: Classified as `hard`, stops after 1 attempt

**Defects:**
1. Missing patterns for "no such file" and "cannot access"

**Cause:** HARD patterns only had `/not found$/i` which didn't match "No such file or directory"

**Fix:** Added `/no such file/i` and `/cannot access/i` to HARD array

**Regression:** Success case and transient retry still work

**Lesson:** Test failure classification with real error messages, not just success cases. Error message wording varies by command.

---

## 2026-10-11 — Combat Kill Verification (BUILD 539)

**Task:** Extend combat test to kill goat (not just damage)

**Expected:** Multiple attacks reduce HP to 0, disposition becomes 'defeated'

**Files:**
- `tests/real-game/combat.mjs` (attack loop)

**Tests:**
- `node tests/real-game/combat.mjs`

**Result:**
- Before: 9/9 pass, single hit 40→31 HP
- After: 8/8 pass, 7 hits 40→0 HP, disposition='defeated'

**Defects:** None

**Cause:** N/A

**Fix:** N/A

**Regression:** All existing tests pass

**Lesson:** Attack requires target in facing arc. Some hits miss if goat moves. Loop until death with cooldown waits handles this.

---

## 2026-10-11 — Fresh Session Resumption (BUILD 540)

**Task:** Prove new session can resume from persistent files

**Expected:** Script validates TASK_QUEUE.md, git state, required files

**Files:**
- `tests/session-resumption.mjs` (new)

**Tests:**
- `node tests/session-resumption.mjs` (on clean tree)

**Result:** 11/11 pass

**Defects:**
1. Regex didn't capture full task blocks (Evidence check failed)
2. Working tree check failed when uncommitted changes present (expected)

**Cause:**
1. Non-greedy regex stopped at Status line, didn't reach Evidence line
2. Test run on dirty tree

**Fix:**
1. Changed to split on `### ` and parse each block separately
2. Documented: run on clean tree or stash first

**Regression:** N/A (new test)

**Lesson:** For markdown parsing, split on headers rather than complex regex. Test validation scripts on clean state.

---

## 2026-10-11 — Player Journey Test (BUILD 541)

**Task:** Build reusable test for new-player journey (start → move → exit → explore)

**Expected:** Automated test completes full journey, measures usability

**Files:**
- `tests/real-game/journey.mjs` (new)

**Tests:**
- `node tests/real-game/journey.mjs`

**Result:**
- Before: No journey test existed
- After: 6/6 pass. Exit in 2.3s, 0 move failures, 8.8s total

**Defects:**
1. Exterior movement failed initially (player didn't move on ArrowUp)

**Cause:** Player exited at south side of house. ArrowUp walked into house collision (blocked). Test design issue, not game bug.

**Fix:** Changed to ArrowDown (away from house). Added fallback to try alternative direction.

**Regression:** smoke.mjs 7/7, combat.mjs 10/10 still pass

**Lesson:** When testing movement after a transition, consider where the player is relative to obstacles. Test the game, not just the input.

---

## 2026-10-11 — Doorway Discoverability Analysis (BUILD 541)

**Task:** Investigate TASK-003 (doorway discoverability 3/5)

**Expected:** Determine if doorway is actually hard to find

**Files inspected:**
- `src/App.tsx` (exit trigger: y>91 AND |x-50|<=width)
- `src/game/iso/IsoInteriorView.tsx:868` (renders "🚪 tap the door to exit")

**Tests:**
- `node tests/real-game/journey.mjs` (exit timing)
- Screenshot analysis

**Result:**
- Visual hint EXISTS in iso view ("🚪 tap the door to exit")
- Automated exit: 2.3 seconds via systematic search
- HUMAN_EXPERIENCE.md 3/5 score was based on 2D view (no hint observed)

**Defects:** None in game. Documentation was outdated.

**Cause:** The 3/5 score predated verification of the iso hint. The hint exists but human verification still needed.

**Fix:** Created docs/HUMAN_EXPERIENCE_BRAIN.md with proper evidence categories (Automated Fact / AI Hypothesis / Human Finding)

**Regression:** N/A (analysis only)

**Lesson:** Separate what tests prove from what humans need to verify. A 2.3s automated exit doesn't prove human discoverability. Label evidence clearly.

---

## 2026-10-11 — Doorway Mismatch Hypothesis CORRECTED (BUILD 542)

**Task:** Verify BUILD 541 claim that hint ("tap the door") mismatches mechanic ("walk to bottom")

**Expected:** Find evidence of mismatch, fix if confirmed

**Files inspected:**
- `src/game/iso/IsoInteriorView.tsx:264` (tap door tile → exit)
- `src/game/iso/IsoInteriorView.tsx:599` (walk onto door → exit)
- `src/game/iso/IsoInteriorView.tsx:868` ("🚪 tap the door to exit" hint)
- `src/game/iso/IsoInteriorView.tsx:887` ("🚪 Exit" button, top-right)

**Tests:**
- `node tests/real-game/discoverability.mjs` (blind, no hardcoded coords)

**Result:**
- BUILD 541 hypothesis was WRONG. No mismatch in iso view.
- Iso view has THREE consistent exit methods:
  1. "🚪 Exit" button (top-right, always visible)
  2. Tap door tile → exit (matches hint)
  3. Walk onto door tile → exit
- Blind test: exit found in 1 attempt (1.0s) via visible "🚪 Exit" button
- The "walk to y>91" mechanic is for the 2D fallback view, not the default iso view

**Defects:**
1. BUILD 541 analysis compared iso hint against 2D mechanic (wrong comparison)
2. Initial blind test didn't check for UI buttons (only canvas clicks)

**Cause:**
1. Analyzed App.tsx walk mechanic without checking IsoInteriorView's tap handling
2. Assumed exit was only via canvas interaction

**Fix:**
1. Corrected analysis: iso view is fully consistent
2. Updated blind test to check UI buttons first (Strategy 1)

**Regression:** All existing tests pass

**Lesson:** Before claiming a UI/mechanic mismatch, check ALL views (iso AND 2D fallback). The default view (iso) is what most players see. Don't compare hint from one view against mechanic from another.
