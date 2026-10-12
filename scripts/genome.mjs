#!/usr/bin/env node
// Game Genome — Persistent Creative Memory & Project Intelligence
// BUILD 571: Foundation implementation

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENOME_DIR = join(__dirname, '..', 'docs', 'genome');
const GENOME_FILE = join(GENOME_DIR, 'genome.json');

// === Memory Types ===
const MEMORY_TYPES = [
  'EXPLICIT_REQUIREMENT',
  'HARD_CONSTRAINT',
  'DESIGN_INSPIRATION',
  'PROPOSED_IDEA',
  'IMPLEMENTATION_FACT',
  'TEST_EVIDENCE',
  'RESEARCH_FINDING',
  'DECISION',
  'OPEN_QUESTION',
  'HISTORICAL_RECORD',
];

// === Schema ===
function createGenome() {
  return {
    version: '1.0.0',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    sections: {
      creativeConstitution: [],
      inspirations: [],
      requirements: [],
      constraints: [],
      architecture: [],
      systems: [],
      features: [],
      implementation: [],
      worldSimulation: [],
      artContent: [],
      qualityCriteria: [],
      testCoverage: [],
      research: [],
      decisions: [],
      knownBugs: [],
      milestones: [],
      saveCompatibility: [],
      performance: [],
      changeHistory: [],
    },
  };
}

function loadGenome() {
  if (!existsSync(GENOME_FILE)) {
    mkdirSync(GENOME_DIR, { recursive: true });
    const genome = createGenome();
    saveGenome(genome);
    return genome;
  }
  return JSON.parse(readFileSync(GENOME_FILE, 'utf8'));
}

function saveGenome(genome) {
  genome.updated = new Date().toISOString();
  mkdirSync(GENOME_DIR, { recursive: true });
  writeFileSync(GENOME_FILE, JSON.stringify(genome, null, 2));
}

// === Add Entry ===
function addEntry(section, entry) {
  const genome = loadGenome();
  if (!genome.sections[section]) {
    console.error(`Unknown section: ${section}`);
    console.error(`Valid: ${Object.keys(genome.sections).join(', ')}`);
    return false;
  }
  if (!MEMORY_TYPES.includes(entry.type)) {
    console.error(`Invalid type: ${entry.type}`);
    console.error(`Valid: ${MEMORY_TYPES.join(', ')}`);
    return false;
  }
  entry.id = entry.id || `${section}-${Date.now()}`;
  entry.created = entry.created || new Date().toISOString();
  genome.sections[section].push(entry);
  saveGenome(genome);
  console.log(`Added ${entry.id} to ${section}`);
  return true;
}

// === Search ===
function search(query) {
  const genome = loadGenome();
  const q = query.toLowerCase();
  const results = [];
  for (const [section, entries] of Object.entries(genome.sections)) {
    for (const entry of entries) {
      const text = JSON.stringify(entry).toLowerCase();
      if (text.includes(q)) {
        results.push({ section, ...entry });
      }
    }
  }
  return results;
}

// === CLI ===
const cmd = process.argv[2];
if (cmd === 'init') {
  const genome = createGenome();
  saveGenome(genome);
  console.log(`Genome initialized at ${GENOME_FILE}`);
}
else if (cmd === 'add' && process.argv[3] && process.argv[4]) {
  const section = process.argv[3];
  try {
    const entry = JSON.parse(process.argv[4]);
    addEntry(section, entry);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
  }
}
else if (cmd === 'search' && process.argv[3]) {
  const results = search(process.argv[3]);
  console.log(`Found ${results.length} results:\n`);
  results.forEach(r => {
    console.log(`[${r.type}] ${r.id} (${r.section})`);
    console.log(`  ${r.summary || r.title || ''}\n`);
  });
}
else if (cmd === 'stats') {
  const genome = loadGenome();
  console.log('=== GENOME STATS ===\n');
  for (const [section, entries] of Object.entries(genome.sections)) {
    console.log(`${section}: ${entries.length} entries`);
  }
}
else if (cmd === 'validate') {
  const genome = loadGenome();
  let errors = 0;
  // Check 1: Every hard constraint has stable ID
  genome.sections.constraints.forEach(c => {
    if (!c.id) { console.error('Constraint missing ID'); errors++; }
  });
  // Check 2: No PROPOSED_IDEA masquerading as requirement
  genome.sections.requirements.forEach(r => {
    if (r.type === 'PROPOSED_IDEA') {
      console.error(`Requirement ${r.id} is actually a proposal!`);
      errors++;
    }
  });
  console.log(errors === 0 ? '✓ All checks passed' : `✗ ${errors} errors`);
}
else {
  console.log('Usage:');
  console.log('  node scripts/genome.mjs init');
  console.log('  node scripts/genome.mjs add <section> \'<json>\'');
  console.log('  node scripts/genome.mjs search <query>');
  console.log('  node scripts/genome.mjs stats');
  console.log('  node scripts/genome.mjs validate');
}
