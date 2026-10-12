/**
 * Source Reuse Engine — Internal Code Index
 * BUILD 564: Search our own code before writing new systems.
 *
 * Usage:
 *   node scripts/reuse-index.mjs search "pathfinding"
 *   node scripts/reuse-index.mjs list
 *   node scripts/reuse-index.mjs rebuild
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const INDEX_PATH = 'docs/REUSE_INDEX.md';

// Architectural domains and their key files
const DOMAINS = {
  'movement-collision': {
    files: ['src/game/fieldCollision.ts', 'src/game/fieldCamera.ts'],
    description: 'Player movement, collision detection, camera',
  },
  'grid-chunks': {
    files: ['src/game/iso/isoChunks.ts', 'src/App.tsx'],
    description: 'Chunk system, grid coordinates, world streaming',
  },
  'isometric': {
    files: ['src/game/iso/projection.ts', 'src/game/iso/IsoFieldView.tsx', 'src/game/iso/IsoInteriorView.tsx'],
    description: 'Iso projection, screen/world conversion, rendering',
  },
  'buildings-doorways': {
    files: ['src/App.tsx'],
    description: 'buildingDoorwaysFor, doorway triggers, interior transitions',
    search: 'buildingDoorwaysFor|canEnterDoorway|doorwayTriggerDims',
  },
  'npcs-schedules': {
    files: ['src/game/townsfolk.ts', 'src/game/villageLife.ts', 'src/game/npcNavigation.ts'],
    description: 'NPC identities, schedules, A* navigation, needs',
  },
  'quests-dialogue': {
    files: ['src/game/quests.ts', 'src/game/dialogue.ts'],
    description: 'Quest definitions, state machines, dialogue trees',
  },
  'combat': {
    files: ['src/game/combat.ts', 'src/game/cellarRats.ts'],
    description: 'Combat mechanics, damage, enemy AI',
  },
  'procedural': {
    files: ['src/game/wfc.ts', 'src/game/wfcWorld.ts', 'src/game/wfcDungeon.ts', 'src/game/mapBuilder.ts'],
    description: 'Wave Function Collapse, world generation, dungeons',
  },
  'persistence': {
    files: ['src/game/persistence.ts'],
    description: 'Save/load, serialization, migration',
  },
  'pathfinding': {
    files: ['src/game/npcNavigation.ts', 'src/game/flowField.ts'],
    description: 'A* pathfinding, flow fields for navigation',
  },
  'testing': {
    files: ['tests/real-game/agent.mjs', 'tests/real-game/helpers.mjs', 'scripts/consistency-audit.mjs'],
    description: 'Gameplay agent, test harness, consistency checks',
  },
};

function search(query) {
  const q = query.toLowerCase();
  const results = [];
  for (const [domain, info] of Object.entries(DOMAINS)) {
    const haystack = (domain + ' ' + info.description + ' ' + info.files.join(' ')).toLowerCase();
    if (haystack.includes(q) || q.split(/\s+/).some(w => haystack.includes(w))) {
      results.push({ domain, ...info });
    }
  }
  return results;
}

function list() {
  console.log('=== INTERNAL CODE INDEX ===\n');
  for (const [domain, info] of Object.entries(DOMAINS)) {
    console.log(`${domain}`);
    console.log(`  ${info.description}`);
    info.files.forEach(f => console.log(`  - ${f}`));
    console.log();
  }
}

const cmd = process.argv[2];
if (cmd === 'search' && process.argv[3]) {
  const results = search(process.argv[3]);
  if (results.length === 0) {
    console.log(`No domains match "${process.argv[3]}"`);
  } else {
    results.forEach(r => {
      console.log(`\n${r.domain}: ${r.description}`);
      r.files.forEach(f => console.log(`  - ${f}`));
    });
  }
} else if (cmd === 'list') {
  list();
} else {
  console.log('Usage: node scripts/reuse-index.mjs <search|list> [query]');
}
