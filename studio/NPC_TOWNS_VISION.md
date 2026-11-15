# NPC-Built Towns — Research Vision (15 videos)

**Received from the user:** 2026-11-15. Consolidated research brief from 15 video transcripts.
**Purpose:** Explain the ideas, mechanics, technical approaches, systems, and design opportunities Muse should investigate and incorporate into the game. NOT a request to copy the games shown. Extract their best ideas, understand how they work, combine them into a cohesive, ambitious game.

**The biggest opportunity:** combining a living world where NPCs have independent lives, memories, personalities, relationships, and ambitions; an infinite or extremely large procedurally generated world; a survival RPG with meaningful crafting, combat, exploration, and progression; a deep civilization simulation where settlements grow without constant player intervention; a world that feels alive because its inhabitants actually interact with its systems; efficient rendering and simulation techniques that allow enormous worlds and populations without destroying performance.

**User's overall recommendation:** Prioritize the combination of VoxelMind's autonomous villagers, Songs of Syx's deep civilization simulation, The Sims' utility-based AI, and procedural world generation. Those four together are the foundation. The other videos provide the rendering, exploration, combat, and optimization techniques to support it.

**Outstanding research items:** Video 5 — only the title and link were supplied; its actual workflow needs verification before the suggested 3D-to-sprite pipeline is treated as established fact. Video 16 — no title, URL, or transcript was supplied, so it hasn't been included.

---

## 1. Video-by-video research and mechanics

### Video 1 — One AI Started a Village. 32 Days Later It Sailed Without Her. (VoxelMind — Autonomous AI village simulation)

**Core concept:** Every villager is an independent AI agent. They make their own decisions, develop relationships, gather resources, construct buildings, and pursue projects without the player controlling them.

**Mechanics to consider:**

1. **Independent AI villagers** — Each NPC has its own decision-making process. NPCs can make plans without direct player instructions. They can initiate projects, solve problems, and cooperate. They can disagree, ignore suggestions, or develop different priorities.
2. **Survival needs** — Hunger, thirst, temperature, shelter, rest, food availability.
3. **Aging and permanent death** — Villagers age as the world progresses. Death is permanent. The loss of an important NPC can affect the entire settlement. Skills, knowledge, relationships, and responsibilities can be lost with them.
4. **Population growth** — New NPCs arrive when housing and food requirements are satisfied. Newcomers have their own personalities and starting circumstances. They aren't necessarily born knowing the village's history.
5. **Social interaction** — NPCs exchange resources, give gifts, notice missing villagers, organize search parties, cooperate on construction.
6. **Collaborative projects** — One NPC proposes an idea. Others contribute different resources or skills. Villagers independently complete their assigned work. A project can continue even if its original creator dies.
7. **Exploration and expansion** — Villagers can independently decide to explore, organize expeditions, build ships, discover new islands and establish settlements.

**Particularly important idea: NPC-generated history.** The village should accumulate a history that emerges from what its inhabitants actually do. Examples: a villager builds a house for somebody who disappeared; a character writes a book about the village; a memorial is built for someone who died; a new generation inherits an unfinished project; a villager becomes known for an important discovery.

**Game opportunity:** NPCs should create stories through their actions, rather than relying entirely on scripted quests.

### Video 2 — Making the World Infinite for My Top Down Pixel Game (Procedural terrain generation and chunk systems)

**Core concept:** Generate a practically unlimited world using algorithms instead of manually creating every section.

**Mechanics and technical ideas:**

1. **Procedural world generation** — Use Perlin or similar noise functions to generate terrain. Use noise values to determine grass, dirt, sand, mountains, and water. Generate different terrain elevations and land formations. Use multiple noise layers for more interesting results.
2. **Chunk-based world** — Divide the world into manageable chunks. Load chunks near the player. Unload or deactivate distant chunks. Preserve modifications made to previously visited chunks. Avoid generating the entire world at once.
3. **Biomes** — Forests, deserts, snowy regions, mountains, swamps, grasslands, oceans, islands, rivers.
4. **Terrain transitions** — Use bitmasking or neighbor-based rules to determine which terrain edges and corners should appear. Prevent ugly transitions between grass, water, sand, and dirt. Add random variations to prevent repetitive patterns.
5. **World detail** — Randomized grass, small rocks, flowers, bushes, tree variations, shoreline details, terrain decorations.

**Important implementation considerations:** Generate terrain deterministically using world coordinates and a seed. The same seed and coordinates should always produce the same base terrain. Save player modifications separately from the generated terrain. Use efficient tile rendering rather than spawning an individual game object for every tile.

**Game opportunity:** The world should be capable of expanding indefinitely while retaining geographical consistency. Exploring far away should reveal genuinely new environments rather than repeating the same terrain.

### Video 3 — My AI Villagers Thought I Was Dead (VoxelMind Episode 2 — Memory, relationships, and autonomous societies)

**Core concept:** NPCs remember previous events and develop beliefs about the world even when the player is absent. One of the most important systems for making the game feel alive.

**Mechanics to consider:**

1. **Persistent NPC memory** — Remember interactions with the player, gifts and favors, promises, conflicts, important village events, people who disappear or die.
2. **Long-term beliefs** — NPCs can develop their own interpretation of events. An NPC may believe the player abandoned them. Another may believe the player is dead. Different NPCs can have different opinions about the same event.
3. **NPC-generated documentation** — Villagers write books, create village chronicles, maintain guides and instructions, record discoveries and historical events, leave written messages for future generations.
4. **Laws and traditions** — Villagers can propose rules. Other villagers can accept or reject them. Traditions emerge from previous experiences. Laws can evolve as the settlement grows.
5. **Collective projects** — Building memorials, constructing meeting halls, creating community fires, improving settlement infrastructure, organizing celebrations.
6. **Player absence** — NPCs continue living while the player is away. They can progress through projects, change their opinions about the player, form new relationships, develop new settlement priorities.
7. **NPC identity** — Some NPCs are welcoming, some suspicious, some argumentative, some curious, some naturally generous.

**Particularly important idea: Memory must have consequences.** An NPC shouldn't just store the fact that something happened. It should influence future behavior. For example: player repeatedly helps a villager — trust increases. Player steals from a villager — suspicion increases. Player disappears without explanation — the NPC might feel abandoned. Player returns after a long absence — the NPC reacts according to its history with them.

**Game opportunity:** Build a persistent memory and relationship system that allows NPCs to develop unique relationships with the player and each other.

### Video 4 — Your Own 2D ASCII RPG With Raylib: Display Player XP (RPG architecture, combat, enemies, and experience progression)

**Core concept:** Connect overworld exploration with a dedicated combat system and persistent character progression.

**Mechanics to consider:**

1. **Enemy templates** — Different enemy types with predefined characteristics: name, maximum health, attack strength, visual appearance, experience reward, other attributes as needed.
2. **Enemy spawning** — Specific map locations can act as monster spawn points. Spawn a randomized number of enemies. Select enemies from biome-appropriate templates. Store their individual positions and statistics.
3. **Combat transition** — Player encounters an enemy. Game switches to combat mode. Combat receives the relevant enemy information. The player's overworld position is saved.
4. **Combat management** — Multiple enemies can participate. Player can select targets. Enemies take turns attacking. Enemies can be defeated independently. Player can flee.
5. **Victory and fleeing** — Winning grants experience. Defeated enemies are removed from their original world positions. Fleeing does not grant victory rewards. Surviving enemies remain in the world. Player returns near the original encounter location.
6. **Player progression** — Track XP. Display XP in the interface. Reward different enemies with different amounts. Expand into levels, skills, attributes, and abilities.

**Important additional mechanics:** Enemy health should persist appropriately. Player health should not automatically regenerate after every encounter unless intended. Combat rewards should be calculated from actual encounters. Enemy encounters should be connected to the actual overworld rather than existing independently.

**Game opportunity:** Combat should be a natural extension of exploration, not a disconnected minigame.

### Video 5 — 3D Model to 2D Sprite Sheet in 6 Minutes | Miso Editor (Asset production workflow)

The transcript wasn't supplied, so this section is based on the video's title rather than a verified breakdown of its techniques. **Needs verification before the pipeline is treated as established fact.**

**Potential workflow to investigate:**

1. Create or obtain a 3D character model.
2. Set up a consistent camera and lighting arrangement.
3. Render the character from multiple directions.
4. Generate animation frames.
5. Export the frames into a sprite sheet.
6. Import the resulting sheet into the game.

**Why this is useful:** Consistent character proportions. Easier production of directional animations. Faster creation of multiple NPC appearances. Easier equipment and clothing variations. Potentially reusable animation pipelines.

**Game opportunity:** Investigate using 3D models as a production tool while retaining a 2D or pixel-art presentation.

### Video 6 — Video Games Could Be Tiny. Why Aren't They? (Procedural assets, runtime generation, and compression)

**Core concept:** Instead of storing every asset individually, store the instructions needed to generate assets. The video examines the extraordinarily small game `.kkrieger`, which was approximately 97 KB.

**Mechanics and techniques:**

1. **Procedural audio** — Generate sounds from mathematical waveforms. Use synthesized instruments. Create sound effects at runtime. Randomly modify sound variations. Avoid storing every individual sound variation.
2. **Procedural models** — Build models using simple geometric primitives. Combine cubes, spheres, and cylinders. Apply transformations. Generate more complex objects from relatively simple descriptions.
3. **Procedural textures** — Generate patterns mathematically. Combine multiple noise layers. Apply gradients for coloring. Generate normal or bump maps. Create variations without storing separate texture files.
4. **Runtime asset generation** — Generate assets when needed. Cache generated assets. Reuse previously generated content. Avoid repeatedly generating the same objects.
5. **Compression** — Compress data where practical. Remove unnecessary resources. Reuse existing systems and code. Optimize asset formats.

**Important warning:** Runtime generation is not automatically better. It can increase CPU usage, RAM usage, loading times, and development complexity.

**Game opportunity:** Use procedural generation selectively — terrain variations, plant variations, rock formations, procedural crafting icons, generated ambient sounds, weather effects, small decorative objects. The goal should be to reduce repetitive asset creation and storage without sacrificing performance.

### Video 7 — The Most Complex Medieval Fantasy Game Ever Made (Songs of Syx — Civilization, economy, populations, and simulation)

**Core concept:** Every citizen is individually simulated, and the economy, production chains, population, and happiness emerge from their behavior. One of the most important references for expanding the game beyond a basic survival RPG.

**A. Individual citizen simulation.** Every citizen should potentially have: a home, a job, personal needs, food preferences, equipment preferences, relationships, skills, physical location, daily routines. Citizens physically travel to collect materials and perform their tasks. For example: (1) a worker receives a production task; (2) they travel to a warehouse; (3) they collect wood; (4) they travel to the workshop; (5) they produce an item; (6) they deposit the finished product; (7) they return to another task. This makes the world feel like a functioning place.

**B. Production chains.** Create interconnected industries. Example: Grain → Flour → Bread → Food storage → Citizen consumption (Farm → Mill → Bakery). Other chains: Trees → Logs → Planks → Furniture. Ore → Metal → Tools → Weapons. Cotton → Fabric → Clothing. Stone → Cut stone → Buildings. Animal products → Leather → Armor. Herbs → Medicine → Healthcare.

**C. Food and agriculture.** Implement: farms, orchards, fishing, hunting, animal husbandry, grain production, food processing, food storage, food spoilage, seasonal harvests. Important mechanics: soil quality affects production; moisture affects crop yields; climate affects which crops grow; food types have different nutritional values; different NPCs have different food preferences; stored food can expire.

**D. Economy and trade.** NPCs physically transport resources. Warehouses store products. Shops distribute goods. Settlements trade with one another. Raw materials can be processed into higher-value products. Supply and demand affect prices. Surplus production can be exported. Scarcity can create economic problems.

**E. Happiness and settlement stability.** Happiness should be influenced by: food availability, food variety, housing, clothing, equipment, entertainment, healthcare, hygiene, environment, religion or beliefs, social relationships, population density, security. A settlement can experience a death spiral if its population becomes unhappy, workers leave, production collapses, and resources become scarce.

**F. Services and infrastructure.** Potential buildings: wells, taverns, markets, hospitals, bathhouses, toilets, temples, training grounds, guard posts, warehouses, workshops, meeting halls, cemeteries. Each building should provide an actual service rather than simply being decorative.

**G. Population diversity.** Introduce different cultures, races, or communities with different preferences and characteristics. Possible differences: preferred climates, preferred food, preferred housing, work strengths, combat strengths, social compatibility, reproduction rates, lifespans.

**Game opportunity:** Build a settlement simulation where citizens are not just a population counter. They are actual individuals whose lives create the settlement's economy and history.

### Video 8 — How Did This 90s RTS Game Solve Pathfinding? (Command & Conquer: Tiberian Sun — Efficient AI movement)

**Core concept:** Don't calculate an expensive perfect path for every individual unit.

**Techniques to investigate:**

1. **Approximate pathfinding** — Calculate a rough route. Let units adjust as they move. Handle obstacles locally. Avoid recalculating the entire route constantly.
2. **Local obstacle avoidance** — Detect nearby obstacles. Find alternative movement directions. Avoid collisions with other units. Rejoin the intended route afterward.
3. **Hierarchical movement** — Calculate a broad route first. Use local navigation to handle individual obstacles. Reduce expensive calculations.

**Game opportunity:** Apply this to villagers walking through settlements, animals moving around forests, enemies pursuing the player, NPC caravans, large groups of citizens, soldiers and raiding parties. An NPC should be able to navigate around a building, another villager, a tree, or a crowded marketplace without requiring a full world-wide path calculation every time.

### Video 9 — 2D to 3D Environments in DuneCrawl (2D artwork projected onto 3D geometry)

**Core concept:** Create illustrated environments using 2D artwork placed onto simple 3D geometry.

**Production workflow:**

1. Create a simple 3D environment.
2. Render it from the intended camera angle.
3. Draw over the rendered image.
4. Add hand-drawn lines, colors, shading, and details.
5. Project the artwork onto simple 3D meshes.
6. Separate overlapping components into different meshes.

**Important mechanics:** Characters can walk behind buildings. Roofs and awnings can overlap characters. Trees can have foreground and background layers. Shadows can be calculated using 3D lighting. Buildings can have simple physical geometry.

**Game opportunity:** This could provide an attractive illustrated visual style without requiring every environmental asset to be fully modeled in 3D.

### Video 10 — My Pixel Art Indie Game Looks Flat, But It's Secretly 3D (Billboard sprites, orthographic camera, and dynamic lighting)

**Core concept:** The game looks like 2D pixel art, but the actual world exists in 3D.

**Techniques:**

1. **Billboard sprites** — Characters are flat images positioned in 3D. Trees, rocks, and other objects can also be flat sprites. Sprites rotate to face the camera.
2. **Orthographic camera** — Objects don't shrink as they get farther away. The camera preserves a consistent pixel-art appearance. The world has a balcony-like perspective.
3. **Real 3D lighting** — The sun produces actual shadows. Shadows change throughout the day. Objects can cast shadows onto the ground. Lighting can create different environmental moods.
4. **2.5D world** — Flat artwork, 3D positioning, real shadows, depth-based layering.

**Game opportunity:** A strong candidate for combining beautiful pixel art with dynamic weather, lighting, shadows, and environmental depth.

### Video 11 — I Spent a Year on Tiny Historical Details (Salt and Soil) (Historical simulation and geographically grounded world generation)

**Core concept:** Make the world feel authentic by basing its geography, climate, infrastructure, and inhabitants on real-world information.

**Mechanics and systems:**

1. **Geographical accuracy** — Real elevation data, mountains and rivers, realistic land formations, geographical relationships between locations.
2. **Climate simulation** — Climate zones, temperature variation, regional rainfall, seasonal conditions, animals and vegetation appropriate to each region.
3. **Historical infrastructure** — Roads, railroads, town development, ships, transportation technology.
4. **Historical inhabitants** — Clothing appropriate to their location and era, different environmental lifestyles, regional animal populations.

**Game opportunity:** Even if our game is fantasy rather than historical, this philosophy is extremely valuable. Biomes, animals, architecture, resources, and settlements should make geographical sense. For example: snowy regions have cold-adapted animals; deserts have limited water; forest settlements have access to timber; coastal settlements develop fishing and maritime industries; mountain settlements have access to different minerals. The world should feel like a connected ecosystem rather than random collections of objects.

### Video 12 — How Does The Sims Make a Little Person Feel Alive? (Needs, utility AI, traits, relationships, and life goals)

**Core concept:** NPCs can appear intelligent through a system of needs, weighted decisions, personality traits, and relationships. A particularly important technical reference because it offers an alternative to asking an expensive AI model to make every decision.

**A. Needs system.** Each NPC has changing needs: hunger, thirst, energy, social interaction, entertainment, hygiene, comfort, safety. These needs change over time.

**B. Utility-based decision-making.** Each available action receives a priority score. Example (illustrative, not actual Sims values): Eat when starving 500; Sleep when exhausted 450; Go to work 300; Socialize 200; Drink at tavern 100. The NPC chooses the highest-value available action.

**C. Personality modifiers.** Traits modify how NPCs value actions. Examples: Lazy — work becomes less attractive. Hardworking — work becomes more attractive. Social — interacting with people becomes more attractive. Curious — exploration becomes more attractive. Generous — giving items becomes more attractive. Greedy — retaining valuable resources becomes more attractive. Religious — visiting religious buildings becomes more attractive.

**D. Mood and temporary modifiers.** Recent events influence decisions. Examples: just ate — hunger decreases; just had a pleasant conversation — mood improves; lost a friend — sadness increases; witnessed violence — fear increases; received a gift — gratitude increases.

**E. Relationships.** NPCs can become friends. NPCs can dislike each other. Repeated positive interactions build relationships. Negative interactions create conflict. Relationships can develop into romance, marriage, or family connections.

**F. Life goals.** Each NPC can have a long-term ambition. Examples: become a blacksmith, become a famous explorer, build a family, become wealthy, become a respected leader, discover new lands, master a profession. Their daily decisions should gradually contribute toward their goals.

**Game opportunity: Hybrid NPC intelligence.** Use utility AI for ordinary daily decisions, and reserve advanced language-model reasoning for important decisions, social interactions, planning, and unusual situations. This gives believable autonomous characters without needing an expensive AI call every few seconds.

### Video 13 — How Does Total War Not Melt Your PC? (Large-scale simulation optimization)

**Core concept:** Simulate large groups intelligently instead of calculating everything independently for every individual.

**Four major optimization techniques:**

1. **Formation-based pathfinding** — Calculate a route for the group. Individual soldiers move toward their assigned positions. Avoid calculating a separate full path for every soldier.
2. **Spatial partitioning** — Divide the world into a grid. Check nearby units rather than every unit. Reduce collision detection costs.
3. **Simplified combat resolution** — Pair combatants. Calculate attacks against defenses. Determine outcomes mathematically. Use animations to represent the results.
4. **Level of detail** — Nearby units receive detailed simulation. Distant units use simpler calculations. Very distant units can use simplified representations. Reduce animation and update frequency based on importance and distance.

**Game opportunity:** These techniques are essential if we want hundreds or thousands of NPCs, large settlements, animal herds, armies, battles, crowded marketplaces, large-scale world simulation.

**Important principle:** Not every entity needs the same level of simulation all the time.

### Video 14 — I Hid a Secret Continent in My MMO (Exploration, discovery, sailing, and player-driven geography)

**Core concept:** Make exploration meaningful by putting valuable discoveries beyond familiar territory.

**Mechanics to consider:**

1. **Uncharted continents** — Entire landmasses can exist beyond the initial explored area. Players don't automatically see them on the map. Exploration reveals new locations. NPC rumors can provide clues.
2. **Ocean exploration** — Ships, sailing, wind patterns, navigation, maritime dangers, long-distance journeys.
3. **Distinct continents** — Frozen north, desert south, jungle islands, dangerous unexplored territories.
4. **Discovery rewards** — Rare resources, ancient ruins, valuable minerals, unique animals, boss creatures, new settlement opportunities.
5. **Risk and reward** — Longer journeys offer greater potential rewards. Supplies must last throughout the expedition. Death can have consequences. Dangerous regions may lack safe settlements.
6. **Player-driven knowledge** — Maps are shared. Players can sell information. NPCs can trade discoveries. Exploration becomes a meaningful economic activity.

**Game opportunity:** Exploration should be about discovering places that genuinely feel unknown, not simply uncovering another identical section of terrain.

### Video 15 — I Hate Tilesets. So My Map Doesn't Have One. (Procedural terrain shaders and seamless ground rendering)

**Core concept:** Instead of manually drawing every possible tile combination, use mathematical blending to create terrain transitions.

**How it works:**

1. Every terrain tile has a numerical value representing its terrain type.
2. The ground shader examines neighboring tiles.
3. It evaluates which terrain should appear at each pixel.
4. Different terrain types blend together.
5. Noise creates natural-looking irregularities.
6. Decorative effects create grass edges, foam, and other details.

**Terrain possibilities:** Grass meeting dirt; dirt meeting sand; sand meeting water; grass meeting snow; snow covering roads; footpaths appearing over terrain; plowed fields; coastal foam; irregular shorelines.

**Advantages:** Fewer manually authored tile combinations. Seamless terrain transitions. More natural-looking borders. Consistent visual style. Potentially fewer rendering calls.

**Game opportunity:** Investigate shader-based terrain rendering as an alternative to massive traditional tilesets. Especially interesting for an infinite procedural world.

---

## 2. The combined game systems these videos suggest

The individual videos are useful, but the real value comes from combining their ideas. Here are the major systems to investigate as one connected architecture.

### System A — Living autonomous world (High priority)

The world should continue existing independently of the player.

Core features: autonomous NPCs; independent daily schedules; needs and survival; personality traits; long-term goals; persistent memories; relationships; NPC-generated projects; population growth; aging and death; community traditions; written histories.

**The important distinction:** NPCs shouldn't just wait for the player to interact with them. They should have lives that continue regardless of the player's presence.

### System B — Infinite procedural world (High priority)

Combine the procedural generation techniques from videos 2, 6, 11, and 15.

Core features: seed-based generation; chunk loading; multiple noise layers; biome generation; terrain transitions; rivers and lakes; mountains; forests; islands; oceans; hidden continents; underground areas; persistent world modifications; weather and seasonal variations.

The generation system should create geography that influences gameplay, not just scenery.

### System C — Deep survival and crafting

Core features: hunger; thirst; temperature; fatigue; health; injury; food spoilage; gathering; hunting; fishing; farming; crafting; equipment durability; storage; building.

Every resource should have a reason to exist and preferably participate in a larger crafting or economic system.

### System D — NPC economy and civilization

Combine Songs of Syx with VoxelMind.

Core features: individual jobs; work schedules; resource transportation; production chains; warehouses; shops; markets; trade; currency; supply and demand; housing; infrastructure; services; community happiness; settlement growth; migration.

A settlement should evolve from a small camp into a village and potentially into a major civilization.

### System E — Exploration and adventure

Combine the sailing, discovery, and RPG mechanics.

Core features: large geographical regions; ships; sailing; uncharted islands; rare resources; ruins; dungeons; monsters; expeditions; maps; discoveries; regional bosses; dangerous wilderness.

### System F — Combat and progression

Core features: enemy templates; biome-specific enemies; enemy AI; multiple combatants; experience; levels; skills; equipment; weapon types; armor; enemy loot; combat rewards; player attributes; NPC combat abilities.

### System G — Visual presentation

Combine videos 5, 9, 10, and 15.

Core features to investigate: 2D pixel-art presentation; 2.5D world construction; billboard sprites; orthographic camera; dynamic shadows; procedural terrain transitions; 3D-assisted sprite production; layered scenery; environmental lighting; weather effects.

---

## 3. Additional mechanics worth adding to the game

Design opportunities derived from the combined research. Not all explicitly demonstrated in the videos, but they follow naturally from the systems they introduce.

### A. Emergent events and storytelling

Instead of relying entirely on predetermined quests, generate events from the simulation. Examples: a villager goes missing; a family requests help; a settlement experiences a food shortage; a merchant discovers a rare resource; a forest fire threatens a village; a group of NPCs organizes an expedition; a new settlement declares independence; a famous explorer dies; a settlement creates a monument; two communities enter a conflict over resources. Events should have causes, consequences, and histories.

### B. Family and generational systems

Build on the aging and permanent death mechanics. NPCs can form families, have children, children grow up over time, parents teach children skills, skills and traditions pass between generations, family members remember their relatives, inherited possessions can have historical significance, entire family lines can become important to a settlement. A blacksmith's child might inherit their parent's workshop, tools, and reputation.

### C. NPC professions and specialization

Give NPCs professions that develop through experience. Farmer (grow and harvest crops); Hunter (hunt wildlife); Fisher (catch fish); Miner (extract minerals); Blacksmith (make tools and weapons); Carpenter (make furniture and structures); Tailor (produce clothing); Builder (construct buildings); Merchant (trade resources); Explorer (discover new regions); Guard (protect settlements); Healer (treat injuries and illnesses); Scholar (research and document knowledge); Sailor (operate ships and explore oceans). NPCs should develop strengths and weaknesses instead of every villager being equally good at everything.

### D. Knowledge and technological advancement

Settlements should be able to develop technology. For example: stone tools, copper tools, bronze tools, iron tools, advanced metalworking, better agriculture, improved construction, shipbuilding, mechanical inventions. NPCs should be able to discover, teach, and spread knowledge. A settlement with skilled miners and blacksmiths should eventually become better at producing metal equipment than a settlement without those professions.

### E. Reputation and reputation-driven relationships

The player should develop a reputation. Possible reputations: generous, wealthy, dangerous, trustworthy, dishonorable, famous explorer, skilled warrior, master craftsman, thief, hero. NPCs and settlements should react differently based on what they know about the player.

### F. Weather and environmental consequences

Build weather into the survival and economy systems. Rain affects crops; drought reduces water supplies; snow changes movement; cold weather increases heating requirements; storms affect sailing; wind influences ships; floods damage buildings; seasonal changes influence animal behavior. Weather should change how people live, not just change the appearance of the screen.

### G. Animal ecosystems

Animals should have their own needs and behaviors: feeding, drinking, sleeping, reproduction, migration, hunting, predator-prey relationships, territory, herd behavior. Animals should also respond to changes caused by settlements. Overhunting can reduce populations. Forest destruction can affect animal habitats. Farming can attract certain wildlife.

### H. Settlement politics and diplomacy

Once settlements become large enough, introduce political systems: leaders, councils, laws, taxes, trade agreements, alliances, rivalries, wars, peace negotiations, territorial disputes, independence movements. NPCs should have political opinions based on their personalities, experiences, relationships, and material circumstances.

### I. World-generated books and records

This deserves special attention because of the VoxelMind videos. Allow NPCs to produce: diaries, historical chronicles, maps, recipes, crafting manuals, religious texts, settlement laws, travel journals, family histories, adventure stories. These should be based on real simulated events. A book written by a villager who actually sailed to a distant continent should contain that villager's discoveries, not generic generated filler.

---

## 4. How the AI system should actually work

One of the biggest lessons from these videos is that we shouldn't use an expensive language model for every single NPC action. Investigate a hybrid architecture.

**Hybrid NPC intelligence:**

- **NPC data** — Needs, personality, skills, memories, relationships, goals.
- **Utility AI** — Frequent decisions, survival, jobs, movement, routine activities.
- **Advanced AI reasoning** — Complex planning, social decisions, conversations, unexpected events.
- **World simulation** — NPC takes action, world changes, events recorded, memories updated.

### NPC data structure

Each NPC should conceptually have: Identity (name, age, appearance); Needs (hunger, thirst, energy); Personality (brave, lazy, generous); Skills (farming, mining, combat); Relationships (friends, enemies, family); Memories (important past events); Goals (become a master blacksmith); Inventory (items carried); Employment (current profession); Location (current coordinates); Health (injuries, illness, condition); Beliefs (opinions, values, traditions).

### Memory architecture

Memory should be divided into different types:

1. **Short-term memory:** Recent conversations and immediate events.
2. **Long-term memory:** Important interactions, relationships, promises, and significant experiences.
3. **Social memory:** What an NPC knows about other characters.
4. **Historical memory:** Important events in the settlement or world.
5. **Knowledge:** Learned recipes, skills, locations, and discoveries.

Memory should be persisted so NPCs don't lose their identities when the game closes.

### Important AI safeguards

Muse should investigate:

- AI actions must use actual available game-world information.
- NPCs must not invent resources they don't possess.
- NPCs cannot build something without materials.
- NPCs cannot teleport to destinations.
- NPCs cannot perform impossible actions.
- AI-generated plans must be validated by the simulation.
- Failed plans should result in replanning.
- NPCs should not forget important commitments.
- Memory should be summarized and managed to avoid unlimited growth.

**Most important:** The AI can decide what it wants to do, but the game simulation determines what is actually possible.

---

## 5. Performance and technical architecture

Simulation depth is only useful if the game can actually run it. Optimizations to investigate:

| Technique | Purpose |
| --- | --- |
| Chunk system | Manage enormous worlds |
| Deterministic generation | Recreate terrain consistently |
| Spatial partitioning | Reduce nearby-entity checks |
| Local pathfinding | Reduce expensive navigation |
| Utility AI | Cheap frequent NPC decisions |
| Simulation LOD | Reduce distant NPC updates |
| Entity batching | Handle large populations |
| Asset caching | Avoid repeated generation |
| Procedural textures | Reduce manually created variations |
| Sprite batching | Reduce rendering overhead |
| Save deltas | Store world modifications efficiently |

### Simulation distance levels

Not every NPC needs full simulation all the time.

- **Level 1 — Nearby NPCs:** Full movement, interactions, animations, needs, jobs, and decision-making.
- **Level 2 — Nearby settlements:** Simplified movement, work schedules, resource consumption, and relationships.
- **Level 3 — Distant settlements:** Statistical simulation of population, production, consumption, migration, and events.
- **Level 4 — Unvisited regions:** Generate geography deterministically and simulate only the important world-level processes.

This allows the world to continue functioning without requiring every NPC to receive a full update every frame.

### Important save system requirements

The save system should preserve: world seed; generated and modified chunks; NPC identities and attributes; NPC memories; relationships; inventories; buildings; resource stocks; settlement development; discovered locations; historical events; time and seasons; animal populations; active projects. Saving should not require storing every unchanged piece of generated terrain.

---

## 6. Recommended development priorities

Muse should not attempt to implement every system simultaneously. These mechanics depend on one another, and the game needs a solid foundation. Recommended order of investigation and implementation.

### Phase 1 — Core world foundation (Essential foundation)

Infinite procedural world generation; chunk loading and unloading; biomes and terrain transitions; resource placement; player movement and interaction; inventory and item management; basic survival needs; persistent world saving.

### Phase 2 — Living NPCs (Essential gameplay)

Individual NPC identities; needs and utility-based decisions; personality and traits; NPC schedules; gathering and crafting; NPC pathfinding; NPC relationships; persistent memory; NPC conversations.

### Phase 3 — Survival RPG

Combat; enemy spawning; XP and leveling; skills and attributes; equipment and crafting; hunting and fishing; farming; weather and seasons; health, injuries, and healing.

### Phase 4 — Settlement simulation

NPC construction projects; housing and population growth; jobs and professions; production chains; warehouses and resource transportation; markets and trade; settlement happiness; laws and traditions; autonomous settlement development.

### Phase 5 — Advanced civilization

Families and generations; aging and permanent death; NPC-generated books and chronicles; technology progression; multiple settlements; diplomacy and politics; large-scale warfare; regional economies.

### Phase 6 — Exploration and advanced world

Oceans and sailing; uncharted continents; ships and expeditions; ancient ruins; rare resources; underground environments; boss encounters; dynamic ecosystems; world discovery and cartography.

### Phase 7 — Optimization and polish

Simulation LOD; spatial partitioning; efficient rendering; procedural asset generation; dynamic lighting and shadows; advanced terrain shaders; performance testing at large populations; save/load reliability testing.

---

## 7. The most important gameplay vision

The strongest combination of these videos is something like this:

**You begin as one person in a massive, unexplored world.**

You can survive alone, explore, gather resources, hunt, build, craft, and develop your character. Eventually, you meet other people. But these aren't ordinary NPCs waiting for dialogue interactions. They have their own ambitions, memories, personalities, needs, relationships, and plans.

You might help establish a small settlement. The villagers begin building houses, gathering food, creating tools, and developing professions. Eventually, the settlement grows beyond what you personally manage. Some villagers become farmers. Others become miners, blacksmiths, merchants, explorers, or builders. They begin producing goods, trading, creating traditions, and developing their own society. Some might leave to explore distant lands. Others might establish new settlements. People grow old. People die. New generations arrive. The world remembers what happened.

A village might remember that you saved it from starvation 20 years ago. Another might remember you as a thief. A book might describe an expedition that happened generations before the player arrived. You could leave the world for a long time and return to discover that everything has changed.

**The goal is to create a world that feels like it exists independently of the player.**

---

## 8. Instructions for Muse

You are responsible for the actual technical investigation, coding, implementation, and integration of the game systems described in this research document. The video research has been consolidated into several major areas:

1. Autonomous AI NPCs.
2. Infinite procedural world generation.
3. NPC memories, personalities, relationships, and history.
4. Survival RPG mechanics and combat.
5. Civilization and settlement simulation.
6. Production chains and autonomous economies.
7. Exploration, sailing, and hidden continents.
8. Procedural assets and rendering.
9. Efficient pathfinding and large-scale simulation.
10. Dynamic environments, weather, and ecosystems.

**Your responsibilities:**

1. **Investigate the existing project first.** Understand the current architecture, programming language, engine, existing systems, data structures, and limitations. Do not assume the project is a blank slate.
2. **Create an implementation plan.** Identify which systems already exist, which are partially implemented, which are missing, which depend on other systems, which existing systems need improvement, and potential performance and architectural problems.
3. **Research technical approaches.** Use the videos as design and technical inspiration. Investigate the actual implementation methods and adapt them to the existing project. Do not blindly copy their architecture.
4. **Prioritize interconnected systems.** The game should ultimately combine survival RPG gameplay, autonomous NPC intelligence, procedural world generation, and civilization simulation. These systems should communicate with each other. For example, farming must influence food availability, food availability must influence NPC happiness and survival, and those conditions must influence settlement growth.
5. **Preserve existing functionality.** Do not unnecessarily rewrite working systems. Avoid breaking existing mechanics while introducing new features.
6. **Build systems that can expand.** Avoid temporary implementations that make future features difficult. Think about long-term compatibility between NPCs and settlements, NPCs and the economy, NPCs and world exploration, world generation and saving, combat and progression, memories and historical events.
7. **Performance matters.** Investigate chunking, simulation LOD, spatial partitioning, efficient pathfinding, batching, caching, and other appropriate optimization techniques. Do not simulate every NPC at maximum detail every frame.
8. **Keep AI grounded in the actual simulation.** NPCs can make their own decisions, but they must obey game-world rules. They cannot create resources from nothing, teleport, construct buildings without materials, or perform impossible actions. Use conventional game AI for frequent routine decisions and more advanced AI reasoning for complex planning and social interactions where appropriate.
9. **Test everything.** Every implemented system should be tested independently and then tested with its connected systems. Pay particular attention to saving, loading, NPC persistence, resource consistency, and performance.

**Overall objective:** Create a cohesive, expandable game in which the player participates in a living world containing independently functioning NPCs, evolving settlements, meaningful survival mechanics, exploration, and an emergent history. Do not treat this document as a demand to implement everything immediately. Investigate first, plan the architecture, identify dependencies, and then implement progressively. The ultimate goal is not simply a survival game with NPCs. It is a persistent world that can develop its own stories, societies, economies, and history without requiring the player to control everything.
