# LIVING WORLD VISION — Adventure as a living, simulated world

User's master brief, received 2026-11-15 ~15:44 MST (his words, saved in full). This is the direction for Adventure. It builds on the NPC-built-towns vision (studio/NPC_TOWNS_VISION.md) — it does not replace it.

---

Yes. This is the direction I think we should take with Adventure. We need to stop treating the world as a collection of maps, sprites and buildings, and start treating it as a living, simulated world that can develop independently of the player.

The idea is to combine the best parts of:

* Age of Empires — terrain, resources, harvesting, infrastructure, construction and economic development.
* Cossacks — large settlements, resource economies, military infrastructure and historically grounded building systems.
* Minecraft — a world made of individual blocks, materials, mining and construction.
* Dwarf Fortress — autonomous inhabitants, professions, needs, relationships and emergent settlements.
* RimWorld — individual NPC intelligence, work priorities, schedules and colony management.
* WorldBox — a world that evolves, develops populations and changes over time.

The most important decision: the NPCs must be able to create the world, not just inhabit a world we have already built.

We build the underlying world systems first. Then we give the NPCs the intelligence, resources and tools to develop it.

## 1. The world comes first

Foundation priority 1

We need a proper world-generation and world-simulation foundation.

| System | What it needs to do |
|---|---|
| Land | Hills, valleys, plains, cliffs, mountains |
| Terrain | Grass, dirt, mud, sand, gravel, snow |
| Water | Oceans, lakes, rivers, streams, ponds |
| Geology | Rock layers, stone types, underground deposits |
| Vegetation | Forests, individual trees, bushes, grass |
| Minerals | Iron, copper, coal, gold, silver, stone |
| Climate | Temperature, rainfall, seasons, weather |
| Wildlife | Natural animal populations and habitats |
| Caves | Underground passages, ore deposits and caves |
| Ecosystems | Regrowth, erosion, animal populations and environmental changes |

Important: resources must physically exist.

We shouldn't simply give a town 500 wood or 300 stone.

Resources should exist in the world.

* Trees contain harvestable wood.
* Rocks contain stone.
* Iron deposits exist underground.
* Coal deposits can be mined.
* Rivers provide water and fishing.
* Forests support wildlife.
* Soil quality affects farming.
* Animals reproduce and migrate.
* Trees regrow over time.

The NPC economy will interact with these actual world resources.

## 2. The Cossacks building system

Foundation priority 2

I've researched the Cossacks 3 building categories and compared them with Age of Empires II.

Cossacks 3 separates civilian resource buildings, training buildings, upgrade buildings, military production and defensive infrastructure. That's a good starting structure for our construction database. Cossacks 3 Wiki +1

Here is the building catalogue I would establish for Adventure.

### A. Settlement and residential buildings

* Town Hall
* Village Hall
* Houses and cottages
* Large family homes
* Worker housing
* Inns and taverns
* Guesthouses
* Noble estates
* Manor houses
* Guild halls
* Warehouses
* Storehouses

### B. Resource and production buildings

* Woodcutter's hut
* Lumber mill
* Quarry
* Mining shaft
* Mine entrance
* Smelter
* Foundry
* Blacksmith
* Forge
* Charcoal burner
* Sawmill
* Stone mason
* Carpenter
* Workshop
* Tannery
* Butcher
* Weaver
* Tailor
* Pottery workshop

### C. Food and agriculture

* Farms
* Windmills
* Watermills
* Granaries
* Barns
* Animal pens
* Sheep farms
* Cattle farms
* Pig farms
* Chicken coops
* Stables
* Fishing huts
* Fisheries
* Orchards
* Vegetable gardens
* Bakeries
* Breweries

### D. Trade and services

* Market square
* Market stalls
* General store
* Merchant houses
* Trading post
* Caravanserai
* Bank
* Apothecary
* Hospital
* Church
* Monastery
* School
* Library
* Inn
* Blacksmith services

### E. Military and defensive infrastructure

* Barracks
* Archery range
* Stable
* Armoury
* Siege workshop
* Guardhouse
* Watchtower
* Walls
* Wooden palisades
* Gates
* Stone towers
* Castle
* Keep
* Training grounds

### F. Infrastructure

* Dirt roads
* Cobblestone roads
* Bridges
* Wooden bridges
* Stone bridges
* River crossings
* Wells
* Water pumps
* Irrigation channels
* Fences
* Street lamps
* Docks
* Harbours
* Paths
* Drainage
* Defensive roads

These should be individual building definitions with construction materials, footprints, functions, capacity, workers, production rates, maintenance and upgrade paths.

The important part is that this isn't just a visual catalogue. Every building must have a purpose in the simulation.

## 3. How the NPCs actually build a civilization

Foundation priority 3

This is where we combine the simulation systems.

NPCs need to operate as individuals, but also participate in a larger settlement.

### NPC professions

| Profession | Responsibilities |
|---|---|
| Farmer | Plant, harvest, maintain farms |
| Lumberjack | Find forests, cut trees, deliver wood |
| Miner | Find deposits and extract minerals |
| Stonecutter | Extract and prepare stone |
| Builder | Construct and repair buildings |
| Carpenter | Produce timber and furniture |
| Blacksmith | Produce tools, weapons and armour |
| Merchant | Trade and transport goods |
| Hunter | Hunt wildlife and gather food |
| Fisher | Catch fish |
| Shepherd | Maintain livestock |
| Guard | Protect settlement |
| Engineer | Roads, bridges and infrastructure |
| Architect | Plan settlement layouts |
| Mayor | Manage settlement priorities |

### How construction should work

Let's say 12 NPCs establish a new settlement.

Example: a settlement develops naturally

* Establish a settlement
  NPCs identify suitable land near water, resources and accessible terrain.
* Establish a camp
  They gather branches, wood and stone, build shelters and establish storage.
* Establish food production
  They hunt, fish, forage and eventually cultivate farmland.
* Develop infrastructure
  They establish paths, roads, wells, bridges and stockpiles.
* Develop trades
  They build workshops, farms, mills, blacksmiths and other production buildings.
* Expand the population
  Families move in, children grow up, new workers take professions and housing expands.
* Become a village or town
  The settlement develops a market, tavern, guardhouse, guilds and local government.
* Become part of a civilization
  Multiple settlements establish trade, roads, alliances, territorial boundaries and political relationships.

### The construction intelligence

NPCs should not randomly place buildings.

They need an actual decision-making system:

* Assess the available terrain.
* Identify nearby resources.
* Calculate distances to water and existing infrastructure.
* Identify suitable building locations.
* Determine what resources are required.
* Assign workers to gather materials.
* Transport materials to the construction site.
* Prepare the foundation.
* Build the structure.
* Assign workers and begin production.

For example, a blacksmith cannot operate without a building, tools, fuel and materials. A mine needs workers, a viable deposit and a transport route.

Buildings should have dependencies, not just construction costs.

## 4. Animals and ecosystems

Foundation priority 4

Animals need their own simulation.

Wildlife:

* Deer
* Elk
* Wolves
* Bears
* Foxes
* Rabbits
* Boars
* Birds
* Fish

Domestic animals:

* Cattle
* Sheep
* Pigs
* Chickens
* Horses
* Goats
* Dogs

Each species needs:

* Habitat preferences.
* Food and water requirements.
* Reproduction.
* Population limits.
* Migration.
* Predator and prey relationships.
* Domestication.
* Interaction with settlements.

A forest should support different wildlife than a desert or mountain biome.

NPC hunting should also affect animal populations. Overhunting can deplete an area, forcing hunters to travel further.

## 5. The technical architecture we should use

This is particularly important because Adventure already has some of the underlying systems.

I checked the actual GitHub repository and its existing source code.

### Existing foundations discovered

We already have:

| Existing system | Current capability |
|---|---|
| Little World Generator | Tectonic-style plates, elevation, erosion, rivers, climate and biomes |
| World Map | Expanded deterministic world and multiple continents |
| Civilization | Kingdoms, settlements, rulers, caravans and trade |
| Settlement Economy | Workers physically travel to quarries and stockpiles |
| Town Production | Farmers, smiths and priests produce resources |
| Village Life | NPC needs and daily schedules |
| Building Art | Deterministic building sprite selection |
| World Development | Event bus, history, undo/redo and world diagnostics |

These are real existing modules, not proposed features. The repository even has tests for mining, hauling, resource storage, deterministic generation and economic simulation.

We should build on them rather than replace them.

The missing connection is bringing the generated natural world, physical resource deposits, building placement and autonomous construction together.

### The architecture I want

ADVENTURE — LIVING WORLD ENGINE

```
├── 1. WORLD GENERATION
│   ├── Continents
│   ├── Tectonic plates
│   ├── Elevation and erosion
│   ├── Mountains and valleys
│   ├── Rivers, lakes and oceans
│   ├── Climate and seasons
│   └── Biomes
│
├── 2. NATURAL WORLD
│   ├── Terrain and soil
│   ├── Rock formations
│   ├── Mineral deposits
│   ├── Trees and vegetation
│   ├── Water sources
│   ├── Caves and underground layers
│   └── Wildlife ecosystems
│
├── 3. RESOURCE ENGINE
│   ├── Harvesting
│   ├── Mining
│   ├── Farming
│   ├── Forestry
│   ├── Processing
│   ├── Storage
│   └── Transportation
│
├── 4. CONSTRUCTION ENGINE
│   ├── Building catalogue
│   ├── Terrain suitability
│   ├── Construction footprints
│   ├── Material requirements
│   ├── Foundations
│   ├── Worker assignments
│   └── Building upgrades
│
├── 5. NPC SIMULATION
│   ├── Individual intelligence
│   ├── Needs and survival
│   ├── Professions
│   ├── Families and population
│   ├── Work priorities
│   ├── Autonomous construction
│   └── Social relationships
│
├── 6. CIVILIZATION
│   ├── Camps
│   ├── Villages
│   ├── Towns
│   ├── Cities
│   ├── Trade networks
│   ├── Kingdoms
│   └── Politics and warfare
│
└── 7. WORLD STUDIO
    ├── Terrain editor
    ├── Resource editor
    ├── Building editor
    ├── NPC controls
    ├── Civilization controls
    ├── Simulation speed
    └── World history and events
```

## 6. The order we should actually develop this

I would build it in these stages, with each stage tested before moving on.

### Phase 1 — Natural world

Start here

* Improve terrain generation.
* Add geological layers and mineral deposits.
* Add individual trees, rocks and vegetation.
* Establish realistic rivers, lakes and water systems.
* Add resource regeneration and environmental simulation.

### Phase 2 — Resources and infrastructure

* Physical resource gathering.
* Storage and transportation.
* Roads, bridges, wells and stockpiles.
* Mines, quarries, farms and lumber operations.

### Phase 3 — Building catalogue

* Implement the complete initial Cossacks-inspired building catalogue.
* Building footprints and terrain restrictions.
* Construction materials and requirements.
* Construction stages and building interiors.
* Functional production buildings.

### Phase 4 — Autonomous NPCs

* Assign professions.
* Give NPCs construction intelligence.
* Make them gather and transport resources.
* Let them establish settlements independently.
* Introduce families, reproduction and population growth.

### Phase 5 — Living civilizations

* Settlements expand organically.
* Trade between towns.
* Roads and transport networks develop.
* Towns develop specialized industries.
* Kingdoms, guards, military and territorial expansion.

### Phase 6 — World Studio

* Control simulation speed.
* Watch settlements develop.
* Spawn NPC populations.
* Inspect resources and buildings.
* Edit terrain and geological deposits.
* Observe the history of civilizations.

## 7. Some important design decisions

There are a few things I don't want us to compromise on.

1. Don't destroy our existing map.
   Keep the current Adventure world, starting region, landmarks and established layouts. New world-generation systems should be additive and support existing maps.
2. Don't simulate every NPC at full detail all the time.
   Use simulation levels:
   * Nearby NPCs: full movement, animations, interactions and construction.
   * Nearby settlements: simplified individual jobs and schedules.
   * Distant settlements: economic and population simulation.
   * Very distant regions: periodic world-level simulation.
   This will help us maintain performance.
3. Buildings must be functional.
   A mill should process grain. A blacksmith should produce equipment. A stable should house horses. A warehouse should store materials.
4. NPCs must have agency.
   They should decide what their settlement needs, what to build next and which resources to gather. We can provide priorities and rules, but shouldn't need to manually control every worker.
5. The world must persist.
   Terrain modifications, depleted mines, harvested forests, buildings, populations, roads and settlement development must survive saving and loading.

## 8. Our first actual development milestone

World Foundation 1.0

I want our first working demonstration to look like this:

A generated landscape containing:

* Mountains, hills, forests and grasslands.
* Rivers, lakes and coastlines.
* Individual harvestable trees.
* Individual mineable rock formations.
* Underground iron, copper, coal and gold.
* Wildlife populations.
* A small NPC population.
* A working quarry and lumber operation.
* A construction site where NPCs physically deliver resources and build a house.

The ultimate test: We start a new world, leave a group of NPCs alone, and watch them establish a camp, gather materials, build homes, establish farms and gradually turn it into a functioning village.

That's the foundation of the game.

My recommendation is to start by connecting the existing littleWorldGenerator, worldMap, civilization and settlementEconomy modules, then create a proper persistent natural-resource and geology system. We should not start by adding hundreds of decorative building sprites.

The world needs to work first. The civilizations will grow out of it.

---

## Program notes (parent, added 2026-11-15)

* Saved verbatim from the user's message; this is the master direction for Adventure. The NPC-built-towns vision (studio/NPC_TOWNS_VISION.md) remains the settlement half of this program; this document is the whole.
* Reference rule (standing): Age of Empires, Cossacks, Minecraft, Dwarf Fortress, WorldBox, RimWorld are behaviour targets rebuilt with the game's own art — never verbatim copies, never source-game IP.
* The user's "Existing foundations discovered" table is HIS claim from checking the repo — the audit at ~/workspace/verify-world-program/PLAN.md verifies each module against the actual code before the plan treats it as fact. Do not assert the inventory as confirmed until that audit lands.
* In-flight when received: BUILD 1061 (trees) is Phase 1's first piece. Population growth (Tamsin) is parked in git stash stash@{0}, resumes as BUILD 1062 only on the user's word.
* Audit + phased plan: ~/workspace/verify-world-program/PLAN.md + COSSACKS_BUILDINGS.md (read-only audit agent, running 2026-11-15).
