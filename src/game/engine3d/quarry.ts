/**
 * BUILD 1086 (0x15, Phase 2.1): stone gathering — the quarry loop.
 *
 * The founders gain a second resource. A founder assigned to stone
 * walks to a rock formation (a 1.2 stone deposit, or a rock), works
 * on arrival (no teleporting, no progress from a distance — the same
 * arrival gate as the 2.5D quarry loop in settlementEconomy.ts), and
 * carries the stone back to the camp stockpile, which becomes
 * multi-resource (wood + stone, real counts).
 *
 * Port, not a second model: the loop runs through the J-1 job board
 * (jobs.ts — one quarry job per live stone deposit / rock in radius)
 * and the R-1 registry (resourceRegistry.ts — the stone deposits are
 * registered as a deposit kind, like the 1.2 geology deposits; every
 * transfer conserves). The 2.5D loop mines 2 stone per 3000ms at
 * 1 tick/900ms (~3.3 ticks); here a deposit visit takes 3 ticks
 * (FOUNDER_MINE_TICKS, the same as chopping) and yields 2 stone,
 * a rock yields 1 (its R-1 deposit holds 1 stone).
 *
 * No fake resources: a deposit visit depletes the deposit by the
 * mined amount (a mined-out deposit stays mined-out — the 1081
 * pattern: the world save keeps the depleted remaining, the registry
 * entry is removed or updated to match); a rock is consumed like a
 * tree (removed from world.rocks + recorded in removedRocks, so it
 * never resurrects). The carrier holds at most 2 stone (the R-1
 * carrier capacity), and the camp stockpile only rises when a
 * founder delivers.
 */
import { terrainKey, type IsoWorld } from '../iso/isoWorld';
import { quantizeTile } from './townsfolk3d';
import { applyDepletion, depositIdFor, mineralDepositEntry, type MineralDeposit } from './geology';
import { rockId } from './entityIds';
import type { FounderState } from './founders';
import { addDeposit, carrierStoreId, depositInto, extractDeposit, type ResourceRegistry } from './resourceRegistry';

/** Stone mined per visit to a stone deposit (the 2.5D loop mines 2). */
export const QUARRY_STONE_PER_DEPOSIT_VISIT = 2;
/** Stone mined per rock (a rock's R-1 deposit holds exactly 1 stone). */
export const QUARRY_STONE_PER_ROCK = 1;
/**
 * The camp's stone reserve target. The stockpile stops pulling
 * founders to stone once it holds this much — the same role as the
 * 2.5D quarry loop's deposit of 12, and the utility scorer's stone
 * term (utility.ts) runs dry at this target.
 */
export const QUARRY_STONE_TARGET = 12;
/** BUILD 1086: a quarry job is only CLAIMED within this radius of camp
 *  (Manhattan). Only 3 rocks sit within 30 tiles (dist 4, 18, 30); the
 *  rest are 48-59 out, and a 100-tick round trip to one of them stalls
 *  the wood/food loop (the 24h meals ran 27→21). The deposit (59 out)
 *  keeps its job on the board but is never claimed in 2.1 — mining at
 *  distance is a 2.4 concern. */
export const QUARRY_CLAIM_RADIUS = 30;

export type QuarryKind = 'deposit' | 'rock';

export type QuarryTarget = { kind: QuarryKind; id: string; x: number; y: number };

/** The job target id for a quarry site — the same id the R-1 registry uses for the deposit. */
export function quarryTargetIdFor(kind: QuarryKind, x: number, y: number): string {
  return kind === 'deposit' ? depositIdFor('stone', x, y) : rockId(x, y);
}

/** The kind of a quarry job target id, or null when the id is not a quarry site. */
export function quarryKindForTargetId(id: string): QuarryKind | null {
  if (id.startsWith('deposit:stone:')) return 'deposit';
  if (id.startsWith('rock:')) return 'rock';
  return null;
}

/** Build a quarry target from a claimed job's target id + tile, or null when the id is not a quarry site. */
export function quarryTargetFromJob(targetId: string, x: number, y: number): QuarryTarget | null {
  const kind = quarryKindForTargetId(targetId);
  return kind ? { kind, id: targetId, x, y } : null;
}

/** Live stone deposits (remaining > 0) within maxDist (Manhattan) of a point. */
export function stoneDepositsInRadius(world: IsoWorld, x: number, y: number, maxDist: number): MineralDeposit[] {
  // The world's stored deposits type mineral as a plain string
  // (IsoWorld) — the geology MineralDeposit type narrows it to
  // MineralKind, the same cast geology.ts itself uses when it
  // stamps them.
  return ((world.mineralDeposits ?? []).filter(
    (d) => d.mineral === 'stone' && d.remaining > 0 && Math.abs(d.x - x) + Math.abs(d.y - y) <= maxDist,
  ) as unknown) as MineralDeposit[];
}

/** Rocks within maxDist (Manhattan) of a point. */
export function rocksInRadius(world: IsoWorld, x: number, y: number, maxDist: number): { tx: number; ty: number }[] {
  return (world.rocks ?? []).filter((r) => Math.abs(r.tx - x) + Math.abs(r.ty - y) <= maxDist);
}

/**
 * The walkable tile a founder stands on to work a deposit or rock —
 * the same radius-2 rule as a tree's work tile (treeWorkTile).
 */
export function quarryWorkTile(world: IsoWorld, x: number, y: number): { x: number; y: number } | null {
  return quantizeTile(world, x, y, 2);
}

/**
 * Mine a quarry target into a founder's carrier. Called ONLY when
 * the founder has arrived (the tick's 'mining' state) — never while
 * walking, never from a distance.
 *
 * Deposit: the world deposit depletes by the mined amount and the
 * registry entry is updated to match (removed when mined out — the
 * 1081 depleteDeposit pattern). Rock: the rock is consumed (removed
 * from world.rocks + recorded in removedRocks, like the player's
 * E-key rock) and its 1-stone deposit is extracted. The yield lands
 * in the carrier store via depositInto (capacity 2); the returned
 * yield is what actually landed.
 */
export function mineStoneToCarrier(
  registry: ResourceRegistry,
  world: IsoWorld,
  f: FounderState,
  target: QuarryTarget,
): { registry: ResourceRegistry; yield: number; sourceId: string | null } {
  const depositOpts = { location: { x: Math.round(f.x), y: Math.round(f.y) }, ownerId: f.id };
  if (target.kind === 'deposit') {
    const before = (world.mineralDeposits ?? []).find((d) => d.id === target.id);
    if (!before || before.remaining <= 0) return { registry, yield: 0, sourceId: null };
    const mined = Math.min(QUARRY_STONE_PER_DEPOSIT_VISIT, before.remaining);
    const res = applyDepletion((world.mineralDeposits ?? []) as unknown as MineralDeposit[], target.id, mined);
    if (!res.depleted) return { registry, yield: 0, sourceId: null };
    world.mineralDeposits = res.deposits as unknown as IsoWorld['mineralDeposits'];
    let reg = registry;
    if (res.depleted.remaining <= 0) reg = extractDeposit(reg, target.id).registry;
    else reg = addDeposit(reg, mineralDepositEntry(res.depleted));
    const deposited = depositInto(reg, carrierStoreId(f.id), 'stone', mined, { type: 'entity', id: target.id }, depositOpts);
    return { registry: deposited.registry, yield: deposited.added, sourceId: target.id };
  }
  const rock = (world.rocks ?? []).find((r) => r.tx === target.x && r.ty === target.y);
  if (!rock) return { registry, yield: 0, sourceId: null };
  world.rocks = world.rocks.filter((r) => r !== rock);
  if (!world.removedRocks) world.removedRocks = [];
  const rk = terrainKey(rock.tx, rock.ty);
  if (!world.removedRocks.includes(rk)) world.removedRocks.push(rk);
  const sourceId = rockId(rock.tx, rock.ty);
  const extracted = extractDeposit(registry, sourceId);
  const yieldStone = extracted.qty > 0 ? extracted.qty : QUARRY_STONE_PER_ROCK;
  const deposited = depositInto(extracted.registry, carrierStoreId(f.id), 'stone', yieldStone, { type: 'entity', id: sourceId }, depositOpts);
  return { registry: deposited.registry, yield: deposited.added, sourceId };
}
