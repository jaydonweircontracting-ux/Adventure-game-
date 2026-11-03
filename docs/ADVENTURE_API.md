# Adventure API

The Adventure API is the engine-independent integration boundary for the
Adventure game. It is being built inside the existing React/TypeScript game;
it is not Unity's C# API and does not require converting the project to Unity.

## Design goals

- Keep the established 2D and 2.5D game intact.
- Keep the experimental 3D renderer isolated while allowing it to consume
  shared world snapshots and submit approved world actions.
- Let domain systems register adapters behind stable IDs.
- Use typed events for cross-system communication instead of hidden imports.
- Make each runtime and test simulation independently constructible.
- Add external services only behind adapters, so the core game works offline.

## Current foundation

`src/game/api/AdventureAPI.ts` provides:
- Versioned API instance (`ADVENTURE_API_VERSION`).
- System registration, lookup, manifest listing, and safe unregister.
- An instance-scoped typed event bus using the existing bounded
  `WorldEventBus` and `CoreWorldEvents` vocabulary.
- `createAdventureRuntime()` adapters for the existing deterministic world
  clock, terrain/landscape queries, persistent civilization simulation,
  graphics-mode contract, NPC psychology engine and combat geometry.
- Automatic civilization catch-up on in-game day changes, published as a
  typed `economy.civilization-advanced` event.
- `npc.psychology` exposes the existing ten archetypes, bounded mood state,
  deduplicated emotional events and game-hour recovery.
- `combat.geometry` exposes the existing facing, adjacency, melee-arc,
  hitbox and line-of-sight rules.

This is the foundation, not a claim that all domains below are already wired.
Existing game modules remain authoritative until an adapter is implemented
and tested for that domain.

## Planned domain adapters

| Domain | Intended responsibility |
| --- | --- |
| World | Chunks, terrain, geology, water, biomes, weather, day/night |
| Graphics | 2D, 2.5D and experimental 3D renderer contracts |
| Physics | Collision, movement, interaction volumes |
| NPC | Needs, schedules, navigation, dialogue, autonomous behaviour |
| Combat | Targeting, damage, abilities, status effects, loot |
| Economy | Inventory transfer, shops, production, caravans, prices |
| Player | Character state, stats, equipment, progression |
| Quests | Objectives, stages, factions, bounties |
| Assets | Sprite/model manifests, animation and asset loading |
| Persistence | Versioned player/world saves and migrations |
| Audio | Music, ambience, positional sound and audio settings |
| Platform | Input, accessibility, achievements and optional integrations |
| Analytics | Opt-in diagnostics, performance and simulation metrics |
| Tools | Debug console, editor, inspection and safe development commands |

## Runtime usage

```ts
import { createAdventureRuntime } from '@/game/api';

const runtime = createAdventureRuntime({ worldSeed: 847291583 });
runtime.world.advance(1);
const localTerrain = runtime.terrain.sample(120, 90);
const worrierMood = runtime.npc.applyEvent(
  runtime.npc.createMood(),
  { id: 'saw-danger-01', category: 'credible_danger', severity: 0.8, witnessed: true },
  'worrier',
);
const canHit = runtime.combat.isInMeleeArc(
  { x: 10, y: 10 },
  { x: 10.5, y: 10 },
  'right',
);
const settlements = runtime.civilization.settlementsInChunk(
  runtime.civilization.state,
  { x: 8, y: 7 },
);

// The existing civilization simulation advances automatically as world days roll over.
// Dispose when this runtime is torn down (tests, editor preview, isolated sim).
runtime.dispose();
```

## API usage

```ts
import { createAdventureAPI } from '@/game/api';

const api = createAdventureAPI();

const unregister = api.registerSystem({
  id: 'world.core',
  domain: 'world',
  version: '1.0.0',
  description: 'Adapter for the active world simulation',
}, worldAdapter);

const world = api.requireSystem<typeof worldAdapter>('world.core');

// Release an adapter when its runtime is disposed or a test finishes.
unregister();
```

Cross-system notifications use the typed event bus:

```ts
api.events.publish('npc.injured', {
  npcId: 'townsfolk-01',
  amount: 3,
  sourceId: 'wolf-02',
});

const unsubscribe = api.events.subscribe('npc.injured', (event) => {
  // React to the injury without importing the combat implementation.
});
```

## External technologies: adapter strategy

The following are optional integrations, not dependencies to blindly add:

- Rendering: WebGL/WebGPU and the current browser renderer. Vulkan, DirectX
  and OpenGL are native graphics APIs and are not direct drop-ins for this
  browser-based build.
- AI: existing deterministic NPC simulation first; optional model services
  must never be required for core gameplay.
- Navigation/physics: retain and adapt current pathfinding/collision before
  replacing proven game rules with third-party libraries.
- Persistence: retain current save format and migrations; add remote/cloud
  storage behind a persistence adapter.
- Platform: add Steamworks or console SDK adapters only for a corresponding
  packaged platform build.
- Catalogs: IGDB/RAWG and similar services belong in optional developer tools,
  not the runtime simulation loop.

## Integration order

1. Keep expanding tested adapters around existing world, NPC and combat systems.
2. Connect adapters to authoritative live application state without creating
   duplicate clocks, NPC populations or save files.
3. Route 3D renderer actions through validated shared commands.
4. Add inventory/economy, player, quest and navigation adapters one at a time.
5. Add persistence and asset adapters without breaking old saves or assets.
6. Add optional AI/backend/platform integrations after offline behaviour and
   regression tests are stable.

No external API keys or network services are required by this foundation.
