# Adventure Game Benchmarks

## Baseline — Checkpoint 001

Measured from the target repository on 2026-08-30 before implementation changes.

| Metric | Baseline | Method | Status |
|---|---:|---|---|
| Target commit | 4622ee177e279bd01c5d6011d1318de6da0e4edc | GitHub main ref | recorded |
| src/App.tsx | 285 lines / 16,935 bytes | GitHub contents API | recorded |
| src/index.css | 520 lines / 28,682 bytes | GitHub contents API | recorded |
| Movement direction bindings | 8 distinct controls (WASD + arrows) | source scan | recorded |
| Movement loop | 130 ms interval | source scan | recorded |
| Movement model | one active direction, fixed 2.4 position step | source scan | recorded |
| Runtime FPS / input latency | not measured | requires local browser run | pending user test |
| Build / typecheck | not run here | user requested GitHub-only workflow | pending user test |

## Next measurement

After the movement patch, compare source metrics and record the new commit SHA. The user should run the browser locally and report whether keyboard, diagonal input, touch hold/release, chunk transitions, and stamina behavior feel correct. No runtime success is claimed by this file until that happens.


## Post-patch static measurement — Checkpoint 002

| Metric | Result | Status |
|---|---:|---|
| Target commit at measurement | b33ffb63ab9364a6cdd2ea1cd9316ce38c664f74 | recorded |
| src/App.tsx | 312 lines / 18,150 bytes | recorded |
| Browser movement loop | requestAnimationFrame + elapsed delta | recorded |
| Diagonal normalization | Math.hypot vector normalization | recorded |
| Input release safety | window blur + document visibility cleanup | recorded |
| world_generator.js | 70 lines / 2,223 bytes | recorded |
| persistence.js | 48 lines / 1,607 bytes | recorded |
| server.js | 141 lines / 4,577 bytes | recorded |
| WebSocket checkpoint cadence | 10,000 ms | recorded |
| Runtime package | ws ^8.18.0 | recorded |
| npm install / build / typecheck | not run | pending local test |
| Browser gameplay / WebSocket runtime | not run | pending local test |

## Interpretation

The fixed-step client loop was removed; the remaining interval is the in-game clock. Static checks confirm the new modules and package manifest are present. These are source measurements, not performance claims: FPS, input feel, chunk crossing, persistence, and server behavior still require the user's local run.
