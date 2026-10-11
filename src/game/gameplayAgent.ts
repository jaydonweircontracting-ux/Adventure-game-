// Gameplay Agent (BUILD 532 — Phase 3 Stage 1).
//
// An automated player that exercises the REAL game systems: movement via
// A* pathfinding (npcNavigation), collision via the world's isBlocked,
// combat geometry via combat.ts, enemy AI via ai.ts.
//
// The agent NEVER teleports and NEVER bypasses collision. Every move goes
// through world.tryMove(), which the world implementation validates. If the
// agent gets stuck, it reports stuck — it does not cheat.
//
// Design: the agent senses through AgentWorld (read-only observations +
// validated actions) and decides via a simple priority brain:
//   1. Flee if low HP and threatened
//   2. Fight hostile enemies in aggro range
//   3. Collect nearby items
//   4. Explore unvisited frontier
//   5. Wander if nothing else
//
// Failure detection is built in: stuck (no progress), unreachable (no path),
// and repeated failed actions are logged as AgentEvents with position/tick.

import { findPath, type ObstacleRect, type NavPoint } from './npcNavigation';
import { isInMeleeArc, type CombatDirection } from './combat';

export type AgentVec = { x: number; y: number };
export type AgentFacing = CombatDirection;

export type AgentEnemy = {
  id: string;
  pos: AgentVec;
  hp: number;
  maxHp: number;
  hostile: boolean;
};

export type AgentItem = { id: string; pos: AgentVec; kind: string };
export type AgentNpc = { id: string; pos: AgentVec; name: string };

export type AgentAttackResult = {
  hit: boolean;
  damage: number;
  killed: boolean;
};

// The world interface. The agent sees ONLY through this — no direct access
// to game internals. Implementations must validate all actions (no teleport).
export type AgentWorld = {
  /** Is this position solid? (water/tree/building/wall) */
  isBlocked(pos: AgentVec): boolean;
  /** Obstacle rects for A* pathfinding. */
  getObstacles(): ObstacleRect[];
  /** Current player position. */
  getPlayerPos(): AgentVec;
  /** Attempt to move to `to`. Returns false if blocked. Never teleports. */
  tryMove(to: AgentVec): boolean;
  /** Visible enemies. */
  getEnemies(): AgentEnemy[];
  /** Attack an enemy in melee range. Returns hit/miss. */
  attackEnemy(id: string): AgentAttackResult;
  /** Visible ground items. */
  getItems(): AgentItem[];
  /** Pick up an item at the player's position. */
  collectItem(id: string): boolean;
  /** Visible NPCs. */
  getNpcs(): AgentNpc[];
  /** World bounds for exploration. */
  getBounds(): { minX: number; maxX: number; minY: number; maxY: number };
};

export type AgentEventType =
  | 'move'
  | 'stuck'
  | 'attack'
  | 'kill'
  | 'collect'
  | 'unreachable'
  | 'explore'
  | 'flee'
  | 'error';

export type AgentEvent = {
  tick: number;
  type: AgentEventType;
  detail: string;
  pos: AgentVec;
};

export type GameplayAgent = {
  pos: AgentVec;
  hp: number;
  maxHp: number;
  facing: AgentFacing;
  inventory: string[];
  /** "x,y" cell keys the agent has visited (for exploration). */
  visited: Set<string>;
  /** Ticks since last position change while trying to move. */
  stuckTicks: number;
  lastPos: AgentVec;
  /** Current navigation goal. */
  goal: AgentVec | null;
  /** Current path (waypoints). */
  path: AgentVec[] | null;
  /** Enemies the agent has decided are unreachable. */
  unreachableEnemies: Set<string>;
  /** Event log for failure detection. */
  events: AgentEvent[];
  /** Kills, collections, etc. for reporting. */
  kills: number;
  collected: number;
};

// Tuning constants
export const AGENT_AGGRO_RANGE = 20;
export const AGENT_MELEE_RANGE = 5;
export const AGENT_FLEE_HP_RATIO = 0.25;
export const AGENT_STUCK_TICKS = 15;
export const AGENT_MOVE_SPEED = 4; // units/sec, matches player walk
export const AGENT_ITEM_SIGHT_RANGE = 15;
export const AGENT_EXPLORE_CELL = 10; // exploration grid cell size

export function createAgent(startPos: AgentVec, hp = 100): GameplayAgent {
  return {
    pos: { ...startPos },
    hp,
    maxHp: hp,
    facing: 'down',
    inventory: [],
    visited: new Set([cellKey(startPos)]),
    stuckTicks: 0,
    lastPos: { ...startPos },
    goal: null,
    path: null,
    unreachableEnemies: new Set(),
    events: [],
    kills: 0,
    collected: 0,
  };
}

function cellKey(pos: AgentVec): string {
  const cx = Math.floor(pos.x / AGENT_EXPLORE_CELL);
  const cy = Math.floor(pos.y / AGENT_EXPLORE_CELL);
  return `${cx},${cy}`;
}

function logEvent(agent: GameplayAgent, tick: number, type: AgentEventType, detail: string): void {
  agent.events.push({ tick, type, detail, pos: { ...agent.pos } });
}

function facingToward(from: AgentVec, to: AgentVec): AgentFacing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
}

// Plan a path to `target`. Returns null if unreachable.
function planPath(world: AgentWorld, from: AgentVec, to: AgentVec): AgentVec[] | null {
  const obstacles = world.getObstacles();
  const path = findPath(from as NavPoint, to as NavPoint, obstacles);
  if (!path) return null;
  return path.map((p) => ({ x: p.x, y: p.y }));
}

// Move along the current path by one step. Returns true if moved.
function followPath(world: AgentWorld, agent: GameplayAgent, deltaMs: number): boolean {
  if (!agent.path || agent.path.length === 0) return false;
  const step = (AGENT_MOVE_SPEED * deltaMs) / 1000;
  const target = agent.path[0];
  const dx = target.x - agent.pos.x;
  const dy = target.y - agent.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) {
    // Reached waypoint, pop it
    agent.path.shift();
    return followPath(world, agent, deltaMs); // try next waypoint
  }
  const moveDist = Math.min(step, dist);
  const next: AgentVec = {
    x: agent.pos.x + (dx / dist) * moveDist,
    y: agent.pos.y + (dy / dist) * moveDist,
  };
  // CRITICAL: validate through the world — never teleport.
  if (world.tryMove(next)) {
    agent.pos = { ...next };
    agent.facing = facingToward(agent.pos, target);
    agent.visited.add(cellKey(agent.pos));
    return true;
  }
  // Blocked — path is stale, clear it so we replan
  agent.path = null;
  return false;
}

// Find the nearest unvisited frontier cell for exploration.
function findExploreGoal(world: AgentWorld, agent: GameplayAgent): AgentVec | null {
  const bounds = world.getBounds();
  let best: AgentVec | null = null;
  let bestDist = Infinity;
  // Scan exploration grid for unvisited cells
  for (let cx = Math.floor(bounds.minX / AGENT_EXPLORE_CELL); cx <= Math.floor(bounds.maxX / AGENT_EXPLORE_CELL); cx++) {
    for (let cy = Math.floor(bounds.minY / AGENT_EXPLORE_CELL); cy <= Math.floor(bounds.maxY / AGENT_EXPLORE_CELL); cy++) {
      const key = `${cx},${cy}`;
      if (agent.visited.has(key)) continue;
      const cellCenter: AgentVec = {
        x: cx * AGENT_EXPLORE_CELL + AGENT_EXPLORE_CELL / 2,
        y: cy * AGENT_EXPLORE_CELL + AGENT_EXPLORE_CELL / 2,
      };
      // Skip if the cell center is blocked
      if (world.isBlocked(cellCenter)) continue;
      const d = Math.hypot(cellCenter.x - agent.pos.x, cellCenter.y - agent.pos.y);
      if (d < bestDist) {
        bestDist = d;
        best = cellCenter;
      }
    }
  }
  return best;
}

// One agent tick. Returns false if the agent died.
export function stepAgent(world: AgentWorld, agent: GameplayAgent, tick: number, deltaMs: number): boolean {
  if (agent.hp <= 0) return false;

  const pos = world.getPlayerPos();
  agent.pos = { ...pos }; // sync with world (in case world moved us)

  // --- Stuck detection ---
  const moved = Math.hypot(agent.pos.x - agent.lastPos.x, agent.pos.y - agent.lastPos.y);
  const hasGoal = agent.goal || (agent.path && agent.path.length > 0);
  if (moved < 0.01 && hasGoal) {
    agent.stuckTicks++;
    if (agent.stuckTicks === AGENT_STUCK_TICKS) {
      const goalStr = agent.goal ? `(${agent.goal.x.toFixed(1)}, ${agent.goal.y.toFixed(1)})` : 'none';
      const pathLen = agent.path ? agent.path.length : 0;
      const pathStr = agent.path ? agent.path.slice(0, 3).map((p) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join('->') : 'null';
      // Debug: check if goal is blocked
      const goalBlocked = agent.goal ? world.isBlocked(agent.goal) : false;
      logEvent(agent, tick, 'stuck', `No progress ${AGENT_STUCK_TICKS} ticks. Goal ${goalStr} blocked=${goalBlocked}, path len ${pathLen}: ${pathStr}`);
      // Clear path to force replan
      agent.path = null;
      agent.goal = null;
    }
  } else {
    agent.stuckTicks = 0;
  }
  agent.lastPos = { ...agent.pos };

  const enemies = world.getEnemies();
  const hostiles = enemies.filter((e) => e.hostile && e.hp > 0 && !agent.unreachableEnemies.has(e.id));

  // --- 1. Flee if low HP and threatened ---
  const lowHp = agent.hp / agent.maxHp <= AGENT_FLEE_HP_RATIO;
  const nearestThreat = hostiles
    .map((e) => ({ e, d: Math.hypot(e.pos.x - agent.pos.x, e.pos.y - agent.pos.y) }))
    .filter(({ d }) => d < AGENT_AGGRO_RANGE)
    .sort((a, b) => a.d - b.d)[0];
  if (lowHp && nearestThreat) {
    // Flee away from threat
    const dx = agent.pos.x - nearestThreat.e.pos.x;
    const dy = agent.pos.y - nearestThreat.e.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    const fleeTarget: AgentVec = {
      x: agent.pos.x + (dx / d) * 20,
      y: agent.pos.y + (dy / d) * 20,
    };
    if (!agent.goal || Math.hypot(agent.goal.x - fleeTarget.x, agent.goal.y - fleeTarget.y) > 5) {
      const path = planPath(world, agent.pos, fleeTarget);
      if (path) {
        agent.goal = fleeTarget;
        agent.path = path;
        logEvent(agent, tick, 'flee', `Fleeing from ${nearestThreat.e.id} (hp ${agent.hp})`);
      }
    }
    followPath(world, agent, deltaMs);
    return true;
  }

  // --- 2. Fight: nearest hostile in aggro range ---
  if (nearestThreat) {
    const { e, d } = nearestThreat;
    if (d <= AGENT_MELEE_RANGE) {
      // In range — attack if facing (use real combat geometry)
      agent.facing = facingToward(agent.pos, e.pos);
      if (isInMeleeArc(agent.pos, e.pos, agent.facing, AGENT_MELEE_RANGE)) {
        const result = world.attackEnemy(e.id);
        if (result.hit) {
          logEvent(agent, tick, 'attack', `Hit ${e.id} for ${result.damage}${result.killed ? ' (KILLED)' : ''}`);
          if (result.killed) agent.kills++;
        } else {
          logEvent(agent, tick, 'attack', `Missed ${e.id}`);
        }
      }
    } else {
      // Path toward enemy
      if (!agent.goal || !agent.path || Math.hypot(agent.goal.x - e.pos.x, agent.goal.y - e.pos.y) > 2) {
        const path = planPath(world, agent.pos, e.pos);
        if (path) {
          agent.goal = { ...e.pos };
          agent.path = path;
        } else {
          // Unreachable — mark and move on
          agent.unreachableEnemies.add(e.id);
          agent.goal = null;
          agent.path = null;
          logEvent(agent, tick, 'unreachable', `No path to enemy ${e.id}`);
        }
      }
      followPath(world, agent, deltaMs);
    }
    return true;
  }

  // --- 3. Collect: nearest item in sight ---
  const items = world.getItems();
  const nearestItem = items
    .map((it) => ({ it, d: Math.hypot(it.pos.x - agent.pos.x, it.pos.y - agent.pos.y) }))
    .filter(({ d }) => d < AGENT_ITEM_SIGHT_RANGE)
    .sort((a, b) => a.d - b.d)[0];
  if (nearestItem) {
    const { it, d } = nearestItem;
    if (d < 2) {
      if (world.collectItem(it.id)) {
        agent.inventory.push(it.kind);
        agent.collected++;
        logEvent(agent, tick, 'collect', `Collected ${it.kind} (${it.id})`);
      }
    } else {
      if (!agent.goal || !agent.path || Math.hypot(agent.goal.x - it.pos.x, agent.goal.y - it.pos.y) > 2) {
        const path = planPath(world, agent.pos, it.pos);
        if (path) {
          agent.goal = { ...it.pos };
          agent.path = path;
        } else {
          agent.goal = null;
          agent.path = null;
          logEvent(agent, tick, 'unreachable', `No path to item ${it.id}`);
        }
      }
      followPath(world, agent, deltaMs);
    }
    return true;
  }

  // --- 4. Explore: go to nearest unvisited frontier ---
  if (!agent.goal || !agent.path || agent.path.length === 0) {
    const exploreGoal = findExploreGoal(world, agent);
    if (exploreGoal) {
      const path = planPath(world, agent.pos, exploreGoal);
      if (path) {
        agent.goal = exploreGoal;
        agent.path = path;
        logEvent(agent, tick, 'explore', `Exploring to (${exploreGoal.x.toFixed(0)}, ${exploreGoal.y.toFixed(0)})`);
      } else {
        // Mark cell visited to avoid retry loop, find another
        agent.visited.add(cellKey(exploreGoal));
        agent.goal = null;
      }
    } else {
      // Nothing left to explore — wander
      agent.goal = null;
    }
  }
  if (agent.path && agent.path.length > 0) {
    followPath(world, agent, deltaMs);
  }

  return true;
}

// Summary for reporting
export type AgentReport = {
  ticks: number;
  kills: number;
  collected: number;
  cellsVisited: number;
  stuckEvents: number;
  unreachableEvents: number;
  attackEvents: number;
  events: AgentEvent[];
};

export function agentReport(agent: GameplayAgent, ticks: number): AgentReport {
  return {
    ticks,
    kills: agent.kills,
    collected: agent.collected,
    cellsVisited: agent.visited.size,
    stuckEvents: agent.events.filter((e) => e.type === 'stuck').length,
    unreachableEvents: agent.events.filter((e) => e.type === 'unreachable').length,
    attackEvents: agent.events.filter((e) => e.type === 'attack').length,
    events: agent.events,
  };
}
