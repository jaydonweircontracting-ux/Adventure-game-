import assert from 'node:assert/strict';
import {
  deliverCaravanCargo,
  loadCaravanCargo,
  recomputeSupplyDemand,
  zeroResources,
} from '../src/game/civilization';
import type { Settlement } from '../src/game/civilization';

function settlement(id: string, population = 10): Settlement {
  const production = zeroResources();
  const consumption = zeroResources();
  const storage = zeroResources();
  const prices = zeroResources();
  const supply = zeroResources();
  const demand = zeroResources();
  const result = {
    id, kind: 'village', name: id, kingdomId: 'test', region: 'test',
    chunk: { x: 0, y: 0 }, position: { x: 0, y: 0 }, population,
    production, consumption, storage, prices, demand, supply,
  } as Settlement;
  recomputeSupplyDemand(result);
  return result;
}

const destination = settlement('destination', 10);
destination.storage.grain = 58;
deliverCaravanCargo(destination, { grain: 20, tools: 4, medicine: -3 });
assert.equal(destination.storage.grain, 60, 'delivery respects population-based storage cap');
assert.equal(destination.storage.tools, 4, 'valid cargo is delivered');
assert.equal(destination.storage.medicine, 0, 'negative cargo is ignored');
assert.equal(destination.supply.tools, 0.2, 'four stored tools contribute 0.2 supply units at 20 items per unit');
assert.equal(destination.demand.tools, 0, 'delivery recomputes demand from consumption');
assert.equal(destination.prices.tools, 10.91, 'delivery recomputes market prices from effective supply');

const origin = settlement('origin', 100);
origin.storage.grain = 13;
origin.storage.tools = 80;
const cargo = loadCaravanCargo(origin, ['grain', 'tools', 'medicine'], 1234, 7);
assert.equal(cargo.grain, 13, 'caravan loads no more than actual available stock');
assert.equal(origin.storage.grain, 0, 'loaded grain is removed from settlement stock');
assert.ok((cargo.tools ?? 0) <= 80, 'caravan cannot load more tools than available');
assert.equal(origin.storage.tools, 80 - (cargo.tools ?? 0), 'loaded tools are withdrawn from stock');
assert.equal(cargo.medicine, undefined, 'empty resources are not invented');
assert.equal(origin.storage.medicine, 0, 'empty resources stay at zero');

const sameA = settlement('same');
const sameB = settlement('same');
sameA.storage.grain = sameB.storage.grain = 70;
sameA.storage.tools = sameB.storage.tools = 45;
const cargoA = loadCaravanCargo(sameA, ['grain', 'tools'], 9876, 19);
const cargoB = loadCaravanCargo(sameB, ['grain', 'tools'], 9876, 19);
assert.deepEqual(cargoA, cargoB, 'same seed and day produce identical cargo');
assert.deepEqual(sameA.storage, sameB.storage, 'deterministic cargo withdrawal preserves repeatability');

console.log('Caravan trade tests passed (real stock withdrawal, capacity, deterministic cargo).');
