#!/usr/bin/env node
/**
 * Smart Build Script (BUILD 544)
 *
 * Skips the full Vite build when only non-production files changed.
 * Saves ~12s per test-only iteration.
 *
 * Logic:
 * - If src/, public/, index.html, or package.json changed → full build
 * - If only tests/, docs/, scripts/ changed → skip build (use existing dist/)
 * - If dist/ doesn't exist → full build
 *
 * Usage: node scripts/smart-build.mjs
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const PROD_PATHS = ['src/', 'public/', 'index.html', 'package.json', 'vite.config'];

function getChangedFiles() {
  try {
    // Compare working tree + staged against HEAD
    const out = execSync('git status --porcelain', { encoding: 'utf8' });
    return out.split('\n').filter(Boolean).map(l => l.slice(3));
  } catch {
    return [];
  }
}

function needsBuild(changedFiles) {
  // No dist? Must build.
  if (!existsSync('dist/public/index.html')) {
    console.log('[smart-build] No dist found — full build required');
    return true;
  }

  // Check if any production paths changed
  for (const file of changedFiles) {
    for (const prod of PROD_PATHS) {
      if (file.startsWith(prod) || file === prod) {
        console.log(`[smart-build] Production file changed: ${file} — full build required`);
        return true;
      }
    }
  }

  console.log('[smart-build] Only non-production files changed — skipping build');
  return false;
}

const changed = getChangedFiles();
if (needsBuild(changed)) {
  console.log('[smart-build] Running: npm run build');
  execSync('npm run build', { stdio: 'inherit' });
} else {
  console.log('[smart-build] Build skipped (dist is current)');
}
