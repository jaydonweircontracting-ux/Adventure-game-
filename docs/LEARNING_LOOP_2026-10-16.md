# Learning Loop — 2026-10-16 — Dagger attack sprite fix (BUILD 727)

**Task:** Keep the equipped dagger/weapon visible when changing from idle/walk into attack.

**Root cause:** The equipment last-good sprite cache key included animation name (`equipment:animation:facing`). Walk and Attack therefore used separate caches; when Attack art was loading or missing, its cache had no previous weapon frame to draw, so the dagger disappeared.

**Files changed**
- `src/game/iso/characterSystem.ts` — cache fallback equipment by item + facing, preserving the last valid sprite across animation transitions.
- `src/App.tsx` — build 727 changelog note.
- `scripts/prepare-build-entry.cjs` — build marker bumped to 727.
- `docs/AI_UPDATE_PROTOCOL.md` — persistent fast-path instructions for future game commands.

**Tests:** Not run in this GitHub-only editing session; local Muse Bridge/Playwright runtime was unavailable. CI and deployment verification remain required.

**Expected result:** The previous valid dagger layer stays visible during the Attack transition and is replaced by attack-frame art as it loads. If an Attack equipment PNG is missing, the weapon remains visible using the last-good frame.

**Follow-up verification:** Check live build 727, repeated attacks, all eight facings, and existing combat + iso-direction tests. Do not claim visual verification until those checks pass.

**Lesson:** Cache fallback assets across animation-state transitions, not just within one animation. Future commands should use `docs/AI_UPDATE_PROTOCOL.md` and verify deployment before returning the play link.
