// gathering.ts — NEURON HEX 0x2D (BUILD 1110). The physical gathering engine.
//
// The user's spec section 1: every resource has health, a required
// tool, hit feedback + sound, drops, and a respawn/regrowth timer; a
// felled tree leaves a temporary stump. Before this build the E-key
// was instant — one press felled a whole tree, mined a whole rock —
// and a mineral deposit only answered Examine ("mining it is Phase 2"
// — the 1081 comment; Phase 2 is now).
//
// Pure module (no React, no WebGL, no localStorage) so the sim and
// the standalone asserts can import it directly. The only impure
// piece is playGatherSound, which is a guarded no-op without a
// window (the sim never calls it) — there is no sound system in the
// game anywhere else, so the hit feedback sound lives here as a
// minimal lazy WebAudio blip, no assets.
//
// The node state lives ON the world (IsoWorld.gatherHealth /
// gatheredAt / stumps, all optional — old saves load without them):
// saveWorld is a full JSON.stringify, so the state persists with the
// world save for free, and the settlement sim's worlds simply have
// none of it (the sim never gathers, so M1069 never moves).
//
// DESIGN (decided, stated):
// - Health: tree 6, rock 6, bush 2, herb 1; a deposit's health IS
//   its remaining (a hit extracts `damage` ore).
// - Tools speed gathering, never hard-gate it: hand = 1 damage vs
//   everything, the right tool = 3 (wooden) or 6 (stone). A broken
//   axe far from camp must not soft-lock gathering — the player can
//   still work slowly by hand and craft a new tool.
// - Yields: tree 2 wood, rock 1 stone, deposit `damage` ore, bush
//   1 stick + 1 fibre + 1 berry, herb 2 herbs.
// - Regrowth: bush/herb 1 day, rock 3 days (rocks never regrew
//   before — this keeps the world from being strip-mined bare);
//   deposits NEVER regrow (the 1081 rule: remaining 0 stays
//   mined-out); trees regrow via the existing sapling path, and the
//   stump is removed when the sapling matures (applyMaturedTrees).
// - Only GENERATED bushes/herbs are gatherable (the hash rule, like
//   wild trees). Placed bushes (Build mode) and garden plants are
//   tended decor, not wild resources — gathering them would fight
//   Build-mode ownership.

import { treeId, wildTreeId, rockId } from './entityIds';
import { depositIdFor } from './geology';
import type { IsoWorld } from '../iso/isoWorld';

/** What can be gathered. */
export type GatherNodeKind = 'tree' | 'rock' | 'deposit' | 'bush' | 'herb';

/** A node the player is standing beside: its kind, its stable id,
//  its tile, and (for a deposit) its mineral + registry deposit id. */
export interface GatherNode {
  kind: GatherNodeKind;
  /** Stable node id — the key into world.gatherHealth/gatheredAt. */
  id: string;
  x: number;
  y: number;
  /** Deposit only: the mineral kind ('iron' | 'copper' | ...). */
  mineral?: string;
  /** Deposit only: the registry deposit id (deposit:mineral:x,y). */
  depositId?: string;
}

/** Full health of a node kind (a deposit's health is its remaining
 *  — see maxHealthForNode — so deposits carry no fixed number). */
export const NODE_HEALTH: Record<Exclude<GatherNodeKind, 'deposit'>, number> = {
  tree: 6,
  rock: 6,
  bush: 2,
  herb: 1,
};

/** Days before a depleted node regrows (deposits: never). */
export const NODE_REGROW_DAYS: Record<Exclude<GatherNodeKind, 'deposit'>, number> = {
  tree: 0, // trees regrow via the sapling path, not gatheredAt
  rock: 3,
  bush: 1,
  herb: 1,
};

/** Node ids. Trees/rocks reuse the F-1 entity ids; bushes and herbs
 *  are hash-rule nodes like wild trees, so their ids are plain
 *  `kind:x,y` strings. */
export function nodeIdFor(kind: GatherNodeKind, x: number, y: number, mineral?: string, wild?: boolean): string {
  if (kind === 'tree') return wild ? wildTreeId(x, y) : treeId(x, y);
  if (kind === 'rock') return rockId(x, y);
  if (kind === 'deposit') return depositIdFor((mineral ?? 'iron') as 'iron' | 'copper' | 'coal' | 'gold' | 'silver' | 'stone', x, y);
  return kind + ':' + x + ',' + y;
}

/** Full health of a node: the fixed number above, or a deposit's
 *  current remaining (its health IS its remaining). */
export function maxHealthForNode(node: GatherNode, depositRemaining?: number): number {
  if (node.kind === 'deposit') return Math.max(0, Math.floor(depositRemaining ?? 0));
  return NODE_HEALTH[node.kind];
}

/** Remaining health of a node in this world (absent = untouched =
 *  full health). */
export function healthOf(world: IsoWorld, node: GatherNode, depositRemaining?: number): number {
  // A deposit's health IS its remaining — never a stored value: a
  // founder's mine can drop the remaining under any stored health,
  // and a stale stored value would let the player over-extract.
  if (node.kind === 'deposit') return maxHealthForNode(node, depositRemaining);
  const stored = world.gatherHealth?.[node.id];
  if (stored !== undefined && Number.isFinite(stored)) return Math.max(0, Math.floor(stored));
  return maxHealthForNode(node, depositRemaining);
}

/** True when a bush/herb/rock tile is recorded as gathered in
 *  this world (its regrowth has not been applied yet — the day
 *  advance clears the record when the regrow day arrives, so the
 *  renderer only ever needs this presence check, never the day). */
export function isGathered(world: IsoWorld, kind: GatherNodeKind, x: number, y: number): boolean {
  return world.gatheredAt?.[nodeIdFor(kind, x, y)] !== undefined;
}

/** True when the node is depleted in this world (gathered and not
 *  yet regrown). A depleted bush/herb/rock answers false again once
 *  its regrow day arrives; a depleted deposit never comes back; a
 *  felled tree answers true while its stump stands (the stump is
 *  the tree's gone-record — it clears when the sapling matures). */
export function isDepleted(world: IsoWorld, node: GatherNode, day: number, depositRemaining?: number): boolean {
  // BUILD 1110 fix: the deposit branch used to read healthOf with a
  // remaining of 0, so EVERY deposit read as depleted and no hit
  // ever landed. The caller passes the world's real remaining.
  if (node.kind === 'deposit') return healthOf(world, node, depositRemaining) <= 0;
  // BUILD 1110 fix: a felled tree's health record clears on
  // depletion, so healthOf reads full again — without the stump
  // check a stump could be chopped forever.
  if (node.kind === 'tree') return (world.stumps ?? []).some((s) => s.x === node.x && s.y === node.y);
  const at = world.gatheredAt?.[node.id];
  if (at === undefined) return false;
  return day < at + NODE_REGROW_DAYS[node.kind];
}

// --- Tools ---

/** A craftable gathering tool: which node kinds it helps, how much
 *  damage per hit, and how many hits it lasts. */
export interface ToolDef {
  kind: string;
  name: string;
  /** Node kinds this tool is made for (others take hand damage). */
  targets: GatherNodeKind[];
  damage: number;
  durability: number;
}

/** The four hand-craftable tools (spec section 3 examples + the
 *  pickaxes the rock/deposit acceptance needs). */
export const TOOL_DEFS: Record<string, ToolDef> = {
  'wooden-axe': { kind: 'wooden-axe', name: 'Wooden Axe', targets: ['tree'], damage: 3, durability: 30 },
  'stone-axe': { kind: 'stone-axe', name: 'Stone Axe', targets: ['tree'], damage: 6, durability: 60 },
  'wooden-pickaxe': { kind: 'wooden-pickaxe', name: 'Wooden Pickaxe', targets: ['rock', 'deposit'], damage: 3, durability: 30 },
  'stone-pickaxe': { kind: 'stone-pickaxe', name: 'Stone Pickaxe', targets: ['rock', 'deposit'], damage: 6, durability: 60 },
};

/** The tool definition for an equipped kind, or null for hands and
 *  anything that is not a gathering tool (a torch is a light, not
 *  a tool — it deals hand damage). */
export function toolDefFor(equippedKind: string | null | undefined): ToolDef | null {
  if (!equippedKind) return null;
  return TOOL_DEFS[equippedKind] ?? null;
}

/** Damage one hit deals: the tool's damage when it targets this
 *  node kind, else 1 (hand — or the wrong tool, which is no better
 *  than a hand against the wrong material). */
export function damageForHit(nodeKind: GatherNodeKind, equippedKind: string | null | undefined): number {
  const tool = toolDefFor(equippedKind);
  if (tool && tool.targets.includes(nodeKind)) return tool.damage;
  return 1;
}

/** Full durability of a tool kind, or null when the kind is not a
 *  gathering tool (torches and other gear never wear out). */
export function maxDurabilityFor(kind: string): number | null {
  const def = TOOL_DEFS[kind];
  return def ? def.durability : null;
}

// --- Yields ---

/** What a depleted node drops: [kind, qty] pairs. A deposit drops
 *  `damage` units of its mineral — the caller passes the hit's
 *  damage, since the yield scales with the tool. */
export function yieldFor(node: GatherNode, damage: number): Array<{ kind: string; qty: number }> {
  switch (node.kind) {
    case 'tree':
      return [{ kind: 'wood', qty: 2 }];
    case 'rock':
      return [{ kind: 'stone', qty: 1 }];
    case 'deposit':
      return [{ kind: node.mineral ?? 'iron', qty: Math.max(1, Math.floor(damage)) }];
    case 'bush':
      return [
        { kind: 'stick', qty: 1 },
        { kind: 'fibre', qty: 1 },
        { kind: 'berry', qty: 1 },
      ];
    case 'herb':
      return [{ kind: 'herb', qty: 2 }];
  }
}

// --- Hits (pure: world in, result out — the caller writes back) ---

export interface GatherHitResult {
  /** The world with the hit applied (new object — the input is
   *  never mutated, so the caller can decide when to save). */
  world: IsoWorld;
  /** Damage this hit dealt. */
  damage: number;
  /** Health left after the hit (0 = depleted). */
  healthLeft: number;
  /** True when this hit depleted the node. */
  depleted: boolean;
  /** The yield — only when depleted (a half-chopped tree drops
   *  nothing; the wood lands when it falls). */
  yield: Array<{ kind: string; qty: number }>;
}

/**
 * Hit a node once. Pure: clones the world's gather state, applies
 * the hit, and returns the new world + the outcome. The caller
 * (the E-key handler) turns `yield` into registry deposits and
 * removes the world object (tree/rock/deposit) on depletion.
 * A depleted node cannot be hit (the caller checks first — hitting
 * one returns the world unchanged with damage 0).
 */
export function hitGatherNode(
  world: IsoWorld,
  node: GatherNode,
  day: number,
  equippedKind: string | null | undefined,
  depositRemaining?: number,
  opts?: { stump?: boolean; regrow?: boolean },
): GatherHitResult {
  const health = healthOf(world, node, depositRemaining);
  if (health <= 0 || isDepleted(world, node, day, depositRemaining)) {
    return { world, damage: 0, healthLeft: 0, depleted: false, yield: [] };
  }
  const damage = damageForHit(node.kind, equippedKind);
  const healthLeft = Math.max(0, health - damage);
  const depleted = healthLeft <= 0;
  const next: IsoWorld = {
    ...world,
    gatherHealth: { ...(world.gatherHealth ?? {}) },
    gatheredAt: { ...(world.gatheredAt ?? {}) },
    stumps: [...(world.stumps ?? [])],
  };
  if (depleted) {
    delete next.gatherHealth![node.id];
    // Wild nodes (hash-rule, outside the map) leave no stump and
    // record no regrowth — the caller's removedWild* record keeps
    // them gone, exactly as before this build.
    if (node.kind === 'tree' && opts?.stump !== false) {
      if (!next.stumps!.some((s) => s.x === node.x && s.y === node.y)) {
        next.stumps!.push({ x: node.x, y: node.y });
      }
    } else if (node.kind !== 'deposit' && node.kind !== 'tree' && opts?.regrow !== false) {
      next.gatheredAt![node.id] = day;
    }
    // A depleted deposit's remaining is 0 in the world already
    // (the caller writes it); its health record is just cleared.
  } else if (node.kind !== 'deposit') {
    next.gatherHealth![node.id] = healthLeft;
  }
  return {
    world: next,
    damage,
    healthLeft,
    depleted,
    yield: depleted ? yieldFor(node, damage) : [],
  };
}

/**
 * Advance regrowth to a day: bushes/herbs/rocks whose regrow day
 * has arrived come back (their gatheredAt entry clears). Pure —
 * returns the new world and the ids that regrew (the caller
 * re-adds rocks to world.rocks + their registry deposits; bushes
 * and herbs are hash-rule nodes, so clearing the record is enough
 * for them to render and gather again). Trees are not here (the
 * sapling path owns them); deposits never regrow.
 */
export function advanceGatherRegrowth(
  world: IsoWorld,
  day: number,
): { world: IsoWorld; regrown: Array<{ id: string; kind: GatherNodeKind; x: number; y: number }> } {
  const gatheredAt = world.gatheredAt ?? {};
  const ids = Object.keys(gatheredAt);
  if (ids.length === 0) return { world, regrown: [] };
  const nextGatheredAt: Record<string, number> = { ...gatheredAt };
  const regrown: Array<{ id: string; kind: GatherNodeKind; x: number; y: number }> = [];
  for (const id of ids) {
    const at = gatheredAt[id];
    const kind = (id.split(':')[0] ?? '') as GatherNodeKind;
    if (kind !== 'bush' && kind !== 'herb' && kind !== 'rock') continue;
    if (day < at + NODE_REGROW_DAYS[kind]) continue;
    delete nextGatheredAt[id];
    const tail = id.slice(kind.length + 1);
    const [x, y] = tail.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) regrown.push({ id, kind, x, y });
  }
  if (regrown.length === 0) return { world, regrown: [] };
  return { world: { ...world, gatheredAt: nextGatheredAt }, regrown };
}

/** Remove a stump (called when its sapling matures — the caller is
 *  applyMaturedTrees' site, which already knows the tile). Pure. */
export function removeStump(world: IsoWorld, x: number, y: number): IsoWorld {
  const stumps = world.stumps ?? [];
  if (!stumps.some((s) => s.x === x && s.y === y)) return world;
  return { ...world, stumps: stumps.filter((s) => !(s.x === x && s.y === y)) };
}

// --- Hand-crafting (spec section 3, hand scope only) ---

/** A hand-crafting recipe: materials in, product out. All
 *  materials are registry player-store kinds (wood/stone/coal/
 *  stick), so the view crafts with withdrawFrom per material and
 *  depositInto (stackables) or the record channel (tools). */
export interface HandRecipe {
  id: string;
  name: string;
  product: string;
  productQty: number;
  materials: Array<{ kind: string; qty: number }>;
}

export const HAND_RECIPES: HandRecipe[] = [
  { id: 'stick', name: 'Stick', product: 'stick', productQty: 2, materials: [{ kind: 'wood', qty: 1 }] },
  { id: 'torch', name: 'Torch', product: 'torch', productQty: 1, materials: [{ kind: 'stick', qty: 1 }, { kind: 'coal', qty: 1 }] },
  { id: 'wooden-axe', name: 'Wooden Axe', product: 'wooden-axe', productQty: 1, materials: [{ kind: 'wood', qty: 3 }, { kind: 'stick', qty: 2 }] },
  { id: 'stone-axe', name: 'Stone Axe', product: 'stone-axe', productQty: 1, materials: [{ kind: 'stone', qty: 3 }, { kind: 'stick', qty: 2 }] },
  { id: 'wooden-pickaxe', name: 'Wooden Pickaxe', product: 'wooden-pickaxe', productQty: 1, materials: [{ kind: 'wood', qty: 3 }, { kind: 'stick', qty: 2 }] },
  { id: 'stone-pickaxe', name: 'Stone Pickaxe', product: 'stone-pickaxe', productQty: 1, materials: [{ kind: 'stone', qty: 3 }, { kind: 'stick', qty: 2 }] },
];

export function handRecipeFor(id: string): HandRecipe | null {
  return HAND_RECIPES.find((r) => r.id === id) ?? null;
}

/** True when the player's carried store holds every material
 *  (the caller passes the player-store quantities). */
export function canCraftHand(recipe: HandRecipe, held: Record<string, number>): boolean {
  return recipe.materials.every((m) => Math.max(0, Math.floor(held[m.kind] ?? 0)) >= m.qty);
}

// --- Hit feedback sound ---

/** The hit sound, per node family. No sound system exists anywhere
 *  else in the game, so this is a minimal lazy WebAudio blip: a
 *  short oscillator burst, no assets, created on the user's gesture
 *  (the E keypress), so autoplay rules never bite. Guarded —
 *  anything failing (no window, no AudioContext, denied) is
 *  silent, never a crash. The sim never calls this. */
export type GatherSoundKind = 'chop' | 'mine' | 'pick' | 'break' | 'fell';

let gatherAudio: AudioContext | null = null;

export function playGatherSound(kind: GatherSoundKind): void {
  try {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!gatherAudio) gatherAudio = new AC();
    if (gatherAudio.state === 'suspended') void gatherAudio.resume();
    const ctx = gatherAudio;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = kind === 'chop' ? 180 : kind === 'mine' ? 90 : kind === 'pick' ? 520 : kind === 'fell' ? 120 : 60;
    const dur = kind === 'fell' ? 0.22 : kind === 'break' ? 0.3 : 0.07;
    osc.type = kind === 'pick' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (kind === 'fell' || kind === 'break') osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq / 2), ctx.currentTime + dur);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  } catch {
    // Sound is feedback, never load-bearing — stay silent.
  }
}
