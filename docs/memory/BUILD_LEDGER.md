# BUILD LEDGER

## BUILD 574 — 46beddf
**Rat damage pipeline fix.**
- Root cause 1: attackGoat looked up rats in goatsRef (not cellarRatsRef) → wrong target.
- Root cause 2: damage gate used 0-100 arc check, not tile adjacency.
- Verified: HP 12→3 on adjacent strike in browser.

## BUILD 575 — bd5f38d + e66bc23
**Goats exist.**
- Root cause: 'goat' kind missing from spawn table.
- Added goat to kinds (1/5 chance). Mapped to deer sprite.
- Created scripts/sim-clock.mjs (SimClock + ExperienceEvaluator).

## BUILD 576 — dcb3dfe
**Distinct goat visuals.**
- Goats render with curved horns + white tint.
- Distinguishable from deer.

## BUILD 577 — 995a6f6
**Live telemetry.**
- scripts/telemetry.mjs observes browser gameplay.
- Records events, tracks discoveries, estimates state.
- Verified: 2 sim-minutes, 0 animals in safe zone (expected).

## BUILD 578 — c402f94
**Goat discovery measured.**
- 3 runs × 100 steps north: 0/3 goats discovered.
- Recorded as baseline, not a proven bug.
- Rat quest: combat works, 5-kill test blocked by timing.
