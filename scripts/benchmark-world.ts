/**
 * Deterministic CPU performance baseline for the live 3D world systems.
 *
 * Run with: npm run benchmark:world
 *
 * Measures the actual shipped code paths used for world creation, river and
 * landform stamping, NPC A*, voxel terrain mesh generation, and a 24-hour
 * settlement simulation. This is a measurement harness, not a mock renderer:
 * the mesh generator and simulation are the production modules.
 *
 * No pass/fail timing threshold is set yet. First establish repeatable
 * measurements on the same runner; optimization changes can then be compared
 * against this artifact without silently changing gameplay.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { defaultWorld } from '../src/game/iso/isoWorld';
import { stampRivers } from '../src/game/engine3d/rivers';
import { stampLandforms } from '../src/game/engine3d/landforms';
import { buildWorldVerticesGen } from '../src/game/engine3d/worldRender3d';
import { planPathNpc } from '../src/game/engine3d/townsfolk3d';
import { advanceSettlement, createSettlementSim } from '../src/game/engine3d/settlementSim';

type Metadata = Record<string, string | number | boolean | null>;
type BenchmarkResult = {
  name: string;
  iterations: number;
  warmups: number;
  minMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  avgMs: number;
  samplesMs: number[];
  metadata: Metadata;
};

function summarize(
  name: string,
  iterations: number,
  warmups: number,
  run: () => Metadata,
): BenchmarkResult {
  for (let i = 0; i < warmups; i++) run();

  const samplesMs: number[] = [];
  let metadata: Metadata = {};
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    metadata = run();
    samplesMs.push(performance.now() - start);
  }

  const sorted = [...samplesMs].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const p95Ms = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
  const totalMs = samplesMs.reduce((sum, value) => sum + value, 0);

  return {
    name,
    iterations,
    warmups,
    minMs: sorted[0],
    medianMs,
    p95Ms,
    maxMs: sorted[sorted.length - 1],
    avgMs: totalMs / samplesMs.length,
    samplesMs,
    metadata,
  };
}

function makeWorld() {
  const world = defaultWorld();
  stampRivers(world);
  stampLandforms(world);
  return world;
}

function finishTerrainMesh(world: ReturnType<typeof defaultWorld>): Metadata {
  const builder = buildWorldVerticesGen(world, { x: 100, y: 100 });
  let result = builder.next();
  while (!result.done) result = builder.next();
  const vertices = result.value;
  if (!(vertices instanceof Float32Array) || vertices.length === 0) {
    throw new Error('Voxel terrain generator returned no vertex buffer');
  }
  return {
    vertices: vertices.length / 6,
    floatCount: vertices.length,
  };
}

function main() {
  const results: BenchmarkResult[] = [];

  results.push(summarize('world-generation', 5, 1, () => {
    const world = defaultWorld();
    return {
      width: world.w,
      height: world.h,
      trees: world.trees.length,
      rocks: world.rocks.length,
    };
  }));

  results.push(summarize('river-generation-and-stamping', 5, 1, () => {
    const world = defaultWorld();
    stampRivers(world);
    const rivers = (world.rivers ?? []) as unknown as Array<{
      tiles: Array<{ x: number; y: number }>;
      widthTiles?: Array<{ x: number; y: number }>;
    }>;
    return {
      rivers: rivers.length,
      centerlineTiles: rivers.reduce((sum, river) => sum + river.tiles.length, 0),
      widthTiles: rivers.reduce((sum, river) => sum + (river.widthTiles?.length ?? 0), 0),
    };
  }));

  results.push(summarize('landform-generation-and-stamping', 5, 1, () => {
    const world = defaultWorld();
    stampRivers(world);
    stampLandforms(world);
    return {
      terrainTiles: Object.keys(world.terrain).length,
      stoneTiles: Object.values(world.terrain).filter((terrain) => terrain === 'stone').length,
    };
  }));

  const pathWorld = makeWorld();
  const pathFrom = { x: 99, y: 94 };
  const pathTo = { x: 99, y: 106 };
  const pathProbe = planPathNpc(pathWorld, pathFrom, pathTo);
  if (!pathProbe || pathProbe.length < 2) {
    throw new Error('NPC A* benchmark probe is not reachable on the authored town road');
  }
  results.push(summarize('npc-a-star-authored-road', 20, 2, () => {
    const path = planPathNpc(pathWorld, pathFrom, pathTo);
    if (!path) throw new Error('NPC A* probe became unreachable');
    return { pathTiles: path.length };
  }));

  const meshWorld = makeWorld();
  results.push(summarize('voxel-terrain-mesh-generation', 3, 1, () => finishTerrainMesh(meshWorld)));

  results.push(summarize('settlement-simulation-24h', 2, 1, () => {
    const sim = createSettlementSim(defaultWorld());
    advanceSettlement(sim, 1600);
    if (sim.ledger.ticks !== 1600) {
      throw new Error(`Settlement benchmark advanced ${sim.ledger.ticks} ticks instead of 1600`);
    }
    if (sim.ledger.starvedTicks !== 0) {
      throw new Error(`24-hour settlement benchmark starved for ${sim.ledger.starvedTicks} ticks`);
    }
    return {
      ticks: sim.ledger.ticks,
      starvedTicks: sim.ledger.starvedTicks,
      minHealth: sim.ledger.minHealth,
      woodChopped: sim.ledger.woodChopped,
      woodDelivered: sim.ledger.woodDelivered,
      grainHarvested: sim.ledger.grainHarvested,
      grainDelivered: sim.ledger.grainDelivered,
      flourMilled: sim.ledger.flourMilled,
      mealsBaked: sim.ledger.mealsBaked,
      mealsEaten: sim.ledger.mealsEaten,
    };
  }));

  const report = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? 'local',
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    heapUsedBytes: process.memoryUsage().heapUsed,
    results,
  };

  mkdirSync('work/experiments', { recursive: true });
  const outputPath = 'work/experiments/benchmark-world.json';
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');

  console.log('=== ADVENTURE WORLD PERFORMANCE BASELINE ===');
  console.log(`commit: ${report.commit}`);
  console.log(`node: ${report.node} | ${report.platform}/${report.architecture}`);
  for (const result of results) {
    console.log(
      `${result.name}: median ${result.medianMs.toFixed(2)}ms, p95 ${result.p95Ms.toFixed(2)}ms, ${result.iterations} samples`,
    );
    console.log(`  ${JSON.stringify(result.metadata)}`);
  }
  console.log(`saved: ${outputPath}`);
}

main();
