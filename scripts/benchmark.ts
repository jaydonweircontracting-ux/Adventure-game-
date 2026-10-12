// Benchmark harness (BUILD 657 — Alien Brain Phase 1).
// Measures actual performance of key game systems. Run with:
//   npx tsx scripts/benchmark.ts
//
// Outputs JSON to work/experiments/benchmark-<timestamp>.json
// Establishes baselines before any optimization work.

import { recognizeIntent } from '../src/game/dialogueIntent';
import { responseFor } from '../src/game/dialogue';
import { recallRelevantMemories, recordTopicDiscussed } from '../src/game/conversationMemory';
import { npcPersonality } from '../src/game/villageLife';
import type { Townsperson } from '../src/game/townsfolk';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

function benchmark(name: string, iterations: number, fn: () => void): BenchmarkResult {
  // Warmup
  for (let i = 0; i < Math.min(100, iterations); i++) fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
  };
}

function makeTestNpc(id: string, name: string): Townsperson {
  return {
    id, name, gender: 'male', archetype: 'farmer',
    role: 'farmer', seed: 12345, homeKey: 'h1',
    home: { x: 0, y: 0 }, position: { x: 0, y: 0 },
    facing: 'south', activity: 'farming', indoors: false, location: 'OUTDOOR',
    memories: [
      { event: 'Discussed the old mine with traveler', day: 5, importance: 1 },
      { event: 'Told traveler: the old mine: a traveler saw lights near its entrance', day: 5, importance: 2 },
      { event: 'Heard from Mira: wolves near the north road', day: 4, importance: 2 },
    ],
  } as Townsperson;
}

function main() {
  const results: BenchmarkResult[] = [];
  const npc = makeTestNpc('test1', 'Bryn');
  const pers = npcPersonality(npc);

  // 1. Intent recognition
  results.push(benchmark('intent-recognize', 1000, () => {
    recognizeIntent('What did you tell me about the old mine?');
  }));

  // 2. Dialogue response generation
  const ctx = {
    name: npc.name, archetype: npc.archetype, activity: npc.activity,
    disposition: 50, townReputation: 0, seed: npc.seed, personality: pers,
  };
  results.push(benchmark('dialogue-response', 1000, () => {
    responseFor(ctx, 'rumors');
  }));

  // 3. Memory recall
  results.push(benchmark('memory-recall', 1000, () => {
    recallRelevantMemories(npc, 'what did you tell me about the mine?', 3);
  }));

  // 4. Personality computation
  results.push(benchmark('personality-compute', 1000, () => {
    npcPersonality(npc);
  }));

  // 5. Memory recording
  results.push(benchmark('memory-record', 1000, () => {
    recordTopicDiscussed(npc, 'test topic', 5);
  }));

  // Output
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = {
    timestamp: new Date().toISOString(),
    build: '657',
    commit: 'HEAD',
    results,
  };

  mkdirSync('work/experiments', { recursive: true });
  const path = join('work/experiments', `benchmark-${timestamp}.json`);
  writeFileSync(path, JSON.stringify(output, null, 2));

  console.log('\n=== BENCHMARK RESULTS (BUILD 657 baseline) ===\n');
  for (const r of results) {
    console.log(`${r.name}:`);
    console.log(`  avg: ${r.avgMs.toFixed(4)}ms | min: ${r.minMs.toFixed(4)}ms | max: ${r.maxMs.toFixed(4)}ms | n=${r.iterations}`);
  }
  console.log(`\nSaved to ${path}`);
}

main();
