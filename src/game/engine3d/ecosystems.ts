// ecosystems.ts — NEURON HEX 0x14, Living World plan Phase 1.6:
// regrowth + ecosystems (BUILD 1085).
//
// Two systems, one module:
//
//   (a) REGROWTH — a chopped tile grows a sapling that matures into a
//       real tree over days, at the 1.5 season rate (seasonRegrowthFactor:
//       winter 0.5, spring 1.0, summer 1.25, autumn 0.8 — winter slowest,
//       summer fastest). A sapling needs SAPLING_MATURE_GROWTH (7)
//       growth points, so ~7 days in spring, ~6 in summer, ~9 in
//       autumn, ~14 in winter. This RECONCILES with the 1061 rule (a
//       chopped tree stays chopped): the tree stays chopped until the
//       sapling matures — the regrowth is a slow, deterministic,
//       day-by-day process, never an instant resurrection on load or
//       migration. A chopped tile is planted by chopTreeAt (founders)
//       and the player's E-key chop; a wild-tree chop plants nothing
//       (wild trees live outside the world grid and the renderer
//       derives them from the wild rule).
//
//   (b) ANIMAL POPULATIONS — the 2.5D ecosystem population model
//       (populations.ts + foodWeb.ts + seasons.ts) ported to the 3D
//       animals, one region (the whole 200x200 world), persisted on
//       the world save (IsoWorld.animalPopulations, stamped once on
//       load, saved wholesale — the 1.2 deposits / 1.3 rivers pattern).
//       One day step per day: births, deaths, habitat food, predator
//       pressure from wolves, hunting consumed. The live animals in
//       view are a sample of the regional population: the spawn cap
//       for new animals follows the population (liveAnimalCap), so a
//       crashed deer population stops sending new deer into view
//       (existing live animals are never culled — no pop-outs, the
//       1013 rule).
//
// Two deliberate deviations from the 2.5D model, both required by the
// 1.6 acceptance test ("deer numbers recover after hunting stops"):
//   1. FRACTIONAL populations. The 2.5D simulatePopulationDay floors
//      births and deaths to integers — at the 2.5D rates a deer
//      population of 15-35 gains floor(0.5) = 0 births a day, so it
//      can only ever fall, never recover. The 3D port keeps the
//      population a float (same formula, no floor on the result —
//      simulatePopulationDayFloat), so births accumulate and the
//      population recovers. Rounded only for display and the live cap.
//   2. HUNTING IS CONSUMED PER DAY. The 2.5D model multiplies the
//      population by a modifier from CUMULATIVE kills every day —
//      with 10 deer killed the population halves daily forever and
//      never recovers. The 3D port records kills since the last day
//      advance (world.animalKills) and subtracts them once (one kill
//      = one animal gone), then clears the count: hunting stops →
//      the subtraction stops → births rebuild the population.
//
// The 3D species table: deer + wolf + rabbit + boar take their params
// from the 2.5D table (paramsForSpecies — the port, not a second
// model); the rest carry 3D-native params in the same
// PopulationParams shape, run through the same day math.
// BUILD 1102 (Phase 4.5): elk, fox, bear, fish, sheep, cattle, pig
// and horse join the table. No domestication as a tech (later) —
// sheep/cattle/pig/horse are regional populations only; the pen flock
// is the one domestic group, and it lives in animalHusbandry.ts.
// The hunting input is the recorded-kill record a hunt writes;
// today the player writes it by slaying a wolf, and the probe
// writes it for deer through the recordHuntingKill test hook.
import { DEFAULT_WORLD_SEED, seasonForDay } from '../worldCore';
import { wfcSeedFor } from '../wfc';
import {
  paramsForSpecies,
  type PopulationParams,
} from '../populations';
import { predatorPressureFor } from '../foodWeb';
import { modifiersForSeason } from '../seasons';
import { seasonRegrowthFactor } from './climate';
import type { IsoWorld } from '../iso/isoWorld';

/** BUILD 1102: the 3D animal kinds — the five live kinds plus the
 *  six new live/population kinds and the four domestic populations.
 *  Only bird/goat/deer/wolf/chicken/rabbit/boar/elk/fox/bear/fish
 *  are live actors; sheep/cattle/pig/horse are regional populations
 *  (their farms/actors come with their buildings). */
export type AnimalKind3D = 'bird' | 'goat' | 'deer' | 'wolf' | 'chicken' | 'rabbit' | 'boar' | 'elk' | 'fox' | 'bear' | 'fish' | 'sheep' | 'cattle' | 'pig' | 'horse';
export const ANIMAL_KINDS_3D: AnimalKind3D[] = ['bird', 'goat', 'deer', 'wolf', 'chicken', 'rabbit', 'boar', 'elk', 'fox', 'bear', 'fish', 'sheep', 'cattle', 'pig', 'horse'];

/** Growth points a sapling needs to become a real tree (~a week in spring). */
export const SAPLING_MATURE_GROWTH = 7;

/** A regrowing tree: the chopped tile + its accumulated growth. Plain data. */
export interface Sapling {
  x: number;
  y: number;
  /** Growth points (season rate per day); mature at SAPLING_MATURE_GROWTH. */
  growth: number;
}

/** One species' regional population. Plain data (population is a float —
//  deviation 1 above: births accumulate instead of flooring to zero). */
export interface AnimalPopulation {
  speciesId: string;
  /** Current population (fractional — rounded only for display / the live cap). */
  population: number;
  /** Food availability 0-1 (drifted toward the habitat target each day). */
  foodAvailability: number;
  /** Predator pressure 0-1 (from the food web, recomputed each day). */
  predatorPressure: number;
  /** Last simulation day. */
  lastSimDay: number;
}

/** A sapling that matured this advance — a tile that gains a real tree. */
export interface MaturedTree {
  x: number;
  y: number;
}

/**
 * 3D-native population params for the kinds the 2.5D table has no entry
 * for — same PopulationParams shape, same day math. Deer + wolf +
 * rabbit + boar come from the 2.5D table.
 */
const PARAMS_3D: Record<string, PopulationParams> = {
  bird: {
    speciesId: 'bird',
    birthRate: 0.12,
    deathRate: 0.04,
    foodDemand: 0.5,
    preferredBiomes: ['forest', 'grassland'],
    carryingCapacity: 30,
  },
  goat: {
    speciesId: 'goat',
    birthRate: 0.06,
    deathRate: 0.03,
    foodDemand: 2,
    preferredBiomes: ['grassland', 'hills'],
    carryingCapacity: 20,
  },
  chicken: {
    speciesId: 'chicken',
    birthRate: 0.1,
    deathRate: 0.04,
    foodDemand: 0.5,
    preferredBiomes: ['grassland'],
    carryingCapacity: 25,
  },
  // BUILD 1102: elk/fox/bear/fish are wild; sheep/cattle/pig/horse
  // are the domestic regional populations (no live actors in 4.5).
  elk: {
    speciesId: 'elk',
    birthRate: 0.05,
    deathRate: 0.03,
    foodDemand: 2,
    preferredBiomes: ['forest', 'grassland'],
    carryingCapacity: 25,
  },
  fox: {
    speciesId: 'fox',
    birthRate: 0.08,
    deathRate: 0.05,
    foodDemand: 1,
    preferredBiomes: ['forest', 'grassland'],
    carryingCapacity: 12,
  },
  bear: {
    speciesId: 'bear',
    birthRate: 0.03,
    deathRate: 0.02,
    foodDemand: 3,
    preferredBiomes: ['forest'],
    carryingCapacity: 8,
  },
  fish: {
    speciesId: 'fish',
    birthRate: 0.15,
    deathRate: 0.05,
    foodDemand: 0.5,
    preferredBiomes: ['water'],
    carryingCapacity: 40,
  },
  sheep: {
    speciesId: 'sheep',
    birthRate: 0.09,
    deathRate: 0.03,
    foodDemand: 1,
    preferredBiomes: ['grassland'],
    carryingCapacity: 30,
  },
  cattle: {
    speciesId: 'cattle',
    birthRate: 0.05,
    deathRate: 0.02,
    foodDemand: 3,
    preferredBiomes: ['grassland'],
    carryingCapacity: 20,
  },
  pig: {
    speciesId: 'pig',
    birthRate: 0.1,
    deathRate: 0.04,
    foodDemand: 1.5,
    preferredBiomes: ['grassland'],
    carryingCapacity: 25,
  },
  horse: {
    speciesId: 'horse',
    birthRate: 0.04,
    deathRate: 0.02,
    foodDemand: 3,
    preferredBiomes: ['grassland'],
    carryingCapacity: 15,
  },
};

/** Population params for a 3D kind: the 2.5D table first, then the 3D-native table. */
export function populationParamsFor3D(kind: string): PopulationParams | null {
  return paramsForSpecies(kind) ?? PARAMS_3D[kind] ?? null;
}

/**
 * Initialize one species' population (deterministic per seed).
 * The same formula as populations.ts initPopulation (wfcSeedFor +
 * the same LCG; 30-70% of capacity, food 0.7-1.0, pressure 0-0.3) —
 * extended to the 3D param table so bird/goat/chicken initialize
 * too. For deer/wolf the values are identical to initPopulation's
 * (same seed, same formula, same params); the asserts prove it.
 */
export function initAnimalPopulation(kind: string, worldSeed: number): AnimalPopulation {
  const params = populationParamsFor3D(kind);
  const seed = wfcSeedFor(worldSeed, 0, 0, `pop-${kind}`);
  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  if (!params) {
    return { speciesId: kind, population: 0, foodAvailability: 0.7, predatorPressure: 0, lastSimDay: 0 };
  }
  return {
    speciesId: kind,
    population: Math.floor(params.carryingCapacity * (0.3 + rng() * 0.4)),
    foodAvailability: 0.7 + rng() * 0.3,
    predatorPressure: rng() * 0.3,
    lastSimDay: 0,
  };
}

/**
 * Stamp the animal populations onto a world. BUILD 1102: the stamp
 * is idempotent-additive — a world stamped with an older kind list
 * GAINS the missing kinds on the next load (an old save never stays
 * on five kinds), and a world with every kind returns false. The
 * whole world is one region (0, 0) on the default world seed, so the
 * stamp is deterministic — same world, same counts. Returns true
 * when it added at least one kind (the caller saves); stamped counts
 * persist across reloads.
 */
export function stampAnimalPopulations(world: IsoWorld): boolean {
  const have = new Set((world.animalPopulations ?? []).map((p) => p.speciesId));
  const missing = ANIMAL_KINDS_3D.filter((kind) => !have.has(kind));
  if (missing.length === 0) return false;
  world.animalPopulations = [
    ...(world.animalPopulations ?? []),
    ...missing.map((kind) => initAnimalPopulation(kind, DEFAULT_WORLD_SEED)),
  ];
  return true;
}

/**
 * Plant a sapling where a tree was chopped. Returns true when one was
 * planted; false when the tile is out of the world, already holds a
 * tree, or already holds a sapling. The sapling starts at growth 0 —
 * the tree stays chopped until it matures (the 1061 rule, reconciled).
 */
export function plantSapling(world: IsoWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
  if ((world.trees ?? []).some((t) => t.tx === x && t.ty === y)) return false;
  if ((world.saplings ?? []).some((s) => s.x === x && s.y === y)) return false;
  if (!world.saplings) world.saplings = [];
  world.saplings.push({ x, y, growth: 0 });
  return true;
}

/**
 * One population day, fractional (deviation 1). The same formula as
 * populations.ts simulatePopulationDay — births = pop x birthRate x
 * food x (1 - density); deaths = pop x (deathRate + pressure x 0.1 +
 * starvation); capped at capacity, floored at 0 — with the population
 * kept a float so births accumulate instead of flooring to zero.
 * foodAvailability is the caller's (habitat-drifted) value and is left
 * unchanged: the 3D port sets food from habitat each day (the habitat
 * link) instead of the 2.5D self-drift. lastSimDay is left for the
 * caller (the day being advanced). Pure.
 */
export function simulatePopulationDayFloat(
  pop: AnimalPopulation,
  params: PopulationParams,
): AnimalPopulation {
  const density = pop.population / params.carryingCapacity;
  const densityFactor = Math.max(0, 1 - density);
  const births = pop.population * params.birthRate * pop.foodAvailability * densityFactor;
  const starvation = pop.foodAvailability < 0.3 ? 0.05 : 0;
  const deaths = pop.population * (params.deathRate + pop.predatorPressure * 0.1 + starvation);
  const next = Math.max(0, Math.min(params.carryingCapacity, pop.population + births - deaths));
  return { ...pop, population: next };
}

/** The result of one ecosystem day. Pure — the caller writes it back to the world. */
export type EcosystemDayResult = {
  /** Saplings after this day (grown; matured ones removed). */
  saplings: Sapling[];
  /** Populations after this day. */
  populations: AnimalPopulation[];
  /** Saplings that matured this day — tiles that gain a real tree. */
  matured: MaturedTree[];
  /** The hunting-kill record after this day (consumed kills cleared). */
  kills: Record<string, number>;
};

/**
 * BUILD 1102: predator pairs the 2.5D food web has no entry for
 * (fox, elk, sheep and chicken are not 2.5D species in the web).
 * The 2.5D web already covers wolf→deer/rabbit/boar and
 * bear→deer/fish; this table adds the rest. The 2.5D foodWeb.ts is
 * NOT edited — its sims must not move.
 */
const PRESSURE_3D: { from: string; to: string; strength: number }[] = [
  { from: 'fox', to: 'rabbit', strength: 0.5 },
  { from: 'wolf', to: 'elk', strength: 0.6 },
  { from: 'wolf', to: 'sheep', strength: 0.7 },
  { from: 'bear', to: 'elk', strength: 0.5 },
  { from: 'fox', to: 'chicken', strength: 0.4 },
];

/**
 * Predator pressure on a species (0-1): the 2.5D web pressure plus
 * the 3D-local pairs above (same per-predator formula as
 * predatorPressureFor — min(0.5, pop/20) x strength, summed, capped).
 */
export function predatorPressureFor3D(speciesId: string, predatorPops: Record<string, number>): number {
  const base = predatorPressureFor(speciesId, predatorPops);
  let extra = 0;
  for (const rel of PRESSURE_3D) {
    if (rel.to !== speciesId) continue;
    const pop = predatorPops[rel.from] ?? 0;
    extra += Math.min(0.5, pop / 20) * rel.strength;
  }
  return Math.min(1, base + extra);
}

/**
 * Advance the ecosystem one day. Pure — it reads the world and returns
 * the new state; the caller writes saplings/populations/kills back and
 * appends the matured trees (applyMaturedTrees).
 *
 * Saplings gain the day's season regrowth rate (1.5); a sapling at
 * SAPLING_MATURE_GROWTH leaves the list and is returned as matured.
 * Populations run their day step: food drifts 25% toward the habitat
 * target (herbivores + birds eat the forest — the live forest density;
 * wolves eat deer — deer / deer capacity; chickens eat at camp, 0.8),
 * predator pressure comes from the food web (wolves press deer) plus
 * the 3D override pairs (fox→rabbit, wolf→elk/sheep, bear→elk,
 * fox→chicken),
 * births scale by the 2.5D seasonal birth multiplier for the day's
 * season (the season itself comes from the 1.5 clock), and recorded
 * hunting kills are subtracted once and cleared (deviation 2).
 * A world with no populations is stamped first (an old save).
 */
export function advanceEcosystemDay(
  world: IsoWorld,
  day: number,
  opts: { forestDensity: number; seed?: number },
): EcosystemDayResult {
  const seed = opts.seed ?? DEFAULT_WORLD_SEED;
  const season = seasonForDay(day);
  const rate = seasonRegrowthFactor(season);
  const saplings: Sapling[] = [];
  const matured: MaturedTree[] = [];
  for (const s of world.saplings ?? []) {
    const growth = s.growth + rate;
    if (growth >= SAPLING_MATURE_GROWTH) matured.push({ x: s.x, y: s.y });
    else saplings.push({ x: s.x, y: s.y, growth });
  }
  let pops = (world.animalPopulations ?? []).map((p) => ({ ...p }));
  if (pops.length === 0) {
    pops = ANIMAL_KINDS_3D.map((kind) => initAnimalPopulation(kind, seed));
  }
  // Predator populations for the pressure calculation (this day's counts).
  const predatorPops: Record<string, number> = {};
  for (const p of pops) predatorPops[p.speciesId] = p.population;
  const deerPop = predatorPops['deer'] ?? 0;
  const deerCap = populationParamsFor3D('deer')?.carryingCapacity ?? 50;
  const kills: Record<string, number> = { ...(world.animalKills ?? {}) };
  const birthMult = modifiersForSeason(season).birthMultiplier;
  const next: AnimalPopulation[] = [];
  for (const p of pops) {
    const params = populationParamsFor3D(p.speciesId);
    if (!params) {
      next.push(p);
      continue;
    }
    // Habitat food: herbivores + birds eat the forest, wolves eat
    // deer, chickens eat at camp, fish eat the river, domestic
    // stock eats grass.
    const target =
      p.speciesId === 'wolf'
        ? Math.max(0.1, Math.min(1, deerPop / deerCap))
        : p.speciesId === 'chicken'
          ? 0.8
          : p.speciesId === 'fish'
            ? 0.8
            : p.speciesId === 'sheep' || p.speciesId === 'cattle' || p.speciesId === 'pig' || p.speciesId === 'horse'
              ? 0.7
              : Math.max(0.15, Math.min(1, opts.forestDensity));
    const foodAvailability = Math.max(
      0.1,
      Math.min(1, p.foodAvailability + (target - p.foodAvailability) * 0.25),
    );
    const pressure = predatorPressureFor3D(p.speciesId, predatorPops);
    const stepped = simulatePopulationDayFloat(
      { ...p, foodAvailability, predatorPressure: pressure },
      { ...params, birthRate: params.birthRate * birthMult },
    );
    // Hunting, consumed per day (deviation 2): one recorded kill is
    // one animal gone; the count clears so it never double-applies.
    const k = Math.max(0, Math.floor(kills[p.speciesId] ?? 0));
    const afterHunt = Math.max(0, stepped.population - k);
    next.push({ ...stepped, population: afterHunt, lastSimDay: day });
    if (k > 0) kills[p.speciesId] = 0;
  }
  return { saplings, populations: next, matured, kills };
}

/**
 * Append matured saplings to the world as real trees and clear their
 * chop records — the tile has a tree again, so the near-miss regrowth
 * and the baseline count read it as a tree tile, not a removed one
 * (pickRegrowthTiles also excludes it via the standing-tree check, so
 * this cannot double-plant). Mutates the world (the stamp/apply pattern).
 */
export function applyMaturedTrees(world: IsoWorld, matured: MaturedTree[]): void {
  if (matured.length === 0) return;
  const keys = new Set(matured.map((m) => m.x + ',' + m.y));
  for (const m of matured) {
    if (!(world.trees ?? []).some((t) => t.tx === m.x && t.ty === m.y)) {
      if (!world.trees) world.trees = [];
      world.trees.push({ tx: m.x, ty: m.y });
    }
  }
  if (world.removedTrees) {
    world.removedTrees = world.removedTrees.filter((k) => !keys.has(k));
  }
  // BUILD 1110 (0x2D): the tree is back, so its stump is gone — a
  // stump only ever stands while its sapling grows.
  if (world.stumps) {
    world.stumps = world.stumps.filter((st) => !keys.has(st.x + ',' + st.y));
  }
}

/**
 * Record a hunting kill for a species (one animal gone at the next day
 * advance). Written by the wolf-slay path today and by the
 * recordHuntingKill test hook for deer (Phase 4 hunting will write the
 * same record). The counts persist on the world save, so a kill
 * survives a reload and still applies at the next day advance.
 */
export function recordAnimalKill(world: IsoWorld, kind: string): void {
  if (!world.animalKills) world.animalKills = {};
  world.animalKills[kind] = (world.animalKills[kind] ?? 0) + 1;
}

/** The regional population for a kind, or null when never stamped. */
export function populationFor(world: IsoWorld, kind: string): number | null {
  const p = (world.animalPopulations ?? []).find((x) => x.speciesId === kind);
  return p ? p.population : null;
}

/**
 * The live-animal cap for new spawns of a kind: the regional
 * population scaled onto the session cap (any nonzero population
 * shows at least one animal; an extinct population shows none).
 * Falls back to the full cap when the world was never stamped.
 * Existing live animals are never culled — the cap gates spawns only.
 */
export function liveAnimalCap(world: IsoWorld, kind: AnimalKind3D, maxCap: number): number {
  const p = (world.animalPopulations ?? []).find((x) => x.speciesId === kind);
  if (!p) return maxCap;
  const params = populationParamsFor3D(kind);
  if (!params || p.population <= 0) return 0;
  return Math.min(maxCap, Math.max(1, Math.ceil((p.population * maxCap) / params.carryingCapacity)));
}

/**
 * The ecosystem line for the stockpile E-report (deer / wolves /
 * saplings, live from the world save) — the player-visible counts.
 * BUILD 1102: the six new wildlife kinds + the sheep population
 * ride the same line, plus the pen (building progress, or the flock
 * + wool ready when done) and the animal stores (meat/fish in the
 * granary, wool/leather in the storehouse — passed in as numbers so
 * this module never imports the stores; ecosystems -> storehouse ->
 * founders -> ecosystems would be a cycle). Null when the world
 * has neither populations nor saplings nor pen nor stores.
 */
export function ecosystemSummaryText(
  world: IsoWorld,
  pen?: { site: { state: string; progress: number }; flock: number; woolReady: number; fedDay: number } | null,
  stores?: { meat: number; fish: number; wool: number; leather: number } | null,
): string | null {
  const pops = world.animalPopulations ?? [];
  const saplingCount = (world.saplings ?? []).length;
  if (pops.length === 0 && saplingCount === 0 && !pen && !stores) return null;
  const parts: string[] = [];
  const deer = populationFor(world, 'deer');
  const wolf = populationFor(world, 'wolf');
  if (deer !== null) parts.push('Deer ' + Math.round(deer));
  if (wolf !== null) parts.push('Wolves ' + Math.round(wolf));
  const rabbit = populationFor(world, 'rabbit');
  const boar = populationFor(world, 'boar');
  const elk = populationFor(world, 'elk');
  const fox = populationFor(world, 'fox');
  const bear = populationFor(world, 'bear');
  const fish = populationFor(world, 'fish');
  const sheep = populationFor(world, 'sheep');
  if (rabbit !== null) parts.push('Rabbits ' + Math.round(rabbit));
  if (boar !== null) parts.push('Boars ' + Math.round(boar));
  if (elk !== null) parts.push('Elk ' + Math.round(elk));
  if (fox !== null) parts.push('Foxes ' + Math.round(fox));
  if (bear !== null) parts.push('Bears ' + Math.round(bear));
  if (fish !== null) parts.push('Fish ' + Math.round(fish));
  if (sheep !== null) parts.push('Sheep ' + Math.round(sheep));
  if (saplingCount > 0) parts.push(saplingCount + ' sapling' + (saplingCount === 1 ? '' : 's'));
  if (pen && pen.site.state === 'building') parts.push('Pen building ' + pen.site.progress + '/6');
  if (pen && pen.site.state === 'done') {
    parts.push('Pen ' + Math.floor(pen.flock) + ' sheep' + (pen.woolReady >= 1 ? ' · ' + Math.floor(pen.woolReady) + ' wool ready' : ''));
  }
  if (stores) {
    if (stores.meat > 0) parts.push('Meat ' + Math.floor(stores.meat));
    if (stores.fish > 0) parts.push('Fish caught ' + Math.floor(stores.fish));
    if (stores.wool > 0) parts.push('Wool ' + Math.floor(stores.wool));
    if (stores.leather > 0) parts.push('Leather ' + Math.floor(stores.leather));
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
