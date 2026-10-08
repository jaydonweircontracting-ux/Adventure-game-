// Stress tests (BUILD 474).
// Run with: npx tsx scripts/stress.ts
// Measures performance with 100-2000 entities.

import { SpatialHash } from '../src/game/spatialHash';
import { FlowField } from '../src/game/flowField';
import { EntityPool, type PoolableEntity } from '../src/game/entityPool';

interface TestEntity extends PoolableEntity {
  poolId: number;
  lifecycle: 'active' | 'dying' | 'pooled';
  id: number;
  x: number;
  y: number;
  reset(): void;
}

class StressEntity implements TestEntity {
  poolId: number;
  lifecycle: 'active' | 'dying' | 'pooled' = 'pooled';
  id: number;
  x = 0; y = 0;
  private static nextId = 0;
  constructor() {
    this.poolId = StressEntity.nextId;
    this.id = StressEntity.nextId++;
  }
  reset() { this.x = 0; this.y = 0; this.lifecycle = 'pooled'; }
}

function testSpatialHash(n: number): number {
  const hash = new SpatialHash<TestEntity>({ cellSize: 4 });
  const entities: TestEntity[] = [];
  for (let i = 0; i < n; i++) {
    const e = new StressEntity();
    e.x = Math.random() * 100;
    e.y = Math.random() * 100;
    entities.push(e);
    hash.add(e);
  }
  const start = performance.now();
  // Each entity queries neighbors (simulates separation pass).
  let totalNeighbors = 0;
  for (const e of entities) {
    totalNeighbors += hash.forEachNeighbor(e.x, e.y, 2, () => {}, e.id);
  }
  const elapsed = performance.now() - start;
  console.log(`  SpatialHash n=${n}: ${elapsed.toFixed(1)}ms (${totalNeighbors} neighbor checks)`);
  return elapsed;
}

function testFlowField(size: number): number {
  const costAt = () => 1;
  const start = performance.now();
  const field = new FlowField({ width: size, height: size, costAt }, size >> 1, size >> 1, 0);
  const elapsed = performance.now() - start;
  // Sample from 100 random positions.
  const sStart = performance.now();
  for (let i = 0; i < 100; i++) {
    field.sample(Math.random() * size, Math.random() * size);
  }
  const sElapsed = performance.now() - sStart;
  console.log(`  FlowField ${size}x${size}: build ${elapsed.toFixed(1)}ms, 100 samples ${sElapsed.toFixed(1)}ms`);
  return elapsed;
}

function testPool(n: number): number {
  const pool = new EntityPool<TestEntity>({
    factory: () => new StressEntity(),
    initialSize: 100,
    maxSize: 5000,
  });
  const start = performance.now();
  const acquired: TestEntity[] = [];
  for (let i = 0; i < n; i++) acquired.push(pool.acquire());
  for (const e of acquired) pool.release(e);
  const elapsed = performance.now() - start;
  console.log(`  EntityPool n=${n}: ${elapsed.toFixed(1)}ms (acquire+release)`);
  return elapsed;
}

console.log('\n=== STRESS TESTS ===\n');

console.log('Spatial Hash (neighbor queries):');
for (const n of [100, 250, 500, 1000, 2000]) {
  testSpatialHash(n);
}

console.log('\nFlow Field (navigation):');
for (const size of [16, 32, 64]) {
  testFlowField(size);
}

console.log('\nEntity Pool (spawn/recycle):');
for (const n of [100, 500, 1000, 2000]) {
  testPool(n);
}

console.log('\n=== DONE ===\n');
