/**
 * BUILD 1059 — Utility scorer (G25): the founders choose what to do
 * by scored utility, not a fixed priority. The vision brief's
 * recommendation is Sims-style utility AI, and the audit
 * (~/workspace/verify-vision/PLAN.md §2) found no utility-AI scorer
 * anywhere in the codebase — this is the one genuinely new engine
 * the vision needs. It replaces the 1057 fixed priority
 * (chooseFounderActivity: night → sleep; hunger ≤30 → eat; social
 * ≤25 → rest; else work), which is DELETED — the scorer IS the
 * decision, in the real-time tick and in the wait-step re-choice.
 *
 * SCORING FORMULA (all scores 0..1, highest wins; ties break by the
 * fixed order sleep > eat > build > work > rest — safety first, then
 * food, then the settlement's project, then gathering, then company;
 * deterministic, no randomness, so a choice is reproducible and
 * testable):
 *
 * - sleep = need(energy)^2 + (night ? 0.8 : 0), capped at 1.
 *   need(x) = (100 - x)/100. Night sleep dominates (energy 90 at
 *   night scores 0.81); by day a founder sleeps when energy is low
 *   (energy 20 → 0.64, energy 15 → 0.72).
 * - eat = foodStock > 0 ? need(hunger)^2 x 1.2 : 0, capped at 1.
 *   Gated on food — no food, no meal (the 1057 rule). Beats the
 *   hardest work (0.57) at hunger ≤ ~30, so the eat threshold while
 *   a build is pending matches the old priority; while idle it eats
 *   below ~44 (peckish, not starving — Sims-like, and the reason the
 *   30-meal stock lasts ~4 days instead of ~5).
 * - rest = need(social)^2 x 0.9. Beats the hardest work at social
 *   ≤ ~20; a lonely founder rests at camp instead of working.
 *   BUILD 1060: + a companionship premium when the founder's
 *   closest founder is at camp — 0.15 x ((closestAffinity - 50)/50)
 *   x need(social), so a lonely founder with a close friend at camp
 *   rests more eagerly than a lonely founder alone (affinity 90 →
 *   +0.12 x need; affinity 50, neutral → +0). The premium is the
 *   RELATIONSHIP effect over neutral company, not company itself —
 *   so the same needs score differently by who is at camp. The
 *   rest DESTINATION (a tile beside the closest founder) is picked
 *   by memory.ts restTileFor, not here — the scorer only scores.
 * - work (chop) = 0 when no tree is in range. Otherwise:
 *   - construction pending: 0.25 + 0.40 x min(1, needWood/12) -
 *     0.02 x min(8, treeDist), where needWood = max(0, 12 - spent -
 *     pile). Wood is worth most when the hut still needs it (pile 0
 *     → 0.57) and fades as the pile fills (pile 10, 2 still needed
 *     → 0.24).
 *   - hut done: 0.45 x max(0, 1 - pile/24) - 0.02 x min(8, treeDist),
 *     clamped ≥ 0. With the hut done the pile is a buffer, not a
 *     project: worth chopping into while it is small (pile 0 → 0.37)
 *     and worth nothing once it is large (pile ≥ 20 → 0) — this is
 *     the 1058 loose end closed: with the hut done and a full pile,
 *     the founders rest instead of chopping endlessly into a pile
 *     with no sink.
 *   - BUILD 1069 food term: work = max(chop, 0.65 x (1 - food/20))
 *     when a farm tile is ready and food < 20 (food 0 → 0.65, food
 *     10 → 0.325, food 20+ → 0). A finished settlement with a full
 *     pile still works for food — the 0x09 24h test proved the old
 *     scorer starved it (food 30 → 0, farm never ran). The term
 *     never beats night sleep (0.81) or a hungry founder's eat.
 *   - BUILD 1086 stone term: work = max(..., 0.45 x (1 - stone/12))
 *     when the WOOD pile is full (>= 24) and a quarry job is open
 *     and stone < 12 (stone 0 → 0.45, stone 6 → 0.225, stone 12+
 *     → 0). The gate is chopWork == 0, not the pile alone: a
 *     pile-full hut-pending chopWork (0.17) is below rest, so a
 *     stone term gated only on the pile would pull a founder off
 *     to a long quarry trip while the build drains the pile — the
 *     wood numbers moved (50/50/24, meals 8/23). Gating on
 *     chopWork == 0 means stone only diverts a founder who has no
 *     wood work to do, so the wood and food loops keep their 24h
 *     numbers. The work KIND (chop / harvest / quarry) is the STRICT
 *     argmax of the three terms — stone wins only outright, food
 *     wins ties over chop, chop wins ties over stone — so stone
 *     never steals a chop or a harvest on a tie.
 * - BUILD 1088 water term: work = max(..., 0.25 x (1 - food/20))
 *   when the well stands, a water job is open, the day is >= 3,
 *   and food < 20 (food 0 → 0.25, food 10 → 0.125, food 20+ →
 *   0). Watering wins only outright in the work-kind argmax, so
 *   it never steals a chop, a harvest, or a quarry on a tie.
 * - BUILD 1088 bridge branch: build scores for a startable bridge
 *   site once housing AND the storehouse are done (bridges third).
 * - BUILD 1089 mine term: work = max(..., 0.45 x (1 - iron/20))
 *   when a mine job is open, the storehouse is done, the day is
 *   >= 3, the storehouse holds less than MINE_IRON_TARGET iron,
 *   and there is NO wood work at all (woodWork == 0 — the chop /
 *   lumber terms are both 0, the pile is full). The miner works
 *   the stockpile on spare capacity: it beats idle rest (~0.14)
 *   and loses to night sleep (0.81), to a hungry founder's eat,
 *   and to the food term (0.65) — iron never steals from the
 *   wood/food loop, and the 24h window (day < 3) never sees it.
 * - BUILD 1089 lumber term: the chop formula WITHOUT the distance
 *   penalty (the lumber site is a planned destination, not a
 *   nearest-tree search) — when the site is designated and has
 *   trees, lumber is the preferred wood source (it wins ties over
 *   chop). It is the wood term, not a separate need: the pile /
 *   construction logic is the chop formula's, so the wood loop's
 *   24h numbers are the chop numbers (the site opens day 3).
 * - build = 0 unless construction is pending (state !== 'done') AND
 *   the pile holds a step's wood (≥ 2) AND nobody else is building
 *   (one builder — the site has one work tile). Then 0.80 - 0.02 x
 *   min(8, distToSite): building beats chopping whenever the pile
 *   holds wood for a step, even when a tree is nearer than the site.
 * - continuation bonus: +0.10 to the activity matching the founder's
 *   current job (chopping → work, building → build). A builder keeps
 *   building and a chopper is not yanked off a tree by a 0.02 score
 *   gap; and if the scorer still flips a mid-chop founder to build,
 *   the work-state machine finishes the current tree first (the tick
 *   executes work by workState, not by activity), so nothing stalls.
 *
 * DIVERGENCES FROM THE OLD PRIORITY (each asserted + probed):
 * (a) mid hunger (35) + low energy (20), day: old → work; scorer →
 *     sleep (0.64 > eat 0.51 > work 0.37).
 * (b) hut done + pile 24 + fine needs: old → work; scorer → rest
 *     (work 0, rest 0.14 wins).
 * (c) construction pending + pile 4 + tree 4 away: old → work;
 *     scorer → build (0.72 > work 0.30).
 *
 * Pure module (no React, no WebGL, no localStorage) so the sim and
 * the standalone asserts can import it directly. Scores are computed
 * live, never stored — no new save key, no version bump (the
 * founders save stays v2); the tick stores the last decision on the
 * founder state (session-only) so E can report WHY.
 */

import { isFounderNight } from './founders';
import type { FounderNeeds, FounderActivity } from './founders';
import { FARM_FOOD_THRESHOLD, healthWorkFactor } from './food';
import { QUARRY_STONE_TARGET } from './quarry';
import { HUT_APPROACH, HUT_COST_WOOD, HUT_WOOD_PER_STEP, hasReadyHutSite, nearestUnfinishedSite } from './construction';
import { STOREHOUSE_START_DAY, STOREHOUSE_STONE_PER_STEP, STOREHOUSE_WOOD_PER_STEP, storehouseReadyForPlacement, type StorehouseState } from './storehouse';
import { WELL_START_DAY } from './paths';
import { MINE_COAL_TARGET, MINE_IRON_TARGET, MINE_START_DAY } from './mines';
import { BAKE_FLOUR_PER_MEAL, BAKE_FOOD_THRESHOLD, GRIND_GRAIN_PER_BATCH } from './foodChain';
import { CARPENTER_TIMBER_PER_BATCH, SAW_WOOD_PER_BATCH, SMELT_COAL_PER_BATCH, SMELT_ORE_PER_BATCH, SMITH_INGOT_PER_TOOL } from './metalChain';
import { STOREHOUSE_CAPACITY_FURNITURE, STOREHOUSE_CAPACITY_INGOT, STOREHOUSE_CAPACITY_TIMBER, STOREHOUSE_CAPACITY_TOOL } from './storehouse';
import { GRANARY_CAPACITY_FLOUR } from './granary';
import type { ConstructionState } from './construction';

/** The five scored activities — the 1057 four plus 'build'. */
export type ScoredActivity = FounderActivity;

/** What the world looks like to the scorer, besides needs + clock. */
export type UtilityWorldContext = {
  /** Meals left in the shared camp stock. */
  foodStock: number;
  /** Wood in the founders' stockpile. */
  stockpileWood: number;
  /** The first hut's construction (pending vs done). */
  construction: ConstructionState;
  /** Manhattan distance camp → nearest tree in range, null when no
   *  tree is in range (nothing to chop). */
  nearestTreeDist: number | null;
  /** Manhattan distance founder → build-site approach tile. */
  distToSite: number;
  /** True when another founder is already building (one builder). */
  builderTaken: boolean;
  /** The founder's current job, for the continuation bonus — null
   *  when free (no tree targeted, not building). */
  currentJob: 'chop' | 'build' | null;
  /** BUILD 1060: the founder's highest effective affinity to any
   *  other founder (0..100, neutral 50 — memory.ts). Optional:
   *  absent means no relationship data (the 1059 asserts) and the
   *  companionship premium is 0, so old scores are unchanged. */
  closestAffinity?: number;
  /** BUILD 1060: true when the founder's closest founder is at
   *  camp (within 3 tiles of the camp centre) — the premium only
   *  applies when the friend is actually there to rest with. */
  companionAtCamp?: boolean;
  /** BUILD 1069: ready farm tiles within the founder's farm radius
   *  (farm.ts readyFarmTiles) — the food term only fires when there
   *  is wheat to harvest. Optional: absent means no farm data (the
   *  1059/1067 callers) and the food term is 0, so old scores are
   *  unchanged. */
  readyFarmTiles?: number;
  /** BUILD 1086: stone in the camp store — the stone term only
   *  fires while the pile is below the quarry target. Optional:
   *  absent means no stone data (the 1059/1067/1069 callers) and
   *  the stone term is 0, so old scores are unchanged. */
  stoneStock?: number;
  /** BUILD 1086: open quarry jobs on the board — the stone term
   *  only fires when there is a deposit or rock to mine. Optional:
   *  absent means no quarry data and the stone term is 0. */
  readyQuarryJobs?: number;
  /** BUILD 1086: another founder is already quarrying (walking to
   *  a rock, mining, or carrying stone back) — the stone term is 0
   *  for this founder, so only one founder ever has stone-driven
   *  'work' and the rest rest (an idle founder in 'work' stands on
   *  the camp centre and blocks every carrier's delivery, and never
   *  recovers the social that lets them chop again). Optional:
   *  absent means the slot is free. */
  quarryTaken?: boolean;
  /** BUILD 1087: the storehouse state — the build score fires for
   *  the storehouse project once housing is done and the day is
   *  old enough. Optional: absent means no storehouse data (the
   *  1059/1067/1069 callers) and the build score is the hut's
   *  alone, so old scores are unchanged. */
  storehouse?: StorehouseState;
  /** BUILD 1087: wood in the storehouse store — a hut build scores
   *  when EITHER the camp pile or the storehouse holds a step's
   *  wood (the builder fetches from the storehouse first).
   *  Optional: absent means 0. */
  storehouseWood?: number;
  /** BUILD 1087: the settlement day (the storehouse project only
   *  starts on STOREHOUSE_START_DAY). Optional: absent means 0. */
  day?: number;
  /** BUILD 1088: open water jobs on the board — the water term
   *  only fires when there is a growing tile to water. Optional:
   *  absent means no water data and the water term is 0. */
  readyWaterJobs?: number;
  /** BUILD 1088: the camp well (paths.ts wellTile) — the water term
   *  only fires when the well stands. Optional: absent means no
   *  well and the water term is 0. */
  well?: { x: number; y: number } | null;
  /** BUILD 1088: the bridge the founder would build — its distance
   *  (Manhattan to the bank tile) and whether it is startable
   *  (paths.ts bridgeBuildContext). Optional: absent means no
   *  bridge data and the bridge build branch stays off, so old
   *  scores are unchanged. */
  bridge?: { dist: number; ready: boolean } | null;
  /** BUILD 1087: the settlement still needs stone for (or in) the
   *  storehouse (the tick's quarry-radius gate is open) — the stone
   *  term rises to building urgency so it can beat the food term.
   *  Optional: absent means false (the 1059/1067/1069/1086 callers)
   *  and the stone term is unboosted, so old scores are unchanged. */
  storehouseStoneNeed?: boolean;
  /** BUILD 1089: open mine jobs on the board — the mine term only
   *  fires when there is a mine to work. Optional: absent means no
   *  mine data and the mine term is 0. */
  readyMineJobs?: number;
  /** BUILD 1089: another founder is already mining (walking to the
   *  mine, working a shift, or carrying ore back) — the mine term
   *  is 0 for this founder, so only one miner works at a time.
   *  Optional: absent means the slot is free. */
  mineTaken?: boolean;
  /** BUILD 1089: iron in the storehouse store — the mine term only
   *  fires while the stockpile is below MINE_IRON_TARGET.
   *  Optional: absent means 0. */
  storehouseIron?: number;
  /** BUILD 1095: coal in the storehouse store — the mine term
   *  fires while EITHER stockpile is below its target (iron or
   *  coal); the claim picks the mineral that is short. Optional:
   *  absent means 0. */
  storehouseCoal?: number;
  /** BUILD 1095: another founder is already mining COAL (the
   *  second mine's slot) — the mine term is 0 for this founder
   *  when the coal slot is taken and iron is not short. Optional:
   *  absent means the slot is free. */
  coalTaken?: boolean;
  /** BUILD 1095: ingots in the storehouse store — the smelt term
   *  only fires while there is room in the ingot store, and the
   *  smith term only while there are ingots to smith. Optional:
   *  absent means 0. */
  storehouseIngots?: number;
  /** BUILD 1095: tools in the storehouse store — the smith term
   *  only fires while there is room in the tool store, and the
   *  workshop build only while there is a tool to spend.
   *  Optional: absent means 0. */
  storehouseTools?: number;
  /** BUILD 1095: timber in the storehouse store — the saw term
   *  only fires while there is room in the timber store, and the
   *  carpenter term only while there is timber to carpenter.
   *  Optional: absent means 0. */
  storehouseTimber?: number;
  /** BUILD 1095: furniture in the storehouse store — the
   *  carpenter term only fires while there is room in the
   *  furniture store. Optional: absent means 0. */
  storehouseFurniture?: number;
  /** BUILD 1089: open lumber jobs on the board (trees in the
   *  designated rect) — the lumber term only fires when there is
   *  a tree to fell in the rotation. Optional: absent means no
   *  lumber data and the lumber term is 0. */
  readyLumberJobs?: number;
  /** BUILD 1090: open plant jobs on the board — the plant term
   *  only fires when there is a tile to plant. Optional: absent
   *  means no plant data and the plant term is 0. */
  readyPlantJobs?: number;
  /** BUILD 1094: open mill jobs on the board — the mill term only
   *  fires when there is grain to grind. Optional: absent means
   *  no mill data and the mill term is 0. */
  readyMillJobs?: number;
  /** BUILD 1094: open bake jobs on the board — the bake term only
   *  fires when there is flour to bake. Optional: absent means
   *  no bake data and the bake term is 0. */
  readyBakeJobs?: number;
  /** BUILD 1094: another founder is already milling — the mill
   *  term is 0 for this founder, so only one founder ever mills
   *  at a time. Optional: absent means the slot is free. */
  millTaken?: boolean;
  /** BUILD 1094: another founder is already baking — the bake
   *  term is 0 for this founder, so only one founder ever bakes
   *  at a time. Optional: absent means the slot is free. */
  bakeTaken?: boolean;
  /** BUILD 1094: grain in the granary store — the mill term only
   *  fires while there is grain to grind. Optional: absent
   *  means 0. */
  campGrain?: number;
  /** BUILD 1094: flour in the granary store — the mill term only
   *  fires while there is room in the flour store, and the bake
   *  term only while there is flour to bake. Optional: absent
   *  means 0. */
  campFlour?: number;
  /** BUILD 1095: open smelt jobs on the board — the smelt term
   *  only fires when there is a smelter to work. Optional: absent
   *  means no smelt data and the smelt term is 0. */
  readySmeltJobs?: number;
  /** BUILD 1095: open smith jobs on the board — the smith term
   *  only fires when there is a blacksmith to work. Optional:
   *  absent means no smith data and the smith term is 0. */
  readySmithJobs?: number;
  /** BUILD 1095: open saw jobs on the board — the saw term only
   *  fires when there is a sawmill to work. Optional: absent
   *  means no saw data and the saw term is 0. */
  readySawJobs?: number;
  /** BUILD 1095: open carpenter jobs on the board — the carpenter
   *  term only fires when there is a carpenter to work. Optional:
   *  absent means no carpenter data and the carpenter term is 0. */
  readyCarpenterJobs?: number;
  /** BUILD 1095: another founder is already smelting — the smelt
   *  term is 0 for this founder, so only one founder ever smelts
   *  at a time. Optional: absent means the slot is free. */
  smeltTaken?: boolean;
  /** BUILD 1095: another founder is already smithing — the smith
   *  term is 0 for this founder. Optional: absent means the slot
   *  is free. */
  smithTaken?: boolean;
  /** BUILD 1095: another founder is already sawing — the saw term
   *  is 0 for this founder. Optional: absent means the slot is
   *  free. */
  sawTaken?: boolean;
  /** BUILD 1095: another founder is already carpentering — the
   *  carpenter term is 0 for this founder. Optional: absent means
   *  the slot is free. */
  carpenterTaken?: boolean;
};

/** Full scorer input: needs + clock + world. */
export type UtilityContext = UtilityWorldContext & {
  needs: FounderNeeds;
  /** Clock minutes of the day (0..1439). */
  minutes: number;
};

/** One score per activity, 0..1. */
export type UtilityScores = Record<ScoredActivity, number>;

/** A scored decision: the winner, the full table, and the runner-up
 *  (so E can report WHY: "build 0.72 > work 0.30"). */
export type ScoredDecision = {
  activity: ScoredActivity;
  scores: UtilityScores;
  top: ScoredActivity;
  runnerUp: ScoredActivity;
  topScore: number;
  runnerUpScore: number;
  /** BUILD 1086: which work the founder should do when the
   *  activity is 'work' — the argmax of the chop / food / stone
   *  terms (null when no work is worth doing). BUILD 1089: the
   *  mine and the lumber join the argmax (see workTermsFor).
   *  BUILD 1090: planting joins it too. */
  workKind: 'chop' | 'harvest' | 'quarry' | 'water' | 'mine' | 'lumber' | 'plant' | 'mill' | 'bake' | 'smelt' | 'smith' | 'saw' | 'carpenter' | null;
  /** BUILD 1086: the chop term itself — the assignment gates the
   *  chop fallback on it, so a founder whose activity is 'work'
   *  (stone or food) but who cannot claim a harvest/quarry job
   *  does not fall through to chopping a full pile. */
  chopWork: number;
};

/** Fixed tie-break order: sleep > eat > build > work > rest. */
export const UTILITY_TIE_ORDER: ScoredActivity[] = ['sleep', 'eat', 'build', 'work', 'rest'];

/** Night sleep bonus (sleep dominates at night). */
export const UTILITY_NIGHT_BONUS = 0.8;
/** Eat weight (hunger need squared x this). */
export const UTILITY_EAT_WEIGHT = 1.2;
/** Rest weight (social need squared x this). */
export const UTILITY_REST_WEIGHT = 0.9;
/** Build base score (before the distance penalty). */
export const UTILITY_BUILD_BASE = 0.8;
/** Distance penalty per tile (capped at 8 tiles). */
export const UTILITY_DIST_PENALTY = 0.02;
/** Continuation bonus for the founder's current job. */
export const UTILITY_CONTINUATION_BONUS = 0.1;
/** Pile size at which chopping for the buffer is worth nothing
 *  (hut done). */
export const UTILITY_PILE_FULL = 24;
/** BUILD 1060: companionship premium on rest — the most a close
 *  friend at camp can add (at affinity 100 and full social need). */
export const UTILITY_COMPANION_BONUS = 0.15;
/** BUILD 1069: the food term — the most work is worth for food
 *  alone (food 0 with a ready farm tile). Below night sleep (0.81)
 *  and a hungry founder's eat (up to 1.2), above idle rest. */
export const UTILITY_FOOD_TERM_MAX = 0.65;
/** BUILD 1086: the stone term — the most work is worth for stone
 *  alone (stone 0 with an open quarry job and a full wood pile).
 *  IDLE-TIME ONLY (0.03): below every mild need — eat is 0.048 at
 *  hunger 80, rest ~0.14 at social 60, sleep 0.01 at energy 90 — so
 *  stone only wins when the founder is nearly satisfied (all needs
 *  high, pile full, food fine). A founder who still needs to eat,
 *  rest, or sleep does that first; stone never steals from the
 *  wood/food loop, so the 24h numbers stay byte-identical. */
export const UTILITY_STONE_TERM_MAX = 0.03;

/** BUILD 1088: the water term — the most work is worth for
 *  watering alone (food 0 with an open water job and a well).
 *  Below night sleep (0.81) and a hungry founder's eat, above
 *  idle rest (~0.14 at social 60) — watering is real work with a
 *  real payoff (a tile ready sooner), done on spare capacity, and
 *  gated on day 3 by the job, so the 24h window never sees it. */
export const UTILITY_WATER_TERM_MAX = 0.25;

/** BUILD 1089: the mine term — the most work is worth for iron
 *  alone (an open mine job, the storehouse done, day 3+, the
 *  stockpile below target, no wood work). Below night sleep
 *  (0.81) and a hungry founder's eat, above idle rest — the
 *  miner works the stockpile on spare capacity, and the term
 *  fades as the storehouse fills (iron 20 → 0). */
export const UTILITY_MINE_TERM_MAX = 0.45;

/** BUILD 1090: the plant term — the most work is worth for planting
 *  alone (an open plant job, food 0). Below the food term (0.65 —
 *  a ready tile always outranks a tile to plant), below night sleep
 *  (0.81) and a hungry founder's eat, above idle rest — planting
 *  is real work with a real payoff (the field that feeds the camp),
 *  done on spare capacity, and it fades as the granary fills
 *  (food 20 → 0). */
export const UTILITY_PLANT_TERM_MAX = 0.45;

/** BUILD 1094: the mill term — the most work is worth for milling
 *  alone (an open mill job, grain to grind, room in the flour
 *  store). A background task: above idle chopping (a full pile),
 *  below the hut build (chopWork up to 0.65 when the hut needs
 *  wood), below night sleep (0.81) and a hungry founder's eat —
 *  milling never steals a harvest, a bake, or a lumber on a tie.
 *  It fades when the grain runs out or the flour store fills.
 *  WEEK FIX: the term RISES as the bakery runs out of flour AND
 *  the camp runs out of food (UTILITY_MILL_URGENCY) — a flat 0.55
 *  loses to the food term (0.65 at food 0) exactly when the chain
 *  is the bottleneck, so the founders harvest grain they cannot
 *  eat while the mill sits idle (day 6: flour 90, grain 102, mill
 *  jobs +0). Capped at 0.75, still below night sleep (0.81). */
export const UTILITY_MILL_TERM_MAX = 0.55;

/** BUILD 1094 (week fix): the mill urgency — how much the mill
 *  term rises when the bakery is short of flour and the camp is
 *  short of food. 0.2: 0.55 + 0.2 = 0.75 at flour 0 + food 0,
 *  back to 0.55 when the camp is fed (food 20+) or the flour
 *  store is full. */
export const UTILITY_MILL_URGENCY = 0.2;

/** BUILD 1094: the bake term — the most work is worth for baking
 *  alone (an open bake job, flour to bake, food below 15). The
 *  direct path to food: above chopping and lumber when the pile
 *  is satisfied, below night sleep (0.81) and a hungry founder's
 *  eat. It fades when the flour runs out or the camp is fed.
 *  WEEK FIX: the term RISES as the camp runs out of food
 *  (UTILITY_BAKE_URGENCY) — a flat 0.6 loses to the food term
 *  (0.65 at food 0) exactly when baking matters most, so the
 *  founders harvest grain they cannot eat while the bakery sits
 *  idle and the settlement starves (day 6: food 0, flour 90,
 *  bake jobs +1). Capped at 0.8, still below night sleep (0.81).
 *  Baking now BEATS a ready harvest when food is short: harvest
 *  grows grain, bake grows meals, and meals are what the camp
 *  eats. */
export const UTILITY_BAKE_TERM_MAX = 0.6;

/** BUILD 1094 (week fix): the bake urgency — how much the bake
 *  term rises as the camp runs out of food. 0.2: 0.6 + 0.2 = 0.8
 *  at food 0, back to 0.6 when the camp is fed (food 15). */
export const UTILITY_BAKE_URGENCY = 0.2;

/** BUILD 1095: the smelt term — the most work is worth for
 *  smelting alone (an open smelt job, ore + coal to smelt, room
 *  in the ingot store). A background task: above idle chopping
 *  (a full pile), below the hut build, below night sleep (0.81)
 *  and a hungry founder's eat — smelting never steals a harvest,
 *  a bake, or a mill on a tie. It fades when the ore, the coal,
 *  or the ingot room runs out. */
export const UTILITY_SMELT_TERM_MAX = 0.55;

/** BUILD 1095: the smith term — the most work is worth for
 *  smithing alone (an open smith job, ingots to smith, room in
 *  the tool store). Same shape as the smelt term: a background
 *  task that never steals a harvest, a bake, a mill, or a smelt
 *  on a tie. */
export const UTILITY_SMITH_TERM_MAX = 0.55;

/** BUILD 1095: the saw term — the most work is worth for sawing
 *  alone (an open saw job, wood to saw, room in the timber
 *  store). Same shape as the smelt term, one step lower (0.5):
 *  timber is a bulk good, not a bottleneck — sawing never steals
 *  a harvest, a bake, a mill, a smelt, or a smith on a tie. */
export const UTILITY_SAW_TERM_MAX = 0.3;

/** BUILD 1095: the carpenter term — the most work is worth for
 *  carpentry alone (an open carpenter job, timber to carpenter,
 *  room in the furniture store). Same shape as the saw term
 *  (0.5): furniture is a bulk good — carpentry never steals a
 *  harvest, a bake, a mill, a smelt, a smith, or a saw on a
 *  tie. */
export const UTILITY_CARPENTER_TERM_MAX = 0.5;

/** need(x) = (100 - x)/100 — 0 when satisfied, 1 when empty. */
export function utilityNeed(value: number): number {
  return Math.max(0, Math.min(1, (100 - value) / 100));
}

/**
 * Score all five activities from needs + context. Pure. Every score
 * is clamped to 0..1; gates return exactly 0 (eat with no food,
 * work with no tree in range, build when the hut is done / the pile
 * is short / another founder is building).
 */
/**
 * BUILD 1086: the three work terms + which work wins. Chop (the hut
 * / the pile), food (a ready farm tile while the camp is short),
 * stone (an open quarry job while the pile is below target AND
 * there is no chop work at all — chopWork == 0, the M1069 guard).
 * The work kind is the STRICT argmax: stone wins only when it beats
 * both chop and food outright, food wins ties over chop, chop wins
 * ties over stone — so stone never steals a chop or a harvest on a
 * tie, and the M1069 numbers stay put. One helper — the scorer and
 * the decision both read it, so they never disagree about which
 * work wins.
 */
function workTermsFor(ctx: UtilityContext): {
  chopWork: number;
  foodTerm: number;
  stoneTerm: number;
  waterTerm: number;
  mineTerm: number;
  lumberTerm: number;
  plantTerm: number;
  work: number;
  millTerm: number;
  bakeTerm: number;
  smeltTerm: number;
  smithTerm: number;
  sawTerm: number;
  carpenterTerm: number;
  workKind: 'chop' | 'harvest' | 'quarry' | 'water' | 'mine' | 'lumber' | 'plant' | 'mill' | 'bake' | 'smelt' | 'smith' | 'saw' | 'carpenter' | null;
} {
  const { foodStock, stockpileWood, construction, nearestTreeDist } = ctx;
  const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
  const distPenalty = (d: number): number => UTILITY_DIST_PENALTY * Math.min(8, Math.max(0, d));
  let chopWork = 0;
  if (nearestTreeDist !== null) {
    if (construction.state !== 'done') {
      const needWood = Math.max(0, HUT_COST_WOOD - construction.spentWood - stockpileWood);
      chopWork = clamp01(0.25 + 0.4 * Math.min(1, needWood / HUT_COST_WOOD) - distPenalty(nearestTreeDist));
    } else {
      chopWork = clamp01(0.45 * Math.max(0, 1 - stockpileWood / UTILITY_PILE_FULL) - distPenalty(nearestTreeDist));
    }
  }
  // BUILD 1069: the food term — when the camp is short of food
  // (below FARM_FOOD_THRESHOLD) and a farm tile is ready, work is
  // worth doing for the food alone. It scales with the shortage
  // (food 0 → UTILITY_FOOD_TERM_MAX, food 10 → half, food 20+ → 0)
  // and combines with the chop term by max, not addition: a founder
  // already chopping for a needed hut gets no double score, and a
  // founder with a full pile and a done hut still works for food.
  // It never beats night sleep (0.81) or a hungry founder's eat
  // (up to 1.2 when food is on hand) — food work yields to sleep
  // and meals, and beats rest and idle chopping. No ready tile, no
  // term (nothing to harvest).
  const readyTiles = ctx.readyFarmTiles ?? 0;
  const foodTerm =
    readyTiles > 0 && foodStock < FARM_FOOD_THRESHOLD
      ? UTILITY_FOOD_TERM_MAX * Math.max(0, 1 - foodStock / FARM_FOOD_THRESHOLD)
      : 0;
  // BUILD 1086: the stone term — when the camp is short of stone
  // (below QUARRY_STONE_TARGET) and a quarry job is open AND there
  // is NO chop work at all (chopWork is exactly 0 — the pile is
  // full and the hut is done, or no tree is in range), work is worth
  // doing for the stone alone. Same shape as the food term (max, not
  // addition). The chopWork gate is the M1069 guard: a pile-full
  // hut-pending chopWork (0.17) is BELOW rest, so a stone term gated
  // only on the pile would pull a founder off to a long quarry trip
  // while the build drains the pile — the wood numbers moved
  // (50/50/24, meals 8/23). Gating on chopWork == 0 means stone
  // only diverts a founder who has no wood work to do, so the wood
  // and food loops keep their 24h numbers. It never beats night
  // sleep or a hungry founder's eat, and it never steals a chop or
  // a harvest on a tie (the work kind below is the STRICT argmax).
  // BUILD 1089: the lumber term — the chop formula WITHOUT the
  // distance penalty (the site is a planned destination, not a
  // nearest-tree search). When the site is designated and has
  // trees, lumber is the preferred wood source: it wins ties over
  // chop (the argmax below). It is the wood term — the pile /
  // construction logic is the chop formula's, so the wood loop
  // reads the same numbers (the site opens day 3, so the 24h
  // window never sees it: readyLumberJobs is 0 there).
  const readyLumber = ctx.readyLumberJobs ?? 0;
  let lumberTerm = 0;
  if (readyLumber > 0) {
    if (construction.state !== 'done') {
      const needWood = Math.max(0, HUT_COST_WOOD - construction.spentWood - stockpileWood);
      lumberTerm = clamp01(0.25 + 0.4 * Math.min(1, needWood / HUT_COST_WOOD));
    } else {
      lumberTerm = clamp01(0.45 * Math.max(0, 1 - stockpileWood / UTILITY_PILE_FULL));
    }
  }
  const stoneStock = ctx.stoneStock ?? 0;
  const readyQuarry = ctx.readyQuarryJobs ?? 0;
  const quarryTaken = ctx.quarryTaken ?? false;
  // BUILD 1089: the stone gate is NO wood work (chop OR lumber) —
  // the lumber term is the wood term once the site is designated,
  // so stone must not fire while the crew is lumbering. In the
  // 24h window the lumber term is 0, so the gate is exactly
  // chopWork === 0 and the M1069 guard is unchanged.
  const stoneTermRaw =
    readyQuarry > 0 && !quarryTaken && stoneStock < QUARRY_STONE_TARGET && chopWork === 0 && lumberTerm === 0
      ? UTILITY_STONE_TERM_MAX * Math.max(0, 1 - stoneStock / QUARRY_STONE_TARGET)
      : 0;
  // BUILD 1087: while the settlement needs stone for (or in) the
  // storehouse, the stone term rises to building urgency (0.8) so
  // it can beat the food term — otherwise the storehouse stalls at
  // 5/6 in the post-day-2 food crisis (the 0.03 term never wins
  // against food 0.65, and the last stone never comes). It still
  // loses to night sleep (0.81) and to a hungry founder's eat, and
  // only an idle founder (workState 'toTree') can claim the quarry
  // job, so a mid-build builder is never pulled off the site.
  // Gated on the tick's storehouse-need flag, so the 24h window
  // (storehouse 'none', day < 3) never sees it.
  const stoneTerm = (ctx.storehouseStoneNeed ?? false) && stoneTermRaw > 0 ? Math.max(stoneTermRaw, UTILITY_BUILD_BASE) : stoneTermRaw;
  // BUILD 1088: the water term — when the camp is short of food
  // (below FARM_FOOD_THRESHOLD) and a water job is open and the
  // well stands and the settlement is old enough (day >= 3 — the
  // job's own gate, mirrored here so the term can never fire in
  // the 24h window), work is worth doing for the water alone. It
  // scales with the shortage like the food term (food 0 →
  // UTILITY_WATER_TERM_MAX, food 10 → half, food 20+ → 0) and
  // combines by max, not addition. It never beats night sleep or
  // a hungry founder's eat, and it never steals a chop, a harvest,
  // or a quarry on a tie (the work kind below is the STRICT
  // argmax — water wins only outright).
  const readyWater = ctx.readyWaterJobs ?? 0;
  const waterTerm =
    ctx.well && readyWater > 0 && (ctx.day ?? 0) >= WELL_START_DAY && foodStock < FARM_FOOD_THRESHOLD
      ? UTILITY_WATER_TERM_MAX * Math.max(0, 1 - foodStock / FARM_FOOD_THRESHOLD)
      : 0;
  // The wood work is the max of the two wood terms (ad-hoc chop
  // vs the designated lumber site) — the stone term gates on NO
  // wood work at all, so it never steals from the wood loop. In
  // the 24h window the lumber term is 0, so the stone gate is
  // exactly chopWork === 0 and the M1069 guard is unchanged.
  // BUILD 1089: the mine term — when a mine job is open, the
  // storehouse is done (ore has somewhere to go), the settlement
  // is old enough (day 3 — the job's own gate, mirrored here so
  // the term can never fire in the 24h window), and the
  // storehouse holds less than a mineral target. It scales with
  // the stockpile shortage (iron 0 → UTILITY_MINE_TERM_MAX,
  // iron 20 → 0) and combines by max. It never beats night sleep
  // or a hungry founder's eat, and it never steals a chop, a
  // harvest, a quarry, or a lumber on a tie (the work kind below
  // is the STRICT argmax — mine wins only outright over the
  // others, and only over chop when strictly greater, so it never
  // wins on a tie with an empty pile).
  // BUILD 1095: the mine term has NO wood-work gate. The 1089
  // gate (woodWork === 0 — the pile exactly full) is unreachable
  // once the sawmill runs: the sawmill is a continuous wood sink,
  // so the pile never sits exactly full, chopWork never hits 0,
  // and the term is 0 for the whole week — no mining, no ore, no
  // ingots, no tools, and the settlement starves on the chop load
  // (the 1095 week run: mine shifts 0, starvedTicks 6155 vs the
  // 1094 baseline of 63). The argmax already enforces "spare
  // capacity": mine sits last, it must beat chopWork outright, and
  // chopWork is 0.45 only when the pile is empty — so mining fires
  // when the pile is non-empty and nothing else is hotter, which
  // is the spare-capacity behaviour the gate was meant to encode.
  const readyMine = ctx.readyMineJobs ?? 0;
  const mineTaken = ctx.mineTaken ?? false;
  const coalTaken = ctx.coalTaken ?? false;
  const storehouseIron = ctx.storehouseIron ?? 0;
  const storehouseCoal = ctx.storehouseCoal ?? 0;
  // BUILD 1095: the mine term fires while EITHER stockpile is
  // below its target (iron or coal) and the slot for the short
  // mineral is free — the iron slot and the coal slot are
  // separate, so two miners work in parallel (one iron, one
  // coal). The term scales with the SCARCEST mineral (the min
  // of the two ratios), so it stays hot while either is short.
  // The claim picks the short mineral (see the tick). In the
  // 24h window the term never fires (day < 3, readyMine 0).
  const ironNeeded = storehouseIron < MINE_IRON_TARGET;
  const coalNeeded = storehouseCoal < MINE_COAL_TARGET;
  const mineSlotFree = (ironNeeded && !mineTaken) || (coalNeeded && !coalTaken);
  const mineTerm =
    readyMine > 0 && mineSlotFree && ctx.storehouse !== undefined && ctx.storehouse.state === 'done' &&
    (ctx.day ?? 0) >= MINE_START_DAY && (ironNeeded || coalNeeded)
      ? UTILITY_MINE_TERM_MAX * Math.max(0, 1 - Math.min(storehouseIron / MINE_IRON_TARGET, storehouseCoal / MINE_COAL_TARGET))
      : 0;
  // BUILD 1090: the plant term — when the camp is short of food
  // (below FARM_FOOD_THRESHOLD) and a plant job is open, work is
  // worth doing for the planting alone. It scales with the shortage
  // like the food term (food 0 → UTILITY_PLANT_TERM_MAX, food 10 →
  // half, food 20+ → 0) and combines by max, not addition. It never
  // beats night sleep or a hungry founder's eat, and it never steals
  // a harvest: the food term (0.65 max) is always above it (0.45
  // max) at the same food level, so whenever a tile is ready the
  // harvest branch below wins first — planting fires only when
  // nothing is ready to harvest. No day gate (it must fire day 1,
  // when the granary is empty and the field is 4 of 8).
  const readyPlant = ctx.readyPlantJobs ?? 0;
  const plantTerm =
    readyPlant > 0 && foodStock < FARM_FOOD_THRESHOLD
      ? UTILITY_PLANT_TERM_MAX * Math.max(0, 1 - foodStock / FARM_FOOD_THRESHOLD)
      : 0;
  // BUILD 1094: the mill term — when a mill job is open (the mill
  // is done and there is grain to grind and room in the flour
  // store) and no other founder is milling, work is worth doing
  // for the flour alone. Flat (0.55): milling is a background
  // task — it beats idle chopping (a full pile) but never beats
  // the hut build (chopWork up to 0.65 when the hut needs wood),
  // night sleep (0.81), or a hungry founder's eat. It never
  // steals a harvest, a bake, or a lumber on a tie (the argmax
  // below puts it after those, before the mine — food before iron).
  const readyMill = ctx.readyMillJobs ?? 0;
  const millTaken = ctx.millTaken ?? false;
  const campGrain = ctx.campGrain ?? 0;
  const campFlour = ctx.campFlour ?? 0;
  const millTerm =
    readyMill > 0 && !millTaken && campGrain >= GRIND_GRAIN_PER_BATCH && campFlour < GRANARY_CAPACITY_FLOUR
      ? UTILITY_MILL_TERM_MAX +
        UTILITY_MILL_URGENCY *
          Math.max(0, 1 - campFlour / GRANARY_CAPACITY_FLOUR) *
          Math.max(0, 1 - foodStock / FARM_FOOD_THRESHOLD)
      : 0;
  // BUILD 1094: the bake term — when a bake job is open (the
  // bakery is done and there is flour to bake and the camp is
  // short of food) and no other founder is baking, work is worth
  // doing for the meals alone. Flat (0.6): baking is the direct
  // path to food — it beats chopping and lumber when the pile is
  // satisfied, but never beats a ready harvest (the food term
  // wins first — harvest the tile, then bake), night sleep, or a
  // hungry founder's eat.
  const readyBake = ctx.readyBakeJobs ?? 0;
  const bakeTaken = ctx.bakeTaken ?? false;
  const bakeTerm =
    readyBake > 0 && !bakeTaken && campFlour >= BAKE_FLOUR_PER_MEAL && foodStock < BAKE_FOOD_THRESHOLD
      ? UTILITY_BAKE_TERM_MAX + UTILITY_BAKE_URGENCY * Math.max(0, 1 - foodStock / BAKE_FOOD_THRESHOLD)
      : 0;
  // BUILD 1095: the chain terms — when a chain job is open (the
  // building is done and there is input to process and room in
  // the output store) and no other founder is working that
  // building, work is worth doing for the chain output alone.
  // Flat (smelt/smith 0.55, carpenter 0.5, saw 0.3): background
  // tasks — they beat idle chopping (a full pile) but never beat
  // the hut build, night sleep, or a hungry founder's eat. The
  // saw is 0.3, BELOW chop's 0.45 max, because sawing consumes
  // wood: at 0.5 it beat chop whenever wood was on hand, so the
  // sawmill ran as a continuous wood sink, tripled the chop load,
  // and starved the settlement (the 1095 week run: meals 115 vs
  // the 1094 baseline of 152, starvedTicks 6155 vs 63). At 0.3
  // the saw only wins when the pile is over a third full
  // (chopWork < 0.3) — it runs on surplus wood. Smelt/smith/
  // carpenter stay higher (0.55/0.55/0.5) because their inputs
  // are bounded (ore, ingots, timber) — they cannot run away.
  // The argmax below puts them after the mill and the bake,
  // before food — food before iron. In the 24h window every
  // chain term is 0 (the chain opens day 3+), so the M1069
  // numbers are unaffected.
  const readySmelt = ctx.readySmeltJobs ?? 0;
  const smeltTaken = ctx.smeltTaken ?? false;
  const smeltTerm =
    readySmelt > 0 && !smeltTaken && storehouseIron >= SMELT_ORE_PER_BATCH && storehouseCoal >= SMELT_COAL_PER_BATCH && (ctx.storehouseIngots ?? 0) < STOREHOUSE_CAPACITY_INGOT
      ? UTILITY_SMELT_TERM_MAX
      : 0;
  const readySmith = ctx.readySmithJobs ?? 0;
  const smithTaken = ctx.smithTaken ?? false;
  const smithTerm =
    readySmith > 0 && !smithTaken && (ctx.storehouseIngots ?? 0) >= SMITH_INGOT_PER_TOOL && (ctx.storehouseTools ?? 0) < STOREHOUSE_CAPACITY_TOOL
      ? UTILITY_SMITH_TERM_MAX
      : 0;
  const readySaw = ctx.readySawJobs ?? 0;
  const sawTaken = ctx.sawTaken ?? false;
  const sawTerm =
    readySaw > 0 && !sawTaken && (ctx.storehouseWood ?? 0) >= SAW_WOOD_PER_BATCH && (ctx.storehouseTimber ?? 0) < STOREHOUSE_CAPACITY_TIMBER
      ? UTILITY_SAW_TERM_MAX
      : 0;
  const readyCarpenter = ctx.readyCarpenterJobs ?? 0;
  const carpenterTaken = ctx.carpenterTaken ?? false;
  const carpenterTerm =
    readyCarpenter > 0 && !carpenterTaken && (ctx.storehouseTimber ?? 0) >= CARPENTER_TIMBER_PER_BATCH && (ctx.storehouseFurniture ?? 0) < STOREHOUSE_CAPACITY_FURNITURE
      ? UTILITY_CARPENTER_TERM_MAX
      : 0;
  const work = Math.max(chopWork, foodTerm, stoneTerm, waterTerm, mineTerm, lumberTerm, plantTerm, millTerm, bakeTerm, smeltTerm, smithTerm, sawTerm, carpenterTerm);
  let workKind: 'chop' | 'harvest' | 'quarry' | 'water' | 'mine' | 'lumber' | 'plant' | 'mill' | 'bake' | 'smelt' | 'smith' | 'saw' | 'carpenter' | null = null;
  if (waterTerm > 0 && waterTerm > chopWork && waterTerm > foodTerm && waterTerm > stoneTerm && waterTerm > mineTerm && waterTerm > lumberTerm && waterTerm > plantTerm && waterTerm > millTerm && waterTerm > bakeTerm) workKind = 'water';
  else if (stoneTerm > 0 && stoneTerm > chopWork && stoneTerm > foodTerm && stoneTerm > mineTerm && stoneTerm > lumberTerm && stoneTerm > plantTerm && stoneTerm > millTerm && stoneTerm > bakeTerm) workKind = 'quarry';
  else if (plantTerm > 0 && plantTerm > chopWork && plantTerm > foodTerm && plantTerm >= lumberTerm && plantTerm >= mineTerm && plantTerm >= millTerm && plantTerm >= bakeTerm) workKind = 'plant';
  else if (bakeTerm > 0 && bakeTerm >= chopWork && bakeTerm >= lumberTerm && bakeTerm >= mineTerm && bakeTerm >= millTerm && bakeTerm >= foodTerm) workKind = 'bake';
  else if (millTerm > 0 && millTerm >= chopWork && millTerm >= lumberTerm && millTerm >= mineTerm && millTerm >= foodTerm) workKind = 'mill';
  else if (smeltTerm > 0 && smeltTerm >= chopWork && smeltTerm >= lumberTerm && smeltTerm >= mineTerm && smeltTerm >= foodTerm) workKind = 'smelt';
  else if (smithTerm > 0 && smithTerm >= chopWork && smithTerm >= lumberTerm && smithTerm >= mineTerm && smithTerm >= foodTerm) workKind = 'smith';
  else if (sawTerm > 0 && sawTerm >= chopWork && sawTerm >= lumberTerm && sawTerm >= mineTerm && sawTerm >= foodTerm) workKind = 'saw';
  else if (carpenterTerm > 0 && carpenterTerm >= chopWork && carpenterTerm >= lumberTerm && carpenterTerm >= mineTerm && carpenterTerm >= foodTerm) workKind = 'carpenter';
  else if (foodTerm > 0 && foodTerm >= chopWork && foodTerm >= lumberTerm && foodTerm >= mineTerm) workKind = 'harvest';
  else if (lumberTerm > 0 && lumberTerm >= chopWork && lumberTerm >= mineTerm && lumberTerm >= millTerm) workKind = 'lumber';
  else if (mineTerm > 0 && mineTerm > chopWork) workKind = 'mine';
  else if (chopWork > 0) workKind = 'chop';
  return { chopWork, foodTerm, stoneTerm, waterTerm, mineTerm, lumberTerm, plantTerm, millTerm, bakeTerm, smeltTerm, smithTerm, sawTerm, carpenterTerm, work, workKind };
}

export function scoreFounderActivities(ctx: UtilityContext): UtilityScores {
  const { needs, minutes, foodStock, stockpileWood, construction, nearestTreeDist, distToSite, builderTaken, currentJob } = ctx;
  const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
  const distPenalty = (d: number): number => UTILITY_DIST_PENALTY * Math.min(8, Math.max(0, d));

  const sleep = clamp01(utilityNeed(needs.energy) ** 2 + (isFounderNight(minutes) ? UTILITY_NIGHT_BONUS : 0));
  const eat = foodStock > 0 ? clamp01(utilityNeed(needs.hunger) ** 2 * UTILITY_EAT_WEIGHT) : 0;
  // BUILD 1060: the companionship premium — a lonely founder rests
  // more eagerly when their closest founder is at camp. The premium
  // scales with affinity ABOVE neutral (50): a neutral 50 adds
  // nothing, a close 90 adds 0.15 x 0.8 x need(social). Absent
  // relationship data (the 1059 callers) the premium is 0.
  const companionBonus =
    ctx.companionAtCamp && ctx.closestAffinity !== undefined
      ? UTILITY_COMPANION_BONUS * Math.max(0, (ctx.closestAffinity - 50) / 50) * utilityNeed(needs.social)
      : 0;
  const rest = clamp01(utilityNeed(needs.social) ** 2 * UTILITY_REST_WEIGHT + companionBonus);

  // The work terms (chop / food / stone) live in workTermsFor —
  // the scorer and the decision both read the one helper.
  let work = workTermsFor(ctx).work;

  let build = 0;
  // BUILD 1087: the build score fires for the project that is
  // actually pending. A hut scores when EITHER store holds a
  // step's wood (the camp pile, or the storehouse once it exists
  // — the builder fetches from the storehouse first). The
  // storehouse itself scores once housing is done, the settlement
  // is old enough, and the CAMP pile holds a step's wood + stone
  // (the storehouse draws from camp — it does not exist yet to
  // draw from). With no storehouse data (the old callers) both
  // branches reduce to the old hut-only gate, so old scores are
  // unchanged.
  // BUILD 1087 (ready-site fix): a site at full progress whose
  // placement has not landed scores with NO materials on hand —
  // the placement retry is free (the step spend returns completed
  // without spending), so gating it on wood/stone strands the
  // project: the builder releases the job, the score stays 0,
  // nobody re-claims it, and the job sits open forever (diag F).
  if (!builderTaken) {
    if (construction.state !== 'done' && (stockpileWood >= HUT_WOOD_PER_STEP || (ctx.storehouseWood ?? 0) >= HUT_WOOD_PER_STEP || hasReadyHutSite(construction))) {
      build = clamp01(UTILITY_BUILD_BASE - distPenalty(distToSite));
    } else if (
      construction.state === 'done' &&
      ctx.storehouse !== undefined &&
      ctx.storehouse.state !== 'done' &&
      (storehouseReadyForPlacement(ctx.storehouse) ||
        ((ctx.day ?? 0) >= STOREHOUSE_START_DAY &&
          stockpileWood >= STOREHOUSE_WOOD_PER_STEP &&
          (ctx.stoneStock ?? 0) >= STOREHOUSE_STONE_PER_STEP))
    ) {
      build = clamp01(UTILITY_BUILD_BASE - distPenalty(distToSite));
    } else if (
      construction.state === 'done' &&
      ctx.storehouse !== undefined &&
      ctx.storehouse.state === 'done' &&
      ctx.bridge !== undefined &&
      ctx.bridge !== null &&
      ctx.bridge.ready
    ) {
      // BUILD 1088: the bridge build — housing done, storage done,
      // a bridge site startable (paths.ts bridgeBuildContext).
      // The distance is the bridge's own (to its bank tile), not
      // the hut/storehouse distance.
      build = clamp01(UTILITY_BUILD_BASE - distPenalty(ctx.bridge.dist));
    }
  }

  // BUILD 1067: a weak founder works at half strength, a collapsed
  // one (health 0) cannot work at all — starvation has a real
  // consequence for the workforce, not just the need bar. Sleep /
  // eat / rest are unaffected (a weak founder still sleeps, eats,
  // and rests — that is how they recover).
  const weakFactor = healthWorkFactor(needs.health);
  work *= weakFactor;
  build *= weakFactor;

  const scores: UtilityScores = { sleep, eat, rest, work, build };
  // Continuation bonus: the founder's current job scores a little
  // higher, so a builder keeps building and a chopper is not yanked
  // off a tree by a 0.02 gap.
  if (currentJob === 'chop') scores.work = clamp01(scores.work + UTILITY_CONTINUATION_BONUS);
  if (currentJob === 'build') scores.build = clamp01(scores.build + UTILITY_CONTINUATION_BONUS);
  return scores;
}

/**
 * Pick the winning activity from a scored table. Highest wins; ties
 * break by UTILITY_TIE_ORDER (first max wins). Pure, deterministic.
 */
export function chooseScoredActivity(ctx: UtilityContext): ScoredDecision {
  const scores = scoreFounderActivities(ctx);
  // Winner: first max in tie order (strict >, so the earliest of a
  // tie wins — deterministic). Runner-up: best of the rest, same
  // rule. Two clean passes; the display never names the winner as
  // its own runner-up.
  let top: ScoredActivity = UTILITY_TIE_ORDER[0];
  for (const a of UTILITY_TIE_ORDER) {
    if (scores[a] > scores[top]) top = a;
  }
  let runnerUp: ScoredActivity = UTILITY_TIE_ORDER.find((a) => a !== top) as ScoredActivity;
  for (const a of UTILITY_TIE_ORDER) {
    if (a !== top && scores[a] > scores[runnerUp]) runnerUp = a;
  }
  const terms = workTermsFor(ctx);
  return { activity: top, scores, top, runnerUp, topScore: scores[top], runnerUpScore: scores[runnerUp], workKind: terms.workKind, chopWork: terms.chopWork };
}

/** Manhattan distance between two tiles (the scorer's distance). */
export function founderTileDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Distance from a founder's position to the build site. BUILD
 *  1066: with a construction state, the nearest UNFINISHED site's
 *  approach tile (the site the founder would actually build); with
 *  no construction (the sim's old callers), the first hut's
 *  approach — the old behaviour. When every site is done there is
 *  nothing to build, so the distance is far (the build score is 0
 *  then anyway, gated on the construction being pending). */
export function founderDistToSite(pos: { x: number; y: number }, construction?: ConstructionState): number {
  if (construction) {
    const site = nearestUnfinishedSite(construction, pos);
    if (site) return founderTileDist(pos, site.approach);
    return 999;
  }
  return founderTileDist(pos, HUT_APPROACH);
}
