// BUILD 939: EQEmu faction ladder (portable item 1 of 5) — rules only,
// original TypeScript. Ported rule: standing is a number plus modifiers,
// and the effective value maps to one of nine named tiers. EQEmu source
// reference: common/faction.cpp CalculateFaction + ruletypes.h defaults
// (thresholds are server rules, not code logic).
//
//   effective = character_value + base + class_mod + race_mod + deity_mod
//
// ADAPTATIONS (stated, not hidden):
// - Factions are the game's landmark towns/villages (landmarks.ts), the
//   same key space as the BUILD 926 per-town bounty buckets. Every
//   landmark town/village gets a faction entry, but only Mosslight
//   Crossing has member NPCs today (the townsfolk roster), so only its
//   standing can move from player actions. Other factions sit at the
//   default (0, Indifferently) until a town gains member NPCs.
// - base is 0 for every faction (no authored faction base values exist).
// - class_mod / race_mod / deity_mod are DROPPED: NPCs carry archetypes
//   (farmer/merchant/guard/priest/smith/commoner/child), not EQ classes,
//   and the game has no races or deities. The per-NPC entry slot is
//   filled by an archetype modifier instead (see ARCHETYPE_MOD).
// - Standing is per-player, per-faction, and is SEPARATE from bounty
//   (926): bounty is gold owed from witnessed crimes, posted only when
//   a witness reaches a guard and cleared by jail/fine; standing moves
//   immediately on the player's own actions and is never copied from
//   or into a bounty bucket. One act (e.g. murder) can move both, each
//   by its own rules.
// - Tier-gated effects are NOT built: no shop-price, dialogue-lock,
//   guard-behavior, or combat changes tied to tiers. Tiers are display
//   + standing-driven (shown in dialogue/examine, moving from real
//   actions). Presenting a tier name as gameplay would be a fake feature.

/** Faction ids = landmark town/village names (landmarks.ts). */
export const FACTION_IDS: readonly string[] = [
  'Mosslight Crossing',
  'Fenmere Hamlet',
  'Ironwood Southhold',
  'Northwatch Beacon',
  'Old Mill',
  'Emberpeak Shrine',
  'Sunwash Port',
  'Bellwater',
  'Seabreak',
  'Blackroot Camp',
];

/** The one faction with member NPCs in the game today. */
export const MOSSLIGHT_FACTION = 'Mosslight Crossing';

/** Townsfolk archetypes (townsfolk.ts TownsfolkArchetype). */
export type FactionArchetype =
  | 'farmer'
  | 'merchant'
  | 'guard'
  | 'priest'
  | 'smith'
  | 'commoner'
  | 'child';

/**
 * Per-NPC entry, adapted from EQEmu's npc_faction_entries: the NPC's
 * personal offset toward the player, derived from archetype (EQEmu's
 * entries are authored per NPC; this game has no authored per-NPC
 * faction data, so the offset is archetype-driven and deterministic).
 * Guards start wary, priests and children welcoming, traders and
 * farmers mildly friendly, smiths and commoners neutral.
 */
export const ARCHETYPE_MOD: Record<FactionArchetype, number> = {
  guard: -25,
  priest: 25,
  merchant: 10,
  farmer: 10,
  smith: 0,
  commoner: 0,
  child: 25,
};

export function archetypeMod(archetype: string | undefined): number {
  if (!archetype) return 0;
  const key = archetype as FactionArchetype;
  return ARCHETYPE_MOD[key] ?? 0;
}

/** Faction of a townsfolk NPC: every townsfolk lives in Mosslight. */
export function factionForNpc(npc: { archetype?: string }): string {
  void npc;
  return MOSSLIGHT_FACTION;
}

/** EQEmu tier names, best standing first. */
export type FactionTier =
  | 'Ally'
  | 'Warmly'
  | 'Kindly'
  | 'Amiably'
  | 'Indifferently'
  | 'Apprehensively'
  | 'Dubiously'
  | 'Threateningly'
  | 'Scowls';

/** EQEmu default rule thresholds (ruletypes.h Faction*Minimum). */
export const FACTION_TIERS: readonly { tier: FactionTier; minimum: number }[] = [
  { tier: 'Ally', minimum: 1100 },
  { tier: 'Warmly', minimum: 750 },
  { tier: 'Kindly', minimum: 500 },
  { tier: 'Amiably', minimum: 100 },
  { tier: 'Indifferently', minimum: 0 },
  { tier: 'Apprehensively', minimum: -100 },
  { tier: 'Dubiously', minimum: -500 },
  { tier: 'Threateningly', minimum: -750 },
  { tier: 'Scowls', minimum: Number.NEGATIVE_INFINITY },
];

/** Tier for an effective standing value. Pure. */
export function tierForStanding(value: number): FactionTier {
  for (const entry of FACTION_TIERS) {
    if (value >= entry.minimum) return entry.tier;
  }
  return 'Scowls';
}

/**
 * Effective standing for one NPC: stored faction standing + faction
 * base (0) + the NPC's archetype entry. This is the value the tier
 * name is computed from, exactly as EQEmu's consider message uses the
 * effective value, not the raw character value.
 */
export function effectiveStanding(
  standing: number,
  archetype: string | undefined,
): number {
  return standing + archetypeMod(archetype);
}

/** Tier an NPC of this archetype shows for a stored faction standing. */
export function tierForNpc(
  standing: number,
  archetype: string | undefined,
): FactionTier {
  return tierForStanding(effectiveStanding(standing, archetype));
}

/** Stored standing for a faction (0 when never touched). Pure. */
export function standingFor(
  standings: Record<string, number>,
  factionId: string,
): number {
  const value = standings[factionId];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// ---- Standing movement: every action that moves standing, with deltas ----

/** Non-lethal player hit on a faction member. */
export const FACTION_HIT_DELTA = -10;
/** Player kill of a faction member (replaces the hit delta, not added). */
export const FACTION_KILL_DELTA = -100;
/** Completed quest given by a member of the faction. */
export const FACTION_QUEST_DELTA = 25;

/**
 * Apply a player harm event to one faction's standing. `killed` selects
 * the kill delta INSTEAD of the hit delta (no double-counting the blow
 * that killed). Pure — returns a new standings record.
 */
export function applyFactionHarm(
  standings: Record<string, number>,
  factionId: string,
  killed: boolean,
): Record<string, number> {
  const next = { ...standings };
  next[factionId] =
    standingFor(standings, factionId) +
    (killed ? FACTION_KILL_DELTA : FACTION_HIT_DELTA);
  return next;
}

/** Apply a completed-quest gain to one faction's standing. Pure. */
export function applyFactionQuestGain(
  standings: Record<string, number>,
  factionId: string,
): Record<string, number> {
  const next = { ...standings };
  next[factionId] = standingFor(standings, factionId) + FACTION_QUEST_DELTA;
  return next;
}

/**
 * Faction of a quest from its giver location. All static quest givers
 * live in Mosslight Crossing (quests.ts header); a quest whose giver
 * location names no known faction gains nothing (generated quests have
 * no giver town, so they do not move standing — stated, not faked).
 */
export function factionForQuestLocation(location: string | undefined): string | null {
  if (!location) return null;
  for (const id of FACTION_IDS) {
    if (location.includes(id)) return id;
  }
  return null;
}

/** Prose line for the examine surface (BUILD 922/923 pattern). */
export function factionExamineLine(
  factionId: string,
  standing: number,
  archetype: string | undefined,
): string {
  return `${factionId} regards you ${tierForNpc(standing, archetype)}.`;
}

/** Dialogue-panel line: tier + raw stored standing. */
export function factionDialogueLine(
  factionId: string,
  standing: number,
  archetype: string | undefined,
): string {
  return `${factionId} — ${tierForNpc(standing, archetype)} (standing ${standing})`;
}

/**
 * Sanitize a saved standings record: known factions only, finite
 * numbers only. Old saves carry no field and restore to empty (every
 * faction at default 0 / Indifferently, no faked history).
 */
export function sanitizeFactionStandings(
  raw: unknown,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(FACTION_IDS as readonly string[]).includes(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[key] = Math.floor(value);
  }
  return out;
}
