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


## Wanted guards and NPC death reactions — BUILD 729

**Task:** Make NPC death stop dialogue; attacks affect disposition; corpses can be looted; guards pursue wanted players and present arrest choices.

**Root cause / integration findings:** The project already had `isNpcDead`, `damageNpc`, `LootableBody`, witness crimes, bounties, disposition and a prison scene, but these paths were not consistently joined. In particular, corpse loot used `gold`/`potions` keys while the player inventory ledger expects `coins`/`healthPotion`; alternate NPC melee hit paths did not all create bodies or record crime consequences.

**Files changed:** `src/App.tsx`; `scripts/prepare-build-entry.cjs`; `docs/TASK_QUEUE.md`.

**Behavior added:** Dead NPC dialogue/topic/free-text paths are guarded and active dialogue/barks are closed/cleared when death is observed. Each attack reduces per-NPC disposition; injured NPCs give a hostile greeting. All NPC melee damage paths now record assault/murder when witnessed and the additional death paths create lootable bodies. Corpse gold and potions map to coins and health potions; the `BodyLoot.items` extension point feeds recovered future gear into the existing equipment list. Wanted players in Mosslight are approached by a guard and offered flee, jail, or pay-fine choices; fleeing moves the player away and keeps the bounty, jail clears the bounty and enters the existing prison scene, and paying deducts the full fine and improves guard/town reputation.

**Verification:** Not run in this GitHub-only editing session. CI, typecheck, production build, and Playwright verification remain required. The task stays `in_progress` until those checks pass.

**Regression lessons:** Ensure all alternate combat pathways share equivalent NPC death/crime/loot consequences; align loot field names with the inventory ledger; use the live NPC state rather than a stale dialogue snapshot to prevent talking to dead characters.

## Wanted-guard modal input lock — BUILD 730

**Task:** Prevent movement, attacks, and world interactions from continuing while the wanted guard is presenting arrest choices.

**Root cause:** The guard encounter modal was rendered above the world, but the shared keyboard/touch input gates only checked inventory/options locks. The player could still move or trigger combat behind the modal.

**Files changed:** `src/App.tsx`, `scripts/prepare-build-entry.cjs`, `docs/TASK_QUEUE.md`.

**Change:** Add the active guard encounter to the central input-reset effect and movement/combat/interaction guards. Flee, jail, and pay-fine buttons remain active because they resolve the encounter explicitly.

**Verification:** Not run in this GitHub-only editing session. CI, typecheck, production build, and real-game Playwright verification remain pending. TASK-014 remains in progress until those checks pass.
