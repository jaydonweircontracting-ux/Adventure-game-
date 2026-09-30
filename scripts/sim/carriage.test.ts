// Carriage network simulation tests.
// Run with: npx tsx scripts/sim/carriage.test.ts
import {
  STATION_DRIVERS,
  stopDriverFor,
  driverOnDuty,
  chunkDistance,
  carriagePrice,
  carriageTravelHours,
  carriageTravelTicks,
  serializeCarriage,
  deserializeCarriage,
} from '../../src/game/carriage';
import type { WorldClockState } from '../../src/game/worldCore';

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + label); }
}
function clockAt(hour: number): WorldClockState {
  return { tick: 0, year: 1, month: 1, week: 1, day: 1, hour, minuteOfDay: hour * 60, second: 0, season: 'spring' };
}

// --- Driver profiles: all four stations have full persistent NPC data ---
for (const dir of ['north', 'south', 'east', 'west'] as const) {
  const d = STATION_DRIVERS[dir];
  assert(!!d.name && d.name.length > 3, dir + ' driver has a name');
  assert(d.occupation === 'Carriage Driver', dir + ' driver occupation');
  assert(!!d.appearance && !!d.clothing && !!d.personality, dir + ' driver appearance/clothing/personality');
  assert(!!d.home && !!d.schedule && d.money >= 0, dir + ' driver home/schedule/money');
  assert(Array.isArray(d.inventory) && !!d.relationships, dir + ' driver inventory/relationships');
  assert(d.openHour >= 0 && d.openHour < 24 && d.closeHour > d.openHour, dir + ' driver hours sane');
  assert(!!d.greeting, dir + ' driver greeting');
}

// --- Schedules vary between drivers ---
const hours = new Set(Object.values(STATION_DRIVERS).map((d) => d.openHour + '-' + d.closeHour));
assert(hours.size >= 2, 'drivers do not all share identical hours');

// --- driverOnDuty follows the clock ---
assert(driverOnDuty(STATION_DRIVERS.north, clockAt(12)) === true, 'north driver on duty at noon');
assert(driverOnDuty(STATION_DRIVERS.north, clockAt(3)) === false, 'north driver off duty at 3am');
assert(driverOnDuty(STATION_DRIVERS.east, clockAt(6)) === true, 'east driver opens at 6');
assert(driverOnDuty(STATION_DRIVERS.east, clockAt(19)) === false, 'east driver closed at 19');
assert(driverOnDuty(STATION_DRIVERS.south, clockAt(20)) === true, 'south driver on duty at 20');

// --- Settlement stop drivers are deterministic ---
const a = stopDriverFor('Fenmere Hamlet', { x: 0, y: 7 });
const b = stopDriverFor('Fenmere Hamlet', { x: 0, y: 7 });
assert(a.name === b.name && a.age === b.age, 'stop driver deterministic');
const c = stopDriverFor('Westhold', { x: -7, y: 7 });
assert(c.name !== a.name || c.age !== a.age, 'different settlements get different drivers');

// --- Pricing: distance-based, towns cost more ---
const nearVillage = carriagePrice(4, 'village');
const farTown = carriagePrice(13, 'town');
const farVillage = carriagePrice(13, 'village');
assert(nearVillage < farVillage, 'near cheaper than far');
assert(farTown > farVillage, 'town premium over village at same distance');
assert(carriagePrice(4, 'village') === 5 + 12, 'price formula exact: 5 + 3*dist');
assert(carriagePrice(13, 'town') === 5 + 39 + 10, 'town price formula exact');

// --- Travel time scales with distance ---
assert(carriageTravelHours(4) < carriageTravelHours(13), 'farther takes longer');
assert(carriageTravelTicks(4) === carriageTravelHours(4) * 6, 'ticks = hours * 6 (10-min ticks)');
assert(carriageTravelHours(0) >= 1, 'minimum 1 hour');

// --- chunkDistance is Chebyshev (matches danger/region math) ---
assert(chunkDistance({ x: 4, y: 7 }, { x: 0, y: 7 }) === 4, 'distance Mosslight->Fenmere = 4');
assert(chunkDistance({ x: 4, y: 7 }, { x: 17, y: 7 }) === 13, 'distance Mosslight->Eastmarch = 13');

// --- Earnings serialization round-trips ---
const ser = serializeCarriage({ 'Harlan Greer': 120 });
assert(ser.earnings['Harlan Greer'] === 120, 'earnings serialize');
assert(Object.keys(deserializeCarriage(ser)).length === 1, 'earnings deserialize');
assert(Object.keys(deserializeCarriage(null)).length === 0, 'deserialize null safe');
assert(Object.keys(deserializeCarriage({ earnings: { x: 'nope' } })).length === 0, 'deserialize junk safe');

console.log(`carriage sim: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
