// BUILD 949: NPC loot storage — family chests + the Mosslight bank ledger.
//
// Where BUILD 948's dungeon loot goes. The 948 run leaves its haul on the
// returning adventurer (coins + lootItems); this module drains it into
// storage, by ONE deterministic rule the player can reason about:
//
//   coins -> the Mosslight bank ledger (fungible, so a ledger balance)
//   items -> the adventurer's family chest (physical valuables, so a chest)
//
// No coin-flip storage, no choice UI: adventurers act on their own, so the
// choice is theirs by rule, not the player's click.
//
// DEFINITIONS (from the audit, not invented):
// - A "family chest" belongs to a HOUSEHOLD. Townsfolk households share a
//   homeKey (townsfolk.ts: "Households share a homeKey"), so a townsfolk
//   household's chest key IS its homeKey. Simulated adventurers are not
//   townsfolk and hold no homeKey (they lodge in the starting house), so
//   each adventurer is their own single-member household with key
//   `adv:<id>`. Every household resolves a chest through chestItemsFor
//   (empty by default) — there is no household without a chest and no
//   chest without a household; townsfolk chests simply stay empty until
//   some future system deposits into them, because townsfolk generate no
//   loot today.
// - The BANK is the Mosslight town bank LEDGER, not a building, not a
//   banker NPC, not a vault object: no bank building exists anywhere in
//   the game, and building one (or a bank-visit walk) for an abstract
//   deposit would be fake geography. Balances are per-household coin
//   counts under that one ledger. There are no player deposits,
//   withdrawals, interest, loans, or fees — player-facing bank/depot
//   services belong to extras 2/6 (NPC topic machines + bank/depot) and
//   stay there. This build is NPC-side loot storage only.
// - RETRIEVAL is deposit-only for gameplay: nothing in the game withdraws
//   yet. The data model still supports it — withdrawFromChest and
//   withdrawFromBank are implemented and tested, so a future build (gear
//   use, player-facing bank) can call them without a migration. Nothing
//   ever silently vanishes: every deposited coin/item is accounted for in
//   exactly one place (chest or bank), and the drain step reports it.
//
// Purity: every function here is pure (no Math.random, no Date) — the
// App tick calls drainUnbankedHaul on the post-advance adventurer list,
// which keeps the living sim itself untouched (no signature changes to
// advanceSimulatedAdventurers) while guaranteeing no haul is ever left
// sitting on an NPC past the return tick.

import type { SimulatedAdventurer } from './simulatedAdventurers';

/** The one bank in this build: a ledger name for log lines, not a place. */
export const BANK_NAME = 'Mosslight bank';

/** Stored loot: family-chest item names + bank-ledger coin balances. */
export type NpcStorageState = {
  /** householdKey -> stored item names (dungeon loot strings, e.g. 'dagger'). */
  chests: Record<string, string[]>;
  /** householdKey -> stored coins under the Mosslight bank ledger. */
  bank: Record<string, number>;
};

export const EMPTY_NPC_STORAGE: NpcStorageState = { chests: {}, bank: {} };

/** Household key for a simulated adventurer (their own single household). */
export function adventurerHouseholdKey(adventurerId: string): string {
  return `adv:${adventurerId}`;
}

/** Chest contents for a household — [] when the household never stored. */
export function chestItemsFor(state: NpcStorageState, householdKey: string): string[] {
  const items = state.chests[householdKey];
  return Array.isArray(items) ? [...items] : [];
}

/** Bank balance for a household — 0 when the household never deposited. */
export function bankBalanceFor(state: NpcStorageState, householdKey: string): number {
  const balance = state.bank[householdKey];
  return Number.isFinite(balance) && (balance as number) > 0 ? Math.floor(balance as number) : 0;
}

function cleanCoins(coins: number): number {
  return Number.isFinite(coins) && coins > 0 ? Math.floor(coins) : 0;
}

function cleanItems(items: readonly string[] | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => typeof item === 'string' && item.length > 0);
}

export type DelveDeposit = { coins: number; items: string[] };

/**
 * Deposit one haul by the fixed rule: coins -> bank, items -> chest.
 * Pure and immutable. Returns the SAME state object when there is nothing
 * to deposit, so callers can skip state churn on empty hauls.
 */
export function depositDelveHaul(
  state: NpcStorageState,
  householdKey: string,
  coins: number,
  items: readonly string[] | undefined,
): { state: NpcStorageState; deposited: DelveDeposit } {
  const clean = { coins: cleanCoins(coins), items: cleanItems(items) };
  if (clean.coins === 0 && clean.items.length === 0) return { state, deposited: clean };
  return {
    state: {
      chests: clean.items.length > 0
        ? { ...state.chests, [householdKey]: [...chestItemsFor(state, householdKey), ...clean.items] }
        : state.chests,
      bank: clean.coins > 0
        ? { ...state.bank, [householdKey]: bankBalanceFor(state, householdKey) + clean.coins }
        : state.bank,
    },
    deposited: clean,
  };
}

/** One drained haul, for the log line the App tick emits. */
export type DrainedHaul = { id: string; coins: number; items: string[] };

/**
 * Drain every unbanked haul off non-delving adventurers: each adventurer
 * carrying coins/lootItems (a return that just landed, or a leftover 948
 * save whose haul was never drained) deposits by the fixed rule and comes
 * back with coins 0, lootItems [], and lastDelveHaul set to the drained
 * amount (return history the inspector can show). Delving adventurers are
 * never touched — their haul, if any, drains on their return tick, so a
 * mid-delve save can never lose coins to an early drain. Pure: returns
 * new lists only when at least one deposit happened, else the inputs.
 */
export function drainUnbankedHaul(
  adventurers: SimulatedAdventurer[],
  storage: NpcStorageState,
): { adventurers: SimulatedAdventurer[]; storage: NpcStorageState; deposits: DrainedHaul[] } {
  let nextStorage = storage;
  let changed = false;
  const deposits: DrainedHaul[] = [];
  const nextAdventurers = adventurers.map((adventurer) => {
    if (adventurer.outing === 'dungeon') return adventurer;
    const coins = cleanCoins(adventurer.coins ?? 0);
    const items = cleanItems(adventurer.lootItems);
    if (coins === 0 && items.length === 0) return adventurer;
    const result = depositDelveHaul(nextStorage, adventurerHouseholdKey(adventurer.id), coins, items);
    nextStorage = result.state;
    changed = true;
    deposits.push({ id: adventurer.id, coins, items });
    return { ...adventurer, coins: 0, lootItems: [], lastDelveHaul: { coins, items } };
  });
  if (!changed) return { adventurers, storage, deposits: [] };
  return { adventurers: nextAdventurers, storage: nextStorage, deposits };
}

/**
 * Future-use withdrawal: remove one occurrence of an item from a chest.
 * Implemented + tested; nothing in the game calls it yet (deposit-only).
 */
export function withdrawFromChest(
  state: NpcStorageState,
  householdKey: string,
  item: string,
): { state: NpcStorageState; ok: boolean } {
  const items = chestItemsFor(state, householdKey);
  const index = items.indexOf(item);
  if (index < 0) return { state, ok: false };
  const next = [...items];
  next.splice(index, 1);
  return { state: { ...state, chests: { ...state.chests, [householdKey]: next } }, ok: true };
}

/**
 * Future-use withdrawal: take coins out of a bank balance. Fails (no
 * state change) on non-positive, non-finite, or over-balance amounts.
 * Implemented + tested; nothing in the game calls it yet (deposit-only).
 */
export function withdrawFromBank(
  state: NpcStorageState,
  householdKey: string,
  amount: number,
): { state: NpcStorageState; ok: boolean; withdrawn: number } {
  const clean = cleanCoins(amount);
  const balance = bankBalanceFor(state, householdKey);
  if (clean === 0 || clean > balance) return { state, ok: false, withdrawn: 0 };
  return { state: { ...state, bank: { ...state.bank, [householdKey]: balance - clean } }, ok: true, withdrawn: clean };
}

/** Deep copy for the save payload (never hand the live ref to a save). */
export function serializeNpcStorage(state: NpcStorageState): NpcStorageState {
  return {
    chests: Object.fromEntries(Object.entries(state.chests).map(([key, items]) => [key, [...items]])),
    bank: { ...state.bank },
  };
}

/**
 * Sanitize a loaded storage record. Shape-only: malformed entries are
 * dropped, well-formed ones are kept whatever their household key (a
 * roster change must never delete stored loot). Old saves carry no field
 * and restore to empty — never faked history.
 */
export function sanitizeNpcStorage(value: unknown): NpcStorageState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { chests: {}, bank: {} };
  const record = value as Record<string, unknown>;
  const chests: Record<string, string[]> = {};
  if (typeof record.chests === 'object' && record.chests !== null && !Array.isArray(record.chests)) {
    for (const [key, items] of Object.entries(record.chests as Record<string, unknown>)) {
      if (Array.isArray(items)) {
        const clean = items.filter((item): item is string => typeof item === 'string' && item.length > 0);
        chests[key] = clean;
      }
    }
  }
  const bank: Record<string, number> = {};
  if (typeof record.bank === 'object' && record.bank !== null && !Array.isArray(record.bank)) {
    for (const [key, amount] of Object.entries(record.bank as Record<string, unknown>)) {
      if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) bank[key] = Math.floor(amount);
    }
  }
  return { chests, bank };
}
