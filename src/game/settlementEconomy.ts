/**
 * Cossacks-style local settlement work loop.
 *
 * Workers are real townsfolk: they walk using the existing navigation system,
 * mine at a shared quarry, carry a bounded load, and deposit it into the
 * settlement's existing persisted storage ledger. State is deterministic and
 * compact; only work progress/cargo is transient, while resources live in civ
 * storage and therefore follow the existing save/load path.
 */
import type { Townsperson, TownsfolkPoint } from './townsfolk';
import { townsfolkHash } from './townsfolk';

export type EconomyWorkerMode = 'quarry' | 'stockpile' | 'idle';
export type EconomyWorkerState = {
  mode: EconomyWorkerMode;
  cargo: number;
  workMs: number;
};
export type SettlementEconomyState = {
  workers: Record<string, EconomyWorkerState>;
  depositRemaining: number;
  depositCooldownMs: number;
  totalMined: number;
  totalDelivered: number;
};
export type EconomyTarget = {
  npcId: string;
  activity: string;
  target: TownsfolkPoint;
  mode: EconomyWorkerMode;
  cargo: number;
};
export type EconomyAdvanceResult = {
  state: SettlementEconomyState;
  targets: EconomyTarget[];
  delivered: number;
  mined: number;
};

export function createSettlementEconomyState(): SettlementEconomyState {
  return {
    workers: {},
    depositRemaining: 12,
    depositCooldownMs: 0,
    totalMined: 0,
    totalDelivered: 0,
  };
}

function eligible(npc: Townsperson): boolean {
  return npc.archetype !== 'child' && npc.deadUntilTick === undefined &&
    (npc.archetype === 'commoner' || npc.archetype === 'farmer' ||
     npc.archetype === 'smith' || npc.archetype === 'merchant');
}

/** Stable job assignment: the same townsfolk keep their jobs across ticks. */
export function settlementWorkerIds(roster: Townsperson[], count = 2): string[] {
  return roster.filter(eligible)
    .slice()
    .sort((a, b) => townsfolkHash(a.seed, 73501) - townsfolkHash(b.seed, 73501) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, count))
    .map((npc) => npc.id);
}

/**
 * Advance one short simulation step. Physical travel is deliberately delegated
 * to advanceTownsfolk; this function only progresses work when a worker really
 * arrives at the quarry/stockpile. No teleporting and no per-frame rendering
 * dependencies.
 */
export function advanceSettlementEconomy(
  previous: SettlementEconomyState,
  roster: Townsperson[],
  quarry: TownsfolkPoint,
  stockpile: TownsfolkPoint,
  storage: Record<string, number>,
  elapsedMs: number,
  depositAvailable: boolean,
  workShift: boolean,
  storageCap = 100,
): EconomyAdvanceResult {
  const dt = Math.max(0, Math.min(1000, elapsedMs));
  const assigned = settlementWorkerIds(roster, 2);
  const assignedSet = new Set(assigned);
  const workers: Record<string, EconomyWorkerState> = {};
  for (const id of assigned) {
    workers[id] = previous.workers[id] ?? { mode: 'quarry', cargo: 0, workMs: 0 };
  }

  let depositRemaining = previous.depositRemaining;
  let depositCooldownMs = Math.max(0, previous.depositCooldownMs - dt);
  let totalMined = previous.totalMined;
  let totalDelivered = previous.totalDelivered;
  let delivered = 0;
  let mined = 0;
  if (depositRemaining <= 0 && depositCooldownMs <= 0) depositRemaining = 12;

  const byId = new Map(roster.map((npc) => [npc.id, npc]));
  const targets: EconomyTarget[] = [];
  for (const id of assigned) {
    const npc = byId.get(id);
    const worker = workers[id];
    if (!npc || !worker) continue;

    if (worker.cargo >= 6 || !workShift || !depositAvailable || depositRemaining <= 0) {
      if (worker.cargo > 0) worker.mode = 'stockpile';
      else if (!workShift || !depositAvailable || depositRemaining <= 0) worker.mode = 'idle';
    }
    if (worker.mode === 'idle' && workShift && depositAvailable && depositRemaining > 0) {
      worker.mode = 'quarry';
    }

    const target = worker.mode === 'stockpile' ? stockpile :
      worker.mode === 'quarry' ? quarry : stockpile;
    const activity = worker.mode === 'stockpile' ? 'Hauling stone' :
      worker.mode === 'quarry' ? 'Mining stone' : 'Waiting for stone';
    targets.push({ npcId: id, activity, target, mode: worker.mode, cargo: worker.cargo });

    // The existing movement simulation must bring the worker to the actual
    // work point. Indoor/dead workers never magically produce resources.
    if (npc.indoors || npc.deadUntilTick !== undefined) continue;
    const distance = Math.hypot(npc.position.x - target.x, npc.position.y - target.y);
    if (distance > 2.4) continue;

    if (worker.mode === 'quarry' && workShift && depositAvailable && depositRemaining > 0) {
      worker.workMs += dt;
      if (worker.workMs >= 3000) {
        worker.workMs %= 3000;
        const amount = Math.min(2, 6 - worker.cargo, depositRemaining);
        if (amount > 0) {
          worker.cargo += amount;
          depositRemaining -= amount;
          mined += amount;
          totalMined += amount;
        }
        if (worker.cargo >= 6 || depositRemaining <= 0) {
          worker.mode = 'stockpile';
          if (depositRemaining <= 0) depositCooldownMs = 5 * 60 * 1000;
        }
      }
    } else if (worker.mode === 'stockpile' && distance <= 2.4 && worker.cargo > 0) {
      const current = Math.max(0, Number(storage.stone) || 0);
      const amount = Math.min(worker.cargo, Math.max(0, storageCap - current));
      if (amount > 0) {
        storage.stone = current + amount;
        worker.cargo -= amount;
        delivered += amount;
        totalDelivered += amount;
      }
      if (worker.cargo <= 0) {
        worker.cargo = 0;
        worker.mode = workShift && depositAvailable && depositRemaining > 0 ? 'quarry' : 'idle';
      }
    }
  }

  // Drop state for workers no longer present, keeping the ledger bounded.
  for (const id of Object.keys(workers)) if (!assignedSet.has(id)) delete workers[id];
  return {
    state: { workers, depositRemaining, depositCooldownMs, totalMined, totalDelivered },
    targets,
    delivered,
    mined,
  };
}
