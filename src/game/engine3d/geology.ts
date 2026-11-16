/**
 * BUILD 1081 — NEURON HEX 0x10, Living World plan Phase 1.2: geology +
 * mineral deposits, the persistent natural-resource system.
 *
 * This module owns the DEPOSIT MAP: where the deposits are, what
 * mineral each one holds, and how much is left. It is a pure,
 * deterministic function of the world (same seed → same deposits,
 * same minerals, same amounts): candidate tiles are picked by
 * hashed noise per mineral, then filtered by real terrain
 * (land only — no water, no sand), distance from the camp and the
 * huts, and collision with anything already standing on the tile
 * (trees, rocks, crates, landmarks, anything placed). A handful
 * per mineral (3), not hundreds — the world is a village's
 * hinterland, not a mining district.
 *
 * The module does NOT own resource accounting: that is the
 * resource registry (R-1, resourceRegistry.ts), the ONE
 * authoritative resource system. depositsFromGeology() below
 * registers the live deposits there as a new deposit kind (like
 * tree/rock/crate/farm), so the registry can answer "what
 * deposits exist and how much is left" — no second resource
 * system is created.
 *
 * Persistence follows the BUILD 1061 removedTrees pattern:
 * the deposits live on the world object (IsoWorld.mineralDeposits,
 * plain data) and are saved wholesale by saveWorld. The stamp
 * (stampMineralDeposits, called once from loadInitialWorld) never
 * re-derives a stamped world, so a deposit's `remaining` only
 * moves one way — down, through applyDepletion — and a mined-out
 * deposit (remaining 0) stays mined-out across reloads. Old saves
 * load with no deposits; the stamp generates them on the same
 * load (the layout is already applied by then).
 *
 * Mining itself is Phase 2 and is NOT built here: E only Examines
 * a deposit ("Iron deposit — 40 remaining"), and the depletion
 * path is a test hook / debug path (depleteDeposit in the view)
 * so the mined-out state can be proven without a mining system.
 *
 * The BUILD 1040 ore is NOT this system: that is a placeable
 * decor item (player-placed, in the Build menu palette). These
 * deposits are GENERATED world objects (deterministic from the
 * world seed, never placed by the player). The 1040 ore is left
 * alone.
 */
import { hash2, terrainAt, type IsoWorld } from '../iso/isoWorld';
import { FOUNDER_CAMP } from './founders';
import { addDeposit, type RegistryEntry, type RegistryKind, type ResourceRegistry } from './resourceRegistry';

export type MineralKind = 'iron' | 'copper' | 'coal' | 'gold' | 'silver' | 'stone';

export interface MineralDef {
  kind: MineralKind;
  /** Player-facing name, used by the Examine text. */
  name: string;
  /** The registry kind this mineral counts as (R-1 accounting). */
  registryKind: RegistryKind;
  /** Base amount before the ±25% per-deposit hash variation. */
  baseAmount: number;
  /** Map colour (minimap + world map dots). */
  mapColor: string;
  /** 3D outcrop colour, RGB 0..1 (the renderer's mineral tint). */
  renderColor: [number, number, number];
  /** Per-mineral hash salt — one mineral's candidates are
   *  independent of another's, so iron never steals coal's tiles. */
  salt: number;
}

export const MINERALS: MineralDef[] = [
  { kind: 'iron', name: 'Iron', registryKind: 'iron', baseAmount: 40, mapColor: '#b5542a', renderColor: [0.62, 0.30, 0.15], salt: 9101 },
  { kind: 'copper', name: 'Copper', registryKind: 'copper', baseAmount: 35, mapColor: '#4a9a7a', renderColor: [0.25, 0.55, 0.42], salt: 9239 },
  { kind: 'coal', name: 'Coal', registryKind: 'coal', baseAmount: 50, mapColor: '#2a2a2a', renderColor: [0.13, 0.13, 0.14], salt: 9377 },
  { kind: 'gold', name: 'Gold', registryKind: 'gold', baseAmount: 12, mapColor: '#d4a017', renderColor: [0.78, 0.60, 0.08], salt: 9515 },
  { kind: 'silver', name: 'Silver', registryKind: 'silver', baseAmount: 20, mapColor: '#b9b9c4', renderColor: [0.68, 0.68, 0.72], salt: 9653 },
  { kind: 'stone', name: 'Stone', registryKind: 'stone', baseAmount: 60, mapColor: '#6a6a6a', renderColor: [0.38, 0.38, 0.37], salt: 9791 },
];

/** Deposits per mineral — 3 × 6 minerals = 18 deposits in the world. */
export const DEPOSITS_PER_MINERAL = 3;
/** Fraction of tiles that are candidates per mineral (hash-gated). */
const DEPOSIT_CANDIDATE_HASH = 0.02;
/** Minimum tiles between any two deposits, so they spread out. */
const DEPOSIT_MIN_SPACING = 8;
/** No deposit within this many tiles of the camp centre. */
const DEPOSIT_CAMP_EXCLUSION = 15;
/** No deposit within this many tiles of a hut rect edge. */
const DEPOSIT_HUT_MARGIN = 2;

/** One deposit: a world object with a real remaining amount. */
export interface MineralDeposit {
  id: string;
  mineral: MineralKind;
  x: number;
  y: number;
  amount: number;
  remaining: number;
}

export function depositIdFor(mineral: MineralKind, x: number, y: number): string {
  return `deposit:${mineral}:${x},${y}`;
}

export function mineralDefFor(kind: MineralKind): MineralDef {
  return MINERALS.find((m) => m.kind === kind) ?? MINERALS[0];
}

export function mineralName(kind: MineralKind): string {
  return mineralDefFor(kind).name;
}

/** Map dot colour for a deposit (string-typed so the plain-data
 *  IsoWorld record can pass its mineral through without a cast). */
export function mineralMapColor(mineral: string): string {
  return MINERALS.find((m) => m.kind === mineral)?.mapColor ?? '#6a6a6a';
}

/** 3D outcrop tint for a deposit. */
export function mineralRenderColor(mineral: string): [number, number, number] {
  return MINERALS.find((m) => m.kind === mineral)?.renderColor ?? [0.38, 0.38, 0.37];
}

/** The Examine text for a deposit — the acceptance-test wording. */
export function examineDeposit(d: MineralDeposit): string {
  const name = mineralName(d.mineral);
  return d.remaining <= 0 ? `${name} deposit — mined out` : `${name} deposit — ${d.remaining} remaining`;
}

/** The deposit on a tile, if any (exact tile only). */
export function depositAt(world: IsoWorld, x: number, y: number): MineralDeposit | null {
  const list = world.mineralDeposits ?? [];
  for (const d of list) if (d.x === x && d.y === y) return { ...d, mineral: d.mineral as MineralKind };
  return null;
}

/** The nearest deposit within the E-key reach (1 tile, same
 *  Chebyshev reach the crate/tree/rock branches use). */
export function depositNear(world: IsoWorld, x: number, y: number, reach = 1): MineralDeposit | null {
  const list = world.mineralDeposits ?? [];
  for (const d of list) if (Math.abs(d.x - x) <= reach && Math.abs(d.y - y) <= reach) return { ...d, mineral: d.mineral as MineralKind };
  return null;
}

/** Tiles already occupied by something standing — a deposit never
 *  shares a tile with a tree, rock, crate, landmark block, or
 *  anything placed (house, farm, path, stall, wall, lantern...). */
function occupiedTiles(world: IsoWorld): Set<string> {
  const occ = new Set<string>();
  for (const t of world.trees ?? []) occ.add(t.tx + ',' + t.ty);
  for (const r of world.rocks ?? []) occ.add(r.tx + ',' + r.ty);
  for (const c of world.crates ?? []) occ.add(c.tx + ',' + c.ty);
  for (const l of world.landmarks ?? []) for (const b of l.blocks) occ.add(b.x + ',' + b.y);
  for (const p of world.placements ?? []) {
    for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) occ.add(x + ',' + y);
  }
  return occ;
}

/** Hut rects (authored + player-placed) with a margin — a deposit
 *  never spawns against a hut wall. */
function hutRects(world: IsoWorld): Array<{ x0: number; y0: number; x1: number; y1: number }> {
  const rects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  for (const h of world.huts ?? []) rects.push(h);
  for (const p of world.placements ?? []) if (p.kind === 'house') rects.push({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 });
  return rects;
}

/** The deterministic deposit map for a world: 3 per mineral,
 *  chosen from hash-gated candidate tiles (lowest hash first, so
 *  the same world always picks the same tiles), filtered by
 *  terrain, camp/hut exclusion, occupancy, and spacing. Pure —
 *  no randomness, no I/O, no mutation. */
export function generateMineralDeposits(world: IsoWorld): MineralDeposit[] {
  const occ = occupiedTiles(world);
  const huts = hutRects(world);
  const out: MineralDeposit[] = [];
  for (const def of MINERALS) {
    const cands: Array<{ x: number; y: number; h: number }> = [];
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const h = hash2(x, y, def.salt);
        if (h >= DEPOSIT_CANDIDATE_HASH) continue;
        const t = terrainAt(world, x, y);
        if (t !== 'grass' && t !== 'dirt' && t !== 'stone') continue;
        if (Math.hypot(x - FOUNDER_CAMP.x, y - FOUNDER_CAMP.y) < DEPOSIT_CAMP_EXCLUSION) continue;
        if (occ.has(x + ',' + y)) continue;
        let inHut = false;
        for (const r of huts) {
          if (x >= r.x0 - DEPOSIT_HUT_MARGIN && x <= r.x1 + DEPOSIT_HUT_MARGIN && y >= r.y0 - DEPOSIT_HUT_MARGIN && y <= r.y1 + DEPOSIT_HUT_MARGIN) { inHut = true; break; }
        }
        if (inHut) continue;
        cands.push({ x, y, h });
      }
    }
    cands.sort((a, b) => a.h - b.h);
    let placed = 0;
    for (const c of cands) {
      if (placed >= DEPOSITS_PER_MINERAL) break;
      let tooClose = false;
      for (const d of out) if (Math.hypot(d.x - c.x, d.y - c.y) < DEPOSIT_MIN_SPACING) { tooClose = true; break; }
      if (tooClose) continue;
      const amount = Math.max(4, Math.round(def.baseAmount * (0.75 + 0.5 * hash2(c.x, c.y, def.salt + 1))));
      out.push({ id: depositIdFor(def.kind, c.x, c.y), mineral: def.kind, x: c.x, y: c.y, amount, remaining: amount });
      placed++;
    }
  }
  return out;
}

/** Stamp the deposit map onto a world that has none, once. Returns
 *  true when it generated (the caller saves the world then). A
 *  world that already has deposits is left untouched — this is
 *  what keeps a mined-out deposit mined-out across reloads. */
export function stampMineralDeposits(world: IsoWorld): boolean {
  if (world.mineralDeposits && world.mineralDeposits.length > 0) return false;
  world.mineralDeposits = generateMineralDeposits(world) as unknown as IsoWorld['mineralDeposits'];
  return true;
}

/** Deplete a deposit by a quantity (pure — returns a new list).
 *  The remaining amount floors at 0 and never recovers; the
 *  caller persists the returned list. This is the Phase 2 mining
 *  hook's path: the extraction itself lands in Phase 2. */
export function applyDepletion(deposits: MineralDeposit[], id: string, qty: number): { deposits: MineralDeposit[]; depleted: MineralDeposit | null } {
  let found: MineralDeposit | null = null;
  const next = deposits.map((d) => {
    if (d.id !== id) return d;
    const remaining = Math.max(0, d.remaining - Math.max(0, Math.floor(qty)));
    found = { ...d, remaining };
    return found;
  });
  return { deposits: next, depleted: found };
}

/** The registry entry for a live deposit — the deposit model's
 *  counterpart to treeDeposit / rockDeposit / farmDeposit (R-1).
 *  A mined-out deposit has no entry: the registry answers "what
 *  deposits exist and how much is left" with live deposits only. */
export function mineralDepositEntry(d: MineralDeposit): RegistryEntry {
  const def = mineralDefFor(d.mineral);
  return {
    id: d.id,
    storeId: null,
    kind: def.registryKind,
    qty: Math.max(0, d.remaining),
    quality: 1,
    capacity: d.amount,
    location: { x: d.x, y: d.y },
    extraction: 'mine',
    sourceId: d.id,
    ownerId: null,
  };
}

/** Register the world's live deposits in the registry (the
 *  accounting side of the deposit map). Called once when the
 *  registry is built from a loaded world, after depositsFromWorld.
 *  Mined-out deposits are skipped — their entry is gone, so the
 *  registry never reports ore that no longer exists. */
export function depositsFromGeology(registry: ResourceRegistry, world: IsoWorld): ResourceRegistry {
  let next = registry;
  for (const d of world.mineralDeposits ?? []) {
    if (d.remaining <= 0) continue;
    next = addDeposit(next, mineralDepositEntry({ ...d, mineral: d.mineral as MineralKind }));
  }
  return next;
}
