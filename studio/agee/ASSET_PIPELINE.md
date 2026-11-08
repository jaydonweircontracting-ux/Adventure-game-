# Asset and Visual Content Pipeline

**Status:** DOCUMENTED ONLY (registry D7). No asset pipeline exists as a system. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 10 ("CREATE AN ASSET AND VISUAL CONTENT PIPELINE").

## What it is

The asset pipeline is the gate every new asset passes through **before** it enters the game. It checks licensing, format, performance, and compatibility — and it rejects anything that fails. An asset that is not checked is not introduced.

## The rule

**Never introduce an asset without verifying its license and its runtime cost.**

That is the rule. It applies to sprites, models, textures, audio, fonts, and any other asset. A pretty asset with an unclear license, a wrong format, or a runtime cost the game cannot afford does not go in — no matter how good it looks.

## The current asset state (honest, from the legacy audit)

| Fact | Source | What it means |
|---|---|---|
| `public/` is **195 MB / 31,507 files** | Legacy audit (2026-11-07) | The asset directory is very large. Most of it is not verified as used. |
| `public/rpg/` alone is **129 MB** | Legacy audit | The largest asset folder. Only **~25 MB of base folders verified used** — the rest is E (unknown, needs investigation). It needs a **runtime asset trace**, not a static grep, before anything is deleted. |
| `public/manaseed/` is unused since BUILD 380 | Legacy audit (Wave 1 D) | Verified dead. Removable once git can write (with the §52 11-step procedure). |
| `public/v2.5.5.html` | Legacy audit (Wave 1 D) | Verified dead. Same. |
| `fbxHouseModels.ts` imports `three`, which is **NOT** in `package.json` or `node_modules` | Legacy audit | The build only passes because nothing imports it. The stone-house replacement (user order 2026-10-28) is BLOCKED because the package files never arrived (`3d-house-sprites/` holds only a README.md describing a DIFFERENT pack). Do NOT build the stone-house replacement until the files arrive. |
| Chibi LPC paper-doll pack in `public/lpc/` (49 PNGs) | AGENTS.md | Built offline by `work/build-lpc-pack.py` from the Universal LPC Spritesheet Character Generator library. The 3D game uses this for character art (`isoSprites.ts`, `characterSystem.ts`). Mana Seed PNGs are still on disk in `public/manaseed/` but unused since BUILD 380. |
| Stylized grass (MIT, license in `public/grass/`) | BUILD 985 | The license is recorded in the asset folder. That is the model — every asset's license lives with the asset. |
| 3D rendering | Engine3DWorldView | Custom WebGL, vertex-colour triangles ONLY, no normals/textures/alpha blending (fragment alpha 1.0). An asset that needs textures, normals, or alpha blending **cannot** be used in the 3D renderer as it stands. The pipeline must check compatibility with the renderer, not just with the file system. |
| `public/sprites/3d-house-sprites/` | User order 2026-10-28 | Holds ONLY a README.md (939 bytes, describing a DIFFERENT pack). The stone house FBX + color texture never arrived. BLOCKED. |

## The pipeline (the checks, in order)

Every new asset passes these checks **before** it is introduced. A failure at any step stops the asset — it does not go in "temporarily" and get checked later.

1. **Licensing.** What is the license? Is it compatible with the game (commercial use, redistribution, modification)? Is the license recorded with the asset (as `public/grass/` does)? If the license is unclear, unknown, or incompatible, the asset is rejected. **Never use an asset with an unclear license.**
2. **Format.** Is the format one the game can load? (PNG for sprites; GLB for 3D models — the 3D game uses `customAssets.ts`'s direct GLB parser, not `three`/`fbxHouseModels.ts`.) Is the file valid (not corrupt, not a different format with a renamed extension)? Is it the right size/resolution for its use?
3. **Performance.** What does it cost at runtime? (File size, texture memory, vertex count, draw calls.) The world buffer is already at 237k verts town / 266k wild — 89% of the 300k budget (Stage 1). An asset that pushes the buffer over budget, or that adds a per-frame cost the harness cannot afford, is rejected or downscaled. Measure before and after; never optimize blindly.
4. **Compatibility.** Does it work with the renderer (vertex-colour triangles only, no textures/normals/alpha blending in 3D)? Does it work on the target (the user's iPhone, 390×844)? Does it survive save/load (if it is a placed asset, does it ride `iso-world-v2`)? Does it conflict with an existing asset (a duplicate, a name collision, a different scale)?
5. **Attribution.** If the license requires attribution (e.g. MIT, CC-BY), the attribution is recorded with the asset and in the credits. The City Sim Assets (Sprites.zip from opengameart.org) require crediting the author — that is the standing example.

## What the pipeline does NOT do

- It does not delete assets. Deletion is the legacy audit's job (Wave 1/2/3, with the §52 11-step procedure and a git checkpoint). The pipeline gates **introduction**; the audit governs **removal**.
- It does not approve an asset by looking at it. A visual check is not a license check, a format check, or a performance check. All four checks run.
- It does not introduce an asset for a system that does not exist. (No dungeon assets before the 3D dungeon path; no fishing assets — there is no fishing.)
- It does not copy proprietary IP or verbatim code. (Standing rule.) Original code and properly licensed assets only.
