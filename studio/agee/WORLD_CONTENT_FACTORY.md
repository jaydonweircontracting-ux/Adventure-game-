# World Content Factory

**Status:** DOCUMENTED ONLY (registry D7). No world content factory exists as an engine. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 2 ("BUILD A WORLD CONTENT FACTORY").

## What it is

The world content factory generates **coherent playable content** — world features, architecture, creatures, NPCs, and quests — that fits the world it lands in. It is not a random filler generator. Every generated piece must have a reason to exist where it is, a way for the player to reach it, and a way for the player to interact with it.

## What "coherent" means (the bar every generated piece must clear)

1. **Reachable.** The player can walk to it. No content behind an impassable wall, inside a sealed pocket, or floating where no path leads. (The 1030 player A* exists for tap-to-walk; the factory must generate content the pathfinder can actually reach.)
2. **Consistent with its surroundings.** A fishing village sits on the coast (the ocean is at x 6–18, west of town). A mine sits near rock. A ruin has a believable origin (see `WORLD_HISTORY.md`). A shop sits on a road, in a settlement — not alone in the wild.
3. **Connected to a system.** A creature has a habitat and a behavior (see `POPULATION_DIRECTOR.md`). An NPC has a home, a schedule, and a job (see `NPC_PERSONALITY_MEMORY.md`). A quest has a giver, an objective, and a reward (see `QUEST_ENGINE.md`). A building has a door the player can enter (the standing door rule: painted door, door trigger, interior entrance, exterior exit, and path endpoint must all agree).
4. **Persistent.** Generated content that the player interacts with survives save/load. (The 3D world save is `iso-world-v2` with removed-sets for huts/paths/trees/crates/rocks/water/walls; generated content must ride the same persistence, not live in session-only state.)
5. **Not a duplicate.** It does not recreate a system that already exists. (The registry records 12 duplicate systems already — three renderers, two stamina models, two save systems. The factory must not become the thirteenth.)

## What it needs (the worldgen systems, honestly)

| Dependency | Registry status | What it means for the factory |
|---|---|---|
| Procedural world gen (deterministic, seeded) | PARTIALLY IMPLEMENTED (§48.7: deterministic seeded gen exists and is exercised daily; "features influence each other" only partly evidenced) | The factory can rely on the seed and the terrain. It cannot yet rely on features influencing each other (a river does not yet force a bridge; a settlement does not yet shape the roads around it). |
| Terrain (Stage 2) | NOT IMPLEMENTED (Stages 2–6 queued after 1032) | The ground is FLAT (Stage 1: max ground y 0.038), 91.6% uniform grass, stone terrain dead (0 tiles), no rivers/beaches. The factory must generate for flat ground until Stage 2 lands. It must not assume hills, valleys, or shores exist. |
| Vegetation (Stage 3) | NOT IMPLEMENTED | ONE tree design for everything; 118 crates in town render as pine trees. The factory cannot yet place distinct tree species, bushes, or non-tree props that render correctly. |
| Architecture (Stage 4) | NOT IMPLEMENTED | One box language; all 26 town huts roofAxis='x' (zero roofline variation). The factory cannot yet place varied roofs, gardens, or fences. |
| Settlements (Stage 5) | NOT IMPLEMENTED | Town is a 61×125 ribbon, not a compact cluster; 0 generated stalls (no market). The factory cannot yet place a market or a readable district. |
| Dungeons (Ember Vault, Stone Soup) | NOT IMPLEMENTED in 3D (G13) | `dungeonVaults.ts`, `dungeonLayouts.ts` (31×19 Ember Vault grid), `stoneSoupEngine.ts` (1,206 lines) exist in 2D only. Zero dungeon hits in `engine3d/`. The factory cannot place a dungeon entrance until the 3D dungeon path exists. |
| Points of interest / landmarks | NOT IMPLEMENTED (Stage 5 includes 2–3 fixed wild landmarks) | The wilderness is empty by design (Stage 1). The factory's first landmark work is Stage 5's, not a separate system. |

## What it produces (when the dependencies exist)

- **World features:** landmarks, ruins, caves, clearings, ponds, groves — each with a location that makes sense, a name, and a reason to visit.
- **Architecture:** houses, shops, inns, smithies, stalls, fences, gardens — using the house-variant system (1012: Cottage 4×3, Tall 3×3, Shopfront 6×4, Grand 6×5) and the Build palette. Everything the factory places must be placeable by the player through the same Build menu (standing rule: everything added to the game goes in the Build menus).
- **Creatures:** animals and monsters with habitats, caps, and keep-out rules (see `POPULATION_DIRECTOR.md`).
- **NPCs:** villagers, merchants, guards, travelers — with homes, schedules, and roles (see `NPC_PERSONALITY_MEMORY.md`).
- **Quests:** generated from the world's state (see `QUEST_ENGINE.md`) — never a quest whose target does not exist.

## How generated content is validated

Every generated piece passes three checks before it is accepted (see `CONTENT_QC.md` for the full system):

1. **Coherence check.** Does it fit its surroundings? (Terrain, distance from settlements, road access, habitat rules.) A generated piece that fails coherence is rejected, not placed anyway.
2. **Playability check.** Can the player reach it, interact with it, and complete anything it offers? A quest whose target is unreachable is rejected (see `QUEST_ENGINE.md` — a quest must never be impossible to finish). A building whose door does not open is rejected.
3. **Persistence check.** Does it survive save/load? Generated content is written through the same save path as placed content (`iso-world-v2` + removed-sets), and reloaded exactly. If it does not survive a reload, it is not shipped.

Validation is done by the Verification Engine (sim + asserts + phone probe), not by the factory asserting its own output is good. A generated piece that fails any check is logged with the reason and discarded — never silently placed.

## What the factory does NOT do

- It does not generate content for systems that do not exist yet (no dungeon entrances before the 3D dungeon path; no fishing spots — there is no fishing anywhere in `engine3d/`).
- It does not place content on paths (standing rule: houses must not be placed on top of pathways).
- It does not override the user's placements. The user places houses themselves (BUILD 240 house-mover); the factory fills the world around the user's town, it does not rearrange it.
- It does not generate XP, levels, or rewards for clicks or menu opens (honesty rule: XP only from real successful actions).
