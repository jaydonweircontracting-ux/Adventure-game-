# Human Experience Brain

**Purpose:** Evaluate the game from a player's perspective across 5 dimensions.
Separates automated facts from AI hypotheses from human findings.

## Evaluation Dimensions

### 1. Clarity
*Does the player understand what they can do?*

### 2. Responsiveness
*Do controls and interactions behave predictably?*

### 3. Discovery
*Does exploration encourage the player to investigate?*

### 4. Feedback
*Do actions produce understandable consequences?*

### 5. Reward
*Do useful actions feel worthwhile?*

## Evidence Categories

- **AUTOMATED FACT:** Measured by test, reproducible
- **AI HYPOTHESIS:** Inference from code or screenshots, not human-verified
- **HUMAN FINDING:** Actual playtest by a person

---

## 2026-10-11 — Doorway Discoverability Evaluation (BUILD 541)

### Scenario
New player starts game in tutorial house interior. Needs to find exit.

### Intended Experience
Player sees clear visual indication of how to leave the room.

### Observed Behavior

**AUTOMATED FACT:**
- Interior exit trigger: walk to y>91 AND |x-50| <= doorwayHalfWidth
- Iso view renders "🚪 tap the door to exit" at door tile (IsoInteriorView.tsx:868)
- Journey test: automated player found exit in 2.3 seconds by walking to bottom-center
- Exit position (89, 114) is not blocked, exterior movement works

**AI HYPOTHESIS:**
- The text hint "🚪 tap the door to exit" is visible in screenshots and likely sufficient for most players
- However, the hint says "tap the door" but the actual mechanism is walking to the bottom — there may be a mismatch between instruction and action
- The door visual itself is not clearly visible in the screenshot (just the text)

**HUMAN FINDING:**
- None yet — requires actual human playtest

### Severity
P3 — Functional but discoverability uncertain for real humans

### Proposed Improvement
Options (in order of minimal change):
1. Verify the door has a clear visual (not just text) — check if door tile renders distinctly
2. If text says "tap" but action is "walk", align the instruction with the mechanism
3. Consider a subtle pulsing highlight on the doorway

### Risk
Low — visual-only changes, no collision or transition logic touched

### Test Needed
Human playtest: "Start a new game. Find a way out of the room without any instructions."

---

## 2026-10-11 — Player Journey Evaluation (BUILD 541)

### Scenario
Complete new-player journey: start → move → exit → explore exterior

### Intended Experience
Player learns controls naturally, exits confidently, explores freely.

### Observed Behavior

**AUTOMATED FACT (journey.mjs 6/6 pass):**
- Game loads, player at (50, 50) in interior
- Arrow keys move player (0.9 units in 500ms)
- Exit found in 2.3s via systematic search (not random)
- Exterior position valid, movement works (2.9 units in 800ms)
- 0 move failures in 9 attempts
- Total journey time: 8.8 seconds

**AI HYPOTHESIS:**
- Movement speed feels slow (0.9 units/500ms = 1.8 units/sec) but this is intentional per BUILD 377
- The systematic exit search (walk to x=50, then down) worked quickly, suggesting the doorway is logically placed
- A real human might take longer if they don't think to walk to the bottom

**HUMAN FINDING:**
- None yet

### Severity
P4 — Works well for automated test; human experience unknown

### Proposed Improvement
None yet — await human feedback

### Risk
N/A

### Test Needed
Human playtest with timing: "How long did it take you to figure out how to leave?"

---

## 2026-10-11 — Combat Feedback Evaluation (BUILD 540 data)

### Scenario
Player attacks a goat

### Intended Experience
Player understands they hit, sees damage, enemy reacts

### Observed Behavior

**AUTOMATED FACT:**
- Space triggers attack (isAttacking=true)
- Damage numbers appear (combat text layer)
- Goat HP decreases (40→31→22→13→4→0)
- Goat disposition changes to 'aggressive' when hit
- Death: disposition='defeated', loot drops
- Sound plays ('baa')

**AI HYPOTHESIS:**
- Combat feedback seems comprehensive (visual damage numbers, enemy reaction, sound, loot)
- The 600ms cooldown is noticeable but reasonable for game feel

**HUMAN FINDING:**
- None yet

### Severity
P5 — No issues identified

---

## Summary: What We Know vs What We Don't

### Known (Automated Facts)
- Doorway works mechanically (2.3s to exit via systematic search)
- Visual hint exists ("🚪 tap the door to exit")
- Movement works in interior and exterior
- Combat has full feedback loop
- Loot drops and pickup work

### Hypothesized (AI Inference)
- Hint text may be sufficient for most players
- "Tap the door" vs "walk to exit" might confuse
- Movement speed is intentional but might feel slow to new players

### Unknown (Requires Human)
- Does a real person notice the exit hint?
- How long does it take a human to exit? (vs 2.3s automated)
- Does combat FEEL good? (vs just working)
- Is exploration enjoyable? (vs just functional)
- What confuses new players?
