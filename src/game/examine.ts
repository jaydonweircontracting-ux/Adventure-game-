// RuneScape-inspired EXAMINE system (BUILD 374).
//
// Additive by design: nothing here changes world gen, chunks, movement,
// NPC simulation, buildings, map, or rendering. It gives meaningful world
// entities an identity + description, generated deterministically from the
// same seeds that placed them, so examine data survives chunk unload/reload
// for free (no storage needed for generated scenery).
//
// Fallback hierarchy (never undefined/null/empty):
//   1. explicit authored text
//   2. generated description from entity metadata + context
//   3. biome-aware description
//   4. material-aware description
//   5. generic safe fallback
import { mulberry32 } from './groundDetail';

export type ExamineKind =
  | 'tree' | 'rock' | 'building' | 'door' | 'npc' | 'item'
  | 'monster' | 'furniture' | 'scenery' | 'road' | 'water'
  | 'plant' | 'player' | 'stall' | 'sign';

export interface ExamineContext {
  biome?: string;
  terrain?: string;
  age?: 'young' | 'mature' | 'old' | 'ancient' | 'dead';
  condition?: 'pristine' | 'worn' | 'damaged' | 'ruined';
  material?: string;
  nearRoad?: boolean;
  nearVillage?: boolean;
  nearWater?: boolean;
  nearRuins?: boolean;
  season?: string;
  role?: string;
  archetype?: string;
  activity?: string;
  personality?: string;
  ageBracket?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'legendary';
  level?: number;
  buildingType?: string;
  townName?: string;
  itemType?: string;
}

/** A reference to something the player can examine. */
export interface ExamineRef {
  kind: ExamineKind;
  /** Deterministic entity id, e.g. `tree-4-7-12` or an NPC id. */
  id: string;
  /** Explicit display name override. */
  name?: string;
  /** Explicit authored examine text (highest priority). */
  text?: string;
  /** Optional deeper lore shown after the main text. */
  lore?: string;
  ctx?: ExamineContext;
}

export interface ExamineResult {
  name: string;
  text: string;
  lore?: string;
  /** True when this is the first time the player examined this entity. */
  firstDiscovery: boolean;
}

export function hashExamineId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// Procedural description builders. All seeded by entity id: deterministic,
// cached by the caller, never regenerated per frame.
// ---------------------------------------------------------------------------

const TREE_NAMES = ['Oak Tree', 'Pine Tree', 'Birch Tree', 'Willow Tree', 'Old Tree'] as const;

function treeExamine(ref: ExamineRef, rng: () => number): { name: string; text: string } {
  const ctx = ref.ctx || {};
  const name = ref.name || pick(rng, TREE_NAMES);
  const species = name.split(' ')[0].toLowerCase();
  if (ctx.age === 'dead') {
    return { name, text: `A dead ${species}. Most of the life has left it, though a few stubborn branches remain.` };
  }
  const base: string[] = [];
  if (ctx.age === 'young') base.push(`A young ${species} struggling toward the sunlight.`);
  else if (ctx.age === 'ancient') base.push(`A massive old ${species} that has probably watched generations pass.`);
  else if (ctx.age === 'old') base.push(`An old ${species} with thick branches and deeply furrowed bark.`);
  else base.push(`A ${species} tree, its canopy rustling softly.`);
  let text = pick(rng, base);
  const mods: string[] = [];
  if (ctx.nearRoad) mods.push('It stands weathered beside the old road.');
  if (ctx.nearVillage) mods.push('One of the larger trees shading the village edge.');
  if (ctx.nearRuins) mods.push('It has grown around the remains of something much older.');
  if (ctx.nearWater) mods.push('Its roots reach toward the water.');
  if (ctx.season === 'autumn') mods.push('Its leaves are beginning to turn with the season.');
  if (ctx.season === 'winter') mods.push('Bare branches claw at the winter sky.');
  if (mods.length > 0) text += ' ' + pick(rng, mods);
  return { name, text };
}

function rockExamine(ref: ExamineRef, rng: () => number): { name: string; text: string } {
  const name = ref.name || pick(rng, ['Mossy Boulder', 'Grey Rock', 'Weathered Stone', 'Lichen-Covered Rock'] as const);
  const opts = [
    'Half buried in the soil. Moss has claimed most of its surface.',
    'A solid, unremarkable rock. It has been here longer than anyone remembers.',
    'Weathered smooth by countless seasons.',
    'Cold to the touch, even in sunlight.',
  ];
  return { name, text: pick(rng, opts) };
}

const BUILDING_BLURBS: Record<string, readonly string[]> = {
  farmhouse: ['A simple farmhouse belonging to one of the nearby families.', 'Smoke curls from the chimney; someone is home.'],
  smithy: ['The steady sound of hammering can usually be heard from inside.', 'The forge-fire never quite goes out here.'],
  tavern: ['A warm place to eat, drink, gossip, and occasionally make poor decisions.', 'Laughter spills out whenever the door opens.'],
  stable: ['A small stable with room for several horses.', 'The smell of hay and leather hangs in the air.'],
  hall: ['The administrative heart of the settlement.', 'Where the town gathers when there is news.'],
  house: ['A modest home with a chimney that has seen better winters.', 'Someone keeps the garden tidy; someone lives here.'],
  shop: ['A shop with goods displayed in the window.', 'The sign creaks gently in the breeze.'],
  chapel: ['A quiet place. Even the dust seems respectful here.', 'Candles burn inside, day and night.'],
};

function buildingExamine(ref: ExamineRef, rng: () => number): { name: string; text: string } {
  const ctx = ref.ctx || {};
  const btype = (ctx.buildingType || 'house').toLowerCase();
  const name = ref.name || (ctx.townName ? `${cap(btype)} of ${ctx.townName}` : `Small Timber ${cap(btype)}`);
  if (ctx.condition === 'ruined' || ctx.condition === 'damaged') {
    return { name, text: pick(rng, ['Nobody appears to live here anymore.', 'The house has been empty for years, although the hearth looks recently disturbed.', 'The roof sags and the door hangs crooked.']) };
  }
  const pool = BUILDING_BLURBS[btype] || BUILDING_BLURBS.house;
  let text = pick(rng, pool);
  if (ctx.townName && rng() < 0.3) text += ` It has stood in ${ctx.townName} for as long as anyone can remember.`;
  return { name, text };
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

const NPC_ROLE_BLURBS: Record<string, readonly string[]> = {
  farmer: ['A tired farmer with soil still clinging to their boots.', 'They know every field within a day\'s walk.'],
  blacksmith: ['A broad-shouldered smith whose hands show years of working metal.', 'Sparks seem to follow them everywhere.'],
  merchant: ['A merchant who keeps one eye on the shop and another on the road.', 'Everything has a price; they know all of them.'],
  shopkeeper: ['They look like they have been running this shop longer than you have been alive.', 'A merchant who keeps one eye on the shop and another on the road.'],
  guard: ['A guard with the bored stance of someone who has watched this road for years.', 'They notice more than they let on.'],
  child: ['A village child with far too much energy.', 'Probably supposed to be doing chores right now.'],
  elder: ['An elder whose face is a map of the town\'s history.', 'They remember when the big tree was small.'],
  traveler: ['A traveler carrying a pack that looks heavier than they are.', 'Dust from a dozen roads coats their cloak.'],
  barkeep: ['The barkeep polishes the same glass and hears every rumor in town.', 'They have heard it all before, and will hear it again.'],
  priest: ['A calm presence; the chapel keeps them busy.', 'They speak softly and listen well.'],
};

function npcExamine(ref: ExamineRef, rng: () => number): { name: string; text: string } {
  const ctx = ref.ctx || {};
  const name = ref.name || 'Villager';
  const roleKey = (ctx.role || ctx.archetype || 'commoner').toLowerCase();
  const pool = NPC_ROLE_BLURBS[roleKey] || [
    'A local going about their day.',
    'One of the folk who call this place home.',
    'They nod politely as you pass.',
  ];
  let text = pick(rng, pool);
  // Contextual second sentence from live simulation state.
  const act = (ctx.activity || '').toLowerCase();
  if (/work|farm|forge|shop|shift/.test(act)) text += ' They are clearly in the middle of a long day\'s work.';
  else if (/tavern|drink|rest|evening/.test(act)) text += ' They look considerably happier now that the day\'s work is finished.';
  else if (/sleep|bed|night/.test(act)) text += ' They look like they would rather be asleep.';
  else if (/walk|travel|road/.test(act)) text += ' They seem to be heading somewhere with purpose.';
  if (ctx.ageBracket === 'child' && !/child/.test(text)) text += ' Young, but already learning the trade.';
  if (ctx.ageBracket === 'elder' && !/elder/.test(text)) text += ' There is a lifetime of stories behind those eyes.';
  const pers = (ctx.personality || '').toLowerCase();
  if (pers === 'outgoing') text += ' They have a warm, outgoing manner.';
  else if (pers === 'reserved') text += ' They keep to themselves, mostly.';
  else if (pers === 'hardworking') text += ' Everything about them says hard work.';
  return { name, text };
}

function itemExamine(ref: ExamineRef, rng: () => number): { name: string; text: string } {
  const name = ref.name || 'Item';
  const t = (ref.ctx?.itemType || '').toLowerCase();
  const pools: Record<string, readonly string[]> = {
    weapon: ['A dependable weapon. Nothing fancy, but it should hold an edge.', 'Well-balanced, with honest wear along the blade.'],
    armor: ['Sturdy armor, dented in the places that matter.', 'It has turned aside worse than you, probably.'],
    potion: ['A small bottle containing a suspiciously red liquid.', 'The label fell off long ago. Probably fine.'],
    food: ['Hard enough to qualify as a weapon.', 'Edible. Technically.'],
    key: ['A heavy iron key. It opens something important, surely.', 'Teeth worn smooth from years of use.'],
    lore: ['The pages are brittle, but the writing is still legible.', 'Someone took great care writing this.'],
    relic: ['A strange trophy, humming faintly with old magic.', 'It feels heavier than it looks.'],
  };
  const pool = pools[t] || ['A useful-looking item.', 'Someone went to the trouble of making this.'];
  // RuneScape-style rare humor, ~5%.
  if (rng() < 0.05 && t === 'food') return { name, text: 'Perhaps edible. Technically.' };
  return { name, text: pick(rng, pool) };
}

function monsterExamine(ref: ExamineRef, rng: () => number): { name: string; text: string } {
  const name = ref.name || 'Creature';
  const lvl = ref.ctx?.level || 1;
  const n = name.toLowerCase();
  if (/wolf/.test(n)) return { name, text: 'A wild wolf watching you from a safe distance.' };
  if (/goblin/.test(n)) return { name, text: 'Small, green, and probably planning something unpleasant.' };
  if (/bandit/.test(n)) return { name, text: 'Someone who has chosen the road over honest work.' };
  if (/chicken/.test(n)) return { name, text: 'An exceptionally confident chicken.' };
  if (/rat/.test(n)) return { name, text: 'A rat. It has opinions about your ankles.' };
  if (lvl >= 20) return { name, text: 'Whatever this thing is, it has no business being this close to the village.' };
  if (lvl >= 10) return { name, text: pick(rng, ['A dangerous-looking creature. Best not to startle it.', 'Scars and a bad attitude.']) };
  return { name, text: pick(rng, ['A wild creature, minding its own business.', 'It watches you warily.']) };
}

function furnitureExamine(ref: ExamineRef, rng: () => number): { name: string; text: string } {
  const name = ref.name || 'Furniture';
  const n = name.toLowerCase();
  const table: [RegExp, readonly string[]][] = [
    [/chair/, ['A plain wooden chair. It has seen better days.', 'Someone spent entirely too much money on this chair.']],
    [/bed/, ['A modest bed that looks considerably more comfortable than the floor.', 'The blanket is patched but clean.']],
    [/book| shelf/, ['A collection of books gathered over many years.', 'Dust, leather, and old stories.']],
    [/fire|hearth/, ['A stone fireplace still warm from the morning fire.', 'Someone keeps this fire alive.']],
    [/pot|cook/, ['A well-used cooking pot.', 'It smells faintly of yesterday\'s stew.']],
    [/table/, ['A sturdy wooden table covered in the marks of daily life.', 'Knife-scores and ring-stains tell its history.']],
    [/barrel/, ['A barrel. It smells of whatever it held last.', 'It\'s a barrel.']],
    [/crate/, ['A wooden crate, nailed shut.', 'Something rattles faintly inside.']],
  ];
  for (const [re, pool] of table) {
    if (re.test(n)) return { name, text: pick(rng, pool) };
  }
  return { name, text: 'Well-made and well-used, like everything here.' };
}

function genericExamine(ref: ExamineRef, rng: () => number): { name: string; text: string } {
  const name = ref.name || cap(ref.kind);
  const ctx = ref.ctx || {};
  // Biome-aware fallbacks.
  if (ctx.biome) {
    const b = ctx.biome.toLowerCase();
    if (/forest/.test(b)) return { name, text: 'Part of the living forest, going about its quiet business.' };
    if (/desert|sand/.test(b)) return { name, text: 'Sun-bleached and patient under the desert sky.' };
    if (/snow|tundra|frost/.test(b)) return { name, text: 'Frost-rimed and silent in the cold air.' };
    if (/swamp|marsh/.test(b)) return { name, text: 'Damp, green, and faintly buzzing with insects.' };
  }
  // Material-aware fallbacks.
  if (ctx.material) {
    const m = ctx.material.toLowerCase();
    if (/wood/.test(m)) return { name, text: 'Made of wood, worn smooth by hands and weather.' };
    if (/stone/.test(m)) return { name, text: 'Made of stone, heavy with the weight of years.' };
    if (/metal|iron|steel/.test(m)) return { name, text: 'Made of metal, cool and unyielding.' };
  }
  return { name, text: pick(rng, ['Worth a closer look.', 'It belongs here, whatever it is.', 'Unremarkable at a glance, but everything has a story.']) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Resolve an entity to its display name + description. Never empty. */
export function examineEntity(ref: ExamineRef): { name: string; text: string; lore?: string } {
  const rng = mulberry32(hashExamineId(ref.id || ref.kind));
  if (ref.text) {
    return { name: ref.name || cap(ref.kind), text: ref.text, lore: ref.lore };
  }
  let out: { name: string; text: string };
  switch (ref.kind) {
    case 'tree': out = treeExamine(ref, rng); break;
    case 'rock': out = rockExamine(ref, rng); break;
    case 'building': out = buildingExamine(ref, rng); break;
    case 'door': {
      const btype = ref.ctx?.buildingType || 'building';
      out = { name: ref.name || 'Wooden Door', text: `The door to the ${btype}. It opens inward with a familiar creak.` };
      break;
    }
    case 'npc': out = npcExamine(ref, rng); break;
    case 'item': out = itemExamine(ref, rng); break;
    case 'monster': out = monsterExamine(ref, rng); break;
    case 'furniture': out = furnitureExamine(ref, rng); break;
    case 'road': out = { name: ref.name || 'Old Road', text: 'An old road connecting the settlement with the lands beyond.' }; break;
    case 'water': out = { name: ref.name || 'Water', text: 'Clear, cold, and moving with quiet purpose.' }; break;
    case 'plant': out = { name: ref.name || 'Wildflowers', text: 'Small bright flowers pushing up between the grasses.' }; break;
    case 'stall': out = { name: ref.name || 'Market Stall', text: 'A striped awning over goods laid out for the day\'s trade.' }; break;
    case 'sign': out = { name: ref.name || 'Signpost', text: 'Weathered lettering points down each road.' }; break;
    case 'player': out = { name: ref.name || 'Adventurer', text: 'Another traveler, making their own way through the world.' }; break;
    default: out = genericExamine(ref, rng); break;
  }
  return { ...out, lore: ref.lore };
}

// ---------------------------------------------------------------------------
// Context menu capabilities. The app maps action ids to real handlers;
// unknown actions are never shown.
// ---------------------------------------------------------------------------

export interface MenuAction {
  id: 'examine' | 'talk' | 'enter' | 'take' | 'attack' | 'walk' | 'pickpocket';
  label: string;
}

/** RuneScape-style menu: primary action first, Examine near the bottom. */
export function menuActionsFor(ref: ExamineRef): MenuAction[] {
  const { name } = examineEntity(ref);
  const ex: MenuAction = { id: 'examine', label: `Examine ${name}` };
  switch (ref.kind) {
    case 'npc': return [{ id: 'talk', label: `Talk-to ${name}` }, { id: 'attack', label: `Attack ${name}` }, { id: 'pickpocket', label: `Pickpocket ${name}` }, ex];
    case 'door':
    case 'building': return [{ id: 'enter', label: `Enter ${name}` }, ex];
    case 'item': return [{ id: 'take', label: `Take ${name}` }, ex];
    case 'monster': return [{ id: 'attack', label: `Attack ${name}` }, ex];
    default: return [ex];
  }
}

// ---------------------------------------------------------------------------
// Discovery system. Generated scenery is deterministic, so only the *fact*
// of discovery needs persistence.
// ---------------------------------------------------------------------------

const DISCOVERY_KEY = 'ag-examine-discovery-v1';
const DISCOVERY_COUNT_KEY = 'ag-examine-discovery-count-v1';

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function writeSet(key: string, set: Set<string>): void {
  try {
    const arr = [...set];
    // Cap at 5000 entries to bound storage.
    localStorage.setItem(key, JSON.stringify(arr.slice(-5000)));
  } catch { /* ignore */ }
}

/**
 * Record an examination. Returns true on first discovery of this entity.
 * Safe to call in any environment (no-ops without localStorage).
 */
export function markExamined(ref: ExamineRef): boolean {
  try {
    const seen = readSet(DISCOVERY_KEY);
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    writeSet(DISCOVERY_KEY, seen);
    return true;
  } catch { return false; }
}

export function discoveryCount(): number {
  try { return readSet(DISCOVERY_KEY).size; } catch { return 0; }
}

export function hasExamined(ref: ExamineRef): boolean {
  try { return readSet(DISCOVERY_KEY).has(`${ref.kind}:${ref.id}`); } catch { return false; }
}
