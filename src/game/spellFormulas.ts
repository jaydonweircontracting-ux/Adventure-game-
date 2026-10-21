// BUILD 942: EQEmu portable item 4 — spell formula grammar + stacking
// resolution (RULES ONLY, original TypeScript; no EQ names, spells, or
// data). Ported from the numbered grammar in the EQEmu analysis:
// every spell effect is (base, max, formula) and its value is computed
// from a scaling input (caster level by default) by formula id.
//
// Formula table (analysis §(c)4):
//   0, 100  -> base
//   60, 70  -> base / 100 (integer division)
//   101     -> base + level / 2
//   102     -> base + level
//   103     -> base + level * 2
//   104     -> base + level * 3
//   105     -> base + level * 4
//   107-109 -> degenerating over elapsed tics: base - ticdif,
//              base - 2 * ticdif, base - 3 * ticdif
//   119     -> base + level / 8  (0x77 in the analysis)
//   1-99    -> base + level * formula (all other ids in range)
//
// Down-growth sign rule, stated plainly: when max < base (and max is
// not 0), the spell grows DOWNWARD — the level-scaled increment is
// SUBTRACTED from base instead of added, and max acts as the FLOOR
// (the value never drops below it) instead of the ceiling. The rule
// applies only to level-scaled forms (101-105, 119, generic 1-99):
// flat (0/100), base/100 (60/70), and degenerating (107-109) forms
// already have a fixed direction, so the sign rule never flips them.
// When max is 0 there is no cap at all.
//
// Buff durations use the same numbered grammar (the analysis names a
// separate duration table without enumerating it, so this game mirrors
// the value grammar for durations — flat and level-scaled forms only,
// since a duration has no elapsed tics at cast time). Units are
// caller-defined: dungeon effects count tics, real-time effects count
// seconds.
//
// Stacking is resolved by slot arithmetic (analysis §(c)4): stacking
// formula ids >= 201 encode a slot as (formula - 201). A new buff
// that names an occupied slot either overwrites the occupant or is
// blocked by it, per the incoming buff's stacking mode; re-casting
// the SAME buff always refreshes it instead of stacking a second
// copy. Different slots coexist.

export interface SpellEffectDef {
  /** Flat value the formula starts from. */
  base: number;
  /** Cap: ceiling for upward spells, floor for downward spells, 0/undefined = no cap. */
  max?: number;
  /** Numbered formula id from the table above. */
  formula: number;
  /**
   * Which caster value feeds the formula's level slot. Default
   * 'level'. 'intellect' exists because Ember Bolt's live value is
   * 7 + intellect — its formula (102, base + input) reproduces the
   * old number exactly only when the input is intellect.
   */
  scale?: 'level' | 'intellect';
}

export interface SpellValueInput {
  def: SpellEffectDef;
  /** Caster level (the formula's level slot when scale is 'level'). */
  level: number;
  /** Caster intellect (used only when def.scale is 'intellect'). */
  intellect?: number;
  /** Elapsed tics, for degenerating formulas 107-109. Default 0. */
  ticsElapsed?: number;
}

function isLevelScaledFormula(formula: number): boolean {
  if (formula === 101 || formula === 102 || formula === 103 || formula === 104 || formula === 105) return true;
  if (formula === 119) return true;
  return formula >= 1 && formula <= 99 && formula !== 60 && formula !== 70;
}

export function calcSpellEffectValue(input: SpellValueInput): number {
  const { def, level } = input;
  const scaling = def.scale === 'intellect' ? (input.intellect ?? level) : level;
  const tics = input.ticsElapsed ?? 0;
  let raw: number;
  switch (def.formula) {
    case 0:
    case 100:
      raw = def.base;
      break;
    case 60:
    case 70:
      raw = Math.floor(def.base / 100);
      break;
    case 101:
      raw = def.base + Math.floor(scaling / 2);
      break;
    case 102:
      raw = def.base + scaling;
      break;
    case 103:
      raw = def.base + scaling * 2;
      break;
    case 104:
      raw = def.base + scaling * 3;
      break;
    case 105:
      raw = def.base + scaling * 4;
      break;
    case 107:
      raw = def.base - tics;
      break;
    case 108:
      raw = def.base - 2 * tics;
      break;
    case 109:
      raw = def.base - 3 * tics;
      break;
    case 119:
      raw = def.base + Math.floor(scaling / 8);
      break;
    default:
      // Generic 1-99 form (per the analysis's code comment).
      raw = def.base + scaling * def.formula;
      break;
  }
  const max = def.max ?? 0;
  if (max === 0) return raw;
  // Down-growth sign rule (level-scaled forms only): mirror the
  // increment downward and treat max as the floor.
  if (max < def.base && isLevelScaledFormula(def.formula)) {
    return Math.max(def.base - (raw - def.base), max);
  }
  return Math.min(raw, max);
}

export interface BuffDurationDef {
  base: number;
  formula: number;
}

/** Duration in caller-defined units (tics or seconds) for a buff. */
export function calcBuffDuration(def: BuffDurationDef, level: number): number {
  switch (def.formula) {
    case 0:
    case 100:
      return def.base;
    case 60:
    case 70:
      return Math.floor(def.base / 100);
    case 101:
      return def.base + Math.floor(level / 2);
    case 102:
      return def.base + level;
    case 103:
      return def.base + level * 2;
    case 104:
      return def.base + level * 3;
    case 105:
      return def.base + level * 4;
    case 119:
      return def.base + Math.floor(level / 8);
    default:
      return def.base + level * def.formula;
  }
}

/** A buff's stacking identity: slot (from formula - 201) + mode. */
export interface BuffDefinition {
  id: string;
  /** Stacking formula id (>= 201); slot = formula - 201. */
  stackingFormula: number;
  /** What happens when a DIFFERENT buff already occupies this slot. */
  stacking: 'overwrite' | 'block';
}

export interface ActiveBuff {
  id: string;
  slot: number;
}

/** Slot index encoded by a stacking formula id. Throws below 201. */
export function slotFromStackingFormula(formula: number): number {
  if (formula < 201) throw new Error(`stacking formula ${formula} is below 201`);
  return formula - 201;
}

export type StackOutcome =
  | { action: 'apply'; replacesId: string | null }
  | { action: 'refresh' }
  | { action: 'blocked'; blockedBy: string };

/**
 * Resolve a new buff against the active set. Same buff id refreshes
 * (never stacks twice). A different buff in the same slot is either
 * overwritten (incoming mode 'overwrite') or blocks the incoming
 * buff (mode 'block'). Different slots always coexist.
 */
export function resolveBuffStack(existing: ActiveBuff[], incoming: BuffDefinition): StackOutcome {
  if (existing.some((buff) => buff.id === incoming.id)) return { action: 'refresh' };
  const slot = slotFromStackingFormula(incoming.stackingFormula);
  const occupant = existing.find((buff) => buff.slot === slot);
  if (!occupant) return { action: 'apply', replacesId: null };
  if (incoming.stacking === 'overwrite') return { action: 'apply', replacesId: occupant.id };
  return { action: 'blocked', blockedBy: occupant.id };
}
