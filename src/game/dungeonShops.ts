// BUILD 930: Dungeon shop vaults, in the DCSS `shop` vault shape.
//
// Portable asset only: the PATTERN from
// `~/workspace/rea-targets/dcss/ANALYSIS.md` §5 — a vault centered on a
// shop (`KFEAT: s = any shop` in DCSS's builder/shops.des), placed by the
// same tag system as any other vault. Every shop below is ORIGINAL
// content written for this game's Ember Vault dungeon (its own keeper
// names, shop names, and stock). No DCSS shop is copied.
//
// Wiring, deliberately NOT a new economy (the analysis's own conclusion
// — the game already has a shop ledger, so a dungeon shop is a new
// *placement*, not a new shop system):
// - Placement runs through the 927 vault machinery (placeSingleVault),
//   so anchor/connector/reachability guarantees come free. The shop's
//   vault record joins state.vaults, so first entry announces it and
//   its tiles get the gold-ring tint, exactly like any other vault.
// - Transactions run through the EXISTING stall ledger: buyFromStall
//   from shops.ts (BUILD 699–701, shared with the 922 NPC gear
//   economy). Same guards (not-sold / sold-out / no-gold), same
//   merchantGold conservation — gold leaving the player lands in the
//   shop's stock state, never vanishes.
// - Prices ARE the catalog's: the shop sells two catalog goods,
//   healthPotion (12g) and corn (3g), at their SHOP_CATALOG buyPrices.
//   The dungeon item the player receives is the analog from the
//   dungeon's own templates (Vermilion potion / Iron ration) — see
//   DUNGEON_SHOP_ITEM. The shop UI shows the DUNGEON item's name and
//   description, never the catalog's: the overworld Health Potion
//   "Restores 50% HP", the dungeon Vermilion potion restores 10 flat,
//   and showing the catalog text would lie.
// - The dungeon templates carry no price of their own (their `value`
//   field is effect magnitude — potion heals 10, scroll restores 5
//   mana — not a price), so it is NOT used as one.
// - Scrolls are NOT sold: no catalog price exists for a mana scroll,
//   and inventing one would violate the no-invented-prices rule. They
//   stay loot-only. Relics are never sold either: the relic is the
//   victory quest item, and selling it would let a player buy victory.
// - The shopkeeper is unattackable by construction, not by a special
//   case in combat: it is not a Monster (no entry in monsters[], so no
//   step-attack, no ember-bolt target, no death spoils, no lootable
//   corpse), and its tile is not standable (canStand refuses it), so
//   stepping toward it opens the shop instead of attacking. Buying
//   the stock and then looting the same stock off a corpse is
//   impossible: there is no corpse.
// - Shopping costs no turn (no finishTurn on open/buy/close), like
//   DCSS: browsing must not hand adjacent monsters free hits.
// - Scope note, same as uniques: the dungeon is not persisted across
//   sessions by design, so a shop lives for its floor only. Descending
//   regenerates shops; a shop on floor 1 is gone on floor 2, like the
//   rest of that floor. Within a floor, stock depletes persistently
//   (buying the last unit leaves it gone) because the shop lives in
//   the same GameState object every action mutates.

import {
  placeSingleVault,
  reachableWalkableCells,
  type PlacedVault,
  type VaultDef,
} from "./dungeonVaults";
import {
  SHOP_CATALOG,
  type ShopItemKey,
  type StallShopDef,
  type StallStockState,
} from "./shops";
import type { Tile } from "./stoneSoupEngine";

/** A dungeon shop: a keeper standing in a shop vault, with ledger stock. */
export interface DungeonShop {
  id: string;
  keeperName: string;
  shopName: string;
  flavor: string;
  x: number;
  y: number;
  /** Name of the vault record this shop's room joined (announcement/tint). */
  vaultName: string;
  /** Hand-built stall def: the ledger's shape, not a stall-derived one. */
  def: StallShopDef;
  stock: StallStockState;
}

/**
 * Catalog good -> dungeon item template it stands for. The ONLY mapping
 * in the system, documented here: the healing potion of each system,
 * and the staple food of each system. The display data (name/glyph/
 * description) lives in the engine's dungeonShopDisplay, which reads
 * the templates directly — this module never duplicates template text,
 * and never reads it at module-evaluation time (module-cycle rule,
 * same as dungeonVaults).
 */
export const DUNGEON_SHOP_ITEM = {
  healthPotion: "potion",
  corn: "food",
} as const;

interface ShopVaultDef {
  id: string;
  keeperName: string;
  shopName: string;
  flavor: string;
  tags: string[];
  vault: VaultDef;
  /** Catalog goods sold, with opening stock counts. */
  goods: { key: ShopItemKey; stock: number }[];
}

export const SHOP_VAULT_DEFS: ShopVaultDef[] = [
  {
    id: "provisions",
    keeperName: "Old Kess",
    shopName: "Ember Provisions",
    flavor: "Warm rations and warmer firewater — cash on the barrelhead.",
    tags: ["shop", "provisions"],
    vault: {
      name: "Ember Provisions",
      flavor: "A shopkeeper keeps a stubborn little store down here.",
      tags: ["shop", "provisions"],
      minDepth: 1,
      maxDepth: 99,
      weight: 10,
      map: [
        "#######",
        "#.....#",
        "#.....#",
        "#.....#",
        "#######",
      ],
      mons: [],
      items: [],
    },
    goods: [
      { key: "corn", stock: 4 },
      { key: "healthPotion", stock: 2 },
    ],
  },
  {
    id: "apothecary",
    keeperName: "Vesper",
    shopName: "Cinder Apothecary",
    flavor: "Potions for the prudent. The imprudent pay more, later.",
    tags: ["shop", "apothecary"],
    vault: {
      name: "Cinder Apothecary",
      flavor: "A shopkeeper tends rows of stoppered bottles.",
      tags: ["shop", "apothecary"],
      minDepth: 1,
      maxDepth: 99,
      weight: 10,
      map: [
        "###+###",
        "#.....#",
        "#.....#",
        "#.....#",
        "#######",
      ],
      mons: [],
      items: [],
    },
    goods: [
      { key: "healthPotion", stock: 4 },
      { key: "corn", stock: 2 },
    ],
  },
];

/** Chance a floor attempts a shop at all (DCSS shops are usually 1). */
export const SHOP_FLOOR_CHANCE = 0.75;

export interface ShopPlacement {
  placed: PlacedVault;
  shop: DungeonShop;
}

/**
 * Place at most ONE shop on this floor, after the regular vaults and
 * the unique chamber (so placedRects already covers them). The keeper
 * stands on the walkable vault cell nearest the room's center. Returns
 * null when the roll fails or no anchor validates — the floor simply
 * has no shop; a level is never broken to place one.
 */
export function placeShop(
  tiles: Tile[][],
  rng: { next(): number },
  floor: number,
  forbidden: ReadonlySet<string>,
  placedRects: { x: number; y: number; width: number; height: number }[],
  spawn: { x: number; y: number },
): ShopPlacement | null {
  if (rng.next() >= SHOP_FLOOR_CHANCE) return null;
  const def = SHOP_VAULT_DEFS[Math.floor(rng.next() * SHOP_VAULT_DEFS.length)] ?? SHOP_VAULT_DEFS[0];
  const baseReachable = reachableWalkableCells(tiles, spawn);
  if (baseReachable.size === 0) return null;
  const result = placeSingleVault(
    tiles,
    def.vault,
    rng,
    floor,
    forbidden,
    placedRects,
    baseReachable,
    spawn,
    `vault-shop-${floor}`,
  );
  if (!result) return null;
  // Keeper = walkable stamped cell nearest the room center, preferring
  // a plain floor cell (the vault maps are open rooms, so this is the
  // center). The cell stays floor kind: the keeper occupies it via
  // canStand, not by repainting the tile.
  const cx = result.placed.x + result.placed.width / 2;
  const cy = result.placed.y + result.placed.height / 2;
  let keeper: { x: number; y: number } | null = null;
  let keeperDist = Infinity;
  for (const cell of result.placed.cells) {
    const [x, y] = cell.split(":").map(Number);
    if (tiles[y]?.[x]?.kind !== "floor") continue;
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (d < keeperDist) {
      keeperDist = d;
      keeper = { x, y };
    }
  }
  if (!keeper) {
    const first = result.placed.cells[0]?.split(":").map(Number);
    if (!first) return null;
    keeper = { x: first[0], y: first[1] };
  }
  const goods = def.goods.map((g) => ({ key: g.key, ...SHOP_CATALOG[g.key] }));
  const stock: Record<string, number> = {};
  for (const g of def.goods) stock[g.key] = g.stock;
  const shop: DungeonShop = {
    id: `shop-${floor}-${def.id}`,
    keeperName: def.keeperName,
    shopName: def.shopName,
    flavor: def.flavor,
    x: keeper.x,
    y: keeper.y,
    vaultName: def.vault.name,
    def: { index: -1, merchantName: def.keeperName, shopName: def.shopName, flavor: def.flavor, goods },
    stock: { stock, lastRestockDay: 0, merchantGold: 0 },
  };
  return { placed: result.placed, shop };
}
