#!/usr/bin/env node
/**
 * Safe command runner with retry logic.
 *
 * Usage: node scripts/safe-run.mjs <command> [args...]
 *        node scripts/safe-run.mjs --retries 3 -- npm run build
 *
 * Implements bounded retry with exponential backoff for transient failures.
 * Distinguishes transient (retry) from hard failures (stop).
 *
 * BUILD 538: Initial version.
 */
import { spawn } from 'child_process';

const args = process.argv.slice(2);
let retries = 3;
let cmdArgs = args;

const rIdx = args.indexOf('--retries');
if (rIdx !== -1) {
  retries = parseInt(args[rIdx + 1], 10) || 3;
  cmdArgs = [...args.slice(0, rIdx), ...args.slice(rIdx + 2)];
}

if (cmdArgs.length === 0) {
  console.error('Usage: node scripts/safe-run.mjs [--retries N] <command> [args...]');
  process.exit(2);
}

// Patterns indicating transient failures (worth retrying)
const TRANSIENT = [
  /ETIMEDOUT/i, /ECONNRESET/i, /ENOTFOUND/i, /EAI_AGAIN/i,
  /network/i, /timeout/i, /temporarily unavailable/i, /rate limit/i,
];

// Patterns indicating hard failures (do not retry)
const HARD = [
  /permission denied/i, /authentication failed/i, /EACCES/i,
  /not found$/i, /no such file/i, /cannot access/i,
  /syntax error/i, /TypeError/i, /ReferenceError/i,
];

function classify(output) {
  if (HARD.some(p => p.test(output))) return 'hard';
  if (TRANSIENT.some(p => p.test(output))) return 'transient';
  return 'unknown'; // retry unknown failures (bounded)
}

async function runOnce() {
  return new Promise((resolve) => {
    const proc = spawn(cmdArgs[0], cmdArgs.slice(1), { stdio: 'pipe' });
    let output = '';
    proc.stdout.on('data', d => { output += d; process.stdout.write(d); });
    proc.stderr.on('data', d => { output += d; process.stderr.write(d); });
    proc.on('close', code => resolve({ code, output }));
  });
}

let attempt = 0;
while (attempt <= retries) {
  attempt++;
  console.log(`[safe-run] Attempt ${attempt}/${retries + 1}: ${cmdArgs.join(' ')}`);
  const { code, output } = await runOnce();

  if (code === 0) {
    console.log('[safe-run] SUCCESS');
    process.exit(0);
  }

  const kind = classify(output);
  console.log(`[safe-run] Failed (code ${code}), classified as: ${kind}`);

  if (kind === 'hard' || attempt > retries) {
    console.log(`[safe-run] ${kind === 'hard' ? 'Hard failure — not retrying' : 'Retries exhausted'}`);
    process.exit(code);
  }

  const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
  console.log(`[safe-run] Retrying in ${delay}ms...`);
  await new Promise(r => setTimeout(r, delay));
}
