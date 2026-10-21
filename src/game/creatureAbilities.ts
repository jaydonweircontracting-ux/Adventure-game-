/**
 * BUILD 943: special-ability vocabulary (EQEmu portable item 5 of 5).
 *
 * Adapted from the EQEmu ability grammar
 * (~/workspace/rea-targets/eqemu/ANALYSIS.md §(c)3): every NPC can carry
 * a list of (ability_id, params[]) pairs drawn from a fixed vocabulary.
 * The RULES only, never EQ content, names, or code — and this is an
 * EXTENSION of the Tibia behavior blocks (BUILD 934), not a second
 * creature-data system: abilities live as one field on the existing
 * per-kind behavior block (creatureBehavior.ts), resolved here to full
 * values with engine defaults. The 934 blocks stay intact; nothing
 * below rewrites them.
 *
 * IMPLEMENTED (each wired into an existing path, nothing invented):
 * - Multi-strike modes Flurry/Triple/Quad: extra strikes as extra
 *   rolls in the existing attack-hit path (App loops). Each strike is
 *   mitigated separately through the 935 pipeline; the combat text
 *   shows the total with a strike marker ("-12 x3"). Melee only:
 *   archer volleys stay single arrows.
 * - Enrage: below an HP ratio, damage multiplies and chase speed
 *   multiplies, both through existing paths (damage number in the
 *   App loops, chase speed via an updateGoat option). Enrage is
 *   derived from current HP every frame — no new saved state — and
 *   the combat text marks enraged hits ("RAGE"). Enrage windows sit
 *   ABOVE the kind's 934 flee threshold by construction (asserted in
 *   the sweep): between the two thresholds the creature fights
 *   enraged; below the flee threshold it still flees — enrage never
 *   disables flight, and a kind whose enrage ratio equaled its flee
 *   ratio would never show enrage at all.
 * - Leash / acquire / chase overrides: per-kind replacements for the
 *   global 915 ranges (leash 36, acquire 24, chase 24), threaded
 *   through chooseCreatureTarget's new optional parameters and the
 *   existing chase gate. Invariant: leash >= acquire for every kind
 *   (asserted in the sweep), so a creature never acquires a victim
 *   it instantly drops.
 * - Tether: a post-move clamp tightening the spawn home-range rule —
 *   a tethered creature's final position is pulled back inside the
 *   tether radius from its spawn. It can only TIGHTEN the spawn
 *   roamRadius, never loosen it (updateGoat already clamped to
 *   roamRadius first).
 * - Aggro immunities, only for triggers the engine actually has:
 *   ignoreNpcVictims (town acquisition filters NPC candidates out —
 *   the creature hunts the player only) and sneakBlind (no FRESH
 *   engagement of a sneaking player; a held engagement is never
 *   dropped, mirroring the 933 sneak rule). Both are pure decisions
 *   in the App loops / acquisition call, tested standalone.
 * - Flee speed: per-kind override of the 2 u/s flee speed in the
 *   existing flee branch (934 threshold + capability untouched).
 *
 * NOT BUILT, with the reason (stated, not faked):
 * - Rampage / Area Rampage: the engine has no multi-target melee —
 *   every melee hit and every arrow has exactly one victim. There is
 *   no multi-target path to wire Rampage into.
 * - Summon, Dual Wield, Bane Attack: no summon system, no off-hand
 *   system, no bane damage type exists to attach these to.
 * - Magical Attack as a mode: already covered by the 935 attackElement
 *   mechanism (dragon fire) — not a second implementation of it.
 * - Effect immunities (Slow, Mesmerize, Charm, Stun, Snare, Fear,
 *   Dispell, Taunt, Pacify, Feign Death, Memory Fade, ...): the
 *   overworld has NO such effects — nothing slows, stuns, snares,
 *   fears, or charms anything outside the dungeon, and the dungeon
 *   is a separate engine. The slot is defined on the type and
 *   asserted empty for every kind, so a future effect lands in one
 *   place instead of a new table.
 * - Always Flee / Flee Percent as new knobs: already expressible
 *   with the 934 knobs (fleeHpRatio 1.0 = always flees; any other
 *   percent = the flee threshold). No duplicate parameter.
 * - Casting Resist / Avoid modifiers: no spell-casting against
 *   field creatures and no avoidance mechanic exist overworld.
 * - Aggro immunities to triggers that do not exist (taunt, pacify,
 *   feign death, memory fade, client/NPC/bot damage splits): the
 *   engine has proximity acquisition, damage provocation, and sneak
 *   detection — immunities cover those, nothing else.
 *
 * No base HP/ATK/ARM stat is rebalanced: ability effects are stated
 * separately from base stats, and unassigned kinds behave exactly
 * as before (all overrides default to the engine constants).
 */

import type { CombatPoint } from './combat';
import { CREATURE_LEASH_RANGE, CREATURE_ACQUIRE_RANGE } from './creatureCombat';
import { GOAT_CHASE_RANGE, GOAT_FLEE_SPEED, GOAT_CHASE_SPEED } from './ai';

/** Multi-strike modes that fit the existing single-hit attack path. */
export type MultiStrikeMode = 'none' | 'flurry' | 'triple' | 'quad';

/**
 * Full per-kind ability set. Behavior blocks carry PARTIAL overrides
 * (CreatureBehavior.abilities); resolveAbilities fills the rest from
 * DEFAULT_ABILITIES, so an unassigned kind is byte-identical in
 * behavior to before this build.
 */
export type CreatureAbilities = {
  /** Extra-strike mode for melee attack hits ('none' = one strike). */
  multiStrike: MultiStrikeMode;
  /** Enrage at-or-below this HP fraction (0 = never enrages). */
  enrageHpRatio: number;
  /** Damage multiplier while enraged (1 = no effect). */
  enrageDamageMult: number;
  /** Chase-speed multiplier while enraged (1 = no effect). */
  enrageSpeedMult: number;
  /** Lock-hold distance override (global: CREATURE_LEASH_RANGE). */
  leashRange: number;
  /** Fresh-acquisition distance override (global: CREATURE_ACQUIRE_RANGE). */
  acquireRange: number;
  /** Chase-gate distance override (global: GOAT_CHASE_RANGE). */
  chaseRange: number;
  /** Tether radius from spawn for the post-move clamp (0 = no tether). */
  tetherRadius: number;
  /** Town acquisition ignores townsfolk victims (player only). */
  ignoreNpcVictims: boolean;
  /** No fresh engagement of a sneaking player (held fights unaffected). */
  sneakBlind: boolean;
  /** Flee speed override (global: GOAT_FLEE_SPEED). */
  fleeSpeed: number;
  /** Effect immunities — defined but EMPTY: no overworld effects exist. */
  effectImmunities: string[];
};

/** Engine defaults: an unassigned kind behaves exactly as before 943. */
export const DEFAULT_ABILITIES: CreatureAbilities = {
  multiStrike: 'none',
  enrageHpRatio: 0,
  enrageDamageMult: 1,
  enrageSpeedMult: 1,
  leashRange: CREATURE_LEASH_RANGE,
  acquireRange: CREATURE_ACQUIRE_RANGE,
  chaseRange: GOAT_CHASE_RANGE,
  tetherRadius: 0,
  ignoreNpcVictims: false,
  sneakBlind: false,
  fleeSpeed: GOAT_FLEE_SPEED,
  effectImmunities: [],
};

/** Fill a behavior block's partial ability overrides with engine defaults. */
export function resolveAbilities(partial?: Partial<CreatureAbilities>): CreatureAbilities {
  return {
    ...DEFAULT_ABILITIES,
    ...partial,
    effectImmunities: [...(partial?.effectImmunities ?? [])],
  };
}

/** Total melee strikes for one attack hit (1 when no multi-strike mode). */
export function multiStrikeCount(abilities: CreatureAbilities): number {
  switch (abilities.multiStrike) {
    case 'flurry': return 2;
    case 'triple': return 3;
    case 'quad': return 4;
    default: return 1;
  }
}

/** Enrage predicate: at-or-below the kind's HP ratio (0 = never). */
export function isEnraged(abilities: CreatureAbilities, hp: number, maxHp: number): boolean {
  return abilities.enrageHpRatio > 0 && maxHp > 0 && hp / maxHp <= abilities.enrageHpRatio;
}

/** Damage multiplier for this hit (1 when not enraged). */
export function enragedDamageMult(abilities: CreatureAbilities, hp: number, maxHp: number): number {
  return isEnraged(abilities, hp, maxHp) ? abilities.enrageDamageMult : 1;
}

/**
 * Chase speed while enraged (undefined = the engine default — the
 * caller passes it through only when defined, so a non-enraged
 * creature's movement code path is untouched).
 */
export function enragedChaseSpeed(abilities: CreatureAbilities, hp: number, maxHp: number): number | undefined {
  return isEnraged(abilities, hp, maxHp) ? GOAT_CHASE_SPEED * abilities.enrageSpeedMult : undefined;
}

/**
 * Should this creature's engagement be suppressed right now? True
 * only for a sneak-blind kind facing a sneaking player it is not
 * already fighting — held engagements are never suppressed.
 */
export function suppressForSneakBlind(
  abilities: CreatureAbilities,
  opts: { sneaking: boolean; engagedOnPlayer: boolean; targetIsPlayer: boolean },
): boolean {
  return opts.targetIsPlayer && abilities.sneakBlind && opts.sneaking && !opts.engagedOnPlayer;
}

/**
 * Tether clamp: pull a final position back inside tetherRadius of
 * the spawn anchor. Returns the input position unchanged (same
 * reference) when there is no tether, no spawn, or the position is
 * already inside — so callers can skip the blocked-tile recheck.
 */
export function clampToTether(
  position: CombatPoint,
  spawn: CombatPoint | undefined,
  tetherRadius: number,
): CombatPoint {
  if (!spawn || !tetherRadius || tetherRadius <= 0) return position;
  const dx = position.x - spawn.x;
  const dy = position.y - spawn.y;
  const d = Math.hypot(dx, dy);
  if (d <= tetherRadius) return position;
  const scale = tetherRadius / d;
  return { x: spawn.x + dx * scale, y: spawn.y + dy * scale };
}
