# Performance Baseline — BUILD 565

## Environment
- Date: 2026-10-12
- Browser: Chromium (Playwright)
- Build: Production (vite)

## Measurements

### Startup
- Page load to interactive: ~3-5s (networkidle)
- New game click to hooks available: ~2s

### Navigation (78-100 units)
- Actions: 163-169 for ~100 units
- Time: ~90-110s
- Stuck incidents: 0

### Tavern Entry
- Actions: ~165 total (nav + align + enter)
- Success rate: 10/10

### Memory (qualitative)
- No observed leaks in 10x entry test
- Browser stable across 10 fresh game instances

## Bottlenecks Identified

1. **Navigation speed**: 90s for 100 units is slow for testing
   - Cause: Real-time movement (by design for gameplay)
   - Not a game bug — test harness could use faster setup

2. **Coordinate calculation**: Manual screen math fragile
   - Fixed with __interiorTapTile hook

## Next Steps
- Profile frame time during crowded scenes
- Measure chunk generation time
- Audit NPC update costs


## BUILD 716 — repeatable renderer profiling

Use the production or development game URL with `?perf=1` appended while viewing the isometric field. The on-canvas overlay reports:

- **Render avg** — mean duration of the last up-to-120 renderer frames.
- **P95** — 95th percentile of the sampled render durations.
- **FPS est.** — reciprocal of average renderer duration. This is an estimate of render-loop throughput, not a guarantee of displayed FPS.

For a useful before/after comparison, keep the device, browser, window size, zoom, chunk, and nearby NPC/prop density the same. Capture at least 10 seconds after the scene settles; note both average and P95. Repeat with a crowded settlement and while walking. Remove `?perf=1` for normal play.

No new measured frame-time numbers are recorded in this document yet. The overlay establishes the measurement path; actual device measurements must be captured rather than guessed.
