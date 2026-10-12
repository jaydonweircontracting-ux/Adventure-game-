# Development Performance Dashboard

**Purpose:** Track workflow speed improvements with real measurements.
Updated when optimizations are implemented.

## Baselines (2026-10-11, BUILD 542)

| Metric | Baseline | Notes |
|--------|----------|-------|
| Code index generation | 0.9s | `node scripts/gen-code-index.mjs` |
| Full Vite build | 11.8s | `npm run build` |
| Smoke test | 5.0s | Includes ~3s browser launch |
| Journey test | 9.3s | Includes ~3s browser launch |
| Discoverability test | 5.0s | Includes ~3s browser launch |
| Combat test | ~15s | Includes ~3s browser launch |
| Task context load (manual) | ~60s | Reading files, git log, etc. |
| Session resumption test | 0.1s | `node tests/session-resumption.mjs` |

## Optimizations (BUILD 544)

### 1. Smart Build Script
- **File:** `scripts/smart-build.mjs`
- **Before:** 11.8s (always full build)
- **After:** 0.2s (when only tests/docs changed)
- **Saving:** 11.6s per test-only iteration (58x faster)
- **Safety:** Checks git status for src/, public/, index.html changes

### 2. Task Context Loader
- **File:** `scripts/task-context.mjs`
- **Before:** ~60s (manual file reading)
- **After:** 0.16s
- **Saving:** ~60s per task investigation (375x faster)
- **Provides:** Git state, relevant modules, recent commits, lessons, related tasks

### 3. Browser Reuse Helper
- **File:** `tests/real-game/helpers.mjs` (`createTestPage`)
- **Status:** Implemented, not yet integrated into runner
- **Potential:** ~3s saved per test (12s per full suite)
- **Next:** Create unified runner that uses single browser

## Bottlenecks Identified (Not Yet Fixed)

1. **Browser launch per test** (~3s × 5 tests = 15s overhead)
   - Fix: Unified runner with single browser instance
   - Effort: Medium (requires refactoring test files)

2. **No test selection by risk**
   - Fix: Risk classifier (LOW/MEDIUM/HIGH) + tiered test selection
   - Effort: Medium

3. **Combat test duration** (~15s, longest test)
   - Cause: Multiple attack cycles with cooldown waits (necessary)
   - Fix: None safe (timing is gameplay-realistic)

## Success Metric
**Verified improvements per unit time** — not raw speed.

A 58x faster build is only valuable if it enables more verified game improvements.
