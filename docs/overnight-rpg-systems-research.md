# Overnight RPG Systems Research & Demo Acceptance Checklist

This is a research queue for Adventure Game. Use these projects as **behavioral and architectural references**, not as permission to copy proprietary code or artwork. Before importing any code, data, or art, record the exact upstream file, author, license, required attribution, modifications, and whether the license is compatible with this repository's intended distribution.

## Open-source reference projects

| Project | Public source | Best systems to study | License / caution |
|---|---|---|---|
| Flare RPG | https://github.com/flareteam/flare-engine | 2D action-RPG combat, items, loot, animation states, data-driven content and modding | GPL-3.0. Study the design; copying engine code may impose GPL obligations. |
| Veloren | https://gitlab.com/veloren/veloren (GitHub mirror: https://github.com/veloren/veloren) | Procedural terrain, world streaming, mounts, NPC/world simulation, combat and performance patterns | GPL-3.0. Prefer notes and independent reimplementation unless the project deliberately accepts GPL-compatible code. |
| OpenMW | https://github.com/OpenMW/openmw | World cells, doors/interiors, dialogue, navigation, object placement and editor workflows | GPL-3.0; Morrowind game data is separate and is not included as free content. |
| Cataclysm: Dark Days Ahead | https://github.com/CleverRaven/Cataclysm-DDA | NPC simulation, item definitions, equipment, inventory, crafting, survival simulation and data-driven content | CC BY-SA 3.0 for the project code/content per its contribution guidance; preserve attribution and ShareAlike obligations when reusing covered content. |
| Godot Engine demos | https://github.com/godotengine | Small, isolated examples of navigation, animation state machines, UI, serialization and mobile performance | Check the license in each repository and for every asset; a demo repository may contain mixed licenses. |

## Adventure Game implementation priorities

### Phase A — buildings and town layout
- Fix the starter roof overlay's vertical alignment so the bottom-floor asset does not protrude beneath it.
- Reuse the approved starter-house interior/roof-hide treatment consistently for NPC homes, shops, guild hall, blacksmith, apothecary, bank, mage shop, archer shop and taverns until dedicated variants exist.
- Verify every door, doorway trigger, collision footprint and interior/exterior transition against the same building anchor.
- Keep pinned Mosslight Crossing buildings stable. Move carts off road centers; remove short decorative paths that cross the main cobblestone road unnecessarily.
- Check all building placements at close and zoomed-out scales and across chunk edges.

### Phase B — character equipment and sprites
- Keep sprite assets organized under `game sprites/` with meaningful folders and a manifest of source/license.
- Render equipped clothing, armor, hairstyles and weapons only where the actor's equipment actually permits it.
- Character creation may select basic clothing and hair, but not weapons or armor; those are earned, found, bought or equipped in play.
- Preserve the current base-character defaults and directional animation mapping.

### Phase C — mounts, combat and looting
- Validate the existing player mount/unmount control, mounted movement speed, facing, collision and save/load.
- NPCs may ride, lead or walk beside horses; cart-pulling behavior should use road-aware movement and avoid blocking road junctions.
- Keep combat rules consistent: NPCs can defend themselves, guards pursue crime/fleeing players, attacks deal damage only when in range, and reinforcement escalation is bounded.
- A corpse tap opens a loot window. Show each available stack/item, allow one-by-one selection, preserve untaken items on the corpse, and never auto-loot on open.
- Make the corpse hit area forgiving for touch input and ensure the loot panel closes cleanly without accidental movement or attacks.

### Phase D — release gate
- Typecheck and build.
- Run landscape continuity, isometric asset, pinned-building art, NPC combat and economy regression suites.
- Add focused tests for selective corpse looting, mount/unmount and character-creator restrictions.
- Exercise the published build on desktop and mobile; record actual results instead of claiming unobserved screenshots or FPS.
- Track every known failure and distinguish code pushed, CI passed, deployment complete and live behavior visually verified.

## Current work notes
- The existing codebase already has a world-horse module and player mounted state; extend those rather than introducing a second mount system.
- The corpse interaction was auto-taking all loot before the selective loot panel change. Verify the deployed UI manually and test that taking one entry leaves all other entries available.
- Do not describe the project as a finished AAA/Steam demo until gameplay, art, performance, mobile input and release tests have actually passed.
