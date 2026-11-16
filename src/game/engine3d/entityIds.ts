/**
 * BUILD 1063 — F-1 entity identity: every entity the living world
 * reasons about gets a STABLE identity — one string that names the
 * same tree, founder, building, animal, or deposit across ticks,
 * saves, and reloads, so the coordinator (1062), the resource
 * registry (R-1), and the job scheduler (J-1) can all refer to the
 * same thing without re-deriving it from where it happens to stand.
 *
 * AUDIT (traced before any code — what identity each kind had):
 * - FOUNDERS: name only. livingWorld.ts derived 'founder-' + name
 *   on every advance — the same founder got the same string, but
 *   only because the name never changes, and nothing in the save
 *   carried the identity. A rename (or two founders sharing a name)
 *   would silently re-key the founder.
 * - TREES / ROCKS / CRATES: position only (TilePoint lists in the
 *   world; removedTrees/removedWildTrees are "x,y" key sets). A tree
 *   does not move, so its tile IS its identity — but nothing said
 *   so, and every consumer re-derived the key by hand.
 * - WILD TREES: a hash rule, not a list — wildTreeAt(tx, ty) — so
 *   their identity is also their (out-of-map) tile.
 * - ANIMALS: already stable — AnimalActor.id is kind + '-' + slotId
 *   (animals.ts spawn), the fixed GPU slot. This module just names
 *   the rule so nothing re-derives it by hand.
 * - BUILDINGS / DEPOSITS / ALL PLACED ITEMS: kind + rect + rotation
 *   (placements.ts samePlacement, BUILD 1036) — positional, and it
 *   BREAKS on move or rotation: a moved house is the same building
 *   under a new rect. F-1 gives PlacedItem a stored `id` instead.
 * - OLD ROSTER NPCs (townsfolk3d.ts RosterNpc3D, gated off): name
 *   only, like the founders. Derived here, stored nowhere — the
 *   roster is gated off, so no save changes for it.
 *
 * THE RULES:
 * - An id is a string, kind-prefixed, human-readable in a probe
 *   ("tree:122,122", "founder-Marlow", "placed:house:126,119").
 * - Stationary world things (trees, rocks, crates, wild trees) are
 *   identified BY their tile: the id is derived, never stored — the
 *   world save does not grow by ~830 ids, and a chopped tree's id
 *   dies with the tree (it no longer exists). A regrown tree on a
 *   new tile is a NEW tree with a new id; regrowth never re-plants
 *   a chopped tile (the 987/989 rule), so a tile's id is never
 *   re-issued to a different tree.
 * - Actors (founders) carry a stored `id` in their save (founders
 *   v4) — derived from the name at creation/migration, then
 *   permanent. A stored id is authoritative: migration never
 *   re-derives it, so a rename keeps the identity.
 * - Placed items carry a stored `id` (PlacedItem.id, optional in
 *   the type so old saves load) — assigned at creation by
 *   addPlacement, carried on move, and filled in by migration on
 *   load for old saves. The derivation is kind + origin tile, with
 *   a :2/:3 suffix when two items would collide (path+grass stacks
 *   share tiles; a paste that copies an id collides with the
 *   original). Assignment is deterministic given the list order,
 *   and idempotent: a second pass assigns nothing.
 * - Animals keep their existing kind + '-' + slotId rule, now
 *   through animalId() instead of inline concatenation.
 *
 * Pure module (no imports at all — the PlacedItem shape below is
 * structural, so no module in the game imports this one at runtime
 * and nothing here imports the game). The sim and the standalone
 * asserts import it directly.
 */

/** The entity kinds an id can name. */
export type EntityKind = 'founder' | 'npc' | 'tree' | 'wild-tree' | 'rock' | 'crate' | 'animal' | 'placed' | 'job';

/** A founder's stable id: 'founder-' + name (the same string the
 *  1062 coordinator derived on every advance — now stored in the
 *  founders save v4 instead of re-derived, so the coordinator's
 *  view of founder identity does not change). */
export function founderIdFor(name: string): string {
  return 'founder-' + name;
}

/** An old-roster NPC's id, derived from the stored name (the roster
 *  is gated off; no save change — the helper just names the rule). */
export function npcSpawnIdFor(name: string): string {
  return 'npc-' + name;
}

/** A stored tree's id: its tile. One tree per tile, and a tree
 *  never moves — the tile IS the identity. */
export function treeId(tx: number, ty: number): string {
  return 'tree:' + Math.floor(tx) + ',' + Math.floor(ty);
}

/** A wild (out-of-map, hash-rule) tree's id: its tile. */
export function wildTreeId(tx: number, ty: number): string {
  return 'wild-tree:' + Math.floor(tx) + ',' + Math.floor(ty);
}

/** A stored rock's id: its tile. */
export function rockId(tx: number, ty: number): string {
  return 'rock:' + Math.floor(tx) + ',' + Math.floor(ty);
}

/** A crate's id: its tile (crates render as trees since 986). */
export function crateId(tx: number, ty: number): string {
  return 'crate:' + Math.floor(tx) + ',' + Math.floor(ty);
}

/** An animal's id: kind + '-' + slotId (the existing animals.ts
 *  rule — the fixed GPU slot, stable for the animal's life in the
 *  session; animals are session-only, so the id is not saved). */
export function animalId(kind: string, slotId: number): string {
  return kind + '-' + Math.floor(slotId);
}

/**
 * BUILD 1065 (J-1): a job's stable id — 'job:' + kind + ':' +
 * target id ("job:chop:tree:122,122", "job:build:hut-site",
 * "job:deliver:founder-Marlow"). The id is derived from the job's
 * kind and target, never stored — a job is re-discovered from the
 * world on load, and the same work gets the same id, so a claim
 * can be re-established after a reload without a save change. A
 * job's target is unique per kind (one tree per tile, one hut
 * site, one carrier per founder), so a job id never collides with
 * another live job of the same kind.
 */
export function jobIdFor(kind: 'chop' | 'build' | 'deliver', targetId: string): string {
  return 'job:' + kind + ':' + targetId;
}

/** The kind an id names, from its prefix — or null when the string
 *  is not an id this module (or the older animal/founder rules)
 *  produces. R-1/J-1 dispatch on this. */
export function entityKindOf(id: string): EntityKind | null {
  if (typeof id !== 'string' || id.length === 0) return null;
  if (id.startsWith('founder-')) return 'founder';
  if (id.startsWith('npc-')) return 'npc';
  if (id.startsWith('tree:')) return 'tree';
  if (id.startsWith('wild-tree:')) return 'wild-tree';
  if (id.startsWith('rock:')) return 'rock';
  if (id.startsWith('crate:')) return 'crate';
  if (id.startsWith('placed:')) return 'placed';
  if (id.startsWith('job:')) return 'job';
  // Animals are kind + '-' + slotId (bird-0, goat-2, ...): a bare
  // word, a dash, and a non-negative integer — and nothing else
  // this module produces looks like that.
  const m = /^(bird|goat|deer|wolf|chicken)-(\d+)$/.exec(id);
  if (m) return 'animal';
  return null;
}

// --- Placed items: stored stable ids. ---

/** The structural shape assignPlacementIds / ensurePlacementId
 *  need — PlacedItem satisfies it, so no import of placements.ts
 *  (and no cycle: placements.ts imports this module). */
export type PlacedItemLike = {
  kind: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  id?: string;
};

/** The derived id for a placed item: kind + origin tile. The
 *  origin is the min corner, which survives rotation (the stored
 *  rect is the footprint AFTER rotation) — but the id is only the
 *  DERIVATION: once stored, a move or rotation keeps the id, so
 *  the same building keeps its identity wherever it is put. */
export function placedItemIdBase(item: PlacedItemLike): string {
  return 'placed:' + item.kind + ':' + Math.floor(item.x0) + ',' + Math.floor(item.y0);
}

/** True when a value is a usable stored id (a non-empty string). */
export function isStoredId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function dedupeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(base + ':' + n)) n++;
  return base + ':' + n;
}

/**
 * Ensure one placed item has a stable id. A stored id is kept —
 * it is authoritative, even if it does not match the derivation
 * (a moved or rotated building keeps the id it was given) — unless
 * another item in `items` already holds it (a paste that copied
 * the id, or a corrupt save), in which case a fresh derived id is
 * assigned. The item is mutated in place and the id is returned.
 * Pure apart from the mutation (the caller saves the world).
 */
export function ensurePlacementId(item: PlacedItemLike, items: readonly PlacedItemLike[]): string {
  const taken = new Set<string>();
  for (const p of items) {
    if (p !== item && isStoredId(p.id)) taken.add(p.id);
  }
  if (isStoredId(item.id) && !taken.has(item.id)) return item.id;
  const id = dedupeId(placedItemIdBase(item), taken);
  item.id = id;
  return id;
}

/**
 * Fill in stable ids for every placed item that lacks one (old
 * saves, template stamps, anything built before ids existed).
 * Deterministic given the list order, and idempotent: a second
 * pass assigns nothing, because every item already holds an id.
 * Returns how many ids were assigned (0 = nothing to migrate).
 * Mutates the items in place; the caller saves the world when the
 * count is > 0.
 */
export function assignPlacementIds(items: PlacedItemLike[]): number {
  const taken = new Set<string>();
  for (const p of items) if (isStoredId(p.id)) taken.add(p.id);
  let assigned = 0;
  for (const item of items) {
    if (isStoredId(item.id)) continue;
    // Re-check against ids assigned earlier in this same pass
    // (ensurePlacementId's per-item scan would miss them).
    const id = dedupeId(placedItemIdBase(item), taken);
    item.id = id;
    taken.add(id);
    assigned++;
  }
  return assigned;
}
