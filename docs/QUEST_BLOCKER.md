# BUILD 560 — Quest Playthrough Blocker Report

## What was attempted
Full "Rats in the Cellar" quest via real browser gameplay:
1. ✅ Start new game, exit interior
2. ✅ Navigate 78 units to tavern district (0 stuck)
3. ❌ Enter tavern building — BLOCKED
4. ❌ Talk to bartender Mira — not reached
5. ❌ Accept quest — not reached
6. ❌ Enter cellar, kill rats — not reached
7. ❌ Turn in — not reached

## Root cause
Building positions are not exposed to the test harness. In iso mode:
- Buildings render on canvas (not DOM)
- Entrances work via tap: tap building → player walks to doorway → entry fires
- To tap the tavern, the agent needs its screen position
- Screen position requires: building world pos → iso projection → camera offset
- Building world positions live in `homeScene.buildings` inside IsoFieldView
- Not accessible via `window.__gameTest`

## What's needed
A test hook exposing building positions, e.g.:
```js
getBuildings: () => [{ name, x, y, kind }]
```

This is a small, safe addition (localhost-only, observation only).
With it, the agent can compute screen positions and tap buildings.

## What WAS verified
- Agent navigation: 78 units, 85 actions, 0 stuck ✅
- Quest logic: 12/12 pure tests pass (BUILD 557) ✅
- Consistency: 7/7 checks pass ✅
- The blocker is test infrastructure, not a game bug.

## Next step
Add `getBuildings` hook, then retry tavern entry.
