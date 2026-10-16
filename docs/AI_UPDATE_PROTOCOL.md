# Fast Game Update Protocol

This is the standing short path for future game-change commands. Follow the authoritative engineering rules; speed must come from targeted inspection and testing, never from skipping verification.

## Start here (one pass)
1. Read `docs/TASK_QUEUE.md`, the latest entry in `docs/LEARNING_LOOP.md`, and this file.
2. Check `docs/CODE_INDEX.md` if present; search existing systems before adding anything. Extend the existing implementation; do not duplicate it.
3. Use `node scripts/brain.mjs task <keyword>` and `node scripts/reuse-index.mjs <keyword>` when available. Run `node scripts/central-brain.mjs status` when available.
4. Inspect the exact runtime path and its callers before editing. Write a one-sentence root cause first.

## Small, fast change loop
1. Patch the smallest causal surface; avoid broad rewrites and unrelated cleanup.
2. For renderer bugs, inspect shared renderer/state/asset-loading paths first; test transitions (for example idle/walk -> attack -> recovery), not just static frames.
3. Run the narrowest relevant regression test, then `npm run typecheck`, `npm run test:iso-directions`, and `npm run build` when the environment is available. Run real-game Playwright tests for behavior changes; compilation alone is not verification.
4. Bump the build marker in `scripts/prepare-build-entry.cjs` and add the matching note to `BUILD_NOTES` in `src/App.tsx`. Never hand-edit generated build output.
5. Verify the Actions workflow and deployed `version.json`/build marker. Only then say the update is live and provide a fresh play URL with a new `?v=<build>` value.

## Evidence and honesty
- Record root cause, exact files, tests actually run, results, deployment state, and lessons in `docs/LEARNING_LOOP.md`.
- Keep `docs/TASK_QUEUE.md` current; only mark work done when the required evidence exists.
- If a tool cannot access the local Muse Bridge/Playwright runtime, state the exact blocker instead of claiming tests passed.
- Never repeatedly fetch huge files when a targeted range or code-index/reuse-index search answers the question.
- Bound retries: diagnose each failure, change strategy, and stop after three attempts per strategy.

## Learned renderer regression
Equipment sprites must retain their last-good image across animation-state transitions. A cache key that includes the animation name isolates Walk and Attack caches, allowing a weapon layer to disappear while the Attack asset loads or when it is missing. Cache the last-good layer by equipment item and facing; update it as valid frames arrive.
