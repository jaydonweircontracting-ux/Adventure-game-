/**
 * BUILD 958 — Classes at level 10.
 *
 * HONEST SCOPE, stated up front: a class-choice UI already existed (the
 * legacy town-NPC dialogue offered Warrior / Mage / Rogue at level 10),
 * but the chosen class did NOTHING — playerClass was written, saved and
 * loaded, and never read for combat, stats, or spells. The legacy text
 * even promised a boat-route unlock that does not exist (the ocean edge
 * is reserved for a future boat route; see App.tsx). This module makes
 * classes real, adds the missing Archer, and moves class granting to
 * dedicated teacher NPCs. Nothing here invents a new stat system: every
 * class effect lands in an EXISTING slot (AA damage/crit bonuses, the
 * 935 mitigation pipeline, the 932 stealth multiplier, bow damage).
 *
 * Roster: Beginner (no class yet) + Warrior / Mage / Rogue / Archer.
 * One class at a time. Changing class is free, any time after level 10,
 * through any teacher — no cost, no new currency, no quest gate.
 *
 * Old saves: class stays exactly what the save says. A save that reads
 * Beginner at level 10 or above is NEVER silently auto-assigned — the
 * player keeps the choice and the teachers offer it on next load.
 *
 * Spells: the 942 formula grammar (spellBook in stoneSoupEngine.ts) stays
 * the SINGLE source of spell numbers. This module only re-exports those
 * numbers for the overworld and adds overworld-only rules (range in field
 * units, nearest-target selection). The dungeon engine is untouched, and
 * an overworld class never grants dungeon spells (dungeon
 * GameState.player.spells is separate engine state).
 *
 * Mana: the overworld had no mana (dungeon players have mp; overworld
 * players did not). maxMana = 10 + int x 2 is a trivial derived resource
 * from the EXISTING int stat — not a new stat system. It regenerates
 * 1 per 10 real seconds and persists in the save as an optional field
 * (old saves load with FULL mana, never 0).
 *
 * Teachers: Dain (Warrior), Sable (Mage), Puck (Rogue), Wynn (Archer).
 * They are townsfolk with archetype 'teacher': at the Wayfarer Guild
 * doorstep by day, wandering to the Rusty Tankard in the evening, and
 * indoors at the guild point overnight (see townsfolkTarget). They are
 * FIELD NPCs at exteriors — interior entry is dead in current builds
 * (the 957 gap), so no teacher waits inside an interior.
 *
 * Effect frames: sliced from the user's RPG Effect All Free.zip
 * (Free/Part 16-36, NO license file in the archive — no license terms
 * are claimed anywhere). Each source PNG is a 64px grid: rows are color
 * variants, columns are animation stages. Shipped frames (8 per spell,
 * 24 total, public/sprites/spell-effects/):
 * - ember-bolt: Part 16 file 777.png, row 0 (orange fire burst).
 * - frost-ward: Part 32 file 1584.png, row 2 (cyan rings), 8 stages
 *   sampled evenly across the sheet's 14 columns.
 * - veil-step: Part 33 file 1627.png, row 1 (purple crescents), 8 stages
 *   sampled evenly across the sheet's 14 columns.
 * No other part is shipped; no effect is faked with an unrelated part.
 */

import { spellBook } from './stoneSoupEngine';
import { calcSpellEffectValue } from './spellFormulas';

/** Player class values, identical to App.tsx's PlayerClass union. */
export type GameClass = 'Beginner' | 'Warrior' | 'Mage' | 'Rogue' | 'Archer';

export const CLASS_IDS: Exclude<GameClass, 'Beginner'>[] = ['Warrior', 'Mage', 'Rogue', 'Archer'];

/** Exact shipped effect text — the UI shows these words, the code does these things. */
export const CLASS_DESCRIPTIONS: Record<Exclude<GameClass, 'Beginner'>, string> = {
  Warrior: '+2 damage on every melee hit.',
  Mage: 'Casts spells: Ember Bolt, Veil Step, Frost Ward.',
  Rogue: '+5% critical chance, and stealth attacks deal x3 instead of x2.',
  Archer: 'Arrows deal 25% more damage.',
};

/** Per-class combat bonuses, applied into EXISTING slots at the call sites. */
export function classDamageBonus(playerClass: GameClass): number {
  return playerClass === 'Warrior' ? 2 : 0;
}

export function classCritBonus(playerClass: GameClass): number {
  return playerClass === 'Rogue' ? 0.05 : 0;
}

/** Stealth multiplier: the 932 base is x2; rogues strike at x3. */
export function classStealthMultiplier(playerClass: GameClass): number {
  return playerClass === 'Rogue' ? 3 : 2;
}

export function classArrowMultiplier(playerClass: GameClass): number {
  return playerClass === 'Archer' ? 1.25 : 1;
}

// ---------------------------------------------------------------------------
// Teachers
// ---------------------------------------------------------------------------

/** Teacher NPC ids — the four appended townsfolk (roster order preserved). */
export const TEACHER_CLASS_BY_ID: Record<string, Exclude<GameClass, 'Beginner'>> = {
  // Roster order preserved: the 38 original townsfolk occupy 0..37, so the
  // four appended teachers are 38..41. (An earlier draft said 40..43 —
  // wrong: the roster never had 40 originals, it had 38.)
  'townsfolk-38': 'Warrior',
  'townsfolk-39': 'Mage',
  'townsfolk-40': 'Rogue',
  'townsfolk-41': 'Archer',
};

/** Teacher names — a second key so a roster reorder can never orphan a teacher. */
export const TEACHER_CLASS_BY_NAME: Record<string, Exclude<GameClass, 'Beginner'>> = {
  Dain: 'Warrior',
  Sable: 'Mage',
  Puck: 'Rogue',
  Wynn: 'Archer',
};

export function teacherClassForNpc(npc: { id: string; name: string; archetype: string }): Exclude<GameClass, 'Beginner'> | null {
  if (npc.archetype !== 'teacher') return null;
  return TEACHER_CLASS_BY_ID[npc.id] ?? TEACHER_CLASS_BY_NAME[npc.name] ?? null;
}

// ---------------------------------------------------------------------------
// Mana (derived from the existing int stat)
// ---------------------------------------------------------------------------

export function maxManaForInt(intelligence: number): number {
  return 10 + Math.max(0, Math.floor(intelligence)) * 2;
}

export const MANA_REGEN_SECONDS = 10;

/** Old saves carry no mana field and load with FULL mana, never 0. */
export function sanitizePlayerMana(value: unknown, maxMana: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return maxMana;
  return Math.max(0, Math.min(maxMana, Math.floor(value)));
}

// ---------------------------------------------------------------------------
// Spells — numbers re-exported from the 942 spellBook, never restated.
// Overworld ids: ember-bolt and frost-ward match the dungeon ids; the
// dungeon's 'blink' is 'veil-step' overworld (same distance, same cost).
// ---------------------------------------------------------------------------

export type OverworldSpellId = 'ember-bolt' | 'veil-step' | 'frost-ward';

export interface OverworldSpellDef {
  id: OverworldSpellId;
  name: string;
  glyph: string;
  cost: number;
  /** Ember Bolt: field-unit range. Veil Step: blink distance. Ward: n/a. */
  range: number;
  description: string;
}

export const OVERWORLD_SPELLS: Record<OverworldSpellId, OverworldSpellDef> = {
  'ember-bolt': {
    id: 'ember-bolt',
    name: spellBook['ember-bolt'].name,
    glyph: spellBook['ember-bolt'].glyph,
    cost: spellBook['ember-bolt'].cost,
    // Non-null: the 942 spellBook defines these fields; a missing field
    // would be a 942 bug, and the standalone asserts verify the numbers.
    range: spellBook['ember-bolt'].formulas.range!.base,
    description: spellBook['ember-bolt'].description,
  },
  'veil-step': {
    id: 'veil-step',
    name: spellBook.blink.name,
    glyph: spellBook.blink.glyph,
    cost: spellBook.blink.cost,
    range: spellBook.blink.formulas.distance!.base,
    description: spellBook.blink.description,
  },
  'frost-ward': {
    id: 'frost-ward',
    name: spellBook['frost-ward'].name,
    glyph: spellBook['frost-ward'].glyph,
    cost: spellBook['frost-ward'].cost,
    range: 0,
    description: spellBook['frost-ward'].description,
  },
};

/** Ember Bolt raw damage via the 942 formula (7 + intellect, formula 102). */
export function emberBoltDamage(intelligence: number): number {
  return calcSpellEffectValue({
    def: spellBook['ember-bolt'].formulas.damage!,
    level: 1,
    intellect: intelligence,
  });
}

/** Frost Ward armor bonus (942: +3, overwrite, until the next wound). */
export function frostWardArmor(): number {
  return spellBook['frost-ward'].formulas.armor!.base;
}

/** Only Mages cast. Every other class — including Beginner — sees locked spells. */
export function spellsForClass(playerClass: GameClass): OverworldSpellId[] {
  return playerClass === 'Mage' ? ['ember-bolt', 'veil-step', 'frost-ward'] : [];
}

/** 8 shipped frames per spell, in animation order. */
export function spellFramesFor(spellId: OverworldSpellId): string[] {
  const frames: string[] = [];
  for (let i = 0; i < 8; i++) frames.push(`sprites/spell-effects/${spellId}-${i}.png`);
  return frames;
}

// ---------------------------------------------------------------------------
// Overworld targeting (pure; the App owns blocking, refs, and rendering)
// ---------------------------------------------------------------------------

/** Nearest candidate within range (Euclidean field units), or null. */
export function nearestSpellTarget<T extends { position: { x: number; y: number } }>(
  from: { x: number; y: number },
  candidates: T[],
  range: number,
): T | null {
  let best: T | null = null;
  let bestD = range;
  for (const c of candidates) {
    const d = Math.hypot(c.position.x - from.x, c.position.y - from.y);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Veil Step destination: exactly `distance` units in the facing direction. */
export function veilStepDestination(
  from: { x: number; y: number },
  facing: 'up' | 'down' | 'left' | 'right',
  distance: number,
): { x: number; y: number } {
  switch (facing) {
    case 'up': return { x: from.x, y: from.y - distance };
    case 'down': return { x: from.x, y: from.y + distance };
    case 'left': return { x: from.x - distance, y: from.y };
    case 'right': return { x: from.x + distance, y: from.y };
  }
}
