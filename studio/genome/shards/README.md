# Genome shards

The Development Genome is sharded so each piece fits through the harness file
API when the exec fs-op budget is spent. `genome.json` (in `studio/genome/`)
is the small meta index; the file nodes live here, one JSON array per shard,
and the import edges in `edges.json`.

- `files-app.json` — `src/App.tsx`, `src/main.tsx`, `src/index.css`,
  `src/vite-env.d.ts`, `src/components/**`
- `files-game.json` — `src/game/*.ts` / `*.tsx` (top level only)
- `files-game-sub.json` — `src/game/*/**` (engine, engine3d, iso, rendering,
  shared, dev, worldgen, monsterSprites, …)
- `files-scripts.json` — `scripts/**`
- `files-studio.json` — `studio/**`
- `files-tests.json` — `tests/**`
- `files-root.json` — root files (`package.json`, `tsconfig.json`,
  `vite.config.ts`, `index.html`, `server.js`, `world_generator.js`,
  `persistence.js`)
- `edges.json` — import edges: internal `[from, to, kind]`,
  external `[from, null, kind, spec]`

`query.mjs` and `run-cycle.mjs` load `genome.json` + these shards and assemble
the full genome in memory. The scanner (`scanner.mjs`) is the only writer;
use `--shard <name>` to emit one shard, and `extract-shard.mjs` to land a
saved tool-output file's shard JSON onto disk.
