// BUILD 929: Named dungeon uniques, in the DCSS `place_unique` shape.
//
// Portable asset only: the PATTERN from
// `~/workspace/rea-targets/dcss/ANALYSIS.md` §4 — a named monster that
// appears at most once per game, placed by a tiny vault (NAME / DEPTH /
// WEIGHT / TAGS: place_unique). Every unique below is ORIGINAL content
// written for this game's Ember Vault dungeon (its own names, lore,
// roster bases, and chamber maps). No DCSS unique is copied: no Sigmund,
// no DCSS names, no DCSS stat blocks. DCSS's own uniques live in
// `dat/des/builder/uniques.des`; nothing from that file is reproduced
// here — only the idea that a boss is a named definition plus a small
// chamber vault.
//
// Scope note: the dungeon is not persisted across sessions by design
// (React useState; `restart` = fresh `createGame`), so "one per game"
// here means one per RUN: the GameState carries `spawnedUniques`, and
// `descend` preserves it. A unique placed on an earlier floor — killed
// or left alive — never spawns again on any later floor of the same run.
// A fresh run starts with an empty set.
//
// Mechanics are deliberately engine-native: a unique is its roster base
// with boosted stats plus a guard band (the DCSS "unique in bands"
// pattern), placed through the 927 vault pass (placeSingleVault), so
// placement + reachability guarantees come free. No new AI, no new
// art: the unique reuses its base's glyph/color, and its name + title
// travel in the existing log lines.

import {
  placeSingleVault,
  reachableWalkableCells,
  type PlacedVault,
  type VaultDef,
} from "./dungeonVaults";
import type { GroundItem, Monster, Tile } from "./stoneSoupEngine";

export interface UniqueDef {
  /** Stable id, recorded in GameState.spawnedUniques. */
  id: string;
  /** Display name (the monster's `name` field). */
  name: string;
  /** Epithet, shown in encounter/death lines ("Grimmaw, the Hollow Alpha"). */
  title: string;
  /** Roster base the unique builds on. */
  base: "beast" | "undead" | "cultist" | "guardian";
  minDepth: number;
  maxDepth: number;
  weight: number;
  /** Stat boosts over the base entry (after the floor multiplier). */
  hpMult: number;
  attackMult: number;
  armorBonus: number;
  xpMult: number;
  /** The tiny chamber vault this unique is placed by. */
  chamber: VaultDef;
}

const uniqueSpec = (def: UniqueDef) => ({
  id: def.id,
  name: def.name,
  title: def.title,
  hpMult: def.hpMult,
  attackMult: def.attackMult,
  armorBonus: def.armorBonus,
  xpMult: def.xpMult,
});

export const UNIQUE_DEFS: UniqueDef[] = [
  {
    id: "grimmaw",
    name: "Grimmaw",
    title: "the Hollow Alpha",
    base: "beast",
    minDepth: 1,
    maxDepth: 99,
    weight: 10,
    hpMult: 2.5,
    attackMult: 1.5,
    armorBonus: 1,
    xpMult: 3,
    chamber: {
      name: "Grimmaw's Hollow",
      flavor: "The pack's alpha stirs in a hollow of old bones.",
      tags: ["place_unique", "nest", "boss"],
      minDepth: 1,
      maxDepth: 99,
      weight: 10,
      map: [
        " ####### ",
        "#.......#",
        "#.2...3.#",
        "#...1...#",
        "#.......#",
        " ####### ",
      ],
      mons: [
        { kind: "beast" },
        { kind: "beast", asleep: true },
        { kind: "beast", asleep: true },
      ],
      items: [],
    },
  },
  {
    id: "vexa",
    name: "Mother Vexa",
    title: "the Ember Matron",
    base: "cultist",
    minDepth: 2,
    maxDepth: 99,
    weight: 10,
    hpMult: 2.5,
    attackMult: 1.4,
    armorBonus: 1,
    xpMult: 3,
    chamber: {
      name: "Vexa's Ashen Chapel",
      flavor: "A high priestess of the ash cult keeps her chapel.",
      tags: ["place_unique", "shrine", "boss"],
      minDepth: 2,
      maxDepth: 99,
      weight: 10,
      map: [
        "#########",
        "#...A...#",
        "#.2..1..3#",
        "#...a...#",
        "#########",
      ],
      mons: [
        { kind: "cultist" },
        { kind: "cultist" },
        { kind: "cultist" },
      ],
      items: [{ template: "relic" }],
    },
  },
  {
    id: "morvain",
    name: "Scribe Morvain",
    title: "Keeper of Bone",
    base: "undead",
    minDepth: 2,
    maxDepth: 99,
    weight: 10,
    hpMult: 2.5,
    attackMult: 1.5,
    armorBonus: 1,
    xpMult: 3,
    chamber: {
      name: "Morvain's Bone Archive",
      flavor: "The dead keep their ledgers here, and one scribe still reads them.",
      tags: ["place_unique", "undead", "boss"],
      minDepth: 2,
      maxDepth: 99,
      weight: 10,
      map: [
        "########",
        "#2....3#",
        "#..1...#",
        "#..a...#",
        "########",
      ],
      mons: [
        { kind: "undead" },
        { kind: "undead" },
        { kind: "undead" },
      ],
      items: [{ template: "scroll" }],
    },
  },
  {
    id: "karst",
    name: "Warden Karst",
    title: "the Last Warden",
    base: "guardian",
    minDepth: 3,
    maxDepth: 99,
    weight: 10,
    hpMult: 2.5,
    attackMult: 1.1,
    armorBonus: 1,
    xpMult: 4,
    chamber: {
      name: "Karst's Final Vigil",
      flavor: "The last warden of the Ember Vault has not left his post.",
      tags: ["place_unique", "boss", "guardian"],
      minDepth: 3,
      maxDepth: 99,
      weight: 10,
      map: [
        "########",
        "#..++..#",
        "#..1...#",
        "#..a...#",
        "########",
      ],
      mons: [{ kind: "guardian" }],
      items: [{ template: "relic" }],
    },
  },
];

// The chamber maps above use digit '1' for the unique itself; fill the
// unique spec in now that the defs exist (avoids a forward reference
// inside the literal).
for (const def of UNIQUE_DEFS) {
  const slot = def.chamber.mons[0];
  if (slot) slot.unique = uniqueSpec(def);
}

/** DCSS DEPTH-line filtering + the one-per-run exclusion. */
export function eligibleUniques(
  floor: number,
  spawned: ReadonlySet<string>,
): UniqueDef[] {
  return UNIQUE_DEFS.filter(
    (def) =>
      floor >= def.minDepth && floor <= def.maxDepth && !spawned.has(def.id),
  );
}

export interface UniquePlacement {
  placed: PlacedVault;
  monsters: Monster[];
  groundItems: GroundItem[];
  uniqueId: string;
}

/**
 * Place at most ONE unique chamber on this floor: weighted pick from
 * the eligible, unspawned uniques, stamped through the regular vault
 * machinery (same anchor/connector/reachability validation, against
 * the post-regular-vault level). Returns null when no unique is
 * eligible or no anchor validates — the unique simply doesn't appear
 * this run; a level is never broken to place a boss.
 */
export function placeUniqueChamber(
  tiles: Tile[][],
  rng: { next(): number },
  floor: number,
  forbidden: ReadonlySet<string>,
  placedRects: { x: number; y: number; width: number; height: number }[],
  spawn: { x: number; y: number },
  spawned: ReadonlySet<string>,
): UniquePlacement | null {
  const eligible = eligibleUniques(floor, spawned);
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
    def.chamber,
    rng,
    floor,
    forbidden,
    placedRects,
    baseReachable,
    spawn,
    `vault-unique-${floor}-${def.id}`,
  );
  if (!result) return null;
  return { ...result, uniqueId: def.id };
}
