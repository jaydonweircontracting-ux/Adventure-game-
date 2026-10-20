#!/usr/bin/env node
/**
 * Safely installs the real modular RPG equipment PNGs into public/rpg.
 *
 * The repository intentionally keeps only base bodies in public/rpg by
 * default. The full user asset pack must be extracted locally first. This
 * script imports only equipment folders actually referenced by the creator
 * or NPC loadouts, not the whole 48k-image archive.
 *
 * Audit:   node scripts/install-rpg-equipment.mjs --check
 * Preview: node scripts/install-rpg-equipment.mjs --install /path/to/extracted-pack
 * Install: node scripts/install-rpg-equipment.mjs --install /path/to/extracted-pack --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_RPG = path.join(ROOT, 'public', 'rpg');
const MANIFEST_PATH = path.join(ROOT, 'src', 'game', 'iso', 'rpgManifest.json');
const LOOK_SOURCES = [
  path.join(ROOT, 'src', 'game', 'iso', 'characterSystem.ts'),
  path.join(ROOT, 'src', 'components', 'RpgCharacterCreator.tsx'),
  // BUILD 911: item->art mapping + folder/slot classification (equipmentArt)
  // references the folders worn for generated gear and paperdoll toggles.
  path.join(ROOT, 'src', 'game', 'iso', 'equipmentArt.ts'),
];
const ANIMATIONS = {
  Idle: { seq: 1, frames: [20, 25, 35, 40] },
  Attack: { seq: 2, frames: [60, 62, 63, 65, 67, 70, 72, 74, 76, 78] },
  Bow: { seq: 3, frames: [100, 104, 106, 108, 110, 112, 114, 116, 118] },
  Cast: { seq: 4, frames: [140, 143, 146, 148, 151, 153, 155, 157, 158] },
  Walk: { seq: 5, frames: [180, 182, 184, 186, 188, 190, 192, 194, 196, 198, 200] },
  Run: { seq: 6, frames: [220, 222, 224, 226, 228, 230, 232, 234, 236, 238] },
  Death: { seq: 7, frames: [261, 262, 264, 265, 270, 273, 276, 280] },
};
const DIRECTIONS = [0, 1, 2, 3, 4, 5, 6, 7];
const EXPECTED_PNGS = Object.entries(ANIMATIONS).flatMap(([anim, meta]) =>
  meta.frames.flatMap((frame) =>
    DIRECTIONS.map((cam) => `${meta.seq}_${anim}_CAM${cam}_${frame}.png`),
  ),
);

function fail(message) {
  console.error(`[rpg-assets] ERROR: ${message}`);
  process.exitCode = 1;
}

function equipmentFolders() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const folders = manifest.folders ?? {};
  const referencedText = LOOK_SOURCES
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  const names = Object.keys(folders).filter((name) => {
    const entry = folders[name];
    return entry?.type === 'equipment'
      && new RegExp(`(?:['"\x60])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:['"\x60])`).test(referencedText);
  });
  return [...new Set(names)].sort();
}

function validateFolder(folderPath) {
  for (const name of EXPECTED_PNGS) {
    const file = path.join(folderPath, name);
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size < 8) return `missing or empty frame ${name}`;
    } catch {
      return `missing frame ${name}`;
    }
  }
  return null;
}

function findFolders(sourceRoot, wanted) {
  const found = new Map();
  const wantedSet = new Set(wanted);
  const skipped = new Set(['.git', 'node_modules', '.cache', 'dist', 'build']);
  const visit = (dir, depth = 0) => {
    if (depth > 7 || found.size === wantedSet.size) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || skipped.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (wantedSet.has(entry.name)) {
        if (!found.has(entry.name) || !validateFolder(found.get(entry.name))) {
          if (!validateFolder(full)) found.set(entry.name, full);
        }
        continue;
      }
      visit(full, depth + 1);
    }
  };
  visit(sourceRoot);
  return found;
}

function installFolder(source, destination) {
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const staging = path.join(parent, `.${path.basename(destination)}.staging-${process.pid}`);
  const backup = path.join(parent, `.${path.basename(destination)}.backup-${process.pid}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  try {
    for (const filename of EXPECTED_PNGS) {
      fs.copyFileSync(path.join(source, filename), path.join(staging, filename));
    }
    const oldExists = fs.existsSync(destination);
    if (oldExists) fs.renameSync(destination, backup);
    try {
      fs.renameSync(staging, destination);
      fs.rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      if (oldExists && fs.existsSync(backup) && !fs.existsSync(destination)) fs.renameSync(backup, destination);
      throw error;
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const apply = args.includes('--apply');
const installIndex = args.indexOf('--install');
const sourceRootArg = installIndex >= 0 ? args[installIndex + 1] : null;
const wanted = equipmentFolders();

if (!fs.existsSync(PUBLIC_RPG)) {
  fail('public/rpg does not exist; refusing to create a partial asset tree.');
  process.exit();
}

if (checkOnly) {
  const missing = [];
  for (const name of wanted) {
    const error = validateFolder(path.join(PUBLIC_RPG, name));
    if (error) missing.push(`${name}: ${error}`);
  }
  console.log(`[rpg-assets] ${wanted.length} equipment folders referenced by the creator/NPC system.`);
  if (missing.length) {
    console.error(`[rpg-assets] ${missing.length} referenced folders are not complete in public/rpg:`);
    for (const line of missing) console.error(`  - ${line}`);
    console.error('[rpg-assets] Extract the original RPG asset pack and run the installer with --apply.');
    process.exitCode = 1;
  } else {
    console.log('[rpg-assets] All referenced equipment folders have all 488 expected animation frames.');
  }
} else if (installIndex >= 0) {
  if (!sourceRootArg || sourceRootArg.startsWith('--')) {
    fail('provide the extracted asset-pack directory after --install.');
    process.exit();
  }
  const sourceRoot = path.resolve(sourceRootArg);
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    fail(`source directory does not exist: ${sourceRoot}`);
    process.exit();
  }
  const sourceFolders = findFolders(sourceRoot, wanted);
  const missing = wanted.filter((name) => !sourceFolders.has(name));
  console.log(`[rpg-assets] Found ${sourceFolders.size}/${wanted.length} complete referenced equipment folders.`);
  if (missing.length) {
    fail(`source pack is missing complete folders: ${missing.join(', ')}`);
    process.exit();
  }
  if (!apply) {
    console.log('[rpg-assets] Dry run only; no files were changed. Add --apply to install.');
    for (const name of wanted) console.log(`  ready: ${name}`);
  } else {
    let installed = 0;
    for (const name of wanted) {
      const destination = path.join(PUBLIC_RPG, name);
      if (!validateFolder(destination)) {
        console.log(`[rpg-assets] already complete: ${name}`);
        continue;
      }
      installFolder(sourceFolders.get(name), destination);
      installed++;
      console.log(`[rpg-assets] installed: ${name}`);
    }
    console.log(`[rpg-assets] Installed ${installed} equipment folders. Run npm run rpg:assets:check and npm run build next.`);
  }
} else {
  console.log('Usage:');
  console.log('  node scripts/install-rpg-equipment.mjs --check');
  console.log('  node scripts/install-rpg-equipment.mjs --install /path/to/extracted-pack');
  console.log('  node scripts/install-rpg-equipment.mjs --install /path/to/extracted-pack --apply');
}
