/**
 * Class death-loot table (BUILD 962).
 *
 * User order (2026-10-21): when classed enemies die, drop the gear their
 * class would have carried — since the game does not own their actual
 * equipment, give similar items instead:
 *   warrior -> sword + heavy plate armor
 *   wizard  -> staff/wand + cloth armor
 *   archer  -> bow + cloth armor
 *
 * Mapping rules, stated plainly:
 * - Every base id below is an EXISTING catalog entry (src/game/items.ts).
 *   No item is invented here. In particular the catalog has NO wand base,
 *   so the wizard branch uses a staff (apprentice_staff) — the "or wand"
 *   in the order has no catalog entry to point at, and inventing one
 *   would break the existing-items-only rule.
 * - Class is assigned by kind + ranged flag, never by recoloring art:
 *   knight -> warrior (the 2D HD knight pack is a sword-and-shield
 *   warrior; it is the live proof of the warrior branch).
 *   ranged bandit/goblin/orc -> archer (these instances literally fight
 *   with bows — bandit archers fire arrows — so they ARE archers).
 *   No overworld kind casts spells or carries a mage class, so the
 *   wizard branch ships DATA-READY ONLY: the table row exists and is
 *   asserted, but no kind maps to it today. The moment a wizard kind
 *   exists, one line in classForMonster wires it — no table change.
 * - Soldier is deliberately NOT mapped to warrior: soldiers are an
 *   existing kind with their own loot table (coins + fabric + dagger
 *   counts). Reclassifying them would silently change an existing
 *   kind's drops; that needs its own order, not a side effect here.
 *
 * The table rides the existing monster-death path: the killer's branch
 * attaches the base ids to the ground drop (DroppedLoot.gearBaseIds),
 * and pickupDrop generates exactly those bases (same generateItem +
 * withProvenance pattern as the BUILD 921 body-loot Take), so looted
 * gear lands in the equipment inventory with catalog stats intact and
 * is equippable from the inventory tab. The BUILD 950 carry gate runs
 * BEFORE the drop is removed, so a refused pickup leaves the gear on
 * the ground with the counts — never silently eaten.
 */
import { ITEM_BASES } from './items';

export type MonsterClass = 'warrior' | 'wizard' | 'archer';

export interface ClassLootRow {
  weapon: string;
  armor: string;
}

export const CLASS_LOOT: Record<MonsterClass, ClassLootRow> = {
  warrior: { weapon: 'iron_sword', armor: 'plate_armor' },
  wizard: { weapon: 'apprentice_staff', armor: 'cloth_robe' },
  archer: { weapon: 'oak_bow', armor: 'cloth_robe' },
};

/** All base ids the table points at — asserted against the catalog. */
export function classLootBaseIds(): string[] {
  const ids: string[] = [];
  for (const row of Object.values(CLASS_LOOT)) {
    ids.push(row.weapon, row.armor);
  }
  return ids;
}

/** True when every class-loot base id exists in the item catalog. */
export function classLootBasesAreKnown(): boolean {
  const known = new Set(ITEM_BASES.map((b) => b.id));
  return classLootBaseIds().every((id) => known.has(id));
}

/**
 * The class a monster instance fights as, or null when it carries no
 * class loot. Ranged instances of the bow kinds are archers; the knight
 * is always a warrior. Nothing else maps today (wizard: data-ready).
 */
export function classForMonster(kind: string | undefined, ranged: boolean): MonsterClass | null {
  if (!kind) return null;
  const k = kind.toLowerCase();
  if (k === 'knight') return 'warrior';
  if (ranged && (k === 'bandit' || k === 'goblin' || k === 'orc')) return 'archer';
  return null;
}

/**
 * The gear base ids a slain monster instance drops, in [weapon, armor]
 * order — or [] when the instance carries no class loot. Pure and
 * deterministic: the same instance always drops the same bases.
 */
export function classGearBaseIds(kind: string | undefined, ranged: boolean): string[] {
  const cls = classForMonster(kind, ranged);
  if (!cls) return [];
  const row = CLASS_LOOT[cls];
  return [row.weapon, row.armor];
}
