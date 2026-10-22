// BUILD 970: extras 2/6 — PLAYER-facing bank/depot service.
//
// This is deliberately separate from BUILD 949's NPC-side storage
// (npcStorage.ts: family chests + the Mosslight bank LEDGER for NPC delve
// hauls — deposit-only, inspector-visible, never player-facing). The two
// systems never share contents and never double-count: 949 stores what
// ADVENTURERS bring home from delves; this module stores what the PLAYER
// hands to the bank clerk. Nothing here reads or writes NpcStorageState.
//
// SERVICE (decided, not ambiguous):
// - Clerk: Brand, the merchant head of the town-s1 merchant household —
//   the one named merchant household in the Mosslight roster. Cedric,
//   Sella, and Ess keep shop-only; they are not clerks.
// - Place: there is no bank building and none is invented. The service
//   lives in conversation with Brand in Mosslight (talk to him, as with
//   every other NPC service) — no fake geography, no bank-visit walk.
// - What can be stored: coins AND equipment items (GeneratedItem objects,
//   stored whole so withdrawal restores the exact item: same base, same
//   stats, same provenance). Stackable counts (beer, corn, potions) are
//   NOT stored — they live in the inventory ledger, and a depot for them
//   would duplicate that ledger.
// - Limits: NONE on amount or count. The depot is location-gated (you
//   must walk to Brand in Mosslight to retrieve anything), which is the
//   balancing factor — it does not let you dodge the carry limit while
//   traveling, because stored gear is not on your person.
// - Carry gate (BUILD 950): withdrawals are refused while already over
//   capacity — the item STAYS stored and the refusal message shows, never
//   silently eaten. Coins are never gated (weight 0), matching 950.
// - Stored items always return UNEQUIPPED: the player re-equips from the
//   Equipment tab. Storing an equipped item removes it from equipment,
//   so its stats stop applying while it is in the vault.
//
// Purity: every function here is pure. The App applies the results to
// inventory/equipment state; this module never touches React.

import type { GeneratedItem } from './items';

/** The player's depot account: coins + whole equipment items. */
export interface PlayerBankState {
  coins: number;
  items: GeneratedItem[];
}

export const EMPTY_PLAYER_BANK: PlayerBankState = { coins: 0, items: [] };

/** The one bank clerk: head of the town-s1 merchant household. */
export const BANK_CLERK_NAME = 'Brand';

/** True only for Brand the merchant — every other merchant is shop-only. */
export function isBankClerk(npc: { name: string; archetype: string }): boolean {
  return npc.name === BANK_CLERK_NAME && npc.archetype === 'merchant';
}

/** Stored coin balance — 0 for an empty or malformed bank. */
export function bankCoinsFor(bank: PlayerBankState | null | undefined): number {
  if (!bank || !Number.isFinite(bank.coins) || bank.coins <= 0) return 0;
  return Math.floor(bank.coins);
}

/** Stored items — a copy, never the live array. */
export function bankItemsFor(bank: PlayerBankState | null | undefined): GeneratedItem[] {
  if (!bank || !Array.isArray(bank.items)) return [];
  return [...bank.items];
}

function cleanAmount(amount: number): number {
  return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
}

/**
 * Deposit coins into the vault. The purse is the player's SPENDABLE gold
 * (inventory coins minus any shop reserve — the caller computes it, the
 * same way stall buys compute effectiveCoins). Rejects non-positive and
 * over-purse amounts without changing state.
 */
export function depositBankCoins(
  bank: PlayerBankState,
  amount: number,
  purse: number,
): { bank: PlayerBankState; ok: boolean; moved: number } {
  const clean = cleanAmount(amount);
  const available = Number.isFinite(purse) && purse > 0 ? Math.floor(purse) : 0;
  if (clean === 0 || clean > available) return { bank, ok: false, moved: 0 };
  return { bank: { coins: bankCoinsFor(bank) + clean, items: bankItemsFor(bank) }, ok: true, moved: clean };
}

/**
 * Withdraw coins from the vault. Rejects non-positive and over-balance
 * amounts without changing state. Coins are never carry-gated (weight 0).
 */
export function withdrawBankCoins(
  bank: PlayerBankState,
  amount: number,
): { bank: PlayerBankState; ok: boolean; moved: number } {
  const clean = cleanAmount(amount);
  const balance = bankCoinsFor(bank);
  if (clean === 0 || clean > balance) return { bank, ok: false, moved: 0 };
  return { bank: { coins: balance - clean, items: bankItemsFor(bank) }, ok: true, moved: clean };
}

/**
 * Store one equipment item in the vault. The item is stored whole with
 * equipped forced false; a second store of the same instanceId is
 * rejected (no duplicate vault entries for one item).
 */
export function storeBankItem(
  bank: PlayerBankState,
  item: GeneratedItem,
): { bank: PlayerBankState; ok: boolean } {
  if (!item || typeof item.instanceId !== 'string' || item.instanceId.length === 0) return { bank, ok: false };
  const items = bankItemsFor(bank);
  if (items.some((stored) => stored.instanceId === item.instanceId)) return { bank, ok: false };
  return { bank: { coins: bankCoinsFor(bank), items: [...items, { ...item, equipped: false }] }, ok: true };
}

/**
 * Take one stored item back. `canCarry` is the caller's BUILD 950 gate
 * (carryNow().over === false): when false the item STAYS stored and the
 * bank is unchanged — the refusal message is the caller's job, the
 * no-vanish guarantee is this function's. Unknown instanceIds fail
 * without changing state.
 */
export function takeBankItem(
  bank: PlayerBankState,
  instanceId: string,
  canCarry: boolean,
): { bank: PlayerBankState; item: GeneratedItem | null; ok: boolean } {
  const items = bankItemsFor(bank);
  const index = items.findIndex((stored) => stored.instanceId === instanceId);
  if (index < 0 || !canCarry) return { bank, item: null, ok: false };
  const item = { ...items[index], equipped: false };
  const next = [...items];
  next.splice(index, 1);
  return { bank: { coins: bankCoinsFor(bank), items: next }, item, ok: true };
}

/** Deep copy for the save payload (never hand the live ref to a save). */
export function serializePlayerBank(bank: PlayerBankState): PlayerBankState {
  return { coins: bankCoinsFor(bank), items: bankItemsFor(bank).map((item) => ({ ...item })) };
}

function isWellShapedItem(value: unknown): value is GeneratedItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.instanceId === 'string' && item.instanceId.length > 0 &&
    typeof item.baseId === 'string' && item.baseId.length > 0 &&
    typeof item.name === 'string' && item.name.length > 0 &&
    typeof item.slot === 'string' && item.slot.length > 0 &&
    typeof item.stats === 'object' && item.stats !== null
  );
}

/**
 * Sanitize a loaded bank record. Shape-only: malformed entries are
 * dropped, well-formed ones are kept whatever their base (a catalog change
 * must never delete stored gear). Stored items are forced unequipped —
 * nothing is ever equipped while it sits in the vault. Old saves carry
 * no field and restore to empty — never faked history.
 */
export function sanitizePlayerBank(value: unknown): PlayerBankState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY_PLAYER_BANK;
  const record = value as Record<string, unknown>;
  const coins = typeof record.coins === 'number' && Number.isFinite(record.coins) && record.coins > 0
    ? Math.floor(record.coins)
    : 0;
  const items: GeneratedItem[] = [];
  if (Array.isArray(record.items)) {
    for (const entry of record.items) {
      if (isWellShapedItem(entry)) items.push({ ...(entry as GeneratedItem), equipped: false });
    }
  }
  return { coins, items };
}
