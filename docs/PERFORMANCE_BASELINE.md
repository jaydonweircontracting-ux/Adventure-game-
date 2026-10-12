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
