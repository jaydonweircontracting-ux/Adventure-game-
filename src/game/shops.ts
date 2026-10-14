// BUILD 697: Market stall shops — clickable stalls open a working shop UI.
//
// Pure and deterministic: every stall's merchant, shop name and goods derive
// from its stall index (the index into marketStallsFromDecor(decor.props),
// which is stable decor order). Stock state is a plain value object; the
// transaction functions never mutate their inputs, so double-taps can't
// corrupt state — a second tap simply re-reads the already-updated stock and
// is rejected with 'sold-out'.
//
// Economy coherence (extends the existing inventory/coins/merchant patterns,
// no parallel economy):
// - Stalls SELL the 11 player-buyable goods (healthPotion, beer, corn, wood,
//   cloths, lockpicks, daggers, shirts, swords, silk, bow) at a small market
//   premium over the fixed vendors (Bram's 10g potion, the tavern's 5g beer).
// - Stalls BUY those same goods back at a lower price, and buy the 5 monster
//   drops (bone, pelt, fang, goatHorns, fabric) at Bram's smith prices —
//   buyPrice is always > sellPrice, so no buy/sell arbitrage loop exists.
// - Restocking is driven by the game clock: opening a stall on a new game
//   day refills it (lazy, deterministic — stock only matters when open).

/** Item keys the stall economy trades in (subset of GameInventory). */
export type ShopItemKey =
  | 'healthPotion' | 'beer' | 'corn' | 'wood' | 'cloths' | 'lockpicks'
  | 'daggers' | 'shirts' | 'swords' | 'silk' | 'bow'
  | 'bone' | 'pelt' | 'fang' | 'goatHorns' | 'fabric';

export type ShopItemDef = {
  key: ShopItemKey;
  label: string;
  description: string;
  mark: string;
  /** Gold the player pays to buy one (0 = this stall doesn't sell it). */
  buyPrice: number;
  /** Gold the stall pays the player for one (0 = stall doesn't buy it). */
  sellPrice: number;
  /** Units a full restock brings this good to. */
  maxStock: number;
};

/** Shared catalog. Prices are the single source of truth for stall trade. */
export const SHOP_CATALOG: Record<ShopItemKey, Omit<ShopItemDef, 'key'>> = {
  healthPotion: { label: 'Health Potion', description: 'Restores 50% HP', mark: '🧪', buyPrice: 12, sellPrice: 4, maxStock: 4 },
  beer: { label: 'Beer', description: '+50% attack for 1 min', mark: '🍺', buyPrice: 6, sellPrice: 2, maxStock: 6 },
  corn: { label: 'Corn', description: 'Harvested crop', mark: '🌽', buyPrice: 3, sellPrice: 1, maxStock: 8 },
  wood: { label: 'Wood', description: 'Chopped from trees', mark: '🪵', buyPrice: 4, sellPrice: 1, maxStock: 8 },
  cloths: { label: 'Field cloths', description: 'Crafted gear', mark: '✚', buyPrice: 8, sellPrice: 3, maxStock: 5 },
  lockpicks: { label: 'Lockpicks', description: 'For locked chests', mark: '🗝', buyPrice: 18, sellPrice: 6, maxStock: 4 },
  daggers: { label: 'Goat-horn dagger', description: 'Crafted weapon', mark: '†', buyPrice: 25, sellPrice: 8, maxStock: 3 },
  shirts: { label: 'Blue shirt', description: 'Crafted shirt — equip to wear', mark: '👕', buyPrice: 20, sellPrice: 7, maxStock: 3 },
  swords: { label: 'Barbarian sword', description: 'Heavy blade · +35% damage', mark: '🗡', buyPrice: 60, sellPrice: 20, maxStock: 2 },
  silk: { label: 'Silk', description: 'Spider silk for bowstrings', mark: '🕸', buyPrice: 10, sellPrice: 3, maxStock: 5 },
  bow: { label: 'Hunting bow', description: 'Ranged weapon', mark: '🏹', buyPrice: 40, sellPrice: 12, maxStock: 2 },
  // Monster drops: stalls buy at Bram's smith prices (they never sell these).
  bone: { label: 'Bone', description: 'Skeleton remains', mark: '☠', buyPrice: 0, sellPrice: 2, maxStock: 0 },
  pelt: { label: 'Pelt', description: 'Thick animal hide', mark: '❖', buyPrice: 0, sellPrice: 3, maxStock: 0 },
  fang: { label: 'Fang', description: 'Sharp monster fang', mark: '⸙', buyPrice: 0, sellPrice: 4, maxStock: 0 },
  goatHorns: { label: 'Goat horns', description: 'Crafting material', mark: '✦', buyPrice: 0, sellPrice: 5, maxStock: 0 },
  fabric: { label: 'Fabric', description: 'Useful cloth', mark: '▤', buyPrice: 0, sellPrice: 2, maxStock: 0 },
};

/** Goods a stall sells — the full item defs with prices. */
export type StallGood = ShopItemDef;

export type StallShopDef = {
  /** Index into marketStallsFromDecor(decor.props) — stable decor order. */
  index: number;
  merchantName: string;
  shopName: string;
  flavor: string;
  /** What this stall sells (3-4 goods from its specialty). */
  goods: StallGood[];
};

/** Live stock for one stall. Plain value — JSON-safe for saves. */
export type StallStockState = {
  stock: Partial<Record<ShopItemKey, number>>;
  lastRestockDay: number;
};

// --- deterministic PRNG (local, no imports — keeps the module pure) ---

function stallSeed(index: number): number {
  return (0x9e3779b9 ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
}

function mulberry32Local(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- stall definitions ---

const MERCHANT_NAMES = [
  'Marla', 'Borin', 'Sella', 'Tam', 'Odric', 'Wren', 'Hob', 'Mira', 'Fen',
  'Alda', 'Corb', 'Nessa', 'Pell', 'Rosal', 'Dain', 'Elswyth', 'Garrick',
  'Hilda', 'Osric', 'Tilda', 'Brand', 'Ysolde', 'Cedd', 'Mab',
];

const SHOP_NAME_SUFFIX = ['Provisions', 'Goods', 'Wares', 'Trades', 'Supplies', 'Emporium'];

const STALL_SPECIALTIES: { name: string; goods: ShopItemKey[]; greetings: string[] }[] = [
  {
    name: 'Provisions',
    goods: ['corn', 'beer', 'healthPotion', 'wood'],
    greetings: [
      'Fresh from the farm and the brewery — take a look!',
      'Hungry? Thirsty? I have just the thing.',
    ],
  },
  {
    name: 'Crafts & Cloth',
    goods: ['cloths', 'shirts', 'silk', 'lockpicks'],
    greetings: [
      'Fine cloth and finer tools — all honest work.',
      'Need a stitch or a pick? You came to the right stall.',
    ],
  },
  {
    name: 'Arms',
    goods: ['daggers', 'swords', 'bow', 'healthPotion'],
    greetings: [
      'Sharp steel for dangerous roads. Every blade tested.',
      'The wilds don\'t forgive the unarmed. Browse, friend.',
    ],
  },
];

/**
 * Deterministic shop definition for a stall index. Total function — valid
 * for any non-negative index, so stalls added later automatically get shops.
 */
export function stallShopDef(index: number): StallShopDef {
  const rng = mulberry32Local(stallSeed(Math.max(0, Math.floor(index))));
  const merchantName = MERCHANT_NAMES[Math.floor(rng() * MERCHANT_NAMES.length)];
  const specialty = STALL_SPECIALTIES[Math.floor(rng() * STALL_SPECIALTIES.length)];
  // 3-4 goods from the specialty, seeded order, no duplicates.
  const pool = [...specialty.goods];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const count = 3 + Math.floor(rng() * 2);
  const goods: StallGood[] = pool.slice(0, count).map((key) => ({ key, ...SHOP_CATALOG[key] }));
  const suffix = SHOP_NAME_SUFFIX[Math.floor(rng() * SHOP_NAME_SUFFIX.length)];
  return {
    index,
    merchantName,
    shopName: `${merchantName}'s ${suffix}`,
    flavor: specialty.greetings[Math.floor(rng() * specialty.greetings.length)],
    goods,
  };
}

/** Goods the stall buys from the player (sell section of the UI). */
export function stallBuyList(): StallGood[] {
  return (Object.keys(SHOP_CATALOG) as ShopItemKey[])
    .filter((key) => SHOP_CATALOG[key].sellPrice > 0)
    .map((key) => ({ key, ...SHOP_CATALOG[key] }));
}

// --- stock ---

/** Full fresh stock for a stall definition on a given game day. */
export function createStallStock(def: StallShopDef, day: number): StallStockState {
  const stock: Partial<Record<ShopItemKey, number>> = {};
  for (const g of def.goods) stock[g.key] = g.maxStock;
  return { stock, lastRestockDay: day };
}

/**
 * Restock check driven by the game clock: a new game day refills the stall.
 * Lazy and deterministic — call when the stall is opened (stock only matters
 * when the shop UI is open). Never mutates the input.
 */
export function restockStall(def: StallShopDef, prev: StallStockState | null | undefined, day: number): StallStockState {
  if (!prev || !Number.isFinite(prev.lastRestockDay) || day > prev.lastRestockDay) {
    return createStallStock(def, day);
  }
  return prev;
}

// --- transactions (pure; inputs never mutated) ---

export type BuyResult =
  | { ok: true; state: StallStockState; coinsSpent: number; price: number }
  | { ok: false; reason: 'not-sold' | 'sold-out' | 'no-gold'; state: StallStockState };

/**
 * Attempt to buy one unit of itemKey from the stall.
 * Guards (in order): the stall sells it → stock remains → player can afford it.
 * Idempotent under double-tap: the second call sees the updated stock.
 */
export function buyFromStall(
  def: StallShopDef,
  state: StallStockState,
  itemKey: ShopItemKey,
  coins: number,
): BuyResult {
  const good = def.goods.find((g) => g.key === itemKey);
  if (!good || good.buyPrice <= 0) return { ok: false, reason: 'not-sold', state };
  const have = Math.max(0, Math.floor(state.stock[itemKey] ?? 0));
  if (have < 1) return { ok: false, reason: 'sold-out', state };
  if (!Number.isFinite(coins) || coins < good.buyPrice) return { ok: false, reason: 'no-gold', state };
  return {
    ok: true,
    state: { stock: { ...state.stock, [itemKey]: have - 1 }, lastRestockDay: state.lastRestockDay },
    coinsSpent: good.buyPrice,
    price: good.buyPrice,
  };
}

export type SellResult =
  | { ok: true; coinsEarned: number; price: number }
  | { ok: false; reason: 'not-bought' | 'none-held' };

/**
 * Attempt to sell one unit of itemKey to the stall.
 * Guards: the stall buys it (catalog sellPrice > 0) → the player holds one.
 * The stall has unlimited demand — no stock tracking on the buy side.
 */
export function sellToStall(itemKey: ShopItemKey, have: number): SellResult {
  const entry = (SHOP_CATALOG as Partial<Record<ShopItemKey, Omit<ShopItemDef, 'key'>>>)[itemKey];
  if (!entry || entry.sellPrice <= 0) return { ok: false, reason: 'not-bought' };
  if (!Number.isFinite(have) || have < 1) return { ok: false, reason: 'none-held' };
  return { ok: true, coinsEarned: entry.sellPrice, price: entry.sellPrice };
}

// --- save/load sanitation ---

/**
 * Sanitize restored stall stocks (from a save). Drops malformed entries;
 * clamps stock counts to finite non-negative integers. Unknown stall indexes
 * are kept — restockStall rebuilds them against the current defs on open.
 */
export function sanitizeStallStocks(raw: unknown): Record<number, StallStockState> {
  const out: Record<number, StallStockState> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(k);
    if (!Number.isInteger(index) || index < 0) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const vv = v as { stock?: unknown; lastRestockDay?: unknown };
    const day = typeof vv.lastRestockDay === 'number' && Number.isFinite(vv.lastRestockDay)
      ? Math.floor(vv.lastRestockDay) : -1;
    const stock: Partial<Record<ShopItemKey, number>> = {};
    if (vv.stock && typeof vv.stock === 'object' && !Array.isArray(vv.stock)) {
      for (const [ik, iv] of Object.entries(vv.stock as Record<string, unknown>)) {
        if (!(ik in SHOP_CATALOG)) continue;
        if (typeof iv !== 'number' || !Number.isFinite(iv)) continue;
        stock[ik as ShopItemKey] = Math.max(0, Math.floor(iv));
      }
    }
    out[index] = { stock, lastRestockDay: day };
  }
  return out;
}
