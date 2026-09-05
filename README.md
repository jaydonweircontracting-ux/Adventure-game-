# Adventure Tile Game

A first-pass, DCSS-inspired browser roguelike shell set on **The Far Meadow**, a deterministic hand-drawn continent. The current playtest focuses on exploring a zoomable world map with mountains, forests, autumn groves, lakes, rivers, shore, ocean, and village landmarks.

## Current scope

- Move with Arrow keys or WASD
- Touch-friendly player direction controls on narrow screens
- Test horse parked near spawn with proximity-based Mount horse / Dismount controls
- Mounted movement runs substantially faster than walking, and the horse persists at its last dismount location
- Four map zoom levels: Close, Region, Survey, and World
- Full 100 × 100 world overview
- Outside map arrows for independent map panning
- Player-following camera that can be released into map pan mode
- Select any visible tile for terrain, landmark, nearest-town, and travel-cost information
- Stamina system with terrain and remote-travel costs
- Rest action through the REST button or the R key
- Deterministic terrain generation for ocean, shore, grass, meadow, woodland, autumn, rock, paths, rivers, and lake water
- Six mapped village and town landmarks with pixel-art sprites
- Live coordinates, facing, step count, stamina, camera window, and message buffer
- Horse-cart fast travel reserved for the future town system and currently inactive
- No dungeons, enemies, items, stairs, combat, quests, or save system yet

## Run locally

```bash
npm install
npm run dev

# production build
npm run build
```

## Optional infinite world server

The browser client remains standalone. The server layer is available when you want a persistent, network-ready world boundary:

```bash
npm install
npm run world-server

# or
npm start
```

### Server contract

- `GET /health` returns a JSON readiness response.
- Send `{ family: 'AUTH', action: 'JOIN', data: { username } }` over WebSocket to receive the player’s generated chunk.
- Send `{ family: 'MOVE', action: 'UPDATE', data: { newGlobalX, newGlobalY } }` to update a bounded global position and receive a refreshed chunk view.
- Chunks are deterministic 16 × 16 grids generated on demand from their integer coordinates.
- `world_state.json` is local runtime state and is ignored by Git; active socket objects are never persisted.

The current browser UI does not open this socket yet. That is intentional: run and test the client locally first, then wire synchronization as a separate bounded slice.

## GitHub Pages deployment

GitHub Pages currently publishes the **`main` branch `/docs` directory** (legacy Pages source). The published site is:

`https://jaydonweircontracting-ux.github.io/Adventure-game-/`

- `src/` is source code only; changing it does **not** update the live site by itself.
- Build with Node 20 using `npm run build` and the repository base path `/Adventure-game-/`.
- Copy the generated `dist/public/` output into `docs/`, including the generated JavaScript, CSS, and asset files.
- Commit the source changes and the refreshed `docs/` bundle together.
- Update the build/cache version in `docs/index.html` when publishing so browsers do not keep the previous bundle.
- Confirm the GitHub Pages deployment reaches **built** and verify the live URL before calling the update live.
- GitHub Pages publishes the browser client only; it does not run `server.js` or the optional WebSocket world server.
