// Sim tests for character generation + world horses.
// Run with: npx tsx scripts/sim/character-horses.test.ts
// (Standalone file, same assert style as scripts/simulate.ts; not wired into
// it so no existing files are modified.)
import {
  generateName,
  generateOccupation,
  generateCharacter,
  generateFamily,
  generateSettlementPopulation,
  characterSeed,
  type CharacterProfile,
} from '../../src/game/characterGen';
import {
  createHorses,
  horseTarget,
  mountedTravelers,
  serializeHorses,
  deserializeHorses,
  assignRider,
  stableHorse,
  type Stable,
} from '../../src/game/horses';
import type { WorldClockState } from '../../src/game/worldCore';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; if (failures.length < 25) failures.push(message); }
}

function makeClock(hour: number, day = 1): WorldClockState {
  return {
    tick: day * 144, year: 1, month: 1, week: 1, day,
    hour, minuteOfDay: hour * 60, second: 0, season: 'spring',
  };
}

// ---- 1. Name generation determinism ----
console.log('Testing name generation determinism...');
for (let i = 0; i < 500; i++) {
  const a = generateName('male', i);
  const b = generateName('male', i);
  const c = generateName('female', i);
  assert(a === b, `Male name not deterministic for seed ${i}`);
  assert(typeof a === 'string' && a.includes(' '), `Male name malformed for seed ${i}: ${a}`);
  assert(typeof c === 'string' && c.includes(' '), `Female name malformed for seed ${i}: ${c}`);
}

// ---- 2. Character profile determinism (same triple -> same profile) ----
console.log('Testing profile determinism...');
for (let i = 0; i < 300; i++) {
  const a = generateCharacter(847291583, 'mosslight-crossing', 'aldoria', i);
  const b = generateCharacter(847291583, 'mosslight-crossing', 'aldoria', i);
  assert(JSON.stringify(a) === JSON.stringify(b), `Profile not deterministic for index ${i}`);
}
{
  const seed = characterSeed(1, 'x', 5);
  assert(seed === characterSeed(1, 'x', 5), 'characterSeed not deterministic');
  assert(characterSeed(1, 'x', 5) !== characterSeed(1, 'y', 5), 'characterSeed ignores settlementId');
}

// ---- 3. Gender-occupation openness: both genders appear in martial/merchant roles ----
console.log('Testing gender-occupation openness (sample 200 per check)...');
{
  const roles = ['guard', 'soldier', 'merchant', 'blacksmith'] as const;
  for (const role of roles) {
    // Direct check: is the role reachable for both genders at all?
    let maleHit = false; let femaleHit = false;
    for (let seed = 0; seed < 2000 && !(maleHit && femaleHit); seed++) {
      if (generateOccupation(seed, 'male') === role) maleHit = true;
      if (generateOccupation(seed * 31 + 1, 'female') === role) femaleHit = true;
    }
    assert(maleHit, `No male ${role} generated in 2000 draws — role may be gender-locked`);
    assert(femaleHit, `No female ${role} generated in 2000 draws — role may be gender-locked`);
  }
}
{
  // In full profiles, sample 200 characters of each gender; both must appear
  // in the martial/merchant occupations at least once (weighted openness).
  const gendersByOcc = new Map<string, Set<string>>();
  for (let i = 0; i < 400; i++) {
    const gender = i % 2 === 0 ? 'male' : 'female';
    const p = generateCharacter(99, 'test-town', 'aldoria', i, undefined);
    void gender;
    const set = gendersByOcc.get(p.occupation) ?? new Set<string>();
    set.add(p.gender);
    gendersByOcc.set(p.occupation, set);
  }
  for (const role of ['guard', 'soldier', 'merchant', 'blacksmith'] as const) {
    const set = gendersByOcc.get(role);
    assert(set !== undefined && set.has('male') && set.has('female'),
      `Role ${role} missing a gender in 400-profile sample: ${set ? [...set].join(',') : 'none'}`);
  }
}

// ---- 4. Family link consistency ----
console.log('Testing family link consistency...');
{
  const family = generateFamily(847291583, 'mosslight-crossing', 'aldoria', 0);
  assert(family.length >= 2 && family.length <= 5, `Family size out of range: ${family.length}`);
  const byId = new Map(family.map((m) => [m.id, m]));
  for (const member of family) {
    // Spouse links are mutual.
    if (member.family.spouse) {
      const spouse = byId.get(member.family.spouse);
      assert(!!spouse, `Spouse ${member.family.spouse} of ${member.id} not in family`);
      assert(spouse?.family.spouse === member.id,
        `Spouse link not mutual: ${member.id} -> ${spouse?.id}, back -> ${spouse?.family.spouse}`);
    }
    // Children reference both parents; parents list the children.
    for (const childId of member.family.children) {
      const child = byId.get(childId);
      assert(!!child, `Child ${childId} of ${member.id} not in family`);
      assert(child?.family.parents.includes(member.id),
        `Child ${childId} does not list parent ${member.id}`);
    }
    for (const parentId of member.family.parents) {
      const parent = byId.get(parentId);
      assert(!!parent, `Parent ${parentId} of ${member.id} not in family`);
      assert(parent?.family.children.includes(member.id),
        `Parent ${parentId} does not list child ${member.id}`);
    }
    // Shared home and surname.
    assert(member.home === 'mosslight-crossing', `Family member home mismatch: ${member.home}`);
  }
  const surnames = new Set(family.map((m) => m.name.split(' ')[1]));
  assert(surnames.size === 1, `Family shares no surname: ${[...surnames].join(', ')}`);
}

// ---- 5. Settlement population determinism + leader guarantees ----
console.log('Testing settlement population...');
{
  const a = generateSettlementPopulation(847291583, 'aldor', 'aldoria', 40, 'capital');
  const b = generateSettlementPopulation(847291583, 'aldor', 'aldoria', 40, 'capital');
  assert(a.length === 40, `Capital roster length ${a.length} != 40`);
  assert(JSON.stringify(a) === JSON.stringify(b), 'Capital roster not deterministic');
  assert(a.some((p) => p.occupation === 'ruler'), 'Capital missing a ruler');
  assert(a.some((p) => p.occupation === 'guard'), 'Capital missing guards');
  assert(a.some((p) => p.gender === 'female'), 'Capital roster has no women');
  assert(a.some((p) => p.gender === 'male'), 'Capital roster has no men');
  const v = generateSettlementPopulation(847291583, 'oakrest', 'aldoria', 20, 'village');
  assert(!v.some((p) => p.occupation === 'ruler' || p.occupation === 'queen'),
    'Village should not have a ruler/queen');
}

// ---- 6. Horse ownership correlates with wealth/occupation ----
console.log('Testing horse ownership correlation...');
{
  const mk = (occupation: CharacterProfile['occupation'], wealth: number, index: number): CharacterProfile =>
    generateCharacter(7, 'stable-town', 'aldoria', index, occupation);
  const nobleProfiles: CharacterProfile[] = [];
  const workProfiles: CharacterProfile[] = [];
  for (let i = 0; i < 12; i++) nobleProfiles.push(mk('noble', 85, i));
  for (let i = 0; i < 12; i++) workProfiles.push(mk('guard', 45, 100 + i));
  for (let i = 0; i < 36; i++) workProfiles.push(mk('farmer', 25, 200 + i));
  const { horses } = createHorses(847291583,
    [
      { id: 'noble-ville', chunk: { x: 0, y: 0 }, kind: 'town' },
      { id: 'work-ville', chunk: { x: 1, y: 0 }, kind: 'city' },
    ],
    { 'noble-ville': nobleProfiles, 'work-ville': workProfiles });
  const owners = new Set(horses.map((h) => h.owner));
  const nobleOwned = nobleProfiles.filter((p) => owners.has(p.id)).length;
  const guardOwned = workProfiles.slice(0, 12).filter((p) => owners.has(p.id)).length;
  const farmerOwned = workProfiles.slice(12).filter((p) => owners.has(p.id)).length;
  const nobleRate = nobleOwned / 12;
  const guardRate = guardOwned / 12;
  const farmerRate = farmerOwned / 36;
  assert(nobleRate > farmerRate, `Nobles should own more horses than farmers: ${nobleRate} vs ${farmerRate}`);
  assert(guardRate > farmerRate, `Guards should own more horses than farmers: ${guardRate} vs ${farmerRate}`);
  assert(horses.some((h) => h.owner === 'wild'), 'No wild horses created');
  // Not every NPC owns a horse.
  const totalProfiles = nobleProfiles.length + workProfiles.length;
  assert(horses.filter((h) => h.owner !== 'wild').length < totalProfiles,
    'Every NPC owns a horse — ownership should be selective');
}

// ---- 7. horseTarget is a pure function of clock ----
console.log('Testing horseTarget purity + daily loop...');
{
  const profile = generateCharacter(7, 'stable-town', 'aldoria', 0, 'guard');
  const stable: Stable = {
    id: 'stable-stable-town', settlementId: 'stable-town',
    chunk: { x: 0, y: 0 }, position: { x: 30, y: 115 }, capacity: 10,
  };
  const { horses } = createHorses(847291583,
    [{ id: 'stable-town', chunk: { x: 0, y: 0 }, kind: 'town' }],
    { 'stable-town': [profile] });
  const horse = horses.find((h) => h.owner === profile.id);
  assert(!!horse, 'Guard did not get a horse');
  if (horse) {
    const morning = makeClock(8);
    const t1 = horseTarget(horse, profile, [stable], morning);
    const t2 = horseTarget(horse, profile, [stable], morning);
    assert(JSON.stringify(t1) === JSON.stringify(t2), 'horseTarget not pure for same clock');
    const midday = horseTarget(horse, profile, [stable], makeClock(12));
    const night = horseTarget(horse, profile, [stable], makeClock(23));
    assert(midday.activity === 'stabled', `Midday expected stabled, got ${midday.activity}`);
    assert(night.activity === 'stabled', `Night expected stabled, got ${night.activity}`);
    assert(t1.activity === 'ridden' || t1.activity === 'being_led',
      `Morning expected ridden/being_led, got ${t1.activity}`);
  }
}

// ---- 8. mountedTravelers: pure function of clock, varies with conditions ----
console.log('Testing mounted travelers...');
{
  const a = mountedTravelers(847291583, makeClock(8), { roadImportance: 2 });
  const b = mountedTravelers(847291583, makeClock(8), { roadImportance: 2 });
  assert(JSON.stringify(a) === JSON.stringify(b), 'mountedTravelers not pure for same clock');
  const night = mountedTravelers(847291583, makeClock(2), { roadImportance: 2 });
  assert(night.length === 0, `Night riders should be near-zero, got ${night.length}`);
  const blizzard = mountedTravelers(847291583, makeClock(8), { roadImportance: 2, weatherMod: 0.2 });
  const clear = mountedTravelers(847291583, makeClock(8), { roadImportance: 2, weatherMod: 1 });
  assert(blizzard.length <= clear.length,
    `Blizzard should not exceed clear-weather traffic: ${blizzard.length} vs ${clear.length}`);
  for (const t of a) {
    assert(typeof t.horseId === 'string' && t.horseId.length > 0, 'Mounted traveler missing horseId');
    assert(typeof t.destination === 'string' && typeof t.origin === 'string', 'Mounted traveler missing origin/destination');
  }
}

// ---- 9. Serialization round-trip ----
console.log('Testing horse serialization round-trip...');
{
  const profile = generateCharacter(7, 'stable-town', 'aldoria', 0, 'noble');
  const { horses, stables } = createHorses(847291583,
    [{ id: 'stable-town', chunk: { x: 0, y: 0 }, kind: 'town' }],
    { 'stable-town': [profile] });
  const ridden = horses.length > 0 ? assignRider(horses[0], profile.id) : null;
  const restabled = ridden ? stableHorse(ridden, ridden.stableId) : null;
  assert(ridden?.currentRider === profile.id, 'assignRider did not set rider');
  assert(restabled?.currentRider === null, 'stableHorse did not clear rider');
  assert(horses[0]?.currentRider === null, 'assignRider mutated the original horse');
  const roundTrip = deserializeHorses(serializeHorses(horses, stables));
  assert(JSON.stringify(roundTrip.horses) === JSON.stringify(horses), 'Horse serialization round-trip mismatch');
  assert(JSON.stringify(roundTrip.stables) === JSON.stringify(stables), 'Stable serialization round-trip mismatch');
  const empty = deserializeHorses(null);
  assert(empty.horses.length === 0 && empty.stables.length === 0, 'deserializeHorses(null) should be empty');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('Failures:');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failed > 0 ? 1 : 0);
