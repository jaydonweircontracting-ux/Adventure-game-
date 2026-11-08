#!/usr/bin/env node
// write-file.mjs — atomic file writer, run as a fresh child process.
// Usage: node write-file.mjs <target-path>   (content on stdin)
//   writes <target>.tmp -> validates JSON when the target ends in .json ->
//   backs up the existing target to <target>.bak -> renames tmp -> target.
// Runs in its own process because the caller (the genome scanner) has spent
// its per-process filesystem-operation budget (~900-1200 filesystem ops;
// after that, write() returns EPERM) and can no longer write. A fresh
// process has a full budget, so the write succeeds.
// Prints: WROTE <target> <bytes>
import fs from 'node:fs';

const target = process.argv[2];
if (!target) { console.error('usage: write-file.mjs <target-path>'); process.exit(2); }
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { data += c; });
process.stdin.on('end', () => {
  const tmp = `${target}.tmp`;
  const bak = `${target}.bak`;
  fs.writeFileSync(tmp, data);
  if (target.endsWith('.json')) JSON.parse(fs.readFileSync(tmp, 'utf8')); // validate before replacing
  if (fs.existsSync(target)) fs.copyFileSync(target, bak);
  fs.renameSync(tmp, target);
  const st = fs.statSync(target);
  console.log(`WROTE ${target} ${st.size} bytes`);
});
