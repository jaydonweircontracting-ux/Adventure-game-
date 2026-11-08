# Visual Intelligence Engine

**Directive:** SOUL.md §57 §10.
**What already exists:** The Stage 1 audit (`~/workspace/verify1030/ASHFALL-STAGE1.md` — the measured visual baseline + the findings), the phone-probe screenshots (`~/workspace/verify1030/after/` — town-day, town-night, shore-day, wild, first-person), the manual screenshot review (the parent views screenshots; the user's verdicts drive rework — e.g. the 1015 smoke rebuild after "it looked like shit"), and the dashboard's Stage 1 baseline. This file adds the visual intelligence engine: how visual quality is evaluated automatically (before/after comparison, composition, variation, materials, lighting, silhouettes — not just object counts). It does not replace the Stage 1 audit or the user's eye — it is the automated layer that measures what the audit measured by hand.

## What it evaluates

From §57 §10 (inspect screenshots and gameplay captures for):

* Terrain composition (does the ground read as one continuous surface? — 1009 fixed the ring seams; Stage 1 found 91.6% uniform grass, tint ±0.027, nearly invisible).
* Lighting (day/night, house lights, hearth glow — Stage 1: night reads as overcast day at full uNight (0.55 cap); all 29 houses lit 19:30–21:30 every evening).
* Shadows (baked SUN_SHADE is fixed northwest-high while the sky sun moves — a Stage 1 finding).
* Materials (stone vs plaster vs wood — Stage 1: one box language, stone ground + plaster upper + steep roof).
* Architecture (roofline variation — Stage 1: all 26 town huts roofAxis='x', zero roofline variation; no fences/gardens).
* Vegetation (tree shapes — Stage 1: ONE tree design for everything; 118 crates in town all render as pine trees).
* Water (ocean + pond — Stage 1: no rivers/beaches, ocean meets grass directly).
* Roads (do they read at distance? — 1008 fixed the dissolve; 1022 made cobbles/slabs whole-world).
* Environmental variety (wild vs town — Stage 1: wild is sparse by design, 0.65% trees in the ±64 wild band; wilderness empty, no POIs).
* UI consistency (the 1017 cleanup: compact strip, Hide UI toggle, Sprint as a small ⚡ icon next to Gold).
* Animation (NPC movement, chickens, smoke — 1015: 9 puffs, rise 7 over 10s, dark→sky fade).
* Visual glitches (blue squares at distance — the 1031 bug: wild lakes centre-sampled as whole far cells).
* Clipping (objects intersecting; the 1032 interior-walls bug is the inverse — the player clipping through walls).
* Camera behavior (orbit, first-person, zoom — 1023: orbit max 32→64; first-person pitch).

## How it evaluates (before/after comparison)

* **Compare screenshots against established visual references and project standards.** The reference is the Stage 1 baseline (the `after/` screenshots + the measured numbers), not an arbitrary ideal. A change is compared against the same viewpoint, same time of day, same zoom, before and after.
* **Composition, variation, materials, lighting, silhouettes — not just object counts.** A build that adds 100 trees but makes them all the same pine is not a visual improvement. The engine measures: distinct tree shapes (currently 1), distinct roof axes (currently 1 — all 'x'), ground tint variation (currently ±0.027), night darkness (currently reads as overcast day), and silhouette variety (currently one box language).
* **Identify repetitive, unfinished, or low-quality visual elements.** Repetitive: the same pine tree for crates, lamps, hedges, barrels, fountain, well, windmill, statue, and gatehouse (118 crates). Unfinished: interiors with no ceiling (sky visible from inside), the inn/store/smith as buildings with no mechanics (deferred by the user — visual shells by order, not by accident). Low-quality: the blue-squares artifact (1031), the flat ground (no heightfield, max y 0.038).
* **Generate actionable improvement tasks.** A finding becomes a queue item with the screenshot, the measurement, and the expected change (e.g. "Stage 3: 3 tree shapes" is the actionable form of "ONE tree design for everything").

## The Stage 1 baseline it measures against

From `studio/dashboard/dashboard-data.json` (`measuredBaselines`) and `~/workspace/verify1030/ASHFALL-STAGE1.md` (at BUILD 1029 / commit `14491c9f`, 2026-11-07):

| Visual measure | Baseline |
|---|---|
| Ground uniformity | 91.6% uniform grass; tint variation ±0.027 (nearly invisible) |
| Ground heightfield | FLAT — no heightfield; max ground-plane vertex y = 0.038 |
| Stone terrain | Dead (0 tiles) |
| Rivers / beaches | None; ocean meets grass directly |
| Tree designs | 1 (everything renders as a pine tree, including 118 crates) |
| Roofline variation | 0 (all 26 town huts roofAxis='x') |
| Interiors | Bare boxes; sky visible from inside (no ceiling) |
| Night | Reads as overcast day at full uNight (0.55 cap); no stars, weather, or dawn/dusk grading |
| House lights | All 29 houses lit 19:30–21:30 every evening (staggered per house, but all on) |
| Town composition | 29 huts, 224 trees, 118 crates, 131 rocks, 0 walls, 47 NPCs (49% generic commoner), 0 generated stalls |
| Town shape | A 61×125 ribbon, not a compact cluster |
| World buffer | 237,222 verts (town) / 266,000 verts (wild) — 89% of the 300k budget |

The objective is a distinctive, atmospheric medieval fantasy world — not a generic voxel sandbox. (The user's character direction is the same principle for figures: Minecraft-style blocky bodies, goofy/stupid faces, hats — not a realistic look. The user rejected the realistic upgrade.)

## Current state

The visual intelligence engine as an automated system does NOT exist yet — this file is its specification. What exists: the Stage 1 baseline (measured by hand + headless measurement), the probe screenshots, and the manual review (parent + user). What is missing: the automated screenshot comparison (same viewpoint/time/zoom before vs after), the quantitative visual measures (distinct shapes, tint variation, night darkness, silhouette variety), and the automatic task generation from findings. The first visual-intelligence task is to automate the before/after comparison for Stage 2 (terrain): the same five viewpoints as the Stage 1 `after/` screenshots, captured before and after the heightfield, with the ground-tint and heightfield numbers measured from the captures.
