# ASHFALL — TEST_STATUS

**Version:** 1.0 — 2026-11-07 ~15:08 PST
**Source:** SOUL.md §55 (unify documentation/memory in GitHub) + `studio/IMPLEMENTATION_REGISTRY.md` (D4 quality gates, D11 testing infrastructure) + `studio/dashboard/history/verification-history.json`. This file is the test status. It states what passed, what is blocked, and what is known-broken — with evidence, not claims.
**Status:** This file is NEW (registry D7 was NOT IMPLEMENTED — zero hits for any of the five named docs before this file).

## The test suite (what exists)

| Test | What it does | How it runs | What "pass" means |
|---|---|---|---|
| `tsc --noEmit` | Type-checks the whole project | `./node_modules/.bin/tsc --noEmit` (read-only; works even when writes are blocked) | Exit 0 |
| `scripts/simulate.ts` | 41k+ assertions over `src/game` modules | Bundled with the local esbuild binary DIRECTLY (`./node_modules/.bin/esbuild`, ESM, `--platform=node`, `--loader:.png=dataurl`); the bundle must live in `scripts/` (import.meta.url manifest reads). tsx is NOT installed. | 0 FAIL (apart from the known 684 rig crash — see below) |
| Sim vs pristine baseline | Compares the normalized sim log against a pristine worktree at the previous checkpoint | Pristine worktrees under `/home/hatch` (never `/tmp` — 512 MB tmpfs). A full `git worktree add` FAILS in this environment on `public/rpg/` files; the workaround is `--no-checkout` + targeted checkouts. | Normalized logs IDENTICAL, 0 FAIL |
| Standalone asserts | Per-build throwing asserts (entry + runner) in `~/workspace/verify<BUILD>/` | Run DIRECTLY with `node` (no pipe, no `&&` chain — a piped run once returned a false failure with elided output). The runner's post-commit scope-guard failure is a harness artifact, not a game defect, when the entry checks pass (the scope guard diffs the working tree, which is empty after the agent commits). | "ALL <BUILD> ENTRY ASSERTS PASS" + "ALL <BUILD> ASSERTS PASS" |
| Phone probe (Playwright) | Real-game test on a 390×844 phone viewport | Serve `python3 -m http.server 8901 --directory dist/public`, test `http://localhost:8901/?testmode=1`, hooks at `window.__gameTest`; flow menu → New Game → character → "Begin Adventure" before hooks exist. Kill servers by PID, never `pkill -f "http.server 8901"`. Local Chromium cannot reach the internet (proxy) — external-resource failures are environmental noise. | 0 page errors + the probed behaviour works (taps arrive, buttons toggle, saves round-trip) |
| Live verify (content marker) | Proves the build is actually serving | Served `version.json` shows the new build + note; served `?v=<BUILD>` index.html contains `window.__AG_BUILD="<BUILD>"`. Never bundle filenames (CI and local builds produce different bundle hashes for identical source). | A fresh served `version.json` read showing the new build |

## Quality gates (L1–L4, §50)

Four gates: LEVEL 1 IMPLEMENTED, LEVEL 2 INTEGRATED, LEVEL 3 VERIFIED, LEVEL 4 POLISHED. Each gate must have actual verification evidence (gate name, status, timestamp, test/command, result, commit). A gate that has not run is NOT RUN. A gate that fails is FAILED. Missing results are never silently treated as passing.

**Honesty rule (added to `studio/MUSE_EVOLUTION.md` v1.1, 2026-11-07):** never claim a quality-gate level for a build unless a per-build evidence record exists for that gate. A build verified live supports Level 3 (VERIFIED); Level 4 (POLISHED) requires a formal polish gate with its own evidence record. Never use a placeholder timestamp for a verification time — use null when the exact timestamp is not recorded.

## BUILD 1029 (last verified checkpoint) — PASSED

* **Commit:** `14491c9f`. **Live-confirmed:** 2026-11-07 ~13:40 PST (served version.json 2026-11-07T21:37:14.339Z, run 42416626999, first try).
* **tsc:** clean (exit 0).
* **Asserts:** 94 entry + 27 runner checks (parent re-ran entry: 94 pass; runner exit 1 = post-commit scope-guard harness artifact, not a game defect).
* **Sim vs pristine1028:** IDENTICAL, 0 FAIL (same known 684 rig crash).
* **Phone proof:** placed Inn/Blacksmith/General Store by real taps; saved "HighStreet" (3 items: inn (1,1,6,5), smith (8,1,12,4), store (14,1,18,4)); reload: library identical, stored JSON identical, all three still in the world in place; paste by real tap "Pasted 3 of 3 from 'HighStreet'", 6 commercial buildings total. 0 page errors.
* **Quality gate level:** 3 (VERIFIED). The Level-4 claim was downgraded 2026-11-07 ~15:05 PST (no per-build Level-4 evidence exists).

## BUILD 1030 (active build) — CODE-VERIFIED, NOT LANDED

* **Commit:** none (uncommitted in the working tree, 7 files). **Status:** IMPLEMENTED, NOT shipped, NOT live.
* **tsc:** clean (agent + parent re-ran `tsc --noEmit`, exit 0).
* **Asserts:** 97 entry + 47 runner checks PASS (agent's run ~15:04). Parent's re-run of `asserts1030.mjs` is BLOCKED (esbuild cannot write the bundle file: operation not permitted) — the asserts rest on the agent's passing run.
* **Sim vs pristine1029:** IDENTICAL (parent verified: norms identical, 0 FAIL, same known 684 rig crash). Pristine worktree `/home/hatch/pristine1029` @ `14491c9f`.
* **Phone probe:** NOT RUN — blocked (Chromium SIGTRAP). Probe script ready: `~/workspace/verify1030/probe1030-after.mjs` (390×844; hut detour one-tap arrival, NPC detour one-tap arrival, wall-ring sealed tile → "Path blocked" + no movement, keyboard push smoke + sprint icon, screenshots to `verify1030/after/`).
* **Live verify:** NOT RUN — blocked (no commit/push yet; nothing to serve).
* **Quality gates:** L1 IMPLEMENTED PASSED (tsc clean + asserts pass, 2026-11-07T15:04:00-07:00); L2 INTEGRATED PASSED (sim identical, 2026-11-07T15:07:00-07:00); L3 VERIFIED NOT RUN; L4 POLISHED NOT RUN.

## Earlier builds (1016–1028) — VERIFIED (Level 3)

All 14 builds 1016–1029 are verified live (served version.json + phone proof + asserts + sim identical). Their gate level is 3 (VERIFIED) — the Level-4 claims were downgraded 2026-11-07 ~15:05 PST. Builds 1026–1029 have real verification timestamps + run IDs (1026: run 42404496335, 2026-11-07T19:06:53.952Z; 1027: run 42407766765, 2026-11-07T19:47:03.434Z; 1028: run 42410771257, 2026-11-07T20:23:52.159Z; 1029: run 42416626999, 2026-11-07T21:37:14.339Z). Builds 1016–1025 have null verification timestamps (the exact times are not recorded — only the dates are known from the dated logs). Full per-build evidence: `studio/dashboard/history/build-ledger.json` (1016–1032) + `studio/dashboard/history/verification-history.json`.

## Known test limitations (honest gaps)

* **The 684 rig crash (registry S2, BLOCKED).** `assetMetaFor` returns null for 5 variants (cottage-wide, hall-grand, house-balcony, house-tall, shop-banner — no BUILDING_ASSET_META entries); `simulate.ts` crashes dereferencing `meta.file`; ~1,000 sim lines after the rig section are unverified on every build. Crash-masked since 694. Awaiting the user's word (fix or formal acceptance).
* **Phone probes are harness-relative, not device-real.** Harness FPS (SwiftShader) is a relative baseline only (town 6.79 / wild 7.82 / shore 9.29 / first-person 6.06). Real-phone FPS is unknown (registry G20). CDP pointer taps inflate measured press duration on the busy ~7fps main thread (nominal 300ms press measured 1138ms) — do not ship on a CDP-inflated measurement.
* **The dashboard artifact was not directly inspected by the registry auditors** (no artifact access in the subagent sessions) — D1 rests on project records.
* **Nothing in the registry was live-verified by its auditors** (no game run, no build, no tsc, no sim, no probe) — test claims there cite the dated logs and module headers.
* **Environment blocks (E1–E3).** Git cannot write (EPERM) — blocks commits, pushes, and the assert re-run (esbuild cannot write the bundle). Chromium will not launch (SIGTRAP) — blocks phone probes. Local vite build impossible (copy_file_range budget) — blocks local builds (GitHub Actions deploy builds are unaffected).

## Maintenance

* Update this file at each verified checkpoint (add the build's test results with evidence) and whenever a test limitation is found or resolved.
* A status changes only with evidence (command, exit code, counts, log paths, run IDs, served markers).
* Next update trigger: BUILD 1030 landing (add its phone-probe + live-verify results; L3/L4 gates move from NOT RUN to PASSED or FAILED).
