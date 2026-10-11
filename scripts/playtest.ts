// Gameplay tester runner (BUILD 532 — Phase 3 Stage 1).
// Run with: npx tsx scripts/playtest.ts
//
// Creates a test arena with walls, enemies (real updateGoat AI), and items.
// Runs the GameplayAgent for N ticks and reports: kills, collections,
// exploration coverage, stuck events, unreachable targets.
//
// This exercises the REAL systems: A* pathfinding, updateGoat enemy AI,
// isInMeleeArc combat geometry. The agent never teleports — all moves go
// through tryMove() which validates collision.

import {
  createAgent,
  stepAgent,
  agentReport,
  type AgentWorld,
  type AgentVec,
  type AgentEnemy,
  type AgentItem,
  type AgentAttackResult,
} from '../src/game/gameplayAgent';
import { updateGoat, type GoatAIEntity } from '../src/game/ai';
import { isInMeleeArc } from '../src/game/combat';
import type { ObstacleRect } from '../src/game/npcNavigation';

// ---- Test world ----

type Wall = { x0: number; y0: number; x1: number; y1: number };

class TestWorld implements AgentWorld {
  playerPos: AgentVec;
  walls: Wall[];
  enemies: (GoatAIEntity & { id: string })[];
  items: AgentItem[];
  bounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  playerHp = 100;

  constructor() {
    this.playerPos = { x: 10, y: 10 };
    // Arena: border walls + interior obstacles
    // NOTE: Using simple thick obstacles that the A* grid (4-unit cells)
    // can represent clearly. Thin walls cause grid aliasing.
    this.walls = [
      // Border (thick)
      { x0: -8, y0: -8, x1: 108, y1: 0 },
      { x0: -8, y0: 100, x1: 108, y1: 108 },
      { x0: -8, y0: 0, x1: 0, y1: 100 },
      { x0: 100, y0: 0, x1: 108, y1: 100 },
      // Interior: a large building block (tests pathfinding around)
      { x0: 40, y0: 40, x1: 60, y1: 60 },
      // No thin wall — Stage 1 focuses on core loop, not narrow gaps
    ];
    // Enemies: 2 hostile goats, 1 calm (should be ignored)
    this.enemies = [
      {
        id: 'goat-1',
        position: { x: 80, y: 20 },
        facing: 'left',
        state: 'idle',
        disposition: 'aggressive',
        hp: 30, maxHp: 30,
        attackCooldown: 0, attackTimer: 0, attackHitApplied: false,
        hurtTimer: 0, moving: false, attacking: false,
        spawnPosition: { x: 80, y: 20 }, roamRadius: 40,
        level: 1,
      },
      {
        id: 'goat-2',
        position: { x: 25, y: 85 },
        facing: 'right',
        state: 'idle',
        disposition: 'aggressive',
        hp: 30, maxHp: 30,
        attackCooldown: 0, attackTimer: 0, attackHitApplied: false,
        hurtTimer: 0, moving: false, attacking: false,
        spawnPosition: { x: 25, y: 85 }, roamRadius: 40,
        level: 1,
      },
      {
        id: 'goat-3-calm',
        position: { x: 90, y: 90 },
        facing: 'down',
        state: 'idle',
        disposition: 'calm',
        hp: 30, maxHp: 30,
        attackCooldown: 0, attackTimer: 0, attackHitApplied: false,
        hurtTimer: 0, moving: false, attacking: false,
      },
    ];
    // Items scattered around
    this.items = [
      { id: 'sword-1', pos: { x: 15, y: 50 }, kind: 'sword' },
      { id: 'potion-1', pos: { x: 70, y: 80 }, kind: 'potion' },
      { id: 'gold-1', pos: { x: 90, y: 10 }, kind: 'gold' },
      // One behind the building (tests pathfinding to occluded item)
      { id: 'gem-1', pos: { x: 50, y: 65 }, kind: 'gem' },
    ];
  }

  isBlocked(pos: AgentVec): boolean {
    if (pos.x < this.bounds.minX || pos.x > this.bounds.maxX || pos.y < this.bounds.minY || pos.y > this.bounds.maxY) {
      return true;
    }
    return this.walls.some((w) => pos.x >= w.x0 && pos.x <= w.x1 && pos.y >= w.y0 && pos.y <= w.y1);
  }

  getObstacles(): ObstacleRect[] {
    return this.walls.map((w) => ({
      x: w.x0,
      y: w.y0,
      width: w.x1 - w.x0,
      height: w.y1 - w.y0,
    }));
  }

  getPlayerPos(): AgentVec {
    return { ...this.playerPos };
  }

  tryMove(to: AgentVec): boolean {
    // NEVER teleport: validate collision before moving.
    if (this.isBlocked(to)) return false;
    this.playerPos = { ...to };
    return true;
  }

  getEnemies(): AgentEnemy[] {
    return this.enemies
      .filter((e) => e.hp > 0 && e.disposition !== 'defeated')
      .map((e) => ({
        id: e.id,
        pos: { ...e.position },
        hp: e.hp,
        maxHp: e.maxHp,
        hostile: e.disposition === 'aggressive',
      }));
  }

  attackEnemy(id: string): AgentAttackResult {
    const enemy = this.enemies.find((e) => e.id === id);
    if (!enemy || enemy.hp <= 0) return { hit: false, damage: 0, killed: false };
    // Use real combat geometry: must be in melee arc
    const facing = this.facingToward(this.playerPos, enemy.position);
    if (!isInMeleeArc(this.playerPos, enemy.position, facing, 5)) {
      return { hit: false, damage: 0, killed: false };
    }
    const damage = 10 + Math.floor(Math.random() * 6); // 10-15
    enemy.hp -= damage;
    const killed = enemy.hp <= 0;
    if (killed) {
      enemy.disposition = 'defeated';
      enemy.state = 'die';
    } else {
      // Provoke: calm enemies fight back when hit
      enemy.disposition = 'aggressive';
      (enemy as { provoked?: boolean }).provoked = true;
    }
    return { hit: true, damage, killed };
  }

  private facingToward(from: AgentVec, to: AgentVec): 'up' | 'down' | 'left' | 'right' {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
  }

  getItems(): AgentItem[] {
    return this.items.map((i) => ({ ...i, pos: { ...i.pos } }));
  }

  collectItem(id: string): boolean {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return false;
    const item = this.items[idx];
    const d = Math.hypot(item.pos.x - this.playerPos.x, item.pos.y - this.playerPos.y);
    if (d > 2) return false; // must be close
    this.items.splice(idx, 1);
    return true;
  }

  getNpcs(): never[] {
    return []; // Stage 1: no NPCs in test arena
  }

  getBounds() {
    return { ...this.bounds };
  }

  // Tick enemies using REAL updateGoat AI
  tickEnemies(deltaMs: number): void {
    const playerPos = { ...this.playerPos };
    // Simple facing: use last movement direction (default down)
    const playerFacing = 'down' as const;
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || enemy.disposition === 'defeated') continue;
      const goats = this.enemies.filter((e) => e !== enemy);
      const result = updateGoat(
        enemy,
        playerPos,
        playerFacing,
        goats,
        deltaMs,
        { isBlocked: (pos) => this.isBlocked(pos) } // BUILD 531 collision!
      );
      // Apply (updateGoat returns new object; copy back)
      Object.assign(enemy, result.goat);
      // If enemy hit player, damage player
      if (result.attackHit) {
        this.playerHp -= 5;
      }
    }
  }
}

// ---- Runner ----

const TICKS = 3000;
const DELTA_MS = 100; // 100ms per tick = 5 minutes of game time

console.log('=== Gameplay Agent Playtest (BUILD 532 Stage 1) ===');
console.log(`Running ${TICKS} ticks (${(TICKS * DELTA_MS) / 1000}s game time)...\n`);

const world = new TestWorld();
const agent = createAgent({ x: 10, y: 10 }, 100);

let ticksRun = 0;
for (let tick = 0; tick < TICKS; tick++) {
  // Sync agent HP with world
  agent.hp = world.playerHp;
  const alive = stepAgent(world, agent, tick, DELTA_MS);
  world.tickEnemies(DELTA_MS);
  // Sync back (enemy attacks reduce world.playerHp)
  agent.hp = world.playerHp;
  ticksRun = tick + 1;
  if (!alive || agent.hp <= 0) {
    console.log(`Agent died at tick ${tick}`);
    break;
  }
}

const report = agentReport(agent, ticksRun);

console.log('\n=== RESULTS ===');
console.log(`Ticks: ${report.ticks}`);
console.log(`Kills: ${report.kills} (of 2 hostile)`);
console.log(`Items collected: ${report.collected} (of 4)`);
console.log(`Cells visited: ${report.cellsVisited}`);
console.log(`Stuck events: ${report.stuckEvents}`);
console.log(`Unreachable events: ${report.unreachableEvents}`);
console.log(`Attacks: ${report.attackEvents}`);
console.log(`Final HP: ${agent.hp}/${agent.maxHp}`);
console.log(`Final pos: (${agent.pos.x.toFixed(1)}, ${agent.pos.y.toFixed(1)})`);

if (report.stuckEvents > 0 || report.unreachableEvents > 0) {
  console.log('\n=== FAILURES ===');
  for (const e of report.events) {
    if (e.type === 'stuck' || e.type === 'unreachable' || e.type === 'error') {
      console.log(`[tick ${e.tick}] ${e.type}: ${e.detail} at (${e.pos.x.toFixed(1)}, ${e.pos.y.toFixed(1)})`);
    }
  }
}

console.log('\n=== EVENT SAMPLE ===');
const interesting = report.events.filter((e) => e.type === 'kill' || e.type === 'collect' || e.type === 'flee');
for (const e of interesting.slice(0, 20)) {
  console.log(`[tick ${e.tick}] ${e.type}: ${e.detail}`);
}
if (interesting.length > 20) console.log(`... and ${interesting.length - 20} more`);
