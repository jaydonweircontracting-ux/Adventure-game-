// Civilization simulation tests (living-world: kingdoms).
// Run with: npx tsx scripts/sim/civilization.test.ts
// Style mirrors scripts/simulate.ts: counted asserts, sections, exit code.
import { readFileSync } from 'node:fs';
import type { WorldClockState } from '../../src/game/worldCore';
import {
  createCivilization,
  advanceCivilization,
  recomputePrices,
  caravanPosition,
  caravanProgress,
  caravanStatus,
  rulerTarget,
  militaryTarget,
  militaryPosition,
  eventsForDay,
  lodFor,
  serializeCivilization,
  deserializeCivilization,
  settlementsByChunk,
  kingdomOfSettlement,
  settlementById,
  civDayFloat,
  type CivilizationState,
} from '../../src/game/civilization';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; if (failures.length < 30) failures.push(message); }
}

function makeClock(day: number, hour: number, minute = 0): WorldClockState {
  const minuteOfDay = hour * 60 + minute;
  return {
    tick: 0, year: 1, month: 1, week: 1, day,
    hour, minuteOfDay, second: 0, season: 'spring',
  };
}

/** Clock whose civDayFloat() equals the target (within a minute). */
function clockForDayFloat(target: number): WorldClockState {
  const day = Math.floor(target) + 1;
  const minuteOfDay = Math.round((target - Math.floor(target)) * 1440);
  return makeClock(day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
}

// ---- 1. Creation determinism ----
console.log('Testing civilization determinism...');
{
  const a = createCivilization(847291583);
  const b = createCivilization(847291583);
  assert(JSON.stringify(a) === JSON.stringify(b), 'createCivilization not deterministic for same seed');
  const c = createCivilization(12345);
  assert(JSON.stringify(a) !== JSON.stringify(c), 'different seeds produced identical civilizations');
  for (let i = 0; i < 20; i++) {
    const x = createCivilization(7000 + i);
    const y = createCivilization(7000 + i);
    assert(JSON.stringify(x) === JSON.stringify(y), `seed ${7000 + i} not deterministic`);
  }
}

// ---- 2. Structure: kingdoms, settlements, rulers, castles ----
console.log('Testing civilization structure...');
{
  const civ = createCivilization(847291583);
  assert(civ.kingdoms.length === 2, `expected 2 kingdoms, got ${civ.kingdoms.length}`);
  const aldoria = civ.kingdoms.find((k) => k.id === 'aldoria');
  const thalara = civ.kingdoms.find((k) => k.id === 'thalara');
  assert(aldoria?.name === 'Kingdom of Aldoria', 'Aldoria name wrong');
  assert(thalara?.name === 'Kingdom of Thalara', 'Thalara name wrong');
  assert(aldoria?.capital === 'aldor', 'Aldoria capital wrong');
  assert(thalara?.capital === 'valdris', 'Thalara capital wrong');
  // Peaceful by default: no wars, trade/neutral relations.
  for (const kingdom of civ.kingdoms) {
    assert(kingdom.wars.length === 0, `${kingdom.id} starts at war`);
    for (const relation of Object.values(kingdom.relations)) {
      assert(relation === 'trade' || relation === 'neutral' || relation === 'alliance',
        `${kingdom.id} has non-peaceful relation ${relation}`);
    }
  }
  // Settlement hierarchy present in both kingdoms. Note: the authoritative
  // world map has no 'city'-kind settlements (largest are towns), so the
  // hierarchy is capital > town > village > hamlet > farm.
  for (const kingdom of civ.kingdoms) {
    const owned = civ.settlements.filter((s) => s.kingdomId === kingdom.id);
    assert(owned.some((s) => s.kind === 'capital'), `${kingdom.id} has no capital`);
    assert(owned.some((s) => s.kind === 'town'), `${kingdom.id} has no town`);
    assert(owned.some((s) => s.kind === 'village'), `${kingdom.id} has no village`);
    assert(owned.some((s) => s.kind === 'farm'), `${kingdom.id} has no farm`);
  }
  // Capitals get King/Queen; hamlets and farms get no ruler.
  for (const ruler of civ.rulers) {
    const settlement = settlementById(civ, ruler.settlementId);
    assert(settlement !== undefined, `ruler ${ruler.id} points at missing settlement`);
    if (settlement?.kind === 'capital') {
      assert(ruler.title === 'King' || ruler.title === 'Queen', `capital ruler has title ${ruler.title}`);
    }
    assert(ruler.heirs.length <= 2, `ruler ${ruler.id} has too many heirs`);
    assert(ruler.personality.length === 2, `ruler ${ruler.id} personality wrong size`);
  }
  const ruledKinds = new Set(civ.rulers.map((r) => settlementById(civ, r.settlementId)?.kind));
  assert(!ruledKinds.has('hamlet') && !ruledKinds.has('farm'), 'hamlets/farms must not have rulers');
  // Ruler ids referenced by kingdoms exist.
  for (const kingdom of civ.kingdoms) {
    assert(civ.rulers.some((r) => r.id === kingdom.ruler), `${kingdom.id} ruler id dangles`);
  }
  // Castles: two capitals + two fortresses.
  assert(civ.castles.length === 4, `expected 4 castles, got ${civ.castles.length}`);
  for (const castle of civ.castles) {
    assert(settlementById(civ, castle.settlementId) !== undefined, `castle ${castle.id} settlement missing`);
    if (castle.kind === 'capital') {
      assert(castle.rooms.includes('throne room'), `${castle.id} missing throne room`);
    } else {
      assert(castle.rooms.includes('barracks'), `${castle.id} fortress missing barracks`);
    }
  }
  // Routes chain farm -> ... -> capital with real waypoints.
  assert(civ.routes.length === 6, `expected 6 trade routes, got ${civ.routes.length}`);
  for (const route of civ.routes) {
    assert(route.waypoints.length >= 2, `route ${route.id} has < 2 waypoints`);
    assert(route.goods.length > 0, `route ${route.id} carries no goods`);
    assert(route.danger >= 0 && route.danger <= 1, `route ${route.id} danger out of range`);
    assert(settlementById(civ, route.from) !== undefined, `route ${route.id} from dangles`);
    assert(settlementById(civ, route.to) !== undefined, `route ${route.id} to dangles`);
  }
  // Lookups.
  assert(settlementsByChunk(civ, { x: 4, y: 7 }).some((s) => s.id === 'mosslight'), 'settlementsByChunk missed Mosslight');
  assert(kingdomOfSettlement(civ, 'aldor')?.id === 'aldoria', 'kingdomOfSettlement wrong for aldor');
  assert(kingdomOfSettlement(civ, 'valdris')?.id === 'thalara', 'kingdomOfSettlement wrong for valdris');
  assert(kingdomOfSettlement(civ, 'nope') === undefined, 'kingdomOfSettlement should be undefined for unknown');
}

// ---- 3. Price reaction: grain cheap where produced, dear where consumed ----
console.log('Testing price reactions...');
{
  const civ = createCivilization(847291583);
  const farm = settlementById(civ, 'greenfield-farm-1')!;
  const city = settlementById(civ, 'ravenhold')!;
  assert((farm.production.grain || 0) > 20, 'test farm does not produce grain');
  assert((city.consumption.grain || 0) > 20, 'test city does not consume grain');
  assert(farm.prices.grain < city.prices.grain,
    `grain not cheaper at producing farm (${farm.prices.grain}) than consuming city (${city.prices.grain})`);
  // recomputePrices is pure.
  const once = recomputePrices(farm);
  const twice = recomputePrices(farm);
  assert(JSON.stringify(once) === JSON.stringify(twice), 'recomputePrices not pure');
  assert(once.grain === farm.prices.grain, 'recomputePrices disagrees with stored prices');
  // Prices stay within sane bands.
  for (const settlement of civ.settlements) {
    for (const resource of Object.keys(settlement.prices) as (keyof typeof settlement.prices)[]) {
      assert(settlement.prices[resource] > 0, `${settlement.id}.${resource} non-positive price`);
    }
  }
}

// ---- 4. Caravans are analytic: pure function of (caravan, clock) ----
console.log('Testing analytic caravans...');
{
  const civ = createCivilization(4242);
  const caravan = civ.caravans[0];
  const dep = caravan.departureDay;
  const mid = dep + caravan.travelDays / 2;
  const arr = dep + caravan.travelDays + 0.01;
  assert(caravanProgress(caravan, dep) === 0, 'progress at departure should be 0');
  assert(Math.abs(caravanProgress(caravan, mid) - 0.5) < 0.01, 'progress mid-journey should be ~0.5');
  assert(caravanProgress(caravan, arr) === 1, 'progress after arrival should be 1');
  assert(caravanStatus(caravan, dep - 1) === 'scheduled', 'should be scheduled before departure');
  assert(caravanStatus(caravan, mid) === 'traveling', 'should be traveling mid-journey');
  assert(caravanStatus(caravan, arr) === 'arrived', 'should be arrived after travel');
  // Same clock -> same position (world continues while player is absent).
  const clockMid = clockForDayFloat(mid);
  const posA = caravanPosition(caravan, clockMid, civ);
  const posB = caravanPosition(caravan, clockMid, civ);
  assert(JSON.stringify(posA) === JSON.stringify(posB), 'caravan position not deterministic');
  assert(posA.status === 'traveling', 'mid-journey position status wrong');
  assert(posA.progress > 0 && posA.progress < 1, 'mid-journey progress out of range');
  assert(Number.isFinite(posA.chunk.x) && Number.isFinite(posA.position.x), 'caravan position not finite');
  // Arrival lands exactly on the destination settlement.
  const clockArr = clockForDayFloat(dep + caravan.travelDays);
  const posArr = caravanPosition(caravan, clockArr, civ);
  const dest = settlementById(civ, caravan.destinationId)!;
  assert(posArr.chunk.x === dest.chunk.x && posArr.chunk.y === dest.chunk.y, 'arrival chunk != destination chunk');
  assert(Math.abs(posArr.position.x - dest.position.x) < 0.01, 'arrival position != destination position');
  // Reversed caravans walk the route backwards.
  const reversed = { ...caravan, reversed: true, id: 'reversed-test' };
  const posRev = caravanPosition(reversed, clockForDayFloat(dep + caravan.travelDays), civ);
  const origin = settlementById(civ, caravan.originId)!;
  assert(posRev.chunk.x === origin.chunk.x && posRev.chunk.y === origin.chunk.y, 'reversed arrival != origin');
}

// ---- 5. Ruler schedules are pure ----
console.log('Testing ruler schedules...');
{
  const civ = createCivilization(99);
  const ruler = civ.rulers[0];
  const morning = makeClock(10, 8);
  const night = makeClock(10, 23, 30);
  const a = rulerTarget(ruler, morning);
  const b = rulerTarget(ruler, morning);
  assert(a.activity === b.activity && a.indoors === b.indoors, 'rulerTarget not pure');
  assert(rulerTarget(ruler, night).activity === 'Sleeping', 'ruler should sleep at night');
  assert(rulerTarget(ruler, night).indoors === true, 'ruler should sleep indoors');
  // The routine actually varies across the day.
  const activities = new Set<string>();
  for (let h = 0; h < 24; h++) activities.add(rulerTarget(ruler, makeClock(10, h)).activity);
  assert(activities.size >= 6, `ruler routine too flat: ${[...activities].join(', ')}`);
  assert(activities.has('Holding council'), 'ruler never holds council');
}

// ---- 6. Military: garrison routine + analytic travel ----
console.log('Testing military...');
{
  const civ = createCivilization(777);
  const garrison = civ.units.find((u) => u.kind === 'garrison')!;
  assert(militaryTarget(garrison, makeClock(5, 3), civ).activity.includes('Sleeping'), 'garrison should sleep at 3am');
  const midday = militaryTarget(garrison, makeClock(5, 10), civ).activity;
  assert(midday === 'Patrolling' || midday === 'Gate duty', `garrison midday duty wrong: ${midday}`);
  assert(militaryTarget(garrison, makeClock(5, 10), civ).activity === midday, 'militaryTarget not pure');
  const traveling = civ.units.find((u) => u.journey)!;
  const j = traveling.journey!;
  const posA = militaryPosition(traveling, clockForDayFloat(j.departureDay + j.travelDays / 2), civ);
  const posB = militaryPosition(traveling, clockForDayFloat(j.departureDay + j.travelDays / 2), civ);
  assert(JSON.stringify(posA) === JSON.stringify(posB), 'military position not deterministic');
  assert(posA.status === 'traveling', 'traveling unit should be traveling mid-journey');
  const homePos = militaryPosition(traveling, clockForDayFloat(j.departureDay - 1), civ);
  assert(homePos.status === 'stationed', 'unit should be stationed before departure');
  // Capital garrison is the largest force.
  const aldorGarrison = civ.units.find((u) => u.id === 'unit-aldor-garrison')!;
  for (const unit of civ.units.filter((u) => u.kingdomId === 'aldoria' && u.kind === 'garrison')) {
    assert(aldorGarrison.size >= unit.size, 'capital garrison should be the largest Aldorian force');
  }
}

// ---- 7. World events: uncommon, deterministic ----
console.log('Testing world events...');
{
  const civ = createCivilization(31337);
  const places = civ.settlements.map((s) => ({ id: s.id, name: s.name }));
  const routes = civ.routes.map((r) => ({ id: r.id, name: r.name }));
  let total = 0;
  for (let day = 1; day <= 365; day++) {
    const events = eventsForDay(civ.worldSeed, day, places, routes);
    assert(events.length <= 1, `day ${day} produced ${events.length} events (should be 0-1)`);
    for (const event of events) {
      assert(event.day === day, 'event day mismatch');
      assert(event.description.length > 0, 'event missing description');
      assert(event.id === `civevt-${day}-0`, 'event id not deterministic');
    }
    total += events.length;
  }
  const avg = total / 365;
  assert(avg < 2, `events too common: ${avg.toFixed(2)}/day average`);
  assert(avg > 0.1, `events too rare to matter: ${avg.toFixed(2)}/day average`);
  assert(JSON.stringify(eventsForDay(99, 50, places, routes)) === JSON.stringify(eventsForDay(99, 50, places, routes)),
    'eventsForDay not deterministic');
}

// ---- 8. Daily advance: economy, arrivals, idempotency ----
console.log('Testing daily advance...');
{
  const civ: CivilizationState = createCivilization(555);
  assert(civ.lastSimDay === 1, 'lastSimDay should start at 1');
  const before = JSON.stringify(civ.settlements.map((s) => s.storage));
  const journeyBefore = JSON.stringify(civ.units.map((u) => u.journey));
  advanceCivilization(civ, makeClock(30, 12));
  assert(civ.lastSimDay === 30, `lastSimDay should be 30, got ${civ.lastSimDay}`);
  assert(JSON.stringify(civ.settlements.map((s) => s.storage)) !== before, 'economy did not move storage');
  // All initial caravans arrived by day 30: return trips spawned + arrival events.
  const initialCaravans = civ.caravans.filter((c) => !c.id.endsWith('-return'));
  assert(initialCaravans.length === 12, `expected 12 initial caravans, got ${initialCaravans.length}`);
  assert(initialCaravans.every((c) => c.returnSpawned), 'some initial caravans never processed arrival');
  // Return trips keep trading: short-route returns have already spawned
  // second-generation trips by day 30 (perpetual trade, capped at 120).
  assert(civ.caravans.length >= 24, `expected >= 24 caravans, got ${civ.caravans.length}`);
  assert(civ.events.some((e) => e.type === 'caravan_arrival'), 'no caravan_arrival events recorded');
  // Traveling military units turned around at least once.
  assert(JSON.stringify(civ.units.map((u) => u.journey)) !== journeyBefore, 'military journeys never turned around');
  // Idempotent: same clock again changes nothing.
  const eventsLen = civ.events.length;
  const caravansLen = civ.caravans.length;
  advanceCivilization(civ, makeClock(30, 12));
  assert(civ.lastSimDay === 30, 're-advance moved lastSimDay');
  assert(civ.events.length === eventsLen, 're-advance duplicated events');
  assert(civ.caravans.length === caravansLen, 're-advance duplicated caravans');
  // Backward clock is a safe no-op.
  advanceCivilization(civ, makeClock(5, 12));
  assert(civ.lastSimDay === 30, 'backward clock moved lastSimDay');
  // Kingdom ledgers updated.
  for (const kingdom of civ.kingdoms) {
    assert(kingdom.population > 0, `${kingdom.id} has no population`);
    assert(kingdom.economy > 0, `${kingdom.id} has no economy`);
    assert(kingdom.treasury > 0, `${kingdom.id} has no treasury`);
  }
}

// ---- 9. Serialization round-trip ----
console.log('Testing serialization...');
{
  const civ = createCivilization(808);
  advanceCivilization(civ, makeClock(10, 9));
  const restored = deserializeCivilization(serializeCivilization(civ));
  assert(JSON.stringify(restored) === JSON.stringify(civ), 'serialize/deserialize round-trip mismatch');
  let threw = false;
  try { deserializeCivilization('{"version":99}'); } catch { threw = true; }
  assert(threw, 'deserialize should reject bad version');
}

// ---- 10. Simulation LOD ----
console.log('Testing simulation LOD...');
{
  assert(lodFor({ x: 4, y: 7 }, { x: 4, y: 7 }) === 'full', 'same chunk should be full');
  assert(lodFor({ x: 5, y: 7 }, { x: 4, y: 7 }) === 'full', 'adjacent chunk should be full');
  assert(lodFor({ x: 6, y: 7 }, { x: 4, y: 7 }) === 'reduced', '2-away chunk should be reduced');
  assert(lodFor({ x: 9, y: 7 }, { x: 4, y: 7 }) === 'abstract', '5-away chunk should be abstract');
  assert(lodFor({ x: 130, y: -16 }, { x: 4, y: 7 }) === 'event', 'far continent should be event-level');
}

// ---- 11. No Math.random in the module ----
console.log('Testing determinism hygiene...');
{
  const src = readFileSync(new URL('../../src/game/civilization.ts', import.meta.url), 'utf8');
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/Math\.random\s*\(/.test(codeOnly), 'civilization.ts calls Math.random');
}

// ---- Results ----
console.log(`\n${'='.repeat(50)}`);
console.log(`${'='.repeat(50)}`);
if (failures.length > 0) {
  console.log('\nFirst failures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log(`CIVILIZATION SIM COMPLETE: ${passed} passed, ${failed} failed`);
