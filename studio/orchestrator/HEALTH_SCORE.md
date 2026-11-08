# Master Project Health Score

**Directive:** SOUL.md §57 §13.
**What already exists:** The registry (`studio/IMPLEMENTATION_REGISTRY.md` — the 88-requirement classification, the only evidence-based completeness record), the dashboard data (`studio/dashboard/dashboard-data.json` — the build history, the quality gates, the Stage 1 baseline, the known issues), the legacy audit (`studio/LEGACY_AUDIT.md` — the codebase health), and the Stage 1 audit (`~/workspace/verify1030/ASHFALL-STAGE1.md` — the game's measured state). This file defines the health score: what is measured, what evidence each component requires, and the CURRENT score only where evidence exists. It does not invent a completion percentage.

## The rule

**Never invent completion percentages. A system with no tests should not receive a verified score simply because it has source code. No tests = no verified score.** (§57 §13 + `MUSE_SOUL.md` principle 12: never claim something is complete without evidence.)

## Components (what is measured, what evidence each requires)

From §57 §13. Each component is scored only from evidence in the registry, the dashboard data, the legacy audit, or the Stage 1 audit. Where no evidence exists, the component is UNMEASURED — not zero, not a guess.

| Component | What is measured | Evidence required | Current score |
|---|---|---|---|
| Architecture | Is the architecture clean, modular, and documented? | The legacy audit's classification (A/B/C/D/E) + the extraction priorities + the duplicate-systems list | UNMEASURED as a score. Evidence: 248 files classified; 12 duplicate systems; 1 circular import (`IsoFieldView` ↔ `App`); `src/App.tsx` 18,440 lines (audit's measured count). The architecture is not clean — that is a finding, not a score. |
| Stability | Does the game run without crashing? Does the sim pass? | The sim-vs-pristine result (identical / 0 FAIL) + the 684 rig crash status + the phone probe's page-error count | PARTIAL. Evidence: sim identical for 1026–1030 (0 FAIL, same known 684 rig crash); phone probes 0 page errors for 1026–1029. The 684 crash leaves ~1,000 sim lines unverified per build — that is a stability gap, not a pass. |
| Performance | Does the game meet its budgets? | The Stage 1 baseline vs the budgets in `BENCHMARKING.md` | UNMEASURED as a score (budgets are targets, not enforced gates yet). Evidence: world buffer 237k/266k verts (89% of 300k); rebuild ~165–211ms; live hitch 566.6ms; harness FPS town 6.79 / wild 7.82 / shore 9.29 / first-person 6.06 (SwiftShader, relative only). No real-phone FPS measurement exists. |
| Gameplay | Do the game loops work (move, gather, fight, save/load)? | The phone probe (real taps, real behavior) + the asserts + live verification | PARTIAL. Evidence: movement/gathering/save-load verified live for 1026–1029; 1030's pathfinding is code-verified (97 + 47 asserts) but NOT phone-probed or live-verified. Quests, economy, dungeons, skills, and equipment in 3D are NOT IMPLEMENTED (registry). |
| World simulation | Does the world live (NPCs, schedules, travelers, animals)? | The NPC sim + the Stage 1 town composition + the 915–920 combat verification | PARTIAL. Evidence: 47 NPCs with real 2.5D schedules in 3D (993); travelers/adventurers (1000); animals (1013); chickens (1016); NPC-vs-monster combat (915–920, live-verified 2026-10-20). The full living-world sim (economy, factions, civilization) is PARTIALLY IMPLEMENTED or NOT IMPLEMENTED. |
| Visual quality | Does the game look like a distinctive medieval fantasy world? | The Stage 1 visual baseline + before/after screenshot comparison | UNMEASURED as a score. Evidence: 91.6% uniform grass; 1 tree design; 0 roofline variation; flat ground; night reads as overcast day; interiors have no ceiling. The visual intelligence engine (`VISUAL_INTELLIGENCE.md`) is the measurement system — it does not exist yet. |
| NPC intelligence | Do NPCs behave believably (schedules, needs, memory, relationships)? | The NPC sim + the 993 schedules + the 998 movement + the 1001 facing | PARTIAL. Evidence: 47 NPCs with schedules in 3D; movement smoothed (998); facing coherent (1001). Needs/memories/relationships/goals are PARTIALLY IMPLEMENTED (the registry). The 6-layer NPC intelligence (§53) is DOCUMENTED ONLY. |
| Content completeness | Is the content there (quests, dungeons, economy, items)? | The registry's game-system requirements (G8–G20) | NOT IMPLEMENTED (registry). Evidence: quests in 3D NOT IMPLEMENTED; economy in 3D NOT IMPLEMENTED (gold only from looting dead NPCs); dungeons in 3D NOT IMPLEMENTED (the Ember Vault exists in 2.5D — reuse into 3D is ordered but not done); skills in 3D NOT IMPLEMENTED; audio NOT IMPLEMENTED; minimap in 3D NOT IMPLEMENTED (standing request since 2026-10-12). |
| Testing | Is the game tested (sim, asserts, probe, live)? | The sim + the asserts + the phone probe + live verification, per build | PARTIAL. Evidence: sim identical for 1026–1030; asserts pass for 1030 (agent's run); phone probes 0 page errors for 1026–1029; live verification for 1026–1029. Gaps: the 684 rig crash (~1,000 sim lines unverified); the phone probe is currently environment-blocked (Chromium SIGTRAP); the parent's re-run of `asserts1030.mjs` is blocked (esbuild cannot write the bundle). |
| Documentation | Is the project documented accurately? | The registry + the dashboard data + the dated logs + `~/AGENTS.md` | PARTIAL. Evidence: the registry (88 requirements, verified); the dashboard data (validated JSON, honesty-gap fix applied); the dated logs (per-build detail). Gaps: the dashboard is not wired to its data yet; the ENGINE_BIBLE (a living document describing the ACTUAL implementation) does not exist — it is DOCUMENTED ONLY in §53. |
| Development automation | Does the machinery work (orchestrator, genome, ACEE, verification, benchmarking)? | `SUBSYSTEM_REGISTRY.md` (this directory) | NOT IMPLEMENTED as a system. Evidence: the orchestrator is this directory (specification, not automation); the genome exists (v1, 2026-11-07, `studio/genome/`); ACEE/AGEE are on disk as specifications, not automation; the autonomous engine is stale and unobserved; the benchmarking system is a specification; the verification layer is a procedure, not an automated system. |

## The current score (evidence-based only)

There is no single percentage. The honest summary is the registry's counts, which are the only evidence-based completeness record:

* **4 of 88 requirements are COMPLETE AND VERIFIED** (D12 GitHub pipeline, Q0 Stage 1 audit, S26 legacy audit, T6 play-link rule).
* **15 of 88 are IMPLEMENTED BUT UNVERIFIED** (including 1030, 3D rendering, water, NPCs, animals, the dashboard artifact, the self-evolution files, 707, 945).
* **21 of 88 are PARTIALLY IMPLEMENTED.**
* **9 of 88 are DOCUMENTED ONLY.**
* **34 of 88 are NOT IMPLEMENTED.**
* **5 of 88 are BLOCKED** (stone house package, 684 sim crash, git EPERM, Chromium SIGTRAP, local vite build).
* **0 of 88 are OBSOLETE OR DUPLICATED** (overlaps flagged but not adjudicated).

That is the health score: 4/88 verified, 15/88 implemented-but-unverified, 21/88 partial, 9/88 documented-only, 34/88 not implemented, 5/88 blocked. It is not a percentage, and it is not a grade. It is a count of evidence.

## What is preventing each subsystem from reaching its target

* **Architecture:** 12 duplicate systems + 1 circular import + an 18,440-line `App.tsx`. The extraction priorities (townsfolk.ts, worldCore.ts clock, one tile-A* core) are the path.
* **Stability:** the 684 sim crash (~1,000 sim lines unverified per build). Fix it or formally accept it (registry top-10 #5).
* **Performance:** no enforced budgets; no real-phone FPS measurement. The benchmarking system must start recording development-engine times for the next landing.
* **Gameplay:** quests, economy, dungeons, skills, equipment, and audio do not exist in 3D. The 1030 phone probe is blocked (Chromium SIGTRAP).
* **World simulation:** the economy/factions/civilization sim is partial or missing. The world-intelligence tests do not exist yet.
* **Visual quality:** 1 tree design, 0 roofline variation, flat ground, night as overcast day, no ceilings. Stages 2–6 are the path (Stage 2 is the heightfield bet).
* **NPC intelligence:** the 6-layer intelligence is documented only. The needs/memories/relationships layers are partial.
* **Content completeness:** 34 requirements not implemented, most of them game content. This is the largest gap by count.
* **Testing:** the 684 crash + the blocked phone probe + the blocked assert re-run. All three are environment or awaiting-user-word, not code.
* **Documentation:** the dashboard is not wired to its data; the ENGINE_BIBLE does not exist.
* **Development automation:** the genome exists (v1, 2026-11-07, `studio/genome/`); ACEE/AGEE are on disk as specifications, not automation; the autonomous engine is stale. This directory is the specification for closing those gaps.

## Current state

The health score as a computed, displayed score does NOT exist yet — this file is its definition. What exists: the registry's counts (the evidence), the dashboard data (the records), and this file (the components + the current evidence-based summary). What is missing: the automated computation (the score must be recomputed from the registry + dashboard data on every landing, not hand-written) and the dashboard display (the health score is not yet a dashboard section). The first health-score task is to recompute this file's summary from the registry when 1030 lands (Q1 → COMPLETE AND VERIFIED, queue advances) — that is the proof the score is derived from evidence, not written by hand.
