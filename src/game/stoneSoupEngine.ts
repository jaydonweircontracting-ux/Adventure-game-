export type TileKind =
  | "wall"
  | "floor"
  | "door"
  | "stairs"
  | "altar"
  | "water"
  | "lava";

export type ItemKind = "weapon" | "armor" | "potion" | "scroll" | "food" | "relic";

export type SpellId = "ember-bolt" | "blink" | "frost-ward";

export type GamePhase = "playing" | "victory" | "defeat";

export interface Tile {
  x: number;
  y: number;
  kind: TileKind;
  seen: boolean;
  visible: boolean;
}

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  glyph: string;
  color: string;
  description: string;
  value?: number;
  amount?: number;
}

export interface GroundItem extends Item {
  x: number;
  y: number;
}

export interface Monster {
  id: string;
  name: string;
  glyph: string;
  color: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  armor: number;
  xp: number;
  kind: "beast" | "undead" | "cultist" | "guardian";
  asleep?: boolean;
}

export interface Player {
  name: string;
  species: string;
  background: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  nextXp: number;
  level: number;
  strength: number;
  intellect: number;
  agility: number;
  armor: number;
  gold: number;
  kills: number;
  inventory: Item[];
  spells: SpellId[];
  statuses: string[];
}

export interface GameState {
  width: number;
  height: number;
  tiles: Tile[][];
  player: Player;
  monsters: Monster[];
  groundItems: GroundItem[];
  floor: number;
  turn: number;
  phase: GamePhase;
  seed: number;
  log: string[];
  lastAction: string;
}

export const spellBook: Record<
  SpellId,
  { name: string; cost: number; glyph: string; description: string; color: string }
> = {
  "ember-bolt": {
    name: "Ember Bolt",
    cost: 3,
    glyph: "✦",
    description: "A searing mote that strikes the nearest foe in your sight.",
    color: "#ff9b63",
  },
  blink: {
    name: "Veil Step",
    cost: 5,
    glyph: "◇",
    description: "Slip through the veil to a nearby safe tile.",
    color: "#9dc7ff",
  },
  "frost-ward": {
    name: "Frost Ward",
    cost: 4,
    glyph: "❈",
    description: "Harden your skin with rime. Gain armor until your next wound.",
    color: "#a8e8ff",
  },
};

const species = [
  { name: "Ashen Human", hp: 30, mp: 10, strength: 7, intellect: 6, agility: 6 },
  { name: "Mossling", hp: 36, mp: 7, strength: 8, intellect: 4, agility: 5 },
  { name: "Cinder Elf", hp: 24, mp: 15, strength: 5, intellect: 9, agility: 7 },
];

const backgrounds = [
  { name: "Wayfarer", armor: 2, gold: 18, spells: ["ember-bolt"] as SpellId[] },
  { name: "Grave Scholar", armor: 1, gold: 12, spells: ["ember-bolt", "frost-ward"] as SpellId[] },
  { name: "Vault Runner", armor: 3, gold: 24, spells: ["blink"] as SpellId[] },
];

class Random {
  private value: number;

  constructor(seed: number) {
    this.value = seed || 1;
  }

  next() {
    this.value = (this.value * 1664525 + 1013904223) >>> 0;
    return this.value / 4294967296;
  }

  int(min: number, max: number) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(array: T[]) {
    return array[Math.floor(this.next() * array.length)];
  }
}

const key = (x: number, y: number) => `${x}:${y}`;

function blankMap(width: number, height: number): Tile[][] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x,
      y,
      kind: "wall" as TileKind,
      seen: false,
      visible: false,
    })),
  );
}

function carveRoom(tiles: Tile[][], x: number, y: number, width: number, height: number) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      if (tiles[row]?.[column]) tiles[row][column].kind = "floor";
    }
  }
}

function carveCorridor(tiles: Tile[][], fromX: number, fromY: number, toX: number, toY: number) {
  let x = fromX;
  let y = fromY;
  while (x !== toX) {
    tiles[y][x].kind = "floor";
    x += x < toX ? 1 : -1;
  }
  while (y !== toY) {
    tiles[y][x].kind = "floor";
    y += y < toY ? 1 : -1;
  }
  tiles[y][x].kind = "floor";
}

function makeMap(width: number, height: number, random: Random, floor: number) {
  const tiles = blankMap(width, height);
  const rooms = [
    { x: 2, y: 2, width: 8, height: 5 },
    { x: 13, y: 2, width: 9, height: 6 },
    { x: 24, y: 3, width: 5, height: 5 },
    { x: 4, y: 11, width: 10, height: 5 },
    { x: 18, y: 11, width: 10, height: 5 },
  ];

  rooms.forEach((room) => carveRoom(tiles, room.x, room.y, room.width, room.height));
  for (let index = 0; index < rooms.length - 1; index += 1) {
    const current = rooms[index];
    const next = rooms[index + 1];
    carveCorridor(
      tiles,
      current.x + Math.floor(current.width / 2),
      current.y + Math.floor(current.height / 2),
      next.x + Math.floor(next.width / 2),
      next.y + Math.floor(next.height / 2),
    );
  }

  tiles[8][15].kind = "door";
  tiles[10][15].kind = "water";
  tiles[10][16].kind = "water";
  tiles[10][17].kind = "water";
  if (floor >= 3) {
    tiles[13][22].kind = "lava";
    tiles[13][23].kind = "lava";
  }
  tiles[14][25].kind = "stairs";
  tiles[4][26].kind = floor >= 3 ? "altar" : "floor";

  return tiles.map((row) =>
    row.map((tile) => ({ ...tile, kind: tile.kind === "floor" && random.next() < 0.025 ? "door" : tile.kind })),
  );
}

function canStand(state: Pick<GameState, "tiles" | "monsters" | "player" | "groundItems">, x: number, y: number) {
  const tile = state.tiles[y]?.[x];
  if (!tile || tile.kind === "wall" || tile.kind === "lava") return false;
  if (state.monsters.some((monster) => monster.x === x && monster.y === y)) return false;
  if (state.player.x === x && state.player.y === y) return false;
  return true;
}

function revealAround(state: GameState) {
  for (const row of state.tiles) {
    for (const tile of row) tile.visible = false;
  }
  const radius = 6;
  for (let y = state.player.y - radius; y <= state.player.y + radius; y += 1) {
    for (let x = state.player.x - radius; x <= state.player.x + radius; x += 1) {
      const tile = state.tiles[y]?.[x];
      if (!tile) continue;
      if (Math.abs(x - state.player.x) + Math.abs(y - state.player.y) <= radius + 1) {
        tile.visible = true;
        tile.seen = true;
      }
    }
  }
}

function addLog(state: GameState, message: string) {
  state.log = [message, ...state.log].slice(0, 9);
  state.lastAction = message;
}

function makeMonster(random: Random, floor: number, x: number, y: number, index: number): Monster {
  const entries = [
    { name: "Cave Stalker", glyph: "s", color: "#d18d70", hp: 8, attack: 4, armor: 1, xp: 9, kind: "beast" as const },
    { name: "Bone Scribe", glyph: "b", color: "#e2d7b2", hp: 11, attack: 5, armor: 2, xp: 13, kind: "undead" as const },
    { name: "Ash Cultist", glyph: "c", color: "#d96b60", hp: 13, attack: 6, armor: 1, xp: 16, kind: "cultist" as const },
    { name: "Vault Warden", glyph: "W", color: "#f0ba68", hp: 21, attack: 8, armor: 3, xp: 30, kind: "guardian" as const },
  ];
  const entry = entries[Math.min(entries.length - 1, random.int(0, floor > 2 ? 3 : 2))];
  const multiplier = 1 + (floor - 1) * 0.18;
  return {
    id: `monster-${floor}-${index}`,
    ...entry,
    x,
    y,
    hp: Math.round(entry.hp * multiplier),
    maxHp: Math.round(entry.hp * multiplier),
    attack: Math.round(entry.attack * multiplier),
    asleep: random.next() < 0.4,
  };
}

function makeGroundItems(random: Random, floor: number, tiles: Tile[][]): GroundItem[] {
  const spots = [
    [7, 4],
    [17, 5],
    [26, 5],
    [9, 13],
    [22, 14],
  ];
  const names = [
    {
      name: "Vermilion potion",
      kind: "potion" as const,
      glyph: "!",
      color: "#ef756b",
      description: "Restore 10 health.",
      value: 10,
    },
    {
      name: "Scroll of Recall",
      kind: "scroll" as const,
      glyph: "?",
      color: "#c9a7ff",
      description: "A brittle route out of danger. Restores 5 mana.",
      value: 5,
    },
    {
      name: "Iron ration",
      kind: "food" as const,
      glyph: "%",
      color: "#d9b67a",
      description: "A dense meal. Restore 6 health.",
      value: 6,
    },
    {
      name: "Shard of the First Flame",
      kind: "relic" as const,
      glyph: "*",
      color: "#ffbd72",
      description: "A warm relic that hums with the vault's heartbeat.",
      value: 0,
    },
  ];
  return spots
    .filter(([x, y]) => Boolean(tiles[y]?.[x]) && tiles[y][x].kind !== "wall")
    .map(([x, y], index) => {
      const template = names[(index + floor - 1) % names.length];
      return {
        id: `item-${floor}-${index}`,
        ...template,
        x,
        y,
      };
    });
}

export function createGame(seed = Math.floor(Date.now() % 1000000000), speciesIndex = 0, backgroundIndex = 0): GameState {
  const random = new Random(seed);
  const width = 31;
  const height = 19;
  const floor = 1;
  const tiles = makeMap(width, height, random, floor);
  const chosenSpecies = species[speciesIndex] ?? species[0];
  const chosenBackground = backgrounds[backgroundIndex] ?? backgrounds[0];
  const player: Player = {
    name: "Mira of the Ember Road",
    species: chosenSpecies.name,
    background: chosenBackground.name,
    x: 5,
    y: 4,
    hp: chosenSpecies.hp,
    maxHp: chosenSpecies.hp,
    mp: chosenSpecies.mp,
    maxMp: chosenSpecies.mp,
    xp: 0,
    nextXp: 30,
    level: 1,
    strength: chosenSpecies.strength,
    intellect: chosenSpecies.intellect,
    agility: chosenSpecies.agility,
    armor: chosenBackground.armor,
    gold: chosenBackground.gold,
    kills: 0,
    inventory: [
      {
        id: "starter-ration",
        name: "Iron ration",
        kind: "food",
        glyph: "%",
        color: "#d9b67a",
        description: "A dense meal. Restore 6 health.",
        value: 6,
      },
    ],
    spells: chosenBackground.spells,
    statuses: [],
  };
  const monsters = [
    makeMonster(random, floor, 17, 5, 0),
    makeMonster(random, floor, 26, 5, 1),
    makeMonster(random, floor, 8, 13, 2),
    makeMonster(random, floor, 21, 14, 3),
  ];
  const state: GameState = {
    width,
    height,
    tiles,
    player,
    monsters,
    groundItems: makeGroundItems(random, floor, tiles),
    floor,
    turn: 1,
    phase: "playing",
    seed,
    log: [
      "The stairwell exhales a breath of hot iron.",
      "The Ember Vault waits below. Every step spends a little of your luck.",
    ],
    lastAction: "You enter the first gallery.",
  };
  revealAround(state);
  return state;
}

function gainXp(state: GameState, amount: number) {
  state.player.xp += amount;
  if (state.player.xp >= state.player.nextXp) {
    state.player.xp -= state.player.nextXp;
    state.player.level += 1;
    state.player.nextXp = Math.round(state.player.nextXp * 1.35);
    state.player.maxHp += 4;
    state.player.hp = state.player.maxHp;
    state.player.maxMp += 2;
    state.player.mp = state.player.maxMp;
    state.player.strength += 1;
    state.player.intellect += 1;
    addLog(state, `You reach level ${state.player.level}. Vitality surges through you.`);
  }
}

function enemyTurn(state: GameState) {
  const player = state.player;
  for (const monster of state.monsters) {
    if (monster.hp <= 0) continue;
    const distance = Math.abs(monster.x - player.x) + Math.abs(monster.y - player.y);
    if (distance === 1) {
      const damage = Math.max(1, monster.attack - Math.floor(player.armor * 0.65));
      player.hp = Math.max(0, player.hp - damage);
      player.statuses = player.statuses.filter((status) => status !== "Frost Ward");
      addLog(state, `${monster.name} strikes you for ${damage}.`);
      if (player.hp === 0) {
        state.phase = "defeat";
        addLog(state, "Your light gutters out beneath the stone.");
        return;
      }
      continue;
    }
    if (distance > 7 || (monster.asleep && distance > 2)) continue;
    const dx = Math.sign(player.x - monster.x);
    const dy = Math.sign(player.y - monster.y);
    const options = Math.abs(player.x - monster.x) >= Math.abs(player.y - monster.y) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
    for (const [stepX, stepY] of options) {
      if (stepX === 0 && stepY === 0) continue;
      const nextX = monster.x + stepX;
      const nextY = monster.y + stepY;
      const occupied = state.monsters.some((other) => other.id !== monster.id && other.x === nextX && other.y === nextY);
      if (canStand(state, nextX, nextY) && !occupied) {
        monster.x = nextX;
        monster.y = nextY;
        monster.asleep = false;
        break;
      }
    }
  }
}

function finishTurn(state: GameState) {
  if (state.phase !== "playing") return;
  state.turn += 1;
  enemyTurn(state);
  revealAround(state);
}

export function step(state: GameState, dx: number, dy: number) {
  if (state.phase !== "playing") return state;
  const targetX = state.player.x + dx;
  const targetY = state.player.y + dy;
  const monster = state.monsters.find((entry) => entry.x === targetX && entry.y === targetY && entry.hp > 0);
  if (monster) {
    const damage = Math.max(1, state.player.strength + state.player.level - monster.armor);
    monster.hp = Math.max(0, monster.hp - damage);
    monster.asleep = false;
    addLog(state, `You hit ${monster.name} for ${damage}.`);
    if (monster.hp === 0) {
      state.player.kills += 1;
      gainXp(state, monster.xp);
      state.player.gold += 2 + state.floor;
      addLog(state, `${monster.name} falls. You find ${2 + state.floor} gold in the dust.`);
    }
    finishTurn(state);
    return state;
  }
  if (!canStand(state, targetX, targetY)) {
    addLog(state, "The stone refuses your passage.");
    return state;
  }
  state.player.x = targetX;
  state.player.y = targetY;
  const tile = state.tiles[targetY][targetX];
  if (tile.kind === "stairs") addLog(state, "A stair descends into a deeper ember-lit gallery.");
  else if (tile.kind === "altar") addLog(state, "The old altar watches without blessing you.");
  else if (tile.kind === "water") addLog(state, "Cold underground water curls around your boots.");
  else addLog(state, "You move through the hush.");
  const item = state.groundItems.find((entry) => entry.x === targetX && entry.y === targetY);
  if (item) addLog(state, `You see ${item.name} here. Press E to collect it.`);
  finishTurn(state);
  return state;
}

export function waitTurn(state: GameState) {
  if (state.phase !== "playing") return state;
  addLog(state, "You hold your ground and listen.");
  finishTurn(state);
  return state;
}

export function collectItem(state: GameState) {
  const index = state.groundItems.findIndex((entry) => entry.x === state.player.x && entry.y === state.player.y);
  if (index === -1) {
    addLog(state, "There is nothing here to collect.");
    return state;
  }
  const [item] = state.groundItems.splice(index, 1);
  const { x: _x, y: _y, ...inventoryItem } = item;
  state.player.inventory.push(inventoryItem);
  if (item.kind === "relic") {
    addLog(state, "The First Flame shard settles into your pack. The vault notices.");
  } else {
    addLog(state, `You collect ${item.name}.`);
  }
  finishTurn(state);
  return state;
}

export function useInventoryItem(state: GameState, itemId?: string) {
  const index = state.player.inventory.findIndex((item) => item.id === itemId);
  if (index === -1) return state;
  const item = state.player.inventory[index];
  if (item.kind !== "potion" && item.kind !== "food" && item.kind !== "scroll") {
    addLog(state, `${item.name} is not usable right now.`);
    return state;
  }
  state.player.inventory.splice(index, 1);
  if (item.kind === "potion" || item.kind === "food") {
    const amount = item.value ?? 5;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
    addLog(state, `You consume ${item.name} and recover ${amount} health.`);
  } else {
    const amount = item.value ?? 5;
    state.player.mp = Math.min(state.player.maxMp, state.player.mp + amount);
    addLog(state, `You read ${item.name}. ${amount} mana returns.`);
  }
  finishTurn(state);
  return state;
}

export function castSpell(state: GameState, spellId: SpellId) {
  if (state.phase !== "playing") return state;
  const spell = spellBook[spellId];
  if (!state.player.spells.includes(spellId)) return state;
  if (state.player.mp < spell.cost) {
    addLog(state, "You do not have enough mana.");
    return state;
  }
  state.player.mp -= spell.cost;
  if (spellId === "ember-bolt") {
    const target = state.monsters
      .filter((monster) => monster.hp > 0 && Math.abs(monster.x - state.player.x) + Math.abs(monster.y - state.player.y) <= 6)
      .sort((a, b) => Math.abs(a.x - state.player.x) + Math.abs(a.y - state.player.y) - (Math.abs(b.x - state.player.x) + Math.abs(b.y - state.player.y)))[0];
    if (!target) {
      addLog(state, "The ember bolt fizzles. No enemy answers your call.");
      state.player.mp += spell.cost;
      return state;
    }
    const damage = 7 + state.player.intellect;
    target.hp = Math.max(0, target.hp - damage);
    target.asleep = false;
    addLog(state, `Ember Bolt scorches ${target.name} for ${damage}.`);
    if (target.hp === 0) {
      state.player.kills += 1;
      gainXp(state, target.xp);
      addLog(state, `${target.name} dissolves into sparks.`);
    }
  } else if (spellId === "blink") {
    const candidates = [
      [state.player.x + 2, state.player.y],
      [state.player.x - 2, state.player.y],
      [state.player.x, state.player.y + 2],
      [state.player.x, state.player.y - 2],
    ].filter(([x, y]) => canStand(state, x, y));
    const destination = candidates[0];
    if (!destination) {
      addLog(state, "The veil has no safe fold nearby.");
      state.player.mp += spell.cost;
      return state;
    }
    state.player.x = destination[0];
    state.player.y = destination[1];
    addLog(state, "You step sideways through the veil.");
  } else {
    state.player.armor += 3;
    state.player.statuses = ["Frost Ward"];
    addLog(state, "Rime locks over your skin. You feel briefly unbreakable.");
  }
  finishTurn(state);
  return state;
}

export function descend(state: GameState) {
  const tile = state.tiles[state.player.y][state.player.x];
  if (tile.kind !== "stairs") {
    addLog(state, "There is no stair beneath your feet.");
    return state;
  }
  state.floor += 1;
  const random = new Random(state.seed + state.floor * 7919);
  state.tiles = makeMap(state.width, state.height, random, state.floor);
  state.player.x = 5;
  state.player.y = 4;
  state.monsters = Array.from({ length: 4 + Math.min(3, state.floor) }, (_, index) => {
    const positions = [[17, 5], [26, 5], [8, 13], [21, 14], [20, 4], [25, 14], [11, 14]];
    const [x, y] = positions[index];
    return makeMonster(random, state.floor, x, y, index);
  });
  state.groundItems = makeGroundItems(random, state.floor, state.tiles);
  addLog(state, `You descend to depth ${state.floor}. The walls glow from within.`);
  finishTurn(state);
  return state;
}

export function tryOpenVault(state: GameState) {
  const hasRelic = state.player.inventory.some((item) => item.kind === "relic");
  if (state.floor >= 3 && hasRelic && state.player.x >= 23 && state.player.y <= 7) {
    state.phase = "victory";
    addLog(state, "The Ember Vault opens. You have carried the First Flame home.");
  } else {
    addLog(state, "The sealed vault rejects you. Something is still missing.");
  }
  return state;
}

export function getItemAtPlayer(state: GameState) {
  return state.groundItems.find((entry) => entry.x === state.player.x && entry.y === state.player.y);
}

export function getSpeciesOptions() {
  return species.map(({ name, hp, mp, strength, intellect, agility }) => ({
    name,
    hp,
    mp,
    strength,
    intellect,
    agility,
  }));
}

export function getBackgroundOptions() {
  return backgrounds.map(({ name, armor, gold, spells: backgroundSpells }) => ({
    name,
    armor,
    gold,
    spells: backgroundSpells,
  }));
}
