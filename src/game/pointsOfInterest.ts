// Wilderness points of interest: ruins, cemeteries, caves, treasure and discovery.
//
// Design notes:
// - Everything is deterministic: POIs are a pure function of (chunk, worldSeed).
//   Nothing is stored in the save except discovery state (which POI ids the
//   player has discovered). Re-entering a chunk regenerates the identical POIs.
// - Never Math.random — only townsfolkHash (per-chunk deterministic hash) and
//   SeededRng (serializable seeded generator), matching townsfolk.ts /
//   worldCore.ts conventions.
// - Positions are true field coordinates (0..140), the same system the player,
//   houses, doorways, collision and townsfolk schedules use.
// - Monster ecology is data: monstersForPoiKind maps a POI kind to the monster
//   kinds that inhabit it (goblins -> caves/ruins, skeletons -> crypts/
//   cemeteries, etc.). Spawn logic consumes this instead of hardcoding.
import { townsfolkHash } from './townsfolk';
import { SeededRng, DEFAULT_WORLD_SEED } from './worldCore';

export type PoiKind =
  | 'ruin'
  | 'cemetery'
  | 'cave'
  | 'shrine'
  | 'bandit_camp'
  | 'battlefield'
  | 'buried_treasure'
  | 'watchtower'
  | 'crypt'
  | 'mine'
  | 'waterfall'
  | 'ancient_tree'
  | 'forgotten_grave'
  | 'hidden_valley';

export type LootTier = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'unique';

export type PoiChunk = { x: number; y: number };
/** True field coordinates (0..140), same system as the player and houses. */
export type PoiPosition = { x: number; y: number };

export type PoiHistory = {
  builtYear: number;
  abandonedYear: number;
  reason: string;
  /** Current condition, e.g. 'Overgrown'. */
  state: string;
  /** Who (or what) lives there now. */
  inhabitants: string;
  /** What the player can discover there. */
  discovery: string;
};

export type PointOfInterest = {
  id: string;
  kind: PoiKind;
  name: string;
  chunk: PoiChunk;
  position: PoiPosition;
  discovered: boolean;
  history?: PoiHistory;
  danger: 0 | 1 | 2 | 3;
  lootTier: LootTier;
  /** Environmental storytelling shown when the player inspects the POI. */
  description: string;
};

export type CaveSize = 'small' | 'medium' | 'large' | 'huge';

export type CavePoi = PointOfInterest & {
  kind: 'cave';
  size: CaveSize;
  chambers: number;
  /** Contextual contents: monsters, minerals, water, bones, treasure, ... */
  contents: string[];
};

export type Grave = {
  name: string;
  bornYear: number;
  diedYear: number;
  epitaph: string;
};

export type CemeterySize = 'large' | 'small' | 'graveyard';

export type CemeteryDetails = {
  size: CemeterySize;
  graves: Grave[];
  /** graves, tombstones, paths, fences, trees, shrines, crypt entrances... */
  features: string[];
  /** Hidden entrance to something underneath (city cemeteries only). */
  hiddenEntrance: boolean;
  /** Chance the restless dead stir when the player lingers. */
  undeadEncounter: boolean;
};

export type CemeteryPoi = PointOfInterest & {
  kind: 'cemetery';
  cemetery: CemeteryDetails;
};

export type DiscoveryRecord = {
  name: string;
  kind: PoiKind;
  chunk: PoiChunk;
  position: PoiPosition;
  discoveredAt: { day: number; hour: number };
};

/** Pseudo-terrain derived from the chunk hash. Weights POI kind selection. */
type PoiTerrain = 'forest' | 'mountain' | 'coast' | 'meadow' | 'rocky';

function terrainForChunk(chunk: PoiChunk, seed: number): PoiTerrain {
  const h = townsfolkHash(chunkSeedNumber(chunk.x, chunk.y, seed), 501);
  if (h < 0.3) return 'forest';
  if (h < 0.45) return 'mountain';
  if (h < 0.58) return 'coast';
  if (h < 0.82) return 'meadow';
  return 'rocky';
}

function chunkSeedNumber(x: number, y: number, seed: number): number {
  return (Math.abs(Math.round(x) * 73856093 ^ Math.round(y) * 19349663 ^ Math.imul(seed | 0, 83492791))) >>> 0;
}

const KINDS_BY_TERRAIN: Record<PoiTerrain, PoiKind[]> = {
  forest: ['ruin', 'shrine', 'buried_treasure', 'bandit_camp', 'ancient_tree', 'hidden_valley', 'cave'],
  mountain: ['cave', 'mine', 'watchtower', 'ruin', 'ancient_tree'],
  coast: ['ruin', 'buried_treasure', 'waterfall', 'battlefield', 'watchtower'],
  meadow: ['battlefield', 'forgotten_grave', 'crypt', 'cemetery', 'buried_treasure', 'ruin', 'bandit_camp'],
  rocky: ['mine', 'cave', 'watchtower', 'battlefield', 'ruin'],
};

const POI_DISPLAY_NAME: Record<PoiKind, string> = {
  ruin: 'Abandoned Ruins',
  cemetery: 'Old Cemetery',
  cave: 'Dark Cave',
  shrine: 'Forgotten Shrine',
  bandit_camp: 'Bandit Camp',
  battlefield: 'Old Battlefield',
  buried_treasure: 'Buried Cache',
  watchtower: 'Abandoned Watchtower',
  crypt: 'Ancient Crypt',
  mine: 'Forgotten Mine',
  waterfall: 'Hidden Waterfall',
  ancient_tree: 'Ancient Oak',
  forgotten_grave: 'Forgotten Grave',
  hidden_valley: 'Hidden Valley',
};

const BASE_DANGER: Record<PoiKind, 0 | 1 | 2 | 3> = {
  ruin: 1,
  cemetery: 1,
  cave: 1,
  shrine: 0,
  bandit_camp: 2,
  battlefield: 1,
  buried_treasure: 1,
  watchtower: 1,
  crypt: 2,
  mine: 1,
  waterfall: 0,
  ancient_tree: 0,
  forgotten_grave: 0,
  hidden_valley: 0,
};

const BASE_LOOT_TIER: Record<PoiKind, LootTier> = {
  ruin: 'uncommon',
  cemetery: 'uncommon',
  cave: 'rare',
  shrine: 'common',
  bandit_camp: 'uncommon',
  battlefield: 'uncommon',
  buried_treasure: 'rare',
  watchtower: 'uncommon',
  crypt: 'rare',
  mine: 'uncommon',
  waterfall: 'common',
  ancient_tree: 'common',
  forgotten_grave: 'common',
  hidden_valley: 'common',
};

/** Monster ecology: which monster kinds inhabit which POI kinds. */
export const MONSTERS_FOR_POI_KIND: Record<PoiKind, string[]> = {
  ruin: ['goblin', 'spider', 'skeleton'],
  cemetery: ['skeleton'],
  cave: ['goblin', 'spider', 'bat'],
  shrine: [],
  bandit_camp: ['bandit', 'wolf'],
  battlefield: ['skeleton'],
  buried_treasure: [],
  watchtower: ['bandit', 'goblin'],
  crypt: ['skeleton'],
  mine: ['goblin', 'spider', 'rat'],
  waterfall: [],
  ancient_tree: ['wolf', 'spider'],
  forgotten_grave: ['skeleton', 'rat'],
  hidden_valley: ['wolf', 'slime'],
};

/** Monster kinds that haunt a POI kind. Used by spawn logic. */
export function monstersForPoiKind(kind: PoiKind): string[] {
  return [...(MONSTERS_FOR_POI_KIND[kind] ?? [])];
}

/** Base danger (0-3) for a POI kind. Individual POIs may roll higher. */
export function dangerForPoi(kind: PoiKind): 0 | 1 | 2 | 3 {
  return BASE_DANGER[kind];
}

function clampDanger(value: number): 0 | 1 | 2 | 3 {
  return Math.max(0, Math.min(3, Math.round(value))) as 0 | 1 | 2 | 3;
}

function bumpTier(tier: LootTier, steps: number): LootTier {
  const order: LootTier[] = ['common', 'uncommon', 'rare', 'very_rare', 'unique'];
  const index = Math.max(0, Math.min(order.length - 1, order.indexOf(tier) + steps));
  return order[index];
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const RUIN_PREFIXES = ['Old', 'Fallen', 'Broken', 'Sunken', 'Forgotten', 'Weathered'];
const RUIN_NOUNS = ['Hallow', 'Manor', 'Chapel', 'Mill', 'Homestead', 'Keep', 'Tower', 'Cottage', 'Granary', 'Forge'];
const CAVE_NAMES = ['Grimjaw Cavern', 'Whisperdeep', 'The Hollow Dark', 'Mossmouth Cave', 'Blackroot Hollow', 'Echoing Depths'];
const SHRINE_NAMES = ['Shrine of the Pale Moon', 'Shrine of Still Water', 'Moss-Covered Altar', 'The Weeping Saint', 'Altar of Roots'];
const CAMP_NAMES = ['Redbrand Camp', 'The Cutpurse Hollow', 'Jackal\'s Rest', 'Thornbriar Camp', 'The Starved Fox Den'];
const FIELD_NAMES = ['Emberfield', 'The Weeping Acres', 'Crowsrest Field', 'Barrowmere', 'The Scarred Meadow'];
const TOWER_NAMES = ['Greywatch Tower', 'The Sentinel\'s Folly', 'Rookspire', 'Hollow Crown Tower', 'Duskmere Watch'];
const CRYPT_NAMES = ['Crypt of the Nameless King', 'The Sunken Sepulchre', 'Barrow of Aldric the Bold', 'The Quiet Vaults', 'Tomb of the Nine'];
const MINE_NAMES = ['Duskmere Diggings', 'The Blackvein Mine', 'Old Copper Hollow', 'The Drowned Shaft', 'Rustwater Mine'];
const TREE_NAMES = ['The Grandfather Oak', 'Yggdrasil\'s Sapling', 'The Hanging Tree', 'Thornfather', 'The Whispering Oak'];
const VALLEY_NAMES = ['The Shrouded Vale', 'Mossdeep Vale', 'The Quiet Hollow', 'Fernwhisper Vale'];
const WATERFALL_NAMES = ['Veilfall', 'The Silver Stair', 'Mourning Falls', 'Feylight Cascade'];
const GRAVE_NAMES = ['Here lies a traveler, name worn away by rain', 'A child\'s grave, ringed with white stones', 'An unmarked mound, fresher than the rest'];

function pick<T>(rng: SeededRng, list: T[]): T {
  return list[Math.floor(rng.nextFloat() * list.length)];
}

function poiNameFor(kind: PoiKind, rng: SeededRng): string {
  switch (kind) {
    case 'ruin': return pick(rng, RUIN_PREFIXES) + ' ' + pick(rng, RUIN_NOUNS);
    case 'cemetery': return pick(rng, ['Greyhollow', 'Barrowmere', 'Stillwater', 'Ravensrest', 'Mossgrave']) + ' Cemetery';
    case 'cave': return pick(rng, CAVE_NAMES);
    case 'shrine': return pick(rng, SHRINE_NAMES);
    case 'bandit_camp': return pick(rng, CAMP_NAMES);
    case 'battlefield': return pick(rng, FIELD_NAMES);
    case 'buried_treasure': return 'Buried Cache';
    case 'watchtower': return pick(rng, TOWER_NAMES);
    case 'crypt': return pick(rng, CRYPT_NAMES);
    case 'mine': return pick(rng, MINE_NAMES);
    case 'waterfall': return pick(rng, WATERFALL_NAMES);
    case 'ancient_tree': return pick(rng, TREE_NAMES);
    case 'forgotten_grave': return pick(rng, GRAVE_NAMES);
    case 'hidden_valley': return pick(rng, VALLEY_NAMES);
  }
}

// ---------------------------------------------------------------------------
// History generation
// ---------------------------------------------------------------------------

const RUIN_REASONS = [
  'Border conflict',
  'Plague',
  'Famine',
  'Mine collapse',
  'War of the Ember Crown',
  'Bandit raid',
  'Flood',
  'Dragon sighting',
  'Lost trade route',
  'Economic collapse',
];
const RUIN_STATES = ['Overgrown', 'Collapsed', 'Partially standing', 'Buried', 'Flooded', 'Intact but empty'];
const RUIN_INHABITANTS = [
  'Bandits',
  'Goblins',
  'Bats and rats',
  'None — too quiet',
  'Restless dead',
  'A hermit who does not speak',
  'Spiders',
];
const RUIN_DISCOVERIES = [
  'Old military chest',
  'Buried coin cache',
  'Forgotten war banner',
  'Sealed orders, never delivered',
  'Ancient map',
  'A soldier\'s letters home',
];

const HISTORY_KINDS: PoiKind[] = ['ruin', 'watchtower', 'crypt', 'mine', 'battlefield', 'bandit_camp'];

function historyFor(kind: PoiKind, rng: SeededRng): PoiHistory | undefined {
  if (!HISTORY_KINDS.includes(kind)) return undefined;
  const builtYear = 3 + Math.floor(rng.nextFloat() * 220);
  const abandonedYear = builtYear + 8 + Math.floor(rng.nextFloat() * 160);
  return {
    builtYear,
    abandonedYear,
    reason: pick(rng, RUIN_REASONS),
    state: pick(rng, RUIN_STATES),
    inhabitants: pick(rng, RUIN_INHABITANTS),
    discovery: pick(rng, RUIN_DISCOVERIES),
  };
}

function descriptionFor(poi: PointOfInterest): string {
  const h = poi.history;
  const historyLine = h
    ? ` Built in Year ${h.builtYear}, abandoned in Year ${h.abandonedYear} after ${h.reason.toLowerCase()}. Now ${h.state.toLowerCase()}.`
    : '';
  switch (poi.kind) {
    case 'ruin':
      return `Broken walls and a collapsed roof, reclaimed by moss and ivy.${historyLine} ${h ? `Those who shelter here now: ${h.inhabitants.toLowerCase()}.` : ''}`.trim();
    case 'cemetery':
      return `Rows of weathered tombstones lean in the long grass. Some names are still legible — people who lived and died here long before you arrived.`;
    case 'cave':
      return `A dark mouth in the rock exhales cold air. Deeper in, water drips somewhere unseen.`;
    case 'shrine':
      return `A small altar, half-swallowed by roots. Someone still leaves offerings here.`;
    case 'bandit_camp':
      return `A rough camp: cold fire pit, bedrolls, crates of stolen goods. They could return at any moment.`;
    case 'battlefield':
      return `The grass grows strangely green here. Rusted blades and broken shields surface from the soil after every rain.${historyLine}`.trim();
    case 'buried_treasure':
      return `Disturbed earth and a faint glint beneath the roots. Someone buried something here and never came back.`;
    case 'watchtower':
      return `A stone tower, its upper floors open to the sky. From the top you can see for miles.${historyLine}`.trim();
    case 'crypt':
      return `Stone doors, sealed and unsealed a hundred times. The dead below do not rest easy.${historyLine}`.trim();
    case 'mine':
      return `A boarded shaft and rusted rails leading into the dark. The timbers groan in the wind.${historyLine}`.trim();
    case 'waterfall':
      return `Water spills over mossy rock into a clear pool. The air smells of rain and stone.`;
    case 'ancient_tree':
      return `An oak older than any kingdom. Its roots have swallowed fences, walls, and — some say — secrets.`;
    case 'forgotten_grave':
      return `A lone grave, far from any road. Whoever lies here was buried in a hurry, or in secret.`;
    case 'hidden_valley':
      return `A sheltered valley the maps forgot. Game trails cross meadows no hunter claims.`;
  }
}

// ---------------------------------------------------------------------------
// POI scattering
// ---------------------------------------------------------------------------

/**
 * Deterministic POIs for a chunk: pure function of (chunk, worldSeed).
 * Wilderness chunks scatter 0-3 POIs. Town chunks never get wilderness POIs.
 */
export function poisForChunk(
  chunk: PoiChunk,
  worldSeed: number,
  opts?: { isTownChunk?: boolean },
): PointOfInterest[] {
  if (opts?.isTownChunk) return [];
  const seedNum = chunkSeedNumber(chunk.x, chunk.y, worldSeed);
  const rng = new SeededRng(seedNum ^ 0x9e3779b9);
  const countRoll = rng.nextFloat();
  const count = countRoll < 0.28 ? 0 : countRoll < 0.55 ? 1 : countRoll < 0.83 ? 2 : 3;
  if (count === 0) return [];

  const terrain = terrainForChunk(chunk, worldSeed);
  const candidates = KINDS_BY_TERRAIN[terrain];
  const usedKinds = new Set<PoiKind>();
  const pois: PointOfInterest[] = [];

  for (let i = 0; i < count; i++) {
    // Avoid two identical kinds in one chunk for variety.
    let kind = pick(rng, candidates);
    let guard = 0;
    while (usedKinds.has(kind) && guard++ < 8) kind = pick(rng, candidates);
    usedKinds.add(kind);

    const position: PoiPosition = {
      x: 8 + rng.nextFloat() * 124,
      y: 8 + rng.nextFloat() * 124,
    };
    const base: PointOfInterest = {
      id: `poi-${chunk.x},${chunk.y}-${kind}-${i}`,
      kind,
      name: poiNameFor(kind, rng),
      chunk: { x: chunk.x, y: chunk.y },
      position,
      discovered: false,
      history: historyFor(kind, rng),
      danger: clampDanger(BASE_DANGER[kind] + (rng.nextFloat() < 0.22 ? 1 : 0)),
      lootTier: rng.nextFloat() < 0.18 ? bumpTier(BASE_LOOT_TIER[kind], 1) : BASE_LOOT_TIER[kind],
      description: '',
    };
    if (kind === 'cave') {
      const cave = base as CavePoi;
      const sizeRoll = rng.nextFloat();
      cave.size = sizeRoll < 0.4 ? 'small' : sizeRoll < 0.7 ? 'medium' : sizeRoll < 0.9 ? 'large' : 'huge';
      cave.chambers = cave.size === 'small' ? 1 : cave.size === 'medium' ? 2 + Math.floor(rng.nextFloat() * 2) : cave.size === 'large' ? 4 + Math.floor(rng.nextFloat() * 3) : 7 + Math.floor(rng.nextFloat() * 4);
      cave.contents = caveContents(cave.size, rng);
      if (cave.size === 'huge') cave.lootTier = bumpTier(cave.lootTier, 1);
      cave.danger = clampDanger(cave.danger + (cave.size === 'large' || cave.size === 'huge' ? 1 : 0));
    }
    if (kind === 'cemetery') {
      const small = cemeteryForSettlement(base.name.replace(' Cemetery', ''), 'village', { chunk: base.chunk, position: base.position }, rng);
      (base as CemeteryPoi).cemetery = small.cemetery;
      base.danger = clampDanger(1 + (rng.nextFloat() < 0.3 ? 1 : 0));
    }
    base.description = descriptionFor(base);
    pois.push(base);
  }
  return pois;
}

const CAVE_CONTENTS: Record<CaveSize, string[]> = {
  small: ['Bones', 'Bats', 'A trickle of water'],
  medium: ['Goblins', 'Copper ore', 'Underground stream', 'Old bones', 'Miner\'s abandoned supplies'],
  large: ['Goblins', 'Giant spiders', 'Iron ore', 'Underground lake', 'Hidden passages', 'Abandoned miner\'s chest', 'Ancient bones'],
  huge: ['Goblins', 'Giant spiders', 'Troll den', 'Silver ore', 'Underground ruins', 'Hidden passages', 'Sealed vault', 'Rare crystals', 'Ancient structures'],
};

/** Contents scale with cave size; small caves stay simple, huge caves get dungeons. */
function caveContents(size: CaveSize, rng: SeededRng): string[] {
  const pool = CAVE_CONTENTS[size];
  const keep = size === 'small' ? pool.length : 3 + Math.floor(rng.nextFloat() * (pool.length - 2));
  const chosen = new Set<number>();
  while (chosen.size < Math.min(keep, pool.length)) chosen.add(Math.floor(rng.nextFloat() * pool.length));
  return [...chosen].map((i) => pool[i]);
}

// ---------------------------------------------------------------------------
// Cemeteries
// ---------------------------------------------------------------------------

const GRAVE_FIRST = ['Aldric', 'Brenna', 'Cedric', 'Elsa', 'Dunstan', 'Mira', 'Rowan', 'Kess', 'Tom', 'Mabel', 'Wren', 'Pip', 'Hilda', 'Osric', 'Fenna', 'Garrick', 'Liora', 'Tam', 'Sella', 'Bram'];
const GRAVE_LAST = ['Stonehand', 'Miller', 'Thorn', 'Ashdown', 'Blackwood', 'Fairwind', 'Grimshaw', 'Holloway', 'Longfellow', 'Marsh', 'Oakenshield', 'Rivers', 'Storm', 'Underbough', 'Vell', 'Wyrd'];
const EPITAPHS = [
  'Beloved parent, missed daily.',
  'Taken by the winter fever.',
  'Fell defending the bridge.',
  'A kind soul, a full table.',
  'Gone to the quiet fields.',
  'Sailed out and never returned.',
  'Lived 90 years and complained about all of them.',
  'The best bread in the county.',
  'Died as they lived: stubborn.',
  'Here rests a friend to all dogs.',
];

function makeGraves(rng: SeededRng, count: number): Grave[] {
  const graves: Grave[] = [];
  for (let i = 0; i < count; i++) {
    const diedYear = 180 + Math.floor(rng.nextFloat() * 60);
    const livedYears = 4 + Math.floor(rng.nextFloat() * 82);
    graves.push({
      name: pick(rng, GRAVE_FIRST) + ' ' + pick(rng, GRAVE_LAST),
      bornYear: diedYear - livedYears,
      diedYear,
      epitaph: pick(rng, EPITAPHS),
    });
  }
  return graves;
}

/**
 * Cemetery sized to its settlement: cities get large cemeteries (crypt
 * entrances, possible hidden entrance, undead encounters), towns get small
 * ones, villages get small graveyards. Graves name people who once existed.
 */
export function cemeteryForSettlement(
  settlementName: string,
  settlementKind: 'city' | 'town' | 'village',
  anchor?: { chunk: PoiChunk; position: PoiPosition },
  rng?: SeededRng,
): CemeteryPoi {
  const seedNum = chunkSeedNumber(settlementName.length * 31 + settlementName.charCodeAt(0), settlementName.charCodeAt(settlementName.length - 1), DEFAULT_WORLD_SEED);
  const generator = rng ?? new SeededRng(seedNum ^ 0x51ed270b);
  const size: CemeterySize = settlementKind === 'city' ? 'large' : settlementKind === 'town' ? 'small' : 'graveyard';
  const graveCount = size === 'large'
    ? 24 + Math.floor(generator.nextFloat() * 17)
    : size === 'small'
      ? 10 + Math.floor(generator.nextFloat() * 7)
      : 4 + Math.floor(generator.nextFloat() * 5);
  const features = ['Graves', 'Tombstones', 'Paths', 'Fences', 'Trees'];
  if (size === 'large') features.push('Shrines', 'Crypt entrances', 'Stone chapel');
  if (size === 'small') features.push('A small shrine');
  const hiddenEntrance = size === 'large' && generator.nextFloat() < 0.5;
  const undeadEncounter = generator.nextFloat() < (size === 'large' ? 0.6 : size === 'small' ? 0.3 : 0.15);
  const poi: CemeteryPoi = {
    id: `cemetery-${settlementName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    kind: 'cemetery',
    name: settlementName + ' Cemetery',
    chunk: anchor?.chunk ?? { x: 4, y: 7 },
    position: anchor?.position ?? { x: 118, y: 28 },
    discovered: false,
    danger: size === 'large' ? 2 : 1,
    lootTier: size === 'large' ? 'rare' : 'uncommon',
    description: size === 'large'
      ? 'A walled city of the dead: rows of tombstones, family crypts, and a stone chapel. Some crypt doors hang open.'
      : size === 'small'
        ? 'A quiet town cemetery behind a low fence. The names are all local families.'
        : 'A handful of graves at the edge of the village. Fresh flowers on some — someone still remembers.',
    cemetery: {
      size,
      graves: makeGraves(generator, graveCount),
      features,
      hiddenEntrance,
      undeadEncounter,
    },
  };
  return poi;
}

// ---------------------------------------------------------------------------
// Treasure
// ---------------------------------------------------------------------------

export type TreasureKind =
  | 'gold'
  | 'weapons'
  | 'armor'
  | 'potions'
  | 'materials'
  | 'jewelry'
  | 'maps'
  | 'keys'
  | 'quest_items'
  | 'artifacts'
  | 'rare_equipment'
  | 'lore';

export type Treasure = {
  id: string;
  poiId?: string;
  kind: TreasureKind;
  tier: LootTier;
  items: string[];
  goldAmount: number;
  contextualNote: string;
};

/**
 * Contextual treasure for a POI. Placement respects the location:
 * a ruined house holds an old chest, a bandit camp holds stolen goods,
 * a cave holds a miner's abandoned supplies, an ancient crypt holds burial
 * treasure, an old battlefield holds lost weapons, a castle ruin holds a
 * royal treasury. Never dragon-level loot in a farmer's house.
 */
export function treasureForPoi(poi: PointOfInterest, worldSeed: number = DEFAULT_WORLD_SEED): Treasure[] {
  const rng = new SeededRng(chunkSeedNumber(poi.chunk.x, poi.chunk.y, worldSeed) ^ 0x2b7e1516 ^ poi.id.length * 97);
  const lower = poi.name.toLowerCase();
  const isCastleRuin = poi.kind === 'ruin' && /keep|castle|tower|manor/.test(lower);
  const base = (kind: TreasureKind, items: string[], gold: [number, number], note: string): Treasure => ({
    id: `${poi.id}-treasure`,
    poiId: poi.id,
    kind,
    tier: poi.lootTier,
    items,
    goldAmount: gold[0] + Math.floor(rng.nextFloat() * (gold[1] - gold[0] + 1)),
    contextualNote: note,
  });

  if (isCastleRuin) {
    return [base('gold', ['Royal signet ring', 'Jeweled goblet', 'Ancient crown fragment', 'Sealed royal decrees'], [200, 600], 'Royal treasury — the last of a fallen house\'s wealth, hidden when the walls fell.')];
  }
  switch (poi.kind) {
    case 'ruin':
      return [base('materials', ['Old chest', 'Tarnished brooch', 'Clay pots', 'A soldier\'s letters home'], [15, 80], 'Old chest in a collapsed house — what the family could not carry.')];
    case 'bandit_camp':
      return [base('weapons', ['Stolen silk bolts', 'Merchant\'s strongbox', 'Confiscated daggers', 'A branded horse blanket'], [60, 220], 'Stolen goods — taken from merchants on the road and never fenced.')];
    case 'cave':
      return [base('materials', ['Miner\'s abandoned supplies', 'Copper ore', 'Lantern (still oiled)', 'Pickaxe'], [10, 50], 'A miner\'s abandoned supplies, left when the digging stopped.')];
    case 'crypt':
      return [base('artifacts', ['Ancient bronze sword', 'Burial gold', 'Carved funerary mask', 'Stone tablet'], [150, 500], 'Burial treasure — grave goods of the honored dead. The dead may object.')];
    case 'battlefield':
      return [base('weapons', ['Rusted swords', 'Broken shields', 'Arrowheads', 'A dented helm'], [5, 40], 'Lost weapons of the fallen, surfacing from the soil.')];
    case 'buried_treasure':
      return [base('jewelry', ['Buried coin cache', 'Silver necklace', 'Jeweled dagger'], [120, 400], 'Buried treasure — someone\'s life savings, never reclaimed.')];
    case 'mine':
      return [base('materials', ['Forgotten ore vein', 'Uncut gems', 'Miner\'s pay chest'], [80, 260], 'A forgotten pay chest and the richest remaining vein.')];
    case 'watchtower':
      return [base('weapons', ['Old military chest', 'Signal horn', 'Standard-issue spear', 'Sealed orders'], [40, 140], 'Old military chest — the garrison\'s payroll and arms.')];
    case 'cemetery':
      return [base('jewelry', ['Grave offerings', 'Silver locket', 'Carved bone amulet'], [10, 60], 'Grave offerings. Taking them is noticed.')];
    case 'forgotten_grave':
      return [base('materials', ['A traveler\'s pack', 'Worn boots', 'A few coins'], [5, 25], 'What a hurried burial left behind.')];
    case 'shrine':
      return [base('potions', ['Offerings: dried herbs', 'Blessed water', 'A pilgrim\'s token'], [0, 10], 'Offerings left by the faithful — take only if you leave something.')];
    default:
      return [base('materials', ['Traveler\'s cache', 'Dried rations', 'A spare cloak'], [5, 30], 'A small cache, left for whoever needs it.')];
  }
}

export type LootContext =
  | 'farmer'
  | 'merchant'
  | 'guard'
  | 'bandit'
  | 'crypt'
  | 'dragon_lair'
  | 'settlement'
  | 'wilderness';

/**
 * Context-respecting loot. A farmer drops food, tools and small money —
 * never unique-tier treasure. A dragon lair drops extremely rare treasure.
 * Deterministic per (context, seedInput): no Math.random.
 */
export function lootForContext(
  context: LootContext,
  seedInput: number,
  worldSeed: number = DEFAULT_WORLD_SEED,
): { items: string[]; goldAmount: number; tier: LootTier } {
  const h = (salt: number) => townsfolkHash((seedInput | 0) ^ (worldSeed | 0), salt);
  const pickFrom = <T,>(list: T[], salt: number): T => list[Math.floor(h(salt) * list.length)];
  const range = (min: number, max: number, salt: number): number => min + Math.floor(h(salt) * (max - min + 1));

  switch (context) {
    case 'farmer':
      return {
        items: [pickFrom(['Sack of grain', 'Basket of apples', 'Bundle of carrots'], 11), pickFrom(['Worn hoe', 'Wooden rake', 'Shears'], 12)],
        goldAmount: range(2, 12, 13),
        tier: 'common',
      };
    case 'merchant':
      return {
        items: [pickFrom(['Bolt of wool', 'Crate of spices', 'Barrel of salt fish'], 21), pickFrom(['Ledger book', 'Brass scales', 'Coin purse'], 22)],
        goldAmount: range(20, 90, 23),
        tier: h(24) < 0.3 ? 'uncommon' : 'common',
      };
    case 'guard':
      return {
        items: [pickFrom(['Iron shortsword', 'Spear', 'Crossbow bolts'], 31), pickFrom(['Leather cuirass', 'Iron helm', 'Shield'], 32)],
        goldAmount: range(5, 25, 33),
        tier: h(34) < 0.25 ? 'uncommon' : 'common',
      };
    case 'bandit':
      return {
        items: [pickFrom(['Stolen silk', 'Pilfered jewelry', 'Confiscated wine'], 41), pickFrom(['Notched dagger', 'Short bow', 'Studded leather'], 42)],
        goldAmount: range(15, 70, 43),
        tier: h(44) < 0.35 ? 'rare' : 'uncommon',
      };
    case 'crypt':
      return {
        items: [pickFrom(['Ancient bronze sword', 'Ceremonial dagger', 'Funerary mask'], 51), pickFrom(['Burial gold', 'Stone tablet', 'Carved amulet'], 52)],
        goldAmount: range(80, 300, 53),
        tier: h(54) < 0.35 ? 'very_rare' : 'rare',
      };
    case 'dragon_lair':
      return {
        items: [pickFrom(['Dragonscale armor', 'Ancient greatsword', 'Crown of embers'], 61), pickFrom(['Hoard gems', 'Dragon egg shell', 'Runed artifact'], 62)],
        goldAmount: range(800, 2500, 63),
        tier: h(64) < 0.3 ? 'unique' : 'very_rare',
      };
    case 'settlement':
      return {
        items: [pickFrom(['Bread', 'Ale', 'Cloth scraps'], 71)],
        goldAmount: range(3, 20, 72),
        tier: 'common',
      };
    case 'wilderness':
    default:
      return {
        items: [pickFrom(['Dried meat', 'Flint', 'Rope'], 81)],
        goldAmount: range(1, 10, 82),
        tier: 'common',
      };
  }
}

// ---------------------------------------------------------------------------
// Treasure maps
// ---------------------------------------------------------------------------

export type TreasureMap = {
  id: string;
  name: string;
  clues: string[];
  targetPoiId: string;
};

const MAP_LANDMARKS = [
  'a ruined tower',
  'a river bend',
  'an ancient oak',
  'a waterfall',
  'a circle of standing stones',
  'a broken bridge',
  'a lightning-split pine',
  'twin boulders',
  'a dry well',
  'a hunter\'s cairn',
];
const MAP_DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/**
 * Generates a treasure map whose clues describe the target's surroundings —
 * landmarks, direction, distance — so the player finds the treasure by
 * exploration. No quest marker: the clues are the guide.
 */
export function mapToTreasure(poi: PointOfInterest, worldSeed: number = DEFAULT_WORLD_SEED): TreasureMap {
  const rng = new SeededRng(chunkSeedNumber(poi.chunk.x, poi.chunk.y, worldSeed) ^ 0x6c078965);
  const landmark = pick(rng, MAP_LANDMARKS);
  const second = pick(rng, MAP_LANDMARKS.filter((l) => l !== landmark));
  const direction = pick(rng, MAP_DIRECTIONS);
  const paces = 40 + Math.floor(rng.nextFloat() * 160);
  const display = POI_DISPLAY_NAME[poi.kind];
  return {
    id: `${poi.id}-map`,
    name: 'Old Merchant\'s Map',
    clues: [
      `Start at ${landmark}, where the road gives out.`,
      `Walk ${direction} past ${second} for ${paces} paces.`,
      `Look for ${display.toLowerCase()} — "${poi.name}" is marked by a stone no moss will grow on.`,
    ],
    targetPoiId: poi.id,
  };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** Player-facing discovery message, e.g. 'Ancient Crypt discovered.'.
 * Undiscovered POIs stay hidden from the map. */
export function discoveryMessage(poi: PointOfInterest): string {
  return `${POI_DISPLAY_NAME[poi.kind]} discovered.`;
}

/**
 * Marks a POI discovered and returns the discovery record. The record carries
 * name, coordinates, discovery time and kind — the only POI state that needs
 * saving, since POIs themselves are deterministic.
 */
export function discoverPoi(
  poi: PointOfInterest,
  clock: { day: number; hour: number },
): { poi: PointOfInterest; discovery: DiscoveryRecord } {
  const discovered: PointOfInterest = { ...poi, discovered: true };
  return {
    poi: discovered,
    discovery: {
      name: poi.name,
      kind: poi.kind,
      chunk: { ...poi.chunk },
      position: { ...poi.position },
      discoveredAt: { day: Math.max(1, Math.floor(clock.day)), hour: Math.max(0, Math.min(23, Math.floor(clock.hour))) },
    },
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const DISCOVERY_SCHEMA = 1;

export type DiscoverySave = {
  schema: number;
  discoveredIds: string[];
};

/** Only discovered ids are saved — POIs regenerate deterministically on load. */
export function serializeDiscoveries(discoveredIds: string[]): string {
  return JSON.stringify({ schema: DISCOVERY_SCHEMA, discoveredIds: [...discoveredIds] } satisfies DiscoverySave);
}

export function parseDiscoveries(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as Partial<DiscoverySave>;
    if (!parsed || parsed.schema !== DISCOVERY_SCHEMA || !Array.isArray(parsed.discoveredIds)) return [];
    return parsed.discoveredIds.filter((id) => typeof id === 'string');
  } catch {
    return [];
  }
}

/** Re-applies saved discovery state onto freshly generated POIs. */
export function mergeDiscoveries(pois: PointOfInterest[], discoveredIds: string[]): PointOfInterest[] {
  const known = new Set(discoveredIds);
  return pois.map((poi) => (known.has(poi.id) && !poi.discovered ? { ...poi, discovered: true } : poi));
}

/** Narrowing helper for caves (extra size/chambers/contents fields). */
export function isCavePoi(poi: PointOfInterest): poi is CavePoi {
  return poi.kind === 'cave';
}

/** Narrowing helper for cemeteries (graves/features fields). */
export function isCemeteryPoi(poi: PointOfInterest): poi is CemeteryPoi {
  return poi.kind === 'cemetery';
}
