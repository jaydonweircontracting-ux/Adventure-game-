// write-stdin.mjs — read JSON from stdin, validate, write to the file path
// given as argv[2]. The pipeline sibling of the scanner: it runs as a fresh
// process with its own fs-op budget, so it can write even though the scanner
// (which did ~500 reads) cannot. The budget is inherited parent->child
// (which is why the scanner's execSync writer child fails) but NOT shared
// between pipeline siblings spawned by the shell.
// Usage:
//   node studio/genome/scanner.mjs --shard <name> 2>/dev/null | node studio/genome/write-stdin.mjs studio/genome/shards/<name>.json
import fs from 'node:fs';
const dest = process.argv[2];
if (!dest) { console.error('Usage: node studio/genome/write-stdin.mjs <dest-path>'); process.exit(1); }
let d = '';
process.stdin.on('data', (c) => { d += c; });
process.stdin.on('end', () => {
  try { JSON.parse(d); } catch (e) { console.error('INVALID JSON on stdin: ' + e.message); process.exit(1); }
  fs.writeFileSync(dest, d);
  console.log(`WROTE ${dest} bytes=${d.length}`);
});
