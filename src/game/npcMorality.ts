import type { Townsperson } from './townsfolk';
import { townsfolkHash, damageNpc } from './townsfolk';

/**
 * BUILD 923: NPC morality levels.
 *
 * Audit result that shapes this whole module: there is NO NPC-vs-NPC
 * lethal initiation path in the game today. Every damageNpc() caller is
 * a player attack; every damageNpcByCreature() caller is a creature
 * attack; the retaliation loop only ever damages the player or a
 * creature; guard pursuit/arrest targets the player (or jail, not
 * death); and BUILD 880 NPC crime is non-lethal theft only. The NPC
 * deaths a player sees are player kills and creature kills — both
 * explicitly OUTSIDE this gate (player morality is not this system;
 * creatures aren't moral agents).
 *
 * So this module is the guarantee, enforced at the canonical seam:
 * morality is assigned per NPC, the initiation predicate decides who
 * may ever start a lethal fight with another NPC, and
 * damageNpcByNpc() is the one entry point any NPC-attacker damage must
 * route through — the gate runs BEFORE any swing, damage, fight-back
 * trigger, bounty, or crime record. Any future NPC-vs-NPC attack path
 * that bypasses this function bypasses the gate by construction, which
 * is why the function exists even though no live caller needs it yet.
 *
 * Morality is purely derived from seed + archetype (like personality in
 * villageLife.ts): stable across save/load with zero migration and no
 * new stored fields — an NPC can never flip from law-abiding to
 * murderous because of a reload.
 */

/** At or above this morality, an NPC NEVER initiates lethal aggression. */
export const MORALITY_LETHAL_THRESHOLD = 40;

/** Archetype base morality (0..100). Guards and priests anchor the top. */
export const MORALITY_BASE: Record<Townsperson['archetype'], number> = {
  guard: 88,
  priest: 92,
  merchant: 72,
  farmer: 74,
  smith: 70,
  commoner: 70,
  child: 95,
};

/** Fraction of eligible adults who roll into the low-morality tail. */
export const MORALITY_LOW_TAIL_RATE = 0.05;

/**
 * Morality score 0..100 for an NPC. Deterministic: same npc → same
 * score, forever. Archetype base ±12 per-NPC variation, except a small
 * deterministic low tail (5% of eligible adults land at 10..34) — the
 * criminal exception. Guards, priests, and children never roll low.
 */
export function npcMorality(npc: Townsperson): number {
  const base = MORALITY_BASE[npc.archetype] ?? 70;
  if (npc.archetype === 'guard' || npc.archetype === 'priest' || npc.archetype === 'child') {
    return Math.max(0, Math.min(100, base + Math.round((townsfolkHash(npc.seed, 9301) - 0.5) * 24)));
  }
  if (npc.age === 'child') return 95;
  if (townsfolkHash(npc.seed, 9302) < MORALITY_LOW_TAIL_RATE) {
    return 10 + Math.floor(townsfolkHash(npc.seed, 9303) * 25);
  }
  return Math.max(0, Math.min(100, base + Math.round((townsfolkHash(npc.seed, 9301) - 0.5) * 24)));
}

/**
 * Whether this NPC may INITIATE lethal aggression against another NPC.
 * False for children, guards, and priests unconditionally, and for every
 * NPC at or above the threshold. True only for the low-morality tail.
 * This gates initiation only — it says nothing about self-defense,
 * guard duty, or creature fights, which never consult it.
 */
export function mayInitiateLethalAggression(npc: Townsperson): boolean {
  if (npc.archetype === 'guard' || npc.archetype === 'priest' || npc.archetype === 'child') return false;
  if (npc.age === 'child') return false;
  return npcMorality(npc) < MORALITY_LETHAL_THRESHOLD;
}

/** Flavor tier for the Examine line — a character hint, not a number dump. */
export function moralityTier(npc: Townsperson): 'upstanding' | 'law-abiding' | 'unsettled' | 'dangerous' | 'young' {
  if (npc.archetype === 'child' || npc.age === 'child') return 'young';
  const m = npcMorality(npc);
  if (m >= 80) return 'upstanding';
  if (m >= 55) return 'law-abiding';
  if (m >= MORALITY_LETHAL_THRESHOLD) return 'unsettled';
  return 'dangerous';
}

/** One Examine sentence describing the NPC's character. */
export function moralityLine(npc: Townsperson): string {
  switch (moralityTier(npc)) {
    case 'young': return 'Young, and still learning right from wrong.';
    case 'upstanding': return 'They are known around town as an upstanding sort.';
    case 'law-abiding': return 'A law-abiding sort, by all accounts.';
    case 'unsettled': return 'They keep their own counsel, but folk generally trust them.';
    case 'dangerous': return 'There is something unsettled about them — folk keep an eye out when they pass.';
  }
}

export type NpcAttackResult = {
  /** Victim after the attempt — the SAME object when the gate blocked it. */
  victim: Townsperson;
  /** True when morality refused the attack before anything happened. */
  blocked: boolean;
};

/**
 * THE canonical entry point for NPC-on-NPC damage. The morality gate
 * runs first: a blocked attacker leaves the victim byte-identical — no
 * HP loss, no fight-back trigger, no flee, no death, no crime record.
 * An allowed (low-morality) attacker flows through the normal
 * damageNpc path, so the victim's fight-or-flee response — self-defense
 * — works exactly as it does against player attacks. Callers pass the
 * attacker's live position as `from` so a fighting victim chases the
 * attacker, not some stale point.
 */
export function damageNpcByNpc(
  attacker: Townsperson,
  victim: Townsperson,
  damage: number,
  from: { x: number; y: number },
  tick: number,
): NpcAttackResult {
  if (!mayInitiateLethalAggression(attacker)) {
    return { victim, blocked: true };
  }
  return { victim: damageNpc(victim, damage, from, tick), blocked: false };
}
