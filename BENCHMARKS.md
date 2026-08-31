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
