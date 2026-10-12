// World-Simulation Laboratory (BUILD 547)
//
// Headless NPC civilization testing using PRODUCTION systems.
// Uses: createTownsfolk, advanceTownsfolk, townsfolkTarget from src/game/townsfolk.ts
// No rendering. Deterministic. Bounded.
//
// Run: npx tsx scripts/sim-lab.ts [scenario] [days]
//   Scenarios: village (10 NPCs), settlement (50 NPCs), town (100 NPCs)
//
// Phase B: Bounded deterministic headless runner
// Phase C: End-to-end scenario demonstration
// Phase D: Consistency checks + structured reports
import {
  createTownsfolk,
  advanceTownsfolk,
  townsfolkTarget,
  buildMosslightHousing,
  cottageDoorways,
  mosslightObstacles,
  type Townsperson,
  type TownsfolkAnchors,
  type TownsfolkNavContext,
  type TownsfolkTarget,
} from '../src/game/townsfolk';
import type { WorldClockState } from '../src/game/worldCore';

// === Configuration ===
const scenario = process.argv[2] || 'village';
const daysToSimulate = parseInt(process.argv[3] || '1', 10);

const SCENARIOS: Record<string, { npcCount: number; description: string }> = {
  village: { npcCount: 10, description: 'Small village' },
  settlement: { npcCount: 50, description: 'Settlement' },
  town: { npcCount: 100, description: 'Large town' },
};

const config = SCENARIOS[scenario] || SCENARIOS.village;
if (daysToSimulate > 30) {
  console.error('Max 30 days per run (bounded execution)');
  process.exit(1);
}

// === Deterministic RNG ===
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// === Event Recording ===
type SimEvent = {
  tick: number;
  day: number;
  hour: number;
  npcId: string;
  type: string;
  detail: string;
};

const events: SimEvent[] = [];
function recordEvent(tick: number, clock: WorldClockState, npcId: string, type: string, detail: string) {
  // Bounded: max 10k events
  if (events.length >= 10000) return;
  events.push({ tick, day: clock.day, hour: clock.hour, npcId, type, detail });
}

// === Health Checks ===
type HealthViolation = {
  tick: number;
  check: string;
  npcId: string;
  detail: string;
};
const violations: HealthViolation[] = [];

function checkHealth(folk: Townsperson[], tick: number) {
  const ids = new Set<string>();

  for (const npc of folk) {
    // Check 1: Valid identity
    if (!npc.id || !npc.name) {
      violations.push({ tick, check: 'valid-identity', npcId: npc.id || 'unknown', detail: 'Missing id or name' });
    }
    // Check 2: No duplicates
    if (ids.has(npc.id)) {
      violations.push({ tick, check: 'no-duplicates', npcId: npc.id, detail: 'Duplicate ID' });
    }
    ids.add(npc.id);

    // Check 3: Valid position (not NaN, within reasonable bounds)
    if (!npc.position || isNaN(npc.position.x) || isNaN(npc.position.y)) {
      violations.push({ tick, check: 'valid-position', npcId: npc.id, detail: 'Invalid position' });
    }
    // Check 4: Position within world bounds (generous: -1000 to 2000)
    if (npc.position && (npc.position.x < -1000 || npc.position.x > 2000 || npc.position.y < -1000 || npc.position.y > 2000)) {
      violations.push({ tick, check: 'in-bounds', npcId: npc.id, detail: `Out of bounds: (${npc.position.x}, ${npc.position.y})` });
    }
  }
}

// === Main Simulation ===
console.log(`=== World-Simulation Laboratory ===`);
console.log(`Scenario: ${scenario} (${config.description})`);
console.log(`NPCs: ${config.npcCount}, Days: ${daysToSimulate}\n`);

const wallStart = Date.now();

// Create deterministic world
const worldSeed = 12345;
const rng = mulberry32(worldSeed);

// Minimal anchors for headless simulation (Mosslight Crossing layout)
const anchors: TownsfolkAnchors = {
  points: {
    guild: { x: 70, y: 70 },
    chapel: { x: 80, y: 80 },
    tavern: { x: 90, y: 90 },
    farm0: { x: 30, y: 119 },
    farm1: { x: 110, y: 119 },
    home0: { x: 50, y: 50 },
    home1: { x: 60, y: 60 },
    home2: { x: 70, y: 50 },
    home3: { x: 80, y: 60 },
    home4: { x: 90, y: 50 },
  },
  plaza: { x: 144, y: 144 },
  stalls: [{ x: 58, y: 64 }, { x: 82, y: 64 }],
  gardens: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
  patrol: [{ x: 144, y: 144 }, { x: 100, y: 100 }, { x: 180, y: 180 }],
};

let folk = createTownsfolk(anchors, worldSeed);
// Limit to scenario size
folk = folk.slice(0, config.npcCount);

console.log(`Created ${folk.length} townsfolk (seed ${worldSeed})`);

// Track previous targets for event detection
const prevTargets = new Map<string, string>();

// Nav context (minimal — obstacles and doorways from production)
const nav: TownsfolkNavContext = {
  doors: cottageDoorways(),
  obstacles: mosslightObstacles(),
  housing: buildMosslightHousing(folk.map(f => f.id)),
};

// World clock (start at day 1, 6am)
let clock: WorldClockState = {
  tick: 0,
  year: 1, month: 1, week: 1, day: 1,
  hour: 6, minuteOfDay: 360, second: 0,
  season: 'spring',
};

// Simulation: advance in ticks (1 tick = 1 game minute for speed)
// 1 day = 1440 ticks
const TICKS_PER_DAY = 1440;
const totalTicks = daysToSimulate * TICKS_PER_DAY;

let ticksRun = 0;
for (let tick = 0; tick < totalTicks; tick++) {
  // Advance clock (1 tick = 1 minute)
  clock.tick++;
  clock.minuteOfDay++;
  if (clock.minuteOfDay >= 1440) {
    clock.minuteOfDay = 0;
    clock.day++;
  }
  clock.hour = Math.floor(clock.minuteOfDay / 60);

  // Advance NPCs (production function)
  folk = advanceTownsfolk(folk, anchors, clock, nav);

  // Detect target changes (events)
  for (const npc of folk) {
    const target = townsfolkTarget(npc, anchors, clock);
    const targetKey = `${target.activity}:${target.target.x.toFixed(0)},${target.target.y.toFixed(0)}`;
    const prev = prevTargets.get(npc.id);
    if (prev !== undefined && prev !== targetKey) {
      recordEvent(tick, clock, npc.id, 'target-changed', `${prev} → ${targetKey}`);
    }
    prevTargets.set(npc.id, targetKey);
  }

  // Health checks every 60 ticks (hourly)
  if (tick % 60 === 0) {
    checkHealth(folk, tick);
  }

  ticksRun++;

  // Progress
  if (tick % (TICKS_PER_DAY / 4) === 0) {
    const dayProgress = (tick / totalTicks * 100).toFixed(0);
    process.stdout.write(`\r  Progress: ${dayProgress}% (day ${clock.day}, ${clock.hour}:00)`);
  }
}
console.log('\n');

// === Report ===
const wallElapsed = (Date.now() - wallStart) / 1000;

console.log(`=== Simulation Complete ===`);
console.log(`Wall time: ${wallElapsed.toFixed(1)}s`);
console.log(`Simulated: ${daysToSimulate} days (${totalTicks} ticks)`);
console.log(`Throughput: ${(totalTicks / wallElapsed).toFixed(0)} ticks/sec`);
console.log(`Events recorded: ${events.length}`);
console.log(`Health violations: ${violations.length}\n`);

if (violations.length > 0) {
  console.log('--- VIOLATIONS ---');
  const byCheck = new Map<string, number>();
  violations.forEach(v => byCheck.set(v.check, (byCheck.get(v.check) || 0) + 1));
  byCheck.forEach((count, check) => console.log(`  ${check}: ${count}`));
  console.log('');
  // Show first 5
  violations.slice(0, 5).forEach(v =>
    console.log(`  [tick ${v.tick}] ${v.npcId}: ${v.detail}`)
  );
} else {
  console.log('No health violations detected. ✅\n');
}

// Event summary
if (events.length > 0) {
  console.log('--- Event Summary ---');
  const byType = new Map<string, number>();
  events.forEach(e => byType.set(e.type, (byType.get(e.type) || 0) + 1));
  byType.forEach((count, type) => console.log(`  ${type}: ${count}`));
}

// Repeatability check: hash final state
const stateHash = folk.map(f =>
  `${f.id}:${f.position?.x.toFixed(1)},${f.position?.y.toFixed(1)}`
).join('|').length;
console.log(`\nFinal state fingerprint: ${folk.length} NPCs, hash len ${stateHash}`);
console.log(`Deterministic: re-run with same seed for identical results.`);
