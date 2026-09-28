# MASTER ROADMAP — Adventure Game Continuous Development

> Standing instruction from the user (2026-09-28): this is an ongoing game
> project. Every previous requirement stays active. New requests ADD to this
> roadmap. Extend existing systems; never duplicate them. Never regress.

## Game identity

Top-down real-time open-world sandbox RPG: persistent world simulation,
chunk-based environments, combat, exploration, NPCs, creatures, items, loot,
buildings, interiors, elevation, living world. Must feel like a persistent
world that exists independently of the player.

## Architecture (authoritative — do not replace)

world coordinates · overworld · chunk coordinates · playable chunks ·
8x8/4x4 chunk architecture · grid · terrain · elevation · collision ·
walkability · buildings · interiors · doors · roads · NPCs · creatures ·
player · combat · inventory · equipment · shops · crafting · loot ·
item database · world entities · persistence · save/load · renderer ·
game loop · worldTick · playerTick · eventBus · budgets · performance systems

## World rules

- 31x31 chunks, deterministic generation, seamless chunk boundaries
- Danger progression: start SAFE → outskirts LOW → wilderness MEDIUM → remote HIGH → extreme ENDGAME
- Starting region (Mosslight Crossing area) must stay safe
- Elevation: hills, slopes, cliffs, plateaus, valleys, ridges, mountains, water depth
- Chunk simulation LOD: full (nearby) → lightweight → abstract → none (very far)

## Phases (cumulative, all active)

- [x] PHASE 1 — Core world: larger overworld, connected chunks, elevation, terrain/biome variation
- [x] PHASE 2 — Visual polish: terrain detail, roads, cliffs, water, landmarks (pixel-art map tiles v115)
- [~] PHASE 3 — Buildings & interiors: room-type furniture (v122); more detail ongoing
- [~] PHASE 4 — Item visual system: specific loot visuals (v122); unified sprites ongoing
- [~] PHASE 5 — Monster loot: specific drop visuals (v122); per-creature loot identity ongoing
- [~] PHASE 6 — Living world: birds, goats, rabbits, deer, wolves, boars, bears, goblins, bandits (v121/v123/v125); skeletons, trolls, snakes, spiders, dragons pending
- [ ] PHASE 7 — NPC life: townspeople, guards, merchants, farmers, schedules
- [x] PHASE 8 — Adventurer system: house exit, door transitions, exterior sprites, town/wilderness travel
- [ ] PHASE 9 — World ecology: territories, factions, predator/prey, camps, patrols
- [ ] PHASE 10 — Deep world: caves, ruins, boss regions, dragon territories, endgame

## Creature roster status

Done: birds, goats, rabbits, deer, wolves, boars, bears, goblins, bandits
Pending: snakes, spiders, fish, frogs, skeletons, trolls, ogres, dragons

## Loot identity (per-creature)

- Wolf: pelt, fang, claw, meat
- Goblin: ear, weapon, hide, scrap, coins
- Skeleton: bone, skull, weapon, coins
- Bandit: coins, fabric (ransom goods)
- Troll: hide, coins
- Snake/spider: fang

## Build log

- v121: 31x31 world, elevation layer, birds, goat home-range data
- v122: room-type interiors, specific loot visuals
- v123: wildlife phase 1 (rabbits, deer, wolves, boars), danger zones
- v124: goat home-range in live AI, bird elapsed-time + collision
- v125: goblins, bandits, bears; simulation harness (32,963 assertions passing)

## Implementation philosophy

Smallest safe change. Extend, don't duplicate. Test. Verify no regressions
in: movement, camera, coordinates, chunks, terrain, elevation, buildings,
interiors, doors, NPCs, combat, inventory, items, loot, saving, loading,
rendering, performance.
