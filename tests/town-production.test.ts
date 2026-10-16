import assert from 'node:assert/strict';
import { applyNPCProduction, npcProductionSummary, npcWorkOutputSummary } from '../src/game/townProduction';
import type { CivilizationState } from '../src/game/civilization';
import type { Townsperson } from '../src/game/townsfolk';
import type { WorldClockState } from '../src/game/worldCore';

const farmers = [
  { id: 'farmer-a', seed: 123, archetype: 'farmer' },
  { id: 'farmer-b', seed: 456, archetype: 'farmer' },
  { id: 'merchant-a', seed: 789, archetype: 'merchant' },
] as unknown as Townsperson[];

function civ(initialGrain = 0, population = 100): CivilizationState {
  return {
    version: 1,
    worldSeed: 1234,
    kingdoms: [],
    settlements: [{
      id: 'mosslight',
      population,
      storage: { grain: initialGrain },
    } as unknown as CivilizationState['settlements'][number]],
    rulers: [],
    castles: [],
    routes: [],
    caravans: [],
    units: [],
    events: [],
    lastSimDay: 1,
  } as CivilizationState;
}

function clock(day: number): WorldClockState {
  return {
    tick: day,
    year: 1,
    month: 1,
    week: 1,
    day,
    hour: 6,
    minuteOfDay: 360,
    second: 0,
    season: 'spring',
  };
}

const oneDay = civ();
applyNPCProduction(oneDay, farmers, clock(1));
const grainAfterDayOne = oneDay.settlements[0].storage.grain;
assert.equal(grainAfterDayOne, npcProductionSummary(farmers, 1).estimatedGrain);

// Calling the daily hook repeatedly on the same day must not duplicate output.
applyNPCProduction(oneDay, farmers, clock(1));
applyNPCProduction(oneDay, farmers, clock(1));
assert.equal(oneDay.settlements[0].storage.grain, grainAfterDayOne);

// Catch-up from day 1 to day 3 must match three deterministic daily yields.
const caughtUp = civ();
applyNPCProduction(caughtUp, farmers, clock(3));
const expected = [1, 2, 3].reduce((sum, day) => sum + npcProductionSummary(farmers, day).estimatedGrain, 0);
assert.equal(caughtUp.settlements[0].storage.grain, expected);
applyNPCProduction(caughtUp, farmers, clock(3));
assert.equal(caughtUp.settlements[0].storage.grain, expected);

// Storage remains capped even when the farmer roster is large.
const capped = civ(0, 1);
applyNPCProduction(capped, Array.from({ length: 100 }, (_, i) => ({
  id: `farmer-${i}`, seed: i + 1, archetype: 'farmer',
})) as unknown as Townsperson[], clock(1));
assert.equal(capped.settlements[0].storage.grain, 51);


const workers = [
  { id: 'farmer', seed: 123, archetype: 'farmer' },
  { id: 'smith', seed: 234, archetype: 'smith' },
  { id: 'priest', seed: 345, archetype: 'priest' },
] as unknown as Townsperson[];
const workCiv = civ();
applyNPCProduction(workCiv, workers, clock(2));
const expectedWork = npcWorkOutputSummary(workers, 1);
const expectedWorkDayTwo = npcWorkOutputSummary(workers, 2);
assert.equal(workCiv.settlements[0].storage.grain, expectedWork.grain + expectedWorkDayTwo.grain);
assert.equal(workCiv.settlements[0].storage.tools, expectedWork.tools + expectedWorkDayTwo.tools);
assert.equal(workCiv.settlements[0].storage.weapons, expectedWork.weapons + expectedWorkDayTwo.weapons);
assert.equal(workCiv.settlements[0].storage.medicine, expectedWork.medicine + expectedWorkDayTwo.medicine);
// Smith/priest output is deterministic and cannot be duplicated by another call on the same day.
const beforeRepeat = JSON.stringify(workCiv.settlements[0].storage);
applyNPCProduction(workCiv, workers, clock(2));
assert.equal(JSON.stringify(workCiv.settlements[0].storage), beforeRepeat);

console.log('Town production tests passed (idempotency, catch-up, storage cap).');
