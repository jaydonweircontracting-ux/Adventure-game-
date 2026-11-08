#!/usr/bin/env node
// extract-shard.mjs — pull one shard's JSON out of a saved tool-output file
// and write it to its genome destination. Used because the exec fs-op budget
// (~1 op/call when drained) cannot run the scanner and write in one call,
// and a shard JSON is too large to transcribe by hand.
// Usage: node studio/genome/extract-shard.mjs <saved-tool-output.json> <shard-name>
//   shard-name: meta | files-app | files-game | files-game-sub | files-scripts |
//               files-studio | files-tests | files-root | edges
// Writes: meta -> studio/genome/genome.json; files-* -> studio/genome/shards/<name>.json;
//         edges -> studio/genome/shards/edges.json
// Reads the saved file ONCE and writes ONCE (2 fs ops) — run in a FRESH exec
// call, never in the same call as the scanner (the scanner's ~500 reads drain
// the shared per-tree budget). Validates the JSON before writing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const GENOME_DIR = path.dirname(fileURLToPath(import.meta.url));
const [savedPath, shard] = process.argv.slice(2);
if (!savedPath || !shard) { console.error('Usage: node studio/genome/extract-shard.mjs <saved-tool-output.json> <shard-name>'); process.exit(1); }
const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
const out = saved.stdout || '';
let json = out.trim();
if (!json.startsWith('{') && !json.startsWith('[')) {
  // 2>&1 merged the stderr markers into stdout: strip everything before
  // the JSON and after the PHASE marker.
  const i = json.indexOf('{"version"');
  const j = json.indexOf('PHASE shard');
  if (i < 0) { console.error('No shard JSON found in saved stdout'); process.exit(1); }
  json = json.slice(i, j >= 0 ? j : undefined).trim();
}
JSON.parse(json); // throws if invalid — nothing is written
const dest = shard === 'meta' ? 'genome.json' : path.join('shards', shard + '.json');
fs.writeFileSync(path.join(GENOME_DIR, dest), json);
console.log(`WROTE ${dest} bytes=${json.length} shard=${shard}`);
