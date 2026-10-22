// BUILD 973: hate-list dual track (combat extras 5/6).
//
// Portable kernel only, from the EQEmu analysis (§(c)2): each attacker on
// a creature carries TWO separate numbers — damage actually dealt and
// hate (threat). XP follows the DAMAGE top, not the hate top. No EQ
// names, items, or content are used; this module is original TypeScript
// written against this game's own combat shape.
//
// Audit result that makes this a real addition, not decoration: until
// now this game had NO threat memory at all. Creature targeting is a
// single nearest-victim lock (creatureCombat.ts), and kill XP required
// the PLAYER to land the killing blow — applyPlayerHitToCreature grants
// XP on defeat while applyNpcHitToCreature explicitly grants nothing.
// So a joint fight where the player dealt most of the damage but an
// NPC landed the final blow paid zero XP, and a creature that lost its
// victim always re-acquired the nearest bystander, never the attacker
// who had hurt it most. Both change with this ledger:
//
// - On any creature defeat, if the PLAYER is the top DAMAGE dealer on
//   that creature's ledger, the player earns the normal kill XP — even
//   when an NPC landed the killing blow. If an NPC dealt the most
//   damage, still no XP (the 915 rule survives: you did not do the
//   work). Quest kill credit and codex kills stay player-kill-only;
//   only XP follows damage.
// - On fresh acquisition (no held lock), a creature picks its top-HATE
//   victim in range instead of the nearest one. Lock-hold and lock-
//   steal rules in creatureCombat.ts are untouched: hate only decides
//   who a targetless creature goes for next.
//
// Why the two numbers differ here: hate = damage + a flat first-strike
// (provoke) bonus. The attacker who struck first holds extra hate even
// if another attacker later out-damages them — so top-hate and
// top-damage are genuinely different attackers in real fights.
//
// The ledger is TRANSIENT combat state (a ref in App.tsx, never saved):
// creatures respawn and fights end, so nothing here needs migration and
// old saves load unchanged. Entries go stale after HATE_STALE_MS without
// a hit (the EQ 600 s pruning rule, in ms) and are dropped on record;
// a defeated creature's ledger is cleared outright by the caller.

/** Attacker key: 'player' for the player, otherwise the townsfolk id. */
export type HateAttackerId = string;

export type HateEntry = {
  /** Actual damage dealt to this creature. XP follows this number. */
  damage: number;
  /** Threat: damage + first-strike bonus. Target selection follows this. */
  hate: number;
  /** Wall-clock ms of the attacker's most recent hit (stale pruning). */
  lastHitMs: number;
};

/** One creature's ledger: attacker id -> entry. Plain data, clone-safe. */
export type HateLedger = Record<string, HateEntry>;

/** Flat hate bonus for an attacker's FIRST hit on a creature. */
export const PROVOKE_HATE = 5;

/** Entries untouched this long are stale and pruned (EQ: 600 s). */
export const HATE_STALE_MS = 600_000;

/** The player attacker key. NPC attackers use their townsfolk id. */
export const PLAYER_HATE_ATTACKER = 'player';

function pruned(ledger: HateLedger, nowMs: number): HateLedger {
  const out: HateLedger = {};
  for (const [id, entry] of Object.entries(ledger)) {
    if (nowMs - entry.lastHitMs <= HATE_STALE_MS) out[id] = entry;
  }
  return out;
}

/**
 * Record a hit: damage adds to BOTH tracks; a first hit from this
 * attacker also adds the flat provoke bonus to hate only. Zero or
 * negative damage (blocked swings) records nothing — a swing that
 * dealt nothing earns neither damage credit nor hate. Returns a new
 * ledger (stale entries pruned as a side effect of the write).
 */
export function recordHateDamage(
  ledger: HateLedger,
  attacker: HateAttackerId,
  damage: number,
  nowMs: number,
): HateLedger {
  if (damage <= 0) return ledger;
  const fresh = pruned(ledger, nowMs);
  const prev = fresh[attacker];
  fresh[attacker] = {
    damage: (prev?.damage ?? 0) + damage,
    hate: (prev?.hate ?? 0) + damage + (prev ? 0 : PROVOKE_HATE),
    lastHitMs: nowMs,
  };
  return fresh;
}

/** Highest damage dealer, or null when nobody has dealt damage. */
export function topDamageAttacker(ledger: HateLedger): HateAttackerId | null {
  let best: HateAttackerId | null = null;
  let bestDamage = 0;
  for (const [id, entry] of Object.entries(ledger)) {
    if (entry.damage > bestDamage) {
      best = id;
      bestDamage = entry.damage;
    }
  }
  return best;
}

/** Highest hate holder, or null when the ledger is empty. */
export function topHateAttacker(ledger: HateLedger): HateAttackerId | null {
  let best: HateAttackerId | null = null;
  let bestHate = -Infinity;
  for (const [id, entry] of Object.entries(ledger)) {
    if (entry.hate > bestHate) {
      best = id;
      bestHate = entry.hate;
    }
  }
  return best;
}

/**
 * Rank function for fresh acquisition: lower rank = more hate. Ties
 * break by damage, then attacker id (deterministic). Attackers with no
 * entry rank Infinity (never preferred over a recorded attacker).
 * The caller (creatureCombat.ts) only consults this when no lock is
 * held, so lock stability is untouched.
 */
export function hateRankFor(ledger: HateLedger): (attacker: HateAttackerId) => number {
  const ranked = Object.entries(ledger)
    .sort((a, b) => b[1].hate - a[1].hate || b[1].damage - a[1].damage || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
  const rank = new Map(ranked.map((id, i) => [id, i]));
  return (attacker: HateAttackerId) => rank.get(attacker) ?? Infinity;
}

/** True when the player dealt the most damage on this ledger. */
export function playerTopDamage(ledger: HateLedger): boolean {
  return topDamageAttacker(ledger) === PLAYER_HATE_ATTACKER;
}
