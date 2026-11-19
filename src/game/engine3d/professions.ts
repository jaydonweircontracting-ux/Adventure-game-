/**
 * BUILD 1098 (0x21, Living World plan Phase 4.1): professions as DATA.
 *
 * The founders do everything by need-score — whoever is free chops,
 * builds, mines, mills, bakes. There are only archetype labels, no
 * profession system and no profession assignment. This module is the
 * profession system as data: the 15 professions, each with its work
 * sites, tools, and inputs/outputs — following the buildingCatalogue.ts
 * data pattern (data only: this module assigns nothing by itself and
 * changes no behaviour; the scorer weights and the assignment live
 * here as pure functions the ticks call).
 *
 * JOB-KIND MAPPING (each scored work kind belongs to exactly one
 * profession; stated in the commit message, enforced by
 * validateProfessions()):
 * - farmer: harvest, plant, water, mill, bake (milling + baking ride
 *   with the farmer until the baking-profession decision lands in its
 *   own task — baking is NOT one of the 15 professions, and whether
 *   it is a farmer's work or its own profession is a design decision
 *   for that task, not a side effect of this one).
 * - lumberjack: chop, lumber. miner: mine. stonecutter: quarry.
 *   builder: build. carpenter: saw, carpenter. blacksmith: smelt,
 *   smith.
 * - merchant, hunter, fisher, shepherd, guard, engineer, architect,
 *   mayor: NO job kinds yet (data only — hunting/fishing/shepherding
 *   is 4.5, trade is Phase 5, guards are bounded, construction
 *   intelligence is 4.2; the assignment never gives them work that
 *   does not exist). Do NOT invent those systems to fill them.
 * - deliver is the SHARED CARRY LEG: it belongs to no profession.
 *   Every gatherer delivers their own goods (the deliver job is
 *   claimed by whoever is carrying, not scored by the utility
 *   scorer — workKind never returns 'deliver'), so it cannot be a
 *   profession's work without double-counting every carrier.
 *
 * ASSIGNMENT (by settlement need, not by the player): the ticks
 * re-run assignProfessions every tick — it is idempotent by
 * construction (a founder keeps their profession while its slot is
 * still open, so the assignment only CHANGES when the need changes:
 * a new building opens a new profession slot; a founder without
 * work takes the most-needed open profession). One slot per
 * profession — a 3–9 founder settlement needs no duplicates yet.
 * Slot order is need order: food first, then the build, then the
 * raw materials, then the processing. Founders beyond the open
 * slots get null — they work by need-score, with no profession
 * boost, and take the most-needed open work.
 *
 * Pure module (no React, no WebGL, no localStorage, no runtime
 * imports — only type imports) so the sim and the standalone
 * asserts can import it directly.
 */

import type { JobKind } from './jobs';

/** The 15 professions (Living World plan Phase 4.1). */
export type ProfessionId =
  | 'farmer'
  | 'lumberjack'
  | 'miner'
  | 'stonecutter'
  | 'builder'
  | 'carpenter'
  | 'blacksmith'
  | 'merchant'
  | 'hunter'
  | 'fisher'
  | 'shepherd'
  | 'guard'
  | 'engineer'
  | 'architect'
  | 'mayor';

/** Whether the profession has a working system today. */
export type ProfessionSystem = 'working' | 'future';

/** One profession, as data. */
export type ProfessionDef = {
  id: ProfessionId;
  label: string;
  blurb: string;
  /** The J-1 job kinds this profession owns (exactly one owner per
   *  scored kind — see the module header; 'deliver' belongs to
   *  none). Empty for future professions. */
  jobKinds: JobKind[];
  /** Where the profession works (a description — the probe checks
   *  positions against the site constants, not this string). */
  workSites: string;
  tools: string[];
  inputs: string[];
  outputs: string[];
  system: ProfessionSystem;
  /** Why a future profession has no work yet (the plan step that
   *  gives it a system). */
  systemNote: string;
};

/** The 15 professions. */
export const PROFESSIONS: ProfessionDef[] = [
  {
    id: 'farmer', label: 'Farmer', blurb: 'Grows the settlement’s food — plants, waters, harvests, mills the grain and bakes it into meals.',
    jobKinds: ['harvest', 'plant', 'water', 'mill', 'bake'],
    workSites: 'the farm field south-west of camp, the mill, the bakery',
    tools: ['hoe', 'sickle'], inputs: ['seed', 'grain', 'flour'], outputs: ['grain', 'flour', 'meals'],
    system: 'working', systemNote: '',
  },
  {
    id: 'lumberjack', label: 'Lumberjack', blurb: 'Fells trees in the forest and hauls the wood to the pile.',
    jobKinds: ['chop', 'lumber'],
    workSites: 'the lumber rect at the forest edge, the trees around camp',
    tools: ['axe'], inputs: ['trees'], outputs: ['wood', 'timber'],
    system: 'working', systemNote: '',
  },
  {
    id: 'miner', label: 'Miner', blurb: 'Works the mine — iron and coal out of the ground, carried to the storehouse.',
    jobKinds: ['mine'],
    workSites: 'the mine over the iron and coal deposits',
    tools: ['pickaxe'], inputs: ['ore deposits'], outputs: ['iron', 'coal'],
    system: 'working', systemNote: '',
  },
  {
    id: 'stonecutter', label: 'Stonecutter', blurb: 'Quarries rock into stone for the storehouse and the builders.',
    jobKinds: ['quarry'],
    workSites: 'the designated quarry site',
    tools: ['pickaxe', 'chisel'], inputs: ['rock', 'stone deposits'], outputs: ['stone'],
    system: 'working', systemNote: '',
  },
  {
    id: 'builder', label: 'Builder', blurb: 'Raises the settlement — huts, the storehouse, the mill, the chain buildings, one step at a time.',
    jobKinds: ['build'],
    workSites: 'the building sites (huts, storehouse, mill, bakery, chain buildings, inn)',
    tools: ['hammer', 'saw'], inputs: ['wood', 'stone'], outputs: ['buildings'],
    system: 'working', systemNote: '',
  },
  {
    id: 'carpenter', label: 'Carpenter', blurb: 'Saws wood into timber at the sawmill and works timber into furniture.',
    jobKinds: ['saw', 'carpenter'],
    workSites: 'the sawmill, the carpenter’s shop',
    tools: ['saw', 'plane'], inputs: ['wood', 'timber'], outputs: ['timber', 'furniture'],
    system: 'working', systemNote: '',
  },
  {
    id: 'blacksmith', label: 'Blacksmith', blurb: 'Smelts ore and coal into ingots at the smelter and smiths ingots into tools.',
    jobKinds: ['smelt', 'smith'],
    workSites: 'the smelter, the blacksmith’s forge',
    tools: ['hammer', 'tongs', 'bellows'], inputs: ['iron', 'coal', 'ingots'], outputs: ['ingots', 'tools'],
    system: 'working', systemNote: '',
  },
  {
    id: 'merchant', label: 'Merchant', blurb: 'Moves goods between stores and settlements — the market stall lists what the settlement has to trade.',
    jobKinds: [],
    workSites: 'the market stall',
    tools: ['scales', 'coin'], inputs: ['trade goods'], outputs: ['gold', 'goods'],
    system: 'future', systemNote: 'Trade is Phase 5 — the stall lists goods today, no transactions yet.',
  },
  {
    id: 'hunter', label: 'Hunter', blurb: 'Tracks wild animals for meat and hides.',
    jobKinds: [],
    workSites: 'the wilds beyond the settlement',
    tools: ['bow'], inputs: ['wild animals'], outputs: ['meat', 'hides'],
    system: 'future', systemNote: 'Hunting is Phase 4.5 (animals) — no hunting system yet.',
  },
  {
    id: 'fisher', label: 'Fisher', blurb: 'Fishes the rivers and lakes.',
    jobKinds: [],
    workSites: 'the rivers and lakes',
    tools: ['rod', 'net'], inputs: ['rivers', 'lakes'], outputs: ['fish'],
    system: 'future', systemNote: 'Fishing is Phase 4.5 (animals) — no fishing system yet.',
  },
  {
    id: 'shepherd', label: 'Shepherd', blurb: 'Tends the flocks on the pastures — wool and mutton.',
    jobKinds: [],
    workSites: 'the pastures',
    tools: ['crook'], inputs: ['pasture', 'sheep'], outputs: ['wool', 'mutton'],
    system: 'future', systemNote: 'Shepherding is Phase 4.5 (animals) — no animals to tend yet.',
  },
  {
    id: 'guard', label: 'Guard', blurb: 'Watches the walls and gates — the settlement’s safety is bounded to the town edge.',
    jobKinds: [],
    workSites: 'the walls and gates',
    tools: ['spear', 'shield'], inputs: ['walls', 'gates'], outputs: ['safety'],
    system: 'future', systemNote: 'Guards are bounded — no guarding system yet.',
  },
  {
    id: 'engineer', label: 'Engineer', blurb: 'Bridges, roads, wells — the settlement’s works.',
    jobKinds: [],
    workSites: 'bridges, roads, wells',
    tools: ['plumb line', 'level'], inputs: ['stone', 'wood'], outputs: ['bridges', 'roads', 'wells'],
    system: 'future', systemNote: 'Construction intelligence is Phase 4.2 — the engineer’s planning comes then.',
  },
  {
    id: 'architect', label: 'Architect', blurb: 'Plans where the settlement grows — site selection and the build queue.',
    jobKinds: [],
    workSites: 'the settlement plan',
    tools: ['plans'], inputs: ['the settlement plan'], outputs: ['building sites'],
    system: 'future', systemNote: 'Construction intelligence is Phase 4.2 — site selection and the build queue come then.',
  },
  {
    id: 'mayor', label: 'Mayor', blurb: 'Leads the settlement — decisions, not labour.',
    jobKinds: [],
    workSites: 'the town hall',
    tools: ['seal'], inputs: ['the settlement'], outputs: ['decisions'],
    system: 'future', systemNote: 'No work system — settlement leadership, not a job.',
  },
];

/** The definition for an id, or undefined for an unknown id. */
export function professionDefFor(id: ProfessionId): ProfessionDef | undefined {
  return PROFESSIONS.find((p) => p.id === id);
}

/** The display label for a profession (or 'Commoner' for none). */
export function professionLabel(id: ProfessionId | null | undefined): string {
  if (!id) return 'Commoner';
  return professionDefFor(id)?.label ?? 'Commoner';
}

/** The job kinds a profession owns (empty for future professions). */
export function professionJobKinds(id: ProfessionId): JobKind[] {
  return professionDefFor(id)?.jobKinds ?? [];
}

/** The profession that owns a job kind, or null (deliver — the
 *  shared carry leg — and unknown kinds belong to none). */
export function professionForJobKind(kind: JobKind): ProfessionId | null {
  const owner = PROFESSIONS.find((p) => p.jobKinds.includes(kind));
  return owner ? owner.id : null;
}

/** The scored work kinds + build — every one must belong to exactly
 *  one profession (deliver excluded: the shared carry leg). */
export const PROFESSION_SCORED_KINDS: JobKind[] = [
  'chop', 'harvest', 'quarry', 'water', 'mine', 'lumber', 'plant',
  'mill', 'bake', 'smelt', 'smith', 'saw', 'carpenter', 'build',
];

/** Validate the profession data — returns the problems (empty when
 *  clean). The sim and the standalone asserts both call it. */
export function validateProfessions(): string[] {
  const problems: string[] = [];
  if (PROFESSIONS.length !== 15) problems.push(`expected 15 professions, got ${PROFESSIONS.length}`);
  const seen = new Set<string>();
  for (const p of PROFESSIONS) {
    if (seen.has(p.id)) problems.push(`duplicate profession id: ${p.id}`);
    seen.add(p.id);
    if (!p.label || !p.blurb || !p.workSites) problems.push(`profession ${p.id} is missing label/blurb/workSites`);
    if (p.system === 'working' && p.jobKinds.length === 0) problems.push(`working profession ${p.id} has no job kinds`);
    if (p.system === 'future' && p.jobKinds.length > 0) problems.push(`future profession ${p.id} has job kinds (${p.jobKinds.join(', ')}) — it has no working system yet`);
    if (p.system === 'future' && !p.systemNote) problems.push(`future profession ${p.id} has no systemNote (which plan step gives it work?)`);
    if (p.tools.length === 0 || p.inputs.length === 0 || p.outputs.length === 0) problems.push(`profession ${p.id} is missing tools/inputs/outputs`);
  }
  for (const k of PROFESSION_SCORED_KINDS) {
    const owners = PROFESSIONS.filter((p) => p.jobKinds.includes(k));
    if (owners.length !== 1) problems.push(`job kind ${k} has ${owners.length} profession owners (want exactly 1)`);
  }
  if (PROFESSIONS.some((p) => p.jobKinds.includes('deliver'))) {
    problems.push('deliver belongs to no profession — it is the shared carry leg');
  }
  return problems;
}

/** A saved profession value (unknown or missing → null — an old
 *  save has no profession, and the tick assigns one). Pure. */
const PROFESSION_ID_SET = new Set<string>(PROFESSIONS.map((p) => p.id));
export function professionFromSave(value: unknown): ProfessionId | null {
  return typeof value === 'string' && PROFESSION_ID_SET.has(value) ? (value as ProfessionId) : null;
}

/** What the settlement needs right now, for the assignment — the
 *  caller computes it from state it already has (no new queries). */
export type ProfessionNeed = {
  /** The farm field exists (always true — the field is planted
   *  day 1, and food is always needed). */
  farmOpen: boolean;
  /** Any building site is unfinished (a hut, the storehouse, the
   *  mill, the bakery, a chain building, the inn, a bridge). */
  constructionPending: boolean;
  /** The lumber site is designated (day 3+) or trees are in
   *  range to chop. */
  lumberOpen: boolean;
  /** A mine is designated (day 3+). */
  mineOpen: boolean;
  /** A quarry site is designated (day 3+). */
  quarryOpen: boolean;
  /** The smelter is done (the blacksmith smelts). */
  smelterDone: boolean;
  /** The blacksmith is done (the blacksmith smiths). */
  blacksmithDone: boolean;
  /** The sawmill is done (the carpenter saws). */
  sawmillDone: boolean;
  /** The carpenter’s shop is done (the carpenter carpenters). */
  carpenterDone: boolean;
};

/** The open profession slots, in need order — food first, then the
 *  build, then the raw materials, then the processing. One slot
 *  per profession. Future professions never open (no system). */
export function professionSlotsFor(need: ProfessionNeed): ProfessionId[] {
  const slots: ProfessionId[] = [];
  if (need.farmOpen) slots.push('farmer');
  if (need.constructionPending) slots.push('builder');
  if (need.lumberOpen) slots.push('lumberjack');
  if (need.mineOpen) slots.push('miner');
  if (need.quarryOpen) slots.push('stonecutter');
  if (need.smelterDone || need.blacksmithDone) slots.push('blacksmith');
  if (need.sawmillDone || need.carpenterDone) slots.push('carpenter');
  return slots;
}

/**
 * Assign professions by settlement need. Stable by construction:
 * founders are taken in id order; a founder keeps their
 * profession while its slot is still open and untaken; otherwise
 * they take the first untaken slot in need order; founders beyond
 * the open slots get null (they work by need-score, with no
 * profession boost). Writes the assignment onto the founders IN
 * PLACE (the ticks pass the live founder array and read the
 * profession back off it — a pure return value alone would leave
 * every founder a Commoner) and returns the id → profession map
 * for callers that want it. Pure in the input sense — the ticks
 * call it every tick and it only CHANGES the assignment when the
 * need changes (a new building opens a slot; a slot closes when
 * its work is done). The player never assigns a profession.
 */
export function assignProfessions(
  founders: { id: string; profession: ProfessionId | null }[],
  slots: readonly ProfessionId[],
): Map<string, ProfessionId | null> {
  const taken = new Set<ProfessionId>();
  const out = new Map<string, ProfessionId | null>();
  const ordered = [...founders].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const f of ordered) {
    const cur = f.profession ?? null;
    if (cur !== null && slots.includes(cur) && !taken.has(cur)) {
      taken.add(cur);
      out.set(f.id, cur);
      continue;
    }
    const next = slots.find((s) => !taken.has(s)) ?? null;
    if (next !== null) taken.add(next);
    f.profession = next;
    out.set(f.id, next);
  }
  return out;
}
