// RPG brain: typed content registry and state layer for the Adventure Game.
import { DEFAULT_WORLD_SEED, WorldCore, type WorldCoreState } from './worldCore';

// Content is data; the UI can grow without rewriting the core relationships.

export type ChunkCoordinates = { x: number; y: number };
export type RpgLocationType = 'wilderness' | 'village' | 'town' | 'dungeon' | 'landmark';
export type BuildingType = 'home' | 'shop' | 'inn' | 'temple' | 'guild' | 'important';
export type NpcRole = 'civilian' | 'merchant' | 'mage' | 'warrior' | 'guide' | 'rogue';
export type EnemyType = 'beast' | 'humanoid' | 'undead' | 'elemental' | 'boss';
export type ItemType = 'quest' | 'equipment' | 'consumable' | 'key' | 'lore';
export type HistoryType = 'travel' | 'enter_building' | 'dungeon_completed' | 'lore_discovered' | 'class_chosen';
export type PlayerClass = 'beginner' | 'mage' | 'warrior' | 'rogue';
export type TutorialStage = 'wake_in_house' | 'meet_class_guides' | 'hunt_goats' | 'choose_class' | 'leave_tutorial_island';
export type TravelDirection = 'north' | 'east' | 'south' | 'west';
export type TravelGateRequirement = { minLevel?: number; requiresClass?: boolean };
export type TravelGateDefinition = {
  id: string;
  fromChunkId: string;
  toChunkId: string;
  direction: TravelDirection;
  label: string;
  requirement?: TravelGateRequirement;
};
export type TutorialStepDefinition = {
  stage: TutorialStage;
  title: string;
  objective: string;
  completion: string;
};

export const ADVENTURE_STARTING_LOOP: readonly TutorialStepDefinition[] = [
  { stage: 'wake_in_house', title: 'Wake in the Tutorial House', objective: 'Leave the house and reach Mosslight Crossing.', completion: 'The road outside is open.' },
  { stage: 'meet_class_guides', title: 'Meet the Class Guides', objective: 'Speak with Noah, Damon, and Shawn in the town square.', completion: 'The guides explain the three paths forward.' },
  { stage: 'hunt_goats', title: 'Learn the Hunt', objective: 'Defeat goats, survive their counterattacks, and collect useful materials.', completion: 'Your first supplies and experience are secured.' },
  { stage: 'choose_class', title: 'Choose a Class', objective: 'Reach level 10, then choose Mage, Warrior, or Rogue.', completion: 'Your class opens the roads beyond the tutorial.' },
  { stage: 'leave_tutorial_island', title: 'Leave the Tutorial Island', objective: 'Take a connected road into the wider world.', completion: 'The larger map and its settlements are now available.' },
];


export type BrainHistoryEntry = {
  type: HistoryType;
  id: string;
  label: string;
  at: string;
  metadata?: Record<string, string | number>;
};

export type WorldDefinition = { id: string; name: string; description: string; chunks: string[]; cities: string[]; locations: string[] };
export type ChunkDefinition = { id: string; worldId: string; name: string; coordinates: ChunkCoordinates; data: Record<string, unknown>; locations: string[]; connections: string[] };
export type LocationDefinition = { id: string; chunkId: string; name: string; type: RpgLocationType; description: string; buildings: string[]; npcs: string[]; enemies: string[]; items: string[] };
export type CityDefinition = { id: string; locationId: string; name: string; description: string; buildings: string[]; npcs: string[]; shops: string[]; districts: Array<{ id: string; name: string }> };
export type BuildingDefinition = { id: string; locationId: string; name: string; type: BuildingType; interior: Record<string, unknown>; enterable: boolean; npcs: string[]; items: string[] };
export type DungeonDefinition = { id: string; locationId: string; name: string; description: string; floors: number; rooms: Array<{ id: string; name: string; type: string }>; enemies: string[]; items: string[]; boss: string | null; completed: boolean };
export type NpcDefinition = { id: string; name: string; locationId: string; role: NpcRole; personality: string[]; dialogue: string[]; relationships: Record<string, string>; knowledge: string[]; alive: boolean };
export type EnemyDefinition = { id: string; name: string; type: EnemyType; level: number; stats: Record<string, number>; loot: string[]; locations: string[] };
export type ItemDefinition = { id: string; name: string; type: ItemType; description: string; stats: Record<string, number | string> };
export type LoreDefinition = { id: string; title: string; text: string; category: string };
export type PlayerDefinition = { id: string; name: string; inventory: string[] };
export type RpgGameState = { world?: WorldCoreState; currentLocationId: string | null; currentChunkId: string | null; discoveredChunks: string[]; discoveredLocations: string[]; discoveredLore: string[]; enteredBuildings: string[]; completedDungeons: string[]; history: BrainHistoryEntry[]; tutorialStage?: TutorialStage; playerClass?: PlayerClass; playerLevel?: number };

export class RPGBrain {
  readonly worldCore = new WorldCore(DEFAULT_WORLD_SEED);
  readonly world: Record<string, WorldDefinition> = {};
  readonly chunks: Record<string, ChunkDefinition> = {};
  readonly locations: Record<string, LocationDefinition> = {};
  readonly cities: Record<string, CityDefinition> = {};
  readonly buildings: Record<string, BuildingDefinition> = {};
  readonly dungeons: Record<string, DungeonDefinition> = {};
  readonly npcs: Record<string, NpcDefinition> = {};
  readonly enemies: Record<string, EnemyDefinition> = {};
  readonly items: Record<string, ItemDefinition> = {};
  readonly lore: Record<string, LoreDefinition> = {};
  readonly travelGates: Record<string, TravelGateDefinition> = {};
  player: PlayerDefinition | null = null;
  tutorialStage: TutorialStage = 'wake_in_house';
  playerClass: PlayerClass = 'beginner';
  playerLevel = 1;
  currentLocationId: string | null = null;
  currentChunkId: string | null = null;
  readonly discoveredChunks = new Set<string>();
  readonly discoveredLocations = new Set<string>();
  readonly discoveredLore = new Set<string>();
  readonly enteredBuildings = new Set<string>();
  readonly completedDungeons = new Set<string>();
  readonly history: BrainHistoryEntry[] = [];

  private requireEntry<T>(collection: Record<string, T>, id: string, kind: string): T {
    const entry = collection[id];
    if (!entry) throw new Error('RPG brain: unknown ' + kind + ' "' + id + '"');
    return entry;
  }

  private record(type: HistoryType, id: string, label: string, metadata?: Record<string, string | number>) {
    this.history.unshift({ type, id, label, at: new Date().toISOString(), metadata });
    if (this.history.length > 100) this.history.length = 100;
  }

  createWorld(id: string, name: string, description: string) {
    const world = { id, name, description, chunks: [], cities: [], locations: [] };
    this.world[id] = world;
    return world;
  }

  addChunk(id: string, worldId: string, name: string, coordinates: ChunkCoordinates, data: Record<string, unknown> = {}) {
    const world = this.requireEntry(this.world, worldId, 'world');
    const chunk = { id, worldId, name, coordinates, data, locations: [], connections: [] };
    this.chunks[id] = chunk;
    if (!world.chunks.includes(id)) world.chunks.push(id);
    return chunk;
  }

  connectChunks(chunkA: string, chunkB: string) {
    const first = this.requireEntry(this.chunks, chunkA, 'chunk');
    const second = this.requireEntry(this.chunks, chunkB, 'chunk');
    if (!first.connections.includes(chunkB)) first.connections.push(chunkB);
    if (!second.connections.includes(chunkA)) second.connections.push(chunkA);
  }

  addLocation(id: string, chunkId: string, name: string, type: RpgLocationType, description = '') {
    const chunk = this.requireEntry(this.chunks, chunkId, 'chunk');
    const location = { id, chunkId, name, type, description, buildings: [], npcs: [], enemies: [], items: [] };
    this.locations[id] = location;
    if (!chunk.locations.includes(id)) chunk.locations.push(id);
    const world = this.requireEntry(this.world, chunk.worldId, 'world');
    if (!world.locations.includes(id)) world.locations.push(id);
    return location;
  }

  createCity(id: string, locationId: string, name: string, description = '') {
    const location = this.requireEntry(this.locations, locationId, 'location');
    const chunk = this.requireEntry(this.chunks, location.chunkId, 'chunk');
    const world = this.requireEntry(this.world, chunk.worldId, 'world');
    const city = { id, locationId, name, description, buildings: [], npcs: [], shops: [], districts: [] };
    this.cities[id] = city;
    location.type = 'town';
    if (!world.cities.includes(id)) world.cities.push(id);
    return city;
  }

  addCityDistrict(cityId: string, districtId: string, name: string) {
    const city = this.requireEntry(this.cities, cityId, 'city');
    if (!city.districts.some((district) => district.id === districtId)) city.districts.push({ id: districtId, name });
  }

  addBuilding(id: string, locationId: string, name: string, type: BuildingType, interior: Record<string, unknown> = {}, enterable = true) {
    const location = this.requireEntry(this.locations, locationId, 'location');
    const building = { id, locationId, name, type, interior, enterable, npcs: [], items: [] };
    this.buildings[id] = building;
    if (!location.buildings.includes(id)) location.buildings.push(id);
    const city = Object.values(this.cities).find((candidate) => candidate.locationId === locationId);
    if (city && !city.buildings.includes(id)) city.buildings.push(id);
    if (city && type === 'shop' && !city.shops.includes(id)) city.shops.push(id);
    return building;
  }

  enterBuilding(id: string) {
    const building = this.requireEntry(this.buildings, id, 'building');
    if (!building.enterable) return null;
    this.enteredBuildings.add(id);
    this.record('enter_building', id, building.name);
    return building.interior;
  }

  createDungeon(id: string, locationId: string, name: string, description = '', floors = 1) {
    this.requireEntry(this.locations, locationId, 'location');
    const dungeon = { id, locationId, name, description, floors, rooms: [], enemies: [], items: [], boss: null, completed: false };
    this.dungeons[id] = dungeon;
    return dungeon;
  }

  addDungeonRoom(dungeonId: string, roomId: string, name: string, type = 'normal') {
    const dungeon = this.requireEntry(this.dungeons, dungeonId, 'dungeon');
    dungeon.rooms.push({ id: roomId, name, type });
  }

  setDungeonBoss(dungeonId: string, enemyId: string) {
    const dungeon = this.requireEntry(this.dungeons, dungeonId, 'dungeon');
    this.requireEntry(this.enemies, enemyId, 'enemy');
    dungeon.boss = enemyId;
  }

  completeDungeon(id: string) {
    const dungeon = this.requireEntry(this.dungeons, id, 'dungeon');
    dungeon.completed = true;
    this.completedDungeons.add(id);
    this.record('dungeon_completed', id, dungeon.name);
  }

  addNpc(id: string, name: string, locationId: string, role: NpcRole = 'civilian', personality: string[] = [], dialogue: string[] = []) {
    const location = this.requireEntry(this.locations, locationId, 'location');
    const npc = { id, name, locationId, role, personality, dialogue, relationships: {}, knowledge: [], alive: true };
    this.npcs[id] = npc;
    if (!location.npcs.includes(id)) location.npcs.push(id);
    const city = Object.values(this.cities).find((candidate) => candidate.locationId === locationId);
    if (city && !city.npcs.includes(id)) city.npcs.push(id);
    return npc;
  }

  addEnemy(id: string, name: string, type: EnemyType, level: number, stats: Record<string, number> = {}) {
    const enemy = { id, name, type, level, stats, loot: [], locations: [] };
    this.enemies[id] = enemy;
    return enemy;
  }

  placeEnemy(enemyId: string, locationId: string) {
    const enemy = this.requireEntry(this.enemies, enemyId, 'enemy');
    const location = this.requireEntry(this.locations, locationId, 'location');
    if (!enemy.locations.includes(locationId)) enemy.locations.push(locationId);
    if (!location.enemies.includes(enemyId)) location.enemies.push(enemyId);
  }

  addItem(id: string, name: string, type: ItemType, description = '', stats: Record<string, number | string> = {}) {
    const item = { id, name, type, description, stats };
    this.items[id] = item;
    return item;
  }

  addLore(id: string, title: string, text: string, category = 'world') {
    const entry = { id, title, text, category };
    this.lore[id] = entry;
    return entry;
  }

  discoverLore(id: string) {
    const entry = this.requireEntry(this.lore, id, 'lore entry');
    this.discoveredLore.add(id);
    this.record('lore_discovered', id, entry.title);
  }

  connectNpcToBuilding(npcId: string, buildingId: string) {
    const building = this.requireEntry(this.buildings, buildingId, 'building');
    this.requireEntry(this.npcs, npcId, 'NPC');
    if (!building.npcs.includes(npcId)) building.npcs.push(npcId);
  }

  connectItemToBuilding(itemId: string, buildingId: string) {
    const building = this.requireEntry(this.buildings, buildingId, 'building');
    this.requireEntry(this.items, itemId, 'item');
    if (!building.items.includes(itemId)) building.items.push(itemId);
  }

  connectItemToEnemy(itemId: string, enemyId: string) {
    const enemy = this.requireEntry(this.enemies, enemyId, 'enemy');
    this.requireEntry(this.items, itemId, 'item');
    if (!enemy.loot.includes(itemId)) enemy.loot.push(itemId);
  }

  connectEnemyToDungeon(enemyId: string, dungeonId: string) {
    const dungeon = this.requireEntry(this.dungeons, dungeonId, 'dungeon');
    this.requireEntry(this.enemies, enemyId, 'enemy');
    if (!dungeon.enemies.includes(enemyId)) dungeon.enemies.push(enemyId);
  }

  addTravelGate(id: string, fromChunkId: string, toChunkId: string, direction: TravelDirection, label: string, requirement?: TravelGateRequirement) {
    const from = this.requireEntry(this.chunks, fromChunkId, 'source chunk');
    const to = this.requireEntry(this.chunks, toChunkId, 'destination chunk');
    const gate = { id, fromChunkId: from.id, toChunkId: to.id, direction, label, requirement };
    this.travelGates[id] = gate;
    if (!from.connections.includes(to.id)) from.connections.push(to.id);
    if (!to.connections.includes(from.id)) to.connections.push(from.id);
    return gate;
  }

  getTravelGatesFrom(chunkId = this.currentChunkId) {
    if (!chunkId) return [];
    return Object.values(this.travelGates).filter((gate) => gate.fromChunkId === chunkId);
  }

  canUseTravelGate(id: string) {
    const gate = this.requireEntry(this.travelGates, id, 'travel gate');
    if (gate.fromChunkId !== this.currentChunkId) return false;
    if (gate.requirement?.minLevel && this.playerLevel < gate.requirement.minLevel) return false;
    if (gate.requirement?.requiresClass && this.playerClass === 'beginner') return false;
    return true;
  }

  advanceTutorial(stage: TutorialStage) {
    const currentIndex = ADVENTURE_STARTING_LOOP.findIndex((step) => step.stage === this.tutorialStage);
    const nextIndex = ADVENTURE_STARTING_LOOP.findIndex((step) => step.stage === stage);
    if (nextIndex < 0 || nextIndex < currentIndex) return false;
    this.tutorialStage = stage;
    return true;
  }

  setPlayerLevel(level: number) {
    this.playerLevel = Math.max(1, Math.floor(level));
    if (this.playerLevel >= 10 && this.tutorialStage === 'hunt_goats') this.advanceTutorial('choose_class');
  }

  chooseClass(playerClass: Exclude<PlayerClass, 'beginner'>) {
    if (this.playerLevel < 10 || this.tutorialStage !== 'choose_class') return false;
    this.playerClass = playerClass;
    this.tutorialStage = 'leave_tutorial_island';
    this.record('class_chosen', playerClass, playerClass + ' class chosen');
    return true;
  }

  movePlayer(locationId: string) {
    const location = this.locations[locationId];
    if (!location) return false;
    this.currentLocationId = locationId;
    this.currentChunkId = location.chunkId;
    this.discoveredLocations.add(locationId);
    this.discoveredChunks.add(location.chunkId);
    this.record('travel', locationId, location.name);
    return true;
  }

  visitChunk(coordinates: ChunkCoordinates, name: string, direction = 'travel') {
    const existing = Object.values(this.chunks).find((chunk) => chunk.coordinates.x === coordinates.x && chunk.coordinates.y === coordinates.y);
    const chunk = existing || this.addChunk('chunk-' + coordinates.x + '-' + coordinates.y, 'eldoria', name, coordinates);
    this.currentChunkId = chunk.id;
    this.discoveredChunks.add(chunk.id);
    this.record('travel', chunk.id, name, { x: coordinates.x, y: coordinates.y, direction });
  }

  inspectCurrentLocation() {
    return this.currentLocationId ? this.locations[this.currentLocationId] || null : null;
  }

  getBuildingsHere() { return this.inspectCurrentLocation()?.buildings.map((id) => this.buildings[id]).filter(Boolean) || []; }
  getNpcsHere() { return this.inspectCurrentLocation()?.npcs.map((id) => this.npcs[id]).filter((npc) => npc && npc.alive) || []; }
  getEnemiesHere() { return this.inspectCurrentLocation()?.enemies.map((id) => this.enemies[id]).filter(Boolean) || []; }

  getGameState(): RpgGameState {
    return {
      world: this.worldCore.getState(),
      currentLocationId: this.currentLocationId,
      currentChunkId: this.currentChunkId,
      discoveredChunks: [...this.discoveredChunks].sort(),
      discoveredLocations: [...this.discoveredLocations].sort(),
      discoveredLore: [...this.discoveredLore].sort(),
      enteredBuildings: [...this.enteredBuildings].sort(),
      completedDungeons: [...this.completedDungeons].sort(),
      tutorialStage: this.tutorialStage,
      playerClass: this.playerClass,
      playerLevel: this.playerLevel,
      history: this.history.map((entry) => ({ ...entry, metadata: entry.metadata ? { ...entry.metadata } : undefined })),
    };
  }

  loadGameState(state: RpgGameState) {
    if (state.world) this.worldCore.loadState(state.world);
    this.currentLocationId = state.currentLocationId && this.locations[state.currentLocationId] ? state.currentLocationId : null;
    this.currentChunkId = state.currentChunkId && this.chunks[state.currentChunkId] ? state.currentChunkId : null;
    this.replaceSet(this.discoveredChunks, state.discoveredChunks, this.chunks);
    this.replaceSet(this.discoveredLocations, state.discoveredLocations, this.locations);
    this.replaceSet(this.discoveredLore, state.discoveredLore, this.lore);
    this.replaceSet(this.enteredBuildings, state.enteredBuildings, this.buildings);
    this.replaceSet(this.completedDungeons, state.completedDungeons, this.dungeons);
    this.tutorialStage = state.tutorialStage || 'wake_in_house';
    this.playerClass = state.playerClass || 'beginner';
    this.playerLevel = Math.max(1, Math.floor(state.playerLevel || 1));
    this.history.splice(0, this.history.length, ...state.history.slice(0, 100));
  }

  private replaceSet<T>(target: Set<string>, values: string[], known: Record<string, T>) {
    target.clear();
    values.filter((id) => Boolean(known[id])).forEach((id) => target.add(id));
  }

  validateContent() {
    const issues: string[] = [];
    Object.values(this.chunks).forEach((chunk) => {
      if (!this.world[chunk.worldId]) issues.push('Chunk ' + chunk.id + ' references missing world ' + chunk.worldId);
      chunk.connections.forEach((id) => { if (!this.chunks[id]) issues.push('Chunk ' + chunk.id + ' references missing connection ' + id); });
    });
    Object.values(this.locations).forEach((location) => {
      if (!this.chunks[location.chunkId]) issues.push('Location ' + location.id + ' references missing chunk ' + location.chunkId);
      location.buildings.forEach((id) => { if (!this.buildings[id]) issues.push('Location ' + location.id + ' references missing building ' + id); });
      location.npcs.forEach((id) => { if (!this.npcs[id]) issues.push('Location ' + location.id + ' references missing NPC ' + id); });
      location.enemies.forEach((id) => { if (!this.enemies[id]) issues.push('Location ' + location.id + ' references missing enemy ' + id); });
    });
    Object.values(this.dungeons).forEach((dungeon) => {
      if (!this.locations[dungeon.locationId]) issues.push('Dungeon ' + dungeon.id + ' references missing location ' + dungeon.locationId);
      dungeon.enemies.forEach((id) => { if (!this.enemies[id]) issues.push('Dungeon ' + dungeon.id + ' references missing enemy ' + id); });
      if (dungeon.boss && !this.enemies[dungeon.boss]) issues.push('Dungeon ' + dungeon.id + ' references missing boss ' + dungeon.boss);
    });
    return issues;
  }
}

export function createAdventureBrain(): RPGBrain {
  const brain = new RPGBrain();
  brain.player = { id: 'player', name: 'Wanderer', inventory: [] };
  brain.createWorld('eldoria', 'Eldoria', 'A living realm of crossings, wild reaches, old ruins, and stories still waiting to connect.');
  brain.addChunk('greenvale-4-7', 'eldoria', 'Greenvale', { x: 4, y: 7 }, { region: 'greenvale', terrain: 'meadow' });
  brain.addChunk('brackenfen-gate-3-7', 'eldoria', 'Brackenfen Gate', { x: 3, y: 7 }, { region: 'brackenfen', terrain: 'woodland' });
  brain.addChunk('ironwood-gate-5-7', 'eldoria', 'Ironwood Gate', { x: 5, y: 7 }, { region: 'ironwood', terrain: 'woodland' });
  brain.addChunk('northwatch-foothills-4-6', 'eldoria', 'Northwatch Foothills', { x: 4, y: 6 }, { region: 'northwatch', terrain: 'rock' });
  brain.addChunk('sunwash-foothills-4-8', 'eldoria', 'Sunwash Foothills', { x: 4, y: 8 }, { region: 'sunwash', terrain: 'meadow' });
  brain.connectChunks('greenvale-4-7', 'brackenfen-gate-3-7');
  brain.connectChunks('greenvale-4-7', 'ironwood-gate-5-7');
  brain.connectChunks('greenvale-4-7', 'northwatch-foothills-4-6');
  brain.connectChunks('greenvale-4-7', 'sunwash-foothills-4-8');
  const tutorialExitRequirement = { minLevel: 10, requiresClass: true };
  brain.addTravelGate('tutorial-road-west', 'greenvale-4-7', 'brackenfen-gate-3-7', 'west', 'Brackenfen Road', tutorialExitRequirement);
  brain.addTravelGate('tutorial-road-east', 'greenvale-4-7', 'ironwood-gate-5-7', 'east', 'Ironwood Road', tutorialExitRequirement);
  brain.addTravelGate('tutorial-road-north', 'greenvale-4-7', 'northwatch-foothills-4-6', 'north', 'Northwatch Road', tutorialExitRequirement);
  brain.addTravelGate('tutorial-road-south', 'greenvale-4-7', 'sunwash-foothills-4-8', 'south', 'Sunwash Road', tutorialExitRequirement);
  brain.addLocation('mosslight-crossing', 'greenvale-4-7', 'Mosslight Crossing', 'town', 'A four-way town at the heart of Greenvale, where every road points toward another story.');
  brain.createCity('mosslight-crossing-city', 'mosslight-crossing', 'Mosslight Crossing', 'A welcoming crossroads with quiet corners, teaching halls, and an old fountain.');
  brain.addCityDistrict('mosslight-crossing-city', 'crossroads-square', 'Crossroads Square');
  brain.addCityDistrict('mosslight-crossing-city', 'lantern-row', 'Lantern Row');
  brain.addBuilding('mosslight-inn', 'mosslight-crossing', 'The Mosslight Inn', 'inn', { floors: 2, keeper: 'mira' });
  brain.addBuilding('wayfarer-guild', 'mosslight-crossing', 'Wayfarer Guild', 'guild', { noticeboard: true });
  brain.addNpc('mira', 'Mira', 'mosslight-crossing', 'merchant', ['observant', 'warm'], ['The roads remember who travels them.']);
  brain.addNpc('noah', 'Noah', 'mosslight-crossing', 'mage', ['patient', 'curious'], ['Magic is easier to learn when you know what you are protecting.']);
  brain.addNpc('damon', 'Damon', 'mosslight-crossing', 'warrior', ['direct', 'steadfast'], ['A clear road is useful. A prepared traveler is better.']);
  brain.addNpc('shawn', 'Shawn', 'mosslight-crossing', 'rogue', ['quiet', 'clever'], ['The interesting paths are rarely the loudest ones.']);
  brain.connectNpcToBuilding('mira', 'mosslight-inn');
  brain.addItem('mosslight-lantern', 'Mosslight Lantern', 'quest', 'A lantern whose glow strengthens near old Greenvale markers.');
  brain.addItem('wayfarer-token', 'Wayfarer Token', 'key', 'A simple brass token accepted by the guild at the crossroads.');
  brain.connectItemToBuilding('wayfarer-token', 'wayfarer-guild');
  brain.addLore('greenvale-crossroads', 'The Four Roads', 'Mosslight Crossing was built where four old routes meet, long before the present borders were drawn.', 'history');
  brain.addLocation('rootbound-cellar', 'greenvale-4-7', 'Rootbound Cellar', 'dungeon', 'A sealed cellar beneath the town, where roots have broken through stone and something still stirs below.');
  brain.createDungeon('rootbound-cellar-dungeon', 'rootbound-cellar', 'Rootbound Cellar', 'A small first dungeon beneath Mosslight Crossing.', 1);
  brain.addDungeonRoom('rootbound-cellar-dungeon', 'cellar-entry', 'Collapsed Entry', 'entrance');
  brain.addDungeonRoom('rootbound-cellar-dungeon', 'root-chamber', 'Root Chamber', 'boss');
  brain.addEnemy('mire-wisp', 'Mire Wisp', 'elemental', 1, { health: 18, power: 4 });
  brain.addEnemy('rootbound-warden', 'Rootbound Warden', 'boss', 3, { health: 72, power: 10 });
  brain.placeEnemy('mire-wisp', 'rootbound-cellar');
  brain.placeEnemy('rootbound-warden', 'rootbound-cellar');
  brain.connectEnemyToDungeon('mire-wisp', 'rootbound-cellar-dungeon');
  brain.connectEnemyToDungeon('rootbound-warden', 'rootbound-cellar-dungeon');
  brain.setDungeonBoss('rootbound-cellar-dungeon', 'rootbound-warden');
  brain.connectItemToEnemy('mosslight-lantern', 'rootbound-warden');
  brain.movePlayer('mosslight-crossing');
  return brain;
}
