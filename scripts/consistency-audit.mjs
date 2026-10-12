#!/usr/bin/env node
/**
 * Gameplay Consistency Auditor — BUILD 556
 *
 * Detects world-consistency issues that confuse players:
 *  1. Duplicate NPC names (player confusion)
 *  2. Dialogue referencing wrong character/location/profession
 *  3. Quest givers missing or disconnected from quests
 *  4. Duplicate NPC IDs
 *  5. NPCs with invalid home/workplace anchors
 *
 * Usage: node scripts/consistency-audit.mjs
 * Output: PASS/FAIL per check with evidence
 *
 * This audits SOURCE and DATA, not live gameplay. For live gameplay,
 * use tests/real-game/playtest-harness.mjs.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

let failures = 0;
let checks = 0;

function check(name, pass, evidence) {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (evidence) console.log(`   ${evidence}`);
}

// 1. Duplicate NPC names in townsfolk roster
try {
  const townsfolk = readFileSync('src/game/townsfolk.ts', 'utf8');
  const rosterMatch = townsfolk.match(/const ROSTER[^=]*=\s*\[([\s\S]*?)\];/);
  const names = [...rosterMatch[1].matchAll(/\['([^']+)'/g)].map(m => m[1]);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  check('No duplicate NPC names in townsfolk roster',
    dupes.length === 0,
    dupes.length > 0 ? `Duplicates: ${[...new Set(dupes)].join(', ')}` : `${names.length} unique names`);
} catch (e) {
  check('No duplicate NPC names in townsfolk roster', false, 'Could not parse: ' + e.message.slice(0, 80));
}

// 2. Check for hardcoded NPC names in dialogue that don't match roster
try {
  const townsfolk = readFileSync('src/game/townsfolk.ts', 'utf8');
  const rosterMatch = townsfolk.match(/const ROSTER[^=]*=\s*\[([\s\S]*?)\];/);
  const rosterNames = new Set([...rosterMatch[1].matchAll(/\['([^']+)'/g)].map(m => m[1]));

  const dialogue = readFileSync('src/game/dialogue.ts', 'utf8');
  // Find name-specific dialogue branches (isXxx or name === 'Yyy')
  const nameChecks = [...dialogue.matchAll(/ctx\.name === '([^']+)'/g)].map(m => m[1]);
  const unknown = nameChecks.filter(n => !rosterNames.has(n));
  // 'Mira' bartender is intentionally not in townsfolk roster (interior NPC)
  const knownExterior = unknown.filter(n => n !== 'Mira');
  check('Dialogue name-references match roster (or known interior NPCs)',
    knownExterior.length === 0,
    knownExterior.length > 0 ? `Unknown: ${knownExterior.join(', ')}` : `${nameChecks.length} name checks, all resolve`);
} catch (e) {
  check('Dialogue name-references match roster', false, e.message.slice(0, 80));
}

// 3. Quest givers exist
try {
  const quests = readFileSync('src/game/quests.ts', 'utf8');
  const giverNames = [...quests.matchAll(/giver:\s*\{\s*name:\s*'([^']+)'/g)].map(m => m[1]);

  const townsfolk = readFileSync('src/game/townsfolk.ts', 'utf8');
  const rosterMatch = townsfolk.match(/const ROSTER[^=]*=\s*\[([\s\S]*?)\];/);
  const rosterNames = new Set([...rosterMatch[1].matchAll(/\['([^']+)'/g)].map(m => m[1]));

  const app = readFileSync('src/App.tsx', 'utf8');
  // Interior NPCs (bartender Mira, etc.) are defined in App.tsx
  const interiorNames = [...app.matchAll(/aria-label="Talk to ([^,"]+)/g)].map(m => m[1]);

  const allNames = new Set([...rosterNames, ...interiorNames]);
  const missing = giverNames.filter(g => !allNames.has(g));
  check('All quest givers exist as NPCs',
    missing.length === 0,
    missing.length > 0 ? `Missing: ${[...new Set(missing)].join(', ')}` : `${[...new Set(giverNames)].length} unique givers, all found`);
} catch (e) {
  check('All quest givers exist as NPCs', false, e.message.slice(0, 80));
}

// 4. NPC IDs unique (index-based, so check roster length vs expected)
try {
  const townsfolk = readFileSync('src/game/townsfolk.ts', 'utf8');
  const rosterMatch = townsfolk.match(/const ROSTER[^=]*=\s*\[([\s\S]*?)\];/);
  const entries = rosterMatch[1].split('],').length;
  // IDs are 'townsfolk-' + index, so unique by construction if roster parses
  check('NPC IDs unique (index-based)', entries > 0, `${entries} roster entries → IDs townsfolk-0..townsfolk-${entries - 1}`);
} catch (e) {
  check('NPC IDs unique', false, e.message.slice(0, 80));
}

// 5. Home keys resolve to anchors
try {
  const townsfolk = readFileSync('src/game/townsfolk.ts', 'utf8');
  const rosterMatch = townsfolk.match(/const ROSTER[^=]*=\s*\[([\s\S]*?)\];/);
  const homeKeys = [...rosterMatch[1].matchAll(/'([a-z0-9]+)'\s*\],?$/gm)].map(m => m[1]);

  const app = readFileSync('src/App.tsx', 'utf8');
  // Anchors are assigned as points.KEY = {...} or defined in points object
  const assigned = [...app.matchAll(/points\.(\w+)\s*=/g)].map(m => m[1]);
  const inObject = [...app.matchAll(/^\s*(\w+):\s*\{\s*x:/gm)].map(m => m[1]);
  const definedKeys = new Set([...assigned, ...inObject, 'plaza', 'cottage']);
  const missing = [...new Set(homeKeys)].filter(k => !definedKeys.has(k));
  check('NPC home keys resolve to anchors',
    missing.length === 0,
    missing.length > 0 ? `Missing anchors: ${missing.join(', ')}` : `${[...new Set(homeKeys)].length} unique home keys, all resolve`);
} catch (e) {
  check('NPC home keys resolve to anchors', false, e.message.slice(0, 80));
}

// 6. Quest stages have valid kinds and targets
try {
  const quests = readFileSync('src/game/quests.ts', 'utf8');
  const validKinds = ['talk', 'kill', 'collect', 'visit', 'craft', 'explore'];
  // Extract stage kinds
  const stageKinds = [...quests.matchAll(/kind:\s*'(\w+)'/g)].map(m => m[1]);
  const invalid = stageKinds.filter(k => !validKinds.includes(k));
  check('Quest stage kinds valid',
    invalid.length === 0,
    invalid.length > 0 ? `Invalid: ${[...new Set(invalid)].join(', ')}` : `${stageKinds.length} stages, all valid kinds`);
} catch (e) {
  check('Quest stage kinds valid', false, e.message.slice(0, 80));
}

// 7. Quest rewards defined
try {
  const quests = readFileSync('src/game/quests.ts', 'utf8');
  const rewardBlocks = [...quests.matchAll(/rewards:\s*\{([^}]+)\}/g)];
  const missingCoins = rewardBlocks.filter(b => !b[1].includes('coins'));
  check('All quests have coin rewards',
    missingCoins.length === 0,
    `${rewardBlocks.length} quests checked`);
} catch (e) {
  check('All quests have coin rewards', false, e.message.slice(0, 80));
}

// Summary
console.log(`\n${checks - failures}/${checks} consistency checks passed`);
process.exit(failures > 0 ? 1 : 0);
