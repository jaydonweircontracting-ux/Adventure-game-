# ASHFALL — Evolution Ledger

**Version:** 1.0 — 2026-11-07
**Source:** SOUL.md §53 (Autonomous God-Tier Development Directive — "One particularly important idea: The Evolution Ledger"). This file is the ledger's specification and its first entries.
**Status:** DOCUMENTED ONLY (registry R7: §53 is DOCUMENTED ONLY; no Evolution Ledger exists in code). This file is the specification + the first scored entries. It is not a claim that an automated ledger exists.

## The idea

Think of it as Bitcoin mining, but for development quality.

Every development operation attempts to discover a valuable improvement. It receives a score based on:

* Visual improvement.
* Gameplay improvement.
* Performance improvement.
* Stability improvement.
* Architectural improvement.
* Implementation cost.

**An improvement is accepted only after testing demonstrates that it is worthwhile.**

Over time, ASHFALL builds a permanent record of successful improvements and learns which development strategies produce the best results. This creates **compounding improvements rather than endless random changes.**

## The scoring template

Score each dimension on a simple scale. The scale is deliberately coarse — the point is a recorded judgement with evidence, not false precision.

| Dimension | −2 | −1 | 0 | +1 | +2 |
|---|---|---|---|---|---|
| Visual improvement | Visibly worse | Slightly worse | No visible change | Noticeably better | Dramatically better |
| Gameplay improvement | Breaks a loop | Slightly worse | No change | Noticeably better | Transforms a loop |
| Performance improvement | Measurably slower | Slightly slower | No measurable change | Measurably faster | Dramatically faster |
| Stability improvement | Introduces a crash/regression | Slightly less stable | No change | Fixes a real failure mode | Eliminates a class of failures |
| Architectural improvement | Adds duplication/coupling | Slightly worse | No change | Cleaner / more reusable | Removes a duplicate system or a structural debt |
| Implementation cost | (cost is recorded separately — see below) | | | | |

**Implementation cost** is recorded as: files changed, lines changed (approximate), and the verification effort (tests written, asserts, sim runs, phone probes). Cost is not scored on the −2/+2 scale; it is the denominator. A +2 gameplay improvement that costs 7 files and a full verification suite is worth more than a +1 improvement that costs a rewrite.

**Verdict:** ACCEPT or REJECT, with the evidence that justifies it. ACCEPT requires testing that demonstrates the improvement is worthwhile (the quality gates — see `studio/TEST_STATUS.md`). A change that was not tested is not accepted, however good it looks on paper. A change that scores negative on any dimension and is not outweighed by a larger positive elsewhere is rejected (or reworked).

**What the ledger is not:** it is not a percentage, not a "completion score", and not a progress bar. It does not produce a single number that claims the game is "73% done". It is a record of individual operations, each scored with evidence, so the project can learn which strategies produce the best results.

## Entries

### BUILD 1030 — Tap-to-walk pathfinding (worked example)

**What it is:** Player tile A* (new pure module `playerPath.ts`) + greedy line-of-sight smoothing to ≤3 waypoints ending exactly on the tap; NPC pathing fixes (whole-remaining-path validation via `pathHasUnwalkableTile`, `sidestepTile`, a `detour` flag that breaks the head-on ping-pong). User order 2026-11-07: "When tapping to walk make the npcs and characters path around objects correctly instead of of having to constantly tap when they get stuck on trees and houses and rocks and npcs".

**Scores:**

| Dimension | Score | Why (evidence) |
|---|---|---|
| Visual improvement | 0 | No visual change. Pathfinding is invisible — the player walks the same way, just without getting stuck. No sprite, terrain, or lighting change. |
| Gameplay improvement | +2 | Transforms the tap-to-walk loop. Before: a tap set a raw move target and the player pushed straight at it; concave pockets, long obstacles (huts 4–6 tiles wide, wall runs), and slow same-direction NPCs (player 3.15 vs NPC 1.11 u/s) defeated the slide, producing "Path blocked" and forcing constant re-taps. After: one tap plans a route around trees, houses, rocks, water, and NPCs. Entry asserts simulate real tap journeys (hut detour 250 ticks/0 replans, tree-line 226/0, water 392/0, standing-NPC 237/0, pacing-NPC 238/0). |
| Performance improvement | 0 | No measurable performance change. A* runs once per tap (maxNodes 12000); the NPC detour flag prevents the head-on ping-pong (which wasted ticks), but that is a correctness fix, not a measured performance gain. No before/after FPS numbers exist for this change. |
| Stability improvement | +1 | Fixes a real failure mode: the NPC head-on livelock (two NPCs detouring into the same lane and ping-ponging forever — proven by trace: an 8-tick cycle to 60 ticks, no arrival). After the fix, a head-on pair arrives in 21–22 ticks. Also adds stuck-detection (no ≥0.05 progress in 1500ms → replan around the tile ahead) and figure-wait (≤900ms then replan with the tile excluded), so a blocked player recovers instead of sitting on "Path blocked". |
| Architectural improvement | +1 | A new pure module (`playerPath.ts`, 6,202 bytes) that reuses `planPathNpc`'s A* steps instead of duplicating pathfinding; the NPC fixes (whole-remaining-path validation, `sidestepTile`, the `detour` flag) are small, targeted additions to existing modules, not a new system. |
| Implementation cost | 7 files (6 modified + 1 new) | `playerPath.ts` (new), `Engine3DWorldView.tsx`, `townsfolk3d.ts`, `transients.ts`, `animals.ts`, `scripts/prepare-build-entry.cjs`, `src/App.tsx`. Verification: tsc clean (agent + parent re-ran `tsc --noEmit`, exit 0); standalone asserts 97 entry + 47 runner checks PASS (agent's run ~15:04); sim vs pristine1029 IDENTICAL (parent verified: norms identical, 0 FAIL, same known 684 rig crash). |

**Verdict: ACCEPT.** Testing demonstrates it is worthwhile: the entry asserts prove the tap journeys arrive, the sim proves no regression, and the head-on livelock is proven fixed (21–22 ticks vs an unbounded cycle). **Status: ACCEPTED but NOT YET LANDED** — the commit/push is blocked by the environment write failure (git EPERM) and the phone probe is blocked (Chromium SIGTRAP). Acceptance is a judgement about the change; landing is a separate event that requires the commit + the phone probe + live verification. Do not confuse the two.

**What this entry teaches:** the highest-value fixes in this project are the ones that remove a repeated friction the user feels every session (re-tapping) with a small, targeted, well-tested change that reuses existing systems. The cost was 7 files and a full verification suite; the payoff is a loop the user touches constantly.

### BUILD 1029 — Saved chunks keep the inn, blacksmith, and general store

**What it is:** `PALETTE_KINDS` derives its variant tail from `HOUSE_VARIANT_KINDS`, so the list cannot drift again; a saved chunk holding an inn/smith/store round-trips exactly. Commit `14491c9f`, live-confirmed 2026-11-07 ~13:40 PST (served version.json 2026-11-07T21:37:14.339Z, run 42416626999, first try).

**Scores:**

| Dimension | Score | Why (evidence) |
|---|---|---|
| Visual improvement | 0 | No visual change. |
| Gameplay improvement | +1 | A saved chunk that silently dropped the inn, blacksmith, and general store now keeps them. The player no longer loses commercial buildings on save/load. |
| Performance improvement | 0 | No measurable change. |
| Stability improvement | +1 | Fixes a real data-loss failure mode (silent chunk-drop on save/load). The kind-gap audit proved `PALETTE_KINDS` was the single gap (captureChunk emits exactly 15 kinds; the list is now exactly those 15). |
| Architectural improvement | +1 | Deriving the list from `HOUSE_VARIANT_KINDS` removes a class of drift (the list cannot go stale again when a variant is added). |
| Implementation cost | 3 files | `templates.ts`, `scripts/prepare-build-entry.cjs`, `src/App.tsx`. Verification: asserts 94 entry + 27 runner (parent re-ran entry: 94 pass); sim identical to pristine1028; phone proof (placed Inn/Blacksmith/General Store, saved "HighStreet", reload identical, paste 3 of 3). 0 page errors. |

**Verdict: ACCEPT (landed).** Testing demonstrates it is worthwhile, and it is live.

### BUILD 1028 — Walls removable + in the Build menu; Sprint as a small icon next to Gold

**What it is:** Wall in the Build menu (Props, free, 1×1, orientation auto-matches an adjacent wall run); Remove takes the wall TILE tapped; `removedWalls` set for persistence. Sprint as a small ⚡ icon at the bottom next to Gold. Commit `7266e49a`, live-confirmed 2026-11-07 ~12:27 PST (run 42410771257, first try).

**Scores:**

| Dimension | Score | Why (evidence) |
|---|---|---|
| Visual improvement | 0 | No visual change to the world (the sprint icon is a HUD change, not a world change). |
| Gameplay improvement | +1 | Walls are now placeable and removable (the user can edit the town boundary), and the sprint control is in the HUD strip where it belongs. |
| Performance improvement | 0 | No measurable change. |
| Stability improvement | +1 | `removedWalls` persistence means a removed generated wall stays gone across reloads (the deterministic generator no longer re-creates it). |
| Architectural improvement | 0 | A new palette kind + a new persistence set; no duplicate system removed. |
| Implementation cost | 7 files | Verification: asserts 171 entry + 70 runner (parent re-ran entry: 171 pass); sim identical to pristine1027; phone proof (far wall renders + blocks, Remove takes only the tapped tile, removedWalls persistence, sprint icon latch/exhaust/Release!). 0 page errors. |

**Verdict: ACCEPT (landed).**

## How to add an entry

1. Complete the work and run the quality gates (see `studio/TEST_STATUS.md`).
2. Score each dimension with the evidence that justifies the score. If there is no evidence for a dimension, score it 0 and say so — do not guess a positive.
3. Record the implementation cost (files changed + the verification effort).
4. Give a verdict (ACCEPT or REJECT) with the reason. ACCEPT requires testing that demonstrates the improvement is worthwhile.
5. Record the landing status separately (landed / accepted-but-not-landed / rejected). Acceptance is a judgement about the change; landing is a separate event.
6. Add one line on what the entry teaches (which strategy produced the result, so the project learns).

## Rules

* **Accept only after testing demonstrates it is worthwhile.** An untested change is not accepted, however good it looks on paper.
* **Do not score a dimension you have no evidence for.** Score it 0 and say so.
* **Do not produce a single "completion percentage".** The ledger is a record of individual operations, not a progress bar.
* **The ledger compounds improvements, not endless random changes.** If an entry's verdict is REJECT, record why, and do not re-attempt the same approach without a change in strategy. If a strategy repeatedly produces ACCEPT entries, prefer it; if it repeatedly produces REJECT entries, stop using it.
* **Update this file when a build lands or is accepted.** The next update trigger is BUILD 1030 landing.
