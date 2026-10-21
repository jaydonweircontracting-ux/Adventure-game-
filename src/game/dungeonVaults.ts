// BUILD 927: Authored dungeon vaults, in the DCSS `.des` grammar's shape.
//
// Portable asset only: the FORMAT, the placement rules, and the design
// grammar from `~/workspace/rea-targets/dcss/ANALYSIS.md` §(b)1. Every vault
// below is ORIGINAL content written for this game's Ember Vault dungeon
// (its own monsters, items, terrain, names). No DCSS vault is copied:
// DCSS is GPL and its vaults reference DCSS-specific monsters, glyphs,
// and tiles.
//
// Vault header grammar (DCSS spirit, adapted to this codebase):
//   NAME   — the vault's display name (announced on first entry).
//   TAGS   — placement/behavior tags (treasure, nest, shrine, ...).
//   DEPTH  — minDepth..maxDepth: which dungeon floors may place it.
//   WEIGHT — rarity weight for the weighted pick.
//   MONS   — monster list; map digits '1'..'9' place mons[digit - 1].
//   ITEMS  — item list; map letters 'a'..'z' place items[letter - 'a'].
//   MAP    — ASCII map. Terrain glyphs: '#' wall, '.' floor, '+' door,
//            '~' water, '^' lava, 'A' altar. A space is transparent: the
//            existing tile is left untouched, so vaults can be
//            non-rectangular. There is deliberately NO stairs glyph:
//            a vault must never move or duplicate the level's stairs.
// Placement (DCSS's implicit accessibility validation, made explicit):
// after the base level generates, 1-3 vaults are picked by weight, each
// stamped into a fitting wall region and connected to the level by a
// carved corridor. A placement is kept ONLY if, afterwards, the stairs
// are still reachable from the player spawn, every stamped walkable
// vault cell is reachable, and every previously reachable walkable cell
// is still reachable. If no anchor validates, the vault is skipped —
// a level is never broken to place a vault.
//
// NOTE on imports: stoneSoupEngine imports placeVaults, and this module
// imports the shared monster/item tables back. Both reads happen only
// inside function calls (never at module-evaluation time), so the cycle
// is safe. Vaults are data, not code: adding a vault is one catalog entry.

import type { GroundItem, Monster, Tile, TileKind } from "./stoneSoupEngine";
import { GROUND_ITEM_TEMPLATES, MONSTER_ENTRIES } from "./stoneSoupEngine";

export interface VaultMonsterSpec {
  /** Key into MONSTER_ENTRIES (the dungeon's existing roster). */
  kind: "beast" | "undead" | "cultist" | "guardian";
  /** Vault monsters default awake; dens set this true. */
  asleep?: boolean;
}

export interface VaultItemSpec {
  /** Key into GROUND_ITEM_TEMPLATES (the dungeon's existing loot). */
  template: "potion" | "scroll" | "food" | "relic";
}

export interface VaultDef {
  name: string;
  /** One sentence, shown in the log on first entry. */
  flavor: string;
  tags: string[];
  minDepth: number;
  maxDepth: number;
  weight: number;
  map: string[];
  mons: VaultMonsterSpec[];
  items: VaultItemSpec[];
}

/** A vault stamped into a level. Plain data only (structuredClone-safe). */
export interface PlacedVault {
  name: string;
  flavor: string;
  tags: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  /** "x:y" keys of the stamped walkable cells (announcement + tint). */
  cells: string[];
  announced: boolean;
}

export const VAULT_CATALOG: VaultDef[] = [
  {
    name: "Ember Hoard",
    flavor: "Gold glints in the dark, and something counts it.",
    tags: ["treasure"],
    minDepth: 1,
    maxDepth: 99,
    weight: 20,
    map: ["#######", "#..a..#", "#..1..#", "#..b..#", "#######"],
    mons: [{ kind: "cultist" }],
    items: [{ template: "potion" }, { template: "scroll" }],
  },
  {
    name: "Stalker Den",
    flavor: "The pack sleeps in a tangle of old bones.",
    tags: ["nest"],
    minDepth: 1,
    maxDepth: 99,
    weight: 20,
    map: [" #### ", "#....#", "#.12.#", "#.21.#", "#....#", " #### "],
    mons: [{ kind: "beast", asleep: true }, { kind: "beast", asleep: true }],
    items: [],
  },
  {
    name: "Ashen Shrine",
    flavor: "Ashes drift around a cold altar.",
    tags: ["shrine"],
    minDepth: 1,
    maxDepth: 99,
    weight: 14,
    map: ["#######", "#..A..#", "#.1.2.#", "#..a..#", "#######"],
    mons: [{ kind: "cultist" }, { kind: "cultist" }],
    items: [{ template: "relic" }],
  },
  {
    name: "Warden's Gate",
    flavor: "A warden bars the way, silent as the stone.",
    tags: ["boss", "guardian"],
    minDepth: 2,
    maxDepth: 99,
    weight: 10,
    map: ["########", "#..++..#", "#.1..a.#", "#..++..#", "########"],
    mons: [{ kind: "guardian" }],
    items: [{ template: "potion" }],
  },
  {
    name: "Sunken Gallery",
    flavor: "Black water laps at a drowned gallery.",
    tags: ["water"],
    minDepth: 1,
    maxDepth: 99,
    weight: 12,
    map: ["########", "#~~..~~#", "#~.a..~#", "#~~..b~#", "########"],
    mons: [],
    items: [{ template: "scroll" }, { template: "potion" }],
  },
  {
    name: "Cinder Forge",
    flavor: "The forge still burns, though no smith tends it.",
    tags: ["lava", "forge"],
    minDepth: 3,
    maxDepth: 99,
    weight: 12,
    map: ["########", "#^^..^^#", "#^.1..^#", "#^^..a^#", "########"],
    mons: [{ kind: "guardian" }],
    items: [{ template: "relic" }],
  },
  {
    name: "Bone Crypt",
    flavor: "The dead keep their own counsel here.",
    tags: ["undead", "treasure"],
    minDepth: 2,
    maxDepth: 99,
    weight: 14,
    map: ["#######", "#1...2#", "#.a.b.#", "#2...1#", "#######"],
    mons: [{ kind: "undead" }, { kind: "undead" }],
    items: [{ template: "scroll" }, { template: "potion" }],
  },
  {
    name: "Ambush Passage",
    flavor: "The passage narrows. Something breathes in the dark.",
    tags: ["nest", "corridor"],
    minDepth: 1,
    maxDepth: 99,
    weight: 16,
    map: ["##########", "#1..##..2#", "#....##..#", "#..a.....#", "##########"],
    mons: [{ kind: "beast", asleep: true }, { kind: "beast", asleep: true }],
    items: [{ template: "food" }],
  },
  {
    name: "Collapsed Storehouse",
    flavor: "Crates slump under years of dust.",
    tags: ["treasure", "food"],
    minDepth: 1,
    maxDepth: 99,
    weight: 14,
    map: ["#######", "#.a.b.#", "#.c.d.#", "#.....#", "#######"],
    mons: [],
    items: [
      { template: "food" },
      { template: "food" },
      { template: "potion" },
      { template: "potion" },
    ],
  },
  {
    name: "Veiled Annex",
    flavor: "A hidden annex, veiled from the main gallery.",
    tags: ["secret"],
    minDepth: 2,
    maxDepth: 99,
    weight: 10,
    map: ["######", "#.a..#", "#..b.#", "######"],
    mons: [],
    items: [{ template: "scroll" }, { template: "relic" }],
  },
];

/** DCSS DEPTH-line filtering: which vaults may appear on this floor. */
export function eligibleVaults(floor: number): VaultDef[] {
  return VAULT_CATALOG.filter((def) => floor >= def.minDepth && floor <= def.maxDepth);
}

export interface VaultRng {
  next(): number;
}

const cellKey = (x: number, y: number) => `${x}:${y}`;

/** Tiles the player can stand on. Lava is not walkable (see canStand). */
function isWalkableKind(kind: TileKind): boolean {
  return kind === "floor" || kind === "door" || kind === "stairs" || kind === "altar" || kind === "water";
}

function reachableFrom(tiles: Tile[][], start: { x: number; y: number }): Set<string> {
  const seen = new Set<string>();
  const startTile = tiles[start.y]?.[start.x];
  if (!startTile || !isWalkableKind(startTile.kind)) return seen;
  const queue = [{ x: start.x, y: start.y }];
  seen.add(cellKey(start.x, start.y));
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const tile = tiles[ny]?.[nx];
      if (!tile || !isWalkableKind(tile.kind)) continue;
      const k = cellKey(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

const TERRAIN_GLYPHS: Record<string, TileKind> = {
  "#": "wall",
  ".": "floor",
  "+": "door",
  "~": "water",
  "^": "lava",
  A: "altar",
};

interface StampResult {
  walkableCells: string[];
  monsterSpawns: { spec: VaultMonsterSpec; x: number; y: number }[];
  itemSpawns: { spec: VaultItemSpec; x: number; y: number }[];
}

/**
 * Stamp one vault into `tiles` (mutated in place) and connect it to the
 * level. Returns null when no anchor validates — the caller keeps the
 * level as-is. `forbidden` cells (spawn, stairs, altar, base monsters
 * and items) must never be stamped over. `placedRects` are the bounding
 * boxes of vaults already placed this level; new rects and connectors
 * must not touch them.
 */
function tryPlaceOne(
  tiles: Tile[][],
  def: VaultDef,
  rng: VaultRng,
  floor: number,
  vaultIndex: number,
  forbidden: ReadonlySet<string>,
  placedRects: { x: number; y: number; width: number; height: number }[],
  baseReachable: Set<string>,
  spawn: { x: number; y: number },
): PlacedVault | null {
  const height = tiles.length;
  const width = tiles[0]?.length ?? 0;
  const vHeight = def.map.length;
  const vWidth = Math.max(...def.map.map((row) => row.length));
  if (vWidth === 0 || vHeight === 0 || vWidth > width || vHeight > height) return null;

  // All candidate anchors, shuffled, so placement varies by seed.
  const anchors: { x: number; y: number }[] = [];
  for (let y = 0; y + vHeight <= height; y += 1) {
    for (let x = 0; x + vWidth <= width; x += 1) anchors.push({ x, y });
  }
  for (let i = anchors.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [anchors[i], anchors[j]] = [anchors[j], anchors[i]];
  }

  const overlapsPlaced = (x: number, y: number) =>
    placedRects.some(
      (r) => x < r.x + r.width && x + vWidth > r.x && y < r.y + r.height && y + vHeight > r.y,
    );
  const inPlacedRect = (x: number, y: number) =>
    placedRects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);

  const maxAttempts = Math.min(anchors.length, 60);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const ox = anchors[attempt].x;
    const oy = anchors[attempt].y;
    if (overlapsPlaced(ox, oy)) continue;
    let hitsForbidden = false;
    for (let y = 0; y < vHeight && !hitsForbidden; y += 1) {
      for (let x = 0; x < vWidth; x += 1) {
        if (forbidden.has(cellKey(ox + x, oy + y))) {
          // A forbidden cell inside the rect would be stamped over
          // only if the map actually paints it; spaces are transparent,
          // but rejecting the whole anchor is simpler and safe.
          if (def.map[y][x] !== " ") {
            hitsForbidden = true;
            break;
          }
        }
      }
    }
    if (hitsForbidden) continue;

    // Snapshot everything this attempt may touch, for a clean revert.
    const snapshot = new Map<string, TileKind>();
    const snap = (x: number, y: number) => {
      const k = cellKey(x, y);
      if (!snapshot.has(k)) snapshot.set(k, tiles[y][x].kind);
    };
    for (let y = 0; y < vHeight; y += 1) {
      for (let x = 0; x < vWidth; x += 1) snap(ox + x, oy + y);
    }

    // Stamp the map.
    const stamp: StampResult = { walkableCells: [], monsterSpawns: [], itemSpawns: [] };
    for (let y = 0; y < vHeight; y += 1) {
      const row = def.map[y];
      for (let x = 0; x < row.length; x += 1) {
        const glyph = row[x];
        if (glyph === " ") continue;
        const tx = ox + x;
        const ty = oy + y;
        const terrain = TERRAIN_GLYPHS[glyph];
        if (terrain) {
          tiles[ty][tx].kind = terrain;
          if (isWalkableKind(terrain)) stamp.walkableCells.push(cellKey(tx, ty));
          continue;
        }
        if (glyph >= "1" && glyph <= "9") {
          const spec = def.mons[Number(glyph) - 1];
          tiles[ty][tx].kind = "floor";
          stamp.walkableCells.push(cellKey(tx, ty));
          if (spec) stamp.monsterSpawns.push({ spec, x: tx, y: ty });
          continue;
        }
        if (glyph >= "a" && glyph <= "z") {
          const spec = def.items[glyph.charCodeAt(0) - 97];
          tiles[ty][tx].kind = "floor";
          stamp.walkableCells.push(cellKey(tx, ty));
          if (spec) stamp.itemSpawns.push({ spec, x: tx, y: ty });
          continue;
        }
        // Unknown glyph: leave the tile untouched (defensive).
      }
    }
    if (stamp.walkableCells.length === 0) {
      for (const [k, kind] of snapshot) {
        const [x, y] = k.split(":").map(Number);
        tiles[y][x].kind = kind;
      }
      continue;
    }

    // Connector: from the stamped walkable cell nearest the rect center
    // to the nearest walkable tile outside every rect, carved through
    // wall only (never lava, never another vault's rect).
    const cx = ox + vWidth / 2;
    const cy = oy + vHeight / 2;
    let entry = stamp.walkableCells[0];
    let entryDist = Infinity;
    for (const k of stamp.walkableCells) {
      const [x, y] = k.split(":").map(Number);
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d < entryDist) {
        entryDist = d;
        entry = k;
      }
    }
    const [ex, ey] = entry.split(":").map(Number);
    let target: { x: number; y: number } | null = null;
    let targetDist = Infinity;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x >= ox && x < ox + vWidth && y >= oy && y < oy + vHeight) continue;
        if (inPlacedRect(x, y)) continue;
        if (!isWalkableKind(tiles[y][x].kind)) continue;
        const d = Math.abs(x - ex) + Math.abs(y - ey);
        if (d < targetDist) {
          targetDist = d;
          target = { x, y };
        }
      }
    }
    let carved = false;
    if (target) {
      const orders: ("xFirst" | "yFirst")[] = ["xFirst", "yFirst"];
      for (const order of orders) {
        const path: { x: number; y: number }[] = [];
        let px = ex;
        let py = ey;
        const stepX = () => {
          while (px !== target!.x) {
            px += Math.sign(target!.x - px);
            path.push({ x: px, y: py });
          }
        };
        const stepY = () => {
          while (py !== target!.y) {
            py += Math.sign(target!.y - py);
            path.push({ x: px, y: py });
          }
        };
        if (order === "xFirst") {
          stepX();
          stepY();
        } else {
          stepY();
          stepX();
        }
        // The last path cell is the target itself (already walkable).
        path.pop();
        let blocked = false;
        for (const cell of path) {
          const inThisRect =
            cell.x >= ox && cell.x < ox + vWidth && cell.y >= oy && cell.y < oy + vHeight;
          const kind = tiles[cell.y][cell.x].kind;
          // Lava is never carved, not even the vault's own: the
          // connector must route around it, or the anchor fails.
          if (kind === "lava") {
            blocked = true;
            break;
          }
          if (!inThisRect && inPlacedRect(cell.x, cell.y)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        for (const cell of path) {
          const inThisRect =
            cell.x >= ox && cell.x < ox + vWidth && cell.y >= oy && cell.y < oy + vHeight;
          snap(cell.x, cell.y);
          if (tiles[cell.y][cell.x].kind === "wall") {
            tiles[cell.y][cell.x].kind = "floor";
            // Punching through the vault's own border wall makes a
            // doorway: it joins the vault's walkable cells.
            if (inThisRect) stamp.walkableCells.push(cellKey(cell.x, cell.y));
          }
        }
        carved = true;
        break;
      }
    }
    if (!carved) {
      for (const [k, kind] of snapshot) {
        const [x, y] = k.split(":").map(Number);
        tiles[y][x].kind = kind;
      }
      continue;
    }

    // Accessibility validation: stairs reachable, every stamped
    // walkable cell reachable, and no previously reachable cell that
    // is STILL walkable cut off. Cells the vault itself turned to wall
    // are gone, not disconnected — exempting them is the fix for the
    // first version of this check, which rejected every anchor whose
    // rect painted over any previously reachable floor (i.e. nearly
    // every anchor, so no vault ever placed).
    const reachable = reachableFrom(tiles, spawn);
    const stairsReachable = [...reachable].some((k) => {
      const [x, y] = k.split(":").map(Number);
      return tiles[y][x].kind === "stairs";
    });
    const vaultReachable = stamp.walkableCells.every((k) => reachable.has(k));
    const nothingLost = [...baseReachable].every((k) => {
      const [x, y] = k.split(":").map(Number);
      return !isWalkableKind(tiles[y][x].kind) || reachable.has(k);
    });
    if (!stairsReachable || !vaultReachable || !nothingLost) {
      for (const [k, kind] of snapshot) {
        const [x, y] = k.split(":").map(Number);
        tiles[y][x].kind = kind;
      }
      continue;
    }

    // Commit spawns (ids unique per level/vault/slot).
    const multiplier = 1 + (floor - 1) * 0.18;
    const monsters: Monster[] = stamp.monsterSpawns.map(({ spec, x, y }, i) => {
      const entry = MONSTER_ENTRIES.find((e) => e.kind === spec.kind) ?? MONSTER_ENTRIES[0];
      return {
        id: `monster-vault-${floor}-${vaultIndex}-${i}`,
        name: entry.name,
        glyph: entry.glyph,
        color: entry.color,
        x,
        y,
        hp: Math.round(entry.hp * multiplier),
        maxHp: Math.round(entry.hp * multiplier),
        attack: Math.round(entry.attack * multiplier),
        armor: entry.armor,
        xp: entry.xp,
        kind: entry.kind,
        asleep: spec.asleep ?? false,
      };
    });
    const groundItems: GroundItem[] = stamp.itemSpawns.map(({ spec, x, y }, i) => {
      const template = GROUND_ITEM_TEMPLATES[spec.template];
      return { id: `item-vault-${floor}-${vaultIndex}-${i}`, ...template, x, y };
    });
    const placed: PlacedVault & { monsters: Monster[]; groundItems: GroundItem[] } = {
      name: def.name,
      flavor: def.flavor,
      tags: [...def.tags],
      x: ox,
      y: oy,
      width: vWidth,
      height: vHeight,
      cells: stamp.walkableCells,
      announced: false,
      monsters,
      groundItems,
    };
    return placed;
  }
  return null;
}

export interface VaultPlacement {
  placed: PlacedVault[];
  monsters: Monster[];
  groundItems: GroundItem[];
}

/**
 * Placement pass: stamp 1-3 eligible vaults into `tiles` (mutated in
 * place) and return the placed records plus spawned entities. Never
 * throws for a bad catalog entry: a vault that cannot validate is
 * skipped, and a level with no valid anchor keeps zero vaults.
 */
export function placeVaults(
  tiles: Tile[][],
  rng: VaultRng,
  floor: number,
  forbidden: ReadonlySet<string>,
  spawn: { x: number; y: number },
): VaultPlacement {
  const baseReachable = reachableFrom(tiles, spawn);
  const eligible = eligibleVaults(floor);
  if (eligible.length === 0 || baseReachable.size === 0) {
    return { placed: [], monsters: [], groundItems: [] };
  }
  let count = 1;
  if (rng.next() < 0.55) count += 1;
  if (floor >= 3 && rng.next() < 0.25) count += 1;
  count = Math.min(count, eligible.length, 3);

  // Weighted pick without replacement.
  const pool = [...eligible];
  const picked: VaultDef[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, def) => sum + def.weight, 0);
    let roll = rng.next() * total;
    let index = 0;
    for (; index < pool.length; index += 1) {
      roll -= pool[index].weight;
      if (roll <= 0) break;
    }
    if (index >= pool.length) index = pool.length - 1;
    picked.push(pool.splice(index, 1)[0]);
  }

  const placed: PlacedVault[] = [];
  const monsters: Monster[] = [];
  const groundItems: GroundItem[] = [];
  const placedRects: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < picked.length; i += 1) {
    const result = tryPlaceOne(
      tiles,
      picked[i],
      rng,
      floor,
      i,
      forbidden,
      placedRects,
      baseReachable,
      spawn,
    ) as (PlacedVault & { monsters: Monster[]; groundItems: GroundItem[] }) | null;
    if (!result) continue;
    const { monsters: m, groundItems: g, ...record } = result;
    placed.push(record);
    monsters.push(...m);
    groundItems.push(...g);
    placedRects.push({ x: record.x, y: record.y, width: record.width, height: record.height });
  }
  return { placed, monsters, groundItems };
}
