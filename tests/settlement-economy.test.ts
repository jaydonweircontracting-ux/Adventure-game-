import assert from 'node:assert/strict';
import {
  advanceSettlementEconomy,
  createSettlementEconomyState,
  settlementWorkerIds,
} from '../src/game/settlementEconomy';
import type { Townsperson } from '../src/game/townsfolk';

const roster = [
  { id: 'worker-a', seed: 101, archetype: 'farmer', position: { x: 0, y: 0 }, indoors: false },
  { id: 'worker-b', seed: 202, archetype: 'commoner', position: { x: 0, y: 0 }, indoors: false },
  { id: 'child', seed: 303, archetype: 'child', position: { x: 0, y: 0 }, indoors: false },
] as unknown as Townsperson[];
const quarry = { x: 10, y: 10 };
const stockpile = { x: 20, y: 20 };
const storage: Record<string, number> = { stone: 0 };
let state = createSettlementEconomyState();
assert.equal(settlementWorkerIds(roster).length, 2);
assert.deepEqual(settlementWorkerIds(roster), settlementWorkerIds(roster), 'job assignment is stable');

let currentRoster = roster.map((npc) => ({ ...npc, position: { ...npc.position } })) as Townsperson[];
let totalMined = 0;
let totalDelivered = 0;
for (let i = 0; i < 100; i++) {
  const result = advanceSettlementEconomy(
    state, currentRoster, quarry, stockpile, storage, 1000, true, true, 100,
  );
  state = result.state;
  totalMined += result.mined;
  totalDelivered += result.delivered;
  const targetById = new Map(result.targets.map((target) => [target.npcId, target.target]));
  currentRoster = currentRoster.map((npc) => {
    const target = targetById.get(npc.id);
    if (!target || npc.indoors) return npc;
    const dx = target.x - npc.position.x;
    const dy = target.y - npc.position.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(1.8, distance);
    return {
      ...npc,
      position: distance > 0 ? { x: npc.position.x + dx / distance * step, y: npc.position.y + dy / distance * step } : npc.position,
    };
  });
}
assert.ok(totalMined >= 6, 'workers gather stone only after walking to the quarry');
assert.ok(totalDelivered > 0, 'workers walk back and haul gathered stone to the stockpile');
assert.equal(storage.stone, totalDelivered, 'delivered stone enters the settlement resource ledger');
assert.ok(storage.stone <= 100, 'stockpile respects its resource cap');
assert.ok(state.totalMined >= state.totalDelivered, 'delivery cannot exceed gathered stone');

const paused = advanceSettlementEconomy(state, currentRoster, quarry, stockpile, storage, 1000, false, true, 100);
assert.equal(paused.mined, 0, 'workers stop mining while the deposit is unavailable');
console.log('Settlement economy tests passed (stable jobs, walking, hauling, stock cap, depleted-node pause).');
