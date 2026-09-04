Yeah — you need to stop having the AI treat this as “make the game functional” and instead tell it to act like a senior game developer + world designer + technical artist, with permission to overhaul the ugly/prototype presentation.

Here’s a full prompt you can paste into Claude/your coding AI.

ASHFALL — POLISH + WORLD SIMULATION OVERHAUL

You are now the lead developer, game designer, technical artist, systems designer, and QA engineer for ASHFALL.

The current game is a functional/glitchy prototype. Your job is to turn it into something that feels like an actual polished RPG, not a developer test scene.

Do NOT simply patch individual glitches.

You need to inspect the existing project, understand what already works, preserve good systems, and then systematically upgrade the game toward a cohesive, polished experience.

The game should eventually feel like a combination of:

* Oblivion-style exploration and discovery
* Exiled Kingdoms-style RPG progression
* Dwarf Fortress-style world simulation
* Dungeon Crawl Stone Soup / traditional roguelike depth
* A living MMO-like world where other adventurers exist independently of the player

The game is single-player first, but the world should simulate other adventurers as if they were real players.

⸻

1. FIRST RULE — STOP BUILDING A PROTOTYPE

The current visual quality is not acceptable.

The overworld/map currently looks like a rough generated test map.

Do NOT accept:

* ugly placeholder terrain
* obvious square/grid-looking terrain
* repetitive tiles
* random-looking blobs
* empty landscapes
* buildings that look pasted onto the map
* roads that go nowhere
* rivers that look artificial
* terrain transitions that look broken
* excessive empty space
* obviously procedural-looking terrain
* UI elements that look like debug tools
* inconsistent art styles
* unfinished visual effects
* obvious development artifacts

The player should be able to look at the world and think:

“This is an actual RPG world.”

rather than:

“This is a procedural generation demo.”

⸻

2. DO NOT THROW AWAY THE GAME

Before changing anything:

1. Inspect the entire repository.
2. Identify the current architecture.
3. Identify the rendering system.
4. Identify map/world generation.
5. Identify player movement.
6. Identify NPC systems.
7. Identify combat.
8. Identify inventory/crafting.
9. Identify save/load.
10. Identify dungeon systems.
11. Identify all existing tests.
12. Identify unfinished or broken systems.
13. Identify what is currently functional and preserve it.

Do not rewrite functioning systems merely because you personally would architect them differently.

Improve the existing architecture where practical.

If a system genuinely needs replacement, document why and replace it cleanly.

⸻

3. THE OVERWORLD MUST BECOME THE STAR

The overworld is currently the biggest visual weakness.

Completely rethink the visual presentation of the world while preserving the underlying gameplay functionality.

World design goals

The world should have:

* visually interesting terrain
* believable geography
* distinct biomes
* elevation
* forests
* hills
* cliffs
* rivers
* lakes
* roads
* trails
* bridges
* farms
* ruins
* caves
* abandoned structures
* villages
* towns
* landmarks
* wilderness
* points of interest
* hidden areas
* natural borders between regions

The world should feel intentionally designed even though it is procedurally generated.

⸻

4. PROCEDURAL GENERATION MUST LOOK HANDCRAFTED

Do not simply generate random terrain.

Use layered procedural generation.

The world generation pipeline should conceptually be:

SEED
↓
Continental/geographic shape
↓
Elevation
↓
Climate
↓
Biomes
↓
Water
↓
Rivers
↓
Terrain features
↓
Road network
↓
Settlements
↓
Landmarks
↓
Resources
↓
Creatures
↓
NPCs
↓
Factions
↓
AI adventurers
↓
Points of interest
↓
Final world

Every generated feature should influence other features.

Examples:

* Rivers should flow downhill.
* Settlements should preferentially form near water/resources/roads.
* Roads should connect settlements and important locations.
* Farms should appear near settlements and suitable terrain.
* Forests should form coherent regions rather than random tree spam.
* Mountains should create believable elevation boundaries.
* Caves should be associated with appropriate geological areas.
* Ruins should have contextual placement.
* Wilderness should have ecological logic.
* Dangerous areas should become progressively more dangerous away from civilization.

The result should feel like a world with history.

⸻

5. MAP VISUAL QUALITY

Make the map visually attractive at normal gameplay zoom.

Prioritize:

Terrain

Use visual variation for:

* grass
* dirt
* stone
* mud
* sand
* snow
* forest floor
* mountain terrain
* swamp
* water
* farmland

Terrain should blend naturally.

Avoid harsh tile seams.

Vegetation

Use groups/clusters rather than evenly distributed objects.

Examples:

* dense forest
* sparse forest
* clearings
* bushes
* fallen trees
* rocks
* grass variation
* flowers
* reeds

Water

Water should look like water.

Add:

* shoreline transitions
* subtle animation
* depth variation
* reflections/highlights where appropriate
* riverbanks
* bridges
* waterfalls if supported

Roads

Roads should actually connect things.

A road should visually lead somewhere.

Create:

* main roads
* minor roads
* wilderness trails
* bridges
* intersections
* paths into settlements

Settlements

Mosslight Crossing should stop looking like a collection of objects placed around the player.

It should feel like a real settlement.

Include logical relationships between:

* houses
* shops
* guild
* chapel
* roads
* fields
* storage
* entrances
* surrounding wilderness

Buildings should have:

* footprints
* entrances
* paths
* surrounding terrain
* visual variation

⸻

6. CAMERA + MAP PRESENTATION

Make the world readable and beautiful from the player’s actual gameplay camera.

Do not optimize the map merely because it technically renders.

Check:

* player visibility
* terrain contrast
* object readability
* building readability
* NPC readability
* enemy readability
* interaction readability
* shadows/depth
* movement feedback
* environmental effects

The player should always understand:

WHERE AM I?

WHAT IS AROUND ME?

WHERE CAN I GO?

WHAT IS INTERESTING?

WHAT CAN I INTERACT WITH?

⸻

7. WORLD DISCOVERY

Do not reveal the entire world immediately.

Create exploration.

The player should discover:

* settlements
* ruins
* caves
* dungeons
* resources
* wandering NPCs
* camps
* shrines
* secrets
* rare encounters
* dangerous areas
* interesting landmarks

Use environmental storytelling.

For example:

The player might discover an abandoned campsite containing evidence that another adventurer recently passed through.

That adventurer may actually have been one of the simulated AI players.

⸻

8. AI ADVENTURERS — MAJOR NEW SYSTEM

The world must contain simulated AI PLAYERS.

These are NOT ordinary NPCs.

They should behave like other human players playing the same game.

The player should occasionally encounter them naturally.

They should:

* spawn into the world
* choose goals
* explore
* fight
* gather
* loot
* level
* equip gear
* use abilities
* travel
* visit towns
* enter dungeons
* complete quests
* interact with factions
* die
* recover
* leave the world
* return later
* change locations
* develop reputations
* potentially become important characters

The goal is:

The player should feel like they are not the only adventurer in the world.

⸻

9. AI PLAYER LIFECYCLE

Create persistent simulated adventurers.

Each AI player should have an identity such as:

* name
* appearance
* race/species
* class
* level
* equipment
* inventory
* personality
* goals
* current location
* home/base
* faction relationships
* reputation
* wealth
* experience
* survival status
* history

Example:

“Kael Thorn”
Level 4 Rogue
Currently traveling from Mosslight Crossing toward an abandoned mine.
Goal: find better daggers.
Personality: cautious.
Faction reputation: neutral.
Last known activity: killed two Cave Stalkers.

The system should track these characters rather than generating random fake NPCs every time.

⸻

10. AI PLAYERS MUST LIVE THEIR OWN LIVES

AI adventurers should not simply follow the player.

They should operate independently.

Possible behavior:

1. Spawn in a settlement.
2. Purchase equipment.
3. Receive/select a goal.
4. Leave town.
5. Travel through the world.
6. Fight enemies.
7. Collect resources.
8. Discover locations.
9. Enter dungeons.
10. Return to town.
11. Sell loot.
12. Upgrade equipment.
13. Gain levels.
14. Change goals.
15. Eventually leave the region/world.

Their actions should happen even when the player is nowhere nearby.

Use simulation LOD so this is computationally inexpensive.

⸻

11. AI PLAYER SIMULATION LOD

Do NOT simulate every AI adventurer at full gameplay fidelity.

Use simulation levels.

Near player

Full simulation:

* movement
* combat
* animation
* pathfinding
* interactions
* visible inventory/equipment
* dialogue

Same region

Reduced simulation:

* movement
* encounters
* travel
* combat outcomes
* resource gathering
* dungeon activity

Far away

Abstract simulation:

* travel time
* probability-based encounters
* XP
* loot
* deaths
* discoveries
* economic activity

When an AI adventurer enters the player’s vicinity, transition them into detailed simulation.

This should make the world feel alive without destroying performance.

⸻

12. AI PLAYERS CAN DIE

AI adventurers should not have guaranteed plot armor.

They can:

* lose fights
* run away
* become injured
* lose equipment
* die
* fail quests
* abandon objectives

Important AI adventurers can become part of the world’s history.

The player might later hear:

“A wandering adventurer named Kael Thorn disappeared in the Emberwood.”

Or discover his corpse.

Or find his abandoned equipment.

Or meet him again months later if he survived.

⸻

13. AI PLAYERS CAN LEAVE

AI players must have lifecycle events.

Some should:

* leave the region
* retire
* travel elsewhere
* disappear
* join factions
* become merchants
* become guild members
* become quest-givers
* die
* return later

Do not create an artificial situation where 100 AI players permanently wander around the starting area.

The world should have turnover.

⸻

14. AI PLAYERS SHOULD OCCASIONALLY CROSS PATHS WITH THE REAL PLAYER

Encounters should be relatively rare and meaningful.

Examples:

The player is walking down a road and sees another adventurer heading toward town.

The player enters a cave and sees another adventurer leaving.

The player arrives at a monster camp shortly after an AI adventurer killed several enemies.

The player encounters an AI adventurer fighting the same enemy.

The player discovers a campfire where another adventurer recently rested.

The player sees an adventurer carrying unusual equipment.

The player finds a dungeon partially explored by another adventurer.

The player can potentially help or ignore them.

This should feel organic.

⸻

15. AI PLAYER INTERACTION

Allow the real player to interact with AI adventurers.

At minimum:

* talk
* inspect
* trade where appropriate
* observe
* potentially recruit/help
* fight if hostility exists

AI players should have contextual dialogue.

Do not use generic:

“Hello traveler.”

over and over.

Dialogue should reflect:

* current location
* recent events
* goals
* faction
* personality
* player reputation
* world events
* their history

Example:

“I wouldn’t head east if I were you. Lost two days to those cultists near the old quarry.”

If that AI actually experienced the encounter, the statement should be grounded in its simulation history.

⸻

16. AI PLAYERS MUST SHARE THE SAME WORLD

This is extremely important.

AI adventurers should not exist in a fake separate simulation.

They must interact with the same:

* towns
* roads
* enemies
* resources
* dungeons
* factions
* economy
* world events
* locations
* geography

If an AI player clears an enemy camp, that can affect the world.

If they loot something important, the player may no longer find it there.

If that level of persistence is too expensive initially, implement a simplified version first, but design the architecture so shared-world consequences can expand later.

⸻

17. AI PLAYER HISTORY

Track meaningful events.

Examples:

* born/spawned
* joined guild
* purchased sword
* discovered cave
* killed monster
* completed quest
* defeated another adventurer
* died
* returned to town
* changed equipment
* gained level
* discovered relic

This history can be used for:

* dialogue
* rumors
* quests
* world news
* reputation
* procedural storytelling

The world should gradually generate stories without requiring scripted stories for everything.

⸻

18. MOSSlight CROSSING MUST BECOME A REAL STARTING HUB

Mosslight Crossing should feel like the beginning of an adventure.

It needs:

* recognizable town center
* believable streets
* guild
* chapel
* homes
* shops
* NPC activity
* adventurers arriving/departing
* roads leading outward
* nearby wilderness
* environmental storytelling
* visual landmarks

The player should immediately understand:

“This is home base.”

⸻

19. PLAYER PROGRESSION

Preserve and improve:

* XP
* levels
* Warrior
* Mage
* Rogue
* equipment
* crafting
* inventory
* loot
* horse
* NPC interactions

Make progression visually satisfying.

Leveling should feel meaningful.

Equipment should visually communicate progression where practical.

⸻

20. EMBER VAULT

The Ember Vault should feel like a completely different environment from the overworld.

Preserve the existing turn-based roguelike mechanics.

Improve:

* dungeon tiles
* lighting
* atmosphere
* particles
* hit feedback
* spell effects
* enemy readability
* UI
* fog of war
* room generation
* corridors
* environmental storytelling

Keep:

Mira of the Ember Road

Ashen Human

Wayfarer

Ember Bolt

Three depths

Cave Stalkers

Bone Scribes

Ash Cultists

First Flame shard

Sealed altar

Permadeath

⸻

21. POLISH THE GAME FEEL

Every action should have feedback.

Examples:

Movement:

* subtle animation
* sound
* terrain response

Combat:

* hit animation
* damage feedback
* impact effects
* death effects
* readable health changes

Loot:

* pickup feedback
* inventory response
* sound/effect

Level up:

* noticeable presentation
* satisfying feedback

Spell:

* visual projectile/effect
* impact
* sound if audio exists

Interaction:

* clear indication
* response

Do not add excessive flashy effects.

The goal is polished, readable RPG feedback.

⸻

22. UI OVERHAUL

The UI should feel like part of the game rather than developer tooling.

Remove:

* debug-looking controls
* unnecessary giant panels
* ugly default browser controls
* inconsistent typography
* temporary buttons
* placeholder text

Keep UI:

* readable
* compact
* atmospheric
* consistent
* mobile-friendly
* responsive

Important information should be easy to find.

⸻

23. MOBILE-FIRST

ASHFALL is ultimately mobile-first.

Do not destroy desktop controls while improving mobile.

Support:

* touch movement
* touch interaction
* responsive UI
* readable text
* appropriately sized buttons
* no accidental tiny controls
* usable inventory
* usable combat
* usable dungeon controls

Desktop:

* WASD
* arrows
* pointer controls

Mobile:

* touch controls
* contextual interaction
* virtual controls where appropriate

⸻

24. PERFORMANCE

The game needs to remain performant.

Do not solve visual problems by spawning thousands of expensive objects.

Use:

* chunking
* object pooling
* instancing
* culling
* LOD
* efficient procedural generation
* lightweight AI simulation
* caching

The world should look dense without actually simulating/rendering everything at maximum detail.

⸻

25. SAVE SYSTEM

The current dungeon run resets when the overlay closes.

Improve the architecture so game state can eventually persist cleanly.

At minimum, separate:

WORLD STATE
PLAYER STATE
AI PLAYER STATE
DUNGEON STATE
QUEST STATE
INVENTORY STATE

Do not create one giant impossible-to-maintain save object.

The world seed and deterministic generation should allow the world to be reconstructed rather than saving every piece of terrain individually.

⸻

26. DEVELOPMENT STATE FILE

Create and maintain a file in the repository:

ASHFALL_DEVELOPMENT_STATE.md

This file is extremely important.

It must contain:

Current build state

* what works
* what is partially working
* what is broken
* what is missing

Architecture

* major systems
* important files
* dependencies
* data flow

World generation

* generation pipeline
* seed system
* biome system
* map dimensions
* chunk system

AI players

* simulation architecture
* AI lifecycle
* current behavior
* persistence
* known limitations

RPG systems

* player
* combat
* equipment
* crafting
* inventory
* XP
* classes

Dungeon

* Ember Vault
* generation
* combat
* enemies
* progression
* victory/defeat

Save system

* current implementation
* limitations
* planned improvements

Known bugs

Maintain a real list.

Next priorities

Always keep a prioritized development list.

This file must be updated whenever meaningful architecture or feature changes are made.

⸻

27. DO NOT LOSE WORK

Every meaningful milestone must be saved to the repository.

Use Git properly.

After completing a coherent milestone:

1. Run tests.
2. Build the project.
3. Verify it launches.
4. Verify important gameplay paths.
5. Update ASHFALL_DEVELOPMENT_STATE.md.
6. Commit the changes.
7. Push to GitHub if credentials/access are available.

Commit messages should describe the actual milestone.

Do not create meaningless commits like:

“stuff”

or

“update.”

⸻

28. DEVELOPMENT LOOP

You are expected to actually BUILD the game.

Do not spend the entire session describing what you intend to do.

Use this loop:

INSPECT
→ PLAN
→ IMPLEMENT
→ RUN
→ TEST
→ FIX
→ VISUALLY INSPECT
→ POLISH
→ SAVE STATE
→ COMMIT

Then repeat.

If something is broken, fix it.

If a visual system is ugly, improve it.

If a generated feature looks obviously procedural, improve the generation logic.

Do not simply say:

“this could be improved later.”

⸻

29. PRIORITY ORDER

Work in this order unless a dependency requires otherwise.

PHASE 1 — Stabilize

Fix:

* crashes
* broken rendering
* input bugs
* state bugs
* obvious gameplay bugs
* build errors

PHASE 2 — OVERWORLD VISUAL OVERHAUL

This is the highest priority.

Make the map genuinely attractive.

Improve:

* terrain
* biome generation
* water
* roads
* forests
* elevation
* settlements
* landmarks
* environmental density
* visual hierarchy

PHASE 3 — MOSSlight Crossing

Make the starting town feel handcrafted and believable.

PHASE 4 — GAME FEEL

Improve:

* movement
* combat
* effects
* interactions
* feedback
* UI

PHASE 5 — AI ADVENTURERS

Implement the living-player simulation.

Start simple.

First create:

* persistent AI identities
* goals
* travel
* combat
* leveling
* equipment
* town visits
* dungeon participation
* lifecycle
* occasional player encounters

Then expand complexity.

PHASE 6 — EMBER VAULT POLISH

Make the dungeon visually and mechanically cohesive.

PHASE 7 — PERSISTENCE

Improve world/player/AI/dungeon state persistence.

PHASE 8 — CONTENT

Expand:

* regions
* enemies
* NPCs
* factions
* quests
* items
* dungeons
* events
* AI adventurers

⸻

30. IMPORTANT — DO NOT OVERENGINEER TOO EARLY

The AI player system does NOT need to be a perfect MMO simulation on day one.

Build a vertical slice first.

For example:

10–20 AI adventurers

Each has:

* identity
* class
* level
* equipment
* goal
* location
* basic personality

They:

* leave town
* travel
* fight
* loot
* level
* return
* sometimes enter a dungeon
* sometimes die
* sometimes disappear
* sometimes encounter the player

Once that works reliably, scale it.

⸻

31. WORLD SIMULATION PHILOSOPHY

The central design philosophy is:

“The world does not exist for the player.”

The player is one person living inside the world.

Other adventurers have their own lives.

NPCs have their own routines.

Factions have their own goals.

Creatures occupy ecosystems.

Resources exist independently.

Events happen without the player.

The player can influence the world, but the world does not wait for the player.

This is one of the defining features of ASHFALL.

⸻

32. NO FAKE RANDOMNESS

Avoid meaningless random events.

Bad:

“Random adventurer appears.”

Good:

“An adventurer who left Mosslight Crossing yesterday is returning after exploring the northern forest.”

Bad:

“Random camp spawned.”

Good:

“An AI adventurer recently camped here during their journey.”

Whenever possible, randomness should emerge from simulation.

⸻

33. TESTING

Create automated tests for important systems.

At minimum test:

* world generation
* deterministic seeds
* player movement
* combat
* XP
* inventory
* crafting
* AI movement
* AI combat
* AI lifecycle
* AI spawning
* AI persistence
* dungeon generation
* dungeon combat
* victory
* defeat
* save/load

Also run a manual smoke test.

The game must actually launch.

⸻

34. VISUAL QA

After the overworld overhaul, inspect the game visually.

Ask:

* Does this look like a real RPG?
* Does the terrain look natural?
* Does the map have visual variety?
* Are roads believable?
* Are settlements believable?
* Is there enough environmental detail?
* Does the world have interesting places to discover?
* Does the player stand out?
* Are enemies readable?
* Does anything look like obvious placeholder art?
* Does anything look accidentally generated?
* Does the UI look finished?

If the answer is no, keep improving it.

⸻

35. FINAL ACCEPTANCE CRITERIA

The current prototype should eventually become a game where:

1. I can start in Mosslight Crossing.
2. The world immediately looks attractive.
3. I can walk into the wilderness.
4. The terrain feels varied and natural.
5. Roads lead to meaningful locations.
6. The world contains things worth discovering.
7. I can fight enemies and collect loot.
8. I can level and improve my character.
9. I can interact with a believable town.
10. I can encounter AI adventurers.
11. Those adventurers appear to have their own lives.
12. They can travel without me.
13. They can fight without me.
14. They can level without me.
15. They can enter dungeons without me.
16. They can die without me.
17. They can leave and return.
18. I can occasionally cross paths with them.
19. Their history can influence what I encounter.
20. The Ember Vault remains a dangerous turn-based roguelike.
21. The game saves reliably.
22. The game builds and runs reliably.
23. GitHub contains the current state.
24. ASHFALL_DEVELOPMENT_STATE.md accurately explains where development currently stands.

⸻

MOST IMPORTANT INSTRUCTION

Do not treat this as a request to make a prettier prototype.

Treat this as the transition from:

TECHNICAL PROTOTYPE → ACTUAL GAME

The map is currently the weakest part.

Prioritize making the overworld visually compelling and geographically coherent.

Then build the AI-adventurer simulation so the world feels alive.

Do not destroy working gameplay while doing this.

Do not get stuck endlessly planning.

Inspect the codebase, make the changes, run the game, test it, fix problems, update the development state file, and commit the completed work.

When you finish a milestone, clearly report:

* what changed
* what was tested
* what still needs work
* what files were changed
* the Git commit hash
* the next recommended milestone

Then continue working on the next highest-priority item if the environment/session allows it.

One thing I’d emphasize when you give this to Claude: don’t let it interpret “make the map look good” as “add more trees.” The important part is geography + composition + landmarks + settlement design + terrain transitions + visual hierarchy. That’s what will get you away from the “dog-shit procedural prototype” look.

And the AI-player idea is actually a really strong ASHFALL feature because it fits the game’s whole philosophy: the world continues existing even when you’re not there.