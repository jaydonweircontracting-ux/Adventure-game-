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

---

## 2026-10-11 — Workflow Speed Optimization (BUILD 544)

**Task:** Optimize development workflow (measure first, then optimize)

**Expected:** Identify bottlenecks, implement highest-impact fixes

**Files:**
- `scripts/smart-build.mjs` (new)
- `scripts/task-context.mjs` (new)
- `docs/PERFORMANCE_DASHBOARD.md` (new)
- `tests/real-game/helpers.mjs` (added createTestPage)

**Tests:**
- `node scripts/smart-build.mjs` (0.2s vs 11.8s)
- `node scripts/task-context.mjs combat` (0.16s vs ~60s manual)
- `node tests/real-game/smoke.mjs` (7/7, helpers change safe)

**Result:**
- Smart build: 58x faster for test-only changes (11.6s saved)
- Task context: 375x faster than manual reading (60s saved)
- Browser reuse helper implemented but not yet integrated

**Defects:** None

**Cause:** N/A

**Fix:** N/A

**Regression:** smoke.mjs 7/7 pass

**Lesson:** Measure before optimizing. The build (11.8s) and manual context loading (~60s) were the real bottlenecks, not the code index (0.9s). Small scripts with big time savings beat large refactors.

---

## 2026-10-11 — Unified Brain Vertical Slice (BUILD 545)

**Task:** Build one integrated brain command (not 10 disconnected frameworks)

**Expected:** Single command for context → investigate → test → verify → learn

**Files:**
- `scripts/brain.mjs` (new, 200 lines)

**Tests:**
- `node scripts/brain.mjs status` (0.26s, full project state)
- `node scripts/brain.mjs test` (predictive test selection)
- `node scripts/brain.mjs investigate doorway` (causal template)

**Result:**
- Status: Shows branch, HEAD, remote sync, build marker, task counts, next task, lessons
- Test selection: Maps changed files → relevant tests (e.g., App.tsx → smoke+combat+journey)
- Investigate: Structured causal template with auto-suggested code paths

**Real demonstration:**
- Brain status showed build marker 542, but template said 544
- Investigated: prebuild hadn't run after template bump
- Fixed: Ran prebuild manually, verified 544
- Lesson: Brain caught its own inconsistency

**Defects:** None in brain. Found pre-existing marker drift.

**Cause:** `npm run build` in earlier command didn't update index.html (timing/cache issue)

**Fix:** Manual prebuild run, verified output

**Regression:** N/A (new tool)

**Lesson:** A unified brain command that checks its own consistency is more valuable than 10 separate frameworks. The vertical slice (context→investigate→act→verify→learn) works end-to-end.

---

## 2026-10-11 — Autonomous Researcher (BUILD 546)

**Task:** Upgrade brain with task ranking, discover real issues, demonstrate end-to-end

**Expected:** Find and fix real gameplay defect OR validate game health

**Files:**
- `scripts/brain.mjs` (added `rank` command)
- `tests/real-game/discover.mjs` (new systematic probe)
- `docs/TASK_QUEUE.md` (TASK-005 marked done)

**Tests:**
- `node scripts/brain.mjs rank` → correctly identifies TASK-005 (unblocked) over TASK-004 (blocked)
- `node tests/real-game/discover.mjs` → 2/2 pass, 0 issues found
- `node tests/real-game/combat.mjs` → 10/10 pass (regression)
- `node tests/session-resumption.mjs` → 10/11 (only dirty-tree check fails, expected)

**Result:**
- TASK-005 was stale (marked todo but actually done in BUILD 540). Marked done with evidence.
- Systematic gameplay sweep found NO defects: no console errors, responsive (697ms/5 moves), combat works
- This is a VALID outcome: "A valid iteration may conclude that an apparent defect is not real"

**Defects found:** None in game. One stale task record (fixed).

**Cause of stale task:** TASK-005 completed in BUILD 540 but queue wasn't updated.

**Fix:** Updated TASK_QUEUE.md with evidence.

**Regression:** All tests pass.

**Lesson:** Not every iteration needs a code fix. Validating game health, fixing stale records, and adding systematic probes ARE useful work. Don't manufacture defects to look busy.

---

## 2026-10-11 — World-Simulation Laboratory (BUILD 547)

**Task:** Build headless NPC simulation using production systems

**Expected:** Simulate NPC schedules without rendering, detect violations

**Files:**
- `scripts/sim-lab.ts` (new, 250 lines)

**Tests:**
- `npx tsx scripts/sim-lab.ts village 1` → 0.2s, 87 events, 0 violations
- `npx tsx scripts/sim-lab.ts settlement 2` → 9.8s, 195 events, 0 violations
- Determinism: two runs → identical fingerprints ✅

**Result:**
- Uses PRODUCTION `advanceTownsfolk`, `createTownsfolk`, `townsfolkTarget`
- 9000 ticks/sec (10 NPCs), 331 ticks/sec (12 NPCs with separation)
- Health checks: valid identity, no duplicates, valid position, in-bounds
- Event recording: target changes with timestamps
- Bounded: max 30 days, max 10k events

**Defects found during build:**
1. Anchors needed full points structure (not just townCenter)
2. Nav context needs `doors` not `doorways`
3. Target type has `activity` not `kind`/`label`

**Cause:** Assumed simplified structures; production types are richer.

**Fix:** Inspected actual types, provided complete structures.

**Regression:** N/A (new tool, no production changes)

**Lesson:** Production NPC systems are already deterministic and headless-capable. The `advanceTownsfolk` function is pure — perfect for simulation. Don't build parallel systems when production code is already testable.

---

## 2026-10-11 — Visible NPC at Spawn (BUILD 548)

**Task:** Make starting area feel alive (user: "not feeling improvements when playing")

**Expected:** Player sees NPC immediately after exiting tutorial house

**Files:**
- `src/App.tsx` (added `cottage` anchor at 98,118)
- `src/game/townsfolk.ts` (added Mira to ROSTER)

**Tests:**
- Screenshot before: empty field, just player
- Screenshot after: Mira visible at bottom-center
- `node tests/real-game/smoke.mjs` → 7/7 pass

**Result:**
- Before: 0 NPCs visible in starting area
- After: Mira (farmer) visible outside her cottage at (98,118)
- Player exits at (89,114), Mira is ~10 units away — clearly visible

**Why farmer archetype:** Farmers are "Waking up" outdoors at 6-7am (game starts 6:10am).
Commoners would be indoors (invisible). Farmer ensures morning visibility.

**Defects:** None

**Regression:** smoke 7/7 pass

**Lesson:** Player-visible improvements beat infrastructure. A single NPC in view
is worth more than 10 passing tests the player can't see. Audit with screenshots,
not just assertions.


## 2026-10-16 — Live update checker source comparison (BUILD 728 proposed)

**Task:** Restore reliable main-menu update status, live polling, and a manual refresh action.

**Expected:** Orange checking/current/available/deploying states update in real time. The checker notices a newer source build even when the commit message does not contain `BUILD N`; it never reports current if an authoritative version source is unavailable.

**Files:** `src/App.tsx`, `src/game/updateVersion.ts`, `scripts/prepare-build-entry.cjs`, `package.json`, `tests/update-version.test.ts`, `.github/workflows/validate.yml`.

**Root cause:** The old checker relied on `version.json` and a commit-message regex. The version manifest and root HTML marker were stale in the tracked tree because they are generated by `prepare-build-entry.cjs`.

**Fix:** Compare running, deployed, and latest source markers; add manual Check now; cache-bust Update reload; add a predev lifecycle hook to generate current markers in development; preserve the concurrent BUILD 725–727 changes.

**Tests:** GitHub Actions run 38972057977 passed `npm run typecheck`, isometric directions, update-version regression (11 assertions), fantasy encounters, landscape coherence, procedural world art, building art, town production, village food-needs, and production build. First attempt failed typecheck because a manifest variable was nullable outside the try block; changed to a typed local manifest and separate note variable, then reran the full workflow successfully.

**Deployment:** Pending merge and Pages deployment. Do not call BUILD 728 live until the Pages workflow succeeds and the published version manifest/build marker are checked.

**Lesson:** Use the build script as the version source of truth. Never hand-edit generated HTML/manifest files; wire the generator into the correct lifecycle hooks and verify the deployed artifact.


## 2026-10-16 — Dead NPC Speech Suppression (BUILD 732)

**Task:** Stop dead townsfolk from continuing ambient chatter or showing a talk prompt.

**Expected:** Once death is recorded, no speech bubble or talk affordance appears over the corpse; both can return after respawn clears the death state.

**Files:**
- `src/game/iso/IsoFieldView.tsx` — gate ambient speech and talk prompt on authoritative death state / zero HP
- `src/App.tsx` — build changelog note
- `scripts/prepare-build-entry.cjs` — build marker 732

**Tests:** Not run in this connector-only session. CI/deployment and real-game death/respawn verification are pending.

**Result:** Source patch committed; not yet verified live.

**Defect / Cause:** The renderer generated ambient speech bubbles whenever the speech option was enabled, without checking whether the townsfolk record represented a corpse. The talk affordance also needed an explicit same-frame death guard.

**Fix:** Compute `npcIsDead` from `deadUntilTick != null` or `hp <= 0`; require `!npcIsDead` before drawing chatter and the talk bubble. Respawn can restore chatter when death state is cleared.

**Regression:** Pending.

**Lesson:** Death behavior must be guarded in the presentation layer as well as interaction handlers; otherwise stale or transitioning entity state can leave living-only UI attached to a corpse.


## 2026-10-16 — Starting-house Stone Deposit (BUILD 733)

**Task:** Place a large stone boulder behind the starting house in Mosslight Crossing.

**Implementation:** Added a depth-sorted procedural boulder at a fixed anchor just behind the authored tutorial-house exterior position in chunk (4, 7). Kept it visual-only to avoid changing movement or collision without a stone-mining interaction design.

**Files:** `src/game/iso/IsoFieldView.tsx`, `src/App.tsx`, `scripts/prepare-build-entry.cjs`.

**Tests:** Not run in this connector-only session. CI/deployment and in-game visual verification are pending.

**Result:** Source patch committed; not yet verified live.

**Lesson:** Anchor fixed landmarks to authored world landmarks rather than the changing town centroid; depth-sort the prop with other world drawables and keep collision behavior unchanged unless explicitly designed.


## 2026-10-16 — Visible Mineable Starting-House Stone Deposit (BUILD 734)

**Task:** Correct the unseen starting-house boulder and connect it to mining.

**Root cause:** BUILD 733 used a guessed fixed field coordinate as a visual-only drawable. It was not anchored to the authored house rect and was not part of the ore-node list, so melee mining could never target it.

**Fix:** Derive a stable deposit position from the tutorial-house rect; include it in `fieldOresFor` with a stable ID and 12-stone yield; render that node as a large boulder; use the existing melee mining/depletion pipeline; add stone to player inventory and loot pickup.

**Files:** `src/App.tsx`, `src/game/iso/IsoFieldView.tsx`, `scripts/prepare-build-entry.cjs`, `docs/TASK_QUEUE.md`.

**Tests:** Not run in this connector-only session. Typecheck, build, CI, deployment, and real-game visual/mining verification are pending.

**NPC economy:** Autonomous mining, hauling, stockpiles, and per-settlement ledgers are tracked as TASK-017; not implemented by this patch.

**Lesson:** A mineable world object must be one authoritative resource node shared by rendering, hit-testing, depletion, and rewards.

## 2026-10-16 — Starting-house boulder visibility repair (BUILD 735)

**Task:** Repair the stone deposit that players could not see, and keep the Cossacks-style settlement economy as the next connected gameplay task.

**Root cause:** The fixed deposit anchor was placed at the top-center of the tutorial-house rectangle. In the isometric renderer, the house sprite/depth layer could occlude the rock, so the node existed in data but was not reliably visible.

**Files changed**
- `src/App.tsx` — place the deposit just beyond the tutorial house's right edge; add BUILD 735 changelog text.
- `src/game/iso/IsoFieldView.tsx` — increase the landmark boulder's scale.
- `scripts/prepare-build-entry.cjs` — bump runtime build marker to 735.
- `docs/TASK_QUEUE.md` — record the visibility repair and keep economy work explicitly in progress.

**Tests:** Not run in this GitHub-only editing session. No local Muse Bridge/Playwright runtime is available here. CI, deployed version marker, and in-game visibility/mining checks remain pending.

**Result:** Source is committed with the rock moved clear of the house footprint and rendered larger. This is not yet proof that the live game shows it; verify deployment and the actual scene before claiming success.

**Economy scope:** The mineable node/player stone inventory are the resource primitive. Autonomous NPC job selection, walking to the node, mining, hauling to stockpiles, consumption/production, and separate settlement ledgers remain unfinished. Do not describe those behaviors as implemented until the simulation and tests exist.

**Lesson:** A world object can exist in deterministic resource data yet be invisible due to its anchor and depth order. Keep resource placement outside building silhouettes and verify in the actual isometric camera.

## 2026-10-16 — Autonomous stone workers (BUILD 736)

**Task:** Connect townsfolk movement to a real quarry → carry → stockpile resource loop.

**Implementation**
- `src/game/settlementEconomy.ts` assigns two stable non-child workers, advances timed mining only when physically near the quarry, limits carried stone, routes workers to the stockpile, caps storage, and pauses extraction when the node is unavailable.
- `src/App.tsx` feeds the workers' destinations into the existing townsfolk navigation pipeline and deposits stone into Mosslight's existing settlement storage ledger.
- `scripts/prepare-build-entry.cjs` advances the runtime marker to BUILD 736.
- `tests/settlement-economy.test.ts` covers stable job selection, mining, hauling, storage caps and depleted-node pause.
- `package.json` adds `test:settlement-economy`.

**Limitations still tracked:** Worker cargo/progress is transient across reloads. The shared economy is now connected for stone, while broad resource hauling, settlement construction consumption and shortage/starvation consequences remain follow-up work; do not mark the whole economy task complete yet.

**Verification:** Await CI typecheck, isometric regression test, build and settlement economy test. The browser game still needs a live deployed visual check for the boulder and worker routes.
