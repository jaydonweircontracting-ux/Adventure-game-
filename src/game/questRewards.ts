// BUILD 968 — quest/task reward gear mapping.
//
// Audit finding (user bug report 2026-10-21: "Looted items don't appear
// in the characters inventory to equip"): quest and task payouts granted
// coins, XP, and (for one name) a bow count — every other reward item
// was only NAMED in the completion log ("keepsakes"). A player who
// finished a quest was told they received a longsword, plate armor,
// gloves, and so on, but no item ever arrived in inventory or equipment,
// so there was nothing to equip. Corpse drops (962), house chests (963),
// body loot (921), pickpocket (932), shops, and smith crafting were all
// audited in the same pass and grant correctly; only this path vanished.
//
// This table maps each gear reward name in the static quest defs to the
// nearest existing catalog base (ITEM_BASES) — no invented items, no new
// bases. Names with no gear form stay keepsakes (log-only, as before):
// Bread, Herb poultice, Holy water, Greater healing potion, Quiver of
// arrows, Stolen strongbox, Map to the Ember Vault, King's favor, Spice
// satchel. 'Hunting bow' is NOT in this table: it keeps its existing
// mapping to the stackable bow count (equippable via the bow toggle).
// Quest gear bypasses the carry gate like every other quest payout
// (BUILD 950: rewards always land) — the grant call sites make no gate
// check, by construction.

/** Quest reward name -> catalog base id, for gear rewards only. */
export const QUEST_REWARD_BASES: Record<string, string> = {
  'Rat-skin gloves': 'leather_gloves',
  'Silver locket': 'silver_amulet',
  'Wolf-pelt cloak': 'traveler_cloak',
  'Iron dagger': 'dagger',
  'Silk gloves': 'silk_gloves',
  "Guard's longsword": 'iron_sword',
  'Iron shield': 'iron_shield',
  'Blessed amulet': 'silver_amulet',
  'Ancient bronze sword': 'bronze_sword',
  "Merchant's ring": 'gold_ring',
  'Reinforced leather armor': 'leather_armor',
  'Trollbone club': 'mace',
  "Bridge-keeper's helm": 'iron_helm',
  'Jeweled dagger': 'rune_dagger',
  "Drowned merchant's coat": 'traveler_cloak',
  'Blade of Aldoria': 'steel_blade',
  'Aldorian plate armor': 'plate_armor',
};

/** Catalog base id for a gear reward name, or undefined for bow/keepsakes. */
export function questRewardBaseId(name: string): string | undefined {
  return QUEST_REWARD_BASES[name];
}

/** Reward names in a list that grant a generated gear item. */
export function questRewardGearNames(items: readonly string[]): string[] {
  return items.filter((name) => QUEST_REWARD_BASES[name] !== undefined);
}

/** Reward names in a list that stay log-only keepsakes (bow excluded). */
export function questRewardKeepsakes(items: readonly string[]): string[] {
  return items.filter(
    (name) => name !== 'Hunting bow' && QUEST_REWARD_BASES[name] === undefined,
  );
}
