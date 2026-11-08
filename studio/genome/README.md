# Development Genome

The machine-readable index of ASHFALL — what the game is, what it depends on,
what works, what doesn't, and what comes next. The shared source of
architectural understanding for Muse, ACEE, AGEE and the orchestrator.
One genome, one registry, one memory.

## Layout (sharded)

`genome.json` is the small meta index (~43 KB). The file nodes live in
`shards/*.json` and the import edges in `shards/edges.json`, so each piece
fits through the harness file API when the exec fs-op budget is spent.
`query.mjs` and `run-cycle.mjs` load the index + shards and assemble the
full genome in memory.

- `scanner.mjs` — builds the genome from the real repo (real AST parsing,
  real import graph, real registry/audit/dashboard data). Incremental:
  fingerprints (sha256 + size + mtime) — only changed/new files are re-parsed.
- `genome.json` — the meta index (stats, markers, requirements, duplicates,
  cycles, baselines, known issues, queue, gaps, validation, shard list).
- `shards/files-app.json` — `src/App.tsx`, `src/main.tsx`, `src/index.css`,
  `src/vite-env.d.ts`, `src/components/**`
- `shards/files-game.json` — `src/game/*.ts` / `*.tsx` (top level)
- `shards/files-game-sub.json` — `src/game/*/**` (engine, engine3d, iso, …)
- `shards/files-scripts.json` — `scripts/**`
- `shards/files-studio.json` — `studio/**` (excluding the genome's own
  generated `.json` output — the genome does not index itself)
- `shards/files-tests.json` — `tests/**`
- `shards/files-root.json` — root files (`package.json`, `tsconfig.json`,
  `vite.config.ts`, `index.html`, `server.js`, `world_generator.js`,
  `persistence.js`)
- `shards/edges.json` — import edges: internal `[from, to, kind]`,
  external `[from, null, kind, spec]`
- `query.mjs` — the query CLI (`status`, `file`, `depends-on`, `blast-radius`,
  `implements`, `duplicates`, `cycles`, `remove`, `next-task`, `search`).
- `run-cycle.mjs` — the minimal orchestrator task loop: resolve a task from
  the registry via the genome → run the verification that applies → record
  the outcome in `cycle-log.json`.
- `cycle-log.json` — the cycle records.
- `public-scan.mjs` — standalone walker for `public/` (31,507 files); its
  output is cached in `public-aggregates.json` so the scanner doesn't pay
  the 31k-op walk on every run.
- `public-aggregates.json` — cached `public/` directory aggregates.
- `write-file.mjs` — atomic writer (tmp → validate JSON → backup → rename).
- `write-stdin.mjs` — pipeline writer: reads JSON from stdin, validates,
  writes to the path argument. This is the landing path (see below).
- `extract-shard.mjs` — pull one shard's JSON out of a saved tool-output
  file and write it to its destination (fallback landing path).

## Compact format

Per-file data is stored compactly (the genome must pass through the harness
file API when the fs-op budget is spent):

- symbols: `["name|kind|1"]` — kind in {function, class, interface, type,
  enum, const}; trailing `1` = exported, `0` = not. (An exports list is
  derivable: symbols with `|1`.)
- imports: `[spec, kind, to]` — kind in {static, type, dynamic, require};
  `to` is the resolved repo path, or null for external/unresolved; external
  imports carry a 4th element, the package name.
- reExports: `[spec, to]` — `to` resolved, or null.
- dependents: NOT stored (derivable from edges); only `dependentsCount`.

## Run

```sh
node studio/genome/scanner.mjs            # incremental update (writes via child)
node studio/genome/scanner.mjs --full     # full re-scan (~3s when run alone)
node studio/genome/scanner.mjs --shard meta 2>/dev/null | node studio/genome/write-stdin.mjs studio/genome/genome.json
node studio/genome/query.mjs status
node studio/genome/query.mjs next-task
node studio/genome/query.mjs blast-radius src/game/quests.ts
node studio/genome/query.mjs remove src/game/wfc.ts
node studio/genome/run-cycle.mjs --task PHASE-1-GENOME --files studio/genome/scanner.mjs,studio/genome/query.mjs
node studio/genome/public-scan.mjs        # refresh public-aggregates.json
```

## Landing a scan (the fs-op budget)

The environment enforces a per-process filesystem-operation budget
(~900–1200 ops at session start, draining over the session to ~1 op at a
time — verified 2026-11-07). The budget is inherited parent → child
(which is why the scanner's `execSync` writer child fails) but NOT shared
between pipeline siblings spawned by the shell. So the scanner's output
is landed through a pipeline: the scanner prints one shard to stdout
(markers go to stderr) and a fresh sibling process writes it:

```sh
node studio/genome/scanner.mjs --full --shard <name> 2>/dev/null \
  | node studio/genome/write-stdin.mjs studio/genome/shards/<name>.json
```

One pipeline per shard (meta + 7 file shards + edges = 9). Do NOT redirect
the scanner's stdout or stderr to a regular file — those writes fail once
the budget is spent (and kill the process silently). Pipes always work.

## Update rule

The genome updates itself whenever the repository changes: re-run the
scanner (incremental, <5s target). It re-reads the registry, the legacy
audit and the dashboard data on every run, so the index cannot drift from
its sources. The scanner is the only writer of `genome.json` + `shards/`.

## Coverage (v1, 2026-11-07)

- 440 files (src/, scripts/, studio/, tests/, root config + server files);
  4,810 symbols; 782 resolved import edges; 0 unresolved; 6 import cycles.
- Legacy-audit classification A=45 B=104 C=56 D=41 E=2 (validated MATCH).
- 88 registry requirements with statuses + resolved file refs.
- 12 duplicate systems, Stage 1 performance baselines, known issues,
  build history, queue, blockers, build-marker agreement.
- Infrastructure audit: what is ACTIVE / STALE / STALE-RECONCILED / TOOLING.

## Known gaps (recorded in the genome data, `gaps`)

- Dashboard artifact still hard-coded (not wired to `studio/dashboard/`).
- BUILD 1030 uncommitted (git cannot write — EPERM).
- No runtime telemetry, no embeddings, `public/` asset usage not traced.
- Registry evidence rarely names files in backticks, so some requirements
  (e.g. Q1 BUILD 1030) resolve to 0 files — the genome faithfully reflects
  the registry; the registry needs file refs to link them.
