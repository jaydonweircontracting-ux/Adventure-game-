# Real-Game Testing (Playwright)

Automated tests against the **actual running React game** — not mocks.

## Quick Start

```bash
# 1. Install Playwright browser (one-time)
npx playwright install chromium

# 2. Build the game
npm run build

# 3. Serve locally (in a separate terminal)
python3 -m http.server 8901 --directory dist/public

# 4. Run tests
node tests/real-game/smoke.mjs      # Level 4: app loads, hooks work
node tests/real-game/movement.mjs   # Level 5: real keyboard → real movement
```

To test the deployed site instead:
```bash
GAME_URL="https://jaydonweircontracting-ux.github.io/Adventure-game-/?testmode=1&v=534" node tests/real-game/smoke.mjs
```

## Test Hooks

The game exposes `window.__gameTest` when `?testmode=1` is in the URL.
See `src/App.tsx` (search "BUILD 533" / "BUILD 534").

Read-only methods:
- `getBuild()` → build number string
- `getPlayerPos()` → `{x, y}` field coordinates
- `getChunk()` → `{x, y}` chunk coordinates
- `getPlayerHp()` → number
- `isBlocked(x, y)` → boolean (real collision query)
- `getGoats()` → array of `{id, x, y, hp, disposition, state}`
- `isInInterior()` → boolean
- `getInteriorPos()` → `{x, y}` interior coordinates

**Security:** Hooks are testmode-only, read-only, no cheats. Never active in normal play.

## Test Levels

| Level | What | Where |
|-------|------|-------|
| L1 | Static inspection | Code review |
| L2 | Unit tests | `scripts/simulate.ts` (52k+ tests) |
| L3 | Mock integration | `scripts/playtest.ts` (gameplay agent) |
| L4 | Live app test | `tests/real-game/smoke.mjs` ← **this** |
| L5 | Automated gameplay | `tests/real-game/movement.mjs` ← **this** |
| L6 | Human verification | Phone playtest (manual) |

**Rule:** L2/L3 passing never implies L4/L5 passing. Report separately.

## Verified Results (BUILD 534, 2026-10-11)

- ✅ Page loads, React renders, no fatal errors
- ✅ `__gameTest` hooks accessible via Playwright `page.evaluate`
- ✅ Player spawns at (141,142) field / (50,78) interior
- ✅ Real ArrowRight input → interior x: 50.0 → 57.1 (dx=7.1)
- ✅ Walk to doorway (50, 90.6) → exits interior
- ✅ Field spawn at (89.4, 115.1)
- ✅ Field ArrowRight → x: 89.4 → 92.2 (real movement)

## Limitations

- Local Playwright cannot reach the internet (proxy blocks Chromium).
  Use local server for automated tests; deployed URL requires manual or CI testing.
- Combat testing needs an enemy in range (not yet automated).
- Screenshots saved to `tests/real-game/*-screenshot.png` (gitignored).
