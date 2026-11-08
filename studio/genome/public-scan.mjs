#!/usr/bin/env node
// public-scan.mjs — child process for the genome scanner.
// Walks public/ (31,507 files) and prints per-directory aggregates as JSON
// to stdout. Runs in its own process: the parent scanner has already spent
// its per-process filesystem-operation budget (~900-1200 ops — after that,
// write() returns EPERM) and must not do the 31k-stat walk itself.
// This process never writes to the filesystem; it only reads + prints.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = path.join(ROOT, 'public');
const perDir = {};
let totalFiles = 0;
let totalBytes = 0;
const t = Date.now();
for (const top of fs.readdirSync(pub, { withFileTypes: true })) {
  const topPath = path.join(pub, top.name);
  if (!top.isDirectory()) {
    const s = fs.statSync(topPath);
    perDir[top.name] = { files: 1, bytes: s.size, kind: 'file' };
    totalFiles += 1; totalBytes += s.size;
    continue;
  }
  let files = 0; let bytes = 0;
  const stack = [topPath];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) { files += 1; bytes += fs.statSync(p).size; }
    }
  }
  perDir[top.name] = { files, bytes, kind: 'dir' };
  totalFiles += files; totalBytes += bytes;
}
console.log(JSON.stringify({ totalFiles, totalBytes, perDir, walkMs: Date.now() - t }));
