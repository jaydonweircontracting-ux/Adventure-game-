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


## Post-hardening static measurement — Checkpoint 004

| Metric | Result | Status |
|---|---:|---|
| package.json Node engine | 20.x | recorded |
| Netlify build command | npm run build | preserved |
| Netlify publish directory | dist/public | preserved |
| Netlify SPA fallback | /* → /index.html | preserved |
| Static third-party import audit | no undeclared imports | recorded |
| npm install / build / typecheck | not run | pending local test |

## Interpretation

The deployment contract is now declared both in package.json and netlify.toml, and the README explicitly keeps the optional Node/WebSocket server outside the static Netlify path. Static inspection does not prove a successful build; local validation remains required before claiming runtime success.


## Post-horse static measurement — Checkpoint 005

| Metric | Result | Status |
|---|---:|---|
| src/App.tsx | 26,902 bytes | recorded |
| src/index.css | 36,469 bytes | recorded |
| Walk speed | 32 | recorded |
| Mounted speed | 118 (~3.7× walking) | recorded |
| Mount proximity threshold | 11 percentage points | recorded |
| Horse persistence state | chunk + local position | recorded |
| New package dependencies | 0 | recorded |
| npm install / build / typecheck | not run | pending local test |
| Browser gameplay / horse runtime | not run | pending local test |

## Interpretation

The horse slice is browser-only and preserves the static Netlify deployment contract. Static source checks confirm the horse remains rendered after dismount and is not tied to the optional Node/WebSocket server; runtime feel and build success still require local validation.


## Post-layout follow-up — Checkpoint 006

| Metric | Result | Status |
|---|---:|---|
| Contextual mount control | positioned from horse coordinates | recorded |
| Old bottom-bar mount control | removed | recorded |
| Horse CSS scale | 0.68 | recorded |
| Horse persistence logic | unchanged | preserved |
| Netlify configuration | unchanged | preserved |
| npm install / build / typecheck | not run | pending local test |
| Browser layout / horse runtime | not run | pending local test |

## Interpretation

The follow-up keeps the control visually associated with the horse and reduces the horse footprint without changing the browser-only gameplay contract or Netlify deployment path.


## Post-riding composition measurement — Checkpoint 017

| Metric | Result | Status |
|---|---:|---|
| Mounted markup animal-head overlay | present in source and active Pages bundle | recorded |
| Animal overlay stacking | z-index 3 above rider z-index 2 and body z-index 1 | recorded |
| Directional overlay rows | down -32px; up -64px; side row 0 with right flip | recorded |
| Mounted overlay animation | horse-walk, 4 frames, 0.48s steps | recorded |
| Published cache key | rider-animal-head-1 | recorded |
| npm install / build / typecheck | not run | pending local test |
| Browser gameplay / riding feel | not run | pending local test |
