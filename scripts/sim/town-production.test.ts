// Town production regression tests.
// Run with: npx tsx scripts/sim/town-production.test.ts
import { createCivilization, deserializeCivilization, serializeCivilization } from '../../src/game/civilization';
import { applyNPCProduction } from '../../src/game/townProduction';
import type { Townsperson } from '../../src/game/townsfolk';
import type { WorldClockState } from '../../src/game/worldCore';

let assertions = 0;
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
  assertions += 1;
}

function clockForDay(day: number): WorldClockState {
  return {
    tick: day, year: 1, month: 1, week: Math.ceil(day / 7), day,
    hour: 12, minuteOfDay: 12 * 60, second: 0, season: 'spring',
  };
}

const civ = createCivilization(847291583);
const mosslight = civ.settlements.find((settlement) => settlement.id === 'mosslight');
assert(mosslight, 'Mosslight settlement should exist');
mosslight.storage.grain = 0;
const farmer = { id: 'test-farmer', archetype: 'farmer', seed: 1 } as unknown as Townsperson;

applyNPCProduction(civ, [farmer], clockForDay(2));
const firstDayStock = mosslight.storage.grain;
assert(firstDayStock > 0, 'farmer should produce grain on the first call of a day');
assert(mosslight.lastNpcProductionDay === 2, 'production day should be recorded');
applyNPCProduction(civ, [farmer], clockForDay(2));
assert(mosslight.storage.grain === firstDayStock, 'repeated same-day calls must not duplicate grain');

const restored = deserializeCivilization(serializeCivilization(civ));
const restoredMosslight = restored.settlements.find((settlement) => settlement.id === 'mosslight');
assert(restoredMosslight, 'Mosslight should survive save/load');
assert(restoredMosslight.lastNpcProductionDay === 2, 'production day should persist through save/load');
applyNPCProduction(restored, [farmer], clockForDay(2));
assert(restoredMosslight.storage.grain === firstDayStock, 'same-day idempotency must survive save/load');

applyNPCProduction(restored, [farmer], clockForDay(3));
assert(restoredMosslight.storage.grain > firstDayStock, 'production should resume on a new day');
assert(restoredMosslight.lastNpcProductionDay === 3, 'new production day should be recorded');
const nextDayStock = restoredMosslight.storage.grain;
applyNPCProduction(restored, [farmer], clockForDay(2));
assert(restoredMosslight.storage.grain === nextDayStock, 'backward clock calls must not duplicate prior production');

console.log('TOWN PRODUCTION COMPLETE: ' + assertions + ' assertions passed');
