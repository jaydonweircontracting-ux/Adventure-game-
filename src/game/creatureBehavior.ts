/**
 * BUILD 934: creature behavior blocks (Tibia portable item 1 of 5).
 *
 * Adapted from the Forgotten Server behavior grammar
 * (~/workspace/rea-targets/tibia/ANALYSIS.md §3): every monster type is
 * one data block of behavior knobs executed by a generic engine — no
 * per-monster special cases, no Tibia names/content, no stat changes.
 * The ported knobs, renamed to this game's vocabulary:
 *
 * - preferredRange (targetdistance): the range a MELEE creature holds.
 *   Must stay <= the engine's melee reach (GOAT_MELEE_RANGE = 4 in
 *   ai.ts) or the creature could never land a melee hit — every shipped
 *   melee block uses 4, asserted in the standalone sweep.
 * - rangedPreferredRange: the range a RANGED instance of the kind holds
 *   (bandit/goblin/orc archers, seeded at spawn). Sits inside the
 *   archer volley band (7..30u in App.tsx) so a holding archer keeps
 *   shooting instead of closing to melee.
 * - standChance (staticattack): per-500ms-bucket chance the creature
 *   holds its ground in the chase branch instead of stepping. High for
 *   brutes (ogre/troll 0.85), low for pack hunters (wolf 0.2).
 * - retargetIntervalMs + retargetChance (targetchange): a locked target
 *   is only re-evaluated after the interval, and then only on a won
 *   roll. Re-evaluation itself runs the EXISTING 915 acquisition rules
 *   (nearest victim, leash, 0.6 steal ratio, 933 sneak ranges) — the
 *   block gates WHEN re-evaluation happens, never WHAT it may pick.
 *   The existing 400ms acquire cadence in App.tsx stays as the outer
 *   floor, so the effective interval is max(400ms, block interval).
 * - fleeHpRatio + canFlee (runonhealth): below this HP fraction the
 *   creature flees (at-or-below counts, matching the pre-934 global
 *   0.3 rule it replaces). canFlee false (slime, skeleton) means the
 *   creature fights to death. Fleeing never makes a creature
 *   unkillable: disposition stays aggressive, flee speed (2 u/s) is
 *   below player walk speed, and the home-range clamp stops the flight
 *   at the roam edge where the player catches it.
 * - voices: acquire/flee/death lines through the existing log surface
 *   (no new audio, no new UI). Death lines append to the existing
 *   monster defeat line only; goat defeat text is unchanged.
 *
 * Randomness is deterministic by construction: rolls are pure FNV-1a
 * hashes of (creature key, time bucket) — no RNG state, no Math.random,
 * nothing saved. The only non-reproducible input is the wall-clock
 * bucket, the same clock the existing 400ms acquire gate already uses.
 * Behavior decisions are per-tick movement, never saved state.
 */

import type { CreatureAbilities } from './creatureAbilities';
import { resolveAbilities } from './creatureAbilities';

export type CreatureVoiceTable = {
  acquire: string[];
  flee: string[];
  death: string[];
};

export type CreatureBehavior = {
  /** Melee hold range in field units (must be <= 4, see header). */
  preferredRange: number;
  /** Hold range for ranged instances of this kind (inside 7..30 volley band). */
  rangedPreferredRange: number;
  /** 0..1 — chance to hold ground this chase bucket instead of stepping. */
  standChance: number;
  /** Minimum ms between target re-evaluations for a locked creature. */
  retargetIntervalMs: number;
  /** 0..1 — chance a due re-evaluation actually runs. */
  retargetChance: number;
  /** Flee at-or-below this HP fraction (0 = never, only with canFlee). */
  fleeHpRatio: number;
  /** Capability flag: false means the creature never flees. */
  canFlee: boolean;
  voices: CreatureVoiceTable;
  /**
   * BUILD 943: EQEmu special-ability overrides for this kind (partial —
   * behaviorForCreature resolves them against engine defaults, so an
   * omitted field means "exactly as before"). The 934 knobs above are
   * untouched; abilities extend the block, never rewrite it.
   */
  abilities?: Partial<CreatureAbilities>;
};

/** 500ms stand buckets: rolls are stable within a frame burst, rotate twice a second. */
export const BEHAVIOR_STAND_BUCKET_MS = 500;

/** FNV-1a hash folded into [0, 1). Pure: same seed + bucket, same roll. */
export function hashRoll(seed: string, bucket: number): number {
  let h = 0x811c9dc5;
  const s = seed + ':' + bucket;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function hashIndex(seed: string, mod: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mod > 0 ? (h >>> 0) % mod : 0;
}

const DEFAULT_BEHAVIOR: CreatureBehavior = {
  preferredRange: 4,
  rangedPreferredRange: 14,
  standChance: 0.4,
  retargetIntervalMs: 4000,
  retargetChance: 0.15,
  fleeHpRatio: 0.3,
  canFlee: true,
  voices: {
    acquire: ['The creature turns hostile!'],
    flee: ['The creature flees!'],
    death: ['The creature collapses.'],
  },
};

/**
 * Per-kind behavior table. Variants share their kind's block (a dire
 * wolf behaves like a wolf; an elf scout like an elf) — behavior is
 * per TYPE, not per instance. All lines are original to this game.
 */
const BEHAVIOR_TABLE: Record<string, CreatureBehavior> = {
  wolf: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.2,
    retargetIntervalMs: 3000, retargetChance: 0.25, fleeHpRatio: 0.25, canFlee: true,
    voices: {
      acquire: ["A wolf's growl rises from the undergrowth.", 'The wolf bares its fangs and circles.'],
      flee: ['The wolf tucks its tail and bolts.', 'The wolf yelps and flees into the brush.'],
      death: ['The wolf collapses with a final whine.'],
    },
    abilities: { multiStrike: 'flurry', leashRange: 48, chaseRange: 30, fleeSpeed: 2.5 },
  },
  direwolf: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.15,
    retargetIntervalMs: 3000, retargetChance: 0.3, fleeHpRatio: 0.2, canFlee: true,
    voices: {
      acquire: ['A direwolf howls and charges!'],
      flee: ['The direwolf limps away, snarling.'],
      death: ['The direwolf falls with a shuddering howl.'],
    },
    abilities: { multiStrike: 'triple', leashRange: 48, chaseRange: 30, enrageHpRatio: 0.3, enrageDamageMult: 1.5, enrageSpeedMult: 1.5 },
  },
  slime: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.8,
    retargetIntervalMs: 6000, retargetChance: 0.1, fleeHpRatio: 0, canFlee: false,
    voices: {
      acquire: ['The slime quivers and oozes forward.'],
      flee: [],
      death: ['The slime collapses into a puddle.'],
    },
    abilities: { sneakBlind: true, acquireRange: 12, leashRange: 24, chaseRange: 12, tetherRadius: 15 },
  },
  rat: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.3,
    retargetIntervalMs: 2000, retargetChance: 0.4, fleeHpRatio: 0.5, canFlee: true,
    voices: {
      acquire: ['A rat squeaks and darts toward you.'],
      flee: ['The rat squeaks in terror and scurries away.'],
      death: ['The rat goes still.'],
    },
    abilities: { fleeSpeed: 3.5 },
  },
  bat: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.4,
    retargetIntervalMs: 2500, retargetChance: 0.3, fleeHpRatio: 0.35, canFlee: true,
    voices: {
      acquire: ['A bat shrieks overhead.'],
      flee: ['The bat flutters away into the dark.'],
      death: ['The bat crumples to the ground.'],
    },
    abilities: { fleeSpeed: 3 },
  },
  spider: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.6,
    retargetIntervalMs: 4000, retargetChance: 0.15, fleeHpRatio: 0.2, canFlee: true,
    voices: {
      acquire: ['The spider rears up, mandibles clicking.'],
      flee: ['The spider scuttles back into the shadows.'],
      death: ['The spider curls up and goes still.'],
    },
    abilities: { sneakBlind: true },
  },
  goblin: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.4,
    retargetIntervalMs: 4000, retargetChance: 0.2, fleeHpRatio: 0.3, canFlee: true,
    voices: {
      acquire: ['The goblin cackles and brandishes its weapon.'],
      flee: ['The goblin shrieks and runs for it!'],
      death: ['The goblin collapses in a heap.'],
    },
  },
  bandit: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.5,
    retargetIntervalMs: 4000, retargetChance: 0.2, fleeHpRatio: 0.25, canFlee: true,
    voices: {
      acquire: ["The bandit grins: 'Your gold or your life!'", 'The bandit draws steel and advances.'],
      flee: ['The bandit turns tail and runs!'],
      death: ['The bandit falls, cursing.'],
    },
    abilities: { multiStrike: 'triple' },
  },
  orc: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.6,
    retargetIntervalMs: 5000, retargetChance: 0.15, fleeHpRatio: 0.2, canFlee: true,
    voices: {
      acquire: ['The orc roars a war-cry!'],
      flee: ['The orc lumbers away, bellowing.'],
      death: ['The orc topples with a crash.'],
    },
  },
  skeleton: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.5,
    retargetIntervalMs: 6000, retargetChance: 0.05, fleeHpRatio: 0, canFlee: false,
    voices: {
      acquire: ["The skeleton's bones rattle as it advances."],
      flee: [],
      death: ['The skeleton collapses into a pile of bones.'],
    },
    abilities: { leashRange: 48 },
  },
  troll: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.85,
    retargetIntervalMs: 8000, retargetChance: 0.05, fleeHpRatio: 0.15, canFlee: true,
    voices: {
      acquire: ['The troll lumbers forward, club raised.'],
      flee: ['The troll retreats, grumbling.'],
      death: ['The troll crashes to the ground.'],
    },
    abilities: { enrageHpRatio: 0.25, enrageDamageMult: 1.5, enrageSpeedMult: 1.5 },
  },
  ogre: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.85,
    retargetIntervalMs: 8000, retargetChance: 0.05, fleeHpRatio: 0.15, canFlee: true,
    voices: {
      acquire: ['The ogre bellows and charges!'],
      flee: ['The ogre lumbers off, nursing its wounds.'],
      death: ['The ogre falls like a tree.'],
    },
    abilities: { multiStrike: 'flurry', enrageHpRatio: 0.25, enrageDamageMult: 1.5, enrageSpeedMult: 1.5 },
  },
  elf: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.5,
    retargetIntervalMs: 4000, retargetChance: 0.2, fleeHpRatio: 0.3, canFlee: true,
    voices: {
      acquire: ['The elf nocks an arrow and takes aim.', 'The elf moves with silent grace.'],
      flee: ['The elf melts back into the trees.'],
      death: ['The elf falls silently.'],
    },
  },
  dwarf: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.7,
    retargetIntervalMs: 5000, retargetChance: 0.1, fleeHpRatio: 0.1, canFlee: true,
    voices: {
      acquire: ['The dwarf raises its axe with a battle-cry!'],
      flee: ['The dwarf beats a grudging retreat.'],
      death: ['The dwarf falls, axe clattering.'],
    },
  },
  snake: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.3,
    retargetIntervalMs: 3000, retargetChance: 0.25, fleeHpRatio: 0.4, canFlee: true,
    voices: {
      acquire: ['The snake coils and hisses.'],
      flee: ['The snake slithers away.'],
      death: ['The snake goes limp.'],
    },
    abilities: { fleeSpeed: 3 },
  },
  dragon: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.7,
    retargetIntervalMs: 4000, retargetChance: 0.1, fleeHpRatio: 0.3, canFlee: true,
    voices: {
      acquire: ['The dragon roars, shaking the ground!'],
      flee: ['The dragon beats a retreat, wings thundering.'],
      death: ['The dragon crashes down in a heap of scales.'],
    },
    abilities: { multiStrike: 'quad', enrageHpRatio: 0.4, enrageDamageMult: 1.5, enrageSpeedMult: 1.5, leashRange: 60, acquireRange: 32, chaseRange: 36, ignoreNpcVictims: true },
  },
  soldier: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.6,
    retargetIntervalMs: 5000, retargetChance: 0.1, fleeHpRatio: 0.2, canFlee: true,
    voices: {
      acquire: ['The soldier advances in formation step.'],
      flee: ['The soldier falls back in disorder.'],
      death: ['The soldier falls.'],
    },
  },
  knight: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.7,
    retargetIntervalMs: 5000, retargetChance: 0.1, fleeHpRatio: 0.1, canFlee: true,
    voices: {
      acquire: ['The knight levels a sword and advances.'],
      flee: ['The knight yields the field and retreats.'],
      death: ['The knight falls, armor clattering.'],
    },
  },
  goat: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.3,
    retargetIntervalMs: 4000, retargetChance: 0.15, fleeHpRatio: 0.3, canFlee: true,
    voices: {
      acquire: ['The goat lowers its horns and charges!'],
      flee: ['The goat bleats and bolts!'],
      death: [],
    },
  },
  deer: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.3,
    retargetIntervalMs: 3000, retargetChance: 0.3, fleeHpRatio: 0.5, canFlee: true,
    voices: {
      acquire: ['The deer snorts and paws the ground.'],
      flee: ['The deer bounds away in panic.'],
      death: [],
    },
    abilities: { fleeSpeed: 4 },
  },
  boar: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.6,
    retargetIntervalMs: 4000, retargetChance: 0.15, fleeHpRatio: 0.25, canFlee: true,
    voices: {
      acquire: ['The boar snorts and charges!'],
      flee: ['The boar squeals and flees.'],
      death: [],
    },
  },
  badger: {
    preferredRange: 4, rangedPreferredRange: 14, standChance: 0.7,
    retargetIntervalMs: 5000, retargetChance: 0.1, fleeHpRatio: 0.2, canFlee: true,
    voices: {
      acquire: ['The badger bares its teeth and stands its ground.'],
      flee: ['The badger scurries off into the brush.'],
      death: [],
    },
  },
};

/**
 * Behavior block for a creature kind (case-insensitive). Unknown kinds
 * get the default block. BUILD 943: the returned block always carries
 * FULLY RESOLVED abilities (overrides filled from engine defaults),
 * so callers never see an undefined abilities field — an unassigned
 * kind resolves to DEFAULT_ABILITIES and behaves exactly as before.
 */
export function behaviorForCreature(kind: string | undefined): CreatureBehavior & { abilities: CreatureAbilities } {
  const base = !kind ? DEFAULT_BEHAVIOR : (BEHAVIOR_TABLE[kind.toLowerCase()] ?? DEFAULT_BEHAVIOR);
  return { ...base, abilities: resolveAbilities(base.abilities) };
}

/** All shipped kind keys (for sweeps asserting table invariants). */
export function behaviorKindKeys(): string[] {
  return Object.keys(BEHAVIOR_TABLE);
}

/**
 * Effective fight range for one creature instance. Ranged instances hold
 * the ranged band; melee instances hold the melee range. Callers pass
 * the ranged flag from the creature's own spawn state — the block never
 * overrides it.
 */
export function preferredRangeFor(behavior: CreatureBehavior, ranged: boolean): number {
  return ranged ? behavior.rangedPreferredRange : behavior.preferredRange;
}

/** Should this creature hold its ground this chase bucket (staticattack)? */
export function shouldStand(behavior: CreatureBehavior, key: string, nowMs: number): boolean {
  return hashRoll(key, Math.floor(nowMs / BEHAVIOR_STAND_BUCKET_MS)) < behavior.standChance;
}

/**
 * Should a locked creature re-evaluate its target right now? False
 * before the interval elapses; at/after it, true only on a won roll.
 * A failed roll still consumes the interval (the next chance is one
 * interval later), matching targetchange cadence.
 */
export function shouldRetarget(
  behavior: CreatureBehavior,
  key: string,
  nowMs: number,
  lastRetargetMs: number,
): boolean {
  if (nowMs - lastRetargetMs < behavior.retargetIntervalMs) return false;
  return hashRoll(key, Math.floor(nowMs / behavior.retargetIntervalMs)) < behavior.retargetChance;
}

/** Flee predicate: at-or-below the block's threshold, and only if the block allows flight. */
export function isBehaviorFleeing(behavior: CreatureBehavior, hp: number, maxHp: number): boolean {
  return behavior.canFlee && maxHp > 0 && hp / maxHp <= behavior.fleeHpRatio;
}

/** Deterministic voice pick for one transition (stable per creature + event). Null when the list is empty. */
export function voiceLine(lines: string[], key: string, event: 'acquire' | 'flee' | 'death'): string | null {
  if (lines.length === 0) return null;
  return lines[hashIndex(key + ':' + event, lines.length)];
}
