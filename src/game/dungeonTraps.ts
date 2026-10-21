// BUILD 931: Dungeon trap vaults, in the DCSS triggerable shape.
//
// Portable asset only: the PATTERN from
// `~/workspace/rea-targets/dcss/ANALYSIS.md` §6 — a trap vault is an
// authored room with a trigger glyph and a callback, not an engine
// special (DCSS's `dat/des/traps/rats_trap.des`: a pressure plate whose
// step callback crumbles marked wall cells and releases the rats in
// the wall). Every trap below is ORIGINAL content written for this
// game's Ember Vault dungeon (its own names, roster kinds, and loot).
// No DCSS trap vault is copied: no rats_trap map, no DCSS monster or
// item tables — only the idea that stepping a plate fires a callback.
//
// How it composes (no competing system):
// - Placement runs through the 927 vault machinery (placeSingleVault),
//   LAST — after regular vaults, the unique chamber, and the shop — so
//   anchor/connector/reachability guarantees come free, and the trap's
//   vault record joins state.vaults (first entry announces it, its
//   tiles get the gold-ring tint, exactly like any other vault).
// - A trap vault's MAP is terrain only (walls/floors). The trigger
//   metadata lives beside it, in local (map-relative) coordinates:
//   `plates` must be `.` floor cells; every `release`/`cache` cell
//   must be a `#` wall cell orthogonally adjacent to a `.` floor
//   cell of the same map. That adjacency is the whole safety proof:
//   crumbling a hidden cell can only ADD a floor cell next to an
//   already-reachable vault floor, so post-trigger reachability can
//   never be worse than pre-trigger reachability — and the vault
//   validation already proved the pre-trigger level reachable.
//   (A connector may carve a hidden cell to floor early; the trigger
//   still spawns there, so the trap still works — only the crumble
//   visual for that one cell is lost.)
// - The trigger itself lives in the engine's step(): stepping onto an
//   armed plate fires it. Placement, sight, and monster wandering
//   never fire it — only the player's own step does. Blink (Veil
//   Step) teleports and does not step, so it does not trigger plates
//   (documented limit, not an oversight to fix silently later).
// - Firing is exactly-once: the PlacedTrap's `fired` flag is checked
//   before firing and set as the first mutation. Released monsters
//   and cache items are plain engine entities afterwards (normal
//   stats, normal loot, normal death) — nothing special-case in
//   combat, victory, or defeat.
// - Scope note, same as uniques/shops: the dungeon is not persisted
//   across sessions by design, so a trap lives for its floor only.
//   Within a floor, `fired` persists across every action because the
//   trap lives in the same GameState object every action mutates.

import {
  placeSingleVault,
  reachableWalkableCells,
  type PlacedVault,
  type VaultDef,
} from "./dungeonVaults";
import type { Tile } from "./stoneSoupEngine";

/** A trap already stamped into a level. Plain data only (clone-safe). */
export interface PlacedTrap {
  id: string;
  vaultName: string;
  kind: "release" | "cache";
  /** Log line spoken when the trap fires. */
  triggerLine: string;
  /** "x:y" keys of the pressure plates (absolute). */
  plates: string[];
  /** Cells that crumble to floor and spawn a monster (absolute). */
  release: { x: number; y: number; kind: "beast" | "undead" | "cultist" | "guardian" }[];
  /** Cells that crumble to floor and spawn loot (absolute). */
  cache: { x: number; y: number; template: "potion" | "scroll" | "food" | "relic" }[];
  /** Exactly-once: set on the first firing, never reset within a run. */
  fired: boolean;
}

export interface TrapVaultDef {
  id: string;
  name: string;
  flavor: string;
  triggerLine: string;
  kind: "release" | "cache";
  tags: string[];
  minDepth: number;
  maxDepth: number;
  weight: number;
  /** Terrain-only map: walls/floors. No monster/item glyphs — the trap's
   * payload is metadata below, so nothing spawns at placement time. */
  vault: VaultDef;
  /** Local coords of pressure plates; must be `.` cells in vault.map. */
  plates: { x: number; y: number }[];
  /** Local coords of wall cells that crumble and release a monster. */
  release: { x: number; y: number; kind: "beast" | "undead" | "cultist" | "guardian" }[];
  /** Local coords of wall cells that crumble and reveal loot. */
  cache: { x: number; y: number; template: "potion" | "scroll" | "food" | "relic" }[];
}

export const TRAP_VAULT_DEFS: TrapVaultDef[] = [
  {
    id: "gnawed-warren",
    name: "The Gnawed Warren",
    flavor: "A pressure plate glints in the center of the floor. The walls look gnawed.",
    triggerLine: "You step on a pressure plate! The gnawed walls crumble and beasts pour out!",
    kind: "release",
    tags: ["trap", "release"],
    minDepth: 1,
    maxDepth: 99,
    weight: 10,
    vault: {
      name: "The Gnawed Warren",
      flavor: "A pressure plate glints in the center of the floor. The walls look gnawed.",
      tags: ["trap", "release"],
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
    plates: [{ x: 3, y: 2 }],
    // Border-wall cells: each faces a stamped floor cell, so the
    // released beast always lands adjacent to reachable floor.
    release: [
      { x: 1, y: 0, kind: "beast" },
      { x: 5, y: 0, kind: "beast" },
      { x: 3, y: 4, kind: "beast" },
    ],
    cache: [],
  },
  {
    id: "sealed-cache",
    name: "The Sealed Cache",
    flavor: "A pressure plate waits beside a sealed block of masonry. Something glints behind it.",
    triggerLine: "You step on a pressure plate! The masonry collapses, revealing a hidden cache!",
    kind: "cache",
    tags: ["trap", "cache"],
    minDepth: 2,
    maxDepth: 99,
    weight: 10,
    vault: {
      name: "The Sealed Cache",
      flavor: "A pressure plate waits beside a sealed block of masonry. Something glints behind it.",
      tags: ["trap", "cache"],
      minDepth: 2,
      maxDepth: 99,
      weight: 10,
      map: [
        "#######",
        "#.....#",
        "#.....#",
        "#.###.#",
        "#######",
      ],
      mons: [],
      items: [],
    },
    plates: [{ x: 3, y: 2 }],
    release: [],
    // Interior wall block: each cell faces a stamped floor cell above
    // it (row 2), so the cache floor is reachable the moment it opens.
    cache: [
      { x: 2, y: 3, template: "potion" },
      { x: 3, y: 3, template: "scroll" },
      { x: 4, y: 3, template: "food" },
    ],
  },
];

/** Chance a floor attempts a trap at all (DCSS trap vaults are occasional). */
export const TRAP_FLOOR_CHANCE = 0.6;

/** DCSS DEPTH-line filtering for trap vaults. */
export function eligibleTrapVaults(floor: number): TrapVaultDef[] {
  return TRAP_VAULT_DEFS.filter((def) => floor >= def.minDepth && floor <= def.maxDepth);
}

/**
 * Geometry validation for one trap def, pure and map-local: plates must
 * be stamped floor cells; every hidden cell must be a stamped wall
 * cell orthogonally adjacent to a stamped floor cell. A def that fails
 * this is never placed — the trigger could otherwise strand a spawn
 * in an unreachable pocket. Checked at placement time (defensive) and
 * asserted in the sim catalog block.
 */
export function trapDefGeometryValid(def: TrapVaultDef): boolean {
  const rows = def.vault.map;
  const at = (x: number, y: number): string | undefined => rows[y]?.[x];
  const isFloor = (x: number, y: number): boolean => at(x, y) === ".";
  for (const p of def.plates) {
    if (!isFloor(p.x, p.y)) return false;
  }
  const hidden = [...def.release, ...def.cache];
  for (const h of hidden) {
    if (at(h.x, h.y) !== "#") return false;
    const adjacentFloor =
      isFloor(h.x + 1, h.y) || isFloor(h.x - 1, h.y) ||
      isFloor(h.x, h.y + 1) || isFloor(h.x, h.y - 1);
    if (!adjacentFloor) return false;
  }
  return hidden.length > 0 && def.plates.length > 0;
}

export interface TrapPlacement {
  placed: PlacedVault;
  trap: PlacedTrap;
}

/**
 * Place at most ONE trap vault on this floor, after the regular vaults,
 * the unique chamber, and the shop (so placedRects already covers
 * them). Returns null when the roll fails, no def is eligible, the
 * geometry is invalid, or no anchor validates — the floor simply has
 * no trap; a level is never broken to place one.
 */
export function placeTrap(
  tiles: Tile[][],
  rng: { next(): number },
  floor: number,
  forbidden: ReadonlySet<string>,
  placedRects: { x: number; y: number; width: number; height: number }[],
  spawn: { x: number; y: number },
): TrapPlacement | null {
  if (rng.next() >= TRAP_FLOOR_CHANCE) return null;
  const eligible = eligibleTrapVaults(floor).filter(trapDefGeometryValid);
  if (eligible.length === 0) return null;
  const total = eligible.reduce((sum, def) => sum + def.weight, 0);
  let roll = rng.next() * total;
  let index = 0;
  for (; index < eligible.length; index += 1) {
    roll -= eligible[index].weight;
    if (roll <= 0) break;
  }
  if (index >= eligible.length) index = eligible.length - 1;
  const def = eligible[index];
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
    `trap-${floor}-${def.id}`,
  );
  if (!result) return null;
  const ox = result.placed.x;
  const oy = result.placed.y;
  const trap: PlacedTrap = {
    id: `trap-${floor}-${def.id}`,
    vaultName: def.name,
    kind: def.kind,
    triggerLine: def.triggerLine,
    plates: def.plates.map((p) => `${ox + p.x}:${oy + p.y}`),
    release: def.release.map((r) => ({ x: ox + r.x, y: oy + r.y, kind: r.kind })),
    cache: def.cache.map((c) => ({ x: ox + c.x, y: oy + c.y, template: c.template })),
    fired: false,
  };
  return { placed: result.placed, trap };
}
