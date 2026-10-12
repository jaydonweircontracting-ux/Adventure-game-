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
