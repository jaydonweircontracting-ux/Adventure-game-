# Overnight Progress Log

Autonomous development session. Updated after every major completed task.
Session started: 2026-09-28 ~01:30 PDT. Current build: **BUILD 162** (in progress).

## Current Phase
MAP REBUILD per the Map Rebuild Master Prompt (audit → fix real bottlenecks → verify).

## Current Task
Build 162: cache the map atlas at module level, zoom-LOD label overlay, Stormhaven
ocean fix, tutorial-house beds removed + smith NPC, debug/playtest tooling.

## Completed Tasks
- 2026-09-28: BUILD 161 pushed live (c348c9d). Mount 1.35x scale removed; world map
  rewritten from ~16.5k DOM nodes to one pre-rendered canvas; second continent moved
  to x 117..196 (96-tile ocean gap); 7 new continent settlements + road web.
- 2026-09-28: Build-160 browser playtest completed: no prison opening, character
  creator buttons, whole trees, guild enterable, Bram (Craft/Sell/Rumours) all PASS.
  Screenshots undeliverable (handoff tooling rejected paths; verified by observation).

## Bugs Found
- Stormhaven (125,-16) sits on OCEAN under the real seed 847291583. Build 161's
  coordinate check used seed 1 by mistake. Fix: move to (130,-16) forest, on the
  existing road leg.
- Map atlas re-renders from scratch on EVERY map open (useMemo per mount). ~16.5k
  tiles x 6 passes each open. Fix: module-level cached terrain atlas.
- No zoom LOD: all 21 settlement labels + region labels baked into one canvas at
  every zoom. Fix: separate label overlay canvas redrawn per zoom tier.
- No debug map mode, no map<->world validation tooling.

## Bugs Fixed
- (pending this build) Stormhaven relocation; atlas caching; label LOD overlay.

## Tests Run
- Settlement coordinate validation vs real seed: 6/7 OK, Stormhaven BAD (ocean).
- Full sim suite (33,014 cases) to be re-run after build 162 changes.

## Performance Findings
- World gen runs ONCE at module load (line 100 App.tsx) — map open never
  regenerates the world. The old DOM-map lag is gone; remaining open cost is the
  per-open atlas re-render, fixed by module-level caching.

## Files Changed (this session)
- docs/OVERNIGHT_PROGRESS.md (new)
- docs/AUTONOMOUS_TASK_QUEUE.md (new)
- docs/BUG_DATABASE.md (new)
- docs/DECISIONS.md (new)
- src/App.tsx (build 162 changes)
- scripts/simulate.ts (map validation tests)

## Known Problems
- Browser screenshot delivery failed in the 160 playtest (tooling-side). Mitigation:
  `?debug=1` diagnostics overlay added so playtests can verify via text.

## Next Priority
1. Finish build 162, typecheck, sim, push, live playtest.
2. Visual QA of the new map overlay at all zoom tiers.
3. Continue priority loop: perf -> world consistency -> gameplay -> visuals.

## Last Verified Build
BUILD 161 (pushed c348c9d, 2026-09-28). BUILD 162 in progress, not yet pushed.
