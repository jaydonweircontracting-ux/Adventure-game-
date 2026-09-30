/**
 * villageLife.ts — the living-village layer on top of the townsfolk simulation.
 *
 * Extends the existing deterministic, clock-driven townsfolk system (townsfolk.ts)
 * with the AI-village concepts: personality traits, age, needs, relationships,
 * memories, a lightweight personal economy, and village world events.
 *
 * ARCHITECTURE RULES (same as townsfolk.ts):
 * - Everything derived is a PURE function of (npc, clock, roster). No Math.random,
 *   no accumulated tick state — so leaving town for days and returning shows
 *   NPCs exactly where/how they should be. The clock is the simulation.
 * - Genuine events (player interactions) are stored as bounded persisted
 *   memories — the only mutable per-NPC state, and it is event-driven.
 * - This module never moves NPCs itself. It only resolves *targets*; the
 *   physical movement, door enter/exit states, and collision in townsfolk.ts
 *   do the walking. No teleports, ever.
 */

import {
  townsfolkHash,
  townsfolkTarget,
  type Townsperson,
  type TownsfolkAnchors,
  type TownsfolkTarget,
  type TownsfolkArchetype,
  type NPCMemory,
} from './townsfolk';
import type { WorldClockState } from './worldCore';

// ---------------------------------------------------------------------------
// Personality & age (pure, derived from the NPC's persistent seed)
// ---------------------------------------------------------------------------

export type NPCPersonality = {
  /** 0..1 — seeks company, tavern evenings, plaza time */
  sociability: number;
  /** 0..1 — works full hours, rarely idles */
  diligence: number;
  /** 0..1 — spends little, saves wages */
  thrift: number;
  /** 0..1 — guards/adventurers; willingness to confront danger */
  courage: number;
  /** 0..1 — wanders, visits new places */
  curiosity: number;
};

export function npcPersonality(npc: Townsperson): NPCPersonality {
  return {
    sociability: townsfolkHash(npc.seed, 9101),
    diligence: townsfolkHash(npc.seed, 9102),
    thrift: townsfolkHash(npc.seed, 9103),
    courage: townsfolkHash(npc.seed, 9104),
    curiosity: townsfolkHash(npc.seed, 9105),
  };
}

export type NPCAge = 'child' | 'young' | 'adult' | 'elder';

export function npcAge(npc: Townsperson): NPCAge {
  if (npc.age) return npc.age;
  if (npc.archetype === 'child') return 'child';
  const r = townsfolkHash(npc.seed, 9110);
  if (r < 0.22) return 'young';
  if (r < 0.78) return 'adult';
  return 'elder';
}

/** Display age in years (deterministic, for the debug panel / dialogue). */
export function npcAgeYears(npc: Townsperson): number {
  const age = npcAge(npc);
  const r = townsfolkHash(npc.seed, 9111);
  if (age === 'child') return 7 + Math.floor(r * 6); // 7–12
  if (age === 'young') return 18 + Math.floor(r * 12); // 18–29
  if (age === 'adult') return 30 + Math.floor(r * 20); // 30–49
  return 55 + Math.floor(r * 20); // 55–74
}

// ---------------------------------------------------------------------------
// Needs (pure functions of npc + clock). 0..100, higher = more satisfied.
// ---------------------------------------------------------------------------

export type NPCNeeds = {
  hunger: number;
  energy: number;
  social: number;
  comfort: number;
};

function minutesOf(clock: WorldClockState): number {
  return Math.floor(clock.hour) * 60 + (Math.floor(clock.minuteOfDay) % 60);
}

const SOCIAL_ACTIVITIES = [
  'Evening at the Tankard',
  'Having lunch',
  'Lunch at home',
  'Playing',
  'About town',
  'Prayers',
];

/**
 * Pure needs model. Meals happen on the schedule (breakfast at wake, lunch
 * ~12:00, dinner ~18:00 at the tavern); hunger decays between them. Energy
 * drains across the waking day. Social/comfort derive from the current
 * activity plus personality — no stored state, so time-skips stay correct.
 */
export function npcNeeds(npc: Townsperson, clock: WorldClockState): NPCNeeds {
  const mins = minutesOf(clock);
  const p = npcPersonality(npc);
  const age = npcAge(npc);
  const target = townsfolkTarget(npc, { points: {}, plaza: { x: 0, y: 0 }, stalls: [], gardens: [], patrol: [] } as TownsfolkAnchors, clock);

  // --- Hunger: 100 right after each meal, decaying ~8/hr between meals. ---
  const wake = 360; // ~6:00 (matches schedule jitter range 5:30–6:30)
  const meals = [wake, 735, 1110]; // breakfast, lunch ~12:15, dinner ~18:30
  let lastMeal = meals[0];
  for (const m of meals) if (mins >= m) lastMeal = m;
  // Overnight: dinner was yesterday.
  const hoursSinceMeal = mins >= lastMeal ? (mins - lastMeal) / 60 : (mins + 1440 - lastMeal) / 60;
  const hunger = Math.max(0, Math.min(100, 100 - hoursSinceMeal * 9));

  // --- Energy: full at wake, drained by bedtime. Young/elderly tire faster. ---
  const sleep = 1290; // ~21:30
  const drainRate = age === 'child' || age === 'elder' ? 1.25 : 1;
  const dayLength = sleep - wake;
  const energy =
    mins < wake
      ? 100
      : mins >= sleep
        ? 5
        : Math.max(0, 100 - ((mins - wake) / dayLength) * 100 * drainRate);

  // --- Social: fulfilled by company, drained by solitary work. ---
  const activity = target.activity;
  let social: number;
  if (SOCIAL_ACTIVITIES.includes(activity)) social = 70 + p.sociability * 30;
  else if (activity === 'Sleeping') social = 45;
  else if (activity.includes('Work') || activity === 'Tending crops' || activity === 'Minding the stall' || activity === 'Patrolling')
    social = 25 + p.sociability * 30;
  else social = 45 + p.sociability * 25;
  social = Math.max(0, Math.min(100, social - (p.sociability > 0.7 ? 0 : 8)));

  // --- Comfort: home is best, outdoor labor is worst. ---
  let comfort: number;
  if (activity === 'Sleeping' || activity === 'At home' || activity === 'Resting') comfort = 92;
  else if (target.indoors) comfort = 72;
  else if (activity === 'Tending crops' || activity === 'Patrolling') comfort = 48;
  else comfort = 62;

  return {
    hunger: Math.round(hunger),
    energy: Math.round(energy),
    social: Math.round(Math.min(100, social)),
    comfort: Math.round(comfort),
  };
}

// ---------------------------------------------------------------------------
// Need-driven schedule overrides (pure). Rare and conservative: the base
// schedule already covers meals and sleep; these only catch edge cases.
// ---------------------------------------------------------------------------

/**
 * Village-aware target resolution. Wraps the base schedule with need-based
 * overrides, then hands the result to the normal physical movement pipeline
 * (doors, paths, collision) — the NPC still walks there, never teleports.
 */
export function villageTarget(
  npc: Townsperson,
  anchors: TownsfolkAnchors,
  clock: WorldClockState,
): TownsfolkTarget {
  const base = townsfolkTarget(npc, anchors, clock);
  // Never override sleep — the schedule owns the night.
  if (base.activity === 'Sleeping') return base;
  const needs = npcNeeds(npc, clock);

  // Starving (missed meals — e.g. a long player-triggered conversation kept
  // them out): detour for food at the tavern/stall.
  if (needs.hunger < 20 && !base.activity.includes('lunch') && !base.activity.includes('Lunch')) {
    const food = anchors.points.tavern ?? anchors.stalls[0] ?? anchors.plaza;
    return { activity: 'Grabbing a bite', target: { ...food }, indoors: false };
  }
  // Exhausted (young/elderly drain faster): head home to rest.
  if (needs.energy < 12) {
    const home = anchors.points[npc.homeKey] ?? npc.home;
    return { activity: 'Resting', target: { ...home }, indoors: true };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Relationships (pure seeded graph over the roster)
// ---------------------------------------------------------------------------

export type NPCRelationKind = 'family' | 'friend' | 'coworker' | 'rival' | 'acquaintance';

export type NPCRelationship = {
  targetId: string;
  targetName: string;
  kind: NPCRelationKind;
  /** -100..100. Grows slowly with days known for friends/family. */
  affinity: number;
};

/**
 * The relationship graph is seeded, not random: housemates are family,
 * same-archetype NPCs are coworkers, and friendships come from the seed pair
 * hash weighted by sociability. Affinity drifts up slowly with days known so
 * long-term residents genuinely grow closer — still pure (day-derived).
 */
export function npcRelationships(npc: Townsperson, folk: Townsperson[], clock: WorldClockState): NPCRelationship[] {
  const p = npcPersonality(npc);
  const rels: NPCRelationship[] = [];
  for (const other of folk) {
    if (other.id === npc.id) continue;
    let kind: NPCRelationKind | null = null;
    let base = 0;
    if (other.homeKey === npc.homeKey) {
      kind = 'family';
      base = 60 + Math.floor(townsfolkHash(npc.seed, other.seed % 100000) * 30);
    } else if (other.archetype === npc.archetype && npc.archetype !== 'commoner' && npc.archetype !== 'child') {
      kind = 'coworker';
      base = 20 + Math.floor(townsfolkHash(other.seed, npc.seed % 100000) * 30);
    } else {
      const f = townsfolkHash(npc.seed ^ (other.seed * 31), 9201);
      const friendThreshold = 0.55 - p.sociability * 0.35;
      if (f > friendThreshold) {
        kind = 'friend';
        base = 30 + Math.floor(f * 40);
      } else if (f < 0.06) {
        kind = 'rival';
        base = -20 - Math.floor(townsfolkHash(other.seed, 9202) * 25);
      }
    }
    if (!kind) continue;
    // Affinity matures with time known (capped). Day 0 = just met.
    const daysKnown = Math.max(0, Math.floor(clock.day));
    const maturity = kind === 'rival' ? 0 : Math.min(15, daysKnown * 0.5);
    rels.push({
      targetId: other.id,
      targetName: other.name,
      kind,
      affinity: Math.max(-100, Math.min(100, Math.round(base + maturity))),
    });
  }
  rels.sort((a, b) => b.affinity - a.affinity);
  return rels;
}

// ---------------------------------------------------------------------------
// Memories (the one piece of genuine mutable state — event-driven, bounded)
// ---------------------------------------------------------------------------

/** Seed a new NPC's memory with a couple of founding recollections. */
export function seedMemories(npc: Townsperson): NPCMemory[] {
  const r1 = townsfolkHash(npc.seed, 9301);
  const first: NPCMemory = {
    event: r1 < 0.5 ? 'Settled in Mosslight years ago.' : 'Grew up in Mosslight.',
    day: 0,
    importance: 2,
  };
  return [first];
}

/**
 * Record a memory. Bounded at 12 entries; when full, the oldest
 * low-importance memory is forgotten first. Important memories persist.
 */
export function addNPCMemory(npc: Townsperson, event: string, day: number, importance: 1 | 2 | 3): Townsperson {
  const memories = [...(npc.memories ?? [])];
  // Don't record exact duplicates.
  if (memories.some((m) => m.event === event)) return npc;
  memories.push({ event, day, importance });
  while (memories.length > 12) {
    const idx = memories.findIndex((m) => m.importance === 1);
    if (idx >= 0) memories.splice(idx, 1);
    else memories.shift();
  }
  return { ...npc, memories };
}

/** Memories worth surfacing, newest important first. */
export function notableMemories(npc: Townsperson): NPCMemory[] {
  return [...(npc.memories ?? [])].sort((a, b) => b.importance - a.importance || b.day - a.day).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Personal economy (lightweight, deterministic)
// ---------------------------------------------------------------------------

export function npcWage(archetype: TownsfolkArchetype): number {
  switch (archetype) {
    case 'merchant': return 15;
    case 'smith': return 14;
    case 'guard': return 12;
    case 'farmer': return 8;
    case 'priest': return 6;
    case 'commoner': return 5;
    case 'child': return 0;
  }
}

/**
 * An NPC's purse. Deterministic: seed savings + (wage − daily spend) × days.
 * Daily spend scales inversely with thrift. `goldDelta` carries player-driven
 * adjustments (tips, gifts, purchases) and is the only persisted part.
 */
export function npcGold(npc: Townsperson, clock: WorldClockState): number {
  const p = npcPersonality(npc);
  const days = Math.max(0, Math.floor(clock.day));
  const seedSavings = 20 + Math.floor(townsfolkHash(npc.seed, 9401) * 40);
  const dailySpend = 3 + Math.round((1 - p.thrift) * 5);
  const gold = seedSavings + days * (npcWage(npc.archetype) - dailySpend);
  return Math.max(0, gold + (npc.goldDelta ?? 0));
}

/** Apply a player-driven gold change (tip, gift, purchase). Returns updated NPC. */
export function adjustNPCGold(npc: Townsperson, delta: number): Townsperson {
  return { ...npc, goldDelta: (npc.goldDelta ?? 0) + delta };
}

// ---------------------------------------------------------------------------
// Village world events (deterministic daily flavor for Mosslight)
// ---------------------------------------------------------------------------

export type VillageEvent = {
  id: string;
  day: number;
  text: string;
};

/**
 * Deterministic village happenings. Same day + seed → same events, so the
 * world feels persistent without storing anything. The inspector surfaces
 * today's events; NPC barks can reference them.
 */
export function villageEventsForDay(day: number, worldSeed: number): VillageEvent[] {
  const d = Math.max(0, Math.floor(day));
  const events: VillageEvent[] = [];
  const pick = (salt: number, options: string[]) => options[Math.floor(townsfolkHash(d, worldSeed + salt) * options.length) % options.length];

  // Market day every 3 days.
  if (d % 3 === 1) {
    events.push({
      id: `market-${d}`,
      day: d,
      text: pick(1, [
        'Market day — extra stalls crowd the plaza.',
        'Market day — a traveling peddler set up by the fountain.',
        'Market day — farm goods pile high near the stalls.',
      ]),
    });
  }
  // Busy tavern on 5th/6th days of the week.
  if (d % 7 === 5 || d % 7 === 6) {
    events.push({
      id: `tavern-${d}`,
      day: d,
      text: 'The Rusty Tankard is packed tonight — half the town is there.',
    });
  }
  // Harvest news every 5 days.
  if (d % 5 === 2 && d > 0) {
    events.push({
      id: `harvest-${d}`,
      day: d,
      text: pick(2, [
        'Aldric brought in a fine harvest from the north fields.',
        'Brenna’s garden is overflowing — she’s giving away vegetables.',
      ]),
    });
  }
  // New arrival every 14 days.
  if (d % 14 === 7 && d > 0) {
    events.push({
      id: `arrival-${d}`,
      day: d,
      text: pick(3, [
        'A traveler arrived in Mosslight, asking about work.',
        'A merchant caravan passed through at dawn.',
        'A pilgrim stopped at the chapel overnight.',
      ]),
    });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Debug summary — everything the simulation panel needs in one object
// ---------------------------------------------------------------------------

export type NPCLifeSummary = {
  name: string;
  age: NPCAge;
  ageYears: number;
  archetype: TownsfolkArchetype;
  personality: NPCPersonality;
  needs: NPCNeeds;
  gold: number;
  wage: number;
  relationships: NPCRelationship[];
  memories: NPCMemory[];
  homeKey: string;
};

export function npcLifeSummary(
  npc: Townsperson,
  folk: Townsperson[],
  clock: WorldClockState,
): NPCLifeSummary {
  return {
    name: npc.name,
    age: npcAge(npc),
    ageYears: npcAgeYears(npc),
    archetype: npc.archetype,
    personality: npcPersonality(npc),
    needs: npcNeeds(npc, clock),
    gold: npcGold(npc, clock),
    wage: npcWage(npc.archetype),
    relationships: npcRelationships(npc, folk, clock),
    memories: notableMemories(npc),
    homeKey: npc.homeKey,
  };
}
