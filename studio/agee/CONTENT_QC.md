# Content Quality Control System

**Status:** DOCUMENTED ONLY (registry D7). No content QC system exists as a named system — but the verification pipeline it must use **does** exist. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 12 ("BUILD A CONTENT QUALITY CONTROL SYSTEM").

## What it is

Content QC checks generated (and placed) content before it reaches the player. It answers one question: **is this content good enough to ship?** "Good enough" means coherent, playable, reachable, and free of the defects listed below. Content that fails is rejected with a reason — never silently placed, never silently fixed by deleting the evidence.

## The checks (every piece of content passes all of them)

| Check | What it catches | How it is proven |
|---|---|---|
| **Coherence** | Content that does not fit its surroundings (a fishing village with no water, a mine with no rock, a shop with no road, a ruin with no origin). | The world content factory's coherence check (`WORLD_CONTENT_FACTORY.md`) + a human-readable reason for every rejection. |
| **Playability** | Content the player cannot use (a quest whose target is unreachable, a building whose door does not open, a shop with no stock, an NPC who cannot be reached). | The quest engine's validation (`QUEST_ENGINE.md` — a quest must never be impossible to finish) + the 1030 player A* (can a path be planned to it?). |
| **No broken quests** | A quest that cannot be completed, that softlocks, or whose reward cannot be delivered. | Quest validation (all six checks in `QUEST_ENGINE.md`) + a sim run that accepts, progresses, and completes the quest. |
| **No unreachable content** | Content behind an impassable wall, inside a sealed pocket, or with no path. | Reachability via the player A* (`playerPath.ts`, 1030) — if no path exists, the content is rejected. |
| **No duplicate NPCs** | Two NPCs with the same identity, or an NPC who is in two places at once. | The NPC roster (`ROSTER_3D`, 47 NPCs) is the authority — a generated NPC must not duplicate an existing roster entry, and an NPC's position must be single and consistent. |
| **No invalid inventories** | Negative gold, an item that does not exist, a quantity that cannot occur. | Inventory validation against the item registry (`items.ts`, 2D-only — extraction source). Negative gold, a nonexistent item, or an impossible quantity is rejected. |
| **No broken doors** | A door that does not open, a door trigger that does not match the doorway, an exit that lands in the wrong place. | The standing door rule (painted door, door trigger, interior entrance, exterior exit, and path endpoint must all agree) + the standing quality bar (doors and paths must line up). |
| **No invalid world state** | An NPC with no home, no bed, or an invalid workplace; a building with no collision; an entity outside valid bounds; an excessive entity count. | The world-health checks (SOUL.md §17 — the world health list) + the sim's entity-count assertions. |

## The quality gates it uses

Content QC runs inside the **four quality gates** (§50), with real evidence for each gate (name, status, timestamp, test/command, result, commit):

1. **LEVEL 1 — IMPLEMENTED.** The content exists and runs. (It was generated, it is in the world, it does not crash the game.)
2. **LEVEL 2 — INTEGRATED.** The content is wired into the rest of the game. (The quest's giver is an NPC with a schedule; the shop's stock is in the economy; the dungeon's entrance is on a road — not a standalone demo.)
3. **LEVEL 3 — VERIFIED.** The content is proven by the verification pipeline: sim vs pristine baseline (0 FAIL), standalone asserts (throwing, run directly — no pipe, no `&&` chain), phone probe (390×844, 0 page errors), live verify by content marker (served `version.json` build + note).
4. **LEVEL 4 — POLISHED.** The content reads well, handles edge cases, and survives a real playtest. (A gate level is only claimed when a per-build evidence record exists for it — see `MUSE_EVOLUTION.md` v1.1, the gate-evidence rule. The dashboard data was corrected on 2026-11-07 because it had claimed Level 4 for builds 1016–1029 without per-build Level-4 evidence.)

A gate that has not run is **NOT RUN**. A gate that fails is **FAILED**. Missing results are never silently treated as passing.

## The verification pipeline it uses (already exists — do not duplicate)

| Piece | Status | What it does |
|---|---|---|
| `scripts/simulate.ts` | Exists (11,339 lines, ~679 KB, 41k+ assertions) | The sim suite. Runs against a pristine baseline; the comparison must be IDENTICAL (0 FAIL) except for the known 684 rig crash. **Known gap:** the 684 rig crash (`assetMetaFor` returns null for 5 variants — cottage-wide, hall-grand, house-balcony, house-tall, shop-banner; `simulate.ts` crashes; ~1,000 sim lines after the rig section unverified, open since 2026-10-21, awaiting user word). QC cannot claim a sim is complete while the rig crash masks part of it. |
| Standalone asserts (`~/workspace/verify*/`) | Exists per build | Throwing asserts, run directly (no pipe, no `&&` chain — a piped run once returned a false failure). The 1030 asserts (97 entry + 47 runner checks) are the model. |
| Playwright phone probe (390×844) | Exists, **currently blocked** | Chromium will not launch (SIGTRAP ~100ms after launch; 8 variants tried). The probe scripts are ready (`~/workspace/verify1030/probe1030-after.mjs`). QC cannot run a phone probe until the environment recovers. |
| GitHub Actions CI | Exists (`.github/workflows/deploy-pages.yml`) | Runs typecheck + ~12 regression tests + build + update-version check, then Pages deploy. |
| Git (commit/push) | **Currently blocked** | Git cannot write (EPERM on overlayfs). QC cannot commit or push until the environment recovers. |

## What content QC does NOT do

- It does not approve its own output. The factory generates; QC checks; the Verification Engine proves. The generator never grades its own homework.
- It does not hide failures. A rejected piece is logged with the reason. A failed gate is FAILED, not "mostly passed."
- It does not claim a sim is complete while the 684 rig crash masks ~1,000 lines. That gap is recorded, not papered over.
- It does not invent a crafting/fishing/mining check for a system that does not exist. (Honesty rule.)
