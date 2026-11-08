# Continuous Simulation and Validation Lab

**Status:** Specification. Version 1.0 — 2026-11-07.
**Directive:** SOUL.md §56 §10 (Continuous simulation and validation lab) + §56 §12 (Experimental evolution sandbox).
**Location:** `studio/acee/VALIDATION_LAB.md` (this file).

## The rule that governs this lab

**Do not mistake simulated success for actual gameplay verification.** The sim, the asserts, the phone probe, and live verification are separate gates. A build can pass the sim and still be broken on the phone; a build can pass the phone probe and still fail to deploy; a build can deploy and still not be live. Each gate proves a different thing, and no gate substitutes for another.

## The four gates (what each one proves)

| Gate | What it proves | Tool | What "pass" means |
|---|---|---|---|
| **Sim** (`scripts/simulate.ts`) | The pure systems behave correctly over thousands of assertions, and the change does not regress them. | esbuild bundle + node, vs a pristine worktree baseline. | Normalized logs identical, 0 FAIL (the known 684 rig crash is the only expected failure). |
| **Asserts** (standalone, `~/workspace/verify<BUILD>/`) | The new behaviour is correct in isolation, including edge cases the sim does not cover. | Throwing assert runners, re-run DIRECTLY by the parent (no pipe, no `&&` chain — a piped run once returned a false failure with elided output). | All entry + runner checks pass. 1030: 97 entry + 47 runner checks. |
| **Phone probe** (Playwright, 390×844) | The change works in the real game, on a real device size, with real taps. | Serve `dist/public` on port 8901, test `http://localhost:8901/?testmode=1`, hooks at `window.__gameTest`; menu → New Game → character → "Begin Adventure" before hooks exist. | Real taps produce the expected outcome; 0 page errors; screenshots confirm it. |
| **Live verification** | The build actually reached the player. | Served `version.json` build + note; served `?v=<BUILD>` index `__AG_BUILD`. Never bundle filenames (CI and local builds produce different hashes for identical source). | A fresh served `version.json` read shows the new build. Deploys lag pushes ~2–3 min normally. |

The four quality gates (§50) map onto these: LEVEL 1 IMPLEMENTED (the code exists and compiles — tsc exit 0), LEVEL 2 INTEGRATED (the sim is identical and the asserts pass), LEVEL 3 VERIFIED (the phone probe passes AND live verification confirms the build is served), LEVEL 4 POLISHED (a formal polish pass with its own evidence — visual consistency, game feel, edge cases). **A gate that has not run is NOT RUN. A gate that fails is FAILED. Missing results are never silently treated as passing.** (The 2026-11-07 honesty-gap fix: dashboard data had claimed Level 4 for builds 1016–1029 with no per-build Level-4 evidence; it was downgraded to Level 3, which the evidence supports.)

## The simulation lab (§56 §10)

Before accepting major code changes, create appropriate automated simulations. For ASHFALL, the lab supports:

* World-generation tests (deterministic gen, chunk continuity, roads/terrain/rivers continuing across chunk boundaries).
* NPC behavior simulations (schedules, needs, movement, the head-on ping-pong — 1030's entry asserts prove a head-on pair arrives in 21–22 ticks).
* Civilization simulations (settlement economy, populations, trade).
* Economy simulations (shops, prices, inventories, gold flows — including the negative-gold check).
* Combat simulations (NPC-vs-monster, guard witness radius 25, creature kills dropping lootable bodies with no crime/bounty and no player XP).
* Pathfinding benchmarks (tap journeys: hut detour 250 ticks / 0 replans, tree-line 226 / 0, water 392 / 0, standing-NPC 237 / 0, pacing-NPC 238 / 0 — the 1030 entry asserts).
* Chunk-loading benchmarks (rebuild time, hitch on teleport).
* Save/load tests (round-trips, migrations, versioned saves).
* Long-duration simulation tests (NPCs over many in-game days; the world continuing whether or not the player is watching).
* Regression tests (the sim vs a pristine baseline, every build).
* UI layout checks (phone-width overflow, the Options button covering the smith dialogue Leave button — observed in BUILD 1010, still open).

**Rules:** Allow thousands of simulated entities where practical. Use headless execution for systems that do not require rendering. Use representative workloads and reproducible seeds. Compare before-and-after measurements.

**Known blind spot (do not hide it):** the 684 sim crash. `assetMetaFor` returns null for 5 variants (cottage-wide, hall-grand, house-balcony, house-tall, shop-banner); `simulate.ts` crashes dereferencing `meta.file`; ~1,000 sim lines after the rig section are unverified on every build. The crash has been masked since BUILD 694. Any build that touches the rig section inherits that blind spot until the crash is fixed or formally accepted (registry top-10 item #5). The lab reports the blind spot in every sim run; it never silently passes a section the sim never reached.

**Pristine baselines:** `/home/hatch/pristine1021` (00a3f115), `pristine1023` (83ffcb0f), `pristine1025` (88658d1e), `pristine1026` (5d002922), `pristine1027` (16b7eb9e), `pristine1028` (7266e49a), `pristine1029` (14491c9f). Worktrees live under `/home/hatch`, never `/tmp` (512 MB tmpfs — a worktree there fills it and fails builds with ENOSPC). A full `git worktree add` fails in this environment on a handful of `public/rpg/` PNGs ("unable to write file", then "Could not reset index file to revision 'HEAD'") — the workaround is `--no-checkout` + targeted checkouts (scripts, src, tsconfig.json, package.json, game sprites, public/mobs). The sim needs the tsconfig (for the `@/` alias), the game sprites PNGs imported by IsoFieldView, and public/mobs (read at runtime via readFileSync).

**Harness landmines (do not re-learn these):** `pkill -f "http.server 8901"` matches its own command line and SIGTERMs the calling shell — kill the server by PID instead. Chromium cannot reach the internet (proxy blocks it) — external-resource failures in a probe are environmental noise, not game defects. CDP pointer taps inflate measured press duration on the busy ~7fps main thread (a nominal 300ms press measured 1138ms) — do not ship on a CDP-inflated measurement; prove the behaviour with a pure-function assert + a press that measures inside the window. Default camera yaw 0.65 looks NW — due-west tiles are ~62° off-axis and off-frame in portrait; face west (`setYaw(π/2)`) for ocean taps.

## The experimental evolution sandbox (§56 §12)

Allow the engine to experiment with alternative implementations without risking the main project.

### The procedure (for major improvements)

1. Establish a baseline (the pristine worktree + the Stage 1 measurements + the current sim/assert numbers).
2. Create an isolated experiment (a worktree under `/home/hatch`, or a separate branch — never the shared checkout, never `/tmp`).
3. Generate alternative approaches (the parallel-search pattern: two or more candidates, each in its own isolation).
4. Run comparable benchmarks (same harness, same command, same environment — the `OPTIMIZATION_LAB.md` benchmark set).
5. Evaluate correctness (asserts + sim vs the baseline).
6. Compare performance (before/after on the same measurements).
7. Select the best verified result (the evolution formula, `CODE_EVOLUTION_FORMULA.md` — highest score wins only when the gates pass).
8. Integrate through a controlled patch (the parent sequences the commit; the patch is reviewed, gated, and landed like any build).

### The rules

* **Keep experiments reproducible.** Same seed, same harness, same commands. An experiment that cannot be re-run is not an experiment — it is an anecdote.
* **Allow rejected experiments to be archived and revisited.** A rejected approach is recorded (what it was, why it lost, what its numbers were) in the dated log + the build ledger. It is not deleted. The next agent that proposes the same approach reads the record first.
* **Never let experimental code silently overwrite stable production code.** Experimental code lives in its own worktree/branch until it is promoted through a controlled patch. There is no path from an experiment to `main` except the patch + the gates. The 1022 lesson applies here too: an experiment's hunks must never ride along inside another build's commit.

### What the sandbox is for (and what it is not for)

* **For:** a major improvement where the right approach is genuinely uncertain (the Stage 2 heightfield is the current example — harness-prototype the base-y agreement first, keep the tint+shores+stone fallback; the sandbox is where that prototype lives).
* **Not for:** a small, scoped fix with a known pattern (1031's blue squares: subdivide like 1008/1027 — no sandbox needed, just build it). Do not manufacture experiments to fill a report.

## Deploy-failure recovery (part of validation, not an afterthought)

A Pages deploy can fail or hang at GitHub's deploy step while the build job succeeds (this happened for 1021 and 1024). Diagnose via the PUBLIC Actions API (no auth): `api.github.com/repos/jaydonweircontracting-ux/Adventure-game-/actions/runs?per_page=N` and `/actions/runs/<id>/jobs`. Recovery is an empty re-trigger commit (same content, idempotent). **No-spam rule:** after telling the user a check is pending, message ONLY on the flip or if stuck well past normal lag (~2–3 min).
