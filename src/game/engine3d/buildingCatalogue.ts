/**
 * BUILD 1092 (0x1B, Living World plan Phase 3.1): the building
 * catalogue as DATA. The A-F catalogue from LIVING_WORLD_VISION.md
 * section 2 (the user's own list) — 93 buildings across 6 categories
 * — each with a complete definition: materials, footprint, function,
 * capacity, workers, production rate, maintenance, upgrade path, and
 * prerequisites/dependencies. DATA ONLY: this module builds nothing,
 * produces nothing, and changes no behaviour. The construction path
 * (3.2) and production functions (3.3-3.4) come in later builds.
 *
 * Two honesty rules, enforced by validateCatalogue():
 * - costStatus 'enforced' means a working system charges exactly
 *   these materials today (hut 12 wood, storehouse 12 wood + 6 stone,
 *   bridge 4 wood — cross-checked against the system constants in the
 *   sim). 'none' means the entry has no cost today (settlement-seeded,
 *   designated, or freely placed — materials is empty, not invented).
 *   'planned' means the materials are design data for a future build.
 * - prerequisites encode the plan's ordering: never a hospital before
 *   healthcare (hospital needs the apothecary), never a market before
 *   logistics (market square needs the storehouse + a transport
 *   route), never a kingdom before settlements sustain themselves
 *   (castle/keep need walls, barracks, and population).
 *
 * Pure module (no React, no WebGL, no localStorage, no runtime
 * imports — only type imports) so the sim and the standalone asserts
 * can import it directly. The Build menu renders from it via
 * catalogueMenuEntries(); entries with no construction path yet are
 * LISTED but NOT placeable (locked).
 */
import type { Resource } from '../civilization';
import type { PaletteKind } from './placements';

/** The six catalogue categories (A-F in the vision doc). */
export type CatalogueCategoryId =
  | 'settlement'
  | 'production'
  | 'food'
  | 'trade'
  | 'military'
  | 'infrastructure';

export const CATALOGUE_CATEGORIES: {
  id: CatalogueCategoryId;
  letter: string;
  label: string;
}[] = [
  { id: 'settlement', letter: 'A', label: 'Settlement and residential' },
  { id: 'production', letter: 'B', label: 'Resource and production' },
  { id: 'food', letter: 'C', label: 'Food and agriculture' },
  { id: 'trade', letter: 'D', label: 'Trade and services' },
  { id: 'military', letter: 'E', label: 'Military and defensive' },
  { id: 'infrastructure', letter: 'F', label: 'Infrastructure' },
];

/** How the materials relate to the game today. */
export type CatalogueCostStatus =
  | 'enforced' // a working system charges exactly these materials today
  | 'planned' // design data for a future build — no system charges it yet
  | 'none'; // no cost today (settlement-seeded, designated, freely placed)

/**
 * The existing system a catalogue entry describes, if any. Null
 * means no system exists yet — the entry is catalogue data only.
 * hut = founder-built huts (1058); storehouse (1087); well (1088);
 * bridge / path = the 1088 path + bridge sites; mine / quarry /
 * lumber = the 1089 designated sites; granary = the 1090 registry
 * store; farm = the planted wheat (1067/1090); mill = the 1094
 * food-chain mill (grinds grain -> flour); bakery = the 1094
 * food-chain bakery (bakes flour -> meals).
 */
export type CatalogueSystem =
  | 'hut'
  | 'storehouse'
  | 'well'
  | 'bridge'
  | 'path'
  | 'mine'
  | 'quarry'
  | 'lumber'
  | 'granary'
  | 'farm'
  | 'mill'
  | 'bakery';

export const CATALOGUE_SYSTEMS: CatalogueSystem[] = [
  'hut', 'storehouse', 'well', 'bridge', 'path',
  'mine', 'quarry', 'lumber', 'granary', 'farm',
  'mill', 'bakery',
];

/**
 * A resource kind the catalogue can name: a civilization Resource,
 * plus the registry's carried currencies (gold is not a civilization
 * Resource, but the bank genuinely needs gold to open).
 */
export type CatalogueResource = Resource | 'gold' | 'copper' | 'silver' | 'flour';

/** What an entry needs before it can exist. */
export type CataloguePrerequisite =
  | { kind: 'building'; id: string } // another catalogue entry must exist
  | { kind: 'resource'; resource: CatalogueResource } // a registry resource (tools, fuel, materials)
  | { kind: 'deposit'; resource: CatalogueResource } // a world deposit of that resource must exist
  | { kind: 'transport' } // a transport route (road/path) must connect it
  | { kind: 'settlement'; minPopulation: number }; // the settlement must sustain N residents

/** What an entry is made of. */
export type CatalogueMaterial = { resource: CatalogueResource; qty: number };

/** What an entry makes, per in-game hour (null = it produces nothing). */
export type CatalogueProduction = { resource: CatalogueResource; perHour: number } | null;

/** What an entry consumes per in-game day to keep running (null = no upkeep charged). */
export type CatalogueMaintenance = { resource: CatalogueResource; qtyPerDay: number } | null;

/** What a capacity number counts. */
export type CatalogueCapacityUnit = 'residents' | 'storage' | 'patrons' | 'animals' | 'none';

export const CATALOGUE_CAPACITY_UNITS: CatalogueCapacityUnit[] = [
  'residents', 'storage', 'patrons', 'animals', 'none',
];

/** One complete building definition. */
export type CatalogueEntry = {
  id: string;
  name: string;
  category: CatalogueCategoryId;
  /** The building's purpose in the simulation, in one or two sentences. */
  blurb: string;
  materials: CatalogueMaterial[];
  costStatus: CatalogueCostStatus;
  /** Footprint in tiles (w x h). */
  footprint: { w: number; h: number };
  /** How many residents / storage units / patrons / animals it holds (0 = none). */
  capacity: number;
  capacityUnit: CatalogueCapacityUnit;
  /** Workers required to operate it (0 = nobody tends it). */
  workers: number;
  produces: CatalogueProduction;
  maintenance: CatalogueMaintenance;
  /** Catalogue ids this building upgrades into (empty = terminal). */
  upgradesTo: string[];
  prerequisites: CataloguePrerequisite[];
  /** The existing system it describes, or null when there is none yet. */
  system: CatalogueSystem | null;
  /**
   * The Build-menu palette kind it arms, or null when it is not
   * placeable from the menu. Placeable entries keep their existing
   * behaviour exactly (free placement today where it was free);
   * the catalogue describes them, it does not re-price them.
   */
  paletteKind: PaletteKind | null;
};

/**
 * BUILD 1092: the A-F catalogue — 93 entries. Counts per category:
 * A 12, B 19, C 17, D 15, E 14, F 16. Names are the vision doc's
 * list verbatim; ids are slugified (the two cross-category pairs —
 * Inn (A "Inns and taverns" vs D "Inn") and Stable (C "Stables" vs
 * E "Stable") — are distinct entries with distinct ids).
 */
export const BUILDING_CATALOGUE: CatalogueEntry[] = [
  // ---- A. Settlement and residential (12) ----
  {
    id: 'town-hall', name: 'Town Hall', category: 'settlement',
    blurb: 'The seat of settlement government: records residents, collects taxes, and issues building charters. A town is not a town until it has one.',
    materials: [{ resource: 'stone', qty: 40 }, { resource: 'wood', qty: 20 }, { resource: 'tools', qty: 4 }],
    costStatus: 'planned', footprint: { w: 7, h: 5 }, capacity: 0, capacityUnit: 'none', workers: 3,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'village-hall' }, { kind: 'building', id: 'market-square' }, { kind: 'settlement', minPopulation: 25 }],
    system: null, paletteKind: null,
  },
  {
    id: 'village-hall', name: 'Village Hall', category: 'settlement',
    blurb: 'The village meeting place: notices are posted here, disputes are settled, and the founders gather to plan the next building.',
    materials: [{ resource: 'wood', qty: 16 }, { resource: 'stone', qty: 12 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 20, capacityUnit: 'patrons', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: ['town-hall'],
    prerequisites: [{ kind: 'building', id: 'houses-cottages' }, { kind: 'settlement', minPopulation: 6 }],
    system: null, paletteKind: null,
  },
  {
    id: 'houses-cottages', name: 'Houses and cottages', category: 'settlement',
    blurb: 'A founder-built hut: 3 beds, the first roof in the settlement. Costs 12 wood and takes 6 work steps (2 wood each) — the 1058 construction system, unchanged.',
    materials: [{ resource: 'wood', qty: 12 }],
    costStatus: 'enforced', footprint: { w: 4, h: 3 }, capacity: 3, capacityUnit: 'residents', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: ['large-family-homes'],
    prerequisites: [],
    system: 'hut', paletteKind: 'house-cottage',
  },
  {
    id: 'large-family-homes', name: 'Large family homes', category: 'settlement',
    blurb: 'A bigger cottage for a growing household: room for six, with a fenced garden beside it. Houses the next generation of residents.',
    materials: [{ resource: 'wood', qty: 20 }, { resource: 'stone', qty: 8 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 6, capacityUnit: 'residents', workers: 0,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: ['manor-houses'],
    prerequisites: [{ kind: 'building', id: 'houses-cottages' }, { kind: 'settlement', minPopulation: 12 }],
    system: null, paletteKind: 'house-tall',
  },
  {
    id: 'worker-housing', name: 'Worker housing', category: 'settlement',
    blurb: 'Plain shared housing beside the work sites: four beds, no garden, a short walk to the quarry, the mill, or the lumber rect.',
    materials: [{ resource: 'wood', qty: 10 }, { resource: 'stone', qty: 4 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 4, capacityUnit: 'residents', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'houses-cottages' }],
    system: null, paletteKind: null,
  },
  {
    id: 'inns-taverns', name: 'Inns and taverns', category: 'settlement',
    blurb: 'A warm room, a hot meal, and a bed for travellers: the settlement\'s first hospitality. Travellers who sleep here spread word of the place.',
    materials: [{ resource: 'wood', qty: 18 }, { resource: 'stone', qty: 10 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 8, capacityUnit: 'patrons', workers: 2,
    produces: null, maintenance: { resource: 'food', qtyPerDay: 2 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'houses-cottages' }, { kind: 'building', id: 'farms' }, { kind: 'settlement', minPopulation: 10 }],
    system: null, paletteKind: 'house-inn',
  },
  {
    id: 'guesthouses', name: 'Guesthouses', category: 'settlement',
    blurb: 'Quiet rooms for visiting merchants and kin: six beds, no tavern noise, kept by the innkeeper\'s household.',
    materials: [{ resource: 'wood', qty: 14 }, { resource: 'stone', qty: 6 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 6, capacityUnit: 'residents', workers: 1,
    produces: null, maintenance: { resource: 'food', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'inns-taverns' }],
    system: null, paletteKind: null,
  },
  {
    id: 'noble-estates', name: 'Noble estates', category: 'settlement',
    blurb: 'A walled estate for the settlement\'s richest household: ten residents, gardens, and stables of its own. Only a thriving town grows one.',
    materials: [{ resource: 'stone', qty: 60 }, { resource: 'wood', qty: 30 }, { resource: 'tools', qty: 6 }, { resource: 'luxury', qty: 4 }],
    costStatus: 'planned', footprint: { w: 8, h: 6 }, capacity: 10, capacityUnit: 'residents', workers: 4,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 2 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'manor-houses' }, { kind: 'settlement', minPopulation: 40 }],
    system: null, paletteKind: null,
  },
  {
    id: 'manor-houses', name: 'Manor houses', category: 'settlement',
    blurb: 'A grand house for a leading family: eight residents, a hall for gatherings, and the town\'s best roof.',
    materials: [{ resource: 'stone', qty: 30 }, { resource: 'wood', qty: 20 }, { resource: 'tools', qty: 4 }],
    costStatus: 'planned', footprint: { w: 6, h: 5 }, capacity: 8, capacityUnit: 'residents', workers: 2,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: ['noble-estates'],
    prerequisites: [{ kind: 'building', id: 'large-family-homes' }, { kind: 'building', id: 'town-hall' }],
    system: null, paletteKind: 'house-grand',
  },
  {
    id: 'guild-halls', name: 'Guild halls', category: 'settlement',
    blurb: 'Where the craftsmen meet: the carpenters, masons, and smiths set prices, train apprentices, and keep the town\'s standards.',
    materials: [{ resource: 'stone', qty: 24 }, { resource: 'wood', qty: 16 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 6, h: 4 }, capacity: 20, capacityUnit: 'patrons', workers: 2,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'trading-post' }, { kind: 'building', id: 'town-hall' }],
    system: null, paletteKind: null,
  },
  {
    id: 'warehouses', name: 'Warehouses', category: 'settlement',
    blurb: 'Bulk storage for the market: grain, timber, and trade goods under one roof, guarded and counted. The town\'s larder and treasury in one.',
    materials: [{ resource: 'wood', qty: 16 }, { resource: 'stone', qty: 12 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 400, capacityUnit: 'storage', workers: 2,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'storehouses' }, { kind: 'building', id: 'market-square' }],
    system: null, paletteKind: null,
  },
  {
    id: 'storehouses', name: 'Storehouses', category: 'settlement',
    blurb: 'The settlement storehouse: holds 100 wood and 60 stone (the 1087 system, unchanged). Costs 12 wood + 6 stone, 6 work steps, built by the founders.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 6 }],
    costStatus: 'enforced', footprint: { w: 3, h: 3 }, capacity: 160, capacityUnit: 'storage', workers: 1,
    produces: null, maintenance: null,
    upgradesTo: ['warehouses'],
    prerequisites: [],
    system: 'storehouse', paletteKind: null,
  },
  // ---- B. Resource and production (19) ----
  {
    id: 'woodcutters-hut', name: 'Woodcutter\'s hut', category: 'production',
    blurb: 'The lumber designation: a forest-edge rect the founders fell in rotation (the 1089 lumber system). Two workers, no build cost — the site is the designation.',
    materials: [],
    costStatus: 'none', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'wood', perHour: 4 }, maintenance: null,
    upgradesTo: ['lumber-mill'],
    prerequisites: [],
    system: 'lumber', paletteKind: null,
  },
  {
    id: 'lumber-mill', name: 'Lumber mill', category: 'production',
    blurb: 'Saws felled logs into timber for building: the step between cutting trees and raising walls. Needs the woodcutter\'s hut first.',
    materials: [{ resource: 'wood', qty: 14 }, { resource: 'stone', qty: 6 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'timber', perHour: 3 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: ['sawmill'],
    prerequisites: [{ kind: 'building', id: 'woodcutters-hut' }],
    system: null, paletteKind: null,
  },
  {
    id: 'quarry', name: 'Quarry', category: 'production',
    blurb: 'The designated rock site: a crew of 2 works the reachable rocks (the 1086/1089 quarry system). 2 stone per deposit visit, 1 per rock. Needs a stone deposit.',
    materials: [],
    costStatus: 'none', footprint: { w: 4, h: 4 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'stone', perHour: 2 }, maintenance: null,
    upgradesTo: [],
    prerequisites: [{ kind: 'deposit', resource: 'stone' }],
    system: 'quarry', paletteKind: null,
  },
  {
    id: 'mining-shaft', name: 'Mining shaft', category: 'production',
    blurb: 'A deep shaft below the mine entrance: timbered, ventilated, and worked in shifts. The mine entrance must exist first, and the iron must be there to dig.',
    materials: [{ resource: 'wood', qty: 10 }, { resource: 'stone', qty: 8 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 3,
    produces: { resource: 'ore', perHour: 3 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'mine-entrance' }, { kind: 'deposit', resource: 'iron' }],
    system: null, paletteKind: null,
  },
  {
    id: 'mine-entrance', name: 'Mine entrance', category: 'production',
    blurb: 'A stone structure over a live iron deposit that the player can enter (the 1089 mine system). Designated from day 3 once the storehouse stands; 2 ore per miner shift. Needs workers, an iron deposit, and a transport route.',
    materials: [],
    costStatus: 'none', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'ore', perHour: 2 }, maintenance: null,
    upgradesTo: ['mining-shaft'],
    prerequisites: [{ kind: 'deposit', resource: 'iron' }, { kind: 'building', id: 'storehouses' }, { kind: 'transport' }],
    system: 'mine', paletteKind: 'house-mine',
  },
  {
    id: 'smelter', name: 'Smelter', category: 'production',
    blurb: 'Smelts ore into iron: a coal-fired furnace beside the mine. Without it the ore is just heavy rock.',
    materials: [{ resource: 'stone', qty: 12 }, { resource: 'wood', qty: 6 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'iron', perHour: 1 }, maintenance: { resource: 'coal', qtyPerDay: 1 },
    upgradesTo: ['foundry'],
    prerequisites: [{ kind: 'building', id: 'mine-entrance' }, { kind: 'resource', resource: 'coal' }],
    system: null, paletteKind: null,
  },
  {
    id: 'foundry', name: 'Foundry', category: 'production',
    blurb: 'Casts smelted iron into ingots, tools, and fittings at scale: the smelter grown up, with moulds, crucibles, and a coal store.',
    materials: [{ resource: 'stone', qty: 16 }, { resource: 'iron', qty: 6 }, { resource: 'coal', qty: 4 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 3,
    produces: { resource: 'iron', perHour: 2 }, maintenance: { resource: 'coal', qtyPerDay: 2 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'smelter' }, { kind: 'resource', resource: 'coal' }],
    system: null, paletteKind: null,
  },
  {
    id: 'blacksmith', name: 'Blacksmith', category: 'production',
    blurb: 'The smithy: tools, nails, hinges, and blades. Needs the building itself, plus tools, fuel (coal), and materials (iron) — a blacksmith is a chain, not a hut.',
    materials: [{ resource: 'stone', qty: 12 }, { resource: 'wood', qty: 8 }, { resource: 'iron', qty: 4 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'tools', perHour: 1 }, maintenance: { resource: 'coal', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'forge' }, { kind: 'resource', resource: 'tools' }, { kind: 'resource', resource: 'coal' }, { kind: 'resource', resource: 'iron' }],
    system: null, paletteKind: 'house-smith',
  },
  {
    id: 'forge', name: 'Forge', category: 'production',
    blurb: 'The coal-fired hearth where iron is heated and hammered: the blacksmith\'s fire, before the smithy is built around it.',
    materials: [{ resource: 'stone', qty: 10 }, { resource: 'coal', qty: 4 }, { resource: 'iron', qty: 2 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'tools', perHour: 1 }, maintenance: { resource: 'coal', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'foundry' }, { kind: 'resource', resource: 'coal' }],
    system: null, paletteKind: null,
  },
  {
    id: 'charcoal-burner', name: 'Charcoal burner', category: 'production',
    blurb: 'Burns wood slowly into charcoal: the settlement\'s fuel supply, without which no forge or smelter can run.',
    materials: [{ resource: 'wood', qty: 6 }, { resource: 'stone', qty: 4 }],
    costStatus: 'planned', footprint: { w: 2, h: 2 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'coal', perHour: 1 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'woodcutters-hut' }],
    system: null, paletteKind: null,
  },
  {
    id: 'sawmill', name: 'Sawmill', category: 'production',
    blurb: 'Water- or muscle-powered saws turning timber into planks and beams: the lumber mill grown into a proper works.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 4 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 3,
    produces: { resource: 'timber', perHour: 4 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'lumber-mill' }],
    system: null, paletteKind: null,
  },
  {
    id: 'stone-mason', name: 'Stone mason', category: 'production',
    blurb: 'Cuts quarry stone into dressed blocks for walls, roads, and towers: without the mason, stone stays rubble.',
    materials: [{ resource: 'stone', qty: 10 }, { resource: 'wood', qty: 6 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'stone', perHour: 1 }, maintenance: { resource: 'stone', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'quarry' }, { kind: 'resource', resource: 'tools' }],
    system: null, paletteKind: null,
  },
  {
    id: 'carpenter', name: 'Carpenter', category: 'production',
    blurb: 'Shapes timber into doors, beams, furniture, and fittings: every house in the settlement passes through the carpenter\'s bench.',
    materials: [{ resource: 'wood', qty: 10 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: ['workshop'],
    prerequisites: [{ kind: 'building', id: 'lumber-mill' }, { kind: 'resource', resource: 'tools' }],
    system: null, paletteKind: null,
  },
  {
    id: 'workshop', name: 'Workshop', category: 'production',
    blurb: 'A general craft workshop: repairs tools, builds pumps and lamps, and takes on whatever the settlement needs made.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 6 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'carpenter' }, { kind: 'resource', resource: 'tools' }],
    system: null, paletteKind: null,
  },
  {
    id: 'tannery', name: 'Tannery', category: 'production',
    blurb: 'Cures hides into leather for clothing, armour, and harness: smelly work, kept downwind of the houses.',
    materials: [{ resource: 'wood', qty: 8 }, { resource: 'stone', qty: 4 }, { resource: 'tools', qty: 1 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'leather', perHour: 1 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'animal-pens' }, { kind: 'resource', resource: 'tools' }],
    system: null, paletteKind: null,
  },
  {
    id: 'butcher', name: 'Butcher', category: 'production',
    blurb: 'Slaughters and dresses livestock into food: the link between the animal pens and the dinner table.',
    materials: [{ resource: 'wood', qty: 8 }, { resource: 'stone', qty: 4 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'food', perHour: 2 }, maintenance: { resource: 'food', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'animal-pens' }],
    system: null, paletteKind: null,
  },
  {
    id: 'weaver', name: 'Weaver', category: 'production',
    blurb: 'Spins wool into cloth on the loom: the sheep farm\'s wool becomes the tailor\'s cloth here.',
    materials: [{ resource: 'wood', qty: 8 }, { resource: 'tools', qty: 1 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'clothing', perHour: 1 }, maintenance: { resource: 'wool', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'sheep-farms' }],
    system: null, paletteKind: null,
  },
  {
    id: 'tailor', name: 'Tailor', category: 'production',
    blurb: 'Cuts and sews cloth into clothing: residents stop wearing sacks once the tailor opens.',
    materials: [{ resource: 'wood', qty: 8 }, { resource: 'tools', qty: 1 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'clothing', perHour: 2 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'weaver' }],
    system: null, paletteKind: null,
  },
  {
    id: 'pottery-workshop', name: 'Pottery workshop', category: 'production',
    blurb: 'Throws clay into pots, jars, and crocks: storage for the kitchen, and trade goods for the market.',
    materials: [{ resource: 'wood', qty: 6 }, { resource: 'stone', qty: 6 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'luxury', perHour: 1 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'workshop' }],
    system: null, paletteKind: null,
  },
  // ---- C. Food and agriculture (17) ----
  {
    id: 'farms', name: 'Farms', category: 'food',
    blurb: 'Tilled soil the founders plant with wheat (the 1067/1090 farm system): green shoots after an in-game hour, golden wheat after three, 2 wheat per tile at harvest, regrowing on its own. No build cost — the field is planted, not built.',
    materials: [],
    costStatus: 'none', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'grain', perHour: 0.67 }, maintenance: null,
    upgradesTo: [],
    prerequisites: [],
    system: 'farm', paletteKind: 'farm',
  },
  {
    id: 'windmills', name: 'Windmills', category: 'food',
    blurb: 'A stone tower with sails that grinds grain into flour: the mill is the first link of the food chain (BUILD 1094 — grain -> flour -> bakery -> meals). Founder-built through the staged construction path (6 wood, 6 steps, foundation -> frame -> finished); a mill with no worker or no grain produces nothing. Also placeable freely from the Build menu (a player-placed windmill does not mill — milling is tied to the founder-built mill site).',
    materials: [{ resource: 'wood', qty: 6 }],
    costStatus: 'enforced', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'flour', perHour: 2 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'farms' }],
    system: 'mill', paletteKind: 'house-windmill',
  },
  {
    id: 'watermills', name: 'Watermills', category: 'food',
    blurb: 'A wheel on the river that mills grain day and night: steadier than the windmill, but it needs running water beside it.',
    materials: [{ resource: 'wood', qty: 16 }, { resource: 'stone', qty: 12 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'food', perHour: 3 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'farms' }],
    system: null, paletteKind: null,
  },
  {
    id: 'granaries', name: 'Granaries', category: 'food',
    blurb: 'The granary: a registry store holding 200 grain and 60 food at the camp stockpile (the 1090 system, unchanged). Harvested grain lands here, the mill draws from it, and meals are eaten from it. Seeded at camp — no build cost.',
    materials: [],
    costStatus: 'none', footprint: { w: 2, h: 2 }, capacity: 260, capacityUnit: 'storage', workers: 1,
    produces: null, maintenance: null,
    upgradesTo: ['warehouses'],
    prerequisites: [],
    system: 'granary', paletteKind: null,
  },
  {
    id: 'barns', name: 'Barns', category: 'food',
    blurb: 'Hay, tools, and harvest under a big roof: farm storage beside the fields, so the harvest does not sit in the rain.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 4 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 100, capacityUnit: 'storage', workers: 0,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'farms' }],
    system: null, paletteKind: null,
  },
  {
    id: 'animal-pens', name: 'Animal pens', category: 'food',
    blurb: 'Fenced ground where livestock is kept, fed, and counted: the base every animal farm builds on.',
    materials: [{ resource: 'wood', qty: 8 }],
    costStatus: 'planned', footprint: { w: 4, h: 4 }, capacity: 10, capacityUnit: 'animals', workers: 1,
    produces: null, maintenance: { resource: 'food', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'farms' }],
    system: null, paletteKind: null,
  },
  {
    id: 'sheep-farms', name: 'Sheep farms', category: 'food',
    blurb: 'Pasture and pens for a wool flock: the weaver\'s wool comes from here, and the flock grows if it is fed.',
    materials: [{ resource: 'wood', qty: 10 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 12, capacityUnit: 'animals', workers: 1,
    produces: { resource: 'wool', perHour: 1 }, maintenance: { resource: 'grain', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'animal-pens' }],
    system: null, paletteKind: null,
  },
  {
    id: 'cattle-farms', name: 'Cattle farms', category: 'food',
    blurb: 'Pasture and a big barn for the herd: milk, meat, and draft oxen for the heavy work.',
    materials: [{ resource: 'wood', qty: 12 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 10, capacityUnit: 'animals', workers: 2,
    produces: { resource: 'livestock', perHour: 1 }, maintenance: { resource: 'grain', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'animal-pens' }, { kind: 'building', id: 'barns' }],
    system: null, paletteKind: null,
  },
  {
    id: 'pig-farms', name: 'Pig farms', category: 'food',
    blurb: 'Sties for pigs that eat almost anything: the cheapest meat in the settlement, and the butcher\'s steady supply.',
    materials: [{ resource: 'wood', qty: 8 }],
    costStatus: 'planned', footprint: { w: 4, h: 4 }, capacity: 12, capacityUnit: 'animals', workers: 1,
    produces: { resource: 'food', perHour: 2 }, maintenance: { resource: 'food', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'animal-pens' }],
    system: null, paletteKind: null,
  },
  {
    id: 'chicken-coops', name: 'Chicken coops', category: 'food',
    blurb: 'A small coop and run: eggs every day and the occasional chicken for the pot.',
    materials: [{ resource: 'wood', qty: 4 }],
    costStatus: 'planned', footprint: { w: 2, h: 2 }, capacity: 8, capacityUnit: 'animals', workers: 0,
    produces: { resource: 'food', perHour: 1 }, maintenance: { resource: 'grain', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'animal-pens' }],
    system: null, paletteKind: null,
  },
  {
    id: 'stables', name: 'Stables', category: 'food',
    blurb: 'Stalls, tack, and a yard for the settlement\'s horses: mounts for travel, and draft horses for the heavy loads.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 4 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 6, capacityUnit: 'animals', workers: 1,
    produces: null, maintenance: { resource: 'grain', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'animal-pens' }, { kind: 'building', id: 'farms' }],
    system: null, paletteKind: null,
  },
  {
    id: 'fishing-huts', name: 'Fishing huts', category: 'food',
    blurb: 'A hut on the shore with nets, lines, and a drying rack: the settlement\'s fish, straight from the water.',
    materials: [{ resource: 'wood', qty: 6 }],
    costStatus: 'planned', footprint: { w: 2, h: 2 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'fish', perHour: 2 }, maintenance: null,
    upgradesTo: ['fisheries'],
    prerequisites: [],
    system: null, paletteKind: null,
  },
  {
    id: 'fisheries', name: 'Fisheries', category: 'food',
    blurb: 'Nets, boats, and a smokehouse: fish at a scale a single hut cannot reach, feeding the market as well as the camp.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 6 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 3,
    produces: { resource: 'fish', perHour: 4 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'fishing-huts' }, { kind: 'transport' }],
    system: null, paletteKind: null,
  },
  {
    id: 'orchards', name: 'Orchards', category: 'food',
    blurb: 'Rows of fruit trees planted on good ground: apples and pears in season, shade in summer, and blossom in spring.',
    materials: [],
    costStatus: 'none', footprint: { w: 4, h: 4 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'food', perHour: 2 }, maintenance: null,
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'farms' }],
    system: null, paletteKind: null,
  },
  {
    id: 'vegetable-gardens', name: 'Vegetable gardens', category: 'food',
    blurb: 'Kitchen gardens beside the houses: roots, greens, and herbs — including the herbs the apothecary needs.',
    materials: [],
    costStatus: 'none', footprint: { w: 2, h: 2 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'food', perHour: 2 }, maintenance: null,
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'farms' }],
    system: null, paletteKind: null,
  },
  {
    id: 'bakeries', name: 'Bakeries', category: 'food',
    blurb: 'An oven that never cools: flour from the mill becomes bread for the whole settlement (BUILD 1094 — the bakery is the only way grain becomes meals; the old direct grain -> meals path is removed). Founder-built through the staged construction path (6 wood, 6 steps, foundation -> frame -> finished) once the mill is done; a bakery with no worker or no flour produces nothing. Wood-only cost — no stone or tools, so day-1/2 construction is not blocked.',
    materials: [{ resource: 'wood', qty: 6 }],
    costStatus: 'enforced', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'food', perHour: 3 }, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'farms' }, { kind: 'building', id: 'windmills' }],
    system: 'bakery', paletteKind: null,
  },
  {
    id: 'breweries', name: 'Breweries', category: 'food',
    blurb: 'Barrels, mash, and a copper kettle: grain becomes ale, and ale becomes the tavern\'s trade and the workers\' cheer.',
    materials: [{ resource: 'wood', qty: 10 }, { resource: 'stone', qty: 6 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: { resource: 'food', perHour: 2 }, maintenance: { resource: 'grain', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'farms' }, { kind: 'resource', resource: 'grain' }],
    system: null, paletteKind: null,
  },
  // ---- D. Trade and services (15) ----
  {
    id: 'market-square', name: 'Market square', category: 'trade',
    blurb: 'The paved square where the town trades: stalls gather here, news is shared, and travellers first see the settlement. Needs the storehouse (logistics) and a transport route first — never a market before the goods exist.',
    materials: [{ resource: 'stone', qty: 20 }, { resource: 'wood', qty: 8 }],
    costStatus: 'planned', footprint: { w: 6, h: 6 }, capacity: 40, capacityUnit: 'patrons', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'storehouses' }, { kind: 'transport' }],
    system: null, paletteKind: null,
  },
  {
    id: 'market-stalls', name: 'Market stalls', category: 'trade',
    blurb: 'A trader\'s stall on the square: goods on a counter, coins in a box. Placed freely from the Build menu today (no cost enforced yet).',
    materials: [],
    costStatus: 'none', footprint: { w: 2, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: ['general-store'],
    prerequisites: [{ kind: 'building', id: 'market-square' }],
    system: null, paletteKind: 'stall',
  },
  {
    id: 'general-store', name: 'General store', category: 'trade',
    blurb: 'A roofed shop selling a bit of everything: tools, cloth, pots, and dried food. The stall that grew walls.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 6 }, { resource: 'tools', qty: 1 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'market-stalls' }, { kind: 'resource', resource: 'tools' }],
    system: null, paletteKind: 'house-store',
  },
  {
    id: 'merchant-houses', name: 'Merchant houses', category: 'trade',
    blurb: 'A merchant\'s house with a shopfront below and living rooms above: the trader lives where he trades.',
    materials: [{ resource: 'wood', qty: 16 }, { resource: 'stone', qty: 10 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 4, capacityUnit: 'residents', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'trading-post' }],
    system: null, paletteKind: 'house-shop',
  },
  {
    id: 'trading-post', name: 'Trading post', category: 'trade',
    blurb: 'Where travelling merchants meet the settlement: caravans unload, deals are struck, and goods from far away arrive.',
    materials: [{ resource: 'wood', qty: 14 }, { resource: 'stone', qty: 8 }],
    costStatus: 'planned', footprint: { w: 4, h: 4 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'market-square' }, { kind: 'transport' }],
    system: null, paletteKind: null,
  },
  {
    id: 'caravanserai', name: 'Caravanserai', category: 'trade',
    blurb: 'A walled yard for caravans: stables, stores, and safe sleep for traders and their animals on the long road.',
    materials: [{ resource: 'wood', qty: 20 }, { resource: 'stone', qty: 12 }],
    costStatus: 'planned', footprint: { w: 6, h: 5 }, capacity: 20, capacityUnit: 'patrons', workers: 3,
    produces: null, maintenance: { resource: 'food', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'trading-post' }, { kind: 'building', id: 'stables' }],
    system: null, paletteKind: null,
  },
  {
    id: 'bank', name: 'Bank', category: 'trade',
    blurb: 'A strong room for the town\'s gold: deposits are kept, loans are made, and the treasury is counted behind stone walls.',
    materials: [{ resource: 'stone', qty: 20 }, { resource: 'wood', qty: 10 }, { resource: 'gold', qty: 10 }],
    costStatus: 'planned', footprint: { w: 4, h: 4 }, capacity: 500, capacityUnit: 'storage', workers: 2,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'trading-post' }, { kind: 'settlement', minPopulation: 30 }, { kind: 'resource', resource: 'gold' }],
    system: null, paletteKind: null,
  },
  {
    id: 'apothecary', name: 'Apothecary', category: 'trade',
    blurb: 'Herbs, tinctures, and bandages: the settlement\'s first healthcare, grown in the vegetable gardens and brewed here.',
    materials: [{ resource: 'wood', qty: 8 }, { resource: 'stone', qty: 4 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: { resource: 'medicine', perHour: 1 }, maintenance: { resource: 'food', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'vegetable-gardens' }, { kind: 'settlement', minPopulation: 10 }],
    system: null, paletteKind: null,
  },
  {
    id: 'hospital', name: 'Hospital', category: 'trade',
    blurb: 'Beds, clean water, and a healer on call: the sick recover here instead of in their huts. Never before healthcare — it needs the apothecary first.',
    materials: [{ resource: 'stone', qty: 20 }, { resource: 'wood', qty: 12 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 10, capacityUnit: 'patrons', workers: 3,
    produces: null, maintenance: { resource: 'medicine', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'apothecary' }, { kind: 'settlement', minPopulation: 20 }],
    system: null, paletteKind: null,
  },
  {
    id: 'church', name: 'Church', category: 'trade',
    blurb: 'A stone church with a bell: services, weddings, funerals, and the town\'s calendar. The bell marks the hours for everyone.',
    materials: [{ resource: 'stone', qty: 24 }, { resource: 'wood', qty: 12 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 30, capacityUnit: 'patrons', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'village-hall' }, { kind: 'settlement', minPopulation: 15 }],
    system: null, paletteKind: null,
  },
  {
    id: 'monastery', name: 'Monastery', category: 'trade',
    blurb: 'A quiet house of prayer and study: monks keep the books, copy the records, and tend the sick when the hospital is full.',
    materials: [{ resource: 'stone', qty: 30 }, { resource: 'wood', qty: 16 }],
    costStatus: 'planned', footprint: { w: 6, h: 5 }, capacity: 12, capacityUnit: 'residents', workers: 2,
    produces: null, maintenance: { resource: 'food', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'church' }, { kind: 'settlement', minPopulation: 25 }],
    system: null, paletteKind: null,
  },
  {
    id: 'school', name: 'School', category: 'trade',
    blurb: 'A schoolroom where the town\'s children learn letters and numbers: the settlement investing in its next generation.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 8 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 20, capacityUnit: 'patrons', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'church' }, { kind: 'settlement', minPopulation: 20 }],
    system: null, paletteKind: null,
  },
  {
    id: 'library', name: 'Library', category: 'trade',
    blurb: 'Shelves of books and maps: the town\'s memory, kept dry and catalogued. Scholars and the curious gather here.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 8 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 20, capacityUnit: 'patrons', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'school' }],
    system: null, paletteKind: null,
  },
  {
    id: 'inn', name: 'Inn', category: 'trade',
    blurb: 'The trading inn on the square: rooms and stabling for merchants doing business at the market, kept by the innkeeper\'s household.',
    materials: [{ resource: 'wood', qty: 14 }, { resource: 'stone', qty: 6 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 8, capacityUnit: 'patrons', workers: 2,
    produces: null, maintenance: { resource: 'food', qtyPerDay: 2 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'inns-taverns' }, { kind: 'building', id: 'market-square' }],
    system: null, paletteKind: 'house-inn',
  },
  {
    id: 'blacksmith-services', name: 'Blacksmith services', category: 'trade',
    blurb: 'The smithy\'s counter: repairs, shoeing, and small orders for travellers and townsfolk — the blacksmith\'s trade, as a service.',
    materials: [{ resource: 'wood', qty: 8 }, { resource: 'stone', qty: 4 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: null, maintenance: { resource: 'coal', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'blacksmith' }, { kind: 'building', id: 'market-square' }],
    system: null, paletteKind: 'house-smith',
  },
  // ---- E. Military and defensive infrastructure (14) ----
  {
    id: 'barracks', name: 'Barracks', category: 'military',
    blurb: 'Bunks, drill, and a parade ground for the town guard: twelve soldiers housed, fed, and ready.',
    materials: [{ resource: 'wood', qty: 16 }, { resource: 'stone', qty: 12 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 12, capacityUnit: 'residents', workers: 2,
    produces: null, maintenance: { resource: 'food', qtyPerDay: 2 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'guardhouse' }, { kind: 'resource', resource: 'weapons' }],
    system: null, paletteKind: null,
  },
  {
    id: 'archery-range', name: 'Archery range', category: 'military',
    blurb: 'Butts and targets where the guard learns the bow: a soldier who can shoot is worth two who cannot.',
    materials: [{ resource: 'wood', qty: 10 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'barracks' }, { kind: 'resource', resource: 'wood' }],
    system: null, paletteKind: null,
  },
  {
    id: 'stable', name: 'Stable', category: 'military',
    blurb: 'The guard\'s stable: mounts for patrols and messengers, kept beside the barracks. (The farm stables are a separate entry.)',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 4 }],
    costStatus: 'planned', footprint: { w: 4, h: 3 }, capacity: 8, capacityUnit: 'animals', workers: 1,
    produces: null, maintenance: { resource: 'grain', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'barracks' }, { kind: 'building', id: 'stables' }],
    system: null, paletteKind: null,
  },
  {
    id: 'armoury', name: 'Armoury', category: 'military',
    blurb: 'Racks of weapons and armour under lock and key: the guard draws its gear here, and the town\'s spares are counted.',
    materials: [{ resource: 'stone', qty: 12 }, { resource: 'wood', qty: 8 }, { resource: 'iron', qty: 4 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 100, capacityUnit: 'storage', workers: 1,
    produces: null, maintenance: { resource: 'iron', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'blacksmith' }, { kind: 'building', id: 'barracks' }],
    system: null, paletteKind: null,
  },
  {
    id: 'siege-workshop', name: 'Siege workshop', category: 'military',
    blurb: 'Where catapults and rams are built and kept: heavy timber, iron fittings, and a yard big enough to test them.',
    materials: [{ resource: 'wood', qty: 16 }, { resource: 'iron', qty: 6 }, { resource: 'tools', qty: 2 }],
    costStatus: 'planned', footprint: { w: 4, h: 4 }, capacity: 0, capacityUnit: 'none', workers: 3,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'armoury' }, { kind: 'building', id: 'carpenter' }],
    system: null, paletteKind: null,
  },
  {
    id: 'guardhouse', name: 'Guardhouse', category: 'military',
    blurb: 'The guard\'s post at the town\'s heart: four guards on duty, a lock-up for troublemakers, and a bell to raise the alarm.',
    materials: [{ resource: 'wood', qty: 10 }, { resource: 'stone', qty: 6 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 4, capacityUnit: 'residents', workers: 2,
    produces: null, maintenance: { resource: 'food', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'village-hall' }, { kind: 'resource', resource: 'wood' }],
    system: null, paletteKind: null,
  },
  {
    id: 'watchtower', name: 'Watchtower', category: 'military',
    blurb: 'A tall timber tower with a watchman on top: trouble is seen coming long before it arrives.',
    materials: [{ resource: 'wood', qty: 12 }, { resource: 'stone', qty: 6 }],
    costStatus: 'planned', footprint: { w: 2, h: 2 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'guardhouse' }, { kind: 'resource', resource: 'wood' }],
    system: null, paletteKind: null,
  },
  {
    id: 'walls', name: 'Walls', category: 'military',
    blurb: 'A stone wall, one tile at a time: the line between the town and everything outside it. Four stone per tile.',
    materials: [{ resource: 'stone', qty: 4 }],
    costStatus: 'planned', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: { resource: 'stone', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'stone-mason' }, { kind: 'resource', resource: 'stone' }],
    system: null, paletteKind: null,
  },
  {
    id: 'wooden-palisades', name: 'Wooden palisades', category: 'military',
    blurb: 'Sharpened logs set in the ground: the cheap wall a young settlement raises before it can afford stone.',
    materials: [{ resource: 'wood', qty: 2 }],
    costStatus: 'planned', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'woodcutters-hut' }, { kind: 'resource', resource: 'wood' }],
    system: null, paletteKind: null,
  },
  {
    id: 'gates', name: 'Gates', category: 'military',
    blurb: 'Iron-bound gates in the wall: the town\'s doors, barred at night and guarded by day.',
    materials: [{ resource: 'wood', qty: 8 }, { resource: 'stone', qty: 4 }, { resource: 'iron', qty: 2 }],
    costStatus: 'planned', footprint: { w: 3, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'walls' }],
    system: null, paletteKind: null,
  },
  {
    id: 'stone-towers', name: 'Stone towers', category: 'military',
    blurb: 'A stone tower on the wall: archers above, a strong door below, and a view over the whole approach.',
    materials: [{ resource: 'stone', qty: 20 }, { resource: 'wood', qty: 6 }],
    costStatus: 'planned', footprint: { w: 3, h: 3 }, capacity: 0, capacityUnit: 'none', workers: 2,
    produces: null, maintenance: { resource: 'stone', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'walls' }, { kind: 'building', id: 'stone-mason' }],
    system: null, paletteKind: null,
  },
  {
    id: 'castle', name: 'Castle', category: 'military',
    blurb: 'The castle: walls, towers, a keep, and a garrison — the seat of the realm\'s power. Only a town of forty with walls and barracks grows one; never a kingdom before settlements sustain themselves.',
    materials: [{ resource: 'stone', qty: 100 }, { resource: 'wood', qty: 40 }, { resource: 'iron', qty: 10 }, { resource: 'tools', qty: 8 }],
    costStatus: 'planned', footprint: { w: 10, h: 8 }, capacity: 20, capacityUnit: 'residents', workers: 8,
    produces: null, maintenance: { resource: 'stone', qtyPerDay: 2 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'stone-towers' }, { kind: 'building', id: 'barracks' }, { kind: 'settlement', minPopulation: 40 }],
    system: null, paletteKind: null,
  },
  {
    id: 'keep', name: 'Keep', category: 'military',
    blurb: 'The castle\'s last stronghold: the lord\'s hall and the final refuge if the walls fall.',
    materials: [{ resource: 'stone', qty: 60 }, { resource: 'wood', qty: 20 }, { resource: 'iron', qty: 6 }, { resource: 'tools', qty: 4 }],
    costStatus: 'planned', footprint: { w: 6, h: 5 }, capacity: 10, capacityUnit: 'residents', workers: 4,
    produces: null, maintenance: { resource: 'stone', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'castle' }],
    system: null, paletteKind: null,
  },
  {
    id: 'training-grounds', name: 'Training grounds', category: 'military',
    blurb: 'Open ground with dummies, courses, and a ring: where guards drill and recruits learn to hold a line.',
    materials: [{ resource: 'wood', qty: 8 }],
    costStatus: 'planned', footprint: { w: 5, h: 4 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: null, maintenance: { resource: 'food', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'barracks' }],
    system: null, paletteKind: null,
  },
  // ---- F. Infrastructure (16) ----
  {
    id: 'dirt-roads', name: 'Dirt roads', category: 'infrastructure',
    blurb: 'Packed dirt roads between the camp, the quarry, and the fields: the transport routes the founders walk every day (the 1088 path system). Free to place — the road is the path.',
    materials: [],
    costStatus: 'none', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: ['cobblestone-roads'],
    prerequisites: [],
    system: 'path', paletteKind: 'path',
  },
  {
    id: 'cobblestone-roads', name: 'Cobblestone roads', category: 'infrastructure',
    blurb: 'Stone-set roads through the town: dry in the rain, firm under carts, and the mark of a place that intends to stay.',
    materials: [{ resource: 'stone', qty: 1 }],
    costStatus: 'planned', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: { resource: 'stone', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'dirt-roads' }, { kind: 'building', id: 'stone-mason' }],
    system: null, paletteKind: null,
  },
  {
    id: 'bridges', name: 'Bridges', category: 'infrastructure',
    blurb: 'A wooden bridge over water you can walk across (the 1088 bridge system, unchanged): 2 work steps of 2 wood each, 4 wood in total.',
    materials: [{ resource: 'wood', qty: 4 }],
    costStatus: 'enforced', footprint: { w: 3, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: [],
    prerequisites: [],
    system: 'bridge', paletteKind: 'bridge',
  },
  {
    id: 'wooden-bridges', name: 'Wooden bridges', category: 'infrastructure',
    blurb: 'A timber bridge over a stream or the pond: the same bridge the founders build (2 steps of 2 wood), listed under its own name.',
    materials: [{ resource: 'wood', qty: 4 }],
    costStatus: 'enforced', footprint: { w: 3, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: ['stone-bridges'],
    prerequisites: [{ kind: 'building', id: 'dirt-roads' }],
    system: 'bridge', paletteKind: 'bridge',
  },
  {
    id: 'stone-bridges', name: 'Stone bridges', category: 'infrastructure',
    blurb: 'A stone bridge that outlasts floods: the wooden bridge grown permanent, for the town\'s main crossings.',
    materials: [{ resource: 'stone', qty: 6 }, { resource: 'wood', qty: 2 }],
    costStatus: 'planned', footprint: { w: 3, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: { resource: 'stone', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'wooden-bridges' }, { kind: 'building', id: 'stone-mason' }],
    system: null, paletteKind: null,
  },
  {
    id: 'river-crossings', name: 'River crossings', category: 'infrastructure',
    blurb: 'A ford or ferry where the road meets the river: the crossing point travellers aim for, before any bridge is built.',
    materials: [{ resource: 'wood', qty: 6 }, { resource: 'stone', qty: 2 }],
    costStatus: 'planned', footprint: { w: 3, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: null, maintenance: null,
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'wooden-bridges' }, { kind: 'transport' }],
    system: null, paletteKind: null,
  },
  {
    id: 'wells', name: 'Wells', category: 'infrastructure',
    blurb: 'A functional water source the settlement seeds from day 3 (the 1088 well system): founders carry water from it, and twenty residents drink from it. No build cost — the settlement digs it.',
    materials: [],
    costStatus: 'none', footprint: { w: 1, h: 1 }, capacity: 20, capacityUnit: 'residents', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: ['water-pumps'],
    prerequisites: [{ kind: 'settlement', minPopulation: 3 }],
    system: 'well', paletteKind: null,
  },
  {
    id: 'water-pumps', name: 'Water pumps', category: 'infrastructure',
    blurb: 'A hand pump that lifts well water without a bucket: faster water for the kitchens, the gardens, and the forge.',
    materials: [{ resource: 'wood', qty: 6 }, { resource: 'iron', qty: 2 }, { resource: 'tools', qty: 1 }],
    costStatus: 'planned', footprint: { w: 2, h: 2 }, capacity: 30, capacityUnit: 'residents', workers: 0,
    produces: null, maintenance: { resource: 'iron', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'wells' }, { kind: 'building', id: 'workshop' }],
    system: null, paletteKind: null,
  },
  {
    id: 'irrigation-channels', name: 'Irrigation channels', category: 'infrastructure',
    blurb: 'Ditches that carry well water to the fields: the farms stop depending on rain.',
    materials: [{ resource: 'wood', qty: 1 }],
    costStatus: 'planned', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'wells' }, { kind: 'building', id: 'farms' }],
    system: null, paletteKind: null,
  },
  {
    id: 'fences', name: 'Fences', category: 'infrastructure',
    blurb: 'Low wooden fences around houses and gardens, with a gap at the door: keeps the animals out and the boundaries clear. Placed freely from the Build menu today.',
    materials: [],
    costStatus: 'none', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: [],
    prerequisites: [],
    system: null, paletteKind: 'fence',
  },
  {
    id: 'street-lamps', name: 'Street lamps', category: 'infrastructure',
    blurb: 'Lanterns on posts along the roads: the town stays lit and safe after dark, burning a little coal each night.',
    materials: [{ resource: 'wood', qty: 1 }, { resource: 'coal', qty: 1 }],
    costStatus: 'planned', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: { resource: 'coal', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'workshop' }, { kind: 'resource', resource: 'coal' }],
    system: null, paletteKind: null,
  },
  {
    id: 'docks', name: 'Docks', category: 'infrastructure',
    blurb: 'A wooden dock where boats tie up: fish comes ashore here, and travellers step onto dry land.',
    materials: [{ resource: 'wood', qty: 10 }],
    costStatus: 'planned', footprint: { w: 3, h: 2 }, capacity: 0, capacityUnit: 'none', workers: 1,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 1 },
    upgradesTo: ['harbours'],
    prerequisites: [{ kind: 'building', id: 'fishing-huts' }, { kind: 'transport' }],
    system: null, paletteKind: null,
  },
  {
    id: 'harbours', name: 'Harbours', category: 'infrastructure',
    blurb: 'A sheltered harbour with quays and stores: big boats, real trade, and the town\'s door to the wider world.',
    materials: [{ resource: 'wood', qty: 20 }, { resource: 'stone', qty: 16 }],
    costStatus: 'planned', footprint: { w: 6, h: 4 }, capacity: 0, capacityUnit: 'none', workers: 3,
    produces: null, maintenance: { resource: 'wood', qtyPerDay: 2 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'docks' }, { kind: 'building', id: 'trading-post' }],
    system: null, paletteKind: null,
  },
  {
    id: 'paths', name: 'Paths', category: 'infrastructure',
    blurb: 'Dirt paths between houses, doors, and the well: the settlement\'s own footways (the 1088 path system). Free to place — the path is the road.',
    materials: [],
    costStatus: 'none', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: [],
    prerequisites: [],
    system: 'path', paletteKind: 'path',
  },
  {
    id: 'drainage', name: 'Drainage', category: 'infrastructure',
    blurb: 'Ditches and drains that keep the cobbled streets dry: unglamorous, and the reason the market square does not flood.',
    materials: [{ resource: 'stone', qty: 1 }],
    costStatus: 'planned', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: null,
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'cobblestone-roads' }],
    system: null, paletteKind: null,
  },
  {
    id: 'defensive-roads', name: 'Defensive roads', category: 'infrastructure',
    blurb: 'A hard road along the inside of the wall: the guard moves fast to wherever the alarm sounds.',
    materials: [{ resource: 'stone', qty: 2 }, { resource: 'wood', qty: 1 }],
    costStatus: 'planned', footprint: { w: 1, h: 1 }, capacity: 0, capacityUnit: 'none', workers: 0,
    produces: null, maintenance: { resource: 'stone', qtyPerDay: 1 },
    upgradesTo: [],
    prerequisites: [{ kind: 'building', id: 'walls' }, { kind: 'building', id: 'dirt-roads' }],
    system: null, paletteKind: null,
  },
];

// ---- Lookups ----

/** The catalogue entry for an id, or undefined when there is none. */
export function catalogueEntryFor(id: string): CatalogueEntry | undefined {
  return BUILDING_CATALOGUE.find((e) => e.id === id);
}

/** Every entry in one category, in catalogue order. */
export function catalogueByCategory(category: CatalogueCategoryId): CatalogueEntry[] {
  return BUILDING_CATALOGUE.filter((e) => e.category === category);
}

// ---- Build-menu entries ----

export type CatalogueMenuEntry = {
  entry: CatalogueEntry;
  /** True when the entry arms an existing Build-menu tool. */
  placeable: boolean;
  /** Why a locked entry cannot be placed (null when placeable). */
  lockedReason: string | null;
};

/** The menu entry for one catalogue entry. */
export function catalogueMenuEntryFor(entry: CatalogueEntry): CatalogueMenuEntry {
  if (entry.paletteKind !== null) return { entry, placeable: true, lockedReason: null };
  if (entry.system !== null) {
    return {
      entry, placeable: false,
      lockedReason: 'Runs in the settlement already — not placed from this menu',
    };
  }
  return {
    entry, placeable: false,
    lockedReason: 'No construction path yet — coming in a later build',
  };
}

/** One menu entry per catalogue entry, in catalogue order. */
export function catalogueMenuEntries(): CatalogueMenuEntry[] {
  return BUILDING_CATALOGUE.map(catalogueMenuEntryFor);
}

// ---- Dependency graph ----

/**
 * A topological build order (prerequisites and upgrade sources first),
 * or the cycle when the graph is not acyclic. Edges run from a
 * prerequisite to the entry that needs it, and from an entry to the
 * building it upgrades into — so a cycle anywhere in either relation
 * is reported, not silently ordered.
 */
export function catalogueTopologicalOrder():
  | { order: string[]; cycle: null }
  | { order: null; cycle: string[] } {
  const ids = new Set(BUILDING_CATALOGUE.map((e) => e.id));
  const edges = new Map<string, string[]>();
  for (const e of BUILDING_CATALOGUE) edges.set(e.id, []);
  for (const e of BUILDING_CATALOGUE) {
    for (const p of e.prerequisites) {
      if (p.kind === 'building' && ids.has(p.id)) edges.get(p.id)!.push(e.id);
    }
    for (const u of e.upgradesTo) {
      if (ids.has(u)) edges.get(e.id)!.push(u);
    }
  }
  // Kahn's algorithm: a missing node at the end means a cycle.
  const inDegree = new Map<string, number>();
  for (const id of ids) inDegree.set(id, 0);
  for (const [, tos] of edges) for (const to of tos) inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  const queue = [...ids].filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const to of edges.get(id) ?? []) {
      inDegree.set(to, (inDegree.get(to) ?? 0) - 1);
      if (inDegree.get(to) === 0) queue.push(to);
    }
  }
  if (order.length === BUILDING_CATALOGUE.length) return { order, cycle: null };
  // Find one cycle for the message (DFS over the leftover subgraph).
  const leftover = new Set([...ids].filter((id) => !order.includes(id)));
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visited = new Set<string>();
  const findCycle = (id: string): string[] | null => {
    visited.add(id);
    onStack.add(id);
    stack.push(id);
    for (const to of edges.get(id) ?? []) {
      if (!leftover.has(to)) continue;
      if (!visited.has(to)) {
        const found = findCycle(to);
        if (found) return found;
      } else if (onStack.has(to)) {
        return [...stack.slice(stack.indexOf(to)), to];
      }
    }
    stack.pop();
    onStack.delete(id);
    return null;
  };
  for (const id of leftover) {
    if (!visited.has(id)) {
      const cycle = findCycle(id);
      if (cycle) return { order: null, cycle };
    }
  }
  return { order: null, cycle: [...leftover] };
}

// ---- Validation ----

/**
 * Every problem with the catalogue as data, or an empty list when it
 * is complete and consistent. `knownResources` is the registry's kind
 * list, passed in so this module keeps no runtime dependency on the
 * registry — the sim and the standalone asserts pass REGISTRY_KINDS.
 */
export function validateCatalogue(knownResources: readonly string[]): string[] {
  const issues: string[] = [];
  const known = new Set(knownResources);
  const ids = new Set<string>();
  for (const e of BUILDING_CATALOGUE) {
    if (ids.has(e.id)) issues.push(`duplicate catalogue id: ${e.id}`);
    ids.add(e.id);
  }
  if (BUILDING_CATALOGUE.length !== 93) {
    issues.push(`catalogue has ${BUILDING_CATALOGUE.length} entries, expected 93`);
  }
  for (const c of CATALOGUE_CATEGORIES) {
    const n = catalogueByCategory(c.id).length;
    const expected: Record<CatalogueCategoryId, number> = {
      settlement: 12, production: 19, food: 17, trade: 15, military: 14, infrastructure: 16,
    };
    if (n !== expected[c.id]) issues.push(`category ${c.id} has ${n} entries, expected ${expected[c.id]}`);
  }
  const isWhole = (n: number) => Number.isInteger(n) && n >= 0;
  for (const e of BUILDING_CATALOGUE) {
    const tag = `entry ${e.id}`;
    if (!e.name.trim()) issues.push(`${tag}: empty name`);
    if (!e.blurb.trim()) issues.push(`${tag}: empty blurb (no function described)`);
    if (!CATALOGUE_CATEGORIES.some((c) => c.id === e.category)) issues.push(`${tag}: unknown category ${e.category}`);
    if (!['enforced', 'planned', 'none'].includes(e.costStatus)) issues.push(`${tag}: unknown costStatus ${e.costStatus}`);
    if (e.costStatus === 'enforced' && e.materials.length === 0) issues.push(`${tag}: enforced cost with no materials`);
    if (e.costStatus === 'none' && e.materials.length !== 0) issues.push(`${tag}: costStatus 'none' but materials are listed`);
    for (const m of e.materials) {
      if (!known.has(m.resource)) issues.push(`${tag}: unknown material resource ${m.resource}`);
      if (!isWhole(m.qty) || m.qty <= 0) issues.push(`${tag}: material ${m.resource} qty ${m.qty} is not a positive whole number`);
    }
    if (!isWhole(e.footprint.w) || e.footprint.w < 1 || !isWhole(e.footprint.h) || e.footprint.h < 1) {
      issues.push(`${tag}: footprint ${e.footprint.w}x${e.footprint.h} is not a whole 1+ tile size`);
    }
    if (!isWhole(e.capacity)) issues.push(`${tag}: capacity ${e.capacity} is not a whole number`);
    if (!CATALOGUE_CAPACITY_UNITS.includes(e.capacityUnit)) issues.push(`${tag}: unknown capacityUnit ${e.capacityUnit}`);
    if ((e.capacity === 0) !== (e.capacityUnit === 'none')) {
      issues.push(`${tag}: capacity ${e.capacity} with unit ${e.capacityUnit} — 0 must pair with 'none'`);
    }
    if (!isWhole(e.workers)) issues.push(`${tag}: workers ${e.workers} is not a whole number`);
    if (e.produces !== null) {
      if (!known.has(e.produces.resource)) issues.push(`${tag}: unknown produced resource ${e.produces.resource}`);
      if (!(e.produces.perHour > 0)) issues.push(`${tag}: production rate ${e.produces.perHour} is not positive`);
    }
    if (e.maintenance !== null) {
      if (!known.has(e.maintenance.resource)) issues.push(`${tag}: unknown maintenance resource ${e.maintenance.resource}`);
      if (!(e.maintenance.qtyPerDay > 0)) issues.push(`${tag}: maintenance ${e.maintenance.qtyPerDay}/day is not positive`);
    }
    for (const u of e.upgradesTo) {
      if (!ids.has(u)) issues.push(`${tag}: upgrade target ${u} is not a catalogue entry`);
      if (u === e.id) issues.push(`${tag}: upgrades into itself`);
    }
    for (const p of e.prerequisites) {
      if (p.kind === 'building' && !ids.has(p.id)) issues.push(`${tag}: prerequisite building ${p.id} is not a catalogue entry`);
      if ((p.kind === 'resource' || p.kind === 'deposit') && !known.has(p.resource)) {
        issues.push(`${tag}: prerequisite ${p.kind} resource ${p.resource} is not a registry kind`);
      }
      if (p.kind === 'settlement' && (!isWhole(p.minPopulation) || p.minPopulation < 1)) {
        issues.push(`${tag}: settlement prerequisite minPopulation ${p.minPopulation} is not a positive whole number`);
      }
    }
    if (e.system !== null && !CATALOGUE_SYSTEMS.includes(e.system)) {
      issues.push(`${tag}: unknown system ${e.system}`);
    }
  }
  const topo = catalogueTopologicalOrder();
  if (topo.cycle) issues.push(`dependency graph has a cycle: ${topo.cycle.join(' -> ')}`);
  return issues;
}

