// BUILD 972: extras 4/6 — house deeds.
//
// PORTED SHAPE (Tibia house model, rules/formats only, original code):
// a house deed is an ownership record — owner + access level — carried
// on the house, not on a person. Tibia's full shape also has rent +
// warnings + transfer (HouseTransferItem) and an access list
// (owner / subowner / guest / none). Only the ownership + access parts
// cohere in this single-player game, so only those ship:
//
// - OWNERSHIP: exactly one deed exists — the player's starting house
//   (doorway id 'tutorial-house-door', chunk 4,7). That house was
//   already the player's in every earlier build: BUILD 963's chest
//   rule treated its chest as free and every other house's as theft,
//   but the fact lived only as a hardcoded doorway-id comparison.
//   The deed makes that fact explicit, inspectable, and saved.
// - ACCESS: owner / none. The player is owner of the deeded house and
//   of nothing else. Subowner and guest levels are NOT shipped: there
//   is no second player to grant them to, and no guest mechanism
//   (no NPC asks to share a house), so they would be decoration.
// - SKIPPED, WITH REASON (not built, not faked):
//   - Rent + rent warnings + eviction: rent is paid TO someone. There
//     is no landlord, no housing authority, and no one to collect —
//     and eviction would leave the player homeless with nowhere to
//     go, since the starting house is the only home the game grants.
//   - Transfer / sale: a deed market needs a counterparty. There are
//     no other players and no NPC buys or sells houses (no house
//     prices exist anywhere), so a transfer item would move a deed
//     to nobody.
//   - Buying more houses: same missing economy — no seller, no price.
//   - Deed-gating house entry: interiors are unreachable in current
//     builds (BUILD 957 gap — all entry paths dead, houses are
//     exterior-only), so an entry gate would gate nothing.
//   - Deed-gating the house-mover debug tool: the mover is a debug
//     tool (gear menu), not gameplay; restricting it by deed would
//     break its purpose without adding a player-facing rule.
// - WHAT THE DEED ACTUALLY CHANGES: the BUILD 963 theft exemption now
//   reads the deed record (App overrides each chest's ownHouse from
//   deeds) instead of a hardcoded id check, the own-house chest panel
//   states the deed, and the record survives save/load. Old saves gain
//   the starting deed on load — not faked history, but the formal
//   record of the ownership 963 already enforced. No other house can
//   gain a deed (no grant path exists), so no NPC home is ever
//   mislabeled as the player's.
// - WHAT IT DOES NOT CHANGE: no XP, no mitigation, no AA, no class
//   or spell numbers, no crime/bounty rules (theft severity, witness
//   radius, and one-report-per-chest are untouched), no 949 family
//   chests, no 963 chest contents, no 970 bank. The only save addition
//   is the `houseDeeds` field below; old saves load cleanly.

/** The player's starting house — doorway id and chunk, matching the
 *  963 own-house constant and the starting doorway in App.tsx. */
export const STARTING_HOUSE_DOORWAY_ID = 'tutorial-house-door';
export const STARTING_HOUSE_CHUNK = { x: 4, y: 7 } as const;

/** How the deed was granted. Only 'starting-home' exists: the game
 *  grants the starting house with a new game, and nothing else grants
 *  deeds. */
export type DeedGrant = 'starting-home';

/** One house deed. Owner is always 'player' — the record exists only
 *  for houses the player owns, so a missing entry means "not yours". */
export type HouseDeed = {
  /** Doorway id of the house (the house's stable id, same as chest houseId). */
  houseId: string;
  /** Chunk the house stands in. */
  chunk: { x: number; y: number };
  owner: 'player';
  granted: DeedGrant;
};

/** Deeds keyed by house (doorway) id. */
export type HouseDeedsState = Record<string, HouseDeed>;

/** The starting deed, as granted by a new game. */
export function startingDeed(): HouseDeed {
  return {
    houseId: STARTING_HOUSE_DOORWAY_ID,
    chunk: { x: STARTING_HOUSE_CHUNK.x, y: STARTING_HOUSE_CHUNK.y },
    owner: 'player',
    granted: 'starting-home',
  };
}

/** Fresh deeds for a new game: exactly the starting house. */
export function createStartingDeeds(): HouseDeedsState {
  const deed = startingDeed();
  return { [deed.houseId]: deed };
}

/** Single-player access level for a house: 'owner' if the player holds
 *  its deed, 'none' otherwise. (Tibia's subowner/guest levels have no
 *  single-player meaning and are deliberately absent.) */
export function deedAccessLevel(
  deeds: HouseDeedsState,
  houseId: string,
): 'owner' | 'none' {
  return deeds[houseId]?.owner === 'player' ? 'owner' : 'none';
}

/** True when the player holds the deed for this house. This is what
 *  the chest theft exemption reads (via App's ownHouse override). */
export function playerOwnsHouse(deeds: HouseDeedsState, houseId: string): boolean {
  return deedAccessLevel(deeds, houseId) === 'owner';
}

/** Sorted deed list (stable order for display and tests). */
export function listDeeds(deeds: HouseDeedsState): HouseDeed[] {
  return Object.values(deeds).sort((a, b) => (a.houseId < b.houseId ? -1 : a.houseId > b.houseId ? 1 : 0));
}

function cleanDeed(value: unknown): HouseDeed | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.houseId !== 'string' || r.houseId.length === 0) return null;
  if (r.owner !== 'player') return null;
  if (r.granted !== 'starting-home') return null;
  const chunk = r.chunk as Record<string, unknown> | undefined;
  if (!chunk || typeof chunk.x !== 'number' || typeof chunk.y !== 'number') return null;
  return { houseId: r.houseId, chunk: { x: chunk.x, y: chunk.y }, owner: 'player', granted: 'starting-home' };
}

/**
 * Sanitize deeds from a save. Valid player deeds survive; anything
 * else is dropped. The starting deed is ALWAYS ensured: the starting
 * house was the player's before deeds existed (963 enforced it), so
 * an old save without the field, or a record without it, gains it on
 * load — the same old-save rule as 963's full chests, never a new
 * grant of a house the player did not already own.
 */
export function sanitizeHouseDeeds(input: unknown): HouseDeedsState {
  const out: HouseDeedsState = {};
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    for (const value of Object.values(input as Record<string, unknown>)) {
      const deed = cleanDeed(value);
      if (deed) out[deed.houseId] = deed;
    }
  }
  const start = startingDeed();
  out[start.houseId] = out[start.houseId] ?? start;
  return out;
}

/** Serialize deeds for the save payload (plain object, like playerBank). */
export function serializeHouseDeeds(deeds: HouseDeedsState): HouseDeedsState {
  const out: HouseDeedsState = {};
  for (const deed of listDeeds(deeds)) {
    out[deed.houseId] = { ...deed, chunk: { ...deed.chunk } };
  }
  return out;
}
