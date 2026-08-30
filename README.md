# Adventure Tile Game

A first-pass, DCSS-inspired browser roguelike shell set on **The Far Meadow**, a deterministic hand-drawn continent. The current playtest focuses on exploring a zoomable world map with mountains, forests, autumn groves, lakes, rivers, shore, ocean, and village landmarks.

## Current scope

- Move with Arrow keys or WASD
- Touch-friendly player direction controls on narrow screens
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
