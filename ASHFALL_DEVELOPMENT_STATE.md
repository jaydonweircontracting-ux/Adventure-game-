# ASHFALL Development State

Last updated: 2026-09-04
Current milestone: Build 40 — world clock activation and combat polish

## Current build state

### Working

- React/Vite browser client with GitHub Pages configuration.
- Mosslight Crossing starting hub and deterministic overworld chunk/map presentation.
- WASD/arrow/pointer movement, camera follow, map zoom/pan, terrain and landmark inspection.
- Horse mount/dismount, stamina, goat encounters, combat feedback, loot drops, inventory, crafting, XP, leveling, and class selection.
- Town NPCs, interiors, tutorial progression, browser save/load, downloadable save files, and RPG brain state.
- Stone Soup: The Ember Vault overlay with seeded turn-based dungeon maps, fog of war, combat, spells, items, stairs, three depths, relic objective, victory, defeat, and permadeath.
- First living-world slice: Kael Thorn, Sera Flint, and Orin Vale have identities, levels, goals, routes, movement, activities, and inspectable contextual details in Mosslight Crossing.

### Partially working

- Simulated adventurers currently run a lightweight local route loop in the Mosslight Crossing field. They are not yet persistent, goal-driven agents across regions, and their state is not included in save files.
- The overworld has deterministic terrain accents for grass, flowers, stones, and leaf litter, kept clear of roads, buildings, and the Mosslight Crossing plaza; deeper geography and landmark composition still need a deliberate art-direction pass.
- The Ember Vault is playable, but dungeon runs reset when its overlay closes and the integrated entry currently uses the default Mira/Ashen Human/Wayfarer build.

### Missing

- Persistent AI-adventurer lifecycle, simulation LOD, shared-world consequences, factions, economy, quest system, and world history.
- A separated world/player/AI/dungeon/quest/inventory persistence model.
- Automated coverage for deterministic generation, overworld combat, AI lifecycle, dungeon progression, and save/load.

## Architecture

Project continuity is documented in PROJECT_RECOVERY.md and TODO.md.

- src/App.tsx: main overworld UI, movement, rendering, NPCs, combat, inventory, saves, and dungeon entry.
- src/index.css: overworld visual system and interaction styling.
- src/game/rpgBrain.ts: deterministic world/RPG content model and game-state brain.
- src/game/worldCore.ts: deterministic calendar, simulation speed, time events, queued events, and versioned world-core state.
- src/game/simulatedAdventurers.ts: lightweight living-world adventurer identities and route simulation.
- src/game/stoneSoupEngine.ts: dungeon rules, maps, monsters, items, spells, depth, victory, and defeat.
- src/game/StoneSoupDungeon.tsx: dungeon overlay UI and turn controls.
- src/game/stoneSoupDungeon.css: dungeon-specific visual system.
- world_generator.js and server.js: optional deterministic chunk server boundary, not currently wired into the browser UI.

## World generation

- The browser overworld is deterministic around named chunks and landmarks, with regional palettes, terrain types, roads, rivers, lakes, forests, settlements, and starting-area composition.
- The optional server generator produces deterministic 16 x 16 chunks from integer chunk coordinates.
- The next generation pass should make geography, settlement placement, roads, resources, and danger levels influence one another instead of behaving as independent decorations.

## RPG systems

- Player movement, combat, goat enemies, loot, crafting, horse travel, XP, level progression, player stats, NPC dialogue, interiors, and class selection are present.
- Overworld combat now supports click-to-target and click-to-strike goats, faces the player toward the clicked target, preserves the selected target for keyboard attacks, and shows a target ring. Runtime feel and build verification remain pending.
- The browser save format stores overworld/player/NPC/goat/interior/RPG-brain state but does not yet store dungeon-run or simulated-adventurer state.

## Dungeon

- Ember Vault is a separate turn-based roguelike overlay inspired by traditional dungeon crawlers.
- It keeps Mira of the Ember Road, Ashen Human, Wayfarer, Ember Bolt, three depths, Cave Stalkers, Bone Scribes, Ash Cultists, the First Flame shard, sealed altar, and permadeath.
- The next dungeon milestone is persistence and additional visual/game-feel polish after overworld stabilization.

## Known risks

- The repository’s published Pages bundle and README can lag behind the current src implementation.
- The Adventure-game integration has not been run or visually verified in this milestone; build/typecheck verification should be performed before treating the slice as release-ready.
- The source currently concentrates many overworld systems in src/App.tsx; future polish should extract focused systems without disrupting working behavior.

## Prioritized next milestones

1. Stabilize and verify the current source build and important gameplay paths.
2. Overhaul overworld terrain composition, transitions, landmarks, settlement layout, and environmental hierarchy.
3. Make Mosslight Crossing a more believable hub with roads, activity, entrances, and contextual points of interest.
4. Expand simulated adventurers into persistent goal-driven agents with near/region/far simulation levels.
5. Separate and persist world, player, AI, dungeon, quest, and inventory state.
6. Add automated tests for deterministic generation, combat, AI lifecycle, dungeon progression, and save/load.


## Latest incremental checkpoints

- 8874198 — add deterministic world core foundation.
- 190ae37 — persist world core in the RPG brain and existing save state.
- fedb270 — expand the calendar, simulation speeds, time subscriptions, and schema migration.
- 8b87ecb — add GitHub project recovery guide.
- 940b881 — add prioritized ASHFALL task queue.

## Current bounded next slice

Connect WorldCore.advance to one existing game-state transition and persist that state through the current save path. Do not advance it from the render loop or begin NPC schedules, factions, or economy in the same slice.


## Checkpoint 2026-09-04 — development operations baseline

- Repository source of truth: main branch, latest recorded commit c86bea0 (QA ledger).
- This checkpoint made no game-code changes; it records the state before the next implementation slice.
- Source inspection confirmed the existing world-core module, RPG-brain persistence hook, browser save boundary, and current requestAnimationFrame gameplay loop are present.
- The next bounded implementation remains: call WorldCore.advance from one authoritative gameplay transition, make the resulting time visible in the current UI, and persist it through the existing save path.
- npm install, build, typecheck, browser launch, gameplay playtest, visual audit, and performance measurement: NOT_RUN.
- No runtime or polish pass is claimed from this checkpoint.


## Build 40 checkpoint

- Visible build marker advanced from 035 to 040.
- WorldCore.advance(1) now drives the overworld clock interval, and the saved brain clock is restored into the visible time display when available.
- Overworld combat now has click-to-target, click-to-strike, selected-target persistence, target health HUD, and clearer attack labeling.
- Low player health now changes the HUD treatment, and the health accessibility label reports current and maximum HP rather than treating HP as a percentage.
- Static source verification passed for the build marker, world-clock activation, target selection, target HUD, low-health state, and combat styles.
- npm build, typecheck, browser launch, gameplay playtest, visual audit, and performance measurement remain NOT_RUN.
- No new dependencies were added.
