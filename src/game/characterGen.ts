// Expanded NPC character generation (living-world phases 15-16).
//
// Design notes:
// - Women are fully integrated: Gender is 'male' | 'female' and BOTH genders
//   can hold ANY occupation. generateOccupation() uses weights that nudge
//   toward common pairings (e.g. more female queens, more male miners) but
//   never locks an occupation to a gender — every role is open to everyone.
// - NO Math.random anywhere. All generation is a pure function of the
//   (worldSeed, settlementId, index) triple via townsfolkHash-style hashing,
//   so the same inputs always produce the same world across saves/loads.
// - All types are plain serializable data (no class instances, no Maps).
// - Follows the existing townsfolk.ts pattern: persistent identities with
//   seeded personality; schedule/time is resolved at render time from the
//   world clock, not stored here.
import { townsfolkHash } from './townsfolk';

export type Gender = 'male' | 'female';

export type CharacterOccupation =
  | 'farmer' | 'merchant' | 'blacksmith' | 'guard' | 'soldier' | 'archer'
  | 'hunter' | 'noble' | 'ruler' | 'queen' | 'mage' | 'innkeeper'
  | 'trader' | 'craftworker' | 'traveler' | 'adventurer' | 'priest'
  | 'scholar' | 'servant' | 'horseRider' | 'caravanWorker' | 'miner'
  | 'fisher' | 'healer' | 'bard' | 'scout' | 'cook';

export type CharacterAppearance = {
  hairColor: 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'white';
  hairStyle: string;
  skinTone: string;
  clothingColor: string;
  clothingStyle: string;
};

export type FamilyLinks = {
  /** Profile id of the spouse, if any. Always mutual. */
  spouse?: string;
  /** Profile ids of parents. Always mutually listed under parents' children. */
  parents: string[];
  /** Profile ids of children. */
  children: string[];
  /** Profile ids of siblings. */
  siblings: string[];
};

export type CharacterProfile = {
  id: string;
  name: string;
  gender: Gender;
  age: number;
  appearance: CharacterAppearance;
  occupation: CharacterOccupation;
  personality: string[];
  /** Settlement this character calls home (settlement id). */
  home: string;
  family: FamilyLinks;
  faction: string;
  kingdomId: string;
  /** 0-100. Drives housing quality, clothing, and horse ownership. */
  wealth: number;
  /** Free-text note about carried belongings (kept in profile, not a full item list). */
  inventoryNote: string;
  /** Free-text description of the daily routine (pure, driven by the clock at render). */
  scheduleNote: string;
};

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const MALE_FIRST_NAMES = [
  'Aldric', 'Bram', 'Cedric', 'Doran', 'Edmund', 'Falk', 'Garrick', 'Hadrian',
  'Ivor', 'Jorunn', 'Kael', 'Leofric', 'Marek', 'Norvin', 'Osric', 'Perrin',
  'Quent', 'Rurik', 'Soren', 'Tam', 'Ulric', 'Vey', 'Wystan', 'Xander',
  'Yorick', 'Zev', 'Bran', 'Cormac', 'Dain', 'Ellric',
];

const FEMALE_FIRST_NAMES = [
  'Aeliana', 'Brenna', 'Celia', 'Delia', 'Elara', 'Freya', 'Gisela', 'Hilda',
  'Isolde', 'Juna', 'Kessa', 'Liora', 'Mira', 'Nessa', 'Odessa', 'Petra',
  'Quilla', 'Rowan', 'Sella', 'Tilda', 'Ursula', 'Vera', 'Wren', 'Xenia',
  'Ysolde', 'Zara', 'Anwen', 'Brielle', 'Corvina', 'Elswyth',
];

const SURNAMES = [
  'Ashwood', 'Blackbriar', 'Coppersmith', 'Dunmore', 'Elmsworth', 'Fairwind',
  'Grimsbane', 'Halloway', 'Ironfield', 'Jorvik', 'Kestrel', 'Longfellow',
  'Marshwood', 'Nettleby', 'Oakenshield', 'Peregrine', 'Quarryman', 'Ravensworth',
  'Stonebridge', 'Thistledown', 'Underbough', 'Valewood', 'Winterbourne',
  'Yewdale', 'Zephyr', 'Barrowman', 'Cindermoor', 'Driftwood', 'Emberlyn', 'Frosthold',
];

function pick<T>(seed: number, salt: number, arr: readonly T[]): T {
  return arr[Math.floor(townsfolkHash(seed, salt) * arr.length) % arr.length];
}

/** Deterministic full name for the given gender and seed. */
export function generateName(gender: Gender, seed: number): string {
  const first = gender === 'male'
    ? pick(seed, 11, MALE_FIRST_NAMES)
    : pick(seed, 11, FEMALE_FIRST_NAMES);
  return first + ' ' + pick(seed, 12, SURNAMES);
}

// ---------------------------------------------------------------------------
// Occupations — open to all genders, weighted but never locked
// ---------------------------------------------------------------------------

/**
 * Every occupation is open to every gender. Weights nudge toward common
 * pairings (e.g. queens skew female, miners skew male) but the door is never
 * closed: a guard/soldier/merchant/blacksmith can be a woman, a ruler/queen
 * can be a man (as king-adjacent 'ruler'/'queen' titles are gendered by the
 * caller, see generateCharacter).
 */
const OCCUPATION_WEIGHTS: Record<CharacterOccupation, { m: number; f: number }> = {
  farmer:       { m: 10, f: 10 },
  merchant:     { m: 7,  f: 7 },
  blacksmith:   { m: 6,  f: 4 },
  guard:        { m: 8,  f: 6 },
  soldier:      { m: 8,  f: 6 },
  archer:       { m: 6,  f: 6 },
  hunter:       { m: 7,  f: 5 },
  noble:        { m: 4,  f: 4 },
  ruler:        { m: 1,  f: 1 },
  queen:        { m: 0,  f: 1 },  // title only; rare by design
  mage:         { m: 3,  f: 3 },
  innkeeper:    { m: 5,  f: 5 },
  trader:       { m: 6,  f: 6 },
  craftworker:  { m: 6,  f: 6 },
  traveler:     { m: 8,  f: 8 },
  adventurer:   { m: 6,  f: 6 },
  priest:       { m: 4,  f: 4 },
  scholar:      { m: 4,  f: 4 },
  servant:      { m: 7,  f: 7 },
  horseRider:   { m: 5,  f: 5 },
  caravanWorker:{ m: 6,  f: 4 },
  miner:        { m: 7,  f: 3 },
  fisher:       { m: 7,  f: 5 },
  healer:       { m: 4,  f: 6 },
  bard:         { m: 4,  f: 4 },
  scout:        { m: 6,  f: 6 },
  cook:         { m: 5,  f: 5 },
};

const ALL_OCCUPATIONS = Object.keys(OCCUPATION_WEIGHTS) as CharacterOccupation[];

/** Weighted occupation pick. Both genders can draw any occupation. */
export function generateOccupation(seed: number, gender: Gender): CharacterOccupation {
  const key = gender === 'male' ? 'm' : 'f';
  const total = ALL_OCCUPATIONS.reduce((sum, occ) => sum + OCCUPATION_WEIGHTS[occ][key], 0);
  let roll = townsfolkHash(seed, 21) * total;
  for (const occ of ALL_OCCUPATIONS) {
    roll -= OCCUPATION_WEIGHTS[occ][key];
    if (roll <= 0) return occ;
  }
  return ALL_OCCUPATIONS[ALL_OCCUPATIONS.length - 1];
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

const HAIR_COLORS = ['black', 'brown', 'blonde', 'red', 'gray', 'white'] as const;
const HAIR_STYLES = [
  'short cropped', 'shoulder length', 'long braided', 'topknot', 'loose waves',
  'balding', 'shaved', 'twin braids', 'ponytail', 'messy curls',
];
const SKIN_TONES = ['pale', 'fair', 'tan', 'bronze', 'deep brown', 'olive'];
const CLOTHING_COLORS = ['russet', 'forest green', 'navy', 'ochre', 'crimson', 'slate', 'cream', 'burgundy'];
const CLOTHING_STYLES = [
  'simple tunic', 'patched work clothes', 'traveler cloak', 'fine doublet',
  'leather jerkin', 'woolen robe', 'apron over tunic', 'chain shirt', 'hooded mantle',
];

export function generateAppearance(seed: number, _gender: Gender): CharacterAppearance {
  return {
    hairColor: pick(seed, 31, HAIR_COLORS),
    hairStyle: pick(seed, 32, HAIR_STYLES),
    skinTone: pick(seed, 33, SKIN_TONES),
    clothingColor: pick(seed, 34, CLOTHING_COLORS),
    clothingStyle: pick(seed, 35, CLOTHING_STYLES),
  };
}

// ---------------------------------------------------------------------------
// Personality
// ---------------------------------------------------------------------------

const PERSONALITY_TRAITS = [
  'brave', 'cautious', 'cheerful', 'gruff', 'curious', 'loyal',
  'ambitious', 'kind', 'stern', 'witty', 'patient', 'proud',
];

/** Pick 2-3 distinct personality traits, deterministically. */
export function generatePersonality(seed: number): string[] {
  const count = 2 + Math.floor(townsfolkHash(seed, 41) * 2); // 2 or 3
  const traits: string[] = [];
  let salt = 42;
  while (traits.length < count && salt < 100) {
    const trait = pick(seed, salt, PERSONALITY_TRAITS);
    if (!traits.includes(trait)) traits.push(trait);
    salt += 1;
  }
  return traits;
}

// ---------------------------------------------------------------------------
// Occupation-flavored notes
// ---------------------------------------------------------------------------

function inventoryNoteFor(occupation: CharacterOccupation, seed: number): string {
  switch (occupation) {
    case 'farmer': return 'Carries a scythe, seed pouch, and a heel of bread.';
    case 'merchant': case 'trader': return 'Carries a coin purse, ledger, and trade samples.';
    case 'blacksmith': return 'Carries a hammer, tongs, and a whetstone.';
    case 'guard': case 'soldier': return 'Carries a sword, shield, and standard-issue rations.';
    case 'archer': return 'Carries a bow, quiver of arrows, and a hunting knife.';
    case 'hunter': return 'Carries a bow, snares, and a skinning knife.';
    case 'noble': case 'ruler': case 'queen': return 'Carries a signet ring, fine purse, and letters of writ.';
    case 'mage': return 'Carries a staff, spellbook, and component pouch.';
    case 'innkeeper': case 'cook': return 'Carries a ring of keys, towel, and a coin pouch.';
    case 'craftworker': return 'Carries tools of the trade and raw materials.';
    case 'traveler': return 'Carries a bedroll, walking staff, and provisions.';
    case 'adventurer': return 'Carries a sword, rope, torch, and a dented helm.';
    case 'priest': return 'Carries a holy symbol, prayer book, and incense.';
    case 'scholar': return 'Carries scrolls, ink, and a magnifying lens.';
    case 'servant': return 'Carries cleaning rags, a bucket, and the household keys.';
    case 'horseRider': return 'Carries a riding crop, saddlebags, and spare horseshoes.';
    case 'caravanWorker': return 'Carries rope, canvas, and a driver\'s whip.';
    case 'miner': return 'Carries a pickaxe, lantern, and a canary cage.';
    case 'fisher': return 'Carries a net, fishing line, and a gutting knife.';
    case 'healer': return 'Carries bandages, herbs, and a mortar and pestle.';
    case 'bard': return 'Carries a lute, songbook, and a feathered cap.';
    case 'scout': return 'Carries a spyglass, short bow, and trail rations.';
    default: return 'Carries a few personal effects.';
  }
}

function scheduleNoteFor(occupation: CharacterOccupation, home: string): string {
  switch (occupation) {
    case 'farmer': return 'Up at dawn, works the fields of ' + home + ', home by dusk.';
    case 'merchant': case 'trader': return 'Minds the market stall in ' + home + ' from mid-morning to dusk.';
    case 'blacksmith': return 'Works the forge in ' + home + ' all day, hammer from sunup.';
    case 'guard': case 'soldier': return 'Rotates through gate duty and patrols around ' + home + ', rests at the barracks.';
    case 'archer': case 'scout': return 'Patrols the wilds near ' + home + ', returns at nightfall.';
    case 'hunter': return 'Leaves ' + home + ' at first light to check snares, back by evening.';
    case 'noble': return 'Holds court in ' + home + ', dines late, sleeps in.';
    case 'ruler': case 'queen': return 'Council at mid-morning, audiences after lunch, private chambers at night.';
    case 'mage': return 'Studies in the tower at ' + home + ', rarely seen before noon.';
    case 'innkeeper': return 'Opens the inn at dawn, last to sleep in ' + home + '.';
    case 'craftworker': return 'Works the workshop in ' + home + ' from morning to dusk.';
    case 'traveler': return 'Passes through ' + home + ', beds down at the inn.';
    case 'adventurer': return 'Roams far from ' + home + ', returns between expeditions.';
    case 'priest': return 'Dawn prayers at the chapel in ' + home + ', tends the flock by day.';
    case 'scholar': return 'Reads and writes in the library at ' + home + ' all hours.';
    case 'servant': return 'Serves the household in ' + home + ' from before dawn to after dark.';
    case 'horseRider': return 'Rides courier routes out of ' + home + ', home by nightfall.';
    case 'caravanWorker': return 'Travels the trade roads from ' + home + ', away for days at a time.';
    case 'miner': return 'Down the mine before dawn, surfaces at dusk in ' + home + '.';
    case 'fisher': return 'On the water at dawn, mends nets in ' + home + ' by afternoon.';
    case 'healer': return 'Tends patients in ' + home + ' from morning, on call at night.';
    case 'bard': return 'Performs at the inn in ' + home + ' each evening, sleeps late.';
    case 'cook': return 'Feeds the household in ' + home + ', market errands at midday.';
    default: return 'Keeps irregular hours in ' + home + '.';
  }
}

function wealthFor(occupation: CharacterOccupation, seed: number): number {
  const base: Record<CharacterOccupation, [number, number]> = {
    ruler: [85, 100], queen: [85, 100], noble: [70, 95],
    merchant: [55, 90], trader: [45, 80], mage: [50, 85], innkeeper: [45, 75],
    blacksmith: [35, 65], craftworker: [30, 60], scholar: [35, 60], healer: [35, 65],
    guard: [30, 55], soldier: [30, 55], archer: [30, 55], scout: [30, 55],
    hunter: [25, 50], priest: [25, 55], horseRider: [30, 55], caravanWorker: [25, 50],
    adventurer: [20, 70], bard: [20, 55], cook: [20, 45], servant: [10, 30],
    farmer: [15, 45], miner: [15, 45], fisher: [15, 45], traveler: [15, 60],
  };
  const [lo, hi] = base[occupation];
  return lo + Math.floor(townsfolkHash(seed, 51) * (hi - lo + 1));
}

function factionFor(occupation: CharacterOccupation, kingdomId: string, seed: number): string {
  const martial: CharacterOccupation[] = ['guard', 'soldier', 'archer', 'scout'];
  if (martial.includes(occupation)) return kingdomId + '-militia';
  if (occupation === 'ruler' || occupation === 'queen' || occupation === 'noble') return kingdomId + '-court';
  if (occupation === 'priest') return 'faithful';
  if (occupation === 'merchant' || occupation === 'trader' || occupation === 'caravanWorker') return 'merchant-guild';
  if (occupation === 'mage' || occupation === 'scholar') return 'arcane-circle';
  if (occupation === 'hunter' || occupation === 'miner' || occupation === 'fisher') return 'wilderness-folk';
  return pick(seed, 52, [kingdomId + '-commons', 'freefolk', kingdomId + '-commons']);
}

// ---------------------------------------------------------------------------
// Full profile generation
// ---------------------------------------------------------------------------

/** Hash a string settlement id into a stable numeric salt. */
export function settlementSalt(settlementId: string): number {
  let h = 0;
  for (let i = 0; i < settlementId.length; i += 1) {
    h = (Math.imul(h, 31) + settlementId.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Deterministic seed for one character: (worldSeed, settlementId, index).
 * Every other generator derives from this seed, so the profile is stable.
 */
export function characterSeed(worldSeed: number, settlementId: string, index: number): number {
  return (Math.imul(worldSeed >>> 0, 2654435761) ^ Math.imul(settlementSalt(settlementId), 2246822519) ^ Math.imul(index + 1, 3266489917)) >>> 0;
}

/**
 * Generate one full character profile. Occupation may be forced (e.g. the
 * town's only ruler) or drawn from the weighted, gender-open pool.
 */
export function generateCharacter(
  worldSeed: number,
  settlementId: string,
  kingdomId: string,
  index: number,
  occupation?: CharacterOccupation,
): CharacterProfile {
  const seed = characterSeed(worldSeed, settlementId, index);
  const gender: Gender = townsfolkHash(seed, 1) < 0.5 ? 'male' : 'female';
  const occ = occupation ?? generateOccupation(seed, gender);
  const age = 16 + Math.floor(townsfolkHash(seed, 2) * 60); // 16-75
  const id = `${settlementId}#${index}`;
  return {
    id,
    name: generateName(gender, seed),
    gender,
    age,
    appearance: generateAppearance(seed, gender),
    occupation: occ,
    personality: generatePersonality(seed),
    home: settlementId,
    family: { parents: [], children: [], siblings: [] },
    faction: factionFor(occ, kingdomId, seed),
    kingdomId,
    wealth: wealthFor(occ, seed),
    inventoryNote: inventoryNoteFor(occ, seed),
    scheduleNote: scheduleNoteFor(occ, settlementId),
  };
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

/**
 * Create a small household (2-5 members) with consistent mutual family links:
 * - spouse links are mutual (A.spouse = B.id AND B.spouse = A.id)
 * - every child's parents list includes both parents, and each parent lists
 *   the child in their children
 * - siblings share the same parents
 * Schedules overlap: adults reference each other's workplace in scheduleNote,
 * and children reference home.
 */
export function generateFamily(
  worldSeed: number,
  settlementId: string,
  kingdomId: string,
  familyIndex: number,
): CharacterProfile[] {
  const baseSeed = (characterSeed(worldSeed, settlementId, 100000 + familyIndex * 97)) >>> 0;
  const memberCount = 2 + Math.floor(townsfolkHash(baseSeed, 3) * 4); // 2-5
  const hasPartner = townsfolkHash(baseSeed, 4) < 0.8;
  const memberIds = Array.from({ length: memberCount }, (_, i) => `${settlementId}#fam${familyIndex}-${i}`);

  // Build a surname to share, derived from the head of household's name.
  const headGender: Gender = townsfolkHash(baseSeed, 5) < 0.5 ? 'male' : 'female';
  const surname = pick(baseSeed, 6, SURNAMES);

  const members: CharacterProfile[] = [];
  const headIndex = 0;
  const partnerIndex = hasPartner && memberCount >= 2 ? 1 : -1;
  const firstChildIndex = hasPartner ? 2 : 1;

  for (let i = 0; i < memberCount; i++) {
    const seed = (baseSeed + i * 7919) >>> 0;
    const isHead = i === headIndex;
    const isPartner = i === partnerIndex;
    const isChild = i >= firstChildIndex;
    let gender: Gender;
    if (isHead) gender = headGender;
    else if (isPartner) gender = headGender === 'male' ? 'female' : 'male';
    else gender = townsfolkHash(seed, 7) < 0.5 ? 'male' : 'female';

    let occupation: CharacterOccupation | undefined;
    let age: number;
    if (isChild) {
      age = 4 + Math.floor(townsfolkHash(seed, 8) * 13); // 4-16
      occupation = age >= 12 ? generateOccupation(seed, gender) : 'servant';
    } else {
      age = isHead
        ? 26 + Math.floor(townsfolkHash(seed, 8) * 30)
        : 24 + Math.floor(townsfolkHash(seed, 8) * 28);
    }
    if (isHead) {
      occupation = pick(seed, 9, ['farmer', 'farmer', 'blacksmith', 'merchant', 'craftworker', 'guard', 'miner', 'fisher', 'cook'] as const);
    } else if (isPartner) {
      occupation = pick(seed, 10, ['merchant', 'craftworker', 'cook', 'farmer', 'healer', 'servant', 'innkeeper', 'trader'] as const);
    }

    const first = gender === 'male'
      ? pick(seed, 11, MALE_FIRST_NAMES)
      : pick(seed, 11, FEMALE_FIRST_NAMES);
    const profile: CharacterProfile = {
      id: memberIds[i],
      name: first + ' ' + surname,
      gender,
      age,
      appearance: generateAppearance(seed, gender),
      occupation: occupation ?? generateOccupation(seed, gender),
      personality: generatePersonality(seed),
      home: settlementId,
      family: { parents: [], children: [], siblings: [] },
      faction: 'freefolk',
      kingdomId,
      wealth: wealthFor(occupation ?? 'farmer', seed),
      inventoryNote: inventoryNoteFor(occupation ?? 'farmer', seed),
      scheduleNote: scheduleNoteFor(occupation ?? 'farmer', settlementId),
    };
    profile.faction = factionFor(profile.occupation, kingdomId, seed);
    members.push(profile);
  }

  // Wire mutual links.
  const head = members[headIndex];
  const partner = partnerIndex >= 0 ? members[partnerIndex] : null;
  if (partner) {
    head.family.spouse = partner.id;
    partner.family.spouse = head.id;
  }
  const childIds = memberIds.slice(firstChildIndex);
  if (partner) {
    head.family.children.push(...childIds);
    partner.family.children.push(...childIds);
  } else if (childIds.length > 0) {
    head.family.children.push(...childIds);
  }
  const parentIds = partner ? [head.id, partner.id] : [head.id];
  for (let i = firstChildIndex; i < memberCount; i++) {
    members[i].family.parents.push(...parentIds);
    members[i].family.siblings.push(...childIds.filter((id) => id !== members[i].id));
  }

  // Overlapping schedules: partners reference each other, children stay home.
  if (partner) {
    head.scheduleNote += ` ${partner.name.split(' ')[0]} works the market stall and is home by dusk.`;
    partner.scheduleNote += ` Shares the house with ${head.name.split(' ')[0]}, who works the fields.`;
  }
  for (let i = firstChildIndex; i < memberCount; i++) {
    members[i].scheduleNote = `Lives with ${head.name.split(' ')[0]} in ${settlementId}; ${members[i].age < 12 ? 'plays near home by day' : 'helps around the house by day'}, home at night.`;
  }
  return members;
}

// ---------------------------------------------------------------------------
// Settlement population
// ---------------------------------------------------------------------------

export type SettlementKind = 'capital' | 'city' | 'town' | 'village' | 'hamlet';

/**
 * Deterministic population roster for a settlement: a few families plus
 * individuals, with occupation mixes appropriate to settlement kind.
 * Same (worldSeed, settlementId, index) always yields the same profile —
 * the roster is stable across loads without any saved state.
 */
export function generateSettlementPopulation(
  worldSeed: number,
  settlementId: string,
  kingdomId: string,
  count: number,
  kind: SettlementKind = 'town',
): CharacterProfile[] {
  const roster: CharacterProfile[] = [];
  const usedIds = new Set<string>();

  // Capital/city gets a ruler; town gets a mayor; everyone gets guards.
  const leaders: { occupation: CharacterOccupation; count: number }[] = [];
  if (kind === 'capital') leaders.push({ occupation: 'ruler', count: 1 }, { occupation: 'queen', count: 1 });
  else if (kind === 'city') leaders.push({ occupation: 'noble', count: 2 });
  else if (kind === 'town') leaders.push({ occupation: 'noble', count: 1 });
  else if (kind === 'village') leaders.push({ occupation: 'farmer', count: 1 }); // village elder as lead farmer

  const guardCount = kind === 'capital' ? 6 : kind === 'city' ? 4 : kind === 'town' ? 2 : kind === 'village' ? 1 : 0;
  leaders.push({ occupation: 'guard', count: guardCount });

  let index = 0;
  for (const leader of leaders) {
    for (let n = 0; n < leader.count && roster.length < count; n++) {
      const profile = generateCharacter(worldSeed, settlementId, kingdomId, index, leader.occupation);
      // The queen title is gendered by design: if the draw came out male, call him a ruler.
      if (profile.occupation === 'queen' && profile.gender === 'male') {
        profile.occupation = 'ruler';
        profile.wealth = wealthFor('ruler', characterSeed(worldSeed, settlementId, index));
      }
      usedIds.add(profile.id);
      roster.push(profile);
      index += 1;
    }
  }

  // Families (each family contributes 2-5 members).
  const familyCount = kind === 'capital' || kind === 'city' ? 3 : kind === 'town' ? 2 : 1;
  for (let f = 0; f < familyCount && roster.length < count; f++) {
    const family = generateFamily(worldSeed, settlementId, kingdomId, f);
    for (const member of family) {
      if (roster.length >= count) break;
      if (!usedIds.has(member.id)) {
        usedIds.add(member.id);
        roster.push(member);
      }
    }
  }

  // Remaining individuals, any occupation.
  while (roster.length < count) {
    const profile = generateCharacter(worldSeed, settlementId, kingdomId, index);
    index += 1;
    if (!usedIds.has(profile.id)) {
      usedIds.add(profile.id);
      roster.push(profile);
    }
  }

  return roster;
}
